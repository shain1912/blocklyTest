/**
 * Block Library Manager
 *
 * pip-like package system for visual block libraries.
 * Package format:
 *   name, version, description, author, colour
 *   blocks[]          — block shape definitions
 *   generators.js     — JS code generator strings
 *   generators.python — Python code generator strings
 *   reversePatterns[] — Python → Block reverse mapping for transpiler
 *   toolboxCategory   — Blockly toolbox category config
 */

import * as Blockly from 'blockly/core';
import { javascriptGenerator } from 'blockly/javascript';
import { pythonGenerator } from 'blockly/python';

const STORAGE_KEY = 'blockly-libraries';

// ── Reverse-pattern registry (Python line → block type) ──────────────────────
// Entry: { regex, blockType, fieldNames }
const _reverseRegistry = [];

export const getLibraryBlockForPython = (line) => {
  for (const entry of _reverseRegistry) {
    const m = line.match(entry.regex);
    if (!m) continue;
    const fields = {};
    entry.fieldNames.forEach((name, i) => { fields[name] = m[i + 1]; });
    return { type: entry.blockType, fields };
  }
  return null;
};

// Template: "t.forward({STEPS})"  →  regex + fieldNames
const _buildReverseEntry = (template, blockType) => {
  const fieldNames = [];
  // extract {NAME} placeholders
  const placeholderRe = /\{(\w+)\}/g;
  let m;
  while ((m = placeholderRe.exec(template)) !== null) fieldNames.push(m[1]);
  // build regex: escape special chars, replace {NAME} with capture group
  const escaped = template
    .replace(/[.+*?^$[\]{}()|\\]/g, c => (c === '{' || c === '}' ? c : `\\${c}`))
    .replace(/\{(\w+)\}/g, '([\\w.+\\-*/\\s]+)');
  return { regex: new RegExp(`^${escaped}$`), blockType, fieldNames };
};

const _registerReversePatterns = (pkg) => {
  (pkg.reversePatterns || []).forEach(({ python, block }) => {
    // Avoid duplicates
    if (_reverseRegistry.some(e => e.blockType === block)) return;
    _reverseRegistry.push(_buildReverseEntry(python, block));
  });
};

// ── Serialize/Deserialize ─────────────────────────────────────────────────────

export const getInstalledLibraries = () => {
  // Persisted user-installed libraries plus any in-memory builtins (sprite
  // DSL etc.) so the schema registry can see both. Builtins are filtered
  // out of the public-facing list when the caller asks for "what the user
  // installed" — but the schema registry walks them all.
  let persisted = [];
  try { persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch {}
  const builtins = Array.from(_runtimeBuiltins?.values?.() || []);
  return [...persisted, ...builtins];
};

/** Public-facing list (UI / E2E tests) — excludes `__builtin_*` packages. */
export const getUserInstalledLibraries = () =>
  getInstalledLibraries().filter(l => !String(l.name).startsWith('__builtin_'));

const saveLibraries = (libs) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(libs));
};

// ── Normalize AI-generated package format ────────────────────────────────────

// autoBlockGen uses inp.type; BUILTIN_LIBRARY_TEMPLATES use inp.kind. Accept both.
// autoBlockGen also puts fields inside "value" inputs — flatten them to dummy inputs.
const _normalizeInputs = (inputs) => {
  if (!inputs) return [];
  const result = [];
  for (const inp of inputs) {
    const kind = inp.kind || inp.type || 'dummy';
    if (kind === 'dummy') {
      const fields = [];
      if (inp.label) fields.push({ type: 'label', label: inp.label });
      (inp.fields || []).forEach(f => fields.push({
        ...f, type: f.type === 'text' ? 'text_input' : f.type
      }));
      result.push({ kind: 'dummy', fields });
    } else if (kind === 'value') {
      if (inp.fields && inp.fields.length > 0) {
        // Inline fields in a value slot → render as dummy input with fields
        const fields = [];
        if (inp.label) fields.push({ type: 'label', label: inp.label });
        inp.fields.forEach(f => fields.push({
          ...f, type: f.type === 'text' ? 'text_input' : f.type
        }));
        result.push({ kind: 'dummy', fields });
      } else {
        result.push({ kind: 'value', name: inp.name || 'VALUE', label: inp.label });
      }
    } else if (kind === 'statement') {
      result.push({ kind: 'statement', name: inp.name || 'STACK', label: inp.label });
    }
  }
  return result;
};

