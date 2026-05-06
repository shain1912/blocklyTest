import React, { useState, useRef, useEffect, useCallback } from 'react';
import OpenAI from 'openai';
import { getInstalledLibraries } from '../utils/libraryManager';
import { generateLibraryBlocks } from '../utils/autoBlockGen';
import { pythonToBlockly } from '../utils/legacy/transpiler';  // Sprint 5: offline fallback only
import { pythonToBlocksViaAst } from '../utils/pyAst';
import { installLibrary } from '../utils/libraryManager';
import './AIAgent.css';

const BLOCK_SCHEMA = `
HAT BLOCKS (top-level containers):
- on_start: inputs: { DO: { block: <first statement> } }
- on_forever: inputs: { DO: { block: <first statement> } }

STATEMENT BLOCKS:
- print: fields: { TEXT: string }
- variable: fields: { VAR_NAME: string, VALUE: string }
- change_variable: fields: { VAR_NAME: string, VALUE: string }
- wait: fields: { SECONDS: number }
- repeat: fields: { TIMES: number }, inputs: { DO: { block: ... } }
- loop_forever: inputs: { DO: { block: ... } }
- if: fields: { CONDITION: string }, inputs: { DO: { block: ... } }
- if_else: fields: { CONDITION: string }, inputs: { DO: ..., ELSE: ... }

MOTION: move_right {STEPS}, turn_right {DIRECTION:'right'|'left', DEGREES},
        go_to_position {X,Y}, glide_to_position {SECONDS,X,Y},
        change_x {DX}, change_y {DY}, set_x {X}, set_y {Y}, if_on_edge_bounce

LOOKS: say (inputs.TEXT.block), say_for_seconds (fields.SECONDS + inputs.TEXT),
       think, think_for_seconds, set_size {SIZE}, show, hide

STRUCTURE: structure_import {LIBRARY}, structure_module_def {NAME} inputs.CONTENT,
           structure_typed_function {NAME, ARGS, RETURN_TYPE} inputs.STACK

VALUE BLOCKS: text {TEXT}, math_number {NUM}
CHAINING: "next": { "block": { ... } }
`;

const buildSystemPrompt = (installedLibs) => {
  const libSchema = installedLibs.length > 0
    ? '\nINSTALLED LIBRARIES:\n' + installedLibs.map(l =>
        `[${l.pkg.name}]: ${(l.pkg.blocks || []).map(b => b.type).join(', ')}`
      ).join('\n')
    : '';

  return `You are a Blockly coding assistant. The project parses Python into exact,
structural blocks via a CPython-AST pipeline — you do NOT need to restrict
yourself to a narrow Scratch DSL anymore. Write idiomatic Python. Use any
library. f-strings, keyword args, comprehensions, with/try/async, classes,
decorators — all supported and preserved as real blocks.

## Your role (Blueprint Layer 5: Abstraction)

You are an ABSTRACTION layer, not a parser. Your job is to:

- propose_abstraction: look at the user's exact-block graph and suggest
  higher-level semantic blocks or fold candidates
- apply_abstraction: replace a span of exact blocks with a higher-level one
- explain_block_group: describe what a cluster of blocks does
- fold_boilerplate_region: collapse a familiar idiom (webcam read + fallback,
  try/except/finally around a resource) into a single semantic wrapper

You are NOT responsible for:

- source parsing (the /ast endpoint does this deterministically)
- roundtrip preservation (the exact IR guarantees it)
- block shape correctness (the visitor owns that)

When the user asks for code, write ordinary Python. The AST path will take
care of blockification without LLM involvement.

## Tool Usage
- load_python: write valid Python — any library, any construct
- load_blocks: only if the user asks for raw Blockly JSON
- install_library: when the user asks to add a library
- propose_abstraction: inspect the current workspace and list fold candidates
- NEVER describe code in chat — always call a tool${libSchema}`;
};

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'load_blocks',
      description: 'Load Blockly workspace JSON into the editor.',
      parameters: {
        type: 'object',
        properties: {
          blocks: { type: 'object', description: 'Full Blockly workspace JSON { blocks: { blocks: [...] } }' }
        },
        required: ['blocks']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'load_python',
      description: 'Write Python code that gets auto-converted to real structural blocks via CPython AST. Any library, any syntax — no DSL restrictions.',
      parameters: {
        type: 'object',
        properties: {
          python: { type: 'string', description: 'Arbitrary Python source code.' }
        },
        required: ['python']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'propose_abstraction',
      description: 'List named abstraction candidates for the current workspace — groups of exact blocks that could be folded into a single higher-level semantic block. Returns the proposals without applying them.',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Why this abstraction is worth proposing.' },
        },
        required: ['reason'],
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'explain_block_group',
      description: 'Describe in plain language what a region of blocks does. The region is a list of block types present in the workspace.',
      parameters: {
        type: 'object',
        properties: {
          block_types: { type: 'array', items: { type: 'string' } },
          summary: { type: 'string', description: 'Short human-readable summary.' },
        },
        required: ['block_types', 'summary'],
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_file',
      description: 'Create a new project file/tab.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'switch_to_file',
      description: 'Switch to an existing file by name.',
      parameters: {
        type: 'object',
        properties: { name: { type: 'string' } },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List all open project files.',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'install_library',
      description: 'Auto-generate and install block definitions for a Python library.',
      parameters: {
        type: 'object',
        properties: {
          library_name: { type: 'string' },
          context: { type: 'string' }
        },
        required: ['library_name']
      }
    }
  }
];

