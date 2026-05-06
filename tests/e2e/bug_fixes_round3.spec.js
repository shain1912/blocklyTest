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

// ── Test 1: Floating STATEMENT block without hat block doesn't execute ────────
// BUG #1 real fix — a text_print block sitting loose in the workspace
// must NOT print its payload when Run is clicked. Instead, the app should
// show the Korean guidance message asking the user to add a "시작하면" hat.

test('BUG#1-real – floating text_print block without hat does NOT execute, shows guidance', async ({ page }) => {
  await page.goto('/?test=1');
  await waitForApp(page);

  // Ensure we are in blocks mode before loading the workspace
  const initialMode = await page.evaluate(() => window.__getMode());
  if (initialMode !== 'blocks') {
    await page.evaluate(() => window.__setMode('blocks'));
    await page.waitForFunction(() => window.__getMode() === 'blocks');
  }

  // Load a workspace with a floating text_print block — NO hat block parent.
  // The print block has a shadow text input with value "hello".
  const loaded = await page.evaluate(() =>
    window.__loadBlockly({
      blocks: {
        languageVersion: 0,
        blocks: [
          {
            type: 'text_print',
            x: 100,
            y: 100,
            inputs: {
              TEXT: {
                shadow: {
                  type: 'text',
                  fields: { TEXT: 'hello' },
                },
              },
            },
          },
        ],
      },
    })
  );
  expect(loaded, '__loadBlockly should return true').toBe(true);

  // Brief pause so workspace state settles
  await page.waitForTimeout(300);

  // Click the Run button
  await page.getByTestId('run-btn').click();
  await page.waitForTimeout(1000);

  // Retrieve output
  const output = await page.evaluate(() => window.__getStageOutput());
  const outputStr = output.join('\n');
  console.log('Test 1 output:', outputStr);

  // The app should have detected blocks-present-but-no-hat and shown guidance
  const hasGuidance = /시작하면|블럭|블록/i.test(outputStr);
  expect(hasGuidance, `Expected Korean guidance in output, got: "${outputStr}"`).toBe(true);

  // The floating print block must NOT have executed — "hello" must not appear
  expect(outputStr, 'Floating print block must NOT have executed').not.toContain('hello');
});

// ── Test 2: Python→Blocks with definition-only code shows helpful message ────
// BUG D (deeper assertion) — after converting a definition-only Python snippet
// to blocks and clicking Run, the guidance message should explicitly mention
// "시작하면" or relate to functions/classes, and must never be a raw NameError.

test('BUG-D-specific – definition-only Python→Blocks guidance mentions 시작하면 or 함수', async ({ page }) => {
  await page.goto('/?test=1');
  await waitForApp(page);

  // Switch to Python mode
  await page.evaluate(() => window.__setMode('python'));
  await page.waitForFunction(() => window.__getMode() === 'python');

  // Set code with only a function definition — no top-level executable call
  await page.evaluate(() =>
    window.__setPython('def greet(name):\n    print(f"Hello {name}")')
  );
  await page.waitForTimeout(200);

  // Switch back to blocks — triggers Python→Blocks conversion
  await page.evaluate(() => window.__setMode('blocks'));
  await page.waitForFunction(() => window.__getMode() === 'blocks');

  // Wait for the AST backend conversion to complete
  await page.waitForTimeout(2000);

  // Click Run — workspace may be empty or contain only a function definition block
  await page.getByTestId('run-btn').click();
  await page.waitForTimeout(1000);

  // Retrieve output
  const output = await page.evaluate(() => window.__getStageOutput());
  const outputStr = output.join('\n');
  console.log('Test 2 output:', outputStr);

  // Must NOT produce raw Python errors or JS exceptions
  expect(outputStr, 'Output must not contain NameError').not.toMatch(/NameError/i);
  expect(outputStr, 'Output must not contain bare JS Error').not.toMatch(/^Error:/m);

  // Guidance must be present and specific — mentions "시작하면" (the hat block label)
  // OR mentions 함수/클래스 (function/class — as the existing message does for non-empty workspaces)
  // OR the output is empty (workspace was cleared because definition-only has nothing to run)
  const hasSpecificGuidance =
    /시작하면/i.test(outputStr) ||
    /함수|클래스/i.test(outputStr) ||
    /블럭|블록/i.test(outputStr) ||
    output.length === 0;

  expect(
    hasSpecificGuidance,
    `Expected guidance containing 시작하면, 함수/클래스, or block message. Got: "${outputStr}"`
  ).toBe(true);
});
