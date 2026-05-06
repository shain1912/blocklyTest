"""
Python execution backend for blocklyTest.

Endpoints:
  POST   /run            — start a python subprocess, returns session_id
  WS     /ws/{session_id} — stream stdout/stderr/events
  POST   /stop/{session_id} — terminate a running session
  POST   /install        — pip install a package, streams output
  POST   /streamlit/run  — launch streamlit subprocess on a free port
  GET    /health         — health check
  GET    /sessions       — list active sessions

Python code runs as a child of the interpreter that started uvicorn, so
whatever packages are installed in that environment are importable.
"""

from __future__ import annotations

import asyncio
import os
import re
import signal
import socket
import subprocess
import sys
import tempfile
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="blocklyTest Python backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Session registry ──────────────────────────────────────────────────────────


@dataclass
class Session:
    """One Python subprocess + an asyncio.Queue of output events."""

    session_id: str
    proc: asyncio.subprocess.Process
    queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    kind: str = "python"           # "python" | "streamlit" | "pip"
    port: Optional[int] = None      # for streamlit sessions
    finished: bool = False
    stdout_task: Optional[asyncio.Task] = None
    stderr_task: Optional[asyncio.Task] = None
    wait_task: Optional[asyncio.Task] = None


SESSIONS: dict[str, Session] = {}


async def _pipe_reader(stream: asyncio.StreamReader, queue: asyncio.Queue, tag: str) -> None:
    """Read a stream line-by-line and push to queue as {stream, data} events."""
    try:
        while True:
            line = await stream.readline()
            if not line:
                break
            try:
                text = line.decode("utf-8", errors="replace")
            except Exception:
                text = repr(line)
            await queue.put({"stream": tag, "data": text})
    except Exception as e:  # pragma: no cover
        await queue.put({"stream": "stderr", "data": f"[backend reader error: {e}]\n"})


async def _waiter(session: Session) -> None:
    rc = await session.proc.wait()
    # Wait briefly so any pending pipe data lands first
    if session.stdout_task:
        try:
            await session.stdout_task
        except Exception:
            pass
    if session.stderr_task:
        try:
            await session.stderr_task
        except Exception:
            pass
    session.finished = True
    await session.queue.put({"stream": "event", "data": {"type": "exit", "code": rc}})


def _spawn_session(cmd: list[str], env: Optional[dict] = None, kind: str = "python", port: Optional[int] = None) -> Session:
    """Launch a subprocess and start async readers for its pipes."""
    raise RuntimeError("use _spawn_session_async inside endpoints")


async def _spawn_session_async(
    cmd: list[str],
    env: Optional[dict] = None,
    kind: str = "python",
    port: Optional[int] = None,
    cwd: Optional[str] = None,
) -> Session:
    merged_env = os.environ.copy()
    # Force unbuffered stdout/stderr so output arrives live
    merged_env["PYTHONUNBUFFERED"] = "1"
    merged_env["PYTHONIOENCODING"] = "utf-8"
    if env:
        merged_env.update(env)

    proc = await asyncio.create_subprocess_exec(
        *cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        stdin=asyncio.subprocess.DEVNULL,
        env=merged_env,
        cwd=cwd,
        # New process group so we can kill the whole tree (signal.SIGTERM)
        preexec_fn=os.setsid if hasattr(os, "setsid") else None,
    )
    sess = Session(session_id=str(uuid.uuid4()), proc=proc, kind=kind, port=port)
    sess.stdout_task = asyncio.create_task(_pipe_reader(proc.stdout, sess.queue, "stdout"))
    sess.stderr_task = asyncio.create_task(_pipe_reader(proc.stderr, sess.queue, "stderr"))
    sess.wait_task = asyncio.create_task(_waiter(sess))
    SESSIONS[sess.session_id] = sess
    return sess


def _find_free_port() -> int:
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


def _kill_session(sess: Session) -> None:
    if sess.finished:
        return
    try:
        if hasattr(os, "killpg"):
            os.killpg(os.getpgid(sess.proc.pid), signal.SIGTERM)
        else:
            sess.proc.terminate()
    except ProcessLookupError:
        pass
    except Exception:
        try:
            sess.proc.kill()
        except Exception:
            pass


# ── HTTP endpoints ────────────────────────────────────────────────────────────


class RunRequest(BaseModel):
    code: str


class InstallRequest(BaseModel):
    package: str


