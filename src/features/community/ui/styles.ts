/**
 * The community screens' styles. A screen is drawn in the light DOM (screen.ts), so its rules are a document stylesheet,
 * adopted once per document and per screen kind (`adopt(doc, 'vault', css)`), every rule under the screen's own class.
 * Only the design tokens (engine/tokens.css), pale surfaces, few and short motions; logical properties (right to left);
 * nothing wider than the screen at 320 px.
 *
 * COMMON holds the parts every screen shares: the page (`.nc`), rows of a list (`.nc-list`, `.nc-item`), quiet panels,
 * a segmented switch (`.nc-seg`), small pills, the face of a person or group (`.nc-face`), the muted line.
 */
import { css, type CSSResult } from 'lit';

const ADOPTED = new WeakMap<Document, Set<string>>();

/** Adds the stylesheets to the document once (by name). */
export function adopt(doc: Document, name: string, ...sheets: CSSResult[]): void {
  let done = ADOPTED.get(doc);
  if (!done) ADOPTED.set(doc, (done = new Set()));
  if (done.has(name)) return;
  done.add(name);
  const made = sheets.map(s => s.styleSheet).filter((s): s is CSSStyleSheet => !!s);
  if (made.length === sheets.length && 'adoptedStyleSheets' in doc) {
    doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, ...made];
    return;
  }
  // a browser (or a test DOM) without constructable stylesheets: a <style> element
  const el = doc.createElement('style');
  el.dataset['nc'] = name;
  el.textContent = sheets.map(s => s.cssText).join('\n');
  doc.head.append(el);
}

