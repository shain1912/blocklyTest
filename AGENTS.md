# AGENTS.md - Blockly Scratch Development Guide

## Build, Lint, and Test Commands

### Core Commands
```bash
npm run dev        # Start development server with HMR
npm run build      # Build production bundle to /dist
npm run lint       # Run ESLint on entire codebase
npm run preview    # Preview production build locally
```

### Development Workflow
- Run `npm run dev` before making changes to see updates in real-time
- Always run `npm run lint` before committing to ensure code quality
- The project uses Vite 7.x with React 19 and Blockly 12.x

## Code Style Guidelines

### File Naming and Structure
- **Components**: PascalCase (e.g., `BlocklyEditor.jsx`, `CodePreview.jsx`)
- **Utils/Helpers**: camelCase (e.g., `customBlocks.js`)
- **CSS Files**: Match component name (e.g., `BlocklyEditor.css`)
- Place components in `src/components/` directory
- Place Blockly block definitions in `src/blocks/` directory

### Import Conventions
```jsx
// React core imports
import React, { useState, useEffect, useCallback, useRef } from 'react';

// Named imports for libraries
import Blockly from 'blockly';
import { javascriptGenerator } from 'blockly/javascript';

// Component imports (relative paths)
import BlocklyEditor from './components/BlocklyEditor';
import { toolboxCategories } from '../blocks/customBlocks';

// CSS imports
import './BlocklyEditor.css';
```

### React Patterns
- Use functional components with hooks
- Prefer `useCallback` for callback props passed to child components
- Use `useRef` for DOM references and Blockly workspace instances
- Use `useEffect` for side effects (Blockly initialization, cleanup)
- Always clean up Blockly workspaces in the useEffect return function:
```jsx
return () => {
  if (workspace.current) {
    workspace.current.dispose();
    workspace.current = null;
  }
};
```

### Naming Conventions
- **Components**: PascalCase
- **Props**: camelCase
- **Variables**: camelCase
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_TRACES`)
- **Blockly block types**: lowercase with underscores (e.g., `'print'`, `'variable'`)

### Error Handling
- Wrap async operations in try/catch/finally blocks
- Handle empty states gracefully (e.g., "No code to run")
- Provide user feedback for errors without exposing raw error details
- Use finally blocks for cleanup (restoring console methods, resetting state)

### Blockly Integration
- Block definitions follow this pattern:
```javascript
Blockly.Blocks['block_name'] = {
  init: function() {
    // Block configuration
  }
};

javascriptGenerator.forBlock['block_name'] = function(block) {
  // Code generation logic
  return [`generated_code`, javascriptGenerator.ORDER_NONE];
};
```

- Register custom blocks before using them in toolbox categories
- Toolbox categories use `toolboxCategories` export with kind, name, colour, and contents

### CSS/Styling
- Use component-scoped CSS files (e.g., `BlocklyEditor.css`)
- Avoid inline styles except for dynamic values
- Follow BEM-like naming for CSS classes (e.g., `.blockly-container`, `.blockly-editor`)

### ESLint Rules
- The project uses flat ESLint config with:
  - React Hooks rules (enforcement of rules-of-hooks)
  - React Refresh rules (HMR compatibility)
  - `no-unused-vars` with pattern: `varsIgnorePattern: '^[A-Z_]'`
- Constants and uppercase variables are ignored from unused var checks

### Additional Guidelines
- No TypeScript in this project (pure JavaScript/JSX)
- No test framework configured yet - add one if needed
- No commit hooks enforced - run `npm run lint` manually before commits
- This is a visual block-based programming editor using Google's Blockly library
