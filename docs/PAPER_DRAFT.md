# A Bidirectional Python View with Deterministic Library Abstraction for Block-Based Programming

*Working paper draft. Numbers cited inline come from spec files in this repository; anything marked [VERIFY] still needs human confirmation against a fresh run.*

---

## Abstract

Visual block editors such as Scratch [Resnick et al., 2009] and tools built on
Blockly [Fraser, 2015] are excellent on-ramps to programming, but they hit a
hard wall when learners want to use real-world Python libraries: a 1:1 mapping
of `cv2`'s public API alone produces 500 candidate blocks, drowning the
toolbox. At the same time, a free-form "show the Python source" view drifts on
every round-trip through the block representation, breaking the educational
contract that the two views describe the same program. This paper describes
**BlockPy**, a Scratch-style block editor that addresses both problems with
three coordinated contributions. First, a **bidirectional Python view** with
*explicit lossless and regen paths*: untouched user source survives an
unbounded number of toggles byte-identically, while a single normalization
pass after the first user edit drives the system into a fixed point that is
also byte-identical for all subsequent toggles. Second, an **import-as-library
bridge**: dropping an `import cv2` block (or pasting `import cv2` in the
Python view) automatically installs a curated semantic block library, with no
separate UI step. Third, a **deterministic semantic abstraction algorithm**
that introspects an arbitrary Python module via a backend AST service and
clusters its callables by longest common prefix, capping the result at eight
semantic blocks. On `cv2`, this compresses 500 raw callables to 8 blocks
(ratio 0.016, ~63x reduction). We show the same algorithm scales across six
libraries spanning two orders of magnitude in API surface, with no
language-model component.

---

## 1. Introduction

Block-based programming environments succeed because they remove three
classes of error at once: syntactic errors, naming errors, and arity errors.
A learner who drags a `move 10 steps` block has, by construction, written a
syntactically valid call to a function that exists with the right number of
arguments. This guarantee is the heart of the Scratch design philosophy
[Resnick et al., 2009]. As soon as the learner needs to graduate to a real
language ecosystem, the guarantee breaks down. There is no honest way to
expose the surface of `cv2`, `pandas`, or `requests` as Scratch blocks: each
library exposes hundreds of public callables, and a 1:1 toolbox is not a
toolbox but a search problem.

Existing block editors choose one of two unsatisfying answers. Tools like
MakeCode [Microsoft, 2017] curate a small fixed library and forbid
extension; tools like the Pyret block editor [Krishnamurthi et al., 2019]
expose the full text view but accept that toggling between text and blocks
mutates the user's program. Neither is acceptable for a learner who wants
to *see* the Python they are writing and trust that the two views agree.

We argue that the right response is to take both problems seriously at the
system level. Concretely, this paper makes three claims:

1. **Bidirectional Python view stability.** The blocks and Python views can
   round-trip indefinitely without semantic or textual drift, with two
   *named* paths: a *lossless* path for user-authored source and a
   *regen* path for source the user has touched in the block view, the
   latter converging to a normalized fixed point after a single edit.

2. **Import-as-library bridge.** The Python statement `import cv2` is not
   dead syntax in the block environment. The presence of an `import` block
   (or an `import` line in pasted source) is itself the trigger that
   installs the matching curated library; no separate "library manager"
   gesture is required.

3. **Deterministic semantic abstraction.** Arbitrary Python libraries
   reachable via `pip install` can be brought into the block environment
   without manual curation by a single deterministic algorithm:
   introspect, prefix-cluster, cap at eight semantic blocks. The algorithm
   uses no language model and the same code path serves `cv2` (500
   callables) and `subprocess` (12 callables).

Section 2 gives the system architecture; Section 3 details the abstraction
algorithm. Section 4 evaluates with two tables drawn from automated specs
(`abstraction_comparison.spec.js`, `snippet_flow.spec.js`). Sections 5-9
cover implementation, limitations, related work, future work, and
conclusions.

---

## 2. System Architecture

BlockPy is a React/Vite single-page application that embeds a Blockly 12.3
workspace, paired with a small FastAPI Python backend used for two services:
(a) returning a CPython AST for arbitrary user source, and (b) introspecting
arbitrary importable modules at runtime. Everything else - clustering,
schema matching, code generation - runs in the browser.

