/* The Roadmap screens in a DOM (happy-dom): where the map puts the steps (level bands, the treasure map), the map in its
   three drawings with the selected step, a step's preparation (here, in the Claude app, its review, the placement test,
   locked), the library and its invitations, sharing, the Claude app's inbox, preparing ahead and From your sources —
   what they show, what they ask of the data port, the events they fire. In a real browser: tests/curriculum*.js. */
import '../../../../ui/test/dom.ts';
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import { defineUi } from '../../../../ui/index.ts';
import type { Roadmap } from '../../domain/model.ts';
import { defineRoadmapsUi, mapColumns, NoemaRoadmapShare, openDialog, treasureLayout } from '../index.ts';
import type { NoemaRoadmapFromSources } from '../from-sources.ts';
import type { NoemaRoadmapMap } from '../map.ts';
import { cleanup, fakeData, host } from './fixtures.ts';
import { click, events, find, findAll, flush, text, type } from './query.ts';

defineUi();
defineRoadmapsUi();
afterEach(cleanup);

/** a → b → c → d: a prerequisite, the goal's two steps, an application; levels y1 (a, b), y2 (c), d without one */
function course(o: { levels?: boolean; provider?: string } = {}): Roadmap {
  return {
    id: 'r2',
    title: 'Genetics',
    goal: 'Genetics',
    language: 'en',
    provider: o.provider ?? 'auto',
    status: 'ready',
    ...(o.levels
      ? {
          levels: [
            { id: 'y1', kind: 'year', order: 1, names: { en: 'First year' } },
            { id: 'y2', kind: 'year', order: 2, names: { en: 'Second year' } },
          ],
        }
      : {}),
    nodes: {
      a: {
        id: 'a',
        title: 'Cells',
        role: 'foundation',
        part: 'prereq',
        ...(o.levels ? { level: 'y1' } : {}),
        pack: { id: 'p-a', status: 'ready' },
      },
      b: {
        id: 'b',
        title: 'Genes',
        role: 'intro',
        part: 'core',
        ...(o.levels ? { level: 'y1' } : {}),
        chapters: [{ title: 'DNA', goals: ['explain DNA'], coverage: ['bases'] }],
        learningGoals: ['read a gene'],
      },
      c: { id: 'c', title: 'Inheritance', role: 'synthesis', part: 'core', ...(o.levels ? { level: 'y2' } : {}) },
      d: { id: 'd', title: 'Breeding', role: 'application', part: 'apps' },
    },
    edges: [
      { from: 'a', to: 'b' },
      { from: 'b', to: 'c' },
      { from: 'c', to: 'd' },
    ],
  } as unknown as Roadmap;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]>): HTMLElementTagNameMap[K] =>
  Object.assign(document.createElement(tag), props);

describe('where the steps go', () => {
  test('without a ladder: the domain layout, the three parts, no level bands', () => {
    const m = mapColumns(course());
    assert.deepEqual(m.cols, [['a'], ['b'], ['c'], ['d']]);
    assert.deepEqual(m.bands, []);
    assert.deepEqual(m.parts.prereq, [0, 0]);
  });
  test('with a ladder: each level in columns of its own, the steps without a level with their latest prerequisite', () => {
    const c = course({ levels: true });
    // b is a prerequisite of c, and both sit at the same column depth: the band of y2 starts after y1 ends
    const m = mapColumns(c);
    assert.deepEqual(
      m.bands.map(b => [b.level, b.from, b.to]),
      [
        ['y1', 0, 1],
        ['y2', 2, 3],
      ],
    );
    assert.equal(m.cols.flat().length, 4, 'every step is drawn once');
    for (const e of c.edges) {
      const at = (id: string): number => m.cols.findIndex(cl => cl.includes(id));
      assert.ok(at(e.from) < at(e.to), `the link ${e.from} → ${e.to} runs forwards`);
    }
  });
  test('the treasure map: layers from the start up, the treasure on top, station codes, level bands', () => {
    const t = treasureLayout(course({ levels: true }));
    assert.equal(t.layers[t.layers.length - 1]?.[0], '⚑treasure');
    assert.ok(t.Y('a') > t.Y('d'), 'the start is at the bottom');
    assert.deepEqual(Object.keys(t.code).sort(), ['a', 'b', 'c', 'd']);
    assert.equal(t.code['a'], '1');
    assert.equal(t.bands.length, 2);
    assert.ok(
      t.E.some(ch => ch[0] === 'd' && ch[ch.length - 1] === '⚑treasure'),
      'the last step leads to the treasure',
    );
  });
});

