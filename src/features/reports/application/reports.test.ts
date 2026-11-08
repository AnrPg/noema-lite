/// <reference types="node" />
/** ⚑ problem reports and requests for new engines: the brief and the repository's files, the checks of a request,
    sending (kept on the device while offline), the admins' check, the store of a profile without a cloud account. */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, existsSync, readFileSync } from 'node:fs';
import { NoemaError } from '../../../kernel/errors.ts';
import { err, ok, OK_VOID, type AsyncResult } from '../../../kernel/result.ts';
import type { Clock } from '../../../ports/clock.ts';
import type { KeyValueStore } from '../../../ports/storage.ts';
import type { EngineRequestServer, ReportRow, ReportServer } from '../../../ports/reports.ts';
import {
  cleanRequestPatch,
  componentsOf,
  normalizeRequest,
  repoFiles,
  reportBrief,
  reportRow,
  requestBrief,
  type Locator,
} from '../domain/index.ts';
import { engineRequestService, localKey } from './engine-requests.ts';
import { OUTBOX_KEY, reportService } from './reports.ts';

function mapKv(fullAbove = Infinity): KeyValueStore & { readonly map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    get: k => ok(map.get(k) ?? null),
    set: (k, v) => {
      if (v.length > fullAbove) return err(new NoemaError('storage.quota', 'full'));
      map.set(k, v);
      return OK_VOID;
    },
    delete: k => {
      map.delete(k);
      return OK_VOID;
    },
    keys: (p = '') => ok([...map.keys()].filter(k => k.startsWith(p))),
  };
}
const I18N = new URL('../../../../i18n/', import.meta.url);

const LOC: Locator = {
  route: { hash: '#/s/ch01-s01', page: 's' },
  app: { version: '1.0.0', commit: 'abc123def4567890', url: 'https://noema-lite.netlify.app/' },
  subject: {
    id: 'demo-physics',
    title: 'Demo Physics',
    origin: 'library',
    version: 'v1',
    translation: 'fr',
    packLanguage: 'en',
    shown: 'fr',
  },
  item: {
    chapter: { id: 'ch01', num: 1, title: 'Énergie' },
    section: { id: 'ch01-s01', title: 'Énergie cinétique' },
    exercise: { id: 'ch01-e003', type: 'mcq', q: 'Quelle…', qOwn: 'Which…' },
    field: { path: 'options.2', shown: '8 J', own: '8 J' },
    content: { packLanguage: 'en', shown: 'fr', translation: 'fr' },
  },
  target: {
    picked: true,
    text: '8 J',
    selector: 'div.ex > button.opt',
    data: [{ nf: 'options.2' }, { ex: 'ch01-e003', ch: 'ch01' }],
    i18n: [],
  },
  ui: { locale: 'fr' },
  itemRef: 'ex:ch01-e003',
};

describe('the brief and the files', () => {
  test('a library pack read in French: the French translation first, then the chapter', () => {
    const files = repoFiles({ ...LOC, kind: 'content' }).map(f => f.path);
    assert.deepEqual(files.slice(0, 2), [
      'library/subjects/demo-physics/translations/fr/ch01.json',
      'library/subjects/demo-physics/chapters/ch01.json',
    ]);
  });
  test('the brief: the item, its type, the field, that it was a translation, the build, the learner’s words', () => {
    const b = reportBrief({
      id: 'r1',
      kind: 'content',
      status: 'new',
      note: 'Option C should be 9 J',
      item: 'ex:ch01-e003',
      route: '#/s/ch01-s01',
      locator: LOC,
    });
    for (const re of [
      /Item id:\*\* ex:ch01-e003/,
      /`ch01-e003` type `mcq`/,
      /Field:\*\* `options\.2`/,
      /TRANSLATION of the pack’s en/,
      /commit abc123/,
      /> Option C should be 9 J/,
    ])
      assert.match(b, re);
    assert.match(reportBrief({ kind: 'idea' }), /nothing — see the screenshot/);
  });
  test('an interface text: its component’s catalogs; a language course: its folder; a drawn screen: its code', () => {
    const ui = repoFiles({
      route: { page: '' },
      target: {
        i18n: [
          { key: 'sh.vault', locale: 'el' },
          { key: 'roadmap.x', locale: 'en' },
        ],
      },
    }).map(f => f.path);
    for (const p of ['i18n/shell/en.arb', 'i18n/shell/el.arb', 'i18n/roadmaps/en.arb', 'i18n/roadmaps-map/en.arb'])
      assert.ok(ui.includes(p), p);
    assert.equal(
      repoFiles({ route: { page: 'lang' }, lang: { course: 'polyglot-semitic-zh-de' } })[0]?.path,
      'library/languages/polyglot-semitic-zh-de/',
    );
    assert.deepEqual(
      repoFiles({ route: { page: 'vault' }, kind: 'display' }).map(f => f.path),
      ['src/features/vault/ui/page.ts'],
    );
  });
  test('every catalog key’s prefix leads to its component (i18n/<component>/en.arb)', () => {
    const bad: string[] = [];
    for (const c of readdirSync(I18N).filter(d => existsSync(new URL(d + '/en.arb', I18N))))
      for (const k of Object.keys(JSON.parse(readFileSync(new URL(c + '/en.arb', I18N), 'utf8')) as object).filter(k => !k.startsWith('@')))
        if (!componentsOf(k).includes(c)) bad.push(c + ':' + k);
    assert.deepEqual(bad.slice(0, 5), []);
  });
  test('a report as sent: clipped, the build with a short commit', () => {
    const r = reportRow('id1', { ...LOC, route: { hash: '#/' + 'x'.repeat(700) } }, 'content', '  a   b  ', null);
    assert.equal(r.note, 'a b');
    assert.equal(r.route?.length, 601, '600 and the ellipsis');
    assert.equal(r.app_version, '1.0.0+abc123def456');
    assert.equal(r.shot, null);
  });
});

