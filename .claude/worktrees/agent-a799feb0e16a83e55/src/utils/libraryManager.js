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
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
};

const saveLibraries = (libs) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(libs));
};

// ── Install ───────────────────────────────────────────────────────────────────

export const installLibrary = (pkg) => {
  if (!pkg || !pkg.name || !pkg.blocks) throw new Error('Invalid library package: missing name or blocks');

  pkg.blocks.forEach(blockDef => {
    if (Blockly.Blocks[blockDef.type]) return;

    Blockly.Blocks[blockDef.type] = {
      init: function () {
        const block = this;
        block.setColour(blockDef.colour || '#555');
        block.setTooltip(blockDef.tooltip || '');

        (blockDef.inputs || []).forEach(inp => {
          if (inp.kind === 'dummy') {
            const di = block.appendDummyInput();
            (inp.fields || []).forEach(f => {
              if (f.type === 'text_input') di.appendField(new Blockly.FieldTextInput(f.default || ''), f.name);
              else if (f.type === 'dropdown') di.appendField(new Blockly.FieldDropdown(f.options), f.name);
              else if (f.type === 'number') di.appendField(new Blockly.FieldNumber(f.default ?? 0), f.name);
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

        if (blockDef.output) { block.setOutput(true, null); }
        else {
          if (blockDef.previousStatement !== false) block.setPreviousStatement(true, null);
          if (blockDef.nextStatement !== false) block.setNextStatement(true, null);
        }
      }
    };

    const jsGen = pkg.generators?.js?.[blockDef.type];
    const pyGen = pkg.generators?.python?.[blockDef.type];
    // eslint-disable-next-line no-new-func
    if (jsGen) javascriptGenerator.forBlock[blockDef.type] = new Function('block', 'javascriptGenerator', jsGen);
    // eslint-disable-next-line no-new-func
    if (pyGen) pythonGenerator.forBlock[blockDef.type] = new Function('block', 'pythonGenerator', pyGen);
  });

  _registerReversePatterns(pkg);

  const existing = getInstalledLibraries();
  const idx = existing.findIndex(l => l.name === pkg.name);
  const entry = { name: pkg.name, version: pkg.version || '1.0.0', description: pkg.description || '', author: pkg.author || '', installedAt: new Date().toISOString(), pkg };
  if (idx >= 0) existing[idx] = entry; else existing.push(entry);
  saveLibraries(existing);
  return entry;
};

// ── Uninstall ─────────────────────────────────────────────────────────────────

export const uninstallLibrary = (name) => {
  saveLibraries(getInstalledLibraries().filter(l => l.name !== name));
};

// ── Restore on boot ───────────────────────────────────────────────────────────

export const restoreLibraries = () => {
  const libs = getInstalledLibraries();
  libs.forEach(entry => {
    try { installLibrary(entry.pkg); } catch (e) { console.warn(`Failed to restore "${entry.name}":`, e); }
  });
  return libs;
};

// ── Dynamic toolbox categories for installed libraries ────────────────────────

export const buildLibraryToolboxCategories = () =>
  getInstalledLibraries().map(entry =>
    entry.pkg.toolboxCategory || {
      kind: 'category',
      name: `📦 ${entry.pkg.name}`,
      colour: entry.pkg.colour || '#555',
      contents: (entry.pkg.blocks || []).map(b => ({ kind: 'block', type: b.type }))
    }
  );

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
  }
];
