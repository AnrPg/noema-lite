/* The Roadmap screens of the levels in a DOM (happy-dom): the quiz, the level bar (the ladder, moving up and its moment,
   the test due, a proposal), the level test, Claude's proposed arrangement, a step's placement test — what they show,
   what they ask of the data port, the events they fire. Layout, axe and the keyboard in a real browser: tests/roadmap_levels.js. */
import '../../../../ui/test/dom.ts';
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { defineUi } from '../../../../ui/index.ts';
import { settle } from '../../../../ui/test/services.ts';
import { defineRoadmapsUi, NoemaRoadmapStepTest } from '../index.ts';
import type { QuizDone } from '../quiz.ts';
import { cleanup, fakeData, host, QUESTIONS, roadmap } from './fixtures.ts';

defineUi();
defineRoadmapsUi();
afterEach(cleanup);

/** everything under an element (its own shadow root first), through the shadow roots */
const deep = (r: Element | ShadowRoot): Element[] => {
  const kids = [...(r instanceof Element && r.shadowRoot ? [r.shadowRoot] : []), r];
  return kids.flatMap(k => [...k.children].flatMap(e => [e, ...deep(e)]));
};
const find = (sel: string, root: Element = document.body): HTMLElement | undefined =>
  deep(root).find((e): e is HTMLElement => e.matches(sel));
/** the text a learner sees: every text node, through the shadow roots (slotted text once) */
const text = (root: Node): string => {
  const walk = (n: Node): string =>
    n.nodeType === 3
      ? (n.textContent ?? '')
      : n.nodeType === 8
        ? ''
        : [...(n instanceof Element && n.shadowRoot ? [n.shadowRoot] : []), ...n.childNodes].map(walk).join(' ');
  return walk(root).replace(/\s+/g, ' ');
};
const click = (sel: string, root?: Element): void => {
  const e = find(sel, root);
  if (!e) throw new Error(`no ${sel}`);
  (e.shadowRoot?.querySelector('button') ?? e).click();
};
const flush = async (): Promise<void> => {
  for (let i = 0; i < 4; i++) {
    await new Promise(r => setTimeout(r, 0));
    await settle(document.body);
  }
};

describe('the quiz', () => {
  test('one question after the other: right and wrong shown with why, then the result event', async () => {
    host(fakeData(roadmap()));
    const q = document.createElement('noema-roadmap-quiz');
    q.questions = QUESTIONS.slice(0, 2);
    let done: QuizDone | null = null;
    q.addEventListener('roadmap-quiz-done', e => (done = (e as CustomEvent<QuizDone>).detail));
    document.body.append(q);
    await flush();
    assert.match(text(q), /Question 1 of 2/);
    assert.ok(q.shadowRoot?.querySelector('.q b'), 'the question’s Markdown as safe inline HTML');
    const opts = [...(q.shadowRoot?.querySelectorAll<HTMLButtonElement>('.opt') ?? [])];
    opts[1]?.click();
    await flush();
    assert.ok(opts[1]?.classList.contains('bad') && opts[0]?.classList.contains('ok'), 'the pick is marked wrong, the right answer right');
    assert.ok(
      opts.every(b => b.disabled),
      'no second pick',
    );
    assert.match(text(q), /Not right\. because 1/);
    click('.next', q);
    await flush();
    assert.match(text(q), /Question 2 of 2/);
    q.shadowRoot?.querySelector<HTMLButtonElement>('.opt')?.click();
    await flush();
    assert.match(text(q), /Right\. because 2/);
    assert.match(text(q), /See the result/);
    click('.next', q);
    await flush();
    assert.deepEqual(done, { right: 1, total: 2 });
  });
});

