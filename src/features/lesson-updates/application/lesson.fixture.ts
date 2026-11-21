/* noema-lite — the lesson the lesson-update tests improve (docs/LESSON_UPDATES.md): a gradual chapter of the real case of Q0
   (tests/gradual.js), its Greek translation, and the app's own content checks (src/features/content). Test data. */
import { createContentChecks, NO_ENGINES } from '../../content/application/index.ts';
import type { Base, Checks } from '../domain/index.ts';
import type { Obj } from '../../content/domain/util.ts';

const C = createContentChecks(NO_ENGINES);
export const checks: Checks = {
  checkPack: (p, id, o) => C.checkPack(p, id, o ?? {}),
  checkTranslation: C.checkTranslation,
  checkBridge: C.checkBridge,
};
export const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

export const say = (topic: string, k: number) =>
  Array.from({ length: k }, (_, i) => ({
    t: 'p',
    text: `Picture ${String(i + 1)}: think about ${topic} on a small bench, with a battery, a switch and a lamp you can touch. Ask what you would see, then what you would measure, then what would change if you made one part bigger, and write the answer down before reading on. Each answer builds the picture one piece at a time.`,
  }));
export const sec = (id: string, title: string, focus: string, def: string, topic: string) => ({
  id,
  title,
  focus,
  hook: `Why ${topic} matters before anything else.`,
  blocks: [
    { t: 'p', text: def },
    ...say(topic, 9),
    {
      t: 'reveal',
      label: 'Think first: what would you expect?',
      text: `Write your guess about ${topic}, then check it against the picture above.`,
    },
  ],
});
export const chapter = {
  id: 'ch01',
  title: 'Charge and current',
  sections: [
    sec(
      'ch01-s01',
      'What charge is',
      'Charge is a property that comes in two kinds and is counted in coulombs.',
      'Electric **charge** comes in two kinds, positive and negative; it is counted in **coulombs**, and one electron carries 1.602×10⁻¹⁹ C.',
      'charge',
    ),
    sec(
      'ch01-s02',
      'Charge on the move',
      'Current is how much charge passes per second; its unit is the ampere.',
      '**Current** is the charge that passes a point each second: 1 **ampere** (A) is 1 C per second.',
      'current',
    ),
    sec(
      'ch01-s03',
      'Counting a battery',
      'Battery labels count charge as current times hours.',
      'A battery label counts charge in **ampere-hours**: 1 Ah is 1 A for one hour, 3600 C, so 1 mAh is 3.6 C.',
      'ampere-hours',
    ),
  ],
  exercises: [
    {
      id: 'ch01-e001',
      type: 'calc',
      section: 'ch01-s03',
      difficulty: 2,
      tags: ['calc'],
      q: 'A cell is labelled 2000 mAh. How many coulombs of charge is that?',
      answer: 7200,
      unit: 'C',
      explain: '2000 mAh is 2 Ah, and 1 Ah is 3600 C, so 7200 C. Forgetting the 3600 seconds per hour is the classic slip.',
    },
    {
      id: 'ch01-e002',
      type: 'tf',
      section: 'ch01-s02',
      difficulty: 1,
      tags: ['concept'],
      q: 'A steady current of 2 A moves 2 C past a point every second.',
      answer: true,
      explain: 'One ampere is one coulomb per second, so 2 A is 2 C each second. The trap is to think an ampere is a lump of charge.',
    },
  ],
  flashcards: [{ id: 'ch01-f001', q: 'What is 1 A?', a: '1 coulomb per second', section: 'ch01-s02' }],
  map: {
    concepts: [
      {
        id: 'charge',
        terms: ['charge', 'electric charge', 'coulomb'],
        units: ['C'],
        in: 'ch01-s01',
        def: 'A property of particles that comes in two kinds; counted in coulombs.',
      },
      {
        id: 'current',
        terms: ['current', 'ampere'],
        units: ['A'],
        in: 'ch01-s02',
        def: 'The charge that passes a point each second; 1 A = 1 C/s.',
        needs: ['charge', 'second'],
      },
      {
        id: 'ampere-hour',
        terms: ['ampere-hour'],
        units: ['Ah'],
        in: 'ch01-s03',
        def: 'One ampere for one hour: 3600 C, the unit on battery labels.',
        needs: ['current', 'hour'],
      },
    ],
    learnables: [{ id: 'L1', text: 'Convert a battery label to coulombs', kp: [] }],
    known: [
      { id: 'second', terms: ['second'], from: 'everyday' },
      { id: 'hour', terms: ['hour'], units: ['h'], from: 'everyday' },
      { id: 'battery', terms: ['battery', 'lamp', 'switch', 'cell', 'electron'], from: 'everyday' },
    ],
  },
};
/** the chapter in Greek: the same structure, other words (what a translation file holds) */
export const greek = (ch: Obj): Obj => {
  const g = copy(ch) as Record<string, unknown>;
  g['title'] = 'Φορτίο και ρεύμα';
  return g;
};
export const pack = () => ({
  format: 'noema-pack',
  version: 'v1',
  subject: { id: 'circ-demo', title: 'Circuits', language: 'en', authoring: { rules: 3, by: 'claude' }, features: { math: true } },
  chapters: [copy(chapter)],
  media: {},
  translations: { el: { file: true, chapters: 1 } },
});
export const base = (): Base => ({
  pack: pack(),
  translations: {
    el: { format: 'noema-translation', v: 1, pack: 'circ-demo', locale: 'el', source: 'en', version: 'v1', chapters: [greek(chapter)] },
  },
});
export const para = (text: string) => ({ t: 'p', text });
export const update = (ops: unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  format: 'noema-lesson-update',
  v: 1,
  pack: 'circ-demo',
  chapter: 'ch01',
  summary: 'Adds a clearer picture of current, from your chat.',
  ops,
  ...extra,
});
export const trBlocks = (blocks: unknown[]) => ({ el: copy(blocks) });

