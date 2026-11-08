/**
 * 📚 From your sources (docs/FROM_SOURCES.md): all the learner's material in one place — files, a folder or a .zip —
 * read once on this device; then a proposal with its reasons, always with both shapes to flip between: one subject (a
 * concise treatise) or a Roadmap (several topics that build on each other). Read by the AI with the learner's key, by
 * their Claude app (copy the task, paste the answer) or estimated without AI. Then the build: a Roadmap (every file on
 * its steps, each step planned from its pages) or one subject (here with a Claude key, or in the Claude app).
 *
 *   <noema-roadmap-from-sources account=…></noema-roadmap-from-sources>   .files = material to start with (the vault)
 *
 * Fires roadmap-made { roadmap, next: map | progress | app } and roadmap-make-course { preset } (✨ Create with Claude
 * with the plan as the brief — another screen's).
 */
import { css, html, nothing, type TemplateResult } from 'lit';
import { base } from '../../../ui/core/styles.ts';
import type { NoemaSelect, NoemaTextField } from '../../../ui/index.ts';
import type { SourceItem, SourceOptions, SourcePlan } from './data.ts';
import { RoadmapElement } from './element.ts';
import { screen } from './styles.ts';

type Reader = 'auto' | 'app' | 'estimate';
type Shape = 'course' | 'roadmap';

