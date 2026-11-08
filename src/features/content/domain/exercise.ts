/* noema-lite — one exercise: its contract (noema.chapter.v1#exercise), then what a contract cannot say (exerciseRefs): its
   answer is one of its own options, lines, buckets, nodes or regions, its lists line up, its picture is in the pack. */
import { check } from '../../../contracts/index.ts';
import { intIn, isNum, isObj, isStr, list, obj, objs, s, strs, type Obj } from './util.ts';

/** the contract's issues as messages: "<where>: <field>: <what>" (where = '' → "<field>: <what>") */
export const shapeOf = (id: string, x: unknown, where?: unknown): string[] =>
  check(id, x).issues.map(i => (where ? `${s(where)}: ` : '') + i.text);

const lt = (a: unknown, n: number): boolean => isNum(a) && a < n;

/** What an exercise's contract cannot say. Only for an exercise that meets its contract. */
export function exerciseRefs(e: Obj, media: Obj): string[] {
  const E: string[] = [];
  const t = e.type;
  const bad = (m: string): void => {
    E.push(`${s(e.id)}: ${m}`);
  };
  const perOption = (why: unknown, n: number, what: string): void => {
    if (Array.isArray(why) && why.length !== n) bad(`"why" needs one text per ${what}`);
  };
  const opts = list(e.options);
  switch (t) {
    case 'mcq':
    case 'odd': {
      if (![e.answer].flat().every(a => lt(a, opts.length))) bad('"answer" must be the index of an option');
      perOption(e.why, opts.length, 'option');
      break;
    }
    case 'match': {
      const pairs = list(e.pairs);
      if (new Set(pairs.map(p => list(p)[1])).size !== pairs.length) bad('the right sides of "pairs" must be distinct');
      break;
    }
    case 'bucket':
      if (!objs(e.items).every(i => lt(i.bucket, list(e.buckets).length))) bad('every item\'s "bucket" must be the index of a bucket');
      break;
    case 'spotbug':
      if (!list(e.bugs).every(b => lt(b, list(e.lines).length))) bad('"bugs" must be line indexes');
      break;
    case 'flaw':
      if (!list(e.flaws).every(b => lt(b, list(e.lines).length))) bad('"flaws" must be line indexes');
      if (isNum(e.reason) && e.reason >= list(e.reasons).length) bad('"reason" must be the index of one of "reasons"');
      break;
    case 'case':
      objs(e.parts).forEach((p, i) => E.push(...exerciseRefs({ ...p, id: `${s(e.id)} part ${i + 1}` }, media)));
      break;
    case 'predict':
      if (Array.isArray(e.options) && isNum(e.answer) && e.answer >= opts.length) bad('"answer" must be the index of an option');
      break;
    case 'tree': {
      const N = obj(e.nodes);
      const inN = (k: unknown): k is string => typeof k === 'string' && k in N;
      if (!inN(e.start)) bad('"start" must name a node');
      for (const [id, n] of Object.entries(N))
        for (const o of objs(obj(n).options)) if (o.to != null && !inN(o.to)) bad(`node "${id}": "to" names no node (${s(o.to)})`);
      const seen = new Set<string>();
      let at: unknown = e.start;
      while (inN(at) && !seen.has(at)) {
        seen.add(at);
        at = objs(obj(N[at]).options).find(o => o.ok)?.to;
      }
      if (at != null) bad('the right path of the tree loops or leads nowhere');
      break;
    }
    case 'inquiry': {
      const sc = list(e.scores);
      if (sc.length !== opts.length) bad('"scores": one per option');
      else if (sc.filter(v => v === Math.max(...sc.filter(isNum))).length !== 1) bad('exactly one option has the highest score');
      perOption(e.why, opts.length, 'option');
      break;
    }
    case 'debate':
      objs(e.sides).forEach((sd, i) => {
        const n = list(sd.counters).length;
        if (isNum(sd.best) && sd.best >= n) bad(`side ${i + 1}: "best" must be the index of a counter`);
        if (Array.isArray(sd.why) && sd.why.length !== n) bad(`side ${i + 1}: "why" needs one text per counter`);
      });
      break;
    default:
      if (s(t).startsWith('img_')) {
        const m = typeof e.media === 'string' ? media[e.media] : undefined;
        if (!isObj(m)) {
          bad(`media "${s(e.media)}" not in pack.media`);
          break;
        }
        const regs = objs(Array.isArray(e.regions) ? e.regions : m.regions);
        const R = new Map(regs.map(r => [r.id, r]));
        if (!R.size && t !== 'img_reveal') bad('the picture has no regions');
        const targets = Array.isArray(e.targets) ? (e.targets as unknown[]) : [...R.keys()];
        if ((t === 'img_hotspot' || t === 'img_sequence') && !(Array.isArray(e.answer) && e.answer.length))
          bad('"answer" must list region ids');
        if (['img_drag', 'img_label', 'img_select', 'img_occlusion'].includes(s(t)))
          for (const id of targets) {
            const r = R.get(id);
            if (r && !isStr(r.label)) bad(`region "${s(id)}" needs a label`);
          }
        if (t === 'img_reveal') {
          if (!strs(e.options, 2)) bad('"options" needed');
          else if (![e.answer].flat().every(a => intIn(a, opts.length))) bad('"answer" must be an option index');
        }
        const W = Number(m.w),
          H = Number(m.h);
        for (const r of regs) {
          const n = (k: string): number => Number(r[k]);
          const inside =
            r.shape === 'circle'
              ? n('cx') >= 0 && n('cy') >= 0 && n('cx') <= W && n('cy') <= H
              : r.shape === 'poly'
                ? Array.isArray(r.points) && r.points.length >= 3
                : n('x') >= 0 && n('y') >= 0 && n('x') + n('w') <= W + 1 && n('y') + n('h') <= H + 1;
          if (!inside) {
            bad(`region "${s(r.id)}" lies outside the picture`);
            break;
          }
        }
      }
  }
  return E;
}

/** The fields one exercise needs so the engine can show and grade it: its contract, then what the contract cannot say. */
export function checkExercise(e: unknown, media: unknown): string[] {
  const E = shapeOf('noema.chapter.v1#exercise', e, isObj(e) ? e.id : undefined);
  return E.length || !isObj(e) ? E : exerciseRefs(e, obj(media));
}
