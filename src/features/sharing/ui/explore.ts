/**
 * 🧭 Explore (#/explore: the Roadmaps others share; #/explore/subjects: the subjects anyone can study — the library's and
 * the ones people published). One closed section per domain; typing in the field shows only the matches. A row opens
 * (a Roadmap: joined, or my own) or studies (a subject: downloaded with its source files the first time) what it shows;
 * ⓘ beside a subject shows its details (owner, language, counts, chapters, sources, licence); 👤 beside a row opens the
 * page of the person who shares it. 🌐 Shared titles can be read in the interface language (the host's translator).
 */
import { html, nothing, type TemplateResult } from 'lit';
import { icon } from '../../../ui/kit/icons.ts';
import { openDialog } from '../../community/ui/dialogs.ts';
import { langName, size } from '../../community/ui/format.ts';
import type { PublicItem, ScreenChrome } from '../../community/ui/host.ts';
import { CommunityScreen, type ScreenBase } from '../../community/ui/screen.ts';
import { adopt, COMMON } from '../../community/ui/styles.ts';
import { EXPLORE_CSS } from './styles.ts';

/** said by the page when what it showed is open (bubbles) */
export const EXPLORE_DONE = 'noema-explore-done';
const STATS = ['chapters', 'sections', 'exercises', 'visual', 'pictures', 'flashcards', 'playbooks'] as const;
const n = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const rec = (x: unknown): Readonly<Record<string, unknown>> => (x && typeof x === 'object' ? (x as Readonly<Record<string, unknown>>) : {});
const list = (x: unknown): readonly Readonly<Record<string, unknown>>[] => (Array.isArray(x) ? x.map(rec) : []);
const s = (x: unknown): string => (typeof x === 'string' ? x : '');

/** what the field matches: the title, the description, who shares it */
export function matches(items: readonly PublicItem[], q: string): PublicItem[] {
  const t = q.trim().toLowerCase();
  return t ? items.filter(x => [x.title, x.description ?? '', x.owner_name ?? ''].join(' ').toLowerCase().includes(t)) : [...items];
}

/** the sections: every domain (in the host's order, 'other' last) that has something */
export function sections(items: readonly PublicItem[], domains: readonly string[]): [string, PublicItem[]][] {
  const doms = domains.length ? [...domains] : ['other'];
  if (!doms.includes('other')) doms.push('other');
  const of = (x: PublicItem): string => (x.domain && doms.includes(x.domain) ? x.domain : 'other');
  return doms.map((d): [string, PublicItem[]] => [d, items.filter(x => of(x) === d)]).filter(([, l]) => l.length > 0);
}

export class NoemaExplorePage extends CommunityScreen {
  static override properties = { ...CommunityScreen.properties, kind: { type: String } };
  /** '' (Roadmaps) or 'subjects' */
  declare kind: string;
  #items: PublicItem[] | null = null;
  #error = '';
  #q = '';
  #loaded = '';
  /** the shared texts, each one element kept across drawings (its translation shown stays) */
  #texts = new Map<string, HTMLElement>();
  #bar: HTMLElement | null = null;

