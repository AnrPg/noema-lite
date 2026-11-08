/**
 * 🗺 A Roadmap's map: its steps and the links between them, drawn three ways — the classic map (left → right: the three
 * parts, prerequisites · the goal · applications), the treasure map (from the start at the bottom up to the treasure) and
 * a list in study order. A Roadmap with a ladder is drawn in level bands (layout.ts). Above the map: the levels
 * (noema-roadmap-levels), what waits for the learner's subjects, for their Claude app, and the shared map's state; beside
 * it: the selected step (noema-roadmap-step). Live: every change of the data port redraws it (at most twice a second).
 *
 *   <noema-roadmap-map account=… roadmap-id=… view="map|treasure|list" focus-step=…></noema-roadmap-map>
 *
 * The step's requests bubble out of it (see step.ts); the map's own: roadmap-attach-many · roadmap-plan-now ·
 * roadmap-review-changes · roadmap-share { roadmap } · roadmap-show-app { step }. The selected step: `selected`.
 */
import { css, html, nothing, svg, type TemplateResult } from 'lit';
import { unsafeHTML } from 'lit/directives/unsafe-html.js';
import { base } from '../../../ui/core/styles.ts';
import type { NoemaDialog } from '../../../ui/index.ts';
import { holding } from '../domain/work.ts';
import { work } from '../domain/work.ts';
import { nextUp, summary, type StepStatus } from '../domain/status.ts';
import { shownNode } from '../domain/i18n.ts';
import type { Roadmap } from '../domain/model.ts';
import { RoadmapElement } from './element.ts';
import { classicEdge, classicPlaces, columnSpan, mapColumns, NODE, related, TREASURE, treasureCurve, treasureLayout } from './layout.ts';
import { marks, remoteOf, type Mark } from './marks.ts';
import { ROLE_ICON } from './step.ts';
import { screen } from './styles.ts';

export type MapView = 'map' | 'treasure' | 'list';

// 🔓 is unreadable at badge size (looks like 🔒): open steps get a drawn padlock with its shackle swung open
const OPEN_SVG = svg`<svg viewBox="0 0 24 24" width="1.15em" height="1.15em" aria-hidden="true" style="vertical-align:-0.2em"><path d="M7 11V7a5 5 0 0 1 9.9-1" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/><rect x="3" y="11" width="18" height="11" rx="2.5" fill="currentColor"/></svg>`;

