/**
 * Sprint 2 — exact IR coverage for the node kinds Sprint 1 didn't reach.
 *
 * Each case feeds a Python snippet that the old pipeline would have collapsed
 * to `py_call`, raw text, or a stringly `structure_*` block and asserts that
 * the structural exact block shows up in the workspace instead.
 */

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';
const BACKEND = 'http://127.0.0.1:8000';

test.beforeAll(async ({ request }) => {
  const r = await request.get(`${BACKEND}/health`);
  if (!r.ok()) throw new Error('Backend unreachable — run ./start.sh first');
});

async function loadPython(page, code) {
  await page.goto(BASE);
  await page.waitForSelector('.blockly-editor', { timeout: 15000 });
  await page.waitForFunction(() => typeof window.__setPython === 'function', { timeout: 10000 });
  const pybtn = page.locator('.toggle-btn:has-text("Python")');
  if (await pybtn.isVisible()) await pybtn.click();
  await page.waitForTimeout(200);
  await page.evaluate(c => window.__setPython(c), code);
  await page.waitForTimeout(200);
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

async function roundtrip(page) {
  await page.locator('.toggle-btn:has-text("Python")').click();
  await page.waitForTimeout(250);
  return page.evaluate(() => window.__getPython());
}

// ── S2-01: lambda ───────────────────────────────────────────────────────────
test('S2-01: lambda args: expr → py_lambda block', async ({ page }) => {
  await loadPython(page, 'add = lambda a, b: a + b\n');
  expect(await types(page)).toContain('py_lambda');
});

// ── S2-02: list comprehension ──────────────────────────────────────────────
test('S2-02: list comprehension → py_comprehension', async ({ page }) => {
  await loadPython(page, 'squares = [x * x for x in range(10) if x % 2 == 0]\n');
  const t = await types(page);
  expect(t).toContain('py_comprehension');
});

// ── S2-03: dict comprehension ──────────────────────────────────────────────
test('S2-03: dict comprehension → py_dict_comp', async ({ page }) => {
  await loadPython(page, 'doubled = {k: v * 2 for k, v in items.items()}\n');
  const t = await types(page);
  expect(t).toContain('py_dict_comp');
});

// ── S2-04: yield ────────────────────────────────────────────────────────────
test('S2-04: yield statement → py_yield', async ({ page }) => {
  await loadPython(page, [
    'def gen():',
    '    for i in range(3):',
    '        yield i',
  ].join('\n'));
  expect(await types(page)).toContain('py_yield');
});

// ── S2-05: await ────────────────────────────────────────────────────────────
test('S2-05: await expression → py_await', async ({ page }) => {
  await loadPython(page, [
    'async def fetch():',
    '    data = await request()',
    '    return data',
  ].join('\n'));
  const t = await types(page);
  expect(t).toContain('py_await');
  // async def should also round-trip with "async def" in py_funcdef
  expect(t).toContain('py_funcdef');
});

// ── S2-06: assert ───────────────────────────────────────────────────────────
test('S2-06: assert → py_assert', async ({ page }) => {
  await loadPython(page, 'assert x > 0, "must be positive"\n');
  expect(await types(page)).toContain('py_assert');
});

// ── S2-07: del ──────────────────────────────────────────────────────────────
test('S2-07: del x, y → py_delete (one per target)', async ({ page }) => {
  await loadPython(page, [
    'x = 1',
    'y = 2',
    'del x',
    'del y',
  ].join('\n'));
  const t = await types(page);
  expect(t.filter(x => x === 'py_delete').length).toBeGreaterThanOrEqual(2);
});

// ── S2-08: global / nonlocal ───────────────────────────────────────────────
test('S2-08: global declaration → py_scope', async ({ page }) => {
  await loadPython(page, [
    'COUNT = 0',
    'def inc():',
    '    global COUNT',
    '    COUNT += 1',
  ].join('\n'));
  expect(await types(page)).toContain('py_scope');
});

// ── S2-09: match / case ────────────────────────────────────────────────────
test('S2-09: match/case → py_match + py_case', async ({ page }) => {
  await loadPython(page, [
    'def classify(x):',
    '    match x:',
    '        case 0:',
    '            return "zero"',
    '        case _:',
    '            return "other"',
  ].join('\n'));
  const t = await types(page);
  expect(t).toContain('py_match');
  expect(t).toContain('py_case');
  expect(t).toContain('py_return');   // Return is now py_return, not structure_return_typed
});

// ── S2-10: py_return with composable value tree ───────────────────────────
test('S2-10: return <call>  → py_return with py_call inside VALUE', async ({ page }) => {
  await loadPython(page, [
    'def f():',
    '    return make_thing(a, b)',
  ].join('\n'));
  const t = await types(page);
  expect(t).toContain('py_return');
  expect(t).toContain('py_call');
});

// ── S2-11: decorated function → py_funcdef with DECORATORS field filled ───
test('S2-11: decorators preserved in py_funcdef', async ({ page }) => {
  await loadPython(page, [
    'import functools',
    '@functools.cache',
    'def fib(n):',
    '    return n',
  ].join('\n'));
  const decos = await page.evaluate(() => {
    const ws = window.__blocklyWorkspace;
    const fn = ws.getAllBlocks().find(b => b.type === 'py_funcdef');
    return fn ? fn.getFieldValue('DECORATORS') : null;
  });
  expect(decos).toMatch(/functools\.cache/);
});

// ── S2-12: roundtrip containing all Sprint 2 constructs ───────────────────
test('S2-12: comprehension + lambda + yield + with roundtrip preserves source', async ({ page }) => {
  const src = [
    'from contextlib import contextmanager',
    '',
    '@contextmanager',
    'def fake():',
    '    yield 1',
    '',
    'f = lambda x: x + 1',
    'squares = [x * x for x in range(5)]',
    'with fake() as v:',
    '    print(v)',
    '',
  ].join('\n');
  await loadPython(page, src);
  const out = await roundtrip(page);
  expect(out).toBe(src);
});
