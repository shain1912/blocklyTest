/**
 * Block-Friendly Python Transpiler
 * 
 * Rules:
 * 1. Modules must start with `class ModuleName:`
 * 2. Functions must look like `def funcName(arg1: type, arg2: type) -> returnType:`
 * 3. Indentation is 4 spaces or 2 spaces (consistent).
 * 
 * This is a REGEX-based parser for the MVP. It relies on strict formatting.
 */

export const pythonToBlockly = (pythonCode) => {
    console.log("Transpiler Input:", pythonCode); // DEBUG
    const lines = pythonCode.split('\n');
    const variables = new Set(); // Track detected variables

    // Helper: Parse value string into a Block (Text, Number, or Variable)
    const parseValueInput = (val) => {
        val = val.trim();
        if (!val) return null;

        // String literal
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            return { kind: "block", type: "text", fields: { TEXT: val.slice(1, -1) } };
        }
        // Number literal
        if (!isNaN(val)) {
            return { kind: "block", type: "math_number", fields: { NUM: val } };
        }
        // Boolean literal
        if (val === 'True') return { kind: "block", type: "logic_boolean", fields: { BOOL: "TRUE" } };
        if (val === 'False') return { kind: "block", type: "logic_boolean", fields: { BOOL: "FALSE" } };

        // Variable identifier (Assume alphanumeric)
        if (/^[a-zA-Z_]\w*$/.test(val)) {
            variables.add(val);
            return {
                kind: "block",
                type: "variables_get",
                fields: { VAR: { name: val, id: "var_" + val } }
            };
        }
        // Fallback
        return { kind: "block", type: "text", fields: { TEXT: val } };
    };

    const blocks = [];
    const stack = []; // To track nesting (Modules, Functions)

    // Helper to create a block object
    const createBlock = (type, fields = {}, inputs = {}, next = null) => {
        return {
            kind: "block",
            type: type,
            fields: fields,
            inputs: inputs, // { "STACK": { block: ... } }
            next: next
        };
    };

    // We need to build a tree first, then convert to Blockly JSON
    // Because Blockly JSON is nested via "inputs" or "next"

    // Simplified Tree Builders
    let root = { type: 'root', children: [] };
    let currentParent = root;
    let indentStack = [0]; // Stack of indentation levels
    let expectingChild = false; // Logic to auto-detect indentation step

    lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return;

        // Calculate indent
        const indent = line.search(/\S/);

        // Handle Dynamic Indentation Expectation
        if (expectingChild) {
            if (indent > indentStack[indentStack.length - 1]) {
                // Child found, establish new indentation level
                indentStack.push(indent);
                expectingChild = false;
            } else {
                // Expected child but found sibling/parent -> Empty body
                // Close the pending parent
                expectingChild = false;
                currentParent = currentParent.parent;
            }
        }

        // Adjust parent based on indent (Pop scope)
        while (indent < indentStack[indentStack.length - 1]) {
            indentStack.pop();
            currentParent = currentParent.parent;
        }

        // Parsing Logic
        // 1. Module (Class)
        // class MyLibrary:
        const classMatch = trimmed.match(/^class\s+(\w+):/);
        if (classMatch) {
            const newNode = {
                type: 'structure_module_def',
                fields: { NAME: classMatch[1] },
                children: [],
                parent: currentParent
            };
            currentParent.children.push(newNode);
            currentParent = newNode;
            expectingChild = true; // Wait for next line to determine indent
            return;
        }

        // 2. Typed Function
        // def my_func(x: int, y: str) -> bool:
        const funcMatch = trimmed.match(/^def\s+(\w+)\((.*)\)\s*->\s*(\w+):/);
        if (funcMatch) {
            let rType = funcMatch[3];
            // Normalize Types for Dropdown
            const typeMap = {
                'void': 'None',
                'boolean': 'bool',
                'string': 'str',
                'number': 'float'
            };
            if (typeMap[rType]) rType = typeMap[rType];

            // Validate against known types
            const validTypes = ['None', 'int', 'float', 'str', 'bool', 'list', 'dict', 'Any'];
            if (!validTypes.includes(rType)) {
                rType = 'Any';
            }

            const newNode = {
                type: 'structure_typed_function',
                fields: {
                    NAME: funcMatch[1],
                    ARGS: funcMatch[2],
                    RETURN_TYPE: rType
                },
                children: [],
                parent: currentParent
            };
            currentParent.children.push(newNode);
            currentParent = newNode;
            expectingChild = true; // Wait for next line to determine indent
            return;
        }

        // 3. Return Statement
        // return value
        const returnMatch = trimmed.match(/^return\s+(.*)/);
        if (returnMatch) {
            // Return shouldn't have children usually, but we treat it as a step
            const newNode = {
                type: 'structure_return_typed',
                // For MVP, we pass the raw value code. 
                // Ideally we parse this too, but for now let's assume simple values or "math_number" logic later.
                // We'll use a shadow block or raw text for now.
                // Wait, structure_return_typed expects a VALUE input.
                // We can't easily parse "x + 5" without a full expression parser.
                // SHORTCUT: Just put a dummy comment block or try to find simple literals.
                inputs: {
                    VALUE: {
                        block: {
                            kind: "block",
                            type: "math_number",
                            fields: { NUM: 0 } // Dummy placeholder
                        }
                    }
                },
                children: [],
                parent: currentParent
            };
            // If the return value is a simple number, parse it
            const val = returnMatch[1].trim();
            if (!isNaN(val)) {
                newNode.inputs.VALUE.block.fields.NUM = val;
            }

            currentParent.children.push(newNode);
            return;
        }

        // 4. Standard Blocks Support

        // "say" block: sprite.say("Hello")
        const sayMatch = trimmed.match(/^sprite\.say\((.*)\)/);
        if (sayMatch) {
            const val = sayMatch[1].trim();
            const inputBlock = parseValueInput(val); // Uses variable_get if identifier

            const newNode = {
                type: 'say',
                fields: {},
                inputs: { TEXT: { block: inputBlock } },
                children: [],
                parent: currentParent
            };
            currentParent.children.push(newNode);
            return;
        }

        // "wait" block: time.sleep(1)
        const waitMatch = trimmed.match(/^time\.sleep\((.*)\)/);
        if (waitMatch) {
            // Block 'wait' uses FIELD "SECONDS" (Number)
            const sec = waitMatch[1].trim();
            const newNode = {
                type: 'wait',
                fields: { SECONDS: sec },
                children: [],
                parent: currentParent
            };
            currentParent.children.push(newNode);
            return;
        }

        // "print" block: print("msg")
        const printMatch = trimmed.match(/^print\((.*)\)/);
        if (printMatch) {
            // Block 'print' defined as FieldTextInput in customBlocks.js
            // Limitation: Cannot take variables yet.
            const val = printMatch[1].trim();
            const cleanVal = (val.startsWith('"') || val.startsWith("'")) ? val.slice(1, -1) : val;

            const newNode = {
                type: 'print',
                fields: { TEXT: cleanVal },
                children: [],
                parent: currentParent
            };
            currentParent.children.push(newNode);
            return;
        }

        // "import" block: import time
        const importMatch = trimmed.match(/^import\s+(\w+)/);
        if (importMatch) {
            const lib = importMatch[1];
            const newNode = {
                type: 'structure_import',
                fields: { LIBRARY: lib },
                children: [],
                parent: currentParent
            };
            currentParent.children.push(newNode);
            return;
        }

        // "variable" block: x = 10
        // simple assignment: name = val
        // Avoid matching "def =" etc.
        const assignMatch = trimmed.match(/^(\w+)\s*=\s*(.*)/);
        if (assignMatch) {
            // Block 'variable' uses FIELD "VAR_NAME" and FIELD "VALUE" (Text input)
            const varName = assignMatch[1];
            const val = assignMatch[2].trim();
            // Exclude if it looks like a function definition start (caught above?)
            // Matcher \w+ excludes '(' so 'func(' is safe.

            const newNode = {
                type: 'variable',
                fields: { VAR_NAME: varName, VALUE: val },
                children: [],
                parent: currentParent
            };
            currentParent.children.push(newNode);
            return;
        }

        // 7. Loops
        // "while" block
        const whileMatch = trimmed.match(/^while\s+(.*):/);
        if (whileMatch) {
            const condRaw = whileMatch[1].trim();
            const condBlock = parseValueInput(condRaw);

            const newNode = {
                type: 'controls_whileUntil',
                fields: { MODE: 'WHILE' },
                inputs: { BOOL: { block: condBlock } },
                children: [],
                parent: currentParent
            };
            currentParent.children.push(newNode);
            currentParent = newNode;
            expectingChild = true;
            return;
        }

        // "for" block (range): for i in range(10):
        const forRangeMatch = trimmed.match(/^for\s+(\w+)\s+in\s+range\((.*)\):/);
        if (forRangeMatch) {
            const varName = forRangeMatch[1];
            const rangeVal = forRangeMatch[2].trim();
            const limitBlock = parseValueInput(rangeVal);

            // Register loop variable
            variables.add(varName);

            // controls_for: FROM 0 TO n-1 (Python behavior). 
            // For MVP, passing 'n' as TO means 0..n (inclusive), so n+1 iterations.
            // Ideally we subtract 1. But for now exact passing is cleaner visually.
            const newNode = {
                type: 'controls_for',
                fields: { VAR: { name: varName, id: "var_" + varName } },
                inputs: {
                    FROM: { block: { kind: "block", type: "math_number", fields: { NUM: "0" } } },
                    TO: { block: limitBlock },
                    BY: { block: { kind: "block", type: "math_number", fields: { NUM: "1" } } }
                },
                children: [],
                parent: currentParent
            };
            currentParent.children.push(newNode);
            currentParent = newNode;
            expectingChild = true;
            return;
        }

        // 6. Control Flow
        // "if" block
        const ifMatch = trimmed.match(/^if\s+(.*):/);
        if (ifMatch) {
            const condRaw = ifMatch[1].trim();
            const condBlock = parseValueInput(condRaw);

            const newNode = {
                type: 'controls_if',
                fields: {},
                inputs: { IF0: { block: condBlock } },
                children: [],
                parent: currentParent
            };
            currentParent.children.push(newNode);

            // Prepare for body
            currentParent = newNode;
            expectingChild = true;
            return;
        }

        // "elif" block (Marker for post-processing)
        const elifMatch = trimmed.match(/^elif\s+(.*):/);
        if (elifMatch) {
            const condRaw = elifMatch[1].trim();
            const condBlock = parseValueInput(condRaw);

            const newNode = {
                type: 'custom_elif',
                fields: {},
                inputs: { IF_COND: { block: condBlock } },
                children: [],
                parent: currentParent
            };
            currentParent.children.push(newNode);
            currentParent = newNode;
            expectingChild = true;
            return;
        }

        // "else" block (Marker for post-processing)
        const elseMatch = trimmed.match(/^else:/);
        if (elseMatch) {
            const newNode = {
                type: 'custom_else',
                fields: {},
                children: [],
                parent: currentParent
            };
            currentParent.children.push(newNode);
            currentParent = newNode;
            expectingChild = true;
            return;
        }

        // Generic Function Call: foo(x)
        // Must come after specific calls (print, say) and assignments
        const callMatch = trimmed.match(/^(\w+)\((.*)\)/);
        if (callMatch) {
            const funcName = callMatch[1];
            const argRaw = callMatch[2].trim();

            const inputBlock = parseValueInput(argRaw);

            const newNode = {
                type: 'structure_call',
                fields: { NAME: funcName },
                inputs: inputBlock ? { ARG: { block: inputBlock } } : {},
                children: [],
                parent: currentParent
            };
            currentParent.children.push(newNode);
            return;
        }

        // 5. Pass (Ignore)
        if (trimmed === 'pass') return;

        // 5. Unknown/Other -> Comment
        const commentNode = {
            type: 'comment',
            fields: { TEXT: trimmed },
            children: [],
            parent: currentParent
        };
        currentParent.children.push(commentNode);

    });

    // Convert Tree to Blockly serialization format
    // Root children should be top-level blocks

    const treeToBlock = (node) => {
        if (node.type === 'comment') {
            return createBlock('comment', node.fields);
        }

        const block = createBlock(node.type, node.fields, node.inputs);

        let childInputName = null;
        if (node.type === 'structure_module_def') childInputName = 'CONTENT';
        if (node.type === 'structure_typed_function') childInputName = 'STACK';
        if (node.type === 'controls_if') childInputName = 'DO0';
        if (node.type === 'custom_elif') childInputName = 'BODY';
        if (node.type === 'custom_else') childInputName = 'BODY';
        if (node.type === 'controls_whileUntil') childInputName = 'DO';
        if (node.type === 'controls_for') childInputName = 'DO';

        if (childInputName && node.children.length > 0) {
            const firstChild = treeToBlock(node.children[0]);
            let currentBlock = firstChild;
            for (let i = 1; i < node.children.length; i++) {
                const nextBlock = treeToBlock(node.children[i]);
                currentBlock.next = { block: nextBlock };
                currentBlock = nextBlock;
            }
            block.inputs[childInputName] = { block: firstChild };
        }
        return block;
    };

    const codeBlocks = [];
    let lastBlock = null;

    // Helper to check if a block type starts a new stack (breaks chain)
    // module_def cannot have previous blocks (it's a container/wrapper usually)
    const isSeparatingBlock = (type) => {
        return type === 'structure_module_def' || type === 'structure_typed_function';
    };

    root.children.forEach(child => {
        const block = treeToBlock(child);

        // --- Merge Logic for Elif/Else ---
        if (block.type === 'custom_elif' || block.type === 'custom_else') {
            if (lastBlock && lastBlock.type === 'controls_if') {
                lastBlock.extraState = lastBlock.extraState || { elseIfCount: 0, hasElse: false };

                if (block.type === 'custom_elif') {
                    const count = lastBlock.extraState.elseIfCount;
                    lastBlock.extraState.elseIfCount++;
                    // Note: standard blockly if/elseif inputs match IF1, DO1..
                    lastBlock.inputs[`IF${count + 1}`] = block.inputs.IF_COND;
                    lastBlock.inputs[`DO${count + 1}`] = block.inputs.BODY;
                } else if (block.type === 'custom_else') {
                    lastBlock.extraState.hasElse = true;
                    lastBlock.inputs['ELSE'] = block.inputs.BODY;
                }
            }
            return;
        }

        // Logic:
        // 1. If this block is a Separator (Class), it starts a new stack.
        // 2. If the previous block was a Separator (Class), it couldn't take a next, so we start new stack.
        // 3. If no previous block, start new stack.

        const shouldStartNewStack =
            isSeparatingBlock(block.type) ||
            !lastBlock ||
            isSeparatingBlock(lastBlock.type);

        if (shouldStartNewStack) {
            codeBlocks.push(block);
            lastBlock = block;
        } else {
            // Link to previous block's 'next' connection
            lastBlock.next = { block: block };
            lastBlock = block;
        }
    });

    // Auto-Layout: Prevent overlapping
    let currentY = 50;
    codeBlocks.forEach(block => {
        block.x = 50;
        block.y = currentY;
        // Increment Y for next stack
        // Estimate height? Class blocks are tall.
        // Simple fixed large spacing for now.
        currentY += 400;
    });

    return {
        blocks: {
            blocks: codeBlocks
        },
        variables: Array.from(variables).map(name => ({
            name: name,
            id: "var_" + name
        }))
    };
};
