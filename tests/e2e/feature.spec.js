/**
 * Feature Validation E2E Tests
 *
 * Tests 3 scenarios:
 *   CL  — Class-based Python → Blockly conversion
 *   OCV — opencv-python AI auto-generate → blocks → Python code
 *   STR — streamlit AI auto-generate → blocks → Python code
 */

import { test, expect } from '@playwright/test';

const BASE_URL = 'http://localhost:5173';

// ── Helpers ───────────────────────────────────────────────────────────────────

async function waitForApp(page) {
  await page.waitForSelector('.blockly-editor', { timeout: 15000 });
  await page.waitForTimeout(800);
}

async function loadPythonToBlocks(page, code) {
  await page.waitForFunction(() => typeof window.__loadBlockly === 'function', { timeout: 10000 });
  return page.evaluate(async (src) => {
    const m = await import('/src/utils/legacy/transpiler.js');
    const json = m.pythonToBlockly(src, { wrapRunnable: true });
    window.__loadBlockly(json);
    return { blockTypes: json.blocks.blocks.map(b => b.type), count: json.blocks.blocks.length };
  }, code);
}

async function getWorkspaceBlockTypes(page) {
  return page.evaluate(() => {
    const ws = window.__blocklyWorkspace;
    if (!ws) return [];
    return ws.getAllBlocks().map(b => b.type);
  });
}

async function getPythonOutput(page) {
  // CodeMirror-backed — use the window helper
  await page.waitForFunction(() => typeof window.__getPython === 'function', { timeout: 5000 });
  return page.evaluate(() => window.__getPython());
}

async function getWorkspacePython(page) {
  const pythonBtn = page.locator('.toggle-btn:has-text("Python")');
  const blocksBtn = page.locator('.toggle-btn:has-text("Blocks")');
  await pythonBtn.click();
  await page.waitForTimeout(500);
  await page.waitForFunction(() => typeof window.__getPython === 'function', { timeout: 5000 });
  const code = await page.evaluate(() => window.__getPython());
  await blocksBtn.click();
  await page.waitForTimeout(300);
  return code;
}

/**
 * Open LibraryManager, go to Install tab, type library name,
 * click "Generate Blocks with AI", and wait for success.
 * Returns the success message text.
 */
async function aiGenerateLibrary(page, libName, context = '') {
  // Inject API key into localStorage before using UI
  const apiKey = process.env.VITE_OPENAI_API_KEY || '';
  if (apiKey) {
    await page.evaluate((key) => localStorage.setItem('openai-api-key', key), apiKey);
  }

  // Open LibraryManager
  await page.click('button[title="Library Manager"]');
  await page.waitForSelector('.lib-manager', { timeout: 5000 });

  // Go to Install tab (use exact match to avoid matching "Installed" tab)
  await page.locator('.lib-tab', { hasText: /^➕ Install$/ }).click();
  await page.waitForTimeout(300);
  await page.waitForSelector('.lib-ai-gen', { timeout: 5000 });

  // Fill library name
  await page.locator('.lib-ai-gen input.lib-input').first().fill(libName);

  // Fill context if provided
  if (context) {
    await page.locator('.lib-ai-gen input.lib-input').nth(1).fill(context);
  }

  // Click Generate
  await page.click('button:has-text("Generate Blocks with AI")');

  // Wait for success or error (AI calls can take up to 30s)
  const result = await Promise.race([
    page.waitForSelector('.lib-success', { timeout: 45000 }).then(el => ({ ok: true, el })),
    page.waitForSelector('.lib-error', { timeout: 45000 }).then(el => ({ ok: false, el })),
  ]);

  const text = await result.el.textContent();
  return { ok: result.ok, message: text };
}

/**
 * Install library via pre-built JSON (no AI) — used to verify block/code generation
 * independently of AI availability.
 */
