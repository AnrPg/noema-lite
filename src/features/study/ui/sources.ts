/**
 * The subject's sources: the chips of a chapter (tap one to open it at that page), the bar of the source filter, the
 * sources deck under the top bar (each source's file, what it brings, a filter of one or the new ones), the "What's new"
 * button, and opening a source in the file viewer ("What's new" itself, #/new, is screens/whats-new.ts).
 *
 * SourcesUi is the screens' handle on them (and the viewer's entry: `open`); what it draws are light-DOM elements on the
 * study base (lit/base.ts): `study-source-chips`, `study-filter-bar`, `study-whats-new-btn` and the deck, `study-sources-deck`.
 */
import { sourceChapters, sourceStats, type SourceInfo, type SourceStats } from '../domain/course.ts';
import type { Chapter } from '../domain/pack.ts';
import type { StudyApp } from './app.ts';
import { html, nothing, StudyElement, tag, type TemplateResult } from './lit/base.ts';
import type { ViewerPort } from './parts.ts';

type FullChapter = Chapter & { readonly src: string; readonly _ci: number };
type FileMeta = { readonly name: string; readonly size: number; readonly cloud: boolean };

export class SourcesUi implements ViewerPort {
  readonly #app: StudyApp;
  #open = false;
  readonly #expanded = new Set<string>();
  #deck: StudySourcesDeck | null = null;

  constructor(app: StudyApp) {
    this.#app = app;
  }

