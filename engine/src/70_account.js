/* ===================== Account menu: profile, subjects, backup & restore, cloud ===================== */
const ACC_TABS = ['profile', 'settings', 'subjects', 'backup', 'cloud', 'help'];   // labels: t('acc.<tab>')
/** Collapsible section (closed by default) with an optional status pill and ⓘ tooltip. */
function accSection(icon, title, { status = null, info = null, open = false, body }) {
  const d = h('details', { class: 'accsec', open: open || null },
    h('summary', {}, h('span', { class: 'chev' }, '▸'), h('span', { class: 'grow' }, `${icon} ${title}`), info ? tip(info) : null, status ? h('span', { class: 'pill ' + (status.ok ? 'c' : 'warnpill') }, status.text) : null),
    h('div', { class: 'accsecbody' }, body));
  return d;
}
const fmtBytes = n => n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : n > 1e3 ? Math.round(n / 1e3) + ' KB' : n + ' B';
const fmtWhen = t => t ? new Date(t).toLocaleString() : '—';
function accountSettings() { try { return JSON.parse(Noema.kv.get(Noema.kv.accountKey('settings')) || '{}'); } catch (e) { return {}; } }
function putAccountSettings(patch) { flushSave(); const s = Object.assign(accountSettings(), patch); Noema.kv.set(Noema.kv.accountKey('settings'), JSON.stringify(s)); Object.assign(S.settings, patch); }

function openAccountMenu(tab = 'profile') {
  modal((box, close) => {
    box.classList.add('accbox');
    const body = h('div', { class: 'accbody' });
    const tabs = h('div', { class: 'tabs' });
    const show = t => { tab = t; $$('button', tabs).forEach(b => b.classList.toggle('on', b.dataset.t === t)); body.innerHTML = ''; ACC_VIEWS[t](body, close); };
    ACC_TABS.forEach(k => tabs.append(h('button', { 'data-t': k, onclick: () => show(k) }, t('acc.' + k))));
    const st = Noema.stats.get();
    box.append(h('div', { class: 'acchead' }, h('div', { class: 'accemo' }, ACCOUNT.emoji || '🙂'),
      h('div', { class: 'grow' }, h('h2', {}, ACCOUNT.name), h('div', { class: 'tiny' }, ACCOUNT.kind === 'cloud' ? `☁️ Cloud account · ${ACCOUNT.email}` : '💻 Local profile on this device')),
      h('div', { class: 'accstats' }, h('span', { class: 'chip xp' }, `⭐ ${st.xp} XP total`), h('span', { class: 'chip streak' }, `🔥 ${Noema.stats.streakNow()} day streak`)),
      h('button', { class: 'iconbtn', onclick: close }, '✕')), tabs, body);
    show(tab);
  });
}

