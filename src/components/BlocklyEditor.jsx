import React, { useEffect, useRef } from 'react';
import * as Blockly from 'blockly';
import { javascriptGenerator } from 'blockly/javascript';
import { toolboxCategories, getFullToolboxConfig } from '../blocks/customBlocks';
import '../blocks/structure';
import '../blocks/classes';
import './BlocklyEditor.css';

const BlocklyEditor = ({ onCodeChange, onMount, toolboxVersion }) => {
  const blocklyDiv = useRef(null);
  const workspace = useRef(null);
  const onCodeChangeRef = useRef(onCodeChange);
  const onMountRef = useRef(onMount);
  useEffect(() => { onCodeChangeRef.current = onCodeChange; }, [onCodeChange]);
  useEffect(() => { onMountRef.current = onMount; }, [onMount]);

  // Dynamic toolbox update when libraries are installed/uninstalled
  useEffect(() => {
    if (!workspace.current || toolboxVersion === undefined || toolboxVersion === 0) return;
    try {
      workspace.current.updateToolbox(getFullToolboxConfig());
      // Try to make the newly added last category visible/selected
      const toolbox = workspace.current.getToolbox();
      if (toolbox) {
        const contents = toolbox.getToolboxItems?.() || [];
        if (contents.length > 0) {
          const last = contents[contents.length - 1];
          if (last && last.setSelected) last.setSelected(true);
        }
      }
    } catch (e) { /* toolbox API varies by Blockly version */ }
  }, [toolboxVersion]);

  useEffect(() => {
    if (blocklyDiv.current && !workspace.current) {
      const customTheme = Blockly.Theme.defineTheme('scratch3', {
        base: Blockly.Themes.Modern,
        blockStyles: {
          logic_blocks: { colourPrimary: "#006970", colourSecondary: "#006970", colourTertiary: "#004044" },
          loop_blocks: { colourPrimary: "#207a4b", colourSecondary: "#207a4b", colourTertiary: "#103d25" },
          math_blocks: { colourPrimary: "#7600A7", colourSecondary: "#7600A7", colourTertiary: "#4b006a" },
          text_blocks: { colourPrimary: "#990055", colourSecondary: "#990055", colourTertiary: "#660039" },
          list_blocks: { colourPrimary: "#F36E21", colourSecondary: "#F36E21", colourTertiary: "#d14b00" },
          variable_blocks: { colourPrimary: "#A80000", colourSecondary: "#A80000", colourTertiary: "#6e0000" },
          variable_dynamic_blocks: { colourPrimary: "#A80000", colourSecondary: "#A80000", colourTertiary: "#6e0000" },
          procedure_blocks: { colourPrimary: "#003366", colourSecondary: "#003366", colourTertiary: "#001a33" },
          colour_blocks: { colourPrimary: "#CF63CF", colourSecondary: "#CF63CF", colourTertiary: "#a64fa6" }
        },
        componentStyles: {
          workspaceBackgroundColour: '#0f172a',
          toolboxBackgroundColour: '#020617',
          toolboxForegroundColour: '#94a3b8',
          flyoutBackgroundColour: '#020617',
          flyoutForegroundColour: '#94a3b8',
          scrollbarColour: '#334155',
          cursorColour: '#6366f1'
        }
      });

      workspace.current = Blockly.inject(blocklyDiv.current, {
        theme: customTheme,
        toolbox: {
          kind: "categoryToolbox",
          contents: toolboxCategories,
          css: {
            container: 'blockly-toolbox-scratch'
          }
        },
        scrollbars: true,
        trashcan: true,
        grid: {
          spacing: 20,
          length: 3,
          colour: '#1e293b',
          snap: true,
        },
        zoom: {
          controls: true,
          wheel: true,
          startScale: 1.0,
          maxScale: 3,
          minScale: 0.3,
          scaleSpeed: 1.2
        },
        maxTraces: 10,
        renderer: 'zelos'
      });

      workspace.current.addChangeListener(() => {
        if (!workspace.current) return;
        onCodeChangeRef.current(workspace.current);
      });

      // Expose workspace for E2E tests
      window.__blocklyWorkspace = workspace.current;

      if (onMountRef.current) {
        onMountRef.current(workspace.current);
      }
    }

    return () => {
      if (workspace.current) {
        workspace.current.dispose();
        workspace.current = null;
      }
    };
  }, []); // Empty deps: workspace injected only once

  const handleClear = () => {
    if (workspace.current) {
      workspace.current.clear();
    }
  };

  const handleUndo = () => {
    if (workspace.current) {
      workspace.current.undo(false);
    }
  };

  const handleRedo = () => {
    if (workspace.current) {
      workspace.current.undo(true);
    }
  };

  return (
    <div className="blockly-container" style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, height: '100%' }}>
      <div className="blockly-header">
        <div className="header-left">
          <h2>🧱 Blocks</h2>
        </div>
        <div className="header-actions">
          <button onClick={handleUndo} className="action-btn" title="Undo">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 7v6h6" /><path d="M3 13a9 9 0 1 0 3-7.5" />
            </svg>
          </button>
          <button onClick={handleRedo} className="action-btn" title="Redo">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 7v6h-6" /><path d="M21 13a9 9 0 1 1-3-7.5" />
            </svg>
          </button>
          <button onClick={handleClear} className="clear-btn">🗑️ Clear</button>
        </div>
      </div>
      <div ref={blocklyDiv} className="blockly-editor" />
    </div>
  );
};

export default BlocklyEditor;
