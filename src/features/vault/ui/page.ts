/**
 * 🗄️ #/vault?q=…&<filters> — the files students share (docs/VAULT.md). The list is read once and filtered here, so a
 * search matches the words in any script, accents or not. One tidy row: the search and ⬆ Upload; "Sort by" and Filters
 * on the left, files or folders (two line icons) on the right. The filters are a side sheet; the page behind follows
 * every choice at once; the ones in use show as removable chips. The folders: by school (university › department ›
 * course) or by field down the graph, then the files by type, with chips for the languages, years and semesters there;
 * a folder can be pinned. ⋮ holds "My uploads" and "How it works". The count is a quiet line at the end.
 */
import { html, nothing, type TemplateResult } from 'lit';
import type { VaultFile } from '../../../ports/vault.ts';
import { icon, type IconName } from '../../../ui/kit/icons.ts';
import { openDialog, type DialogHandle } from '../../community/ui/dialogs.ts';
import { pill } from '../../community/ui/format.ts';
import type { ChromeMenuItem, ScreenChrome } from '../../community/ui/host.ts';
import { CommunityScreen } from '../../community/ui/screen.ts';
import { adopt, COMMON } from '../../community/ui/styles.ts';
import { SEARCH_CSS } from '../../search/ui/styles.ts';
import {
  activeFilters,
  fieldFolder,
  fieldsOf,
  folderPath,
  GROUPS,
  groupOf,
  isPinned,
  KINDS,
  langsOf,
  listOf,
  NONE,
  parseVaultParams,
  pin,
  same,
  SCHOOL,
  schoolFolder,
  sortFiles,
  sortKeys,
  stars,
  unpin,
  valuesOf,
  vaultHash,
  type FolderLevel,
  type VaultKey,
  type VaultParams,
} from '../domain/index.ts';
import { openAbout, openFile } from './file.ts';
import type { VaultScreenDeps } from './form.ts';
import { openUpload } from './upload.ts';
import { VAULT_CSS } from './styles.ts';

const GICON: Readonly<Record<string, IconName>> = {
  doc: 'doc',
  slides: 'cards',
  sheet: 'list',
  book: 'book',
  image: 'eye',
  audio: 'mic',
  video: 'play',
  text: 'doc',
};

type Patch = Partial<Record<VaultKey, string>>;

export class NoemaVaultPage extends CommunityScreen<VaultScreenDeps> {
  #P: VaultParams = {};
  #all: VaultFile[] = [];
  #state: 'loading' | 'ready' | 'offline' = 'loading';
  #offline = '';
  #pinsOpen = false;
  #filters: DialogHandle | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;

