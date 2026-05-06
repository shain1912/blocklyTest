import React, { useState } from 'react';
import './FileExplorer.css';

const FileTreeItem = ({
    item,
    level = 0,
    files,
    activeFileId,
    onSelect,
    onToggle,
    onDelete,
    onRename,
    onCreateFile,
    onCreateFolder
}) => {
    const [isRenaming, setIsRenaming] = useState(false);
    const [renameValue, setRenameValue] = useState(item.name);
    const hasChildren = files.some(f => f.parentId === item.id);
    const isOpen = item.isOpen;

    const handleRenameSubmit = (e) => {
        e.preventDefault();
        onRename(item.id, renameValue);
        setIsRenaming(false);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleRenameSubmit(e);
        if (e.key === 'Escape') {
            setRenameValue(item.name);
            setIsRenaming(false);
        }
    };

    // Calculate padding based on level
    const paddingLeft = `${15 + (level * 12)}px`;

    return (
        <React.Fragment>
            <div
                className={`file-item ${item.id === activeFileId ? 'active' : ''} ${item.type}`}
                style={{ paddingLeft }}
                onClick={() => item.type === 'folder' ? onToggle(item.id) : onSelect(item.id)}
                onDoubleClick={(e) => { e.stopPropagation(); setIsRenaming(true); }}
            >
                <div className="file-content" style={{ display: 'flex', alignItems: 'center', flex: 1, overflow: 'hidden' }}>

                    {/* Folder Arrow */}
                    {item.type === 'folder' && (
                        <span className={`folder-arrow ${isOpen ? 'open' : ''}`} style={{ marginRight: 4 }}>
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <polyline points="6 9 12 15 18 9" />
                            </svg>
                        </span>
                    )}

                    {/* Icon */}
                    <span className={`file-icon ${item.type === 'folder' ? 'icon-folder' : 'icon-file'}`}>
                        {item.type === 'folder' ? (
                            isOpen ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                </svg>
                            ) : (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                </svg>
                            )
                        ) : (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                                <polyline points="13 2 13 9 20 9" />
                            </svg>
                        )}
                    </span>

                    {/* Name or Input */}
                    {isRenaming ? (
                        <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onBlur={handleRenameSubmit}
                            onKeyDown={handleKeyDown}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            className="rename-input"
                        />
                    ) : (
                        <span className="file-name">{item.name}</span>
                    )}
                </div>

                {/* Actions (Hover) */}
                <div className="item-actions">
                    {item.type === 'folder' && (
                        <React.Fragment>
                            <button className="action-btn-mini" title="New File" onClick={(e) => { e.stopPropagation(); onCreateFile(item.id); }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                    <polyline points="14 2 14 8 20 8" />
                                    <line x1="12" y1="18" x2="12" y2="12" />
                                    <line x1="9" y1="15" x2="15" y2="15" />
                                </svg>
                            </button>
                            <button className="action-btn-mini" title="New Folder" onClick={(e) => { e.stopPropagation(); onCreateFolder(item.id); }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                                    <line x1="12" y1="11" x2="12" y2="17" />
                                    <line x1="9" y1="14" x2="15" y2="14" />
                                </svg>
                            </button>
                        </React.Fragment>
                    )}
                    <button
                        className="delete-btn"
                        onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                        title="Delete"
                    >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                    </button>
                </div>
            </div>

            {/* Render Children */}
            {item.type === 'folder' && isOpen && (
                <div className="folder-children">
                    {files
                        .filter(f => f.parentId === item.id)
                        .map(child => (
                            <FileTreeItem
                                key={child.id}
                                item={child}
                                level={level + 1}
                                files={files}
                                activeFileId={activeFileId}
                                onSelect={onSelect}
                                onToggle={onToggle}
                                onDelete={onDelete}
                                onRename={onRename}
                                onCreateFile={onCreateFile}
                                onCreateFolder={onCreateFolder}
                            />
                        ))
                    }
                </div>
            )}
        </React.Fragment>
    );
};

const FileExplorer = ({
    files,
    activeFileId,
    onFileSelect,
    onCreateFile,
    onCreateFolder,
    onDeleteFile,
    onRenameItem,
    onToggleFolder,
    onImport,
    isCollapsed,
    onToggleCollapse
}) => {

    if (isCollapsed) {
        return (
            <div className="file-explorer collapsed">
                <div className="explorer-header">
                    <button onClick={onToggleCollapse} title="Expand Explorer">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                            <line x1="9" y1="3" x2="9" y2="21" />
                        </svg>
                    </button>
                </div>
            </div>
        );
    }

    // Get root items (parentId is null)
    const rootItems = files.filter(f => !f.parentId);

    return (
        <div className="file-explorer">
            <div className="explorer-header">
                <span>Explorer</span>
                <button onClick={onToggleCollapse} title="Collapse Explorer">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="12" />
                        <line x1="6" y1="12" x2="18" y2="18" />
                    </svg>
                </button>
            </div>

            <div className="file-actions">
                <button className="action-btn-small" onClick={() => onCreateFile(null)} title="New File">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="12" y1="18" x2="12" y2="12" />
                        <line x1="9" y1="15" x2="15" y2="15" />
                    </svg>
                </button>
                <button className="action-btn-small" onClick={() => onCreateFolder(null)} title="New Folder">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                        <line x1="12" y1="11" x2="12" y2="17" />
                        <line x1="9" y1="14" x2="15" y2="14" />
                    </svg>
                </button>
                <button className="action-btn-small" onClick={onImport} title="Import JSON">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                </button>
            </div>

            <div className="file-list">
                {rootItems.map(item => (
                    <FileTreeItem
                        key={item.id}
                        item={item}
                        level={0}
                        files={files}
                        activeFileId={activeFileId}
                        onSelect={onFileSelect}
                        onToggle={onToggleFolder}
                        onDelete={onDeleteFile}
                        onRename={onRenameItem}
                        onCreateFile={onCreateFile}
                        onCreateFolder={onCreateFolder}
                    />
                ))}
            </div>
        </div>
    );
};

export default FileExplorer;
