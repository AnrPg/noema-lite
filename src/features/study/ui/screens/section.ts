/**
 * The section reader (#/s/<section>[/<block>]): the theory in bite-size chunks (each block with its stable id, its 💡,
 * its "new" mark and its 文A words), then its quick check, its drills, a new question made by the AI, and the way on.
 */
import { blockText } from '../../domain/as-text.ts';
import type { Block, Chapter, Section } from '../../domain/pack.ts';
import type { StudyApp } from '../app.ts';
import { h } from '../dom.ts';
import { exerciseCard } from '../exercise/card.ts';
import { figureBlock } from '../exercise/visual.ts';
import type { MenuEntry } from '../host.ts';
import { codeEl, setAccent } from '../parts.ts';
import { fmt } from '../text.ts';
import { backBtn, lockNote, showHit, view } from '../view.ts';
import { drillTile } from './cards.ts';
import { openSearch, sprintEntry } from './home.ts';

const CALLOUT_IC: Readonly<Record<string, string>> = {
  key: '🔑',
  pitfall: '⚠️',
  tip: '💡',
  exam: '🎓',
  warn: '🚧',
  analogy: '🧩',
  debug: '🔧',
  interview: '🎤',
};
const str = (x: unknown): string => (typeof x === 'string' ? x : typeof x === 'number' ? String(x) : '');
const rec = (x: unknown): Readonly<Record<string, unknown>> => (x && typeof x === 'object' ? (x as Record<string, unknown>) : {});
const strs = (x: unknown): string[] => (Array.isArray(x) ? x.map(str) : []);

