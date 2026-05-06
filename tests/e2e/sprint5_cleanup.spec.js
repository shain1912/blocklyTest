/**
 * Sprint 5 — single canonical path + degraded-mode UX.
 *
 * Acceptance checks:
 *   (1) transpiler.js / ast.js moved to src/utils/legacy/ (not the canonical path).
 *   (2) Anyone importing them does so via the legacy/ path (grep).
 *   (3) Backend-down run shows the "degraded mode" banner.
 *   (4) Backend-up run hides the banner.
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

const BASE = 'http://localhost:5173';
const BACKEND = 'http://127.0.0.1:8000';

test('S5-01: legacy transpiler.js and ast.js live under src/utils/legacy/', async () => {
  expect(fs.existsSync('src/utils/legacy/transpiler.js')).toBe(true);
  expect(fs.existsSync('src/utils/legacy/ast.js')).toBe(true);
  expect(fs.existsSync('src/utils/transpiler.js')).toBe(false);
  expect(fs.existsSync('src/utils/ast.js')).toBe(false);
});

test('S5-02: no production code imports the non-legacy transpiler path', async () => {
  const bad = execSync(
    `grep -RHn "from '\\./utils/transpiler'\\|from '\\.\\./utils/transpiler'\\|from '\\./utils/ast'\\|from '\\.\\./utils/ast'" src 2>/dev/null || true`,
    { encoding: 'utf8' },
  ).trim();
  expect(bad, `must go through legacy/, found: ${bad}`).toBe('');
});

test('S5-03: backend online → no degraded-mode banner', async ({ page, request }) => {
  // Prerequisite: backend is actually up for this test.
  const r = await request.get(`${BACKEND}/health`);
  test.skip(!r.ok(), 'backend not running — skip this half');
  await page.goto(BASE);
  await page.waitForSelector('.blockly-editor', { timeout: 15000 });
  await page.waitForTimeout(800);
  const banner = page.locator('[data-testid="degraded-mode-banner"]');
  await expect(banner).toHaveCount(0);
});

test('S5-04: backend unreachable → degraded-mode banner is visible', async ({ browser }) => {
  // Open a fresh context where /health is intercepted and forced to fail.
  const ctx = await browser.newContext();
  await ctx.route('http://127.0.0.1:8000/**', r => r.abort());
  const page = await ctx.newPage();
  await page.goto(BASE);
  await page.waitForSelector('.blockly-editor', { timeout: 15000 });
  await page.waitForTimeout(1200);
  await expect(page.locator('[data-testid="degraded-mode-banner"]')).toBeVisible();
  await ctx.close();
});
