/**
 * Deterministic Python → Blockly via the real CPython AST.
 *
 *   Python source  ──POST /ast──▶  JSON AST (CPython's ast module)
 *                  ──visitor──────▶  Blockly workspace JSON
 *
 * Why this module exists (instead of the regex transpiler.js / heuristic ast.js):
 *   - Real AST handles arbitrary nesting (while→if→call→binop) recursively.
 *   - Deterministic: same source in → same blocks out, no LLM.
 *   - Millisecond-fast: a subprocess roundtrip to Python's ast.parse().
 *
 * Mapping is a direct NodeVisitor. Statement nodes return statement blocks;
 * expression nodes return value blocks (Blockly input.block shape). Anything
 * this visitor doesn't know about becomes a `raw_python` fallback block that
 * carries the verbatim source slice, so we never silently drop user code.
 */

import { getBackendBase } from './pythonBackend';
import { findSemanticCall, invalidateSchemaRegistry } from './librarySchemaRegistry';

/**
 * Variable collector — Blockly's variables_set / variables_get need the
 * variable to be declared in the workspace's variable map. We gather names
 * during AST walking so astToBlockly can inject them at the top of the JSON.
 */
let _COLLECTED_VARS = new Set();
const _collectVar = (name) => { if (name) _COLLECTED_VARS.add(name); };

/**
 * Resolve a call callee(a, b, kw=v) to a semantic library block builder.
 * Delegates to librarySchemaRegistry for schema-based scoring (callPath,
 * arity, keyword set, complex-arg penalties).
 */
const _libLookup = (callee, arity, kwNames, argKinds) =>
  findSemanticCall(callee, kwNames || new Set(), arity, {
    exprBlock, astToSource, argKinds: argKinds || [],
  });

// ── ast node identifiers (CPython) ───────────────────────────────────────────
const K = {
  Module: 'Module',
  Import: 'Import', ImportFrom: 'ImportFrom', alias: 'alias',
  FunctionDef: 'FunctionDef', AsyncFunctionDef: 'AsyncFunctionDef',
  ClassDef: 'ClassDef', Return: 'Return',
  Assign: 'Assign', AugAssign: 'AugAssign', AnnAssign: 'AnnAssign',
  Expr: 'Expr', Pass: 'Pass', Break: 'Break', Continue: 'Continue',
  If: 'If', While: 'While', For: 'For', AsyncFor: 'AsyncFor',
  Try: 'Try', ExceptHandler: 'ExceptHandler', Raise: 'Raise',
  With: 'With', AsyncWith: 'AsyncWith',
  Call: 'Call', Attribute: 'Attribute', Name: 'Name',
  Constant: 'Constant', JoinedStr: 'JoinedStr', FormattedValue: 'FormattedValue',
  BinOp: 'BinOp', UnaryOp: 'UnaryOp', BoolOp: 'BoolOp', Compare: 'Compare',
  List: 'List', Tuple: 'Tuple', Dict: 'Dict', Set: 'Set',
  Subscript: 'Subscript', Slice: 'Slice',
  Starred: 'Starred', keyword: 'keyword',
  // Sprint-2 additions
  Lambda: 'Lambda',
  IfExp: 'IfExp',
  ListComp: 'ListComp', SetComp: 'SetComp', DictComp: 'DictComp', GeneratorExp: 'GeneratorExp',
  Yield: 'Yield', YieldFrom: 'YieldFrom', Await: 'Await',
  Assert: 'Assert', Delete: 'Delete',
  Global: 'Global', Nonlocal: 'Nonlocal',
  Match: 'Match', match_case: 'match_case',
  // operator kinds
  Add: 'Add', Sub: 'Sub', Mult: 'Mult', Div: 'Div', FloorDiv: 'FloorDiv',
  Mod: 'Mod', Pow: 'Pow', MatMult: 'MatMult',
  BitAnd: 'BitAnd', BitOr: 'BitOr', BitXor: 'BitXor', LShift: 'LShift', RShift: 'RShift',
  And: 'And', Or: 'Or', Not: 'Not', USub: 'USub', UAdd: 'UAdd',
  Eq: 'Eq', NotEq: 'NotEq', Lt: 'Lt', LtE: 'LtE', Gt: 'Gt', GtE: 'GtE',
  Is: 'Is', IsNot: 'IsNot', In: 'In', NotIn: 'NotIn',
};

const OP_SYM = {
  Add: '+', Sub: '-', Mult: '*', Div: '/', FloorDiv: '//', Mod: '%', Pow: '**', MatMult: '@',
  BitAnd: '&', BitOr: '|', BitXor: '^', LShift: '<<', RShift: '>>',
  And: 'and', Or: 'or', Not: 'not', USub: '-', UAdd: '+',
  Eq: '==', NotEq: '!=', Lt: '<', LtE: '<=', Gt: '>', GtE: '>=',
  Is: 'is', IsNot: 'is not', In: 'in', NotIn: 'not in',
};

// ── helpers to build Blockly JSON ────────────────────────────────────────────

const mkBlock = (type, opts = {}) => ({
  kind: 'block', type, fields: {}, inputs: {}, next: null, ...opts
});

const chainStmts = (stmts) => {
  const list = (stmts || []).filter(Boolean);
  if (list.length === 0) return null;
  const head = { ...list[0], next: null };
  let cur = head;
  for (let i = 1; i < list.length; i++) {
    const b = { ...list[i], next: null };
    cur.next = { block: b };
    cur = b;
  }
  return head;
};

// ── expression → value-block  (output=true, lives inside an input slot) ─────

