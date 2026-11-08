/**
 * Settings (#/me) and its own pages: what I learn (knowledge, languages, both), the character, the profile, AI, the
 * look (#/me/look: the menus' language, light or dark, how much game, sound, reading, the daily goal, the native
 * language, machine translation), the activity and the data; the character gallery (#/character: try anyone for 5
 * minutes, change freely for 15 days, then once every 5 days) and its preview bar; and the first time's two questions
 * (what do you want to learn, who comes with you). The data and the actions are the root's (SettingsData).
 */
import { html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import { ShellElement, tone } from './base.ts';

export type CharacterGroup = 'animals' | 'tales' | 'grown';
export type World = 'know' | 'lang' | 'both';
export type Game = 'playful' | 'calm' | 'off';
export interface CharacterInfo {
  readonly id: string;
  readonly tutor: string;
  readonly title: string;
  readonly world: string;
}
export interface SettingsData {
  /* the account */
  readonly name: string;
  /** the account's line under its name: e-mail or "this device" */
  readonly sub: string;
  readonly avatar: string | null;
  readonly emoji: string;
  /* the character */
  groups(): Readonly<Record<CharacterGroup, readonly CharacterInfo[]>>;
  owned(): string;
  locked(): boolean;
  canChange(): boolean;
  /** has a character been chosen at all */
  chosen(): boolean;
  freeUntil(): number;
  nextChangeAt(): number;
  changedAt(): number;
  preview(): { readonly m: string; readonly until: number } | null;
  startPreview(m: string): void;
  endPreview(): void;
  choose(m: string, force?: boolean): boolean;
  /** dress the page in a character while choosing one */
  wear(m: string): void;
  celebrate(text: string): void;
  toast(text: string, ms?: number): void;
  date(t: number): string;
  /* what to learn, how much game */
  world(): World;
  setWorld(w: World): void;
  game(): Game;
  setGame(g: Game): void;
  /* the look */
  settings(): Readonly<Record<string, unknown>>;
  put(patch: Record<string, unknown>): void;
  /** the menus' languages to offer (endonym · code) and the browser's language's name */
  locales(): readonly (readonly [string, string])[];
  browserLocaleName(): string;
  localeName(): string;
  /** the supported native languages, as [code, name] */
  natives(): readonly (readonly [string, string])[];
  /** the machine translation panel (engine/mt.js), when there is one */
  mtPanel(): Node | null;
  reload(): void;
  /* the account's actions */
  activity(): void;
  switchProfile(): void;
  logOut(): void;
  /** the Me ▾ menu's tip on Log out (the hover bubble of the frame's toolkit) */
  tipped(el: HTMLElement, text: string): void;
}

const GROUPS: readonly CharacterGroup[] = ['animals', 'tales', 'grown'];

class SettingsBase extends ShellElement {
  static override properties = { ...ShellElement.properties, data: { attribute: false } };
  declare data: SettingsData | undefined;
  /** a group of characters, folded until opened; its head shows the faces inside */
  protected group(g: CharacterGroup, list: readonly CharacterInfo[], body: TemplateResult): TemplateResult {
    return html`<details class="ns-chgrp" data-group=${g}>
      <summary>
        <span class="ns-chgt">${this.L('group_' + g)}</span>
        <span class="ns-chfaces" aria-hidden="true">${list.map(k => this.face(k.id))}</span>
        <span class="ns-pill">${String(list.length)}</span><span class="ns-domchev" aria-hidden="true">›</span>
      </summary>
      ${body}
    </details>`;
  }
  /** a set of choices, one on */
  protected seg<K extends string>(name: string, cur: K, opts: readonly (readonly [K, string])[], pick: (k: K) => void): TemplateResult {
    return html`<div class="ns-seg" role="radiogroup" aria-label=${name}>
      ${opts.map(
        ([k, l]) =>
          html`<button
            class=${cur === k ? 'on' : ''}
            role="radio"
            aria-checked=${String(cur === k)}
            data-v=${k}
            @click=${(e: Event) => {
              const b = e.currentTarget as HTMLElement;
              for (const x of b.parentElement?.children ?? []) {
                x.classList.toggle('on', x === b);
                x.setAttribute('aria-checked', String(x === b));
              }
              pick(k);
            }}
          >
            ${l}
          </button>`,
      )}
    </div>`;
  }
}

/** #/me: the account's settings */
export class NoemaSettings extends SettingsBase {
  #item(icon: TemplateResult, title: string, sub: string, run: () => void): TemplateResult {
    return html`<button class="ns-item" @click=${run}>
      ${icon}<span class="t"><b>${title}</b>${sub ? html`<small>${sub}</small>` : nothing}</span>${this.chev()}
    </button>`;
  }
  protected override firstUpdated(): void {
    const out = this.querySelector<HTMLElement>('.ns-logout');
    if (out) this.data?.tipped(out, this.L('logOutTip'));
  }
  override render(): TemplateResult {
    const d = this.data;
    if (!d) return html``;
    const m = d.preview()?.m ?? d.owned(),
      w = d.world();
    const tutor = this.ctx?.tutorVars(m).tutor ?? '';
    const charSub = d.locked()
      ? this.L('charLocked', { tutor })
      : d.preview()
        ? this.L('tryingNow')
        : `${tutor} · ${d.canChange() ? this.L('canChange') : this.L('nextChange', { date: d.date(d.nextChangeAt()) })}`;
    const go = (h: string) => () => this.ctx?.go(h);
    return html`<div class="ns-hello">
        ${
          d.avatar
            ? html`<img class="ns-avatar big" src=${d.avatar} alt="" />`
            : html`<span class="ns-me ns-avatar big" data-emoji="1">${d.emoji}</span>`
        }
        <div class="grow">
          <h1>${this.L('settings')}</h1>
          <p class="tiny">${[d.name, d.sub].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <section class="ns-panel">
        <span class="ns-label">${this.L('whatILearn')}</span>
        <p class="tiny">${this.L('whatILearnSub')}</p>
        ${this.seg(
          this.L('whatILearn'),
          w,
          [
            ['know', this.L('knowledge')],
            ['lang', this.L('languages')],
            ['both', this.L('both')],
          ],
          k => {
            d.setWorld(k);
            this.requestUpdate();
          },
        )}
      </section>
      <div class="ns-list">
        ${this.#item(html`<span class="ns-ico face" style=${tone(2)}>${this.face(m)}</span>`, this.L('character'), charSub, go('#/character'))}
        ${this.#item(this.ico('user', 4), this.L('profile'), this.L('profileSub'), go('#/me/profile'))}
        ${this.#item(this.ico('spark', 2), this.L('aiTitle'), this.L('aiSub'), go('#/me/ai'))}
        ${this.#item(this.ico('palette', 4), this.L('look'), this.L('lookSub', { lang: d.localeName() }), go('#/me/look'))}
        ${this.#item(this.ico('clock', 1), this.L('activity'), this.L('activitySub'), () => {
          d.activity();
        })}
        ${this.#item(this.ico('cloud', 1), this.L('data'), this.L('dataSub'), go('#/me/data'))}
      </div>
      <div class="ns-fitrow">
        <button
          class="btn small"
          @click=${() => {
            d.switchProfile();
          }}
        >
          ${this.icon('user')}${this.L('switchProfile')}
        </button>
        <button
          class="btn small ns-logout"
          @click=${() => {
            d.logOut();
          }}
        >
          ${this.icon('logout')}${this.L('logOut')}
        </button>
      </div>`;
  }
}