/** one theory block (its parts carry data-nf: where a ⚑ report and the search point) */
export function renderBlock(app: StudyApp, b: Block, i: number, sid: string): HTMLElement {
  const wrap = h('div', { class: `blk b-${b.t}`, style: { animationDelay: `${String((i % 6) * 60)}ms` } });
  const caption = (): void => {
    if (b.caption) wrap.append(h('div', { class: 'caption', 'data-nf': 'caption', html: fmt(b.caption) }));
  };
  const items = b.items ?? [];
  switch (b.t) {
    case 'p':
      wrap.append(h('p', { 'data-nf': 'text', html: fmt(b.text) }));
      break;
    case 'list':
      wrap.append(
        h(
          b.ordered ? 'ol' : 'ul',
          {},
          items.map((x, k) => h('li', { 'data-nf': `items.${String(k)}`, html: fmt(str(x)) })),
        ),
      );
      break;
    case 'code':
      wrap.append(codeEl(b.code ?? '', b.lang, app.t('engine.core.copy')));
      caption();
      break;
    case 'figure':
      wrap.append(figureBlock(app, app.host.media, b));
      break;
    case 'interactive':
      wrap.append(app.host.activities.block(b, sid));
      break;
    case 'diagram':
      wrap.append(h('div', { class: 'diagram', 'data-nf': 'text' }, b.text ?? ''));
      caption();
      break;
    case 'table':
      wrap.append(
        h(
          'div',
          { class: 'tablewrap' },
          h(
            'table',
            {},
            h(
              'thead',
              {},
              h(
                'tr',
                {},
                (b.head ?? []).map((x, k) => h('th', { 'data-nf': `head.${String(k)}`, html: fmt(x) })),
              ),
            ),
            h(
              'tbody',
              {},
              (b.rows ?? []).map((r, j) =>
                h(
                  'tr',
                  {},
                  r.map((x, k) => h('td', { 'data-nf': `rows.${String(j)}.${String(k)}`, html: fmt(x) })),
                ),
              ),
            ),
          ),
        ),
      );
      caption();
      break;
    case 'callout':
      wrap.append(
        h(
          'div',
          { class: `callout ${b.kind ?? ''}` },
          h('span', { class: 'ci' }, CALLOUT_IC[b.kind ?? ''] ?? '💡'),
          b.title ? h('b', { class: 't', 'data-nf': 'title', html: fmt(b.title) }) : null,
          h('div', { 'data-nf': 'text', html: fmt(b.text) }),
        ),
      );
      break;
    case 'compare':
      wrap.append(
        h(
          'div',
          { class: 'compare' },
          items.map((it, k) =>
            h(
              'div',
              { 'data-nf': `items.${String(k)}` },
              h('h4', { 'data-nf': `items.${String(k)}.title`, html: fmt(str(rec(it)['title'])) }),
              h(
                'ul',
                {},
                strs(rec(it)['points']).map((p, j) => h('li', { 'data-nf': `items.${String(k)}.points.${String(j)}`, html: fmt(p) })),
              ),
            ),
          ),
        ),
      );
      break;
    case 'flow': {
      const f = h('div', { class: 'flow' });
      items.forEach((x, k) => {
        if (k) f.append(h('span', { class: 'ar' }, '→'));
        f.append(
          h('span', { class: 'st', 'data-nf': `items.${String(k)}`, style: { animationDelay: `${String(k * 70)}ms` }, html: fmt(str(x)) }),
        );
      });
      wrap.append(f);
      caption();
      break;
    }
    case 'reveal': {
      let paid = false;
      const r = h(
        'div',
        { class: 'reveal' },
        h(
          'button',
          {
            type: 'button',
            'aria-expanded': 'false',
            onclick: (e: Event) => {
              r.classList.toggle('open');
              const open = r.classList.contains('open');
              (e.currentTarget as HTMLElement).setAttribute('aria-expanded', String(open));
              if (open && !paid) {
                paid = true;
                app.xp(1, r);
              }
            },
          },
          h('span', {}, '🤔'),
          h('span', { class: 'q', 'data-nf': 'label', html: fmt(b.label) }),
          h('span', { class: 'chev' }, '▸'),
        ),
        h('div', { class: 'ans', 'data-nf': 'text', html: fmt(b.text) }),
      );
      wrap.append(r);
      break;
    }
    case 'ask': {
      const box = h('div', { class: 'ask' });
      const ol = h(
        'ol',
        {},
        (b.questions ?? []).map((q, k) => {
          const li = h(
            'li',
            {
              'data-nf': `questions.${String(k)}`,
              onclick: () => {
                li.classList.add('shown');
              },
            },
            h('span', { html: fmt(q) }),
          );
          return li;
        }),
      );
      const tog = h(
        'button',
        {
          class: 'btn small',
          type: 'button',
          style: { marginLeft: 'auto' },
          onclick: () => {
            box.classList.toggle('recall');
            for (const l of ol.querySelectorAll('li')) l.classList.remove('shown');
            tog.textContent = box.classList.contains('recall')
              ? `👁️ ${app.t('engine.blk.showAll')}`
              : `🙈 ${app.t('engine.blk.recallMode')}`;
          },
        },
        `🙈 ${app.t('engine.blk.recallMode')}`,
      );
      box.append(h('div', { class: 'hd' }, '🧠', h('span', { html: fmt(b.title ?? app.t('engine.blk.askYourself')) }), tog), ol);
      wrap.append(box);
      break;
    }
    case 'terms':
      wrap.append(
        h(
          'div',
          { class: 'terms' },
          items.map((t, k) =>
            h(
              'div',
              { class: 'term' },
              h('b', { 'data-nf': `items.${String(k)}.term`, html: fmt(str(rec(t)['term'])) }),
              h('div', {
                class: 'tiny',
                'data-nf': `items.${String(k)}.def`,
                style: { color: 'var(--ink2)', fontSize: '14px' },
                html: fmt(str(rec(t)['def'])),
              }),
            ),
          ),
        ),
      );
      break;
    default:
      break;
  }
  return wrap;
}

