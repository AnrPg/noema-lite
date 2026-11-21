/**
 * The tutor's drawer in the frame (docs/UI_MAP.md), drawn from the session's state: face, name, ⋮, ✕ · "How <name> helps
 * you" over one list of the modes · a "For: …" chip (✕ = the whole subject) · the threads · the conversation · the box to
 * write in. Nothing else (the conversations are Me › Conversations: ./conversations.ts).
 * The thread tracker (noema-tutor-threads) is an element of its own.
 */
import { html, nothing, type TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { MODE_WORDS, type ModeId } from '../domain/prompts.ts';
import { THREAD_BUDGET, openThreads, usesThreads, type Thread } from '../domain/threads.ts';
import { icon } from '../../../ui/kit/icons.ts';
import { acceptFor, MAX_FILE_BYTES, MAX_FILES, refusal } from '../domain/attachments.ts';
import type { Attachment, Turn } from '../domain/conversation.ts';
import { TutorElement, type MenuItem, type TutorView } from './view.ts';

const MODES_SHOWN = (current: ModeId): ModeId[] =>
  (['socratic', 'explain', 'hint', 'quiz', 'interview', 'debug'] as ModeId[]).filter(k => k !== 'hint' || current === k);

const shellMode = (v: TutorView, k: ModeId): string => v.L('mode' + MODE_WORDS[k]);
const shellSub = (v: TutorView, k: ModeId): string => v.L('mode' + MODE_WORDS[k] + 'Sub');

export class NoemaTutorPanel extends TutorElement {
  static override properties = {
    ...TutorElement.properties,
    jump: { state: true },
    editing: { state: true },
    files: { state: true },
    adding: { state: true },
  };
  /** the "jump to the latest" button is shown (the learner has scrolled up from the end) */
  declare jump: boolean;
  /** the learner's message being edited (its place on the path) */
  declare editing: number | null;
  /** the files added to the message being written */
  declare files: Attachment[];
  declare adding: number;
  #draft = '';
  #editText = '';
  #editFiles: Attachment[] = [];
  #focusEdit = false;
  #seenKey = '';
  #seenHist: unknown = null;
  #wasBusy = false;
  #wasErr = false;
  /** each turn's rendered text, kept: a reply streaming in never redraws (or unselects) the turns above it */
  readonly #md = new WeakMap<Turn, { readonly text: string; readonly el: HTMLElement }>();
  /** a file's picture (an object URL), null when it is not on this device */
  readonly #urls = new Map<string, string | null>();

  constructor() {
    super();
    this.jump = false;
    this.editing = null;
    this.files = [];
    this.adding = 0;
  }
  override connectedCallback(): void {
    super.connectedCallback();
    this.style.display = 'contents'; // its parts are the drawer's flex items
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#resize?.disconnect();
    this.#resize = null;
    for (const u of this.#urls.values()) if (u) URL.revokeObjectURL(u);
    this.#urls.clear();
  }

  /* ---------- scrolling: the reader stays where they read ---------- */
  #box(): HTMLElement | null {
    return this.querySelector<HTMLElement>('.msgs');
  }
  /**
   * Like the chat apps: another conversation opens at its end; a new turn brings the learner's message to the top, and
   * the reply then grows below it WITHOUT moving the page, so the learner reads it as it comes (and anywhere above);
   * ↓ brings back the end.
   */
  protected override updated(): void {
    const v = this.view,
      box = this.#box();
    if (!v || !box) return;
    const s = v.session,
      key = s.key(),
      hist = s.history();
    if (key !== this.#seenKey || hist !== this.#seenHist) {
      if (key !== this.#seenKey) this.editing = null;
      this.#tail(box, 0);
      box.scrollTop = box.scrollHeight;
    } else if (s.busy && !this.#wasBusy) this.#revealTurn(box);
    else if (s.error && !this.#wasErr) box.querySelector('.msg.err')?.scrollIntoView({ block: 'nearest' });
    this.#seenKey = key;
    this.#seenHist = hist;
    this.#wasBusy = s.busy;
    this.#wasErr = !!s.error;
    if (this.#focusEdit) {
      this.#focusEdit = false;
      const ta = box.querySelector<HTMLTextAreaElement>('.ns-edit textarea');
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
        ta.style.height = String(Math.min(240, ta.scrollHeight)) + 'px';
      }
    }
    this.#fitMath(box);
    this.#checkJump(box);
    if (!this.#resize) {
      this.#resize = new ResizeObserver(() => {
        const b = this.#box();
        if (b) this.#fitMath(b, true);
      });
      this.#resize.observe(box);
    }
  }
  #resize: ResizeObserver | null = null;
  /** a display formula wider than the talk even after its breaks is drawn smaller to fit: the talk never scrolls sideways */
  #fitMath(box: HTMLElement, all = false): void {
    for (const b of box.querySelectorAll<HTMLElement>('.mathblock')) {
      if (!all && b.dataset['fit'] === String(box.clientWidth)) continue;
      b.dataset['fit'] = String(box.clientWidth);
      b.style.fontSize = '';
      const w = b.clientWidth,
        sw = b.scrollWidth;
      if (w > 0 && sw > w + 1) b.style.fontSize = Math.max(0.5, (w - 2) / sw).toFixed(3) + 'em';
    }
  }
  /** the room under the conversation that lets the newest message of the learner reach the top */
  #tail(box: HTMLElement, px: number): void {
    const t = box.querySelector<HTMLElement>(':scope > .ns-tail');
    if (t) t.style.height = String(Math.max(0, Math.round(px))) + 'px';
  }
  #revealTurn(box: HTMLElement): void {
    const me = [...box.querySelectorAll<HTMLElement>(':scope > .msg.me')].at(-1);
    if (!me) return;
    const bt = box.getBoundingClientRect().top;
    const top = me.getBoundingClientRect().top - bt + box.scrollTop;
    const tall = me.offsetHeight > box.clientHeight * 0.5;
    const target = Math.max(0, tall ? top + me.offsetHeight - box.clientHeight * 0.35 : top - 12);
    const tail = box.querySelector<HTMLElement>(':scope > .ns-tail');
    const below = box.scrollHeight - target - (tail?.offsetHeight ?? 0);
    this.#tail(box, box.clientHeight - below);
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    box.scrollTo({ top: target, behavior: smooth ? 'smooth' : 'auto' });
  }
  /** the end of what is written (the room under it does not count) */
  #lastBottom(box: HTMLElement): number {
    const last = [...box.querySelectorAll<HTMLElement>(':scope > .msg, :scope > .ns-msgbar')].at(-1);
    return last ? last.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom : 0;
  }
  #checkJump(box: HTMLElement): void {
    const far = this.#lastBottom(box) > 80;
    if (far !== this.jump) this.jump = far;
  }
  #toLatest(): void {
    const box = this.#box();
    if (box) box.scrollTo({ top: box.scrollTop + this.#lastBottom(box) + 16, behavior: 'smooth' });
  }
  /** focuses the box to write in */
  focusComposer(): void {
    this.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus();
  }

  /* ---------- files ---------- */
  async #addFiles(list: readonly File[]): Promise<void> {
    const v = this.view;
    if (!v || !list.length) return;
    const s = v.session,
      reader = s.fileReader();
    for (const f of list) {
      const type = f.type || 'application/octet-stream';
      const image = /^image\//.test(type);
      const why = refusal({ mediaType: type, name: f.name, size: image ? 0 : f.size }, reader, this.files.length + this.adding);
      if (why) {
        v.toast(this.t('engine.tutor.file_' + why, { name: f.name, n: MAX_FILES, mb: Math.round(MAX_FILE_BYTES / 1048576) }), 4000);
        continue;
      }
      this.adding++;
      try {
        const sf = await v.readFile(f);
        if (sf.bytes.length > MAX_FILE_BYTES) {
          v.toast(this.t('engine.tutor.file_size', { name: f.name, mb: Math.round(MAX_FILE_BYTES / 1048576) }), 4000);
          continue;
        }
        const a = await s.attach(sf);
        if (a) this.files = [...this.files, a];
        else v.toast(this.t('engine.tutor.file_failed', { name: f.name }), 4000);
      } catch {
        v.toast(this.t('engine.tutor.file_failed', { name: f.name }), 4000);
      } finally {
        this.adding--;
      }
    }
  }
  #pick(): void {
    const v = this.view;
    if (!v) return;
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.multiple = true;
    inp.accept = acceptFor(v.session.fileReader());
    inp.addEventListener('change', () => {
      void this.#addFiles([...(inp.files ?? [])]);
    });
    inp.click();
  }
  #onDrop = (e: DragEvent): void => {
    if (!e.dataTransfer?.files.length) return;
    e.preventDefault();
    void this.#addFiles([...e.dataTransfer.files]);
  };
  #onDragOver = (e: DragEvent): void => {
    if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
  };
  #url(a: Attachment): string | null | undefined {
    if (this.#urls.has(a.id)) return this.#urls.get(a.id);
    const v = this.view;
    if (!v || this.#loading.has(a.id)) return undefined;
    this.#loading.add(a.id);
    void v.session.file(a.id).then(f => {
      this.#urls.set(
        a.id,
        !f ? null : a.kind === 'image' ? URL.createObjectURL(new Blob([f.bytes as Uint8Array<ArrayBuffer>], { type: f.mediaType })) : '',
      );
      this.requestUpdate();
    });
    return undefined;
  }
  readonly #loading = new Set<string>();
  /** a message's files: pictures as pictures, the rest by name (one not on this device says so) */
  #fileList(list: readonly Attachment[], remove?: (a: Attachment) => void): TemplateResult | typeof nothing {
    if (!list.length) return nothing;
    return html`<div class="ns-files">
      ${list.map(a => {
        const u = this.#url(a);
        const gone = u === null;
        const x = remove
          ? html`<button
              type="button"
              class="ns-fx"
              title=${this.t('engine.tutor.removeFile', { name: a.name })}
              aria-label=${this.t('engine.tutor.removeFile', { name: a.name })}
              @click=${() => {
                remove(a);
              }}
            >
              ${icon('close')}
            </button>`
          : nothing;
        if (a.kind === 'image' && u) return html`<span class="ns-file img"><img src=${u} alt=${a.name} loading="lazy" />${x}</span>`;
        return html`<span class=${'ns-file' + (gone ? ' gone' : '')} title=${gone ? this.t('engine.tutor.fileMissing') : a.name}
          >${icon(a.kind === 'image' ? 'eye' : a.kind === 'audio' ? 'mic' : a.kind === 'video' ? 'play' : 'doc')}<span class="nm"
            >${a.name}</span
          >${x}</span
        >`;
      })}
    </div>`;
  }

  /* ---------- writing, editing ---------- */
  #send(): void {
    const ta = this.querySelector<HTMLTextAreaElement>('.composer textarea');
    const v = (ta?.value ?? '').trim();
    const files = this.files;
    if ((!v && !files.length) || !ta || this.adding) return;
    ta.value = '';
    ta.style.height = 'auto';
    this.#draft = '';
    this.files = [];
    void this.view?.session.send(v, files.length ? { attachments: files } : {});
  }
  #startEdit(i: number, m: Turn): void {
    this.#editText = m.text;
    this.#editFiles = [...(m.attachments ?? [])];
    this.#focusEdit = true;
    this.editing = i;
  }
  #saveEdit(i: number): void {
    const text = this.#editText.trim(),
      files = this.#editFiles;
    if (!text && !files.length) return;
    this.editing = null;
    void this.view?.session.edit(i, text, files);
  }
  #editor(i: number): TemplateResult {
    const send = this.t('engine.tutor.send'),
      cancel = this.t('engine.tutor.editCancel');
    return html`<div class="msg me ns-edit">
      ${this.#fileList(this.#editFiles, a => {
        this.#editFiles = this.#editFiles.filter(x => x !== a);
        this.requestUpdate();
      })}
      <textarea
        rows="2"
        aria-label=${this.t('engine.tutor.edit')}
        .value=${this.#editText}
        @input=${(e: Event) => {
          const ta = e.target as HTMLTextAreaElement;
          this.#editText = ta.value;
          ta.style.height = 'auto';
          ta.style.height = String(Math.min(240, ta.scrollHeight)) + 'px';
        }}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            this.editing = null;
          } else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
            e.preventDefault();
            this.#saveEdit(i);
          }
        }}
      ></textarea>
      <div class="ns-editrow">
        <button
          class="btn small ghost"
          type="button"
          @click=${() => {
            this.editing = null;
          }}
        >
          ${cancel}
        </button>
        <button
          class="btn small primary"
          type="button"
          @click=${() => {
            this.#saveEdit(i);
          }}
        >
          ${send}
        </button>
      </div>
    </div>`;
  }
  #composer(placeholder: string, labelled: boolean): TemplateResult {
    const v = this.view;
    const send = this.t('engine.tutor.send'),
      stop = this.t('engine.tutor.stop'),
      attach = this.t('engine.tutor.attach');
    const busy = !!v?.session.busy;
    const canAttach = !!v && v.session.fileReader() !== 'copy';
    return html`${
        this.files.length || this.adding
          ? html`<div class="ns-pending" aria-live="polite">
              ${this.#fileList(this.files, a => {
                this.files = this.files.filter(x => x !== a);
              })}
              ${this.adding ? html`<span class="ns-adding" role="status">${this.t('engine.tutor.adding')}</span>` : nothing}
            </div>`
          : nothing
      }
      <div class="composer" @dragover=${this.#onDragOver} @drop=${this.#onDrop}>
        ${
          canAttach
            ? html`<button
                class="iconbtn ns-attach"
                type="button"
                title=${attach}
                aria-label=${attach}
                @click=${() => {
                  this.#pick();
                }}
              >
                ${icon('attach')}
              </button>`
            : nothing
        }
        <textarea
          rows="1"
          placeholder=${placeholder}
          aria-label=${labelled ? placeholder : send}
          .value=${this.#draft}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
              e.preventDefault();
              if (!busy) this.#send();
            }
          }}
          @paste=${(e: ClipboardEvent) => {
            const fs = [...(e.clipboardData?.files ?? [])];
            if (!fs.length || !canAttach) return;
            if (!e.clipboardData?.getData('text/plain')) e.preventDefault();
            void this.#addFiles(fs);
          }}
          @input=${(e: Event) => {
            const ta = e.target as HTMLTextAreaElement;
            this.#draft = ta.value;
            ta.style.height = 'auto';
            ta.style.height = String(Math.min(160, ta.scrollHeight)) + 'px';
          }}
        ></textarea>
        ${
          busy
            ? html`<button
                class="send ns-stop"
                type="button"
                title=${stop}
                aria-label=${stop}
                @click=${() => {
                  v.session.stop();
                }}
              >
                ${icon('stop')}
              </button>`
            : html`<button
                class="send"
                type="button"
                title=${send}
                aria-label=${send}
                ?disabled=${this.adding > 0}
                @click=${() => {
                  this.#send();
                }}
              >
                ➤
              </button>`
        }
      </div>`;
  }
  #faceEl(): TemplateResult {
    const v = this.view;
    const svg = v?.face() ?? '';
    return svg
      ? html`<div class="avatar face" aria-hidden="true">${unsafeHTML(svg)}</div>`
      : html`<div class="avatar" aria-hidden="true">${v?.tutor().avatar ?? ''}</div>`;
  }
  #text(v: TutorView, m: Turn): HTMLElement {
    const had = this.#md.get(m);
    if (had?.text === m.text) return had.el;
    const el = v.md(m.text);
    this.#md.set(m, { text: m.text, el });
    return el;
  }
  #iconBtn(name: Parameters<typeof icon>[0], label: string, run: () => void, disabled = false): TemplateResult {
    return html`<button class="ns-mb" type="button" title=${label} aria-label=${label} ?disabled=${disabled} @click=${run}>
      ${icon(name)}
    </button>`;
  }
  /** ‹ 2/3 › when a turn has other versions */
  #versions(v: TutorView, i: number, branched: boolean): TemplateResult | typeof nothing {
    if (!branched) return nothing;
    const s = v.session,
      [n, of] = s.version(i);
    if (of < 2) return nothing;
    return html`<span class="ns-ver" role="group" aria-label=${this.t('engine.tutor.versionOf', { n, total: of })}>
      ${this.#iconBtn(
        'prev',
        this.t('engine.tutor.prevVersion'),
        () => {
          s.switchVersion(i, -1);
        },
        n <= 1 || s.busy,
      )}
      <span class="ns-vn" aria-hidden="true">${v.i18n.format.number(n)}/${v.i18n.format.number(of)}</span>
      ${this.#iconBtn(
        'forward',
        this.t('engine.tutor.nextVersion'),
        () => {
          s.switchVersion(i, 1);
        },
        n >= of || s.busy,
      )}
    </span>`;
  }
  /** the conversation: each message with its tools, the lessons under a reply, the reply as it streams, a failed turn */
  #messages(v: TutorView): TemplateResult[] {
    const s = v.session,
      hist = s.history(),
      branched = s.branches().length > 0;
    const out: TemplateResult[] = [];
    hist.forEach((m, i) => {
      if (m.hidden) return;
      if (m.role === 'user') {
        if (this.editing === i) {
          out.push(this.#editor(i));
          return;
        }
        const waiting = i === hist.length - 1 && !s.busy && !s.error;
        out.push(html`<div class="msg me">${this.#fileList(m.attachments ?? [])}${m.text ? this.#text(v, m) : nothing}</div>`);
        out.push(
          html`<div class="ns-msgbar me">
            ${this.#versions(v, i, branched)}
            ${this.#iconBtn('edit', this.t('engine.tutor.edit'), () => {
              this.#startEdit(i, m);
            })}
            ${
              waiting
                ? this.#iconBtn('regenerate', this.t('engine.tutor.retry'), () => {
                    void s.regenerate(i);
                  })
                : nothing
            }
          </div>`,
        );
        return;
      }
      const lessons = (m.meta?.noemaState?.resolved ?? []).filter(r => r?.lesson);
      out.push(
        html`<div class="msg ai">
          ${this.#text(v, m)}${
            lessons.length
              ? html`<div class="lessonchips">
                  ${lessons.map(r => html`<span class="lessonchip">${unsafeHTML('📌 ' + this.t('engine.tutor.savedLesson', { lesson: v.fmt(r?.lesson ?? '') }))}</span>`)}
                </div>`
              : nothing
          }
        </div>`,
      );
      out.push(
        html`<div class="ns-msgbar ai">
          ${this.#versions(v, i, branched)}
          ${this.#iconBtn('copy', this.t('engine.tutor.copyReply'), () => {
            void v.copy(m.text).then(ok => {
              if (ok) v.toast('📋 ' + this.t('engine.tutor.copied'), 2000);
            });
          })}
          ${this.#iconBtn('regenerate', this.t('engine.tutor.regenerate'), () => {
            void s.regenerate(i);
          })}
          ${m.meta?.['stopped'] ? html`<span class="ns-stopped">${this.t('engine.tutor.stopped')}</span>` : nothing}
        </div>`,
      );
    });
    if (s.busy)
      out.push(
        html`<div class="msg ai ns-live" aria-live="polite" aria-busy="true">
          ${s.stream ? v.md(s.stream) : html`<span class="typing" role="status" aria-label=${this.t('engine.tutor.thinking')}><i></i><i></i><i></i></span>`}
        </div>`,
      );
    const e = s.error;
    if (e?.sent) out.push(html`<div class="msg me">${v.md(e.sent)}</div>`);
    if (e)
      out.push(
        html`<div class="msg err" role="alert">
          ${v.md('⚠️ ' + e.text)}
          <div class="row" style="margin-top:8px">
            ${
              !e.sent && hist.at(-1)?.role === 'user'
                ? html`<button
                    class="btn small"
                    type="button"
                    @click=${() => {
                      void s.regenerate(hist.length - 1);
                    }}
                  >
                    ${icon('regenerate')} ${this.t('engine.tutor.retry')}
                  </button>`
                : nothing
            }
            <button
              class="btn small"
              type="button"
              @click=${() => {
                v.openSettings();
              }}
            >
              ⚙️ ${this.t('engine.tutor.settings')}
            </button>
            ${
              e.needsKey
                ? html`<button
                    class="btn small ghost"
                    type="button"
                    @click=${() => {
                      v.openGuide();
                    }}
                  >
                    🔑 ${this.t('engine.tutor.howKey')}
                  </button>`
                : nothing
            }
            ${
              e.prompt
                ? html`<button
                    class="btn small ghost tutor-copy"
                    type="button"
                    @click=${async () => {
                      if (await v.copy(e.prompt ?? '')) v.toast('📋 ' + this.t('engine.tutor.promptCopied'), 3500);
                    }}
                  >
                    📋 ${this.t('engine.tutor.copyPrompt')}
                  </button>`
                : nothing
            }
          </div>
        </div>`,
      );
    return out;
  }

  protected override render(): TemplateResult | typeof nothing {
    const v = this.view;
    if (!v) return nothing;
    return this.#framed(v);
  }

  /* ---------- in the frame ---------- */
  #framed(v: TutorView): TemplateResult {
    const s = v.session,
      hist = s.history(),
      ui = v.uiLang();
    const ex = s.ctx?.kind === 'exercise';
    const what = ex ? v.L('forExercise') : s.ctx ? s.ctxParts()[2] : v.L('tutorWhole');
    const langItem = (): MenuItem => {
      const cur = v.chatLangs().find(([x]) => x && v.chatLangIs(x)) ?? v.chatLangs()[0];
      return {
        label: v.L('chatLangItem'),
        ...(cur ? { sub: cur[1] } : {}),
        icon: '🗣',
        run: () =>
          void setTimeout(() => {
            const btn =
              this.querySelector<HTMLElement>('.ns-dh .top .ns-menu button') ?? this.querySelector<HTMLElement>('.ns-dh .top .ns-menubtn');
            if (btn)
              v.popMenu(
                btn,
                v.chatLangs().map(([x, l]) => ({
                  label: l,
                  icon: (x ? v.chatLangIs(x) : !v.chatLang()) ? '✓' : ' ',
                  run: () => {
                    v.setChatLang(x);
                  },
                })),
              );
          }, 0),
      };
    };
    const more = v.menuButton(
      () => [
        {
          label: v.L('chatHistory'),
          icon: 'clock',
          run: () => {
            v.history();
          },
        }, // every subject, grouped by Roadmap and step: a window of its own
        {
          label: v.L('chatNew'),
          icon: '↺',
          run: () => {
            s.fresh();
          },
        },
        s.history().length
          ? {
              label: v.L('chatExport'),
              icon: '⬇️',
              run: () => {
                v.exportOne(s.current());
              },
            }
          : null,
        langItem(),
      ],
      v.L('more'),
    );
    const modeMenu = (e: Event): void => {
      e.stopPropagation();
      const btn = e.currentTarget as HTMLElement,
        wrap = btn.parentElement;
      const had = wrap?.querySelector(':scope > .ns-pop');
      v.closePops();
      if (had) return;
      v.popMenu(
        btn,
        MODES_SHOWN(s.mode).map(k => ({
          label: shellMode(v, k),
          sub: shellSub(v, k),
          icon: s.mode === k ? '✓' : ' ',
          run: () => {
            s.setMode(k);
          },
        })),
      );
    };
    let greet: TemplateResult | typeof nothing = nothing;
    if (!hist.length && !s.busy && !s.error) {
      const topic = s.ctx && !ex ? '«' + what + '»' : what,
        name = v.accountName();
      const hi = v.L('greet' + MODE_WORDS[s.mode], { name, topic });
      greet = html`<div class="msg ai ns-greet" lang=${ui}>${name ? hi : hi.replace(/,?\s+([.,])/, '$1')}</div>`;
    }
    const sub = shellSub(v, s.mode);
    // one line: the button's text is read whole ("Socratic · I ask you▾"), so no whitespace around its parts
    // prettier-ignore
    const modeBtn = html`<button class="ns-modesel" type="button" data-pop="1" aria-haspopup="menu" aria-expanded="false" @click=${modeMenu}><b>${shellMode(v, s.mode)}</b>${sub ? html`<span class="sub"> · ${sub}</span>` : nothing}<span class="caret" aria-hidden="true">▾</span></button>`;
    return html`<div class="dh ns-dh" lang=${ui}>
        <div class="top">
          ${this.#faceEl()}<b class="ns-tname grow">${v.tutor().name}</b>${more}
          <button
            class="iconbtn"
            type="button"
            title=${v.L('close')}
            aria-label=${v.L('close')}
            @click=${() => {
              s.close();
            }}
          >
            ✕
          </button>
        </div>
        <div class="ns-modelabel">${v.L(v.tutor().plural ? 'tutorHelpsPl' : 'tutorHelps')}</div>
        <div class="ns-menu ns-modewrap">${modeBtn}</div>
      </div>
      <div class="ns-forrow" lang=${ui}>
        <span class="ctxchip ns-forchip"
          ><span class="ns-fortext" title=${v.L('tutorFor', { what })}>${v.L('tutorFor', { what })}</span>${
            s.ctx
              ? html`<button
                  type="button"
                  title=${v.L('tutorWholeBack')}
                  aria-label=${v.L('tutorWholeBack')}
                  @click=${() => {
                    s.setContext(null);
                  }}
                >
                  ✕
                </button>`
              : nothing
          }</span
        >
      </div>
      <noema-tutor-threads .view=${v}></noema-tutor-threads>
      <div
        class="msgs"
        @scroll=${(e: Event) => {
          this.#checkJump(e.currentTarget as HTMLElement);
        }}
        @dragover=${this.#onDragOver}
        @drop=${this.#onDrop}
      >
        ${greet}${this.#messages(v)}
        <div class="ns-tail" aria-hidden="true"></div>
        ${
          this.jump
            ? html`<div class="ns-jumpwrap">
                <button
                  class=${'ns-jump' + (s.busy ? ' live' : '')}
                  type="button"
                  title=${this.t('engine.tutor.jumpLatest')}
                  aria-label=${this.t('engine.tutor.jumpLatest')}
                  @click=${() => {
                    this.#toLatest();
                  }}
                >
                  ${icon('down')}
                </button>
              </div>`
            : nothing
        }
      </div>
      ${this.#composer(v.L('tutorWrite'), true)}`;
  }
}