describe('the map', () => {
  test('the classic map: the steps with their state, the level bands, a step selected shows its panel', async () => {
    const d = fakeData(course({ levels: true }));
    d.masteredIds.add('a');
    host(d).append(el('noema-roadmap-map', { account: 'u1', roadmapId: 'r2' }));
    await flush();
    const map = find('noema-roadmap-map') as NoemaRoadmapMap;
    assert.equal(findAll('.cm-node', map).length, 4);
    assert.ok(find('.cm-node[data-id="a"]', map)?.classList.contains('cm-mastered'));
    assert.ok(find('.cm-node[data-id="b"]', map)?.classList.contains('cm-open'));
    assert.ok(find('.cm-node[data-id="c"]', map)?.classList.contains('cm-locked'));
    assert.deepEqual(
      findAll('.cm-band.cm-level', map).map(b => b.dataset['level']),
      ['y1', 'y2'],
    );
    assert.match(text(map), /Level · First year/);
    assert.match(find('.cm-node[data-id="b"] .cm-badges', map)?.textContent ?? '', /📝/, 'an open step not looked over: 📝');
    find('.cm-node[data-id="b"]', map)?.click();
    await flush();
    const panel = find('noema-roadmap-step', map);
    assert.ok(panel, 'the panel of the selected step');
    assert.match(text(panel), /Genes/);
    assert.ok(find('.cm-node[data-id="c"]', map)?.classList.contains('sel') === false);
    assert.ok(find('.cm-node[data-id="d"]', map)?.classList.contains('dim'), 'the steps not linked to it are dimmed');
  });

  test('without a ladder: the three parts; the list in study order; the treasure map with its stations', async () => {
    const d = fakeData(course());
    host(d).append(el('noema-roadmap-map', { account: 'u1', roadmapId: 'r2' }));
    await flush();
    const map = find('noema-roadmap-map') as NoemaRoadmapMap;
    assert.equal(findAll('.cm-band', map).length, 3);
    click('.cm-vbtn[data-list="true"]', map);
    await flush();
    assert.deepEqual(
      findAll('.cm-listnode', map).map(b => b.dataset['id']),
      ['a', 'b', 'c', 'd'],
    );
    map.view = 'treasure';
    await flush();
    assert.equal(findAll('.cm-st', map).length, 4);
    assert.match(text(map), /The treasure: Genetics/);
    assert.ok(find('.cm-st.cm-nextup .cm-hero', map), 'the learner’s character beside the next station');
  });

  test('▶ Next up lists the open steps; a live change redraws the map', async () => {
    const d = fakeData(course());
    host(d).append(el('noema-roadmap-map', { account: 'u1', roadmapId: 'r2' }));
    await flush();
    const map = find('noema-roadmap-map') as NoemaRoadmapMap;
    assert.match(text(find('.cm-nextdlg', map) as Element), /Cells/);
    d.masteredIds.add('a');
    d.change();
    await new Promise(r => setTimeout(r, 450));
    await flush();
    assert.ok(find('.cm-node[data-id="a"]', map)?.classList.contains('cm-mastered'), 'redrawn after the change');
  });

  test('the Claude app’s bar: what waits, the message copied', async () => {
    const c = course({ provider: 'claudeapp' });
    (c.nodes['c'] as { pack?: unknown }).pack = { status: 'app', queuedAt: '2026-11-08T08:00:00Z' };
    const d = fakeData(c);
    host(d).append(el('noema-roadmap-map', { account: 'u1', roadmapId: 'r2' }));
    await flush();
    const map = find('noema-roadmap-map') as NoemaRoadmapMap;
    assert.match(text(find('.cm-appbar', map) as Element), /1 to prepare/);
    const got = events('roadmap-show-app');
    click('.cm-appbar .cm-copymsg', map);
    click('.cm-appbar .cm-howbyhand', map);
    await flush();
    assert.deepEqual(d.copied, ['MESSAGE x1']);
    assert.equal(got.length, 1);
  });
});

