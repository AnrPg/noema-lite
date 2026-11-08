/**
 * The Languages tab (#/lang, docs/LANGUAGES.md §8; docs/LANGUAGE_RULES.md D21, D25, D29): before the learner answers,
 * "Which languages do you want to study?" leads and the courses stay listed below; once answered, the learner's
 * languages under their own names, each opening its own home (#/lang/<code>), "Change the languages", the courses that
 * teach them (one row each: flags, title, words met, what is due today, the next lesson, a bar of the words met, ⋮ with
 * Continue · Course settings · Through Claude) and, folded, the other courses. No course yet: + New language course.
 *
 *   <noema-languages-page .port=${languagesPort}></noema-languages-page>
 *   <noema-lang-courses .port=${languagesPort} .rows=${rows}></noema-lang-courses>   (the list alone: Choose another course)
 */
import { html, nothing, type TemplateResult } from 'lit';
import { styleMap } from 'lit/directives/style-map.js';
import { NoemaDialog } from '../../kit/dialog.ts';
import { icon } from '../../kit/icons.ts';
import type { MenuSelectDetail } from '../../kit/menu.ts';
import { NoemaScreen } from '../screen.ts';
import type { CourseRow, LanguagesPort } from './languages-port.ts';
import { flag, langNames, NoemaStudyChooser } from './study-chooser.ts';

const tone = (n: number): Readonly<Record<string, string>> => ({ '--bgc': `var(--t${n})`, '--fgc': `var(--t${n}i)` });

/** The courses as rows (flags, title, words met, due today, the next lesson, a bar), with ⋮ when `menus` is on. */
export class NoemaLangCourses extends NoemaScreen {
  static override properties = {
    port: { attribute: false },
    rows: { attribute: false },
    menus: { type: Boolean },
  };
  declare port: LanguagesPort | null;
  declare rows: readonly CourseRow[];
  declare menus: boolean;
  /** what a tap on a row does (default: open the course) */
  onPick: ((courseId: string) => void) | null = null;

  constructor() {
    super();
    this.port = null;
    this.rows = [];
    this.menus = false;
  }

  #pick(id: string): void {
    if (this.onPick) this.onPick(id);
    else this.port?.openCourse(id);
  }

  #row(m: CourseRow, i: number): TemplateResult {
    const P = this.port;
    if (!P) return html``;
    const loc = P.locale();
    const names = (m.studied.length ? m.studied : m.languages).map(c => langNames(c, loc).ui).join(' · ');
    const named = m.studied.length === m.languages.length && m.languages.every(c => m.title.includes(langNames(c, 'en').ui));
    const sub = [named ? null : names, m.started ? this.t('sh.langWords', { n: m.words }) : null, m.account ? this.t('sh.langOwn') : null]
      .filter(Boolean)
      .join(' · ');
    const next = m.next ? `${m.next.step ? m.next.step + ' ' : ''}${m.next.title}` : null;
    const line2 = m.due
      ? this.t('sh.langDue', { n: m.due })
      : next
        ? this.t('sh.langNext', { lesson: next })
        : m.started
          ? this.t('sh.langNothingDue')
          : null;
    const flags = m.studied.map(flag).join(' ');
    const row = html`<button
      class="ns-item ns-langitem"
      data-course=${m.courseId}
      style=${styleMap({ animationDelay: `${i * 30}ms` })}
      @click=${() => {
        this.#pick(m.courseId);
      }}
    >
      <span class="ns-ico emo" style=${styleMap(tone((i % 4) + 1))}
        ><span class="ns-langflags" style=${styleMap({ fontSize: m.studied.length > 2 ? '.8rem' : '1.1rem' })}>${flags}</span></span
      >
      <span class="t"
        ><b
          >${m.title}${
            m.last ? html`<span class="ns-muted ns-langlast"> · ${this.t('sh.langContinue').toLocaleLowerCase(loc)}</span>` : nothing
          }</b
        ><small>${sub}</small>${line2 ? html`<small class="ns-langdue">${line2}</small>` : nothing}${
          m.total
            ? html`<div class="ns-bar"><i style=${styleMap({ width: `${Math.round(Math.max(0, Math.min(1, m.pct)) * 100)}%` })}></i></div>`
            : nothing
        }</span
      >
      ${
        m.due
          ? html`<span class="ns-pill" style=${styleMap(tone(4))}>${this.i18n.format.number(m.due)}</span>`
          : html`<span class="ns-chev" aria-hidden="true">›</span>`
      }
    </button>`;
    if (!this.menus) return row;
    const onSelect = (e: CustomEvent<MenuSelectDetail>): void => {
      if (e.detail.value === 'open') this.#pick(m.courseId);
    };
    return html`<div class="ns-itemwrap noema-chipwrap">
      ${row}
      <noema-menu label=${this.t('sh.moreFor', { title: m.title })} @noema-select=${onSelect}>
        <noema-menu-item value="open" icon="forward">${m.last ? this.t('sh.langContinue') : this.t('sh.langStart')}</noema-menu-item>
        <noema-menu-item value="settings" icon="settings" sub=${this.t('sh.langSettingsSub')} href=${P.courseHref(m.courseId, 'settings')}
          >${this.t('sh.langSettings')}</noema-menu-item
        >
        <noema-menu-item value="claude" icon="star" sub=${this.t('sh.langClaudeSub')} href=${P.courseHref(m.courseId, 'claude')}
          >${this.t('sh.langClaude')}</noema-menu-item
        >
      </noema-menu>
    </div>`;
  }

  override render(): TemplateResult {
    return html`<div class="ns-list ns-langlist">${this.rows.map((m, i) => this.#row(m, i))}</div>`;
  }
}