describe('the level bar', () => {
  test('a done level is reached: the moment shows it and what comes next; the ladder and the current level', async () => {
    const d = fakeData(roadmap());
    d.masteredIds.add('a');
    d.reachNext = ['y1'];
    const h = host(d);
    const bar = Object.assign(document.createElement('noema-roadmap-levels'), { account: 'me', roadmapId: 'r1' });
    h.append(bar);
    await flush();
    await bar.settled;
    await flush();
    assert.deepEqual(d.calls, ['advance']);
    const m = document.querySelector('noema-roadmap-level-reached');
    assert.ok(m, 'the level-reached moment opened');
    assert.match(text(m), /Level reached: First year/);
    assert.match(text(m), /Next: Year 2/, 'a preset level without a name of its own: the catalog’s');
    assert.equal(bar.shadowRoot?.querySelectorAll('noema-level-badge').length, 2, 'the ladder: every level');
    const states = [...bar.renderRoot.querySelectorAll('noema-level-badge')].map(b => b.getAttribute('state'));
    assert.deepEqual(states, ['done', 'current']);
    assert.match(text(bar), /Level: Year 2/);
    assert.ok(find('noema-progress', bar), 'how far the current level is');
    click('noema-button', m);
    await flush();
    assert.ok(!document.querySelector('noema-roadmap-level-reached'), 'Continue closes the moment');
    bar.refresh();
    await bar.settled;
    await flush();
    assert.ok(!document.querySelector('noema-roadmap-level-reached'), 'no second moment for the same level');
  });

  test('a Roadmap without levels and without a proposal: nothing on the map', async () => {
    const c = roadmap();
    delete (c as { levels?: unknown }).levels;
    const h = host(fakeData(c));
    const bar = Object.assign(document.createElement('noema-roadmap-levels'), { account: 'me', roadmapId: 'r1' });
    h.append(bar);
    await flush();
    await bar.settled;
    await flush();
    assert.equal(bar.shadowRoot?.querySelector('.box'), null);
  });

  test('the level test when the Roadmap asks for one: passed → the level is reached, the map is told', async () => {
    const d = fakeData(roadmap({ levelTest: true }));
    d.masteredIds.add('a');
    const h = host(d);
    const bar = Object.assign(document.createElement('noema-roadmap-levels'), { account: 'me', roadmapId: 'r1' });
    let changed = 0;
    bar.addEventListener('roadmap-levels-changed', () => changed++);
    h.append(bar);
    await flush();
    await bar.settled;
    await flush();
    assert.match(text(bar), /First year is done: take the level test to move up/);
    click('.take', bar);
    await flush();
    const t = document.querySelector('noema-roadmap-level-test');
    assert.ok(t);
    assert.ok(d.calls.includes('packs a'), 'its questions come from the level’s own prepared subjects');
    assert.match(text(t), /Level test: First year/);
    assert.match(text(t), /8 questions from the subjects of this level/);
    click('.start', t);
    await flush();
    for (let i = 0; i < 8; i++) {
      const quiz = find('noema-roadmap-quiz', t);
      quiz?.shadowRoot?.querySelector<HTMLButtonElement>('.opt')?.click();
      await flush();
      if (quiz) click('.next', quiz);
      await flush();
    }
    assert.ok(d.calls.includes('testTaken y1 1'), 'the score goes to the levels (NoemaCore.roadmaps.levels.testTaken)');
    assert.match(text(t), /Passed: 8 of 8\. You moved up a level\./);
    assert.ok(changed >= 1, 'the map is told');
    await bar.settled;
    await flush();
    assert.match(text(bar), /Level: Year 2/);
    assert.doesNotMatch(text(bar), /take the level test/);
    assert.ok(!document.querySelector('noema-roadmap-level-reached'), 'the moment waits until the result is read');
    click('noema-button', t);
    await flush();
    const m = document.querySelector('noema-roadmap-level-reached');
    assert.ok(m && /Level reached: First year/.test(text(m)), 'OK → the level-reached moment');
  });

  test('a failed level test says so and keeps the level', async () => {
    const d = fakeData(roadmap({ levelTest: true }));
    d.masteredIds.add('a');
    const h = host(d);
    const bar = Object.assign(document.createElement('noema-roadmap-levels'), { account: 'me', roadmapId: 'r1' });
    h.append(bar);
    await flush();
    await bar.settled;
    await flush();
    click('.take', bar);
    await flush();
    const t = document.querySelector('noema-roadmap-level-test');
    assert.ok(t);
    click('.start', t);
    await flush();
    for (let i = 0; i < 8; i++) {
      const quiz = find('noema-roadmap-quiz', t);
      quiz?.shadowRoot?.querySelectorAll<HTMLButtonElement>('.opt')[1]?.click();
      await flush();
      if (quiz) click('.next', quiz);
      await flush();
    }
    assert.match(text(t), /0 of 8: not 80 % yet/);
    assert.deepEqual(d.reached, []);
  });
});

