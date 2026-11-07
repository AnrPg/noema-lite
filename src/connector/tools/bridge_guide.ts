/* noema_bridge_guide — the 文A bridge format and workflow, the account's bridges and the mistakes learners reported */
import { argStr, text, type Tool } from '../tool.ts';
import { str } from '../util.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_bridge_guide',
    description:
      'Language help (文A, docs/BRIDGE.md) for students who study a subject in a language that is not their own: a sidecar per pack × native language with the words of the pack in the meaning they have IN it, translated, plus per section the key words and a short preview. Returns the format, the workflow (tools/bridge.py todo → core.json → <native>.json → check → build → noema_save_bridge), the bridges this account already has and the mistakes learners reported in them. Works for any pair of languages (tested: every direction among English, Greek, Russian, Arabic, German and French). Read it before writing a bridge.',
    inputSchema: {
      type: 'object',
      properties: {
        subject_id: {
          type: 'string',
          description: 'Optional: only this pack',
        },
      },
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  async handler(args, ctx) {
    const sid = argStr(args, 'subject_id');
    const ix = await ctx.bridges.all(sid || undefined).catch(() => ({}));
    const reps = (
      await ctx.kv.get<{ pack?: string; native?: string; k?: string; sense?: string; form?: string; sid?: string; note?: string }[]>(
        'a:bridgeReports',
        [],
      )
    ).filter(r => !sid || r.pack === sid);
    const mine = Object.entries(ix)
      .filter(([p]) => !sid || p === sid)
      .flatMap(([p, m]) =>
        Object.entries(m).map(
          ([n, x]) =>
            `- ${p} → ${n}: ${x.entries} words, ${x.coverage == null ? '?' : `${Math.round(x.coverage * 100)}%`} of the content words, ${x.chapters || 0}/${str(x.of || '?')} chapters, ${String(x.status)}`,
        ),
      );
    const lib = (ctx.env.config.library ?? [])
      .filter(m => m.bridgeLocales && (!sid || m.id === sid))
      .map(
        m =>
          `- ${m.id} (library) → ${Object.entries(m.bridgeLocales ?? {})
            .map(([n, x]) => `${n} ${Math.round((x.coverage || 0) * 100)}% ${x.status}`)
            .join(', ')}`,
      );
    return text(
      `${ctx.env.docs.bridge || 'docs/BRIDGE.md is missing in this build.'}\n\n---\n\nThis account's bridges:\n${mine.join('\n') || '(none yet)'}\n\nLibrary bridges:\n${lib.join('\n') || '(none)'}\n\nMistakes learners reported (${reps.length}):\n${
        reps
          .slice(-40)
          .map(r => `- ${r.pack} → ${r.native} · ${r.k}#${r.sense} (“${r.form}” in ${r.sid}): ${r.note || '(no note)'}`)
          .join('\n') || '(none)'
      }`,
    );
  },
};
