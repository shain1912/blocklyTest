import { test, expect, request as pwRequest } from '@playwright/test';

/**
 * DIAGNOSTIC spec — not a passing-required test. Surfaces:
 *   (1) which curated Python forms degrade to py_call/py_attr/raw_python
 *       when run through Python→Blocks
 *   (2) which Python forms break indentation across N round-trips
 *
 * Output is logged to console so we can rebuild the demo from honest
 * vocabulary. Tests in this file are designed to FAIL noisily so we see
 * the ghost blocks.
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

const transpileToBlocks = async (page, py) => {
  // Initial state is mode=blocks. handleModeToggle guards against same-mode
  // calls, so we must enter python first to set the source, then toggle to
  // blocks to trigger the transpile.
  await page.evaluate(() => window.__setMode('python'));
  await page.waitForFunction(() => window.__getMode() === 'python');
  await page.evaluate((p) => window.__setPython(p), py);
  await page.waitForFunction((expected) => window.__getPython() === expected, py);

  await page.evaluate(() => window.__setMode('blocks'));
  await page.waitForFunction(() => window.__getMode() === 'blocks');
  await page.waitForTimeout(700); // 50ms+AST+load+150ms reset

  return await page.evaluate(() => {
    const ws = window.__blocklyWorkspace;
    const all = ws.getAllBlocks(false).map(b => b.type);
    const top = ws.getTopBlocks(false).map(b => b.type);
    const toolbox = new Set(window.__getToolboxBlockTypes());
    const ghosts = all.filter(t => !toolbox.has(t));
    return {
      total: all.length,
      top,
      types: all,
      toolboxSize: toolbox.size,
      ghosts,
      uniqueGhosts: [...new Set(ghosts)],
    };
  });
};

// ── Demo Python snippets we need to validate ──────────────────────────────

const ACT1_CANONICAL = `count = 0
for i in range(3):
    sprite.move(30)
    count += 1
sprite.say('done')
`;

const ACT2_CV2 = `import cv2
cv2.imshow('preview', frame)
`;

const SPRITE_HEAVY = `sprite.set_x(10)
sprite.set_y(20)
sprite.set_size(150)
stage.switch_backdrop('blue-sky')
sprite.switch_costume('dog')
sprite.glide(1, 100, 100)
sprite.say('hello', 2)
`;

const TIME_IMPORT = `import time
sprite.say('hi')
time.sleep(0.5)
sprite.move(10)
`;

test.describe('🔬 Vocabulary diagnosis', () => {
  test('D1: print toolbox vocabulary size', async ({ page }) => {
    await ready(page);
    const types = await page.evaluate(() => window.__getToolboxBlockTypes());
    // eslint-disable-next-line no-console
    console.log(`[diag] toolbox has ${types.length} block types`);
    // eslint-disable-next-line no-console
    console.log('[diag] toolbox sample:', types.slice(0, 30).join(', '));
    expect(types.length).toBeGreaterThan(20);
  });

  test('D2: Act 1 canonical Python — ghost blocks?', async ({ page }) => {
    test.skip(!backendUp, 'backend offline');
    await ready(page);
    const r = await transpileToBlocks(page, ACT1_CANONICAL);
    // eslint-disable-next-line no-console
    console.log('[diag/Act1]', JSON.stringify(r, null, 2));
    expect(r.uniqueGhosts, 'Act 1 should produce no ghost blocks').toEqual([]);
  });

  test('D3: Act 2 cv2 import — ghost blocks?', async ({ page }) => {
    test.skip(!backendUp, 'backend offline');
    await ready(page);
    const r = await transpileToBlocks(page, ACT2_CV2);
    // eslint-disable-next-line no-console
    console.log('[diag/Act2]', JSON.stringify(r, null, 2));
    expect(r.uniqueGhosts, 'Act 2 should produce no ghost blocks').toEqual([]);
  });

  test('D4: sprite-heavy program — which calls degrade to py_call?', async ({ page }) => {
    test.skip(!backendUp, 'backend offline');
    await ready(page);
    const r = await transpileToBlocks(page, SPRITE_HEAVY);
    // eslint-disable-next-line no-console
    console.log('[diag/SpriteHeavy]', JSON.stringify(r, null, 2));
    expect(r.uniqueGhosts).toEqual([]);
  });

  test('D5: time import + mixed — ghost blocks?', async ({ page }) => {
    test.skip(!backendUp, 'backend offline');
    await ready(page);
    const r = await transpileToBlocks(page, TIME_IMPORT);
    // eslint-disable-next-line no-console
    console.log('[diag/TimeImport]', JSON.stringify(r, null, 2));
    expect(r.uniqueGhosts).toEqual([]);
  });

  test('D6a: indentation drift on REGEN path (force touched between toggles)', async ({ page }) => {
    test.skip(!backendUp, 'backend offline');
    await ready(page);
    const NESTED = `count = 0
for i in range(2):
    if i > 0:
        sprite.say('inner')
        sprite.move(5)
    sprite.move(10)
    count += 1
sprite.say('done')
`;
    await page.evaluate(() => window.__setMode('python'));
    await page.waitForFunction(() => window.__getMode() === 'python');
    await page.evaluate((p) => window.__setPython(p), NESTED);
    await page.waitForFunction((expected) => window.__getPython() === expected, NESTED);

    const snapshots = [{ iter: 0, py: NESTED }];
    for (let i = 1; i <= 4; i++) {
      // python → blocks (transpile)
      await page.evaluate(() => window.__setMode('blocks'));
      await page.waitForFunction(() => window.__getMode() === 'blocks');
      await page.waitForTimeout(700);
      // FORCE the regen path by nudging a top block (marks touched=true)
      await page.evaluate(() => {
        const ws = window.__blocklyWorkspace;
        const top = ws.getTopBlocks(false)[0];
        if (top) top.moveBy(1, 0);
      });
      await page.waitForTimeout(150);
      // blocks → python (regenerate from workspace, NOT lossless)
      await page.evaluate(() => window.__setMode('python'));
      await page.waitForFunction(() => window.__getMode() === 'python');
      await page.waitForTimeout(150);
      snapshots.push({ iter: i, py: await page.evaluate(() => window.__getPython()) });
    }
    // eslint-disable-next-line no-console
    for (const s of snapshots) {
      console.log(`\n[diag/RT-regen iter=${s.iter}] (${s.py.length} chars)\n${'-'.repeat(40)}\n${s.py}${'-'.repeat(40)}`);
    }

    // Pin the failure: each iteration after the first regen should match iter 1
    for (let i = 2; i < snapshots.length; i++) {
      expect(snapshots[i].py.length, `iter ${i} length differs from iter 1`).toBe(snapshots[1].py.length);
      expect(snapshots[i].py, `iter ${i} bytes differ from iter 1`).toBe(snapshots[1].py);
    }
  });

  test('D6: indentation drift — round-trip Act 1 Python 3 times', async ({ page }) => {
    test.skip(!backendUp, 'backend offline');
    await ready(page);
    // Move to python mode first so __setPython "sticks" before any toggle.
    await page.evaluate(() => window.__setMode('python'));
    await page.waitForFunction(() => window.__getMode() === 'python');
    await page.evaluate((p) => window.__setPython(p), ACT1_CANONICAL);
    await page.waitForFunction((expected) => window.__getPython() === expected, ACT1_CANONICAL);

    const snapshots = [];
    snapshots.push({ iter: 0, py: await page.evaluate(() => window.__getPython()) });

    for (let i = 1; i <= 3; i++) {
      await page.evaluate(() => window.__setMode('blocks'));
      await page.waitForFunction(() => window.__getMode() === 'blocks');
      await page.waitForTimeout(700);
      await page.evaluate(() => window.__setMode('python'));
      await page.waitForFunction(() => window.__getMode() === 'python');
      await page.waitForTimeout(150);
      snapshots.push({ iter: i, py: await page.evaluate(() => window.__getPython()) });
    }

    // eslint-disable-next-line no-console
    for (const s of snapshots) {
      console.log(`\n[diag/RT iter=${s.iter}] (${s.py.length} chars)\n${'-'.repeat(40)}\n${s.py}${'-'.repeat(40)}`);
    }

    // assert: every iteration's python equals iter 1's python (after first regen)
    for (let i = 2; i < snapshots.length; i++) {
      expect(snapshots[i].py, `iter ${i} diverged from iter 1`).toBe(snapshots[1].py);
    }
  });
});