### 2.1 The pyAst transpiler

`src/utils/pyAst.js` is the Python -> Blockly direction. The browser POSTs
user source to `/ast`, receives the CPython `ast` tree as JSON, and walks
it as a `NodeVisitor`. Statement nodes return Blockly statement-block JSON;
expression nodes return value-block JSON. The visitor is deterministic by
construction: identical input source yields identical workspace JSON.

Three design choices distinguish pyAst from a regex transpiler.

- **Recursive structural fidelity.** Arbitrary nesting (e.g. a `while`
  containing an `if` containing a method call whose argument is a binary
  comparison) is handled by recursive descent, not by pattern matching.
- **An honest fallback.** Anything the visitor does not recognize becomes
  a `raw_python` block carrying the verbatim source slice. We never
  silently drop user code.
- **Schema-driven semantic resolution.** Calls (the most common shape in
  user code) are routed through a pluggable *schema registry* (Section
  2.2) before falling back to the structural `py_call` block.

### 2.2 The library schema registry

`src/utils/librarySchemaRegistry.js` indexes every installed library by the
fully-qualified call path it claims (`cv2.imshow`, `sprite.move`, `np.zeros`,
...). When the AST visitor sees a `Call` node, it asks the registry for the
best matching schema. Schemas score against an observed call along four
dimensions: arity match, required keyword presence, complex-arg fidelity,
and unmapped keyword cost.

The fidelity term is critical. Most library blocks store arguments in TEXT
fields, which collapses any structural value (tuple, list, dict, nested
call) into a string. The registry penalizes a schema by 60 points per
structural argument and 50 points per unmapped keyword. If the resulting
score is non-positive, the matcher returns `null` and the call falls
through to the structural `py_call` block. The user sees a slightly
heavier block but loses no information; this is the *escape hatch*.

Two schema extensions matter for the curated vocabulary:
- `valueInputs`: slots that should receive a real Blockly value-input
  block (a `text` literal, a `math_number`, or a sub-expression) rather
  than a string field. The `say` block's `TEXT` slot is the canonical
  example.
- `staticFields`: fixed field values independent of the call's arguments.
  This is how the single `py_builtin_cast` block represents
  `str(x) / int(x) / float(x) / len(x) / ...` - the schema sets `FUNC='str'`
  for `str`, `FUNC='len'` for `len`, etc.

### 2.3 The vocabulary contract

A workspace is *vocabulary-clean* if every block's type appears in the
toolbox. This is a stronger property than well-formedness: it forbids
"ghost" blocks - block types reachable by transpiling Python but not by
dragging from the toolbox. The contract is checked end-to-end in the
snippet specs (Section 4.2) by comparing
`workspace.getAllBlocks().map(b => b.type)` against
`window.__getToolboxBlockTypes()`.

The escape-hatch blocks (`py_stmt`, `py_call`, `py_attr`, `raw_python`) are
themselves vocabulary-clean: they live in a dedicated "Python" toolbox
category. Their occurrence is *measured* (Section 4.2) but never *banned*,
because banning them would force the transpiler into a worse choice -
silently dropping structure or fabricating fake curated calls.

### 2.4 The regen normalization rule

The bidirectional view distinguishes two states. After the user pastes
Python and toggles to Blocks, the original source is held in a
*pythonAtSnapshot* slot. Toggling back to Python reuses that snapshot
verbatim - the *lossless* path. Once the user touches the workspace
(any block move, drop, or field edit), the snapshot is invalidated and
subsequent Python views are *regenerated* from the workspace by Blockly's
Python generator - the *regen* path.

The regen path normalizes a small number of forms:
- `count += 1` becomes `count = (count + 1)` only if the user has edited;
  the `change_variable` block's generator emits `+=` form when reachable.
  In practice the augmented-assign form is preserved because the visitor
  maps `AugAssign` directly to `change_variable`. (The lingering edge
  case is documented in Section 6.)
- Comparisons like `i > 0` may gain a single set of parentheses on the
  first regen, after which the form is stable.

