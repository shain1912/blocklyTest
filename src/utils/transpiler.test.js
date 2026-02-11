import { describe, it, expect } from 'vitest';
import { pythonToBlockly } from './transpiler';

describe('Transpiler', () => {
    it('should parse a simple module with one function', () => {
        const code = `
class MathLib:
    def add(a: int, b: int) -> int:
        return 10
    `;

        const result = pythonToBlockly(code);
        const blocks = result.blocks.blocks;
        console.log(JSON.stringify(blocks, null, 2));

        expect(blocks).toHaveLength(1);
        const moduleBlock = blocks[0];

        // Check Module
        expect(moduleBlock.type).toBe('structure_module_def');
        expect(moduleBlock.fields.NAME).toBe('MathLib');

        // Check Function (inside CONTENT input)
        const funcBlock = moduleBlock.inputs.CONTENT.block;
        expect(funcBlock.type).toBe('structure_typed_function');
        expect(funcBlock.fields.NAME).toBe('add');
        expect(funcBlock.fields.ARGS).toBe('a: int, b: int');
        expect(funcBlock.fields.RETURN_TYPE).toBe('int');

        // Check Return (inside STACK input)
        const returnBlock = funcBlock.inputs.STACK.block;
        expect(returnBlock.type).toBe('structure_return_typed');
        // Check value (dummy number logic)
        expect(returnBlock.inputs.VALUE.block.fields.NUM).toBe("10");
    });

    it('should handle indentation', () => {
        const code = `
class Test:
    def a() -> void:
        pass
    def b() -> void:
        pass
    `;
        const result = pythonToBlockly(code);
        const params = result.blocks.blocks[0].inputs.CONTENT.block;

        // a() should be followed by b()
        expect(params.type).toBe('structure_typed_function');
        expect(params.fields.NAME).toBe('a');

        const nextBlock = params.next.block;
        expect(nextBlock.type).toBe('structure_typed_function');
        expect(nextBlock.fields.NAME).toBe('b');
    });
});
