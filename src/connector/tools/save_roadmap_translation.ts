/* noema_save_roadmap_translation — a Roadmap's own words in one language (saga "roadmap-i18n": straight into the Roadmap + an inbox entry) */
import { argStr, fail, text, type Tool } from '../tool.ts';
import { curState, pickCurriculum } from '../services/curricula.ts';
import { BUSY, REPLAYED } from '../services/packsave.ts';
import { roadmapTodo } from '../services/roadmap.ts';
import { sagaKey } from '../services/sagas.ts';
import type { Curriculum } from '../engine/api.ts';
import { message, sha256Hex } from '../util.ts';

export const tool: Tool = {
  definition: {
    "name": "noema_save_roadmap_translation",
    "description": "Save the translation of a Roadmap's own words into one language: its title and goal, and per step EVERYTHING its panel shows: title, summary, learning goals, domains, and each chapter's title, teaching goals and coverage (the map, the list and the step panel then show them when the learner's app is in that language — nothing of a translated step may stay in the Roadmap's own language). Made together with the packs' translations, into the same languages (English, Greek, Russian, German, French minus the Roadmap's own): the whole map (title + every step's title and summary) right after noema_create_roadmap, then each step's learning goals, domains and chapters (title, goals, coverage) when that step's pack is translated. It is written straight into the Roadmap, so every device shows it at its next sync. Partial objects are merged into what is there. noema_save_translation and noema_curriculum_task list exactly what is still untranslated.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "curriculum_id": {
          "type": "string"
        },
        "locale": {
          "type": "string",
          "description": "e.g. el, ru, en"
        },
        "translation_json": {
          "type": "string",
          "description": "ONE JSON object: { \"title\": \"…\", \"goal\": \"…\", \"nodes\": { \"<step id>\": { \"title\": \"…\", \"summary\": \"…\", \"learningGoals\": [\"…\" one per goal, same order], \"domains\": [\"…\" one per domain], \"chapters\": { \"<chapter ref>\": { \"title\": \"…\", \"goals\": [\"…\" one per teaching goal], \"coverage\": [\"…\" one per coverage item] } } } } } — any subset (a chapter may also be its title alone, \"…\")"
        }
      },
      "required": [
        "curriculum_id",
        "locale",
        "translation_json"
      ]
    }
  },
  async handler(args, ctx) {
    const pk = await pickCurriculum(ctx, argStr(args, 'curriculum_id')); if (pk.error !== undefined) return fail(pk.error);
    const loc = argStr(args, 'locale'), CUR = ctx.engine.curriculum, CJ = ctx.engine.curJobs, rawT = args.translation_json == null ? '' : String(args.translation_json);
    let d: { title?: string; nodes?: Record<string, unknown> }; try { d = JSON.parse(rawT) as typeof d; } catch (e) { return fail('translation_json is not valid JSON: ' + message(e)); }
    const c = await curState(ctx, pk.c, ctx.uid), errs = CUR.checkI18n(c, loc, d);
    if (errs.length) return fail(`${errs.length} problem(s) — fix them and call again:\n- ${errs.slice(0, 40).join('\n- ')}`);
    // Straight into the Roadmap (a write that only lands if nobody changed it since we read it), so it does not depend on an
    // app tab picking it up; the inbox row stays as well — the app applies it again harmlessly (mergePlans keeps the newest).
    CUR.setI18n(c, loc, d);
    const key = sagaKey('roadmap-i18n', c.id, loc, (await sha256Hex(rawT)).slice(0, 32)), seq = Date.now().toString(36).padStart(9, '0') + '-' + key.slice(-8);
    const out = await ctx.sagas.run<string>('roadmap-i18n', key, async s => {
      const direct = await s.step('direct', () => ctx.kv.update<Curriculum | null>('a:curriculum:' + c.id, cur => { if (!cur || cur.id !== c.id) return null; CUR.setI18n(cur, loc, d); return cur; }).catch(() => false));
      await s.step('inbox', async () => { const k = CJ.inboxKey(c.id, seq); await ctx.kv.put(k, { v: 1, kind: 'i18n', locale: loc, data: d, at: new Date().toISOString(), via: 'claude-app' }); return k; });
      const n = Object.keys(d.nodes ?? {}).length, rest = roadmapTodo(ctx.engine, c);
      return `✅ Saved: “${c.title || c.goal}” in ${loc}${d.title ? ' (its title' + (n ? ` and ${n} step(s))` : ')') : ` — ${n} step(s)`}. ${direct ? ' Every device shows it the next time it syncs.' : ' The learner\'s app applies it the next time it opens (or comes to the front).'}` +
        (rest.length ? `\nStill untranslated: ${rest.map(x => `${x.loc} — ${x.todo.title ? 'the title, ' : ''}${Object.keys(x.todo.nodes).length} step(s)`).join('; ')}${rest.some(x => Object.values(x.todo.nodes).some(v => v.title)) ? '' : ' (learning goals / chapters of planned steps: they come with each step\'s pack translations)'}.` : '\n🌐 The whole Roadmap is translated into every language its packs get.');
    });
    if (out.status === 'done') return text(out.value + (out.replayed ? REPLAYED : ''));
    return fail(BUSY(`${c.title || c.goal} (${loc})`));
  },
};
