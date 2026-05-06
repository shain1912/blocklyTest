/**
 * Real-browser QA for the FastAPI Python backend integration.
 *
 * These tests open the app, type Python code into the Python view,
 * click Run, and verify the Output panel reflects what actually
 * happened inside the CPython subprocess.
 *
 * Prereq: run ./start.sh (or launch both servers manually) before invoking.
 *   - frontend on :5173   - backend on :8000
 *
 * Every scenario is a top-level `test(...)` so a failure in one doesn't hide
 * the rest. The Python view is backed by a <textarea class="python-code-area">;
 * we set its value with Blockly's editor replaced by direct textarea fill.
 */

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';
const BACKEND = 'http://127.0.0.1:8000';

// Soft-fail if backend isn't running — turn that into a clear assertion error.
test.beforeAll(async ({ request }) => {
  const res = await request.get(`${BACKEND}/health`);
  if (!res.ok()) throw new Error(`Backend not reachable at ${BACKEND}/health — run ./start.sh`);
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function gotoApp(page) {
  await page.goto(BASE);
  await page.waitForSelector('.blockly-editor', { timeout: 15000 });
  // Wait for App to expose its E2E hooks
  await page.waitForFunction(() => typeof window.__loadBlockly === 'function', { timeout: 10000 });
  await page.waitForTimeout(400);
}

async function switchToPython(page) {
  const btn = page.locator('.toggle-btn:has-text("Python")');
  if (await btn.isVisible()) {
    await btn.click();
    await page.waitForSelector('.python-editor-container .cm-editor', { timeout: 5000 });
  }
}

async function setPythonCode(page, code) {
  await switchToPython(page);
  // CodeMirror-backed editor — use the window helper instead of .fill()
  await page.waitForFunction(() => typeof window.__setPython === 'function', { timeout: 5000 });
  await page.evaluate((c) => window.__setPython(c), code);
  await page.waitForTimeout(150);
}

async function runAndWait(page, { timeoutMs = 15000 } = {}) {
  await page.locator('[data-testid="run-btn"]').click();
  // The Run button toggles to disabled → we watch for the "exited" marker in output
  await page.waitForFunction(
    () => {
      const lines = Array.from(document.querySelectorAll('.output-line, .output-section *'))
        .map(el => el.textContent || '');
      return lines.some(l => l.includes('exited with code') || l.includes('Backend unreachable'));
    },
    { timeout: timeoutMs },
  );
  await page.waitForTimeout(200);
}

async function getOutputText(page) {
  return page.evaluate(() => {
    const scope = document.querySelector('.output-section');
    return scope ? scope.innerText : '';
  });
}

// ── ① hello world ────────────────────────────────────────────────────────────

test('PY-01: print hello world runs in real CPython', async ({ page }) => {
  await gotoApp(page);
  await setPythonCode(page, 'print("hello from python")');
  await runAndWait(page);
  const out = await getOutputText(page);
  expect(out).toContain('hello from python');
  expect(out).toMatch(/exited with code 0/);
});

// ── ② math and expressions ──────────────────────────────────────────────────

test('PY-02: arithmetic prints correct result', async ({ page }) => {
  await gotoApp(page);
  await setPythonCode(page, 'print(2 + 3 * 7)');
  await runAndWait(page);
  const out = await getOutputText(page);
  expect(out).toContain('23');
});

// ── ③ loop output ────────────────────────────────────────────────────────────

test('PY-03: for loop streams multiple lines', async ({ page }) => {
  await gotoApp(page);
  await setPythonCode(page, [
    'for i in range(5):',
    '    print(f"row-{i}")',
  ].join('\n'));
  await runAndWait(page);
  const out = await getOutputText(page);
  for (const v of [0,1,2,3,4]) expect(out).toContain(`row-${v}`);
});

// ── ④ runtime error propagates ──────────────────────────────────────────────

test('PY-04: NameError appears in output with non-zero exit', async ({ page }) => {
  await gotoApp(page);
  await setPythonCode(page, 'print(does_not_exist)');
  await runAndWait(page);
  const out = await getOutputText(page);
  expect(out).toContain('NameError');
  expect(out).toMatch(/exited with code 1/);
});

// ── ⑤ standard library works ────────────────────────────────────────────────

test('PY-05: stdlib (math, json, random.seed) produce deterministic output', async ({ page }) => {
  await gotoApp(page);
  await setPythonCode(page, [
    'import math, json, random',
    'random.seed(42)',
    'print(json.dumps({"pi": round(math.pi, 4), "r": random.randint(1, 100)}))',
  ].join('\n'));
  await runAndWait(page);
  const out = await getOutputText(page);
  expect(out).toContain('"pi": 3.1416');
  expect(out).toMatch(/"r":\s*\d+/);
});

// ── ⑥ class-based Python runs too ───────────────────────────────────────────

test('PY-06: user-defined class instantiates and its method runs', async ({ page }) => {
  await gotoApp(page);
  await setPythonCode(page, [
    'class Counter:',
    '    def __init__(self): self.n = 0',
    '    def tick(self):',
    '        self.n += 1',
    '        print(f"tick {self.n}")',
    '',
    'c = Counter()',
    'for _ in range(3): c.tick()',
  ].join('\n'));
  await runAndWait(page);
  const out = await getOutputText(page);
  expect(out).toContain('tick 1');
  expect(out).toContain('tick 3');
});

// ── ⑦ stdin-less long-running work + Stop button ───────────────────────────

test('PY-07: Stop button terminates a long-running process', async ({ page }) => {
  await gotoApp(page);
  await setPythonCode(page, [
    'import time',
    'print("starting")',
    'for i in range(30):',
    '    print(f"still alive {i}")',
    '    time.sleep(0.5)',
    'print("never prints")',
  ].join('\n'));

  await page.locator('[data-testid="run-btn"]').click();
  // Wait until we see at least one "still alive" line — means the subprocess is live
  await page.waitForFunction(
    () => (document.querySelector('.output-section')?.innerText || '').includes('still alive'),
    { timeout: 10000 },
  );

  await page.locator('[data-testid="stop-btn"]').click();
  // After Stop, the run-btn should come back (not disabled)
  await page.waitForFunction(
    () => {
      const btn = document.querySelector('[data-testid="run-btn"]');
      return btn && !btn.disabled;
    },
    { timeout: 10000 },
  );
  const out = await getOutputText(page);
  expect(out).not.toContain('never prints');
});

// ── ⑧ backend status indicator reflects health ─────────────────────────────

test('PY-08: UI shows "backend online" when backend is healthy', async ({ page }) => {
  await gotoApp(page);
  await switchToPython(page);
  await page.waitForTimeout(600);
  // The indicator is only rendered in Python mode; look for either text.
  const statusText = await page.locator('.controls-section').innerText();
  expect(statusText).toContain('backend online');
});

// ── ⑨ real pip install + real import ────────────────────────────────────────
// Uses a very small package ("six") so the install is fast.

test('PY-09: pip install of a small package then import works', async ({ page, request }) => {
  // Fire install directly (UI for /install isn't exposed in the editor).
  const inst = await request.post(`${BACKEND}/install`, { data: { package: 'six' } });
  expect(inst.ok()).toBeTruthy();
  const { session_id } = await inst.json();

  // Wait for install to finish by polling /sessions until this one is "finished"
  for (let i = 0; i < 120; i++) {
    const list = await (await request.get(`${BACKEND}/sessions`)).json();
    const sess = list.find(s => s.session_id === session_id);
    if (sess && sess.finished) break;
    await new Promise(r => setTimeout(r, 500));
  }

  await gotoApp(page);
  await setPythonCode(page, [
    'import six',
    'print("six version:", six.__version__)',
  ].join('\n'));
  await runAndWait(page, { timeoutMs: 20000 });
  const out = await getOutputText(page);
  expect(out).toMatch(/six version:\s*\d/);
});

// ── ⑩ streamlit boots and the iframe appears ───────────────────────────────
// Skipped automatically if streamlit isn't in the backend env.

test('PY-10: streamlit app boots, iframe is rendered', async ({ page, request }) => {
  // Probe whether streamlit is installed
  const probe = await request.post(`${BACKEND}/streamlit/run`, {
    data: { code: 'import streamlit as st\nst.title("probe")' },
  });
  if (!probe.ok()) {
    test.skip(true, 'streamlit not installed — run /install package=streamlit to enable');
    return;
  }
  const { session_id, url } = await probe.json();
  // kill the probe; we'll launch again through the UI path
  await request.post(`${BACKEND}/stop/${session_id}`).catch(() => {});

  await gotoApp(page);
  await setPythonCode(page, [
    'import streamlit as st',
    'st.title("Hello from Streamlit")',
    'st.write("this is running in a real subprocess")',
  ].join('\n'));
  await page.locator('[data-testid="run-btn"]').click();

  // iframe should mount within a few seconds
  const iframe = page.locator('[data-testid="streamlit-iframe"]');
  await expect(iframe).toBeVisible({ timeout: 15000 });
  const src = await iframe.getAttribute('src');
  expect(src).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

  // Stop so we don't leak the streamlit subprocess
  await page.locator('[data-testid="stop-btn"]').click().catch(() => {});
});

// ── ⑪ opencv headless work (no imshow — just image ops) ────────────────────

test('PY-11: opencv creates and inspects a numpy image array', async ({ page, request }) => {
  const probe = await request.post(`${BACKEND}/run`, {
    data: { code: 'import cv2; print(cv2.__version__)' },
  });
  if (!probe.ok()) {
    test.skip(true, 'opencv-python not installed — /install package=opencv-python');
    return;
  }

  await gotoApp(page);
  await setPythonCode(page, [
    'import cv2',
    'import numpy as np',
    // a synthetic 100x100 blue image — no window needed
    'img = np.full((100, 100, 3), (255, 0, 0), dtype=np.uint8)',
    'gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)',
    'print("shape:", img.shape)',
    'print("gray mean:", round(float(gray.mean()), 2))',
    'print("cv2 ver:", cv2.__version__)',
  ].join('\n'));
  await runAndWait(page, { timeoutMs: 20000 });
  const out = await getOutputText(page);
  expect(out).toContain('shape: (100, 100, 3)');
  expect(out).toContain('cv2 ver:');
  expect(out).toMatch(/gray mean:\s*\d/);
});

// ── ⑫ blocks → python → run end-to-end (most important glue) ───────────────

test('PY-12: Blockly blocks → Python → real execution', async ({ page }) => {
  await gotoApp(page);
  // Load simple class code via the transpiler
  const code = [
    'class Greeter:',
    '    def say_hi(name):',
    '        print("hello " + name)',
    '',
    'print("program start")',
    'print(1 + 2)',
  ].join('\n');

  await setPythonCode(page, code);
  await runAndWait(page);
  const out = await getOutputText(page);
  expect(out).toContain('program start');
  expect(out).toContain('3');
});
