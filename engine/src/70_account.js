/* ===================== Account menu: profile, subjects, backup & restore, cloud ===================== */
const ACC_TABS = [['profile', '👤 Profile'], ['subjects', '📚 Subjects'], ['backup', '💾 Backup & restore'], ['cloud', '☁️ Cloud']];
const fmtBytes = n => n > 1e6 ? (n / 1e6).toFixed(1) + ' MB' : n > 1e3 ? Math.round(n / 1e3) + ' KB' : n + ' B';
const fmtWhen = t => t ? new Date(t).toLocaleString() : '—';
function accountSettings() { try { return JSON.parse(LQ.kv.get(LQ.kv.accountKey('settings')) || '{}'); } catch (e) { return {}; } }
function putAccountSettings(patch) { flushSave(); const s = Object.assign(accountSettings(), patch); LQ.kv.set(LQ.kv.accountKey('settings'), JSON.stringify(s)); Object.assign(S.settings, patch); }

function openAccountMenu(tab = 'profile') {
  modal((box, close) => {
    box.classList.add('accbox');
    const body = h('div', { class: 'accbody' });
    const tabs = h('div', { class: 'tabs' });
    const show = t => { tab = t; $$('button', tabs).forEach(b => b.classList.toggle('on', b.dataset.t === t)); body.innerHTML = ''; ACC_VIEWS[t](body, close); };
    ACC_TABS.forEach(([k, l]) => tabs.append(h('button', { 'data-t': k, onclick: () => show(k) }, l)));
    const st = LQ.stats.get();
    box.append(h('div', { class: 'acchead' }, h('div', { class: 'accemo' }, ACCOUNT.emoji || '🙂'),
      h('div', { class: 'grow' }, h('h2', {}, ACCOUNT.name), h('div', { class: 'tiny' }, ACCOUNT.kind === 'cloud' ? `☁️ Cloud account · ${ACCOUNT.email}` : '💻 Local profile on this device')),
      h('div', { class: 'accstats' }, h('span', { class: 'chip xp' }, `⭐ ${st.xp} XP total`), h('span', { class: 'chip streak' }, `🔥 ${LQ.stats.streakNow()} day streak`)),
      h('button', { class: 'iconbtn', onclick: close }, '✕')), tabs, body);
    show(tab);
  });
}

