import React, { useMemo, useEffect, useRef, useState } from 'react';
import CodeMirror from '@uiw/react-codemirror';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, Decoration } from '@codemirror/view';
import { StateField, StateEffect } from '@codemirror/state';
import { getBackendBase } from '../utils/pythonBackend';
import './PythonEditor.css';

// ── Syntax-error decoration plumbing ─────────────────────────────────────────
// A StateField carries a "which line has a syntax error" value; when it
// changes we paint a red underline on that line.

const setErrorLine = StateEffect.define();

const errorLineField = StateField.define({
  create: () => Decoration.none,
  update(decos, tr) {
    decos = decos.map(tr.changes);
    for (const e of tr.effects) {
      if (e.is(setErrorLine)) {
        const line = e.value;
        if (!line || line < 1) {
          decos = Decoration.none;
        } else {
          try {
            const docLine = tr.state.doc.line(Math.min(line, tr.state.doc.lines));
            decos = Decoration.set([
              Decoration.line({
                attributes: { class: 'cm-error-line', 'data-testid': 'py-error-line' }
              }).range(docLine.from)
            ]);
          } catch {
            decos = Decoration.none;
          }
        }
      }
    }
    return decos;
  },
  provide: f => EditorView.decorations.from(f),
});

// ── Debounced backend syntax check ──────────────────────────────────────────

const checkSyntax = async (code) => {
  try {
    const res = await fetch(`${getBackendBase()}/syntax`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
};

const PythonEditor = ({ code, onChange }) => {
  const viewRef = useRef(null);
  const [status, setStatus] = useState({ ok: true });  // { ok, line?, message? }
  const checkRef = useRef(null);

  const extensions = useMemo(() => [
    python(),
    errorLineField,
    EditorView.lineWrapping,
  ], []);

  // Debounced syntax check: 500ms after user stops typing
  useEffect(() => {
    if (!code) { setStatus({ ok: true }); return; }
    if (checkRef.current) clearTimeout(checkRef.current);
    checkRef.current = setTimeout(async () => {
      const res = await checkSyntax(code);
      if (!res) return;  // backend unreachable — silently skip
      setStatus(res);
      // Paint error line
      if (viewRef.current) {
        viewRef.current.dispatch({ effects: setErrorLine.of(res.ok ? null : (res.line || 0)) });
      }
    }, 500);
    return () => { if (checkRef.current) clearTimeout(checkRef.current); };
  }, [code]);

  return (
    <div className="python-editor-container">
      <CodeMirror
        value={code || ''}
        height="100%"
        theme={oneDark}
        extensions={extensions}
        onChange={(val) => onChange && onChange(val)}
        onCreateEditor={(view) => { viewRef.current = view; }}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLine: true,
          foldGutter: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          tabSize: 4,
          indentOnInput: true,
        }}
        placeholder="# Python — switch to Blocks to generate from visual blocks, or type here."
      />
      <div className={`python-status-bar ${status.ok ? 'ok' : 'err'}`} data-testid="py-status">
        {status.ok
          ? '✓ syntax ok'
          : `✗ line ${status.line || '?'}: ${status.message || 'syntax error'}`}
      </div>
    </div>
  );
};

export default PythonEditor;
