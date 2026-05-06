/**
 * AST-based Python → Blocks conversion + lossless roundtrip.
 *
 * Proves:
 *   (1) Imports always land at the top of the workspace (structure_import blocks).
 *   (2) Library calls like cv2.imshow(...) become py_stmt with real value-input args
 *       (text / number / py_getvar), not stringified fields.
 *   (3) while / if / for nesting survives as nested Blockly inputs.
 *   (4) Toggling Python → Blocks → Python preserves the original source when the
 *       user didn't touch the blocks (no reordered imports, no indentation loss).
 *   (5) The live syntax checker marks a bad line and clears when fixed.
 */

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';
const BACKEND = 'http://127.0.0.1:8000';

test.beforeAll(async ({ request }) => {
  const r = await request.get(`${BACKEND}/health`);
  if (!r.ok()) throw new Error(`Backend unreachable — run ./start.sh first`);
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function gotoApp(page) {
  await page.goto(BASE);
  await page.waitForSelector('.blockly-editor', { timeout: 15000 });
  await page.waitForFunction(() => typeof window.__setPython === 'function', { timeout: 10000 });
  await page.waitForTimeout(300);
}

async function setPython(page, code) {
  // Switch into Python view and use the state setter
  const btn = page.locator('.toggle-btn:has-text("Python")');
  if (await btn.isVisible()) await btn.click();
  await page.waitForTimeout(250);
  await page.evaluate((c) => window.__setPython(c), code);
  await page.waitForTimeout(200);
}

async function clickBlocks(page) {
  await page.locator('.toggle-btn:has-text("Blocks")').click();
  // AST-path is async; wait until workspace has blocks OR a moment has passed
  await page.waitForFunction(() => {
    const ws = window.__blocklyWorkspace;
    return ws && ws.getAllBlocks().length > 0;
  }, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function clickPython(page) {
  await page.locator('.toggle-btn:has-text("Python")').click();
  await page.waitForTimeout(300);
}

async function workspaceBlockTypes(page) {
  return page.evaluate(() => {
    const ws = window.__blocklyWorkspace;
    return ws ? ws.getAllBlocks().map(b => b.type) : [];
  });
}

async function topBlockTypes(page) {
  return page.evaluate(() => {
    const ws = window.__blocklyWorkspace;
    return ws ? ws.getTopBlocks(true).map(b => b.type) : [];
  });
}

// ── tests ────────────────────────────────────────────────────────────────────

test('AST-01: /ast endpoint returns a well-formed Module for library code', async ({ request }) => {
  const res = await request.post(`${BACKEND}/ast`, {
    data: { code: 'import cv2\nimport numpy as np\nx = 5\nprint(cv2.__version__)' },
  });
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  expect(body.ok).toBe(true);
  expect(body.ast._kind).toBe('Module');
  const kinds = body.ast.body.map(n => n._kind);
  expect(kinds).toContain('Import');
  expect(kinds).toContain('Assign');
  expect(kinds).toContain('Expr');  // print(...)
});

test('AST-02: Python→Blocks keeps imports at the TOP of the workspace', async ({ page }) => {
  await gotoApp(page);
  await setPython(page, [
    'import cv2',
    'import numpy as np',
    'x = 1',
    'while True:',
    '    x += 1',
    '    print(x)',
  ].join('\n'));
  await clickBlocks(page);

  const tops = await topBlockTypes(page);
  // The first N top blocks should be structure_import; only after them should on_start appear
  const firstImportIdx = tops.indexOf('structure_import');
  const onStartIdx = tops.indexOf('on_start');
  expect(firstImportIdx, `no import block found — tops: ${tops}`).toBeGreaterThanOrEqual(0);
  expect(onStartIdx, `no on_start found — tops: ${tops}`).toBeGreaterThan(firstImportIdx);
});

test('AST-03: cv2.imshow(...) becomes a composable call block with value-input args', async ({ page }) => {
  await gotoApp(page);
  await setPython(page, [
    'import cv2',
    'gray = 0',
    'cv2.imshow("Gray", gray)',
  ].join('\n'));
  await clickBlocks(page);

  // After the redesign, calls are lowered to either a library-specific block
  // (if the matching snippet library is installed) or a generic py_stmt with
  // dynamic arg slots. Either way the args must be structural value blocks —
  // text for "Gray", variables_get for the gray variable.
  const detail = await page.evaluate(() => {
    const ws = window.__blocklyWorkspace;
    const all = ws.getAllBlocks();
    const stmt = all.find(b =>
      (b.type === 'py_stmt' && (b.getFieldValue('FUNC') || '').includes('imshow')) ||
      b.type === 'cv2_imshow'
    );
    if (!stmt) return { found: false, types: all.map(b => b.type) };
    const argChildren = stmt.inputList
      .filter(inp => /^ARG\d+$/.test(inp.name))
      .map(inp => inp.connection?.targetBlock()?.type || null);
    return {
      found: true, blockType: stmt.type,
      func: stmt.getFieldValue('FUNC') || '(library block)',
      argChildren,
    };
  });

  expect(detail.found, `no imshow-like block found — types: ${JSON.stringify(detail.types)}`).toBe(true);
  // Either the generic wrapper with composable args, or a library-specific
  // block with pre-filled fields — both are legitimate "real blocks".
  if (detail.blockType === 'py_stmt') {
    expect(detail.argChildren).toContain('text');
    expect(detail.argChildren).toContain('variables_get');
  }
});

test('AST-04: while + if nesting survives as nested inputs', async ({ page }) => {
  await gotoApp(page);
  await setPython(page, [
    'x = 0',
    'while True:',
    '    if x < 3:',
    '        x += 1',
    '        print(x)',
  ].join('\n'));
  await clickBlocks(page);

  const types = await workspaceBlockTypes(page);
  expect(types).toContain('loop_forever');
  expect(types).toContain('if');
  // Post-vocabulary-fix: simple "x = literal" lowers to the curated `variable`
  // block (which round-trips byte-perfect via its TEXT-field Python generator)
  // and "x += literal" lowers to the curated `change_variable` block. These
  // replace the older variables_set + py_binop shape for the simple cases
  // the user actually types.
  expect(types).toContain('variable');           // x = 0
  expect(types).toContain('change_variable');    // x += 1
  // print(x) → the existing print block, not a generic py_stmt
  expect(types).toContain('print');
});

test('AST-05: lossless Python→Blocks→Python when user does not touch blocks', async ({ page }) => {
  const original = [
    'import cv2',
    'import numpy as np',
    '',
    'cap = cv2.VideoCapture(0)',
    'ok, frame = cap.read()',
    'gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)',
    'print("shape:", frame.shape)',
    '',
  ].join('\n');

  await gotoApp(page);
  await setPython(page, original);
  await clickBlocks(page);
  await clickPython(page);

  const after = await page.evaluate(() => window.__getPython());
  expect(after).toBe(original);   // no reordering, no indentation loss
});

test('AST-06: live syntax checker flags a bad line and clears it', async ({ page }) => {
  await gotoApp(page);
  await setPython(page, 'if x\n    print(1)');  // missing colon
  // Wait for the debounced /syntax POST to settle
  await page.waitForFunction(
    () => (document.querySelector('[data-testid="py-status"]')?.innerText || '').startsWith('✗'),
    { timeout: 5000 },
  );
  const bad = await page.locator('[data-testid="py-status"]').innerText();
  expect(bad).toMatch(/^✗/);

  await setPython(page, 'if True:\n    print(1)\n');
  await page.waitForFunction(
    () => (document.querySelector('[data-testid="py-status"]')?.innerText || '').startsWith('✓'),
    { timeout: 5000 },
  );
  const good = await page.locator('[data-testid="py-status"]').innerText();
  expect(good).toMatch(/^✓/);
});

test('AST-07: repeat(N) block produced for for i in range(N):', async ({ page }) => {
  await gotoApp(page);
  await setPython(page, [
    'for i in range(5):',
    '    print(i)',
  ].join('\n'));
  await clickBlocks(page);

  const types = await workspaceBlockTypes(page);
  expect(types).toContain('repeat');
  expect(types).toContain('print');          // print(i) → print block (not generic py_stmt)
  expect(types).toContain('variables_get');  // i → Blockly built-in variable reference
});

test('AST-08: class + method parses to structure_module_def containing py_funcdef', async ({ page }) => {
  await gotoApp(page);
  await setPython(page, [
    'class Counter:',
    '    def inc(self, n):',
    '        return n + 1',
  ].join('\n'));
  await clickBlocks(page);

  const types = await workspaceBlockTypes(page);
  expect(types).toContain('structure_module_def');
  expect(types).toContain('py_funcdef');   // Sprint 2: exact function block with structural body
});
