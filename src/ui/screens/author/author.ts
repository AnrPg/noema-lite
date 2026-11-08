/**
 * `noema-author`: the activity author's page (#/author; docs/activities-dev/authoring_ui.md). An interactive activity is
 * built with forms generated from the JSON Schemas (noema-schema-form): its registry entry, its spec (the schema of its
 * engine) and its word tables; the problems are shown at their fields (the schema, then the validators' own rules); the
 * preview is the app's real runtime (AuthorPreview), beside the form from 960 px and below it on a phone; undo / redo
 * (Ctrl+Z, Ctrl+Shift+Z / Ctrl+Y); the activity folder is downloaded as a .zip (or file by file) and imported back. No server.
 * Drawn in the page's own DOM (light DOM): the preview is the runtime's own markup, styled by the app's stylesheet.
 *
 *   <noema-author .service=${authorService} .preview=${preview}></noema-author>
 *
 * Its words are the catalogs' engine.author.* (and sh.more for the ⋮ menu).
 */
import { html, nothing, svg, type PropertyValues, type TemplateResult } from 'lit';
import { createRef, ref } from 'lit/directives/ref.js';
import { live } from 'lit/directives/live.js';
import type { AuthorDoc, AuthorProblem, AuthorService, AuthorTab, KindPick, SchemaFormModel } from '../../../ports/authoring.ts';
import type { TimerHandle } from '../../../ports/clock.ts';
import { NoemaElement } from '../../core/element.ts';
import { moveIndex } from '../../core/keys.ts';
import { ICONS } from '../../kit/icons.ts';
import type { Decorate, NoemaSchemaForm, SchemaFormChange } from './schema-form.ts';
import { authorStyles } from './styles.ts';

/** the activity's preview: the app's real runtime, drawn into a box */
export interface AuthorPreview {
  /** whether the runtime is there yet (the app may still be starting the subject's engine): asked again until it is */
  ready?(): boolean;
  show(
    box: HTMLElement,
    item: Record<string, unknown>,
    spec: Record<string, unknown>,
    strings: AuthorDoc['strings'],
    locale: string,
  ): { destroy(): void };
}

const TABS: readonly AuthorTab[] = ['item', 'spec', 'strings'];
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const PATHS = {
  warn: ICONS.alert,
  ok: ICONS.check,
};
const ico = (k: keyof typeof PATHS): TemplateResult =>
  html`<svg class="aa-ico" viewBox="0 0 24 24" aria-hidden="true">${svg`<path d=${PATHS[k]}></path>`}</svg>`;
let STYLED = false;
/** the page's styles, once per document (light DOM: a stylesheet of the document, on the tokens) */
function addStyles(doc: Document): void {
  if (STYLED || doc.querySelector('style[data-author-css]')) return;
  STYLED = true;
  const s = doc.createElement('style');
  s.dataset['authorCss'] = '1';
  s.textContent = authorStyles;
  doc.head.append(s);
}

export class NoemaAuthor extends NoemaElement {
  static override properties = {
    service: { attribute: false },
    preview: { attribute: false },
  };
  declare service: AuthorService | null;
  declare preview: AuthorPreview | null;

  #doc: AuthorDoc | null = null;
  #hist: string[] = [];
  #hi = 0;
  #tab: AuthorTab = 'spec';
  #probs: AuthorProblem[] = [];
  #prevLoc: string | null = null;
  #lastGood: string | null = null;
  #live: { destroy(): void } | null = null;
  #prevNote = '';
  #stale = false;
  #start: Extract<KindPick, { ask: string }> | null = null;
  #filesOpen = false;
  #note = '';
  #localeErr = false;
  #commitT: TimerHandle | null = null;
  #checkT: TimerHandle | null = null;
  #prevT: TimerHandle | null = null;
  readonly #pbox = createRef<HTMLDivElement>();
  readonly #fileIn = createRef<HTMLInputElement>();
  readonly #specForm = createRef<NoemaSchemaForm>();
  readonly #itemForm = createRef<NoemaSchemaForm>();
  #kindValue = '';

