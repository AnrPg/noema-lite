/* The agents that build a Roadmap: their schemas are the contract's (noema.curriculum-agents.v1), their checks catch what
   the AI gets wrong, and the prompts carry the Roadmap's context. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  S_AUDIT,
  S_DAG,
  S_EXPAND,
  S_PLAN,
  agentContext,
  auditBase,
  dagPrompt,
  dagRequest,
  placementTestPrompt,
  snapshot,
  validateDag,
  validateTest,
  wishText,
} from './agents.ts';
import type { Roadmap } from './model.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');

test('the agent schemas are the contract noema.curriculum-agents.v1', () => {
  const defs = (
    JSON.parse(fs.readFileSync(path.join(ROOT, 'src/contracts/schemas/noema.curriculum-agents.v1.schema.json'), 'utf8')) as {
      $defs: Record<string, unknown>;
    }
  ).$defs;
  assert.deepEqual(defs, { dag: S_DAG, audit: S_AUDIT, expand: S_EXPAND, plan: S_PLAN });
});

test('the prompts carry the Roadmap: its goal, language and learner', () => {
  const x = agentContext({ goal: 'Linear algebra', language: 'el', apps: [2, 4] });
  assert.equal(x.languageName, 'Greek (Ελληνικά)');
  assert.match(x.learner, /beginner/);
  assert.deepEqual(x.apps, [2, 4]);
  assert.match(dagPrompt(x), /Linear algebra/);
  assert.equal(dagRequest('X'), 'Build the curriculum DAG for the goal “X”.');
  assert.equal(wishText(''), '');
  assert.match(wishText('more proofs'), /follow them\): more proofs$/);
});

const road = {
  goalId: 'g',
  goal: 'G',
  nodes: {
    a: { id: 'a', title: 'A', role: 'prereq', summary: 'the a' },
    g: { id: 'g', title: 'G', role: 'goal' },
  },
  edges: [{ from: 'a', to: 'g' }],
} as unknown as Roadmap;

test('the graph the agents read, and the base an audit adds to', () => {
  assert.deepEqual(JSON.parse(snapshot(road)), {
    goalId: 'g',
    nodes: [
      { id: 'a', title: 'A', role: 'prereq' },
      { id: 'g', title: 'G', role: 'goal' },
    ],
    edges: [['a', 'g']],
  });
  assert.equal((JSON.parse(snapshot(road, { withSummaries: true })) as { nodes: { summary?: string }[] }).nodes[0]?.summary, 'the a');
  assert.equal(auditBase(road).goalRef, 'g');
});

test('a DAG answer with a cycle or a dangling edge is sent back', () => {
  const x = agentContext({ goal: 'G', language: 'en' });
  const node = (ref: string, role: string) => ({ ref, title: ref.toUpperCase(), role, summary: 's', domain: 'math' });
  const bad = validateDag(
    {
      goalRef: 'g',
      nodes: [node('a', 'prereq'), node('b', 'prereq'), node('g', 'goal')],
      edges: [
        { fromRef: 'a', toRef: 'b' },
        { fromRef: 'b', toRef: 'a' },
        { fromRef: 'z', toRef: 'g' },
      ],
    } as never,
    x,
  );
  assert.ok(bad.length > 0);
});

test('a placement test: its prompt and its check', () => {
  const p = placementTestPrompt({ goal: 'G' }, { title: 'Step', chapters: [{ title: 'Ch', coverage: ['x', 'y'] }] } as never, 'English');
  assert.match(p, /in English/);
  assert.match(p, /- Ch: x; y/);
  assert.deepEqual(validateTest({ questions: [{ q: 'Q?', options: ['a', 'b'], answer: 1, explain: '' }] }), []);
  assert.deepEqual(validateTest({ questions: [{ q: 'Q?', options: ['a', 'b'], answer: 3, explain: '' }] }), [
    'question 1: answer index out of range',
  ]);
});
