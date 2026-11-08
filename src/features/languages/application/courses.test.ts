/* The language courses of a profile before any course is loaded (D21, D25, D29): the domain's rules and the service over
   the device's keys (the ones engine/loader.js and the course runtime write). */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ok } from '../../../kernel/result.ts';
import type { Clock } from '../../../ports/clock.ts';
import type { KeyValueStore } from '../../../ports/storage.ts';
import { chosenLangs, courseFor, courseProgress, langDay, listCourses, offeredLangs, studiesAny } from '../domain/courses.ts';
import { coursesService } from './courses.ts';

const LIB = [
  { id: 'poly', title: 'Polyglot', languages: ['de', 'el', 'ar'], words: { de: 10, el: 10, ar: 20 } },
  { id: 'zh', title: 'Chinese', languages: ['zh'] },
];

describe('domain', () => {
  test('the library first, then the learner own courses (origin account, an id once), with the languages a package added', () => {
    const own = [
      { id: 'mine', title: 'Mine', languages: ['fr'], origin: 'account' },
      { id: 'poly', title: 'Copy', languages: ['ru'], origin: 'account' },
      { id: 'draft', title: 'Draft', languages: ['it'] },
    ];
    const cs = listCourses(LIB, own, id => (id === 'poly' ? ['ru', 'de'] : []));
    assert.deepEqual(
      cs.map(c => [c.courseId, c.languages.join(), c.account]),
      [
        ['poly', 'de,el,ar,ru', false],
        ['zh', 'zh', false],
        ['mine', 'fr', true],
      ],
    );
    assert.deepEqual(
      offeredLangs(cs).map(o => o.code + ':' + o.courses.join('+')),
      ['de:poly', 'el:poly', 'ar:poly', 'ru:poly', 'zh:zh', 'fr:mine'],
    );
  });
  test('the languages studied in a course: the app answer it has, else its own setting, else all', () => {
    const c = { languages: ['de', 'el', 'ar'] };
    assert.deepEqual(chosenLangs(c, ['el', 'zh'], ['de']), ['el']);
    assert.deepEqual(chosenLangs(c, ['zh'], ['de', 'xx']), ['de']);
    assert.deepEqual(chosenLangs(c, null, null), ['de', 'el', 'ar']);
    assert.ok(studiesAny(c, null) && studiesAny(c, ['ar']) && !studiesAny(c, ['zh']));
  });
  test('progress: words met and reviews due per language studied, from the stored records', () => {
    const course = listCourses(LIB, [], () => [])[0],
      day = 100;
    assert.ok(course);
    const p = courseProgress(
      course,
      ['de', 'el'],
      [
        ['lang:de:node:a', { items: { w1: { r: { due: 99 } }, w2: { p: { due: 101 } } } }],
        ['lang:el:script', { items: { s1: { r: { due: 100 } } } }],
        ['lang:ar:node:a', { items: { w: { r: { due: 1 } } } }],
        ['lang:de:other', { items: { w: {} } }],
      ],
      day,
      { next: { title: 'Lesson 2' } },
    );
    assert.equal(p.words, 2); // the script is not words; ar is not studied
    assert.equal(p.due, 2);
    assert.equal(p.total, 20);
    assert.equal(p.pct, 0.1);
    assert.ok(p.started);
    assert.equal(p.sum?.next?.title, 'Lesson 2');
  });
  test('the course of a language: the one last open that teaches it, else the first; the local day', () => {
    const cs = listCourses([...LIB, { id: 'de2', title: 'German', languages: ['de'] }], [], () => []);
    const all = (c: { languages: readonly string[] }): string[] => [...c.languages];
    assert.equal(courseFor('de', cs, all, null)?.courseId, 'poly');
    assert.equal(courseFor('de', cs, all, 'de2')?.courseId, 'de2');
    assert.equal(courseFor('xx', cs, all, null), null);
    assert.equal(langDay(864e5 * 3 - 60000, -120), 3); // UTC+2: a minute before midnight UTC is already the next day
  });
});

/** a key-value store in a Map, and a clock that stands still (the service reads only now()) */
function mapKv(): KeyValueStore {
  const m = new Map<string, string>();
  return {
    get: k => ok(m.get(k) ?? null),
    set: (k, v) => {
      m.set(k, v);
      return ok(undefined);
    },
    delete: k => {
      m.delete(k);
      return ok(undefined);
    },
    keys: (p = '') => ok([...m.keys()].filter(k => k.startsWith(p))),
  };
}
const NOW = Date.UTC(2026, 10, 7, 10);
const clock = { now: () => NOW } as unknown as Clock;

describe('the service over the device keys', () => {
  const make = () => {
    const st = { kv: mapKv() },
      written: unknown[] = [];
    const svc = coursesService({
      kv: st.kv,
      clock,
      library: () => LIB,
      putSettings: (acc, patch) => {
        written.push([acc, patch]);
        st.kv.set(`noema1:${acc}:a:settings`, JSON.stringify(patch));
      },
    });
    return { kv: st.kv, svc, written };
  };
  test('the answer is written through the settings writer; Today follows the course the learner was in', () => {
    const { kv, svc, written } = make();
    kv.set('noema1:anr:a:langcourse:mine', JSON.stringify({ id: 'mine', title: 'Mine', languages: ['fr'], origin: 'account' }));
    kv.set('noema1:anr:a:langpack:mine:it', JSON.stringify({ code: 'it' }));
    kv.set('noema1:anr:a:settings', 'not json');
    assert.equal(svc.study('anr'), null);
    assert.deepEqual(
      svc.courses('anr').map(c => c.courseId + ':' + c.languages.join()),
      ['poly:de,el,ar', 'zh:zh', 'mine:fr,it'],
    );
    assert.deepEqual(svc.setStudy('anr', ['el', 'el', 'fr']), ['el', 'fr']);
    assert.deepEqual(written, [['anr', { studyLangs: ['el', 'fr'] }]]);
    assert.deepEqual(svc.study('anr'), ['el', 'fr']);
    assert.equal(svc.today('anr')?.courseId, 'poly');
    assert.equal(svc.today('anr', { lead: true }), null);
    assert.equal(svc.today('anr', { lead: true, current: 'lang:mine' })?.courseId, 'mine');
    svc.setLast('anr', 'mine');
    assert.equal(svc.last('anr'), 'mine');
    assert.equal(svc.today('anr', { lead: true })?.courseId, 'mine');
    assert.equal(svc.courseFor('anr', 'el')?.courseId, 'poly');
    assert.equal(svc.courseFor('anr', 'zh')?.courseId, 'zh'); // a course with none of the chosen languages teaches its own
  });
  test('progress reads the stored records of the course; a course opens on a language', () => {
    const { kv, svc } = make();
    const day = Math.floor(NOW / 864e5);
    kv.set('noema1:anr:s:lang:poly:lang:de:node:x', JSON.stringify({ items: { a: { r: { due: day } }, b: {} } }));
    kv.set('noema1:anr:meta:langsum', JSON.stringify({ poly: { next: { step: '2', title: 'Food' } } }));
    const poly = svc.course('anr', 'poly');
    assert.ok(poly);
    const p = svc.progress('anr', poly);
    assert.equal(p.words, 2);
    assert.equal(p.due, 1);
    assert.equal(p.sum?.next?.step, '2');
    svc.setCourseLang('anr', 'poly', 'el');
    const r = kv.get('noema1:anr:s:lang:poly:prefs');
    assert.ok(r.ok);
    assert.deepEqual(JSON.parse(r.value ?? ''), { lang: 'el' });
  });
});
