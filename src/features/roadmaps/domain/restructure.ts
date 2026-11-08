/* noema-lite — restructuring a Roadmap by level (noema_restructure_levels, docs/CURRICULUM.md §11.3).

   Claude proposes a PLAN: a new ladder, which steps and chapters change level, which steps (with their packs) are split or
   merged, which links between steps change. The plan goes to the inbox and is kept on the Roadmap as a pending proposal; it
   is applied only when the learner — in a shared Roadmap its owner — approves it in the app. Nothing is lost:
     • ids are kept: a step keeps its id (a split's first part, a merge's target), a chapter keeps its ref and its pack
       chapter keeps its id, every exercise, section and card keeps its id — progress is kept per id, so it follows the
       material wherever it moves;
     • a split / merge moves each chapter's translations and 文A bridge parts with it (splitBundle / mergeBundles), and the
       learner's progress state with it (splitState / mergeStates) — counted before and after (bundleCounts);
     • the Roadmap's translations of a step follow its chapters (moveI18n).
   A subject the learner attached to a step (docs/CURRICULUM.md §9) never changes: such a step may change level, nothing else. */
import { ok, err, type Result } from '../../../kernel/result.ts';
import { roadmapLevels, type Level, type LevelRef } from '../../../contracts/rules/levels.ts';
import type { Edge, PlannedChapter, Roadmap, Step } from './model.ts';
import { clone, own } from './model.ts';
import { hasEdge, order, packId, topo } from './graph.ts';
import { ladderFrom, levelRefFrom } from './levels.ts';
import { moveI18n } from './i18n.ts';
import { prepared } from './work.ts';
import { splitBridge, mergeBridges, type BridgeLike } from '../../bridges/domain/lookup.ts';

