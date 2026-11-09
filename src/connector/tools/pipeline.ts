/* noema_pipeline — which content flow this is and its steps in order, each with its check (docs/PIPELINES.md) */
import { promised } from '../../kernel/promise.ts';
import { argStr, fail, text, type Tool, type ToolContext, type ToolResult } from '../tool.ts';
import type { PipelineFlow } from '../env.ts';
import { rec, str } from '../util.ts';
import { pickCurriculum } from '../services/curricula.ts';
import { findLevel, ladderLine, levelBrief } from '../../features/roadmaps/domain/index.ts';
import type { Roadmap } from '../../features/roadmaps/domain/model.ts';

/** 🪜 The level part of the steps (level given): what the level means for the content of this run (docs/CURRICULUM.md §11). */
async function levelPart(ctx: ToolContext, cid: string, q: string): Promise<{ text: string } | { error: string }> {
  const pk = await pickCurriculum(ctx, cid, { any: true });
  if (pk.error !== undefined) return { error: pk.error };
  const c = pk.c as unknown as Roadmap,
    l = findLevel(c, q);
  if (!l)
    return {
      error: c.levels?.length
        ? `“${c.title || c.goal}” has no level “${q}”. Its levels: ${ladderLine(c)}.`
        : `“${c.title || c.goal}” has no levels.`,
    };
  return { text: `\n\nLevel ${l.id} of “${c.title || c.goal}” (${c.id}):\n${levelBrief(c, l.id)}` };
}

export const tool: Tool = {
  definition: {
    name: 'noema_pipeline',
    description:
      'Which content flow is this, and its steps in order (docs/PIPELINES.md). Call it FIRST for any content work: a Roadmap from sources or a goal, a new part of a Roadmap that exists, one Roadmap step, one subject, an addition, a translation, a language bridge, an import, a language-course task or a new language. action "detect" with the facts of the request gives the flow; "steps" gives each step: what to do, how it is checked (the local command python3 scripts/pipeline.py check …, a connector call, or a judgement) and its doc; "flows" lists every flow. In the sandbox the same steps run with scripts/pipeline.py (start → next → check), which records run.json; never skip a strict step.',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['detect', 'steps', 'flows'],
        },
        flow: {
          type: 'string',
          description: 'with steps: the flow id (1, 1b, 2 … 8, L1, L2)',
        },
        level: {
          type: 'string',
          description:
            'with detect or steps, for a Roadmap with levels: the level this work is for (its id or name; noema_roadmap_map lists them) — the steps then say what that level means for the content (difficulty relative to the level, the pack\'s "levels")',
        },
        curriculum_id: {
          type: 'string',
          description: 'with level: the Roadmap (may be omitted when there is only one)',
        },
        facts: {
          type: 'object',
          description: 'with detect: what the learner gave and asked',
          properties: {
            sources: {
              type: 'integer',
              description: 'how many source files',
            },
            topics: {
              type: 'integer',
              description: 'how many topics building on each other',
            },
            goal: {
              type: 'boolean',
            },
            step: {
              type: 'boolean',
              description: 'a Roadmap step handed over by noema_curriculum_task',
            },
            queue: {
              type: 'boolean',
            },
            grow: {
              type: 'boolean',
              description: 'new material for a Roadmap that exists: it grows by a new part (noema_extend_roadmap)',
            },
            extend: {
              type: 'boolean',
              description: 'material for a subject that exists',
            },
            bridge: {
              type: 'boolean',
            },
            translate: {
              type: 'boolean',
            },
            import: {
              type: 'boolean',
            },
            lang_task: {
              type: 'boolean',
            },
            new_language: {
              type: 'boolean',
            },
          },
        },
      },
      required: ['action'],
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  async handler(args, ctx) {
    const base = await flowOf(args, ctx),
      q = argStr(args, 'level');
    if (base.isError || !q || argStr(args, 'action') === 'flows') return base;
    const lv = await levelPart(ctx, argStr(args, 'curriculum_id'), q);
    if ('error' in lv) return lv.error.startsWith('Which') ? text(lv.error) : fail(lv.error);
    const first = base.content[0];
    return first?.type === 'text' ? text(first.text + lv.text) : base;
  },
};

function flowOf(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  return promised(() => {
    const F = ctx.env.docs.pipelineFlows ?? {},
      S = ctx.env.docs.pipelineSteps ?? {},
      act = argStr(args, 'action');
    const show = (f: PipelineFlow): string =>
      `Flow ${f.id}: ${f.title} — ${f.when}\n\nIn the sandbox: python3 scripts/pipeline.py start ${f.id} work/<id> (then next → check after each step).\n\n` +
      f.steps
        .map((id, i) => {
          const x = S[id] ?? {},
            c = x.check ?? {};
          return `${i + 1}. ${id} — ${x.title}${x.gate === 'planned' ? ' (planned, not enforced yet)' : x.gate === 'review' ? ' (recorded)' : ''}${x.per ? ' · per chapter' : ''}\n   ${x.what}\n   check: ${c.local || c.run ? `python3 scripts/pipeline.py check work/<id> ${id}` : c.mcp ? `call ${c.mcp}, then pipeline.py done work/<id> ${id} --note "…"${x.deferrable ? ` (the network blocks it? pipeline.py defer work/<id> ${id} --note "why", go on, retry at the end: pipeline.py pending work)` : ''}` : `${c.manual} → pipeline.py done work/<id> ${id} --note "…"`}${x.doc ? `\n   doc: ${x.doc}` : ''}`;
        })
        .join('\n');
    if (act === 'flows')
      return text(
        Object.values(F)
          .map(f => `${f.id} · ${f.title} — ${f.when}\n   ${f.steps.join(' → ')}`)
          .join('\n'),
      );
    if (act === 'steps') {
      const f = F[argStr(args, 'flow')];
      return f ? text(show(f)) : fail(`unknown flow "${str(args.flow)}" — flows: ${Object.keys(F).join(', ')}`);
    }
    if (act === 'detect') {
      // the same order as tools/pipeline.py detect
      const x = rec(args.facts),
        id = x.new_language
          ? 'L2'
          : x.lang_task
            ? 'L1'
            : x.import
              ? '8'
              : x.bridge
                ? '6'
                : x.translate
                  ? '7'
                  : x.grow
                    ? '9'
                    : x.extend
                      ? '5'
                      : x.step
                        ? '2'
                        : x.queue
                          ? '3'
                          : x.goal && !x.sources
                            ? '1b'
                            : (Number(x.topics) || 0) > 1
                              ? '1'
                              : x.sources || x.goal
                                ? '4'
                                : null;
      const f = id ? F[id] : undefined;
      return f
        ? text(show(f))
        : fail(
            'Say what the learner gave: facts.sources, facts.topics, goal, step, queue, grow, extend, bridge, translate, import, lang_task, new_language.',
          );
    }
    return fail('action: detect, steps or flows');
  });
}
