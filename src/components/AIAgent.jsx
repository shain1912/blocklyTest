import React, { useState, useRef, useEffect } from 'react';
import OpenAI from 'openai';
import { getInstalledLibraries } from '../utils/libraryManager';
import './AIAgent.css';

// Build a schema description for installed library blocks so AI knows to use them
const buildInstalledLibrarySchema = () => {
  const libs = getInstalledLibraries();
  if (libs.length === 0) return '';

  const lines = ['\nINSTALLED LIBRARY BLOCKS (ALWAYS prefer these over structure_import/structure_call):'];
  libs.forEach(entry => {
    const pkg = entry.pkg;
    lines.push(`\n[Library: ${pkg.name} v${pkg.version}]`);
    (pkg.blocks || []).forEach(b => {
      // Extract named fields from inputs
      const fields = [];
      (b.inputs || []).forEach(inp => {
        (inp.fields || []).forEach(f => {
          if (f.name) fields.push(`${f.name}: ${f.type === 'number' ? 'number' : 'string'}`);
        });
      });
      const fieldStr = fields.length ? `fields: { ${fields.join(', ')} }` : 'fields: {}';
      lines.push(`- ${b.type}: ${fieldStr}  ← "${b.tooltip || b.type}"`);
    });
  });

  lines.push('\nCRITICAL: When the user asks about ANY of these libraries, use ONLY the block types listed above.');
  lines.push('NEVER use structure_import, structure_call, or class_instance for installed library operations.');
  return lines.join('\n');
};

// All available block types with their field/input schema
const BLOCK_SCHEMA = `
Available block types (use these exact type names):

HAT BLOCKS (container blocks — wrap other blocks inside, no previous connection):
- on_start: inputs: { DO: { block: <first statement> } } → MakeCode "on start" — ALWAYS use this as the root container. Only blocks inside on_start or on_forever are executed when Run is pressed.
- on_forever: inputs: { DO: { block: <first statement> } } → MakeCode "forever" loop — runs body repeatedly

IMPORTANT: Wrap ALL runnable code inside on_start (or on_forever for loops). Floating blocks outside a hat block are IGNORED at runtime.

STATEMENT BLOCKS (have prev/next connections):
- print: fields: { TEXT: string } → displays text / sprite says it
- variable: fields: { VAR_NAME: string, VALUE: string } → set x = 5
- change_variable: fields: { VAR_NAME: string, VALUE: string } → x += 1
- comment: fields: { TEXT: string }
- wait: fields: { SECONDS: number }
- repeat: fields: { TIMES: number }, inputs: { DO: { block: <first child> } }
- loop_forever: inputs: { DO: { block: <first child> } }
- repeat_until: fields: { CONDITION: string }, inputs: { DO: { block: <first child> } }
- if: fields: { CONDITION: string }, inputs: { DO: { block: <first child> } }
- if_else: fields: { CONDITION: string }, inputs: { DO: { block: <if body> }, ELSE: { block: <else body> } }

MOTION BLOCKS:
- move_right: fields: { STEPS: number }
- turn_right: fields: { DEGREES: number }
- turn_left: fields: { DEGREES: number }
- point_in_direction: fields: { DEGREES: number }
- go_to_position: fields: { X: number, Y: number }
- glide_to_position: fields: { SECONDS: number, X: number, Y: number }
- change_x: fields: { DX: number }
- change_y: fields: { DY: number }
- set_x: fields: { X: number }
- set_y: fields: { Y: number }
- if_on_edge_bounce: fields: {}
- point_towards: fields: { TARGET: string }

LOOKS BLOCKS:
- say: inputs: { TEXT: { block: { kind: "block", type: "text", fields: { TEXT: string } } } }
- think: inputs: { TEXT: { block: { kind: "block", type: "text", fields: { TEXT: string } } } }
- say_for_seconds: fields: { SECONDS: number }, inputs: { TEXT: { block: text_block } }
- think_for_seconds: fields: { SECONDS: number }, inputs: { TEXT: { block: text_block } }
- set_size: fields: { SIZE: number }
- show: fields: {}
- hide: fields: {}
- switch_costume: fields: { COSTUME: string }
- next_costume: fields: {}

STRUCTURE BLOCKS:
- structure_module_def: fields: { NAME: string }, inputs: { CONTENT: { block: <first method> } }
- structure_typed_function: fields: { NAME: string, ARGS: string, RETURN_TYPE: "None"|"int"|"float"|"str"|"bool"|"list"|"dict"|"Any" }, inputs: { STACK: { block: <body> } }
- structure_return_typed: inputs: { VALUE: { block: value_block } }
- structure_import: fields: { LIBRARY: string }
- structure_call: fields: { NAME: string }, inputs: { ARG: { block: value_block } }

CLASS BLOCKS:
- class_define: fields: { NAME: string, PARENT: string }, inputs: { BODY: { block: <first method> } }
- class_constructor: fields: { ARGS: string }, inputs: { BODY: { block: <first statement> } }
- class_method: fields: { NAME: string, ARGS: string, RETURN_TYPE: string }, inputs: { BODY: { block: <first statement> } }
- class_instance: fields: { VAR_NAME: string, CLASS_NAME: string, ARGS: string }
- class_method_call: fields: { OBJ: string, METHOD: string, ARGS: string }

VALUE BLOCKS (used inside inputs):
- text: fields: { TEXT: string }
- math_number: fields: { NUM: number }
- logic_boolean: fields: { BOOL: "TRUE"|"FALSE" }
- variables_get: fields: { VAR: { name: string, id: string } }

CHAINING: To run blocks sequentially, use the "next" property:
{
  "kind": "block", "type": "move_right", "fields": { "STEPS": 10 },
  "next": { "block": { "kind": "block", "type": "wait", "fields": { "SECONDS": 1 } } }
}

For nested children (inside loops/if/functions), use the "inputs" property with the child input name.
`;

