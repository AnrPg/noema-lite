/**
 * The subject's sources: the chips of a chapter (tap one to open it at that page), the bar of the source filter, the
 * sources deck under the top bar (each source's file, what it brings, a filter of one or the new ones), and opening a
 * source in the file viewer ("What's new", #/new, is screens/whats-new.ts).
 */
import { sourceChapters, sourceStats, type SourceInfo } from '../domain/course.ts';
import type { Chapter } from '../domain/pack.ts';
import type { StudyApp } from './app.ts';
import { h } from './dom.ts';
import type { ViewerPort } from './parts.ts';

type FullChapter = Chapter & { readonly src: string; readonly _ci: number };

export class SourcesUi implements ViewerPort {
  readonly #app: StudyApp;
  #open = false;
  readonly #expanded = new Set<string>();

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

  /** the chapter's header line: which sources it comes from */
  chips(c: FullChapter): HTMLElement | null {
    const app = this.#app;
    const refs = app.refs(c);
    const srcs = app.course.sources;
    if (!refs.length || (refs.length === 1 && !refs[0]?.label && srcs.length === 1 && srcs[0]?.id === 'base')) return null;
    const short = (t0: string): string => {
      const t = t0.replace(/\s+/g, ' ').trim();
      return t.length > 46 ? `${t.slice(0, 44).replace(/[\s,·]+\S*$/, '')}…` : t;
    };
    return h(
      'div',
      { class: 'srcrefs', role: 'group', 'aria-label': app.t('engine.src.chapterAria') },
      h('span', { class: 'srcrefs-l' }, app.t('engine.src.from')),
      refs.map(r => {
        const s = this.#src(r.src);
        if (!s) return null;
        const av = app.host.sourceFiles.available(s);
        const label = r.label ? (s.short && !r.label.includes(s.short) ? `${s.short} ${r.label}` : r.label) : (s.short ?? s.title);
        return h(
          'button',
          {
            class: `srcref${av ? ' can' : ''}`,
            type: 'button',
            title: `${s.title}${r.label ? `\n${r.label}` : ''}\n${av ? `👁 ${r.page ? app.t('engine.src.openAtPage', { page: r.page }) : app.t('engine.src.open')}` : app.t('engine.src.showCard')}`,
            onclick: () => {
              this.open(r.src, { page: r.page, start: r.start });
            },
          },
          h('span', { class: 'e' }, s.emoji ?? '📘'),
          h('span', {}, short(label)),
          av ? h('span', { class: 'eye', 'aria-hidden': 'true' }, '👁') : null,
        );
      }),
    );
  }

