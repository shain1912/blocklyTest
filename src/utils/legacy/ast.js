/**
 * Common AST (Abstract Syntax Tree) - Shared IR for Block ↔ Python conversion
 *
 * Design:
 *   Block → blockToAst()  → AST  → astToPython()  → Python
 *   Python → pythonToAst() → AST  → astToBlockly() → Blockly JSON
 *
 * The AST is the canonical representation, making the roundtrip formally
 * well-defined and extensible to new block/Python constructs.
 *
 * Turing-completeness: the AST covers variables, control flow, functions,
 * classes, recursion, and arbitrary I/O via library blocks — sufficient
 * to express any computable function.
 */

// ── Node constructors ─────────────────────────────────────────────────────────

export const n = {
  Program:       (body)               => ({ kind: 'Program', body }),
  Import:        (module)             => ({ kind: 'Import', module }),
  ClassDef:      (name, bases, body)  => ({ kind: 'ClassDef', name, bases, body }),
  FunctionDef:   (name, args, returns, body) => ({ kind: 'FunctionDef', name, args, returns, body }),
  MethodDef:     (name, args, returns, body) => ({ kind: 'MethodDef', name, args, returns, body }),
  Return:        (value)              => ({ kind: 'Return', value }),
  IfStmt:        (test, body, orelse) => ({ kind: 'IfStmt', test, body, orelse }),
  WhileTrue:     (body)               => ({ kind: 'WhileTrue', body }),
  WhileUntil:    (test, body)         => ({ kind: 'WhileUntil', test, body }),
  ForRange:      (target, n, body)    => ({ kind: 'ForRange', target, n, body }),
  Assign:        (name, value)        => ({ kind: 'Assign', name, value }),
  AugAssign:     (name, op, value)    => ({ kind: 'AugAssign', name, op, value }),
  Wait:          (seconds)            => ({ kind: 'Wait', seconds }),
  SpriteCall:    (method, args)       => ({ kind: 'SpriteCall', method, args }),
  StageCall:     (method, args)       => ({ kind: 'StageCall', method, args }),
  FunctionCall:  (name, args)         => ({ kind: 'FunctionCall', name, args }),
  MethodCall:    (obj, method, args)  => ({ kind: 'MethodCall', obj, method, args }),
  Construct:     (varName, cls, args) => ({ kind: 'Construct', varName, cls, args }),
  PropertySet:   (obj, attr, value)   => ({ kind: 'PropertySet', obj, attr, value }),
  Print:         (text)               => ({ kind: 'Print', text }),
  Comment:       (text)               => ({ kind: 'Comment', text }),

  // Expressions
  NumLit:  (v)      => ({ kind: 'NumLit', v }),
  StrLit:  (v)      => ({ kind: 'StrLit', v }),
  BoolLit: (v)      => ({ kind: 'BoolLit', v }),
  VarRef:  (name)   => ({ kind: 'VarRef', name }),
  BinOp:   (l, op, r) => ({ kind: 'BinOp', l, op, r }),
  UnaryOp: (op, v)  => ({ kind: 'UnaryOp', op, v }),
  AttrGet: (obj, attr) => ({ kind: 'AttrGet', obj, attr }),
};

// ── Python code → AST ─────────────────────────────────────────────────────────

