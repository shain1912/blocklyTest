import { describe, expect, it } from 'vitest';
import { convertMetaBlockToLibrary } from './blockToLibrary';

const makeParamBlock = (type, fields, next = null) => ({
  type,
  getFieldValue(name) {
    return fields[name];
  },
  getNextBlock() {
    return next;
  },
});

const makeMetaBlock = ({ blockType, label, colour, parameters }) => ({
  type: 'meta_define_event_block',
  getFieldValue(name) {
    return {
      BLOCK_TYPE: blockType,
      LABEL: label,
      COLOUR: colour,
    }[name];
  },
  getInputTargetBlock(name) {
    if (name === 'PARAMETERS') return parameters || null;
    if (name === 'CODE') return null;
    return null;
  },
});

describe('blockToLibrary', () => {
  it('converts a meta event block into a block library package', () => {
    const textParam = makeParamBlock('meta_add_text_param', {
      PARAM_NAME: 'SPRITE',
      DEFAULT: 'cat',
    });
    const numberParam = makeParamBlock(
      'meta_add_number_param',
      {
        PARAM_NAME: 'SPEED',
        DEFAULT: '5',
      },
      textParam
    );
    const dropdownParam = makeParamBlock(
      'meta_add_dropdown_param',
      {
        PARAM_NAME: 'KEY',
        OPTIONS: 'Space, ArrowUp',
      },
      numberParam
    );

    const metaBlock = makeMetaBlock({
      blockType: 'event_jump_on_key',
      label: 'Jump On Key',
      colour: '#ff8800',
      parameters: dropdownParam,
    });
    const workspace = {
      getAllBlocks() {
        return [metaBlock];
      },
    };

    const pkg = convertMetaBlockToLibrary(workspace, {
      name: 'keyboard-events',
      version: '2.0.0',
      description: 'generated from meta blocks',
      author: 'tester',
      colour: '#ff8800',
    });

    expect(pkg.name).toBe('keyboard-events');
    expect(pkg.blocks).toHaveLength(1);
    expect(pkg.blocks[0]).toMatchObject({
      type: 'event_jump_on_key',
      colour: '#ff8800',
      tooltip: 'Custom event: Jump On Key',
      previousStatement: false,
      nextStatement: false,
    });
    expect(pkg.blocks[0].inputs[0]).toMatchObject({
      kind: 'dummy',
      fields: [
        { type: 'label', label: 'Jump On Key' },
        { type: 'dropdown', name: 'KEY', options: [['Space', 'Space'], ['ArrowUp', 'ArrowUp']] },
        { type: 'number', name: 'SPEED', default: '5' },
        { type: 'text_input', name: 'SPRITE', default: 'cat' },
      ],
    });
    expect(pkg.blocks[0].inputs[1]).toEqual({
      kind: 'statement',
      name: 'DO',
      label: '',
    });
    expect(pkg.toolboxCategory.contents).toEqual([{ kind: 'block', type: 'event_jump_on_key' }]);
  });

  it('produces executable JS/Python generator bodies for parameterized event blocks', () => {
    const param = makeParamBlock('meta_add_dropdown_param', {
      PARAM_NAME: 'KEY',
      OPTIONS: 'Space, ArrowLeft',
    });
    const metaBlock = makeMetaBlock({
      blockType: 'event_dash',
      label: 'Dash',
      colour: '#00aaee',
      parameters: param,
    });
    const workspace = {
      getAllBlocks() {
        return [metaBlock];
      },
    };

    const pkg = convertMetaBlockToLibrary(workspace, { name: 'events' });

    const jsGenerator = new Function('block', 'javascriptGenerator', pkg.generators.js.event_dash);
    const pyGenerator = new Function('block', 'pythonGenerator', pkg.generators.python.event_dash);

    const block = {
      getFieldValue(name) {
        return { KEY: 'ArrowLeft' }[name];
      },
    };

    const jsCode = jsGenerator(block, {
      statementToCode() {
        return '    window.player.dash();\n';
      },
    });
    const pyCode = pyGenerator(block, {
      statementToCode() {
        return '  sprite.move(10)\n';
      },
    });

    expect(jsCode).toContain("window.addEventListener('keydown'");
    expect(jsCode).toContain("e.code === 'ArrowLeft'");
    expect(jsCode).toContain('window.player.dash()');

    expect(pyCode).toContain('# Event: when ArrowLeft');
    expect(pyCode).toContain('def on_event_dash_ArrowLeft():');
    expect(pyCode).toContain('sprite.move(10)');
  });

  it('throws when no workspace or no meta blocks are available', () => {
    expect(() => convertMetaBlockToLibrary(null, {})).toThrow('No workspace');
    expect(() =>
      convertMetaBlockToLibrary(
        {
          getAllBlocks() {
            return [];
          },
        },
        {}
      )
    ).toThrow('No block definitions found. Use "📦 Define Event Block" to create blocks.');
  });
});
