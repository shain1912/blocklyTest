/**
 * Import → Library bridge.
 *
 * Demo Pillar #2 ("import 갈길 잃음" 해결): when a `structure_import` block
 * appears (user drag, Python→Blocks transpile, or programmatic load), look
 * up the imported module name in a curated registry and dynamically install
 * the matching block library. After install, `cv2.imshow`/`np.zeros`/etc.
 * are available as semantic blocks in the toolbox — without this bridge an
 * import block is just dead syntax.
 */

import {
  OPENCV_LIB, MATPLOTLIB_LIB, PANDAS_LIB,
  STREAMLIT_LIB, NUMPY_LIB, REQUESTS_LIB,
} from './snippetLibraries';
import { installLibrary, getInstalledLibraries } from './libraryManager';

// Python module name → list of curated library specs.
// Aliases (np / pd / plt / st) cover common `import X as Y` flows.
const REGISTRY = {
  cv2:                  [OPENCV_LIB],
  'opencv-python':      [OPENCV_LIB],
  numpy:                [NUMPY_LIB],
  np:                   [NUMPY_LIB],
  pandas:               [PANDAS_LIB],
  pd:                   [PANDAS_LIB],
  matplotlib:           [MATPLOTLIB_LIB],
  'matplotlib.pyplot':  [MATPLOTLIB_LIB],
  plt:                  [MATPLOTLIB_LIB],
  pyplot:               [MATPLOTLIB_LIB],
  streamlit:            [STREAMLIT_LIB],
  st:                   [STREAMLIT_LIB],
  requests:             [REQUESTS_LIB],
};

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

export const KNOWN_IMPORT_MODULES = Object.freeze(Object.keys(REGISTRY));

export function librariesForImport(rawName) {
  if (!rawName || typeof rawName !== 'string') return [];
  // pyAst.js encodes ImportFrom as "module (a, b, c)" — strip the alias list
  // so we match on the bare module name.
  const key = rawName.trim().split(/\s+/)[0].replace(/[(),]/g, '');
  return REGISTRY[key] || [];
}

/**
 * Install every curated library matching the given module names that isn't
 * already installed. Idempotent: safe to call on every workspace change.
 * Returns the list of newly-installed packages so callers can decide whether
 * to bump the toolbox version.
 */
export function autoInstallForImports(moduleNames) {
  const installedNames = new Set(getInstalledLibraries().map(p => p.name));
  const newlyInstalled = [];
  const seen = new Set();
  for (const m of moduleNames) {
    const libs = librariesForImport(m);
    for (const lib of libs) {
      if (installedNames.has(lib.name) || seen.has(lib.name)) continue;
      seen.add(lib.name);
      try {
        installLibrary(lib);
        installedNames.add(lib.name);
        newlyInstalled.push(lib);
      } catch (e) {
        // Don't let a bad library spec crash the editor; surface but continue.
        // eslint-disable-next-line no-console
        console.warn('[importBridge] failed to install', lib.name, e);
      }
    }
  }
  return newlyInstalled;
}

/**
 * Walk a Blockly workspace and collect every LIBRARY field value from
 * structure_import blocks. Returns an array of bare module names.
 */
export function scanImportsInWorkspace(workspace) {
  if (!workspace || typeof workspace.getAllBlocks !== 'function') return [];
  const out = [];
  for (const b of workspace.getAllBlocks(false)) {
    if (b.type === 'structure_import') {
      const v = b.getFieldValue && b.getFieldValue('LIBRARY');
      if (v) out.push(v);
    }
  }
  return out;
}

/**
 * Convenience: scan + install. Returns newly installed packages (possibly empty).
 */
export function syncImportsForWorkspace(workspace) {
  return autoInstallForImports(scanImportsInWorkspace(workspace));
}

/**
 * Scan a Python source string for `import X` / `from X import ...` lines and
 * return the bare module names. Used to install bridge libraries BEFORE
 * pyAst transpiles, so its schema-registry lookup finds the library on the
 * very first pass (no chicken-and-egg with structure_import blocks).
 */
export function scanImportsInPython(source) {
  if (!source || typeof source !== 'string') return [];
  const out = [];
  const re = /^\s*(?:from\s+([\w.]+)|import\s+([\w.]+(?:\s*,\s*[\w.]+)*))/gm;
  let m;
  while ((m = re.exec(source)) !== null) {
    const tail = m[1] || m[2];
    for (const part of tail.split(',')) {
      const name = part.trim().split(/\s+as\s+/)[0];
      if (name) out.push(name);
    }
  }
  return out;
}

/**
 * Pre-flight: given Python source about to be transpiled, install any
 * curated libraries whose modules appear in import statements. Returns
 * the list of newly installed packages (the caller should bump the toolbox
 * version if it's non-empty).
 */
export function syncImportsForPythonSource(source) {
  return autoInstallForImports(scanImportsInPython(source));
}
