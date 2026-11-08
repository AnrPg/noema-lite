/**
 * The pack's knowledge map ("Info"): chapter.map is written before the chapter (CONTENT_SPEC.md, noema.map/v1): points
 * {id, text, level, cats, taughtIn} and learnables {id, kp, goal}; an exercise points to a learnable with `lr`. Here: the
 * map's overlay, the Mistakes gym by trap, and the exercises the learner reported (⚑). The map and the reported
 * exercises are light-DOM elements on the study base (lit/base.ts) in the frame's dialog.
 */
import type { Chapter, Exercise, KnowledgePoint } from '../domain/pack.ts';
import type { StudyApp } from './app.ts';
import { h } from './dom.ts';
import { F, html, nothing, StudyElement, tag, type TemplateResult } from './lit/base.ts';

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
    box.append(new StudyKnowledgeMap(app, close, focus).redraw());
  });
}

class StudyKnowledgeMap extends StudyElement {
  readonly #app: StudyApp;
  readonly #close: () => void;
  readonly #focus: string | undefined;
  constructor(app: StudyApp, close: () => void, focus?: string) {
    super();
    this.#app = app;
    this.#close = close;
    this.#focus = focus;
  }

  override render(): TemplateResult {
    const app = this.#app;
    const chs = app.course.chapters.filter(c => c.map?.learnables?.length);
    return html`<h3>${app.t('engine.kmap.title')}</h3>
      <p class="tiny">${app.t('engine.kmap.intro')}</p>
      ${chs.map(c => this.#chapter(c, c.id === this.#focus || chs.length === 1))}
      <div class="row kmapfoot">
        <button
          class="btn"
          type="button"
          @click=${() => {
            this.#close();
          }}
        >
          ${app.t('engine.kmap.close')}
        </button>
      </div>`;
  }

  #chapter(c: Chapter, open: boolean): TemplateResult {
    const app = this.#app;
    const m = c.map ?? {},
      learnables = m.learnables ?? [],
      P = new Map((m.points ?? []).map(p => [p.id, p]));
    const mastery = (lr: string): { n: number; ok: number } => {
      const ex = lrExercises(c, lr);
      return { n: ex.length, ok: ex.filter(e => app.solved(e.id)).length };
    };
    const done = learnables.map(l => mastery(l.id)).filter(x => x.n && x.ok === x.n).length;
    // a learnable sits at the level of its most basic point (core if none)
    const lowest = (kp: readonly string[] | undefined): number =>
      Math.min(...(kp ?? []).map(k => LEVELS.indexOf((P.get(k)?.level ?? '') as (typeof LEVELS)[number])).filter(i => i >= 0), 1);
    const earlier = (m.points ?? []).filter(p => p.taughtIn);
    return html`<details class="kmapch" ?open=${open}>
      <summary>
        <span>${`${c.emoji ?? '📘'} ${c.title}`}</span>
        <span class="tiny"
          >${app.t('engine.kmap.chSummary', { points: (m.points ?? []).length, learnables: learnables.length, done })}</span
        >
      </summary>
      ${LEVELS.map((lv, li) => {
        const ls = learnables.filter(l => lowest(l.kp) === li);
        if (!ls.length) return nothing;
        return html`<div class="lbl kmaplv">${app.t(`engine.kmap.level_${lv}`)}</div>
          ${ls.map(l => {
            const ms = mastery(l.id),
              pts = (l.kp ?? []).map(k => P.get(k)).filter((p): p is KnowledgePoint => !!p);
            const cats = [...new Set(pts.flatMap(p => p.cats ?? []))];
            return html`<div class="kmaplr">
              <div class="row">
                <b class="grow">${F(l.goal ?? pts[0]?.text ?? l.id)}</b>
                ${
                  ms.n
                    ? html`<button
                        class="btn small"
                        type="button"
                        title=${app.t('engine.kmap.practise')}
                        @click=${() => {
                          this.#close();
                          app.startRound(lrExercises(c, l.id), { title: `🧭 ${l.goal ?? l.id}`, count: ms.n, back: location.hash });
                        }}
                      >
                        ${app.nf(ms.ok)}/${app.nf(ms.n)} ▶
                      </button>`
                    : nothing
                }
              </div>
              ${
                cats.length
                  ? html`<div class="kmapcats">${cats.map(k => html`<span class="pill">${app.t(`engine.cat.${k}`)}</span>`)}</div>`
                  : nothing
              }
              <ul>
                ${pts.map(p => html`<li>${F(p.text)}</li>`)}
              </ul>
            </div>`;
          })}`;
      })}
      ${
        earlier.length
          ? html`<div class="lbl kmaplv">${app.t('engine.kmap.earlier')}</div>
              <ul class="tiny">
                ${earlier.map(p => html`<li><span>${F(p.text)}</span> — <i>${String(p.taughtIn ?? '')}</i></li>`)}
              </ul>`
          : nothing
      }
    </details>`;
  }
}
tag('study-knowledge-map', StudyKnowledgeMap);

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
  app.host.frame.modal((box, close) => {
    box.append(new StudyReported(app, close).redraw());
  });
}

