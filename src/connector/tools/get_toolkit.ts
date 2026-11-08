/* noema_get_toolkit — where the noema-pack-builder scripts are when the skill is not installed */
import { promised } from '../../kernel/promise.ts';
import { text, type Tool } from '../tool.ts';
import { siteFile } from '../env.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_get_toolkit',
    description:
      'Use this when the noema-pack-builder skill is NOT installed: returns the download URL of the same toolkit (scripts: start_subject, pdf_text, extract_images, fetch_image, svgkit, make_pack, unpack + references) and the commands to unpack it in your sandbox. With it you work exactly as the skill describes.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  handler(args, ctx) {
    return promised(() => {
      const zip = siteFile(ctx.env.config, 'downloads/noema-pack-builder.zip');
      return text(
        `The noema-pack-builder toolkit (same as the skill): ${zip}\n\nIn your sandbox:\ncurl -sSL -o /tmp/npb.zip "${zip}" && cd /tmp && unzip -oq npb.zip && ls /tmp/noema-pack-builder /tmp/noema-pack-builder/scripts\n\nThen follow /tmp/noema-pack-builder/SKILL.md (it is also returned by noema_authoring_guide part "workflow"); scripts are in /tmp/noema-pack-builder/scripts. (A whole new language for a language course: /tmp/noema-pack-builder/LANGUAGE_BUILDER.md — or call noema_language_package_guide.)\nIf the sandbox cannot download it: read noema_authoring_guide (all parts), write the pack JSON yourself (media as data: URIs, or web pictures as {"origin":"web","fetch":"app","url":<direct image url>,"w","h",…} which the app downloads) and save it with noema_save_pack.`,
      );
    });
  },
};
