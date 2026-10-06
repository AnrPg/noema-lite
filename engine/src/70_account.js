/* ===================== Account menu: profile, subjects, backup & restore, cloud ===================== */
const ACC_TABS = [['profile', '👤 Profile'], ['subjects', '📚 Subjects'], ['backup', '💾 Backup & restore'], ['cloud', '☁️ Cloud'], ['help', '❓ Help']];
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
    ACC_TABS.forEach(([k, l]) => tabs.append(h('button', { 'data-t': k, onclick: () => show(k) }, l)));
    const st = Noema.stats.get();
    box.append(h('div', { class: 'acchead' }, h('div', { class: 'accemo' }, ACCOUNT.emoji || '🙂'),
      h('div', { class: 'grow' }, h('h2', {}, ACCOUNT.name), h('div', { class: 'tiny' }, ACCOUNT.kind === 'cloud' ? `☁️ Cloud account · ${ACCOUNT.email}` : '💻 Local profile on this device')),
      h('div', { class: 'accstats' }, h('span', { class: 'chip xp' }, `⭐ ${st.xp} XP total`), h('span', { class: 'chip streak' }, `🔥 ${Noema.stats.streakNow()} day streak`)),
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
    body.append(h('p', { class: 'muted' }, 'Choose which subjects appear in your picker. Library subjects are shared; imported packs belong only to this profile.'),
      h('div', { class: 'sublist' }, ...list.map(s => h('div', { class: 'subrow' },
        h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: !hidden.has(s.id), onchange: e => { e.target.checked ? hidden.delete(s.id) : hidden.add(s.id); putAccountSettings({ hiddenSubjects: [...hidden] }); } }), h('i')),
        h('span', { style: { fontSize: '22px' } }, s.emoji || '📘'),
        h('div', { class: 'grow' }, h('b', {}, s.title), h('div', { class: 'tiny' }, `${s.origin === 'library' ? 'Library' : s.origin === 'private' ? '🔒 Private (folder)' : '📥 Imported'} · ${s.counts?.chapters ?? '?'} chapters · ${s.counts?.exercises ?? '?'} exercises`)),
        s.id === SUBJ.id ? h('span', { class: 'pill c' }, 'open') : h('button', { class: 'btn small', onclick: () => Noema.switchTo(ACCOUNT.id, s.id) }, 'Open'),
        s.origin === 'imported' ? h('button', { class: 'iconbtn', title: 'Remove imported pack (progress is kept)', onclick: () => confirmBox(`Remove the imported pack “${s.title}”? Your progress in it is kept.`, async () => { await Noema.idb.del('packs', ACCOUNT.id + '|' + s.id); Noema.kv.del(Noema.kv.accountKey('packmeta:' + s.id)); toast('Removed'); }) }, '🗑️') : null))),
      h('div', { class: 'row', style: { marginTop: '14px' } },
        h('label', { class: 'btn' }, '📥 Import subject pack…', h('input', { type: 'file', accept: '.json,.noemapack', style: { display: 'none' }, onchange: async e => { try { const s = await Noema.importPackFile(ACCOUNT.id, e.target.files[0]); confirmBox(`Open “${s.title}” now?`, () => Noema.switchTo(ACCOUNT.id, s.id)); } catch (er) { toast('⚠️ ' + er.message, 4000); } } })),
        h('button', { class: 'btn', onclick: () => { const p = Noema.pack; const b = new Blob([JSON.stringify(p)], { type: 'application/json' }); const a = h('a', { href: URL.createObjectURL(b), download: `${SUBJ.id}.noema-pack.json` }); a.click(); } }, `⬇️ Export “${SUBJ.title}” pack`)));
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
        h('button', { class: 'btn small', onclick: () => confirmBox('Go back to this restore point? (your current state becomes a new restore point)', async () => { await Noema.backup.apply(await Noema.backup.getRestorePoint(p.key), ACCOUNT.id, 'replace'); toast('Restored ✔ — reloading'); setTimeout(() => location.reload(), 700); }) }, 'Restore'))));
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
        h('button', { class: 'btn small', onclick: () => confirmBox('Restore your account to this snapshot? (a snapshot of the current state is taken first)', async () => { await NoemaCloud.snapshot('Before restoring a snapshot'); await Noema.backup.apply(await NoemaCloud.getSnapshot(sn.id), ACCOUNT.id, 'replace'); await NoemaCloud.push(ACCOUNT.id).catch(() => { }); toast('Restored ✔ — reloading'); setTimeout(() => location.reload(), 900); }) }, 'Restore'),
        h('button', { class: 'iconbtn', onclick: async () => { await NoemaCloud.deleteSnapshot(sn.id); drawSnaps(); } }, '🗑️'))));
    };
    body.append(h('p', { class: 'tiny' }, `Signed in as ${sess.user.email}. Progress, conversations and settings sync automatically; a daily snapshot is kept (last 30).`), stBox,
      h('div', { class: 'row', style: { margin: '10px 0' } },
        h('button', { class: 'btn', onclick: async () => { try { await NoemaCloud.push(ACCOUNT.id); const n = await NoemaCloud.pull(ACCOUNT.id); toast(n ? `Pulled ${n} change(s) — reloading` : 'Up to date ✔'); if (n) setTimeout(() => location.reload(), 800); } catch (e) { toast('⚠️ ' + e.message); } } }, '🔄 Sync now'),
        h('button', { class: 'btn', onclick: async () => { try { await NoemaCloud.snapshot('Manual snapshot'); toast('📸 Snapshot saved'); drawSnaps(); } catch (e) { toast('⚠️ ' + e.message); } } }, '📸 Take snapshot'),
        h('label', { class: 'btn' }, '🗄️ Upload database backup…', h('input', { type: 'file', accept: '.db,.sqlite,.gz,.zip,.json', style: { display: 'none' }, onchange: async e => { try { await NoemaCloud.uploadFile('db', e.target.files[0]); toast('☁️ Database backup uploaded'); } catch (er) { toast('⚠️ ' + er.message, 4000); } } })),
        h('button', { class: 'btn ghost', onclick: async () => { await NoemaCloud.push(ACCOUNT.id).catch(() => { }); await NoemaCloud.signOut(); Noema.jset('noema1:current', {}); location.reload(); } }, 'Sign out')),
      accSection('📸', 'Cloud snapshots', { open: true, info: 'Restore points of your whole account stored in the cloud: one automatic per day (last 30) + any you take manually.', body: snapBox }),
      accSection('👥', 'Invite friends', { body: guideBody('friends', { compact: true }) }));
    drawSnaps();
  },
};

