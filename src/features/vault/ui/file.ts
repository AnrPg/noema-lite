/**
 * 🗄️ One file (docs/VAULT.md §4): what it is, where it comes from, who shared it (when they chose to show it); one row of
 * round tiles for the usual actions — download (counted once per person), preview (a window of its own over the sheet),
 * send to a conversation, make a course from it (📚 From your sources) — and ⋮ for edit and delete (one's own) or report
 * (another's). Stars for another's file. Also here: the report form, the edit form and "How it works".
 */
import { html, nothing, type TemplateResult } from 'lit';
import type { VaultFile } from '../../../ports/vault.ts';
import { icon, type IconName } from '../../../ui/kit/icons.ts';
import { ask, openDialog } from '../../community/ui/dialogs.ts';
import { download } from '../../community/ui/format.ts';
import type { ChromeMenuItem } from '../../community/ui/host.ts';
import { groupOf, langsOf } from '../domain/index.ts';
import type { NoemaVaultForm, VaultScreenDeps } from './form.ts';

const REASONS = ['copyright', 'live_exam', 'wrong', 'abuse', 'spam', 'other'] as const;

/** the kit's menu of a few actions (the items' classes are the tests' and the locator's names) */
export function menuOf(label: string, items: readonly ChromeMenuItem[], cls = ''): TemplateResult {
  return html`<noema-menu
    class="ns-menubtn ${cls}"
    label=${label}
    @noema-select=${(e: CustomEvent<{ value: string }>) => {
      items[Number(e.detail.value)]?.run?.();
    }}
  >
    ${items.map(
      (it, i) =>
        html`<noema-menu-item class=${it.cls ?? ''} value=${String(i)} icon=${it.icon ?? ''} ?danger=${!!it.danger}
          >${it.label}</noema-menu-item
        >`,
    )}
  </noema-menu>`;
}

