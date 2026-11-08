/**
 * Flashcards (#/cards[/<key>]) and debug drills (#/drills, #/drill/<id>): both scheduled by FSRS-6
 * (domain/fsrs.ts). state.fc and state.pb hold each card's and drill's memory; an entry still in the old Leitner shape
 * is read as the memory it stands for and replaced at its next review.
 */
import { cardRating, playbookRating } from '../../domain/events/types.ts';
import type { Drill, Exercise } from '../../domain/pack.ts';
import type { CardItem, StudyApp } from '../app.ts';
import { append, h } from '../dom.ts';
import { exerciseCard } from '../exercise/card.ts';
import { askButton, codeEl, setAccent } from '../parts.ts';
import { fmt, guessLang } from '../text.ts';
import { view } from '../view.ts';

/** A card rated (0 again, 1 good, 2 easy): a card.reviewed event with its FSRS rating (the log folds state.fc). */
export function rateCard(app: StudyApp, key: string, q: 0 | 1 | 2): void {
  app.host.learn('card.reviewed', key, { rating: cardRating(q) });
}

export function cardsView(app: StudyApp, key?: string): void {
  setAccent(document.body, null);
  app.host.frame.chrome({ sub: true, crumbs: [[app.t('home.cards')]], back: '#/subject' });
  const body = h('div');
  view(app, h('h1', {}, app.t('view.cards')), h('p', { class: 'muted' }, app.t('engine.cards.intro')), body);
  const one = key ? app.cards().filter(c => c.key === key) : []; // #/cards/<key>: the one card the search found
  if (one.length) flashDeck(app, body, one, { all: true });
  else flashDeck(app, body, app.cards());
}

/** Ask the character about a flashcard: a hint while its answer is hidden, a deeper explanation once it is turned. */
function askAboutCard(app: StudyApp, c: CardItem, turned: boolean): void {
  // the card as context for the AI (English)
  const ctx = {
    kind: 'exercise' as const,
    id: `fc:${c.key}`,
    origin: { via: turned ? 'cardExplain' : 'cardHint', card: c.key, ...(c.section ? { sec: c.section } : {}) },
    text: `Flashcard (chapter ${String(c.chapter.num)} “${c.chapter.title}”)\nFront: ${String(c.q)}\nBack: ${String(c.a)}`,
  };
  if (turned) app.tutor.open(ctx, 'explain', app.t('engine.aimsg.cardExplain'));
  else app.tutor.open(ctx, 'hint', app.t('engine.aimsg.cardHint'), { intent: app.tutor.intent('exHint', '') });
}

/** Fits the FSRS parameters to the learner's reviews again once enough new ones came (quietly, nothing to wait for). */
function refitFsrs(app: StudyApp): void {
  void app.host.refitFsrs(app.state.settings.fsrs ?? null).then(r => {
    if (!r) return;
    const keep = app.state.settings.fsrs?.retention;
    app.state.settings.fsrs = { parameters: r.parameters, ...(keep ? { retention: keep } : {}), n: r.n };
    app.host.save();
  });
}

