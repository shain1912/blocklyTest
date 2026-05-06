/**
 * Sprite-DSL ↔ curated-block schemas.
 *
 * These map the Python forms the user actually types (`sprite.move(30)`,
 * `sprite.say('hi')`, `time.sleep(0.5)`, …) onto the curated Scratch-style
 * blocks that already exist in the toolbox (`move_right`, `say`, `wait`, …).
 *
 * Without these, pyAst would fall through to the structural `py_call` /
 * `py_stmt` escape-hatch path and the user would see "sprite.move" labels on
 * gray blocks instead of "move 30 steps". With them, the bidirectional view
 * stays inside the curated vocabulary.
 *
 * Wired up in App.jsx at startup via installLibrary() — these schemas live
 * under a hidden builtin package so they don't get a toolbox category of
 * their own (the curated blocks already have homes in Motion / Looks /
 * Control). They participate in librarySchemaRegistry's matching just like
 * any installed library.
 */

// Schema shape (extended): see librarySchemaRegistry comments. We add
// `valueInputs` for slots that are Blockly value-inputs (block-shaped slot)
// rather than text fields.
const sprite = (path, arity, block, fields, valueInputs = []) => ({
  callPath: path, arity,
  keywords: [], allowExtraKw: true,
  block, fields, valueInputs,
});

const SCHEMAS = [
  // ── Motion ───────────────────────────────────────────────────────────────
  sprite('sprite.move',  1, 'move_right',         ['STEPS']),
  sprite('sprite.set_x', 1, 'set_x',              ['X']),
  sprite('sprite.set_y', 1, 'set_y',              ['Y']),
  sprite('sprite.change_x', 1, 'change_x',        ['DX']),
  sprite('sprite.change_y', 1, 'change_y',        ['DY']),
  sprite('sprite.set_size', 1, 'set_size',        ['SIZE']),
  sprite('sprite.goto',  2, 'go_to_position',     ['X', 'Y']),
  sprite('sprite.glide', 3, 'glide_to_position',  ['SECONDS', 'X', 'Y']),

  // turn(+n) / turn(-n) — direction is encoded in the sign. We can only set
  // it when we see a concrete numeric Constant; otherwise drop to py_stmt.
  // Schema-level we just claim arity 1 with field DEGREES; the matcher fills
  // the literal value as-is (negative numbers stay negative — turn_right's
  // generator uses `direction === 'left' ? -1 : 1` for the SIGN, so we
  // route signed forms through DIRECTION='right' and flip negatives at gen
  // time. Cleaner alternative: a tiny custom builder. Done in App.jsx setup.

  // ── Looks ────────────────────────────────────────────────────────────────
  // say takes a TEXT value-input — wrap argument in a `text` block.
  sprite('sprite.say',          1, 'say',              ['TEXT'], ['TEXT']),
  sprite('sprite.say',          2, 'say_for_seconds',  ['TEXT', 'SECONDS'], ['TEXT']),
  sprite('sprite.think',        1, 'think',            ['TEXT'], ['TEXT']),
  sprite('sprite.think',        2, 'think_for_seconds', ['TEXT', 'SECONDS'], ['TEXT']),
  sprite('sprite.show',         0, 'show',             []),
  sprite('sprite.hide',         0, 'hide',             []),
  sprite('sprite.switch_costume',  1, 'switch_costume', ['COSTUME']),
  sprite('sprite.next_costume',    0, 'next_costume',  []),
  sprite('stage.switch_backdrop',  1, 'switch_backdrop', ['BACKDROP']),
  sprite('stage.next_backdrop',    0, 'next_backdrop', []),

  // ── Control / Sensing utilities ──────────────────────────────────────────
  sprite('time.sleep',          1, 'wait',             ['SECONDS']),
  sprite('sprite.if_on_edge_bounce', 0, 'if_on_edge_bounce', []),
  sprite('sprite.point_in_direction', 1, 'point_in_direction', ['DIRECTION']),

  // ── Python builtins (str / int / float / len / …) ────────────────────────
  // All map to the single `py_builtin_cast` block whose FUNC dropdown picks
  // the actual builtin. `staticFields` is the registry extension: schema
  // sets FUNC='str' (etc.) regardless of args; the single positional arg
  // plugs into the VALUE value-input.
  ...['str', 'int', 'float', 'len', 'bool', 'abs', 'repr', 'type', 'round']
    .map(fn => ({
      callPath: fn, arity: 1, keywords: [], allowExtraKw: true,
      block: 'py_builtin_cast',
      fields: ['VALUE'], valueInputs: ['VALUE'],
      staticFields: { FUNC: fn },
    })),
];

/**
 * Synthetic library package — not installed via UI, only at startup.
 * No `toolboxCategory` → no extra category clutter; the curated blocks
 * already live in their own categories (Motion / Looks / etc.).
 */
export const SPRITE_DSL_PACKAGE = {
  name: '__builtin_sprite_dsl__',
  version: '1.0.0',
  description: 'Built-in mappings from sprite/stage/time DSL to curated blocks',
  author: 'core',
  blocks: [],         // no new block defs — uses existing curated blocks
  generators: { python: {}, js: {} },
  reversePatterns: [],
  schemas: SCHEMAS,
};
