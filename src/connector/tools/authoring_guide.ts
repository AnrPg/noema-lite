/* noema_authoring_guide — the content contract (skill workflow, CONTENT_SPEC, VISUAL, INTERACTIVE, the language rules) */
import { argStr, text, type Tool } from '../tool.ts';

export const tool: Tool = {
  definition: {
    "name": "noema_authoring_guide",
    "description": "The noema-lite content contract. READ IT before creating or changing a subject pack: workflow, chapter/section/exercise schema, visual exercises & pictures (sources, web, function graphs), interactive activities (mini-apps in the theory and graded sim exercises), quantities, pack format.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "part": {
          "type": "string",
          "enum": [
            "workflow",
            "content",
            "visual",
            "interactive",
            "languages",
            "all"
          ],
          "description": "Default: all (subject packs). \"interactive\": interactive activities — the contract (docs/INTERACTIVE.md: tiers, the interactive block, the sim exercise, the window.noema API, sim-spec@1 specs and the checks grader, h5p@1 items (.h5p files beside the pack, h5pByLocale), limits, fallbacks), the authoring playbook, the expression language of sim-spec@1 and the H5P runtime. \"languages\": the binding rules for language courses (docs/LANGUAGE_RULES.md — D19 first: taught through the learner's native language, docs/language-packs.md — and how to answer a task)"
        }
      }
    },
    "annotations": {
      "readOnlyHint": true
    }
  },
  async handler(args, ctx) {
    const D = ctx.env.docs, part = argStr(args, 'part') || 'all';
    const parts: Record<string, string | undefined> = { workflow: D.workflow, content: D.content, visual: D.visual, ...(D.interactive ? { interactive: D.interactive } : {}) };
    if (part === 'languages') return text(D.languages || 'No language rules in this build.');   // language courses: the binding rules (D1–D21, D19 first) + docs/language-packs.md
    return text(part === 'all' ? Object.values(parts).join('\n\n---\n\n') : parts[part] || D.workflow || '');
  },
};
