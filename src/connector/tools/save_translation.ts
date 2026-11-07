/* noema_save_translation — one full translation of a pack, beside it (saga "translation": the file, the pack naming it, the synced card) */
import { argStr, fail, text, type Tool } from '../tool.ts';
import type { Pack, Translation } from '../engine/api.ts';
import { curState, stepOfPack } from '../services/curricula.ts';
import { languagesTodo, trCurl, trPath } from '../services/packfiles.ts';
import { BUSY, packmetaKey, REPLAYED } from '../services/packsave.ts';
import { roadmapTodoText } from '../services/roadmap.ts';
import { sagaKey } from '../services/sagas.ts';
import { ID_RE, jitter, LOCALE_RE, MAX_INLINE, message, sha256Hex, type Json } from '../util.ts';

export const tool: Tool = {
  definition: {
    "name": "noema_save_translation",
    "description": "Save one full translation of a subject (format \"noema-translation\": the chapters in one language, same ids, sections, answers and code as the pack; make_pack.py writes work/<id>/build/<id>.tr.<locale>.json) to the learner's account, beside their pack. Every new pack gets full translations into English, Greek, Russian, German and French (minus its own language, docs/PIPELINES.md §4b). Small files: pass translation_json; bigger ones: call with subject_id + locale only to get an upload URL, upload, then call again with the same subject_id + locale. It is checked against the pack exactly as the app checks it; the pack then names the language and every device shows the subject in it. A translation is the WHOLE pack in that language: its chapters (terms in brackets too) AND the subject's name — \"subject\": { title, appTitle, description, searchExamples, hero, tutor } in the file (make_pack.py puts subject.i18n.<locale> there); for a translation already saved, subject_json alone adds or fixes the name. Then the 文A bridges from this translation (noema_save_bridge with source).",
    "inputSchema": {
      "type": "object",
      "properties": {
        "subject_id": {
          "type": "string",
          "description": "The subject (pack.subject.id) — one of the learner's own packs"
        },
        "locale": {
          "type": "string",
          "description": "The language of the translation (e.g. el, ru, en)"
        },
        "translation_json": {
          "type": "string",
          "description": "Optional: the whole translation file as JSON text (≤ 1.5 MB)"
        },
        "subject_json": {
          "type": "string",
          "description": "Optional: the subject's name in this language, { \"title\", \"appTitle\", \"description\", \"searchExamples\", \"hero\": {…}, \"tutor\": {…} } (only fields the subject has) — merged into the translation (the one given, or the one already saved)"
        }
      },
      "required": [
        "subject_id",
        "locale"
      ]
    }
  },
  async handler(args, ctx) {
    const sid = argStr(args, 'subject_id'), loc = argStr(args, 'locale'), uid = ctx.uid, packPath = `${uid}/packs/${sid}.json`;
    if (!ID_RE.test(sid)) return fail('subject_id: the pack\'s id (lowercase letters, digits, hyphens)');
    if (!LOCALE_RE.test(loc)) return fail('locale: a language code such as el, ru, en, pt-PT');
    const p = await ctx.storage.json<Pack>(packPath); if (!p) return fail(`No pack "${sid}" in this account (noema_list_subjects). Save the pack first (noema_finish_upload).`);
    let f: Translation | null, raw = args.translation_json == null ? '' : String(args.translation_json);
    if (raw) {
      if (raw.length > MAX_INLINE) return fail(`Too big for inline saving (${Math.round(raw.length / 1024)} KB): call noema_save_translation with subject_id and locale only, for an upload URL.`);
      try { f = JSON.parse(raw) as Translation; } catch (e) { return fail('translation_json is not valid JSON: ' + message(e)); }
    } else {
      f = await ctx.storage.json<Translation>(trPath(uid, sid, loc));
      if (!f) return text(`Upload the translation — run in your sandbox (URL valid 2 h):\n\n${await trCurl(ctx, sid, loc)}\n\nThen call noema_save_translation with subject_id "${sid}" and locale "${loc}" again.`);
    }
    if (f.locale !== loc) return fail(`The file says locale "${String(f.locale)}", you asked for "${loc}".`);
    if (args.subject_json != null && args.subject_json !== '') {   // the subject's name in this language, merged into the translation (and saved with it)
      let sj: unknown; try { sj = JSON.parse(String(args.subject_json)); } catch (e) { return fail('subject_json is not valid JSON: ' + message(e)); }
      if (!sj || typeof sj !== 'object' || Array.isArray(sj)) return fail('subject_json: an object { title, appTitle, description, hero, … }');
      f = { ...f, subject: { ...(f.subject ?? {}), ...(sj as Record<string, unknown>) } }; raw = JSON.stringify(f);
    }
    const tr: Translation = f;
    const r = ctx.engine.packCheck.checkTranslation(tr, p);
    if (r.errors.length) return fail(`${r.errors.length} error(s):\n- ${r.errors.slice(0, 40).join('\n- ')}`);
    const key = sagaKey('translation', sid, loc, (await sha256Hex(raw || JSON.stringify(tr))).slice(0, 32));
    try {
      const out = await ctx.sagas.run<string>('translation', key, async s => {
        // 1. the file (inline or with subject_json: written here; uploaded: it is in place). Undone if the pack cannot name it.
        if (raw) {
          const prev = await ctx.storage.text(trPath(uid, sid, loc));
          await s.step('file', async () => { await ctx.storage.writeJson(trPath(uid, sid, loc), raw, { noCache: true }); return true; },
            async () => { if (prev == null) await ctx.storage.remove([trPath(uid, sid, loc)]); else await ctx.storage.writeJson(trPath(uid, sid, loc), prev, { noCache: true }); });
        }
        // 2. The pack lists its translations and holds the subject's name in each (subject.i18n, from the file's "subject").
        // Storage has no compare-and-swap: saves running at the same time (several agents, several locales) could each write
        // the pack they read and drop the other's entry — so re-read right before writing, check after, and write again while ours is missing.
        // Every read is fresh (past the CDN), and every language entry and name any read showed is kept: a write never drops one.
        const named = await s.step('pack', async () => {
          const seenT: NonNullable<Pack['translations']> = {}, seenS: Record<string, Record<string, unknown>> = {};
          const see = (cur: Pack | null): Pack | null => { Object.assign(seenT, cur?.translations ?? {}); for (const [l, v] of Object.entries(cur?.subject?.i18n ?? {})) seenS[l] = { ...(seenS[l] ?? {}), ...v }; return cur; };
          const withOurs = (cur: Pack): Pack => ({ ...cur, v: 3, translations: { ...seenT, ...(cur.translations ?? {}), [loc]: { file: true, chapters: tr.chapters.length } },
            subject: { ...cur.subject, i18n: { ...seenS, ...(cur.subject?.i18n ?? {}), ...(tr.subject ? { [loc]: { ...(cur.subject?.i18n?.[loc] ?? {}), ...tr.subject } } : {}) } } });
          const ours = (got: Pack | null): boolean => !!got && got.translations?.[loc]?.chapters === tr.chapters.length && (!tr.subject?.title || got.subject?.i18n?.[loc]?.title === tr.subject.title) &&
            Object.keys(seenT).every(l => got.translations?.[l]) && Object.keys(seenS).every(l => got.subject?.i18n?.[l]);
          see(p); let q = withOurs(p);
          for (let i = 0; i < 4; i++) {
            q = withOurs(see(await ctx.storage.json<Pack>(packPath)) ?? p);
            if (!Object.keys(q.subject.i18n ?? {}).length) delete q.subject.i18n;
            await ctx.storage.writeJson(packPath, JSON.stringify(q), { noCache: true });
            await jitter(200, 400);
            const got = await ctx.storage.json<Pack>(packPath); if (ours(got) && got) { q = got; break; }
            see(got);
          }
          return { locales: Object.keys(q.translations ?? {}), ...(q.subject.i18n ? { i18n: q.subject.i18n as Json } : {}) };
        });
        // 3. the synced card (contentLocales, the names): a compare-and-swap on the card as read
        await s.step('meta', () => ctx.kv.update<Record<string, unknown> | null>(packmetaKey(sid), pm => pm && { ...pm, contentLocales: named.locales, ...(named.i18n ? { i18n: named.i18n } : {}), updatedAt: new Date().toISOString() }));
        const q: Pack = { ...p, translations: Object.fromEntries(named.locales.map(l => [l, { file: true }])), subject: { ...p.subject, ...(named.i18n ? { i18n: named.i18n as NonNullable<Pack['subject']['i18n']> } : {}) } };
        const st = await stepOfPack(ctx, sid).catch(() => null), rm = st ? roadmapTodoText(ctx.engine, await curState(ctx, st.c, uid), { only: st.nid }) : '';   // 🌐 its step on the Roadmap is translated with it
        return `✅ Saved: “${p.subject.title}” in ${loc} — ${tr.chapters.length} of ${(p.chapters ?? []).length} chapters.${r.warnings.length ? `\n${r.warnings.length} warning(s):\n- ${r.warnings.slice(0, 20).join('\n- ')}` : ''}\nThe learner sees the subject in this language when their app is in it.` + await languagesTodo(ctx, q).catch(() => '') + rm;
      }, { stillDone: async () => !!(await ctx.storage.json<Pack>(packPath))?.translations?.[loc] });
      if (out.status === 'done') return text(out.value + (out.replayed ? REPLAYED : ''));
      return fail(BUSY(`${sid} (${loc})`));
    } catch (e) {
      return fail(`Saving the ${loc} translation of “${p.subject.title}” stopped: ${message(e).slice(0, 300)}\nThe pack was not changed by this call (a translation file it wrote was taken back); call noema_save_translation again.`);
    }
  },
};
