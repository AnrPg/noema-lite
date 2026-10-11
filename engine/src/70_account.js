/* ===================== Account menu: profile, subjects, backup & restore, cloud ===================== */
const ACC_TABS = ['profile', 'settings', 'subjects', 'backup', 'cloud', 'help'];   // labels: t('acc.<tab>')   // i18n-ignore
/** Collapsible section (closed by default) with an optional status pill and ⓘ tooltip. */
function accSection(icon, title, { status = null, info = null, open = false, body }) {
  const d = h('details', { class: 'accsec', open: open || null },
    h('summary', {}, h('span', { class: 'chev' }, '▸'), h('span', { class: 'grow' }, `${icon} ${title}`), info ? tip(info) : null, status ? h('span', { class: 'pill ' + (status.ok ? 'c' : 'warnpill') }, status.text) : null),
    h('div', { class: 'accsecbody' }, body));
  return d;
}
const fmtBytes = n => n > 1e6 ? tE('engine.common.sizeMB', { size: window.NoemaI18n?.fmt ? NoemaI18n.fmt.number(n / 1e6, { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : (n / 1e6).toFixed(1) }) : n > 1e3 ? tE('engine.common.sizeKB', { size: nf(Math.round(n / 1e3)) }) : tE('engine.common.sizeB', { size: nf(n) });
/** A moment / a day / a time of day in the UI language (the same fields the browser's toLocale…String() shows). */
const WHEN_DAY = { year: 'numeric', month: 'numeric', day: 'numeric' }, WHEN_TIME = { hour: 'numeric', minute: '2-digit', second: '2-digit' };
const fmtWhen = t => t ? (window.NoemaI18n?.fmt ? NoemaI18n.fmt.date(t, { ...WHEN_DAY, ...WHEN_TIME }) : new Date(t).toLocaleString()) : '—';
const fmtDay = t => window.NoemaI18n?.fmt ? NoemaI18n.fmt.date(t, WHEN_DAY) : new Date(t).toLocaleDateString();
const fmtTime = t => window.NoemaI18n?.fmt ? NoemaI18n.fmt.time(t, WHEN_TIME) : new Date(t).toLocaleTimeString();
/** A language's name in the UI language (Intl.DisplayNames), for the learner; langName() keeps the English one for the prompts. */
const uiLangName = code => window.NoemaI18n?.fmt?.langName ? NoemaI18n.fmt.langName(code) : langName(code);
/** A restore point's name in the UI language of now: its catalog key (k, p) when it has one, else the words it was saved with. */
const storedLabel = x => x.k && window.NoemaI18n?.has(x.k) ? tE(x.k, x.p || {}) : x.label;
/** A cloud snapshot's name: the app's own snapshots are stored with fixed English names (matched by engine/cloud.js too) → the UI language;
    any other name (older snapshots taken in another language, self-tests) as stored. */
const SNAP_LABEL = { 'Manual snapshot': 'engine.cl.snapManual', 'Daily auto-snapshot': 'engine.cl.snapDaily' };   // i18n-ignore (stored names)
const snapLabel = l => Object.prototype.hasOwnProperty.call(SNAP_LABEL, l) ? tE(SNAP_LABEL[l]) : l;
function accountSettings() { try { return JSON.parse(Noema.kv.get(Noema.kv.accountKey('settings')) || '{}'); } catch (e) { return {}; } }
function putAccountSettings(patch) { flushSave(); const s = Object.assign(accountSettings(), patch); Noema.kv.set(Noema.kv.accountKey('settings'), JSON.stringify(s)); Object.assign(S.settings, patch); }

const ME_PAGE = { profile: 'profile', settings: 'ai', subjects: 'subjects', backup: 'data', cloud: 'data', help: 'help' };
function openAccountMenu(tab = 'profile') {
  if (SHL()) { closeTutor(); $$('.modal').forEach(m => m.remove()); return go('#/me/' + (ME_PAGE[tab] || '')); }   // the shell's “Me” pages (engine/shell.js)
  modal((box, close) => {
    box.classList.add('accbox');
    const body = h('div', { class: 'accbody' });
    const tabs = h('div', { class: 'tabs' });
    const show = t => { tab = t; $$('button', tabs).forEach(b => b.classList.toggle('on', b.dataset.t === t)); body.innerHTML = ''; ACC_VIEWS[t](body, close); };
    ACC_TABS.forEach(k => tabs.append(h('button', { 'data-t': k, onclick: () => show(k) }, t('acc.' + k))));
    const st = Noema.stats.get();
    box.append(h('div', { class: 'acchead' }, h('div', { class: 'accemo' }, ACCOUNT.emoji || '🙂'),
      h('div', { class: 'grow' }, h('h2', {}, ACCOUNT.name), h('div', { class: 'tiny' }, ACCOUNT.kind === 'cloud' ? '☁️ ' + tE('engine.acc.cloudAccount', { email: ACCOUNT.email }) : '💻 ' + tE('engine.acc.localProfile'))),
      h('div', { class: 'accstats' }, h('span', { class: 'chip xp' }, '⭐ ' + tE('engine.acc.xpTotal', { n: st.xp })), h('span', { class: 'chip streak' }, '🔥 ' + tE('engine.acc.streak', { n: Noema.stats.streakNow() }))),
      h('button', { class: 'iconbtn', onclick: close }, '✕')), tabs, body);
    show(tab);
  });
}

/** A subject's name for people: its title, else the Roadmap step it was made for, else its id made readable ("cur-bq29at-prerequisite-round-1-storage-tables-k8jn" → "Prerequisite round 1 storage tables"). */
function subjectLabel(sid, list = []) {
  const m = list.find(s => s.id === sid); if (m?.title) return m.title;
  if (sid === SUBJ.id) return SUBJ.title;
  const st = window.NoemaCurriculum?.stepsOf?.(ACCOUNT.id, sid)?.[0]; if (st?.c.nodes[st.nid]?.title) return st.c.nodes[st.nid].title;
  const w = String(sid).replace(/^cur-[a-z0-9]+-/, '').replace(/-[a-z0-9]{4}$/, '').replace(/[-_]+/g, ' ').trim();
  return w ? w[0].toUpperCase() + w.slice(1) : sid;
}
const ACC_VIEWS = {
  /** ⚙️ Settings: the AI (Gemini for the tutor, Claude optionally), how the app looks and studies, this subject. */
  /** opts.only = 'ai': just the AI sections (the shell has its own page for language and appearance). */
  settings(body, close, opts = {}) {
    const set = accountSettings(); const CL = window.NoemaClaude; const acc = ACCOUNT.id;
    // — Gemini (the tutor and every in-app AI helper)
    const key = h('input', { type: 'password', value: S.settings.apiKey || '', placeholder: 'AIza…', autocomplete: 'off', 'aria-label': tE('engine.acc.geminiKey') });   // i18n-ignore (the shape of a key)
    const sel = h('select', { 'aria-label': tE('engine.acc.geminiModel') }, ...(S.settings.models.length ? S.settings.models : FALLBACK_MODELS).map(m => h('option', { value: m, selected: m === S.settings.model }, m)));
    const gstat = h('div', { class: 'tiny' }, S.settings.model ? tE('engine.acc.currentModel', { model: S.settings.model }) : tE('engine.acc.modelOnFirstUse'));
    const geminiBox = h('div', {},
      !S.settings.apiKey ? h('div', { class: 'callout warn' }, h('span', { class: 'ci' }, '🔑'), h('b', { class: 't' }, tE('engine.acc.noGeminiKey')), h('div', {}, tE('engine.acc.freeTwoMin') + ' ', h('button', { class: 'linkish', onclick: () => openGuide('gemini') }, tE('engine.acc.showMeHow')))) : null,
      h('div', { class: 'field' }, h('label', {}, tE('engine.acc.geminiKey') + ' ', tip(tE('engine.acc.geminiKeyTip'))), key, h('div', { class: 'tiny' }, ACCOUNT.kind === 'cloud' ? tE('engine.acc.keyStoredCloud') : tE('engine.acc.keyStoredLocal'))),
      h('div', { class: 'field' }, h('label', {}, tE('engine.acc.geminiModel')), sel,
        h('div', { class: 'row' },
          h('button', { class: 'btn small', onclick: async () => { S.settings.apiKey = key.value.trim(); gstat.textContent = tE('engine.acc.detecting'); try { const ms = await detectModels(); sel.innerHTML = ''; ms.forEach(m => sel.append(h('option', { value: m, selected: m === S.settings.model }, m))); gstat.textContent = tE('engine.acc.foundModels', { n: ms.length, model: S.settings.model }); } catch (e) { gstat.textContent = '⚠️ ' + errText(e); } } }, '🔍 ' + tE('engine.acc.detectModels')),
          h('button', { class: 'btn small', onclick: async () => { S.settings.apiKey = key.value.trim(); S.settings.model = sel.value; save(); gstat.textContent = tE('engine.acc.testing'); try { const t = await gemini({ contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: ' + tE('engine.acc.testReply') }] }], temperature: 0 }); gstat.textContent = '✅ ' + t.trim().slice(0, 80); } catch (e) { gstat.textContent = '⚠️ ' + errText(e); } } }, '🧪 ' + tE('engine.acc.test'))),   // i18n-ignore (a prompt)
        gstat));
    // — Claude (optional): the API key for ✨ Create with Claude and curricula; never synced
    const ckey = h('input', { type: 'password', value: CL ? CL.Key.get(acc) : '', placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: 'false', 'aria-label': tE('engine.acc.claudeKey') });   // i18n-ignore (the shape of a key)
    const remember = h('input', { type: 'checkbox', checked: CL ? (CL.Key.remembered(acc) || !CL.Key.get(acc)) : true });
    const jgetA = (k, d) => { try { const v = Noema.kv.get(Noema.kv.accountKey(k)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
    const cmodel = h('select', { 'aria-label': tE('engine.acc.claudeModel') }, h('option', { value: '' }, tE('engine.acc.newestSonnet')));
    const savedModel = jgetA('claudeModel', ''); if (savedModel) cmodel.append(h('option', { value: savedModel, selected: true }, savedModel));
    const cbudget = h('input', { type: 'number', min: 1, step: 1, value: jgetA('claudeBudget', 15), style: { width: '90px' }, 'aria-label': tE('engine.acc.limitSubjectAria') });
    const nbudget = h('input', { type: 'number', min: 1, step: 1, value: set.curBudget || 8, style: { width: '90px' }, 'aria-label': tE('engine.acc.limitStepAria') });
    const curProv = h('select', { 'aria-label': tE('engine.acc.curAI') }, ...[['', tE('engine.acc.prov_rec')], ['claudeapp', '💬 ' + tE('engine.acc.prov_claudeapp')], ['auto', tE('engine.acc.prov_auto')], ['claude', tE('engine.acc.prov_claude')], ['gemini', tE('engine.acc.prov_gemini')]].map(([v, l]) => h('option', { value: v, selected: (set.curProvider || '') === v }, l)));
    const cstat = h('div', { class: 'tiny' });
    const checkClaude = async () => {
      const k = ckey.value.trim();
      if (!k) { CL.Key.forget(acc); cstat.textContent = tE('engine.acc.noClaudeKey'); return true; }
      if (!CL.Key.looksValid(k)) { cstat.textContent = '⚠️ ' + tE('engine.acc.notClaudeKey'); return false; }
      cstat.textContent = '⏳ ' + tE('engine.acc.checking');
      try { const ms = await CL.models(k); const cur = cmodel.value; cmodel.innerHTML = ''; cmodel.append(h('option', { value: '' }, tE('engine.acc.newestSonnet') + ' — ' + CL.defaultModel(ms)), ...ms.map(m => h('option', { value: m.id, selected: m.id === cur }, m.name))); CL.Key.set(acc, k, remember.checked); cstat.textContent = '✅ ' + (remember.checked ? tE('engine.acc.keyWorksRemembered') : tE('engine.acc.keyWorksTab')); return true; }
      catch (e) { cstat.textContent = '❌ ' + errText(e); return false; }
    };
    const claude = !CL ? h('p', { class: 'tiny' }, tE('engine.acc.noClaudeModule')) : h('div', {},
      h('p', { class: 'tiny' }, tE('engine.acc.claudeIntro')),
      h('div', { class: 'field' }, h('label', {}, tE('engine.acc.claudeKey') + ' ', tip(tE('engine.acc.claudeKeyTip'))), ckey,
        h('label', { class: 'row tiny' }, remember, tE('engine.acc.remember')),
        h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: checkClaude }, '✔️ ' + tE('engine.acc.checkKey')), CL.Key.get(acc) ? h('button', { class: 'btn small ghost', onclick: () => { CL.Key.forget(acc); ckey.value = ''; cstat.textContent = '🗑 ' + tE('engine.acc.keyRemoved'); } }, tE('engine.acc.removeKey')) : null), cstat),
      h('div', { class: 'field' }, h('label', {}, tE('engine.acc.claudeModel') + ' ', tip(tE('engine.acc.claudeModelTip'))), cmodel),
      h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', {}, tE('engine.acc.limitSubject')), cbudget), h('div', { class: 'field' }, h('label', {}, tE('engine.acc.limitStep')), nbudget)),
      h('div', { class: 'field' }, h('label', {}, tE('engine.acc.curAI') + ' ', tip(tE('engine.acc.curAITip'))), curProv),
      h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => { close(); Noema.claudeGuide(); } }, '✨ ' + tE('engine.acc.createWithClaude')), h('button', { class: 'btn small', onclick: () => openAccountMenu('help') }, '❓ ' + tE('engine.acc.howClaude'))));
    if (CL && CL.Key.get(acc)) setTimeout(checkClaude, 0);
    // — display & studying
    const theme = h('select', { 'aria-label': tE('engine.acc.theme') }, ...[['auto', tE('engine.acc.themeAuto')], ['light', tE('engine.acc.themeLight')], ['dark', tE('engine.acc.themeDark')]].map(([v, l]) => h('option', { value: v, selected: S.settings.theme === v }, l)));
    const goal = h('input', { type: 'number', min: 20, step: 10, value: S.settings.goal, 'aria-label': tE('engine.acc.goal') });
    const snd = h('input', { type: 'checkbox', checked: S.settings.sound });
    const chunk = h('input', { type: 'checkbox', checked: S.settings.chunk });
    const uiL = h('select', { 'aria-label': t('set.uiLang') }, h('option', { value: '', selected: !S.settings.lang }, t('set.uiLangAuto', { lang: NoemaI18n.LOCALES.find(l => l.tag === NoemaI18n.browser())?.name })),
      ...NoemaI18n.LOCALES.filter(l => NoemaI18n.available().includes(l) || l.tag === S.settings.lang).map(l => h('option', { value: l.tag, selected: S.settings.lang === l.tag, lang: l.tag }, `${l.name} · ${l.tag}`)));
    const chatL = chatLangSelect({ persist: false });
    const langBox = h('div', {}, h('div', { class: 'field' }, h('label', {}, tE('engine.acc.chatLang') + ' ', tip(tE('engine.acc.chatLangTip'))), chatL,
      h('div', { class: 'tiny' }, tE('engine.acc.chatLangNote', { title: SUBJ.title, lang: uiLangName(COURSE_LANG) }))));
    const display = h('div', {}, h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', {}, tE('engine.acc.theme')), theme), h('div', { class: 'field' }, h('label', {}, tE('engine.acc.goal')), goal)),
      h('div', { class: 'field' }, h('label', {}, t('set.uiLang') + ' ', tip(t('set.uiLangTip'))), uiL),
      h('label', { class: 'row', style: { margin: '8px 0' } }, snd, tE('engine.acc.sound')),
      h('label', { class: 'row', style: { margin: '8px 0' } }, chunk, tE('engine.acc.chunk')));
    const subject = h('div', { class: 'row' },
      h('button', { class: 'btn small', onclick: () => show('backup') }, '💾 ' + tE('engine.acc.backupBtn')),
      h('button', { class: 'btn small', onclick: () => confirmBox(tE('engine.home.resetConfirm', { title: SUBJ.title }), async () => { await Noema.backup.restorePoint(ACCOUNT.id, tE('engine.home.resetPoint', { title: SUBJ.title }), { k: 'engine.home.resetPoint', p: { title: SUBJ.title } }); const st = S.settings; for (const k of Object.keys(S)) delete S[k]; Object.assign(S, { xp: 0, read: {}, res: {}, pb: {}, fc: {}, boss: {}, last: null, resetAt: Date.now(), settings: st }); flushSave(); close(); route(); renderTopStats(); }) }, '🗑️ ' + tE('engine.acc.resetBtn', { title: SUBJ.title })));
    const show = t => openAccountMenu(t);
    const hasClaude = !!(CL && CL.Key.get(acc));
    body.append(
      accSection('🤖', tE('engine.acc.secGemini'), { status: { ok: !!S.settings.apiKey, text: S.settings.apiKey ? tE('engine.acc.keySet') : tE('engine.acc.noKey') }, open: !S.settings.apiKey, body: geminiBox }),
      accSection('✨', tE('engine.acc.secClaude'), { status: { ok: true, text: hasClaude ? tE('engine.acc.claudeOnDevice') : tE('engine.acc.claudeAppNoKey') }, info: tE('engine.acc.secClaudeInfo'), body: claude }),
      accSection('🗣️', tE('engine.acc.chatLang'), { status: { ok: true, text: chatLang() ? uiLangName(chatLang()) : tE('engine.acc.chatLangAuto', { lang: uiLangName(uiLang()) }) }, body: langBox }),
      opts.only === 'ai' ? null : accSection('🎨', tE('engine.acc.secDisplay'), { open: !!S.settings.apiKey, body: display }),
      opts.only === 'ai' || !window.NoemaMT ? null : accSection('🌐', t('mt.set.title'), { body: NoemaMT.panel(acc, { heading: false }) }),   // machine translation of shared texts: consent, provider, caps (engine/mt.js, docs/i18n.md §11) — like Me › Language & appearance
      opts.only === 'ai' ? null : accSection('📘', tE('engine.acc.secSubject', { title: SUBJ.title }), { body: subject }),
      h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '16px' } },
        h('button', { class: 'btn primary', 'data-act': 'save-settings', onclick: async () => {
          S.settings.apiKey = key.value.trim(); S.settings.model = sel.value; S.settings.theme = theme.value; S.settings.goal = Math.max(20, +goal.value || 120); S.settings.sound = snd.checked; S.settings.chunk = chunk.checked; S.settings.chatLang = chatL.value; const relabel = (S.settings.lang || '') !== uiL.value; S.settings.lang = uiL.value || undefined; save();
          putAccountSettings({ curProvider: curProv.value || undefined, curBudget: Math.max(1, +nbudget.value || 8) });
          if (CL) { Noema.kv.set(Noema.kv.accountKey('claudeBudget'), JSON.stringify(Math.max(1, +cbudget.value || 15))); if (cmodel.value) Noema.kv.set(Noema.kv.accountKey('claudeModel'), JSON.stringify(cmodel.value)); else Noema.kv.del(Noema.kv.accountKey('claudeModel'));
            if ((ckey.value.trim() || '') !== CL.Key.get(acc) || remember.checked !== CL.Key.remembered(acc)) { if (!(await checkClaude())) return; } }
          if (relabel) { flushSave(); location.reload(); return; }   // the menus are drawn once: show them in the new language
          applyTheme(); close(); route(); renderTopStats(); toast(tE('engine.acc.saved'));
        } }, tE('engine.acc.saveSettings'))));
  },

  profile(body, close) {
    const set = accountSettings();
    const name = h('input', { value: ACCOUNT.name, maxlength: 30 });
    const emoji = h('input', { value: ACCOUNT.emoji || '🙂', maxlength: 4, style: { width: '80px', textAlign: 'center', fontSize: '22px' } });
    const learner = h('textarea', { class: 'answer', style: { minHeight: '90px' }, placeholder: tE('engine.acc.learnerPh') }, set.learner || ACCOUNT.learner || '');
    const ask = h('input', { type: 'checkbox', checked: set.askSubjectOnStart ?? Noema.config.askSubjectOnStart });
    const pin = h('input', { type: 'password', inputmode: 'numeric', maxlength: 8, placeholder: ACCOUNT.pin ? tE('engine.acc.newPin') : tE('engine.acc.optPin') });
    const bySub = Object.entries(Noema.stats.get().bySubject || {}).sort((a, b) => b[1] - a[1]);
    // each chip names its subject (a Roadmap step's subject by its step), never by its id
    const xpChips = bySub.map(([sid, xp]) => h('span', { class: 'pill', 'data-sid': sid }, tE('engine.acc.xpChip', { title: subjectLabel(sid), n: xp })));
    Noema.subjectsFor(ACCOUNT.id).then(list => xpChips.forEach(c => { c.textContent = tE('engine.acc.xpChip', { title: subjectLabel(c.dataset.sid, list), n: bySub.find(x => x[0] === c.dataset.sid)[1] }); })).catch(() => { });
    body.append(
      h('div', { class: 'row' }, h('div', { class: 'field grow' }, h('label', {}, tE('engine.acc.name')), name), h('div', { class: 'field' }, h('label', {}, tE('engine.acc.emoji')), emoji)),
      h('div', { class: 'field' }, h('label', {}, tE('engine.acc.aboutMe') + ' ', tip(tE('engine.acc.aboutMeTip'))), learner),
      h('label', { class: 'row', style: { margin: '8px 0' } }, ask, tE('engine.acc.askOnStart')),
      ACCOUNT.kind === 'local' ? h('div', { class: 'field' }, h('label', {}, tE('engine.acc.pin')), h('div', { class: 'row' }, pin, ACCOUNT.pin ? h('button', { class: 'btn small', onclick: () => { Noema.saveLocalAccount({ ...ACCOUNT, pin: null }); toast(tE('engine.acc.pinRemoved')); } }, tE('engine.acc.removePin')) : null)) : null,
      bySub.length ? h('div', { class: 'field' }, h('label', {}, tE('engine.acc.xpBySubject')), h('div', { class: 'row' }, ...xpChips)) : null,
      h('div', { class: 'row', style: { marginTop: '14px' } },
        h('button', { class: 'btn primary', onclick: async () => {
          const patch = { name: name.value.trim() || ACCOUNT.name, emoji: emoji.value.trim() || ACCOUNT.emoji };
          putAccountSettings({ learner: learner.value.trim(), askSubjectOnStart: ask.checked });
          if (ACCOUNT.kind === 'local') { const a = { ...ACCOUNT, ...patch }; if (pin.value) a.pin = await (async () => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(a.id + ':' + pin.value)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); })(); Noema.saveLocalAccount(a); }
          else { try { await NoemaCloud.saveProfile({ ...patch, learner: learner.value.trim() }); } catch (e) { toast('⚠️ ' + errText(e)); } }
          toast(tE('engine.acc.savedReloading')); setTimeout(() => location.reload(), 600);
        } }, tE('engine.acc.saveProfile')),
        h('button', { class: 'btn', onclick: () => { close(); Noema.openSubjectPicker(); } }, '📚 ' + t('top.switchSubject')),
        h('button', { class: 'btn', onclick: () => { close(); Noema.openAccountPicker(); } }, '👥 ' + tE('engine.acc.switchProfile'))),
      ACCOUNT.kind === 'local' ? h('div', { class: 'dangerzone' }, h('b', {}, tE('engine.acc.danger')),
        h('p', { class: 'tiny' }, tE('engine.acc.deleteNote')),
        h('button', { class: 'btn small', onclick: () => confirmBox(tE('engine.acc.deleteConfirm', { name: ACCOUNT.name }), async () => {
          Noema.backup.download(await Noema.backup.collect(ACCOUNT.id, { includeSecrets: false }));
          Noema.wipeAccountData(ACCOUNT.id); Noema.removeLocalAccount(ACCOUNT.id); Noema.jset('noema1:current', {}); setTimeout(() => location.reload(), 800);
        }) }, '🗑️ ' + tE('engine.acc.deleteProfile'))) : null);
  },

  async subjects(body) {
    const list = await Noema.subjectsFor(ACCOUNT.id);
    const set = accountSettings(); const hidden = new Set(set.hiddenSubjects || []);
    const CU = window.NoemaCurriculum, on = id => CU?.stepsOf ? CU.stepsOf(ACCOUNT.id, id).length : 0;   // 📦 how many curriculum steps a subject teaches (none: 📚 on the Shelf)
    body.append(h('p', { class: 'muted' }, tE('engine.acc.subjIntro')),
      CU ? h('p', { class: 'tiny' }, '🧭 ' + tE('engine.acc.subjRoadmap')) : null,
      h('div', { class: 'sublist' }, ...list.map(s => h('div', { class: 'subrow' },
        h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: !hidden.has(s.id), onchange: e => { e.target.checked ? hidden.delete(s.id) : hidden.add(s.id); putAccountSettings({ hiddenSubjects: [...hidden] }); } }), h('i')),
        h('span', { style: { fontSize: '22px' } }, s.emoji || '📘'),
        h('div', { class: 'grow' }, h('b', {}, s.title), h('div', { class: 'tiny' }, [s.origin === 'library' ? tE('engine.acc.originLibrary') : s.origin === 'private' ? '🔒 ' + tE('engine.acc.originPrivate') : '📥 ' + tE('engine.acc.originImported'), tE('engine.acc.subjCounts', { c: s.counts?.chapters ?? '?', e: s.counts?.exercises ?? '?' }), ...(CU ? [on(s.id) ? '🧭 ' + tE('engine.acc.onSteps', { n: on(s.id) }) : '📚 ' + tE('engine.acc.onShelf')] : [])].join(' · '))),
        s.id === SUBJ.id ? h('span', { class: 'pill c' }, tE('engine.acc.isOpen')) : h('button', { class: 'btn small', onclick: () => Noema.switchTo(ACCOUNT.id, s.id) }, tE('engine.acc.open')),
        h('button', { class: 'iconbtn', title: tE('engine.acc.editTip'), 'aria-label': tE('engine.acc.editAria', { title: s.title }), onclick: () => Noema.editSubject(s, { onChange: () => openAccountMenu('subjects') }) }, '✏️'),
        s.origin !== 'library' ? h('button', { class: 'iconbtn', title: tE('engine.acc.shareTip'), onclick: () => Noema.share(s) }, '🔗') : null))),
      h('div', { class: 'row', style: { marginTop: '14px' } },
        h('button', { class: 'btn ai', onclick: () => Noema.claudeGuide() }, '✨ ' + tE('engine.acc.createWithClaude')),
        CU && Noema.openShelf ? h('button', { class: 'btn', onclick: () => Noema.openShelf(ACCOUNT.id) }, '📚 ' + tE('engine.acc.openShelf')) : null,
        h('label', { class: 'btn' }, '📥 ' + tE('engine.acc.importPack'), h('input', { type: 'file', accept: '.json,.noemapack', style: { display: 'none' }, onchange: async e => { try { const s = await Noema.importPackFile(ACCOUNT.id, e.target.files[0]); confirmBox(tE('engine.share.openNow', { title: s.title }), () => Noema.switchTo(ACCOUNT.id, s.id)); } catch (er) { toast('⚠️ ' + errText(er), 4000); } } })),
        h('button', { class: 'btn', onclick: () => Noema.exportPackage(ACCOUNT.id, Noema.pack) }, '⬇️ ' + tE('engine.acc.exportPackage', { title: SUBJ.title }))));
  },

  async backup(body) {
    const inc = h('input', { type: 'checkbox' });
    const fsSupported = Noema.autoBackup.supported();
    const fsBox = h('div'); const rpBox = h('div');
    const hd0 = fsSupported ? await Noema.autoBackup.handle(ACCOUNT.id) : null;
    const ok0 = hd0 ? await Noema.autoBackup.permitted(hd0) : false;
    const drawFs = async () => {
      fsBox.innerHTML = '';
      const hd = await Noema.autoBackup.handle(ACCOUNT.id);
      if (!fsSupported) { fsBox.append(h('p', { class: 'tiny' }, tE('engine.bk.noFolders')), guideBtn('backupFolder', '📁 ' + tE('engine.bk.howFolders'))); return; }
      if (!hd) { fsBox.append(guideBody('backupFolder', { compact: true }), h('button', { class: 'btn primary', onclick: async () => { try { const n = await Noema.autoBackup.choose(ACCOUNT.id); toast('✅ ' + tE('engine.bk.autoTo', { folder: n })); drawFs(); } catch (e) { if (e.name !== 'AbortError') toast('⚠️ ' + errText(e)); } } }, '📁 ' + tE('engine.bk.chooseFolder'))); return; }
      const ok = await Noema.autoBackup.permitted(hd);
      fsBox.append(h('div', { class: 'row' }, h('span', { class: 'pill ' + (ok ? 'c' : 'warnpill') }, ok ? '✅ ' + tE('engine.bk.onFolder', { folder: hd.name }) : '⏸️ ' + tE('engine.bk.pausedFolder', { folder: hd.name })),
        ok ? h('button', { class: 'btn small', onclick: async () => { await Noema.autoBackup.run(ACCOUNT.id, true); toast('💾 ' + tE('engine.bk.backedUp')); drawFs(); } }, tE('engine.bk.backUpNow')) : h('button', { class: 'btn small primary', onclick: async () => { if (await Noema.autoBackup.permitted(hd, true)) { Noema.autoBackup.start(ACCOUNT.id); await Noema.autoBackup.run(ACCOUNT.id, true); toast('✅ ' + tE('engine.bk.resumed')); } drawFs(); } }, tE('engine.bk.resume')),
        h('button', { class: 'btn small ghost', onclick: async () => { await Noema.autoBackup.disable(ACCOUNT.id); drawFs(); } }, tE('engine.bk.turnOff'))),
        h('div', { class: 'tiny', style: { marginTop: '6px' } }, tE('engine.bk.lastFolder', { when: fmtWhen(Noema.jget(`noema1:${ACCOUNT.id}:meta:lastFolderBackup`, 0)), folder: hd.name })));
    };
    const drawRP = async () => {
      rpBox.innerHTML = '';
      const pts = await Noema.backup.listRestorePoints(ACCOUNT.id);
      if (!pts.length) { rpBox.append(h('p', { class: 'tiny' }, tE('engine.bk.noPoints'))); return; }
      pts.forEach(p => rpBox.append(h('div', { class: 'subrow' }, h('div', { class: 'grow' }, h('b', {}, storedLabel(p)), h('div', { class: 'tiny' }, `${fmtWhen(p.at)} · ${fmtBytes(p.size)}`)),
        h('button', { class: 'btn small', onclick: async () => Noema.backup.download(await Noema.backup.getRestorePoint(p.key)) }, '⬇️'),
        h('button', { class: 'btn small', onclick: () => confirmBox(tE(ACCOUNT.kind === 'cloud' ? 'engine.bk.goBackCloud' : 'engine.bk.goBack'), async () => { await Noema.backup.apply(await Noema.backup.getRestorePoint(p.key), ACCOUNT.id, 'replace'); toast(tE('engine.bk.restored')); setTimeout(() => location.reload(), 700); }) }, tE('engine.bk.restore')))));
    };
    const pts0 = await Noema.backup.listRestorePoints(ACCOUNT.id);
    const nConv = (await Noema.convos.list(ACCOUNT.id)).length;
    const lastDl = Noema.jget(`noema1:${ACCOUNT.id}:meta:lastDownloadBackup`, 0);
    body.append(
      h('p', { class: 'tiny', style: { margin: '0 0 10px' } }, tE(ACCOUNT.kind === 'cloud' ? 'engine.bk.introCloud' : 'engine.bk.intro', { n: nConv })),
      accSection('⬇️', tE('engine.bk.secDownload'), { status: lastDl ? { ok: true, text: tE('engine.bk.lastOn', { date: fmtDay(lastDl) }) } : null,
        info: tE('engine.bk.downloadInfo'),
        body: [h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: async () => { flushSave(); Noema.backup.download(await Noema.backup.collect(ACCOUNT.id, { includeSecrets: inc.checked })); } }, '💾 ' + tE('engine.bk.download')), h('label', { class: 'row tiny' }, inc, tE('engine.bk.includeKey'), tip(tE('engine.bk.includeKeyTip'))))] }),
      accSection('📁', tE('engine.bk.secFolder'), { status: !fsSupported ? { ok: false, text: tE('engine.bk.notInBrowser') } : hd0 ? (ok0 ? { ok: true, text: tE('engine.bk.on') } : { ok: false, text: tE('engine.bk.paused') }) : { ok: false, text: tE('engine.bk.off') },
        info: tE('engine.bk.folderInfo'), body: fsBox }),
      accSection('⬆️', tE('engine.bk.secRestore'), { info: tE('engine.bk.restoreInfo'),
        body: [h('p', { class: 'tiny' }, tE('engine.bk.oldFile')),
          h('label', { class: 'btn' }, '📂 ' + tE('engine.bk.chooseFile'), h('input', { type: 'file', accept: '.json', style: { display: 'none' }, onchange: async e => {
            let obj; try { let raw; try { raw = JSON.parse(await e.target.files[0].text()); } catch (pe) { throw new Error(tE('loader.backup.notBackup')); } obj = Noema.backup.validate(raw); } catch (er) { toast('⚠️ ' + errText(er), 4000); return; }   // not JSON at all: the same words as any other file that is not a backup (the parser's English stays out)
            modal((b, c2) => b.append(h('h3', {}, tE('engine.bk.restoreTitle')), h('p', { class: 'muted' }, tE('engine.bk.fileInfo', { name: obj.account.name, when: fmtWhen(obj.createdAt), items: Object.keys(obj.data).length, convs: (obj.conversations || []).length })),
              ACCOUNT.kind === 'cloud' ? h('p', { class: 'tiny' }, tE('engine.bk.cloudWarn')) : null,
              h('div', { style: { display: 'grid', gap: '8px' } },
                h('button', { class: 'btn primary', onclick: async () => { c2(); await Noema.backup.apply(obj, ACCOUNT.id, 'replace'); toast(tE('engine.bk.restored')); setTimeout(() => location.reload(), 700); } }, '♻️ ' + tE('engine.bk.replace', { name: ACCOUNT.name })),
                h('button', { class: 'btn', onclick: async () => { c2(); await Noema.backup.apply(obj, ACCOUNT.id, 'merge'); toast(tE('engine.bk.merged')); setTimeout(() => location.reload(), 700); } }, '🔀 ' + tE('engine.bk.merge')),
                h('button', { class: 'btn', onclick: async () => { c2(); const base = tE('engine.bk.restoredName', { name: obj.account.name || tE('engine.bk.restoredDefault') }); const id = (base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'restored') + '-' + Date.now().toString(36).slice(-4); Noema.saveLocalAccount({ id, name: base, emoji: obj.account.emoji || '♻️', created: Date.now() }); await Noema.backup.apply(obj, id, 'replace'); Noema.switchTo(id, null); } }, '➕ ' + tE('engine.bk.asNew')),   // i18n-ignore
                h('button', { class: 'btn ghost', onclick: c2 }, tE('engine.core.cancel')))));
          } })), guideBtn('restore', '♻️ ' + tE('engine.bk.howRestore'))] }),
      accSection('🕘', tE('engine.bk.secPoints'), { status: { ok: true, text: nf(pts0.length) }, info: tE('engine.bk.pointsInfo'), body: rpBox }));
    drawFs(); drawRP();
  },

  async cloud(body, close) {
    if (!Noema.config.supabaseUrl || !window.NoemaCloud) {
      body.append(h('div', { class: 'callout warn' }, h('span', { class: 'ci' }, '☁️'), h('b', { class: 't' }, tE('engine.cl.notSetUp')), h('div', {}, tE('engine.cl.notSetUpNote'))),
        accSection('🛠️', tE('engine.cl.secOwner'), { open: true, body: guideBody('cloudOwner', { compact: true }) }),
        accSection('🐙', tE('engine.cl.secGithub'), { body: guideBody('github', { compact: true }) }));
      return;
    }
    const sess = NoemaCloud.session();
    if (!sess) {
      body.append(h('p', {}, tE('engine.cl.signInIntro')), h('button', { class: 'btn ai', onclick: () => { close(); Noema.openAccountPicker(); } }, '☁️ ' + tE('engine.cl.signIn')),
        accSection('☁️', tE('engine.cl.secHow'), { body: guideBody('cloudUser', { compact: true }) }), accSection('👥', tE('engine.cl.secFriends'), { body: guideBody('friends', { compact: true }) }));
      return;
    }
    if (ACCOUNT.kind !== 'cloud') {
      body.append(h('p', {}, tE('engine.cl.localWhileSignedIn', { email: sess.user.email, name: ACCOUNT.name })),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => Noema.switchTo('u_' + sess.user.id, SUBJ.id) }, tE('engine.cl.switchToCloud')),
          h('button', { class: 'btn', onclick: () => confirmBox(tE('engine.cl.copyConfirm', { name: ACCOUNT.name }), async () => {
            const target = 'u_' + sess.user.id; await NoemaCloud.snapshot(tE('engine.cl.snapBeforeCopy', { name: ACCOUNT.name })).catch(() => { });
            await Noema.backup.apply(await Noema.backup.collect(ACCOUNT.id, { includeSecrets: true }), target, 'merge');
            const keys = Object.keys(Noema.kv.accountData(target)); const mt = Noema.jget(`noema1:${target}:meta:mtime`, {}); keys.forEach(k => mt[k] = Date.now()); Noema.jset(`noema1:${target}:meta:mtime`, mt);
            toast(tE('engine.cl.copied')); Noema.switchTo(target, SUBJ.id);
          }) }, '⬆️ ' + tE('engine.cl.copyBtn'))));
      return;
    }
    const stBox = h('div');
    const drawSt = () => { const s = NoemaCloud.status(); stBox.innerHTML = ''; stBox.append(h('div', { class: 'row' }, h('span', { class: 'pill ' + (s.error ? '' : 'c') }, s.error ? '⚠️ ' + errText(s.error) : s.syncing ? '🔄 ' + tE('engine.cl.syncing') : '✅ ' + tE('engine.cl.synced', { time: s.lastSync ? fmtTime(s.lastSync) : '' })), s.pending ? h('span', { class: 'pill' }, tE('engine.cl.pending', { n: s.pending })) : null)); };
    NoemaCloud.onStatus(drawSt); drawSt();
    const snapBox = h('div');
    const drawSnaps = async () => {
      snapBox.innerHTML = '';
      let list = []; try { list = await NoemaCloud.listSnapshots(); } catch (e) { snapBox.append(h('p', { class: 'tiny' }, '⚠️ ' + errText(e))); return; }
      if (!list.length) snapBox.append(h('p', { class: 'tiny' }, tE('engine.cl.noSnaps')));
      list.forEach(sn => snapBox.append(h('div', { class: 'subrow' }, h('div', { class: 'grow' }, h('b', {}, snapLabel(sn.label)), h('div', { class: 'tiny' }, `${fmtWhen(sn.created_at)} · ${fmtBytes(sn.size_bytes || 0)}`)),
        h('button', { class: 'btn small', onclick: async () => Noema.backup.download(await NoemaCloud.getSnapshot(sn.id)) }, '⬇️'),
        h('button', { class: 'btn small', onclick: () => confirmBox(tE('engine.cl.restoreSnapConfirm'), async () => { await NoemaCloud.snapshot(tE('engine.cl.snapBeforeRestore')); await Noema.backup.apply(await NoemaCloud.getSnapshot(sn.id), ACCOUNT.id, 'replace'); await NoemaCloud.push(ACCOUNT.id).catch(() => { }); toast(tE('engine.bk.restored')); setTimeout(() => location.reload(), 900); }) }, tE('engine.bk.restore')),
        h('button', { class: 'iconbtn', onclick: async () => { await NoemaCloud.deleteSnapshot(sn.id); drawSnaps(); } }, '🗑️'))));
    };
    body.append(h('p', { class: 'tiny' }, tE('engine.cl.signedInAs', { email: sess.user.email })), stBox,
      h('div', { class: 'row', style: { margin: '10px 0' } },
        h('button', { class: 'btn', onclick: async () => { try { await NoemaCloud.push(ACCOUNT.id); const n = await NoemaCloud.pull(ACCOUNT.id); toast(n ? tE('engine.cl.pulled', { n }) : tE('engine.cl.upToDate')); if (n) setTimeout(() => location.reload(), 800); } catch (e) { toast('⚠️ ' + errText(e)); } } }, '🔄 ' + tE('engine.cl.syncNow')),
        h('button', { class: 'btn', onclick: async () => { try { await NoemaCloud.snapshot(); toast('📸 ' + tE('engine.cl.snapSaved')); drawSnaps(); } catch (e) { toast('⚠️ ' + errText(e)); } } }, '📸 ' + tE('engine.cl.takeSnap')),
        h('label', { class: 'btn' }, '🗄️ ' + tE('engine.cl.uploadDb'), h('input', { type: 'file', accept: '.db,.sqlite,.gz,.zip,.json', style: { display: 'none' }, onchange: async e => { try { await NoemaCloud.uploadFile('db', e.target.files[0]); toast('☁️ ' + tE('engine.cl.dbUploaded')); } catch (er) { toast('⚠️ ' + errText(er), 4000); } } })),
        h('button', { class: 'btn ghost', onclick: async () => { await NoemaCloud.push(ACCOUNT.id).catch(() => { }); await NoemaCloud.signOut(); Noema.jset('noema1:current', {}); location.reload(); } }, tE('engine.cl.signOut'))),
      accSection('🩺', tE('engine.cl.secCheck'), { info: tE('engine.cl.checkInfo'), body: selfTestBox() }),
      accSection('📸', tE('engine.cl.secSnaps'), { open: true, info: tE('engine.cl.snapsInfo'), body: snapBox }),
      accSection('👥', tE('engine.cl.secFriends'), { body: guideBody('friends', { compact: true }) }));
    drawSnaps();
  },
};