/** Return a Blockly value-block for the given expression AST, or null. */
const exprBlock = (node) => {
  if (!node) return null;
  switch (node._kind) {

    case K.Constant: {
      const v = node.value;
      if (typeof v === 'string') return mkBlock('text', { fields: { TEXT: v } });
      if (typeof v === 'number') return mkBlock('math_number', { fields: { NUM: String(v) } });
      if (typeof v === 'boolean') return mkBlock('py_bool', { fields: { VAL: v ? 'True' : 'False' } });
      if (v === null) return mkBlock('py_none');
      return mkBlock('text', { fields: { TEXT: String(v) } });
    }

    case K.Name:
      // Use Blockly's built-in variables_get. The variable is also collected so
      // it gets declared in the workspace's variable map alongside the block.
      _collectVar(node.id);
      return mkBlock('variables_get', {
        fields: { VAR: { id: node.id, name: node.id, type: '' } },
      });

    case K.Attribute: {
      // Always emit py_attr — a structural block with a value input for obj
      // and a text field for the attribute name. Even chains (a.b.c) come out
      // as nested py_attr blocks.
      const objBlock = exprBlock(node.value) || rawValueBlock(astToSource(node.value));
      return mkBlock('py_attr', {
        fields: { ATTR: node.attr || 'attr' },
        inputs: { OBJ: { block: objBlock } },
      });
    }

    case K.Call: {
      // 1) Try to map the call to a library-specific block. Honest scoring
      //    means schemas back off when args are too complex to fit field text.
      const callee = flattenAttrName(node.func);   // null for chain calls
      const kwNames = new Set((node.keywords || []).map(k => k.arg).filter(Boolean));
      const argKinds = (node.args || []).map(a => a._kind);
      if (callee) {
        const libMatch = _libLookup(callee, (node.args || []).length, kwNames, argKinds);
        if (libMatch) return libMatch(node);
      }

      // 2) Method chain: callee is a Call (e.g. base64.b64encode(...).decode()).
      //    Lower as py_call with a CALLEE value-input that holds the structural
      //    receiver (a py_attr or another py_call), keeping the chain visible.
      if (!callee) {
        const calleeBlock = exprBlock(node.func) || rawValueBlock(astToSource(node.func));
        const args = (node.args || []).map(a => exprBlock(a) || rawValueBlock(astToSource(a)));
        const kwArgs = (node.keywords || []).map(k => mkBlock('py_keyword_arg', {
          fields: { NAME: k.arg || 'kw' },
          inputs: { VALUE: { block: exprBlock(k.value) || rawValueBlock(astToSource(k.value)) } },
        }));
        const total = [...args, ...kwArgs];
        const inputs = { CALLEE: { block: calleeBlock } };
        total.forEach((b, i) => { inputs[`ARG${i}`] = { block: b }; });
        return mkBlock('py_call', {
          fields: { FUNC: '' },
          inputs,
          extraState: { argCount: total.length, hasCallee: true },
        });
      }

      // 2) Generic py_call with dynamic arg count.
      // Keyword args become py_keyword_arg value blocks so the structure is
      // preserved (not collapsed into a "kw=value" text field).
      const args = (node.args || []).map(a => exprBlock(a) || rawValueBlock(astToSource(a)));
      const kwArgs = (node.keywords || []).map(k => {
        const valBlock = exprBlock(k.value) || rawValueBlock(astToSource(k.value));
        return mkBlock('py_keyword_arg', {
          fields: { NAME: k.arg || 'kw' },
          inputs: { VALUE: { block: valBlock } },
        });
      });
      const total = [...args, ...kwArgs];
      const inputs = {};
      total.forEach((b, i) => { inputs[`ARG${i}`] = { block: b }; });
      return mkBlock('py_call', {
        fields: { FUNC: callee },
        inputs,
        extraState: { argCount: total.length },
      });
    }

    case K.Subscript: {
      const container = exprBlock(node.value) || rawValueBlock(astToSource(node.value));
      const sliceExpr = exprBlock(node.slice) || rawValueBlock(astToSource(node.slice));
      return mkBlock('py_subscript', {
        inputs: { OBJ: { block: container }, SLICE: { block: sliceExpr } },
      });
    }

    case K.Slice: {
      const lo = node.lower ? (exprBlock(node.lower) || rawValueBlock(astToSource(node.lower))) : null;
      const hi = node.upper ? (exprBlock(node.upper) || rawValueBlock(astToSource(node.upper))) : null;
      const st = node.step  ? (exprBlock(node.step)  || rawValueBlock(astToSource(node.step)))  : null;
      const inputs = {};
      if (lo) inputs.LOW  = { block: lo };
      if (hi) inputs.HIGH = { block: hi };
      if (st) inputs.STEP = { block: st };
      return mkBlock('py_slice', { inputs });
    }

    case K.List: {
      const elts = node.elts || [];
      const inputs = {};
      elts.forEach((e, i) => { inputs[`ITEM${i}`] = { block: exprBlock(e) || rawValueBlock(astToSource(e)) }; });
      return mkBlock('py_list', { inputs, extraState: { argCount: elts.length } });
    }

    case K.Tuple: {
      const elts = node.elts || [];
      const inputs = {};
      elts.forEach((e, i) => { inputs[`ITEM${i}`] = { block: exprBlock(e) || rawValueBlock(astToSource(e)) }; });
      return mkBlock('py_tuple', { inputs, extraState: { argCount: elts.length } });
    }

    case K.Dict: {
      const keys = node.keys || [];
      const vals = node.values || [];
      const inputs = {};
      let slot = 0;
      for (let i = 0; i < Math.max(keys.length, vals.length); i++) {
        const k = keys[i] ? (exprBlock(keys[i]) || rawValueBlock(astToSource(keys[i]))) : rawValueBlock('None');
        const v = vals[i] ? (exprBlock(vals[i]) || rawValueBlock(astToSource(vals[i]))) : rawValueBlock('None');
        inputs[`ITEM${slot++}`] = { block: k };
        inputs[`ITEM${slot++}`] = { block: v };
      }
      return mkBlock('py_dict', { inputs, extraState: { argCount: slot } });
    }

    case K.JoinedStr: {
      // f"…{x}…{y}…" → py_fstring with a template and value inputs
      let tpl = '';
      const values = [];
      for (const part of node.values || []) {
        if (part._kind === K.Constant) {
          tpl += String(part.value);
        } else if (part._kind === K.FormattedValue) {
          tpl += `{${values.length}}`;
          values.push(exprBlock(part.value) || rawValueBlock(astToSource(part.value)));
        } else {
          tpl += `{${values.length}}`;
          values.push(exprBlock(part) || rawValueBlock(astToSource(part)));
        }
      }
      const inputs = {};
      values.forEach((b, i) => { inputs[`VAL${i}`] = { block: b }; });
      return mkBlock('py_fstring', {
        fields: { TEMPLATE: tpl },
        inputs,
        extraState: { argCount: values.length },
      });
    }

    case K.BinOp: {
      const lhs = exprBlock(node.left);
      const rhs = exprBlock(node.right);
      const op  = OP_SYM[node.op?._kind] || '+';
      return mkBlock('py_binop', {
        fields: { OP: op },
        inputs: {
          A: { block: lhs || rawValueBlock(astToSource(node.left)) },
          B: { block: rhs || rawValueBlock(astToSource(node.right)) },
        },
      });
    }

    case K.UnaryOp: {
      const inner = exprBlock(node.operand) || rawValueBlock(astToSource(node.operand));
      const op = OP_SYM[node.op?._kind] || '-';
      return mkBlock('py_unary', {
        fields: { OP: op },
        inputs: { A: { block: inner } },
      });
    }

    case K.Compare: {
      // a < b < c → render as first-comparison for simplicity (and carry source as fallback text)
      const lhs = exprBlock(node.left) || rawValueBlock(astToSource(node.left));
      const rhs = exprBlock((node.comparators || [])[0]) || rawValueBlock(astToSource((node.comparators || [])[0]));
      const op  = OP_SYM[(node.ops || [])[0]?._kind] || '==';
      return mkBlock('py_binop', {
        fields: { OP: op },
        inputs: { A: { block: lhs }, B: { block: rhs } },
      });
    }

    case K.BoolOp: {
      const parts = (node.values || []).map(v => exprBlock(v) || rawValueBlock(astToSource(v)));
      if (parts.length === 0) return rawValueBlock('False');
      // Chain as nested py_binop with 'and'/'or'
      const op = OP_SYM[node.op?._kind] || 'and';
      return parts.reduce((acc, cur) => (
        acc ? mkBlock('py_binop', {
          fields: { OP: op },
          inputs: { A: { block: acc }, B: { block: cur } },
        }) : cur
      ), null);
    }

    case K.IfExp: {
      // `body if test else orelse` — an exact ternary as a value block
      const body = exprBlock(node.body) || rawValueBlock(astToSource(node.body));
      const test = exprBlock(node.test) || rawValueBlock(astToSource(node.test));
      const orelse = exprBlock(node.orelse) || rawValueBlock(astToSource(node.orelse));
      return mkBlock('py_ifexp', {
        inputs: {
          BODY: { block: body },
          TEST: { block: test },
          ELSE: { block: orelse },
        },
      });
    }

    case K.Lambda: {
      // args may be complex; flatten to "a, b, c" for the ARGS field.
      const params = (node.args?.args || []).map(a => a.arg).join(', ');
      const body = exprBlock(node.body) || rawValueBlock(astToSource(node.body));
      return mkBlock('py_lambda', {
        fields: { ARGS: params },
        inputs: { BODY: { block: body } },
      });
    }

    case K.ListComp:
    case K.SetComp:
    case K.GeneratorExp: {
      const gen0 = (node.generators || [])[0] || {};
      const expr = exprBlock(node.elt) || rawValueBlock(astToSource(node.elt));
      const iter = exprBlock(gen0.iter) || rawValueBlock(astToSource(gen0.iter));
      const tgt = gen0.target?._kind === K.Name ? gen0.target.id : astToSource(gen0.target);
      _collectVar(tgt);
      const cond0 = (gen0.ifs || [])[0];
      const condBlock = cond0 ? (exprBlock(cond0) || rawValueBlock(astToSource(cond0))) : null;
      const kindMap = { ListComp: 'list', SetComp: 'set', GeneratorExp: 'gen' };
      return mkBlock('py_comprehension', {
        fields: { KIND: kindMap[node._kind], TARGET: tgt || 'x' },
        inputs: {
          EXPR: { block: expr },
          ITER: { block: iter },
          ...(condBlock ? { COND: { block: condBlock } } : {}),
        },
      });
    }

    case K.DictComp: {
      const gen0 = (node.generators || [])[0] || {};
      const k = exprBlock(node.key) || rawValueBlock(astToSource(node.key));
      const v = exprBlock(node.value) || rawValueBlock(astToSource(node.value));
      const iter = exprBlock(gen0.iter) || rawValueBlock(astToSource(gen0.iter));
      const tgt = gen0.target?._kind === K.Name ? gen0.target.id : astToSource(gen0.target);
      _collectVar(tgt);
      const cond0 = (gen0.ifs || [])[0];
      const condBlock = cond0 ? (exprBlock(cond0) || rawValueBlock(astToSource(cond0))) : null;
      return mkBlock('py_dict_comp', {
        fields: { TARGET: tgt || 'k' },
        inputs: {
          KEY: { block: k },
          VALUE: { block: v },
          ITER: { block: iter },
          ...(condBlock ? { COND: { block: condBlock } } : {}),
        },
      });
    }

    case K.Yield:
    case K.YieldFrom: {
      // `yield` at expression position: rare but legal; emit as a value block
      // wrapping py_yield's inner structure.
      const v = node.value ? (exprBlock(node.value) || rawValueBlock(astToSource(node.value))) : null;
      // py_yield is defined as a statement; when seen here we render as a string expr.
      const src = `yield${node._kind === K.YieldFrom ? ' from' : ''}${node.value ? ' ' + astToSource(node.value) : ''}`;
      return rawValueBlock(src);
    }

    case K.Await: {
      const v = exprBlock(node.value) || rawValueBlock(astToSource(node.value));
      return mkBlock('py_await', { inputs: { VALUE: { block: v } } });
    }

    case K.Starred: {
      // *x in an arg list — preserve as a raw value block that emits "*x"
      return rawValueBlock('*' + astToSource(node.value));
    }

    default:
      // Last-resort fallback — preserve source text so structure isn't lost entirely.
      return rawValueBlock(astToSource(node));
  }
};