/** #/me/look: language and appearance */
export class NoemaLook extends SettingsBase {
  protected override firstUpdated(): void {
    const mt = this.data?.mtPanel();
    if (mt) this.querySelector('.ns-mtslot')?.replaceWith(mt);
  }
  override render(): TemplateResult {
    const d = this.data;
    if (!d) return html``;
    const s = d.settings();
    const theme = (s['theme'] as string | undefined) || 'auto';
    const flag = (k: string, def: boolean): boolean => (s[k] as boolean | undefined) ?? def;
    const native = s['native'] as { code?: string; name?: string } | undefined;
    const natives = d.natives();
    const other = !!native && !(native.code && natives.some(([c]) => c === native.code));
    return html`<h1>${this.L('look')}</h1>
      <section class="ns-panel ns-form">
        <label class="ns-field"
          ><span class="ns-label">${this.L('uiLang')}</span>
          <select
            class="noema-input"
            aria-label=${this.L('uiLang')}
            @change=${(e: Event) => {
              const v = (e.target as HTMLSelectElement).value;
              d.put({ lang: v || undefined });
              d.reload();
            }}
          >
            <option value="">${this.L('uiLangAuto', { lang: d.browserLocaleName() })}</option>
            ${d.locales().map(([k, l]) => html`<option value=${k} ?selected=${s['lang'] === k} lang=${k}>${l}</option>`)}
          </select></label
        >
        <p class="tiny">${this.L('uiLangTip')}</p>
      </section>
      <section class="ns-panel ns-form">
        <span class="ns-label">${this.L('lightDark')}</span>
        ${this.seg(
          this.L('lightDark'),
          theme,
          [
            ['auto', this.L('auto')],
            ['light', this.L('light')],
            ['dark', this.L('dark')],
          ],
          k => {
            d.put({ theme: k });
            if (k === 'auto') delete document.documentElement.dataset['theme'];
            else document.documentElement.dataset['theme'] = k;
          },
        )}
      </section>
      <section class="ns-panel ns-form">
        <span class="ns-label">${this.L('gameMode')}</span>
        <p class="tiny">${this.L('gameModeSub')}</p>
        ${this.seg(
          this.L('gameMode'),
          d.game(),
          [
            ['playful', this.L('gamePlayful')],
            ['calm', this.L('gameCalm')],
            ['off', this.L('gameOff')],
          ],
          k => {
            d.setGame(k);
          },
        )}
        <p class="tiny">${this.L('gameRules')}</p>
      </section>
      <section class="ns-panel ns-form">
        <span class="ns-label">${this.L('studying')}</span>
        ${(
          [
            ['sound', true, this.L('sound')],
            ['chunk', true, this.L('chunk')],
          ] as const
        ).map(
          ([k, def, label]) =>
            html`<label class="row ns-check"
              ><input
                type="checkbox"
                ?checked=${flag(k, def)}
                @change=${(e: Event) => {
                  d.put({ [k]: (e.target as HTMLInputElement).checked });
                }}
              />${label}</label
            >`,
        )}
        <label class="row ns-check"
          ><input
            class="noema-input"
            type="number"
            min="20"
            step="10"
            style="width:110px"
            aria-label=${this.L('dailyGoal')}
            .value=${String((s['goal'] as number | undefined) || 120)}
            @change=${(e: Event) => {
              d.put({ goal: Math.max(20, Number((e.target as HTMLInputElement).value) || 120) });
            }}
          />${this.L('dailyGoal')}</label
        >
      </section>
      <section class="ns-panel ns-form">
        <label class="ns-field"
          ><span class="ns-label">${this.L('native')}</span>
          <select
            class="noema-input ns-native"
            aria-label=${this.L('native')}
            @change=${(e: Event) => {
              const v = (e.target as HTMLSelectElement).value;
              if (v !== '=') d.put({ native: v ? { code: v } : undefined });
            }}
          >
            <option value="">${this.L('nativeNone')}</option>
            ${natives.map(([c, n]) => html`<option value=${c} ?selected=${native?.code === c}>${n}</option>`)}
            ${other ? html`<option value="=" selected>${native.name || native.code}</option>` : nothing}
          </select></label
        >
        <p class="tiny">${this.L('nativeTip')}</p>
      </section>
      <div class="ns-mtslot"></div>
      <div class="row">
        <button class="btn" @click=${() => this.ctx?.go('#/character')}>${this.face(undefined, 'mini')}${this.L('character')}</button>
      </div>`;
  }
}

