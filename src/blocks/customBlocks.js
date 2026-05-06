
import * as Blockly from 'blockly/core';
import { javascriptGenerator } from 'blockly/javascript';
import { pythonGenerator } from 'blockly/python';
import 'blockly/blocks'; // Import built-in blocks (including lists)
import './structure'; // Register library structure blocks
import './exactPythonBlocks'; // Register exact-IR block family (py_tuple_assign, py_attr, etc.)
import { classToolboxCategory } from './classes'; // Register class/OOP blocks
import { blockBuilderToolboxCategory } from './blockBuilder'; // Register block builder meta-blocks
import { buildLibraryToolboxCategories, restoreLibraries } from '../utils/libraryManager';

// Restore previously installed libraries on boot
restoreLibraries();

// Initialize Python generator
// If pythonGenerator isn't available in some versions, we might need to check imports.
// But blockly usually exports it.

Blockly.Blocks['print'] = {
  init: function () {
    // Accept either a connected value-block (structural — "print(<any expression>)")
    // or, for backward compat, a plain text field that prints the string literal.
    this.appendValueInput('VALUE').setCheck(null).appendField('say');
    this.appendDummyInput()
      .appendField(new Blockly.FieldTextInput(''), 'TEXT');
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(160);
    this.setTooltip('Prints a value. Plug any value block in, or type a literal in the text field.');
  }
};

/** Prefer a connected value block; fall back to the legacy text field. */
const _readPrintArg = (block, gen) => {
  const v = gen.valueToCode(block, 'VALUE', 0);
  if (v && v.trim()) return { code: v, isExpr: true };
  const t = block.getFieldValue('TEXT') || '';
  return { code: t, isExpr: false };
};

javascriptGenerator.forBlock['print'] = function (block) {
  const { code, isExpr } = _readPrintArg(block, javascriptGenerator);
  const arg = isExpr ? code : JSON.stringify(code);
  return `await window.spriteController.say(${arg});\n`;
};

pythonGenerator.forBlock['print'] = function (block) {
  const { code, isExpr } = _readPrintArg(block, pythonGenerator);
  const arg = isExpr ? code : JSON.stringify(code);
  return `print(${arg})\n`;
};

// ── Python builtins (str/int/float/len/...) as a single value-block ───────
// One block with a FUNC dropdown covers the most common Python builtin
// coercion/inspection calls. pyAst maps `str(x)`, `int(x)`, … here via
// schemas in librarySchemaRegistry — without this block they fell to py_call
// and showed up as gray "str" labels in the user's screenshot.
Blockly.Blocks['py_builtin_cast'] = {
  init: function () {
    this.appendValueInput('VALUE').setCheck(null)
      .appendField(new Blockly.FieldDropdown([
        ['str',   'str'], ['int',  'int'],   ['float', 'float'],
        ['len',   'len'], ['bool', 'bool'],  ['abs',   'abs'],
        ['repr',  'repr'], ['type', 'type'], ['round', 'round'],
      ]), 'FUNC');
    this.setOutput(true, null);
    this.setColour('#7600A7');   // matches Math / Operators palette
    this.setTooltip('Python builtins: str / int / float / len / bool / abs / repr / type / round');
  }
};

pythonGenerator.forBlock['py_builtin_cast'] = function (b) {
  const f = b.getFieldValue('FUNC') || 'str';
  const v = pythonGenerator.valueToCode(b, 'VALUE', 0) || '0';
  return [`${f}(${v})`, 0];
};
javascriptGenerator.forBlock['py_builtin_cast'] = function (b) {
  const f = b.getFieldValue('FUNC') || 'str';
  const v = javascriptGenerator.valueToCode(b, 'VALUE', 0) || '0';
  if (f === 'str')   return [`String(${v})`, 0];
  if (f === 'int')   return [`parseInt(${v}, 10)`, 0];
  if (f === 'float') return [`parseFloat(${v})`, 0];
  if (f === 'len')   return [`(${v}).length`, 0];
  if (f === 'bool')  return [`Boolean(${v})`, 0];
  if (f === 'abs')   return [`Math.abs(${v})`, 0];
  if (f === 'round') return [`Math.round(${v})`, 0];
  return [`${f}(${v})`, 0];
};

