/**
 * Me › Conversations: every conversation with the tutor in every subject, in a window in the middle of the screen
 * (the frame's modal: focus inside, Tab kept in, Esc back to what opened it), grouped by Roadmap and step, newest first.
 * Search, the one-shot AI records on request, ✏️ rename, ⬇️ export (one or all, the hidden tutor state never in it),
 * 🗑️ delete (asks twice); a conversation opens inside the window with ↩️ back, and "Continue" reopens it in its subject's
 * tutor. The window's head is the modal's own (drawn there by this element).
 */
import { html, nothing, render, type TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { LitElement } from 'lit';
import type { MessageParams } from '../../../ports/i18n.ts';
import { isTutor, visibleText } from '../domain/conversation.ts';

/** a stored record as this window reads it (noema.conversation/v1) */
export interface ConvoRow {
  id: string;
  kind?: string;
  mode?: string | null;
  title?: string | null;
  titleSource?: string;
  subject?: { readonly id: string; readonly title?: string } | null;
  context?: { readonly type: string; readonly label?: string | null } | null;
  updatedAt?: string;
  /** who wrote it (meta.app: another app of the same schema, e.g. Meletee) */
  meta?: Readonly<Record<string, unknown>>;
  messages: readonly { readonly role: string; readonly content: string }[];
}
/** where a subject sits: its Roadmap (or "no Roadmap") and its step (or the subject itself) */
export interface Place {
  readonly g: string;
  readonly gt: string;
  readonly s: string;
  readonly st: string;
}
export interface ConversationsHost {
  L(key: string, params?: MessageParams): string;
  list(): Promise<ConvoRow[]>;
  /** saves a renamed record → the record as stored (with its newer updatedAt) */
  put(r: ConvoRow): Promise<ConvoRow>;
  remove(id: string): Promise<void>;
  /** the open subject's tutor follows a rename (patch) or a removal (null) */
  changed(id: string, patch: { readonly title: string } | null): void;
  placeOf(subjectId: string, title: string | undefined): Place;
  /** continue in the tutor of its subject */
  resume(r: ConvoRow): void;
  /** the kind or mode of a record, in the learner's words */
  modeOf(r: ConvoRow): string;
  /** "from <app>" when another app wrote it, else null */
  fromApp(r: ConvoRow): string | null;
  tutorName(): string;
  date(iso: string | undefined): string;
  md(text: string): HTMLElement;
  markdown(rows: readonly ConvoRow[]): string;
  download(name: string, text: string): void;
  closeIcon(): string;
}

const tone4 = '--bgc:var(--t4);--fgc:var(--t4i)';
const slug = (t: string): string =>
  t
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'conversation';

export class NoemaConversations extends LitElement {
  static override properties = {
    host: { attribute: false },
    head: { attribute: false },
    rows: { state: true },
    query: { state: true },
    allKinds: { state: true },
    one: { state: true },
    editing: { state: true },
    sure: { state: true },
  };
  declare host: ConversationsHost | undefined;
  declare head: HTMLElement | undefined;
  declare rows: ConvoRow[];
  declare query: string;
  declare allKinds: boolean;
  declare one: ConvoRow | null;
  declare editing: string | null;
  declare sure: string | null;
  /** the window's focus helper (the modal's refocus) */
  refocus: () => void = () => undefined;
  close: () => void = () => undefined;
  #loaded = false;

  constructor() {
    super();
    this.rows = [];
    this.query = '';
    this.allKinds = false;
    this.one = null;
    this.editing = null;
    this.sure = null;
  }
  protected override createRenderRoot(): HTMLElement {
    return this;
  }
  override connectedCallback(): void {
    super.connectedCallback();
    this.style.display = 'contents';
  }
  /** loads the records (and opens one of them at once: a search result) */
  async load(openId?: string | null): Promise<void> {
    const h = this.host;
    if (!h) return;
    this.rows = (await h.list().catch(() => []))
      .filter(r => r.messages.length)
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''));
    this.#loaded = true;
    this.one = openId ? (this.rows.find(r => r.id === openId) ?? null) : null;
    await this.updateComplete;
    this.refocus();
  }
  #L(k: string, p?: MessageParams): string {
    return this.host?.L(k, p) ?? k;
  }
  #title(r: ConvoRow): string {
    return r.title || (r.messages.find(m => m.role === 'user')?.content ?? '').replace(/\s+/g, ' ').slice(0, 60) || this.#L('untitled');
  }
  #from(r: ConvoRow): TemplateResult | typeof nothing {
    const f = this.host?.fromApp(r);
    return f ? html`<span class="ns-cvfrom">${f}</span>` : nothing;
  }
  #what(r: ConvoRow): string {
    // a whole-subject chat needs no label (it read like a filter)
    return !r.context || r.context.type === 'course'
      ? ''
      : r.context.type === 'exercise'
        ? this.#L('forExercise')
        : (r.context.label ?? '');
  }
  #emo(emo: string, label: string, run: (e: Event) => void, cls = ''): TemplateResult {
    return html`<button class=${'ns-emobtn ' + cls} type="button" title=${label} aria-label=${label} @click=${run}>${emo}</button>`;
  }
  #closeBtn(): TemplateResult {
    return html`<button
      class="ns-iconbtn"
      type="button"
      aria-label=${this.#L('close')}
      @click=${() => {
        this.close();
      }}
    >
      <span class="ns-svg">${unsafeHTML(this.host?.closeIcon() ?? '✕')}</span>
    </button>`;
  }
  #exportRows(rows: readonly ConvoRow[], name: string): void {
    const h = this.host;
    if (h)
      h.download(name, h.markdown(rows.map(r => ({ ...r, messages: r.messages.map(m => ({ ...m, content: visibleText(m.content) })) }))));
  }
  #back(): void {
    this.one = null;
    void this.load();
  }

  protected override updated(): void {
    if (this.head && this.#loaded) render(this.#headTpl(), this.head);
    const inp = this.querySelector<HTMLInputElement>('input.ns-cvrename');
    if (inp && document.activeElement !== inp) {
      inp.focus();
      inp.select();
    }
  }
  #headTpl(): TemplateResult {
    const tutorOnly = this.rows.filter(r => isTutor(r.kind));
    const r = this.one;
    if (r)
      return html`${this.#emo('↩️', this.#L('convBack'), () => {
          this.#back();
        })}
        <h2 class="grow">${this.#title(r)}</h2>
        ${this.#emo('⬇️', this.#L('exportMd'), () => {
          this.#exportRows([r], slug(this.#title(r)) + '.md');
        })}${this.#closeBtn()}`;
    return html`<h2 class="grow">${this.#L('activity')} (${tutorOnly.length})</h2>
      ${
        this.rows.length
          ? this.#emo('⬇️', this.#L('exportAll'), () => {
              this.#exportRows(this.allKinds ? this.rows : tutorOnly, 'conversations.md');
            })
          : nothing
      }${this.#closeBtn()}`;
  }

  protected override render(): TemplateResult | typeof nothing {
    const h = this.host;
    if (!h || !this.#loaded) return nothing;
    return this.one ? this.#oneView(h, this.one) : this.#listView(h);
  }
  #listView(h: ConversationsHost): TemplateResult {
    const tutorOnly = this.rows.filter(r => isTutor(r.kind)),
      others = this.rows.length - tutorOnly.length;
    const q = this.query.trim().toLowerCase();
    const shown = this.rows.filter(
      r =>
        (this.allKinds || isTutor(r.kind)) &&
        (!q ||
          (this.#title(r) + ' ' + this.#what(r) + ' ' + (r.subject?.title ?? '') + ' ' + r.messages.map(m => m.content).join(' '))
            .toLowerCase()
            .includes(q)),
    );
    // Roadmap → step → conversations, newest first (the rows are sorted)
    const G = new Map<string, { t: string; steps: Map<string, { t: string; rows: ConvoRow[] }> }>();
    for (const r of shown) {
      const p = h.placeOf(r.subject?.id ?? '', r.subject?.title);
      let g = G.get(p.g);
      if (!g) G.set(p.g, (g = { t: p.gt, steps: new Map() }));
      let st = g.steps.get(p.s);
      if (!st) g.steps.set(p.s, (st = { t: p.st, rows: [] }));
      st.rows.push(r);
    }
    const order = [...G.keys()].sort((a, b) => Number(a === 'other') - Number(b === 'other'));
    return html`<p class="tiny ns-muted">${this.#L('convosSaved')}</p>
      ${
        this.rows.length > 3
          ? html`<input
              class="noema-input ns-cvsearch"
              type="search"
              placeholder=${this.#L('convosSearch')}
              aria-label=${this.#L('convosSearch')}
              .value=${this.query}
              @input=${(e: Event) => (this.query = (e.target as HTMLInputElement).value)}
            />`
          : nothing
      }
      ${
        others
          ? html`<label class="row tiny ns-check"
              ><input
                type="checkbox"
                .checked=${this.allKinds}
                @change=${(e: Event) => (this.allKinds = (e.target as HTMLInputElement).checked)}
              />${this.#L('convosOthers', { n: others })}</label
            >`
          : nothing
      }
      <div class="ns-cvgroups">
        ${
          shown.length
            ? order.map((gk, gi) => {
                const g = G.get(gk);
                if (!g) return nothing;
                const n = [...g.steps.values()].reduce((a, s) => a + s.rows.length, 0);
                return html`<details class="ns-cvgrp" ?open=${!!q || gi === 0}>
                  <summary><span class="grow">${g.t}</span><span class="ns-pill" style=${tone4}>${n}</span></summary>
                  ${[...g.steps.values()].map(
                    (s, si) =>
                      html`<details class="ns-cvstep" ?open=${!!q || (gi === 0 && si === 0)}>
                        <summary><span class="grow">${s.t}</span><span class="tiny">${s.rows.length}</span></summary>
                        ${s.rows.map(r => this.#row(h, r))}
                      </details>`,
                  )}
                </details>`;
              })
            : html`<p class="ns-muted">${this.rows.length ? this.#L('noResults') : this.#L('noConvos')}</p>`
        }
      </div>`;
  }
  #row(h: ConversationsHost, r: ConvoRow): TemplateResult {
    const done = async (value: string | null): Promise<void> => {
      this.editing = null;
      const v = (value ?? '').trim().slice(0, 80);
      if (value !== null && v && v !== this.#title(r)) {
        r.title = v;
        r.titleSource = 'user';
        // put() gives it a newer updatedAt, or other devices keep the old title
        const saved = await h.put(r);
        Object.assign(r, saved);
        h.changed(r.id, { title: v });
        this.requestUpdate();
      }
      setTimeout(() => {
        this.refocus();
      });
    };
    return html`<div class="ns-cvrow">
      ${
        this.editing === r.id
          ? html`<input
              class="noema-input ns-cvrename"
              aria-label=${this.#L('rename')}
              .value=${this.#title(r)}
              @keydown=${(e: KeyboardEvent) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  void done(null);
                }
              }}
              @blur=${(e: Event) => {
                if (this.editing === r.id) void done((e.target as HTMLInputElement).value);
              }}
            />`
          : html`<button
              class="ns-cvmain"
              type="button"
              @click=${() => {
                this.one = r;
                setTimeout(() => {
                  this.refocus();
                });
              }}
            >
              <b>${this.#title(r)}</b>
              <small
                >${this.#from(r)}${[h.modeOf(r), this.#what(r), h.date(r.updatedAt), this.#L('nMessages', { n: r.messages.length })].filter(Boolean).join(' · ')}</small
              >
            </button>`
      }
      <span class="ns-cvacts">
        ${this.#emo('✏️', this.#L('rename'), () => (this.editing = r.id))}
        ${this.#emo('⬇️', this.#L('exportMd'), () => {
          this.#exportRows([r], slug(this.#title(r)) + '.md');
        })}
        ${this.#emo(this.sure === r.id ? '❓' : '🗑️', this.#L(this.sure === r.id ? 'delAgain' : 'del'), () => {
          if (this.sure !== r.id) {
            this.sure = r.id;
            return;
          }
          this.sure = null;
          void h.remove(r.id).then(() => {
            h.changed(r.id, null);
            return this.load();
          });
        })}
      </span>
    </div>`;
  }
  #oneView(h: ConversationsHost, r: ConvoRow): TemplateResult {
    const p = h.placeOf(r.subject?.id ?? '', r.subject?.title);
    return html`<p class="tiny ns-muted">
        ${this.#from(r)}${[p.st, h.modeOf(r), this.#what(r), h.date(r.updatedAt)].filter(Boolean).join(' · ')}
      </p>
      <div class="ns-cvmsgs">
        ${r.messages
          .filter(m => visibleText(m.content))
          .map(
            m =>
              html`<div class=${'ns-cvmsg ' + (m.role === 'user' ? 'me' : 'ai')}>
                <small>${m.role === 'user' ? this.#L('you') : h.tutorName()}</small>${h.md(visibleText(m.content))}
              </div>`,
          )}
      </div>
      ${
        r.subject?.id && isTutor(r.kind)
          ? html`<div class="row">
              <button
                class="btn primary"
                type="button"
                @click=${() => {
                  this.close();
                  h.resume(r);
                }}
              >
                ${this.#L('convContinue')}
              </button>
            </div>`
          : nothing
      }`;
  }
}

/** Me › Conversations' element, defined once (build/ui.js; the drawer's elements are in build/study.js: ./index.ts) */
export function defineConversationsUi(registry: CustomElementRegistry = customElements): void {
  if (!registry.get('noema-conversations')) registry.define('noema-conversations', NoemaConversations);
}
