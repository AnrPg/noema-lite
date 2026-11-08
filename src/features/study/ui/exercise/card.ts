/**
 * The exercise card: its head (type, difficulty, tags, new, made by the AI, the quiet "Ask <character>" and ⚑), the
 * question, the type's answer area (a widget), "How sure?", Check, and the explanation once answered, with the source it
 * comes from and the tutor's two ways to help after a wrong answer. Keys 1–6 pick an option, Enter checks.
 */
import { exerciseAsText } from '../../domain/as-text.ts';
import type { AnswerRecord, Exercise } from '../../domain/pack.ts';
import type { StudyApp } from '../app.ts';
import { h, replay } from '../dom.ts';
import { askButton, codeEl, setAccent } from '../parts.ts';
import { fmt, guessLang } from '../text.ts';
import * as basic from './basic.ts';
import * as thinking from './thinking.ts';
import { VISUAL_TYPES } from './visual.ts';
import type { Renderer, Widget, WidgetApi } from './widget.ts';

const TYPE_ICON: Readonly<Record<string, string>> = {
  mcq: '🎯',
  tf: '⚖️',
  odd: '🕵️',
  order: '🔢',
  match: '🔗',
  bucket: '🗂️',
  cloze: '✍️',
  spotbug: '🐞',
  calc: '🧮',
  scenario: '🚨',
  free: '🗣️',
  write: '⌨️',
  flaw: '🔎',
  case: '📂',
  predict: '🔮',
  tree: '🌳',
  inquiry: '❓',
  debate: '🗣',
  img_hotspot: '📍',
  img_sequence: '🧭',
  img_reveal: '🧩',
  img_drag: '🏷️',
  img_label: '✏️',
  img_select: '🔽',
  img_occlusion: '🙈',
};
const TAG_ICON: Readonly<Record<string, string>> = { pitfall: '⚠️', debug: '🔧', exam: '🎓', interview: '🎤', calc: '🧮', compare: '⚖️' };
const KNOWN_TAGS = new Set(['concept', 'syntax', 'pitfall', 'debug', 'exam', 'interview', 'calc', 'compare']);

/** an exercise type's label: its emoji and its words (engine.exType.<type>) */
export function typeLabel(app: StudyApp, type: string): string {
  const key = `engine.exType.${type}`;
  if (!app.i18n.has(key)) return type;
  const icon = TYPE_ICON[type];
  return icon ? `${icon} ${app.t(key)}` : app.t(key);
}
export function tagLabel(app: StudyApp, tag: string): string {
  if (!KNOWN_TAGS.has(tag)) return tag;
  const icon = TAG_ICON[tag];
  return (icon ? `${icon} ` : '') + app.t(`engine.exTag.${tag}`);
}

const RENDERERS: Readonly<Record<string, Renderer>> = {
  mcq: basic.mcq,
  tf: basic.tf,
  odd: basic.odd,
  order: basic.order,
  match: basic.match,
  bucket: basic.bucket,
  cloze: basic.cloze,
  spotbug: basic.spotbug,
  calc: basic.calc,
  scenario: basic.scenario,
  free: basic.free,
  write: basic.write,
  flaw: thinking.flaw,
  case: thinking.caseType,
  predict: thinking.predict,
  tree: thinking.tree,
  inquiry: thinking.inquiry,
  debate: thinking.debate,
  ...VISUAL_TYPES,
};

/** the type's answer area (an activity's type is the activities' own) */
export function widgetOf(app: StudyApp, ex: Exercise, api: WidgetApi): Widget {
  const r = RENDERERS[ex.type];
  if (r) return r({ app, ex, api, media: app.host.media });
  return app.host.activities.exercise(ex, api) ?? basic.newer({ app, ex, api, media: app.host.media });
}

export interface CardOptions {
  readonly onDone?: (ok: boolean, card: HTMLElement) => void;
  readonly noXP?: boolean;
  readonly showSection?: boolean;
}

