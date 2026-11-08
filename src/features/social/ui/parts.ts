/**
 * 👥 The pieces the people pages share (docs/SOCIAL.md): a person's row (with the one thing to do next) and their sheet,
 * "Send to…" (a conversation, or a buddy without one yet), privacy, the people I blocked, how it works, a new study
 * group, and the pickers of what one may send (one of my subjects, one of my Roadmaps). Sheets and dialogs are the
 * kit's (dialogs.ts); a question that cannot be undone is asked in the app's own dialog.
 */
import { html, nothing, type TemplateResult } from 'lit';
import type { HostRoadmap, HostSubject } from '../../community/ui/host.ts';
import { ask, openDialog } from '../../community/ui/dialogs.ts';
import { face } from '../../community/ui/format.ts';
import type { ScreenBase } from '../../community/ui/screen.ts';
import { icon } from '../../../ui/kit/icons.ts';
import type { Attachment } from '../../../ports/social.ts';
import type { VaultUi } from '../../vault/ui/model.ts';
import { txt, type SocialUi } from './model.ts';

export interface SocialScreenDeps extends ScreenBase {
  readonly ui: SocialUi;
  readonly vault: VaultUi;
}

type P = Record<string, string | number>;

/** runs a button's action: disabled meanwhile, a refusal as a toast in the learner's words → true when it went through */
export async function act(deps: SocialScreenDeps, b: EventTarget | null, fn: () => Promise<unknown>): Promise<boolean> {
  const btn = b instanceof HTMLElement && 'disabled' in b ? (b as HTMLElement & { disabled: boolean }) : null;
  if (btn) btn.disabled = true;
  try {
    await fn();
    return true;
  } catch (e) {
    deps.notify.toast('⚠️ ' + deps.ui.why(e), { ms: 6000 });
    return false;
  } finally {
    if (btn?.isConnected) btn.disabled = false;
  }
}
/** the value of a Result, or its error thrown (a step that `act` runs) */
export function need<T>(r: { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: unknown }): T {
  if (r.ok) return r.value;
  throw r.error;
}

export function personFace(ui: SocialUi, x: string): TemplateResult {
  return face(ui.person(x)?.emoji || ui.emojiOf(x), ui.nameOf(x), x);
}

/** one person: their face and name (opens their sheet) and the one thing to do next */
export function personRow(deps: SocialScreenDeps, x: string, changed: () => void): TemplateResult {
  const ui = deps.ui,
    T = (k: string, p?: P): string => ui.T(k, p),
    st = ui.bond(x),
    p = ui.person(x),
    svc = ui.svc;
  const next: Partial<Record<string, readonly [string, () => Promise<void>]>> = {
    none: [
      T('ask'),
      async () => {
        const r = need(await svc.server.ask(x));
        deps.notify.toast(r === 'buddies' ? T('nowBuddies', { name: ui.nameOf(x) }) : T('asked', { name: ui.nameOf(x) }), { ms: 3500 });
      },
    ],
    theyAsked: [
      T('accept'),
      async () => {
        need(await svc.server.answer(x, true));
        deps.notify.toast(T('nowBuddies', { name: ui.nameOf(x) }), { ms: 3500 });
      },
    ],
    buddies: [
      T('message'),
      async () => {
        deps.host.go('#/chat/' + need(await svc.server.dm(x)));
      },
    ],
  };
  const a = next[st];
  return html`<div class="nc-item so-person" data-person=${x} data-bond=${st}>
    <button
      type="button"
      class="nc-who so-who"
      @click=${() => {
        openPerson(deps, x, changed);
      }}
    >
      ${personFace(ui, x)}<span class="t"
        ><b>${ui.nameOf(x)}</b><small>${[p?.university, st !== 'none' && T('bond.' + st)].filter(Boolean).join(' · ')}</small></span
      >
    </button>
    ${
      a
        ? html`<noema-button
            class="so-act"
            size="sm"
            variant=${st === 'buddies' ? 'quiet' : 'primary'}
            @click=${(e: Event) =>
              void act(deps, e.currentTarget, async () => {
                await a[1]();
                await ui.refresh();
                changed();
              })}
            >${a[0]}</noema-button
          >`
        : nothing
    }
    ${
      st === 'theyAsked'
        ? html`<noema-button
            class="so-decline"
            size="sm"
            variant="quiet"
            @click=${(e: Event) =>
              void act(deps, e.currentTarget, async () => {
                need(await svc.server.answer(x, false));
                await ui.refresh();
                changed();
              })}
            >${T('decline')}</noema-button
          >`
        : nothing
    }
    ${st === 'asked' ? html`<span class="nc-tiny nc-muted">${T('waiting')}</span>` : nothing}
  </div>`;
}

