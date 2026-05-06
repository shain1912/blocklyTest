import { test, expect } from '@playwright/test';

// Phase 3 — Demo Pillar #2: import block actually wires up callable blocks.
//
// Before: dragging `import cv2` was dead syntax — `cv2.imshow` etc. did NOT
// appear in the toolbox; the user had to manually install the library first.
//
// After: importBridge.js detects the structure_import block and auto-installs
// the matching curated library so its blocks are immediately usable.

const ready = async (page, url = '/?test=1') => {
  await page.goto(url);
  await page.waitForFunction(() => typeof window.__blocklyWorkspace !== 'undefined');
  await page.waitForFunction(() => typeof window.__toggleMode === 'function');
  await page.evaluate(() => {
    // Wipe any libs installed by previous test runs (localStorage persists)
    try { localStorage.removeItem('blockly-libraries'); } catch {}
    window.__resetWorkspace();
  });
  // Reload so libraryManager picks up the cleaned localStorage
  await page.goto(url);
  await page.waitForFunction(() => typeof window.__blocklyWorkspace !== 'undefined');
  await page.waitForFunction(() => typeof window.__toggleMode === 'function');
  await page.evaluate(() => window.__resetWorkspace());
};

const importOnlyProgram = (libName) => ({
  blocks: {
    languageVersion: 0,
    blocks: [{
      type: 'structure_import',
      x: 40, y: 40,
      fields: { LIBRARY: libName },
    }],
  },
});

test.describe('Phase 3 — Import → callable block bridge (Scenario B)', () => {
  test('B1: dragging in an import block auto-installs the matching library', async ({ page }) => {
    await ready(page);

    // Sanity: no libraries installed yet
    const before = await page.evaluate(() => window.__getInstalledLibraries().map(p => p.name));
    expect(before).not.toContain('opencv-blocks');

    // Simulate the user dragging in `import cv2`
    expect(await page.evaluate((j) => window.__loadBlockly(j), importOnlyProgram('cv2'))).toBe(true);
    // The bridge fires from onWorkspaceChange — give it a tick
    await page.waitForFunction(
      () => window.__getInstalledLibraries().some(p => p.name === 'opencv-blocks'),
      { timeout: 3000 }
    );

    const after = await page.evaluate(() => window.__getInstalledLibraries().map(p => p.name));
    expect(after).toContain('opencv-blocks');
  });

  test('B2: alias imports (np, pd, plt, st) resolve to the right library', async ({ page }) => {
    const cases = [
      ['np',  'numpy-blocks'],
      ['pd',  'pandas-blocks'],
      ['plt', 'matplotlib-blocks'],
      ['st',  'streamlit-blocks'],
      ['requests', 'requests-blocks'],
    ];
    for (const [moduleName, expectedLib] of cases) {
      await ready(page);
      await page.evaluate((j) => window.__loadBlockly(j), importOnlyProgram(moduleName));
      await page.waitForFunction(
        (lib) => window.__getInstalledLibraries().some(p => p.name === lib),
        expectedLib,
        { timeout: 3000 }
      );
      const names = await page.evaluate(() => window.__getInstalledLibraries().map(p => p.name));
      expect(names, `import ${moduleName} should install ${expectedLib}`).toContain(expectedLib);
    }
  });

  test('B3: unknown imports do not install anything (graceful no-op)', async ({ page }) => {
    await ready(page);
    await page.evaluate((j) => window.__loadBlockly(j), importOnlyProgram('totally_made_up_module'));
    await page.waitForTimeout(400);
    const names = await page.evaluate(() => window.__getInstalledLibraries().map(p => p.name));
    expect(names).toEqual([]);
  });

  test('B4: after auto-install, the library generators are registered (Python codegen works)', async ({ page }) => {
    await ready(page);
    // import cv2 → triggers opencv-blocks install
    await page.evaluate((j) => window.__loadBlockly(j), importOnlyProgram('cv2'));
    await page.waitForFunction(
      () => window.__getInstalledLibraries().some(p => p.name === 'opencv-blocks'),
      { timeout: 3000 }
    );

    // The opencv lib should have registered Python generators for cv2_* blocks
    const hasGen = await page.evaluate(() => window.__hasPyGen('cv2_imshow'));
    expect(hasGen, 'cv2_imshow Python generator should be registered after auto-install').toBe(true);
  });

  test('B5: workspace with import + library block toggles to clean Python and back', async ({ page }) => {
    await ready(page);

    // Step 1: load just the import — bridge installs opencv-blocks
    await page.evaluate((j) => window.__loadBlockly(j), importOnlyProgram('cv2'));
    await page.waitForFunction(
      () => window.__getInstalledLibraries().some(p => p.name === 'opencv-blocks'),
      { timeout: 3000 }
    );

    // Step 2: now load a workspace that uses BOTH the import AND a cv2_imshow block
    const program = {
      blocks: {
        languageVersion: 0,
        blocks: [
          { type: 'structure_import', x: 40, y: 20, fields: { LIBRARY: 'cv2' } },
          { type: 'cv2_imshow',       x: 40, y: 80,
            fields: { WINDOW: 'preview', IMAGE: 'frame' } },
        ],
      },
    };
    await page.evaluate((j) => window.__loadBlockly(j), program);
    await page.waitForTimeout(300);

    // Vocabulary contract: structure_import + cv2_imshow are both supposed
    // to be reachable from the toolbox after the bridge install.
    const ghosts = await page.evaluate(() => {
      const ws = window.__blocklyWorkspace;
      const types = ws.getAllBlocks(false).map(b => b.type);
      const tb = new Set(window.__getToolboxBlockTypes());
      return types.filter(t => !tb.has(t));
    });
    expect(ghosts, 'no ghost blocks after bridge install').toEqual([]);

    // Toggle to python — should produce both `import cv2` and `cv2.imshow(...)`
    await page.evaluate(() => window.__setMode('python'));
    await page.waitForFunction(() => window.__getMode() === 'python');
    await page.waitForTimeout(100);
    const py = await page.evaluate(() => window.__getPython());
    expect(py).toMatch(/import cv2/);
    expect(py).toMatch(/cv2\.imshow/);

    // Toggle back — workspace should still have both blocks
    await page.evaluate(() => window.__setMode('blocks'));
    await page.waitForFunction(() => window.__getMode() === 'blocks');
    await page.waitForTimeout(400);
    const types = await page.evaluate(() => {
      const ws = window.__blocklyWorkspace;
      return ws.getAllBlocks(false).map(b => b.type).sort();
    });
    expect(types).toContain('structure_import');
  });
});
