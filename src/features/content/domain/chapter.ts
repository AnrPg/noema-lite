/* noema-lite — the authoring check of one chapter file and of subject.json (the skill's and the library's sources, before
   make_pack.py / build.py put them into a pack; tools/CONTENT_SPEC.md, docs/VISUAL.md). Stricter than the pack check: the
   chapter's contract and every exercise's (#exercise, #exerciseSource), ids that match the chapter, answers that are one of
   their own options, regions inside their picture, the media and activities of the pack, the quantities, and (options)
   the quantity rules, the quality rules, a translation against its source chapter. `noema-tools validate` runs it. */
import { check } from '../../../contracts/index.ts';
import { checkBalance } from './balance.ts';
import { checkQuality } from './quality.ts';
import { isNum, isObj, isStr, list, LOCALE_RE, obj, objs, s, type Obj, type Report } from './util.ts';

export const VTYPES: ReadonlySet<string> = new Set([
  'img_hotspot',
  'img_sequence',
  'img_reveal',
  'img_drag',
  'img_label',
  'img_select',
  'img_occlusion',
]);
/** the critical-thinking types (CONTENT_SPEC.md) */
export const TTYPES: ReadonlySet<string> = new Set(['flaw', 'case', 'predict', 'tree', 'inquiry', 'debate']);
const TYPES: ReadonlySet<string> = new Set([
  'mcq',
  'tf',
  'odd',
  'order',
  'match',
  'bucket',
  'cloze',
  'spotbug',
  'calc',
  'scenario',
  'free',
  'write',
  'sim',
  ...TTYPES,
  ...VTYPES,
]);
/** the locales a learner can have as UI language (engine/i18n.js LOCALES) + the bare language a regional one falls back to */
export const UI_LOCALES: ReadonlySet<string> = new Set([
  'en',
  'el',
  'ru',
  'fr',
  'ar-EG',
  'ar',
  'de',
  'hi',
  'zh-Hans',
  'zh-Hant',
  'ja',
  'it',
  'es-ES',
  'es',
  'sq',
  'pt-PT',
  'pt',
  'tr',
]);
const I18N_TEXT = ['title', 'appTitle', 'description', 'searchExamples'];
const I18N_OBJ = ['hero', 'tutor'];