/** someone's sheet: message, ask to be buddies (or answer), their page, unbuddy, block */
export function openPerson(deps: SocialScreenDeps, x: string, changed: () => void = () => undefined): void {
  const ui = deps.ui,
    svc = ui.svc,
    T = (k: string, p?: P): string => ui.T(k, p);
  let page = false;
  void deps.host.publicPage(x).then(r => {
    if (r?.published) {
      page = true;
      d.redraw();
    }
  });
  const done = async (): Promise<void> => {
    await ui.refresh();
    d.close();
    changed();
  };
  const d = openDialog(deps, {
    heading: ui.nameOf(x),
    cls: 'so-sheet so-personsheet',
    placement: 'sheet',
    render: close => {
      const st = ui.bond(x),
        p = ui.person(x);
      return html`<div class="so-personhead">
          ${personFace(ui, x)}
          <p class="nc-tiny nc-muted">${[p?.university, st !== 'none' && T('bond.' + st)].filter(Boolean).join(' · ')}</p>
        </div>
        <div class="nc-row so-personacts">
          ${
            st !== 'blocked'
              ? html`<noema-button
                  class="so-msgbtn"
                  size="sm"
                  variant="primary"
                  @click=${(e: Event) =>
                    void act(deps, e.currentTarget, async () => {
                      const r = need(await svc.server.dm(x));
                      close();
                      deps.host.go('#/chat/' + r);
                    })}
                  >${icon('chat')}<span>${T('message')}</span></noema-button
                >`
              : nothing
          }
          ${
            st === 'none'
              ? html`<noema-button
                  class="so-askbtn"
                  size="sm"
                  variant="secondary"
                  @click=${(e: Event) =>
                    void act(deps, e.currentTarget, async () => {
                      need(await svc.server.ask(x));
                      deps.notify.toast(T('asked', { name: ui.nameOf(x) }), { ms: 3500 });
                      await done();
                    })}
                  >${icon('people')}<span>${T('ask')}</span></noema-button
                >`
              : nothing
          }
          ${
            st === 'theyAsked'
              ? html`<noema-button
                  size="sm"
                  variant="secondary"
                  @click=${(e: Event) =>
                    void act(deps, e.currentTarget, async () => {
                      need(await svc.server.answer(x, true));
                      await done();
                    })}
                  >${T('accept')}</noema-button
                >`
              : nothing
          }
          ${
            st === 'asked'
              ? html`<noema-button
                  size="sm"
                  variant="quiet"
                  @click=${(e: Event) =>
                    void act(deps, e.currentTarget, async () => {
                      need(await svc.unbuddy(x));
                      await done();
                    })}
                  >${T('cancelAsk')}</noema-button
                >`
              : nothing
          }
          ${
            page
              ? html`<noema-button
                  class="so-page"
                  size="sm"
                  variant="quiet"
                  @click=${() => {
                    close();
                    deps.host.go('#/u/' + x);
                  }}
                  >${icon('user')}<span>${T('theirPage')}</span></noema-button
                >`
              : nothing
          }
        </div>
        <div class="nc-row so-personmore">
          ${
            st === 'buddies'
              ? html`<noema-button
                  size="sm"
                  variant="quiet"
                  @click=${(e: Event) => {
                    const b = e.currentTarget;
                    void ask(deps, {
                      text: T('unbuddyQ', { name: ui.nameOf(x) }),
                      ok: T('unbuddy'),
                      cancel: T('cancel'),
                      danger: true,
                    }).then(yes => {
                      if (yes)
                        void act(deps, b, async () => {
                          need(await svc.unbuddy(x));
                          await done();
                        });
                    });
                  }}
                  >${T('unbuddy')}</noema-button
                >`
              : nothing
          }
          ${
            st === 'blocked'
              ? html`<noema-button
                  size="sm"
                  variant="quiet"
                  @click=${(e: Event) =>
                    void act(deps, e.currentTarget, async () => {
                      need(await svc.server.unblock(x));
                      await done();
                    })}
                  >${T('unblock')}</noema-button
                >`
              : html`<noema-button
                  class="so-blockbtn"
                  size="sm"
                  variant="danger"
                  @click=${(e: Event) => {
                    const b = e.currentTarget;
                    void ask(deps, { text: T('blockQ', { name: ui.nameOf(x) }), ok: T('block'), cancel: T('cancel'), danger: true }).then(
                      yes => {
                        if (yes)
                          void act(deps, b, async () => {
                            need(await svc.server.block(x));
                            deps.notify.toast(T('blockedToast', { name: ui.nameOf(x) }), { ms: 4000 });
                            await done();
                          });
                      },
                    );
                  }}
                  >${icon('flag')}<span>${T('block')}</span></noema-button
                >`
          }
        </div>`;
    },
  });
}

