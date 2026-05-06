/**
 * Exact Python block family (Blueprint Layer 3).
 *
 * These blocks exist to preserve the AST structure of arbitrary Python without
 * collapsing anything to a text field. They are not "pretty" — they're the
 * honest, lossless representation. Semantic library blocks sit on top of them;
 * when no library match is available, we drop to exact blocks instead of
 * stringly `py pass` / `comment`.
 *
 * Contract (Blueprint §설계 원칙):
 *   - exact blocks must not lose structure to a FieldTextInput
 *   - every exact block has a Python generator that reproduces the original
 *   - every exact block has a roundtrip identity: IR → block → IR
 */

import * as Blockly from 'blockly/core';
import { javascriptGenerator } from 'blockly/javascript';
import { pythonGenerator } from 'blockly/python';

// ── helpers ──────────────────────────────────────────────────────────────────

/** Dynamic-arity value-input block factory. */
const defineDynamicBlock = (type, { colour, tooltip, isStatement, prefix, suffix, sep, slotLabel }) => {
  Blockly.Blocks[type] = {
    init: function () {
      this.argCount_ = 0;
      this.appendDummyInput('HEADER').appendField(prefix || '');
      if (suffix !== undefined) this.appendDummyInput('TAIL').appendField(suffix);
      this.setInputsInline(true);
      if (isStatement) {
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
      } else {
        this.setOutput(true, null);
      }
      this.setColour(colour);
      this.setTooltip(tooltip);
    },
    saveExtraState: function () { return { argCount: this.argCount_ }; },
    loadExtraState: function (state) { this._setCount(state.argCount ?? 0); },
    mutationToDom: function () {
      const d = document.createElement('mutation');
      d.setAttribute('items', String(this.argCount_ || 0));
      return d;
    },
    domToMutation: function (xml) {
      this._setCount(parseInt(xml.getAttribute('items'), 10) || 0);
    },
    _setCount: function (n) {
      n = Math.max(0, Math.min(50, n | 0));
      let i = 0;
      while (this.getInput(`ITEM${i}`)) { this.removeInput(`ITEM${i}`); i++; }
      if (this.getInput('TAIL')) this.removeInput('TAIL');
      for (let k = 0; k < n; k++) {
        const inp = this.appendValueInput(`ITEM${k}`).setCheck(null);
        if (k === 0 && slotLabel) inp.appendField(slotLabel);
        if (k > 0 && sep) inp.appendField(sep);
      }
      if (suffix !== undefined) this.appendDummyInput('TAIL').appendField(suffix);
      this.argCount_ = n;
    },
  };
};

const collectItems = (block, gen, n) => {
  const out = [];
  for (let i = 0; i < n; i++) {
    const v = gen.valueToCode(block, `ITEM${i}`, 0);
    out.push(v && v.trim() !== '' ? v : 'None');
  }
  return out;
};

// ── py_attr: Attribute access  obj.attr ─────────────────────────────────────

Blockly.Blocks['py_attr'] = {
  init: function () {
    this.appendValueInput('OBJ').setCheck(null);
    this.appendDummyInput()
      .appendField('.')
      .appendField(new Blockly.FieldTextInput('attr'), 'ATTR');
    this.setInputsInline(true);
    this.setOutput(true, null);
    this.setColour('#f97316');
    this.setTooltip('Attribute access: obj.attr (structural, not a string)');
  }
};
pythonGenerator.forBlock['py_attr'] = function (block) {
  const obj = pythonGenerator.valueToCode(block, 'OBJ', 0) || '_';
  const attr = block.getFieldValue('ATTR') || 'attr';
  return [`${obj}.${attr}`, 0];
};
javascriptGenerator.forBlock['py_attr'] = pythonGenerator.forBlock['py_attr'];

// ── py_subscript: obj[slice] ────────────────────────────────────────────────

Blockly.Blocks['py_subscript'] = {
  init: function () {
    this.appendValueInput('OBJ').setCheck(null);
    this.appendDummyInput().appendField('[');
    this.appendValueInput('SLICE').setCheck(null);
    this.appendDummyInput().appendField(']');
    this.setInputsInline(true);
    this.setOutput(true, null);
    this.setColour('#f97316');
    this.setTooltip('Subscript: obj[slice]');
  }
};
pythonGenerator.forBlock['py_subscript'] = function (block) {
  const obj = pythonGenerator.valueToCode(block, 'OBJ', 0) || '_';
  const slice = pythonGenerator.valueToCode(block, 'SLICE', 0) || '0';
  return [`${obj}[${slice}]`, 0];
};
javascriptGenerator.forBlock['py_subscript'] = pythonGenerator.forBlock['py_subscript'];

