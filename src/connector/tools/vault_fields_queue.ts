/* noema_vault_fields_queue — the vault fields waiting for review (admins) */
import { fail, text, type Tool } from '../tool.ts';
import { VAULT_LOCALES } from '../services/admin.ts';
import { message } from '../util.ts';

export const tool: Tool = {
  definition: {
    "name": "noema_vault_fields_queue",
    "description": "The field graph of the noema-lite vault (docs/VAULT.md §Fields: fields of study, each under one or more parents — a DAG, e.g. Medical physics under Physics AND Medicine; top: the ten ISCED-F broad fields b_ed … b_sv; Wikidata ids Q…; fields people proposed u_…). For admins of the app (the person in noema_admins): what waits — fields people PROPOSED (their name in one language, the parents they chose, how many files use them and some titles) and accepted fields still MISSING a name in some UI locale. Then decide with noema_vault_fields_save: accept (with names in every locale and the right parents), merge into an existing field, or reject; and fill the missing names.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "limit": {
          "type": "integer",
          "description": "How many of each (default 50, max 200)"
        }
      }
    },
    "annotations": {
      "readOnlyHint": true
    }
  },
  async handler(args, ctx) {
    const lim = Math.max(1, Math.min(200, Number(args.limit) || 50));
    let q: { counts: { accepted: number; proposed: number; untranslated: number }; proposed: unknown; untranslated: unknown };
    try { q = await ctx.sb.request<typeof q>('/rest/v1/rpc/noema_vault_fields_queue', { method: 'POST', body: { locales: VAULT_LOCALES, lim } }); }
    catch (e) { const m = message(e); return fail(/admins only/.test(m) ? 'Only the app\'s admins (table noema_admins, docs/VAULT.md §Fields) review the vault\'s fields; this account is not one.' : m); }
    return text(`Vault fields: ${q.counts.accepted} accepted, ${q.counts.proposed} proposed, ${q.counts.untranslated} accepted ones missing a name in some locale.\n` +
      `Every locale: ${VAULT_LOCALES.join(' ')}. Decide with noema_vault_fields_save (find parents with noema_vault_fields_find).\n\nPROPOSED:\n${JSON.stringify(q.proposed, null, 1)}\n\nMISSING NAMES:\n${JSON.stringify(q.untranslated)}`);
  },
};
