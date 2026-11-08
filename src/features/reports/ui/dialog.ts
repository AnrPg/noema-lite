/**
 * ⚑ The report dialog (docs/REPORTS.md §1): pressed, the place and a screenshot are taken first (nothing of the report on
 * screen yet), then the dialog: the picture (kept or left out), what kind of problem, a few words, 🎯 point at the very
 * thing, the details it carries, and Send — or, for a local profile (no cloud), the report as a file to send by hand.
 * A report made while offline waits on this device and goes when the app is back.
 */
import { html, nothing } from 'lit';
import type { I18n } from '../../../ports/i18n.ts';
import { reportRow, REPORT_KINDS } from '../domain/report.ts';
import type { ReportService } from '../application/reports.ts';
import { openDialog } from '../../community/ui/dialogs.ts';
import { download } from '../../community/ui/format.ts';
import { icon } from '../../../ui/kit/icons.ts';
import type { ScreenBase } from '../../community/ui/screen.ts';
import { adopt, COMMON } from '../../community/ui/styles.ts';
import { clip, closestComposed, collect } from './locate.ts';
import { pointAt, shoot } from './shot.ts';
import { POINT_CSS, REPORT_CSS } from './styles.ts';

export interface ReportDeps extends ScreenBase {
  readonly reports: ReportService;
  readonly i18n: I18n;
  readonly win: Window;
  readonly newId: () => string;
}

/** is the account signed in to the cloud (a report can be sent; else it is downloaded) */
export const cloudOn = (d: ScreenBase): boolean => d.host.account()?.kind === 'cloud' && !!d.host.session();

let busy = false;