  get #rm(): boolean {
    return this.kind !== 'subjects';
  }
  #L(k: string, p?: Record<string, string | number>): string {
    return this.t('sh.' + k, p);
  }
  override connectedCallback(): void {
    super.connectedCallback();
    adopt(this.ownerDocument, 'sharing', COMMON, EXPLORE_CSS);
  }
  protected override willUpdate(): void {
    if (this.#loaded !== this.kind) {
      this.#loaded = this.kind;
      this.#items = null;
      this.#error = '';
      this.#q = '';
      this.#texts.clear();
      this.#bar?.remove();
      this.#bar = null;
      void this.#load();
    }
  }
  async #load(): Promise<void> {
    const kind = this.kind;
    try {
      const items = this.#rm ? await this.host.publicRoadmaps() : await this.host.publicSubjects();
      if (kind === this.kind) this.#items = [...items];
    } catch (e) {
      if (kind === this.kind) this.#error = this.i18n.err(e);
    }
    this.requestUpdate();
  }
  protected override chrome(): ScreenChrome {
    return {
      tab: 'discover',
      crumbs: [{ label: this.#L('discover'), href: '#/discover' }, { label: this.#title() }],
      back: '#/discover',
    };
  }
  #title(): string {
    return this.#L(this.#rm ? 'exploreRoadmaps' : 'exploreShared');
  }
  /** a shared text, translatable on request */
  #mt(text: string, x: PublicItem, tag: 'b' | 'small' | 'span', where = 'info'): HTMLElement {
    // one element per place it shows in (a node is in one place only: the sections, the results, the details)
    const key = [where, x.id, tag, text].join('\u0000'),
      had = this.#texts.get(key);
    if (had) return had;
    const el = this.ownerDocument.createElement(tag);
    this.#texts.set(key, el);
    el.textContent = text;
    this.host.translatable(el, { language: x.language ?? x.meta?.language, kind: this.#rm ? 'explore.roadmap' : 'explore.pack' });
    return el;
  }
  async #open(e: Event, x: PublicItem): Promise<void> {
    if (await this.busy(e.currentTarget, () => (this.#rm ? this.host.openPublicRoadmap(x) : this.host.studyPublic(x)))) this.#done();
  }
  /** what it showed is open now (Explore in a dialog, the classic screens: the dialog closes) */
  #done(): void {
    this.dispatchEvent(new CustomEvent(EXPLORE_DONE, { bubbles: true }));
  }
  #row(x: PublicItem, i: number, where: string): TemplateResult {
    const tone = `--bgc: var(--t${(i % 4) + 1}); --fgc: var(--t${(i % 4) + 1}i)`;
    const who = x.owner_name || '…';
    const main = this.#rm
      ? html`<button type="button" class="nc-item ex-item" data-id=${x.id} @click=${(e: Event) => void this.#open(e, x)}>
          <span class="nc-ico" style=${tone} aria-hidden="true">${icon('map')}</span>
          <span class="t"
            >${this.#mt(x.title, x, 'b', where)}<small
              >${x.description ? html`${this.#mt(x.description, x, 'span', where)} · ` : nothing}${this.#L('rmPubMeta', {
                who,
                n: n(x.steps),
                p: n(x.prepared),
              })}</small
            ></span
          >
          <span class="nc-pill">${this.#L(x.have ? (x.own ? 'rmYours' : 'rmJoined') : 'rmJoin')}</span>
        </button>`
      : html`<button type="button" class="nc-item ex-item" data-id=${x.id} @click=${(e: Event) => void this.#open(e, x)}>
          <span class="nc-ico ${x.emoji ? 'emo' : 'txt'}" style=${tone} aria-hidden="true">${x.emoji || (x.title || '?').slice(0, 1)}</span>
          <span class="t"
            >${this.#mt(x.title, x, 'b', where)}${this.host.langTag(x) ?? nothing}${x.description ? this.#mt(x.description, x, 'small', where) : nothing}</span
          >
          <span class="chev" aria-hidden="true">${icon('forward')}</span>
        </button>`;
    return html`<div class="ex-row">
      ${main}
      ${
        this.#rm
          ? nothing
          : html`<noema-icon-button
              class="ex-infobtn"
              icon="info"
              label=${this.t('ui.tip.about', { topic: x.title })}
              @click=${() => {
                this.#info(x);
              }}
            ></noema-icon-button>`
      }
      ${
        x.owner
          ? html`<noema-icon-button
              class="ex-who"
              icon="user"
              label=${this.#L('pfOpen', { who })}
              @click=${() => {
                this.host.go('#/u/' + encodeURIComponent(s(x.owner)));
              }}
            ></noema-icon-button>`
          : nothing
      }
    </div>`;
  }
  /** ⓘ a subject's details, and Study */
  #info(x: PublicItem): void {
    const m = rec(x.meta),
      c = rec(m['counts'] ?? x['counts']),
      T = (k: string, p?: Record<string, string | number>): string => this.t('loader.info.' + k, p);
    const lang = s(m['language']) || x.language || '';
    const chapters = list(m['chapters']),
      sources = list(m['sources']);
    const owner = x.owner_name || s(m['ownerName']);
    openDialog(this.deps, {
      heading: x.title,
      cls: 'ex-info',
      placement: 'sheet',
      render: close =>
        html`<p class="ex-facts">
            <span class="nc-pill">${owner || T('library')}</span
            >${lang ? html`<span class="nc-pill">${langName(this.i18n, lang)}</span>` : nothing}
          </p>
          ${x.description ? html`<p class="ex-desc">${this.#mt(x.description, x, 'span')}</p>` : nothing}
          <p class="ex-facts ex-stats">
            ${STATS.filter(k => n(c[k] ?? (k === 'pictures' ? c['media'] : 0)) > 0).map(
              k => html`<span class="nc-pill">${T('stat.' + k, { n: n(c[k] ?? c['media']) })}</span>`,
            )}
          </p>
          ${
            chapters.length
              ? html`<span class="nc-label">${T('nChapters', { n: chapters.length })}</span>
                  <div class="ex-chapters" tabindex="0" aria-label=${T('chapters')}>
                    <ol>
                      ${chapters.map(
                        ch =>
                          html`<li>
                            ${s(ch['emoji'])} <strong>${s(ch['title'])}</strong>${
                              n(ch['sections']) || n(ch['exercises'])
                                ? html` — <em>${T('chapterCounts', { sections: n(ch['sections']), exercises: n(ch['exercises']) })}</em>`
                                : nothing
                            }
                          </li>`,
                      )}
                    </ol>
                  </div>`
              : nothing
          }
          ${
            sources.length
              ? html`<span class="nc-label">${T('sources')}</span>
                  <ul class="ex-sources">
                    ${sources.map(
                      src =>
                        html`<li>
                          ${
                            /^https?:/.test(s(src['url']))
                              ? html`<a href=${s(src['url'])} target="_blank" rel="noopener">${s(src['title'])}</a>`
                              : s(src['title'])
                          }${s(src['subtitle']) ? html` — <span class="nc-tiny">${s(src['subtitle'])}</span>` : nothing}${
                            s(src['pages']) ? html` <span class="nc-tiny">${T('pages', { pages: s(src['pages']) })}</span>` : nothing
                          }
                        </li>`,
                    )}
                  </ul>`
              : nothing
          }
          ${
            n(m['sourceFiles'])
              ? html`<p class="nc-tiny">
                  ${
                    n(m['sourceBytes'])
                      ? T('sourceFilesSize', { n: n(m['sourceFiles']), size: size(this.i18n, n(m['sourceBytes'])) })
                      : T('sourceFiles', { n: n(m['sourceFiles']) })
                  }
                </p>`
              : nothing
          }
          ${n(m['restricted']) ? html`<p class="nc-tiny">${T('restricted', { n: n(m['restricted']) })}</p>` : nothing}
          <noema-button
            slot="actions"
            variant="primary"
            class="ex-study"
            @click=${(e: Event) => {
              void this.busy(e.currentTarget, async () => {
                await this.host.studyPublic(x);
                close();
                this.#done();
              });
            }}
            >${this.t('loader.explore.study')}</noema-button
          >`,
    });
  }

  protected override updated(): void {
    const slot = this.querySelector('.ex-mtbar');
    if (slot && !this.#bar) {
      this.#bar = this.host.translateBar(this);
      if (this.#bar) slot.append(this.#bar);
    }
  }
  override render(): TemplateResult {
    const rm = this.#rm,
      items = this.#items;
    const head = html`<h1>${this.#title()}</h1>
      <p class="nc-muted ex-lead">${this.#L(rm ? 'exploreRoadmapsLead' : 'exploreLead')}</p>`;
    if (this.#error)
      return html`<div class="ex-view">
        ${head}
        <div class="nc-panel nc-empty">
          <p>${this.#L('exploreOffline')}</p>
          <p class="nc-muted">${this.#error}</p>
        </div>
      </div>`;
    if (!items)
      return html`<div class="ex-view">
        ${head}
        <p class="nc-muted">${this.#L('loading')}</p>
      </div>`;
    if (!items.length)
      return html`<div class="ex-view">
        ${head}
        <div class="nc-panel nc-empty"><p>${this.#L(rm ? 'noPublicRoadmaps' : 'noPublicSubjects')}</p></div>
      </div>`;
    // typing shows only the matches (a dialog gives the field the focus first: the sections stay until something is typed)
    const searching = !!this.#q.trim();
    const hits = matches(items, this.#q);
    const ph = this.#L(rm ? 'searchRoadmaps' : 'searchSubjects');
    return html`<div class="ex-view">
      ${head}
      <input
        class="nc-input ex-q"
        type="search"
        placeholder=${ph}
        aria-label=${ph}
        @input=${(e: Event) => {
          this.#q = (e.target as HTMLInputElement).value;
          this.requestUpdate();
        }}
      />
      <div class="ex-mtbar"></div>
      <div class="ex-doms" ?hidden=${searching}>
        ${sections(items, this.host.domains()).map(
          ([d, l]) =>
            html`<details class="ex-dom" data-dom=${d}>
              <summary>
                <span class="ex-domt">${this.#L('dom_' + d)}</span><span class="nc-pill">${this.i18n.format.number(l.length)}</span
                ><span class="ex-domchev" aria-hidden="true">${icon('forward')}</span>
              </summary>
              <div class="nc-list">${l.map((x, i) => this.#row(x, i, 'dom'))}</div>
            </details>`,
        )}
      </div>
      <div class="nc-list ex-results" ?hidden=${!this.#q.trim()}>
        ${hits.length ? hits.map((x, i) => this.#row(x, i, 'hit')) : html`<p class="nc-muted ex-noresults">${this.#L('noResults')}</p>`}
      </div>
    </div>`;
  }
}

/** what the Explore page is handed */
export type ExploreDeps = ScreenBase;

declare global {
  interface HTMLElementTagNameMap {
    'noema-explore-page': NoemaExplorePage;
  }
}