The contract we promise the user is precise: the regen path is a *fixed
point* function on the (workspace, source) pair. The first invocation
after a workspace edit may move the source through one normalization
step; every subsequent invocation produces the same bytes. There is no
unbounded drift.

### 2.5 The import bridge

`src/utils/importBridge.js` keeps a small registry mapping module names
(and common aliases - `np`, `pd`, `plt`, `st`) to curated library
packages. Two scan paths feed the bridge:

- `scanImportsInPython(source)` parses the source about to be transpiled
  and pre-installs any matching libraries, so that the schema registry
  finds them on the first pass (avoiding a chicken-and-egg with
  `structure_import` blocks).
- `scanImportsInWorkspace(workspace)` walks installed `structure_import`
  blocks after a workspace change and triggers the same install path.

`autoInstallForImports` is idempotent and tolerates unknown module names
gracefully: `import unknown_module` is a no-op rather than an error,
preserving the pillar that the user never sees a hard failure for an
unmapped library.

---

## 3. Library Abstraction Algorithm

The semantic abstraction module `src/utils/librarySemantics.js`
implements a single deterministic clustering pass:

```
clusterIntrospection(items, opts) ->
  1. drop internals (names starting with '_' or '__')
  2. sort remaining items by name (stable lex order)
  3. greedy LCP grouping with prefixMinLength = 4
  4. cap to maxBlocks = 8 by folding the smallest groups into 'misc'
  5. materialize each group as a Blockly block spec
```

### 3.1 Greedy longest-common-prefix grouping

After filtering and sorting, the algorithm walks the items and folds
each into the previous group if `LCP(rep, item) >= prefixMinLength`,
where `rep` is the group's first member. The default
`prefixMinLength = 4` empirically separates `cvtColor` /
`cvtColorTwoPlane` (LCP "cvtCo", folded) from `cvtColor` / `imshow`
(LCP "" -> not folded).

Because the input is sorted, every item's nearest neighbour in name-space
is its previous list neighbour, so a single linear pass finds all
groups. Sorting dominates: total time is O(n log n) on `n` callables.

### 3.2 Capping with a misc bucket

Real libraries (`cv2`: 500 visible callables) produce far more than 8
LCP groups in step 3. Step 4 sorts groups by member count descending,
keeps the top `maxBlocks - 1`, and folds every other group's members
into a single "misc" group. The user sees at most 8 semantic blocks per
library, with a long-tail bucket for rarely-used calls.

### 3.3 Block materialization

Each group becomes one Blockly block. The block carries:
- A label fixed to the group's common prefix (e.g. `cvtCo`).
- A `VARIANT` dropdown enumerating every member's full name, shown only
  when the group has more than one member.
- A small set of fields (default cap `paramFieldCap = 3`) drawn from the
  *canonical* signature - the shortest non-empty parameter list across
  the group's members. Annotation hints (`int`, `float`, `bool`)
  determine whether a field is a number, a boolean dropdown, or text.

The Python generator for a clustered block emits
`moduleName.<variant>(field1, field2, ...)` where `variant` defaults to
the first member of the group.

### 3.4 Optional `valueInputs` / `staticFields` extension

For curated libraries the same block-spec shape accepts two extensions
that the registry honours but the auto-clustering does not yet emit:

- `valueInputs`: declare that a slot is a Blockly value-input rather
  than a text field. The schema matcher then plugs in a real literal
  block (`text`, `math_number`) or a sub-expression.
- `staticFields`: declare that a slot has a fixed value across all
  variants. Used by `py_builtin_cast` to map nine builtins to one block.

These extensions are how `librarySchemaRegistry.findSemanticCall`
preserves structural fidelity while still using a single block per
semantic group.

### 3.5 Complexity

Filtering: O(n). Sorting: O(n log n). Grouping: O(n). Capping: O(g log g)
where g is the number of groups (g <= n). Materialization: O(min(g,
maxBlocks) * paramFieldCap). Total: **O(n log n)**, dominated by sort.
On the 500-callable `cv2` import, the entire pipeline (introspect +
cluster + install) completes in browser-side milliseconds. [VERIFY]

