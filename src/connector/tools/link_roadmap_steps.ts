/* noema_link_roadmap_steps — prerequisite links between steps already on a Roadmap (saga "links": one inbox entry per set of links) */
import { argStr, fail, text, type Tool } from '../tool.ts';
import { curState, pickCurriculum } from '../services/curricula.ts';
import { BUSY, REPLAYED } from '../services/packsave.ts';
import { sagaKey } from '../services/sagas.ts';
import { sha256Hex, str } from '../util.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_link_roadmap_steps',
    description:
      'Add prerequisite links between steps that are ALREADY on a Roadmap (and remove wrong ones) — for a connection found later, e.g. while growing the map, that noema_extend_roadmap cannot make because it only joins new steps. Prepared steps may get a new prerequisite too: adding or removing a link changes only the map (study order, arrows, the "after …" lines); it never changes any prepared subject, never re-plans a step and never touches the learner\'s progress. First call noema_roadmap_map for the "@<step id>"s. Checked all at once: both steps exist, from ≠ to, no cycle (from must not come after to), a removed link exists; a link already there is reported, not an error. The learner\'s app applies it the next time it is open or syncs; noema_roadmap_map shows it at once.',
    inputSchema: {
      type: 'object',
      required: ['links_json'],
      properties: {
        curriculum_id: {
          type: 'string',
          description: 'the Roadmap (noema_curricula / noema_roadmap_map)',
        },
        links_json: {
          type: 'string',
          description:
            'ONE JSON object: { "links": [{ "from": "@<prerequisite step id>", "to": "@<step that builds on it>", "why": "one line: what of from the step to needs" }], "remove": [{ "from": "@…", "to": "@…" }] } — remove is optional (to take away a wrong link)',
        },
      },
    },
  },
  async handler(args, ctx) {
    const pk = await pickCurriculum(ctx, argStr(args, 'curriculum_id'), { any: true });
    if (pk.error !== undefined) return pk.error.startsWith('Which') ? text(pk.error) : fail(pk.error);
    const E = ctx.engine,
      CJ = E.curJobs,
      rawLinks = str(args.links_json);
    const key = sagaKey('links', pk.c.id, (await sha256Hex(rawLinks)).slice(0, 40));
    const before = await ctx.sagas.finished<string>(key);
    if (before !== undefined) return text(before + REPLAYED);
    const c = await curState(ctx, pk.c, ctx.uid);
    if (c.shared?.role === 'member' && !c.shared.ended)
      return fail(
        `“${c.title || c.goal}” is shared with the learner by ${c.shared.ownerName || 'its owner'}: its map is the owner's. Only the owner can change its links.`,
      );
    if (CJ.work(c).graph || ['dag', 'audit', 'expand'].includes(String(c.stage)))
      return fail(`The map of “${c.title || c.goal}” is still being built: finish it first, then add the links.`);
    let d: unknown;
    try {
      d = E.llm.parseJSON(rawLinks);
    } catch {
      return fail('links_json is not valid JSON — send ONE JSON object { "links": [...], "remove": [...] } (no prose around it).');
    }
    const r = E.sourcePlan.linkFromClaude(c, d);
    if (r.errors)
      return fail(
        `Your links have ${r.errors.length} problem(s) — fix ALL of them and call noema_link_roadmap_steps again with the complete corrected object (noema_roadmap_map lists the steps and their ids):\n- ${r.errors.slice(0, 40).join('\n- ')}`,
      );
    const T = (id: string): string => `@${id} (“${c.nodes[id]?.title || id}”)`,
      L = (xs: { from: string; to: string }[]): string => xs.map(x => `${T(x.from)} → ${T(x.to)}`).join('; ');
    const had = r.already.length ? `\nAlready on the map (unchanged): ${L(r.already)}.` : '';
    const entry = r.entry;
    if (!entry) return text(`Nothing to change on the Roadmap “${c.title || c.goal}” (${c.id}): every link is there already.${had}`);
    const seq = Date.now().toString(36).padStart(9, '0') + '-' + key.slice(-8);
    const out = await ctx.sagas.run<string>('links', key, async s => {
      await s.step('inbox', async () => {
        const k = CJ.inboxKey(c.id, seq);
        await ctx.kv.put(k, entry);
        return k;
      });
      const n = c.edges.length + entry.links.length - entry.remove.length;
      return `✅ The Roadmap “${c.title || c.goal}” (${c.id}) — ${entry.links.length ? `links added: ${L(entry.links)}` : 'no link added'}${entry.remove.length ? `; links removed: ${L(entry.remove)}` : ''}. It now has ${n} ${n === 1 ? 'link' : 'links'}.${had}\nThe learner's app shows them the next time it is open or syncs; no prepared subject changed (nothing is re-planned, no progress is touched).`;
    });
    if (out.status === 'done') return text(out.value + (out.replayed ? REPLAYED : ''));
    return fail(BUSY(`The links of “${c.title || c.goal}”`));
  },
};
