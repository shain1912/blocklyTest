/**
 * Client for the FastAPI Python backend.
 *
 *   runPython(code, handlers) → returns a controller with stop()
 *
 * handlers:
 *   onStdout(text) / onStderr(text) — partial text as it streams
 *   onEvent({ type, ... })         — connected | ping | exit | done | error
 *   onError(err)                   — transport-level error
 */

const DEFAULT_BASE = (import.meta.env.VITE_PYTHON_BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

export const getBackendBase = () => DEFAULT_BASE;

const httpBase = () => DEFAULT_BASE;
const wsBase = () => DEFAULT_BASE.replace(/^http/, 'ws');

export const checkHealth = async () => {
  try {
    const res = await fetch(`${httpBase()}/health`);
    if (!res.ok) return { ok: false };
    return await res.json();
  } catch (e) {
    return { ok: false, error: e.message };
  }
};

const openSessionSocket = (sessionId, handlers) => {
  const ws = new WebSocket(`${wsBase()}/ws/${sessionId}`);
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    const { stream, data } = msg;
    if (stream === 'stdout' && handlers.onStdout) handlers.onStdout(data);
    else if (stream === 'stderr' && handlers.onStderr) handlers.onStderr(data);
    else if (stream === 'event' && handlers.onEvent) handlers.onEvent(data || {});
  };
  ws.onerror = (e) => { if (handlers.onError) handlers.onError(e); };
  return ws;
};

/**
 * Start a python subprocess and stream its output.
 * Returns { sessionId, stop } once the subprocess is spawned.
 */
export const runPython = async (code, handlers = {}) => {
  const res = await fetch(`${httpBase()}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(`/run failed: ${res.status} ${await res.text()}`);
  const { session_id: sessionId } = await res.json();
  const ws = openSessionSocket(sessionId, handlers);
  const stop = async () => {
    try { await fetch(`${httpBase()}/stop/${sessionId}`, { method: 'POST' }); } catch {}
    try { ws.close(); } catch {}
  };
  return { sessionId, stop, socket: ws };
};

/**
 * pip install a package. Returns { sessionId, stop }.
 */
export const installPackage = async (pkg, handlers = {}) => {
  const res = await fetch(`${httpBase()}/install`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ package: pkg }),
  });
  if (!res.ok) throw new Error(`/install failed: ${res.status} ${await res.text()}`);
  const { session_id: sessionId } = await res.json();
  const ws = openSessionSocket(sessionId, handlers);
  return { sessionId, stop: async () => {
    try { await fetch(`${httpBase()}/stop/${sessionId}`, { method: 'POST' }); } catch {}
    try { ws.close(); } catch {}
  } };
};

/**
 * Launch a streamlit app. Returns { sessionId, port, url, stop }.
 */
export const runStreamlit = async (code, handlers = {}) => {
  const res = await fetch(`${httpBase()}/streamlit/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (!res.ok) throw new Error(`/streamlit/run failed: ${res.status} ${await res.text()}`);
  const { session_id: sessionId, port, url } = await res.json();
  const ws = openSessionSocket(sessionId, handlers);
  return {
    sessionId, port, url,
    stop: async () => {
      try { await fetch(`${httpBase()}/stop/${sessionId}`, { method: 'POST' }); } catch {}
      try { ws.close(); } catch {}
    }
  };
};

/**
 * Detect whether the code looks like a streamlit app.
 */
export const isStreamlitCode = (code) => /^\s*import\s+streamlit\b|\bfrom\s+streamlit\b|\bst\.[a-z_]+\(/m.test(code);

/**
 * pip install, returning a promise that resolves when the subprocess exits.
 * onLine is called for each stdout / stderr chunk (for progress display).
 */
export const installPackageAndWait = (pkg, onLine) => new Promise((resolve, reject) => {
  const handlers = {
    onStdout: (text) => { if (onLine) onLine(text, 'stdout'); },
    onStderr: (text) => { if (onLine) onLine(text, 'stderr'); },
    onEvent: (evt) => {
      if (evt.type === 'done' || evt.type === 'exit') {
        if (evt.code === 0) resolve({ ok: true, code: evt.code });
        else reject(new Error(`pip install ${pkg} exited with code ${evt.code}`));
      } else if (evt.type === 'error') {
        reject(new Error(evt.message || 'install error'));
      }
    },
    onError: (e) => reject(e instanceof Error ? e : new Error(String(e))),
  };
  installPackage(pkg, handlers).catch(reject);
});

/**
 * Check whether a module is already importable in the backend python env.
 * Returns { installed: bool, version?: string }.
 */
export const probePackage = async (importName) => {
  const res = await fetch(`${httpBase()}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: `import ${importName}\nprint(getattr(${importName}, "__version__", "unknown"))`,
    }),
  });
  if (!res.ok) return { installed: false };
  const { session_id: sessionId } = await res.json();
  return new Promise((resolve) => {
    let out = '';
    const ws = new WebSocket(`${wsBase()}/ws/${sessionId}`);
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.stream === 'stdout') out += msg.data;
      if (msg.stream === 'event' && msg.data?.type === 'done') {
        resolve({ installed: msg.data.code === 0, version: out.trim() || undefined });
        try { ws.close(); } catch {}
      }
    };
    ws.onerror = () => resolve({ installed: false });
  });
};