export function flashDeck(
  app: StudyApp,
  body: HTMLElement,
  cards: readonly CardItem[],
  o: { readonly all?: boolean; readonly onDone?: () => HTMLElement } = {},
): void {
  const deck = app.deck(cards, o.all ? { all: true } : {}),
    queue = deck.queue; // all: every card given (the ones the search found), due or not
  body.append(
    h(
      'div',
      { class: 'row', style: { margin: '6px 0 16px' } },
      h('span', { class: 'pill c' }, app.t('engine.cards.due', { n: deck.due })),
      h('span', { class: 'pill' }, app.t('engine.cards.new', { n: deck.fresh })),
      h('span', { class: 'pill' }, app.t('engine.cards.resting', { n: deck.resting })),
    ),
  );
  const stage = h('div');
  body.append(stage);
  let i = 0;
  const show = (): void => {
    stage.replaceChildren();
    const c = queue[i];
    if (!c) {
      stage.append(h('div', { class: 'empty' }, h('div', { class: 'e' }, '🌟'), h('p', {}, app.t('engine.cards.done'))));
      if (queue.length) {
        app.host.feedback.confetti(80);
        refitFsrs(app);
      }
      if (o.onDone) stage.append(o.onDone());
      return;
    }
    const fl = h(
      'div',
      { class: 'flash has-ask', 'data-card': c.key },
      h(
        'div',
        {
          class: 'inner',
          role: 'button',
          tabindex: '0',
          'aria-label': app.t('engine.cards.flip'),
          onclick: () => {
            fl.classList.toggle('flipped');
          },
          onkeydown: (e: Event) => {
            if (e instanceof KeyboardEvent && (e.key === ' ' || e.key === 'Enter') && e.target === e.currentTarget) {
              e.preventDefault();
              e.stopPropagation();
              fl.classList.toggle('flipped');
            }
          },
        },
        h(
          'div',
          { class: 'face' },
          h('small', {}, `${c.chapter.emoji ?? ''} ${app.chTitle(c.chapter.num, `${app.nf(i + 1)}/${app.nf(queue.length)}`)}`),
          h('div', { 'data-nf': 'q', html: fmt(c.q) }),
          h('div', { class: 'tiny', style: { position: 'absolute', bottom: '14px' } }, app.t('engine.cards.flip')),
        ),
        h('div', { class: 'face back' }, h('small', {}, app.t('engine.cards.answer')), h('div', { 'data-nf': 'a', html: fmt(c.a) })),
      ),
    );
    setAccent(fl, c.chapter);
    const who = app.host.frame.character();
    fl.append(
      askButton(who.face, who.avatar, app.L('askTutor'), () => {
        askAboutCard(app, c, fl.classList.contains('flipped'));
      }),
    );
    const rate = (q: 0 | 1 | 2): void => {
      rateCard(app, c.key, q);
      app.xp(q === 0 ? 1 : 2, fl);
      if (q === 0) queue.push(c);
      i++;
      show();
    };
    const sec = c.section ? app.course.section(c.section) : undefined;
    append(stage, [
      fl,
      h(
        'div',
        { class: 'rate' },
        h(
          'button',
          {
            class: 'btn',
            type: 'button',
            onclick: () => {
              rate(0);
            },
          },
          `😵 ${app.t('engine.cards.again')}`,
        ),
        h(
          'button',
          {
            class: 'btn',
            type: 'button',
            onclick: () => {
              rate(1);
            },
          },
          `🙂 ${app.t('engine.cards.good')}`,
        ),
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            onclick: () => {
              rate(2);
            },
          },
          `😎 ${app.t('engine.cards.easy')}`,
        ),
      ),
      sec
        ? h(
            'div',
            { style: { textAlign: 'center', marginTop: '10px' } },
            h(
              'button',
              {
                class: 'tiny linkish',
                type: 'button',
                style: { textDecoration: 'underline' },
                onclick: () => {
                  app.go(`#/s/${sec.id}`);
                },
              },
              app.t('engine.cards.openSection'),
            ),
          )
        : null,
    ]);
  };
  show();
}

/* ---------- debug drills ---------- */
export function drillTile(app: StudyApp, d: Drill): HTMLElement {
  const box = app.drillBox(d); // mastery 0–5: the interval reached, on the old boxes' scale
  const ch = app.course.chapterOf(d);
  const isNew = !!d.src && !!ch && d.src !== (ch as { src?: string }).src && app.isNewSource(d.src);
  const t = h(
    'button',
    {
      class: 'pb',
      type: 'button',
      onclick: () => {
        app.go(`#/drill/${d.id}`);
      },
    },
    h('span', { class: 'ic' }, '🔧'),
    h(
      'div',
      { class: 'grow' },
      h('b', { html: fmt(d.title) }),
      isNew ? h('span', { class: 'newpill' }, `✨ ${app.t('engine.src.new')}`) : null,
      h(
        'div',
        { class: 'tiny' },
        app.t(d.mnemonic ? 'engine.drill.questionsMnemo' : 'engine.drill.questions', { n: d.askYourself.length }),
      ),
    ),
    h(
      'div',
      { class: 'boxes', title: app.t('engine.drill.mastery') },
      [1, 2, 3, 4, 5].map(i => h('i', { class: i <= box ? 'on' : '' })),
    ),
  );
  setAccent(t, ch);
  return t;
}

export function drillList(app: StudyApp, body: HTMLElement, list: readonly Drill[]): void {
  const due = list.filter(d => app.drillDue(d));
  const first = due[0];
  body.append(
    h('p', { class: 'muted' }, app.t('engine.drill.intro')),
    h(
      'div',
      { class: 'row', style: { marginBottom: '14px' } },
      first
        ? h(
            'button',
            {
              class: 'btn primary',
              type: 'button',
              onclick: () => {
                app.go(`#/drill/${first.id}`);
              },
            },
            `▶ ${app.t('engine.drill.nextDue', { n: due.length })}`,
          )
        : h('span', { class: 'pill', style: { background: 'var(--ok-bg)', color: 'var(--ok)' } }, app.t('engine.drill.allRested')),
    ),
    h(
      'div',
      { style: { display: 'grid', gap: '10px' } },
      list.map(d => drillTile(app, d)),
    ),
  );
}

