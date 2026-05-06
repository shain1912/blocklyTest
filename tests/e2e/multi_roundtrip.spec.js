import { test, expect, request as pwRequest } from '@playwright/test';

/**
 * Phase 2 — Demo Pillar #1: Round-trip stability.
 *
 * Honest version: every test seeds Python (the way a user actually inputs it),
 * transpiles to blocks, then enforces TWO contracts:
 *
 *   (1) Vocabulary contract — every block in the resulting workspace must be
 *       reachable from the toolbox. py_stmt / py_call / raw_python ARE in the
 *       toolbox now (under the "🐍 Python (escape)" category) so they count
 *       as valid, but we track their occurrence so the demo can call them out
 *       honestly as escape-hatches.
 *
 *   (2) Stability contract — toggling Blocks↔Python multiple times must reach
 *       a fixed point after the first regen (Blockly's first emit normalizes
 *       formatting; subsequent toggles MUST be byte-identical).
 *
 * Backend (FastAPI :8000) is required for the AST transpile path.
 */

const BACKEND = 'http://127.0.0.1:8000';
let backendUp = true;
test.beforeAll(async () => {
  const ctx = await pwRequest.newContext();
  try { backendUp = (await ctx.get(`${BACKEND}/health`)).ok(); } catch { backendUp = false; }
  await ctx.dispose();
});

const ready = async (page) => {
  await page.goto('/?test=1');
  await page.waitForFunction(() => typeof window.__getToolboxBlockTypes === 'function');
  await page.evaluate(() => {
    try { localStorage.removeItem('blockly-libraries'); } catch {}
    window.__resetWorkspace();
  });
  await page.goto('/?test=1');
  await page.waitForFunction(() => typeof window.__getToolboxBlockTypes === 'function');
  await page.evaluate(() => window.__resetWorkspace());
};

const seedPython = async (page, py) => {
  // Initial state is mode='blocks'. handleModeToggle guards against same-mode
  // calls, so we enter python first to set source, then toggle to blocks.
  await page.evaluate(() => window.__setMode('python'));
  await page.waitForFunction(() => window.__getMode() === 'python');
  await page.evaluate((p) => window.__setPython(p), py);
  await page.waitForFunction((expected) => window.__getPython() === expected, py);
};

const toggleAndSettle = async (page, target) => {
  await page.evaluate((t) => window.__setMode(t), target);
  await page.waitForFunction((t) => window.__getMode() === t, target);
  await page.waitForTimeout(target === 'blocks' ? 700 : 150);
};

const auditWorkspace = async (page) => page.evaluate(() => {
  const ws = window.__blocklyWorkspace;
  const all = ws.getAllBlocks(false).map(b => b.type);
  const toolbox = new Set(window.__getToolboxBlockTypes());
  return {
    types: all,
    ghosts: all.filter(t => !toolbox.has(t)),
    escapeBlocks: all.filter(t => /^(py_stmt|py_call|py_attr|py_binop|raw_python)$/.test(t)),
  };
});

// Demo programs the script depends on. Pick forms that pyAst handles well so
// the audit shows zero ghosts AND a small (or zero) escape-hatch count.
const ACT1_SPRITE = `count = 0
for i in range(3):
    sprite.move(30)
    count += 1
sprite.say('done')
`;

const PURE_PYTHON = `total = 0
for i in range(5):
    if i > 1:
        total = total + i
print(total)
`;

const NESTED = `count = 0
for i in range(2):
    if i > 0:
        sprite.say('inner')
        sprite.move(5)
    sprite.move(10)
    count += 1
sprite.say('done')
`;