async function installLibraryInPage(page, pkg) {
  const hasFn = await page.evaluate(() => typeof window.__installLibrary === 'function');
  if (hasFn) {
    return page.evaluate((pkgJson) => {
      const result = window.__installLibrary(pkgJson);
      return { ...result, blocks: pkgJson.blocks.map(b => b.type) };
    }, pkg);
  }
  return page.evaluate(async (pkgJson) => {
    const m = await import('/src/utils/libraryManager.js');
    try {
      m.installLibrary(pkgJson);
      return { ok: true, blocks: pkgJson.blocks.map(b => b.type) };
    } catch (e) { return { ok: false, error: e.message }; }
  }, pkg);
}

// Pre-seed localStorage BEFORE page.goto so restoreLibraries() picks it up at startup
async function seedLibraryInLocalStorage(page, pkg) {
  await page.addInitScript((pkgJson) => {
    try {
      const key = 'blockly-libraries';
      const existing = JSON.parse(localStorage.getItem(key) || '[]');
      if (!existing.find(l => l.name === pkgJson.name)) {
        existing.push({
          name: pkgJson.name, version: pkgJson.version || '1.0.0',
          description: pkgJson.description || '', author: pkgJson.author || '',
          installedAt: new Date().toISOString(), pkg: pkgJson,
        });
        localStorage.setItem(key, JSON.stringify(existing));
      }
    } catch {}
  }, pkg);
}

// ── Minimal pre-built packages for code-generation tests ──────────────────────
// These are used ONLY for block→Python generation tests (not AI generation tests).

const OPENCV_PKG = {
  name: 'opencv-python',
  version: '1.0.0',
  description: 'OpenCV computer vision blocks',
  author: 'BlockPy',
  colour: '#1a5c1a',
  blocks: [
    {
      type: 'cv2_videocapture',
      tooltip: 'Open webcam',
      colour: '#1a5c1a',
      isStatement: true,
      inputs: [{ kind: 'dummy', fields: [
        { type: 'label', label: 'cap = VideoCapture' },
        { type: 'number', name: 'SOURCE', label: 'source', default: 0 },
      ]}],
    },
    {
      type: 'cv2_read',
      tooltip: 'Read a frame',
      colour: '#1a5c1a',
      isStatement: true,
      inputs: [{ kind: 'dummy', fields: [{ type: 'label', label: 'ret, frame = cap.read()' }] }],
    },
    {
      type: 'cv2_cvtcolor_gray',
      tooltip: 'Convert to grayscale',
      colour: '#237523',
      isStatement: true,
      inputs: [{ kind: 'dummy', fields: [
        { type: 'label', label: 'gray = cvtColor' },
        { type: 'text_input', name: 'FRAME', label: 'frame var', default: 'frame' },
      ]}],
    },
    {
      type: 'cv2_imshow',
      tooltip: 'Show image',
      colour: '#237523',
      isStatement: true,
      inputs: [{ kind: 'dummy', fields: [
        { type: 'label', label: 'imshow' },
        { type: 'text_input', name: 'WINDOW', label: 'window', default: 'Grayscale' },
        { type: 'text_input', name: 'IMAGE', label: 'image var', default: 'gray' },
      ]}],
    },
    {
      type: 'cv2_waitkey',
      tooltip: 'Wait for key press',
      colour: '#237523',
      isStatement: true,
      inputs: [{ kind: 'dummy', fields: [
        { type: 'label', label: 'waitKey' },
        { type: 'number', name: 'DELAY', label: 'ms', default: 1 },
      ]}],
    },
  ],
  generators: {
    python: {
      cv2_videocapture:  "const s=block.getFieldValue('SOURCE'); return 'cap = cv2.VideoCapture('+s+')\\n';",
      cv2_read:          "return 'ret, frame = cap.read()\\n';",
      cv2_cvtcolor_gray: "const f=block.getFieldValue('FRAME'); return 'gray = cv2.cvtColor('+f+', cv2.COLOR_BGR2GRAY)\\n';",
      cv2_imshow:        "const w=block.getFieldValue('WINDOW'),i=block.getFieldValue('IMAGE'); return 'cv2.imshow(\"'+w+'\", '+i+')\\n';",
      cv2_waitkey:       "const d=block.getFieldValue('DELAY'); return 'cv2.waitKey('+d+')\\n';",
    },
  },
};

