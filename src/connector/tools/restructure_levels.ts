/* noema_restructure_levels — Claude proposes a new arrangement of a Roadmap by level (docs/CURRICULUM.md §11.3): plan → inbox →
   a pending proposal on the Roadmap, applied only when the learner (in a shared Roadmap its owner) approves it in the app.
   Saga "restructure": one inbox entry per plan, however often it is sent. */
import { argStr, fail, text, type Tool } from '../tool.ts';
import { curState, pickCurriculum } from '../services/curricula.ts';
import { BUSY, REPLAYED } from '../services/packsave.ts';
import { sagaKey } from '../services/sagas.ts';
import { sha256Hex, str } from '../util.ts';
import { describe, ladderLine, planFrom, type RestructureEntry } from '../../features/roadmaps/domain/index.ts';
import type { Roadmap } from '../../features/roadmaps/domain/model.ts';

const PLAN_DOC =
  'ONE JSON object: { "why": "one or two sentences for the learner: why this arrangement is better", "levels": "semester:6" or [{ "id": "s1", "names": { "<lang>": "…" } }, …] (optional: the new ladder, replacing the Roadmap\'s), "steps": [{ "step": "@<step id>", "level": "s2" | { "from": "s2", "to": "s3" } | null }], "chapters": [{ "step": "@<step id>", "chapter": "<chapter ref>", "level": "s3" | null }] (a planned chapter at another level than its step), "split": [{ "step": "@<step id>", "parts": [{ "title": "…", "level": "s1", "chapters": ["c1", "c2"] }, { "title": "…", "level": "s2", "chapters": ["c3"] }] }] (every chapter ref of the step in exactly one part; the first part keeps the step\'s id and subject), "merge": [{ "into": "@<step id>", "steps": ["@<step id>", …], "title": "…" }], "links": [{ "from": "@…", "to": "@…", "why": "…" }], "unlink": [{ "from": "@…", "to": "@…" }] } — give only what changes.';

export const tool: Tool = {
  definition: {
    name: 'noema_restructure_levels',
    description:
      "🪜 Propose a new arrangement of a Roadmap by level (skill §0c): give it a ladder of levels (school grades, semesters, years of study, a difficulty ladder or the course's own), move steps and chapters to other levels, split a step that spans levels, merge steps of one level, move steps on the map. It is only a PROPOSAL: the learner sees it in the app with every change listed and approves or declines it (in a shared Roadmap, its owner); nothing changes before that. Approved, it keeps every id — a step keeps its id (a split's first part, a merge's target), chapters, sections and exercises keep theirs — so the learner's progress follows the material, and translations and 文A bridges move with their chapters. A subject the learner attached to a step never changes (it may only change level); in a shared Roadmap a prepared step is not split or merged. First call noema_roadmap_map for the step ids, chapter refs and levels. action \"status\" shows the proposal waiting and the last decisions.",
    inputSchema: {
      type: 'object',
      properties: {
        curriculum_id: {
          type: 'string',
          description: 'the Roadmap (noema_curricula / noema_roadmap_map)',
        },
        action: {
          type: 'string',
          enum: ['propose', 'status'],
          description: 'propose (default, with plan_json) or status',
        },
        plan_json: {
          type: 'string',
          description: PLAN_DOC,
        },
      },
    },
  },
  async handler(args, ctx) {
    const pk = await pickCurriculum(ctx, argStr(args, 'curriculum_id'), { any: true });
    if (pk.error !== undefined) return pk.error.startsWith('Which') ? text(pk.error) : fail(pk.error);
    const E = ctx.engine,
      CJ = E.curJobs,
      act = argStr(args, 'action') || 'propose',
      name = (c: { title?: string | undefined; goal?: string | undefined }): string => c.title || c.goal || '';
    if (act === 'status') {
      const c = (await curState(ctx, pk.c, ctx.uid)) as unknown as Roadmap,
        ps = c.proposals ?? [],
        pending = ps.find(p => p.status === 'pending'),
        decided = ps.filter(p => p.status !== 'pending').slice(-3);
      const lv = c.levels?.length ? `Levels: ${ladderLine(c)}${c.levelTest ? ' (a level test before moving up)' : ''}.` : 'No levels yet.';
      return text(
        `“${name(c)}” (${c.id}). ${lv}\n` +
          (pending
            ? `Waiting for the learner's decision (proposed ${pending.at}):\n${describe(c, pending.plan)}`
            : 'No proposal is waiting.') +
          (decided.length
            ? `\nDecided: ${decided.map(p => `${p.id} ${p.status}${p.decidedAt ? ' ' + p.decidedAt : ''}`).join(' · ')}`
            : ''),
      );
    }
    if (act !== 'propose') return fail('action: propose or status');
    const raw = str(args.plan_json);
    if (!raw.trim()) return fail(`plan_json is missing — ${PLAN_DOC}`);
    const key = sagaKey('restructure', pk.c.id, (await sha256Hex(raw)).slice(0, 40));
    const before = await ctx.sagas.finished<string>(key);
    if (before !== undefined) return text(before + REPLAYED);
    const cur = await curState(ctx, pk.c, ctx.uid),
      c = cur as unknown as Roadmap;
    if (cur.shared?.role === 'member' && !cur.shared.ended)
      return fail(
        `“${name(cur)}” is shared with the learner by ${cur.shared.ownerName || 'its owner'}: its arrangement is the owner's. Only the owner can restructure it.`,
      );
    if (CJ.work(cur).graph || ['dag', 'audit', 'expand'].includes(String(cur.stage)))
      return fail(`The map of “${name(cur)}” is still being built: finish it first, then propose a new arrangement.`);
    let d: unknown;
    try {
      d = E.llm.parseJSON(raw);
    } catch {
      return fail('plan_json is not valid JSON — send ONE JSON object (no prose around it).');
    }
    const r = planFrom(c, d);
    if (!r.ok)
      return fail(
        `Your plan has ${r.error.length} problem(s) — fix ALL of them and call noema_restructure_levels again with the complete corrected object (noema_roadmap_map lists the step ids, chapter refs and levels):\n- ${r.error.slice(0, 40).join('\n- ')}`,
      );
    const plan = r.value,
      seq = Date.now().toString(36).padStart(9, '0') + '-' + key.slice(-8),
      entry: RestructureEntry = {
        v: 1,
        kind: 'restructure',
        id: 'rs-' + key.slice(-12),
        plan,
        at: new Date().toISOString(),
        via: 'connector',
      };
    const out = await ctx.sagas.run<string>('restructure', key, async s => {
      await s.step('inbox', async () => {
        const k = CJ.inboxKey(cur.id, seq);
        await ctx.kv.put(k, entry);
        return k;
      });
      return `✅ Proposed for the Roadmap “${name(cur)}” (${cur.id}) — it waits for the learner's approval in the app${cur.shared && !cur.shared.ended ? ' (the owner decides for the group)' : ''}; nothing has changed yet:\n${describe(c, plan)}\nA newer proposal replaces this one while it waits. noema_restructure_levels action "status" shows the decision.`;
    });
    if (out.status === 'done') return text(out.value + (out.replayed ? REPLAYED : ''));
    return fail(BUSY(`The new arrangement of “${name(cur)}”`));
  },
};
