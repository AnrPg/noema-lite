/* noema_get_pack_url — a download link for a pack (or one of its translations) */
import { argStr, fail, text, type Tool } from '../tool.ts';
import { siteFile } from '../env.ts';
import { ID_RE, LOCALE_RE, message } from '../util.ts';
import { curState, stepOfPack } from '../services/curricula.ts';
import { languagesOf } from '../../features/roadmaps/domain/index.ts';
import type { Roadmap } from '../../features/roadmaps/domain/model.ts';
import type { ToolContext } from '../tool.ts';

/** 🌐 the pack teaches a Roadmap step: the Roadmap's languages, for unpack.py --languages (subject.json authoring.languages), so
    the pipeline and make_pack.py ask only for those — or, with none set, that the default (all five) holds */
async function languagesNote(ctx: ToolContext, sid: string): Promise<string> {
  const st = await stepOfPack(ctx, sid).catch(() => null);
  if (!st) return '';
  const c = await curState(ctx, st.c, ctx.uid).catch(() => st.c);
  const v = languagesOf(c as unknown as Roadmap) ?? languagesOf(st.c as unknown as Roadmap),
    T = `“${c.title || c.goal}”`,
    own = (c.language || 'en').split('-')[0];
  if (!v)
    return `\n🌐 It teaches the step “${c.nodes[st.nid]?.title ?? st.nid}” of ${T}, which has no languages set: the default holds, so the pack gets full translations into English, Greek, Russian, German and French (those that are not ${own}) and every 文A pair. If the learner wants ${T} in ${own} only, set it once with noema_set_roadmap_languages {"translations": []} and unpack with --languages '{"translations": []}'.`;
  const j = JSON.stringify({ translations: v.translations, ...(v.bridges ? { bridges: v.bridges } : {}) });
  return `\n🌐 It teaches the step “${c.nodes[st.nid]?.title ?? st.nid}” of ${T}, whose languages are ${v.translations.length ? `${own} + ${v.translations.join(', ')}` : `${own} only`}: python3 scripts/unpack.py ${sid}.json work --repair --languages '${j}' (subject.json "authoring": { "languages": ${j} }), so the pipeline and make_pack.py ask only for those.`;
}

export const tool: Tool = {
  definition: {
    name: 'noema_get_pack_url',
    description:
      "A temporary download URL for an existing pack (the user’s private pack, or a library pack) — use it to make ADDITIVE updates (never renumber ids: progress is keyed by them). With locale: the pack's translation into that language (its noema-translation file) — what the 文A bridges from that translation are made from.",
    inputSchema: {
      type: 'object',
      properties: {
        subject_id: {
          type: 'string',
        },
        locale: {
          type: 'string',
          description: 'Optional: a translation of the pack (e.g. el, ru) instead of the pack itself',
        },
      },
      required: ['subject_id'],
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  async handler(args, ctx) {
    const sid = argStr(args, 'subject_id');
    if (!ID_RE.test(sid)) return fail('subject_id: lowercase letters, digits, hyphens');
    const loc = argStr(args, 'locale'); // a translation of the pack (its noema-translation file): what a translation's 文A bridges are made from
    if (loc && !LOCALE_RE.test(loc)) return fail('locale: a language code such as el, ru');
    if ((ctx.env.config.library ?? []).some(s => s.id === sid))
      return text(`Library pack (public): ${siteFile(ctx.env.config, `library/subjects/${sid}/${loc ? `tr.${loc}.json` : 'pack.json'}`)}`);
    const file = loc ? `${sid}.tr.${loc}.json` : `${sid}.json`;
    let url: string;
    try {
      url = await ctx.storage.downloadUrl(`${ctx.uid}/packs/${file}`, 3600);
    } catch (e) {
      return fail(
        loc
          ? `No ${loc} translation of "${sid}" (${message(e)}) — save it first (noema_save_translation).`
          : `No private pack "${sid}" (${message(e)}).`,
      );
    }
    return text(
      `Download (valid 1 h): ${url}\ncurl -sSL -o ${file} "<that URL>"${loc ? `\n(Beside the pack's ${sid}.json, tools/bridge.py … ${sid}.json --from ${loc} reads it.)` : await languagesNote(ctx, sid)}`,
    );
  },
};