const ACC_VIEWS = {
  /** ⚙️ Settings: the AI (Gemini for the tutor, Claude optionally), how the app looks and studies, this subject. */
  settings(body, close) {
    const set = accountSettings(); const CL = window.NoemaClaude; const acc = ACCOUNT.id;
    // — Gemini (the tutor and every in-app AI helper)
    const key = h('input', { type: 'password', value: S.settings.apiKey || '', placeholder: 'AIza…', autocomplete: 'off', 'aria-label': 'Gemini API key' });
    const sel = h('select', { 'aria-label': 'Gemini model' }, ...(S.settings.models.length ? S.settings.models : FALLBACK_MODELS).map(m => h('option', { value: m, selected: m === S.settings.model }, m)));
    const gstat = h('div', { class: 'tiny' }, S.settings.model ? 'Current model: ' + S.settings.model : 'The model is detected on first use.');
    const geminiBox = h('div', {},
      !S.settings.apiKey ? h('div', { class: 'callout warn' }, h('span', { class: 'ci' }, '🔑'), h('b', { class: 't' }, 'No Gemini key yet — the AI tutor is off'), h('div', {}, 'It is free and takes 2 minutes. ', h('button', { class: 'linkish', onclick: () => openGuide('gemini') }, 'Show me how'))) : null,
      h('div', { class: 'field' }, h('label', {}, 'Gemini API key ', tip('Your personal key from Google AI Studio (free). Used only for calls from this app straight to Google. Never shared with other profiles or users.')), key, h('div', { class: 'tiny' }, ACCOUNT.kind === 'cloud' ? 'Stored only in this browser. Add it once on each device.' : 'Stored only in this browser, for this profile.')),
      h('div', { class: 'field' }, h('label', {}, 'Gemini model'), sel,
        h('div', { class: 'row' },
          h('button', { class: 'btn small', onclick: async () => { S.settings.apiKey = key.value.trim(); gstat.textContent = 'Detecting…'; try { const ms = await detectModels(); sel.innerHTML = ''; ms.forEach(m => sel.append(h('option', { value: m, selected: m === S.settings.model }, m))); gstat.textContent = `Found ${ms.length} models · picked ${S.settings.model}`; } catch (e) { gstat.textContent = '⚠️ ' + e.message; } } }, '🔍 Detect models'),
          h('button', { class: 'btn small', onclick: async () => { S.settings.apiKey = key.value.trim(); S.settings.model = sel.value; save(); gstat.textContent = 'Testing…'; try { const t = await gemini({ contents: [{ role: 'user', parts: [{ text: 'Reply with exactly: Brick is ready 🦉' }] }], temperature: 0 }); gstat.textContent = '✅ ' + t.trim().slice(0, 80); } catch (e) { gstat.textContent = '⚠️ ' + e.message; } } }, '🧪 Test')),
        gstat));
    // — Claude (optional): the API key for ✨ Create with Claude and curricula; never synced
    const ckey = h('input', { type: 'password', value: CL ? CL.Key.get(acc) : '', placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Claude API key' });
    const remember = h('input', { type: 'checkbox', checked: CL ? (CL.Key.remembered(acc) || !CL.Key.get(acc)) : true });
    const jgetA = (k, d) => { try { const v = Noema.kv.get(Noema.kv.accountKey(k)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
    const cmodel = h('select', { 'aria-label': 'Claude model' }, h('option', { value: '' }, 'Newest Sonnet (recommended)'));
    const savedModel = jgetA('claudeModel', ''); if (savedModel) cmodel.append(h('option', { value: savedModel, selected: true }, savedModel));
    const cbudget = h('input', { type: 'number', min: 1, step: 1, value: jgetA('claudeBudget', 15), style: { width: '90px' }, 'aria-label': 'Spending limit per subject' });
    const nbudget = h('input', { type: 'number', min: 1, step: 1, value: set.curBudget || 8, style: { width: '90px' }, 'aria-label': 'Spending limit per curriculum step' });
    const curProv = h('select', { 'aria-label': 'AI for new curricula' }, ...[['', 'Recommended (the Claude app for cloud accounts)'], ['claudeapp', '💬 Claude app — your Claude plan'], ['auto', 'Automatic — an API key here'], ['claude', 'Claude — API key'], ['gemini', 'Gemini — free key']].map(([v, l]) => h('option', { value: v, selected: (set.curProvider || '') === v }, l)));
    const cstat = h('div', { class: 'tiny' });
    const checkClaude = async () => {
      const k = ckey.value.trim();
      if (!k) { CL.Key.forget(acc); cstat.textContent = 'No Claude key on this device.'; return true; }
      if (!CL.Key.looksValid(k)) { cstat.textContent = '⚠️ That is not a Claude API key (it starts with sk-ant-).'; return false; }
      cstat.textContent = '⏳ Checking…';
      try { const ms = await CL.models(k); const cur = cmodel.value; cmodel.innerHTML = ''; cmodel.append(h('option', { value: '' }, 'Newest Sonnet (recommended) — ' + CL.defaultModel(ms)), ...ms.map(m => h('option', { value: m.id, selected: m.id === cur }, m.name))); CL.Key.set(acc, k, remember.checked); cstat.textContent = '✅ The key works.' + (remember.checked ? ' Remembered on this device only (never sent to the noema-lite cloud, not in backups).' : ' Kept until you close this tab.'); return true; }
      catch (e) { cstat.textContent = '❌ ' + e.message; return false; }
    };
    const claude = !CL ? h('p', { class: 'tiny' }, 'This installation has no Claude module.') : h('div', {},
      h('p', { class: 'tiny' }, 'Optional. Claude builds subjects from your sources (✨ Create with Claude) and curricula. With your Claude plan you need no key here — use the Claude app with the noema-lite connector (ways B and C). A key is for way A: everything runs here, paid per use.'),
      h('div', { class: 'field' }, h('label', {}, 'Claude API key ', tip('From the Claude Console (platform.claude.com → API keys). It stays in this browser: never uploaded to the noema-lite cloud, not part of backups. Leave it empty to remove it.')), ckey,
        h('label', { class: 'row tiny' }, remember, 'Remember it on this device (untick on a shared computer)'),
        h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: checkClaude }, '✔️ Check the key'), CL.Key.get(acc) ? h('button', { class: 'btn small ghost', onclick: () => { CL.Key.forget(acc); ckey.value = ''; cstat.textContent = '🗑 Removed from this device.'; } }, 'Remove the key') : null), cstat),
      h('div', { class: 'field' }, h('label', {}, 'Claude model ', tip('“Sonnet” gives very good courses for its price; “Opus” is the strongest and costs more; “Haiku” is cheaper but weaker. Check the key to list the models your key can use.')), cmodel),
      h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', {}, 'Limit per subject ($)'), cbudget), h('div', { class: 'field' }, h('label', {}, 'Limit per curriculum step ($)'), nbudget)),
      h('div', { class: 'field' }, h('label', {}, 'AI for new curricula ', tip('Preselected when you create or import a curriculum. The Claude app (your Claude plan) is usually the cheapest for curricula; an API key or Gemini runs everything here.')), curProv),
      h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: () => { close(); Noema.claudeGuide(); } }, '✨ Create a subject with Claude'), h('button', { class: 'btn small', onclick: () => openAccountMenu('help') }, '❓ How to set up Claude (A · B · C)')));
    if (CL && CL.Key.get(acc)) setTimeout(checkClaude, 0);
    // — display & studying
    const theme = h('select', { 'aria-label': 'Theme' }, ...[['auto', 'Auto (system)'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => h('option', { value: v, selected: S.settings.theme === v }, l)));
    const goal = h('input', { type: 'number', min: 20, step: 10, value: S.settings.goal, 'aria-label': 'Daily XP goal' });
    const snd = h('input', { type: 'checkbox', checked: S.settings.sound });
    const chunk = h('input', { type: 'checkbox', checked: S.settings.chunk });
    const uiL = h('select', { 'aria-label': t('set.uiLang') }, h('option', { value: '', selected: !S.settings.lang }, t('set.uiLangAuto', { lang: NoemaI18n.LANGS.find(l => l[0] === NoemaI18n.browser())?.[1] })),
      ...NoemaI18n.LANGS.map(([v, l]) => h('option', { value: v, selected: S.settings.lang === v }, l)));
    const chatL = chatLangSelect({ persist: false });
    const langBox = h('div', {}, h('div', { class: 'field' }, h('label', {}, 'Language of the AI conversations ', tip('The tutor (all its modes), the 💡 explanations, the feedback on your answers and the titles of your conversations are written in this language. The course material is NOT changed or translated: it stays in its own language on every screen.')), chatL,
      h('div', { class: 'tiny' }, `The course material stays in its own language (${SUBJ.title}: ${langName(COURSE_LANG)}). You can also switch it in the tutor (🗣 next to the topic).`)));
    const display = h('div', {}, h('div', { class: 'row' }, h('div', { class: 'field' }, h('label', {}, 'Theme'), theme), h('div', { class: 'field' }, h('label', {}, 'Daily XP goal'), goal)),
      h('div', { class: 'field' }, h('label', {}, t('set.uiLang') + ' ', tip(t('set.uiLangTip'))), uiL),
      h('label', { class: 'row', style: { margin: '8px 0' } }, snd, 'Sound effects'),
      h('label', { class: 'row', style: { margin: '8px 0' } }, chunk, 'Bite-size reading (reveal theory chunk by chunk)'));
    const subject = h('div', { class: 'row' },
      h('button', { class: 'btn small', onclick: () => show('backup') }, '💾 Backup & restore…'),
      h('button', { class: 'btn small', onclick: () => confirmBox(`Reset your progress in ${SUBJ.title}? (a restore point is kept)`, async () => { await Noema.backup.restorePoint(ACCOUNT.id, 'Before reset of ' + SUBJ.title); const st = S.settings; for (const k of Object.keys(S)) delete S[k]; Object.assign(S, { xp: 0, read: {}, res: {}, pb: {}, fc: {}, boss: {}, last: null, resetAt: Date.now(), settings: st }); flushSave(); close(); route(); renderTopStats(); }) }, `🗑️ Reset ${SUBJ.title} progress`));
    const show = t => openAccountMenu(t);
    const hasClaude = !!(CL && CL.Key.get(acc));
    body.append(
      accSection('🤖', 'Gemini — the AI tutor', { status: { ok: !!S.settings.apiKey, text: S.settings.apiKey ? 'key set' : 'no key' }, open: !S.settings.apiKey, body: geminiBox }),
      accSection('✨', 'Claude (optional)', { status: { ok: true, text: hasClaude ? 'API key on this device' : 'Claude app / no key' }, info: 'Claude makes subjects and curricula: with your Claude plan in the Claude app (no key needed here), or with an API key in this app.', body: claude }),
      accSection('🗣️', 'Language of the AI conversations', { status: { ok: true, text: chatLang() ? langName(chatLang()) : 'as the course' }, body: langBox }),
      accSection('🎨', 'Display & studying', { open: !!S.settings.apiKey, body: display }),
      accSection('📘', 'This subject — ' + SUBJ.title, { body: subject }),
      h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '16px' } },
        h('button', { class: 'btn primary', onclick: async () => {
          S.settings.apiKey = key.value.trim(); S.settings.model = sel.value; S.settings.theme = theme.value; S.settings.goal = Math.max(20, +goal.value || 120); S.settings.sound = snd.checked; S.settings.chunk = chunk.checked; S.settings.chatLang = chatL.value; const relabel = (S.settings.lang || '') !== uiL.value; S.settings.lang = uiL.value || undefined; save();
          putAccountSettings({ curProvider: curProv.value || undefined, curBudget: Math.max(1, +nbudget.value || 8) });
          if (CL) { Noema.kv.set(Noema.kv.accountKey('claudeBudget'), JSON.stringify(Math.max(1, +cbudget.value || 15))); if (cmodel.value) Noema.kv.set(Noema.kv.accountKey('claudeModel'), JSON.stringify(cmodel.value)); else Noema.kv.del(Noema.kv.accountKey('claudeModel'));
            if ((ckey.value.trim() || '') !== CL.Key.get(acc) || remember.checked !== CL.Key.remembered(acc)) { if (!(await checkClaude())) return; } }
          if (relabel) { flushSave(); location.reload(); return; }   // the menus are drawn once: show them in the new language
          applyTheme(); close(); route(); renderTopStats(); toast('Saved ✔');
        } }, 'Save settings')));
  },

  profile(body, close) {
    const set = accountSettings();
    const name = h('input', { value: ACCOUNT.name, maxlength: 30 });
    const emoji = h('input', { value: ACCOUNT.emoji || '🙂', maxlength: 4, style: { width: '80px', textAlign: 'center', fontSize: '22px' } });
    const learner = h('textarea', { class: 'answer', style: { minHeight: '90px' }, placeholder: 'e.g. I have ADHD and learn best when challenged; I already know X; I prepare for exam Y…' }, set.learner || ACCOUNT.learner || '');
    const ask = h('input', { type: 'checkbox', checked: set.askSubjectOnStart ?? Noema.config.askSubjectOnStart });
    const pin = h('input', { type: 'password', inputmode: 'numeric', maxlength: 8, placeholder: ACCOUNT.pin ? 'New PIN (empty = keep)' : 'Optional PIN' });
    const bySub = Object.entries(Noema.stats.get().bySubject || {}).sort((a, b) => b[1] - a[1]);
    body.append(
      h('div', { class: 'row' }, h('div', { class: 'field grow' }, h('label', {}, 'Name'), name), h('div', { class: 'field' }, h('label', {}, 'Emoji'), emoji)),
      h('div', { class: 'field' }, h('label', {}, 'About me (the tutor adapts to this, in every subject) ', tip('Write how you learn, what you already know and your goal. It is added to every tutor conversation, in every subject. Stays private to this profile.')), learner),
      h('label', { class: 'row', style: { margin: '8px 0' } }, ask, 'Show the subject picker every time I open the app'),
      ACCOUNT.kind === 'local' ? h('div', { class: 'field' }, h('label', {}, 'PIN (a privacy curtain on a shared device — not encryption)'), h('div', { class: 'row' }, pin, ACCOUNT.pin ? h('button', { class: 'btn small', onclick: () => { Noema.saveLocalAccount({ ...ACCOUNT, pin: null }); toast('PIN removed'); } }, 'Remove PIN') : null)) : null,
      bySub.length ? h('div', { class: 'field' }, h('label', {}, 'XP by subject'), h('div', { class: 'row' }, ...bySub.map(([sid, xp]) => h('span', { class: 'pill' }, `${sid}: ${xp}`)))) : null,
      h('div', { class: 'row', style: { marginTop: '14px' } },
        h('button', { class: 'btn primary', onclick: async () => {
          const patch = { name: name.value.trim() || ACCOUNT.name, emoji: emoji.value.trim() || ACCOUNT.emoji };
          putAccountSettings({ learner: learner.value.trim(), askSubjectOnStart: ask.checked });
          if (ACCOUNT.kind === 'local') { const a = { ...ACCOUNT, ...patch }; if (pin.value) a.pin = await (async () => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(a.id + ':' + pin.value)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); })(); Noema.saveLocalAccount(a); }
          else { try { await NoemaCloud.saveProfile({ ...patch, learner: learner.value.trim() }); } catch (e) { toast('⚠️ ' + e.message); } }
          toast('Saved ✔ — reloading'); setTimeout(() => location.reload(), 600);
        } }, 'Save profile'),
        h('button', { class: 'btn', onclick: () => { close(); Noema.openSubjectPicker(); } }, '📚 Switch subject'),
        h('button', { class: 'btn', onclick: () => { close(); Noema.openAccountPicker(); } }, '👥 Switch profile')),
      ACCOUNT.kind === 'local' ? h('div', { class: 'dangerzone' }, h('b', {}, 'Danger zone'),
        h('p', { class: 'tiny' }, 'Deleting removes this profile and all its data from this browser. A backup file is downloaded first.'),
        h('button', { class: 'btn small', onclick: () => confirmBox(`Delete profile “${ACCOUNT.name}” and all its data on this device?`, async () => {
          Noema.backup.download(await Noema.backup.collect(ACCOUNT.id, { includeSecrets: false }));
          Noema.wipeAccountData(ACCOUNT.id); Noema.removeLocalAccount(ACCOUNT.id); Noema.jset('noema1:current', {}); setTimeout(() => location.reload(), 800);
        }) }, '🗑️ Delete this profile')) : null);
  },

  async subjects(body) {
    const list = await Noema.subjectsFor(ACCOUNT.id);
    const set = accountSettings(); const hidden = new Set(set.hiddenSubjects || []);
    const CU = window.NoemaCurriculum, on = id => CU?.stepsOf ? CU.stepsOf(ACCOUNT.id, id).length : 0;   // 📦 how many curriculum steps a subject teaches (none: 📚 on the Shelf)
    body.append(h('p', { class: 'muted' }, 'Choose which subjects appear in your picker. Library subjects are shared; imported packs belong only to this profile.'),
      CU ? h('p', { class: 'tiny' }, '🧭 The way to study is a curriculum: each of its steps is taught by a subject. The subjects on no step wait on your 📚 Shelf — study them from there, or put them on a map (🧭 Put on a map…).') : null,
      h('div', { class: 'sublist' }, ...list.map(s => h('div', { class: 'subrow' },
        h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: !hidden.has(s.id), onchange: e => { e.target.checked ? hidden.delete(s.id) : hidden.add(s.id); putAccountSettings({ hiddenSubjects: [...hidden] }); } }), h('i')),
        h('span', { style: { fontSize: '22px' } }, s.emoji || '📘'),
        h('div', { class: 'grow' }, h('b', {}, s.title), h('div', { class: 'tiny' }, `${s.origin === 'library' ? 'Library' : s.origin === 'private' ? '🔒 Private (folder)' : '📥 Imported'} · ${s.counts?.chapters ?? '?'} chapters · ${s.counts?.exercises ?? '?'} exercises${CU ? (on(s.id) ? ` · 🧭 on ${on(s.id)} curriculum step${on(s.id) === 1 ? '' : 's'}` : ' · 📚 on the Shelf') : ''}`)),
        s.id === SUBJ.id ? h('span', { class: 'pill c' }, 'open') : h('button', { class: 'btn small', onclick: () => Noema.switchTo(ACCOUNT.id, s.id) }, 'Open'),
        h('button', { class: 'iconbtn', title: 'Rename, describe or delete', 'aria-label': 'Edit ' + s.title, onclick: () => Noema.editSubject(s, { onChange: () => openAccountMenu('subjects') }) }, '✏️'),
        s.origin !== 'library' ? h('button', { class: 'iconbtn', title: 'Share or make public', onclick: () => Noema.share(s) }, '🔗') : null))),
      h('div', { class: 'row', style: { marginTop: '14px' } },
        h('button', { class: 'btn ai', onclick: () => Noema.claudeGuide() }, '✨ Create a subject with Claude'),
        CU && Noema.openShelf ? h('button', { class: 'btn', onclick: () => Noema.openShelf(ACCOUNT.id) }, '📚 Open the Shelf') : null,
        h('label', { class: 'btn' }, '📥 Import subject pack…', h('input', { type: 'file', accept: '.json,.noemapack', style: { display: 'none' }, onchange: async e => { try { const s = await Noema.importPackFile(ACCOUNT.id, e.target.files[0]); confirmBox(`Open “${s.title}” now?`, () => Noema.switchTo(ACCOUNT.id, s.id)); } catch (er) { toast('⚠️ ' + er.message, 4000); } } })),
        h('button', { class: 'btn', onclick: () => Noema.exportPackage(ACCOUNT.id, Noema.pack) }, `⬇️ Export “${SUBJ.title}” (package with its source files)`)));
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
      if (!fsSupported) { fsBox.append(h('p', { class: 'tiny' }, 'This browser cannot write to folders (needs Chrome, Edge or Brave). Use “Download backup”, or a cloud account.'), guideBtn('backupFolder', '📁 How folder backups work')); return; }
      if (!hd) { fsBox.append(guideBody('backupFolder', { compact: true }), h('button', { class: 'btn primary', onclick: async () => { try { const n = await Noema.autoBackup.choose(ACCOUNT.id); toast(`✅ Auto-backup → ${n}`); drawFs(); } catch (e) { if (e.name !== 'AbortError') toast('⚠️ ' + e.message); } } }, '📁 Choose backup folder')); return; }
      const ok = await Noema.autoBackup.permitted(hd);
      fsBox.append(h('div', { class: 'row' }, h('span', { class: 'pill ' + (ok ? 'c' : 'warnpill') }, ok ? `✅ On → 📁 ${hd.name}` : `⏸️ Paused — permission needed for 📁 ${hd.name}`),
        ok ? h('button', { class: 'btn small', onclick: async () => { await Noema.autoBackup.run(ACCOUNT.id, true); toast('💾 Backed up to folder'); drawFs(); } }, 'Back up now') : h('button', { class: 'btn small primary', onclick: async () => { if (await Noema.autoBackup.permitted(hd, true)) { Noema.autoBackup.start(ACCOUNT.id); await Noema.autoBackup.run(ACCOUNT.id, true); toast('✅ Auto-backup resumed'); } drawFs(); } }, 'Resume'),
        h('button', { class: 'btn small ghost', onclick: async () => { await Noema.autoBackup.disable(ACCOUNT.id); drawFs(); } }, 'Turn off')),
        h('div', { class: 'tiny', style: { marginTop: '6px' } }, `Last folder backup: ${fmtWhen(Noema.jget(`noema1:${ACCOUNT.id}:meta:lastFolderBackup`, 0))} · writes backups/ and conversations/ inside 📁 ${hd.name}`));
    };
    const drawRP = async () => {
      rpBox.innerHTML = '';
      const pts = await Noema.backup.listRestorePoints(ACCOUNT.id);
      if (!pts.length) { rpBox.append(h('p', { class: 'tiny' }, 'No restore points yet. One is created automatically before every restore or reset.')); return; }
      pts.forEach(p => rpBox.append(h('div', { class: 'subrow' }, h('div', { class: 'grow' }, h('b', {}, p.label), h('div', { class: 'tiny' }, `${fmtWhen(p.at)} · ${fmtBytes(p.size)}`)),
        h('button', { class: 'btn small', onclick: async () => Noema.backup.download(await Noema.backup.getRestorePoint(p.key)) }, '⬇️'),
        h('button', { class: 'btn small', onclick: () => confirmBox('Go back to this restore point? (your current state becomes a new restore point)' + (ACCOUNT.kind === 'cloud' ? ' Your other devices go back to it too.' : ''), async () => { await Noema.backup.apply(await Noema.backup.getRestorePoint(p.key), ACCOUNT.id, 'replace'); toast('Restored ✔ — reloading'); setTimeout(() => location.reload(), 700); }) }, 'Restore'))));
    };
    const pts0 = await Noema.backup.listRestorePoints(ACCOUNT.id);
    const nConv = (await Noema.convos.list(ACCOUNT.id)).length;
    const lastDl = Noema.jget(`noema1:${ACCOUNT.id}:meta:lastDownloadBackup`, 0);
    body.append(
      h('p', { class: 'tiny', style: { margin: '0 0 10px' } }, `Everything below is optional. ${nConv} AI conversation${nConv === 1 ? ' is' : 's are'} saved automatically in this browser${ACCOUNT.kind === 'cloud' ? ' and in your cloud account' : ''}.`),
      accSection('⬇️', 'Download a backup', { status: lastDl ? { ok: true, text: 'last ' + new Date(lastDl).toLocaleDateString() } : null,
        info: 'One JSON file with everything of this profile: progress in every subject, flashcard schedules, all AI conversations (canonical format), settings and imported packs. Keep it anywhere; restore it here or on another device.',
        body: [h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: async () => { flushSave(); Noema.backup.download(await Noema.backup.collect(ACCOUNT.id, { includeSecrets: inc.checked })); } }, '💾 Download backup'), h('label', { class: 'row tiny' }, inc, 'include my Gemini API key', tip('Off by default so a backup file you share or store somewhere can’t leak your key.')))] }),
      accSection('📁', 'Automatic backups to a folder', { status: !fsSupported ? { ok: false, text: 'not in this browser' } : hd0 ? (ok0 ? { ok: true, text: 'on' } : { ok: false, text: 'paused' }) : { ok: false, text: 'off' },
        info: 'Chrome/Edge can write into a folder you choose: a backup every few minutes + every AI conversation as .json and .md. Choose a folder inside Google Drive or iCloud Drive for an automatic off-site copy.', body: fsBox }),
      accSection('⬆️', 'Restore from a backup file', { info: 'Replace = exact copy of the backup. Merge = keep what you have, the backup wins where both have the same item. New profile = restore side by side without touching this profile. A restore point is created first, so you can always undo.',
        body: [h('p', { class: 'tiny' }, 'Also accepts the “Export progress” file of the old single-file Databricks Quest.'),
          h('label', { class: 'btn' }, '📂 Choose backup file…', h('input', { type: 'file', accept: '.json', style: { display: 'none' }, onchange: async e => {
            let obj; try { obj = Noema.backup.validate(JSON.parse(await e.target.files[0].text())); } catch (er) { toast('⚠️ ' + er.message, 4000); return; }
            modal((b, c2) => b.append(h('h3', {}, 'Restore backup'), h('p', { class: 'muted' }, `From “${obj.account.name}” · ${fmtWhen(obj.createdAt)} · ${Object.keys(obj.data).length} items · ${(obj.conversations || []).length} conversations`),
              ACCOUNT.kind === 'cloud' ? h('p', { class: 'tiny' }, 'Replace and Merge change your account on all your devices, not only this one. A restore point of how things are now is kept on this device first, so you can undo it.') : null,
              h('div', { style: { display: 'grid', gap: '8px' } },
                h('button', { class: 'btn primary', onclick: async () => { c2(); await Noema.backup.apply(obj, ACCOUNT.id, 'replace'); toast('Restored ✔ — reloading'); setTimeout(() => location.reload(), 700); } }, `♻️ Replace ${ACCOUNT.name}'s data with it`),
                h('button', { class: 'btn', onclick: async () => { c2(); await Noema.backup.apply(obj, ACCOUNT.id, 'merge'); toast('Merged ✔ — reloading'); setTimeout(() => location.reload(), 700); } }, '🔀 Merge into this profile (backup wins on conflicts)'),
                h('button', { class: 'btn', onclick: async () => { c2(); const base = (obj.account.name || 'Restored') + ' (restored)'; const id = (base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'restored') + '-' + Date.now().toString(36).slice(-4); Noema.saveLocalAccount({ id, name: base, emoji: obj.account.emoji || '♻️', created: Date.now() }); await Noema.backup.apply(obj, id, 'replace'); Noema.switchTo(id, null); } }, '➕ Restore as a new local profile'),
                h('button', { class: 'btn ghost', onclick: c2 }, 'Cancel'))));
          } })), guideBtn('restore', '♻️ How restoring works')] }),
      accSection('🕘', 'Restore points on this device', { status: { ok: true, text: String(pts0.length) }, info: 'Automatic safety copies kept in this browser (last 12): one is made before every restore, reset or profile copy.', body: rpBox }));
    drawFs(); drawRP();
  },

  async cloud(body, close) {
    if (!Noema.config.supabaseUrl || !window.NoemaCloud) {
      body.append(h('div', { class: 'callout warn' }, h('span', { class: 'ci' }, '☁️'), h('b', { class: 't' }, 'Cloud sync is not set up for this installation yet'), h('div', {}, 'Optional. Without it, everything still works on this device; use folder backups to stay safe.')),
        accSection('🛠️', 'Set up the cloud (owner, once)', { open: true, body: guideBody('cloudOwner', { compact: true }) }),
        accSection('🐙', 'Keep the repository on GitHub', { body: guideBody('github', { compact: true }) }));
      return;
    }
    const sess = NoemaCloud.session();
    if (!sess) {
      body.append(h('p', {}, 'Sign in to a cloud account to study from any device. Your data stays private to your account.'), h('button', { class: 'btn ai', onclick: () => { close(); Noema.openAccountPicker(); } }, '☁️ Sign in / create account'),
        accSection('☁️', 'How cloud accounts work', { body: guideBody('cloudUser', { compact: true }) }), accSection('👥', 'Invite friends', { body: guideBody('friends', { compact: true }) }));
      return;
    }
    if (ACCOUNT.kind !== 'cloud') {
      body.append(h('p', {}, `You are signed in to the cloud as ${sess.user.email}, but you are using the local profile “${ACCOUNT.name}”.`),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => Noema.switchTo('u_' + sess.user.id, SUBJ.id) }, 'Switch to my cloud account'),
          h('button', { class: 'btn', onclick: () => confirmBox(`Copy all of “${ACCOUNT.name}” into your cloud account? (cloud data with the same keys is overwritten; a cloud snapshot is taken first)`, async () => {
            const target = 'u_' + sess.user.id; await NoemaCloud.snapshot('Before copying local profile ' + ACCOUNT.name).catch(() => { });
            await Noema.backup.apply(await Noema.backup.collect(ACCOUNT.id, { includeSecrets: true }), target, 'merge');
            const keys = Object.keys(Noema.kv.accountData(target)); const mt = Noema.jget(`noema1:${target}:meta:mtime`, {}); keys.forEach(k => mt[k] = Date.now()); Noema.jset(`noema1:${target}:meta:mtime`, mt);
            toast('Copied — switching to your cloud account'); Noema.switchTo(target, SUBJ.id);
          }) }, '⬆️ Copy this profile into my cloud account')));
      return;
    }
    const stBox = h('div');
    const drawSt = () => { const s = NoemaCloud.status(); stBox.innerHTML = ''; stBox.append(h('div', { class: 'row' }, h('span', { class: 'pill ' + (s.error ? '' : 'c') }, s.error ? '⚠️ ' + s.error : s.syncing ? '🔄 Syncing…' : `✅ Synced ${s.lastSync ? new Date(s.lastSync).toLocaleTimeString() : ''}`), s.pending ? h('span', { class: 'pill' }, `${s.pending} change(s) waiting`) : null)); };
    NoemaCloud.onStatus(drawSt); drawSt();
    const snapBox = h('div');
    const drawSnaps = async () => {
      snapBox.innerHTML = '';
      let list = []; try { list = await NoemaCloud.listSnapshots(); } catch (e) { snapBox.append(h('p', { class: 'tiny' }, '⚠️ ' + e.message)); return; }
      if (!list.length) snapBox.append(h('p', { class: 'tiny' }, 'No snapshots yet.'));
      list.forEach(sn => snapBox.append(h('div', { class: 'subrow' }, h('div', { class: 'grow' }, h('b', {}, sn.label), h('div', { class: 'tiny' }, `${fmtWhen(sn.created_at)} · ${fmtBytes(sn.size_bytes || 0)}`)),
        h('button', { class: 'btn small', onclick: async () => Noema.backup.download(await NoemaCloud.getSnapshot(sn.id)) }, '⬇️'),
        h('button', { class: 'btn small', onclick: () => confirmBox('Restore your account to this snapshot? All your devices go back to it, and anything newer is removed from them too. A snapshot of how things are now is taken first, so you can undo this.', async () => { await NoemaCloud.snapshot('Before restoring a snapshot'); await Noema.backup.apply(await NoemaCloud.getSnapshot(sn.id), ACCOUNT.id, 'replace'); await NoemaCloud.push(ACCOUNT.id).catch(() => { }); toast('Restored ✔ — reloading'); setTimeout(() => location.reload(), 900); }) }, 'Restore'),
        h('button', { class: 'iconbtn', onclick: async () => { await NoemaCloud.deleteSnapshot(sn.id); drawSnaps(); } }, '🗑️'))));
    };
    body.append(h('p', { class: 'tiny' }, `Signed in as ${sess.user.email}. Progress, conversations and settings sync automatically; a daily snapshot is kept (last 30).`), stBox,
      h('div', { class: 'row', style: { margin: '10px 0' } },
        h('button', { class: 'btn', onclick: async () => { try { await NoemaCloud.push(ACCOUNT.id); const n = await NoemaCloud.pull(ACCOUNT.id); toast(n ? `Pulled ${n} change(s) — reloading` : 'Up to date ✔'); if (n) setTimeout(() => location.reload(), 800); } catch (e) { toast('⚠️ ' + e.message); } } }, '🔄 Sync now'),
        h('button', { class: 'btn', onclick: async () => { try { await NoemaCloud.snapshot('Manual snapshot'); toast('📸 Snapshot saved'); drawSnaps(); } catch (e) { toast('⚠️ ' + e.message); } } }, '📸 Take snapshot'),
        h('label', { class: 'btn' }, '🗄️ Upload database backup…', h('input', { type: 'file', accept: '.db,.sqlite,.gz,.zip,.json', style: { display: 'none' }, onchange: async e => { try { await NoemaCloud.uploadFile('db', e.target.files[0]); toast('☁️ Database backup uploaded'); } catch (er) { toast('⚠️ ' + er.message, 4000); } } })),
        h('button', { class: 'btn ghost', onclick: async () => { await NoemaCloud.push(ACCOUNT.id).catch(() => { }); await NoemaCloud.signOut(); Noema.jset('noema1:current', {}); location.reload(); } }, 'Sign out')),
      accSection('🩺', 'Check the cloud connection', { info: 'Runs a real round trip with your account — progress, conversations, snapshots, files, Explore, sharing — and cleans up after itself. Use it after updating the database or when something does not sync.', body: selfTestBox() }),
      accSection('📸', 'Cloud snapshots', { open: true, info: 'Restore points of your whole account stored in the cloud: one automatic per day (last 30) + any you take manually.', body: snapBox }),
      accSection('👥', 'Invite friends', { body: guideBody('friends', { compact: true }) }));
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
      r.append(h('span', { class: 'sti' }, st.running ? '⏳' : st.ok ? '✅' : '❌'), h('b', {}, st.name), st.ms != null ? h('span', { class: 'tiny' }, ` ${st.ms} ms ${st.note ? '· ' + st.note : ''}`) : null,
        st.error ? h('div', { class: 'tiny' }, '⚠️ ' + st.error) : null, st.hint ? h('div', { class: 'tiny sthint' }, '👉 ' + st.hint) : null);
    });
    const bad = res.filter(r => !r.ok).length;
    list.append(h('div', { class: 'fb ' + (bad ? 'bad' : 'ok') }, bad ? `${bad} check(s) failed — follow the 👉 hints.` : 'Everything works with the real cloud ✔'));
    run.disabled = false;
  } }, '🩺 Run the check');
  box.append(h('p', { class: 'tiny' }, 'Takes a few seconds. Nothing of yours is changed: test data is deleted right away.'), run, list);
  return box;
}

