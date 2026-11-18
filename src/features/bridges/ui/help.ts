/**
 * 文A language help on the page (docs/BRIDGE.md), in Lit (light DOM: engine/src/36_bridge.css and the browser suites read the
 * classes nb-* and nw-*):
 *
 *   ui.section({ sid, body, head })   a section's theory after the study page drew it: the 文A button in its head, the first-time
 *                                     card (native language, then A2 / B1 / B2), “Before you read”, the words linked and glossed
 *                                     by the word-linking core (engine/wordlink.js; never in exercises, code or maths)
 *   ui.tag(subject, acc)              the badge of a subject in a list: 文A RU +2 (the learner's language first)
 *   ui.menuItem()                     the ⋮ entry of the open subject's section (null when it has no help)
 *   ui.panel(acc, { onChange })       on/off, the native language and the level
 *
 * A word opens its card (the meaning in this subject, the other meanings, draft, 🔊, “I know it”, report a mistake): a
 * small card beside the word, a bottom sheet on a phone. The rules are the domain's (domain/help.ts), the bridges and the
 * learner's words the service's (application/bridges.ts).
 */
import { html, nothing, type TemplateResult } from 'lit';
import type { I18n } from '../../../ports/i18n.ts';
import { defineOnce, LightElement } from '../../translation/ui/light.ts';
import type { BridgeService, SubjectRow } from '../application/bridges.ts';
import {
  CEFR,
  LEVELS,
  POS,
  badge,
  langsOf,
  pickGloss,
  prepare,
  senseAt,
  type Bridge,
  type Entry,
  type HelpLevel,
  type Pick,
  type Prepared,
  type Sense,
} from '../domain/help.ts';
import { base } from '../domain/lookup.ts';

/** The word-linking core (engine/wordlink.js, NoemaWordlink). */
export interface WordLinker {
  index(entries: readonly Entry[]): unknown;
  decorate(
    root: Element,
    idx: unknown,
    o: {
      pick(e: Entry, ctx: { block: Element; blockText?: string; offset: number; form: string }): Pick | null;
      skip: string;
    },
  ): number;
  undecorate(root: Element): void;
  fold(s: string): string;
}
/** the open subject: its list entry, its pack, its metadata */
export interface OpenSubject {
  readonly subject: SubjectRow & { readonly kind?: string };
  readonly pack: { readonly subject?: { readonly id?: string; readonly language?: string } };
  readonly meta: SubjectRow | null;
}
export interface BridgeUiPort {
  readonly bridges: BridgeService;
  readonly i18n: I18n;
  /** the word-linking core, when it is on the page */
  words(): WordLinker | null;
  open(): OpenSubject | null;
  /** a language's name in the interface language ("Russian"), and in its own ("Русский") */
  langName(code: string): string;
  endonym(code: string): string;
  today(): string;
  now(): number;
  /** reads a word aloud (null: the device cannot) */
  speaker(): ((text: string, lang: string) => void) | null;
  readonly document: Document;
}

type Btn = (
  cls: string,
  text: unknown,
  onClick: (e: Event) => void,
  o?: { label?: string; title?: string; lang?: string },
) => TemplateResult;
const btn: Btn = (cls, text, onClick, o = {}) =>
  html`<button
    class=${cls}
    type="button"
    lang=${o.lang ?? nothing}
    title=${o.title ?? nothing}
    aria-label=${o.label ?? nothing}
    @click=${onClick}
  >
    ${text}
  </button>`;

/* ---------- the elements ---------- */

/** the badge of a subject in a list */
export class NoemaBridgeTag extends LightElement {
  readonly #text: string;
  constructor(i18n: I18n, text: string, label: string, codes: readonly string[], weak: boolean) {
    super(i18n);
    this.#text = text;
    this.className = 'nb-tag' + (weak ? ' nb-weak' : '');
    this.title = label;
    this.setAttribute('aria-label', label);
    this.setAttribute('data-bridge', codes.join(' '));
  }
  override render(): TemplateResult {
    return html`<span class="noema-i18n-skip" translate="no">${this.#text}</span>`;
  }
}

