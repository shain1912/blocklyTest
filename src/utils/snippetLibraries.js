/**
 * Block libraries paired with each one-click snippet.
 *
 * Each entry is a full Blockly library package (same shape as
 * BUILTIN_LIBRARY_TEMPLATES / AI-generated packages): blocks, Python + JS
 * generators, a dedicated toolbox category. When the user clicks a snippet
 * card we:
 *
 *   1. pip-install the backend Python packages (opencv-python, matplotlib, ...)
 *   2. Blockly-install the matching library below (adds cv2_videoCapture,
 *      cv2_cvtColor, ... blocks to the toolbox and registers generators)
 *   3. Drop the snippet's Python into the editor
 *
 * After step 2, dragging a fresh cv2.imshow onto the workspace from the toolbox
 * "just works" — no AI, no manual py_stmt typing.
 *
 * Convention for generator strings:
 *   - statement blocks return "func(arg)\n"
 *   - value blocks return ["func(arg)", 0]
 *   - field values are read via block.getFieldValue('NAME')
 */

// ── helpers to keep the JSON readable ────────────────────────────────────────

const field = (name, type = 'text_input', defaultValue = '', extra = {}) =>
  ({ name, type, default: defaultValue, ...extra });

const num = (name, def = 0)       => field(name, 'number', def);
const txt = (name, def = '')      => field(name, 'text_input', def);
const dd  = (name, options)       => field(name, 'dropdown', options[0][1], { options });

/** Build a statement block. `reverse` is the call path (e.g. "cv2.imshow") for pyAst.js lookup. */
const stmt = (type, label, fields, pyBody, color, reverse = null) => ({
  type,
  colour: color,
  tooltip: label,
  isStatement: true,
  inputs: [{ kind: 'dummy', fields: [{ type: 'label', label }, ...(fields || [])] }],
  _py: pyBody,
  _reverse: reverse,
});

const value = (type, label, fields, pyBody, color, reverse = null) => ({
  type,
  colour: color,
  tooltip: label,
  isStatement: false,
  inputs: [{ kind: 'dummy', fields: [{ type: 'label', label }, ...(fields || [])] }],
  _py: pyBody,
  _reverse: reverse,
});

/**
 * Build a reverse-pattern entry for pyAst.js: given a block's fields, produce
 * a "fn(a, b, c)" pattern with {FIELD_NAME} placeholders so the AST visitor
 * can recognize a Python call and inflate the right library block.
 *
 * callPath: "cv2.VideoCapture", "st.title", etc. — the fully-qualified callee.
 * fieldNames: the field names in positional-argument order.
 */
const reverseFor = (callPath, fieldNames, blockType) => ({
  python: `${callPath}(${fieldNames.map(f => `{${f}}`).join(', ')})`,
  block: blockType,
});

const compile = (name, description, blocks, toolboxName, color) => {
  const pkg = {
    name,
    version: '1.0.0',
    description,
    author: 'snippet-library',
    colour: color,
    blocks: blocks.map(({ _py, _reverse, ...b }) => b),
    generators: { python: {}, js: {} },
    reversePatterns: [],
    toolboxCategory: {
      kind: 'category',
      name: toolboxName,
      colour: color,
      contents: blocks.map(b => ({ kind: 'block', type: b.type })),
    },
  };
  blocks.forEach(b => {
    pkg.generators.python[b.type] = b._py;
    if (b._reverse) {
      // _reverse is either a string callPath (fieldNames inferred from block fields)
      // or a full { callPath, fieldNames } object for custom cases
      const meta = typeof b._reverse === 'string'
        ? { callPath: b._reverse, fieldNames: (b.inputs[0].fields || []).filter(f => f.name).map(f => f.name) }
        : b._reverse;
      pkg.reversePatterns.push(reverseFor(meta.callPath, meta.fieldNames, b.type));
    }
  });
  // JS generators emit console.log so "Run" in blocks mode doesn't crash;
  // the real execution happens via the Python backend anyway.
  blocks.forEach(b => { pkg.generators.js[b.type] = "return 'console.log(\"[py-lib]\")\\n';"; });
  return pkg;
};

// ── opencv (cv2) library ────────────────────────────────────────────────────