const rawValueBlock = (src) => mkBlock('text', { fields: { TEXT: src || '' } });

/** a.b.c → "a.b.c" string, or null if the tree includes non-attr/Name nodes */
const flattenAttrName = (node) => {
  if (!node) return null;
  if (node._kind === K.Name) return node.id;
  if (node._kind === K.Attribute) {
    const base = flattenAttrName(node.value);
    return base ? `${base}.${node.attr}` : null;
  }
  return null;
};

/** Fallback source reconstruction — good enough for raw/unhandled nodes */
const astToSource = (node) => {
  if (!node) return '';
  switch (node._kind) {
    case K.Constant:
      if (typeof node.value === 'string') return JSON.stringify(node.value);
      return String(node.value);
    case K.Name: return node.id;
    case K.Attribute: return `${astToSource(node.value)}.${node.attr}`;
    case K.Call: {
      const fn = astToSource(node.func);
      const pos = (node.args || []).map(astToSource);
      const kws = (node.keywords || []).map(k => `${k.arg}=${astToSource(k.value)}`);
      return `${fn}(${[...pos, ...kws].join(', ')})`;
    }
    case K.BinOp:
      return `${astToSource(node.left)} ${OP_SYM[node.op?._kind] || '+'} ${astToSource(node.right)}`;
    case K.UnaryOp:
      return `${OP_SYM[node.op?._kind] || '-'}${astToSource(node.operand)}`;
    case K.Compare: {
      let s = astToSource(node.left);
      (node.ops || []).forEach((op, i) => {
        s += ` ${OP_SYM[op?._kind] || '=='} ${astToSource((node.comparators || [])[i])}`;
      });
      return s;
    }
    case K.BoolOp:
      return (node.values || []).map(astToSource).join(` ${OP_SYM[node.op?._kind] || 'and'} `);
    case K.List:  return `[${(node.elts || []).map(astToSource).join(', ')}]`;
    case K.Tuple: return `(${(node.elts || []).map(astToSource).join(', ')})`;
    case K.Dict:  return `{${(node.keys || []).map((k, i) => `${astToSource(k)}: ${astToSource((node.values || [])[i])}`).join(', ')}}`;
    case K.Set:   return `{${(node.elts || []).map(astToSource).join(', ')}}`;
    case K.Subscript: return `${astToSource(node.value)}[${astToSource(node.slice)}]`;
    case K.Slice: return `${astToSource(node.lower)}:${astToSource(node.upper)}${node.step ? ':' + astToSource(node.step) : ''}`;
    case K.JoinedStr:
      return 'f"' + (node.values || []).map(v => v._kind === K.Constant ? v.value : `{${astToSource(v.value || v)}}`).join('') + '"';
    case K.FormattedValue: return `{${astToSource(node.value)}}`;
    case K.Starred: return `*${astToSource(node.value)}`;
    case K.IfExp:  return `(${astToSource(node.body)} if ${astToSource(node.test)} else ${astToSource(node.orelse)})`;
    case K.Lambda: {
      const params = (node.args?.args || []).map(a => a.arg).join(', ');
      return `lambda ${params}: ${astToSource(node.body)}`;
    }
    // Statement-level nodes that can appear via rawStmt — we need a source
    // string or the fallback block becomes "pass" and the user loses work.
    case K.Assign: {
      const tgts = (node.targets || []).map(astToSource).join(' = ');
      return `${tgts} = ${astToSource(node.value)}`;
    }
    case K.AugAssign:
      return `${astToSource(node.target)} ${OP_SYM[node.op?._kind] || '+'}= ${astToSource(node.value)}`;
    case K.Expr: return astToSource(node.value);
    case K.Return: return `return ${astToSource(node.value)}`;
    case K.Pass: return 'pass';
    case K.Break: return 'break';
    case K.Continue: return 'continue';
    case K.Raise: return node.exc ? `raise ${astToSource(node.exc)}` : 'raise';
    case K.Import:
      return 'import ' + (node.names || []).map(n => n.asname ? `${n.name} as ${n.asname}` : n.name).join(', ');
    case K.ImportFrom:
      return `from ${node.module || ''} import ` + (node.names || []).map(n => n.asname ? `${n.name} as ${n.asname}` : n.name).join(', ');
    default: return '';
  }
};

