/**
 * `noema-schema-form`: a form generated from a JSON Schema (docs/activities-dev/authoring_ui.md). It draws the view its
 * model gives of the value (SchemaFormModel: the authoring port) and hands every edit back to the model, which returns the
 * new value; the value is plain JSON, changed only at the edited path (unknown fields kept). Drawn in the page's own DOM
 * (light DOM), like the shell's screens: the author's page styles it and its suggestions (datalists) live in the page.
 *
 *   <noema-schema-form .form=${model} .value=${spec} .decorate=${fn} @noema-change=${e => e.detail.value}></noema-schema-form>
 *
 * `noema-change` tells {value, structural}. setErrors(list) shows problems at their fields (the nearest field that is drawn)
 * and returns those that have none; focusPath(path) moves the focus to a field. A field whose schema has an authoring hint
 * (x-noema) asks `decorate` for its suggestions list and for what is drawn under it (the author's word boxes, a formula's
 * names and problem).
 */
import { html, nothing, svg, type PropertyValues, type TemplateResult } from 'lit';
import { live } from 'lit/directives/live.js';
import type {
  AltField,
  ArrayField,
  FieldError,
  FieldNode,
  FieldOption,
  FieldPath,
  FormIntent,
  InputField,
  ObjectField,
  SchemaFormModel,
} from '../../../ports/authoring.ts';
import { NoemaElement } from '../../core/element.ts';
import { ICONS } from '../../kit/icons.ts';

/** what an authoring hint adds to its field */
export interface Decoration {
  /** the id of a datalist of suggestions */
  readonly list?: string;
  readonly mono?: boolean;
  /** drawn under the control */
  readonly after?: unknown;
  /** a problem of its own (a formula's), shown under the control and making it invalid */
  readonly error?: { readonly id: string; readonly msg: string } | null;
}
export type Decorate = (hint: string, path: FieldPath, value: string | boolean) => Decoration | null;
export interface SchemaFormChange {
  readonly value: unknown;
  readonly structural: boolean;
}

const key = (p: FieldPath): string => JSON.stringify(p);
const cssEsc = (s: string): string =>
  typeof CSS !== 'undefined' && typeof CSS.escape === 'function' ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&');
let FORMS = 0;

/** a line icon of the form's own controls */
export const formIcon = (k: 'up' | 'down' | 'close' | 'plus'): TemplateResult =>
  html`<svg class="sf-ico" viewBox="0 0 24 24" aria-hidden="true">${svg`<path d=${ICONS[k]}></path>`}</svg>`;

export class NoemaSchemaForm extends NoemaElement {
  static override properties = {
    form: { attribute: false },
    value: { attribute: false },
    decorate: { attribute: false },
  };
  declare form: SchemaFormModel | null;
  declare value: unknown;
  declare decorate: Decorate | null;
  /** errors placed at a drawn field, by the field's path */
  #placed = new Map<string, FieldError[]>();
  /** the words of a value that could not be taken, by the control's path */
  #local = new Map<string, string>();
  /** what is typed in a number or JSON field while it is not the value's own spelling */
  #drafts = new Map<string, string>();
  /** the array items folded */
  #closed = new Set<string>();
  /** the paths whose errors were drawn in this render (the first field of a path takes them) */
  #claimed = new Set<string>();
  #focusNext: FieldPath | null = null;
  #refocus: string | null = null;
  readonly #pre = 'sf' + String(++FORMS) + '-';

  constructor() {
    super();
    this.form = null;
    this.value = null;
    this.decorate = null;
  }

  /** light DOM: the author's page styles the form, and the form's fields use the page's datalists */
  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  /** the value as it is now (a copy) */
  get(): unknown {
    return this.value === undefined ? undefined : (JSON.parse(JSON.stringify(this.value)) as unknown);
  }
  /** a new value (drafts and folds of the old one are forgotten) */
  set(v: unknown): void {
    this.#drafts.clear();
    this.#local.clear();
    this.value = v;
  }

