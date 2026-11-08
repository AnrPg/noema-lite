/**
 * The Roadmap screens' data port (src/features/roadmaps/ui/data.ts) over the app as it is today: the Roadmaps of
 * engine/curriculum.js (window.NoemaCurriculum, its generator .Gen), the Claude-app inbox of engine/curjobs.js
 * (NoemaCurJobs.App.decide), sharing (NoemaCurShare), the packs (Noema.loadSubject), the notices, and the levels of
 * NoemaCore.roadmaps. The one place the screens meet those globals: the lead swaps this file for NoemaCore.study / sync.
 *
 * startRoadmapsUi() defines the kit and the Roadmap elements and hands them their services and this port on the page's
 * body, so any screen (the older ones too) can put a <noema-roadmap-…> element anywhere on the page.
 */
import { systemClock } from '../adapters/browser/clock.ts';
import { noemaI18n } from '../adapters/browser/i18n.ts';
import type { LevelService } from '../features/roadmaps/application/levels.ts';
import type { Roadmap } from '../features/roadmaps/domain/model.ts';
import { defineRoadmapsUi, provideRoadmapsData, type PackExercises, type RoadmapsData } from '../features/roadmaps/ui/index.ts';
import type { TestQuestion } from '../features/roadmaps/domain/levels.ts';
import { defineUi, provideServices, type Locales } from '../ui/index.ts';

/** What the port uses of the older globals (engine/*.js). */
interface Globals {
  NoemaCurriculum?: {
    get(acc: string, id: string): Roadmap | null;
    statuses(acc: string, c: Roadmap): Record<string, { mastered?: boolean } | undefined>;
    Gen: {
      placementTest(c: Roadmap, id: string): Promise<TestQuestion[]>;
      passTest(c: Roadmap, id: string, score: number): boolean;
    };
  };
  NoemaCurJobs?: { App: { decide(acc: string, cid: string, pid: string, approve: boolean): Promise<{ error?: string }> } };
  NoemaCurShare?: { isMember(c: Roadmap): boolean };
  Noema?: {
    loadSubject?: (acc: string, id: string) => Promise<PackExercises | null>;
    getPackById?: (acc: string, id: string) => Promise<PackExercises | null>;
    notice?: (text: string, ms?: number) => void;
    toast?: (text: string, ms?: number) => void;
  };
  NoemaCore?: { roadmaps?: { levels?: LevelService } };
  NoemaI18n?: {
    available(): readonly { readonly tag: string; readonly name: string; readonly dir?: string }[];
    use(tag: string): Promise<string>;
  };
  marked?: { parseInline(md: string): string };
  DOMPurify?: { sanitize(html: string): string };
}

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);

/** The data port over the page's globals (each read when it is used: the older scripts load after build/app.js). */
export function legacyRoadmapsData(win: Window): RoadmapsData {
  const g = (): Globals => win as unknown as Globals;
  const C = (): NonNullable<Globals['NoemaCurriculum']> => {
    const c = g().NoemaCurriculum;
    if (!c) throw new Error('engine/curriculum.js is not loaded');
    return c;
  };
  const levels = (): LevelService => {
    const l = g().NoemaCore?.roadmaps?.levels;
    if (!l) throw new Error('NoemaCore.roadmaps is not ready');
    return l;
  };
  return {
    roadmap: (acc, id) => g().NoemaCurriculum?.get(acc, id) ?? null,
    mastered: (acc, c) => {
      const st = C().statuses(acc, c);
      return id => !!st[id]?.mastered;
    },
    isMember: c => !!g().NoemaCurShare?.isMember(c),
    levels: {
      view: (...a) => levels().view(...a),
      advance: (...a) => levels().advance(...a),
      testTaken: (...a) => levels().testTaken(...a),
    },
    async packs(acc, c, ids) {
      const N = g().Noema,
        load = N?.loadSubject ?? N?.getPackById;
      if (!load) return [];
      const out: PackExercises[] = [];
      for (const id of ids) {
        const p = c.nodes[id]?.pack;
        if (p?.status !== 'ready' || !p.id) continue;
        const pack = await load(acc, p.id).catch(() => null);
        if (pack) out.push(pack);
      }
      return out;
    },
    placementQuestions: (_acc, c, id) => C().Gen.placementTest(c, id),
    passStep: (_acc, c, id, score) => C().Gen.passTest(c, id, score),
    async decide(acc, cid, pid, approve) {
      const J = g().NoemaCurJobs;
      if (!J) return 'engine/curjobs.js is not loaded';
      const r = await J.App.decide(acc, cid, pid, approve);
      return r.error ?? null;
    },
    inline(md) {
      const { marked, DOMPurify } = g();
      return marked && DOMPurify ? DOMPurify.sanitize(marked.parseInline(md)) : escapeHtml(md);
    },
    notify(text) {
      const N = g().Noema;
      (N?.notice ?? N?.toast)?.(text, 5000);
    },
  };
}

/** The interface languages the i18n runtime offers, and the switch. */
function locales(win: Window): Locales {
  const rt = (): Globals['NoemaI18n'] => (win as unknown as Globals).NoemaI18n;
  return {
    list: () =>
      (rt()?.available() ?? [{ tag: 'en', name: 'English' }]).map(l => ({
        tag: l.tag,
        name: l.name,
        dir: l.dir === 'rtl' ? 'rtl' : 'ltr',
      })),
    use: tag => rt()?.use(tag) ?? Promise.resolve('en'),
  };
}

const started = new WeakSet<Document>();

/** Defines the kit and the Roadmap elements and provides their services and data on the page's body (again: nothing). */
export function startRoadmapsUi(win: Window = window): void {
  const doc = win.document;
  if (started.has(doc)) return;
  started.add(doc);
  defineUi(win.customElements);
  defineRoadmapsUi(win.customElements);
  provideServices(doc.body, {
    i18n: noemaI18n(),
    clock: systemClock(),
    locales: locales(win),
  });
  provideRoadmapsData(doc.body, legacyRoadmapsData(win));
}
