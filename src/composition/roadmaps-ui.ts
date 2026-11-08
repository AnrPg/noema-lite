/**
 * The Roadmap screens' data port (src/features/roadmaps/ui/data.ts) over the app as it is today: the Roadmaps of
 * engine/curriculum.js (window.NoemaCurriculum, its generator .Gen), the Claude-app inbox of engine/curjobs.js
 * (NoemaCurJobs.App.decide), sharing (NoemaCurShare), the packs (Noema.loadSubject), the notices, and the levels of
 * NoemaCore.roadmaps. The one place the screens meet those globals: the lead swaps this file for NoemaCore.study / sync.
 *
 * The app's root (ui-root.ts) defines the Roadmap elements and provides this port on the page's body beside the kit's
 * services, so any page (engine/app/roadmaps.js, a classic overlay) can put a <noema-roadmap-…> element anywhere.
 */
import type { LevelService } from '../features/roadmaps/application/levels.ts';
import type { Roadmap } from '../features/roadmaps/domain/model.ts';
import type { StepStatus } from '../features/roadmaps/domain/status.ts';
import type {
  AppTask,
  Invite,
  Member,
  PackExercises,
  QueueResult,
  RoadmapsData,
  SourceItem,
  SourceOptions,
  SourcePlan,
} from '../features/roadmaps/ui/index.ts';
import type { TestQuestion } from '../features/roadmaps/domain/levels.ts';
import type { Unsubscribe } from '../ports/common.ts';

type Listen = (f: () => void) => Unsubscribe;
type Parsed = Record<string, unknown>;

