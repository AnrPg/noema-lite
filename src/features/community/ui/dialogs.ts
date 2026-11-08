/**
 * Dialogs of the community screens: a kit dialog (noema-dialog: a native modal, Escape, focus kept inside and given back)
 * put over every page by the host, its content drawn in its light DOM (the screens' stylesheet applies: class nc-dlg),
 * taken away again when it closes.
 *
 *   const d = openDialog(deps, { heading, cls: 'vt-upload', content: el })      a panel (an element of its own)
 *   const d = openDialog(deps, { heading, render: close => html`…` })           a few lines; d.redraw() draws them again
 *   await ask(deps, { text, ok, cancel, danger })                               a yes / no question → true for yes
 *   await askText(deps, { heading, label, value, ok, cancel })                  a word to type → the text, or null
 */
import { html, render, type TemplateResult } from 'lit';
import { NoemaDialog, type DialogCloseDetail } from '../../../ui/kit/dialog.ts';
import type { ScreenBase } from './screen.ts';

export interface DialogOptions {
  readonly heading: string;
  /** classes of the dialog element (the tests' and the locator's names for it) */
  readonly cls?: string;
  readonly placement?: 'center' | 'sheet';
  readonly wide?: boolean;
  readonly dismissible?: boolean;
  /** an element of its own as the content … */
  readonly content?: HTMLElement;
  /** … or a template (drawn again by redraw()) */
  readonly render?: (close: (value?: string) => void) => TemplateResult;
  /** called once it closed (with what closed it: the value given to close(), 'dismiss' for ✕ / Escape) */
  readonly onClose?: (value: string) => void;
}
export interface DialogHandle {
  readonly el: NoemaDialog;
  close(value?: string): void;
  redraw(): void;
  /** resolves with the value that closed it */
  readonly closed: Promise<string>;
}

export function openDialog(deps: ScreenBase, o: DialogOptions): DialogHandle {
  const doc = globalThis.document;
  const dlg = doc.createElement('noema-dialog');
  if (!(dlg instanceof NoemaDialog)) throw new Error('the UI kit is not defined (defineUi)');
  dlg.heading = o.heading;
  dlg.className = ['nc-dlg', o.cls ?? ''].join(' ').trim();
  if (o.placement) dlg.placement = o.placement;
  if (o.wide) dlg.wide = true;
  if (o.dismissible === false) dlg.dismissible = false;
  const close = (value = 'done'): void => {
    dlg.close(value);
  };
  const draw = (): void => {
    if (o.render) render(o.render(close), dlg);
  };
  if (o.content) dlg.append(o.content);
  draw();
  const remove = deps.host.overlay(dlg);
  const closed = new Promise<string>(resolve => {
    dlg.addEventListener(
      'noema-close',
      e => {
        const v = (e as CustomEvent<DialogCloseDetail>).detail.value;
        remove();
        o.onClose?.(v);
        resolve(v);
      },
      { once: true },
    );
  });
  void dlg.updateComplete.then(() => {
    dlg.show();
  });
  return { el: dlg, close, redraw: draw, closed };
}

export interface AskOptions {
  readonly heading?: string;
  readonly text: string;
  readonly ok: string;
  readonly cancel: string;
  /** it cannot be undone: the button in the bad tint */
  readonly danger?: boolean;
}

/** A yes / no question → true for yes (no, ✕ and Escape: false). The safe answer has the focus first. */
export async function ask(deps: ScreenBase, o: AskOptions): Promise<boolean> {
  const d = openDialog(deps, {
    heading: o.heading ?? o.text,
    cls: 'nc-ask',
    render: close =>
      html`${o.heading ? html`<p>${o.text}</p>` : null}
        <noema-button
          slot="actions"
          class="nc-cancel"
          variant="secondary"
          autofocus
          @click=${() => {
            close('no');
          }}
          >${o.cancel}</noema-button
        >
        <noema-button
          slot="actions"
          class="nc-ok"
          variant=${o.danger ? 'danger' : 'primary'}
          @click=${() => {
            close('yes');
          }}
          >${o.ok}</noema-button
        >`,
  });
  return (await d.closed) === 'yes';
}

export interface AskTextOptions {
  readonly heading: string;
  readonly label: string;
  readonly value?: string;
  readonly ok: string;
  readonly cancel: string;
  readonly maxlength?: number;
}

/** A word or a name to type → the text (trimmed), or null when it was cancelled. */
export async function askText(deps: ScreenBase, o: AskTextOptions): Promise<string | null> {
  let text = o.value ?? '';
  const d = openDialog(deps, {
    heading: o.heading,
    cls: 'nc-asktext',
    render: close =>
      html`<form
          @submit=${(e: Event) => {
            e.preventDefault();
            close('ok');
          }}
        >
          <noema-text-field
            class="nc-askfield"
            label=${o.label}
            .value=${text}
            maxlength=${o.maxlength ?? 200}
            autofocus
            @input=${(e: Event) => {
              text = (e.target as HTMLInputElement).value;
            }}
          ></noema-text-field>
        </form>
        <noema-button
          slot="actions"
          class="nc-cancel"
          variant="secondary"
          @click=${() => {
            close('no');
          }}
          >${o.cancel}</noema-button
        >
        <noema-button
          slot="actions"
          class="nc-ok"
          variant="primary"
          @click=${() => {
            close('ok');
          }}
          >${o.ok}</noema-button
        >`,
  });
  return (await d.closed) === 'ok' ? text.trim() : null;
}