const TOOL_ICONS = {
  load_blocks: '🧩', load_python: '🐍', create_file: '📄',
  switch_to_file: '🔀', list_files: '📋', install_library: '📦',
};

const SNIPPETS = [
  {
    label: '📦 import + while',
    code: `import time\nwhile True:\n    sprite.move(10)\n    sprite.if_on_edge_bounce()\n    time.sleep(0.05)\n`,
  },
  {
    label: '🏗️ class 정의',
    code: `class Animal:\n    def speak(name) -> None:\n        sprite.say(name)\n    def walk(steps) -> None:\n        sprite.move(steps)\n        sprite.turn(90)\n`,
  },
  {
    label: '🔧 def (마이블록)',
    code: `def draw_square(size) -> None:\n    for i in range(4):\n        sprite.move(size)\n        sprite.turn(90)\n\nfor i in range(3):\n    draw_square(50)\n    sprite.move(20)\n`,
  },
  {
    label: '📊 변수 + if/else',
    code: `score = 0\nfor i in range(5):\n    score += 10\n    if score > 30:\n        sprite.say("WIN!")\n        sprite.set_size(150)\n    else:\n        sprite.say(score)\n        sprite.set_size(100)\n    time.sleep(0.5)\n`,
  },
  {
    label: '🔄 중첩 for + AugAssign',
    code: `total = 0\nfor i in range(3):\n    for j in range(4):\n        sprite.move(20)\n        sprite.turn(90)\n        total += 1\n    sprite.move(-30)\n    sprite.say(total)\n    time.sleep(0.3)\n`,
  },
  {
    label: '🏛️ class + import',
    code: `import time\n\nclass Mover:\n    def zigzag(dist) -> None:\n        sprite.move(dist)\n        sprite.turn(45)\n        sprite.move(dist)\n        sprite.turn(-45)\n\nfor i in range(6):\n    sprite.move(30)\n    sprite.turn(60)\n    time.sleep(0.2)\n`,
  },
  {
    label: '🎯 AugAssign 카운터',
    code: `count = 0\nx = 10\nwhile True:\n    sprite.move(x)\n    sprite.if_on_edge_bounce()\n    count += 1\n    x += 2\n    if count > 20:\n        sprite.say("Done!")\n        count = 0\n        x = 10\n    time.sleep(0.1)\n`,
  },
  {
    label: '📐 복합 클래스',
    code: `class Shape:\n    def triangle(size) -> None:\n        for i in range(3):\n            sprite.move(size)\n            sprite.turn(120)\n    def square(size) -> None:\n        for i in range(4):\n            sprite.move(size)\n            sprite.turn(90)\n`,
  },
  {
    label: '🏀 중력 바운스',
    code: `vy = 0\nvx = 5\nbounce = 0\nwhile True:\n    vy += -1\n    sprite.change_y(vy)\n    sprite.change_x(vx)\n    sprite.if_on_edge_bounce()\n    if vy < -12:\n        vy = 10\n        bounce += 1\n        sprite.say(bounce)\n    time.sleep(0.03)\n`,
  },
];

