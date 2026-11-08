/* noema_save_bridge — one 文A bridge (saga "bridge": the file, its row in noema_bridges, the upload cleared) */
import { argStr, fail, text, type Tool } from '../tool.ts';
import type { Bridge, Pack } from '../engine/api.ts';
import { siteFile } from '../env.ts';
import { brKey } from '../services/packfiles.ts';
import { BUSY, REPLAYED } from '../services/packsave.ts';
import type { BridgeSummary } from '../services/rows.ts';
import { sagaKey } from '../services/sagas.ts';
import type { ToolContext } from '../tool.ts';
import { hash36, ID_RE, lang0, MAX_INLINE, message, sha256Hex, str } from '../util.ts';

/** = engine/bridge.js summary(): what the app's index keeps of a bridge. */
const bridgeSummary = (b: Bridge): BridgeSummary => ({
  v: hash36(JSON.stringify(b.entries ?? []) + JSON.stringify(b.sections ?? {}) + JSON.stringify(b.anchors ?? [])),
  status: b.status ?? null,
  coverage: typeof b.coverage === 'number' ? b.coverage : null,
  everyday: typeof b.everyday === 'number' ? b.everyday : null,
  chapters: (b.chapters ?? []).length || null,
  of: b.of ?? null,
  previews: Object.values(b.sections ?? {}).filter(x => x.preview).length,
  entries: (b.entries ?? []).length,
  at: Date.now(),
  via: 'claude',
});

/** A pack of the account, or of the library (from the website). */
async function packFor(ctx: ToolContext, id: string): Promise<Pack | null> {
  if ((ctx.env.config.library ?? []).some(s => s.id === id)) {
    const r = await ctx.env.fetch(siteFile(ctx.env.config, `library/subjects/${id}/pack.json`)).catch(() => null);
    return r?.ok ? (r.json() as Promise<Pack>).catch(() => null) : null;
  }
  return ctx.storage.json<Pack>(`${ctx.uid}/packs/${id}.json`);
}

