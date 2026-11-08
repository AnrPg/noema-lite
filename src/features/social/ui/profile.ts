/**
 * The page others see (docs/PROFILE.md): mine at #/profile (private until I publish it; only the parts I switch on are
 * shown), somebody's at #/u/<id> once they published it, with the buttons to message them or ask them to be buddies.
 * A picture (made small here: a 256 px JPEG, nothing of the original travels), a few words, then progress, treasures,
 * languages, topics and what they share. The words are the frame's (sh.pf*); the data is the host's (ProfileHost).
 */
import { html, nothing, type TemplateResult } from 'lit';
import { icon } from '../../../ui/kit/icons.ts';
import type { NoemaSwitch, NoemaTextField } from '../../../ui/index.ts';
import { openDialog, type DialogHandle } from '../../community/ui/dialogs.ts';
import { copyText, face, langName, pill } from '../../community/ui/format.ts';
import {
  PROFILE_PARTS,
  type MyPage,
  type ProfileCard,
  type ProfileHost,
  type ProfilePart,
  type PublicItem,
  type PublicProfile,
  type ScreenChrome,
} from '../../community/ui/host.ts';
import { CommunityScreen } from '../../community/ui/screen.ts';
import { adopt, COMMON } from '../../community/ui/styles.ts';
import type { SocialScreenDeps } from './parts.ts';
import { PROFILE_CSS } from './styles.ts';

type P = Readonly<Record<string, string | number>>;
/** what the two pages are handed: the people's deps (someone's buttons) and my page's data */
export interface ProfileScreenDeps extends SocialScreenDeps {
  readonly profile: ProfileHost;
}
/** each part: its title and what it shows (sh.*) */
const PART_WORDS: Readonly<Record<ProfilePart, readonly [string, string]>> = {
  progress: ['pfProgress', 'pfProgressSub'],
  achievements: ['pfAch', 'pfAchSub'],
  languages: ['pfLangs', 'pfLangsSub'],
  topics: ['pfTopics', 'pfTopicsSub'],
  shares: ['pfShares', 'pfSharesSub'],
};
/** the treasures as others see them: found, at their full count (src/features/shell/domain/progress.ts) */
const MEDALS: Readonly<Record<string, { readonly key: string; readonly mark: string; readonly n: number; readonly tone: number }>> = {
  step: { key: 'medalStep', mark: '1', n: 1, tone: 1 },
  cards: { key: 'medalCards', mark: '100', n: 100, tone: 4 },
  week: { key: 'medalWeek', mark: '7', n: 7, tone: 2 },
  boss: { key: 'medalBoss', mark: '', n: 1, tone: 3 },
  xp: { key: 'medalXp', mark: '1k', n: 1000, tone: 1 },
  month: { key: 'medalMonth', mark: '30', n: 30, tone: 2 },
};
const tint = (n: number): string => `--bgc: var(--t${String(n)}); --fgc: var(--t${String(n)}i)`;

const styles = (doc: Document): void => {
  adopt(doc, 'profile', COMMON, PROFILE_CSS);
};

/** A picture for the page: square, 256 px, JPEG, small enough to live in the page's row. */
export async function smallPicture(f: File): Promise<string> {
  if (f.size > 15e6) throw new Error('too big');
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image();
      i.onload = () => {
        ok(i);
      };
      i.onerror = () => {
        no(new Error('unreadable'));
      };
      i.src = url;
    });
    const S = 256,
      c = globalThis.document.createElement('canvas');
    c.width = c.height = S;
    const x = c.getContext('2d'),
      m = Math.min(img.naturalWidth, img.naturalHeight);
    if (!x || !m) throw new Error('empty');
    x.fillStyle = '#fff';
    x.fillRect(0, 0, S, S);
    x.drawImage(img, (img.naturalWidth - m) / 2, (img.naturalHeight - m) / 2, m, m, 0, 0, S, S);
    for (const q of [0.85, 0.7, 0.55]) {
      const d = c.toDataURL('image/jpeg', q);
      if (d.length < 190000) return d;
    }
    throw new Error('too big');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** What both pages draw: the picture, the name, the few words, then the parts switched on. */
