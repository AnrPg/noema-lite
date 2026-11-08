/**
 * ⚙ #/engines — the engines of interactive activities and requests for new ones (docs/INTERACTIVE_LIBRARY.md §2–§3).
 * The catalogue in the order an author should consider it: the library (general engines, grouped by field), the free way
 * (a mini-app, Python), the field plugins — only the engines this app runs. "Request a new engine" opens a short form:
 * what should be simulated (required), the field, what the learner changes and sees, what is measured, the accuracy
 * wanted, sources and examples (folded); while the learner writes, the catalogue suggests what may already do it.
 * "Your requests" shows each with its status and answer; the app's admins see every request and answer it here.
 */
import { html, nothing, type TemplateResult } from 'lit';
import type { EngineRequestRow } from '../../../ports/reports.ts';
import type { CatalogApi, CatalogEntry } from '../../../engines/types.ts';
import { openDialog } from '../../community/ui/dialogs.ts';
import { copyText, download } from '../../community/ui/format.ts';
import type { ScreenChrome } from '../../community/ui/host.ts';
import { CommunityScreen, type ScreenBase } from '../../community/ui/screen.ts';
import { adopt, COMMON } from '../../community/ui/styles.ts';
import type { EngineRequestService, EngineRequestStore } from '../application/engine-requests.ts';
import {
  ACCURACY,
  cleanRequestPatch,
  REQUEST_FIELDS,
  REQUEST_STATUSES,
  requestBrief,
  type RequestFieldName,
} from '../domain/engine-requests.ts';
import { ENGINES_CSS } from './styles.ts';

export interface EnginesDeps extends ScreenBase {
  readonly requests: EngineRequestService;
  readonly catalog: () => CatalogApi | null;
  /** an engine (or runtime) of the catalogue this app runs (the engine's activity core decides) */
  readonly engineHere: (e: CatalogEntry) => boolean;
  /** the subject open now (the request names it) */
  readonly subjectId: () => string | null;
  /** where ← goes (the subject's home) */
  readonly back: string;
}

const FORM: readonly RequestFieldName[] = ['title', 'what', 'field', 'learner', 'measure', 'sources', 'examples'];
const MULTI: ReadonlySet<string> = new Set(['what', 'learner', 'measure', 'sources', 'examples']);
const s = (x: unknown): string => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '');

export class NoemaEnginesPage extends CommunityScreen<EnginesDeps> {
  static override properties = { ...CommunityScreen.properties, sub: { type: String } };
  declare sub: string;
  #store: EngineRequestStore | null = null;
  #admin = false;
  #rows: readonly EngineRequestRow[] | null = null;
  #failed = false;

