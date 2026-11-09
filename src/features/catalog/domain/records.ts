/**
 * The catalogue's records (docs/SEARCH.md): every piece of the app as one searchable record — what it is (`ty`), on
 * which side of the app it lives (`w`: know | lang), where it sits (`pa`), the texts it can be found by (`f`, in order:
 * the first that matches names the result) and the address that opens exactly it (`h`).
 *
 *   · ids that survive a rebuilt pack: a theory block's id comes from its content (blockIds), a trap's from its title
 *   · builders for a subject's pack, a Roadmap, a language course and the conversations
 *
 * Pure: the records of one source are built in the Worker (the Compute job `catalog.records`, read models of the
 * search index, src/features/catalog/application/index-store.ts); the query side (folding, matching, scoring,
 * snippets) reads them as they are.
 */
import { textOf } from '../../../kernel/text.ts';
import { toneNumbers } from '../../search/domain/fold.ts';

/** Bump when records change shape: every source is rebuilt once. */
export const SCHEMA = 4;

export type Field = readonly [string, string];
export interface CatalogRecord {
  /** type: subject, chapter, section, theory, exercise, card, trap, drill, source, roadmap, station, word, … convo */
  readonly ty: string;
  /** the side of the app: know | lang */
  readonly w: string;
  /** key, unique across the index */
  readonly k: string;
  /** title */
  readonly ti: string;
  readonly f: readonly Field[];
  /** the address that opens it */
  readonly h: string;
  /** where it sits (path of titles) */
  readonly pa: readonly string[];
  readonly sj?: string | null;
  readonly cu?: string;
  readonly co?: string | null;
  readonly lg?: readonly string[] | undefined;
  /** exact forms (a word's forms, a term): an exact match puts it on top */
  readonly ex?: readonly string[] | undefined;
  readonly x?: Readonly<Record<string, unknown>>;
}

type Obj = Readonly<Record<string, unknown>>;
const obj = (x: unknown): Obj => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Obj) : {});
const list = (x: unknown): readonly unknown[] => (Array.isArray(x) ? x : []);
const objs = (x: unknown): Obj[] => list(x).map(obj);
const text = (x: unknown): string => (x == null ? '' : textOf(x));

/** Pinyin with tone marks → with tone numbers: the search's own rule (src/features/search/domain/fold.ts). */
export { toneNumbers };