// ── statement → statement-block  ─────────────────────────────────────────────

const stmtBlock = (node) => {
  if (!node) return null;
  switch (node._kind) {

    case K.Import: {
      // one block per name (a, b as c → two blocks). Keep the first here;
      // caller already flattens via visitStmts below.
      const n = (node.names || [])[0];
      return mkBlock('structure_import', { fields: { LIBRARY: n?.name || '' } });
    }

    case K.ImportFrom: {
      // "from X import a, b" → a single structure_import with "X (a, b)"
      const mod = node.module || '';
      const names = (node.names || []).map(a => a.asname ? `${a.name} as ${a.asname}` : a.name).join(', ');
      return mkBlock('structure_import', { fields: { LIBRARY: `${mod} (${names})` } });
    }

    case K.Assign: {
      const targets = node.targets || [];
      const first = targets[0];
      const rhs = exprBlock(node.value) || rawValueBlock(astToSource(node.value));

      // Tuple unpacking: "ok, frame = cap.read()" → py_tuple_assign
      if (first?._kind === K.Tuple) {
        const names = (first.elts || []).map(e =>
          e._kind === K.Name ? e.id : (e._kind === K.Constant ? String(e.value) : astToSource(e))
        );
        names.forEach(n => _collectVar(n));
        const fields = {};
        names.forEach((n, i) => { fields[`NAME${i}`] = n; });
        return mkBlock('py_tuple_assign', {
          fields,
          inputs: { VALUE: { block: rhs } },
          extraState: { argCount: names.length },
        });
      }

      // Subscript LHS: frame[(y, :)] = ... → py_subscript_assign
      if (first?._kind === K.Subscript) {
        const objBlock = exprBlock(first.value) || rawValueBlock(astToSource(first.value));
        const sliceBlock = exprBlock(first.slice) || rawValueBlock(astToSource(first.slice));
        return mkBlock('py_subscript_assign', {
          inputs: {
            OBJ: { block: objBlock },
            SLICE: { block: sliceBlock },
            VALUE: { block: rhs },
          },
        });
      }

      // Attribute LHS: self.n = ... → py_attr_assign
      if (first?._kind === K.Attribute) {
        const objBlock = exprBlock(first.value) || rawValueBlock(astToSource(first.value));
        return mkBlock('py_attr_assign', {
          fields: { ATTR: first.attr || 'attr' },
          inputs: { OBJ: { block: objBlock }, VALUE: { block: rhs } },
        });
      }

      // Plain name LHS.
      const tgtName = flattenAttrName(first);
      if (!tgtName) return rawStmt(astToSource(node));
      _collectVar(tgtName);

      // "x = literal"  →  curated `variable` block (set x to N). The block
      // round-trips byte-perfect through its Python generator, while the
      // generic Blockly variables_set requires a value-input wrapper that
      // re-emits with parens around binops on the next regen.
      if (node.value?._kind === K.Constant) {
        return mkBlock('variable', {
          fields: { VAR_NAME: tgtName, VALUE: String(node.value.value) },
        });
      }

      // Anything more complex (binops, calls, …) keeps the structural
      // variables_set + value-input shape so we don't lose information.
      return mkBlock('variables_set', {
        fields: { VAR: { id: tgtName, name: tgtName, type: '' } },
        inputs: { VALUE: { block: rhs } },
      });
    }

    case K.AugAssign: {
      const name = flattenAttrName(node.target) || 'x';
      const op = OP_SYM[node.op?._kind] || '+';
      _collectVar(name);

      // "x += literal"  /  "x -= literal"  →  curated change_variable block.
      // change_variable's Python generator emits "x += value\n" so the round
      // trip through this block is byte-identical for the common case the
      // user actually types. We only take this path for + and - with a
      // simple constant on the RHS (the block has a TEXT field, no value
      // input — anything more complex would silently lose structure).
      if ((op === '+' || op === '-') && node.value?._kind === K.Constant) {
        const lit = String(node.value.value);
        const value = op === '-' ? `-${lit}` : lit;
        return mkBlock('change_variable', {
          fields: { VAR_NAME: name, VALUE: value },
        });
      }

      // Anything else falls back to the structural variables_set + py_binop
      // shape so we don't lose information.
      const rhs = mkBlock('py_binop', {
        fields: { OP: op },
        inputs: {
          A: { block: mkBlock('variables_get', {
            fields: { VAR: { id: name, name, type: '' } }
          }) },
          B: { block: exprBlock(node.value) || rawValueBlock(astToSource(node.value)) },
        },
      });
      return mkBlock('variables_set', {
        fields: { VAR: { id: name, name, type: '' } },
        inputs: { VALUE: { block: rhs } },
      });
    }

    case K.AnnAssign: {
      if (!node.value) return rawStmt(astToSource(node));
      const tgtName = flattenAttrName(node.target) || 'x';
      _collectVar(tgtName);
      const rhs = exprBlock(node.value) || rawValueBlock(astToSource(node.value));
      return mkBlock('variables_set', {
        fields: { VAR: { id: tgtName, name: tgtName, type: '' } },
        inputs: { VALUE: { block: rhs } },
      });
    }

    case K.Expr: {
      const v = node.value;
      // yield / yield from at statement level → py_yield
      if (v?._kind === K.Yield || v?._kind === K.YieldFrom) {
        const inner = v.value ? (exprBlock(v.value) || rawValueBlock(astToSource(v.value))) : null;
        return mkBlock('py_yield', {
          fields: { KIND: v._kind === K.YieldFrom ? 'yield from' : 'yield' },
          inputs: inner ? { VALUE: { block: inner } } : {},
        });
      }
      // await at statement level — still a value node, wrap in an expression "statement"
      if (v?._kind === K.Await) {
        const inner = exprBlock(v) || rawValueBlock(astToSource(v));
        // emit as a py_stmt with FUNC empty and single arg (the await expr) — keeps
        // the structure visible even though Python would render `await x\n`.
        return mkBlock('py_stmt', {
          fields: { FUNC: '' },
          inputs: { ARG0: { block: inner } },
          extraState: { argCount: 1 },
        });
      }
      if (v?._kind === K.Call) {
        const callee = flattenAttrName(v.func) || astToSource(v.func);

        // print(x) → use the existing print block (already composable via VALUE slot).
        if (callee === 'print' && (v.args || []).length === 1 && (v.keywords || []).length === 0) {
          const arg = exprBlock(v.args[0]) || rawValueBlock(astToSource(v.args[0]));
          return mkBlock('print', { fields: { TEXT: '' }, inputs: { VALUE: { block: arg } } });
        }

        // Library-registered statement call?
        const kwNames = new Set((v.keywords || []).map(k => k.arg).filter(Boolean));
        const libMatch = _libLookup(callee, (v.args || []).length, kwNames);
        if (libMatch) return libMatch(v);

        // Generic py_stmt with dynamic arg count
        const args = (v.args || []).map(a => exprBlock(a) || rawValueBlock(astToSource(a)));
        const kw = (v.keywords || []).map(k =>
          mkBlock('text', { fields: { TEXT: `${k.arg}=${astToSource(k.value)}` } })
        );
        const total = [...args, ...kw];
        const inputs = {};
        total.forEach((b, i) => { inputs[`ARG${i}`] = { block: b }; });
        return mkBlock('py_stmt', {
          fields: { FUNC: callee },
          inputs,
          extraState: { argCount: total.length },
        });
      }
      return rawStmt(astToSource(v));
    }

    case K.If: {
      const thenChain = chainStmts((node.body || []).map(stmtBlock).filter(Boolean));
      const elseChain = chainStmts((node.orelse || []).map(stmtBlock).filter(Boolean));
      const condBlock = exprBlock(node.test);
      const condSrc = astToSource(node.test);
      // Populate both: CONDITION text field (legacy, generator reads it if value slot is empty)
      // AND CONDITION_VAL value input (structural tree the user can manipulate in blocks).
      if (elseChain) {
        return mkBlock('if_else', {
          fields: { CONDITION: condSrc },
          inputs: {
            ...(condBlock ? { CONDITION_VAL: { block: condBlock } } : {}),
            ...(thenChain ? { DO: { block: thenChain } } : {}),
            ELSE: { block: elseChain },
          },
        });
      }
      return mkBlock('if', {
        fields: { CONDITION: condSrc },
        inputs: {
          ...(condBlock ? { CONDITION_VAL: { block: condBlock } } : {}),
          ...(thenChain ? { DO: { block: thenChain } } : {}),
        },
      });
    }

    case K.While: {
      const body = chainStmts((node.body || []).map(stmtBlock).filter(Boolean));
      const isTrue = node.test?._kind === K.Constant && node.test.value === true;
      if (isTrue) {
        return mkBlock('loop_forever', { inputs: body ? { DO: { block: body } } : {} });
      }
      // For repeat_until we model "while cond" as "repeat until not cond".
      const inner = exprBlock(node.test);
      const negated = inner
        ? mkBlock('py_unary', { fields: { OP: 'not' }, inputs: { A: { block: inner } } })
        : null;
      return mkBlock('repeat_until', {
        fields: { CONDITION: `not (${astToSource(node.test)})` },
        inputs: {
          ...(negated ? { CONDITION_VAL: { block: negated } } : {}),
          ...(body ? { DO: { block: body } } : {}),
        },
      });
    }

    case K.For: {
      const body = chainStmts((node.body || []).map(stmtBlock).filter(Boolean));
      const iter = node.iter;
      // for i in range(N): → repeat(N) (the existing semantic block)
      if (iter?._kind === K.Call && flattenAttrName(iter.func) === 'range' && (iter.args || []).length === 1) {
        const n = iter.args[0];
        const times = n?._kind === K.Constant ? String(n.value) : astToSource(n);
        return mkBlock('repeat', { fields: { TIMES: times }, inputs: body ? { DO: { block: body } } : {} });
      }
      // General-purpose: for <name> in <iterable>: body — structural, losslessly
      const name = node.target?._kind === K.Name ? node.target.id : astToSource(node.target);
      _collectVar(name);
      const iterBlock = exprBlock(iter) || rawValueBlock(astToSource(iter));
      return mkBlock('py_for_iter', {
        fields: { NAME: name },
        inputs: {
          ITER: { block: iterBlock },
          ...(body ? { BODY: { block: body } } : {}),
        },
      });
    }

    case K.With: {
      // with e1 as n1, e2 as n2:  → nested py_with blocks
      const items = node.items || [];
      const body = chainStmts((node.body || []).map(stmtBlock).filter(Boolean));
      if (items.length === 0) return rawStmt(astToSource(node));
      const build = (i) => {
        const it = items[i];
        const expr = exprBlock(it.context_expr) || rawValueBlock(astToSource(it.context_expr));
        const name = it.optional_vars?._kind === K.Name ? it.optional_vars.id : 'ctx';
        _collectVar(name);
        const innerBody = i + 1 < items.length
          ? chainStmts([build(i + 1)].filter(Boolean))
          : body;
        return mkBlock('py_with', {
          fields: { NAME: name },
          inputs: {
            EXPR: { block: expr },
            ...(innerBody ? { BODY: { block: innerBody } } : {}),
          },
        });
      };
      return build(0);
    }

    case K.Try: {
      const body = chainStmts((node.body || []).map(stmtBlock).filter(Boolean));
      const handler0 = (node.handlers || [])[0];
      const handlerBody = handler0
        ? chainStmts((handler0.body || []).map(stmtBlock).filter(Boolean))
        : null;
      const excName = handler0?.type ? astToSource(handler0.type) : '';
      const final = chainStmts((node.finalbody || []).map(stmtBlock).filter(Boolean));
      return mkBlock('py_try', {
        fields: { EXC: excName },
        inputs: {
          ...(body ? { BODY: { block: body } } : {}),
          ...(handlerBody ? { HANDLER: { block: handlerBody } } : {}),
          ...(final ? { FINAL: { block: final } } : {}),
        },
      });
    }

    case K.Raise: {
      const exc = node.exc ? (exprBlock(node.exc) || rawValueBlock(astToSource(node.exc))) : null;
      return mkBlock('py_raise', { inputs: exc ? { EXC: { block: exc } } : {} });
    }

    case K.Assert: {
      const t = exprBlock(node.test) || rawValueBlock(astToSource(node.test));
      const m = node.msg ? (exprBlock(node.msg) || rawValueBlock(astToSource(node.msg))) : null;
      return mkBlock('py_assert', {
        inputs: {
          TEST: { block: t },
          ...(m ? { MSG: { block: m } } : {}),
        },
      });
    }

    case K.Delete: {
      // `del a, b, c` — emit one py_delete per target
      const targets = node.targets || [];
      if (targets.length === 0) return null;
      const head = (function build(i) {
        if (i >= targets.length) return null;
        const t = exprBlock(targets[i]) || rawValueBlock(astToSource(targets[i]));
        const block = mkBlock('py_delete', { inputs: { TARGET: { block: t } } });
        const nxt = build(i + 1);
        if (nxt) block.next = { block: nxt };
        return block;
      })(0);
      return head;
    }

    case K.Global:
    case K.Nonlocal: {
      return mkBlock('py_scope', {
        fields: {
          KIND: node._kind === K.Global ? 'global' : 'nonlocal',
          NAMES: (node.names || []).join(', '),
        },
      });
    }

    case K.AsyncFor: {
      // Reuse py_for_iter but mark the statement by wrapping in an async fn.
      // Honest reality: AsyncFor only makes sense inside an async function,
      // so we treat it like For but keep source fidelity via rawStmt if needed.
      const body = chainStmts((node.body || []).map(stmtBlock).filter(Boolean));
      const name = node.target?._kind === K.Name ? node.target.id : astToSource(node.target);
      _collectVar(name);
      const iter = exprBlock(node.iter) || rawValueBlock(astToSource(node.iter));
      return mkBlock('py_for_iter', {
        fields: { NAME: 'async ' + name },   // hint in the name field
        inputs: {
          ITER: { block: iter },
          ...(body ? { BODY: { block: body } } : {}),
        },
      });
    }

    case K.AsyncWith: {
      // Same shape as With; the caller's async function context handles it.
      const items = node.items || [];
      const body = chainStmts((node.body || []).map(stmtBlock).filter(Boolean));
      if (items.length === 0) return rawStmt(astToSource(node));
      const it0 = items[0];
      const expr = exprBlock(it0.context_expr) || rawValueBlock(astToSource(it0.context_expr));
      const name = it0.optional_vars?._kind === K.Name ? it0.optional_vars.id : 'ctx';
      _collectVar(name);
      return mkBlock('py_with', {
        fields: { NAME: 'async ' + name },
        inputs: {
          EXPR: { block: expr },
          ...(body ? { BODY: { block: body } } : {}),
        },
      });
    }

    case K.Match: {
      const subj = exprBlock(node.subject) || rawValueBlock(astToSource(node.subject));
      const caseBlocks = (node.cases || []).map(c => {
        const pattern = astToSource(c.pattern) || '_';
        const guard = c.guard ? (exprBlock(c.guard) || rawValueBlock(astToSource(c.guard))) : null;
        const body = chainStmts((c.body || []).map(stmtBlock).filter(Boolean));
        return mkBlock('py_case', {
          fields: { PATTERN: pattern },
          inputs: {
            ...(guard ? { GUARD: { block: guard } } : {}),
            ...(body ? { BODY: { block: body } } : {}),
          },
        });
      });
      const caseChain = chainStmts(caseBlocks);
      return mkBlock('py_match', {
        inputs: {
          SUBJECT: { block: subj },
          ...(caseChain ? { CASES: { block: caseChain } } : {}),
        },
      });
    }

    case K.FunctionDef:
    case K.AsyncFunctionDef: {
      const body = chainStmts((node.body || []).map(stmtBlock).filter(Boolean));
      // Full-fidelity args rendering: positional, keyword, *args, **kwargs,
      // defaults — all serialized as a single text string that reproduces
      // the signature faithfully. (A future sprint can split this into
      // structured arg blocks.)
      const sig = _renderArgs(node.args || {});
      const decorators = (node.decorator_list || []).map(astToSource).join(',');
      const kind = node._kind === K.AsyncFunctionDef ? 'async def' : 'def';
      const retAnn = node.returns ? astToSource(node.returns) : 'None';
      return mkBlock('py_funcdef', {
        fields: {
          KIND: kind,
          NAME: node.name,
          ARGS: sig,
          RETURN_TYPE: retAnn,
          DECORATORS: decorators,
        },
        inputs: body ? { BODY: { block: body } } : {},
      });
    }

    case K.ClassDef: {
      const body = chainStmts((node.body || []).map(stmtBlock).filter(Boolean));
      // structure_module_def shows class bodies nicely; keep that mapping but
      // also carry base classes in the name field for visibility.
      const bases = (node.bases || []).map(astToSource).join(', ');
      const className = bases ? `${node.name}(${bases})` : node.name;
      return mkBlock('structure_module_def', {
        fields: { NAME: className },
        inputs: body ? { CONTENT: { block: body } } : {},
      });
    }

    case K.Return: {
      // py_return takes a value-block tree; structure_return_typed's math_number
      // slot could not represent call chains or library expressions.
      if (!node.value) return mkBlock('py_return');
      const v = exprBlock(node.value) || rawValueBlock(astToSource(node.value));
      return mkBlock('py_return', { inputs: { VALUE: { block: v } } });
    }

    case K.Yield:
    case K.YieldFrom: {
      const v = node.value ? (exprBlock(node.value) || rawValueBlock(astToSource(node.value))) : null;
      return mkBlock('py_yield', {
        fields: { KIND: node._kind === K.YieldFrom ? 'yield from' : 'yield' },
        inputs: v ? { VALUE: { block: v } } : {},
      });
    }

    case K.Pass:     return rawStmt('pass');
    case K.Break:    return rawStmt('break');
    case K.Continue: return rawStmt('continue');

    default:
      return rawStmt(astToSource(node));
  }
};

