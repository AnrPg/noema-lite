/* 🗄️ The vault (engine/vault.js, docs/VAULT.md) against the Supabase emulator (rules of cloud/supabase.sql §13).
   Without a browser: the search in any script (Greek in plain and scholarly Latin letters, accents or not), the format checks
   by the first bytes (a program renamed .pdf is refused), the filters across universities and years.
   In the browser: the Vault tab, an upload of several files with the required fields (a program, an SVG and a fake PDF
   refused; the rules box; the quota), anonymous by default; another person's file with their name shown; the filters
   (biology notes of any university, 3rd semester), the folders (by school or by field, Misc for what is not given; the files by type; pins), the search
   in Latin letters, a file's page (preview, download counted once, rating, report — hidden after three), "Make a course
   from it" opening 📚 From your sources with the file, editing and deleting one's own file, the phone width, Greek menus.
   Usage: node tests/vault.js <prepared-repo-dir> */
const { chromium } = require(process.env.PW || 'playwright');
const path = require('path'), fs = require('fs'), vm = require('vm'), { execFileSync } = require('child_process');
const { start } = require('./mock_supabase');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const SHOTS = '/tmp/noema_shots'; fs.mkdirSync(SHOTS, { recursive: true });
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
const wait = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, ms = 15000, step = 200) => { const t = Date.now(); while (Date.now() - t < ms) { try { if (await fn()) return true; } catch (e) { } await wait(step); } return false; };
const PORT = 54381, BASE = `http://localhost:${PORT}`;

