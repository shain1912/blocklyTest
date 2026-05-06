/**
 * Library Schema Registry — Blueprint Layer 3 matching engine.
 *
 * A *schema* is a richer reverse-pattern than the old regex strings. It names
 * the calleee by its fully-qualified path (callPath), optionally by receiver
 * type (receiverType), by the set of keyword argument names (keywords), and
 * by argument count. The registry indexes installed libraries and, given a
 * CPython AST Call node, returns the best matching semantic block builder —
 * or `null` if no schema applies (the caller then drops to exact blocks).
 *
 * The registry is rebuilt lazily every time pyAst.js asks for a match, so
 * newly installed libraries immediately affect conversion without a reload.
 *
 * A schema entry has the shape:
 *   {
 *     callPath:     'cv2.imshow',
 *     receiverType: null | 'Capture' | 'DataFrame' | ...,
 *     arity:        2,
 *     keywords:     ['index'],            // REQUIRED kwargs if any
 *     allowExtraKw: true,                 // tolerate extra kwargs
 *     block:        'cv2_imshow',
 *     fields:       ['WIN', 'IMG'],       // positional args → fields
 *     kwFields:     { index: 'INDEX' },   // kwarg → field
 *     scoring:      …                     // (computed, higher = better)
 *   }
 *
 * Libraries still published via reversePatterns (legacy) are auto-adapted
 * into schemas so nothing breaks.
 */

import { getInstalledLibraries } from './libraryManager';

/* ─── adapter: legacy reversePatterns → schema ───────────────────────────── */

const _schemaFromReverse = (rp) => {
  // rp.python e.g. "cv2.VideoCapture({SOURCE})" or "cv2.imshow({WIN}, {IMG})"
  const m = rp.python.match(/^([\w.]+)\s*\(([^)]*)\)/);
  if (!m) return null;
  const callPath = m[1];
  const argStr = m[2].trim();
  const placeholders = [...argStr.matchAll(/\{(\w+)\}/g)].map(x => x[1]);
  return {
    callPath,
    arity: placeholders.length,
    keywords: [],
    allowExtraKw: true,
    block: rp.block,
    fields: placeholders,
    kwFields: {},
  };
};

/* ─── registry ───────────────────────────────────────────────────────────── */

let _byCallPath = null;
let _built = false;

const _build = () => {
  const out = Object.create(null);
  try {
    const libs = getInstalledLibraries();
    for (const entry of libs) {
      const pkg = entry.pkg || {};

      // Schemas declared explicitly (future-proof: new libraries should use
      // pkg.schemas directly rather than reversePatterns).
      for (const schema of pkg.schemas || []) {
        (out[schema.callPath] = out[schema.callPath] || []).push(schema);
      }

      // Legacy reverse patterns — adapt to schema shape.
      for (const rp of pkg.reversePatterns || []) {
        const schema = _schemaFromReverse(rp);
        if (schema) (out[schema.callPath] = out[schema.callPath] || []).push(schema);
      }
    }
  } catch { /* swallow: empty registry is fine */ }
  _byCallPath = out;
  _built = true;
};

/** Invalidate the cache — call after a library is installed or removed. */
export const invalidateSchemaRegistry = () => { _built = false; };

/* ─── scoring ────────────────────────────────────────────────────────────── */

/**
 * Score a schema against an observed Call. Higher score = better fit. Schemas
 * that don't match at all return -Infinity so the caller can ignore them.
 *
 * Critical: a schema must score POSITIVE to win. The threshold lets py_call
 * (no schema) take over when matching a stringly-typed library block would
 * destroy the call's structure (complex args / unmapped kwargs).
 */
