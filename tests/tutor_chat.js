/* The tutor chat as a chat app: reading while the answer is written (no auto-scroll, ↓ to the latest, ■ stop), editing an
   earlier message (a branch, ‹ 2/3 ›), another answer (↻), files sent to the AI, formulas drawn whole and fitted to the
   drawer (never a sideways scroll), branches kept when another device's copy arrives. A Gemini stub streams slowly from the
   page's fetch. Usage: node tests/tutor_chat.js [<prepared-repo-dir>]   (screenshots in /tmp/noema_shots/chat_*.png) */
const { chromium } = require(process.env.PW || 'playwright');
const { appUrl } = require('./serve');
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
fs.mkdirSync('/tmp/noema_shots', { recursive: true });

const LONG = Array.from({ length: 14 }, (_, i) => `Paragraph ${i + 1}: a deletion vector marks the deleted rows of a Parquet file, so the file itself is not rewritten at once; readers skip those rows until OPTIMIZE or a REORG writes the file again.`).join('\n\n');
const MATH = 'The power is $p(t) = V_p I_p \\cos(\\omega t)\\cos(\\omega t - \\phi)$, so\n\n$$p(t) = \\underbrace{\\frac{V_p I_p}{2} \\cos\\phi}_{\\text{σταθερός όρος (DC offset)}} + \\underbrace{\\frac{V_p I_p}{2} \\cos(2\\omega t - \\phi)}_{\\text{ταλαντευόμενος όρος διπλάσιας συχνότητας}}$$\n\nand the energy of the pack:\n\n$$E_{tot} = V_{tot} \\cdot Q = (3 \\cdot V_{cell}) \\cdot Q_{cell} = 3 \\cdot (V_{cell} \\cdot Q_{cell}) = 3 \\cdot E_{cell} = 3 \\cdot 3.7\\,\\text{V} \\cdot 1\\,\\text{Ah} = 11.1\\,\\text{Wh}$$\n\nA $5 and $10 note stays money.';

