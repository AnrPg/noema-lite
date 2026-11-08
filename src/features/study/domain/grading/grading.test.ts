/// <reference types="node" />
/* Exercise grading: each type's rules (the same verdicts the screens of engine/src gave), and a sweep over every exercise
   of the library and the test fixtures: the right answer, built from the exercise itself, is graded right; a wrong one
   wrong; an empty one incomplete. */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GRADED_TYPES, gradeExercise, type Answer, type Exercise, type Grade, type GradeContext } from './grade.ts';
import { hits, targetsOf, type Region } from './regions.ts';
import { clozeBlanks, labelMatch, levenshtein, missingKeywords, norm, str } from './text.ts';

const ROOT = path.resolve(import.meta.dirname, '../../../../..');
const verdict = (g: ReturnType<typeof gradeExercise>): boolean | null => {
  if (!g.ok) throw g.error;
  return g.value.status === 'incomplete' ? null : g.value.ok;
};
const grade = (ex: Exercise, a: Answer, ctx?: GradeContext): boolean | null => verdict(gradeExercise(ex, a, ctx));
const detail = (ex: Exercise, a: Answer, ctx?: GradeContext): Grade => {
  const g = gradeExercise(ex, a, ctx);
  if (!g.ok) throw g.error;
  return g.value;
};

test('text: the normal form, typos, keywords, cloze blanks', () => {
  assert.equal(norm('  SELECT   *  FROM t; '), 'select * from t');
  assert.equal(norm('‘a’ “b”'), `'a' "b"`);
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.deepEqual(labelMatch('Turbine', [], 'turbin'), { ok: true, typo: true });
  assert.deepEqual(labelMatch('Turbine', ['rotor'], 'Rotor'), { ok: true });
  assert.deepEqual(labelMatch('Turbine', [], 'turbin', false), { ok: false });
  assert.deepEqual(labelMatch('Fan', [], 'fun'), { ok: false });
  assert.deepEqual(missingKeywords(['GROUP BY', 'count('], 'select count(*) from t group   by x'), []);
  assert.deepEqual(clozeBlanks('a [[x|y ]] b [[z]]'), [['x', 'y'], ['z']]);
});

test('regions: rectangles, circles, polygons; targets in their order', () => {
  const R: Region[] = [
    { id: 'a', x: 0, y: 0, w: 10, h: 10 },
    { id: 'b', shape: 'circle', cx: 50, cy: 50, r: 5 },
    {
      id: 'c',
      shape: 'poly',
      points: [
        [0, 20],
        [10, 20],
        [5, 30],
      ],
    },
  ];
  assert.ok(hits(R[0] as Region, 5, 5) && !hits(R[0] as Region, 11, 5));
  assert.ok(hits(R[1] as Region, 53, 53) && !hits(R[1] as Region, 56, 50));
  assert.ok(hits(R[2] as Region, 5, 25) && !hits(R[2] as Region, 1, 29));
  assert.deepEqual(
    targetsOf(['c', 'x', 'a'], R).map(r => r.id),
    ['c', 'a'],
  );
  assert.equal(targetsOf(undefined, R).length, 3);
});

test('choices: single and several right options, odd one out, predict with options', () => {
  const one: Exercise = { type: 'mcq', options: ['a', 'b', 'c'], answer: 1 };
  assert.equal(grade(one, { picked: [] }), null);
  assert.equal(grade(one, { picked: [1] }), true);
  assert.equal(grade(one, { picked: [0] }), false);
  const multi: Exercise = { type: 'mcq', options: ['a', 'b', 'c'], answer: [0, 2] };
  assert.equal(grade(multi, { picked: [2, 0] }), true);
  assert.equal(grade(multi, { picked: [0] }), false);
  assert.equal(grade(multi, { picked: [0, 1, 2] }), false);
  assert.equal(grade({ ...one, type: 'odd' }, { picked: [1] }), true);
  assert.equal(grade({ type: 'predict', options: ['x', 'y'], answer: 0, outcome: '' }, { picked: [0] }), true);
  assert.ok(!gradeExercise(one, { picked: 1 }).ok, 'a malformed answer is study.invalid');
});

