/**
 * 💡 Explain this: a small icon in the top corner of a part of the lesson (shown on hover; always faintly on touch screens).
 * It opens the tutor in Explain mode with that part as the focus and its section and chapter as the wider context. The
 * study pages decorate their blocks with it (TutorPort.explainable); the elements are the study area's.
 */
import type { ExplainRequest } from '../application/tutor.ts';

export function explainable(
  el: HTMLElement,
  get: () => ExplainRequest,
  o: { readonly title: string; readonly aria: string; readonly explain: (r: ExplainRequest) => void },
): HTMLElement {
  if ([...el.children].some(k => k.classList.contains('xbtn'))) return el;
  el.classList.add('xable');
  const b = document.createElement('button');
  b.className = 'xbtn';
  b.type = 'button';
  b.title = o.title;
  b.setAttribute('aria-label', o.aria);
  b.textContent = '💡';
  b.addEventListener('click', e => {
    e.stopPropagation();
    e.preventDefault();
    o.explain(get());
  });
  // a block with its own buttons on top (a picture's ⤢, a question set's recall switch) takes the 💡 into that row, so it never covers them
  const dock = el.querySelector(':scope > .vx-fig > .vx > .vx-tools, :scope > .ask > .hd');
  if (dock) {
    b.classList.add('docked');
    const zoom = dock.querySelector(':scope > .vx-zoom');
    if (zoom) dock.insertBefore(b, zoom);
    else dock.append(b);
  } else el.append(b);
  return el;
}
