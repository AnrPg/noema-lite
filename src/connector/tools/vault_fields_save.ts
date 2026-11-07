/* noema_vault_fields_save — change the vault's field graph (admins; all or nothing) */
import { argStr, fail, text, type Tool } from '../tool.ts';
import { VAULT_LOCALES } from '../services/admin.ts';
import { message, rec } from '../util.ts';

export const tool: Tool = {
  definition: {
    "name": "noema_vault_fields_save",
    "description": "Change the vault's field graph (admins only); everybody sees accepted fields at once. items: [{\"id\"?, \"names\"? {locale: name} (ADDED to its names), \"aliases\"? [other names, abbreviations], \"parents\"? [ids] (replace) | \"add_parents\"? [ids], \"status\"? \"accepted\"|\"rejected\", \"merge_into\"? id (its files and children move there, its names become aliases), \"note\"?}] — no id: a new accepted field (enrich the graph: missing sub-fields, extra parents). Rules: a short, natural, usual name in EVERY UI locale (en el ru fr ar-EG de hi zh-Hans zh-Hant ja it es-ES sq pt-PT tr), as a university of that language names the field (capital first letter where the script has one); every sensible parent (a field may sit in many places) but never a parent below the field; a duplicate of an existing field is merged, not accepted; a proposal that is not a field of study (a course code, a person, junk) is merged into the closest field or rejected.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "items_json": {
          "type": "string",
          "description": "The items, a JSON array (≤ 200)"
        }
      },
      "required": [
        "items_json"
      ]
    }
  },
  async handler(args, ctx) {
    let items: unknown; try { items = JSON.parse(argStr(args, 'items_json')); } catch { return fail('items_json is not valid JSON — send ONE JSON array.'); }
    if (!Array.isArray(items) || !items.length || items.length > 200) return fail('items_json: an array of 1 to 200 items');
    const lacks = items.map(rec).filter(it => !it.merge_into && it.status !== 'rejected' && (it.status === 'accepted' || !it.id) && VAULT_LOCALES.some(l => !String(rec(it.names)[l] ?? '').trim())).map(it => String(it.id || rec(it.names).en || '?'));
    if (lacks.length) return fail(`An accepted field needs its name in every UI locale (${VAULT_LOCALES.join(' ')}); missing in: ${lacks.slice(0, 20).join(', ')}.`);
    let r: { saved: string[] };
    try { r = await ctx.sb.request<typeof r>('/rest/v1/rpc/noema_vault_fields_save', { method: 'POST', body: { items } }); }
    catch (e) { return fail(message(e).replace(/^Supabase \d+: /, '') + '\nNothing was saved (all or nothing): fix it and send all items again.'); }
    return text(`✅ Saved ${r.saved.length} field(s): ${r.saved.join(', ')}. Everybody sees accepted fields at once. Call noema_vault_fields_queue for what still waits.`);
  },
};
