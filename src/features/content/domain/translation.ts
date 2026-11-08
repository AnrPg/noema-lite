/* noema-lite — a pack in several languages (tools/CONTENT_SPEC.md "Packs in several languages"; the shape: noema.subject.v1
   i18n, noema.pack.v3 translations, noema.translation.v1): never the pack's own language; a translation keeps the pack's
   structure, its answers and its code, only the words change. And the languages every new pack gets (requiredLocales). */
import { shapeOf } from './exercise.ts';
import { LANGUAGES } from './rules.ts';
import { has, isObj, lang0, list, LOCALE_RE, obj, objs, s, type Obj, type Report } from './util.ts';

export interface Counted extends Report {
  readonly counts: Readonly<Record<string, number>>;
}
const nn = (v: unknown): unknown => v ?? null;
const len = (v: unknown): number => list(v).length;

/** what a translated exercise must keep (only the words may change): the type, section, picture and everything that decides the answer */
export const exerciseShape = (e: Obj): string =>
  JSON.stringify([
    e.type,
    e.section,
    e.media || null,
    nn(e.answer),
    e.targets || null,
    e.bugs || null,
    e.grid || null,
    ...['options', 'items', 'pairs', 'buckets', 'lines', 'steps'].map(k => (Array.isArray(e[k]) ? len(e[k]) : null)),
    e.type === 'bucket' ? list(e.items).map(x => (isObj(x) ? x.bucket : x)) : null,
    e.type === 'scenario' ? list(e.steps).map(st => list(obj(st).options).map(o => !!obj(o).ok)) : null,
    e.type === 'flaw' ? [nn(e.flaws), nn(e.reason), len(e.reasons)] : null,
    e.type === 'case' ? list(e.parts).map(p => (isObj(p) ? [p.type, nn(p.answer), len(p.options), nn(p.tolerance)] : p)) : null,
    e.type === 'tree'
      ? [nn(e.start), Object.entries(obj(e.nodes)).map(([k, n]) => [k, list(obj(n).options).map(o => [!!obj(o).ok, nn(obj(o).to)])])]
      : null,
    e.type === 'inquiry' ? nn(e.scores) : null,
    e.type === 'debate' ? list(e.sides).map(x => (isObj(x) ? [nn(x.best), len(x.counters)] : x)) : null,
    e.type === 'sim' ? [nn(e.activity), JSON.stringify(nn(e.task)), JSON.stringify(nn(e.grade)), len(e.hints)] : null,
    nn(e.tolerance),
  ]);

const ids = (x: Obj, k: string): unknown[] => list(x[k]).map(y => (isObj(y) ? y.id : undefined));
const join = (a: readonly unknown[]): string => a.map(x => (x == null ? '' : s(x))).join();

/** the chapters of a translation against the pack's: same sections, exercises, cards, playbooks and answers, same code */
export function checkTrChapters(where: string, chapters: readonly Obj[], byId: ReadonlyMap<unknown, Obj>, E: string[]): void {
  for (const c of chapters) {
    const src = byId.get(c.id);
    if (!src) {
      E.push(`${where}: chapter "${s(c.id)}" is not a chapter of the pack`);
      continue;
    }
    const cid = s(c.id);
    if (join(ids(c, 'sections')) !== join(ids(src, 'sections')))
      E.push(`${where}/${cid}: sections must be the source's (${ids(src, 'sections').map(String).join(', ')}), same order`);
    for (const k of ['exercises', 'flashcards', 'debug']) {
      const a = new Set(ids(src, k)),
        b = new Set(ids(c, k)),
        miss = [...a].filter(x => !b.has(x)),
        extra = [...b].filter(x => !a.has(x));
      if (miss.length) E.push(`${where}/${cid}: ${k} missing: ${miss.slice(0, 8).map(String).join(', ')}`);
      if (extra.length) E.push(`${where}/${cid}: ${k} not in the source: ${extra.slice(0, 8).map(String).join(', ')}`);
    }
    const se = new Map(objs(src.exercises).map(e => [e.id, e]));
    for (const e of objs(c.exercises)) {
      const o = se.get(e.id);
      if (o && exerciseShape(e) !== exerciseShape(o))
        E.push(`${where}/${s(e.id)}: type, section, picture or answer differs from the source (only the words may change)`);
    }
    const code = (x: Obj): unknown[] =>
      objs(x.sections).flatMap(sc =>
        objs(sc.blocks)
          .filter(b => b.t === 'code')
          .map(b => b.code ?? b.text ?? ''),
      );
    const a = code(src),
      b = code(c);
    if (a.length !== b.length || a.some((x, i) => x !== b[i]))
      E.push(`${where}/${cid}: code blocks must stay exactly as the source's (translate the comments around them, not the code)`);
  }
}