test('numbers: tolerance, empty input, predict without options', () => {
  const c: Exercise = { type: 'calc', answer: 9.81, tolerance: 0.05 };
  assert.equal(grade(c, { value: '' }), null);
  assert.equal(grade(c, { value: '9.78' }), true);
  assert.equal(grade(c, { value: 9.7 }), false);
  assert.equal(grade({ type: 'calc', answer: 0.3 }, { value: 0.1 + 0.2 }), true, 'within 1e-9 counts as exact');
  assert.equal(grade({ type: 'predict', answer: 4 }, { value: '4' }), true);
});

test('order, match, bucket, cloze, spotbug: complete before graded, per-item verdicts', () => {
  const o: Exercise = { type: 'order', items: ['a', 'b', 'c'] };
  assert.equal(grade(o, { order: [0, 1] }), null);
  assert.equal(grade(o, { order: [0, 1, 2] }), true);
  assert.deepEqual(detail(o, { order: [1, 0, 2] }), { status: 'graded', ok: false, score: 1 / 3, detail: { items: [false, false, true] } });
  const m: Exercise = {
    type: 'match',
    pairs: [
      ['a', '1'],
      ['b', '2'],
    ],
  };
  assert.equal(grade(m, { links: [0, null] }), null);
  assert.equal(grade(m, { links: [0, 1] }), true);
  assert.equal(grade(m, { links: [1, 0] }), false);
  const b: Exercise = {
    type: 'bucket',
    buckets: ['x', 'y'],
    items: [
      { text: 'p', bucket: 0 },
      { text: 'q', bucket: 1 },
    ],
  };
  assert.equal(grade(b, { place: [0] }), null);
  assert.equal(grade(b, { place: [0, 1] }), true);
  assert.equal(grade(b, { place: [1, 1] }), false);
  const z: Exercise = { type: 'cloze', text: 'Use [[GROUP BY|group by]] then [[HAVING]].' };
  assert.equal(grade(z, { blanks: ['group  by', ''] }), null);
  assert.equal(grade(z, { blanks: ['Group By', 'having'] }), true);
  assert.deepEqual((detail(z, { blanks: ['order by', 'having'] }) as { detail: { items: readonly boolean[] } }).detail.items, [
    false,
    true,
  ]);
  const s: Exercise = { type: 'spotbug', lines: ['a', 'b', 'c'], bugs: [2] };
  assert.equal(grade(s, { lines: [] }), null);
  assert.equal(grade(s, { lines: [2] }), true);
  assert.equal(grade(s, { lines: [1, 2] }), false);
});

test('write: every keyword; true/false', () => {
  const w: Exercise = { type: 'write', keywords: ['SELECT', 'GROUP BY'] };
  assert.equal(grade(w, { text: '  ' }), null);
  assert.equal(grade(w, { text: 'select x from t group by x' }), true);
  assert.deepEqual((detail(w, { text: 'select x' }) as { detail: { missing: readonly string[] } }).detail.missing, ['GROUP BY']);
  assert.equal(grade({ type: 'tf', answer: false }, { value: false }), true);
  assert.equal(grade({ type: 'tf', answer: false }, { value: null }), null);
});

test('the critical-thinking types: flaw, case, inquiry, debate, tree', () => {
  const f: Exercise = { type: 'flaw', lines: ['a', 'b', 'c'], flaws: [1], reasons: ['x', 'y'], reason: 1 };
  assert.equal(grade(f, { lines: [1], reason: null }), null);
  assert.equal(grade(f, { lines: [1], reason: 1 }), true);
  assert.equal(grade(f, { lines: [1], reason: 0 }), false);
  const c: Exercise = {
    type: 'case',
    id: 'x',
    parts: [
      { type: 'tf', answer: true },
      { type: 'calc', answer: 5 },
    ],
  };
  assert.equal(grade(c, { parts: [{ value: true }, { value: '' }] }), null);
  assert.equal(grade(c, { parts: [{ value: true }, { value: 5 }] }), true);
  const g = detail(c, { parts: [{ value: true }, { value: 4 }] });
  assert.ok(g.status === 'graded' && !g.ok && g.score === 0.5);
  const q: Exercise = { type: 'inquiry', options: ['a', 'b', 'c'], scores: [1, 3, 3] };
  assert.equal(grade(q, { picked: 2 }), true);
  assert.equal(grade(q, { picked: 0 }), false);
  const d: Exercise = {
    type: 'debate',
    sides: [
      { position: 'p', counters: ['a', 'b'], best: 1 },
      { position: 'q', counters: ['c'], best: 0 },
    ],
  };
  assert.equal(grade(d, { side: 0, pick: null }), null);
  assert.equal(grade(d, { side: 0, pick: 1 }), true);
  assert.equal(grade(d, { side: 1, pick: 1 }), false);
  assert.equal(grade({ type: 'tree' }, { mistakes: 0 }), true);
  assert.equal(grade({ type: 'scenario' }, { mistakes: 2 }), false);
});

