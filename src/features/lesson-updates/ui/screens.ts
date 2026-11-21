/**
 * 💬→📖 the two windows of a lesson update (docs/LESSON_UPDATES.md §5), kit dialogs over the page, drawn in their light DOM
 * (the page's stylesheet: ./styles.ts, every rule under .lu):
 *
 *   openSend(deps, { record, subject, chapter })   "Use this chat in a lesson": the lesson (this one, or another of the
 *                                                  learner's own), a note for Claude, then how to ask Claude
 *   openReview(deps, id)                           the proposal: what it adds and why, what the checks moved, the choices
 *                                                  (each with its recommended option), the chapter before and after,
 *                                                  then Approve / Decline (and Undo once applied); with no proposal yet:
 *                                                  a box for the answer pasted back from a Claude chat
 *
 * Nothing changes in a lesson until the learner approves, and the app checks it all again just before it saves.
 */
import { html, nothing, render, type TemplateResult } from 'lit';
import type { I18n, MessageParams } from '../../../ports/i18n.ts';
import type { NoemaDialog } from '../../../ui/kit/dialog.ts';
import { adopt } from '../../community/ui/styles.ts';
import { list, s, type Obj } from '../../content/domain/util.ts';
import type { ChatRecord, LessonRequest, LessonUpdate } from '../domain/index.ts';
import type { LessonFail, LessonUpdates, OwnSubject, Preview } from '../application/service.ts';
import { LU_CSS } from './styles.ts';

export interface LessonUiDeps {
  readonly svc: LessonUpdates;
  readonly i18n: I18n;
  /** the tutor's Markdown as safe markup */
  md(text: string): HTMLElement;
  copy(text: string): Promise<boolean>;
  notify(text: string): void;
  /** puts an element over the page → takes it away */
  overlay(el: HTMLElement): () => void;
  /** a cloud account: the connector can read the request (else the whole brief is copied) */
  cloud(): boolean;
  tutorName(): string;
  learnerName(): string;
  /** after an update was applied or undone: the open subject shows the lesson again */
  refresh(subject: string): void;
}

/* ---------- a dialog drawn by a template ---------- */
interface Dlg {
  readonly el: NoemaDialog;
  redraw(): void;
  close(v?: string): void;
}
function dialog(deps: LessonUiDeps, heading: string, cls: string, tpl: (d: Dlg) => TemplateResult): Dlg {
  const doc = globalThis.document;
  adopt(doc, 'lesson-updates', LU_CSS);
  const el = doc.createElement('noema-dialog');
  el.heading = heading;
  el.wide = true;
  el.className = 'lu ' + cls;
  const d: Dlg = {
    el,
    redraw: () => {
      render(tpl(d), el);
    },
    close: v => {
      el.close(v ?? 'done');
    },
  };
  d.redraw();
  const remove = deps.overlay(el);
  el.addEventListener('noema-close', e => {
    if (e.target === el) remove();
  });
  void el.updateComplete.then(() => {
    el.show();
  });
  return d;
}
const T = (deps: LessonUiDeps, k: string, p?: MessageParams): string => deps.i18n.t('lu.' + k, p);
/** a failure in the learner's words (the checks' own text under it, for Claude) */
const failText = (deps: LessonUiDeps, f: LessonFail): string => T(deps, 'err.' + f.code);

/* ---------- "Use this chat in a lesson" ---------- */

export interface SendContext {
  readonly record: ChatRecord;
  /** the subject and chapter the chat is about (the defaults) */
  readonly subject: string | null;
  readonly chapter: string | null;
}