/** the languages of a pack beyond their shape: never the pack's own language, a translation has the subject's name in its
    language (a warning), an inline translation keeps the pack's structure and answers */
export function checkI18n(p: Obj, chapters: readonly Obj[], E: string[], W: string[]): void {
  const sj = obj(p.subject),
    own = sj.language || 'en';
  const notOwn = (where: string, loc: string): boolean => {
    if (loc !== own) return true;
    E.push(`${where}: "${loc}" is the pack's own language`);
    return false;
  };
  if (isObj(sj.i18n)) for (const loc of Object.keys(sj.i18n)) notOwn(`subject.i18n.${loc}`, loc);
  if (!isObj(p.translations)) return;
  const byId = new Map(chapters.map(c => [c.id, c]));
  for (const [loc, t] of Object.entries(p.translations)) {
    const where = `translations.${loc}`;
    if (!LOCALE_RE.test(loc) || !notOwn(where, loc)) continue;
    if (!(isObj(sj.i18n) && sj.i18n[loc]))
      W.push(`${where}: add subject.i18n.${loc} (title, description) so the picker shows the translated name`);
    if (isObj(t) && t.file !== true && Array.isArray(t.chapters)) checkTrChapters(where, objs(t.chapters), byId, E);
  }
}

export interface RequiredLocales {
  readonly translations: string[];
  readonly bridges: string[];
  readonly bridgePairs: { readonly source: string; readonly native: string }[];
}
/** the languages every new pack gets (rules.ts LANGUAGES), minus the pack's own: the translations, the bridges' native
    languages, and every 文A pair (content language → native): from the pack's own language and from each translation */
export function requiredLocales(own?: unknown): RequiredLocales {
  const o = lang0(own || 'en'),
    translations = LANGUAGES.translations.filter(l => lang0(l) !== o);
  const from = [o, ...(LANGUAGES.bridgesFrom.includes('translations') ? translations.map(lang0) : [])];
  const bridgePairs = from.flatMap(src => LANGUAGES.bridges.filter(n => lang0(n) !== src).map(n => ({ source: src, native: lang0(n) })));
  return { translations, bridges: LANGUAGES.bridges.filter(l => lang0(l) !== o), bridgePairs };
}

/** checkTranslation(t, pack) → one noema-translation file (docs/i18n.md §10) against its pack */
export function checkTranslation(t: unknown, pack?: unknown): Counted {
  const W: string[] = [];
  if (!isObj(t)) return { errors: ['not a JSON object'], warnings: W, counts: {} };
  const E = shapeOf('noema.translation.v1', t);
  const chapters = objs(t.chapters);
  const pk = isObj(pack) ? pack : null,
    ps = pk ? obj(pk.subject) : {};
  if (pk) {
    const own = ps.language || 'en';
    if (ps.id && t.pack && ps.id !== t.pack)
      E.push(`pack: "${s(t.pack)}" — this translation belongs to another subject (this one is "${s(ps.id)}")`);
    if (t.locale && lang0(t.locale) === lang0(own)) E.push(`locale: "${s(t.locale)}" is the pack's own language`);
    checkTrChapters(`translation ${s(t.locale)}`, chapters, new Map(objs(pk.chapters).map(c => [c.id, c])), E);
    const hv = new Set(chapters.map(c => c.id)),
      miss = objs(pk.chapters)
        .filter(c => !hv.has(c.id))
        .map(c => s(c.id));
    if (miss.length) W.push(`chapters not translated yet: ${miss.join(', ')}`);
    if (t.version && pk.version && t.version !== pk.version)
      W.push(`made for pack version ${s(t.version)}; the pack is now ${s(pk.version)} — check the chapters that changed`);
  }
  if (isObj(t.subject)) {
    const src = pk ? ps : null;
    for (const k of ['hero', 'tutor']) {
      const tk = t.subject[k],
        sk = src ? src[k] : undefined;
      if (isObj(tk) && isObj(sk))
        for (const f of Object.keys(tk)) if (!has(sk, f) && !(f in sk)) E.push(`subject.${k}.${f}: the pack's subject.${k} has no "${f}"`);
    }
  } else if (t.subject == null && pk && !(isObj(ps.i18n) && isObj(ps.i18n[s(t.locale)]) && obj(ps.i18n[s(t.locale)]).title))
    W.push(
      `no subject name in ${s(t.locale)}: add "subject": {"title", "description", "hero", …} in ${s(t.locale)} so the picker, the subject's home and the Roadmap show it translated`,
    );
  for (const c of chapters) {
    let j = '';
    try {
      j = JSON.stringify(c);
    } catch {
      j = '';
    }
    if (/<script|javascript:/i.test(j)) E.push(`translation ${s(t.locale)}/${s(c.id)}: no script or javascript: links`);
  }
  return { errors: E, warnings: W, counts: { chapters: Array.isArray(t.chapters) ? t.chapters.length : 0 } };
}
