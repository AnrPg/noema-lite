/**
 * The answer areas of the classic exercise types (tools/CONTENT_SPEC.md "Types"): choices, true/false, order, match,
 * buckets, cloze, spot the bug, a number, a scenario, a free answer (graded by the AI or by the learner's own checklist)
 * and code to write. Each follows widget.ts; the verdict is the study domain's.
 */
import type { Exercise } from '../../domain/pack.ts';
import { h, letter, replay, shuffle } from '../dom.ts';
import { codeEl, fEl } from '../parts.ts';
import { fmt, guessLang, highlight } from '../text.ts';
import { indices, strings, verdictOf, type Renderer, type Widget, type WidgetCtx } from './widget.ts';

const tip = (text: string): HTMLDivElement => h('div', { class: 'tiny', style: { marginBottom: '8px' } }, text);
const whyOf = (ex: Exercise, i: number): string | undefined => {
  const w = ex.why;
  return Array.isArray(w) ? (w as readonly string[])[i] : (w as Readonly<Record<string, string>> | undefined)?.[String(i)];
};

export const mcq: Renderer = ({ app, ex, api }) => {
  const options = strings(ex.options);
  const right = new Set(indices(ex.answer));
  const multi = !!ex.multi || right.size > 1;
  const sel = new Set<number>();
  const btns = shuffle(options.map((_, i) => i)).map((oi, k) => {
    const b = h(
      'button',
      {
        class: 'opt',
        'data-nf': `options.${String(oi)}`,
        onclick: () => {
          if (api.locked()) return;
          if (!multi) {
            sel.clear();
            for (const x of btns) x.el.classList.remove('sel');
          }
          if (sel.has(oi)) sel.delete(oi);
          else sel.add(oi);
          b.classList.toggle('sel', sel.has(oi));
          if (!multi) api.check();
        },
      },
      h('span', { class: 'k' }, letter(k)),
      h('span', {}, fEl(options[oi] ?? '')),
    );
    return { el: b, oi };
  });
  const el = h(
    'div',
    {},
    multi ? tip(app.t('engine.ex.selectAll', { n: right.size })) : null,
    h(
      'div',
      { class: 'opts' },
      btns.map(b => b.el),
    ),
  );
  const w: Widget = {
    el,
    keys: k => btns[k]?.el.click(),
    answer: () => ({ picked: [...sel] }),
    check: () => verdictOf(ex, { picked: [...sel] }).ok,
    given: () => [...sel].map(oi => `${letter(oi)}. ${options[oi] ?? ''}`).join(' + '),
    reveal() {
      for (const { el: b, oi } of btns) {
        if (right.has(oi)) b.classList.add('right');
        else if (sel.has(oi)) b.classList.add('wrong');
        const why = whyOf(ex, oi);
        if (why) b.children[1]?.append(h('span', { class: 'why', 'data-nf': `why.${String(oi)}`, html: fmt(why) }));
      }
    },
  };
  return w;
};

/** An exercise of a type this app does not know (a newer pack): a quiet card, never a crash (docs/adr/001 D1). */
export const newer: Renderer = ({ app }) => ({ el: h('div', { class: 'fb' }, `🔄 ${app.t('engine.act.newerType')}`), selfDone: true });

export const odd: Renderer = c => {
  const w = mcq(c);
  w.el.querySelector('.opts')?.classList.add('grid4');
  return w;
};

export const tf: Renderer = ({ app, ex, api }) => {
  let pick: boolean | null = null;
  const mk = (v: boolean, label: string, cls: string): HTMLButtonElement =>
    h(
      'button',
      {
        class: `tfbtn ${cls}`,
        onclick: () => {
          if (api.locked()) return;
          pick = v;
          api.check();
        },
      },
      label,
    );
  const t = mk(true, `👍 ${app.t('engine.ex.true')}`, 't'),
    f = mk(false, `👎 ${app.t('engine.ex.false')}`, 'f');
  return {
    el: h('div', { class: 'tfrow' }, t, f),
    keys: k => (k === 0 ? t : k === 1 ? f : null)?.click(),
    answer: () => ({ value: pick }),
    check: () => verdictOf(ex, { value: pick }).ok,
    given: () => (pick === null ? '' : String(pick)),
    reveal() {
      (ex.answer ? t : f).classList.add('right');
      if (pick !== ex.answer) (pick ? t : f).classList.add('wrong');
    },
  };
};

