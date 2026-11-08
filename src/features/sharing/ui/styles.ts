/* 🔗 The share dialog and 🧭 Explore: pale panels, one quiet shake for the warning not yet acknowledged. */
import { css } from 'lit';

export const SHARE_CSS = css`
  .nx-share .nx-counts {
    margin: 0 0 12px;
  }
  .nx-share .nx-sec {
    border-top: 1px solid var(--line);
    padding-top: 12px;
    margin-top: 12px;
    display: grid;
    gap: 8px;
  }
  .nx-share .nx-sec h3 {
    margin: 0;
    font-size: 1rem;
  }
  .nx-share .nx-sec p {
    margin: 0;
  }
  .nx-share .nx-warn {
    color: var(--warn-ink, var(--ink));
  }
  .nx-share .nx-warn.shake {
    animation: nx-shake 0.3s;
  }
  @keyframes nx-shake {
    25% {
      transform: translateX(-4px);
    }
    75% {
      transform: translateX(4px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .nx-share .nx-warn.shake {
      animation: none;
      outline: 2px solid var(--acc);
    }
  }
  .nx-share .nx-prog:empty,
  .nx-share .nx-status:empty {
    display: none;
  }
  .nx-share .nx-sent {
    display: grid;
    gap: 6px;
  }
  .nx-share .nx-sentrow {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    min-height: 32px;
    overflow-wrap: anywhere;
  }
`;

export const NOTES_CSS = css`
  noema-share-row {
    display: block;
  }
  .nx-req {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
    overflow-wrap: anywhere;
  }
  .nx-req .nc-grow {
    flex: 1 1 200px;
    min-width: 0;
  }
  .nx-reqacts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .nx-noticeclear {
    justify-content: flex-end;
  }
`;

export const EXPLORE_CSS = css`
  .ex-view h1 {
    margin: 0 0 4px;
  }
  .ex-view .ex-lead {
    margin: 0 0 12px;
  }
  .ex-view .ex-q {
    width: 100%;
    margin-bottom: 12px;
  }
  .ex-view .ex-dom {
    border: 1px solid var(--line);
    border-radius: var(--r-md, 12px);
    margin-bottom: 8px;
    background: var(--paper);
  }
  .ex-view .ex-dom > summary {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 12px;
    cursor: pointer;
    list-style: none;
  }
  .ex-view .ex-dom > summary::-webkit-details-marker {
    display: none;
  }
  .ex-view .ex-domt {
    flex: 1;
    font-weight: 600;
  }
  .ex-view .ex-domchev {
    transition: transform 0.15s;
  }
  .ex-view .ex-dom[open] .ex-domchev {
    transform: rotate(90deg);
  }
  :dir(rtl) .ex-view .ex-domchev {
    transform: scaleX(-1);
  }
  :dir(rtl) .ex-view .ex-dom[open] .ex-domchev {
    transform: rotate(90deg);
  }
  .ex-view .ex-dom > .nc-list {
    padding: 0 8px 8px;
  }
  .ex-view .ex-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .ex-view .ex-row > .nc-item {
    flex: 1;
    min-width: 0;
  }
  .ex-info .ex-chapters {
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid var(--line);
    border-radius: var(--r-sm, 8px);
    padding: 4px 8px;
    margin: 4px 0 8px;
  }
  .ex-info .ex-chapters ol {
    margin: 0;
    padding-inline-start: 1.6em;
  }
  .ex-info .ex-chapters li {
    margin: 4px 0;
  }
  .ex-info .ex-facts {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin: 0 0 8px;
  }
`;