const ENV_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';
const DEFAULT_MODEL = 'gpt-5.4-mini';

const AIAgent = ({ onLoadBlocks, currentPython, onClose, files, onCreateFile, onSwitchFile, onToolboxChange }) => {
  const [apiKey, setApiKey] = useState(() => ENV_KEY || localStorage.getItem('openai-api-key') || '');
  const [showKeyInput, setShowKeyInput] = useState(!ENV_KEY && !localStorage.getItem('openai-api-key'));
  const [model, setModel] = useState(() => localStorage.getItem('openai-model') || DEFAULT_MODEL);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [streamingContent, setStreamingContent] = useState('');
  const [showSnippets, setShowSnippets] = useState(false);
  const [directPython, setDirectPython] = useState('');
  const [directError, setDirectError] = useState('');
  const messagesEndRef = useRef(null);
  const filesRef = useRef(files);
  useEffect(() => { filesRef.current = files; }, [files]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  const saveApiKey = () => {
    const trimmed = apiKey.trim();
    setApiKey(trimmed);
    if (!ENV_KEY) localStorage.setItem('openai-api-key', trimmed);
    setShowKeyInput(false);
    setError('');
  };

  const clearApiKey = () => {
    localStorage.removeItem('openai-api-key');
    setApiKey('');
    setShowKeyInput(true);
    setError('');
  };

  const executeTool = useCallback(async (name, args) => {
    switch (name) {
      case 'load_blocks': {
        try { onLoadBlocks(args.blocks); return { ok: true, message: 'Blocks loaded.' }; }
        catch (e) { return { ok: false, error: e.message }; }
      }
      case 'load_python': {
        // Canonical path: real CPython AST → structural blocks. Fall back to
        // the old regex transpiler only if the backend is down (keeps sprite
        // demos working offline).
        try {
          let json = await pythonToBlocksViaAst(args.python, { wrapRunnable: true });
          if (!json || !json.blocks?.blocks?.length) {
            json = pythonToBlockly(args.python, { wrapRunnable: true });
          }
          if (!json.blocks.blocks.length) return { ok: false, error: 'No blocks generated.' };
          onLoadBlocks(json);
          return { ok: true, message: `Python → ${json.blocks.blocks.length} block(s) loaded.` };
        } catch (e) { return { ok: false, error: `Transpile failed: ${e.message}` }; }
      }
      case 'propose_abstraction': {
        // Snapshot the current workspace block graph as an abstraction candidate list.
        // The LLM sees the list and can then call apply via load_python if the user accepts.
        const types = (typeof window !== 'undefined' && window.__blocklyWorkspace)
          ? window.__blocklyWorkspace.getAllBlocks().map(b => b.type)
          : [];
        return {
          ok: true,
          reason: args.reason || '(no reason given)',
          workspace_block_types: types,
          note: 'User can accept by requesting an edit; the agent should not auto-apply.',
        };
      }
      case 'explain_block_group': {
        return { ok: true, block_types: args.block_types, summary: args.summary };
      }
      case 'create_file': {
        if (!onCreateFile) return { ok: false, error: 'Not available.' };
        const id = onCreateFile(null, args.name);
        await new Promise(r => setTimeout(r, 120));
        return { ok: true, fileId: id, message: `File "${args.name}" created.` };
      }
      case 'switch_to_file': {
        if (!onSwitchFile) return { ok: false, error: 'Not available.' };
        const file = (filesRef.current || []).find(f => f.name === args.name && f.type !== 'folder');
        if (!file) return { ok: false, error: `File "${args.name}" not found.` };
        onSwitchFile(file.id);
        await new Promise(r => setTimeout(r, 120));
        return { ok: true, message: `Switched to "${args.name}".` };
      }
      case 'list_files': {
        return { files: (filesRef.current || []).filter(f => f.type !== 'folder').map(f => f.name) };
      }
      case 'install_library': {
        if (!apiKey) return { ok: false, error: 'API key required.' };
        try {
          setMessages(prev => [...prev, {
            role: 'tool_status', toolName: 'install_library',
            args, result: { message: `Generating blocks for "${args.library_name}"...` }
          }]);
          const pkg = await generateLibraryBlocks(args.library_name, apiKey, args.context || '');
          installLibrary(pkg);
          if (onToolboxChange) onToolboxChange();
          return { ok: true, message: `"${args.library_name}" installed with ${pkg.blocks?.length || 0} blocks.` };
        } catch (e) { return { ok: false, error: e.message }; }
      }
      default: return { ok: false, error: `Unknown tool: ${name}` };
    }
  }, [onLoadBlocks, onCreateFile, onSwitchFile, apiKey, onToolboxChange]);

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    if (!apiKey) { setShowKeyInput(true); return; }

    const userMsg = input.trim();
    setInput('');
    setError('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);
    setStreamingContent('');

    try {
      const client = new OpenAI({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: true });
      const installedLibs = getInstalledLibraries();

      const contextNote = currentPython?.trim()
        ? `\n\nCurrent workspace Python:\n\`\`\`python\n${currentPython}\n\`\`\``
        : '';
      const fileList = (filesRef.current || []).filter(f => f.type !== 'folder').map(f => f.name);
      const filesNote = fileList.length ? `\nOpen files: ${JSON.stringify(fileList)}` : '';

      // Build messages array (OpenAI format)
      let apiMessages = [
        { role: 'system', content: buildSystemPrompt(installedLibs) },
        ...messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMsg + contextNote + filesNote },
      ];

      let maxSteps = 10;
      while (maxSteps-- > 0) {
        let fullText = '';
        const toolCallsMap = {};
        let finishReason = 'stop';

        setStreamingContent('');

        const stream = await client.chat.completions.create({
          model: model,
          max_completion_tokens: 4096,
          messages: apiMessages,
          tools: TOOLS,
          tool_choice: 'auto',
          stream: true,
        });

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta;
          const reason = chunk.choices[0]?.finish_reason;
          if (reason) finishReason = reason;

          if (delta?.content) {
            fullText += delta.content;
            setStreamingContent(fullText);
          }

          if (delta?.tool_calls) {
            for (const tc of delta.tool_calls) {
              const idx = tc.index;
              if (!toolCallsMap[idx]) toolCallsMap[idx] = { id: '', name: '', arguments: '' };
              if (tc.id) toolCallsMap[idx].id = tc.id;
              if (tc.function?.name) toolCallsMap[idx].name += tc.function.name;
              if (tc.function?.arguments) toolCallsMap[idx].arguments += tc.function.arguments;
            }
          }
        }

        setStreamingContent('');
        const toolCallsList = Object.values(toolCallsMap);

        if (toolCallsList.length > 0) {
          // Add assistant message with tool_calls
          apiMessages.push({
            role: 'assistant',
            content: fullText || null,
            tool_calls: toolCallsList.map(tc => ({
              id: tc.id,
              type: 'function',
              function: { name: tc.name, arguments: tc.arguments }
            }))
          });

          // Execute tools and add results
          for (const tc of toolCallsList) {
            let parsedArgs = {};
            try { parsedArgs = JSON.parse(tc.arguments); } catch { /* ignore */ }
            const result = await executeTool(tc.name, parsedArgs);
            setMessages(prev => [...prev, {
              role: 'tool_status', toolName: tc.name, args: parsedArgs, result,
            }]);
            apiMessages.push({
              role: 'tool',
              tool_call_id: tc.id,
              content: JSON.stringify(result),
            });
          }
        } else {
          if (fullText) {
            setMessages(prev => [...prev, { role: 'assistant', content: fullText }]);
          }
          break;
        }

        if (finishReason === 'stop') break;
      }

    } catch (e) {
      const errMsg = e.message || String(e);
      const is401 = errMsg.includes('401') || errMsg.includes('Incorrect API key') || errMsg.includes('invalid_api_key');
      setError(is401 ? '🔑 API 키가 유효하지 않습니다. 키를 재설정하세요.' : errMsg);
      if (is401) setShowKeyInput(true);
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${errMsg}`, isError: true }]);
    } finally {
      setIsLoading(false);
      setStreamingContent('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // Unified Python→Blocks: always try the AST path first, fall back to the
  // legacy regex transpiler only if the backend is unreachable. That way
  // the UI produces the SAME blocks regardless of where the Python came from
  // (AI tool call / snippet card / direct paste).
  const toBlocksJson = async (code) => {
    let json = await pythonToBlocksViaAst(code, { wrapRunnable: true });
    if (!json || !json.blocks?.blocks?.length) {
      json = pythonToBlockly(code, { wrapRunnable: true });
    }
    return json;
  };

  const loadSnippet = async (label, code) => {
    setDirectError('');
    setDirectPython(code);
    try {
      const json = await toBlocksJson(code);
      if (!json.blocks.blocks.length) throw new Error('블록 생성 없음');
      onLoadBlocks(json);
      const types = json.blocks.blocks.map(b => b.type).join(', ');
      setMessages(prev => [...prev,
        { role: 'user', content: `[스니펫] ${label}` },
        { role: 'assistant', content: `✅ ${json.blocks.blocks.length}개 블록 생성됨\n타입: ${types}\n\n코드:\n${code}` },
      ]);
    } catch (e) {
      setDirectError(`변환 실패: ${e.message}`);
      setMessages(prev => [...prev,
        { role: 'user', content: `[스니펫] ${label}` },
        { role: 'assistant', content: `❌ 변환 실패: ${e.message}\n\n코드:\n${code}`, isError: true },
      ]);
    }
  };

  const loadDirectPython = async () => {
    setDirectError('');
    if (!directPython.trim()) return;
    try {
      const json = await toBlocksJson(directPython);
      if (!json.blocks.blocks.length) throw new Error('블록이 생성되지 않음 — 지원되지 않는 패턴 확인');
      onLoadBlocks(json);
    } catch (e) {
      setDirectError(`변환 실패: ${e.message}`);
    }
  };

  const renderMessage = (msg, i) => {
    if (msg.role === 'tool_status') {
      const icon = TOOL_ICONS[msg.toolName] || '🔧';
      const ok = msg.result?.ok !== false;
      const label = msg.result?.message || msg.result?.error || JSON.stringify(msg.result);
      return (
        <div key={i} className="ai-tool-status">
          <span className="ai-tool-icon">{icon}</span>
          <span className="ai-tool-name">{msg.toolName}</span>
          <span className={`ai-tool-result ${ok ? 'ok' : 'fail'}`}>{label}</span>
        </div>
      );
    }
    return (
      <div key={i} className={`ai-message ${msg.role} ${msg.isError ? 'error' : ''}`}>
        <div className="ai-message-role">
          {msg.role === 'user' ? '👤 You' : `✨ ${model}`}
        </div>
        <div className="ai-message-content">
          <span style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{msg.content}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="ai-agent">
      <div className="ai-header">
        <div className="ai-title">
          <span className="ai-icon">✨</span>
          <span>AI Agent</span>
          <span className="ai-subtitle">{model} · Vibe Coding</span>
        </div>
        <div className="ai-header-actions">
          {!ENV_KEY && (
            <button className="ai-key-btn" onClick={() => setShowKeyInput(v => !v)} title="API Key">
              🔑
            </button>
          )}
          {ENV_KEY && <span className="ai-env-badge" title="API key from .env">🔒 env</span>}
          <button className="ai-close-btn" onClick={onClose}>✕</button>
        </div>
      </div>

      {showKeyInput && (
        <div className="ai-key-panel">
          <label>OpenAI API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-..."
            onKeyDown={e => e.key === 'Enter' && saveApiKey()}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={saveApiKey}>Save</button>
            {apiKey && <button onClick={clearApiKey} style={{ background: '#7f1d1d' }}>Clear</button>}
          </div>
          <label style={{ marginTop: 8 }}>Model</label>
          <input
            type="text"
            value={model}
            onChange={e => { setModel(e.target.value); localStorage.setItem('openai-model', e.target.value); }}
            placeholder="gpt-4.1"
            style={{ fontFamily: 'monospace', fontSize: 12 }}
          />
          <div className="ai-model-presets">
            {['gpt-5.4-mini', 'gpt-5.4', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4o'].map(m => (
              <button key={m} className={`ai-preset-btn ${model === m ? 'active' : ''}`}
                onClick={() => { setModel(m); localStorage.setItem('openai-model', m); }}>
                {m}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Quick Test Panel */}
      <div className="ai-quick-panel">
        <div className="ai-quick-header">
          <span>⚡ 빠른 테스트</span>
          <button className="ai-quick-toggle" onClick={() => setShowSnippets(v => !v)}>
            {showSnippets ? '▲ 닫기' : '▼ 스니펫'}
          </button>
        </div>
        {showSnippets && (
          <div className="ai-quick-body">
            <div className="ai-snippet-grid">
              {SNIPPETS.map(s => (
                <button key={s.label} className="ai-snippet-btn" onClick={() => loadSnippet(s.label, s.code)}>
                  {s.label}
                </button>
              ))}
            </div>
            <div className="ai-direct-python">
              <textarea
                className="ai-direct-input"
                rows={5}
                value={directPython}
                onChange={e => setDirectPython(e.target.value)}
                placeholder={'# 직접 Python 입력\nsprite.move(50)\ntime.sleep(1)\nsprite.say("hello")'}
                spellCheck={false}
              />
              <button className="ai-direct-btn" onClick={loadDirectPython} disabled={!directPython.trim()}>
                🐍 → 🧩 변환
              </button>
            </div>
            {directError && <div className="ai-direct-error">{directError}</div>}
          </div>
        )}
      </div>

      <div className="ai-messages">
        {messages.length === 0 && (
          <div className="ai-empty">
            <div className="ai-empty-icon">🤖</div>
            <p>Python 코드를 작성하면 자동으로 블록으로 변환됩니다.</p>
            <div className="ai-examples">
              <button onClick={() => setInput('스프라이트가 별 모양으로 움직이는 Python 코드 작성해줘')}>
                🐍 파이썬 바이브코딩
              </button>
              <button onClick={() => setInput('turtle 라이브러리 블록 설치해줘')}>
                📦 라이브러리 자동 설치
              </button>
              <button onClick={() => setInput('Animal 클래스 파일과 Main 파일 2개 만들어줘')}>
                📄 멀티파일 프로젝트
              </button>
              <button onClick={() => setInput('Make sprite bounce back and forth with a counter')}>
                🎮 바운스 애니메이션
              </button>
            </div>
          </div>
        )}

        {messages.map(renderMessage)}

        {isLoading && (
          <div className="ai-message assistant">
            <div className="ai-message-role">✨ {model}</div>
            <div className="ai-message-content">
              {streamingContent ? (
                <span style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{streamingContent}</span>
              ) : (
                <div className="ai-thinking"><span></span><span></span><span></span></div>
              )}
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="ai-error">
          {error}
          {(error.includes('API 키') || error.includes('api key')) && (
            <button onClick={clearApiKey} style={{ marginLeft: 8, fontSize: 11, padding: '2px 6px' }}>
              키 재설정
            </button>
          )}
        </div>
      )}

      <div className="ai-input-area">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="블록 만들기, Python 바이브코딩, 라이브러리 설치... (Enter to send)"
          disabled={isLoading}
          rows={3}
        />
        <button
          className="ai-send-btn"
          onClick={sendMessage}
          disabled={isLoading || !input.trim()}
        >
          {isLoading ? '...' : '▶'}
        </button>
      </div>
    </div>
  );
};

export default AIAgent;
