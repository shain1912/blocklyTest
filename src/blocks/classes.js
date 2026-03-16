/**
 * OOP Block Grammar
 *
 * Brings class-based programming to visual blocks:
 *   class_define        → Python: class Foo(Bar):
 *   class_constructor   → Python: def __init__(self, args):
 *   class_method        → Python: def method(self, args) -> Type:
 *   class_instance      → Python: obj = MyClass(args)
 *   class_method_call   → Python: obj.method(args)
 *   class_property_get  → Python: obj.attr (value block)
 *   class_property_set  → Python: obj.attr = value
 */

import * as Blockly from 'blockly/core';
import { javascriptGenerator } from 'blockly/javascript';
import { pythonGenerator } from 'blockly/python';

const CLASS_COLOR = '#1d4ed8';      // Deep blue — "structure"
const METHOD_COLOR = '#7c3aed';     // Purple — "behaviour"
const INSTANCE_COLOR = '#0d9488';   // Teal — "object"

// ── 1. class_define ──────────────────────────────────────────────────────────
Blockly.Blocks['class_define'] = {
  init() {
    this.appendDummyInput()
      .appendField('class')
      .appendField(new Blockly.FieldTextInput('MyClass'), 'NAME')
      .appendField('(')
      .appendField(new Blockly.FieldTextInput(''), 'PARENT')
      .appendField(')');
    this.appendStatementInput('BODY').setCheck(null);
    this.setColour(CLASS_COLOR);
    this.setTooltip('Defines a class (optionally inheriting from a parent)');
    this.setHelpUrl('');
  }
};

pythonGenerator.forBlock['class_define'] = function (block) {
  const name = block.getFieldValue('NAME');
  const parent = block.getFieldValue('PARENT').trim();
  const header = parent ? `class ${name}(${parent}):` : `class ${name}:`;
  const body = pythonGenerator.statementToCode(block, 'BODY') || '  pass\n';
  return `${header}\n${body}\n`;
};

javascriptGenerator.forBlock['class_define'] = function (block) {
  const name = block.getFieldValue('NAME');
  const parent = block.getFieldValue('PARENT').trim();
  const body = javascriptGenerator.statementToCode(block, 'BODY') || '';
  const ext = parent ? ` extends ${parent}` : '';
  return `class ${name}${ext} {\n${body}}\n`;
};

// ── 2. class_constructor ─────────────────────────────────────────────────────
Blockly.Blocks['class_constructor'] = {
  init() {
    this.appendDummyInput()
      .appendField('__init__ (self,')
      .appendField(new Blockly.FieldTextInput(''), 'ARGS')
      .appendField(')');
    this.appendStatementInput('BODY').setCheck(null);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(METHOD_COLOR);
    this.setTooltip('Constructor — runs when an instance is created');
    this.setHelpUrl('');
  }
};

pythonGenerator.forBlock['class_constructor'] = function (block) {
  const args = block.getFieldValue('ARGS').trim();
  const params = args ? `self, ${args}` : 'self';
  const body = pythonGenerator.statementToCode(block, 'BODY') || '    pass\n';
  return `  def __init__(${params}):\n${body}\n`;
};

javascriptGenerator.forBlock['class_constructor'] = function (block) {
  const args = block.getFieldValue('ARGS').trim();
  const body = javascriptGenerator.statementToCode(block, 'BODY') || '';
  // constructor can't be async — wrap body in async IIFE so await works inside
  return `  constructor(${args}) {\n    (async () => {\n${body}    })();\n  }\n`;
};

// ── 3. class_method ──────────────────────────────────────────────────────────
Blockly.Blocks['class_method'] = {
  init() {
    this.appendDummyInput()
      .appendField('def')
      .appendField(new Blockly.FieldTextInput('my_method'), 'NAME')
      .appendField('(self,')
      .appendField(new Blockly.FieldTextInput(''), 'ARGS')
      .appendField(') ->')
      .appendField(new Blockly.FieldDropdown([
        ['None', 'None'], ['int', 'int'], ['float', 'float'],
        ['str', 'str'], ['bool', 'bool'], ['list', 'list'],
        ['dict', 'dict'], ['Any', 'Any']
      ]), 'RETURN_TYPE');
    this.appendStatementInput('BODY').setCheck(null);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(METHOD_COLOR);
    this.setTooltip('Defines an instance method');
    this.setHelpUrl('');
  }
};

pythonGenerator.forBlock['class_method'] = function (block) {
  const name = block.getFieldValue('NAME');
  const args = block.getFieldValue('ARGS').trim();
  const ret = block.getFieldValue('RETURN_TYPE');
  const params = args ? `self, ${args}` : 'self';
  const body = pythonGenerator.statementToCode(block, 'BODY') || '    pass\n';
  return `  def ${name}(${params}) -> ${ret}:\n${body}\n`;
};

javascriptGenerator.forBlock['class_method'] = function (block) {
  const name = block.getFieldValue('NAME');
  const args = block.getFieldValue('ARGS').trim();
  const body = javascriptGenerator.statementToCode(block, 'BODY') || '';
  return `  async ${name}(${args}) {\n${body}  }\n`;
};