// ── py_slice: low:high:step ─────────────────────────────────────────────────

Blockly.Blocks['py_slice'] = {
  init: function () {
    this.appendValueInput('LOW').setCheck(null);
    this.appendDummyInput().appendField(':');
    this.appendValueInput('HIGH').setCheck(null);
    this.appendDummyInput().appendField(':');
    this.appendValueInput('STEP').setCheck(null);
    this.setInputsInline(true);
    this.setOutput(true, null);
    this.setColour('#f97316');
    this.setTooltip('Slice: low:high:step (any slot may be empty)');
  }
};
pythonGenerator.forBlock['py_slice'] = function (block) {
  const lo = pythonGenerator.valueToCode(block, 'LOW', 0);
  const hi = pythonGenerator.valueToCode(block, 'HIGH', 0);
  const st = pythonGenerator.valueToCode(block, 'STEP', 0);
  const s = st ? `:${st}` : '';
  return [`${lo || ''}:${hi || ''}${s}`, 0];
};
javascriptGenerator.forBlock['py_slice'] = pythonGenerator.forBlock['py_slice'];

// ── py_keyword_arg: name=value  (used inside py_call's value slots) ────────

Blockly.Blocks['py_keyword_arg'] = {
  init: function () {
    this.appendDummyInput()
      .appendField(new Blockly.FieldTextInput('kw'), 'NAME')
      .appendField('=');
    this.appendValueInput('VALUE').setCheck(null);
    this.setInputsInline(true);
    this.setOutput(true, null);
    this.setColour('#22c55e');
    this.setTooltip('Keyword argument: name=value');
  }
};
pythonGenerator.forBlock['py_keyword_arg'] = function (block) {
  const n = block.getFieldValue('NAME') || 'kw';
  const v = pythonGenerator.valueToCode(block, 'VALUE', 0) || 'None';
  return [`${n}=${v}`, 0];
};
javascriptGenerator.forBlock['py_keyword_arg'] = pythonGenerator.forBlock['py_keyword_arg'];

// ── py_tuple: (a, b, c) ────────────────────────────────────────────────────

defineDynamicBlock('py_tuple', {
  colour: '#eab308',
  tooltip: 'Tuple: (a, b, c)',
  isStatement: false,
  prefix: 'tuple',
  suffix: '',
  sep: ',',
});
pythonGenerator.forBlock['py_tuple'] = function (block) {
  const items = collectItems(block, pythonGenerator, block.argCount_ || 0);
  if (items.length === 0) return ['()', 0];
  if (items.length === 1) return [`(${items[0]},)`, 0];
  return [`(${items.join(', ')})`, 0];
};
javascriptGenerator.forBlock['py_tuple'] = pythonGenerator.forBlock['py_tuple'];

// ── py_list: [a, b, c] ─────────────────────────────────────────────────────

defineDynamicBlock('py_list', {
  colour: '#eab308',
  tooltip: 'List: [a, b, c]',
  isStatement: false,
  prefix: 'list',
  suffix: '',
  sep: ',',
});
pythonGenerator.forBlock['py_list'] = function (block) {
  const items = collectItems(block, pythonGenerator, block.argCount_ || 0);
  return [`[${items.join(', ')}]`, 0];
};
javascriptGenerator.forBlock['py_list'] = pythonGenerator.forBlock['py_list'];

// ── py_dict: {k: v, ...} — pairs go in alternating ITEM slots ──────────────
// Items are expected as [key0, value0, key1, value1, ...] for simplicity.

defineDynamicBlock('py_dict', {
  colour: '#eab308',
  tooltip: 'Dict: {key: value, ...}  — slots are key,value,key,value,...',
  isStatement: false,
  prefix: 'dict',
  suffix: '',
  sep: ',',
});
pythonGenerator.forBlock['py_dict'] = function (block) {
  const items = collectItems(block, pythonGenerator, block.argCount_ || 0);
  const pairs = [];
  for (let i = 0; i + 1 < items.length; i += 2) pairs.push(`${items[i]}: ${items[i + 1]}`);
  return [`{${pairs.join(', ')}}`, 0];
};
javascriptGenerator.forBlock['py_dict'] = pythonGenerator.forBlock['py_dict'];