const OPENCV_LIB = compile(
  'opencv-blocks', 'OpenCV capture / color / display / wait-key blocks',
  [
    value('cv2_videoCapture', 'VideoCapture', [num('SOURCE', 0)],
      "const s=block.getFieldValue('SOURCE'); return ['cv2.VideoCapture('+s+')', 0];",
      '#1a5c1a', 'cv2.VideoCapture'),
    value('cv2_cvtColor_gray', 'cvtColor→GRAY', [txt('IMG', 'frame')],
      "const i=block.getFieldValue('IMG'); return ['cv2.cvtColor('+i+', cv2.COLOR_BGR2GRAY)', 0];",
      '#237523'),
    value('cv2_imread', 'imread', [txt('PATH', 'image.png')],
      "const p=block.getFieldValue('PATH'); return ['cv2.imread(\"'+p+'\")', 0];",
      '#237523', 'cv2.imread'),
    stmt('cv2_imshow', 'imshow', [txt('WIN', 'window'), txt('IMG', 'frame')],
      "const w=block.getFieldValue('WIN'),i=block.getFieldValue('IMG'); return 'cv2.imshow(\"'+w+'\", '+i+')\\n';",
      '#237523', 'cv2.imshow'),
    stmt('cv2_imwrite', 'imwrite', [txt('PATH', 'out.png'), txt('IMG', 'frame')],
      "const p=block.getFieldValue('PATH'),i=block.getFieldValue('IMG'); return 'cv2.imwrite(\"'+p+'\", '+i+')\\n';",
      '#237523', 'cv2.imwrite'),
    stmt('cv2_waitKey', 'waitKey', [num('MS', 1)],
      "const m=block.getFieldValue('MS'); return 'cv2.waitKey('+m+')\\n';",
      '#237523', 'cv2.waitKey'),
    stmt('cv2_destroyAll', 'destroyAllWindows', [],
      "return 'cv2.destroyAllWindows()\\n';",
      '#1a5c1a', 'cv2.destroyAllWindows'),
  ],
  '📷 OpenCV', '#1a5c1a',
);

// ── matplotlib library ──────────────────────────────────────────────────────

const MATPLOTLIB_LIB = compile(
  'matplotlib-blocks', 'matplotlib plotting blocks (headless Agg)',
  [
    stmt('plt_use_agg', 'use Agg backend', [],
      "return 'import matplotlib\\nmatplotlib.use(\"Agg\")\\nimport matplotlib.pyplot as plt\\n';",
      '#ff6f3c'),
    stmt('plt_plot', 'plot', [txt('X', 'x'), txt('Y', 'y')],
      "const x=block.getFieldValue('X'),y=block.getFieldValue('Y'); return 'plt.plot('+x+', '+y+')\\n';",
      '#ff6f3c'),
    stmt('plt_title', 'title', [txt('T', 'My chart')],
      "const t=block.getFieldValue('T'); return 'plt.title(\"'+t+'\")\\n';",
      '#ff9f43', 'plt.title'),
    stmt('plt_xlabel', 'xlabel', [txt('T', 'x')],
      "const t=block.getFieldValue('T'); return 'plt.xlabel(\"'+t+'\")\\n';",
      '#ff9f43', 'plt.xlabel'),
    stmt('plt_ylabel', 'ylabel', [txt('T', 'y')],
      "const t=block.getFieldValue('T'); return 'plt.ylabel(\"'+t+'\")\\n';",
      '#ff9f43', 'plt.ylabel'),
    stmt('plt_legend', 'legend', [],
      "return 'plt.legend()\\n';",
      '#ff9f43', 'plt.legend'),
    stmt('plt_save_inline', 'savefig & emit inline PNG', [],
      "return 'import io, base64\\n_buf = io.BytesIO()\\nplt.savefig(_buf, format=\"png\", bbox_inches=\"tight\", dpi=110)\\nprint(\"IMG::\" + base64.b64encode(_buf.getvalue()).decode())\\nplt.close()\\n';",
      '#e65100'),
  ],
  '📊 matplotlib', '#ff6f3c',
);

// ── pandas library ──────────────────────────────────────────────────────────

