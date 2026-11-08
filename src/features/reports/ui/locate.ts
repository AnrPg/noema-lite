/**
 * ⚑ The place of a report (docs/REPORTS.md §2): everything that locates the problem uniquely — the address, the open
 * subject and its pack version, the chapter, section, block, exercise or card and the field inside it (the engine's
 * data-* chain and its locateItem), the interface text and its catalog key (a reverse lookup of the words), the UI and
 * content languages, the language course, the build, the window, the last errors.
 *
 * The page's tree is walked as it is composed: up from an element through slots and shadow roots to their hosts, and
 * down into open shadow roots for the element under the pointer, so a screen drawn with shadow DOM is located as well
 * as one in the light DOM.
 */
import type { I18n } from '../../../ports/i18n.ts';
import type { Locator } from '../../../ports/reports.ts';
import type { CommunityHost } from '../../community/ui/host.ts';

/** what never belongs to a report: the ⚑ itself, its dialog and frame, the frame's pop-ups */
export const SKIP = '.nr-skip, .ns-layer, .ns-pop, .nr-hl'; // i18n-ignore (selectors)

export const clip = (s: unknown, n = 300): string => {
  const t = (typeof s === 'string' ? s : s == null ? '' : typeof s === 'number' ? String(s) : '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n) + '…' : t;
};

/** the parent in the composed tree: the slot it is shown in, the parent element, the host of its shadow root */
export function composedParent(e: Element): Element | null {
  if (e.assignedSlot) return e.assignedSlot;
  if (e.parentElement) return e.parentElement;
  const root = e.getRootNode();
  return root instanceof ShadowRoot ? root.host : null;
}
/** is it (or an element it is shown in) one of the selectors */
export function closestComposed(e: Element | null, sel: string): Element | null {
  for (let x = e; x; x = composedParent(x)) if (x.matches(sel)) return x;
  return null;
}
/** the element under a point, inside open shadow roots too */
export function deepElementFromPoint(doc: Document, x: number, y: number): Element | null {
  let e = doc.elementFromPoint(x, y);
  for (let n = 0; e?.shadowRoot && n < 12; n++) {
    const inner = e.shadowRoot.elementFromPoint(x, y);
    if (!inner || inner === e) break;
    e = inner;
  }
  return e;
}

/** the data-* of an element and the elements it is shown in (data-ex, data-bid, data-card, data-pid, data-nf, data-node …) */
export function dataChain(el: Element): Record<string, string>[] {
  const out: Record<string, string>[] = [],
    body = el.ownerDocument.body;
  for (let e: Element | null = el; e && e !== body; e = composedParent(e)) {
    const d: Record<string, string> = {};
    for (const a of e.attributes)
      if (a.name.startsWith('data-') && !/^data-(pop|sticky|off)$/.test(a.name)) d[a.name.slice(5)] = clip(a.value, 120);
    if (Object.keys(d).length) out.push(d);
    if (out.length >= 12) break;
  }
  return out;
}

/** a CSS path that finds the element again (an id, then tags with their classes and position; '>>' crosses a shadow root) */
export function selectorOf(el: Element): string {
  const parts: string[] = [],
    top = el.ownerDocument.documentElement;
  for (let e: Element | null = el; e && e !== top;) {
    if (e.id && /^[A-Za-z][\w-]*$/.test(e.id)) {
      parts.unshift('#' + e.id);
      break;
    }
    let s = e.tagName.toLowerCase();
    const cls = [...e.classList].filter(c => /^[A-Za-z][\w-]*$/.test(c)).slice(0, 3);
    if (cls.length) s += '.' + cls.join('.');
    const tag = e.tagName,
      sib = e.parentElement ? [...e.parentElement.children].filter(x => x.tagName === tag) : [];
    if (sib.length > 1) s += `:nth-of-type(${String(sib.indexOf(e) + 1)})`;
    const root = e.getRootNode();
    parts.unshift(!e.parentElement && root instanceof ShadowRoot ? s + ' >>' : s);
    if (parts.length >= 7) break;
    e = e.parentElement ?? (root instanceof ShadowRoot ? root.host : null);
  }
  return parts.join(' > ').replace(/ >> >/g, ' >>');
}

/* ---------- which catalog keys make a text: the interface's own words, in the shown locale and in English ---------- */
interface Rev {
  readonly key: string;
  readonly loc: string;
  readonly parts: readonly string[];
  readonly len: number;
  readonly re: RegExp;
}
const REV = new WeakMap<object, Rev[]>();
const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function reverseCatalog(cats: Readonly<Record<string, Readonly<Record<string, unknown>>>>, locale: string): Rev[] {
  const known = REV.get(cats);
  if (known) return known;
  const out: Rev[] = [];
  for (const loc of [...new Set([locale, 'en'])]) {
    for (const [key, msg] of Object.entries(cats[loc] ?? {})) {
      if (typeof msg !== 'string' || msg.length < 2) continue;
      const lit: string[] = [];
      let i = 0,
        cur = '';
      while (i < msg.length) {
        // the literal parts; any {…} (a value, a plural, a select) is a gap
        if (msg[i] === '{') {
          let d = 0;
          for (; i < msg.length; i++) {
            if (msg[i] === '{') d++;
            else if (msg[i] === '}' && !--d) break;
          }
          i++;
          lit.push(cur);
          cur = '';
          continue;
        }
        cur += msg[i++] ?? '';
      }
      lit.push(cur);
      const tidy = lit.map(x => x.replace(/\s+/g, ' ').trim());
      const parts = tidy.filter(Boolean);
      if (!parts.length) continue;
      out.push({ key, loc, parts, len: parts.join('').length, re: new RegExp('^' + tidy.map(escapeRe).join('.*?') + '$', 'su') });
    }
  }
  REV.set(cats, out);
  return out;
}
export interface CatalogHit {
  readonly key: string;
  readonly locale: string;
  readonly text: string;
}
export function catalogKeys(el: Element, ctx: CommunityHost['report'], locale: string): CatalogHit[] {
  if (closestComposed(el, '[data-nf], .nb-root .nw')) return []; // the pack's own words (a field of an exercise, a block, a card), not the interface's
  const texts: string[] = [];
  let n = 0;
  for (let e: Element | null = el; e && n < 3; e = composedParent(e), n++) {
    for (const c of e.childNodes) if (c.nodeType === 3 && c.textContent?.trim()) texts.push(c.textContent); // its own words first, then all of its text, then its labels
    const own = clip(e instanceof HTMLElement ? e.innerText || e.textContent : e.textContent, 400);
    if (own) texts.push(own);
    for (const a of ['aria-label', 'title', 'placeholder']) {
      const v = e.getAttribute(a);
      if (v) texts.push(v);
    }
  }
  const cands = [
    ...new Set(
      texts
        .map(t =>
          t
            .replace(/^[\p{Extended_Pictographic}️‍\s▾▸›‹←→⚑✓✅]+/u, '')
            .replace(/\s+/g, ' ')
            .trim(),
        )
        .filter(t => t.length >= 2),
    ),
  ];
  const hits: (CatalogHit & { exact: boolean; len: number; i: number })[] = [];
  const rev = reverseCatalog(ctx.catalogs(), locale);
  cands.forEach((t, i) => {
    for (const r of rev)
      if (r.len >= Math.max(3, t.length * 0.4) && r.re.test(t) && !hits.some(h => h.key === r.key))
        hits.push({ key: r.key, locale: r.loc, text: clip(t, 160), exact: r.parts.length === 1, len: r.len, i });
  });
  return hits
    .sort((a, b) => a.i - b.i || Number(b.exact) - Number(a.exact) || b.len - a.len)
    .slice(0, 4)
    .map(({ key, locale: l, text }) => ({ key, locale: l, text })); // the closest words first
}

/** the address of the page as the frame reads it: #/<page>/<args…>?… */
export function routeOf(hash: string): { hash: string; page: string; args: string[] } {
  const h = hash || '#/';
  const args = h
    .replace(/^#\/?/, '')
    .split('?')[0]
    ?.split('/')
    .map(x => {
      try {
        return decodeURIComponent(x);
      } catch {
        return x; // a broken escape: the segment as written
      }
    }) ?? [''];
  return { hash: h, page: args[0] ?? '', args: args.slice(1) };
}

/** from the address and the element's data-* chain to the pack's own terms (chapter, section, block, exercise, card …) */
export function placeOf(rt: { page: string; args: readonly string[] }, chain: readonly Record<string, string>[]): Record<string, string> {
  const p: Record<string, string> = {},
    a0 = rt.args[0],
    a1 = rt.args[1],
    pick = (k: string): string | undefined => chain.find(d => d[k] != null)?.[k];
  if (a0) {
    if (rt.page === 'ch' || rt.page === 'boss') p['chapter'] = a0;
    if (rt.page === 's') {
      p['section'] = a0;
      if (a1) p['block'] = a1;
    }
    if (rt.page === 'ex') p['exercise'] = a0;
    if (rt.page === 'drill') p['drill'] = a0;
    if (rt.page === 'cards') p['card'] = a0;
  }
  const ex = pick('ex'),
    bid = pick('bid'),
    card = pick('card'),
    pid = pick('pid'),
    nf = chain[0]?.['nf'] ?? pick('nf'),
    ch = pick('ch');
  if (ex) p['exercise'] = ex;
  if (bid) p['block'] = bid;
  if (card) p['card'] = card;
  if (pid) p['trap'] = pid;
  if (ch && !p['chapter']) p['chapter'] = ch;
  if (nf != null) p['field'] = nf;
  return p;
}
const refOf = (p: Readonly<Record<string, string>>, keys: readonly CatalogHit[]): string | null => {
  if (p['exercise']) return 'ex:' + p['exercise'];
  if (p['card']) return 'card:' + p['card'];
  if (p['block']) return `blk:${p['section'] ?? '?'}/${p['block']}`;
  if (p['trap']) return `trap:${p['chapter'] ?? '?'}/${p['trap']}`;
  if (p['drill']) return 'drill:' + p['drill'];
  if (p['section']) return 'sec:' + p['section'];
  if (p['chapter']) return 'ch:' + p['chapter'];
  return keys[0] ? 'ui:' + keys[0].key : null;
};

/** what else is on screen: the exercises, cards and blocks in view (when nothing was pointed at, one of them is it) */
function visibleItems(doc: Document, win: Window): { ref: string; text: string }[] {
  const out: { ref: string; text: string }[] = [];
  for (const el of doc.querySelectorAll<HTMLElement>('[data-ex], [data-card], [data-bid], [data-pid]')) {
    if (closestComposed(el, SKIP)) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > win.innerHeight || !r.width) continue;
    const d = el.dataset,
      ref = d['ex'] ? 'ex:' + d['ex'] : d['card'] ? 'card:' + d['card'] : d['bid'] ? 'blk:' + d['bid'] : 'trap:' + (d['pid'] ?? '');
    if (!out.some(x => x.ref === ref)) out.push({ ref, text: clip(el.innerText, 90) });
    if (out.length >= 10) break;
  }
  return out;
}

/** everything a report carries: built when ⚑ is pressed (before anything of the report is on screen) and again after 🎯 */
export function collect(
  target: Element | null,
  picked: boolean,
  host: CommunityHost,
  i18n: I18n,
  win: Window,
): Locator & { itemRef: string } {
  const doc = win.document,
    ctx = host.report;
  const rt = routeOf(win.location.hash),
    chain = target ? dataChain(target) : [],
    keys = target ? catalogKeys(target, ctx, i18n.locale()) : [];
  const place = placeOf(rt, chain);
  let item: unknown = null;
  try {
    item = Object.keys(place).length ? (ctx.locate(place) ?? null) : null;
  } catch (e) {
    item = { error: e instanceof Error ? e.message : clip(e) }; // the engine could not place it: the report says so
  }
  let lang: Record<string, string> | null = null;
  if (rt.page === 'lang' && rt.args[0]) {
    lang = { course: rt.args[0] };
    if (rt.args[1]) lang['view'] = rt.args[1];
    if (rt.args[2]) lang['at'] = rt.args.slice(2).join('/');
    for (const k of ['node', 'lex', 'lang', 'id']) {
      const v = chain.find(d => d[k])?.[k];
      if (v) lang[k] = v;
    }
  }
  const r = target?.getBoundingClientRect();
  const given = target ? ctx.given(target) : null;
  const crumbs = [...doc.querySelectorAll<HTMLElement>('.ns-crumbs > *:not(.sep)')].map(x => clip(x.innerText, 60)).filter(Boolean);
  const h1 = [...doc.querySelectorAll<HTMLElement>('main h1')].find(x => !closestComposed(x, SKIP));
  const look = ctx.look();
  const dark = win.matchMedia('(prefers-color-scheme: dark)').matches;
  const loc = {
    v: 1,
    at: new Date().toISOString(),
    app: ctx.app(),
    route: rt,
    screen: {
      title: h1 ? clip(h1.innerText, 120) : clip(doc.title, 120),
      crumbs,
      tab: doc.querySelector<HTMLElement>('.ns-tab.on')?.dataset['tab'] ?? null,
    },
    ui: {
      locale: i18n.locale(),
      dir: i18n.dir(),
      htmlLang: doc.documentElement.lang || null,
      theme: doc.documentElement.dataset['theme'] ?? (dark ? 'dark (system)' : 'light (system)'),
      character: look.character,
      world: look.world,
      viewport: { w: win.innerWidth, h: win.innerHeight, dpr: win.devicePixelRatio || 1 },
      scroll: { x: Math.round(win.scrollX), y: Math.round(win.scrollY) },
      ua: win.navigator.userAgent,
      touch: win.matchMedia('(pointer: coarse)').matches,
    },
    account: { kind: host.account()?.kind ?? 'local' },
    subject: ctx.subject(rt.page),
    place,
    item,
    lang,
    target: target
      ? {
          picked,
          selector: selectorOf(target),
          tag: target.tagName.toLowerCase(),
          text: clip(
            (target instanceof HTMLElement ? target.innerText : '') || target.textContent || target.getAttribute('aria-label') || '',
            400,
          ),
          rect: r ? { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) } : null,
          data: chain,
          i18n: keys,
          given: given ? clip(given, 400) : null,
        }
      : null,
    visible: visibleItems(doc, win),
    errors: ctx.errors().slice(-10),
  };
  const itemRef =
    refOf(place, keys) ??
    (lang
      ? 'lang:' + [lang['course'], lang['view'], lang['node'] ?? lang['lex'] ?? lang['at']].filter(Boolean).join('/')
      : 'page:' + (rt.page || 'today'));
  return { ...(loc as unknown as Locator), itemRef };
}