/** Plain text from the packs' markdown-lite (bold, code, links, tags, math dollars). */
export function plain(s: unknown): string {
  return text(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|__|`+/g, '')
    .replace(/(^|[\s(])[*_](\S)/g, '$1$2')
    .replace(/(\S)[*_](?=[\s.,;:!?)]|$)/g, '$1')
    .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2')
    .replace(/\$+/g, '')
    .replace(/\\(tfrac|dfrac|frac|cdot|times|mathrm|text|left|right)\b/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A short, stable content hash (FNV-1a and a 31-multiplier hash over UTF-16 code units, base 36, 10 characters):
    block ids, trap ids, a bridge's version stamp (tools/bridge.py computes the same). */
export function hash36(s: unknown): string {
  let h1 = 0x811c9dc5,
    h2 = 0;
  const t = String(s);
  for (let i = 0; i < t.length; i++) {
    const c = t.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = (h2 * 31 + c) >>> 0;
  }
  return (h1.toString(36) + h2.toString(36)).slice(0, 10);
}

/** JSON of a block without the keys the engine adds at run time (_keys). */
const noPrivate = (k: string, v: unknown): unknown => (k && k.startsWith('_') ? undefined : v);

/** What a theory block says, as text (the search reads it; the record's snippet is cut from it). */
export function blockText(block: unknown, media: Readonly<Record<string, unknown>> = {}): string {
  const b = obj(block);
  const join = (xs: readonly string[], sep: string): string => xs.filter(Boolean).join(sep);
  switch (b.t) {
    case 'p':
      return plain(b.text);
    case 'list':
      return list(b.items).map(plain).join(' · ');
    case 'code':
      return join([b.caption ? plain(b.caption) : '', text(b.code)], ' — ');
    case 'diagram':
      return join([plain(b.caption), text(b.text)], ' — ');
    case 'table':
      return join([plain(b.caption), list(b.head).map(plain).join(' | '), ...list(b.rows).map(r => list(r).map(plain).join(' | '))], ' · ');
    case 'callout':
      return join([plain(b.title), plain(b.text)], ': ');
    case 'compare':
      return objs(b.items)
        .map(i => plain(i.title) + ': ' + list(i.points).map(plain).join('; '))
        .join(' · ');
    case 'flow':
      return join([list(b.items).map(plain).join(' → '), plain(b.caption)], ' — ');
    case 'reveal':
      return join([plain(b.label), plain(b.text)], ' — ');
    case 'ask':
      return join([plain(b.title), ...list(b.questions).map(plain)], ' · ');
    case 'terms':
      return objs(b.items)
        .map(t => plain(t.term) + ': ' + plain(t.def))
        .join(' · ');
    case 'figure': {
      const m = obj(media[text(b.media)]);
      const parts = list(m.labels || m.parts).map(x => plain(typeof x === 'string' ? x : obj(x).label || obj(x).name || ''));
      return join([plain(b.caption), plain(m.alt), ...parts], ' · ');
    }
    default:
      return '';
  }
}

/** Stable ids for the blocks of one section: from what each block holds (the same text keeps its id when the pack is
    rebuilt or patched), a second identical block gets "-2". The page gives the same ids (#/s/<section>/<block>). */
export function blockIds(blocks: unknown): string[] {
  const seen: Record<string, number> = {};
  return list(blocks).map(b => {
    let id = 'b' + hash36(text(obj(b).t) + '|' + JSON.stringify(b, noPrivate).slice(0, 6000));
    const k = seen[id];
    if (k) {
      seen[id] = k + 1;
      id += '-' + String(k + 1);
    } else seen[id] = 1;
    return id;
  });
}

/** A trap's (pitfall's) id: from its title and text. */
export const trapId = (p: unknown): string => 'p' + hash36(plain(obj(p).title) + '|' + plain(obj(p).text).slice(0, 200));

/** A flashcard's key, as the decks key them: its id, else its position in the chapter. */
export const cardKey = (chapterId: string, card: unknown, i: number): string =>
  text(obj(card).id) || text(obj(card)._key) || chapterId + '#' + String(i);

/** A theory block's kind as the results name it (one group "Theory", its kind on each result). */
export const BLOCK_KIND: Readonly<Record<string, string>> = {
  p: 'paragraph',
  list: 'list',
  code: 'code',
  diagram: 'diagram',
  table: 'table',
  callout: 'note',
  compare: 'comparison',
  flow: 'process',
  reveal: 'question',
  ask: 'questions',
  terms: 'terms',
  figure: 'figure',
};

/** A record with its empty fields left out and every field cut at 20 000 characters. */
function rec(o: Omit<CatalogRecord, 'f'> & { readonly f: readonly (readonly [string, unknown])[] }): CatalogRecord {
  const f = o.f.filter(([, t]) => Boolean(t) && text(t).trim() !== '').map(([n, t]): Field => [n, text(t).slice(0, 20000)]);
  return Object.fromEntries(Object.entries({ ...o, f }).filter(([, v]) => v !== undefined)) as unknown as CatalogRecord;
}
const named = (o: Obj): string => plain(typeof o === 'string' ? o : o.text || o.label || '');
const choices = (x: unknown): string =>
  Array.isArray(x)
    ? x
        .map(o => (typeof o === 'string' ? plain(o) : named(obj(o))))
        .filter(Boolean)
        .join(' · ')
    : '';

/** A subject's pack → its subject, chapters, sections, theory blocks, exercises, cards, traps, drills and sources. */
export function fromPack(pack: unknown, meta: Obj = {}): CatalogRecord[] {
  const out: CatalogRecord[] = [],
    p = obj(pack),
    sid = text(meta.id) || text(obj(p.subject).id),
    subj = { ...obj(p.subject), ...meta },
    title = text(subj.title) || sid;
  if (!sid || !pack) return out;
  const media = obj(p.media),
    base = { w: 'know', sj: sid },
    sp = [title];
  out.push(
    rec({
      ...base,
      ty: 'subject',
      k: `s:${sid}`,
      ti: title,
      f: [
        ['title', title],
        ['description', plain(subj.description)],
      ],
      h: '#/subject',
      pa: [],
    }),
  );
  for (const c of objs(p.chapters)) {
    const cid = text(c.id),
      ctitle = text(c.title),
      cp = [title, `${c.num ? text(c.num) + '. ' : ''}${ctitle}`];
    out.push(
      rec({
        ...base,
        ty: 'chapter',
        k: `s:${sid}:ch:${cid}`,
        ti: ctitle,
        f: [
          ['title', ctitle],
          ['subtitle', plain(c.subtitle)],
          ['objectives', list(c.objectives).map(plain).join(' · ')],
          ['mantra', plain(c.mantra)],
        ],
        h: '#/ch/' + cid,
        pa: sp,
        x: { ch: cid, n: c.num },
      }),
    );
    const sections = objs(c.sections);
    for (const s of sections) {
      const secId = text(s.id),
        stitle = text(s.title);
      out.push(
        rec({
          ...base,
          ty: 'section',
          k: `s:${sid}:s:${secId}`,
          ti: stitle,
          f: [
            ['title', stitle],
            ['hook', plain(s.hook)],
          ],
          h: '#/s/' + secId,
          pa: cp,
          x: { ch: cid, sec: secId },
        }),
      );
      const ids = blockIds(s.blocks),
        secPath = [...cp, stitle];
      list(s.blocks).forEach((raw, i) => {
        const b = obj(raw),
          body = blockText(b, media);
        if (!body) return;
        const kind = BLOCK_KIND[text(b.t)] || 'paragraph',
          bid = ids[i] || '';
        const head = b.t === 'callout' || b.t === 'reveal' || b.t === 'ask' ? plain(b.title || b.label) : b.caption ? plain(b.caption) : '';
        out.push(
          rec({
            ...base,
            ty: 'theory',
            k: `s:${sid}:b:${secId}:${bid}`,
            ti: head || stitle,
            f: [[kind, body]],
            h: `#/s/${secId}/${bid}`,
            pa: secPath,
            x: { ch: cid, sec: secId, bt: kind, bid },
            ex: b.t === 'terms' ? objs(b.items).map(t => plain(t.term)) : undefined,
          }),
        );
      });
    }
    const exercises = objs(c.exercises),
      exN = new Map(exercises.map((e, i) => [text(e.id), i + 1]));
    for (const e of exercises) {
      const eid = text(e.id),
        sec = sections.find(s => s.id === e.section);
      out.push(
        rec({
          ...base,
          ty: 'exercise',
          k: `s:${sid}:ex:${eid}`,
          ti: plain(e.q || e.prompt || eid).slice(0, 140),
          f: [
            ['question', plain(e.q || e.prompt)],
            ['options', choices(e.options) || choices(e.items)],
          ],
          h: '#/ex/' + encodeURIComponent(eid),
          pa: sec ? [...cp, text(sec.title)] : cp,
          x: { ch: cid, sec: e.section || null, exid: eid, n: exN.get(eid), et: e.type, tags: list(e.tags) },
        }),
      );
    }
    list(c.flashcards).forEach((raw, i) => {
      const f = obj(raw),
        key = cardKey(cid, f, i);
      out.push(
        rec({
          ...base,
          ty: 'card',
          k: `s:${sid}:fc:${key}`,
          ti: plain(f.q).slice(0, 140),
          f: [
            ['front', plain(f.q)],
            ['back', plain(f.a)],
          ],
          h: '#/cards/' + encodeURIComponent(key),
          pa: cp,
          x: { ch: cid, sec: f.section || null, card: key },
        }),
      );
    });
    for (const t of objs(c.pitfalls)) {
      const pid = trapId(t);
      out.push(
        rec({
          ...base,
          ty: 'trap',
          k: `s:${sid}:tr:${cid}:${pid}`,
          ti: plain(t.title),
          f: [
            ['title', plain(t.title)],
            ['text', plain(t.text)],
            ['fix', plain(t.fix)],
          ],
          h: `#/ch/${cid}/traps/${pid}`,
          pa: cp,
          x: { ch: cid, trap: pid },
        }),
      );
    }
    for (const d of objs(c.debug)) {
      const did = text(d.id);
      const steps = [...list(d.askYourself), ...list(d.steps)]
        .map(x => plain(typeof x === 'string' ? x : obj(x).text || obj(x).do || ''))
        .join(' · ');
      out.push(
        rec({
          ...base,
          ty: 'drill',
          k: `s:${sid}:dr:${did}`,
          ti: plain(d.title),
          f: [
            ['title', plain(d.title)],
            ['symptom', plain(d.symptom)],
            ['steps', steps],
          ],
          h: '#/drill/' + encodeURIComponent(did),
          pa: cp,
          x: { ch: cid, drill: did },
        }),
      );
    }
  }
  for (const s of objs(obj(p.sources).sources)) {
    out.push(
      rec({
        ...base,
        ty: 'source',
        k: `s:${sid}:src:${text(s.id)}`,
        ti: plain(s.title || s.name || s.file || s.id),
        f: [
          ['title', plain(s.title || s.name || '')],
          ['file', plain(s.file || s.path || '')],
          ['description', plain(s.description || s.note || '')],
        ],
        h: '#/subject/sources',
        pa: sp,
        x: { src: s.id },
      }),
    );
  }
  return out;
}

