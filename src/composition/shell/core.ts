/**
 * window.Noema — the app's core for the older screens (the phase bridge's UI half, docs/ARCHITECTURE.md §6.3): the
 * profiles of this device and the open one, the timed key/value store, the stats, the Gemini key, the app's IndexedDB,
 * backups and restore points, the auto-backup to a folder, the 🔔 news kept here, the overlays of the start (who is
 * learning), the "in use on another device" cover, and the start itself. The other areas add their parts to it
 * (engine/app/*.js: the library, sharing and Explore, Roadmaps and Claude, the language courses) until phase 3 replaces
 * them; phase 2 replaces the data parts with NoemaCore's read models.
 */
import { CHARACTER_EMOJI } from '../../features/shell/domain/characters.ts';
import { dayOf } from '../../kernel/day.ts';
import { AccountKv, AccountStats, GeminiKey, LocalAccounts, NoticeStore, P, jsonOf, profileId, putJson, type Account, type DeviceKv } from './kv.ts';
import { h, type Kid } from './dom.ts';
import { legacy, type AreaBoot, type NoemaAreas, type SubjectMeta } from './legacy.ts';
import type { NoemaCoreBridge } from '../bridge.ts';

export const VERSION = '1.0.0';
export const APP_DEFAULTS = { appName: 'noema-lite', supabaseUrl: '', supabaseKey: '', autoBackupMinutes: 5, askSubjectOnStart: false, shell: true, onboarding: true };

/* ---------------- 🧹 the frame speaks without the older screens' emoji ----------------
   A dialog of the older screens opened from the frame, the Roadmap page and the toasts lose their pictographs (the frame
   uses line icons). Kept: arrows and ©®™, anything inside an element whose class names an emoji (a subject's own icon:
   .nx-emo, .cm-emo…), [data-emoji], what the learner typed (inputs) and lesson text (.md, .lesson). */
const EMO =
  /(?![©®™←-⇿■-◿])[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}](?:️|⃣|[\u{1F3FB}-\u{1F3FF}]|‍[\p{Extended_Pictographic}♀♂])*️?[  ]?/gu;
export const plainText = (t: unknown): unknown => {
  if (typeof t !== 'string') return t;
  const r = t.replace(EMO, '');
  return r === t ? t : r.replace(/[  ]{2,}/g, ' ').replace(/^[  ]+(?=\S)/, '');
};
const KEEP = '[class*="emo"],[data-emoji],.md,.lesson,.ns-ico,script,style,textarea';

/** The app's IndexedDB (imported packs, folder handles, restore points, conversations): the same database as NoemaCore.storage.docs. */
export const IDB = {
  db: null as IDBDatabase | null,
  open(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      const r = indexedDB.open('noema-lite', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const n of ['packs', 'handles', 'restore', 'convos']) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n);
      };
      r.onsuccess = () => {
        this.db = r.result;
        res(r.result);
      };
      r.onerror = () => {
        rej(r.error ?? new Error('indexedDB'));
      };
    });
  },
  get<T = unknown>(store: string, key: string): Promise<T | undefined> {
    return this.open().then(
      d =>
        new Promise((res, rej) => {
          const r = d.transaction(store).objectStore(store).get(key);
          r.onsuccess = () => {
            res(r.result as T | undefined);
          };
          r.onerror = () => {
            rej(r.error ?? new Error('get'));
          };
        }),
    );
  },
  put(store: string, key: string, val: unknown): Promise<void> {
    return this.open().then(
      d =>
        new Promise((res, rej) => {
          const t = d.transaction(store, 'readwrite');
          t.objectStore(store).put(val, key);
          t.oncomplete = () => {
            res();
          };
          t.onerror = () => {
            rej(t.error ?? new Error('put'));
          };
        }),
    );
  },
  del(store: string, key: string): Promise<void> {
    return this.open().then(
      d =>
        new Promise((res, rej) => {
          const t = d.transaction(store, 'readwrite');
          t.objectStore(store).delete(key);
          t.oncomplete = () => {
            res();
          };
          t.onerror = () => {
            rej(t.error ?? new Error('del'));
          };
        }),
    );
  },
  entries<T = unknown>(store: string, prefix = ''): Promise<[string, T][]> {
    return this.open().then(
      d =>
        new Promise((res, rej) => {
          const out: [string, T][] = [];
          const r = d.transaction(store).objectStore(store).openCursor();
          r.onsuccess = () => {
            const c = r.result;
            if (!c) {
              res(out);
              return;
            }
            const key = typeof c.key === 'string' ? c.key : JSON.stringify(c.key);
            if (key.startsWith(prefix)) out.push([key, c.value as T]);
            c.continue();
          };
          r.onerror = () => {
            rej(r.error ?? new Error('entries'));
          };
        }),
    );
  },
};