export async function openSend(deps: LessonUiDeps, ctx: SendContext): Promise<void> {
  const subjects = await deps.svc.subjects();
  let subj: OwnSubject | null = subjects.find(x => x.id === ctx.subject) ?? subjects[0] ?? null;
  let chapter = subj?.chapters.find(c => c.id === ctx.chapter)?.id ?? subj?.chapters[0]?.id ?? '';
  let note = '';
  let busy = false;
  let error = '';
  let sent: LessonRequest | null = null;
  const files = new Set(ctx.record.messages.flatMap(m => (m.attachments ?? []).map(a => a.id))).size;
  const notOwn = !!ctx.subject && !subjects.some(x => x.id === ctx.subject);

  const send = async (d: Dlg): Promise<void> => {
    if (!subj || !chapter || busy) return;
    busy = true;
    error = '';
    d.redraw();
    const r = await deps.svc
      .send({
        record: ctx.record,
        subject: subj,
        chapter,
        note,
        locale: deps.i18n.locale(),
        names: { learner: deps.learnerName(), tutor: deps.tutorName() },
      })
      .catch((e: unknown) => ({ ok: false as const, error: { code: 'invalid' as const, detail: String(e) } }));
    busy = false;
    if (r.ok) sent = r.value;
    else error = failText(deps, r.error);
    d.redraw();
  };
  const copyMsg = async (): Promise<void> => {
    if (!sent) return;
    const m = await deps.svc.message(sent.id, deps.cloud());
    if (!m.ok) {
      deps.notify(failText(deps, m.error));
      return;
    }
    deps.notify(T(deps, (await deps.copy(m.value)) ? 'copied' : 'copyFailed'));
  };

  dialog(deps, T(deps, 'send.title'), 'lu-send', d => {
    if (sent) {
      const r = sent;
      return html`<div class="lu-body">
          <p class="lu-ok" role="status">${T(deps, 'send.sent', { chapter: r.chapter.title })}</p>
          <ol class="lu-steps">
            <li>${T(deps, deps.cloud() ? 'send.step1Connector' : 'send.step1Copy')}</li>
            <li>${T(deps, deps.cloud() ? 'send.step2Connector' : 'send.step2Copy')}</li>
          </ol>
        </div>
        <noema-button
          slot="actions"
          class="lu-copy"
          variant="primary"
          @click=${() => {
            void copyMsg();
          }}
          >${T(deps, 'copyMessage')}</noema-button
        >
        <noema-button
          slot="actions"
          class="lu-paste"
          variant="secondary"
          @click=${() => {
            d.close('paste');
            void openReview(deps, r.id);
          }}
          >${T(deps, 'pasteAnswer')}</noema-button
        >`;
    }
    if (!subj)
      return html`<div class="lu-body"><p>${T(deps, 'send.noOwn')}</p></div>
        <noema-button
          slot="actions"
          variant="secondary"
          @click=${() => {
            d.close();
          }}
          >${T(deps, 'close')}</noema-button
        >`;
    const cur = subj;
    return html`<div class="lu-body">
        <p class="lu-lead">${T(deps, 'send.lead')}</p>
        ${notOwn ? html`<p class="lu-muted">${T(deps, 'send.notOwn')}</p>` : nothing}
        ${
          subjects.length > 1
            ? html`<noema-select
                class="lu-subject"
                label=${T(deps, 'send.subject')}
                .options=${subjects.map(x => ({ value: x.id, label: x.title }))}
                .value=${cur.id}
                @change=${(e: Event) => {
                  const v = (e.target as HTMLElement & { value: string }).value;
                  subj = subjects.find(x => x.id === v) ?? cur;
                  chapter = subj.chapters[0]?.id ?? '';
                  d.redraw();
                }}
              ></noema-select>`
            : nothing
        }
        <noema-select
          class="lu-chapter"
          label=${T(deps, 'send.chapter')}
          .options=${cur.chapters.map(c => ({ value: c.id, label: c.title }))}
          .value=${chapter}
          @change=${(e: Event) => {
            chapter = (e.target as HTMLElement & { value: string }).value;
          }}
        ></noema-select>
        <noema-text-field
          class="lu-note"
          multiline
          label=${T(deps, 'send.note')}
          hint=${T(deps, 'send.noteHint')}
          .value=${note}
          @input=${(e: Event) => {
            note = (e.target as HTMLElement & { value: string }).value;
          }}
        ></noema-text-field>
        ${files ? html`<p class="lu-muted">${T(deps, 'send.files', { n: files })}</p>` : nothing}
        <p class="lu-muted">${T(deps, 'send.safe')}</p>
        ${error ? html`<p class="lu-bad" role="alert">${error}</p>` : nothing}
      </div>
      <noema-button
        slot="actions"
        class="lu-go"
        variant="primary"
        ?busy=${busy}
        ?disabled=${busy || !chapter}
        @click=${() => {
          void send(d);
        }}
        >${T(deps, 'send.go')}</noema-button
      >`;
  });
}