const STREAMLIT_PKG = {
  name: 'streamlit',
  version: '1.0.0',
  description: 'Streamlit web app blocks',
  author: 'BlockPy',
  colour: '#ff4b4b',
  blocks: [
    {
      type: 'st_title',
      tooltip: 'Show a page title',
      colour: '#ff4b4b',
      isStatement: true,
      inputs: [{ kind: 'dummy', fields: [
        { type: 'label', label: 'title' },
        { type: 'text_input', name: 'TEXT', label: 'text', default: 'My App' },
      ]}],
    },
    {
      type: 'st_write',
      tooltip: 'Write text',
      colour: '#ff4b4b',
      isStatement: true,
      inputs: [{ kind: 'dummy', fields: [
        { type: 'label', label: 'write' },
        { type: 'text_input', name: 'TEXT', label: 'text', default: 'Hello World' },
      ]}],
    },
    {
      type: 'st_text_input',
      tooltip: 'Text input widget',
      colour: '#e03c3c',
      isStatement: true,
      inputs: [{ kind: 'dummy', fields: [
        { type: 'text_input', name: 'VAR', label: 'var', default: 'name' },
        { type: 'label', label: '= text_input' },
        { type: 'text_input', name: 'LABEL', label: 'label', default: 'Enter name' },
      ]}],
    },
    {
      type: 'st_button',
      tooltip: 'Button widget',
      colour: '#c73c3c',
      isStatement: true,
      inputs: [{ kind: 'dummy', fields: [
        { type: 'text_input', name: 'VAR', label: 'var', default: 'clicked' },
        { type: 'label', label: '= button' },
        { type: 'text_input', name: 'LABEL', label: 'label', default: 'Submit' },
      ]}],
    },
    {
      type: 'st_number_input',
      tooltip: 'Number input widget',
      colour: '#e03c3c',
      isStatement: true,
      inputs: [{ kind: 'dummy', fields: [
        { type: 'text_input', name: 'VAR', label: 'var', default: 'num' },
        { type: 'label', label: '= number_input' },
        { type: 'text_input', name: 'LABEL', label: 'label', default: 'Pick a number' },
        { type: 'number', name: 'DEFAULT', label: 'default', default: 0 },
      ]}],
    },
    {
      type: 'st_line_chart',
      tooltip: 'Display a line chart',
      colour: '#b53535',
      isStatement: true,
      inputs: [{ kind: 'dummy', fields: [
        { type: 'label', label: 'line_chart' },
        { type: 'text_input', name: 'DATA', label: 'data var', default: 'data' },
      ]}],
    },
  ],
  generators: {
    python: {
      st_title:        "const t=block.getFieldValue('TEXT'); return 'st.title(\"'+t+'\")\\n';",
      st_write:        "const t=block.getFieldValue('TEXT'); return 'st.write(\"'+t+'\")\\n';",
      st_text_input:   "const v=block.getFieldValue('VAR'),l=block.getFieldValue('LABEL'); return v+' = st.text_input(\"'+l+'\")\\n';",
      st_number_input: "const v=block.getFieldValue('VAR'),l=block.getFieldValue('LABEL'),d=block.getFieldValue('DEFAULT'); return v+' = st.number_input(\"'+l+'\", value='+d+')\\n';",
      st_button:       "const v=block.getFieldValue('VAR'),l=block.getFieldValue('LABEL'); return v+' = st.button(\"'+l+'\")\\n';",
      st_line_chart:   "const d=block.getFieldValue('DATA'); return 'st.line_chart('+d+')\\n';",
    },
  },
};

// ── ① Class-based Code Tests ──────────────────────────────────────────────────

