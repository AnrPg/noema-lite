/* ===================== Results inbox: study results that other apps append (e.g. Meletee) ===================== */
/* A subject's progress is one blob (s:<subject>:state) that the open tab rewrites on every save, so no other app may
   write it. Other apps append rows to noema_kv instead: key a:inbox:<app>:<id>, value (schema noema.results/v1)
     { schema, app, subject, at, items: [{ kind: 'section'|'chapter'|'exercise'|'card', id, event?, ok?, grade?, rating?, date?, at }] }
   The open subject applies its own rows (on start and after each pull), saves, pushes, then deletes them — the same
   pattern as the Claude app's a:curin: answers (engine/curjobs.js). Rows of other subjects wait until that subject is
   opened. Applying is idempotent: the keys of applied rows are kept in the state (S.inboxDone) and saved together with
   what they changed, so a row read twice (a failed delete, two open tabs) counts once. Malformed items are skipped. */
const INBOX = 'a:inbox:', RESULTS_SCHEMA = 'noema.results/v1', INBOX_KEEP = 500, EXT_KEEP = 200;
const inboxRun = { busy: false };
function cardKeyKnown(key) { return FULL_COURSE.some(c => c.flashcards.some(f => f._key === key)); }   // card keys as the decks use them (50_sources.js)
/** Apply one parsed row to S (no saving) → how many items were applied. */
function applyResults(v) {
  let n = 0;
  const app = /^[a-z0-9_-]{1,32}$/i.test(v.app) ? v.app : 'app';
  for (const it of Array.isArray(v.items) ? v.items : []) {
    if (!it || typeof it !== 'object' || typeof it.id !== 'string') continue;
    const at = Date.parse(it.at) || Date.parse(v.at) || Date.now();
    if (it.kind === 'section' && it.event === 'studied' && SEC[it.id]) { S.read[it.id] = true; n++; }
    else if (it.kind === 'exercise' && typeof it.ok === 'boolean' && EX[it.id]) { record(EX[it.id], it.ok); n++; }
    else if (it.kind === 'card' && [0, 1, 2].includes(it.grade) && cardKeyKnown(it.id)) { rateCardKey(it.id, it.grade, new Date(at)); n++; }
    else if ((it.event === 'review' || it.event === 'studied') && (it.kind === 'chapter' ? CH[it.id] : SEC[it.id])) {
      // what noema-lite has no field for (a chapter studied elsewhere, a spaced review and its rating): kept for display
      S.ext = S.ext || {};
      const log = S.ext[app] = Array.isArray(S.ext[app]) ? S.ext[app] : [];
      log.push({ kind: it.kind, id: it.id, event: it.event, rating: typeof it.rating === 'string' ? it.rating.slice(0, 20) : undefined, date: typeof it.date === 'string' ? it.date.slice(0, 10) : undefined, at: new Date(at).toISOString() });
      if (log.length > EXT_KEEP) log.splice(0, log.length - EXT_KEEP);
      n++;
    }
  }
  return n;
}
/** Read the inbox, apply this subject's rows, save + push, then delete them → how many items were applied. */
async function checkInbox() {
  const CL = window.NoemaCloud;
  if (inboxRun.busy || ACCOUNT.kind !== 'cloud' || !CL?.session?.() || !CL.kvRows) return 0;
  inboxRun.busy = true; let n = 0;
  try {
    const rows = (await CL.kvRows(INBOX)).sort((a, b) => a.key.localeCompare(b.key));
    const done = []; const seen = S.inboxDone = S.inboxDone || {};
    for (const r of rows) {
      let v; try { v = JSON.parse(r.value); } catch (e) { done.push(r.key); continue; }   // unreadable: it can never be applied
      if (!v || typeof v !== 'object' || v.schema !== RESULTS_SCHEMA) continue;            // another format (a newer app?): leave it
      if (v.subject !== SUBJ.id) continue;                                                   // another subject: applied when that one is opened
      if (!seen[r.key]) { n += applyResults(v); seen[r.key] = Date.now(); }
      done.push(r.key);
    }
    if (!done.length) return 0;
    const keep = Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, INBOX_KEEP); S.inboxDone = Object.fromEntries(keep);
    flushSave();
    // the changed state reaches the cloud BEFORE its rows leave the inbox (a failed push keeps them for the next check)
    if (n) await CL.push(ACCOUNT.id);
    for (const k of done) await CL.kvDelete(k).catch(() => { });
    if (n) { toast(`📥 ${n} result${n === 1 ? '' : 's'} from your other apps`); renderTopStats(); }
  } catch (e) { console.warn('[inbox]', e); } finally { inboxRun.busy = false; }
  return n;
}
addEventListener('noema:pulled', e => { if (e.detail?.acc === ACCOUNT.id) checkInbox(); });
setTimeout(checkInbox, 0);   // once the whole engine has loaded
{ /* tell sibling apps (Meletee, a:caps) that results can be appended here; each feature merges only its own flag */
  const k = Noema.kv.accountKey('caps'); let c = {}; try { c = JSON.parse(Noema.kv.get(k) || '{}') || {}; } catch (e) { }
  if (!c.resultsInbox) Noema.kv.set(k, JSON.stringify({ ...c, resultsInbox: 1 }));
}