describe('a step and its preparation', () => {
  const step = async (c: Roadmap, id: string, mastered: string[] = []): Promise<{ d: ReturnType<typeof fakeData>; s: HTMLElement }> => {
    const d = fakeData(c);
    mastered.forEach(m => d.masteredIds.add(m));
    host(d).append(el('noema-roadmap-step', { account: 'u1', roadmapId: c.id, step: id }));
    await flush();
    return { d, s: find('noema-roadmap-step') as HTMLElement };
  };

  test('open, not looked over: 📝 Review & prepare asks for the review; its chapters open their goals', async () => {
    const { s } = await step(course(), 'b', ['a']);
    const got = events('roadmap-edit-step');
    click('.cm-reviewprep', s);
    assert.deepEqual(got[0]?.detail, { step: 'b', mode: 'review' });
    assert.match(text(s), /read a gene/);
    find('.cm-chapters li', s)?.click();
    await flush();
    assert.match(text(s), /explain DNA/);
  });

  test('open and looked over: ⚡ Prepare it now (here), its other ways (the Claude app)', async () => {
    const c = course();
    c.nodes['b'] = { ...c.nodes['b'], reviewed: '2026-11-08' } as Roadmap['nodes'][string];
    const { d, s } = await step(c, 'b', ['a']);
    click('.cm-preparenow', s);
    await flush();
    assert.ok(d.calls.includes('request b'));
    assert.match(d.notes.join(' '), /Preparing “Genes”/);
    click('.cm-toapp', s);
    assert.ok(d.calls.includes('toApp b'));
  });

  test('being prepared: its progress and ⏸ Pause', async () => {
    const c = course();
    c.nodes['b'] = { ...c.nodes['b'], reviewed: 'x' } as Roadmap['nodes'][string];
    const d = fakeData(c);
    d.masteredIds.add('a');
    d.busyKey = 'r2/b';
    host(d).append(el('noema-roadmap-step', { account: 'u1', roadmapId: 'r2', step: 'b' }));
    await flush();
    const s = find('noema-roadmap-step') as HTMLElement;
    assert.match(text(s), /chapter 2 of 4/);
    click('.cm-actions noema-button', s);
    assert.ok(d.calls.includes('stop'));
  });

  test('queued for the Claude app: the message, ↩ Not now takes it out of the queue', async () => {
    const c = course({ provider: 'claudeapp' });
    c.nodes['b'] = { ...c.nodes['b'], pack: { status: 'app' } } as Roadmap['nodes'][string];
    const { d, s } = await step(c, 'b', ['a']);
    assert.match(text(s), /Waiting for your Claude app/);
    click('.cm-copymsg', s);
    click('.cm-unqueue', s);
    await flush();
    assert.deepEqual(d.copied, ['MESSAGE x1']);
    assert.ok(d.calls.includes('fromApp b'));
  });

  test('prepared: 📖 Study; 🎓 I already know this opens the placement test', async () => {
    const { s } = await step(course(), 'a');
    const got = events('roadmap-study');
    click('.cm-study', s);
    assert.deepEqual(got[0]?.detail, { step: 'a', subject: 'p-a' });
    click('.cm-knowit', s);
    await flush();
    assert.ok(document.querySelector('noema-roadmap-step-test'), 'the placement test opened');
  });

  test('locked: the steps to master first (a tap selects one), and it can be prepared to read ahead', async () => {
    const { d, s } = await step(course(), 'c');
    assert.match(text(s), /Locked\. Master these first/);
    const got = events('roadmap-select');
    find('.cm-prereqs a', s)?.click();
    assert.deepEqual(got[0]?.detail, { step: 'b' });
    click('.cm-readtheory', s);
    assert.ok(d.calls.includes('request c'));
  });

  test('mastered by its test: ↩ Undo', async () => {
    const c = course();
    const d = fakeData(c);
    d.masteredIds.add('a');
    d.statuses = (acc, cc) => {
      const st = fakeData(c).statuses(acc, cc);
      return { ...st, a: { ...st['a'], mastered: true, how: 'test' } as (typeof st)[string] };
    };
    host(d).append(el('noema-roadmap-step', { account: 'u1', roadmapId: 'r2', step: 'a' }));
    await flush();
    click('.cm-undo', find('noema-roadmap-step'));
    assert.ok(d.calls.includes('unmaster a'));
  });
});