/** The tokens as the kit names them (src/ui/core/styles.ts), for the light DOM of a screen. */
export const COMMON = css`
  .nc,
  .nc-dlg {
    --u-bg: var(--bg, #fbf9f4);
    --u-paper: var(--paper, var(--card, #ffffff));
    --u-ink: var(--ink, #1f2330);
    --u-ink2: var(--ink2, #5b6172);
    --u-ink3: var(--ink3, #686d7c);
    --u-line: var(--line, #ebe7dd);
    --u-acc: var(--acc, var(--c-fill, #7c5cff));
    --u-acc-ink: var(--acc-ink, var(--c-on, #ffffff));
    --u-acc-soft: var(--acc-soft, var(--c-bg, #efebff));
    --u-acc-text: var(--acc-text, var(--c-ink, #6a4ae6));
    --u-ok: var(--t1, var(--ok-bg, #e3f7ef));
    --u-ok-ink: var(--t1i, #0b6b50);
    --u-warn: var(--t2, var(--warn-bg, #fff4dc));
    --u-warn-ink: var(--t2i, #7a5000);
    --u-bad: var(--t3, var(--bad-bg, #fde8e8));
    --u-bad-ink: var(--t3i, #a3262a);
    --u-info: var(--t4, var(--info-bg, #e8f0fe));
    --u-info-ink: var(--t4i, #1d4fa3);
    --u-r: var(--r, 18px);
    --u-br: var(--br, var(--r-sm, 12px));
    --u-fast: calc(var(--motion-fast, 0.15s) * var(--u-motion, 1));
    color: var(--u-ink);
    font-family: var(--font, system-ui, sans-serif);
  }
  .nc {
    display: block;
    min-width: 0;
    max-width: 920px;
    margin-inline: auto;
  }
  .nc *,
  .nc-dlg * {
    box-sizing: border-box;
  }
  .nc h1 {
    margin: 4px 0 4px;
    font: 700 1.5rem/1.25 var(--display, var(--font, system-ui));
    overflow-wrap: anywhere;
  }
  .nc h2 {
    margin: 18px 0 8px;
    font-size: 1.1rem;
  }
  .nc h3 {
    margin: 14px 0 6px;
    font-size: 1rem;
  }
  .nc p,
  .nc-dlg p {
    overflow-wrap: anywhere;
  }
  .nc-muted {
    color: var(--u-ink2);
  }
  .nc-tiny {
    font-size: 0.85rem;
  }
  .nc-lead {
    margin: 0 0 14px;
    color: var(--u-ink2);
  }
  .nc-label {
    display: block;
    margin: 16px 2px 6px;
    font-size: 0.78rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--u-ink2);
  }
  .nc-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .nc-row.end {
    justify-content: flex-end;
  }
  .nc-grow {
    flex: 1;
    min-width: 0;
  }
  .nc-panel {
    padding: 14px 16px;
    border: 1px solid var(--u-line);
    border-radius: var(--u-r);
    background: var(--u-paper);
    margin: 10px 0;
  }
  .nc-empty {
    display: grid;
    justify-items: center;
    gap: 8px;
    text-align: center;
    padding: 26px 16px;
  }
  .nc-list {
    display: block;
    border: 1px solid var(--u-line);
    border-radius: var(--u-r);
    background: var(--u-paper);
    overflow: hidden;
    margin: 6px 0 12px;
  }
  .nc-item {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    min-height: 56px;
    padding: 10px 14px;
    border: 0;
    border-top: 1px solid var(--u-line);
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    min-width: 0;
  }
  .nc-list > .nc-item:first-child,
  .nc-list > :first-child .nc-item {
    border-top: 0;
  }
  button.nc-item,
  .nc-item > button.nc-who {
    cursor: pointer;
  }
  button.nc-item:hover,
  .nc-item > button.nc-who:hover {
    background: var(--u-acc-soft);
  }
  button.nc-item:focus-visible,
  .nc-item button:focus-visible,
  .nc button.nc-link:focus-visible {
    outline: 2px solid var(--u-acc-text);
    outline-offset: -2px;
  }
  .nc-item > .t,
  .nc-who > .t {
    display: grid;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }
  .nc-item .t b,
  .nc-item .t small {
    overflow: hidden;
    text-overflow: ellipsis;
    overflow-wrap: anywhere;
  }
  .nc-item .t small {
    color: var(--u-ink2);
    font-size: 0.85rem;
  }
  .nc-item > .chev {
    color: var(--u-ink3);
    flex: none;
  }
  .nc-who {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: start;
    border-radius: 10px;
  }
  .nc-ico,
  .nc-face {
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 38px;
    height: 38px;
    border-radius: 12px;
    background: var(--bgc, var(--u-acc-soft));
    color: var(--fgc, var(--u-acc-text));
    font-weight: 700;
  }
  .nc-face {
    border-radius: 50%;
  }
  .nc-ico svg.i,
  .nc svg.i,
  .nc-dlg svg.i {
    width: 20px;
    height: 20px;
    fill: none;
    stroke: currentColor;
    stroke-width: var(--sw, 1.8);
    stroke-linecap: var(--cap, round);
    stroke-linejoin: round;
    flex: none;
  }
  .nc-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 9px;
    border-radius: 999px;
    background: var(--bgc, var(--u-acc-soft));
    color: var(--fgc, var(--u-acc-text));
    font-size: 0.78rem;
    font-weight: 600;
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .nc-seg {
    display: inline-flex;
    flex-wrap: wrap;
    gap: 2px;
    padding: 3px;
    border-radius: 999px;
    background: var(--u-bg);
    border: 1px solid var(--u-line);
    max-width: 100%;
  }
  .nc-seg > button {
    min-height: 32px;
    min-width: 32px;
    padding: 4px 12px;
    border: 0;
    border-radius: 999px;
    background: none;
    color: var(--u-ink2);
    font: inherit;
    font-size: 0.9rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .nc-seg > button.on {
    background: var(--u-paper);
    color: var(--u-ink);
    font-weight: 600;
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
  }
  .nc-seg > button:focus-visible {
    outline: 2px solid var(--u-acc-text);
    outline-offset: 1px;
  }
  .nc button.nc-link,
  .nc-dlg button.nc-link {
    padding: 4px 2px;
    min-height: 24px;
    border: 0;
    background: none;
    color: var(--u-acc-text);
    font: inherit;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 3px;
  }
  .nc-count {
    display: inline-grid;
    place-items: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    border-radius: 999px;
    background: var(--u-acc);
    color: var(--u-acc-ink);
    font-size: 0.75rem;
    font-weight: 700;
  }
  .nc-err {
    color: var(--u-bad-ink);
    min-height: 1em;
    margin: 6px 0;
  }
  .nc input.nc-input,
  .nc-dlg input.nc-input,
  .nc-dlg textarea.nc-input,
  .nc textarea.nc-input,
  .nc select.nc-input,
  .nc-dlg select.nc-input {
    width: 100%;
    min-height: 40px;
    padding: 8px 12px;
    border: 1px solid var(--u-line);
    border-radius: var(--u-br);
    background: var(--u-paper);
    color: var(--u-ink);
    font: inherit;
  }
  .nc-dlg .nc-check,
  .nc .nc-check {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    min-height: 24px;
    margin: 6px 0;
  }
  .nc-dlg .nc-check input,
  .nc .nc-check input {
    width: 20px;
    height: 20px;
    margin: 1px 0 0;
    flex: none;
    accent-color: var(--u-acc);
  }
  .nc-hit {
    animation: nc-hit 2.6s ease-out;
  }
  @keyframes nc-hit {
    from {
      background: var(--u-acc-soft);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .nc-hit {
      animation: none;
    }
  }
`;
