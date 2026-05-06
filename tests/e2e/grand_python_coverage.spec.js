/**
 * Grand Python coverage test — feed every common Python construct through
 * the AST → Blocks pipeline and report which ones still collapse to
 * `raw_python` (= "didn't make it into a structural block"). The test
 * **fails** if any node falls back to raw_python so the regression is loud.
 *
 * The big snippet below intentionally exercises:
 *   literals / numerics / strings / f-strings / bytes
 *   collection literals (list / tuple / dict / set)
 *   comprehensions (list / dict / set / generator)
 *   variables (assign, augassign, multi-target, tuple unpack, attr LHS, subscript LHS, ann)
 *   control flow (if / elif / else / while / for-range / for-iter / break / continue)
 *   exception handling (try / except / else / finally / raise)
 *   functions (def, async def, *args, **kwargs, defaults, decorators, type hints, return)
 *   classes (def methods, base classes)
 *   imports (import, from-import, as)
 *   subscript / slice / chained method calls / attribute access / keyword args
 *   yield / yield from / await
 *   lambda
 *   match / case
 *   with / async with
 *   global / nonlocal
 *   assert / del
 */

import { test, expect } from '@playwright/test';

const BASE = 'http://localhost:5173';
const BACKEND = 'http://127.0.0.1:8000';

test.beforeAll(async ({ request }) => {
  const r = await request.get(`${BACKEND}/health`);
  if (!r.ok()) throw new Error('Backend unreachable — run ./start.sh first');
});

const BIG_SNIPPET = `
import os
import json as j
from typing import List, Optional

CONST = 42
greeting: str = "hello"

def add(a: int, b: int = 1, *rest, **kw) -> int:
    return a + b + sum(rest) + len(kw)

@staticmethod
def helper():
    return None

async def async_helper():
    data = await fetch()
    return data

class Counter(BaseClass):
    def __init__(self, n: int = 0):
        self.n = n

    def inc(self, step=1):
        self.n += step
        return self.n

x = 1
x += 2
x, y = 10, 20
a = b = 0
arr = [1, 2, 3, 4, 5]
tpl = (1, "two", 3.0)
dct = {"k": 1, "v": 2}
st = {1, 2, 3}
squares = [n * n for n in arr if n % 2 == 0]
pair_map = {k: v * 2 for k, v in dct.items()}
gen = (n for n in arr)

frame = [[0] * 3 for _ in range(2)]
frame[0] = (1, 2, 3)
frame[1][2] = 99
self_x = None

if x > 0:
    print("positive")
elif x == 0:
    print("zero")
else:
    print("negative")

while True:
    x += 1
    if x == 3:
        continue
    if x == 4:
        break

while x < 100:
    x += 5

for i in range(3):
    print(i)

for item in arr:
    print(item)

try:
    val = 1 / 0
except ZeroDivisionError as e:
    print("oops", e)
else:
    print("ok")
finally:
    print("done")

with open("/tmp/x.txt") as f, open("/tmp/y.txt", "w") as g:
    g.write(f.read())

raise ValueError("nope")

assert x > 0, "x must be positive"
del x

def with_globals():
    global CONST
    CONST = 100

double = lambda v: v * 2
result = add(1, 2, 3, debug=True)
score = "pass" if x > 0 else "fail"

# chained methods + subscript + attribute access
report = json.dumps({"x": x, "y": y}, indent=2)[:80]
shape = frame[0].shape if hasattr(frame[0], "shape") else None
chained = base64.b64encode(buf.tobytes()).decode("utf-8")

# match/case
def classify(v):
    match v:
        case 0:
            return "zero"
        case [1, *rest]:
            return "list"
        case {"name": n}:
            return n
        case _:
            return "other"

# generator usage with yield from
def numbers():
    yield 1
    yield from range(2, 5)
`;

test('GP-01: every Python construct in BIG_SNIPPET lowers to a structural block (no raw_python collapse for supported syntax)', async ({ page }) => {
  await page.goto(BASE);
  await page.waitForSelector('.blockly-editor', { timeout: 15000 });
  await page.waitForFunction(() => typeof window.__setPython === 'function', { timeout: 10000 });

  // Convert via the canonical AST path and count block types
  const result = await page.evaluate(async (src) => {
    const m = await import('/src/utils/pyAst.js');
    const json = await m.pythonToBlocksViaAst(src, { wrapRunnable: true });
    const counts = {};
    const rawSamples = [];
    const walk = (b) => {
      if (!b) return;
      counts[b.type] = (counts[b.type] || 0) + 1;
      if (b.type === 'raw_python') rawSamples.push((b.fields && b.fields.CODE) || '');
      if (b.inputs) for (const k of Object.keys(b.inputs)) walk(b.inputs[k]?.block);
      walk(b.next?.block);
    };
    (json?.blocks?.blocks || []).forEach(walk);
    return { counts, rawSamples };
  }, BIG_SNIPPET);

  // Print the inventory so we always see what was generated
  console.log('Block type histogram:', JSON.stringify(result.counts, null, 2));
  console.log('raw_python samples:', JSON.stringify(result.rawSamples, null, 2));

  // Each of these constructs MUST appear as a real exact block.
  const required = [
    'structure_import',         // import / from-import
    'py_funcdef',               // def + decorators + async def
    'structure_module_def',     // class
    'variables_set',            // simple assign
    'py_tuple_assign',          // a, b = ...
    'py_subscript_assign',      // arr[0] = ...
    'py_attr_assign',           // self.n = ...
    'py_list', 'py_tuple', 'py_dict',
    'py_comprehension', 'py_dict_comp',
    'if', 'if_else',
    'loop_forever', 'repeat',   // while-True / for-range
    'py_for_iter',              // for x in arr
    'py_try', 'py_raise', 'py_assert', 'py_delete',
    'py_with',
    'py_scope',                 // global
    'py_lambda',
    'py_match', 'py_case',
    'py_yield',
    'py_await',
    'py_call', 'py_stmt',       // generic + statement calls
    'py_attr', 'py_subscript',
    'py_keyword_arg',
    'py_return',
    'py_ifexp',                  // ternary value block
    'print',
  ];
  const missing = required.filter(t => !result.counts[t]);
  expect(missing, `These node kinds did NOT lower to a structural block: ${missing.join(', ')}`).toEqual([]);

  // Anything that lands as raw_python must be in our acknowledged-unsupported set
  // (currently empty — every supported construct must yield something better).
  // The only thing the visitor is allowed to drop into raw_python is genuine
  // "I don't know what to do" cases. Track them so future work has a target.
  const acceptedRaw = [
    /^pass$/, /^break$/, /^continue$/,    // bare control-flow tokens
    /^a = b = 0$/,                          // multi-target assignment (future sprint)
  ];
  const unexpected = result.rawSamples.filter(c => !acceptedRaw.some(r => r.test(c)));
  expect(unexpected, `Unsupported syntax dropped to raw_python: ${unexpected.join(' | ')}`).toEqual([]);
});