/* ---------- the review ---------- */

/** a block of the lesson, as the review shows it (the words, not the activities) */
function blockView(deps: LessonUiDeps, b: Obj): TemplateResult {
  const t = s(b['t']);
  if (t === 'code') return html`<pre class="lu-code">${s(b['code'] ?? b['text'] ?? '')}</pre>`;
  if (t === 'list')
    return html`<ul>
      ${list(b['items']).map(x => html`<li>${deps.md(typeof x === 'string' ? x : textOf(x))}</li>`)}
    </ul>`;
  if (t === 'table')
    return html`<table class="lu-table">
      <tr>
        ${list(b['head']).map(h => html`<th>${s(h)}</th>`)}
      </tr>
      ${list(b['rows']).map(
        r =>
          html`<tr>
            ${list(r).map(c => html`<td>${s(c)}</td>`)}
          </tr>`,
      )}
    </table>`;
  const head = b['label'] ?? b['title'];
  return html`${typeof head === 'string' ? html`<b>${head}</b>` : nothing}${deps.md(s(b['text'] ?? textOf(b)))}`;
}
const textOf = (v: unknown): string =>
  typeof v === 'string'
    ? v
    : Array.isArray(v)
      ? v.map(textOf).join(' ')
      : v && typeof v === 'object'
        ? Object.values(v).map(textOf).join(' ')
        : '';

function itemView(deps: LessonUiDeps, kind: string, it: Obj): TemplateResult {
  if (kind === 'flashcards') return html`${deps.md(s(it['q']))}<span class="lu-muted">→ ${s(it['a'])}</span>`;
  if (kind === 'pitfalls') return html`<b>${s(it['title'] ?? '')}</b>${deps.md(s(it['text'] ?? ''))}`;
  return html`${deps.md(s(it['q'] ?? it['title'] ?? textOf(it).slice(0, 300)))}`;
}