export const order: Renderer = ({ app, ex, api }) => {
  const texts = strings(ex.items);
  const pool = h('div', { class: 'pool' }),
    seq = h('div', { class: 'seq' });
  const picked: number[] = [];
  const items = shuffle(texts.map((_, i) => i));
  const draw = (): void => {
    seq.replaceChildren();
    pool.replaceChildren();
    if (!picked.length) seq.append(h('div', { class: 'ph' }, app.t('engine.ex.orderHint')));
    picked.forEach((i, k) => {
      seq.append(
        h(
          'button',
          {
            class: 'chipx',
            onclick: () => {
              if (api.locked()) return;
              picked.splice(k, 1);
              draw();
            },
          },
          h('span', { class: 'no' }, app.nf(k + 1)),
          fEl(texts[i] ?? ''),
        ),
      );
    });
    for (const i of items.filter(x => !picked.includes(x)))
      pool.append(
        h(
          'button',
          {
            class: 'chipx',
            onclick: () => {
              if (api.locked()) return;
              picked.push(i);
              draw();
            },
          },
          fEl(texts[i] ?? ''),
        ),
      );
  };
  draw();
  return {
    el: h('div', {}, seq, pool),
    answer: () => ({ order: [...picked] }),
    check: () => verdictOf(ex, { order: [...picked] }).ok,
    given: () => picked.map(i => texts[i] ?? '').join(' → '),
    reveal() {
      seq.querySelectorAll('.chipx').forEach((b, k) => {
        b.classList.add(picked[k] === k ? 'right' : 'wrong');
      });
      if (!picked.every((i, k) => i === k))
        seq.after(
          h(
            'div',
            { class: 'fb info' },
            h('b', {}, `${app.t('engine.ex.correctOrder')} `),
            h(
              'ol',
              { style: { margin: '6px 0 0', paddingLeft: '20px' } },
              texts.map(t => h('li', { html: fmt(t) })),
            ),
          ),
        );
    },
  };
};

/** the colours of matched pairs: chapter colours (data-ci), so each pair's number reads on its colour */
const PAIR_COLOURS = [7, 1, 4, 8, 5, 3, 2];