  /** Shows the problems at their fields; → those no drawn field takes (the caller lists them). */
  setErrors(list: readonly FieldError[]): FieldError[] {
    const tree = this.form?.tree(this.value) ?? null;
    const drawn = new Set<string>();
    if (tree) collect(tree, drawn);
    const placed = new Map<string, FieldError[]>(),
      left: FieldError[] = [];
    for (const e of list) {
      let p = [...e.path],
        found = false;
      for (;;) {
        if (drawn.has(key(p))) {
          found = true;
          break;
        }
        if (!p.length) break;
        p = p.slice(0, -1);
      }
      if (!found || (!p.length && !e.path.length)) {
        left.push(e);
        continue;
      }
      const k = key(p);
      placed.set(k, [...(placed.get(k) ?? []), e]);
      this.#closed.delete(k); // a folded item with a problem opens
    }
    this.#placed = placed;
    this.requestUpdate();
    return left;
  }

  /** Moves the focus to the field at path (after the next drawing). */
  focusPath(path: FieldPath): void {
    this.#focusNext = path;
    this.requestUpdate();
  }

  #apply(intent: FormIntent): void {
    if (!this.form) return;
    const r = this.form.apply(this.value, intent);
    const k = key(intent.path);
    if (intent.op === 'input') {
      if (r.error !== undefined) this.#local.set(k, r.error);
      else this.#local.delete(k);
      if ((intent.control === 'number' || intent.control === 'integer' || intent.control === 'json') && typeof intent.raw === 'string')
        this.#drafts.set(k, intent.raw);
      if (r.error !== undefined) {
        this.requestUpdate();
        return;
      }
    }
    if (r.structural) {
      this.#drafts.clear();
      this.#local.clear();
    }
    this.value = r.value;
    if (r.focus) this.#focusNext = r.focus;
    this.emit('noema-change', { value: this.get(), structural: r.structural } satisfies SchemaFormChange);
  }

  protected override willUpdate(): void {
    const a = document.activeElement;
    this.#refocus = a instanceof HTMLElement && this.contains(a) ? a.getAttribute('data-path') : null;
  }
  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    const f = this.#focusNext;
    if (f) {
      this.#focusNext = null;
      const box =
        this.querySelector(`[data-field="${cssEsc(key(f))}"]`) ?? this.querySelector(`[data-path^="${cssEsc(key(f).slice(0, -1))}"]`);
      const t = box && (box.matches('input,select,textarea') ? box : box.querySelector('input,select,textarea,button.sf-tog'));
      if (t instanceof HTMLElement) t.focus();
      return;
    }
    // a field drawn again in a new shape keeps the focus at its path
    const r = this.#refocus;
    if (r && !(document.activeElement instanceof HTMLElement && this.contains(document.activeElement))) {
      const b = this.querySelector(`[data-path="${cssEsc(r)}"]`);
      if (b instanceof HTMLElement) b.focus({ preventScroll: true });
    }
  }

  override render(): TemplateResult {
    this.#claimed = new Set();
    const tree = this.form?.tree(this.value) ?? null;
    return html`<div class="sf">${tree ? this.#field(tree) : nothing}</div>`;
  }

  /* ---------------- drawing ---------------- */
  #T(k: string, vars?: Readonly<Record<string, string | number>>): string {
    return this.form?.text(k, vars) ?? k;
  }
  #id(p: FieldPath, suffix = ''): string {
    return (this.#pre + key(p) + suffix).replace(/\s/g, '_');
  }
  /** the problems placed at a path, once (the first field drawn for it) */
  #errsAt(p: FieldPath): FieldError[] {
    const k = key(p);
    if (this.#claimed.has(k)) return [];
    this.#claimed.add(k);
    return this.#placed.get(k) ?? [];
  }
  #errs(p: FieldPath, list: readonly FieldError[]): TemplateResult[] {
    return list.map((e, i) => html`<p class="sf-err" role="alert" id=${this.#id(p, '$e' + String(i))}>${e.msg}</p>`);
  }
  #ib(icon: 'up' | 'down' | 'close', label: string, onclick: () => void, disabled = false): TemplateResult {
    return html`<button type="button" class="sf-ib" aria-label=${label} title=${label} ?disabled=${disabled} @click=${onclick}>
      ${formIcon(icon)}
    </button>`;
  }
  #remove(p: FieldPath): () => void {
    return () => {
      this.#apply({ op: 'remove', path: p });
    };
  }
  #field(n: FieldNode): TemplateResult {
    switch (n.kind) {
      case 'input':
        return this.#input(n);
      case 'alt':
        return this.#alt(n);
      case 'object':
        return this.#object(n);
      case 'array':
        return this.#array(n);
    }
  }
  #options(opts: readonly FieldOption[], selected: string): TemplateResult[] {
    return opts.map(o => html`<option value=${o.value} .selected=${o.value === selected}>${o.label}</option>`);
  }
  #input(n: InputField): TemplateResult {
    const k = key(n.path),
      id = this.#id(n.path),
      helpId = n.help && !n.bare ? this.#id(n.path, '$h') : '';
    const deco = n.hint && this.decorate ? this.decorate(n.hint, n.path, n.value) : null;
    const local = this.#local.get(k);
    const placed = this.#errsAt(n.path);
    const errIds = [
      ...(local !== undefined ? [this.#id(n.path, '$l')] : []),
      ...(deco?.error ? [deco.error.id] : []),
      ...placed.map((_, i) => this.#id(n.path, '$e' + String(i))),
    ];
    const invalid = errIds.length > 0;
    const describedby = [helpId, ...errIds].filter(Boolean).join(' ') || nothing;
    const name = n.bare ? n.label : nothing;
    const cls = 'sf-in' + (n.mono || deco?.mono ? ' sf-mono' : '');
    const control = (): TemplateResult => {
      const on = (raw: string | boolean): void => {
        this.#apply({ op: 'input', path: n.path, control: n.control, raw });
      };
      const text = (e: Event): string => (e.target as HTMLInputElement).value;
      switch (n.control) {
        case 'select':
          return html`<select
            id=${id}
            class="sf-in"
            data-path=${k}
            aria-label=${name}
            aria-invalid=${invalid ? 'true' : nothing}
            aria-describedby=${describedby}
            @change=${(e: Event) => {
              on(text(e));
            }}
          >
            ${this.#options(n.options ?? [], String(n.value))}
          </select>`;
        case 'checkbox':
          return html`<input
            id=${id}
            type="checkbox"
            class="sf-cb"
            data-path=${k}
            aria-label=${name}
            aria-invalid=${invalid ? 'true' : nothing}
            aria-describedby=${describedby}
            .checked=${live(n.value === true)}
            @change=${(e: Event) => {
              on((e.target as HTMLInputElement).checked);
            }}
          />`;
        case 'textarea':
        case 'json': {
          const json = n.control === 'json';
          return html`<textarea
            id=${id}
            class=${json ? 'sf-in sf-mono sf-json' : cls}
            data-path=${k}
            rows="3"
            spellcheck=${json || n.hint ? 'false' : nothing}
            aria-label=${name}
            aria-invalid=${invalid ? 'true' : nothing}
            aria-describedby=${describedby}
            .value=${live(json ? (this.#drafts.get(k) ?? String(n.value)) : String(n.value))}
            @input=${(e: Event) => {
              on(text(e));
            }}
          ></textarea>`;
        }
        default: {
          const numeric = n.control === 'number' || n.control === 'integer';
          return html`<input
            id=${id}
            type="text"
            inputmode=${numeric ? 'decimal' : nothing}
            class=${numeric ? 'sf-in sf-num' : cls}
            data-path=${k}
            list=${deco?.list ?? nothing}
            autocomplete="off"
            spellcheck=${numeric || n.hint ? 'false' : nothing}
            aria-label=${name}
            aria-invalid=${invalid ? 'true' : nothing}
            aria-describedby=${describedby}
            .value=${live(numeric ? (this.#drafts.get(k) ?? String(n.value)) : String(n.value))}
            @input=${(e: Event) => {
              on(text(e));
            }}
          />`;
        }
      }
    };
    return html`<div class=${'sf-f' + (n.bare ? ' sf-altbody' : '') + (n.unknown ? ' sf-unknown' : '')} data-field=${k}>
      ${
        n.bare
          ? nothing
          : html`<div class="sf-fh">
              <label class="sf-l" for=${id}>${n.label}</label>
              ${n.removable ? this.#ib('close', this.#T('remove', { what: n.label }), this.#remove(n.path)) : nothing}
            </div>`
      }
      ${helpId ? html`<p class="sf-help" id=${helpId}>${n.help}</p>` : nothing} ${control()} ${deco?.after ?? nothing}
      ${deco?.error ? html`<p class="sf-err sf-keep aa-xerr" role="alert" id=${deco.error.id}>${deco.error.msg}</p>` : nothing}
      ${local !== undefined ? html`<p class="sf-err sf-lerr" role="alert" id=${this.#id(n.path, '$l')}>${local}</p>` : nothing}
      ${this.#errs(n.path, placed)}
    </div>`;
  }
  #alt(n: AltField): TemplateResult {
    const k = key(n.path),
      id = this.#id(n.path, '$alt');
    const placed = this.#errsAt(n.path);
    return html`<div class=${'sf-f' + (n.bare ? ' sf-altbody' : '')} data-field=${k}>
      ${
        n.bare
          ? nothing
          : html`<div class="sf-fh">
              <label class="sf-l" for=${id}>${n.label}</label>
              ${n.removable ? this.#ib('close', this.#T('remove', { what: n.label }), this.#remove(n.path)) : nothing}
            </div>`
      }
      ${n.help && !n.bare ? html`<p class="sf-help">${n.help}</p>` : nothing}
      <div class="sf-altrow">
        <select
          id=${id}
          class="sf-in sf-alt"
          data-path=${key([...n.path, '$alt'])}
          aria-label=${this.#T('altOf', { what: n.label })}
          aria-invalid=${placed.length ? 'true' : nothing}
          @change=${(e: Event) => {
            this.#apply({ op: 'alt', path: n.path, option: Number((e.target as HTMLSelectElement).value) });
          }}
        >
          ${this.#options(n.options, n.selected)}
        </select>
        ${n.body ? this.#field(n.body) : nothing}
      </div>
      ${this.#errs(n.path, placed)}
    </div>`;
  }
  #object(n: ObjectField): TemplateResult {
    const d = n.disc;
    const discField = d
      ? (() => {
          const id = this.#id(d.path),
            placed = this.#errsAt(d.path);
          return html`<div class="sf-f" data-field=${key(d.path)}>
            <div class="sf-fh"><label class="sf-l" for=${id}>${d.label}</label></div>
            ${d.help ? html`<p class="sf-help">${d.help}</p>` : nothing}
            <select
              id=${id}
              class="sf-in"
              data-path=${key(d.path)}
              aria-invalid=${placed.length ? 'true' : nothing}
              @change=${(e: Event) => {
                const i = Number((e.target as HTMLSelectElement).value);
                if (i >= 0) this.#apply({ op: 'branch', path: n.path, option: i });
              }}
            >
              ${this.#options(d.options, d.selected)}
            </select>
            ${this.#errs(d.path, placed)}
          </div>`;
        })()
      : nothing;
    const map = n.map
      ? html`<div class="sf-map">
          ${n.map.entries.map(e => {
            const placed = this.#errsAt(e.path);
            return html`<div class="sf-mrow" data-field=${key(e.path)}>
              <input
                class="sf-in sf-mono sf-key"
                data-path=${key([...e.path, '$key'])}
                aria-label=${this.#T('entryName')}
                spellcheck="false"
                autocomplete="off"
                .value=${live(e.key)}
                @change=${(ev: Event) => {
                  this.#apply({ op: 'rename', path: n.path, from: e.key, to: (ev.target as HTMLInputElement).value });
                }}
              />
              ${e.value ? this.#field(e.value) : nothing} ${this.#ib('close', this.#T('remove', { what: e.key }), this.#remove(e.path))}
              ${this.#errs(e.path, placed)}
            </div>`;
          })}
          <div class="sf-add">
            <button
              type="button"
              class="sf-addbtn"
              ?disabled=${!n.map.canAdd}
              @click=${() => {
                this.#apply({ op: 'entry', path: n.path });
              }}
            >
              ${formIcon('plus')}<span>${this.#T('addEntry')}</span>
            </button>
          </div>
        </div>`
      : nothing;
    const absent = n.absent.length
      ? html`<div class="sf-add">
          <select
            class="sf-in sf-more"
            aria-label=${this.#T('addField')}
            data-path=${key([...n.path, '$add'])}
            @change=${(e: Event) => {
              const sel = e.target as HTMLSelectElement,
                prop = sel.value;
              sel.value = '';
              if (prop) this.#apply({ op: 'add', path: n.path, prop });
            }}
          >
            <option value="" .selected=${true}>${this.#T('addField')}</option>
            ${n.absent.map(o => html`<option value=${o.value}>${o.label}</option>`)}
          </select>
        </div>`
      : nothing;
    const box = html`<div class="sf-obj">${discField}${n.fields.map(f => this.#field(f))}${map}${absent}</div>`;
    if (n.frame !== 'fieldset') return box;
    const placed = this.#errsAt(n.path);
    return html`<fieldset class="sf-fs" data-field=${key(n.path)}>
      <legend class="sf-l">${n.label}</legend>
      ${this.#errs(n.path, placed)}
      ${n.removable ? html`<div class="sf-fsx">${this.#ib('close', this.#T('remove', { what: n.label }), this.#remove(n.path))}</div>` : nothing}
      ${n.help ? html`<p class="sf-help">${n.help}</p>` : nothing} ${box}
    </fieldset>`;
  }
  #array(n: ArrayField): TemplateResult {
    const len = n.items.length;
    const placed = this.#errsAt(n.path);
    const items = n.items.map(it => {
      const i = it.index,
        k = key(it.path);
      const ctrls = html`<span class="sf-ctl">
        ${this.#ib(
          'up',
          this.#T('up', { n: i + 1 }),
          () => {
            this.#apply({ op: 'move', path: n.path, from: i, to: i - 1 });
          },
          i === 0,
        )}
        ${this.#ib(
          'down',
          this.#T('down', { n: i + 1 }),
          () => {
            this.#apply({ op: 'move', path: n.path, from: i, to: i + 1 });
          },
          i === len - 1,
        )}
        ${this.#ib('close', this.#T('removeItem', { n: i + 1 }), this.#remove(it.path), len <= n.min)}
      </span>`;
      const errs = this.#errsAt(it.path);
      if (!it.object)
        return html`<li class="sf-item sf-prim" data-field=${k}>
          <span class="sf-n">${i + 1}</span>${it.body ? this.#field(it.body) : nothing}${ctrls} ${this.#errs(it.path, errs)}
        </li>`;
      const open = !this.#closed.has(k),
        bodyId = this.#id(it.path, '$b');
      return html`<li>
        <div class="sf-item sf-card" data-field=${k}>
          <div class="sf-sum">
            <button
              type="button"
              class="sf-tog"
              aria-expanded=${open ? 'true' : 'false'}
              aria-controls=${bodyId}
              @click=${() => {
                if (open) this.#closed.add(k);
                else this.#closed.delete(k);
                this.requestUpdate();
              }}
            >
              <span class="sf-n">${i + 1}</span><span class="sf-st">${it.summary}</span>
            </button>
            ${ctrls}
          </div>
          ${this.#errs(it.path, errs)}
          <div class="sf-body" id=${bodyId} ?hidden=${!open}>${it.body ? this.#field(it.body) : nothing}</div>
        </div>
      </li>`;
    });
    return html`<fieldset class="sf-fs" data-field=${key(n.path)}>
      <legend class="sf-l">${n.label}</legend>
      ${this.#errs(n.path, placed)}
      ${n.removable ? html`<div class="sf-fsx">${this.#ib('close', this.#T('remove', { what: n.label }), this.#remove(n.path))}</div>` : nothing}
      ${n.help ? html`<p class="sf-help">${n.help}</p>` : nothing}
      <div class="sf-arrbox">
        <ol class="sf-arr">
          ${items}
        </ol>
        <div class="sf-add">
          <button
            type="button"
            class="sf-addbtn"
            ?disabled=${!n.canAdd}
            aria-label=${this.#T('addTo', { what: n.label })}
            @click=${() => {
              this.#apply({ op: 'push', path: n.path });
            }}
          >
            ${formIcon('plus')}<span>${this.#T('add')}</span>
          </button>
          ${n.max !== null ? html`<small class="sf-cnt">${this.#T('count', { n: len, max: n.max })}</small>` : nothing}
        </div>
      </div>
    </fieldset>`;
  }
}

/** the paths that have a drawn field (where a problem can be shown) */
function collect(n: FieldNode, out: Set<string>): void {
  switch (n.kind) {
    case 'input':
      out.add(key(n.path));
      return;
    case 'alt':
      out.add(key(n.path));
      if (n.body) collect(n.body, out);
      return;
    case 'object':
      if (n.frame === 'fieldset') out.add(key(n.path));
      if (n.disc) out.add(key(n.disc.path));
      n.fields.forEach(f => {
        collect(f, out);
      });
      n.map?.entries.forEach(e => {
        out.add(key(e.path));
        if (e.value) collect(e.value, out);
      });
      return;
    case 'array':
      out.add(key(n.path));
      n.items.forEach(it => {
        out.add(key(it.path));
        if (it.body) collect(it.body, out);
      });
      return;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'noema-schema-form': NoemaSchemaForm;
  }
}
