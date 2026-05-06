/**
 * Library → Semantic block clustering.
 *
 * Demo Pillar #3: a Python library exposes dozens of callables. Naive
 * introspection produces one Blockly block per callable — toolboxes blow up
 * past 100+ entries and the user can no longer find anything. Our claim is
 * that you only need a handful of *semantic* blocks (≈5-8) per library to
 * cover the common usage shape.
 *
 * This module is the deterministic clustering pass. Given a raw introspection
 * list (the kind libraryIntrospector returns from the backend), it produces a
 * small set of semantic block specs by:
 *
 *   1. Dropping dunder / private callables (anything starting with `_`).
 *   2. Grouping by prefix-similarity (`cvtColor`, `cvtCOLOR_RGB2BGR` → "cvt*").
 *   3. Picking one canonical signature per group (shortest non-empty params).
 *   4. Capping the result at `maxBlocks` so the toolbox stays scannable.
 *
 * The output is shaped to plug directly into installLibrary() — same blocks /
 * generators / toolboxCategory keys the snippet libraries use.
 */

const DEFAULT_OPTS = Object.freeze({
  maxBlocks: 8,
  prefixMinLength: 4,    // group two names together if they share ≥ N leading chars
  dropPrefixes: ['_', '__'],
  paramFieldCap: 3,      // collapse signatures to ≤ N visible fields per block
});

// ──────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────

const longestCommonPrefix = (a, b) => {
  let i = 0;
  const n = Math.min(a.length, b.length);
  while (i < n && a[i] === b[i]) i++;
  return a.slice(0, i);
};

// Strip leading underscores / private callables.
const isInternal = (name) =>
  typeof name !== 'string' ||
  DEFAULT_OPTS.dropPrefixes.some(p => name.startsWith(p));

// Reduce a parameter list to a small set of Blockly fields.
// Each field becomes either a number, text, or dropdown depending on
// the annotation hint we receive from the introspector.
const paramToField = (param) => {
  const name = (param.name || 'arg').toUpperCase();
  const ann = (param.annotation || '').toLowerCase();
  if (ann.includes('int') || ann.includes('float') || ann.includes('number')) {
    return { kind: 'field_number', name, value: 0 };
  }
  if (ann.includes('bool')) {
    return { kind: 'field_dropdown', name, options: [['true', 'True'], ['false', 'False']] };
  }
  return { kind: 'field_input', name, text: '' };
};

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

/**
 * Cluster an introspection list into a small set of semantic blocks.
 *
 * @param {Array<{name, kind?, params?, annotation?, doc?}>} introspection
 * @param {Object}                                          opts
 * @returns {{ blocks: Array, dropped: Array, groups: Array }}
 */
export function clusterIntrospection(introspection, opts = {}) {
  const o = { ...DEFAULT_OPTS, ...opts };
  if (!Array.isArray(introspection)) {
    return { blocks: [], dropped: [], groups: [] };
  }

  // 1. Filter internals
  const visible = introspection.filter(item => !isInternal(item.name));
  const dropped = introspection.filter(item => isInternal(item.name));

  // 2. Sort by name so prefix grouping is stable
  const sorted = [...visible].sort((a, b) => a.name.localeCompare(b.name));

  // 3. Greedy prefix grouping. Walk the sorted list; if the current item
  //    shares a long enough prefix with the last group's representative,
  //    fold it in. Otherwise start a new group.
  const groups = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    if (last) {
      const lcp = longestCommonPrefix(last.rep.name, item.name);
      if (lcp.length >= o.prefixMinLength) {
        last.members.push(item);
        last.commonPrefix = lcp;
        continue;
      }
    }
    groups.push({ rep: item, commonPrefix: item.name, members: [item] });
  }

  // 4. Cap. If we exceed maxBlocks, fold the smallest groups together into
  //    a single "misc" block. This bounds the toolbox no matter how large
  //    the library is.
  const capped = capGroups(groups, o.maxBlocks);

  // 5. Materialize each group as a Blockly block spec.
  const blocks = capped.map(g => groupToBlock(g, o));

  return { blocks, dropped: dropped.map(d => d.name), groups: capped };
}