export const match: Renderer = ({ app, ex, api }) => {
  const pairs = (ex.pairs ?? []).map(p => [p[0], p[1]] as const);
  const right = shuffle(pairs.map((_, i) => i));
  const link = new Map<number, number>();
  let selL: number | null = 0;
  const lb = pairs.map((p, i) =>
    h(
      'button',
      {
        class: 'mitem',
        onclick: () => {
          if (api.locked()) return;
          link.delete(i);
          selL = selL === i ? null : i;
          paint();
        },
      },
      fEl(p[0]),
    ),
  );
  const rb = new Map<number, HTMLButtonElement>();
  for (const i of right)
    rb.set(
      i,
      h(
        'button',
        {
          class: 'mitem',
          onclick: () => {
            if (api.locked()) return;
            for (const [l, r] of link) if (r === i) link.delete(l);
            if (selL !== null) {
              link.set(selL, i);
              selL = pairs.findIndex((_, k) => !link.has(k));
              if (selL < 0) selL = null;
            }
            paint();
          },
        },
        fEl(pairs[i]?.[1] ?? ''),
      ),
    );
  const paint = (): void => {
    for (const b of [...lb, ...rb.values()]) {
      b.classList.remove('sel');
      b.querySelector('.tag')?.remove();
      b.style.borderColor = '';
      delete b.dataset['ci'];
    }
    [...link].forEach(([l, r], k) => {
      const ci = String(PAIR_COLOURS[k % PAIR_COLOURS.length]);
      for (const b of [lb[l], rb.get(r)]) {
        if (!b) continue;
        b.dataset['ci'] = ci;
        b.style.borderColor = 'var(--c)';
        b.append(h('span', { class: 'tag' }, app.nf(k + 1)));
      }
    });
    if (selL !== null) lb[selL]?.classList.add('sel');
  };
  paint();
  const grid = h('div', { class: 'matchgrid' }, h('div', { class: 'col' }, lb), h('div', { class: 'col' }, [...rb.values()]));
  const links = (): (number | null)[] => pairs.map((_, i) => link.get(i) ?? null);
  return {
    el: h('div', {}, tip(app.t('engine.ex.matchHint')), grid),
    answer: () => ({ links: links() }),
    check: () => verdictOf(ex, { links: links() }).ok,
    given: () =>
      pairs
        .map((p, i) => (link.has(i) ? `${p[0]} = ${pairs[link.get(i) ?? 0]?.[1] ?? ''}` : ''))
        .filter(Boolean)
        .join('; '),
    reveal() {
      lb.forEach((b, i) => {
        b.classList.add(link.get(i) === i ? 'right' : 'wrong');
      });
      if (!pairs.every((_, i) => link.get(i) === i))
        grid.after(
          h(
            'div',
            { class: 'fb info' },
            h('b', {}, app.t('engine.ex.correctPairs')),
            h(
              'ul',
              { style: { margin: '6px 0 0', paddingLeft: '20px' } },
              pairs.map(p => h('li', { html: `${fmt(p[0])} → ${fmt(p[1])}` })),
            ),
          ),
        );
    },
  };
};

export const bucket: Renderer = ({ app, ex, api }) => {
  const all = ((ex.items ?? []) as readonly { readonly text: string; readonly bucket: number }[]).map((it, i) => ({ ...it, i }));
  const buckets = strings(ex.buckets);
  const place = new Map<number, number>();
  let sel: number | null = null;
  const items = shuffle(all);
  const pool = h('div', { class: 'pool' });
  const zones = buckets.map((name, bi) => {
    const z = h(
      'div',
      {
        class: 'bucket',
        onclick: () => {
          if (api.locked() || sel === null) return;
          place.set(sel, bi);
          sel = null;
          draw();
        },
        ondragover: (e: Event) => {
          e.preventDefault();
          z.classList.add('hot');
        },
        ondragleave: () => {
          z.classList.remove('hot');
        },
        ondrop: (e: Event) => {
          e.preventDefault();
          z.classList.remove('hot');
          const i = Number((e as DragEvent).dataTransfer?.getData('text'));
          if (!api.locked() && Number.isInteger(i)) {
            place.set(i, bi);
            sel = null;
            draw();
          }
        },
      },
      h('h4', { html: fmt(name) }),
      h('div', { class: 'pool' }),
    );
    return z;
  });
  const chip = (it: (typeof all)[number]): HTMLButtonElement => {
    const b = h(
      'button',
      {
        class: `chipx${sel === it.i ? ' sel' : ''}`,
        draggable: 'true',
        'data-i': it.i,
        ondragstart: (e: Event) => (e as DragEvent).dataTransfer?.setData('text', String(it.i)),
        onclick: (e: Event) => {
          e.stopPropagation();
          if (api.locked()) return;
          if (place.has(it.i)) {
            place.delete(it.i);
            sel = it.i;
          } else sel = sel === it.i ? null : it.i;
          draw();
        },
      },
      fEl(it.text),
    );
    return b;
  };
  const draw = (): void => {
    pool.replaceChildren();
    for (const z of zones) z.querySelector('.pool')?.replaceChildren();
    for (const it of items) {
      const at = place.get(it.i);
      (at === undefined ? pool : zones[at]?.querySelector('.pool'))?.append(chip(it));
    }
    for (const z of zones) z.classList.toggle('hot', sel !== null);
    if (!pool.children.length) pool.append(h('span', { class: 'tiny' }, app.t('engine.ex.allSorted')));
  };
  draw();
  const answer = (): { place: (number | null)[] } => ({ place: all.map((_, i) => place.get(i) ?? null) });
  return {
    el: h('div', {}, tip(app.t('engine.ex.bucketHint')), pool, h('div', { class: 'buckets' }, zones)),
    answer,
    check: () => verdictOf(ex, answer()).ok,
    given: () =>
      items
        .filter(it => place.has(it.i))
        .map(it => `${it.text} → ${buckets[place.get(it.i) ?? 0] ?? ''}`)
        .join('; '),
    reveal() {
      for (const z of zones)
        z.querySelectorAll<HTMLElement>('.chipx').forEach(b => {
          const it = all[Number(b.dataset['i'])];
          if (!it) return;
          const ok = place.get(it.i) === it.bucket;
          b.classList.add(ok ? 'right' : 'wrong');
          if (!ok) b.append(h('small', { style: { opacity: '.8' } }, ` → ${buckets[it.bucket] ?? ''}`));
        });
    },
  };
};