const PANDAS_LIB = compile(
  'pandas-blocks', 'pandas DataFrame blocks',
  [
    stmt('pd_import', 'import pandas as pd', [],
      "return 'import pandas as pd\\n';",
      '#150458'),
    value('pd_dataframe', 'DataFrame', [txt('DATA', '{"a":[1,2,3]}')],
      "const d=block.getFieldValue('DATA'); return ['pd.DataFrame('+d+')', 0];",
      '#150458'),
    value('pd_read_csv', 'read_csv', [txt('PATH', 'data.csv')],
      "const p=block.getFieldValue('PATH'); return ['pd.read_csv(\"'+p+'\")', 0];",
      '#150458'),
    value('pd_read_excel', 'read_excel', [txt('PATH', 'data.xlsx')],
      "const p=block.getFieldValue('PATH'); return ['pd.read_excel(\"'+p+'\")', 0];",
      '#150458'),
    stmt('pd_to_excel', 'to_excel', [txt('DF', 'df'), txt('PATH', '/tmp/out.xlsx')],
      "const d=block.getFieldValue('DF'),p=block.getFieldValue('PATH'); return d+'.to_excel(\"'+p+'\", index=False)\\n';",
      '#3f3d7d'),
    stmt('pd_print_head', 'print head', [txt('DF', 'df'), num('N', 5)],
      "const d=block.getFieldValue('DF'),n=block.getFieldValue('N'); return 'print('+d+'.head('+n+'))\\n';",
      '#3f3d7d'),
  ],
  '🐼 pandas', '#150458',
);

// ── streamlit library ──────────────────────────────────────────────────────

const STREAMLIT_LIB = compile(
  'streamlit-blocks', 'Streamlit web UI widget blocks',
  [
    stmt('st_import', 'import streamlit as st', [],
      "return 'import streamlit as st\\n';",
      '#ff4b4b'),
    stmt('st_title', 'title', [txt('T', 'My App')],
      "const t=block.getFieldValue('T'); return 'st.title(\"'+t+'\")\\n';",
      '#ff4b4b', 'st.title'),
    stmt('st_header', 'header', [txt('T', 'Section')],
      "const t=block.getFieldValue('T'); return 'st.header(\"'+t+'\")\\n';",
      '#ff4b4b', 'st.header'),
    stmt('st_write', 'write', [txt('T', 'Hello!')],
      "const t=block.getFieldValue('T'); return 'st.write(\"'+t+'\")\\n';",
      '#ff4b4b', 'st.write'),
    stmt('st_markdown', 'markdown', [txt('T', '**bold**')],
      "const t=block.getFieldValue('T'); return 'st.markdown(\"'+t+'\")\\n';",
      '#ff4b4b', 'st.markdown'),
    stmt('st_text_input', 'x = text_input', [txt('VAR', 'name'), txt('LABEL', 'Your name')],
      "const v=block.getFieldValue('VAR'),l=block.getFieldValue('LABEL'); return v+' = st.text_input(\"'+l+'\")\\n';",
      '#e03c3c'),
    stmt('st_number_input', 'x = number_input', [txt('VAR', 'n'), txt('LABEL', 'How many'), num('DEF', 0)],
      "const v=block.getFieldValue('VAR'),l=block.getFieldValue('LABEL'),d=block.getFieldValue('DEF'); return v+' = st.number_input(\"'+l+'\", value='+d+')\\n';",
      '#e03c3c'),
    stmt('st_slider', 'x = slider', [txt('VAR', 'n'), txt('LABEL', 'pick'), num('MIN', 0), num('MAX', 100), num('DEF', 50)],
      "const v=block.getFieldValue('VAR'),l=block.getFieldValue('LABEL'),a=block.getFieldValue('MIN'),b=block.getFieldValue('MAX'),d=block.getFieldValue('DEF'); return v+' = st.slider(\"'+l+'\", '+a+', '+b+', '+d+')\\n';",
      '#e03c3c'),
    stmt('st_button', 'x = button', [txt('VAR', 'clicked'), txt('LABEL', 'Submit')],
      "const v=block.getFieldValue('VAR'),l=block.getFieldValue('LABEL'); return v+' = st.button(\"'+l+'\")\\n';",
      '#c73c3c'),
    stmt('st_line_chart', 'line_chart', [txt('DATA', 'df')],
      "const d=block.getFieldValue('DATA'); return 'st.line_chart('+d+')\\n';",
      '#c73c3c'),
    stmt('st_dataframe', 'dataframe', [txt('DATA', 'df')],
      "const d=block.getFieldValue('DATA'); return 'st.dataframe('+d+')\\n';",
      '#c73c3c'),
  ],
  '🚀 Streamlit', '#ff4b4b',
);

