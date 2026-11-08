/**
 * "Which languages do you want to study?" (docs/LANGUAGE_RULES.md D21): every language the app offers — its own name
 * (an endonym: Ελληνικά, Deutsch, العربية), its name in the interface language, its flag — one, several or all; the
 * answer is stored for the whole app. With a course, that course's languages come first and are marked; `none` says the
 * course has none of the chosen languages.
 *
 *   <noema-study-chooser .port=${languagesPort} course="polyglot-…" @noema-study=${e => e.detail.codes}></noema-study-chooser>
 */
import { html, nothing, type TemplateResult } from 'lit';
import { NoemaScreen } from '../screen.ts';
import type { LanguagesPort, OfferedLanguage } from './languages-port.ts';

/** A language's own name and its name in the interface language (Intl; the code when the browser cannot name it). */
export function langNames(code: string, locale: string): { readonly own: string; readonly ui: string } {
  const cap = (s: string, loc: string): string => {
    const a = Array.from(s);
    return a.length ? (a[0] ?? '').toLocaleUpperCase(loc) + a.slice(1).join('') : '';
  };
  const name = (locales: string[]): string => {
    try {
      return new Intl.DisplayNames(locales, { type: 'language' }).of(code) ?? '';
    } catch {
      return ''; // a language this browser cannot name: the code is shown instead
    }
  };
  let own = name([code]);
  const ui = name([locale, 'en']);
  if (!own || own.toLowerCase() === code.toLowerCase()) own = ui || code;
  return { own: cap(own, code), ui: cap(ui || code, locale) };
}

/** a language's flag (a code when it has none) */
const FLAGS: Readonly<Record<string, string>> = {
  ar: '🇸🇦',
  he: '🇮🇱',
  zh: '🇨🇳',
  de: '🇩🇪',
  el: '🇬🇷',
  en: '🇬🇧',
  ru: '🇷🇺',
  tr: '🇹🇷',
  hi: '🇮🇳',
  fr: '🇫🇷',
  es: '🇪🇸',
  it: '🇮🇹',
  ja: '🇯🇵',
};
export const flag = (code: string): string => FLAGS[code] ?? code.toUpperCase();

export class NoemaStudyChooser extends NoemaScreen {
  static override properties = {
    port: { attribute: false },
    course: { type: String },
    none: { type: Boolean },
    picked: { state: true },
  };
  declare port: LanguagesPort | null;
  declare course: string;
  declare none: boolean;
  declare picked: ReadonlySet<string>;
  /** called with the codes once the learner answers (after the event) */
  onDone: (codes: readonly string[]) => void = () => undefined;
  #seeded = false;

  constructor() {
    super();
    this.port = null;
    this.course = '';
    this.none = false;
    this.picked = new Set();
  }

  #list(): readonly OfferedLanguage[] {
    const P = this.port;
    if (!P) return [];
    const offered = P.offered(),
      mine = this.course ? P.courseLanguages(this.course) : [];
    return [...offered.filter(o => mine.includes(o.code)), ...offered.filter(o => !mine.includes(o.code))];
  }

  #toggle(code: string): void {
    const s = new Set(this.picked);
    if (s.has(code)) s.delete(code);
    else s.add(code);
    this.picked = s;
  }

  override render(): TemplateResult {
    const P = this.port;
    if (!P) return html``;
    const list = this.#list(),
      loc = P.locale();
    if (!this.#seeded) {
      this.#seeded = true;
      this.picked = new Set((P.study() ?? []).filter(c => list.some(o => o.code === c)));
    }
    const mine = this.course ? P.courseLanguages(this.course) : [];
    const others = list.some(o => !mine.includes(o.code));
    const n = this.picked.size,
      allOn = n === list.length;
    const ask = this.t('loader.study.ask');
    return html`<div class="noema-study" data-ask="study" role="group" aria-label=${ask}>
      <b class="noema-study-q">${ask}</b>
      <p class="noema-study-why">
        ${
          this.none
            ? this.t('loader.study.noneHere', { langs: mine.map(c => langNames(c, loc).ui).join(' · ') })
            : this.t('loader.study.why')
        }
      </p>
      <div class="noema-study-langs">
        ${list.map(o => {
          const nm = langNames(o.code, loc),
            on = this.picked.has(o.code);
          return html`<button
            class=${'noema-study-lang' + (on ? ' on' : '')}
            type="button"
            data-lang=${o.code}
            aria-pressed=${on ? 'true' : 'false'}
            title=${o.titles.join(' · ')}
            @click=${() => {
              this.#toggle(o.code);
            }}
          >
            <span class="f" aria-hidden="true">${flag(o.code)}</span
            ><span class="t"
              ><b lang=${o.code} dir="auto">${nm.own}</b
              >${nm.ui.toLowerCase() !== nm.own.toLowerCase() ? html`<small>${nm.ui}</small>` : nothing}${
                this.course && mine.includes(o.code) && others
                  ? html`<small class="here">${this.t('loader.study.inCourse')}</small>`
                  : nothing
              }</span
            >
          </button>`;
        })}
      </div>
      <div class="row noema-study-foot">
        <button
          class="btn small noema-study-all"
          type="button"
          @click=${() => {
            this.picked = allOn ? new Set() : new Set(list.map(o => o.code));
          }}
        >
          ${this.t(allOn ? 'loader.study.none' : 'loader.study.all')}
        </button>
        <button
          class="btn primary noema-study-ok"
          type="button"
          ?disabled=${!n}
          @click=${() => {
            this.#done(list.map(o => o.code).filter(c => this.picked.has(c)));
          }}
        >
          ${this.t('loader.study.ok', { n })}
        </button>
      </div>
    </div>`;
  }

  #done(codes: readonly string[]): void {
    if (!codes.length || !this.port) return;
    this.port.setStudy(codes);
    this.emit('noema-study', { codes });
    this.onDone(codes);
  }
}
