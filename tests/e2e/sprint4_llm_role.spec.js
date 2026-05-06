/**
 * Sprint 4 — LLM restricted to abstraction / view role.
 *
 * We don't need to actually hit the OpenAI API for these checks: the
 * meaningful acceptance criteria are about the agent's system prompt and
 * tool shape, both of which live in the frontend and are asserted by
 * reading the module directly.
 */

import { test, expect } from '@playwright/test';
import fs from 'node:fs';

const AGENT_SRC = fs.readFileSync('src/components/AIAgent.jsx', 'utf8');

test('S4-01: system prompt removed the legacy Scratch-DSL restrictions', async () => {
  // Any of the old hard-coded "FORBIDDEN" lines would regress the exact IR
  // contract. They must be gone.
  expect(AGENT_SRC).not.toMatch(/f-strings:\s+f"text/);
  expect(AGENT_SRC).not.toMatch(/print\(\)\s*→\s*use sprite\.say/);
  expect(AGENT_SRC).not.toMatch(/import time.*only "import time" is valid/);
  expect(AGENT_SRC).not.toMatch(/String concatenation with \+/);
});

test('S4-02: system prompt advertises abstraction-layer role', async () => {
  expect(AGENT_SRC).toMatch(/propose_abstraction/);
  expect(AGENT_SRC).toMatch(/abstraction layer/i);
  expect(AGENT_SRC).toMatch(/CPython[- ]?AST/i);
});

test('S4-03: TOOLS list now includes abstraction-layer tools', async () => {
  expect(AGENT_SRC).toMatch(/name:\s*'propose_abstraction'/);
  expect(AGENT_SRC).toMatch(/name:\s*'explain_block_group'/);
});

test('S4-04: load_python tool description dropped sprite-only wording', async () => {
  // The old description said "sprite.* API"; the new one says "Any library, any syntax"
  const loadPyBlock = AGENT_SRC.match(/name:\s*'load_python'[\s\S]*?parameters:/);
  expect(loadPyBlock).not.toBeNull();
  expect(loadPyBlock[0]).not.toMatch(/sprite\.\*\s+API/);
  expect(loadPyBlock[0]).toMatch(/CPython AST|no DSL restrictions/i);
});