class StreamlitRunRequest(BaseModel):
    code: str


class SyntaxCheckRequest(BaseModel):
    code: str


@app.get("/health")
async def health():
    return {
        "ok": True,
        "python": sys.version,
        "executable": sys.executable,
        "sessions": len(SESSIONS),
    }


@app.get("/sessions")
async def list_sessions():
    return [
        {
            "session_id": s.session_id,
            "kind": s.kind,
            "finished": s.finished,
            "port": s.port,
            "returncode": s.proc.returncode,
        }
        for s in SESSIONS.values()
    ]


@app.post("/run")
async def run(req: RunRequest):
    """Write code to a temp file and run it with the current Python interpreter."""
    tmpdir = Path(tempfile.mkdtemp(prefix="blockly_run_"))
    script = tmpdir / "script.py"
    script.write_text(req.code, encoding="utf-8")
    sess = await _spawn_session_async(
        [sys.executable, "-u", str(script)],
        kind="python",
        cwd=str(tmpdir),
    )
    return {"session_id": sess.session_id, "kind": "python"}


@app.post("/stop/{session_id}")
async def stop(session_id: str):
    sess = SESSIONS.get(session_id)
    if not sess:
        raise HTTPException(404, "Unknown session")
    _kill_session(sess)
    return {"ok": True}


@app.delete("/sessions/{session_id}")
async def delete_session(session_id: str):
    sess = SESSIONS.pop(session_id, None)
    if not sess:
        return {"ok": True}
    _kill_session(sess)
    return {"ok": True}


@app.post("/install")
async def install(req: InstallRequest):
    """pip install a package (into the backend's own interpreter)."""
    pkg = req.package.strip()
    if not pkg:
        raise HTTPException(400, "Empty package name")
    # Basic safety: allow only reasonable pip spec characters
    allowed = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.[]<>=!,~ ")
    if any(ch not in allowed for ch in pkg):
        raise HTTPException(400, "Package name has disallowed characters")
    sess = await _spawn_session_async(
        [sys.executable, "-m", "pip", "install", "--disable-pip-version-check", pkg],
        kind="pip",
    )
    return {"session_id": sess.session_id, "kind": "pip", "package": pkg}


@app.post("/syntax")
async def syntax_check(req: SyntaxCheckRequest):
    """Compile the code in Python's own compiler and report any SyntaxError."""
    try:
        compile(req.code, "<editor>", "exec")
        return {"ok": True}
    except SyntaxError as e:
        return {
            "ok": False,
            "line": e.lineno,
            "col": e.offset,
            "message": e.msg or str(e),
            "text": e.text,
        }
    except Exception as e:  # IndentationError inherits SyntaxError but be defensive
        return {"ok": False, "message": str(e)}


# ── Deterministic Python → AST JSON ──────────────────────────────────────────
# This is the canonical path for Python→Blocks conversion. No LLM, no regex
# guessing — use CPython's own ast module to produce a tree that the frontend
# can walk with a proper NodeVisitor. Result is stable and millisecond-fast.

import ast as _ast


def _ast_to_json(node, source=None, _counter=None):
    """Serialize a Python ast.AST to a JSON-friendly dict.

    Also attaches span info (start/end lineno+col) and a stable node_id so the
    frontend can match a block back to the exact source slice — critical for
    `raw_python` fallbacks and future exact-IR roundtrips.
    """
    if _counter is None:
        _counter = [0]
    if isinstance(node, _ast.AST):
        out = {"_kind": type(node).__name__}
        _counter[0] += 1
        out["_id"] = f"n{_counter[0]}"
        if hasattr(node, "lineno"):
            out["_lineno"] = getattr(node, "lineno", None)
            out["_col"] = getattr(node, "col_offset", None)
        if hasattr(node, "end_lineno"):
            out["_end_lineno"] = getattr(node, "end_lineno", None)
            out["_end_col"] = getattr(node, "end_col_offset", None)
        if source is not None and hasattr(node, "lineno"):
            try:
                seg = _ast.get_source_segment(source, node)
                if seg is not None:
                    out["_source"] = seg
            except Exception:
                pass
        for field in node._fields:
            out[field] = _ast_to_json(getattr(node, field, None), source, _counter)
        return out
    if isinstance(node, list):
        return [_ast_to_json(x, source, _counter) for x in node]
    if isinstance(node, (str, int, float, bool)) or node is None:
        return node
    if isinstance(node, bytes):
        return node.decode("utf-8", errors="replace")
    if isinstance(node, complex):
        return {"_kind": "Complex", "real": node.real, "imag": node.imag}
    return repr(node)


