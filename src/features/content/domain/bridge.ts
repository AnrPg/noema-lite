/* noema-lite — a language bridge (docs/BRIDGE.md): a sidecar dictionary for one pack and one native language. Its shape is its
   contract (noema.bridge.v1); here its size, its words (no function words, each once), what its sections and anchors name and,
   with the pack, that it belongs to it and reads one of its languages. */
import { shapeOf } from './exercise.ts';
import type { Counted } from './translation.ts';
import { isObj, isStr, lang0, list, obj, objs, s } from './util.ts';

const POS: ReadonlySet<unknown> = new Set(['NOUN', 'PROPN', 'VERB', 'ADJ', 'ADV', 'NUM', 'X', 'SYM', 'INTJ', 'PHRASE']);
const FUNCTION_POS: ReadonlySet<unknown> = new Set(['DET', 'ADP', 'CCONJ', 'SCONJ', 'PRON', 'AUX', 'PART']);
export const BRIDGE_MAX = 3 * 1024 * 1024;

/** checkBridge(b, pack?) → its errors, warnings and counts */
export function checkBridge(b: unknown, pack?: unknown): Counted {
  const W: string[] = [];
  if (!isObj(b)) return { errors: ['not a JSON object'], warnings: W, counts: {} };
  const E = shapeOf('noema.bridge.v1', b);
  let size = 0;
  try {
    size = JSON.stringify(b).length;
  } catch {
    E.push('not serialisable');
  }
  if (size > BRIDGE_MAX) E.push(`too big (${Math.round(size / 1024)} KB, at most ${BRIDGE_MAX / 1024} KB)`);
  if (b.source && b.native && s(b.source).split('-')[0] === s(b.native).split('-')[0]) E.push('native must differ from source');
  const entries = objs(b.entries);
  const keys = new Map<string, Set<string>>();
  let senses = 0,
    stale = 0;
  entries.forEach((e, n) => {
    if (!isStr(e.k)) return;
    const at = `entries[${n}] "${e.k}"`;
    if (keys.has(e.k)) E.push(`${at}: k appears twice`);
    if (e.pos != null && FUNCTION_POS.has(e.pos))
      E.push(
        `${at}: ${s(e.pos)} — function words (articles, prepositions, conjunctions, pronouns, auxiliaries, particles) are not part of a bridge`,
      );
    else if (e.pos != null && !POS.has(e.pos))
      W.push(`${at}: unknown pos "${s(e.pos)}" (Universal Dependencies: NOUN, PROPN, VERB, ADJ, ADV, NUM, X, SYM, INTJ, or PHRASE)`);
    const ids = new Set<string>();
    objs(e.senses).forEach((x, q) => {
      if (ids.has(s(x.id))) E.push(`${at} sense ${q + 1}: id "${s(x.id)}" twice`);
      else ids.add(s(x.id));
      if (x.st === 'stale') stale++;
      senses++;
    });
    keys.set(e.k, ids);
  });
  const pk = isObj(pack) ? pack : null;
  const secIds = pk ? new Set(objs(pk.chapters).flatMap(c => objs(c.sections).map(x => x.id))) : null;
  const secs = obj(b.sections);
  let previews = 0;
  for (const [sid, v] of Object.entries(secs)) {
    if (secIds && !secIds.has(sid)) W.push(`sections.${sid}: no such section in the pack`);
    if (!isObj(v)) continue;
    for (const k of list(v.terms)) if (!(typeof k === 'string' && keys.has(k))) E.push(`sections.${sid}.terms: "${s(k)}" is not an entry`);
    if (isStr(v.preview)) previews++;
  }
  const anchors = objs(b.anchors);
  anchors.forEach((a, n) => {
    const at = `anchors[${n}]`;
    if (secIds && typeof a.at === 'string' && a.at.includes('/') && !secIds.has(a.at.split('/')[0]))
      W.push(`${at}: section ${a.at.split('/')[0] ?? ''} is not in the pack`);
    const senseIds = typeof a.k === 'string' ? keys.get(a.k) : undefined;
    if (!senseIds) E.push(`${at}: k "${s(a.k)}" is not an entry`);
    else if (!senseIds.has(s(a.sense))) E.push(`${at}: entry "${s(a.k)}" has no sense "${s(a.sense)}"`);
  });
  if (pk) {
    const ps = obj(pk.subject);
    if (ps.id && b.pack && ps.id !== b.pack)
      E.push(`pack: "${s(b.pack)}" — this bridge belongs to another subject (this one is "${s(ps.id)}")`);
    const own = ps.language || 'en',
      offered = [own, ...Object.keys(obj(pk.translations))].map(lang0);
    if (b.source && !offered.includes(lang0(b.source)))
      E.push(
        `source: "${s(b.source)}" — the pack is written in "${s(own)}"${offered.length > 1 ? ` and translated into ${offered.slice(1).join(', ')}` : ''}; a bridge from a translation needs that translation saved first`,
      );
  }
  if (!entries.length) W.push('no entries yet');
  return {
    errors: E,
    warnings: W,
    counts: { entries: entries.length, senses, stale, sections: Object.keys(secs).length, previews, anchors: anchors.length },
  };
}
