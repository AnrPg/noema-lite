/* Socratic thread protocol test with a scripted Gemini mock. Usage: node tests/socratic.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const { appUrl } = require('./serve');   // the app over http, as the website serves it (tests/serve.js)
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
  // the tutor (src/composition/tutor.ts): its session, as the page has it
  await ctx.addInitScript(() => { window.__tut = () => NoemaTutor.current().session; });
  const p = await ctx.newPage(); const E = []; p.on('pageerror', e => E.push(e.message));
  await p.goto(await appUrl(ROOT)); await p.evaluate(() => localStorage.clear()); await p.reload(); await wait(800);
  await p.click('.noema-chip:has-text("Databricks")'); await wait(1500);
  await p.evaluate(() => { S.settings.apiKey = 'K'; flushSave(); __tut().openTutor({ kind: 'section', id: 'ch05-s04' }, 'socratic'); });
  const send = async t => { await p.evaluate(t => __tut().send(t), t); await wait(700); };
  await send('What is a deletion vector?');
  ok(!(await p.$eval('.drawer .msgs', m => m.innerText)).includes('noema-state'), 'control line never shown to the learner');
  ok(await p.evaluate(() => { const ts = __tut().threads(); return ts.threads.length === 1 && ts.focus === 't1'; }), 'thread t1 opened and focused');
  await send('The file gets compressed?');
  await send('Maybe the footer is edited?');
  ok(/learner attempts 2\/3/.test(systems[systems.length - 1]) && /TUTOR STATE/.test(systems[systems.length - 1]), 'TUTOR STATE with attempt counter sent to the model');
  ok(await p.$eval('.threadbar', b => /try 3\/3/.test(b.innerText)), 'tracker shows the attempt budget: ' + await p.$eval('.threadbar', b => b.innerText.replace(/\s+/g, ' ').slice(0, 90)));
  await p.screenshot({ path: '/tmp/noema_shots/s1_thread_open.png' });
  await send('No idea really');
  ok(/learner asked for the answer|used all its attempts/.test(systems[systems.length - 1]), '“no idea” / budget → directive to resolve now');
  ok(await p.evaluate(() => { const ts = __tut().threads(); return ts.threads[0].status === 'resolved' && ts.lessons.length === 1 && ts.focus === null; }), 'thread resolved with an authoritative answer + lesson');
  ok(await p.$$eval('.lessonchip', c => c.length) === 1, 'lesson chip under the reply');
  await p.click('button:has-text("Wrap up")'); await wait(800);
  ok(/WRAP UP NOW/.test(systems[systems.length - 1]), '🎓 Wrap up button sends the wrap-up directive');
  ok(await p.evaluate(() => __tut().threads().wrapped === true), 'summary recorded');
  await p.screenshot({ path: '/tmp/noema_shots/s2_wrapped.png' });
  await wait(600);
  const rec = await p.evaluate(async () => (await Noema.convos.list(ACCOUNT.id)).find(r => r.kind === 'tutor'));
  ok(rec && rec.tutorState?.lessons?.length === 1 && rec.messages.some(m => m.meta?.noemaState) && !rec.messages.some(m => m.content.includes('<noema-state')), 'tutorState + per-message control persisted; stored text is clean');
  const [dl] = await Promise.all([p.waitForEvent('download'), p.evaluate(() => NoemaTutor.current().exportOne(__tut().current()))]);
  const fs = require('fs'); const f = '/tmp/socratic_export.md'; await dl.saveAs(f); const mdTxt = fs.readFileSync(f, 'utf8');
  ok(/📌 Lessons learned/.test(mdTxt) && /DVs trade a cheap write/.test(mdTxt), 'Markdown export starts with the lessons learned');
  // reopen from history after reload → state restored
  await p.reload(); await wait(800); await p.click('.noema-chip:has-text("Databricks")'); await wait(1500);
  await p.evaluate(() => { __tut().openTutor(); __tut().toggleHistory(true); }); await wait(300); await p.click('.cvmain'); await wait(400);
  ok(await p.evaluate(() => { const ts = __tut().threads(); return ts && ts.lessons.length === 1 && __tut().mode === 'socratic'; }), 'thread state restored when a saved conversation is reopened');
  // 🗣 the language of the AI conversations: only what the AI writes changes — the pack does not
  const packBefore = await p.evaluate(() => (s => [s.title, JSON.stringify(s.blocks)].join('|'))(Noema.pack.chapters[4].sections[3]));
  ok(!/LANGUAGE:/.test(systems[systems.length - 1]), 'an English course, no choice made → no language rule');
  await p.evaluate(() => { __tut().fresh(); }); await wait(200);
  const NoemaShellL = k => k === 'chatLangItem' ? 'Language|language' : k;
  // the frame's tutor: ⋮ › 🗣 Language of the conversation › Ελληνικά
  const pick = async re => p.evaluate(async src => { const it = [...document.querySelectorAll('.ns-pop [role=menuitem]')].find(x => new RegExp(src).test(x.textContent)); it?.click(); await new Promise(r => setTimeout(r, 150)); return !!it; }, re);
  await p.evaluate(() => { const b = [...document.querySelectorAll('.drawer .ns-dh button')].find(x => x.getAttribute('aria-haspopup') === 'menu' || x.dataset.pop); b.click(); }); await wait(200);
  ok(await pick(NoemaShellL('chatLangItem')), 'the tutor’s ⋮ has the 🗣 language of the conversation');
  await wait(200);
  ok(await pick('Ελληνικά'), '… with the languages to choose from'); await wait(200);
  await send('What is a deletion vector?');
  const lastSys = systems[systems.length - 1];
  await p.screenshot({ path: '/tmp/noema_shots/s3_lang.png' });
  ok(/LANGUAGE: always write to the learner in Greek \(Ελληνικά\), although the course material and the notes below are in English/.test(lastSys), 'Ελληνικά → the tutor is told to answer in Greek (the notes stay English)');
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem(`noema1:${ACCOUNT.id}:a:settings`)).chatLang) === 'el', 'the choice is a setting of the profile (synced like the others)');
  ok(await p.evaluate(() => (s => [s.title, JSON.stringify(s.blocks)].join('|'))(Noema.pack.chapters[4].sections[3])) === packBefore, 'the course material is unchanged');
  const sysJ = []; await ctx.route('**/generativelanguage.googleapis.com/**:generateContent*', async route => { const b = JSON.parse(route.request().postData() || '{}'); sysJ.push(b.systemInstruction?.parts?.[0]?.text || ''); return route.fulfill({ json: { candidates: [{ content: { parts: [{ text: '{"score":70,"verdict":"Σχεδόν","covered":[],"missing":[],"mistakes":[],"feedback":"ok","hit":[0]}' }] } }] } }); });
  await p.evaluate(() => NoemaTutor.current().ai.grade(Noema.pack.chapters[0].exercises.find(e => e.type === 'free') || { type: 'free', q: 'Q', model: 'M', rubric: ['r'], section: Noema.pack.chapters[0].sections[0].id }, 'my answer'));
  ok(/Write the verdict, covered, missing and mistakes texts in Greek/.test(sysJ.at(-1) || ''), 'the AI feedback on answers is written in Greek too');
  await p.evaluate(() => openAccountMenu('settings')); await wait(300);
  await p.click('.accsec summary:has-text("Language of the AI conversations")'); await wait(200);
  ok(await p.locator('.accsec:has-text("Language of the AI conversations") select').inputValue() === 'el' && /stays in its own language/.test(await p.locator('.accsec:has-text("Language of the AI conversations")').innerText()), '⚙️ Settings shows the same choice, and says the material is not translated');
  await p.selectOption('.accsec:has-text("Language of the AI conversations") select', ''); await p.click('button:has-text("Save settings")'); await wait(400);
  ok(await p.evaluate(() => S.settings.chatLang || '') === '', '“Automatic” → the app’s language again');
  await p.evaluate(() => __tut().openTutor({ kind: 'section', id: 'ch05-s04' }, 'socratic')); await wait(200);
  // other modes: wrap-up works without threads
  await p.evaluate(() => { const s = __tut(); s.setMode('explain'); s.hist[s.key()] = [{ role: 'user', text: 'x', t: 1 }, { role: 'model', text: 'y', t: 2 }]; s.changed(); }); await wait(200);
  ok(!!(await p.$('.threadbar button:has-text("Wrap up")')) && !(await p.$('.threadbar button:has-text("Just tell me")')), 'other modes offer 🎓 Wrap up (no thread controls)');
  // 🎯 every AI button opens its own kind of conversation (mode + task), with the right context
  const sysNow = () => systems[systems.length - 1];
  const visible = () => p.$$eval('.drawer .msg.me', m => m.map(x => x.innerText).join('\n'));
  await p.evaluate(() => { __tut().close(); const ex = COURSE.flatMap(c => c.exercises).find(e => e.type === 'mcq' && !e.multi && !Array.isArray(e.answer));
    window.__ex = ex; const card = NoemaCore.studyUi.current().exerciseCard(ex, { noXP: true }); card.id = 'tcard'; document.querySelector('main, #app, body').prepend(card); });
  await wait(200);
  await p.click('#tcard button:has-text("Ask")'); await wait(700);
  ok(await p.evaluate(() => __tut().mode) === 'hint' && /NEVER reveal the answer/.test(sysNow()) && /BEFORE answering/.test(sysNow()) && !/TUTOR STATE/.test(sysNow()), '“Ask Brick” before answering → hint mode: hints only, never the answer');
  ok((await p.$eval('.drawer .ns-modesel b', b => b.innerText)).includes('Hint'), 'the hint mode shows as the current mode');
  await p.evaluate(() => { __tut().close(); const ex = window.__ex; [...document.querySelectorAll('#tcard .opt')].find(b => b.dataset.nf !== 'options.' + ex.answer).click(); });
  await wait(300);
  const given = await p.evaluate(() => document.getElementById('tcard')._w.given());
  ok(/^[A-D]\. /.test(given) && !given.startsWith(String.fromCharCode(65 + (await p.evaluate(() => window.__ex.answer))) + '. '), 'the learner’s (wrong) answer is known: ' + given.slice(0, 50));
  await p.click('#tcard button:has-text("Explain differently")'); await wait(700);
  let sys = sysNow();
  ok(await p.evaluate(() => __tut().mode) === 'explain' && /as intuitively and insightfully as possible/.test(sys) && /NOT a Socratic session/.test(sys) && !/elicitation threads/.test(sys) && !/TUTOR STATE/.test(sys), '“Explain differently” → the free, in-depth Explain mode (no elicitation)');
  ok(/pressed "💡 Explain differently"/.test(sys) && sys.includes('Their answer: ' + given) && /Do not ask them questions/.test(sys) && /Correct: /.test(sys), '…with its own task: another angle on the key idea + why the learner’s answer is wrong, no questions');
  ok(!/check me with one question/i.test(await visible()) && (await visible()).includes('I answered: ' + given.slice(0, 20)), 'the message shown says what the learner answered (no “check me” request)');
  await p.evaluate(() => __tut().close());
  await p.click('#tcard button:has-text("Help me get it")'); await wait(700);
  sys = sysNow();
  ok(await p.evaluate(() => __tut().mode) === 'socratic' && /elicitation threads/.test(sys) && /Help me get it \(Socratic\)/.test(sys) && sys.includes('Their answer: ' + given) && /TUTOR STATE/.test(sys), '“Help me get it” → Socratic, starting from the learner’s answer');
  await send('Why is that?');
  ok(/Help me get it \(Socratic\)/.test(sysNow()), 'the task stays in the instructions for the whole conversation');
  ok(await p.evaluate(() => __tut().current()?.msgs[0]?.meta?.intent?.includes('Help me get it')), '…and is saved with the conversation (history reopen keeps it)');
  await p.evaluate(() => { __tut().close(); __tut().explainItem({ label: 'Deletion vectors', text: 'Deletion vectors mark deleted rows instead of rewriting files.', sec: 'ch05-s04', what: 'term' }); }); await wait(700);
  sys = sysNow();
  ok(await p.evaluate(() => __tut().mode) === 'explain' && /pressed 💡 "Explain this" on ONE term/.test(sys) && /FOCUS — the part of the lesson the learner asks about:\nDeletion vectors mark/.test(sys) && /as intuitively and insightfully/.test(sys), '💡 on a lesson part → Explain mode focused on that part');
  await p.evaluate(() => { __tut().close(); document.getElementById('tcard')?.remove(); location.hash = '#/s/ch05-s04'; }); await wait(700);
  if (await p.locator('.continue button:has-text("show all")').count()) { await p.click('.continue button:has-text("show all")'); await wait(300); }
  const btnSys = async (label, re, mode) => { await p.evaluate(() => { __tut().close(); const s = __tut(); for (const k of Object.keys(s.hist)) if (k.startsWith('ch05-s04|')) s.hist[k] = []; }); await p.evaluate(() => [...document.querySelectorAll('.ns-top button')].find(x => (x.getAttribute('aria-label') || x.textContent).trim() === NoemaShell.L('more')).click()); await wait(200); await p.evaluate(l => [...document.querySelectorAll('.ns-pop [role=menuitem]')].find(x => x.textContent.includes(l)).click(), label); await wait(700); return (await p.evaluate(() => __tut().mode)) === mode && re.test(sysNow()); };
  ok(await btnSys('Socratic dialogue on this', /Socratic dialogue on THIS section/, 'socratic'), 'section → Socratic dialogue has its own task');
  ok(await btnSys('Debug simulation', /simulation built on THIS section/, 'debug'), 'section → Debug simulation has its own task');
  ok(await btnSys('Interview me', /Mock interview \/ oral exam on THIS section/, 'interview'), 'section → Interview me has its own task');
  await p.evaluate(() => { __tut().close(); location.hash = '#/'; }); await wait(400);
  // 🌐 no 🗣 choice → the AI answers in the app's language (docs/i18n.md approach 6); the tutor greets in it too
  for (const [tag, name, addr, hello] of [['el', 'Greek \\(Ελληνικά\\)', 'εσύ', 'Γεια'], ['ru', 'Russian \\(русский\\)', 'ты', 'Привет']]) {
    await p.evaluate(async tag => { S.settings.chatLang = ''; S.settings.lang = tag; await NoemaI18n.use(tag); const s = __tut(); for (const k of Object.keys(s.hist)) delete s.hist[k]; s.tstate = {}; s.openTutor({ kind: 'section', id: 'ch05-s04' }, 'socratic'); }, tag); await wait(300);
    const greet = await p.$eval('.drawer .ns-greet', g => [g.lang, g.textContent]);
    await send(hello);
    sys = sysNow();
    ok(new RegExp('LANGUAGE: always write to the learner in ' + name + ', although the course material and the notes below are in English').test(sys) && sys.includes('Address the learner with the informal singular (' + addr + ')'), `${tag} UI → the tutor is told to answer in ${tag} (${addr}), the notes stay English`);
    ok(new RegExp('Write the "question", "answer" and "lesson" texts .* in ' + name).test(sys), `${tag} UI → TUTOR STATE asks for the thread texts in ${tag}`);
    ok(greet[0] === tag && greet[1].startsWith(hello), `${tag} UI → the tutor greets in ${tag}: ` + greet[1].slice(0, 60));
    await p.evaluate(() => NoemaTutor.current().ai.grade({ type: 'free', q: 'Q', model: 'M', rubric: ['r'], section: Noema.pack.chapters[0].sections[0].id }, 'my answer'));
    ok(new RegExp('Write the verdict, covered, missing and mistakes texts in ' + name).test(sysJ.at(-1) || ''), `${tag} UI → the AI feedback on answers is in ${tag}`);
    await p.evaluate(() => __tut().close());
  }
  await p.evaluate(async () => { S.settings.lang = undefined; await NoemaI18n.use('en'); }); await wait(200);
  ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));
  await b.close(); console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