const capGroups = (groups, max) => {
  if (groups.length <= max) return groups;
  // Sort by member count desc; keep top (max-1), fold the rest into "misc".
  const sorted = [...groups].sort((a, b) => b.members.length - a.members.length);
  const keep = sorted.slice(0, max - 1);
  const tail = sorted.slice(max - 1);
  const miscMembers = tail.flatMap(g => g.members);
  if (miscMembers.length === 0) return keep;
  keep.push({
    rep: { name: 'misc', params: [] },
    commonPrefix: 'misc',
    members: miscMembers,
  });
  return keep;
};

const groupToBlock = (group, opts) => {
  const { rep, members, commonPrefix } = group;
  const blockType = `sem_${(commonPrefix || rep.name).toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
  // Variant dropdown: every member's full name. The block's Python codegen
  // will use the selected variant. If only one member, dropdown is omitted.
  const variants = members.map(m => [m.name, m.name]);
  // Pick the canonical signature: shortest params list among members.
  const canonical = [...members].sort(
    (a, b) => (a.params?.length || 0) - (b.params?.length || 0)
  )[0];
  const params = (canonical.params || []).slice(0, opts.paramFieldCap);
  const fields = params.map(paramToField);

  const inputs = [{
    kind: 'dummy',
    fields: [
      { type: 'label', label: commonPrefix.replace(/_$/, '') || rep.name },
      ...(variants.length > 1
        ? [{ kind: 'field_dropdown', name: 'VARIANT', options: variants }]
        : []),
      ...fields,
    ],
  }];

  return {
    type: blockType,
    colour: '#7c3aed',
    tooltip: `Semantic block covering ${members.length} callable(s): ` +
             members.map(m => m.name).join(', '),
    isStatement: true,
    inputs,
    _members: members.map(m => m.name), // metadata for tests / the paper
    _commonPrefix: commonPrefix,
  };
};

/**
 * Wrap a clustered result into a libraryManager-compatible package.
 * Generators are minimal (text concat) — the demo focuses on the abstraction
 * shape, not codegen polish.
 */
export function semanticPackage(moduleName, clustered) {
  const pkg = {
    name: `${moduleName}-semantic`,
    version: '1.0.0',
    description: `Semantic abstraction over ${moduleName} (${clustered.blocks.length} blocks)`,
    author: 'librarySemantics',
    colour: '#7c3aed',
    blocks: clustered.blocks.map(({ _members, _commonPrefix, ...b }) => b),
    generators: { python: {}, js: {} },
    reversePatterns: [],
    toolboxCategory: {
      kind: 'category',
      name: `🧠 ${moduleName}`,
      colour: '#7c3aed',
      contents: clustered.blocks.map(b => ({ kind: 'block', type: b.type })),
    },
  };

  // Generate one Python generator per block. The block emits
  // `moduleName.<variant>(field1, field2, ...)`.
  // libraryManager._normalizeGenerator escapes real newlines into "\\n", which
  // would corrupt a multi-line JS function body. So we emit the body as a
  // single line of `;`-separated statements.
  for (const b of clustered.blocks) {
    const fieldNames = JSON.stringify(
      (b.inputs[0].fields || []).filter(f => f.name && f.name !== 'VARIANT').map(f => f.name)
    );
    const defaultVariant = JSON.stringify(b._members[0]);
    const moduleLit = JSON.stringify(moduleName);
    pkg.generators.python[b.type] =
      `var variant = block.getFieldValue('VARIANT') || ${defaultVariant}; ` +
      `var fields = ${fieldNames}; ` +
      `var args = fields.map(function(n){return block.getFieldValue(n);}).filter(function(v){return v !== null && v !== '';}); ` +
      `return ${moduleLit} + '.' + variant + '(' + args.join(', ') + ')\\n';`;
    pkg.generators.js[b.type] = `return '/* semantic call: ${b.type} */\\n';`;
  }

  return pkg;
}

/**
 * Convenience: full pipeline. Raw introspection → clustered → installable pkg.
 */
export function semanticLibraryFor(moduleName, introspection, opts = {}) {
  const clustered = clusterIntrospection(introspection, opts);
  return {
    package: semanticPackage(moduleName, clustered),
    stats: {
      moduleName,
      rawCount: introspection.length,
      semanticCount: clustered.blocks.length,
      droppedCount: clustered.dropped.length,
      compressionRatio: introspection.length === 0
        ? 0
        : clustered.blocks.length / introspection.length,
      groups: clustered.groups.map(g => ({
        prefix: g.commonPrefix,
        members: g.members.map(m => m.name),
      })),
    },
  };
}