test('self-graded: free (AI score or rubric), occlusion (own pass mark), a sim activity', () => {
  assert.equal(grade({ type: 'free' }, {}), null);
  assert.equal(grade({ type: 'free' }, { score: 70 }), true);
  assert.equal(grade({ type: 'free' }, { score: 69 }), false);
  assert.equal(grade({ type: 'free' }, { rubric: [true, true, true, false] }), true);
  assert.equal(grade({ type: 'free' }, { rubric: [true, false, true] }), false);
  assert.equal(grade({ type: 'img_occlusion' }, { knew: [true, true, true, true, false] }), true);
  assert.equal(grade({ type: 'img_occlusion', pass: 1 }, { knew: [true, false] }), false);
  assert.equal(grade({ type: 'sim' }, { ok: true }), true);
  assert.equal(grade({ type: 'sim' }, {}), null);
});

test('pictures: hotspot (one, several, any), sequence, drag, select, label with typos', () => {
  const regions: Region[] = [
    { id: 'a', x: 0, y: 0, w: 10, h: 10, label: 'Boiler' },
    { id: 'b', x: 20, y: 0, w: 10, h: 10, label: 'Turbine', accept: ['rotor'] },
    { id: 'c', x: 40, y: 0, w: 10, h: 10, label: 'Grid' },
  ];
  const ctx = { regions };
  const h1: Exercise = { type: 'img_hotspot', answer: ['b'] };
  assert.equal(grade(h1, { pins: [] }, ctx), null);
  assert.equal(grade(h1, { pins: [[25, 5]] }, ctx), true);
  assert.equal(grade(h1, { pins: [[5, 5]] }, ctx), false);
  const h2: Exercise = { type: 'img_hotspot', answer: ['a', 'c'] };
  assert.equal(grade(h2, { pins: [[5, 5]] }, ctx), null);
  assert.equal(
    grade(
      h2,
      {
        pins: [
          [5, 5],
          [45, 5],
        ],
      },
      ctx,
    ),
    true,
  );
  assert.equal(
    grade(
      h2,
      {
        pins: [
          [5, 5],
          [6, 6],
        ],
      },
      ctx,
    ),
    false,
  );
  assert.equal(grade({ type: 'img_hotspot', answer: ['a', 'c'], any: true }, { pins: [[45, 5]] }, ctx), true);
  const sq: Exercise = { type: 'img_sequence', answer: ['a', 'b', 'c'] };
  assert.equal(grade(sq, { sequence: ['a', 'b'] }, ctx), null);
  assert.equal(grade(sq, { sequence: ['a', 'b', 'c'] }, ctx), true);
  assert.equal(grade(sq, { sequence: ['b', 'a', 'c'] }, ctx), false);
  const dr: Exercise = { type: 'img_drag', targets: ['a', 'b'] };
  assert.equal(grade(dr, { slots: ['Boiler', null] }, ctx), null);
  assert.equal(grade(dr, { slots: ['boiler', 'Turbine'] }, ctx), true);
  assert.equal(grade(dr, { slots: ['Turbine', 'Boiler'] }, ctx), false);
  assert.equal(grade({ ...dr, type: 'img_select' }, { slots: ['Boiler', 'Turbine'] }, ctx), true);
  const lb: Exercise = { type: 'img_label', targets: ['a', 'b'] };
  assert.equal(grade(lb, { slots: ['boiler', ' '] }, ctx), null);
  const g = detail(lb, { slots: ['boilr', 'Rotor'] }, ctx);
  assert.deepEqual(g, { status: 'graded', ok: true, score: 1, detail: { items: [true, true], typos: [true, false] } });
  assert.equal(grade({ ...lb, fuzzy: false }, { slots: ['boilr', 'rotor'] }, ctx), false);
});