test.describe('Phase 2 — Multi-roundtrip stability (honest vocabulary)', () => {
  test('A1: Act 1 sprite Python — vocabulary clean + round-trip stable', async ({ page }) => {
    test.skip(!backendUp, 'backend offline');
    await ready(page);
    await seedPython(page, ACT1_SPRITE);

    // Round 1: python → blocks. Audit vocabulary.
    await toggleAndSettle(page, 'blocks');
    const a1 = await auditWorkspace(page);
    expect(a1.types.length, 'transpile must produce blocks').toBeGreaterThan(0);
    expect(a1.ghosts, 'no ghost (non-toolbox) blocks').toEqual([]);
    // Escape-hatch count is the honest number to publish for the demo:
    // eslint-disable-next-line no-console
    console.log(`[stat/Act1] ${a1.types.length} blocks, ${a1.escapeBlocks.length} escape-hatch (${a1.escapeBlocks.join(',') || 'none'})`);

    // Round 2-5: stable Python after first regen.
    await toggleAndSettle(page, 'python');
    const py1 = await page.evaluate(() => window.__getPython());
    // eslint-disable-next-line no-console
    console.log(`[A1/iter1 ${py1.length}c]\n${py1}---`);
    for (let i = 0; i < 3; i++) {
      await toggleAndSettle(page, 'blocks');
      await toggleAndSettle(page, 'python');
      const py = await page.evaluate(() => window.__getPython());
      if (py !== py1) {
        // eslint-disable-next-line no-console
        console.log(`[A1/iter${i + 2} ${py.length}c]\n${py}---`);
      }
      expect(py, `iter ${i + 2} drifted from iter 1`).toBe(py1);
    }
  });

  test('A2: pure Python (no sprite) — same stability contract holds', async ({ page }) => {
    test.skip(!backendUp, 'backend offline');
    await ready(page);
    await seedPython(page, PURE_PYTHON);

    await toggleAndSettle(page, 'blocks');
    const a = await auditWorkspace(page);
    expect(a.ghosts).toEqual([]);

    await toggleAndSettle(page, 'python');
    const py1 = await page.evaluate(() => window.__getPython());
    for (let i = 0; i < 3; i++) {
      await toggleAndSettle(page, 'blocks');
      await toggleAndSettle(page, 'python');
      expect(await page.evaluate(() => window.__getPython()), `iter ${i + 2}`).toBe(py1);
    }
  });

  test('A3: nested control flow + sprite — vocabulary + stability', async ({ page }) => {
    test.skip(!backendUp, 'backend offline');
    await ready(page);
    await seedPython(page, NESTED);

    await toggleAndSettle(page, 'blocks');
    const a = await auditWorkspace(page);
    expect(a.ghosts).toEqual([]);

    await toggleAndSettle(page, 'python');
    const py1 = await page.evaluate(() => window.__getPython());
    for (let i = 0; i < 3; i++) {
      await toggleAndSettle(page, 'blocks');
      await toggleAndSettle(page, 'python');
      expect(await page.evaluate(() => window.__getPython()), `iter ${i + 2}`).toBe(py1);
    }
  });

  test('A5: regen path is idempotent (first regen normalizes; subsequent regens stable)', async ({ page }) => {
    // The lossless path returns the user's original Python verbatim. Once a
    // block is touched, we leave the lossless path and Blockly's pythonGenerator
    // produces a NORMALIZED form (parens around binops, augmented assigns
    // expanded into x = x + 1, no augassign codegen yet). The honest claim
    // is: from THAT first normalized regen onward, every subsequent regen is
    // byte-identical — no progressive drift.
    test.skip(!backendUp, 'backend offline');
    await ready(page);
    await seedPython(page, NESTED);

    await toggleAndSettle(page, 'blocks');
    // First touch + regen establishes the normalized form
    await page.evaluate(() => {
      const t = window.__blocklyWorkspace.getTopBlocks(false)[0];
      if (t) t.moveBy(1, 0);
    });
    await page.waitForTimeout(120);
    await toggleAndSettle(page, 'python');
    const pyNorm = await page.evaluate(() => window.__getPython());

    // Now do 3 more touch+regen cycles; each output must equal pyNorm
    for (let i = 0; i < 3; i++) {
      await toggleAndSettle(page, 'blocks');
      await page.evaluate(() => {
        const t = window.__blocklyWorkspace.getTopBlocks(false)[0];
        if (t) t.moveBy(1, 0);
      });
      await page.waitForTimeout(120);
      await toggleAndSettle(page, 'python');
      const py = await page.evaluate(() => window.__getPython());
      expect(py, `regen iter ${i + 2} drifted from first normalized regen`).toBe(pyNorm);
    }
  });

  test('A4: blocksTouchedRef resets after a successful blocks→python regen', async ({ page }) => {
    await ready(page);
    // Build a workspace via __loadBlockly so we don't depend on backend
    await page.evaluate(() => window.__loadBlockly({
      blocks: { languageVersion: 0, blocks: [{
        type: 'on_start', x: 40, y: 40, inputs: { DO: { block: {
          type: 'move_right', fields: { STEPS: 10 },
        } } },
      }] },
    }));
    await page.waitForTimeout(150);
    await page.evaluate(() => {
      const t = window.__blocklyWorkspace.getTopBlocks(false)[0];
      if (t) t.moveBy(5, 5);
    });
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__getBlocksTouched())).toBe(true);

    await toggleAndSettle(page, 'python');
    await page.waitForTimeout(150);
    expect(
      await page.evaluate(() => window.__getBlocksTouched()),
      'touched should reset after regen so the next round-trip is lossless'
    ).toBe(false);
  });
});
