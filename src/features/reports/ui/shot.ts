/**
 * ⚑ The screenshot (the window as it is: modern-screenshot, loaded on the first report) and 🎯 pointing at the thing
 * that is wrong (the dialog steps aside, the element under the pointer is framed, a click picks it, Escape gives up).
 */
import type { CommunityHost } from '../../community/ui/host.ts';
import { closestComposed, deepElementFromPoint } from './locate.ts';

/** a JPEG of what is in the window now (a data: URL of at most ~1.4 MB), or null */
export async function shoot(host: CommunityHost, win: Window): Promise<string | null> {
  const doc = win.document;
  try {
    const M = await host.report.screenshots();
    const y = Math.round(win.scrollY),
      x = Math.round(win.scrollX),
      w = doc.documentElement.clientWidth || win.innerWidth,
      hgt = doc.documentElement.clientHeight || win.innerHeight;
    const bg = win.getComputedStyle(doc.body).backgroundColor;
    const scale = Math.min(win.devicePixelRatio || 1, 1600 / w, 1.5);
    const make = (q: number, s: number): Promise<string> =>
      M.domToJpeg(doc.documentElement, {
        width: w,
        height: hgt,
        scale: s,
        quality: q,
        backgroundColor: bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : '#ffffff',
        timeout: 6000,
        filter: (n: Node) => !(n instanceof Element && n.matches('.nr-skip, .ns-layer > *, script')),
        // the window's part of the page: the page moves up by the scroll; fixed bars stay where they are
        onCloneNode: (c: Node) => {
          const b = c instanceof Element ? c.querySelector('body') : null;
          if (!b || !(c instanceof HTMLElement)) return;
          Object.assign(c.style, { overflow: 'visible', height: String(hgt) + 'px' });
          Object.assign(b.style, {
            position: 'relative',
            top: String(-y) + 'px',
            left: String(-x) + 'px',
            overflow: 'visible',
            height: 'auto',
            maxHeight: 'none',
          });
        },
      });
    let url = await make(0.72, scale);
    if (url.length > 1400000) url = await make(0.55, Math.min(scale, 1));
    return url.length <= 2900000 && url.startsWith('data:image/jpeg;base64,') ? url : null;
  } catch (e) {
    console.warn('[report] screenshot', e instanceof Error ? e.message : e); // i18n-ignore (a log): the report goes without a picture
    return null;
  }
}

const SWALLOW = ['click', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend'] as const;

/** 🎯 → the element clicked, or null (Escape) */
export function pointAt(win: Window, hint: string): Promise<Element | null> {
  const doc = win.document;
  return new Promise(done => {
    const box = doc.createElement('div');
    box.className = 'nr-hl nr-skip';
    const tip = doc.createElement('div');
    tip.className = 'nr-tip nr-skip';
    tip.textContent = hint;
    tip.setAttribute('role', 'status');
    doc.body.append(box, tip);
    let cur: Element | null = null;
    const under = (x: number, y: number): Element | null => {
      const e = deepElementFromPoint(doc, x, y);
      return e && !closestComposed(e, '.nr-skip') ? e : null;
    };
    const show = (e: Element | null): void => {
      cur = e;
      if (!e) {
        box.style.display = 'none';
        return;
      }
      const r = e.getBoundingClientRect();
      Object.assign(box.style, {
        display: 'block',
        left: String(r.left - 3) + 'px',
        top: String(r.top - 3) + 'px',
        width: String(r.width + 6) + 'px',
        height: String(r.height + 6) + 'px',
      });
    };
    const move = (ev: PointerEvent): void => {
      show(under(ev.clientX, ev.clientY));
    };
    const stop = (ev: Event): void => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
    };
    const end = (el: Element | null): void => {
      win.removeEventListener('pointermove', move, true);
      for (const t of SWALLOW) win.removeEventListener(t, swallow, true);
      win.removeEventListener('keydown', key, true);
      tip.remove();
      box.remove();
      done(el);
    };
    const swallow = (ev: Event): void => {
      stop(ev);
      if (ev.type !== 'click' || !(ev instanceof MouseEvent)) return;
      const e = under(ev.clientX, ev.clientY) ?? cur;
      if (e) {
        show(e);
        end(e);
      }
    };
    const key = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Escape') return;
      stop(ev);
      end(null);
    };
    win.addEventListener('pointermove', move, true);
    for (const t of SWALLOW) win.addEventListener(t, swallow, { capture: true, passive: false });
    win.addEventListener('keydown', key, true);
  });
}