test('an unknown exercise type is refused, not guessed', () => {
  const r = gradeExercise({ type: 'hologram' }, {});
  assert.ok(!r.ok && r.error.code === 'study.invalid');
});

/* ---------- every exercise the repo holds ---------- */
type Ex = Exercise & Record<string, unknown>;
const right = (ex: Ex, ctx: GradeContext): Answer => {
  const answers = (x: unknown): number[] => (Array.isArray(x) ? (x as number[]) : [x as number]);
  const targets = targetsOf(ex.targets, ctx.regions ?? []);
  switch (ex.type) {
    case 'mcq':
    case 'odd':
    case 'img_reveal':
      return { picked: answers(ex.answer) };
    case 'predict':
      return Array.isArray(ex.options) ? { picked: answers(ex.answer) } : { value: ex.answer };
    case 'tf':
      return { value: ex.answer };
    case 'calc':
      return { value: String(ex.answer) };
    case 'order':
      return { order: (ex.items as unknown[]).map((_, i) => i) };
    case 'match':
      return { links: (ex.pairs as unknown[]).map((_, i) => i) };
    case 'bucket':
      return { place: (ex.items as { bucket: number }[]).map(i => i.bucket) };
    case 'cloze':
      return { blanks: clozeBlanks(String(ex.text)).map(a => a[0] ?? '') };
    case 'spotbug':
      return { lines: ex.bugs };
    case 'write':
      return { text: str(ex.solution) + ' ' + (ex.keywords as string[]).join(' ') };
    case 'flaw':
      return { lines: ex.flaws, reason: ex.reason };
    case 'case':
      return { parts: (ex.parts as Ex[]).map(p => right(p, ctx)) };
    case 'inquiry':
      return { picked: (ex.scores as number[]).indexOf(Math.max(...(ex.scores as number[]))) };
    case 'debate':
      return { side: 0, pick: (ex.sides as { best: number }[])[0]?.best };
    case 'scenario':
    case 'tree':
      return { mistakes: 0 };
    case 'free':
      return { rubric: (ex.rubric as unknown[]).map(() => true) };
    case 'img_occlusion':
      return { knew: targets.map(() => true) };
    case 'img_hotspot': {
      const ids = ex.answer as string[];
      return { pins: ids.map(id => centre(ctx.regions?.find(r => r.id === id))) };
    }
    case 'img_sequence':
      return { sequence: ex.answer };
    case 'img_drag':
    case 'img_select':
    case 'img_label':
      return { slots: targets.map(r => r.label ?? '') };
    default:
      throw new Error('no right answer for ' + ex.type);
  }
};
/** A point inside a region (its centre; for a polygon the first point that hits). */
function centre(r: Region | undefined): [number, number] {
  if (!r) return [-1, -1];
  if (r.shape === 'circle') return [r.cx ?? 0, r.cy ?? 0];
  if (r.shape === 'poly') {
    const P = r.points ?? [];
    for (let i = 0; i + 2 < P.length + 2; i++) {
      const a = P[0] ?? [0, 0],
        b = P[(i + 1) % P.length] ?? [0, 0],
        c = P[(i + 2) % P.length] ?? [0, 0];
      const x = (a[0] + b[0] + c[0]) / 3,
        y = (a[1] + b[1] + c[1]) / 3;
      if (hits(r, x, y)) return [x, y];
    }
    const xs = P.map(p => p[0]),
      ys = P.map(p => p[1]);
    for (let x = Math.min(...xs); x <= Math.max(...xs); x += 0.5)
      for (let y = Math.min(...ys); y <= Math.max(...ys); y += 0.5) if (hits(r, x, y)) return [x, y];
    return [-1, -1];
  }
  return [(r.x ?? 0) + (r.w ?? 0) / 2, (r.y ?? 0) + (r.h ?? 0) / 2];
}
/** A wrong answer of the same shape, or null where the type has none to build (a self-reported pass). */
const wrong = (ex: Ex, a: Answer): Answer | null => {
  switch (ex.type) {
    case 'mcq':
    case 'odd':
    case 'img_reveal': {
      const n = (ex.options as unknown[]).length,
        p = a.picked as number[];
      const other = [...Array(n).keys()].find(i => !p.includes(i));
      return other === undefined ? null : { picked: [other] };
    }
    case 'tf':
      return { value: !ex.answer };
    case 'calc':
      return { value: Number(ex.answer) + 1 + 10 * Math.abs(Number(ex.tolerance ?? 0)) };
    case 'order':
      return (ex.items as unknown[]).length > 1 ? { order: (a.order as number[]).slice().reverse() } : null;
    case 'cloze':
      return { blanks: (a.blanks as string[]).map(() => '∅ nothing like it') };
    case 'scenario':
    case 'tree':
      return { mistakes: 1 };
    case 'img_sequence':
      return (a.sequence as string[]).length > 1 ? { sequence: (a.sequence as string[]).slice().reverse() } : null;
    default:
      return null;
  }
};
function exercisesOfRepo(): { ex: Ex; regions: Region[]; where: string }[] {
  const out: { ex: Ex; regions: Region[]; where: string }[] = [];
  const packs = [
    ...fs.readdirSync(path.join(ROOT, 'library/subjects')).map(d => path.join(ROOT, 'library/subjects', d)),
    path.join(ROOT, 'tests/fixtures/demo-physics'),
  ];
  for (const dir of packs) {
    const mediaFile = path.join(dir, 'media/media.json');
    const media: { id: string; regions?: Region[] }[] = fs.existsSync(mediaFile)
      ? ((JSON.parse(fs.readFileSync(mediaFile, 'utf8')) as { items?: { id: string; regions?: Region[] }[] }).items ?? [])
      : [];
    const chapters = path.join(dir, 'chapters');
    if (!fs.existsSync(chapters)) continue;
    for (const f of fs.readdirSync(chapters).filter(f => f.endsWith('.json'))) {
      const ch = JSON.parse(fs.readFileSync(path.join(chapters, f), 'utf8')) as { exercises?: Ex[] };
      for (const ex of ch.exercises ?? []) {
        const regions = Array.isArray(ex.regions) ? (ex.regions as Region[]) : (media.find(m => m.id === ex.media)?.regions ?? []);
        out.push({ ex, regions, where: `${path.basename(dir)}/${f} ${String(ex.id)}` });
      }
    }
  }
  const tt = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/fixtures/quality/thinking_types.json'), 'utf8')) as { exercises: Ex[] };
  for (const ex of tt.exercises) out.push({ ex, regions: [], where: 'quality/thinking_types.json ' + String(ex.id) });
  return out;
}

