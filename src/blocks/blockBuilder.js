/**
 * Block Builder - Meta blocks for creating custom blocks
 * 블록을 만드는 블록!
 */

import * as Blockly from 'blockly/core';
import { javascriptGenerator } from 'blockly/javascript';
import { pythonGenerator } from 'blockly/python';

// ══════════════════════════════════════════════════════════════════════════════
// 1. Define Event Block - 이벤트 블록 정의
// ══════════════════════════════════════════════════════════════════════════════

Blockly.Blocks['meta_define_event_block'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("📦 Define Event Block");
    this.appendDummyInput()
      .appendField("Block Type:")
      .appendField(new Blockly.FieldTextInput("my_event"), "BLOCK_TYPE");
    this.appendDummyInput()
      .appendField("Display Label:")
      .appendField(new Blockly.FieldTextInput("⚡ my event"), "LABEL");
    this.appendDummyInput()
      .appendField("Colour:")
      .appendField(new Blockly.FieldColour("#dc2626"), "COLOUR");
    this.appendStatementInput("PARAMETERS")
      .setCheck("meta_parameter")
      .appendField("Parameters:");
    this.appendStatementInput("CODE")
      .setCheck(null)
      .appendField("Event Code:");
    this.setColour("#7c3aed");
    this.setTooltip("Define a custom event block");
    this.setHelpUrl("");
    this.setPreviousStatement(false);
    this.setNextStatement(false);
  }
};

javascriptGenerator.forBlock['meta_define_event_block'] = function (block) {
  const blockType = block.getFieldValue('BLOCK_TYPE');
  const label = block.getFieldValue('LABEL');
  const colour = block.getFieldValue('COLOUR');

  // Get parameters
  const paramsCode = javascriptGenerator.statementToCode(block, 'PARAMETERS');

  // Get event code
  const eventCode = javascriptGenerator.statementToCode(block, 'CODE');

  return `// Block Definition: ${blockType}\n// This creates a new event block\n`;
};

pythonGenerator.forBlock['meta_define_event_block'] = function (block) {
  const blockType = block.getFieldValue('BLOCK_TYPE');
  const label = block.getFieldValue('LABEL');

  const eventCode = pythonGenerator.statementToCode(block, 'CODE') || '  pass\n';

  return `# Block: ${blockType}\n# Label: ${label}\n${eventCode}\n`;
};

// ══════════════════════════════════════════════════════════════════════════════
// 2. Add Parameter - 파라미터 추가
// ══════════════════════════════════════════════════════════════════════════════

Blockly.Blocks['meta_add_dropdown_param'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("➕ Dropdown Parameter");
    this.appendDummyInput()
      .appendField("Name:")
      .appendField(new Blockly.FieldTextInput("KEY"), "PARAM_NAME");
    this.appendDummyInput()
      .appendField("Options (comma separated):")
      .appendField(new Blockly.FieldTextInput("space,enter,a,b"), "OPTIONS");
    this.setColour("#8b5cf6");
    this.setOutput(false);
    this.setPreviousStatement(true, "meta_parameter");
    this.setNextStatement(true, "meta_parameter");
    this.setTooltip("Add a dropdown parameter to the block");
  }
};

javascriptGenerator.forBlock['meta_add_dropdown_param'] = function (block) {
  const paramName = block.getFieldValue('PARAM_NAME');
  const options = block.getFieldValue('OPTIONS');
  return `// Param: ${paramName} = dropdown(${options})\n`;
};

pythonGenerator.forBlock['meta_add_dropdown_param'] = function (block) {
  const paramName = block.getFieldValue('PARAM_NAME');
  return `# Parameter: ${paramName}\n`;
};

// ══════════════════════════════════════════════════════════════════════════════
// 3. Add Text Parameter
// ══════════════════════════════════════════════════════════════════════════════

Blockly.Blocks['meta_add_text_param'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("➕ Text Parameter");
    this.appendDummyInput()
      .appendField("Name:")
      .appendField(new Blockly.FieldTextInput("MESSAGE"), "PARAM_NAME");
    this.appendDummyInput()
      .appendField("Default:")
      .appendField(new Blockly.FieldTextInput("Hello"), "DEFAULT");
    this.setColour("#8b5cf6");
    this.setPreviousStatement(true, "meta_parameter");
    this.setNextStatement(true, "meta_parameter");
    this.setTooltip("Add a text input parameter");
  }
};

javascriptGenerator.forBlock['meta_add_text_param'] = function (block) {
  const paramName = block.getFieldValue('PARAM_NAME');
  return `// Param: ${paramName} = text\n`;
};

pythonGenerator.forBlock['meta_add_text_param'] = function (block) {
  return '';
};

// ══════════════════════════════════════════════════════════════════════════════
// 4. Add Number Parameter
// ══════════════════════════════════════════════════════════════════════════════

Blockly.Blocks['meta_add_number_param'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("➕ Number Parameter");
    this.appendDummyInput()
      .appendField("Name:")
      .appendField(new Blockly.FieldTextInput("AMOUNT"), "PARAM_NAME");
    this.appendDummyInput()
      .appendField("Default:")
      .appendField(new Blockly.FieldNumber(10), "DEFAULT");
    this.setColour("#8b5cf6");
    this.setPreviousStatement(true, "meta_parameter");
    this.setNextStatement(true, "meta_parameter");
    this.setTooltip("Add a number input parameter");
  }
};

javascriptGenerator.forBlock['meta_add_number_param'] = function (block) {
  const paramName = block.getFieldValue('PARAM_NAME');
  return `// Param: ${paramName} = number\n`;
};

pythonGenerator.forBlock['meta_add_number_param'] = function (block) {
  return '';
};

// ══════════════════════════════════════════════════════════════════════════════
// 5. Get Parameter Value - 파라미터 값 가져오기
// ══════════════════════════════════════════════════════════════════════════════

Blockly.Blocks['meta_get_param'] = {
  init: function () {
    this.appendDummyInput()
      .appendField("get parameter")
      .appendField(new Blockly.FieldTextInput("KEY"), "PARAM_NAME");
    this.setOutput(true, null);
    this.setColour("#a78bfa");
    this.setTooltip("Get the value of a parameter");
  }
};

javascriptGenerator.forBlock['meta_get_param'] = function (block) {
  const paramName = block.getFieldValue('PARAM_NAME');
  return [`block.getFieldValue('${paramName}')`, javascriptGenerator.ORDER_FUNCTION_CALL];
};

pythonGenerator.forBlock['meta_get_param'] = function (block) {
  const paramName = block.getFieldValue('PARAM_NAME');
  return [`{${paramName}}`, pythonGenerator.ORDER_ATOMIC];
};

// ══════════════════════════════════════════════════════════════════════════════
// Toolbox Category
// ══════════════════════════════════════════════════════════════════════════════

export const blockBuilderToolboxCategory = {
  kind: "category",
  name: "🏗️ Block Builder",
  colour: "#7c3aed",
  contents: [
    { kind: "label", text: "Define Blocks" },
    { kind: "block", type: "meta_define_event_block" },
    { kind: "sep" },
    { kind: "label", text: "Add Parameters" },
    { kind: "block", type: "meta_add_dropdown_param" },
    { kind: "block", type: "meta_add_text_param" },
    { kind: "block", type: "meta_add_number_param" },
    { kind: "sep" },
    { kind: "label", text: "Use Parameters" },
    { kind: "block", type: "meta_get_param" }
  ]
};
