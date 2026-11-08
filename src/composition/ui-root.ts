/**
 * THE APP'S UI ROOT (phase 3; src/composition/ui.ts is its entry, built to build/ui.js and loaded right after
 * build/app.js and engine/i18n.js): it publishes the phase bridge's UI half — window.Noema (the app's core for the
 * older screens), window.NoemaThemes (the character on the page) and window.NoemaShell (the frame's host) — dresses the
 * page in the learner's character at once, hands NoemaCore.notify the kit's toaster, and, once the page has loaded,
 * starts the app: who is learning, the account's language, the frame and its router, the subject's engine.
 *
 * The other areas' screens still live in engine/app/*.js and the engine modules; they add their parts to window.Noema
 * and register their pages with NoemaShell.registerPage while the page loads (docs/ARCHITECTURE.md §6.3).
 */
import { systemClock } from '../adapters/browser/clock.ts';
import { noemaI18n } from '../adapters/browser/i18n.ts';
import { CHARACTER_GROUPS, isCharacter, type CharacterGroup, type World } from '../features/shell/domain/characters.ts';
import { chaptersDone, dueCount, levelOf, medals, wrongCount, type SubjectProgress } from '../features/shell/domain/progress.ts';
import { provideServices, type UiServices } from '../ui/core/services.ts';
import { defineUi } from '../ui/index.ts';
import type { PickerAccount, PickerData } from '../ui/screens/shell/account-picker.ts';
import { defineShell } from '../ui/screens/shell/index.ts';
import type { BellItem } from '../ui/screens/shell/notices.ts';
import type { ProgressModel } from '../ui/screens/shell/progress.ts';
import type { CharacterInfo, SettingsData } from '../ui/screens/shell/settings.ts';
import type { TodayData, TodayModel } from '../ui/screens/shell/today.ts';
import { dayOf } from '../kernel/day.ts';
import type { NoemaCoreBridge } from './bridge.ts';
import { createCore, sha256, type NoemaCoreObject } from './shell/core.ts';
import { guardDom, h, type MenuEntry } from './shell/dom.ts';
import { createHost, type Host, type HostCore, type Recent } from './shell/host.ts';
import { P, jsonOf, putJson, type Account } from './shell/kv.ts';
import { legacy, type AreaBoot, type NoemaAreas, type SubjectMeta } from './shell/legacy.ts';
import { createThemes, type Themes } from './shell/themes.ts';
import { runtimeLocales, type I18nRuntimeLocales } from './ui-kit-root.ts';

export interface App {
  readonly Noema: NoemaCoreObject & NoemaAreas & AppExtras;
  readonly themes: Themes;
  readonly shell: Host;
  start(): Promise<void>;
}
interface AppExtras {
  pickAccount(o?: { closable?: boolean }): Promise<Account>;
  openAccountPicker(): Promise<void>;
  ensureEngine?(): Promise<boolean>;
  openSubjectPicker?(): Promise<void>;
}

const DEV_HOST = /^(localhost|127\.0\.0\.1|\[::1\])$/;

