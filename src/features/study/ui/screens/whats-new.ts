/**
 * What's new (#/new): what the new sources bring (chapters, sections enriched, exercises, drills, cards, traps), and
 * ways to study only that. With nothing new, the latest source.
 */
import { sourceStats, srcOf } from '../../domain/course.ts';
import { HOME, type StudyApp } from '../app.ts';
import { html, nothing, show, StudyScreen, tag, type TemplateResult } from '../lit/base.ts';
import { accentOf, setAccent } from '../parts.ts';

/** #/new */
export class StudyWhatsNew extends StudyScreen {
  protected page(): TemplateResult {
    const app = this.app;
    const sources = app.course.sources;
    let ids = app.newSources();
    const none = !ids.length;
    const lastSrc = sources.at(-1);
    if (none && lastSrc) ids = [lastSrc.id];
    const full = app.course.full;
    const st = sourceStats(full, sources);
    const pick = (k: 'sections' | 'enriched' | 'exercises' | 'playbooks' | 'cards' | 'pitfalls'): number =>
      ids.reduce((a, id) => {
        const x = st.get(id);
        if (!x) return a;
        const v = x[k];
        return a + (typeof v === 'number' ? v : v.size);
      }, 0);
    const newChs = full.filter(c => ids.includes(c.src));
    const enriched = [...new Set(ids.flatMap(id => [...(st.get(id)?.enriched ?? [])]))]
      .map(sid => {
        for (const c of full) {
          const s = c.sections.find(x => x.id === sid);
          if (s && !ids.includes(c.src)) return { s, c };
        }
        return null;
      })
      .filter(x => x !== null);
    const exNew = full.flatMap(c => c.exercises.filter(e => ids.includes(srcOf(e, c))));
    const pbNew = full.flatMap(c => c.debug.filter(d => ids.includes(srcOf(d, c))));
    const go = (href: string) => () => {
      app.go(href);
    };
    const STATS = [
      ['chapters', newChs.length],
      ['sections', pick('sections') + pick('enriched')],
      ['exercises', pick('exercises')],
      ['drills', pick('playbooks')],
      ['flashcards', pick('cards')],
      ['traps', pick('pitfalls')],
    ] as const;
    return html`<h1>${none ? app.t('view.latest') : app.t('view.whatsNew')}</h1>
      <p class="muted">
        ${
          ids
            .map(id => {
              const s = app.course.source(id);
              return `${s?.emoji ?? '📗'} ${app.t('engine.new.srcPages', { title: s?.title ?? id, pages: s?.pages ?? '' })}`;
            })
            .join(' · ') + (none ? ` — ${app.t('engine.new.alreadySeen')}` : '')
        }
      </p>
      <div class="statgrid" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr))">
        ${STATS.map(
          ([l, n]) => html`<div class="stat"><b>${app.nf(n)}</b><span class="tiny">${app.t(`engine.new.stat_${l}`, { n })}</span></div>`,
        )}
      </div>
      <div class="row" style="margin:6px 0 24px">
        <button
          class="btn primary"
          type="button"
          @click=${() => {
            app.sourcesUi.setFilter(ids);
          }}
        >
          🔎 ${app.t('engine.new.filterAll')}
        </button>
        <button
          class="btn"
          type="button"
          @click=${() => {
            app.setFilter(ids);
            app.startRound(app.course.exercises, { title: `✨ ${app.t('engine.new.exercisesTitle')}`, count: 15, back: '#/new' });
          }}
        >
          🎯 ${app.t('engine.new.practice', { n: exNew.length })}
        </button>
        ${
          pbNew[0]
            ? html`<button
                class="btn"
                type="button"
                @click=${() => {
                  app.setFilter(ids);
                  app.go(`#/drill/${pbNew[0]?.id ?? ''}`);
                }}
              >
                🔧 ${app.t('engine.new.drills', { n: pbNew.length })}
              </button>`
            : nothing
        }
        <button
          class="btn"
          type="button"
          @click=${() => {
            app.setFilter(ids);
            app.go('#/cards');
          }}
        >
          🃏 ${app.t('engine.new.cards')}
        </button>
        ${
          none
            ? nothing
            : html`<button
                class="btn ghost"
                type="button"
                @click=${() => {
                  app.markSeen(ids);
                  app.toast(app.t('engine.new.markedSeen'));
                  app.go(HOME);
                }}
              >
                ✔ ${app.t('engine.new.markSeen')}
              </button>`
        }
      </div>
      ${
        newChs.length
          ? html`<h2 style="margin-bottom:12px">${app.t('engine.new.chapters')}</h2>
              <div class="chapters">
                ${newChs.map(
                  (c, i) =>
                    html`<button
                      class="chcard"
                      type="button"
                      data-ci=${accentOf(c)}
                      style="animation-delay:${i * 50}ms"
                      @click=${go(`#/ch/${c.id}`)}
                    >
                      <div class="emo">${c.emoji ?? ''}</div>
                      <div class="num">${app.t('engine.new.chapterN', { num: c.num })}</div>
                      <h3>${c.title}</h3>
                      <p>${c.subtitle ?? ''}</p>
                      <div class="tiny">
                        ${app.t('engine.new.chCounts', { s: c.sections.length, e: c.exercises.length, d: c.debug.length })}
                      </div>
                    </button>`,
                )}
              </div>`
          : nothing
      }
      ${
        enriched.length
          ? html`<h2 style="margin:28px 0 6px">${app.t('engine.new.enriched')}</h2>
              <p class="muted" style="margin-top:0">${app.t('engine.new.enrichedNote')}</p>
              <div class="path">
                ${enriched.map(
                  ({ s, c }, i) =>
                    html`<button
                      class="node"
                      type="button"
                      data-ci=${accentOf(c)}
                      style="animation-delay:${i * 25}ms"
                      @click=${go(`#/s/${s.id}`)}
                    >
                      <div class="dot">${c.emoji ?? ''}</div>
                      <div class="grow"><b>${s.title}</b><small>${app.chTitle(c.num, c.title)}</small></div>
                      <span class="newpill"
                        >${app.t('engine.new.added', {
                          blocks: s.blocks.filter(b => b.src && ids.includes(b.src)).length,
                          ex: c.exercises.filter(e => e.section === s.id && e.src && ids.includes(e.src)).length,
                        })}</span
                      >
                    </button>`,
                )}
              </div>`
          : nothing
      }`;
  }
}
tag('study-whats-new', StudyWhatsNew);

export function whatsNewView(app: StudyApp): void {
  setAccent(document.body, null);
  app.host.frame.chrome({ sub: true, crumbs: [[app.t('view.whatsNew')]], back: HOME });
  show(app, new StudyWhatsNew(app));
}