/** ✉ "Send to…": one of my conversations, or a buddy without one yet, with an optional line */
export async function openSendTo(deps: SocialScreenDeps, att: Attachment & { readonly title?: string }, title = ''): Promise<void> {
  const ui = deps.ui,
    svc = ui.svc,
    S = svc.state,
    T = (k: string, p?: P): string => ui.T(k, p);
  if (!ui.on()) {
    deps.notify.toast(T('signIn'), { ms: 5000 });
    return;
  }
  await ui.refresh().catch(() => undefined);
  const rooms = S.inbox.filter(r => r.status === 'joined'),
    withRoom = new Set(rooms.filter(r => r.kind === 'dm').map(r => r.other));
  const me = ui.me();
  const buddies = S.buddies
    .filter(b => b.status === 'buddies')
    .map(b => (b.a === me ? b.b : b.a))
    .filter(x => !withRoom.has(x));
  let line = '';
  const go =
    (room: () => Promise<string>, close: () => void) =>
    (e: Event): void =>
      void act(deps, e.currentTarget, async () => {
        const rid = await room();
        need(await svc.server.send(rid, line.trim(), att));
        close();
        deps.notify.toast(T('sent', { title: title || txt(att.title) }), { ms: 3500 });
        ui.refresh().catch(() => undefined);
      });
  openDialog(deps, {
    heading: T('sendTo'),
    cls: 'so-sheet so-sendsheet',
    placement: 'sheet',
    render: close =>
      html`${title ? html`<p class="nc-tiny nc-muted">${T('sendWhat', { title })}</p>` : nothing}
        <input
          class="nc-input so-sendline"
          maxlength="600"
          placeholder=${T('sendLinePh')}
          aria-label=${T('write')}
          @input=${(e: Event) => {
            line = (e.target as HTMLInputElement).value;
          }}
        />
        ${
          rooms.length + buddies.length
            ? html`<div class="nc-list">
                ${rooms.map(
                  r =>
                    html`<button
                      type="button"
                      class="nc-item so-pick"
                      data-room=${r.room}
                      @click=${go(() => Promise.resolve(r.room), close)}
                    >
                      ${face(r.kind === 'dm' ? r.other_emoji : txt(r['emoji']), ui.roomName(r), r.room)}<span class="t"
                        ><b>${ui.roomName(r)}</b><small>${r.kind === 'group' ? T('groupWord') : T('buddyWord')}</small></span
                      ><span class="chev" aria-hidden="true">${icon('forward')}</span>
                    </button>`,
                )}
                ${buddies.map(
                  x =>
                    html`<button
                      type="button"
                      class="nc-item so-pick"
                      data-person=${x}
                      @click=${go(async () => need(await svc.server.dm(x)), close)}
                    >
                      ${personFace(ui, x)}<span class="t"><b>${ui.nameOf(x)}</b><small>${T('buddyWord')}</small></span
                      ><span class="chev" aria-hidden="true">${icon('forward')}</span>
                    </button>`,
                )}
              </div>`
            : html`<p class="nc-muted">${T('noOneYet')}</p>`
        }`,
  });
}