  /** the bar over a page while the course is filtered to some sources */
  filterBanner(): HTMLElement | null {
    const app = this.#app;
    const on = app.filter;
    if (!on) return null;
    const names = [...on].map(id => this.#src(id)?.title ?? id).join(' + ');
    const onlyNew = app.newSources().length > 0 && [...on].every(id => app.isNewSource(id));
    return h(
      'div',
      { class: 'filterbar' },
      h('span', {}, onlyNew ? '✨' : '🔎'),
      h('span', { class: 'grow' }, h('b', {}, `${onlyNew ? app.t('engine.src.onlyNewLabel') : app.t('engine.src.filteredLabel')} `), names),
      h(
        'button',
        {
          class: 'btn small',
          type: 'button',
          onclick: () => {
            this.toggleDeck(true);
          },
        },
        `📚 ${app.t('engine.src.sources')}`,
      ),
      h(
        'button',
        {
          class: 'btn small primary',
          type: 'button',
          onclick: () => {
            this.setFilter(null);
          },
        },
        app.t('engine.src.showEverything'),
      ),
    );
  }

  whatsNewButton(): HTMLElement | null {
    const app = this.#app;
    if (!app.newSources().length) return null;
    return h(
      'button',
      {
        class: 'btn ai whatsnewbtn',
        type: 'button',
        onclick: () => {
          app.go('#/new');
        },
      },
      `✨ ${app.t('engine.src.showOnlyNew')}`,
    );
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

  /** the sources deck is open */
  get deckOpen(): boolean {
    return this.#open;
  }

  toggleDeck(force?: boolean): void {
    this.#open = force ?? !this.#open;
    this.render();
  }

  /** the sources deck (a panel under the top bar) */
  render(): void {
    const app = this.#app;
    let d = document.querySelector<HTMLElement>('.srcdeck');
    if (!d) {
      d = h('div', { class: 'srcdeck' });
      const anchor = document.querySelector('.topbar') ?? document.querySelector('.ns-top');
      if (anchor) anchor.after(d);
      else document.body.prepend(d);
    }
    d.classList.toggle('open', this.#open);
    document.querySelector('.srcbtn')?.classList.toggle('on', this.#open || !!app.filter);
    d.replaceChildren();
    if (!this.#open) return;
    const sources = app.course.sources;
    const st = sourceStats(app.course.full, sources);
    const on = app.filter;
    const isOn = (id: string): boolean => !on || on.has(id);
    const ns = app.newSources();
    const F = app.host.sourceFiles;
    const files = F.index();
    const inner = h('div', { class: 'deckinner' });
    inner.append(
      h(
        'div',
        { class: 'deckhead' },
        h(
          'div',
          { class: 'grow' },
          h('b', {}, `📚 ${app.t('engine.src.sources')}`),
          h(
            'span',
            { class: 'tiny' },
            ` · ${on ? app.t('engine.deck.countSome', { n: sources.length, shown: on.size }) : app.t('engine.deck.countAll', { n: sources.length })}`,
          ),
        ),
        h(
          'button',
          {
            class: `fchip${!on ? ' on' : ''}`,
            type: 'button',
            onclick: () => {
              this.setFilter(null);
            },
          },
          app.t('engine.deck.all'),
        ),
        ns.length
          ? h(
              'button',
              {
                class: `fchip${on && [...on].every(id => app.isNewSource(id)) ? ' on' : ''}`,
                type: 'button',
                onclick: () => {
                  this.setFilter(ns);
                },
              },
              `✨ ${app.t('engine.deck.onlyNew')}`,
            )
          : null,
        h(
          'button',
          {
            class: 'iconbtn',
            type: 'button',
            title: app.t('engine.deck.close'),
            'aria-label': app.t('engine.deck.close'),
            onclick: () => {
              this.toggleDeck(false);
            },
          },
          '✕',
        ),
      ),
    );
    const refresh = (): void => {
      this.render();
      app.rerender();
    };
    sources.forEach((s, i) => {
      const x = st.get(s.id);
      const exp = this.#expanded.has(s.id);
      const chs = sourceChapters(app.course.full, s.id, c => app.refs(c));
      const fm = files[s.id];
      const web = F.webUrl(s);
      const pick = h('input', {
        type: 'file',
        style: { display: 'none' },
        onchange: async (e: Event) => {
          const f = (e.target as HTMLInputElement).files?.[0];
          if (!f) return;
          app.toast(`⬆️ ${app.t('engine.deck.saving', { name: f.name })}`, 2500);
          try {
            await F.put(s.id, f);
            app.toast(`📎 ${app.t('engine.deck.attached')}`);
          } catch (er) {
            app.toast(`⚠️ ${app.errText(er)}`, 6000);
          }
          refresh();
        },
      });
      const fold = (): void => {
        if (exp) this.#expanded.delete(s.id);
        else this.#expanded.add(s.id);
        this.render();
      };
      const pagesText = s.pages ? (/^\d/.test(s.pages) ? app.t('engine.deck.pp', { pages: s.pages }) : s.pages) : '';
      const STATS = x
        ? ([
            ['🧱', x.newChapters.length, 'chapters'],
            ['📖', x.sections.size, 'sections'],
            ['➕', x.enriched.size, 'enriched'],
            ['🎯', x.exercises, 'exercises'],
            ['🔧', x.playbooks, 'drills'],
            ['🃏', x.cards, 'cards'],
            ['⚠️', x.pitfalls, 'traps'],
          ] as const)
        : [];
      const preview = (): void => {
        this.open(s.id);
      };
      const card = h(
        'div',
        { class: `srccard${isOn(s.id) ? '' : ' off'}${exp ? ' exp' : ''}`, style: { animationDelay: `${String(i * 40)}ms` } },
        h(
          'div',
          { class: 'srcrow' },
          h(
            'label',
            { class: 'switch', title: app.t('engine.deck.include') },
            h('input', {
              type: 'checkbox',
              checked: isOn(s.id),
              'aria-label': app.t('engine.deck.include'),
              onchange: (e: Event) => {
                const box = e.target as HTMLInputElement;
                const cur = on ? [...on] : sources.map(z => z.id);
                const next = box.checked ? [...new Set([...cur, s.id])] : cur.filter(z => z !== s.id);
                if (!next.length) {
                  box.checked = true;
                  app.toast(app.t('engine.deck.keepOne'));
                  return;
                }
                this.setFilter(next);
              },
            }),
            h('i'),
          ),
          h('span', { class: 'srcemo' }, s.emoji ?? '📘'),
          h(
            'button',
            { class: 'grow srcmain', type: 'button', 'aria-expanded': String(exp), onclick: fold },
            h(
              'b',
              {},
              s.title,
              app.isNewSource(s.id)
                ? h('span', { class: 'newpill', style: { marginInlineStart: '6px' } }, `✨ ${app.t('engine.src.new')}`)
                : null,
            ),
            h('small', {}, (s.subtitle ?? '') + (pagesText ? ` · ${pagesText}` : '')),
          ),
          fm || web
            ? h(
                'button',
                {
                  class: 'iconbtn srceye',
                  type: 'button',
                  title: `👁 ${app.t('engine.deck.preview')}${fm ? ` ${fm.name}` : ''}`,
                  'aria-label': app.t('engine.deck.previewAria'),
                  onclick: preview,
                },
                '👁',
              )
            : null,
          h(
            'button',
            { class: 'iconbtn', type: 'button', 'aria-label': s.title, 'aria-expanded': String(exp), onclick: fold },
            h('span', { class: 'chev', style: { transform: exp ? 'rotate(90deg)' : '' } }, '▸'),
          ),
        ),
        exp
          ? h(
              'div',
              { class: 'srcbody' },
              h(
                'div',
                { class: 'srcstats' },
                STATS.filter(r => r[1]).map(([e, n, l]) => h('span', { class: 'pill' }, `${e} ${app.t(`engine.deck.st_${l}`, { n })}`)),
              ),
              h(
                'div',
                { class: 'srcfile' },
                fm
                  ? [
                      h('span', {}, `📎 ${fm.name} · ${fileSize(app, fm.size)}`, fm.cloud ? '' : ` · ${app.t('engine.deck.deviceOnly')}`),
                      h('button', { class: 'btn small primary', type: 'button', onclick: preview }, `👁 ${app.t('engine.deck.preview')}`),
                      h('label', { class: 'btn small' }, `↻ ${app.t('engine.deck.replace')}`, pick),
                      h(
                        'button',
                        {
                          class: 'btn small ghost',
                          type: 'button',
                          onclick: async () => {
                            if (!(await app.host.frame.confirm(app.t('engine.deck.removeConfirm')))) return;
                            await F.remove(s.id);
                            refresh();
                          },
                        },
                        `🗑 ${app.t('engine.deck.remove')}`,
                      ),
                    ]
                  : web
                    ? [
                        h(
                          'span',
                          {},
                          '🌐 ',
                          h('a', { href: web, target: '_blank', rel: 'noopener' }, web.replace(/^https?:\/\/(www\.)?/, '').slice(0, 60)),
                        ),
                        h('button', { class: 'btn small primary', type: 'button', onclick: preview }, `👁 ${app.t('engine.deck.preview')}`),
                        h('label', { class: 'btn small' }, `📎 ${app.t('engine.deck.attachInstead')}`, pick),
                      ]
                    : [
                        h(
                          'span',
                          { class: 'tiny' },
                          s.sha256
                            ? `📦 ${app.t('engine.deck.inPackage', { name: s.fileName ?? (s.file ?? '').split('/').pop() ?? '' })}`
                            : s.file
                              ? `📄 ${app.t('engine.deck.notAttached', { name: s.file.split('/').pop() ?? '' })}`
                              : app.t('engine.deck.noFile'),
                        ),
                        h('label', { class: 'btn small primary' }, `📎 ${app.t('engine.deck.attach')}`, pick),
                      ],
              ),
              h(
                'div',
                { class: 'tiny', style: { margin: '6px 0' } },
                (s.pages ? `${/^\d/.test(s.pages) ? app.t('engine.deck.pages', { pages: s.pages }) : s.pages} · ` : '') +
                  app.t('engine.deck.added', { date: s.added ?? '—' }),
              ),
              chs.length
                ? h(
                    'div',
                    { class: 'srcchs' },
                    chs.map(({ c, ref }) =>
                      h(
                        'button',
                        {
                          class: `srcch${ref.main ? '' : ' also'}`,
                          type: 'button',
                          title: ref.label,
                          onclick: () => {
                            this.toggleDeck(false);
                            app.go(`#/ch/${c.id}`);
                          },
                        },
                        `${c.emoji ?? ''} ${app.chTitle(c.num, c.title)}`,
                        ref.label ? h('small', {}, ` — ${ref.label.length > 60 ? `${ref.label.slice(0, 58)}…` : ref.label}`) : null,
                        ref.main ? null : h('small', {}, ` ${app.t('engine.deck.also')}`),
                      ),
                    ),
                  )
                : h('div', { class: 'tiny' }, app.t('engine.deck.noChapter')),
              h(
                'div',
                { class: 'row', style: { marginTop: '10px' } },
                h(
                  'button',
                  {
                    class: 'btn small',
                    type: 'button',
                    onclick: () => {
                      this.setFilter([s.id]);
                    },
                  },
                  `🔎 ${app.t('engine.deck.onlyThis')}`,
                ),
                app.isNewSource(s.id)
                  ? h(
                      'button',
                      {
                        class: 'btn small',
                        type: 'button',
                        onclick: () => {
                          app.markSeen([s.id]);
                          refresh();
                        },
                      },
                      `✔ ${app.t('engine.new.markSeen')}`,
                    )
                  : null,
                s.id !== sources[0]?.id && app.state.seenSrc?.[s.id]
                  ? h(
                      'button',
                      {
                        class: 'btn small ghost',
                        type: 'button',
                        onclick: () => {
                          app.markUnseen(s.id);
                          refresh();
                        },
                      },
                      `↺ ${app.t('engine.deck.markNew')}`,
                    )
                  : null,
              ),
            )
          : null,
      );
      inner.append(card);
    });
    inner.append(h('div', { class: 'tiny', style: { marginTop: '10px' } }, app.t('engine.deck.footer')));
    d.append(inner);
  }
}

function fileSize(app: StudyApp, bytes: number): string {
  return bytes > 1048576
    ? app.t('engine.common.sizeMB', {
        size: app.i18n.format.number(bytes / 1048576, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      })
    : app.t('engine.common.sizeKB', { size: app.nf(Math.round(bytes / 1024)) });
}