class IntrospectRequest(BaseModel):
    module: str
    max_items: int = 500
    callables_only: bool = False


def _is_public_name(name: str) -> bool:
    return not name.startswith("_")


_DOCSIG_RE = re.compile(r"^\s*[A-Za-z_][\w.]*\s*\(([^)]*)\)")


def _params_from_docstring(doc: str):
    """Many C-extension callables (cv2.cvtColor, numpy.zeros, ...) have no
    accessible `inspect.signature` but DO show a `func(a, b[, c]) -> X` line
    at the top of their docstring. Pull the argument names from that line so
    we still get real fields instead of a fieldless block."""
    if not doc:
        return None
    m = _DOCSIG_RE.match(doc.splitlines()[0] if doc else "")
    if not m:
        return None
    raw = m.group(1).strip()
    if not raw:
        return []
    # Strip the bracketed "optional" markers and trailing annotations
    raw = raw.replace("[", "").replace("]", "")
    parts = [p.strip() for p in raw.split(",") if p.strip()]
    params = []
    for p in parts:
        # e.g. "src", "src=None", "src: int = 0"
        default = None
        if "=" in p:
            p, default = [s.strip() for s in p.split("=", 1)]
        if ":" in p:
            p = p.split(":", 1)[0].strip()
        if not p or p in ("self", "cls", "/", "*"):
            continue
        info = {"name": p, "kind": "POSITIONAL_OR_KEYWORD"}
        if default is not None:
            info["default"] = default
        params.append(info)
    return params


def _signature_info(obj):
    """Extract a lightweight signature description for a callable.

    Tries inspect.signature first (works for pure-Python + annotated C funcs);
    falls back to a doc-line parse for builtins that still describe their args
    in the first line of their docstring (CV2 / numpy / lots of stdlib)."""
    import inspect
    try:
        sig = inspect.signature(obj)
    except (TypeError, ValueError):
        doc_params = _params_from_docstring(inspect.getdoc(obj) or "")
        if doc_params is not None:
            return {"params": doc_params, "source": "docstring"}
        return None
    params = []
    for p in sig.parameters.values():
        if p.name in ("self", "cls"):
            continue
        info = {"name": p.name, "kind": str(p.kind)}
        if p.default is not inspect.Parameter.empty:
            try:
                info["default"] = repr(p.default)
            except Exception:
                info["default"] = "<?>"
        if p.annotation is not inspect.Parameter.empty:
            try:
                info["annotation"] = str(p.annotation)
            except Exception:
                pass
        params.append(info)
    return {"params": params, "source": "signature"}


@app.post("/introspect")
async def introspect(req: IntrospectRequest):
    """Layer-2 metadata endpoint.

    Enumerates a module's public members — callables FIRST (classes +
    functions), then constants — so the frontend's max_items window is
    spent on the blocks users actually want to drag out (cv2.cvtColor,
    numpy.zeros, etc.) and doesn't get exhausted on uppercase enum
    constants like ACCESS_FAST, COLOR_*, ...
    """
    import importlib, inspect
    try:
        mod = importlib.import_module(req.module)
    except Exception as e:
        return {"ok": False, "error": f"import failed: {e}"}

    classes = []
    funcs = []
    constants = []
    for name in sorted(dir(mod)):
        if not _is_public_name(name):
            continue
        try:
            obj = getattr(mod, name)
        except Exception:
            continue
        if inspect.isclass(obj):
            sig = _signature_info(obj.__init__) or {}
            classes.append({
                "name": name,
                "qualified": f"{req.module}.{name}",
                "kind": "class",
                "doc": (inspect.getdoc(obj) or "")[:200],
                **sig,
            })
        elif callable(obj):
            sig = _signature_info(obj) or {}
            funcs.append({
                "name": name,
                "qualified": f"{req.module}.{name}",
                "kind": "function" if inspect.isfunction(obj) or inspect.isbuiltin(obj) else "callable",
                "doc": (inspect.getdoc(obj) or "")[:200],
                **sig,
            })
        else:
            try:
                value = obj if isinstance(obj, (int, float, str, bool)) else repr(obj)[:60]
            except Exception:
                value = "?"
            constants.append({
                "name": name,
                "qualified": f"{req.module}.{name}",
                "kind": "constant",
                "value": value,
            })

    # Prioritize callables; include constants only if there's room (unless the
    # caller explicitly asked for callables_only)
    items = (classes + funcs)
    if not req.callables_only:
        items = items + constants
    items = items[: req.max_items]
    return {"ok": True, "module": req.module, "items": items,
            "counts": {"classes": len(classes), "functions": len(funcs),
                       "constants": len(constants)}}