function selfTestBox() {
  const box = h('div');
  const list = h('div', { class: 'selftest' });
  const run = h('button', { class: 'btn primary', onclick: async () => {
    run.disabled = true; list.innerHTML = ''; const rows = {};
    const res = await NoemaCloud.selfTest(st => {
      const r = rows[st.name] || (rows[st.name] = list.appendChild(h('div', { class: 'strow' })));
      r.innerHTML = ''; r.className = 'strow ' + (st.running ? 'run' : st.ok ? 'ok' : 'bad');
      r.append(h('span', { class: 'sti' }, st.running ? '⏳' : st.ok ? '✅' : '❌'), h('b', {}, st.name), st.ms != null ? h('span', { class: 'tiny' }, ' ' + tE('engine.cl.ms', { n: st.ms }) + ` ${st.note ? '· ' + st.note : ''}`) : null,
        st.error ? h('div', { class: 'tiny' }, '⚠️ ' + errText(st.error)) : null, st.hint ? h('div', { class: 'tiny sthint' }, '👉 ' + st.hint) : null);
    });
    const bad = res.filter(r => !r.ok).length;
    list.append(h('div', { class: 'fb ' + (bad ? 'bad' : 'ok') }, bad ? tE('engine.cl.checksFailed', { n: bad }) : tE('engine.cl.allWorks')));
    run.disabled = false;
  } }, '🩺 ' + tE('engine.cl.runCheck'));
  box.append(h('p', { class: 'tiny' }, tE('engine.cl.checkNote')), run, list);
  return box;
}