export class NoemaRoadmapMap extends RoadmapElement {
  static override properties = {
    account: { type: String },
    roadmapId: { type: String, attribute: 'roadmap-id' },
    view: { type: String, reflect: true },
    focusStep: { type: String, attribute: 'focus-step' },
    selected: { state: true },
    zoom: { state: true },
  };
  static override styles = [
    base,
    screen,
    css`
      :host {
        display: flex;
        flex-direction: column;
        min-height: 0;
        height: 100%;
        background: var(--u-bg);
        color: var(--u-ink);
      }
      .cm-top {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        padding: 10px 14px;
        border-bottom: 1px solid var(--u-line);
      }
      .cm-title {
        flex: 1 1 14em;
        min-width: 0;
      }
      .cm-title strong {
        display: block;
        font-family: var(--u-display);
        overflow-wrap: anywhere;
      }
      .cm-tools {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .seg {
        display: inline-flex;
        border: 1px solid var(--u-line);
        border-radius: 999px;
        overflow: hidden;
      }
      .seg button {
        min-height: 32px;
        min-width: 48px;
        padding: 0 12px;
        border: 0;
        background: transparent;
        color: var(--u-ink);
        font: inherit;
        cursor: pointer;
      }
      .seg button[aria-checked='true'] {
        background: var(--u-acc-soft);
        color: var(--u-acc-text);
        font-weight: 700;
      }
      .bar {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        align-items: center;
        margin: 8px 14px 0;
        padding: 8px 12px;
        border-radius: var(--u-br);
        background: var(--u-paper);
        border: 1px solid var(--u-line);
      }
      .bar:empty {
        display: none;
      }
      noema-roadmap-levels {
        margin: 8px 14px 0;
      }
      .cm-body {
        display: flex;
        flex: 1;
        min-height: 0;
        margin-top: 8px;
        position: relative;
      }
      .cm-scroll {
        flex: 1;
        overflow: auto;
        min-width: 0;
        min-height: 320px;
      }
      .cm-canvas {
        position: relative;
      }
      .cm-inner {
        position: absolute;
        inset-inline-start: 0;
        top: 0;
        transform-origin: 0 0;
      }
      :host(:dir(rtl)) .cm-inner {
        transform-origin: 100% 0;
      }
      .cm-band {
        position: absolute;
        top: 4px;
        border-radius: 18px;
        pointer-events: none;
        background: color-mix(in srgb, var(--u-acc-soft) 45%, transparent);
      }
      .cm-band.cm-core {
        background: color-mix(in srgb, var(--u-warn) 55%, transparent);
      }
      .cm-band.cm-apps {
        background: color-mix(in srgb, var(--u-ok) 55%, transparent);
      }
      .cm-band.cm-level:nth-of-type(even) {
        background: color-mix(in srgb, var(--u-info) 55%, transparent);
      }
      .cm-band span {
        display: inline-block;
        margin: 10px 14px;
        font-weight: 800;
        font-size: 14px;
        color: var(--u-ink2);
      }
      svg.cm-edges {
        position: absolute;
        inset-inline-start: 0;
        top: 0;
        pointer-events: none;
      }
      .cm-edges path {
        fill: none;
        stroke: var(--u-line);
        stroke-width: 2;
      }
      .cm-edges path.ok {
        stroke: var(--u-ok-ink);
      }
      .cm-edges path.hl {
        stroke: var(--u-acc);
        stroke-width: 3;
      }
      .cm-edges path.dim {
        opacity: 0.2;
      }
      .cm-node {
        position: absolute;
        display: grid;
        grid-template-columns: auto 1fr;
        column-gap: 6px;
        align-items: center;
        padding: 8px 10px;
        border-radius: 14px;
        border: 2px solid var(--u-line);
        background: var(--u-paper);
        color: var(--u-ink);
        font: inherit;
        font-size: 13px;
        text-align: start;
        cursor: pointer;
        overflow: hidden;
        transition: transform var(--u-fast) var(--u-ease, ease);
      }
      .cm-node:hover,
      .cm-node:focus-visible {
        transform: translateY(-2px);
        outline: none;
        box-shadow: var(--u-shadow);
        z-index: 2;
      }
      .cm-node.cm-mastered {
        border-color: var(--u-ok-ink);
        background: var(--u-ok);
      }
      .cm-node.cm-open {
        border-color: var(--u-acc);
      }
      .cm-node.cm-locked {
        color: var(--u-ink2);
      }
      .cm-node.sel {
        outline: 3px solid var(--u-acc);
        outline-offset: 2px;
        z-index: 3;
      }
      .cm-node.dim {
        opacity: 0.35;
      }
      .cm-node .cm-t {
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .cm-node .cm-badges {
        position: absolute;
        inset-inline-end: 6px;
        top: 4px;
        font-size: 12px;
      }
      .cm-node .cm-ic {
        font-size: 18px;
      }
      .cm-prog {
        position: absolute;
        inset-inline-start: 0;
        bottom: 0;
        height: 4px;
        background: var(--u-acc);
      }
      .cm-open .cm-openic {
        color: var(--u-ok-ink);
      }
      /* the treasure map */
      .cm-tsvg {
        position: absolute;
        inset-inline-start: 0;
        top: 0;
      }
      .cm-e {
        fill: none;
        stroke: var(--u-ink3);
        stroke-width: 2.5;
        stroke-dasharray: 2 7;
        stroke-linecap: round;
      }
      .cm-e.ok {
        stroke: var(--u-ok-ink);
        stroke-dasharray: none;
      }
      .cm-e.op {
        stroke: var(--u-acc);
      }
      .cm-e.hl {
        stroke: var(--u-acc);
        stroke-width: 4;
      }
      .cm-e.dim {
        opacity: 0.2;
      }
      .cm-flag {
        fill: var(--u-ok-ink);
      }
      .cm-tband {
        position: absolute;
        inset-inline-start: 12px;
        border-radius: 14px;
        pointer-events: none;
        background: color-mix(in srgb, var(--u-acc-soft) 40%, transparent);
      }
      .cm-tband:nth-of-type(even) {
        background: color-mix(in srgb, var(--u-info) 45%, transparent);
      }
      .cm-tband span {
        display: inline-block;
        margin: 6px 12px;
        font-weight: 800;
        font-size: 13px;
        color: var(--u-ink2);
      }
      .cm-st {
        position: absolute;
        width: 116px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 0;
        border: 0;
        background: none;
        color: var(--u-ink);
        font: inherit;
        font-size: 12px;
        text-align: center;
        cursor: pointer;
      }
      .cm-st .cm-dot {
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        border: 3px solid var(--u-ink3);
        background: var(--u-paper);
        font-size: 12px;
        font-weight: 800;
      }
      .cm-st.cm-open .cm-dot {
        border-color: var(--u-acc);
      }
      .cm-st.cm-mastered .cm-dot {
        border-color: var(--u-ok-ink);
        background: var(--u-ok);
      }
      .cm-st.sel .cm-dot {
        outline: 3px solid var(--u-acc);
        outline-offset: 2px;
      }
      .cm-st.dim {
        opacity: 0.4;
      }
      .cm-st .cm-code {
        font-size: 11px;
        color: var(--u-ink2);
      }
      .cm-st .cm-t {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .cm-pip {
        font-style: normal;
      }
      .cm-hero {
        position: absolute;
        top: -6px;
        width: 34px;
        height: 34px;
      }
      .cm-hero.r {
        inset-inline-start: 86px;
      }
      .cm-hero.l {
        inset-inline-end: 86px;
      }
      .cm-tlabel {
        position: absolute;
        text-align: center;
        font-family: var(--u-display);
        font-weight: 700;
      }
      /* the list */
      .cm-list {
        list-style: none;
        margin: 0;
        padding: 8px 14px 24px;
        display: grid;
        gap: 6px;
      }
      .cm-listnode {
        position: relative;
        display: flex;
        gap: 10px;
        align-items: center;
        width: 100%;
        min-height: 48px;
        padding: 8px 12px;
        border-radius: var(--u-br);
        border: 1px solid var(--u-line);
        background: var(--u-paper);
        color: var(--u-ink);
        font: inherit;
        text-align: start;
        cursor: pointer;
        overflow: hidden;
      }
      .cm-listnode .cm-t {
        flex: 1;
        min-width: 0;
        display: grid;
      }
      .cm-listnode small {
        color: var(--u-ink2);
      }
      .cm-listnode.sel {
        outline: 3px solid var(--u-acc);
      }
      .cm-listnode.cm-mastered {
        background: var(--u-ok);
      }
      noema-roadmap-step {
        width: min(420px, 40vw);
        border-inline-start: 1px solid var(--u-line);
        background: var(--u-paper);
        overflow: auto;
      }
      @media (max-width: 720px) {
        noema-roadmap-step {
          position: absolute;
          inset-inline: 0;
          bottom: 0;
          width: auto;
          max-height: 72%;
          border-inline-start: 0;
          border-top: 1px solid var(--u-line);
          border-radius: 20px 20px 0 0;
          box-shadow: var(--u-shadow);
          z-index: 5;
        }
      }
      .cm-next {
        margin: 0;
        padding-inline-start: 1.3em;
        line-height: 1.7;
      }
      .cm-next a {
        color: var(--u-acc-text);
      }
      .cm-legend {
        display: grid;
        gap: 8px;
      }
    `,
  ];
  declare account: string;
  declare roadmapId: string;
  declare view: MapView;
  declare focusStep: string;
  declare selected: string | null;
  declare zoom: number;
  #off: (() => void) | null = null;
  #timer: ReturnType<typeof setTimeout> | null = null;
  #fitted = false;
  /** the drawing the Map button goes back to from the list */
  #mapView: MapView = 'map';

