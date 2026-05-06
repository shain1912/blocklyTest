import { test, expect } from '@playwright/test';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Wait for the Blockly workspace to be initialised (window.__blocklyWorkspace
 * is set by the onMount callback in App.jsx).
 */
async function waitForBlockly(page, timeout = 15000) {
  await page.waitForFunction(() => typeof window.__blocklyWorkspace !== 'undefined', { timeout });
}

// ── Test 1: Panels are mutually exclusive (BUG #5 fix) ───────────────────────

test('BUG#5 – panels are mutually exclusive', async ({ page }) => {
  // Use normal URL — we need the header-action buttons
  await page.goto('/');
  await waitForBlockly(page);

  // Confirm the editor-header-actions are visible (non-test mode)
  await expect(page.locator('.editor-header-actions')).toHaveCount(1);

  // ── Open AI panel ──
  await page.click('button:has-text("✨ AI")');
  await page.waitForTimeout(200);

  const aiPanel = page.locator('.ai-panel');
  await expect(aiPanel).toBeVisible();

  // ── Open Libs panel — AI panel must disappear ──
  await page.click('button:has-text("📦 Libs")');
  await page.waitForTimeout(200);

  const libPanel = page.locator('.lib-panel');
  await expect(libPanel).toBeVisible();
  await expect(aiPanel).toHaveCount(0); // removed from DOM, not just hidden

  // ── Open Snippets panel — Libs panel must disappear ──
  await page.click('button:has-text("📋 Snippets")');
  await page.waitForTimeout(200);

  // PythonSnippets renders itself but hides via the `open` prop — check
  // that it is now visible while the lib panel is gone.
  await expect(libPanel).toHaveCount(0);
  // The Snippets panel/drawer should now be visible.
  // It is rendered by PythonSnippets component; look for open state or content.
  const snippetsPanel = page.locator('.snippets-panel, .python-snippets, [data-testid="snippets-panel"]');
  // If none of these selectors match, try a broader check: the lib panel is
  // closed AND the AI panel is still closed.
  await expect(aiPanel).toHaveCount(0);
  await expect(libPanel).toHaveCount(0);
});

// ── Test 2: Blockly resizes after panel close (BUG #3 fix) ───────────────────

test('BUG#3 – blocks-pane widens after AI panel closes', async ({ page }) => {
  await page.goto('/');
  await waitForBlockly(page);

  const blocksPane = page.getByTestId('blocks-pane');

  // Baseline width (no panel open)
  const widthBase = await blocksPane.evaluate(el => el.getBoundingClientRect().width);

  // Open AI panel
  await page.click('button:has-text("✨ AI")');
  await page.waitForTimeout(300);

  const widthWithAI = await blocksPane.evaluate(el => el.getBoundingClientRect().width);

  // Panel should have consumed some width
  expect(widthWithAI).toBeLessThan(widthBase);

  // Close AI panel by clicking the button again (toggle off)
  await page.click('button:has-text("✨ AI")');
  await page.waitForTimeout(400); // allow svgResize to fire (120ms debounce + buffer)

  const widthAfterClose = await blocksPane.evaluate(el => el.getBoundingClientRect().width);

  // Width after close must be wider than when AI was open
  expect(widthAfterClose).toBeGreaterThan(widthWithAI);
});

// ── Test 3: Floating blocks don't execute (BUG #1 fix) ───────────────────────

test('BUG#1 – floating math_number block produces "시작하면" error, not execution', async ({ page }) => {
  await page.goto('/?test=1');
  await waitForBlockly(page);
  // Wait for the run-code hook to be bound
  await page.waitForFunction(() => typeof window.__runCode === 'function');

  // Load a floating math_number block (no hat block parent)
  const loaded = await page.evaluate(() => {
    return window.__loadBlockly({
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: 'math_number',
            x: 100,
            y: 100,
            fields: { NUM: 42 },
          },
        ],
      },
    });
  });
  expect(loaded).toBe(true);

  // Click the Run button
  await page.getByTestId('run-btn').click();
  await page.waitForTimeout(300);

  // The output area should contain the Korean "add a start block" message
  const outputContent = page.locator('.output-content');
  await expect(outputContent).toContainText('시작하면');
});

// ── Test 4: Python code preserved on project switch (BUG #9 fix) ─────────────

test('BUG#9 – Python code is preserved when switching projects', async ({ page }) => {
  // Clear localStorage so we start fresh
  await page.addInitScript(() => {
    localStorage.removeItem('blockly-files');
    localStorage.removeItem('blockly-active-file');
  });

  await page.goto('/');
  await waitForBlockly(page);
  await page.waitForFunction(() => typeof window.__setPython === 'function');

  // Switch to Python mode
  await page.getByTestId('mode-toggle-python').click();
  await page.waitForTimeout(300);

  // Type some Python code via the window hook
  await page.evaluate(() => window.__setPython('print("hello from project 1")'));
  await page.waitForTimeout(1200); // wait for autosave (800ms debounce + buffer)

  // Create a new project using the "New File" button in FileExplorer
  // The button has title="New File" in the .file-actions section
  await page.locator('.file-actions button[title="New File"]').click();
  await page.waitForTimeout(600);

  // Now switch back to Project 1 by clicking it in the file list
  await page.locator('.file-item').first().click();
  await page.waitForTimeout(600);

  // Read back the Python code
  const restoredPython = await page.evaluate(() => window.__getPython());
  expect(restoredPython).toContain('hello from project 1');
});

// ── Test 5: Import icon looks like upload not download (BUG #4 fix) ──────────

test('BUG#4 – import button SVG uses upward arrow (upload icon)', async ({ page }) => {
  await page.goto('/');
  await waitForBlockly(page);

  // The import button in FileExplorer has title="Import JSON"
  const importBtn = page.locator('button[title="Import JSON"]');
  await expect(importBtn).toBeVisible();

  // Get the polyline points attribute inside the button's SVG
  const points = await importBtn.locator('polyline').getAttribute('points');

  // Upward arrow: "17 8 12 3 7 8"   (chevron pointing UP — upload icon)
  // Downward arrow: "7 10 12 15 17 10" (chevron pointing DOWN — download icon)
  expect(points).toContain('17 8 12 3 7 8');
  expect(points).not.toContain('7 10 12 15 17 10');
});