@app.post("/ast")
async def ast_parse(req: SyntaxCheckRequest):
    """Parse Python code with ast.parse() and return a full JSON AST.

    Also includes the original source so the frontend can pull slice text
    for any node (via _lineno / end_lineno) when it needs a verbatim fallback.
    """
    try:
        tree = _ast.parse(req.code, filename="<editor>", mode="exec")
    except SyntaxError as e:
        return {
            "ok": False,
            "error": {
                "kind": "SyntaxError",
                "line": e.lineno,
                "col": e.offset,
                "message": e.msg or str(e),
                "text": e.text,
            },
        }
    return {"ok": True, "ast": _ast_to_json(tree, source=req.code), "source": req.code}


@app.post("/streamlit/run")
async def streamlit_run(req: StreamlitRunRequest):
    """Launch a streamlit app on a free port; returns port for iframe embed."""
    # Ensure streamlit is importable first — if not, raise a clear error
    probe = await asyncio.create_subprocess_exec(
        sys.executable, "-c", "import streamlit, sys; sys.stdout.write(streamlit.__version__)",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    out, err = await probe.communicate()
    if probe.returncode != 0:
        raise HTTPException(
            500,
            f"streamlit is not installed in backend env. Run /install with package=streamlit. stderr={err.decode(errors='replace')}",
        )

    tmpdir = Path(tempfile.mkdtemp(prefix="blockly_st_"))
    script = tmpdir / "app.py"
    script.write_text(req.code, encoding="utf-8")
    port = _find_free_port()
    cmd = [
        sys.executable, "-m", "streamlit", "run", str(script),
        "--server.port", str(port),
        "--server.headless", "true",
        "--server.address", "127.0.0.1",
        "--browser.gatherUsageStats", "false",
    ]
    sess = await _spawn_session_async(cmd, kind="streamlit", port=port, cwd=str(tmpdir))
    return {
        "session_id": sess.session_id,
        "kind": "streamlit",
        "port": port,
        "url": f"http://127.0.0.1:{port}",
    }


# ── WebSocket ────────────────────────────────────────────────────────────────


@app.websocket("/ws/{session_id}")
async def ws(session_id: str, websocket: WebSocket):
    await websocket.accept()
    sess = SESSIONS.get(session_id)
    if not sess:
        await websocket.send_json({"stream": "event", "data": {"type": "error", "message": "unknown session"}})
        await websocket.close()
        return

    # Send initial hello so the client knows we're live
    await websocket.send_json({"stream": "event", "data": {"type": "connected", "kind": sess.kind, "port": sess.port}})

    try:
        while True:
            try:
                # If finished AND queue drained → emit done and break
                if sess.finished and sess.queue.empty():
                    await websocket.send_json({"stream": "event", "data": {"type": "done", "code": sess.proc.returncode}})
                    break
                evt = await asyncio.wait_for(sess.queue.get(), timeout=1.0)
                await websocket.send_json(evt)
                # An exit event is the signal to shut the socket
                if evt.get("stream") == "event" and isinstance(evt.get("data"), dict) and evt["data"].get("type") == "exit":
                    await websocket.send_json({"stream": "event", "data": {"type": "done", "code": evt["data"].get("code")}})
                    break
            except asyncio.TimeoutError:
                # heartbeat — keeps the connection fresh even when the child is quiet
                await websocket.send_json({"stream": "event", "data": {"type": "ping"}})
    except WebSocketDisconnect:
        pass
    except Exception as e:  # pragma: no cover
        try:
            await websocket.send_json({"stream": "event", "data": {"type": "error", "message": str(e)}})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


# ── Cleanup on shutdown ──────────────────────────────────────────────────────


@app.on_event("shutdown")
async def on_shutdown():
    for sess in list(SESSIONS.values()):
        _kill_session(sess)


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("BACKEND_PORT", "8000"))
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="info")