// autoBlockGen generates template strings like "lib.method({FIELD})\n".
// installLibrary needs JS function bodies like "const F=block.getFieldValue('FIELD'); return `lib.method(${F})\n`;"
const _normalizeGenerator = (gen) => {
  if (!gen) return null;
  // Replace literal newlines inside string literals with \n escape sequences
  // AI sometimes generates: return 'code()\n'; where \n is a real newline, breaking new Function()
  const sanitized = gen.replace(/\r?\n/g, '\\n');
  if (sanitized.includes('return ') || sanitized.includes('block.getFieldValue')) return sanitized;
  // Template format: extract {FIELD_NAME} placeholders
  const fieldNames = [];
  const re = /\{(\w+)\}/g;
  let m;
  while ((m = re.exec(sanitized)) !== null) {
    if (!fieldNames.includes(m[1])) fieldNames.push(m[1]);
  }
  if (fieldNames.length === 0) return `return ${JSON.stringify(sanitized)};`;
  const decls = fieldNames.map(n => `const ${n}=block.getFieldValue('${n}');`).join(' ');
  const tmpl = sanitized.replace(/\{(\w+)\}/g, '${$1}');
  return `${decls} return \`${tmpl}\`;`;
};

// ── Install ───────────────────────────────────────────────────────────────────

export const installLibrary = (pkg) => {
  if (!pkg || !pkg.name || !pkg.blocks) throw new Error('Invalid library package: missing name or blocks');

  pkg.blocks.forEach(blockDef => {
    // Register block shape only if not already defined
    if (!Blockly.Blocks[blockDef.type]) {
      const normalizedInputs = _normalizeInputs(blockDef.inputs);
      const isValueBlock = blockDef.output || blockDef.isStatement === false;

      Blockly.Blocks[blockDef.type] = {
        init: function () {
          const block = this;
          block.setColour(blockDef.colour || '#555');
          block.setTooltip(blockDef.tooltip || '');

          normalizedInputs.forEach(inp => {
            if (inp.kind === 'dummy') {
              const di = block.appendDummyInput();
              (inp.fields || []).forEach(f => {
                if (f.type === 'text_input') di.appendField(new Blockly.FieldTextInput(String(f.default ?? '')), f.name);
                else if (f.type === 'dropdown') di.appendField(new Blockly.FieldDropdown(f.options), f.name);
                else if (f.type === 'number') di.appendField(new Blockly.FieldNumber(f.default ?? 0), f.name);
                else if (f.name) di.appendField(new Blockly.FieldTextInput(String(f.default ?? '')), f.name);
                else di.appendField(String(f.label || ''));
              });
            } else if (inp.kind === 'statement') {
              const si = block.appendStatementInput(inp.name).setCheck(null);
              if (inp.label) si.appendField(inp.label);
            } else if (inp.kind === 'value') {
              const vi = block.appendValueInput(inp.name).setCheck(null);
              if (inp.label) vi.appendField(inp.label);
            }
          });

          if (isValueBlock) { block.setOutput(true, null); }
          else {
            if (blockDef.previousStatement !== false) block.setPreviousStatement(true, null);
            if (blockDef.nextStatement !== false) block.setNextStatement(true, null);
          }
        }
      };
    }

    // Always (re-)register generators — they live in memory and are lost on page reload
    const jsGenRaw = pkg.generators?.js?.[blockDef.type];
    const pyGenRaw = pkg.generators?.python?.[blockDef.type];
    const jsGen = _normalizeGenerator(jsGenRaw);
    const pyGen = _normalizeGenerator(pyGenRaw) ?? "return '';";
    // eslint-disable-next-line no-new-func
    if (jsGen) try { javascriptGenerator.forBlock[blockDef.type] = new Function('block', 'javascriptGenerator', jsGen); } catch (e) { console.warn(`JS gen error for ${blockDef.type}:`, e); }
    // eslint-disable-next-line no-new-func
    try {
      pythonGenerator.forBlock[blockDef.type] = new Function('block', 'pythonGenerator', pyGen);
    } catch (e) {
      console.warn(`Py gen failed for ${blockDef.type}:`, e.message);
      pythonGenerator.forBlock[blockDef.type] = () => '';
    }
  });

  _registerReversePatterns(pkg);

  // `__builtin_*` packages go to the in-memory registry only — never to
  // localStorage and never to the user-facing Library Manager. Real user
  // libraries persist; getInstalledLibraries returns persisted + builtins.
  const entry = { name: pkg.name, version: pkg.version || '1.0.0', description: pkg.description || '', author: pkg.author || '', installedAt: new Date().toISOString(), pkg };
  if (String(pkg.name).startsWith('__builtin_')) {
    _runtimeBuiltins.set(pkg.name, entry);
  } else {
    const persisted = _readPersisted();
    const idx = persisted.findIndex(l => l.name === pkg.name);
    if (idx >= 0) persisted[idx] = entry; else persisted.push(entry);
    saveLibraries(persisted);
  }

  // Schema registry must be rebuilt so the new library's calls are resolvable
  // on the next Python→Blocks conversion.
  _notifySchemaRegistry();
  return entry;
};

