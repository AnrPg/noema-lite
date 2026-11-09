/**
 * 👥 #/group/<room> — a study group (docs/SOCIAL.md §4): its members (roles: owner, admins, members), invitations, the
 * invitation link, its own vault folder, the Roadmaps shared in it (its members may join them); leave it.
 * #/join/<code> — an invitation link: the group before joining, then Join. And the buttons of someone's page (#/u/<id>).
 */
import { html, nothing, type TemplateResult } from 'lit';
import { icon } from '../../../ui/kit/icons.ts';
import { ask, openDialog } from '../../community/ui/dialogs.ts';
import { copyText, face, pill } from '../../community/ui/format.ts';
import type { ChromeMenuItem, ScreenChrome } from '../../community/ui/host.ts';
import { CommunityElement, CommunityScreen } from '../../community/ui/screen.ts';
import { adopt, COMMON } from '../../community/ui/styles.ts';
import { SEARCH_CSS } from '../../search/ui/styles.ts';
import { menuOf } from '../../vault/ui/file.ts';
import { VAULT_CSS } from '../../vault/ui/styles.ts';
import { txt, type Row } from './model.ts';
import { act, need, openGroupForm, openPerson, personFace, pickRoadmap, shareRoadmapIn, type SocialScreenDeps } from './parts.ts';
import { SOCIAL_CSS } from './styles.ts';

type P = Record<string, string | number>;
const ROLE_ORDER: Readonly<Record<string, number>> = { owner: 0, admin: 1, member: 2 };
const CODE_LETTERS = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function signedOut(deps: SocialScreenDeps, cls: string): TemplateResult {
  const T = (k: string): string => deps.ui.T(k);
  return html`<div class="nc so-view ${cls}">
    <div class="nc-panel nc-empty">
      <p>${T('signIn')}</p>
      <noema-button
        variant="primary"
        @click=${() => {
          deps.host.signIn();
        }}
        >${T('signInBtn')}</noema-button
      >
    </div>
  </div>`;
}
function styles(doc: Document): void {
  adopt(doc, 'search', COMMON, SEARCH_CSS);
  adopt(doc, 'vault', VAULT_CSS);
  adopt(doc, 'social', SOCIAL_CSS);
}

export class NoemaGroupPage extends CommunityScreen<SocialScreenDeps> {
  static override properties = { ...CommunityScreen.properties, room: { type: String } };
  declare room: string;
  #state: 'loading' | 'gone' | 'error' | 'ready' = 'loading';
  #err = '';
  #info: Record<string, unknown> = {};
  #members: Row[] = [];
  #curs: Row[] = [];