const ACC_VIEWS = {
  profile(body, close) {
    const set = accountSettings();
    const name = h('input', { value: ACCOUNT.name, maxlength: 30 });
    const emoji = h('input', { value: ACCOUNT.emoji || '🙂', maxlength: 4, style: { width: '80px', textAlign: 'center', fontSize: '22px' } });
    const learner = h('textarea', { class: 'answer', style: { minHeight: '90px' }, placeholder: 'e.g. I have ADHD and learn best when challenged; I already know X; I prepare for exam Y…' }, set.learner || ACCOUNT.learner || '');
    const ask = h('input', { type: 'checkbox', checked: set.askSubjectOnStart ?? LQ.config.askSubjectOnStart });
    const pin = h('input', { type: 'password', inputmode: 'numeric', maxlength: 8, placeholder: ACCOUNT.pin ? 'New PIN (empty = keep)' : 'Optional PIN' });
    const bySub = Object.entries(LQ.stats.get().bySubject || {}).sort((a, b) => b[1] - a[1]);
    body.append(
      h('div', { class: 'row' }, h('div', { class: 'field grow' }, h('label', {}, 'Name'), name), h('div', { class: 'field' }, h('label', {}, 'Emoji'), emoji)),
      h('div', { class: 'field' }, h('label', {}, 'About me (the tutor adapts to this, in every subject)'), learner),
      h('label', { class: 'row', style: { margin: '8px 0' } }, ask, 'Show the subject picker every time I open the app'),
      ACCOUNT.kind === 'local' ? h('div', { class: 'field' }, h('label', {}, 'PIN (a privacy curtain on a shared device — not encryption)'), h('div', { class: 'row' }, pin, ACCOUNT.pin ? h('button', { class: 'btn small', onclick: () => { LQ.saveLocalAccount({ ...ACCOUNT, pin: null }); toast('PIN removed'); } }, 'Remove PIN') : null)) : null,
      bySub.length ? h('div', { class: 'field' }, h('label', {}, 'XP by subject'), h('div', { class: 'row' }, ...bySub.map(([sid, xp]) => h('span', { class: 'pill' }, `${sid}: ${xp}`)))) : null,
      h('div', { class: 'row', style: { marginTop: '14px' } },
        h('button', { class: 'btn primary', onclick: async () => {
          const patch = { name: name.value.trim() || ACCOUNT.name, emoji: emoji.value.trim() || ACCOUNT.emoji };
          putAccountSettings({ learner: learner.value.trim(), askSubjectOnStart: ask.checked });
          if (ACCOUNT.kind === 'local') { const a = { ...ACCOUNT, ...patch }; if (pin.value) a.pin = await (async () => { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(a.id + ':' + pin.value)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); })(); LQ.saveLocalAccount(a); }
          else { try { await LQCloud.saveProfile({ ...patch, learner: learner.value.trim() }); } catch (e) { toast('⚠️ ' + e.message); } }
          toast('Saved ✔ — reloading'); setTimeout(() => location.reload(), 600);
        } }, 'Save profile'),
        h('button', { class: 'btn', onclick: () => { close(); LQ.openSubjectPicker(); } }, '📚 Switch subject'),
        h('button', { class: 'btn', onclick: () => { close(); LQ.openAccountPicker(); } }, '👥 Switch profile')),
      ACCOUNT.kind === 'local' ? h('div', { class: 'dangerzone' }, h('b', {}, 'Danger zone'),
        h('p', { class: 'tiny' }, 'Deleting removes this profile and all its data from this browser. A backup file is downloaded first.'),
        h('button', { class: 'btn small', onclick: () => confirmBox(`Delete profile “${ACCOUNT.name}” and all its data on this device?`, async () => {
          LQ.backup.download(await LQ.backup.collect(ACCOUNT.id, { includeSecrets: false }));
          LQ.wipeAccountData(ACCOUNT.id); LQ.removeLocalAccount(ACCOUNT.id); LQ.jset('lq1:current', {}); setTimeout(() => location.reload(), 800);
        }) }, '🗑️ Delete this profile')) : null);
  },

  async subjects(body) {
    const list = await LQ.subjectsFor(ACCOUNT.id);
    const set = accountSettings(); const hidden = new Set(set.hiddenSubjects || []);
    body.append(h('p', { class: 'muted' }, 'Choose which subjects appear in your picker. Library subjects are shared; imported packs belong only to this profile.'),
      h('div', { class: 'sublist' }, ...list.map(s => h('div', { class: 'subrow' },
        h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: !hidden.has(s.id), onchange: e => { e.target.checked ? hidden.delete(s.id) : hidden.add(s.id); putAccountSettings({ hiddenSubjects: [...hidden] }); } }), h('i')),
        h('span', { style: { fontSize: '22px' } }, s.emoji || '📘'),
        h('div', { class: 'grow' }, h('b', {}, s.title), h('div', { class: 'tiny' }, `${s.origin === 'library' ? 'Library' : s.origin === 'private' ? '🔒 Private (folder)' : '📥 Imported'} · ${s.counts?.chapters ?? '?'} chapters · ${s.counts?.exercises ?? '?'} exercises`)),
        s.id === SUBJ.id ? h('span', { class: 'pill c' }, 'open') : h('button', { class: 'btn small', onclick: () => LQ.switchTo(ACCOUNT.id, s.id) }, 'Open'),
        s.origin === 'imported' ? h('button', { class: 'iconbtn', title: 'Remove imported pack (progress is kept)', onclick: () => confirmBox(`Remove the imported pack “${s.title}”? Your progress in it is kept.`, async () => { await LQ.idb.del('packs', ACCOUNT.id + '|' + s.id); LQ.kv.del(LQ.kv.accountKey('packmeta:' + s.id)); toast('Removed'); }) }, '🗑️') : null))),
      h('div', { class: 'row', style: { marginTop: '14px' } },
        h('label', { class: 'btn' }, '📥 Import subject pack…', h('input', { type: 'file', accept: '.json,.lqpack', style: { display: 'none' }, onchange: async e => { try { const s = await LQ.importPackFile(ACCOUNT.id, e.target.files[0]); confirmBox(`Open “${s.title}” now?`, () => LQ.switchTo(ACCOUNT.id, s.id)); } catch (er) { toast('⚠️ ' + er.message, 4000); } } })),
        h('button', { class: 'btn', onclick: () => { const p = LQ.pack; const b = new Blob([JSON.stringify(p)], { type: 'application/json' }); const a = h('a', { href: URL.createObjectURL(b), download: `${SUBJ.id}.lqpack.json` }); a.click(); } }, `⬇️ Export “${SUBJ.title}” pack`)));
  },

  async backup(body) {
    const inc = h('input', { type: 'checkbox' });
    const fsSupported = LQ.autoBackup.supported();
    const fsBox = h('div');
    const drawFs = async () => {
      fsBox.innerHTML = '';
      const hd = await LQ.autoBackup.handle(ACCOUNT.id);
      if (!fsSupported) { fsBox.append(h('p', { class: 'tiny' }, 'Automatic folder backups need Chrome, Edge or Brave (File System Access API). In this browser use “Download backup”.')); return; }
      if (!hd) { fsBox.append(h('p', { class: 'tiny' }, `Pick a folder once (suggested: learning-quest/accounts/${ACCOUNT.id}/backups). A backup is written there every ${LQ.config.autoBackupMinutes} minutes when something changed, and when you leave the app.`), h('button', { class: 'btn', onclick: async () => { try { const n = await LQ.autoBackup.choose(ACCOUNT.id); toast(`✅ Auto-backup → ${n}`); drawFs(); } catch (e) { if (e.name !== 'AbortError') toast('⚠️ ' + e.message); } } }, '📁 Choose backup folder')); return; }
      const ok = await LQ.autoBackup.permitted(hd);
      fsBox.append(h('div', { class: 'row' }, h('span', { class: 'pill ' + (ok ? 'c' : '') }, ok ? `✅ Auto-backup on → 📁 ${hd.name}` : `⏸️ Paused — permission needed for 📁 ${hd.name}`),
        ok ? h('button', { class: 'btn small', onclick: async () => { await LQ.autoBackup.run(ACCOUNT.id, true); toast('💾 Backed up to folder'); } }, 'Back up now') : h('button', { class: 'btn small primary', onclick: async () => { if (await LQ.autoBackup.permitted(hd, true)) { LQ.autoBackup.start(ACCOUNT.id); await LQ.autoBackup.run(ACCOUNT.id, true); toast('✅ Auto-backup resumed'); } drawFs(); } }, 'Resume'),
        h('button', { class: 'btn small ghost', onclick: async () => { await LQ.autoBackup.disable(ACCOUNT.id); drawFs(); } }, 'Turn off')),
        h('div', { class: 'tiny', style: { marginTop: '6px' } }, `Last folder backup: ${fmtWhen(LQ.jget(`lq1:${ACCOUNT.id}:meta:lastFolderBackup`, 0))}`));
    };
    const rpBox = h('div');
    const drawRP = async () => {
      rpBox.innerHTML = '';
      const pts = await LQ.backup.listRestorePoints(ACCOUNT.id);
      if (!pts.length) { rpBox.append(h('p', { class: 'tiny' }, 'No restore points yet. One is created automatically before every restore or reset.')); return; }
      pts.forEach(p => rpBox.append(h('div', { class: 'subrow' }, h('div', { class: 'grow' }, h('b', {}, p.label), h('div', { class: 'tiny' }, `${fmtWhen(p.at)} · ${fmtBytes(p.size)}`)),
        h('button', { class: 'btn small', onclick: async () => LQ.backup.download(await LQ.backup.getRestorePoint(p.key)) }, '⬇️'),
        h('button', { class: 'btn small', onclick: () => confirmBox('Go back to this restore point? (your current state becomes a new restore point)', async () => { await LQ.backup.apply(await LQ.backup.getRestorePoint(p.key), ACCOUNT.id, 'replace'); toast('Restored ✔ — reloading'); setTimeout(() => location.reload(), 700); }) }, 'Restore'))));
    };
    body.append(
      h('h3', {}, '⬇️ Download a backup'),
      h('p', { class: 'tiny' }, 'One JSON file with everything of this profile: progress in every subject, flashcard schedules, tutor conversations, settings and imported packs.'),
      h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: async () => { flushSave(); LQ.backup.download(await LQ.backup.collect(ACCOUNT.id, { includeSecrets: inc.checked })); } }, '💾 Download backup'), h('label', { class: 'row tiny' }, inc, 'include my Gemini API key')),
      h('h3', { style: { marginTop: '22px' } }, '📁 Automatic backups to a folder'), fsBox,
      h('h3', { style: { marginTop: '22px' } }, '⬆️ Restore from a backup file'),
      h('p', { class: 'tiny' }, 'Also accepts the “Export progress” file of the old single-file Databricks Quest.'),
      h('label', { class: 'btn' }, '📂 Choose backup file…', h('input', { type: 'file', accept: '.json', style: { display: 'none' }, onchange: async e => {
        let obj; try { obj = LQ.backup.validate(JSON.parse(await e.target.files[0].text())); } catch (er) { toast('⚠️ ' + er.message, 4000); return; }
        modal((b, c2) => b.append(h('h3', {}, 'Restore backup'), h('p', { class: 'muted' }, `From “${obj.account.name}” · ${fmtWhen(obj.createdAt)} · ${Object.keys(obj.data).length} items`),
          h('div', { style: { display: 'grid', gap: '8px' } },
            h('button', { class: 'btn primary', onclick: async () => { c2(); await LQ.backup.apply(obj, ACCOUNT.id, 'replace'); toast('Restored ✔ — reloading'); setTimeout(() => location.reload(), 700); } }, `♻️ Replace ${ACCOUNT.name}'s data with it`),
            h('button', { class: 'btn', onclick: async () => { c2(); await LQ.backup.apply(obj, ACCOUNT.id, 'merge'); toast('Merged ✔ — reloading'); setTimeout(() => location.reload(), 700); } }, '🔀 Merge into this profile (backup wins on conflicts)'),
            h('button', { class: 'btn', onclick: async () => { c2(); const base = (obj.account.name || 'Restored') + ' (restored)'; const id = (base.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'restored') + '-' + Date.now().toString(36).slice(-4); LQ.saveLocalAccount({ id, name: base, emoji: obj.account.emoji || '♻️', created: Date.now() }); await LQ.backup.apply(obj, id, 'replace'); LQ.switchTo(id, null); } }, '➕ Restore as a new local profile'),
            h('button', { class: 'btn ghost', onclick: c2 }, 'Cancel'))));
      } })),
      h('h3', { style: { marginTop: '22px' } }, '🕘 Restore points on this device'), rpBox);
    drawFs(); drawRP();
  },

  async cloud(body, close) {
    if (!LQ.config.supabaseUrl || !window.LQCloud) {
      body.append(h('p', {}, 'Cloud sync is not configured for this installation.'), h('p', { class: 'tiny' }, 'Add your Supabase project URL and anon key to config.js (see cloud/README.md). Then you can sign in from any device and your progress follows you.'));
      return;
    }
    const sess = LQCloud.session();
    if (!sess) {
      body.append(h('p', {}, 'Sign in to a cloud account to study from any device. Your data stays private to your account.'), h('button', { class: 'btn ai', onclick: () => { close(); LQ.openAccountPicker(); } }, '☁️ Sign in / create account'));
      return;
    }
    if (ACCOUNT.kind !== 'cloud') {
      body.append(h('p', {}, `You are signed in to the cloud as ${sess.user.email}, but you are using the local profile “${ACCOUNT.name}”.`),
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => LQ.switchTo('u_' + sess.user.id, SUBJ.id) }, 'Switch to my cloud account'),
          h('button', { class: 'btn', onclick: () => confirmBox(`Copy all of “${ACCOUNT.name}” into your cloud account? (cloud data with the same keys is overwritten; a cloud snapshot is taken first)`, async () => {
            const target = 'u_' + sess.user.id; await LQCloud.snapshot('Before copying local profile ' + ACCOUNT.name).catch(() => { });
            await LQ.backup.apply(await LQ.backup.collect(ACCOUNT.id, { includeSecrets: true }), target, 'merge');
            const keys = Object.keys(LQ.kv.accountData(target)); const mt = LQ.jget(`lq1:${target}:meta:mtime`, {}); keys.forEach(k => mt[k] = Date.now()); LQ.jset(`lq1:${target}:meta:mtime`, mt);
            toast('Copied — switching to your cloud account'); LQ.switchTo(target, SUBJ.id);
          }) }, '⬆️ Copy this profile into my cloud account')));
      return;
    }
    const stBox = h('div');
    const drawSt = () => { const s = LQCloud.status(); stBox.innerHTML = ''; stBox.append(h('div', { class: 'row' }, h('span', { class: 'pill ' + (s.error ? '' : 'c') }, s.error ? '⚠️ ' + s.error : s.syncing ? '🔄 Syncing…' : `✅ Synced ${s.lastSync ? new Date(s.lastSync).toLocaleTimeString() : ''}`), s.pending ? h('span', { class: 'pill' }, `${s.pending} change(s) waiting`) : null)); };
    LQCloud.onStatus(drawSt); drawSt();
    const snapBox = h('div');
    const drawSnaps = async () => {
      snapBox.innerHTML = '';
      let list = []; try { list = await LQCloud.listSnapshots(); } catch (e) { snapBox.append(h('p', { class: 'tiny' }, '⚠️ ' + e.message)); return; }
      if (!list.length) snapBox.append(h('p', { class: 'tiny' }, 'No snapshots yet.'));
      list.forEach(sn => snapBox.append(h('div', { class: 'subrow' }, h('div', { class: 'grow' }, h('b', {}, sn.label), h('div', { class: 'tiny' }, `${fmtWhen(sn.created_at)} · ${fmtBytes(sn.size_bytes || 0)}`)),
        h('button', { class: 'btn small', onclick: async () => LQ.backup.download(await LQCloud.getSnapshot(sn.id)) }, '⬇️'),
        h('button', { class: 'btn small', onclick: () => confirmBox('Restore your account to this snapshot? (a snapshot of the current state is taken first)', async () => { await LQCloud.snapshot('Before restoring a snapshot'); await LQ.backup.apply(await LQCloud.getSnapshot(sn.id), ACCOUNT.id, 'replace'); await LQCloud.push(ACCOUNT.id).catch(() => { }); toast('Restored ✔ — reloading'); setTimeout(() => location.reload(), 900); }) }, 'Restore'),
        h('button', { class: 'iconbtn', onclick: async () => { await LQCloud.deleteSnapshot(sn.id); drawSnaps(); } }, '🗑️'))));
    };
    body.append(h('p', { class: 'tiny' }, `Signed in as ${sess.user.email}. Progress, conversations and settings sync automatically; a daily snapshot is kept (last 30).`), stBox,
      h('div', { class: 'row', style: { margin: '10px 0' } },
        h('button', { class: 'btn', onclick: async () => { try { await LQCloud.push(ACCOUNT.id); const n = await LQCloud.pull(ACCOUNT.id); toast(n ? `Pulled ${n} change(s) — reloading` : 'Up to date ✔'); if (n) setTimeout(() => location.reload(), 800); } catch (e) { toast('⚠️ ' + e.message); } } }, '🔄 Sync now'),
        h('button', { class: 'btn', onclick: async () => { try { await LQCloud.snapshot('Manual snapshot'); toast('📸 Snapshot saved'); drawSnaps(); } catch (e) { toast('⚠️ ' + e.message); } } }, '📸 Take snapshot'),
        h('label', { class: 'btn' }, '🗄️ Upload database backup…', h('input', { type: 'file', accept: '.db,.sqlite,.gz,.zip,.json', style: { display: 'none' }, onchange: async e => { try { await LQCloud.uploadFile('db', e.target.files[0]); toast('☁️ Database backup uploaded'); } catch (er) { toast('⚠️ ' + er.message, 4000); } } })),
        h('button', { class: 'btn ghost', onclick: async () => { await LQCloud.push(ACCOUNT.id).catch(() => { }); await LQCloud.signOut(); LQ.jset('lq1:current', {}); location.reload(); } }, 'Sign out')),
      h('h3', { style: { marginTop: '18px' } }, '📸 Cloud snapshots'), snapBox);
    drawSnaps();
  },
};

/* ---------- sync indicator ---------- */
function wireSyncDot() {
  const dot = $('#syncdot'); if (!dot) return;
  if (ACCOUNT.kind !== 'cloud' || !window.LQCloud) { dot.remove(); return; }
  const paint = s => { dot.className = 'syncdot ' + (s.error ? 'err' : s.syncing || s.pending ? 'busy' : 'ok'); dot.title = s.error ? 'Sync error: ' + s.error : s.syncing ? 'Syncing…' : s.pending ? 'Changes waiting to sync' : 'All changes synced'; };
  LQCloud.onStatus(paint); paint(LQCloud.status());
}