/* the kind of a part, and its text: words of the AI's prompt (English) */
const BLOCK_WHAT: Readonly<Record<string, string>> = {
  p: 'paragraph',
  list: 'list',
  code: 'code example',
  figure: 'figure',
  interactive: 'interactive activity',
  diagram: 'diagram',
  table: 'table',
  callout: 'note',
  compare: 'comparison',
  flow: 'process',
  reveal: 'question',
  ask: 'set of questions',
  terms: 'set of terms',
};
/** 💡 on a block and on its cards and items (compare columns, terms, list items, table rows) */
function explainParts(app: StudyApp, el: HTMLElement, b: Block, s: Section): HTMLElement {
  const text = (x: Block): string => blockText(x, app.host.media, y => app.host.activities.asText(y));
  const bid = el.dataset['bid'] ?? '';
  const ex = app.tutor.explainable.bind(app.tutor);
  const m = b.media ? app.host.media[b.media] : undefined;
  ex(el, () => ({
    label: b.title ?? b.label ?? b.caption ?? (b.t === 'figure' ? (m?.alt ?? app.t('engine.aimsg.thisFigure')) : text(b)),
    text: text(b),
    sec: s,
    what: BLOCK_WHAT[b.t] ?? 'part of the lesson',
    bid,
  }));
  const items = b.items ?? [];
  if (b.t === 'compare')
    el.querySelectorAll<HTMLElement>('.compare > div').forEach((d, k) => {
      const it = rec(items[k]);
      if (!items[k]) return;
      const title = str(it['title']);
      ex(d, () => ({
        label: title,
        text: `${title}:\n${strs(it['points'])
          .map(p => `- ${p}`)
          .join('\n')}\n\n(Compared with: ${items
          .filter(x => x !== items[k])
          .map(x => str(rec(x)['title']))
          .join(', ')})`,
        sec: s,
        what: 'card',
        bid,
      }));
    });
  if (b.t === 'terms')
    el.querySelectorAll<HTMLElement>('.term').forEach((d, k) => {
      const t = rec(items[k]);
      if (!items[k]) return;
      ex(d, () => ({ label: str(t['term']), text: `${str(t['term'])}: ${str(t['def'])}`, sec: s, what: 'term', bid }));
    });
  if (b.t === 'list')
    el.querySelectorAll<HTMLElement>('li').forEach((d, k) => {
      const x = str(items[k]);
      if (x.length > 30) ex(d, () => ({ label: x, text: `${x}\n\n(One item of the list:\n${text(b)})`, sec: s, what: 'point', bid }));
    });
  if (b.t === 'table')
    el.querySelectorAll<HTMLElement>('tbody tr').forEach((d, k) => {
      const r = b.rows?.[k];
      if (!r) return;
      ex((d.lastElementChild as HTMLElement | null) ?? d, () => ({
        label: r[0] ?? '',
        text: (b.head ?? []).map((hd, j) => `${hd}: ${r[j] ?? ''}`).join('\n'),
        sec: s,
        what: 'row of the table',
        bid,
      }));
    });
  return el;
}

/** bite-size chunks of about 3–4 blocks (a lone last block joins the chunk before it) */
export function chunkBlocks(blocks: readonly Block[]): Block[][] {
  const out: Block[][] = [];
  let cur: Block[] = [],
    weight = 0;
  for (const b of blocks) {
    const w = b.t === 'list' ? 1.3 : ['code', 'diagram', 'table', 'compare'].includes(b.t) ? 1.6 : 1;
    cur.push(b);
    weight += w;
    if (weight >= 3.6) {
      out.push(cur);
      cur = [];
      weight = 0;
    }
  }
  const lastChunk = out.at(-1);
  if (cur.length) {
    if (lastChunk && cur.length === 1) lastChunk.push(...cur);
    else out.push(cur);
  }
  return out;
}

/** the section's ways to ask the tutor: [the learner's first message (their bubble, in the UI language), the task] */
const SEC_ASK = {
  socratic: ['engine.aimsg.secSocratic', 'secSocratic'],
  debug: ['engine.aimsg.secDebug', 'secDebug'],
  interview: ['engine.aimsg.secInterview', 'secInterview'],
} as const;
function askSection(app: StudyApp, s: Section, mode: keyof typeof SEC_ASK): void {
  const [msg, intent] = SEC_ASK[mode];
  app.tutor.open({ kind: 'section', id: s.id, origin: { via: `section_${mode}`, sec: s.id } }, mode, app.t(msg, { title: s.title }), {
    intent: app.tutor.intent(intent),
  });
}