  constructor() {
    super();
    this.sub = '';
  }
  #T(k: string, p?: Record<string, string | number>): string {
    return this.t('engine.engines.' + k, p);
  }
  protected override chrome(): ScreenChrome {
    return { tab: 'learn', crumbs: [{ label: this.#T('title') }], back: this.deps.back };
  }
  override connectedCallback(): void {
    super.connectedCallback();
    adopt(this.ownerDocument, 'engines', COMMON, ENGINES_CSS);
    const a = this.host.account();
    this.#store = this.deps.requests.store(a ? { kind: a.kind, id: a.id } : null);
    void this.#start();
  }
  async #start(): Promise<void> {
    const st = this.#store;
    if (!st) return;
    const r = await st.isAdmin();
    this.#admin = r.ok && r.value;
    await this.#loadMine();
    if (this.sub === 'new') this.#request();
  }
  async #loadMine(): Promise<void> {
    const st = this.#store;
    if (!st) return;
    const r = this.#admin ? await st.all('all') : await st.mine();
    this.#failed = !r.ok;
    this.#rows = r.ok ? r.value : null;
    this.requestUpdate();
  }

  #have(): CatalogEntry[] {
    return (this.deps.catalog()?.CATALOG ?? []).filter(e => this.deps.engineHere(e));
  }
  #row(e: CatalogEntry): TemplateResult {
    const what = this.#T(e.slug + '.what');
    return html`<li class="eng-row" data-engine=${e.id} title=${what}>
      <b>${this.#T(e.slug + '.name')}</b><code class="eng-id">${e.id}</code><span class="eng-what">${what}</span>
    </li>`;
  }
  #sec(title: string, list: readonly CatalogEntry[], note?: string): TemplateResult | typeof nothing {
    return list.length
      ? html`<section class="eng-sec">
          <h3>${title}</h3>
          ${note ? html`<p class="nc-tiny nc-muted">${note}</p>` : nothing}
          <ul class="eng-list">
            ${list.map(e => this.#row(e))}
          </ul>
        </section>`
      : nothing;
  }

  /** the request form: one required field first, the rest folded; the catalogue's suggestions as the learner writes */
  #request(): void {
    const K = this.deps.catalog(),
      st = this.#store;
    if (!K || !st) return;
    const v: Record<string, string> = { accuracy: ACCURACY[0] };
    let err = '',
      sug: CatalogEntry[] = [],
      timer: ReturnType<typeof setTimeout> | undefined,
      sending = false;
    const field = (k: RequestFieldName, rows = 3): TemplateResult => {
      const id = 'engreq-' + k,
        lim = REQUEST_FIELDS[k].max;
      const onInput = (e: Event): void => {
        v[k] = (e.target as HTMLInputElement).value;
        if (['title', 'what', 'field', 'learner'].includes(k)) suggest();
      };
      return html`<label class="eng-f" for=${id}
        ><span>${this.#T('f.' + k)}</span>
        ${
          MULTI.has(k)
            ? html`<textarea class="nc-input" id=${id} rows=${rows} maxlength=${lim} data-f=${k} @input=${onInput}></textarea>`
            : html`<input class="nc-input" id=${id} type="text" maxlength=${lim} data-f=${k} @input=${onInput} />`
        }
      </label>`;
    };
    const suggest = (): void => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        sug = K.suggest([v['title'], v['what'], v['field'], v['learner']].join(' '))
          .map(x => K.byId(x.id))
          .filter((e): e is CatalogEntry => !!e && this.deps.engineHere(e))
          .slice(0, 3);
        d.redraw();
      }, 250);
    };
    const send = async (): Promise<void> => {
      const input = Object.fromEntries(FORM.map(k => [k, v[k] ?? '']));
      const { row, problems } = this.deps.requests.normalize({
        ...input,
        accuracy: v['accuracy'],
        subject: this.deps.subjectId(),
        via: 'app',
        locale: this.i18n.locale(),
      });
      const p = problems[0];
      if (p) {
        const f = REQUEST_FIELDS[p.field as RequestFieldName] as (typeof REQUEST_FIELDS)[RequestFieldName] | undefined;
        err = this.#T('err.' + p.code, { field: this.#T('f.' + p.field), min: f?.min ?? 0, max: f?.max ?? 0 });
        d.redraw();
        d.el.querySelector<HTMLElement>('#engreq-' + p.field)?.focus();
        return;
      }
      sending = true;
      d.redraw();
      const r = await st.submit(row);
      sending = false;
      if (!r.ok) {
        err = this.i18n.err(r.error);
        d.redraw();
        return;
      }
      d.close();
      this.toast(this.#T(st.kind === 'local' ? 'sentLocal' : 'sent'), 4000);
      void this.#loadMine();
    };
    const d = openDialog(this.deps, {
      heading: this.#T('request'),
      cls: 'eng-dlg',
      wide: true,
      render: close =>
        html`<p class="nc-tiny nc-muted">${this.#T('requestIntro')}</p>
          ${field('title')} ${field('what', 5)}
          <div class="eng-sug" aria-live="polite">
            ${
              sug.length
                ? html`<p class="nc-tiny">${this.#T('maybe')}</p>
                    <ul class="eng-list">
                      ${sug.map(e => this.#row(e))}
                    </ul>`
                : nothing
            }
          </div>
          <details class="eng-more">
            <summary>${this.#T('more')}</summary>
            ${field('field')} ${field('learner')} ${field('measure')}
            <label class="eng-f" for="engreq-accuracy"
              ><span>${this.#T('f.accuracy')}</span>
              <select
                class="nc-input"
                id="engreq-accuracy"
                data-f="accuracy"
                @change=${(e: Event) => {
                  v['accuracy'] = (e.target as HTMLSelectElement).value;
                }}
              >
                ${ACCURACY.map(a => html`<option value=${a}>${this.#T('acc.' + a)}</option>`)}
              </select></label
            >
            ${field('sources')} ${field('examples')}
          </details>
          <p class="nc-err eng-err" aria-live="assertive">${err}</p>
          <noema-button slot="actions" variant="quiet" @click=${() => close()}>${this.t('engine.core.cancel')}</noema-button>
          <noema-button slot="actions" variant="primary" data-act="send" ?disabled=${sending} @click=${() => void send()}
            >${this.#T('send')}</noema-button
          >`,
    });
    void d.el.updateComplete.then(() => {
      globalThis.setTimeout(() => d.el.querySelector<HTMLElement>('#engreq-title')?.focus(), 30);
    });
  }

  #req(r: EngineRequestRow): TemplateResult {
    const st = this.#store;
    const status = REQUEST_STATUSES.includes(s(r.status) as never) ? s(r.status) : 'new';
    const brief = async (): Promise<void> => {
      const t = requestBrief(r);
      if (await copyText(t)) this.toast(this.#T('copied'));
      else download(new Blob([t], { type: 'text/markdown' }), `engine-request-${s(r.id).slice(0, 8)}.md`);
    };
    let sel = status,
      eid = s(r.engine_id),
      note = s(r.answer),
      pr = s(r.fixed_in);
    const save = (e: Event): void => {
      void this.busy(e.currentTarget, async () => {
        const p = cleanRequestPatch({ status: sel, engine_id: eid, answer: note, fixed_in: pr });
        if ('error' in p) {
          this.toast(p.error, 4000);
          return;
        }
        if (st) this.need(await st.update(s(r.id), p));
        this.toast(this.#T('saved'));
        await this.#loadMine();
      });
    };
    return html`<li class="eng-req" data-req=${s(r.id)}>
      <div class="eng-req-h">
        <b>${s(r.title)}</b><span class="nc-pill eng-st eng-st-${status}">${this.#T('status.' + status)}</span
        ><span class="nc-tiny nc-muted">${s(r.created_at).slice(0, 10)}</span>
      </div>
      ${r.engine_id ? html`<p class="nc-tiny">${this.#T('doneBy', { id: s(r.engine_id) })}</p>` : nothing}
      ${r.answer ? html`<p class="nc-tiny eng-answer">${s(r.answer)}</p>` : nothing}
      ${
        this.#admin
          ? html`<details class="eng-admin">
              <summary>${this.#T('answer')}</summary>
              <p class="nc-tiny">${s(r.what)}</p>
              <div class="nc-row">
                <select
                  class="nc-input"
                  aria-label=${this.#T('statusLabel')}
                  @change=${(e: Event) => {
                    sel = (e.target as HTMLSelectElement).value;
                  }}
                >
                  ${REQUEST_STATUSES.map(x => html`<option value=${x} ?selected=${x === status}>${this.#T('status.' + x)}</option>`)}
                </select>
                <input
                  class="nc-input"
                  type="text"
                  .value=${eid}
                  placeholder="chem@1"
                  aria-label=${this.#T('engineIdLabel')}
                  @input=${(e: Event) => {
                    eid = (e.target as HTMLInputElement).value;
                  }}
                />
                <input
                  class="nc-input"
                  type="text"
                  .value=${pr}
                  placeholder=${this.#T('fixedInLabel')}
                  aria-label=${this.#T('fixedInLabel')}
                  @input=${(e: Event) => {
                    pr = (e.target as HTMLInputElement).value;
                  }}
                />
              </div>
              <input
                class="nc-input"
                type="text"
                .value=${note}
                placeholder=${this.#T('answerLabel')}
                aria-label=${this.#T('answerLabel')}
                @input=${(e: Event) => {
                  note = (e.target as HTMLInputElement).value;
                }}
              />
              <div class="nc-row"><noema-button size="sm" @click=${save}>${this.#T('save')}</noema-button></div>
            </details>`
          : nothing
      }
      <div class="nc-row eng-req-tools">
        <noema-button size="sm" variant="quiet" @click=${() => void brief()}>${this.#T('copyBrief')}</noema-button>
        ${
          st?.kind === 'local'
            ? html`<noema-button
                size="sm"
                variant="quiet"
                @click=${() => {
                  download(
                    new Blob([JSON.stringify(r, null, 1)], { type: 'application/json' }),
                    `engine-request-${s(r.id).slice(0, 8)}.json`,
                  );
                }}
                >${this.#T('download')}</noema-button
              >`
            : nothing
        }
      </div>
    </li>`;
  }

  override render(): TemplateResult {
    const K = this.deps.catalog();
    if (!K) return html`<div class="nc eng-page"><p>${this.#T('unavailable')}</p></div>`;
    const have = this.#have(),
      byId = (id: string): CatalogEntry | undefined => have.find(e => e.id === id);
    const rows = this.#rows;
    return html`<div class="nc eng-page">
      <div class="eng-head">
        <h2>${this.#T('title')}</h2>
        <noema-button variant="primary" data-act="request" @click=${() => this.#request()}>${this.#T('request')}</noema-button>
      </div>
      <p class="nc-muted eng-intro">${this.#T('intro')}</p>
      ${K.GROUPS.map(([g, ids]) =>
        this.#sec(
          this.#T('group.' + g),
          ids.map(byId).filter((e): e is CatalogEntry => !!e),
        ),
      )}
      ${this.#sec(
        this.#T('free'),
        have.filter(e => e.layer === 'free'),
        this.#T('freeNote'),
      )}
      ${this.#sec(
        this.#T('plugins'),
        have.filter(e => e.layer === 'plugin'),
        this.#T('pluginsNote'),
      )}
      <section class="eng-sec eng-mine">
        ${
          this.#failed
            ? html`<p class="nc-tiny nc-muted">${this.#T('listFailed')}</p>`
            : rows?.length
              ? html`<h3>${this.#admin ? this.#T('allRequests', { n: rows.length }) : this.#T('mine')}</h3>
                  ${this.#store?.kind === 'local' ? html`<p class="nc-tiny nc-muted">${this.#T('localNote')}</p>` : nothing}
                  <ul class="eng-reqs">
                    ${rows.map(r => this.#req(r))}
                  </ul>`
              : nothing
        }
      </section>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'noema-engines-page': NoemaEnginesPage;
  }
}
