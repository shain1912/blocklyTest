import { describe, it, expect } from 'vitest';
import { pythonToBlockly } from './legacy/transpiler';

describe('Transpiler', () => {

    // ── Structure blocks ──────────────────────────────────────────────────

    it('should parse a simple module with one function', () => {
        const code = `
class MathLib:
    def add(a: int, b: int) -> int:
        return 10
    `;
        const result = pythonToBlockly(code);
        const blocks = result.blocks.blocks;

        expect(blocks).toHaveLength(1);
        const moduleBlock = blocks[0];
        expect(moduleBlock.type).toBe('structure_module_def');
        expect(moduleBlock.fields.NAME).toBe('MathLib');

        const funcBlock = moduleBlock.inputs.CONTENT.block;
        expect(funcBlock.type).toBe('structure_typed_function');
        expect(funcBlock.fields.NAME).toBe('add');
        expect(funcBlock.fields.ARGS).toBe('a: int, b: int');
        expect(funcBlock.fields.RETURN_TYPE).toBe('int');

        const returnBlock = funcBlock.inputs.STACK.block;
        expect(returnBlock.type).toBe('structure_return_typed');
        expect(returnBlock.inputs.VALUE.block.fields.NUM).toBe('10');
    });

    it('should handle multiple sibling functions inside a module', () => {
        const code = `
class Test:
    def a() -> void:
        pass
    def b() -> void:
        pass
    `;
        const result = pythonToBlockly(code);
        const firstFunc = result.blocks.blocks[0].inputs.CONTENT.block;

        expect(firstFunc.type).toBe('structure_typed_function');
        expect(firstFunc.fields.NAME).toBe('a');

        const nextBlock = firstFunc.next.block;
        expect(nextBlock.type).toBe('structure_typed_function');
        expect(nextBlock.fields.NAME).toBe('b');
    });

    // ── Motion blocks ─────────────────────────────────────────────────────

    it('should parse sprite.move(n) → move_right block', () => {
        const result = pythonToBlockly('sprite.move(10)\n');
        const block = result.blocks.blocks[0];
        expect(block.type).toBe('move_right');
        expect(block.fields.STEPS).toBe('10');
    });

    it('should parse sprite.turn(positive) → turn_right block', () => {
        const result = pythonToBlockly('sprite.turn(15)\n');
        const block = result.blocks.blocks[0];
        expect(block.type).toBe('turn_right');
        expect(block.fields.DIRECTION).toBe('right');
        expect(block.fields.DEGREES).toBe('15');
    });

    it('should parse sprite.turn(negative) → turn_right block with DIRECTION:left', () => {
        const result = pythonToBlockly('sprite.turn(-15)\n');
        const block = result.blocks.blocks[0];
        expect(block.type).toBe('turn_right');
        expect(block.fields.DIRECTION).toBe('left');
        expect(block.fields.DEGREES).toBe('15');
    });

    it('should parse sprite.set_x / set_y', () => {
        const result = pythonToBlockly('sprite.set_x(100)\nsprite.set_y(-50)\n');
        const blocks = result.blocks.blocks;
        expect(blocks[0].type).toBe('set_x');
        expect(blocks[0].fields.X).toBe('100');
        expect(blocks[0].next.block.type).toBe('set_y');
        expect(blocks[0].next.block.fields.Y).toBe('-50');
    });

    it('should parse sprite.change_x / change_y', () => {
        const result = pythonToBlockly('sprite.change_x(10)\nsprite.change_y(-5)\n');
        const b = result.blocks.blocks[0];
        expect(b.type).toBe('change_x');
        expect(b.fields.DX).toBe('10');
        expect(b.next.block.type).toBe('change_y');
        expect(b.next.block.fields.DY).toBe('-5');
    });

    it('should parse sprite.goto(x, y)', () => {
        const result = pythonToBlockly('sprite.goto(50, -30)\n');
        const b = result.blocks.blocks[0];
        expect(b.type).toBe('go_to_position');
        expect(b.fields.X).toBe('50');
        expect(b.fields.Y).toBe('-30');
    });

    it('should parse sprite.if_on_edge_bounce()', () => {
        const result = pythonToBlockly('sprite.if_on_edge_bounce()\n');
        expect(result.blocks.blocks[0].type).toBe('if_on_edge_bounce');
    });

    // ── Looks blocks ──────────────────────────────────────────────────────

    it('should parse sprite.say("Hello") → say block', () => {
        const result = pythonToBlockly('sprite.say("Hello")\n');
        const b = result.blocks.blocks[0];
        expect(b.type).toBe('say');
        expect(b.inputs.TEXT.block.fields.TEXT).toBe('Hello');
    });

    it('should parse sprite.say(text, 2) → say_for_seconds block', () => {
        const result = pythonToBlockly('sprite.say("Hi", 2)\n');
        const b = result.blocks.blocks[0];
        expect(b.type).toBe('say_for_seconds');
        expect(b.fields.SECONDS).toBe('2');
    });

    it('should parse sprite.show() and sprite.hide()', () => {
        const result = pythonToBlockly('sprite.show()\nsprite.hide()\n');
        expect(result.blocks.blocks[0].type).toBe('show');
        expect(result.blocks.blocks[0].next.block.type).toBe('hide');
    });

    // ── Control flow ──────────────────────────────────────────────────────

    it('should parse time.sleep(n) → wait block', () => {
        const result = pythonToBlockly('time.sleep(2)\n');
        const b = result.blocks.blocks[0];
        expect(b.type).toBe('wait');
        expect(b.fields.SECONDS).toBe('2');
    });

    it('should parse while True: → loop_forever block', () => {
        const result = pythonToBlockly('while True:\n    sprite.move(10)\n');
        const b = result.blocks.blocks[0];
        expect(b.type).toBe('loop_forever');
        expect(b.inputs.DO.block.type).toBe('move_right');
    });

    it('should parse for i in range(n): → repeat block', () => {
        const result = pythonToBlockly('for i in range(10):\n    sprite.move(5)\n');
        const b = result.blocks.blocks[0];
        expect(b.type).toBe('repeat');
        expect(b.fields.TIMES).toBe('10');
        expect(b.inputs.DO.block.type).toBe('move_right');
    });

    it('should parse if condition: → if block', () => {
        const result = pythonToBlockly('if x > 0:\n    sprite.move(10)\n');
        const b = result.blocks.blocks[0];
        expect(b.type).toBe('if');
        expect(b.fields.CONDITION).toBe('x > 0');
        expect(b.inputs.DO.block.type).toBe('move_right');
    });

    // ── Variable blocks ───────────────────────────────────────────────────

    it('should parse x = 5 → variable block', () => {
        const result = pythonToBlockly('x = 5\n');
        const b = result.blocks.blocks[0];
        expect(b.type).toBe('variable');
        expect(b.fields.VAR_NAME).toBe('x');
        expect(b.fields.VALUE).toBe('5');
    });

    it('should parse x += 3 → change_variable block', () => {
        const result = pythonToBlockly('x += 3\n');
        const b = result.blocks.blocks[0];
        expect(b.type).toBe('change_variable');
        expect(b.fields.VAR_NAME).toBe('x');
        expect(b.fields.VALUE).toBe('3');
    });

    // ── Print ─────────────────────────────────────────────────────────────

    it('should parse print("Hello") → print block', () => {
        const result = pythonToBlockly('print("Hello")\n');
        const b = result.blocks.blocks[0];
        expect(b.type).toBe('print');
        expect(b.fields.TEXT).toBe('Hello');
    });

    // ── Chaining blocks ───────────────────────────────────────────────────

    it('should chain multiple top-level statements via next', () => {
        const code = `sprite.move(10)\nsprite.turn(15)\ntime.sleep(1)\n`;
        const result = pythonToBlockly(code);
        const b0 = result.blocks.blocks[0];
        expect(b0.type).toBe('move_right');
        expect(b0.next.block.type).toBe('turn_right');
        expect(b0.next.block.next.block.type).toBe('wait');
    });

    // ── Import ────────────────────────────────────────────────────────────

    it('import time is silently ignored (no block created)', () => {
        const result = pythonToBlockly('import time\n');
        expect(result.blocks.blocks).toHaveLength(0);
    });

    it('import other libs → structure_import block', () => {
        const result = pythonToBlockly('import turtle\n');
        expect(result.blocks.blocks[0].type).toBe('structure_import');
        expect(result.blocks.blocks[0].fields.LIBRARY).toBe('turtle');
    });

    // ── Roundtrip critical fixes ──────────────────────────────────────────

    it('change_variable: field should be VALUE not CHANGE (roundtrip fix)', () => {
        const result = pythonToBlockly('x += 3\n');
        const b = result.blocks.blocks[0];
        expect(b.type).toBe('change_variable');
        expect(b.fields.VAR_NAME).toBe('x');
        expect(b.fields.VALUE).toBe('3');
        expect(b.fields.CHANGE).toBeUndefined();
    });

    it('turn_right with left direction (no turn_left block exists)', () => {
        const result = pythonToBlockly('sprite.turn(-30)\n');
        const b = result.blocks.blocks[0];
        expect(b.type).toBe('turn_right');
        expect(b.fields.DIRECTION).toBe('left');
        expect(b.fields.DEGREES).toBe('30');
    });

    it('say with comma inside string should not split incorrectly', () => {
        const result = pythonToBlockly('sprite.say("Hello, World")\n');
        const b = result.blocks.blocks[0];
        expect(b.type).toBe('say');
        expect(b.inputs.TEXT.block.fields.TEXT).toBe('Hello, World');
    });

    it('say_for_seconds with comma-containing string and seconds arg', () => {
        const result = pythonToBlockly('sprite.say("Hi, friend", 3)\n');
        const b = result.blocks.blocks[0];
        expect(b.type).toBe('say_for_seconds');
        expect(b.inputs.TEXT.block.fields.TEXT).toBe('Hi, friend');
        expect(b.fields.SECONDS).toBe('3');
    });

    // ── Newly added patterns ──────────────────────────────────────────────

    it('should parse sprite.change_size(n) → change_size block', () => {
        const result = pythonToBlockly('sprite.change_size(10)\n');
        const b = result.blocks.blocks[0];
        expect(b.type).toBe('change_size');
        expect(b.fields.AMOUNT).toBe('10');
    });

    it('should parse sprite.set_volume(n) → set_volume block', () => {
        const result = pythonToBlockly('sprite.set_volume(80)\n');
        const b = result.blocks.blocks[0];
        expect(b.type).toBe('set_volume');
        expect(b.fields.VOLUME).toBe('80');
    });

    it('should parse sprite.change_volume(n) → change_volume block', () => {
        const result = pythonToBlockly('sprite.change_volume(-10)\n');
        const b = result.blocks.blocks[0];
        expect(b.type).toBe('change_volume');
        expect(b.fields.AMOUNT).toBe('-10');
    });

    it('should parse stage.switch_backdrop(name) → switch_backdrop block', () => {
        const result = pythonToBlockly('stage.switch_backdrop("space")\n');
        const b = result.blocks.blocks[0];
        expect(b.type).toBe('switch_backdrop');
        expect(b.fields.BACKDROP).toBe('space');
    });

    // ── wrapRunnable option ───────────────────────────────────────────────

    it('wrapRunnable: wraps top-level runnable blocks in on_start', () => {
        const result = pythonToBlockly('sprite.move(10)\nsprite.say("Hi")\n', { wrapRunnable: true });
        expect(result.blocks.blocks).toHaveLength(1);
        const onStart = result.blocks.blocks[0];
        expect(onStart.type).toBe('on_start');
        expect(onStart.inputs.DO.block.type).toBe('move_right');
        // say should be chained via next
        expect(onStart.inputs.DO.block.next.block.type).toBe('say');
    });

    it('wrapRunnable: import time is ignored, move wrapped in on_start', () => {
        const result = pythonToBlockly('import time\nsprite.move(10)\n', { wrapRunnable: true });
        // import time → silently dropped, move → wrapped in on_start
        expect(result.blocks.blocks).toHaveLength(1);
        expect(result.blocks.blocks[0].type).toBe('on_start');
    });

    it('wrapRunnable: non-time import stays as structural block', () => {
        const result = pythonToBlockly('import turtle\nsprite.move(10)\n', { wrapRunnable: true });
        const types = result.blocks.blocks.map(b => b.type);
        expect(types).toContain('on_start');
        expect(types).toContain('structure_import');
    });

    it('wrapRunnable: false (default) leaves blocks as standalone', () => {
        const result = pythonToBlockly('sprite.move(10)\n');
        expect(result.blocks.blocks[0].type).toBe('move_right');
    });

    // ── if_else roundtrip ─────────────────────────────────────────────────

    it('should parse if/else → if_else block', () => {
        const code = `if x > 0:\n    sprite.move(10)\nelse:\n    sprite.move(-10)\n`;
        const result = pythonToBlockly(code);
        const b = result.blocks.blocks[0];
        expect(b.type).toBe('if_else');
        expect(b.fields.CONDITION).toBe('x > 0');
        expect(b.inputs.DO.block.type).toBe('move_right');
        expect(b.inputs.ELSE.block.type).toBe('move_right');
    });
});
