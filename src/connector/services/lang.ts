/* Language courses through Claude (docs/LANGUAGES.md §10): the app's own code (engine/langcore.js) decides the tasks and checks.
   The record a:langcourse:<id> lists the tasks; the content is the account's langs/<id>.json (written by the app only) or a
   library course on the website (+ the learner's patch langs/<id>.patch.json). Answers go to the inbox a:langin:<id>:<seq>;
   a task handed out is claimed (a:langclaim:<id>:<task>). §10.2: a whole language = one package langs/<course>.lang-<code>.json. */
import type { LangCourseData, LangRecord } from '../engine/api.ts';
import { siteFile, type LibraryLanguage } from '../env.ts';
import type { ToolContext } from '../tool.ts';
import { parseJson, str } from '../util.ts';

export const langPath = (uid: string, id: string, ext = 'json'): string => `${uid}/langs/${id}.${ext}`;
export const packStoragePath = (ctx: ToolContext, cid: string, code: string): string =>
  `${ctx.uid}/${ctx.engine.lang.langPackPath(cid, code)}`;

/** The library courses (D13 peers), fetched once per instance. */
const PEERS = new Map<string, Promise<LangCourseData | null>>();

async function fetchPack(ctx: ToolContext, rel: string): Promise<LangCourseData> {
  const r = await ctx.env.fetch(siteFile(ctx.env.config, rel));
  if (!r.ok) throw new Error(`${rel}: HTTP ${r.status}`);
  const t = await r.text();
  return JSON.parse(
    t
      .slice(t.indexOf('] = ') + 4)
      .trim()
      .replace(/;$/, ''),
  ) as LangCourseData;
}
function libraryCourse(ctx: ToolContext, m: LibraryLanguage): Promise<LangCourseData | null> {
  let p = PEERS.get(m.id);
  if (!p) {
    p = fetchPack(ctx, m.path).catch(() => null);
    PEERS.set(m.id, p);
  }
  return p;
}
/** A fresh copy of a library course (the cached one is never changed). */
async function libraryCopy(ctx: ToolContext, m: LibraryLanguage): Promise<LangCourseData> {
  const d = await libraryCourse(ctx, m);
  if (!d) {
    PEERS.delete(m.id);
    throw new Error(`${m.path}: not readable`);
  }
  return JSON.parse(JSON.stringify(d)) as LangCourseData;
}
export async function langPeers(ctx: ToolContext): Promise<LangCourseData[]> {
  const out: LangCourseData[] = [];
  for (const m of ctx.env.config.languages ?? []) {
    const d = await libraryCourse(ctx, m);
    if (d) out.push(d);
  }
  return out;
}

export async function langRecords(ctx: ToolContext): Promise<LangRecord[]> {
  const out: LangRecord[] = [];
  for (const r of await ctx.kv.rows('a:langcourse:')) {
    const c = parseJson(r.value) as LangRecord | undefined;
    if (c?.format === ctx.engine.lang.LANGJOBS.FORMAT && c.id) out.push(c);
  }
  return out.sort((a, b) => str(b.updated).localeCompare(str(a.updated)));
}