export class NoemaLanguagesPage extends NoemaScreen {
  static override properties = { port: { attribute: false } };
  declare port: LanguagesPort | null;

  constructor() {
    super();
    this.port = null;
  }

  #list(rows: readonly CourseRow[]): TemplateResult {
    return html`<noema-lang-courses .port=${this.port} .rows=${rows} menus></noema-lang-courses>`;
  }

  /** Change the languages: the chooser in a dialog */
  change(): void {
    const P = this.port;
    if (!P) return;
    const doc = this.ownerDocument;
    const dlg = doc.createElement('noema-dialog'),
      ch = doc.createElement('noema-study-chooser');
    if (!(dlg instanceof NoemaDialog) || !(ch instanceof NoemaStudyChooser)) return;
    dlg.heading = this.t('loader.study.change');
    dlg.placement = 'sheet';
    dlg.classList.add('ns-studysheet');
    ch.port = P;
    ch.onDone = () => {
      dlg.close('ok');
      this.requestUpdate();
    };
    dlg.append(ch);
    this.openDialog(dlg);
  }

  override render(): TemplateResult {
    const P = this.port;
    if (!P) return html``;
    const all = P.courses();
    if (!all.length)
      return html`<div class="ns-panel ns-empty">
        <p>${this.t('sh.noLanguages')}</p>
        <button
          class="btn primary"
          @click=${() => {
            P.createCourse();
          }}
        >
          + ${this.t('sh.newLanguage')}
        </button>
      </div>`;
    const study = P.study(),
      offered = P.offered(),
      loc = P.locale();
    const redraw = (): void => {
      this.requestUpdate();
    };
    if (!study && offered.length > 1)
      return html`<div class="ns-panel ns-studyask">
          <noema-study-chooser .port=${P} .onDone=${redraw}></noema-study-chooser>
        </div>
        <span class="ns-label">${this.t('loader.study.courses')}</span>${this.#list(all)}`;
    if (!study) return this.#list(all);
    const chosen = offered.filter(o => study.includes(o.code)),
      mine = all.filter(m => m.studies),
      rest = all.filter(m => !m.studies);
    return html`<div class="ns-list ns-studylist" aria-label=${this.t('loader.study.yours')}>
        ${chosen.map((o, i) => {
          const n = langNames(o.code, loc),
            titles = all.length < 2 ? [] : all.filter(m => o.courses.includes(m.courseId) && m.studied.includes(o.code)).map(m => m.title);
          return html`<button
            class="ns-item ns-studylang"
            data-lang=${o.code}
            @click=${() => {
              P.openLanguage(o.code);
            }}
          >
            <span class="ns-ico emo" style=${styleMap(tone((i % 4) + 1))}><span style="font-size:1.1rem">${flag(o.code)}</span></span>
            <span class="t"
              ><b lang=${o.code} dir="auto">${n.own}</b
              ><small>${[n.ui.toLowerCase() !== n.own.toLowerCase() ? n.ui : null, ...titles].filter(Boolean).join(' · ')}</small></span
            >
            <span class="ns-chev" aria-hidden="true">›</span>
          </button>`;
        })}
        <button
          class="ns-item ns-studychange"
          @click=${() => {
            this.change();
          }}
        >
          <span class="ns-ico" style=${styleMap(tone(2))}>${icon('edit')}</span>
          <span class="t"><b>${this.t('loader.study.change')}</b><small>${this.t('loader.study.changeSub')}</small></span>
          <span class="ns-chev" aria-hidden="true">›</span>
        </button>
      </div>
      ${mine.length ? html`<span class="ns-label">${this.t('loader.study.courses')}</span>${this.#list(mine)}` : nothing}
      ${
        rest.length
          ? html`<details class="ns-studyrest">
              <summary class="ns-label">${this.t('loader.study.otherCourses', { n: rest.length })}</summary>
              <p class="ns-muted">${this.t('loader.study.otherCoursesSub')}</p>
              ${this.#list(rest)}
            </details>`
          : nothing
      }`;
  }
}
