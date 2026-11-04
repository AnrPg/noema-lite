/* The activity harness (docs/INTERACTIVE.md §11): runs a subject's activities in a real browser with the app's own runtime
   (the same frame, CSP, loop guard and protocol as the app), without the app.
     node activity_harness.js test    SUBJECT_DIR [ID]          → every activity in every language: it says hello, shows no
                                                                   errors, and each case of activities/<id>/tests.json holds
     node activity_harness.js preview SUBJECT_DIR ID [OUT_DIR]  → screenshots: light, dark, 360 px wide, the fallback
   Called by activity_test.py and activity_preview.py. Needs Playwright with Chromium (npm i playwright; npx playwright install chromium). */
const fs = require('fs'), path = require('path'), os = require('os');
let pw; try { pw = require(process.env.PW || 'playwright'); } catch (e) {
  console.log('✗ Playwright is not installed here. Install it:  npm i playwright && npx playwright install chromium   (then run again)'); process.exit(2);
}
const HERE = __dirname;
const [mode, sdirArg, onlyId, outArg] = process.argv.slice(2);
if (!mode || !sdirArg) { console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0]); process.exit(1); }
const SDIR = path.resolve(sdirArg);

/* the app's runtime: in the skill zip it is in activity_host/; in the repository, in engine/src/ */
const srcDir = [path.join(HERE, 'activity_host'), path.join(HERE, '..', '..', '..', 'engine', 'src')].find(d => fs.existsSync(path.join(d, '34_activity_html.js')));
if (!srcDir) { console.log('✗ the activity runtime (activity_host/34_activity_html.js) is missing from the toolkit'); process.exit(2); }
const rd = f => fs.readFileSync(path.join(srcDir, f), 'utf8');
const s32 = rd('32_activities.js'), ACTP = s32.slice(s32.indexOf('const ACTP = '), s32.indexOf('const ACT = ('));

/* the subject's activities, read like make_pack.py does */
const rj = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const regPath = path.join(SDIR, 'activities', 'activities.json');
if (!fs.existsSync(regPath)) { console.log('✗ no activities/activities.json in ' + SDIR); process.exit(1); }
const items = (rj(regPath).items || []).filter(a => !onlyId || a.id === onlyId).map(a => {
  const dir = path.join(SDIR, 'activities', a.id), strings = {};
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) { const m = f.match(/^strings\.(.+)\.json$/); if (m) strings[m[1]] = rj(path.join(dir, f)); }
  const entry = a.entry ? path.join(SDIR, a.entry) : null;
  return { ...a, html: entry && fs.existsSync(entry) ? fs.readFileSync(entry, 'utf8') : '', strings, sha256: null, _dir: dir };
});
if (!items.length) { console.log('✗ no activity ' + (onlyId || '') + ' in activities.json'); process.exit(1); }
const exercises = {};
for (const d of ['chapters']) { const dd = path.join(SDIR, d); for (const f of fs.existsSync(dd) ? fs.readdirSync(dd) : []) if (f.endsWith('.json')) for (const e of rj(path.join(dd, f)).exercises || []) exercises[e.id] = e; }