test('every exercise of the library and the fixtures: right → right, wrong → wrong, nothing → incomplete', () => {
  const all = exercisesOfRepo(),
    types = new Set<string>();
  assert.ok(all.length > 1500, `${all.length} exercises`);
  for (const { ex, regions, where } of all) {
    types.add(ex.type);
    const ctx = { regions },
      a = right(ex, ctx);
    assert.equal(grade(ex, a, ctx), true, where + ': the right answer');
    const w = wrong(ex, a);
    if (w) assert.equal(grade(ex, w, ctx), false, where + ': a wrong answer');
  }
  for (const t of types) assert.ok(GRADED_TYPES.includes(t), 'graded type ' + t);
  for (const t of [
    'mcq',
    'tf',
    'order',
    'match',
    'bucket',
    'cloze',
    'spotbug',
    'calc',
    'scenario',
    'free',
    'write',
    'odd',
    'flaw',
    'case',
    'predict',
    'tree',
    'inquiry',
    'debate',
  ])
    assert.ok(types.has(t), 'the sweep met ' + t);
  for (const t of ['img_hotspot', 'img_sequence', 'img_reveal', 'img_drag', 'img_label', 'img_select', 'img_occlusion'])
    assert.ok(types.has(t), 'the sweep met ' + t);
});
