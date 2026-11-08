/**
 * The learning log and the sync as the shell uses them (NoemaCore.learning: src/composition/learning.ts; NoemaCore.sync:
 * src/composition/sync.ts), typed as far as the shell calls them, and the settings copy: every answer, review, read
 * section and XP is an event of the account's log and the screens read its fold; a:settings stays the older screens' copy
 * of the account's settings. What they write there becomes setting.changed events, and the copy follows the log (another
 * tab, a restore, another device). Old values that still arrive in s:<subject>:state or a:stats (an old backup) are
 * converted to events (NoemaCore.learning.migrate); the cloud's old rows reach the log through NoemaCore.sync.legacyProgress.
 */
import type { AccountStats, SubjectProgress } from '../../features/study/domain/events/projection.ts';
import type { LeaseHolder, LeaseStatus } from '../../features/sync/domain/lease.ts';
import type { NoemaCoreBridge } from '../bridge.ts';
import { P, jsonOf, type AccountKv } from './kv.ts';

type Settings = Readonly<Record<string, unknown>>;
type Off = () => void;

export interface LearningBridge {
  open(account: string): Promise<unknown>;
  account(): string | null;
  record(draft: { type: string; subject?: string; data: Record<string, unknown> }): unknown;
  progress(subject: string): SubjectProgress;
  hasProgress(subject: string): boolean;
  progressOf(account: string, subject: string): SubjectProgress | null;
  stats(): AccountStats;
  settings(): Settings;
  settingsWritten(value: unknown): void;
  onSettings(f: (s: Settings) => void): Off;
  onChange(f: () => void): Off;
  eventsOf(account: string): Promise<unknown[]>;
  restore(events: readonly unknown[], o: { mode: 'replace' | 'merge'; madeAt: number; account?: string }): Promise<unknown>;
  migrate(): Promise<unknown>;
  clear(account: string): Promise<unknown>;
}
export interface SyncBridge {
  ready(): Promise<void>;
  status(): { readonly pending: number };
  readonly lease: {
    check(o: { take?: boolean }): Promise<LeaseStatus>;
    onChange(f: (state: LeaseStatus, holder: LeaseHolder | null) => void): Off;
  };
}
export interface StudyBridge {
  readonly cards: { countDue(states: Readonly<Record<string, unknown>> | null): number };
  readonly practice: { countMistakes(answers: SubjectProgress['res'] | null): number };
  readonly progress: {
    chaptersDone(
      chapters: readonly { id?: string; num?: number; sections?: number | readonly unknown[] }[],
      read: SubjectProgress['read'],
      boss: SubjectProgress['boss'],
    ): number;
  };
  readonly xp: {
    today(byDay: Record<string, number>): number;
    streak(byDay: Record<string, number>, day?: string, carried?: { days: number; through: string } | null): number;
    level(xp: number): { lv: number; into: number; need: number };
  };
}
/** the bridge with the phase-2 surfaces the shell reads (each is built on first use) */
export type Phase2Bridge = NoemaCoreBridge & {
  readonly learning: LearningBridge;
  readonly sync: SyncBridge;
  readonly study: StudyBridge;
  readonly contracts: { ready(): Promise<void> };
};
export const phase2 = (core: NoemaCoreBridge): Phase2Bridge => core as Phase2Bridge;

/** The account-level stats (XP and streak across every subject): the learning log's fold, the streak and today's XP the
    study domain's (days in a row with XP, the log's run carried). */
export class LogStats {
  private readonly core: Phase2Bridge;
  constructor(core: Phase2Bridge) {
    this.core = core;
  }
  /** a copy: what it was then */
  get(): AccountStats {
    const s = this.core.learning.stats();
    return { ...s, xpDay: { ...s.xpDay }, bySubject: { ...s.bySubject } };
  }
  /** today counts for the streak (studied without XP, e.g. a tutor chat) */
  touchStreak(): AccountStats {
    if (this.core.learning.stats().lastDay !== this.core.clock.today()) this.core.learning.record({ type: 'day.active', data: {} });
    return this.get();
  }
  streakNow(): number {
    const s = this.get();
    return this.core.study.xp.streak(
      s.xpDay,
      undefined,
      this.core.day.is(s.lastDay) && s.lastDay ? { days: s.streak || 0, through: s.lastDay } : null,
    );
  }
  todayXP(): number {
    return this.core.study.xp.today(this.get().xpDay);
  }
}

/** a setting's name the log may hold */
const SETTING_NAME = /^[A-Za-z][A-Za-z0-9_.-]{0,60}$/;

/** The settings copy of the open account (a:settings ⇄ the log's settings). */
export function settingsCopy(core: Phase2Bridge, KV: AccountKv) {
  const L = core.learning;
  let writing = false; // the copy is being written from the log: not a change of the learner's
  const read = (key: string): Settings => jsonOf<Settings | null>(KV, key, {}) ?? {};
  function write(acc: string, s: Settings): void {
    const k = KV.accountKey('settings', acc),
      cur = read(k),
      next: Record<string, unknown> = { ...s };
    // what the log does not hold: a device-only value the old copy may still have (the Gemini key's migrate takes it), a
    // name no setting may have
    for (const x of Object.keys(cur)) if (x === 'apiKey' || !SETTING_NAME.test(x)) next[x] = cur[x];
    writing = true;
    try {
      KV.set(k, JSON.stringify(next));
    } finally {
      writing = false;
    }
  }
  // the older screens wrote a:settings: a change of the learner's
  KV.listeners.push((key, acc) => {
    if (writing || acc !== L.account() || key !== KV.accountKey('settings', acc)) return;
    L.settingsWritten(read(key));
  });
  // the settings registers of another device (NoemaCore.sync); progress comes as events
  addEventListener('noema:remote', e => {
    const d = (e as CustomEvent<{ acc?: string; keys?: readonly string[] } | null>).detail;
    const acc = d?.acc;
    if (!acc || acc !== L.account()) return;
    const pre = `${P}${acc}:`;
    if ((d.keys ?? []).includes(pre + 'a:settings')) L.settingsWritten(read(pre + 'a:settings'));
  });
  return {
    /** opens the account's log; false: it could not be opened (reported, the learner is told) */
    async open(acc: string): Promise<boolean> {
      try {
        await L.open(acc);
      } catch (e) {
        core.errors.report(e, { where: 'loader.learning.open', severity: 'error', notify: true });
        return false;
      }
      L.settingsWritten(read(KV.accountKey('settings', acc))); // what was written while the log was closed (a pull, a restore into this profile)
      write(acc, L.settings());
      L.onSettings(s => {
        if (L.account() === acc) write(acc, s);
      });
      // the folder backup runs when something changed
      L.onChange(() => {
        if (L.account() === acc) KV.set(`${P}${acc}:meta:dirty`, JSON.stringify(Date.now()), { silent: true });
      });
      return true;
    },
  };
}
