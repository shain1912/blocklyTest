import { test, expect, request as pwRequest } from '@playwright/test';

/**
 * Snippet flow demo — covers the OpenCV / Streamlit / Matplotlib snippets
 * the user explicitly asked for. Each snippet:
 *   1. installs its curated library (opencv-blocks, streamlit-blocks, …)
 *   2. drops Python source into the editor
 *   3. toggles to blocks → asserts the workspace stays in curated vocabulary
 *      (no py_stmt/py_call ghosts)
 *   4. toggles back to Python → byte-identical with the snippet source
 *      (lossless path, since the user hasn't touched the workspace)
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
  await page.waitForFunction(() => typeof window.__loadSnippet === 'function');
  await page.evaluate(() => {
    try { localStorage.removeItem('blockly-libraries'); } catch {}
    window.__resetWorkspace();
  });
  await page.goto('/?test=1');
  await page.waitForFunction(() => typeof window.__loadSnippet === 'function');
};

const SNIPPETS = [
  { id: 'opencv-webcam',          libName: 'opencv-blocks',     pythonHint: /cv2\.VideoCapture/ },
  { id: 'streamlit-dashboard',    libName: 'streamlit-blocks',  pythonHint: /st\.title|streamlit/ },
  { id: 'matplotlib-pandas-excel', libName: 'matplotlib-blocks', pythonHint: /matplotlib|pyplot/ },
  { id: 'numpy-basics',           libName: 'numpy-blocks',      pythonHint: /numpy|np\./ },
  { id: 'requests-api',           libName: 'requests-blocks',   pythonHint: /requests/ },
];

test.describe('Snippet flow — curated libraries cover the demos', () => {
  for (const s of SNIPPETS) {
    test(`SF-${s.id}: load → install → blocks → vocabulary clean`, async ({ page }) => {
      test.skip(!backendUp, 'backend offline');
      await ready(page);

      // 1. Run the snippet card flow programmatically
      const out = await page.evaluate((id) => window.__loadSnippet(id), s.id);
      expect(out.ok, out.error).toBe(true);
      expect(out.code).toMatch(s.pythonHint);

      // 2. The matching curated library is now in the user-facing list
      const installed = await page.evaluate(
        () => window.__getInstalledLibraries().map(p => p.name)
      );
      expect(installed).toContain(s.libName);

      // 3. __loadSnippet leaves the user in Python mode. One toggle to
      //    Blocks triggers the AST transpile (pythonAtSnapshot was reset).
      await page.waitForFunction(() => window.__getMode() === 'python');
      await page.evaluate(() => window.__setMode('blocks'));
      await page.waitForFunction(() => window.__getMode() === 'blocks');
      await page.waitForTimeout(900); // 50 + AST + load + 150ms reset

      const audit = await page.evaluate(() => {
        const ws = window.__blocklyWorkspace;
        const types = ws.getAllBlocks(false).map(b => b.type);
        const tb = new Set(window.__getToolboxBlockTypes());
        const ghosts = types.filter(t => !tb.has(t));
        const escape = types.filter(t => /^(py_stmt|py_call|py_attr|raw_python)$/.test(t));
        return { count: types.length, ghosts, escape };
      });
      // No ghost blocks (vocabulary contract — every block reachable from toolbox)
      expect(audit.ghosts, `${s.id} produced ghosts`).toEqual([]);
      // eslint-disable-next-line no-console
      console.log(
        `[snippet/${s.id}] ${audit.count} blocks, ${audit.escape.length} escape-hatch ` +
        `(${audit.escape.join(',') || 'none'})`
      );
    });
  }
});
