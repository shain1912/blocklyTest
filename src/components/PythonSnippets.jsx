import React, { useState, useCallback, useEffect } from 'react';
import { PYTHON_SNIPPETS } from '../utils/pythonSnippets';
import { getSnippetBlocks } from '../utils/snippetBlocks';
import { getSnippetLibraries } from '../utils/snippetLibraries';
import { installLibrary } from '../utils/libraryManager';
import { installLibraryFromIntrospection } from '../utils/libraryIntrospector';
import { installPackageAndWait, probePackage } from '../utils/pythonBackend';
import './PythonSnippets.css';

/**
 * One-click snippets panel.
 *
 * Click a card → probe which imports are missing → pip install only those →
 * drop the code into the Python editor.  The user then presses ▶ Run.
 *
 * Props:
 *   open (bool), onClose (fn), onLoadCode (fn(code)), onSwitchToPython (fn)
 */
const PythonSnippets = ({ open, onClose, onLoadCode, onSwitchToPython, onToolboxChange }) => {
  const [busyId, setBusyId] = useState(null);
  const [progress, setProgress] = useState({});  // { [id]: { text, isError } }
  const [readyIds, setReadyIds] = useState(new Set());

  // Probe which snippets are already ready (all imports present)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const ready = new Set();
      for (const snip of PYTHON_SNIPPETS) {
        const imports = snip.imports || [];
        if (imports.length === 0) { ready.add(snip.id); continue; }
        const checks = await Promise.all(imports.map(name => probePackage(name)));
        if (cancelled) return;
        if (checks.every(c => c.installed)) ready.add(snip.id);
      }
      if (!cancelled) setReadyIds(ready);
    })();
    return () => { cancelled = true; };
  }, [open]);

  const handleClick = useCallback(async (snippet) => {
    setBusyId(snippet.id);
    setProgress({ [snippet.id]: { text: '' } });

    const appendProgress = (line) => {
      setProgress(prev => ({
        ...prev,
        [snippet.id]: { ...(prev[snippet.id] || {}), text: (prev[snippet.id]?.text || '') + line },
      }));
    };

    try {
      // 1) Figure out which imports are actually missing
      const imports = snippet.imports || [];
      const missing = [];
      for (let i = 0; i < imports.length; i++) {
        const r = await probePackage(imports[i]);
        if (!r.installed) missing.push(snippet.packages[i] || imports[i]);
      }

      if (missing.length === 0) {
        appendProgress('All packages already installed.\n');
      } else {
        appendProgress(`Installing: ${missing.join(', ')}\n`);
        for (const pkg of missing) {
          appendProgress(`→ pip install ${pkg}\n`);
          await installPackageAndWait(pkg, (text) => {
            // Keep only the last line-ish to avoid flooding
            const lastLine = text.trim().split(/\r?\n/).slice(-1)[0] || '';
            if (lastLine) appendProgress('  ' + lastLine + '\n');
          });
          appendProgress(`  ✓ ${pkg} installed\n`);
        }
      }

      // 2) First install the hand-curated block library (semantic names like
      //    cv2_imshow, plt_plot) — these give the cleanest UX for the specific
      //    API surface the snippet demonstrates.
      const libs = getSnippetLibraries(snippet.id);
      for (const libPkg of libs) {
        try {
          installLibrary(libPkg);
          appendProgress(`  ✓ block library '${libPkg.name}' installed\n`);
        } catch (e) {
          appendProgress(`  ✗ block library '${libPkg.name}' failed: ${e.message}\n`);
        }
      }

      // 2b) Layer 2 + 3 — introspect the module and auto-generate blocks for
      //     EVERYTHING the module exposes, not just the hand-picked surface.
      //     This gives pyAst.js's call registry broad coverage so random calls
      //     like cv2.resize / np.zeros / requests.post also become real blocks.
      const toIntrospect = snippet.imports || [];
      for (const mod of toIntrospect) {
        try {
          appendProgress(`  ↻ introspecting ${mod}…\n`);
          // maxItems=800 covers all of cv2 / numpy / pandas; callablesOnly=true
          // means constants don't eat the budget and we actually reach cvtColor,
          // imencode, zeros, DataFrame, read_csv, etc.
          const r = await installLibraryFromIntrospection(mod, {
            maxItems: 800, callablesOnly: true,
          });
          if (r.ok) appendProgress(`  ✓ auto-generated ${r.installed.length} blocks from ${mod}\n`);
          else appendProgress(`  ⚠ introspection of ${mod} failed: ${r.error}\n`);
        } catch (e) {
          appendProgress(`  ⚠ introspection of ${mod} failed: ${e.message}\n`);
        }
      }

      if (onToolboxChange) onToolboxChange();

      // 3) Load code into Python editor
      if (onSwitchToPython) onSwitchToPython();
      if (onLoadCode) onLoadCode(snippet.code);
      appendProgress('Code loaded. Press ▶ Run!\n');
      setReadyIds(prev => new Set(prev).add(snippet.id));
    } catch (e) {
      setProgress(prev => ({
        ...prev,
        [snippet.id]: { text: (prev[snippet.id]?.text || '') + `\nError: ${e.message}\n`, isError: true },
      }));
    } finally {
      setBusyId(null);
    }
  }, [onLoadCode, onSwitchToPython]);

  if (!open) return null;

  return (
    <div className="snippets-panel" data-testid="snippets-panel">
      <div className="snippets-header">
        <div className="snippets-title">
          <span>📋</span>
          <span>Python Snippets</span>
        </div>
        <button className="snippets-close" onClick={onClose} title="Close">✕</button>
      </div>

      <div className="snippets-list">
        {PYTHON_SNIPPETS.map(snip => {
          const ready = readyIds.has(snip.id) && busyId !== snip.id;
          const busy = busyId === snip.id;
          const prog = progress[snip.id];
          return (
            <div key={snip.id} className="snippet-card" data-testid={`snippet-${snip.id}`}>
              <div className="snippet-card-header">
                <div className="snippet-card-icon">{snip.icon}</div>
                <div className="snippet-card-title">{snip.title}</div>
              </div>
              <div className="snippet-card-desc">{snip.description}</div>
              <div className="snippet-card-packages">pip: {snip.packages.join(' ')}</div>
              <button
                className={`snippet-card-btn ${ready ? 'ready' : ''}`}
                disabled={busy}
                onClick={() => handleClick(snip)}
                data-testid={`snippet-btn-${snip.id}`}
              >
                {busy ? 'Installing…' : ready ? '↻ Reload into editor' : '▶ Install & Load'}
              </button>
              {prog?.text && (
                <div className={`snippet-progress ${prog.isError ? 'error' : ''}`}>
                  {prog.text}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="snippets-footer">
        One click installs the pip packages it needs and drops the code into the
        Python editor. Then press ▶ Run.
      </div>
    </div>
  );
};

export default PythonSnippets;
