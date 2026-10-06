/* Socratic thread protocol test with a scripted Gemini mock. Usage: node tests/socratic.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const systems = [];
  await ctx.route('**/generativelanguage.googleapis.com/**', async route => {
    const url = route.request().url(); const body = JSON.parse(route.request().postData() || '{}');
    if (url.includes('/models?')) return route.fulfill({ json: { models: [{ name: 'models/gemini-3-flash-preview', supportedGenerationMethods: ['generateContent'] }] } });
    if (!url.includes('stream')) return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: 'Deletion Vectors: Why They Are Cheap' }] } }] } });
    const sys = body.systemInstruction.parts[0].text; systems.push(sys);
    const last = body.contents[body.contents.length - 1].parts[0].text;
    let reply;
    if (/WRAP UP NOW/.test(sys)) reply = '**✅ Answer:** …\n\n**🎓 What you learned:**\n- DVs mark rows instead of rewriting files.\n- VACUUM purges later.\n\nWant to go deeper into REORG? \n<noema-state>{"resolved":[],"focus":null,"verdict":"none","summary":true}</noema-state>';
    else if (/learner asked for the answer/.test(sys) || /used all its attempts/.test(sys)) reply = '❌ Not quite — here is the full answer.\n\n**✅ Answer:** A deletion vector records which rows are deleted, so the 1 GB file is not rewritten now.\n\n**📌 Lesson:** DVs trade a cheap write for a small read-time filter.\n<noema-state>{"resolved":[{"id":"t1","answer":"DVs mark rows instead of rewriting files.","lesson":"DVs trade a cheap write for a small read-time filter."}],"focus":null,"verdict":"wrong"}</noema-state>';
    else if (/What is a deletion vector/.test(last)) reply = 'Good question! Before I answer: if you delete 1 row from a 1 GB Parquet file, what must happen without DVs?\n<noema-state>{"opened":[{"id":"t1","question":"What must happen to a 1 GB file when one row is deleted without DVs?","parent":null}],"focus":"t1","verdict":"none"}</noema-state>';
    else reply = '❌ Not quite — think about immutability. What does Parquet allow you to change in place?\n<noema-state>{"focus":"t1","verdict":"wrong"}</noema-state>';
    const parts = [reply.slice(0, 40), reply.slice(40, 120), reply.slice(120)];   // split so the control line arrives across chunks
    return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: parts.map(t => 'data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] }) + '\n\n').join('') });
  });
  const p = await ctx.newPage(); const E = []; p.on('pageerror', e => E.push(e.message));
  await p.goto('file://' + ROOT + '/index.html'); await p.evaluate(() => localStorage.clear()); await p.reload(); await wait(800);
  await p.click('.noema-chip:has-text("Databricks")'); await wait(1500);
  await p.evaluate(() => { S.settings.apiKey = 'K'; flushSave(); openTutor({ kind: 'section', id: 'ch05-s04' }, 'socratic'); });
  const send = async t => { await p.evaluate(t => sendTutor(t), t); await wait(700); };
  await send('What is a deletion vector?');
  ok(!(await p.$eval('.drawer .msgs', m => m.innerText)).includes('noema-state'), 'control line never shown to the learner');
  ok(await p.evaluate(() => { const ts = T.tstate[tutorCtxKey()]; return ts.threads.length === 1 && ts.focus === 't1'; }), 'thread t1 opened and focused');
  await send('The file gets compressed?');
  await send('Maybe the footer is edited?');
  ok(/learner attempts 2\/3/.test(systems[systems.length - 1]) && /TUTOR STATE/.test(systems[systems.length - 1]), 'TUTOR STATE with attempt counter sent to the model');
  ok(await p.$eval('.threadbar', b => /try 3\/3/.test(b.innerText)), 'tracker shows the attempt budget: ' + await p.$eval('.threadbar', b => b.innerText.replace(/\s+/g, ' ').slice(0, 90)));
  await p.screenshot({ path: '/tmp/noema_shots/s1_thread_open.png' });
  await send('No idea really');
  ok(/learner asked for the answer|used all its attempts/.test(systems[systems.length - 1]), '“no idea” / budget → directive to resolve now');
  ok(await p.evaluate(() => { const ts = T.tstate[tutorCtxKey()]; return ts.threads[0].status === 'resolved' && ts.lessons.length === 1 && ts.focus === null; }), 'thread resolved with an authoritative answer + lesson');
  ok(await p.$$eval('.lessonchip', c => c.length) === 1, 'lesson chip under the reply');
  await p.click('button:has-text("Wrap up")'); await wait(800);
  ok(/WRAP UP NOW/.test(systems[systems.length - 1]), '🎓 Wrap up button sends the wrap-up directive');
  ok(await p.evaluate(() => T.tstate[tutorCtxKey()].wrapped === true), 'summary recorded');
  await p.screenshot({ path: '/tmp/noema_shots/s2_wrapped.png' });
  await wait(600);
  const rec = await p.evaluate(async () => (await Noema.convos.list(ACCOUNT.id)).find(r => r.kind === 'tutor'));
  ok(rec && rec.tutorState?.lessons?.length === 1 && rec.messages.some(m => m.meta?.noemaState) && !rec.messages.some(m => m.content.includes('<noema-state')), 'tutorState + per-message control persisted; stored text is clean');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => exportConvo(currentConvo()))]);
  const fs = require('fs'); const f = '/tmp/socratic_export.md'; await dl.saveAs(f); const mdTxt = fs.readFileSync(f, 'utf8');
  ok(/📌 Lessons learned/.test(mdTxt) && /DVs trade a cheap write/.test(mdTxt), 'Markdown export starts with the lessons learned');
  // reopen from history after reload → state restored
  await p.reload(); await wait(800); await p.click('.noema-chip:has-text("Databricks")'); await wait(1500);
  await p.evaluate(() => { openTutor(); T.showHistory = true; renderTutor(); }); await wait(300); await p.click('.cvmain'); await wait(400);
  ok(await p.evaluate(() => { const ts = T.tstate[tutorCtxKey()]; return ts && ts.lessons.length === 1 && T.mode === 'socratic'; }), 'thread state restored when a saved conversation is reopened');
  // other modes: wrap-up works without threads
  await p.evaluate(() => { T.mode = 'explain'; T.hist[tutorCtxKey()] = [{ role: 'user', text: 'x', t: 1 }, { role: 'model', text: 'y', t: 2 }]; renderTutor(); }); await wait(200);
  ok(!!(await p.$('.threadbar button:has-text("Wrap up")')) && !(await p.$('.threadbar button:has-text("Just tell me")')), 'other modes offer 🎓 Wrap up (no thread controls)');
  ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));
  await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