/** #/character: the gallery */
export class NoemaCharacters extends SettingsBase {
  override render(): TemplateResult {
    const d = this.data;
    if (!d) return html``;
    const own = d.owned(),
      can = d.canChange(),
      locked = d.locked(),
      now = Date.now();
    const rule = locked
      ? this.L('charLockedLong')
      : now < d.freeUntil()
        ? this.L('freeUntil', { date: d.date(d.freeUntil()) })
        : can
          ? this.L('canChangeNow')
          : this.L('changedOn', { date: d.date(d.changedAt()), next: d.date(d.nextChangeAt()) });
    const sample = this.L('fontSample'); // “Aa” + a greeting in the UI language: how each font looks
    const groups = d.groups();
    return html`<div>
        <span class="ns-label">${this.L('companion')}</span>
        <h1>${this.L('character')}</h1>
      </div>
      <p class="ns-muted">${this.L('characterIntro')}</p>
      <p class="tiny">${rule}</p>
      ${GROUPS.map(g =>
        this.group(
          g,
          groups[g],
          html`<div class="ns-gal">
            ${groups[g].map(k => {
              const cur = k.id === own;
              return html`<div class=${'ns-gcard' + (cur ? ' cur' : '')} data-m=${k.id} data-char=${k.id}>
                ${cur ? html`<span class="badge">${this.pill(this.L('yours'), 1)}</span>` : nothing} ${this.face(k.id, 'breathe')}
                <h3>${k.tutor}</h3>
                <span class="tiny">${k.title} · ${k.world}</span>
                <span class="sws">${[1, 2, 3, 4, 5].map(i => html`<i style=${`background:var(--swatch${String(i)})`}></i>`)}</span>
                <span class="fs">${sample}</span>
                ${
                  cur || locked
                    ? nothing
                    : html`<div class="row">
                        <button
                          class="btn small soft"
                          data-try=${k.id}
                          @click=${() => {
                            d.startPreview(k.id);
                            d.toast(this.L('tryingNow', { tutor: k.tutor }), 2500);
                          }}
                        >
                          ${this.L('try5')}
                        </button>
                        ${
                          !d.chosen() || can
                            ? html`<button
                                class="btn small"
                                data-choose=${k.id}
                                @click=${() => {
                                  d.choose(k.id);
                                  d.celebrate(this.L('welcomeWorld'));
                                }}
                              >
                                ${this.L('choose')}
                              </button>`
                            : nothing
                        }
                      </div>`
                }
              </div>`;
            })}
          </div>`,
        ),
      )}`;
  }
}