// ── py_none / py_bool / py_fstring literals ────────────────────────────────

Blockly.Blocks['py_none'] = {
  init: function () {
    this.appendDummyInput().appendField('None');
    this.setOutput(true, null);
    this.setColour('#6b7280');
  }
};
pythonGenerator.forBlock['py_none'] = () => ['None', 0];
javascriptGenerator.forBlock['py_none'] = () => ['null', 0];

Blockly.Blocks['py_bool'] = {
  init: function () {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown([['True', 'True'], ['False', 'False']]), 'VAL');
    this.setOutput(true, null);
    this.setColour('#6b7280');
  }
};
pythonGenerator.forBlock['py_bool'] = function (block) {
  return [block.getFieldValue('VAL') || 'False', 0];
};
javascriptGenerator.forBlock['py_bool'] = function (block) {
  return [block.getFieldValue('VAL') === 'True' ? 'true' : 'false', 0];
};

// ── py_fstring — preserves f"…{x}…{y}…" structure ─────────────────────────
// Stored as text template with {N} placeholders; value inputs fill the holes.

Blockly.Blocks['py_fstring'] = {
  init: function () {
    this.argCount_ = 0;
    this.appendDummyInput('HEADER')
      .appendField('f"')
      .appendField(new Blockly.FieldTextInput(''), 'TEMPLATE')
      .appendField('"');
    this.setInputsInline(true);
    this.setOutput(true, null);
    this.setColour('#facc15');
    this.setTooltip('f-string with {0},{1},… placeholders filled by plugged-in value blocks.');
  },
  saveExtraState: function () { return { argCount: this.argCount_ }; },
  loadExtraState: function (state) { this._setCount(state.argCount ?? 0); },
  _setCount: function (n) {
    n = Math.max(0, Math.min(20, n | 0));
    let i = 0;
    while (this.getInput(`VAL${i}`)) { this.removeInput(`VAL${i}`); i++; }
    for (let k = 0; k < n; k++) this.appendValueInput(`VAL${k}`).setCheck(null).appendField(`{${k}}`);
    this.argCount_ = n;
  },
};
pythonGenerator.forBlock['py_fstring'] = function (block) {
  const tpl = block.getFieldValue('TEMPLATE') || '';
  const n = block.argCount_ || 0;
  const values = [];
  for (let i = 0; i < n; i++) values.push(pythonGenerator.valueToCode(block, `VAL${i}`, 0) || '');
  const body = tpl.replace(/\{(\d+)\}/g, (_, idx) => `{${values[parseInt(idx, 10)] || ''}}`);
  return [`f"${body}"`, 0];
};
javascriptGenerator.forBlock['py_fstring'] = pythonGenerator.forBlock['py_fstring'];

// ── py_tuple_assign:   a, b = <value> ──────────────────────────────────────
// Dynamic number of target name fields.

Blockly.Blocks['py_tuple_assign'] = {
  init: function () {
    this.argCount_ = 2;
    this.appendDummyInput('HEADER')
      .appendField(new Blockly.FieldImage(
        "data:image/svg+xml;base64," + btoa(
          "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'><circle cx='8' cy='8' r='7' fill='#10b981'/><path d='M4 8h8M8 4v8' stroke='white' stroke-width='2'/></svg>"
        ), 16, 16, '+', () => this._setCount((this.argCount_ || 2) + 1)))
      .appendField(new Blockly.FieldImage(
        "data:image/svg+xml;base64," + btoa(
          "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'><circle cx='8' cy='8' r='7' fill='#ef4444'/><path d='M4 8h8' stroke='white' stroke-width='2'/></svg>"
        ), 16, 16, '−', () => this._setCount(Math.max(2, (this.argCount_ || 2) - 1))));
    this._appendTargets(2);
    this.appendDummyInput('EQ').appendField('=');
    this.appendValueInput('VALUE').setCheck(null);
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#a855f7');
    this.setTooltip('Tuple / multi-target assignment: a, b = expr');
  },
  saveExtraState: function () { return { argCount: this.argCount_ }; },
  loadExtraState: function (state) { this._setCount(state.argCount ?? 2); },
  _appendTargets: function (n) {
    for (let i = 0; i < n; i++) {
      const inp = this.appendDummyInput(`TGT${i}`);
      if (i > 0) inp.appendField(',');
      inp.appendField(new Blockly.FieldTextInput('x'), `NAME${i}`);
    }
  },
  _setCount: function (n) {
    n = Math.max(2, Math.min(8, n | 0));
    // Save current names so re-append preserves them
    const saved = [];
    for (let i = 0; i < (this.argCount_ || 0); i++) {
      saved.push(this.getFieldValue(`NAME${i}`) || 'x');
      this.removeInput(`TGT${i}`);
    }
    this.removeInput('EQ');
    this.removeInput('VALUE');
    this._appendTargets(n);
    for (let i = 0; i < n; i++) {
      if (saved[i]) this.setFieldValue(saved[i], `NAME${i}`);
    }
    this.appendDummyInput('EQ').appendField('=');
    this.appendValueInput('VALUE').setCheck(null);
    this.argCount_ = n;
  },
};
pythonGenerator.forBlock['py_tuple_assign'] = function (block) {
  const n = block.argCount_ || 2;
  const names = [];
  for (let i = 0; i < n; i++) names.push(block.getFieldValue(`NAME${i}`) || '_');
  const value = pythonGenerator.valueToCode(block, 'VALUE', 0) || 'None';
  return `${names.join(', ')} = ${value}\n`;
};
javascriptGenerator.forBlock['py_tuple_assign'] = function (block) {
  const n = block.argCount_ || 2;
  const names = [];
  for (let i = 0; i < n; i++) names.push(block.getFieldValue(`NAME${i}`) || '_');
  const value = javascriptGenerator.valueToCode(block, 'VALUE', 0) || 'null';
  return `[${names.join(', ')}] = ${value};\n`;
};

