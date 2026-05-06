/**
 * Roundtrip Conversion E2E Tests
 * Block ↔ Python ↔ Block stability tests
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function waitForApp(page) {
  await page.waitForSelector('.blockly-editor', { timeout: 15000 });
  await page.waitForTimeout(800);
}

async function getPythonCode(page) {
  // CodeMirror-backed editor — pull from the React state via the exposed helper
  await page.waitForFunction(() => typeof window.__getPython === 'function', { timeout: 5000 });
  return page.evaluate(() => window.__getPython());
}

async function clickBlocks(page) {
  await page.click('.toggle-btn:has-text("Blocks")');
  await page.waitForTimeout(600);
}

async function clickPython(page) {
  await page.click('.toggle-btn:has-text("Python")');
  await page.waitForTimeout(400);
}

async function loadJson(page, json) {
  // Wait until the workspace helper is exposed on window
  await page.waitForFunction(() => typeof window.__loadBlockly === 'function', { timeout: 10000 });

  await page.evaluate((jsonStr) => {
    window.__loadBlockly(JSON.parse(jsonStr));
  }, JSON.stringify(json));
  await page.waitForTimeout(500);
}

// ── Block fixtures ────────────────────────────────────────────────────────────

const onStartWith = (block) => ({
  blocks: {
    blocks: [{
      kind: 'block', type: 'on_start', x: 50, y: 50,
      inputs: { DO: { block } }
    }]
  }
});

const moveBlock = (steps = 10) => ({
  kind: 'block', type: 'move_right', fields: { STEPS: steps }
});

const changeVarBlock = (name = 'score', value = '10') => ({
  kind: 'block', type: 'change_variable', fields: { VAR_NAME: name, VALUE: value }
});

const ifElseBlock = (cond = 'x > 0', doBlock, elseBlock) => ({
  kind: 'block', type: 'if_else',
  fields: { CONDITION: cond },
  inputs: {
    DO: { block: doBlock || moveBlock(10) },
    ELSE: { block: elseBlock || moveBlock(-10) }
  }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

test.describe('Block ↔ Python Roundtrip', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForApp(page);
  });

  test('RT-01: move_right snapshot roundtrip (no edit → snapshot restore)', async ({ page }) => {
    await loadJson(page, onStartWith(moveBlock(10)));

    // Blocks → Python
    await clickPython(page);
    const python1 = await getPythonCode(page);
    expect(python1).toContain('sprite.move(10)');

    // Python → Blocks (no edit → snapshot restore)
    await clickBlocks(page);

    // Blocks → Python again
    await clickPython(page);
    const python2 = await getPythonCode(page);
    expect(python2).toContain('sprite.move(10)');
    expect(python2).toBe(python1); // must be identical (snapshot restore)
  });

  test('RT-02: change_variable VALUE field survives roundtrip', async ({ page }) => {
    await loadJson(page, onStartWith(changeVarBlock('score', '5')));

    await clickPython(page);
    const python = await getPythonCode(page);
    expect(python).toContain('score += 5');

    await clickBlocks(page);

    // Verify workspace has change_variable with correct field
    const fieldValue = await page.evaluate(() => {
      const ws = window.__blocklyWorkspace;
      if (!ws) return null;
      const allBlocks = ws.getAllBlocks();
      const cvBlock = allBlocks.find(b => b.type === 'change_variable');
      return cvBlock ? cvBlock.getFieldValue('VALUE') : null;
    });
    expect(fieldValue).toBe('5');
  });

  test('RT-03: if_else roundtrip preserves structure', async ({ page }) => {
    await loadJson(page, onStartWith(ifElseBlock('x > 0', moveBlock(10), moveBlock(-10))));

    await clickPython(page);
    const python = await getPythonCode(page);
    expect(python).toContain('if x > 0:');
    expect(python).toContain('else:');
    expect(python).toContain('sprite.move(10)');
    expect(python).toContain('sprite.move(-10)');
  });

  test('RT-04: say block with comma in string', async ({ page }) => {
    const sayBlock = {
      kind: 'block', type: 'say',
      inputs: {
        TEXT: { block: { kind: 'block', type: 'text', fields: { TEXT: 'Hello, World' } } }
      }
    };
    await loadJson(page, onStartWith(sayBlock));

    await clickPython(page);
    const python = await getPythonCode(page);
    // Must preserve the comma - not split it
    expect(python).toMatch(/sprite\.say\(['"]Hello, World['"]\)/);
  });

  test('RT-05: turn_left block generates negative degrees', async ({ page }) => {
    const leftTurnBlock = {
      kind: 'block', type: 'turn_right',
      fields: { DIRECTION: 'left', DEGREES: 30 }
    };
    await loadJson(page, onStartWith(leftTurnBlock));

    await clickPython(page);
    const python = await getPythonCode(page);
    expect(python).toContain('sprite.turn(-30)');
  });

  test('RT-06: repeat (for loop) roundtrip', async ({ page }) => {
    const repeatBlock = {
      kind: 'block', type: 'repeat', fields: { TIMES: 5 },
      inputs: { DO: { block: moveBlock(20) } }
    };
    await loadJson(page, onStartWith(repeatBlock));

    await clickPython(page);
    const python = await getPythonCode(page);
    expect(python).toContain('for i in range(5):');
    expect(python).toContain('sprite.move(20)');
  });

  test('RT-07: 3 iteration stability (no edit → snapshot each time)', async ({ page }) => {
    const initial = onStartWith({
      kind: 'block', type: 'move_right', fields: { STEPS: 10 },
      next: {
        block: {
          kind: 'block', type: 'turn_right', fields: { DIRECTION: 'right', DEGREES: 15 },
          next: { block: { kind: 'block', type: 'wait', fields: { SECONDS: 1 } } }
        }
      }
    });
    await loadJson(page, initial);

    let prevPython = '';
    for (let i = 0; i < 3; i++) {
      await clickPython(page);
      const py = await getPythonCode(page);
      if (i === 0) {
        prevPython = py;
        expect(py).toContain('sprite.move(10)');
      } else {
        expect(py).toBe(prevPython); // must be identical each iteration
      }
      await clickBlocks(page);
    }
  });

  test('RT-08: Python edit → wrapRunnable wraps in on_start', async ({ page }) => {
    // Load blocks, go to Python, modify Python (triggering transpiler), go back to blocks
    await loadJson(page, onStartWith(moveBlock(10)));

    await clickPython(page);

    // Simulate user editing the Python (CodeMirror-backed) via the state setter
    await page.waitForFunction(() => typeof window.__setPython === 'function', { timeout: 5000 });
    await page.evaluate(() => window.__setPython('sprite.move(99)\nsprite.say("edited")\n'));
    await page.waitForTimeout(200);

    // Go back to blocks (should use transpiler with wrapRunnable)
    await clickBlocks(page);

    // Check that workspace now has on_start wrapping the blocks
    const hasOnStart = await page.evaluate(() => {
      const ws = window.__blocklyWorkspace;
      if (!ws) return false;
      return ws.getTopBlocks().some(b => b.type === 'on_start');
    });
    expect(hasOnStart).toBeTruthy();

    // Updated post-sprite-DSL-schemas: sprite.move / sprite.say now route to
    // the curated `move_right` / `say` blocks via librarySchemaRegistry, NOT
    // the generic py_stmt fallback. This is the right behavior — the workspace
    // stays in the curated vocabulary that the user can drag from the toolbox.
    const inner = await page.evaluate(() => {
      const ws = window.__blocklyWorkspace;
      if (!ws) return { types: [] };
      return { types: ws.getAllBlocks().map(b => b.type) };
    });
    expect(inner.types).toContain('move_right');
    expect(inner.types).toContain('say');
  });
});

// ── Direct transpiler tests (via page.evaluate dynamic import) ────────────────

test.describe('Python → Blocks (Transpiler Unit via Browser)', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForApp(page);
  });

  test('PT-01: sprite.move → move_right block', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const m = await import('/src/utils/legacy/transpiler.js');
      const r = m.pythonToBlockly('sprite.move(15)\n');
      return r.blocks.blocks[0]?.type;
    });
    expect(result).toBe('move_right');
  });

  test('PT-02: negative turn → turn_right with left direction', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const m = await import('/src/utils/legacy/transpiler.js');
      const b = m.pythonToBlockly('sprite.turn(-45)\n').blocks.blocks[0];
      return { type: b.type, dir: b.fields.DIRECTION, deg: b.fields.DEGREES };
    });
    expect(result.type).toBe('turn_right');
    expect(result.dir).toBe('left');
    expect(result.deg).toBe('45');
  });

  test('PT-03: change_variable uses VALUE field (not CHANGE)', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const m = await import('/src/utils/legacy/transpiler.js');
      const b = m.pythonToBlockly('score += 5\n').blocks.blocks[0];
      return { type: b.type, name: b.fields.VAR_NAME, val: b.fields.VALUE, old: b.fields.CHANGE };
    });
    expect(result.type).toBe('change_variable');
    expect(result.name).toBe('score');
    expect(result.val).toBe('5');
    expect(result.old).toBeUndefined();
  });

  test('PT-04: say with comma in string parses correctly', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const m = await import('/src/utils/legacy/transpiler.js');
      const b = m.pythonToBlockly('sprite.say("Hello, World")\n').blocks.blocks[0];
      return { type: b.type, text: b.inputs?.TEXT?.block?.fields?.TEXT };
    });
    expect(result.type).toBe('say');
    expect(result.text).toBe('Hello, World');
  });

  test('PT-05: if_else block structure', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const m = await import('/src/utils/legacy/transpiler.js');
      const code = 'if x > 0:\n    sprite.move(10)\nelse:\n    sprite.move(-10)\n';
      const b = m.pythonToBlockly(code).blocks.blocks[0];
      return { type: b.type, cond: b.fields.CONDITION, doT: b.inputs?.DO?.block?.type, elseT: b.inputs?.ELSE?.block?.type };
    });
    expect(result.type).toBe('if_else');
    expect(result.cond).toBe('x > 0');
    expect(result.doT).toBe('move_right');
    expect(result.elseT).toBe('move_right');
  });

  test('PT-06: nested loop structure', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const m = await import('/src/utils/legacy/transpiler.js');
      const code = 'for i in range(3):\n    while True:\n        sprite.move(5)\n';
      const b = m.pythonToBlockly(code).blocks.blocks[0];
      return {
        type: b.type,
        inner: b.inputs?.DO?.block?.type,
        deep: b.inputs?.DO?.block?.inputs?.DO?.block?.type,
      };
    });
    expect(result.type).toBe('repeat');
    expect(result.inner).toBe('loop_forever');
    expect(result.deep).toBe('move_right');
  });

  test('PT-07: wrapRunnable wraps top-level code in on_start', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const m = await import('/src/utils/legacy/transpiler.js');
      const r = m.pythonToBlockly('sprite.move(10)\nsprite.say("hi")\n', { wrapRunnable: true });
      return {
        topTypes: r.blocks.blocks.map(b => b.type),
        inner: r.blocks.blocks[0]?.inputs?.DO?.block?.type,
      };
    });
    expect(result.topTypes).toContain('on_start');
    expect(result.inner).toBe('move_right');
  });

  test('PT-08: AST pythonToAst round-trips via astToPython', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const m = await import('/src/utils/legacy/ast.js');
      const code = 'sprite.move(10)\n';
      const ast = m.pythonToAst(code);
      const out = m.astToPython(ast);
      return { astKind: ast.kind, bodyKind: ast.body[0]?.kind, out };
    });
    expect(result.astKind).toBe('Program');
    expect(result.bodyKind).toBe('SpriteCall');
    expect(result.out).toContain('sprite.move(10)');
  });
});
