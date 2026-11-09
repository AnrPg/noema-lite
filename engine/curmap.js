/* noema-lite — 🧭 the Roadmaps' dialogs that are not in Lit yet: a new Roadmap (the agents' progress), importing a map,
   editing / reviewing a step, a step's sources, subjects on steps, a Roadmap's settings. The library, the map and its step,
   sharing, the public Roadmaps, a member's review of the owner's changes, the Claude app's inbox, preparing ahead and
   From your sources are the Lit screens of src/features/roadmaps/ui (engine/app/roadmaps.js mounts them; these dialogs
   open the library and a map through Noema.curricula / Noema.curriculumMap). Logic lives in engine/curriculum.js.
   docs/CURRICULUM.md */
window.NoemaCurMap = (() => {
  const C = () => window.NoemaCurriculum, G = () => window.NoemaCurriculum.Gen, LLM = () => window.NoemaLLM;
  const el = (...a) => window.Noema.el(...a);
  const overlay = (b, o) => window.Noema.overlay(b, o);
  const toast = (m, ms) => window.Noema.toast?.(m, ms);
  // i18n (docs/i18n.md): the words of this file are in i18n/roadmaps-map/ (keys roadmap.map.*); numbers/dates via NoemaI18n.fmt
  const CM = (k, p) => window.NoemaI18n ? window.NoemaI18n.t(k, p) : k;
  const cmBack = () => window.NoemaI18n?.dir === 'rtl' ? '→' : '←';   // arrows in texts follow the reading direction (docs/i18n.md §5)
  const errMsg = e => window.NoemaI18n ? window.NoemaI18n.err(e) : (e?.message || String(e));   // an error's words (its code's message, else its English text)
  /** A Roadmap's language for the learner: its name in the UI language (English keeps the words it always had: “Greek (Ελληνικά)”). */
  const langLabel = code => window.NoemaI18n && window.NoemaI18n.locale !== 'en' ? window.NoemaI18n.fmt.langName(code) : (C().LANG[code] || code);
  /** A stored error (c.error, a step's pack.error) in the UI language of the moment: its code (…errorInfo) when it has one, else the stored words. */
  const storedErr = (info, text) => errMsg(info && info.code ? { ...info, message: text } : text);
  const head = (t, sub) => el('div', { class: 'noema-ovhead' }, el('div', {}, el('h1', {}, t), sub ? el('p', { class: 'muted' }, sub) : null));
  const tip = (...t) => el('details', { class: 'cg-tip' }, el('summary', { title: CM('roadmap.map.moreInfo'), 'aria-label': CM('roadmap.map.moreInfo') }, 'i'), el('div', { class: 'cg-tipbody' }, ...t));
  const ICON = { foundation: '🧱', intro: '🚪', aspect: '🎯', subtopic: '🔹', related: '🔗', synthesis: '🏁', application: '🚀', goal: '🎯' };
  const fmtPct = x => Math.round((x || 0) * 100) + '%';   // CSS widths (never localised)

  /* ======================= 👥 shared curricula (engine/curshare.js, docs/CURRICULUM.md §8) ======================= */
  const SH = () => window.NoemaCurShare;
  /** The shell's words (i18n/shell, keys sh.*). Without the frame: the same catalog in a UI language other than English, else the
      English fallback d given here (it is the sh.* key's English, kept for the classic screens). */
  /** A message with elements inside (a bold name …): placeholders filled with \u0001…\u0008 markers → [text, element, text …]. */
  const rich = (s, parts) => String(s).split(/([\u0001-\u0008])/).filter(x => x !== '').map(x => parts[x] ?? x);
  /** Text with **bold** parts → [text, <b>, text …] (a message keeps its bold words inside one sentence). */
  const boldMd = s => String(s).split('**').map((x, i) => i % 2 ? el('b', {}, x) : x).filter(x => x !== '');
  const SL = (k, d, v) => window.NoemaShell ? NoemaShell.L(k, v) : window.NoemaI18n && window.NoemaI18n.locale !== 'en' && window.NoemaI18n.has('sh.' + k) ? window.NoemaI18n.t('sh.' + k, v) : d;
  /** The Lit screens (engine/app/roadmaps.js): the library, and a Roadmap's map (app: with the Claude app's inbox open). */
  const openLibrary = () => window.Noema.curricula();
  const openMap = (cid, { app = false } = {}) => window.Noema.curriculumMap(cid, null, { app });
  const when = t => t ? (window.NoemaI18n ? window.NoemaI18n.fmt.date(t, { year: 'numeric', month: 'numeric', day: 'numeric' }) : new Date(t).toLocaleDateString()) : '';

  /* ======================= new curriculum ======================= */
  function keysBox(acc, onChange) {
    const wrap = el('div', { class: 'cm-keys' });
    const draw = () => {
      wrap.innerHTML = ''; const a = LLM().available(acc);
      const keyIn = el('input', { class: 'noema-input', type: 'password', placeholder: CM('roadmap.map.keys.claudePh'), autocomplete: 'off' });
      const st = el('span', { class: 'tiny' });
      wrap.append(
        el('div', { class: 'cm-keyrow' }, el('b', {}, a.claude ? '✅ Claude' : '➖ Claude'), el('span', { class: 'tiny' }, a.claude ? CM('roadmap.map.keys.claudeOn') : CM('roadmap.map.keys.claudeOff')),   // i18n-ignore (product name)
          tip(CM('roadmap.map.keys.claudeTip'))),
        a.claude ? null : el('div', { class: 'row' }, keyIn, el('button', { class: 'btn small', onclick: async () => { const k = keyIn.value.trim(); if (!window.NoemaClaude.Key.looksValid(k)) { st.textContent = '⚠️ ' + CM('roadmap.map.keys.notClaude'); return; } st.textContent = '⏳'; try { await window.NoemaClaude.models(k); window.NoemaClaude.Key.set(acc, k, true); draw(); onChange?.(); } catch (e) { st.textContent = '❌ ' + errMsg(e); } } }, CM('roadmap.map.keys.useKey')), st),
        el('div', { class: 'cm-keyrow' }, el('b', {}, a.gemini ? '✅ Gemini' : '➖ Gemini'), el('span', { class: 'tiny' }, a.gemini ? CM('roadmap.map.keys.geminiOn') : CM('roadmap.map.keys.geminiOff')),   // i18n-ignore (product name)
          tip(CM('roadmap.map.keys.geminiTip'))));
    };
    draw(); return wrap;
  }
  /* ---------- 💬 the Claude app (the learner's Claude plan) — engine/curjobs.js ---------- */
  const J = () => window.NoemaCurJobs;
  const prefs = acc => { try { return JSON.parse(localStorage.getItem(`noema1:${acc}:a:settings`) || '{}'); } catch (e) { return {}; } };
  const cloudOn = acc => !!(window.NoemaCloud?.session?.() && acc === 'u_' + window.NoemaCloud.session().user.id);
  /** The AI choice of a new / imported curriculum: the Claude app first (usually the cheapest), then the keys. */
  function providerPick(acc, { what = 'build' } = {}) {   // what: 'build' (a new Roadmap) | 'plan' (an imported one)
    const sel = el('select', { class: 'noema-input cm-provider' }, el('option', { value: 'claudeapp' }, '💬 ' + CM('roadmap.map.ai.app')), el('option', { value: 'auto' }, CM('roadmap.map.ai.auto')), el('option', { value: 'claude' }, CM('roadmap.map.ai.claude')), el('option', { value: 'gemini' }, CM('roadmap.map.ai.gemini')));
    const pref = prefs(acc).curProvider;   // ⚙️ Settings → Claude → AI for new curricula
    sel.value = pref && [...sel.options].some(o => o.value === pref) ? pref : cloudOn(acc) || !LLM().pick(acc, 'auto') ? 'claudeapp' : 'auto';
    const keys = keysBox(acc);
    const app = el('div', { class: 'cm-appinfo' },
      el('p', {}, ...boldMd(CM('roadmap.map.ai.appIntro', { what }))),
      el('ul', { class: 'tiny' }, el('li', {}, CM('roadmap.map.ai.appCheaper')),
        el('li', {}, cloudOn(acc) ? '☁️ ' + CM('roadmap.map.ai.cloudOk') : el('span', { class: 'cg-warn' }, '☁️ ' + CM('roadmap.map.ai.cloudNeeded'))),
        el('li', {}, ...rich(CM('roadmap.map.ai.firstTime', { link: '\u0001' }), { '\u0001': el('button', { class: 'linklike', onclick: e => { e.preventDefault(); setupClaude(acc); } }, CM('roadmap.map.ai.setupLink')) }))));
    const sync = () => { const a = sel.value === 'claudeapp'; app.style.display = a ? '' : 'none'; keys.style.display = a ? 'none' : ''; };
    sel.addEventListener('change', sync); sync();
    return { sel, box: el('div', {}, el('label', { class: 'cg-field' }, CM('roadmap.map.ai.use'), sel), app, keys) };
  }
  function setupClaude(acc) {
    if (!window.Noema?.claudeSetupView) return;
    overlay((b, close) => b.append(head('🤖 ' + CM('roadmap.map.ai.setupTitle'), CM('roadmap.map.ai.setupSub')), window.Noema.claudeSetupView(acc, { open: 'C' }), el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, CM('roadmap.map.close')))));
  }

  function create(acc) {
    overlay((box, close) => {
      box.classList.add('cg-box');
      const goal = el('textarea', { class: 'noema-input', rows: 2, placeholder: CM('roadmap.map.new.goalPh') });
      const lang = el('select', { class: 'noema-input' }, ...Object.keys(C().LANG).map(v => el('option', { value: v }, langLabel(v)))); lang.value = (navigator.language || 'en').slice(0, 2) in C().LANG ? (navigator.language || 'en').slice(0, 2) : 'en';
      const learner = el('input', { class: 'noema-input', placeholder: CM('roadmap.map.new.learnerPh') });
      const depth = el('select', { class: 'noema-input' }, el('option', { value: 'standard' }, CM('roadmap.map.new.depthStd')), el('option', { value: 'deep' }, CM('roadmap.map.new.depthDeep')), el('option', { value: 'exhaustive' }, CM('roadmap.map.new.depthAll'))); depth.value = 'deep';
      const apps = el('select', { class: 'noema-input' }, ...[[2, 4], [3, 6], [5, 8]].map(([a, b]) => el('option', { value: a + '-' + b }, CM('roadmap.map.new.apps', { a, b })))); apps.value = '3-6';
      const scope = el('input', { class: 'noema-input', placeholder: CM('roadmap.map.new.scopePh') });
      const constraints = el('textarea', { class: 'noema-input', rows: 2, placeholder: CM('roadmap.map.new.constraintsPh') });
      const PP = providerPick(acc), provider = PP.sel;
      const prefetch = el('select', { class: 'noema-input' }, ...[0, 1, 2, 3, 5, 8].map(n => el('option', { value: n }, CM('roadmap.map.new.ahead', { n })))); prefetch.value = '3';
      const budget = el('input', { class: 'noema-input cg-budget', type: 'number', min: '1', value: String(prefs(acc).curBudget || 8) });
      const err = el('div', { class: 'tiny cg-kstat bad' });
      const attachFirst = el('input', { type: 'checkbox', class: 'cm-attachfirst' });
      const go = el('button', { class: 'btn primary cg-go', onclick: () => {
        err.textContent = '';
        if (goal.value.trim().length < 3) { err.textContent = '👆 ' + CM('roadmap.map.new.needGoal'); goal.focus(); return; }
        if (provider.value !== 'claudeapp' && !LLM().pick(acc, provider.value)) { err.textContent = '👆 ' + CM('roadmap.map.new.needKey'); return; }
        const [a1, a2] = apps.value.split('-').map(Number);
        const c = C().blank({ goal: goal.value, language: lang.value, learner: learner.value, depth: depth.value, apps: [a1, a2], scope: scope.value, constraints: constraints.value, provider: provider.value, prefetch: +prefetch.value, nodeBudget: Math.max(1, +budget.value || 8) });
        if (attachFirst.checked) c.attachFirst = true;   // 📦 the map waits for the learner's own subjects before its steps are planned
        C().save(acc, c); close(); progress(acc, c, { start: true });
      } }, '🧭 ' + CM('roadmap.map.new.build'));
      box.append(el('button', { class: 'btn small ghost cg-back', onclick: () => { close(); openLibrary(); } }, cmBack() + ' ' + CM('roadmap.map.lib.title')),
        head('➕ ' + CM('roadmap.map.lib.new'), CM('roadmap.map.new.lead')),
        el('ol', { class: 'cg-steps' },
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, CM('roadmap.map.new.whichAi')), tip(el('div', {}, el('p', {}, ...boldMd(CM('roadmap.map.new.whichAiApp'))), el('p', {}, ...boldMd(CM('roadmap.map.new.whichAiKey')))))), PP.box),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, CM('roadmap.map.new.what')), tip(CM('roadmap.map.new.whatTip'))), goal,
            el('label', { class: 'cg-field' }, CM('roadmap.map.new.lang'), lang), el('label', { class: 'cg-field' }, CM('roadmap.map.new.start'), learner)),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, CM('roadmap.map.new.howBig')), tip(CM('roadmap.map.new.howBigTip'))),
            el('label', { class: 'cg-field' }, CM('roadmap.map.new.depth'), depth), el('label', { class: 'cg-field' }, CM('roadmap.map.new.appsLabel'), apps),
            el('details', { class: 'cg-faq' }, el('summary', {}, CM('roadmap.map.new.more')), el('label', { class: 'cg-field' }, CM('roadmap.map.new.scope'), scope), el('label', { class: 'cg-field' }, CM('roadmap.map.new.requirements'), constraints))),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, CM('roadmap.map.new.preparing')), tip(CM('roadmap.map.new.preparingTip'))),
            el('label', { class: 'cg-field' }, CM('roadmap.map.new.prepAhead'), prefetch, tip(CM('roadmap.map.new.prepAheadTip'))), el('label', { class: 'cg-field' }, CM('roadmap.map.new.budget'), budget)),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, CM('roadmap.map.new.useHave')), tip(CM('roadmap.map.new.useHaveTip'))),
            el('label', { class: 'tiny' }, attachFirst, ' ' + CM('roadmap.map.new.attachFirst'))),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, CM('roadmap.map.new.buildStep'))), go, err)),
        el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, CM('roadmap.map.close'))));
      setTimeout(() => goal.focus(), 200);
    });
  }

  /* ======================= 📦 subjects you already have, on steps (docs/CURRICULUM.md §9) ======================= */
  const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'into', 'your', 'how', 'what', 'its', 'introduction', 'intro', 'basics', 'fundamentals', 'part', 'step', 'course']);   // i18n-ignore (words ignored when matching titles)
  const words = t => new Set(String(t || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9α-ωа-я]+/).filter(w => w.length > 2 && !STOP.has(w)));
  /** How much two titles share (0–1) — the simple “suggest matches”, no AI. */
  const likeness = (a, b) => { const A = words(a), B = words(b); if (!A.size || !B.size) return 0; let k = 0; for (const w of A) if (B.has(w)) k++; return k / Math.min(A.size, B.size); };
  /** Subjects that may teach a step: the learner's library without language courses (they are studied on their own). */
  const attachable = async acc => (await window.Noema.subjectsFor(acc)).filter(s => !s.hidden && s.kind !== 'language' && !String(s.id).startsWith('lang:'));
  const whereOf = (acc, id) => { const on = C().stepsOf(acc, id); return on.length ? (on.length === 1 ? CM('roadmap.map.att.onStep', { title: on[0].c.nodes[on[0].nid].title }) : CM('roadmap.map.att.onSteps', { n: on.length })) : '📚 ' + CM('roadmap.map.att.onShelf'); };
  /** The warning shown before a subject is attached: only this step changes. */
  function attachWarning(c, nid) {
    const n = c.nodes[nid]; if (!n) return null; const kids = c.edges.filter(e => e.from === nid).length;
    return el('div', { class: 'cm-attachwarn', role: 'note' }, el('b', {}, '⚠️ ' + CM('roadmap.map.att.wOnly') + ' '),
      (n.chapters?.length ? CM('roadmap.map.att.wRedesign') : CM('roadmap.map.att.wPlanned')) + ' ',
      n.pack?.id && !n.pack.assigned && n.pack.status === 'ready' ? CM('roadmap.map.att.wShelf') + ' ' : '',
      kids ? CM('roadmap.map.att.wKids', { n: kids }) + ' ' : '',
      CM('roadmap.map.att.wSubject'),
      c.shared && !c.shared.ended ? el('div', { class: 'cm-attachshared' }, '👥 ' + CM('roadmap.map.att.wShared')) : null);
  }
  const replanBusy = new Set(), replanAgain = new Set();
  /** 🔄 Re-plan a step that a subject was attached to — here with an API key / Gemini (the Claude app does it by itself).
      Another subject attached while it runs: its answer is dropped (Edit.plan → stale) and the step is planned again. */
  async function replanNow(acc, cid, nid) {
    const key = cid + '/' + nid; if (replanBusy.has(key)) { replanAgain.add(key); return; } replanBusy.add(key);
    const c0 = C().get(acc, cid); const t = c0?.nodes[nid]?.title || nid;
    try { let r; do { replanAgain.delete(key); r = await C().Edit.plan(acc, cid, [nid]); } while ((replanAgain.has(key) || r?.stale?.includes(nid)) && C().get(acc, cid)?.nodes[nid]?.replan); if (r?.queued) toast('🔄 ' + CM('roadmap.map.att.appReplans', { title: t }), 5000); else toast('✅ ' + CM('roadmap.map.att.newPlan', { title: t, assigned: C().get(acc, cid)?.nodes[nid]?.pack?.assigned ? 'yes' : 'no' }), 4000); }
    catch (e) { toast('⚠️ ' + CM('roadmap.map.att.replanFail', { title: t, err: errMsg(e) }), 7000); }
    finally { replanBusy.delete(key); replanAgain.delete(key); const cc = C().get(acc, cid); if (cc) C().save(acc, cc); }
  }
  /** Attach (C().Edit.assign), then re-plan only that step: right away here, or by the Claude app. → true when attached */
  async function doAttach(acc, cid, nid, sid, { from = 'me', quiet = false } = {}) {
    const r = await C().Edit.assign(acc, cid, nid, sid, { from });
    if (r.error) { toast('⚠️ ' + errMsg(r.error), 6000); return false; }
    const c = C().get(acc, cid), n = c.nodes[nid];
    if (!r.replan) { if (!quiet) toast('📦 ' + CM('roadmap.map.att.teaches', { subject: n.pack.title, title: n.title }), 3500); return true; }
    if (c.provider === 'claudeapp') { toast('📦 ' + CM('roadmap.map.att.attachedApp', { title: n.title }), 6000); return true; }
    if (!LLM().pick(acc, c.provider)) { toast('📦 ' + CM('roadmap.map.att.attachedNoKey', { title: n.title }), 7000); return true; }
    toast('📦 ' + CM('roadmap.map.att.attachedNow', { title: n.title }), 3500); replanNow(acc, cid, nid);
    return true;
  }
  /** 📦 Attach a subject to a step. With cid + nid: choose the subject. With subject: choose the curriculum and the step (“Put on a map…”). */
  async function attachDialog(acc, { cid = null, nid = null, subject = null, onDone = () => { } } = {}) {
    const subs = subject ? [] : (await attachable(acc)).filter(s => !(cid && C().get(acc, cid)?.nodes[nid]?.pack?.id === s.id));
    const own = C().list(acc).filter(x => Object.keys(x.nodes || {}).length && !['dag', 'audit', 'expand'].includes(x.stage));
    overlay((box, close) => {
      box.classList.add('cg-box', 'cm-attach');
      let pickS = subject?.id || null, pickC = cid || (own[0]?.id || null), pickN = nid;
      const warn = el('div'), err = el('div', { class: 'tiny cg-kstat bad' });
      const go = el('button', { class: 'btn primary cm-attachgo', disabled: true, onclick: async () => {
        go.disabled = true; err.textContent = '';
        const ok = await doAttach(acc, pickC, pickN, pickS);
        if (ok) { close(); onDone({ cid: pickC, nid: pickN, subjectId: pickS }); } else go.disabled = false;
      } }, '📦 ' + CM('roadmap.map.att.go'));
      const refresh = () => { warn.innerHTML = ''; const c = pickC && C().get(acc, pickC); if (c && pickN) warn.append(attachWarning(c, pickN)); go.disabled = !(pickS && pickC && pickN); };
      let chooser;
      if (!subject) {   // which of my subjects teaches this step?
        const q = el('input', { class: 'noema-input noema-search', placeholder: '🔎 ' + CM('roadmap.map.att.search'), oninput: () => drawList() });
        const list = el('div', { class: 'noema-chips cm-attachchips' });
        const drawList = () => {
          list.innerHTML = ''; const term = q.value.trim().toLowerCase();
          const items = subs.filter(s => !term || (s.title + ' ' + (s.description || '')).toLowerCase().includes(term));
          list.append(...items.map(s => el('button', { class: 'noema-chip cm-attachchip' + (pickS === s.id ? ' on' : ''), 'aria-pressed': String(pickS === s.id), 'data-id': s.id, title: s.description || '', onclick: () => { pickS = s.id; list.querySelectorAll('.cm-attachchip').forEach(b => { const on = b.dataset.id === s.id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); refresh(); } },
            el('span', { class: 'e' }, s.emoji || '📘'), el('span', { class: 't' }, s.title), el('span', { class: 'o tiny' }, whereOf(acc, s.id)))));
          if (!items.length) list.append(el('p', { class: 'tiny' }, subs.length ? CM('roadmap.map.att.noMatch') : CM('roadmap.map.att.noOther')));
        };
        drawList(); chooser = el('div', {}, q, list);
      } else if (!own.length) {   // “Put on a map…” without a curriculum yet
        chooser = el('div', { class: 'empty' }, el('p', {}, CM('roadmap.map.att.noRoadmap')),
          el('button', { class: 'btn', onclick: () => { close(); create(acc); } }, '➕ ' + CM('roadmap.map.lib.new')));
      } else {   // which curriculum, which step?
        const csel = el('select', { class: 'noema-input', 'aria-label': CM('roadmap.map.att.roadmap') }, ...own.map(x => el('option', { value: x.id }, (x.shared && !x.shared.ended ? '👥 ' : '🧭 ') + (x.title || x.goal))));
        const nsel = el('select', { class: 'noema-input', 'aria-label': CM('roadmap.map.att.step') });
        const fill = () => {
          const c = C().get(acc, csel.value); pickC = csel.value; nsel.innerHTML = '';
          nsel.append(el('option', { value: '' }, '— ' + CM('roadmap.map.att.chooseStep') + ' —'), ...C().order(c).map(id => { const n = c.nodes[id], pk = n.pack || {};
            return el('option', { value: id, disabled: pk.status === 'generating' || (pk.assigned && pk.id === subject.id) }, `${ICON[n.role] || '•'} ${n.title}${pk.assigned ? ` — 📦 ${pk.title || pk.id}` : pk.status === 'ready' ? ' — ⚡ ' + CM('roadmap.map.st.prepared') : pk.status === 'generating' ? ' — ⏳ ' + CM('roadmap.map.st.beingPrepared') : ''}`); }));
          const best = C().order(c).map(id => [id, likeness(c.nodes[id].title + ' ' + (c.nodes[id].summary || ''), subject.title)]).sort((a, b) => b[1] - a[1])[0];
          pickN = best && best[1] >= 0.5 && !c.nodes[best[0]].pack?.assigned ? best[0] : null; nsel.value = pickN || ''; refresh();
        };
        csel.value = pickC; csel.onchange = fill; nsel.onchange = () => { pickN = nsel.value || null; refresh(); };
        chooser = el('div', { class: 'noema-form' }, el('label', { class: 'cg-field' }, CM('roadmap.map.att.roadmap'), csel), el('label', { class: 'cg-field' }, CM('roadmap.map.att.step'), nsel)); fill();
      }
      const n0 = cid && C().get(acc, cid)?.nodes[nid];
      box.append(head('📦 ' + (subject ? CM('roadmap.map.att.putTitle', { title: subject.title }) : CM('roadmap.map.att.forTitle', { title: n0?.title || '' })),
        subject ? CM('roadmap.map.att.putLead') : CM('roadmap.map.att.forLead')),
        chooser, warn, err, el('div', { class: 'row noema-ovfoot' }, go, el('button', { class: 'btn small', onclick: close }, CM('roadmap.map.cancel'))));
      refresh();
    });
  }
  /** 📦 While a map is being created (or any time): attach subjects you already have to many steps at once. */
  async function attachMany(acc, cid, { onDone = () => { } } = {}) {
    const subs = await attachable(acc); const c = C().get(acc, cid); if (!c) return;
    overlay((box, close) => {
      box.classList.add('cg-box', 'cm-attachmany');
      const rows = C().order(c).map(id => { const n = c.nodes[id]; const gen = n.pack?.status === 'generating';
        const sel = el('select', { class: 'noema-input', 'aria-label': CM('roadmap.map.att.subjectFor', { title: n.title }), disabled: gen }, el('option', { value: '' }, n.pack?.status === 'ready' && !n.pack.assigned ? '⚡ ' + CM('roadmap.map.att.ownPrepared') : '— ' + CM('roadmap.map.att.none') + ' —'), ...subs.map(s => el('option', { value: s.id }, `${s.emoji || '📘'} ${s.title}`)));
        sel.value = n.pack?.assigned ? n.pack.id : ''; return { id, n, sel }; });
      const msg = el('span', { class: 'tiny' });
      const suggest = () => {
        let k = 0; const used = new Set(rows.map(r => r.sel.value).filter(Boolean));
        for (const s of subs) { if (used.has(s.id)) continue; let best = null, bs = 0; for (const r of rows) { if (r.sel.value || r.sel.disabled) continue; const v = likeness(r.n.title + ' ' + (r.n.summary || ''), s.title); if (v > bs) { bs = v; best = r; } } if (best && bs >= 0.5) { best.sel.value = s.id; used.add(s.id); k++; } }
        msg.textContent = k ? '✨ ' + CM('roadmap.map.att.suggested', { n: k }) : CM('roadmap.map.att.noSuggest');
      };
      const go = el('button', { class: 'btn primary cm-attachmanygo', onclick: async () => {
        go.disabled = true; let k = 0;
        for (const r of rows) { const want = r.sel.value, cur = C().get(acc, cid).nodes[r.id]; if (!cur || r.sel.disabled) continue;
          if (want && !(cur.pack?.assigned && cur.pack.id === want)) { if (await doAttach(acc, cid, r.id, want, { quiet: true })) k++; }
          else if (!want && cur.pack?.assigned) C().Edit.detach(acc, cid, r.id); }
        close(); if (k) toast('📦 ' + CM('roadmap.map.att.manyDone', { n: k }), 4000); onDone(k);
      } }, '📦 ' + CM('roadmap.map.att.manyGo'));
      box.append(head('📦 ' + CM('roadmap.map.new.useHave'), CM('roadmap.map.att.manyLead')),
        el('div', { class: 'cm-attachwarn tiny', role: 'note' }, '⚠️ ' + CM('roadmap.map.att.manyWarn')),
        subs.length ? el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: suggest }, '✨ ' + CM('roadmap.map.att.suggest')), msg) : el('p', { class: 'tiny' }, CM('roadmap.map.att.noSubjects')),
        el('ol', { class: 'cm-attachlist' }, ...rows.map(r => el('li', {}, el('span', { class: 'cm-attachstep' }, `${ICON[r.n.role] || '•'} ${r.n.title}`), r.sel))),
        el('div', { class: 'row noema-ovfoot' }, go, el('button', { class: 'btn small', onclick: close }, CM('roadmap.map.cancel'))));
    });
  }
  /** ▶ The learner is done attaching: the other steps are planned now. */
  function planNow(acc, cid) {
    const c = C().get(acc, cid); if (!c) return; delete c.attachFirst;
    if (c.provider === 'claudeapp') { if (c.status === 'attach') c.status = 'ready'; C().save(acc, c); window.NoemaCloud?.session?.() && window.NoemaCloud.push(acc).catch(() => { }); toast('💬 ' + CM('roadmap.map.att.appPlans'), 5000); openMap(cid, { app: false }); return; }
    c.status = 'paused'; C().save(acc, c); progress(acc, c, { start: true });
  }

  /* ======================= building progress ======================= */
  const STAGES = () => [['dag', '🧭 ' + CM('roadmap.map.stage.dag')], ['audit', '🔍 ' + CM('roadmap.map.stage.audit')], ['expand', '🎯 ' + CM('roadmap.map.stage.expand')], ['plan', '📚 ' + CM('roadmap.map.stage.plan')]];
  const stagesOf = c => c.imported ? [['import', '📥 ' + CM('roadmap.map.stage.import')], STAGES()[3]] : STAGES();
  function progress(acc, c, { start = false } = {}) {
    overlay((box, close) => {
      box.classList.add('cg-box');
      let ctl = null;
      const stages = el('ol', { class: 'cm-stages' }); const log = el('ol', { class: 'cg-log', 'aria-live': 'polite' }); const status = el('div', { class: 'cg-status' }); const actions = el('div', { class: 'row' }); const bar = el('div', { class: 'cm-bar' }, el('i', {}));
      const paint = () => {
        const SG = stagesOf(c); const i = SG.findIndex(s => s[0] === c.stage);
        stages.innerHTML = ''; SG.forEach(([k, t], j) => stages.append(el('li', { class: c.stage === 'done' || j < i ? 'done' : j === i ? (ctl ? 'now' : 'wait') : '' }, (c.stage === 'done' || j < i ? '✅ ' : j === i && ctl ? '⏳ ' : j === i && c.status === 'waiting' ? '💬 ' : '◻️ ') + t)));
        status.className = 'cg-status ' + c.status;
        status.textContent = ctl ? '🧠 ' + CM('roadmap.map.build.working') : c.status === 'attach' ? '📦 ' + CM('roadmap.map.build.attach') : c.status === 'ready' ? '✅ ' + CM('roadmap.map.build.ready') : c.status === 'waiting' ? '💬 ' + CM('roadmap.map.build.waiting') : c.status === 'failed' ? '⚠️ ' + (c.error ? storedErr(c.errorInfo, c.error) : CM('roadmap.map.build.stopped')) : c.status === 'paused' ? '⏸️ ' + CM('roadmap.map.build.paused') : '';
        actions.innerHTML = '';
        appBox.style.display = c.provider === 'claudeapp' && c.status === 'waiting' ? '' : 'none';
        if (c.status === 'waiting') actions.append(el('button', { class: 'btn small', title: CM('roadmap.map.build.useKeyTip'), onclick: () => { const k = LLM().pick(acc, 'auto'); if (!k) { toast(CM('roadmap.map.build.needKey'), 4000); return; } c = C().get(acc, c.id); c.provider = 'auto'; c.status = 'building'; C().save(acc, c); run(); } }, CM('roadmap.map.build.useKey')), el('button', { class: 'btn small ghost', onclick: () => { if (confirm(CM('roadmap.map.build.deleteConfirm'))) { C().remove(acc, c.id); close(); openLibrary(); } } }, '🗑 ' + CM('roadmap.map.delete')));
        else if (ctl) actions.append(el('button', { class: 'btn', onclick: () => ctl.abort() }, '⏹ ' + CM('roadmap.map.build.stop')));
        else if (c.status === 'ready') actions.append(el('button', { class: 'btn primary', onclick: () => { close(); openMap(c.id); } }, '🗺️ ' + CM('roadmap.map.build.open')));
        else if (c.status === 'attach') actions.append(el('button', { class: 'btn primary cm-attachsubs', onclick: () => attachMany(acc, c.id, { onDone: () => { c = C().get(acc, c.id); paint(); } }) }, '📦 ' + CM('roadmap.map.build.attachSubs')),
          el('button', { class: 'btn cm-plannow', onclick: () => { close(); planNow(acc, c.id); } }, '▶ ' + CM('roadmap.map.build.planNow')), el('button', { class: 'btn small', onclick: () => { close(); openMap(c.id); } }, '🗺️ ' + CM('roadmap.map.build.open')));
        else actions.append(el('button', { class: 'btn primary', onclick: run }, '▶ ' + CM('roadmap.map.build.continue')), el('button', { class: 'btn small ghost', onclick: () => { if (confirm(CM('roadmap.map.build.deleteConfirm'))) { C().remove(acc, c.id); close(); openLibrary(); } } }, '🗑 ' + CM('roadmap.map.delete')));
      };
      const add = m => { log.append(el('li', {}, m)); while (log.children.length > 120) log.firstChild.remove(); log.scrollTop = log.scrollHeight; };
      (c.log || []).slice(-30).forEach(x => add(x.m));
      const appBox = c.provider === 'claudeapp' ? Object.assign(document.createElement('noema-roadmap-inbox'), { account: acc, roadmapId: c.id }) : el('div');   // 💬 what waits for the Claude app (src/features/roadmaps/ui/inbox.ts)
      let seen = (c.log || []).length;
      const offW = C().onChange((a, cur) => { if (!box.isConnected) { offW(); return; } if (cur?.id !== c.id || ctl) return; c = cur; (c.log || []).slice(seen).forEach(x => add(x.m)); seen = (c.log || []).length; paint(); });
      async function run() {
        ctl = new AbortController(); paint();
        const wl = await navigator.wakeLock?.request('screen').catch(() => null);
        try { c = await C().build(acc, c, { signal: ctl.signal, onLog: (m, cur, extra) => { c = cur; add(m); if (extra?.progress) bar.firstChild.style.width = fmtPct(extra.progress); paint(); } }); }
        finally { wl?.release?.(); ctl = null; paint(); }
        if (c.status === 'ready') { G().kick(); }
      }
      box.append(el('button', { class: 'btn small ghost cg-back', onclick: () => { if (ctl && !confirm(CM('roadmap.map.build.leaveConfirm'))) return; ctl?.abort(); close(); openLibrary(); } }, cmBack() + ' ' + CM('roadmap.map.lib.title')),
        head(`🧭 “${c.title || c.goal}”`, c.imported ? `${langLabel(c.language)} · ` + CM('roadmap.map.build.yours', { n: Object.keys(c.nodes).length }) + ` · ${c.learner || CM('roadmap.map.build.fromBasics')}` : `${langLabel(c.language)} · ${CM('roadmap.map.build.depth', { d: String(c.depth) })} · ${c.learner || CM('roadmap.map.build.fromBasics')}`), stages, bar, status, appBox, actions,
        el('details', { class: 'cg-logbox', open: true }, el('summary', {}, CM('roadmap.map.build.log')), log));
      paint(); if (start || c.status === 'building') run();
    }, { closable: false });
    window.NoemaCurJobs?.App.start(acc);
  }


  /* ======================= ✏️ editing a step / 📝 reviewing it before it is prepared ======================= */
  const RLABEL = {   // the role menu of the step editor (getters: the words follow a change of language)
    get foundation() { return '🧱 ' + CM('roadmap.map.role.foundation'); }, get intro() { return '🚪 ' + CM('roadmap.map.role.intro'); }, get aspect() { return '🎯 ' + CM('roadmap.map.rl.aspect'); },
    get subtopic() { return '🔹 ' + CM('roadmap.map.rl.subtopic'); }, get related() { return '🔗 ' + CM('roadmap.map.role.related'); }, get synthesis() { return '🏁 ' + CM('roadmap.map.rl.synthesis'); },
    get application() { return '🚀 ' + CM('roadmap.map.role.application'); } };
  function editStep(acc, cid, id, { mode = 'edit', onDone = () => { } } = {}) {
    const E = C().Edit; let c = C().get(acc, cid); const n = id ? c.nodes[id] : null; const locked = n && E.planLocked(n);   // 📦 a step taught by an attached subject keeps an editable plan
    overlay((box, close) => {
      box.classList.add('cg-box', 'cm-editor');
      const T = x => c.nodes[x]?.title || x;
      const title = el('input', { class: 'noema-input', value: n?.title || '', placeholder: CM('roadmap.map.ed.namePh'), maxlength: '120' });
      const summary = el('textarea', { class: 'noema-input', rows: 2, placeholder: CM('roadmap.map.ed.summaryPh') }); summary.value = n?.summary || '';
      const role = el('select', { class: 'noema-input' }, ...E.ROLES.map(r => el('option', { value: r }, RLABEL[r]))); role.value = n?.role === 'goal' ? 'intro' : (n?.role || 'foundation');
      let parents = n ? c.edges.filter(e => e.to === id).map(e => e.from) : [], children = n ? c.edges.filter(e => e.from === id).map(e => e.to) : [];
      const links = (label, get, set, possible) => { const wrap = el('div', { class: 'cm-links' }); const draw = () => { wrap.innerHTML = ''; const cur = get(); const opts = possible().filter(x => !cur.includes(x)).sort((a, b) => window.NoemaI18n ? window.NoemaI18n.fmt.compare(T(a), T(b)) : T(a).localeCompare(T(b)));
        const sel = el('select', { class: 'noema-input', 'aria-label': CM('roadmap.map.ed.addAria', { kind: label }) }, el('option', { value: '' }, '➕ ' + CM('roadmap.map.ed.addOpt', { kind: label })), ...opts.map(x => el('option', { value: x }, T(x))));
        sel.addEventListener('change', () => { if (sel.value) { set([...cur, sel.value]); draw(); } });
        wrap.append(el('div', { class: 'cm-linkchips' }, ...cur.map(x => el('span', { class: 'cm-linkchip' }, T(x), el('button', { 'aria-label': CM('roadmap.map.ed.removeAria', { title: T(x) }), onclick: () => { set(cur.filter(y => y !== x)); draw(); } }, '✕'))), cur.length ? null : el('span', { class: 'tiny' }, CM('roadmap.map.ed.none'))), sel); };
        draw(); return wrap; };
      const possibleP = () => n ? E.possibleParents(c, id).filter(x => !children.includes(x)) : Object.keys(c.nodes).filter(x => !children.includes(x));
      const possibleK = () => n ? E.possibleChildren(c, id).filter(x => !parents.includes(x)) : Object.keys(c.nodes).filter(x => !parents.includes(x));
      const goals = el('textarea', { class: 'noema-input', rows: 3, placeholder: CM('roadmap.map.ed.goalsPh'), disabled: locked }); goals.value = (n?.learningGoals || []).join('\n');
      let chapters = (n?.chapters || []).map(ch => ({ ...ch }));
      const chBox = el('ol', { class: 'cm-chedit' });
      const drawCh = () => {
        chBox.innerHTML = '';
        chapters.forEach((ch, i) => {
          const t = el('input', { class: 'noema-input', value: ch.title, 'aria-label': CM('roadmap.map.ed.chTitleAria', { n: i + 1 }), disabled: locked, oninput: e => { ch.title = e.target.value; } });
          const g = el('textarea', { class: 'noema-input', rows: 2, disabled: locked, placeholder: CM('roadmap.map.ed.chGoalsPh'), oninput: e => { ch.goals = e.target.value.split('\n').map(x => x.trim()).filter(Boolean); } }); g.value = (ch.goals || []).join('\n');
          const cv = el('textarea', { class: 'noema-input', rows: 2, disabled: locked, placeholder: CM('roadmap.map.ed.coverPh'), oninput: e => { ch.coverage = e.target.value.split('\n').map(x => x.trim()).filter(Boolean); } }); cv.value = (ch.coverage || []).join('\n');
          chBox.append(el('li', { class: 'cm-chrow' }, el('div', { class: 'cm-chline' }, t, locked ? null : [
            el('button', { class: 'btn small ghost', title: CM('roadmap.map.ed.up'), 'aria-label': CM('roadmap.map.ed.upAria'), disabled: !i, onclick: () => { [chapters[i - 1], chapters[i]] = [chapters[i], chapters[i - 1]]; drawCh(); } }, '▲'),
            el('button', { class: 'btn small ghost', title: CM('roadmap.map.ed.down'), 'aria-label': CM('roadmap.map.ed.downAria'), disabled: i === chapters.length - 1, onclick: () => { [chapters[i + 1], chapters[i]] = [chapters[i], chapters[i + 1]]; drawCh(); } }, '▼'),
            el('button', { class: 'btn small ghost', title: CM('roadmap.map.ed.remove'), 'aria-label': CM('roadmap.map.ed.removeChAria'), onclick: () => { chapters.splice(i, 1); drawCh(); } }, '✕')]),
            el('details', {}, el('summary', { class: 'tiny' }, CM('roadmap.map.ed.goalsCover')), g, cv)));
        });
        if (!chapters.length) chBox.append(el('li', { class: 'tiny cm-empty' }, CM('roadmap.map.ed.noChapters')));
      };
      drawCh();
      const instr = el('input', { class: 'noema-input', placeholder: CM('roadmap.map.ed.wishPh') });
      const err = el('div', { class: 'tiny cg-kstat bad' }); const busy = el('span', { class: 'tiny' });
      // 📎 the learner's own files for this step: the step is planned and built from them (no web research of the theory)
      const matBox = el('div', { class: 'cm-mat' });
      const parseRange = v => { const m = String(v || '').match(/(\d+)\s*(?:[-–—]\s*(\d+))?/); return m ? [+m[1], +(m[2] || m[1])] : null; };
      const drawMat = () => {
        matBox.innerHTML = ''; if (!n) return; const cc = C().get(acc, cid); const cur = cc?.nodes[id]?.material?.files || [];
        matBox.append(cur.length ? el('ul', { class: 'cm-matlist' }, ...cur.map(f => {
          const shared = f.fileId ? Object.values(cc.nodes).filter(x => x.id !== id && (x.material?.files || []).some(f2 => f2.fileId === f.fileId)) : [];
          const rg = el('input', { class: 'noema-input cm-range', placeholder: CM('roadmap.map.mat.allPages'), value: f.range ? `${f.range[0]}–${f.range[1]}` : '', disabled: locked, 'aria-label': CM('roadmap.map.mat.pagesAria', { name: f.name }), title: CM('roadmap.map.mat.pagesTip'),
            onchange: e => { const r = E.setMaterialRange(acc, cid, id, f.srcId, parseRange(e.target.value)); busy.textContent = r.error ? '⚠️ ' + r.error : '✓ ' + CM('roadmap.map.mat.pagesSaved'); } });
          return el('li', {}, el('button', { class: 'linklike', title: '👁 ' + CM('roadmap.map.mat.open'), onclick: () => openMaterial(acc, cid, id, f) }, '📄 ' + f.name), el('span', { class: 'tiny' }, f.pages ? ' · ' + CM('roadmap.map.mat.nPages', { n: f.pages }) : ''),
            f.pages || f.range ? el('label', { class: 'tiny cm-rangel' }, CM('roadmap.map.mat.pagesLabel') + ' ', rg) : null,
            shared.length ? el('span', { class: 'tiny', title: CM('roadmap.map.mat.sameFile') }, ' · ' + CM('roadmap.map.mat.alsoFor', { steps: shared.map(x => '“' + x.title + '”').join(', ') })) : null,
            locked ? null : el('button', { class: 'btn small ghost', 'aria-label': CM('roadmap.map.ed.removeAria', { title: f.name }), onclick: async () => { await E.removeMaterial(acc, cid, id, f.srcId); drawMat(); } }, '✕'));
        })) : el('div', { class: 'tiny' }, CM('roadmap.map.mat.none')));
        if (locked) return;
        const pg = el('input', { class: 'noema-input cm-range', placeholder: CM('roadmap.map.mat.rangePh'), 'aria-label': CM('roadmap.map.mat.rangeAria') });
        const known = Object.entries(cc.files || {});
        const reuse = known.length ? el('select', { class: 'noema-input', 'aria-label': CM('roadmap.map.mat.reuseAria'), onchange: async e => { const fid = e.target.value; if (!fid) return; busy.textContent = '⏳ …'; const r = await E.addMaterial(acc, cid, id, [{ fileId: fid, range: parseRange(pg.value) }]); busy.textContent = r.error ? '⚠️ ' + r.error : '✓ ' + CM('roadmap.map.mat.added'); drawMat(); } },
          el('option', { value: '' }, '📚 ' + CM('roadmap.map.mat.reuse')), ...known.map(([fid, x]) => el('option', { value: fid }, `${x.name}${x.pages ? ' (' + CM('roadmap.map.mat.nPages', { n: x.pages }) + ')' : ''}`))) : null;
        matBox.append(el('div', { class: 'row cm-matadd' },
          el('label', { class: 'btn small' }, '📎 ' + CM('roadmap.map.mat.add'), el('input', { type: 'file', multiple: true, style: { display: 'none' }, onchange: async e => { const fs = [...e.target.files]; e.target.value = ''; if (!fs.length) return; busy.textContent = '⏳ ' + CM('roadmap.map.mat.reading'); const r = await E.addMaterial(acc, cid, id, fs.map(file => ({ file, range: parseRange(pg.value) }))); busy.textContent = r.error ? '⚠️ ' + r.error : '✓ ' + CM('roadmap.map.mat.addedN', { n: r.added.length }); drawMat(); } })),
          reuse, pg));
      };
      drawMat();
      const collect = () => ({ title: title.value, summary: summary.value, role: role.value, parents, children, ...(locked ? {} : { learningGoals: goals.value.split('\n'), chapters }) });
      const save = () => { err.textContent = ''; const r = n ? E.update(acc, cid, id, collect()) : null; if (r?.error) { err.textContent = '⚠️ ' + r.error; return false; } return true; };
      const replan = el('button', { class: 'btn small', disabled: locked, onclick: async () => {
        if (n && !save()) return; busy.textContent = '⏳ ' + CM('roadmap.map.ed.planning'); replan.disabled = true;
        try { const r = await E.plan(acc, cid, [id], { instruction: instr.value.trim() }); if (r.queued) { busy.textContent = '💬 ' + CM('roadmap.map.ed.sentApp'); replan.disabled = false; return; } c = C().get(acc, cid); chapters = c.nodes[id].chapters.map(ch => ({ ...ch })); goals.value = c.nodes[id].learningGoals.join('\n'); drawCh(); busy.textContent = '✓ ' + CM('roadmap.map.ed.newPlan'); }
        catch (e) { busy.textContent = '⚠️ ' + errMsg(e); } replan.disabled = false;
      } }, '✨ ' + (c.provider === 'claudeapp' ? CM('roadmap.map.ed.replanApp') : CM('roadmap.map.ed.replanAi')));
      /** 📦 study the step from a subject the learner already has (only this step is re-planned) · ↩ take it off */
      const ownField = () => {
        if (!n || mode === 'add' || n.pack?.status === 'generating') return null;
        const pk = n.pack || {};
        return el('div', { class: 'cg-field cm-ownfield' }, el('b', {}, '📦 ' + (pk.assigned ? CM('roadmap.map.own.taughtBy', { title: pk.title || pk.id }) : CM('roadmap.map.own.have'))),
          el('p', { class: 'tiny' }, pk.assigned ? CM('roadmap.map.own.follows') : CM('roadmap.map.own.instead')),
          el('div', { class: 'row' },
            el('button', { class: 'btn small cm-usesubject', onclick: () => { if (!save()) return; close(); attachDialog(acc, { cid, nid: id, onDone: () => onDone() }); } }, '📦 ' + (pk.assigned ? CM('roadmap.map.own.another') : CM('roadmap.map.own.use'))),
            pk.assigned ? el('button', { class: 'btn small ghost cm-detach', onclick: () => {
              if (!confirm(CM('roadmap.map.own.detachConfirm', { title: pk.title || pk.id, group: n.groupPlan ? 'yes' : 'no' }))) return;
              const r = C().Edit.detach(acc, cid, id); if (r.error) { toast('⚠️ ' + errMsg(r.error), 5000); return; }
              const cc = C().get(acc, cid); if (cc.nodes[id]?.replan && (cc.provider === 'claudeapp' || LLM().pick(acc, cc.provider))) replanNow(acc, cid, id);
              close(); onDone(); } }, '↩ ' + CM('roadmap.map.own.detach')) : null));
      };
      const head2 = mode === 'review' ? head('📝 ' + CM('roadmap.map.ed.reviewTitle'), CM('roadmap.map.ed.reviewLead'))
        : mode === 'add' ? head('➕ ' + CM('roadmap.map.ed.addTitle'), CM('roadmap.map.ed.addLead'))
          : head('✏️ ' + CM('roadmap.map.ed.editTitle'), locked ? CM('roadmap.map.ed.editLocked') : CM('roadmap.map.ed.editLead'));
      const buttons = mode === 'review'
        ? [el('button', { class: 'btn primary', onclick: () => { if (!save()) return; close(); const cc = C().get(acc, cid); G().request(cc, id, { resume: true }); toast(cc.provider === 'claudeapp' ? '💬 ' + CM('roadmap.map.ed.sentAppShort') : '⏳ ' + CM('roadmap.map.ed.preparing', { title: title.value }), 5000); onDone(); } }, '✅ ' + (c.provider === 'claudeapp' ? CM('roadmap.map.ed.okApp') : CM('roadmap.map.ed.okPrepare'))),
          el('button', { class: 'btn small', onclick: () => { if (save()) { close(); onDone(); } } }, CM('roadmap.map.ed.saveOnly'))]
        : mode === 'add'
          ? [el('button', { class: 'btn primary', onclick: async () => {
              err.textContent = ''; if (!title.value.trim()) { err.textContent = '👆 ' + CM('roadmap.map.ed.needName'); return; }
              const r = E.add(acc, cid, { title: title.value, summary: summary.value, role: role.value, parents, children }); if (r.error) { err.textContent = '⚠️ ' + r.error; return; }
              if (chapters.length || goals.value.trim()) E.update(acc, cid, r.id, { chapters, learningGoals: goals.value.split('\n') });
              else { busy.textContent = '⏳ ' + CM('roadmap.map.ed.planningIts'); try { const pr = await E.plan(acc, cid, [r.id], { instruction: instr.value.trim() }); if (pr.queued) toast('💬 ' + CM('roadmap.map.ed.appPlansIts'), 4500); } catch (e) { toast('⚠️ ' + CM('roadmap.map.ed.notPlanned', { err: errMsg(e) }), 5000); } }
              close(); onDone(r.id); } }, '➕ ' + CM('roadmap.map.ed.addStep'))]
          : [el('button', { class: 'btn primary', onclick: () => { if (save()) { close(); onDone(); toast('✔ ' + CM('roadmap.map.ed.saved')); } } }, CM('roadmap.map.ed.save')),
            el('button', { class: 'btn small danger', onclick: async () => {
              const bridge = confirm(CM('roadmap.map.ed.removeConfirm', { title: n.title })); if (!bridge) return;
              const delMat = n.pack?.id && !n.pack.assigned && !C().stepsOf(acc, n.pack.id).some(x => x.c.id !== cid || x.nid !== id) ? confirm(CM('roadmap.map.ed.delMatConfirm')) : false;
              await E.remove(acc, cid, id, { bridge: true, deleteMaterial: delMat }); close(); onDone(null); toast('🗑 ' + CM('roadmap.map.ed.removed')); } }, '🗑 ' + CM('roadmap.map.ed.removeStep'))];
      box.append(head2,
        el('div', { class: 'noema-form' },
          el('label', { class: 'cg-field' }, CM('roadmap.map.ed.name'), title), el('label', { class: 'cg-field' }, CM('roadmap.map.ed.teaches'), summary), el('label', { class: 'cg-field' }, CM('roadmap.map.ed.place'), role),
          el('div', { class: 'cg-field' }, el('b', {}, '⬅️ ' + CM('roadmap.map.ed.prereqs')), links('pre', () => parents, v => { parents = v; }, possibleP)),
          el('div', { class: 'cg-field' }, el('b', {}, '➡️ ' + CM('roadmap.map.ed.opens')), links('next', () => children, v => { children = v; }, possibleK)),
          ownField(),
          n && !n.pack?.assigned && !locked ? el('div', { class: 'cg-field' }, el('b', {}, '📎 ' + CM('roadmap.map.mat.title')), tip(CM('roadmap.map.mat.tip')), matBox) : null,
          // a prepared step's goals and chapters are fixed: not shown here (only what can change is)
          locked ? null : el('label', { class: 'cg-field' }, CM('roadmap.map.ed.goals'), goals),
          locked ? null : el('div', { class: 'cg-field' }, el('b', {}, '📖 ' + CM('roadmap.map.ed.chapters')), chBox,
            el('div', { class: 'row' }, el('button', { class: 'btn small', onclick: () => { chapters.push({ title: '', goals: [], coverage: [] }); drawCh(); chBox.querySelector('li:last-child input')?.focus(); } }, '➕ ' + CM('roadmap.map.ed.addChapter')), replan),
            instr),
          busy),
        err, el('div', { class: 'row noema-ovfoot' }, ...buttons, el('button', { class: 'btn small', onclick: close }, CM('roadmap.map.cancel'))));
      setTimeout(() => (mode === 'review' ? box.querySelector('.cm-chedit input') : title)?.focus(), 150);
    });
  }
  async function openMaterial(acc, cid, id, f) {
    const c = C().get(acc, cid); const rec = await C().materialFile(acc, c, id, f).catch(() => null);
    if (!rec?.blob) { toast('⚠️ ' + CM('roadmap.map.mat.notHere'), 4000); return; }
    window.NoemaViewer.open({ blob: rec.blob, name: f.name, type: rec.type, title: f.name, subtitle: c.nodes[id]?.title + (f.range ? ' · ' + CM('roadmap.map.mat.pagesRange', { a: f.range[0], b: f.range[1] }) : ''), page: f.range ? f.range[0] : undefined });
  }

  /** 📚 The sources of a step: the learner's own files (at the step's pages) and the sources of the subject prepared for it. */
  function stepSources(acc, cid, id) {
    const c = C().get(acc, cid), n = c?.nodes[id]; if (!n) return;
    const files = n.material?.files || [], pk = n.pack || {}, SF = window.NoemaSrcFiles;
    overlay((box, close) => {
      box.classList.add('cg-box', 'cm-srcbox');
      const list = el('div', { class: 'cm-srclist' });
      const row = (ic, title, sub, open) => el('button', { class: 'cm-srcrow', disabled: open ? null : true, onclick: open }, el('span', { class: 'cm-srcic', 'aria-hidden': 'true' }, ic),
        el('span', { class: 'grow' }, el('b', {}, title), sub ? el('small', {}, sub) : null), open ? el('span', { class: 'cm-srceye', 'aria-hidden': 'true' }, '👁') : null);
      box.append(el('div', { class: 'row cm-srchead' }, el('h3', { class: 'grow' }, '📚 ' + SL('stepSources', 'Sources of this step')), el('button', { class: 'btn small ghost', 'aria-label': CM('roadmap.map.close'), onclick: close }, '✕')),   // i18n-ignore (SL: the English fallback of an sh.* key of i18n/shell)
        el('p', { class: 'tiny' }, n.title), list);
      for (const f of files) list.append(row('📎', f.name, f.range ? SL('srcPages', 'pages {p}', { p: `${f.range[0]}–${f.range[1]}` }) : '', () => openMaterial(acc, cid, id, f)));   // i18n-ignore (SL: the English fallback of an sh.* key of i18n/shell)
      const empty = () => { if (!list.children.length) list.append(el('p', { class: 'tiny' }, SL('noSources', 'No sources yet. They show here once the step is prepared.'))); };   // i18n-ignore (SL: the English fallback of an sh.* key of i18n/shell)
      if (!(pk.id && pk.status === 'ready')) return empty();
      const wait = el('p', { class: 'tiny' }, '⏳'); list.append(wait);
      Promise.resolve(window.Noema.loadSubject?.(acc, pk.id)).catch(() => null).then(p => {
        wait.remove(); const R = p?.sources || {};
        for (const s of R.sources || []) {
          if (files.some(f => f.srcId === s.id)) continue;   // already listed, with the step's pages
          const chs = (p.chapters || []).filter(ch => (R.chapters?.[ch.id] || ch.src) === s.id || (ch.sources || []).some(x => x.id === s.id)).map(ch => ch.title);
          const av = SF?.available(acc, pk.id, s);
          list.append(row(s.emoji || '📘', s.title, [s.pages, chs.join(' · '), av ? '' : SL('srcNoFile', 'no file on this device')].filter(Boolean).join(' · '), av ? () => openSrc(acc, pk.id, s, av) : null));   // i18n-ignore (SL: the English fallback of an sh.* key of i18n/shell)
        }
        empty();
      });
    });
  }
  async function openSrc(acc, sid, s, av) {
    if (av.url && !av.meta) return window.NoemaViewer.open({ url: av.url, title: s.title, subtitle: s.subtitle });
    const rec = await window.NoemaSrcFiles.get(acc, sid, s.id).catch(() => null);
    if (!rec?.blob) { toast('⚠️ ' + CM('roadmap.map.mat.notHere'), 4000); return; }
    window.NoemaViewer.open({ blob: rec.blob, name: rec.name, type: rec.type, title: s.title, subtitle: s.subtitle });
  }

  /* ======================= 📥 import a map you already have ======================= */
  function importMap(acc) {
    const I = window.NoemaCurImport;
    overlay((box, close) => {
      box.classList.add('cg-box', 'cm-import');
      let parsed = null, aiParsed = null, files = [], sel = null, filter = 'all', dragging = null;
      const A = new Map();   // file → { targets: [{ id, range }], how, confidence, alts, manual }
      const text = el('textarea', { class: 'noema-input cm-maptext', rows: 12, spellcheck: 'false', placeholder: CM('roadmap.map.imp.textPh') });
      const fileIn = el('input', { type: 'file', accept: '.txt,.md,.markdown,.json,.mmd,.mermaid', style: { display: 'none' }, onchange: async e => { const f = e.target.files[0]; if (f) { text.value = await f.text(); aiParsed = null; reparse(); } } });
      const mode = el('select', { class: 'noema-input', onchange: () => reparse() }, el('option', { value: 'sequence' }, CM('roadmap.map.imp.seq')), el('option', { value: 'parallel' }, CM('roadmap.map.imp.par')));
      const reverse = el('input', { type: 'checkbox', onchange: () => reparse() }), keepCaps = el('input', { type: 'checkbox', onchange: () => reparse() });
      const info = el('div', { class: 'tiny cm-detect' }), perr = el('div', { class: 'tiny cg-kstat bad' }), warnBox = el('div', { class: 'tiny cm-warns' });
      const graph = el('div', { class: 'cm-miniscroll', 'aria-label': CM('roadmap.map.imp.previewAria') }), nodeBox = el('div', { class: 'cm-nodebox' }), prev = el('ol', { class: 'cm-preview' });
      const title = el('input', { class: 'noema-input', placeholder: CM('roadmap.map.imp.namePh') });
      const lang = el('select', { class: 'noema-input' }, ...Object.keys(C().LANG).map(v => el('option', { value: v }, langLabel(v)))); lang.value = (navigator.language || 'en').slice(0, 2) in C().LANG ? (navigator.language || 'en').slice(0, 2) : 'en';
      const learner = el('input', { class: 'noema-input', placeholder: CM('roadmap.map.imp.learnerPh') });
      const PP = providerPick(acc, { what: 'plan' }), provider = PP.sel;
      const prefetch = el('select', { class: 'noema-input' }, ...[0, 1, 2, 3, 5, 8].map(n => el('option', { value: n }, CM('roadmap.map.new.ahead', { n })))); prefetch.value = '3';
      const budget = el('input', { class: 'noema-input cg-budget', type: 'number', min: '1', value: String(prefs(acc).curBudget || 8) });
      const fileBox = el('div', { class: 'cm-files' }), fileSum = el('div', { class: 'tiny cm-filesum' });
      const attachFirst = el('input', { type: 'checkbox', class: 'cm-attachfirst' });
      const drop = el('label', { class: 'cg-drop' }, '📎 ' + CM('roadmap.map.imp.addMaterial'), el('input', { type: 'file', multiple: true, onchange: e => { addFiles([...e.target.files]); e.target.value = ''; } }));
      const folder = el('label', { class: 'btn small' }, '📁 ' + CM('roadmap.map.imp.addFolder'), el('input', { type: 'file', multiple: true, webkitdirectory: true, style: { display: 'none' }, onchange: e => { addFiles([...e.target.files].filter(f => !/(^|\/)\./.test(f.webkitRelativePath || f.name))); e.target.value = ''; } }));
      ['dragover', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); if (ev === 'drop' && e.dataTransfer.files.length) addFiles([...e.dataTransfer.files]); }));
      const aiBtn = el('button', { class: 'btn small ai', onclick: async () => {
        perr.textContent = ''; if (!text.value.trim()) { perr.textContent = '👆 ' + CM('roadmap.map.imp.pasteFirst'); return; }
        if (!LLM().pick(acc, provider.value === 'claudeapp' ? 'auto' : provider.value)) { perr.textContent = '👆 ' + CM('roadmap.map.imp.aiNeedsKey'); return; }
        aiBtn.disabled = true; info.textContent = '✨ ' + CM('roadmap.map.imp.aiReading');
        try { aiParsed = await I.aiRead(acc, text.value, { provider: provider.value, onLog: m => { info.textContent = m; } }); show(aiParsed); } catch (e) { perr.textContent = '⚠️ ' + errMsg(e); info.textContent = ''; }
        aiBtn.disabled = false;
      } }, '✨ ' + CM('roadmap.map.imp.aiRead'));
      const err = el('div', { class: 'tiny cg-kstat bad' }); const busy = el('div', { class: 'tiny' });
      const FMT = { get outline() { return CM('roadmap.map.imp.fmtOutline'); }, get arrows() { return CM('roadmap.map.imp.fmtArrows'); }, get mermaid() { return CM('roadmap.map.imp.fmtMermaid'); }, json: 'JSON', get ai() { return CM('roadmap.map.imp.fmtAi'); } };
      const T = id => parsed?.nodes[id]?.title || id;
      const nFiles = id => [...A.values()].filter(a => a.targets.some(t => t.id === id)).length;
      const parseRange = v => { const m = String(v || '').match(/(\d+)\s*(?:[-–—]\s*(\d+))?/); return m ? [+m[1], +(m[2] || m[1])] : null; };
      const fmtRange = r => r ? (r[0] === r[1] ? String(r[0]) : `${r[0]}–${r[1]}`) : '';
      const addTarget = (f, id) => { const a = A.get(f); if (!a || a.targets.some(t => t.id === id)) return; a.targets.push({ id, range: null }); a.manual = true; a.confidence = 'high'; a.how = a.how || 'you'; redraw(); };

      /* ---- the map as a picture: branches and joins are visible; drop a file on a step ---- */
      function drawGraph() {
        graph.innerHTML = ''; if (!parsed) return;
        const Lt = C().layout({ nodes: parsed.nodes, edges: parsed.edges }); const NW = 158, NH = 44, GX = 30, GY = 10;
        const rows = Math.max(1, ...Lt.cols.map(c => c.length)); const Wd = Lt.cols.length * (NW + GX) + 8, Hd = rows * (NH + GY) + 8;
        const P = {}; Lt.cols.forEach((col, x) => { const off = (rows - col.length) * (NH + GY) / 2; col.forEach((id, y) => { P[id] = { x: 4 + x * (NW + GX), y: 4 + off + y * (NH + GY) }; }); });
        const narrow = (graph.clientWidth || innerWidth - 64) < Wd;   // a phone: the steps wrap in their order instead of a picture wider than the screen
        const inner = el('div', { class: 'cm-mini' + (narrow ? ' cm-mini-flow' : ''), style: narrow ? {} : { width: Wd + 'px', height: Hd + 'px' } });
        const NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'); svg.setAttribute('width', Wd); svg.setAttribute('height', Hd); svg.setAttribute('class', 'cm-edges');
        for (const e of parsed.edges) { const a = P[e.from], b = P[e.to]; if (!a || !b) continue; const p = document.createElementNS(NS, 'path'); const x1 = a.x + NW, y1 = a.y + NH / 2, x2 = b.x, y2 = b.y + NH / 2, mx = (x1 + x2) / 2; p.setAttribute('d', `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`); if (sel && (e.from === sel || e.to === sel)) p.setAttribute('class', 'hl'); svg.append(p); }
        if (!narrow) inner.append(svg);
        for (const id of parsed.order) {
          const n = parsed.nodes[id], k = nFiles(id), ins = parsed.edges.filter(e => e.to === id).length, outs = parsed.edges.filter(e => e.from === id).length;
          const b = el('button', { class: 'cm-mnode cm-r-' + n.role + (sel === id ? ' sel' : '') + (k ? ' has' : ''), 'data-id': id, style: { left: P[id].x + 'px', top: P[id].y + 'px', width: NW + 'px', height: NH + 'px' }, title: `${n.title}${ins > 1 ? ' · ' + CM('roadmap.map.imp.join', { n: ins }) : ''}${outs > 1 ? ' · ' + CM('roadmap.map.imp.branch', { n: outs }) : ''}\n${k ? '📎 ' + CM('roadmap.map.imp.nFiles', { n: k }) : CM('roadmap.map.imp.noFiles')}\n` + CM('roadmap.map.imp.dropHere'),
            onclick: () => { sel = sel === id ? null : id; drawGraph(); drawNode(); },
            ondragover: e => { e.preventDefault(); b.classList.add('over'); }, ondragleave: () => b.classList.remove('over'),
            ondrop: e => { e.preventDefault(); b.classList.remove('over'); const raw = e.dataTransfer.getData('text/noema-file') || e.dataTransfer.getData('text/plain'); const i = /^\d+$/.test(raw) ? +raw : (dragging ?? -1); dragging = null; if (files[i]) addTarget(files[i], id); else if (e.dataTransfer.files.length) addFiles([...e.dataTransfer.files], id); } },
            el('span', { class: 'cm-ic' }, ICON[n.role] || '•'), el('span', { class: 'cm-t' }, n.title), k ? el('span', { class: 'cm-mbadge' }, '📎' + k) : null);
          inner.append(b);
        }
        graph.append(inner);
      }
      /* ---- the selected step: its files (pages per step), add one ---- */
      function drawNode() {
        nodeBox.innerHTML = ''; if (!parsed || !sel || !parsed.nodes[sel]) return;
        const mine = [...A.entries()].filter(([, a]) => a.targets.some(t => t.id === sel));
        const add = el('select', { class: 'noema-input', 'aria-label': CM('roadmap.map.imp.giveAria'), onchange: e => { const f = files[+e.target.value]; if (f) addTarget(f, sel); } }, el('option', { value: '' }, files.length ? '＋ ' + CM('roadmap.map.imp.giveOpt') : CM('roadmap.map.imp.addBelow')), ...files.map((f, i) => el('option', { value: i }, relPath(f))));
        nodeBox.append(el('div', { class: 'cm-nodehead' }, el('b', {}, '📎 ' + T(sel)), el('button', { class: 'btn small ghost', 'aria-label': CM('roadmap.map.close'), onclick: () => { sel = null; redraw(); } }, '✕')),
          mine.length ? el('ul', { class: 'cm-matlist' }, ...mine.map(([f, a]) => { const t = a.targets.find(x => x.id === sel); return el('li', {}, '📄 ' + relPath(f), rangeInput(f, t), el('button', { class: 'btn small ghost', 'aria-label': CM('roadmap.map.imp.removeFromStep', { name: f.name }), onclick: () => { a.targets = a.targets.filter(x => x !== t); a.manual = true; redraw(); } }, '✕')); }))
            : el('div', { class: 'tiny' }, CM('roadmap.map.imp.stepNoFiles')), add);
      }
      const rangeInput = (f, t) => el('label', { class: 'tiny cm-rangel' }, ' ' + CM('roadmap.map.mat.pagesLabel') + ' ', el('input', { class: 'noema-input cm-range', value: fmtRange(t.range), placeholder: CM('roadmap.map.imp.all'), 'aria-label': CM('roadmap.map.imp.pagesFor', { name: f.name, title: T(t.id) }), onchange: e => { t.range = parseRange(e.target.value); A.get(f).manual = true; } }));
      const relPath = f => String(f.hint || f.webkitRelativePath || f.name);

      function show(g) {
        parsed = g; prev.innerHTML = ''; perr.textContent = ''; warnBox.innerHTML = '';
        if (sel && !(g && g.nodes[sel])) sel = null;
        if (!g) { info.textContent = ''; redraw(); return; }
        const s = g.stats || {}; const planned = Object.values(g.nodes).filter(n => n.chapters?.length).length;
        info.textContent = '✓ ' + CM('roadmap.map.imp.detected', { format: FMT[g.format] || g.format, steps: s.steps, links: s.links }) + (s.branches ? ' · ' + CM('roadmap.map.imp.branches', { n: s.branches }) : '') + (s.joins ? ' · ' + CM('roadmap.map.imp.joins', { n: s.joins }) : '') + (s.starts > 1 ? ' · ' + CM('roadmap.map.imp.starts', { n: s.starts }) : '') + (planned ? ' · ' + CM('roadmap.map.imp.planned', { n: planned }) : '') + (s.named ? ' · ' + CM('roadmap.map.imp.named', { n: s.named }) : '');
        if (g.warnings.length) warnBox.append(...g.warnings.slice(0, 6).map(w => el('div', {}, '⚠️ ' + w)));
        if (!title.value.trim() || title.dataset.auto) { title.value = g.title || ''; title.dataset.auto = '1'; }
        if (g.language && C().LANG[g.language]) lang.value = g.language;
        g.order.forEach(id => { const ps = g.edges.filter(e => e.to === id).map(e => T(e.from)); prev.append(el('li', {}, el('span', { class: 'cm-ic' }, ICON[g.nodes[id].role] || '•'), ' ', el('b', {}, T(id)), ps.length ? el('span', { class: 'tiny' }, '  ← ' + ps.join(', ')) : el('span', { class: 'tiny' }, '  ' + CM('roadmap.map.imp.startsHere')))); });
        rematch(); redraw();
      }
      let t0 = null;
      function reparse() {
        clearTimeout(t0); t0 = setTimeout(() => {
          if (!text.value.trim()) { show(null); return; }
          if (aiParsed) { show(aiParsed); return; }
          try { show(I.parse(text.value, { mode: mode.value, reverse: reverse.checked, keepCaps: keepCaps.checked })); }
          catch (e) { parsed = null; prev.innerHTML = ''; info.textContent = ''; perr.textContent = '⚠️ ' + errMsg(e) + (LLM().pick(acc, provider.value) ? ' — ' + CM('roadmap.map.imp.orAi') : ''); redraw(); }
        }, 250);
      }
      text.addEventListener('input', () => { aiParsed = null; reparse(); }); title.addEventListener('input', () => { delete title.dataset.auto; });
      /** automatic matches for the files the learner has not touched (their own choices stay) */
      function rematch() {
        if (!files.length) return;
        const auto = parsed ? I.matchFiles(parsed, files) : files.map(f => ({ file: f, targets: [], confidence: 'none', alts: [] }));
        for (const m of auto) { const a = A.get(m.file); if (a?.manual) { if (parsed) a.targets = a.targets.filter(t => parsed.nodes[t.id]); continue; } A.set(m.file, { targets: m.targets.map(t => ({ ...t })), how: m.targets[0]?.how || '', confidence: m.confidence, alts: m.alts || [], manual: false }); }
      }
      async function addFiles(fs, toStep) {
        const added = [];
        for (const f of fs) {
          if (/\.zip$/i.test(f.name)) { try { const inner = await I.unzipMaterial(f); for (const g of inner) if (!files.some(x => relPath(x) === relPath(g) && x.size === g.size)) { files.push(g); added.push(g); } } catch (e) { toast('⚠️ ' + f.name + ': ' + errMsg(e), 4000); } continue; }
          if (!files.some(x => relPath(x) === relPath(f) && x.size === f.size)) { files.push(f); added.push(f); }
        }
        rematch();
        if (toStep) for (const f of added) addTarget(f, toStep);
        redraw();
      }
      const BADGE = { get high() { return ['✓', CM('roadmap.map.imp.cHigh')]; }, get medium() { return ['≈', CM('roadmap.map.imp.cMedium')]; }, get low() { return ['?', CM('roadmap.map.imp.cLow')]; }, get check() { return ['⚠️', CM('roadmap.map.imp.cCheck')]; }, get none() { return ['—', CM('roadmap.map.imp.cNone')]; } };
      const HOW = { get map() { return CM('roadmap.map.imp.howMap'); }, get folder() { return CM('roadmap.map.imp.howFolder'); }, get number() { return CM('roadmap.map.imp.howNumber'); }, get name() { return CM('roadmap.map.imp.howName'); }, get you() { return CM('roadmap.map.imp.howYou'); } };
      function drawFiles() {
        fileBox.innerHTML = ''; fileSum.textContent = '';
        if (!files.length) return;
        const all = files.map((f, i) => ({ f, i, a: A.get(f) || { targets: [], confidence: 'none', alts: [] } }));
        const unused = all.filter(x => !x.a.targets.length), check = all.filter(x => x.a.targets.length && (x.a.confidence === 'check' || x.a.confidence === 'low') && !x.a.manual);
        const stepsWith = parsed ? parsed.order.filter(id => nFiles(id)).length : 0;
        fileSum.textContent = CM('roadmap.map.imp.fileSum', { n: files.length, with: stepsWith, total: parsed ? parsed.order.length : 0 }) + (check.length ? ' · ⚠️ ' + CM('roadmap.map.imp.toCheckN', { n: check.length }) : '') + (unused.length ? ' · ' + CM('roadmap.map.imp.unusedN', { n: unused.length }) : '');
        const tabs = el('div', { class: 'cm-filetabs', role: 'tablist' }, ...[['all', CM('roadmap.map.imp.tabAll', { n: all.length })], ['check', '⚠️ ' + CM('roadmap.map.imp.tabCheck', { n: check.length })], ['unused', CM('roadmap.map.imp.tabUnused', { n: unused.length })]].map(([k, l]) => el('button', { class: 'fchip' + (filter === k ? ' on' : ''), role: 'tab', onclick: () => { filter = k; drawFiles(); } }, l)));
        const rows = (filter === 'check' ? check : filter === 'unused' ? unused : all);
        fileBox.append(tabs, el('table', { class: 'cm-filetable' }, el('tbody', {}, ...rows.map(({ f, i, a }) => {
          const conf = a.manual ? ['✓', CM('roadmap.map.imp.setByYou')] : BADGE[a.confidence] || BADGE.none;
          const chips = el('div', { class: 'cm-chips' }, ...a.targets.map(t => el('span', { class: 'cm-tchip' }, el('button', { class: 'linklike', onclick: () => { sel = t.id; redraw(); graph.querySelector(`[data-id="${CSS.escape(t.id)}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'center' }); } }, T(t.id)), rangeInput(f, t),
            el('button', { class: 'btn small ghost', 'aria-label': CM('roadmap.map.imp.removeFrom', { name: f.name, title: T(t.id) }), onclick: () => { a.targets = a.targets.filter(x => x !== t); a.manual = true; redraw(); } }, '✕'))));
          const addSel = el('select', { class: 'noema-input cm-addstep', 'aria-label': CM('roadmap.map.imp.stepForAria', { more: a.targets.length ? 'yes' : 'no', name: f.name }), onchange: e => { if (e.target.value) addTarget(f, e.target.value); } },
            el('option', { value: '' }, a.targets.length ? '＋ ' + CM('roadmap.map.imp.alsoFor') : '— ' + CM('roadmap.map.imp.chooseStep') + ' —'), ...(parsed ? parsed.order.filter(id => !a.targets.some(t => t.id === id)).map(id => el('option', { value: id }, T(id))) : []));
          const alts = !a.manual && a.alts?.length ? el('div', { class: 'tiny' }, CM('roadmap.map.imp.or') + ' ', ...a.alts.map((id, k) => [k ? ', ' : '', el('button', { class: 'linklike', onclick: () => { a.targets = [{ id, range: null }]; a.manual = true; redraw(); } }, T(id))])) : null;
          return el('tr', { draggable: 'true', ondragstart: e => { dragging = i; e.dataTransfer.setData('text/noema-file', String(i)); e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'copy'; }, ondragend: () => { setTimeout(() => { dragging = null; }, 0); } },
            el('td', {}, el('span', { class: 'cm-conf c-' + (a.manual ? 'high' : a.confidence), title: conf[1] }, conf[0]), ' 📄 ', el('b', {}, f.name), el('div', { class: 'tiny' }, relPath(f) !== f.name ? relPath(f).replace(/[^/]+$/, '') + ' · ' : '', CM('roadmap.map.imp.mb', { n: f.size / 1048576 }) + (a.targets.length ? ' · ' + (a.manual ? HOW.you : HOW[a.how] || '') : ''))),
            el('td', {}, chips, alts, addSel),
            el('td', {}, el('button', { class: 'btn small ghost', 'aria-label': CM('roadmap.map.ed.removeAria', { title: f.name }), onclick: () => { files = files.filter(x => x !== f); A.delete(f); redraw(); } }, '✕')));
        }))));
      }
      function redraw() { drawGraph(); drawNode(); drawFiles(); }
      const go = el('button', { class: 'btn primary cg-go', onclick: async () => {
        err.textContent = '';
        if (!parsed) { err.textContent = '👆 ' + CM('roadmap.map.imp.needParsed'); return; }
        const needPlan = Object.values(parsed.nodes).some(n => !n.chapters?.length);
        if (needPlan && provider.value !== 'claudeapp' && !LLM().pick(acc, provider.value)) { err.textContent = '👆 ' + CM('roadmap.map.imp.planNeedsKey'); return; }
        const big = files.find(f => f.size > (window.NoemaSrcFiles?.MAX || 2147483648)); if (big) { err.textContent = '⚠️ ' + CM('roadmap.map.imp.tooBig', { name: big.name }); return; }
        go.disabled = true;
        try {
          const assignments = files.map(f => ({ file: f, targets: (A.get(f)?.targets || []).filter(t => parsed.nodes[t.id]) })).filter(a => a.targets.length);
          let c = await I.create(acc, parsed, { title: title.value.trim(), language: lang.value, learner: learner.value, provider: provider.value, prefetch: +prefetch.value, nodeBudget: Math.max(1, +budget.value || 8), assignments, source: text.value, onLog: m => { busy.textContent = m; } });
          if (attachFirst.checked) {   // 📦 open the map and attach the learner's own subjects first; the other steps are planned afterwards (▶ Plan the steps now)
            c.attachFirst = true; if (C().holding(c)) { c.status = c.provider === 'claudeapp' ? 'ready' : 'attach'; } C().save(acc, c); c = C().get(acc, c.id);
            if (C().holding(c)) { close(); window.NoemaCloud?.session?.() && window.NoemaCloud.push(acc).catch(() => { }); openMap(c.id); setTimeout(() => attachMany(acc, c.id), 350); return; }
          }
          if (c.provider === 'claudeapp') { const r = await C().build(acc, c); close(); window.NoemaCloud?.session?.() && window.NoemaCloud.push(acc).catch(() => { }); G().kick(); openMap(r.id, { app: !J().work(r).done }); return; }
          close(); if (c.status === 'ready') { G().kick(); openMap(c.id); } else progress(acc, c, { start: true });
        } catch (e) { err.textContent = '⚠️ ' + errMsg(e); go.disabled = false; }
      } }, '📥 ' + CM('roadmap.map.imp.go'));
      // ⓘ guides (step 1: how to write a map · step 3: how to give steps their files) — every example is read by the real parser
      const tryIt = code => el('button', { class: 'btn small ghost cm-try', onclick: e => { e.preventDefault(); text.value = code; aiParsed = null; reparse(); text.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }, '▶ ' + CM('roadmap.map.guide.try'));
      const rules = rows => el('table', { class: 'cm-rules' }, el('tbody', {}, ...rows.map(([c, m]) => el('tr', {}, el('td', {}, el('code', {}, c)), el('td', {}, m)))));
      const ex = (code, reads) => el('div', { class: 'cm-ex' }, el('pre', {}, code), reads ? el('div', { class: 'cm-reads' }, el('b', {}, CM('roadmap.map.guide.readAs') + ' '), el('pre', {}, reads)) : null, tryIt(code));
      const sec = (h, ...c) => el('section', { class: 'cm-gsec' }, el('h4', {}, h), ...c);
      /* i18n-ignore-start — the guides' syntax column and examples are input for the parser (curimport.js), written as it reads them; their prose is CM() */
      const mapGuide = el('div', { class: 'cm-guide' },
        el('p', {}, ...boldMd(CM('roadmap.map.guide.intro'))),
        sec(CM('roadmap.map.guide.s1'),
          rules([
            ['├── └── │   - * •   1.  2.3  a)   # ##   indentation', CM('roadmap.map.guide.t1a')],
            [CM('roadmap.map.guide.c.sub'), CM('roadmap.map.guide.t1b')],
            [CM('roadmap.map.guide.c.same'), CM('roadmap.map.guide.t1c')],
            ['1. 2. 3.   2.1 2.2', CM('roadmap.map.guide.t1d')],
            ['Topic (any order)', CM('roadmap.map.guide.t1e')],
            ['Topic (in order)', CM('roadmap.map.guide.t1f')],
            ['Topic (after: A, 2.1)   Topic ← A', CM('roadmap.map.guide.t1g')],
            ['Topic — one line', CM('roadmap.map.guide.t1h')],
            [CM('roadmap.map.guide.c.top'), CM('roadmap.map.guide.t1i')],
            ['Prerequisites / Applications', CM('roadmap.map.guide.t1j')],
            ['Topic 📎 file.pdf pp. 3–9', CM('roadmap.map.guide.t1k')]]),
          ex('Molecular biology\n├── Chemistry basics\n├── DNA (any order)\n│   ├── Structure\n│   └── Replication — how cells copy DNA\n├── Transcription\n└── Applications',
            '1 Chemistry basics   (start)\n2 DNA                ⟵ Chemistry basics\n2.1 Structure        ⟵ DNA\n2.2 Replication      ⟵ DNA      (independent of 2.1)\n3 Transcription      ⟵ Structure, Replication   (a join)\n4 Applications       ⟵ Transcription'),
          ex('Course (any order)\n- Algebra\n- Geometry\n- Calculus (after: Algebra, Geometry)',
            'Algebra    (start)\nGeometry   (start)\nCalculus   ⟵ Algebra, Geometry')),
        sec(CM('roadmap.map.guide.s2'),
          rules([
            ['A → B     (also -> => ⇒)', CM('roadmap.map.guide.t2a')],
            ['A → B → C', CM('roadmap.map.guide.t2b')],
            ['A, B → C', CM('roadmap.map.guide.t2c')],
            ['A → B, C', CM('roadmap.map.guide.t2d')],
            [CM('roadmap.map.guide.c.chain'), CM('roadmap.map.guide.t2e')],
            [CM('roadmap.map.guide.c.rev'), CM('roadmap.map.guide.t2f')],
            ['A — one line   A 📎 a.pdf', CM('roadmap.map.guide.t2g')]]),
          ex('Algebra → Calculus → Probability\nCalculus → Linear algebra\nProbability, Linear algebra → Bayesian inference',
            'Algebra             (start)\nCalculus            ⟵ Algebra\nProbability         ⟵ Calculus\nLinear algebra      ⟵ Calculus          (a branch from Calculus)\nBayesian inference  ⟵ Probability, Linear algebra   (a join)')),
        sec(CM('roadmap.map.guide.s3'),
          rules([
            ['flowchart LR   graph TD', CM('roadmap.map.guide.t3a')],
            ['A[Algebra]   A(Algebra)   A{Algebra}', CM('roadmap.map.guide.t3b')],
            ['A --> B    A ==> B    A -.-> B    A -- text --> B', CM('roadmap.map.guide.t3c')],
            ['B & C --> D', CM('roadmap.map.guide.t3d')],
            ['subgraph Prerequisites … end', CM('roadmap.map.guide.t3e')],
            ['%% 📎 Files   then   %% D: proofs/', CM('roadmap.map.guide.t3f')]]),
          ex('flowchart LR\n  A[Algebra] --> B[Calculus]\n  A --> C[Logic]\n  B & C --> D[Proofs]',
            'Algebra    (start)\nCalculus   ⟵ Algebra\nLogic      ⟵ Algebra\nProofs     ⟵ Calculus, Logic')),
        sec(CM('roadmap.map.guide.s4'),
          rules([
            ['"nodes": [{ "id", "title", "after": [ids] }]', CM('roadmap.map.guide.t4a')],
            ['"edges": [{ "from": "a", "to": "b" }]   or   ["a → b"]', CM('roadmap.map.guide.t4b')],
            ['"children": [ … ]   "order": "any"', CM('roadmap.map.guide.t4c')],
            ['"summary"   "files"   "folder"', CM('roadmap.map.guide.t4d', { a: '"files": ["book.pdf pp. 1-40"]', b: '[{ "path": "book.pdf", "pages": "1-40" }]', c: '"folder": "bayes/"' })],
            ['"files": { "<id or title>": ["path", …] }', CM('roadmap.map.guide.t4e')],
            [CM('roadmap.map.guide.c.exported'), CM('roadmap.map.guide.t4f')]]),
          ex('{ "title": "Bayes",\n  "nodes": [\n    { "id": "prob", "title": "Probability" },\n    { "id": "lin", "title": "Linear algebra" },\n    { "id": "bayes", "title": "Bayesian inference", "after": ["prob", "lin"] } ] }',
            'Probability          (start)\nLinear algebra       (start)\nBayesian inference   ⟵ Probability, Linear algebra')),
        sec(CM('roadmap.map.guide.s5'), el('p', {}, CM('roadmap.map.guide.s5text'))),
        el('p', { class: 'tiny' }, CM('roadmap.map.guide.implied')));
      const filesGuide = el('div', { class: 'cm-guide' },
        el('p', {}, CM('roadmap.map.guide.filesIntro')),
        sec(CM('roadmap.map.guide.f1'),
          rules([
            ['Topic 📎 book.pdf pp. 40–62, notes/dna/', CM('roadmap.map.guide.f1a')],
            ['Topic (files: lab/)', CM('roadmap.map.guide.f1b')],
            ['📎 Files   — ' + CM('roadmap.map.guide.c.ownLine'), CM('roadmap.map.guide.f1c')],
            ['DNA replication: …   2.1: …   D: …', CM('roadmap.map.guide.f1d')],
            ['%% 📎 Files   %% D: proofs/', CM('roadmap.map.guide.f1e')],
            ['"files" / "folder"', CM('roadmap.map.guide.f1f')]]),
          ex('1. Cell biology\n2. DNA replication 📎 dna/*.pdf, notes/dna.md\n3. Transcription\n\n📎 Files\nCell biology: cells/\n3: book.pdf pp. 40–62',
            'Cell biology      📎 every file in cells/\nDNA replication   📎 the PDFs in dna/ + notes/dna.md\nTranscription     📎 pages 40–62 of book.pdf')),
        sec(CM('roadmap.map.guide.f2'),
          rules([
            ['book.pdf', CM('roadmap.map.guide.f2a')],
            ['dna/   (or dna)', CM('roadmap.map.guide.f2b')],
            ['notes/*.md   lab?/x.pdf   dna/**', CM('roadmap.map.guide.f2c')],
            ['book.pdf pp. 40–62   p. 40   #40-62   σσ. 40–62', CM('roadmap.map.guide.f2d')],
            [CM('roadmap.map.guide.c.sameBook'), CM('roadmap.map.guide.f2e')]])),
        sec(CM('roadmap.map.guide.f3'),
          rules([
            ['DNA replication/   03 DNA replication/   2.1/', CM('roadmap.map.guide.f3a')],
            ['2.1 Structure.pdf   03-transcription.pdf', CM('roadmap.map.guide.f3b')],
            ['transcription-notes.pdf', CM('roadmap.map.guide.f3c')],
            ['⚠️', CM('roadmap.map.guide.f3d')],
            ['—', CM('roadmap.map.guide.f3e')]]),
          el('p', {}, CM('roadmap.map.guide.f3f')),
          el('pre', { class: 'cm-tree' }, 'Biology/\n├── 01 Cell biology/        → step 1 (every file)\n├── 02 DNA replication/\n│   ├── lecture.pdf\n│   └── notes.md\n└── book.pdf               → named in the Roadmap with pages per step')),
        sec(CM('roadmap.map.guide.f4'),
          el('p', {}, CM('roadmap.map.guide.f4a'))));
      /* i18n-ignore-end */
      box.append(el('button', { class: 'btn small ghost cg-back', onclick: () => { close(); openLibrary(); } }, cmBack() + ' ' + CM('roadmap.map.lib.title')),
        head('📥 ' + CM('roadmap.map.lib.import'), CM('roadmap.map.imp.lead')),
        el('ol', { class: 'cg-steps' },
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, CM('roadmap.map.imp.s1')), tip(mapGuide)),
            text, el('div', { class: 'row' }, el('label', { class: 'btn small' }, '📄 ' + CM('roadmap.map.imp.openFile'), fileIn), aiBtn),
            el('details', { class: 'cg-faq' }, el('summary', {}, CM('roadmap.map.imp.howRead')), el('label', { class: 'cg-field' }, CM('roadmap.map.imp.sameLevel'), mode), el('label', { class: 'tiny' }, reverse, ' ⇄ ' + CM('roadmap.map.imp.reverse')), el('label', { class: 'tiny' }, keepCaps, ' ' + CM('roadmap.map.imp.keepCaps'))),
            info, perr, warnBox, graph, nodeBox, el('details', { class: 'cg-faq' }, el('summary', {}, CM('roadmap.map.imp.asList')), prev)),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, CM('roadmap.map.imp.s2'))), el('label', { class: 'cg-field' }, CM('roadmap.map.ed.name'), title), el('label', { class: 'cg-field' }, CM('roadmap.map.new.lang'), lang), el('label', { class: 'cg-field' }, CM('roadmap.map.new.start'), learner)),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, CM('roadmap.map.imp.s3')), tip(filesGuide)), drop, el('div', { class: 'row' }, folder), fileSum, fileBox),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, CM('roadmap.map.imp.s4')), tip(el('div', {}, el('p', {}, CM('roadmap.map.imp.s4used')), el('p', {}, ...boldMd(CM('roadmap.map.imp.s4app'))), el('p', {}, ...boldMd(CM('roadmap.map.imp.s4key')))))), PP.box,
            el('label', { class: 'cg-field' }, CM('roadmap.map.new.prepAhead'), prefetch), el('label', { class: 'cg-field' }, CM('roadmap.map.new.budget'), budget)),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, CM('roadmap.map.imp.s5')), tip(CM('roadmap.map.imp.s5tip'))),
            el('label', { class: 'tiny' }, attachFirst, ' ' + CM('roadmap.map.imp.attachFirst'))),
          el('li', { class: 'cg-step' }, el('div', { class: 'cg-steptitle' }, el('b', {}, CM('roadmap.map.imp.s6'))), go, busy, err)),
        el('div', { class: 'row noema-ovfoot' }, el('button', { class: 'btn small', onclick: close }, CM('roadmap.map.close'))));
      setTimeout(() => text.focus(), 200);
    });
  }

  /** In a node's subject: the curriculum it belongs to, mastery so far, back to the map. */
  function nodeInfo(acc, ref) { const c = C().get(acc, ref?.id); const n = c?.nodes[ref?.node]; if (!n) return null; const st = C().nodeStatus(acc, c, ref.node); return { c, n, st }; }
  /* ======================= ⚙️ a Roadmap's settings ======================= */
  /** ⬇️ The Roadmap as a file (curriculum-<id>.json). */
  function exportMap(acc, cid) {
    const b = new Blob([JSON.stringify(C().get(acc, cid), null, 1)], { type: 'application/json' });
    const a = el('a', { href: URL.createObjectURL(b), download: `curriculum-${cid}.json` }); document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 15000);
  }
  /** ⚙️ How a Roadmap is prepared (ahead, the limit, the AI, review, pause), many steps ahead in the Claude app
      (src/features/roadmaps/ui/prepare-ahead.ts), re-planning every step not prepared yet, export, delete (a member: leave).
      onGone: the Roadmap was deleted or left (the map it was opened from goes back to the library). */
  function settings(acc, cid, { onGone = () => { } } = {}) {
    const c = C().get(acc, cid); if (!c) return;
    const member = !!SH()?.isMember(c);
    overlay((b2, close2) => {
      b2.classList.add('cm-settings');
      const pf = el('select', { class: 'noema-input' }, ...[0, 1, 2, 3, 5, 8].map(n => el('option', { value: n }, CM('roadmap.map.set.ahead', { n })))); pf.value = String(c.prefetch ?? 3);
      const bud = el('input', { class: 'noema-input cg-budget', type: 'number', min: '1', value: String(c.nodeBudget || 8) });
      const prov = el('select', { class: 'noema-input' }, el('option', { value: 'claudeapp' }, '💬 ' + CM('roadmap.map.set.app')), el('option', { value: 'auto' }, CM('roadmap.map.set.auto')), el('option', { value: 'claude' }, CM('roadmap.map.ai.claude')), el('option', { value: 'gemini' }, 'Gemini')); prov.value = c.provider || 'auto';   // i18n-ignore (Gemini: a product name)
      const pause = el('input', { type: 'checkbox' }); pause.checked = G().paused();
      const review = el('input', { type: 'checkbox' }); review.checked = !c.autoApprove;
      // ✨ re-plan every step not prepared yet, with the curriculum's own AI
      const E = C().Edit; const todo = Object.values(c.nodes).filter(n => !E.generated(n)).length, fixed = Object.keys(c.nodes).length - todo;
      const how = c.provider === 'claudeapp' ? 'app' : LLM().pick(acc, c.provider) === 'claude' ? 'claude' : LLM().pick(acc, c.provider) === 'gemini' ? 'gemini' : 'none';   // → {how, select} in the messages below
      const wish = el('input', { class: 'noema-input', placeholder: CM('roadmap.map.set.wishPh') });
      const rlog = el('div', { class: 'tiny cm-replanlog' });
      const rbtn = el('button', { class: 'btn small cm-replanall', disabled: !todo, onclick: async () => {
        if (!confirm(CM('roadmap.map.set.replanConfirm', { n: todo, how }) + (fixed ? '\n' + CM('roadmap.map.set.replanFixed', { n: fixed }) : '') + '\n' + CM('roadmap.map.set.replanReview'))) return;
        rbtn.disabled = true; rlog.textContent = '⏳ …';
        try {
          const r = await E.replanAll(acc, cid, { instruction: wish.value.trim(), onLog: m => { rlog.textContent = m; } });
          if (r.error) rlog.textContent = '⚠️ ' + errMsg(r.error);
          else if (r.queued) { rlog.textContent = '💬 ' + CM('roadmap.map.set.queued', { n: r.count }); window.NoemaCloud?.session?.() && window.NoemaCloud.push(acc).catch(() => { }); }
          else rlog.textContent = '✅ ' + CM('roadmap.map.set.replanned', { n: r.count });
        } catch (e) { rlog.textContent = '⚠️ ' + errMsg(e); }
        rbtn.disabled = false;
      } }, '✨ ' + CM('roadmap.map.set.replanAll', { n: todo }));
      const replanBox = el('details', { class: 'cg-faq' }, el('summary', {}, '✨ ' + CM('roadmap.map.set.replanWhole')),
        el('p', { class: 'tiny' }, CM('roadmap.map.set.replanWhat', { how }) + ' ' + (fixed ? CM('roadmap.map.set.replanKeep', { n: fixed }) + ' ' : '') + CM('roadmap.map.set.replanAgain')),
        wish, el('div', { class: 'row' }, rbtn), rlog);
      // 💬 prepare many steps ahead in the Claude app (e.g. overnight, with a scheduled task in Claude Desktop)
      const aheadBox = el('details', { class: 'cg-faq cm-ahead' }, el('summary', {}, '💬 ' + CM('roadmap.map.q.title')),
        Object.assign(document.createElement('noema-roadmap-prepare-ahead'), { account: acc, roadmapId: cid }));
      const gone = () => { close2(); onGone(); };
      b2.append(head('⚙️ ' + (c.title || c.goal), CM('roadmap.map.set.sub', { n: Object.keys(c.nodes).length, date: when(c.created) })),
        el('div', { class: 'noema-form' }, el('label', { class: 'cg-field' }, CM('roadmap.map.new.prepAhead'), pf), el('label', { class: 'cg-field' }, CM('roadmap.map.set.limit'), bud), el('label', { class: 'cg-field' }, CM('roadmap.map.set.aiNew'), prov),
          member ? el('p', { class: 'tiny' }, '👥 ' + CM('roadmap.map.set.member', { who: c.shared.ownerName || CM('roadmap.map.lib.itsOwner') })) : el('label', { class: 'tiny' }, review, ' ' + CM('roadmap.map.set.review')),
          el('label', { class: 'tiny' }, pause, ' ' + CM('roadmap.map.set.pause')), keysBox(acc), aheadBox, member ? null : replanBox),
        el('div', { class: 'row noema-ovfoot' },
          el('button', { class: 'btn primary cm-savesettings', onclick: () => { const cur = C().get(acc, cid); cur.prefetch = +pf.value; cur.nodeBudget = Math.max(1, +bud.value || 8); cur.provider = prov.value; cur.autoApprove = !review.checked;
            if (cur.provider !== 'claudeapp') for (const n of Object.values(cur.nodes)) if (n.pack?.status === 'app' && n.pack.auto) n.pack = { ...n.pack, status: null, queuedAt: null };   // queued ahead for the Claude app → prepared here now
            if (cur.provider === 'claudeapp' && cur.status === 'building') cur.status = 'waiting';
            C().save(acc, cur); G().setPaused(pause.checked); close2(); G().kick(); } }, CM('roadmap.map.ed.save')),
          el('button', { class: 'btn small', onclick: () => exportMap(acc, cid) }, '⬇️ ' + CM('roadmap.map.set.export')),
          member ? el('button', { class: 'btn small ghost cm-leave', onclick: async () => { if (!confirm(CM('roadmap.map.set.leaveConfirm', { title: c.title || c.goal }))) return; await SH().leave(acc, cid); gone(); } }, '↩ ' + CM('roadmap.map.set.leave'))
            : el('button', { class: 'btn small ghost', onclick: async () => { const sh = C().get(acc, cid)?.shared; if (!confirm(CM('roadmap.map.set.deleteConfirm') + (sh && !sh.ended && sh.role === 'owner' ? '\n' + CM('roadmap.map.set.deleteShared') : ''))) return; if (sh && !sh.ended && sh.role === 'owner') await SH().unpublish(acc, cid).catch(e => toast('⚠️ ' + errMsg(e), 5000)); C().remove(acc, cid); gone(); } }, '🗑 ' + CM('roadmap.map.delete')),
          el('button', { class: 'btn small', onclick: close2 }, CM('roadmap.map.close'))));
    });
  }

  return { create, importMap, progress, planNow, nodeInfo, editStep, attachDialog, attachMany, replanNow, stepSources, setupClaude, settings, exportMap };
})();