export const cloze: Renderer = ({ ex, api }) => {
  const parts = (ex.text ?? '').split(/\[\[(.+?)\]\]/g);
  const blanks: { alts: string[]; el: HTMLElement; val: number | null }[] = [];
  const box = h('div', { class: `cloze${ex.asCode ? ' code' : ''}` });
  const bankWords = Array.isArray(ex.bank) ? strings(ex.bank) : null;
  let selB = 0;
  parts.forEach((p, i) => {
    if (i % 2 === 0) {
      box.append(ex.asCode ? document.createTextNode(p) : fEl(p));
      return;
    }
    const alts = p.split('|').map(s => s.trim());
    const bi = blanks.length;
    const el = bankWords
      ? h(
          'span',
          {
            class: 'blank',
            onclick: () => {
              if (api.locked()) return;
              const b = blanks[bi];
              if (b) b.val = null;
              selB = bi;
              draw();
            },
          },
          ' ',
        )
      : h('input', {
          class: 'blank',
          style: { width: `${String(Math.max(80, Math.min(300, (alts[0]?.length ?? 0) * 10 + 30)))}px` },
          autocapitalize: 'off',
          autocomplete: 'off',
          spellcheck: 'false',
          onkeydown: (e: Event) => {
            if ((e as KeyboardEvent).key !== 'Enter') return;
            e.preventDefault();
            const nx = blanks[bi + 1];
            if (nx) nx.el.focus();
            else api.check();
          },
        });
    blanks.push({ alts, el, val: null });
    box.append(el);
  });
  const words = bankWords ? shuffle([...blanks.map(b => b.alts[0] ?? ''), ...bankWords]) : [];
  const chips = words.map((w, wi) =>
    h(
      'button',
      {
        class: 'chipx',
        onclick: () => {
          if (api.locked()) return;
          const t = blanks[selB]?.val === null ? selB : blanks.findIndex(b => b.val === null);
          const b = blanks[t];
          if (!b) return;
          b.val = wi;
          selB = blanks.findIndex(x => x.val === null);
          if (selB < 0) selB = t;
          draw();
        },
      },
      w,
    ),
  );
  const bankEl = bankWords ? h('div', { class: 'pool bank' }, chips) : null;
  const draw = (): void => {
    if (!bankWords) return;
    blanks.forEach((b, i) => {
      b.el.textContent = b.val === null ? ' ' : (words[b.val] ?? '');
      b.el.classList.toggle('filled', b.val !== null);
      b.el.classList.toggle('sel', i === selB && b.val === null);
    });
    const used = new Set(blanks.map(b => b.val));
    chips.forEach((c, i) => (c.style.display = used.has(i) ? 'none' : ''));
  };
  draw();
  const val = (b: (typeof blanks)[number]): string | null =>
    bankWords ? (b.val === null ? null : (words[b.val] ?? null)) : (b.el as HTMLInputElement).value;
  const answer = (): { blanks: (string | null)[] } => ({ blanks: blanks.map(val) });
  return {
    el: h('div', {}, box, bankEl),
    focus: () => {
      if (!bankWords) blanks[0]?.el.focus();
    },
    given: () => (blanks.some(b => val(b)) ? blanks.map(b => val(b) ?? '—').join(' | ') : ''),
    answer,
    check: () => verdictOf(ex, answer()).ok,
    reveal() {
      const right = verdictOf(ex, answer()).items ?? [];
      blanks.forEach((b, bi) => {
        const ok = !!right[bi];
        b.el.classList.add(ok ? 'right' : 'wrong');
        if (bankWords) {
          if (!ok) b.el.append(h('span', { class: 'corr' }, `→ ${b.alts[0] ?? ''}`));
        } else {
          (b.el as HTMLInputElement).readOnly = true;
          if (!ok)
            b.el.after(
              h(
                'span',
                { class: 'pill', style: { background: 'var(--ok-bg)', color: 'var(--ok)', margin: '0 4px', fontFamily: 'var(--mono)' } },
                b.alts[0] ?? '',
              ),
            );
        }
      });
      if (bankEl) bankEl.style.display = 'none';
    },
  };
};