export const pythonToAst = (pythonCode) => {
  const lines = pythonCode.split('\n');
  const body = [];

  // Build a simple indent-based parse tree
  const parseBody = (startLine, baseIndent) => {
    const stmts = [];
    let i = startLine;

    while (i < lines.length) {
      const raw = lines[i];
      const trimmed = raw.trim();
      if (!trimmed || trimmed.startsWith('#')) { i++; continue; }

      const indent = raw.search(/\S/);
      if (indent < baseIndent) break;
      if (indent > baseIndent) { i++; continue; }

      // Try to match each statement type
      const stmt = parseLine(trimmed);
      if (stmt === null) { i++; continue; }

      if (stmt._needsBody) {
        // Parse indented body
        const bodyResult = parseBody(i + 1, indent + 4);
        stmt.body = bodyResult.nodes;
        i = bodyResult.nextLine;
        // Handle else/elif
        if (stmt.kind === 'IfStmt') {
          const elseResult = parseElse(i, indent, lines);
          if (elseResult) {
            stmt.orelse = elseResult.nodes;
            i = elseResult.nextLine;
          }
        }
        delete stmt._needsBody;
      } else {
        i++;
      }
      stmts.push(stmt);
    }
    return { nodes: stmts, nextLine: i };
  };

  const parseElse = (startLine, baseIndent, lines) => {
    let i = startLine;
    while (i < lines.length) {
      const raw = lines[i];
      const trimmed = raw.trim();
      if (!trimmed) { i++; continue; }
      const indent = raw.search(/\S/);
      if (indent !== baseIndent) return null;
      if (trimmed === 'else:') {
        const bodyResult = parseBody(i + 1, baseIndent + 4);
        return { nodes: bodyResult.nodes, nextLine: bodyResult.nextLine };
      }
      if (trimmed.match(/^elif\s/)) {
        const stmt = parseLine(trimmed);
        if (stmt && stmt._needsBody) {
          const bodyResult = parseBody(i + 1, baseIndent + 4);
          stmt.body = bodyResult.nodes;
          delete stmt._needsBody;
          i = bodyResult.nextLine;
          const elseResult = parseElse(i, baseIndent, lines);
          if (elseResult) stmt.orelse = elseResult.nodes;
          else stmt.orelse = [];
          return { nodes: [stmt], nextLine: i };
        }
      }
      return null;
    }
    return null;
  };

  const parseLine = (trimmed) => {
    // import
    const importM = trimmed.match(/^import\s+(\w+)/);
    if (importM) return n.Import(importM[1]);

    // class
    const classM = trimmed.match(/^class\s+(\w+)(?:\((\w*)\))?:/);
    if (classM) return { ...n.ClassDef(classM[1], classM[2] ? [classM[2]] : [], []), _needsBody: true };

    // def with return type
    const funcM = trimmed.match(/^def\s+(\w+)\((.*)\)\s*->\s*(\w+):/);
    if (funcM) return { ...n.FunctionDef(funcM[1], funcM[2], funcM[3], []), _needsBody: true };

    // def without return type
    const funcM2 = trimmed.match(/^def\s+(\w+)\((.*)\):/);
    if (funcM2) return { ...n.FunctionDef(funcM2[1], funcM2[2], 'None', []), _needsBody: true };

    // return
    const retM = trimmed.match(/^return\s+(.*)/);
    if (retM) return n.Return(parseExpr(retM[1]));

    // while True
    if (trimmed === 'while True:') return { ...n.WhileTrue([]), _needsBody: true };

    // while not(...)
    const wUntilM = trimmed.match(/^while not\((.*)\):/);
    if (wUntilM) return { ...n.WhileUntil(parseExpr(wUntilM[1]), []), _needsBody: true };

    // while ...
    const whileM = trimmed.match(/^while\s+(.+):/);
    if (whileM) return { ...n.WhileUntil(parseExpr(whileM[1]), []), _needsBody: true };

    // for i in range(n)
    const forM = trimmed.match(/^for\s+(\w+)\s+in\s+range\((\d+)\):/);
    if (forM) return { ...n.ForRange(forM[1], parseInt(forM[2]), []), _needsBody: true };

    // if ...
    const ifM = trimmed.match(/^if\s+(.+):/);
    if (ifM) return { ...n.IfStmt(parseExpr(ifM[1]), [], []), _needsBody: true };

    // x += val
    const augM = trimmed.match(/^(\w+)\s*\+=\s*(.*)/);
    if (augM) return n.AugAssign(augM[1], '+=', parseExpr(augM[2].trim()));

    // time.sleep
    const sleepM = trimmed.match(/^time\.sleep\(([\d.]+)\)/);
    if (sleepM) return n.Wait(parseFloat(sleepM[1]));

    // print
    const printM = trimmed.match(/^print\((.*)\)/);
    if (printM) return n.Print(parseExpr(printM[1]));

    // sprite.*
    const spriteM = trimmed.match(/^sprite\.(\w+)\((.*)\)/);
    if (spriteM) {
      const args = splitArgs(spriteM[2]).map(parseExpr);
      return n.SpriteCall(spriteM[1], args);
    }

    // stage.*
    const stageM = trimmed.match(/^stage\.(\w+)\((.*)\)/);
    if (stageM) {
      const args = splitArgs(stageM[2]).map(parseExpr);
      return n.StageCall(stageM[1], args);
    }

    // var = ClassName(args)
    const ctorM = trimmed.match(/^(\w+)\s*=\s*([A-Z]\w*)\((.*)\)/);
    if (ctorM) return n.Construct(ctorM[1], ctorM[2], splitArgs(ctorM[3]).map(parseExpr));

    // obj.attr = value
    const propM = trimmed.match(/^(\w+)\.(\w+)\s*=\s*(.*)/);
    if (propM && !trimmed.includes('(')) return n.PropertySet(propM[1], propM[2], parseExpr(propM[3]));

    // obj.method(args)
    const methM = trimmed.match(/^(\w+)\.(\w+)\((.*)\)/);
    if (methM) {
      const args = splitArgs(methM[3]).map(parseExpr);
      return n.MethodCall(methM[1], methM[2], args);
    }

    // funcName(args)
    const callM = trimmed.match(/^(\w+)\((.*)\)/);
    if (callM) {
      const args = splitArgs(callM[2]).map(parseExpr);
      return n.FunctionCall(callM[1], args);
    }

    // x = val
    const assignM = trimmed.match(/^(\w+)\s*=\s*(.*)/);
    if (assignM) return n.Assign(assignM[1], parseExpr(assignM[2].trim()));

    if (trimmed === 'pass') return null;

    return n.Comment(trimmed);
  };

  const parseExpr = (s) => {
    if (!s || !s.trim()) return n.NumLit(0);
    s = s.trim();
    if (!isNaN(s)) return n.NumLit(parseFloat(s));
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return n.StrLit(s.slice(1, -1));
    }
    if (s === 'True') return n.BoolLit(true);
    if (s === 'False') return n.BoolLit(false);
    if (/^[a-zA-Z_]\w*$/.test(s)) return n.VarRef(s);
    // Simple binary ops
    const binM = s.match(/^(.*?)\s*(==|!=|<=|>=|<|>|\+|-|\*|\/|%|and|or)\s*(.*)/);
    if (binM) return n.BinOp(parseExpr(binM[1]), binM[2], parseExpr(binM[3]));
    if (s.startsWith('not ')) return n.UnaryOp('not', parseExpr(s.slice(4)));
    return n.StrLit(s); // fallback: treat unknown as string
  };

  const result = parseBody(0, 0);
  return n.Program(result.nodes);
};

