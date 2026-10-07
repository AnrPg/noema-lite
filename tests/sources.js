/* Sources (chapter ↔ sources mapping, chips, cards), source files (attach, cloud, second device), the 👁 viewer
   with every supported format, and subject management (rename, description, hide, delete).
   Usage: node tests/sources.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const { start } = require('./mock_supabase');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(200); } return false; };
const PORT = 54341, BASE = `http://localhost:${PORT}`;
const TF = path.join(ROOT, 'dist/site/testfiles');

(async () => {
  execFileSync('python3', [path.join(ROOT, 'tests/fixtures/make_viewer_files.py'), TF], { stdio: 'ignore' });
  const cfg = `window.NOEMA_CONFIG = { appName: 'noema-lite', siteUrl: '${BASE}', supabaseUrl: '${BASE}', supabaseKey: 'sb_publishable_test', askSubjectOnStart: true };`;
  const srv = await start({ port: PORT, staticDir: path.join(ROOT, 'dist', 'site'), configOverride: cfg });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } }); const p = await ctx.newPage(); p.setDefaultTimeout(15000); const E = []; p.on('pageerror', e => E.push(e.message));
  await p.goto(BASE + '/'); await wait(800);
  await p.click('text=Sign in / create a cloud account'); await p.click('text=No account yet? Create one');
  await p.fill('input[placeholder="Display name"]', 'Gia'); await p.fill('input[type=email]', 'gia@example.com'); await p.fill('input[type=password]', 'secret123');
  await p.click('button:has-text("Create account")'); await wait(1200);
  const gia = Object.values(srv.state.users).find(u => u.email === 'gia@example.com').id;

  // a Greek pack shaped like a real one: one chapter drawing on four sources, mapped to only one of them
  const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'library/subjects/demo-physics/pack.json'), 'utf8'));
  fx.subject = { ...fx.subject, id: 'kytt', title: 'Κυτταροσκελετός', language: 'el', owner: null }; fx.version = 'k1';
  fx.sources = { sources: [
    { id: 'chat', title: 'Μάθημα «Teach Cytoskeleton» (συνομιλία ChatGPT)', subtitle: 'Πλήρες DAG', pages: 'όλο', added: '2026-10-07', emoji: '💬' },
    { id: 'ecb', title: 'Essential Cell Biology — Κεφ. 17 Κυτταροσκελετός', subtitle: 'Alberts et al. (συνημμένο PDF)', pages: 'κεφ. 17', file: 'sources/ecb-17.pdf', added: '2026-10-07', emoji: '📘' },
    { id: 'karp', title: "Karp's Cell Biology — Κεφ. 9 Κυτταροσκελετός", subtitle: 'Wiley (συνημμένο PDF)', pages: 'κεφ. 9', added: '2026-10-07', emoji: '📗' },
    { id: 'khan', title: 'Khan Academy (MCAT): The cytoskeleton', subtitle: BASE + '/testfiles/notes.md', pages: 'άρθρο', added: '2026-10-07', emoji: '🌐' }], chapters: { ch01: 'chat' }, patches: {} };
  fx.chapters[0].sourcePages = 'ECB σ. 2–3 · Karp 9.2, 9.5 · chat F (Microtubules) · Khan Academy · Ερωτήσεις 17–11';
  await p.evaluate(async pk => { await Noema.importPack(Noema.account.id, pk); }, fx);
  await p.goto(BASE + '/?subject=kytt'); await wait(2200);

  console.log('— the chapter header');
  await p.evaluate(() => { location.hash = '#/ch/ch01'; }); await wait(700);
  ok(await p.evaluate(() => document.documentElement.lang) === 'el', '<html lang> follows the subject (Greek capitals without accents, Greek hyphenation)');
  ok(await p.$eval('.chhead .num', e => e.textContent) === 'Chapter 1', 'the kicker is only “Chapter 1” (no long capitalised page list)');
  const chips = await p.$$eval('.srcrefs .srcref', b => b.map(x => x.textContent));
  ok(chips.length === 4 && /chat F/.test(chips[0]) && chips.some(t => /ECB σ\. 2–3/.test(t)) && chips.some(t => /Karp 9\.2/.test(t)) && chips.some(t => /Khan Academy/.test(t)), 'one chip per source the chapter uses, its main source first: ' + chips.join(' | '));
  await p.screenshot({ path: SHOTS + '/s1_header.png', clip: { x: 0, y: 0, width: 1280, height: 330 } });

  console.log('— the sources menu');
  await p.click('.srcref:has-text("ECB")'); await wait(400);
  ok(await p.locator('.srcdeck .srccard.exp').count() === 1 && /Attach the file/.test(await p.locator('.srcdeck .srccard.exp').innerText()), 'a source without a file → its card opens with 📎 Attach');
  ok(!(await p.locator('.srcdeck .newpill').count()) && !(await p.locator('button:has-text("only what’s new")').count()), 'sources added together are not marked ✨ new');
  await p.setInputFiles('.srccard.exp .srcfile input[type=file]', path.join(TF, 'book.pdf'));
  ok(await until(async () => /Preview/.test(await p.locator('.srccard:has-text("Essential Cell Biology") .srcfile').innerText())), '📎 attached: the card shows the file with 👁 Preview');
  const synced = await until(() => Object.keys(srv.state.files).includes(`${gia}/sources/kytt/ecb/file.pdf`) && /book\.pdf/.test(srv.state.kv[gia]?.['a:srcfiles:kytt']?.value || ''), 15000);
  if (!synced) console.log('   files:', JSON.stringify(Object.keys(srv.state.files)), 'kv:', JSON.stringify(srv.state.kv[gia]?.['a:srcfiles:kytt']));
  ok(synced, 'the file is in the private cloud folder and the synced index');
  await p.click('.srcdeck .srccard:has-text("Khan") .srcmain'); await wait(300);
  const khan = await p.locator('.srcdeck .srccard:has-text("Khan")').innerText();
  ok(/Ch1/.test(khan) && /also/.test(khan) && /Preview/.test(khan), 'Khan (only cited in the text) lists the chapter as “also”, and has 👁 for its web address');
  await p.screenshot({ path: SHOTS + '/s2_deck.png' });
  await p.click('.srcdeck button[title="Close"]').catch(() => { });

  console.log('— 👁 preview from the chapter');
  await p.click('.srcref:has-text("ECB")');
  ok(await until(() => p.locator('.vw-ov .vw-page canvas').count()), 'the PDF opens over the app (pdf.js)');
  ok(await until(async () => await p.$eval('.vw-pgin', e => e.value) === '2'), 'it jumps to the cited page (σ. 2)');
  await p.screenshot({ path: SHOTS + '/s3_pdf.png' });
  await p.keyboard.press('Escape'); await wait(200);
  await p.click('.srcref:has-text("Khan")'); ok(await until(() => p.locator('.vw-ov .vw-doc h1').count()), 'a web source opens too (fetched, rendered)'); await p.keyboard.press('Escape');

  console.log('— the same file on another device (from the cloud)');
  const c2 = await browser.newContext({ storageState: await ctx.storageState() }); const p2 = await c2.newPage();
  await p2.goto(BASE + '/?subject=kytt#/ch/ch01'); await wait(2500);
  await p2.click('.srcref:has-text("ECB")');
  ok(await until(() => p2.locator('.vw-ov .vw-page canvas').count()), 'a device without the file downloads it from the cloud and opens it');
  await c2.close();

  console.log('— every format in the viewer');
  const files = { 'book.pdf': ['.vw-page', 3], 'figure.png': ['img.vw-img'], 'photo.jpg': ['img.vw-img'], 'anim.gif': ['img.vw-img'], 'diagram.svg': ['img.vw-img'], 'scan.tiff': ['canvas.vw-img'],
    'notes.md': ['.vw-doc h1', 'δομή'], 'table.csv': ['.vw-table', 'A; quoted'], 'data.json': ['.vw-pre', '"gene": "TP53"'], 'script.py': ['.vw-pre', 'python ok'], 'greek-1253.txt': ['.vw-pre', 'Ελληνικά σε windows-1253'],
    'chapter.docx': ['.vw-doc', 'Word heading'], 'sheet.xlsx': ['.vw-sheet', 'BRCA1'], 'slides.pptx': ['.vw-slide', 'Slide title ok'], 'essay.odt': ['.vw-doc', 'ODT heading ok'], 'letter.rtf': ['.vw-doc', 'RTF ok Ελληνικά'],
    'book.epub': ['.vw-doc', 'EPUB chapter ok'], 'analysis.ipynb': ['.vw-doc', 'Notebook ok'], 'mail.eml': ['.vw-mailhead', 'Θέμα μαθήματος'], 'bundle.zip': ['.vw-table', 'inside/readme.md'], 'tone.wav': ['audio'],
    'old.doc': ['.vw-pre', 'Legacy document text ok'], 'mystery.bin': ['.vw-pre', '000000'], 'page.html': ['iframe.vw-frame'] };
  for (const [f, [sel, want]] of Object.entries(files)) {
    await p.evaluate(async f => { const b = await (await fetch('/testfiles/' + f)).blob(); window.__vw = await NoemaViewer.open({ blob: b, name: f, title: f }); }, f);
    const got = await until(async () => { const n = await p.locator('.vw-ov ' + sel).count(); if (!n) return false; if (typeof want === 'number') return n >= want; if (!want) return true; return (await p.locator('.vw-ov').innerText()).includes(want) || (await p.locator('.vw-ov ' + sel).first().evaluate((e, w) => (e.textContent || '').includes(w), want)); }, 12000);
    ok(got, `${f} → ${await p.evaluate(() => document.querySelector('.vw-ov .vw-sub')?.textContent || '')}`);
    if (['slides.pptx', 'sheet.xlsx', 'chapter.docx'].includes(f)) await p.screenshot({ path: SHOTS + `/s4_${f.replace('.', '_')}.png` });
    if (f === 'page.html') ok(await p.evaluate(() => !window.HACKED && /HTML ok/.test(document.querySelector('.vw-ov iframe').srcdoc) && !/<script/i.test(document.querySelector('.vw-ov iframe').srcdoc)), 'HTML is shown without its scripts (sanitised + sandboxed)');
    if (f === 'bundle.zip') { await p.click('.vw-ov button:has-text("Open")'); ok(await until(async () => /Inner file ok/.test(await p.locator('.vw-ov').innerText())), 'a file inside the ZIP opens in the viewer'); }
    if (f === 'mail.eml') ok(/HTML mail body ok/.test(await p.$eval('.vw-ov iframe', e => e.srcdoc)), 'the e-mail’s HTML part is shown');
    if (f === 'slides.pptx') ok(await p.locator('.vw-ov .vw-slide img').count() === 1, 'PowerPoint slide pictures are shown');
    ok(await p.locator('.vw-ov a[download]').count() === 1, `${f}: ⬇️ download offered`);
    await p.keyboard.press('Escape'); await wait(100);
  }
  await p.evaluate(() => NoemaViewer.open({ url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', start: 2220, title: 'Lecture' }));
  ok(/youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?start=2220/.test(await p.$eval('.vw-ov iframe', e => e.src)), 'YouTube lectures play inside, at the cited time');
  await p.keyboard.press('Escape');

  console.log('— remove the file');
  await p.evaluate(() => { DECK.expanded.ecb = true; toggleSourcesDeck(true); }); await wait(200);
  p.once('dialog', d => d.accept()); await p.click('.srccard:has-text("Essential Cell Biology") button:has-text("Remove file")'); await wait(3500);
  ok(!Object.keys(srv.state.files).includes(`${gia}/sources/kytt/ecb/file.pdf`) && !/ecb/.test(srv.state.kv[gia]?.['a:srcfiles:kytt']?.value || ''), 'removed from the cloud and the index');

  console.log('— subjects: rename, describe, hide, delete');
  await p.evaluate(() => { Noema.openSubjectPicker(); }); await wait(500);
  await p.hover('.noema-chipwrap:has-text("Databricks")'); await p.click('.noema-chipwrap:has-text("Databricks") .noema-editbtn'); await wait(300);
  await p.fill('.noema-ovbox input[aria-label="Name"]', 'Spark & Delta (my notes)'); await p.fill('.noema-ovbox textarea[aria-label="Description"]', 'For the certification');
  await p.click('.noema-ovbox button:has-text("Save")'); await wait(500);
  ok(await p.locator('.noema-chip:has-text("Spark & Delta (my notes)")').count() === 1, 'a library subject can be renamed (only for you) — the list updates');
  await p.screenshot({ path: SHOTS + '/s5_rename.png' });
  await p.click('.noema-chip:has-text("Spark & Delta")');
  const renamed = await until(async () => /Spark & Delta \(my notes\)/.test(await p.locator('.subjchip').textContent()), 20000);
  if (!renamed) console.log('   subjchip:', await p.locator('.subjchip').innerText().catch(e => e.message), await p.evaluate(() => location.href + ' ' + JSON.stringify(Noema.subject?.title)));
  ok(renamed, 'the new name is used in the app');
  ok(await until(() => /Spark & Delta/.test(srv.state.kv[gia]?.['a:subjoverride:databricks']?.value || ''), 15000), 'and synced to every device');
  await p.evaluate(() => { Noema.openSubjectPicker(); }); await wait(500);
  await p.hover('.noema-chipwrap:has-text("Κυτταροσκελετός")'); await p.click('.noema-chipwrap:has-text("Κυτταροσκελετός") .noema-editbtn'); await wait(300);
  p.once('dialog', d => d.accept()); await p.click('.noema-ovbox button:has-text("Delete the subject")'); await wait(1500);
  ok(!(await p.locator('.noema-chip:has-text("Κυτταροσκελετός")').count()) && !Object.keys(srv.state.files).some(k => k.endsWith('/packs/kytt.json')) && !(await p.evaluate(() => localStorage.getItem(`noema1:${Noema.account.id}:a:packmeta:kytt`))), 'an own subject can be deleted (device + cloud + metadata)');
  await p.hover('.noema-chipwrap:has-text("Spark & Delta")'); await p.click('.noema-chipwrap:has-text("Spark & Delta") .noema-editbtn'); await wait(300);
  await p.click('.noema-ovbox button:has-text("Restore the original")'); await wait(500);
  ok(await p.locator('.noema-chip:has-text("Databricks")').count() === 1, '↩ the original name comes back');
  ok(!E.length, 'no page errors ' + JSON.stringify(E.slice(0, 3)));
  await browser.close(); srv.close();
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})();