/** a fix as code when it reads like code, else as text */
const fixEl = (app: WidgetCtx['app'], fix: string, lang: string | undefined, asCode = true): HTMLElement =>
  asCode && /\n|;|\(|=/.test(fix) ? codeEl(fix, lang ?? guessLang(fix), app.t('engine.core.copy')) : h('div', { html: fmt(fix) });

export const spotbug: Renderer = ({ app, ex, api }) => {
  const lines = strings(ex.lines);
  const lang = ex.lang ?? guessLang(lines.join('\n'));
  const sel = new Set<number>();
  const bugs = new Set(indices(ex.bugs));
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
      h('span', { class: 'ln' }, i + 1),
      h('span', { html: highlight(l, lang) }),
    ),
  );
  const list = h('div', { class: 'codelines' }, btns);
  return {
    el: h('div', {}, tip(app.t('engine.ex.spotbugHint', { n: bugs.size })), list),
    answer: () => ({ lines: [...sel] }),
    check: () => verdictOf(ex, { lines: [...sel] }).ok,
    given: () =>
      [...sel]
        .sort((a, b) => a - b)
        .map(i => `line ${String(i + 1)} (0-based ${String(i)})`)
        .join(', '),
    reveal() {
      btns.forEach((b, i) => {
        if (bugs.has(i)) b.classList.add('right');
        else if (sel.has(i)) b.classList.add('wrong');
      });
      list.after(h('div', { class: 'fb ok' }, h('b', {}, `🔧 ${app.t('engine.ex.fix')}`), fixEl(app, ex.fix ?? '', ex.lang)));
    },
  };
};

export const calc: Renderer = ({ ex, api }) => {
  const inp = h('input', {
    type: 'number',
    step: 'any',
    placeholder: '?',
    onkeydown: (e: Event) => {
      if ((e as KeyboardEvent).key === 'Enter') api.check();
    },
  });
  const value = (): string | null => (inp.value === '' ? null : inp.value);
  return {
    el: h('div', { class: 'calcrow' }, inp, h('b', { class: 'muted' }, ex.unit ?? '')),
    focus: () => {
      inp.focus();
    },
    given: () => (inp.value === '' ? '' : `${inp.value} ${ex.unit ?? ''}`),
    answer: () => ({ value: value() }),
    check: () => verdictOf(ex, { value: value() }).ok,
    reveal() {
      inp.readOnly = true;
      inp.style.borderColor = verdictOf(ex, { value: value() }).ok ? 'var(--ok)' : 'var(--bad)';
      inp.after(
        h(
          'span',
          { class: 'pill', style: { background: 'var(--ok-bg)', color: 'var(--ok)', fontSize: '15px' } },
          `= ${String(ex.answer)} ${ex.unit ?? ''}`,
        ),
      );
    },
  };
};

