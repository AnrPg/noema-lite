/**
 * 🌐 The translation of shared texts on a page (docs/i18n.md §11), in Lit (light DOM: the page's sheet engine/src/37_mt.css
 * and the Roadmaps' copy in their shadow root, features/roadmaps/ui/public.ts mtStyles, style the classes):
 *
 *   ui.mark(node, { language, kind, private })   a node whose text is a shared text
 *   ui.toggle(acc, nodes) → <noema-mt-toggle>    "🌐 Translate" / "Show original" for one item (null: nothing there needs one)
 *   ui.bar(acc, root) → <noema-mt-bar>           "🌐 Translate all" / "Show originals" for every marked text inside root
 *   ui.panel(acc, { compact, heading })          ⚙️ the consent, the provider, the caps, the saved translations
 *   ui.consent(acc) → Promise<boolean>           the question when the learner asks for a translation while it is off
 *
 * A translation asks first: the consent while it is off, the hint without an own key, the estimate before more than one new
 * text; the caps and the policy are the translator's (application/translator.ts).
 */
import { html, nothing, type TemplateResult } from 'lit';
import type { I18n } from '../../../ports/i18n.ts';
import type { MtResult, Translator } from '../application/translator.ts';
import type { Estimate, MtSettings } from '../domain/plan.ts';
import { defineOnce, LightElement } from './light.ts';
import { isShown, itemOf, mark, marked, needs, restore, show, type MarkOptions } from './marks.ts';

/** What the elements need: the translator and the app's words; `host()` is where a dialog goes (the frame, else the body). */
export interface TranslationUiPort {
  readonly mt: Translator;
  readonly i18n: I18n;
  host(): HTMLElement;
}

type Status =
  | { readonly kind: 'idle' }
  | { readonly kind: 'busy' }
  | { readonly kind: 'hint'; readonly text: string }
  | { readonly kind: 'ask'; readonly est: Estimate; readonly answer: (go: boolean) => void };

/** The words of a reason a text stayed in its original. */
function reasonText(i18n: I18n, s: MtSettings, r: MtResult['reason'], e: unknown): string {
  switch (r) {
    case 'nokey':
      return i18n.t('mt.hint.nokey');
    case 'cap.daily':
      return i18n.t('mt.hint.daily', { max: s.dailyChars });
    case 'cap.session':
      return i18n.t('mt.hint.session', { max: s.sessionRequests });
    case 'cap.rate':
      return i18n.t('mt.hint.rate');
    case 'private':
    case 'policy':
      return i18n.t('mt.hint.private');
    case 'sensitive':
      return i18n.t('mt.hint.sensitive');
    case 'error':
      return i18n.t('mt.hint.error', { error: e ? i18n.err(e) : '?' });
    default:
      return '';
  }
}

