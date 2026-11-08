/**
 * ⚙ #/engines: the engines of interactive activities and the requests for new ones (docs/INTERACTIVE_LIBRARY.md §2–§3).
 * The catalogue in the order an author should consider it: the library (general engines, grouped by field), the free way
 * (a mini-app, Python), the field plugins — only the engines this app has. "Request a new engine" opens a short form: what
 * should be simulated (required), then folded the field, what the learner changes and sees, what is measured, the accuracy
 * wanted, sources and examples; while the learner writes, the catalogue suggests what may already do it. "Your requests"
 * lists each with its status and answer; the app's admins see every request and answer it in place (status, the engine
 * that now does it, a note, the PR) — the same fields as the connector's noema_engine_request_update.
 *
 *   <noema-engines-page .port=${enginesPort} open-form></noema-engines-page>     (#/engines/new opens the form at once)
 */
import { html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import type { TimerHandle } from '../../../ports/clock.ts';
import { NoemaDialog } from '../../kit/dialog.ts';
import { NoemaScreen } from '../screen.ts';
import type { EngineEntry, EngineRequestRow, EnginesPort, RequestStore } from './engines-port.ts';

/** the library's engines by field (catalogue ids), in the order the page shows them */
export const ENGINE_GROUPS: readonly (readonly [string, readonly string[]])[] = [
  ['math', ['formula@1', 'ode@1', 'prob@1', 'graph@1', 'geom@1', 'logic@1', 'des@1', 'field@1']],
  ['life', ['genetics@1', 'seq@1', 'med@1', 'clinic@1', 'anatomy@1', 'agents@1']],
  ['arts', ['timeline@1', 'music@1', 'map@1', 'text@1', 'craft@1']],
  ['thought', ['rhetoric@1', 'philo@1', 'law@1']],
];
/** the request's fields in the form: the first two always shown, the rest folded */
const SHOWN = ['title', 'what'] as const;
const FOLDED = ['field', 'learner', 'measure'] as const;
const LAST = ['sources', 'examples'] as const;
const MULTI = new Set(['what', 'learner', 'measure', 'sources', 'examples']);

export class NoemaEnginesPage extends NoemaScreen {
  static override properties = {
    port: { attribute: false },
    openForm: { type: Boolean, attribute: 'open-form' },
    rows: { state: true },
    admin: { state: true },
    listFailed: { state: true },
  };
  declare port: EnginesPort | null;
  declare openForm: boolean;
  declare rows: readonly EngineRequestRow[];
  declare admin: boolean;
  declare listFailed: boolean;
  #store: RequestStore | null = null;

  constructor() {
    super();
    this.port = null;
    this.openForm = false;
    this.rows = [];
    this.admin = false;
    this.listFailed = false;
  }

  protected override firstUpdated(): void {
    if (!this.port?.available()) return;
    this.#store = this.port.store();
    void this.#start();
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('openForm') && this.openForm && this.port?.available())
      void this.updateComplete.then(() => {
        this.request();
      });
  }

  async #start(): Promise<void> {
    const s = this.#store;
    if (!s) return;
    this.admin = await s.isAdmin().catch(() => false);
    await this.refresh();
  }

  /** Reads the requests again (after a send, an answer). */
  async refresh(): Promise<void> {
    const s = this.#store;
    if (!s) return;
    try {
      this.rows = this.admin ? await s.all() : await s.mine();
      this.listFailed = false;
    } catch {
      this.listFailed = true; // the list cannot be read now (offline, signed out): the page says so, the catalogue stays
    }
  }

  #name(e: EngineEntry): string {
    return this.t(`engine.engines.${e.slug}.name`);
  }
  #what(e: EngineEntry): string {
    return this.t(`engine.engines.${e.slug}.what`);
  }

  #row(e: EngineEntry): TemplateResult {
    return html`<li class="eng-row" data-engine=${e.id} title=${this.#what(e)}>
      <b>${this.#name(e)}</b><code class="eng-id">${e.id}</code><span class="eng-what">${this.#what(e)}</span>
    </li>`;
  }

  #section(title: string, list: readonly EngineEntry[], note?: string): TemplateResult | typeof nothing {
    if (!list.length) return nothing;
    return html`<section class="eng-sec">
      <h3>${title}</h3>
      ${note ? html`<p class="tiny muted">${note}</p>` : nothing}
      <ul class="eng-list">
        ${list.map(e => this.#row(e))}
      </ul>
    </section>`;
  }

  override render(): TemplateResult {
    const P = this.port;
    if (!P?.available()) return html`<p>${this.t('engine.engines.unavailable')}</p>`;
    const have = P.engines(),
      byId = new Map(have.map(e => [e.id, e]));
    const groups = ENGINE_GROUPS.map(([g, ids]) =>
      this.#section(
        this.t('engine.engines.group.' + g),
        ids.map(id => byId.get(id)).filter((e): e is EngineEntry => !!e),
      ),
    );
    return html`<div class="eng-head">
        <h2>${this.t('engine.engines.title')}</h2>
        <button
          class="btn primary"
          type="button"
          data-act="request"
          @click=${() => {
            this.request();
          }}
        >
          ${this.t('engine.engines.request')}
        </button>
      </div>
      <p class="muted eng-intro">${this.t('engine.engines.intro')}</p>
      ${groups}
      ${this.#section(
        this.t('engine.engines.free'),
        have.filter(e => e.layer === 'free'),
        this.t('engine.engines.freeNote'),
      )}
      ${this.#section(
        this.t('engine.engines.plugins'),
        have.filter(e => e.layer === 'plugin'),
        this.t('engine.engines.pluginsNote'),
      )}
      <section class="eng-sec eng-mine">${this.#mine()}</section>`;
  }

  #mine(): TemplateResult | typeof nothing {
    if (this.listFailed) return html`<p class="tiny muted">${this.t('engine.engines.listFailed')}</p>`;
    if (!this.rows.length) return nothing;
    return html`<h3>${this.admin ? this.t('engine.engines.allRequests', { n: this.rows.length }) : this.t('engine.engines.mine')}</h3>
      ${this.#store?.kind === 'local' ? html`<p class="tiny muted">${this.t('engine.engines.localNote')}</p>` : nothing}
      <ul class="eng-reqs">
        ${this.rows.map(r => this.#request(r))}
      </ul>`;
  }

  #request(r: EngineRequestRow): TemplateResult {
    const P = this.port;
    if (!P) return html``;
    const status = P.statuses.includes(r.status) ? r.status : 'new';
    const short = r.id.slice(0, 8);
    return html`<li class="eng-req" data-req=${r.id}>
      <div class="eng-req-h">
        <b>${r.title}</b><span class=${'pill eng-st eng-st-' + r.status}>${this.t('engine.engines.status.' + status)}</span>
        <span class="tiny muted">${(r.created_at ?? '').slice(0, 10)}</span>
      </div>
      ${r.engine_id ? html`<p class="tiny">${this.t('engine.engines.doneBy', { id: r.engine_id })}</p>` : nothing}
      ${r.answer ? html`<p class="tiny eng-answer">${r.answer}</p>` : nothing} ${this.admin ? this.#answer(r) : nothing}
      <div class="row eng-req-tools">
        <button
          class="btn ghost small"
          type="button"
          @click=${async () => {
            const text = P.brief(r);
            if (await P.copy(text)) P.toast(this.t('engine.engines.copied'));
            else P.download(`engine-request-${short}.md`, text, 'text/markdown');
          }}
        >
          ${this.t('engine.engines.copyBrief')}
        </button>
        ${
          this.#store?.kind === 'local'
            ? html`<button
                class="btn ghost small"
                type="button"
                @click=${() => {
                  P.download(`engine-request-${short}.json`, JSON.stringify(r, null, 1), 'application/json');
                }}
              >
                ${this.t('engine.engines.download')}
              </button>`
            : nothing
        }
      </div>
    </li>`;
  }

  /** an admin's answer, in place (the same fields as noema_engine_request_update) */
  #answer(r: EngineRequestRow): TemplateResult {
    const P = this.port;
    if (!P) return html``;
    const save = async (e: Event): Promise<void> => {
      const box = (e.currentTarget as HTMLElement).closest('.eng-admin');
      const v = (sel: string): string => (box?.querySelector<HTMLInputElement | HTMLSelectElement>(sel)?.value ?? '').trim();
      const p = P.cleanPatch({
        status: v('select'),
        engine_id: v('[data-f=engine_id]'),
        answer: v('[data-f=answer]'),
        fixed_in: v('[data-f=fixed_in]'),
      });
      if ('error' in p && typeof p.error === 'string') {
        P.toast('⚠️ ' + p.error, 4000);
        return;
      }
      try {
        await this.#store?.update(r.id, p);
        P.toast('✓ ' + this.t('engine.engines.saved'));
        await this.refresh();
      } catch (er) {
        P.toast('⚠️ ' + P.errorText(er), 4000);
      }
    };
    const answerLabel = this.t('engine.engines.answerLabel'),
      fixedLabel = this.t('engine.engines.fixedInLabel');
    return html`<details class="eng-admin">
      <summary>${this.t('engine.engines.answer')}</summary>
      <p class="tiny">${r.what ?? ''}</p>
      <div class="row">
        <select class="sim-sel" aria-label=${this.t('engine.engines.statusLabel')} .value=${r.status}>
          ${P.statuses.map(s => html`<option value=${s} ?selected=${s === r.status}>${this.t('engine.engines.status.' + s)}</option>`)}
        </select>
        <input
          type="text"
          data-f="engine_id"
          .value=${r.engine_id ?? ''}
          placeholder="chem@1"
          aria-label=${this.t('engine.engines.engineIdLabel')}
          size="10"
        />
        <input type="text" data-f="fixed_in" .value=${r.fixed_in ?? ''} aria-label=${fixedLabel} placeholder=${fixedLabel} size="14" />
      </div>
      <input type="text" data-f="answer" .value=${r.answer ?? ''} aria-label=${answerLabel} placeholder=${answerLabel} />
      <div class="row">
        <button class="btn small" type="button" @click=${save}>${this.t('engine.engines.save')}</button>
      </div>
    </details>`;
  }

  /** Opens the request form (a dialog). */
  request(): void {
    const P = this.port,
      store = this.#store;
    if (!P || !store) return;
    const doc = this.ownerDocument;
    const dlg = doc.createElement('noema-dialog');
    if (!(dlg instanceof NoemaDialog)) return;
    dlg.heading = this.t('engine.engines.request');
    dlg.classList.add('eng-dialog');
    const form = doc.createElement('noema-engine-request-form');
    if (!(form instanceof NoemaEngineRequestForm)) return;
    form.port = P;
    form.onSent = async () => {
      dlg.close('sent');
      P.toast('✓ ' + this.t(store.kind === 'local' ? 'engine.engines.sentLocal' : 'engine.engines.sent'), 4000);
      await this.refresh();
    };
    form.onCancel = () => {
      dlg.close('cancel');
    };
    form.store = store;
    dlg.append(form);
    this.openDialog(dlg, () => {
      void form.updateComplete.then(() => form.querySelector<HTMLInputElement>('#engreq-title')?.focus());
    });
  }
}