// ── py_ifexp: value if cond else value  (ternary conditional, value block) ─

Blockly.Blocks['py_ifexp'] = {
  init: function () {
    this.appendValueInput('BODY').setCheck(null);
    this.appendValueInput('TEST').setCheck(null).appendField('if');
    this.appendValueInput('ELSE').setCheck(null).appendField('else');
    this.setInputsInline(true);
    this.setOutput(true, null);
    this.setColour('#0284c7');
    this.setTooltip('Conditional expression: <body> if <test> else <else>');
  }
};
pythonGenerator.forBlock['py_ifexp'] = function (block) {
  const body = pythonGenerator.valueToCode(block, 'BODY', 0) || 'None';
  const test = pythonGenerator.valueToCode(block, 'TEST', 0) || 'True';
  const alt  = pythonGenerator.valueToCode(block, 'ELSE', 0) || 'None';
  return [`(${body} if ${test} else ${alt})`, 0];
};
javascriptGenerator.forBlock['py_ifexp'] = function (block) {
  const body = javascriptGenerator.valueToCode(block, 'BODY', 0) || 'null';
  const test = javascriptGenerator.valueToCode(block, 'TEST', 0) || 'false';
  const alt  = javascriptGenerator.valueToCode(block, 'ELSE', 0) || 'null';
  return [`(${test} ? ${body} : ${alt})`, 0];
};

// ── py_subscript_assign: obj[slice] = value  (statement form) ─────────────
// Captures `frame[(y, :)] = (y, 128, 255 - y)` etc. without losing the LHS
// to a raw_python text fallback.

Blockly.Blocks['py_subscript_assign'] = {
  init: function () {
    this.appendValueInput('OBJ').setCheck(null);
    this.appendDummyInput().appendField('[');
    this.appendValueInput('SLICE').setCheck(null);
    this.appendDummyInput().appendField('] =');
    this.appendValueInput('VALUE').setCheck(null);
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#a855f7');
    this.setTooltip('Assign to a subscript: obj[slice] = value');
  }
};
pythonGenerator.forBlock['py_subscript_assign'] = function (block) {
  const o = pythonGenerator.valueToCode(block, 'OBJ', 0) || '_';
  const s = pythonGenerator.valueToCode(block, 'SLICE', 0) || '0';
  const v = pythonGenerator.valueToCode(block, 'VALUE', 0) || 'None';
  return `${o}[${s}] = ${v}\n`;
};
javascriptGenerator.forBlock['py_subscript_assign'] = function (block) {
  const o = javascriptGenerator.valueToCode(block, 'OBJ', 0) || '_';
  const s = javascriptGenerator.valueToCode(block, 'SLICE', 0) || '0';
  const v = javascriptGenerator.valueToCode(block, 'VALUE', 0) || 'null';
  return `${o}[${s}] = ${v};\n`;
};

// ── py_attr_assign: obj.attr = value (statement form) ─────────────────────