/** what the learner entered, as text for the tutor ('' when unknown) */
const givenOf = (w: Widget): string => {
  try {
    return (w.given?.() ?? '').slice(0, 3000);
  } catch {
    return '';
  }
};
const pickOne = <T>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)] as T;
const OK_WORDS = [
  ['✅', 'nailed'],
  ['✅', 'correct'],
  ['🎉', 'yes'],
  ['✅', 'spotOn'],
  ['🔥', 'exactly'],
] as const;
const BAD_WORDS = [
  ['💡', 'notQuite'],
  ['🧠', 'learning'],
  ['💡', 'close'],
] as const;

/** the card element; its widget and check stay reachable for the round (data-ex, data-ch, data-nf: where a ⚑ points) */
export interface CardElement extends HTMLDivElement {
  _check?: () => void;
  _locked?: () => boolean;
  _w?: Widget;
}

export function exerciseCard(app: StudyApp, ex: Exercise, o: CardOptions = {}): CardElement {
  const ch = app.course.chapterOf(ex);
  const sec = app.course.section(ex.section);
  const card: CardElement = h('div', { class: 'ex has-ask', 'data-ex': ex.id, 'data-ch': ch?.id ?? null });
  setAccent(card, ch);
  let locked = false;
  const api: WidgetApi = {
    locked: () => locked,
    check: () => {
      doCheck();
    },
    done: ok => {
      finish(ok, true);
    },
  };
  const isNew = !!ex.src && !!ch && ex.src !== (ch as { src?: string }).src && app.isNewSource(ex.src);
  const showSec = !!o.showSection && !!sec && !!ch;
  const head = h(
    'div',
    { class: 'exhead' },
    h('span', { class: 'pill c' }, typeLabel(app, ex.type)),
    h(
      'span',
      { class: 'diff', title: app.t('engine.ex.difficulty', { n: ex.difficulty }) },
      [1, 2, 3].map(i => h('i', { class: i <= ex.difficulty ? 'on' : '' })),
    ),
    ex.tags.filter(t => t !== 'concept').map(t => h('span', { class: 'pill' }, tagLabel(app, t))),
    isNew ? h('span', { class: 'newpill' }, `✨ ${app.t('engine.src.new')}`) : null,
    ex._ai
      ? h(
          'span',
          { class: 'pill', style: { background: 'var(--violet-bg)', color: 'var(--violet-ink)' } },
          `✨ ${app.t('engine.ex.aiMade')}`,
        )
      : null,
    showSec ? h('span', { class: 'tiny', style: { marginLeft: 'auto' } }, app.chTitle(ch.num, sec.title)) : null,
  );
  const q = h('div', { class: 'q', 'data-nf': 'q', html: fmt(ex.q ?? '') });
  card.append(head, q);
  if (ex.code)
    card.append(
      h(
        'div',
        { 'data-nf': 'code', style: { margin: '0 0 12px' } },
        codeEl(ex.code, ex.lang ?? guessLang(ex.code), app.t('engine.core.copy')),
      ),
    );
  const w = widgetOf(app, ex, api);
  card.append(w.el);
  const actions = h('div', { class: 'actions' });
  const checkBtn = h(
    'button',
    {
      class: 'btn primary',
      type: 'button',
      onclick: () => {
        doCheck();
      },
    },
    app.t('engine.ex.check'),
  );
  const nudge = h('span', { class: 'tiny' });
  const oneTap =
    ['tf', 'odd', 'inquiry', 'debate'].includes(ex.type) ||
    (['mcq', 'predict'].includes(ex.type) && Array.isArray(ex.options) && !ex.multi && !Array.isArray(ex.answer));
  if (!w.selfDone && !w.auto && !oneTap) actions.append(checkBtn, nudge);
  // "How sure?" before answering (optional): a confident mistake goes first in the Mistakes gym
  const conf = ex._ai ? null : confidenceRow(app, () => locked);
  if (conf) card.insertBefore(conf.el, w.el);
  const tutorAsk = (mode: 'hint' | 'socratic' | 'explain' | null): void => {
    app.tutor.askAbout(ex, mode, givenOf(w));
  };
  const who = app.host.frame.character();
  const ask = askButton(who.face, who.avatar, app.L('askTutor'), () => {
    tutorAsk(null);
  });
  ask.style.marginLeft = showSec ? '8px' : 'auto';
  head.append(ask);
  if (!ex._ai) head.append(reportButton(app, ex));
  card.append(actions);

  function doCheck(): void {
    if (locked || w.selfDone || !w.check) return;
    const r = w.check();
    if (r === null) {
      nudge.textContent = app.t('engine.ex.finishFirst');
      replay(card, 'shake');
      return;
    }
    finish(r, false);
  }
  function finish(ok: boolean, selfReported: boolean): void {
    if (locked) return;
    locked = true;
    if (!selfReported) w.reveal?.();
    checkBtn.remove();
    nudge.remove();
    app.host.feedback.beep(ok ? 'ok' : 'bad');
    if (ok) card.classList.add('pop');
    else replay(card, 'shake');
    const sure = conf?.value() ?? null;
    conf?.lock();
    if (!ex._ai) app.record(ex, ok, sure);
    if (!o.noXP) app.xp(ok ? 4 + ex.difficulty * 4 + (w.bonus?.() ?? 0) : 1, card);
    const [icon, word] = ok ? pickOne(OK_WORDS) : pickOne(BAD_WORDS);
    const exp = h(
      'div',
      { class: `explain ${ok ? 'ok' : 'bad'}` },
      h('div', { class: 'hd' }, `${icon} ${app.t(`engine.ex.${ok ? 'ok' : 'bad'}.${word}`)}`),
      h('div', { 'data-nf': 'explain', html: fmt(ex.explain ?? '') }),
    );
    if (sure === 'sure' && !ok) exp.append(h('div', { class: 'tiny confnote' }, `⚠️ ${app.t('engine.ex.confWrong')}`));
    else if (sure === 'guess' && ok) exp.append(h('div', { class: 'tiny confnote' }, `🎲 ${app.t('engine.ex.confLucky')}`));
    const cite = citeChip(app, ex);
    if (cite) exp.append(cite);
    if (!ok)
      exp.append(
        h(
          'div',
          { class: 'row', style: { marginTop: '10px' } },
          h(
            'button',
            {
              class: 'btn small ai',
              type: 'button',
              onclick: () => {
                tutorAsk('socratic');
              },
            },
            `${who.avatar} ${app.t('engine.ex.helpSocratic')}`,
          ),
          h(
            'button',
            {
              class: 'btn small',
              type: 'button',
              onclick: () => {
                tutorAsk('explain');
              },
            },
            `💡 ${app.t('engine.ex.explainDiff')}`,
          ),
        ),
      );
    card.append(exp);
    app.host.feedback.answered(ok, { hard: ex.difficulty >= 3 }); // the character reacts (rarely big)
    o.onDone?.(ok, card);
  }
  card._w = w;
  card._check = doCheck;
  card._locked = () => locked;
  // the answer gets the focus only when the card is in sight: a lesson with exercises at its end opens at its top
  setTimeout(() => {
    if (!card.isConnected) return;
    const r = card.getBoundingClientRect();
    if (r.top >= 0 && r.bottom <= innerHeight) w.focus?.();
  }, 50);
  return card;
}