export async function openReview(deps: LessonUiDeps, id: string): Promise<void> {
  const opened = await deps.svc.open(id);
  if (!opened.ok) {
    deps.notify(failText(deps, opened.error));
    return;
  }
  const { req } = opened.value;
  let update: LessonUpdate | null = opened.value.update;
  let picks: Record<string, string> = { ...(req.picks ?? {}) };
  let state = req.state;
  let preview: Preview | null = null;
  let busy: '' | 'approve' | 'decline' | 'undo' | 'paste' | 'preview' = '';
  let error = '';
  let detail = '';
  let pasted = '';

  const refresh = async (d: Dlg): Promise<void> => {
    if (!update) return;
    busy = 'preview';
    d.redraw();
    const r = await deps.svc.preview(update, picks, deps.i18n.locale());
    busy = '';
    if (r.ok) {
      preview = r.value;
      error = r.value.changed ? T(deps, 'err.changed') : r.value.errors.length ? T(deps, 'err.invalid') : '';
      detail = r.value.errors.join('\n');
    } else {
      error = failText(deps, r.error);
      detail = r.error.detail;
    }
    d.redraw();
  };
  const act = async (d: Dlg, what: 'approve' | 'decline' | 'undo'): Promise<void> => {
    busy = what;
    error = '';
    detail = '';
    d.redraw();
    const r =
      what === 'approve' && update
        ? await deps.svc.approve(id, update, picks)
        : what === 'undo'
          ? await deps.svc.undo(id)
          : deps.svc.decline(id);
    busy = '';
    if (!r.ok) {
      error = failText(deps, r.error);
      detail = r.error.detail;
      d.redraw();
      return;
    }
    state = r.value.state;
    deps.notify(T(deps, what === 'approve' ? 'applied' : what === 'undo' ? 'undone' : 'declined', { chapter: req.chapter.title }));
    if (what !== 'decline') deps.refresh(req.subject.id);
    if (what === 'decline') d.close('decline');
    else d.redraw();
  };
  const paste = async (d: Dlg): Promise<void> => {
    busy = 'paste';
    error = '';
    detail = '';
    d.redraw();
    const r = await deps.svc.paste(id, pasted);
    busy = '';
    if (r.ok) {
      update = r.value.update;
      await refresh(d);
      return;
    }
    error = failText(deps, r.error);
    detail = r.error.detail;
    d.redraw();
  };

  const d = dialog(deps, T(deps, 'review.title', { chapter: req.chapter.title }), 'lu-review', dd => {
    const head = html`<p class="lu-muted lu-from">
      ${T(deps, 'review.from', { chat: req.conversation.title || T(deps, 'review.chat'), subject: req.subject.title })}
    </p>`;
    const problems = error
      ? html`<div class="lu-bad" role="alert">
          <p>${error}</p>
          ${
            detail
              ? html`<details>
                    <summary>${T(deps, 'review.details')}</summary>
                    <pre class="lu-code">${detail}</pre>
                  </details>
                  <noema-button
                    size="sm"
                    variant="secondary"
                    class="lu-copyproblems"
                    @click=${() => {
                      void deps.copy(T(deps, 'review.problemsForClaude') + '\n\n' + detail).then(ok => {
                        deps.notify(T(deps, ok ? 'copied' : 'copyFailed'));
                      });
                    }}
                    >${T(deps, 'review.copyProblems')}</noema-button
                  >`
              : nothing
          }
        </div>`
      : nothing;
    if (!update)
      return html`<div class="lu-body">
          ${head}
          <p>${T(deps, state === 'open' ? 'review.waiting' : 'review.closed')}</p>
          ${
            state === 'open'
              ? html`<noema-text-field
                  class="lu-answer"
                  multiline
                  label=${T(deps, 'review.pasteLabel')}
                  .value=${pasted}
                  @input=${(e: Event) => {
                    pasted = (e.target as HTMLElement & { value: string }).value;
                  }}
                ></noema-text-field>`
              : nothing
          }
          ${problems}
        </div>
        ${
          state === 'open'
            ? html`<noema-button
                  slot="actions"
                  class="lu-check"
                  variant="primary"
                  ?busy=${busy === 'paste'}
                  ?disabled=${!!busy}
                  @click=${() => {
                    void paste(dd);
                  }}
                  >${T(deps, 'review.check')}</noema-button
                ><noema-button
                  slot="actions"
                  class="lu-copy"
                  variant="secondary"
                  @click=${() => {
                    void deps.svc.message(id, deps.cloud()).then(async m => {
                      if (m.ok) deps.notify(T(deps, (await deps.copy(m.value)) ? 'copied' : 'copyFailed'));
                    });
                  }}
                  >${T(deps, 'copyMessage')}</noema-button
                >`
            : nothing
        }`;
    const u = update;
    const titleOf = new Map((preview?.diff.sections ?? []).map(x => [x.id, x.title]));
    const name = (sid: string): string => titleOf.get(sid) || sid;
    const open = state === 'open' || state === 'proposed';
    const counts = preview?.diff.added;
    return html`<div class="lu-body">
        ${head}
        <div class="lu-summary">${deps.md(u.summary)}</div>
        ${
          counts
            ? html`<p class="lu-counts">
                ${T(deps, 'review.adds', {
                  list: deps.i18n.format.list(
                    (
                      [
                        ['sections', counts.sections],
                        ['blocks', counts.blocks],
                        ['exercises', counts.exercises],
                        ['cards', counts.flashcards + counts.pitfalls],
                      ] as const
                    )
                      .filter(([, n]) => n > 0)
                      .map(([k, n]) => T(deps, 'n.' + k, { n })),
                  ),
                })}${preview && preview.diff.removed ? ' · ' + T(deps, 'review.replaced', { n: preview.diff.removed }) : ''}
              </p>`
            : nothing
        }
        ${
          u.notes?.length
            ? html`<ul class="lu-notes">
                ${(u.notes ?? []).map(n => html`<li>${T(deps, 'review.placed', { from: name(n.from), to: name(n.to) })}</li>`)}
              </ul>`
            : nothing
        }
        ${(u.choices ?? []).map(
          c =>
            html`<fieldset class="lu-choice" data-choice=${c.id} ?disabled=${!open}>
              <legend>${c.question}</legend>
              ${c.why ? html`<p class="lu-muted">${c.why}</p>` : nothing}
              ${c.options.map(
                o =>
                  html`<label class="lu-opt">
                    <input
                      type="radio"
                      name=${'lu-' + c.id}
                      value=${o.id}
                      .checked=${(picks[c.id] ?? c.recommended) === o.id}
                      @change=${() => {
                        picks = { ...picks, [c.id]: o.id };
                        void refresh(dd);
                      }}
                    />
                    <span
                      >${o.label}${o.id === c.recommended ? html` <span class="lu-rec">${T(deps, 'review.recommended')}</span>` : nothing}</span
                    >
                  </label>`,
              )}
            </fieldset>`,
        )}
        <h3 class="lu-h">${T(deps, 'review.changes')}</h3>
        ${
          preview
            ? preview.diff.sections
                .filter(x => x.state !== 'same')
                .map(
                  x =>
                    html`<section class=${'lu-sec ' + x.state} data-sec=${x.id}>
                      <h4>
                        ${x.title}${x.state === 'new' ? html` <span class="lu-tag add">${T(deps, 'review.newSection')}</span>` : nothing}
                      </h4>
                      ${collapse(x.blocks).map(g =>
                        g.kind === 'same'
                          ? html`<p class="lu-same">${T(deps, 'review.same', { n: g.n })}</p>`
                          : html`<div
                              class=${'lu-blk ' + g.mark}
                              aria-label=${T(deps, g.mark === 'added' ? 'review.added' : 'review.removed')}
                            >
                              ${blockView(deps, g.block)}
                            </div>`,
                      )}
                      ${x.items.map(
                        it =>
                          html`<div class="lu-blk added lu-item">
                            <span class="lu-tag">${T(deps, 'kind.' + it.kind)}</span>${itemView(deps, it.kind, it.item)}
                          </div>`,
                      )}
                    </section>`,
                )
            : html`<p class="lu-muted" role="status">${T(deps, 'review.checking')}</p>`
        }
        ${state === 'applied' ? html`<p class="lu-ok" role="status">${T(deps, 'review.isApplied')}</p>` : nothing}
        ${state === 'declined' || state === 'undone' ? html`<p class="lu-muted">${T(deps, 'review.closed')}</p>` : nothing} ${problems}
      </div>
      ${
        open
          ? html`<noema-button
                slot="actions"
                class="lu-approve"
                variant="primary"
                ?busy=${busy === 'approve'}
                ?disabled=${!!busy || !preview || !!error}
                @click=${() => {
                  void act(dd, 'approve');
                }}
                >${T(deps, 'review.approve')}</noema-button
              ><noema-button
                slot="actions"
                class="lu-decline"
                variant="secondary"
                ?busy=${busy === 'decline'}
                ?disabled=${!!busy}
                @click=${() => {
                  void act(dd, 'decline');
                }}
                >${T(deps, 'review.decline')}</noema-button
              >`
          : state === 'applied'
            ? html`<noema-button
                slot="actions"
                class="lu-undo"
                variant="secondary"
                ?busy=${busy === 'undo'}
                ?disabled=${!!busy}
                @click=${() => {
                  void act(dd, 'undo');
                }}
                >${T(deps, 'review.undo')}</noema-button
              >`
            : nothing
      }`;
  });
  if (update) await refresh(d);
}

/** runs of unchanged blocks become one line ("3 blocks as they are"); one unchanged block around a change stays */
function collapse(
  blocks: readonly { readonly mark: 'same' | 'added' | 'removed'; readonly block: Obj }[],
): ({ kind: 'same'; n: number } | { kind: 'change'; mark: 'added' | 'removed' | 'same'; block: Obj })[] {
  const out: ({ kind: 'same'; n: number } | { kind: 'change'; mark: 'added' | 'removed' | 'same'; block: Obj })[] = [];
  let run = 0;
  blocks.forEach((b, i) => {
    const near = blocks[i - 1]?.mark !== 'same' && i > 0 ? true : blocks[i + 1] !== undefined && blocks[i + 1]?.mark !== 'same';
    if (b.mark === 'same' && !near) {
      run++;
      return;
    }
    if (run) out.push({ kind: 'same', n: run });
    run = 0;
    out.push({ kind: 'change', mark: b.mark, block: b.block });
  });
  if (run) out.push({ kind: 'same', n: run });
  return out;
}
