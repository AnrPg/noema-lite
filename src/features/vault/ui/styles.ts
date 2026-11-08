/** 🗄️ The vault's page, its file sheet, the preview, the upload and edit form (docs/VAULT.md). Quiet, one column, wraps at 320 px. */
import { css } from 'lit';

export const VAULT_CSS = css`
  .vt-lead {
    margin-top: -2px;
  }
  .vt-bar,
  .vt-row,
  .vt-fhead2,
  .vt-fhead {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .vt-bar .vt-q {
    flex: 1;
    min-width: 0;
  }
  .vt-row {
    margin: 10px 0;
  }
  .vt-row .nc-grow,
  .vt-fhead2 .nc-grow {
    flex: 1;
  }
  .vt-upbtn,
  .vt-filtbtn,
  .vt-pinsbtn,
  .vt-clearall {
    flex: none;
    white-space: nowrap;
  }
  .vt-sortl {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    color: var(--u-ink3);
    font-size: 0.85rem;
  }
  .nc select.vt-sort {
    width: auto;
    min-height: 32px;
    padding-block: 4px;
  }
  .vt-viewseg > button {
    min-width: 36px;
  }
  .vt-viewseg svg.i,
  .vt-pin svg.i,
  .vt-pinsbtn svg.i,
  .vt-tile svg.i {
    width: 18px;
    height: 18px;
  }
  .vt-active {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 8px;
  }
  .vt-active:empty {
    display: none;
  }
  .vt-chipx {
    margin-inline-start: 2px;
    display: inline-grid;
    place-items: center;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: rgb(0 0 0 / 0.1);
    font-size: 0.8em;
    line-height: 1;
  }
  .vt-fhead {
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--u-paper);
    padding: 2px 0 10px;
  }
  .vt-filters {
    display: grid;
    gap: 16px;
  }
  .vt-fgroup {
    display: grid;
    gap: 6px;
  }
  .vt-fgroup > b {
    font-size: 0.78rem;
    color: var(--u-ink3);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .vt-fbody,
  .vt-f {
    display: grid;
    gap: 6px;
  }
  .vt-file .vt-meta {
    display: flex;
    gap: 8px;
    align-items: center;
    color: var(--u-ink3);
    font-size: 0.8rem;
    white-space: nowrap;
  }
  .vt-fhead2 {
    flex-wrap: wrap;
    margin: 0 0 10px;
  }
  .vt-path {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 4px;
    align-items: center;
    font-size: 0.92rem;
    min-width: 0;
  }
  .vt-pin {
    display: inline-grid;
    place-items: center;
    min-width: 32px;
    min-height: 32px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--u-ink2);
    cursor: pointer;
    opacity: 0.5;
  }
  .vt-pin:focus-visible {
    outline: 2px solid var(--u-acc-text);
    opacity: 1;
  }
  .vt-lb {
    display: flex;
    align-items: center;
    gap: 2px;
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--u-ink2);
  }
  .vt-clearall {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .vt-clearall[disabled] {
    opacity: 0.45;
    cursor: default;
  }
  .vt-clearall svg.i {
    width: 16px;
    height: 16px;
  }
  .vt-pin.on,
  .vt-pin:hover {
    opacity: 1;
  }
  .vt-pinlist {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0 0 12px;
  }
  .vt-pinlist[hidden] {
    display: none;
  }
  .vt-pinchip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 0 4px 0 10px;
    min-height: 32px;
    border-radius: 999px;
    background: var(--u-acc-soft);
    color: var(--u-acc-text);
    font-size: 0.86rem;
    max-width: 100%;
  }
  .vt-pinchip button {
    background: none;
    border: 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
    min-height: 24px;
    min-width: 24px;
    overflow-wrap: anywhere;
    text-align: start;
  }
  .vt-ways > button {
    font-size: 0.85rem;
  }
  .vt-directhead,
  .vt-kindhead {
    font-size: 0.95rem;
    margin: 14px 0 6px;
    display: flex;
    gap: 6px;
    align-items: baseline;
  }
  .vt-kindgroup {
    margin: 14px 0;
  }
  .vt-endchips {
    margin: 0 0 10px;
  }
  .vt-groupnote {
    margin: 0 0 8px;
  }
  .vt-view .vt-count {
    margin: 18px 0 0;
    text-align: end;
    font-size: 0.72rem;
    opacity: 0.6;
  }

  /* the file's sheet */
  .vt-facts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    margin: 10px 0;
    font-size: 0.92rem;
  }
  .vt-facts dt {
    color: var(--u-ink3);
  }
  .vt-facts dd {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .vt-desc {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .vt-acts {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 12px 0;
    align-items: center;
  }
  .vt-tile {
    flex: none;
    width: 48px;
    height: 48px;
    display: inline-grid;
    place-items: center;
    padding: 0;
    border-radius: 50%;
    border: 1px solid var(--u-line);
    background: var(--u-paper);
    color: var(--u-ink);
    cursor: pointer;
    transition: border-color var(--u-fast);
  }
  .vt-tile:hover,
  .vt-tile:focus-visible {
    border-color: var(--u-acc);
  }
  .vt-tile:focus-visible {
    outline: 2px solid var(--u-acc-text);
    outline-offset: 2px;
  }
  .vt-tile.primary {
    background: var(--u-acc);
    border-color: var(--u-acc);
    color: var(--u-acc-ink);
  }
  .vt-tile[disabled] {
    opacity: 0.55;
    cursor: default;
  }
  .vt-moremenu {
    display: inline-grid;
    place-items: center;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    border: 1px solid var(--u-line);
  }
  .vt-rate {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .vt-stars {
    display: inline-flex;
    gap: 2px;
  }
  .vt-star {
    background: none;
    border: 0;
    font-size: 1.4rem;
    line-height: 1;
    min-width: 28px;
    min-height: 28px;
    color: color-mix(in srgb, currentColor 28%, transparent);
    cursor: pointer;
    padding: 2px;
  }
  .vt-star.on {
    color: var(--u-warn-ink);
  }
  .vt-star:focus-visible {
    outline: 2px solid var(--u-acc-text);
    border-radius: 6px;
  }
  .vt-star[disabled] {
    cursor: default;
  }

  /* the preview: a window of its own */
  .vt-preview {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 40vh;
  }
  .vt-preview iframe {
    width: 100%;
    height: 70vh;
    border: 0;
  }
  .vt-preview img,
  .vt-preview video {
    max-width: 100%;
    max-height: 70vh;
    object-fit: contain;
  }
  .vt-preview audio {
    width: 100%;
  }
  .vt-preview pre {
    width: 100%;
    align-self: stretch;
    max-height: 70vh;
    overflow: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font-size: 0.85rem;
    background: var(--u-bg);
    padding: 10px;
    border-radius: 10px;
    margin: 0;
  }

  /* the upload and the edit form */
  .vt-form {
    display: grid;
    gap: 12px;
  }
  .vt-fs {
    border: 1px solid var(--u-line);
    border-radius: 12px;
    padding: 8px 10px 10px;
    margin: 0;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(180px, 100%), 1fr));
    gap: 8px;
    min-width: 0;
  }
  .vt-fs legend {
    font-size: 0.8rem;
    color: var(--u-ink3);
    padding: 0 4px;
  }
  .vt-fs > textarea,
  .vt-fs > .nc-row,
  .vt-fs > .vt-fieldsfld,
  .vt-fs > .vt-langsfld {
    grid-column: 1 / -1;
  }
  .vt-fld {
    display: grid;
    gap: 3px;
    align-content: start;
    min-width: 0;
  }
  .vt-info {
    background: none;
    border: 0;
    padding: 0 4px;
    min-width: 24px;
    min-height: 24px;
    font: inherit;
    color: inherit;
    opacity: 0.6;
    cursor: help;
  }
  .vt-info:hover,
  .vt-info[aria-expanded='true'] {
    opacity: 1;
  }
  .vt-help {
    margin: 0 0 4px;
  }
  .vt-help[hidden],
  .vt-yhint[hidden],
  .vt-fnote[hidden] {
    display: none;
  }
  .vt-fchips,
  .vt-langs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .vt-fchips:empty,
  .vt-langs:empty {
    display: none;
  }
  .vt-fchip,
  .vt-langchip {
    max-width: 100%;
    white-space: normal;
    text-align: start;
  }
  .vt-fres {
    display: grid;
    gap: 4px;
    margin: 6px 0;
    max-height: 340px;
    overflow-y: auto;
  }
  .vt-fres .nc-item {
    min-height: 40px;
    padding: 6px 12px;
  }
  .vt-fsugopt .t small {
    color: var(--u-acc-text);
  }
  .vt-drop {
    display: grid;
    place-items: center;
    gap: 4px;
    padding: 18px 12px;
    border: 1.5px dashed var(--u-line);
    border-radius: 14px;
    background: var(--u-bg);
    cursor: pointer;
    text-align: center;
    font-weight: 600;
  }
  .vt-drop.on,
  .vt-drop:hover {
    border-color: var(--u-acc);
  }
  .vt-drop:focus-within {
    outline: 2px solid var(--u-acc-text);
    outline-offset: 2px;
  }
  .vt-drop .vt-pick {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
  }
  .vt-drop small {
    font-weight: 400;
    color: var(--u-ink3);
  }
  .vt-files {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 6px;
  }
  .vt-files:empty {
    display: none;
  }
  .vt-files li {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    min-width: 0;
  }
  .vt-files li .vt-title {
    flex: 1 1 140px;
    min-width: 0;
  }
  .vt-files li.bad {
    color: var(--u-bad-ink);
    overflow-wrap: anywhere;
  }
  .vt-problem {
    flex-basis: 100%;
  }
  .vt-anon {
    display: grid;
    gap: 2px;
  }
  .vt-wherefld {
    max-width: 420px;
  }
  .vt-rulesrow {
    align-items: flex-start;
  }
  @media (max-width: 520px) {
    .vt-row {
      flex-wrap: wrap;
    }
    .vt-sortl > span {
      display: none;
    }
  }
`;