---

## 4. Evaluation

### 4.1 Compression curve across six modules

`tests/e2e/abstraction_comparison.spec.js` runs the introspection +
clustering pipeline against five *uncurated* stdlib modules and
publishes a per-module compression number. We pair those with the
curated `cv2` measurement reported in `DEMO_SCRIPT.md` Act 5 to obtain
Table 1.

**Table 1.** Compression curve. `raw` = number of public callables
returned by `/introspect` with `maxItems=500`. `semantic` = block count
after clustering with `maxBlocks=8`. `ratio = semantic / raw`.

| Module          | Raw  | Semantic | Ratio  | Reduction |
|-----------------|-----:|---------:|-------:|----------:|
| cv2             |  500 |        8 |  0.016 |       63x |
| urllib.request  |   59 |        8 |  0.136 |        7x |
| socket          |   48 |        8 |  0.167 |        6x |
| http.client     |   21 |        8 |  0.381 |        3x |
| argparse        |   13 |        8 |  0.615 |        2x |
| subprocess      |   12 |        8 |  0.667 |        2x |

Two observations follow. First, the larger the library, the more
dramatic the compression - precisely the regime where naive 1:1 mapping
would be most damaging. Second, for libraries already smaller than the
8-block cap (`subprocess`, `argparse`), the algorithm is effectively a
no-op: the cap protects toolbox size but does not over-aggregate small
libraries. The same code path serves both ends of the curve. The
`expectedRaw` thresholds in the spec are conservative lower bounds (30
for `socket`, 20 for `urllib.request`, etc.); the figures above match
the numbers cited in `DEMO_SCRIPT.md` Act 5 and should be re-confirmed
against a current backend run [VERIFY].

### 4.2 Vocabulary audit on five real snippets

`tests/e2e/snippet_flow.spec.js` exercises five realistic snippet cards
end-to-end (load -> install matching curated library -> toggle to
blocks -> audit). For each snippet it asserts (a) zero ghost blocks
(every workspace block type is reachable from the toolbox) and (b)
records the count of escape-hatch blocks (`py_stmt`, `py_call`,
`py_attr`, `raw_python`).

**Table 2.** Vocabulary audit. `total` = total blocks in the workspace
after Python -> Blocks transpile. `escape` = escape-hatch occurrences.
`curated %` = (total - escape) / total.

| Snippet                  | Total | Escape | Curated % |
|--------------------------|------:|-------:|----------:|
| opencv-webcam            |    73 |     15 |       79% |
| streamlit-dashboard      |    92 |    [VERIFY] |  ~71-88%  |
| matplotlib-pandas-excel  |   104 |    [VERIFY] |  ~71-88%  |
| numpy-basics             |    48 |    [VERIFY] |  ~71-88%  |
| requests-api             |    56 |    [VERIFY] |  ~71-88%  |

The `opencv-webcam` row is the canonical demo number from `DEMO_SCRIPT.md`
Act 4: 73 blocks total, 15 escape-hatch (instance-method calls on
returned `VideoCapture` objects, see Section 6), 79% curated. The
remaining four snippets are quoted in `DEMO_SCRIPT.md` as having
"71-88% curated" but each individual count is not pinned in the demo
script and should be read off a fresh test run [VERIFY].

The headline guarantee is the hard one: across all five snippets, the
ghost-block count is zero. Every block on the workspace is something
the user could have produced by dragging from the toolbox. The escape
hatch is honest, but it is not a silent one.

### 4.3 Roundtrip stability assertions

`tests/e2e/multi_roundtrip.spec.js` and `tests/e2e/demo_script.spec.js`
encode the bidirectional-view contract directly:

- **Lossless byte-identity.** For unedited workspaces, three consecutive
  Blocks <-> Python toggles produce exactly the source the user pasted.
- **Regen byte-identity.** After a single workspace edit, three
  consecutive toggles produce the same normalized source on every
  iteration (a fixed point).
- **Vocabulary purity on the demo script.** All seven blocks in the
  Act-1 sample (count = 0; for i in range(3): sprite.move(30); count
  += 1; sprite.say('done')) are curated; the escape-hatch count is
  zero.

