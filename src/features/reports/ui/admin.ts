/**
 * #/admin/reports[/<id>] — the app's admins (noema_admins) review the ⚑ reports (docs/REPORTS.md §4): the list by
 * status (open, new, fixed, all), a report with its screenshot, the learner's words and the exact place, "Copy the brief
 * for Claude", the JSON, and the answer (status, a note, where it was fixed). Opening a new one marks it seen.
 */
import { html, nothing, type TemplateResult } from 'lit';
import type { ReportRow } from '../../../ports/reports.ts';
import { icon } from '../../../ui/kit/icons.ts';
import { ask } from '../../community/ui/dialogs.ts';
import { copyText, download, pill } from '../../community/ui/format.ts';
import type { ScreenChrome } from '../../community/ui/host.ts';
import { CommunityScreen } from '../../community/ui/screen.ts';
import { adopt, COMMON } from '../../community/ui/styles.ts';
import { reportBrief, REPORT_STATUSES } from '../domain/report.ts';
import { clip } from './locate.ts';
import { cloudOn, type ReportDeps } from './dialog.ts';
import { POINT_CSS, REPORT_CSS } from './styles.ts';

const TONE: Readonly<Record<string, number>> = { new: 5, seen: 3, fixing: 4, fixed: 2, wontfix: 1, duplicate: 1 };
const FILTERS = ['open', 'new', 'fixed', 'all'] as const;

type Loaded =
  | { readonly state: 'wait' }
  | { readonly state: 'refused' }
  | { readonly state: 'error'; readonly text: string }
  | { readonly state: 'list'; readonly rows: readonly ReportRow[] }
  | { readonly state: 'one'; readonly row: ReportRow | null };

const s = (x: unknown): string => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '');
const o = (x: unknown): Record<string, unknown> => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});

export class NoemaReportAdmin extends CommunityScreen<ReportDeps> {
  static override properties = { ...CommunityScreen.properties, reportId: { type: String } };
  declare reportId: string;
  #got: Loaded = { state: 'wait' };