/** 🔒 privacy: findable by name, who may message or invite me */
export async function openPrivacy(deps: SocialScreenDeps): Promise<void> {
  const ui = deps.ui,
    T = (k: string, p?: P): string => ui.T(k, p);
  let m;
  try {
    m = await ui.ensureMe();
  } catch (e) {
    deps.notify.toast('⚠️ ' + ui.why(e), { ms: 6000 });
    return;
  }
  let findable = m.findable !== false,
    from = m.dm_from ?? 'buddies';
  const d = openDialog(deps, {
    heading: T('privacy'),
    cls: 'so-sheet so-privacy',
    placement: 'sheet',
    render: close =>
      html`<p class="nc-tiny">${T('shownAs', { name: m.display_name ?? '' })}</p>
        <label class="so-findsw nc-check">
          <input
            type="checkbox"
            class="so-findable"
            .checked=${findable}
            @change=${(e: Event) => {
              findable = (e.target as HTMLInputElement).checked;
            }}
          />
          <span><b>${T('findable')}</b><br /><small class="nc-muted">${T('findableSub')}</small></span>
        </label>
        <span class="vt-lb">${T('dmFrom')}</span>
        <p class="nc-tiny nc-muted">${T('dmFromSub')}</p>
        <div class="nc-seg so-dmfrom" role="radiogroup" aria-label=${T('dmFrom')}>
          ${(['buddies', 'everyone', 'nobody'] as const).map(
            k =>
              html`<button
                type="button"
                class=${from === k ? 'on' : ''}
                role="radio"
                aria-checked=${String(from === k)}
                data-v=${k}
                @click=${() => {
                  from = k;
                  d.redraw();
                }}
              >
                ${T('from.' + k)}
              </button>`,
          )}
        </div>
        <noema-button
          slot="actions"
          class="so-saveprivacy"
          variant="primary"
          @click=${(e: Event) =>
            void act(deps, e.currentTarget, async () => {
              need(await ui.svc.savePrivacy({ findable, dm_from: from }));
              ui.markNoted();
              deps.notify.toast(T('saved'), { ms: 2000 });
              close();
            })}
          >${T('save')}</noema-button
        >`,
  });
}

/** the people I blocked (each can be unblocked) */
export async function openBlocked(deps: SocialScreenDeps): Promise<void> {
  const ui = deps.ui,
    svc = ui.svc,
    T = (k: string, p?: P): string => ui.T(k, p);
  await ui.refresh().catch(() => undefined);
  await svc.names(svc.state.blocks);
  const d = openDialog(deps, {
    heading: T('blocked'),
    cls: 'so-sheet so-blockedlist',
    placement: 'sheet',
    render: () =>
      html`<p class="nc-tiny nc-muted">${T('blockedLead')}</p>
        ${
          svc.state.blocks.length
            ? html`<div class="nc-list">
                ${svc.state.blocks.map(
                  x =>
                    html`<div class="nc-item">
                      ${personFace(ui, x)}<span class="t"><b>${ui.nameOf(x)}</b></span>
                      <noema-button
                        size="sm"
                        variant="quiet"
                        @click=${(e: Event) =>
                          void act(deps, e.currentTarget, async () => {
                            need(await svc.server.unblock(x));
                            await ui.refresh();
                            d.redraw();
                          })}
                        >${T('unblock')}</noema-button
                      >
                    </div>`,
                )}
              </div>`
            : html`<p class="nc-muted">${T('blockedNone')}</p>`
        }`,
  });
}

export function openAbout(deps: SocialScreenDeps): void {
  const T = (k: string, p?: P): string => deps.ui.T(k, p);
  openDialog(deps, {
    heading: T('howItWorks'),
    cls: 'so-sheet',
    placement: 'sheet',
    render: () => html`${['about1', 'about2', 'about3', 'about4'].map(k => html`<p>${T(k, { mb: 50 })}</p>`)}`,
  });
}

/** the fields of a study group (a new one, or editing it) */
const GROUP_FIELDS = [
  ['g.name', 'name', 80, false],
  ['g.about', 'about', 600, true],
  ['g.university', 'university', 120, false],
  ['g.course', 'course', 160, false],
  ['g.emoji', 'emoji', 4, false],
] as const;

