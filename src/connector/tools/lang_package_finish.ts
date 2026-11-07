/* noema_lang_package_finish — step 3 of saving a language package: check it with the app's own code and record it (saga "langpack") */
import { argStr, fail, text, type Tool } from '../tool.ts';
import type { LangCourseData, LangPackage } from '../engine/api.ts';
import { langPeers, packBase, packCourse, packStoragePath } from '../services/lang.ts';
import { BUSY, REPLAYED } from '../services/packsave.ts';
import { sagaKey } from '../services/sagas.ts';
import { message, sha256Hex } from '../util.ts';

export const tool: Tool = {
  definition: {
    "name": "noema_lang_package_finish",
    "description": "Step 2: checks the uploaded language package exactly as noema-lite does (every form against its paradigm cells, the facade of every word, sentences, grammar pages, the catalogue of phenomena, the parallel order — and that it fills the course's nodes without adding any) and, when it passes, records it in the learner's account: the app adds the language to the course on every device. Otherwise it lists every problem — fix them, package again, upload again.",
    "inputSchema": {
      "type": "object",
      "properties": {
        "course_id": {
          "type": "string"
        },
        "language": {
          "type": "string",
          "description": "the ISO 639 code"
        }
      },
      "required": [
        "course_id",
        "language"
      ]
    }
  },
  async handler(args, ctx) {
    const pc = await packCourse(ctx, argStr(args, 'course_id')); if (!('origin' in pc)) return fail(pc.error);
    const NL = ctx.engine.lang, code = argStr(args, 'language'); if (!/^[a-z]{2,3}$/.test(code)) return fail('language: the ISO 639 code');
    let raw: string; try { raw = await (await ctx.storage.readFresh(packStoragePath(ctx, pc.id, code))).text(); }
    catch (e) { return fail(`No uploaded package for ${code} in “${pc.title}” (${message(e).slice(0, 120)}). Run the curl command from noema_lang_package_start first.`); }
    let pkg: LangPackage; try { pkg = JSON.parse(raw) as LangPackage; } catch { return fail('The uploaded file is not JSON — upload work/' + code + '.langpack.json as made by lang_course.py package.'); }
    if (pkg?.code !== code) return fail(`The uploaded package is for “${String(pkg?.code)}”, not “${code}”.`);
    let data: LangCourseData; try { data = await packBase(ctx, pc); } catch (e) { return fail(message(e)); }
    const peers = (await langPeers(ctx)).filter(d => d?.course?.id !== pc.id);
    const errs = NL.checkLangPackage(data, pkg, { peers });
    if (errs.length) return fail(`The package has ${errs.length} problem(s) — it is NOT added to the course (the file stays private and the next upload replaces it). Fix ALL of them in work/lang/${pc.id}, run the checks, package it again (lang_course.py package), upload it again (noema_lang_package_start → curl) and call noema_lang_package_finish again:\n- ${errs.join('\n- ')}`);
    const lex = Object.values(pkg.lexicon ?? {}), words = lex.reduce((a, f) => a + (f.lexemes ?? []).length, 0), absent = lex.reduce((a, f) => a + (f.absent ?? []).length, 0);
    const key = sagaKey('langpack', pc.id, code, (await sha256Hex(raw)).slice(0, 32));
    const out = await ctx.sagas.run<string>('langpack', key, async s => {
      const rec = { v: 1, course: pc.id, code, name: pkg.name ?? code, path: NL.langPackPath(pc.id, code), size: raw.length, built: (pkg.built ?? null) as string | null, checks: (pkg.checks ?? null) as string | null,
        counts: { nodes: Object.keys(pkg.lexicon ?? {}).length, words, absent, grammar: Object.keys(pkg.grammar ?? {}).length, sentences: (pkg.bank ?? []).length, phenomena: (pkg.phenomena?.phenomena ?? []).length }, at: new Date().toISOString(), via: 'claude' };
      await s.step('record', async () => { await ctx.kv.put(NL.langPackKey(pc.id, code), rec); return true; });
      return `✅ ${pkg.name} (${code}) is in the learner's noema-lite account for “${pc.title}”: ${words} words (${absent} absent) in ${rec.counts.nodes} nodes, ${rec.counts.grammar} grammar pages, ${rec.counts.sentences} sentences, ${rec.counts.phenomena} phenomena.` +
        `\nThe app adds it to the course by itself on every device the next time the course opens: a lane in ⫴ parallel lanes, a chip, a row on the course home (⋮ › ${pkg.name} › Remove this language takes it away again).` +
        `\nTell the learner what was written, what is absent, and what a native speaker should still check (work/${code}-native-check.md).`;
    }, { stillDone: () => ctx.kv.has(NL.langPackKey(pc.id, code)) });
    if (out.status === 'done') return text(out.value + (out.replayed ? REPLAYED : ''));
    return fail(BUSY(`The ${code} package of “${pc.title}”`));
  },
};