/** What the port uses of the older globals (engine/*.js). */
interface Globals {
  NoemaCurriculum?: {
    get(acc: string, id: string): Roadmap | null;
    list(acc: string): Roadmap[];
    save(acc: string, c: Roadmap): void;
    statuses(acc: string, c: Roadmap): Record<string, StepStatus>;
    setMastered(acc: string, c: Roadmap, id: string, how: string | null): void;
    onChange: Listen;
    build(acc: string, c: Roadmap): Promise<Roadmap>;
    materialFile(acc: string, c: Roadmap, sid: string, f: { name: string }): Promise<{ blob?: Blob } | null>;
    LANG: Record<string, string>;
    Gen: {
      placementTest(c: Roadmap, id: string): Promise<TestQuestion[]>;
      passTest(c: Roadmap, id: string, score: number): boolean;
      start(acc: string): void;
      busy(): string | null;
      live: Record<string, { msg?: string } | undefined>;
      paused(): boolean;
      request(c: Roadmap, id: string, o: { resume?: boolean; raiseBudget?: number }): void;
      stop(): void;
      toApp(c: Roadmap, id: string): void;
      fromApp(c: Roadmap, id: string): void;
      queueMany(c: Roadmap, which: number | 'all', o: { review: boolean }): QueueResult;
      kick(): void;
      onChange: Listen;
    };
  };
  NoemaCurJobs?: {
    message(c: Roadmap, o: { count: number }): string;
    App: {
      decide(acc: string, cid: string, pid: string, approve: boolean): Promise<{ error?: string }>;
      start(acc: string): void;
      last?: number | null;
      error?: string | null;
      poll(acc: string): Promise<number>;
      copyTask(acc: string, cid: string): AppTask | null;
      paste(acc: string, cid: string, tid: string, text: string): { errors?: string[]; line?: string };
      bundle(acc: string, cid: string, sid: string): Promise<{ name: string; missing: string[] }>;
      importPackage(acc: string, cid: string, sid: string, f: File): Promise<{ title: string }>;
      onChange: Listen;
    };
  };
  NoemaCurShare?: {
    isMember(c: Roadmap): boolean;
    invites(): Promise<(Invite & { meta?: { counts?: { steps?: number } } })[]>;
    join(acc: string, cid: string): Promise<Roadmap>;
    decline(cid: string): Promise<void>;
    publish(acc: string, cid: string, o: { isPublic: boolean; steps: boolean; onLog: (m: string) => void }): Promise<void>;
    setPublic(acc: string, cid: string, on: boolean): Promise<void>;
    invite(acc: string, cid: string, email: string, msg: string): Promise<void>;
    members(cid: string): Promise<Member[]>;
    removeMember(cid: string, email: string, o: { pending: boolean }): Promise<void>;
    unpublish(acc: string, cid: string): Promise<void>;
    download(acc: string, cid: string, sid: string): Promise<string>;
    keepStep(acc: string, cid: string, sid: string): void;
    onChange?: Listen;
  };
  NoemaCurImport?: {
    unzipMaterial(f: File): Promise<File[]>;
    create(acc: string, parsed: Parsed, o: Record<string, unknown>): Promise<Roadmap>;
  };
  NoemaSourcePlan?: {
    inventory(files: readonly File[], o: { onLog: (m: string) => void }): Promise<SourceItem[]>;
    estimate(inv: readonly SourceItem[], o: SourceOptions): SourcePlan;
    propose(
      acc: string,
      inv: readonly SourceItem[],
      o: SourceOptions & { signal: AbortSignal; onLog: (m: string) => void },
    ): Promise<SourcePlan>;
    task(inv: readonly SourceItem[], o: SourceOptions): string;
    fromAnswer(text: string, inv: readonly SourceItem[]): { errors?: string[]; plan?: SourcePlan };
    roadmapImport(p: SourcePlan, inv: readonly SourceItem[]): { parsed: Parsed; assignments: unknown[] };
    mapText(p: SourcePlan): string;
    courseBrief(p: SourcePlan): string;
    courseMessage(p: SourcePlan, inv: readonly SourceItem[], o: { language: string; goal: string }): string;
  };
  NoemaLLM?: { available(acc: string): { claude: boolean; gemini: boolean }; pick(acc: string, provider: string): string | null };
  NoemaClaude?: { Key?: { get?: (acc: string) => string | null } };
  NoemaCloud?: { session?: () => { user: { id: string } } | null; push?: (acc: string) => Promise<unknown> };
  NoemaArt?: { mascot(m: string): string };
  NoemaThemes?: { current(): string };
  Noema?: {
    loadSubject?: (acc: string, id: string) => Promise<PackExercises | null>;
    getPackById?: (acc: string, id: string) => Promise<PackExercises | null>;
    notice?: (text: string, ms?: number) => void;
    toast?: (text: string, ms?: number) => void;
    shelf?: (acc: string) => Promise<unknown[]>;
  };
  NoemaCore?: { roadmaps?: { levels?: LevelService } };
  NoemaI18n?: { t(key: string): string };
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
  const need = <K extends keyof Globals>(k: K, file: string): NonNullable<Globals[K]> => {
    const v = g()[k];
    if (!v) throw new Error(`${file} is not loaded`);
    return v;
  };
  const SH = (): NonNullable<Globals['NoemaCurShare']> => need('NoemaCurShare', 'engine/curshare.js');
  const J = (): NonNullable<Globals['NoemaCurJobs']> => need('NoemaCurJobs', 'engine/curjobs.js');
  const SP = (): NonNullable<Globals['NoemaSourcePlan']> => need('NoemaSourcePlan', 'engine/sourceplan.js');
  const cloudOn = (acc: string): boolean => {
    const s = g().NoemaCloud?.session?.();
    return !!s && acc === 'u_' + s.user.id;
  };
  const pushCloud = (acc: string): void => {
    if (cloudOn(acc))
      void g()
        .NoemaCloud?.push?.(acc)
        .catch(() => undefined);
  };
  const download = (blob: Blob, name: string): void => {
    const a = win.document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    win.document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
    }, 15000);
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

    list: acc => C().list(acc),
    statuses: (acc, c) => C().statuses(acc, c),
    onChange(f) {
      const offs = [C().onChange(f), C().Gen.onChange(f), g().NoemaCurShare?.onChange?.(f), g().NoemaCurJobs?.App.onChange(f)];
      return () => {
        for (const off of offs) off?.();
      };
    },
    async copy(text) {
      try {
        await win.navigator.clipboard.writeText(text);
        return true;
      } catch {
        win.prompt(g().NoemaI18n?.t('roadmap.map.copyThis') ?? 'Copy this:', text); // i18n-ignore (the English fallback of roadmap.map.copyThis)
        return false;
      }
    },
    cloudOn,
    async shelfCount(acc) {
      const l = await g()
        .Noema?.shelf?.(acc)
        .catch(() => null);
      return l ? l.length : 0;
    },
    prep: {
      busy: () => C().Gen.busy(),
      live: key => C().Gen.live[key]?.msg ?? '',
      paused: () => C().Gen.paused(),
      request(acc, c, id, o) {
        C().Gen.start(acc);
        C().Gen.request(c, id, { resume: true, ...o });
      },
      stop: () => {
        C().Gen.stop();
      },
      toApp: (c, id) => {
        C().Gen.toApp(c, id);
      },
      fromApp: (c, id) => {
        C().Gen.fromApp(c, id);
      },
      queueMany: (acc, c, n, o) => C().Gen.queueMany(C().get(acc, c.id) ?? c, n, o),
      unmaster: (acc, c, id) => {
        C().setMastered(acc, c, id, null);
      },
    },
    share: {
      async invites() {
        const l = await SH().invites();
        return l.map(i => ({ ...i, ...(i.meta?.counts?.steps ? { steps: i.meta.counts.steps } : {}) }));
      },
      join: (acc, cid) => SH().join(acc, cid),
      decline: cid => SH().decline(cid),
      publish: (acc, cid, o) => SH().publish(acc, cid, o),
      setPublic: (acc, cid, on) => SH().setPublic(acc, cid, on),
      invite: (acc, cid, email, msg) => SH().invite(acc, cid, email, msg),
      members: cid => SH().members(cid),
      removeMember: (cid, email, o) => SH().removeMember(cid, email, o),
      unpublish: (acc, cid) => SH().unpublish(acc, cid),
      download: (acc, cid, sid) => SH().download(acc, cid, sid),
      keepStep: (acc, cid, sid) => {
        SH().keepStep(acc, cid, sid);
      },
    },
    app: {
      start(acc) {
        g().NoemaCurJobs?.App.start(acc);
        g().NoemaCurriculum?.Gen.start(acc);
      },
      message: (c, count) => J().message(c, { count }),
      lastCheck: () => g().NoemaCurJobs?.App.last ?? null,
      error: () => g().NoemaCurJobs?.App.error ?? null,
      poll: acc => J().App.poll(acc),
      copyTask: (acc, cid) => J().App.copyTask(acc, cid),
      paste: (acc, cid, tid, text) => J().App.paste(acc, cid, tid, text),
      async downloadFiles(acc, cid, t) {
        const c = C().get(acc, cid);
        if (!c) return;
        for (const sid of t.steps)
          for (const f of c.nodes[sid]?.material?.files ?? []) {
            if (!t.files?.includes(f.name)) continue;
            const rec = await C()
              .materialFile(acc, c, sid, f)
              .catch(() => null);
            if (rec?.blob) download(rec.blob, f.name);
          }
      },
      bundle: (acc, cid, sid) => J().App.bundle(acc, cid, sid),
      importPackage: (acc, cid, sid, f) => J().App.importPackage(acc, cid, sid, f),
    },
    sources: {
      keys: acc => g().NoemaLLM?.available(acc) ?? { claude: false, gemini: false },
      canMakeHere: acc => !!g().NoemaClaude?.Key?.get?.(acc),
      languages: () => C().LANG,
      providerReady: (acc, p) => p === 'claudeapp' || !!g().NoemaLLM?.pick(acc, p),
      defaultProvider(acc) {
        let pref = '';
        try {
          const s = JSON.parse(win.localStorage.getItem(`noema1:${acc}:a:settings`) ?? '{}') as { curProvider?: unknown };
          pref = typeof s.curProvider === 'string' ? s.curProvider : '';
        } catch {
          pref = '';
        }
        if (['claudeapp', 'auto', 'claude', 'gemini'].includes(pref)) return pref;
        return cloudOn(acc) || !g().NoemaLLM?.pick(acc, 'auto') ? 'claudeapp' : 'auto';
      },
      unzip: f => need('NoemaCurImport', 'engine/curimport.js').unzipMaterial(f),
      inventory: (files, onLog) => SP().inventory(files, { onLog }),
      estimate: (inv, o) => SP().estimate(inv, o),
      propose: (acc, inv, o) => SP().propose(acc, inv, o),
      task: (inv, o) => SP().task(inv, o),
      fromAnswer: (text, inv) => SP().fromAnswer(text, inv),
      async makeRoadmap(acc, p, inv, o) {
        const I = need('NoemaCurImport', 'engine/curimport.js'),
          { parsed, assignments } = SP().roadmapImport(p, inv);
        let c = await I.create(acc, parsed, {
          title: o.title,
          language: o.language,
          provider: o.provider,
          assignments,
          source: SP().mapText(p),
          onLog: o.onLog,
        });
        c['fromSources'] = { at: new Date().toISOString(), via: p.via };
        C().save(acc, c);
        c = C().get(acc, c.id) ?? c;
        if (c.provider === 'claudeapp') {
          const r = await C().build(acc, c);
          pushCloud(acc);
          C().Gen.kick();
          return { id: r.id, next: 'app' };
        }
        if (c.status === 'ready') C().Gen.kick();
        return { id: c.id, next: c.status === 'ready' ? 'map' : 'progress' };
      },
      courseMessage: (p, inv, o) => SP().courseMessage(p, inv, o),
      courseBrief: p => SP().courseBrief(p),
    },
    art: {
      mascot() {
        const A = g().NoemaArt,
          T = g().NoemaThemes;
        return A && T ? A.mascot(T.current()) : null;
      },
    },
  };
}