describe('the library', () => {
  test('a card per Roadmap with its progress; the ways to a new one; the Shelf', async () => {
    const d = fakeData(course());
    d.masteredIds.add('a');
    host(d).append(el('noema-roadmap-library', { account: 'u1' }));
    await flush();
    const lib = find('noema-roadmap-library') as HTMLElement;
    assert.match(text(lib), /1\/4 mastered · 1 open · 1 prepared/);
    assert.match(text(lib), /Shelf \(3\)/);
    const got = events('roadmap-open', 'roadmap-new', 'roadmap-from-sources');
    find('.cm-card', lib)?.click();
    click('.cm-new', lib);
    click('.cm-srcbtn', lib);
    assert.deepEqual(
      got.map(e => e.type),
      ['roadmap-open', 'roadmap-new', 'roadmap-from-sources'],
    );
    assert.deepEqual(got[0]?.detail, { roadmap: 'r2', status: 'ready' });
  });

  test('📬 invitations (a cloud account): Join opens the Roadmap, No thanks declines it', async () => {
    const d = fakeData(course());
    d.cloud = true;
    d.invitesList = [
      { curriculum: 'x1', title: 'Botany', owner_name: 'Nora', steps: 12 },
      { curriculum: 'x2', title: 'Zoology' },
    ];
    host(d).append(el('noema-roadmap-library', { account: 'u1' }));
    await flush();
    const lib = find('noema-roadmap-library') as HTMLElement;
    assert.match(text(lib), /2 curricula shared with you/);
    assert.match(text(lib), /Nora invites you to the Roadmap “ ?Botany ?”/);
    const got = events('roadmap-open');
    click('.cm-join', find('noema-roadmap-invite'));
    await flush();
    assert.deepEqual(got[0]?.detail, { roadmap: 'x1', status: 'ready' });
    click('.cm-decline', findAll('noema-roadmap-invite')[1]);
    await flush();
    assert.ok(d.calls.includes('decline x2'));
  });
});

describe('sharing', () => {
  const open = async (d: ReturnType<typeof fakeData>): Promise<HTMLElement> => {
    host(d);
    openDialog(Object.assign(new NoemaRoadmapShare(), { account: 'u1', roadmapId: 'r2' }));
    await flush();
    return document.querySelector('noema-roadmap-share') as HTMLElement;
  };

  test('without a cloud account: it says so', async () => {
    const s = await open(fakeData(course()));
    assert.match(text(s), /Sharing needs a noema-lite cloud account/);
  });

  test('not shared yet: public, with the steps prepared; then invite someone, the people, stop sharing', async () => {
    const d = fakeData(course());
    d.cloud = true;
    d.membersList = [{ email: 'ann@x.org', name: 'Ann', status: 'joined' }];
    const s = await open(d);
    assert.match(text(s), /Include the 1 step you prepared already/);
    click('.cm-sharepublic', s);
    await flush();
    assert.ok(d.calls.includes('publish r2 true true'));
    assert.match(text(s), /Public — anyone can find it/);
    assert.match(text(s), /Ann/);
    type('.cm-email', 'bo@x.org', s);
    click('.cm-invitebtn', s);
    await flush();
    assert.ok(d.calls.includes('invite r2 bo@x.org '));
    assert.match(text(s), /Invited bo@x\.org/);
    click('.cm-removemember', s);
    await flush();
    assert.ok(d.calls.includes('removeMember ann@x.org false'));
    click('.cm-stopshare', s);
    await flush();
    click('.cm-stopyes', s);
    await flush();
    assert.ok(d.calls.includes('unpublish r2'));
  });
});