abstract class ProfileView extends CommunityScreen<ProfileScreenDeps> {
  #shares: { readonly rms: readonly PublicItem[]; readonly subs: readonly PublicItem[] } | null | undefined = undefined;
  #sharesOf = '';

  protected L(k: string, p?: P): string {
    return this.t('sh.' + k, p);
  }
  override connectedCallback(): void {
    super.connectedCallback();
    styles(this.ownerDocument);
  }
  protected avatar(r: { readonly avatar?: string | null; readonly emoji?: string; readonly name?: string }, id: string): TemplateResult {
    return r.avatar
      ? html`<img class="ns-avatar big" src=${r.avatar} alt="" />`
      : html`<span class="pf-face">${face(r.emoji, r.name, id)}</span>`;
  }
  /** someone's (or my) public Roadmaps and subjects, loaded once */
  #loadShares(owner: string): void {
    if (this.#sharesOf === owner) return;
    this.#sharesOf = owner;
    this.#shares = undefined;
    const h = this.host;
    void Promise.all([h.publicRoadmaps().catch(() => []), h.publicSubjects().catch(() => [])]).then(([rms, subs]) => {
      this.#shares = {
        rms: rms.filter(x => x.owner === owner),
        subs: subs.filter(x => x['kind'] === 'public' && x.owner === owner),
      };
      this.requestUpdate();
    });
  }
  #shareList(list: readonly PublicItem[], open: (x: PublicItem) => Promise<void>, rm: boolean): TemplateResult {
    return html`<div class="nc-list">
      ${list.map(
        (x, i) =>
          html`<button class="nc-item pf-share" @click=${(e: Event) => void this.busy(e.currentTarget, () => open(x))}>
            ${
              rm
                ? html`<span class="nc-ico" style=${tint((i % 4) + 1)}>${icon('map')}</span>`
                : html`<span class="nc-ico" style=${tint((i % 4) + 1)} aria-hidden="true">${x.emoji ?? x.title.slice(0, 1)}</span>`
            }
            <span class="nc-grow"
              ><b>${x.title}</b>${x.description ? html`<small class="nc-tiny nc-muted">${x.description}</small>` : nothing}</span
            >
            ${icon('forward')}
          </button>`,
      )}
    </div>`;
  }
  #part(k: ProfilePart, show: PublicProfile['show'], body: () => TemplateResult): TemplateResult | typeof nothing {
    if (!show?.[k]) return nothing;
    return html`<section class="nc-panel pf-part ns-pfpart" data-part=${k}>
      <span class="nc-label">${this.L(PART_WORDS[k][0])}</span>${body()}
    </section>`;
  }
  /** the page itself: mine as others see it, or somebody's */
  protected view(r: PublicProfile, owner: string | null, mine: boolean): TemplateResult {
    const show = r.show ?? {},
      card: ProfileCard = r.card ?? {},
      none = html`<p class="nc-tiny nc-muted">${this.L('pfNone')}</p>`;
    if (show.shares && owner) this.#loadShares(owner);
    const pr = card.progress,
      sh = this.#shares;
    return html`<div class="pf-head ns-pfhead">
        ${this.avatar({ avatar: r.avatar ?? null, emoji: r.emoji ?? '', name: r.display_name ?? '' }, owner ?? '')}
        <div class="nc-grow">
          <h1>${r.display_name || '…'}</h1>
          ${
            r.bio
              ? html`<p class="pf-bio ns-pfbiotext">${r.bio}</p>`
              : mine
                ? html`<p class="nc-tiny nc-muted">${this.L('pfBioPh')}</p>`
                : nothing
          }
        </div>
      </div>
      ${this.#part('progress', show, () =>
        pr
          ? html`<div class="nc-row">
              ${pill(this.L('pfLevel', { lv: pr.level }), 1)} ${pill(this.L('pfXp', { xp: pr.xp }), 2)}
              ${pr.streak ? pill(this.L('streakDays', { n: pr.streak }).replace(/\.$/, ''), 3) : nothing}
              ${pill(this.L('nChapters', { n: pr.chapters }), 4)}
            </div>`
          : none,
      )}
      ${this.#part('achievements', show, () => {
        const found = (card.achievements ?? []).filter(k => k in MEDALS);
        return found.length
          ? html`<div class="ns-medals">
              ${found.map(k => {
                const m = MEDALS[k];
                return m
                  ? html`<div class="ns-medal">
                      <div class="m" style=${tint(m.tone)}>${k === 'boss' ? icon('crown') : m.mark}</div>
                      <small>${this.L(m.key, { n: m.n })}</small>
                    </div>`
                  : nothing;
              })}
            </div>`
          : none;
      })}
      ${this.#part('languages', show, () =>
        card.languages?.length
          ? html`<div class="nc-list">
              ${card.languages.map(
                x =>
                  html`<div class="nc-item">
                    <span class="nc-ico" style=${tint(4)} aria-hidden="true">文A</span>
                    <span class="nc-grow"
                      ><b>${x.title}</b
                      ><small class="nc-tiny nc-muted"
                        >${[
                          (x.languages ?? []).map(c => langName(this.i18n, c)).join(' · '),
                          x.words ? this.L('pfWords', { n: x.words }) : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}</small
                      ></span
                    >
                  </div>`,
              )}
            </div>`
          : none,
      )}
      ${this.#part('topics', show, () =>
        card.topics?.length
          ? html`<div class="nc-list">
              ${card.topics.map(
                (x, i) =>
                  html`<div class="nc-item">
                    ${
                      x.kind === 'roadmap'
                        ? html`<span class="nc-ico" style=${tint((i % 4) + 1)}>${icon('map')}</span>`
                        : html`<span class="nc-ico" style=${tint((i % 4) + 1)} aria-hidden="true">${x.emoji ?? x.title.slice(0, 1)}</span>`
                    }
                    <span class="nc-grow"><b>${x.title}</b></span
                    >${x.pct ? pill(this.i18n.format.number(x.pct) + '%', 2) : nothing}
                  </div>`,
              )}
            </div>`
          : none,
      )}
      ${this.#part('shares', show, () =>
        !owner
          ? none
          : sh === undefined || sh === null
            ? html`<p class="nc-tiny nc-muted">${this.L('loading')}</p>`
            : !sh.rms.length && !sh.subs.length
              ? none
              : html`${
                  sh.rms.length
                    ? html`<span class="nc-tiny nc-muted">${this.L('pfSharedRm')}</span
                        >${this.#shareList(sh.rms, x => this.host.openPublicRoadmap(x), true)}`
                    : nothing
                }
                ${
                  sh.subs.length
                    ? html`<span class="nc-tiny nc-muted">${this.L('pfSharedSubj')}</span
                        >${this.#shareList(sh.subs, x => this.host.studyPublic(x), false)}`
                    : nothing
                }`,
      )}`;
  }
}