Blockly.Blocks['py_attr_assign'] = {
  init: function () {
    this.appendValueInput('OBJ').setCheck(null);
    this.appendDummyInput()
      .appendField('.')
      .appendField(new Blockly.FieldTextInput('attr'), 'ATTR')
      .appendField('=');
    this.appendValueInput('VALUE').setCheck(null);
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#a855f7');
    this.setTooltip('Assign to an attribute: obj.attr = value');
  }
};
pythonGenerator.forBlock['py_attr_assign'] = function (block) {
  const o = pythonGenerator.valueToCode(block, 'OBJ', 0) || '_';
  const a = block.getFieldValue('ATTR') || 'attr';
  const v = pythonGenerator.valueToCode(block, 'VALUE', 0) || 'None';
  return `${o}.${a} = ${v}\n`;
};
javascriptGenerator.forBlock['py_attr_assign'] = function (block) {
  const o = javascriptGenerator.valueToCode(block, 'OBJ', 0) || '_';
  const a = block.getFieldValue('ATTR') || 'attr';
  const v = javascriptGenerator.valueToCode(block, 'VALUE', 0) || 'null';
  return `${o}.${a} = ${v};\n`;
};

// ── py_with: with <expr> as <name>:  body ──────────────────────────────────

Blockly.Blocks['py_with'] = {
  init: function () {
    this.appendValueInput('EXPR').setCheck(null).appendField('with');
    this.appendDummyInput()
      .appendField('as')
      .appendField(new Blockly.FieldTextInput('ctx'), 'NAME')
      .appendField(':');
    this.appendStatementInput('BODY').setCheck(null);
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#0ea5e9');
    this.setTooltip('with <expr> as <name>:');
  }
};
pythonGenerator.forBlock['py_with'] = function (block) {
  const expr = pythonGenerator.valueToCode(block, 'EXPR', 0) || 'None';
  const name = block.getFieldValue('NAME') || 'ctx';
  const body = pythonGenerator.statementToCode(block, 'BODY') || '  pass\n';
  return `with ${expr} as ${name}:\n${body}`;
};
javascriptGenerator.forBlock['py_with'] = function (block) {
  return `/* with */ {\n${javascriptGenerator.statementToCode(block, 'BODY')}}\n`;
};

// ── py_try: try: body  except: handler  finally: final ─────────────────────

Blockly.Blocks['py_try'] = {
  init: function () {
    this.appendDummyInput().appendField('try:');
    this.appendStatementInput('BODY').setCheck(null);
    this.appendDummyInput()
      .appendField('except')
      .appendField(new Blockly.FieldTextInput(''), 'EXC')
      .appendField(':');
    this.appendStatementInput('HANDLER').setCheck(null);
    this.appendDummyInput().appendField('finally:');
    this.appendStatementInput('FINAL').setCheck(null);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#0ea5e9');
    this.setTooltip('try / except / finally');
  }
};
pythonGenerator.forBlock['py_try'] = function (block) {
  const body = pythonGenerator.statementToCode(block, 'BODY') || '  pass\n';
  const exc = (block.getFieldValue('EXC') || '').trim();
  const handler = pythonGenerator.statementToCode(block, 'HANDLER') || '  pass\n';
  const final = pythonGenerator.statementToCode(block, 'FINAL') || '';
  let out = `try:\n${body}except${exc ? ' ' + exc : ''}:\n${handler}`;
  if (final.trim()) out += `finally:\n${final}`;
  return out;
};
javascriptGenerator.forBlock['py_try'] = function (block) {
  return `try {\n${javascriptGenerator.statementToCode(block, 'BODY')}} catch (e) {\n${javascriptGenerator.statementToCode(block, 'HANDLER')}}\n`;
};

// ── py_raise ────────────────────────────────────────────────────────────────

Blockly.Blocks['py_raise'] = {
  init: function () {
    this.appendValueInput('EXC').setCheck(null).appendField('raise');
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#dc2626');
  }
};
pythonGenerator.forBlock['py_raise'] = function (block) {
  const exc = pythonGenerator.valueToCode(block, 'EXC', 0);
  return `raise${exc ? ' ' + exc : ''}\n`;
};
javascriptGenerator.forBlock['py_raise'] = function (block) {
  const exc = javascriptGenerator.valueToCode(block, 'EXC', 0) || 'new Error()';
  return `throw ${exc};\n`;
};

// ── py_return: return <expr?>  ─────────────────────────────────────────────
// structure_return_typed locked value into math_number — that ruined expr trees.
// This exact block accepts any value block (or nothing) as the return value.

