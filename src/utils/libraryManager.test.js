import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as Blockly from 'blockly/core';
import { javascriptGenerator } from 'blockly/javascript';
import { pythonGenerator } from 'blockly/python';
import {
  buildLibraryToolboxCategories,
  exportAsLibrary,
  getInstalledLibraries,
  getLibraryBlockForPython,
  installLibrary,
  restoreLibraries,
  uninstallLibrary,
} from './libraryManager';

const STORAGE_KEY = 'blockly-libraries';

let uniqueId = 0;
const nextId = (prefix) => `${prefix}_${Date.now()}_${uniqueId++}`;

const createStorage = () => {
  let store = {};
  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null;
    },
    setItem(key, value) {
      store[key] = String(value);
    },
    removeItem(key) {
      delete store[key];
    },
    clear() {
      store = {};
    },
  };
};

const cleanupBlockType = (blockType) => {
  delete Blockly.Blocks[blockType];
  delete javascriptGenerator.forBlock[blockType];
  delete pythonGenerator.forBlock[blockType];
};

describe('libraryManager', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createStorage(),
      configurable: true,
    });
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
    delete globalThis.localStorage;
  });

  it('installs a library, registers generators, and exposes reverse-pattern matching', () => {
    const blockType = nextId('unit_echo');
    const pkg = {
      name: nextId('pkg'),
      version: '1.2.3',
      description: 'unit test package',
      blocks: [
        {
          type: blockType,
          colour: '#123456',
          inputs: [
            {
              type: 'value',
              label: 'echo',
              fields: [
                { type: 'text', name: 'TEXT', default: 'hello' },
                { type: 'number', name: 'COUNT', default: 1 },
              ],
            },
          ],
        },
      ],
      generators: {
        js: {
          [blockType]: 'demo.echo({TEXT}, {COUNT})\n',
        },
        python: {
          [blockType]: 'demo.echo({TEXT}, {COUNT})\n',
        },
      },
      reversePatterns: [
        { python: 'demo.echo({TEXT}, {COUNT})', block: blockType },
      ],
    };

    installLibrary(pkg);

    expect(getInstalledLibraries()).toHaveLength(1);
    expect(Blockly.Blocks[blockType]).toBeDefined();

    const jsCode = javascriptGenerator.forBlock[blockType](
      {
        getFieldValue(name) {
          return { TEXT: 'hello', COUNT: '3' }[name];
        },
      },
      javascriptGenerator
    );
    const pyCode = pythonGenerator.forBlock[blockType](
      {
        getFieldValue(name) {
          return { TEXT: 'hello', COUNT: '3' }[name];
        },
      },
      pythonGenerator
    );

    expect(jsCode).toBe('demo.echo(hello, 3)\n');
    expect(pyCode).toBe('demo.echo(hello, 3)\n');

    expect(getLibraryBlockForPython('demo.echo(score + 1, 3)')).toEqual({
      type: blockType,
      fields: { TEXT: 'score + 1', COUNT: '3' },
    });

    const categories = buildLibraryToolboxCategories();
    expect(categories).toHaveLength(1);
    expect(categories[0].name).toBe(`📦 ${pkg.name}`);
    expect(categories[0].contents).toEqual([{ kind: 'block', type: blockType }]);

    cleanupBlockType(blockType);
  });

  it('restores previously installed libraries from localStorage', () => {
    const blockType = nextId('restore_block');
    const pkg = {
      name: nextId('restore_pkg'),
      version: '1.0.0',
      blocks: [
        {
          type: blockType,
          colour: '#654321',
          inputs: [{ kind: 'dummy', fields: [{ type: 'label', label: 'restore' }] }],
        },
      ],
      generators: {
        js: { [blockType]: 'return "restored-js\\n";' },
        python: { [blockType]: 'return "restored-py\\n";' },
      },
      reversePatterns: [{ python: 'restored.call()', block: blockType }],
    };

    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          name: pkg.name,
          version: pkg.version,
          description: '',
          author: '',
          installedAt: '2026-01-01T00:00:00.000Z',
          pkg,
        },
      ])
    );

    cleanupBlockType(blockType);

    const restored = restoreLibraries();

    expect(restored).toHaveLength(1);
    expect(restored[0].name).toBe(pkg.name);
    expect(Blockly.Blocks[blockType]).toBeDefined();
    expect(getLibraryBlockForPython('restored.call()')).toEqual({
      type: blockType,
      fields: {},
    });

    cleanupBlockType(blockType);
  });

  it('uninstallLibrary removes stored entries without touching unrelated ones', () => {
    const keep = { name: 'keep-me' };
    const remove = { name: 'remove-me' };

    localStorage.setItem(STORAGE_KEY, JSON.stringify([keep, remove]));

    uninstallLibrary(remove.name);

    expect(getInstalledLibraries()).toEqual([keep]);
  });

  it('exportAsLibrary serializes module/class blocks with workspace metadata', () => {
    const workspace = {
      getAllBlocks: vi.fn(() => [
        {
          type: 'class_define',
          getColour: () => '#111111',
          getTooltip: () => 'class tooltip',
        },
        {
          type: 'structure_module_def',
          getColour: () => '#222222',
          getTooltip: () => 'module tooltip',
        },
        {
          type: 'move_right',
          getColour: () => '#333333',
          getTooltip: () => 'ignored',
        },
      ]),
    };

    vi.spyOn(pythonGenerator, 'workspaceToCode').mockReturnValue('class Demo:\n    pass\n');

    const pkg = exportAsLibrary(workspace, {
      name: 'demo-lib',
      version: '9.9.9',
      description: 'exported lib',
      author: 'tester',
      colour: '#abcdef',
    });

    expect(pkg.name).toBe('demo-lib');
    expect(pkg.version).toBe('9.9.9');
    expect(pkg.pythonSource).toContain('class Demo');
    expect(pkg.blocks).toEqual([
      { type: 'class_define', colour: '#111111', tooltip: 'class tooltip', inputs: [] },
      { type: 'structure_module_def', colour: '#222222', tooltip: 'module tooltip', inputs: [] },
    ]);
    expect(pkg.toolboxCategory).toEqual({
      kind: 'category',
      name: '📦 demo-lib',
      colour: '#abcdef',
      contents: [
        { kind: 'block', type: 'class_define' },
        { kind: 'block', type: 'structure_module_def' },
      ],
    });
  });

  it('exportAsLibrary rejects workspaces without class or module blocks', () => {
    const workspace = {
      getAllBlocks: vi.fn(() => [{ type: 'move_right' }]),
    };

    expect(() => exportAsLibrary(workspace, { name: 'empty-lib' })).toThrow(
      'No class or module blocks found'
    );
  });
});
