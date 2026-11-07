/* noema_list_subjects — the library and the learner's private packs, with the curriculum step each teaches */
import { text, type Tool } from '../tool.ts';
import { curricula } from '../services/curricula.ts';

export const tool: Tool = {
  definition: {
    "name": "noema_list_subjects",
    "description": "Subjects available to this account: the shared library and the user’s own private packs (id, title, size, version).",
    "inputSchema": {
      "type": "object",
      "properties": {}
    },
    "annotations": {
      "readOnlyHint": true
    }
  },
  async handler(args, ctx) {
    const list = await ctx.storage.list(`${ctx.uid}/packs/`);
    const on: Record<string, string[]> = {};
    for (const c of await curricula(ctx).catch(() => [])) for (const [nid, n] of Object.entries(c.nodes ?? {})) if (n.pack?.id) (on[n.pack.id] ??= []).push(`“${n.title}” (${nid}) of “${c.title || c.goal}” (${c.id})`);
    const where = (id: string): string => { const w = on[id]; return w ? ` · teaches ${w.slice(0, 4).join(', ')}${w.length > 4 ? '…' : ''}` : ' · 📚 on the Shelf (no curriculum step)'; };
    const mine = list.filter(o => o.name.endsWith('.json')).map(o => `- ${o.name.replace(/\.json$/, '')} (private, ${Math.round((o.metadata?.size ?? 0) / 1024)} KB)${where(o.name.replace(/\.json$/, ''))}`);
    const lib = (ctx.env.config.library ?? []).map(s => `- ${s.id} — ${s.title} (library: ${s.counts?.chapters || '?'} chapters, ${s.counts?.exercises || '?'} exercises)${s.kind === 'language' || String(s.id).startsWith('lang:') ? '' : where(s.id)}`);
    return text(`Library (shared, read-only — copy into a private pack to extend):\n${lib.join('\n') || '(none)'}\n\nThis user's private packs:\n${mine.join('\n') || '(none yet)'}\n\nA subject teaches a step of a curriculum (the way the learner studies) or waits on their 📚 Shelf; save a pack with curriculum_id + step to put it on a step.`);
  },
};