Blockly.Blocks['py_return'] = {
  init: function () {
    this.appendValueInput('VALUE').setCheck(null).appendField('return');
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#b91c1c');
    this.setTooltip('return <expr> — leave VALUE empty for a bare return.');
  }
};
pythonGenerator.forBlock['py_return'] = function (block) {
  const v = pythonGenerator.valueToCode(block, 'VALUE', 0);
  return v && v.trim() ? `return ${v}\n` : 'return\n';
};
javascriptGenerator.forBlock['py_return'] = function (block) {
  const v = javascriptGenerator.valueToCode(block, 'VALUE', 0);
  return v && v.trim() ? `return ${v};\n` : 'return;\n';
};

// ── py_lambda: lambda args: expr  ──────────────────────────────────────────

Blockly.Blocks['py_lambda'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('lambda')
      .appendField(new Blockly.FieldTextInput(''), 'ARGS')
      .appendField(':');
    this.appendValueInput('BODY').setCheck(null);
    this.setInputsInline(true);
    this.setOutput(true, null);
    this.setColour('#a855f7');
    this.setTooltip('Anonymous function — ARGS is a comma-separated param list.');
  }
};
pythonGenerator.forBlock['py_lambda'] = function (block) {
  const args = block.getFieldValue('ARGS') || '';
  const body = pythonGenerator.valueToCode(block, 'BODY', 0) || 'None';
  return [`lambda ${args}: ${body}`, 0];
};
javascriptGenerator.forBlock['py_lambda'] = function (block) {
  const args = block.getFieldValue('ARGS') || '';
  const body = javascriptGenerator.valueToCode(block, 'BODY', 0) || 'null';
  return [`((${args}) => ${body})`, 0];
};

// ── py_comprehension: [expr for target in iter if cond]  ───────────────────

Blockly.Blocks['py_comprehension'] = {
  init: function () {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown([
        ['[list]', 'list'], ['{set}', 'set'], ['(generator)', 'gen'],
      ]), 'KIND');
    this.appendValueInput('EXPR').setCheck(null).appendField('expr');
    this.appendDummyInput()
      .appendField('for')
      .appendField(new Blockly.FieldTextInput('x'), 'TARGET')
      .appendField('in');
    this.appendValueInput('ITER').setCheck(null);
    this.appendValueInput('COND').setCheck(null).appendField('if');
    this.setInputsInline(true);
    this.setOutput(true, null);
    this.setColour('#db2777');
    this.setTooltip('Comprehension — leave the condition empty if not needed.');
  }
};
pythonGenerator.forBlock['py_comprehension'] = function (block) {
  const kind = block.getFieldValue('KIND') || 'list';
  const expr = pythonGenerator.valueToCode(block, 'EXPR', 0) || 'None';
  const target = block.getFieldValue('TARGET') || 'x';
  const iter = pythonGenerator.valueToCode(block, 'ITER', 0) || '[]';
  const cond = pythonGenerator.valueToCode(block, 'COND', 0);
  const core = `${expr} for ${target} in ${iter}${cond && cond.trim() ? ` if ${cond}` : ''}`;
  const wrap = { list: ['[', ']'], set: ['{', '}'], gen: ['(', ')'] }[kind] || ['[', ']'];
  return [`${wrap[0]}${core}${wrap[1]}`, 0];
};
javascriptGenerator.forBlock['py_comprehension'] = function () { return ['/* comprehension */', 0]; };

// ── py_dict_comp: {k: v for target in iter if cond} ─────────────────────────

Blockly.Blocks['py_dict_comp'] = {
  init: function () {
    this.appendValueInput('KEY').setCheck(null).appendField('{key');
    this.appendValueInput('VALUE').setCheck(null).appendField(':');
    this.appendDummyInput()
      .appendField('for')
      .appendField(new Blockly.FieldTextInput('k'), 'TARGET')
      .appendField('in');
    this.appendValueInput('ITER').setCheck(null);
    this.appendValueInput('COND').setCheck(null).appendField('if');
    this.appendDummyInput().appendField('}');
    this.setInputsInline(true);
    this.setOutput(true, null);
    this.setColour('#db2777');
    this.setTooltip('Dict comprehension — leave condition empty if not needed.');
  }
};
pythonGenerator.forBlock['py_dict_comp'] = function (block) {
  const k = pythonGenerator.valueToCode(block, 'KEY', 0) || 'None';
  const v = pythonGenerator.valueToCode(block, 'VALUE', 0) || 'None';
  const t = block.getFieldValue('TARGET') || 'k';
  const it = pythonGenerator.valueToCode(block, 'ITER', 0) || '[]';
  const cond = pythonGenerator.valueToCode(block, 'COND', 0);
  return [`{${k}: ${v} for ${t} in ${it}${cond && cond.trim() ? ` if ${cond}` : ''}}`, 0];
};
javascriptGenerator.forBlock['py_dict_comp'] = function () { return ['/* dict comp */', 0]; };

