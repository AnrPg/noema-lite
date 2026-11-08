/**
 * The Roadmap screens' unit tests: the kit's test services with the Roadmap catalogs too (i18n/roadmaps,
 * i18n/roadmaps-map, English), a fake data port that records what the screens ask, and a Roadmap with two levels.
 */
import { manualClock } from '../../../../adapters/memory/clock.ts';
import { catalogI18n } from '../../../../adapters/memory/i18n.ts';
import { ok } from '../../../../kernel/result.ts';
import { provideServices } from '../../../../ui/index.ts';
import { arb, LOCALES, uiCatalogs, type TestServices } from '../../../../ui/test/services.ts';
import type { LevelView } from '../../application/levels.ts';
import type { TestQuestion } from '../../domain/levels.ts';
import { levelProgress } from '../../domain/levels.ts';
import type { Roadmap } from '../../domain/model.ts';
import { provideRoadmapsData, type PackExercises, type RoadmapsData } from '../data.ts';

const ROOT = new URL('../../../../../i18n/', import.meta.url).pathname;
const plain = (m: Record<string, string>): Record<string, string> =>
  Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.replace(/\{(\w+), number\}/g, '{$1}')]));

export function services(): TestServices {
  const ui = uiCatalogs();
  const en = plain({ ...ui.en, ...arb(ROOT + 'roadmaps/en.arb'), ...arb(ROOT + 'roadmaps-map/en.arb') });
  const i18n = catalogI18n({ ...ui, en }, 'en');
  return {
    i18n,
    clock: manualClock(),
    locales: {
      list: () => LOCALES,
      use: tag => {
        i18n.use(tag);
        return Promise.resolve(tag);
      },
    },
  };
}

/** y1 → y2: step a at year 1, b at year 2 (b after a), with a proposal waiting when `proposal` is set. */
export function roadmap(o: { proposal?: boolean; levelTest?: boolean } = {}): Roadmap {
  return {
    id: 'r1',
    title: 'Physics',
    goal: 'Physics',
    language: 'en',
    goalId: 'b',
    levels: [
      { id: 'y1', kind: 'year', order: 1, names: { en: 'First year' } },
      { id: 'y2', kind: 'year', order: 2, names: {} },
    ],
    ...(o.levelTest ? { levelTest: true } : {}),
    nodes: {
      a: { id: 'a', title: 'Motion', role: 'prereq', level: 'y1', pack: { id: 'p-a', status: 'ready' } },
      b: { id: 'b', title: 'Energy', role: 'goal', level: 'y2' },
    },
    edges: [{ from: 'a', to: 'b' }],
    proposals: o.proposal
      ? [
          {
            id: 'p1',
            kind: 'restructure',
            at: '2026-11-07T10:00:00Z',
            via: 'claude',
            status: 'pending',
            plan: { why: 'Energy needs motion first.', steps: [{ step: 'b', level: 'y1' }] },
          },
        ]
      : [],
  } as unknown as Roadmap;
}

export const QUESTIONS: TestQuestion[] = Array.from({ length: 8 }, (_, i) => ({
  q: `Question **${i + 1}**?`,
  options: ['yes', 'no'],
  answer: 0,
  explain: `because ${i + 1}`,
}));

export interface FakeData extends RoadmapsData {
  readonly calls: string[];
  readonly notes: string[];
  c: Roadmap;
  masteredIds: Set<string>;
  reached: string[];
  /** what advance() reaches next (then nothing) */
  reachNext: string[];
  decideError: string | null;
}

/** A fake port: the Roadmap in memory, the levels as the domain computes them, every call recorded. */
export function fakeData(c: Roadmap): FakeData {
  const calls: string[] = [],
    notes: string[] = [];
  const view = (d: FakeData): LevelView => {
    const L = d.c.levels ?? [],
      got = new Set(d.reached);
    const top = L.reduce((t, l, i) => (got.has(l.id) ? i : t), -1);
    const current = L[Math.min(top + 1, L.length - 1)] ?? null;
    const progress = levelProgress(d.c, id => d.masteredIds.has(id));
    const due = d.c.levelTest ? progress.find(p => p.done && !got.has(p.id)) : undefined;
    return { ladder: [...L], progress, current, reached: [...d.reached], testDue: due?.id ?? null };
  };
  const d: FakeData = {
    calls,
    notes,
    c,
    masteredIds: new Set(),
    reached: [],
    reachNext: [],
    decideError: null,
    roadmap: (_acc, id) => (id === d.c.id ? d.c : null),
    mastered: () => id => d.masteredIds.has(id),
    isMember: () => false,
    levels: {
      view: () => Promise.resolve(ok(view(d))),
      advance: (_a, _c, _m, now) => {
        calls.push('advance');
        const r = d.reachNext.map(level => ({
          v: 1 as const,
          type: 'roadmap.level.reached' as const,
          roadmap: d.c.id,
          at: new Date(now).toISOString(),
          level,
          from: null,
          how: 'auto' as const,
        }));
        d.reached.push(...d.reachNext);
        d.reachNext = [];
        return Promise.resolve(ok({ reached: r as never, testDue: view(d).testDue }));
      },
      testTaken: (_a, _c, level, score) => {
        calls.push(`testTaken ${level} ${score}`);
        const passed = score >= 0.8;
        if (passed) d.reached.push(level);
        return Promise.resolve(ok({ passed, reached: [] }));
      },
    },
    packs: (_acc, _c, ids): Promise<PackExercises[]> => {
      calls.push(`packs ${ids.join(',')}`);
      return Promise.resolve([
        { chapters: [{ exercises: QUESTIONS.map(q => ({ type: 'mcq', q: q.q, options: q.options, answer: 0, explain: q.explain })) }] },
      ]);
    },
    placementQuestions: (_acc, _c, id) => {
      calls.push(`placement ${id}`);
      return Promise.resolve(QUESTIONS.slice(0, 4));
    },
    passStep: (_acc, _c, id, score) => {
      calls.push(`pass ${id} ${score}`);
      return score >= 0.8;
    },
    decide: (_acc, cid, pid, approve) => {
      calls.push(`decide ${cid} ${pid} ${approve}`);
      return Promise.resolve(d.decideError);
    },
    inline: md => md.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'),
    notify: t => notes.push(t),
  };
  return d;
}

const stops: (() => void)[] = [];

/** A container in the document; the body provides these services and this data port (dialogs open at its end). */
export function host(data: RoadmapsData, s: TestServices = services()): HTMLElement {
  const h = document.createElement('div');
  document.body.append(h);
  stops.push(provideServices(document.body, s), provideRoadmapsData(document.body, data));
  return h;
}

/** After each test: the page empty, the providers gone. */
export function cleanup(): void {
  for (const f of stops.splice(0)) f();
  document.body.replaceChildren();
}
