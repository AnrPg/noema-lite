/**
 * 👥 The people screens' model (docs/SOCIAL.md): who I am, the names and faces of others, the server's refusals in the
 * learner's words, what waits for me (the People button's count), the poll while the page is visible. No Lit and no
 * DOM: the bridge (NoemaCore.community.social) uses it before the screens are loaded, and so do the tests.
 */
import type { KeyValueStore } from '../../../ports/storage.ts';
import type { I18n } from '../../../ports/i18n.ts';
import type { InboxRow, PersonRow } from '../../../ports/social.ts';
import type { CommunityHost } from '../../community/ui/host.ts';
import type { SocialService } from '../application/social.ts';
import { refusalKey, type Bond } from '../domain/index.ts';

export interface SocialUiDeps {
  readonly host: CommunityHost;
  readonly i18n: () => I18n;
  readonly social: SocialService;
  /** this device's store (the first-time note) and this tab's (the tab of #/people) */
  readonly device: KeyValueStore;
  readonly tab: KeyValueStore;
  readonly win: Pick<Window, 'setInterval' | 'clearInterval'> & {
    readonly document: Pick<Document, 'visibilityState' | 'addEventListener'>;
  };
}

/** a row of the server (a room, a member, a message) */
export type Row = Readonly<Record<string, unknown>>;

export class SocialUi {
  readonly d: SocialUiDeps;
  #started = false;

  constructor(d: SocialUiDeps) {
    this.d = d;
  }
  get svc(): SocialService {
    return this.d.social;
  }
  T(k: string, p?: Record<string, string | number>): string {
    return this.d.i18n().t('social.' + k, p);
  }
  /** a cloud account, signed in: the people pages work */
  on(): boolean {
    return this.d.host.account()?.kind === 'cloud' && !!this.d.host.session() && !!this.svc.me();
  }
  me(): string | null {
    return this.svc.me();
  }

  /** the server's refusals in the learner's words (cloud/supabase.sql §12 raises them in English) */
  why(e: unknown): string {
    const m = e instanceof Error ? e.message : e && typeof e === 'object' && 'message' in e ? String(e.message) : String(e);
    const k = refusalKey(m);
    return k ? this.T(k, { mb: 50 }) : this.d.i18n().err(e);
  }

  /* ---------- names and faces ---------- */
  person(x: string): PersonRow | undefined {
    return this.svc.state.names[x];
  }
  nameOf(x: string | null | undefined): string {
    if (!x) return this.T('someone');
    return this.person(x)?.display_name || this.svc.state.inbox.find(r => r.other === x)?.other_name || this.T('someone');
  }
  emojiOf(x: string): string {
    return this.person(x)?.emoji || this.svc.state.inbox.find(r => r.other === x)?.other_emoji || '';
  }
  roomName(r: InboxRow): string {
    return r.kind === 'dm' ? r.other_name || this.T('someone') : r.name || '';
  }
  bond(x: string): Bond {
    return this.svc.bond(x);
  }
  attLabel(kind: unknown): string {
    return kind === 'file' || kind === 'subject' || kind === 'roadmap' || kind === 'vault' ? this.T('att.' + kind) : '';
  }

  /* ---------- the first-time note, the tab ---------- */
  #notedKey(): string {
    return 'noema-social-noted:' + (this.me() ?? '');
  }
  noted(): boolean {
    const r = this.d.device.get(this.#notedKey());
    return !r.ok || r.value === '1';
  }
  markNoted(): void {
    this.d.device.set(this.#notedKey(), '1');
  }
  lastTab(): string {
    const r = this.d.tab.get('noema-social-tab');
    return r.ok && r.value ? r.value : 'chats';
  }
  keepTab(tab: string): void {
    this.d.tab.set('noema-social-tab', tab);
  }

  /* ---------- the state ---------- */
  /** my row: made the first time, kept in step with the account's name and emoji */
  async ensureMe(force = false): Promise<PersonRow> {
    const a = this.d.host.account(),
      s = this.d.host.session();
    const r = await this.svc.ensureMe({ name: a?.name ?? null, emoji: a?.emoji ?? null, email: s?.email ?? null }, force);
    if (!r.ok) throw r.error;
    return r.value;
  }
  async refresh(): Promise<void> {
    if (!this.on()) return;
    const r = await this.svc.refresh();
    if (!r.ok) throw r.error;
  }
  waiting(): number {
    return this.on() ? this.svc.waiting() : 0;
  }
  onChange(f: () => void): () => void {
    return this.svc.onChange(f);
  }
  /** the poll of what waits (every 45 s while the page is visible), from the first cloud start */
  start(): void {
    if (this.#started || !this.on()) return;
    this.#started = true;
    this.ensureMe().catch((e: unknown) => {
      console.warn('[social]', e instanceof Error ? e.message : e); // i18n-ignore (a log)
    });
    const doc = this.d.win.document;
    const tick = (): void => {
      if (doc.visibilityState === 'visible' && this.on()) this.refresh().catch(() => undefined);
    };
    tick();
    this.d.win.setInterval(tick, 45000);
    doc.addEventListener('visibilitychange', tick);
  }
}

/** the text of an unknown value of a row ('' for none) */
export const txt = (x: unknown): string => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '');
