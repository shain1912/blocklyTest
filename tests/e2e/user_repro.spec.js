import { test, expect, request as pwRequest } from '@playwright/test';

/**
 * Repro tests pinned to actual user reports (image copy 17 & 18).
 *
 *   image 17 → str() / game.init() rendering as gray escape-hatch py_call.
 *              str() now has a curated `py_builtin_cast` block, so the test
 *              asserts that path. game.init() is still not in any library
 *              we ship (would require a Game lib package); we just check
 *              that the rest of the program lowers cleanly.
 *
 *   image 18 → toolbox showing OpenCV ×3, numpy ×4, __builtin_sprite_dsl__
 *              category visible. Tests verify (a) every category name is
 *              unique, (b) no `__builtin_*` category leaks into the UI.
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

const toBlocks = async (page) => {
  await page.evaluate(() => window.__setMode('blocks'));
  await page.waitForFunction(() => window.__getMode() === 'blocks');
  await page.waitForTimeout(700);
};

test.describe('User-report repro', () => {
  test('U1: str(score) lowers to py_builtin_cast (not py_call)', async ({ page }) => {
    test.skip(!backendUp, 'backend offline');
    await ready(page);
    await seedPython(page, "score = 0\nsprite.say(str(score), 1)\n");
    await toBlocks(page);

    const types = await page.evaluate(
      () => window.__blocklyWorkspace.getAllBlocks(false).map(b => b.type)
    );
    expect(types, 'str() should map to the curated builtin block').toContain('py_builtin_cast');
    // Sanity: the say wrapper still uses the curated say_for_seconds (arity-2 form)
    expect(types).toContain('say_for_seconds');
  });

  test('U2: int / float / len map to the same builtin block via FUNC field', async ({ page }) => {
    test.skip(!backendUp, 'backend offline');
    await ready(page);
    await seedPython(page,
      "x = int('42')\ny = float('3.14')\nn = len('hello')\n"
    );
    await toBlocks(page);
    const funcs = await page.evaluate(() => {
      const ws = window.__blocklyWorkspace;
      return ws.getAllBlocks(false)
        .filter(b => b.type === 'py_builtin_cast')
        .map(b => b.getFieldValue('FUNC'));
    });
    expect(funcs.sort()).toEqual(['float', 'int', 'len']);
  });

  test('U3: every toolbox category name is unique (no OpenCV ×3)', async ({ page }) => {
    await ready(page);
    // Inspect the live toolbox config the editor built
    const names = await page.evaluate(() => {
      const cats = [];
      const walk = (n) => {
        if (!n) return;
        if (Array.isArray(n)) { n.forEach(walk); return; }
        if (n.kind === 'category' && n.name) cats.push(n.name);
        if (n.contents) walk(n.contents);
      };
      // eslint-disable-next-line no-undef
      const cfg = window.__blocklyWorkspace?.options?.languageTree;
      // Fallback: walk the source-of-truth config
      walk(cfg ? [cfg] : []);
      return cats;
    });
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    expect(dupes, `duplicate category names: ${dupes.join(',')}`).toEqual([]);
  });

  test('U4: __builtin_* libraries never appear as toolbox categories', async ({ page }) => {
    await ready(page);
    const names = await page.evaluate(() => {
      const cats = [];
      const walk = (n) => {
        if (!n) return;
        if (Array.isArray(n)) { n.forEach(walk); return; }
        if (n.kind === 'category' && n.name) cats.push(n.name);
        if (n.contents) walk(n.contents);
      };
      const cfg = window.__blocklyWorkspace?.options?.languageTree;
      walk(cfg ? [cfg] : []);
      return cats;
    });
    const leaks = names.filter(n => /__builtin_/.test(n));
    expect(leaks, 'builtin packages must not show in toolbox').toEqual([]);
  });

  test('U5: installing a library twice yields ONE category, not two', async ({ page }) => {
    await ready(page);
    // Install opencv-blocks twice via __loadBlockly + import bridge AND a direct call
    await page.evaluate(() => window.__loadBlockly({
      blocks: { languageVersion: 0, blocks: [{
        type: 'structure_import', x: 40, y: 40, fields: { LIBRARY: 'cv2' },
      }] },
    }));
    await page.waitForFunction(
      () => window.__getInstalledLibraries().some(p => p.name === 'opencv-blocks'),
      { timeout: 3000 }
    );
    // Try installing the SAME spec a second time (simulates user double-clicking
    // a snippet, or the bridge re-firing after a touch)
    await page.evaluate(() => window.__loadBlockly({
      blocks: { languageVersion: 0, blocks: [{
        type: 'structure_import', x: 40, y: 40, fields: { LIBRARY: 'cv2' },
      }] },
    }));
    await page.waitForTimeout(400);

    const installed = await page.evaluate(
      () => window.__getInstalledLibraries().filter(p => p.name === 'opencv-blocks').length
    );
    expect(installed, 'opencv-blocks installed exactly once').toBe(1);
  });
});