/** a value as Python's repr writes it (the messages the skill's authors have always read) */
export function pyRepr(v: unknown): string {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'string') return v.includes("'") && !v.includes('"') ? `"${v}"` : `'${v.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  if (typeof v === 'number') return String(v);
  if (Array.isArray(v)) return `[${v.map(pyRepr).join(', ')}]`;
  if (isObj(v))
    return `{${Object.entries(v)
      .map(([k, x]) => `${pyRepr(k)}: ${pyRepr(x)}`)
      .join(', ')}}`;
  return s(v);
}
const idx = (v: unknown, n: number): boolean => Number.isInteger(v) && (v as number) >= 0 && (v as number) < n;
const g = (n: unknown): string => s(n);

/** the media of the pack ({id: {w, h, regions}}) and its activities ({id: item}) — each null when the caller has none */
export interface ChapterContext {
  readonly media?: Obj | null;
  readonly activities?: Obj | null;
  /** the activity checks of an interactive block and of a sim exercise (activities/registry.ts) */
  readonly checkBlock?: (b: Obj, items: Obj) => string[];
  readonly checkSim?: (e: Obj, items: Obj) => string[];
}
export interface ChapterOptions extends ChapterContext {
  readonly minVisual?: number;
  /** the quality rules: 'error' → issues of level error are errors (Claude/Gemini-made packs); 'warn' → all warnings */
  readonly quality?: 'error' | 'warn' | null;
  /** every exercise type, difficulty and focus tag at least N times: errors (balance) or warnings (balanceWarn) */
  readonly balance?: number;
  readonly balanceWarn?: number;
  /** the subject's features that are on (code, math) */
  readonly features?: readonly string[];
  /** the file is a translation of this source chapter (as built: base + patches) */
  readonly source?: unknown;
}
export interface ChapterReport extends Report {
  readonly summary: {
    readonly sections: number;
    readonly exercises: number;
    readonly visual: number;
    readonly figures: number;
    readonly playbooks: number;
    readonly flashcards: number;
    readonly pitfalls: number;
    readonly types: Readonly<Record<string, number>>;
    readonly tags: Readonly<Record<string, number>>;
  };
}

/** the corners / points of a region (its shape: noema.visual.v1#region), or null when its shape is not complete */
function regionPoints(r: Obj): [number, number][] | null {
  const n = (k: string): number => r[k] as number;
  if (r.shape === 'rect' && ['x', 'y', 'w', 'h'].every(k => isNum(r[k])))
    return [
      [n('x'), n('y')],
      [n('x') + n('w'), n('y') + n('h')],
    ];
  if (r.shape === 'circle' && ['cx', 'cy', 'r'].every(k => isNum(r[k])))
    return [
      [n('cx') - n('r'), n('cy') - n('r')],
      [n('cx') + n('r'), n('cy') + n('r')],
    ];
  if (r.shape === 'poly' && Array.isArray(r.points) && r.points.every(q => Array.isArray(q) && q.length === 2 && q.every(isNum)))
    return (r.points as [number, number][]).map(q => [q[0], q[1]]);
  return null;
}

/** the authoring check of one chapter (validate.py chNN.json) */
export function checkChapter(chIn: unknown, o: ChapterOptions = {}): ChapterReport {
  const errors: string[] = [],
    warns: string[] = [];
  const E = (m: string): void => {
    errors.push(m);
  };
  const W = (m: string): void => {
    warns.push(m);
  };
  const MEDIA = o.media ?? null,
    ACTIVITIES = o.activities ?? null;
  const ch = obj(chIn);

  const checkRegions = (where: string, regions: unknown, IW?: unknown, IH?: unknown): Map<string, Obj> => {
    const out = new Map<string, Obj>();
    if (!Array.isArray(regions)) return out;
    for (const r of regions as unknown[]) {
      if (!isObj(r) || typeof r.id !== 'string') continue;
      const rid = r.id;
      if (out.has(rid)) E(`${where}: duplicate region id ${rid}`);
      out.set(rid, r);
      const pts = regionPoints(r);
      if (pts === null) continue;
      if (Array.isArray(r.anchor) && r.anchor.length === 2) pts.push([r.anchor[0] as number, r.anchor[1] as number]);
      if (isNum(IW) && isNum(IH) && IW && IH && pts.some(([x, y]) => x < -0.5 || y < -0.5 || x > IW + 0.5 || y > IH + 0.5))
        E(`${where}/${rid}: region outside the ${g(IW)}x${g(IH)} picture`);
    }
    return out;
  };

  const checkVisual = (eid: string, e: Obj): void => {
    const t = e.type,
      mid = e.media;
    if (!isStr(mid)) return;
    const m = MEDIA ? MEDIA[mid] : undefined;
    if (MEDIA !== null && !m) {
      E(`${eid}: media '${mid}' not in media/media.json`);
      return;
    }
    const mo = obj(m);
    const IW = mo.w,
      IH = mo.h;
    let regions: unknown = 'regions' in e ? e.regions : m ? mo.regions : undefined;
    if (t === 'img_reveal' && e.grid) regions = regions ?? [];
    if (regions == null) {
      if (MEDIA === null) return;
      E(`${eid}: no regions (neither in the exercise nor in media '${mid}')`);
      return;
    }
    const R = checkRegions(eid, regions, IW, IH);
    const targets = Array.isArray(e.targets) && e.targets.length ? (e.targets as unknown[]) : [...R.keys()];
    for (const x of targets) if (!(typeof x === 'string' && R.has(x))) E(`${eid}: target '${s(x)}' is not a region`);
    if (t === 'img_hotspot' || t === 'img_sequence') {
      const a = e.answer;
      if (!Array.isArray(a) || !a.length) {
        E(`${eid}: answer must be a list of region ids`);
        return;
      }
      for (const x of a as unknown[]) if (!(typeof x === 'string' && R.has(x))) E(`${eid}: answer '${s(x)}' is not a region`);
      if (t === 'img_sequence' && !(a.length >= 2 && a.length <= 9)) E(`${eid}: sequence needs 2-9 steps`);
      if (t === 'img_hotspot' && e.any && a.length < 2) W(`${eid}: any:true with one answer region is the same as a normal hotspot`);
      if (t === 'img_sequence' && new Set(a).size !== a.length) E(`${eid}: sequence repeats a region`);
      for (const k of Object.keys(obj(e.why))) if (!R.has(k)) E(`${eid}: why '${k}' is not a region`);
    }
    if (t === 'img_reveal') {
      const op = list(e.options),
        a = e.answer,
        aa = Array.isArray(a) ? (a as unknown[]) : [a];
      if (op.length < 2) E(`${eid}: reveal needs options`);
      if (!aa.every(x => idx(x, op.length))) E(`${eid}: bad answer index`);
      if (Array.isArray(a) && a.length > 1 && !e.multi) E(`${eid}: multiple answers need multi:true`);
      if (!e.grid && R.size < 2) E(`${eid}: reveal needs grid or >=2 tile regions`);
      for (const x of list(e.start)) if (!e.grid && !(typeof x === 'string' && R.has(x))) E(`${eid}: start '${s(x)}' is not a region`);
    }
    if (t === 'img_drag' || t === 'img_label' || t === 'img_select' || t === 'img_occlusion') {
      const labs = targets.filter((x): x is string => typeof x === 'string' && R.has(x)).map(x => R.get(x)?.label);
      if (!labs.every(isStr)) E(`${eid}: every target needs a label`);
      else if (new Set(labs.map(l => l.trim().toLowerCase())).size !== labs.length && t !== 'img_occlusion')
        W(`${eid}: duplicate target labels`);
      if (t === 'img_select') {
        const shared = new Set<unknown>([...labs, ...list(e.distractors)]);
        if (shared.size < 2) E(`${eid}: select needs >=2 choices`);
        for (const x of targets) {
          const r = typeof x === 'string' ? R.get(x) : undefined;
          if (r && 'options' in r && !list(r.options).includes(r.label)) E(`${eid}/${s(x)}: options must include the label`);
        }
      }
      if ('pass' in e && !(isNum(e.pass) && e.pass >= 0 && e.pass <= 1)) E(`${eid}: pass must be 0-1`);
    }
  };

  const checkThinking = (eid: string, e: Obj): void => {
    const t = e.type;
    if (t === 'flaw') {
      const L = list(e.lines),
        R = list(e.reasons);
      if (!list(e.flaws).every(x => idx(x, L.length))) E(`${eid}: flaw needs lines (>=3) and flaws (line indexes)`);
      if ('reason' in e && !idx(e.reason, R.length)) E(`${eid}: flaw needs reasons (>=2) and reason (index)`);
    } else if (t === 'case') {
      list(e.parts).forEach((p0, i) => {
        const p = obj(p0);
        if (p.type === 'mcq') {
          const a = p.answer;
          if (!(Array.isArray(a) ? (a as unknown[]) : [a]).every(x => idx(x, list(p.options).length)))
            E(`${eid} part ${i + 1}: needs options and answer index`);
        }
      });
    } else if (t === 'predict') {
      if (Array.isArray(e.options) && Number.isInteger(e.answer) && !idx(e.answer, e.options.length))
        E(`${eid}: predict needs options and answer index`);
    } else if (t === 'tree') {
      const N = obj(e.nodes);
      if (!Object.keys(N).length) return;
      const inN = (k: unknown): k is string => typeof k === 'string' && k in N;
      if (!inN(e.start)) E(`${eid}: tree start must name a node`);
      for (const [k, n] of Object.entries(N))
        for (const op of list(obj(n).options))
          if (isObj(op) && op.to != null && !inN(op.to)) E(`${eid} node ${k}: to ${pyRepr(op.to)} names no node`);
      const seen = new Set<string>();
      let at: unknown = e.start;
      while (inN(at) && !seen.has(at)) {
        seen.add(at);
        at = list(obj(N[at]).options)
          .map(obj)
          .find(x => x.ok)?.to;
      }
      if (at != null) E(`${eid}: the right path of the tree loops or leads nowhere`);
    } else if (t === 'inquiry') {
      const op = list(e.options),
        sc = list(e.scores);
      if (sc.length !== op.length) E(`${eid}: inquiry needs options (>=3) and scores 0-3, one per option`);
      else if (sc.length && sc.every(isNum)) {
        const mx = Math.max(...(sc as number[]));
        if (sc.filter(x => x === mx).length !== 1) E(`${eid}: exactly one option has the highest score`);
      }
      if (Array.isArray(e.why) && e.why.length !== op.length) E(`${eid}: inquiry needs why, one per option`);
    } else if (t === 'debate') {
      list(e.sides).forEach((sd0, i) => {
        const sd = obj(sd0),
          c = list(sd.counters);
        if ('best' in sd && !idx(sd.best, c.length)) E(`${eid} side ${i + 1}: position, counters (>=2) and best (index)`);
        else if (Array.isArray(sd.why) && sd.why.length !== c.length) E(`${eid} side ${i + 1}: why needs one text per counter`);
      });
    }
  };

  /** what an exercise's contract cannot say: its answer is one of its own options, lines, buckets, nodes or regions */
  const exerciseRefs = (eid: string, e: Obj): void => {
    const t = e.type;
    if (t === 'mcq' || t === 'odd') {
      const op = list(e.options),
        a = e.answer;
      if (!(Array.isArray(a) ? (a as unknown[]) : [a]).every(x => idx(x, op.length))) E(`${eid}: bad answer index`);
      if (Array.isArray(e.why) && e.why.length !== op.length) E(`${eid}: why length != options`);
      if (t === 'odd' && op.length !== 4) W(`${eid}: odd should have 4 options`);
    } else if (t === 'match') {
      const p = list(e.pairs).filter((x): x is unknown[] => Array.isArray(x) && x.length === 2);
      const right = new Set(p.map(x => x[1]).filter(x => typeof x === 'string')),
        left = new Set(p.map(x => x[0]).filter(x => typeof x === 'string'));
      if (right.size !== p.length || left.size !== p.length) E(`${eid}: match sides must be distinct`);
    } else if (t === 'bucket') {
      const b = list(e.buckets),
        it = list(e.items);
      if (!it.every(x => idx(obj(x).bucket, b.length))) E(`${eid}: bad bucket items`);
      if (it.length < 4) W(`${eid}: few bucket items`);
    } else if (t === 'cloze') {
      const txt = typeof e.text === 'string' ? e.text : '';
      if ([...txt.matchAll(/\[\[(.+?)\]\]/g)].some(m => !(m[1] ?? '').split('|')[0]?.trim())) E(`${eid}: empty blank`);
    } else if (t === 'spotbug') {
      const L = list(e.lines);
      if (L.length < 3) E(`${eid}: spotbug needs >=3 lines`);
      if (!list(e.bugs).every(x => idx(x, L.length))) E(`${eid}: bad bug indexes`);
    } else if (t === 'scenario') {
      if (!isStr(e.q)) W(`${eid}: scenario should have q (setup)`);
    } else if (t === 'write') {
      const sol = typeof e.solution === 'string' ? e.solution.toLowerCase() : '';
      for (const k of list(e.keywords))
        if (typeof k === 'string' && !sol.includes(k.toLowerCase())) E(`${eid}: keyword '${k}' not in solution`);
    } else if (typeof t === 'string' && VTYPES.has(t)) checkVisual(eid, e);
    else if (typeof t === 'string' && TTYPES.has(t)) checkThinking(eid, e);
  };

  // the chapter's contract (the authored chapter) and each exercise's (#exercise, #exerciseSource)
  const shapeIssues: string[] = check('noema.chapter.v1', isObj(chIn) && 'exercises' in ch ? { ...ch, exercises: [] } : chIn).issues.map(
    i => i.text,
  );
  list(ch.exercises).forEach((e, n) => {
    const eid = isObj(e) && typeof e.id === 'string' ? e.id : `exercises[${n}]`;
    for (const id of ['noema.chapter.v1#exercise', 'noema.chapter.v1#exerciseSource'])
      for (const i of check(id, e).issues) {
        const m = `${eid}: ${i.text}`;
        if (!shapeIssues.includes(m)) shapeIssues.push(m);
      }
  });
  shapeIssues.forEach(E);

  const cid = typeof ch.id === 'string' ? ch.id : '';
  const secs = objs(ch.sections);
  const sids = secs.map(x => x.id);
  if (new Set(sids).size !== sids.length) E('duplicate section ids');
  for (const sec of secs) {
    const sid = 'id' in sec ? pyStr(sec.id) : '?';
    if (typeof sec.id === 'string' && /^ch\d\d-s\d\d$/.test(sec.id) && !sec.id.startsWith(cid + '-'))
      E(`bad section id ${sec.id} (not of ${cid})`);
    const bl = objs(sec.blocks);
    if (bl.length < 3) W(`${sid}: only ${bl.length} blocks`);
    bl.forEach((b, i) => {
      const t = b.t;
      if (t === 'table') {
        const n = list(b.head).length;
        for (const r of list(b.rows))
          if (Array.isArray(r) && r.length !== n) E(`${sid} block ${i}: table row width ${r.length} != head ${n}`);
      }
      if (t === 'diagram' && typeof b.text === 'string')
        for (const ln of b.text.split('\n'))
          if (ln.length > 78) {
            W(`${sid} block ${i}: diagram line >78 chars`);
            break;
          }
      if (t === 'figure') {
        if (MEDIA !== null && !(typeof b.media === 'string' && b.media in MEDIA))
          E(`${sid} block ${i}: figure media '${pyStr(b.media)}' not in media/media.json`);
        else if ('regions' in b) {
          const m = obj(MEDIA && typeof b.media === 'string' ? MEDIA[b.media] : undefined);
          checkRegions(`${sid} block ${i}`, b.regions, m.w, m.h);
        }
      }
      if (t === 'interactive' && ACTIVITIES !== null && o.checkBlock)
        for (const m of o.checkBlock(b, ACTIVITIES)) E(`${sid} block ${i}: ${m}`);
    });
  }
  const exs = objs(ch.exercises);
  const idCount = new Map<unknown, number>();
  for (const e of exs) idCount.set(e.id, (idCount.get(e.id) ?? 0) + 1);
  for (const [k, v] of idCount) if (v > 1) E(`duplicate exercise id ${pyStr(k)}`);
  const tc = new Map<string, number>(),
    tagc = new Map<string, number>(),
    perSec = new Map<unknown, number>(),
    quick = new Map<unknown, number>();
  const inc = <K>(m: Map<K, number>, k: K): void => {
    m.set(k, (m.get(k) ?? 0) + 1);
  };
  for (const e of exs) {
    const eid = 'id' in e ? pyStr(e.id) : '?';
    if (typeof e.id === 'string' && /^ch\d\d-e\d{3}$/.test(e.id) && !e.id.startsWith(cid + '-'))
      E(`bad exercise id ${e.id} (not of ${cid})`);
    const t = e.type;
    if (!(typeof t === 'string' && TYPES.has(t))) continue;
    inc(tc, t);
    if (!sids.includes(e.section)) E(`${eid}: section ${pyStr(e.section)} not found`);
    else inc(perSec, e.section);
    if (e.quick) inc(quick, e.section);
    for (const x of list(e.tags)) inc(tagc, s(x));
    if (t === 'sim' && ACTIVITIES !== null && o.checkSim) for (const m of o.checkSim(e, ACTIVITIES)) E(`${eid}: ${m}`);
    exerciseRefs(eid, e);
  }
  for (const d of objs(ch.debug)) {
    const did = 'id' in d ? pyStr(d.id) : '?';
    if (d.section && !sids.includes(d.section)) E(`debug ${did}: bad section`);
    if (list(d.askYourself).length < 3) W(`debug ${did}: <3 askYourself`);
  }
  const cards = objs(ch.flashcards);
  const fids = new Map<unknown, number>();
  for (const f of cards) fids.set(f.id, (fids.get(f.id) ?? 0) + 1);
  const fre = new RegExp(`^${cid.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')}-f\\d{3}$`);
  for (const f of cards) {
    const fid = f.id;
    if (!fre.test(fid == null ? 'None' : s(fid))) E(`flashcard needs an id like ${cid}-f001 (got ${pyRepr(fid)}); progress is keyed by it`);
    else if ((fids.get(fid) ?? 0) > 1) E(`duplicate flashcard id ${s(fid)}`);
    if (f.section && !sids.includes(f.section)) E(`flashcard bad section ${pyStr(f.section)}`);
  }
  for (const sid of sids) {
    if ((perSec.get(sid) ?? 0) < 3) W(`${pyStr(sid)}: only ${perSec.get(sid) ?? 0} exercises`);
    if ((quick.get(sid) ?? 0) < 2) W(`${pyStr(sid)}: only ${quick.get(sid) ?? 0} quick exercises`);
  }
  if (!(o.quality || o.balance || o.balanceWarn))
    for (const t of TYPES) if (!VTYPES.has(t) && (tc.get(t) ?? 0) < 2) W(`type '${t}' used ${tc.get(t) ?? 0}x (<2)`);
  const nvis = [...VTYPES].reduce((a, t) => a + (tc.get(t) ?? 0), 0),
    vkinds = [...VTYPES].filter(t => tc.get(t)).length;
  const nfig = secs.reduce((a, sec) => a + objs(sec.blocks).filter(b => b.t === 'figure').length, 0);
  const minVisual = o.minVisual ?? 0;
  if (minVisual && (nvis || nfig)) {
    if (nvis < minVisual) E(`only ${nvis} visual exercises (subject requires >= ${minVisual} per chapter, docs/VISUAL.md)`);
    if (vkinds < 2) E(`visual exercises use ${vkinds} type(s); need >= 2 different visual types`);
    if (nfig < 1) E("no 'figure' block in the chapter (docs/VISUAL.md)");
  } else if (nfig && nvis < 3) W(`only ${nvis} visual exercises on the chapter's pictures (docs/VISUAL.md asks for >= 3)`);
  const features = o.features ?? [];
  if (o.quality) {
    const subject = { features: Object.fromEntries(features.map(f => [f, true])) };
    for (const i of checkQuality(ch, subject)) {
      const m = i.msg.startsWith(cid + ': ') ? i.msg.slice(cid.length + 2) : i.msg;
      (i.level === 'error' && o.quality === 'error' ? E : W)(m);
    }
  } else if (o.balance || o.balanceWarn) {
    const subject = { features: Object.fromEntries(features.map(f => [f, true])) };
    for (const i of checkBalance(ch, subject, { min: o.balance || o.balanceWarn })) {
      const m = i.msg.startsWith(s(ch.id) + ': ') ? i.msg.slice(s(ch.id).length + 2) : i.msg;
      (o.balance ? E : W)(m);
    }
  }
  if (o.source !== undefined) checkSame(ch, obj(o.source), E, W);
  const risky = exs.filter(e => list(e.tags).some(x => x === 'pitfall' || x === 'debug' || x === 'exam')).length;
  if (exs.length && risky / exs.length < 0.3) W(`only ${risky}/${exs.length} exercises tagged pitfall/debug/exam`);
  return {
    errors,
    warnings: warns,
    summary: {
      sections: secs.length,
      exercises: exs.length,
      visual: nvis,
      figures: nfig,
      playbooks: list(ch.debug).length,
      flashcards: list(ch.flashcards).length,
      pitfalls: list(ch.pitfalls).length,
      types: Object.fromEntries(tc),
      tags: Object.fromEntries(tagc),
    },
  };
}
/** a value in a message as Python's f-string writes it (None for a missing one) */
const pyStr = (v: unknown): string => (v == null ? 'None' : typeof v === 'string' ? v : pyRepr(v));