class StudyReported extends StudyElement {
  readonly #app: StudyApp;
  readonly #close: () => void;
  constructor(app: StudyApp, close: () => void) {
    super();
    this.#app = app;
    this.#close = close;
  }

  #ids(): string[] {
    const app = this.#app;
    return Object.keys(app.state.flags ?? {}).filter(id => app.course.exercise(id));
  }

  /** a request for Claude (English, like the prompts) on the clipboard */
  async #copy(): Promise<void> {
    const app = this.#app,
      s = app.host.subject,
      flags = app.state.flags ?? {};
    const own = (x: object): object => Object.fromEntries(Object.entries(x).filter(([k]) => !k.startsWith('_')));
    const txt =
      `Revise these exercises of the noema-lite subject "${s.title}" (id ${s.id}) with a patch {"reviseExercises":[…]} that keeps every id (tools/CONTENT_SPEC.md "Additive updates"). The learner's reports:\n` +
      JSON.stringify(
        this.#ids().map(id => ({ report: flags[id], exercise: own(app.course.exercise(id) ?? {}) })),
        null,
        1,
      );
    try {
      await navigator.clipboard.writeText(txt);
      app.toast(`📋 ${app.t('engine.flags.copied')}`);
    } catch (e) {
      app.toast(`⚠️ ${app.errText(e)}`, 4000);
    }
  }

  override render(): TemplateResult {
    const app = this.#app,
      flags = app.state.flags ?? {},
      ids = this.#ids();
    return html`<h3>⚑ ${app.t('engine.flags.title', { n: ids.length })}</h3>
      <p class="tiny">${app.t('engine.flags.intro')}</p>
      <ul class="flaglist">
        ${ids.map(id => {
          const f = flags[id],
            e = app.course.exercise(id);
          return html`<li>
            <b>${app.t(`engine.ex.report_${f?.why ?? 'other'}`)}</b> · <span>${F((e?.q ?? '').slice(0, 120))}</span>
            ${f?.note ? html`<div class="tiny">“${f.note}”</div>` : nothing}
            <button
              class="btn ghost small"
              type="button"
              @click=${() => {
                app.host.learn('exercise.unflagged', id);
                // the list follows; the last one cleared closes it
                if (this.#ids().length) this.redraw();
                else this.#close();
              }}
            >
              ${app.t('engine.flags.clear')}
            </button>
          </li>`;
        })}
      </ul>
      <div class="row kmapfoot">
        <button
          class="btn"
          type="button"
          @click=${() => {
            this.#close();
          }}
        >
          ${app.t('engine.kmap.close')}
        </button>
        <button class="btn primary" type="button" @click=${() => this.#copy()}>📋 ${app.t('engine.flags.copy')}</button>
      </div>`;
  }
}
tag('study-reported', StudyReported);