export const scenario: Renderer = ({ app, ex, api }) => {
  const box = h('div');
  const steps = ex.steps ?? [];
  let k = 0,
    mistakes = 0;
  const step = (): void => {
    const st = steps[k];
    if (!st) return;
    const div = h(
      'div',
      { class: 'scstep' },
      h(
        'div',
        { class: 'sp' },
        h('span', { class: 'pill c' }, app.t('engine.ex.step', { n: k + 1, of: steps.length })),
        ' ',
        fEl(st.prompt),
      ),
      st.code ? codeEl(st.code, guessLang(st.code), app.t('engine.core.copy')) : null,
    );
    const opts = h('div', { class: 'opts' }),
      fbBox = h('div');
    let done = false;
    shuffle(st.options).forEach((o, i) => {
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
              fbBox.append(h('div', { class: 'fb ok', html: `✅ ${fmt(o.fb ?? '')}` }));
              k++;
              if (k < steps.length)
                fbBox.append(
                  h(
                    'div',
                    { style: { marginTop: '10px' } },
                    h(
                      'button',
                      {
                        class: 'btn small primary',
                        onclick: (e: Event) => {
                          (e.target as HTMLElement).remove();
                          step();
                        },
                      },
                      app.t('engine.ex.nextStep'),
                    ),
                  ),
                );
              else api.done(verdictOf(ex, { mistakes }).ok === true);
            } else {
              mistakes++;
              b.classList.add('wrong', 'shake');
              app.host.feedback.beep('bad');
              fbBox.append(h('div', { class: 'fb bad', html: `❌ ${fmt(o.fb ?? '')}` }));
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
  step();
  return { el: box, selfDone: true };
};

export const free: Renderer = ({ app, ex, api }) => {
  const ta = h('textarea', { class: 'answer', placeholder: app.t('engine.ex.freePlaceholder') });
  const out = h('div');
  let finished = false;
  const finish = (ok: boolean): void => {
    if (finished) return;
    finished = true;
    api.done(ok);
  };
  const modelBox = (): HTMLElement =>
    h('div', { class: 'explain' }, h('div', { class: 'hd' }, `📘 ${app.t('engine.ex.modelAnswer')}`), fEl(ex.model ?? ''));
  const aiBtn = h(
    'button',
    {
      class: 'btn ai',
      onclick: async () => {
        if (!ta.value.trim()) {
          ta.classList.add('shake');
          setTimeout(() => {
            ta.classList.remove('shake');
          }, 500);
          return;
        }
        aiBtn.disabled = true;
        aiBtn.textContent = `✨ ${app.t('engine.ex.grading')}`;
        try {
          const g = await app.ai.grade(ex, ta.value);
          const sc = Math.max(0, Math.min(100, Math.trunc(g.score)));
          out.replaceChildren(
            h(
              'div',
              { class: 'fb ai' },
              h(
                'div',
                { class: 'row' },
                h('span', { class: `score${sc >= 70 ? ' good' : sc >= 45 ? ' mid' : ''}` }, sc),
                h('b', { class: 'grow', html: fmt(g.verdict) }),
              ),
              g.covered?.length ? h('div', { style: { marginTop: '8px' } }, '✅ ', fEl(g.covered.join(' · '))) : null,
              g.missing?.length
                ? h('div', { style: { marginTop: '4px' } }, `➕ ${app.t('engine.ex.missing')} `, fEl(g.missing.join(' · ')))
                : null,
              g.mistakes?.length ? h('div', { style: { marginTop: '4px' } }, '❌ ', fEl(g.mistakes.join(' · '))) : null,
              h('div', { style: { marginTop: '8px' } }, app.ai.md(g.feedback)),
            ),
            modelBox(),
          );
          finish(verdictOf(ex, { score: sc }).ok === true);
        } catch (e) {
          out.replaceChildren(h('div', { class: 'fb bad' }, `⚠️ ${app.t('engine.ex.aiFailedSelf', { error: app.errText(e) })}`));
          aiBtn.disabled = false;
          aiBtn.textContent = `✨ ${app.t('engine.ex.gradeAI')}`;
        }
      },
    },
    `✨ ${app.t('engine.ex.gradeAI')}`,
  );
  const selfBtn = h(
    'button',
    {
      class: 'btn',
      onclick: () => {
        selfBtn.disabled = true;
        const rubric = strings(ex.rubric);
        const checks = rubric.map(() => h('input', { type: 'checkbox' }));
        out.replaceChildren(
          modelBox(),
          h(
            'div',
            { class: 'explain rubric' },
            h('div', { class: 'hd' }, `☑️ ${app.t('engine.ex.tickCovered')}`),
            rubric.map((r, i) => h('label', {}, checks[i], fEl(r))),
            h(
              'button',
              {
                class: 'btn small primary',
                style: { marginTop: '8px' },
                onclick: (e: Event) => {
                  (e.target as HTMLButtonElement).disabled = true;
                  finish(verdictOf(ex, { rubric: checks.map(c => c.checked) }).ok === true);
                },
              },
              app.t('engine.ex.done'),
            ),
          ),
        );
      },
    },
    `🙋 ${app.t('engine.ex.selfCheck')}`,
  );
  return {
    el: h('div', {}, ta, h('div', { class: 'actions' }, aiBtn, selfBtn), out),
    selfDone: true,
    focus: () => {
      ta.focus();
    },
    given: () => ta.value.trim(),
  };
};

export const write: Renderer = ({ app, ex }) => {
  const ta = h('textarea', {
    class: 'answer code',
    spellcheck: 'false',
    placeholder: ex.lang ? app.t('engine.ex.writeLang', { lang: ex.lang }) : app.t('engine.ex.writeCode'),
    onkeydown: (e: Event) => {
      if ((e as KeyboardEvent).key !== 'Tab') return;
      e.preventDefault();
      const s = ta.selectionStart;
      ta.value = `${ta.value.slice(0, s)}  ${ta.value.slice(ta.selectionEnd)}`;
      ta.selectionStart = ta.selectionEnd = s + 2;
    },
  });
  return {
    el: h('div', {}, ta, h('div', { class: 'tiny', style: { marginTop: '6px' } }, app.t('engine.ex.writeNote'))),
    focus: () => {
      ta.focus();
    },
    answer: () => ({ text: ta.value }),
    check: () => verdictOf(ex, { text: ta.value }).ok,
    given: () => (ta.value.trim() ? `\n\`\`\`\n${ta.value.trim()}\n\`\`\`\n` : ''),
    reveal() {
      ta.readOnly = true;
      const m = verdictOf(ex, { text: ta.value }).missing ?? [];
      const box = h('div');
      if (m.length)
        box.append(
          h(
            'div',
            { class: 'fb bad' },
            `${app.t('engine.ex.missingEssentials')} `,
            m.map(k => h('code', { style: { marginRight: '4px' } }, k)),
          ),
        );
      box.append(
        h(
          'div',
          { class: 'explain' },
          h('div', { class: 'hd' }, `✅ ${app.t('engine.ex.refSolution')}`),
          codeEl(ex.solution ?? '', ex.lang ?? guessLang(ex.solution ?? ''), app.t('engine.core.copy')),
        ),
      );
      const aiBtn = h(
        'button',
        {
          class: 'btn small ai',
          style: { marginTop: '10px' },
          onclick: async () => {
            aiBtn.disabled = true;
            aiBtn.textContent = `✨ ${app.t('engine.ex.reviewing')}`;
            try {
              const g = await app.ai.grade(ex, ta.value);
              aiBtn.replaceWith(
                h(
                  'div',
                  { class: 'fb ai' },
                  h('b', {}, `${app.t('engine.ex.aiReview', { score: g.score })} `),
                  fEl(g.verdict),
                  h('div', { style: { marginTop: '6px' } }, app.ai.md(g.feedback)),
                ),
              );
            } catch (e) {
              aiBtn.replaceWith(h('div', { class: 'fb bad' }, `⚠️ ${app.errText(e)}`));
            }
          },
        },
        `✨ ${app.t('engine.ex.aiReviewBtn')}`,
      );
      box.append(aiBtn);
      ta.after(box);
    },
  };
};

export { fixEl, replay };