  constructor() {
    super();
    this.reportId = '';
  }
  #T(k: string, p?: Record<string, string | number>): string {
    return this.t('report.' + k, p);
  }
  #filter(): string {
    return /[?&]f=(\w+)/.exec(this.host.hash())?.[1] ?? 'open';
  }
  override connectedCallback(): void {
    super.connectedCallback();
    adopt(this.ownerDocument, 'report', COMMON, REPORT_CSS, POINT_CSS);
    void this.#load();
  }
  protected override chrome(): ScreenChrome {
    const id = this.reportId;
    return {
      tab: null,
      crumbs: [{ label: this.#T('adminTitle'), ...(id ? { href: '#/admin/reports' } : {}) }, ...(id ? [{ label: id.slice(0, 8) }] : [])],
      back: id ? '#/admin/reports' : '#/',
    };
  }
  async #load(): Promise<void> {
    const R = this.deps.reports;
    const set = (g: Loaded): void => {
      this.#got = g;
      this.requestUpdate();
    };
    const admin = cloudOn(this.deps) ? await R.isAdmin() : { ok: true as const, value: false };
    if (!admin.ok) return set({ state: 'error', text: this.i18n.err(admin.error) });
    if (!admin.value) return set({ state: 'refused' });
    if (!this.reportId) {
      const r = await R.list(this.#filter());
      return set(r.ok ? { state: 'list', rows: r.value } : { state: 'error', text: this.i18n.err(r.error) });
    }
    const r = await R.one(this.reportId);
    if (!r.ok) return set({ state: 'error', text: this.i18n.err(r.error) });
    const row = r.value;
    if (row?.status === 'new' && row.id) {
      void R.save(row.id, { status: 'seen' }); // opening it is seeing it (a refusal here changes nothing the admin does)
      return set({ state: 'one', row: { ...row, status: 'seen' } });
    }
    set({ state: 'one', row });
  }

  #pills(r: ReportRow): TemplateResult {
    return html`<span class="nr-pills"
      >${pill(this.#T('st_' + s(r.status)), TONE[s(r.status)] ?? 1)} ${pill(this.#T('kind_' + s(r.kind)), 6)}</span
    >`;
  }
  #when(t: unknown): string {
    const d = new Date(s(t));
    return Number.isNaN(d.getTime()) ? s(t) : this.i18n.format.date(d, { dateStyle: 'medium', timeStyle: 'short' });
  }

  #list(rows: readonly ReportRow[]): TemplateResult {
    const f = this.#filter();
    return html`<h1>${this.#T('adminTitle')}</h1>
      <div class="nr-bar">
        <div class="nc-seg nr-filter" role="tablist">
          ${FILTERS.map(
            x =>
              html`<button
                type="button"
                role="tab"
                class=${x === f ? 'on' : ''}
                aria-selected=${String(x === f)}
                data-f=${x}
                @click=${() => this.host.go('#/admin/reports?f=' + x)}
              >
                ${this.#T('f_' + x)}
              </button>`,
          )}
        </div>
        <span class="nc-muted">${this.#T('count', { n: rows.length })}</span>
      </div>
      ${
        rows.length
          ? html`<div class="nr-list">
              ${rows.map(
                r =>
                  html`<button
                    type="button"
                    class="nr-item"
                    data-id=${s(r.id)}
                    @click=${() => this.host.go('#/admin/reports/' + encodeURIComponent(s(r.id)))}
                  >
                    ${this.#pills(r)}
                    <span class="t"
                      ><b dir="auto">${clip(r.note, 140) || this.#T('noNote')}</b
                      ><small dir="auto">${[r.subject, r.item, r.route].filter(Boolean).join(' · ')}</small></span
                    >
                    <small class="nr-who"
                      >${this.#T('from', { name: r.reporter_name || s(r['reporter_email']) || '?', when: this.#when(r.created_at) })}</small
                    >
                  </button>`,
              )}
            </div>`
          : html`<div class="nc-panel nc-empty"><p>${this.#T('empty')}</p></div>`
      }`;
  }

  #one(r: ReportRow): TemplateResult {
    const L = o(r.locator),
      it = o(L['item']),
      tg = o(L['target']),
      sub = o(L['subject']),
      app = o(L['app']),
      ui = o(L['ui']);
    const kv = (k: string, v: unknown): TemplateResult | typeof nothing =>
      v == null || v === ''
        ? nothing
        : html`<tr>
            <th>${this.#T(k)}</th>
            <td dir="auto">${v}</td>
          </tr>`;
    const code = (x: string): TemplateResult => html`<code>${x}</code>`;
    const idt = (x: unknown, ...more: unknown[]): string | null => (x ? [s(o(x)['id'] ?? o(x)['key']), ...more.map(s)].join(' · ') : null);
    const ch = o(it['chapter']),
      sec = o(it['section']),
      blk = o(it['block']),
      ex = o(it['exercise']),
      cd = o(it['card']),
      dr = o(it['drill']),
      tr = o(it['trap']),
      fl = o(it['field']);
    const vp = o(ui['viewport']);
    const i18n = Array.isArray(tg['i18n']) ? (tg['i18n'] as Record<string, unknown>[]) : [];
    const errs = Array.isArray(L['errors']) ? (L['errors'] as Record<string, unknown>[]) : [];
    const route = s(r.route);
    const copy = async (): Promise<void> => {
      const t = reportBrief(r);
      if (await copyText(t)) this.toast(this.#T('copied'), 4000);
      else download(new Blob([t], { type: 'text/markdown;charset=utf-8' }), `report-${s(r.id)}.md`);
    };
    let status = s(r.status),
      note = s(r.admin_note),
      fixed = s(r.fixed_in);
    const save = (e: Event): void => {
      const id = s(r.id);
      void this.busy(e.currentTarget, async () => {
        this.need(await this.deps.reports.save(id, { status, admin_note: note.trim() || null, fixed_in: fixed.trim() || null }));
        this.toast(this.#T('saved'));
        this.host.go('#/admin/reports');
      });
    };
    const remove = async (): Promise<void> => {
      if (!(await ask(this.deps, { text: this.#T('deleteQ'), ok: this.#T('delete'), cancel: this.#T('cancel'), danger: true }))) return;
      const done = await this.deps.reports.remove(s(r.id));
      if (!done.ok) this.fail(done.error);
      this.host.go('#/admin/reports');
    };
    const lang = o(L['lang']);
    return html`<div class="nr-dhead">
        ${this.#pills(r)}
        <small class="nc-muted"
          >${this.#T('from', { name: [r.reporter_name, s(r['reporter_email'])].filter(Boolean).join(' · ') || '?', when: this.#when(r.created_at) })}</small
        >
      </div>
      <blockquote class="nr-quote" dir="auto">${r.note || this.#T('noNote')}</blockquote>
      ${
        r.shot
          ? html`<a class="nr-bigshot" href=${r.shot} target="_blank" rel="noopener"><img src=${r.shot} alt=${this.#T('shotAlt')} /></a>`
          : html`<p class="nc-muted">${this.#T('noShotSent')}</p>`
      }
      <div class="nr-actions start">
        <noema-button class="nr-copy" variant="primary" @click=${() => void copy()}
          >${icon('copy')}<span>${this.#T('copyBrief')}</span></noema-button
        >
        <noema-button
          @click=${() => {
            download(new Blob([JSON.stringify(r, null, 1)], { type: 'application/json' }), `report-${s(r.id)}.json`);
          }}
          >${this.#T('json')}</noema-button
        >
      </div>
      <h2>${this.#T('where')}</h2>
      <table class="nr-where">
        <tbody>
          ${kv('w_item', code(s(r.item) || '—'))}
          ${kv(
            'w_route',
            route
              ? html`<span>${code(route)} <a href=${s(app['url']) + route} target="_blank" rel="noopener">${this.#T('openHere')}</a></span>`
              : null,
          )}
          ${kv('w_subject', L['subject'] ? `${s(sub['id'])} · ${s(sub['title'])} · ${s(sub['origin']) || '?'} · v ${s(sub['version']) || '?'}` : null)}
          ${kv(
            'w_content',
            L['subject']
              ? `${s(sub['shown'])}${sub['translation'] ? ' ← ' + s(sub['packLanguage']) : ''}${sub['bridge'] ? ' · 文A ' + s(sub['bridge']) : ''}`
              : null,
          )}
          ${kv('w_chapter', idt(it['chapter'], ch['title']))} ${kv('w_section', idt(it['section'], sec['title']))}
          ${kv('w_block', idt(it['block'], blk['t'], blk['text']))}
          ${kv('w_exercise', idt(it['exercise'], ex['type'], ex['q'] ?? ex['note']))} ${kv('w_card', idt(it['card'], cd['q']))}
          ${kv('w_drill', idt(it['drill'], dr['title']))} ${kv('w_trap', idt(it['trap'], tr['title']))}
          ${kv(
            'w_field',
            it['field']
              ? html`<span>${code(s(fl['path']))} ${s(fl['shown'])}${fl['own'] != null ? ' ← ' + s(fl['own']) : ''}</span>`
              : null,
          )}
          ${kv(
            'w_lang',
            L['lang']
              ? Object.entries(lang)
                  .map(([k, v]) => `${k}: ${s(v)}`)
                  .join(' · ')
              : null,
          )}
          ${kv(
            'w_target',
            tg['text'] || tg['selector']
              ? html`<span>${s(tg['text'])}${tg['selector'] ? html`<small class="nr-sel">${s(tg['selector'])}</small>` : nothing}</span>`
              : null,
          )}
          ${kv('w_ui', i18n.length ? i18n.map(k => `${s(k['key'])} (${s(k['locale'])})`).join(' · ') : null)}
          ${kv('w_answer', s(tg['given']) || null)}
          ${kv(
            'w_app',
            [s(app['version']), s(app['commit']), s(ui['locale']), vp['w'] ? `${s(vp['w'])}×${s(vp['h'])}` : '', s(ui['ua'])]
              .filter(Boolean)
              .join(' · '),
          )}
          ${kv(
            'w_errors',
            errs.length
              ? html`<ul>
                  ${errs.map(e => html`<li>${s(e['level'])}: ${s(e['msg'])}</li>`)}
                </ul>`
              : null,
          )}
        </tbody>
      </table>
      <details class="nr-details">
        <summary>${this.#T('all')}</summary>
        <pre>${JSON.stringify(L, null, 1)}</pre>
      </details>
      <h2>${this.#T('answer')}</h2>
      <div class="nr-form">
        <label class="nr-label"
          >${this.#T('status')}
          <select
            class="nc-input nr-status"
            @change=${(e: Event) => {
              status = (e.target as HTMLSelectElement).value;
            }}
          >
            ${REPORT_STATUSES.map(x => html`<option value=${x} ?selected=${x === r.status}>${this.#T('st_' + x)}</option>`)}
          </select></label
        >
        <label class="nr-label"
          >${this.#T('answerLabel')}
          <textarea
            class="nc-input nr-anote"
            rows="3"
            maxlength="4000"
            placeholder=${this.#T('answerPh')}
            .value=${note}
            @input=${(e: Event) => {
              note = (e.target as HTMLTextAreaElement).value;
            }}
          ></textarea>
        </label>
        <label class="nr-label"
          >${this.#T('fixedIn')}
          <input
            class="nc-input nr-fixed"
            type="text"
            maxlength="300"
            placeholder=${this.#T('fixedIn')}
            .value=${fixed}
            @input=${(e: Event) => {
              fixed = (e.target as HTMLInputElement).value;
            }}
        /></label>
        <div class="nr-actions start">
          <noema-button class="nr-save" variant="primary" @click=${save}>${this.#T('save')}</noema-button>
          <noema-button class="nr-delete" variant="danger" @click=${() => void remove()}>${this.#T('delete')}</noema-button>
        </div>
      </div>`;
  }

  override render(): TemplateResult {
    const g = this.#got;
    let body: TemplateResult;
    if (g.state === 'wait') body = html`<p class="nc-muted">…</p>`;
    else if (g.state === 'refused') body = html`<div class="nc-panel">${this.#T('notAdmin')}</div>`;
    else if (g.state === 'error') body = html`<p class="nr-err">${g.text}</p>`;
    else if (g.state === 'list') body = this.#list(g.rows);
    else body = g.row ? this.#one(g.row) : html`<div class="nc-panel"><p>${this.#T('empty')}</p></div>`;
    return html`<div class="nc nr-admin">${body}</div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'noema-report-admin': NoemaReportAdmin;
  }
}
