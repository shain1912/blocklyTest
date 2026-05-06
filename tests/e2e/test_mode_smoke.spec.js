import { test, expect } from '@playwright/test';

test.describe('Phase 1 — test-mode UI + window hooks', () => {
  test('test mode strips chrome and exposes window hooks', async ({ page }) => {
    await page.goto('/?test=1');
    await page.waitForFunction(() => typeof window.__blocklyWorkspace !== 'undefined');

    // Test-mode marker is set on the root
    await expect(page.locator('[data-testmode="1"]')).toHaveCount(1);

    // FileExplorer is hidden in test mode
    await expect(page.locator('.file-explorer')).toHaveCount(0);

    // AI / Libs / Snippets / Save buttons are hidden in test mode
    await expect(page.locator('.editor-header-actions')).toHaveCount(0);

    // Core test ids are present
    await expect(page.getByTestId('editor-section')).toHaveCount(1);
    await expect(page.getByTestId('blocks-pane')).toHaveCount(1);
    await expect(page.getByTestId('python-pane')).toHaveCount(1);
    await expect(page.getByTestId('stage-section')).toHaveCount(1);
    await expect(page.getByTestId('stage-canvas')).toHaveCount(1);
    await expect(page.getByTestId('output-section')).toHaveCount(1);
    await expect(page.getByTestId('controls-section')).toHaveCount(1);
    await expect(page.getByTestId('mode-toggle-blocks')).toHaveCount(1);
    await expect(page.getByTestId('mode-toggle-python')).toHaveCount(1);
    await expect(page.getByTestId('run-btn')).toHaveCount(1);
  });

  test('default (non-test) mode keeps chrome', async ({ page }) => {
    await page.goto('/');
    await page.waitForFunction(() => typeof window.__blocklyWorkspace !== 'undefined');

    await expect(page.locator('[data-testmode="0"]')).toHaveCount(1);
    await expect(page.locator('.editor-header-actions')).toHaveCount(1);
  });

  test('all window hooks are bound', async ({ page }) => {
    await page.goto('/?test=1');
    await page.waitForFunction(() => typeof window.__blocklyWorkspace !== 'undefined');

    // Wait for the dynamic-binding useEffect to run
    await page.waitForFunction(() => typeof window.__getMode === 'function');

    const hooks = await page.evaluate(() => {
      const names = [
        '__blocklyWorkspace', '__loadBlockly', '__getWorkspacePython',
        '__installLibrary', '__getInstalledLibraries', '__hasPyGen', '__pyGenKeys',
        '__setPython', '__getPython', '__getWorkspaceJson', '__resetWorkspace',
        '__getBlocksTouched', '__getMode', '__toggleMode', '__setMode', '__runCode',
        '__stopRun', '__getStageOutput', '__getStageState', '__getStageVariables',
        '__isRunning', '__isTestMode',
      ];
      const out = {};
      for (const n of names) out[n] = typeof window[n];
      return out;
    });

    for (const [name, type] of Object.entries(hooks)) {
      expect(type, `window.${name} should exist`).not.toBe('undefined');
    }
  });

  test('mode toggle hook switches mode and roundtrips a tiny program', async ({ page }) => {
    await page.goto('/?test=1');
    await page.waitForFunction(() => typeof window.__blocklyWorkspace !== 'undefined');
    await page.waitForFunction(() => typeof window.__toggleMode === 'function');

    // Load a one-block program via the existing hook
    const loaded = await page.evaluate(() => {
      return window.__loadBlockly({
        blocks: {
          languageVersion: 0,
          blocks: [
            { type: 'on_start', x: 20, y: 20,
              inputs: { DO: { block: { type: 'move_right', fields: { STEPS: 10 } } } } }
          ]
        }
      });
    });
    expect(loaded).toBe(true);

    expect(await page.evaluate(() => window.__getMode())).toBe('blocks');

    await page.evaluate(() => window.__toggleMode());
    await page.waitForFunction(() => window.__getMode() === 'python');

    const py = await page.evaluate(() => window.__getPython());
    expect(py).toMatch(/sprite\.move/);
  });

  test('stage state hook returns sprite x/y/direction', async ({ page }) => {
    await page.goto('/?test=1');
    await page.waitForFunction(() => typeof window.spriteController !== 'undefined');
    await page.waitForFunction(() => typeof window.__getStageState === 'function');

    const state = await page.evaluate(() => window.__getStageState());
    expect(state).toMatchObject({ x: 0, y: 0, direction: 90, visible: true });
  });
});
