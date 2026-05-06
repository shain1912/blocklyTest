/**
 * Hand-built Blockly workspace JSON for each one-click snippet.
 *
 * Why: the Python→Blocks transpiler can only meaningfully represent sprite-style
 * code. When a snippet uses real Python libraries (cv2, matplotlib, streamlit),
 * the transpiler either stuffs expressions into text fields (not composable) or
 * loses imports entirely. Shipping a pre-built block tree gives the user a
 * proper composable visual representation they can actually rearrange.
 *
 * Building blocks used:
 *   structure_import    — import <LIBRARY>
 *   py_assign           — set NAME = <value-block>  (composable RHS)
 *   py_call             — call-as-expression (output), has up to 4 value-input args
 *   py_stmt             — call-as-statement, has up to 4 value-input args
 *   py_getvar           — read a variable as a value
 *   text                — string literal (built-in from blockly/blocks)
 *   math_number         — number literal (built-in)
 *   repeat / loop_forever / if / if_else / on_start  — from customBlocks
 */

// ── tiny DSL: keep the JSON readable ─────────────────────────────────────────

const b = (type, opts = {}) => ({ kind: 'block', type, fields: {}, inputs: {}, next: null, ...opts });

/** Chain a list of statement blocks with .next */
const chain = (blocks) => {
  if (!blocks || blocks.length === 0) return null;
  const head = { ...blocks[0], next: null };
  let cur = head;
  for (let i = 1; i < blocks.length; i++) {
    const nb = { ...blocks[i], next: null };
    cur.next = { block: nb };
    cur = nb;
  }
  return head;
};

const text = (t) => b('text', { fields: { TEXT: t } });
const num  = (n) => b('math_number', { fields: { NUM: n } });
const V    = (name) => b('py_getvar', { fields: { VAR_NAME: name } });

/** Helper: build a py_call / py_stmt from a function name and list of arg blocks */
const call = (fn, args = [], isStmt = false) => {
  const inputs = {};
  args.slice(0, 4).forEach((a, i) => { inputs[`ARG${i}`] = { block: a }; });
  return b(isStmt ? 'py_stmt' : 'py_call', { fields: { FUNC: fn }, inputs });
};
const stmt = (fn, args = []) => call(fn, args, true);

const assign = (varName, valueBlock) =>
  b('py_assign', { fields: { VAR_NAME: varName }, inputs: { VALUE: { block: valueBlock } } });

const importLib = (lib) => b('structure_import', { fields: { LIBRARY: lib } });

const onStart = (stmts) => {
  const head = chain(stmts);
  return b('on_start', { inputs: head ? { DO: { block: head } } : {} });
};

const wrap = (imports, runnable) => {
  const blocks = [];
  let y = 40;
  imports.forEach(imp => { blocks.push({ ...imp, x: 40, y }); y += 80; });
  if (runnable) blocks.push({ ...onStart(runnable), x: 40, y });
  return { blocks: { blocks } };
};

// ── snippet workspace definitions ────────────────────────────────────────────

