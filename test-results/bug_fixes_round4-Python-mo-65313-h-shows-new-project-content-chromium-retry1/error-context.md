# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: bug_fixes_round4.spec.js >> Python mode project switch shows new project content
- Location: tests/e2e/bug_fixes_round4.spec.js:12:1

# Error details

```
Error: expect(received).toBe(expected) // Object.is equality

Expected: ""
Received: "print(\"project1 content\")"
```

# Page snapshot

```yaml
- generic [ref=e3]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - generic [ref=e6]: Explorer
      - button "Collapse Explorer" [ref=e7] [cursor=pointer]:
        - img [ref=e8]
    - generic [ref=e11]:
      - button "New File" [ref=e12] [cursor=pointer]:
        - img [ref=e13]
      - button "New Folder" [ref=e16] [cursor=pointer]:
        - img [ref=e17]
      - button "Import JSON" [ref=e19] [cursor=pointer]:
        - img [ref=e20]
    - generic [ref=e23]:
      - generic [ref=e25] [cursor=pointer]:
        - img [ref=e27]
        - generic [ref=e30]: Project 1
      - generic [ref=e32] [cursor=pointer]:
        - img [ref=e34]
        - generic [ref=e37]: Project 2
  - main [ref=e39]:
    - generic [ref=e40]:
      - generic [ref=e41]:
        - generic [ref=e42]:
          - button "Blocks" [ref=e43] [cursor=pointer]
          - button "Python" [ref=e44] [cursor=pointer]
        - generic [ref=e45]:
          - button "✨ AI" [ref=e46] [cursor=pointer]
          - button "📦 Libs" [ref=e47] [cursor=pointer]
          - button "📋 Snippets" [ref=e48] [cursor=pointer]
          - button "💾 Save" [ref=e49] [cursor=pointer]
      - generic [ref=e52]:
        - generic [ref=e55]:
          - generic [ref=e58]: "1"
          - textbox [ref=e61]:
            - generic [ref=e62]: print("project1 content")
        - generic [ref=e63]: ✓ syntax ok
    - generic [ref=e64]:
      - generic [ref=e66]:
        - generic [ref=e67]:
          - heading "Stage" [level=2] [ref=e68]
          - button "🗑" [ref=e70] [cursor=pointer]
        - img [ref=e74]
        - generic [ref=e80]:
          - generic [ref=e81]:
            - generic [ref=e82]: X
            - generic [ref=e83]: "0"
          - generic [ref=e84]:
            - generic [ref=e85]: "Y"
            - generic [ref=e86]: "0"
          - generic [ref=e87]:
            - generic [ref=e88]: Size
            - generic [ref=e89]: "100"
          - generic [ref=e90]:
            - generic [ref=e91]: Dir
            - generic [ref=e92]: "90"
      - generic [ref=e94]:
        - heading "Output" [level=2] [ref=e96]
        - generic [ref=e98]: Click "Run" to execute your code
      - generic [ref=e99]:
        - button "▶ Run" [ref=e100] [cursor=pointer]
        - button "Reset" [ref=e101] [cursor=pointer]
        - generic [ref=e102]: ● backend online
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | // ── Helpers ───────────────────────────────────────────────────────────────────
  4   | 
  5   | async function waitForApp(page, timeout = 20000) {
  6   |   await page.waitForFunction(() => typeof window.__blocklyWorkspace !== 'undefined', { timeout });
  7   |   await page.waitForFunction(() => typeof window.__getMode === 'function', { timeout });
  8   | }
  9   | 
  10  | // ── Test 1: Python mode project switch shows correct content ──────────────────
  11  | 
  12  | test('Python mode project switch shows new project content', async ({ page }) => {
  13  |   await page.goto('http://localhost:5173');
  14  |   // Wait for the core app hook, then separately wait for the file management helpers
  15  |   await page.waitForFunction(() => typeof window.__getMode === 'function', { timeout: 15000 });
  16  |   await page.waitForFunction(() => typeof window.__getFiles === 'function', { timeout: 10000 });
  17  | 
  18  |   // Switch to Python mode and type content for project 1
  19  |   await page.evaluate(() => window.__setMode('python'));
  20  |   await page.waitForTimeout(300);
  21  |   await page.evaluate(() => window.__setPython('print("project1 content")'));
  22  |   await page.waitForTimeout(1200); // wait for autosave
  23  | 
  24  |   // Record the current (project 1) file id
  25  |   const project1Id = await page.evaluate(() => window.__getActiveFileId());
  26  |   console.log('Project 1 ID:', project1Id);
  27  | 
  28  |   // Create a new file programmatically via the exposed window helper
  29  |   const newFileId = await page.evaluate(() => window.__createFile(null));
  30  |   await page.waitForTimeout(600); // wait for React state update + workspace clear
  31  | 
  32  |   console.log('New file ID:', newFileId);
  33  | 
  34  |   // Check that Python editor now shows empty content (new project)
  35  |   const pyContent = await page.evaluate(() => window.__getPython());
  36  |   console.log('Python content after new file:', JSON.stringify(pyContent));
> 37  |   expect(pyContent.trim()).toBe('');
      |                            ^ Error: expect(received).toBe(expected) // Object.is equality
  38  | 
  39  |   // Switch back to project 1
  40  |   await page.evaluate((id) => window.__selectFile(id), project1Id);
  41  |   await page.waitForTimeout(600);
  42  | 
  43  |   // Python code of project 1 should be restored
  44  |   const restoredContent = await page.evaluate(() => window.__getPython());
  45  |   console.log('Restored content:', JSON.stringify(restoredContent));
  46  |   expect(restoredContent).toContain('project1 content');
  47  | });
  48  | 
  49  | // ── Test 2: After Python→Blocks conversion, Run produces output (not "no code") ──
  50  | 
  51  | test('Python→Blocks: simple code runs after conversion', async ({ page }) => {
  52  |   await page.goto('http://localhost:5173?test=1');
  53  |   await page.waitForFunction(() => !!window.__getMode, { timeout: 10000 });
  54  | 
  55  |   // Set Python code
  56  |   await page.evaluate(() => window.__setMode('python'));
  57  |   await page.waitForTimeout(200);
  58  |   await page.evaluate(() => window.__setPython('print("hello from python to blocks")'));
  59  |   await page.waitForTimeout(200);
  60  | 
  61  |   // Switch to blocks mode (triggers Python→Blocks conversion with wrapRunnable)
  62  |   await page.evaluate(() => window.__setMode('blocks'));
  63  |   await page.waitForTimeout(3000); // wait for AST conversion
  64  | 
  65  |   // Click run
  66  |   await page.click('[data-testid="run-btn"]');
  67  |   await page.waitForTimeout(2000);
  68  | 
  69  |   // Get output
  70  |   const output = await page.evaluate(() => window.__getStageOutput());
  71  |   console.log('Output after Python→Blocks run:', JSON.stringify(output));
  72  | 
  73  |   // Should have actual output, NOT the "no blocks" error
  74  |   const fullOutput = output.join('\n');
  75  |   expect(fullOutput).not.toMatch(/실행할.*블럭|블럭이 없|No code/i);
  76  |   // Should contain the actual print output or at least attempted execution
  77  |   // (In blocks mode, print outputs to the stage/console)
  78  | });
  79  | 
  80  | // ── Test 3: Multiple Python↔Blocks roundtrips don't corrupt the code ─────────
  81  | 
  82  | test('Python↔Blocks 5 roundtrips preserves code structure', async ({ page }) => {
  83  |   await page.goto('http://localhost:5173?test=1');
  84  |   await page.waitForFunction(() => !!window.__getMode, { timeout: 10000 });
  85  | 
  86  |   const originalCode = 'x = 10\nprint(x)';
  87  | 
  88  |   await page.evaluate(() => window.__setMode('python'));
  89  |   await page.waitForTimeout(200);
  90  |   await page.evaluate((code) => window.__setPython(code), originalCode);
  91  |   await page.waitForTimeout(200);
  92  | 
  93  |   // Do 5 roundtrips
  94  |   for (let i = 0; i < 5; i++) {
  95  |     await page.evaluate(() => window.__setMode('blocks'));
  96  |     await page.waitForTimeout(2500); // AST conversion takes time
  97  |     await page.evaluate(() => window.__setMode('python'));
  98  |     await page.waitForTimeout(300);
  99  |   }
  100 | 
  101 |   // After 5 roundtrips, blocks mode should still have runnable blocks
  102 |   await page.evaluate(() => window.__setMode('blocks'));
  103 |   await page.waitForTimeout(2500);
  104 | 
  105 |   const workspace = await page.evaluate(() => {
  106 |     const ws = window.__blocklyWorkspace;
  107 |     if (!ws) return { topBlocks: 0, hatBlocks: 0 };
  108 |     const top = ws.getTopBlocks(false);
  109 |     const HAT = ['on_start', 'on_forever', 'when_flag_clicked'];
  110 |     return { topBlocks: top.length, hatBlocks: top.filter(b => HAT.includes(b.type)).length };
  111 |   });
  112 | 
  113 |   console.log('After 5 roundtrips workspace:', workspace);
  114 |   // Should still have hat blocks (not degenerated)
  115 |   expect(workspace.topBlocks).toBeGreaterThan(0);
  116 | });
  117 | 
  118 | // ── Test 4: AI block loading results in runnable code ─────────────────────────
  119 | 
  120 | test('AI-loaded blocks without hat get wrapped and run', async ({ page }) => {
  121 |   await page.goto('http://localhost:5173?test=1');
  122 |   await page.waitForFunction(() => !!window.__getMode, { timeout: 10000 });
  123 | 
  124 |   // Load blocks that AI might generate — WITHOUT an on_start hat block
  125 |   const blocksJson = {
  126 |     blocks: {
  127 |       languageVersion: 0,
  128 |       blocks: [{
  129 |         type: 'text_print',
  130 |         x: 100,
  131 |         y: 100,
  132 |         inputs: {
  133 |           TEXT: { shadow: { type: 'text', fields: { TEXT: 'ai output' } } }
  134 |         }
  135 |       }]
  136 |     }
  137 |   };
```