/** Fallback for unsupported statement nodes — carries verbatim Python so execution
    behavior is preserved (not downgraded to a comment). */
const rawStmt = (src) => mkBlock('raw_python', { fields: { CODE: src || 'pass' } });

/**
 * Render a Python `arguments` AST node back to the string form used in a def
 * signature (positional, kw-only, *args, **kwargs, defaults, annotations).
 * Faithful reproduction is needed because py_funcdef stores the signature as
 * a single ARGS text field until Sprint-N introduces argument blocks.
 */
const _renderArgs = (a) => {
  if (!a) return '';
  const parts = [];
  const posDefaults = a.defaults || [];
  const args = a.args || [];
  const posonly = a.posonlyargs || [];
  const kwonly = a.kwonlyargs || [];
  const kwDefaults = a.kw_defaults || [];

  const renderArg = (arg, defaultNode) => {
    let s = arg.arg;
    if (arg.annotation) s += `: ${astToSource(arg.annotation)}`;
    if (defaultNode) s += ` = ${astToSource(defaultNode)}`;
    return s;
  };

  // positional-only
  posonly.forEach((arg, i) => {
    const def = posDefaults[i - (posonly.length + args.length - posDefaults.length)];
    parts.push(renderArg(arg, def));
  });
  if (posonly.length > 0) parts.push('/');

  // positional / keyword
  const defaultOffset = posonly.length + args.length - posDefaults.length;
  args.forEach((arg, i) => {
    const defIdx = i + posonly.length - defaultOffset;
    const def = defIdx >= 0 ? posDefaults[defIdx] : null;
    parts.push(renderArg(arg, def));
  });

  // *args
  if (a.vararg) parts.push('*' + renderArg(a.vararg, null));
  else if (kwonly.length > 0) parts.push('*');

  // kw-only
  kwonly.forEach((arg, i) => parts.push(renderArg(arg, kwDefaults[i])));

  // **kwargs
  if (a.kwarg) parts.push('**' + renderArg(a.kwarg, null));

  return parts.join(', ');
};

