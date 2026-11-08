/**
 * The exercise types for critical thinking (CONTENT_SPEC.md, Q5 / paradigms): find the flaw, a case of several parts,
 * predict, a decision tree, inquiry (which test tells the most), and a debate. Same contract as basic.ts.
 */
import { h, letter, shuffle } from '../dom.ts';
import { codeEl, fEl } from '../parts.ts';
import { fmt, guessLang, highlight } from '../text.ts';
import { calc, mcq, newer, tf } from './basic.ts';
import { indices, strings, verdictOf, type Renderer, type Widget, type WidgetApi } from './widget.ts';

const label = (text: string, top = '12px'): HTMLDivElement => h('div', { class: 'lbl', style: { margin: `${top} 0 6px` } }, text);

export const flaw: Renderer = ({ app, ex, api }) => {
  const lines = strings(ex.lines),
    reasons = strings(ex.reasons);
  const sel = new Set<number>(),
    bad = new Set(indices(ex.flaws));
  const code = !!ex.asCode || !!ex.lang;
  const lang = ex.lang ?? guessLang(lines.join('\n'));
  const btns = lines.map((l, i) =>
    h(
      'button',
      {
        onclick: () => {
          if (api.locked()) return;
          if (sel.has(i)) sel.delete(i);
          else sel.add(i);
          btns[i]?.classList.toggle('sel');
        },
      },
      h('span', { class: 'ln' }, app.nf(i + 1)),
      code ? h('span', { html: highlight(l, lang) }) : h('span', { class: 'prose' }, fEl(l)),
    ),
  );
  let why: number | null = null;
  const whyBtns = reasons.map((r, i) =>
    h(
      'button',
      {
        class: 'opt',
        onclick: () => {
          if (api.locked()) return;
          why = i;
          whyBtns.forEach((b, k) => b.classList.toggle('sel', k === i));
        },
      },
      h('span', { class: 'k' }, letter(i)),
      h('span', {}, fEl(r)),
    ),
  );
  const whyBox = h('div', { class: 'opts' }, whyBtns);
  return {
    el: h(
      'div',
      {},
      h('div', { class: 'tiny', style: { marginBottom: '8px' } }, app.t('engine.ex.flawHint', { n: bad.size })),
      h('div', { class: `codelines${code ? '' : ' prose'}` }, btns),
      label(app.t('engine.ex.flawWhy')),
      whyBox,
    ),
    answer: () => ({ lines: [...sel], reason: why }),
    check: () => verdictOf(ex, { lines: [...sel], reason: why }).ok,
    given: () =>
      [...sel]
        .sort((a, b) => a - b)
        .map(i => `line ${String(i + 1)}`)
        .join(', ') + (why === null ? '' : ` — because: ${reasons[why] ?? ''}`),
    reveal() {
      btns.forEach((b, i) => {
        if (bad.has(i)) b.classList.add('right');
        else if (sel.has(i)) b.classList.add('wrong');
      });
      whyBtns.forEach((b, i) => {
        if (i === ex.reason) b.classList.add('right');
        else if (i === why) b.classList.add('wrong');
      });
      if (ex.fix)
        whyBox.after(
          h(
            'div',
            { class: 'fb ok' },
            h('b', {}, `🔧 ${app.t('engine.ex.fix')} `),
            code && /\n|;|\(|=/.test(ex.fix) ? codeEl(ex.fix, lang, app.t('engine.core.copy')) : h('span', { html: fmt(ex.fix) }),
          ),
        );
    },
  };
};

/** the renderer of a case's part (its own type; anything else is "newer") */
const PART_TYPES: Readonly<Record<string, Renderer>> = { mcq, tf, calc };

export const caseType: Renderer = ({ app, ex, api, media }) => {
  const quiet: WidgetApi = { locked: () => api.locked(), check: () => undefined, done: () => undefined };
  const all = ex.parts ?? [];
  const parts = all.map((p, i) => {
    const w: Widget = (PART_TYPES[p.type] ?? newer)({ app, ex: { ...p, id: `${ex.id}/${String(i)}` }, api: quiet, media });
    const box = h(
      'div',
      { class: 'casepart' },
      h(
        'div',
        { class: 'sp' },
        h('span', { class: 'pill c' }, app.t('engine.ex.casePart', { n: i + 1, of: all.length })),
        ' ',
        h('span', { html: fmt(p.q) }),
      ),
      w.el,
    );
    return { p, w, box };
  });
  const answer = (): { parts: unknown[] } => ({ parts: parts.map(x => x.w.answer?.() ?? {}) });
  return {
    el: h(
      'div',
      { class: 'case' },
      parts.map(x => x.box),
    ),
    answer,
    check: () => verdictOf(ex, answer()).ok,
    given: () => parts.map((x, i) => `(${String(i + 1)}) ${x.w.given?.() ?? ''}`).join('  '),
    reveal() {
      const right = verdictOf(ex, answer()).items ?? [];
      parts.forEach((x, i) => {
        const ok = !!right[i];
        x.w.reveal?.();
        x.box.classList.add(ok ? 'ok' : 'bad');
        if (x.p.explain) x.box.append(h('div', { class: `fb ${ok ? 'ok' : 'info'}`, html: fmt(x.p.explain) }));
      });
    },
  };
};

export const predict: Renderer = c => {
  const { app, ex } = c;
  const w = Array.isArray(ex.options) ? mcq(c) : calc(c);
  const el = h('div', {}, h('div', { class: 'tiny', style: { marginBottom: '8px' } }, `🔮 ${app.t('engine.ex.predictHint')}`), w.el);
  return {
    ...w,
    el,
    reveal() {
      w.reveal?.();
      const outcome = ex.outcome ?? '';
      w.el.after(
        h(
          'div',
          { class: 'fb info' },
          h('b', {}, `▶ ${app.t('engine.ex.outcome')} `),
          /\n/.test(outcome) && ex.lang ? codeEl(outcome, ex.lang, app.t('engine.core.copy')) : h('span', { html: fmt(outcome) }),
        ),
      );
    },
  };
};

export const tree: Renderer = ({ app, ex, api }) => {
  const box = h('div', { class: 'tree' }),
    path = h('ol', { class: 'treepath' }),
    pathLbl = h('div', { class: 'tiny', hidden: true }, app.t('engine.ex.treePath'));
  const nodes = ex.nodes ?? {};
  let mistakes = 0,
    steps = 0;
  const seen = new Set<string>();
  const end = (): void => {
    api.done(verdictOf(ex, { mistakes }).ok === true);
  };
  const node = (id: string): void => {
    const n = nodes[id];
    if (!n || seen.has(id)) {
      end(); // a malformed tree ends instead of looping
      return;
    }
    seen.add(id);
    steps++;
    const div = h(
      'div',
      { class: 'scstep' },
      h('div', { class: 'sp' }, h('span', { class: 'pill c' }, `🌳 ${app.nf(steps)}`), ' ', fEl(n.q)),
    );
    const opts = h('div', { class: 'opts' }),
      fbBox = h('div');
    let done = false;
    n.options.forEach((o, i) => {
      const b = h(
        'button',
        {
          class: 'opt',
          onclick: () => {
            if (done || b.classList.contains('wrong')) return;
            fbBox.replaceChildren();
            if (o.ok) {
              done = true;
              b.classList.add('right');
              app.host.feedback.beep('ok');
              path.append(h('li', {}, fEl(o.text)));
              pathLbl.hidden = false;
              if (o.fb) fbBox.append(h('div', { class: 'fb ok', html: `✅ ${fmt(o.fb)}` }));
              if (o.to) node(o.to);
              else end();
            } else {
              mistakes++;
              b.classList.add('wrong', 'shake');
              app.host.feedback.beep('bad');
              fbBox.append(h('div', { class: 'fb bad', html: `↪ ${fmt(o.fb ?? '')}` }));
            }
          },
        },
        h('span', { class: 'k' }, letter(i)),
        fEl(o.text),
      );
      opts.append(b);
    });
    div.append(opts, fbBox);
    box.append(div);
    div.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  node(typeof ex.start === 'string' ? ex.start : (Object.keys(nodes)[0] ?? ''));
  return {
    el: h('div', {}, pathLbl, path, box),
    selfDone: true,
    given: () => [...path.children].map(li => li.textContent).join(' → '),
  };
};

export const inquiry: Renderer = ({ app, ex, api }) => {
  const options = strings(ex.options),
    scores = indices(ex.scores);
  const best = Math.max(...scores);
  let pick: number | null = null;
  const btns = shuffle(options.map((_, i) => i)).map((oi, k) => ({
    oi,
    el: h(
      'button',
      {
        class: 'opt',
        onclick: () => {
          if (api.locked()) return;
          pick = oi;
          api.check();
        },
      },
      h('span', { class: 'k' }, letter(k)),
      h('span', {}, fEl(options[oi] ?? '')),
    ),
  }));
  const why = strings(ex.why);
  return {
    el: h(
      'div',
      {},
      h('div', { class: 'tiny', style: { marginBottom: '8px' } }, app.t('engine.ex.inquiryHint')),
      h(
        'div',
        { class: 'opts' },
        btns.map(b => b.el),
      ),
    ),
    keys: k => btns[k]?.el.click(),
    answer: () => ({ picked: pick }),
    check: () => verdictOf(ex, { picked: pick }).ok,
    given: () => (pick === null ? '' : (options[pick] ?? '')),
    reveal() {
      for (const { oi, el } of btns) {
        const sc = scores[oi] ?? 0;
        el.classList.add(sc === best ? 'right' : oi === pick ? 'wrong' : 'dim');
        const v = app.t('engine.ex.inquiryValue', { n: sc });
        el.children[1]?.append(
          h(
            'span',
            { class: 'why' },
            h('span', { class: 'value', title: v, 'aria-label': v }, '●'.repeat(sc) + '○'.repeat(3 - sc)),
            ' ',
            h('span', { html: fmt(why[oi] ?? '') }),
          ),
        );
      }
    },
  };
};

export const debate: Renderer = ({ app, ex, api }) => {
  const box = h('div', { class: 'debate' });
  const sides = ex.sides ?? [];
  let side: number | null = null,
    pick: number | null = null,
    cBtns: { ci: number; el: HTMLButtonElement }[] = [];
  const sideBtns = sides.map((s, i) =>
    h(
      'button',
      {
        class: 'opt',
        onclick: () => {
          if (api.locked() || side !== null) return;
          side = i;
          sideBtns.forEach((b, k) => {
            b.classList.toggle('sel', k === i);
            if (k !== i) b.classList.add('dim');
          });
          cBtns = shuffle(s.counters.map((_, j) => j)).map((ci, k) => ({
            ci,
            el: h(
              'button',
              {
                class: 'opt',
                onclick: () => {
                  if (api.locked()) return;
                  pick = ci;
                  api.check();
                },
              },
              h('span', { class: 'k' }, letter(k)),
              h('span', {}, fEl(s.counters[ci] ?? '')),
            ),
          }));
          box.append(
            label(app.t('engine.ex.debateCounter')),
            h(
              'div',
              { class: 'opts' },
              cBtns.map(b => b.el),
            ),
          );
        },
      },
      h('span', { class: 'k' }, letter(i)),
      h('span', {}, fEl(s.position)),
    ),
  );
  box.append(label(app.t('engine.ex.debatePick'), '0'), h('div', { class: 'opts' }, sideBtns));
  return {
    el: box,
    keys: k => (side === null ? sideBtns[k] : cBtns[k]?.el)?.click(),
    answer: () => ({ side, pick }),
    check: () => verdictOf(ex, { side, pick }).ok,
    given: () => {
      const s = side === null ? undefined : sides[side];
      return s ? `side: ${s.position}${pick === null ? '' : ` — objection: ${s.counters[pick] ?? ''}`}` : '';
    },
    reveal() {
      const sd = side === null ? undefined : sides[side];
      if (!sd) return;
      for (const { ci, el } of cBtns) {
        if (ci === sd.best) el.classList.add('right');
        else if (ci === pick) el.classList.add('wrong');
        const w = sd.why?.[ci];
        if (w) el.children[1]?.append(h('span', { class: 'why', html: fmt(w) }));
      }
    },
  };
};