/** The live line beside a button: the hint, ⏳, or the estimate with Translate / Cancel. */
export class NoemaMtStatus extends LightElement {
  static override properties = { status: { attribute: false } };
  declare status: Status;
  readonly note: boolean;
  constructor(i18n: I18n, note = false) {
    super(i18n);
    this.status = { kind: 'idle' };
    this.note = note;
    this.className = 'mt-status' + (note ? ' mt-note' : '');
    if (!note) this.setAttribute('aria-live', 'polite');
  }
  set(s: Status): void {
    if (this.status.kind === 'ask') this.status.answer(false);
    this.status = s;
    this.redraw();
  }
  /** the estimate inline → Promise<boolean> */
  ask(est: Estimate): Promise<boolean> {
    return new Promise(res => {
      let done = false;
      const answer = (go: boolean): void => {
        if (done) return;
        done = true;
        this.status = { kind: 'idle' };
        this.redraw();
        res(go);
      };
      this.set({ kind: 'ask', est, answer });
    });
  }
  override render(): TemplateResult | typeof nothing {
    const s = this.status;
    if (s.kind === 'busy') return html`⏳ ${this.t('mt.translating')}`;
    if (s.kind === 'hint') return html`${s.text}`;
    if (s.kind !== 'ask') return nothing;
    const e = s.est,
      cost = this.i18n.format.number(Math.max(e.usd, 0.01), {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    return html`<span class="mt-ask"
      ><span class="mt-estimate"
        >${this.t('mt.estimate', { n: e.texts, chars: e.chars, tiny: e.usd < 0.01 ? 'yes' : 'no', cost, provider: e.provider ?? '?' })}</span
      >
      <button
        class="btn small primary mt-go"
        type="button"
        @click=${(): void => {
          s.answer(true);
        }}
      >
        ${this.t('mt.confirm')}
      </button>
      <button
        class="btn small ghost mt-no"
        type="button"
        @click=${(): void => {
          s.answer(false);
        }}
      >
        ${this.t('mt.cancel')}
      </button></span
    >`;
  }
}

/** Translates marked nodes in place (consent, key, estimate for more than one new text, caps) → 'mt' | 'orig'. */
async function run(port: TranslationUiPort, acc: string | null, nodes: readonly Element[], status: NoemaMtStatus): Promise<'mt' | 'orig'> {
  const { mt, i18n } = port;
  status.set({ kind: 'idle' });
  const list = marked(nodes).filter(n => needs(mt, n));
  if (!list.length) return 'orig';
  if (!mt.enabled(acc) && !(await consent(port, acc))) return 'orig';
  const p = mt.provider(acc);
  if (!p) {
    status.set({ kind: 'hint', text: reasonText(i18n, mt.settings(acc), 'nokey', null) });
    return 'orig';
  }
  const items = list.map(n => itemOf(n)).filter(x => x !== null);
  const est = mt.estimate(items, { acc });
  if (est.texts > 1 && !(await status.ask(est))) return 'orig';
  status.set({ kind: 'busy' });
  const r = await mt.translate(items, { acc });
  let any = false,
    w: MtResult | null = null;
  for (const [i, x] of r.entries()) {
    const n = list[i];
    if (x.translated && n) {
      any = true;
      show(mt, i18n, n, x.text, x.provider ?? p.label);
    } else if (!w && x.reason && x.reason !== 'same') w = x;
  }
  status.set(w ? { kind: 'hint', text: reasonText(i18n, mt.settings(acc), w.reason, w.error) } : { kind: 'idle' });
  return any ? 'mt' : 'orig';
}

/** "🌐 Translate" / "Show original" for one item. */
export class NoemaMtToggle extends LightElement {
  static override properties = { on: { type: Boolean }, busy: { type: Boolean } };
  declare on: boolean;
  declare busy: boolean;
  readonly #port: TranslationUiPort;
  readonly #acc: string | null;
  readonly #nodes: readonly Element[];
  readonly #label: string | null;
  readonly #status: NoemaMtStatus;
  constructor(port: TranslationUiPort, acc: string | null, nodes: readonly Element[], label: string | null = null) {
    super(port.i18n);
    this.#port = port;
    this.#acc = acc;
    this.#nodes = nodes;
    this.#label = label;
    this.#status = new NoemaMtStatus(port.i18n);
    this.on = false;
    this.busy = false;
    this.className = 'mt-toggle';
  }
  async #click(e: Event): Promise<void> {
    e.stopPropagation();
    e.preventDefault();
    if (this.#nodes.some(isShown)) {
      this.#nodes.forEach(restore);
      this.#status.set({ kind: 'idle' });
      this.on = false;
      this.redraw();
      return;
    }
    this.busy = true;
    this.redraw();
    try {
      this.on = (await run(this.#port, this.#acc, this.#nodes, this.#status)) === 'mt';
    } finally {
      this.busy = false;
      this.redraw();
    }
  }
  override render(): TemplateResult {
    return html`<button
        class="btn small ghost mt-btn"
        type="button"
        aria-label=${this.#label ?? nothing}
        aria-pressed=${String(this.on)}
        ?disabled=${this.busy}
        @click=${(e: Event): void => void this.#click(e)}
        .textContent=${'🌐 ' + this.t(this.on ? 'mt.showOriginal' : 'mt.translate')}
      ></button
      >${this.#status}`;
  }
}

/** "🌐 Translate all" / "Show originals" for every marked text inside root (a list that may be redrawn): hidden while nothing
    inside needs a translation; a text drawn while it is on takes its cached translation. */
export class NoemaMtBar extends LightElement {
  static override properties = { on: { type: Boolean }, busy: { type: Boolean } };
  declare on: boolean;
  declare busy: boolean;
  readonly #port: TranslationUiPort;
  readonly #acc: string | null;
  readonly #root: ParentNode & Node;
  readonly #status: NoemaMtStatus;
  readonly #note: NoemaMtStatus;
  #provider = '';
  #watch: MutationObserver | null = null;
  constructor(port: TranslationUiPort, acc: string | null, root: ParentNode & Node) {
    super(port.i18n);
    this.#port = port;
    this.#acc = acc;
    this.#root = root;
    this.#status = new NoemaMtStatus(port.i18n);
    this.#note = new NoemaMtStatus(port.i18n, true);
    this.on = false;
    this.busy = false;
    this.className = 'mt-bar';
    this.hidden = true;
    const MO = (root.ownerDocument?.defaultView ?? globalThis).MutationObserver as typeof MutationObserver | undefined;
    if (MO) {
      this.#watch = new MO(() => {
        this.refresh();
      });
      this.#watch.observe(root, { childList: true, subtree: true });
    }
    queueMicrotask(() => {
      this.refresh();
    });
  }
  #nodes(): Element[] {
    return marked([...this.#root.querySelectorAll('[data-mt]')]);
  }
  /** shown while something needs a translation; while on, a new text takes its cached translation */
  refresh(): void {
    const { mt, i18n } = this.#port,
      all = this.#nodes();
    this.hidden = !all.some(n => needs(mt, n));
    if (!this.on) return;
    const to = mt.uiLocale();
    for (const n of all) {
      const it = itemOf(n);
      if (!it || isShown(n) || !needs(mt, n)) continue;
      const hit = mt.cache.get(this.#acc, it.text, to);
      if (hit != null) show(mt, i18n, n, hit, this.#provider);
    }
  }
  async #click(): Promise<void> {
    if (this.on) {
      this.#nodes().forEach(restore);
      this.on = false;
      this.#status.set({ kind: 'idle' });
      this.redraw();
      return;
    }
    this.busy = true;
    this.redraw();
    try {
      this.#provider = this.#port.mt.provider(this.#acc)?.label ?? '';
      this.on = (await run(this.#port, this.#acc, this.#nodes(), this.#status)) === 'mt';
    } finally {
      this.busy = false;
      this.redraw();
    }
  }
  override render(): TemplateResult {
    this.#note.set(this.on ? { kind: 'hint', text: this.t('mt.note', { provider: this.#provider || '…' }) } : { kind: 'idle' });
    return html`<button
        class="btn small ghost mt-all"
        type="button"
        aria-pressed=${String(this.on)}
        ?disabled=${this.busy}
        @click=${(): void => void this.#click()}
        .textContent=${'🌐 ' + this.t(this.on ? 'mt.showOriginals' : 'mt.translateAll')}
      ></button
      >${this.#status}${this.#note}`;
  }
}

/** ⚙️ The consent, the provider and (unless compact) the caps, today's use and the saved translations. */
export class NoemaMtPanel extends LightElement {
  readonly #mt: Translator;
  readonly #acc: string | null;
  readonly compact: boolean;
  readonly heading: boolean;
  #cleared = false;
  constructor(port: Pick<TranslationUiPort, 'mt' | 'i18n'>, acc: string | null, o: { compact?: boolean; heading?: boolean } = {}) {
    super(port.i18n);
    this.#mt = port.mt;
    this.#acc = acc;
    this.compact = !!o.compact;
    this.heading = o.heading !== false;
    this.className = this.compact ? 'mt-panel' : 'ns-panel ns-form mt-panel';
  }
  #put(patch: Partial<MtSettings>): void {
    this.#mt.setSettings(this.#acc, patch);
    this.redraw();
  }
  #num(k: 'dailyChars' | 'sessionRequests', min: number, label: string, s: MtSettings): TemplateResult {
    return html`<label class="mt-row"
      ><span>${label}</span
      ><input
        type="number"
        class=${'noema-input mt-' + k}
        min=${min}
        step=${k === 'dailyChars' ? 1000 : 1}
        .value=${String(s[k])}
        aria-label=${label}
        @change=${(e: Event): void => {
          const v = Math.round(Number((e.target as HTMLInputElement).value));
          this.#put({ [k]: Math.max(min, v || (k === 'dailyChars' ? 20000 : 30)) });
        }}
    /></label>`;
  }
  override render(): TemplateResult {
    const s = this.#mt.settings(this.#acc),
      p = this.#mt.provider(this.#acc);
    const opts: readonly (readonly [string, string])[] = [
      ['auto', this.t('mt.set.auto')],
      ['claude', this.t('mt.set.claude')],
      ['gemini', this.t('mt.set.gemini')],
    ];
    const head = html`<p class="tiny mt-consent">${this.t('mt.set.consent')}</p>
      <label class="row ns-check mt-row"
        ><input
          type="checkbox"
          class="mt-enable"
          .checked=${s.on}
          @change=${(e: Event): void => {
            this.#put({ on: (e.target as HTMLInputElement).checked });
          }}
        />${this.t('mt.set.enable')}</label
      >
      <label class="mt-row"
        ><span>${this.t('mt.set.provider')}</span
        ><select
          class="noema-input mt-provider"
          aria-label=${this.t('mt.set.provider')}
          @change=${(e: Event): void => {
            this.#put({ provider: (e.target as HTMLSelectElement).value as MtSettings['provider'] });
          }}
        >
          ${opts.map(([v, l]) => html`<option value=${v} ?selected=${s.provider === v}>${l}</option>`)}
        </select></label
      >
      <p class="tiny mt-using">${p ? this.t('mt.set.using', { provider: p.label }) : this.t('mt.hint.nokey')}</p>`;
    if (this.compact) return head;
    return html`${this.heading ? html`<span class="ns-label">🌐 ${this.t('mt.set.title')}</span>` : nothing}${head}
      ${this.#num('dailyChars', 500, this.t('mt.set.daily'), s)} ${this.#num('sessionRequests', 1, this.t('mt.set.session'), s)}
      <p class="tiny mt-used">${this.t('mt.set.usedToday', { used: this.#mt.usage.day(this.#acc), max: s.dailyChars })}</p>
      <div class="row mt-row">
        <button
          class="btn small mt-clear"
          type="button"
          ?disabled=${this.#cleared}
          @click=${(): void => {
            this.#mt.cache.clear(this.#acc);
            this.#cleared = true;
            this.redraw();
          }}
        >
          ${this.#cleared ? this.t('mt.set.cleared') : this.t('mt.set.clear', { n: this.#mt.cache.size(this.#acc) })}
        </button>
      </div>`;
  }
}

/** The consent dialog (the kit's modal dialog): → Promise<boolean> (turned on, or not). */
export function consent(port: TranslationUiPort, acc: string | null): Promise<boolean> {
  const doc = port.host().ownerDocument;
  return new Promise(res => {
    let turnedOn = false;
    const dlg = doc.createElement('noema-dialog') as HTMLElement & { heading: string; show(): void; close(v?: string): void };
    dlg.className = 'mt-modal';
    dlg.heading = '🌐 ' + port.i18n.t('mt.consent.title');
    const box = doc.createElement('div');
    box.className = 'mt-box';
    box.append(new NoemaMtPanel(port, acc, { compact: true }).redraw());
    const btn = (cls: string, text: string, onClick: () => void): HTMLButtonElement => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = cls;
      b.textContent = text;
      b.addEventListener('click', onClick);
      return b;
    };
    const row = doc.createElement('div');
    row.className = 'row mt-row';
    row.slot = 'actions';
    row.append(
      btn('btn primary mt-consent-yes', port.i18n.t('mt.consent.turnOn'), () => {
        port.mt.setSettings(acc, { on: true });
        turnedOn = true;
        dlg.close('ok');
      }),
      btn('btn small mt-consent-no', port.i18n.t('mt.cancel'), () => {
        dlg.close('dismiss');
      }),
    );
    dlg.append(box, row);
    dlg.addEventListener('noema-close', () => {
      dlg.remove();
      res(turnedOn);
    });
    port.host().append(dlg);
    void (dlg as unknown as { updateComplete: Promise<unknown> }).updateComplete.then(() => {
      dlg.show();
    });
  });
}

const TAGS: readonly (readonly [string, CustomElementConstructor])[] = [
  ['noema-mt-status', NoemaMtStatus],
  ['noema-mt-toggle', NoemaMtToggle],
  ['noema-mt-bar', NoemaMtBar],
  ['noema-mt-panel', NoemaMtPanel],
];
export function defineTranslationUi(registry: CustomElementRegistry | undefined = globalThis.customElements): void {
  for (const [tag, ctor] of TAGS) defineOnce(registry, tag, ctor);
}

/** The surface the older pages use (NoemaShell.mt): mark, toggle, bar, panel, consent. */
export interface TranslationUi {
  mark<T extends Element>(node: T, o?: MarkOptions): T;
  toggle(acc: string | null, nodes: Element | readonly Element[], o?: { label?: string }): HTMLElement | null;
  bar(acc: string | null, root: ParentNode & Node): HTMLElement;
  panel(acc?: string | null, o?: { compact?: boolean; heading?: boolean }): HTMLElement;
  consent(acc?: string | null): Promise<boolean>;
}

export function translationUi(port: TranslationUiPort): TranslationUi {
  const ready = (): void => {
    defineTranslationUi();
  };
  return Object.freeze({
    mark,
    toggle(acc: string | null, nodes: Element | readonly Element[], o: { label?: string } = {}): HTMLElement | null {
      const list = marked(Array.isArray(nodes) ? (nodes as readonly Element[]) : [nodes as Element]);
      if (!list.some(n => needs(port.mt, n))) return null;
      ready();
      return new NoemaMtToggle(port, acc, list, o.label ?? null).redraw();
    },
    bar(acc: string | null, root: ParentNode & Node): HTMLElement {
      ready();
      return new NoemaMtBar(port, acc, root).redraw();
    },
    panel(acc: string | null = null, o: { compact?: boolean; heading?: boolean } = {}): HTMLElement {
      ready();
      return new NoemaMtPanel(port, acc, o).redraw();
    },
    consent: (acc: string | null = null) => consent(port, acc),
  });
}
