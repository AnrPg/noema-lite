/**
 * The small DOM toolkit the older screens draw with inside the frame (window.NoemaShell.h, .menuButton, .sheet, .modal
 * …): their pages, dialogs and ⋮ menus keep the classes engine/src/95_shell.css styles. Text is always text (titles come
 * from packs and other people); only `html` sets markup, and only the app's own (icons, art).
 */
export type Kid = Node | string | number | null | undefined | false | readonly Kid[];
export type Attrs = Record<string, unknown>;

/** a value as text: strings and numbers as they are, anything else as JSON */
const text = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : JSON.stringify(v));

export function h(tag: string, attrs?: Attrs | null, ...kids: Kid[]): HTMLElement {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = text(v);
    else if (k === 'html') e.innerHTML = text(v);
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v as EventListener);
    else e.setAttribute(k, v === true ? '' : text(v));
  }
  const add = (k: Kid): void => {
    if (k == null || k === false) return;
    if (Array.isArray(k)) {
      for (const x of k as readonly Kid[]) add(x);
      return;
    }
    e.append(k instanceof Node ? k : document.createTextNode(text(k)));
  };
  for (const k of kids) add(k);
  return e;
}

/** Optional parts are written as `cond ? node : null`: append() and its kin never render them as the text "null". */
export function guardDom(): void {
  type Proto = Record<string, unknown> & { __noemaGuard?: boolean };
  for (const proto of [Element.prototype, DocumentFragment.prototype] as unknown as Proto[])
    for (const fn of ['append', 'prepend', 'before', 'after', 'replaceWith']) {
      const orig = proto[fn] as ((...xs: unknown[]) => unknown) & { __noemaGuard?: boolean };
      if (typeof orig !== 'function' || orig.__noemaGuard) continue;
      const guarded = function (this: unknown, ...xs: unknown[]) {
        return orig.apply(this, xs.filter(x => x != null && x !== false));
      } as ((...xs: unknown[]) => unknown) & { __noemaGuard?: boolean };
      guarded.__noemaGuard = true;
      proto[fn] = guarded;
    }
}

export const tone = (n: number): Record<string, string> => ({ '--bgc': `var(--t${String(n)})`, '--fgc': `var(--t${String(n)}i)` });

/** A ⋮ menu's item: an action, a link, a line ('-') or nothing (null: skipped). */
export interface MenuItem {
  readonly label: string;
  readonly sub?: string | null;
  readonly icon?: string | Node | null;
  readonly run?: (e: Event) => void;
  readonly href?: string | null;
  readonly danger?: boolean;
  readonly disabled?: boolean;
  readonly cls?: string;
  readonly badge?: string | null;
  readonly tone?: number;
}
export type MenuEntry = MenuItem | '-' | null | undefined | false;

export function closePops(): boolean {
  const p = document.querySelectorAll('.ns-pop');
  p.forEach(x => {
    x.remove();
  });
  document.querySelectorAll('[data-pop][aria-expanded="true"]').forEach(b => {
    b.setAttribute('aria-expanded', 'false');
  });
  return p.length > 0;
}

export interface DomKit {
  readonly svg: (k: string, cls?: string) => HTMLElement;
  readonly pill: (x: Kid, n?: number, cls?: string) => HTMLElement;
  readonly hasIcon: (k: string) => boolean;
  readonly go: (href: string) => void;
}

/** A pop-over list of actions under (or over) its button, kept on the screen; ↑ ↓ move between its items. */
export function popMenu(kit: DomKit, anchor: HTMLElement, items: readonly MenuEntry[], { down = true }: { down?: boolean } = {}): HTMLElement {
  const list = items.filter((x): x is MenuItem | '-' => !!x);
  const pop = h(
    'div',
    { class: 'ns-pop' + (down ? ' down' : ''), role: 'menu' },
    ...list.map(it =>
      it === '-'
        ? h('hr')
        : h(
            'button',
            {
              role: 'menuitem',
              class: [it.danger ? 'danger' : '', it.cls ?? ''].join(' ').trim() || null,
              disabled: it.disabled || null,
              onclick: (e: Event) => {
                e.stopPropagation();
                closePops();
                if (it.href) kit.go(it.href);
                else it.run?.(e);
              },
            },
            it.icon ? h('span', { class: 'mi' }, typeof it.icon === 'string' && it.icon.length > 2 && kit.hasIcon(it.icon) ? kit.svg(it.icon) : it.icon) : null,
            h('span', { class: 'mt' }, it.label, it.sub ? h('small', {}, it.sub) : null),
            it.badge ? kit.pill(it.badge, it.tone ?? 1) : null,
          ),
    ),
  );
  anchor.parentElement?.append(pop);
  anchor.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => {
    const a = anchor.getBoundingClientRect(),
      r = pop.getBoundingClientRect();
    if (r.right > innerWidth - 8) pop.style.right = '0';
    if (r.left < 8) {
      pop.style.left = '0';
      pop.style.right = 'auto';
    }
    const q = pop.getBoundingClientRect(),
      vw = Math.min(innerWidth, screen.width || innerWidth); // a phone's screen, even when something already made the page wider
    if (q.right > vw - 8 || q.left < 8) {
      // still past an edge (a narrow phone): pin it to the screen, under (or over) its button
      const wd = Math.min(q.width, vw - 16),
        x = Math.max(8, Math.min(a.right - wd, vw - wd - 8));
      Object.assign(pop.style, { insetInlineStart: 'auto', insetInlineEnd: 'auto' });
      Object.assign(pop.style, { position: 'fixed', left: `${String(x)}px`, right: 'auto', width: `${String(wd)}px`, minWidth: '0' });
      if (down) pop.style.top = `${String(a.bottom + 6)}px`;
      else {
        pop.style.top = 'auto';
        pop.style.bottom = `${String(innerHeight - a.top + 6)}px`;
      }
    }
    if (!down) return;
    const below = innerHeight - a.bottom - 14,
      above = a.top - 70; // up only when it does not fit below and there is more room above
    if (r.height > below && above > below) {
      pop.classList.add('up');
      pop.style.maxHeight = `${String(above)}px`;
      if (pop.style.position === 'fixed') Object.assign(pop.style, { top: 'auto', bottom: `${String(innerHeight - a.top + 6)}px` });
    } else pop.style.maxHeight = `${String(Math.max(below, 220))}px`;
  });
  pop.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus({ preventScroll: true });
  pop.addEventListener('keydown', e => {
    const bs = [...pop.querySelectorAll<HTMLButtonElement>('button:not([disabled])')],
      i = bs.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      bs[(i + 1) % bs.length]?.focus();
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      bs[(i - 1 + bs.length) % bs.length]?.focus();
    }
  });
  return pop;
}

