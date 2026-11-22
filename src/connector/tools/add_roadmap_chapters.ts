/* noema_add_roadmap_chapters — chapters added to a step already on a Roadmap, planned or prepared (saga "chapters": straight into
   the Roadmap + one inbox entry per request) */
import { argStr, fail, text, type Tool } from '../tool.ts';
import { curState, pickCurriculum } from '../services/curricula.ts';
import { BUSY, REPLAYED } from '../services/packsave.ts';
import { chapterList, lineUpChapters, writeChapters } from '../services/roadmap.ts';
import { sagaKey } from '../services/sagas.ts';
import { checkAddChapters, findStep, type UploadChapter } from '../../features/roadmaps/domain/index.ts';
import type { Roadmap } from '../../features/roadmaps/domain/model.ts';
import { sha256Hex, str } from '../util.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_add_roadmap_chapters',
    description:
      "Add chapters to a step of a Roadmap at any time — also to a PREPARED step whose pack ended up with more chapters than its plan (the learner asked for extra material while it was built). Each chapter gets its ref, title, teaching goals, coverage and its place (after or before a chapter ref of the step, or position start / end). Only the step's chapter list grows: nothing is removed or reordered, and the pack, the prepared state, the links, the learner's progress and the other steps never change. The same request again changes nothing (a chapter already there with the same ref and title is reported, not added twice); a ref the step already uses for another chapter, a place that names no chapter of the step, an empty title or the same title twice are refused with the reason. Returns the step's chapters as they now are, to check. Then translate the new chapters with noema_save_roadmap_translation (it accepts them at once). First call noema_roadmap_map for the step's \"@id\" and its chapter refs. With { \"from_pack\": true } it lines a PREPARED step's planned chapters up again with its pack's chapters (after an upload warned that they did not line up, or after chapter titles changed).",
    inputSchema: {
      type: 'object',
      required: ['step', 'chapters_json'],
      properties: {
        curriculum_id: {
          type: 'string',
          description: 'the Roadmap (noema_curricula / noema_roadmap_map)',
        },
        step: {
          type: 'string',
          description: 'the step: its "@id" (or id, or title)',
        },
        chapters_json: {
          type: 'string',
          description:
            'ONE JSON object: { "chapters": [{ "ref": "transformers", "title": "…", "goals": ["…" teaching goals], "coverage": ["…" what it must cover], "after": "<chapter ref>" (or "before": "<chapter ref>", or "position": "start" | "end"; default end) }], "why": "one line: why the step gains them (optional)" } — a place may name a chapter added before it in the same list. Or { "from_pack": true }: line the step\'s planned chapters up again with the chapters of its prepared pack (by ref, title, close title, then place, as noema_finish_upload does) — each planned chapter shows the pack\'s own title, and the chapters the pack has beyond the plan are added',
        },
      },
    },
  },
  async handler(args, ctx) {
    const pk = await pickCurriculum(ctx, argStr(args, 'curriculum_id'), { any: true });
    if (pk.error !== undefined) return pk.error.startsWith('Which') ? text(pk.error) : fail(pk.error);
    const raw = str(args.chapters_json);
    let d: unknown;
    try {
      d = ctx.engine.llm.parseJSON(raw);
    } catch {
      return fail('chapters_json is not valid JSON — send ONE JSON object { "chapters": [...] } (no prose around it).');
    }
    if (!d || typeof d !== 'object' || Array.isArray(d)) return fail('chapters_json must be ONE JSON object { "chapters": [...] }.');
    const body = d as { chapters?: unknown; why?: unknown };
    const c = await curState(ctx, pk.c, ctx.uid);
    if (c.shared?.role === 'member' && !c.shared.ended)
      return fail(
        `“${c.title || c.goal}” is shared with the learner by ${c.shared.ownerName || 'its owner'}: its steps are the owner's. Only the owner can add chapters.`,
      );
    const nid = findStep(c as unknown as Roadmap, argStr(args, 'step').replace(/^@/, ''));
    if (!nid)
      return fail(`No step “${argStr(args, 'step')}” on “${c.title || c.goal}” — noema_roadmap_map lists the steps and their "@id"s.`);
    const n = c.nodes[nid],
      T = `“${n?.title ?? nid}” (@${nid})`;
    if ((body as { from_pack?: unknown }).from_pack === true) {
      // line the step's planned chapters up again with the chapters of its pack (as an upload does): nothing else changes
      const pid = n?.pack?.id;
      const raw2 = typeof pid === 'string' ? await ctx.storage.text(`${ctx.uid}/packs/${pid}.json`).catch(() => null) : null;
      let pack: { chapters?: UploadChapter[] } | null = null;
      try {
        pack = raw2 ? (JSON.parse(raw2) as { chapters?: UploadChapter[] }) : null;
      } catch {
        pack = null;
      }
      if (!pack || !Array.isArray(pack.chapters))
        return fail(
          `${T} has no pack to line up with${typeof pid === 'string' ? ` (no readable pack "${pid}")` : ''}: prepare it first (noema_finish_upload with its step).`,
        );
      if (!n?.chapters?.length) return fail(`${T} has no planned chapters to line up (noema_curriculum_task plans them).`);
      const key = sagaKey('chapters', c.id, nid, 'pack', (await sha256Hex(raw2 ?? '')).slice(0, 32));
      const out = await ctx.sagas.run<string>('chapters', key, async s =>
        s.step('line-up', async () => {
          const line = await lineUpChapters(ctx, c, nid, pack.chapters ?? [], key.slice(-6), 'from_pack');
          return `✅ ${T} lined up with its pack “${String(pid)}”.${line || ' Nothing to change.'}\nIts chapters now:\n${chapterList(await curState(ctx, pk.c, ctx.uid), nid)}`;
        }),
      );
      if (out.status === 'done') return text(out.value + (out.replayed ? REPLAYED : ''));
      return fail(BUSY(`The chapters of ${T}`));
    }
    const r = checkAddChapters(c as unknown as Roadmap, nid, body.chapters);
    if (r.errors.length)
      return fail(
        `${r.errors.length} problem(s) — nothing was added. Fix them and call noema_add_roadmap_chapters again with the complete corrected object:\n- ${r.errors.slice(0, 40).join('\n- ')}\nThe step's chapters now:\n${chapterList(c, nid) || '(none planned yet)'}`,
      );
    const had = r.already.length ? `\nAlready there (unchanged): ${r.already.join(', ')}.` : '';
    if (!r.fresh.length)
      return text(`Nothing to add to ${T}: every chapter is there already.${had}\nIts chapters:\n${chapterList(c, nid)}`);
    const key = sagaKey('chapters', c.id, nid, (await sha256Hex(raw)).slice(0, 32)),
      seq = Date.now().toString(36).padStart(9, '0') + '-' + key.slice(-8);
    const out = await ctx.sagas.run<string>('chapters', key, async s => {
      const direct = await s.step('write', () => writeChapters(ctx, c, nid, r.fresh, seq, typeof body.why === 'string' ? body.why : ''));
      const after = await curState(ctx, pk.c, ctx.uid),
        missing = r.fresh.filter(x => !(after.nodes[nid]?.chapters ?? []).some(ch => ch.ref === x.ref));
      return (
        `✅ ${T} gained ${r.fresh.length} chapter(s): ${r.fresh.map(x => `${x.ref} “${x.title}”`).join(', ')}. ${n?.pack?.status === 'ready' ? 'It stays prepared: its subject, links and progress are unchanged.' : 'Its state is unchanged.'}${direct ? ' Every device shows them the next time it syncs.' : " The learner's app adds them the next time it opens."}${had}` +
        (missing.length ? `\n⚠️ Not found when read back: ${missing.map(x => x.ref).join(', ')} — call again.` : '') +
        `\nIts chapters now:\n${chapterList(after, nid)}` +
        `\n🌐 Translate the new chapters with noema_save_roadmap_translation (nodes.${nid}.chapters.<ref>: title, goals, coverage) in each language of the Roadmap.`
      );
    });
    if (out.status === 'done') return text(out.value + (out.replayed ? REPLAYED : ''));
    return fail(BUSY(`The chapters of ${T}`));
  },
};
