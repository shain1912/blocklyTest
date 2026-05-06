import { describe, it, expect } from 'vitest';
import { pythonToAst, astToPython, astToBlockly, n } from './legacy/ast';

describe('AST Core', () => {

  describe('pythonToAst', () => {
    it('parses sprite.move(10) → SpriteCall', () => {
      const ast = pythonToAst('sprite.move(10)\n');
      expect(ast.kind).toBe('Program');
      expect(ast.body[0].kind).toBe('SpriteCall');
      expect(ast.body[0].method).toBe('move');
      expect(ast.body[0].args[0].v).toBe(10);
    });

    it('parses assignment x = 5', () => {
      const ast = pythonToAst('x = 5\n');
      expect(ast.body[0].kind).toBe('Assign');
      expect(ast.body[0].name).toBe('x');
      expect(ast.body[0].value.v).toBe(5);
    });

    it('parses augmented assignment x += 3', () => {
      const ast = pythonToAst('x += 3\n');
      expect(ast.body[0].kind).toBe('AugAssign');
      expect(ast.body[0].name).toBe('x');
      expect(ast.body[0].op).toBe('+=');
    });

    it('parses while True:', () => {
      const ast = pythonToAst('while True:\n    sprite.move(5)\n');
      expect(ast.body[0].kind).toBe('WhileTrue');
      expect(ast.body[0].body[0].kind).toBe('SpriteCall');
    });

    it('parses for i in range(n)', () => {
      const ast = pythonToAst('for i in range(10):\n    sprite.move(5)\n');
      expect(ast.body[0].kind).toBe('ForRange');
      expect(ast.body[0].n).toBe(10);
    });

    it('parses if/else', () => {
      const code = 'if x > 0:\n    sprite.move(10)\nelse:\n    sprite.move(-10)\n';
      const ast = pythonToAst(code);
      expect(ast.body[0].kind).toBe('IfStmt');
      expect(ast.body[0].body).toHaveLength(1);
      expect(ast.body[0].orelse).toHaveLength(1);
    });

    it('parses class definition', () => {
      const ast = pythonToAst('class MyLib:\n    def add(a, b) -> int:\n        return 10\n');
      expect(ast.body[0].kind).toBe('ClassDef');
      expect(ast.body[0].name).toBe('MyLib');
    });

    it('parses import statement', () => {
      const ast = pythonToAst('import time\n');
      expect(ast.body[0].kind).toBe('Import');
      expect(ast.body[0].module).toBe('time');
    });

    it('parses time.sleep → Wait', () => {
      const ast = pythonToAst('time.sleep(2)\n');
      expect(ast.body[0].kind).toBe('Wait');
      expect(ast.body[0].seconds).toBe(2);
    });
  });

  describe('astToPython', () => {
    it('generates sprite.move(10)', () => {
      const ast = n.Program([n.SpriteCall('move', [n.NumLit(10)])]);
      expect(astToPython(ast)).toContain('sprite.move(10)');
    });

    it('generates while True loop', () => {
      const ast = n.Program([n.WhileTrue([n.SpriteCall('say', [n.StrLit('hi')])])]);
      const py = astToPython(ast);
      expect(py).toContain('while True:');
      expect(py).toContain('sprite.say("hi")');
    });

    it('generates if/else', () => {
      const ast = n.Program([
        n.IfStmt(
          n.BinOp(n.VarRef('x'), '>', n.NumLit(0)),
          [n.SpriteCall('move', [n.NumLit(10)])],
          [n.SpriteCall('move', [n.NumLit(-10)])]
        )
      ]);
      const py = astToPython(ast);
      expect(py).toContain('if x > 0:');
      expect(py).toContain('else:');
    });

    it('generates for range loop', () => {
      const ast = n.Program([n.ForRange('i', 5, [n.Wait(1)])]);
      const py = astToPython(ast);
      expect(py).toContain('for i in range(5):');
      expect(py).toContain('time.sleep(1)');
    });
  });

  describe('astToBlockly', () => {
    it('converts SpriteCall move → move_right block', () => {
      const ast = n.Program([n.SpriteCall('move', [n.NumLit(10)])]);
      const result = astToBlockly(ast);
      expect(result.blocks.blocks[0].type).toBe('move_right');
      expect(result.blocks.blocks[0].fields.STEPS).toBe(10);
    });

    it('converts AugAssign → change_variable with VALUE field', () => {
      const ast = n.Program([n.AugAssign('score', '+=', n.NumLit(5))]);
      const result = astToBlockly(ast);
      expect(result.blocks.blocks[0].type).toBe('change_variable');
      expect(result.blocks.blocks[0].fields.VAR_NAME).toBe('score');
      expect(result.blocks.blocks[0].fields.VALUE).toBe('5');
    });

    it('converts WhileTrue → loop_forever block', () => {
      const ast = n.Program([
        n.WhileTrue([n.SpriteCall('move', [n.NumLit(5)])])
      ]);
      const result = astToBlockly(ast);
      expect(result.blocks.blocks[0].type).toBe('loop_forever');
      expect(result.blocks.blocks[0].inputs.DO.block.type).toBe('move_right');
    });

    it('converts IfStmt with orelse → if_else block', () => {
      const ast = n.Program([
        n.IfStmt(
          n.BinOp(n.VarRef('x'), '>', n.NumLit(0)),
          [n.SpriteCall('move', [n.NumLit(10)])],
          [n.SpriteCall('move', [n.NumLit(-10)])]
        )
      ]);
      const result = astToBlockly(ast);
      const b = result.blocks.blocks[0];
      expect(b.type).toBe('if_else');
      expect(b.inputs.DO.block.type).toBe('move_right');
      expect(b.inputs.ELSE.block.type).toBe('move_right');
    });

    it('wrapRunnable wraps top-level blocks in on_start', () => {
      const ast = n.Program([
        n.SpriteCall('move', [n.NumLit(10)]),
        n.Wait(1),
      ]);
      const result = astToBlockly(ast, { wrapRunnable: true });
      expect(result.blocks.blocks[0].type).toBe('on_start');
      // move_right and wait chained inside on_start
      const inner = result.blocks.blocks[0].inputs.DO.block;
      expect(inner.type).toBe('move_right');
      expect(inner.next.block.type).toBe('wait');
    });

    it('import time is dropped, only on_start remains', () => {
      const ast = n.Program([
        n.Import('time'),
        n.SpriteCall('move', [n.NumLit(10)]),
      ]);
      const result = astToBlockly(ast, { wrapRunnable: true });
      const types = result.blocks.blocks.map(b => b.type);
      expect(types).toContain('on_start');
      expect(types).not.toContain('structure_import');
      expect(result.blocks.blocks).toHaveLength(1);
    });

    it('import non-time stays as structure_import separate from on_start', () => {
      const ast = n.Program([
        n.Import('turtle'),
        n.SpriteCall('move', [n.NumLit(10)]),
      ]);
      const result = astToBlockly(ast, { wrapRunnable: true });
      const types = result.blocks.blocks.map(b => b.type);
      expect(types).toContain('on_start');
      expect(types).toContain('structure_import');
      expect(result.blocks.blocks).toHaveLength(2);
    });
  });

  describe('Python → AST → Python roundtrip', () => {
    it('sprite.move roundtrip', () => {
      const code = 'sprite.move(10)\n';
      const ast = pythonToAst(code);
      const out = astToPython(ast);
      expect(out.trim()).toContain('sprite.move(10)');
    });

    it('for loop roundtrip', () => {
      const code = 'for i in range(5):\n    sprite.move(10)\n';
      const ast = pythonToAst(code);
      const out = astToPython(ast);
      expect(out).toContain('for i in range(5):');
      expect(out).toContain('sprite.move(10)');
    });

    it('augmented assignment roundtrip', () => {
      const code = 'score += 5\n';
      const ast = pythonToAst(code);
      const out = astToPython(ast);
      expect(out.trim()).toContain('score += 5');
    });
  });
});