ACC_VIEWS.help = function (body) {
  const st = setupStatus();
  const state = { gemini: st.gemini, backupFolder: !!Noema.jget(`noema1:${ACCOUNT.id}:meta:lastFolderBackup`, 0), cloudUser: ACCOUNT.kind === 'cloud', cloudOwner: !!Noema.config.supabaseUrl, claude: !!window.NoemaClaude?.Key.get(ACCOUNT.id) };
  body.append(h('p', { class: 'tiny', style: { margin: '0 0 10px' } }, 'Step-by-step guides. Everything here is optional — the app works fully on one device without any of it.'),
    ...Object.entries(GUIDES).map(([id, g]) => {
      if (id !== 'claude' || !Noema.claudeSetupView) return accSection(g.icon, g.title, { status: id in state ? (state[id] ? { ok: true, text: 'done' } : { ok: false, text: 'not set up' }) : null, body: guideBody(id) });
      // ✨ Set up Claude: the same numbered steps as in “Create with Claude” (both ways), built when opened
      const holder = h('div', { class: 'claudesetup' });
      const sec = accSection(g.icon, g.title, { status: state.claude ? { ok: true, text: 'API key here' } : null, body: h('div', {}, guideBody(id), holder) });
      sec.addEventListener('toggle', () => { if (sec.open && !holder.firstChild) holder.append(Noema.claudeSetupView(ACCOUNT.id)); });
      return sec;
    }));
};

/* ---------- sync indicator ---------- */
function wireSyncDot() {
  const dot = $('#syncdot'); if (!dot) return;
  if (ACCOUNT.kind !== 'cloud' || !window.NoemaCloud) { dot.remove(); return; }
  const paint = s => { dot.className = 'syncdot ' + (s.error ? 'err' : s.syncing || s.pending ? 'busy' : 'ok'); dot.title = s.error ? 'Sync error: ' + s.error : s.syncing ? 'Syncing…' : s.pending ? 'Changes waiting to sync' : 'All changes synced'; };
  NoemaCloud.onStatus(paint); paint(NoemaCloud.status());
}
