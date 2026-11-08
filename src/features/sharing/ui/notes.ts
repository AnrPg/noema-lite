/**
 * 🔔 What the bell lists of sharing: a subject someone wants to share with me, an invitation to a Roadmap (Accept / Join,
 * Reject; ⓘ the subject's details), a new version of something I took (Update / Get it / Review, or Keep mine), a piece of
 * news (✕ clears it; "Clear all" under the list). The same rows show in the subject picker's requests. What happens is
 * the host's (NotesHost over the older Notes: engine/app/community.js); the shared title can be read in the interface
 * language on request (🌐).
 */
import { html, nothing, type TemplateResult } from 'lit';
import { CommunityElement, type ScreenBase } from '../../community/ui/screen.ts';
import type { NoteItem } from '../../community/ui/host.ts';
import { adopt, COMMON } from '../../community/ui/styles.ts';
import { openDialog } from '../../community/ui/dialogs.ts';
import { NOTES_CSS } from './styles.ts';

export type NotesDeps = ScreenBase;
const UPDATES = new Set(['curupdate', 'stepupdate', 'subjupdate']);
const n = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const rec = (x: unknown): Readonly<Record<string, unknown>> => (x && typeof x === 'object' ? (x as Readonly<Record<string, unknown>>) : {});

/** a message whose {who} and {title} are drawn in bold (the words around them stay the catalog's) */
export function richParts(
  text: string,
  marks: Readonly<Record<string, TemplateResult | HTMLElement>>,
): (string | TemplateResult | HTMLElement)[] {
  const keys = Object.keys(marks);
  const out: (string | TemplateResult | HTMLElement)[] = [];
  let rest = text;
  for (;;) {
    let at = -1,
      key = '';
    for (const k of keys) {
      const i = rest.indexOf(`\u0001${k}\u0002`);
      if (i >= 0 && (at < 0 || i < at)) {
        at = i;
        key = k;
      }
    }
    if (at < 0) break;
    out.push(rest.slice(0, at));
    const m = marks[key];
    if (m) out.push(m);
    rest = rest.slice(at + key.length + 2);
  }
  out.push(rest);
  return out.filter(x => x !== '');
}

export class NoemaShareRow extends CommunityElement {
  static override properties = { ...CommunityElement.properties, item: { attribute: false } };
  declare item: NoteItem;
  /** told when a share was accepted (the subject picker opens it) */
  onAccepted:
    ((s: { readonly kind?: string; readonly curriculum?: string; readonly id?: string; readonly title?: string }) => void) | null = null;
  #title: HTMLElement | null = null;
  #mt: HTMLElement | null = null;

