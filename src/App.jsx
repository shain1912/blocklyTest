import React, { useState, useCallback, useRef } from 'react';
import BlocklyEditor from './components/BlocklyEditor';
import PythonEditor from './components/PythonEditor';
import Stage from './components/Stage';
import Output from './components/Output';
import { javascriptGenerator } from 'blockly/javascript';
import { pythonGenerator } from 'blockly/python';
import * as Blockly from 'blockly/core';
import './App.css';

import FileExplorer from './components/FileExplorer';
import AIAgent from './components/AIAgent';
import LibraryManager from './components/LibraryManager';
import PythonSnippets from './components/PythonSnippets';
import { pythonToBlockly } from './utils/legacy/transpiler';   // Sprint 5: offline fallback only
import { pythonToBlocksViaAst } from './utils/pyAst';
import { installLibrary, getInstalledLibraries, getUserInstalledLibraries, exportAsLibrary } from './utils/libraryManager';
import { runPython, runStreamlit, isStreamlitCode, checkHealth } from './utils/pythonBackend';
import { syncImportsForWorkspace, syncImportsForPythonSource } from './utils/importBridge';
import { semanticLibraryFor, clusterIntrospection } from './utils/librarySemantics';
import { introspectModule } from './utils/libraryIntrospector';
import { getFullToolboxConfig } from './blocks/customBlocks';
import { SPRITE_DSL_PACKAGE } from './utils/spriteDslSchemas';

// Register sprite/stage/time DSL → curated-block mappings once at module
// load. These schemas are how pyAst recognizes `sprite.move(30)` and emits
// the curated `move_right` block instead of falling through to py_stmt.
// Idempotent: installLibrary skips re-defining blocks that already exist.
try { installLibrary(SPRITE_DSL_PACKAGE); } catch (e) { /* swallow at boot */ }

// `?test=1` strips chrome (file explorer, AI/Lib/Snippet panels) and disables
// CSS transitions so Playwright can drive the editor deterministically.
const TEST_MODE = typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).has('test');

