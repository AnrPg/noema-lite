/** ⚑ The report dialog, 🎯 pointing and #/admin/reports (docs/REPORTS.md). The rail button is the frame's. */
import { css } from 'lit';

export const REPORT_CSS = css`
  .nr-body {
    display: grid;
    gap: 12px;
  }
  .nr-lead {
    margin: 0;
  }
  .nr-shot {
    margin: 0;
    display: grid;
    gap: 6px;
  }
  .nr-shot img {
    display: block;
    width: 100%;
    max-height: 260px;
    object-fit: contain;
    object-position: top;
    border: 1px solid var(--u-line);
    border-radius: 12px;
    background: var(--u-bg);
  }
  .nr-shot.off img {
    opacity: 0.25;
    filter: grayscale(1);
  }
  .nr-label {
    display: grid;
    gap: 6px;
    font-weight: 700;
    font-size: 0.92rem;
  }
  .nr-kinds {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .nr-kinds.shake {
    animation: nr-shake 0.3s;
  }
  @keyframes nr-shake {
    25% {
      transform: translateX(-4px);
    }
    75% {
      transform: translateX(4px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .nr-kinds.shake {
      animation: none;
    }
  }
  .nr-kind {
    min-height: 32px;
    padding: 6px 12px;
    border-radius: 999px;
    border: 1.5px solid var(--u-line);
    background: var(--u-paper);
    font: inherit;
    font-weight: 600;
    font-size: 0.88rem;
    color: var(--u-ink2);
    cursor: pointer;
  }
  .nr-kind.on {
    border-color: var(--u-acc);
    background: var(--u-acc-soft);
    color: var(--u-ink);
  }
  .nr-kind:focus-visible {
    outline: 2px solid var(--u-acc-text);
    outline-offset: 2px;
  }
  .nc-dlg textarea.nr-note {
    resize: vertical;
    min-height: 90px;
    font-weight: 400;
  }
  .nr-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .nr-pointed {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.88rem;
    color: var(--u-ink2);
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .nr-details summary {
    cursor: pointer;
    color: var(--u-ink2);
    font-size: 0.9rem;
    min-height: 24px;
  }
  .nr-details pre {
    max-height: 260px;
    overflow: auto;
    font-size: 0.75rem;
    background: var(--u-bg);
    border-radius: 10px;
    padding: 10px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .nr-privacy,
  .nr-noshot {
    font-size: 0.85rem;
    margin: 0;
  }
  .nr-signin {
    margin: 0;
    padding: 10px 12px;
    border-radius: 12px;
    background: var(--u-warn);
    color: var(--u-warn-ink);
    font-size: 0.9rem;
  }
  .nr-err {
    color: var(--u-bad-ink);
    margin: 0;
    font-size: 0.9rem;
  }
  .nr-err:empty {
    display: none;
  }
  .nr-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
  }
  .nr-actions.start {
    justify-content: flex-start;
  }
  .nr-point svg.i,
  .nr-copy svg.i,
  .nr-pointed svg.i {
    width: 17px;
    height: 17px;
  }

  /* #/admin/reports */
  .nr-admin {
    display: grid;
    gap: 14px;
  }
  .nr-admin h1,
  .nr-admin h2 {
    margin: 0;
  }
  .nr-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    justify-content: space-between;
  }
  .nr-list {
    display: grid;
    gap: 8px;
  }
  .nr-item {
    display: grid;
    grid-template-columns: auto 1fr auto;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 14px;
    border: 1px solid var(--u-line);
    background: var(--u-paper);
    text-align: start;
    color: var(--u-ink);
    font: inherit;
    cursor: pointer;
    width: 100%;
    min-width: 0;
  }
  .nr-item:hover {
    border-color: var(--u-ink3);
  }
  .nr-item:focus-visible {
    outline: 2px solid var(--u-acc-text);
    outline-offset: 2px;
  }
  .nr-item .t {
    display: grid;
    gap: 2px;
    min-width: 0;
  }
  .nr-item .t b {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  .nr-item .t small,
  .nr-who {
    color: var(--u-ink3);
    font-size: 0.8rem;
    overflow-wrap: anywhere;
  }
  .nr-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .nr-dhead {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    justify-content: space-between;
  }
  .nr-quote {
    margin: 0;
    padding: 12px 16px;
    border-inline-start: 4px solid var(--u-bad-ink);
    background: var(--u-bg);
    border-radius: 10px;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .nr-bigshot img {
    display: block;
    max-width: 100%;
    max-height: 70vh;
    border: 1px solid var(--u-line);
    border-radius: 12px;
  }
  .nr-where {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
    table-layout: fixed;
  }
  .nr-where th {
    width: 9em;
    text-align: start;
    vertical-align: top;
    padding: 6px 10px 6px 0;
    color: var(--u-ink2);
    font-weight: 700;
  }
  .nr-where td {
    padding: 6px 0;
    overflow-wrap: anywhere;
  }
  .nr-where tr + tr th,
  .nr-where tr + tr td {
    border-top: 1px solid var(--u-line);
  }
  .nr-where code {
    font-size: 0.82rem;
  }
  .nr-where ul {
    margin: 0;
    padding-inline-start: 18px;
  }
  .nr-sel {
    display: block;
    color: var(--u-ink3);
    font-family: var(--mono, monospace);
    font-size: 0.72rem;
  }
  .nr-form {
    display: grid;
    gap: 12px;
    max-width: 640px;
  }
  @media (max-width: 759px) {
    .nr-item {
      grid-template-columns: 1fr;
    }
    .nr-where th {
      width: 6.5em;
    }
  }
`;

