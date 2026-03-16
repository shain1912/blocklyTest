import React from 'react';
import './PythonEditor.css';

const PythonEditor = ({ code, onChange }) => {
    return (
        <div className="python-editor-container">
            <div className="python-editor-lines">
                {(code || '').split('\n').map((_, i) => (
                    <div key={i} className="line-number">{i + 1}</div>
                ))}
            </div>
            <textarea
                className="python-code-area"
                value={code || ''}
                onChange={(e) => onChange && onChange(e.target.value)}
                placeholder="# Switch to Blocks to generate code, or type here to define library..."
                spellCheck={false}
            />
        </div>
    );
};

export default PythonEditor;
