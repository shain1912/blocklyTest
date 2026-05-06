/**
 * Sprint 3 — LibrarySchemaRegistry tests.
 *
 * The old reversePatterns matcher didn't understand keyword arguments or
 * receiver types — `df.to_excel(path, index=False)` would score the same as
 * `df.to_excel(path)`. Schemas now carry arity + keyword set + scoring.
 *
 * These E2E tests install a tiny library package with two conflicting schemas
 * for the same callPath and confirm the higher-scoring one wins.
 */

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';
const BACKEND = 'http://127.0.0.1:8000';

test.beforeAll(async ({ request }) => {
  const r = await request.get(`${BACKEND}/health`);
  if (!r.ok()) throw new Error('Backend unreachable — run ./start.sh first');
});

/** Install a library package via the exposed window helper + trigger toolbox refresh. */
async function installPkg(page, pkg) {
  await page.evaluate((p) => window.__installLibrary(p), pkg);
  // schema registry invalidates lazily via dynamic import — give it a tick
  await page.waitForTimeout(100);
}

async function open(page) {
  await page.goto(BASE);
  await page.waitForSelector('.blockly-editor', { timeout: 15000 });
  await page.waitForFunction(() => typeof window.__installLibrary === 'function', { timeout: 10000 });
  await page.waitForTimeout(200);
}

async function convert(page, code) {
  return page.evaluate(async (src) => {
    const m = await import('/src/utils/pyAst.js');
    const json = await m.pythonToBlocksViaAst(src, { wrapRunnable: true });
    const types = [];
    const walk = (b) => {
      if (!b) return;
      types.push(b.type);
      if (b.inputs) for (const k of Object.keys(b.inputs)) walk(b.inputs[k]?.block);
      walk(b.next?.block);
    };
    (json?.blocks?.blocks || []).forEach(walk);
    return types;
  }, code);
}

// ── S3-01: legacy reversePatterns still work via adapter ───────────────────
test('S3-01: legacy reversePatterns library is auto-adapted into a schema', async ({ page }) => {
  await open(page);
  await installPkg(page, {
    name: 'legacy-cv', version: '1.0.0',
    blocks: [{
      type: 'cv_cap_legacy', colour: '#111', isStatement: false,
      inputs: [{ kind: 'dummy', fields: [{ type: 'number', name: 'SRC', default: 0 }] }],
    }],
    generators: { python: { cv_cap_legacy: "const s=block.getFieldValue('SRC'); return ['cv2.VideoCapture('+s+')', 0];" } },
    reversePatterns: [{ python: 'cv2.VideoCapture({SRC})', block: 'cv_cap_legacy' }],
  });
  const types = await convert(page, 'x = cv2.VideoCapture(0)\n');
  expect(types).toContain('cv_cap_legacy');
});

// ── S3-02: keyword-set schema wins over plain-arity schema ─────────────────
test('S3-02: df.to_excel(path, index=False) picks the index-aware schema', async ({ page }) => {
  await open(page);
  // Install two competing libraries: one with a generic schema, one that
  // requires the `index` kwarg. The registry should pick the second.
  await installPkg(page, {
    name: 'generic-pd', version: '1.0.0',
    blocks: [{
      type: 'pd_to_excel_generic', colour: '#111', isStatement: true,
      inputs: [{ kind: 'dummy', fields: [{ type: 'text_input', name: 'PATH', default: '' }] }],
    }],
    generators: { python: { pd_to_excel_generic: "return 'x.to_excel(\"\")\\n';" } },
    schemas: [{
      callPath: 'df.to_excel',
      arity: 1, keywords: [], allowExtraKw: true,
      block: 'pd_to_excel_generic', fields: ['PATH'],
    }],
  });
  await installPkg(page, {
    name: 'strict-pd', version: '1.0.0',
    blocks: [{
      type: 'pd_to_excel_indexed', colour: '#222', isStatement: true,
      inputs: [{ kind: 'dummy', fields: [
        { type: 'text_input', name: 'PATH', default: '' },
        { type: 'text_input', name: 'INDEX', default: 'False' },
      ] }],
    }],
    generators: { python: { pd_to_excel_indexed: "return 'x.to_excel(\"\", index=False)\\n';" } },
    schemas: [{
      callPath: 'df.to_excel',
      arity: 1, keywords: ['index'], allowExtraKw: false,
      block: 'pd_to_excel_indexed', fields: ['PATH'], kwFields: { index: 'INDEX' },
    }],
  });

  // With the kwarg: expect the strict (indexed) schema
  let types = await convert(page, 'df.to_excel("/tmp/out.xlsx", index=False)\n');
  expect(types).toContain('pd_to_excel_indexed');
  expect(types).not.toContain('pd_to_excel_generic');

  // Without the kwarg: expect the generic schema
  types = await convert(page, 'df.to_excel("/tmp/out.xlsx")\n');
  expect(types).toContain('pd_to_excel_generic');
  expect(types).not.toContain('pd_to_excel_indexed');
});

// ── S3-03: kwFields routes kwarg values into named fields ──────────────────
test('S3-03: keyword arguments populate block fields, not text fallbacks', async ({ page }) => {
  await open(page);
  await installPkg(page, {
    name: 'kw-library', version: '1.0.0',
    blocks: [{
      type: 'log_with_level', colour: '#222', isStatement: true,
      inputs: [{ kind: 'dummy', fields: [
        { type: 'text_input', name: 'MSG', default: '' },
        { type: 'text_input', name: 'LEVEL', default: 'info' },
      ] }],
    }],
    generators: { python: { log_with_level: "const m=block.getFieldValue('MSG'),l=block.getFieldValue('LEVEL'); return 'log(\"'+m+'\", level=\"'+l+'\")\\n';" } },
    schemas: [{
      callPath: 'log',
      arity: 1, keywords: ['level'], allowExtraKw: false,
      block: 'log_with_level', fields: ['MSG'], kwFields: { level: 'LEVEL' },
    }],
  });

  // The block's LEVEL field should be populated from the `level=` kwarg,
  // not landed in the generic text-block fallback.
  const fieldsByType = await page.evaluate(async () => {
    const m = await import('/src/utils/pyAst.js');
    const json = await m.pythonToBlocksViaAst('log("hi", level="warn")\n', { wrapRunnable: true });
    const out = {};
    const walk = (b) => {
      if (!b) return;
      out[b.type] = b.fields || {};
      if (b.inputs) for (const k of Object.keys(b.inputs)) walk(b.inputs[k]?.block);
      walk(b.next?.block);
    };
    (json?.blocks?.blocks || []).forEach(walk);
    return out;
  });
  expect(fieldsByType.log_with_level).toBeDefined();
  expect(String(fieldsByType.log_with_level.LEVEL)).toMatch(/warn/);
});

// ── S3-04: listSchemas reflects the registered schemas ─────────────────────
test('S3-04: listSchemas exposes installed schemas for debugging', async ({ page }) => {
  await open(page);
  await installPkg(page, {
    name: 'diag-library', version: '1.0.0',
    blocks: [{ type: 'diag_block', colour: '#000', isStatement: false,
      inputs: [{ kind: 'dummy', fields: [{ type: 'label', label: 'diag' }] }] }],
    generators: { python: { diag_block: "return ['1', 0];" } },
    schemas: [{ callPath: 'diag.thing', arity: 0, keywords: [], block: 'diag_block', fields: [] }],
  });
  const paths = await page.evaluate(async () => {
    const m = await import('/src/utils/librarySchemaRegistry.js');
    return m.listSchemas().map(s => s.path);
  });
  expect(paths).toContain('diag.thing');
});