/** A Roadmap → the Roadmap and its stations (title, what it teaches, learning goals, planned chapters). */
export function fromCurriculum(curriculum: unknown): CatalogRecord[] {
  const out: CatalogRecord[] = [],
    c = obj(curriculum),
    id = text(c.id);
  if (!id) return out;
  const title = text(c.title) || text(c.goal) || id,
    base = { w: 'know', cu: id };
  out.push(
    rec({
      ...base,
      ty: 'roadmap',
      k: `c:${id}`,
      ti: title,
      f: [
        ['title', title],
        ['goal', c.goal !== title ? plain(c.goal) : ''],
        ['description', plain(c.description || c.scope)],
      ],
      h: '#/map/' + encodeURIComponent(id),
      pa: [],
    }),
  );
  for (const [nid, raw] of Object.entries(obj(c.nodes))) {
    const n = obj(raw);
    const chapters = objs(n.chapters)
      .map(ch => [ch.title, ...list(ch.goals), ...list(ch.coverage)].map(plain).filter(Boolean).join(': '))
      .join(' · ');
    const pack = obj(n.pack);
    out.push(
      rec({
        ...base,
        ty: 'station',
        k: `c:${id}:n:${nid}`,
        ti: plain(n.title),
        f: [
          ['title', plain(n.title)],
          ['summary', plain(n.summary)],
          ['goals', list(n.learningGoals).map(plain).join(' · ')],
          ['chapters', chapters],
        ],
        h: '#/map/' + encodeURIComponent(id) + '/' + encodeURIComponent(nid),
        pa: [title],
        x: { node: nid, pack: pack.status === 'ready' ? pack.id : null },
      }),
    );
  }
  return out;
}