const _scoreMatch = (schema, { arity, kwNames, argKinds }) => {
  // Arity: exact match is worth a lot; off-by-one loses most of the match.
  const arityDelta = Math.abs((schema.arity ?? 0) - arity);
  if (arityDelta > 2) return -Infinity;
  let score = 100 - arityDelta * 20;

  // Required keywords must all be present
  const required = schema.keywords || [];
  for (const k of required) if (!kwNames.has(k)) return -Infinity;
  score += required.length * 5;

  // Strict schemas reject extra keywords entirely
  const mapped = new Set([...required, ...Object.keys(schema.kwFields || {})]);
  const extra = [...kwNames].filter(k => !mapped.has(k));
  if (extra.length > 0 && schema.allowExtraKw === false) return -Infinity;

  // ── data-fidelity penalties ──────────────────────────────────────────────
  // Most snippet/introspected library blocks store args in TEXT fields. That
  // collapses any structural value (tuple, list, dict, nested call) into a
  // string when the schema matches. So if the call carries non-trivial args,
  // we strongly prefer the structural py_call fallback.
  const STRUCTURAL = new Set([
    'Tuple', 'List', 'Dict', 'Set', 'Call', 'Subscript',
    'BinOp', 'BoolOp', 'Compare', 'JoinedStr', 'Lambda',
    'ListComp', 'SetComp', 'DictComp', 'GeneratorExp', 'IfExp',
  ]);
  const complexArgs = (argKinds || []).filter(k => STRUCTURAL.has(k)).length;
  score -= complexArgs * 60;

  // Unmapped kwargs (i.e. caller passes `dtype=...` but the schema never
  // claimed it) are lost on the field-only block. Penalize hard.
  const unmappedKw = [...kwNames].filter(k => !mapped.has(k));
  score -= unmappedKw.length * 50;

  return score;
};

/**
 * Look up a semantic block builder for an AST call node.
 * Returns a function(node) → block JSON, or null if no schema applies.
 *
 * `exprBlock` is injected so we can plug real structural blocks into the
 * matched library block's field slots instead of stringifying arguments.
 */
export const findSemanticCall = (callPath, kwNames, arity, { exprBlock, astToSource, argKinds }) => {
  if (!_built) _build();
  const candidates = _byCallPath[callPath];
  if (!candidates || candidates.length === 0) return null;

  let best = null;
  let bestScore = -Infinity;
  for (const schema of candidates) {
    const s = _scoreMatch(schema, { arity, kwNames, argKinds });
    if (s > bestScore) { best = schema; bestScore = s; }
  }
  // Schema must reach a positive score — otherwise the structural py_call
  // fallback is more honest than a stringified field rendering.
  if (!best || bestScore <= 0) return null;

  return (node) => {
    // Schema may carry `staticFields` — fixed field values (e.g. FUNC='str'
    // for the py_builtin_cast block) that don't depend on the call's args.
    // Set them first so positional args can still override if a slot collides.
    const fields = { ...(best.staticFields || {}) };
    const inputs = {};
    const slots = best.fields || [];
    // Slots listed in `valueInputs` (e.g. `say` block's TEXT) receive a
    // structural sub-block instead of a stringified field. Wrap constants in
    // the right literal block so codegen produces the user's quoting style
    // (text → 'foo', number → math_number) rather than dumping a raw token.
    const vInputs = new Set(best.valueInputs || []);
    (node.args || []).forEach((arg, i) => {
      const slot = slots[i];
      if (!slot) return;
      if (vInputs.has(slot)) {
        inputs[slot] = { block: _argToValueBlock(arg, exprBlock, astToSource) };
        return;
      }
      // Field path: constants stringify directly; everything else round-trips
      // through astToSource so the rendered Python is reproducible.
      if (arg._kind === 'Constant') fields[slot] = String(arg.value);
      else fields[slot] = astToSource(arg);
    });
    // Keyword args mapped by name (fields only — value-input kwargs are rare)
    for (const kw of node.keywords || []) {
      if (!kw.arg) continue;
      const fname = (best.kwFields || {})[kw.arg];
      if (fname) fields[fname] = astToSource(kw.value);
    }
    return { kind: 'block', type: best.block, fields, inputs, next: null };
  };
};

// Wrap a CPython AST arg in the appropriate literal/expression block so it
// can plug into a Blockly value-input slot. Strings → text block, numbers →
// math_number, anything structural → exprBlock (the regular AST visitor).
const _argToValueBlock = (arg, exprBlock, astToSource) => {
  if (arg && arg._kind === 'Constant') {
    if (typeof arg.value === 'number') {
      return { type: 'math_number', fields: { NUM: arg.value } };
    }
    return { type: 'text', fields: { TEXT: String(arg.value ?? '') } };
  }
  return exprBlock(arg) || { type: 'text', fields: { TEXT: astToSource(arg) } };
};

/** Diagnostic — expose a flat list of schemas for tests. */
export const listSchemas = () => {
  if (!_built) _build();
  return Object.entries(_byCallPath).flatMap(([path, list]) =>
    list.map(s => ({ path, arity: s.arity, block: s.block }))
  );
};