  constructor() {
    super();
    this.room = '';
  }
  get #ui(): SocialScreenDeps['ui'] {
    return this.deps.ui;
  }
  #T(k: string, p?: P): string {
    return this.#ui.T(k, p);
  }
  override connectedCallback(): void {
    super.connectedCallback();
    styles(this.ownerDocument);
    if (this.#ui.on()) void this.#load();
  }
  #again = (): void => {
    void this.#load();
  };
  async #load(): Promise<void> {
    const ui = this.#ui,
      sv = ui.svc.server,
      rid = this.room;
    const [room, members, rms] = await Promise.all([sv.room(rid), sv.members(rid), sv.roadmaps(rid)]);
    if (!room.ok || !members.ok) {
      this.#state = 'error';
      this.#err = ui.why(!room.ok ? room.error : members.ok ? '' : members.error);
      this.requestUpdate();
      return;
    }
    if (!room.value || room.value['kind'] !== 'group') {
      this.#state = 'gone';
      this.requestUpdate();
      return;
    }
    this.#info = { ...room.value };
    this.#members = members.value;
    await ui.svc.names(this.#members.map(m => txt(m['user_id'])));
    const curs = await sv.curricula((rms.ok ? rms.value : []).map(r => txt(r['curriculum'])));
    this.#curs = curs.ok ? curs.value : [];
    this.#state = 'ready';
    this.requestUpdate();
    this.chromeChanged();
  }
  get #myRole(): string {
    return txt(this.#members.find(m => m['user_id'] === this.#ui.me() && m['status'] === 'joined')?.['role']);
  }
  get #boss(): boolean {
    return this.#myRole === 'owner' || this.#myRole === 'admin';
  }
  protected override chrome(): ScreenChrome {
    const T = (k: string): string => this.#T(k),
      rid = this.room;
    const people = { label: T('title'), href: '#/people' };
    if (this.#state !== 'ready') return { tab: 'people', crumbs: [people, { label: '…' }], back: '#/chat/' + rid };
    return {
      tab: 'people',
      crumbs: [people, { label: txt(this.#info['name']), href: '#/chat/' + rid }, { label: T('groupInfo') }],
      back: '#/chat/' + rid,
    };
  }

  #memberRow(m: Row): TemplateResult {
    const ui = this.#ui,
      T = (k: string, p?: P): string => this.#T(k, p),
      x = txt(m['user_id']),
      role = txt(m['role']),
      sv = ui.svc.server,
      rid = this.room,
      my = this.#myRole;
    const items: ChromeMenuItem[] = [];
    if (x !== ui.me() && this.#boss) {
      const set = (patch: Record<string, unknown>) => (): void =>
        void act(this.deps, null, async () => {
          need(await sv.member(rid, x, patch));
          this.#again();
        });
      if (my === 'owner' && role === 'member') items.push({ label: T('makeAdmin'), icon: 'crown', run: set({ role: 'admin' }) });
      if (my === 'owner' && role === 'admin') items.push({ label: T('unmakeAdmin'), icon: 'crown', run: set({ role: 'member' }) });
      if (role !== 'owner' && (my === 'owner' || role === 'member'))
        items.push({
          label: T('removeMember'),
          icon: 'close',
          danger: true,
          run: () => {
            void ask(this.deps, {
              text: T('removeQ', { name: ui.nameOf(x) }),
              ok: T('removeMember'),
              cancel: T('cancel'),
              danger: true,
            }).then(yes => {
              if (yes) set({ status: 'left' })();
            });
          },
        });
    }
    return html`<div class="nc-item so-member" data-person=${x}>
      <button
        type="button"
        class="nc-who so-who"
        @click=${() => {
          if (x !== ui.me()) openPerson(this.deps, x, this.#again);
        }}
      >
        ${personFace(ui, x)}<span class="t"
          ><b>${x === ui.me() ? T('youName', { name: ui.nameOf(x) }) : ui.nameOf(x)}</b>${
            m['status'] === 'invited' ? html`<small>${T('invitedNow')}</small>` : nothing
          }</span
        >
      </button>
      ${role && role !== 'member' ? pill(T('role.' + role), role === 'owner' ? 2 : 4) : nothing}
      ${items.length ? menuOf(T('more'), items) : nothing}
    </div>`;
  }
  #link(): string {
    return this.host.link('#/join/' + txt(this.#info['join_code']));
  }
  async #copyLink(): Promise<void> {
    if (await copyText(this.#link())) this.toast(this.#T('linkCopied'), 2500);
    else this.toast(this.#link(), 8000);
  }
  #linkBox(): TemplateResult {
    const T = (k: string): string => this.#T(k),
      sv = this.#ui.svc.server,
      rid = this.room;
    if (this.#info['join_code'])
      return html`<div class="nc-row">
        <noema-button class="so-copylink" size="sm" variant="secondary" @click=${() => void this.#copyLink()}
          >${icon('link')}<span>${T('copyLink')}</span></noema-button
        >
        ${
          this.#boss
            ? html`<noema-button
                class="so-linkoff"
                size="sm"
                variant="quiet"
                @click=${(e: Event) =>
                  void act(this.deps, e.currentTarget, async () => {
                    need(await sv.setRoom(rid, { join_code: null }));
                    this.#info['join_code'] = null;
                    this.requestUpdate();
                  })}
                >${T('linkOff')}</noema-button
              >`
            : nothing
        }
      </div>`;
    if (!this.#boss) return html`<p class="nc-tiny nc-muted">${T('linkNone')}</p>`;
    return html`<noema-button
      class="so-linkon"
      size="sm"
      variant="secondary"
      @click=${(e: Event) =>
        void act(this.deps, e.currentTarget, async () => {
          const c = [...globalThis.crypto.getRandomValues(new Uint8Array(18))].map(b => CODE_LETTERS[b % 56] ?? 'a').join('');
          need(await sv.setRoom(rid, { join_code: c }));
          this.#info['join_code'] = c;
          this.requestUpdate();
          await this.#copyLink();
        })}
      >${icon('link')}<span>${T('linkOn')}</span></noema-button
    >`;
  }
  #invite(): void {
    const ui = this.#ui,
      svc = ui.svc,
      T = (k: string): string => this.#T(k),
      rid = this.room,
      me = ui.me();
    const inRoom = new Set(this.#members.map(m => txt(m['user_id'])));
    const invited = new Set<string>();
    const buddies = svc.state.buddies
      .filter(b => b.status === 'buddies')
      .map(b => (b.a === me ? b.b : b.a))
      .filter(x => !inRoom.has(x));
    let found: string[] = [],
      t: ReturnType<typeof setTimeout> | undefined;
    const row = (x: string): TemplateResult =>
      html`<div class="nc-item so-person" data-person=${x}>
        ${personFace(ui, x)}<span class="t"><b>${ui.nameOf(x)}</b></span>
        ${
          invited.has(x)
            ? html`<span class="nc-tiny nc-muted">${T('invitedNow')}</span>`
            : html`<noema-button
                class="so-inviteone"
                size="sm"
                variant="primary"
                @click=${(e: Event) =>
                  void act(this.deps, e.currentTarget, async () => {
                    need(await svc.server.invite(rid, x));
                    invited.add(x);
                    inRoom.add(x);
                    d.redraw();
                  })}
                >${T('invite')}</noema-button
              >`
        }
      </div>`;
    const d = openDialog(this.deps, {
      heading: T('invite'),
      cls: 'so-sheet so-invitesheet',
      placement: 'sheet',
      onClose: () => {
        this.#again();
      },
      render: close =>
        html`<p class="nc-tiny nc-muted">${T('inviteLead')}</p>
          ${
            buddies.length
              ? html`<div class="nc-list">${buddies.map(row)}</div>`
              : html`<p class="nc-tiny nc-muted">${T('noBuddiesToInvite')}</p>`
          }
          <input
            class="nc-input ns-srin"
            type="search"
            placeholder=${T('findPh')}
            aria-label=${T('find')}
            @input=${(e: Event) => {
              const q = (e.target as HTMLInputElement).value;
              clearTimeout(t);
              t = setTimeout(() => {
                void svc.search(q).then(r => {
                  const rows = (r.ok ? r.value : []).filter(p => !inRoom.has(p.user_id) || invited.has(p.user_id));
                  for (const p of rows) svc.state.names[p.user_id] = p;
                  found = rows.map(p => p.user_id);
                  d.redraw();
                });
              }, 250);
            }}
          />
          <div>${found.map(row)}</div>
          <noema-button
            slot="actions"
            variant="secondary"
            @click=${() => {
              close();
            }}
            >${T('done')}</noema-button
          >`,
    });
  }

  override render(): TemplateResult {
    const ui = this.#ui,
      T = (k: string, p?: P): string => this.#T(k, p),
      rid = this.room,
      info = this.#info;
    if (!ui.on()) return signedOut(this.deps, 'so-groupview');
    if (this.#state === 'loading') return html`<div class="nc so-view so-groupview"><p class="nc-muted">${T('loading')}</p></div>`;
    if (this.#state !== 'ready')
      return html`<div class="nc so-view so-groupview">
        <div class="nc-panel nc-empty"><p>${this.#state === 'error' ? this.#err : T('roomGone')}</p></div>
      </div>`;
    const joined = this.#members.filter(m => m['status'] === 'joined'),
      invited = this.#members.filter(m => m['status'] === 'invited');
    const sorted = [...joined].sort(
      (a, b) =>
        (ROLE_ORDER[txt(a['role'])] ?? 2) - (ROLE_ORDER[txt(b['role'])] ?? 2) || (txt(a['joined_at']) < txt(b['joined_at']) ? -1 : 1),
    );
    const name = txt(info['name']);
    return html`<div class="nc so-view so-groupview">
      <div class="so-grouptop">
        ${face(info['emoji'], name, rid)}
        <div class="nc-grow">
          <h1>${name}</h1>
          <p class="nc-tiny nc-muted">
            ${[txt(info['course']), txt(info['university']), T('membersN', { n: joined.length })].filter(Boolean).join(' · ')}
          </p>
        </div>
      </div>
      ${info['about'] ? html`<p class="so-about">${txt(info['about'])}</p>` : nothing}
      <div class="nc-row so-groupacts">
        <noema-button
          size="sm"
          variant="primary"
          @click=${() => {
            this.host.go('#/chat/' + rid);
          }}
          >${icon('chat')}<span>${T('chat')}</span></noema-button
        >
        <noema-button
          class="so-files"
          size="sm"
          variant="secondary"
          @click=${() => {
            this.host.go('#/vault?g=' + rid);
          }}
          >${icon('vault')}<span>${T('groupFiles')}</span></noema-button
        >
        <noema-button
          class="so-invite"
          size="sm"
          variant="secondary"
          @click=${() => {
            this.#invite();
          }}
          >${icon('people')}<span>${T('invite')}</span></noema-button
        >
        ${
          this.#boss
            ? html`<noema-button
                class="so-editgroup"
                size="sm"
                variant="quiet"
                @click=${() => {
                  openGroupForm(this.deps, { ...info, id: rid }, this.#again);
                }}
                >${icon('edit')}<span>${T('edit')}</span></noema-button
              >`
            : nothing
        }
      </div>
      <section class="nc-panel so-sec">
        <span class="nc-label">${T('joinLink')}</span>
        <p class="nc-tiny nc-muted">${T('linkLead')}</p>
        <div class="so-linkbox">${this.#linkBox()}</div>
      </section>
      <section class="nc-panel so-sec so-rms">
        <span class="nc-label">${T('groupRoadmaps')}</span>
        ${
          this.#curs.length
            ? html`<div class="nc-list">
                ${this.#curs.map((c, i) => {
                  const id = txt(c['id']),
                    have = !!this.host.roadmap(id);
                  return html`<div class="nc-item" data-cur=${id}>
                    <span class="nc-ico" style="--bgc: var(--t${(i % 4) + 1}); --fgc: var(--t${(i % 4) + 1}i)" aria-hidden="true"
                      >${icon('map')}</span
                    >
                    <span class="t"
                      ><b>${txt(c['title'])}</b><small>${T('byName', { name: txt(c['owner_name']) || T('someone') })}</small></span
                    >
                    <noema-button
                      size="sm"
                      variant=${have ? 'quiet' : 'primary'}
                      @click=${(e: Event) =>
                        void act(this.deps, e.currentTarget, async () => {
                          if (!this.host.roadmap(id)) await this.host.joinRoadmap(id, { viaRoom: true });
                          this.host.go('#/map/' + encodeURIComponent(id));
                        })}
                      >${have ? T('open') : T('joinRm')}</noema-button
                    >
                  </div>`;
                })}
              </div>`
            : html`<p class="nc-tiny nc-muted">${T('noGroupRoadmaps')}</p>`
        }
        <noema-button
          class="so-sharerm"
          size="sm"
          variant="quiet"
          @click=${() => {
            pickRoadmap(this.deps, c => {
              void act(this.deps, null, async () => {
                const title = c.title || c.goal || '';
                await shareRoadmapIn(this.deps, rid, c);
                await ui.svc.server.send(rid, '', { kind: 'roadmap', id: c.id, title });
                this.toast(T('rmShared', { title }), 3500);
                this.#again();
              });
            });
          }}
          >${icon('plus')}<span>${T('shareRoadmap')}</span></noema-button
        >
      </section>
      <section class="nc-panel so-sec">
        <span class="nc-label">${T('members') + ' · ' + ui.d.i18n().format.number(joined.length)}</span>
        <div class="nc-list so-members">${sorted.map(m => this.#memberRow(m))} ${invited.map(m => this.#memberRow(m))}</div>
      </section>
      <div class="nc-row so-leave">
        <noema-button
          class="so-leavebtn"
          size="sm"
          variant="danger"
          @click=${(e: Event) => {
            const b = e.currentTarget;
            void ask(this.deps, { text: T('leaveQ', { name }), ok: T('leave'), cancel: T('cancel'), danger: true }).then(yes => {
              if (yes)
                void act(this.deps, b, async () => {
                  need(await ui.svc.server.member(rid, ui.me() ?? '', { status: 'left' }));
                  await ui.refresh();
                  this.host.go('#/people');
                });
            });
          }}
          >${T('leave')}</noema-button
        >
      </div>
    </div>`;
  }
}

/** #/join/<code>: the group before joining, then Join */
export class NoemaJoinPage extends CommunityScreen<SocialScreenDeps> {
  static override properties = { ...CommunityScreen.properties, code: { type: String } };
  declare code: string;
  #group: Row | null | undefined = undefined;

  constructor() {
    super();
    this.code = '';
  }
  get #ui(): SocialScreenDeps['ui'] {
    return this.deps.ui;
  }
  override connectedCallback(): void {
    super.connectedCallback();
    styles(this.ownerDocument);
    if (!this.#ui.on()) return;
    void this.#ui.svc.server.peek(this.code).then(r => {
      const g = r.ok ? r.value : null;
      if (g && ['owner', 'admin', 'member'].includes(txt(g['mine']))) {
        this.host.go('#/chat/' + txt(g['id']));
        return;
      }
      this.#group = g;
      this.requestUpdate();
    });
  }
  protected override chrome(): ScreenChrome {
    const T = (k: string): string => this.#ui.T(k);
    return { tab: 'people', crumbs: [{ label: T('title'), href: '#/people' }, { label: T('joinLink') }], back: '#/people' };
  }
  override render(): TemplateResult {
    const ui = this.#ui,
      T = (k: string, p?: P): string => ui.T(k, p),
      g = this.#group;
    if (!ui.on()) return signedOut(this.deps, '');
    if (g === undefined) return html`<div class="nc so-view"><p class="nc-muted">${T('loading')}</p></div>`;
    if (!g)
      return html`<div class="nc so-view">
        <div class="nc-panel nc-empty">
          ${this.host.face('breathe') ?? nothing}
          <p>${T('err.badLink')}</p>
        </div>
      </div>`;
    const name = txt(g['name']);
    return html`<div class="nc so-view">
      <div class="nc-panel so-joincard">
        <div class="so-grouptop">
          ${face(g['emoji'], name, txt(g['id']))}
          <div class="nc-grow">
            <h1>${name}</h1>
            <p class="nc-tiny nc-muted">
              ${[txt(g['course']), txt(g['university']), T('membersN', { n: Number(g['members']) || 0 })].filter(Boolean).join(' · ')}
            </p>
          </div>
        </div>
        ${g['about'] ? html`<p>${txt(g['about'])}</p>` : nothing}
        <p class="nc-tiny nc-muted">${T('joinLead')}</p>
        <div class="nc-row">
          <noema-button
            class="so-joinnow"
            variant="primary"
            @click=${(e: Event) =>
              void act(this.deps, e.currentTarget, async () => {
                const id = txt(need(await ui.svc.server.join(this.code)));
                await ui.refresh();
                this.host.go('#/chat/' + id);
              })}
            >${T('join')}</noema-button
          >
          <noema-button
            variant="quiet"
            @click=${() => {
              this.host.go('#/people');
            }}
            >${T('cancel')}</noema-button
          >
        </div>
      </div>
    </div>`;
  }
}

/** the buttons of someone's page (#/u/<id>): message them, ask them to be buddies (or answer) */
export class NoemaPersonActions extends CommunityElement<SocialScreenDeps> {
  static override properties = { ...CommunityElement.properties, person: { type: String } };
  declare person: string;
  #off: (() => void) | null = null;
  constructor() {
    super();
    this.person = '';
  }
  override connectedCallback(): void {
    super.connectedCallback();
    styles(this.ownerDocument);
    const ui = this.deps.ui;
    this.#off = ui.onChange(() => {
      this.requestUpdate();
    });
    ui.refresh().catch(() => undefined);
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#off?.();
    this.#off = null;
  }
  override render(): TemplateResult {
    const ui = this.deps.ui,
      x = this.person,
      svc = ui.svc,
      T = (k: string, p?: P): string => ui.T(k, p);
    if (!ui.on() || x === ui.me()) return html``;
    const st = ui.bond(x);
    return html`<div class="nc-row so-pageacts">
      ${
        st !== 'blocked'
          ? html`<noema-button
              size="sm"
              variant="primary"
              @click=${(e: Event) =>
                void act(this.deps, e.currentTarget, async () => {
                  this.host.go('#/chat/' + need(await svc.server.dm(x)));
                })}
              >${icon('chat')}<span>${T('message')}</span></noema-button
            >`
          : nothing
      }
      ${
        st === 'none'
          ? html`<noema-button
              size="sm"
              variant="secondary"
              @click=${(e: Event) =>
                void act(this.deps, e.currentTarget, async () => {
                  need(await svc.server.ask(x));
                  this.toast(T('asked', { name: ui.nameOf(x) }), 3500);
                  await ui.refresh();
                })}
              >${icon('people')}<span>${T('ask')}</span></noema-button
            >`
          : st === 'theyAsked'
            ? html`<noema-button
                size="sm"
                variant="secondary"
                @click=${(e: Event) =>
                  void act(this.deps, e.currentTarget, async () => {
                    need(await svc.server.answer(x, true));
                    await ui.refresh();
                  })}
                >${T('accept')}</noema-button
              >`
            : html`<span class="nc-tiny nc-muted">${T('bond.' + st)}</span>`
      }
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'noema-group-page': NoemaGroupPage;
    'noema-join-page': NoemaJoinPage;
    'noema-person-actions': NoemaPersonActions;
  }
}
