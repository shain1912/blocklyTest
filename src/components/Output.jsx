import React from 'react';
import './Output.css';

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
          output.map((line, index) => (
            <div key={index} className="output-line">
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Output;
