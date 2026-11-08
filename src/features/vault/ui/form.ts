/**
 * 🗄️ The form of a file's place and contents (docs/VAULT.md §3): the upload (many files at once) and the edit share it.
 * Where and when are optional (they differ from place to place); the type, the fields (1–12 of the shared graph) and the
 * languages are not. A name already in the vault written another way (case, accents, spaces) snaps to that one, so the
 * folders stay one per place. The fields: searched in any language (also with a typo, or by initials), suggested from
 * the title and the course and from what others chose for files like it, or proposed (usable at once; Claude places it).
 */
import { html, nothing, type TemplateResult } from 'lit';
import type { VaultFile, VaultFileMeta } from '../../../ports/vault.ts';
import { CommunityElement, type ScreenBase } from '../../community/ui/screen.ts';
import { fold } from '../../search/domain/fold.ts';
import { fieldsOf, KINDS, listOf, snapName, valuesOf } from '../domain/index.ts';
import { STUDY_LANGS, type VaultUi } from './model.ts';

export interface VaultScreenDeps extends ScreenBase {
  readonly ui: VaultUi;
}

/** What the form starts from: a file being edited, or nothing (an upload). */
export type FormInit = Partial<VaultFile> & { readonly show_name?: boolean };

const TEXT_KEYS = ['university', 'department', 'course', 'professor'] as const;
type TextKey = (typeof TEXT_KEYS)[number];

export class NoemaVaultForm extends CommunityElement<VaultScreenDeps> {
  static override properties = { ...CommunityElement.properties, init: { attribute: false } };
  declare init: FormInit;
  /** the words the fields are suggested from besides the course (the titles of the files) */
  text: () => string = () => this.init.title ?? '';