// ── py_yield: yield <expr?> / yield from <expr?> ────────────────────────────

Blockly.Blocks['py_yield'] = {
  init: function () {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown([['yield', 'yield'], ['yield from', 'yield from']]), 'KIND');
    this.appendValueInput('VALUE').setCheck(null);
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#ca8a04');
  }
};
pythonGenerator.forBlock['py_yield'] = function (block) {
  const kind = block.getFieldValue('KIND') || 'yield';
  const v = pythonGenerator.valueToCode(block, 'VALUE', 0);
  return v && v.trim() ? `${kind} ${v}\n` : `${kind}\n`;
};
javascriptGenerator.forBlock['py_yield'] = function () { return '/* yield */\n'; };

// ── py_await: await <expr> (value block) ────────────────────────────────────

Blockly.Blocks['py_await'] = {
  init: function () {
    this.appendValueInput('VALUE').setCheck(null).appendField('await');
    this.setInputsInline(true);
    this.setOutput(true, null);
    this.setColour('#0ea5e9');
  }
};
pythonGenerator.forBlock['py_await'] = function (block) {
  const v = pythonGenerator.valueToCode(block, 'VALUE', 0) || 'None';
  return [`await ${v}`, 0];
};
javascriptGenerator.forBlock['py_await'] = function (block) {
  const v = javascriptGenerator.valueToCode(block, 'VALUE', 0) || 'null';
  return [`(await ${v})`, 0];
};

// ── py_assert: assert <expr>, <msg?> ────────────────────────────────────────

Blockly.Blocks['py_assert'] = {
  init: function () {
    this.appendValueInput('TEST').setCheck(null).appendField('assert');
    this.appendValueInput('MSG').setCheck(null).appendField(',');
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#dc2626');
  }
};
pythonGenerator.forBlock['py_assert'] = function (block) {
  const t = pythonGenerator.valueToCode(block, 'TEST', 0) || 'True';
  const m = pythonGenerator.valueToCode(block, 'MSG', 0);
  return m && m.trim() ? `assert ${t}, ${m}\n` : `assert ${t}\n`;
};
javascriptGenerator.forBlock['py_assert'] = function () { return '/* assert */\n'; };

// ── py_delete: del <target> ─────────────────────────────────────────────────

Blockly.Blocks['py_delete'] = {
  init: function () {
    this.appendValueInput('TARGET').setCheck(null).appendField('del');
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#dc2626');
  }
};
pythonGenerator.forBlock['py_delete'] = function (block) {
  const t = pythonGenerator.valueToCode(block, 'TARGET', 0) || '_';
  return `del ${t}\n`;
};
javascriptGenerator.forBlock['py_delete'] = function () { return '/* del */\n'; };

// ── py_scope: global / nonlocal <names> ────────────────────────────────────

Blockly.Blocks['py_scope'] = {
  init: function () {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown([['global', 'global'], ['nonlocal', 'nonlocal']]), 'KIND')
      .appendField(new Blockly.FieldTextInput('x'), 'NAMES');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#dc2626');
    this.setTooltip('Name declaration — comma-separated list.');
  }
};
pythonGenerator.forBlock['py_scope'] = function (block) {
  return `${block.getFieldValue('KIND') || 'global'} ${block.getFieldValue('NAMES') || ''}\n`;
};
javascriptGenerator.forBlock['py_scope'] = function () { return ''; };

// ── py_match / py_case: structural pattern matching (3.10+) ────────────────

Blockly.Blocks['py_match'] = {
  init: function () {
    this.appendValueInput('SUBJECT').setCheck(null).appendField('match');
    this.appendDummyInput().appendField(':');
    this.appendStatementInput('CASES').setCheck(null);
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#059669');
  }
};
pythonGenerator.forBlock['py_match'] = function (block) {
  const subj = pythonGenerator.valueToCode(block, 'SUBJECT', 0) || 'None';
  const cases = pythonGenerator.statementToCode(block, 'CASES') || '  case _: pass\n';
  return `match ${subj}:\n${cases}`;
};
javascriptGenerator.forBlock['py_match'] = function () { return '/* match */\n'; };