/** A language course (its data, as the course pack holds it) → words, meanings, grammar, lessons, fields, sentences, phenomena. */
export function fromLangCourse(course: unknown, meta: Obj = {}): CatalogRecord[] {
  const out: CatalogRecord[] = [],
    data = obj(course),
    info = obj(data.course);
  if (!data.course) return out;
  const co = text(meta.courseId) || text(info.id),
    ct = text(meta.title) || text(info.title) || co,
    base = { w: 'lang', co },
    H = (p: string): string => `#/lang/${encodeURIComponent(co)}/${p}`;
  const concepts = new Map<string, Obj>(),
    fieldOf = new Map<string, Obj>();
  for (const f of objs(data.fields))
    for (const c of objs(f.concepts)) {
      concepts.set(text(c.id), c);
      fieldOf.set(text(c.id), f);
    }
  const langs = obj(data.langs);
  const nameOf = (code: string): string => text(obj(obj(langs[code]).language).name) || code;
  const gloss = (id: string): string => plain(concepts.get(id)?.gloss || id);
  const wordsOf = new Map<string, string[]>(); // concept → ["lemma (lang)"]
  for (const [code, rawL] of Object.entries(langs)) {
    const L = obj(rawL),
      nm = nameOf(code);
    for (const [nid, node] of Object.entries(obj(L.lexicon)))
      for (const x of objs(obj(node).lexemes)) {
        if (!x.id) continue;
        const lemma = text(x.lemma),
          senses = list(x.senses).map(text);
        const forms = [...new Set(Object.values(obj(x.forms)).flat().map(String))].filter(f => f && f !== lemma);
        const spoken = [
          text(x.translit),
          text(x.pinyin),
          x.pinyin ? toneNumbers(x.pinyin) : '',
          x.trad && x.trad !== lemma ? text(x.trad) : '',
        ].filter(Boolean);
        for (const s of senses) wordsOf.set(s, [...(wordsOf.get(s) || []), `${lemma} (${code})`]);
        out.push(
          rec({
            ...base,
            ty: 'word',
            k: `l:${co}:w:${text(x.id)}`,
            ti: lemma + (x.translit || x.pinyin ? ` · ${text(x.translit) || text(x.pinyin)}` : ''),
            lg: [code],
            f: [
              ['word', lemma],
              ['forms', forms.join(' · ')],
              ['reading', spoken.join(' · ')],
              ['meanings', senses.map(gloss).join(' · ')],
            ],
            ex: [lemma, ...forms, ...spoken],
            h: H(`w/${code}/${encodeURIComponent(text(x.id))}`),
            pa: [ct, nm],
            x: { lex: x.id, pos: x.pos, senses, node: nid },
          }),
        );
      }
    objs(L.bank).forEach((s, i) => {
      if (!s.text) return;
      const fn = list(s.functions)[0],
        first = objs(s.tokens).find(t => t.l && !t.p);
      out.push(
        rec({
          ...base,
          ty: 'sentence',
          k: `l:${co}:s:${text(s.id) || code + String(i)}`,
          ti: text(s.text),
          lg: [code],
          f: [
            ['sentence', s.text],
            ['translation', plain(s.gloss)],
            ['reading', text(s.translit) || text(s.pinyin)],
          ],
          h: fn ? H(`fn/${encodeURIComponent(text(fn))}/${code}`) : first ? H(`w/${code}/${encodeURIComponent(text(first.l))}`) : H(''),
          pa: [ct, nm],
          x: { level: s.level || null },
        }),
      );
    });
    for (const p of objs(obj(obj(data.world).phenomena)[code])) {
      out.push(
        rec({
          ...base,
          ty: 'phenomenon',
          k: `l:${co}:p:${text(p.id)}`,
          ti: plain(p.title),
          lg: [code],
          f: [
            ['title', plain(p.title)],
            ['text', plain(p.what)],
            [
              'examples',
              objs(p.examples)
                .map(e => [e.text, e.translit, e.note].filter(Boolean).map(text).join(' '))
                .join(' · '),
            ],
          ],
          h: H(`peculiar/${code}`),
          pa: [ct, nm],
          x: { area: p.area || null },
        }),
      );
    }
  }
  for (const id of concepts.keys()) {
    const f = fieldOf.get(id),
      words = wordsOf.get(id) || [];
    out.push(
      rec({
        ...base,
        ty: 'meaning',
        k: `l:${co}:c:${id}`,
        ti: gloss(id),
        lg: [...new Set(words.map(w => w.slice(w.lastIndexOf('(') + 1, -1)))],
        f: [
          ['meaning', gloss(id)],
          ['words', words.join(' · ')],
        ],
        ex: [gloss(id)],
        h: H(`c/${encodeURIComponent(id)}`),
        pa: [ct, f ? plain(f.title) : ''].filter(Boolean),
        x: { concept: id, field: f?.field || null },
      }),
    );
  }
  for (const fn of objs(data.functions)) {
    const fid = text(fn.id);
    const per = Object.entries(langs)
      .map(([code, L]) => [code, obj(obj(obj(L).grammar)[fid])] as const)
      .filter(([, g]) => g.summary);
    out.push(
      rec({
        ...base,
        ty: 'grammar',
        k: `l:${co}:g:${fid}`,
        ti: plain(fn.title),
        lg: per.map(([code]) => code),
        f: [['title', plain(fn.title)], ...per.map(([code, g]) => ['summary:' + code, plain(g.summary)] as const)],
        h: H(`fn/${encodeURIComponent(fid)}`),
        pa: [ct],
        x: { fn: fid, level: fn.level || null },
      }),
    );
  }
  for (const n of objs(data.nodes)) {
    const lesson = n.kind === 'lesson',
      nid = text(n.id);
    out.push(
      rec({
        ...base,
        ty: 'lesson',
        k: `l:${co}:n:${nid}`,
        ti: plain(n.title),
        f: [
          ['title', plain(n.title)],
          ['meanings', list(n.concepts).slice(0, 80).map(text).map(gloss).join(' · ')],
        ],
        h: H(`${lesson ? 'lesson' : 'node'}/${encodeURIComponent(nid)}`),
        pa: [ct],
        x: { node: nid, field: n.field || null, step: n.step ?? null, stage: n.stage || null },
      }),
    );
  }
  for (const f of objs(data.fields))
    out.push(
      rec({
        ...base,
        ty: 'field',
        k: `l:${co}:f:${text(f.field)}`,
        ti: plain(f.title),
        f: [['title', plain(f.title)]],
        h: H(`field/${encodeURIComponent(text(f.field))}`),
        pa: [ct],
        x: { field: f.field },
      }),
    );
  return out;
}

