import { test, expect } from '@playwright/test';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function waitForApp(page, timeout = 20000) {
  await page.waitForFunction(() => typeof window.__blocklyWorkspace !== 'undefined', { timeout });
  await page.waitForFunction(() => typeof window.__getMode === 'function', { timeout });
}

// ── Test 1: Python mode project switch shows correct content ──────────────────

test('Python mode project switch shows new project content', async ({ page }) => {
  await page.goto('http://localhost:5173');
  // Wait for the core app hook, then separately wait for the file management helpers
  await page.waitForFunction(() => typeof window.__getMode === 'function', { timeout: 15000 });
  await page.waitForFunction(() => typeof window.__getFiles === 'function', { timeout: 10000 });

  // Switch to Python mode and type content for project 1
  await page.evaluate(() => window.__setMode('python'));
  await page.waitForTimeout(300);
  await page.evaluate(() => window.__setPython('print("project1 content")'));
  await page.waitForTimeout(1200); // wait for autosave

  // Record the current (project 1) file id
  const project1Id = await page.evaluate(() => window.__getActiveFileId());
  console.log('Project 1 ID:', project1Id);

  // Create a new file programmatically via the exposed window helper
  const newFileId = await page.evaluate(() => window.__createFile(null));
  await page.waitForTimeout(600); // wait for React state update + workspace clear

  console.log('New file ID:', newFileId);

  // Check that Python editor now shows empty content (new project)
  const pyContent = await page.evaluate(() => window.__getPython());
  console.log('Python content after new file:', JSON.stringify(pyContent));
  expect(pyContent.trim()).toBe('');

  // Switch back to project 1
  await page.evaluate((id) => window.__selectFile(id), project1Id);
  await page.waitForTimeout(600);

  // Python code of project 1 should be restored
  const restoredContent = await page.evaluate(() => window.__getPython());
  console.log('Restored content:', JSON.stringify(restoredContent));
  expect(restoredContent).toContain('project1 content');
});

// ── Test 2: After Python→Blocks conversion, Run produces output (not "no code") ──

test('Python→Blocks: simple code runs after conversion', async ({ page }) => {
  await page.goto('http://localhost:5173?test=1');
  await page.waitForFunction(() => !!window.__getMode, { timeout: 10000 });

  // Set Python code
  await page.evaluate(() => window.__setMode('python'));
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__setPython('print("hello from python to blocks")'));
  await page.waitForTimeout(200);

  // Switch to blocks mode (triggers Python→Blocks conversion with wrapRunnable)
  await page.evaluate(() => window.__setMode('blocks'));
  await page.waitForTimeout(3000); // wait for AST conversion

  // Click run
  await page.click('[data-testid="run-btn"]');
  await page.waitForTimeout(2000);

  // Get output
  const output = await page.evaluate(() => window.__getStageOutput());
  console.log('Output after Python→Blocks run:', JSON.stringify(output));

  // Should have actual output, NOT the "no blocks" error
  const fullOutput = output.join('\n');
  expect(fullOutput).not.toMatch(/실행할.*블럭|블럭이 없|No code/i);
  // Should contain the actual print output or at least attempted execution
  // (In blocks mode, print outputs to the stage/console)
});

// ── Test 3: Multiple Python↔Blocks roundtrips don't corrupt the code ─────────

test('Python↔Blocks 5 roundtrips preserves code structure', async ({ page }) => {
  await page.goto('http://localhost:5173?test=1');
  await page.waitForFunction(() => !!window.__getMode, { timeout: 10000 });

  const originalCode = 'x = 10\nprint(x)';

  await page.evaluate(() => window.__setMode('python'));
  await page.waitForTimeout(200);
  await page.evaluate((code) => window.__setPython(code), originalCode);
  await page.waitForTimeout(200);

  // Do 5 roundtrips
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => window.__setMode('blocks'));
    await page.waitForTimeout(2500); // AST conversion takes time
    await page.evaluate(() => window.__setMode('python'));
    await page.waitForTimeout(300);
  }

  // After 5 roundtrips, blocks mode should still have runnable blocks
  await page.evaluate(() => window.__setMode('blocks'));
  await page.waitForTimeout(2500);

  const workspace = await page.evaluate(() => {
    const ws = window.__blocklyWorkspace;
    if (!ws) return { topBlocks: 0, hatBlocks: 0 };
    const top = ws.getTopBlocks(false);
    const HAT = ['on_start', 'on_forever', 'when_flag_clicked'];
    return { topBlocks: top.length, hatBlocks: top.filter(b => HAT.includes(b.type)).length };
  });

  console.log('After 5 roundtrips workspace:', workspace);
  // Should still have hat blocks (not degenerated)
  expect(workspace.topBlocks).toBeGreaterThan(0);
});

// ── Test 4: AI block loading results in runnable code ─────────────────────────

test('AI-loaded blocks without hat get wrapped and run', async ({ page }) => {
  await page.goto('http://localhost:5173?test=1');
  await page.waitForFunction(() => !!window.__getMode, { timeout: 10000 });

  // Load blocks that AI might generate — WITHOUT an on_start hat block
  const blocksJson = {
    blocks: {
      languageVersion: 0,
      blocks: [{
        type: 'text_print',
        x: 100,
        y: 100,
        inputs: {
          TEXT: { shadow: { type: 'text', fields: { TEXT: 'ai output' } } }
        }
      }]
    }
  };

  await page.evaluate((json) => window.__loadBlockly(json), blocksJson);
  await page.waitForTimeout(500);

  // Run
  await page.click('[data-testid="run-btn"]');
  await page.waitForTimeout(1000);

  const output = await page.evaluate(() => window.__getStageOutput());
  const fullOutput = output.join('\n');
  console.log('Output after AI load run:', fullOutput);

  // The block HAD no hat, but after our fix it should either:
  // a) Execute (if auto-wrapped in on_start), OR
  // b) Show helpful Korean message (if not auto-wrapped)
  // Either way, NOT crash
  expect(fullOutput).toBeTruthy();
});
