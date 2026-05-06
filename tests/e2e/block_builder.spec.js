import { test, expect } from '@playwright/test';

/**
 * Block-builder demo — user assembles a small library FROM blocks
 * (`structure_module_def` containing typed functions), then promotes the
 * workspace to a Blockly library package via __buildAndInstallLibrary().
 * The new library:
 *   1. lands in localStorage as a user-installed package
 *   2. shows up as its OWN toolbox category (named after the module)
 *   3. Round-trip: switching to Python emits the class source.
 *
 * This is the "build a library FROM blocks" demo the user asked for.
 */

const ready = async (page) => {
  await page.goto('/?test=1');
  await page.waitForFunction(() => typeof window.__buildAndInstallLibrary === 'function');
  await page.evaluate(() => {
    try { localStorage.removeItem('blockly-libraries'); } catch {}
    window.__resetWorkspace();
  });
  await page.goto('/?test=1');
  await page.waitForFunction(() => typeof window.__buildAndInstallLibrary === 'function');
};

// A workspace with one user-defined library module containing one helper
// function. This is the smallest meaningful "library from blocks" example.
const LIBRARY_WORKSPACE = {
  blocks: {
    languageVersion: 0,
    blocks: [{
      type: 'structure_module_def',
      x: 40, y: 40,
      fields: { NAME: 'GameUtils' },
      inputs: {
        CONTENT: {
          block: {
            type: 'structure_typed_function',
            fields: { NAME: 'reset_score', ARGS: '', RETURN_TYPE: 'None' },
            inputs: {
              STACK: { block: { type: 'variable', fields: { VAR_NAME: 'score', VALUE: '0' } } },
            },
          },
        },
      },
    }],
  },
};

test.describe('Build library FROM blocks', () => {
  test('BB-1: assembling a module + function block + exporting yields a usable library', async ({ page }) => {
    await ready(page);

    // 1. Drop the module workspace (simulates user dragging structure_module_def
    //    + structure_typed_function from the toolbox).
    expect(await page.evaluate((j) => window.__loadBlockly(j), LIBRARY_WORKSPACE)).toBe(true);
    await page.waitForTimeout(150);

    // 2. Promote workspace → library package + install
    const out = await page.evaluate(() => window.__buildAndInstallLibrary({
      name: 'game-utils', version: '0.1.0',
      description: 'Tiny user-built library', author: 'demo',
    }));
    expect(out.ok, out.error).toBe(true);
    expect(out.pkg.name).toBe('game-utils');
    expect(out.pkg.toolboxCategory.name).toMatch(/game-utils/);

    // 3. Library Manager UI list now contains it
    const installed = await page.evaluate(
      () => window.__getInstalledLibraries().map(p => p.name)
    );
    expect(installed).toContain('game-utils');

    // 4. Toolbox now has a 📦 game-utils category. Walk live config.
    const cats = await page.evaluate(() => {
      const out = [];
      const walk = (n) => {
        if (!n) return;
        if (Array.isArray(n)) { n.forEach(walk); return; }
        if (n.kind === 'category' && n.name) out.push(n.name);
        if (n.contents) walk(n.contents);
      };
      const cfg = window.__blocklyWorkspace?.options?.languageTree;
      walk(cfg ? [cfg] : []);
      return out;
    });
    expect(cats.some(n => /game-utils/.test(n))).toBe(true);
  });

  test('BB-2: library survives reload via localStorage', async ({ page }) => {
    await ready(page);
    await page.evaluate((j) => window.__loadBlockly(j), LIBRARY_WORKSPACE);
    await page.waitForTimeout(150);
    await page.evaluate(() => window.__buildAndInstallLibrary({
      name: 'persistent-lib', version: '1.0.0',
    }));
    expect(
      await page.evaluate(() => window.__getInstalledLibraries().map(p => p.name))
    ).toContain('persistent-lib');

    // Reload — library should still be there (localStorage persisted)
    await page.goto('/?test=1');
    await page.waitForFunction(() => typeof window.__getInstalledLibraries === 'function');
    expect(
      await page.evaluate(() => window.__getInstalledLibraries().map(p => p.name))
    ).toContain('persistent-lib');
  });

  test('BB-3: Python view shows the class source the user assembled', async ({ page }) => {
    await ready(page);
    await page.evaluate((j) => window.__loadBlockly(j), LIBRARY_WORKSPACE);
    await page.waitForTimeout(150);

    await page.evaluate(() => window.__setMode('python'));
    await page.waitForFunction(() => window.__getMode() === 'python');
    await page.waitForTimeout(150);
    const py = await page.evaluate(() => window.__getPython());
    expect(py).toMatch(/class GameUtils/);
    expect(py).toMatch(/def reset_score/);
  });
});