// ── AST → Python code ─────────────────────────────────────────────────────────

export const astToPython = (ast, indent = 0) => {
  const pad = '    '.repeat(indent);
  const lines = [];

  const genExpr = (node) => {
    if (!node) return '0';
    switch (node.kind) {
      case 'NumLit': return String(node.v);
      case 'StrLit': return `"${node.v}"`;
      case 'BoolLit': return node.v ? 'True' : 'False';
      case 'VarRef': return node.name;
      case 'BinOp': return `${genExpr(node.l)} ${node.op} ${genExpr(node.r)}`;
      case 'UnaryOp': return `${node.op} ${genExpr(node.v)}`;
      case 'AttrGet': return `${node.obj}.${node.attr}`;
      default: return String(node.v || node.name || '');
    }
  };

  const genBody = (body, ind) => body.flatMap(s => genStmt(s, ind));

  const genStmt = (node, ind) => {
    const p = '    '.repeat(ind);
    switch (node.kind) {
      case 'Import': return [`${p}import ${node.module}`];
      case 'Comment': return [`${p}# ${node.text}`];
      case 'Print': return [`${p}print(${genExpr(node.text)})`];
      case 'Wait': return [`${p}time.sleep(${node.seconds})`];
      case 'Assign': return [`${p}${node.name} = ${genExpr(node.value)}`];
      case 'AugAssign': return [`${p}${node.name} ${node.op} ${genExpr(node.value)}`];
      case 'Return': return [`${p}return ${genExpr(node.value)}`];
      case 'SpriteCall': {
        const args = node.args.map(genExpr).join(', ');
        return [`${p}sprite.${node.method}(${args})`];
      }
      case 'StageCall': {
        const args = node.args.map(genExpr).join(', ');
        return [`${p}stage.${node.method}(${args})`];
      }
      case 'FunctionCall': {
        const args = node.args.map(genExpr).join(', ');
        return [`${p}${node.name}(${args})`];
      }
      case 'MethodCall': {
        const args = node.args.map(genExpr).join(', ');
        return [`${p}${node.obj}.${node.method}(${args})`];
      }
      case 'Construct': {
        const args = node.args.map(genExpr).join(', ');
        return [`${p}${node.varName} = ${node.cls}(${args})`];
      }
      case 'PropertySet':
        return [`${p}${node.obj}.${node.attr} = ${genExpr(node.value)}`];
      case 'WhileTrue':
        return [`${p}while True:`, ...genBody(node.body, ind + 1), ''];
      case 'WhileUntil':
        return [`${p}while not(${genExpr(node.test)}):`, ...genBody(node.body, ind + 1), ''];
      case 'ForRange':
        return [`${p}for ${node.target} in range(${node.n}):`, ...genBody(node.body, ind + 1), ''];
      case 'IfStmt': {
        const res = [`${p}if ${genExpr(node.test)}:`, ...genBody(node.body, ind + 1)];
        if (node.orelse && node.orelse.length > 0) {
          res.push(`${p}else:`, ...genBody(node.orelse, ind + 1));
        }
        return [...res, ''];
      }
      case 'FunctionDef': {
        const ret = node.returns && node.returns !== 'None' ? ` -> ${node.returns}` : '';
        return [`${p}def ${node.name}(${node.args})${ret}:`, ...genBody(node.body, ind + 1), ''];
      }
      case 'MethodDef': {
        const ret = node.returns && node.returns !== 'None' ? ` -> ${node.returns}` : '';
        return [`${p}def ${node.name}(${node.args})${ret}:`, ...genBody(node.body, ind + 1), ''];
      }
      case 'ClassDef': {
        const base = node.bases && node.bases.length ? `(${node.bases.join(', ')})` : '';
        return [`${p}class ${node.name}${base}:`, ...genBody(node.body, ind + 1), ''];
      }
      default: return [`${p}# unknown: ${JSON.stringify(node)}`];
    }
  };

  if (ast.kind === 'Program') {
    return ast.body.flatMap(s => genStmt(s, indent)).join('\n');
  }
  return genStmt(ast, indent).join('\n');
};

