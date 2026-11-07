/* noema_language_package_guide — the complete instructions for a whole new language of a course (the skill noema-language-builder, specialised) */
import { argStr, fail, text, type Tool } from '../tool.ts';
import { siteFile } from '../env.ts';
import type { LangCourseData } from '../engine/api.ts';
import { langCodeOf, langPath, packBase, packCourse } from '../services/lang.ts';
import { message } from '../util.ts';

export const tool: Tool = {
  definition: {
    "name": "noema_language_package_guide",
    "description": "Add a whole new language to one of the learner's noema-lite language courses from ONE request (e.g. \"add Persian to my polyglot course\"): returns the complete instructions — the skill noema-language-builder specialised for this course and language (D19 first: the language is taught through each learner's native language — neutral texts that name no language outside the course, and on every grammar page a contrast note for each supported native (en el ru fr ar de hi zh ja it es sq pt tr) and the five type notes, every note structured (R2); R3: the FIRST step maps the word's parameters per part of speech, before any word): the playbook's steps in order (typology, phenomena and the word-parameter map WORD_PARAMETERS.md, the facade, the foundations, the fields, the core, links, audit; each step as a sub-agent with its audit turn), the batches with the node ids of THIS course, the toolkit and course file links, the checks, a progress file to resume, and the upload (noema_lang_package_start → curl → noema_lang_package_finish). Hours of work in a sandbox that runs long tasks; it cannot be done in a plain chat.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "course_id": {
          "type": "string",
          "description": "the course: a library course id (e.g. polyglot-semitic-zh-de) or the learner's own course (id or title); may be omitted when there is only one"
        },
        "language": {
          "type": "string",
          "description": "the language to add: ISO 639 code (fa) or English name (Persian)"
        }
      },
      "required": [
        "language"
      ]
    },
    "annotations": {
      "readOnlyHint": true
    }
  },
  async handler(args, ctx) {
    const pc = await packCourse(ctx, argStr(args, 'course_id')); if (!('origin' in pc)) return pc.error.startsWith('Which') ? text(pc.error) : fail(pc.error);
    let data: LangCourseData; try { data = await packBase(ctx, pc); } catch (e) { return fail(message(e)); }
    const code = langCodeOf(args.language, data); if (!code) return fail(`“${args.language == null ? '' : String(args.language)}”: give the language's ISO 639 code (e.g. fa for Persian).`);
    if ((data.course.languages ?? []).includes(code)) return fail(`${code} is already a language of “${pc.title}” — nothing to add.`);
    const prof = (data.world?.languages ?? []).find(l => l.code === code);
    let name = prof?.name; if (!name) { try { name = new Intl.DisplayNames(['en'], { type: 'language' }).of(code); } catch { name = undefined; } }
    const files = pc.origin === 'library' ? [{ url: siteFile(ctx.env.config, pc.meta.path), name: 'course.pack.js' }, ...(pc.meta.profiles ? [{ url: siteFile(ctx.env.config, pc.meta.profiles), name: 'course.profiles.js' }] : [])]
      : [{ url: await ctx.storage.downloadUrl(langPath(ctx.uid, pc.id), 7200), name: 'course.json' }];
    const have = await ctx.kv.has(ctx.engine.lang.langPackKey(pc.id, code)).catch(() => false);
    return text(ctx.engine.lang.langPackageGuide(data, code, { name: name || code, typ: prof?.typology ?? null, toolkitUrl: siteFile(ctx.env.config, 'downloads/noema-language-builder.zip'), files }) +
      (have ? `\n\n(The learner already has a package for ${code} in this course: a new upload replaces it.)` : ''));
  },
};
