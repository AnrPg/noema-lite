/**
 * The tutor's drawer (docs/UI_MAP.md), drawn from the session's state:
 *  · in the frame: face, name, ⋮, ✕ · "How <name> helps you" over one list of the modes · a "For: …" chip (✕ = the whole
 *    subject) · the threads · the conversation · the box to write in. Nothing else;
 *  · classic (an old index.html): face, name and model, 🕘 ⬇️ ↺ ✕ · the context chip and the 🗣 language · the mode chips ·
 *    the starters of an empty conversation, and the history inside the drawer.
 * The thread tracker (noema-tutor-threads) and the drawer's history (noema-tutor-history) are elements of their own.
 */
import { html, nothing, type TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { CHOOSABLE, MODE_ICON, MODE_WORDS, type ModeId } from '../domain/prompts.ts';
import { THREAD_BUDGET, openThreads, usesThreads, type Thread } from '../domain/threads.ts';
import { fmtDate, isTutor, kindBadge, modeName, otherApp, type Conversation } from '../domain/conversation.ts';
import { TutorElement, type MenuItem, type TutorView } from './view.ts';

const MODES_SHOWN = (current: ModeId): ModeId[] =>
  (['socratic', 'explain', 'hint', 'quiz', 'interview', 'debug'] as ModeId[]).filter(k => k !== 'hint' || current === k);

/** a mode's chip label in the classic drawer: its emoji (socratic: the tutor's avatar) and its name */
export function modeLabel(v: TutorView, k: ModeId): string {
  return `${MODE_ICON[k] || v.tutor().avatar} ` + v.i18n.t('engine.mode.' + k);
}
const shellMode = (v: TutorView, k: ModeId): string => v.L('mode' + MODE_WORDS[k]);
const shellSub = (v: TutorView, k: ModeId): string => v.L('mode' + MODE_WORDS[k] + 'Sub');

export class NoemaTutorPanel extends TutorElement {
  #draft = '';

  override connectedCallback(): void {
    super.connectedCallback();
    this.style.display = 'contents'; // its parts are the drawer's flex items
  }
  protected override updated(): void {
    const m = this.querySelector<HTMLElement>('.msgs');
    if (m) m.scrollTop = m.scrollHeight;
  }
  /** focuses the box to write in */
  focusComposer(): void {
    this.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus();
  }

  #send(): void {
    const ta = this.querySelector<HTMLTextAreaElement>('.composer textarea');
    const v = (ta?.value ?? '').trim();
    if (!v || !ta) return;
    ta.value = '';
    ta.style.height = 'auto';
    this.#draft = '';
    void this.view?.session.send(v);
  }
  #composer(placeholder: string, labelled: boolean): TemplateResult {
    const send = this.t('engine.tutor.send');
    return html`<div class="composer">
      <textarea
        rows="1"
        placeholder=${placeholder}
        aria-label=${labelled ? placeholder : send}
        .value=${this.#draft}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            this.#send();
          }
        }}
        @input=${(e: Event) => {
          const ta = e.target as HTMLTextAreaElement;
          this.#draft = ta.value;
          ta.style.height = 'auto';
          ta.style.height = String(Math.min(160, ta.scrollHeight)) + 'px';
        }}
      ></textarea>
      <button
        class="send"
        type="button"
        title=${send}
        aria-label=${send}
        @click=${() => {
          this.#send();
        }}
      >
        ➤
      </button>
    </div>`;
  }
  #faceEl(): TemplateResult {
    const v = this.view;
    const svg = v?.face() ?? '';
    return svg
      ? html`<div class="avatar face" aria-hidden="true">${unsafeHTML(svg)}</div>`
      : html`<div class="avatar" aria-hidden="true">${v?.tutor().avatar ?? ''}</div>`;
  }
  /** the conversation: each message, the lessons under a reply, the reply as it streams, a failed turn */
  #messages(v: TutorView): TemplateResult[] {
    const s = v.session;
    const out = s.history().map(m => {
      if (m.hidden) return html``;
      const lessons = m.role !== 'user' ? (m.meta?.noemaState?.resolved ?? []).filter(r => r?.lesson) : [];
      return html`<div class=${'msg ' + (m.role === 'user' ? 'me' : 'ai')}>
        ${v.md(m.text)}${
          lessons.length
            ? html`<div class="lessonchips">
                ${lessons.map(r => html`<span class="lessonchip">${unsafeHTML('📌 ' + this.t('engine.tutor.savedLesson', { lesson: v.fmt(r?.lesson ?? '') }))}</span>`)}
              </div>`
            : nothing
        }
      </div>`;
    });
    if (s.busy)
      out.push(
        html`<div class="msg ai" aria-live="polite">
          ${s.stream ? v.md(s.stream) : html`<span class="typing" role="status" aria-label=${this.t('engine.tutor.thinking')}><i></i><i></i><i></i></span>`}
        </div>`,
      );
    const e = s.error;
    if (e)
      out.push(
        html`<div class="msg err" role="alert">
          ${v.md('⚠️ ' + e.text)}
          <div class="row" style="margin-top:8px">
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
    return v.framed() ? this.#framed(v) : this.#classic(v);
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
        <div class="ns-menu ns-modewrap">
          <button class="ns-modesel" type="button" data-pop="1" aria-haspopup="menu" aria-expanded="false" @click=${modeMenu}>
            <b>${shellMode(v, s.mode)}</b>${sub ? html`<span class="sub"> · ${sub}</span>` : nothing}<span class="caret" aria-hidden="true"
              >▾</span
            >
          </button>
        </div>
      </div>
      <div class="ns-forrow" lang=${ui}>
        <span class="ctxchip ns-forchip"
          >${v.L('tutorFor', { what })}${
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
      <div class="msgs">${greet}${this.#messages(v)}</div>
      ${this.#composer(v.L('tutorWrite'), true)}`;
  }

  /* ---------- classic ---------- */
  #classic(v: TutorView): TemplateResult {
    const s = v.session,
      hist = s.history();
    const tools: [string, string, () => void][] = [
      [
        this.t('engine.tutor.history'),
        '🕘',
        () => {
          s.toggleHistory();
        },
      ],
      [
        this.t('engine.tutor.export'),
        '⬇️',
        () => {
          v.exportOne(s.current());
        },
      ],
      [
        this.t('engine.tutor.newConvo'),
        '↺',
        () => {
          s.fresh();
        },
      ],
    ];
    const label = s.ctxParts();
    const ctxLabel = label[0] + ' ' + s.ctxTitle();
    const starters = (): TemplateResult => {
      const topic = s.ctx ? s.ctxTitle() : v.subjectTitle();
      const list: [string, ModeId, string][] = [
        [`${v.tutor().avatar} ` + this.t('engine.tutor.starterSocratic'), 'socratic', this.t('engine.aimsg.startSocratic', { topic })],
        ['⚡ ' + this.t('engine.tutor.starterQuiz'), 'quiz', this.t('engine.aimsg.startQuiz', { topic })],
        ['🔧 ' + this.t('engine.tutor.starterDebug'), 'debug', this.t('engine.aimsg.startDebug', { topic })],
        ['🎤 ' + this.t('engine.tutor.starterInterview'), 'interview', this.t('engine.aimsg.startInterview', { topic })],
        ['💡 ' + this.t('engine.tutor.starterExplain'), 'explain', this.t('engine.aimsg.startExplain', { topic })],
      ];
      const greet = { name: v.accountName(), tutor: v.tutor().name, avatar: v.tutor().avatar, mode: modeLabel(v, s.mode) };
      return html`<div class="msg ai">
          ${v.md(v.accountName() ? this.t('engine.tutor.greet', greet) : this.t('engine.tutor.greetAnon', greet))}
        </div>
        <div class="starters">
          ${list.map(
            ([l, m, msg]) =>
              html`<button
                type="button"
                @click=${() => {
                  s.setMode(m);
                  void s.send(msg);
                }}
              >
                ${l}
              </button>`,
          )}
        </div>`;
    };
    return html`<div class="dh">
        <div class="top">
          ${this.#faceEl()}
          <div class="grow">
            <b>${v.tutor().name}</b>
            <div class="tiny">${this.t('engine.tutor.poweredBy', { model: v.model() || this.t('engine.tutor.autoModel') })}</div>
          </div>
          ${tools.map(
            ([t, icon, run], i) =>
              html`<button
                class=${'iconbtn' + (i === 0 && s.showHistory ? ' on' : '')}
                type="button"
                title=${t}
                aria-label=${t}
                @click=${run}
              >
                ${icon}
              </button>`,
          )}
          <button
            class="iconbtn"
            type="button"
            title=${this.t('engine.tutor.close')}
            aria-label=${this.t('engine.tutor.close')}
            @click=${() => {
              s.close();
            }}
          >
            ✕
          </button>
        </div>
        <div class="row">
          <span class="ctxchip">${ctxLabel}</span>
          ${
            s.ctx
              ? html`<button
                  class="tiny linkish"
                  type="button"
                  style="text-decoration:underline"
                  @click=${() => {
                    s.setContext(null);
                  }}
                >
                  ${this.t('engine.tutor.useWhole')}
                </button>`
              : nothing
          }
          <select
            class="chatlang"
            title=${this.t('engine.tutor.chatLangTip')}
            aria-label=${this.t('engine.tutor.chatLangAria')}
            @change=${(e: Event) => {
              v.setChatLang((e.target as HTMLSelectElement).value);
            }}
          >
            ${v
              .chatLangs()
              .map(
                ([x, l]) =>
                  html`<option value=${x} ?selected=${v.chatLangIs(x) || (!x && !v.chatLang())} lang=${x || nothing}>🗣 ${l}</option>`,
              )}
          </select>
        </div>
        <div class="modechips">
          ${MODES_SHOWN(s.mode).map(
            k =>
              html`<button
                type="button"
                class=${s.mode === k ? 'on' : ''}
                aria-pressed=${s.mode === k ? 'true' : 'false'}
                @click=${() => {
                  s.setMode(k);
                }}
              >
                ${modeLabel(v, k)}
              </button>`,
          )}
        </div>
      </div>
      ${s.showHistory ? nothing : html`<noema-tutor-threads .view=${v}></noema-tutor-threads>`}
      ${
        s.showHistory
          ? html`<div class="msgs histbox"><noema-tutor-history .view=${v}></noema-tutor-history></div>`
          : html`<div class="msgs">${!hist.length && !s.busy && !s.error ? starters() : nothing}${this.#messages(v)}</div>`
      }
      ${this.#composer(this.t('engine.tutor.placeholder'), false)}`;
  }
}

