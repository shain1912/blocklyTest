import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import * as Blockly from 'blockly/core'
import { pythonGenerator } from 'blockly/python'

// Expose Blockly globally for E2E tests
window.Blockly = Blockly;

// PEP8 indent so Blocks→Python output matches a typical hand-typed source.
// Blockly defaults to 2 spaces, which makes round-trip diffs noisy.
pythonGenerator.INDENT = '    ';

// Suppress Blockly's automatic `var = None` declaration prelude. Our
// `variables_set` blocks already initialize at the assignment site, so
// the prelude just adds noise and breaks round-trip identity.
const _origInit = pythonGenerator.init.bind(pythonGenerator);
pythonGenerator.init = function (workspace) {
  _origInit(workspace);
  // Wipe the variable-declaration list that Blockly assembled in init().
  // The block-level setvar generators still emit the assignment, so behavior
  // is preserved — only the prelude noise disappears.
  this.definitions_ = Object.create(null);
};

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
