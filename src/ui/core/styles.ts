/**
 * The CSS every component starts from. Colours, fonts, shapes and motion come only from the design tokens (src/ui/tokens →
 * engine/tokens.css, custom properties that inherit into every shadow root): the character's palette (--paper, --acc …)
 * when a character is applied (data-m), the base set's (--card, --c …) before. Text sits only on the surfaces the tokens'
 * contrast table names (contrast.ts TEXT_ON): inks on any surface, a tint's ink on its tint, --acc-ink on --acc, and the
 * accent as text is always --acc-text.
 *
 * Motion is few and subtle (the owner's rule): fades and short slides, scaled by --u-motion, which the appearance sets to 0
 * for "reduced motion" (the system's or the app's setting: appearance.ts).
 */
import { css } from 'lit';

export const base = css`
  :host {
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
    --u-ir: var(--ir, 10px);
    --u-font: var(--font, system-ui, sans-serif);
    --u-display: var(--display, var(--u-font));
    --u-shadow: var(--shadow, 0 8px 24px -12px rgba(31, 35, 48, 0.18));
    --u-fast: calc(var(--motion-fast, 0.15s) * var(--u-motion, 1));
    --u-base: calc(var(--motion-base, 0.2s) * var(--u-motion, 1));
    --u-ease: var(--ease, ease);
    --u-focus: var(--u-acc-text);
    box-sizing: border-box;
    font-family: var(--u-font);
    color: var(--u-ink);
  }
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }
  :focus-visible {
    outline: 2px solid var(--u-focus);
    outline-offset: 2px;
  }
  [hidden] {
    display: none !important;
  }
  .vh {
    position: absolute !important;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
    border: 0;
  }
  svg.i {
    width: 20px;
    height: 20px;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: var(--sw, 1.8);
    stroke-linecap: var(--cap, round);
    stroke-linejoin: round;
  }
  svg.i.flip {
    transform: scaleX(var(--u-flip, 1));
  }
`;

/** A control people press: at least 24 × 24 px (WCAG 2.2 2.5.8), the kit's own are 40 px high (32 px for chips and small). */
export const control = css`
  .ctl {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 40px;
    min-width: 40px;
    padding: 0 16px;
    border: 1px solid transparent;
    border-radius: var(--u-br);
    font: inherit;
    font-weight: 600;
    font-size: 0.95rem;
    line-height: 1.2;
    text-decoration: none;
    cursor: pointer;
    background: none;
    color: inherit;
    transition:
      background-color var(--u-fast) var(--u-ease),
      border-color var(--u-fast) var(--u-ease),
      box-shadow var(--u-fast) var(--u-ease);
    -webkit-tap-highlight-color: transparent;
  }
  .ctl[disabled],
  .ctl[aria-disabled='true'] {
    opacity: 0.55;
    cursor: not-allowed;
  }
`;

/** A floating panel (menus, tips, popovers): paper, a hairline, a soft shadow, positioned by place.ts. */
export const panel = css`
  .panel {
    position: fixed;
    z-index: var(--z-popover, 96);
    min-width: 200px;
    max-width: min(340px, calc(100vw - 16px));
    overflow: auto;
    background: var(--u-paper);
    color: var(--u-ink);
    border: 1px solid var(--u-line);
    border-radius: var(--u-br);
    box-shadow: var(--u-shadow);
    animation: u-pop var(--u-fast) var(--u-ease);
  }
  @keyframes u-pop {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
`;