/** #/profile: my page, private until I publish it */
export class NoemaProfilePage extends ProfileView {
  #page: MyPage | null = null;
  #card: ProfileCard = {};
  #working = false;

  override connectedCallback(): void {
    super.connectedCallback();
    void this.#load();
  }
  async #load(): Promise<void> {
    const p = this.deps.profile;
    this.#page = await p.load();
    this.#card = await p.card(this.#page.show);
    this.requestUpdate();
    // a published page follows my progress
    if (this.#page.published && p.me()) void p.save(this.#page).catch(() => undefined);
  }
  protected override chrome(): ScreenChrome {
    return { tab: 'me', crumbs: [{ label: this.L('me') }] };
  }
  async #save(p: MyPage, done: string): Promise<boolean> {
    try {
      await this.deps.profile.save(p);
      this.#page = p;
      this.#card = await this.deps.profile.card(p.show);
      this.toast(this.L(done), 2500);
      return true;
    } catch (e) {
      this.toast(this.L('pfCloudErr', { e: e instanceof Error ? e.message : String(e) }), 5000);
      return false;
    } finally {
      this.requestUpdate();
    }
  }
  async #publish(): Promise<void> {
    const p = this.#page;
    if (!p || this.#working) return;
    this.#working = true;
    this.requestUpdate();
    await this.#save({ ...p, published: !p.published }, p.published ? 'pfPrivate' : 'pfPublic');
    this.#working = false;
    this.requestUpdate();
  }
  async #copyLink(uid: string): Promise<void> {
    const url = this.host.link('#/u/' + uid);
    if (await copyText(url)) this.toast(this.L('pfLinkCopied'), 2500);
    else
      openDialog(this.deps, {
        heading: this.L('pfLink'),
        cls: 'pf-linkdlg',
        render: () => html`<p class="pf-link">${url}</p>`,
      });
  }
  override render(): TemplateResult {
    const p = this.#page;
    if (!p) return html`<div class="nc pf-view"><p class="nc-muted">${this.L('loading')}</p></div>`;
    const a = this.host.account(),
      uid = this.deps.profile.me();
    return html`<div class="nc pf-view">
      ${this.view({ display_name: a?.name ?? '', emoji: a?.emoji ?? '', bio: p.bio, avatar: p.avatar, show: p.show, card: this.#card }, uid, true)}
      <div class="pf-foot">
        <p class="pf-state nc-tiny nc-muted">${icon(p.published ? 'globe' : 'lock')} ${this.L(p.published ? 'pfPublic' : 'pfPrivate')}</p>
        ${uid ? nothing : html`<p class="nc-tiny nc-muted">${this.L('pfNeedCloud')}</p>`}
        <div class="nc-row">
          <noema-button
            size="sm"
            variant="secondary"
            data-act="edit"
            @click=${() => {
              this.#edit(p);
            }}
            >${icon('edit')}<span>${this.L('pfEdit')}</span></noema-button
          >
          ${
            uid
              ? html`<noema-button
                  size="sm"
                  variant=${p.published ? 'secondary' : 'primary'}
                  data-act="publish"
                  ?disabled=${this.#working}
                  @click=${() => void this.#publish()}
                  >${icon(p.published ? 'lock' : 'globe')}<span>${this.L(p.published ? 'pfUnpublish' : 'pfPublish')}</span></noema-button
                >`
              : nothing
          }
          ${
            uid && p.published
              ? html`<noema-button size="sm" variant="secondary" data-act="link" @click=${() => void this.#copyLink(uid)}
                  >${icon('link')}<span>${this.L('pfLink')}</span></noema-button
                >`
              : nothing
          }
          <noema-tip topic=${this.L('pfEdit')}>
            ${this.L('pfEditTip')}${uid ? html` ${this.L('pfPublishTip')}` : nothing}${uid && p.published ? html` ${this.L('pfLinkTip')}` : nothing}
          </noema-tip>
        </div>
      </div>
    </div>`;
  }
  /** ✏️ the picture, the few words and what others see */
  #edit(p: MyPage): void {
    let avatar = p.avatar;
    const a = this.host.account();
    const pick = async (e: Event): Promise<void> => {
      const inp = e.currentTarget as HTMLInputElement,
        f = inp.files?.[0];
      inp.value = '';
      if (!f) return;
      try {
        avatar = await smallPicture(f);
        d.redraw();
      } catch {
        this.toast(this.L('pfPhotoBad'), 4000);
      }
    };
    const save = async (e: Event): Promise<void> => {
      const root = d.el,
        bio = (root.querySelector<NoemaTextField>('.pf-bioin')?.value ?? '').trim().slice(0, 600);
      const show: Partial<Record<ProfilePart, boolean>> = {};
      for (const k of PROFILE_PARTS) show[k] = root.querySelector<NoemaSwitch>(`noema-switch[data-part="${k}"]`)?.checked === true;
      const b = e.currentTarget as HTMLElement & { disabled?: boolean };
      b.disabled = true;
      await this.#save({ ...p, bio, avatar, show }, 'pfSaved');
      d.close();
    };
    const d: DialogHandle = openDialog(this.deps, {
      heading: this.L('pfEdit'),
      cls: 'pf-sheet ns-pfsheet',
      placement: 'sheet',
      render: () =>
        html`<div class="pf-edit">
            <div class="nc-row pf-picrow">
              ${this.avatar({ avatar, emoji: a?.emoji ?? '', name: a?.name ?? '' }, a?.id ?? '')}
              <div class="nc-row">
                <noema-button
                  size="sm"
                  variant="secondary"
                  @click=${() => {
                    d.el.querySelector<HTMLInputElement>('.pf-file')?.click();
                  }}
                  >${icon('upload')}<span>${this.L(avatar ? 'pfPhoto' : 'pfPhotoAdd')}</span></noema-button
                >
                ${
                  avatar
                    ? html`<noema-button
                        size="sm"
                        variant="quiet"
                        @click=${() => {
                          avatar = null;
                          d.redraw();
                        }}
                        >${this.L('pfPhotoDel')}</noema-button
                      >`
                    : nothing
                }
              </div>
              <input
                class="pf-file"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                hidden
                @change=${(e: Event) => void pick(e)}
              />
            </div>
            <noema-text-field
              class="pf-bioin"
              multiline
              maxlength="600"
              label=${this.L('pfBio')}
              placeholder=${this.L('pfBioPh')}
              .value=${p.bio}
            ></noema-text-field>
            <span class="nc-label">${this.L('pfShow')}</span>
            <p class="nc-tiny nc-muted">${this.L('pfShowSub')}</p>
            <div class="nc-list pf-switches">
              ${PROFILE_PARTS.map(
                k =>
                  html`<noema-switch
                    class="pf-switch"
                    data-part=${k}
                    ?checked=${!!p.show[k]}
                    label=${this.L(PART_WORDS[k][0])}
                    hint=${this.L(PART_WORDS[k][1])}
                  ></noema-switch>`,
              )}
            </div>
          </div>
          <noema-button slot="actions" variant="primary" data-act="save" @click=${(e: Event) => void save(e)}
            >${this.L('pfDone')}</noema-button
          >`,
    });
  }
}

/** #/u/<id>: somebody's page, once they published it */
export class NoemaPersonProfile extends ProfileView {
  static override properties = { ...ProfileView.properties, person: { type: String } };
  declare person: string;
  #r: PublicProfile | null | undefined = undefined;
  #err = '';

  constructor() {
    super();
    this.person = '';
  }
  override connectedCallback(): void {
    super.connectedCallback();
    if (this.person && this.person === this.deps.profile.me()) {
      this.host.go('#/profile');
      return;
    }
    this.host
      .publicPage(this.person)
      .then(r => {
        this.#r = r;
      })
      .catch((e: unknown) => {
        this.#err = this.L('pfCloudErr', { e: e instanceof Error ? e.message : String(e) });
        this.#r = null;
      })
      .finally(() => {
        this.requestUpdate();
        this.chromeChanged();
      });
  }
  protected override chrome(): ScreenChrome {
    const r = this.#r;
    return { tab: null, crumbs: [{ label: r?.published ? r.display_name || '…' : this.L('me') }], back: '#/discover' };
  }
  override render(): TemplateResult {
    const r = this.#r;
    if (r === undefined) return html`<div class="nc pf-view"><p class="nc-muted">${this.L('loading')}</p></div>`;
    if (!r?.published)
      return html`<div class="nc pf-view">
        <div class="nc-panel nc-empty">
          ${this.#err ? nothing : (this.host.face('breathe') ?? nothing)}
          <p>${this.#err || this.L('pfMissing')}</p>
        </div>
      </div>`;
    return html`<div class="nc pf-view">
      ${this.view(r, this.person, false)}
      ${this.host.session() ? html`<noema-person-actions .deps=${this.deps} person=${this.person}></noema-person-actions>` : nothing}
      ${r.updated_at ? html`<p class="nc-tiny nc-muted">${this.L('pfUpdated', { date: this.i18n.format.date(new Date(r.updated_at)) })}</p>` : nothing}
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'noema-profile-page': NoemaProfilePage;
    'noema-person-profile': NoemaPersonProfile;
  }
}