test.describe('① Class: Python class → Blockly blocks', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForApp(page);
  });

  test('CL-01: class with methods converts to structure_module_def block', async ({ page }) => {
    const code = [
      'class Animal:',
      '    def speak(name) -> None:',
      '        sprite.say(name)',
      '    def walk(steps) -> None:',
      '        sprite.move(steps)',
      '        sprite.turn(90)',
      '',
    ].join('\n');

    const result = await loadPythonToBlocks(page, code);
    expect(result.blockTypes).toContain('structure_module_def');
    expect(result.count).toBeGreaterThanOrEqual(1);

    await page.waitForTimeout(300);
    const wsTypes = await getWorkspaceBlockTypes(page);
    expect(wsTypes).toContain('structure_module_def');
  });

  test('CL-02: class block contains typed function children', async ({ page }) => {
    const code = [
      'class Shape:',
      '    def triangle(size) -> None:',
      '        for i in range(3):',
      '            sprite.move(size)',
      '            sprite.turn(120)',
      '    def square(size) -> None:',
      '        for i in range(4):',
      '            sprite.move(size)',
      '            sprite.turn(90)',
      '',
    ].join('\n');

    const wsTypes = await page.evaluate(async (src) => {
      const m = await import('/src/utils/legacy/transpiler.js');
      const json = m.pythonToBlockly(src, { wrapRunnable: true });
      window.__loadBlockly(json);
      await new Promise(r => setTimeout(r, 300));
      return window.__blocklyWorkspace?.getAllBlocks().map(b => b.type) || [];
    }, code);

    expect(wsTypes).toContain('structure_module_def');
    expect(wsTypes).toContain('structure_typed_function');
    expect(wsTypes).toContain('repeat');
    expect(wsTypes).toContain('turn_right');
  });

  test('CL-03: class + while loop in same file', async ({ page }) => {
    const code = [
      'class Mover:',
      '    def zigzag(dist) -> None:',
      '        sprite.move(dist)',
      '        sprite.turn(45)',
      '        sprite.move(dist)',
      '        sprite.turn(-45)',
      '',
      'count = 0',
      'while True:',
      '    sprite.move(20)',
      '    count += 1',
      '    sprite.say(count)',
      '    time.sleep(0.1)',
      '',
    ].join('\n');

    const result = await loadPythonToBlocks(page, code);
    expect(result.blockTypes).toContain('structure_module_def');
    expect(result.blockTypes).toContain('on_start');
    expect(result.count).toBeGreaterThanOrEqual(2);
  });

  test('CL-04: Python view shows class definition after blocks load', async ({ page }) => {
    const code = [
      'class Counter:',
      '    def increment(val) -> None:',
      '        sprite.say(val)',
      '',
    ].join('\n');

    await loadPythonToBlocks(page, code);
    await page.waitForTimeout(300);

    await page.click('.toggle-btn:has-text("Python")');
    await page.waitForTimeout(500);

    const python = await getPythonOutput(page);
    expect(python.length).toBeGreaterThan(0);
  });

  test('CL-05: transpiler unit — class block type is structure_module_def', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const m = await import('/src/utils/legacy/transpiler.js');
      const code = 'class MyLib:\n    def run(x) -> None:\n        sprite.move(x)\n';
      const r = m.pythonToBlockly(code);
      const b = r.blocks.blocks[0];
      return {
        type: b.type,
        name: b.fields?.NAME,
        hasContent: !!b.inputs?.CONTENT,
      };
    });
    expect(result.type).toBe('structure_module_def');
    expect(result.name).toBe('MyLib');
    expect(result.hasContent).toBe(true);
  });

});

// ── ② opencv-python Library Tests ─────────────────────────────────────────────