export function drillsView(app: StudyApp): void {
  setAccent(document.body, null);
  app.host.frame.chrome({ sub: true, crumbs: [[app.t('home.drills')]], back: '#/subject' });
  const body = h('div');
  const n = app.course.chapters.reduce((a, c) => a + c.debug.length, 0);
  view(app, h('h1', {}, app.t('view.drills')), h('p', { class: 'muted' }, app.t('engine.drill.playbooks', { n })), body);
  for (const c of app.course.chapters) {
    if (!c.debug.length) continue;
    const sub = h('div', { style: { margin: '22px 0 0' } });
    body.append(h('h3', { style: { margin: '20px 0 10px' } }, `${c.emoji ?? ''} ${app.chTitle(c.num, c.title)}`), sub);
    sub.append(...c.debug.map(d => drillTile(app, d)));
  }
}

export function drillView(app: StudyApp, id: string): void {
  const d = app.course.drill(id);
  const c = d && app.course.chapterOf(d);
  if (!d || !c) {
    app.go('#/drills');
    return;
  }
  setAccent(document.body, c);
  app.tutor.setContext({ kind: 'playbook', id });
  app.host.frame.chrome({
    sub: true,
    crumbs: [
      [`${c.emoji ?? ''} ${c.title}`, `#/ch/${c.id}`],
      [app.t('home.drills'), `#/ch/${c.id}/debug`],
    ],
    back: `#/ch/${c.id}/debug`,
    reading: true,
  });
  const ta = h('textarea', {
    class: 'answer',
    placeholder: app.t('engine.drill.placeholder'),
    'aria-label': app.t('engine.drill.askYourself'),
  });
  const stage = h('div');
  const who = app.host.frame.character();
  const orderDrill = (): void => {
    stage.replaceChildren();
    const ex: Exercise = {
      id: `${d.id}-ord`,
      type: 'order',
      q: app.t('engine.drill.orderQ'),
      items: d.askYourself.slice(0, 9),
      explain: app.t('engine.drill.orderExplain'),
      difficulty: 2,
      tags: ['debug'],
      _ai: true,
      section: d.section ?? '',
    };
    stage.append(h('div', { style: { marginTop: '18px' } }, exerciseCard(app, ex)));
  };
  const reveal = (g: { score: number; hit: number[]; feedback: string } | null): void => {
    stage.replaceChildren();
    const hit = new Set(g?.hit ?? []);
    const checks = d.askYourself.map((_, i) => h('input', { type: 'checkbox', checked: hit.has(i) }));
    if (g)
      stage.append(
        h(
          'div',
          { class: 'fb ai' },
          h(
            'div',
            { class: 'row' },
            h(
              'span',
              { class: 'score', style: { background: g.score >= 70 ? 'var(--ok)' : g.score >= 45 ? 'var(--warn)' : 'var(--bad)' } },
              app.nf(Math.trunc(g.score)),
            ),
            h('div', { class: 'grow' }, app.ai.md(g.feedback)),
          ),
        ),
      );
    const RATES = [
      [`😵 ${app.t('engine.drill.blank')}`, 0],
      [`🤔 ${app.t('engine.drill.partly')}`, 1],
      [`😎 ${app.t('engine.drill.nailed')}`, 2],
    ] as const;
    append(stage, [
      h(
        'div',
        { class: 'ask', style: { marginTop: '18px' } },
        h(
          'div',
          { class: 'hd' },
          `🧠 ${app.t('engine.drill.checklist')}`,
          h('span', { class: 'tiny', style: { marginLeft: 'auto' } }, app.t('engine.drill.tick')),
        ),
        h(
          'div',
          { class: 'rubric' },
          d.askYourself.map((q, i) =>
            h('label', {}, checks[i], h('span', {}, h('b', {}, `${app.nf(i + 1)}. `), h('span', { html: fmt(q) }))),
          ),
        ),
      ),
      d.mnemonic
        ? h(
            'div',
            { style: { marginTop: '14px' } },
            h('div', { class: 'tiny', style: { fontWeight: '700' } }, app.t('engine.drill.hook')),
            h('div', { class: 'mnemo', html: fmt(d.mnemonic) }),
          )
        : null,
      h('h3', { style: { margin: '22px 0 10px' } }, `🛠️ ${app.t('engine.drill.steps')}`),
      h(
        'div',
        { class: 'steps' },
        d.steps.map((s, i) =>
          h(
            'div',
            { class: 'stepc' },
            h('b', { html: `${app.nf(i + 1)}. ${fmt(s.do)}` }),
            s.why ? h('div', { class: 'tiny', style: { color: 'var(--ink2)', fontSize: '14px' }, html: `↳ ${fmt(s.why)}` }) : null,
            s.code ? h('div', { style: { marginTop: '8px' } }, codeEl(s.code, guessLang(s.code), app.t('engine.core.copy'))) : null,
          ),
        ),
      ),
      h('h3', { style: { margin: '22px 0 10px' } }, `🎯 ${app.t('engine.drill.causes')}`),
      h(
        'ul',
        {},
        d.rootCauses.map(r => h('li', { html: fmt(r) })),
      ),
      h(
        'div',
        { class: 'callout tip', style: { marginTop: '12px' } },
        h('span', { class: 'ci' }, '✅'),
        h('b', { class: 't' }, app.t('engine.ex.fix')),
        h('div', { html: fmt(d.fix) }),
      ),
      h('h3', { style: { margin: '24px 0 10px' } }, app.t('engine.drill.howWell')),
      h(
        'div',
        { class: 'row' },
        RATES.map(([l, q]) =>
          h(
            'button',
            {
              class: `btn${q === 2 ? ' primary' : ''}`,
              type: 'button',
              onclick: () => {
                const ticked = checks.filter(x => x.checked).length / Math.max(1, checks.length);
                // blank → again, partly → hard, nailed → easy with most of the checklist ticked, else good
                app.host.learn('playbook.reviewed', d.id, { rating: playbookRating(q, ticked), score: ticked });
                app.xp(3 + Math.round(ticked * 7), stage);
                if (q === 2) app.host.feedback.confetti(70);
                const others = app.course.chapters.flatMap(x => x.debug).filter(x => x.id !== d.id && app.drillDue(x));
                const nxt = others.find(x => app.course.chapterOf(x)?.id === c.id) ?? others[0];
                app.toast(nxt ? app.t('engine.drill.savedNext') : app.t('engine.drill.saved'));
                setTimeout(() => {
                  app.go(nxt ? `#/drill/${nxt.id}` : `#/ch/${c.id}/debug`);
                }, 700);
              },
            },
            l,
          ),
        ),
      ),
    ]);
    stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  view(
    app,
    h(
      'div',
      { class: 'reader' },
      h('span', { class: 'pill c' }, `🔧 ${app.t('engine.drill.pill')}`),
      h('h1', { style: { margin: '10px 0 14px' }, html: fmt(d.title) }),
      h('div', { class: 'tiny', style: { fontWeight: '700', marginBottom: '6px' } }, app.t('engine.drill.symptom')),
      h('div', { class: 'symptom', html: fmt(d.symptom) }),
      h('h3', { style: { margin: '22px 0 8px' } }, `🧠 ${app.t('engine.drill.askYourself')}`),
      ta,
      h(
        'div',
        { class: 'actions', style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '10px' } },
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            onclick: () => {
              reveal(null);
            },
          },
          `👀 ${app.t('engine.drill.reveal')}`,
        ),
        h(
          'button',
          {
            class: 'btn ai',
            type: 'button',
            onclick: async (e: Event) => {
              if (!ta.value.trim()) {
                ta.classList.add('shake');
                setTimeout(() => {
                  ta.classList.remove('shake');
                }, 500);
                return;
              }
              const b = e.currentTarget as HTMLButtonElement;
              b.disabled = true;
              b.textContent = `✨ ${app.t('engine.ex.grading')}`;
              try {
                reveal(await app.ai.drillGrade(d, ta.value));
              } catch (er) {
                app.toast(`⚠️ ${app.errText(er)}`, 4000);
                reveal(null);
              }
            },
          },
          `✨ ${app.t('engine.drill.grade')}`,
        ),
        h('button', { class: 'btn', type: 'button', onclick: orderDrill }, `🔢 ${app.t('engine.drill.order')}`),
        h(
          'button',
          {
            class: 'btn',
            type: 'button',
            onclick: () => {
              // the learner's first message: their bubble, in the UI language
              app.tutor.open(
                { kind: 'playbook', id, origin: { via: 'drillRoleplay', drill: id } },
                'debug',
                app.t('engine.aimsg.pbRoleplay', { title: d.title }),
                {
                  intent: app.tutor.intent('pbRoleplay'),
                },
              );
            },
          },
          `🎭 ${app.t('engine.drill.roleplay', { tutor: who.name })}`,
        ),
      ),
      stage,
    ),
  );
}