function App() {
  const [mode, setMode] = useState('blocks'); // 'blocks' | 'python'
  const [code, setCode] = useState(''); // JS code (for execution)
  const [pythonCode, setPythonCode] = useState(''); // Python code (for display)
  const [output, setOutput] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showLibraryManager, setShowLibraryManager] = useState(false);
  const [showSnippets, setShowSnippets] = useState(false);
  const [toolboxVersion, setToolboxVersion] = useState(0);
  const [pythonBackendHealth, setPythonBackendHealth] = useState(null);
  const [streamlitUrl, setStreamlitUrl] = useState(null);
  const runControllerRef = useRef(null);
  const workspaceRef = useRef(null);
  const workspaceSnapshot = useRef(null);   // Blockly JSON saved when switching Blocks→Python
  const pythonAtSnapshot = useRef('');       // Python text at the time of snapshot
  const pythonRawRef = useRef('');           // Authoritative Python text (lossless across toggles)
  const blocksTouchedRef = useRef(false);    // Did the user modify blocks since last mode enter?
  const programmaticLoadRef = useRef(false); // Suppress touch-tracking during snapshot/transpile loads

  // Probe backend on startup + re-probe every 10s so the "degraded mode" banner
  // clears automatically once the backend comes back up.
  React.useEffect(() => {
    let cancelled = false;
    const tick = () => checkHealth().then(h => { if (!cancelled) setPythonBackendHealth(h); });
    tick();
    const id = setInterval(tick, 10000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Generate code only from hat blocks (on_start / on_forever) if present,
  // otherwise fall back to all blocks (backward compat).
  const generateCodeFromWorkspace = useCallback((workspace) => {
    const HAT_TYPES = ['on_start', 'on_forever', 'when_flag_clicked'];
    const topBlocks = workspace.getTopBlocks(false);
    const hatBlocks = topBlocks.filter(b => HAT_TYPES.includes(b.type));

    if (hatBlocks.length > 0) {
      const jsCode = hatBlocks.map(b => javascriptGenerator.blockToCode(b)).join('\n');
      const pyCode = hatBlocks.map(b => pythonGenerator.blockToCode(b)).join('\n');
      return { jsCode, pyCode };
    }
    return {
      jsCode: javascriptGenerator.workspaceToCode(workspace),
      pyCode: pythonGenerator.workspaceToCode(workspace),
    };
  }, []);

  /* Updated Code Change Handler */
  const handleCodeChange = useCallback((workspace) => {
    if (!workspace || !javascriptGenerator || !pythonGenerator) return;
    workspaceRef.current = workspace;

    // Only update state from blocks if we are IN blocks mode
    if (mode === 'python') return;

    try {
      const { jsCode, pyCode } = generateCodeFromWorkspace(workspace);
      setCode(jsCode);
      setPythonCode(pyCode);
    } catch (e) {
      console.warn('Code generation failed:', e);
    }
  }, [mode, generateCodeFromWorkspace]);

  /**
   * Mode Toggle with lossless bidirectional sync.
   *
   * The challenge: snippets like opencv have imports + arbitrary library calls
   * that the transpiler can't faithfully convert to blocks and back. Before this
   * fix, toggling Python→Blocks→Python would reorder imports and destroy indentation.
   *
   * Strategy:
   *   - pythonRawRef: authoritative Python source (lossless across toggles).
   *   - blocksTouchedRef: true iff the user dragged/edited blocks since entering blocks mode.
   *   - Python→Blocks: reset blocksTouchedRef; either restore workspace snapshot OR transpile.
   *   - Blocks→Python: if blocks weren't touched AND we have a raw Python,
   *                    preserve pythonRawRef verbatim. Otherwise regenerate from blocks.
   */
  const handleModeToggle = (targetMode) => {
    if (targetMode === mode) return;

    if (targetMode === 'blocks') {
      setMode('blocks');
      blocksTouchedRef.current = false;

      // Async because the AST path talks to the backend.
      // We read python from pythonRawRef (synchronously updated by both the
      // editor's onChange and the __setPython hook) instead of the `pythonCode`
      // state — the latter may still hold the previous value if the toggle
      // fires in the same tick as a setPythonCode (e.g. Playwright tests or
      // any programmatic flow). Reading the ref avoids that React batching race.
      (async () => {
        // Wait one tick for DOM
        await new Promise(r => setTimeout(r, 50));
        if (!workspaceRef.current) return;
        Blockly.svgResize(workspaceRef.current);

        const sourcePython = pythonRawRef.current || pythonCode;
        const pythonUnchanged = sourcePython.trim() === pythonAtSnapshot.current.trim();
        programmaticLoadRef.current = true;
        try {
          if (pythonUnchanged && workspaceSnapshot.current) {
            workspaceRef.current.clear();
            Blockly.serialization.workspaces.load(workspaceSnapshot.current, workspaceRef.current);
          } else if (sourcePython.trim()) {
            // Pre-flight: scan the source for import statements and install
            // matching curated libraries BEFORE pyAst runs. Without this,
            // pyAst's schema lookup misses library calls on the first pass
            // (the structure_import block triggers install only after the
            // workspace has loaded — too late) and we fall through to
            // py_stmt for things like `cv2.imshow(...)`.
            try {
              const preInstalled = syncImportsForPythonSource(sourcePython);
              if (preInstalled.length) setToolboxVersion(v => v + 1);
            } catch (e) {
              // eslint-disable-next-line no-console
              console.warn('[importBridge] pre-flight install failed', e);
            }

            // Canonical path: ask the backend for a real CPython AST, walk it
            // with the deterministic NodeVisitor. Fall back to the regex
            // transpiler only if the backend is unreachable — that path is
            // still useful for Scratch-style sprite demos.
            let blocklyJson = await pythonToBlocksViaAst(sourcePython, { wrapRunnable: true });
            if (!blocklyJson || !blocklyJson.blocks || blocklyJson.blocks.blocks.length === 0) {
              try {
                blocklyJson = pythonToBlockly(sourcePython, { wrapRunnable: true });
              } catch (e) {
                console.error('Regex transpiler fallback failed', e);
                blocklyJson = null;
              }
            }
            workspaceRef.current.clear();
            if (blocklyJson && blocklyJson.blocks && blocklyJson.blocks.blocks.length > 0) {
              Blockly.serialization.workspaces.load(blocklyJson, workspaceRef.current);
            }
            pythonRawRef.current = sourcePython;
            pythonAtSnapshot.current = sourcePython;
            workspaceSnapshot.current = Blockly.serialization.workspaces.save(workspaceRef.current);
          }
        } finally {
          // Demo Pillar #2: any structure_import block now in the workspace
          // (either from the transpile or restored from snapshot) should
          // trigger its corresponding library install so the imported names
          // are available as draggable callable blocks. This is the bridge
          // that makes `import cv2` actually mean something in blocks mode.
          try {
            const installed = syncImportsForWorkspace(workspaceRef.current);
            if (installed.length) setToolboxVersion(v => v + 1);
          } catch (e) {
            console.warn('[importBridge] sync after Python→Blocks failed', e);
          }
          setTimeout(() => {
            programmaticLoadRef.current = false;
            blocksTouchedRef.current = false;
          }, 150);
        }
      })();
      return;
    }

    // ───── Blocks → Python ─────
    if (workspaceRef.current) {
      // If user never touched blocks AND we have an authoritative raw Python,
      // preserve it byte-for-byte (no re-generation, no line reshuffling).
      if (!blocksTouchedRef.current && pythonRawRef.current) {
        setPythonCode(pythonRawRef.current);
        pythonAtSnapshot.current = pythonRawRef.current;
        workspaceSnapshot.current = Blockly.serialization.workspaces.save(workspaceRef.current);
        setMode('python');
        return;
      }

      // Otherwise: user modified blocks → regenerate Python from the workspace.
      // After regeneration the workspace and pythonRawRef are again in sync,
      // so reset blocksTouchedRef — without this, every subsequent
      // Blocks→Python toggle would needlessly regenerate (and any drift in
      // the generator output would compound across toggles, breaking the
      // multi-roundtrip stability claim).
      try {
        const generated = pythonGenerator.workspaceToCode(workspaceRef.current);
        workspaceSnapshot.current = Blockly.serialization.workspaces.save(workspaceRef.current);
        pythonAtSnapshot.current = generated;
        pythonRawRef.current = generated;
        setPythonCode(generated);
        blocksTouchedRef.current = false;
      } catch (e) {
        console.error('Python generation failed', e);
      }
    }
    setMode('python');
  };

  /**
   * Python mode → run via FastAPI backend (real CPython subprocess, streamed output).
   * Blocks mode → run generated JS in-browser (Scratch sprite animation).
   */
  const handleRun = async () => {
    // Python mode → real CPython via backend
    if (mode === 'python') {
      const pyToRun = pythonCode.trim();
      if (!pyToRun) { setOutput(['// No Python code to run']); return; }

      setIsRunning(true);
      setStreamlitUrl(null);
      setOutput([]);
      window.__running = true;
      const logs = [];
      const push = (line) => { logs.push(line); setOutput([...logs]); };

      const handlers = {
        onStdout: (text) => { text.split(/\r?\n/).filter(Boolean).forEach(push); },
        onStderr: (text) => { text.split(/\r?\n/).filter(Boolean).forEach(l => push(`⚠ ${l}`)); },
        onEvent: (evt) => {
          if (evt.type === 'done' || evt.type === 'exit') {
            push(`— exited with code ${evt.code}`);
            window.__running = false;
            setIsRunning(false);
            runControllerRef.current = null;
          } else if (evt.type === 'error') {
            push(`Backend error: ${evt.message || 'unknown'}`);
            window.__running = false;
            setIsRunning(false);
          }
        },
      };

      try {
        if (isStreamlitCode(pyToRun)) {
          push('🚀 Launching Streamlit app…');
          const ctl = await runStreamlit(pyToRun, handlers);
          runControllerRef.current = ctl;
          // Streamlit needs a few seconds to boot
          setTimeout(() => setStreamlitUrl(ctl.url), 2500);
          push(`Streamlit server starting at ${ctl.url}`);
        } else {
          push('▶ Running Python (CPython backend)…');
          const ctl = await runPython(pyToRun, handlers);
          runControllerRef.current = ctl;
        }
      } catch (e) {
        push(`Backend unreachable: ${e.message}`);
        push('Is the backend running?  cd backend && python3 main.py');
        setIsRunning(false);
        window.__running = false;
      }
      return;
    }

    // Blocks mode → existing JS execution path
    let execCode = code;
    if (!execCode.trim()) { setOutput(['// No code to run']); return; }

    setIsRunning(true);
    setOutput([]);
    window.__running = true;
    if (window.spriteController) window.spriteController.reset();

    const logs = [];
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;

    console.log = (...args) => {  // eslint-disable-line no-console
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      logs.push(message);
      setOutput([...logs]);
    };

    console.error = (...args) => {
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
      ).join(' ');
      logs.push(`Error: ${message}`);
      setOutput([...logs]);
    };

    try {
      const asyncCode = `
        return (async () => {
          try {
            ${execCode}
          } catch(e) {
            console.error(e);
          }
        })();
      `;
      const fn = new Function(asyncCode);
      await fn();
    } catch (error) {
      logs.push(`Execution Error: ${error.message}`);
      setOutput([...logs]);
    } finally {
      window.__running = false;
      console.log = originalConsoleLog;
      console.error = originalConsoleError;
      setIsRunning(false);
    }
  };

  const handleStopRun = async () => {
    const ctl = runControllerRef.current;
    if (ctl && ctl.stop) {
      try { await ctl.stop(); } catch {}
      runControllerRef.current = null;
    }
    window.__running = false;
    setIsRunning(false);
  };

  const handleClearOutput = () => {
    window.__running = false;
    setOutput([]);
    setStreamlitUrl(null);
    if (window.spriteController) window.spriteController.reset();
  };

  // File System State
  const [files, setFiles] = useState(() => {
    const saved = localStorage.getItem('blockly-files');
    if (saved) {
      const parsed = JSON.parse(saved);
      // Migration: Ensure all items have type and parentId
      return parsed.map(f => ({
        ...f,
        type: f.type || 'file',
        parentId: f.parentId || null,
        isOpen: f.isOpen !== undefined ? f.isOpen : false
      }));
    }
    return [{ id: 'default', name: 'Project 1', content: null, type: 'file', parentId: null }];
  });

  const [activeFileId, setActiveFileId] = useState(() => {
    return localStorage.getItem('blockly-active-file') || 'default';
  });
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const autosaveTimer = useRef(null);

  // Persistence Effects
  React.useEffect(() => {
    localStorage.setItem('blockly-files', JSON.stringify(files));
  }, [files]);

  React.useEffect(() => {
    localStorage.setItem('blockly-active-file', activeFileId);
  }, [activeFileId]);

  // Save current workspace state to file object
  const saveCurrentWorkspace = useCallback(() => {
    if (!workspaceRef.current) return;
    try {
      const state = Blockly.serialization.workspaces.save(workspaceRef.current);
      setFiles(prev => prev.map(f => f.id === activeFileId ? { ...f, content: state } : f));
    } catch (e) {
      console.error("Failed to save workspace", e);
    }
  }, [activeFileId]);

  // Load state into workspace
  const loadWorkspaceState = useCallback((state) => {
    if (!workspaceRef.current) return;
    try {
      if (state) {
        Blockly.serialization.workspaces.load(state, workspaceRef.current);
      } else {
        workspaceRef.current.clear();
      }
    } catch (e) {
      console.error("Failed to load workspace", e);
    }
  }, []);

  // --- File Actions ---

  const handleFileSelect = (newFileId) => {
    const file = files.find(f => f.id === newFileId);
    if (!file || file.type === 'folder') return; // Cannot select folders as active workspace

    if (newFileId === activeFileId) return;

    // Save current
    saveCurrentWorkspace();

    // Switch
    setActiveFileId(newFileId);
    loadWorkspaceState(file.content);
  };

  const handleCreateFile = (parentId = null, name = null) => {
    saveCurrentWorkspace();
    const newId = Date.now().toString();
    const newFile = {
      id: newId,
      name: name || `Project ${files.filter(f => f.type === 'file').length + 1}`,
      content: null,
      type: 'file',
      parentId
    };

    setFiles(prev => {
      if (parentId) {
        return [...prev.map(f => f.id === parentId ? { ...f, isOpen: true } : f), newFile];
      }
      return [...prev, newFile];
    });

    setActiveFileId(newId);
    if (workspaceRef.current) workspaceRef.current.clear();
    return newId; // Return ID so AI agent can track it
  };

  const handleCreateFolder = (parentId = null) => {
    const newId = Date.now().toString();
    const newFolder = {
      id: newId,
      name: `Folder ${files.filter(f => f.type === 'folder').length + 1}`,
      type: 'folder',
      parentId,
      isOpen: true,
      content: null // Not used for folders
    };
    setFiles(prev => {
      if (parentId) {
        return [...prev.map(f => f.id === parentId ? { ...f, isOpen: true } : f), newFolder];
      }
      return [...prev, newFolder];
    });
  };

  const handleDeleteFile = (id) => {
    // Recursive delete helper
    const getDescendants = (items, itemId) => {
      let descendants = [];
      const children = items.filter(f => f.parentId === itemId);
      children.forEach(child => {
        descendants.push(child.id);
        if (child.type === 'folder') {
          descendants = [...descendants, ...getDescendants(items, child.id)];
        }
      });
      return descendants;
    };

    const idsToDelete = [id, ...getDescendants(files, id)];
    const newFiles = files.filter(f => !idsToDelete.includes(f.id));

    if (newFiles.filter(f => f.type === 'file').length === 0) {
      // Ideally prevent deleting last file, but allowing empty state is safer for folders
      // Just create a default if empty
      const defaultFile = { id: 'default', name: 'New Project', content: null, type: 'file', parentId: null };
      setFiles([defaultFile]);
      setActiveFileId('default');
      if (workspaceRef.current) workspaceRef.current.clear();
      return;
    }

    setFiles(newFiles);

    // If active file was deleted, switch to another
    if (idsToDelete.includes(activeFileId)) {
      const firstFile = newFiles.find(f => f.type === 'file');
      if (firstFile) {
        setActiveFileId(firstFile.id);
        loadWorkspaceState(firstFile.content);
      }
    }
  };

  const handleRenameItem = (id, newName) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, name: newName } : f));
  };

  const handleToggleFolder = (id) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, isOpen: !f.isOpen } : f));
  };

  // When activeFileId changes, we ideally want to switch content. 
  // But React state updates are async. We need to save OLD file, then load NEW file.
  // This is tricky with simple effects. 
  // Better approach: explicit operations.



  const handleExport = () => {
    saveCurrentWorkspace(); // Ensure latest state is saved to file object
    const currentFile = files.find(f => f.id === activeFileId);
    if (!currentFile) return;

    // Get latest state directly from workspace for export to be sure
    let state = currentFile.content;
    if (workspaceRef.current) {
      state = Blockly.serialization.workspaces.save(workspaceRef.current);
    }

    const jsonString = JSON.stringify(state, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `${currentFile.name}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = JSON.parse(event.target.result);
          saveCurrentWorkspace();

          const newId = Date.now().toString();
          const newFile = {
            id: newId,
            name: file.name.replace('.json', ''),
            content: content,
            type: 'file',
            parentId: null
          };

          setFiles(prev => [...prev, newFile]);
          setActiveFileId(newId);
          loadWorkspaceState(content);
        } catch (err) {
          alert("Failed to parse JSON file");
          console.error(err);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  // Autosave on code change? 
  // We can hook into handleCodeChange to auto-update the file state periodically or on change.
  // For now, let's update internal file state when code changes manually? 
  // No, handleCodeChange runs on every block move.
  // We can update the 'files' state blindly, but that triggers renders.
  // Let's use a ref or just rely on 'saveCurrentWorkspace' being called before switching.

  // NOTE: On initial mount, we might need to load the active file content.
  // We can do this via a useEffect that runs once when workspaceRef becomes available?
  // Or handled by BlocklyEditor initialization?
  // Let's pass a key or initial state to BlocklyEditor? 
  // Or just use a specific effect here.

  const hasLoadedInitial = useRef(false);

  // Custom code change handler wrapper with debounced autosave
  const onWorkspaceChange = useCallback((workspace) => {
    handleCodeChange(workspace);
    // Any change in blocks mode marks the workspace as "touched" so we know
    // to regenerate Python on the next Blocks→Python toggle (vs preserving
    // pythonRawRef for lossless roundtrip). Skip while we're programmatically
    // loading a snapshot or transpile output.
    if (mode === 'blocks' && !programmaticLoadRef.current) {
      blocksTouchedRef.current = true;
    }
    // Demo Pillar #2: scan for new structure_import blocks the user may have
    // dragged in or edited, and auto-install their library specs. Idempotent;
    // toolbox bumps only when something was actually added.
    try {
      const installed = syncImportsForWorkspace(workspace);
      if (installed.length) setToolboxVersion(v => v + 1);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[importBridge] sync on change failed', e);
    }
    // Debounced autosave: persist block state so page refresh doesn't lose work
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      if (!workspace) return;
      try {
        const state = Blockly.serialization.workspaces.save(workspace);
        setFiles(prev => prev.map(f =>
          f.id === activeFileId ? { ...f, content: state } : f
        ));
      } catch (e) { /* silent */ }
    }, 800);
  }, [handleCodeChange, activeFileId, mode]);


  // Initialize workspace with active file content when workspace is ready
  // We'll wrap handleCodeChange to capture the workspace ref reliably.

  const onMount = useCallback((workspace) => {
    if (!workspace) return;
    window.__blocklyWorkspace = workspace;
    // E2E test helper: load Blockly JSON into workspace
    window.__loadBlockly = (json) => {
      try {
        workspace.clear();
        Blockly.serialization.workspaces.load(json, workspace);
        return true;
      } catch (e) {
        console.error('__loadBlockly failed:', e);
        return false;
      }
    };
    // E2E test helper: get current Python code from workspace
    window.__getWorkspacePython = () => {
      try { return pythonGenerator.workspaceToCode(workspace); } catch (e) { return ''; }
    };
    // E2E test helper: install a library package using the same Blockly instance as the app
    window.__installLibrary = (pkg) => {
      try { installLibrary(pkg); return { ok: true }; } catch (e) { return { ok: false, error: e.message }; }
    };
    // E2E test helper: check if python generator is registered for a block type
    window.__hasPyGen = (type) => typeof pythonGenerator.forBlock[type] === 'function';
    window.__pyGenKeys = () => Object.keys(pythonGenerator.forBlock);
    // E2E test helper: directly set/read the python editor value (replaces .python-code-area fill)
    window.__setPython = (code) => { setPythonCode(code); pythonRawRef.current = code; };
    window.__getPython = () => pythonRawRef.current;
    // E2E: serialize current workspace as Blockly JSON
    window.__getWorkspaceJson = () => {
      try { return Blockly.serialization.workspaces.save(workspace); } catch (e) { return null; }
    };
    // E2E: structural reset between scenarios (workspace + python + snapshot refs)
    window.__resetWorkspace = () => {
      try { workspace.clear(); } catch {}
      pythonRawRef.current = '';
      pythonAtSnapshot.current = '';
      workspaceSnapshot.current = null;
      blocksTouchedRef.current = false;
      programmaticLoadRef.current = false;
      setPythonCode('');
      setCode('');
      setOutput([]);
    };
    // E2E: introspection for the touched-state bug (Phase 2)
    window.__getBlocksTouched = () => blocksTouchedRef.current;
    window.__getInstalledLibraries = () => {
      // User-facing list — excludes `__builtin_*` (sprite DSL etc.) so the
      // count matches what shows up in the Library Manager UI.
      try { return getUserInstalledLibraries(); } catch { return []; }
    };
    // Phase 4 — Semantic clustering driver. Tests pass a synthetic
    // introspection list and assert the clustered output is bounded
    // and round-trippable.
    // Walk the live toolbox config and return the set of every block.type
    // a user could actually drag from the left panel. The Phase 2/8 specs
    // use this to assert no transpiled workspace contains "ghost" blocks
    // (py_call / py_attr / raw_python) that aren't in this set.
    window.__getToolboxBlockTypes = () => {
      const out = new Set();
      const walk = (node) => {
        if (!node) return;
        if (Array.isArray(node)) { node.forEach(walk); return; }
        if (node.kind === 'block' && node.type) out.add(node.type);
        // Blockly's dynamic categories (VARIABLE / PROCEDURE / TYPED_VARIABLE)
        // populate themselves at render time. Statically declare the block
        // types each one owns so the vocabulary guard treats them as
        // toolbox-resident even though they're not in the static config.
        if (node.custom === 'VARIABLE') {
          out.add('variables_set'); out.add('variables_get'); out.add('math_change');
        }
        if (node.custom === 'PROCEDURE') {
          out.add('procedures_defnoreturn'); out.add('procedures_defreturn');
          out.add('procedures_callnoreturn'); out.add('procedures_callreturn');
        }
        if (node.contents) walk(node.contents);
      };
      try { walk(getFullToolboxConfig().contents); } catch (e) { /* ignore */ }
      return Array.from(out);
    };
    // Programmatically run the Snippet card flow: install all curated
    // libraries the snippet depends on, then drop its Python source into
    // the editor. Mirrors what clicking a card in the Snippets panel does.
    window.__loadSnippet = async (snippetId) => {
      try {
        const [{ findSnippet }, { getSnippetLibraries }] = await Promise.all([
          import('./utils/pythonSnippets'),
          import('./utils/snippetLibraries'),
        ]);
        const snip = findSnippet(snippetId);
        if (!snip) return { ok: false, error: `unknown snippet ${snippetId}` };
        const libs = getSnippetLibraries(snippetId);
        for (const lib of libs) installLibrary(lib);
        setToolboxVersion(v => v + 1);
        setPythonCode(snip.code);
        pythonRawRef.current = snip.code;
        // Force the next Blocks→toggle to transpile (NOT restore an empty
        // snapshot): pythonAtSnapshot stays empty so pythonUnchanged === false.
        pythonAtSnapshot.current = '';
        workspaceSnapshot.current = null;
        blocksTouchedRef.current = false;
        // Place the user in Python view so they SEE the loaded code; from
        // there a single click on Blocks runs the AST transpile path.
        setMode('python');
        return { ok: true, packages: snip.packages || [], code: snip.code };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    };
    // Build a library package from the current workspace's class / module
    // blocks AND install it. Mirrors what the LibraryManager UI does when the
    // user clicks "Export as library" — exposed for the demo spec.
    window.__buildAndInstallLibrary = (meta) => {
      try {
        const pkg = exportAsLibrary(workspace, meta || {});
        installLibrary(pkg);
        setToolboxVersion(v => v + 1);
        return { ok: true, pkg };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    };
    window.__cluster = (introspection, opts) => clusterIntrospection(introspection, opts);
    // Live backend introspection — caller passes a Python module name and gets
    // back the raw callable list (used by the Phase 4 demo + spec).
    window.__introspect = async (moduleName, opts = {}) => {
      try {
        const r = await introspectModule(moduleName, opts);
        return r;
      } catch (e) {
        return { ok: false, error: e.message };
      }
    };
    window.__installSemantic = (moduleName, introspection, opts) => {
      try {
        const { package: pkg, stats } = semanticLibraryFor(moduleName, introspection, opts);
        installLibrary(pkg);
        setToolboxVersion(v => v + 1);
        return { ok: true, stats };
      } catch (e) {
        return { ok: false, error: e.message };
      }
    };
    handleCodeChange(workspace);

    // Load initial content
    if (!hasLoadedInitial.current) {
      const currentFile = files.find(f => f.id === activeFileId);
      if (currentFile && currentFile.content) {
        try {
          Blockly.serialization.workspaces.load(currentFile.content, workspace);
        } catch (e) { console.error(e); }
      }
      hasLoadedInitial.current = true;
    }
  }, [files, activeFileId, handleCodeChange]);




  // E2E test helpers that depend on current closures (mode, handlers, output).
  // Re-bind on every render so Playwright always sees fresh values.
  React.useEffect(() => {
    window.__getMode = () => mode;
    window.__toggleMode = () => handleModeToggle(mode === 'blocks' ? 'python' : 'blocks');
    window.__setMode = (target) => handleModeToggle(target);
    window.__runCode = () => handleRun();
    window.__stopRun = () => handleStopRun();
    window.__getStageOutput = () => output.slice();
    window.__getStageState = () => {
      try { return window.spriteController?.getState?.() ?? null; } catch { return null; }
    };
    window.__getStageVariables = () => {
      try { return window.spriteController?.getVariables?.() ?? {}; } catch { return {}; }
    };
    window.__isRunning = () => isRunning;
    window.__isTestMode = () => TEST_MODE;
  }); // intentionally no deps — re-bind every render to keep closures fresh

  const handleAILoadBlocks = useCallback((blocklyJson) => {
    if (!workspaceRef.current) return;
    try {
      workspaceRef.current.clear();
      Blockly.serialization.workspaces.load(blocklyJson, workspaceRef.current);
      setMode('blocks');
    } catch (e) {
      console.error('AI block load failed:', e);
    }
  }, []);

  return (
    <div className={`app-layout${TEST_MODE ? ' test-mode' : ''}`} data-testmode={TEST_MODE ? '1' : '0'}>
      {TEST_MODE && (
        <style>{`
          .test-mode *, .test-mode *::before, .test-mode *::after {
            animation-duration: 0s !important;
            animation-delay: 0s !important;
            transition-duration: 0s !important;
            transition-delay: 0s !important;
          }
        `}</style>
      )}
      {!TEST_MODE && (
        <FileExplorer
          files={files}
          activeFileId={activeFileId}
          onFileSelect={handleFileSelect}
          onCreateFile={handleCreateFile}
          onCreateFolder={handleCreateFolder}
          onDeleteFile={handleDeleteFile}
          onRenameItem={handleRenameItem}
          onToggleFolder={handleToggleFolder}
          onImport={handleImport}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        />
      )}
      <div className="app">
        {/*
          Degraded-mode banner (Blueprint §Sprint 5.3) — when the FastAPI
          backend is unreachable we cannot use the canonical AST path, so the
          user is running on the legacy regex transpiler. This is a legitimate
          fallback but must be announced, not silent.
        */}
        {pythonBackendHealth && pythonBackendHealth.ok === false && (
          <div
            data-testid="degraded-mode-banner"
            style={{
              background: '#7f1d1d', color: '#fecaca', padding: '6px 14px',
              fontSize: 12, fontFamily: 'system-ui, sans-serif',
              borderBottom: '1px solid #450a0a',
            }}
          >
            ⚠ Degraded mode — Python backend is offline at <code>:8000</code>.
            Python → Blocks is using the legacy regex transpiler; AST-based
            exact preservation is unavailable until the backend returns.
            Start it with <code>./start.sh</code> or <code>python3 backend/main.py</code>.
          </div>
        )}
        {/* Main Layout Content */}
        <main className="app-main">
          {/* Editor Section - Toggles between Blockly and Python */}
          <div className="editor-section" data-testid="editor-section">
            <div className="editor-header">
              <div className="mode-toggle pill-toggle">
                <button
                  className={`toggle-btn ${mode === 'blocks' ? 'active' : ''}`}
                  onClick={() => handleModeToggle('blocks')}
                  data-testid="mode-toggle-blocks"
                >
                  <span>Blocks</span>
                </button>
                <button
                  className={`toggle-btn ${mode === 'python' ? 'active' : ''}`}
                  onClick={() => handleModeToggle('python')}
                  data-testid="mode-toggle-python"
                >
                  <span>Python</span>
                </button>
              </div>
              {!TEST_MODE && (
                <div className="editor-header-actions">
                  <button
                    className={`tool-btn ${showAI ? 'active' : ''}`}
                    onClick={() => setShowAI(v => !v)}
                    title="AI Agent"
                  >
                    ✨ AI
                  </button>
                  <button
                    className={`tool-btn ${showLibraryManager ? 'active' : ''}`}
                    onClick={() => setShowLibraryManager(v => !v)}
                    title="Library Manager"
                  >
                    📦 Libs
                  </button>
                  <button
                    className={`tool-btn ${showSnippets ? 'active' : ''}`}
                    onClick={() => setShowSnippets(v => !v)}
                    title="One-click Python Snippets"
                    data-testid="snippets-toggle"
                  >
                    📋 Snippets
                  </button>
                  <button
                    onClick={handleExport}
                    className="tool-btn"
                    title="Export Current File"
                  >
                    💾 Save
                  </button>
                </div>
              )}
            </div>
            <div className="editor-body">
              <div data-testid="blocks-pane" style={{ display: mode === 'blocks' ? 'flex' : 'none', height: '100%', flex: 1, minWidth: 0 }}>
                <BlocklyEditor onCodeChange={onWorkspaceChange} onMount={onMount} toolboxVersion={toolboxVersion} />
              </div>
              <div data-testid="python-pane" style={{ display: mode === 'python' ? 'flex' : 'none', height: '100%', flex: 1, minWidth: 0 }}>
                <PythonEditor
                  code={pythonCode}
                  onChange={(val) => {
                    setPythonCode(val);
                    // User-typed Python is the new source of truth
                    pythonRawRef.current = val;
                  }}
                />
              </div>
              {!TEST_MODE && showAI && (
                <div className="ai-panel">
                  <AIAgent
                    onLoadBlocks={handleAILoadBlocks}
                    currentPython={pythonCode}
                    onClose={() => setShowAI(false)}
                    files={files}
                    onCreateFile={handleCreateFile}
                    onSwitchFile={handleFileSelect}
                    onToolboxChange={() => setToolboxVersion(v => v + 1)}
                  />
                </div>
              )}
              {!TEST_MODE && showLibraryManager && (
                <div className="lib-panel">
                  <LibraryManager
                    workspace={workspaceRef.current}
                    onClose={() => setShowLibraryManager(false)}
                    onToolboxChange={() => setToolboxVersion(v => v + 1)}
                  />
                </div>
              )}
              {!TEST_MODE && (
                <PythonSnippets
                  open={showSnippets}
                  onClose={() => setShowSnippets(false)}
                  onLoadCode={(code) => {
                    setPythonCode(code);
                    pythonRawRef.current = code;        // snippet is authoritative
                    pythonAtSnapshot.current = code;     // prevent spurious retranspile
                    workspaceSnapshot.current = null;    // force fresh conversion on toggle
                    blocksTouchedRef.current = false;
                  }}
                  onSwitchToPython={() => setMode('python')}
                  onToolboxChange={() => setToolboxVersion(v => v + 1)}
                />
              )}
            </div>
          </div>

          {/* Right Panel - Stage and Output */}
          <div className="right-panel" data-testid="right-panel">
            <div className="stage-section" data-testid="stage-section">
              {streamlitUrl ? (
                <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ padding: '4px 8px', background: '#1a2332', color: '#94a3b8', fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
                    <span>🚀 Streamlit: {streamlitUrl}</span>
                    <a href={streamlitUrl} target="_blank" rel="noopener" style={{ color: '#38bdf8' }}>Open ↗</a>
                  </div>
                  <iframe
                    src={streamlitUrl}
                    title="Streamlit app"
                    style={{ flex: 1, border: 'none', width: '100%', background: 'white' }}
                    data-testid="streamlit-iframe"
                  />
                </div>
              ) : (
                <Stage isRunning={isRunning} />
              )}
            </div>

            <div className="output-section" data-testid="output-section">
              <Output output={output} isRunning={isRunning} />
            </div>

            <div className="controls-section" data-testid="controls-section">
              <button
                onClick={handleRun}
                className="run-btn"
                disabled={isRunning}
                data-testid="run-btn"
              >
                {isRunning ? 'Running...' : '▶ Run'}
              </button>
              {isRunning && (
                <button
                  onClick={handleStopRun}
                  className="clear-output-btn"
                  data-testid="stop-btn"
                  style={{ background: '#991b1b', color: 'white' }}
                >
                  ⏹ Stop
                </button>
              )}
              <button
                onClick={handleClearOutput}
                className="clear-output-btn"
              >
                Reset
              </button>
              {mode === 'python' && (
                <div style={{ marginLeft: 'auto', fontSize: 11, color: pythonBackendHealth?.ok ? '#10b981' : '#ef4444' }}>
                  {pythonBackendHealth?.ok ? '● backend online' : '● backend offline'}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
