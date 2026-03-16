import React, { useState, useEffect } from 'react';
import {
  getInstalledLibraries,
  installLibrary,
  uninstallLibrary,
  exportAsLibrary,
  downloadLibraryJson,
  BUILTIN_LIBRARY_TEMPLATES
} from '../utils/libraryManager';
import './LibraryManager.css';

const LibraryManager = ({ workspace, onClose, onToolboxChange }) => {
  const [tab, setTab] = useState('installed'); // 'installed' | 'install' | 'export'
  const [installed, setInstalled] = useState([]);
  const [installText, setInstallText] = useState('');
  const [installError, setInstallError] = useState('');
  const [installSuccess, setInstallSuccess] = useState('');
  const [exportMeta, setExportMeta] = useState({ name: 'my-library', version: '1.0.0', description: '', author: '', colour: '#1d4ed8' });
  const [exportError, setExportError] = useState('');

  const refresh = () => setInstalled(getInstalledLibraries());

  useEffect(() => { refresh(); }, []);

  const handleInstallJson = () => {
    setInstallError('');
    setInstallSuccess('');
    try {
      const pkg = JSON.parse(installText.trim());
      installLibrary(pkg);
      setInstallSuccess(`✅ "${pkg.name}" v${pkg.version} installed! Reload the page to see new blocks in toolbox.`);
      setInstallText('');
      refresh();
      if (onToolboxChange) onToolboxChange();
    } catch (e) {
      setInstallError(`Error: ${e.message}`);
    }
  };

  const handleInstallBuiltin = (template) => {
    try {
      installLibrary(template);
      setInstallSuccess(`✅ "${template.name}" installed!`);
      refresh();
      if (onToolboxChange) onToolboxChange();
    } catch (e) {
      setInstallError(e.message);
    }
  };

  const handleInstallUrl = async (url) => {
    setInstallError('');
    setInstallSuccess('');
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const pkg = await res.json();
      installLibrary(pkg);
      setInstallSuccess(`✅ "${pkg.name}" installed from URL!`);
      refresh();
    } catch (e) {
      setInstallError(`Failed to fetch: ${e.message}`);
    }
  };

  const handleUninstall = (name) => {
    uninstallLibrary(name);
    refresh();
    if (onToolboxChange) onToolboxChange();
  };

  const handleExport = () => {
    setExportError('');
    try {
      const pkg = exportAsLibrary(workspace, exportMeta);
      downloadLibraryJson(pkg);
    } catch (e) {
      setExportError(e.message);
    }
  };

  const isBuiltinInstalled = (name) => installed.some(l => l.name === name);

  return (
    <div className="lib-manager">
      <div className="lib-header">
        <div className="lib-title">
          <span>📦</span>
          <span>Library Manager</span>
        </div>
        <button className="lib-close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="lib-tabs">
        {['installed', 'install', 'export'].map(t => (
          <button key={t} className={`lib-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'installed' ? `📚 Installed (${installed.length})` : t === 'install' ? '➕ Install' : '📤 Export'}
          </button>
        ))}
      </div>

      <div className="lib-body">
        {/* INSTALLED */}
        {tab === 'installed' && (
          <div className="lib-installed">
            {installed.length === 0 ? (
              <div className="lib-empty">
                <div className="lib-empty-icon">📭</div>
                <p>No libraries installed yet.</p>
                <button className="lib-action-btn" onClick={() => setTab('install')}>Install a library →</button>
              </div>
            ) : (
              installed.map(entry => (
                <div key={entry.name} className="lib-card">
                  <div className="lib-card-header">
                    <div className="lib-card-name">{entry.name}</div>
                    <div className="lib-card-version">v{entry.version}</div>
                  </div>
                  {entry.description && <div className="lib-card-desc">{entry.description}</div>}
                  {entry.author && <div className="lib-card-author">by {entry.author}</div>}
                  <div className="lib-card-blocks">
                    {(entry.pkg.blocks || []).length} blocks
                  </div>
                  <button className="lib-uninstall-btn" onClick={() => handleUninstall(entry.name)}>
                    🗑 Uninstall
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* INSTALL */}
        {tab === 'install' && (
          <div className="lib-install">
            <div className="lib-section-title">Featured Libraries</div>
            <div className="lib-featured">
              {BUILTIN_LIBRARY_TEMPLATES.map(t => (
                <div key={t.name} className="lib-featured-card">
                  <div className="lib-featured-info">
                    <div className="lib-featured-name">{t.name}</div>
                    <div className="lib-featured-desc">{t.description}</div>
                  </div>
                  <button
                    className="lib-install-btn"
                    onClick={() => handleInstallBuiltin(t)}
                    disabled={isBuiltinInstalled(t.name)}
                  >
                    {isBuiltinInstalled(t.name) ? '✓ Installed' : 'Install'}
                  </button>
                </div>
              ))}
            </div>

            <div className="lib-divider" />

            <div className="lib-section-title">Install from URL</div>
            <div className="lib-url-install">
              <input
                type="text"
                placeholder="https://example.com/my-library.blocklib.json"
                className="lib-input"
                onKeyDown={e => e.key === 'Enter' && handleInstallUrl(e.target.value)}
              />
              <button className="lib-install-btn" onClick={(e) => handleInstallUrl(e.target.previousElementSibling.value)}>
                Fetch
              </button>
            </div>

            <div className="lib-divider" />

            <div className="lib-section-title">Paste JSON</div>
            <textarea
              className="lib-json-input"
              value={installText}
              onChange={e => setInstallText(e.target.value)}
              placeholder={'{\n  "name": "my-lib",\n  "version": "1.0.0",\n  "blocks": [...]\n}'}
              rows={8}
            />
            <button
              className="lib-install-btn primary"
              onClick={handleInstallJson}
              disabled={!installText.trim()}
            >
              Install from JSON
            </button>

            {installError && <div className="lib-error">{installError}</div>}
            {installSuccess && <div className="lib-success">{installSuccess}</div>}
          </div>
        )}

        {/* EXPORT */}
        {tab === 'export' && (
          <div className="lib-export">
            <p className="lib-export-desc">
              Export your class blocks as a reusable library package (.blocklib.json).
              Others can install it with the Install tab.
            </p>

            <div className="lib-field">
              <label>Library Name</label>
              <input
                className="lib-input"
                value={exportMeta.name}
                onChange={e => setExportMeta(p => ({ ...p, name: e.target.value }))}
                placeholder="my-library"
              />
            </div>
            <div className="lib-field">
              <label>Version</label>
              <input
                className="lib-input"
                value={exportMeta.version}
                onChange={e => setExportMeta(p => ({ ...p, version: e.target.value }))}
                placeholder="1.0.0"
              />
            </div>
            <div className="lib-field">
              <label>Description</label>
              <input
                className="lib-input"
                value={exportMeta.description}
                onChange={e => setExportMeta(p => ({ ...p, description: e.target.value }))}
                placeholder="What does this library do?"
              />
            </div>
            <div className="lib-field">
              <label>Author</label>
              <input
                className="lib-input"
                value={exportMeta.author}
                onChange={e => setExportMeta(p => ({ ...p, author: e.target.value }))}
                placeholder="Your name"
              />
            </div>
            <div className="lib-field">
              <label>Color</label>
              <input
                type="color"
                value={exportMeta.colour}
                onChange={e => setExportMeta(p => ({ ...p, colour: e.target.value }))}
                className="lib-color-input"
              />
            </div>

            {exportError && <div className="lib-error">{exportError}</div>}

            <button className="lib-install-btn primary lib-export-btn" onClick={handleExport}>
              📥 Download .blocklib.json
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LibraryManager;