  constructor() {
    super();
    this.service = null;
    this.preview = null;
  }
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  /* ---------------- the page's API (the route and the browser suite drive it) ---------------- */
  /** the activity as it is now (a copy) */
  get(): AuthorDoc {
    return clone(this.#d());
  }
  /** a new activity (recorded for undo) */
  set(d: AuthorDoc): void {
    this.#load(d, true);
  }
  undo(): void {
    if (this.#commitT !== null) this.#commit();
    if (this.#hi > 0) {
      this.#hi--;
      this.#load(JSON.parse(this.#hist[this.#hi] ?? 'null') as AuthorDoc, false);
    }
  }
  redo(): void {
    if (this.#commitT !== null) this.#commit();
    if (this.#hi < this.#hist.length - 1) {
      this.#hi++;
      this.#load(JSON.parse(this.#hist[this.#hi] ?? 'null') as AuthorDoc, false);
    }
  }
  files(): Record<string, string> {
    return this.#svc().files(this.#d());
  }
  zip(): Uint8Array {
    return this.#svc().zip(this.files());
  }
  check(): AuthorProblem[] {
    return this.#svc().check(this.#d());
  }
  showTab(k: AuthorTab): void {
    this.#tab = k;
    this.requestUpdate();
  }
  /** the pending commit, checks and preview at once */
  flush(): void {
    if (this.#commitT !== null) this.#commit();
    this.#clear('check');
    this.#runChecks();
    this.#clear('prev');
    this.#paintPreview();
  }

  /* ---------------- life ---------------- */
  override connectedCallback(): void {
    super.connectedCallback();
    addStyles(this.ownerDocument);
    document.addEventListener('keydown', this.#onKey);
    if (!this.#doc && this.service) this.#load(this.service.blank(), false, true);
    else if (this.#doc) this.#schedulePreview(0); // moved to another place of the page: the preview starts again
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.#onKey);
    this.#live?.destroy();
    this.#live = null;
    this.#lastGood = null;
    for (const t of ['commit', 'check', 'prev'] as const) this.#clear(t);
  }
  protected override willUpdate(changed: PropertyValues): void {
    if (changed.has('service') && this.service && !this.#doc) this.#load(this.service.blank(), false, true);
  }

  #svc(): AuthorService {
    if (!this.service) throw new Error('noema-author: no service');
    return this.service;
  }
  #d(): AuthorDoc {
    if (!this.#doc) this.#doc = this.#svc().blank();
    return this.#doc;
  }
  #TT(k: string, vars?: Readonly<Record<string, string | number>>): string {
    return this.t('engine.author.' + k, vars);
  }
  #later(kind: 'commit' | 'check' | 'prev', ms: number, f: () => void): void {
    this.#clear(kind);
    const h = this.services.clock.setTimeout(() => {
      this.#set(kind, null);
      f();
    }, ms);
    this.#set(kind, h);
  }
  #set(kind: 'commit' | 'check' | 'prev', h: TimerHandle | null): void {
    if (kind === 'commit') this.#commitT = h;
    else if (kind === 'check') this.#checkT = h;
    else this.#prevT = h;
  }
  #clear(kind: 'commit' | 'check' | 'prev'): void {
    const h = kind === 'commit' ? this.#commitT : kind === 'check' ? this.#checkT : this.#prevT;
    if (h !== null) this.services.clock.clearTimeout(h);
    this.#set(kind, null);
  }

  /* ---------------- changes, undo / redo ---------------- */
  #load(d: AuthorDoc, record: boolean, first = false): void {
    const doc = clone(d);
    if (typeof doc.strings !== 'object' || Array.isArray(doc.strings)) doc.strings = {};
    this.#doc = doc;
    this.#start = null;
    this.#kindValue = this.#svc().kindOf(doc).id;
    if (first) {
      this.#hist = [JSON.stringify(doc)];
      this.#hi = 0;
    }
    this.#specForm.value?.set(doc.spec);
    this.#itemForm.value?.set(doc.item);
    this.#paintLocales();
    if (record) this.#commit();
    this.#runChecks();
    this.#schedulePreview(0);
    this.requestUpdate();
  }
  #changed(structural: boolean): void {
    if (structural) this.#paintLocales();
    if (structural) this.#commit();
    else
      this.#later('commit', 400, () => {
        this.#commit();
      });
    this.#later('check', structural ? 0 : 200, () => {
      this.#runChecks();
      this.#schedulePreview();
    });
    this.requestUpdate();
    this.#specForm.value?.requestUpdate(); // the words under the key fields follow
  }
  #commit(): void {
    this.#clear('commit');
    const s = JSON.stringify(this.#d());
    if (s === this.#hist[this.#hi]) return;
    this.#hist = this.#hist.slice(0, this.#hi + 1);
    this.#hist.push(s);
    if (this.#hist.length > 200) this.#hist.shift();
    this.#hi = this.#hist.length - 1;
    this.requestUpdate();
  }
  #onKey = (e: KeyboardEvent): void => {
    const t = e.target;
    if (!this.isConnected || !(t instanceof Node) || !(this.contains(t) || t === document.body || t === document.documentElement)) return;
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) {
      e.preventDefault();
      this.undo();
    } else if ((k === 'z' && e.shiftKey) || k === 'y') {
      e.preventDefault();
      this.redo();
    }
  };

  /* ---------------- checks ---------------- */
  #runChecks(): void {
    const d = this.#d();
    this.#probs = this.#svc().check(d);
    this.#specForm.value?.setErrors(this.#probs.filter(p => p.tab === 'spec'));
    this.#itemForm.value?.setErrors(this.#probs.filter(p => p.tab === 'item'));
    this.requestUpdate();
  }
  #goTo(p: AuthorProblem): void {
    this.showTab(p.tab);
    const f = p.tab === 'spec' ? this.#specForm.value : p.tab === 'item' ? this.#itemForm.value : null;
    if (f) f.focusPath(p.path);
    else if (p.key)
      void this.updateComplete.then(() => {
        this.querySelector<HTMLInputElement>(`#aa-panel-strings .aa-strow[data-key="${CSS.escape(p.key ?? '')}"] input`)?.focus();
      });
  }

  /* ---------------- the preview ---------------- */
  #paintLocales(): void {
    const ls = Object.keys(this.#d().strings),
      ui = this.i18n.locale();
    if (!this.#prevLoc || !ls.includes(this.#prevLoc)) this.#prevLoc = ls.includes(ui) ? ui : ls.includes('en') ? 'en' : (ls[0] ?? 'en');
  }
  #schedulePreview(ms = 400): void {
    this.#later('prev', ms, () => {
      this.#paintPreview();
    });
  }
  #paintPreview(): void {
    const box = this.#pbox.value,
      d = this.#d();
    if (!this.preview) {
      this.#prevNote = this.#TT('previewOff');
      this.requestUpdate();
      return;
    }
    if (this.preview.ready && !this.preview.ready()) {
      this.#prevNote = this.#TT('previewOff');
      this.requestUpdate();
      if (this.isConnected) this.#schedulePreview(500);
      return;
    }
    const stale = this.#probs.some(p => p.tab === 'spec' || (p.tab === 'strings' && p.key));
    if (stale) {
      this.#prevNote = this.#TT('previewStale');
      this.#stale = true;
      this.requestUpdate();
      return;
    }
    this.#prevNote = '';
    this.#stale = false;
    this.requestUpdate();
    const loc = this.#prevLoc ?? 'en';
    const sig = JSON.stringify([d.spec, d.strings[loc], loc]);
    if (!box || (sig === this.#lastGood && this.#live)) return;
    this.#lastGood = sig;
    this.#live?.destroy();
    this.#live = null;
    box.replaceChildren();
    try {
      this.#live = this.preview.show(box, d.item, d.spec, d.strings, loc);
    } catch (e) {
      console.warn('[noema] author preview', e); // i18n-ignore (a console line)
      this.#live = null;
    }
  }
  protected override firstUpdated(): void {
    this.#runChecks();
    this.#schedulePreview(0);
  }

  /* ---------------- the kinds ---------------- */
  #pickKind(id: string): void {
    const svc = this.#svc(),
      r = svc.pick(id, this.#d());
    this.#kindValue = id;
    if ('ask' in r) {
      this.#start = r;
      this.requestUpdate();
      return;
    }
    this.#load(r.doc, true);
  }
  #cancelStart(): void {
    this.#start = null;
    this.#kindValue = this.#svc().kindOf(this.#d()).id;
    this.requestUpdate();
  }

  /* ---------------- files ---------------- */
  #download(name: string, blob: Blob): void {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.className = 'aa-dl';
    document.body.append(a);
    a.click();
    this.services.clock.setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 1000);
  }
  #downloadZip(): void {
    this.#download(String(this.#d().item['id']) + '.zip', new Blob([this.zip() as Uint8Array<ArrayBuffer>], { type: 'application/zip' }));
  }
  async #import(e: Event): Promise<void> {
    const input = e.target as HTMLInputElement,
      svc = this.#svc();
    const fs: Record<string, string> = {},
      bad: string[] = [];
    for (const f of [...(input.files ?? [])]) {
      try {
        if (/\.zip$/i.test(f.name)) Object.assign(fs, await svc.unzip(new Uint8Array(await f.arrayBuffer())));
        else {
          const t = await f.text();
          JSON.parse(t);
          fs[f.webkitRelativePath || f.name] = t;
        }
      } catch (er) {
        bad.push(this.#TT('importBad', { file: f.name, why: er instanceof Error ? er.message : String(er) }));
      }
    }
    input.value = '';
    if (Object.keys(fs).length) this.#load(svc.fromFiles(fs, this.#d()), true);
    this.#note = [this.#TT('importDone', { n: Object.keys(fs).length }), ...bad].join(' · ');
    this.requestUpdate();
  }
  #menu(e: CustomEvent<{ value: string }>): void {
    const v = e.detail.value;
    if (v === 'new') {
      if (confirm(this.#TT('newConfirm'))) this.#load(this.#svc().blankOf(this.#kindValue), true);
    } else if (v === 'import') this.#fileIn.value?.click();
    else if (v === 'files') {
      this.#filesOpen = !this.#filesOpen;
      this.requestUpdate();
    }
  }

  /* ---------------- the words ---------------- */
  #setText(loc: string, key: string, text: string): void {
    const s = this.#d().strings,
      t = (s[loc] ??= {});
    if (text) t[key] = text;
    else Reflect.deleteProperty(t, key);
    this.#changed(false);
  }
  /** the key's text in every table, under a key field of the spec (scope: its path) and in the table of all words */
  #keyTexts(key: string, scope: string): TemplateResult | typeof nothing {
    const svc = this.#svc(),
      d = this.#d();
    if (!svc.isKey(key)) return nothing;
    return html`<div class="aa-ktg" role="group" aria-label=${this.#TT('keyTexts') + ': ' + key}>
      ${Object.keys(d.strings).map(loc => {
        const v = d.strings[loc]?.[key] ?? '',
          id = `aa-kt-${scope}-${loc}-${key}`;
        return html`<label class="aa-ktl" for=${id}>${loc}</label
          ><input
            id=${id}
            type="text"
            class=${'sf-in aa-ktin' + (v ? '' : ' aa-miss')}
            placeholder=${this.#TT('missingText')}
            aria-label=${this.#TT('textIn', { loc })}
            data-strkey=${key}
            data-loc=${loc}
            lang=${loc}
            autocomplete="off"
            .value=${live(v)}
            @input=${(e: Event) => {
              this.#setText(loc, key, (e.target as HTMLInputElement).value);
            }}
          />`;
      })}
    </div>`;
  }
  #decorate: Decorate = (hint, path, value) => {
    const d = this.#d();
    switch (hint) {
      case 'key':
        return {
          list: 'aa-keys',
          after: html`<div class="aa-kt">${this.#keyTexts(String(value), JSON.stringify(path).replace(/\W+/g, '-'))}</div>`,
        };
      case 'expr': {
        const fb = this.#svc().formula(d, path, String(value));
        if (!fb) return { mono: true, after: html`<div class="aa-xfb"></div>` };
        const names = fb.names.length ? this.#TT('names', { names: fb.names.join(', ') }) : this.#TT('namesNone');
        return {
          mono: true,
          after: html`<div class="aa-xfb"><p class="aa-names">${names}</p></div>`,
          error: fb.error ? { id: 'aa-x-' + JSON.stringify(path).replace(/\W+/g, '-'), msg: fb.error } : null,
        };
      }
      case 'element':
        return { list: 'aa-els' };
      case 'series':
        return { list: 'aa-series' };
      case 'name':
        return { mono: true };
      case 'of': {
        const id = 'aa-of-' + JSON.stringify(path).replace(/\W+/g, '-');
        return {
          list: id,
          mono: true,
          after: html`<datalist id=${id}>
            ${this.#svc()
              .ofs(d, path)
              .map(v => html`<option value=${v}></option>`)}
          </datalist>`,
        };
      }
      case 'scene':
      case 'sound':
        return { list: 'aa-' + hint + 's' };
      case 'ref':
        return { list: 'aa-ids', mono: true };
      case 'part':
        return { list: 'aa-parts', mono: true };
      default:
        return null;
    }
  };
  #addLocale(input: HTMLInputElement): void {
    const l = input.value.trim(),
      d = this.#d();
    if (!this.#svc().isLocale(l) || d.strings[l]) {
      this.#localeErr = true;
      this.requestUpdate();
      return;
    }
    this.#localeErr = false;
    d.strings[l] = {};
    input.value = '';
    this.#changed(true);
  }
  #removeLocale(l: string): void {
    Reflect.deleteProperty(this.#d().strings, l);
    this.#changed(true);
  }
  #removeKey(k: string): void {
    for (const t of Object.values(this.#d().strings)) Reflect.deleteProperty(t, k);
    this.#changed(true);
  }

  /* ---------------- drawing ---------------- */
  override render(): TemplateResult {
    if (!this.service) return html``;
    const svc = this.service,
      d = this.#d(),
      TT = (k: string, v?: Readonly<Record<string, string | number>>): string => this.#TT(k, v);
    const kinds = svc.kinds(),
      kind = kinds.flatMap(g => g.kinds).find(k => k.id === this.#kindValue) ?? svc.kindOf(d);
    const spec = svc.specForm(d.spec),
      itemForm = svc.itemForm();
    const count = (t: AuthorTab): number => this.#probs.filter(p => p.tab === t).length;
    const canUndo = this.#hi > 0 || (this.#commitT !== null && JSON.stringify(d) !== this.#hist[this.#hi]);
    const canRedo = this.#hi < this.#hist.length - 1;
    const lists = svc.lists(d);
    const dl = (id: string, vs: readonly string[]): TemplateResult =>
      html`<datalist id=${id}>${vs.map(v => html`<option value=${v}></option>`)}</datalist>`;
    const st = this.#start;
    return html`<div class="aa" data-author="1">
      <header class="aa-top">
        <div class="aa-head">
          <h1 class="aa-h1">${TT('title')}</h1>
          <noema-tip topic=${TT('title')}>${TT('intro')}</noema-tip>
        </div>
        <div class="aa-bar">
          <label class="aa-tl" for="aa-type">${TT('type')}</label>
          <select
            class="sf-in aa-type"
            id="aa-type"
            data-aa="type"
            @change=${(e: Event) => {
              this.#pickKind((e.target as HTMLSelectElement).value);
            }}
          >
            ${kinds.map(
              g =>
                html`<optgroup label=${g.label}>
                  ${g.kinds.map(k => html`<option value=${k.id} title=${k.what} .selected=${k.id === this.#kindValue}>${k.name}</option>`)}
                </optgroup>`,
            )}
          </select>
          <noema-tip topic=${kind.name} data-aa="type-info">${kind.what}</noema-tip>
          <span class="aa-sp"></span>
          <noema-icon-button
            class="aa-undo"
            data-aa="undo"
            label=${TT('undo')}
            aria-keyshortcuts="Control+Z"
            icon="undo"
            ?disabled=${!canUndo}
            @click=${() => {
              this.undo();
            }}
          ></noema-icon-button>
          <noema-icon-button
            data-aa="redo"
            label=${TT('redo')}
            aria-keyshortcuts="Control+Shift+Z"
            icon="redo"
            ?disabled=${!canRedo}
            @click=${() => {
              this.redo();
            }}
          ></noema-icon-button>
          <noema-button
            variant="primary"
            size="sm"
            icon="download"
            data-aa="zip"
            @click=${() => {
              this.#downloadZip();
            }}
            >${TT('exportZip')}</noema-button
          >
          <noema-menu
            label=${this.t('sh.more')}
            data-aa="more"
            @noema-select=${(e: CustomEvent<{ value: string }>) => {
              this.#menu(e);
            }}
          >
            <noema-menu-item value="new" icon="plus">${TT('new')}</noema-menu-item>
            <noema-menu-item value="import" icon="upload">${TT('import')}</noema-menu-item>
            <noema-menu-item value="files" icon="list">${TT('exportFiles')}</noema-menu-item>
          </noema-menu>
          <input
            type="file"
            multiple
            hidden
            accept=".zip,.json,application/zip,application/json"
            class="aa-file"
            data-aa="import-input"
            ${ref(this.#fileIn)}
            @change=${(e: Event) => {
              void this.#import(e);
            }}
          />
        </div>
        ${
          st
            ? html`<div class="aa-start" role="group" aria-labelledby="aa-startq">
                <span class="aa-startq" id="aa-startq">${st.ask}</span>
                <span class="aa-row aa-startb">
                  ${
                    st.ref
                      ? html`<noema-button
                          variant="primary"
                          size="sm"
                          data-aa="start-ref"
                          title=${st.ref.tip}
                          @click=${() => {
                            if (st.ref) this.#load(st.ref.doc, true);
                          }}
                          >${TT('startRef')}</noema-button
                        >`
                      : nothing
                  }
                  <noema-button
                    variant=${st.ref ? 'secondary' : 'primary'}
                    size="sm"
                    data-aa="start-blank"
                    title=${TT('startBlankTip')}
                    @click=${() => {
                      this.#load(st.blank, true);
                    }}
                    >${TT('startBlank')}</noema-button
                  >
                  <noema-icon-button
                    icon="close"
                    data-aa="start-cancel"
                    label=${TT('close')}
                    @click=${() => {
                      this.#cancelStart();
                    }}
                  ></noema-icon-button>
                </span>
              </div>`
            : nothing
        }
        ${
          this.#filesOpen
            ? html`<div class="aa-files">
                <ul class="aa-fl">
                  ${Object.entries(svc.files(d)).map(
                    ([name, text]) =>
                      html`<li>
                        <button
                          type="button"
                          class="aa-fbtn"
                          data-file=${name}
                          aria-label=${TT('exportFile', { file: name })}
                          @click=${() => {
                            this.#download(name.split('/').pop() ?? name, new Blob([text], { type: 'application/json' }));
                          }}
                        >
                          <noema-icon name="download"></noema-icon><code>${name}</code>
                        </button>
                      </li>`,
                  )}
                </ul>
              </div>`
            : nothing
        }
        <p class="aa-note" role="status" aria-live="polite">${this.#note}</p>
      </header>
      <div class="aa-main">
        <div class="aa-edit">
          ${this.#problems()}
          <div
            class="aa-tabs"
            role="tablist"
            aria-label=${TT('title')}
            @keydown=${(e: KeyboardEvent) => {
              this.#tabKey(e);
            }}
          >
            ${TABS.map(
              k =>
                html`<button
                  type="button"
                  role="tab"
                  id=${'aa-tab-' + k}
                  aria-controls=${'aa-panel-' + k}
                  aria-selected=${k === this.#tab ? 'true' : 'false'}
                  tabindex=${k === this.#tab ? '0' : '-1'}
                  class="aa-tab"
                  data-tab=${k}
                  @click=${() => {
                    this.showTab(k);
                  }}
                >
                  <span>${TT('tab.' + k)}</span>${count(k) ? html`<span class="aa-badge">${count(k)}</span>` : nothing}
                </button>`,
            )}
          </div>
          <section class="aa-panel" role="tabpanel" id="aa-panel-item" aria-labelledby="aa-tab-item" ?hidden=${this.#tab !== 'item'}>
            <noema-schema-form
              ${ref(this.#itemForm)}
              .form=${itemForm}
              .value=${d.item}
              .decorate=${this.#decorate}
              @noema-change=${(e: CustomEvent<SchemaFormChange>) => {
                this.#itemChanged(e.detail);
              }}
            ></noema-schema-form>
          </section>
          <section class="aa-panel" role="tabpanel" id="aa-panel-spec" aria-labelledby="aa-tab-spec" ?hidden=${this.#tab !== 'spec'}>
            ${this.#specFormEl(spec.id, spec.form, d)}
          </section>
          <section
            class="aa-panel"
            role="tabpanel"
            id="aa-panel-strings"
            aria-labelledby="aa-tab-strings"
            ?hidden=${this.#tab !== 'strings'}
          >
            ${this.#strings()}
          </section>
        </div>
        <aside class="aa-prev" aria-labelledby="aa-ph">
          <div class="aa-phead">
            <h2 class="aa-h2" id="aa-ph">${TT('preview')}</h2>
            <label class="aa-tl" for="aa-ploc">${TT('previewLang')}</label>
            <select
              class="sf-in aa-ploc"
              id="aa-ploc"
              data-aa="preview-locale"
              @change=${(e: Event) => {
                this.#prevLoc = (e.target as HTMLSelectElement).value;
                this.#lastGood = null;
                this.#schedulePreview(0);
              }}
            >
              ${Object.keys(d.strings).map(l => html`<option value=${l} .selected=${l === this.#prevLoc}>${l}</option>`)}
            </select>
          </div>
          <p class="aa-pnote" role="status">${this.#prevNote}</p>
          <div class=${'aa-pbox' + (this.#stale ? ' aa-stale' : '')} ${ref(this.#pbox)}></div>
        </aside>
      </div>
      ${dl('aa-keys', lists.keys)}${dl('aa-els', lists.els)}${dl('aa-series', lists.series)}${dl('aa-scenes', lists.scenes)}${dl('aa-sounds', lists.sounds)}${dl(
        'aa-ids',
        lists.ids,
      )}${dl('aa-parts', lists.parts)}
    </div>`;
  }
  /** the spec's form: a new element when the spec's schema changes (another engine) */
  #specId = '';
  #specFormEl(id: string, form: SchemaFormModel, d: AuthorDoc): TemplateResult {
    if (id !== this.#specId) {
      this.#specId = id;
      void this.updateComplete.then(() => {
        this.#runChecks();
      });
    }
    return html`<noema-schema-form
      ${ref(this.#specForm)}
      data-schema=${id}
      .form=${form}
      .value=${d.spec}
      .decorate=${this.#decorate}
      @noema-change=${(e: CustomEvent<SchemaFormChange>) => {
        this.#d().spec = e.detail.value as AuthorDoc['spec'];
        this.#changed(e.detail.structural);
      }}
    ></noema-schema-form>`;
  }
  #itemChanged(c: SchemaFormChange): void {
    const d = this.#d(),
      next = this.#svc().itemEdited(d.item, c.value as AuthorDoc['item']);
    d.item = next;
    if (next !== c.value) this.#itemForm.value?.set(next);
    this.#changed(c.structural);
  }
  #tabKey(e: KeyboardEvent): void {
    const i = TABS.indexOf(this.#tab);
    const n = moveIndex(e.key, i, TABS.length, { orientation: 'horizontal', dir: this.uiDir });
    if (n === null || n === i) return;
    e.preventDefault();
    const k = TABS[n] ?? 'spec';
    this.showTab(k);
    void this.updateComplete.then(() => {
      this.querySelector<HTMLElement>(`#aa-tab-${k}`)?.focus();
    });
  }
  #problems(): TemplateResult {
    const P = this.#probs,
      TT = (k: string, v?: Readonly<Record<string, string | number>>): string => this.#TT(k, v);
    if (!P.length) return html`<div class="aa-probs" aria-live="polite"><p class="aa-ok">${ico('ok')}${TT('problemsNone')}</p></div>`;
    return html`<div class="aa-probs" aria-live="polite">
      <details class="aa-pd">
        <summary>${ico('warn')}${TT('problems', { n: P.length })}</summary>
        <ul class="aa-pl">
          ${P.slice(0, 50).map(
            p =>
              html`<li>
                <span class="aa-pt">${TT('tab.' + p.tab)}</span> <span>${p.msg}</span>
                <noema-button
                  size="sm"
                  variant="quiet"
                  @click=${() => {
                    this.#goTo(p);
                  }}
                  >${TT('goTo')}</noema-button
                >
              </li>`,
          )}
        </ul>
      </details>
    </div>`;
  }
  #strings(): TemplateResult {
    const svc = this.#svc(),
      d = this.#d(),
      TT = (k: string, v?: Readonly<Record<string, string | number>>): string => this.#TT(k, v);
    const used = svc.usedKeys(d.spec),
      all = [...used],
      locs = Object.keys(d.strings);
    for (const l of locs) for (const k of Object.keys(d.strings[l] ?? {})) if (!all.includes(k)) all.push(k);
    const bad = new Set(this.#probs.filter(p => p.tab === 'strings' && p.key).map(p => p.key));
    return html`<p class="sf-help">${TT('stringsIntro')}</p>
      <div class="aa-st">
        ${all.map(k => {
          const isUsed = used.includes(k);
          return html`<div class=${'aa-strow' + (isUsed ? '' : ' aa-unused') + (bad.has(k) ? ' aa-bad' : '')} data-key=${k}>
            <div class="aa-stk">
              <code>${k}</code>
              ${
                isUsed
                  ? nothing
                  : html`<span class="aa-tag">${TT('unused')}</span>
                      <noema-icon-button
                        icon="close"
                        label=${TT('removeKey', { key: k })}
                        @click=${() => {
                          this.#removeKey(k);
                        }}
                      ></noema-icon-button>`
              }
            </div>
            <div class="aa-kt">${this.#keyTexts(k, 'st')}</div>
          </div>`;
        })}
      </div>
      <div class="aa-addloc">
        <div class="aa-locs">
          ${locs.map(
            l =>
              html`<span class="aa-chip"
                >${l}${
                  locs.length > 1
                    ? html`<noema-icon-button
                        icon="close"
                        label=${TT('removeLocale', { loc: l })}
                        @click=${() => {
                          this.#removeLocale(l);
                        }}
                      ></noema-icon-button>`
                    : nothing
                }</span
              >`,
          )}
        </div>
        <label class="aa-tl" for="aa-newloc">${TT('localeCode')}</label>
        <div class="aa-row">
          <input
            type="text"
            class="sf-in aa-locin"
            id="aa-newloc"
            placeholder="fr"
            autocomplete="off"
            spellcheck="false"
            data-aa="new-locale"
            @keydown=${(e: KeyboardEvent) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                this.#addLocale(e.target as HTMLInputElement);
              }
            }}
          />
          <noema-button
            size="sm"
            icon="plus"
            data-aa="add-locale"
            @click=${() => {
              const i = this.querySelector<HTMLInputElement>('#aa-newloc');
              if (i) this.#addLocale(i);
            }}
            >${TT('addLocale')}</noema-button
          >
        </div>
        ${this.#localeErr ? html`<p class="sf-err" role="alert">${TT('localeBad')}</p>` : nothing}
      </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'noema-author': NoemaAuthor;
  }
}
