/* noema_image_fetch — one picture (pages and Wikimedia file pages resolved), shown to Claude */
import { argStr, fail, type Tool } from '../tool.ts';
import type { Content } from '../tool.ts';
import type { Picture } from '../engine/api.ts';
import { message, toBase64 } from '../util.ts';

export const tool: Tool = {
  definition: {
    "name": "noema_image_fetch",
    "description": "Get one picture from the web — an image url, OR a page: Wikimedia / Wikipedia file pages (any language, “#/media/File:…”) and any other page are resolved to their picture. Shows you the picture and returns its file url, size (W×H pixels for regions) and a ready media.json entry (\"fetch\": \"app\": the noema-lite app downloads and embeds it). Use it when your sandbox cannot download the picture itself (no network to that site) — or simply to look at a candidate.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "url": {
          "type": "string"
        },
        "media_id": {
          "type": "string",
          "description": "the id for media.json (optional)"
        },
        "alt": {
          "type": "string",
          "description": "what it shows (optional)"
        }
      },
      "required": [
        "url"
      ]
    },
    "annotations": {
      "readOnlyHint": true
    }
  },
  async handler(args, ctx) {
    const u = argStr(args, 'url'); if (!/^https?:\/\//.test(u)) return fail('url must start with http(s)://');
    const IMGL = ctx.engine.imgLib;
    let p: Picture; try { p = await IMGL.fetchPicture(u); } catch (e) { return fail(`Could not get the picture: ${message(e)}. Take another candidate (noema_image_search), or give the image file url.`); }
    let show: Picture | null = p; if (p.bytes.byteLength > 3.5e6 || Math.max(p.w, p.h) > 2600) { const pv = IMGL.previewUrl(p.url); show = pv ? await IMGL.fetchPicture(pv).catch(() => null) : null; }
    const small = Math.max(p.w, p.h) < 800, mid = argStr(args, 'media_id') || 'web-' + Date.now().toString(36);
    const entry = { id: mid, origin: 'web', fetch: 'app', url: p.url, page: p.page || (u !== p.url ? u : undefined), retrieved: new Date().toISOString().slice(0, 10), w: p.w, h: p.h, alt: argStr(args, 'alt'), credit: '…', license: '…' };
    const info = `✅ ${p.mime} ${p.w}×${p.h} px, ${(p.bytes.byteLength / 1048576).toFixed(1)} MB\nfile url: ${p.url}${p.page ? `\nfound on: ${p.page}` : ''}${small ? '\n⚠️ small (< 800 px on the long side): look for a larger version' : ''}\n\nEither download it in your sandbox (python3 scripts/fetch_image.py work/<id> ${mid} "${p.url}" --alt "…" --page "${entry.page || p.url}"), or — if your sandbox cannot reach it — register it in work/<id>/media/media.json WITHOUT a file (the app downloads and embeds it; regions in these W×H pixel coordinates; fill in credit + licence from the page):\n${JSON.stringify(entry)}`;
    const content: Content[] = [{ type: 'text', text: info }];
    if (show && show.bytes.byteLength <= 3.5e6 && show.mime !== 'image/svg+xml') content.push({ type: 'image', data: toBase64(show.bytes), mimeType: show.mime });
    else content.push({ type: 'text', text: show ? '(an SVG drawing — not shown here)' : '(too large to show here — it is fine for the pack)' });
    return { content };
  },
};
