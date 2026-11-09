/* noema_lang_package_start — step 1 of saving a language package: a signed upload URL into the learner's storage */
import { argStr, fail, text, type Tool } from '../tool.ts';
import { packCourse, packStoragePath } from '../services/lang.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_lang_package_start',
    description:
      "Step 1 of saving a language package (work/<code>.langpack.json, made by lang_course.py package): returns a signed URL (valid 2 h) into the learner's private storage and the exact curl command to PUT the package. Then call noema_lang_package_finish.",
    inputSchema: {
      type: 'object',
      properties: {
        course_id: {
          type: 'string',
          description: "the course the package is for (library course id, or the learner's own course)",
        },
        language: {
          type: 'string',
          description: 'the ISO 639 code of the language in the package',
        },
      },
      required: ['course_id', 'language'],
    },
  },
  async handler(args, ctx) {
    const pc = await packCourse(ctx, argStr(args, 'course_id'));
    if (!('origin' in pc)) return fail(pc.error);
    const code = argStr(args, 'language');
    if (!/^[a-z]{2,3}$/.test(code)) return fail('language: the ISO 639 code of the language in the package (2–3 small letters, e.g. fa)');
    const u = await ctx.storage.uploadUrl(packStoragePath(ctx, pc.id, code));
    return text(
      `Upload URL for the ${code} package of “${pc.title}” (valid 2 h; the learner's private storage):\n${u}\n\nRun in your sandbox:\ncurl -sS -X PUT -H "Content-Type: application/json" -H "x-upsert: true" -H "apikey: ${ctx.sb.key}" --data-binary @work/${code}.langpack.json "${u}"\n\nThen call noema_lang_package_finish with course_id "${pc.id}" and language "${code}".`,
    );
  },
};