// ── 4. class_instance ────────────────────────────────────────────────────────
Blockly.Blocks['class_instance'] = {
  init() {
    this.appendDummyInput()
      .appendField('create')
      .appendField(new Blockly.FieldTextInput('obj'), 'VAR_NAME')
      .appendField('=')
      .appendField(new Blockly.FieldTextInput('MyClass'), 'CLASS_NAME')
      .appendField('(')
      .appendField(new Blockly.FieldTextInput(''), 'ARGS')
      .appendField(')');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(INSTANCE_COLOR);
    this.setTooltip('Creates an instance of a class');
    this.setHelpUrl('');
  }
};

pythonGenerator.forBlock['class_instance'] = function (block) {
  const varName = block.getFieldValue('VAR_NAME');
  const className = block.getFieldValue('CLASS_NAME');
  const args = block.getFieldValue('ARGS');
  return `${varName} = ${className}(${args})\n`;
};

javascriptGenerator.forBlock['class_instance'] = function (block) {
  const varName = block.getFieldValue('VAR_NAME');
  const className = block.getFieldValue('CLASS_NAME');
  const args = block.getFieldValue('ARGS');
  return `let ${varName} = new ${className}(${args});\n`;
};

// ── 5. class_method_call ─────────────────────────────────────────────────────
Blockly.Blocks['class_method_call'] = {
  init() {
    this.appendDummyInput()
      .appendField('call')
      .appendField(new Blockly.FieldTextInput('obj'), 'OBJ')
      .appendField('.')
      .appendField(new Blockly.FieldTextInput('method'), 'METHOD')
      .appendField('(')
      .appendField(new Blockly.FieldTextInput(''), 'ARGS')
      .appendField(')');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(INSTANCE_COLOR);
    this.setTooltip('Calls a method on an object');
    this.setHelpUrl('');
  }
};

pythonGenerator.forBlock['class_method_call'] = function (block) {
  const obj = block.getFieldValue('OBJ');
  const method = block.getFieldValue('METHOD');
  const args = block.getFieldValue('ARGS');
  return `${obj}.${method}(${args})\n`;
};

javascriptGenerator.forBlock['class_method_call'] = function (block) {
  const obj = block.getFieldValue('OBJ');
  const method = block.getFieldValue('METHOD');
  const args = block.getFieldValue('ARGS');
  return `await ${obj}.${method}(${args});\n`;
};

// ── 6. class_property_set ────────────────────────────────────────────────────
Blockly.Blocks['class_property_set'] = {
  init() {
    this.appendDummyInput()
      .appendField('set')
      .appendField(new Blockly.FieldTextInput('self'), 'OBJ')
      .appendField('.')
      .appendField(new Blockly.FieldTextInput('name'), 'ATTR')
      .appendField('=')
      .appendField(new Blockly.FieldTextInput('value'), 'VALUE');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(INSTANCE_COLOR);
    this.setTooltip('Sets an object attribute');
    this.setHelpUrl('');
  }
};

pythonGenerator.forBlock['class_property_set'] = function (block) {
  const obj = block.getFieldValue('OBJ');
  const attr = block.getFieldValue('ATTR');
  const value = block.getFieldValue('VALUE');
  return `${obj}.${attr} = ${value}\n`;
};

javascriptGenerator.forBlock['class_property_set'] = function (block) {
  const obj = block.getFieldValue('OBJ');
  const attr = block.getFieldValue('ATTR');
  const value = block.getFieldValue('VALUE');
  return `${obj}.${attr} = ${value};\n`;
};

// ── 7. class_property_get (value block) ──────────────────────────────────────
Blockly.Blocks['class_property_get'] = {
  init() {
    this.appendDummyInput()
      .appendField(new Blockly.FieldTextInput('self'), 'OBJ')
      .appendField('.')
      .appendField(new Blockly.FieldTextInput('name'), 'ATTR');
    this.setOutput(true, null);
    this.setColour(INSTANCE_COLOR);
    this.setTooltip('Gets an object attribute (value)');
    this.setHelpUrl('');
  }
};

pythonGenerator.forBlock['class_property_get'] = function (block) {
  const obj = block.getFieldValue('OBJ');
  const attr = block.getFieldValue('ATTR');
  return [`${obj}.${attr}`, pythonGenerator.ORDER_MEMBER];
};

javascriptGenerator.forBlock['class_property_get'] = function (block) {
  const obj = block.getFieldValue('OBJ');
  const attr = block.getFieldValue('ATTR');
  return [`${obj}.${attr}`, javascriptGenerator.ORDER_MEMBER];
};

// ── Toolbox category export ───────────────────────────────────────────────────
export const classToolboxCategory = {
  kind: 'category',
  name: '🏛 Classes',
  colour: CLASS_COLOR,
  contents: [
    { kind: 'block', type: 'class_define' },
    { kind: 'block', type: 'class_constructor' },
    { kind: 'block', type: 'class_method' },
    { kind: 'sep' },
    { kind: 'block', type: 'class_instance' },
    { kind: 'block', type: 'class_method_call' },
    { kind: 'sep' },
    { kind: 'block', type: 'class_property_set' },
    { kind: 'block', type: 'class_property_get' },
  ]
};
