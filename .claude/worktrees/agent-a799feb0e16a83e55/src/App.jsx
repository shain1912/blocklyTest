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
import { pythonToBlockly } from './utils/transpiler';

function App() {
  const [mode, setMode] = useState('blocks'); // 'blocks' | 'python'
  const [code, setCode] = useState(''); // JS code (for execution)
  const [pythonCode, setPythonCode] = useState(''); // Python code (for display)
  const [output, setOutput] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showLibraryManager, setShowLibraryManager] = useState(false);
  const [toolboxVersion, setToolboxVersion] = useState(0);
  const workspaceRef = useRef(null);
  const workspaceSnapshot = useRef(null);   // Blockly JSON saved when switching Blocks→Python
  const pythonAtSnapshot = useRef('');       // Python text at the time of snapshot

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

  /* Mode Toggle with Bidirectional Sync */
  const handleModeToggle = (targetMode) => {
    console.log("Toggle Mode:", targetMode, "Current Code:", pythonCode); // DEBUG
    if (targetMode === mode) return;

    if (targetMode === 'blocks') {
      // 1. Switch Mode to make visible
      setMode('blocks');

      // 2. Defer Load to ensure DOM is rendered
      setTimeout(() => {
        if (!workspaceRef.current) return;
        Blockly.svgResize(workspaceRef.current);

        // If Python hasn't changed since we generated it from blocks, restore the
        // original workspace JSON snapshot (lossless round-trip).
        const pythonUnchanged = pythonCode.trim() === pythonAtSnapshot.current.trim();
        if (pythonUnchanged && workspaceSnapshot.current) {
          try {
            workspaceRef.current.clear();
            Blockly.serialization.workspaces.load(workspaceSnapshot.current, workspaceRef.current);
          } catch (e) {
            console.error("Snapshot restore failed", e);
          }
          return;
        }

        // Python was edited by the user — run the transpiler
        if (pythonCode.trim()) {
          try {
            const blocklyJson = pythonToBlockly(pythonCode);
            if (blocklyJson.blocks.blocks.length > 0) {
              workspaceRef.current.clear();
              Blockly.serialization.workspaces.load(blocklyJson, workspaceRef.current);
              // Invalidate snapshot since workspace was rebuilt from edited Python
              workspaceSnapshot.current = null;
              pythonAtSnapshot.current = '';
            }
          } catch (e) {
            console.error("Transpile failed", e);
          }
        }
      }, 50);

    } else {
      // Blocks -> Python: save snapshot for lossless round-trip
      if (workspaceRef.current) {
        const generated = pythonGenerator.workspaceToCode(workspaceRef.current);
        workspaceSnapshot.current = Blockly.serialization.workspaces.save(workspaceRef.current);
        pythonAtSnapshot.current = generated;
        setPythonCode(generated);
      }
      setMode('python');
    }
  };

  const handleRun = async () => {
    let execCode = code;

    // In Python mode: transpile current Python → blocks → JS first
    if (mode === 'python' && pythonCode.trim() && workspaceRef.current) {
      try {
        const blocklyJson = pythonToBlockly(pythonCode);
        if (blocklyJson.blocks.blocks.length > 0) {
          workspaceRef.current.clear();
          Blockly.serialization.workspaces.load(blocklyJson, workspaceRef.current);
          execCode = javascriptGenerator.workspaceToCode(workspaceRef.current);
          setCode(execCode);
        }
      } catch (e) {
        console.warn('Python sync before run failed:', e);
      }
    }

    if (!execCode.trim()) {
      setOutput(['// No code to run']);
      return;
    }

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

  const handleClearOutput = () => {
    window.__running = false;
    setOutput([]);
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
  }, [handleCodeChange, activeFileId]);


  // Initialize workspace with active file content when workspace is ready
  // We'll wrap handleCodeChange to capture the workspace ref reliably.

  const onMount = useCallback((workspace) => {
    if (!workspace) return;
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
    <div className="app-layout">
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
      <div className="app">
        {/* Main Layout Content */}
        <main className="app-main">
          {/* Editor Section - Toggles between Blockly and Python */}
          <div className="editor-section">
            <div className="editor-header">
              <div className="mode-toggle pill-toggle">
                <button
                  className={`toggle-btn ${mode === 'blocks' ? 'active' : ''}`}
                  onClick={() => handleModeToggle('blocks')}
                >
                  <span>Blocks</span>
                </button>
                <button
                  className={`toggle-btn ${mode === 'python' ? 'active' : ''}`}
                  onClick={() => handleModeToggle('python')}
                >
                  <span>Python</span>
                </button>
              </div>
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
                  onClick={handleExport}
                  className="tool-btn"
                  title="Export Current File"
                >
                  💾 Save
                </button>
              </div>
            </div>
            <div className="editor-body">
              <div style={{ display: mode === 'blocks' ? 'flex' : 'none', height: '100%', flex: 1, minWidth: 0 }}>
                <BlocklyEditor onCodeChange={onWorkspaceChange} onMount={onMount} toolboxVersion={toolboxVersion} />
              </div>
              <div style={{ display: mode === 'python' ? 'flex' : 'none', height: '100%', flex: 1, minWidth: 0 }}>
                <PythonEditor code={pythonCode} onChange={setPythonCode} />
              </div>
              {showAI && (
                <div className="ai-panel">
                  <AIAgent
                    onLoadBlocks={handleAILoadBlocks}
                    currentPython={pythonCode}
                    onClose={() => setShowAI(false)}
                    files={files}
                    onCreateFile={handleCreateFile}
                    onSwitchFile={handleFileSelect}
                  />
                </div>
              )}
              {showLibraryManager && (
                <div className="lib-panel">
                  <LibraryManager
                    workspace={workspaceRef.current}
                    onClose={() => setShowLibraryManager(false)}
                    onToolboxChange={() => setToolboxVersion(v => v + 1)}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Stage and Output */}
          <div className="right-panel">
            <div className="stage-section">
              <Stage isRunning={isRunning} />
            </div>

            <div className="output-section">
              <Output output={output} isRunning={isRunning} />
            </div>

            <div className="controls-section">
              <button
                onClick={handleRun}
                className="run-btn"
                disabled={isRunning}
              >
                {isRunning ? 'Running...' : '▶ Run'}
              </button>
              <button
                onClick={handleClearOutput}
                className="clear-output-btn"
              >
                Reset
              </button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