Blockly.Blocks['variable'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("set")
      .appendField(new Blockly.FieldTextInput("x"), "VAR_NAME")
      .appendField("to")
      .appendField(new Blockly.FieldTextInput("0"), "VALUE");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(330);
    this.setTooltip("Sets a variable to a value");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['variable'] = function (_block) {
  const varName = _block.getFieldValue('VAR_NAME');
  const value = _block.getFieldValue('VALUE');
  return `var ${varName} = ${value}; window.spriteController?.setVariable(${JSON.stringify(varName)}, ${varName});\n`;
};

pythonGenerator.forBlock['variable'] = function (_block) {
  const varName = _block.getFieldValue('VAR_NAME');
  const value = _block.getFieldValue('VALUE');
  return `${varName} = ${value} \n`;
};

Blockly.Blocks['change_variable'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("change")
      .appendField(new Blockly.FieldTextInput("x"), "VAR_NAME")
      .appendField("by")
      .appendField(new Blockly.FieldTextInput("1"), "VALUE");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(330);
    this.setTooltip("Changes a variable by a value");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['change_variable'] = function (_block) {
  const varName = _block.getFieldValue('VAR_NAME');
  const value = _block.getFieldValue('VALUE');
  return `${varName} += ${value}; window.spriteController?.setVariable(${JSON.stringify(varName)}, ${varName});\n`;
};

pythonGenerator.forBlock['change_variable'] = function (_block) {
  const varName = _block.getFieldValue('VAR_NAME');
  const value = _block.getFieldValue('VALUE');
  return `${varName} += ${value} \n`;
};

Blockly.Blocks['repeat'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("repeat")
      .appendField(new Blockly.FieldNumber(10), "TIMES")
      .appendField("times");
    this.appendStatementInput("DO")
      .setCheck(null);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(120);
    this.setTooltip("Repeats the blocks inside");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['repeat'] = function (_block) {
  const repeats = _block.getFieldValue('TIMES');
  const branch = javascriptGenerator.statementToCode(_block, 'DO');
  return `for (let i = 0; i < ${repeats}; i++) { \n${branch} } \n`;
};

pythonGenerator.forBlock['repeat'] = function (_block) {
  const repeats = _block.getFieldValue('TIMES');
  const branch = pythonGenerator.statementToCode(_block, 'DO') || '  pass\n';
  return `for i in range(${repeats}): \n${branch} \n`;
};

/**
 * Condition read helper with backward compat.
 *
 * Precedence:
 *   1. CONDITION_VAL value-input (structural; new AST path uses this)
 *   2. CONDITION text field (legacy; pre-existing saved workspaces and tests use this)
 *   3. fallback 'True'
 */
const _condReadWithFallback = (block, gen) => {
  const v = gen.valueToCode(block, 'CONDITION_VAL', 0);
  if (v && v.trim()) return v;
  return block.getFieldValue('CONDITION') || 'True';
};

Blockly.Blocks['if'] = {
  init: function () {
    // A structural value-input slot (lives alongside the legacy text field so
    // old workspaces still load and work exactly as before).
    this.appendValueInput('CONDITION_VAL').setCheck(null).appendField('if');
    this.appendDummyInput()
      .appendField(new Blockly.FieldTextInput('true'), 'CONDITION');
    this.appendStatementInput('DO').setCheck(null);
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(210);
    this.setTooltip('Executes the DO branch when the condition is true. Plug a value block into the slot OR type a condition in the text field.');
  }
};

javascriptGenerator.forBlock['if'] = function (block) {
  const condition = _condReadWithFallback(block, javascriptGenerator);
  const branch = javascriptGenerator.statementToCode(block, 'DO');
  return `if (${condition}) { \n${branch} } \n`;
};

pythonGenerator.forBlock['if'] = function (block) {
  const condition = _condReadWithFallback(block, pythonGenerator);
  const branch = pythonGenerator.statementToCode(block, 'DO') || '  pass\n';
  return `if ${condition}:\n${branch}`;
};

Blockly.Blocks['if_else'] = {
  init: function () {
    this.appendValueInput('CONDITION_VAL').setCheck(null).appendField('if');
    this.appendDummyInput()
      .appendField(new Blockly.FieldTextInput('true'), 'CONDITION');
    this.appendStatementInput('DO').setCheck(null);
    this.appendDummyInput().appendField('else');
    this.appendStatementInput('ELSE').setCheck(null);
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(210);
    this.setTooltip('Executes the DO branch when the condition is true, otherwise ELSE. Plug a value block OR use the text field.');
  }
};

javascriptGenerator.forBlock['if_else'] = function (block) {
  const condition = _condReadWithFallback(block, javascriptGenerator);
  const branch = javascriptGenerator.statementToCode(block, 'DO');
  const elseBranch = javascriptGenerator.statementToCode(block, 'ELSE');
  return `if (${condition}) { \n${branch} } else { \n${elseBranch} } \n`;
};

pythonGenerator.forBlock['if_else'] = function (block) {
  const condition = _condReadWithFallback(block, pythonGenerator);
  const branch = pythonGenerator.statementToCode(block, 'DO') || '  pass\n';
  const elseBranch = pythonGenerator.statementToCode(block, 'ELSE') || '  pass\n';
  return `if ${condition}:\n${branch}else:\n${elseBranch}`;
};

Blockly.Blocks['wait'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("wait")
      .appendField(new Blockly.FieldNumber(1), "SECONDS")
      .appendField("seconds");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(180);
    this.setTooltip("Waits for specified seconds");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['wait'] = function (_block) {
  const seconds = _block.getFieldValue('SECONDS');
  return `await new Promise(r => setTimeout(r, ${seconds} * 1000)); \n`;
};

pythonGenerator.forBlock['wait'] = function (_block) {
  const seconds = _block.getFieldValue('SECONDS');
  pythonGenerator.definitions_['import_time'] = 'import time';
  return `time.sleep(${seconds}) \n`;
};

Blockly.Blocks['loop_forever'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("forever");
    this.appendStatementInput("DO")
      .setCheck(null);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(120);
    this.setTooltip("Repeats forever");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['loop_forever'] = function (_block) {
  const branch = javascriptGenerator.statementToCode(_block, 'DO');
  return `while (true) { \n${branch} await new Promise(r => setTimeout(r, 0)); \n } \n`;
};

pythonGenerator.forBlock['loop_forever'] = function (_block) {
  const branch = pythonGenerator.statementToCode(_block, 'DO') || '  pass\n';
  return `while True: \n${branch} \n`;
};

Blockly.Blocks['repeat_until'] = {
  init: function () {
    this.appendValueInput('CONDITION_VAL').setCheck(null).appendField('repeat until');
    this.appendDummyInput()
      .appendField(new Blockly.FieldTextInput('true'), 'CONDITION');
    this.appendStatementInput('DO').setCheck(null);
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(120);
    this.setTooltip('Repeats until the condition is true. Plug a value block OR use the text field.');
  }
};

javascriptGenerator.forBlock['repeat_until'] = function (block) {
  const condition = _condReadWithFallback(block, javascriptGenerator);
  const branch = javascriptGenerator.statementToCode(block, 'DO');
  return `while (!(${condition})) { \n${branch} } \n`;
};

pythonGenerator.forBlock['repeat_until'] = function (block) {
  const condition = _condReadWithFallback(block, pythonGenerator);
  const branch = pythonGenerator.statementToCode(block, 'DO') || '  pass\n';
  return `while not(${condition}):\n${branch}`;
};

Blockly.Blocks['comment'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("//")
      .appendField(new Blockly.FieldTextInput("comment"), "TEXT");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(90);
    this.setTooltip("Adds a comment");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['comment'] = function (_block) {
  const text = _block.getFieldValue('TEXT');
  return `// ${text}\n`;
};

pythonGenerator.forBlock['comment'] = function (_block) {
  const text = _block.getFieldValue('TEXT');
  return `# ${text}\n`;
};

Blockly.Blocks['math_operation'] = {
  init: function () {
    this.appendDummyInput()
      .appendField(new Blockly.FieldTextInput("a"), "A")
      .appendField(new Blockly.FieldDropdown([["+", "+"], ["-", "-"], ["*", "*"], ["/", "/"]]), "OP")
      .appendField(new Blockly.FieldTextInput("b"), "B");
    this.setOutput(true, null);
    this.setColour(230);
    this.setTooltip("Performs math operation");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['math_operation'] = function (_block) {
  const a = _block.getFieldValue('A');
  const op = _block.getFieldValue('OP');
  const b = _block.getFieldValue('B');
  return [`${a} ${op} ${b}`, javascriptGenerator.ORDER_NONE];
};

pythonGenerator.forBlock['math_operation'] = function (_block) {
  const a = pythonGenerator.valueToCode(_block, 'A', pythonGenerator.ORDER_MULTIPLICATIVE) || _block.getFieldValue('A');
  const op = _block.getFieldValue('OP');
  const b = pythonGenerator.valueToCode(_block, 'B', pythonGenerator.ORDER_MULTIPLICATIVE) || _block.getFieldValue('B');
  return [`${a} ${op} ${b}`, pythonGenerator.ORDER_NONE];
};

Blockly.Blocks['random'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("pick random")
      .appendField(new Blockly.FieldNumber(1), "FROM")
      .appendField("to")
      .appendField(new Blockly.FieldNumber(10), "TO");
    this.setOutput(true, null);
    this.setColour(230);
    this.setTooltip("Generates random number");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['random'] = function (_block) {
  const from = _block.getFieldValue('FROM');
  const to = _block.getFieldValue('TO');
  return [`Math.floor(Math.random() * (${to} - ${from} + 1)) + ${from}`, javascriptGenerator.ORDER_NONE];
};

pythonGenerator.forBlock['random'] = function (_block) {
  const from = _block.getFieldValue('FROM');
  const to = _block.getFieldValue('TO');
  pythonGenerator.definitions_['import_random'] = 'import random';
  return [`random.randint(${from}, ${to})`, pythonGenerator.ORDER_FUNCTION_CALL];
};

Blockly.Blocks['math_mod'] = {
  init: function () {
    this.appendDummyInput()
      .appendField(new Blockly.FieldTextInput("a"), "A")
      .appendField("mod")
      .appendField(new Blockly.FieldTextInput("b"), "B");
    this.setOutput(true, null);
    this.setColour(230);
    this.setTooltip("Returns remainder of division");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['math_mod'] = function (_block) {
  const a = _block.getFieldValue('A');
  const b = _block.getFieldValue('B');
  return [`${a} % ${b}`, javascriptGenerator.ORDER_NONE];
};

pythonGenerator.forBlock['math_mod'] = function (_block) {
  const a = _block.getFieldValue('A');
  const b = _block.getFieldValue('B');
  return [`${a} % ${b}`, pythonGenerator.ORDER_MULTIPLICATIVE];
};

Blockly.Blocks['math_round'] = {
  init: function () {
    this.appendDummyInput()
      .appendField(new Blockly.FieldDropdown([["round", "round"], ["floor", "floor"], ["ceil", "ceil"]]), "OP")
      .appendField(new Blockly.FieldTextInput("a"), "A");
    this.setOutput(true, null);
    this.setColour(230);
    this.setTooltip("Rounds a number");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['math_round'] = function (_block) {
  const op = _block.getFieldValue('OP');
  const a = _block.getFieldValue('A');
  return [`Math.${op}(${a})`, javascriptGenerator.ORDER_NONE];
};

pythonGenerator.forBlock['math_round'] = function (_block) {
  const op = _block.getFieldValue('OP');
  const a = _block.getFieldValue('A');
  if (op === 'round') {
    return [`round(${a})`, pythonGenerator.ORDER_FUNCTION_CALL];
  } else {
    pythonGenerator.definitions_['import_math'] = 'import math';
    return [`math.${op}(${a})`, pythonGenerator.ORDER_FUNCTION_CALL];
  }
};

Blockly.Blocks['math_compare'] = {
  init: function () {
    this.appendDummyInput()
      .appendField(new Blockly.FieldTextInput("a"), "A")
      .appendField(new Blockly.FieldDropdown([["=", "=="], ["<", "<"], [">", ">"], ["≠", "!="], ["≤", "<="], ["≥", ">="]]), "OP")
      .appendField(new Blockly.FieldTextInput("b"), "B");
    this.setOutput(true, null);
    this.setColour(210);
    this.setTooltip("Compares two values");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['math_compare'] = function (_block) {
  const a = _block.getFieldValue('A');
  const op = _block.getFieldValue('OP');
  const b = _block.getFieldValue('B');
  return [`${a} ${op} ${b}`, javascriptGenerator.ORDER_NONE];
};

pythonGenerator.forBlock['math_compare'] = function (_block) {
  const a = _block.getFieldValue('A');
  const op = _block.getFieldValue('OP');
  const b = _block.getFieldValue('B');
  return [`${a} ${op} ${b}`, pythonGenerator.ORDER_RELATIONAL];
};

Blockly.Blocks['and_or'] = {
  init: function () {
    this.appendDummyInput()
      .appendField(new Blockly.FieldTextInput("true"), "A")
      .appendField(new Blockly.FieldDropdown([["and", "&&"], ["or", "||"]]), "OP")
      .appendField(new Blockly.FieldTextInput("true"), "B");
    this.setOutput(true, null);
    this.setColour(210);
    this.setTooltip("Logical AND or OR operation");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['and_or'] = function (_block) {
  const a = _block.getFieldValue('A');
  const op = _block.getFieldValue('OP');
  const b = _block.getFieldValue('B');
  return [`${a} ${op} ${b}`, javascriptGenerator.ORDER_NONE];
};

pythonGenerator.forBlock['and_or'] = function (_block) {
  const a = _block.getFieldValue('A');
  const op = _block.getFieldValue('OP') === '&&' ? 'and' : 'or';
  const b = _block.getFieldValue('B');
  return [`${a} ${op} ${b}`, pythonGenerator.ORDER_LOGICAL_AND];
};

Blockly.Blocks['not'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("not")
      .appendField(new Blockly.FieldTextInput("true"), "VALUE");
    this.setOutput(true, null);
    this.setColour(210);
    this.setTooltip("Logical NOT operation");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['not'] = function (_block) {
  const value = _block.getFieldValue('VALUE');
  return [`!${value}`, javascriptGenerator.ORDER_NONE];
};

pythonGenerator.forBlock['not'] = function (_block) {
  const value = _block.getFieldValue('VALUE');
  return [`not ${value}`, pythonGenerator.ORDER_LOGICAL_NOT];
};

Blockly.Blocks['ask_and_wait'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("ask")
      .appendField(new Blockly.FieldTextInput("What's your name?"), "QUESTION")
      .appendField("and wait");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(160);
    this.setTooltip("Asks a question and waits for input");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['ask_and_wait'] = function (_block) {
  const question = _block.getFieldValue('QUESTION');
  return `await new Promise(resolve => {
    const answer = prompt(${JSON.stringify(question)});
    window.lastAnswer = answer;
    resolve();
  });\n`;
};

pythonGenerator.forBlock['ask_and_wait'] = function (_block) {
  const question = _block.getFieldValue('QUESTION');
  return `_last_answer = input(${JSON.stringify(question)})\n`;
};

Blockly.Blocks['get_answer'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("answer");
    this.setOutput(true, null);
    this.setColour(160);
    this.setTooltip("Returns the answer from ask block");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['get_answer'] = function (_block) {
  return [`window.lastAnswer`, javascriptGenerator.ORDER_NONE];
};

pythonGenerator.forBlock['get_answer'] = function (_block) {
  return [`_last_answer`, pythonGenerator.ORDER_ATOMIC];
};

Blockly.Blocks['key_pressed'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("when")
      .appendField(new Blockly.FieldDropdown([
        ["space", " "],
        ["arrow up", "ArrowUp"],
        ["arrow down", "ArrowDown"],
        ["arrow left", "ArrowLeft"],
        ["arrow right", "ArrowRight"],
        ["any key", "any"],
        ["a", "KeyA"],
        ["b", "KeyB"],
        ["c", "KeyC"]
      ]), "KEY")
      .appendField("pressed?");
    this.setOutput(true, null);
    this.setColour(200);
    this.setTooltip("Checks if a key is pressed");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['key_pressed'] = function (_block) {
  const key = _block.getFieldValue('KEY');
  if (key === 'any') {
    return [`(await window.spriteController.isKeyPressed('any'))`, javascriptGenerator.ORDER_NONE];
  }
  return [`(await window.spriteController.isKeyPressed('${key}'))`, javascriptGenerator.ORDER_NONE];
};

pythonGenerator.forBlock['key_pressed'] = function (_block) {
  const key = _block.getFieldValue('KEY');
  return [`sprite.is_key_pressed("${key}")`, pythonGenerator.ORDER_FUNCTION_CALL];
};



Blockly.Blocks['mouse_x'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("mouse x");
    this.setOutput(true, null);
    this.setColour(200);
    this.setTooltip("Returns mouse X position");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['mouse_x'] = function (_block) {
  return [`(await window.spriteController.getMouseX())`, javascriptGenerator.ORDER_NONE];
};

pythonGenerator.forBlock['mouse_x'] = function (_block) {
  return [`sprite.mouse_x`, pythonGenerator.ORDER_MEMBER];
};

Blockly.Blocks['mouse_y'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("mouse y");
    this.setOutput(true, null);
    this.setColour(200);
    this.setTooltip("Returns mouse Y position");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['mouse_y'] = function (_block) {
  return [`(await window.spriteController.getMouseY())`, javascriptGenerator.ORDER_NONE];
};

pythonGenerator.forBlock['mouse_y'] = function (_block) {
  return [`sprite.mouse_y`, pythonGenerator.ORDER_MEMBER];
};

Blockly.Blocks['mouse_down'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("mouse down?");
    this.setOutput(true, null);
    this.setColour(200);
    this.setTooltip("Returns true if mouse button is pressed");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['mouse_down'] = function (_block) {
  return [`(await window.spriteController.isMouseDown())`, javascriptGenerator.ORDER_NONE];
};

pythonGenerator.forBlock['mouse_down'] = function (_block) {
  return [`sprite.is_mouse_down()`, pythonGenerator.ORDER_FUNCTION_CALL];
};

Blockly.Blocks['color_touching'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("touching color")
      .appendField(new Blockly.FieldTextInput("#ff0000"), "COLOR");
    this.setOutput(true, null);
    this.setColour(200);
    this.setTooltip("Checks if sprite is touching a color");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['color_touching'] = function (_block) {
  const color = _block.getFieldValue('COLOR');
  return [`(await window.spriteController.isTouchingColor('${color}'))`, javascriptGenerator.ORDER_NONE];
};

pythonGenerator.forBlock['color_touching'] = function (_block) {
  const color = _block.getFieldValue('COLOR');
  return [`sprite.is_touching_color("${color}")`, pythonGenerator.ORDER_FUNCTION_CALL];
};

Blockly.Blocks['distance_to'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("distance to")
      .appendField(new Blockly.FieldTextInput("mouse-pointer"), "TARGET");
    this.setOutput(true, null);
    this.setColour(200);
    this.setTooltip("Returns distance to an object");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['distance_to'] = function (_block) {
  const target = _block.getFieldValue('TARGET');
  return [`(await window.spriteController.distanceTo('${target}'))`, javascriptGenerator.ORDER_NONE];
};

pythonGenerator.forBlock['distance_to'] = function (_block) {
  const target = _block.getFieldValue('TARGET');
  return [`sprite.distance_to("${target}")`, pythonGenerator.ORDER_FUNCTION_CALL];
};

Blockly.Blocks['timer'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("timer");
    this.setOutput(true, null);
    this.setColour(200);
    this.setTooltip("Returns timer value in seconds");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['timer'] = function (_block) {
  return [`(await window.spriteController.getTimer())`, javascriptGenerator.ORDER_NONE];
};

pythonGenerator.forBlock['timer'] = function (_block) {
  return [`sprite.timer`, pythonGenerator.ORDER_MEMBER];
};

Blockly.Blocks['reset_timer'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("reset timer");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(200);
    this.setTooltip("Resets the timer");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['reset_timer'] = function (_block) {
  return `await window.spriteController.resetTimer();\n`;
};

pythonGenerator.forBlock['reset_timer'] = function (_block) {
  return `sprite.reset_timer()\n`;
};

Blockly.Blocks['get_attribute'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("of")
      .appendField(new Blockly.FieldTextInput("sprite"), "TARGET")
      .appendField(new Blockly.FieldDropdown([
        ["x position", "x"],
        ["y position", "y"],
        ["direction", "direction"],
        ["costume #", "costume"],
        ["size", "size"],
        ["volume", "volume"]
      ]), "ATTRIBUTE");
    this.setOutput(true, null);
    this.setColour(200);
    this.setTooltip("Returns an attribute of an object");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['get_attribute'] = function (_block) {
  const target = _block.getFieldValue('TARGET');
  const attribute = _block.getFieldValue('ATTRIBUTE');
  return [`(await window.spriteController.getAttribute('${target}', '${attribute}'))`, javascriptGenerator.ORDER_NONE];
};

pythonGenerator.forBlock['get_attribute'] = function (_block) {
  const target = _block.getFieldValue('TARGET');
  const attribute = _block.getFieldValue('ATTRIBUTE');
  return [`sprite.get_attribute("${target}", "${attribute}")`, pythonGenerator.ORDER_FUNCTION_CALL];
};

Blockly.Blocks['set_attribute'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("set")
      .appendField(new Blockly.FieldDropdown([
        ["x position", "x"],
        ["y position", "y"],
        ["direction", "direction"],
        ["size", "size"],
        ["volume", "volume"]
      ]), "ATTRIBUTE")
      .appendField("of")
      .appendField(new Blockly.FieldTextInput("sprite"), "TARGET")
      .appendField("to")
      .appendField(new Blockly.FieldTextInput("0"), "VALUE");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(200);
    this.setTooltip("Sets an attribute of an object");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['set_attribute'] = function (_block) {
  const target = _block.getFieldValue('TARGET');
  const attribute = _block.getFieldValue('ATTRIBUTE');
  const value = _block.getFieldValue('VALUE');
  return `await window.spriteController.setAttribute('${target}', '${attribute}', ${value});\n`;
};

pythonGenerator.forBlock['set_attribute'] = function (_block) {
  const attribute = _block.getFieldValue('ATTRIBUTE');
  const target = _block.getFieldValue('TARGET');
  const value = _block.getFieldValue('VALUE');
  return `sprite.set_attribute("${target}", "${attribute}", ${value})\n`;
};

Blockly.Blocks['say'] = {
  init: function () {
    this.appendValueInput("TEXT")
      .setCheck(null)
      .appendField("say");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(160);
    this.setTooltip("Displays speech bubble");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['say'] = function (_block) {
  const text = javascriptGenerator.valueToCode(_block, 'TEXT', javascriptGenerator.ORDER_NONE) || '""';
  return `await window.spriteController.say(${text});\n`;
};

pythonGenerator.forBlock['say'] = function (_block) {
  const text = pythonGenerator.valueToCode(_block, 'TEXT', pythonGenerator.ORDER_NONE) || '""';
  return `sprite.say(${text})\n`;
};

Blockly.Blocks['say_for_seconds'] = {
  init: function () {
    this.appendValueInput("TEXT")
      .setCheck(null)
      .appendField("say");
    this.appendDummyInput()
      .appendField("for")
      .appendField(new Blockly.FieldNumber(2), "SECONDS")
      .appendField("seconds");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(160);
    this.setTooltip("Displays speech bubble for specified time");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['say_for_seconds'] = function (_block) {
  const text = javascriptGenerator.valueToCode(_block, 'TEXT', javascriptGenerator.ORDER_NONE) || '""';
  const seconds = _block.getFieldValue('SECONDS');
  return `await window.spriteController.say(${text}, ${seconds});\n`;
};

pythonGenerator.forBlock['say_for_seconds'] = function (_block) {
  const text = pythonGenerator.valueToCode(_block, 'TEXT', pythonGenerator.ORDER_NONE) || '""';
  const seconds = _block.getFieldValue('SECONDS');
  return `sprite.say(${text}, ${seconds})\n`;
};





Blockly.Blocks['think'] = {
  init: function () {
    this.appendValueInput("TEXT")
      .setCheck(null)
      .appendField("think");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(160);
    this.setTooltip("Displays thought bubble");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['think'] = function (_block) {
  const text = javascriptGenerator.valueToCode(_block, 'TEXT', javascriptGenerator.ORDER_NONE) || '""';
  return `await window.spriteController.think(${text});\n`;
};

pythonGenerator.forBlock['think'] = function (_block) {
  const text = pythonGenerator.valueToCode(_block, 'TEXT', pythonGenerator.ORDER_NONE) || '""';
  return `sprite.think(${text})\n`;
};

Blockly.Blocks['think_for_seconds'] = {
  init: function () {
    this.appendValueInput("TEXT")
      .setCheck(null)
      .appendField("think");
    this.appendDummyInput()
      .appendField("for")
      .appendField(new Blockly.FieldNumber(2), "SECONDS")
      .appendField("seconds");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(160);
    this.setTooltip("Displays thought bubble for specified time");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['think_for_seconds'] = function (_block) {
  const text = javascriptGenerator.valueToCode(_block, 'TEXT', javascriptGenerator.ORDER_NONE) || '""';
  const seconds = _block.getFieldValue('SECONDS');
  return `await window.spriteController.think(${text}, ${seconds});\n`;
};

pythonGenerator.forBlock['think_for_seconds'] = function (_block) {
  const text = pythonGenerator.valueToCode(_block, 'TEXT', pythonGenerator.ORDER_NONE) || '""';
  const seconds = _block.getFieldValue('SECONDS');
  return `sprite.think(${text}, ${seconds})\n`;
};

Blockly.Blocks['switch_costume'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("switch costume to")
      .appendField(new Blockly.FieldTextInput("costume1"), "COSTUME");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(170);
    this.setTooltip("Switches to a different costume");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['switch_costume'] = function (_block) {
  const costume = _block.getFieldValue('COSTUME');
  return `await window.spriteController.switchCostume(${JSON.stringify(costume)});\n`;
};

pythonGenerator.forBlock['switch_costume'] = function (_block) {
  const costume = _block.getFieldValue('COSTUME');
  return `sprite.switch_costume("${costume}")\n`;
};

Blockly.Blocks['next_costume'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("next costume");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(170);
    this.setTooltip("Switches to the next costume");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['next_costume'] = function (_block) {
  return `await window.spriteController.nextCostume();\n`;
};

pythonGenerator.forBlock['next_costume'] = function (_block) {
  return `sprite.next_costume()\n`;
};

Blockly.Blocks['costume_number'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("costume number");
    this.setOutput(true, null);
    this.setColour(170);
    this.setTooltip("Returns current costume number");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['costume_number'] = function (_block) {
  return [`(await window.spriteController.getCostumeNumber())`, javascriptGenerator.ORDER_NONE];
};

pythonGenerator.forBlock['costume_number'] = function (_block) {
  return [`sprite.costume_number`, pythonGenerator.ORDER_MEMBER];
};

Blockly.Blocks['switch_backdrop'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("switch backdrop to")
      .appendField(new Blockly.FieldDropdown([
        ["white", "white"],
        ["blue-sky", "blue-sky"],
        ["green", "green"],
        ["space", "space"]
      ]), "BACKDROP");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(170);
    this.setTooltip("Switches to a different backdrop");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['switch_backdrop'] = function (_block) {
  const backdrop = _block.getFieldValue('BACKDROP');
  return `await window.spriteController.switchBackdrop("${backdrop}");\n`;
};

pythonGenerator.forBlock['switch_backdrop'] = function (_block) {
  const backdrop = _block.getFieldValue('BACKDROP');
  return `stage.switch_backdrop("${backdrop}")\n`;
};

Blockly.Blocks['next_backdrop'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("next backdrop");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(170);
    this.setTooltip("Switches to the next backdrop");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['next_backdrop'] = function (_block) {
  return `await window.spriteController.nextBackdrop();\n`;
};

pythonGenerator.forBlock['next_backdrop'] = function (_block) {
  return `stage.next_backdrop()\n`;
};

Blockly.Blocks['backdrop_number'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("backdrop number");
    this.setOutput(true, null);
    this.setColour(170);
    this.setTooltip("Returns current backdrop number");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['backdrop_number'] = function (_block) {
  return [`(await window.spriteController.getBackdropNumber())`, javascriptGenerator.ORDER_NONE];
};

pythonGenerator.forBlock['backdrop_number'] = function (_block) {
  return [`stage.backdrop_number`, pythonGenerator.ORDER_MEMBER];
};

Blockly.Blocks['backdrop_name'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("backdrop name");
    this.setOutput(true, null);
    this.setColour(170);
    this.setTooltip("Returns current backdrop name");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['backdrop_name'] = function (_block) {
  return [`(await window.spriteController.getBackdropName())`, javascriptGenerator.ORDER_NONE];
};

pythonGenerator.forBlock['backdrop_name'] = function (_block) {
  return [`stage.backdrop_name`, pythonGenerator.ORDER_MEMBER];
};

Blockly.Blocks['set_size'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("set size to")
      .appendField(new Blockly.FieldNumber(100), "SIZE")
      .appendField("%");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(170);
    this.setTooltip("Sets the size of the sprite");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['set_size'] = function (_block) {
  const size = _block.getFieldValue('SIZE');
  return `await window.spriteController.setSize(${size});\n`;
};

pythonGenerator.forBlock['set_size'] = function (_block) {
  const size = _block.getFieldValue('SIZE');
  return `sprite.set_size(${size})\n`;
};

Blockly.Blocks['change_size'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("change size by")
      .appendField(new Blockly.FieldNumber(10), "AMOUNT");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(170);
    this.setTooltip("Changes the size by an amount");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['change_size'] = function (_block) {
  const amount = _block.getFieldValue('AMOUNT');
  return `await window.spriteController.changeSize(${amount});\n`;
};

pythonGenerator.forBlock['change_size'] = function (_block) {
  const amount = _block.getFieldValue('AMOUNT');
  return `sprite.change_size(${amount})\n`;
};

Blockly.Blocks['size'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("size");
    this.setOutput(true, null);
    this.setColour(170);
    this.setTooltip("Returns current size");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['size'] = function (_block) {
  return [`(await window.spriteController.getSize())`, javascriptGenerator.ORDER_NONE];
};

pythonGenerator.forBlock['size'] = function (_block) {
  return [`sprite.size`, pythonGenerator.ORDER_MEMBER];
};

Blockly.Blocks['show'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("show");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(170);
    this.setTooltip("Shows the sprite");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['show'] = function (_block) {
  return `await window.spriteController.setVisible(true);\n`;
};

pythonGenerator.forBlock['show'] = function (_block) {
  return `sprite.show()\n`;
};

Blockly.Blocks['hide'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("hide");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(170);
    this.setTooltip("Hides the sprite");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['hide'] = function (_block) {
  return `await window.spriteController.setVisible(false);\n`;
};

pythonGenerator.forBlock['hide'] = function (_block) {
  return `sprite.hide()\n`;
};

Blockly.Blocks['go_to_layer'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("go to")
      .appendField(new Blockly.FieldDropdown([
        ["front", "front"],
        ["back", "back"]
      ]), "LAYER")
      .appendField("layer");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(170);
    this.setTooltip("Moves sprite to front or back layer");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['go_to_layer'] = function (_block) {
  const layer = _block.getFieldValue('LAYER');
  return `await window.spriteController.goToLayer(${JSON.stringify(layer)});\n`;
};

pythonGenerator.forBlock['go_to_layer'] = function (_block) {
  const layer = _block.getFieldValue('LAYER');
  return `sprite.go_to_layer("${layer}")\n`;
};

Blockly.Blocks['move_right'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("move")
      .appendField(new Blockly.FieldNumber(10), "STEPS")
      .appendField("steps");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(260);
    this.setTooltip("Moves the sprite right by specified steps");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['move_right'] = function (_block) {
  const steps = _block.getFieldValue('STEPS');
  return `await window.spriteController.move(${steps});\n`;
};

pythonGenerator.forBlock['move_right'] = function (_block) {
  const steps = _block.getFieldValue('STEPS');
  return `sprite.move(${steps})\n`;
};

Blockly.Blocks['turn_right'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("turn")
      .appendField(new Blockly.FieldDropdown([
        ["right", "right"],
        ["left", "left"]
      ]), "DIRECTION")
      .appendField(new Blockly.FieldNumber(15), "DEGREES")
      .appendField("degrees");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(260);
    this.setTooltip("Turns the sprite by specified degrees");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['turn_right'] = function (_block) {
  const direction = _block.getFieldValue('DIRECTION');
  const degrees = _block.getFieldValue('DEGREES');
  const mult = direction === 'left' ? -1 : 1;
  return `await window.spriteController.turn(${degrees * mult});\n`;
};

pythonGenerator.forBlock['turn_right'] = function (_block) {
  const direction = _block.getFieldValue('DIRECTION');
  const degrees = _block.getFieldValue('DEGREES');
  const mult = direction === 'left' ? -1 : 1;
  return `sprite.turn(${degrees * mult})\n`;
};

Blockly.Blocks['point_in_direction'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("point in direction")
      .appendField(new Blockly.FieldNumber(90), "DEGREES");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(260);
    this.setTooltip("Points the sprite in a direction");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['point_in_direction'] = function (_block) {
  const degrees = _block.getFieldValue('DEGREES');
  return `await window.spriteController.setDirection(${degrees});\n`;
};

pythonGenerator.forBlock['point_in_direction'] = function (_block) {
  const degrees = _block.getFieldValue('DEGREES');
  return `sprite.set_direction(${degrees})\n`;
};

Blockly.Blocks['point_towards'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("point towards")
      .appendField(new Blockly.FieldTextInput("mouse-pointer"), "TARGET");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(260);
    this.setTooltip("Points the sprite towards a target");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['point_towards'] = function (_block) {
  const target = _block.getFieldValue('TARGET');
  return `await window.spriteController.pointTowards(${JSON.stringify(target)});\n`;
};

pythonGenerator.forBlock['point_towards'] = function (_block) {
  const target = _block.getFieldValue('TARGET');
  return `sprite.point_towards("${target}")\n`;
};

Blockly.Blocks['go_to_position'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("go to x:")
      .appendField(new Blockly.FieldNumber(0), "X")
      .appendField("y:")
      .appendField(new Blockly.FieldNumber(0), "Y");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(260);
    this.setTooltip("Moves sprite to specific position");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['go_to_position'] = function (_block) {
  const x = _block.getFieldValue('X');
  const y = _block.getFieldValue('Y');
  return `await window.spriteController.goTo(${x}, ${y});\n`;
};

pythonGenerator.forBlock['go_to_position'] = function (_block) {
  const x = _block.getFieldValue('X');
  const y = _block.getFieldValue('Y');
  return `sprite.goto(${x}, ${y})\n`;
};

Blockly.Blocks['glide_to_position'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("glide")
      .appendField(new Blockly.FieldNumber(1), "SECONDS")
      .appendField("secs to x:")
      .appendField(new Blockly.FieldNumber(0), "X")
      .appendField("y:")
      .appendField(new Blockly.FieldNumber(0), "Y");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(260);
    this.setTooltip("Glides to a position over time");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['glide_to_position'] = function (_block) {
  const seconds = _block.getFieldValue('SECONDS');
  const x = _block.getFieldValue('X');
  const y = _block.getFieldValue('Y');
  return `await window.spriteController.glide(${seconds}, ${x}, ${y});\n`;
};

pythonGenerator.forBlock['glide_to_position'] = function (_block) {
  const seconds = _block.getFieldValue('SECONDS');
  const x = _block.getFieldValue('X');
  const y = _block.getFieldValue('Y');
  return `sprite.glide(${seconds}, ${x}, ${y})\n`;
};

Blockly.Blocks['change_x'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("change x by")
      .appendField(new Blockly.FieldNumber(10), "DX");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(260);
    this.setTooltip("Changes x position by amount");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['change_x'] = function (_block) {
  const dx = _block.getFieldValue('DX');
  return `await window.spriteController.changeX(${dx});\n`;
};

pythonGenerator.forBlock['change_x'] = function (_block) {
  const dx = _block.getFieldValue('DX');
  return `sprite.change_x(${dx})\n`;
};

Blockly.Blocks['change_y'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("change y by")
      .appendField(new Blockly.FieldNumber(10), "DY");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(260);
    this.setTooltip("Changes y position by amount");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['change_y'] = function (_block) {
  const dy = _block.getFieldValue('DY');
  return `await window.spriteController.changeY(${dy});\n`;
};

pythonGenerator.forBlock['change_y'] = function (_block) {
  const dy = _block.getFieldValue('DY');
  return `sprite.change_y(${dy})\n`;
};

Blockly.Blocks['set_x'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("set x to")
      .appendField(new Blockly.FieldNumber(0), "X");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(260);
    this.setTooltip("Sets x position");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['set_x'] = function (_block) {
  const x = _block.getFieldValue('X');
  return `await window.spriteController.setX(${x});\n`;
};

pythonGenerator.forBlock['set_x'] = function (_block) {
  const x = _block.getFieldValue('X');
  return `sprite.set_x(${x})\n`;
};

Blockly.Blocks['set_y'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("set y to")
      .appendField(new Blockly.FieldNumber(0), "Y");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(260);
    this.setTooltip("Sets y position");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['set_y'] = function (_block) {
  const y = _block.getFieldValue('Y');
  return `await window.spriteController.setY(${y});\n`;
};

pythonGenerator.forBlock['set_y'] = function (_block) {
  const y = _block.getFieldValue('Y');
  return `sprite.set_y(${y})\n`;
};

Blockly.Blocks['x_position'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("x position");
    this.setOutput(true, null);
    this.setColour(260);
    this.setTooltip("Returns x position");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['x_position'] = function (_block) {
  return [`(await window.spriteController.getX())`, javascriptGenerator.ORDER_NONE];
};

pythonGenerator.forBlock['x_position'] = function (_block) {
  return [`sprite.x_position`, pythonGenerator.ORDER_MEMBER];
};

Blockly.Blocks['y_position'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("y position");
    this.setOutput(true, null);
    this.setColour(260);
    this.setTooltip("Returns y position");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['y_position'] = function (_block) {
  return [`(await window.spriteController.getY())`, javascriptGenerator.ORDER_NONE];
};

pythonGenerator.forBlock['y_position'] = function (_block) {
  return [`sprite.y_position`, pythonGenerator.ORDER_MEMBER];
};

Blockly.Blocks['direction'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("direction");
    this.setOutput(true, null);
    this.setColour(260);
    this.setTooltip("Returns current direction");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['direction'] = function (_block) {
  return [`(await window.spriteController.getDirection())`, javascriptGenerator.ORDER_NONE];
};

pythonGenerator.forBlock['direction'] = function (_block) {
  return [`sprite.direction`, pythonGenerator.ORDER_MEMBER];
};

Blockly.Blocks['play_sound'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("play sound")
      .appendField(new Blockly.FieldTextInput("meow"), "SOUND");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(290);
    this.setTooltip("Plays a sound");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['play_sound'] = function (_block) {
  const sound = _block.getFieldValue('SOUND');
  return `await window.spriteController.playSound(${JSON.stringify(sound)});\n`;
};

pythonGenerator.forBlock['play_sound'] = function (_block) {
  const sound = _block.getFieldValue('SOUND');
  return `sprite.play_sound("${sound}")\n`;
};

Blockly.Blocks['play_sound_until_done'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("play sound")
      .appendField(new Blockly.FieldTextInput("meow"), "SOUND")
      .appendField("until done");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(290);
    this.setTooltip("Plays a sound until done");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['play_sound_until_done'] = function (_block) {
  const sound = _block.getFieldValue('SOUND');
  return `await window.spriteController.playSoundUntilDone(${JSON.stringify(sound)});\n`;
};

pythonGenerator.forBlock['play_sound_until_done'] = function (_block) {
  const sound = _block.getFieldValue('SOUND');
  return `sprite.play_sound_until_done("${sound}")\n`;
};

Blockly.Blocks['stop_all_sounds'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("stop all sounds");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(290);
    this.setTooltip("Stops all sounds");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['stop_all_sounds'] = function (_block) {
  return `await window.spriteController.stopAllSounds();\n`;
};

pythonGenerator.forBlock['stop_all_sounds'] = function (_block) {
  return `sprite.stop_all_sounds()\n`;
};

Blockly.Blocks['set_volume'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("set volume to")
      .appendField(new Blockly.FieldNumber(100), "VOLUME")
      .appendField("%");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(290);
    this.setTooltip("Sets the volume");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['set_volume'] = function (_block) {
  const volume = _block.getFieldValue('VOLUME');
  return `await window.spriteController.setVolume(${volume});\n`;
};

pythonGenerator.forBlock['set_volume'] = function (_block) {
  const volume = _block.getFieldValue('VOLUME');
  return `sprite.set_volume(${volume})\n`;
};

Blockly.Blocks['change_volume'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("change volume by")
      .appendField(new Blockly.FieldNumber(10), "AMOUNT");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(290);
    this.setTooltip("Changes the volume by amount");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['change_volume'] = function (_block) {
  const amount = _block.getFieldValue('AMOUNT');
  return `await window.spriteController.changeVolume(${amount});\n`;
};

pythonGenerator.forBlock['change_volume'] = function (_block) {
  const amount = _block.getFieldValue('AMOUNT');
  return `sprite.change_volume(${amount})\n`;
};

Blockly.Blocks['volume'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("volume");
    this.setOutput(true, null);
    this.setColour(290);
    this.setTooltip("Returns current volume");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['volume'] = function (_block) {
  return [`(await window.spriteController.getVolume())`, javascriptGenerator.ORDER_NONE];
};

pythonGenerator.forBlock['volume'] = function (_block) {
  return [`sprite.volume`, pythonGenerator.ORDER_MEMBER];
};

// turn_left removed - turn_right already has left/right dropdown

Blockly.Blocks['when_flag_clicked'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("when")
      .appendField(new Blockly.FieldImage("https://www.gstatic.com/codesite/ph/images/star_on.gif", 15, 15, "*"))
      .appendField("clicked");
    this.setNextStatement(true, null);
    this.setColour(200);
    this.setTooltip("Runs when green flag clicked");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['when_flag_clicked'] = function (_block) {
  return '// When Green Flag Clicked\n';
};

pythonGenerator.forBlock['when_flag_clicked'] = function (_block) {
  return '# When Green Flag Clicked\n';
};

// ── MakeCode-style hat blocks ─────────────────────────────────────────────────

Blockly.Blocks['on_start'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('▶  시작하면');
    this.appendStatementInput('DO').setCheck(null);
    this.setColour('#16a34a');
    this.setTooltip('Run 버튼을 누르면 이 블록 안의 코드만 실행됩니다');
    this.setHelpUrl('');
    // Hat block: no previous statement
  }
};

javascriptGenerator.forBlock['on_start'] = function (block) {
  return javascriptGenerator.statementToCode(block, 'DO');
};

pythonGenerator.forBlock['on_start'] = function (block) {
  // Hat block — its body is conceptually at module scope. Blockly's
  // statementToCode prefixes one INDENT level, so we strip it back off so
  // the generated Python matches what a user would hand-type for the
  // top-level program (no spurious nesting).
  const body = pythonGenerator.statementToCode(block, 'DO');
  const indent = pythonGenerator.INDENT;
  return body
    .split('\n')
    .map(line => line.startsWith(indent) ? line.slice(indent.length) : line)
    .join('\n');
};

Blockly.Blocks['on_forever'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('♾️  무한반복');
    this.appendStatementInput('DO').setCheck(null);
    this.setColour('#1d4ed8');
    this.setTooltip('이 블록 안의 코드를 무한 반복합니다');
    this.setHelpUrl('');
    // Hat block: no previous statement
  }
};

javascriptGenerator.forBlock['on_forever'] = function (block) {
  const body = javascriptGenerator.statementToCode(block, 'DO') || '';
  return `while (window.__running !== false) {\n${body}  await new Promise(r => setTimeout(r, 16));\n}\n`;
};

pythonGenerator.forBlock['on_forever'] = function (block) {
  const body = pythonGenerator.statementToCode(block, 'DO') || '  pass\n';
  return `while True:\n${body}\n`;
};

Blockly.Blocks['join'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("join")
      .appendField(new Blockly.FieldTextInput("apple"), "A")
      .appendField(new Blockly.FieldTextInput("banana"), "B");
    this.setOutput(true, null);
    this.setColour(230);
    this.setTooltip("Joins two strings");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['join'] = function (_block) {
  const a = _block.getFieldValue('A');
  const b = _block.getFieldValue('B');
  return [`${JSON.stringify(a)} + ${JSON.stringify(b)}`, javascriptGenerator.ORDER_ADDITION];
};

pythonGenerator.forBlock['join'] = function (_block) {
  const a = _block.getFieldValue('A');
  const b = _block.getFieldValue('B');
  return [`"${a}" + "${b}"`, pythonGenerator.ORDER_ADDITION];
};

Blockly.Blocks['if_on_edge_bounce'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("if on edge, bounce");
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(260);
    this.setTooltip("Bounces if touching edge");
    this.setHelpUrl("");
  }
};

javascriptGenerator.forBlock['if_on_edge_bounce'] = function (_block) {
  return 'await window.spriteController.ifOnEdgeBounce();\n';
};

pythonGenerator.forBlock['if_on_edge_bounce'] = function (_block) {
  return 'sprite.if_on_edge_bounce()\n';
};

// ──────────────────────────────────────────────────────────────────────────────
// py_call & py_stmt: composable "function call" blocks.
//
// These are the primitives the snippet workspaces use so a library call like
// cv2.VideoCapture(0) shows up as a real composable block tree:
//
//   py_call( FUNC="cv2.VideoCapture", ARG0 = math_number(0) )   → expression block
//   py_stmt( FUNC="cv2.imshow",      ARG0 = text("Gray"),
//                                    ARG1 = py_getvar("gray") ) → statement block
//
// Each argument is a VALUE input slot, so the user can plug text / number /
// variable / another py_call block into it — that's what "real block coding"
// looks like, instead of stuffing a Python expression into a text field.
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Generic composable function-call block with a DYNAMIC number of argument
 * slots. The user clicks +/− on the block header to grow or shrink it —
 * there's no hard-coded ARG0..ARG3 array anymore, and no dead/empty slots.
 *
 * The block state (`argCount`) is serialized via Blockly's mutator API so
 * workspaces persist across reloads, and pyAst.js's visitor sizes the block
 * to match the number of AST args it needs to plug in.
 */
const _makePyCallBlock = ({ isStatement, colour, tooltip }) => ({

  init: function () {
    // Start with 0 args + no callee value-input — loadExtraState / visitor will
    // grow the block. This avoids an empty ARG0 slot for no-arg calls.
    this.argCount_ = 0;
    this.hasCallee_ = false;
    this.appendDummyInput('HEADER')
      .appendField(new Blockly.FieldTextInput('fn'), 'FUNC')
      .appendField(new Blockly.FieldImage(
        "data:image/svg+xml;base64," + btoa(
          "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'><circle cx='8' cy='8' r='7' fill='#10b981'/><path d='M4 8h8M8 4v8' stroke='white' stroke-width='2'/></svg>"
        ), 16, 16, '+', () => this.appendArg_()))
      .appendField(new Blockly.FieldImage(
        "data:image/svg+xml;base64," + btoa(
          "<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16'><circle cx='8' cy='8' r='7' fill='#ef4444'/><path d='M4 8h8' stroke='white' stroke-width='2'/></svg>"
        ), 16, 16, '−', () => this.removeArg_()));
    this.appendDummyInput('TAIL').appendField('()');
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

  /** Persist arg count + whether the block uses a CALLEE value input. */
  mutationToDom: function () {
    const container = document.createElement('mutation');
    container.setAttribute('args', String(this.argCount_ || 0));
    container.setAttribute('callee', this.hasCallee_ ? '1' : '0');
    return container;
  },
  domToMutation: function (xml) {
    const n = parseInt(xml.getAttribute('args'), 10);
    const c = xml.getAttribute('callee') === '1';
    this._rebuild(Number.isFinite(n) ? n : 0, c);
  },
  saveExtraState: function () {
    return { argCount: this.argCount_, hasCallee: !!this.hasCallee_ };
  },
  loadExtraState: function (state) {
    this._rebuild(state.argCount ?? 0, !!state.hasCallee);
  },

  _rebuild: function (n, hasCallee) {
    n = Math.max(0, Math.min(20, n | 0));
    // Remove all dynamic inputs
    if (this.getInput('CALLEE')) this.removeInput('CALLEE');
    let i = 0;
    while (this.getInput(`ARG${i}`)) { this.removeInput(`ARG${i}`); i++; }
    if (this.getInput('TAIL')) this.removeInput('TAIL');
    // Optional CALLEE value input — used when the callee is a structural
    // expression (method chain, attribute path, indexed value).
    if (hasCallee) {
      this.appendValueInput('CALLEE').setCheck(null);
    }
    for (let k = 0; k < n; k++) {
      const inp = this.appendValueInput(`ARG${k}`).setCheck(null);
      if (k === 0) inp.appendField('(');
      else inp.appendField(',');
    }
    this.appendDummyInput('TAIL').appendField(n === 0 ? '()' : ')');
    this.argCount_ = n;
    this.hasCallee_ = !!hasCallee;
  },

  setArgCount_: function (n) { this._rebuild(n, this.hasCallee_); },
  appendArg_: function () { this._rebuild((this.argCount_ || 0) + 1, this.hasCallee_); },
  removeArg_: function () { this._rebuild(Math.max(0, (this.argCount_ || 0) - 1), this.hasCallee_); },
});

Blockly.Blocks['py_call'] = _makePyCallBlock({
  isStatement: false, colour: '#60a5fa',
  tooltip: 'Call a function and use its return value. Click + / − to change arg count.',
});
Blockly.Blocks['py_stmt'] = _makePyCallBlock({
  isStatement: true, colour: '#818cf8',
  tooltip: 'Call a function for its side effect. Click + / − to change arg count.',
});

const _collectPyArgs = (block, valueToCode) => {
  const args = [];
  const n = block.argCount_ ?? 0;
  for (let i = 0; i < n; i++) {
    const v = valueToCode(block, `ARG${i}`, 0);
    // Empty slot → emit "None" so the generated Python is still valid syntax
    args.push((v === '' || v === null || v === undefined) ? 'None' : v);
  }
  return args;
};

/** The callee expression: prefer the connected CALLEE value-block, fall back to FUNC text. */
const _readPyCallee = (block, valueToCode) => {
  if (block.hasCallee_) {
    const v = valueToCode(block, 'CALLEE', 0);
    if (v && v.trim()) return v;
  }
  return block.getFieldValue('FUNC') || 'fn';
};

pythonGenerator.forBlock['py_call'] = function (block) {
  const fn = _readPyCallee(block, pythonGenerator.valueToCode.bind(pythonGenerator));
  const args = _collectPyArgs(block, pythonGenerator.valueToCode.bind(pythonGenerator));
  return [`${fn}(${args.join(', ')})`, 0];
};
pythonGenerator.forBlock['py_stmt'] = function (block) {
  const fn = _readPyCallee(block, pythonGenerator.valueToCode.bind(pythonGenerator));
  const args = _collectPyArgs(block, pythonGenerator.valueToCode.bind(pythonGenerator));
  return `${fn}(${args.join(', ')})\n`;
};
javascriptGenerator.forBlock['py_call'] = function (block) {
  const fn = _readPyCallee(block, javascriptGenerator.valueToCode.bind(javascriptGenerator));
  const args = _collectPyArgs(block, javascriptGenerator.valueToCode.bind(javascriptGenerator));
  return [`/* ${fn}(${args.join(', ')}) */ null`, 0];
};
javascriptGenerator.forBlock['py_stmt'] = function (block) {
  const fn = _readPyCallee(block, javascriptGenerator.valueToCode.bind(javascriptGenerator));
  const args = _collectPyArgs(block, javascriptGenerator.valueToCode.bind(javascriptGenerator));
  return `console.log(${JSON.stringify(fn + '()')}, ${args.join(', ')});\n`;
};

// py_getvar: read a variable by name as a value
Blockly.Blocks['py_getvar'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('var')
      .appendField(new Blockly.FieldTextInput('x'), 'VAR_NAME');
    this.setOutput(true, null);
    this.setColour('#f97316');
    this.setTooltip('Reference an existing variable as a value.');
  }
};
pythonGenerator.forBlock['py_getvar'] = function (block) {
  const n = block.getFieldValue('VAR_NAME') || 'x';
  return [n, 0];
};
javascriptGenerator.forBlock['py_getvar'] = function (block) {
  const n = block.getFieldValue('VAR_NAME') || 'x';
  return [n, 0];
};

// raw_python: verbatim Python statement (no wrapping, no comment downgrade).
// Used by the AST visitor as the fallback when a Python construct doesn't fit
// any structural block yet (list comprehensions, decorators, unpacking, etc.)
// so we never silently drop user code — it runs exactly as written.
Blockly.Blocks['raw_python'] = {
  init: function () {
    this.appendDummyInput()
      .appendField('py')
      .appendField(new Blockly.FieldTextInput('pass'), 'CODE');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#94a3b8');
    this.setTooltip('Verbatim Python statement (fallback for unsupported syntax).');
  }
};
pythonGenerator.forBlock['raw_python'] = function (block) {
  const code = block.getFieldValue('CODE') || 'pass';
  return code.endsWith('\n') ? code : code + '\n';
};
javascriptGenerator.forBlock['raw_python'] = function (block) {
  const code = block.getFieldValue('CODE') || '';
  return `/* python: ${code.replace(/\*\//g, '* /')} */\n`;
};

// py_binop: composable binary operation (takes two value blocks, not text fields)
Blockly.Blocks['py_binop'] = {
  init: function () {
    this.appendValueInput('A').setCheck(null);
    this.appendDummyInput()
      .appendField(new Blockly.FieldTextInput('+'), 'OP');
    this.appendValueInput('B').setCheck(null);
    this.setInputsInline(true);
    this.setOutput(true, null);
    this.setColour('#0ea5e9');
    this.setTooltip('Binary operation: + - * / == != < <= > >= and or ...');
  }
};
pythonGenerator.forBlock['py_binop'] = function (block) {
  const a = pythonGenerator.valueToCode(block, 'A', 0) || '0';
  const b = pythonGenerator.valueToCode(block, 'B', 0) || '0';
  const op = (block.getFieldValue('OP') || '+').trim();
  return [`(${a} ${op} ${b})`, 0];
};
javascriptGenerator.forBlock['py_binop'] = function (block) {
  const a = javascriptGenerator.valueToCode(block, 'A', 0) || '0';
  const b = javascriptGenerator.valueToCode(block, 'B', 0) || '0';
  const op = (block.getFieldValue('OP') || '+').trim();
  return [`(${a} ${op} ${b})`, 0];
};

// py_unary: composable unary op
Blockly.Blocks['py_unary'] = {
  init: function () {
    this.appendDummyInput().appendField(new Blockly.FieldTextInput('-'), 'OP');
    this.appendValueInput('A').setCheck(null);
    this.setInputsInline(true);
    this.setOutput(true, null);
    this.setColour('#0ea5e9');
    this.setTooltip('Unary operation: -x, not x');
  }
};
pythonGenerator.forBlock['py_unary'] = function (block) {
  const a = pythonGenerator.valueToCode(block, 'A', 0) || '0';
  const op = (block.getFieldValue('OP') || '-').trim();
  return [`${op === 'not' ? 'not ' : op}${a}`, 0];
};
javascriptGenerator.forBlock['py_unary'] = function (block) {
  const a = javascriptGenerator.valueToCode(block, 'A', 0) || '0';
  const op = (block.getFieldValue('OP') || '-').trim();
  return [`${op === 'not' ? '!' : op}(${a})`, 0];
};

// py_assign: set VAR = <value-block> (composable right-hand side, unlike 'variable' which is a text field)
Blockly.Blocks['py_assign'] = {
  init: function () {
    this.appendValueInput('VALUE').setCheck(null)
      .appendField('set')
      .appendField(new Blockly.FieldTextInput('x'), 'VAR_NAME')
      .appendField('=');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('#a855f7');
    this.setTooltip('Assign the value on the right to the named variable.');
  }
};
pythonGenerator.forBlock['py_assign'] = function (block) {
  const n = block.getFieldValue('VAR_NAME') || 'x';
  const v = pythonGenerator.valueToCode(block, 'VALUE', 0) || 'None';
  return `${n} = ${v}\n`;
};
javascriptGenerator.forBlock['py_assign'] = function (block) {
  const n = block.getFieldValue('VAR_NAME') || 'x';
  const v = javascriptGenerator.valueToCode(block, 'VALUE', 0) || 'null';
  return `let ${n} = ${v};\n`;
};

export const toolboxCategories = [
  {
    kind: "category",
    name: "Motion",
    colour: "#4C97FF", // Blue
    contents: [
      { kind: "block", type: "move_right" }, // Keeping internal name, user sees "move 10 steps"
      { kind: "block", type: "turn_right" },
      { kind: "block", type: "go_to_position" },
      { kind: "block", type: "glide_to_position" },
      { kind: "block", type: "point_in_direction" },
      { kind: "block", type: "point_towards" },
      { kind: "block", type: "change_x" },
      { kind: "block", type: "set_x" },
      { kind: "block", type: "change_y" },
      { kind: "block", type: "set_y" },
      { kind: "block", type: "if_on_edge_bounce" }, // Need to implement this if referenced, or remove from list if not ready.
      { kind: "block", type: "x_position" },
      { kind: "block", type: "y_position" },
      { kind: "block", type: "direction" }
    ]
  },
  {
    kind: "category",
    name: "Looks",
    colour: "#9966FF", // Purple
    contents: [
      { kind: "block", type: "say_for_seconds" },
      { kind: "block", type: "say" },
      { kind: "block", type: "think_for_seconds" },
      { kind: "block", type: "think" },
      { kind: "block", type: "switch_costume" },
      { kind: "block", type: "next_costume" },
      { kind: "block", type: "switch_backdrop" },
      { kind: "block", type: "next_backdrop" },
      { kind: "block", type: "change_size" },
      { kind: "block", type: "set_size" },
      { kind: "block", type: "show" },
      { kind: "block", type: "hide" },
      { kind: "block", type: "go_to_layer" },
      { kind: "block", type: "costume_number" },
      { kind: "block", type: "backdrop_number" },
      { kind: "block", type: "backdrop_name" },
      { kind: "block", type: "size" }
    ]
  },
  {
    kind: "category",
    name: "Sound",
    colour: "#D65CD6", // Pink/Magenta
    contents: [
      { kind: "block", type: "play_sound_until_done" },
      { kind: "block", type: "play_sound" },
      { kind: "block", type: "stop_all_sounds" },
      { kind: "block", type: "change_volume" },
      { kind: "block", type: "set_volume" },
      { kind: "block", type: "volume" }
    ]
  },
  {
    kind: "category",
    name: "Events",
    colour: "#009900",
    contents: [
      { kind: "block", type: "on_start" },
      { kind: "block", type: "on_forever" },
      { kind: "sep" },
      { kind: "block", type: "when_flag_clicked" },
    ]
  },
  {
    kind: "category",
    name: "Loops",
    colour: "#207a4b", // MakeCode Loops Green
    contents: [
      { kind: "block", type: "wait" },
      { kind: "block", type: "repeat" },
      { kind: "block", type: "loop_forever" },
      { kind: "block", type: "repeat_until" },
      { kind: "block", type: "py_for_iter" }, // for x in iterable:
      { kind: "block", type: "py_with" },     // with X as Y:
      { kind: "block", type: "py_try" },      // try / except / finally
      { kind: "block", type: "py_raise" },    // raise
      { kind: "block", type: "py_return" },   // return
      { kind: "block", type: "py_yield" },    // yield / yield from
      { kind: "block", type: "py_await" },    // await expr
      { kind: "block", type: "py_assert" },   // assert
      { kind: "block", type: "py_match" },    // match / case
      { kind: "block", type: "py_case" },
    ]
  },
  {
    kind: "category",
    name: "Logic",
    colour: "#006970", // MakeCode Logic Teal
    contents: [
      { kind: "block", type: "if" },
      { kind: "block", type: "if_else" },
      { kind: "block", type: "math_compare" },
      { kind: "block", type: "and_or" },
      { kind: "block", type: "not" },
      { kind: "block", type: "py_ifexp" },     // x if cond else y
      { kind: "block", type: "py_bool" },      // True / False literal
      { kind: "block", type: "py_none" },      // None literal
    ]
  },
  {
    kind: "category",
    name: "Math",
    colour: "#7600A7", // MakeCode Math Purple
    contents: [
      { kind: "block", type: "math_number" },
      { kind: "block", type: "math_arithmetic" },
      { kind: "block", type: "py_binop" },        // Python +/-/*//// + comparisons
      { kind: "block", type: "py_unary" },        // -x / not x / ~x
      { kind: "block", type: "py_builtin_cast" }, // str/int/float/len/bool/abs/...
      { kind: "block", type: "math_single" },
      { kind: "block", type: "math_trig" },
      { kind: "block", type: "math_constant" },
      { kind: "block", type: "math_number_property" },
      { kind: "block", type: "math_operation" },
      { kind: "block", type: "random" },
      { kind: "block", type: "math_mod" },
      { kind: "block", type: "math_round" }
    ]
  },
  {
    kind: "category",
    name: "Text",
    colour: "#990055", // Distinct Text Color (Maroon)
    contents: [
      { kind: "block", type: "text" },
      { kind: "block", type: "print" },        // Python builtin: print(value)
      { kind: "block", type: "py_fstring" },   // f-strings
      { kind: "block", type: "join" },
      { kind: "block", type: "text_length" },
      { kind: "block", type: "text_charAt" }
    ]
  },
  {
    kind: "category",
    name: "Variables",
    colour: "#A80000", // MakeCode Variables Red
    // Mix Blockly's dynamic Variables UI (Create variable button +
    // variables_set/get for any var the user defines) with the curated
    // Scratch-style `variable` and `change_variable` text-field blocks
    // that pyAst emits for simple assignments and `x += n` forms.
    custom: "VARIABLE",
    contents: [
      { kind: "block", type: "variable" },
      { kind: "block", type: "change_variable" },
      { kind: "block", type: "py_assign" },           // structural assign
      { kind: "block", type: "py_getvar" },           // structural read
      { kind: "block", type: "py_tuple_assign" },     // a, b = expr
      { kind: "block", type: "py_subscript_assign" }, // arr[i] = v
      { kind: "block", type: "py_attr_assign" },      // obj.attr = v
      { kind: "block", type: "py_delete" },           // del x
      { kind: "block", type: "py_scope" },            // global / nonlocal
    ],
  },
  {
    kind: "category",
    name: "Lists",
    colour: "#F36E21", // MakeCode Arrays Orange
    contents: [
      { kind: "block", type: "lists_create_with" },
      { kind: "block", type: "lists_repeat" },
      { kind: "block", type: "lists_length" },
      { kind: "block", type: "lists_isEmpty" },
      { kind: "block", type: "lists_indexOf" },
      { kind: "block", type: "lists_getIndex" },
      { kind: "block", type: "lists_setIndex" },
      { kind: "block", type: "lists_getSublist" },
      { kind: "block", type: "lists_split" },
      { kind: "block", type: "lists_sort" },
      { kind: "block", type: "py_list" },          // [a, b, c]
      { kind: "block", type: "py_tuple" },         // (a, b, c)
      { kind: "block", type: "py_dict" },          // {k: v}
      { kind: "block", type: "py_subscript" },     // x[i]
      { kind: "block", type: "py_slice" },         // x[a:b:c]
      { kind: "block", type: "py_comprehension" }, // [expr for x in iterable]
      { kind: "block", type: "py_dict_comp" },     // {k: v for ...}
    ]
  },
  {
    kind: "category",
    name: "My Blocks",
    colour: "#003366", // MakeCode Functions Dark Blue
    custom: "PROCEDURE"
  },
  {
    kind: "category",
    name: "Comments",
    colour: "90",
    contents: [
      { kind: "block", type: "comment" }
    ]
  },
  // Python-native structural blocks that don't fit Scratch-style categories.
  // py_call / py_stmt are generic call wrappers (used when no library schema
  // matches), py_attr is `obj.attr`, py_keyword_arg is `kw=value` in calls,
  // py_lambda / py_funcdef build inline functions. These ARE Python's
  // structural primitives — having a home means a workspace transpiled from
  // arbitrary Python is fully reproducible from the toolbox.
  {
    kind: "category",
    name: "🐍 Python",
    colour: "#306998",  // Python brand blue
    contents: [
      { kind: "block", type: "py_call" },
      { kind: "block", type: "py_stmt" },
      { kind: "block", type: "py_attr" },
      { kind: "block", type: "py_keyword_arg" },
      { kind: "block", type: "py_lambda" },
      { kind: "block", type: "py_funcdef" },
      { kind: "block", type: "raw_python" },
    ]
  },
  {
    kind: "category",
    name: "Library",
    colour: "#9933cc", // Purple
    contents: [
      { kind: "block", type: "structure_module_def" },
      { kind: "block", type: "structure_typed_function" },
      { kind: "block", type: "structure_return_typed" },
      { kind: "block", type: "structure_import" },
      { kind: "block", type: "structure_call" }
    ]
  },
  classToolboxCategory,
  ...buildLibraryToolboxCategories()
];

// Static base categories (everything except dynamic library ones)
const BASE_CATEGORIES = toolboxCategories.filter(c =>
  !c.name?.includes('📦') && !c.name?.includes('🐢') && !c.name?.includes('🎮')
);

// Call this after installing/uninstalling a library to get a fresh toolbox config
export const getFullToolboxConfig = () => ({
  kind: 'categoryToolbox',
  contents: [
    ...BASE_CATEGORIES,
    classToolboxCategory,
    blockBuilderToolboxCategory,
    ...buildLibraryToolboxCategories()
  ]
});
