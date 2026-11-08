/* noema-lite — Roadmaps and Claude: Knowledge (the Roadmaps), a Roadmap's treasure map, the guide that makes a subject with Claude, the Claude connector and its OAuth consent.
   An area of the app on the shell (build/ui.js: window.Noema, window.NoemaShell; docs/ARCHITECTURE.md §6.3): it adds its
   parts to Noema, its pages to the frame (NoemaShell.registerPage) and its steps of the start to Noema.boot. Whatever
   another area needs of it goes through Noema.app (APP). */
(() => {
  'use strict';
  const APP = (window.Noema.app ||= {});
  {
  const N = window.Noema;
  const CFG = N.config;
  const REG = N.registry;
  const KV = N.kv;
  const Noema = N;
  const caught = N.caught;
  const jget = N.jget;
  const jset = N.jset;
  const el = N.el;
  const slugify = N.slugify;
  const tr = N.tr;
  const trx = N.trx;
  const errMsg = N.errMsg;
  const overlay = N.overlay;
  const brandHead = N.brandHead;
  const toastL = (m, ms) => N.toast(m, ms);
  const cloudAccount = N.cloudAccount;
  const fmtMB1 = n => (window.NoemaI18n ? NoemaI18n.fmt.number(n / 1048576, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : (n / 1048576).toFixed(1)) + ' MB';
  const fmtUSD = (x, min = 2) => window.NoemaI18n ? NoemaI18n.fmt.number(x, { style: 'currency', currency: 'USD', minimumFractionDigits: min, maximumFractionDigits: 2 }) : '$' + (min ? x.toFixed(2) : x);
  const jobErr = j => j.errorInfo && j.errorInfo.code && window.NoemaI18n && NoemaI18n.has('err.' + j.errorInfo.code) ? NoemaI18n.err(j.errorInfo) : j.error;
  const fmtWhen = (...a) => APP.fmtWhen(...a);
  const importPack = (...a) => APP.importPack(...a);
  /* ---------------- Claude: two ways (docs/CLAUDE_CONNECTOR.md) ----------------
     APP. here in noema-lite with the learner's Claude API key (engine/claude.js) — never leave the app
     B. in the Claude app / website with the learner's Claude plan + the noema-lite connector (+ optional skill) */
  const SITE = (CFG.siteUrl || '').replace(/\/$/, '');
  const MCP_URL = SITE ? SITE + '/mcp' : '';
  /** After "Create with Claude": attach the source files — first the ones packaged by Claude (exact, checked), then
      the learner's own uploads for any file-less source left (matched by name). */
  async function attachJobFiles(acc, j) {
    const SF = window.NoemaSrcFiles; const sid = j.pack.subject.id; let n = 0, bad = [];
    if (j.bundleFiles && Object.keys(j.bundleFiles).length) {
      const r = await SF.attachPackaged(acc, j.pack, path => j.bundleFiles[path] || null); n += r.attached.length; bad = [...r.missing, ...r.bad];
      const ra = await SF.attachActivityFiles(acc, j.pack, path => j.bundleFiles[path] || null).catch(() => ({ missing: [] })); bad.push(...ra.missing);   // h5p@1: the .h5p files beside the pack
    }
    if (j.sourceBlobs?.length) {
      const have = SF.index(acc, sid); const pk = new Set(SF.packaged(j.pack).map(x => x.id));
      const pairs = SF.match((j.pack.sources?.sources || []).filter(s => !have[s.id] && !pk.has(s.id)), j.sourceBlobs);
      for (const [src, f] of pairs) { await SF.put(acc, sid, src.id, f).then(() => n++).catch(e => console.warn('[source files]', e)); }
    }
    if (n) toastL('📎 ' + tr('loader.files.attached', { n }), 4000);
    if (bad.length) toastL('⚠️ ' + tr('loader.files.notAttached', { n: bad.length, files: bad.join(', ') }), 6000);
    if (j.bundleFiles) { j.bundleFiles = null; window.NoemaClaude?.saveJob(j).catch(caught('loader.claude.job')); }
  }
  const SKILL_URL = (location.protocol.startsWith('http') ? '' : SITE) + '/downloads/noema-pack-builder.zip';
  const CLAUDE_PROMPT = /* i18n-ignore: a message the learner pastes into Claude (stays English, docs/i18n.md §5.2) */ 'Create a noema-lite subject pack from the files I attached.\nSubject title: …\nLanguage of the material: …\nMy goal: exam / understanding / project\nUse the noema-pack-builder skill if you have it; otherwise use the noema-lite connector (noema_get_toolkit + noema_authoring_guide). Include every file I attached in the package — if you split a PDF, its parts, each as its own source — and save it to my noema-lite account with its source files.';
  async function copyText(t, b) { try { await navigator.clipboard.writeText(t); if (b) { const o = b.textContent; b.textContent = '✓ ' + tr('loader.copied'); setTimeout(() => { b.textContent = o; }, 1600); } } catch (e) { prompt(tr('loader.copyThis'), t); } }
  const GR = { α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o' };
  const slugId = t => slugify(String(t).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[α-ω]/g, c => GR[c] || '')) || 'subject-' + Date.now().toString(36);
  /** ⓘ — a small info toggle that works with mouse, touch and keyboard. */
  const tip = (...txt) => el('details', { class: 'cg-tip' }, el('summary', { title: tr('loader.moreInfo'), 'aria-label': tr('loader.moreInfo') }, 'i'), el('div', { class: 'cg-tipbody' }, ...txt));
  const ext = (href, label) => el('a', { class: 'btn small', href, target: '_blank', rel: 'noopener' }, label + ' ↗');
  /** One numbered step: a bold title (+ ⓘ), then a numbered list of small actions. */
  const step = (title, info, ...subs) => el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, title), info ? tip(info) : null),
    subs.length ? el('ol', { class: 'cg-sub' }, ...subs.filter(Boolean).map(s => s.tagName === 'LI' ? s : el('li', {}, s))) : null);
  const sub = (...kids) => el('li', {}, ...kids);
  const plain = (...kids) => el('li', { class: 'cg-plain' }, ...kids);   // a form field inside a step (not numbered)

  /** Ways B and C, steps 1–4: a Claude account, code execution, the noema-lite connector, the optional skill. */
  function claudeConnectSteps(acc) {
    const cloud = window.NoemaCloud && NoemaCloud.session();
    return [
        step(tr('loader.cg.account.title'), tr('loader.cg.account.tip'),
          sub(...trx('loader.cg.account.open', { site: ext('https://claude.ai/', 'claude.ai'), download: ext('https://claude.ai/download', 'claude.ai/download') })),
          sub(...trx('loader.cg.account.signUp')),
          sub(el('span', { class: 'tiny' }, tr('loader.cg.account.have')))),
        step(tr('loader.cg.code.title'), tr('loader.cg.code.tip'),
          sub(...trx('loader.cg.code.open', { link: ext('https://claude.ai/settings/capabilities', tr('loader.cg.code.link')) })),
          sub(...trx('loader.cg.code.turnOn'))),
        MCP_URL ? step(tr('loader.cg.conn.title'), [tr('loader.cg.conn.tip')],
          cloud ? null : sub(el('span', { class: 'cg-warn' }, '☁️ ' + tr('loader.cg.conn.needCloud'))),
          sub(...trx('loader.cg.conn.open')),
          sub(...trx('loader.cg.conn.add')),
          sub(...trx('loader.cg.conn.fields', { url: el('code', { class: 'cg-url' }, MCP_URL) }), ' ', el('button', { class: 'btn small', onclick: e => copyText(MCP_URL, e.currentTarget) }, '📋 ' + tr('loader.cg.copy'))),
          sub(...trx('loader.cg.conn.advanced')),
          sub(...trx('loader.cg.conn.connect'))) : null,
        step(tr('loader.cg.skill.title'), tr('loader.cg.skill.tip'),
          sub(...trx('loader.cg.skill.download', { btn: el('a', { class: 'btn small', href: SKILL_URL, download: 'noema-pack-builder.zip' }, '⬇️ ' + tr('loader.cg.skill.downloadBtn')) })),
          sub(...trx('loader.cg.skill.upload')))].filter(Boolean);
  }
  /** Way B (Claude app / website + connector): the steps and the two questions — used by ✨ Create with Claude and by ❓ Help. */
  function claudeAppSteps(acc) {
    return [
      el('ol', { class: 'cg-steps' },
        ...claudeConnectSteps(acc),
        step(tr('loader.cg.ask.title'), tr('loader.cg.ask.tip'),
          sub(ext('https://claude.ai/new', tr('loader.cg.newChat'))),
          sub(...trx('loader.cg.ask.attach')),
          sub(...trx('loader.cg.ask.choose', { btn: el('button', { class: 'btn small', onclick: e => copyText(CLAUDE_PROMPT, e.currentTarget) }, '📋 ' + tr('loader.cg.copyMessage')) })),
          sub(tr('loader.cg.ask.send'))),
        step(tr('loader.cg.study.title'), null,
          sub(tr('loader.cg.study.picker')),
          sub(...trx('loader.cg.study.package', { file: el('b', {}, '<id>.noema.zip'), import: el('b', {}, tr('pick.import')) })))),
      el('details', { class: 'cg-faq' }, el('summary', {}, '❓ ' + tr('loader.cg.faq.skillQ')),
        el('p', {}, tr('loader.cg.faq.skillA'))),
      el('details', { class: 'cg-faq' }, el('summary', {}, '❓ ' + tr('loader.cg.faq.urlQ')),
        el('p', {}, ...trx('loader.cg.faq.urlA', { url: el('code', {}, MCP_URL || tr('loader.cg.faq.noUrl')) }))),
    ];
  }
  /** Way C (curricula with the Claude plan): the learner's Claude app runs the curriculum agents and prepares the steps. */
  function claudeCurriculumSteps(acc) {
    const lib = () => N.curricula();
    return [
      el('p', { class: 'cg-recommend' }, '⭐ ', ...trx('loader.cg.c.recommend')),
      el('ol', { class: 'cg-steps' },
        ...claudeConnectSteps(acc),
        step(tr('loader.cg.c.choose.title'), tr('loader.cg.c.choose.tip'),
          sub(...trx('loader.cg.c.choose.open', { roadmaps: el('button', { class: 'btn small', onclick: lib }, tr('pick.curricula')), new: el('b', {}, tr('pick.newCurriculum')), import: el('b', {}, tr('pick.importMap')) })),
          sub(...trx('loader.cg.c.choose.which')),
          sub(...trx('loader.cg.c.choose.build'))),
        step(tr('loader.cg.c.paste.title'), tr('loader.cg.c.paste.tip'),
          sub(...trx('loader.cg.c.paste.copy')),
          sub(...trx('loader.cg.c.paste.chat', { link: ext('https://claude.ai/new', tr('loader.cg.newChat')) })),
          sub(tr('loader.cg.c.paste.send'))),
        step(tr('loader.cg.c.back.title'), tr('loader.cg.c.back.tip'),
          sub(tr('loader.cg.c.back.appears')),
          sub(...trx('loader.cg.c.back.byHand')))),
      el('details', { class: 'cg-faq' }, el('summary', {}, '❓ ' + tr('loader.cg.c.faq.q')),
        el('ul', {}, el('li', {}, ...trx('loader.cg.c.faq.c')),
          el('li', {}, ...trx('loader.cg.c.faq.a')),
          el('li', {}, ...trx('loader.cg.c.faq.gemini')),
          el('li', {}, tr('loader.cg.c.faq.mix')))),
    ];
  }
  /** ❓ Help → “Set up Claude”: all ways, always available (the same steps as in ✨ Create with Claude). open: 'A' | 'B' | 'C' */
  function claudeSetupView(acc = KV.acc, { open = 'A' } = {}) {
    const wrap = el('div', { class: 'cg-setup' });
    const A = window.NoemaClaude ? claudeKeySteps(acc) : null;
    wrap.append(
      el('details', { class: 'cg-way', open: open === 'A' }, el('summary', {}, el('b', {}, '🏠 ' + tr('loader.cg.setup.a')), el('span', { class: 'tiny' }, ' · ' + tr('loader.cg.setup.aSub'))),
        A ? el('ol', { class: 'cg-steps' }, ...A.steps) : el('p', {}, tr('loader.cg.noModule')),
        el('div', { class: 'row' }, el('button', { class: 'btn ai', onclick: () => claudeGuide(acc, { way: 'A' }) }, '✨ ' + tr('loader.cg.setup.createThisWay')), el('button', { class: 'btn small', onclick: () => N.curricula() }, '🧭 ' + tr('loader.cg.setup.roadmapsSameKey')))),
      el('details', { class: 'cg-way', open: open === 'B' }, el('summary', {}, el('b', {}, '💬 ' + tr('loader.cg.setup.b')), el('span', { class: 'tiny' }, ' · ' + tr('loader.cg.setup.bSub'))),
        ...claudeAppSteps(acc)),
      el('details', { class: 'cg-way cg-way-c', open: open === 'C' }, el('summary', {}, el('b', {}, '🧭 ' + tr('loader.cg.setup.c')), el('span', { class: 'cg-badge' }, '⭐ ' + tr('loader.cg.setup.cBadge')), el('span', { class: 'tiny' }, ' · ' + tr('loader.cg.setup.cSub'))),
        ...claudeCurriculumSteps(acc)));
    return wrap;
  }
  /** Way A, steps 1–4 (Console account, credit, API key, paste + check) — used by ✨ Create with Claude and by ❓ Help. */
  function claudeKeySteps(acc) {
    const C = window.NoemaClaude;
    const key = el('input', { class: 'noema-input', type: 'password', placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: 'false', value: C.Key.get(acc) });   // i18n-ignore (the form of a Claude API key)
    const remember = el('input', { type: 'checkbox' }); remember.checked = C.Key.remembered(acc) || !C.Key.get(acc);
    const kstat = el('div', { class: 'tiny cg-kstat' });
    const model = el('select', { class: 'noema-input' }); const modelRow = el('div', { class: 'cg-model', style: { display: 'none' } }, el('label', {}, tr('loader.cg.key.model') + ' ', model, tip(tr('loader.cg.key.modelTip'))));
    let keyOk = false;
    const checkKey = async () => {
      const k = key.value.trim(); keyOk = false; modelRow.style.display = 'none';
      if (!C.Key.looksValid(k)) { kstat.textContent = '⚠️ ' + tr('loader.cg.key.invalid'); kstat.className = 'tiny cg-kstat bad'; return false; }
      kstat.textContent = '⏳ ' + tr('loader.cg.key.checking'); kstat.className = 'tiny cg-kstat';
      try {
        const ms = await C.models(k); if (!ms.length) throw new Error(tr('loader.cg.key.noModels'));
        model.innerHTML = ''; ms.forEach(m => model.append(el('option', { value: m.id }, m.name)));
        model.value = jget(KV.accountKey('claudeModel', acc), null) && ms.some(m => m.id === jget(KV.accountKey('claudeModel', acc), null)) ? jget(KV.accountKey('claudeModel', acc), null) : C.defaultModel(ms);
        C.Key.set(acc, k, remember.checked); keyOk = true; modelRow.style.display = '';
        kstat.textContent = '✅ ' + (remember.checked ? tr('loader.cg.key.worksRemembered') : tr('loader.cg.key.worksTab')); kstat.className = 'tiny cg-kstat ok';
        return true;
      } catch (e) { kstat.textContent = '❌ ' + errMsg(e); kstat.className = 'tiny cg-kstat bad'; return false; }
    };
    const steps = [
      step(tr('loader.cg.key.console.title'), trx('loader.cg.key.console.tip'),
        sub(...trx('loader.cg.key.console.open', { link: ext('https://platform.claude.com/', 'platform.claude.com') })),
        sub(...trx('loader.cg.key.console.signUp')),
        sub(tr('loader.cg.key.console.confirm')),
        sub(el('span', { class: 'tiny' }, tr('loader.cg.key.console.have')))),
      step(tr('loader.cg.key.credit.title'), tr('loader.cg.key.credit.tip'),
        sub(...trx('loader.cg.key.credit.open', { link: ext('https://platform.claude.com/settings/billing', tr('loader.cg.key.credit.link')) })),
        sub(tr('loader.cg.key.credit.buy')),
        sub(...trx('loader.cg.key.credit.limit'))),
      step(tr('loader.cg.key.create.title'), tr('loader.cg.key.create.tip'),
        sub(...trx('loader.cg.key.create.open', { link: ext('https://platform.claude.com/settings/keys', tr('loader.cg.key.create.link')) })),
        sub(...trx('loader.cg.key.create.click')),
        sub(...trx('loader.cg.key.create.copy'))),
      step(tr('loader.cg.key.paste.title'), tr('loader.cg.key.paste.tip'),
        sub(...trx('loader.cg.key.paste.box'), key),
        sub(...trx('loader.cg.key.paste.check', { btn: el('button', { class: 'btn small', onclick: checkKey }, '✔️ ' + tr('loader.cg.key.paste.checkBtn')) })),
        plain(el('label', { class: 'tiny' }, remember, ' ' + tr('loader.cg.key.paste.remember'))),
        plain(kstat, modelRow)),
    ];
    if (key.value) setTimeout(checkKey, 0);
    return { key, model, checkKey, ok: () => keyOk, steps };
  }

  function claudeGuide(acc = KV.acc, { onDone, way, preset = null } = {}) {   // preset: files, title, language, goal, notes, brief (📚 From your sources: the subject's confirmed chapter plan)
    overlay((box, close) => {
      box.classList.add('cg-box');
      const done = s => { close(); if (onDone) onDone(s); else Noema.switchTo(acc, s.id); };
      const home = async () => {
        box.innerHTML = '';
        box.append(brandHead('✨ ' + tr('loader.cg.title'), tr('loader.cg.sub')));
        const unfinished = window.NoemaClaude ? (await NoemaClaude.jobs(acc)).filter(j => j.status !== 'done' && j.kind !== 'node') : [];
        if (unfinished.length) box.append(el('div', { class: 'cg-resume' }, el('b', {}, '⏳ ' + tr('loader.cg.unfinished')), ...unfinished.slice(0, 3).map(j => el('div', { class: 'cg-jobrow' },
          el('span', {}, tr('loader.cg.jobRow', { title: j.title, when: fmtWhen(j.created), cost: fmtUSD(NoemaClaude.cost(j.usage, j.model)) })),
          el('button', { class: 'btn small primary', onclick: () => progress(j) }, tr('loader.cg.resume')),
          el('button', { class: 'btn small ghost', onclick: async () => { if (confirm(tr('loader.cg.deleteJobConfirm'))) { await NoemaClaude.deleteJob(j.id); home(); } } }, tr('loader.cg.delete'))))));
        box.append(el('p', { class: 'cg-q' }, tr('loader.cg.how')),
          el('div', { class: 'cg-choices' },
            el('button', { class: 'cg-choice', onclick: wayA }, el('span', { class: 'cg-ico' }, '🏠'), el('b', {}, tr('loader.cg.home.a')),
              el('ul', {}, el('li', {}, tr('loader.cg.home.a1')), el('li', {}, tr('loader.cg.home.a2')), el('li', {}, tr('loader.cg.home.a3')))),
            el('button', { class: 'cg-choice', onclick: wayB }, el('span', { class: 'cg-ico' }, '💬'), el('b', {}, tr('loader.cg.home.b')),
              el('ul', {}, el('li', {}, tr('loader.cg.home.b1')), el('li', {}, tr('loader.cg.home.b2')), el('li', {}, tr('loader.cg.home.b3')))),
            el('button', { class: 'cg-choice cg-choice-c', onclick: wayC }, el('span', { class: 'cg-ico' }, '🧭'), el('b', {}, tr('loader.cg.home.c')), el('span', { class: 'cg-badge' }, '⭐ ' + tr('loader.cg.home.cBadge')),
              el('ul', {}, el('li', {}, tr('loader.cg.home.c1')), el('li', {}, tr('loader.cg.home.c2')), el('li', {}, tr('loader.cg.home.c3'))))),
          el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, tr('loader.close'))));
      };
      const back = () => el('button', { class: 'btn small ghost cg-back', onclick: home }, tr('loader.back'));

      /* ---------- A: API key, inside the app ---------- */
      function wayA() {
        box.innerHTML = '';
        const C = window.NoemaClaude;
        if (!C) { box.append(back(), el('p', {}, tr('loader.cg.noModuleApp'))); return; }
        const K = claudeKeySteps(acc); const { key, model, checkKey } = K;
        const files = []; const flist = el('ul', { class: 'cg-files' });
        const drawFiles = () => { flist.innerHTML = ''; files.forEach((f, i) => flist.append(el('li', {}, `📄 ${f.name} · ${fmtMB1(f.size)} `, el('button', { class: 'btn small ghost', 'aria-label': tr('loader.cg.a.remove', { name: f.name }), onclick: () => { files.splice(i, 1); drawFiles(); } }, '✕')))); };
        const pick = el('input', { type: 'file', multiple: true, accept: '.pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.csv,.json,.docx,.pptx,.xlsx', style: { display: 'none' }, onchange: e => { for (const f of e.target.files) if (!files.some(x => x.name === f.name && x.size === f.size)) files.push(f); e.target.value = ''; drawFiles(); } });
        const drop = el('label', { class: 'cg-drop', ondragover: e => { e.preventDefault(); drop.classList.add('on'); }, ondragleave: () => drop.classList.remove('on'),
          ondrop: e => { e.preventDefault(); drop.classList.remove('on'); for (const f of e.dataTransfer.files) files.push(f); drawFiles(); } }, pick, '📂 ' + tr('loader.cg.a.choose'), el('span', { class: 'tiny' }, ' ' + tr('loader.cg.a.drag')));
        const links = el('textarea', { class: 'noema-input', rows: 2, placeholder: tr('loader.cg.a.linksPlaceholder') });
        const title = el('input', { class: 'noema-input', placeholder: tr('loader.cg.a.titlePlaceholder') });
        const ENDONYMS = [['en', 'English'], ['el', 'Ελληνικά'], ['de', 'Deutsch'], ['fr', 'Français'], ['es', 'Español'], ['it', 'Italiano'], ['ru', 'Русский']];   // i18n-ignore (each language in its own name)
        const lang = el('select', { class: 'noema-input' }, ...[['', tr('loader.cg.a.sameLang')], ...ENDONYMS].map(([v, t]) => el('option', { value: v }, t)));
        const goal = el('select', { class: 'noema-input' }, ...[['exam', tr('loader.cg.a.goalExam')], ['understanding', tr('loader.cg.a.goalUnderstand')], ['project', tr('loader.cg.a.goalProject')]].map(([v, t]) => el('option', { value: v }, t)));
        const notes = el('textarea', { class: 'noema-input', rows: 2, placeholder: tr('loader.cg.a.notesPlaceholder') });
        const budget = el('input', { class: 'noema-input cg-budget', type: 'number', min: '1', step: '1', value: String(jget(KV.accountKey('claudeBudget', acc), 15)) });
        if (preset) { files.push(...(preset.files || [])); drawFiles(); title.value = preset.title || ''; if ([...lang.options].some(o => o.value === preset.language)) lang.value = preset.language; if (preset.goal) goal.value = preset.goal; notes.value = preset.notes || ''; }
        const err = el('div', { class: 'tiny cg-kstat bad' });
        const go = el('button', { class: 'btn primary cg-go', onclick: async () => {
          err.textContent = '';
          if (!K.ok() && !(await checkKey())) { err.textContent = '👆 ' + tr('loader.cg.a.needKey'); key.focus(); return; }
          if (!files.length && !links.value.trim()) { err.textContent = '👆 ' + tr('loader.cg.a.needFiles'); return; }
          if (!title.value.trim()) { err.textContent = '👆 ' + tr('loader.cg.a.needTitle'); title.focus(); return; }
          const b = Math.max(1, +budget.value || 15); jset(KV.accountKey('claudeBudget', acc), b); jset(KV.accountKey('claudeModel', acc), model.value);
          let sid = slugId(title.value); if (REG.subjects.some(s => s.id === sid)) sid += '-mine';
          go.disabled = true; go.textContent = '⏳ ' + tr('loader.cg.preparing');
          const logs = el('div', { class: 'tiny' }); box.append(logs);
          try {
            const job = await C.create({ acc, key: key.value.trim(), model: model.value, title: title.value.trim(), subjectId: sid, language: lang.value, goal: goal.value, notes: notes.value.trim(),
              links: links.value.split('\n').map(x => x.trim()).filter(x => /^https?:\/\//.test(x)), files, budget: b, brief: preset?.brief || '', onLog: t => { logs.textContent = t; } });
            progress(job, { start: true });
          } catch (e) { go.disabled = false; go.textContent = '🚀 ' + tr('loader.cg.a.start'); err.textContent = '❌ ' + errMsg(e); logs.remove(); }
        } }, '🚀 ' + tr('loader.cg.a.start'));
        box.append(back(), brandHead('🏠 ' + tr('loader.cg.a.title'), tr('loader.cg.a.sub')),
          el('ol', { class: 'cg-steps' },
            ...K.steps,
            step(tr('loader.cg.a.sources.title'), tr('loader.cg.a.sources.tip'),
              sub(...trx('loader.cg.a.sources.pick'), drop, flist),
              sub(tr('loader.cg.a.sources.links'), links)),
            step(tr('loader.cg.a.describe.title'), tr('loader.cg.a.describe.tip'),
              plain(el('label', { class: 'cg-field' }, tr('loader.cg.a.fTitle'), title)),
              plain(el('label', { class: 'cg-field' }, tr('loader.cg.a.fLang'), lang)),
              plain(el('label', { class: 'cg-field' }, tr('loader.cg.a.fGoal'), goal)),
              plain(el('label', { class: 'cg-field' }, tr('loader.cg.a.fNotes'), notes))),
            step(tr('loader.cg.a.startTitle'), tr('loader.cg.a.startTip'),
              sub(...trx('loader.cg.a.limit', { field: el('label', { class: 'cg-inline' }, ...trx('loader.cg.a.limitField', { budget })) }), tip(tr('loader.cg.a.limitTip'))),
              sub(...trx('loader.cg.a.press', { go })), plain(err))),
          el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, tr('loader.close'))));
      }

      /* ---------- progress of an API job ---------- */
      let ctl = null;
      async function progress(job, { start = false } = {}) {
        const C = window.NoemaClaude; box.innerHTML = '';
        const status = el('div', { class: 'cg-status' }); const money = el('div', { class: 'tiny' }); const log = el('ol', { class: 'cg-log', 'aria-live': 'polite' });
        const actions = el('div', { class: 'row' }); const ask = el('div', {});
        const addLog = t => { if (!t) return; log.append(el('li', {}, t)); while (log.children.length > 80) log.firstChild.remove(); log.scrollTop = log.scrollHeight; };
        (job.log || []).slice(-40).forEach(x => addLog(x.m));
        const keyIn = el('input', { class: 'noema-input', type: 'password', placeholder: tr('loader.cg.p.keyPlaceholder') });
        const getKey = () => C.Key.get(acc) || keyIn.value.trim();
        const go = async fn => {
          if (!getKey()) { status.textContent = '🔑 ' + tr('loader.cg.p.pasteKey'); actions.innerHTML = ''; actions.append(keyIn, el('button', { class: 'btn primary', onclick: () => { if (C.Key.looksValid(keyIn.value)) { C.Key.set(acc, keyIn.value, false); go(fn); } } }, tr('loader.cg.p.continue'))); return; }
          ctl = new AbortController(); paint(job);
          const wl = await navigator.wakeLock?.request('screen').catch(() => null);
          try { await fn(getKey(), { onLog: addLog, onUpdate: paint, signal: ctl.signal }); } finally { wl?.release?.(); ctl = null; paint(job); }
        };
        function paint(j) {
          const running = !!ctl && j.status === 'running';
          const usd = C.cost(j.usage, j.model), tok = ((j.usage.input || 0) + (j.usage.cacheRead || 0) + (j.usage.cacheWrite || 0) + (j.usage.output || 0));
          money.textContent = tr('loader.cg.p.money', { cost: fmtUSD(usd), budget: fmtUSD(+j.budget || 0, 0), k: Math.round(tok / 1000), turns: j.turns || 0, model: j.model });
          status.className = 'cg-status ' + j.status;
          status.textContent = { starting: '⏳ ' + tr('loader.cg.preparing'), running: running ? '🧠 ' + tr('loader.cg.p.working') : '⏸️ ' + tr('loader.cg.p.paused'), paused: '⏸️ ' + (jobErr(j) || tr('loader.cg.p.paused')), question: '💬 ' + tr('loader.cg.p.question'), budget: '💰 ' + jobErr(j), error: '⚠️ ' + jobErr(j), failed: '❌ ' + jobErr(j), done: '✅ ' + tr('loader.cg.p.done') }[j.status] || j.status;
          actions.innerHTML = ''; ask.innerHTML = '';
          if (running) actions.append(el('button', { class: 'btn', onclick: () => ctl?.abort() }, '⏹ ' + tr('loader.cg.p.stop')));
          else if (j.status === 'done') actions.append(el('button', { class: 'btn primary', onclick: async () => { try { const s = await importPack(acc, j.pack, { via: 'claude-api' });
            if (window.NoemaSrcFiles) await attachJobFiles(acc, j);
            await C.deleteJob(j.id); toastL('📥 ' + tr('loader.explore.added', { title: s.title })); done(s); } catch (e) { toastL('⚠️ ' + errMsg(e), 5000); } } }, '📚 ' + tr('loader.cg.p.open')));
          else if (j.status === 'question') {
            const ans = el('textarea', { class: 'noema-input', rows: 3, placeholder: tr('loader.cg.p.answerPlaceholder') });
            ask.append(el('div', { class: 'cg-claudesays' }, j.question), ans, el('button', { class: 'btn primary', onclick: () => go((k, o) => C.answer(j, k, ans.value.trim() || 'Continue and finish the pack.', o)) }, tr('loader.cg.p.send')));   // i18n-ignore (the default answer is a message to Claude)
          } else if (j.status === 'budget') {
            const nb = el('input', { class: 'noema-input cg-budget', type: 'number', min: '1', value: String(Math.ceil(j.budget * 1.5)) });
            actions.append(el('label', { class: 'tiny' }, ...trx('loader.cg.p.newLimit', { field: nb })), el('button', { class: 'btn primary', onclick: async () => { j.budget = Math.max(j.budget + 1, +nb.value || 0); await C.saveJob(j); go((k, o) => C.run(j, k, o)); } }, '▶ ' + tr('loader.cg.p.continue')));
          } else if (j.status !== 'failed') actions.append(el('button', { class: 'btn primary', onclick: () => go((k, o) => C.run(j, k, o)) }, '▶ ' + tr('loader.cg.resume')));
          if (!running && j.status !== 'done') actions.append(el('button', { class: 'btn small ghost', onclick: async () => { if (confirm(tr('loader.cg.p.deleteConfirm'))) { await C.deleteJob(j.id); home(); } } }, '🗑 ' + tr('loader.cg.delete')));
        }
        box.append(el('button', { class: 'btn small ghost cg-back', onclick: () => { if (ctl && !confirm(tr('loader.cg.p.leaveConfirm'))) return; ctl?.abort(); home(); } }, tr('loader.back')),
          brandHead('✨ ' + tr('loader.quoted', { text: job.title }), tr('loader.cg.p.madeBy')), status, money, ask, actions,
          el('details', { class: 'cg-logbox', open: true }, el('summary', {}, tr('loader.cg.p.log')), log));
        paint(job);
        if (start || job.status === 'running') go((k, o) => C.run(job, k, o));
      }

      /* ---------- C: curricula with the Claude plan ---------- */
      function wayC() {
        box.innerHTML = '';
        box.append(back(), brandHead('🧭 ' + tr('loader.cg.c.title'), tr('loader.cg.c.sub')), ...claudeCurriculumSteps(acc),
          el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, tr('loader.close'))));
      }
      /* ---------- B: the Claude app / website + connector ---------- */
      function wayB() {
        box.innerHTML = '';
        box.append(back(), brandHead('💬 ' + tr('loader.cg.b.title'), tr('loader.cg.b.sub')),
          ...claudeAppSteps(acc),
          el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, tr('loader.close'))));
      }
      if (way === 'A') wayA(); else if (way === 'B') wayB(); else if (way === 'C') wayC(); else home();
    });
  }

  /** Supabase OAuth 2.1 consent page for the Claude connector: <site>/oauth/consent?authorization_id=… */
  async function connectClaude(authId) {
    document.body.classList.remove('noema-booting'); document.getElementById('noema-splash')?.remove();
    const fail = msg => overlay(box => box.append(brandHead(tr('loader.oauth.title'), ''), el('p', {}, '⚠️ ' + msg), el('div', { class: 'row noema-ovfoot' }, el('a', { class: 'btn small', href: location.pathname }, tr('loader.oauth.openApp')))), { closable: false });
    if (!window.NoemaCloud || !CFG.supabaseUrl) return fail(tr('loader.oauth.noCloud'));
    if (!NoemaCloud.session()) await new Promise(res => overlay((box, close) => {
      const intro = () => { box.innerHTML = ''; box.append(brandHead('🔗 ' + tr('loader.oauth.title'), tr('loader.oauth.signInSub')), el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn primary', onclick: () => cloudForm(box, () => { close(); res(); }, intro) }, '☁️ ' + tr('loader.cloud.signIn')))); };
      intro();
    }, { closable: false }));
    let det;
    try { det = await NoemaCloud.oauthDetails(authId); } catch (e) { return fail(tr('loader.oauth.invalid', { error: errMsg(e) })); }
    if (det && det.redirect_url && !det.client) { location.assign(det.redirect_url); return; }
    const who = NoemaCloud.session()?.user?.email || '';
    const back = (() => { try { return new URL(det.redirect_uri || det.redirect_url || '').host; } catch (e) { return ''; } })();
    overlay(box => {
      const go = async (action, b) => {
        b.disabled = true;
        try { const r = await NoemaCloud.oauthConsent(authId, action); const to = r?.redirect_url || r?.redirect_to; if (to) location.assign(to); else box.append(el('p', {}, action === 'approve' ? '✅ ' + tr('loader.oauth.connected') : tr('loader.oauth.cancelled'))); }
        catch (e) { b.disabled = false; box.append(el('p', { class: 'tiny' }, '⚠️ ' + errMsg(e))); }
      };
      box.append(brandHead('🔗 ' + tr('loader.oauth.consentTitle'), who ? tr('loader.oauth.signedInAs', { email: who }) : ''),
        el('div', { class: 'noema-form' },
          el('p', {}, ...trx('loader.oauth.wants', { client: el('b', {}, det?.client?.client_name || 'Claude') })),   // i18n-ignore (Claude: a name)
          el('ul', { class: 'noema-consent' }, el('li', {}, '✅ ' + tr('loader.oauth.scopeList')), el('li', {}, '✅ ' + tr('loader.oauth.scopePacks')), el('li', {}, '✅ ' + tr('loader.oauth.scopeRoadmaps')),
            el('li', {}, '🚫 ' + tr('loader.oauth.scopeNot'))),
          back ? el('p', { class: 'tiny' }, ...trx('loader.oauth.returnTo', { site: el('b', {}, back) })) : null,
          el('div', { class: 'row' }, el('button', { class: 'btn', onclick: e => go('deny', e.currentTarget) }, tr('loader.oauth.deny')), el('button', { class: 'btn primary', onclick: e => go('approve', e.currentTarget) }, tr('loader.oauth.allow')))));
    }, { closable: false });
  }

  function cloudForm(box, done, back) {
    let mode = 'in';
    const email = el('input', { class: 'noema-input', type: 'email', placeholder: tr('loader.cloud.email'), autocomplete: 'email' });
    const pw = el('input', { class: 'noema-input', type: 'password', placeholder: tr('loader.cloud.password'), autocomplete: 'current-password' });
    const nm = el('input', { class: 'noema-input', placeholder: tr('loader.cloud.displayName') });
    const msg = el('div', { class: 'tiny' });
    const draw = () => {
      box.innerHTML = '';
      box.append(brandHead(mode === 'in' ? tr('loader.cloud.signIn') : tr('loader.cloud.createTitle'), tr('loader.cloud.private')),
        el('div', { class: 'noema-form' }, mode === 'up' ? nm : null, email, pw, msg,
          el('div', { class: 'row' }, el('button', { class: 'btn', onclick: back }, tr('loader.back')),
            el('button', { class: 'btn primary', onclick: async e => {
              const b = e.currentTarget; b.disabled = true; msg.textContent = '…';
              try {
                if (mode === 'in') { await NoemaCloud.signIn(email.value.trim(), pw.value); done(cloudAccount()); }
                else { const r = await NoemaCloud.signUp(email.value.trim(), pw.value, nm.value.trim()); if (r.session) done(cloudAccount()); else { msg.textContent = '📧 ' + tr('loader.cloud.confirmEmail'); mode = 'in'; setTimeout(draw, 2500); } }
              } catch (er) { msg.textContent = '⚠️ ' + errMsg(er); } finally { b.disabled = false; }
            } }, mode === 'in' ? tr('loader.cloud.signIn') : tr('loader.cloud.createBtn'))),
          el('div', { class: 'row' },
            el('button', { class: 'tiny linkish', onclick: () => { mode = mode === 'in' ? 'up' : 'in'; draw(); } }, mode === 'in' ? tr('loader.cloud.noAccount') : tr('loader.cloud.haveAccount')),
            mode === 'in' ? el('button', { class: 'tiny linkish', onclick: async () => { try { await NoemaCloud.recover(email.value.trim()); msg.textContent = '📧 ' + tr('loader.cloud.resetSent'); } catch (er) { msg.textContent = '⚠️ ' + errMsg(er); } } }, tr('loader.cloud.forgot')) : null)));
      email.focus();
    };
    draw();
  }
  Object.assign(APP, { claudeGuide });

  Object.assign(N, {
    claudeSetupView: (acc, opts) => claudeSetupView(acc, opts || {}), claudeGuide: opts => claudeGuide(N.account?.id || KV.acc, opts || {}),
  });
  N.boot.connectClaude = connectClaude;
  const started = N.boot.started;
  // prepares the next curriculum steps in the background, and the jobs of the Claude app (they check what they make: the contracts first)
  N.boot.started = acc => { started?.(acc); NoemaCore.contracts.ready().then(() => { window.NoemaCurriculum?.Gen.start(acc.id); window.NoemaCurJobs?.App.start(acc.id); }).catch(caught('loader.curriculum.start')); };
  }
  {
  /* ---------- 🧭 the Roadmap screens in Lit (src/features/roadmaps/ui; their data port: src/composition/roadmaps-ui.ts) ----------
     The library and a Roadmap's map: a page of the frame (#/learn, #/map/<id>/<step>, below) or, on the classic screens
     (config.shell false), a full-screen overlay. What a screen asks of another one (a new Roadmap, editing a step, opening a
     subject …) is answered here, with the dialogs of engine/curmap.js. */
  const N = window.Noema;
  const CU = () => window.NoemaCurriculum, CM = () => window.NoemaCurMap, SH = () => window.NoemaCurShare, LLM = () => window.NoemaLLM;
  const tr = N.tr, el = N.el, overlay = N.overlay, toast = (m, ms) => N.toast(m, ms), errMsg = N.errMsg;
  const shell = () => !!window.NoemaShell?.mounted;
  const acc = () => N.account?.id || N.kv?.acc || null;
  const make = (tag, props) => Object.assign(document.createElement(tag), props);
  const on = (target, handlers) => { for (const [type, f] of Object.entries(handlers)) target.addEventListener(type, e => f(e.detail || {}, e)); return target; };
  const ovFoot = (...b) => el('div', { class: 'row noema-ovfoot' }, ...b);
  const closeBtn = close => el('button', { class: 'btn small', onclick: close }, tr('roadmap.map.close'));
  /** 📖 The step a subject is studied from, in this tab: one subject may teach several steps (engine/app/library.js stepOf). */
  const viaStep = (a, cid, nid, sid) => { try { if (nid) sessionStorage.setItem('noema-device:viaStep', JSON.stringify({ acc: a, sid, id: cid, node: nid })); else sessionStorage.removeItem('noema-device:viaStep'); } catch (e) { /* no sessionStorage (blocked site data): the step this tab came from is only a back link */ } };
  /** Opening a subject from a screen: the frame's page, or (classic) the subject itself. */
  const study = sid => shell() ? window.NoemaShell.open(sid) : N.switchTo(acc(), sid);

  /** 💬 What waits for the learner's Claude app on a Roadmap, and how to get it done (src/features/roadmaps/ui/inbox.ts). */
  function showApp(cid, step = '') {
    overlay((box, close) => box.append(N.brandHead('💬 ' + tr('roadmap.map.map.appTitle'), tr('roadmap.map.map.appLead')),
      on(make('noema-roadmap-inbox', { account: acc(), roadmapId: cid, step: step || '' }), { 'roadmap-setup-claude': () => CM()?.setupClaude(acc()) }),
      ovFoot(closeBtn(close))));
  }
  /** 📚 From your sources (src/features/roadmaps/ui/from-sources.ts): files — a folder, a .zip, the vault's — into a Roadmap or one subject. */
  function fromSources(a = acc(), { files = [] } = {}) {
    overlay((box, close) => {
      box.classList.add('cm-srcbox');
      box.append(N.brandHead(tr('roadmap.map.src.title')), on(make('noema-roadmap-from-sources', { account: a, files }), {
        'roadmap-made': d => { close(); if (d.next === 'progress') { const c = CU().get(a, d.roadmap); if (c) CM()?.progress(a, c, { start: true }); } else openMap(d.roadmap, null, { app: d.next === 'app' }); },
        'roadmap-make-course': d => { close(); N.claudeGuide({ way: 'A', preset: d.preset }); },
        'roadmap-setup-claude': () => CM()?.setupClaude(a),
      }), ovFoot(closeBtn(close)));
    });
  }
  /** The library's requests (src/features/roadmaps/ui/library.ts). */
  function wireLibrary(lib, { leave = () => { } } = {}) {
    return on(lib, {
      'roadmap-open': d => { const c = CU().get(acc(), d.roadmap); if (!c) return; leave(); if (c.status === 'ready' || c.status === 'attach') openMap(c.id); else CM()?.progress(acc(), c); },
      'roadmap-new': () => { leave(); CM()?.create(acc()); },
      'roadmap-from-sources': () => { leave(); fromSources(); },
      'roadmap-import': () => { leave(); CM()?.importMap(acc()); },
      'roadmap-explore': () => { leave(); if (shell()) window.NoemaShell.go('#/explore'); else CM()?.exploreCurricula(acc()); },
      'roadmap-shelf': () => { leave(); if (shell()) window.NoemaShell.go('#/shelf'); else N.openShelf?.(acc()); },
    });
  }
  /** The map's and its step's requests (src/features/roadmaps/ui/map.ts, step.ts). leave(): the map gives its place away. */
  function wireMap(m, cid, { leave = () => { } } = {}) {
    const a = acc();
    return on(m, {
      'roadmap-study': d => { leave(); viaStep(a, cid, d.step, d.subject); study(d.subject); },
      'roadmap-edit-step': d => CM()?.editStep(a, cid, d.step, { mode: d.mode || 'edit', onDone: nid => { if (nid === null) m.select(null); } }),
      'roadmap-attach': d => CM()?.attachDialog(a, { cid, nid: d.step }),
      'roadmap-detach': d => {
        const c = CU().get(a, cid), n = c?.nodes[d.step], pk = n?.pack || {};
        if (!n || !confirm(tr('roadmap.map.own.detachConfirm', { title: pk.title || pk.id, group: n.groupPlan ? 'yes' : 'no' }))) return;
        const r = CU().Edit.detach(a, cid, d.step); if (r.error) { toast('⚠️ ' + errMsg(r.error), 5000); return; }
        if (CU().get(a, cid).nodes[d.step]?.replan && (c.provider === 'claudeapp' || LLM()?.pick(a, c.provider))) CM()?.replanNow(a, cid, d.step);
      },
      'roadmap-replan': d => CM()?.replanNow(a, cid, d.step),
      'roadmap-sources': d => CM()?.stepSources(a, cid, d.step),
      'roadmap-remove-shared': async d => {
        const c = CU().get(a, cid), rx = c?.remote?.[d.step], who = rx?.by || tr('roadmap.map.st.anotherMember');
        if (!rx || !confirm(tr('roadmap.map.pnl.removeOtherConfirm', { title: c.nodes[d.step]?.title || d.step, who }))) return;
        try { await SH().removeStep(a, cid, d.step); toast('🗑 ' + tr('roadmap.map.pnl.removedOther')); } catch (e) { toast('⚠️ ' + errMsg(e), 5000); }
      },
      'roadmap-show-app': d => showApp(cid, d.step),
      'roadmap-attach-many': () => CM()?.attachMany(a, cid),
      'roadmap-plan-now': () => { leave(); CM()?.planNow(a, cid); },
      'roadmap-review-changes': () => CM()?.reviewChanges(a, cid),
      'roadmap-share': () => customElements.get('noema-roadmap-share')?.open({ account: a, roadmapId: cid }),
      'roadmap-setup-claude': () => CM()?.setupClaude(a),
    });
  }
  /** A map of the classic screens: full screen, ← the Roadmaps and ✕ above it. */
  function mapOverlay(cid, focus, { app = false } = {}) {
    const c = CU()?.get(acc(), cid);
    if (!c) { toast(tr('roadmap.map.map.notHere')); return; }
    if (c.shared && !c.shared.ended) SH()?.refresh(acc(), cid).then(() => SH().prefetch(acc(), cid)).catch(N.caught('shell.map.shared', 'info'));   // 👥 who prepared what, the owner's newest map
    overlay((box, close) => {
      box.classList.add('cm-full'); box.parentElement.classList.add('cm-ov');
      const m = wireMap(make('noema-roadmap-map', { account: acc(), roadmapId: cid, view: 'map', focusStep: focus || '' }), cid, { leave: close });
      const member = !!SH()?.isMember(c);
      box.append(el('div', { class: 'row cm-ovtop' },
        el('button', { class: 'btn small ghost', onclick: () => { close(); libraryOverlay(); } }, (window.NoemaI18n?.dir === 'rtl' ? '→ ' : '← ') + tr('roadmap.map.lib.title')),
        el('span', { class: 'grow' }),
        member ? null : el('button', { class: 'btn small cm-addstepbtn', title: tr('roadmap.map.ed.addTitle'), onclick: () => CM()?.editStep(acc(), cid, null, { mode: 'add', onDone: id => { if (id) m.select(id); } }) }, '➕ ' + tr('roadmap.map.map.step')),
        member ? null : el('button', { class: 'btn small cm-sharetool', title: tr('roadmap.map.lib.shareTip'), 'aria-label': tr('roadmap.map.lib.shareTip'), onclick: () => customElements.get('noema-roadmap-share')?.open({ account: acc(), roadmapId: cid }) }, '👥'),
        el('button', { class: 'btn small cm-settingsbtn', title: tr('roadmap.map.map.settingsTip'), 'aria-label': tr('roadmap.map.map.settingsTip'), onclick: () => CM()?.settings(acc(), cid, { onGone: () => { close(); libraryOverlay(); } }) }, '⚙️'),
        el('button', { class: 'btn small', 'aria-label': tr('roadmap.map.close'), onclick: close }, '✕')), m);
    });
    if (app) setTimeout(() => showApp(cid), 300);
  }
  /** The library of the classic screens. */
  function libraryOverlay() {
    overlay((box, close) => { box.classList.add('cm-lib'); box.append(wireLibrary(make('noema-roadmap-library', { account: acc() }), { leave: close }), ovFoot(closeBtn(close))); });
  }
  /** What the frame's next map opens first (e.g. the Claude app's inbox): set before going to #/map/… */
  const mapNext = { app: false, settings: false };
  /** 🧭 the Roadmaps / one Roadmap's map: the frame's pages, or the classic overlays. */
  function openLibrary() { if (shell()) window.NoemaShell.go('#/learn'); else libraryOverlay(); }
  function openMap(cid, focus = null, { app = false, settings = false } = {}) {
    if (!shell()) { mapOverlay(cid, focus, { app }); if (settings) CM()?.settings(acc(), cid, { onGone: openLibrary }); return; }
    Object.assign(mapNext, { app, settings });
    window.NoemaShell.go('#/map/' + encodeURIComponent(cid) + (focus ? '/' + encodeURIComponent(focus) : ''));
  }
  Object.assign(N, { curricula: openLibrary, curriculumMap: openMap, fromSources });
  Object.assign(APP, { wireLibrary, wireMap, showApp, mapNext });
  }
  {
  const S = window.NoemaShell;
  const PAGES = {};
  const N = () => window.Noema;
  const CU = () => window.NoemaCurriculum;
  const CM = () => window.NoemaCurMap;
  const acc = () => N()?.account?.id || N()?.kv?.acc || null;
  const caught = (where, severity = 'warning') => NoemaCore.errors.catcher(where, { severity });
  const shortTitle = c => { const t = CU()?.shownTitle(c) || c.title || c.goal || ''; return t.length > 28 ? t.split(/[:—–(-]/)[0].trim().slice(0, 28) || t.slice(0, 28) : t; };
  const h = S.h;
  const svg = S.svg;
  const L = S.L;
  const go = S.go;
  const page = S.page;
  /* ---------- Knowledge: the Roadmaps (noema-roadmap-library), the saved searches below ---------- */
  PAGES.learn = () => {
    const lib = APP.wireLibrary(Object.assign(document.createElement('noema-roadmap-library'), { account: acc(), heading: 2 }));
    const v = page({ tab: 'learn', crumbs: [[L('knowledge')]], corner: true, menu: learnMenu() }, h('h1', {}, L('knowledge')), lib);
    const nCol = window.NoemaSearch?.collections?.().length || 0;   // saved searches: a quiet link, only when there are some
    if (nCol) v.append(h('div', { class: 'ns-shelf' }, h('button', { class: 'ns-shelflink ns-collink', onclick: () => go('#/search') }, svg('search'), ' ', L('sr_collectionsN', { n: nCol }))));
  };
  function learnMenu() {
    return [{ label: L('newRoadmap'), icon: 'plus', run: () => CM()?.create(acc()) }, { label: L('importMap'), sub: L('importMapSub'), icon: 'download', run: () => CM()?.importMap(acc()) },
      { label: L('exploreRoadmaps'), icon: 'globe', href: '#/explore' }, '-', { label: L('shelf'), icon: 'shelf', href: '#/shelf' }];
  }

  /* ---------- a Roadmap: its map (noema-roadmap-map) as the whole page, the rest in ⋮ ---------- */
  const VIEW_KEY = 'noema-mapview';   // the page's map as a list or as the treasure map (a device preference)
  const savedView = () => { try { return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'treasure'; } catch (e) { return 'treasure'; } };
  PAGES.map = ([cid, nid]) => {
    const c = CU()?.get(acc(), cid);
    if (!c) { page({ tab: 'learn', crumbs: [[L('knowledge'), '#/learn']], back: '#/learn' }, h('p', { class: 'ns-muted' }, L('rmMissing'))); return; }
    const a = acc(), member = !!window.NoemaCurShare?.isMember(c), J = () => window.NoemaCurJobs;
    CU().Gen.start(a);
    if (c.shared && !c.shared.ended) window.NoemaCurShare?.refresh(a, cid).then(() => NoemaCurShare.prefetch(a, cid)).catch(caught('shell.map.shared', 'info'));   // 👥 who prepared what, the owner's newest map
    const m = APP.wireMap(Object.assign(document.createElement('noema-roadmap-map'), { account: a, roadmapId: cid, view: savedView(), focusStep: nid || '', legendInMenu: true, className: 'ns-map' }), cid);
    m.addEventListener('roadmap-view', e => { try { localStorage.setItem(VIEW_KEY, e.detail.view === 'list' ? 'list' : 'map'); } catch (x) { /* blocked site data: the view is not remembered */ } });
    const copy = (text, done) => navigator.clipboard.writeText(text).then(() => N().toast(done, 4000), () => prompt(N().tr('roadmap.map.copyThis'), text));
    const copyPart = () => copy(J().growMessage(CU().get(a, cid) || c), '📋 ' + L('addPartCopied'));
    const copyMsg = () => { try { localStorage.setItem('noema:appUsed:' + a, '1'); } catch (e) { /* blocked site data */ } copy(J().message(CU().get(a, cid) || c, { count: 1 }), L('copiedForClaude')); };
    const menu = () => { const cur = CU().get(a, cid) || c, w = J().work(cur), waiting = w.toPlan.length + w.steps.length + (w.graph ? 1 : 0); return [
      cur.provider === 'claudeapp' && !w.done ? { label: L('copyForClaude'), sub: L('copyForClaudeSub', { n: waiting }), icon: 'chat', run: copyMsg } : null,
      member ? null : { label: L('addStep'), icon: 'plus', run: () => CM()?.editStep(a, cid, null, { mode: 'add', onDone: id => { if (id) m.select(id); } }) },
      member || w.graph ? null : { label: L('addPart'), sub: L('addPartSub'), icon: 'chat', run: copyPart },
      member ? null : { label: cur.shared && !cur.shared.ended ? L('sharing') : L('share'), sub: L('shareRmSub'), icon: 'people', run: () => customElements.get('noema-roadmap-share')?.open({ account: a, roadmapId: cid }) },
      cur.provider === 'claudeapp' ? { label: L('claudeApp'), sub: L('claudeAppMapSub'), icon: 'chat', run: () => APP.showApp(cid) } : null,
      { label: m.view === 'list' ? L('showAsMap') : L('showAsList'), icon: m.view === 'list' ? 'map' : 'list', run: () => m.setView(m.view === 'list' ? 'treasure' : 'list') },
      { label: L('rmSettings'), sub: L('rmSettingsSubAll'), icon: 'gear', run: settings },
      { label: L('exportJson'), icon: 'download', run: () => CM()?.exportMap(a, cid) }, '-',
      { label: L('mapSigns'), icon: 'help', run: () => m.showLegend() }]; };
    const settings = () => CM()?.settings(a, cid, { onGone: () => go('#/learn') });
    page({ tab: 'learn', crumbs: [[L('knowledge'), '#/learn'], [shortTitle(c)]], back: '#/learn', cls: 'ns-mapview', menu, menuLabel: L('mapMenu') }, m);
    document.body.classList.add('ns-mapmode');
    const next = { ...APP.mapNext }; Object.assign(APP.mapNext, { app: false, settings: false });
    if (next.app) setTimeout(() => APP.showApp(cid), 300);
    if (next.settings) setTimeout(settings, 100);
  };

  for (const [k, f] of Object.entries(PAGES)) S.registerPage(k, f);
  }
})();