/** ⚑ pressed */
export async function openReport(d: ReportDeps): Promise<void> {
  if (busy) return;
  busy = true;
  const { win } = d,
    doc = win.document,
    T = (k: string, p?: Record<string, string | number>): string => d.i18n.t('report.' + k, p);
  adopt(doc, 'report', COMMON, REPORT_CSS, POINT_CSS);
  doc.body.classList.add('nr-shooting');
  const act = doc.activeElement;
  let loc = collect(act && act !== doc.body && !closestComposed(act, '.nr-skip') ? act : null, false, d.host, d.i18n, win);
  let shot = await shoot(d.host, win);
  doc.body.classList.remove('nr-shooting');
  busy = false;
  let kind: string | null = null,
    withShot = !!shot,
    text = '',
    error = '',
    sending = false;

  const show = (): void => {
    const dlg = openDialog(d, {
      heading: T('title'),
      cls: 'nr-modal nr-skip',
      wide: true,
      render: close => {
        const local = !cloudOn(d);
        const send = async (): Promise<void> => {
          if (!kind) {
            error = T('pickKind');
            dlg.redraw();
            const k = dlg.el.querySelector('.nr-kinds');
            k?.classList.remove('shake');
            void (k as HTMLElement | null)?.offsetWidth;
            k?.classList.add('shake');
            return;
          }
          sending = true;
          error = '';
          dlg.redraw();
          const r = await d.reports.send(reportRow(d.newId(), loc, kind, text, withShot ? shot : null));
          sending = false;
          if (r.ok) {
            close();
            d.notify.toast(r.value === 'queued' ? T('queued') : T('sent'), { ms: r.value === 'queued' ? 5000 : 4000 });
          } else {
            error = T('failed', { error: d.i18n.err(r.error) });
            dlg.redraw();
          }
        };
        const point = async (): Promise<void> => {
          close('point');
          const got = await pointAt(win, T('pointHint'));
          if (got) {
            // the screenshot again, with the thing pointed at framed on the page itself (so the frame moves with it)
            doc.body.classList.add('nr-shooting');
            loc = collect(got, true, d.host, d.i18n, win);
            got.classList.add('nr-picked');
            const s2 = await shoot(d.host, win);
            got.classList.remove('nr-picked');
            doc.body.classList.remove('nr-shooting');
            if (s2) {
              shot = s2;
              withShot = true;
            }
          }
          show();
        };
        const tg = loc.target as { picked?: boolean; text?: string; tag?: string; i18n?: unknown } | null | undefined;
        const details = JSON.stringify(
          {
            item: loc.itemRef,
            route: loc.route?.hash,
            subject: loc.subject?.id,
            place: loc.place,
            target: tg && { text: tg.text, i18n: tg.i18n },
          },
          null,
          1,
        );
        const name = `noema-report-${(loc.at ?? '').slice(0, 19).replace(/[:T]/g, '-')}.json`;
        return html`<div class="nr-body">
            <p class="nc-muted nr-lead">${T('lead')}</p>
            ${
              shot
                ? html`<figure class="nr-shot ${withShot ? '' : 'off'}">
                    <img src=${shot} alt=${T('shotAlt')} />
                    <label class="nc-check"
                      ><input
                        type="checkbox"
                        .checked=${withShot}
                        @change=${(e: Event) => {
                          withShot = (e.target as HTMLInputElement).checked;
                          dlg.redraw();
                        }}
                      /><span>${T('shot')}</span></label
                    >
                  </figure>`
                : html`<p class="nc-muted nr-noshot">${T('noShot')}</p>`
            }
            <div class="nr-label" id="nr-kind-l">${T('kind')}</div>
            <div class="nr-kinds" role="radiogroup" aria-labelledby="nr-kind-l">
              ${REPORT_KINDS.map(
                k =>
                  html`<button
                    type="button"
                    class="nr-kind ${k === kind ? 'on' : ''}"
                    role="radio"
                    aria-checked=${String(k === kind)}
                    data-k=${k}
                    @click=${() => {
                      kind = k;
                      error = '';
                      dlg.redraw();
                    }}
                  >
                    ${T('kind_' + k)}
                  </button>`,
              )}
            </div>
            <label class="nr-label"
              >${T('note')}
              <textarea
                class="nc-input nr-note"
                rows="4"
                maxlength="4000"
                placeholder=${T('notePh')}
                .value=${text}
                @input=${(e: Event) => {
                  text = (e.target as HTMLTextAreaElement).value;
                }}
              ></textarea>
            </label>
            <div class="nr-row">
              <noema-button class="nr-point" size="sm" @click=${() => void point()}
                >${icon('target')}<span>${tg?.picked ? T('repoint') : T('point')}</span></noema-button
              >
              ${
                tg?.picked
                  ? html`<div class="nr-pointed">
                      ${icon('target')}<span>${T('pointed', { what: clip(tg.text || tg.tag, 80) || (tg.tag ?? '') })}</span>
                    </div>`
                  : nothing
              }
            </div>
            <details class="nr-details">
              <summary>${T('details')}</summary>
              <pre>${details}</pre>
            </details>
            ${local ? html`<p class="nr-signin">${T('signIn')}</p>` : html`<p class="nc-muted nr-privacy">${T('privacy')}</p>`}
            <p class="nr-err" role="alert">${error}</p>
          </div>
          <noema-button slot="actions" variant="quiet" @click=${() => close()}>${T('cancel')}</noema-button>
          ${
            local
              ? html`<noema-button
                  slot="actions"
                  class="nr-download"
                  variant="primary"
                  @click=${() => {
                    download(
                      new Blob([JSON.stringify(reportRow(d.newId(), loc, kind ?? 'other', text, withShot ? shot : null), null, 1)], {
                        type: 'application/json',
                      }),
                      name,
                    );
                  }}
                  >${T('download')}</noema-button
                >`
              : html`<noema-button slot="actions" class="nr-send" variant="primary" ?disabled=${sending} @click=${() => void send()}
                  >${sending ? T('sending') : T('send')}</noema-button
                >`
          }`;
      },
    });
    void dlg.el.updateComplete.then(() => {
      globalThis.setTimeout(() => {
        const f = kind ? dlg.el.querySelector<HTMLElement>('.nr-note') : dlg.el.querySelector<HTMLElement>('.nr-kind');
        f?.focus();
      }, 30);
    });
  };
  show();
}
