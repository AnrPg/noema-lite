/**
 * 👥 #/people — Chats · Buddies · Groups, and finding people by name (docs/SOCIAL.md §2). The first time it says others
 * can now find you, and how to change it. ⋮ holds privacy, the people I blocked and how it works.
 */
import { html, nothing, type TemplateResult } from 'lit';
import type { InboxRow, PersonRow } from '../../../ports/social.ts';
import { icon } from '../../../ui/kit/icons.ts';
import { face, when } from '../../community/ui/format.ts';
import type { ChromeMenuItem, ScreenChrome } from '../../community/ui/host.ts';
import { CommunityScreen } from '../../community/ui/screen.ts';
import { adopt, COMMON } from '../../community/ui/styles.ts';
import { SEARCH_CSS } from '../../search/ui/styles.ts';
import { VAULT_CSS } from '../../vault/ui/styles.ts';
import { cleanQuery } from '../domain/index.ts';
import { act, need, openAbout, openBlocked, openGroupForm, openPrivacy, personRow, type SocialScreenDeps } from './parts.ts';
import { SOCIAL_CSS } from './styles.ts';

type P = Record<string, string | number>;

/** a room in a list: its face, name, last message, when, how many are new */
export function roomRow(deps: SocialScreenDeps, r: InboxRow, now: number): TemplateResult {
  const ui = deps.ui,
    T = (k: string, p?: P): string => ui.T(k, p),
    i18n = ui.d.i18n();
  const mine = r['last_author'] === ui.me(),
    body = typeof r['last_body'] === 'string' ? r['last_body'] : '';
  const prev = r['last_kind'] && !body ? '📎 ' + ui.attLabel(r['last_kind']) : body || (r.kind === 'group' ? T('groupNoMsgs') : ''); // i18n-ignore (📎: a sign)
  const unread = !!r.unread && !r.muted;
  const at = r['last_at'];
  return html`<button
    type="button"
    class="nc-item so-room ${unread ? 'unread' : ''}"
    data-room=${r.room}
    @click=${() => {
      deps.host.go('#/chat/' + r.room);
    }}
  >
    ${face(r.kind === 'dm' ? r.other_emoji : r['emoji'], ui.roomName(r), r.room)}
    <span class="t"><b>${ui.roomName(r)}</b><small class="so-prev">${(mine && body ? T('you') + ' ' : '') + prev}</small></span>
    <span class="so-when nc-tiny"
      ><span>${typeof at === 'string' ? when(i18n, at, now) : ''}</span>${
        unread
          ? html`<span class="so-count" aria-label=${T('newN', { n: r.unread ?? 0 })}>${i18n.format.number(r.unread ?? 0)}</span>`
          : r.muted
            ? html`<span class="nc-muted" title=${T('muted')}>🔕</span>` // i18n-ignore (🔕: a sign)
            : nothing
      }</span
    >
    <span class="chev" aria-hidden="true">${icon('forward')}</span>
  </button>`;
}

/** an invitation to a group: join or decline */
export function inviteRow(deps: SocialScreenDeps, r: { room: string; name: string; emoji?: unknown; members: number }): TemplateResult {
  const ui = deps.ui,
    svc = ui.svc,
    T = (k: string, p?: P): string => ui.T(k, p);
  return html`<div class="nc-panel so-invite" data-room=${r.room}>
    ${face(r.emoji, r.name, r.room)}
    <div class="nc-grow"><b>${r.name}</b><br /><small class="nc-tiny nc-muted">${T('invitedTo', { n: r.members })}</small></div>
    <div class="nc-row">
      <noema-button
        class="so-joinbtn"
        size="sm"
        variant="primary"
        @click=${(e: Event) =>
          void act(deps, e.currentTarget, async () => {
            need(await svc.server.member(r.room, ui.me() ?? '', { status: 'joined' }));
            await ui.refresh();
            deps.host.go('#/chat/' + r.room);
          })}
        >${T('join')}</noema-button
      >
      <noema-button
        size="sm"
        variant="quiet"
        @click=${(e: Event) =>
          void act(deps, e.currentTarget, async () => {
            need(await svc.server.member(r.room, ui.me() ?? '', { status: 'left' }));
            await ui.refresh();
          })}
        >${T('decline')}</noema-button
      >
    </div>
  </div>`;
}

export class NoemaPeoplePage extends CommunityScreen<SocialScreenDeps> {
  #tab = 'chats';
  #q = '';
  #found: PersonRow[] | string | null = null;
  #offline = '';
  #off: (() => void) | null = null;
  #timer: ReturnType<typeof setTimeout> | undefined;