/** the exercise as context for the AI (with its section's notes) */
export function exerciseText(app: StudyApp, ex: Exercise): string {
  return exerciseAsText(ex, app.host.media, app.course.section(ex.section), b => app.host.activities.asText(b));
}

/** "How sure?": three quiet chips above the answer; optional, kept with the answer (state.res[id].conf) */
function confidenceRow(app: StudyApp, isLocked: () => boolean): { el: HTMLElement; value(): AnswerRecord['conf'] | null; lock(): void } {
  type Conf = NonNullable<AnswerRecord['conf']>;
  let v: Conf | null = null;
  const LEVELS: readonly (readonly [Conf, string])[] = [
    ['sure', '●●●'],
    ['think', '●●○'],
    ['guess', '●○○'],
  ];
  const chips = LEVELS.map(([k, dots]) =>
    h(
      'button',
      {
        class: 'confchip',
        type: 'button',
        'aria-pressed': 'false',
        'data-k': k,
        title: app.t(`engine.ex.conf_${k}`),
        onclick: () => {
          if (isLocked()) return;
          v = v === k ? null : k;
          for (const c of chips) c.setAttribute('aria-pressed', String(c.dataset['k'] === v));
        },
      },
      h('span', { 'aria-hidden': 'true' }, dots),
      h('span', { class: 'lbl' }, app.t(`engine.ex.conf_${k}`)),
    ),
  );
  const el = h(
    'div',
    { class: 'confrow', role: 'group', 'aria-label': app.t('engine.ex.conf') },
    h('span', { class: 'tiny' }, app.t('engine.ex.conf')),
    chips,
  );
  return {
    el,
    value: () => v,
    lock: () => {
      el.classList.add('locked');
    },
  };
}