/** The thread tracker over the conversation: what the learner works on, the attempts, the lessons, 💡 tell me, 🎓 wrap up. */
export class NoemaTutorThreads extends TutorElement {
  static override properties = { ...TutorElement.properties, expanded: { state: true } };
  declare expanded: boolean;
  constructor() {
    super();
    this.expanded = false;
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
    return html`<div class=${'threadbar' + (this.expanded ? ' open' : '')}>
      <div class="tb-row">${row}</div>
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

/** The classic drawer's history: this subject's conversations, searchable, each to reopen, rename, export or delete. */
export class NoemaTutorHistory extends TutorElement {
  static override properties = {
    ...TutorElement.properties,
    query: { state: true },
    allKinds: { state: true },
    editing: { state: true },
    sure: { state: true },
  };
  declare query: string;
  declare allKinds: boolean;
  declare editing: string | null;
  declare sure: string | null;
  constructor() {
    super();
    this.query = '';
    this.allKinds = false;
    this.editing = null;
    this.sure = null;
  }
  override connectedCallback(): void {
    super.connectedCallback();
    this.style.display = 'contents';
  }
  protected override updated(): void {
    const inp = this.querySelector<HTMLInputElement>('input.cvrename');
    if (inp && document.activeElement !== inp) {
      inp.focus();
      inp.select();
    }
  }
  protected override render(): TemplateResult | typeof nothing {
    const v = this.view;
    if (!v) return nothing;
    const s = v.session,
      i18n = v.i18n;
    const all = s.conversations(this.allKinds);
    const others = s.conversations(true).length - s.conversations().length;
    const q = this.query.trim().toLowerCase();
    const list = q
      ? all.filter(c =>
          (s.displayTitle(c) + ' ' + (c.ctx?.label ?? '') + ' ' + c.msgs.map(m => m.text).join(' ')).toLowerCase().includes(q),
        )
      : all;
    const done = (cv: Conversation, value: string | null): void => {
      this.editing = null;
      if (value !== null) s.rename(cv, value);
    };
    const card = (cv: Conversation, i: number): TemplateResult => {
      const app = otherApp(cv);
      const what = !isTutor(cv.kind)
        ? kindBadge(cv.kind, i18n)
        : CHOOSABLE.includes(cv.mode as ModeId)
          ? modeLabel(v, cv.mode as ModeId)
          : modeName(cv.mode, i18n);
      return html`<div class="cvcard" style=${`animation-delay:${String(Math.min(i, 12) * 25)}ms`}>
        ${
          this.editing === cv.id
            ? html`<input
                class="histsearch cvrename"
                aria-label=${this.t('engine.cv.rename')}
                .value=${s.displayTitle(cv)}
                @keydown=${(e: KeyboardEvent) => {
                  if (e.key === 'Enter') done(cv, (e.target as HTMLInputElement).value);
                  if (e.key === 'Escape') done(cv, null);
                }}
                @blur=${(e: Event) => {
                  if (this.editing === cv.id) done(cv, (e.target as HTMLInputElement).value);
                }}
              />`
            : html`<button
                class="cvmain"
                type="button"
                @click=${() => {
                  s.openConversation(cv);
                }}
              >
                <b class="cvtitle"
                  >${s.displayTitle(cv)}${!cv.title && s.titling.has(cv.id) ? html`<span class="tiny"> · ${this.t('engine.cv.namingShort')}</span>` : nothing}</b
                >
                <small
                  >${app ? html`<span class="cvfrom">${this.t('engine.cv.fromApp', { app })}</span>` : nothing}${what} ·
                  ${cv.ctx?.label ?? this.t('engine.cv.wholeCourse')}</small
                >
                <small>${fmtDate(cv.updated || cv.created)} · ${this.t('engine.cv.messages', { n: cv.msgs.length })}</small>
              </button>`
        }
        <div class="cvactions">
          <button
            class="iconbtn"
            type="button"
            title=${this.t('engine.cv.rename')}
            aria-label=${this.t('engine.cv.rename')}
            @click=${() => (this.editing = cv.id)}
          >
            ✏️
          </button>
          <button
            class="iconbtn"
            type="button"
            title=${this.t('engine.cv.exportMd')}
            aria-label=${this.t('engine.cv.exportMd')}
            @click=${() => {
              v.exportOne(cv);
            }}
          >
            ⬇️
          </button>
          <button
            class="iconbtn"
            type="button"
            title=${this.t(this.sure === cv.id ? 'engine.cv.deleteAgain' : 'engine.cv.delete')}
            aria-label=${this.t(this.sure === cv.id ? 'engine.cv.deleteAgain' : 'engine.cv.delete')}
            @click=${() => {
              if (this.sure !== cv.id) {
                this.sure = cv.id;
                return;
              }
              this.sure = null;
              s.remove(cv);
            }}
          >
            ${this.sure === cv.id ? '❓' : '🗑️'}
          </button>
        </div>
      </div>`;
    };
    return html`<div class="histhead">
        <b class="grow">🕘 ${this.t('engine.cv.title', { n: all.length })}</b>
        ${
          all.length
            ? html`<button
                class="btn small"
                type="button"
                @click=${() => {
                  v.exportAll();
                }}
              >
                ⬇️ ${this.t('engine.cv.exportAll')}
              </button>`
            : nothing
        }
        <button
          class="btn small primary"
          type="button"
          @click=${() => {
            s.toggleHistory(false);
          }}
        >
          ${i18n.dir() === 'rtl' ? '→' : '←'} ${this.t('engine.cv.chat')}
        </button>
      </div>
      <p class="tiny muted">${this.t('engine.cv.tip')}</p>
      ${
        others
          ? html`<label class="row tiny" style="margin:2px 0 4px"
              ><input
                type="checkbox"
                .checked=${this.allKinds}
                @change=${(e: Event) => (this.allKinds = (e.target as HTMLInputElement).checked)}
              />${this.t('engine.cv.alsoShow', { n: others })}</label
            >`
          : nothing
      }
      ${
        all.length > 3
          ? html`<input
              class="histsearch"
              type="search"
              placeholder=${this.t('engine.cv.search')}
              aria-label=${this.t('engine.cv.search')}
              .value=${this.query}
              @input=${(e: Event) => (this.query = (e.target as HTMLInputElement).value)}
            />`
          : nothing
      }
      ${
        all.length
          ? list.map(card)
          : html`<div class="empty">
              <div class="e" aria-hidden="true">💬</div>
              <p>${this.t('engine.cv.empty')}</p>
            </div>`
      }`;
  }
}
