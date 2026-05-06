import { test, expect, request as pwRequest } from '@playwright/test';

/**
 * Abstraction comparison — proves the semantic clustering scales across
 * arbitrary Python libraries, not just the curated 6. For each module:
 *   - Live introspect via the backend (NO curated schemas, NO LLM)
 *   - Cluster with the deterministic prefix-grouping pass
 *   - Publish raw_count → semantic_count and the compression ratio
 *
 * Picks stdlib modules so this works on any backend without extra pip installs.
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
  await page.waitForFunction(() => typeof window.__introspect === 'function');
  await page.evaluate(() => {
    try { localStorage.removeItem('blockly-libraries'); } catch {}
    window.__resetWorkspace();
  });
  await page.goto('/?test=1');
  await page.waitForFunction(() => typeof window.__introspect === 'function');
};

const TARGETS = [
  { module: 'socket',         expectedRaw: 30,  label: 'socket (low-level networking)' },
  { module: 'urllib.request', expectedRaw: 20,  label: 'urllib.request (HTTP client)' },
  { module: 'http.client',    expectedRaw: 10,  label: 'http.client (HTTP primitives)' },
  { module: 'subprocess',     expectedRaw: 5,   label: 'subprocess (process spawn)' },
  { module: 'argparse',       expectedRaw: 5,   label: 'argparse (CLI parser)' },
];

test.describe('Abstraction quality across uncurated stdlib', () => {
  for (const t of TARGETS) {
    test(`AC-${t.module}: ${t.label} clusters to ≤8 semantic blocks`, async ({ page }) => {
      test.skip(!backendUp, 'backend offline — start with ./start.sh');
      await ready(page);

      const intro = await page.evaluate(
        (mod) => window.__introspect(mod, { maxItems: 500 }),
        t.module
      );
      expect(intro.ok, intro.error).toBe(true);
      expect(intro.items.length).toBeGreaterThanOrEqual(t.expectedRaw);

      const clustered = await page.evaluate(
        (items) => window.__cluster(items, { maxBlocks: 8 }),
        intro.items
      );
      expect(clustered.blocks.length).toBeLessThanOrEqual(8);
      expect(clustered.blocks.length).toBeGreaterThan(0);

      const raw = intro.items.length;
      const sem = clustered.blocks.length;
      const ratio = (sem / raw).toFixed(3);
      const compress = Math.round(raw / sem);
      // eslint-disable-next-line no-console
      console.log(
        `[abstraction] ${t.module.padEnd(20)} ${String(raw).padStart(4)} raw → ` +
        `${sem} semantic  (compression ${ratio}, ~${compress}× reduction)`
      );
    });
  }

  test('AC-summary: aggregate compression-curve table', async ({ page }) => {
    test.skip(!backendUp, 'backend offline');
    await ready(page);

    const rows = [];
    for (const t of TARGETS) {
      const intro = await page.evaluate((m) => window.__introspect(m, { maxItems: 500 }), t.module);
      if (!intro.ok) continue;
      const clustered = await page.evaluate(
        (items) => window.__cluster(items, { maxBlocks: 8 }),
        intro.items
      );
      rows.push({
        module: t.module,
        raw: intro.items.length,
        semantic: clustered.blocks.length,
        ratio: clustered.blocks.length / intro.items.length,
      });
    }
    rows.sort((a, b) => b.raw - a.raw);

    // eslint-disable-next-line no-console
    console.log('\n=== Compression curve (paper Table 1 candidate) ===');
    // eslint-disable-next-line no-console
    console.log('module                raw    semantic   ratio   reduction');
    for (const r of rows) {
      // eslint-disable-next-line no-console
      console.log(
        `${r.module.padEnd(22)}${String(r.raw).padStart(4)}` +
        `${String(r.semantic).padStart(11)}` +
        `   ${r.ratio.toFixed(3)}` +
        `    ${Math.round(r.raw / r.semantic)}×`
      );
    }
    expect(rows.length).toBeGreaterThan(0);
  });
});
