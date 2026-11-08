/* ===================== Results inbox: study results that other apps append (e.g. Meletee) ===================== */
/* Other apps never write a learner's progress: they append rows to noema_kv, key a:inbox:<app>:<id>, value (schema noema.results/v1)
     { schema, app, subject, at, items: [{ kind: 'section'|'chapter'|'exercise'|'card', id, event?, ok?, grade?, rating?, date?, at }] }
   The open subject records its own rows as events of the learning log (origin "inbox"), pushes, then deletes them — the same
   pattern as the Claude app's a:curin: answers (engine/curjobs.js). Rows of other subjects wait until that subject is opened.
   Applying is idempotent: each item's event id is made from the row's key and the item's place (NoemaCore.learning.idFor), so
   a row read twice (a failed delete, two open tabs, two devices) counts once. Malformed items are skipped. */
const INBOX = 'a:inbox:', RESULTS_SCHEMA = 'noema.results/v1';
const inboxRun = { busy: false };
function cardKeyKnown(key) { return FULL_COURSE.some(c => c.flashcards.some(f => f._key === key)); }   // card keys as the decks use them (40_views.js)
/** One parsed row (its key: `key`) → the events it stands for (drafts with their own ids; nothing recorded yet). */
function inboxDrafts(key, v) {
  const out = [];
  const app = /^[a-z0-9_-]{1,32}$/i.test(v.app) ? v.app : 'app';
  (Array.isArray(v.items) ? v.items : []).forEach((it, i) => {
    if (!it || typeof it !== 'object' || typeof it.id !== 'string') return;
    const at = Date.parse(it.at) || Date.parse(v.at) || Date.now();
    const base = { subject: SUBJ.id, item: it.id, origin: 'inbox', id: LOG.idFor('inbox', [ACCOUNT.id, key, i]), day: NoemaCore.day.of(new Date(at)) };
    if (it.kind === 'section' && it.event === 'studied' && SEC[it.id]) out.push({ ...base, type: 'section.read', data: {} });
    else if (it.kind === 'exercise' && typeof it.ok === 'boolean' && EX[it.id]) out.push({ ...base, type: 'answer.given', data: { ok: it.ok } });
    else if (it.kind === 'card' && [0, 1, 2].includes(it.grade) && cardKeyKnown(it.id)) out.push({ ...base, type: 'card.reviewed', data: { rating: LOG.cardRating(it.grade) } });   // due counted from the item's day
    else if ((it.event === 'review' || it.event === 'studied') && (it.kind === 'chapter' ? CH[it.id] : SEC[it.id])) {
      // what noema-lite has no field for (a chapter studied elsewhere, a spaced review and its rating): kept for display
      const data = { app, kind: it.kind === 'chapter' ? 'chapter' : 'section', event: it.event };
      if (typeof it.rating === 'string') data.rating = it.rating.slice(0, 20);
      if (typeof it.date === 'string') data.date = it.date.slice(0, 10);
      out.push({ ...base, type: 'external.studied', data });
    }
  });
  return out;
}
/** Read the inbox, record this subject's rows, push, then delete them → how many items were applied. */
async function checkInbox() {
  const CL = window.NoemaCloud;
  if (inboxRun.busy || ACCOUNT.kind !== 'cloud' || !CL?.session?.() || !CL.kvRows) return 0;
  inboxRun.busy = true; let n = 0;
  try {
    const rows = (await CL.kvRows(INBOX)).sort((a, b) => a.key.localeCompare(b.key));   // storage keys, not words (i18n-ignore)
    const done = [], drafts = [];
    for (const r of rows) {
      let v; try { v = JSON.parse(r.value); } catch (e) { done.push(r.key); continue; }   // unreadable: it can never be applied
      if (!v || typeof v !== 'object' || v.schema !== RESULTS_SCHEMA) continue;            // another format (a newer app?): leave it
      if (v.subject !== SUBJ.id) continue;                                                   // another subject: applied when that one is opened
      drafts.push(...inboxDrafts(r.key, v));
      done.push(r.key);
    }
    if (!done.length) return 0;
    n = (await LOG.recordOnce(drafts)).length;
    // the events are stored, and reach the cloud, BEFORE their rows leave the inbox (a failure keeps them for the next check)
    if (!(await LOG.flush())) return n;
    if (n) await CL.push(ACCOUNT.id);
    for (const k of done) await CL.kvDelete(k).catch(() => { });
    if (n) { (Noema.notice || toast)('📥 ' + tE('engine.inbox.applied', { n })); renderTopStats(); }
  } catch (e) { console.warn('[inbox]', e); } finally { inboxRun.busy = false; }
  return n;
}
addEventListener('noema:pulled', e => { if (e.detail?.acc === ACCOUNT.id) checkInbox(); });
setTimeout(checkInbox, 0);   // once the whole engine has loaded
{ /* tell sibling apps (Meletee, a:caps) that results can be appended here; each feature merges only its own flag */
  const k = Noema.kv.accountKey('caps'); let c = {}; try { c = JSON.parse(Noema.kv.get(k) || '{}') || {}; } catch (e) { }
  if (!c.resultsInbox) Noema.kv.set(k, JSON.stringify({ ...c, resultsInbox: 1 }));
}
