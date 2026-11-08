/**
 * The pack's knowledge map ("Info"): chapter.map is written before the chapter (CONTENT_SPEC.md, noema.map/v1): points
 * {id, text, level, cats, taughtIn} and learnables {id, kp, goal}; an exercise points to a learnable with `lr`. Here: the
 * map's overlay, the Mistakes gym by trap, and the exercises the learner reported (⚑).
 */
import type { Chapter, Exercise, KnowledgePoint } from '../domain/pack.ts';
import type { StudyApp } from './app.ts';
import { h } from './dom.ts';
import { fmt } from './text.ts';

export const KMAP_CATS = [
  'pitfall',
  'confusable',
  'falsefriend',
  'detail',
  'sequence',
  'multipart',
  'nomenclature',
  'acronym',
  'formula',
  'edge',
  'recent',
  'hard-understand',
  'hard-remember',
] as const;
const LEVELS = ['foundation', 'core', 'advanced'] as const;

/** the categories of the knowledge points an exercise's learnable covers (pitfall, confusable…) */
function exCats(app: StudyApp, ex: Exercise): string[] {
  const m = app.course.chapterOf(ex)?.map;
  if (!m || !ex.lr) return [];
  const L = (m.learnables ?? []).find(l => l.id === ex.lr);
  if (!L) return [];
  const P = new Map((m.points ?? []).map(p => [p.id, p]));
  return [...new Set((L.kp ?? []).flatMap(k => P.get(k)?.cats ?? []))];
}
const lrExercises = (c: Chapter, lr: string): Exercise[] => c.exercises.filter(e => e.lr === lr);

/** The overlay: every chapter's map; the chapter `focus` opens unfolded. A learnable starts a round of its exercises. */
export function knowledgeMap(app: StudyApp, focus?: string): void {
  app.host.frame.modal((box, close) => {
    box.classList.add('kmapbox');
    const chs = app.course.chapters.filter(c => c.map?.learnables?.length);
    box.append(h('h3', {}, app.t('engine.kmap.title')), h('p', { class: 'tiny' }, app.t('engine.kmap.intro')));
    for (const c of chs) {
      const m = c.map ?? {},
        learnables = m.learnables ?? [],
        P = new Map((m.points ?? []).map(p => [p.id, p]));
      const mastery = (lr: string): { n: number; ok: number } => {
        const ex = lrExercises(c, lr);
        return { n: ex.length, ok: ex.filter(e => app.solved(e.id)).length };
      };
      const done = learnables.map(l => mastery(l.id)).filter(x => x.n && x.ok === x.n).length;
      const det = h(
        'details',
        { class: 'kmapch', open: c.id === focus || chs.length === 1 },
        h(
          'summary',
          {},
          h('span', {}, `${c.emoji ?? '📘'} ${c.title}`),
          h(
            'span',
            { class: 'tiny' },
            app.t('engine.kmap.chSummary', { points: (m.points ?? []).length, learnables: learnables.length, done }),
          ),
        ),
      );
      // a learnable sits at the level of its most basic point (core if none)
      const lowest = (kp: readonly string[] | undefined): number =>
        Math.min(...(kp ?? []).map(k => LEVELS.indexOf((P.get(k)?.level ?? '') as (typeof LEVELS)[number])).filter(i => i >= 0), 1);
      LEVELS.forEach((lv, li) => {
        const ls = learnables.filter(l => lowest(l.kp) === li);
        if (!ls.length) return;
        det.append(h('div', { class: 'lbl kmaplv' }, app.t(`engine.kmap.level_${lv}`)));
        for (const l of ls) {
          const ms = mastery(l.id),
            pts = (l.kp ?? []).map(k => P.get(k)).filter((p): p is KnowledgePoint => !!p);
          const cats = [...new Set(pts.flatMap(p => p.cats ?? []))];
          det.append(
            h(
              'div',
              { class: 'kmaplr' },
              h(
                'div',
                { class: 'row' },
                h('b', { class: 'grow', html: fmt(l.goal ?? pts[0]?.text ?? l.id) }),
                ms.n
                  ? h(
                      'button',
                      {
                        class: 'btn small',
                        type: 'button',
                        title: app.t('engine.kmap.practise'),
                        onclick: () => {
                          close();
                          app.startRound(lrExercises(c, l.id), { title: `🧭 ${l.goal ?? l.id}`, count: ms.n, back: location.hash });
                        },
                      },
                      `${app.nf(ms.ok)}/${app.nf(ms.n)} ▶`,
                    )
                  : null,
              ),
              cats.length
                ? h(
                    'div',
                    { class: 'kmapcats' },
                    cats.map(k => h('span', { class: 'pill' }, app.t(`engine.cat.${k}`))),
                  )
                : null,
              h(
                'ul',
                {},
                pts.map(p => h('li', { html: fmt(p.text) })),
              ),
            ),
          );
        }
      });
      const earlier = (m.points ?? []).filter(p => p.taughtIn);
      if (earlier.length)
        det.append(
          h('div', { class: 'lbl kmaplv' }, app.t('engine.kmap.earlier')),
          h(
            'ul',
            { class: 'tiny' },
            earlier.map(p => h('li', {}, h('span', { html: fmt(p.text) }), ' — ', h('i', {}, String(p.taughtIn ?? '')))),
          ),
        );
      box.append(det);
    }
    box.append(
      h(
        'div',
        { class: 'row', style: { justifyContent: 'flex-end', marginTop: '14px' } },
        h('button', { class: 'btn', type: 'button', onclick: close }, app.t('engine.kmap.close')),
      ),
    );
  });
}

