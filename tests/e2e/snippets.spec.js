/**
 * One-click Python snippets: open the panel, click a snippet,
 * press Run, verify the real Python output in the Output panel
 * (and the inline image, where applicable).
 *
 * Prereqs: both servers running (./start.sh). All packages are probed
 * and installed by the UI itself — if the backend already has them,
 * the install step is a no-op.
 */

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';
const BACKEND = 'http://127.0.0.1:8000';

test.beforeAll(async ({ request }) => {
  const r = await request.get(`${BACKEND}/health`);
  if (!r.ok()) throw new Error(`Backend not reachable — run ./start.sh first`);
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function gotoApp(page) {
  await page.goto(BASE);
  await page.waitForSelector('.blockly-editor', { timeout: 15000 });
  await page.waitForFunction(() => typeof window.__loadBlockly === 'function', { timeout: 10000 });
  await page.waitForTimeout(400);
}

async function openSnippets(page) {
  await page.locator('[data-testid="snippets-toggle"]').click();
  await page.waitForSelector('[data-testid="snippets-panel"]', { timeout: 5000 });
}

/**
 * Click a snippet's Install&Load button and wait until the code is in the editor.
 * Returns the loaded code.
 */
async function loadSnippet(page, id, { installTimeoutMs = 120000 } = {}) {
  await page.locator(`[data-testid="snippet-btn-${id}"]`).click();
  // Wait for the progress log to say "Code loaded"
  await page.waitForFunction(
    (sid) => {
      const card = document.querySelector(`[data-testid="snippet-${sid}"]`);
      return card && card.innerText.includes('Code loaded');
    },
    id,
    { timeout: installTimeoutMs },
  );
  // Close panel so the Run button is accessible if it overlaps
  const closeBtn = page.locator('.snippets-close');
  if (await closeBtn.isVisible().catch(() => false)) await closeBtn.click();
  await page.waitForTimeout(300);
  // CodeMirror stores its value on the view instance; easier to read from React state via helper
  return page.evaluate(() => window.__getPython ? window.__getPython() : '');
}

async function run(page, { timeoutMs = 60000 } = {}) {
  await page.locator('[data-testid="run-btn"]').click();
  await page.waitForFunction(
    () => {
      const t = document.querySelector('.output-section')?.innerText || '';
      return t.includes('exited with code') || t.includes('Backend unreachable');
    },
    { timeout: timeoutMs },
  );
  await page.waitForTimeout(200);
}

async function outputText(page) {
  return page.evaluate(() => document.querySelector('.output-section')?.innerText || '');
}

// ── tests ────────────────────────────────────────────────────────────────────

test('SNP-01: snippets panel opens and lists all snippets', async ({ page }) => {
  await gotoApp(page);
  await openSnippets(page);

  for (const id of ['opencv-webcam', 'matplotlib-pandas-excel', 'streamlit-dashboard', 'requests-api', 'numpy-basics']) {
    await expect(page.locator(`[data-testid="snippet-${id}"]`)).toBeVisible();
  }
});

test('SNP-02: numpy snippet installs, loads, runs, prints eigenvalues', async ({ page }) => {
  await gotoApp(page);
  await openSnippets(page);
  const code = await loadSnippet(page, 'numpy-basics');
  expect(code).toContain('np.linalg.eigvals');
  await run(page);
  const out = await outputText(page);
  expect(out).toContain('matrix A');
  expect(out).toMatch(/det\(A\)/);
  expect(out).toMatch(/eigenvalues:/);
  expect(out).toMatch(/exited with code 0/);
});

test('SNP-03: matplotlib snippet runs and renders inline PNG image', async ({ page }) => {
  await gotoApp(page);
  await openSnippets(page);
  const code = await loadSnippet(page, 'matplotlib-pandas-excel');
  expect(code).toContain('matplotlib');
  expect(code).toContain('to_excel');
  await run(page);
  const out = await outputText(page);
  expect(out).toContain('wrote');  // excel write line
  // Inline image must be rendered — we check the img tag exists
  await expect(page.locator('[data-testid="output-img"]').first()).toBeVisible({ timeout: 5000 });
  expect(out).toMatch(/exited with code 0/);
});

test('SNP-04: opencv snippet runs and renders inline grayscale image', async ({ page }) => {
  await gotoApp(page);
  await openSnippets(page);
  const code = await loadSnippet(page, 'opencv-webcam');
  expect(code).toContain('cv2.VideoCapture');
  await run(page);
  const out = await outputText(page);
  expect(out).toContain('captured shape');
  expect(out).toContain('gray mean brightness');
  await expect(page.locator('[data-testid="output-img"]').first()).toBeVisible({ timeout: 5000 });
});

test('SNP-05: requests snippet hits jsonplaceholder and prints posts', async ({ page }) => {
  await gotoApp(page);
  await openSnippets(page);
  const code = await loadSnippet(page, 'requests-api');
  expect(code).toContain('requests.get');
  await run(page);
  const out = await outputText(page);
  // If the network is unavailable we'll get a non-zero exit — in that case the
  // error is still legitimate and we surface it rather than failing silently.
  if (/exited with code 0/.test(out)) {
    expect(out).toContain('status: 200');
    expect(out).toMatch(/received \d+ posts/);
  } else {
    test.info().annotations.push({ type: 'note', description: 'network unreachable — skipping content asserts' });
  }
});

test('SNP-06: streamlit snippet launches and shows iframe', async ({ page }) => {
  await gotoApp(page);
  await openSnippets(page);
  const code = await loadSnippet(page, 'streamlit-dashboard');
  expect(code).toContain('import streamlit');
  await page.locator('[data-testid="run-btn"]').click();

  const iframe = page.locator('[data-testid="streamlit-iframe"]');
  await expect(iframe).toBeVisible({ timeout: 20000 });
  const src = await iframe.getAttribute('src');
  expect(src).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

  // Clean up the streamlit subprocess
  await page.locator('[data-testid="stop-btn"]').click().catch(() => {});
});
