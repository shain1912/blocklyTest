import { test, expect } from '@playwright/test';

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Wait for all core window hooks to be available.
 * __getMode is bound in the re-render useEffect, so it appears slightly after
 * __blocklyWorkspace (which is set in the onMount callback).
 */
async function waitForApp(page, timeout = 20000) {
  await page.waitForFunction(() => typeof window.__blocklyWorkspace !== 'undefined', { timeout });
  await page.waitForFunction(() => typeof window.__getMode === 'function', { timeout });
}

// ── Test 1: Sprite shim — sprite.move() runs without error in Python mode (BUG A) ──

test('BUG-A – sprite.move() runs without NameError in Python mode', async ({ page }) => {
  await page.goto('/?test=1');
  await waitForApp(page);

  // Switch to Python mode
  await page.evaluate(() => window.__setMode('python'));
  await page.waitForFunction(() => window.__getMode() === 'python');

  // Set Python code that uses sprite API
  await page.evaluate(() =>
    window.__setPython('sprite.move(30)\nsprite.say("hello")\nprint("done")')
  );
  await page.waitForTimeout(200);

  // Click the Run button
  await page.getByTestId('run-btn').click();

  // Wait for execution to complete (backend may take a moment)
  await page.waitForTimeout(3000);

  // Get output
  const output = await page.evaluate(() => window.__getStageOutput());

  // The sprite shim should have printed sprite.move(30) or similar
  const outputStr = output.join('\n');
  console.log('Test 1 output:', outputStr);

  // Should NOT contain Python errors
  expect(outputStr, 'Output must not contain NameError').not.toMatch(/NameError/i);
  expect(outputStr, 'Output must not contain "undefined"').not.toMatch(/\bundefined\b/);

  // Should contain evidence that sprite.move executed
  const hasMoveOutput = /sprite\.move\(30\)|sprite moves|sprite says/i.test(outputStr)
    || outputStr.includes('30');
  expect(hasMoveOutput, `Expected move output in: ${outputStr}`).toBe(true);

  // Should contain "done" from print("done")
  expect(outputStr, 'Expected "done" in output').toContain('done');
});

// ── Test 2: Definition-only Python→Blocks shows correct error (BUG D) ─────────

test('BUG-D – definition-only Python→Blocks shows Korean guidance, not NameError', async ({ page }) => {
  await page.goto('/?test=1');
  await waitForApp(page);

  // Switch to Python mode
  await page.evaluate(() => window.__setMode('python'));
  await page.waitForFunction(() => window.__getMode() === 'python');

  // Set code with only a function definition (no top-level executable code)
  await page.evaluate(() =>
    window.__setPython('def greet(name):\n    print(f"Hello {name}")')
  );
  await page.waitForTimeout(200);

  // Switch to blocks mode — this triggers Python→Blocks conversion
  await page.evaluate(() => window.__setMode('blocks'));
  await page.waitForFunction(() => window.__getMode() === 'blocks');

  // Wait for conversion (AST path talks to backend)
  await page.waitForTimeout(2000);

  // Click the run button — with no hat block, should get a guidance message
  await page.getByTestId('run-btn').click();
  await page.waitForTimeout(1000);

  // Get output
  const output = await page.evaluate(() => window.__getStageOutput());
  const outputStr = output.join('\n');
  console.log('Test 2 output:', outputStr);

  // Must NOT produce a NameError or JS exception
  expect(outputStr, 'Output must not contain NameError').not.toMatch(/NameError/i);
  expect(outputStr, 'Output must not contain JS Error').not.toMatch(/^Error:/m);

  // Should contain a guidance message about needing a start block
  // The app outputs Korean messages like "시작하면" or "블럭"
  const hasGuidance = /시작하면|블럭|블록|start block|no blocks/i.test(outputStr)
    || output.length === 0; // acceptable if workspace was empty after definition-only parse
  expect(hasGuidance, `Expected guidance message or empty output, got: ${outputStr}`).toBe(true);
});

// ── Test 3: Library install success — __installLibrary doesn't crash (BUG B) ──

test('BUG-B – __installLibrary accepts a minimal package without crashing', async ({ page }) => {
  await page.goto('/?test=1');
  await waitForApp(page);

  // Install a minimal synthetic library
  const result = await page.evaluate(() =>
    window.__installLibrary({
      name: 'test-lib',
      version: '1.0.0',
      blocks: [],
    })
  );

  console.log('Test 3 install result:', JSON.stringify(result));

  // Should return { ok: true } — no exception thrown
  expect(result, 'installLibrary should return truthy result').toBeTruthy();
  expect(result.ok, 'installLibrary should succeed (ok: true)').toBe(true);

  // The toolbox helper must still be callable after install
  const blockTypes = await page.evaluate(() => {
    try { return window.__getToolboxBlockTypes(); } catch (e) { return null; }
  });
  expect(blockTypes, '__getToolboxBlockTypes() must return an array after install').not.toBeNull();
  expect(Array.isArray(blockTypes), '__getToolboxBlockTypes() must return an array').toBe(true);
});

// ── Test 4: Run button message when NO blocks at all (BUG #1 regression check) ─

test('BUG-1-regression – empty workspace shows Korean guidance message', async ({ page }) => {
  await page.goto('/?test=1');
  await waitForApp(page);

  // Reset workspace to ensure it's completely empty
  await page.evaluate(() => window.__resetWorkspace());
  await page.waitForTimeout(200);

  // Confirm we're in blocks mode
  const mode = await page.evaluate(() => window.__getMode());
  expect(mode, 'Should be in blocks mode').toBe('blocks');

  // Click the run button on an empty workspace
  await page.getByTestId('run-btn').click();
  await page.waitForTimeout(500);

  // Get output
  const output = await page.evaluate(() => window.__getStageOutput());
  const outputStr = output.join('\n');
  console.log('Test 4 output:', outputStr);

  // Must contain a Korean guidance message about adding blocks
  expect(outputStr, 'Expected Korean block guidance message').toMatch(/블럭|블록/);
});