Together these three assertions formalise pillar #1.

---

## 5. Implementation Notes

The frontend is React 19 + Vite 7 with a Blockly 12.3.1 workspace. The
backend is FastAPI exposing `/ast`, `/introspect`, `/run`, `/install`,
`/streamlit/run`, `/health`, and a per-session WebSocket for streaming
subprocess output. Python execution is performed by a CPython
subprocess of the uvicorn process, so any package installed in the
backend's environment is importable.

The state-management surface in `App.jsx` is intentionally narrow:
mode (`blocks` | `python`), an autosave debounce of 800 ms, a
*pythonAtSnapshot* slot for the lossless-path contract, and a small
window-global API (`__loadBlockly`, `__loadSnippet`, `__introspect`,
`__cluster`, `__installSemantic`, `__getToolboxBlockTypes`,
`__getInstalledLibraries`) used by the e2e tests to drive the system
without UI clicks.

The `BlocklyEditor` component uses `onCodeChangeRef` and `onMountRef`
ref-based callbacks with empty `useEffect` deps so the workspace is
created once and never disposed on prop changes. React StrictMode's
double-invoke is tolerated because `window.__blocklyWorkspace` is set
inside `onMount` (called by Blockly itself) rather than inside the
React effect.

### Test corpus

The repository ships **23 Playwright e2e spec files containing ~139 test
cases** [VERIFY]. The figure of "147 E2E tests" cited elsewhere in the
project documentation is approximate and should be reconciled to the
exact run count [VERIFY]. Vitest unit tests (`*.test.js`) cover the
transpiler, AST visitor, library manager, and snippets; the README
records 63 unit tests for an earlier sprint snapshot [VERIFY].

---

## 6. Limitations

1. **Augmented-assign normalization paren.** Comparisons inside an
   `AugAssign` body, e.g. `count += (i > 0)`, may pick up a redundant
   pair of parentheses on the first regen pass through `py_binop`. The
   form is stable thereafter. We classify this as cosmetic.
2. **Stdlib import gap.** The `importBridge` registry covers six
   curated libraries (`cv2`, `numpy`, `pandas`, `matplotlib`,
   `streamlit`, `requests`) plus their common aliases, but does not
   currently auto-install for stdlib names like `time`, `os`, or
   `socket`. In the `time.sleep` case behaviour is unaffected because
   the call is matched by the sprite-DSL schema (-> `wait` block); in
   the general stdlib case the call falls to `py_call`.
3. **Escape-hatch occurrences for instance methods.** The
   `opencv-webcam` snippet's 15 escape-hatch blocks (21% of the
   workspace) are dominated by instance-method calls on returned
   objects (`cap.read()`, `cap.release()` on a `VideoCapture` instance
   returned from `cv2.VideoCapture`). The schema registry currently
   keys on the textual call path, not on inferred receiver type, so
   these calls cannot be matched without a flow-sensitive analysis we
   have not yet implemented. We treat this as the principled limit of
   a deterministic, no-LLM design.
4. **Backend dependency for live introspection.** Pillar #3
   demonstrations require the FastAPI backend to be running. When the
   backend is down a "degraded mode" banner appears and pillar #1 / #2
   continue to function via the regex fallback path; pillar #3 is
   skipped (`test.skip(!backendUp, ...)` in the abstraction spec).

---

## 7. Related Work

**Scratch** [Resnick et al., 2009] established the modern block-editor
paradigm: drag-and-drop statement blocks, a stage with sprites, and a
strictly visual surface. Subsequent generations including ScratchJr and
Snap! (BYOB) [Harvey & Mönig, 2010] extended Scratch with first-class
procedures and lambdas but kept the block-only commitment.

**Blockly** [Fraser, 2015] is the open-source library underneath this
work and underneath much of the modern block-editor ecosystem. Blockly
ships its own Python (and JavaScript / Lua / Dart) generators; we use
its Python generator on the regen path but bypass the regex
"transpiler" included in Blockly samples in favour of a real CPython
AST round-trip.

**MakeCode** [Microsoft, 2017] takes the strictest answer to the
library-explosion problem: a curated, hand-authored library surface,
with no extension by the user. The trade-off is reach: MakeCode
projects cannot import arbitrary `pip` packages.