const W =
  'Chemical equilibrium of a reversible reaction: the learner changes temperature, pressure and concentrations and sees the equilibrium shift (Le Chatelier), with K from ΔG = −RT ln K.';
const codes = (x: { problems: { field: string; code: string }[] }): string => x.problems.map(p => p.field + ':' + p.code).join();

describe('a request for a new engine', () => {
  test('required, too short, too long, an accuracy that is not one of the three', () => {
    assert.equal(codes(normalizeRequest({})), 'title:missing,what:missing');
    const n = normalizeRequest({ title: 'abc', what: 'too short', accuracy: 'exact' });
    assert.equal(codes(n), 'title:short,what:short,accuracy:value');
    assert.equal(n.row.accuracy, 'teaching');
    const l = normalizeRequest({ title: 'x'.repeat(121), what: W });
    assert.equal(codes(l), 'title:long');
    assert.equal(l.row.title?.length, 120);
  });
  test('a good request: trimmed, nothing but its own fields; the catalogue suggests', () => {
    const n = normalizeRequest(
      {
        title: '  Chemical equilibrium ',
        what: W,
        accuracy: 'quantitative',
        subject: 'demo-physics',
        via: 'claude',
        locale: 'el',
        extra: 'x',
        status: 'available',
      },
      t => (t.includes('equilibrium') ? [{ id: 'formula@1' }] : []),
    );
    assert.equal(codes(n), '');
    assert.equal(n.row.title, 'Chemical equilibrium');
    assert.deepEqual([n.row.accuracy, n.row.via, n.row.locale, n.row.subject], ['quantitative', 'claude', 'el', 'demo-physics']);
    assert.ok(!('extra' in n.row) && !('status' in n.row));
    assert.deepEqual(n.row.suggested, ['formula@1']);
    assert.deepEqual(normalizeRequest({ title: 'Chemical', what: W, subject: 'bad id!', locale: 'xx-yyyyyy' }).row.subject, null);
  });
  test('an admin’s patch: only status, engine_id, answer, fixed_in, checked', () => {
    assert.ok('error' in cleanRequestPatch({ status: 'done' }));
    assert.ok('error' in cleanRequestPatch({ engine_id: 'Chem' }));
    assert.deepEqual(cleanRequestPatch({ status: 'available', engine_id: ' chem@1 ', answer: 'ok', fixed_in: 'PR 1', title: 'no' }), {
      status: 'available',
      engine_id: 'chem@1',
      answer: 'ok',
      fixed_in: 'PR 1',
    });
    assert.deepEqual(cleanRequestPatch({ engine_id: '', answer: '' }), { engine_id: null, answer: null });
  });
  test('the brief: the request, what the library may already do, how to build it', () => {
    const b = requestBrief({
      id: 'r1',
      title: 'Chemical equilibrium',
      what: W,
      accuracy: 'research',
      suggested: ['formula@1'],
      status: 'new',
      via: 'app',
      locale: 'de',
    });
    for (const re of [
      /^# Engine request: Chemical equilibrium/,
      /accuracy wanted: research/,
      /formula@1 \(check these first/,
      /## What should be simulated/,
      /INTERACTIVE_LIBRARY\.md §1/,
    ])
      assert.match(b, re);
    assert.doesNotMatch(b, /## Sources/);
  });
});

const clock = { now: () => Date.UTC(2026, 10, 8) } as unknown as Clock;
const offline = (): AsyncResult<never> => Promise.resolve(err(new NoemaError('cloud.network', 'offline')));
function reportServer(over: Partial<ReportServer> = {}): ReportServer & { readonly sent: ReportRow[] } {
  const sent: ReportRow[] = [];
  return {
    sent,
    uid: () => 'me',
    isAdmin: () => Promise.resolve(ok(true)),
    send: r => {
      sent.push(r);
      return Promise.resolve(OK_VOID);
    },
    list: () => Promise.resolve(ok([])),
    one: () => Promise.resolve(ok(null)),
    newCount: () => Promise.resolve(ok(3)),
    save: () => Promise.resolve(OK_VOID),
    remove: () => Promise.resolve(OK_VOID),
    ...over,
  };
}

describe('sending a report', () => {
  const row = (id: string): ReportRow => reportRow(id, LOC, 'content', 'x', 'data:image/png;base64,AAAA');
  test('sent; offline it waits on this device (the last three) and goes when the app is back', async () => {
    assert.deepEqual(await reportService({ server: reportServer(), kv: mapKv() }).send(row('a')), ok('sent'));
    const kv = mapKv();
    const down = reportService({ server: reportServer({ send: offline }), kv });
    for (const id of ['1', '2', '3', '4']) assert.deepEqual(await down.send(row(id)), ok('queued'));
    assert.deepEqual(
      down.outbox().map(r => r.id),
      ['2', '3', '4'],
    );
    const up = reportServer();
    assert.deepEqual(await reportService({ server: up, kv }).flush(), ok(3));
    assert.deepEqual(
      up.sent.map(r => r.id),
      ['2', '3', '4'],
    );
    assert.equal(kv.map.get(OUTBOX_KEY), '[]');
  });
  test('a refusal is the caller’s to show, never kept; a full storage keeps the words without the pictures', async () => {
    const no = reportService({
      server: reportServer({ send: () => Promise.resolve(err(new NoemaError('cloud.permission', 'no'))) }),
      kv: mapKv(),
    });
    const r = await no.send(row('x'));
    assert.equal(!r.ok && r.error.code, 'cloud.permission');
    assert.deepEqual(no.outbox(), []);
    const small = reportService({ server: reportServer({ send: offline }), kv: mapKv(4000) });
    await small.send(reportRow('y', LOC, 'content', 'x', 'data:image/png;base64,' + 'A'.repeat(5000)));
    assert.equal(small.outbox()[0]?.shot, null);
  });
  test('the admins’ side: the check asked once, the count as no news when it cannot be read, the filters', async () => {
    let asked = 0;
    const lists: (readonly string[] | null)[] = [];
    const s = reportService({
      server: reportServer({
        isAdmin: () => {
          asked++;
          return Promise.resolve(ok(true));
        },
        newCount: offline,
        list: st => {
          lists.push(st);
          return Promise.resolve(ok([]));
        },
      }),
      kv: mapKv(),
    });
    await s.isAdmin();
    await s.isAdmin();
    assert.equal(asked, 1);
    assert.deepEqual(await s.newCount(), ok(0));
    await s.list('open');
    await s.list('all');
    await s.list('fixed');
    assert.deepEqual(lists, [['new', 'seen', 'fixing'], null, ['fixed']]);
  });
});

describe('where the requests are kept', () => {
  const server: EngineRequestServer = {
    uid: () => 'me',
    isAdmin: () => Promise.resolve(ok(false)),
    submit: r => Promise.resolve(ok({ ...r, id: 'srv' })),
    mine: () => Promise.resolve(ok([])),
    all: () => Promise.resolve(ok([])),
    update: () => Promise.resolve(OK_VOID),
  };
  test('no cloud account: this device, newest first, the last hundred', async () => {
    const kv = mapKv();
    let n = 0;
    const svc = engineRequestService({ server, kv, clock, newId: () => `r${n++}`, suggest: null });
    const st = svc.store({ kind: 'local', id: 'p1' });
    assert.equal(st.kind, 'local');
    const r = await st.submit(svc.normalize({ title: 'Chemical equilibrium', what: W }).row);
    assert.ok(r.ok && r.value.id === 'r0' && r.value.status === 'new' && r.value.created_at === '2026-11-08T00:00:00.000Z');
    for (let i = 0; i < 120; i++) await st.submit(svc.normalize({ title: 'Chemical equilibrium', what: W }).row);
    const mine = await st.mine();
    assert.ok(mine.ok && mine.value.length === 100 && mine.value[0]?.id === 'r120');
    assert.deepEqual([...kv.map.keys()], [localKey('p1')]);
    assert.deepEqual(await st.isAdmin(), ok(false));
    assert.equal(svc.store(null).kind, 'local');
  });
  test('a signed-in cloud account: the cloud', async () => {
    const svc = engineRequestService({ server, kv: mapKv(), clock, newId: () => 'x', suggest: null });
    const st = svc.store({ kind: 'cloud', id: 'u1' });
    assert.equal(st.kind, 'cloud');
    const r = await st.submit(svc.normalize({ title: 'Chemical equilibrium', what: W }).row);
    assert.ok(r.ok && r.value.id === 'srv');
  });
});
