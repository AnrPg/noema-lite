/** The search page and the quick sheet (docs/SEARCH.md): calm, one column, the found word lightly marked. */
import { css } from 'lit';

export const SEARCH_CSS = css`
  .ns-searchview {
    display: grid;
    gap: 14px;
  }
  .ns-srin.nc-input {
    font-size: 1.05rem;
    padding-inline: 14px;
  }
  .ns-srrow {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .ns-sracts {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .ns-srkinds,
  .ns-srkgrp {
    display: grid;
    gap: 6px;
  }
  .ns-srkgrp small {
    font-size: 0.76rem;
    color: var(--u-ink2);
  }
  .ns-srchips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    min-width: 0;
  }
  .ns-srchip {
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 12px;
    border-radius: 999px;
    border: 1px solid var(--u-line);
    background: var(--u-paper);
    color: var(--u-ink2);
    font: inherit;
    font-size: 0.86rem;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
  }
  .ns-srchip .n {
    font-weight: 400;
    color: var(--u-ink3);
    font-size: 0.8rem;
  }
  .ns-srchip.on {
    background: var(--u-acc-soft);
    border-color: transparent;
    color: var(--u-acc-text);
  }
  .ns-srchip.on .n {
    color: inherit;
  }
  .ns-srchip:focus-visible,
  .ns-sr:focus-visible,
  .ns-srfold:focus-visible {
    outline: 2px solid var(--u-acc-text);
    outline-offset: -2px;
  }
  .ns-srfilters {
    display: grid;
    gap: 12px;
  }
  .ns-srfrow {
    display: flex;
    flex-direction: column;
    gap: 6px;
    align-items: flex-start;
  }
  .ns-srfrow .nc-label {
    margin: 0;
  }
  .ns-srsaved {
    align-self: center;
  }
  .ns-srprog {
    position: relative;
    display: grid;
    gap: 2px;
    font-size: 0.82rem;
    color: var(--u-ink3);
    padding-bottom: 6px;
  }
  .ns-srprogbar {
    position: absolute;
    inset-inline-start: 0;
    bottom: 0;
    height: 2px;
    border-radius: 2px;
    background: var(--u-acc);
    opacity: 0.5;
    transition: width 0.4s;
  }
  .ns-srgroups {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .ns-srgroups.compact {
    gap: 12px;
  }
  .ns-srgrp {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .ns-srh {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .ns-srh .nc-label {
    margin: 0;
  }
  .ns-srfold {
    width: 100%;
    min-height: 36px;
    background: none;
    border: 0;
    padding: 6px 0;
    color: inherit;
    font: inherit;
    cursor: pointer;
    text-align: start;
    border-radius: 8px;
  }
  .ns-srfold .ns-chev {
    margin-inline-start: auto;
    color: var(--u-ink3);
    transition: transform var(--u-fast);
  }
  .ns-srgrp.open .ns-srfold .ns-chev {
    transform: rotate(90deg);
  }
  .ns-srlist {
    display: flex;
    flex-direction: column;
    background: var(--u-paper);
    border: 1px solid var(--u-line);
    border-radius: var(--u-r);
    overflow: hidden;
  }
  .ns-srlist > * + * {
    border-top: 1px solid var(--u-line);
  }
  .ns-srexact .ns-sr {
    background: var(--u-paper);
    border: 1px solid var(--u-line);
    border-radius: var(--u-r);
  }
  .ns-sr {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 3px;
    width: 100%;
    min-width: 0;
    text-align: start;
    padding: 12px 16px;
    border: 0;
    background: none;
    font: inherit;
    color: var(--u-ink);
    cursor: pointer;
  }
  .ns-sr:hover {
    background: color-mix(in srgb, var(--u-acc-soft) 45%, transparent);
  }
  .ns-srtop {
    display: flex;
    align-items: center;
    gap: 8px;
    justify-content: space-between;
  }
  .ns-srk {
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--u-ink3);
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .ns-srw {
    font-size: 0.7rem;
  }
  .ns-srt {
    font-weight: 700;
    overflow: hidden;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }
  .ns-srsn {
    color: var(--u-ink2);
    font-size: 0.92rem;
    line-height: 1.45;
    overflow-wrap: anywhere;
  }
  .ns-srsn mark {
    background: color-mix(in srgb, var(--u-acc) 22%, transparent);
    color: var(--u-ink);
    border-radius: 3px;
    padding: 0 1px;
  }
  .ns-srvia {
    font-size: 0.84rem;
    color: var(--u-acc-text);
  }
  .ns-srpath {
    font-size: 0.8rem;
    color: var(--u-ink3);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ns-srmore {
    align-self: flex-start;
    font-size: 0.88rem;
  }
  .ns-srquick .ns-sr {
    padding: 10px 14px;
  }
  .ns-srquickbody {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .ns-srround {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    background: var(--u-warn);
    border-color: transparent;
  }
  .ns-srcols,
  .ns-srrecent {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ns-srcols .nc-item,
  .ns-srrecent .nc-item {
    padding-inline-end: 6px;
  }
  .ns-searchview [hidden],
  .ns-srsheet [hidden] {
    display: none !important;
  }
`;