// ── AST → Blockly JSON ────────────────────────────────────────────────────────

// Maps SpriteCall methods to block types and field layouts
const SPRITE_BLOCK_MAP = {
  move:           (args) => ({ type: 'move_right', fields: { STEPS: argNum(args[0]) } }),
  turn:           (args) => {
    const deg = argNum(args[0]);
    return { type: 'turn_right', fields: { DIRECTION: deg >= 0 ? 'right' : 'left', DEGREES: Math.abs(deg) } };
  },
  set_direction:  (args) => ({ type: 'point_in_direction', fields: { DEGREES: argNum(args[0]) } }),
  goto:           (args) => ({ type: 'go_to_position', fields: { X: argNum(args[0]), Y: argNum(args[1]) } }),
  glide:          (args) => ({ type: 'glide_to_position', fields: { SECONDS: argNum(args[0]), X: argNum(args[1]), Y: argNum(args[2]) } }),
  set_x:          (args) => ({ type: 'set_x', fields: { X: argNum(args[0]) } }),
  set_y:          (args) => ({ type: 'set_y', fields: { Y: argNum(args[0]) } }),
  change_x:       (args) => ({ type: 'change_x', fields: { DX: argNum(args[0]) } }),
  change_y:       (args) => ({ type: 'change_y', fields: { DY: argNum(args[0]) } }),
  if_on_edge_bounce: () => ({ type: 'if_on_edge_bounce', fields: {} }),
  point_towards:  (args) => ({ type: 'point_towards', fields: { TARGET: argStr(args[0]) } }),
  say:            (args) => args.length > 1
    ? { type: 'say_for_seconds', inputs: { TEXT: inputText(args[0]) }, fields: { SECONDS: argNum(args[1]) } }
    : { type: 'say', inputs: { TEXT: inputText(args[0]) }, fields: {} },
  think:          (args) => args.length > 1
    ? { type: 'think_for_seconds', inputs: { TEXT: inputText(args[0]) }, fields: { SECONDS: argNum(args[1]) } }
    : { type: 'think', inputs: { TEXT: inputText(args[0]) }, fields: {} },
  switch_costume: (args) => ({ type: 'switch_costume', fields: { COSTUME: argStr(args[0]) } }),
  next_costume:   () => ({ type: 'next_costume', fields: {} }),
  set_size:       (args) => ({ type: 'set_size', fields: { SIZE: argNum(args[0]) } }),
  change_size:    (args) => ({ type: 'change_size', fields: { AMOUNT: argNum(args[0]) } }),
  show:           () => ({ type: 'show', fields: {} }),
  hide:           () => ({ type: 'hide', fields: {} }),
  play_sound:     (args) => ({ type: 'play_sound', fields: { SOUND: argStr(args[0]) } }),
  play_sound_until_done: (args) => ({ type: 'play_sound_until_done', fields: { SOUND: argStr(args[0]) } }),
  stop_all_sounds: () => ({ type: 'stop_all_sounds', fields: {} }),
  set_volume:     (args) => ({ type: 'set_volume', fields: { VOLUME: argNum(args[0]) } }),
  change_volume:  (args) => ({ type: 'change_volume', fields: { AMOUNT: argNum(args[0]) } }),
  go_to_layer:    (args) => ({ type: 'go_to_layer', fields: { LAYER: argStr(args[0]) } }),
  reset_timer:    () => ({ type: 'reset_timer', fields: {} }),
};