/** what a translation must keep of an exercise: everything that decides the answer (only the words may change) */
function trShape(e: Obj): Record<string, unknown> {
  const t = e.type,
    out: Record<string, unknown> = {};
  for (const k of ['type', 'section', 'media', 'answer', 'multi', 'tolerance', 'bugs', 'grid', 'targets', 'any', 'asCode', 'start'])
    if (k in e) out[k] = e[k];
  for (const k of ['options', 'items', 'pairs', 'buckets', 'lines', 'steps', 'keywords'])
    if (Array.isArray(e[k])) out['#' + k] = (e[k] as unknown[]).length;
  if (t === 'bucket') out.bucketOf = objs(e.items).map(x => x.bucket ?? null);
  if (t === 'cloze') out.blanks = [...(typeof e.text === 'string' ? e.text : '').matchAll(/\[\[(.+?)\]\]/g)].length;
  if (t === 'scenario') out.ok = list(e.steps).map(st => list(obj(st).options).map(op => Boolean(obj(op).ok)));
  if (t === 'flaw') Object.assign(out, { flaws: e.flaws ?? null, reason: e.reason ?? null, '#reasons': list(e.reasons).length });
  if (t === 'case') out.parts = objs(e.parts).map(p => [p.type ?? null, p.answer ?? null, list(p.options).length, p.tolerance ?? null]);
  if (t === 'predict') out['outcome?'] = 'outcome' in e;
  if (t === 'tree')
    out.nodes = Object.fromEntries(
      Object.entries(obj(e.nodes))
        .filter(([, n]) => isObj(n))
        .map(([k, n]) => [k, objs(obj(n).options).map(op => [Boolean(op.ok), op.to ?? null])]),
    );
  if (t === 'inquiry') out.scores = e.scores ?? null;
  if (t === 'sim')
    Object.assign(out, { activity: e.activity ?? null, task: e.task ?? null, grade: e.grade ?? null, '#hints': list(e.hints).length });
  if (t === 'debate') out.sides = objs(e.sides).map(x => [x.best ?? null, list(x.counters).length]);
  return out;
}
const eq = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** a translation has the source chapter's ids and structure (CONTENT_SPEC.md "Packs in several languages") */
function checkSame(tr: Obj, src: Obj, E: (m: string) => void, W: (m: string) => void): void {
  for (const k of ['id', 'num'])
    if (!eq(tr[k], src[k])) E(`translation: ${k} is ${pyRepr(tr[k])}, the source chapter has ${pyRepr(src[k])}`);
  const ss = objs(src.sections),
    ts = objs(tr.sections);
  const tid = ts.map(x => x.id ?? null),
    sid = ss.map(x => x.id ?? null);
  if (!eq(tid, sid)) E(`translation: sections ${pyRepr(tid)} != source ${pyRepr(sid)} (same ids, same order)`);
  else
    ss.forEach((a, n) => {
      const b = ts[n] ?? {};
      const ta = objs(a.blocks).map(x => x.t ?? null),
        tb = objs(b.blocks).map(x => x.t ?? null);
      if (!eq(ta, tb)) E(`translation ${s(a.id)}: blocks ${pyRepr(tb)} != source ${pyRepr(ta)} (same blocks, same order)`);
      else {
        const bb = objs(b.blocks);
        objs(a.blocks).forEach((x, i) => {
          const y = bb[i] ?? {};
          if (x.t === 'figure' && !eq(x.media, y.media))
            E(`translation ${s(a.id)} block ${i}: figure media '${pyStr(y.media)}' != source '${pyStr(x.media)}'`);
          if (x.t === 'code' && !eq('code' in x ? x.code : x.text, 'code' in y ? y.code : y.text))
            E(`translation ${s(a.id)} block ${i}: code must stay exactly as the source's (translate the words around it, not the code)`);
        });
      }
    });
  for (const [k, label] of [
    ['exercises', 'exercise'],
    ['debug', 'playbook'],
    ['flashcards', 'flashcard'],
  ] as const) {
    const A = new Map(objs(src[k]).map(x => [x.id, x])),
      B = new Map(objs(tr[k]).map(x => [x.id, x]));
    const miss = [...A.keys()].filter(i => !B.has(i)),
      extra = [...B.keys()].filter(i => !A.has(i));
    if (miss.length) E(`translation: ${label}(s) missing: ${miss.map(pyStr).join(', ')}`);
    if (extra.length) E(`translation: ${label}(s) not in the source: ${extra.map(pyStr).join(', ')}`);
    if (k === 'exercises')
      for (const [i, a] of A) {
        const b = B.get(i);
        if (!b) continue;
        const sa = trShape(a),
          sb = trShape(b);
        const d = [...new Set([...Object.keys(sa), ...Object.keys(sb)])].filter(x => !eq(sa[x], sb[x])).sort();
        if (d.length) E(`translation ${pyStr(i)}: differs from the source in ${d.join(', ')} (only the words may change)`);
      }
    if (k === 'flashcards')
      for (const [i, a] of A) {
        const b = B.get(i);
        if (b && !eq(a.section, b.section)) E(`translation ${pyStr(i)}: section differs from the source`);
      }
  }
  if (list(tr.pitfalls).length !== list(src.pitfalls).length)
    E(`translation: ${list(tr.pitfalls).length} pitfalls, the source has ${list(src.pitfalls).length}`);
  if (list(tr.objectives).length !== list(src.objectives).length)
    W(`translation: ${list(tr.objectives).length} objectives, the source has ${list(src.objectives).length}`);
}

