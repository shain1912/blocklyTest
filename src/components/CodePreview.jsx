import React from 'react';
import './CodePreview.css';

const CodePreview = ({ code }) => {
  return (
    <div className="code-preview-container">
      <div className="code-preview-header">
        <h2>JavaScript Code</h2>
      </div>
      <pre className="code-preview-content">
        <code>{code || '// Drag blocks to generate code'}</code>
      </pre>
    </div>
  );
};

export default CodePreview;
