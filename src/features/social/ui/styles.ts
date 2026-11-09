/** 👥 People, a conversation, a study group (docs/SOCIAL.md). Quiet, one column; the conversation fills the height. */
import { css } from 'lit';

export const SOCIAL_CSS = css`
  .so-lead {
    margin-top: -2px;
  }
  .so-view .so-find {
    width: 100%;
    margin: 6px 0 10px;
  }
  .so-found {
    margin-bottom: 12px;
  }
  .so-first {
    margin-bottom: 12px;
  }
  .so-tabs {
    margin: 4px 0 12px;
  }
  .so-count {
    display: inline-grid;
    place-items: center;
    min-width: 20px;
    height: 20px;
    padding: 0 6px;
    margin-inline-start: 6px;
    border-radius: 999px;
    background: var(--u-acc);
    color: var(--u-acc-ink);
    font-size: 0.72rem;
    font-weight: 700;
  }
  .so-room.unread .t b {
    font-weight: 800;
  }
  .so-prev {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }
  .so-when {
    display: grid;
    justify-items: end;
    gap: 2px;
    color: var(--u-ink3);
    white-space: nowrap;
  }
  .so-invite {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
    margin-bottom: 8px;
  }
  .so-person {
    flex-wrap: wrap;
  }
  .so-person .so-who {
    flex: 1 1 12em;
  }
  .so-joinby {
    margin-top: 14px;
  }
  .so-joinby summary {
    cursor: pointer;
    min-height: 24px;
    color: var(--u-ink2);
  }
  .so-joinby .nc-input {
    flex: 1 1 12em;
    min-width: 0;
  }
  .so-personhead,
  .so-grouptop {
    display: flex;
    gap: 12px;
    align-items: center;
    min-width: 0;
  }
  .so-grouptop h1 {
    margin: 0;
  }
  .so-personacts,
  .so-personmore,
  .so-groupacts {
    margin: 10px 0;
    flex-wrap: wrap;
  }
  .so-sec {
    margin: 12px 0;
  }
  .so-sec .nc-label {
    margin-top: 0;
  }
  .so-member {
    flex-wrap: wrap;
  }
  .so-member .so-who {
    flex: 1 1 12em;
  }
  .so-about {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .so-findsw {
    margin: 12px 0;
  }
  .so-dmfrom {
    margin: 6px 0 4px;
  }
  .so-gf-emoji .nc-input {
    width: 5em;
  }
  .so-joincard .nc-row {
    margin-top: 10px;
  }

  /* one conversation */
  .so-chatview {
    display: flex;
    flex-direction: column;
    min-height: calc(100dvh - 150px);
  }
  .so-grouphead {
    margin: 0 0 6px;
  }
  .so-earlier {
    align-self: center;
  }
  .so-msgs {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 6px 2px;
    min-height: 200px;
    max-height: calc(100dvh - 230px);
  }
  .so-day {
    text-align: center;
    margin: 10px 0 4px;
  }
  .so-msg {
    display: flex;
    align-items: flex-start;
    gap: 2px;
    max-width: min(560px, 88%);
    flex-wrap: wrap;
  }
  .so-msg.head {
    margin-top: 8px;
  }
  .so-msg.mine {
    align-self: flex-end;
    flex-direction: row-reverse;
  }
  .so-author {
    flex-basis: 100%;
    background: none;
    border: 0;
    padding: 0 10px;
    min-height: 24px;
    text-align: start;
    color: var(--u-acc-text);
    font: inherit;
    font-weight: 700;
    cursor: pointer;
  }
  .so-bubble {
    display: grid;
    gap: 4px;
    padding: 8px 12px;
    border-radius: 16px;
    background: var(--u-paper);
    border: 1px solid var(--u-line);
    min-width: 0;
    max-width: calc(100% - 40px);
  }
  .so-msg.mine .so-bubble {
    background: var(--u-acc-soft);
    border-color: transparent;
  }
  .so-msg.deleted .so-bubble {
    opacity: 0.7;
  }
  .so-text {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .so-time {
    color: var(--u-ink3);
    justify-self: end;
  }
  .so-att {
    display: grid;
    gap: 6px;
    padding: 8px 10px;
    border-radius: 12px;
    background: var(--u-bg);
    min-width: 0;
  }
  .so-atthead {
    display: flex;
    gap: 8px;
    align-items: center;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .so-atthead svg.i {
    width: 18px;
    height: 18px;
    flex: none;
  }
  .so-emo {
    font-size: 1.3rem;
  }
  .so-attprev img,
  .so-attprev video {
    max-width: 100%;
    border-radius: 10px;
  }
  .so-attprev audio {
    width: 100%;
  }
  .so-attprev iframe {
    width: 100%;
    height: 50vh;
    border: 0;
    border-radius: 10px;
  }
  .so-composer {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    padding: 8px 0 4px;
    border-top: 1px solid var(--u-line);
    background: var(--u-bg);
    position: sticky;
    bottom: 0;
  }
  .so-composer .so-box {
    flex: 1;
    min-width: 0;
    resize: none;
    max-height: 160px;
  }
  .so-status:empty {
    display: none;
  }
`;

/** The page others see (#/profile, #/u/<id>): the picture and the words on top, the parts below, quiet. */
export const PROFILE_CSS = css`
  .pf-head {
    display: flex;
    align-items: flex-start;
    gap: 14px;
    margin: 4px 0 8px;
  }
  .pf-face .nc-face {
    width: 72px;
    height: 72px;
    font-size: 2rem;
  }
  .pf-bio {
    margin: 0.3em 0 0;
    color: var(--u-ink2);
    white-space: pre-line;
    overflow-wrap: anywhere;
  }
  .pf-part {
    display: grid;
    gap: 8px;
  }
  .pf-part .nc-label {
    margin: 0;
  }
  .pf-part .nc-list {
    margin: 0;
  }
  .pf-share {
    width: 100%;
  }
  .pf-foot {
    display: grid;
    gap: 8px;
    margin-top: 12px;
  }
  .pf-foot p {
    margin: 0;
  }
  .pf-state {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .pf-state svg {
    width: 16px;
    height: 16px;
  }
  .pf-edit {
    display: grid;
    gap: 10px;
  }
  .pf-picrow {
    gap: 14px;
  }
  .pf-switches {
    padding: 0 14px;
  }
  .pf-switch + .pf-switch {
    border-top: 1px solid var(--u-line);
  }
  .pf-link {
    overflow-wrap: anywhere;
    user-select: all;
  }
`;
