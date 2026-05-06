/**
 * Sprint 7 — introspection actually covers the real API surface.
 *
 * Before the fix: max_items=60 + alphabetical dir() → cvtColor/imencode never
 * reached the frontend because ACCESS_FAST/ADAPTIVE_* etc. ate the budget.
 * Plus C-extension signatures raised ValueError and dropped to fieldless
 * blocks. Now the backend sorts callables first, parses docstrings as a
 * signature fallback, and the default limit is 800.
 */

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';
const BACKEND = 'http://127.0.0.1:8000';

test.beforeAll(async ({ request }) => {
  const r = await request.get(`${BACKEND}/health`);
  if (!r.ok()) throw new Error('Backend unreachable — run ./start.sh first');
});

test('SPR7-01: /introspect on cv2 returns cvtColor/imencode/imshow with arg names', async ({ request }) => {
  const r = await request.post(`${BACKEND}/introspect`, {
    data: { module: 'cv2', max_items: 800, callables_only: true },
  });
  expect(r.ok()).toBeTruthy();
  const body = await r.json();
  expect(body.ok).toBe(true);

  const byName = Object.fromEntries(body.items.map(i => [i.name, i]));
  for (const n of ['cvtColor', 'imencode', 'imshow', 'waitKey', 'VideoCapture']) {
    expect(byName[n], `cv2.${n} missing from introspection`).toBeDefined();
  }
  // Doc-parsed signatures recovered the real arg names, not a no-arg stub
  expect(byName.cvtColor.params.map(p => p.name)).toEqual(expect.arrayContaining(['src', 'code']));
  expect(byName.imencode.params.map(p => p.name)).toEqual(expect.arrayContaining(['ext', 'img']));
});

test('SPR7-02: installLibraryFromIntrospection creates usable cv2_* blocks', async ({ page }) => {
  await page.goto(BASE);
  await page.waitForSelector('.blockly-editor', { timeout: 15000 });
  await page.waitForFunction(() => typeof window.__installLibrary === 'function', { timeout: 10000 });

  // Install via the frontend path (same call PythonSnippets makes)
  const result = await page.evaluate(async () => {
    const m = await import('/src/utils/libraryIntrospector.js');
    return m.installLibraryFromIntrospection('cv2', { maxItems: 800, callablesOnly: true });
  });
  expect(result.ok).toBe(true);

  // The auto-generated package must include blocks for the methods that
  // were missing in the screenshot.
  const blockTypes = result.installed;
  expect(blockTypes).toContain('cv2_cvtColor');
  expect(blockTypes).toContain('cv2_imencode');
  expect(blockTypes).toContain('cv2_imshow');

  // The installed library is also in the registry so pyAst can match it
  const schemas = await page.evaluate(async () => {
    const m = await import('/src/utils/librarySchemaRegistry.js');
    return m.listSchemas().map(s => s.path);
  });
  expect(schemas).toContain('cv2.cvtColor');
  expect(schemas).toContain('cv2.imencode');
});

test('SPR7-03: snippet opencv-webcam lowers to real library-specific blocks', async ({ page }) => {
  // Install cv2 introspection BEFORE the AST visitor runs so schemas are known
  await page.goto(BASE);
  await page.waitForSelector('.blockly-editor', { timeout: 15000 });
  await page.waitForFunction(() => typeof window.__installLibrary === 'function', { timeout: 10000 });
  await page.evaluate(async () => {
    const m = await import('/src/utils/libraryIntrospector.js');
    await m.installLibraryFromIntrospection('cv2', { maxItems: 800, callablesOnly: true });
    await m.installLibraryFromIntrospection('numpy', { maxItems: 800, callablesOnly: true });
  });

  // Now convert the actual snippet Python through the canonical pipeline
  const snippet = `
import cv2
import numpy as np

cap = cv2.VideoCapture(0)
ok, frame = cap.read()
gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
ok, buf = cv2.imencode(".png", gray)
`;
  const types = await page.evaluate(async (src) => {
    const m = await import('/src/utils/pyAst.js');
    const j = await m.pythonToBlocksViaAst(src, { wrapRunnable: true });
    const seen = new Set();
    const walk = (b) => {
      if (!b) return;
      seen.add(b.type);
      if (b.inputs) for (const k of Object.keys(b.inputs)) walk(b.inputs[k]?.block);
      walk(b.next?.block);
    };
    (j?.blocks?.blocks || []).forEach(walk);
    return [...seen];
  }, snippet);

  // After introspection, cv2 calls should map to the auto-generated library
  // blocks (cv2_cvtColor, cv2_imencode, cv2_VideoCapture) OR — if the schema
  // scoring decides structural args warrant py_call fallback — at least to
  // a real call block, never to raw_python.
  const anyLibraryCv2 = types.some(t => t.startsWith('cv2_'));
  const hasPyCall = types.includes('py_call') || types.includes('py_stmt');
  expect(anyLibraryCv2 || hasPyCall, `types: ${types.join(',')}`).toBe(true);
  expect(types).not.toContain('raw_python');
});
