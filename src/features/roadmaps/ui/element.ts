/**
 * The base of the Roadmap screens: a kit element (services, words, direction) that also finds the screens' data port, and
 * names a level as the learner reads it.
 */
import type { Level } from '../../../contracts/rules/levels.ts';
import { NoemaElement } from '../../../ui/index.ts';
import { shownNode, shownTitle, trLocale } from '../domain/i18n.ts';
import { ladder, levelName, presetOf } from '../domain/levels.ts';
import type { Roadmap } from '../domain/model.ts';
import { requestRoadmapsData, type RoadmapsData } from './data.ts';

/** The catalog's word for a preset level (a level's own names come first). */
const PRESET: Readonly<Record<string, string>> = {
  'kind.grade': 'roadmap.levels.kind.grade',
  'kind.semester': 'roadmap.levels.kind.semester',
  'kind.year': 'roadmap.levels.kind.year',
  'difficulty.introductory': 'roadmap.levels.difficulty.introductory',
  'difficulty.intermediate': 'roadmap.levels.difficulty.intermediate',
  'difficulty.advanced': 'roadmap.levels.difficulty.advanced',
};

export class RoadmapElement extends NoemaElement {
  #data: RoadmapsData | null = null;

  override connectedCallback(): void {
    super.connectedCallback();
    this.#data = requestRoadmapsData(this);
  }

  /** The screens' data port (throws when the element is not in the app: a wiring mistake). */
  protected get data(): RoadmapsData {
    const d = this.#data ?? requestRoadmapsData(this);
    if (!d) throw new Error(`<${this.localName}> is not inside a Roadmaps data provider`);
    this.#data = d;
    return d;
  }

  /** A level's name for the learner: its own name in the interface language, else the catalog's for a preset, else any name. */
  protected levelLabel(c: Pick<Roadmap, 'levels'>, id: string, among: readonly Level[] = ladder(c)): string {
    const l = among.find(x => x.id === id);
    if (!l) return id;
    const chain = this.i18n.chain(),
      own = levelName(l, chain);
    if (own) return own;
    const pre = presetOf(l),
      key = pre ? PRESET[pre.key] : undefined;
    return key ? this.t(key, { n: pre?.n }) : (levelName(l, chain, { any: true }) ?? id);
  }

  /** The locale of the Roadmap's translations the learner reads (null: its own words). */
  protected shownLocale(c: Pick<Roadmap, 'i18n' | 'language'>): string | null {
    return trLocale(c, this.i18n.locale(), this.i18n.chain());
  }

  /** A step's title as the learner reads it (translated when the Roadmap has their language). */
  protected stepTitle(c: Pick<Roadmap, 'i18n' | 'language' | 'nodes'>, id: string): string {
    return shownNode(c, id, this.shownLocale(c))?.title ?? id;
  }

  /** The Roadmap's title as the learner reads it. */
  protected roadmapTitle(c: Pick<Roadmap, 'i18n' | 'language' | 'title' | 'goal'>): string {
    return shownTitle(c, this.shownLocale(c));
  }
}