/** The request form inside the dialog: one required field first, the rest folded; the catalogue's suggestions as one writes. */
export class NoemaEngineRequestForm extends NoemaScreen {
  static override properties = {
    port: { attribute: false },
    store: { attribute: false },
    suggestions: { state: true },
    problem: { state: true },
    sending: { state: true },
  };
  declare port: EnginesPort | null;
  declare store: RequestStore | null;
  declare suggestions: readonly EngineEntry[];
  declare problem: string;
  declare sending: boolean;
  onSent: () => void | Promise<void> = () => undefined;
  onCancel: () => void = () => undefined;
  #timer: TimerHandle | null = null;

  constructor() {
    super();
    this.port = null;
    this.store = null;
    this.suggestions = [];
    this.problem = '';
    this.sending = false;
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.#timer) this.services.clock.clearTimeout(this.#timer);
  }

  #value(k: string): string {
    return this.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[data-f="${k}"]`)?.value ?? '';
  }

  #suggest = (): void => {
    const clock = this.services.clock;
    if (this.#timer) clock.clearTimeout(this.#timer);
    this.#timer = clock.setTimeout(() => {
      const P = this.port;
      if (!P) return;
      this.suggestions = P.suggest(['title', 'what', 'field', 'learner'].map(k => this.#value(k)).join(' ')).slice(0, 3);
    }, 250);
  };

  #field(k: string, rows?: number): TemplateResult {
    const id = 'engreq-' + k,
      max = this.port?.fields[k]?.max ?? 4000,
      watch = ['title', 'what', 'field', 'learner'].includes(k) ? this.#suggest : undefined;
    return html`<label class="eng-f" for=${id}
      ><span>${this.t('engine.engines.f.' + k)}</span>${
        MULTI.has(k)
          ? html`<textarea id=${id} rows=${rows ?? 3} maxlength=${max} data-f=${k} @input=${watch}></textarea>`
          : html`<input id=${id} type="text" maxlength=${max} data-f=${k} @input=${watch} />`
      }</label
    >`;
  }

  async #send(): Promise<void> {
    const P = this.port,
      store = this.store;
    if (!P || !store) return;
    const input: Record<string, string> = {};
    for (const k of Object.keys(P.fields)) input[k] = this.#value(k);
    input['accuracy'] = this.#value('accuracy');
    const { row, problems } = P.normalize(input);
    const first = problems[0];
    if (first) {
      const f = P.fields[first.field];
      this.problem = this.t('engine.engines.err.' + first.code, {
        field: this.t('engine.engines.f.' + first.field),
        min: f?.min ?? 0,
        max: f?.max ?? 0,
      });
      this.querySelector<HTMLElement>(`[data-f="${first.field}"]`)?.focus();
      return;
    }
    this.sending = true;
    try {
      await store.submit(row);
      await this.onSent();
    } catch (e) {
      this.sending = false;
      this.problem = P.errorText(e);
    }
  }

  override render(): TemplateResult {
    const P = this.port;
    if (!P) return html``;
    return html`<p class="tiny muted">${this.t('engine.engines.requestIntro')}</p>
      ${SHOWN.map(k => this.#field(k, k === 'what' ? 5 : undefined))}
      <div class="eng-sug" aria-live="polite">
        ${
          this.suggestions.length
            ? html`<p class="tiny">${this.t('engine.engines.maybe')}</p>
                <ul class="eng-list">
                  ${this.suggestions.map(
                    e =>
                      html`<li class="eng-row" data-engine=${e.id} title=${this.t(`engine.engines.${e.slug}.what`)}>
                        <b>${this.t(`engine.engines.${e.slug}.name`)}</b><code class="eng-id">${e.id}</code
                        ><span class="eng-what">${this.t(`engine.engines.${e.slug}.what`)}</span>
                      </li>`,
                  )}
                </ul>`
            : nothing
        }
      </div>
      <details class="eng-more">
        <summary>${this.t('engine.engines.more')}</summary>
        ${FOLDED.map(k => this.#field(k))}
        <label class="eng-f" for="engreq-accuracy"
          ><span>${this.t('engine.engines.f.accuracy')}</span>
          <select id="engreq-accuracy" data-f="accuracy">
            ${P.accuracy.map(a => html`<option value=${a}>${this.t('engine.engines.acc.' + a)}</option>`)}
          </select></label
        >
        ${LAST.map(k => this.#field(k))}
      </details>
      <p class="tiny bad" aria-live="assertive">${this.problem}</p>
      <div class="row eng-foot">
        <button
          class="btn"
          type="button"
          @click=${() => {
            this.onCancel();
          }}
        >
          ${this.t('engine.core.cancel')}
        </button>
        <button class="btn primary" type="button" data-act="send" ?disabled=${this.sending} @click=${() => void this.#send()}>
          ${this.t('engine.engines.send')}
        </button>
      </div>`;
  }
}