/** the file's sheet; onChange: the list changed (read it again) */
export function openFile(deps: VaultScreenDeps, f: VaultFile, onChange: () => void): void {
  const ui = deps.ui,
    T = (k: string, p?: Record<string, string | number>): string => ui.T(k, p);
  const i18n = ui.d.i18n();
  const fail = (e: unknown): void => {
    deps.notify.toast(i18n.err(e), { ms: 6000 });
  };
  const busy = async (b: EventTarget | null, fn: () => Promise<void>): Promise<void> => {
    const btn = b instanceof HTMLButtonElement ? b : null;
    if (btn) btn.disabled = true;
    try {
      await fn();
    } catch (e) {
      fail(e);
    } finally {
      if (btn?.isConnected) btn.disabled = false;
    }
  };
  const blob = async (): Promise<Blob> => {
    if (!f.path) throw new Error('no file');
    const r = await ui.d.vault.download({ path: f.path, mime: f.mime ?? 'application/octet-stream' });
    if (!r.ok) throw r.error;
    return r.value;
  };
  const getFile = async (): Promise<File> => new File([await blob()], f.file_name, { type: f.mime ?? '' });
  const g = groupOf(f.file_name);
  const canPreview =
    ['doc', 'image', 'audio', 'video', 'text', 'sheet'].includes(g) &&
    (g !== 'doc' || f.mime === 'application/pdf') &&
    (g !== 'sheet' || f.mime === 'text/csv');
  const facts: [string, string | null | undefined][] = (
    [
      [T('f.university'), f.university],
      [T('f.department'), f.department],
      [T('f.course'), f.course],
      [T('f.professor'), f.professor],
      [T('f.when'), ui.when(f)],
      [T('f.type'), T('kind.' + f.kind)],
      [T('f.fields'), ui.fieldNames(f)],
      [
        T('f.language'),
        langsOf(f)
          .map(c => ui.langName(c))
          .join(', '),
      ],
      [
        T('f.contents'),
        [f.has_exercises && T('c.exercises'), f.has_solutions && T('c.solutions'), T(f.handwritten ? 'c.handwritten' : 'c.typed')]
          .filter(Boolean)
          .join(' · '),
      ],
      [T('f.file'), `${f.file_name} · ${ui.mb(f.size ?? 0)}${f.pages ? ' · ' + T('pagesN', { n: f.pages }) : ''}`],
      [T('f.sharedBy'), f.uploader_name || T('anonymous')],
      [T('f.group'), f.room ? ui.groupName(f.room) : null],
    ] as [string, string | null | undefined][]
  ).filter(([, x]) => x);
  // icons only (no label is ever cut, in any language); the words in the tooltip and for screen readers
  const tile = (name: IconName, label: string, cls: string, run: (e: Event) => void, title = label): TemplateResult =>
    html`<button type="button" class="vt-tile ${cls}" title=${title} aria-label=${title} @click=${run}>${icon(name)}</button>`;
  const more: ChromeMenuItem[] = f.mine
    ? [
        {
          label: T('edit'),
          icon: 'edit',
          cls: 'vt-edit',
          run: () => {
            openEdit(deps, f, onChange);
          },
        },
        {
          label: T('delete'),
          icon: 'trash',
          cls: 'vt-delete',
          danger: true,
          run: () => {
            void (async () => {
              if (!(await ask(deps, { text: T('deleteAsk', { title: f.title }), ok: T('delete'), cancel: T('cancel'), danger: true })))
                return;
              const r = await ui.d.vault.remove({ id: f.id, path: f.path ?? '' });
              if (!r.ok) {
                fail(r.error);
                return;
              }
              d.close();
              deps.notify.toast(T('deleted'), { ms: 3000 });
              onChange();
            })();
          },
        },
      ]
    : ui.reported[f.id]
      ? []
      : [
          {
            label: T('report'),
            icon: 'flag',
            cls: 'vt-report',
            run: () => {
              openReport(deps, f, () => {
                ui.reported[f.id] = 'x';
                d.close();
                onChange();
              });
            },
          },
        ];
  const mineStars = (): number => ui.ratings[f.id] ?? 0;
  const counts = [
    f.rating_n ? T('ratingN', { n: f.rating_n }) : T('noRating'),
    T('downloadsN', { n: f.downloads ?? 0 }),
    f.used ? T('usedN', { n: f.used }) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const d = openDialog(deps, {
    heading: f.title,
    cls: 'vt-sheet',
    placement: 'sheet',
    render: close =>
      html`${f.description ? html`<p class="vt-desc">${f.description}</p>` : nothing}
        ${f.mine && f.status !== 'ok' ? html`<p class="nc-panel nc-tiny vt-status">${T('statusLong.' + String(f.status))}</p>` : nothing}
        <dl class="vt-facts">
          ${facts.map(
            ([k, x]) =>
              html`<dt>${k}</dt>
                <dd>${x}</dd>`,
          )}
        </dl>
        <p class="nc-tiny nc-muted">${counts}</p>
        <div class="vt-acts" role="group" aria-label=${T('actions')}>
          ${tile(
            'download',
            T('download'),
            'vt-download primary',
            e =>
              void busy(e.currentTarget, async () => {
                download(await getFile(), f.file_name);
                void ui.d.vault.count(f.id, 'download');
              }),
          )}
          ${
            canPreview
              ? tile(
                  'eye',
                  T('preview'),
                  'vt-prevbtn',
                  e =>
                    void busy(e.currentTarget, async () => {
                      openPreview(deps, f, await blob());
                    }),
                )
              : nothing
          }
          ${
            ui.d.sendTo && f.status === 'ok'
              ? tile('send', T('sendTo'), 'vt-sendto', () => {
                  ui.d.sendTo?.({ kind: 'vault', id: f.id, title: f.title });
                })
              : nothing
          }
          ${tile(
            'spark',
            T('makeCourseShort'),
            'vt-course',
            e =>
              void busy(e.currentTarget, async () => {
                const file = await getFile();
                close();
                void ui.d.vault.count(f.id, 'used');
                ui.d.host.fromSources([file]);
              }),
            T('makeCourse'),
          )}
          ${more.length ? html`<span class="vt-moremenu">${menuOf(T('moreActions'), more)}</span>` : nothing}
        </div>
        ${
          f.mine
            ? nothing
            : html`<div class="vt-rate">
                <span class="vt-lb">${T('rate')}</span>
                ${
                  ui.reported[f.id]
                    ? html`<span class="nc-tiny nc-muted">${T('reported')}</span>`
                    : html`<div class="vt-stars" role="radiogroup" aria-label=${T('rate')}>
                        ${[1, 2, 3, 4, 5].map(
                          n =>
                            html`<button
                              type="button"
                              class="vt-star ${mineStars() >= n ? 'on' : ''}"
                              role="radio"
                              aria-checked=${String(mineStars() === n)}
                              aria-label=${T('starsN', { n })}
                              @click=${(e: Event) =>
                                void busy(e.currentTarget, async () => {
                                  const r = await ui.d.vault.rate(f.id, n);
                                  if (!r.ok) throw r.error;
                                  ui.ratings[f.id] = n;
                                  d.redraw();
                                  onChange();
                                })}
                            >
                              ★
                            </button>`, // i18n-ignore (the star sign)
                        )}
                      </div>`
                }
              </div>`
        }`,
  });
}

/** 👁 the preview in a window of its own over the sheet (✕, Escape or a press outside close it; the sheet stays) */
export function openPreview(deps: VaultScreenDeps, f: VaultFile, blob: Blob): void {
  const doc = globalThis.document;
  const url = URL.createObjectURL(new Blob([blob], { type: f.mime ?? '' })),
    g = groupOf(f.file_name);
  const box = doc.createElement('div');
  box.className = 'vt-preview';
  const put = (tag: string, attrs: Record<string, string>): void => {
    const el = doc.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    box.replaceChildren(el);
  };
  if (g === 'image') put('img', { src: url, alt: f.title });
  else if (g === 'audio') put('audio', { src: url, controls: '' });
  else if (g === 'video') put('video', { src: url, controls: '' });
  else if (f.mime === 'application/pdf') put('iframe', { src: url, title: f.title });
  else
    void blob.text().then(t => {
      const pre = doc.createElement('pre');
      pre.textContent = t.slice(0, 20000);
      box.replaceChildren(pre);
    });
  openDialog(deps, {
    heading: f.title,
    cls: 'vt-prevwin',
    wide: true,
    content: box,
    onClose: () => {
      URL.revokeObjectURL(url);
    },
  });
}

/** ⚑ report a file: copyright, answers of an exam not held yet, wrong labels, abuse, spam (three reports hide it) */
export function openReport(deps: VaultScreenDeps, f: VaultFile, onDone: () => void): void {
  const ui = deps.ui,
    T = (k: string, p?: Record<string, string | number>): string => ui.T(k, p);
  let reason: string = REASONS[0],
    note = '',
    sending = false;
  const d = openDialog(deps, {
    heading: T('reportTitle'),
    cls: 'vt-reportdlg',
    render: close =>
      html`<p class="nc-tiny nc-muted">${T('reportLead')}</p>
        <select
          class="nc-input vt-reason"
          aria-label=${T('reason')}
          @change=${(e: Event) => {
            reason = (e.target as HTMLSelectElement).value;
          }}
        >
          ${REASONS.map(r => html`<option value=${r} ?selected=${r === reason}>${T('reason.' + r)}</option>`)}
        </select>
        <textarea
          class="nc-input"
          rows="3"
          maxlength="600"
          placeholder=${T('reportNote')}
          aria-label=${T('reportNote')}
          @input=${(e: Event) => {
            note = (e.target as HTMLTextAreaElement).value;
          }}
        ></textarea>
        <noema-button
          slot="actions"
          variant="secondary"
          @click=${() => {
            close('no');
          }}
          >${T('cancel')}</noema-button
        >
        <noema-button
          slot="actions"
          class="vt-sendreport"
          variant="primary"
          ?disabled=${sending}
          @click=${() => {
            sending = true;
            d.redraw();
            void ui.d.vault.report(f.id, reason, note.trim() || null).then(r => {
              sending = false;
              if (!r.ok) {
                d.redraw();
                deps.notify.toast(ui.d.i18n().err(r.error), { ms: 5000 });
                return;
              }
              deps.notify.toast(T('reportThanks'), { ms: 4000 });
              close();
              onDone();
            });
          }}
          >${T('sendReport')}</noema-button
        >`,
  });
}

/** ✎ edit one's own file: its title and the form of its place and contents */
export function openEdit(deps: VaultScreenDeps, f: VaultFile, onDone: () => void): void {
  const ui = deps.ui,
    T = (k: string, p?: Record<string, string | number>): string => ui.T(k, p);
  let title = f.title,
    err = '',
    saving = false;
  const formOf = (): NoemaVaultForm | null => d.el.querySelector('noema-vault-form');
  const d = openDialog(deps, {
    heading: T('editTitle'),
    cls: 'vt-editdlg',
    wide: true,
    render: close =>
      html`<label class="vt-fld"
          ><span class="vt-lb">${T('fileTitle') + ' *'}</span
          ><input
            class="nc-input vt-title"
            maxlength="160"
            aria-label=${T('fileTitle')}
            .value=${title}
            @input=${(e: Event) => {
              title = (e.target as HTMLInputElement).value;
            }}
        /></label>
        <noema-vault-form .deps=${deps} .init=${{ ...f, show_name: !!f.uploader_name }} .text=${() => title}></noema-vault-form>
        <p class="nc-err" role="alert">${err}</p>
        <noema-button
          slot="actions"
          variant="secondary"
          @click=${() => {
            close('no');
          }}
          >${T('cancel')}</noema-button
        >
        <noema-button
          slot="actions"
          class="vt-save"
          variant="primary"
          ?disabled=${saving}
          @click=${() => {
            const r = formOf()?.read();
            if (!r) return;
            if ('error' in r || !title.trim()) {
              err = 'error' in r ? r.error : T('needTitle');
              d.redraw();
              return;
            }
            saving = true;
            d.redraw();
            void ui.d.vault.edit(f.id, { ...r.meta, title: title.trim() }).then(x => {
              saving = false;
              if (!x.ok) {
                err = ui.d.i18n().err(x.error);
                d.redraw();
                return;
              }
              close();
              onDone();
            });
          }}
          >${T('save')}</noema-button
        >`,
  });
}

/** ⓘ how the vault works */
export function openAbout(deps: VaultScreenDeps): void {
  const T = (k: string, p?: Record<string, string | number>): string => deps.ui.T(k, p);
  openDialog(deps, {
    heading: T('howItWorks'),
    cls: 'vt-about',
    placement: 'sheet',
    render: () => html`${['about1', 'about2', 'about3', 'about4', 'about5'].map(k => html`<p>${T(k, { mb: 20, quota: 50 })}</p>`)}`,
  });
}