export const tool: Tool = {
  definition: {
    name: 'noema_save_bridge',
    description:
      'Save one built language bridge (format "noema-bridge", made by tools/bridge.py build, ≤ 1.5 MB) to the learner\'s account, for one of their own packs or a library pack. A bridge is one pair: the language the learner READS → their native language. The language read is the pack\'s own or one of its translations (source, e.g. the el translation of an en pack: el→en, el→ru, el→ar), and every new pack gets every pair (pack_rules.json "bridgesFrom"); a translation\'s bridges are built from that translation\'s text (tools/bridge.py --from <locale>) after it is saved. Bridges are usually 50–150 KB: do NOT paste the file — call with subject_id + native only to get an upload command, run it (curl), then call again with the same subject_id + native. bridge_json (inline) is only for small files. It is checked exactly as the app checks it (against the pack: its id, its language, plain text only, no function words); problems come back as a list. On success every device of the learner shows the 文A help for that pack and native language. To publish a draft (status reviewed), change "status" in the file and save it again the same way.',
    inputSchema: {
      type: 'object',
      properties: {
        subject_id: {
          type: 'string',
          description:
            'With native and no bridge_json: the pack of the bridge (its "pack") — returns the upload command, or saves the uploaded file',
        },
        native: {
          type: 'string',
          description: 'With subject_id: the native language of the bridge (e.g. el, ru, ar, de, fr)',
        },
        source: {
          type: 'string',
          description:
            'With subject_id: the language the learner reads when it is one of the pack\'s TRANSLATIONS (e.g. "el" for the Greek translation of an English pack); leave it out for the pack\'s own language',
        },
        bridge_json: {
          type: 'string',
          description: 'Optional, small files only: the whole bridge file as JSON text',
        },
      },
    },
  },
  async handler(args, ctx) {
    const sid = argStr(args, 'subject_id'),
      uid = ctx.uid;
    let raw = str(args.bridge_json);
    const want = lang0(args.native),
      wsrc = lang0(args.source);
    if (wsrc && !/^[a-z]{2,3}$/.test(wsrc))
      return fail('source: the language the learner reads (the pack\'s own, or one of its translations), e.g. "el"');
    const ownOf = async (): Promise<string> => (await packFor(ctx, sid))?.subject.language || 'en';
    const up =
      !raw && ID_RE.test(sid) && /^[a-z]{2,3}$/.test(want)
        ? `${uid}/bridges/incoming/${sid}.${brKey(wsrc, want, wsrc ? await ownOf() : wsrc)}.json`
        : ''; // uploaded here, live only once checked
    if (!raw && !up)
      return fail(
        'Give subject_id + native (e.g. "ru") — and source when the bridge is made from a translation (e.g. "el") — to get an upload command for the built bridge file, or bridge_json for a small one.',
      );
    if (up) {
      raw = (await ctx.storage.text(up)) ?? '';
      const bkey = up.slice(up.lastIndexOf('/') + 1 + sid.length + 1, -'.json'.length),
        bfile = `work/${sid}/bridges/${bkey.includes('.') ? `from-${bkey.split('.')[0]}/` : ''}${sid}.${bkey}.bridge.json`; // where tools/bridge.py build writes it by default (one file per pair)
      if (!raw)
        return text(
          `Upload the bridge — run in your sandbox (URL valid 2 h):\n\ncurl -sS -X PUT -H "Content-Type: application/json" -H "x-upsert: true" -H "apikey: ${ctx.sb.key}" --data-binary @${bfile} "${await ctx.storage.uploadUrl(up)}"\n\n(${bfile} = the file tools/bridge.py build wrote by default${wsrc ? ` from the ${wsrc} translation (--from ${wsrc})` : ''}.) Then call noema_save_bridge with subject_id "${sid}", native "${want}"${wsrc ? ` and source "${wsrc}"` : ''} again.`,
        );
    }
    if (raw.length > MAX_INLINE)
      return fail(`Too big (${Math.round(raw.length / 1024)} KB > 1.5 MB): build it per native language, and keep notes short.`);
    let b: Bridge;
    try {
      b = JSON.parse(raw) as Bridge;
    } catch (e) {
      return fail((up ? 'The uploaded file' : 'bridge_json') + ' is not valid JSON: ' + message(e));
    }
    if (up && (b.pack !== sid || lang0(b.native) !== want || (wsrc && lang0(b.source) !== wsrc)))
      return fail(
        `The uploaded file is the bridge ${b.pack} → ${b.native} (from ${String(b.source)}), not ${sid} → ${want}${wsrc ? ` (from ${wsrc})` : ''}. Upload the right file and call again.`,
      );
    const PC = ctx.engine.packCheck;
    const first = PC.checkBridge(b);
    if (first.errors.length) return fail(`${first.errors.length} error(s):\n- ${first.errors.slice(0, 40).join('\n- ')}`);
    if (!ID_RE.test(b.pack)) return fail('pack: not a subject id');
    const pack = await packFor(ctx, b.pack);
    if (!pack) return fail(`No pack "${b.pack}" in this account or the library (noema_list_subjects).`);
    const res = PC.checkBridge(b, pack);
    if (res.errors.length) return fail(`${res.errors.length} error(s):\n- ${res.errors.slice(0, 40).join('\n- ')}`);
    const nat = lang0(b.native),
      own = pack.subject.language || 'en',
      pair = brKey(b.source, nat, own),
      file = `${uid}/bridges/${b.pack}.${pair}.json`;
    const key = sagaKey('bridge', b.pack, pair, (await sha256Hex(raw)).slice(0, 32));
    try {
      const out = await ctx.sagas.run<string>(
        'bridge',
        key,
        async s => {
          const prev = await ctx.storage.text(file);
          await s.step(
            'file',
            async () => {
              await ctx.storage.writeJson(file, raw);
              return true;
            },
            async () => {
              if (prev == null) await ctx.storage.remove([file]);
              else await ctx.storage.writeJson(file, prev);
            },
          );
          await s.step('index', async () => {
            await ctx.bridges.put(b.pack, pair, { ...bridgeSummary(b), source: lang0(b.source || own) });
            return true;
          });
          if (up)
            await s.step('clear', async () => {
              await ctx.storage.remove([up]).catch(() => undefined);
              return true;
            });
          const c = res.counts ?? {};
          const mins = ctx.engine.packCheck.LANGS.bridgeCoverage ?? {},
            low = [
              typeof b.coverage === 'number' && mins.all != null && b.coverage < mins.all
                ? `the content words ${Math.round(b.coverage * 100)}% < ${Math.round(mins.all * 100)}%`
                : '',
              typeof b.everyday === 'number' && mins.everyday != null && b.everyday < mins.everyday
                ? `the everyday words ${Math.round(b.everyday * 100)}% < ${Math.round(mins.everyday * 100)}%`
                : '',
            ].filter(Boolean);
          return `✅ Saved: 文A ${b.pack} ${lang0(b.source || own)} → ${nat} (${String(b.status)}) — ${(b.entries ?? []).length} words${typeof b.coverage === 'number' ? `, ${Math.round(b.coverage * 100)}% of the content words` : ''}${typeof b.everyday === 'number' ? `, ${Math.round(b.everyday * 100)}% of the everyday ones` : ''}${low.length ? ` ⚠️ below the minimum for a new pack (${low.join('; ')}): add the words bridge.py todo lists, build and save again` : ''}${c.anchors ? `, ${c.anchors} anchors` : ''}.${res.warnings.length ? `\n${res.warnings.length} warning(s):\n- ${res.warnings.slice(0, 20).join('\n- ')}` : ''}\nThe learner sees it on the pack's sections after the next sync (reload the app).`;
        },
        { stillDone: async () => !!(await ctx.bridges.all(b.pack))[b.pack]?.[pair] },
      );
      if (out.status === 'done') return text(out.value + (out.replayed ? REPLAYED : ''));
      return fail(BUSY(`${b.pack} → ${pair}`));
    } catch (e) {
      return fail(
        `Saving the bridge ${b.pack} → ${pair} stopped: ${message(e).slice(0, 300)}\nNothing changed for the learner (the bridge file this call wrote was taken back); call noema_save_bridge again.`,
      );
    }
  },
};
