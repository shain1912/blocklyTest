import { test, expect, request as pwRequest } from '@playwright/test';

/**
 * LIVE DEMO REHEARSAL — honest vocabulary edition.
 *
 * Replaces the earlier rehearsal which showed off blocks that didn't
 * actually exist in the toolbox (py_stmt / py_call materializing from
 * Python→Blocks transpile). Three contracts every Act must satisfy:
 *
 *   (V) Vocabulary — every block in the workspace is reachable from the
 *       toolbox. Escape-hatch blocks (py_stmt, py_call, raw_python, py_binop)
 *       count as valid because they ARE in the toolbox now (under the
 *       "🐍 Python (escape)" category) — but we publish their count so the
 *       presenter can say honestly "N statements fell through to escape-hatch".
 *
 *   (S) Stability — round-tripping multiple times reaches a fixed point.
 *       Lossless path (no edits): byte-identical with user's input.
 *       Regen path (after a touch): byte-identical from the FIRST regen
 *       onward (Blockly normalizes formatting once, then stable).
 *
 *   (R) Reproducibility — every escape-hatch block in the workspace can be
 *       dragged in fresh from the toolbox by the audience. No ghosts.
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
  await page.waitForFunction(() => typeof window.__introspect === 'function');
  await page.evaluate(() => window.__resetWorkspace());
};

const seedPython = async (page, py) => {
  await page.evaluate(() => window.__setMode('python'));
  await page.waitForFunction(() => window.__getMode() === 'python');
  await page.evaluate((p) => window.__setPython(p), py);
  await page.waitForFunction((expected) => window.__getPython() === expected, py);
};

const toggle = async (page, target) => {
  await page.evaluate((t) => window.__setMode(t), target);
  await page.waitForFunction((t) => window.__getMode() === t, target);
  await page.waitForTimeout(target === 'blocks' ? 700 : 150);
};

const audit = async (page) => page.evaluate(() => {
  const ws = window.__blocklyWorkspace;
  const all = ws.getAllBlocks(false).map(b => b.type);
  const toolbox = new Set(window.__getToolboxBlockTypes());
  const ghosts = all.filter(t => !toolbox.has(t));
  const escape = all.filter(t => /^(py_stmt|py_call|py_attr|py_binop|raw_python)$/.test(t));
  return { count: all.length, ghosts, escape };
});

// The exact Python the presenter pastes on stage. Pinned so audience and
// rehearsal see identical text.
const ACT1_DEMO_PY = `count = 0
for i in range(3):
    sprite.move(30)
    count += 1
sprite.say('done')
`;

test.describe('🎬 Live demo rehearsal (honest)', () => {
  test('Act 1 — round-trip stability + vocabulary contract', async ({ page }) => {
    test.skip(!backendUp, 'backend offline');
    await ready(page);

    // Step 1.1 — paste Python (presenter types or pastes ACT1_DEMO_PY)
    await seedPython(page, ACT1_DEMO_PY);

    // Step 1.2 — toggle to Blocks. Show audience the workspace.
    await toggle(page, 'blocks');
    const a = await audit(page);
    expect(a.count, 'transpile must produce blocks').toBeGreaterThan(0);
    expect(a.ghosts, 'no ghost (non-toolbox) blocks — V contract').toEqual([]);
    // eslint-disable-next-line no-console
    console.log(`[Act1/V] ${a.count} blocks total, ${a.escape.length} escape-hatch (${a.escape.join(',') || 'none'})`);

    // Step 1.3 — toggle back to Python WITHOUT edit. Lossless path.
    await toggle(page, 'python');
    const pyLossless = await page.evaluate(() => window.__getPython());
    expect(pyLossless, 'lossless path returns user bytes verbatim').toBe(ACT1_DEMO_PY);

    // Step 1.4 — 3 lossless toggles, all byte-identical
    for (let i = 0; i < 3; i++) {
      await toggle(page, 'blocks');
      await toggle(page, 'python');
      expect(await page.evaluate(() => window.__getPython()), `lossless iter ${i + 2}`).toBe(ACT1_DEMO_PY);
    }

    // Step 1.5 — once user touches blocks, we leave lossless; subsequent
    // regen iterations must stabilize on the SAME normalized form.
    await toggle(page, 'blocks');
    await page.evaluate(() => {
      const t = window.__blocklyWorkspace.getTopBlocks(false)[0];
      if (t) t.moveBy(1, 0);
    });
    await page.waitForTimeout(120);
    await toggle(page, 'python');
    const pyNorm = await page.evaluate(() => window.__getPython());
    // eslint-disable-next-line no-console
    console.log(`[Act1/S regen] (${pyNorm.length} chars)\n${pyNorm}---`);
    for (let i = 0; i < 2; i++) {
      await toggle(page, 'blocks');
      await page.evaluate(() => {
        const t = window.__blocklyWorkspace.getTopBlocks(false)[0];
        if (t) t.moveBy(1, 0);
      });
      await page.waitForTimeout(120);
      await toggle(page, 'python');
      expect(await page.evaluate(() => window.__getPython()), `regen iter ${i + 2}`).toBe(pyNorm);
    }
  });

  test('Act 2 — import → real callable blocks (cv2)', async ({ page }) => {
    await ready(page);

    // Step 2.1 — drop only the import block
    await page.evaluate(() => window.__loadBlockly({
      blocks: { languageVersion: 0, blocks: [{
        type: 'structure_import', x: 40, y: 40, fields: { LIBRARY: 'cv2' },
      }] },
    }));

    // Step 2.2 — bridge installs opencv-blocks
    await page.waitForFunction(
      () => window.__getInstalledLibraries().some(p => p.name === 'opencv-blocks'),
      { timeout: 3000 }
    );
    expect(await page.evaluate(() => window.__hasPyGen('cv2_imshow'))).toBe(true);

    // Step 2.3 — build a tiny program with the bridged block
    await page.evaluate(() => window.__loadBlockly({
      blocks: { languageVersion: 0, blocks: [
        { type: 'structure_import', x: 40, y: 20, fields: { LIBRARY: 'cv2' } },
        { type: 'cv2_imshow',       x: 40, y: 80,
          fields: { WINDOW: 'preview', IMAGE: 'frame' } },
      ] },
    }));
    await page.waitForTimeout(200);

    // Vocabulary audit — bridged blocks ARE in the toolbox (added dynamically
    // by buildLibraryToolboxCategories after install).
    const a = await audit(page);
    expect(a.ghosts, 'no ghost blocks — V contract').toEqual([]);

    // Step 2.4 — Python output shows clean import + call
    await toggle(page, 'python');
    const py = await page.evaluate(() => window.__getPython());
    expect(py).toMatch(/import cv2/);
    expect(py).toMatch(/cv2\.imshow/);
  });

  test('Act 3 — 500 cv2 callables → 8 semantic blocks (live introspection)', async ({ page }) => {
    test.skip(!backendUp, 'backend offline');
    await ready(page);

    // Step 3.1 — backend introspect cv2
    const intro = await page.evaluate(() => window.__introspect('cv2', { maxItems: 500 }));
    expect(intro.ok).toBe(true);
    const rawCount = intro.items.length;
    expect(rawCount).toBeGreaterThanOrEqual(100);

    // Step 3.2 — cluster & install
    const out = await page.evaluate(
      (items) => window.__installSemantic('cv2', items, { maxBlocks: 8 }),
      intro.items
    );
    expect(out.ok).toBe(true);
    expect(out.stats.semanticCount).toBeLessThanOrEqual(8);
    // eslint-disable-next-line no-console
    console.log(
      `[Act3] cv2: ${rawCount} raw → ${out.stats.semanticCount} semantic ` +
      `(compression ${(out.stats.semanticCount / rawCount).toFixed(3)}, ` +
      `~${Math.round(rawCount / out.stats.semanticCount)}× reduction)`
    );

    // Step 3.3 — drop a semantic block; vocabulary audit; Python emits cv2.
    const blockType = await page.evaluate(
      (items) => window.__cluster(items, { maxBlocks: 8 }).blocks[0].type,
      intro.items
    );
    await page.evaluate((bt) => window.__loadBlockly({
      blocks: { languageVersion: 0, blocks: [{ type: bt, x: 40, y: 40 }] },
    }), blockType);
    await page.waitForTimeout(200);

    const a = await audit(page);
    expect(a.ghosts, 'semantic block must be in toolbox after install').toEqual([]);

    await toggle(page, 'python');
    const py = await page.evaluate(() => window.__getPython());
    expect(py).toMatch(/^cv2\./m);
  });
});
