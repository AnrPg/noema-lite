/**
 * The kit's demo page, `#/ui-kit` (development only: src/composition/ui.ts; tests/ui_kit.js and tests/a11y.js audit it):
 * every component in its states, inside the real frame, in four sections — #/ui-kit/basics · overlays · forms · look.
 * Every word comes from the catalogs (i18n/ui), so the page also shows the kit in each interface language and right to
 * left. The root hands it what it may change: the Notifier (toasts), the appearance and the interface language.
 */
import { css, html, type TemplateResult } from 'lit';
import type { Level } from '../../contracts/rules/levels.ts';
import type { Notifier } from '../../ports/notifier.ts';
import type { Appearance, Motion, Scheme } from '../core/appearance.ts';
import { NoemaElement } from '../core/element.ts';
import { base } from '../core/styles.ts';
import { CHARACTER_IDS, type CharacterId } from '../tokens/characters.ts';
import { confirmDialog, type NoemaLayer } from '../frame/layer.ts';
import type { NoemaDialog } from '../kit/dialog.ts';
import type { NoemaTextField } from '../kit/forms.ts';

export const KIT_SECTIONS = ['basics', 'overlays', 'forms', 'look'] as const;
export type KitSection = (typeof KIT_SECTIONS)[number];
export const isKitSection = (x: unknown): x is KitSection => typeof x === 'string' && (KIT_SECTIONS as readonly string[]).includes(x);

/** What the demo may change, given by the root. */
export interface KitHost {
  readonly notifier: Notifier;
  readonly layer: NoemaLayer;
  appearance(): Appearance;
  setAppearance(a: Appearance): void;
}

const LADDER: readonly Level[] = [
  {
    id: 'intro',
    kind: 'difficulty',
    order: 1,
    names: { en: 'Introductory', el: 'Εισαγωγικό', fr: 'Initiation', de: 'Einführung', ru: 'Начальный' },
  },
  {
    id: 'mid',
    kind: 'difficulty',
    order: 2,
    names: { en: 'Intermediate', el: 'Μεσαίο', fr: 'Intermédiaire', de: 'Mittelstufe', ru: 'Средний' },
  },
  {
    id: 'adv',
    kind: 'difficulty',
    order: 3,
    names: { en: 'Advanced', el: 'Προχωρημένο', fr: 'Avancé', de: 'Fortgeschritten', ru: 'Продвинутый' },
  },
];
const SEMESTER: Level = {
  id: 's3',
  kind: 'semester',
  order: 3,
  names: { en: 'Semester 3', el: 'Εξάμηνο 3', fr: 'Semestre 3', de: 'Semester 3' },
};

export class NoemaUiKit extends NoemaElement {
  static override properties = {
    section: { type: String, reflect: true },
    host: { attribute: false },
  };
  static override styles = [
    base,
    css`
      :host {
        display: block;
      }
      h1 {
        margin: 0 0 4px;
        font-family: var(--u-display);
        font-weight: var(--dw, 700);
        font-style: var(--dsty, normal);
        font-size: 1.6rem;
        line-height: 1.25;
      }
      .lead {
        margin: 0 0 24px;
        color: var(--u-ink2);
        line-height: 1.5;
      }
      section {
        margin: 0 0 32px;
      }
      h2 {
        margin: 0 0 12px;
        font-family: var(--u-display);
        font-weight: var(--dw, 700);
        font-style: var(--dsty, normal);
        font-size: 1.15rem;
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
      }
      .stack {
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
        gap: 14px;
      }
      .note {
        margin: 0;
        color: var(--u-ink2);
        font-size: 0.9rem;
      }
      p {
        line-height: 1.5;
      }
      form {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
    `,
  ];
  declare section: KitSection;
  declare host: KitHost | null;
  #moved = 0;

  constructor() {
    super();
    this.section = 'basics';
    this.host = null;
  }

  /** the words of a section's tab and crumb */
  sectionName(s: KitSection): string {
    return this.t(`ui.kit.section.${s}`);
  }

  /** the notices that did not fit go to the bell; the demo counts them */
  watchOverflow(): () => void {
    const n = this.host?.notifier;
    if (!n) return () => undefined;
    return n.onOverflow(list => {
      this.#moved += list.length;
      this.requestUpdate();
    });
  }

