/* The 文A language help's rules: the settings, a word's state, the summary in the index, the languages of a subject, the
   sense of a match (anchors, forms), which word gets a gloss, and the badge. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  badge,
  bridgeSettings,
  FADE,
  gloss,
  langsOf,
  patchWord,
  pickGloss,
  prepare,
  senseAt,
  summary,
  type Bridge,
  type Entry,
} from './help.ts';

const fold = (s: string): string => s.toLowerCase();

test('settings: on and balanced by default; a level that does not exist is the default', () => {
  assert.deepEqual(bridgeSettings(null), { on: true, level: 'balanced' });
  assert.equal(bridgeSettings({ on: false, level: 'tap' }).level, 'tap');
  assert.equal(bridgeSettings({ on: false }).on, false);
  assert.equal(bridgeSettings({ level: 'loud' }).level, 'balanced');
});

test('a word: values set, functions of the old value, undefined removes, the time stamped', () => {
  const w1 = patchWord(undefined, { seen: n => (n ?? 0) + 1, known: 3 }, 5);
  assert.deepEqual(w1, { seen: 1, known: 3, at: 5 });
  const w2 = patchWord(w1, { known: undefined, seen: n => (n ?? 0) + 1 }, 9);
  assert.deepEqual(w2, { seen: 2, at: 9 });
  assert.ok(!('known' in w2));
});

test('the summary: a version that changes with the content, the counts', () => {
  const b: Bridge = {
    pack: 'p',
    native: 'ru',
    status: 'draft',
    coverage: 0.5,
    entries: [{ k: 'a' }],
    sections: { s1: { preview: 'x' }, s2: {} },
  };
  const s = summary(b, s => String(s.length), 7);
  assert.deepEqual(
    { ...s, v: undefined },
    { v: undefined, status: 'draft', coverage: 0.5, everyday: null, chapters: null, of: null, previews: 1, entries: 1, at: 7 },
  );
  assert.notEqual(summary({ ...b, entries: [{ k: 'abc' }] }, s => String(s.length), 7).v, s.v);
});

test('the languages: the pack’s own, and the one read (a translation when the subject has a sourceLanguage)', () => {
  assert.deepEqual(langsOf({ language: 'el-GR' }, { subject: { language: 'el' } }), { own: 'el', src: 'el' });
  assert.deepEqual(langsOf({ language: 'fr', sourceLanguage: 'en' }, { subject: { language: 'en' } }), { own: 'en', src: 'fr' });
  assert.deepEqual(langsOf({ language: 'en', contentLang: 'de' }, null), { own: 'en', src: 'de' });
});

test('a gloss: the first sense, without brackets, short', () => {
  assert.equal(gloss('снимок (данных); слепок'), 'снимок');
  assert.equal(gloss('x'.repeat(40)).length, 26);
  assert.equal(gloss(null), '');
});

test('the sense of a match: the anchor of its place, else the sense of its form, else the first', () => {
  const e: Entry = {
    k: 'order',
    senses: [
      { id: '1', t: 'заказ' },
      { id: '2', t: 'порядок', forms: ['orders'] },
    ],
  };
  const p = prepare({ pack: 'p', native: 'ru', entries: [e], anchors: [{ at: 's1/b2', k: 'order', sense: '2', quote: 'arrival order' }] });
  const text = 'the arrival order matters';
  assert.equal(senseAt(p, e, { blockText: text, bid: 'b2', offset: text.indexOf('order'), form: 'order' }, 's1', fold)?.id, '2');
  assert.equal(senseAt(p, e, { blockText: 'an order', bid: 'b2', offset: 3, form: 'order' }, 's1', fold)?.id, '1');
  assert.equal(senseAt(p, e, { blockText: 'the orders', bid: 'b9', offset: 4, form: 'Orders' }, 's9', fold)?.id, '2');
});

test('which word gets a gloss: by level, first time only, never known, faded after FADE sections', () => {
  const entry: Entry = { k: 'snapshot', band: 3 },
    sense = { id: '1', t: 'снимок' };
  const o = {
    entry,
    sense,
    word: undefined,
    level: 'balanced' as const,
    first: true,
    keyTerm: false,
    native: 'ru',
    form: 'snapshot',
    now: 0,
    fold,
  };
  assert.deepEqual(pickGloss(o), { sense: '1', gloss: 'снимок', glossLang: 'ru', cls: null });
  assert.equal(pickGloss({ ...o, level: 'tap' }).gloss, undefined);
  assert.equal(pickGloss({ ...o, first: false }).gloss, undefined);
  assert.deepEqual(pickGloss({ ...o, word: { known: 3 } }), { sense: '1', cls: 'nw-known' });
  assert.equal(pickGloss({ ...o, entry: { k: 'data', band: 2 } }).gloss, undefined, 'balanced: band 2 is not glossed');
  assert.equal(pickGloss({ ...o, entry: { k: 'data', band: 2 }, level: 'open' }).gloss, 'снимок', 'open: band 2 is');
  assert.equal(pickGloss({ ...o, word: { seen: FADE } }).gloss, undefined, 'faded');
  assert.equal(pickGloss({ ...o, word: { seen: FADE, look: 1, lookAt: 0 }, now: 1000 }).gloss, 'снимок', 'a recent look-up keeps it');
  assert.equal(pickGloss({ ...o, sense: { id: '1', t: 'Snapshot' } }).gloss, undefined, 'a gloss that is the word itself');
});

test('the badge: the learner’s language first; weak when every bridge is a draft or partial', () => {
  assert.equal(badge({}, 'ru'), null);
  const b = badge({ ar: { status: 'reviewed', coverage: 1 }, ru: { status: 'draft' } }, 'ru');
  assert.deepEqual(b?.codes, ['ru', 'ar']);
  assert.equal(b.weak, false);
  assert.deepEqual(
    b.langs.map(l => l.kind),
    ['draft', 'reviewed'],
  );
  assert.equal(badge({ ar: { status: 'reviewed', coverage: 0.4 } }, 'ru')?.langs[0]?.kind, 'partial');
  assert.equal(badge({ ar: { status: 'reviewed', coverage: 0.4 } }, 'ru')?.weak, true);
});
