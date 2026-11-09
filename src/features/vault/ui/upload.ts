/**
 * 🗄️ Sharing files (docs/VAULT.md §3): several at once, each checked by its first bytes against the formats, the size and
 * the quota (refused ones stay in the list with the reason); a title for each (from its name, editable); the form of
 * their place and contents; who sees them (everybody, or one of my study groups); the rules ticked. Anonymous by default.
 */
import { html, nothing, type TemplateResult } from 'lit';
import { openDialog } from '../../community/ui/dialogs.ts';
import { CommunityElement } from '../../community/ui/screen.ts';
import { ACCEPT, MAX_FILE_MB, QUOTA } from '../domain/index.ts';
import type { NoemaVaultForm, VaultScreenDeps } from './form.ts';

interface Item {
  readonly file: File;
  title: string;
  readonly problem: string;
}

export class NoemaVaultUpload extends CommunityElement<VaultScreenDeps> {
  static override properties = { ...CommunityElement.properties, room: { type: String } };
  declare room: string;
  /** called after files went up (the page reads the list again) */
  onDone: () => void = () => undefined;
  close: () => void = () => undefined;

  #items: Item[] = [];
  #used = 0;
  #err = '';
  #busy = '';
  #over = false;

  constructor() {
    super();
    this.room = '';
  }
  override connectedCallback(): void {
    super.connectedCallback();
    const ui = this.deps.ui;
    this.#used = ui
      .cached()
      .filter(f => f.mine)
      .reduce((a, f) => a + (f.size ?? 0), 0);
    // the files sent in conversations count too
    void ui.d.usedBytes().then(n => {
      if (n != null) {
        this.#used = n;
        this.requestUpdate();
      }
    });
  }
  #T(k: string, p?: Record<string, string | number>): string {
    return this.deps.ui.T(k, p);
  }
  get #form(): NoemaVaultForm | null {
    return this.querySelector('noema-vault-form');
  }

  async #add(list: readonly File[]): Promise<void> {
    for (const file of list) {
      if (this.#items.some(x => x.file.name === file.name && x.file.size === file.size)) continue;
      const pending = this.#items.filter(x => !x.problem).reduce((a, x) => a + x.file.size, 0);
      this.#items.push({
        file,
        title: file.name
          .replace(/\.[a-z0-9]{1,5}$/i, '')
          .replace(/_+/g, ' ')
          .trim(),
        problem: await this.deps.ui.checkFile(file, this.#used + pending),
      });
    }
    this.requestUpdate();
    await this.updateComplete;
    this.#form?.suggest();
  }

  async #send(): Promise<void> {
    const ui = this.deps.ui,
      T = (k: string, p?: Record<string, string | number>): string => this.#T(k, p);
    this.#err = '';
    const good = this.#items.filter(x => !x.problem);
    const r = this.#form?.read();
    if (!r) return;
    const why = !good.length
      ? T('needFile')
      : 'error' in r
        ? r.error
        : !this.querySelector<HTMLInputElement>('.vt-rules')?.checked
          ? T('needRules')
          : good.some(x => !x.title.trim())
            ? T('needTitle')
            : '';
    if (why || 'error' in r) {
      this.#err = why;
      this.requestUpdate();
      return;
    }
    const where = this.querySelector<HTMLSelectElement>('.vt-where')?.value ?? '';
    let n = 0;
    for (const x of good) {
      this.#busy = T('uploading', { i: n + 1, n: good.length });
      this.requestUpdate();
      const pages = /\.pdf$/i.test(x.file.name) ? await ui.d.host.pdfPages(x.file) : null;
      const up = await ui.d.vault.upload(
        { ...r.meta, title: x.title.trim().slice(0, 160), pages, ...(where ? { room: where } : {}) },
        { name: x.file.name, size: x.file.size, blob: x.file },
      );
      if (!up.ok) {
        this.#busy = '';
        if (n) this.onDone();
        this.#err = T('failed', { name: x.file.name, why: this.i18n.err(up.error) });
        this.requestUpdate();
        return;
      }
      n++;
      this.#used += x.file.size;
      this.#items = this.#items.filter(y => y !== x);
    }
    this.#busy = '';
    this.close();
    this.toast(T('uploaded', { n }), 4000);
    this.onDone();
  }

  override render(): TemplateResult {
    const ui = this.deps.ui,
      T = (k: string, p?: Record<string, string | number>): string => this.#T(k, p);
    const groups = ui.groups;
    const room = groups.some(g => g.id === this.room) ? this.room : '';
    const drop = (e: DragEvent): void => {
      e.preventDefault();
      this.#over = false;
      void this.#add([...(e.dataTransfer?.files ?? [])]);
    };
    return html`<p class="nc-tiny nc-muted">${T('uploadLead')}</p>
      <label
        class="vt-drop ${this.#over ? 'on' : ''}"
        @dragover=${(e: DragEvent) => {
          e.preventDefault();
          if (!this.#over) {
            this.#over = true;
            this.requestUpdate();
          }
        }}
        @dragleave=${() => {
          this.#over = false;
          this.requestUpdate();
        }}
        @drop=${drop}
      >
        <input
          type="file"
          multiple
          accept=${ACCEPT}
          class="vt-pick"
          @change=${(e: Event) => {
            const i = e.target as HTMLInputElement;
            const files = [...(i.files ?? [])];
            i.value = '';
            void this.#add(files);
          }}
        />
        <span>${T('chooseFiles')}</span><small>${T('dragHere')}</small>
      </label>
      <p class="nc-tiny nc-muted vt-formats">${T('formats', { mb: MAX_FILE_MB })}</p>
      <ul class="vt-files">
        ${this.#items.map(
          (x, i) =>
            html`<li class=${x.problem ? 'bad' : ''}>
              ${
                x.problem
                  ? html`<span>${x.file.name}</span>`
                  : html`<input
                      class="nc-input vt-title"
                      aria-label=${T('fileTitle')}
                      maxlength="160"
                      .value=${x.title}
                      @input=${(e: Event) => {
                        x.title = (e.target as HTMLInputElement).value;
                      }}
                      @change=${() => this.#form?.suggest()}
                    />`
              }
              <span class="nc-tiny">${ui.mb(x.file.size)}</span>
              ${x.problem ? html`<span class="nc-tiny vt-problem">${x.problem}</span>` : nothing}
              <noema-button
                variant="quiet"
                size="sm"
                aria-label=${T('removeFile', { name: x.file.name })}
                title=${T('removeFile', { name: x.file.name })}
                @click=${() => {
                  this.#items.splice(i, 1);
                  this.requestUpdate();
                }}
                >✕</noema-button
              >
            </li>`, // i18n-ignore (✕)
        )}
      </ul>
      <div class="nc-tiny nc-muted vt-quota">${T('quota', { used: ui.mb(this.#used), max: ui.mb(QUOTA), mb: MAX_FILE_MB })}</div>
      <noema-vault-form
        .deps=${this.deps}
        .text=${() =>
          this.#items
            .filter(x => !x.problem)
            .map(x => x.title)
            .join(' · ')}
      ></noema-vault-form>
      ${
        groups.length
          ? html`<label class="vt-fld vt-wherefld"
              ><span class="vt-lb">${T('shareWith')}</span>
              <select class="nc-input vt-where" aria-label=${T('shareWith')}>
                <option value="" ?selected=${!room}>${T('everyone')}</option>
                ${groups.map(g => html`<option value=${g.id} ?selected=${g.id === room}>${T('onlyGroup', { name: g.name })}</option>`)}
              </select></label
            >`
          : nothing
      }
      <label class="nc-check vt-rulesrow"><input type="checkbox" class="vt-rules" /> ${T('rules')}</label>
      <p class="nc-err vt-err" role="alert">${this.#err}</p>
      <div class="nc-row end">
        <noema-button
          variant="secondary"
          @click=${() => {
            this.close();
          }}
          >${T('cancel')}</noema-button
        >
        <noema-button class="vt-go" variant="primary" ?disabled=${!!this.#busy} @click=${() => void this.#send()}
          >${this.#busy || T('uploadBtn')}</noema-button
        >
      </div>`;
  }
}

/** ⬆ the upload dialog (room: the study group whose folder is open, if any) */
export function openUpload(deps: VaultScreenDeps, onDone: () => void, room = ''): void {
  const doc = globalThis.document;
  const el = doc.createElement('noema-vault-upload');
  el.deps = deps;
  el.room = room;
  el.onDone = onDone;
  const d = openDialog(deps, { heading: deps.ui.T('uploadTitle'), cls: 'vt-upload', wide: true, content: el });
  el.close = () => {
    d.close();
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'noema-vault-upload': NoemaVaultUpload;
  }
}