export interface LangContent {
  data: LangCourseData;
  meta?: LibraryLanguage;
  patch?: boolean;
}
/** The course content as the app last saved it (+ for a library course: the learner's patch laid over it). */
async function langContent(ctx: ToolContext, rec: LangRecord): Promise<LangContent> {
  if (rec.origin === 'library') {
    const m = (ctx.env.config.languages ?? []).find(x => x.id === rec.id);
    if (!m) throw new Error(`The library course “${rec.id}” is not on this website.`);
    const d = await libraryCopy(ctx, m);
    const patch = await ctx.storage.json(langPath(ctx.uid, rec.id, 'patch.json'));
    return { data: patch ? ctx.engine.lang.langApplyPatch(d, patch) : d, meta: m, patch: !!patch };
  }
  const d = await ctx.storage.json<LangCourseData>(langPath(ctx.uid, rec.id));
  if (!d)
    throw new Error(
      `The content of “${rec.title}” is not in the cloud yet — open the course once in noema-lite (signed in), then try again.`,
    );
  return { data: d };
}
export interface LangState {
  rec: LangRecord;
  data: LangCourseData;
  content: LangContent;
  pending: number;
}
/** The course as it will be once the app has merged the answers in the inbox — with the queue as it really is (claims). */
export async function langState(ctx: ToolContext, rec: LangRecord): Promise<LangState> {
  const NL = ctx.engine.lang;
  const [inbox, claims, content] = await Promise.all([
    ctx.kv.rows(`${NL.LANGJOBS.IN}${rec.id}:`),
    ctx.kv.rows(`${NL.LANGJOBS.CLAIM}${rec.id}:`),
    langContent(ctx, rec),
  ]);
  const m = NL.langMerged(rec, content.data, inbox, { peers: [] });
  return { rec: NL.langSettle(m.rec, { claims }), data: m.data, content, pending: inbox.length };
}
/** Claim a task for this run: insert the claim if free, else take it over (compare-and-swap) only once its lease ran out. */
export async function claimLangTask(ctx: ToolContext, cid: string, tid: string, force = false): Promise<boolean> {
  const NL = ctx.engine.lang,
    key = NL.langClaimKey(cid, tid),
    value = JSON.stringify({ v: 1, task: tid, at: new Date().toISOString() });
  if (await ctx.kv.insert(key, value)) return true;
  const row = await ctx.kv.row(key);
  if (!row) return !!(await ctx.kv.insert(key, value));
  if (!force && Date.now() - (Date.parse(row.updated_at) || 0) < NL.LANGJOBS.LEASE) return false;
  return !!(await ctx.kv.swap(key, row.updated_at, value));
}
export const releaseLangTask = (ctx: ToolContext, cid: string, tid: string): Promise<void> =>
  ctx.kv.delete(ctx.engine.lang.langClaimKey(cid, tid));

export function langLine(ctx: ToolContext, rec: LangRecord): string {
  const w = ctx.engine.lang.langWork(rec);
  const bits = [
    w.queued.length
      ? `${w.queued.length} task(s) queued: ${w.queued
          .slice(0, 5)
          .map(t => t.id)
          .join(', ')}${w.queued.length > 5 ? '…' : ''}`
      : '',
    w.claimed.length
      ? `${w.claimed.length} being written by another run: ${w.claimed
          .slice(0, 5)
          .map(t => t.id)
          .join(', ')}`
      : '',
  ].filter(Boolean);
  return `- “${rec.title}” — course_id ${rec.id} · ${rec.origin === 'library' ? 'a library course (its refills)' : "the learner's own course"} · ${rec.languages.join(', ')} · ${w.done} task(s) done\n  ${bits.length ? 'To do: ' + bits.join('; ') : 'nothing waiting for you'}`;
}
export async function pickLangCourse(
  ctx: ToolContext,
  id: string,
): Promise<{ rec: LangRecord; error?: undefined } | { error: string; rec?: undefined }> {
  const all = await langRecords(ctx);
  if (!all.length)
    return {
      error:
        'This account has no language course made through Claude yet. In noema-lite: 🌍 Languages → ✨ New language course (or ✨ Ask Claude for more sentences on a grammar page).',
    };
  if (id) {
    const c = all.find(x => x.id === id) ?? all.find(x => str(x.title).toLowerCase() === id.toLowerCase());
    return c
      ? { rec: c }
      : { error: `No language course “${id}”. The learner's courses:\n${all.map(x => `- ${x.id}: “${x.title}”`).join('\n')}` };
  }
  const busy = all.filter(c => ctx.engine.lang.langWork(c).queued.length);
  if (busy.length === 1 && busy[0]) return { rec: busy[0] };
  return { error: `Which course? Call again with course_id:\n${all.map(r => langLine(ctx, r)).join('\n')}` };
}
/** How Claude gets the course into its sandbox: a signed link (2 h) to the account's copy — or to a working copy with the
    answers still waiting in the inbox merged in (the connector never writes the course itself). */
