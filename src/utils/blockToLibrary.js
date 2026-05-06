/**
 * Block to Library Converter
 * meta_define_event_block → .blocklib.json
 */

import { javascriptGenerator } from 'blockly/javascript';
import { pythonGenerator } from 'blockly/python';

/**
 * Convert meta blocks to library definition
 */
export const convertMetaBlockToLibrary = (workspace, meta) => {
  if (!workspace) throw new Error('No workspace');

  const metaBlocks = workspace.getAllBlocks(false).filter(b =>
    b.type === 'meta_define_event_block'
  );

  if (metaBlocks.length === 0) {
    throw new Error('No block definitions found. Use "📦 Define Event Block" to create blocks.');
  }

  const blocks = [];
  const jsGenerators = {};
  const pyGenerators = {};

  metaBlocks.forEach(metaBlock => {
    const blockType = metaBlock.getFieldValue('BLOCK_TYPE');
    const label = metaBlock.getFieldValue('LABEL');
    const colour = metaBlock.getFieldValue('COLOUR');

    // Parse parameters
    const parameters = [];
    const paramBlock = metaBlock.getInputTargetBlock('PARAMETERS');
    let currentParam = paramBlock;

    while (currentParam) {
      if (currentParam.type === 'meta_add_dropdown_param') {
        const paramName = currentParam.getFieldValue('PARAM_NAME');
        const optionsStr = currentParam.getFieldValue('OPTIONS');
        const options = optionsStr.split(',').map(opt => {
          const trimmed = opt.trim();
          return [trimmed, trimmed];
        });

        parameters.push({
          type: 'dropdown',
          name: paramName,
          options: options
        });
      } else if (currentParam.type === 'meta_add_text_param') {
        const paramName = currentParam.getFieldValue('PARAM_NAME');
        const defaultVal = currentParam.getFieldValue('DEFAULT');

        parameters.push({
          type: 'text_input',
          name: paramName,
          default: defaultVal
        });
      } else if (currentParam.type === 'meta_add_number_param') {
        const paramName = currentParam.getFieldValue('PARAM_NAME');
        const defaultVal = currentParam.getFieldValue('DEFAULT');

        parameters.push({
          type: 'number',
          name: paramName,
          default: defaultVal
        });
      }

      currentParam = currentParam.getNextBlock();
    }

    // Build block definition
    const blockDef = {
      type: blockType,
      colour: colour,
      tooltip: `Custom event: ${label}`,
      previousStatement: false,
      nextStatement: false,
      inputs: [
        {
          kind: 'dummy',
          fields: [
            { type: 'label', label: label }
          ]
        }
      ]
    };

    // Add parameter fields
    parameters.forEach(param => {
      blockDef.inputs[0].fields.push({
        type: param.type,
        name: param.name,
        default: param.default,
        options: param.options
      });
    });

    // Add statement input for event code
    blockDef.inputs.push({
      kind: 'statement',
      name: 'DO',
      label: ''
    });

    blocks.push(blockDef);

    // Generate code generators
    const jsCode = generateJavaScriptGenerator(metaBlock, blockType, parameters);
    const pyCode = generatePythonGenerator(metaBlock, blockType, parameters);

    jsGenerators[blockType] = jsCode;
    pyGenerators[blockType] = pyCode;
  });

  return {
    name: meta.name || 'my-custom-blocks',
    version: meta.version || '1.0.0',
    description: meta.description || 'Custom blocks created with Block Builder',
    author: meta.author || '',
    colour: meta.colour || '#7c3aed',
    blocks: blocks,
    generators: {
      js: jsGenerators,
      python: pyGenerators
    },
    toolboxCategory: {
      kind: 'category',
      name: `📦 ${meta.name || 'my-custom-blocks'}`,
      colour: meta.colour || '#7c3aed',
      contents: blocks.map(b => ({ kind: 'block', type: b.type }))
    },
    createdAt: new Date().toISOString()
  };
};

/**
 * Generate JavaScript generator code
 */
function generateJavaScriptGenerator(metaBlock, blockType, parameters) {
  // Get the event code from the meta block
  const codeBlock = metaBlock.getInputTargetBlock('CODE');

  // Build generator function as string
  let generatorCode = '';

  // Extract parameter values
  parameters.forEach(param => {
    generatorCode += `const ${param.name} = block.getFieldValue('${param.name}');\n  `;
  });

  // Get statement code
  generatorCode += `const code = javascriptGenerator.statementToCode(block, 'DO');\n  `;

  // Build event listener wrapper
  if (parameters.length > 0) {
    const firstParam = parameters[0];
    generatorCode += `return \`// Event: ${blockType}\\n`;
    generatorCode += `window.addEventListener('keydown', async (e) => {\\n`;
    generatorCode += `  if (e.code === '\${${firstParam.name}}' || e.key === '\${${firstParam.name}}') {\\n`;
    generatorCode += `\${code}  }\\n`;
    generatorCode += `});\\n\`;\n`;
  } else {
    generatorCode += `return \`// Event: ${blockType}\\n\${code}\`;\n`;
  }

  return generatorCode;
}

/**
 * Generate Python generator code
 */
function generatePythonGenerator(metaBlock, blockType, parameters) {
  let generatorCode = '';

  // Extract parameter values
  parameters.forEach(param => {
    generatorCode += `const ${param.name} = block.getFieldValue('${param.name}');\n  `;
  });

  // Get statement code
  generatorCode += `const code = pythonGenerator.statementToCode(block, 'DO') || '  pass\\\\n';\n  `;

  // Build Python function
  if (parameters.length > 0) {
    const firstParam = parameters[0];
    generatorCode += `return \`# Event: when \${${firstParam.name}}\\n`;
    generatorCode += `def on_${blockType}_\${${firstParam.name}.replace(/[^a-zA-Z0-9]/g, '_')}():\\n\${code}\\n\`;\n`;
  } else {
    generatorCode += `return \`# Event: ${blockType}\\ndef on_${blockType}():\\n\${code}\\n\`;\n`;
  }

  return generatorCode;
}