/** a file the learner gave, as the inventory knows it (a folder's files keep their path) */
const fileName = (f: File): string => (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;

export class NoemaRoadmapFromSources extends RoadmapElement {
  static override properties = {
    account: { type: String },
    files: { attribute: false },
    reader: { state: true },
    inv: { state: true },
    plan: { state: true },
    shape: { state: true },
    status: { state: true },
    error: { state: true },
    busy: { state: true },
    answerErrors: { state: true },
    building: { state: true },
    drag: { state: true },
  };
  static override styles = [
    base,
    screen,
    css`
      :host {
        display: block;
      }
      .cg-drop {
        display: grid;
        place-items: center;
        gap: 4px;
        min-height: 96px;
        padding: 16px;
        border: 2px dashed var(--u-line);
        border-radius: var(--u-r);
        text-align: center;
        cursor: pointer;
        position: relative;
      }
      .cg-drop.on {
        border-color: var(--u-acc);
        background: var(--u-acc-soft);
      }
      .cg-drop input {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
      }
      ul.cm-srcfiles {
        list-style: none;
        margin: 8px 0;
        padding: 0;
        display: grid;
        gap: 4px;
      }
      ul.cm-srcfiles li {
        display: flex;
        gap: 6px;
        align-items: center;
        overflow-wrap: anywhere;
      }
      .card {
        display: grid;
        gap: 10px;
        padding: 14px;
        border-radius: var(--u-r);
        background: var(--u-paper);
        border: 1px solid var(--u-line);
      }
      .cm-srcstep {
        display: grid;
        gap: 10px;
        margin-top: 12px;
      }
      ol.cm-srcplan {
        margin: 6px 0 0;
        padding-inline-start: 1.4em;
        line-height: 1.5;
        overflow-wrap: anywhere;
      }
      ul.cm-srcwhy {
        margin: 0;
        padding-inline-start: 1.2em;
      }
      summary {
        cursor: pointer;
        min-height: 24px;
        color: var(--u-acc-text);
      }
      a.btn {
        display: inline-flex;
        align-items: center;
        min-height: 32px;
        padding: 0 12px;
        border-radius: 999px;
        border: 1px solid var(--u-line);
        color: var(--u-acc-text);
        text-decoration: none;
      }
      .folder {
        position: relative;
        overflow: hidden;
      }
      .folder input {
        position: absolute;
        inset: 0;
        opacity: 0;
        cursor: pointer;
      }
    `,
  ];
  declare account: string;
  declare files: File[];
  declare reader: Reader;
  declare inv: SourceItem[] | null;
  declare plan: SourcePlan | null;
  declare shape: Shape;
  declare status: string;
  declare error: string;
  declare busy: boolean;
  declare answerErrors: string[] | null;
  declare building: string;
  declare drag: boolean;
  #ctl: AbortController | null = null;

  constructor() {
    super();
    this.account = '';
    this.files = [];
    this.reader = 'auto';
    this.inv = null;
    this.plan = null;
    this.shape = 'roadmap';
    this.status = '';
    this.error = '';
    this.busy = false;
    this.answerErrors = null;
    this.building = '';
    this.drag = false;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    const k = this.data.sources.keys(this.account);
    this.reader = k.claude || k.gemini ? 'auto' : 'app';
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#ctl?.abort();
  }

  #opts(): SourceOptions {
    const goal = this.renderRoot.querySelector<NoemaSelect>('.cm-srcgoal')?.value ?? 'exam';
    return {
      title: (this.renderRoot.querySelector<NoemaTextField>('.cm-srctitle')?.value ?? '').trim(),
      goal: this.t('roadmap.map.src.goal.' + goal),
      language: this.renderRoot.querySelector<NoemaSelect>('.cm-srclang')?.value ?? 'en',
      notes: (this.renderRoot.querySelector<NoemaTextField>('.cm-srcnotes')?.value ?? '').trim(),
    };
  }

  /** Add files (a .zip is opened; the same file twice is kept once). */
  async addFiles(list: readonly File[]): Promise<void> {
    const out = [...this.files];
    for (const f of list) {
      if (/\.zip$/i.test(f.name)) {
        try {
          out.push(...(await this.data.sources.unzip(f)));
        } catch (e) {
          this.data.notify('⚠️ ' + this.i18n.err(e));
        }
      } else if (!out.some(x => x.name === f.name && x.size === f.size && fileName(x) === fileName(f))) out.push(f);
    }
    this.files = out;
    this.inv = null;
    this.plan = null;
  }

  #mb(n: number): string {
    return this.i18n.format.number(Math.max(0.1, n / 1048576), { maximumFractionDigits: 1 }) + ' MB'; // i18n-ignore (unit)
  }

  #setPlan(p: SourcePlan): void {
    this.plan = p;
    this.shape = p.recommend;
    const t = this.renderRoot.querySelector<NoemaTextField>('.cm-srctitle');
    if (t && !t.value.trim()) t.value = p.title;
  }

  async #read(): Promise<void> {
    this.error = '';
    if (!this.files.length) {
      this.error = this.t('roadmap.map.src.needFiles');
      return;
    }
    this.busy = true;
    this.plan = null;
    try {
      this.inv ??= await this.data.sources.inventory(this.files, f => {
        this.status = this.t('roadmap.map.src.reading', { file: f });
      });
      const o = this.#opts();
      if (this.reader === 'estimate') this.#setPlan(this.data.sources.estimate(this.inv, o));
      else if (this.reader === 'auto') {
        this.status = this.t('roadmap.map.src.thinking');
        this.#ctl = new AbortController();
        this.#setPlan(
          await this.data.sources.propose(this.account, this.inv, {
            ...o,
            signal: this.#ctl.signal,
            onLog: m => {
              this.status = m;
            },
          }),
        );
      }
      this.status = '';
    } catch (e) {
      this.status = '';
      this.error = '⚠️ ' + this.i18n.err(e);
    }
    this.#ctl = null;
    this.busy = false;
  }

  #answer(inv: readonly SourceItem[]): void {
    const r = this.data.sources.fromAnswer(this.renderRoot.querySelector<NoemaTextField>('.cm-srcanswer')?.value ?? '', inv);
    if (r.errors) {
      this.answerErrors = r.errors;
      return;
    }
    this.answerErrors = null;
    if (r.plan) this.#setPlan(r.plan);
  }

  #named(p: SourcePlan): SourcePlan {
    return { ...p, title: (this.renderRoot.querySelector<NoemaTextField>('.cm-srctitle')?.value ?? '').trim() || p.title };
  }

  async #makeRoadmap(p: SourcePlan, inv: readonly SourceItem[]): Promise<void> {
    this.error = '';
    const provider = this.renderRoot.querySelector<NoemaSelect>('.cm-provider')?.value ?? 'claudeapp';
    if (!this.data.sources.providerReady(this.account, provider)) {
      this.error = this.t('roadmap.map.new.needKey');
      return;
    }
    this.busy = true;
    try {
      const n = this.#named(p),
        r = await this.data.sources.makeRoadmap(this.account, n, inv, {
          title: n.title,
          language: this.#opts().language,
          provider,
          onLog: m => {
            this.building = m;
          },
        });
      this.emit('roadmap-made', { roadmap: r.id, next: r.next });
    } catch (e) {
      this.error = '⚠️ ' + this.i18n.err(e);
    }
    this.busy = false;
  }

  #appReader(inv: readonly SourceItem[]): TemplateResult {
    const problems = this.answerErrors;
    return html`<div class="cm-srcstep">
      <strong>${this.t('roadmap.map.src.appTitle')}</strong>
      <p class="tiny">${this.t('roadmap.map.src.appTip')}</p>
      <div class="row">
        <a class="btn" href="https://claude.ai/new" target="_blank" rel="noopener">${this.t('roadmap.map.app.openClaude')}</a>
        <noema-button
          size="sm"
          class="cm-srccopytask"
          @click=${(): void =>
            void this.data.copy(this.data.sources.task(inv, this.#opts())).then(ok => {
              if (ok) this.data.notify('📋 ' + this.t('roadmap.map.copied'));
            })}
          >${this.t('roadmap.map.src.copyTask')}</noema-button
        >
      </div>
      <noema-text-field class="cm-srcanswer" multiline label=${this.t('roadmap.map.src.pastePh')}></noema-text-field>
      <div class="row">
        <noema-button
          size="sm"
          class="cm-srcuse"
          @click=${(): void => {
            this.#answer(inv);
          }}
          >${this.t('roadmap.map.man.useAnswer')}</noema-button
        >
        <noema-button
          size="sm"
          variant="quiet"
          class="cm-srcestimate"
          @click=${(): void => {
            this.#setPlan(this.data.sources.estimate(inv, this.#opts()));
          }}
          >${this.t('roadmap.map.src.orEstimate')}</noema-button
        >
      </div>
      ${
        problems
          ? html`<div class="status bad" role="alert">
              ${this.t('roadmap.map.man.problems', { n: problems.length, list: problems.slice(0, 3).join(' · ') + (problems.length > 3 ? ' …' : '') })}
              <noema-button
                size="sm"
                variant="secondary"
                @click=${(): void =>
                  void this.data.copy(
                    `Your answer has these problems:\n- ${problems.slice(0, 30).join('\n- ')}\nFix ALL of them and send the complete corrected JSON object again.`, // i18n-ignore (for Claude)
                  )}
                >${this.t('roadmap.map.man.copyProblems')}</noema-button
              >
            </div>`
          : nothing
      }
    </div>`;
  }

  #result(): TemplateResult {
    const inv = this.inv,
      p = this.plan;
    if (!inv) return html``;
    if (!p) return this.reader === 'app' ? this.#appReader(inv) : html``;
    const n = { course: p.course.chapters.length, roadmap: p.roadmap.steps.length },
      shape = this.shape,
      other: Shape = shape === 'course' ? 'roadmap' : 'course',
      items = shape === 'course' ? p.course.chapters : p.roadmap.steps;
    return html`<div class="cm-srcstep">
        <div class="cm-srcchosen" data-shape=${shape}>
          <strong>${this.t('roadmap.map.src.made.' + shape, { n: n[shape] })}</strong>
          <ul class="cm-srcwhy tiny">
            ${p.reasons.map(r => html`<li>${r}</li>`)}
          </ul>
        </div>
        <noema-button
          size="sm"
          variant="quiet"
          class="cm-srcswitch"
          data-shape=${other}
          @click=${(): void => {
            this.shape = other;
          }}
          >${this.t('roadmap.map.src.switch.' + other)}</noema-button
        >
        <details>
          <summary>${this.t(shape === 'course' ? 'roadmap.map.src.seeChapters' : 'roadmap.map.src.seeSteps', { n: items.length })}</summary>
          <ol class="cm-preview cm-srcplan">
            ${items.map(
              x =>
                html`<li>
                  <strong>${x.title}</strong>${x.summary ? html`<span class="tiny"> — ${x.summary}</span>` : nothing}
                  <div class="tiny cm-srcrefs">${x.files.join(' · ')}</div>
                </li>`,
            )}
          </ol>
        </details>
      </div>
      ${shape === 'course' ? this.#buildCourse(p, inv) : this.#buildRoadmap(p, inv)}`;
  }

  #buildRoadmap(p: SourcePlan, inv: readonly SourceItem[]): TemplateResult {
    const providers = [
      { value: 'claudeapp', label: '💬 ' + this.t('roadmap.map.ai.app') },
      { value: 'auto', label: this.t('roadmap.map.ai.auto') },
      { value: 'claude', label: this.t('roadmap.map.ai.claude') },
      { value: 'gemini', label: this.t('roadmap.map.ai.gemini') },
    ];
    return html`<div class="cm-srcstep">
      <noema-select
        class="cm-provider"
        label=${this.t('roadmap.map.ai.use')}
        .options=${providers}
        .value=${this.data.sources.defaultProvider(this.account)}
      ></noema-select>
      <div class="row">
        <noema-button class="cm-srcgo" ?busy=${this.busy} ?disabled=${this.busy} @click=${(): void => void this.#makeRoadmap(p, inv)}
          >${this.t('roadmap.map.src.makeRoadmap')}</noema-button
        >
      </div>
      <p class="tiny">${this.t('roadmap.map.src.buildRoadmapTip')}</p>
      ${this.building ? html`<p class="tiny" role="status">${this.building}</p>` : nothing}
    </div>`;
  }

  #buildCourse(p: SourcePlan, inv: readonly SourceItem[]): TemplateResult {
    const here = this.data.sources.canMakeHere(this.account),
      o = this.#opts();
    const app = html`<div class="cm-srcapp">
      <p class="tiny">${this.t('roadmap.map.src.appCourse', { files: inv.map(it => it.name).join(', ') })}</p>
      <div class="row">
        <a class="btn" href="https://claude.ai/new" target="_blank" rel="noopener">${this.t('roadmap.map.app.openClaude')}</a>
        <noema-button
          size="sm"
          variant=${here ? 'secondary' : 'primary'}
          class="cm-srccopymsg"
          @click=${(): void =>
            void this.data
              .copy(
                this.data.sources.courseMessage(this.#named(p), inv, {
                  language: this.data.sources.languages()[o.language] ?? o.language,
                  goal: o.goal,
                }),
              )
              .then(ok => {
                if (ok) this.data.notify('📋 ' + this.t('roadmap.map.copied'));
              })}
          >${this.t('roadmap.map.app.copyMsg')}</noema-button
        >
        <noema-button
          size="sm"
          variant="quiet"
          @click=${(): void => {
            this.emit('roadmap-setup-claude');
          }}
          >${this.t('roadmap.map.app.firstTime')}</noema-button
        >
      </div>
    </div>`;
    return html`<div class="cm-srcstep">
      ${
        here
          ? html`<div class="row">
                <noema-button
                  class="cm-srcgo"
                  @click=${(): void => {
                    const n = this.#named(p);
                    this.emit('roadmap-make-course', {
                      preset: {
                        files: this.files,
                        title: n.title,
                        language: o.language,
                        goal: o.goal,
                        notes: o.notes,
                        brief: this.data.sources.courseBrief(n),
                      },
                    });
                  }}
                  >${this.t('roadmap.map.src.makeHere')}</noema-button
                >
              </div>
              <p class="tiny">${this.t('roadmap.map.src.buildCourseTip')}</p>
              <details>
                <summary>${this.t('roadmap.map.src.orApp')}</summary>
                ${app}
              </details>`
          : html`<p class="tiny">${this.t('roadmap.map.src.noKeyCourse')}</p>
              ${app}`
      }
    </div>`;
  }

  override render(): TemplateResult {
    const k = this.data.sources.keys(this.account),
      langs = this.data.sources.languages(),
      nav = (navigator.language || 'en').slice(0, 2);
    const readers = [
      ...(k.claude || k.gemini ? [{ value: 'auto', label: this.t('roadmap.map.src.readKey') }] : []),
      { value: 'app', label: this.t('roadmap.map.src.readApp') },
      { value: 'estimate', label: this.t('roadmap.map.src.readEstimate') },
    ];
    const pick = (e: Event): void => {
      const input = e.target as HTMLInputElement;
      void this.addFiles([...(input.files ?? [])]);
      input.value = '';
    };
    const total = this.files.reduce((a, f) => a + (f.size || 0), 0);
    return html`<div class="card cm-src">
      <p class="tiny">${this.t('roadmap.map.src.lead')}</p>
      <label
        class="cg-drop ${this.drag ? 'on' : ''}"
        @dragover=${(e: DragEvent): void => {
          e.preventDefault();
          this.drag = true;
        }}
        @dragleave=${(): void => {
          this.drag = false;
        }}
        @drop=${(e: DragEvent): void => {
          e.preventDefault();
          this.drag = false;
          void this.addFiles([...(e.dataTransfer?.files ?? [])]);
        }}
      >
        <input type="file" multiple aria-label=${this.t('roadmap.map.src.choose')} @change=${pick} />
        <strong>${this.t('roadmap.map.src.choose')}</strong><span class="tiny">${this.t('roadmap.map.src.drag')}</span>
      </label>
      <div class="row">
        <label class="folder"
          ><noema-button size="sm" variant="quiet" tabindex="-1">${this.t('roadmap.map.src.folder')}</noema-button
          ><input type="file" multiple webkitdirectory aria-label=${this.t('roadmap.map.src.folder')} @change=${pick}
        /></label>
        <span class="tiny"
          >${this.files.length ? this.t('roadmap.map.src.nFiles', { n: this.files.length, size: this.#mb(total) }) : ''}</span
        >
        <noema-tip topic=${this.t('roadmap.map.moreInfo')}>${this.t('roadmap.map.src.materialTip')}</noema-tip>
      </div>
      <ul class="cm-srcfiles">
        ${this.files.map(
          (f, i) =>
            html`<li>
              <span class="grow">${fileName(f)} <span class="tiny">· ${this.#mb(f.size)}</span></span>
              <noema-icon-button
                icon="close"
                size="sm"
                label=${this.t('roadmap.map.src.remove', { name: f.name })}
                @click=${(): void => {
                  this.files = this.files.filter((_, j) => j !== i);
                  this.inv = null;
                  this.plan = null;
                }}
              ></noema-icon-button>
            </li>`,
        )}
      </ul>
      <noema-text-field
        class="cm-srctitle"
        label=${this.t('roadmap.map.src.name')}
        placeholder=${this.t('roadmap.map.src.titlePh')}
      ></noema-text-field>
      <details class="cm-srcmore">
        <summary>${this.t('roadmap.map.new.more')}</summary>
        <noema-select
          class="cm-srclang"
          label=${this.t('roadmap.map.src.lang')}
          .options=${Object.entries(langs).map(([v, name]) => ({ value: v, label: name }))}
          .value=${nav in langs ? nav : 'en'}
        ></noema-select>
        <noema-select
          class="cm-srcgoal"
          label=${this.t('roadmap.map.src.goal')}
          .options=${['exam', 'understanding', 'project'].map(v => ({ value: v, label: this.t('roadmap.map.src.goal.' + v) }))}
          .value=${'exam'}
        ></noema-select>
        <noema-text-field
          class="cm-srcnotes"
          multiline
          label=${this.t('roadmap.map.src.notes')}
          placeholder=${this.t('roadmap.map.src.notesPh')}
        ></noema-text-field>
      </details>
      <div class="row cm-srcact">
        <noema-button class="cm-srcread" ?disabled=${this.busy} @click=${(): void => void this.#read()}
          >${this.t('roadmap.map.src.read')}</noema-button
        >
        <noema-select
          class="cm-srcreader"
          label=${this.t('roadmap.map.src.reader')}
          hint=${this.t('roadmap.map.src.whoTip')}
          .options=${readers}
          .value=${this.reader}
          @noema-change=${(e: Event): void => {
            this.reader = ((e.currentTarget as NoemaSelect).value || 'app') as Reader;
            this.plan = null;
          }}
        ></noema-select>
      </div>
      ${this.status ? html`<p class="tiny" role="status">${this.status}</p>` : nothing}
      ${this.error ? html`<p class="status bad" role="alert">${this.error}</p>` : nothing} ${this.#result()}
    </div>`;
  }
}