function sectionMenu(app: StudyApp, s: Section, c: Chapter, fresh: () => HTMLElement | null): () => (MenuEntry | null)[] {
  const who = app.host.frame.character();
  return () => {
    const slot = fresh();
    return [
      {
        label: app.L('askSocratic'),
        icon: who.avatar,
        run: () => {
          askSection(app, s, 'socratic');
        },
      },
      slot
        ? {
            label: app.L('askFresh'),
            sub: app.L('askFreshSub'),
            icon: '✨',
            run: () => {
              slot.dispatchEvent(new Event('noema-fresh'));
              slot.scrollIntoView({ behavior: 'smooth', block: 'center' });
            },
          }
        : null,
      {
        label: app.L('searchSubject'),
        icon: 'search',
        run: () => {
          openSearch(app);
        },
      },
      {
        label: app.L('sources'),
        sub: app.L('sourcesSub'),
        icon: 'book',
        run: () => {
          app.sourcesUi.toggleDeck();
        },
      },
      sprintEntry(app),
      app.host.bridge.menuItem(),
      '-',
      { label: app.L('allSections'), icon: 'list', href: `#/ch/${c.id}` },
    ];
  };
}

export function sectionView(app: StudyApp, sid: string, bid?: string): void {
  const s = app.course.section(sid);
  const c = s && app.course.chapterOf(s);
  if (!s || !c) {
    app.go('#/subject');
    return;
  }
  const bids = app.host.blockIds(s.blocks); // stable ids: #/s/<section>/<block> opens exactly that block
  setAccent(document.body, c);
  const S = app.state;
  S.last = sid;
  app.host.save();
  app.tutor.setContext({ kind: 'section', id: sid });
  const j = app.course.sectionIndex(s);
  let freshSlot: HTMLElement | null = null;
  app.host.frame.chrome({
    sub: true,
    crumbs: [[`${c.emoji ?? ''} ${c.title}`, `#/ch/${c.id}`]],
    back: `#/ch/${c.id}`,
    reading: true,
    menu: sectionMenu(app, s, c, () => freshSlot),
  });
  app.host.frame.noteRecent({
    sid,
    secTitle: s.title,
    chNum: c.num,
    chOf: app.course.chapters.length,
    secNum: j + 1,
    secOf: c.sections.length,
  });
  const chunks = S.settings.chunk ? chunkBlocks(s.blocks) : [[...s.blocks]];
  let shown = app.shownChunks.get(sid) ?? (S.read[sid] ? chunks.length : 1);
  const target = bid ? s.blocks[bids.indexOf(bid)] : undefined; // a found block: every chunk up to it is shown
  if (target) {
    const ci = chunks.findIndex(ch => ch.includes(target));
    if (ci >= 0 && ci + 1 > shown) {
      shown = ci + 1;
      app.shownChunks.set(sid, shown);
    }
  }
  const prev = c.sections[j - 1],
    next = c.sections[j + 1];
  const body = h('div');
  const bar = h('i', { style: { width: '0%' } });
  const pl = h('div', { class: 'progressline' }, bar);
  const tail = h('div');
  const framed = app.host.frame.framed;
  const headRow = h(
    'div',
    { class: 'row' },
    h(
      'span',
      { class: 'pill c' },
      framed
        ? `${app.L('chOf', { n: c.num, of: app.course.chapters.length })} · ${app.L('secOf', { n: j + 1, of: c.sections.length })}`
        : app.t('engine.sec.nOfM', { n: j + 1, of: c.sections.length }),
    ),
    S.read[sid] ? h('span', { class: 'pill', style: { background: 'var(--ok-bg)', color: 'var(--ok)' } }, `✓ ${app.L('read')}`) : null,
  );
  view(
    app,
    h(
      'div',
      { class: 'reader' },
      backBtn(app, `${app.arrowBack} ${c.emoji ?? ''} ${app.chTitle(c.num, c.title)}`, `#/ch/${c.id}`),
      pl,
      app.tutor.explainable(
        h(
          'div',
          { class: 'sechead' },
          headRow,
          h('h1', { style: { marginTop: '10px' } }, s.title),
          s.hook ? h('p', { class: 'hook', html: fmt(s.hook) }) : null,
        ),
        () => ({
          label: s.title,
          text: `The whole section "${s.title}" — ${s.hook ?? ''} (give me the big picture of this section)`, // for the AI (English)
          sec: s,
          what: 'section',
        }),
      ),
      body,
      tail,
    ),
  );
  const scrollToChunk = (): void => {
    const els = body.querySelectorAll('.blk');
    els[els.length - (chunks[shown - 1]?.length ?? 1)]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const draw = (scroll = false): void => {
    body.replaceChildren();
    chunks.slice(0, shown).forEach((ch, ci) => {
      ch.forEach((b, i) => {
        const el = renderBlock(app, b, ci === shown - 1 ? i : 0, s.id);
        el.dataset['bid'] = bids[s.blocks.indexOf(b)] ?? '';
        if (b.src && b.src !== c.src && app.isNewSource(b.src)) {
          el.classList.add('is-new');
          el.prepend(h('span', { class: 'newtag' }, `✨ ${app.t('engine.src.NEW')}`));
        }
        explainParts(app, el, b, s);
        body.append(el);
      });
    });
    bar.style.width = `${String((shown / chunks.length) * 100)}%`;
    tail.replaceChildren();
    if (shown < chunks.length) {
      tail.append(
        h(
          'div',
          { class: 'continue' },
          h(
            'div',
            { class: 'row' },
            h(
              'button',
              {
                class: 'btn primary',
                type: 'button',
                onclick: () => {
                  shown++;
                  app.shownChunks.set(sid, shown);
                  draw(true);
                },
              },
              `${app.L('continueRead')} ▾  (${app.nf(shown)}/${app.nf(chunks.length)})`,
            ),
            h(
              'button',
              {
                class: 'btn ghost small',
                type: 'button',
                onclick: () => {
                  shown = chunks.length;
                  app.shownChunks.set(sid, shown);
                  draw();
                },
              },
              app.L('showAll'),
            ),
          ),
        ),
      );
    } else {
      if (!S.read[sid]) {
        S.read[sid] = true;
        app.host.save();
        app.xp(5, pl);
        // the last section of the chapter
        if (c.sections.every(x => S.read[x.id]))
          setTimeout(() => {
            app.host.feedback.big('chapter');
          }, 500);
      }
      const t = sectionTail(app, s, c, prev, next);
      freshSlot = t.querySelector<HTMLElement>('.freshslot');
      tail.append(t);
    }
    if (scroll) scrollToChunk();
    // 文A language help: the words of the theory in the learner's language (docs/BRIDGE.md)
    app.host.bridge.section({ sid, body, head: headRow });
  };
  draw();
  if (target) showHit(body.querySelector(`[data-bid="${CSS.escape(bids[s.blocks.indexOf(target)] ?? '')}"]`));
}

function sectionTail(app: StudyApp, s: Section, c: Chapter, prev: Section | undefined, next: Section | undefined): HTMLElement {
  const exs = c.exercises.filter(e => e.section === s.id);
  const quick = exs.filter(e => e.quick);
  const pbs = c.debug.filter(d => d.section === s.id);
  const zone = h('div', { class: 'quickzone' });
  const locked = !!app.lock;
  if (locked) {
    if (exs.length || pbs.length) zone.append(lockNote(app));
  } else if (quick.length) {
    zone.append(h('h3', {}, `⚡ ${app.L('quickCheck')}`, h('span', { class: 'tiny' }, app.L('quickCheckSub', { n: quick.length }))));
    for (const e of quick) zone.append(exerciseCard(app, e));
  }
  if (pbs.length && !locked) {
    zone.append(h('h3', { style: { margin: '22px 0 10px' } }, `🔧 ${app.L('sectionDrill')}`));
    for (const d of pbs) zone.append(drillTile(app, d));
  }
  const fresh = h('div', { class: locked ? '' : 'freshslot' });
  const freshQ = async (): Promise<void> => {
    const note = h('p', { class: 'tiny' }, `✨ ${app.L('generating')}`);
    fresh.prepend(note);
    try {
      const ex = await app.ai.question(s);
      note.replaceWith(exerciseCard(app, ex));
    } catch (er) {
      note.remove();
      app.toast(`⚠️ ${app.errText(er)}`, 4000);
    }
  };
  const who = app.host.frame.character();
  const ask = [
    {
      label: app.L('askSocratic'),
      icon: who.avatar,
      ai: true,
      run: () => {
        askSection(app, s, 'socratic');
      },
    },
    {
      label: app.L('askDebug'),
      icon: '🔧',
      ai: false,
      run: () => {
        askSection(app, s, 'debug');
      },
    },
    {
      label: app.L('askInterview'),
      icon: '🎤',
      ai: false,
      run: () => {
        askSection(app, s, 'interview');
      },
    },
    {
      label: app.L('askFresh'),
      icon: '✨',
      ai: false,
      run: () => {
        void freshQ();
      },
    },
  ];
  if (!locked)
    fresh.addEventListener('noema-fresh', () => {
      void freshQ();
    }); // the section's ⋮ › A new question
  const framed = app.host.frame.framed;
  const go = (href: string) => () => {
    app.go(href);
  };
  // in the frame the tutor's ways (Socratic, debugging, interview) are in its own window and a new question in the section's ⋮
  zone.append(
    fresh,
    h(
      'div',
      { class: 'row sectools' },
      framed
        ? null
        : h(
            'span',
            { class: 'row' },
            ask.map(a => h('button', { class: `btn${a.ai ? ' ai' : ''}`, type: 'button', onclick: a.run }, `${a.icon} ${a.label}`)),
          ),
      exs.length && !locked
        ? h(
            'button',
            {
              class: 'btn ghost',
              type: 'button',
              onclick: () => {
                app.startRound(exs, { title: `🎯 ${s.title}`, count: exs.length, back: `#/s/${s.id}` });
              },
            },
            `🎯 ${app.L('allExercises', { n: exs.length })}`,
          )
        : null,
    ),
  );
  if (!framed) {
    zone.append(
      h(
        'div',
        { class: 'secnav' },
        prev ? h('button', { class: 'btn', type: 'button', onclick: go(`#/s/${prev.id}`) }, `${app.arrowBack} ${prev.title}`) : h('span'),
        next
          ? h('button', { class: 'btn primary', type: 'button', onclick: go(`#/s/${next.id}`) }, `${next.title} ${app.arrowOn}`)
          : h(
              'button',
              { class: 'btn primary', type: 'button', onclick: go(`#/ch/${c.id}/practice`) },
              `🎯 ${app.L('practiceChapter')} ${app.arrowOn}`,
            ),
      ),
    );
    return zone;
  }
  // the frame: one big "Next section" (the next chapter's first one after the last section), the chapter's practice beside it
  const all = app.course.chapters;
  const nextCh = next ? undefined : all[all.findIndex(x => x.id === c.id) + 1];
  const to = next ?? nextCh?.sections[0];
  zone.append(
    h(
      'nav',
      { class: 'secnav ns-secnav', 'aria-label': app.L('nextSection') },
      to
        ? h(
            'button',
            { class: 'btn primary secnext', type: 'button', onclick: go(`#/s/${to.id}`) },
            h('span', { class: 'nx' }, `${app.L('nextSection')} ${app.arrowOn}`),
            h('small', {}, next ? next.title : nextCh ? app.L('nextChapterFirst', { n: nextCh.num, title: nextCh.title }) : ''),
          )
        : h(
            'button',
            { class: 'btn primary secnext', type: 'button', onclick: go(`#/ch/${c.id}/practice`) },
            h('span', { class: 'nx' }, `🎯 ${app.L('practiceChapter')} ${app.arrowOn}`),
          ),
      to && !next
        ? h('button', { class: 'btn', type: 'button', onclick: go(`#/ch/${c.id}/practice`) }, `🎯 ${app.L('practiceChapter')}`)
        : null,
      prev
        ? h(
            'button',
            { class: 'btn ghost small secprev', type: 'button', title: prev.title, onclick: go(`#/s/${prev.id}`) },
            `${app.arrowBack} ${app.L('prevSection')}`,
          )
        : null,
    ),
  );
  return zone;
}
