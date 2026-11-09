/* noema_get_pack_url — a download link for a pack (or one of its translations) */
import { argStr, fail, text, type Tool } from '../tool.ts';
import { siteFile } from '../env.ts';
import { ID_RE, LOCALE_RE, message } from '../util.ts';

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
      `Download (valid 1 h): ${url}\ncurl -sSL -o ${file} "<that URL>"${loc ? `\n(Beside the pack's ${sid}.json, tools/bridge.py … ${sid}.json --from ${loc} reads it.)` : ''}`,
    );
  },
};