/** Publishes the bridge's UI half on the page and wires the frame; start() runs the app (once the page has loaded). */
export function createApp(win: Window = window): App {
  const W = legacy;
  const core = (win as unknown as { NoemaCore: NoemaCoreBridge }).NoemaCore;
  guardDom();
  const N = createCore(core) as NoemaCoreObject & NoemaAreas & AppExtras;
  const session = {
    get: (): unknown => {
      try {
        return JSON.parse(sessionStorage.getItem('noema-preview') ?? 'null');
      } catch {
        return null;
      }
    },
    set: (p: { m: string; until: number } | null): void => {
      try {
        if (p) sessionStorage.setItem('noema-preview', JSON.stringify(p));
        else sessionStorage.removeItem('noema-preview');
      } catch (e) {
        // no sessionStorage (blocked site data): the try lasts until the page reloads
        core.errors.report(e, { where: 'shell.preview', severity: 'info' });
      }
    },
  };
  const themes = createThemes({
    kv: core.storage.kv,
    account: () => N.account?.id ?? N.kv.acc ?? jsonOf<{ acc?: string }>(core.storage.kv, P + 'current', {}).acc ?? null,
    write: (k, v) => {
      N.kv.set(k, v);
    },
    config: () => W().NOEMA_CONFIG ?? {},
    now: () => Date.now(),
    i18n: () => W().NoemaI18n ?? null,
    session,
    root: document.documentElement,
    setInterval: (f, ms) => {
      const t = setInterval(f, ms);
      return () => {
        clearInterval(t);
      };
    },
  });
  // a character chosen on another device (the sync brings a:settings) or in another tab: this page wears it at once
  addEventListener('noema:remote', e => {
    themes.remoteChange((e as CustomEvent<{ keys?: string[] } | null>).detail?.keys ?? []);
  });
  addEventListener('storage', (e: StorageEvent) => {
    themes.remoteChange([e.key]);
  });

  const SHELL = (): boolean => N.config['shell'] !== false;
  const L = (k: string, v?: Record<string, unknown>): string => shell.L(k, v);
  const acc = (): string | null => N.account?.id ?? null;
  const settings = (): Record<string, unknown> => themes.settings();
  const subjects = async (): Promise<SubjectMeta[]> => {
    const a = acc();
    return a && N.subjectsFor ? N.subjectsFor(a).catch(() => []) : [];
  };
  const stateOf = (sid: string): SubjectProgress | null =>
    jsonOf<SubjectProgress | null>(core.storage.kv, `${P}${acc() ?? ''}:s:${sid}:state`, null);

  /* ---------------- 🔔 the bell: what the notifier moved off the screen waits here, with shares and updates ---------------- */
  core.notify.onOverflow(items => {
    N.notices.keep(acc() ?? N.kv.acc, items);
  });
  const bellList = (): readonly BellItem[] => N.notes?.pending ?? N.notices.list(acc());
  const bell: HostCore['bell'] = {
    count(f) {
      if (N.notes)
        N.notes.on(list => {
          f(list.length);
        });
      else {
        f(N.notices.list(acc()).length);
        N.notices.onChange(() => {
          f(N.notices.list(acc()).length);
        });
      }
    },
    open(sheet) {
      sheet(L('notifications'), body => {
        const list = document.createElement('noema-bell-list');
        list.data = {
          row: x =>
            N.shareRow?.(x, {
              onAccepted: s => {
                shell.layer.replaceChildren();
                if (confirm(L('openNow', { title: s.title }))) {
                  if (s.kind === 'curriculum' && s.curriculum) shell.go('#/map/' + encodeURIComponent(s.curriculum));
                  else shell.open(s.id);
                }
              },
            }) ?? h('div'),
          dismiss: id => {
            N.notices.dismiss(acc(), id);
          },
          clear: () => {
            N.notices.clear(acc());
          },
          ago: at => W().NoemaI18n?.fmt.ago(at) ?? '',
          empty: N.account?.kind === 'cloud' ? L('nothingNew') : L('notesNeedCloud'),
        };
        list.items = bellList();
        body.append(list);
        const redraw = (): void => {
          if (list.isConnected) list.items = bellList();
        };
        if (N.notes) N.notes.on(redraw);
        N.notices.onChange(redraw);
      });
    },
  };

  /* ---------------- the frame's host ---------------- */
  const shell = createHost({
    kv: core.storage.kv,
    themes,
    account: () => N.account,
    subject: () => N.subject,
    subjectsFor: a => N.subjectsFor?.(a) ?? Promise.resolve([]),
    switchTo: (a, s, hash) => {
      N.switchTo(a, s, hash);
    },
    ensureEngine: () => N.ensureEngine?.() ?? Promise.resolve(false),
    toast: (t, ms) => {
      N.toast(t, ms);
    },
    bell,
    backgroundEngine: () => N.backgroundEngine,
    foreground: () => {
      N.backgroundEngine = false;
      const a = acc(),
        s = N.subject?.id;
      if (a && s) N.setCurrent(a, s);
    },
  });
  N.framed(() => SHELL() && shell.mounted);

  /* ---------------- who is learning (the first-login overlay) ---------------- */
  const pickerData = (): PickerData => ({
    appName: String(N.config['appName']),
    accounts: () => N.accounts(),
    checkPin: async (a, pin) => (await sha256(a.id + ':' + pin)) === a.pin,
    create: async ({ name, emoji, pin }) => {
      const id = N.newProfileId(name);
      const a: Account = { id, name, emoji, kind: 'local', pin: pin ? await sha256(id + ':' + pin) : null, created: Date.now() };
      N.saveLocalAccount(a);
      return N.getAccount(id) ?? a;
    },
    cloud: !!N.config['supabaseUrl'] && !!W().NoemaCloud && !W().NoemaCloud?.session(),
    signIn: async (email, pw) => {
      await W().NoemaCloud?.signIn(email, pw);
      return N.cloudAccount();
    },
    signUp: async (email, pw, name) => {
      const r = await W().NoemaCloud?.signUp(email, pw, name);
      return r?.session ? N.cloudAccount() : null;
    },
    recover: async email => {
      await W().NoemaCloud?.recover(email);
    },
    toast: t => {
      N.toast(t);
    },
    err: e => N.errMsg(e),
  });
  function pickAccount({ closable = false }: { closable?: boolean } = {}): Promise<Account> {
    return new Promise(resolve => {
      N.overlay(
        (box, close) => {
          const p = document.createElement('noema-account-picker');
          p.data = pickerData();
          p.addEventListener('noema-account', e => {
            const a = (e as CustomEvent<PickerAccount>).detail;
            close();
            resolve(N.getAccount(a.id) ?? a);
          });
          box.append(p);
        },
        { closable },
      );
    });
  }
  N.pickAccount = pickAccount;
  N.openAccountPicker = async () => {
    const a = await pickAccount({ closable: true });
    if (a.id !== N.account?.id) N.switchTo(a.id, null);
  };

  /* ---------------- "in use on another device" (engine/cloud.js lease) ---------------- */
  let inUse: HTMLElement | null = null;
  addEventListener('noema:inuse', e => {
    const d = (
      e as CustomEvent<{
        state?: string;
        holder?: { sameDevice?: boolean; os?: string; br?: string; name?: string };
        unsynced?: boolean;
      } | null>
    ).detail;
    if (d?.state === 'other') {
      const ho = d.holder;
      const where = ho?.sameDevice
        ? N.tr('inuse.otherTab')
        : ho?.os
          ? N.tr('loader.inuse.device', { os: ho.os, browser: ho.br || 'none' })
          : ho?.name || N.tr('inuse.otherDevice'); // os, br: newer apps; name: English words of older ones
      const cover = document.createElement('noema-in-use');
      cover.className = 'noema-ovbox noema-inuse';
      cover.data = {
        where,
        unsynced: !!d.unsynced,
        take: async () => {
          const st = await W().NoemaCloud?.lease.check({ take: true });
          if (st === 'mine') {
            N.toast(N.tr('inuse.continued'));
            return true;
          }
          N.toast(N.tr('inuse.offline'), 4000);
          return false;
        },
      };
      if (!inUse) {
        inUse = h('div', { class: 'noema-overlay noema-inuse-ov', role: 'dialog', 'aria-modal': 'true' });
        for (const x of [...document.body.children] as HTMLElement[])
          if (!x.inert) {
            x.inert = true; // keys and taps can't reach the app underneath
            x.dataset['inuseInert'] = '1';
          }
        document.body.append(inUse);
      }
      inUse.replaceChildren(cover);
      return;
    }
    if (inUse) {
      const o = inUse;
      inUse = null;
      document.querySelectorAll<HTMLElement>('[data-inuse-inert]').forEach(x => {
        x.inert = false;
        delete x.dataset['inuseInert'];
      });
      o.classList.add('out');
      setTimeout(() => {
        o.remove();
      }, 250);
    }
  });

  /* ---------------- the shell's pages ---------------- */
  const fmtDate = shell.fmtDate;
  const ago = (t: number): string => {
    const d = Math.round((Date.now() - t) / 864e5);
    return d <= 0 ? (W().NoemaI18n?.fmt.lower(L('today')) ?? L('today').toLowerCase()) : d === 1 ? L('yesterday') : L('daysAgo', { n: d });
  };
  const fits = (s: SubjectMeta): boolean => {
    const w = themes.world();
    return w === 'both' || (w === 'lang') === shell.isLang(s);
  };
  const onStudy = (sid: string): void => {
    shell.open(sid);
  };
  function reviewGo(kind: 'review' | 'gym', per: readonly { s: SubjectMeta; fc: number; pb: number; wr: number }[]): void {
    const list = per.filter(x => (kind === 'gym' ? x.wr : x.fc + x.pb));
    const dest = (x: { fc: number }): string => (kind === 'gym' ? '#/mistakes' : x.fc ? '#/cards' : '#/drills');
    const one = list[0];
    if (!one) {
      if (shell.engine) shell.go(kind === 'gym' ? '#/mistakes' : '#/cards');
      else shell.tip(kind === 'gym' ? L('gymNone') : L('reviewNone'));
      return;
    }
    if (list.length === 1) {
      shell.open(one.s.id, dest(one));
      return;
    }
    shell.sheet(kind === 'gym' ? L('gym') : L('review'), body => {
      body.append(
        h('p', { class: 'ns-muted' }, L('pickWhere')),
        h(
          'div',
          { class: 'ns-list' },
          ...list.map(x =>
            h(
              'button',
              {
                class: 'ns-item',
                onclick: () => {
                  shell.layer.replaceChildren();
                  shell.open(x.s.id, dest(x));
                },
              },
              shell.icoTxt(x.s.emoji || (x.s.title || '?').trim()[0]?.toUpperCase(), 4, 'emo'),
              h(
                'span',
                { class: 't' },
                h('b', {}, x.s.title),
                h('small', {}, kind === 'gym' ? L('gymSub', { n: x.wr }) : L('reviewSub', { fc: x.fc, pb: x.pb })),
              ),
              shell.chev(),
            ),
          ),
        ),
      );
    });
  }
  const todayData = (): TodayData => {
    let per: { s: SubjectMeta; fc: number; pb: number; wr: number }[] = [];
    const world = shell.WORLDS['lang'];
    const w = themes.world();
    const langToday = w !== 'know' && world?.today ? world.today.bind(world) : null;
    return {
      async model(): Promise<TodayModel> {
        const subs = await subjects();
        const byId = Object.fromEntries(subs.map(s => [s.id, s]));
        const CU = W().NoemaCurriculum;
        const a = acc();
        let rec: Recent[] = shell.recent().filter(r => byId[r.subj] && fits(byId[r.subj] as SubjectMeta));
        const open = N.subject;
        if (!rec.length && open?.id && fits(open)) rec = [{ subj: open.id, title: open.title ?? '', emoji: open.emoji ?? '' }];
        const hid = shell.hiddenToday(),
          anyRec = rec.length > 0;
        rec = rec.filter(r => !hid.includes(r.subj));
        const r0 = rec[0];
        let cont: TodayModel['cont'] = null;
        if (r0) {
          const s = byId[r0.subj],
            rm = r0.cid ? CU?.get(a, r0.cid) : null;
          cont = {
            hideId: r0.subj,
            emoji: s?.emoji ?? null,
            icon: rm ? 'map' : 'book',
            where: rm ? rm.title || rm.goal || '' : s?.title || r0.title || '',
            title: r0.secTitle || s?.title || r0.title || '',
            chapter: r0.chNum ? { n: r0.chNum, of: r0.chOf ?? 0 } : null,
            section: r0.secNum ? { n: r0.secNum, of: r0.secOf ?? 0 } : null,
            start: !r0.sid,
            step: rm && r0.node ? rm.nodes?.[r0.node]?.title || r0.node : null,
            open: () => {
              shell.open(r0.subj, r0.sid ? '#/s/' + r0.sid : '#/subject');
            },
          };
        }
        let firstMap: TodayModel['firstMap'] = null,
          welcome = false;
        if (!r0 && !anyRec && CU) {
          const all = CU.list(a),
            curs = all.filter(c => !hid.includes('map:' + c.id));
          const c = curs[0];
          if (c) {
            const nx = CU.nextUp?.(a, c)[0];
            firstMap = {
              hideId: 'map:' + c.id,
              icon: 'map',
              where: CU.shownTitle(c),
              title: nx ? (CU.shownNode(c, nx)?.title ?? '') : L('openMap'),
              next: true,
              open: () => {
                shell.go('#/map/' + encodeURIComponent(c.id) + (nx ? '/' + encodeURIComponent(nx) : ''));
              },
            };
          } else welcome = !all.length; // every Roadmap's suggestion closed for today: nothing
        } else if (!r0 && !anyRec) welcome = true;
        const elsewhere = rec.slice(1, 4).map(r => {
          const s = byId[r.subj];
          return {
            title: s?.title || r.title || '',
            emoji: s?.emoji ?? null,
            tone: ((s?.title || '').length % 4) + 1,
            sub: [r.chNum ? L('chOf', { n: r.chNum, of: r.chOf }) : null, r.at ? L('lastSeen', { when: ago(r.at) }) : null]
              .filter(Boolean)
              .join(' · '),
            open: () => {
              shell.open(r.subj, r.sid ? '#/s/' + r.sid : '#/subject');
            },
          };
        });
        per = [];
        let dfc = 0,
          dpb = 0,
          wrong = 0;
        const day = dayOf(core.clock.now());
        for (const s of subs) {
          if (!fits(s)) continue;
          const st = stateOf(s.id);
          if (!st) continue;
          const d = dueCount(st, day),
            wr = wrongCount(st);
          if (d.fc + d.pb + wr) per.push({ s, ...d, wr });
          dfc += d.fc;
          dpb += d.pb;
          wrong += wr;
        }
        return {
          name: N.account?.name ?? '',
          date: fmtDate(Date.now(), { weekday: 'long', day: 'numeric', month: 'long' }),
          hour: new Date().getHours(),
          xp: N.stats.todayXP(),
          goal: Number(settings()['goal']) || 120,
          cont,
          firstMap,
          welcome,
          elsewhere,
          due: { fc: dfc, pb: dpb, wrong },
          streak: N.stats.streakNow(),
        };
      },
      hide: id => {
        shell.hideToday(id);
      },
      lang: langToday
        ? (box, lead) => {
            const n0 = box.children.length;
            const led = langToday(box, { h: shell.h, L, open: shell.open, go: shell.go, ...(lead ? { lead: true } : {}) });
            return led === true || (led === undefined && box.children.length > n0);
          }
        : null,
      langOnly: w === 'lang',
      review: kind => {
        reviewGo(kind, per);
      },
      newRoadmap: () => {
        W().NoemaCurMap?.create(acc(), { onStudy });
      },
      tip: t => {
        shell.tip(t);
      },
    };
  };
  shell.registerPage('', () => {
    const el = document.createElement('noema-today');
    el.ctx = shell.ctx();
    el.data = todayData();
    shell.screen(
      {
        tab: 'today',
        crumbs: [[L('today')]],
        menu: [
          { label: L('pickSubject'), icon: 'book', run: () => void N.openSubjectPicker?.() },
          { label: L('newRoadmap'), icon: 'map', run: () => W().NoemaCurMap?.create(acc(), { onStudy }) },
          shell.engine ? { label: L('focusSprint'), sub: L('focusSprintSub'), icon: 'clock', run: () => shell.engine?.focus?.() } : null,
          { label: L('switchProfile'), icon: 'user', run: () => void N.openAccountPicker() },
        ],
      },
      el,
    );
  });

  async function progressModel(): Promise<ProgressModel> {
    const m = themes.current(),
      tx = themes.text(m),
      st = N.stats.get(),
      sn = N.stats.streakNow(),
      day = core.clock.today();
    const days = [...Array(7).keys()].map(i => {
      const k = core.day.add(day, i - 6),
        [y = 0, mo = 1, dd = 1] = k.split('-').map(Number);
      return { label: fmtDate(new Date(y, mo - 1, dd, 12), { weekday: 'narrow' }), xp: st.xpDay[k] ?? 0 };
    });
    const subs = await subjects();
    let done = 0,
      fcN = 0,
      boss = 0;
    for (const s of subs) {
      const x = stateOf(s.id);
      if (!x) continue;
      done += chaptersDone(s.chapters ?? s.meta?.chapters ?? [], x);
      fcN += Object.keys(x.fc ?? {}).length;
      boss += Object.keys(x.boss ?? {}).length;
    }
    // the collection: this week's chapters shine
    const wk = core.day.weekStart(day),
      ck = `${P}${acc() ?? ''}:meta:collweekch`,
      cw = jsonOf<{ week?: string; base?: number } | null>(core.storage.kv, ck, null);
    const base = cw?.week === wk ? (cw.base ?? done) : done;
    if (cw?.week !== wk) putJson(core.storage.kv, ck, { week: wk, base: done });
    const CU = W().NoemaCurriculum;
    const mastered = (CU?.list(acc()) ?? []).reduce((n, c) => n + (c.status === 'ready' ? (CU?.summary(acc(), c).mastered ?? 0) : 0), 0);
    const med = medals({ mastered, fcN, sn, boss, xp: st.xp });
    // a new treasure: a celebration
    const mk = `${P}${acc() ?? ''}:meta:medals`,
      was = jsonOf<number | null>(core.storage.kv, mk, null),
      found = med.filter(x => x.found).length;
    putJson(core.storage.kv, mk, found);
    if (was != null && found > was) W().NoemaReact?.big('medal');
    return {
      level: levelOf(st.xp),
      xp: st.xp,
      streak: sn,
      days,
      goal: Number(settings()['goal']) || 120,
      chapters: done,
      fresh: Math.max(0, done - base),
      medals: med,
      place: tx.place,
      coll: tx.coll,
      item: tx.item,
    };
  }
  shell.registerPage('progress', () => {
    const el = document.createElement('noema-progress-page');
    el.ctx = shell.ctx();
    el.data = { model: progressModel };
    shell.screen({ tab: 'progress', crumbs: [[L('progress')]], corner: true }, el);
  });

  /* ---------- Settings ---------- */
  const groups = (): Readonly<Record<CharacterGroup, readonly CharacterInfo[]>> => {
    const info = (k: string): CharacterInfo => {
      const t = themes.text(k);
      return { id: k, tutor: shell.tv(k).tutor, title: t.name, world: t.world };
    };
    return {
      animals: CHARACTER_GROUPS.animals.map(info),
      tales: CHARACTER_GROUPS.tales.map(info),
      grown: CHARACTER_GROUPS.grown.map(info),
    };
  };
  /** account settings (a:settings, synced), and the open subject's copy (S.settings) kept in step */
  const putS = (patch: Record<string, unknown>): void => {
    const live = W().S;
    if (live?.settings) {
      Object.assign(live.settings, patch);
      try {
        W().flushSave?.();
      } catch (e) {
        core.errors.report(e, { where: 'shell.settings.save', severity: 'error' });
      }
    }
    themes.putSettings(patch);
  };
  const I = () => W().NoemaI18n;
  const myAvatar = (): string | null =>
    jsonOf<{ avatar?: string | null } | null>(core.storage.kv, `${P}${acc() ?? ''}:a:mypage`, null)?.avatar ?? null;
  async function logOut(): Promise<void> {
    const a = N.account,
      C = W().NoemaCloud;
    if (a?.kind === 'cloud') {
      if (!confirm(L('logOutQ', { name: a.name || a.email || '' }))) return;
      await C?.push(a.id).catch(core.errors.catcher('shell.logout.push', { severity: 'warning' }));
      await C?.signOut().catch(core.errors.catcher('shell.logout.signout', { severity: 'info' }));
    }
    N.jset(P + 'current', { loggedOut: true });
    history.replaceState(null, '', location.pathname);
    location.reload();
  }
  const settingsData = (): SettingsData => {
    const a = N.account;
    return {
      name: a?.name ?? '',
      sub: a?.kind === 'cloud' ? (a.email ?? '') : L('localProfile'),
      avatar: myAvatar(),
      emoji: a?.emoji || (a?.name || '?').trim()[0]?.toUpperCase() || '?',
      groups,
      owned: () => themes.owned(),
      locked: () => themes.locked(),
      canChange: () => themes.canChange(),
      chosen: () => isCharacter(themes.settings()['character']),
      freeUntil: () => themes.freeUntil(),
      nextChangeAt: () => themes.nextChangeAt(),
      changedAt: () => Number(themes.settings()['characterAt']) || 0,
      preview: () => themes.preview(),
      startPreview: m => {
        themes.startPreview(m);
      },
      endPreview: () => {
        themes.endPreview();
      },
      choose: (m, force) => themes.choose(m, { force: !!force }),
      wear: m => {
        if (isCharacter(m)) themes.apply(m);
      },
      celebrate: t => W().NoemaReact?.big('level', t),
      toast: (t, ms) => {
        N.toast(t, ms);
      },
      date: t => fmtDate(t),
      world: () => themes.world(),
      setWorld: (w: World) => {
        themes.putSettings({ world: w });
        shell.drawTabs();
      },
      game: () => themes.game(),
      setGame: g => {
        themes.putSettings({ game: g });
      },
      settings: () => ({ ...settings(), ...(W().S?.settings ?? {}) }),
      put: putS,
      locales: () => {
        const rt = I();
        if (!rt) return [];
        const cur = settings()['lang'];
        const on = new Set(rt.available().map(x => x.tag));
        return rt.LOCALES.filter(x => on.has(x.tag) || x.tag === cur).map(x => [x.tag, `${x.name} · ${x.tag}`] as const);
      },
      browserLocaleName: () => I()?.LOCALES.find(x => x.tag === I()?.browser())?.name ?? 'English',
      localeName: () => {
        const l = I()?.lang(settings()['lang']) ?? 'en';
        return I()?.LOCALES.find(x => x.tag === l)?.name ?? l;
      },
      natives: () => {
        // the supported natives = NoemaLang.SUPPORTED_NATIVES (one source of truth) = the UI locales' languages
        const list = W().NoemaLang?.SUPPORTED_NATIVES ?? [
          ...new Set((I()?.LOCALES ?? []).filter(x => !x.pseudo).map(x => x.tag.split('-')[0] ?? x.tag)),
        ];
        const l = I()?.lang(settings()['lang']) ?? 'en';
        const name = (c: string): string => {
          try {
            return new Intl.DisplayNames([l, 'en'], { type: 'language' }).of(c) ?? c;
          } catch {
            return c;
          }
        };
        return list.map(c => [c, name(c)] as const).sort((x, y) => I()?.fmt.compare(x[1], y[1]) ?? x[1].localeCompare(y[1]));
      },
      mtPanel: () => W().NoemaMT?.panel(acc()) ?? null, // 🌐 machine translation of shared texts (engine/mt.js, docs/i18n.md §11)
      reload: () => {
        location.reload();
      },
      activity: () => {
        (W() as { NoemaShell?: { convos?: () => void } }).NoemaShell?.convos?.();
      },
      switchProfile: () => void N.openAccountPicker(),
      logOut: () => void logOut(),
      tipped: (el, text) => {
        shell.tipped(el, text);
      },
    };
  };
  const ME_VIEWS: Readonly<Record<string, string>> = {
    profile: 'profile',
    ai: 'settings',
    backup: 'backup',
    cloud: 'cloud',
    help: 'help',
    data: 'cloud',
  };
  /** the account pages the engine draws (Me › Profile, AI, Data, Help): its views, hosted in the frame */
  function mePage(sec: string): void {
    const titles: Readonly<Record<string, string>> = {
      profile: L('profile'),
      ai: L('aiTitle'),
      backup: L('backup'),
      cloud: L('data'),
      data: L('data'),
      help: L('help'),
    };
    const crumbs: [string, string?][] = sec === 'help' ? [[titles[sec] ?? '']] : [[L('settings'), '#/me'], [titles[sec] ?? '']];
    const v = shell.page({ tab: 'me', crumbs, back: sec === 'help' ? null : '#/me' }, h('h1', {}, titles[sec]));
    const E = shell.engine;
    if (!E?.accView) {
      // these pages live in the engine: load it quietly (no subject is opened), else say what is missing
      const wait = h('div', { class: 'ns-wait' }, shell.faceEl(undefined, 'breathe'));
      v.append(wait);
      void Promise.resolve(N.ensureEngine?.() ?? false).then(ok => {
        if (!wait.isConnected) return;
        if (ok && shell.engine?.accView) shell.route();
        else
          wait.replaceWith(
            h(
              'div',
              { class: 'ns-panel' },
              h('p', {}, L('needSubject')),
              h('button', { class: 'btn primary', onclick: () => void N.openSubjectPicker?.() }, L('pickSubject')),
            ),
          );
      });
      return;
    }
    const body = h('div', { class: 'accbody ns-accbody' });
    v.append(body);
    const close = (): void => {
      shell.go(sec === 'help' ? '#/' : '#/me');
    };
    if (sec === 'data') {
      E.accView('cloud', body, close);
      const b2 = h('div', { class: 'accbody ns-accbody' });
      v.append(h('h2', { class: 'ns-h2' }, L('backup')), b2);
      E.accView('backup', b2, close);
      return;
    }
    E.accView(ME_VIEWS[sec] ?? sec, body, close, sec === 'ai' ? { only: 'ai' } : {});
  }
  shell.registerPage('me', ([sec]) => {
    if (sec === 'look') {
      const el = document.createElement('noema-look');
      el.ctx = shell.ctx();
      el.data = settingsData();
      shell.screen({ tab: 'me', crumbs: [[L('myAccount'), '#/me'], [L('look')]], back: '#/me' }, el);
      return;
    }
    if (sec === 'subjects' || sec === 'help') {
      location.replace('#/' + sec); // their own places since 2026-10-11 (Me ▾)
      return;
    }
    if (sec && ME_VIEWS[sec]) {
      mePage(sec);
      return;
    }
    const el = document.createElement('noema-settings');
    el.ctx = shell.ctx();
    el.data = settingsData();
    shell.screen({ tab: 'me', crumbs: [[L('settings')]] }, el);
  });
  shell.registerPage('help', () => {
    mePage('help');
  });
  shell.registerPage('character', () => {
    const el = document.createElement('noema-characters');
    el.ctx = shell.ctx();
    el.data = settingsData();
    shell.screen({ tab: 'me', crumbs: [[L('myAccount'), '#/me'], [L('character')]], back: '#/me' }, el);
  });
  // the 5-minute try's bar, above the top bar
  const bar = document.createElement('noema-preview-bar');
  shell.preview.append(bar);
  themes.onChange(() => {
    bar.ctx = shell.ctx();
    bar.data = settingsData();
    bar.requestUpdate();
  });

  /* ---------- Me ▾ ---------- */
  const RL = shell.RL;
  shell.configure({
    meMenu: (): readonly MenuEntry[] => [
      { label: L('me'), sub: L('menuMeSub'), icon: 'user', href: '#/profile' },
      { label: L('settings'), sub: L('settingsSub'), icon: 'gear', href: '#/me' },
      { label: L('help'), sub: L('helpSub'), icon: 'help', href: '#/help' },
      { label: L('mySubjects'), sub: L('subjectsSub'), icon: 'book', href: '#/subjects' },
      W().NoemaReport
        ? { label: RL('button'), sub: RL('menuSub'), icon: 'report', cls: 'ns-reportitem', run: () => W().NoemaReport?.open() }
        : null,
      shell.reports.admin
        ? {
            label: RL('adminTitle'),
            sub: RL('adminSub'),
            icon: 'list',
            href: '#/admin/reports',
            badge: shell.reports.fresh ? String(shell.reports.fresh) : null,
            tone: 5,
          }
        : null,
      '-',
      { label: L('switchAccount'), icon: 'people', run: () => void N.openAccountPicker() },
      { label: L('logOut'), icon: 'logout', run: () => void logOut() },
    ],
    plainWatch: root => {
      N.plain.watch(root);
    },
    onMounted: () => {
      bar.ctx = shell.ctx();
      bar.data = settingsData();
      // the first time: what do you want to learn, and who comes with you
      const cfg = W().NOEMA_CONFIG ?? {};
      if (cfg['onboarding'] === false || settings()['onboarded'] || !acc()) return;
      const onb = document.createElement('noema-onboarding');
      onb.ctx = shell.ctx();
      onb.data = settingsData();
      onb.addEventListener('noema-onboarded', () => {
        shell.layer.replaceChildren();
        shell.route();
        setTimeout(() => W().NoemaReact?.big('hello'), 400);
      });
      shell.layer.replaceChildren(onb);
    },
  });

  /* ---------------- the start ---------------- */
  const uiServices = (): UiServices => ({
    i18n: noemaI18n(),
    clock: systemClock(),
    locales: runtimeLocales(() => (win as unknown as { NoemaI18n?: I18nRuntimeLocales }).NoemaI18n),
  });
  const offSplash = (): void => {
    document.body.classList.remove('noema-booting');
    document.getElementById('noema-splash')?.remove();
  };
  const race = <T>(p: Promise<T>, ms: number): Promise<T | undefined> => Promise.race([p, new Promise<undefined>(r => setTimeout(r, ms))]);
  /** #/ui-kit on a development page (localhost): the kit's demo instead of the app; leaving it reloads the page */
  function uiKit(): boolean {
    if (!/^#\/ui-kit(?:[/?]|$)/.test(location.hash) || !DEV_HOST.test(location.hostname)) return false;
    document.body.append(Object.assign(document.createElement('script'), { src: 'build/ui-kit.js' }));
    return true;
  }
  async function start(): Promise<void> {
    if (uiKit()) return;
    document.body.classList.add('noema-booting');
    defineUi(win.customElements);
    defineShell(win.customElements);
    const I18 = I();
    if (I18) await race(I18.ready, 4000).catch((e: unknown) => core.errors.report(e, { where: 'loader.i18n.ready', severity: 'warning' }));
    const services = uiServices();
    provideServices(document.body, services);
    const toaster = document.createElement('noema-toaster');
    document.body.append(toaster);
    await toaster.updateComplete;
    const bridge = core as unknown as { toasts: { use(s: unknown): void }; contracts: { ready(): Promise<void> } };
    bridge.toasts.use(toaster); // NoemaCore.notify draws on the kit's toaster from now on
    // the data contracts' validators (build/contracts.js): nothing opens a subject before they are in; on Today they load
    // after the first screen is drawn
    let contractsLoad: Promise<void> | null = null;
    const contractsIn = (): Promise<void> =>
      (contractsLoad ??= bridge.contracts.ready().catch(core.errors.catcher('loader.contracts', { severity: 'warning' })));
    const C = W().NoemaCloud;
    if (N.config['supabaseUrl'] && (N.config['supabaseKey'] || N.config['supabaseAnonKey']) && C)
      await C.init(N.config).catch(core.errors.catcher('loader.cloud.init', { severity: 'warning' }));
    const url = new URLSearchParams(location.search);
    const boot: AreaBoot = N.boot;
    const authz = url.get('authorization_id');
    if (authz && boot.connectClaude) {
      await boot.connectClaude(authz); // the OAuth consent of the Claude connector
      return;
    }
    const cur = N.jget<{ acc?: string; subj?: string; loggedOut?: boolean; skipPicker?: boolean }>(P + 'current', {});
    const accs = N.accounts();
    // after Log out (Me ▾) the list of profiles, even with only one
    const found = N.getAccount(url.get('account') || cur.acc);
    const a = found ?? (accs.length === 1 && !cur.loggedOut && accs[0] ? accs[0] : await pickAccount());
    N.kv.acc = a.id;
    N.account = a;
    if (a.kind === 'cloud' && C) await race(C.pull(a.id), 7000).catch(core.errors.catcher('loader.cloud.pull', { severity: 'warning' })); // else: the local cache
    if (I18) {
      const st = settings();
      await race(I18.use(st['lang'], st['numerals'] ? { digits: { 'ar-EG': st['numerals'] } } : {}), 4000).catch(
        core.errors.catcher('loader.i18n.use', { severity: 'warning' }),
      );
      const md = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (md) md.content = N.tr('loader.meta.description'); // index.html has no words of its own before the scripts run
    }
    if (C && a.kind === 'cloud') C.startAutoSync(a.id); // already in the pickers: curricula and shares change keys there
    boot.started?.(a);
    const subs = await subjects();
    const wanted = url.get('subject') || (cur.acc === a.id ? (cur.subj ?? null) : null);
    let meta = boot.wanted?.(a, subs, wanted) ?? subs.find(s => s.id === wanted) ?? null;
    const ask = (settings()['askSubjectOnStart'] as boolean | undefined) ?? !!N.config['askSubjectOnStart'];
    // the frame opens on Today and needs no subject; the picker at start stays for whoever asked for it (Me › Profile)
    if ((!meta && !SHELL()) || (ask && !cur.skipPicker && !url.get('subject'))) meta = (await N.pickSubject?.(a.id)) ?? meta;
    // a language course (docs/LANGUAGES.md §8): with shell: false it takes the whole page; in the frame it opens at #/lang/<course>
    if (meta?.kind === 'language' && !SHELL()) {
      await contractsIn();
      await boot.startLanguage?.(a, meta);
      return;
    }
    const course = meta?.kind === 'language' ? meta : null;
    if (course && SHELL()) {
      await contractsIn();
      boot.langBoot?.(a, course, url.get('subject') === course.id);
    }
    if (SHELL()) {
      shell.mount({ engine: !!meta && !course });
      offSplash();
    }
    if (!meta || course) {
      if (SHELL()) {
        offSplash();
        void contractsIn();
        W().NoemaReact?.dayStart(a.id);
        N.autoBackup.start(a.id).catch(core.errors.catcher('loader.autobackup', { severity: 'warning' }));
      }
      return;
    }
    await contractsIn();
    await boot.openEngine?.(a, subs, meta);
  }
  themes.apply(); // the first screen already wears the learner's character
  return { Noema: N, themes, shell, start };
}