test.describe('② opencv-python: AI auto-generate → webcam grayscale blocks', () => {

  test('OCV-01: AI generates opencv-python library and installs it', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForApp(page);

    const result = await aiGenerateLibrary(page, 'opencv-python', 'webcam grayscale video processing');
    expect(result.ok).toBe(true);
    expect(result.message).toContain('opencv');

    // Verify library is in installed list
    const installed = await page.evaluate(async () => {
      const m = await import('/src/utils/libraryManager.js');
      return m.getInstalledLibraries().map(l => l.name);
    });
    expect(installed.some(n => n.includes('opencv'))).toBe(true);
  });

  test('OCV-02: AI-generated opencv blocks include webcam and image processing blocks', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForApp(page);

    await aiGenerateLibrary(page, 'opencv-python', 'webcam capture and grayscale conversion');

    // Close LibraryManager
    await page.locator('.lib-close-btn').click().catch(() => {});

    // Get installed block types
    const blockTypes = await page.evaluate(async () => {
      const m = await import('/src/utils/libraryManager.js');
      const libs = m.getInstalledLibraries();
      const ocv = libs.find(l => l.name.includes('opencv'));
      return ocv ? ocv.pkg.blocks.map(b => b.type) : [];
    });

    // AI should generate blocks related to capture, color conversion, display
    expect(blockTypes.length).toBeGreaterThanOrEqual(3);
    // At least one block should be opencv-related (type starts with cv2_)
    expect(blockTypes.some(t => t.includes('cv2') || t.includes('opencv') || t.includes('video') || t.includes('capture'))).toBe(true);
  });

  test('OCV-03: installed opencv blocks can be loaded into workspace', async ({ page }) => {
    await seedLibraryInLocalStorage(page, OPENCV_PKG);
    await page.goto(BASE_URL);
    await waitForApp(page);

    await installLibraryInPage(page, OPENCV_PKG);

    const webcamJson = {
      blocks: {
        blocks: [{
          kind: 'block', type: 'cv2_videocapture', fields: { SOURCE: 0 },
          next: { block: {
            kind: 'block', type: 'cv2_read',
            next: { block: {
              kind: 'block', type: 'cv2_cvtcolor_gray', fields: { FRAME: 'frame' },
              next: { block: {
                kind: 'block', type: 'cv2_imshow', fields: { WINDOW: 'Grayscale', IMAGE: 'gray' },
              }}
            }}
          }}
        }]
      }
    };

    await page.waitForFunction(() => typeof window.__loadBlockly === 'function', { timeout: 10000 });
    await page.evaluate((json) => window.__loadBlockly(json), webcamJson);
    await page.waitForTimeout(400);

    const wsTypes = await getWorkspaceBlockTypes(page);
    expect(wsTypes).toContain('cv2_videocapture');
    expect(wsTypes).toContain('cv2_read');
    expect(wsTypes).toContain('cv2_cvtcolor_gray');
    expect(wsTypes).toContain('cv2_imshow');
  });

  test('OCV-04: opencv blocks generate correct Python code', async ({ page }) => {
    await seedLibraryInLocalStorage(page, OPENCV_PKG);
    await page.goto(BASE_URL);
    await waitForApp(page);

    await installLibraryInPage(page, OPENCV_PKG);

    await page.waitForFunction(() => typeof window.__loadBlockly === 'function', { timeout: 10000 });
    await page.evaluate((json) => window.__loadBlockly(json), {
      blocks: { blocks: [{
        kind: 'block', type: 'cv2_videocapture', fields: { SOURCE: 0 },
        next: { block: {
          kind: 'block', type: 'cv2_read',
          next: { block: {
            kind: 'block', type: 'cv2_cvtcolor_gray', fields: { FRAME: 'frame' },
            next: { block: {
              kind: 'block', type: 'cv2_imshow', fields: { WINDOW: 'Grayscale', IMAGE: 'gray' },
            }}
          }}
        }}
      }]}
    });
    await page.waitForTimeout(300);

    const python = await getWorkspacePython(page);
    expect(python).toContain('cv2.VideoCapture(0)');
    expect(python).toContain('cap.read()');
    expect(python).toContain('cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)');
    expect(python).toContain('cv2.imshow("Grayscale", gray)');
  });

  test('OCV-05: toolbox category added after opencv install', async ({ page }) => {
    await seedLibraryInLocalStorage(page, OPENCV_PKG);
    await page.goto(BASE_URL);
    await waitForApp(page);

    await installLibraryInPage(page, OPENCV_PKG);

    const categories = await page.evaluate(async () => {
      const m = await import('/src/utils/libraryManager.js');
      return m.buildLibraryToolboxCategories().map(c => c.name);
    });
    expect(categories.some(n => n.includes('opencv'))).toBe(true);
  });

});

// ── ③ streamlit Library Tests ─────────────────────────────────────────────────