  constructor() {
    super();
    this.account = '';
    this.roadmapId = '';
    this.view = 'map';
    this.focusStep = '';
    this.selected = null;
    this.zoom = 1;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.data.app.start(this.account);
    this.#off = this.data.onChange(() => {
      if (this.#timer) clearTimeout(this.#timer);
      this.#timer = setTimeout(() => {
        this.#timer = null;
        this.requestUpdate();
      }, 400);
    });
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#off?.();
    this.#off = null;
    if (this.#timer) clearTimeout(this.#timer);
  }

  override willUpdate(changed: Map<string, unknown>): void {
    if (changed.has('focusStep') && this.focusStep) this.selected = this.focusStep;
    if (changed.has('view')) this.#fitted = false;
  }

  protected override updated(): void {
    // the treasure map fits the width once (the learner zooms after)
    if (this.view !== 'treasure' || this.#fitted) return;
    const sc = this.renderRoot.querySelector<HTMLElement>('.cm-scroll'),
      w = Number(this.renderRoot.querySelector<HTMLElement>('.cm-canvas')?.dataset['w'] ?? 0);
    if (!sc?.clientWidth || !w) return;
    this.#fitted = true;
    const z = Math.max(0.45, Math.min(1.25, (sc.clientWidth - 24) / w));
    if (Math.abs(z - this.zoom) > 0.02) this.zoom = z;
  }

  /** Select a step (and show it beside the map); null: nothing selected. */
  select(id: string | null): void {
    this.selected = id;
    if (id)
      void this.updateComplete.then(() => {
        this.scrollToStep(id);
      });
  }

  /** Scroll the map (only the map) so the step is in the middle. */
  scrollToStep(id: string): void {
    const sc = this.renderRoot.querySelector<HTMLElement>('.cm-scroll'),
      b = this.renderRoot.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`);
    if (!sc || !b) return;
    if (this.view === 'list') {
      b.scrollIntoView({ block: 'center' });
      return;
    }
    const x = parseFloat(b.style.left) * this.zoom,
      y = parseFloat(b.style.top) * this.zoom,
      r = sc.getBoundingClientRect();
    sc.scrollTo({ left: Math.max(0, x - r.width / 2), top: Math.max(0, y - r.height / 2) });
  }

  #zoomTo(z: number): void {
    this.zoom = Math.max(0.35, Math.min(1.6, z));
  }

  #fit(): void {
    const sc = this.renderRoot.querySelector<HTMLElement>('.cm-scroll'),
      cv = this.renderRoot.querySelector<HTMLElement>('.cm-canvas');
    if (!sc || !cv) return;
    const r = sc.getBoundingClientRect(),
      w = Number(cv.dataset['w'] ?? 1) || 1,
      h = Number(cv.dataset['h'] ?? 1) || 1;
    this.#zoomTo(this.view === 'treasure' ? Math.min(1, r.width / w) : Math.min(r.width / w, r.height / h));
  }

  #dialog(sel: string): NoemaDialog | null {
    return this.renderRoot.querySelector<NoemaDialog>(sel);
  }

  #markTitle(m: Mark): string {
    return this.t(m.key, m.params);
  }

  /* ---- the bars above the map ---- */

  #holdBar(c: Roadmap): TemplateResult {
    if (!holding(c)) return html``;
    const k = Object.values(c.nodes).filter(n => n.pack?.assigned).length;
    return html`<div class="bar cm-holdbar" role="status">
      <span class="grow"
        >📦 ${this.t('roadmap.map.map.hold').replace(/\*\*/g, '')}${k ? ' ' + this.t('roadmap.map.map.holdN', { n: k }) : ''}</span
      >
      <noema-button
        size="sm"
        class="cm-attachsubs"
        @click=${(): void => {
          this.emit('roadmap-attach-many', { roadmap: c.id });
        }}
        >📦 ${this.t('roadmap.map.build.attachSubs')}</noema-button
      >
      <noema-button
        size="sm"
        variant="secondary"
        class="cm-plannow"
        @click=${(): void => {
          this.emit('roadmap-plan-now', { roadmap: c.id });
        }}
        >▶ ${this.t('roadmap.map.build.planNow')}</noema-button
      >
    </div>`;
  }

  #appBar(c: Roadmap): TemplateResult {
    const w = work(c);
    if (w.done) return html``;
    const todo = [
      w.toPlan.length ? this.t('roadmap.map.map.toPlan', { n: w.toPlan.length }) : '',
      w.steps.length ? this.t('roadmap.map.map.toPrepare', { n: w.steps.length }) : '',
    ]
      .filter(Boolean)
      .join(' · ');
    return html`<div class="bar cm-appbar" role="status">
      <span class="grow">💬 ${this.t('roadmap.map.map.forApp', { todo }).replace(/\*\*/g, '')}</span>
      <noema-button
        size="sm"
        class="cm-copymsg"
        @click=${(): void => {
          void this.data.copy(this.data.app.message(c, 1)).then(ok => {
            if (ok) this.data.notify('📋 ' + this.t('roadmap.map.copied'));
          });
        }}
        >📋 ${this.t('roadmap.map.map.copyMsg')}</noema-button
      >
      <noema-button
        size="sm"
        variant="secondary"
        class="cm-howbyhand"
        @click=${(): void => {
          this.emit('roadmap-show-app', { roadmap: c.id, step: null });
        }}
        >${this.t('roadmap.map.map.howByHand')}</noema-button
      >
    </div>`;
  }

  #shareBar(c: Roadmap): TemplateResult {
    const sh = c.shared;
    if (!sh) return html``;
    if (sh.ended) return html`<div class="bar cm-sharebar" role="status">👥 ${this.t('roadmap.map.map.ended')}</div>`;
    const R = Object.values(c.remote ?? {}),
      ready = R.filter(x => x.status === 'ready').length,
      busy = R.filter(x => x.status === 'preparing' && !x.mine).length;
    const incoming = sh['incoming'] as { count?: number } | undefined;
    const who = sh.ownerName ?? this.t('roadmap.map.lib.itsOwner');
    return html`<div class="bar cm-sharebar" role="status">
      <span class="grow"
        >👥
        <strong
          >${
            sh.role === 'member'
              ? this.t('roadmap.map.map.sharedBy', { who })
              : this.t('roadmap.map.map.youShare', { pub: sh['public'] ? 'yes' : 'no' })
          }</strong
        >
        · ${this.t('roadmap.map.map.sharedReady', { n: ready })}${busy ? ' · ⏳ ' + this.t('roadmap.map.map.busyOthers', { n: busy }) : ''}
        · ${this.t('roadmap.map.map.ownProgress')}</span
      >
      <noema-tip topic=${this.t('roadmap.map.moreInfo')}
        >${this.t('roadmap.map.share.rules')}
        ${this.t(sh.role === 'member' ? 'roadmap.map.map.memberRule' : 'roadmap.map.map.ownerRule')}</noema-tip
      >
      ${
        sh.role === 'member' && incoming?.count
          ? html`<noema-button
              size="sm"
              class="cm-reviewbtn"
              @click=${(): void => {
                this.emit('roadmap-review-changes', { roadmap: c.id });
              }}
              >🔔
              ${this.t('roadmap.map.map.changes', { n: incoming.count, who: sh.ownerName ?? this.t('roadmap.map.map.theOwner') })}</noema-button
            >`
          : nothing
      }
      ${
        sh.role === 'owner'
          ? html`<noema-button
              size="sm"
              variant="secondary"
              class="cm-people"
              @click=${(): void => {
                this.emit('roadmap-share', { roadmap: c.id });
              }}
              >👥 ${this.t('roadmap.map.share.people')}</noema-button
            >`
          : nothing
      }
    </div>`;
  }

  /* ---- the classic map ---- */

  #classic(c: Roadmap, st: Record<string, StepStatus>): TemplateResult {
    const MC = mapColumns(c),
      { P, W, H } = classicPlaces(MC.cols),
      z = this.zoom,
      sel = this.selected,
      rel = related(c, sel),
      busy = this.data.prep.busy(),
      other = this.t('roadmap.map.st.anotherMember');
    const bands = MC.bands.length
      ? MC.bands.map(b => {
          const s = columnSpan(b.from, b.to);
          const label = b.level
            ? this.t('roadmap.map.band.level', { level: this.levelLabel(c, b.level) })
            : this.t('roadmap.map.band.noLevel');
          return html`<div class="cm-band cm-level" data-level=${b.level} style="left:${s.left}px;width:${s.width}px;height:${H - 8}px">
            <span>${label}</span>
          </div>`;
        })
      : (
          [
            ['prereq', '1 · ' + this.t('roadmap.map.map.bandPre')],
            ['core', '2 · ' + this.roadmapTitle(c)],
            ['apps', '3 · ' + this.t('roadmap.map.map.bandApps')],
          ] as const
        ).map(([k, label]) => {
          const [a, b] = MC.parts[k];
          if (b < a) return nothing;
          const s = columnSpan(a, b);
          return html`<div class="cm-band cm-${k}" style="left:${s.left}px;width:${s.width}px;height:${H - 8}px">
            <span>${label}</span>
          </div>`;
        });
    const edges = c.edges.map(e => {
      const a = P[e.from],
        b = P[e.to];
      if (!a || !b) return nothing;
      const on = !!rel && (e.from === sel || e.to === sel);
      const cls = [st[e.from]?.mastered ? 'ok' : '', on ? 'hl' : '', rel && !on ? 'dim' : ''].filter(Boolean).join(' ');
      return svg`<path class=${cls} d=${classicEdge(a, b)}></path>`;
    });
    const nodes = Object.keys(c.nodes).map(id => {
      const n = shownNode(c, id, this.shownLocale(c)),
        s = st[id],
        p = P[id];
      if (!n || !s || !p) return nothing;
      const state = s.mastered ? 'mastered' : s.open ? 'open' : 'locked';
      const mk = marks(c, id, s, busy, other, true),
        rx = remoteOf(c, id);
      const byOther = mk.find(m => m.k === 'others');
      const badge = s.mastered
        ? '✅'
        : s.locked
          ? '🔒'
          : html`<span class="cm-openic" title=${this.t('roadmap.map.openIcon')}>${OPEN_SVG}</span>`;
      const prep = mk.filter(m => m.k !== 'material' && m.k !== 'others').map(m => m.emoji)[0] ?? '';
      const label = [
        n.title,
        this.t('roadmap.map.role.' + (n.role ?? 'subtopic')),
        this.t('roadmap.map.st.state', { s: state }) +
          (n.pack?.assigned
            ? ', ' + this.t(s.replanning ? 'roadmap.map.st.replanning' : 'roadmap.map.st.taughtBySubject')
            : n.pack?.status === 'ready'
              ? ', ' + this.t('roadmap.map.st.prepared')
              : '') +
          (byOther ? ', ' + this.#markTitle(byOther) : ''),
      ].join(' — ');
      const cls = ['cm-node', 'cm-' + state, 'cm-r-' + (n.role ?? ''), sel === id ? 'sel' : '', rel && !rel.has(id) ? 'dim' : '']
        .filter(Boolean)
        .join(' ');
      return html`<button
        class=${cls}
        data-id=${id}
        style="left:${p.x}px;top:${p.y}px;width:${NODE.w}px;height:${NODE.h}px"
        aria-label=${label}
        @click=${(): void => {
          this.select(id);
        }}
      >
        <span class="cm-ic" aria-hidden="true">${ROLE_ICON[n.role ?? ''] ?? '•'}</span><span class="cm-t">${n.title}</span>
        <span class="cm-badges"
          >${badge}${
            byOther ? html`<span class="cm-by" title=${this.#markTitle(byOther)}>${rx?.status === 'ready' ? '⚡' : '⏳'}👤</span>` : prep
          }${
            mk.some(m => m.k === 'material')
              ? html`<span title=${this.t('roadmap.map.st.yourMaterial', { files: (n.material?.files ?? []).map(f => f.name).join(', ') })}
                  >📎</span
                >`
              : nothing
          }</span
        >
        ${s.score && !s.mastered ? html`<i class="cm-prog" style="width:${Math.round(s.score * 100)}%"></i>` : nothing}
      </button>`;
    });
    return html`<div class="cm-canvas" data-w=${W} data-h=${H} style="width:${W * z}px;height:${H * z}px">
      <div class="cm-inner" style="width:${W}px;height:${H}px;transform:scale(${z})">
        ${bands}
        <svg class="cm-edges" width=${W} height=${H} aria-hidden="true">${edges}</svg>
        ${nodes}
      </div>
    </div>`;
  }

  /* ---- the treasure map ---- */

  #treasure(c: Roadmap, st: Record<string, StepStatus>): TemplateResult {
    const G = treasureLayout(c),
      { X, Y, W, H, E, layers, code } = G,
      z = this.zoom,
      sel = this.selected,
      rel = related(c, sel),
      busy = this.data.prep.busy(),
      art = this.data.art,
      other = this.t('roadmap.map.st.anotherMember'),
      f1 = (v: number): number => +v.toFixed(1);
    const paths = E.map(ch => {
      const a = ch[0] ?? '',
        b = ch[ch.length - 1] ?? '',
        s = st[a],
        on = !!rel && (a === sel || b === sel);
      const cls = ['cm-e', s?.mastered ? 'ok' : s?.open ? 'op' : 'lk', on ? 'hl' : rel ? 'dim' : ''].filter(Boolean).join(' ');
      return svg`<path class=${cls} d=${treasureCurve(ch, X, Y)}></path>`;
    });
    const flags = Object.keys(c.nodes)
      .filter(id => st[id]?.mastered && X[id] !== undefined)
      .map(id => svg`<path class="cm-flag" d="M${f1((X[id] ?? 0) + 14)} ${Y(id) - 15} v-26 l15 6.5 l-15 6.5"></path>`);
    const tx = f1(X[TREASURE] ?? W / 2),
      ty = Y(TREASURE);
    const bands = G.bands.map(b => {
      const top = Y(layers[b.to]?.[0] ?? '') - 62,
        bottom = Y(layers[b.from]?.[0] ?? '') + 62;
      const label = b.level ? this.levelLabel(c, b.level) : this.t('roadmap.map.band.noLevel');
      return html`<div class="cm-tband" data-level=${b.level} style="top:${top}px;height:${bottom - top}px;width:${W - 24}px">
        <span>${label}</span>
      </div>`;
    });
    const nx = nextUp(c, st)[0];
    const stations = Object.keys(c.nodes).map(id => {
      const n = shownNode(c, id, this.shownLocale(c)),
        s = st[id],
        x = X[id];
      if (!n || !s || x === undefined) return nothing;
      const state = s.mastered ? 'mastered' : s.open ? 'open' : 'locked',
        pct = Math.round((s.score || 0) * 100),
        mk = marks(c, id, s, busy, other);
      const inside = s.mastered ? '✓' : s.open ? (pct ? this.i18n.format.percent(pct / 100) : OPEN_SVG) : '🔒';
      let hero: TemplateResult | typeof nothing = nothing;
      const mascot = id === nx ? art.mascot() : null;
      if (mascot) {
        const l = layers[G.L[id] ?? 0] ?? [],
          i = l.indexOf(id),
          lg = x - (i ? (X[l[i - 1] ?? ''] ?? 0) : 0),
          rg = (i < l.length - 1 ? (X[l[i + 1] ?? ''] ?? W) : W) - x;
        hero = html`<span class="cm-hero ${rg > lg ? 'r' : 'l'}" title=${this.t('roadmap.map.tmap.here')}>${unsafeHTML(mascot)}</span>`;
      }
      const label =
        `${code[id] ?? ''} · ${n.title} — ${this.t('roadmap.map.st.state', { s: state })}` +
        (s.open && !s.mastered && pct ? ` (${this.i18n.format.percent(pct / 100)})` : '') +
        mk.map(m => ', ' + this.#markTitle(m)).join('');
      const cls = [
        'cm-node',
        'cm-st',
        'cm-' + state,
        'cm-r-' + (n.role ?? ''),
        sel === id ? 'sel' : '',
        rel && !rel.has(id) ? 'dim' : '',
        id === nx ? 'cm-nextup' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return html`<button
        class=${cls}
        data-id=${id}
        style="left:${f1(x - 58)}px;top:${Y(id) - 22}px"
        title=${n.title}
        aria-label=${label}
        @click=${(): void => {
          this.select(id);
        }}
      >
        <span class="cm-dot">${inside}</span><b class="cm-code">${code[id]}</b><span class="cm-t">${n.title}</span>
        <span class="cm-badges">${mk.map(m => html`<i class="cm-pip" data-k=${m.k} title=${this.#markTitle(m)}>${m.emoji}</i>`)}</span>
        ${hero}
      </button>`;
    });
    const goal = this.roadmapTitle(c).trim(),
      gw = Math.min(W - 130, 300);
    return html`<div class="cm-canvas" data-w=${W} data-h=${H} style="width:${W * z}px;height:${H * z}px">
      <div class="cm-inner cm-vert cm-tmap" style="width:${W}px;height:${H}px;transform:scale(${z})">
        ${bands}
        <svg class="cm-tsvg" width=${W} height=${H} viewBox="0 0 ${W} ${H}" aria-hidden="true">
          <rect
            x="8"
            y="8"
            width=${W - 16}
            height=${H - 16}
            rx="14"
            fill="none"
            stroke="var(--u-ink3)"
            stroke-opacity=".3"
            stroke-dasharray="2 6"
          ></rect>
          <g transform="translate(40 48)" opacity=".6">
            <circle r="16" fill="none" stroke="var(--u-ink3)"></circle>
            <path d="M0 -21 L4.5 0 L0 21 L-4.5 0Z" fill="var(--u-ink3)"></path>
            <text y="-25" text-anchor="middle" font-size="11" fill="var(--u-ink3)">${this.t('roadmap.map.tmap.north')}</text>
          </g>
          <text x="22" y=${H - 20} fill="var(--u-ink2)" font-weight="700">${this.t('roadmap.map.tmap.start')}</text>
          ${paths}
          <g transform="translate(${tx} ${ty})">
            <path d="M-11 -11 L11 11 M11 -11 L-11 11" stroke="var(--u-bad-ink)" stroke-width="5" stroke-linecap="round"></path>
            <g transform="translate(16 -34)">
              <rect x="0" y="6" width="40" height="26" rx="4" fill="var(--u-warn)" stroke="var(--u-warn-ink)" stroke-width="1.5"></rect>
              <path d="M0 14 q20 -18 40 0" fill="var(--u-warn)" stroke="var(--u-warn-ink)" stroke-width="1.5"></path>
            </g>
          </g>
          ${flags}
        </svg>
        <div class="cm-tlabel" style="left:${f1(Math.max(20, Math.min(W - 20 - gw, tx - gw / 2)))}px;bottom:${H - ty + 40}px;width:${gw}px">
          ${this.t('roadmap.map.tmap.treasure', { goal })}
        </div>
        ${stations}
      </div>
    </div>`;
  }

  /* ---- the list ---- */

  #list(c: Roadmap, st: Record<string, StepStatus>): TemplateResult {
    const MC = mapColumns(c);
    return html`<div class="cm-canvas">
      <ol class="cm-list">
        ${MC.cols.flat().map(id => {
          const n = shownNode(c, id, this.shownLocale(c)),
            s = st[id];
          if (!n || !s) return nothing;
          const state = s.mastered ? 'mastered' : s.open ? 'open' : 'locked',
            pk = n.pack?.status;
          const sub =
            this.t('roadmap.map.role.' + (n.role ?? 'subtopic')) +
            (pk === 'ready'
              ? ' · ⚡ ' + this.t('roadmap.map.st.prepared')
              : pk === 'generating'
                ? ' · ⏳ ' + this.t('roadmap.map.st.preparing')
                : n.pack?.assigned
                  ? ' · 📦 ' + this.t('roadmap.map.st.yourSubject')
                  : '');
          return html`<li>
            <button
              class="cm-node cm-listnode cm-${state} ${this.selected === id ? 'sel' : ''}"
              data-id=${id}
              @click=${(): void => {
                this.select(id);
              }}
            >
              <span class="cm-ic" aria-hidden="true">${ROLE_ICON[n.role ?? ''] ?? '•'}</span>
              <span class="cm-t"><b>${n.title}</b><small>${sub}</small></span>
              <span class="cm-badges">${s.mastered ? '✅' : s.locked ? '🔒' : html`<span class="cm-openic">${OPEN_SVG}</span>`}</span>
              ${s.score && !s.mastered ? html`<i class="cm-prog" style="width:${Math.round(s.score * 100)}%"></i>` : nothing}
            </button>
          </li>`;
        })}
      </ol>
    </div>`;
  }

  #nextDialog(c: Roadmap, st: Record<string, StepStatus>): TemplateResult {
    const ids = nextUp(c, st).slice(0, 30);
    return html`<noema-dialog class="cm-nextdlg" heading=${'▶ ' + this.t('roadmap.map.map.nextUp')}>
      <p class="tiny">${this.t('roadmap.map.next.lead')}</p>
      ${
        ids.length
          ? html`<ol class="cm-next">
              ${ids.map(id => {
                const pk = c.nodes[id]?.pack?.status;
                const note =
                  pk === 'ready'
                    ? '⚡ ' + this.t('roadmap.map.st.prepared')
                    : pk === 'generating'
                      ? '⏳ ' + this.t('roadmap.map.st.preparing')
                      : !c.nodes[id]?.reviewed && c['autoApprove'] !== true
                        ? '📝 ' + this.t('roadmap.map.next.needsReview')
                        : '✔ ' + this.t('roadmap.map.next.reviewed');
                return html`<li>
                  <a
                    href="#"
                    @click=${(e: Event): void => {
                      e.preventDefault();
                      this.#dialog('.cm-nextdlg')?.close('step');
                      this.select(id);
                    }}
                    >${this.stepTitle(c, id)}</a
                  >
                  <span class="tiny">${note}</span>
                </li>`;
              })}
            </ol>`
          : html`<p>🎉 ${this.t('roadmap.map.next.allDone')}</p>`
      }
    </noema-dialog>`;
  }

  #legendDialog(): TemplateResult {
    const row = (inside: unknown, text: string): TemplateResult =>
      html`<div class="row"><span aria-hidden="true">${inside}</span><span class="grow">${text}</span></div>`;
    return html`<noema-dialog class="cm-legenddlg" heading=${this.t('roadmap.map.sign.title')}>
      <div class="cm-legend">
        ${row('✓', this.t('roadmap.map.sign.mastered'))} ${row(OPEN_SVG, this.t('roadmap.map.sign.open'))}
        ${row('🧭', this.t('roadmap.map.sign.here'))} ${row('🔒', this.t('roadmap.map.sign.locked'))}
        ${row('⚡', this.t('roadmap.map.sign.ready'))} ${row('📝', this.t('roadmap.map.sign.review'))}
        ${row('⏳', this.t('roadmap.map.sign.busy'))} ${row('💬', this.t('roadmap.map.sign.app'))}
        ${row('📦', this.t('roadmap.map.sign.own'))} ${row('🔄', this.t('roadmap.map.sign.replan'))}
        ${row('📎', this.t('roadmap.map.sign.material'))} ${row('👤', this.t('roadmap.map.sign.byOther'))}
        ${row('⚠️', this.t('roadmap.map.sign.failed'))}
        <p class="tiny">${this.t('roadmap.map.sign.rule')}</p>
      </div>
    </noema-dialog>`;
  }

  override render(): TemplateResult {
    const c = this.data.roadmap(this.account, this.roadmapId);
    if (!c) return html`<p class="status bad" role="alert">${this.t('roadmap.map.map.notHere')}</p>`;
    const st = this.data.statuses(this.account, c),
      s = summary(c, st),
      paused = this.data.prep.paused();
    const sum =
      this.view === 'treasure'
        ? this.t('roadmap.map.map.summary', { m: s.mastered, n: s.total }) + (paused ? ' · ' + this.t('roadmap.map.sign.paused') : '')
        : this.t('roadmap.map.lib.cardStats', { m: s.mastered, total: s.total, open: s.open, ready: s.ready }) +
          (paused ? ' · ⏸ ' + this.t('roadmap.map.map.paused') : '');
    const setView = (v: MapView): void => {
      this.view = v;
      this.emit('roadmap-view', { view: v });
    };
    if (this.view !== 'list') this.#mapView = this.view;
    const mapLike = this.#mapView;
    const body = this.view === 'list' ? this.#list(c, st) : this.view === 'treasure' ? this.#treasure(c, st) : this.#classic(c, st);
    return html`
      <div class="cm-top">
        <div class="cm-title"><strong>${this.roadmapTitle(c)}</strong><span class="tiny cm-sum">${sum}</span></div>
        <div class="seg cm-viewseg" role="radiogroup" aria-label=${this.t('roadmap.map.view.aria')}>
          <button
            role="radio"
            class="cm-vbtn"
            data-list="false"
            aria-checked=${String(this.view !== 'list')}
            @click=${(): void => {
              setView(mapLike);
            }}
          >
            ${this.t('roadmap.map.view.map')}
          </button>
          <button
            role="radio"
            class="cm-vbtn"
            data-list="true"
            aria-checked=${String(this.view === 'list')}
            @click=${(): void => {
              setView('list');
            }}
          >
            ${this.t('roadmap.map.view.list')}
          </button>
        </div>
        <div class="cm-tools">
          ${
            this.view === 'list'
              ? nothing
              : html`<noema-button
                    class="cm-zoom"
                    size="sm"
                    variant="secondary"
                    aria-label=${this.t('roadmap.map.map.zoomOut')}
                    title=${this.t('roadmap.map.map.zoomOut')}
                    @click=${(): void => {
                      this.#zoomTo(this.zoom / 1.2);
                    }}
                    >−</noema-button
                  >
                  <noema-button
                    class="cm-zoom"
                    size="sm"
                    variant="secondary"
                    aria-label=${this.t('roadmap.map.map.zoomIn')}
                    title=${this.t('roadmap.map.map.zoomIn')}
                    @click=${(): void => {
                      this.#zoomTo(this.zoom * 1.2);
                    }}
                    >+</noema-button
                  >
                  <noema-button
                    size="sm"
                    variant="secondary"
                    class="cm-fit"
                    title=${this.t('roadmap.map.map.whole')}
                    @click=${(): void => {
                      this.#fit();
                    }}
                    >⤢ ${this.t('roadmap.map.map.fit')}</noema-button
                  >`
          }
          <noema-button
            size="sm"
            class="cm-nextbtn"
            @click=${(): void => {
              this.#dialog('.cm-nextdlg')?.show();
            }}
            >▶ ${this.t('roadmap.map.map.nextUp')}</noema-button
          >
          <noema-icon-button
            class="cm-legendbtn"
            icon="info"
            size="sm"
            label=${this.t('roadmap.map.sign.title')}
            @click=${(): void => {
              this.#dialog('.cm-legenddlg')?.show();
            }}
          ></noema-icon-button>
        </div>
      </div>
      ${this.#holdBar(c)}
      <noema-roadmap-levels
        class="cm-levels"
        account=${this.account}
        roadmap-id=${c.id}
        @roadmap-levels-changed=${(): void => {
          this.requestUpdate();
        }}
      ></noema-roadmap-levels>
      ${this.#appBar(c)} ${this.#shareBar(c)}
      <div class="cm-body">
        <div class="cm-scroll">${body}</div>
        ${
          this.selected && c.nodes[this.selected]
            ? html`<noema-roadmap-step
                class="cm-panel on"
                account=${this.account}
                roadmap-id=${c.id}
                step=${this.selected}
                @roadmap-panel-close=${(): void => {
                  this.selected = null;
                }}
                @roadmap-select=${(e: CustomEvent<{ step: string }>): void => {
                  this.select(e.detail.step);
                }}
                @roadmap-step-changed=${(): void => {
                  this.requestUpdate();
                }}
              ></noema-roadmap-step>`
            : nothing
        }
      </div>
      ${this.#nextDialog(c, st)} ${this.#legendDialog()}
    `;
  }
}