export async function langFiles(ctx: ToolContext, st: LangState): Promise<{ url: string; name: string }[]> {
  if (st.rec.origin === 'library' && st.content.meta) {
    const meta = st.content.meta,
      files = [{ url: siteFile(ctx.env.config, meta.path), name: 'course.pack.js' }];
    if (meta.profiles) files.push({ url: siteFile(ctx.env.config, meta.profiles), name: 'course.profiles.js' });
    if (st.content.patch)
      files.push({ url: await ctx.storage.downloadUrl(langPath(ctx.uid, st.rec.id, 'patch.json'), 7200), name: 'patch.json' });
    return files;
  }
  let path = langPath(ctx.uid, st.rec.id);
  if (st.pending) {
    path = langPath(ctx.uid, st.rec.id, 'view.json');
    await ctx.storage.writeJson(path, JSON.stringify(st.data));
  }
  return [{ url: await ctx.storage.downloadUrl(path, 7200), name: 'course.json' }];
}

/* ---------- §10.2 the language package ---------- */
export type PackCourse =
  | { id: string; title: string; origin: 'library'; meta: LibraryLanguage; rec?: undefined; error?: undefined }
  | { id: string; title: string; origin: 'account'; rec: LangRecord; meta?: undefined; error?: undefined }
  | { error: string };
/** A course a package can be for: a library course of the website or one of the learner's own (by id or title). */
export async function packCourse(ctx: ToolContext, idArg: string): Promise<PackCourse> {
  const id = idArg.trim(),
    low = id.toLowerCase(),
    libs = ctx.env.config.languages ?? [];
  const lib = libs.find(m => m.id === id || str(m.title).toLowerCase() === low);
  if (lib) return { id: lib.id, title: lib.title ?? lib.id, origin: 'library', meta: lib };
  const recs = (await langRecords(ctx)).filter(r => r.origin === 'account');
  const r = recs.find(x => x.id === id || str(x.title).toLowerCase() === low);
  if (r) return { id: r.id, title: r.title, origin: 'account', rec: r };
  const all = [
    ...libs.map(m => `- ${m.id}: “${m.title}” (library: ${(m.languages ?? []).join(', ')})`),
    ...recs.map(x => `- ${x.id}: “${x.title}” (the learner's own: ${x.languages.join(', ')})`),
  ];
  if (!id && all.length === 1) {
    const l0 = libs[0],
      r0 = recs[0];
    if (l0) return packCourse(ctx, l0.id);
    if (r0) return { id: r0.id, title: r0.title, origin: 'account', rec: r0 };
  }
  return {
    error: `${id ? `No language course “${id}”.` : 'Which course? Call again with course_id.'} The courses:\n${all.join('\n') || '(none)'}`,
  };
}
/** The course a package is checked against: the library course file of the website, or the account course's content —
    WITHOUT the learner's packages (a package adds a language that is new to the course itself). */
export async function packBase(ctx: ToolContext, pc: Exclude<PackCourse, { error: string }>): Promise<LangCourseData> {
  if (pc.origin === 'library') return libraryCopy(ctx, pc.meta);
  const d = await ctx.storage.json<LangCourseData>(langPath(ctx.uid, pc.id));
  if (!d)
    throw new Error(
      `The content of “${pc.title}” is not in the cloud yet — open the course once in noema-lite (signed in), then try again.`,
    );
  return d;
}
/** A language code from a code or a name (Persian → fa): the course's profiles of the world's languages, then Intl. */
export function langCodeOf(arg: unknown, data: LangCourseData): string | null {
  const a = str(arg).trim();
  if (/^[a-z]{2,3}$/.test(a)) return a;
  const low = a.toLowerCase();
  if (!low) return null;
  const w = (data.world?.languages ?? []).find(l => str(l.name).toLowerCase() === low || str(l.code) === low);
  if (w) return w.code;
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'language' });
    for (let i = 0; i < 676; i++) {
      const c = String.fromCharCode(97 + Math.floor(i / 26), 97 + (i % 26));
      if ((dn.of(c) ?? '').toLowerCase() === low) return c;
    }
  } catch {
    return null;
  }
  return null;
}
