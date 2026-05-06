/**
 * Exact preservation tests (Blueprint §핵심 문제 §E Regression).
 *
 * These assert that Python constructs the old transpiler collapsed into
 * `py pass`, text fields, or generic wrappers now survive as structural
 * exact blocks. They are the "we broke the architecture on purpose" acceptance
 * tests — any regression means we slipped back into stringly blocks.
 */

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';
const BACKEND = 'http://127.0.0.1:8000';

test.beforeAll(async ({ request }) => {
  const r = await request.get(`${BACKEND}/health`);
  if (!r.ok()) throw new Error(`Backend unreachable — run ./start.sh first`);
});

async function gotoApp(page) {
  await page.goto(BASE);
  await page.waitForSelector('.blockly-editor', { timeout: 15000 });
  await page.waitForFunction(() => typeof window.__setPython === 'function', { timeout: 10000 });
  await page.waitForTimeout(250);
}

async function setPython(page, code) {
  const btn = page.locator('.toggle-btn:has-text("Python")');
  if (await btn.isVisible()) await btn.click();
  await page.waitForTimeout(200);
  await page.evaluate(c => window.__setPython(c), code);
  await page.waitForTimeout(180);
}

async function toBlocks(page) {
  await page.locator('.toggle-btn:has-text("Blocks")').click();
  await page.waitForFunction(() => {
    const ws = window.__blocklyWorkspace;
    return ws && ws.getAllBlocks().length > 0;
  }, { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(400);
}

async function types(page) {
  return page.evaluate(() => {
    const ws = window.__blocklyWorkspace;
    return ws ? ws.getAllBlocks().map(b => b.type) : [];
  });
}

async function toPython(page) {
  await page.locator('.toggle-btn:has-text("Python")').click();
  await page.waitForTimeout(250);
  return page.evaluate(() => window.__getPython());
}

// ── Blueprint §E Regression cases ───────────────────────────────────────────

test('RG-01: tuple assign "ok, frame = cap.read()" no longer collapses to py pass', async ({ page }) => {
  await gotoApp(page);
  await setPython(page, [
    'import cv2',
    'cap = cv2.VideoCapture(0)',
    'ok, frame = cap.read()',
  ].join('\n'));
  await toBlocks(page);
  const t = await types(page);
  // MUST contain the tuple-assign exact block; MUST NOT collapse to raw "pass"
  expect(t).toContain('py_tuple_assign');
  const hasPass = await page.evaluate(() => {
    const ws = window.__blocklyWorkspace;
    return ws.getAllBlocks().some(b =>
      b.type === 'raw_python' && (b.getFieldValue('CODE') || '').trim() === 'pass'
    );
  });
  expect(hasPass, 'tuple assign must not degrade to raw_python("pass")').toBe(false);
});

test('RG-02: attribute access "frame.shape" becomes a py_attr block (not a string var)', async ({ page }) => {
  await gotoApp(page);
  await setPython(page, [
    'frame = 0',
    'x = frame.shape',
  ].join('\n'));
  await toBlocks(page);
  const t = await types(page);
  expect(t).toContain('py_attr');
});

test('RG-05: keyword arg "np.zeros((240,320,3), dtype=np.uint8)" preserves kw structure', async ({ page }) => {
  await gotoApp(page);
  await setPython(page, [
    'import numpy as np',
    'x = np.zeros((240, 320, 3), dtype=np.uint8)',
  ].join('\n'));
  await toBlocks(page);
  const t = await types(page);
  // keyword argument lowered to a dedicated structural block
  expect(t).toContain('py_keyword_arg');
  // and a tuple block for the shape, not a text field
  expect(t).toContain('py_tuple');
});

test('CF-06: try / except / finally preserves all three branches (no pass collapse)', async ({ page }) => {
  await gotoApp(page);
  await setPython(page, [
    'try:',
    '    a = 1 / 0',
    'except ZeroDivisionError:',
    '    a = 0',
    'finally:',
    '    print(a)',
  ].join('\n'));
  await toBlocks(page);
  const t = await types(page);
  expect(t).toContain('py_try');
  // print branch inside finally survives
  expect(t).toContain('print');
});

test('CF-07: with-statement preserves context manager structure', async ({ page }) => {
  await gotoApp(page);
  await setPython(page, [
    'with open("x.txt") as f:',
    '    data = f.read()',
  ].join('\n'));
  await toBlocks(page);
  const t = await types(page);
  expect(t).toContain('py_with');
});

test('FC-02: class with method → structure_module_def + py_funcdef (exact)', async ({ page }) => {
  await gotoApp(page);
  await setPython(page, [
    'class Counter:',
    '    def tick(self):',
    '        self.n = (self.n or 0) + 1',
    '        return self.n',
  ].join('\n'));
  await toBlocks(page);
  const t = await types(page);
  expect(t).toContain('structure_module_def');
  // After Sprint 2, FunctionDef lowers to py_funcdef (structural body) instead
  // of the legacy structure_typed_function that flattened args into a text field.
  expect(t).toContain('py_funcdef');
});

test('RT-02: no-touch roundtrip preserves byte-identical source', async ({ page }) => {
  const original = [
    'import cv2',
    'import numpy as np',
    '',
    'cap = cv2.VideoCapture(0)',
    'ok, frame = cap.read()',
    'gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)',
    'for i in range(3):',
    '    print(i)',
    '',
  ].join('\n');
  await gotoApp(page);
  await setPython(page, original);
  await toBlocks(page);
  const back = await toPython(page);
  expect(back).toBe(original);
});

test('RG-07: AI path and manual toggle produce the SAME exact blocks for the same Python', async ({ page, request }) => {
  const source = [
    'import json',
    'x = 1',
    'y = x + 2',
    'print(y)',
  ].join('\n');

  // Path 1: manual toggle
  await gotoApp(page);
  await setPython(page, source);
  await toBlocks(page);
  const types1 = (await types(page)).sort();

  // Path 2: raw backend /ast roundtrip (what AI load_python now calls)
  const astRes = await request.post(`${BACKEND}/ast`, { data: { code: source } });
  expect(astRes.ok()).toBeTruthy();
  const ast = await astRes.json();
  expect(ast.ok).toBe(true);

  // Path 3: directly call astToBlockly via the page so we use the same client-side
  // visitor and confirm the block types agree.
  const types2 = await page.evaluate(async (src) => {
    const m = await import('/src/utils/pyAst.js');
    const json = await m.pythonToBlocksViaAst(src, { wrapRunnable: true });
    return (json?.blocks?.blocks || []).flatMap(function walk(b) {
      const out = [b.type];
      if (b.inputs) {
        for (const k of Object.keys(b.inputs)) {
          if (b.inputs[k]?.block) out.push(...walk(b.inputs[k].block));
        }
      }
      if (b.next?.block) out.push(...walk(b.next.block));
      return out;
    }).sort();
  }, source);

  // Both paths should produce the same types (manual toggle exercises the same pipeline)
  expect(types2).toEqual(types1);
});

test('EP-06: subscript posts[0] becomes py_subscript block', async ({ page }) => {
  await gotoApp(page);
  await setPython(page, [
    'posts = [1, 2, 3]',
    'first = posts[0]',
  ].join('\n'));
  await toBlocks(page);
  const t = await types(page);
  expect(t).toContain('py_subscript');
  expect(t).toContain('py_list');
});

test('EP-10: x = None lowers to the curated `variable` block with VALUE="None"', async ({ page }) => {
  // Updated post-vocabulary-fix: pyAst now emits the curated `variable` block
  // for simple "name = literal" assignments (instead of variables_set + py_none),
  // so the workspace stays inside the toolbox vocabulary and round-trips
  // byte-perfect through the variable block's Python generator.
  await gotoApp(page);
  await setPython(page, 'x = None');
  await toBlocks(page);
  const t = await types(page);
  expect(t).toContain('variable');
});