export interface SplitPart {
  /** the first part keeps the step's id; every other part is a new step */
  id: string;
  title: string;
  level?: LevelRef;
  /** planned chapter refs of the step, in their new order */
  chapters: string[];
}
export interface RestructurePlan {
  /** why, for the learner (shown with the proposal) */
  why: string;
  /** the new ladder (replaces the Roadmap's) */
  levels?: Level[];
  /** steps that change level (null: no level) */
  steps?: { step: string; level: LevelRef | null }[];
  /** planned chapters that sit at another level than their step */
  chapters?: { step: string; chapter: string; level: string | null }[];
  /** a step cut into parts (its pack too, when it is prepared) */
  split?: { step: string; parts: SplitPart[] }[];
  /** steps joined into the first one (their packs too) */
  merge?: { into: string; steps: string[]; title?: string }[];
  /** links added and removed (steps moved on the map) */
  links?: Edge[];
  unlink?: Edge[];
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const AT = /^@/;
const sid = (x: unknown): string => (typeof x === 'string' || typeof x === 'number' ? String(x) : '').trim().replace(AT, '');

/** Claude's plan (plan_json) → the plan, every problem at once. Steps are named by "@<step id>" (or the bare id). */
export function planFrom(c: Roadmap, d: unknown): Result<RestructurePlan, string[]> {
  if (!isObj(d)) return err(['plan_json must be ONE JSON object { why, levels?, steps?, chapters?, split?, merge?, links?, unlink? }']);
  const E: string[] = [],
    plan: RestructurePlan = { why: typeof d.why === 'string' ? d.why.trim().slice(0, 1200) : '' };
  if (!plan.why) E.push('why: say in one or two sentences why this arrangement is better (the learner reads it before approving)');
  let ladder = c.levels ?? [];
  if (d.levels !== undefined) {
    const L = ladderFrom(d.levels, c.language ?? 'en');
    if (L.ok) ladder = plan.levels = L.value;
    else E.push(...L.error);
  }
  const step = (x: unknown, at: string): string | null => {
    const id = sid(x);
    if (!id) return (E.push(`${at}: "@<step id>" is missing`), null);
    if (!own(c.nodes, id)) return (E.push(`${at}: "@${id}" is not a step of this Roadmap (noema_roadmap_map lists them)`), null);
    return id;
  };
  const list = (k: string): unknown[] => {
    const v = d[k];
    if (v === undefined) return [];
    if (Array.isArray(v)) return v;
    E.push(`${k} must be a list`);
    return [];
  };
  const steps = list('steps'),
    chapters = list('chapters'),
    split = list('split'),
    merge = list('merge'),
    links = list('links'),
    unlink = list('unlink');
  if (steps.length) plan.steps = [];
  steps.forEach((x, i) => {
    const at = `steps[${i}]`,
      o = isObj(x) ? x : {},
      id = step(o.step, at);
    if (o.level === null) {
      if (id) plan.steps?.push({ step: id, level: null });
      return;
    }
    const r = levelRefFrom(o.level, ladder, at);
    if (!r.ok) return void E.push(r.error);
    if (id && r.value !== undefined) plan.steps?.push({ step: id, level: r.value });
    else if (id) E.push(`${at}: "level" (a level id, { "from", "to" }, or null for none)`);
  });
  if (chapters.length) plan.chapters = [];
  chapters.forEach((x, i) => {
    const at = `chapters[${i}]`,
      o = isObj(x) ? x : {},
      id = step(o.step, at),
      ref = typeof o.chapter === 'string' ? o.chapter.trim() : '';
    if (!id) return;
    if (!(c.nodes[id]?.chapters ?? []).some(ch => ch.ref === ref))
      return void E.push(
        `${at}: chapter "${ref}" is not a planned chapter of @${id} (refs: ${(c.nodes[id]?.chapters ?? []).map(ch => ch.ref).join(', ') || 'none'})`,
      );
    if (o.level === null) return void plan.chapters?.push({ step: id, chapter: ref, level: null });
    if (typeof o.level !== 'string' || !ladder.some(l => l.id === o.level))
      return void E.push(`${at}: level ${JSON.stringify(o.level)} is not a level of the Roadmap (${ladder.map(l => l.id).join(', ')})`);
    plan.chapters?.push({ step: id, chapter: ref, level: o.level });
  });
  if (split.length) plan.split = [];
  split.forEach((x, i) => {
    const at = `split[${i}]`,
      o = isObj(x) ? x : {},
      id = step(o.step, at),
      parts = Array.isArray(o.parts) ? o.parts : [];
    if (!id) return;
    if (parts.length < 2) return void E.push(`${at}: "parts" — at least 2 parts, each { "title", "level"?, "chapters": [refs] }`);
    const out: SplitPart[] = [];
    parts.forEach((p, k) => {
      const q = isObj(p) ? p : {},
        title = typeof q.title === 'string' ? q.title.trim().slice(0, 120) : '';
      if (!title) E.push(`${at}.parts[${k}]: a title`);
      const chs = Array.isArray(q.chapters) ? q.chapters.map(v => String(v)) : [];
      const lv = levelRefFrom(q.level, ladder, `${at}.parts[${k}]`);
      if (!lv.ok) E.push(lv.error);
      out.push({ id: k === 0 ? id : '', title, chapters: chs, ...(lv.ok && lv.value !== undefined ? { level: lv.value } : {}) });
    });
    plan.split?.push({ step: id, parts: out });
  });
  if (merge.length) plan.merge = [];
  merge.forEach((x, i) => {
    const at = `merge[${i}]`,
      o = isObj(x) ? x : {},
      into = step(o.into, `${at}.into`),
      from = (Array.isArray(o.steps) ? o.steps : []).map((s, k) => step(s, `${at}.steps[${k}]`)).filter((s): s is string => !!s);
    if (!from.length) E.push(`${at}: "steps" — the steps to join into "into"`);
    if (into)
      plan.merge?.push({
        into,
        steps: from,
        ...(typeof o.title === 'string' && o.title.trim() ? { title: o.title.trim().slice(0, 120) } : {}),
      });
  });
  const edge = (x: unknown, at: string): Edge | null => {
    const o = isObj(x) ? x : {},
      a = step(o.from, `${at}.from`),
      b = step(o.to, `${at}.to`);
    return a && b ? { from: a, to: b, ...(typeof o.why === 'string' && o.why.trim() ? { why: o.why.trim().slice(0, 400) } : {}) } : null;
  };
  if (links.length) plan.links = links.map((x, i) => edge(x, `links[${i}]`)).filter((x): x is Edge => !!x);
  if (unlink.length) plan.unlink = unlink.map((x, i) => edge(x, `unlink[${i}]`)).filter((x): x is Edge => !!x);
  if (
    !plan.levels &&
    !plan.steps?.length &&
    !plan.chapters?.length &&
    !plan.split?.length &&
    !plan.merge?.length &&
    !plan.links?.length &&
    !plan.unlink?.length
  )
    E.push('the plan changes nothing: give levels, steps, chapters, split, merge, links or unlink');
  if (E.length) return err(E);
  // new step ids for the parts of a split (the first part keeps the step's id): from the part's title, never taken
  const taken = new Set(Object.keys(c.nodes));
  for (const s of plan.split ?? [])
    for (const p of s.parts) {
      if (p.id) continue;
      const base =
        p.title
          .toLowerCase()
          .normalize('NFKD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '')
          .slice(0, 36) || s.step + '_part';
      let id = base,
        k = 2;
      while (taken.has(id)) id = `${base}_${String(k++)}`;
      taken.add(id);
      p.id = id;
    }
  const problems = checkRestructure(c, plan);
  return problems.length ? err(problems) : ok(plan);
}

/** What the pack side of a plan does (the app runs it with the learner's packs: restructure application). */
export interface PackOps {
  /** a prepared step's pack cut into the packs of its parts (the first part keeps the pack id) */
  split: { step: string; pack: string; parts: { step: string; pack: string; title: string; chapters: string[]; levels: string[] }[] }[];
  /** prepared steps' packs joined into the first one */
  merge: { step: string; pack: string; from: { step: string; pack: string }[]; title?: string; levels: string[] }[];
  /** packs whose levels change (subject.levels, and planned chapter → level) */
  levels: { step: string; pack: string; levels: string[]; chapters: Record<string, string | null> }[];
}

/** A plan's problems against the Roadmap as it is now ([] = it can be applied). */
export function checkRestructure(c: Roadmap, plan: RestructurePlan): string[] {
  const r = applyRestructure(c, plan, 0);
  return r.ok ? [] : r.error;
}

const shared = (c: Roadmap): boolean => !!c.shared && !c.shared.ended;
const firstLevel = (ref: LevelRef | undefined): string | undefined =>
  ref === undefined ? undefined : typeof ref === 'string' ? ref : ref.from;
const rangeIds = (ladder: readonly Level[], ref: LevelRef | undefined): string[] => {
  if (ref === undefined) return [];
  const [a, b] = typeof ref === 'string' ? [ref, ref] : [ref.from, ref.to];
  const s = [...ladder].sort((x, y) => x.order - y.order),
    i = s.findIndex(l => l.id === a),
    j = s.findIndex(l => l.id === b);
  return i < 0 || j < 0 ? [] : s.slice(Math.min(i, j), Math.max(i, j) + 1).map(l => l.id);
};

/** Apply a plan to a copy of the Roadmap → the new Roadmap and what changes in the packs, or every problem. now: when the
    new parts are stamped. The record passed is never changed. */
export function applyRestructure(c0: Roadmap, plan: RestructurePlan, now: number): Result<{ roadmap: Roadmap; packs: PackOps }, string[]> {
  const c = clone(c0),
    E: string[] = [],
    ops: PackOps = { split: [], merge: [], levels: [] };
  if (plan.levels) {
    c.levels = clone(plan.levels);
    // a level the new ladder does not have any more: steps and chapters on it lose it (the plan sets them again)
    const ids = new Set(c.levels.map(l => l.id));
    for (const n of Object.values(c.nodes)) {
      if (n.level !== undefined && rangeIds(c.levels, n.level).length === 0 && !(typeof n.level === 'string' && ids.has(n.level)))
        Reflect.deleteProperty(n, 'level');
      for (const ch of n.chapters ?? []) if (ch.level !== undefined && !ids.has(ch.level)) Reflect.deleteProperty(ch, 'level');
    }
  }
  const L = c.levels ?? [];
  const touched = new Set<string>();
  for (const s of plan.steps ?? []) {
    const n = c.nodes[s.step];
    if (!n) continue;
    if (s.level === null) Reflect.deleteProperty(n, 'level');
    else n.level = clone(s.level);
    touched.add(s.step);
  }
  for (const x of plan.chapters ?? []) {
    const n = c.nodes[x.step],
      ch = n?.chapters?.find(y => y.ref === x.chapter);
    if (!n || !ch) continue;
    if (n.pack?.assigned) {
      E.push(
        `@${x.step} is taught by the learner's own subject “${n.pack.title ?? n.pack.id ?? ''}”: its chapters never change (only the step's level may)`,
      );
      continue;
    }
    if (x.level === null) Reflect.deleteProperty(ch, 'level');
    else ch.level = x.level;
    touched.add(x.step);
  }
  // ✂️ splits
  for (const s of plan.split ?? []) {
    const n = c.nodes[s.step];
    if (!n) continue;
    if (n.pack?.assigned) {
      E.push(`@${s.step} is taught by the learner's own subject: it cannot be split (it never changes)`);
      continue;
    }
    if (n.pack?.status === 'generating' || n.pack?.status === 'app') {
      E.push(`@${s.step} is being prepared right now: split it once it is ready (or before it is queued)`);
      continue;
    }
    if (shared(c) && prepared(n)) {
      E.push(
        `@${s.step} is prepared and the Roadmap is shared: its subject belongs to the one who prepared it — change its level or links, not its material`,
      );
      continue;
    }
    const all = (n.chapters ?? []).map(ch => ch.ref),
      used = s.parts.flatMap(p => p.chapters);
    const missing = all.filter(r => !used.includes(r)),
      extra = used.filter(r => !all.includes(r)),
      twice = used.filter((r, i) => used.indexOf(r) !== i);
    if (missing.length)
      E.push(`split @${s.step}: chapter(s) ${missing.join(', ')} are in no part — every chapter goes to exactly one part`);
    if (extra.length) E.push(`split @${s.step}: ${extra.join(', ')} are not planned chapters of the step`);
    if (twice.length) E.push(`split @${s.step}: ${[...new Set(twice)].join(', ')} are in more than one part`);
    if (s.parts.some(p => !p.chapters.length)) E.push(`split @${s.step}: every part has at least one chapter`);
    if (missing.length || extra.length || twice.length) continue;
    const byRef = new Map((n.chapters ?? []).map(ch => [ch.ref, ch])),
      incoming = c.edges.filter(e => e.to === s.step),
      outgoing = c.edges.filter(e => e.from === s.step);
    const partIds = s.parts.map(p => p.id),
      wasPrepared = prepared(n);
    c.edges = c.edges.filter(e => e.from !== s.step && e.to !== s.step);
    s.parts.forEach((p, k) => {
      const chs = p.chapters.map(r => byRef.get(r)).filter((x): x is PlannedChapter => !!x);
      const base: Step = k === 0 ? n : { ...clone(n), id: p.id, addedIn: n.addedIn ?? 'p1' };
      base.title = p.title;
      base.chapters = clone(chs);
      if (p.level !== undefined) base.level = clone(p.level);
      if (k > 0) {
        Reflect.deleteProperty(base, 'reviewed');
        base.pack = wasPrepared ? { ...clone(n.pack ?? {}), id: packId(c, p.id) } : null;
        if (n.learningGoals) base.learningGoals = [...n.learningGoals];
        c.nodes[p.id] = base;
        moveI18n(c, s.step, p.id, { chapters: p.chapters });
      }
      touched.add(p.id);
    });
    // the parts form a chain in their order: what the step needed, the first part needs; what needed the step, needs the last
    for (const e of incoming) c.edges.push({ ...e, to: partIds[0] ?? s.step });
    for (let k = 1; k < partIds.length; k++) c.edges.push({ from: partIds[k - 1] ?? s.step, to: partIds[k] ?? s.step, why: '' });
    for (const e of outgoing) c.edges.push({ ...e, from: partIds[partIds.length - 1] ?? s.step });
    // the first part keeps the step's own translations of the chapters it keeps; the others moved theirs above
    for (const T of Object.values(c.i18n ?? {})) {
      const x = T.nodes?.[s.step];
      if (x?.chapters)
        x.chapters = Object.fromEntries(Object.entries(x.chapters).filter(([r]) => (s.parts[0]?.chapters ?? []).includes(r)));
      if (x) Reflect.deleteProperty(x, 'title');
    }
    if (wasPrepared && n.pack?.id)
      ops.split.push({
        step: s.step,
        pack: n.pack.id,
        parts: s.parts.map(p => ({
          step: p.id,
          pack: p.id === s.step ? (n.pack?.id ?? '') : packId(c, p.id),
          title: p.title,
          chapters: p.chapters,
          levels: rangeIds(L, c.nodes[p.id]?.level),
        })),
      });
  }
  // 🔗 merges
  for (const m of plan.merge ?? []) {
    const into = c.nodes[m.into];
    if (!into) continue;
    const from = m.steps.filter(id => id !== m.into);
    const all = [into, ...from.map(id => c.nodes[id])];
    if (all.some(n => !n)) {
      E.push(`merge into @${m.into}: a step it names is gone (split or merged in the same plan)`);
      continue;
    }
    const steps = all as Step[];
    if (steps.some(n => n.pack?.assigned)) {
      E.push(`merge into @${m.into}: a step taught by the learner's own subject cannot be merged (it never changes)`);
      continue;
    }
    if (steps.some(n => n.pack?.status === 'generating' || n.pack?.status === 'app')) {
      E.push(`merge into @${m.into}: a step is being prepared right now — merge once it is ready`);
      continue;
    }
    const prep = steps.map(prepared);
    if (shared(c) && prep.some(Boolean)) {
      E.push(`merge into @${m.into}: the Roadmap is shared and a step is prepared — its subject belongs to the one who prepared it`);
      continue;
    }
    if (prep.some(Boolean) && !prep.every(Boolean)) {
      E.push(
        `merge into @${m.into}: prepared and unprepared steps cannot be merged (${steps.map((n, i) => `@${n.id} ${prep[i] ? 'prepared' : 'not prepared'}`).join(', ')}) — merge steps that are all prepared, or all not yet`,
      );
      continue;
    }
    // chapter refs stay unique inside the merged step (a clash gets the step id in front)
    const refs = new Set((into.chapters ?? []).map(ch => ch.ref));
    for (const id of from) {
      const n = c.nodes[id] as Step,
        renamed: Record<string, string> = {};
      for (const ch of n.chapters ?? []) {
        let r = ch.ref;
        if (refs.has(r)) r = `${id}-${ch.ref}`.slice(0, 41);
        refs.add(r);
        renamed[ch.ref] = r;
        (into.chapters ??= []).push({
          ...clone(ch),
          ref: r,
          ...(ch.level === undefined && n.level !== undefined ? { level: firstLevel(n.level) } : {}),
        } as PlannedChapter);
      }
      into.learningGoals = [...new Set([...(into.learningGoals ?? []), ...(n.learningGoals ?? [])])];
      // edges of the merged step move to the target (no self-loop, no duplicate)
      c.edges = c.edges
        .map(e => ({ ...e, from: e.from === id ? m.into : e.from, to: e.to === id ? m.into : e.to }))
        .filter(e => e.from !== e.to)
        .filter((e, i, a) => a.findIndex(y => y.from === e.from && y.to === e.to) === i);
      for (const T of Object.values(c.i18n ?? {})) {
        const x = T.nodes?.[id];
        if (!x || !T.nodes) continue;
        const chs = Object.fromEntries(Object.entries(x.chapters ?? {}).map(([r, v]) => [renamed[r] ?? r, v]));
        const tgt = (T.nodes[m.into] ??= {});
        tgt.chapters = { ...(tgt.chapters ?? {}), ...chs };
        Reflect.deleteProperty(tgt, 'learningGoals');
        Reflect.deleteProperty(T.nodes, id);
      }
      Reflect.deleteProperty(c.nodes, id);
      for (const p of c.parts ?? []) if (p.steps) p.steps = p.steps.filter(x => x !== id);
    }
    if (m.title) into.title = m.title;
    // the merged step spans every level its steps had
    const spans = steps.flatMap(n => rangeIds(L, n.level)),
      sorted = [...L].sort((a, b) => a.order - b.order).filter(l => spans.includes(l.id));
    const lo = sorted[0],
      hi = sorted[sorted.length - 1];
    if (lo && hi) into.level = lo.id === hi.id ? lo.id : { from: lo.id, to: hi.id };
    touched.add(m.into);
    if (prep.every(Boolean) && into.pack?.id)
      ops.merge.push({
        step: m.into,
        pack: into.pack.id,
        from: from.map(id => ({ step: id, pack: c0.nodes[id]?.pack?.id ?? '' })),
        ...(m.title ? { title: m.title } : {}),
        levels: rangeIds(L, into.level),
      });
  }
  // links
  if (plan.links?.length || plan.unlink?.length) {
    const rem = plan.unlink ?? [];
    for (const x of rem) if (!hasEdge(c.edges, x)) E.push(`unlink: there is no link @${x.from} → @${x.to}`);
    c.edges = [
      ...c.edges.filter(x => !hasEdge(rem, x)),
      ...(plan.links ?? []).filter(x => !hasEdge(c.edges, x)).map(x => ({ from: x.from, to: x.to, why: x.why ?? '' })),
    ];
    for (const x of plan.links ?? []) if (x.from === x.to) E.push(`links: @${x.from} cannot be its own prerequisite`);
  }
  // the rules of the result: acyclic, every link names steps, the level rules (a prerequisite never above its step)
  const ids = Object.keys(c.nodes);
  for (const e of c.edges)
    if (!own(c.nodes, e.from) || !own(c.nodes, e.to)) E.push(`a link names a step that is gone (${e.from} → ${e.to})`);
  const t = topo(ids, c.edges);
  if (!t.order)
    E.push(
      `the result has a cycle through ${t.cycle
        .slice(0, 8)
        .map(x => '@' + x)
        .join(', ')} — a step cannot come before itself`,
    );
  for (const x of roadmapLevels.issues({ levels: c.levels, nodes: c.nodes, edges: c.edges })) E.push(x.message);
  for (const n of Object.values(c.nodes))
    for (const ch of n.chapters ?? [])
      if (ch.level !== undefined && !L.some(l => l.id === ch.level))
        E.push(`@${n.id} chapter ${ch.ref}: level "${ch.level}" is not on the ladder`);
  if (E.length) return err([...new Set(E)]);
  c.paths = { minimal: (c.paths?.minimal ?? []).filter(id => own(c.nodes, id)), deep: order(c) };
  // the packs of prepared steps whose levels changed (and were not cut or joined: those get their levels with the new packs)
  const reshaped = new Set([...ops.split.flatMap(s => s.parts.map(p => p.step)), ...ops.merge.map(m => m.step)]);
  for (const id of touched) {
    const n = c.nodes[id];
    if (!n || reshaped.has(id) || !prepared(n) || n.pack?.assigned || !n.pack?.id) continue;
    ops.levels.push({
      step: id,
      pack: n.pack.id,
      levels: rangeIds(L, n.level),
      chapters: Object.fromEntries((n.chapters ?? []).map(ch => [ch.ref, ch.level ?? null])),
    });
  }
  if (now) c.restructuredAt = new Date(now).toISOString();
  return ok({ roadmap: c, packs: ops });
}

/* ---------- what the learner reads before approving ---------- */

export type Change =
  | { kind: 'ladder'; levels: string[] }
  | { kind: 'level'; step: string; title: string; from: LevelRef | null; to: LevelRef | null }
  | { kind: 'chapter'; step: string; title: string; chapter: string; to: string | null }
  | { kind: 'split'; step: string; title: string; parts: string[] }
  | { kind: 'merge'; step: string; title: string; from: string[] }
  | { kind: 'link'; from: string; to: string }
  | { kind: 'unlink'; from: string; to: string };

/** The plan's changes one by one, with the steps' titles as they are now (the app words them in the learner's language). */
export function changes(c: Roadmap, plan: RestructurePlan): Change[] {
  const T = (id: string): string => c.nodes[id]?.title ?? id,
    out: Change[] = [];
  if (plan.levels) out.push({ kind: 'ladder', levels: plan.levels.map(l => l.id) });
  for (const s of plan.steps ?? [])
    out.push({ kind: 'level', step: s.step, title: T(s.step), from: c.nodes[s.step]?.level ?? null, to: s.level });
  for (const x of plan.chapters ?? [])
    out.push({
      kind: 'chapter',
      step: x.step,
      title: T(x.step),
      chapter: c.nodes[x.step]?.chapters?.find(ch => ch.ref === x.chapter)?.title ?? x.chapter,
      to: x.level,
    });
  for (const s of plan.split ?? []) out.push({ kind: 'split', step: s.step, title: T(s.step), parts: s.parts.map(p => p.title) });
  for (const m of plan.merge ?? []) out.push({ kind: 'merge', step: m.into, title: m.title ?? T(m.into), from: m.steps.map(T) });
  for (const x of plan.links ?? []) out.push({ kind: 'link', from: T(x.from), to: T(x.to) });
  for (const x of plan.unlink ?? []) out.push({ kind: 'unlink', from: T(x.from), to: T(x.to) });
  return out;
}

/** The plan as Claude reads it back (English). */
export function describe(c: Roadmap, plan: RestructurePlan): string {
  const lv = (r: LevelRef | null): string => (r === null ? 'no level' : typeof r === 'string' ? r : `${r.from}–${r.to}`);
  return changes(c, plan)
    .map(x => {
      switch (x.kind) {
        case 'ladder':
          return `- the ladder becomes ${x.levels.join(' · ')}`;
        case 'level':
          return `- “${x.title}” (@${x.step}): ${lv(x.from)} → ${lv(x.to)}`;
        case 'chapter':
          return `- “${x.title}” chapter “${x.chapter}” → ${x.to ?? "the step's level"}`;
        case 'split':
          return `- “${x.title}” (@${x.step}) is split into ${x.parts.map(p => `“${p}”`).join(', ')}`;
        case 'merge':
          return `- ${x.from.map(p => `“${p}”`).join(', ')} join “${x.title}” (@${x.step})`;
        case 'link':
          return `- “${x.to}” builds on “${x.from}”`;
        case 'unlink':
          return `- “${x.to}” no longer builds on “${x.from}”`;
      }
    })
    .join('\n');
}

/* ---------- the packs: cut and joined with their translations, bridges and the learner's progress ---------- */

export interface PackChapter {
  id: string;
  title?: string;
  level?: string;
  sections?: { id: string; [k: string]: unknown }[];
  exercises?: { id: string; [k: string]: unknown }[];
  flashcards?: { id?: string; [k: string]: unknown }[];
  [k: string]: unknown;
}
export interface PackLike {
  subject: {
    id: string;
    title: string;
    levels?: unknown;
    i18n?: Record<string, { title?: string; [k: string]: unknown }>;
    [k: string]: unknown;
  };
  chapters: PackChapter[];
  curriculum?: { id: string; node: string };
  [k: string]: unknown;
}
export interface TranslationLike {
  locale?: string;
  pack?: string;
  chapters: { id: string; [k: string]: unknown }[];
  subject?: Record<string, unknown>;
  [k: string]: unknown;
}
/** A pack with everything that belongs to it: its translations (per locale) and its 文A bridges. */
export interface PackBundle {
  pack: PackLike;
  translations: Record<string, TranslationLike>;
  bridges: BridgeLike[];
}

export interface BundleCounts {
  chapters: number;
  sections: number;
  exercises: number;
  cards: number;
  translated: number;
  bridged: number;
}
/** What a set of bundles holds (proof that a restructuring dropped nothing: the same before and after). */
export function bundleCounts(bs: readonly PackBundle[]): BundleCounts {
  const out: BundleCounts = { chapters: 0, sections: 0, exercises: 0, cards: 0, translated: 0, bridged: 0 };
  for (const b of bs) {
    for (const ch of b.pack.chapters) {
      out.chapters++;
      out.sections += ch.sections?.length ?? 0;
      out.exercises += ch.exercises?.length ?? 0;
      out.cards += ch.flashcards?.length ?? 0;
    }
    for (const t of Object.values(b.translations)) out.translated += t.chapters.length;
    for (const x of b.bridges) out.bridged += Object.keys(x.sections ?? {}).length + (x.anchors?.length ?? 0);
  }
  return out;
}

/** The pack chapter of each planned chapter of a step: one pack chapter per planned chapter, in order (the step's task asks
    for exactly that); when the counts differ, by title. → ref → pack chapter id, or the refs that cannot be found. */
export function chapterMap(planned: readonly PlannedChapter[], pack: PackLike): Result<Map<string, string>, string[]> {
  const norm = (s: string | undefined): string =>
    (s ?? '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  const m = new Map<string, string>();
  if (planned.length === pack.chapters.length) {
    planned.forEach((ch, i) => {
      const p = pack.chapters[i];
      if (p) m.set(ch.ref, p.id);
    });
    return ok(m);
  }
  const missing: string[] = [];
  for (const ch of planned) {
    const p = pack.chapters.find(x => norm(x.title) === norm(ch.title));
    if (p) m.set(ch.ref, p.id);
    else missing.push(ch.ref);
  }
  return missing.length ? err(missing) : ok(m);
}

const pickChapters = <T extends { id: string }>(list: readonly T[], ids: readonly string[]): T[] =>
  ids.map(id => list.find(x => x.id === id)).filter((x): x is T => !!x);
const withLevels = (pack: PackLike, levels: readonly string[], chapterLevels: Readonly<Record<string, string | null>> = {}): PackLike => {
  const p = clone(pack);
  if (levels.length) p.subject.levels = [...levels];
  else Reflect.deleteProperty(p.subject, 'levels');
  for (const ch of p.chapters) {
    const lv = chapterLevels[ch.id];
    if (lv === null || (lv !== undefined && levels.length === 1 && lv === levels[0])) Reflect.deleteProperty(ch, 'level');
    else if (lv !== undefined) ch.level = lv;
  }
  // a chapter's level is one of the levels the pack teaches (src/contracts/rules/levels.ts knownContentLevels)
  const all = new Set([...levels, ...p.chapters.map(ch => ch.level).filter((x): x is string => !!x)]);
  if (all.size > levels.length) p.subject.levels = [...all];
  return p;
};

/** A pack's levels (subject.levels and each chapter's own, by pack chapter id) set. */
export function setBundleLevels(
  b: PackBundle,
  levels: readonly string[],
  chapterLevels: Readonly<Record<string, string | null>>,
): PackBundle {
  return { ...clone(b), pack: withLevels(b.pack, levels, chapterLevels) };
}

/** Cut a pack into parts (pack chapter ids per part; the first part keeps the pack's id): each part takes its chapters and
    their exercises, sections and cards, the translations of exactly those chapters, and the parts of each bridge that belong
    to their sections. Nothing is dropped: every chapter must be in exactly one part. */
export function splitBundle(
  b: PackBundle,
  parts: readonly {
    pack: string;
    title: string;
    chapters: readonly string[];
    levels: readonly string[];
    node?: { id: string; node: string };
  }[],
): Result<PackBundle[], string[]> {
  const all = b.pack.chapters.map(ch => ch.id),
    used = parts.flatMap(p => p.chapters);
  const missing = all.filter(id => !used.includes(id)),
    extra = used.filter(id => !all.includes(id));
  if (missing.length || extra.length || new Set(used).size !== used.length)
    return err([
      ...(missing.length ? [`chapters in no part: ${missing.join(', ')}`] : []),
      ...(extra.length ? [`not chapters of ${b.pack.subject.id}: ${extra.join(', ')}`] : []),
      ...(new Set(used).size !== used.length ? ['a chapter is in more than one part'] : []),
    ]);
  return ok(
    parts.map((p, k) => {
      const pack = clone(b.pack);
      pack.chapters = pickChapters(b.pack.chapters, p.chapters).map(ch => clone(ch));
      pack.subject.id = p.pack;
      pack.subject.title = p.title;
      if (k > 0 && pack.subject.i18n)
        for (const loc of Object.keys(pack.subject.i18n)) {
          const x = pack.subject.i18n[loc];
          if (x) Reflect.deleteProperty(x, 'title'); // the part's own name is translated with its next translation
        }
      if (p.node) pack.curriculum = p.node;
      Reflect.deleteProperty(pack, 'version');
      const sections = new Set(pack.chapters.flatMap(ch => (ch.sections ?? []).map(s => s.id)));
      const translations: Record<string, TranslationLike> = {};
      for (const [loc, t] of Object.entries(b.translations)) {
        const chs = pickChapters(t.chapters, p.chapters);
        if (chs.length) translations[loc] = { ...clone(t), pack: p.pack, chapters: clone(chs) };
      }
      const bridges = b.bridges.map(x => splitBridge(x, p.pack, p.chapters, sections)).filter((x): x is BridgeLike => !!x);
      return { pack: withLevels(pack, p.levels), translations, bridges };
    }),
  );
}

/** Join packs into the first one (its id, its subject): the chapters one after the other (their ids must not clash), the
    translations of each locale joined (a locale one pack lacks stays a partial translation: the rest is translated later),
    the bridges of each language pair joined. */
export function mergeBundles(
  into: PackBundle,
  others: readonly PackBundle[],
  o: { title?: string; levels: readonly string[] },
): Result<PackBundle, string[]> {
  const ids = into.pack.chapters.map(ch => ch.id),
    clash: string[] = [];
  for (const b of others)
    for (const ch of b.pack.chapters) {
      if (ids.includes(ch.id)) clash.push(`${b.pack.subject.id}/${ch.id}`);
      ids.push(ch.id);
    }
  const exIds = new Set<string>(),
    exClash: string[] = [];
  for (const b of [into, ...others])
    for (const ch of b.pack.chapters)
      for (const e of ch.exercises ?? []) {
        if (exIds.has(e.id)) exClash.push(e.id);
        exIds.add(e.id);
      }
  if (clash.length || exClash.length)
    return err([
      ...(clash.length
        ? [`chapter ids clash (${clash.join(', ')}): ids are kept so progress follows them — the packs cannot be joined`]
        : []),
      ...(exClash.length
        ? [`exercise ids clash (${exClash.slice(0, 10).join(', ')}): ids are kept so progress follows them — the packs cannot be joined`]
        : []),
    ]);
  const pack = clone(into.pack);
  for (const b of others) pack.chapters.push(...clone(b.pack.chapters));
  if (o.title) pack.subject.title = o.title;
  Reflect.deleteProperty(pack, 'version');
  const translations: Record<string, TranslationLike> = clone(into.translations);
  for (const b of others)
    for (const [loc, t] of Object.entries(b.translations)) {
      const cur = translations[loc];
      if (cur) cur.chapters.push(...clone(t.chapters));
      else translations[loc] = { ...clone(t), pack: into.pack.subject.id };
    }
  const bridges = mergeBridges(
    into.pack.subject.id,
    [into, ...others].flatMap(b => b.bridges),
  );
  return ok({ pack: withLevels(pack, o.levels), translations, bridges });
}

/* ---------- the learner's progress in the old per-subject state (KV s:<subject>:state) ---------- */

/** A subject's progress state as engine/src/10_core.js keeps it: maps keyed by section (read), exercise (res, pb), card (fc)
    and chapter (boss) ids, plus totals. */
export type ProgressState = Record<string, unknown> & {
  read?: Record<string, unknown>;
  res?: Record<string, unknown>;
  pb?: Record<string, unknown>;
  fc?: Record<string, unknown>;
  boss?: Record<string, unknown>;
};
const ID_MAPS = ['read', 'res', 'pb', 'fc', 'boss'] as const;
const idsOf = (chs: readonly PackChapter[]): Set<string> =>
  new Set(
    chs.flatMap(ch => [
      ch.id,
      ...(ch.sections ?? []).map(s => s.id),
      ...(ch.exercises ?? []).map(e => e.id),
      ...(ch.flashcards ?? []).flatMap(f => (f.id ? [f.id] : [])),
    ]),
  );

/** The progress of a pack cut into parts: every id-keyed entry goes with the part that has its item; totals and entries of
    no part stay with the first. */
export function splitState(state: ProgressState | null, parts: readonly (readonly PackChapter[])[]): ProgressState[] {
  const sets = parts.map(idsOf);
  return parts.map((_, k) => {
    const out: ProgressState = k === 0 ? clone(state ?? {}) : {};
    for (const m of ID_MAPS) {
      const src = state?.[m];
      if (!src) continue;
      out[m] = Object.fromEntries(
        Object.entries(src).filter(([id]) => {
          const at = sets.findIndex(s => s.has(id.split('#')[0] ?? id));
          return at === k || (at < 0 && k === 0);
        }),
      );
    }
    return out;
  });
}
/** The progress of packs joined: the id-keyed entries together (the target's win on the same id), totals added. */
export function mergeStates(states: readonly (ProgressState | null)[]): ProgressState {
  const out: ProgressState = clone(states[0] ?? {});
  for (const s of states.slice(1)) {
    if (!s) continue;
    for (const m of ID_MAPS) if (s[m]) out[m] = { ...s[m], ...(out[m] ?? {}) };
    if (typeof s.xp === 'number') out.xp = (typeof out.xp === 'number' ? out.xp : 0) + s.xp;
  }
  return out;
}