const buildSystemPrompt = () => `You are an expert Blockly visual programming assistant. Generate Blockly workspace JSON based on user requests.

${BLOCK_SCHEMA}
${buildInstalledLibrarySchema()}

OUTPUT FORMAT - return ONLY valid JSON, no markdown, no explanation:
{
  "blocks": {
    "blocks": [
      {
        "kind": "block",
        "type": "block_type_name",
        "x": 50,
        "y": 50,
        "fields": { ... },
        "inputs": { ... },
        "next": { "block": { ... } }
      }
    ]
  }
}

Rules:
1. Use x/y coordinates to space multiple top-level blocks (increment y by 300 each)
2. Chain sequential blocks with "next", NOT as separate top-level blocks
3. "kind": "block" is required on every block object
4. Fields are strings/numbers directly; inputs contain { block: { ... } }
5. Only use block types listed above (or installed library blocks listed above)`;

// ── OpenAI Tool Definitions ───────────────────────────────────────────────────
const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'load_blocks',
      description: 'Load Blockly workspace JSON into the currently active file. Always wrap code in on_start or on_forever hat blocks.',
      parameters: {
        type: 'object',
        properties: {
          blocks: { type: 'object', description: 'Full Blockly workspace JSON object with { blocks: { blocks: [...] } }' }
        },
        required: ['blocks']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_file',
      description: 'Create a new project file (tab) and switch to it. Use this to organize code into multiple files.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Descriptive file name, e.g. "Animal Library" or "Main"' }
        },
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
        properties: {
          name: { type: 'string', description: 'Exact name of the file to switch to' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'List all project files currently open.',
      parameters: { type: 'object', properties: {} }
    }
  }
];

const TOOL_ICONS = {
  load_blocks: '🧩',
  create_file: '📄',
  switch_to_file: '🔀',
  list_files: '📋',
};

const ENV_KEY = import.meta.env.VITE_OPENAI_API_KEY || '';