  #chosen: string[] = [];
  #fromOthers: string[] = [];
  #langs: string[] = [];
  #q = '';
  #asked = '';
  #help = false;
  #proposed = false;
  #yearHint = false;
  #qt: ReturnType<typeof setTimeout> | undefined;
  #ct: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    super();
    this.init = {};
  }
  get #ui(): VaultUi {
    return this.deps.ui;
  }
  #T(k: string, p?: Record<string, string | number>): string {
    return this.#ui.T(k, p);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.#chosen = [...fieldsOf(this.init as VaultFile)];
    const ui = this.i18n.locale().slice(0, 2);
    this.#langs = this.init.language ? listOf(this.init.language) : [STUDY_LANGS.includes(ui) ? ui : 'en'];
    this.suggest();
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearTimeout(this.#qt);
    clearTimeout(this.#ct);
  }

  #input(k: string): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null {
    return this.querySelector(`[data-k="${k}"]`);
  }
  #val(k: string): string {
    return this.#input(k)?.value.trim() ?? '';
  }
  #checked(k: string): boolean {
    const i = this.#input(k);
    return i instanceof HTMLInputElement && i.checked;
  }

  /** the fields others chose for files with a similar title or course (the server counts; no names) */
  suggest(): void {
    this.requestUpdate();
    const title = this.text(),
      course = this.isConnected && this.hasUpdated ? this.#val('course') : (this.init.course ?? '');
    const k = title + '|' + course;
    if (k === this.#asked || (!title && !course)) return;
    this.#asked = k;
    void this.#ui.d.vault.suggest(title, course || null).then(r => {
      if (r.ok) {
        this.#fromOthers = r.value;
        this.requestUpdate();
      }
    });
  }

  /** what the form holds → the file's meta, or what is still needed */
  read(): { readonly error: string } | { readonly meta: VaultFileMeta } {
    const T = (k: string, p?: Record<string, string | number>): string => this.#T(k, p);
    const miss: string[] = [];
    if (!this.#val('kind')) miss.push('f.type');
    if (!this.#chosen.length) miss.push('f.fields');
    const short = (['university', 'department', 'course'] as const).filter(k => this.#val(k).length === 1); // a name, if given, has 2 letters at least
    if (short.length) return { error: T('tooShort', { what: short.map(k => T('f.' + k)).join(', ') }) };
    if (!this.#langs.length) miss.push('f.languages');
    if (miss.length) return { error: T('missing', { what: miss.map(k => T(k)).join(', ') }) };
    const text = (k: TextKey): string | null => this.#val(k) || null;
    return {
      meta: {
        title: this.init.title ?? '',
        university: text('university'),
        department: text('department'),
        course: text('course'),
        professor: text('professor'),
        year: Number(this.#val('year')) || null,
        semester: Number(this.#val('semester')) || null,
        kind: this.#val('kind'),
        fields: [...this.#chosen],
        language: this.#langs.join(','),
        has_exercises: this.#checked('has_exercises'),
        has_solutions: this.#checked('has_solutions'),
        handwritten: this.#checked('handwritten'),
        show_name: this.#checked('show_name'),
        description: this.#val('description') || null,
      },
    };
  }

  /* ---------- the fields ---------- */
  #add(id: string): void {
    if (!this.#chosen.includes(id) && this.#chosen.length < 12) this.#chosen = [...this.#chosen, id];
    this.#q = '';
    const q = this.#input('fieldq');
    if (q) q.value = '';
    this.requestUpdate();
  }
  async #propose(b: EventTarget | null, w: string): Promise<void> {
    const g = this.#ui.graph;
    const parents = this.#chosen.filter(id => g.get(id)?.status === 'accepted'); // under the fields chosen already; Claude places it for good
    await this.busy(b, async () => {
      const id = this.need(await this.#ui.d.vault.propose(w, this.i18n.locale(), parents));
      this.#proposed = true;
      this.#add(id);
    });
  }
  #picker(): TemplateResult {
    const ui = this.#ui,
      g = ui.graph,
      loc = this.i18n.locale(),
      T = (k: string, p?: Record<string, string | number>): string => this.#T(k, p);
    const under = (id: string): string => (g.get(id)?.parents ?? []).map(x => ui.fieldName(x)).join(', ');
    // one list: what the typed letters find, then what the title, the course and others' files suggest
    const w = this.#q.trim().replace(/\s+/g, ' ');
    const typed = w.length >= 2 ? g.find(w, loc) : [];
    const course = this.hasUpdated ? this.#val('course') : (this.init.course ?? '');
    const ideas = [...new Set([...this.#fromOthers, ...g.fromText([this.text(), course].join(' · '), loc)])].filter(id => g.get(id));
    const list = [...new Set([...typed, ...ideas])].filter(id => !this.#chosen.includes(id)).slice(0, w.length >= 2 ? 14 : 8);
    const known = w.length >= 2 && g.find(w, loc, 1).some(id => g.allNames(id).some(x => fold(x) === fold(w)));
    return html`<div class="vt-fpick">
      <div class="vt-fchips">
        ${this.#chosen.map(
          id =>
            html`<button
              type="button"
              class="ns-srchip on vt-fchip"
              data-id=${id}
              title=${T('removeField', { name: ui.fieldName(id) })}
              aria-label=${T('removeField', { name: ui.fieldName(id) })}
              @click=${() => {
                this.#chosen = this.#chosen.filter(x => x !== id);
                this.requestUpdate();
              }}
            >
              ${ui.fieldName(id)}${g.get(id)?.status === 'proposed' ? ' · ' + T('proposedPill') : ''}<span
                class="vt-chipx"
                aria-hidden="true"
                >×</span
              >
            </button>`, // i18n-ignore (×)
        )}
      </div>
      <input
        class="nc-input"
        type="search"
        data-k="fieldq"
        placeholder=${T('fieldSearchPh')}
        aria-label=${T('f.fields')}
        autocomplete="off"
        @input=${(e: Event) => {
          const v = (e.target as HTMLInputElement).value;
          clearTimeout(this.#qt);
          this.#qt = setTimeout(() => {
            this.#q = v;
            this.requestUpdate();
          }, 120);
        }}
        @keydown=${(e: KeyboardEvent) => {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          clearTimeout(this.#qt);
          this.#q = (e.target as HTMLInputElement).value;
          // the first match of what is typed now (the list may not be drawn yet)
          const v = this.#q.trim();
          const first = v.length >= 2 ? g.find(v, loc).find(id => !this.#chosen.includes(id)) : undefined;
          if (first) this.#add(first);
          else this.requestUpdate();
        }}
      />
      <div class="vt-fres">
        ${w.length >= 2 && !typed.length ? html`<p class="nc-tiny nc-muted">${T('noFieldMatch')}</p>` : nothing}
        ${list.map(id => {
          const sg = !typed.includes(id),
            pa = under(id) ? T('fieldIn', { parents: under(id) }) : '';
          const sub = [sg ? T('suggested') : '', pa].filter(Boolean).join(' · ');
          return html`<button
            type="button"
            class="nc-item vt-fopt ${sg ? 'vt-fsugopt' : ''}"
            data-id=${id}
            @click=${() => {
              this.#add(id);
            }}
          >
            <span class="t"><b>${ui.fieldName(id)}</b>${sub ? html`<small>${sub}</small>` : nothing}</span>
          </button>`;
        })}
        ${
          w.length < 2 || known || w.length > 80
            ? nothing
            : html`<noema-button
                class="vt-propose"
                variant="quiet"
                size="sm"
                title=${T('proposeHint')}
                @click=${(e: Event) => void this.#propose(e.currentTarget, w)}
                >${T('proposeField', { name: w })}</noema-button
              >`
        }
      </div>
      <small class="nc-tiny nc-muted vt-fnote" ?hidden=${!this.#proposed}>${T('proposed')}</small>
    </div>`;
  }

  /* ---------- the form ---------- */
  override render(): TemplateResult {
    const ui = this.#ui,
      init = this.init,
      all = ui.cached(),
      T = (k: string, p?: Record<string, string | number>): string => this.#T(k, p);
    const year = new Date().getFullYear();
    const lb = (label: string, req: boolean): TemplateResult => html`<span class="vt-lb">${label + (req ? ' *' : '')}</span>`;
    const txt = (k: TextKey, extra: { max?: number; ph?: string } = {}): TemplateResult =>
      html`<label class="vt-fld"
        >${lb(T('f.' + k), false)}<input
          class="nc-input"
          data-k=${k}
          maxlength=${extra.max ?? 120}
          list="vt-dl-${k}"
          value=${typeof init[k] === 'string' ? init[k] : ''}
          placeholder=${extra.ph ?? nothing}
          title=${extra.ph ?? nothing}
          @change=${(e: Event) => {
            const i = e.target as HTMLInputElement,
              m = snapName(all, k, i.value);
            if (m != null) i.value = m;
          }}
          @input=${
            k === 'course'
              ? () => {
                  clearTimeout(this.#ct);
                  this.#ct = setTimeout(() => {
                    this.suggest();
                  }, 400);
                }
              : nothing
          }
      /></label>`;
    const pick = (
      k: string,
      label: string,
      opts: readonly (readonly [string, string])[],
      val: string,
      req: boolean,
      none: string,
    ): TemplateResult =>
      html`<select
        class="nc-input"
        data-k=${k}
        ?required=${req}
        aria-label=${label}
        @change=${() => {
          const kind = this.#val('kind'),
            y = this.#val('year');
          this.#yearHint = /^exam/.test(kind) && !y; // a past exam without its year is of little use: say so (still not required)
          this.requestUpdate();
        }}
      >
        <option value="" ?selected=${!val}>${none}</option>
        ${opts.map(([v, l]) => html`<option value=${v} ?selected=${v === val}>${l}</option>`)}
      </select>`;
    const box = (k: string, label: string, on: boolean): TemplateResult =>
      html`<label class="nc-check vt-check"><input type="checkbox" data-k=${k} ?checked=${on} /> ${label}</label>`;
    const others = STUDY_LANGS.filter(x => !this.#langs.includes(x));
    return html`<div class="vt-form">
      ${TEXT_KEYS.map(
        k =>
          html`<datalist id="vt-dl-${k}">
            ${valuesOf(all, k)
              .slice(0, 200)
              .map(x => html`<option value=${String(x.v)}></option>`)}
          </datalist>`,
      )}
      <fieldset class="vt-fs">
        <legend>${T('g.where')}</legend>
        ${txt('university')} ${txt('department')} ${txt('course', { max: 160, ph: T('courseHint') })} ${txt('professor')}
      </fieldset>
      <fieldset class="vt-fs">
        <legend>${T('g.whatWhen')}</legend>
        <label class="vt-fld"
          >${lb(T('f.year'), false)}${pick(
            'year',
            T('f.year'),
            Array.from({ length: year - 1979 }, (_, i) => [String(year - i), String(year - i)] as const),
            init.year ? String(init.year) : '',
            false,
            T('unspecified'),
          )}<small class="nc-tiny nc-muted vt-yhint" ?hidden=${!this.#yearHint}>${T('yearForExams')}</small></label
        >
        <label class="vt-fld"
          >${lb(T('f.semester'), false)}${pick(
            'semester',
            T('f.semester'),
            Array.from({ length: 12 }, (_, i) => [String(i + 1), ui.semName(i + 1)] as const),
            init.semester ? String(init.semester) : '',
            false,
            T('semAny'),
          )}</label
        >
        <label class="vt-fld"
          >${lb(T('f.type'), true)}${pick(
            'kind',
            T('f.type'),
            KINDS.map(x => [x, T('kind.' + x)] as const),
            init.kind ?? '',
            true,
            T('choose'),
          )}</label
        >
        <div class="vt-fld vt-fieldsfld">
          <span class="vt-lb"
            >${T('f.fields') + ' *'}<button
              type="button"
              class="vt-info"
              title=${T('fieldHelp')}
              aria-label=${T('fieldHelp')}
              aria-expanded=${String(this.#help)}
              @click=${() => {
                this.#help = !this.#help;
                this.requestUpdate();
              }}
            >
              ⓘ
            </button></span
          ><small class="nc-tiny nc-muted vt-help" ?hidden=${!this.#help}>${T('fieldHelp')}</small>${this.#picker()}
        </div>
        <div class="vt-fld vt-langsfld">
          ${lb(T('f.languages'), true)}
          <div class="vt-langs">
            ${this.#langs.map(
              x =>
                html`<button
                  type="button"
                  class="ns-srchip on chip vt-langchip"
                  title=${T('removeLanguage')}
                  aria-label=${T('removeLanguage') + ': ' + ui.langName(x)}
                  @click=${() => {
                    this.#langs = this.#langs.filter(y => y !== x);
                    this.requestUpdate();
                  }}
                >
                  ${ui.langName(x)}<span class="vt-chipx" aria-hidden="true">×</span>
                </button>`, // i18n-ignore (×)
            )}
          </div>
          <select
            class="nc-input"
            data-k="language"
            aria-label=${T('addLanguage')}
            @change=${(e: Event) => {
              const s = e.target as HTMLSelectElement;
              if (s.value && this.#langs.length < 8) this.#langs = [...this.#langs, s.value];
              s.value = '';
              this.requestUpdate();
            }}
          >
            <option value="" selected>${this.#langs.length ? T('addLanguage') : T('choose')}</option>
            ${others.map(x => html`<option value=${x}>${ui.langName(x)}</option>`)}
          </select>
        </div>
      </fieldset>
      <fieldset class="vt-fs">
        <legend>${T('g.contents')}</legend>
        <div class="nc-row">
          ${box('has_exercises', T('c.exercises'), !!init.has_exercises)} ${box('has_solutions', T('c.solutions'), !!init.has_solutions)}
          ${box('handwritten', T('c.handwritten'), !!init.handwritten)}
        </div>
        <textarea
          class="nc-input"
          data-k="description"
          rows="2"
          maxlength="1000"
          placeholder=${T('descPh')}
          aria-label=${T('descPh')}
          .value=${init.description ?? ''}
        ></textarea>
      </fieldset>
      <div class="vt-anon">${box('show_name', T('showName'), !!init.show_name)}<small class="nc-tiny nc-muted">${T('anonTip')}</small></div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'noema-vault-form': NoemaVaultForm;
  }
}
