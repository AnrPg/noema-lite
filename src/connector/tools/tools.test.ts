/* The connector's tool list is its contract: src/contracts/schemas/noema.mcp-tools.v1.schema.json has one $def per tool, in the
   order of TOOLS, with the tool's description and input schema (the contract is the one source; a tool that drifts fails here). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { TOOLS } from './index.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

test("noema.mcp-tools.v1 is the connector's tool list (src/connector/tools)", () => {
  const file = path.join(ROOT, 'src', 'contracts', 'schemas', 'noema.mcp-tools.v1.schema.json');
  const defs = (JSON.parse(fs.readFileSync(file, 'utf8')) as { $defs: Record<string, unknown> }).$defs;
  assert.deepEqual(
    Object.keys(defs),
    TOOLS.map(t => t.definition.name),
  );
  for (const { definition: t } of TOOLS) assert.deepEqual(defs[t.name], { description: t.description, ...t.inputSchema }, t.name);
});