/** the 5-minute try's bar (in the frame, above the top bar) */
export class NoemaPreviewBar extends SettingsBase {
  override render(): TemplateResult {
    const d = this.data,
      p = d?.preview();
    document.body.classList.toggle('ns-previewing', !!p);
    if (!d || !p) return html``;
    const left = Math.max(0, p.until - Date.now()),
      mm = Math.floor(left / 6e4),
      ss = String(Math.floor(left / 1e3) % 60).padStart(2, '0'),
      can = d.canChange(),
      nm = this.ctx?.tutorVars(p.m).tutor ?? '';
    return html`<div class="ns-preview" role="status" data-m=${p.m}>
      ${this.face(p.m)}<span>${this.L('trying')} <b>${nm}</b> · <b class="ns-pvtime">${`${String(mm)}:${ss}`}</b></span>
      <span class="row grow-end"
        ><button
          class="btn small primary"
          ?disabled=${!can}
          @click=${() => {
            d.choose(p.m);
            d.celebrate(this.L('welcomeWorld'));
          }}
        >
          ${this.L('keepIt')}</button
        ><button
          class="btn small"
          @click=${() => {
            d.endPreview();
          }}
        >
          ${this.L('endTry')}
        </button></span
      >
      ${can ? nothing : html`<span class="tiny full">${this.L('keepFrom', { date: d.date(d.nextChangeAt()) })}</span>`}
    </div>`;
  }
}

