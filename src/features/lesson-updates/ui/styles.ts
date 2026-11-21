/**
 * The lesson-update windows' styles (screens.ts draws in the dialogs' light DOM): a document stylesheet adopted once, every
 * rule under .lu. Only the design tokens, pale surfaces, no motion beyond the kit's; logical properties (right to left);
 * nothing wider than the screen at 320 px (code and tables wrap, docs/UI_MAP.md "Small screens").
 */
import { css } from 'lit';

export const LU_CSS = css`
  .lu {
    --lu-ink2: var(--ink2, #5b6172);
    --lu-line: var(--line, #ebe7dd);
    --lu-ok: var(--t1, var(--ok-bg, #e3f7ef));
    --lu-ok-ink: var(--t1i, #0b6b50);
    --lu-bad: var(--t3, var(--bad-bg, #fde8e8));
    --lu-bad-ink: var(--t3i, #a3262a);
    --lu-soft: var(--acc-soft, var(--c-bg, #efebff));
    --lu-acc: var(--acc-text, var(--c-ink, #6a4ae6));
  }
  .lu * {
    box-sizing: border-box;
  }
  .lu .lu-body {
    display: grid;
    gap: 12px;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .lu p {
    margin: 0;
  }
  .lu .lu-lead {
    color: var(--ink, #1f2330);
  }
  .lu .lu-muted {
    color: var(--lu-ink2);
    font-size: 0.92em;
  }
  .lu .lu-ok {
    padding: 10px 12px;
    border-radius: var(--r-sm, 12px);
    background: var(--lu-ok);
    color: var(--lu-ok-ink);
  }
  .lu .lu-bad {
    display: grid;
    gap: 8px;
    padding: 10px 12px;
    border-radius: var(--r-sm, 12px);
    background: var(--lu-bad);
    color: var(--lu-bad-ink);
  }
  .lu .lu-bad noema-button {
    justify-self: start;
  }
  .lu .lu-steps {
    margin: 0;
    padding-inline-start: 1.3em;
    display: grid;
    gap: 6px;
  }
  .lu .lu-summary {
    padding: 10px 12px;
    border-radius: var(--r-sm, 12px);
    background: var(--lu-soft);
  }
  .lu .lu-summary > :first-child {
    margin-top: 0;
  }
  .lu .lu-summary > :last-child {
    margin-bottom: 0;
  }
  .lu .lu-counts {
    color: var(--lu-ink2);
    font-size: 0.92em;
  }
  .lu .lu-notes {
    margin: 0;
    padding-inline-start: 1.2em;
    color: var(--lu-ink2);
    font-size: 0.92em;
  }
  .lu .lu-choice {
    margin: 0;
    padding: 10px 12px 12px;
    border: 1px solid var(--lu-line);
    border-radius: var(--r-sm, 12px);
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  .lu .lu-choice legend {
    padding: 0 4px;
    font-weight: 600;
  }
  .lu .lu-opt {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    cursor: pointer;
  }
  .lu .lu-opt input {
    margin-top: 0.25em;
    flex: none;
    accent-color: var(--acc, #7c5cff);
  }
  .lu .lu-rec {
    padding: 1px 8px;
    border-radius: 999px;
    background: var(--lu-soft);
    color: var(--lu-acc);
    font-size: 0.8em;
    white-space: nowrap;
  }
  .lu .lu-h {
    margin: 6px 0 0;
    font-size: 1rem;
  }
  .lu .lu-chgroup {
    display: grid;
    gap: 8px;
    min-width: 0;
  }
  .lu .lu-chtitle {
    margin: 10px 0 0;
    padding-bottom: 4px;
    border-bottom: 1px solid var(--lu-line);
    font-size: 1rem;
  }
  .lu .lu-sec {
    display: grid;
    gap: 6px;
    min-width: 0;
  }
  .lu .lu-sec h4 {
    margin: 4px 0 0;
    font-size: 0.95rem;
  }
  .lu .lu-blk {
    padding: 6px 10px;
    border-inline-start: 3px solid var(--lu-line);
    border-radius: 6px;
    min-width: 0;
  }
  .lu .lu-blk.added {
    border-inline-start-color: var(--lu-ok-ink);
    background: var(--lu-ok);
  }
  .lu .lu-blk.removed {
    border-inline-start-color: var(--lu-bad-ink);
    background: var(--lu-bad);
    text-decoration: line-through;
    opacity: 0.8;
  }
  .lu .lu-blk > :first-child {
    margin-top: 0;
  }
  .lu .lu-blk > :last-child {
    margin-bottom: 0;
  }
  .lu .lu-same {
    color: var(--lu-ink2);
    font-size: 0.85em;
    font-style: italic;
  }
  .lu .lu-tag {
    display: inline-block;
    margin-inline-end: 6px;
    padding: 0 8px;
    border-radius: 999px;
    background: var(--paper, #fff);
    color: var(--lu-ink2);
    font-size: 0.8em;
    font-weight: 400;
  }
  .lu .lu-tag.add {
    background: var(--lu-ok);
    color: var(--lu-ok-ink);
  }
  .lu .lu-code {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    font: 0.85em/1.45 var(--mono, ui-monospace, monospace);
  }
  .lu .lu-table {
    border-collapse: collapse;
    font-size: 0.9em;
    table-layout: fixed;
    width: 100%;
  }
  .lu .lu-table th,
  .lu .lu-table td {
    padding: 3px 6px;
    border: 1px solid var(--lu-line);
    overflow-wrap: anywhere;
    text-align: start;
  }
  .lu details summary {
    cursor: pointer;
  }
`;