(async () => {
  const b = await chromium.launch();
  const run = async (viewport, tag) => {
    const ctx = await b.newContext({ viewport, deviceScaleFactor: 2 });
    // the page's fetch: Gemini streams slowly (window.__slow ms per piece); the requests are kept for the checks
    await ctx.addInitScript(([LONG, MATH]) => {
      window.__reqs = []; window.__slow = 0; window.__n = 0;
      const real = window.fetch.bind(window);
      window.fetch = async (u, init) => {
        const url = String(u);
        if (!url.includes('generativelanguage.googleapis.com')) return real(u, init);
        if (url.includes('/models?')) return new Response(JSON.stringify({ models: [{ name: 'models/gemini-3-flash-preview', supportedGenerationMethods: ['generateContent'] }] }), { headers: { 'content-type': 'application/json' } });
        const body = JSON.parse(init.body);
        if (!url.includes('stream')) return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Deletion vectors' }] } }] }), { headers: { 'content-type': 'application/json' } });
        window.__reqs.push(body);
        const last = body.contents.at(-1).parts.map(p => p.text || '').join(' ');
        const n = ++window.__n;
        const text = /formula/.test(last) ? MATH : /long/.test(last) ? LONG : `Answer ${n} to: ${last.slice(0, 40)}`;
        const pieces = text.match(/[\s\S]{1,60}/g);
        const signal = init.signal, slow = window.__slow;
        const stream = new ReadableStream({
          async start(c) {
            for (const t of pieces) {
              if (signal?.aborted) { c.error(new DOMException('aborted', 'AbortError')); return; }
              c.enqueue(new TextEncoder().encode('data: ' + JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] }) + '\n\n'));
              if (slow) await new Promise(r => setTimeout(r, slow));
            }
            c.close();
          },
        });
        return new Response(stream, { headers: { 'content-type': 'text/event-stream' } });
      };
      window.__tut = () => NoemaTutor.current().session;
    }, [LONG, MATH]);
    const p = await ctx.newPage(); const E = []; p.on('pageerror', e => E.push(e.message));
    const U = await appUrl(ROOT); await p.goto(U); await p.evaluate(() => localStorage.clear()); await p.reload(); await wait(900);
    // a learner who has used the app before (past the first-time questions)
    await p.evaluate(() => { const id = window.Noema?.account?.id; if (id) NoemaCore.storage.kv.set(`noema1:${id}:a:settings`, JSON.stringify({ lang: 'en', world: 'know', onboarded: Date.now() })); });
    await p.goto(U + '?subject=databricks#/ch/ch05'); await p.reload();
    await p.waitForFunction(() => window.NoemaTutor?.current?.()?.session && typeof S !== 'undefined', null, { timeout: 30000 }); await wait(800);
    await p.addStyleTag({ path: path.join(ROOT, 'engine/vendor/katex/katex.min.css') });
    await p.addScriptTag({ path: path.join(ROOT, 'engine/vendor/katex/katex.min.js') });
    await p.evaluate(() => { S.settings.apiKey = 'K'; flushSave(); __tut().openTutor({ kind: 'section', id: 'ch05-s04' }, 'explain'); });
    await wait(500);
    const type = async t => { await p.fill('.drawer .composer textarea', t); await p.press('.drawer .composer textarea', 'Enter'); };
    const idle = async () => { for (let i = 0; i < 100 && await p.evaluate(() => __tut().busy); i++) await wait(100); await wait(150); };
    const box = () => p.$eval('.drawer .msgs', m => ({ top: m.scrollTop, h: m.clientHeight, sh: m.scrollHeight, sw: m.scrollWidth, cw: m.clientWidth }));

    /* 1. reading while it writes */
    await type('give me a long answer'); await idle();
    await type('another long answer please'); await idle();
    await p.evaluate(() => { window.__slow = 120; });
    await type('and one more long one');
    await wait(1500);
    const meTop = await p.$eval('.drawer .msgs', m => { const me = [...m.querySelectorAll(':scope > .msg.me')].at(-1); return me.getBoundingClientRect().top - m.getBoundingClientRect().top; });
    ok(meTop >= -2 && meTop < 60, `a new turn brings the learner's message to the top (${Math.round(meTop)} px from it)`);
    const a1 = await box(); await wait(1200); const a2 = await box();
    ok(await p.evaluate(() => __tut().busy) && a1.top === a2.top && a2.sh >= a1.sh, `no scrolling while the answer streams in (scrollTop ${a1.top} → ${a2.top}, content ${a1.sh} → ${a2.sh})`);
    await p.$eval('.drawer .msgs', m => { m.scrollTop = 0; }); await wait(700);
    ok((await box()).top === 0, 'the learner scrolls up to read: the page stays there while it writes');
    ok(await p.isVisible('.drawer .ns-jump'), '↓ "jump to the latest" is offered');
    ok(await p.isVisible('.drawer .composer .ns-stop'), '■ stop replaces send while it writes');
    await p.screenshot({ path: `/tmp/noema_shots/chat_${tag}_1_streaming.png` });
    await idle();
    await p.click('.drawer .ns-jump'); await wait(1500);
    const end = await p.$eval('.drawer .msgs', m => { const l = [...m.querySelectorAll(':scope > .msg, :scope > .ns-msgbar')].at(-1); return l.getBoundingClientRect().bottom - m.getBoundingClientRect().bottom; });
    ok(end <= 4, `↓ brings the end into view (${Math.round(end)} px)`);
    await p.evaluate(() => { window.__slow = 0; });

    /* 2. stop */
    await p.evaluate(() => { window.__slow = 150; });
    await type('a long one to stop'); await wait(900);
    await p.click('.drawer .composer .ns-stop'); await wait(300);
    ok(await p.evaluate(() => !__tut().busy && __tut().history().at(-1).meta?.stopped === true && __tut().history().at(-1).text.length > 10), '■ keeps what came so far as the answer');
    ok(await p.isVisible('.drawer .ns-stopped'), '… marked "Stopped"');
    await p.evaluate(() => { window.__slow = 0; });

    /* 3. ↻ another answer */
    const nAns = await p.$$eval('.drawer .ns-msgbar.ai', x => x.length);
    await p.locator('.drawer .ns-msgbar.ai').last().locator('button[aria-label="Answer again"]').click(); await idle();
    ok(await p.evaluate(() => __tut().version(__tut().history().length - 1).join('/') === '2/2'), '↻ another answer: the old one kept (2 versions)');
    ok(await p.locator('.drawer .ns-msgbar.ai').last().locator('.ns-vn').innerText() === '2/2' && await p.$$eval('.drawer .ns-msgbar.ai', x => x.length) === nAns, '‹ 2/2 › under the answer');
    await p.locator('.drawer .ns-msgbar.ai').last().locator('button[aria-label="Previous version"]').click(); await wait(200);
    ok(await p.evaluate(() => __tut().history().at(-1).meta?.stopped === true), '‹ shows the stopped answer again');

    /* 4. ✎ edit an earlier message → a branch */
    await p.locator('.drawer .ns-msgbar.me').nth(1).locator('button[aria-label="Edit"]').click(); await wait(200);
    ok(await p.isVisible('.drawer .ns-edit textarea'), '✎ opens the message for editing in place');
    await p.fill('.drawer .ns-edit textarea', 'EDITED: a short answer this time');
    await p.press('.drawer .ns-edit textarea', 'Enter'); await idle();
    const h = await p.evaluate(() => __tut().history().map(m => m.text.slice(0, 30)));
    ok(h.length === 4 && h[2].startsWith('EDITED') && /Answer \d+ to: EDITED/.test(h[3]), 'the edited message is answered, the turns after the old one leave the path: ' + JSON.stringify(h));
    const ctxSent = await p.evaluate(() => window.__reqs.at(-1).contents.map(c => c.parts.map(x => x.text || '').join('').slice(0, 25)));
    ok(ctxSent.length === 3 && !ctxSent.some(t => /one more long|to stop/.test(t)), 'the AI is sent only the active branch: ' + JSON.stringify(ctxSent));
    ok(await p.locator('.drawer .ns-msgbar.me').nth(1).locator('.ns-vn').innerText() === '2/2', '‹ 2/2 › under the edited message');
    await p.locator('.drawer .ns-msgbar.me').nth(1).locator('button[aria-label="Previous version"]').click(); await wait(300);
    ok(await p.evaluate(() => __tut().history().length === 8 && __tut().history()[2].text === 'another long answer please'), '‹ brings back the old message and the whole conversation after it');
    await p.locator('.drawer .ns-msgbar.me').nth(1).locator('button[aria-label="Next version"]').click(); await wait(800);
    const rec = await p.evaluate(async () => NoemaConvos.get(ACCOUNT.id, __tut().current().id));
    ok(rec.messages.length === 4 && rec.messages[2].content.startsWith('EDITED') && rec.branches.length === 7 && rec.branches.every(m => m.id && 'parent' in m), `stored: the active path in messages, ${rec.branches.length} turns in branches with their parents`);

    /* 5. another device's older copy arrives: nothing is lost */
    const merged = await p.evaluate(async id => {
      const acc = ACCOUNT.id, r = await NoemaConvos.get(acc, id);
      const other = { ...r, messages: r.messages.slice(0, 2).concat([{ id: 'm_other1', role: 'user', content: 'from the phone', createdAt: new Date().toISOString() }]), branches: [], updatedAt: new Date(Date.now() + 5000).toISOString() };
      await NoemaConvos.put(acc, other, { silent: true, keepUpdatedAt: true });
      const after = await NoemaConvos.get(acc, id);
      return { path: after.messages.map(m => m.content.slice(0, 14)), all: after.messages.length + (after.branches?.length || 0) };
    }, rec.id);
    ok(merged.path.at(-1) === 'from the phone' && merged.all === 4 + 7 + 1, `a newer copy from another device keeps every turn of this one as branches (${merged.all} turns)`);
    await p.evaluate(() => { __tut().fresh(); }); await wait(200);

    /* 6. files */
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==', 'base64');
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.click('.drawer .composer .ns-attach')]);
    await fc.setFiles([{ name: 'circuit.png', mimeType: 'image/png', buffer: png }, { name: 'notes.md', mimeType: 'text/markdown', buffer: Buffer.from('# My notes\nV = I R') }]);
    for (let i = 0; i < 30 && (await p.$$('.drawer .ns-pending .ns-file')).length < 2; i++) await wait(100);
    ok((await p.$$('.drawer .ns-pending .ns-file')).length === 2, '📎 the chosen files wait above the box, each with ✕');
    await type('what does this picture show?'); await idle();
    const parts = await p.evaluate(() => window.__reqs.at(-1).contents.at(-1).parts.map(x => x.inlineData ? x.inlineData.mimeType : (x.text || '').slice(0, 40)));
    ok(parts[0] === 'image/png' && /My notes/.test(parts[1]) && /what does this/.test(parts[2]), 'the picture goes to Gemini as inline data, the text file as text: ' + JSON.stringify(parts));
    ok(await p.$eval('.drawer .msg.me:last-of-type img, .drawer .msgs .msg.me .ns-file.img img', i => i.complete && i.naturalWidth > 0).catch(() => false), 'the picture shows in the message');
    await p.screenshot({ path: `/tmp/noema_shots/chat_${tag}_2_files.png` });
    await type('and a second question'); await idle();
    ok(await p.evaluate(() => window.__reqs.at(-1).contents[0].parts.some(x => x.inlineData?.mimeType === 'image/png')), 'the file goes with its message on later turns too');

    /* 5b. the bar over the talk folds away, shows for 4 s after each answer, and opens again */
    await p.click('.drawer .threadbar .tb-fold[aria-label="Fold this bar"]'); await wait(200);
    const h1 = await p.$eval('.drawer .threadbar', e => e.offsetHeight);
    ok(await p.$('.drawer .threadbar.folded') && h1 < 50, `the bar folds to one thin line (${h1} px)`);
    await p.screenshot({ path: `/tmp/noema_shots/chat_${tag}_4_folded.png` });
    await type('a quick one'); await idle();
    ok(await p.$('.drawer .threadbar.peek .tb-actions'), '… and opens by itself after the answer');
    await p.mouse.move(5, 5); await wait(4300);
    ok(await p.$('.drawer .threadbar.folded'), '… then folds again after 4 s');
    await p.reload(); await p.waitForFunction(() => window.NoemaTutor?.current?.()?.session, null, { timeout: 30000 }); await wait(500);
    await p.addStyleTag({ path: path.join(ROOT, 'engine/vendor/katex/katex.min.css') });
    await p.addScriptTag({ path: path.join(ROOT, 'engine/vendor/katex/katex.min.js') });
    await p.evaluate(() => { __tut().openTutor({ kind: 'section', id: 'ch05-s04' }, 'explain'); }); await wait(300);
    await type('after a reload'); await idle(); await wait(4300);
    ok(await p.$('.drawer .threadbar.folded'), 'folded stays folded after a reload (this device)');
    await p.click('.drawer .threadbar .tb-fold[aria-label="Open this bar"]'); await wait(200);
    ok(!(await p.$('.drawer .threadbar.folded')) && await p.$('.drawer .threadbar .tb-actions'), '⌄ opens it again');

    /* 7. formulas */
    await p.evaluate(() => { __tut().fresh(); }); await wait(200);
    await type('show me the formula'); await idle(); await wait(300);
    const m = await p.$$eval('.drawer .msg.ai:last-of-type, .drawer .msgs > .msg.ai', els => { const e = els.at(-1).cloneNode(true); e.querySelectorAll('.katex-mathml').forEach(x => x.remove()); document.body.append(e); const blocks = [...e.querySelectorAll('.mathblock')]; const r = { blocks: blocks.length, katex: e.querySelectorAll('.katex').length, raw: /\\underbrace|\$\$/.test(e.innerText), money: /\$5 and \$10/.test(e.innerText), over: [], greek: /σταθερ/.test(e.textContent) && /ταλαντευ/.test(e.textContent) }; e.remove(); return r; });
    ok(m.blocks === 2 && m.katex >= 3 && !m.raw && m.greek, `${JSON.stringify(m)} formulas drawn whole: ${m.blocks} display, ${m.katex} in all, Greek in \\text kept, no raw TeX left`);
    ok(m.money, 'money ($5 and $10) is left as text');
    const over = await p.$$eval('.drawer .msgs .mathblock', bs => bs.map(b => b.scrollWidth - b.clientWidth));
    ok(over.length >= 2 && over.every(x => x <= 1), 'every display formula fits the drawer: ' + JSON.stringify(over));
    const bx = await box();
    ok(bx.sw <= bx.cw + 1, `the talk never scrolls sideways (${bx.sw} ≤ ${bx.cw})`);
    await p.$eval('.drawer .msgs', m => { const e = [...m.querySelectorAll('.mathblock')][0]; m.scrollTop = e.offsetTop - 120; });
    await wait(300);
    await p.screenshot({ path: `/tmp/noema_shots/chat_${tag}_3_math.png` });
    ok(!E.length, 'no page errors' + (E.length ? ': ' + E.join(' | ') : ''));
    await ctx.close();
  };
  console.log('Desktop'); await run({ width: 1280, height: 860 }, 'desktop');
  console.log('Phone'); await run({ width: 390, height: 844 }, 'phone');
  await b.close();
  console.log(fails ? `❌ ${fails} failed` : '✅ all passed');
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
