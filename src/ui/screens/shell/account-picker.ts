/**
 * Who is learning? The first screen of a device with several profiles, after Log out, and Me ▾ › Switch account: the
 * profiles of this device (a PIN asked for a locked one), a new profile (name, a face, an optional PIN), and the
 * cloud's sign-in, sign-up and password reset when the deployment has a cloud. It draws inside the start's overlay
 * (.noema-overlay > .noema-ovbox, engine/src/30_shell.css); what it does goes through its `data` (the root's adapter).
 */
import { html, nothing, type TemplateResult } from 'lit';
import { NoemaElement } from '../../core/element.ts';

export interface PickerAccount {
  readonly id: string;
  readonly name: string;
  readonly emoji?: string;
  readonly kind: 'local' | 'cloud';
  readonly email?: string | null;
  readonly pin?: string | null;
}
export interface PickerData {
  readonly appName: string;
  accounts(): readonly PickerAccount[];
  /** a PIN is right for the profile */
  checkPin(a: PickerAccount, pin: string): Promise<boolean>;
  /** makes a profile (its id from its name) and returns it */
  create(p: { name: string; emoji: string; pin: string }): Promise<PickerAccount>;
  /** the cloud can be signed in to here */
  cloud: boolean;
  signIn(email: string, pw: string): Promise<PickerAccount | null>;
  /** null: a confirmation e-mail was sent */
  signUp(email: string, pw: string, name: string): Promise<PickerAccount | null>;
  recover(email: string): Promise<void>;
  toast(text: string): void;
  err(e: unknown): string;
}

/** the faces a new profile can take */
export const PROFILE_FACES = ['🦉', '🦊', '🐼', '🐯', '🦄', '🐙', '🌵', '🚀', '🎧', '📚', '🧪', '🧠'] as const; // i18n-ignore (faces)

type Mode = 'list' | 'pin' | 'new' | 'in' | 'up';

export class NoemaAccountPicker extends NoemaElement {
  static override properties = { data: { attribute: false }, mode: { state: true }, msg: { state: true }, busy: { state: true } };
  declare data: PickerData | undefined;
  declare mode: Mode;
  declare msg: string;
  declare busy: boolean;
  #locked: PickerAccount | null = null;
  #face: string = PROFILE_FACES[0];