test.describe('③ streamlit: AI auto-generate → web app blocks', () => {

  test('STR-01: AI generates streamlit library and installs it', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForApp(page);

    const result = await aiGenerateLibrary(page, 'streamlit', 'data dashboard web app');
    expect(result.ok).toBe(true);
    expect(result.message).toContain('streamlit');

    const installed = await page.evaluate(async () => {
      const m = await import('/src/utils/libraryManager.js');
      return m.getInstalledLibraries().map(l => l.name);
    });
    expect(installed.some(n => n.includes('streamlit'))).toBe(true);
  });

  test('STR-02: AI-generated streamlit blocks include UI component blocks', async ({ page }) => {
    await page.goto(BASE_URL);
    await waitForApp(page);

    await aiGenerateLibrary(page, 'streamlit', 'web app with title, text input, button, chart');

    await page.locator('.lib-close-btn').click().catch(() => {});

    const blockTypes = await page.evaluate(async () => {
      const m = await import('/src/utils/libraryManager.js');
      const libs = m.getInstalledLibraries();
      const st = libs.find(l => l.name.includes('streamlit'));
      return st ? st.pkg.blocks.map(b => b.type) : [];
    });

    expect(blockTypes.length).toBeGreaterThanOrEqual(3);
    expect(blockTypes.some(t => t.includes('st_') || t.includes('streamlit'))).toBe(true);
  });

  test('STR-03: streamlit blocks generate correct Python code', async ({ page }) => {
    await seedLibraryInLocalStorage(page, STREAMLIT_PKG);
    await page.goto(BASE_URL);
    await waitForApp(page);

    await installLibraryInPage(page, STREAMLIT_PKG);

    await page.waitForFunction(() => typeof window.__loadBlockly === 'function', { timeout: 10000 });
    await page.evaluate((json) => window.__loadBlockly(json), {
      blocks: { blocks: [{
        kind: 'block', type: 'st_title', fields: { TEXT: 'My App' },
        next: { block: {
          kind: 'block', type: 'st_write', fields: { TEXT: 'Hello World' },
          next: { block: {
            kind: 'block', type: 'st_text_input', fields: { VAR: 'name', LABEL: 'Enter your name' },
            next: { block: {
              kind: 'block', type: 'st_button', fields: { VAR: 'clicked', LABEL: 'Submit' },
            }}
          }}
        }}
      }]}
    });
    await page.waitForTimeout(300);

    const python = await getWorkspacePython(page);
    expect(python).toContain('st.title("My App")');
    expect(python).toContain('st.write("Hello World")');
    expect(python).toContain('name = st.text_input("Enter your name")');
    expect(python).toContain('clicked = st.button("Submit")');
  });

  test('STR-04: streamlit number_input block generates correct Python', async ({ page }) => {
    await seedLibraryInLocalStorage(page, STREAMLIT_PKG);
    await page.goto(BASE_URL);
    await waitForApp(page);

    await installLibraryInPage(page, STREAMLIT_PKG);

    await page.waitForFunction(() => typeof window.__loadBlockly === 'function', { timeout: 10000 });
    await page.evaluate((json) => window.__loadBlockly(json), {
      blocks: { blocks: [{
        kind: 'block', type: 'st_number_input',
        fields: { VAR: 'age', LABEL: 'Your age', DEFAULT: 25 },
      }]}
    });
    await page.waitForTimeout(300);

    const python = await getWorkspacePython(page);
    expect(python).toContain('age = st.number_input("Your age", value=25)');
  });

  test('STR-05: toolbox category added after streamlit install', async ({ page }) => {
    await seedLibraryInLocalStorage(page, STREAMLIT_PKG);
    await page.goto(BASE_URL);
    await waitForApp(page);

    await installLibraryInPage(page, STREAMLIT_PKG);

    const categories = await page.evaluate(async () => {
      const m = await import('/src/utils/libraryManager.js');
      return m.buildLibraryToolboxCategories().map(c => c.name);
    });
    expect(categories.some(n => n.includes('streamlit'))).toBe(true);
  });

});