ACC_VIEWS.help = function (body) {
  const st = setupStatus();
  const state = { gemini: st.gemini, backupFolder: !!Noema.jget(`noema1:${ACCOUNT.id}:meta:lastFolderBackup`, 0), cloudUser: ACCOUNT.kind === 'cloud', cloudOwner: !!Noema.config.supabaseUrl };
  body.append(h('p', { class: 'tiny', style: { margin: '0 0 10px' } }, 'Step-by-step guides. Everything here is optional — the app works fully on one device without any of it.'),
    ...Object.entries(GUIDES).map(([id, g]) => accSection(g.icon, g.title, { status: id in state ? (state[id] ? { ok: true, text: 'done' } : { ok: false, text: 'not set up' }) : null, body: guideBody(id) })));
};

/* ---------- sync indicator ---------- */
function wireSyncDot() {
  const dot = $('#syncdot'); if (!dot) return;
  if (ACCOUNT.kind !== 'cloud' || !window.NoemaCloud) { dot.remove(); return; }
  const paint = s => { dot.className = 'syncdot ' + (s.error ? 'err' : s.syncing || s.pending ? 'busy' : 'ok'); dot.title = s.error ? 'Sync error: ' + s.error : s.syncing ? 'Syncing…' : s.pending ? 'Changes waiting to sync' : 'All changes synced'; };
  NoemaCloud.onStatus(paint); paint(NoemaCloud.status());
}