const stamp = (): string => {
  const d = new Date(),
    p = (n: number) => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
};
export async function sha256(s: string): Promise<string> {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}

type Json = Record<string, unknown>;
/** a JSON object's text → the object (anything else: null) */
function objectOf(text: string): Json | null {
  try {
    const v: unknown = JSON.parse(text);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : null;
  } catch {
    return null;
  }
}
interface Backup {
  format: string;
  version?: number;
  data: Record<string, unknown>;
  account: { id: string; name?: string; emoji?: string; kind?: string; email?: string | null };
  includesSecrets?: boolean;
  importedPacks?: { id: string; pack: unknown }[];
  conversations?: unknown[];
  [k: string]: unknown;
}
interface DirHandle {
  readonly name: string;
  queryPermission(o: unknown): Promise<string>;
  requestPermission(o: unknown): Promise<string>;
  getDirectoryHandle(n: string, o: { create: boolean }): Promise<DirHandle>;
  getFileHandle(n: string, o: { create: boolean }): Promise<{ createWritable(): Promise<{ write(t: string): Promise<void>; close(): Promise<void> }> }>;
}

export function createCore(core: NoemaCoreBridge) {
  const W = legacy;
  const CFG: Json = { ...APP_DEFAULTS, ...(W().NOEMA_CONFIG ?? {}) };
  const LOCAL = W().NOEMA_CONFIG_LOCAL ?? {};
  const REG = W().NOEMA_REGISTRY ?? { accounts: [], subjects: [] };
  const kv: DeviceKv = core.storage.kv;
  const caught = (where: string, severity: 'warning' | 'info' | 'error' = 'warning') => core.errors.catcher(where, { severity });
  const KV = new AccountKv(kv, () => Date.now(), e => core.errors.report(e, { where: 'loader.kv.listener', severity: 'error' }));
  const locals = new LocalAccounts(kv, () => REG.accounts ?? [], () => Date.now());
  const stats = new AccountStats(KV, () => dayOf(core.clock.now()));
  const geminiKey = new GeminiKey(kv, KV, () => (typeof LOCAL['geminiKey'] === 'string' ? LOCAL['geminiKey'] : (W().DEFAULT_GEMINI_KEY ?? '')));
  const notices = new NoticeStore(kv, () => Math.random().toString(36).slice(2, 7));
  const jget = <T>(k: string, d: T): T => jsonOf<T>(kv, k, d);
  const jset = (k: string, v: unknown): boolean => putJson(kv, k, v);

  /* ---------------- words ---------------- */
  /** the interface language: the account's settings.lang (else the last account's), else the browser's */
  const uiPref = (acc: string | null = KV.acc ?? jget<{ acc?: string }>(P + 'current', {}).acc ?? null): unknown =>
    acc ? jget<Json>(`${P}${acc}:a:settings`, {})['lang'] : null;
  const tr = (key: string, vars?: Record<string, unknown> | null, acc?: string | null): string => W().NoemaI18n?.t(key, vars ?? null, uiPref(acc)) ?? key;
  /** <b> <i> <code> <kbd> in a message (literal text for ICU) → those elements, with plain text inside (never HTML) */
  const tagged = (t: string): Kid[] => {
    const out: Kid[] = [];
    let last = 0;
    for (const m of t.matchAll(/<(b|i|code|kbd)>([^<]*)<\/\1>/g)) {
      out.push(t.slice(last, m.index), h(m[1] ?? 'b', {}, m[2]));
      last = m.index + m[0].length;
    }
    out.push(t.slice(last));
    return out;
  };
  /** a sentence with elements inside it: the message's {placeholders} named in nodes are filled with those nodes */
  function trx(key: string, nodes: Record<string, Node> = {}, vars?: Record<string, unknown> | null, acc?: string | null): Kid[] {
    const names = Object.keys(nodes),
      marks = Object.fromEntries(names.map((n, i) => [n, `\u0001${String(i)}\u0001`]));
    return tr(key, { ...(vars ?? {}), ...marks }, acc)
      .split('\u0001')
      .flatMap((x, i) => (i % 2 ? [nodes[names[+x] ?? ''] ?? null] : tagged(x)))
      .filter(x => x !== '');
  }
  const errMsg = (e: unknown): string => W().NoemaI18n?.err(e) ?? String((e as Error | null)?.message ?? e);

  /* ---------------- plain text in the frame ---------------- */
  let plainOn = (): boolean => false;
  function plainTree(root: Node | null): Node | null {
    if (!root || !plainOn()) return root;
    if (root.nodeType === 3) {
      if (!root.parentElement?.closest(KEEP)) {
        const t = plainText(root.nodeValue) as string;
        if (t !== root.nodeValue) root.nodeValue = t;
      }
      return root;
    }
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT),
      list: Node[] = [];
    let n: Node | null;
    while ((n = w.nextNode())) list.push(n);
    for (const x of list) plainTree(x);
    (root as Element).querySelectorAll('[title],[aria-label],[placeholder]').forEach(e => {
      for (const a of ['title', 'aria-label', 'placeholder']) {
        const v = e.getAttribute(a);
        if (v) {
          const t = plainText(v) as string;
          if (t !== v) e.setAttribute(a, t);
        }
      }
    });
    return root;
  }
  const watched = new WeakSet<Node>();
  /** keep a part of the page plain while it redraws itself */
  function plainWatch(root: HTMLElement | null): HTMLElement | null {
    if (!root || !plainOn() || watched.has(root)) return root;
    watched.add(root);
    plainTree(root);
    new MutationObserver(ms => {
      for (const m of ms) {
        if (m.type === 'characterData') plainTree(m.target);
        else
          m.addedNodes.forEach(x => {
            plainTree(x);
          });
      }
    }).observe(root, { childList: true, subtree: true, characterData: true });
    return root;
  }
  const toast = (m: unknown, ms = 2400): void => {
    core.notify.toast(String(plainText(m)), { ms });
  };

  /* ---------------- overlays (the start's pickers, the older screens' dialogs) ---------------- */
  function overlay(build: (box: HTMLElement, close: () => void) => void, { closable = true }: { closable?: boolean } = {}): () => void {
    const o = h('div', { class: 'noema-overlay' }),
      box = h('div', { class: 'noema-ovbox' });
    o.append(box);
    const close = (): void => {
      o.classList.add('out');
      setTimeout(() => {
        o.remove();
      }, 250);
    };
    if (closable)
      o.addEventListener('click', e => {
        if (e.target === o) close();
      });
    build(box, close);
    plainWatch(box);
    document.body.append(o);
    return close;
  }
  const brandHead = (title: string, sub?: string | null): HTMLElement =>
    h('div', { class: 'noema-ovhead' }, h('div', {}, h('h1', {}, title), sub ? h('p', { class: 'muted' }, sub) : null));

  /* ---------------- profiles ---------------- */
  function cloudAccount(): Account | null {
    const s = W().NoemaCloud?.session();
    if (!s) return null;
    const id = 'u_' + s.user.id,
      prof = jget<{ name?: string; emoji?: string }>(P + id + ':a:profile', {});
    return { id, kind: 'cloud', email: s.user.email, name: prof.name || s.user.user_metadata?.name || s.user.email.split('@')[0] || '', emoji: prof.emoji || '☁️' };
  }
  const allAccounts = (): Account[] => {
    const c = cloudAccount();
    return [...(c ? [c] : []), ...locals.list()];
  };
  const getAccount = (id: string | null | undefined): Account | null => allAccounts().find(a => a.id === id) ?? null;

  /* ---------------- backups & restore ---------------- */
  const fmtWhen = (t: number): string => W().NoemaI18n?.fmt.date(t, { dateStyle: 'medium', timeStyle: 'short' }) ?? new Date(t).toLocaleString();
  const areas = (): NoemaAreas => Noema;
  const backup = {
    async collect(acc: string, { includeSecrets = false }: { includeSecrets?: boolean } = {}): Promise<Backup> {
      const a = getAccount(acc) ?? { id: acc, kind: 'local' as const, name: acc };
      const data: Record<string, string> = KV.accountData(acc);
      const st = data['a:settings'];
      if (st) {
        // settings that are not JSON hold no key to strip: they are backed up as they are
        const s = objectOf(st);
        if (s) {
          delete s['apiKey'];
          if (includeSecrets && geminiKey.get(acc)) s['apiKey'] = geminiKey.get(acc);
          data['a:settings'] = JSON.stringify(s);
        }
      }
      const packs = ((await areas().importedPacks?.(acc)) ?? []).map(p => ({ id: p.subject.id, pack: p }));
      const C = W().NoemaConvos;
      const conversations = C ? await C.list(acc, { includeDeleted: true }).catch(() => []) : [];
      return {
        format: 'noema-lite-backup',
        version: 2,
        conversationSchema: C?.SCHEMA,
        conversations,
        app: CFG['appName'],
        appVersion: VERSION,
        createdAt: new Date().toISOString(),
        account: { id: a.id, name: a.name, emoji: a.emoji ?? '', kind: a.kind, email: a.email ?? null },
        includesSecrets: includeSecrets,
        data,
        importedPacks: packs,
      };
    },
    fileName(acc: string): string {
      return `noema-lite-backup_${acc}_${stamp()}.json`;
    },
    download(obj: Backup): void {
      jset(`${P}${obj.account.id}:meta:lastDownloadBackup`, Date.now());
      const u = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 1)], { type: 'application/json' }));
      const x = h('a', { href: u, download: this.fileName(obj.account.id) });
      document.body.append(x);
      x.click();
      x.remove();
      setTimeout(() => {
        URL.revokeObjectURL(u);
      }, 5000);
    },
    validate(obj: unknown): Backup {
      const o = obj as Partial<Backup> | null;
      if (o?.format === 'noema-lite-backup' && o.data) return o as Backup;
      throw new Error(tr('loader.backup.notBackup'));
    },
    async restorePoint(acc: string, label: string, words?: { k?: string; p?: Json }): Promise<string> {
      const snap = await this.collect(acc, { includeSecrets: true });
      const key = acc + '|' + String(Date.now());
      // label: the words of now; k, p: a catalog key, shown in the UI language of later
      await IDB.put('restore', key, { label, at: Date.now(), snap, ...(words?.k ? { k: words.k, p: words.p ?? {} } : {}) });
      const all = (await IDB.entries<{ at: number }>('restore', acc + '|')).sort((x, y) => x[1].at - y[1].at);
      while (all.length > 12) {
        const first = all.shift();
        if (first) await IDB.del('restore', first[0]);
      }
      return key;
    },
    async listRestorePoints(acc: string) {
      try {
        return (await IDB.entries<{ label: string; k?: string; p?: Json; at: number; snap: unknown }>('restore', acc + '|'))
          .map(([k, v]) => ({ key: k, label: v.label, k: v.k ?? null, p: v.p ?? null, at: v.at, size: JSON.stringify(v.snap).length }))
          .sort((a, b) => b.at - a.at);
      } catch {
        return [];
      }
    },
    async getRestorePoint(key: string): Promise<unknown> {
      return (await IDB.get<{ snap: unknown }>('restore', key))?.snap;
    },
    /** mode: 'replace' (wipe the target profile, then write) | 'merge' (overwrite the keys the backup has) */
    async apply(obj0: unknown, targetAcc: string, mode: 'replace' | 'merge' = 'replace'): Promise<true> {
      const obj = this.validate(obj0);
      await this.restorePoint(targetAcc, tr('loader.backup.beforeRestore', { when: fmtWhen(Date.now()) })); // a label the learner reads later: in the language of now
      const pre = `${P}${targetAcc}:`;
      if (mode === 'replace')
        for (const k of kv.keys(pre)) {
          const suf = k.slice(pre.length);
          if (!suf.startsWith('meta:') && !(suf in obj.data)) KV.del(k); // a synced account deletes them in the cloud too
        }
      for (const [suf, val] of Object.entries(obj.data)) {
        let v = val;
        if (suf === 'a:settings' && typeof val === 'string') {
          // settings that are not JSON hold no key to take out: they are restored as they are
          const nv = objectOf(val);
          if (nv) {
            if (obj.includesSecrets && nv['apiKey']) geminiKey.set(targetAcc, nv['apiKey']);
            delete nv['apiKey'];
            v = JSON.stringify(nv);
          }
        }
        KV.set(pre + suf, typeof v === 'string' ? v : JSON.stringify(v));
      }
      for (const p of obj.importedPacks ?? []) await IDB.put('packs', targetAcc + '|' + p.id, p.pack);
      const C = W().NoemaConvos;
      if (C) {
        if (mode === 'replace') await C.clear(targetAcc);
        const a = getAccount(targetAcc) ?? { id: targetAcc, kind: 'local' };
        for (const r of obj.conversations ?? []) await C.put(targetAcc, { ...(r as Json), account: { id: a.id, kind: a.kind } }, { keepUpdatedAt: true });
        if (mode === 'replace') kv.delete(`${P}${targetAcc}:meta:convosMigrated`);
      }
      if (targetAcc === KV.acc) KV.sealed = targetAcc; // every caller reloads (or switches profile) next
      return true;
    },
  };

  /* ---------------- auto-backup to a folder (File System Access API: Chrome / Edge) ---------------- */
  const autoBackup = {
    supported: (): boolean => 'showDirectoryPicker' in window,
    timer: 0,
    status: 'off' as 'off' | 'on' | 'needs-permission',
    lastAt: null as number | null,
    convoHook: false,
    async handle(acc: string): Promise<DirHandle | null> {
      try {
        return (await IDB.get<DirHandle>('handles', 'dir|' + acc)) ?? null;
      } catch {
        return null;
      }
    },
    async choose(acc: string): Promise<string> {
      const page = W();
      if (!page.showDirectoryPicker) throw new Error('showDirectoryPicker');
      const hd = (await page.showDirectoryPicker({ id: 'noema-backups', mode: 'readwrite' })) as DirHandle;
      await IDB.put('handles', 'dir|' + acc, hd);
      this.status = 'on';
      await this.run(acc, true);
      void this.start(acc);
      return hd.name;
    },
    async disable(acc: string): Promise<void> {
      await IDB.del('handles', 'dir|' + acc);
      this.status = 'off';
      clearInterval(this.timer);
    },
    async permitted(hd: DirHandle | null, ask = false): Promise<boolean> {
      if (!hd) return false;
      const o = { mode: 'readwrite' };
      if ((await hd.queryPermission(o)) === 'granted') return true;
      return ask && (await hd.requestPermission(o)) === 'granted';
    },
    async run(acc: string, force = false): Promise<boolean> {
      const hd = await this.handle(acc);
      if (!hd) {
        this.status = 'off';
        return false;
      }
      if (!(await this.permitted(hd))) {
        this.status = 'needs-permission';
        return false;
      }
      const dirty = jget<number>(`${P}${acc}:meta:dirty`, 0),
        last = jget<number>(`${P}${acc}:meta:lastFolderBackup`, 0);
      if (!force && dirty <= last) return true;
      // the folder:  <chosen>/backups/noema-lite-backup_<acc>_<day>.json (+ _latest)   <chosen>/conversations/<subject>/<YYYY-MM>/<id>.json|.md
      const bdir = await hd.getDirectoryHandle('backups', { create: true });
      const obj = await backup.collect(acc);
      const day = core.clock.today();
      for (const name of [`noema-lite-backup_${acc}_${day}.json`, `noema-lite-backup_${acc}_latest.json`]) {
        const fh = await bdir.getFileHandle(name, { create: true }),
          w = await fh.createWritable();
        await w.write(JSON.stringify(obj, null, 1));
        await w.close();
      }
      const C = W().NoemaConvos;
      if (C) {
        await C.writeToFolder(acc, hd, { all: force && !jget<number>(`${P}${acc}:meta:convosFolderSeeded`, 0) });
        jset(`${P}${acc}:meta:convosFolderSeeded`, 1);
      }
      jset(`${P}${acc}:meta:lastFolderBackup`, Date.now());
      this.lastAt = Date.now();
      this.status = 'on';
      return true;
    },
    async start(acc: string): Promise<void> {
      clearInterval(this.timer);
      const hd = await this.handle(acc);
      if (!hd) {
        this.status = 'off';
        return;
      }
      this.status = (await this.permitted(hd)) ? 'on' : 'needs-permission';
      this.timer = window.setInterval(
        () => {
          this.run(acc).catch(caught('loader.autobackup'));
        },
        Math.max(1, Number(CFG['autoBackupMinutes']) || 5) * 60e3,
      );
      // conversations are written to the folder within ~20 s of any change (independently of the 5-minute backup)
      const C = W().NoemaConvos;
      if (C && !this.convoHook) {
        this.convoHook = true;
        let t = 0;
        C.onChange(a => {
          if (a !== acc) return;
          clearTimeout(t);
          t = window.setTimeout(() => {
            void (async () => {
              const hd2 = await this.handle(acc);
              if (hd2 && (await this.permitted(hd2))) await C.writeToFolder(acc, hd2).catch(caught('loader.autobackup.convos'));
            })();
          }, 20000);
        });
      }
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') this.run(acc).catch(caught('loader.autobackup'));
      });
    },
  };

  /* ---------------- the object the older screens use ---------------- */
  const Noema = {
    version: VERSION,
    config: CFG,
    local: LOCAL,
    registry: REG,
    kv: KV,
    stats,
    geminiKey,
    idb: IDB,
    backup,
    autoBackup,
    notices,
    account: null as Account | null,
    subject: null as (SubjectMeta & Json) | null,
    subjectMeta: null as SubjectMeta | null,
    pack: null as unknown,
    node: null as unknown,
    backgroundEngine: false,
    switching: false,
    convos: W().NoemaConvos ?? null,
    preloadedConvos: [] as unknown[],
    boot: {} as AreaBoot,
    el: h,
    esc: (s: unknown): string =>
      (typeof s === 'string' ? s : s == null ? '' : JSON.stringify(s)).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c), // i18n-ignore (HTML escapes)
    jget,
    jset,
    tr,
    trx,
    errMsg,
    caught,
    sha256,
    stamp,
    slugify: (s: unknown): string => profileId(String(s), new Set()),
    uiPref,
    overlay,
    brandHead,
    toast,
    plain: { text: (t: unknown) => (plainOn() ? plainText(t) : t), tree: plainTree, watch: plainWatch },
    /** 🔔 a piece of news: a toast while at most two are on screen; a third moves them all to the bell (NoemaCore.notify's rule) */
    notice: (m: unknown, ms = 4000): void => {
      core.notify.notice(String(plainText(m)), { ms });
    },
    accounts: allAccounts,
    getAccount,
    cloudAccount,
    saveLocalAccount: (a: Account): void => {
      locals.save(a);
    },
    removeLocalAccount: (id: string): void => {
      locals.remove(id);
    },
    newProfileId: (name: string): string => profileId(name, new Set(allAccounts().map(a => a.id))),
    /** every key of a profile, and its 🔔 news (kept outside the synced keys) */
    wipeAccountData(id: string): void {
      for (const k of kv.keys(`${P}${id}:`)) kv.delete(k);
      kv.delete(notices.key(id));
    },
    /** while a switch reloads the page, the subject still open must not take its place back */
    setCurrent(acc: string, subj: string | null): void {
      if (Noema.switching) return;
      jset(P + 'current', { acc, subj });
    },
    /** a ?subject= link must not win over the new choice; hash: where to land (#/subject, #/s/<id>, …) */
    switchTo(acc: string, subj: string | null, hash?: string): void {
      Noema.switching = true;
      jset(P + 'current', { acc, subj, skipPicker: !!subj });
      if (/[?&](subject|account)=/.test(location.search)) {
        location.replace(location.pathname + (hash ?? ''));
        return;
      }
      location.hash = hash ?? '';
      location.reload();
    },
    /** the frame is up: its texts lose the older screens' emoji */
    framed(on: () => boolean): void {
      plainOn = on;
    },
    faceEmoji: CHARACTER_EMOJI,
  };
  return Noema;
}
export type NoemaCoreObject = ReturnType<typeof createCore>;