/** 🎯 on the page itself (outside every screen): the frame, the hint, the thing picked — a document stylesheet too */
export const POINT_CSS = css`
  .nr-hl {
    position: fixed;
    z-index: 200;
    pointer-events: none;
    border: 3px solid var(--acc, #7c5cff);
    border-radius: 8px;
    box-shadow: 0 0 0 4000px rgb(0 0 0 / 0.08);
    display: none;
  }
  .nr-tip {
    position: fixed;
    z-index: 201;
    left: 50%;
    top: 14px;
    transform: translateX(-50%);
    max-width: calc(100% - 32px);
    padding: 10px 16px;
    border-radius: 999px;
    background: var(--ink, #1f2330);
    color: var(--bg, #fbf9f4);
    font-weight: 700;
    font-size: 0.9rem;
    pointer-events: none;
    box-shadow: var(--shadow, 0 4px 18px rgb(0 0 0 / 0.15));
  }
  body:has(.nr-tip) * {
    cursor: crosshair !important;
  }
  .nr-picked {
    outline: 3px solid var(--acc, #7c5cff) !important;
    outline-offset: 3px !important;
    border-radius: 6px;
  }
`;

/** ⚙ #/engines: the catalogue of engines and the requests for new ones — quiet, one column, wraps at 320 px */
export const ENGINES_CSS = css`
  .eng-head {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    align-items: center;
    justify-content: space-between;
  }
  .eng-head h2 {
    margin: 0;
  }
  .eng-intro {
    max-width: 64ch;
  }
  .eng-sec {
    margin-top: 18px;
  }
  .eng-sec h3 {
    font-size: 1rem;
    margin: 0 0 6px;
  }
  .eng-list,
  .eng-reqs {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }
  .eng-row {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 10px;
    align-items: baseline;
    padding: 6px 10px;
    border-radius: 10px;
    background: var(--u-paper);
    border: 1px solid var(--u-line);
    min-width: 0;
  }
  .eng-row b {
    font-weight: 600;
  }
  .eng-id {
    font-size: 0.78em;
    color: var(--u-ink3);
    overflow-wrap: anywhere;
  }
  .eng-what {
    flex: 1 1 100%;
    font-size: 0.88em;
    color: var(--u-ink2);
    overflow-wrap: anywhere;
  }
  .eng-req {
    padding: 8px 10px;
    border-radius: 10px;
    border: 1px solid var(--u-line);
    background: var(--u-paper);
    display: grid;
    gap: 4px;
    min-width: 0;
  }
  .eng-req-h {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    align-items: baseline;
  }
  .eng-req-h b {
    overflow-wrap: anywhere;
  }
  .eng-st-available {
    --bgc: var(--u-ok);
    --fgc: var(--u-ok-ink);
  }
  .eng-st-declined,
  .eng-st-duplicate {
    --bgc: var(--u-line);
    --fgc: var(--u-ink2);
  }
  .eng-answer {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .eng-admin {
    font-size: 0.9em;
    display: grid;
    gap: 6px;
  }
  .eng-admin summary,
  .eng-more > summary {
    cursor: pointer;
    min-height: 24px;
    color: var(--u-ink2);
  }
  .eng-admin .nc-row > * {
    flex: 1 1 8em;
    min-width: 0;
  }
  .eng-f {
    display: grid;
    gap: 3px;
    margin: 8px 0;
  }
  .eng-f span {
    font-size: 0.88em;
    color: var(--u-ink2);
  }
  .eng-sug:empty {
    display: none;
  }
  .eng-sug {
    margin: 4px 0 6px;
  }
`;