describe('Claude’s proposed arrangement', () => {
  test('the owner reads every change in their words and applies it', async () => {
    const d = fakeData(roadmap({ proposal: true }));
    const h = host(d);
    const bar = Object.assign(document.createElement('noema-roadmap-levels'), { account: 'me', roadmapId: 'r1' });
    h.append(bar);
    await flush();
    await bar.settled;
    await flush();
    assert.match(text(bar), /Claude proposes a new arrangement of the levels/);
    click('.review', bar);
    await flush();
    const r = document.querySelector('noema-roadmap-restructure');
    assert.ok(r);
    assert.match(text(r), /Energy needs motion first\./);
    assert.match(text(r), /“Energy”: Year 2 → First year/);
    assert.match(text(r), /Nothing is lost/);
    click('.apply', r);
    await flush();
    assert.deepEqual(
      d.calls.filter(x => x.startsWith('decide')),
      ['decide r1 p1 true'],
    );
    assert.deepEqual(d.notes, ['The new arrangement of the levels is applied; your progress moved with the material']);
    assert.ok(!document.querySelector('noema-roadmap-restructure'), 'it closes');
  });

  test('an error keeps it open with the error; declining is a decision too', async () => {
    const d = fakeData(roadmap({ proposal: true }));
    d.decideError = 'The cloud is not reachable';
    host(d);
    const r = Object.assign(document.createElement('noema-roadmap-restructure'), { account: 'me', roadmapId: 'r1', proposal: 'p1' });
    document.body.append(r);
    await flush();
    r.show();
    await flush();
    click('.decline', r);
    await flush();
    assert.match(text(r), /The cloud is not reachable/);
    assert.ok(document.querySelector('noema-roadmap-restructure'));
    d.decideError = null;
    click('.decline', r);
    await flush();
    assert.deepEqual(d.notes, ['The arrangement stays as it was']);
  });

  test('a member of a shared Roadmap sees no proposal (its owner decides)', async () => {
    const d = fakeData(roadmap({ proposal: true }));
    const h = host({ ...d, isMember: () => true });
    const bar = Object.assign(document.createElement('noema-roadmap-levels'), { account: 'me', roadmapId: 'r1' });
    h.append(bar);
    await flush();
    await bar.settled;
    await flush();
    assert.doesNotMatch(text(bar), /proposes/);
  });
});

describe('a step’s placement test', () => {
  test('first what it is, then the questions, then mastered', async () => {
    const d = fakeData(roadmap());
    host(d);
    const t = NoemaRoadmapStepTest.open({ account: 'me', roadmapId: 'r1', step: 'b' });
    let tested: unknown = null;
    t.addEventListener('roadmap-step-tested', e => (tested = (e as CustomEvent<unknown>).detail));
    await flush();
    assert.match(text(t), /Energy/);
    assert.match(text(t), /A 10-question test/);
    assert.equal(d.calls.length, 0, 'nothing is asked before the learner goes on');
    click('.start', t);
    await flush();
    assert.deepEqual(d.calls, ['placement b']);
    for (let i = 0; i < 4; i++) {
      const quiz = find('noema-roadmap-quiz', t);
      quiz?.shadowRoot?.querySelector<HTMLButtonElement>('.opt')?.click();
      await flush();
      if (quiz) click('.next', quiz);
      await flush();
    }
    assert.ok(d.calls.includes('pass b 1'));
    assert.match(text(t), /4\/4 — mastered!/);
    assert.deepEqual(tested, { step: 'b', mastered: true });
  });
});
