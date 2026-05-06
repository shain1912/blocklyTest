import { test, expect, request as pwRequest } from '@playwright/test';

// Phase 4 — semantic abstraction validated against the LIVE backend.
// This spec hits /introspect for real cv2 and asserts the clustering pass
// shrinks an actual command-explosion library down to a paper-friendly
// number of blocks. Skipped if the backend is offline.

const BACKEND = 'http://127.0.0.1:8000';

test.beforeAll(async () => {
  const ctx = await pwRequest.newContext();
  try {
    const r = await ctx.get(`${BACKEND}/health`);
    if (!r.ok()) test.skip(true, 'backend offline — start with ./start.sh');
  } catch {
    test.skip(true, 'backend offline — start with ./start.sh');
  } finally {
    await ctx.dispose();
  }
});

const ready = async (page) => {
  await page.goto('/?test=1');
  await page.waitForFunction(() => typeof window.__cluster === 'function');
  await page.evaluate(() => {
    try { localStorage.removeItem('blockly-libraries'); } catch {}
    window.__resetWorkspace();
  });
  await page.goto('/?test=1');
  await page.waitForFunction(() => typeof window.__introspect === 'function');
  await page.evaluate(() => window.__resetWorkspace());
};

test.describe('Phase 4 — Real-library semantic clustering (cv2)', () => {
  test('CR1: real cv2 introspection produces 100+ raw callables, clusters to ≤8', async ({ page }) => {
    await ready(page);

    const intro = await page.evaluate(
      () => window.__introspect('cv2', { maxItems: 500 })
    );
    expect(intro.ok, intro.error).toBe(true);
    expect(intro.items.length).toBeGreaterThanOrEqual(100);

    const clustered = await page.evaluate(
      (items) => window.__cluster(items, { maxBlocks: 8 }),
      intro.items
    );
    expect(clustered.blocks.length).toBeLessThanOrEqual(8);
    expect(clustered.blocks.length).toBeGreaterThan(0);

    // The compression story for the paper
    // eslint-disable-next-line no-console
    console.log(
      `[paper-stat] cv2: raw=${intro.items.length} → semantic=${clustered.blocks.length} ` +
      `(compression ${(clustered.blocks.length / intro.items.length).toFixed(3)})`
    );
  });

  test('CR2: install-and-use cycle — real cv2 cluster, generated python references cv2.X', async ({ page }) => {
    await ready(page);

    const intro = await page.evaluate(() => window.__introspect('cv2', { maxItems: 200 }));
    expect(intro.ok).toBe(true);
    const out = await page.evaluate(
      (items) => window.__installSemantic('cv2', items, { maxBlocks: 8 }),
      intro.items
    );
    expect(out.ok).toBe(true);
    expect(out.stats.semanticCount).toBeLessThanOrEqual(8);

    // Pick the first semantic block type and drop it
    const blockType = await page.evaluate(
      (items) => {
        const c = window.__cluster(items, { maxBlocks: 8 });
        return c.blocks[0]?.type;
      },
      intro.items
    );
    expect(blockType).toMatch(/^sem_/);

    await page.evaluate((bt) => window.__loadBlockly({
      blocks: { languageVersion: 0, blocks: [{ type: bt, x: 40, y: 40 }] },
    }), blockType);
    await page.waitForTimeout(200);

    await page.evaluate(() => window.__setMode('python'));
    await page.waitForFunction(() => window.__getMode() === 'python');
    await page.waitForTimeout(200);

    const py = await page.evaluate(() => window.__getPython());
    expect(py).toMatch(/^cv2\./m);
  });
});