const REPORT_REASONS = ['wrong', 'unclear', 'source', 'trivial', 'typo', 'other'] as const;
/** ⚑ a problem with this exercise: kept in the subject's state (state.flags[id]) for the next revision of the pack */
function reportButton(app: StudyApp, ex: Exercise): HTMLButtonElement {
  const done = (): boolean => !!app.state.flags?.[ex.id];
  const b = h(
    'button',
    {
      class: `exflag${done() ? ' on' : ''}`,
      type: 'button',
      title: done() ? app.t('engine.ex.reported') : app.t('engine.ex.report'),
      'aria-label': app.t('engine.ex.report'),
      onclick: (e: Event) => {
        e.stopPropagation();
        app.host.frame.modal((box, close) => {
          let why: string | null = app.state.flags?.[ex.id]?.why ?? null;
          const opts = REPORT_REASONS.map(r => {
            const opt = h(
              'button',
              {
                class: `opt${r === why ? ' sel' : ''}`,
                type: 'button',
                onclick: () => {
                  why = r;
                  for (const x of opts) x.classList.toggle('sel', x === opt);
                },
              },
              h('span', {}, app.t(`engine.ex.report_${r}`)),
            );
            return opt;
          });
          const optsBox = h('div', { class: 'opts' }, opts);
          const note = h('textarea', {
            class: 'answer',
            rows: 3,
            placeholder: app.t('engine.ex.reportNote'),
            'aria-label': app.t('engine.ex.reportNote'),
          });
          note.value = app.state.flags?.[ex.id]?.note ?? '';
          box.append(
            h('h3', {}, `⚑ ${app.t('engine.ex.reportTitle')}`),
            optsBox,
            note,
            h(
              'div',
              { class: 'row', style: { marginTop: '14px', justifyContent: 'flex-end' } },
              h('button', { class: 'btn', type: 'button', onclick: close }, app.t('engine.core.cancel')),
              h(
                'button',
                {
                  class: 'btn primary',
                  type: 'button',
                  onclick: () => {
                    if (!why) {
                      replay(optsBox, 'shake');
                      return;
                    }
                    const nt = note.value.trim().slice(0, 2000);
                    app.host.learn('exercise.flagged', ex.id, { why, ...(nt ? { note: nt } : {}) });
                    b.classList.add('on');
                    b.title = app.t('engine.ex.reported');
                    close();
                    app.toast(`⚑ ${app.t('engine.ex.reportSaved')}`);
                  },
                },
                app.t('engine.ex.reportSend'),
              ),
            ),
          );
        });
      },
    },
    '⚑',
  );
  return b;
}

const PAGE_RE = /^\s*(?:p\.?|pp\.?|page|σ\.|стр\.?)\s*(\d+)/i;
/** where the exercise comes from (cite: lineage, never in the text): a small chip after the answer that opens the source at that page */
function citeChip(app: StudyApp, ex: Exercise): HTMLElement | null {
  const c = ex.cite;
  const s = c?.src ? app.course.source(c.src) : undefined;
  if (!c?.src || !s) return null;
  const src = c.src;
  const page = Number(PAGE_RE.exec(c.loc ?? '')?.[1] ?? 0) || null;
  const label = (s.short ?? s.title) + (c.loc ? ` · ${c.loc}` : '');
  return h(
    'div',
    { class: 'srcrefs excite' },
    h(
      'button',
      {
        class: 'srcref',
        type: 'button',
        title: app.t('engine.ex.citeOpen'),
        onclick: () => {
          app.viewer.open(src, { page });
        },
      },
      h('span', { class: 'e' }, s.emoji ?? '📘'),
      h('span', {}, label),
    ),
  );
}
