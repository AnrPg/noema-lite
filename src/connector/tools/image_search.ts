/* noema_image_search — pictures from the whole web (engine/imglib.js) */
import { argStr, fail, text, type Tool } from '../tool.ts';
import { str } from '../util.ts';

export const tool: Tool = {
  definition: {
    name: 'noema_image_search',
    description:
      "Search pictures for a pack on the whole web and in open collections at once: Bing Images and DuckDuckGo Images (any site — what a Google image search shows too), Wikimedia Commons, Openverse, NASA, iNaturalist, Wellcome Collection, Art Institute of Chicago. Returns candidates (image url, page, size, licence, credit). The packs are for the learner's personal study: any licence is fine, the source is recorded. Look at the best ones with noema_image_fetch.",
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'What the picture shows, usually in English (e.g. "DNA replication fork diagram labeled")',
        },
        n: {
          type: 'integer',
          description: 'How many (default 12, max 30)',
        },
        sources: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['bing', 'duckduckgo', 'commons', 'openverse', 'nasa', 'inaturalist', 'wellcome', 'artic'],
          },
          description: 'Only these (default: bing, commons, openverse, duckduckgo)',
        },
      },
      required: ['query'],
    },
    annotations: {
      readOnlyHint: true,
    },
  },
  async handler(args, ctx) {
    const q = argStr(args, 'query');
    if (!q) return fail('query is empty');
    const r = await ctx.engine.imgLib.searchImages(q, {
      n: Math.min(30, Math.max(1, Number(args.n) || 12)),
      sources: Array.isArray(args.sources) ? (args.sources as string[]) : null,
    });
    if (!r.results.length)
      return fail(
        `No pictures found for “${q}”${
          Object.keys(r.errors).length
            ? ` (unavailable: ${Object.entries(r.errors)
                .map(([k, v]) => k + ': ' + v)
                .join('; ')})`
            : ''
        }. Try other words (English often works best), or web_search for pages with pictures.`,
      );
    return text(
      `${r.results.length} pictures for “${q}” (personal study: any licence is fine — record the source):\n` +
        r.results
          .map(
            (x, i) =>
              `${i + 1}. ${x.title ? x.title.slice(0, 90) + ' — ' : ''}${x.w && x.h ? `${x.w}×${x.h} · ` : ''}${x.source} · ${x.license || '?'}${x.credit ? ' · ' + str(x.credit).slice(0, 60) : ''}\n   image: ${x.url}\n   page: ${x.page || '—'}`,
          )
          .join('\n') +
        (Object.keys(r.errors).length ? `\n(unavailable now: ${Object.keys(r.errors).join(', ')})` : '') +
        `\n\nLook at the best ones with noema_image_fetch (it shows you the picture and gives its size), or download them in your sandbox with fetch_image.py.`,
    );
  },
};