  constructor() {
    super();
    this.mode = 'list';
    this.msg = '';
    this.busy = false;
  }
  protected override createRenderRoot(): HTMLElement {
    return this;
  }
  #picked(a: PickerAccount): void {
    this.emit('noema-account', a);
  }
  #field(name: string): HTMLInputElement | null {
    return this.querySelector<HTMLInputElement>(`[name="${name}"]`);
  }
  protected override updated(): void {
    const first = this.querySelector<HTMLInputElement>('input.noema-input');
    if (first && this.mode !== 'list' && !this.contains(document.activeElement)) first.focus();
  }
  #choose(a: PickerAccount): void {
    if (!a.pin) {
      this.#picked(a);
      return;
    }
    this.#locked = a;
    this.mode = 'pin';
  }
  async #unlock(): Promise<void> {
    const a = this.#locked,
      d = this.data;
    if (!a || !d) return;
    if (await d.checkPin(a, this.#field('pin')?.value ?? '')) this.#picked(a);
    else {
      d.toast(this.t('loader.pin.wrong'));
      this.mode = 'list';
    }
  }
  async #create(): Promise<void> {
    const d = this.data,
      name = this.#field('name');
    if (!d || !name) return;
    const n = name.value.trim();
    if (!n) {
      name.focus();
      return;
    }
    this.#picked(await d.create({ name: n, emoji: this.#face, pin: this.#field('pin')?.value ?? '' }));
  }
  async #cloud(): Promise<void> {
    const d = this.data;
    if (!d) return;
    this.busy = true;
    this.msg = '…';
    const email = this.#field('email')?.value.trim() ?? '',
      pw = this.#field('password')?.value ?? '';
    try {
      if (this.mode === 'in') {
        const a = await d.signIn(email, pw);
        if (a) this.#picked(a);
      } else {
        const a = await d.signUp(email, pw, this.#field('display')?.value.trim() ?? '');
        if (a) this.#picked(a);
        else {
          this.msg = this.t('loader.cloud.confirmEmail');
          this.mode = 'in';
        }
      }
    } catch (e) {
      this.msg = d.err(e);
    } finally {
      this.busy = false;
    }
  }
  async #recover(): Promise<void> {
    const d = this.data;
    if (!d) return;
    try {
      await d.recover(this.#field('email')?.value.trim() ?? '');
      this.msg = this.t('loader.cloud.resetSent');
    } catch (e) {
      this.msg = d.err(e);
    }
  }
  #head(title: string, sub?: string): TemplateResult {
    return html`<div class="noema-ovhead">
      <div>
        <h1>${title}</h1>
        ${sub ? html`<p class="muted">${sub}</p>` : nothing}
      </div>
    </div>`;
  }
  #enter(run: () => void) {
    return (e: KeyboardEvent): void => {
      if (e.key === 'Enter') run();
      if (e.key === 'Escape') this.mode = 'list';
    };
  }

  override render(): TemplateResult {
    const d = this.data;
    if (!d) return html``;
    const back = html`<button class="btn" @click=${() => (this.mode = 'list')}>${this.t('loader.back')}</button>`;
    switch (this.mode) {
      case 'pin': {
        const a = this.#locked;
        return html`${this.#list(d)}
          <div class="noema-form pop">
            <b>${a?.emoji ?? ''} ${this.t('loader.pin.enter', { name: a?.name ?? '' })}</b>
            <input
              name="pin"
              type="password"
              inputmode="numeric"
              maxlength="8"
              class="noema-input"
              placeholder=${this.t('loader.pin.placeholder')}
              aria-label=${this.t('loader.pin.placeholder')}
              @keydown=${this.#enter(() => void this.#unlock())}
            />
            <div class="row">
              <button class="btn" @click=${() => (this.mode = 'list')}>${this.t('loader.cancel')}</button
              ><button class="btn primary" @click=${() => void this.#unlock()}>${this.t('loader.pin.unlock')}</button>
            </div>
          </div>`;
      }
      case 'new':
        return html`${this.#head(this.t('loader.profile.title'), this.t('loader.profile.sub'))}
          <div class="noema-form">
            <input
              name="name"
              class="noema-input"
              maxlength="30"
              placeholder=${this.t('loader.profile.namePlaceholder')}
              aria-label=${this.t('loader.profile.namePlaceholder')}
              @keydown=${this.#enter(() => void this.#create())}
            />
            <div class="noema-emos">
              ${PROFILE_FACES.map(
                f =>
                  html`<button
                    class=${'noema-emo' + (f === this.#face ? ' on' : '')}
                    aria-pressed=${String(f === this.#face)}
                    @click=${() => {
                      this.#face = f;
                      this.requestUpdate();
                    }}
                  >
                    ${f}
                  </button>`,
              )}
            </div>
            <input
              name="pin"
              class="noema-input"
              type="password"
              inputmode="numeric"
              maxlength="8"
              placeholder=${this.t('loader.profile.pinPlaceholder')}
              aria-label=${this.t('loader.profile.pinPlaceholder')}
            />
            <div class="row">
              ${back}<button class="btn primary" @click=${() => void this.#create()}>${this.t('loader.profile.create')}</button>
            </div>
          </div>`;
      case 'in':
      case 'up': {
        const up = this.mode === 'up';
        return html`${this.#head(up ? this.t('loader.cloud.createTitle') : this.t('loader.cloud.signIn'), this.t('loader.cloud.private'))}
          <div class="noema-form">
            ${
              up
                ? html`<input
                    name="display"
                    class="noema-input"
                    placeholder=${this.t('loader.cloud.displayName')}
                    aria-label=${this.t('loader.cloud.displayName')}
                  />`
                : nothing
            }
            <input
              name="email"
              class="noema-input"
              type="email"
              autocomplete="email"
              placeholder=${this.t('loader.cloud.email')}
              aria-label=${this.t('loader.cloud.email')}
            />
            <input
              name="password"
              class="noema-input"
              type="password"
              autocomplete="current-password"
              placeholder=${this.t('loader.cloud.password')}
              aria-label=${this.t('loader.cloud.password')}
              @keydown=${this.#enter(() => void this.#cloud())}
            />
            <div class="tiny" role="status">${this.msg}</div>
            <div class="row">
              ${back}<button class="btn primary" ?disabled=${this.busy} @click=${() => void this.#cloud()}>
                ${up ? this.t('loader.cloud.createBtn') : this.t('loader.cloud.signIn')}
              </button>
            </div>
            <div class="row">
              <button
                class="tiny linkish"
                @click=${() => {
                  this.mode = up ? 'in' : 'up';
                  this.msg = '';
                }}
              >
                ${up ? this.t('loader.cloud.haveAccount') : this.t('loader.cloud.noAccount')}
              </button>
              ${up ? nothing : html`<button class="tiny linkish" @click=${() => void this.#recover()}>${this.t('loader.cloud.forgot')}</button>`}
            </div>
          </div>`;
      }
      default:
        return this.#list(d);
    }
  }
  #list(d: PickerData): TemplateResult {
    return html`${this.#head(d.appName, this.t('pick.who'))}
      <div class="noema-accgrid">
        ${d.accounts().map(
          (a, i) =>
            html`<button
              class="noema-acc"
              style=${`animation-delay:${String(i * 50)}ms`}
              @click=${() => {
                this.#choose(a);
              }}
            >
              <span class="noema-accemo" data-emoji="1">${a.emoji || '🙂'}</span><b>${a.name}</b
              ><small>${a.kind === 'cloud' ? a.email : (a.pin ? '🔒 ' : '') + this.t('pick.local')}</small>
            </button>`,
        )}
        <button
          class="noema-acc add"
          @click=${() => {
            this.#face = PROFILE_FACES[Math.floor(Math.random() * PROFILE_FACES.length)] ?? PROFILE_FACES[0];
            this.mode = 'new';
          }}
        >
          <span class="noema-accemo" data-emoji="1">➕</span><b>${this.t('pick.newProfile')}</b><small>${this.t('pick.onDevice')}</small>
        </button>
      </div>
      ${
        d.cloud
          ? html`<div class="noema-cloudrow">
              <button class="btn ai" @click=${() => (this.mode = 'in')}>${this.t('pick.cloudSignIn')}</button
              ><span class="tiny">${this.t('pick.cloudHint')}</span>
            </div>`
          : nothing
      }`;
  }
}
