import OpenAI from 'openai';

const SYSTEM_PROMPT = `You are an expert at creating Blockly visual block library definitions for Python libraries.

Given a Python library name and optional context, generate a JSON library package for the most commonly used and educational functions.

## BLOCK SHAPES — choose the right shape for each function:

### 1. STATEMENT block (rectangle with connectors top+bottom) — isStatement: true
Use for: side-effect actions that return nothing (print, draw, move, save, release, show)
Generator returns a string ending with \\n:
  "const F=block.getFieldValue('FIELD'); return 'lib.method('+F+')\\n';"

### 2. VALUE block (rounded/puzzle shape, no connectors) — isStatement: false
Use for: functions that RETURN a value (read frame, get property, calculate, check bool)
Generator returns an ARRAY [expression, 0]:
  "const F=block.getFieldValue('FIELD'); return ['lib.method('+F+')', 0];"
Examples of value blocks: cap.read(), cv2.VideoCapture(0), df.shape, random.randint(a,b)

### 3. CONTAINER block (has inner stack slot) — isStatement: true + inputs includes a "statement" input
Use for: with-blocks, event handlers, context managers
  { "type": "statement", "name": "DO", "label": "" }

## EXACT JSON SCHEMA:
{
  "name": "library_name",
  "version": "1.0.0",
  "description": "Short description",
  "author": "auto-generated",
  "colour": "#HEX_COLOR",
  "blocks": [
    {
      "type": "lib_action_name",
      "tooltip": "Does X to Y",
      "colour": "#HEX_COLOR",
      "isStatement": true,
      "inputs": [
        { "type": "dummy", "fields": [
          { "name": "FIELD", "label": "shown text", "type": "number", "default": 0 }
        ]}
      ]
    },
    {
      "type": "lib_get_value",
      "tooltip": "Returns X",
      "colour": "#HEX_COLOR",
      "isStatement": false,
      "inputs": [
        { "type": "dummy", "fields": [
          { "name": "FIELD", "label": "shown text", "type": "text", "default": "val" }
        ]}
      ]
    }
  ],
  "generators": {
    "python": {
      "lib_action_name": "const F=block.getFieldValue('FIELD'); return 'lib.action('+F+')\\n';",
      "lib_get_value":   "const F=block.getFieldValue('FIELD'); return ['lib.get('+F+')', 0];"
    }
  },
  "reversePatterns": [
    { "python": "lib.action({FIELD})", "block": "lib_action_name" }
  ]
}

## RULES:
- Include 8-15 blocks covering the most useful functions
- Block type names: lowercase, underscores, prefixed with library name (e.g., cv2_read, pd_read_csv)
- inputs: ALWAYS use "type": "dummy" with a "fields" array
- field types: "number" | "text" | "dropdown"
- dropdown format: "options": [["display label", "value"], ...]
- EVERY block in "blocks" MUST have a corresponding entry in "generators.python"
- Generator strings are JavaScript function bodies — use single quotes inside, escape \\n for newlines
- isStatement false = value block (rounded) — generator MUST return array: return ['expr', 0];
- isStatement true = statement block (rectangular) — generator MUST return string: return 'code\\n';
- Mix statement and value blocks appropriately for the library
- Choose a visually distinct colour`;

export const generateLibraryBlocks = async (libraryName, apiKey, context = '', onProgress = null) => {
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  const userMessage = context
    ? `Generate Blockly blocks for the Python "${libraryName}" library.\nProject context: ${context}\nFocus on functions most relevant to this project context.`
    : `Generate Blockly blocks for the Python "${libraryName}" library.\nInclude the most commonly used and educational functions.`;

  let fullContent = '';

  if (onProgress) {
    const stream = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_completion_tokens: 4096,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) {
        fullContent += text;
        onProgress(fullContent);
      }
    }
  } else {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_completion_tokens: 4096,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    });
    fullContent = response.choices[0].message.content;
  }

  const jsonMatch = fullContent.match(/```(?:json)?\s*([\s\S]*?)```/) ||
    fullContent.match(/(\{[\s\S]*\})/);
  if (!jsonMatch) throw new Error('No valid JSON found in response');

  let raw = jsonMatch[1] || jsonMatch[0];
  // Repair common AI JSON issues inside string values:
  // - literal newlines → \\n
  // - \' (invalid JSON escape for single quote) → '
  // - \` (invalid JSON escape for backtick) → `
  raw = raw.replace(/"((?:[^"\\]|\\.)*)"/g, (match, inner) => {
    const fixed = inner
      .replace(/\r?\n/g, '\\n')
      .replace(/\\'/g, "'")
      .replace(/\\`/g, '`');
    return '"' + fixed + '"';
  });

  const pkg = JSON.parse(raw);
  if (!pkg.name || !pkg.blocks) throw new Error('Invalid package: missing name or blocks');
  return pkg;
};

export const filterBlocksForProject = async (projectDescription, allBlocks, apiKey) => {
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
  const blockList = allBlocks.map(b => `- ${b.type}: ${b.description || b.type}`).join('\n');

  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_completion_tokens: 2048,
    messages: [{
      role: 'user',
      content: `Project description: "${projectDescription}"\n\nAvailable blocks:\n${blockList}\n\nReturn ONLY a JSON array of block type strings that are most relevant to this project, ordered by importance (most useful first). Include 10-20 blocks maximum.\n\nExample: ["move_right", "turn_right", "wait", "if", "repeat"]`,
    }],
  });

  const text = response.choices[0].message.content;
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) return allBlocks.map(b => b.type);
  return JSON.parse(match[0]);
};

export const generatePythonCode = async (userPrompt, apiKey, currentCode = '', onChunk = null) => {
  const client = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });

  const systemPrompt = `You are a Python code generator for a Scratch-like sprite animation system.

Available APIs:
- sprite.move(steps), sprite.turn(degrees), sprite.set_direction(degrees)
- sprite.goto(x, y), sprite.glide(seconds, x, y)
- sprite.set_x(x), sprite.set_y(y), sprite.change_x(dx), sprite.change_y(dy)
- sprite.say(text), sprite.say(text, seconds), sprite.think(text)
- sprite.show(), sprite.hide(), sprite.set_size(percent)
- sprite.switch_costume(name), sprite.next_costume()
- sprite.if_on_edge_bounce(), sprite.point_towards(target)
- time.sleep(seconds), stage.switch_backdrop(name)
- Control: while True:, for i in range(n):, if cond:, else:
- Variables: x = 5, x += 1

OUTPUT RULES: Return ONLY Python code, no explanations, no markdown. Indent with 4 spaces.`;

  const contextNote = currentCode.trim()
    ? `\n\nCurrent code:\n\`\`\`python\n${currentCode}\n\`\`\``
    : '';

  let fullCode = '';

  if (onChunk) {
    const stream = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_completion_tokens: 2048,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt + contextNote },
      ],
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) {
        fullCode += text;
        onChunk(fullCode);
      }
    }
  } else {
    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      max_completion_tokens: 2048,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt + contextNote },
      ],
    });
    fullCode = response.choices[0].message.content;
  }

  return fullCode.replace(/^```python\n?|^```\n?|```$/gm, '').trim();
};