/** A ⋮ button with its list of actions (items: a list, or a function that makes it when opened); dot: something waits in it. */
export function menuButton(
  kit: DomKit,
  items: readonly MenuEntry[] | (() => readonly MenuEntry[]),
  { label, cls = 'ns-iconbtn', content = null, down = true, dot = false }: { label: string; cls?: string; content?: Node | null; down?: boolean; dot?: boolean },
): HTMLElement {
  const b: HTMLElement = h(
    'button',
    {
      class: cls + ' ns-menubtn' + (dot ? ' has-dot' : ''),
      'data-pop': '1',
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
      'aria-label': label,
      title: label,
      onclick: (e: Event) => {
        e.stopPropagation();
        const had = b.parentElement?.querySelector(':scope > .ns-pop');
        closePops();
        if (!had) popMenu(kit, b, typeof items === 'function' ? items() : items, { down });
      },
    },
    content ?? kit.svg('dots'),
    dot ? h('i', { class: 'ns-dot', 'aria-hidden': 'true' }) : null,
  );
  return h('span', { class: 'ns-menu' }, b);
}

/** Buttons in one row when they all fit, else one under the other (never ragged). */
export function fitRow(...kids: Kid[]): HTMLElement {
  const r = h('div', { class: 'ns-fitrow' }, ...kids);
  let w = -1;
  const fit = (): void => {
    if (!r.isConnected || r.clientWidth === w) return;
    w = r.clientWidth;
    r.classList.remove('stack');
    if (r.scrollWidth > r.clientWidth + 1) r.classList.add('stack');
  };
  // (next frame: a class change inside the callback would loop the observer)
  new ResizeObserver(() => requestAnimationFrame(fit)).observe(r);
  requestAnimationFrame(fit);
  return r;
}

let tipsWired = false;
/** A short label, its explanation in a quiet bubble on hover or focus (kept inside the screen). */
export function tipped<E extends HTMLElement>(el: E, text: string): E {
  el.setAttribute('aria-description', text);
  let t: HTMLElement | null = null;
  const hide = (): void => {
    t?.remove();
    t = null;
  };
  const show = (): void => {
    hide();
    const tip = h('div', { class: 'ns-hovertip', role: 'tooltip' }, text);
    t = tip;
    document.body.append(tip);
    const a = el.getBoundingClientRect(),
      r = tip.getBoundingClientRect();
    let y = a.top - r.height - 8;
    if (y < 8) y = a.bottom + 8;
    Object.assign(tip.style, { left: `${String(Math.max(8, Math.min(innerWidth - r.width - 8, a.left + a.width / 2 - r.width / 2)))}px`, top: `${String(y)}px` });
  };
  for (const [k, f] of [
    ['mouseenter', show],
    ['mouseleave', hide],
    ['focus', show],
    ['blur', hide],
    ['click', hide],
  ] as const)
    el.addEventListener(k, f);
  if (!tipsWired) {
    tipsWired = true;
    addEventListener('hashchange', () => {
      document.querySelectorAll('.ns-hovertip').forEach(x => {
        x.remove();
      });
    });
  }
  return el;
}

/** A window in the middle of the screen: focus moves into it, Tab stays inside, and closing gives focus back to what opened it. */
export function modal(
  layer: HTMLElement,
  title: string,
  build: (w: { head: HTMLElement; body: HTMLElement; close: () => void; refocus: () => void }) => void,
  { cls = '' }: { cls?: string } = {},
): () => void {
  const opener = document.activeElement as HTMLElement | null;
  const close = (): void => {
    layer.replaceChildren();
    if (opener?.isConnected) opener.focus();
  };
  const head = h('div', { class: 'ns-mdhead' }),
    body = h('div', { class: 'ns-mdbody' });
  const win: HTMLElement = h(
    'div',
    {
      class: 'ns-modal ns-mdwin ' + cls,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title,
      tabindex: '-1',
      onkeydown: (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          close();
          return;
        }
        if (e.key !== 'Tab') return;
        const f = [...win.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,summary')].filter(
          x => !(x as HTMLButtonElement).disabled && x.getClientRects().length,
        );
        const first = f[0],
          last = f[f.length - 1];
        if (!first || !last) return;
        const a = document.activeElement;
        if (e.shiftKey && (a === first || a === win)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && a === last) {
          e.preventDefault();
          first.focus();
        }
      },
    },
    head,
    body,
  );
  const refocus = (): void => {
    if (!win.contains(document.activeElement)) win.focus();
  }; // after a re-render dropped the focused button
  layer.replaceChildren(h('div', { class: 'ns-scrim', onclick: close }), win);
  build({ head, body, close, refocus });
  refocus();
  return close;
}
