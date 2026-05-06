import React from 'react';
import './Output.css';

// A line that starts with IMG:: is rendered as an inline <img>.
// matplotlib snippets emit this so the user sees plots without opening files.
const IMG_PREFIX = 'IMG::';

const renderLine = (line, index) => {
  if (typeof line === 'string' && line.startsWith(IMG_PREFIX)) {
    const b64 = line.slice(IMG_PREFIX.length).trim();
    const src = b64.startsWith('data:') ? b64 : `data:image/png;base64,${b64}`;
    return (
      <div key={index} className="output-line output-image">
        <img src={src} alt="program output" style={{ maxWidth: '100%', borderRadius: 4 }} data-testid="output-img" />
      </div>
    );
  }
  return <div key={index} className="output-line">{line}</div>;
};

const Output = ({ output, isRunning }) => {
  return (
    <div className="output-container">
      <div className="output-header">
        <h2>Output</h2>
        {isRunning && <span className="running-indicator">Running...</span>}
      </div>
      <div className="output-content">
        {output.length === 0 ? (
          <div className="output-placeholder">
            Click "Run" to execute your code
          </div>
        ) : (
          output.map(renderLine)
        )}
      </div>
    </div>
  );
};

export default Output;