export const SNIPPET_BLOCKS = {

  'numpy-basics': wrap(
    [importLib('numpy')],
    [
      // A = np.array([[4,2,1],[2,5,3],[1,3,6]])
      assign('A', call('numpy.array', [text('[[4,2,1],[2,5,3],[1,3,6]]')])),
      // print("matrix A:")
      stmt('print', [text('matrix A:')]),
      // print(A)
      stmt('print', [V('A')]),
      // print("det =", np.linalg.det(A))
      stmt('print', [text('det ='), call('numpy.linalg.det', [V('A')])]),
      // print("eigenvalues:", np.linalg.eigvals(A))
      stmt('print', [text('eigenvalues:'), call('numpy.linalg.eigvals', [V('A')])]),
    ]
  ),

  'opencv-webcam': wrap(
    [importLib('cv2'), importLib('numpy'), importLib('base64')],
    [
      // cap = cv2.VideoCapture(0)
      assign('cap', call('cv2.VideoCapture', [num(0)])),
      // ok, frame = cap.read()  — the assign-to-tuple case isn't a single block;
      // we model it as "frame = cap.read()" + comment about the ok flag.
      assign('frame', call('cap.read', [])),
      // gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
      assign('gray', call('cv2.cvtColor', [V('frame'), V('cv2.COLOR_BGR2GRAY')])),
      // print("captured shape:", frame.shape)
      stmt('print', [text('captured shape:'), call('getattr', [V('frame'), text('shape')])]),
      // cv2.imshow handled as a py_stmt to show composability
      stmt('cv2.imshow', [text('Gray'), V('gray')]),
      // cap.release()
      stmt('cap.release', []),
    ]
  ),

  'matplotlib-pandas-excel': wrap(
    [importLib('matplotlib'), importLib('pandas'), importLib('io'), importLib('base64')],
    [
      // df = pd.DataFrame({...})
      assign('df', call('pandas.DataFrame', [
        text('{"month": ["Jan","Feb","Mar"], "sales": [120, 135, 98]}'),
      ])),
      // df.to_excel("sales.xlsx", index=False)
      stmt('df.to_excel', [text('/tmp/sales.xlsx'), text('index=False')]),
      // back = pd.read_excel("sales.xlsx")
      assign('back', call('pandas.read_excel', [text('/tmp/sales.xlsx')])),
      // print(back)
      stmt('print', [V('back')]),
      // fig, ax = plt.subplots()   — represented as one assignment to fig
      assign('fig', call('matplotlib.pyplot.subplots', [])),
      // ax.plot(df["month"], df["sales"], marker="o")
      stmt('ax.plot', [
        call('df.__getitem__', [text('month')]),
        call('df.__getitem__', [text('sales')]),
      ]),
      // plt.savefig → caller handles base64 emit
    ]
  ),

  'streamlit-dashboard': wrap(
    [importLib('streamlit'), importLib('pandas'), importLib('numpy')],
    [
      // st.title("Mini Dashboard")
      stmt('streamlit.title', [text('📈 Mini Dashboard')]),
      // st.write("This whole UI is generated from Python.")
      stmt('streamlit.write', [text('This whole UI is generated from Python.')]),
      // n = st.slider("How many points?", 10, 500, 100)
      assign('n', call('streamlit.slider', [text('How many points?'), num(10), num(500), num(100)])),
      // seed = st.number_input("Random seed", value=42)
      assign('seed', call('streamlit.number_input', [text('Random seed'), text('value=42')])),
      // df = ... (omitted for brevity; the user sees the Python source alongside)
      // st.line_chart(df)
      stmt('streamlit.line_chart', [V('df')]),
      // if st.button("Show raw data"): st.dataframe(df)
      b('if', {
        fields: { CONDITION: 'st.button("Show raw data")' },
        inputs: { DO: { block: stmt('streamlit.dataframe', [V('df')]) } },
      }),
    ]
  ),

  'requests-api': wrap(
    [importLib('requests'), importLib('json')],
    [
      // r = requests.get("https://jsonplaceholder.typicode.com/posts")
      assign('r', call('requests.get', [text('https://jsonplaceholder.typicode.com/posts')])),
      // r.raise_for_status()
      stmt('r.raise_for_status', []),
      // posts = r.json()
      assign('posts', call('r.json', [])),
      // print("status:", r.status_code, "received", len(posts), "posts")
      stmt('print', [text('status:'), V('r.status_code'), text('received'), call('len', [V('posts')])]),
      // Iteration: modelled as a repeat(3) block printing posts[0..2]
      b('repeat', {
        fields: { TIMES: '3' },
        inputs: { DO: { block: stmt('print', [text('see Python view for loop body')]) } },
      }),
    ]
  ),
};

export const getSnippetBlocks = (snippetId) => SNIPPET_BLOCKS[snippetId] || null;