**GP** [Mönig et al., 2015] and **Pencil Code** offer a side-by-side
text-and-blocks view but acknowledge round-trip limitations explicitly,
with documented cases where toggling drops user comments or
re-orders sibling statements.

**Pyret block editor** [Krishnamurthi et al., 2019] is the closest
academic neighbour: it integrates a block view with a text language
designed for teaching. Pyret's blocks/text bridge is bidirectional but
restricted to a custom language; our contribution is to land the same
bridge on a *real* language ecosystem (Python's `pip`).

**Library introspection in IDE settings** has been studied for code
completion (Jedi, Pylance) and for type inference, but to our
knowledge no prior block editor has used live introspection as the
substrate for *block generation*. Our deterministic prefix-clustering
is closest in spirit to API-shape clustering work in
recommender-system literature [VERIFY citations], but does not depend
on a learned model.

(Word budget for this section: ~300 words. Citations are placeholders.)

---

## 8. Future Work

1. **Receiver-type inference for instance methods.** A flow-sensitive
   pass on the AST that identifies the type of a name returned from a
   curated factory (e.g. `cap = cv2.VideoCapture(...)` -> `cap` has
   type `VideoCapture`) would let the schema registry match
   `cap.read()` to a curated `cv2_capture_read` block, eliminating
   most of the residual escape-hatch occurrences in Section 6.
2. **Stdlib auto-mapping.** Extending the bridge registry to cover
   common stdlib modules (`time`, `os`, `pathlib`, `json`,
   `argparse`) without hand-curating each.
3. **User-authored libraries as first-class citizens.** Act 6 of the
   demo script shows a user defining a `Module GameUtils` block and
   exporting it as a library. Persisting these to a backend-side
   package store would let learners share libraries the same way
   they share Scratch projects.
4. **Empirical user study.** The compression and vocabulary numbers
   are objective, but the pedagogical claim - that the bidirectional
   view actually accelerates the transition from blocks to text -
   needs a controlled study against MakeCode and Pyret.
5. **Formal proof of the regen fixed-point property.** Currently
   asserted in tests; could be discharged statically by showing the
   visitor and the Python generator are inverses on a normalised
   block grammar.

---

## 9. Conclusion

Block editors and Python ecosystems have lived in different worlds
because the obvious bridge - one block per library function - is a
non-starter at the scale of `cv2`, `pandas`, or `requests`. We have
shown that all three of (a) a stable bidirectional view, (b) imports
that automatically extend the block vocabulary, and (c) a single
deterministic algorithm that compresses arbitrary libraries to a
human-scannable handful of semantic blocks, can co-exist in one
system. The compression measurements (Table 1) cover two orders of
magnitude in API surface with no language-model component; the
vocabulary audit (Table 2) shows that on real snippet code the
curated vocabulary covers ~79% of authored blocks while the escape
hatch keeps the remaining 21% structurally honest. The contribution
is not any single block, but the *contract* the three pillars
collectively maintain: every block on the workspace is reachable from
the toolbox, every Python source the user pastes is preserved
byte-identically until they edit, and every library is at most eight
clicks wide.

---

## References (placeholders)

- [Resnick et al., 2009] Resnick, M. et al. *Scratch: programming for
  all.* Communications of the ACM, 52(11).
- [Fraser, 2015] Fraser, N. *Ten things we've learned from Blockly.*
  Blocks and Beyond Workshop.
- [Microsoft, 2017] *Microsoft MakeCode.* https://makecode.com.
- [Harvey & Mönig, 2010] Harvey, B. & Mönig, J. *Bringing "No Ceiling"
  to Scratch.* Constructionism.
- [Mönig et al., 2015] Mönig, J. et al. *GP: A general-purpose
  programming language for everyone.* Blocks and Beyond.
- [Krishnamurthi et al., 2019] Krishnamurthi, S. et al. *Pyret.*
  https://www.pyret.org.

---

*Approximate word count: ~3000 (target met). Items marked [VERIFY]
should be reconciled against a fresh test run before submission.*
