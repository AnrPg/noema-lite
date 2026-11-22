/* noema_set_roadmap_languages — which translations and 文A bridges a Roadmap's packs and its own words get (saga "languages":
   straight into the Roadmap + an inbox entry) */
import { argStr, fail, text, type Tool } from '../tool.ts';
import { curState, pickCurriculum } from '../services/curricula.ts';
import { BUSY, REPLAYED } from '../services/packsave.ts';
import { languagesLine, roadmapTodo, writeLanguages } from '../services/roadmap.ts';
import { sagaKey } from '../services/sagas.ts';
import { checkLanguages, languagesOf } from '../../features/roadmaps/domain/index.ts';
import type { Roadmap } from '../../features/roadmaps/domain/model.ts';
import { sha256Hex, str } from '../util.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_set_roadmap_languages',
    description:
      'Set the languages of a Roadmap: which full translations its packs and its own words get, and which 文A bridge pairs (the language read → the learner\'s own). Without it every pack gets the default (English, Greek, Russian, German, French and every bridge pair). Once set, the "still to do" lists of noema_finish_upload, noema_save_translation and noema_curriculum_task, the step tasks and the pipeline checks (subject.authoring.languages) ask only for these — an English + Greek Roadmap shows no Russian, German or French work. Call it when the learner names the languages (e.g. right after noema_create_roadmap); calling it again replaces them.',
    inputSchema: {
      type: 'object',
      required: ['languages_json'],
      properties: {
        curriculum_id: {
          type: 'string',
          description: 'the Roadmap (noema_curricula / noema_roadmap_map)',
        },
        languages_json: {
          type: 'string',
          description:
            'ONE JSON object: { "translations": ["el"] (languages besides the Roadmap\'s own), "bridges": ["en>el", "el>en"] (optional: the 文A pairs "language read>native"; left out = every pair among the Roadmap\'s language and its translations, each then required of every pack; [] = no bridges) }',
        },
      },
    },
  },
  async handler(args, ctx) {
    const pk = await pickCurriculum(ctx, argStr(args, 'curriculum_id'), { any: true });
    if (pk.error !== undefined) return pk.error.startsWith('Which') ? text(pk.error) : fail(pk.error);
    const raw = str(args.languages_json);
    let d: unknown;
    try {
      d = ctx.engine.llm.parseJSON(raw);
    } catch {
      return fail('languages_json is not valid JSON — send ONE JSON object { "translations": [...], "bridges": [...] }.');
    }
    const c = await curState(ctx, pk.c, ctx.uid);
    if (c.shared?.role === 'member' && !c.shared.ended)
      return fail(
        `“${c.title || c.goal}” is shared with the learner by ${c.shared.ownerName || 'its owner'}: only the owner sets its languages.`,
      );
    const r = checkLanguages(c, d);
    if (!r.value) return fail(`${r.errors.length} problem(s) — nothing was changed:\n- ${r.errors.join('\n- ')}`);
    const v = r.value,
      key = sagaKey('languages', c.id, (await sha256Hex(raw)).slice(0, 32)),
      seq = Date.now().toString(36).padStart(9, '0') + '-' + key.slice(-8);
    const out = await ctx.sagas.run<string>(
      'languages',
      key,
      async s => {
        const direct = await s.step('write', () => writeLanguages(ctx, c, v, seq));
        const after = await curState(ctx, pk.c, ctx.uid),
          rest = roadmapTodo(ctx.engine, after);
        return (
          `✅ The languages of “${c.title || c.goal}” (${c.id}) — ${languagesLine(ctx.engine, after)}.${direct ? ' Every device has them at its next sync.' : " The learner's app takes them the next time it opens."}` +
          `\nNew step tasks name them; put "authoring": { "languages": ${JSON.stringify(v)} } into subject.json of a pack already being built for this Roadmap so its pipeline checks follow them.` +
          (rest.length
            ? `\nThe Roadmap's own words still untranslated: ${rest.map(x => `${x.loc} — ${Object.keys(x.todo.nodes).length} step(s)${x.todo.title ? ' and its title' : ''}`).join('; ')}.`
            : "\n🌐 The Roadmap's own words are translated into all of them.")
        );
      },
      {
        // a replay only while these are still the Roadmap's languages (set el, then fr, then el again: the third call writes)
        stillDone: async () => {
          const now = languagesOf((await curState(ctx, pk.c, ctx.uid)) as unknown as Roadmap);
          return !!now && JSON.stringify([now.translations, now.bridges ?? null]) === JSON.stringify([v.translations, v.bridges ?? null]);
        },
      },
    );
    if (out.status === 'done') return text(out.value + (out.replayed ? REPLAYED : ''));
    return fail(BUSY(`The languages of “${c.title || c.goal}”`));
  },
};