/** The conversations with the character (engine/convos.js records) → one record each: its title, what was said, its
    style (mode) and where it began (context + origin: the button and the exact paragraph, table, exercise, card …). */
export function fromConvos(conversations: unknown): CatalogRecord[] {
  const out: CatalogRecord[] = [];
  for (const r of objs(conversations)) {
    const messages = objs(r.messages);
    if (!r.id || r.deleted || !messages.length) continue;
    const say = messages
      .map(m => text(m.content).replace(/<noema-state>[\s\S]*?<\/noema-state>/g, ''))
      .join(' \n ')
      .slice(0, 30000);
    const first = text(messages.find(m => m.role === 'user')?.content)
      .replace(/\s+/g, ' ')
      .slice(0, 80);
    const cx = obj(r.context),
      o = obj(cx.origin),
      subject = obj(r.subject);
    // the language tutor (engine/langui.js) files its conversations under the subject "lang:<course>"
    const lc = /^lang:(.+)$/.exec(text(subject.id))?.[1] || null;
    const cxId = text(cx.id);
    out.push(
      rec({
        w: text(o.world) || (lc || cx.type === 'lang' ? 'lang' : 'know'),
        ty: 'convo',
        k: `v:${text(r.id)}`,
        ti: text(r.title) || first || text(r.id),
        sj: lc ? null : text(subject.id) || null,
        co: text(o.course) || lc,
        lg: lc && /^[a-z]{2,3}(-[A-Za-z]+)?:/.test(cxId) ? [cxId.split(':')[0] || ''] : undefined,
        f: [
          ['title', text(r.title)],
          ['said', plain(say)],
        ],
        h: 'convo:' + text(r.id),
        pa: [text(subject.title)].filter(Boolean),
        x: {
          id: r.id,
          kind: r.kind || 'tutor',
          mode: r.mode || null,
          ctx: cx.type || 'course',
          ctxId: cx.id || null,
          label: cx.label || null,
          sec: cx.sectionId || null,
          ch: cx.chapterId || null,
          origin: o,
          at: r.updatedAt || r.createdAt || null,
          n: messages.length,
        },
      }),
    );
  }
  return out;
}

/** The kinds of source the index builds records from. */
export type SourceInput =
  | { readonly kind: 'pack'; readonly data: unknown; readonly meta?: Obj }
  | { readonly kind: 'curriculum'; readonly data: unknown }
  | { readonly kind: 'lang'; readonly data: unknown; readonly meta?: Obj }
  | { readonly kind: 'convos'; readonly data: unknown };

/** The records of one source. */
export function recordsOf(input: SourceInput): CatalogRecord[] {
  switch (input.kind) {
    case 'pack':
      return fromPack(input.data, input.meta || {});
    case 'curriculum':
      return fromCurriculum(input.data);
    case 'lang':
      return fromLangCourse(input.data, input.meta || {});
    case 'convos':
      return fromConvos(input.data);
  }
}