const STAGE_BLOCK_MAP = {
  switch_backdrop: (args) => ({ type: 'switch_backdrop', fields: { BACKDROP: argStr(args[0]) } }),
  next_backdrop:   () => ({ type: 'next_backdrop', fields: {} }),
};

const argNum = (node) => node ? (node.kind === 'NumLit' ? node.v : 0) : 0;
const argStr = (node) => node ? (node.kind === 'StrLit' ? node.v : '') : '';
const inputText = (node) => ({
  block: {
    kind: 'block',
    type: node?.kind === 'StrLit' ? 'text' : 'text',
    fields: { TEXT: node?.kind === 'StrLit' ? node.v : String(argNum(node)) }
  }
});

export const astToBlockly = (ast, options = {}) => {
  const { wrapRunnable = false } = options;
  const blocks = [];
  let lastRunnable = null;
  const structuralBlocks = [];

  const STRUCTURAL = new Set(['Import', 'ClassDef', 'FunctionDef']);

  const stmtToBlock = (node) => {
    const b = { kind: 'block', fields: {}, inputs: {}, next: null };

    switch (node.kind) {
      case 'Import':
        // 'import time' → silently skip (time.sleep maps to wait block implicitly)
        if (node.module === 'time') return null;
        return { ...b, type: 'structure_import', fields: { LIBRARY: node.module } };

      case 'Wait':
        return { ...b, type: 'wait', fields: { SECONDS: node.seconds } };

      case 'Print':
        return { ...b, type: 'print', fields: { TEXT: node.text?.kind === 'StrLit' ? node.text.v : '' } };

      case 'Assign':
        return { ...b, type: 'variable', fields: { VAR_NAME: node.name, VALUE: exprToStr(node.value) } };

      case 'AugAssign':
        return { ...b, type: 'change_variable', fields: { VAR_NAME: node.name, VALUE: exprToStr(node.value) } };

      case 'SpriteCall': {
        const mapper = SPRITE_BLOCK_MAP[node.method];
        if (mapper) {
          const mapped = mapper(node.args);
          return { ...b, ...mapped };
        }
        return { ...b, type: 'comment', fields: { TEXT: `sprite.${node.method}(...)` } };
      }

      case 'StageCall': {
        const mapper = STAGE_BLOCK_MAP[node.method];
        if (mapper) return { ...b, ...mapper(node.args) };
        return { ...b, type: 'comment', fields: { TEXT: `stage.${node.method}(...)` } };
      }

      case 'WhileTrue': {
        const inner = chainBlocks(node.body.map(stmtToBlock).filter(Boolean));
        return { ...b, type: 'loop_forever', inputs: inner ? { DO: { block: inner } } : {} };
      }

      case 'WhileUntil': {
        const inner = chainBlocks(node.body.map(stmtToBlock).filter(Boolean));
        return {
          ...b, type: 'repeat_until',
          fields: { CONDITION: exprToStr(node.test) },
          inputs: inner ? { DO: { block: inner } } : {}
        };
      }

      case 'ForRange': {
        const inner = chainBlocks(node.body.map(stmtToBlock).filter(Boolean));
        return { ...b, type: 'repeat', fields: { TIMES: node.n }, inputs: inner ? { DO: { block: inner } } : {} };
      }

      case 'IfStmt': {
        const inner = chainBlocks(node.body.map(stmtToBlock).filter(Boolean));
        if (node.orelse && node.orelse.length > 0) {
          const elseInner = chainBlocks(node.orelse.map(stmtToBlock).filter(Boolean));
          return {
            ...b, type: 'if_else',
            fields: { CONDITION: exprToStr(node.test) },
            inputs: {
              ...(inner ? { DO: { block: inner } } : {}),
              ...(elseInner ? { ELSE: { block: elseInner } } : {}),
            }
          };
        }
        return {
          ...b, type: 'if',
          fields: { CONDITION: exprToStr(node.test) },
          inputs: inner ? { DO: { block: inner } } : {}
        };
      }

      case 'FunctionDef': {
        const inner = chainBlocks(node.body.map(stmtToBlock).filter(Boolean));
        return {
          ...b, type: 'structure_typed_function',
          fields: { NAME: node.name, ARGS: node.args, RETURN_TYPE: node.returns || 'None' },
          inputs: inner ? { STACK: { block: inner } } : {}
        };
      }

      case 'ClassDef': {
        const inner = chainBlocks(node.body.map(stmtToBlock).filter(Boolean));
        return {
          ...b, type: 'structure_module_def',
          fields: { NAME: node.name },
          inputs: inner ? { CONTENT: { block: inner } } : {}
        };
      }

      case 'MethodCall':
        return { ...b, type: 'class_method_call', fields: { OBJ: node.obj, METHOD: node.method, ARGS: node.args.map(exprToStr).join(', ') } };

      case 'Construct':
        return { ...b, type: 'class_instance', fields: { VAR_NAME: node.varName, CLASS_NAME: node.cls, ARGS: node.args.map(exprToStr).join(', ') } };

      case 'Comment':
        return { ...b, type: 'comment', fields: { TEXT: node.text } };

      default:
        return null;
    }
  };

  const exprToStr = (node) => {
    if (!node) return '';
    switch (node.kind) {
      case 'NumLit': return String(node.v);
      case 'StrLit': return node.v;
      case 'BoolLit': return node.v ? 'True' : 'False';
      case 'VarRef': return node.name;
      case 'BinOp': return `${exprToStr(node.l)} ${node.op} ${exprToStr(node.r)}`;
      case 'UnaryOp': return `${node.op} ${exprToStr(node.v)}`;
      default: return '';
    }
  };

  const chainBlocks = (blockList) => {
    if (!blockList || blockList.length === 0) return null;
    const filtered = blockList.filter(Boolean);
    if (!filtered.length) return null;
    let head = { ...filtered[0], next: null };
    let cur = head;
    for (let i = 1; i < filtered.length; i++) {
      const next = { ...filtered[i], next: null };
      cur.next = { block: next };
      cur = next;
    }
    return head;
  };

  // Build top-level blocks
  const runnableBlocks = [];
  const structBlocks = [];

  if (ast.kind === 'Program') {
    for (const stmt of ast.body) {
      const block = stmtToBlock(stmt);
      if (!block) continue;
      if (STRUCTURAL.has(stmt.kind)) {
        structBlocks.push(block);
      } else {
        runnableBlocks.push(block);
      }
    }
  }

  // Imports first, then class/function definitions, then the runnable block
  const imports = structBlocks.filter(b => b.type === 'structure_import');
  const defs    = structBlocks.filter(b => b.type !== 'structure_import');
  let finalBlocks;
  if (wrapRunnable && runnableBlocks.length > 0) {
    const chain = chainBlocks(runnableBlocks);
    finalBlocks = [
      ...imports,
      ...defs,
      { kind: 'block', type: 'on_start', fields: {}, inputs: chain ? { DO: { block: chain } } : {}, next: null },
    ];
  } else {
    finalBlocks = [...imports, ...defs, ...runnableBlocks];
  }

  // Auto-layout
  let y = 50;
  finalBlocks.forEach(b => { b.x = 50; b.y = y; y += 300; });

  return { blocks: { blocks: finalBlocks } };
};

// ── Utilities ─────────────────────────────────────────────────────────────────

const splitArgs = (s) => {
  if (!s || !s.trim()) return [];
  const parts = [];
  let cur = '', inStr = false, strCh = '', depth = 0;
  for (const ch of s) {
    if (inStr) {
      cur += ch;
      if (ch === strCh) inStr = false;
    } else if (ch === '"' || ch === "'") {
      inStr = true; strCh = ch; cur += ch;
    } else if (ch === '(' || ch === '[') {
      depth++; cur += ch;
    } else if (ch === ')' || ch === ']') {
      depth--; cur += ch;
    } else if (ch === ',' && depth === 0) {
      parts.push(cur.trim()); cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
};
