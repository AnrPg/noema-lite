/**
 * 👥 #/chat/<room> — one conversation (docs/SOCIAL.md §3): the messages by day (in a group, who wrote, at the start of
 * their run), Enter sends, "+" attaches a file (checked by its first bytes before it leaves the device), one of my
 * subjects (its pack, as a file of the room), one of my Roadmaps, or a vault file; each message's ⋮ edits, deletes,
 * copies, reports. Read up to the newest message on screen; polled every 4 s while visible. An invitation shows first.
 */
import { html, nothing, type PropertyValues, type TemplateResult } from 'lit';
import type { Attachment } from '../../../ports/social.ts';
import { icon, type IconName } from '../../../ui/kit/icons.ts';
import { ask, openDialog } from '../../community/ui/dialogs.ts';
import { copyText, download, mb, when } from '../../community/ui/format.ts';
import type { ChromeMenuItem, HostRoadmap, HostSubject, ScreenChrome } from '../../community/ui/host.ts';
import { CommunityScreen } from '../../community/ui/screen.ts';
import { adopt, COMMON } from '../../community/ui/styles.ts';
import { SEARCH_CSS } from '../../search/ui/styles.ts';
import { ACCEPT, FORMATS, extOf, groupOf } from '../../vault/domain/index.ts';
import { menuOf } from '../../vault/ui/file.ts';
import { VAULT_CSS } from '../../vault/ui/styles.ts';
import { MAX_BODY } from '../domain/index.ts';
import { inviteRow } from './home.ts';
import { txt, type Row } from './model.ts';
import { act, need, openPerson, pickRoadmap, pickSubject, shareRoadmapIn, type SocialScreenDeps } from './parts.ts';
import { SOCIAL_CSS } from './styles.ts';

type P = Record<string, string | number>;
const PAGE = 80;

interface Msg {
  readonly id: string;
  readonly author: string;
  readonly body: string;
  readonly created_at: string;
  readonly edited_at?: string | null;
  readonly deleted?: boolean;
  readonly hidden?: boolean;
  readonly att?: (Attachment & Readonly<Record<string, unknown>>) | null;
}
const asMsg = (r: Row): Msg => r as unknown as Msg;

export class NoemaChatPage extends CommunityScreen<SocialScreenDeps> {
  static override properties = { ...CommunityScreen.properties, room: { type: String } };
  declare room: string;