  #dialog(id: string): NoemaDialog | null {
    return this.renderRoot.querySelector<NoemaDialog>(`#${id}`);
  }

  #basics(): TemplateResult {
    return html`<section aria-labelledby="h-buttons">
        <h2 id="h-buttons">${this.t('ui.kit.buttons')}</h2>
        <div class="row">
          <noema-button variant="primary" icon="forward">${this.t('ui.kit.continue')}</noema-button>
          <noema-button>${this.t('ui.kit.practise')}</noema-button>
          <noema-button variant="quiet">${this.t('ui.kit.later')}</noema-button>
          <noema-button variant="danger" icon="trash">${this.t('ui.kit.delete')}</noema-button>
          <noema-button disabled>${this.t('ui.kit.unavailable')}</noema-button>
          <noema-button busy>${this.t('ui.kit.saving')}</noema-button>
          <noema-button size="sm">${this.t('ui.kit.small')}</noema-button>
          <noema-button href="#/ui-kit/forms" icon="forward">${this.t('ui.kit.toForms')}</noema-button>
        </div>
        <div class="row" style="margin-top:12px">
          <noema-icon-button icon="search" label=${this.t('ui.kit.search')}></noema-icon-button>
          <noema-icon-button icon="bell" label=${this.t('ui.kit.notifications')} badge="3"></noema-icon-button>
          <noema-icon-button icon="star" toggle label=${this.t('ui.kit.favourite')}></noema-icon-button>
          <noema-icon-button icon="edit" size="sm" label=${this.t('ui.kit.edit')}></noema-icon-button>
        </div>
      </section>
      <section aria-labelledby="h-chips">
        <h2 id="h-chips">${this.t('ui.kit.chips')}</h2>
        <noema-chips label=${this.t('ui.kit.filters')}>
          <noema-chip toggle selected>${this.t('ui.kit.onlyDue')}</noema-chip>
          <noema-chip toggle>${this.t('ui.kit.mistakes')}</noema-chip>
          <noema-chip tone="ok" icon="done">${this.t('ui.kit.done')}</noema-chip>
          <noema-chip tone="warn">${this.t('ui.kit.dueToday')}</noema-chip>
          <noema-chip tone="bad">${this.t('ui.kit.wrong')}</noema-chip>
          <noema-chip tone="info">${this.t('ui.kit.new')}</noema-chip>
          <noema-chip
            removable
            @noema-remove=${(e: Event) => {
              (e.currentTarget as HTMLElement).remove();
            }}
            >${this.t('ui.kit.chapter', { n: 3 })}</noema-chip
          >
        </noema-chips>
      </section>
      <section aria-labelledby="h-cards">
        <h2 id="h-cards">${this.t('ui.kit.cards')}</h2>
        <div class="grid">
          <noema-card heading=${this.t('ui.kit.mechanics')} href="#/ui-kit/basics">
            <p style="margin:0 0 10px">${this.t('ui.kit.mechanicsText')}</p>
            <noema-progress label=${this.t('ui.kit.mastery')} value="0.4"></noema-progress>
          </noema-card>
          <noema-card heading=${this.t('ui.kit.today')} tone="soft">
            <p style="margin:0">${this.t('ui.kit.todayText', { n: 12 })}</p>
            <noema-button slot="actions" variant="primary">${this.t('ui.kit.review')}</noema-button>
            <noema-button slot="actions" variant="quiet">${this.t('ui.kit.later')}</noema-button>
          </noema-card>
        </div>
      </section>
      <section aria-labelledby="h-tips">
        <h2 id="h-tips">${this.t('ui.kit.tips')}</h2>
        <p class="row" style="margin:0">
          <span>${this.t('ui.kit.biteSize')}</span>
          <noema-tip topic=${this.t('ui.kit.biteSize')}>${this.t('ui.kit.biteSizeTip')}</noema-tip>
        </p>
      </section>
      <section aria-labelledby="h-levels">
        <h2 id="h-levels">${this.t('ui.kit.levels')}</h2>
        <div class="row">
          ${LADDER.map(
            (l, i) =>
              html`<noema-level-badge
                .level=${l}
                of=${LADDER.length}
                state=${i === 0 ? 'done' : i === 1 ? 'current' : 'ahead'}
              ></noema-level-badge>`,
          )}
          <noema-level-badge .level=${SEMESTER} state="current"></noema-level-badge>
        </div>
      </section>
      <section aria-labelledby="h-progress">
        <h2 id="h-progress">${this.t('ui.kit.progress')}</h2>
        <div class="stack">
          <noema-progress label=${this.t('ui.kit.chapter', { n: 2 })} value="0.4"></noema-progress>
          <noema-progress label=${this.t('ui.kit.sectionsRead')} value="3" max="10" show="count"></noema-progress>
          <noema-progress label=${this.t('ui.kit.preparing')}></noema-progress>
          <div class="row">
            <noema-progress kind="ring" label=${this.t('ui.kit.goal')} value="80" max="120" show="count" size="72"></noema-progress>
            <span class="note">${this.t('ui.kit.goalText')}</span>
          </div>
        </div>
      </section>`;
  }

  #overlays(): TemplateResult {
    const toast = (key: string): void => this.host?.notifier.toast(this.t(key));
    return html`<section aria-labelledby="h-menus">
        <h2 id="h-menus">${this.t('ui.kit.menus')}</h2>
        <div class="row">
          <noema-menu
            label=${this.t('ui.kit.more')}
            @noema-select=${(e: CustomEvent<{ value: string }>) => {
              this.host?.notifier.toast(this.t('ui.kit.chose', { item: this.t(`ui.kit.${e.detail.value}`) }));
            }}
          >
            <noema-menu-item value="edit" icon="edit" sub=${this.t('ui.kit.editSub')}>${this.t('ui.kit.edit')}</noema-menu-item>
            <noema-menu-item value="share" icon="share">${this.t('ui.kit.share')}</noema-menu-item>
            <noema-menu-item value="export" icon="download">${this.t('ui.kit.export')}</noema-menu-item>
            <noema-menu-item value="locked" icon="lock" disabled>${this.t('ui.kit.locked')}</noema-menu-item>
            <noema-menu-separator></noema-menu-separator>
            <noema-menu-item value="delete" icon="trash" danger>${this.t('ui.kit.delete')}</noema-menu-item>
          </noema-menu>
          <noema-menu
            kind="button"
            align="start"
            label=${this.t('ui.kit.practise')}
            @noema-select=${(e: CustomEvent<{ value: string }>) => {
              this.host?.notifier.toast(this.t('ui.kit.chose', { item: this.t(`ui.kit.${e.detail.value}`) }));
            }}
          >
            <noema-menu-item value="flashcards" icon="cards">${this.t('ui.kit.flashcards')}</noema-menu-item>
            <noema-menu-item value="mistakes" icon="list">${this.t('ui.kit.mistakes')}</noema-menu-item>
            <noema-menu-item value="lightning" icon="star">${this.t('ui.kit.lightning')}</noema-menu-item>
          </noema-menu>
        </div>
      </section>
      <section aria-labelledby="h-dialogs">
        <h2 id="h-dialogs">${this.t('ui.kit.dialogs')}</h2>
        <div class="row">
          <noema-button id="open-dialog" @click=${() => this.#dialog('dlg')?.show()}>${this.t('ui.kit.openDialog')}</noema-button>
          <noema-button id="open-sheet" @click=${() => this.#dialog('sheet')?.show()}>${this.t('ui.kit.openSheet')}</noema-button>
          <noema-button
            id="open-confirm"
            variant="danger"
            @click=${async () => {
              const layer = this.host?.layer;
              if (!layer) return;
              const yes = await confirmDialog(layer, {
                heading: this.t('ui.kit.resetQ'),
                text: this.t('ui.kit.resetText'),
                ok: this.t('ui.kit.reset'),
                cancel: this.t('ui.kit.keep'),
                danger: true,
              });
              toast(yes ? 'ui.kit.resetDone' : 'ui.kit.kept');
            }}
            >${this.t('ui.kit.reset')}</noema-button
          >
        </div>
        <noema-dialog id="dlg" heading=${this.t('ui.kit.renameTitle')}>
          <noema-text-field label=${this.t('ui.kit.name')} value=${this.t('ui.kit.mechanics')} autofocus></noema-text-field>
          <noema-button slot="actions" variant="quiet" @click=${() => this.#dialog('dlg')?.close('cancel')}
            >${this.t('ui.kit.cancel')}</noema-button
          >
          <noema-button
            slot="actions"
            variant="primary"
            @click=${() => {
              this.#dialog('dlg')?.close('ok');
              toast('ui.kit.saved');
            }}
            >${this.t('ui.kit.save')}</noema-button
          >
        </noema-dialog>
        <noema-dialog id="sheet" placement="sheet" heading=${this.t('ui.kit.stepTitle')}>
          <p style="margin-top:0">${this.t('ui.kit.stepText')}</p>
          <noema-level-badge .level=${LADDER[1] ?? null} of=${LADDER.length} state="current"></noema-level-badge>
          <noema-button slot="actions" variant="primary" @click=${() => this.#dialog('sheet')?.close('ok')}
            >${this.t('ui.kit.study')}</noema-button
          >
        </noema-dialog>
      </section>
      <section aria-labelledby="h-notices">
        <h2 id="h-notices">${this.t('ui.kit.notices')}</h2>
        <div class="row">
          <noema-button
            id="toast"
            @click=${() => {
              toast('ui.kit.saved');
            }}
            >${this.t('ui.kit.showToast')}</noema-button
          >
          <noema-button id="notice" @click=${() => this.host?.notifier.notice(this.t('ui.kit.stepReady'))}
            >${this.t('ui.kit.showNotice')}</noema-button
          >
          <noema-button id="alert" @click=${() => this.host?.notifier.alert(this.t('ui.kit.storageFull'))}
            >${this.t('ui.kit.showAlert')}</noema-button
          >
        </div>
        <p class="note" role="status">${this.#moved ? this.t('ui.kit.moved', { n: this.#moved }) : this.t('ui.kit.noticeRule')}</p>
      </section>`;
  }

  #forms(): TemplateResult {
    const submit = (e: SubmitEvent): void => {
      e.preventDefault();
      const form = e.currentTarget as HTMLFormElement;
      const name = form.querySelector<NoemaTextField>('noema-text-field[name="name"]');
      if (name) name.error = name.value.trim() ? '' : this.t('ui.kit.nameMissing');
      if (name && !name.error) this.host?.notifier.toast(this.t('ui.kit.saved'));
      else name?.focus();
    };
    return html`<section aria-labelledby="h-forms">
        <h2 id="h-forms">${this.t('ui.kit.forms')}</h2>
        <form @submit=${submit} novalidate>
          <noema-text-field
            name="name"
            label=${this.t('ui.kit.name')}
            hint=${this.t('ui.kit.nameHint')}
            required
            autocomplete="nickname"
          ></noema-text-field>
          <noema-text-field name="about" label=${this.t('ui.kit.about')} multiline maxlength="280"></noema-text-field>
          <noema-select
            name="goal"
            label=${this.t('ui.kit.goal')}
            value="120"
            .options=${[60, 120, 240].map(n => ({ value: String(n), label: this.t('ui.kit.xp', { n }) }))}
          ></noema-select>
          <noema-switch name="sound" label=${this.t('ui.kit.sound')} checked></noema-switch>
          <noema-radio-group
            name="game"
            label=${this.t('ui.kit.game')}
            value="calm"
            .options=${(['playful', 'calm', 'off'] as const).map(v => ({ value: v, label: this.t(`ui.kit.game.${v}`), sub: this.t(`ui.kit.game.${v}Sub`) }))}
          ></noema-radio-group>
          <div class="row"><noema-button type="submit" variant="primary">${this.t('ui.kit.save')}</noema-button></div>
        </form>
      </section>
      <section aria-labelledby="h-tabs">
        <h2 id="h-tabs">${this.t('ui.kit.tabs')}</h2>
        <noema-tabs
          label=${this.t('ui.kit.chapter', { n: 2 })}
          .tabs=${[
            { id: 'theory', label: this.t('ui.kit.theory'), icon: 'book' },
            { id: 'practice', label: this.t('ui.kit.practice'), icon: 'star', badge: 3 },
            { id: 'traps', label: this.t('ui.kit.traps'), icon: 'alert' },
          ]}
          selected="theory"
        >
          <p slot="theory">${this.t('ui.kit.theoryText')}</p>
          <p slot="practice">${this.t('ui.kit.practiceText')}</p>
          <p slot="traps">${this.t('ui.kit.trapsText')}</p>
        </noema-tabs>
      </section>
      <section aria-labelledby="h-lists">
        <h2 id="h-lists">${this.t('ui.kit.lists')}</h2>
        <div class="stack">
          <noema-list label=${this.t('ui.kit.subjects')}>
            <noema-list-item
              icon="book"
              heading=${this.t('ui.kit.mechanics')}
              sub=${this.t('ui.kit.chapters', { n: 6 })}
              href="#/ui-kit/basics"
            >
              <noema-menu slot="end" label=${this.t('ui.kit.moreAbout', { name: this.t('ui.kit.mechanics') })}>
                <noema-menu-item value="edit" icon="edit">${this.t('ui.kit.edit')}</noema-menu-item>
                <noema-menu-item value="share" icon="share">${this.t('ui.kit.share')}</noema-menu-item>
              </noema-menu>
            </noema-list-item>
            <noema-list-item
              icon="map"
              heading=${this.t('ui.kit.optics')}
              sub=${this.t('ui.kit.chapters', { n: 4 })}
              href="#/ui-kit/basics"
            ></noema-list-item>
            <noema-list-item icon="globe" heading=${this.t('ui.kit.languages')} sub=${this.t('ui.kit.languagesSub')}></noema-list-item>
          </noema-list>
          <div>
            <noema-collapsible heading=${this.t('ui.kit.foldA')} heading-level="3" open>
              <p style="margin:0">${this.t('ui.kit.foldAText')}</p>
            </noema-collapsible>
            <noema-collapsible heading=${this.t('ui.kit.foldB')} heading-level="3">
              <p style="margin:0">${this.t('ui.kit.foldBText')}</p>
            </noema-collapsible>
          </div>
        </div>
      </section>`;
  }

  #look(): TemplateResult {
    const host = this.host;
    if (!host) return html``;
    const a = host.appearance();
    const set = (patch: Partial<Appearance>): void => {
      host.setAppearance({ ...a, ...patch });
      this.requestUpdate();
    };
    const locales = this.services.locales.list();
    return html`<section aria-labelledby="h-look">
      <h2 id="h-look">${this.t('ui.kit.look')}</h2>
      <div class="stack">
        <noema-radio-group
          label=${this.t('ui.kit.scheme')}
          value=${a.scheme}
          .options=${(['system', 'light', 'dark'] as const).map(v => ({ value: v, label: v === 'system' ? this.t('ui.kit.asDevice') : this.t(`ui.kit.scheme.${v}`) }))}
          @noema-change=${(e: CustomEvent<{ value: string }>) => {
            set({ scheme: e.detail.value as Scheme });
          }}
        ></noema-radio-group>
        <noema-select
          label=${this.t('ui.kit.character')}
          value=${a.character}
          .options=${CHARACTER_IDS.map(id => ({ value: id, label: this.t(`char.${id}.name`) }))}
          @noema-change=${(e: CustomEvent<{ value: string }>) => {
            set({ character: e.detail.value as CharacterId });
          }}
        ></noema-select>
        <noema-radio-group
          label=${this.t('ui.kit.motion')}
          value=${a.motion}
          .options=${(['system', 'reduced', 'full'] as const).map(v => ({ value: v, label: v === 'system' ? this.t('ui.kit.asDevice') : this.t(`ui.kit.motion.${v}`) }))}
          @noema-change=${(e: CustomEvent<{ value: string }>) => {
            set({ motion: e.detail.value as Motion });
          }}
        ></noema-radio-group>
        <noema-select
          id="locale"
          label=${this.t('ui.kit.language')}
          value=${this.i18n.locale()}
          .options=${locales.map(l => ({ value: l.tag, label: l.name }))}
          @noema-change=${(e: CustomEvent<{ value: string }>) => {
            void this.services.locales.use(e.detail.value);
          }}
        ></noema-select>
        <p class="note">${this.t('ui.kit.lookNote')}</p>
      </div>
    </section>`;
  }

  override render(): TemplateResult {
    const body =
      this.section === 'overlays'
        ? this.#overlays()
        : this.section === 'forms'
          ? this.#forms()
          : this.section === 'look'
            ? this.#look()
            : this.#basics();
    return html`<h1>${this.sectionName(this.section)}</h1>
      <p class="lead">${this.t(`ui.kit.lead.${this.section}`)}</p>
      ${body}`;
  }
}