/** 👥 a new study group (room undefined), or a group's details edited; done(id) after it was saved */
export function openGroupForm(deps: SocialScreenDeps, room: Readonly<Record<string, unknown>> | null, done: (id: string) => void): void {
  const ui = deps.ui,
    svc = ui.svc,
    T = (k: string, p?: P): string => ui.T(k, p);
  const v: Record<string, string> = Object.fromEntries(GROUP_FIELDS.map(([, k]) => [k, room ? txt(room[k]) : '']));
  let err = '';
  const d = openDialog(deps, {
    heading: room ? T('edit') : T('newGroup'),
    cls: 'so-groupdlg',
    render: close =>
      html`${room ? nothing : html`<p class="nc-tiny nc-muted">${T('newGroupLead')}</p>`}
        ${GROUP_FIELDS.map(
          ([label, k, max, area]) =>
            html`<label class="vt-fld so-gfld so-gf-${k}"
              ><span class="vt-lb">${T(label) + (k === 'name' ? ' *' : '')}</span>${
                area
                  ? html`<textarea
                      class="nc-input"
                      data-k=${k}
                      rows="2"
                      maxlength=${max}
                      .value=${v[k] ?? ''}
                      @input=${(e: Event) => {
                        v[k] = (e.target as HTMLTextAreaElement).value;
                      }}
                    ></textarea>`
                  : html`<input
                      class="nc-input"
                      data-k=${k}
                      maxlength=${max}
                      .value=${v[k] ?? ''}
                      @input=${(e: Event) => {
                        v[k] = (e.target as HTMLInputElement).value;
                      }}
                    />`
              }</label
            >`,
        )}
        <p class="nc-err" role="alert">${err}</p>
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
          class=${room ? 'so-savegroup' : 'so-create'}
          variant="primary"
          @click=${(e: Event) => {
            const patch = Object.fromEntries(GROUP_FIELDS.map(([, k]) => [k, (v[k] ?? '').trim() || null]));
            if (!patch['name'] || patch['name'].length < 2) {
              err = T('needName');
              d.redraw();
              return;
            }
            void act(deps, e.currentTarget, async () => {
              const id = room ? txt(room['id']) : need(await svc.server.createGroup(patch));
              if (room) need(await svc.server.setRoom(id, patch));
              close();
              await ui.refresh();
              done(id);
            });
          }}
          >${room ? T('save') : T('create')}</noema-button
        >`,
  });
}

/** one of my subjects (not a language course) → done(subject) */
export async function pickSubject(deps: SocialScreenDeps, done: (s: HostSubject) => void): Promise<void> {
  const T = (k: string): string => deps.ui.T(k);
  const list = (await deps.host.subjects().catch(() => [])).filter(s => s.kind !== 'language' && !s.id.startsWith('lang:'));
  openDialog(deps, {
    heading: T('att.subject'),
    cls: 'so-sheet so-picksheet',
    placement: 'sheet',
    render: close =>
      list.length
        ? html`<div class="nc-list">
            ${list.map(
              s =>
                html`<button
                  type="button"
                  class="nc-item so-pick"
                  data-id=${s.id}
                  @click=${() => {
                    close();
                    done(s);
                  }}
                >
                  ${face(s.emoji, s.title, s.id)}<span class="t"
                    ><b>${s.title}</b>${s.description ? html`<small>${s.description}</small>` : nothing}</span
                  ><span class="chev" aria-hidden="true">${icon('forward')}</span>
                </button>`,
            )}
          </div>`
        : html`<p class="nc-muted">${T('noSubjects')}</p>`,
  });
}

/** one of my Roadmaps that I may share (mine, or a public one I joined) → done(roadmap) */
export function pickRoadmap(deps: SocialScreenDeps, done: (c: HostRoadmap) => void): void {
  const T = (k: string): string => deps.ui.T(k);
  const list = deps.host.roadmaps().filter(c => c.shared?.role !== 'member' || c.shared.public);
  openDialog(deps, {
    heading: T('att.roadmap'),
    cls: 'so-sheet so-picksheet',
    placement: 'sheet',
    render: close =>
      html`<p class="nc-tiny nc-muted">${T('roadmapLead')}</p>
        ${
          list.length
            ? html`<div class="nc-list">
                ${list.map(
                  (c, i) =>
                    html`<button
                      type="button"
                      class="nc-item so-pick"
                      data-id=${c.id}
                      @click=${() => {
                        close();
                        done(c);
                      }}
                    >
                      <span class="nc-ico" style="--bgc: var(--t${(i % 4) + 1}); --fgc: var(--t${(i % 4) + 1}i)" aria-hidden="true"
                        >${icon('map')}</span
                      ><span class="t"><b>${c.title || c.goal}</b></span
                      ><span class="chev" aria-hidden="true">${icon('forward')}</span>
                    </button>`,
                )}
              </div>`
            : html`<p class="nc-muted">${T('noRoadmaps')}</p>`
        }`,
  });
}

/** a Roadmap into a room: published privately first when it is not shared yet (a member's copy of another's is refused) */
export async function shareRoadmapIn(deps: SocialScreenDeps, rid: string, c: HostRoadmap): Promise<void> {
  const ui = deps.ui;
  if (!c.shared) await deps.host.publishRoadmap(c.id, { isPublic: false });
  else if (c.shared.role === 'member' && !c.shared.public)
    throw new Error(ui.T('err.notYourRoadmap', { owner: c.shared.ownerName || ui.T('someone') }));
  need(await ui.svc.server.shareRoadmap(rid, c.id));
}