describe('the Claude app’s inbox', () => {
  test('what waits, the message (a few steps per chat), ⟳ check now; by hand: the task, an answer with problems, then accepted', async () => {
    const c = course({ provider: 'claudeapp' });
    c.nodes['b'] = { ...c.nodes['b'], pack: { status: 'app', queuedAt: '1' } } as Roadmap['nodes'][string];
    c.nodes['c'] = { ...c.nodes['c'], pack: { status: 'app', queuedAt: '2' } } as Roadmap['nodes'][string];
    const d = fakeData(c);
    d.task = { id: 't1', title: 'Prepare “Genes”', text: 'TASK TEXT', steps: ['b'] };
    host(d).append(el('noema-roadmap-inbox', { account: 'u1', roadmapId: 'r2' }));
    await flush();
    const ib = find('noema-roadmap-inbox') as HTMLElement;
    assert.match(text(ib), /2 steps to prepare/);
    click('.cm-copymsg', ib);
    click('.cm-checknow', ib);
    await flush();
    assert.deepEqual(d.copied, ['MESSAGE x1']);
    assert.ok(d.calls.includes('poll'));
    assert.match(d.notes.join(' '), /result/);
    click('.cm-copytask', ib);
    type('.cm-paste', 'not json', ib);
    click('.cm-usepaste', ib);
    await flush();
    assert.match(text(ib), /2 problem\(s\): not JSON · no steps/);
    type('.cm-paste', '{"ok":1}', ib);
    click('.cm-usepaste', ib);
    await flush();
    assert.match(text(ib), /Accepted — planned 2 steps/);
    click('.cm-bundle', ib);
    await flush();
    assert.ok(d.calls.includes('bundle b'));
  });

  test('nothing waiting: it says so', async () => {
    host(fakeData(course())).append(el('noema-roadmap-inbox', { account: 'u1', roadmapId: 'r2' }));
    await flush();
    assert.match(text(find('noema-roadmap-inbox') as Element), /Nothing is waiting for your Claude app/);
  });
});

describe('preparing ahead', () => {
  test('queue the steps not prepared yet, with the review; then the message to copy', async () => {
    const d = fakeData(course({ provider: 'claudeapp' }));
    host(d).append(el('noema-roadmap-prepare-ahead', { account: 'u1', roadmapId: 'r2' }));
    await flush();
    const pa = find('noema-roadmap-prepare-ahead') as HTMLElement;
    assert.match(text(pa), /all 3 steps not prepared yet/);
    click('.cm-queuemany', pa);
    await flush();
    assert.ok(d.calls.includes('queueMany all true'));
    assert.match(text(pa), /2 steps queued/);
    assert.match(text(pa), /1 wait for your review/);
    click('.cm-qcopy', pa);
    await flush();
    assert.deepEqual(d.copied, ['MESSAGE x1']);
  });
});

describe('From your sources', () => {
  test('files in, read without AI: the proposal with its reasons, flip the shape, make the Roadmap', async () => {
    const d = fakeData(course());
    host(d).append(el('noema-roadmap-from-sources', { account: 'u1' }));
    await flush();
    const fs = find('noema-roadmap-from-sources') as NoemaRoadmapFromSources;
    click('.cm-srcread', fs);
    await flush();
    assert.match(text(fs), /Add some material first/);
    await fs.addFiles([new File(['x'], 'a.pdf'), new File(['y'], 'b.pdf'), new File(['x'], 'a.pdf')]);
    await flush();
    assert.equal(findAll('.cm-srcfiles li', fs).length, 2, 'the same file once');
    fs.reader = 'estimate';
    click('.cm-srcread', fs);
    await flush();
    assert.ok(d.calls.includes('inventory 2') && d.calls.includes('estimate'));
    assert.match(text(fs), /A Roadmap · 2 steps/);
    assert.match(text(fs), /build on each other/);
    click('.cm-srcswitch', fs);
    await flush();
    assert.match(text(fs), /One subject · 1 chapter/);
    click('.cm-srcswitch', fs);
    await flush();
    const got = events('roadmap-made');
    click('.cm-srcgo', fs);
    await flush();
    assert.ok(d.calls.includes('makeRoadmap Cell biology claudeapp'));
    assert.deepEqual(got[0]?.detail, { roadmap: 'new1', next: 'app' });
  });

  test('read by the Claude app: copy the task, paste the answer', async () => {
    const d = fakeData(course());
    host(d).append(el('noema-roadmap-from-sources', { account: 'u1' }));
    await flush();
    const fs = find('noema-roadmap-from-sources') as NoemaRoadmapFromSources;
    assert.equal(fs.reader, 'app', 'without a key the Claude app reads it');
    await fs.addFiles([new File(['x'], 'a.pdf')]);
    click('.cm-srcread', fs);
    await flush();
    click('.cm-srccopytask', fs);
    await flush();
    assert.deepEqual(d.copied, ['TASK a.pdf']);
    type('.cm-srcanswer', 'no', fs);
    click('.cm-srcuse', fs);
    await flush();
    assert.match(text(fs), /1 problem\(s\): not JSON/);
    type('.cm-srcanswer', '{}', fs);
    click('.cm-srcuse', fs);
    await flush();
    assert.match(text(fs), /A Roadmap · 2 steps/);
  });
});