// In-memory registry for `__builtin_*` packages so they're available to the
// schema registry without leaking into localStorage / the UI.
const _runtimeBuiltins = new Map();
const _readPersisted = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
};

/** Lazily-loaded callback so we don't force a circular import at module eval. */
let _schemaInvalidator = null;
const _notifySchemaRegistry = () => {
  if (_schemaInvalidator) { try { _schemaInvalidator(); } catch {} return; }
  // Dynamically import to avoid a cycle (schema registry imports getInstalledLibraries)
  import('./librarySchemaRegistry').then(m => {
    _schemaInvalidator = m.invalidateSchemaRegistry;
    _schemaInvalidator();
  }).catch(() => {});
};

// ── Uninstall ─────────────────────────────────────────────────────────────────

export const uninstallLibrary = (name) => {
  saveLibraries(getInstalledLibraries().filter(l => l.name !== name));
  _notifySchemaRegistry();
};

// ── Restore on boot ───────────────────────────────────────────────────────────

export const restoreLibraries = () => {
  // Skip `__builtin_*` packages — those are re-installed by their owning
  // module at startup (e.g. spriteDslSchemas via App.jsx) and should never
  // be persisted. If old localStorage from a prior version still holds one,
  // strip it on the first restore and write the cleaned list back.
  const userLibs = getInstalledLibraries()
    .filter(e => !String(e?.pkg?.name || '').startsWith('__builtin_'));
  saveLibraries(userLibs.map(e => ({
    name: e.name, version: e.version, description: e.description,
    author: e.author, installedAt: e.installedAt, pkg: e.pkg,
  })));
  userLibs.forEach(entry => {
    try { installLibrary(entry.pkg); } catch (e) { console.warn(`Failed to restore "${entry.name}":`, e); }
  });
  return userLibs;
};

// ── Dynamic toolbox categories for installed libraries ────────────────────────

/**
 * Build the list of toolbox categories for the currently-installed libraries.
 * Two cleanups vs the naive map:
 *   1. `__builtin_*` packages (sprite-dsl, future stdlib bridges) live in the
 *      schema registry only — they don't get a toolbox of their own. Their
 *      blocks already live in curated categories (Motion / Looks / etc.).
 *   2. Dedupe by visible category NAME so installing the same library twice
 *      (e.g. OpenCV via snippet + AI-generated opencv-python) doesn't render
 *      "OpenCV" three times in the side panel. Last-install wins.
 */
export const buildLibraryToolboxCategories = () => {
  const byName = new Map();
  for (const entry of getInstalledLibraries()) {
    const pkg = entry.pkg || {};
    if (String(pkg.name || '').startsWith('__builtin_')) continue;

    const cat = pkg.toolboxCategory || {
      kind: 'category',
      name: `📦 ${pkg.name}`,
      colour: pkg.colour || '#555',
      contents: (pkg.blocks || []).map(b => ({ kind: 'block', type: b.type })),
    };
    byName.set(cat.name, cat);
  }
  return Array.from(byName.values());
};

// ── Export current workspace as library ──────────────────────────────────────