  #T(k: string, p?: Record<string, string | number>): string {
    return this.t('loader.' + k, p);
  }
  override connectedCallback(): void {
    super.connectedCallback();
    adopt(this.ownerDocument, 'notes', COMMON, NOTES_CSS);
  }
  /** the title in bold, translatable on request (the personal message is never sent) */
  #titleEl(): HTMLElement {
    if (this.#title) return this.#title;
    const b = this.ownerDocument.createElement('b');
    b.textContent = this.item.title;
    const it = this.item;
    if (!it.kind || it.kind === 'curriculum') {
      this.host.translatable(b, {
        language: it.language ?? (rec(it.meta)['language'] as string | undefined),
        kind: it.kind === 'curriculum' ? 'shared.roadmap' : 'shared.pack',
      });
      this.#mt = this.host.translateBar(b);
    }
    this.#title = b;
    return b;
  }
  #msg(key: string, who: string, p: Record<string, string | number> = {}): (string | TemplateResult | HTMLElement)[] {
    return richParts(this.#T(key, { ...p, who: '\u0001who\u0002', title: '\u0001title\u0002' }), {
      who: html`<b>${who}</b>`,
      title: this.#titleEl(),
    });
  }
  async #act(e: Event, fn: () => Promise<unknown>, done?: (r: unknown) => void): Promise<void> {
    let r: unknown;
    if (
      await this.busy(e.currentTarget, async () => {
        r = await fn();
      })
    )
      done?.(r);
  }

  override render(): TemplateResult {
    const it = this.item,
      notes = this.host.notes;
    if (it.kind === 'notice')
      return html`<div class="nx-req nx-notice">
        <div class="nc-grow">${it.text ?? ''}${it.at ? html`<div class="nc-tiny nc-muted">${this.host.ago(it.at)}</div>` : nothing}</div>
        <noema-icon-button
          class="nx-dismiss"
          icon="close"
          label=${this.#T('note.dismiss')}
          @click=${() => {
            notes.dismiss(it.id);
          }}
        ></noema-icon-button>
      </div>`;
    if (it.kind && UPDATES.has(it.kind)) {
      const k = it.kind;
      const text =
        k === 'curupdate'
          ? [
              ...this.#msg('upd.curChanged', it.from_name || this.#T('upd.owner')),
              html`<div class="nc-tiny nc-muted">
                ${
                  it.lines?.length
                    ? this.#T('upd.curChangesList', { n: n(it.count), lines: it.lines.join(' · ') })
                    : this.#T('upd.curChanges', { n: n(it.count) })
                }
              </div>`,
            ]
          : k === 'stepupdate'
            ? [
                ...this.#msg('upd.stepNew', it.from_name || this.#T('upd.author')),
                html`<div class="nc-tiny nc-muted">${this.#T('upd.stepNewSub', { roadmap: it.curTitle ?? '' })}</div>`,
              ]
            : [
                ...this.#msg('upd.subjNew', it.from_name || this.#T('upd.author')),
                html`<div class="nc-tiny nc-muted">
                  ${this.#T('upd.subjNewSub')}${it.steps ? ' · ' + this.#T('upd.subjSteps', { n: it.steps }) : ''}
                </div>`,
              ];
      const take = (yes: boolean) => (e: Event) =>
        void this.#act(
          e,
          () => notes.update(it, yes),
          () => {
            // 🔎 Review only opens the review: "Not now" there keeps the update waiting
            if (k !== 'curupdate' || !yes)
              this.toast(yes ? this.#T('pack.upToDate', { title: it.title }) : this.#T('upd.kept', { title: it.title }));
          },
        );
      return html`<div class="nx-req nx-update">
        <div class="nc-grow">${text}</div>
        <div class="nx-reqacts">
          <noema-button class="nx-take" size="sm" variant="primary" @click=${take(true)}
            >${this.#T(k === 'curupdate' ? 'upd.review' : k === 'stepupdate' ? 'upd.getIt' : 'upd.update')}</noema-button
          >
          <noema-button class="nx-keep" size="sm" @click=${take(false)}
            >${this.#T(k === 'curupdate' ? 'upd.keepCopy' : 'upd.keepMine')}</noema-button
          >
        </div>
      </div>`;
    }
    const rm = it.kind === 'curriculum',
      c = rec(rec(it.meta)['counts']);
    const quoted = it.message ? ' · ' + this.#T('quoted', { text: it.message }) : '';
    return html`<div class="nx-req" data-share=${it.id}>
      <div class="nc-grow">
        ${
          rm
            ? this.#msg('req.invites', it.from_name || this.#T('req.someone'))
            : this.#msg('req.wantsShare', it.from_name || it.from_email || this.#T('req.someone'))
        }
        ${this.#mt ?? nothing}
        <div class="nc-tiny nc-muted">
          ${
            rm
              ? this.#T('req.invitesSub', { n: n(c['steps']) })
              : this.#T('req.counts', { chapters: n(c['chapters']), exercises: n(c['exercises']) })
          }${quoted}
        </div>
      </div>
      <div class="nx-reqacts">
        ${
          rm
            ? nothing
            : html`<noema-icon-button
                class="nx-details"
                icon="info"
                label=${this.#T('req.details')}
                @click=${() => {
                  this.#details();
                }}
              ></noema-icon-button>`
        }
        <noema-button
          class="nx-accept"
          size="sm"
          variant="primary"
          @click=${(e: Event) =>
            void this.#act(
              e,
              () => notes.accept(it),
              r => {
                const s = rec(r) as { kind?: string; title?: string };
                this.toast(
                  s.kind === 'curriculum'
                    ? this.#T('req.joined', { title: s.title ?? '' })
                    : this.#T('req.accepted', { title: s.title ?? '' }),
                );
                this.onAccepted?.(s);
              },
            )}
          >${this.#T(rm ? 'req.join' : 'req.accept')}</noema-button
        >
        <noema-button
          class="nx-reject"
          size="sm"
          @click=${(e: Event) =>
            void this.#act(
              e,
              () => notes.reject(it),
              () => {
                this.toast(this.#T('req.rejected'));
              },
            )}
          >${this.#T('req.reject')}</noema-button
        >
      </div>
    </div>`;
  }
  /** ⓘ the shared subject's details (its counts, chapters, sources: what Explore shows) */
  #details(): void {
    const it = this.item,
      m = rec(it.meta),
      c = rec(m['counts']);
    const chapters = Array.isArray(m['chapters']) ? (m['chapters'] as unknown[]).map(rec) : [];
    openDialog(this.deps, {
      heading: it.title,
      cls: 'nx-reqinfo',
      placement: 'sheet',
      render: () =>
        html`<p class="nc-muted">${it.from_name ?? ''}</p>
          <p>${this.#T('req.counts', { chapters: n(c['chapters']), exercises: n(c['exercises']) })}</p>
          ${
            chapters.length
              ? html`<ol class="nx-reqchapters">
                  ${chapters.map(ch => html`<li>${typeof ch['title'] === 'string' ? ch['title'] : ''}</li>`)}
                </ol>`
              : nothing
          }`,
    });
  }
}

/** "Clear all" under the bell's list (news only) */
export class NoemaNoticesClear extends CommunityElement {
  override render(): TemplateResult {
    return html`<div class="nc-row nx-noticeclear">
      <noema-button
        size="sm"
        variant="quiet"
        @click=${() => {
          this.host.notes.clear();
        }}
        >${this.t('loader.note.clearAll')}</noema-button
      >
    </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'noema-share-row': NoemaShareRow;
    'noema-notices-clear': NoemaNoticesClear;
  }
}