const AIAgent = ({ onLoadBlocks, currentPython, onClose, files, onCreateFile, onSwitchFile }) => {
  const [apiKey, setApiKey] = useState(() => ENV_KEY || localStorage.getItem('openai-api-key') || '');
  const [showKeyInput, setShowKeyInput] = useState(!ENV_KEY && !localStorage.getItem('openai-api-key'));
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  // Keep latest files accessible in async closures without stale state
  const filesRef = useRef(files);
  useEffect(() => { filesRef.current = files; }, [files]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const saveApiKey = () => {
    if (!ENV_KEY) localStorage.setItem('openai-api-key', apiKey);
    setShowKeyInput(false);
  };

  // ── Tool executor ────────────────────────────────────────────────────────────
  const executeTool = async (toolCall) => {
    const name = toolCall.function.name;
    const args = JSON.parse(toolCall.function.arguments || '{}');

    switch (name) {
      case 'load_blocks': {
        try {
          onLoadBlocks(args.blocks);
          return { ok: true, message: 'Blocks loaded into current workspace.' };
        } catch (e) {
          return { ok: false, error: e.message };
        }
      }
      case 'create_file': {
        if (!onCreateFile) return { ok: false, error: 'File creation not available.' };
        const id = onCreateFile(null, args.name);
        await new Promise(r => setTimeout(r, 120)); // let React flush
        return { ok: true, fileId: id, message: `File "${args.name}" created and active.` };
      }
      case 'switch_to_file': {
        if (!onSwitchFile) return { ok: false, error: 'File switching not available.' };
        const file = (filesRef.current || []).find(
          f => f.name === args.name && f.type !== 'folder'
        );
        if (!file) return { ok: false, error: `File "${args.name}" not found. Use list_files first.` };
        onSwitchFile(file.id);
        await new Promise(r => setTimeout(r, 120));
        return { ok: true, message: `Switched to "${args.name}".` };
      }
      case 'list_files': {
        const list = (filesRef.current || [])
          .filter(f => f.type !== 'folder')
          .map(f => f.name);
        return { files: list };
      }
      default:
        return { ok: false, error: `Unknown tool: ${name}` };
    }
  };

  // ── Agentic send loop ────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;
    if (!apiKey) { setShowKeyInput(true); return; }

    const userMsg = input.trim();
    setInput('');
    setError('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsLoading(true);

    try {
      const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

      const contextNote = currentPython?.trim()
        ? `\n\nCurrent workspace Python:\n\`\`\`python\n${currentPython}\n\`\`\``
        : '';
      const fileList = (filesRef.current || [])
        .filter(f => f.type !== 'folder')
        .map(f => f.name);
      const filesNote = fileList.length
        ? `\n\nOpen files: ${JSON.stringify(fileList)}`
        : '';

      // Build conversation history (skip tool_status display messages)
      let apiMessages = [
        { role: 'system', content: buildSystemPrompt() },
        ...messages
          .filter(m => m.role === 'user' || m.role === 'assistant')
          .map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userMsg + contextNote + filesNote }
      ];

      // Agentic loop: keep calling until finish_reason === 'stop'
      let maxSteps = 12;
      while (maxSteps-- > 0) {
        const response = await client.chat.completions.create({
          model: 'gpt-4o',
          max_tokens: 4096,
          messages: apiMessages,
          tools: AGENT_TOOLS,
          tool_choice: 'auto',
        });

        const choice = response.choices[0];
        const msg = choice.message;
        apiMessages.push(msg);

        if (msg.tool_calls && msg.tool_calls.length > 0) {
          // Execute tools and show status in chat
          const toolResults = [];
          for (const tc of msg.tool_calls) {
            const result = await executeTool(tc);
            // Show tool action as a chat bubble
            setMessages(prev => [...prev, {
              role: 'tool_status',
              toolName: tc.function.name,
              args: JSON.parse(tc.function.arguments || '{}'),
              result,
            }]);
            toolResults.push({
              tool_call_id: tc.id,
              role: 'tool',
              content: JSON.stringify(result),
            });
          }
          apiMessages = [...apiMessages, ...toolResults];
        } else {
          // Final text reply from AI
          const text = msg.content || '✅ Done';
          setMessages(prev => [...prev, { role: 'assistant', content: text }]);
          break;
        }

        if (choice.finish_reason === 'stop') break;
      }

    } catch (e) {
      const errMsg = e.message || String(e);
      setError(errMsg);
      setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${errMsg}`, isError: true }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  // ── Render ───────────────────────────────────────────────────────────────────
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
          {msg.role === 'user' ? '👤 You' : '✨ AI'}
        </div>
        <div className="ai-message-content">
          {msg.role === 'user'
            ? msg.content
            : msg.isError
              ? msg.content
              : <span style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{msg.content}</span>
          }
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
          <span className="ai-subtitle">Cursor for Blocks</span>
        </div>
        <div className="ai-header-actions">
          {!ENV_KEY && (
            <button className="ai-key-btn" onClick={() => setShowKeyInput(v => !v)} title="API Key">
              🔑
            </button>
          )}
          {ENV_KEY && (
            <span className="ai-env-badge" title="API key loaded from .env">🔒 env</span>
          )}
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
          <button onClick={saveApiKey}>Save</button>
        </div>
      )}

      <div className="ai-messages">
        {messages.length === 0 && (
          <div className="ai-empty">
            <div className="ai-empty-icon">🤖</div>
            <p>블록을 만들거나, 여러 파일에 걸쳐 라이브러리를 만들어달라고 해보세요.</p>
            <div className="ai-examples">
              <button onClick={() => setInput('Animal 클래스 파일과 Main 파일 2개 만들어줘')}>
                📄 멀티파일 프로젝트
              </button>
              <button onClick={() => setInput('터틀로 별 그리기')}>
                🐢 터틀 별
              </button>
              <button onClick={() => setInput('변수 x를 0으로 설정하고 10번 반복해서 1씩 증가')}>
                🔢 카운터 루프
              </button>
              <button onClick={() => setInput('Make a sprite bounce back and forth 5 times')}>
                🎮 Bounce animation
              </button>
            </div>
          </div>
        )}

        {messages.map(renderMessage)}

        {isLoading && (
          <div className="ai-message assistant">
            <div className="ai-message-role">✨ AI</div>
            <div className="ai-message-content">
              <div className="ai-thinking">
                <span></span><span></span><span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && <div className="ai-error">{error}</div>}

      <div className="ai-input-area">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="블록으로 만들고 싶은 것을 설명하세요... (Enter to send)"
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
