import * as Blockly from 'blockly/core';
import { pythonGenerator } from 'blockly/python';

// 1. structure_module_def (Class container)
Blockly.Blocks['structure_module_def'] = {
    init: function () {
        this.appendDummyInput()
            .appendField("Module")
            .appendField(new Blockly.FieldTextInput("MyLibrary"), "NAME");
        this.appendStatementInput("CONTENT")
            .setCheck(null);
        this.setColour(230); // Purple/Blue for Structure
        this.setTooltip("Defines a library module (Python Class)");
        this.setHelpUrl("");
    }
};

pythonGenerator.forBlock['structure_module_def'] = function (block) {
    const name = block.getFieldValue('NAME');
    const branch = pythonGenerator.statementToCode(block, 'CONTENT') || '  pass\n';
    return `class ${name}:\n${branch}\n`;
};


// 2. structure_typed_function (Function with Types)
Blockly.Blocks['structure_typed_function'] = {
    init: function () {
        this.appendDummyInput()
            .appendField("def")
            .appendField(new Blockly.FieldTextInput("my_function"), "NAME")
            .appendField("(")
            // For MVP, we use mutable arguments via a basic text list or mutator.
            // A full mutator is complex, so for Phase 1 we will use a simplified 
            // "Args String" field which the transpiler can parse, 
            // OR specifically defined argument inputs if we want strictly blocks.
            // To strictly follow the "Visual Layer" plan, let's use a mutator-like approach 
            // or at least a field for now to store the signature. 
            // Better: Use a simple text field for args like "x: int, y: str" 
            // This is "Block-Friendly" because the LLM can generate this string easily 
            // and we avoid complex block mutators for now.
            .appendField(new Blockly.FieldTextInput("x: int"), "ARGS")
            .appendField(") ->")
            .appendField(new Blockly.FieldDropdown([
                ["None", "None"],
                ["int", "int"],
                ["float", "float"],
                ["str", "str"],
                ["bool", "bool"],
                ["list", "list"],
                ["dict", "dict"],
                ["Any", "Any"]
            ]), "RETURN_TYPE");

        this.appendStatementInput("STACK")
            .setCheck(null);

        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(290); // Green/Func color
        this.setTooltip("Defines a function with type hints");
        this.setHelpUrl("");
    }
};

pythonGenerator.forBlock['structure_typed_function'] = function (block) {
    const name = block.getFieldValue('NAME');
    const args = block.getFieldValue('ARGS');
    const returnType = block.getFieldValue('RETURN_TYPE');
    const branch = pythonGenerator.statementToCode(block, 'STACK') || '  pass\n';

    // Clean up args string to ensure safety?
    // For now, trust the input or the LLM.
    return `def ${name}(${args}) -> ${returnType}:\n${branch}\n`;
};


// 3. structure_return_typed (Return with Type Check Visual)
Blockly.Blocks['structure_return_typed'] = {
    init: function () {
        this.appendValueInput("VALUE")
            .setCheck(null) // Ideally check against function return type if possible
            .appendField("return");
        this.setPreviousStatement(true, null);
        // return is terminal, but in Blockly it often allows next connection. 
        // Standard blockly 'procedures_ifreturn' does not have next, but 'procedures_def' does?
        // Usually strict return blocks have no next connection.
        this.setNextStatement(false);
        this.setColour(290);
        this.setTooltip("Returns a value and ends the function");
        this.setHelpUrl("");
    }
};

pythonGenerator.forBlock['structure_return_typed'] = function (block) {
    const value = pythonGenerator.valueToCode(block, 'VALUE', pythonGenerator.ORDER_NONE) || 'None';
    return `return ${value}\n`;
};

// 4. structure_import (Import Library)
Blockly.Blocks['structure_import'] = {
    init: function () {
        this.appendDummyInput()
            .appendField("import")
            .appendField(new Blockly.FieldTextInput("time"), "LIBRARY");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(230);
        this.setTooltip("Imports a library");
        this.setHelpUrl("");
    }
};

pythonGenerator.forBlock['structure_import'] = function (block) {
    const library = block.getFieldValue('LIBRARY');
    return `import ${library}\n`;
};

// 5. structure_call (Generic Function Call)
Blockly.Blocks['structure_call'] = {
    init: function () {
        this.appendDummyInput()
            .appendField("call")
            .appendField(new Blockly.FieldTextInput("my_func"), "NAME");
        this.appendValueInput("ARG")
            .setCheck(null)
            .appendField("with");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setColour(290);
        this.setTooltip("Calls a custom function");
        this.setHelpUrl("");
    }
};

pythonGenerator.forBlock['structure_call'] = function (block) {
    const name = block.getFieldValue('NAME');
    const arg = pythonGenerator.valueToCode(block, 'ARG', pythonGenerator.ORDER_NONE) || '';
    return `${name}(${arg})\n`;
};

// --- JavaScript Generators (Stubs to prevent crashes) ---
import { javascriptGenerator } from 'blockly/javascript';

javascriptGenerator.forBlock['structure_module_def'] = function (block) {
    return '// Module definition (Python only)\n';
};

javascriptGenerator.forBlock['structure_typed_function'] = function (block) {
    return '// Typed function definition (Python only)\n';
};

javascriptGenerator.forBlock['structure_return_typed'] = function (block) {
    return '// Typed return (Python only)\n';
};

javascriptGenerator.forBlock['structure_import'] = function (block) {
    return '// import ' + block.getFieldValue('LIBRARY') + '\n';
};

javascriptGenerator.forBlock['structure_call'] = function (block) {
    return '// Call ' + block.getFieldValue('NAME') + '\n';
};