/** a second chapter, built on the first (voltage: the energy each coulomb of charge carries) */
export const chapter2 = {
  id: 'ch02',
  title: 'Voltage',
  sections: [
    sec(
      'ch02-s01',
      'What voltage is',
      'Voltage is the energy each coulomb of charge gets; its unit is the volt.',
      '**Voltage** is the energy each coulomb of charge gets between two points: 1 **volt** (V) is 1 joule per coulomb.',
      'voltage',
    ),
    sec(
      'ch02-s02',
      'Voltage and current together',
      'Power is voltage times current: the energy each second.',
      '**Power** is the energy delivered each second: voltage times current, counted in **watts** (W).',
      'power',
    ),
  ],
  exercises: [
    {
      id: 'ch02-e001',
      type: 'calc',
      section: 'ch02-s02',
      difficulty: 2,
      tags: ['calc'],
      q: 'A lamp runs on 12 V and draws a current of 2 A. What power does it take?',
      answer: 24,
      unit: 'W',
      explain: 'Power is voltage times current: 12 V × 2 A = 24 W. Adding the two instead of multiplying is the usual slip.',
    },
  ],
  flashcards: [{ id: 'ch02-f001', q: 'What is 1 V?', a: '1 joule per coulomb', section: 'ch02-s01' }],
  map: {
    concepts: [
      {
        id: 'voltage',
        terms: ['voltage', 'volt'],
        units: ['V'],
        in: 'ch02-s01',
        def: 'The energy each coulomb gets between two points; 1 V = 1 J/C.',
        needs: ['charge', 'energy'],
      },
      {
        id: 'power',
        terms: ['power', 'watt'],
        units: ['W'],
        in: 'ch02-s02',
        def: 'The energy delivered each second; voltage times current.',
        needs: ['voltage', 'current'],
      },
    ],
    learnables: [{ id: 'L2', text: 'Find the power from voltage and current', kp: [] }],
    known: [
      { id: 'energy', terms: ['energy', 'joule'], units: ['J'], from: 'everyday' },
      { id: 'charge', terms: ['charge', 'coulomb', 'current', 'ampere'], from: 'ch01' },
    ],
  },
};
/** the subject with both chapters, in English and Greek */
export const base2 = (): Base => {
  const b = base();
  const p = { ...b.pack, chapters: [copy(chapter), copy(chapter2)], translations: { el: { file: true, chapters: 2 } } };
  const el = b.translations['el'] as Obj;
  return { pack: p, translations: { el: { ...el, chapters: [greek(chapter), { ...copy(chapter2), title: 'Τάση' }] } } };
};