/* ---------- 1. without a browser ---------- */
async function unit() {
  console.log('— the search, the format checks and the filters, without a browser');
  const EN = JSON.parse(fs.readFileSync(path.join(ROOT, 'i18n/vault/en.arb'), 'utf8'));   // the English words, placeholders filled in
  const NoemaI18n = { t: (k, p = {}) => String(EN[k] ?? k).replace(/\{(\w+)(?:, number)?\}/g, (m, x) => p[x] != null ? String(p[x]) : m), fmt: { number: n => String(n) } };
  const ctx = { window: {}, crypto: require('crypto').webcrypto, console, URLSearchParams, NoemaI18n }; ctx.window = ctx; vm.createContext(ctx);
  for (const f of ['engine/catalog.js', 'engine/vault.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx);
  const V = ctx.NoemaVault;
  V.Fields.set(JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/vault_fields/fields.json'), 'utf8')).map(f => ({ ...f, status: 'accepted' })));   // the seed of the field graph
  ok(V.matches('Σημειώσεις Βιολογίας · Πανεπιστήμιο Κρήτης', 'viologias') && V.matches('Σημειώσεις Βιολογίας', 'biologias') && V.matches('Σημειώσεις Βιολογίας', 'βιολογιας') && V.matches('Βιολογία', 'ΒΙΟΛΟΓΊΑ'), 'Greek is found as written, without accents, in plain Latin (viologia) and scholarly Latin (biologia)');
  ok(V.matches('Генетика, МГУ', 'genetika') && V.matches('Café Économie', 'cafe economie') && !V.matches('Genetics', 'physics'), 'Cyrillic in Latin letters, accents ignored, other words not');
  const file = (name, bytes, size) => ({ name, size: size ?? bytes.length, slice: () => ({ arrayBuffer: async () => Uint8Array.from(bytes).buffer }) });
  const b = s => [...Buffer.from(s, 'binary')];
  ok(await V.checkFile(file('notes.pdf', b('%PDF-1.7 ...'))) === '', 'a real PDF is taken');
  ok(/not what its name says/.test(await V.checkFile(file('notes.pdf', b('MZ\x90\x00 a program'))) || ''), 'a program renamed .pdf is refused by its first bytes');
  ok(/does not take/.test(await V.checkFile(file('setup.exe', b('MZ'))) || '') && /does not take/.test(await V.checkFile(file('a.svg', b('<svg'))) || '') && /does not take/.test(await V.checkFile(file('all.zip', b('PK\x03\x04'))) || ''), 'programs, SVG pictures and archives are refused');
  ok(/Bigger than 20 MB/.test(await V.checkFile(file('big.pdf', b('%PDF'), 21 * 1048576)) || '') && /50 MB/.test(await V.checkFile(file('a.pdf', b('%PDF'), 5 * 1048576), 48 * 1048576) || ''), 'files over 20 MB and over the 50 MB quota are refused');
  ok(await V.checkFile(file('slides.pptx', b('PK\x03\x04....'))) === '' && await V.checkFile(file('talk.mp3', b('ID3....'))) === '' && /not what/.test(await V.checkFile(file('notes.txt', [65, 0, 66])) || ''), 'slides and audio are taken; a “text” file with binary in it is not');
  const rows = [
    { university: 'University of Crete', department: 'Biology', course: 'Genetics', year: 2023, semester: 3, kind: 'notes', fields: ['Q7162'], language: 'en', title: 'Genetics notes', file_name: 'g.pdf' },
    { university: 'Πανεπιστήμιο Αθηνών', department: 'Βιολογίας', course: 'Γενετική', year: 2021, semester: 3, kind: 'notes', fields: ['Q7162'], language: 'el', title: 'Σημειώσεις Γενετικής', file_name: 'g2.pdf', has_solutions: true },
    { university: 'University of Crete', department: 'Biology', course: 'Genetics', year: 2023, semester: 3, kind: 'exam', fields: ['Q7162', 'Q420'], language: 'en', title: 'Exam 2023', file_name: 'e.pdf' },
    { university: 'University of Crete', department: 'Physics', course: 'Mechanics', year: 2022, semester: 1, kind: 'notes', fields: ['Q413'], language: 'en', title: 'Mechanics', file_name: 'm.pdf' }];
  const got = P => V.filter(rows, P).map(r => r.title).join(' | ');
  ok(got({ sub: 'Q420', k: 'notes', sem: '3' }) === 'Genetics notes | Σημειώσεις Γενετικής', 'biology notes of any university and any year, 3rd semester: both universities');
  ok(got({ u: 'university of crete', y: '2023' }) === 'Genetics notes | Exam 2023' && got({ sol: '1' }) === 'Σημειώσεις Γενετικής' && got({ q: 'genetiki' }) === 'Genetics notes | Σημειώσεις Γενετικής | Exam 2023' && got({ q: 'athinon' }) === 'Σημειώσεις Γενετικής', 'a university in any case, a year, “has solutions”, Greek in Latin letters (the field Genetics is Γενετική in Greek: all three)');
  const more = [...rows, { university: null, department: null, course: null, year: 2026, semester: null, kind: 'other', fields: ['Q1120908'], language: 'el,ru', title: 'Glossary el–ru', file_name: 'gl.pdf' }];
  const got2 = P => V.filter(more, P).map(r => r.title).join(' | ');
  ok(got2({ sem: '1' }) === 'Mechanics | Glossary el–ru' && got2({ lg: 'ru' }) === 'Glossary el–ru' && got2({ lg: 'el' }) === 'Σημειώσεις Γενετικής | Glossary el–ru', 'a file of any semester shows under every semester; a file in Greek and Russian under either language');
  ok(got2({ q: 'glossary 2026' }) === 'Glossary el–ru' && got2({ q: '2026' }) === 'Glossary el–ru' && got2({ q: 'notes 2021' }) === 'Σημειώσεις Γενετικής', 'the search looks in every field too: a year, a type; a file without a university, course or semester is still found');
  ok(got({ q: 'lecture notes 2023' }) === 'Genetics notes', 'the type’s menu word (English, always on the page) finds the type');
  console.log('— the field graph');
  const F = V.Fields, en = id => F.name(id);
  ok(F.up('Q1120908').has('Q413') && F.up('Q1120908').has('Q11190') && F.up('Q1120908').has('b_hw') && F.up('Q1120908').has('b_ns'), 'Medical physics sits under Physics and under Medicine (and so under both broad fields): a graph, not a tree');
  ok(got2({ sub: 'Q413' }) === 'Mechanics | Glossary el–ru' && got2({ sub: 'Q11190' }) === 'Glossary el–ru' && got2({ sub: 'b_ns' }).split(' | ').length === 5, 'a field’s filter holds the files of every field below it, by any path');
  ok(got2({ q: 'ιατρική φυσική' }) === 'Glossary el–ru' && got2({ q: 'physique medicale' }) === 'Glossary el–ru' && got2({ q: 'genetika' }).split(' | ').length === 3, 'the search finds a file by its fields’ names in any language (Greek, French without accents, Russian in Latin letters)');
  ok(F.find('ιατρική φυσ')[0] === 'Q1120908' && F.find('radiolog').some(id => en(id) === 'Radiology') && F.find('физика')[0] === 'Q413', 'finding a field: part of its name, in any language');
  ok(F.find('genitcs').some(id => en(id) === 'Genetics') && F.find('machin lerning').some(id => en(id) === 'Machine learning') && F.find('ml').some(id => en(id) === 'Machine learning') && F.find('γενετκη').some(id => en(id) === 'Genetics'), 'typing still finds, also with a typo or by initials');
  ok(F.find('physics')[0] === 'Q413', 'the close matches stay first');
  ok(F.fromText('Σημειώσεις Γενετικής').includes('Q7162') && F.fromText('Medical physics lecture 3').join() === 'Q1120908' && !F.fromText('Lecture 1').length, 'suggestions from a title, inflected Greek too; the specific field, not also the one above it');
  ok(F.fromText('the modern ai and data platform · AI systems').includes('Q11660') && F.fromText('Organic chemistry exam').map(en).join() === 'Organic chemistry', 'an abbreviation in capitals (AI → Artificial intelligence); a field named in a title');
  ok(F.roots().length === 10 && F.roots().every(id => /^b_/.test(id)), 'the top: the ten broad fields of ISCED-F');
  ok(V.hashOf({ q: 'dna', sem: '3', k: 'notes,exam' }) === '#/vault?q=dna&sem=3&k=notes%2Cexam', 'the filters live in the address');
}

/* ---------- 2. in the browser ---------- */
(async () => {
  await unit();
  const cfg = `window.NOEMA_CONFIG = { appName: 'noema-lite', siteUrl: '${BASE}', supabaseUrl: '${BASE}', supabaseKey: 'sb_publishable_test', askSubjectOnStart: false, onboarding: false };`;
  const srv = await start({ port: PORT, staticDir: path.join(ROOT, 'dist', 'site'), configOverride: cfg });
  const TF = path.join(require('os').tmpdir(), 'noema-vault-files-' + process.pid); fs.mkdirSync(TF, { recursive: true });
  const pdf = (name, text, pages = 2) => { const f = path.join(TF, name); execFileSync('python3', ['-c', `
import sys
from reportlab.pdfgen import canvas
c = canvas.Canvas(sys.argv[1])
for i in range(int(sys.argv[3])): c.drawString(72, 720, sys.argv[2] + ' page %d' % (i + 1)); c.showPage()
c.save()`, f, text, String(pages)]); return f; };
  const F1 = pdf('Genetics lecture 1.pdf', 'Genetics lecture 1', 3), F2 = pdf('Genetics lecture 2.pdf', 'Genetics lecture 2');
  const EXE = path.join(TF, 'setup.exe'); fs.writeFileSync(EXE, 'MZ\x90\x00 program');
  const SVG = path.join(TF, 'diagram.svg'); fs.writeFileSync(SVG, '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  const FAKE = path.join(TF, 'answers.pdf'); fs.writeFileSync(FAKE, 'MZ this is a program, not a PDF');
  const browser = await chromium.launch();
  const signUp = async (p, name, email) => {
    await p.goto(BASE + '/'); await wait(800);
    await p.click('text=Sign in / create a cloud account'); await p.click('text=No account yet? Create one');
    await p.fill('input[placeholder="Display name"]', name); await p.fill('input[type=email]', email); await p.fill('input[type=password]', 'secret123');
    await p.click('button:has-text("Create account")'); await wait(1300);
    await p.evaluate(() => { localStorage.setItem('noema-test:newUI', '1'); NoemaThemes?.putSettings?.({ onboarded: Date.now(), world: 'know' }); });
    await p.reload(); await wait(900);
    if (await p.$('.ns-onb')) { await p.click('[data-pick="know"]').catch(() => { }); await wait(200); await p.click('[data-onbdone]').catch(() => { }); await wait(400); }
  };
  const token = async email => (await (await fetch(BASE + '/auth/v1/token?grant_type=password', { method: 'POST', headers: { apikey: 'k', 'content-type': 'application/json' }, body: JSON.stringify({ email, password: 'secret123' }) })).json()).access_token;
  const rest = (t, pth, o = {}) => fetch(BASE + pth, { ...o, headers: { apikey: 'k', authorization: 'Bearer ' + t, 'content-type': 'application/json', ...(o.headers || {}) } });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true }); const p = await ctx.newPage(); p.setDefaultTimeout(15000);
  const E = []; p.on('pageerror', e => E.push(e.message));
  try {
    /* another student shares a file first, with their name shown (through the same server calls the app makes) */
    const p2 = await (await browser.newContext()).newPage(); await signUp(p2, 'Nikos', 'nikos@example.com'); const T2 = await token('nikos@example.com');
    const gid = '0b9a3c55-1d2e-4f00-8a11-22c3d4e5f601', gpath = `files/${gid}.pdf`, gbytes = fs.readFileSync(pdf('Σημειώσεις.pdf', 'Genetiki'));
    ok((await rest(T2, '/rest/v1/noema_vault_files', { method: 'POST', body: JSON.stringify([{ id: gid, title: 'Σημειώσεις Γενετικής', university: 'Πανεπιστήμιο Αθηνών', department: 'Βιολογίας', course: 'Γενετική', year: 2021, semester: 3, kind: 'notes', subject: 'biology', language: 'el', has_solutions: true, show_name: true, file_name: 'Σημειώσεις.pdf', mime: 'application/pdf', size: gbytes.length, path: gpath }]) })).ok
      && (await rest(T2, '/storage/v1/object/noema-vault/' + gpath, { method: 'POST', body: gbytes, headers: { 'content-type': 'application/pdf' } })).ok
      && (await (await rest(T2, '/rest/v1/rpc/noema_vault_finish', { method: 'POST', body: JSON.stringify({ fid: gid }) })).json()) === 'ok', 'Nikos shares Greek genetics notes (row → file → finish), from an app before the fields: a subject');
    ok((await rest(T2, '/storage/v1/object/noema-vault/files/0b9a3c55-1d2e-4f00-8a11-000000000000.pdf', { method: 'POST', body: 'x' })).status === 403, 'nobody can put a file in the vault without its row');

    console.log('— the Vault tab, and an upload');
    await signUp(p, 'Iro', 'iro@example.com');
    ok(await p.locator('.ns-tab[data-tab="vault"]').count() === 1 && await p.locator('.ns-tab[data-tab="people"]').count() === 1 && !(await p.locator('.ns-top #ns-people').count()), 'the Vault and People are tabs of the side bar, not in Discover or the top bar');
    await p.click('.ns-tab[data-tab="vault"]'); await wait(600);
    ok(await p.locator('.ns-tab[data-tab="vault"].on').count() === 1, 'the Vault tab is lit on its page');
    ok(/#\/vault/.test(p.url()) && await p.locator('.vt-view h1').innerText() === 'Vault' && await until(() => p.locator('.vt-file').count().then(n => n === 1)), 'the Vault page: one file so far');
    await p.click('.vt-upbtn'); await wait(300);
    await p.setInputFiles('.vt-upload .vt-pick', [F1, F2, EXE, SVG, FAKE]); await wait(600);
    const lis = await p.locator('.vt-files li').allInnerTexts();
    ok(lis.length === 5 && lis.filter(x => /does not take this kind/.test(x)).length === 2 && lis.some(x => /answers\.pdf/.test(x) && /not what its name says/.test(x)), 'five files: the program and the SVG refused by format, the fake PDF by its first bytes');
    ok(await p.locator('.vt-files li:not(.bad) .vt-title').count() === 2 && await p.inputValue('.vt-files li:not(.bad) .vt-title >> nth=0') === 'Genetics lecture 1', 'the two PDFs get titles from their names, editable');
    await p.click('.vt-go'); await wait(200);
    ok(/Still needed: Type, Fields/.test(await p.locator('.vt-err').innerText()), 'only the type, the fields and the languages are required (place and time are optional): ' + await p.locator('.vt-err').innerText());
    const fld = k => `.vt-upload [data-k="${k}"]`;
    ok(await p.getAttribute(fld('course'), 'placeholder') === '(exactly as your school calls it)' && !(await p.locator('.vt-upload .vt-fieldsfld .vt-help:visible').count()) && await p.locator('.vt-upload .vt-info').count() === 1
      && await p.evaluate(() => { const t = [...document.querySelectorAll('.vt-upload .vt-fs:first-of-type input')].map(i => Math.round(i.getBoundingClientRect().top)); return new Set(t.slice(0, 3)).size === 1; }), 'the course’s hint is inside its box (the boxes stay in line); the field’s explanation behind ⓘ');
    await p.fill(fld('university'), 'University  of Crete'); await p.fill(fld('department'), 'Biology'); await p.fill(fld('course'), 'Genetics'); await p.fill(fld('professor'), 'M. Papadaki');
    await p.selectOption(fld('year'), '2023'); await p.selectOption(fld('semester'), '3'); await p.selectOption(fld('kind'), 'notes');
    ok(await until(() => p.locator('.vt-upload .vt-fres .vt-fsugopt[data-id="Q7162"]').count()), 'the titles suggest a field in the list: Genetics');
    await p.fill(fld('fieldq'), 'βιολογ'); await wait(300);
    ok(await p.locator('.vt-upload .vt-fpick .vt-fres').count() === 1 && await p.locator('.vt-upload .vt-fres .vt-fopt:not(.vt-fsugopt)').first().getAttribute('data-id') === 'Q420' && await p.locator('.vt-upload .vt-fres .vt-fopt').first().getAttribute('data-id') === 'Q420'
      && await p.locator('.vt-upload .vt-fres .vt-fsugopt[data-id="Q7162"]').count() === 1, 'one list: the typed matches first (Biology), then the suggestions (Genetics)');
    await p.locator('.vt-upload .vt-fpick').scrollIntoViewIfNeeded(); await p.screenshot({ path: SHOTS + '/vt1_fieldlist.png' });
    await p.click('.vt-upload .vt-fsugopt[data-id="Q7162"]');
    await p.fill(fld('fieldq'), 'βιολογ'); await wait(300);
    ok(await p.locator('.vt-upload .vt-fopt').first().getAttribute('data-id') === 'Q420', 'a field found by part of its Greek name');
    await p.fill(fld('fieldq'), 'biolgy'); await wait(300);
    ok(await p.locator('.vt-upload .vt-fopt').first().getAttribute('data-id') === 'Q420', 'a typo still finds it (biolgy → Biology)');
    await p.fill(fld('fieldq'), 'βιολογ'); await wait(300);
    await p.press(fld('fieldq'), 'Enter'); await wait(150);
    await p.fill(fld('fieldq'), 'Population epigenetics of crete'); await wait(300);
    await p.click('.vt-upload .vt-propose'); await wait(400);
    const prop = srv.state.vfields.find(f => f.status === 'proposed');
    ok(prop && prop.parents.join() === 'Q7162,Q420' && (await p.locator('.vt-upload .vt-fchip').allInnerTexts()).length === 3 && /proposed/.test(await p.locator('.vt-upload .vt-fchips').innerText()), 'a new field proposed, under the two chosen; usable at once');
        await p.selectOption(fld('language'), 'ru');   // a second language
    ok((await p.locator('.vt-upload .vt-langs .chip').allInnerTexts()).length === 2, 'two languages chosen');
    await p.check(fld('has_exercises'));
    ok(!(await p.isChecked(fld('show_name'))), 'anonymous by default: “Show my name” is off');
    await p.click('.vt-go'); await wait(200);
    ok(/Tick the box/.test(await p.locator('.vt-err').innerText()), 'the rules must be confirmed (theirs to share, no answers of an exam not held yet)');
    ok(!/null/.test(await p.locator('.vt-upload .vt-fpick').innerText()), 'no stray “null” under the fields');
    await p.screenshot({ path: SHOTS + '/vt1_upload.png', fullPage: true });
    await p.check('.vt-rules'); await p.click('.vt-go');
    ok(await until(() => p.locator('.vt-file').count().then(n => n === 3), 20000), 'uploaded: three files in the vault');
    const rows = srv.state.vfiles.filter(f => f.title.startsWith('Genetics lecture'));
    ok(rows.length === 2 && rows.every(f => f.status === 'ok' && f.fields.join() === 'Q7162,Q420,' + prop.id && f.language === 'en,ru' && f.university === 'University of Crete' && !f.uploader_name && f.pages >= 2 && srv.state.vobj[f.path]?.data.length === f.size), 'stored: finished, three fields, two languages, the university tidied, no name, pages counted, the file whole');
    const seen = await (await rest(T2, '/rest/v1/noema_vault?select=*')).json();
    const iros = seen.filter(f => f.title.startsWith('Genetics lecture'));
    ok(iros.length === 2 && iros.every(f => !('uploader' in f) && f.uploader_name == null && f.mine === false) && seen.find(f => f.id === gid).uploader_name === 'Nikos', 'what others read has no uploader: Iro stays anonymous, Nikos shows his name');
    ok((await (await rest(T2, '/rest/v1/noema_vault_files?select=*')).json()).length === 1, 'the table itself shows each person only their own rows');
    ok(srv.state.vfiles.find(f => f.id === gid).fields.join() === 'Q420', 'the file of the older app: its subject became the field Biology');
    ok(!(await (await rest(T2, '/rest/v1/noema_vault_fields?select=id&id=eq.' + prop.id)).json()).length, 'others do not see the proposal before it is reviewed');

    console.log('— filters, folders, search');
    await p.click('.vt-filtbtn'); await wait(200);
    await p.selectOption('.vt-filters select[data-f="sub"]', 'Q420'); await wait(200);
    await p.click('.vt-filters [data-f="k"][data-v="notes"]'); await wait(200);
    await p.selectOption('.vt-filters select[data-f="sem"]', '3'); await wait(200);
    ok(await p.locator('.vt-file').count() === 3 && /3 files/.test(await p.locator('.vt-count').innerText()), 'biology notes of any university and any year, 3rd semester: Crete (2023) and Athens (2021)');
    ok(/sem=3/.test(p.url()) && /k=notes/.test(p.url()) && await p.locator('.vt-active .vt-chip').count() === 3, 'the filters are in the address and shown as removable chips');
    await p.click('.vt-filters [data-f="sol"][data-v="1"]'); await wait(200);
    ok(await p.locator('.vt-file').count() === 1 && /Σημειώσεις Γενετικής/.test(await p.locator('.vt-file').innerText()), '+ has solutions: only Nikos’s notes');
    ok(await p.locator('.ns-sheet.vt-filtsheet .vt-filters').count() === 1 && await p.locator('.vt-filters .ns-srchip.on .vt-chipx').count() === 2 && await p.locator('.vt-active .vt-chip .vt-chipx').count() === 4, 'the filters are a side panel; every chip that is on has its ×');
    await p.screenshot({ path: SHOTS + '/vt1b_filters.png' });
    await p.click('.vt-filtsheet .vt-clearall'); await wait(200);
    ok(await p.locator('.vt-file').count() === 3 && !(await p.locator('.vt-active .vt-chip').count()) && await p.locator('.vt-filtsheet .vt-clearall[disabled]').count() === 1, '“Clear all” in the panel');
    await p.click('.vt-filtsheet .ns-shhead .ns-iconbtn'); await wait(150);
    await p.fill('.vt-q', 'genetiki athinon'); await wait(400);
    ok(await p.locator('.vt-file').count() === 1, 'search “genetiki athinon” in Latin letters finds “Γενετική”, Πανεπιστήμιο Αθηνών');
    await p.fill('.vt-q', ''); await wait(400);
    await p.click('.vt-viewseg [data-v="folders"]'); await wait(200);
    const top = await p.locator('.vt-folder').allInnerTexts();
    ok(await p.locator('.vt-ways [data-by="school"].on').count() === 1 && top.length === 2 && top.some(t => /University of Crete\s+2 files/.test(t)) && top.some(t => /Πανεπιστήμιο Αθηνών\s+1 file/.test(t)), 'folders by school (the default): the universities with their counts');
    for (const v of ['University of Crete', 'Biology', 'Genetics']) { await p.click(`.vt-folder[data-v="${v}"]`); await wait(150); }
    ok(/All schools › University of Crete › Biology › Genetics/.test((await p.locator('.vt-path').innerText()).replace(/\s+/g, ' ')) && await p.locator('.vt-kindgroup[data-kind="notes"] .vt-file').count() === 2, 'school › department › course, then the files grouped by type');
    ok(!/\bnull\b/.test(await p.locator('.vt-view').innerText()), 'no stray “null” on the page');
    ok(await p.locator('.vt-endchips [data-f="lg"]').count() === 2, 'chips for the languages there (English, Russian)');
    await p.click('.vt-pin'); await wait(150);
    await p.click('.vt-pinsbtn'); await wait(100);
    ok(await p.locator('.vt-pinchip', { hasText: 'University of Crete › Biology › Genetics' }).count() === 1, 'a folder can be pinned; the pinned ones wait behind the pins button');
    const emo = /\p{Extended_Pictographic}/u;
    ok(/^School$/.test((await p.locator('.vt-ways [data-by="school"]').innerText()).trim()) && /^Field$/.test((await p.locator('.vt-ways [data-by="field"]').innerText()).trim()), 'the two ways in are short words, not emoji');
    ok(!(await p.locator('.vt-viewseg, .vt-fhead2 .vt-pin, .vt-pinsbtn').allInnerTexts()).some(t => emo.test(t)) && await p.locator('.vt-viewseg button svg').count() === 2 && await p.locator('.vt-pin svg').count() === 1, 'view toggle and pins: line icons of the app, no emoji');
    await p.click('.vt-ways [data-by="field"]'); await wait(150);
    ok((await p.locator('.vt-folder').allInnerTexts()).some(t => /Natural sciences, mathematics and statistics\s+3 files/.test(t)), 'by field: the broad fields first');
    await p.click('.vt-folder[data-v="b_ns"]'); await wait(150); await p.click('.vt-folder[data-v="Q420"]'); await wait(150);
    ok((await p.locator('.vt-folder').allInnerTexts()).some(t => /Genetics\s+2 files/.test(t)) && /Filed under Biology itself/.test(await p.locator('.vt-directhead').innerText()) && await p.locator('.vt-kindgroup .vt-file').count() === 3, 'Biology: the folders Genetics (2) and the proposed field, then the files filed under Biology itself (all three: Iro chose Biology too)');
    await p.click('.vt-pinsbtn'); await p.click('.vt-pinchip .linkish'); await wait(150);
    ok(await p.locator('.vt-kindgroup .vt-file').count() === 2, 'the pinned folder opens again');
    await p.screenshot({ path: SHOTS + '/vt2_folders.png', fullPage: true });
    await p.click('.vt-pinsbtn'); await p.click('.vt-pinchip .vt-chipx'); await wait(150);
    ok(!(await p.locator('.vt-pinsbtn').count()) && await p.locator('.vt-pin:not(.on)').count() === 1, 'a pinned folder can be forgotten (×)');
    ok(await p.evaluate(() => { const r = s => document.querySelector(s).getBoundingClientRect(); return r('.vt-sortl').left < r('.vt-filtbtn').left && r('.vt-filtbtn').right < r('.vt-viewseg').left && Math.abs(r('.vt-sortl').top - r('.vt-viewseg').top) < 20; }) && /Sort by/.test(await p.locator('.vt-sortl').innerText()), 'the toolbar: “Sort by” and Filters on the left, files/folders on the right, one row');
    await p.click('.vt-path button.linkish >> nth=0'); await p.click('.vt-viewseg [data-v="files"]'); await wait(200);

    console.log('— a file: preview, download, rating, report, a course from it');
    await p.click(`.vt-file[data-id="${gid}"]`); await wait(300);
    const sheetTxt = await p.locator('.vt-sheet').innerText();
    ok(/Shared by\s+Nikos/.test(sheetTxt) && /2021, semester 3/.test(sheetTxt) && /Has solutions/.test(sheetTxt), 'its page: who shared it (he chose to show it), when, contents');
    const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.vt-download')]);
    ok((await fs.promises.readFile(await dl.path())).subarray(0, 4).toString() === '%PDF', 'Download gives the PDF (its Greek name: headless Chromium names non-Latin downloads “download”)');
    await p.click('.vt-download'); await wait(600);
    ok(await p.locator('.vt-sheet .vt-acts .vt-tile').evaluateAll(b => b.every(x => x.getAttribute('aria-label') && x.title && !x.querySelector('.vt-tilelb'))), 'the actions are icons; their words in the tooltip and for screen readers (never cut)');
    ok(await p.locator('.vt-sheet .vt-acts > *').count() === 5 && await p.evaluate(() => new Set([...document.querySelectorAll('.vt-sheet .vt-acts > *')].map(e => Math.round(e.getBoundingClientRect().top))).size === 1), 'the actions: one row of tiles (download, preview, send, make a course, ⋮)');
    await p.screenshot({ path: SHOTS + '/vt2a_file.png' });
    await p.click('.vt-prevbtn'); ok(await until(() => p.locator('.vt-prevwin .vt-preview iframe').count()) && await p.locator('.vt-sheet').count() === 1, 'Preview opens a window of its own over the page; the file’s panel stays behind it (headless Chromium saves a PDF in a frame instead of showing it: after the download)');
    await p.screenshot({ path: SHOTS + '/vt2b_preview.png' });
    await p.keyboard.press('Escape'); await wait(150); ok(!(await p.locator('.vt-prevwin').count()) && await p.locator('.vt-sheet').count() === 1, 'Esc closes the preview, back to the panel');
    ok(srv.state.vfiles.find(f => f.id === gid).downloads === 1, 'downloads are counted once per person');
    await p.click('.vt-star >> nth=3'); await wait(400);
    ok(srv.state.vfiles.find(f => f.id === gid).rating_sum === 4 && await p.locator('.vt-star.on').count() === 4, 'rated 4 stars');
    await p.click('.vt-sheet .vt-moremenu .ns-menubtn'); await p.click('.vt-report'); await wait(200); await p.selectOption('.vt-reason', 'live_exam'); await p.click('.vt-sendreport'); await wait(500);
    ok(srv.state.vrep.length === 1 && srv.state.vrep[0].reason === 'live_exam' && srv.state.vfiles.find(f => f.id === gid).status === 'ok', 'reported (answers of an exam not held yet): one report does not hide it');
    for (const [n, em] of [['Eleni', 'eleni@example.com'], ['Kostas', 'kostas@example.com']]) { await fetch(BASE + '/auth/v1/signup', { method: 'POST', headers: { apikey: 'k', 'content-type': 'application/json' }, body: JSON.stringify({ email: em, password: 'secret123', data: { name: n } }) }); await rest(await token(em), '/rest/v1/noema_vault_reports', { method: 'POST', body: JSON.stringify([{ file_id: gid, reporter: Object.values(srv.state.users).find(u => u.email === em).id, reason: 'copyright' }]) }); }
    ok(srv.state.vfiles.find(f => f.id === gid).status === 'hidden' && !(await (await rest(await token('iro@example.com'), '/rest/v1/noema_vault?select=id')).json()).some(f => f.id === gid)
      && (await (await rest(T2, '/rest/v1/noema_vault?select=id,status')).json()).find(f => f.id === gid)?.status === 'hidden', 'three reports hide it from everybody but its owner');
    await p.evaluate(() => NoemaVault.reset()); await p.reload(); await wait(800);
    ok(await until(() => p.locator('.vt-file').count().then(n => n === 2)), 'the hidden file is gone from the list');
    const mine = srv.state.vfiles.find(f => f.title === 'Genetics lecture 1');
    await p.click(`.vt-file[data-id="${mine.id}"]`); await wait(300);
    ok(/Shared by\s+someone who stays anonymous/.test(await p.locator('.vt-sheet').innerText()) && await p.locator('.vt-sheet .vt-moremenu').count() === 1 && await p.locator('.vt-sheet .vt-star').count() === 0, 'one’s own file: anonymous, no rating or reporting of it');
    await p.click('.vt-sheet .vt-moremenu .ns-menubtn'); await p.click('.vt-sheet .vt-edit'); await wait(200); await p.fill('.ns-modal .vt-title', 'Genetics — lecture 1 (DNA)'); await p.check('.ns-modal [data-k="show_name"]'); await p.click('.vt-save'); await wait(500);
    ok(mine.title === 'Genetics — lecture 1 (DNA)' && mine.uploader_name === 'Iro' && mine.status === 'ok' && mine.downloads === 0, 'edit: the title changes, the name shown now (by choice); counters stay the server’s');
    await p.evaluate(() => NoemaVault.reset()); await p.reload(); await wait(800);
    await p.click(`.vt-file[data-id="${mine.id}"]`); await wait(300);
    await p.click('.vt-course'); await wait(800);
    ok(await until(() => p.locator('.cm-src .cm-srcfiles li').count().then(n => n === 1)) && /Genetics lecture 1\.pdf/.test(await p.locator('.cm-srcfiles').innerText()), '“Make a course from it” opens From your sources with the file');
    await p.evaluate(() => document.querySelectorAll('.noema-overlay').forEach(o => o.remove()));
    p.once('dialog', d => d.accept());
    await p.click(`.vt-file[data-id="${mine.id}"]`); await wait(300); await p.click('.vt-sheet .vt-moremenu .ns-menubtn'); await p.click('.vt-sheet .vt-delete'); await wait(800);
    ok(!srv.state.vfiles.some(f => f.id === mine.id) && !srv.state.vobj[mine.path] && await until(() => p.locator('.vt-file').count().then(n => n === 1)), 'delete: the row and the file are gone');

    console.log('— the phone width, Greek menus');
    await p.setViewportSize({ width: 390, height: 844 }); await wait(300);
    ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no sideways scrolling at 390 px');
    await p.screenshot({ path: SHOTS + '/vt3_phone.png', fullPage: true });
    await p.evaluate(async () => { await NoemaI18n.use('el'); NoemaShell.route(); }); await wait(800);
    const el = await p.locator('.vt-view').innerText();
    ok(/Θησαυροφυλάκιο/.test(el) && /Ανέβασμα/.test(el) && /Φίλτρα/.test(el), 'Greek menus: ' + el.split('\n').slice(0, 2).join(' · '));
    await p.screenshot({ path: SHOTS + '/vt4_greek.png', fullPage: true });
    ok(!E.length, 'no page errors ' + E.join(' | '));
  } catch (e) { ok(false, 'crashed: ' + e.stack); await p.screenshot({ path: SHOTS + '/vt_fail.png', fullPage: true }).catch(() => { }); }
  await browser.close(); srv.close?.();
  console.log(fails ? `\n❌ ${fails} failed` : '\n✅ all passed'); process.exit(fails ? 1 : 0);
})();