Blockly.Blocks['py_case'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('case')
      .appendField(new Blockly.FieldTextInput('_'), 'PATTERN');
    this.appendValueInput('GUARD').setCheck(null).appendField('if');
    this.appendDummyInput().appendField(':');
    this.appendStatementInput('BODY').setCheck(null);
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#059669');
  }
};
pythonGenerator.forBlock['py_case'] = function (block) {
  const pat = block.getFieldValue('PATTERN') || '_';
  const guard = pythonGenerator.valueToCode(block, 'GUARD', 0);
  const body = pythonGenerator.statementToCode(block, 'BODY') || '  pass\n';
  return `case ${pat}${guard && guard.trim() ? ` if ${guard}` : ''}:\n${body}`;
};
javascriptGenerator.forBlock['py_case'] = function () { return ''; };

// ── py_funcdef: def name(args) -> rt: body (with decorator slot) ──────────

Blockly.Blocks['py_funcdef'] = {
  init: function () {
    this.appendDummyInput('HEADER')
      .appendField(new Blockly.FieldDropdown([['def', 'def'], ['async def', 'async def']]), 'KIND')
      .appendField(new Blockly.FieldTextInput('func'), 'NAME')
      .appendField('(')
      .appendField(new Blockly.FieldTextInput(''), 'ARGS')
      .appendField(')')
      .appendField('->')
      .appendField(new Blockly.FieldTextInput('None'), 'RETURN_TYPE')
      .appendField(':');
    this.appendDummyInput('DECO')
      .appendField('@')
      .appendField(new Blockly.FieldTextInput(''), 'DECORATORS');
    this.appendStatementInput('BODY').setCheck(null);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#7c3aed');
    this.setTooltip('Function definition — decorators are comma-separated names.');
  }
};
pythonGenerator.forBlock['py_funcdef'] = function (block) {
  const kind = block.getFieldValue('KIND') || 'def';
  const name = block.getFieldValue('NAME') || 'func';
  const args = block.getFieldValue('ARGS') || '';
  const ret = block.getFieldValue('RETURN_TYPE') || '';
  const decorators = (block.getFieldValue('DECORATORS') || '').trim();
  const body = pythonGenerator.statementToCode(block, 'BODY') || '  pass\n';
  const decoLines = decorators
    ? decorators.split(',').map(d => `@${d.trim()}`).filter(s => s !== '@').join('\n') + '\n'
    : '';
  const retAnn = ret && ret !== 'None' ? ` -> ${ret}` : '';
  return `${decoLines}${kind} ${name}(${args})${retAnn}:\n${body}`;
};
javascriptGenerator.forBlock['py_funcdef'] = function (block) {
  const name = block.getFieldValue('NAME') || 'func';
  const args = block.getFieldValue('ARGS') || '';
  const body = javascriptGenerator.statementToCode(block, 'BODY') || '';
  return `function ${name}(${args}) {\n${body}}\n`;
};

// ── py_for_iter: for <name> in <iter>: body  (non-range general for) ───────

Blockly.Blocks['py_for_iter'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('for')
      .appendField(new Blockly.FieldTextInput('x'), 'NAME')
      .appendField('in');
    this.appendValueInput('ITER').setCheck(null);
    this.appendDummyInput().appendField(':');
    this.appendStatementInput('BODY').setCheck(null);
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#207a4b');
    this.setTooltip('for <name> in <iterable>: body — general-purpose loop');
  }
};
pythonGenerator.forBlock['py_for_iter'] = function (block) {
  const name = block.getFieldValue('NAME') || 'x';
  const iter = pythonGenerator.valueToCode(block, 'ITER', 0) || '[]';
  const body = pythonGenerator.statementToCode(block, 'BODY') || '  pass\n';
  return `for ${name} in ${iter}:\n${body}`;
};
javascriptGenerator.forBlock['py_for_iter'] = function (block) {
  const name = block.getFieldValue('NAME') || 'x';
  const iter = javascriptGenerator.valueToCode(block, 'ITER', 0) || '[]';
  const body = javascriptGenerator.statementToCode(block, 'BODY') || '';
  return `for (const ${name} of ${iter}) {\n${body}}\n`;
};