  get #ui(): VaultScreenDeps['ui'] {
    return this.deps.ui;
  }
  #T(k: string, p?: Record<string, string | number>): string {
    return this.#ui.T(k, p);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    adopt(this.ownerDocument, 'search', COMMON, SEARCH_CSS);
    adopt(this.ownerDocument, 'vault', VAULT_CSS);
    this.#P = parseVaultParams(this.host.hash());
    if (this.host.session()) void this.#refresh(false);
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.#timer);
    this.#filters?.close();
  }

  async #refresh(force: boolean): Promise<void> {
    try {
      this.#all = await this.#ui.load(force);
      this.#state = 'ready';
    } catch (e) {
      this.#state = 'offline';
      this.#offline = this.i18n.err(e);
    }
    this.requestUpdate();
    this.#filters?.redraw();
    // a vault file sent in a conversation: #/vault?id=…
    if (this.#state === 'ready' && this.#P.id) {
      const id = this.#P.id,
        f = this.#all.find(x => x.id === id);
      this.#set({ id: '' });
      if (f) this.#open(f);
      else this.toast(this.#T('fileGone'), 4000);
    }
  }
  #changed = (): void => {
    void this.#refresh(true);
  };
  #open(f: VaultFile): void {
    openFile(this.deps, f, this.#changed);
  }
  #upload(): void {
    openUpload(this.deps, this.#changed, this.#P.g ?? '');
  }

  /** the page's settings into the address (and drawn again) */
  #set(patch: Patch): void {
    const P: Record<string, string> = { ...this.#P, ...patch };
    for (const k of Object.keys(P)) if (!P[k]) Reflect.deleteProperty(P, k);
    this.#P = P;
    this.#pinsOpen = false; // the pinned folders wait behind their button again on every move
    this.replaceHash(vaultHash(P));
    this.requestUpdate();
    this.#filters?.redraw();
    this.chromeChanged();
  }

  protected override chrome(): ScreenChrome {
    const menu: ChromeMenuItem[] = [
      {
        label: this.#T('myUploads'),
        sub: this.#T('myUploadsSub'),
        icon: 'upload',
        run: () => {
          this.#set({ mine: this.#P.mine ? '' : '1' });
        },
      },
      {
        label: this.#T('howItWorks'),
        icon: 'info',
        run: () => {
          openAbout(this.deps);
        },
      },
    ];
    return { tab: 'vault', crumbs: [{ label: this.#T('title') }], menu };
  }

  /* ---------- the filters (a side sheet) ---------- */
  #openFilters(): void {
    if (this.#filters) return;
    this.#filters = openDialog(this.deps, {
      heading: this.#T('filters'),
      cls: 'vt-filtsheet',
      placement: 'sheet',
      render: () => html`${this.#fhead()}${this.#filterBody()}`,
      onClose: () => {
        this.#filters = null;
      },
    });
  }
  #sel(label: string, key: VaultKey, opts: readonly (readonly [string, string])[], bare = false): TemplateResult {
    const cur = this.#P[key] ?? '';
    return html`<label class="vt-f"
      >${bare ? nothing : html`<span class="vt-lb">${label}</span>`}<select
        class="nc-input"
        data-f=${key}
        aria-label=${label}
        @change=${(e: Event) => {
          this.#set({ [key]: (e.target as HTMLSelectElement).value });
        }}
      >
        <option value="" ?selected=${!cur}>${this.#T('any')}</option>
        ${opts.map(([v, l]) => html`<option value=${v} ?selected=${v === cur}>${l}</option>`)}
      </select></label
    >`;
  }
  #chip(key: VaultKey, val: string, label: string, multi = false): TemplateResult {
    const P = this.#P,
      on = multi ? listOf(P[key]).includes(val) : P[key] === val;
    return html`<button
      type="button"
      class="ns-srchip ${on ? 'on' : ''}"
      aria-pressed=${String(on)}
      data-f=${key}
      data-v=${val}
      @click=${() => {
        if (!multi) {
          this.#set({ [key]: on ? '' : val });
          return;
        }
        const s = new Set(listOf(P[key]));
        if (on) s.delete(val);
        else s.add(val);
        this.#set({ [key]: [...s].join(',') });
      }}
    >
      ${label}${on ? html`<span class="vt-chipx" aria-hidden="true">×</span>` : nothing}
    </button>`; // i18n-ignore (×)
  }
  #group(label: string, ...kids: TemplateResult[]): TemplateResult {
    return html`<div class="vt-fgroup">
      <b>${label}</b>
      <div class="vt-fbody">${kids}</div>
    </div>`;
  }
  /** the fields of the files here and every field above them, with how many files each holds */
  #fieldOpts(): [string, string][] {
    const ui = this.#ui,
      g = ui.graph,
      n = new Map<string, number>();
    for (const f of this.#all) {
      const s = new Set<string>();
      for (const x of fieldsOf(f)) for (const y of g.up(x)) s.add(y);
      for (const y of s) n.set(y, (n.get(y) ?? 0) + 1);
    }
    return [...n].map(([id, c]): [string, string] => [id, `${ui.fieldName(id)} (${ui.num(c)})`]).sort((a, b) => a[1].localeCompare(b[1]));
  }
  #filterBody(): TemplateResult {
    const ui = this.#ui,
      P = this.#P,
      all = this.#all,
      T = (k: string, p?: Record<string, string | number>): string => this.#T(k, p);
    // each list offers the values that exist under the choices made above it (university › department › course)
    const inU = all.filter(f => !P.u || same(f.university, P.u)),
      inD = inU.filter(f => !P.d || same(f.department, P.d)),
      inC = inD.filter(f => !P.c || same(f.course, P.c));
    const opt = (rows: readonly VaultFile[], k: string): [string, string][] =>
      valuesOf(rows, k).map(x => [String(x.v), `${k === 'university' ? ui.uni(x.v) : String(x.v)} (${ui.num(x.n)})`]);
    const years = valuesOf(all, 'year')
      .sort((a, b) => Number(b.v) - Number(a.v))
      .map((x): [string, string] => [String(x.v), String(x.v)]);
    const langs = valuesOf(
      all.flatMap(f => langsOf(f).map(language => ({ language }))),
      'language',
    ).map((x): [string, string] => [String(x.v), ui.langName(String(x.v))]);
    return html`<div class="vt-filters">
      ${this.#group(
        T('g.where'),
        this.#sel(T('f.university'), 'u', opt(all, 'university')),
        this.#sel(T('f.department'), 'd', opt(inU, 'department')),
        this.#sel(T('f.course'), 'c', opt(inD, 'course')),
        this.#sel(T('f.professor'), 'p', opt(inC, 'professor')),
      )}
      ${this.#group(
        T('g.when'),
        this.#sel(T('f.year'), 'y', years),
        this.#sel(
          T('f.semester'),
          'sem',
          Array.from({ length: 12 }, (_, i): [string, string] => [String(i + 1), ui.semName(i + 1)]),
        ),
      )}
      ${this.#group(T('g.type'), html`<div class="ns-srchips">${KINDS.map(k => this.#chip('k', k, T('kind.' + k), true))}</div>`)}
      ${this.#group(T('g.subject'), this.#sel(T('f.subject'), 'sub', this.#fieldOpts(), true))}
      ${this.#group(
        T('g.contents'),
        html`<div class="ns-srchips">
          ${this.#chip('x', '1', T('c.exercises'))} ${this.#chip('sol', '1', T('c.solutions'))}
          ${this.#chip('hw', 'hand', T('c.handwritten'))} ${this.#chip('hw', 'typed', T('c.typed'))}
        </div>`,
      )}
      ${this.#group(
        T('g.format'),
        this.#sel(T('f.language'), 'lg', langs),
        html`<div class="ns-srchips">${GROUPS.map(g => this.#chip('ft', g, T('ft.' + g), true))}</div>`,
      )}
      ${this.#group(
        T('g.quality'),
        this.#sel(T('f.rating'), 'r', [
          ['3', T('r.3')],
          ['4', T('r.4')],
        ]),
      )}
      ${this.#group(T('g.use'), html`<div class="ns-srchips">${this.#chip('used', '1', T('c.used'))}</div>`)}
      ${
        ui.groups.length
          ? this.#group(
              T('g.group'),
              this.#sel(
                T('f.group'),
                'g',
                ui.groups.map((g): [string, string] => [g.id, g.name]),
                true,
              ),
            )
          : nothing
      }
    </div>`;
  }
  #fhead(): TemplateResult {
    const on = activeFilters(this.#P);
    return html`<div class="vt-fhead">
      <small class="nc-tiny nc-muted">${this.#T('results', { n: this.#ui.filter(this.#all, this.#P).length })}</small>
      <button
        type="button"
        class="nc-link vt-clearall"
        ?disabled=${!on.length}
        @click=${() => {
          this.#set(Object.fromEntries(on.map(k => [k, ''])));
        }}
      >
        ${icon('close')}<span>${this.#T('clear')}</span>
      </button>
    </div>`;
  }
  /** the name of a filter in use (its chip) */
  #label(k: VaultKey): string {
    const P = this.#P,
      ui = this.#ui,
      T = (x: string): string => this.#T(x);
    switch (k) {
      case 'u':
        return ui.uni(P.u);
      case 'sem':
        return ui.semName(P.sem);
      case 'k':
        return listOf(P.k)
          .map(x => T('kind.' + x))
          .join(', ');
      case 'sub':
        return ui.fieldName(P.sub ?? '');
      case 'x':
        return T('c.exercises');
      case 'sol':
        return T('c.solutions');
      case 'hw':
        return T(P.hw === 'hand' ? 'c.handwritten' : 'c.typed');
      case 'lg':
        return ui.langName(P.lg ?? '');
      case 'ft':
        return listOf(P.ft)
          .map(x => T('ft.' + x))
          .join(', ');
      case 'r':
        return T('r.' + (P.r ?? ''));
      case 'used':
        return T('c.used');
      case 'mine':
        return T('myUploads');
      case 'g':
        return ui.groupName(P.g);
      default:
        return P[k] ?? '';
    }
  }

  /* ---------- the files ---------- */
  #card(f: VaultFile, i: number): TemplateResult {
    const ui = this.#ui,
      T = (k: string, p?: Record<string, string | number>): string => this.#T(k, p);
    const rating = f.rating_n ? `★ ${ui.num(Math.round(stars(f) * 10) / 10)}` : ''; // i18n-ignore (★: a sign)
    return html`<button
      type="button"
      class="nc-item vt-file"
      data-id=${f.id}
      @click=${() => {
        this.#open(f);
      }}
    >
      <span class="nc-ico" style="--bgc: var(--t${(i % 4) + 1}); --fgc: var(--t${(i % 4) + 1}i)" aria-hidden="true"
        >${icon(GICON[groupOf(f.file_name)] ?? 'doc')}</span
      >
      <span class="t"><b>${f.title}</b><small>${[T('kind.' + f.kind), ui.where(f)].join(' · ')}</small></span>
      <span class="vt-meta">
        ${f.room ? pill(ui.groupName(f.room), 2, 'vt-grouppill') : nothing}
        ${f.mine && f.status !== 'ok' ? pill(T('status.' + String(f.status))) : nothing}
        ${rating ? html`<span title=${T('ratingN', { n: f.rating_n ?? 0 })}>${rating}</span>` : nothing}
        ${
          f.downloads
            ? html`<span title=${T('downloadsN', { n: f.downloads })}>⬇ ${ui.num(f.downloads)}</span>` // i18n-ignore (⬇: a sign)
            : nothing
        }
      </span>
      <span class="chev" aria-hidden="true">${icon('forward')}</span>
    </button>`;
  }
  #empty(): TemplateResult {
    const face = this.host.face('breathe');
    return html`<div class="nc-panel nc-empty vt-empty">
      ${face ?? nothing}
      <p>${this.#all.length ? this.#T('none') : this.#T('emptyVault')}</p>
      <noema-button
        size="sm"
        variant="primary"
        @click=${() => {
          this.#upload();
        }}
        >${this.#T('upload')}</noema-button
      >
    </div>`;
  }
  #files(list: readonly VaultFile[]): TemplateResult {
    const sorted = sortFiles(list, this.#P.sort);
    return sorted.length ? html`<div class="nc-list vt-list">${sorted.slice(0, 300).map((f, i) => this.#card(f, i))}</div>` : this.#empty();
  }

  /* ---------- 📁 the folders ---------- */
  #folderName(lev: FolderLevel, v: string): string {
    if (v === NONE)
      return this.#T({ university: 'miscUniversity', department: 'miscDepartment', course: 'miscCourse', field: 'miscField' }[lev]); // “Other departments”: the level shows in the name
    return lev === 'field' ? this.#ui.fieldName(v) : v;
  }
  #folderRow(x: { readonly v: string; readonly n: number }, name: string, to: string): TemplateResult {
    return html`<button
      type="button"
      class="nc-item vt-folder"
      data-v=${x.v}
      @click=${() => {
        this.#set({ f: to });
      }}
    >
      <span class="nc-ico" aria-hidden="true">${icon('vault')}</span>
      <span class="t"><b>${name}</b><small>${this.#T('nFiles', { n: x.n })}</small></span>
      <span class="chev" aria-hidden="true">${icon('forward')}</span>
    </button>`;
  }
  #folders(list: readonly VaultFile[]): TemplateResult {
    const ui = this.#ui,
      P = this.#P,
      T = (k: string, p?: Record<string, string | number>): string => this.#T(k, p);
    const by = P.by === 'field' ? 'field' : 'school',
      path = folderPath(P.f);
    const LV: readonly FolderLevel[] = by === 'field' ? path.map(() => 'field' as const) : SCHOOL;
    const depth = Math.min(path.length, LV.length);
    const levelAt = (i: number): FolderLevel => LV[i] ?? 'field';
    const label = path
      .slice(0, depth)
      .map((p, i) => this.#folderName(levelAt(i), p))
      .join(' › ');
    const mine = ui.pins(),
      pinned = isPinned(mine, by, P.f ?? '');
    const pinBtn = depth
      ? html`<button
          type="button"
          class="nc-iconbtn vt-pin ${pinned ? 'on' : ''}"
          aria-pressed=${String(pinned)}
          title=${pinned ? T('unpin') : T('pin')}
          aria-label=${pinned ? T('unpin') : T('pin')}
          @click=${() => {
            ui.putPins(pinned ? unpin(mine, by, P.f ?? '') : pin(mine, { by, f: P.f ?? '', label }));
            this.requestUpdate();
          }}
        >
          ${icon('pushpin')}
        </button>`
      : nothing;
    const pinsBtn = mine.length
      ? html`<noema-button
          class="vt-pinsbtn"
          variant="quiet"
          size="sm"
          aria-expanded=${String(this.#pinsOpen)}
          title=${T('pinnedFolders')}
          aria-label=${T('pinnedFolders')}
          @click=${() => {
            this.#pinsOpen = !this.#pinsOpen;
            this.requestUpdate();
          }}
          >${icon('pushpin')}<span>${ui.num(mine.length)}</span>${icon('down')}</noema-button
        >`
      : nothing;
    const pinList = html`<div class="vt-pinlist" ?hidden=${!this.#pinsOpen}>
      ${mine.map(
        x =>
          html`<span class="vt-pinchip"
            ><button
              type="button"
              class="linkish"
              @click=${() => {
                this.#set({ by: x.by === 'school' ? '' : x.by, f: x.f });
              }}
            >
              ${x.label}</button
            ><button
              type="button"
              class="vt-chipx"
              title=${T('removePin', { name: x.label })}
              aria-label=${T('removePin', { name: x.label })}
              @click=${() => {
                ui.putPins(unpin(ui.pins(), x.by, x.f));
                this.requestUpdate();
              }}
            >
              ×
            </button></span
          >`, // i18n-ignore (×)
      )}
    </div>`;
    const ways = html`<div class="nc-seg vt-ways" role="radiogroup" aria-label=${T('folders')}>
      ${(
        [
          ['school', T('waySchool'), T('bySchool')],
          ['field', T('wayField'), T('byField')],
        ] as const
      ).map(
        ([k, l, title]) =>
          html`<button
            type="button"
            class=${by === k ? 'on' : ''}
            role="radio"
            aria-checked=${String(by === k)}
            title=${title}
            data-by=${k}
            @click=${() => {
              this.#set({ by: k === 'school' ? '' : k, f: '' });
            }}
          >
            ${l}
          </button>`,
      )}
    </div>`;
    const crumbs = html`<nav class="vt-path" aria-label=${T('folders')}>
      <button
        type="button"
        class="nc-link linkish"
        @click=${() => {
          this.#set({ f: '' });
        }}
      >
        ${by === 'school' ? T('allSchools') : T('allFields')}
      </button>
      ${path.slice(0, depth).map(
        (p, i) =>
          html`<span aria-hidden="true">›</span
            ><button
              type="button"
              class="nc-link linkish"
              @click=${() => {
                this.#set({ f: path.slice(0, i + 1).join('›') });
              }}
            >
              ${this.#folderName(levelAt(i), p)}
            </button>`,
      )}
      ${pinBtn}
    </nav>`;
    const head = html`<div class="vt-fhead2">${crumbs}<span class="nc-grow"></span>${pinsBtn}${ways}</div>
      ${pinList}`;
    if (by === 'field') {
      const { node, here, kids, direct } = fieldFolder(list, path, ui.graph, id => ui.fieldName(id));
      if (!kids.length) return html`${head}${this.#ending(here)}`;
      return html`${head}
        <div class="nc-list vt-folders">${kids.map(x => this.#folderRow(x, this.#folderName('field', x.v), [...path, x.v].join('›')))}</div>
        ${
          direct.length
            ? html`<h3 class="vt-directhead">${T('filedHere', { name: ui.fieldName(node ?? '') })}</h3>
                ${this.#ending(direct)}`
            : nothing
        }`;
    }
    const { here, level, kids } = schoolFolder(list, path, (l, v) => this.#folderName(l, v));
    if (!level) return html`${head}${this.#ending(here)}`;
    return html`${head}
    ${
      kids.length
        ? html`<div class="nc-list vt-folders">
            ${kids.map(x => this.#folderRow(x, this.#folderName(level, x.v), [...path.slice(0, depth), x.v].join('›')))}
          </div>`
        : this.#empty()
    }`;
  }
  /** the end of a way: chips for the languages, years and semesters there (each one a filter), then the files by type */
  #ending(list: readonly VaultFile[]): TemplateResult {
    if (!list.length) return this.#empty();
    const ui = this.#ui,
      P = this.#P;
    const chipsOf = (key: VaultKey, vals: readonly (string | number)[], name: (v: string) => string): TemplateResult[] =>
      vals.length > 1
        ? vals.map(v => {
            const s = String(v),
              on = P[key] === s;
            return html`<button
              type="button"
              class="ns-srchip ${on ? 'on' : ''}"
              aria-pressed=${String(on)}
              data-f=${key}
              data-v=${s}
              @click=${() => {
                this.#set({ [key]: on ? '' : s });
              }}
            >
              ${name(s)}
            </button>`;
          })
        : [];
    const uniq = <T>(a: readonly T[]): T[] => [...new Set(a)];
    const bar = [
      ...chipsOf('lg', uniq(list.flatMap(langsOf)), c => ui.langName(c)),
      ...chipsOf(
        'y',
        uniq(list.map(f => f.year).filter((y): y is number => !!y)).sort((a, b) => b - a),
        String,
      ),
      ...chipsOf(
        'sem',
        uniq(list.map(f => f.semester).filter((y): y is number => !!y)).sort((a, b) => a - b),
        v => ui.semName(v),
      ),
    ];
    const sorted = sortFiles(list, P.sort),
      kinds = KINDS.filter(k => sorted.some(f => f.kind === k));
    return html`${bar.length ? html`<div class="ns-srchips vt-endchips">${bar}</div>` : nothing}
    ${kinds.map(k => {
      const of = sorted.filter(f => f.kind === k);
      return html`<section class="vt-kindgroup" data-kind=${k}>
        <h3 class="vt-kindhead">${this.#T('kind.' + k)} <small class="nc-muted">${ui.num(of.length)}</small></h3>
        <div class="nc-list vt-list">${of.slice(0, 300).map((f, i) => this.#card(f, i))}</div>
      </section>`;
    })}`;
  }

  override render(): TemplateResult {
    const ui = this.#ui,
      P = this.#P,
      T = (k: string, p?: Record<string, string | number>): string => this.#T(k, p);
    const top = html`<h1>${T('title')}</h1>
      <p class="nc-muted vt-lead">${T('lead')}</p>`;
    if (!this.host.session())
      return html`<div class="nc vt-view">
        ${top}
        <div class="nc-panel nc-empty">
          <p>${T('signIn')}</p>
          <noema-button
            variant="primary"
            @click=${() => {
              this.host.signIn();
            }}
            >${T('signInBtn')}</noema-button
          >
        </div>
      </div>`;
    const on = activeFilters(P),
      n = on.length;
    let out: TemplateResult;
    if (this.#state === 'loading') out = html`<p class="nc-muted">${T('loading')}</p>`;
    else if (this.#state === 'offline')
      out = html`<div class="nc-panel nc-empty">
        <p>${T('offline')}</p>
        <p class="nc-tiny nc-muted">${this.#offline}</p>
      </div>`;
    else {
      const list = ui.filter(this.#all, P);
      out = html`${P.g ? html`<p class="nc-panel nc-tiny vt-groupnote">${T('groupNote', { name: ui.groupName(P.g) })}</p>` : nothing}
        ${P.v === 'files' ? this.#files(list) : this.#folders(list)}
        <p class="nc-tiny nc-muted vt-count">${T('results', { n: list.length })}</p>`;
    }
    const views = [
      ['files', T('files'), 'doc'],
      ['', T('folders'), 'vault'],
    ] as const;
    return html`<div class="nc vt-view">
      ${top}
      <div class="vt-bar">
        <input
          class="nc-input ns-srin vt-q"
          type="search"
          value=${P.q ?? ''}
          placeholder=${T('searchPh')}
          aria-label=${T('search')}
          autocomplete="off"
          @input=${(e: Event) => {
            const v = (e.target as HTMLInputElement).value.trim();
            clearTimeout(this.#timer);
            this.#timer = setTimeout(() => {
              this.#set({ q: v });
            }, 140);
          }}
        />
        <noema-button
          class="vt-upbtn"
          variant="primary"
          @click=${() => {
            this.#upload();
          }}
          >${icon('upload')}<span>${T('upload')}</span></noema-button
        >
      </div>
      <div class="vt-row">
        <label class="vt-sortl"
          ><span>${T('sortBy')}</span
          ><select
            class="nc-input vt-sort"
            aria-label=${T('sort')}
            @change=${(e: Event) => {
              const v = (e.target as HTMLSelectElement).value;
              this.#set({ sort: v === 'new' ? '' : v });
            }}
          >
            ${sortKeys().map(k => html`<option value=${k} ?selected=${(P.sort ?? 'new') === k}>${T('sort.' + k)}</option>`)}
          </select></label
        >
        <noema-button
          class="vt-filtbtn"
          variant="quiet"
          size="sm"
          aria-haspopup="dialog"
          @click=${() => {
            this.#openFilters();
          }}
          >${icon('filter')}<span>${n ? T('filtersN', { n }) : T('filters')}</span></noema-button
        >
        <span class="nc-grow"></span>
        <div class="nc-seg vt-viewseg" role="radiogroup" aria-label=${T('view')}>
          ${views.map(
            ([k, l, e]) =>
              html`<button
                type="button"
                class=${(P.v ?? '') === k ? 'on' : ''}
                role="radio"
                aria-checked=${String((P.v ?? '') === k)}
                aria-label=${l}
                title=${l}
                data-v=${k || 'folders'}
                @click=${() => {
                  this.#set({ v: k, f: '', by: '' });
                }}
              >
                ${icon(e)}
              </button>`,
          )}
        </div>
      </div>
      <div class="vt-active">
        ${on.map(
          k =>
            html`<button
              type="button"
              class="ns-srchip on vt-chip"
              data-f=${k}
              title=${T('removeFilter', { what: this.#label(k) })}
              aria-label=${T('removeFilter', { what: this.#label(k) })}
              @click=${() => {
                this.#set({ [k]: '' });
              }}
            >
              ${this.#label(k)}<span class="vt-chipx" aria-hidden="true">×</span>
            </button>`, // i18n-ignore (×)
        )}
        ${
          on.length > 1
            ? html`<button
                type="button"
                class="nc-link vt-clearchips"
                @click=${() => {
                  this.#set(Object.fromEntries(on.map(k => [k, ''])));
                }}
              >
                ${T('clear')}
              </button>`
            : nothing
        }
      </div>
      <div class="vt-out">${out}</div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'noema-vault-page': NoemaVaultPage;
  }
}