/** The thread tracker over the conversation: what the learner works on, the attempts, the lessons, 💡 tell me, 🎓 wrap up. */
/** the learner folded the bar away (this device: a convenience, kept in the browser) */
const FOLD_KEY = 'noema-tutor:threadbarFolded';
/** how long a folded bar shows after an answer */
const PEEK_MS = 4000;
const readFold = (): boolean => {
  try {
    return localStorage.getItem(FOLD_KEY) === '1';
  } catch {
    return false;
  }
};

export class NoemaTutorThreads extends TutorElement {
  static override properties = {
    ...TutorElement.properties,
    expanded: { state: true },
    folded: { state: true },
    peek: { state: true },
  };
  declare expanded: boolean;
  /** folded to one thin line (the talk gets the room); ⌄ opens it again */
  declare folded: boolean;
  constructor() {
    super();
    this.expanded = false;
    this.folded = readFold();
    this.peek = false;
  }
  #fold(on: boolean): void {
    this.folded = on;
    this.peek = false;
    try {
      localStorage.setItem(FOLD_KEY, on ? '1' : '0');
    } catch {
      return; // no storage here: folded for this page only
    }
  }
  /** folded, it opens for a few seconds after each of the tutor's answers (Tell me, Wrap up), then folds again */
  declare peek: boolean;
  #lastReply: string | null | undefined = undefined;
  #peekTimer: ReturnType<typeof setTimeout> | null = null;
  #hover = false;
  #lastKey = '';
  protected override willUpdate(): void {
    super.willUpdate();
    const s = this.view?.session;
    if (!s) return;
    const key = s.key(),
      last = s.busy ? this.#lastReply : (s.history().findLast(m => m.role === 'model')?.id ?? null);
    // a new answer in the same conversation (not another conversation opened)
    if (key === this.#lastKey && this.#lastReply !== undefined && last && last !== this.#lastReply && this.folded) this.#startPeek();
    this.#lastKey = key;
    this.#lastReply = last;
  }
  #startPeek(): void {
    this.peek = true;
    if (this.#peekTimer) clearTimeout(this.#peekTimer);
    this.#peekTimer = setTimeout(() => {
      this.#peekTimer = null;
      if (!this.#hover) this.peek = false;
    }, PEEK_MS);
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this.#peekTimer) clearTimeout(this.#peekTimer);
  }
  override connectedCallback(): void {
    super.connectedCallback();
    this.style.display = 'contents';
  }
  protected override render(): TemplateResult | typeof nothing {
    const v = this.view;
    if (!v) return nothing;
    const s = v.session,
      n = s.history().length;
    if (!n) return nothing;
    const ts = s.threads(),
      socr = usesThreads(s.mode);
    const open = ts ? openThreads(ts) : [];
    const focus = ts ? open.find(t => t.id === ts.focus) : undefined;
    const toggle = (): void => {
      this.expanded = !this.expanded;
    };
    let row: TemplateResult;
    if (socr && ts) {
      const budget = (t: Thread): number => t.budget || THREAD_BUDGET;
      row = html`<span class="tb-ic" aria-hidden="true">${open.length ? '🧵' : '✅'}</span>
        <div class="grow tb-txt">
          ${
            focus
              ? html`<span
                  ><b>${this.t('engine.thr.workingOn')} </b>${focus.question}
                  <span class=${'pill ' + (focus.attempts >= budget(focus) - 1 ? 'warnpill' : '')}
                    >${this.t('engine.thr.try', { n: Math.min(focus.attempts + 1, budget(focus)), of: budget(focus) })}</span
                  ></span
                >`
              : html`<span
                  >${open.length ? this.t('engine.thr.open', { n: open.length }) : ts.lessons.length ? this.t('engine.thr.allAnswered') : this.t('engine.thr.askAnything')}</span
                >`
          }
        </div>
        ${
          ts.lessons.length
            ? html`<button class="pill c tb-lessons" type="button" aria-expanded=${this.expanded ? 'true' : 'false'} @click=${toggle}>
                📌 ${this.t('engine.thr.lessons', { n: ts.lessons.length })}
              </button>`
            : nothing
        }
        ${
          ts.threads.length
            ? html`<button
                class="iconbtn tb-more"
                type="button"
                title=${this.t('engine.thr.showAll')}
                aria-label=${this.t('engine.thr.showAll')}
                aria-expanded=${this.expanded ? 'true' : 'false'}
                @click=${toggle}
              >
                ▾
              </button>`
            : nothing
        }`;
    } else
      row = html`<span class="tb-ic" aria-hidden="true">🎯</span>
        <div class="grow tb-txt tiny">${this.t('engine.thr.takeaways')}</div>`;
    // the buttons and the message they send (the learner's bubble) speak the UI language; the directive tells the AI what to do
    const tell = socr && focus;
    const wrap = n >= 2;
    let tree: TemplateResult | typeof nothing = nothing;
    if (ts?.threads.length) {
      const kids = (p: string | null): Thread[] => ts.threads.filter(t => (t.parent ?? null) === p);
      const nodes: TemplateResult[] = [];
      const draw = (t: Thread, d: number): void => {
        nodes.push(
          html`<div class=${'tb-node ' + t.status} style=${`padding-inline-start:${String(8 + d * 16)}px`}>
            <span aria-hidden="true">${t.status === 'open' ? (t.id === ts.focus ? '👉' : '⏳') : '✅'}</span>
            <div class="grow">
              <div>${t.question}</div>
              ${t.lesson ? html`<div class="tb-lesson">${unsafeHTML('📌 ' + v.fmt(t.lesson))}</div>` : nothing}
            </div>
          </div>`,
        );
        kids(t.id).forEach(c => {
          draw(c, d + 1);
        });
      };
      kids(null).forEach(t => {
        draw(t, 0);
      });
      for (const l of ts.lessons.filter(x => !x.thread))
        nodes.push(
          html`<div class="tb-node resolved" style="padding-inline-start:8px">
            <span aria-hidden="true">📌</span>
            <div class="grow tb-lesson">${unsafeHTML(v.fmt(l.text))}</div>
          </div>`,
        );
      tree = html`<div class="tb-tree">${nodes}</div>`;
    }
    const foldBtn = (on: boolean): TemplateResult => {
      const label = this.t(on ? 'engine.thr.hideBar' : 'engine.thr.showBar');
      return html`<button
        class="iconbtn tb-fold"
        type="button"
        title=${label}
        aria-label=${label}
        aria-expanded=${on ? 'true' : 'false'}
        @click=${() => {
          this.#fold(on);
        }}
      >
        ${icon(on ? 'up' : 'down')}
      </button>`;
    };
    if (this.folded && !this.peek)
      return html`<div class="threadbar folded">
        <div class="tb-row">
          <span class="tb-ic" aria-hidden="true">${socr && ts ? (open.length ? '🧵' : '✅') : '🎯'}</span>
          <div class="grow tb-txt tiny">
            ${focus ? focus.question : ts?.lessons.length ? this.t('engine.thr.lessons', { n: ts.lessons.length }) : this.t('engine.thr.takeaways')}
          </div>
          ${foldBtn(false)}
        </div>
      </div>`;
    return html`<div
      class=${'threadbar' + (this.expanded ? ' open' : '') + (this.peek ? ' peek' : '')}
      @pointerenter=${() => {
        this.#hover = true;
      }}
      @pointerleave=${() => {
        this.#hover = false;
        if (this.peek && !this.#peekTimer) this.peek = false;
      }}
    >
      <div class="tb-row">${row}${this.folded ? foldBtn(false) : foldBtn(true)}</div>
      ${
        tell || wrap
          ? html`<div class="tb-actions">
              ${
                tell
                  ? html`<button
                      class="btn small"
                      type="button"
                      @click=${() => {
                        void s.send(this.t('engine.aimsg.tellMe'), { directive: 'tellme' });
                      }}
                    >
                      💡 ${this.t('engine.thr.tellMe')}
                    </button>`
                  : nothing
              }
              ${
                wrap
                  ? html`<button
                      class="btn small primary"
                      type="button"
                      @click=${() => {
                        void s.send(this.t('engine.aimsg.wrapUp'), { directive: 'wrapup' });
                      }}
                    >
                      🎓 ${this.t('engine.thr.wrapUp')}
                    </button>`
                  : nothing
              }
            </div>`
          : nothing
      }
      ${tree}
    </div>`;
  }
}