ACC_VIEWS.help = function (body) {
  const st = setupStatus();
  const state = { gemini: st.gemini, backupFolder: !!Noema.jget(`noema1:${ACCOUNT.id}:meta:lastFolderBackup`, 0), cloudUser: ACCOUNT.kind === 'cloud', cloudOwner: !!Noema.config.supabaseUrl, claude: !!window.NoemaClaude?.Key.get(ACCOUNT.id) };
  body.append(h('p', { class: 'tiny', style: { margin: '0 0 10px' } }, tE('engine.help.intro')),
    ...Object.entries(GUIDES).map(([id, g]) => {
      if (id !== 'claude' || !Noema.claudeSetupView) return accSection(g.icon, g.title, { status: id in state ? (state[id] ? { ok: true, text: tE('engine.help.done') } : { ok: false, text: tE('engine.help.notSetUp') }) : null, body: guideBody(id) });
      // ✨ Set up Claude: the same numbered steps as in “Create with Claude” (both ways), built when opened
      const holder = h('div', { class: 'claudesetup' });
      const sec = accSection(g.icon, g.title, { status: state.claude ? { ok: true, text: tE('engine.help.apiKeyHere') } : null, body: h('div', {}, guideBody(id), holder) });
      sec.addEventListener('toggle', () => { if (sec.open && !holder.firstChild) holder.append(Noema.claudeSetupView(ACCOUNT.id)); });
      return sec;
    }));
};

/* ---------- sync indicator ---------- */
function wireSyncDot() {
  if (SHL()) return;   // the shell paints its own (engine/shell.js)
  const dot = $('#syncdot'); if (!dot) return;
  if (ACCOUNT.kind !== 'cloud' || !window.NoemaCloud) { dot.remove(); return; }
  const paint = s => { dot.className = 'syncdot ' + (s.error ? 'err' : s.syncing || s.pending ? 'busy' : 'ok'); dot.title = s.error ? tE('engine.cl.syncError', { error: errText(s.error) }) : s.syncing ? tE('engine.cl.syncing') : s.pending ? tE('engine.cl.waiting') : tE('engine.cl.allSynced'); };
  NoemaCloud.onStatus(paint); paint(NoemaCloud.status());
}