const THEMES = {
  light: { tokens: { bg: '#fafaf7', bg2: '#f2f1ec', card: '#ffffff', ink: '#222', ink2: '#555', ink3: '#888', line: '#e3e1da', ok: '#2f8f5b', bad: '#c0483f', warn: '#b7791f', info: '#3b6ea8', c: '#4a6fa5', font: 'system-ui, sans-serif', mono: 'ui-monospace, monospace', r: '12px' }, scheme: 'light', reducedMotion: false, textScale: 1, dir: 'ltr' },
  dark: { tokens: { bg: '#16181c', bg2: '#1e2126', card: '#22262c', ink: '#e8e6e1', ink2: '#b9b6ae', ink3: '#8b8880', line: '#353a42', ok: '#5cc08a', bad: '#e2766d', warn: '#e0a84f', info: '#7fa8d8', c: '#8fb0e0', font: 'system-ui, sans-serif', mono: 'ui-monospace, monospace', r: '12px' }, scheme: 'dark', reducedMotion: false, textScale: 1, dir: 'ltr' },
};
const HOST = `<!doctype html><meta charset="utf-8"><style>#box iframe{display:block;width:100%;height:100%;border:0}</style><body style="margin:0;font-family:system-ui"><div id="box" style="position:relative;width:100%;height:360px"></div><script>
var RT = null; var ACT = { registerRuntime: function (d) { RT = d; } };
${ACTP}
window.ACTP = ACTP;
</script><script>${rd('33_activity_guard.js')}</script><script>${rd('34_activity_html.js')}</script><script>
window.LOG = []; window.H = null;
window.run = function (act, init) {
  var box = document.getElementById('box'); box.innerHTML = ''; window.LOG = [];
  if (window.H) try { window.H.close(); } catch (e) {}
  window.H = RT.mount(box, { act: act, init: init, title: 'activity ' + act.id,
    onMessage: function (raw) { var r = ACTP.check(raw); if (!r.ok) { LOG.push({ type: 'bad', why: r.why }); return; } LOG.push(r.msg);
      if (r.msg.type === 'resize') box.style.height = Math.max(160, Math.min(r.msg.payload.h, 2000)) + 'px';
      if (r.msg.type === 'hint:request') H.send('hint', { text: 'a hint' }, { re: r.msg.id }); },
    onFail: function (why) { LOG.push({ type: 'fail', why: why }); } });
};
</script>`;

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'noema-act-')), hostFile = path.join(tmp, 'host.html');
  fs.writeFileSync(hostFile, HOST);
  const browser = await pw.chromium.launch();
  let fails = 0, passes = 0;
  const say = (c, m) => { console.log((c ? '✓ ' : '✗ ') + m); if (c) passes++; else fails++; return c; };
  const open = async (width = 800, theme = 'light') => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: 1, colorScheme: theme });
    const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error' && !/Unrecognized feature/.test(m.text())) errs.push(m.text()); });
    await p.goto('file://' + hostFile); return { p, ctx, errs };
  };
  const start = async (p, a, o = {}) => {
    const init = { activityId: a.id, exerciseId: o.exerciseId || null, attemptId: 'test', seed: o.seed ?? 12345, task: o.task || {}, locale: o.locale, strings: a.strings[o.locale] || {},
      theme: THEMES[o.theme || 'light'], state: o.state || null, stateVersion: a.stateVersion || 1, capabilities: a.capabilities || [], limits: { msgBytes: 65536, stateBytes: 262144, eventsPerSec: 50 } };
    await p.evaluate(([act, init]) => window.run(act, init), [a, init]);
    const t0 = Date.now(); while (Date.now() - t0 < 8000) { const L = await p.evaluate(() => window.LOG); if (L.some(m => m.type === 'ready' || m.type === 'fail')) break; await p.waitForTimeout(100); }
    await p.waitForTimeout(o.settle ?? 400);
    const frame = p.frames().find(f => f.parentFrame() && f.parentFrame() !== p.mainFrame());
    return { frame, log: await p.evaluate(() => window.LOG) };
  };
  const visible = f => f.evaluate(() => document.body.innerText);

  for (const a of items) {
    console.log(`\n— ${a.id} (${a.runtime})`);
    if (a.runtime !== 'html-app@1') { say(false, `runtime ${a.runtime}: this toolkit runs html-app@1 only for now`); continue; }
    const locs = Object.keys(a.strings);
    if (mode === 'preview') {
      const out = path.resolve(outArg || path.join(SDIR, 'build', 'preview', a.id)); fs.mkdirSync(out, { recursive: true });
      const loc = a.strings.en ? 'en' : locs[0];
      for (const [name, width, theme] of [['light', 800, 'light'], ['dark', 800, 'dark'], ['phone-360', 360, 'light']]) {
        const { p, ctx, errs } = await open(width, theme); await start(p, a, { locale: loc, theme, settle: 800 });
        await p.screenshot({ path: path.join(out, name + '.png'), fullPage: true });
        const over = await (p.frames().find(f => f.parentFrame() && f.parentFrame() !== p.mainFrame()))?.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1).catch(() => null);
        say(!errs.length, `${name}: ${path.join(out, name + '.png')}${errs.length ? '  errors: ' + errs.slice(0, 2).join(' | ') : ''}`);
        if (over) say(false, `${name}: the activity scrolls sideways (it must fit ${width} px)`);
        await ctx.close();
      }
      const fb = a.fallback || {}, mm = fs.existsSync(path.join(SDIR, 'media', 'media.json')) ? rj(path.join(SDIR, 'media', 'media.json')).items || [] : [];
      const pic = mm.find(m => m.id === fb.media), picFile = pic && pic.file ? path.join(SDIR, 'media', pic.file) : null;
      const { p, ctx } = await open(800, 'light');
      const src = picFile && fs.existsSync(picFile) ? 'data:' + (picFile.endsWith('.svg') ? 'image/svg+xml' : 'image/' + path.extname(picFile).slice(1).replace('jpg', 'jpeg')) + ';base64,' + fs.readFileSync(picFile).toString('base64') : '';
      await p.setContent(`<body style="font-family:system-ui;padding:12px;max-width:760px">${src ? `<img src="${src}" style="max-width:100%">` : '<p style="color:#c00">(no fallback picture)</p>'}<p>${String(fb.text || '(no fallback text)').replace(/</g, '&lt;')}</p></body>`);
      await p.screenshot({ path: path.join(out, 'fallback.png'), fullPage: true }); say(!!src && !!fb.text, `fallback: ${path.join(out, 'fallback.png')}`);
      await ctx.close();
      continue;
    }
    // test: every language
    for (const loc of locs) {
      const { p, ctx, errs } = await open(); const { frame, log } = await start(p, a, { locale: loc });
      const fail = log.find(m => m.type === 'fail'), bad = log.filter(m => m.type === 'bad' || m.type === 'error');
      say(log.some(m => m.type === 'ready') && !fail, `${loc}: it starts (hello → ready)${fail ? ' — ' + fail.why : ''}`);
      const txt = frame ? await visible(frame) : '';
      const raw = Object.keys(a.strings[loc] || {}).filter(k => /[A-Z._-]/.test(k) && new RegExp('(^|\\s)' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)').test(txt));
      say(!raw.length, `${loc}: no string key shows as text${raw.length ? ' (' + raw.slice(0, 4).join(', ') + ': a missing noema.t key?)' : ''}`);
      say(!bad.length && !errs.length, `${loc}: no errors${bad.length || errs.length ? ': ' + [...bad.map(b => b.why || b.payload?.code + ' ' + (b.payload?.message || '')), ...errs].slice(0, 3).join(' | ') : ''}`);
      await ctx.close();
    }
    // sandbox invariants
    { const { p, ctx } = await open(); await start(p, a, { locale: locs[0] });
      const fr = await p.$eval('#box iframe', f => ({ sandbox: f.getAttribute('sandbox'), csp: /http-equiv="Content-Security-Policy"/.test(f.srcdoc) }));
      say(fr.sandbox === 'allow-scripts' && fr.csp, 'sandbox allow-scripts and the CSP in place'); await ctx.close(); }
    // the cases
    const tf = path.join(a._dir, 'tests.json');
    const cases = fs.existsSync(tf) ? rj(tf).cases || [] : [];
    if (!cases.length) console.log('  (no tests.json: add cases with the right solution and tempting wrong ones — docs/INTERACTIVE_AUTHORING.md)');
    for (const c of cases) {
      const ex = c.exercise ? exercises[c.exercise] : null;
      if (c.exercise && !ex) { say(false, `case "${c.name}": exercise ${c.exercise} is not in chapters/`); continue; }
      const { p, ctx, errs } = await open();
      const { frame } = await start(p, a, { locale: c.locale || (a.strings.en ? 'en' : locs[0]), exerciseId: c.exercise || null, task: ex?.task?.params || c.task || {}, seed: Number.isInteger(ex?.task?.seed) ? ex.task.seed : 12345 });
      try {
        for (const s of c.steps || []) {
          if (s.set) await frame.evaluate(([sel, v]) => { const e = document.querySelector(sel); if (!e) throw new Error('no ' + sel); e.value = String(v); e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); }, [s.set, s.value]);
          else if (s.click) await frame.click(s.click);
          if (s.wait) await p.waitForTimeout(s.wait);
        }
        await p.waitForTimeout(500);
        const log = await p.evaluate(() => window.LOG), res = [...log].reverse().find(m => m.type === 'result'), st = [...log].reverse().find(m => m.type === 'state');
        const why = [];
        if ('passed' in (c.expect || {}) && (res ? res.payload.passed : null) !== c.expect.passed) why.push(`passed: expected ${c.expect.passed}, got ${res ? res.payload.passed : 'no result'}`);
        for (const [sel, part] of Object.entries(c.expect?.text || {})) { const t = await frame.evaluate(s => document.querySelector(s)?.textContent || '', sel); if (!t.includes(part)) why.push(`${sel}: "${t.slice(0, 60)}" has no "${part}"`); }
        for (const k of c.expect?.state || []) if (!st || !(k in (st.payload.data || {}))) why.push(`state has no ${k}`);
        if (errs.length) why.push('errors: ' + errs.slice(0, 2).join(' | '));
        say(!why.length, `case "${c.name}"${why.length ? ' — ' + why.join('; ') : ''}`);
      } catch (e) { say(false, `case "${c.name}": ${e.message.split('\n')[0]}`); }
      await ctx.close();
    }
  }
  await browser.close();
  console.log(fails ? `\n✗ ${fails} problem(s), ${passes} fine` : `\n✓ all ${passes} checks fine`);
  process.exit(fails ? 1 : 0);
})();