/** the Mistakes gym by trap: the open mistakes grouped by the categories of their knowledge points */
export function mistakesByCat(app: StudyApp, list: readonly Exercise[]): HTMLElement | null {
  const by = new Map<string, Exercise[]>();
  for (const e of list)
    for (const k of exCats(app, e)) {
      const a = by.get(k) ?? [];
      a.push(e);
      by.set(k, a);
    }
  const cats = KMAP_CATS.filter(k => by.has(k));
  if (!cats.length) return null;
  return h(
    'div',
    { class: 'gymcats' },
    h('div', { class: 'lbl' }, app.t('engine.gym.byTrap')),
    h(
      'div',
      { class: 'fchips' },
      cats.map(k => {
        const xs = by.get(k) ?? [];
        return h(
          'button',
          {
            class: 'fchip',
            type: 'button',
            onclick: () => {
              app.startRound(xs, { title: `🔁 ${app.t(`engine.cat.${k}`)}`, count: xs.length, back: '#/mistakes' });
            },
          },
          `${app.t(`engine.cat.${k}`)} · ${app.nf(xs.length)}`,
        );
      }),
    ),
  );
}

/** ⚑ the exercises the learner reported (state.flags): listed, and copied as JSON for Claude to revise them (their ids kept) */
export function reportedView(app: StudyApp): void {
  const flags = app.state.flags ?? {};
  const ids = Object.keys(flags).filter(id => app.course.exercise(id));
  app.host.frame.modal((box, close) => {
    box.append(
      h('h3', {}, `⚑ ${app.t('engine.flags.title', { n: ids.length })}`),
      h('p', { class: 'tiny' }, app.t('engine.flags.intro')),
      h(
        'ul',
        { class: 'flaglist' },
        ids.map(id => {
          const f = flags[id],
            e = app.course.exercise(id);
          return h(
            'li',
            {},
            h('b', {}, app.t(`engine.ex.report_${f?.why ?? 'other'}`)),
            ' · ',
            h('span', { html: fmt((e?.q ?? '').slice(0, 120)) }),
            f?.note ? h('div', { class: 'tiny' }, `“${f.note}”`) : null,
            h(
              'button',
              {
                class: 'btn ghost small',
                type: 'button',
                onclick: () => {
                  Reflect.deleteProperty(flags, id);
                  app.host.save();
                  close();
                  if (Object.keys(flags).length) reportedView(app);
                },
              },
              app.t('engine.flags.clear'),
            ),
          );
        }),
      ),
      h(
        'div',
        { class: 'row', style: { justifyContent: 'flex-end', marginTop: '14px' } },
        h('button', { class: 'btn', type: 'button', onclick: close }, app.t('engine.kmap.close')),
        h(
          'button',
          {
            class: 'btn primary',
            type: 'button',
            onclick: async () => {
              const s = app.host.subject;
              // a request for Claude (English, like the prompts)
              const own = (x: object): object => Object.fromEntries(Object.entries(x).filter(([k]) => !k.startsWith('_')));
              const txt =
                `Revise these exercises of the noema-lite subject "${s.title}" (id ${s.id}) with a patch {"reviseExercises":[…]} that keeps every id (tools/CONTENT_SPEC.md "Additive updates"). The learner's reports:\n` +
                JSON.stringify(
                  ids.map(id => ({ report: flags[id], exercise: own(app.course.exercise(id) ?? {}) })),
                  null,
                  1,
                );
              try {
                await navigator.clipboard.writeText(txt);
                app.toast(`📋 ${app.t('engine.flags.copied')}`);
              } catch (e) {
                app.toast(`⚠️ ${app.errText(e)}`, 4000);
              }
            },
          },
          `📋 ${app.t('engine.flags.copy')}`,
        ),
      ),
    );
  });
}
