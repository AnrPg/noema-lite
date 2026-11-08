/// <reference types="node" />
/* NoemaCore.study and NoemaCore.catalog as the old UI meets them: the jobs registered for the Worker, grading, FSRS on an
   old Leitner entry, the queues and XP of the learner's day, the read models following the log (built through Compute,
   events that arrive during a rebuild kept), and the search index built through the job and kept per account. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ok } from '../kernel/result.ts';
import { manualClock } from '../adapters/memory/clock.ts';
import { memoryStorage } from '../adapters/memory/storage.ts';
import type { LoggedEvent } from '../features/study/domain/projections/input.ts';
import type { StudyModel } from '../features/study/domain/projections/model.ts';
import type { EventFeed } from '../features/study/application/read-models.ts';
import { buildBridge } from './bridge.ts';
import { buildJobRegistry } from './jobs.ts';
import { CATALOG_STORE, STUDY_BRIDGE, STUDY_EVENTS, STUDY_REGISTRATIONS } from './study.ts';
import { createToolsContainer } from './tools.ts';

const T0 = new Date(2026, 2, 29, 10).getTime();
const day = (at: number): string => {
  const d = new Date(at);
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
let n = 0;
const ev = (type: string, at: number, fields: Record<string, unknown>): LoggedEvent => {
  n++;
  return {
    id: 'e' + String(n),
    type,
    hlc: String(at).padStart(15, '0') + '-' + String(n).padStart(5, '0') + '-dev',
    device: 'dev',
    at,
    day: day(at),
    ...fields,
  } as LoggedEvent;
};

interface Study {
  grade(ex: unknown, answer: unknown, ctx?: unknown): { ok: boolean | null; score: number };
  fsrs: {
    review(state: unknown, rating: unknown, o?: { at?: number }): { phase: string; dueAt: number; reps: number };
    memory(state: unknown): { phase: string; s: number } | null;
    isDue(state: unknown, d?: string): boolean;
    dueDay(state: unknown): string | null;
    later(a: unknown, b: unknown): unknown;
  };
  cards: {
    queue(cards: { key: string }[], states: unknown, o?: unknown): { queue: { key: string }[]; due: number; fresh: number };
    countDue(states: unknown, keys?: string[], d?: string): number;
  };
  xp: {
    today(byDay: unknown, d?: string): number;
    streak(byDay: unknown, d?: string, carried?: unknown): number;
    level(xp: number): { lv: number };
  };
  models: {
    current(): StudyModel;
    start(): Promise<StudyModel>;
    rebuild(events?: LoggedEvent[]): Promise<StudyModel>;
    apply(e: LoggedEvent[]): StudyModel;
  };
}
interface Catalog {
  SCHEMA: number;
  fromPack(pack: unknown, meta?: unknown): { k: string; t: string }[];
  index(
    account: string,
    sources: () => Promise<unknown[]>,
  ): {
    refresh(): Promise<void>;
    load(): Promise<void>;
    records(): { k: string }[];
    byKey(k: string): unknown;
    state: { done: number; total: number };
  };
}

const PACK = {
  subject: { id: 'phys', name: 'Physics' },
  chapters: [
    {
      id: 'c1',
      title: 'Motion',
      sections: [{ id: 's1', title: 'Speed', blocks: [{ t: 'p', md: 'Speed is distance over time.' }] }],
      exercises: [],
    },
  ],
};

function setup(feed: EventFeed | null = null) {
  const clock = manualClock(new Date(T0), 'Europe/Athens');
  const store = memoryStorage({ collections: ['src'] });
  const c = createToolsContainer({ clock }, [
    ...STUDY_REGISTRATIONS,
    k => k.register(CATALOG_STORE, () => store.docs, { replace: true }),
    ...(feed ? [(k: Parameters<(typeof STUDY_REGISTRATIONS)[number]>[0]) => k.value(STUDY_EVENTS, feed)] : []),
  ]);
  const core = buildBridge(c, STUDY_BRIDGE) as unknown as { study: Study; catalog: Catalog };
  return { core, clock, store };
}

test('jobs: the read models, FSRS fitting and the index records are registered for the Worker and the inline fallback', () => {
  const jobs = buildJobRegistry();
  for (const name of ['study.project', 'study.fsrs.optimize', 'catalog.records']) assert.ok(jobs.get(name), name);
});

test('NoemaCore.study: grading, FSRS on an old Leitner entry, the card queue, XP and the streak on the learner day', () => {
  const { core } = setup();
  const s = core.study;
  assert.deepEqual(
    [
      s.grade({ type: 'mcq', options: ['a', 'b'], answer: 1 }, { picked: [1] }).ok,
      s.grade({ type: 'mcq', options: ['a', 'b'], answer: 1 }, { picked: [0] }).ok,
    ],
    [true, false],
  );
  assert.equal(s.grade({ type: 'cloze', text: 'a [[b]]' }, { blanks: [''] }).ok, null);
  assert.throws(() => s.grade({ type: 'nope' }, {}), { code: 'study.invalid' });

  // an old Leitner entry (box 3, due yesterday) is read as an FSRS memory: due, and reviewed from where it was
  const old = { box: 3, due: '2026-03-28' };
  assert.equal(s.fsrs.memory(old)?.phase, 'review');
  assert.equal(s.fsrs.isDue(old), true);
  assert.equal(s.fsrs.isDue(old, '2026-03-27'), false);
  const next = s.fsrs.review(old, 3);
  assert.equal(next.phase, 'review');
  assert.ok(next.dueAt > T0 + 2 * 86_400_000, 'Good on a 7-day card moves it days ahead');
  assert.equal(s.fsrs.isDue(next), false);
  assert.throws(() => s.fsrs.review(old, 0), { code: 'study.invalid' });
  assert.equal(s.fsrs.review(null, 1).phase, 'learning');

  const q = s.cards.queue([{ key: 'a' }, { key: 'b' }, { key: 'c' }], { a: old, b: next });
  assert.deepEqual(
    q.queue.map(c => c.key),
    ['a', 'c'],
  );
  assert.equal(s.cards.countDue({ a: old, b: next }), 1);

  assert.equal(s.xp.today({ '2026-03-29': 30 }), 30);
  assert.equal(s.xp.streak({ '2026-03-28': 5, '2026-03-29': 30 }), 2);
  assert.equal(s.xp.streak({ '2026-03-29': 30 }, undefined, { days: 4, through: '2026-03-28' }), 5);
  assert.equal(s.xp.level(0).lv, 1);
});

test('NoemaCore.study.models: built from the log through Compute, then following it; events during a rebuild are kept', async () => {
  const listeners: ((e: readonly LoggedEvent[]) => void)[] = [];
  const log: LoggedEvent[] = [
    ev('answer.given', T0, { subject: 'phys', item: 'x1', ok: false }),
    ev('xp.earned', T0 + 1, { subject: 'phys', amount: 10 }),
    ev('card.imported', T0 + 2, { subject: 'phys', item: 'k1', kind: 'card', state: { box: 2, due: '2026-03-30' } }),
  ];
  const feed: EventFeed = {
    all: () => Promise.resolve(ok(log)),
    subscribe: f => {
      listeners.push(f);
      return () => undefined;
    },
  };
  const { core } = setup(feed);
  const m = await core.study.models.start();
  assert.equal(m.xp.total, 10);
  assert.equal(m.subjects.phys?.answers.x1?.last, false);
  assert.ok(JSON.stringify(m.subjects).includes('"k1":'), 'the imported card');

  for (const f of listeners) f([ev('answer.given', T0 + 60_000, { subject: 'phys', item: 'x1', ok: true })]);
  assert.equal(core.study.models.current().subjects.phys?.answers.x1?.last, true);

  // an event applied while a rebuild runs ends up in the rebuilt model too
  const later = ev('xp.earned', T0 + 120_000, { amount: 5 });
  const rebuilding = core.study.models.rebuild(log);
  core.study.models.apply([later]);
  const rebuilt = await rebuilding;
  assert.equal(rebuilt.xp.total, 15);
});

test('NoemaCore.catalog: an account index built through the job, kept, and rebuilt only when a source changes', async () => {
  const { core, store } = setup();
  const cat = core.catalog;
  const direct = cat.fromPack(PACK, { id: 'phys' });
  assert.ok(direct.length > 2);
  let sig = 'v1',
    reads = 0;
  const sources = () =>
    Promise.resolve([
      {
        key: 'pack:phys',
        label: 'Physics',
        sig,
        input: () => {
          reads++;
          return Promise.resolve({ kind: 'pack', data: PACK, meta: { id: 'phys' } });
        },
      },
    ]);
  const idx = cat.index('acc1', sources);
  await idx.refresh();
  assert.deepEqual(
    idx.records().map(r => r.k),
    direct.map(r => r.k),
  );
  assert.ok(idx.byKey(direct[0]?.k ?? ''));
  const stored = await store.docs.get<{ schema: number; sig: string }>('src', 'acc1|pack:phys');
  assert.ok(stored.ok && stored.value?.schema === cat.SCHEMA && stored.value.sig === 'v1');

  // a second page: read from what is stored, nothing rebuilt while the signature is the same
  const again = cat.index('acc1', sources);
  await again.refresh();
  assert.equal(reads, 1);
  assert.equal(again.records().length, direct.length);
  sig = 'v2';
  await again.refresh();
  assert.equal(reads, 2);
  // another account sees none of it
  const other = cat.index('acc2', () => Promise.resolve([]));
  await other.load();
  assert.equal(other.records().length, 0);
});