  get #ui(): SocialScreenDeps['ui'] {
    return this.deps.ui;
  }
  #T(k: string, p?: P): string {
    return this.#ui.T(k, p);
  }
  override connectedCallback(): void {
    super.connectedCallback();
    adopt(this.ownerDocument, 'search', COMMON, SEARCH_CSS);
    adopt(this.ownerDocument, 'vault', VAULT_CSS);
    adopt(this.ownerDocument, 'social', SOCIAL_CSS);
    const ui = this.#ui;
    if (!ui.on()) return;
    this.#tab = ui.lastTab();
    this.#off = ui.onChange(() => {
      this.requestUpdate();
    });
    ui.ensureMe().then(
      () => {
        this.requestUpdate();
      },
      () => undefined,
    );
    ui.refresh().catch((e: unknown) => {
      this.#offline = ui.why(e);
      this.requestUpdate();
    });
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#off?.();
    this.#off = null;
    clearTimeout(this.#timer);
  }
  protected override chrome(): ScreenChrome {
    const T = (k: string): string => this.#T(k);
    const menu: ChromeMenuItem[] = [
      { label: T('privacy'), sub: T('privacySub'), icon: 'lock', run: () => void openPrivacy(this.deps) },
      { label: T('blocked'), sub: T('blockedSub'), icon: 'flag', run: () => void openBlocked(this.deps) },
      {
        label: T('howItWorks'),
        icon: 'info',
        run: () => {
          openAbout(this.deps);
        },
      },
    ];
    return { tab: 'people', crumbs: [{ label: T('title') }], menu };
  }

  #find(v: string): void {
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      const s = cleanQuery(v);
      if (s === this.#q) return;
      this.#q = s;
      if (s.length < 2) {
        this.#found = null;
        this.requestUpdate();
        return;
      }
      void this.#ui.svc.search(s).then(r => {
        if (this.#q !== s) return;
        if (!r.ok) this.#found = this.#ui.why(r.error);
        else {
          for (const p of r.value) this.#ui.svc.state.names[p.user_id] = p;
          this.#found = r.value;
        }
        this.requestUpdate();
      });
    }, 250);
  }
  #changed = (): void => {
    this.requestUpdate();
  };

  #chats(): TemplateResult {
    const S = this.#ui.svc.state,
      now = Date.now();
    const inv = S.inbox.filter(r => r.status === 'invited'),
      rooms = S.inbox.filter(r => r.status === 'joined');
    return html`<div class="so-chats">
      ${inv.map(r => inviteRow(this.deps, { room: r.room, name: r.name ?? '', emoji: r['emoji'], members: Number(r['members']) || 0 }))}
      ${
        rooms.length
          ? html`<div class="nc-list">${rooms.map(r => roomRow(this.deps, r, now))}</div>`
          : html`<div class="nc-panel nc-empty">
              ${this.host.face('breathe') ?? nothing}
              <p>${this.#T('noChats')}</p>
            </div>`
      }
    </div>`;
  }
  #buddies(): TemplateResult {
    const ui = this.#ui,
      S = ui.svc.state,
      me = ui.me();
    const other = (b: { a: string; b: string }): string => (b.a === me ? b.b : b.a);
    const got = ui.svc.requests(),
      sent = S.buddies.filter(b => b.status === 'pending' && b.asked_by === me),
      mine = S.buddies.filter(b => b.status === 'buddies');
    const sec = (label: string, list: readonly { a: string; b: string }[]): TemplateResult | typeof nothing =>
      list.length
        ? html`<span class="nc-label">${label}</span>
            <div class="nc-list">${list.map(b => personRow(this.deps, other(b), this.#changed))}</div>`
        : nothing;
    return html`<div class="so-buddies">
      ${sec(this.#T('requestsGot'), got)} ${sec(this.#T('myBuddies'), mine)} ${sec(this.#T('requestsSent'), sent)}
      ${
        got.length + sent.length + mine.length
          ? nothing
          : html`<div class="nc-panel nc-empty">
              ${this.host.face('breathe') ?? nothing}
              <p>${this.#T('noBuddies')}</p>
            </div>`
      }
    </div>`;
  }
  #groups(): TemplateResult {
    const S = this.#ui.svc.state,
      now = Date.now(),
      T = (k: string): string => this.#T(k);
    const groups = S.inbox.filter(r => r.kind === 'group' && r.status === 'joined');
    let code = '';
    return html`<div class="so-groups">
      <div class="nc-row">
        <noema-button
          class="so-newgroup"
          variant="primary"
          @click=${() => {
            openGroupForm(this.deps, null, id => {
              this.host.go('#/group/' + id);
            });
          }}
          >${icon('plus')}<span>${T('newGroup')}</span></noema-button
        >
      </div>
      ${
        groups.length
          ? html`<div class="nc-list">${groups.map(r => roomRow(this.deps, r, now))}</div>`
          : html`<p class="nc-muted nc-tiny">${T('noGroups')}</p>`
      }
      <details class="so-joinby">
        <summary>${T('joinLink')}</summary>
        <div class="nc-row">
          <input
            class="nc-input so-code"
            placeholder=${T('linkPh')}
            aria-label=${T('joinLink')}
            @input=${(e: Event) => {
              code = (e.target as HTMLInputElement).value;
            }}
          />
          <noema-button
            size="sm"
            variant="secondary"
            @click=${() => {
              const m = /([A-Za-z0-9]{12,40})\s*$/.exec(code);
              if (m) this.host.go('#/join/' + (m[1] ?? ''));
              else this.toast(T('err.badLink'), 4000);
            }}
            >${T('open')}</noema-button
          >
        </div>
      </details>
    </div>`;
  }

  override render(): TemplateResult {
    const ui = this.#ui,
      S = ui.svc.state,
      T = (k: string, p?: P): string => this.#T(k, p);
    const top = html`<h1>${T('title')}</h1>
      <p class="nc-muted so-lead">${T('lead')}</p>`;
    if (!ui.on())
      return html`<div class="nc so-view">
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
    const nReq = ui.svc.requests().length,
      nChat =
        S.inbox.filter(r => r.status === 'joined').reduce((a, r) => a + (r.muted ? 0 : r.unread || 0), 0) +
        S.inbox.filter(r => r.status === 'invited').length;
    const tabs = [
      ['chats', T('chats'), nChat],
      ['buddies', T('buddies'), nReq],
      ['groups', T('groups'), 0],
    ] as const;
    const found = this.#found;
    const fmt = (n: number): string => ui.d.i18n().format.number(n);
    return html`<div class="nc so-view">
      ${top}
      <input
        class="nc-input ns-srin so-find"
        type="search"
        placeholder=${T('findPh')}
        aria-label=${T('find')}
        autocomplete="off"
        @input=${(e: Event) => {
          this.#find((e.target as HTMLInputElement).value);
        }}
      />
      ${
        found === null
          ? nothing
          : html`<div class="so-found">
              ${
                typeof found === 'string'
                  ? html`<p class="nc-tiny nc-muted">${found}</p>`
                  : html`<span class="nc-label">${T('foundN', { n: found.length })}</span> ${
                        found.length
                          ? html`<div class="nc-list">${found.map(p => personRow(this.deps, p.user_id, this.#changed))}</div>`
                          : html`<p class="nc-tiny nc-muted">${T('foundNone')}</p>`
                      }`
              }
            </div>`
      }
      ${
        S.mine && !ui.noted()
          ? html`<div class="nc-panel nc-tiny so-first">
              <p>${T('firstNote', { name: S.mine.display_name ?? '' })}</p>
              <div class="nc-row">
                <noema-button size="sm" variant="secondary" @click=${() => void openPrivacy(this.deps)}
                  >${icon('lock')}<span>${T('privacy')}</span></noema-button
                >
                <noema-button
                  size="sm"
                  variant="quiet"
                  @click=${() => {
                    ui.markNoted();
                    this.requestUpdate();
                  }}
                  >${T('gotIt')}</noema-button
                >
              </div>
            </div>`
          : nothing
      }
      <div class="nc-seg so-tabs" role="tablist" aria-label=${T('title')}>
        ${tabs.map(
          ([k, l, n]) =>
            html`<button
              type="button"
              class=${this.#tab === k ? 'on' : ''}
              role="tab"
              aria-selected=${String(this.#tab === k)}
              data-tab=${k}
              @click=${() => {
                this.#tab = k;
                ui.keepTab(k);
                this.requestUpdate();
              }}
            >
              ${l}${n ? html`<span class="so-count" aria-label=${T('newN', { n })}>${fmt(n)}</span>` : nothing}
            </button>`,
        )}
      </div>
      <div class="so-out">
        ${
          this.#offline && !S.loaded
            ? html`<div class="nc-panel nc-empty">
                <p>${T('offline')}</p>
                <p class="nc-tiny nc-muted">${this.#offline}</p>
              </div>`
            : !S.loaded
              ? html`<p class="nc-muted">${T('loading')}</p>`
              : this.#tab === 'buddies'
                ? this.#buddies()
                : this.#tab === 'groups'
                  ? this.#groups()
                  : this.#chats()
        }
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'noema-people-page': NoemaPeoplePage;
  }
}