  #src(id: string): SourceInfo | undefined {
    return this.#app.course.source(id);
  }

  /** Opens a source: its file in the viewer (at a page), its web page, or the deck's card to attach a file. */
  open(id: string, o: { readonly page?: number | null; readonly start?: number | null } = {}): void {
    void this.#openAsync(id, o);
  }
  async #openAsync(id: string, o: { readonly page?: number | null; readonly start?: number | null }): Promise<void> {
    const app = this.#app,
      F = app.host.sourceFiles;
    const s = this.#src(id);
    if (!s) return;
    const page = o.page ? F.filePage(s, o.page) : null; // a part of a split PDF starts at the book's "firstPage"
    const av = F.available(s);
    if (!av) {
      this.expand(id);
      this.toggleDeck(true);
      app.toast(`📎 ${app.t('engine.src.noFile')}`, 4500);
      return;
    }
    if (av.url && !av.stored) {
      app.host.openFile({ url: av.url, title: s.title, subtitle: s.subtitle ?? '', page, start: o.start ?? null });
      return;
    }
    app.toast(`⏳ ${app.t('engine.src.opening')}`, 1200);
    const rec = await F.get(id).catch(() => null);
    if (!rec) {
      app.toast(`⚠️ ${app.t('engine.src.unavailable')}`, 4500);
      return;
    }
    app.host.openFile({ blob: rec.blob, name: rec.name, type: rec.type, title: s.title, subtitle: s.subtitle ?? '', page, start: null });
  }

  /** the chapter's header line: which sources it comes from (null: one source of its own, nothing to say) */
  chips(c: FullChapter): HTMLElement | null {
    const app = this.#app;
    const refs = app.refs(c);
    const srcs = app.course.sources;
    if (!refs.length || (refs.length === 1 && !refs[0]?.label && srcs.length === 1 && srcs[0]?.id === 'base')) return null;
    return new StudySourceChips(this, app, c).redraw();
  }

  /** the bar over a page while the course is filtered to some sources */
  filterBanner(): HTMLElement | null {
    return this.#app.filter ? new StudyFilterBar(this, this.#app).redraw() : null;
  }

  /** ✨ only what's new (the subject's page, while new sources came) */
  whatsNewButton(): HTMLElement | null {
    return this.#app.newSources().length ? new StudyWhatsNewButton(this.#app).redraw() : null;
  }

  setFilter(ids: readonly string[] | null): void {
    this.#app.setFilter(ids);
    this.#app.rerender();
    this.render();
  }

  /** a source's card in the deck shows its details (its file) */
  expand(id: string): void {
    this.#expanded.add(id);
  }
  isExpanded(id: string): boolean {
    return this.#expanded.has(id);
  }
  fold(id: string): void {
    if (!this.#expanded.delete(id)) this.#expanded.add(id);
    this.render();
  }

  /** the sources deck is open */
  get deckOpen(): boolean {
    return this.#open;
  }

  toggleDeck(force?: boolean): void {
    this.#open = force ?? !this.#open;
    this.render();
  }

  /** the sources deck (a panel under the top bar), drawn again */
  render(): void {
    const app = this.#app;
    let d = this.#deck?.isConnected ? this.#deck : null;
    // a deck another subject left on the page goes (one deck, this subject's)
    for (const old of document.querySelectorAll('.srcdeck')) if (old !== d) old.remove();
    if (!d) {
      d = this.#deck = new StudySourcesDeck(this, app);
      const anchor = document.querySelector('.topbar') ?? document.querySelector('.ns-top');
      if (anchor) anchor.after(d);
      else document.body.prepend(d);
    }
    d.classList.add('srcdeck');
    d.classList.toggle('open', this.#open);
    document.querySelector('.srcbtn')?.classList.toggle('on', this.#open || !!app.filter);
    d.redraw();
  }
}

const short = (t0: string): string => {
  const t = t0.replace(/\s+/g, ' ').trim();
  return t.length > 46 ? `${t.slice(0, 44).replace(/[\s,·]+\S*$/, '')}…` : t;
};

/** a chapter's sources as chips: a tap opens the file at the chapter's page (or the deck's card to attach it) */
class StudySourceChips extends StudyElement {
  readonly #ui: SourcesUi;
  readonly #app: StudyApp;
  readonly #c: FullChapter;
  constructor(ui: SourcesUi, app: StudyApp, c: FullChapter) {
    super();
    this.#ui = ui;
    this.#app = app;
    this.#c = c;
  }
  override render(): TemplateResult {
    const app = this.#app;
    return html`<div class="srcrefs" role="group" aria-label=${app.t('engine.src.chapterAria')}>
      <span class="srcrefs-l">${app.t('engine.src.from')}</span>
      ${app.refs(this.#c).map(r => {
        const s = app.course.source(r.src);
        if (!s) return nothing;
        const av = app.host.sourceFiles.available(s);
        const label = r.label ? (s.short && !r.label.includes(s.short) ? `${s.short} ${r.label}` : r.label) : (s.short ?? s.title);
        const how = av
          ? `👁 ${r.page ? app.t('engine.src.openAtPage', { page: r.page }) : app.t('engine.src.open')}`
          : app.t('engine.src.showCard');
        return html`<button
          class="srcref${av ? ' can' : ''}"
          type="button"
          title=${`${s.title}${r.label ? `\n${r.label}` : ''}\n${how}`}
          @click=${() => {
            this.#ui.open(r.src, { page: r.page, start: r.start });
          }}
        >
          <span class="e">${s.emoji ?? '📘'}</span><span>${short(label)}</span>${
            av ? html`<span class="eye" aria-hidden="true">👁</span>` : nothing
          }
        </button>`;
      })}
    </div>`;
  }
}
tag('study-source-chips', StudySourceChips);

/** the bar over a page while the course is filtered: what it shows, 📚 the deck, show everything */
class StudyFilterBar extends StudyElement {
  readonly #ui: SourcesUi;
  readonly #app: StudyApp;
  constructor(ui: SourcesUi, app: StudyApp) {
    super();
    this.#ui = ui;
    this.#app = app;
  }
  override render(): unknown {
    const app = this.#app,
      on = app.filter;
    if (!on) return nothing;
    const names = [...on].map(id => app.course.source(id)?.title ?? id).join(' + ');
    const onlyNew = app.newSources().length > 0 && [...on].every(id => app.isNewSource(id));
    return html`<div class="filterbar">
      <span aria-hidden="true">${onlyNew ? '✨' : '🔎'}</span>
      <span class="grow"><b>${onlyNew ? app.t('engine.src.onlyNewLabel') : app.t('engine.src.filteredLabel')} </b>${names}</span>
      <button
        class="btn small"
        type="button"
        @click=${() => {
          this.#ui.toggleDeck(true);
        }}
      >
        📚 ${app.t('engine.src.sources')}
      </button>
      <button
        class="btn small primary"
        type="button"
        @click=${() => {
          this.#ui.setFilter(null);
        }}
      >
        ${app.t('engine.src.showEverything')}
      </button>
    </div>`;
  }
}
tag('study-filter-bar', StudyFilterBar);

/** ✨ only what's new: to #/new (a part of the row it sits in: display: contents) */
class StudyWhatsNewButton extends StudyElement {
  readonly #app: StudyApp;
  constructor(app: StudyApp) {
    super();
    this.#app = app;
  }
  override render(): TemplateResult {
    const app = this.#app;
    return html`<button
      class="btn ai whatsnewbtn"
      type="button"
      @click=${() => {
        app.go('#/new');
      }}
    >
      ✨ ${app.t('engine.src.showOnlyNew')}
    </button>`;
  }
}
tag('study-whats-new-btn', StudyWhatsNewButton);

type Stat = readonly [emoji: string, n: number, key: string];

/** the sources deck: every source (in or out of the filter), unfolded to its file, what it brings and its chapters */
class StudySourcesDeck extends StudyElement {
  readonly #ui: SourcesUi;
  readonly #app: StudyApp;
  constructor(ui: SourcesUi, app: StudyApp) {
    super();
    this.#ui = ui;
    this.#app = app;
  }

  /** the deck and the page drawn again (a file attached or removed, a source seen) */
  #refresh(): void {
    this.#ui.render();
    this.#app.rerender();
  }

  override render(): unknown {
    const app = this.#app,
      ui = this.#ui;
    if (!ui.deckOpen) return nothing;
    const sources = app.course.sources;
    const on = app.filter;
    const ns = app.newSources();
    const st = sourceStats(app.course.full, sources);
    const files = app.host.sourceFiles.index();
    return html`<div class="deckinner">
      <div class="deckhead">
        <div class="grow">
          <b>📚 ${app.t('engine.src.sources')}</b
          ><span class="tiny">
            ·
            ${
              on
                ? app.t('engine.deck.countSome', { n: sources.length, shown: on.size })
                : app.t('engine.deck.countAll', { n: sources.length })
            }</span
          >
        </div>
        <button
          class="fchip${!on ? ' on' : ''}"
          type="button"
          @click=${() => {
            ui.setFilter(null);
          }}
        >
          ${app.t('engine.deck.all')}
        </button>
        ${
          ns.length
            ? html`<button
                class="fchip${on && [...on].every(id => app.isNewSource(id)) ? ' on' : ''}"
                type="button"
                @click=${() => {
                  ui.setFilter(ns);
                }}
              >
                ✨ ${app.t('engine.deck.onlyNew')}
              </button>`
            : nothing
        }
        <button
          class="iconbtn"
          type="button"
          title=${app.t('engine.deck.close')}
          aria-label=${app.t('engine.deck.close')}
          @click=${() => {
            ui.toggleDeck(false);
          }}
        >
          ✕
        </button>
      </div>
      ${sources.map((s, i) => this.#card(s, i, st.get(s.id), files[s.id]))}
      <div class="tiny deckfoot">${app.t('engine.deck.footer')}</div>
    </div>`;
  }

  #card(s: SourceInfo, i: number, x: SourceStats | undefined, fm: FileMeta | undefined): TemplateResult {
    const app = this.#app,
      ui = this.#ui,
      F = app.host.sourceFiles;
    const sources = app.course.sources,
      on = app.filter;
    const isOn = !on || on.has(s.id);
    const exp = ui.isExpanded(s.id);
    const web = F.webUrl(s);
    const fold = (): void => {
      ui.fold(s.id);
    };
    const preview = (): void => {
      ui.open(s.id);
    };
    const pagesText = s.pages ? (/^\d/.test(s.pages) ? app.t('engine.deck.pp', { pages: s.pages }) : s.pages) : '';
    return html`<div class="srccard${isOn ? '' : ' off'}${exp ? ' exp' : ''}" style=${`animation-delay:${String(i * 40)}ms`}>
      <div class="srcrow">
        <label class="switch" title=${app.t('engine.deck.include')}
          ><input
            type="checkbox"
            .checked=${isOn}
            aria-label=${app.t('engine.deck.include')}
            @change=${(e: Event) => {
              const box = e.target as HTMLInputElement;
              const cur = on ? [...on] : sources.map(z => z.id);
              const next = box.checked ? [...new Set([...cur, s.id])] : cur.filter(z => z !== s.id);
              if (!next.length) {
                box.checked = true;
                app.toast(app.t('engine.deck.keepOne'));
                return;
              }
              ui.setFilter(next);
            }} /><i></i
        ></label>
        <span class="srcemo" aria-hidden="true">${s.emoji ?? '📘'}</span>
        <button class="grow srcmain" type="button" aria-expanded=${String(exp)} @click=${fold}>
          <b>${s.title}${app.isNewSource(s.id) ? html`<span class="newpill srcnew">✨ ${app.t('engine.src.new')}</span>` : nothing}</b>
          <small>${(s.subtitle ?? '') + (pagesText ? ` · ${pagesText}` : '')}</small>
        </button>
        ${
          fm || web
            ? html`<button
                class="iconbtn srceye"
                type="button"
                title=${`👁 ${app.t('engine.deck.preview')}${fm ? ` ${fm.name}` : ''}`}
                aria-label=${app.t('engine.deck.previewAria')}
                @click=${preview}
              >
                👁
              </button>`
            : nothing
        }
        <button class="iconbtn" type="button" aria-label=${s.title} aria-expanded=${String(exp)} @click=${fold}>
          <span class="chev${exp ? ' open' : ''}">▸</span>
        </button>
      </div>
      ${exp ? this.#body(s, x, fm, web, preview) : nothing}
    </div>`;
  }

  #body(s: SourceInfo, x: SourceStats | undefined, fm: FileMeta | undefined, web: string | null, preview: () => void): TemplateResult {
    const app = this.#app,
      ui = this.#ui,
      F = app.host.sourceFiles;
    const sources = app.course.sources;
    const chs = sourceChapters(app.course.full, s.id, c => app.refs(c));
    const STATS: readonly Stat[] = x
      ? [
          ['🧱', x.newChapters.length, 'chapters'],
          ['📖', x.sections.size, 'sections'],
          ['➕', x.enriched.size, 'enriched'],
          ['🎯', x.exercises, 'exercises'],
          ['🔧', x.playbooks, 'drills'],
          ['🃏', x.cards, 'cards'],
          ['⚠️', x.pitfalls, 'traps'],
        ]
      : [];
    const pick = (label: string, primary: boolean): TemplateResult =>
      html`<label class="btn small${primary ? ' primary' : ''}"
        >${label}<input
          type="file"
          class="srcpick"
          @change=${async (e: Event) => {
            const input = e.target as HTMLInputElement;
            const f = input.files?.[0];
            if (!f) return;
            app.toast(`⬆️ ${app.t('engine.deck.saving', { name: f.name })}`, 2500);
            try {
              await F.put(s.id, f);
              app.toast(`📎 ${app.t('engine.deck.attached')}`);
            } catch (er) {
              app.toast(`⚠️ ${app.errText(er)}`, 6000);
            }
            input.value = '';
            this.#refresh();
          }}
      /></label>`;
    const file = fm
      ? html`<span>📎 ${fm.name} · ${fileSize(app, fm.size)}${fm.cloud ? '' : ` · ${app.t('engine.deck.deviceOnly')}`}</span>
          <button class="btn small primary" type="button" @click=${preview}>👁 ${app.t('engine.deck.preview')}</button>
          ${pick(`↻ ${app.t('engine.deck.replace')}`, false)}
          <button
            class="btn small ghost"
            type="button"
            @click=${async () => {
              if (!(await app.host.frame.confirm(app.t('engine.deck.removeConfirm')))) return;
              await F.remove(s.id);
              this.#refresh();
            }}
          >
            🗑 ${app.t('engine.deck.remove')}
          </button>`
      : web
        ? html`<span>🌐 <a href=${web} target="_blank" rel="noopener">${web.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)}</a></span>
            <button class="btn small primary" type="button" @click=${preview}>👁 ${app.t('engine.deck.preview')}</button>
            ${pick(`📎 ${app.t('engine.deck.attachInstead')}`, false)}`
        : html`<span class="tiny"
              >${
                s.sha256
                  ? `📦 ${app.t('engine.deck.inPackage', { name: s.fileName ?? (s.file ?? '').split('/').pop() ?? '' })}`
                  : s.file
                    ? `📄 ${app.t('engine.deck.notAttached', { name: s.file.split('/').pop() ?? '' })}`
                    : app.t('engine.deck.noFile')
              }</span
            >
            ${pick(`📎 ${app.t('engine.deck.attach')}`, true)}`;
    return html`<div class="srcbody">
      <div class="srcstats">
        ${STATS.filter(r => r[1]).map(([e, n, l]) => html`<span class="pill">${e} ${app.t(`engine.deck.st_${l}`, { n })}</span>`)}
      </div>
      <div class="srcfile">${file}</div>
      <div class="tiny srcmeta">
        ${
          (s.pages ? `${/^\d/.test(s.pages) ? app.t('engine.deck.pages', { pages: s.pages }) : s.pages} · ` : '') +
          app.t('engine.deck.added', { date: s.added ?? '—' })
        }
      </div>
      ${
        chs.length
          ? html`<div class="srcchs">
              ${chs.map(
                ({ c, ref }) =>
                  html`<button
                    class="srcch${ref.main ? '' : ' also'}"
                    type="button"
                    title=${ref.label}
                    @click=${() => {
                      ui.toggleDeck(false);
                      app.go(`#/ch/${c.id}`);
                    }}
                  >
                    ${`${c.emoji ?? ''} ${app.chTitle(c.num, c.title)}`}${
                      ref.label ? html`<small> — ${ref.label.length > 60 ? `${ref.label.slice(0, 58)}…` : ref.label}</small>` : nothing
                    }${ref.main ? nothing : html`<small> ${app.t('engine.deck.also')}</small>`}
                  </button>`,
              )}
            </div>`
          : html`<div class="tiny">${app.t('engine.deck.noChapter')}</div>`
      }
      <div class="row srcacts">
        <button
          class="btn small"
          type="button"
          @click=${() => {
            ui.setFilter([s.id]);
          }}
        >
          🔎 ${app.t('engine.deck.onlyThis')}
        </button>
        ${
          app.isNewSource(s.id)
            ? html`<button
                class="btn small"
                type="button"
                @click=${() => {
                  app.markSeen([s.id]);
                  this.#refresh();
                }}
              >
                ✔ ${app.t('engine.new.markSeen')}
              </button>`
            : nothing
        }
        ${
          s.id !== sources[0]?.id && app.state.seenSrc?.[s.id]
            ? html`<button
                class="btn small ghost"
                type="button"
                @click=${() => {
                  app.markUnseen(s.id);
                  this.#refresh();
                }}
              >
                ↺ ${app.t('engine.deck.markNew')}
              </button>`
            : nothing
        }
      </div>
    </div>`;
  }
}
tag('study-sources-deck', StudySourcesDeck);

function fileSize(app: StudyApp, bytes: number): string {
  return bytes > 1048576
    ? app.t('engine.common.sizeMB', {
        size: app.i18n.format.number(bytes / 1048576, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      })
    : app.t('engine.common.sizeKB', { size: app.nf(Math.round(bytes / 1024)) });
}
