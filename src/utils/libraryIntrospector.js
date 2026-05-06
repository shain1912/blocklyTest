/**
 * Layer 2 — Library Metadata discovery.
 *
 * Given a Python module name, ask the backend to introspect it (signatures,
 * docstrings, kinds). Then (Layer 3) synthesize a Blockly library package
 * from that metadata — no hand-written snippetLibraries file needed.
 *
 * The produced library is rule-based: every public callable becomes a block
 * (value block if the Python name is a class or looks like a getter, else
 * statement block). Each parameter becomes a field whose default is drawn
 * from the introspected default when available.
 *
 * Principle (from the 4-layer design):
 *   - Layer 1 (exact AST) is the source of truth for Python → Blocks.
 *   - Layer 2 (this module) feeds block type metadata into Layer 3.
 *   - Layer 3 (block synthesis) emits library packages.
 *   - Layer 4 (LLM) is optional — only for high-level abstraction.
 */

import { getBackendBase } from './pythonBackend';
import { installLibrary } from './libraryManager';

/** Ask the backend to introspect a Python module. */
export const introspectModule = async (moduleName, {
  maxItems = 500, callablesOnly = true,
} = {}) => {
  const res = await fetch(`${getBackendBase()}/introspect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      module: moduleName,
      max_items: maxItems,
      callables_only: callablesOnly,
    }),
  });
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
  return await res.json();
};

/** Normalize a Python default-literal into a Blockly field default. */
const _normalizeDefault = (s) => {
  if (s == null) return '';
  const t = String(s).trim();
  if (t === 'None' || t === '?' || t === '<?>') return '';
  // strip quotes for simple string literals
  const m = t.match(/^['"](.*)['"]$/);
  if (m) return m[1];
  return t;
};

/** Classify a callable: value-returning vs side-effect-statement. */
const _shouldBeValueBlock = (item) => {
  if (item.kind === 'class') return true;                       // constructor → value
  const n = item.name.toLowerCase();
  // Heuristic: names starting with these prefixes usually return a value.
  return /^(get|read|is|has|calc|compute|to_|as_|make|build|array|zeros|ones|arange|eye)/.test(n)
      || /\b-> /.test(item.annotation || '')
      || n === 'len';
};

/** Turn one introspected item into a block definition + generator pair. */
const _itemToBlock = ({ module, item, colour }) => {
  if (item.kind === 'constant') return null;      // constants don't need blocks
  const type = `${module.replace(/[^a-zA-Z0-9]/g, '_')}_${item.name}`;
  const params = (item.params || []).slice(0, 6);   // cap widget width
  const fields = [{ type: 'label', label: item.name }];
  const fieldNames = [];
  for (const p of params) {
    const fname = (p.name || 'arg').toUpperCase();
    fieldNames.push(fname);
    const def = _normalizeDefault(p.default);
    // Best-effort field type from the annotation / default
    const looksNumeric = /int|float/i.test(p.annotation || '') || /^-?\d+(\.\d+)?$/.test(def);
    fields.push({
      name: fname,
      type: looksNumeric ? 'number' : 'text_input',
      default: looksNumeric ? (def || '0') : def,
    });
  }
  const isValue = _shouldBeValueBlock(item);
  const callExpr = `${item.qualified}(` +
    fieldNames.map(n => `'+block.getFieldValue('${n}')+'`).join(', ') +
    `)`;
  const pyBody = isValue
    ? `return ['${callExpr.replace(/'/g, "\\'")}', 0];`
    : `return '${callExpr.replace(/'/g, "\\'")}\\n';`;
  return {
    def: {
      type,
      colour,
      tooltip: (item.doc || '').split('\n')[0] || item.name,
      isStatement: !isValue,
      inputs: [{ kind: 'dummy', fields }],
    },
    pyBody,
    reverse: {
      python: `${item.qualified}(${fieldNames.map(n => `{${n}}`).join(', ')})`,
      block: type,
    },
  };
};

/**
 * Build a Blockly library package from introspection data and install it.
 * Returns { ok, package, installed:[blockTypes] } on success.
 */
export const installLibraryFromIntrospection = async (moduleName, {
  maxItems = 500, colour = '#4f46e5', alias = null, callablesOnly = true,
} = {}) => {
  const info = await introspectModule(moduleName, { maxItems, callablesOnly });
  if (!info.ok) return { ok: false, error: info.error || 'introspection failed' };

  const builtBlocks = [];
  const generatorsPy = {};
  const reverse = [];
  for (const item of info.items || []) {
    const built = _itemToBlock({ module: moduleName, item, colour });
    if (!built) continue;
    builtBlocks.push(built.def);
    generatorsPy[built.def.type] = built.pyBody;
    reverse.push(built.reverse);
  }
  if (builtBlocks.length === 0) return { ok: false, error: 'no callable items found' };

  const pkg = {
    name: `${moduleName}-auto`,
    version: '1.0.0',
    description: `Auto-generated blocks for Python module '${moduleName}'`,
    author: 'introspection',
    colour,
    blocks: builtBlocks,
    generators: {
      python: generatorsPy,
      js: Object.fromEntries(builtBlocks.map(b =>
        [b.type, "return 'console.log(\"[auto-lib]\")\\n';"]
      )),
    },
    reversePatterns: reverse,
    toolboxCategory: {
      kind: 'category',
      name: alias || `📦 ${moduleName}`,
      colour,
      contents: builtBlocks.map(b => ({ kind: 'block', type: b.type })),
    },
  };
  installLibrary(pkg);
  return { ok: true, package: pkg, installed: builtBlocks.map(b => b.type) };
};
