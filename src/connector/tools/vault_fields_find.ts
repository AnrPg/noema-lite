/* noema_vault_fields_find — fields of the vault by name or id */
import { argStr, fail, text, type Tool } from '../tool.ts';

export const tool: Tool = {
  definition: {
    "name": "noema_vault_fields_find",
    "description": "Find fields of the vault's field graph by name (any language, part of a word is enough): id, names, parents, status. Use it to find the ids of parents before noema_vault_fields_save, and to see whether a field already exists (then merge, never duplicate).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "query": {
          "type": "string"
        },
        "ids": {
          "type": "array",
          "items": {
            "type": "string"
          },
          "description": "Or: these ids (also shows their children)"
        }
      }
    },
    "annotations": {
      "readOnlyHint": true
    }
  },
  async handler(args, ctx) {
    const sel = 'select=id,names,parents,status,aliases';
    const ids = (Array.isArray(args.ids) ? (args.ids as unknown[]) : []).map(String).filter(x => /^(Q\d+|b_[a-z]{2}|u_[0-9a-f]{12})$/.test(x)).slice(0, 50);
    if (ids.length) {
      const [rows, kids] = await Promise.all([ctx.sb.request(`/rest/v1/noema_vault_fields?${sel}&id=in.(${ids.join(',')})`), ctx.sb.request(`/rest/v1/noema_vault_fields?select=id,names->>en&parents=ov.{${ids.join(',')}}&status=eq.accepted&limit=300`)]);
      return text(JSON.stringify({ fields: rows, children: kids }));
    }
    const w = argStr(args, 'query').replace(/[*,()"\\]/g, ' ').trim().slice(0, 60);
    if (w.length < 2) return fail('query: at least 2 letters (or ids)');
    const or = ['en', 'el', 'ru', 'fr', 'de', 'es-ES', 'it'].map(l => `names->>${l}.ilike.*${w}*`).join(',');
    const rows = await ctx.sb.request<unknown[]>(`/rest/v1/noema_vault_fields?${sel}&or=(${encodeURIComponent(or)},id.eq.${encodeURIComponent(w)})&limit=40`);
    return text(rows.length ? JSON.stringify(rows) : 'No field has that name (in en el ru fr de es it). Try another word, or another language.');
  },
};