  #state: 'loading' | 'gone' | 'error' | 'ready' = 'loading';
  #err = '';
  #info: Row | null = null;
  #members: Row[] = [];
  #msgs = new Map<string, Msg>();
  #lastRead = '';
  #earlierDone = false;
  #status = '';
  #box = '';
  #shown = new Map<string, string>(); // a message's file shown in place: its object URL
  #poll: ReturnType<typeof setInterval> | undefined;
  #scroll = false;
  #near = true;

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
  get #dm(): boolean {
    return this.#info?.['kind'] === 'dm';
  }
  get #mine(): Row | undefined {
    return this.#members.find(m => m['user_id'] === this.#ui.me());
  }
  get #other(): string {
    return txt(this.#members.find(m => m['user_id'] !== this.#ui.me())?.['user_id']);
  }
  get #title(): string {
    return this.#dm ? this.#ui.nameOf(this.#other) : txt(this.#info?.['name']);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    adopt(this.ownerDocument, 'search', COMMON, SEARCH_CSS);
    adopt(this.ownerDocument, 'vault', VAULT_CSS);
    adopt(this.ownerDocument, 'social', SOCIAL_CSS);
    if (this.#ui.on()) void this.#load();
  }
  override disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this.#poll);
    for (const u of this.#shown.values()) URL.revokeObjectURL(u);
  }

  async #load(): Promise<void> {
    const ui = this.#ui,
      sv = ui.svc.server,
      rid = this.room;
    const [room, members] = await Promise.all([sv.room(rid), sv.members(rid)]);
    if (!room.ok || !members.ok) {
      this.#state = 'error';
      this.#err = ui.why(!room.ok ? room.error : members.ok ? '' : members.error);
      this.requestUpdate();
      return;
    }
    if (!room.value) {
      this.#state = 'gone';
      this.requestUpdate();
      return;
    }
    this.#info = room.value;
    this.#members = members.value;
    await ui.svc.names(this.#members.map(m => txt(m['user_id'])));
    this.#lastRead = txt(this.#mine?.['last_read']);
    this.#state = 'ready';
    this.chromeChanged();
    if (this.#mine?.['status'] === 'invited') {
      this.requestUpdate();
      return;
    }
    await this.#reload(true);
    if (!this.isConnected) return;
    const doc = this.ownerDocument;
    this.#poll = setInterval(() => {
      if (doc.visibilityState === 'visible') void this.#reload(false);
    }, 4000);
  }
  async #reload(scroll: boolean): Promise<void> {
    const r = await this.#ui.svc.server.latest(this.room, PAGE);
    if (!r.ok || !this.isConnected) return;
    for (const m of r.value.map(asMsg)) this.#msgs.set(m.id, m);
    this.#scroll ||= scroll;
    this.requestUpdate();
  }
  #sorted(): Msg[] {
    return [...this.#msgs.values()].sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  }
  async #earlier(b: EventTarget | null): Promise<void> {
    const list = this.querySelector('.so-msgs');
    await act(this.deps, b, async () => {
      const first = this.#sorted()[0];
      if (!first) return;
      const rows = need(await this.#ui.svc.server.before(this.room, first.created_at, PAGE)).map(asMsg);
      for (const m of rows) this.#msgs.set(m.id, m);
      if (rows.length < PAGE) this.#earlierDone = true;
      const h0 = list?.scrollHeight ?? 0;
      this.requestUpdate();
      await this.updateComplete;
      if (list) list.scrollTop = list.scrollHeight - h0;
    });
  }

  protected override willUpdate(changed: PropertyValues): void {
    super.willUpdate(changed);
    const list = this.querySelector('.so-msgs');
    this.#near = !list || list.scrollHeight - list.scrollTop - list.clientHeight < 80;
  }
  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    const list = this.querySelector('.so-msgs');
    if (list && (this.#scroll || this.#near)) list.scrollTop = list.scrollHeight;
    this.#scroll = false;
    // read up to the newest message on screen
    const newest = this.#sorted().at(-1);
    if (newest && (!this.#lastRead || newest.created_at > this.#lastRead) && this.ownerDocument.visibilityState === 'visible') {
      this.#lastRead = newest.created_at;
      void this.#ui.svc.server.read(this.room, newest.created_at);
      const r = this.#ui.svc.state.inbox.find(x => x.room === this.room);
      if (r) {
        (r as { unread?: number | null }).unread = 0;
        this.#ui.svc.changed();
      }
    }
  }

  /* ---------- the chrome ---------- */
  async #mute(): Promise<void> {
    const m = this.#mine;
    if (!m) return;
    const muted = !m['muted'];
    await act(this.deps, null, async () => {
      need(await this.#ui.svc.server.member(this.room, this.#ui.me() ?? '', { muted }));
      (m as Record<string, unknown>)['muted'] = muted;
      this.toast(this.#T(muted ? 'mutedToast' : 'unmutedToast'), 2500);
      this.chromeChanged();
      this.#ui.refresh().catch(() => undefined);
    });
  }
  protected override chrome(): ScreenChrome {
    const T = (k: string): string => this.#T(k),
      rid = this.room;
    const people = { label: T('title'), href: '#/people' };
    if (this.#state !== 'ready') return { tab: 'people', crumbs: [people, { label: '…' }], back: '#/people' };
    const mute: ChromeMenuItem = { label: T(this.#mine?.['muted'] ? 'unmute' : 'mute'), icon: 'bell', run: () => void this.#mute() };
    const menu: ChromeMenuItem[] = this.#dm
      ? [
          {
            label: this.#ui.nameOf(this.#other),
            sub: T('personSub'),
            icon: 'user',
            run: () => {
              openPerson(this.deps, this.#other);
            },
          },
          mute,
          { label: T('fromVault'), sub: T('fromVaultSub'), icon: 'vault', href: '#/vault' },
        ]
      : [
          { label: T('groupInfo'), sub: T('groupInfoSub'), icon: 'people', href: '#/group/' + rid },
          { label: T('groupFiles'), sub: T('groupFilesSub'), icon: 'vault', href: '#/vault?g=' + rid },
          mute,
        ];
    return { tab: 'people', crumbs: [people, { label: this.#title }], back: '#/people', menu };
  }

  /* ---------- sending ---------- */
  async #send(body: string, att: Attachment | null = null): Promise<boolean> {
    const r = await this.#ui.svc.server.send(this.room, body, att);
    if (!r.ok) {
      this.toast('⚠️ ' + this.#ui.why(r.error), 6000);
      return false;
    }
    if (r.value) {
      const m = asMsg(r.value);
      this.#msgs.set(m.id, m);
    }
    this.#scroll = true;
    this.requestUpdate();
    this.#ui.refresh().catch(() => undefined);
    return true;
  }
  #clearBox(): void {
    this.#box = '';
    const b = this.querySelector<HTMLTextAreaElement>('.so-box');
    if (b) {
      b.value = '';
      b.style.height = 'auto';
    }
  }
  async #sendText(btn: EventTarget | null): Promise<void> {
    const t = this.#box.trim();
    if (!t) return;
    const b = btn instanceof HTMLElement ? (btn as HTMLElement & { disabled: boolean }) : null;
    if (b) b.disabled = true;
    if (await this.#send(t)) this.#clearBox();
    if (b) b.disabled = false;
    this.querySelector<HTMLTextAreaElement>('.so-box')?.focus();
  }
  #busy(name: string): void {
    this.#status = name ? this.#T('sending', { name }) : '';
    this.requestUpdate();
  }
  #pickFile(): void {
    const ui = this.#ui,
      doc = this.ownerDocument;
    const inp = doc.createElement('input');
    inp.type = 'file';
    inp.accept = ACCEPT;
    inp.style.display = 'none';
    inp.onchange = () => {
      const f = inp.files?.[0];
      inp.remove();
      if (!f) return;
      void (async () => {
        const used = await ui.svc.server.usedBytes();
        const bad = await this.deps.vault.checkFile(f, used.ok ? used.value : 0);
        if (bad) {
          this.toast('⚠️ ' + bad, 6000);
          return;
        }
        this.#busy(f.name);
        try {
          const mime = FORMATS[extOf(f.name)]?.mime ?? 'application/octet-stream';
          const path = need(await ui.svc.putFile(this.room, { name: f.name, size: f.size, blob: f }, mime));
          if (!(await this.#send(this.#box.trim(), { kind: 'file', path, name: f.name.slice(0, 200), mime, size: f.size })))
            await ui.svc.dropFile(path);
          else this.#clearBox();
        } catch (e) {
          this.toast('⚠️ ' + ui.why(e), 6000);
        }
        this.#busy('');
      })();
    };
    doc.body.append(inp);
    inp.click();
  }
  async #sendSubject(s: HostSubject): Promise<void> {
    const ui = this.#ui,
      T = (k: string, p?: P): string => this.#T(k, p);
    this.#busy(s.title);
    try {
      const p = await this.host.loadSubject(s.id);
      if (!p?.subject) throw new Error(T('err.noPack'));
      const blob = new File([JSON.stringify(p)], (s.id || 'subject') + '.json', { type: 'application/json' });
      if (blob.size > 20 * 1048576) throw new Error(T('err.packBig', { mb: 20 }));
      const used = await ui.svc.server.usedBytes();
      if ((used.ok ? used.value : 0) + blob.size > 50 * 1048576) throw new Error(T('err.quota', { mb: 50 }));
      const path = need(await ui.svc.putFile(this.room, { name: blob.name, size: blob.size, blob }, 'application/json'));
      const chapters = p.chapters ?? [];
      const sent = await this.#send(this.#box.trim(), {
        kind: 'subject',
        path,
        title: p.subject.title || s.title,
        emoji: p.subject.emoji ?? null,
        size: blob.size,
        counts: {
          chapters: chapters.length,
          exercises: p.counts?.exercises || chapters.reduce((a, ch) => a + (ch.exercises ?? []).length, 0),
        },
      });
      if (!sent) await ui.svc.dropFile(path);
      else this.#clearBox();
    } catch (e) {
      this.toast('⚠️ ' + ui.why(e), 6000);
    }
    this.#busy('');
  }
  async #sendRoadmap(c: HostRoadmap): Promise<void> {
    const title = c.title || c.goal || '';
    this.#busy(title);
    try {
      await shareRoadmapIn(this.deps, this.room, c);
      if (await this.#send(this.#box.trim(), { kind: 'roadmap', id: c.id, title })) this.#clearBox();
    } catch (e) {
      this.toast('⚠️ ' + this.#ui.why(e), 6000);
    }
    this.#busy('');
  }

  /* ---------- one message ---------- */
  #menu(m: Msg): TemplateResult | typeof nothing {
    if (m.deleted) return nothing;
    const ui = this.#ui,
      T = (k: string, p?: P): string => this.#T(k, p),
      mine = m.author === ui.me();
    const items: ChromeMenuItem[] = mine
      ? [
          ...(m.body
            ? [
                {
                  label: T('edit'),
                  icon: 'edit',
                  run: () => {
                    this.#edit(m);
                  },
                },
              ]
            : []),
          { label: T('delete'), icon: 'trash', danger: true, run: () => void this.#delete(m) },
        ]
      : [
          ...(m.body ? [{ label: T('copy'), icon: 'doc', run: () => void this.#copy(m.body) }] : []),
          ...(!this.#dm
            ? [
                {
                  label: ui.nameOf(m.author),
                  sub: T('personSub'),
                  icon: 'user',
                  run: () => {
                    openPerson(this.deps, m.author);
                  },
                },
              ]
            : []),
          {
            label: T('report'),
            icon: 'flag',
            run: () => {
              this.#report(m);
            },
          },
        ];
    return menuOf(T('more'), items, 'so-msgmenu');
  }
  async #copy(text: string): Promise<void> {
    if (await copyText(text)) this.toast(this.#T('copied'), 2500);
  }
  async #delete(m: Msg): Promise<void> {
    const T = (k: string): string => this.#T(k);
    if (!(await ask(this.deps, { text: T('deleteQ'), ok: T('delete'), cancel: T('cancel'), danger: true }))) return;
    await act(this.deps, null, async () => {
      need(await this.#ui.svc.server.remove(m.id));
      const path = m.att?.['path'];
      if (typeof path === 'string') await this.#ui.svc.dropFile(path);
      await this.#reload(false);
    });
  }
  #edit(m: Msg): void {
    const T = (k: string): string => this.#T(k);
    let text = m.body;
    openDialog(this.deps, {
      heading: T('edit'),
      cls: 'so-editdlg',
      render: close =>
        html`<textarea
            class="nc-input"
            rows="4"
            maxlength=${MAX_BODY}
            aria-label=${T('write')}
            .value=${text}
            @input=${(e: Event) => {
              text = (e.target as HTMLTextAreaElement).value;
            }}
          ></textarea>
          <noema-button
            slot="actions"
            variant="secondary"
            @click=${() => {
              close('no');
            }}
            >${T('cancel')}</noema-button
          >
          <noema-button
            slot="actions"
            class="so-saveedit"
            variant="primary"
            @click=${(e: Event) => {
              const x = text.trim();
              if (!x && !m.att) return;
              void act(this.deps, e.currentTarget, async () => {
                need(await this.#ui.svc.server.edit(m.id, x));
                close();
                await this.#reload(false);
              });
            }}
            >${T('save')}</noema-button
          >`,
    });
  }
  #report(m: Msg): void {
    const T = (k: string): string => this.#T(k);
    let reason = 'harassment',
      note = '';
    openDialog(this.deps, {
      heading: T('reportTitle'),
      cls: 'so-reportdlg',
      render: close =>
        html`<p class="nc-tiny nc-muted">${T('reportLead')}</p>
          <select
            class="nc-input so-reason"
            aria-label=${T('reason')}
            @change=${(e: Event) => {
              reason = (e.target as HTMLSelectElement).value;
            }}
          >
            ${['harassment', 'spam', 'live_exam', 'copyright', 'other'].map(r => html`<option value=${r}>${T('reason.' + r)}</option>`)}
          </select>
          <textarea
            class="nc-input"
            rows="3"
            maxlength="600"
            placeholder=${T('reportNote')}
            aria-label=${T('reportNote')}
            @input=${(e: Event) => {
              note = (e.target as HTMLTextAreaElement).value;
            }}
          ></textarea>
          <noema-button
            slot="actions"
            variant="secondary"
            @click=${() => {
              close('no');
            }}
            >${T('cancel')}</noema-button
          >
          <noema-button
            slot="actions"
            class="so-sendreport"
            variant="primary"
            @click=${(e: Event) =>
              void act(this.deps, e.currentTarget, async () => {
                need(await this.#ui.svc.server.report(m.id, reason, note.trim() || null));
                this.toast(T('reportThanks'), 4000);
                close();
                await this.#reload(false);
              })}
            >${T('sendReport')}</noema-button
          >`,
    });
  }

  /* ---------- an attachment ---------- */
  #att(m: Msg): TemplateResult {
    const ui = this.#ui,
      a = m.att,
      T = (k: string, p?: P): string => this.#T(k, p),
      i18n = ui.d.i18n();
    if (!a) return html``;
    const sv = ui.svc.server;
    const path = txt(a['path']),
      name = txt(a['name']),
      mime = txt(a['mime']),
      title = txt(a['title']);
    const head = (ic: TemplateResult, b: string, small: string): TemplateResult =>
      html`<div class="so-atthead">
        ${ic}<span class="nc-grow"><b>${b}</b> <small class="nc-tiny nc-muted">${small}</small></span>
      </div>`;
    const btn = (cls: string, label: string, run: (e: Event) => void, ic?: IconName, variant = 'quiet'): TemplateResult =>
      html`<noema-button class=${cls} size="sm" variant=${variant} @click=${run}
        >${ic ? icon(ic) : nothing}<span>${label}</span></noema-button
      >`;
    if (a.kind === 'file') {
      const g = groupOf(name);
      const get = async (): Promise<File> => new File([need(await sv.download(path, mime))], name, { type: mime });
      const canShow = ['image', 'audio', 'video'].includes(g) || mime === 'application/pdf';
      const url = this.#shown.get(m.id);
      const GI: Readonly<Record<string, IconName>> = {
        image: 'eye',
        audio: 'mic',
        video: 'play',
        slides: 'cards',
        sheet: 'list',
        book: 'book',
      };
      return html`<div class="so-att so-att-file">
        ${head(icon(GI[g] ?? 'doc'), name, mb(i18n, Number(a['size']) || 0))}
        <div class="nc-row">
          ${
            canShow && !url
              ? btn(
                  'so-show',
                  T('show'),
                  e =>
                    void act(this.deps, e.currentTarget, async () => {
                      this.#shown.set(m.id, URL.createObjectURL(await get()));
                      this.requestUpdate();
                    }),
                  'eye',
                )
              : nothing
          }
          ${btn(
            'so-download',
            T('download'),
            e =>
              void act(this.deps, e.currentTarget, async () => {
                download(await get(), name);
              }),
            'download',
          )}
          ${
            ['doc', 'slides', 'text', 'image', 'book'].includes(g)
              ? btn(
                  'so-course',
                  T('makeCourse'),
                  e =>
                    void act(this.deps, e.currentTarget, async () => {
                      this.host.fromSources([await get()]);
                    }),
                  'spark',
                )
              : nothing
          }
        </div>
        ${
          url
            ? html`<div class="so-attprev">
                ${
                  g === 'image'
                    ? html`<img src=${url} alt=${name} />`
                    : g === 'audio'
                      ? html`<audio src=${url} controls></audio>`
                      : g === 'video'
                        ? html`<video src=${url} controls></video>`
                        : html`<iframe src=${url} title=${name}></iframe>`
                }
              </div>`
            : nothing
        }
      </div>`;
    }
    if (a.kind === 'subject') {
      const counts = (a['counts'] ?? {}) as { chapters?: number; exercises?: number };
      return html`<div class="so-att so-att-subject">
        ${head(
          html`<span class="so-emo" aria-hidden="true">${txt(a['emoji']) || '📘'}</span>`, // i18n-ignore (📘: a sign)
          title,
          T('subjectCounts', { ch: counts.chapters ?? 0, ex: counts.exercises ?? 0 }),
        )}
        ${
          m.author === ui.me()
            ? nothing
            : html`<div class="nc-row">
                ${btn('so-addsubj', T('addSubject'), e => void this.#addSubject(e.currentTarget, m), 'plus', 'primary')}
              </div>`
        }
      </div>`;
    }
    if (a.kind === 'roadmap') {
      const id = txt(a['id']),
        have = !!this.host.roadmap(id);
      return html`<div class="so-att so-att-roadmap">
        ${head(icon('map'), title, T('att.roadmap'))}
        <div class="nc-row">
          ${btn(
            'so-openrm',
            have ? T('open') : T('joinRm'),
            e =>
              void act(this.deps, e.currentTarget, async () => {
                if (!this.host.roadmap(id)) {
                  await this.host.joinRoadmap(id, { viaRoom: true });
                  this.toast(T('joinedRm', { title }), 4000);
                }
                this.host.go('#/map/' + encodeURIComponent(id));
              }),
            undefined,
            have ? 'quiet' : 'primary',
          )}
        </div>
      </div>`;
    }
    return html`<div class="so-att so-att-vault">
      ${head(icon('vault'), title, T('att.vault'))}
      <div class="nc-row">
        ${btn('so-openvault', T('open'), () => {
          this.host.go('#/vault?id=' + encodeURIComponent(txt(a['id'])));
        })}
      </div>
    </div>`;
  }
  async #addSubject(b: EventTarget | null, m: Msg): Promise<void> {
    const ui = this.#ui,
      T = (k: string, p?: P): string => this.#T(k, p);
    await act(this.deps, b, async () => {
      const blob = need(await ui.svc.server.download(txt(m.att?.['path']), 'application/json'));
      const p = JSON.parse(await blob.text()) as { subject?: { id: string; title?: string } };
      const sub = p.subject;
      if (!sub) throw new Error(T('err.noPack'));
      const have = await this.host.subjects().catch(() => []);
      const by = ui.nameOf(m.author);
      if (have.some(s => s.id === sub.id))
        sub.id =
          sub.id +
          '-' +
          by
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[^a-z0-9]+/g, '')
            .slice(0, 12) +
          '-' +
          Date.now().toString(36).slice(-4);
      const s = await this.host.importPack(p, { sharedBy: by, sharedAt: new Date().toISOString() });
      this.toast(T('subjectAdded', { title: s.title }), 4000);
      if (await ask(this.deps, { text: T('openNow', { title: s.title }), ok: T('open'), cancel: T('cancel') })) this.host.openSubject(s.id);
    });
  }

  #message(m: Msg, head: boolean): TemplateResult {
    const ui = this.#ui,
      T = (k: string): string => this.#T(k),
      mine = m.author === ui.me(),
      i18n = ui.d.i18n();
    return html`<div class="so-msg ${mine ? 'mine' : ''} ${m.deleted ? 'deleted' : ''} ${head ? 'head' : ''}" data-id=${m.id}>
      ${
        !mine && !this.#dm && head
          ? html`<button
              type="button"
              class="so-author nc-tiny"
              @click=${() => {
                openPerson(this.deps, m.author);
              }}
            >
              ${ui.nameOf(m.author)}
            </button>`
          : nothing
      }
      <div class="so-bubble">
        ${m.deleted ? html`<i class="nc-muted">${T('deletedMsg')}</i>` : nothing}
        ${!m.deleted && m.hidden ? html`<p class="nc-tiny so-hiddennote">${T('hiddenMine')}</p>` : nothing}
        ${!m.deleted && m.body ? html`<p class="so-text">${m.body}</p>` : nothing} ${!m.deleted && m.att ? this.#att(m) : nothing}
        <span class="so-time nc-tiny">${when(i18n, m.created_at, Date.now())}${m.edited_at && !m.deleted ? ' · ' + T('edited') : ''}</span>
      </div>
      ${this.#menu(m)}
    </div>`;
  }

  override render(): TemplateResult {
    const ui = this.#ui,
      T = (k: string, p?: P): string => this.#T(k, p),
      i18n = ui.d.i18n();
    if (!ui.on())
      return html`<div class="nc so-view so-chatview">
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
    if (this.#state === 'loading') return html`<div class="nc so-view so-chatview"><p class="nc-muted">${T('loading')}</p></div>`;
    if (this.#state === 'error')
      return html`<div class="nc so-view so-chatview">
        <div class="nc-panel nc-empty"><p>${this.#err}</p></div>
      </div>`;
    if (this.#state === 'gone')
      return html`<div class="nc so-view so-chatview">
        <div class="nc-panel nc-empty">
          ${this.host.face('breathe') ?? nothing}
          <p>${T('roomGone')}</p>
          <noema-button
            variant="secondary"
            @click=${() => {
              this.host.go('#/people');
            }}
            >${T('title')}</noema-button
          >
        </div>
      </div>`;
    const info = this.#info ?? {},
      joined = this.#members.filter(m => m['status'] === 'joined').length;
    if (this.#mine?.['status'] === 'invited')
      return html`<div class="nc so-view so-chatview">
        <h1>${this.#title}</h1>
        ${inviteRow(this.deps, { room: this.room, name: txt(info['name']), emoji: info['emoji'], members: joined })}
      </div>`;
    const sorted = this.#sorted();
    const kids: TemplateResult[] = [];
    let prevAuthor: string | null = null,
      prevDay = '';
    for (const m of sorted) {
      const day = new Date(m.created_at).toDateString();
      if (day !== prevDay) {
        kids.push(
          html`<div class="so-day nc-tiny nc-muted">
            ${i18n.format.date(m.created_at, { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>`,
        );
        prevDay = day;
        prevAuthor = null;
      }
      kids.push(this.#message(m, prevAuthor !== m.author));
      prevAuthor = m.author;
    }
    const attach: ChromeMenuItem[] = [
      {
        label: T('att.file'),
        sub: T('attFileSub', { mb: 20 }),
        icon: 'upload',
        run: () => {
          this.#pickFile();
        },
      },
      {
        label: T('att.subject'),
        sub: T('attSubjectSub'),
        icon: 'book',
        run: () => void pickSubject(this.deps, s => void this.#sendSubject(s)),
      },
      {
        label: T('att.roadmap'),
        sub: T('attRoadmapSub'),
        icon: 'map',
        run: () => {
          pickRoadmap(this.deps, c => void this.#sendRoadmap(c));
        },
      },
      {
        label: T('att.vault'),
        sub: T('fromVaultSub'),
        icon: 'vault',
        run: () => {
          this.toast(T('fromVaultHow'), 6000);
          this.host.go('#/vault');
        },
      },
    ];
    return html`<div class="nc so-view so-chatview">
      ${
        this.#dm
          ? nothing
          : html`<p class="nc-tiny nc-muted so-grouphead">
              ${[txt(info['course']), txt(info['university']), T('membersN', { n: joined })].filter(Boolean).join(' · ')}
            </p>`
      }
      ${
        this.#msgs.size >= PAGE && !this.#earlierDone
          ? html`<noema-button class="so-earlier" size="sm" variant="quiet" @click=${(e: Event) => void this.#earlier(e.currentTarget)}
              >${T('earlier')}</noema-button
            >`
          : nothing
      }
      <div class="so-msgs" role="log" aria-live="polite" aria-label=${T('messages')}>
        ${kids.length ? kids : html`<p class="nc-muted so-empty">${this.#dm ? T('dmEmpty', { name: this.#title }) : T('groupEmpty')}</p>`}
      </div>
      <div class="nc-tiny nc-muted so-status" role="status">${this.#status}</div>
      <div class="so-composer">
        <noema-menu
          class="ns-menubtn so-attach"
          icon="plus"
          label=${T('attach')}
          @noema-select=${(e: CustomEvent<{ value: string }>) => {
            attach[Number(e.detail.value)]?.run?.();
          }}
        >
          ${attach.map(
            (it, i) => html`<noema-menu-item value=${String(i)} icon=${it.icon ?? ''} sub=${it.sub ?? ''}>${it.label}</noema-menu-item>`,
          )}
        </noema-menu>
        <textarea
          class="nc-input so-box"
          rows="1"
          maxlength=${MAX_BODY}
          placeholder=${T('writePh')}
          aria-label=${T('write')}
          @input=${(e: Event) => {
            const b = e.target as HTMLTextAreaElement;
            this.#box = b.value;
            b.style.height = 'auto';
            b.style.height = String(Math.min(160, b.scrollHeight)) + 'px';
          }}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
              e.preventDefault();
              void this.#sendText(this.querySelector('.so-send'));
            }
          }}
        ></textarea>
        <noema-button
          class="so-send"
          variant="primary"
          aria-label=${T('send')}
          title=${T('send')}
          @click=${(e: Event) => void this.#sendText(e.currentTarget)}
          >${icon('send')}</noema-button
        >
      </div>
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'noema-chat-page': NoemaChatPage;
  }
}