// ── public: walk the Module AST into a workspace JSON ────────────────────────

/**
 * Convert a CPython AST JSON (from /ast) into a Blockly workspace JSON.
 *
 * Imports / class / function definitions land as top-level blocks.
 * Runnable statements are chained inside an `on_start` hat, placed at the top.
 */
export const astToBlockly = (astJson, { wrapRunnable = true } = {}) => {
  if (!astJson || astJson._kind !== K.Module) return { blocks: { blocks: [] } };

  // Reset per-call state. Registry is rebuilt lazily the first time a call is
  // resolved via librarySchemaRegistry, so newly-installed libraries are picked
  // up without a page reload.
  invalidateSchemaRegistry();
  _COLLECTED_VARS = new Set();

  const imports = [];
  const defs = [];
  const runnable = [];
  const STRUCT_KINDS = new Set([K.Import, K.ImportFrom, K.FunctionDef, K.ClassDef, K.AsyncFunctionDef]);

  for (const stmt of astJson.body || []) {
    // Import: expand "import a, b" into two blocks so each gets its own top-level block
    if (stmt._kind === K.Import) {
      for (const name of stmt.names || []) {
        imports.push(mkBlock('structure_import', {
          fields: { LIBRARY: name.asname ? `${name.name} as ${name.asname}` : name.name }
        }));
      }
      continue;
    }
    if (stmt._kind === K.ImportFrom) {
      const b = stmtBlock(stmt);
      if (b) imports.push(b);
      continue;
    }
    const block = stmtBlock(stmt);
    if (!block) continue;
    if (STRUCT_KINDS.has(stmt._kind)) {
      defs.push(block);
    } else {
      runnable.push(block);
    }
  }

  const result = [];
  imports.forEach(b => result.push(b));
  defs.forEach(b => result.push(b));
  if (runnable.length > 0) {
    if (wrapRunnable) {
      const chain = chainStmts(runnable);
      result.push(mkBlock('on_start', { inputs: chain ? { DO: { block: chain } } : {} }));
    } else {
      runnable.forEach(b => result.push(b));
    }
  }

  // simple vertical layout
  let y = 40;
  result.forEach(b => { b.x = 40; b.y = y; y += 160; });
  // Declare all variables referenced by variables_set / variables_get blocks
  // so Blockly loads them into the workspace's variable map (otherwise block
  // load silently drops them and the Variables category stays empty).
  const variables = [..._COLLECTED_VARS].map(name => ({ name, id: name, type: '' }));

  return {
    blocks: { blocks: result },
    ...(variables.length ? { variables } : {}),
  };
};

/** High-level: Python source → Blockly workspace JSON via the backend AST path. */
export const pythonToBlocksViaAst = async (pythonCode, { wrapRunnable = true } = {}) => {
  try {
    const res = await fetch(`${getBackendBase()}/ast`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: pythonCode }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.ok) return null;
    return astToBlockly(data.ast, { wrapRunnable });
  } catch {
    return null;
  }
};
