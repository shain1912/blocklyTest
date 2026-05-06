import { describe, it, expect } from 'vitest';
import { pythonToBlockly } from './legacy/transpiler.js';

const run = (code) => pythonToBlockly(code, { wrapRunnable: true });

describe('Snippet transpiler smoke tests', () => {
  it('import time is ignored, while True stays as loop_forever', () => {
    const r = run('import time\nwhile True:\n    sprite.move(10)\n    sprite.if_on_edge_bounce()\n    time.sleep(0.05)\n');
    const types = r.blocks.blocks.map(b => b.type);
    // import time → no block; loop_forever is a hat-type, not wrapped in on_start
    expect(types).not.toContain('structure_import');
    expect(types).toContain('loop_forever');
  });

  it('class definition → structure_module_def', () => {
    const r = run('class Animal:\n    def speak(name) -> None:\n        sprite.say(name)\n    def walk(steps) -> None:\n        sprite.move(steps)\n        sprite.turn(90)\n');
    const types = r.blocks.blocks.map(b => b.type);
    expect(types).toContain('structure_module_def');
  });

  it('def (my block) + for loop', () => {
    const r = run('def draw_square(size) -> None:\n    for i in range(4):\n        sprite.move(size)\n        sprite.turn(90)\n\nfor i in range(3):\n    sprite.move(20)\n');
    const types = r.blocks.blocks.map(b => b.type);
    expect(types).toContain('on_start');
  });

  it('augassign + if/else chain', () => {
    const r = run('score = 0\nfor i in range(5):\n    score += 10\n    if score > 30:\n        sprite.say("WIN!")\n    else:\n        sprite.say(score)\n    time.sleep(0.5)\n');
    expect(r.blocks.blocks[0].type).toBe('on_start');
  });

  it('nested for + augassign', () => {
    const r = run('total = 0\nfor i in range(3):\n    for j in range(4):\n        sprite.move(20)\n        sprite.turn(90)\n        total += 1\n');
    expect(r.blocks.blocks[0].type).toBe('on_start');
  });

  it('import time + class: time import dropped, class and on_start remain', () => {
    const r = run('import time\n\nclass Mover:\n    def zigzag(dist) -> None:\n        sprite.move(dist)\n        sprite.turn(45)\n\nfor i in range(6):\n    sprite.move(30)\n    sprite.turn(60)\n    time.sleep(0.2)\n');
    const types = r.blocks.blocks.map(b => b.type);
    expect(types).not.toContain('structure_import');
    expect(types).toContain('structure_module_def');
    expect(types).toContain('on_start');
  });

  it('augassign counter with while + if', () => {
    const r = run('count = 0\nx = 10\nwhile True:\n    sprite.move(x)\n    sprite.if_on_edge_bounce()\n    count += 1\n    x += 2\n    if count > 20:\n        sprite.say("Done!")\n        count = 0\n        x = 10\n    time.sleep(0.1)\n');
    expect(r.blocks.blocks[0].type).toBe('on_start');
  });
});
