/** The few styles the Roadmap screens share (on the kit's tokens: pale surfaces, the inks on them, the kit's motion). */
import { css } from 'lit';

export const screen = css`
  p {
    margin: 0 0 12px;
    line-height: 1.5;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .grow {
    flex: 1 1 12em;
    min-width: 0;
  }
  .tiny {
    font-size: 0.875rem;
    color: var(--u-ink2);
  }
  .status {
    margin: 12px 0 0;
    padding: 10px 12px;
    border-radius: var(--u-br);
    background: var(--u-info);
    color: var(--u-info-ink);
    overflow-wrap: anywhere;
  }
  .status.ok {
    background: var(--u-ok);
    color: var(--u-ok-ink);
  }
  .status.bad {
    background: var(--u-bad);
    color: var(--u-bad-ink);
  }
  ul.changes {
    margin: 0 0 12px;
    padding-inline-start: 1.2em;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }
  ul.changes li + li {
    margin-top: 4px;
  }
`;
