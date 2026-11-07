/* What travels with a pack in the learner's storage (docs/SOURCES.md §3, docs/i18n.md §10, docs/INTERACTIVE_H5P.md):
     sources       <uid>/sources/<subject>/<source>/file.<ext>  (big files in parts: file.pdf.p000, .p001…)   = engine/srcfiles.js
     translations  <uid>/packs/<subject>.tr.<locale>.json
     h5p@1 items   <uid>/packs/<subject>/activities/<id>/item.h5p                                          = engine/srcfiles.js actCloudPath
   and the checks that every one is there, with the commands that upload the missing ones. */
import type { Pack, PackActivity, PackSource } from '../engine/api.ts';
import type { ToolContext } from '../tool.ts';
import { extOf, lang0, safeSeg } from '../util.ts';
import type { SourceFileMeta } from './rows.ts';

/** The pack's own source files (make_pack.py packages them: file "sources/<name>" + size + sha256). */
export const packaged = (p: Pack): PackSource[] => (p.sources?.sources ?? []).filter(x => x && x.sha256 && /^sources\//.test(String(x.file ?? '')));
export const chunkBytes = (ctx: ToolContext): number => ctx.env.config.storageChunkBytes || 45 * 1024 * 1024;   // = engine/cloud.js chunkBytes
export const chunksOf = (ctx: ToolContext, x: { size: number }): number => (x.size > chunkBytes(ctx) ? Math.ceil(x.size / chunkBytes(ctx)) : 0);
export const partNames = (name: string, n: number): string[] => (n ? Array.from({ length: n }, (_, i) => `${name}.p${String(i).padStart(3, '0')}`) : [name]);
export const srcDir = (uid: string, sid: string, src: string): string => `${uid}/sources/${sid}/${safeSeg(src)}/`;   // = engine/srcfiles.js cloudPath

/** A file the learner already has in the account (a curriculum's material, same SHA-256) → where it is. */
export type Known = Map<string, { subj: string; src: string }>;

/** Which packaged source files are in the account's storage with the right size → { ok, missing } */
export async function sourceFileStatus(ctx: ToolContext, sid: string, srcs: PackSource[], known: Known = new Map()): Promise<{ ok: PackSource[]; missing: PackSource[] }> {
  const out = { ok: [] as PackSource[], missing: [] as PackSource[] };
  await Promise.all(srcs.map(async x => {
    if (x.sha256 && known.has(x.sha256)) { out.ok.push(x); return; }
    const want = partNames('file.' + extOf(x.fileName || x.file), chunksOf(ctx, x));
    const list = await ctx.storage.list(srcDir(ctx.uid, sid, x.id));
    const got = want.map(n => list.find(o => o.name === n));
    const total = got.reduce((a, o) => a + Number(o?.metadata?.size ?? 0), 0);
    (got.every(Boolean) && total === Number(x.size) ? out.ok : out.missing).push(x);
  }));
  return out;
}

/** The commands that upload the missing source files from Claude's sandbox (a big file: split into parts, one curl each). */
export async function uploadCommands(ctx: ToolContext, sid: string, srcs: PackSource[]): Promise<string> {
  const lines: string[] = [], key = ctx.sb.key, chunk = chunkBytes(ctx);
  for (const x of srcs) {
    const base = srcDir(ctx.uid, sid, x.id) + 'file.' + extOf(x.fileName || x.file); const n = chunksOf(ctx, x); const local = `work/${sid}/${x.file}`;
    if (!n) { lines.push(`# ${x.id} — ${x.fileName || x.file} (${(x.size / 1048576).toFixed(1)} MB)\ncurl -sS -X PUT -H "x-upsert: true" -H "Content-Type: ${x.mime || 'application/octet-stream'}" -H "apikey: ${key}" --data-binary @"${local}" "${await ctx.storage.uploadUrl(base)}"`); continue; }
    // a big file: the storage takes ≤ 50 MB per object → upload it in n parts (the app joins them again)
    const tmp = `/tmp/noema-${safeSeg(x.id)}.p`;
    const cmds = [`# ${x.id} — ${x.fileName || x.file} (${(x.size / 1048576).toFixed(1)} MB, in ${n} parts)`, `split -b ${chunk} -d -a 3 "${local}" ${tmp}`];
    const names = partNames(base, n);
    for (let i = 0; i < n; i++) cmds.push(`curl -sS -X PUT -H "x-upsert: true" -H "Content-Type: application/octet-stream" -H "apikey: ${key}" --data-binary @${tmp}${String(i).padStart(3, '0')} "${await ctx.storage.uploadUrl(names[i] ?? '')}"`);
    lines.push(cmds.join('\n'));
  }
  return lines.join('\n\n');
}

/** The rows of the learner's source-file index for these files (noema_source_files): every device shows 👁 for them. */
export function sourceFileRows(ctx: ToolContext, srcs: PackSource[], known: Known = new Map()): Record<string, SourceFileMeta> {
  const now = new Date().toISOString(), out: Record<string, SourceFileMeta> = {};
  for (const x of srcs) {
    const name = x.fileName || String(x.file).split('/').pop() || x.id, ref = x.sha256 ? known.get(x.sha256) : undefined, n = chunksOf(ctx, x);
    out[x.id] = { name: extOf(name) === extOf(x.file) ? name : name + '.' + extOf(x.file), type: x.mime || '', size: x.size, sha256: x.sha256 ?? '', added: now, cloud: true, via: 'claude', ...(ref ? { ref } : n ? { chunks: n } : {}) };
  }
  return out;
}

/* ---------- translations in their own files ---------- */
export const trPath = (uid: string, sid: string, loc: string): string => `${uid}/packs/${sid}.tr.${loc}.json`;
export const trNamed = (p: Pack): string[] => Object.entries(p.translations ?? {}).filter(([, t]) => t && t.file === true).map(([loc]) => loc);
export const trCurl = async (ctx: ToolContext, sid: string, loc: string): Promise<string> =>
  `# translation ${loc}\ncurl -sS -X PUT -H "Content-Type: application/json" -H "x-upsert: true" -H "apikey: ${ctx.sb.key}" --data-binary @work/${sid}/build/${sid}.tr.${loc}.json "${await ctx.storage.uploadUrl(trPath(ctx.uid, sid, loc))}"`;
/** Every translation the pack names is in the account and matches it → { missing: [loc], bad: ["loc: errors"] } */
export async function translationStatus(ctx: ToolContext, sid: string, p: Pack): Promise<{ missing: string[]; bad: string[] }> {
  const out = { missing: [] as string[], bad: [] as string[] };
  for (const loc of trNamed(p)) {
    const f = await ctx.storage.json(trPath(ctx.uid, sid, loc));
    if (!f) { out.missing.push(loc); continue; }
    const r = ctx.engine.packCheck.checkTranslation(f, p); if (r.errors.length) out.bad.push(`${loc}: ${r.errors.slice(0, 6).join('; ')}`);
  }
  return out;
}
/** The pack with its translations inline (a shared copy stands alone). */
export async function withTranslations(ctx: ToolContext, sid: string, p: Pack): Promise<Pack> {
  const locs = trNamed(p); if (!locs.length) return p;
  const q: Pack = { ...p, translations: { ...p.translations } }, tr = q.translations ?? {};
  for (const loc of locs) { const f = await ctx.storage.json<{ chapters?: unknown }>(trPath(ctx.uid, sid, loc)); if (f?.chapters) tr[loc] = { chapters: f.chapters }; else delete tr[loc]; }
  return q;
}

/* ---------- h5p@1: each activity's .h5p file travels beside the pack ---------- */
export const actItems = (p: Pack): PackActivity[] => (p.activities?.items ?? []).filter(a => a && a.runtime === 'h5p@1' && typeof a.h5p !== 'string' && /^activities\/[a-z0-9][a-z0-9-]{1,60}\/[^/]+\.h5p$/.test(String(a.entry ?? '')));
export const actPath = (uid: string, sid: string, a: PackActivity): string => `${uid}/packs/${sid}/${a.entry}`;   // = engine/srcfiles.js actCloudPath
export const actCurl = async (ctx: ToolContext, sid: string, a: PackActivity): Promise<string> =>
  `# activity ${a.id} — ${a.entry} (${Math.ceil((a.bytes || 0) / 1024)} KB)\ncurl -sS -X PUT -H "Content-Type: application/zip" -H "x-upsert: true" -H "apikey: ${ctx.sb.key}" --data-binary @"work/${sid}/${a.entry}" "${await ctx.storage.uploadUrl(actPath(ctx.uid, sid, a))}"`;
/** Every .h5p file the pack names is in the account with its size, its sha256 and the package rules (NoemaH5P.check through
    checkActivityPackages, the same rules as make_pack.py) → { missing: [item], errors: [text] } */
export async function activityFileStatus(ctx: ToolContext, sid: string, p: Pack): Promise<{ missing: PackActivity[]; errors: string[] }> {
  const out = { missing: [] as PackActivity[], errors: [] as string[] }, bytes: Record<string, Uint8Array> = {};
  for (const a of actItems(p)) {
    const path = actPath(ctx.uid, sid, a), dir = path.replace(/[^/]+$/, ''), name = String(a.entry).split('/').pop();
    const o = (await ctx.storage.list(dir, 100)).find(x => x.name === name);
    if (!o || Number(o.metadata?.size ?? 0) !== Number(a.bytes)) { out.missing.push(a); continue; }
    try { bytes[a.id] = new Uint8Array(await (await ctx.storage.readFresh(path)).arrayBuffer()); }
    catch { out.missing.push(a); }
  }
  const have = actItems(p).filter(a => bytes[a.id]);
  if (have.length) { const r = await ctx.engine.packCheck.checkActivityPackages({ activities: { items: have } }, a => bytes[a.id] ?? null); out.errors.push(...r.errors); }
  return out;
}

/* ---------- the languages a new pack still needs ---------- */
/** A bridge is one pair (the language read → the native one): the pack's own language → key "<native>", a translation →
    "<source>.<native>"; its file is bridges/<pack>.<key>.json (= engine/bridge.js pairKey). */
export const brKey = (src: unknown, nat: unknown, own: unknown): string => !src || lang0(src) === lang0(own) ? lang0(nat) : `${lang0(src)}.${lang0(nat)}`;

/** What a new pack (subject.authoring.rules >= 2) still needs at the end of its flow: translations and 文A bridges (pack_rules.json "languages"). */
export async function languagesTodo(ctx: ToolContext, p: Pack): Promise<string> {
  if (!(Number(p.subject.authoring?.rules) >= 2)) return '';
  const own = lang0(p.subject.language || 'en'), want = ctx.engine.packCheck.requiredLocales(own), have = Object.keys(p.translations ?? {}).map(lang0);
  const br = Object.keys((await ctx.bridges.all(p.subject.id))[p.subject.id] ?? {});
  const i18n = p.subject.i18n ?? {};
  const mt = want.translations.filter(l => !have.includes(l)), mn = have.filter(l => !i18n[l]?.title && !Object.keys(i18n).some(k => lang0(k) === l && i18n[k]?.title));
  // 文A: every (content language → native) pair — the pack's own language and each translation (pack_rules.json "bridgesFrom")
  const mb = want.bridgePairs.filter(x => !br.includes(brKey(x.source, x.native, own))).map(x => `${x.source}→${x.native}`);
  const todo = [mt.length ? `full translations into ${mt.join(', ')} (translations/<locale>/chNN.json → make_pack.py → noema_finish_upload again, or noema_save_translation)` : '',
    mn.length ? `the subject's name in ${mn.join(', ')} (subject.i18n.<locale>: title, description, hero, … — put "subject" in the translation file and save it again with noema_save_translation)` : '',
    mb.length ? `文A bridges ${mb.join(', ')} (a bridge from a translation is made from that translation's text, after it: tools/bridge.py --from <locale> → noema_save_bridge with source)` : ''].filter(Boolean);
  return todo.length ? `\n🌐 Still to do before this subject's flow ends (every new pack gets them, docs/PIPELINES.md §4b): ${todo.join('; ')}.` : `\n🌐 Translations (${want.translations.join(', ') || '—'}), the subject's name in each, and every 文A bridge (${want.bridgePairs.map(x => x.source + '→' + x.native).join(', ')}) are all there.`;
}