// ── numpy library ───────────────────────────────────────────────────────────

const NUMPY_LIB = compile(
  'numpy-blocks', 'numpy array / math blocks',
  [
    stmt('np_import', 'import numpy as np', [],
      "return 'import numpy as np\\n';",
      '#4dabcf'),
    value('np_array', 'array', [txt('DATA', '[1, 2, 3]')],
      "const d=block.getFieldValue('DATA'); return ['np.array('+d+')', 0];",
      '#4dabcf', 'np.array'),
    value('np_zeros', 'zeros', [txt('SHAPE', '(3, 3)')],
      "const s=block.getFieldValue('SHAPE'); return ['np.zeros('+s+')', 0];",
      '#4dabcf', 'np.zeros'),
    value('np_arange', 'arange', [num('N', 10)],
      "const n=block.getFieldValue('N'); return ['np.arange('+n+')', 0];",
      '#4dabcf', 'np.arange'),
    value('np_mean', 'mean', [txt('A', 'arr')],
      "const a=block.getFieldValue('A'); return ['np.mean('+a+')', 0];",
      '#2e89b8', 'np.mean'),
    value('np_sum', 'sum', [txt('A', 'arr')],
      "const a=block.getFieldValue('A'); return ['np.sum('+a+')', 0];",
      '#2e89b8', 'np.sum'),
    value('np_det', 'linalg.det', [txt('A', 'A')],
      "const a=block.getFieldValue('A'); return ['np.linalg.det('+a+')', 0];",
      '#2e89b8', 'np.linalg.det'),
    value('np_eigvals', 'linalg.eigvals', [txt('A', 'A')],
      "const a=block.getFieldValue('A'); return ['np.linalg.eigvals('+a+')', 0];",
      '#2e89b8', 'np.linalg.eigvals'),
  ],
  '🔢 numpy', '#4dabcf',
);

// ── requests library ────────────────────────────────────────────────────────

const REQUESTS_LIB = compile(
  'requests-blocks', 'HTTP request blocks',
  [
    stmt('req_import', 'import requests', [],
      "return 'import requests\\n';",
      '#2e7d32'),
    value('req_get', 'requests.get', [txt('URL', 'https://example.com')],
      "const u=block.getFieldValue('URL'); return ['requests.get(\"'+u+'\")', 0];",
      '#2e7d32'),
    value('req_post', 'requests.post', [txt('URL', 'https://example.com')],
      "const u=block.getFieldValue('URL'); return ['requests.post(\"'+u+'\")', 0];",
      '#2e7d32'),
    value('req_status', '.status_code', [txt('R', 'r')],
      "const r=block.getFieldValue('R'); return [r+'.status_code', 0];",
      '#388e3c'),
    value('req_json', '.json()', [txt('R', 'r')],
      "const r=block.getFieldValue('R'); return [r+'.json()', 0];",
      '#388e3c'),
    stmt('req_raise', 'raise_for_status', [txt('R', 'r')],
      "const r=block.getFieldValue('R'); return r+'.raise_for_status()\\n';",
      '#2e7d32'),
  ],
  '🌐 requests', '#2e7d32',
);

// ── per-snippet mapping ─────────────────────────────────────────────────────

// Re-export individual libraries so the import → library bridge can map
// Python module names to specific specs without going through snippet IDs.
export {
  OPENCV_LIB,
  MATPLOTLIB_LIB,
  PANDAS_LIB,
  STREAMLIT_LIB,
  NUMPY_LIB,
  REQUESTS_LIB,
};

export const SNIPPET_LIBRARIES = {
  'opencv-webcam':            [OPENCV_LIB, NUMPY_LIB],
  'matplotlib-pandas-excel':  [MATPLOTLIB_LIB, PANDAS_LIB, NUMPY_LIB],
  'streamlit-dashboard':      [STREAMLIT_LIB, PANDAS_LIB, NUMPY_LIB],
  'requests-api':             [REQUESTS_LIB],
  'numpy-basics':             [NUMPY_LIB],
};

export const getSnippetLibraries = (snippetId) => SNIPPET_LIBRARIES[snippetId] || [];
