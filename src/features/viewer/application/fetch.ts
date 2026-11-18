/* noema-lite — 👁 the file viewer: a file at a web address, straight (CORS) or through the site's /api/file. */
import { fileRefusal, type FileRefusal } from '../domain/formats.ts';
import type { FetchedFile, ViewerNet } from '../../../ports/viewer.ts';

const tryGet = async (get: () => Promise<FetchedFile>): Promise<FetchedFile | null> => {
  try {
    return await get();
  } catch {
    return null; // no CORS or no network
  }
};

/** → { blob } or { error: the proxy's refusal | null (the network, a static server's 404) } */
export async function fetchFile(url: string, net: ViewerNet): Promise<{ blob: Blob } | { error: FileRefusal | null }> {
  const r = await tryGet(() => net.direct(url));
  if (r?.ok) return { blob: await r.blob() };
  const proxy = net.proxy();
  if (!proxy) return { error: null };
  const v = await tryGet(() => proxy(url));
  if (!v) return { error: null };
  if (v.ok) return { blob: await v.blob() };
  return { error: fileRefusal(await v.text().catch(() => ''), n => v.header(n)) };
}