/** the 文A button in a section's head */
export class NoemaBridgeButton extends LightElement {
  readonly #help: BridgeHelp;
  constructor(help: BridgeHelp) {
    super(help.port.i18n);
    this.#help = help;
    this.setAttribute('data-nowl', '1');
  }
  override render(): TemplateResult {
    const st = this.#help.port.bridges.settings();
    return html`<button
      class=${'pill nb-btn' + (st.on && st.asked ? ' on' : '')}
      type="button"
      title=${this.t('bridge.toggleTip')}
      aria-label=${this.t('bridge.toggle')}
      aria-haspopup="dialog"
      data-nowl="1"
      @click=${(e: Event): void => {
        e.stopPropagation();
        this.#help.openPanel(e.currentTarget as HTMLElement);
      }}
    >
      <span aria-hidden="true">文A</span>
    </button>`;
  }
}

/** On/off, the native language and the level (the 文A panel; Settings too). */
export class NoemaBridgePanel extends LightElement {
  readonly #help: BridgeHelp;
  readonly #acc: string | null;
  readonly #onChange: (() => void) | null;
  constructor(help: BridgeHelp, acc: string | null, onChange: (() => void) | null) {
    super(help.port.i18n);
    this.#help = help;
    this.#acc = acc;
    this.#onChange = onChange;
    this.className = 'nb-panel';
  }
  #changed(): void {
    this.redraw();
    this.#onChange?.();
  }
  override render(): TemplateResult {
    const B = this.#help.port.bridges,
      acc = this.#acc,
      st = B.settings(acc),
      av = this.#help.availableHere(acc),
      mine = B.nativeOrUi(acc),
      codes = [...new Set([...Object.keys(av), mine])];
    const E = (c: string): string => this.#help.port.endonym(c);
    return html`<label class="nb-row"
        ><input
          type="checkbox"
          class="nb-on"
          .checked=${!!(st.on && st.asked)}
          @change=${(e: Event): void => {
            B.setSettings(acc, { on: (e.target as HTMLInputElement).checked, asked: B.settings(acc).asked || this.#help.port.now() });
            this.#changed();
          }}
        /><b>${this.t('bridge.toggle')}</b></label
      >
      <p class="tiny">${this.t('bridge.panel.sub')}</p>
      <label class="nb-row"
        ><span>${this.t('bridge.native.label')}</span
        ><select
          class="nb-natsel"
          aria-label=${this.t('bridge.native.label')}
          @change=${(e: Event): void => {
            B.setNative(acc, (e.target as HTMLSelectElement).value);
            this.#changed();
          }}
        >
          ${codes.map(c => html`<option value=${c} ?selected=${c === mine}>${E(c) + (av[c] ? '' : ' · ' + this.t('bridge.native.none'))}</option>`)}
        </select></label
      >
      <div class="nb-levels" role="radiogroup" aria-label=${this.t('bridge.level.title')}>
        ${LEVELS.map(
          l =>
            html`<label class="nb-level"
              ><input
                type="radio"
                name="nb-level"
                value=${l}
                .checked=${st.level === l}
                @change=${(): void => {
                  B.setSettings(acc, { level: l, on: true, asked: B.settings(acc).asked || this.#help.port.now() });
                  this.#changed();
                }}
              /><span><b>${this.t('bridge.level.' + l)}</b><small>${this.t('bridge.level.' + l + 'Sub')}</small></span></label
            >`,
        )}
      </div>
      ${this.#help.hasPack() && !av[mine] ? html`<p class="tiny nb-hint">${this.t('bridge.panel.none', { lang: E(mine) })}</p>` : nothing}`;
  }
}

/** “Before you read”: the section's preview in the learner's language and its key terms, both ways. */
export class NoemaBridgePrep extends LightElement {
  readonly #help: BridgeHelp;
  readonly #p: Prepared;
  readonly #sid: string;
  readonly #level: HelpLevel;
  constructor(help: BridgeHelp, p: Prepared, sid: string, level: HelpLevel) {
    super(help.port.i18n);
    this.#help = help;
    this.#p = p;
    this.#sid = sid;
    this.#level = level;
    this.setAttribute('data-nowl', '1');
  }
  override render(): TemplateResult | typeof nothing {
    const b = this.#p.bridge,
      sec = b.sections?.[this.#sid];
    if (!sec) return nothing;
    const terms = (sec.terms ?? []).map(k => this.#p.byK.get(k)).filter((e): e is Entry => !!e?.senses?.[0]?.t);
    return html`<details class="nb-prep" data-nowl="1" ?open=${this.#level !== 'tap'}>
      <summary>
        <span class="nb-i" aria-hidden="true">文A</span> ${this.t('bridge.prep.title')}${
          terms.length ? html`<small> · ${this.t('bridge.prep.terms', { n: terms.length })}</small>` : nothing
        }
      </summary>
      ${sec.preview ? html`<p class="nb-preview" lang=${b.native} dir="auto">${sec.preview}</p>` : nothing}
      ${
        terms.length
          ? html`<ul class="nb-terms">
              ${terms.map(e => {
                const s = e.senses?.[0];
                return html`<li>
                  ${btn(
                    'nb-term',
                    e.k,
                    ev => {
                      this.#help.openCard(ev.currentTarget as HTMLElement, e.k, String(s?.id ?? ''));
                    },
                    { lang: b.source ?? '' },
                  )}
                  <span lang=${b.native} dir="auto">${s?.t ?? ''}</span>
                </li>`;
              })}
            </ul>`
          : nothing
      }
    </details>`;
  }
}

/** The first time a subject with language help is opened: the learner's native language (when unknown), then the level. */
export class NoemaBridgeAsk extends LightElement {
  readonly #help: BridgeHelp;
  readonly #codes: readonly string[];
  readonly #src: string;
  #native: string | null;
  #other = false;
  constructor(help: BridgeHelp, codes: readonly string[], src: string) {
    super(help.port.i18n);
    this.#help = help;
    this.#codes = codes.filter(c => c !== src);
    this.#src = src;
    const B = help.port.bridges;
    this.#native = B.native() || (this.#codes.includes(B.nativeOrUi()) ? B.nativeOrUi() : null);
    this.setAttribute('data-nowl', '1');
  }
  #done(patch: { on: boolean; level?: HelpLevel; cefr?: string }): void {
    this.#help.port.bridges.setSettings(null, { asked: this.#help.port.now(), ...patch });
    this.remove();
  }
  override render(): TemplateResult {
    const P = this.#help.port,
      src = this.#src;
    if (this.#other)
      return html`<div class="nb-ask" role="region" aria-label=${this.t('bridge.toggle')}>
        <p>${this.t('bridge.ask.noneYet')}</p>
        ${btn('btn small', this.t('bridge.ask.ok'), () => {
          this.#done({ on: false });
        })}
      </div>`;
    if (!this.#native)
      return html`<div class="nb-ask" role="region" aria-label=${this.t('bridge.toggle')}>
        <b><span class="nb-i" aria-hidden="true">文A</span> ${this.t('bridge.ask.nativeQ')}</b>
        <p class="tiny">${this.t('bridge.ask.nativeWhy', { source: P.langName(src) })}</p>
        <select
          class="nb-natsel"
          aria-label=${this.t('bridge.ask.nativeQ')}
          @change=${(e: Event): void => {
            const v = (e.target as HTMLSelectElement).value;
            if (v === src) {
              // the content is in the learner's own language: nothing to help with
              P.bridges.setNative(null, src);
              this.#done({ on: false });
            } else if (v === '*') {
              this.#other = true;
              this.redraw();
            } else if (v) {
              this.#native = v;
              P.bridges.setNative(null, v);
              this.redraw();
            }
          }}
        >
          <option value="">—</option>
          ${[...this.#codes, src].map(c => html`<option value=${c}>${P.endonym(c)}</option>`)}
          <option value="*">${this.t('bridge.ask.nativeOther')}</option>
        </select>
      </div>`;
    const pickL = (c: 'a2' | 'b1' | 'b2' | 'off') => (): void => {
      this.#done(c === 'off' ? { on: false } : { on: true, level: CEFR[c], cefr: c });
      this.#help.afterAsk();
    };
    return html`<div class="nb-ask" role="region" aria-label=${this.t('bridge.toggle')}>
      <b
        ><span class="nb-i" aria-hidden="true">文A</span>
        ${this.t('bridge.ask.title', { source: P.langName(src), native: P.endonym(this.#native) })}</b
      >
      <p class="tiny">${this.t('bridge.ask.text', { source: P.langName(src) })}</p>
      <div class="nb-askrow">
        ${(['a2', 'b1', 'b2'] as const).map(c => btn('btn small', this.t('bridge.ask.' + c), pickL(c)))}
        ${btn('btn small ghost', this.t('bridge.ask.later'), pickL('off'))}
      </div>
      <p class="tiny nb-hint">${this.t('bridge.ask.settings')}</p>
    </div>`;
  }
}

/** A word's card (or the 文A panel in a card): beside its anchor, a bottom sheet on a phone. */
export class NoemaBridgeCard extends LightElement {
  readonly #body: () => TemplateResult;
  readonly from: HTMLElement | null;
  constructor(i18n: I18n, label: string, body: () => TemplateResult, from: HTMLElement | null, pop: boolean) {
    super(i18n);
    this.#body = body;
    this.from = from;
    this.className = 'nb-card' + (pop ? ' nb-pop' : '');
    this.setAttribute('role', 'dialog');
    this.setAttribute('aria-label', label);
    this.tabIndex = -1;
  }
  override render(): TemplateResult {
    return this.#body();
  }
}

/* ---------- the help of the page ---------- */

/** A section's state: its bridge, its body, the words glossed in it, the words counted today. */
interface Current {
  p: Prepared | null;
  sid: string | null;
  body: HTMLElement | null;
}

export class BridgeHelp {
  readonly port: BridgeUiPort;
  readonly #prepared = new WeakMap<Bridge, Prepared>();
  readonly #cur: Current = { p: null, sid: null, body: null };
  readonly #seenOnce = new Set<string>();
  #pending: { sid: string; body: HTMLElement; head: HTMLElement | null } | null = null;
  #card: NoemaBridgeCard | null = null;

  constructor(port: BridgeUiPort) {
    this.port = port;
  }

  #prepare(b: Bridge): Prepared {
    let p = this.#prepared.get(b);
    if (!p) this.#prepared.set(b, (p = prepare(b)));
    return p;
  }
  /** the bridges of the open subject from the language shown */
  availableHere(acc: string | null = null): ReturnType<BridgeService['available']> {
    const o = this.port.open(),
      id = o?.pack.subject?.id;
    if (!o || !id) return {};
    const L = langsOf(o.subject, o.pack);
    return this.port.bridges.available(acc, id, o.meta, L.src, L.own);
  }
  hasPack(): boolean {
    return !!this.port.open()?.pack.subject?.id;
  }

  /** The study page asks for help on a section before it knows whether a bridge exists (the first-time card waits). */
  async section(o: { sid: string; body: HTMLElement | null; head: HTMLElement | null }): Promise<void> {
    if (o.body) this.#pending = { sid: o.sid, body: o.body, head: o.head };
    await this.#section(o);
  }

  async #section({ sid, body, head }: { sid: string; body: HTMLElement | null; head: HTMLElement | null }): Promise<void> {
    const P = this.port,
      B = P.bridges,
      W = P.words(),
      o = P.open(),
      packId = o?.pack.subject?.id;
    if (!body || !o || !packId || !W) return;
    const { own, src } = langsOf(o.subject, o.pack); // src: the language shown — the pack's own or its translation
    const av = B.available(null, packId, o.meta, src, own);
    if (head && !head.querySelector('.nb-btn') && Object.keys(av).length) head.append(new NoemaBridgeButton(this).redraw());
    const st = B.settings(),
      nat = B.nativeOrUi();
    if (!Object.keys(av).length || (B.native() && nat === src)) {
      this.#clear(body);
      return;
    } // no help, or the content is in the learner's own language
    if (!st.asked) {
      if (!body.querySelector('.nb-ask')) body.prepend(new NoemaBridgeAsk(this, Object.keys(av), src).redraw());
      return undefined;
    }
    if (!st.on || !av[nat] || nat === src) {
      this.#clear(body);
      return;
    }
    const b = await B.load(null, packId, nat, src, own);
    if (!b || base(b.source) !== src || !body.isConnected) {
      this.#clear(body);
      return;
    }
    const p = this.#prepare(b);
    Object.assign(this.#cur, { p, sid, body });
    body.classList.add('nb-root');
    body.dataset['nbLevel'] = st.level;
    W.undecorate(body);
    body.querySelector(':scope > noema-bridge-prep')?.remove();
    const sec = b.sections?.[sid];
    if (sec && (sec.preview || (sec.terms ?? []).length)) body.prepend(new NoemaBridgePrep(this, p, sid, st.level).redraw());
    const glossed = new Set<string>(),
      words = B.words(null, b.source),
      keyT = new Set(sec?.terms ?? []),
      firstHere = new Set<string>(),
      now = P.now();
    W.decorate(body, W.index(b.entries ?? []), {
      pick: (e, ctx) => {
        const sense = senseAt(
          p,
          e,
          {
            blockText: ctx.blockText ?? ctx.block.textContent,
            bid: (ctx.block as HTMLElement).dataset['bid'],
            offset: ctx.offset,
            form: ctx.form,
          },
          sid,
          s => W.fold(s),
        );
        if (!sense?.t) return null;
        const first = !firstHere.has(e.k);
        firstHere.add(e.k);
        const r = pickGloss({
          entry: e,
          sense,
          word: words[e.k],
          level: st.level,
          first,
          keyTerm: keyT.has(e.k),
          native: b.native,
          form: ctx.form,
          now,
          fold: s => W.fold(s),
        });
        if (r.gloss) glossed.add(e.k);
        return r;
      },
      skip: '.nb-prep, noema-bridge-prep, .nb-ask, noema-bridge-ask, .newtag, .xbtn',
    });
    body.classList.toggle('nb-glossed', !!body.querySelector('.nw-g')); // room under the lines for the glosses
    // a word whose gloss was shown in this section counts once per section and day (help that fades)
    const day = P.today();
    for (const k of glossed) {
      const once = `${sid}|${k}|${day}`;
      if (this.#seenOnce.has(once)) continue;
      this.#seenOnce.add(once);
      B.touchWord(null, b.source, k, { seen: n => (n ?? 0) + 1 });
    }
    return undefined;
  }

  #clear(body: HTMLElement): void {
    this.port.words()?.undecorate(body);
    body.classList.remove('nb-root', 'nb-glossed');
    body.querySelector(':scope > noema-bridge-prep')?.remove();
  }
  #redraw(): void {
    const c = this.#cur;
    if (c.body?.isConnected && c.sid) void this.#section({ sid: c.sid, body: c.body, head: null });
  }
  /** after the first-time card: draw the section that asked */
  afterAsk(): void {
    if (this.#pending) void this.#section(this.#pending);
    else this.#redraw();
  }

  /** the ⋮ entry of the open section */
  menuItem(): { label: string; icon: string; run(): void } | null {
    if (!Object.keys(this.availableHere()).length) return null;
    return {
      label: this.port.i18n.t('bridge.menu'),
      icon: '文A',
      run: () => {
        this.openPanel(this.port.document.querySelector<HTMLElement>('.nb-btn'));
      },
    };
  }

  /** On/off, level and language (Settings too). */
  panel(acc: string | null = null, onChange: (() => void) | null = null): HTMLElement {
    return new NoemaBridgePanel(this, acc, onChange).redraw();
  }

  /** the badge of a subject in a list (null: no help for the language it will be read in) */
  tag(s: (SubjectRow & { kind?: string }) | null | undefined, acc: string | null = null): HTMLElement | null {
    if (!s || s.kind === 'language' || s.id.startsWith('lang:')) return null;
    const B = this.port.bridges,
      L = langsOf(s),
      av = B.available(acc, s.id, s, L.src, L.own); // the help for the language the learner will read
    const m = badge(av, B.nativeOrUi(acc));
    if (!m) return null;
    const t = (k: string, p: Record<string, string>): string => this.port.i18n.t(k, p);
    const langs = m.langs.map(x =>
      x.kind === 'partial'
        ? t('bridge.tag.partial', { lang: this.port.endonym(x.code), pct: this.port.i18n.format.percent(x.coverage ?? 0) })
        : x.kind === 'reviewed'
          ? this.port.endonym(x.code)
          : t('bridge.tag.draft', { lang: this.port.endonym(x.code) }),
    );
    const label = t('bridge.tag.tip', { langs: this.port.i18n.format.list(langs) });
    const first = m.codes[0] ?? '';
    return new NoemaBridgeTag(
      this.port.i18n,
      '文A ' + first.toUpperCase() + (m.codes.length > 1 ? ' +' + String(m.codes.length - 1) : ''),
      label,
      m.codes,
      m.weak,
    ).redraw();
  }

  /* ---------- the card ---------- */

  closeCard(refocus = false): void {
    const c = this.#card;
    if (!c) return;
    this.#card = null;
    c.remove();
    if (refocus) c.from?.focus({ preventScroll: true });
  }
  isCardOpen(): boolean {
    return !!this.#card;
  }

  #place(card: NoemaBridgeCard, anchor: HTMLElement | null): void {
    const doc = this.port.document,
      win = doc.defaultView;
    doc.body.append(card.redraw());
    this.#card = card;
    const r = anchor?.getBoundingClientRect(),
      narrow = (win?.innerWidth ?? 0) < 600;
    if (r && !narrow && win) {
      const w = card.offsetWidth;
      card.style.top = String(r.bottom + win.scrollY + 6) + 'px';
      card.style.left = String(Math.max(8, Math.min(win.innerWidth - w - 8, r.left + win.scrollX))) + 'px';
    } else card.classList.add('nb-sheet');
    win?.setTimeout(() => {
      (card.querySelector<HTMLElement>('button.nb-known, .nb-x') ?? card).focus();
    }, 30);
  }
  #closeBtn(): TemplateResult {
    return btn(
      'nb-x',
      '×',
      () => {
        this.closeCard(true);
      },
      { label: this.port.i18n.t('bridge.card.close') },
    );
  }

  openPanel(anchor: HTMLElement | null): void {
    this.closeCard();
    const T = (k: string): string => this.port.i18n.t(k);
    const panel = this.panel(null, () => {
      for (const b of this.port.document.querySelectorAll<NoemaBridgeButton>('noema-bridge-button')) b.redraw();
      this.port.document.querySelector('noema-bridge-ask')?.remove();
      this.#redraw();
      if (!this.#cur.body && this.#pending) void this.#section(this.#pending);
    });
    const card = new NoemaBridgeCard(
      this.port.i18n,
      T('bridge.toggle'),
      () =>
        html`<div class="nb-cardhead">
            <b><span aria-hidden="true">文A </span>${T('bridge.toggle')}</b>${this.#closeBtn()}
          </div>
          ${panel}`,
      anchor,
      true,
    );
    this.#place(card, anchor);
  }

  openCard(wEl: HTMLElement | null, k: string, senseId: string): void {
    const P = this.port,
      p = this.#cur.p;
    if (!p) return;
    const b = p.bridge,
      e = p.byK.get(k);
    if (!e) return;
    const sense: Sense | undefined = (e.senses ?? []).find(s => String(s.id) === senseId) ?? e.senses?.[0];
    if (!sense) return;
    this.closeCard();
    const first = wEl?.firstChild;
    const form = first?.nodeType === 3 ? (first as Text).data : wEl?.textContent || k;
    const w = P.bridges.touchWord(null, b.source, k, { look: n => (n ?? 0) + 1, lookAt: P.now() });
    const known = !!w.known,
      T = (key: string, params?: Record<string, string>): string => P.i18n.t(key, params);
    const say = P.speaker();
    const p0 = sense.pos ?? e.pos,
      pos = p0 && POS.includes(p0) ? T('bridge.pos.' + p0) : '';
    const fold = (s: string): string => P.words()?.fold(s) ?? s.toLowerCase();
    const meta = [pos, fold(form) !== fold(e.k) ? T('bridge.card.form', { lemma: e.k }) : ''].filter(Boolean).join(' · ');
    const others = (e.senses ?? []).filter(x => x !== sense && x.t); // the word's other meanings in this subject
    let reporting = false,
      reported = false,
      note = '';
    const card = new NoemaBridgeCard(
      P.i18n,
      form,
      () =>
        html`<div class="nb-cardhead">
            <b class="nb-word" lang=${b.source ?? nothing}>${form}</b>${
              say
                ? btn(
                    'nb-say',
                    '🔊',
                    () => {
                      say(form, b.source ?? '');
                    },
                    { label: T('bridge.card.listen'), title: T('bridge.card.listen') },
                  )
                : nothing
            }${this.#closeBtn()}
          </div>
          <div class="tiny nb-meta">${meta}</div>
          <div class="nb-t" lang=${b.native} dir="auto">${sense.t}</div>
          ${sense.note ? html`<p class="nb-note" lang=${b.native} dir="auto">${sense.note}</p>` : nothing}
          ${
            others.length
              ? html`<details class="nb-other">
                  <summary class="tiny">${T('bridge.card.other')}</summary>
                  <ul>
                    ${others.map(
                      x =>
                        html`<li>
                          <span lang=${b.native} dir="auto">${x.t}</span
                          >${x.gloss ? html`<small lang=${b.source ?? nothing}> · ${x.gloss}</small>` : nothing}
                        </li>`,
                    )}
                  </ul>
                </details>`
              : nothing
          }
          ${
            sense.st === 'stale'
              ? html`<p class="tiny nb-flag">${T('bridge.card.stale')}</p>`
              : (sense.st ?? b.status) === 'draft'
                ? html`<p class="tiny nb-flag" title=${T('bridge.card.draftTip')}>${T('bridge.card.draft')}</p>`
                : nothing
          }
          <div class="nb-actions">
            ${btn('btn small nb-known', known ? T('bridge.card.unknown') : T('bridge.card.known'), () => {
              P.bridges.touchWord(null, b.source, k, { known: known ? undefined : P.now() });
              this.closeCard();
              this.#redraw();
            })}
            ${btn('btn small ghost nb-rep', T('bridge.card.report'), () => {
              reporting = !reporting;
              card.redraw();
              card.querySelector('textarea')?.focus();
            })}
          </div>
          <div class="nb-report" ?hidden=${!reporting}>
            ${
              reported
                ? html`<p class="tiny">${T('bridge.card.reported')}</p>`
                : html`<textarea
                      class="noema-input"
                      rows="2"
                      maxlength="300"
                      placeholder=${T('bridge.card.reportPh')}
                      aria-label=${T('bridge.card.report')}
                      @input=${(ev: Event): void => {
                        note = (ev.target as HTMLTextAreaElement).value;
                      }}
                    ></textarea
                    >${btn('btn small', T('bridge.card.reportSend'), () => {
                      P.bridges.report(null, {
                        pack: b.pack,
                        native: b.native,
                        k,
                        sense: String(sense.id),
                        form,
                        note: note.trim(),
                        sid: this.#cur.sid,
                      });
                      reported = true;
                      card.redraw();
                    })}`
            }
          </div>`,
      wEl,
      false,
    );
    this.#place(card, wEl);
  }

  /** the page's clicks and keys: a linked word opens its card; a press outside or Escape closes it */
  listen(): void {
    const doc = this.port.document;
    const open = (ev: Event, w: HTMLElement): void => {
      if (!w.closest('.nb-root')) return;
      ev.preventDefault();
      ev.stopPropagation();
      this.openCard(w, w.dataset['k'] ?? '', w.dataset['s'] ?? '');
    };
    doc.addEventListener('click', ev => {
      const t = ev.target as Element | null,
        w = t?.closest<HTMLElement>('.nb-root .nw');
      if (w) {
        open(ev, w);
        return;
      }
      if (this.#card && !t?.closest('.nb-card') && !t?.closest('.nb-btn')) this.closeCard();
      return undefined;
    });
    doc.addEventListener('keydown', ev => {
      if (ev.key === 'Escape' && this.#card) {
        this.closeCard(true);
        return;
      }
      const w = (ev.key === 'Enter' || ev.key === ' ') && (ev.target as Element | null)?.closest<HTMLElement>('.nb-root .nw');
      if (w) open(ev, w);
    });
  }
}

const TAGS: readonly (readonly [string, CustomElementConstructor])[] = [
  ['noema-bridge-tag', NoemaBridgeTag],
  ['noema-bridge-button', NoemaBridgeButton],
  ['noema-bridge-panel', NoemaBridgePanel],
  ['noema-bridge-prep', NoemaBridgePrep],
  ['noema-bridge-ask', NoemaBridgeAsk],
  ['noema-bridge-card', NoemaBridgeCard],
];
export function defineBridgeUi(registry: CustomElementRegistry | undefined = globalThis.customElements): void {
  for (const [tag, ctor] of TAGS) defineOnce(registry, tag, ctor);
}

/** The surface the older pages use (NoemaShell.bridge). */
export interface BridgeUi {
  section(o: { sid: string; body: HTMLElement | null; head: HTMLElement | null }): Promise<void>;
  tag(s: (SubjectRow & { kind?: string }) | null | undefined, acc?: string | null): HTMLElement | null;
  menuItem(): { label: string; icon: string; run(): void } | null;
  panel(acc?: string | null, o?: { onChange?: () => void }): HTMLElement;
}

export function bridgeUi(port: BridgeUiPort): BridgeUi {
  defineBridgeUi(port.document.defaultView?.customElements);
  const help = new BridgeHelp(port);
  help.listen();
  return Object.freeze({
    section: (o: { sid: string; body: HTMLElement | null; head: HTMLElement | null }) => help.section(o),
    tag: (s: (SubjectRow & { kind?: string }) | null | undefined, acc: string | null = null) => help.tag(s, acc),
    menuItem: () => help.menuItem(),
    panel: (acc: string | null = null, o: { onChange?: () => void } = {}) => help.panel(acc, o.onChange ?? null),
  });
}