/** the first time: what do you want to learn (1), who comes with you (2) */
export class NoemaOnboarding extends SettingsBase {
  static override properties = { ...SettingsBase.properties, step: { state: true } };
  declare step: 1 | 2;
  #sel = '';
  constructor() {
    super();
    this.step = 1;
  }
  override connectedCallback(): void {
    super.connectedCallback();
    this.#sel = this.data?.owned() ?? 'hedge';
  }
  protected override updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    if (changed.has('step')) this.querySelector<HTMLElement>('.ns-onb button')?.focus({ preventScroll: true });
  }
  #pick(w: World): void {
    const d = this.data;
    if (!d) return;
    d.setWorld(w);
    if (d.locked()) this.#finish();
    else this.step = 2;
  }
  #finish(): void {
    const d = this.data;
    if (!d) return;
    if (!d.locked()) d.choose(this.#sel, true);
    d.put({ onboarded: Date.now() });
    this.emit('noema-onboarded');
  }
  override render(): TemplateResult {
    const d = this.data;
    if (!d) return html``;
    if (this.step === 1)
      return html`<div class="ns-scrim" data-sticky="1"></div>
        <div class="ns-modal ns-onb" role="dialog" aria-modal="true" aria-labelledby="ns-onb-title" data-sticky="1">
          ${this.face(undefined, 'breathe')}
          <h1 class="center" id="ns-onb-title">${this.L('onbWhat')}</h1>
          <button
            class="ns-choice"
            data-pick="know"
            @click=${() => {
              this.#pick('know');
            }}
          >
            ${this.ico('path', 1)}<span><b>${this.L('knowledge')}</b><small>${this.L('onbKnow')}</small></span>
          </button>
          <button
            class="ns-choice"
            data-pick="lang"
            @click=${() => {
              this.#pick('lang');
            }}
          >
            ${this.icoTxt('文A', 3)}<span><b>${this.L('languages')}</b><small>${this.L('onbLang')}</small></span>
          </button>
          <button
            class="ns-choice"
            data-pick="both"
            @click=${() => {
              this.#pick('both');
            }}
          >
            ${this.ico('star', 2)}<span><b>${this.L('both')}</b><small>${this.L('onbBoth')}</small></span>
          </button>
          <p class="tiny center">${this.L('onbChangeLater')}</p>
        </div>`;
    const groups = d.groups();
    return html`<div class="ns-scrim" data-sticky="1"></div>
      <div class="ns-modal ns-onb" role="dialog" aria-modal="true" aria-labelledby="ns-onb-title" data-sticky="1">
        <h1 class="center" id="ns-onb-title">${this.L('onbWho')}</h1>
        <p class="ns-muted center">${this.L('onbWhoSub')}</p>
        <div class="ns-pickgroups">
          ${GROUPS.map(g =>
            this.group(
              g,
              groups[g],
              html`<div class="ns-pick">
                ${groups[g].map(
                  k =>
                    html`<button
                      class=${k.id === this.#sel ? 'on' : ''}
                      data-m=${k.id}
                      data-onbm=${k.id}
                      @click=${() => {
                        this.#sel = k.id;
                        d.wear(k.id);
                        this.requestUpdate();
                      }}
                    >
                      ${this.face(k.id)}<span>${k.tutor}</span>
                    </button>`,
                )}
              </div>`,
            ),
          )}
        </div>
        <button
          class="btn primary"
          data-onbdone="1"
          @click=${() => {
            this.#finish();
          }}
        >
          ${this.L('onbGo')}
        </button>
        <p class="tiny center">${this.L('onbWhoLater')}</p>
      </div>`;
  }
}
