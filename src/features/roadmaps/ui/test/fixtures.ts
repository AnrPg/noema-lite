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
import { statuses } from '../../domain/status.ts';
import {
  provideRoadmapsData,
  type AppTask,
  type Invite,
  type Member,
  type PackExercises,
  type RoadmapsData,
  type SourcePlan,
} from '../data.ts';
import { stopEvents } from './query.ts';

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
  /** a cloud account is signed in */
  cloud: boolean;
  invitesList: Invite[];
  membersList: Member[];
  /** what the clipboard got */
  copied: string[];
  /** the step being prepared on this device */
  busyKey: string | null;
  task: AppTask | null;
  /** what the AI proposes for the material */
  plan: SourcePlan;
  listeners: Set<() => void>;
  /** tell the screens something changed */
  change(): void;
}

export const PLAN: SourcePlan = {
  via: 'estimate',
  recommend: 'roadmap',
  reasons: ['2 files, about 300 pages in all', 'The files form 2 separate parts that build on each other'],
  title: 'Cell biology',
  course: { chapters: [{ title: 'Cells', files: ['a.pdf'] }] },
  roadmap: {
    steps: [
      { title: 'Membranes', summary: 'what a cell is made of', files: ['a.pdf pp. 1–20'] },
      { title: 'Genes', files: ['b.pdf'] },
    ],
  },
};

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

    cloud: false,
    invitesList: [],
    membersList: [],
    copied: [],
    busyKey: null,
    task: null,
    plan: PLAN,
    listeners: new Set(),
    change: () => {
      for (const f of d.listeners) f();
    },
    list: () => [d.c],
    statuses: (_acc, cc) =>
      statuses(
        cc,
        id => {
          const ready = cc.nodes[id]?.pack?.status === 'ready',
            m = d.masteredIds.has(id);
          return { score: m ? 1 : ready ? 0.4 : 0, read: m ? 1 : 0, mastered: m };
        },
        {},
      ),
    onChange: f => {
      d.listeners.add(f);
      return () => {
        d.listeners.delete(f);
      };
    },
    copy: t => {
      d.copied.push(t);
      return Promise.resolve(true);
    },
    cloudOn: () => d.cloud,
    shelfCount: () => Promise.resolve(3),
    prep: {
      busy: () => d.busyKey,
      live: () => 'chapter 2 of 4',
      paused: () => false,
      request: (_a, _c, id, o) => {
        calls.push(`request ${id}${o?.raiseBudget ? ' ' + String(o.raiseBudget) : ''}`);
      },
      stop: () => {
        calls.push('stop');
      },
      toApp: (_c, id) => {
        calls.push(`toApp ${id}`);
      },
      fromApp: (_c, id) => {
        calls.push(`fromApp ${id}`);
      },
      queueMany: (_a, _c, n, o) => {
        calls.push(`queueMany ${String(n)} ${String(o.review)}`);
        return { queued: 2, needReview: 1, needPlan: 0 };
      },
      unmaster: (_a, _c, id) => {
        calls.push(`unmaster ${id}`);
        d.masteredIds.delete(id);
      },
    },
    share: {
      invites: () => Promise.resolve(d.invitesList),
      join: (_a, id) => {
        calls.push(`join ${id}`);
        return Promise.resolve({ ...d.c, id });
      },
      decline: id => {
        calls.push(`decline ${id}`);
        d.invitesList = d.invitesList.filter(i => i.curriculum !== id);
        return Promise.resolve();
      },
      publish: (_a, id, o) => {
        calls.push(`publish ${id} ${String(o.isPublic)} ${String(o.steps)}`);
        o.onLog('shared');
        d.c = { ...d.c, shared: { role: 'owner', public: o.isPublic } };
        return Promise.resolve();
      },
      setPublic: (_a, id, on) => {
        calls.push(`setPublic ${id} ${String(on)}`);
        return Promise.resolve();
      },
      invite: (_a, id, email, msg) => {
        calls.push(`invite ${id} ${email} ${msg}`);
        return Promise.resolve();
      },
      members: () => Promise.resolve(d.membersList),
      removeMember: (_id, email, o) => {
        calls.push(`removeMember ${email} ${String(o.pending)}`);
        return Promise.resolve();
      },
      unpublish: (_a, id) => {
        calls.push(`unpublish ${id}`);
        d.c = { ...d.c, shared: null };
        return Promise.resolve();
      },
      download: (_a, _c, sid) => {
        calls.push(`download ${sid}`);
        return Promise.resolve('p-' + sid);
      },
      keepStep: (_a, _c, sid) => {
        calls.push(`keep ${sid}`);
      },
    },
    app: {
      start: () => undefined,
      message: (_c, n) => `MESSAGE x${String(n)}`,
      lastCheck: () => null,
      error: () => null,
      poll: () => {
        calls.push('poll');
        return Promise.resolve(1);
      },
      copyTask: () => d.task,
      paste: (_a, _c, tid, text) => {
        calls.push(`paste ${tid}`);
        return text.trim().startsWith('{') ? { line: '✓ planned 2 steps' } : { errors: ['not JSON', 'no steps'] };
      },
      downloadFiles: () => Promise.resolve(),
      bundle: (_a, _c, sid) => {
        calls.push(`bundle ${sid}`);
        return Promise.resolve({ name: sid + '.zip', missing: [] });
      },
      importPackage: (_a, _c, sid) => {
        calls.push(`import ${sid}`);
        return Promise.resolve({ title: 'Imported' });
      },
    },
    sources: {
      keys: () => ({ claude: false, gemini: false }),
      canMakeHere: () => false,
      languages: () => ({ en: 'English', el: 'Greek' }),
      providerReady: (_a, p) => p === 'claudeapp',
      defaultProvider: () => 'claudeapp',
      unzip: () => Promise.resolve([]),
      inventory: (files, onLog) => {
        calls.push(`inventory ${String(files.length)}`);
        files.forEach(f => {
          onLog(f.name);
        });
        return Promise.resolve(files.map(f => ({ name: f.name })));
      },
      estimate: () => {
        calls.push('estimate');
        return d.plan;
      },
      propose: () => Promise.resolve(d.plan),
      task: inv => `TASK ${inv.map(i => i.name).join(',')}`,
      fromAnswer: text => (text.includes('{') ? { plan: d.plan } : { errors: ['not JSON'] }),
      makeRoadmap: (_a, p, _inv, o) => {
        calls.push(`makeRoadmap ${o.title || p.title} ${o.provider}`);
        return Promise.resolve({ id: 'new1', next: 'app' as const });
      },
      courseMessage: () => 'COURSE MESSAGE',
      courseBrief: () => 'BRIEF',
    },
    art: { mascot: () => '<svg class="mascot"></svg>' },
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
  stopEvents();
  document.body.replaceChildren();
}