export const exportAsLibrary = (workspace, meta) => {
  if (!workspace) throw new Error('No workspace');
  const classBlocks = workspace.getAllBlocks(false).filter(b =>
    ['class_define', 'structure_module_def'].includes(b.type)
  );
  if (classBlocks.length === 0) throw new Error('No class or module blocks found');

  return {
    name: meta.name || 'my-library',
    version: meta.version || '1.0.0',
    description: meta.description || '',
    author: meta.author || '',
    colour: meta.colour || '#1d4ed8',
    pythonSource: pythonGenerator.workspaceToCode(workspace),
    blocks: classBlocks.map(b => ({ type: b.type, colour: b.getColour(), tooltip: b.getTooltip(), inputs: [] })),
    generators: { js: {}, python: {} },
    toolboxCategory: {
      kind: 'category',
      name: `📦 ${meta.name || 'my-library'}`,
      colour: meta.colour || '#1d4ed8',
      contents: classBlocks.map(b => ({ kind: 'block', type: b.type }))
    },
    createdAt: new Date().toISOString()
  };
};

export const downloadLibraryJson = (pkg) => {
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: `${pkg.name}-${pkg.version}.blocklib.json` });
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ── Built-in library templates ────────────────────────────────────────────────

export const BUILTIN_LIBRARY_TEMPLATES = [
  {
    name: 'turtle-graphics',
    version: '1.1.0',
    description: 'Turtle-style drawing with real pen (forward, back, turn, pen up/down)',
    author: 'BlockPy',
    colour: '#15803d',
    // reversePatterns: Python line → block (for transpiler round-trip)
    reversePatterns: [
      { python: 'turtle.forward({STEPS})',  block: 'turtle_forward' },
      { python: 'turtle.backward({STEPS})', block: 'turtle_backward' },
      { python: 'turtle.right({DEGREES})',  block: 'turtle_right' },
      { python: 'turtle.left({DEGREES})',   block: 'turtle_left' },
      { python: 'turtle.pendown()',         block: 'turtle_pendown' },
      { python: 'turtle.penup()',           block: 'turtle_penup' },
      { python: 'turtle.color({COLOR})',    block: 'turtle_color' },
      { python: 'turtle.clear()',           block: 'turtle_clear' },
    ],
    blocks: [
      {
        type: 'turtle_init', colour: '#166534', tooltip: 'Init turtle — switches sprite to turtle and resets position',
        inputs: [{ kind: 'dummy', fields: [{ type: 'label', label: '🐢 turtle start' }] }]
      },
      {
        type: 'turtle_forward', colour: '#15803d', tooltip: 'Move forward',
        inputs: [{ kind: 'dummy', fields: [{ type: 'label', label: 'forward' }, { type: 'number', name: 'STEPS', default: 100 }] }]
      },
      {
        type: 'turtle_backward', colour: '#15803d', tooltip: 'Move backward',
        inputs: [{ kind: 'dummy', fields: [{ type: 'label', label: 'backward' }, { type: 'number', name: 'STEPS', default: 100 }] }]
      },
      {
        type: 'turtle_right', colour: '#15803d', tooltip: 'Turn right',
        inputs: [{ kind: 'dummy', fields: [{ type: 'label', label: 'right' }, { type: 'number', name: 'DEGREES', default: 90 }] }]
      },
      {
        type: 'turtle_left', colour: '#15803d', tooltip: 'Turn left',
        inputs: [{ kind: 'dummy', fields: [{ type: 'label', label: 'left' }, { type: 'number', name: 'DEGREES', default: 90 }] }]
      },
      {
        type: 'turtle_pendown', colour: '#166534', tooltip: 'Put pen down (start drawing)',
        inputs: [{ kind: 'dummy', fields: [{ type: 'label', label: '🖊 pen down' }] }]
      },
      {
        type: 'turtle_penup', colour: '#166534', tooltip: 'Lift pen up (stop drawing)',
        inputs: [{ kind: 'dummy', fields: [{ type: 'label', label: '✋ pen up' }] }]
      },
      {
        type: 'turtle_color', colour: '#166534', tooltip: 'Set pen color',
        inputs: [{ kind: 'dummy', fields: [{ type: 'label', label: '🎨 color' }, { type: 'text_input', name: 'COLOR', default: 'red' }] }]
      },
      {
        type: 'turtle_clear', colour: '#166534', tooltip: 'Clear all drawings',
        inputs: [{ kind: 'dummy', fields: [{ type: 'label', label: '🗑 clear drawing' }] }]
      },
      {
        type: 'turtle_goto', colour: '#15803d', tooltip: 'Go to absolute position',
        inputs: [{ kind: 'dummy', fields: [
          { type: 'label', label: 'goto x' }, { type: 'number', name: 'X', default: 0 },
          { type: 'label', label: 'y' }, { type: 'number', name: 'Y', default: 0 }
        ]}]
      },
      {
        type: 'turtle_setheading', colour: '#15803d', tooltip: 'Set direction (0=up, 90=right, 180=down, 270=left)',
        inputs: [{ kind: 'dummy', fields: [{ type: 'label', label: 'setheading' }, { type: 'number', name: 'DEGREES', default: 90 }] }]
      },
    ],
    generators: {
      python: {
        turtle_init:     "return 'turtle.reset()\\n';",
        turtle_forward:  "const s=block.getFieldValue('STEPS'); return `turtle.forward(${s})\\n`;",
        turtle_backward: "const s=block.getFieldValue('STEPS'); return `turtle.backward(${s})\\n`;",
        turtle_right:    "const d=block.getFieldValue('DEGREES'); return `turtle.right(${d})\\n`;",
        turtle_left:     "const d=block.getFieldValue('DEGREES'); return `turtle.left(${d})\\n`;",
        turtle_pendown:  "return 'turtle.pendown()\\n';",
        turtle_penup:    "return 'turtle.penup()\\n';",
        turtle_color:    "const c=block.getFieldValue('COLOR'); return `turtle.color(${c})\\n`;",
        turtle_clear:    "return 'turtle.clear()\\n';",
        turtle_goto:     "const x=block.getFieldValue('X'),y=block.getFieldValue('Y'); return `turtle.goto(${x},${y})\\n`;",
        turtle_setheading: "const d=block.getFieldValue('DEGREES'); return `turtle.setheading(${d})\\n`;",
      },
      js: {
        turtle_init:     "return 'window.spriteController.setSpriteType(\"turtle\"); await window.spriteController.goTo(0,0); await window.spriteController.setDirection(90); window.spriteController.penDown();\\n';",
        turtle_forward:  "const s=block.getFieldValue('STEPS'); return `await window.spriteController.move(${s});\\n`;",
        turtle_backward: "const s=block.getFieldValue('STEPS'); return `await window.spriteController.move(-${s});\\n`;",
        turtle_right:    "const d=block.getFieldValue('DEGREES'); return `await window.spriteController.turn(${d});\\n`;",
        turtle_left:     "const d=block.getFieldValue('DEGREES'); return `await window.spriteController.turn(-${d});\\n`;",
        turtle_pendown:  "return 'window.spriteController.penDown();\\n';",
        turtle_penup:    "return 'window.spriteController.penUp();\\n';",
        turtle_color:    "const c=block.getFieldValue('COLOR'); return `window.spriteController.setPenColor(${JSON.stringify(c)});\\n`;",
        turtle_clear:    "return 'window.spriteController.clearPen();\\n';",
        turtle_goto:     "const x=block.getFieldValue('X'),y=block.getFieldValue('Y'); return `await window.spriteController.goTo(${x},${y});\\n`;",
        turtle_setheading: "const d=block.getFieldValue('DEGREES'); return `await window.spriteController.setDirection(${d});\\n`;",
      }
    },
    toolboxCategory: {
      kind: 'category', name: '🐢 Turtle', colour: '#15803d',
      contents: [
        { kind: 'block', type: 'turtle_init' },
        { kind: 'sep' },
        { kind: 'block', type: 'turtle_forward' },
        { kind: 'block', type: 'turtle_backward' },
        { kind: 'block', type: 'turtle_right' },
        { kind: 'block', type: 'turtle_left' },
        { kind: 'block', type: 'turtle_goto' },
        { kind: 'block', type: 'turtle_setheading' },
        { kind: 'sep' },
        { kind: 'block', type: 'turtle_pendown' },
        { kind: 'block', type: 'turtle_penup' },
        { kind: 'block', type: 'turtle_color' },
        { kind: 'block', type: 'turtle_clear' },
      ]
    }
  },
  {
    name: 'sprite-animations',
    version: '1.0.0',
    description: '점프, 흔들기, 회전, 깜빡임 애니메이션 블록',
    author: 'BlockPy',
    colour: '#e11d48',
    reversePatterns: [
      { python: '# anim_jump height={HEIGHT}', block: 'anim_jump' },
      { python: '# anim_shake times={TIMES}',  block: 'anim_shake' },
      { python: '# anim_spin speed={SPEED}',   block: 'anim_spin' },
      { python: '# anim_blink times={TIMES}',  block: 'anim_blink' },
    ],
    blocks: [
      {
        type: 'anim_jump', colour: '#e11d48', tooltip: '스프라이트를 점프',
        inputs: [{ kind: 'dummy', fields: [{ type: 'label', label: '🦘 jump height' }, { type: 'number', name: 'HEIGHT', default: 80 }] }]
      },
      {
        type: 'anim_shake', colour: '#e11d48', tooltip: '스프라이트 좌우 흔들기',
        inputs: [{ kind: 'dummy', fields: [{ type: 'label', label: '💥 shake times' }, { type: 'number', name: 'TIMES', default: 3 }] }]
      },
      {
        type: 'anim_spin', colour: '#be185d', tooltip: '360도 회전',
        inputs: [{ kind: 'dummy', fields: [{ type: 'label', label: '🌀 spin speed' }, { type: 'number', name: 'SPEED', default: 15 }] }]
      },
      {
        type: 'anim_blink', colour: '#be185d', tooltip: '깜빡이기',
        inputs: [{ kind: 'dummy', fields: [{ type: 'label', label: '✨ blink times' }, { type: 'number', name: 'TIMES', default: 3 }] }]
      },
    ],
    generators: {
      python: {
        anim_jump:  "const h=block.getFieldValue('HEIGHT'); return `# anim_jump height=${h}\\n`;",
        anim_shake: "const t=block.getFieldValue('TIMES');  return `# anim_shake times=${t}\\n`;",
        anim_spin:  "const s=block.getFieldValue('SPEED');  return `# anim_spin speed=${s}\\n`;",
        anim_blink: "const t=block.getFieldValue('TIMES');  return `# anim_blink times=${t}\\n`;",
      },
      js: {
        anim_jump:  "const h=Number(block.getFieldValue('HEIGHT')); const steps=Math.round(h/4); return `for(let _i=0;_i<${steps};_i++){await window.spriteController.changeY(4);await new Promise(r=>setTimeout(r,16));}for(let _i=0;_i<${steps};_i++){await window.spriteController.changeY(-4);await new Promise(r=>setTimeout(r,16));}`+'\\n';",
        anim_shake: "const t=Number(block.getFieldValue('TIMES')); return `for(let _i=0;_i<${t};_i++){await window.spriteController.changeX(12);await new Promise(r=>setTimeout(r,60));await window.spriteController.changeX(-24);await new Promise(r=>setTimeout(r,60));await window.spriteController.changeX(12);await new Promise(r=>setTimeout(r,60));}`+'\\n';",
        anim_spin:  "const s=Number(block.getFieldValue('SPEED')); const steps=Math.ceil(360/s); return `for(let _i=0;_i<${steps};_i++){await window.spriteController.turn(${s});await new Promise(r=>setTimeout(r,16));}`+'\\n';",
        anim_blink: "const t=Number(block.getFieldValue('TIMES')); return `for(let _i=0;_i<${t};_i++){await window.spriteController.setVisible(false);await new Promise(r=>setTimeout(r,200));await window.spriteController.setVisible(true);await new Promise(r=>setTimeout(r,200));}`+'\\n';",
      }
    },
    toolboxCategory: {
      kind: 'category', name: '🎮 Animations', colour: '#e11d48',
      contents: [
        { kind: 'block', type: 'anim_jump' },
        { kind: 'block', type: 'anim_shake' },
        { kind: 'block', type: 'anim_spin' },
        { kind: 'block', type: 'anim_blink' },
      ]
    }
  },
  {
    name: 'game-utils',
    version: '1.0.0',
    description: 'Simple game utilities: score tracking, sprite collision, game over',
    author: 'BlockPy',
    colour: '#7c3aed',
    reversePatterns: [
      { python: 'game.set_score({SCORE})',   block: 'game_set_score' },
      { python: 'game.change_score({DELTA})', block: 'game_change_score' },
      { python: 'game.get_score()',          block: 'game_get_score' },
      { python: 'game.touching_sprite({NAME})', block: 'game_touching_sprite' },
      { python: 'game.game_over()',          block: 'game_over' },
    ],
    blocks: [
      {
        type: 'game_init', colour: '#6d28d9', tooltip: 'Initialize game state (score = 0)',
        inputs: [{ kind: 'dummy', fields: [{ type: 'label', label: '🎮 game start' }] }]
      },
      {
        type: 'game_set_score', colour: '#7c3aed', tooltip: 'Set score to a specific value',
        inputs: [{ kind: 'dummy', fields: [{ type: 'label', label: 'set score to' }, { type: 'number', name: 'SCORE', default: 0 }] }]
      },
      {
        type: 'game_change_score', colour: '#7c3aed', tooltip: 'Change score by amount',
        inputs: [{ kind: 'dummy', fields: [{ type: 'label', label: 'change score by' }, { type: 'number', name: 'DELTA', default: 1 }] }]
      },
      {
        type: 'game_get_score', colour: '#7c3aed', tooltip: 'Get current score', output: true,
        inputs: [{ kind: 'dummy', fields: [{ type: 'label', label: 'score' }] }]
      },
      {
        type: 'game_touching_sprite', colour: '#8b5cf6', tooltip: 'Check if touching another sprite', output: true,
        inputs: [{ kind: 'dummy', fields: [{ type: 'label', label: 'touching sprite' }, { type: 'text_input', name: 'NAME', default: 'enemy' }] }]
      },
      {
        type: 'game_over', colour: '#6d28d9', tooltip: 'End the game',
        inputs: [{ kind: 'dummy', fields: [{ type: 'label', label: '🛑 game over' }] }]
      },
    ],
    generators: {
      python: {
        game_init:     "return 'game.init()\\n';",
        game_set_score:  "const s=block.getFieldValue('SCORE'); return `game.set_score(${s})\\n`;",
        game_change_score: "const d=block.getFieldValue('DELTA'); return `game.change_score(${d})\\n`;",
        game_get_score:  "return ['game.get_score()', pythonGenerator.ORDER_FUNCTION_CALL];",
        game_touching_sprite: "const n=block.getFieldValue('NAME'); return [`game.touching_sprite(${JSON.stringify(n)})`, pythonGenerator.ORDER_FUNCTION_CALL];",
        game_over:     "return 'game.game_over()\\n';",
      },
      js: {
        game_init:     "return 'window._gameScore = 0;\\n';",
        game_set_score:  "const s=block.getFieldValue('SCORE'); return `window._gameScore = ${s};\\n`;",
        game_change_score: "const d=block.getFieldValue('DELTA'); return `window._gameScore = (window._gameScore || 0) + ${d};\\n`;",
        game_get_score:  "return ['(window._gameScore || 0)', javascriptGenerator.ORDER_ATOMIC];",
        game_touching_sprite: "const n=block.getFieldValue('NAME'); return [`false /* touching ${n} not implemented */`, javascriptGenerator.ORDER_ATOMIC];",
        game_over:     "return 'throw new Error(\"Game Over!\");\\n';",
      }
    },
    toolboxCategory: {
      kind: 'category', name: '🎮 Game Utils', colour: '#7c3aed',
      contents: [
        { kind: 'block', type: 'game_init' },
        { kind: 'sep' },
        { kind: 'block', type: 'game_set_score' },
        { kind: 'block', type: 'game_change_score' },
        { kind: 'block', type: 'game_get_score' },
        { kind: 'sep' },
        { kind: 'block', type: 'game_touching_sprite' },
        { kind: 'block', type: 'game_over' },
      ]
    }
  },
  {
    name: 'keyboard-events',
    version: '1.0.0',
    description: 'Keyboard event handlers - when key pressed, conditional checks',
    author: 'BlockPy',
    colour: '#dc2626',
    reversePatterns: [],
    blocks: [
      {
        type: 'event_when_key_pressed',
        colour: '#dc2626',
        tooltip: 'Runs when a specific key is pressed',
        previousStatement: false,
        nextStatement: false,
        inputs: [
          {
            kind: 'dummy',
            fields: [
              { type: 'label', label: '⌨️ when key' },
              {
                type: 'dropdown',
                name: 'KEY',
                options: [
                  ['space', 'Space'],
                  ['up arrow ↑', 'ArrowUp'],
                  ['down arrow ↓', 'ArrowDown'],
                  ['left arrow ←', 'ArrowLeft'],
                  ['right arrow →', 'ArrowRight'],
                  ['enter', 'Enter'],
                  ['a', 'a'],
                  ['b', 'b'],
                  ['c', 'c'],
                  ['d', 'd'],
                  ['w', 'w'],
                  ['s', 's']
                ]
              },
              { type: 'label', label: 'pressed' }
            ]
          },
          {
            kind: 'statement',
            name: 'DO',
            label: ''
          }
        ]
      },
      {
        type: 'event_when_any_key_pressed',
        colour: '#dc2626',
        tooltip: 'Runs when any key is pressed',
        previousStatement: false,
        nextStatement: false,
        inputs: [
          {
            kind: 'dummy',
            fields: [
              { type: 'label', label: '⌨️ when any key pressed' }
            ]
          },
          {
            kind: 'statement',
            name: 'DO',
            label: ''
          }
        ]
      },
      {
        type: 'event_is_key_pressed',
        colour: '#b91c1c',
        tooltip: 'Check if a key is currently pressed',
        output: true,
        inputs: [
          {
            kind: 'dummy',
            fields: [
              { type: 'label', label: 'key' },
              {
                type: 'dropdown',
                name: 'KEY',
                options: [
                  ['space', 'Space'],
                  ['up arrow ↑', 'ArrowUp'],
                  ['down arrow ↓', 'ArrowDown'],
                  ['left arrow ←', 'ArrowLeft'],
                  ['right arrow →', 'ArrowRight'],
                  ['a', 'a'],
                  ['w', 'w'],
                  ['s', 's'],
                  ['d', 'd']
                ]
              },
              { type: 'label', label: 'pressed?' }
            ]
          }
        ]
      }
    ],
    generators: {
      python: {
        event_when_key_pressed: "const key=block.getFieldValue('KEY'); const code=pythonGenerator.statementToCode(block,'DO')||'  pass\\n'; return `# Event: when ${key} pressed\\ndef on_key_${key.replace(/[^a-zA-Z0-9]/g,'_')}():\\n${code}\\n`;",
        event_when_any_key_pressed: "const code=pythonGenerator.statementToCode(block,'DO')||'  pass\\n'; return `# Event: when any key pressed\\ndef on_any_key():\\n${code}\\n`;",
        event_is_key_pressed: "const key=block.getFieldValue('KEY'); return [`keyboard.is_pressed('${key}')`, pythonGenerator.ORDER_FUNCTION_CALL];"
      },
      js: {
        event_when_key_pressed: "const key=block.getFieldValue('KEY'); const code=javascriptGenerator.statementToCode(block,'DO'); return `// Event: when ${key} pressed\\nwindow.addEventListener('keydown', async (e) => {\\n  if (e.code === '${key}' || e.key === '${key}') {\\n${code}  }\\n});\\n`;",
        event_when_any_key_pressed: "const code=javascriptGenerator.statementToCode(block,'DO'); return `// Event: when any key pressed\\nwindow.addEventListener('keydown', async (e) => {\\n${code}});\\n`;",
        event_is_key_pressed: "const key=block.getFieldValue('KEY'); return [`(await window.spriteController.isKeyPressed('${key}'))`, javascriptGenerator.ORDER_ATOMIC];"
      }
    },
    toolboxCategory: {
      kind: 'category',
      name: '⌨️ Keyboard',
      colour: '#dc2626',
      contents: [
        { kind: 'block', type: 'event_when_key_pressed' },
        { kind: 'block', type: 'event_when_any_key_pressed' },
        { kind: 'sep' },
        { kind: 'block', type: 'event_is_key_pressed' }
      ]
    }
  }
];