/** a locale of the subject; shaped: the contract has checked the code already (subject.i18n) */
function checkLocale(where: string, loc: unknown, lang: unknown, shaped: boolean, E: (m: string) => void, W: (m: string) => void): boolean {
  if (typeof loc !== 'string' || !LOCALE_RE.test(loc)) {
    if (!shaped) E(`${where}: '${s(loc)}' is not a locale code (BCP 47, e.g. el, fr, pt-PT, zh-Hant)`);
    return false;
  }
  const lg = typeof lang === 'string' ? lang : 'en';
  if (loc === lg || (loc.split('-')[0] === lg.split('-')[0] && (!loc.includes('-') || !lg.includes('-')) && !loc.startsWith('zh'))) {
    E(`${where}: '${loc}' is the pack's own language (${lg}) — the source texts are already in it`);
    return false;
  }
  if (!UI_LOCALES.has(loc)) W(`${where}: '${loc}' is not a UI language of noema-lite (nor the language of one) — no learner would see it`);
  return true;
}

export interface SubjectReport extends Report {
  readonly language: string;
  readonly metadata: string[];
}
/** subject.json: its contract, the content language and the optional per-locale metadata (subject.i18n); translated: the
    locales the subject has translations/<locale>/ folders for */
export function checkSubject(subjIn: unknown, translated: readonly string[] = []): SubjectReport {
  const errors: string[] = [],
    warns: string[] = [];
  const E = (m: string): void => {
    errors.push(m);
  };
  const W = (m: string): void => {
    warns.push(m);
  };
  for (const i of check('noema.subject.v1', subjIn).issues) E(i.text);
  const subj = obj(subjIn);
  const lang = 'language' in subj ? subj.language : 'en';
  const tr = isObj(subj.i18n) ? subj.i18n : null;
  for (const [loc, m] of Object.entries(tr ?? {})) {
    const where = `i18n.${loc}`;
    if (!checkLocale(where, loc, lang, true, E, W) || !isObj(m)) continue;
    for (const [k, v] of Object.entries(m)) {
      if (I18N_TEXT.includes(k) && isStr(v) && !isStr(subj[k])) E(`${where}.${k}: the subject has no '${k}' to translate`);
      else if (I18N_OBJ.includes(k) && isObj(v)) {
        const src = obj(subj[k]);
        for (const [kk, vv] of Object.entries(v)) {
          if (!(kk in src)) E(`${where}.${k}.${kk}: the subject's '${k}' has no '${kk}'`);
          else if (isStr(src[kk]) && !isStr(vv)) E(`${where}.${k}.${kk}: must be a non-empty string`);
        }
      }
    }
    if (!('title' in m)) W(`${where}: no title — the picker shows the source title`);
  }
  for (const loc of translated)
    if (checkLocale(`translations/${loc}`, loc, lang, false, E, W) && !(tr && loc in tr))
      W(`translations/${loc}: add subject.i18n.${loc} (title, description) so the picker shows the translated name`);
  return { errors, warnings: warns, language: s(lang), metadata: Object.keys(tr ?? {}).sort() };
}
