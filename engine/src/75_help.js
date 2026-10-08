/* ===================== Help: ⓘ tooltips, setup guides, first-sessions setup banner ===================== */
/** Small ⓘ that shows an explanation on hover / focus / tap. */
function tip(text) {
  const t = h('span', { class: 'htip', tabindex: '0', role: 'button', 'aria-label': 'More info', onclick: e => { e.stopPropagation(); e.preventDefault(); t.classList.toggle('show'); } }, 'i', h('span', { class: 'htipbox', html: fmt(text) }));
  return t;
}
document.addEventListener('click', () => $$('.htip.show').forEach(t => t.classList.remove('show')));

const SITE_URL = Noema.config.siteUrl || '';
const GUIDES = {
  gemini: { icon: '🔑', title: 'Get your free Gemini API key', who: 'Everyone who wants the AI tutor', steps: [
    'Open **Google AI Studio** → https://aistudio.google.com/apikey and sign in with your Google account.',
    'Click **Create API key** (accept the terms if asked) and copy the key (it starts with `AIza…`).',
    'In this app: **⚙️ Settings → Gemini API key** → paste → **🔍 Detect models** → **🧪 Test**. You should see “Brick is ready”.',
    'Done. On a cloud account the key follows you privately to all your devices; on a local profile it stays in this browser.'],
    notes: ['The key is personal — don’t share it. Each friend uses their own (it is free with generous limits).', 'Without a key everything works except the tutor, AI grading and AI-generated questions.'] },
  backupFolder: { icon: '📁', title: 'Automatic backups to a folder (Google Drive / iCloud too)', who: 'Chrome, Edge or Brave on a computer', steps: [
    'Account menu (your emoji, top-right) → **💾 Backup & restore → 📁 Automatic backups** → **Choose backup folder**.',
    `Pick your profile folder, e.g. **noema-lite/accounts/${ACCOUNT.id}** (any folder works). The app creates **backups/** and **conversations/** inside it.`,
    'From now on: a backup file every few minutes when something changed (and when you leave), and every AI conversation as **.json + .md** within ~20 seconds.',
    '**Off-site for free:** install **Google Drive for desktop** (https://www.google.com/drive/download/) and choose a folder inside **Google Drive → My Drive** — or a folder in **iCloud Drive**. Your backups then reach the cloud automatically.',
    'After a browser restart the browser may ask again: open the menu and click **Resume** once.'],
    notes: ['Safari/Firefox can’t write to folders: use **Download backup** instead (or a cloud account).'] },
  restore: { icon: '♻️', title: 'Restoring data', who: 'Everyone', steps: [
    '**Restore points** (this device) are created automatically before every restore or reset — the quickest undo.',
    '**From a file:** 💾 Backup & restore → Restore from a backup file → choose **Replace** (exact copy), **Merge** (backup wins on conflicts) or **New profile** (side by side).',
    '**Cloud accounts:** ☁️ Cloud → Cloud snapshots → Restore (a snapshot of the current state is taken first).',
    '**Everything (owner):** the SQLite database in noema-lite/data can recreate any file of any past version: `python3 tools/db_restore.py list`.'] },
  cloudUser: { icon: '☁️', title: 'Use a cloud account (study from anywhere)', who: 'You and your friends', steps: [
    `Open the website${SITE_URL ? ' (' + SITE_URL + ')' : ''} on any device → **☁️ Sign in / create a cloud account**.`,
    'Create the account (email + password). If asked, confirm the email from your inbox, then sign in.',
    'Add your Gemini key (⚙️ Settings) once on each device: it stays in that browser. Progress, flashcards, conversations and settings sync automatically.',
    'Already studied locally? In the local app: account menu → ☁️ Cloud → sign in → **⬆️ Copy this profile into my cloud account**.'],
    notes: ['Your data is private to your account (row-level security). A daily snapshot is kept for 30 days.'] },
  cloudOwner: { icon: '🛠️', title: 'Set up the cloud (owner, once)', who: 'Only the owner of this installation', steps: [
    '**Supabase** (accounts + sync): https://supabase.com → New project (region Frankfurt) → **SQL Editor** → run the whole file **cloud/supabase.sql**.',
    'Supabase: the **Project URL** is `https://<project-ref>.supabase.co` (the ref is in your dashboard address) and the **publishable key** (`sb_publishable_…`) is under **Project Settings → API Keys** → put both in **config.js** (or give them to Claude). Never share the secret key or the database password.',
    '**Netlify** (website): https://app.netlify.com → Add new site → Import from GitHub → pick the repo → Deploy (settings come from netlify.toml).',
    'Supabase → **Authentication → URL Configuration → Site URL** = your Netlify address.',
    'Full step-by-step guide with screenshots-level detail: **cloud/README.md** in the repository.'] },
  github: { icon: '🐙', title: 'Keep the repository on GitHub (owner)', who: 'Only the owner', steps: [
    'Install **GitHub Desktop** (https://desktop.github.com) and sign in.',
    '**File → Add Local Repository** → choose Documents/MyApps/noema-lite.',
    '**Publish repository** → keep **Keep this code private** ticked.',
    'Whenever Claude has made changes: open GitHub Desktop → **Push origin**. Netlify then updates the website automatically.'] },
  claude: { icon: '✨', title: 'Set up Claude and create subjects (three ways)', who: 'Everyone', steps: [
    'Account menu → 📚 Subjects → **✨ Create a subject with Claude** (or the same button in the subject picker). The window shows every step, numbered, with ⓘ tips.',
    '**Way A — here in noema-lite:** create a Claude Console account (platform.claude.com), add a little credit, create an API key and paste it in the window. noema-lite uploads the skill, sends your files to Claude and imports the finished subject — you never leave the app. You see the cost live and set a limit.',
    `**Way B — in the Claude app or website:** with your Claude plan (Free, Pro, Max): switch on code execution, add the connector **Customize → Connectors → + Add → Add custom connector** with the address ${SITE_URL ? SITE_URL + '/mcp' : '<your site>/mcp'} (the same for everyone and every device), then attach your sources in a new chat and send the prompt from the window.`,
    '**Way C — a whole curriculum with your Claude plan (⭐ recommended for curricula, usually the cheapest):** set up the connector as in way B, then in 🧭 Curricula choose **💬 Claude app** when you create or import a curriculum. Copy the one message noema-lite shows into a Claude chat: Claude builds the map, plans the chapters and prepares the queued steps; they appear on the map by themselves. No API cost — the bigger the curriculum, the bigger the saving.',
    'Claude reads everything, adds pictures (from your sources, from the web and its own diagrams / graphs) and builds the pack; the new subject appears in your picker.',
    'Share it if you like: 🔗 on the subject → public (🌍 Explore) or with one person.'],
    notes: ['Way A: your API key stays on this device only. Way B: noema-lite never sees your Claude login.', 'Updates are additive: Claude keeps all ids, so your progress stays.'] },
  curricula: { icon: '🧭', title: 'Curricula: from a goal to a map of steps', who: 'Everyone with a Claude API key or a Gemini key', steps: [
    'Subject picker → **🧭 Curricula** (or 🧭 in the top bar) → **➕ New curriculum**.',
    'Type what you want to master, your starting point and the depth. Four AI agents map it: **every prerequisite** (from several sciences), **the whole goal** (aspects, sub-topics, synthesis) and **applications**; then they plan the chapters of every step.',
    'The map shows three parts. **▶️ open** steps can be studied; **🔒 locked** ones show their information and chapters but open only when their prerequisites are mastered.',
    'Every step becomes a full subject (theory, exercises, flashcards, drills, tutor), prepared in the background a few steps ahead while the app is open — with Claude from official sources found on the web, or with Gemini and Google Search.',
    'A step is **✅ mastered** when all its sections are read and 80 % of its exercises solved — or with **🎓 I already know this** (8 of 10 in a short test).'],
    notes: ['Curricula and prepared steps are saved in your account (cloud) like your subjects.', 'Claude costs a few dollars per prepared step (limit per step in ⚙️ of the map); Gemini’s free quota is limited.'] },
  friends: { icon: '👥', title: 'Invite friends', who: 'You', steps: [
    `Send them the website link${SITE_URL ? ' (' + SITE_URL + ')' : ''}.`,
    'Each friend creates their **own cloud account** — they see the shared subjects, never your progress, conversations or key.',
    'Each friend adds **their own free Gemini key** (guide: “Get your free Gemini API key”).',
    'Want to give them one of your subjects? Subject picker → **🔗** on the subject → *Share with a person* (their e-mail) — they get a 🔔 and accept. Or **🌍 Make it public** so everybody finds it in Explore.'],
    notes: ['Supabase’s built-in email service sends only a few emails per hour: for more than a handful of friends, either turn off “Confirm email” (Authentication → Providers → Email) or connect your own SMTP.'] },
};
function guideBody(id, { compact = false } = {}) {
  const g = GUIDES[id]; if (!g) return h('div');
  return h('div', { class: 'guide' },
    compact ? null : h('div', { class: 'tiny' }, '👤 ' + g.who),
    h('ol', { class: 'gsteps' }, ...g.steps.map(s => h('li', { html: linkify(fmt(s)) }))),
    g.notes ? h('div', { class: 'gnotes' }, ...g.notes.map(n => h('div', { html: '💡 ' + linkify(fmt(n)) }))) : null);
}
const linkify = html => html.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
function openGuide(id) { const g = GUIDES[id]; if (!g) return; modal((b, close) => b.append(h('div', { class: 'row' }, h('h2', { class: 'grow' }, `${g.icon} ${g.title}`), h('button', { class: 'iconbtn', onclick: close }, '✕')), guideBody(id))); }
const guideBtn = (id, label) => h('button', { class: 'btn small ghost', onclick: () => openGuide(id) }, label || `${GUIDES[id].icon} How?`);

/* ---------- setup status ---------- */
function setupStatus() {
  const set = accountSettings();
  const lastDl = Noema.jget(`noema1:${ACCOUNT.id}:meta:lastDownloadBackup`, 0);
  return {
    gemini: !!S.settings.apiKey,
    protectedData: ACCOUNT.kind === 'cloud' || !!Noema.jget(`noema1:${ACCOUNT.id}:meta:lastFolderBackup`, 0) || Date.now() - lastDl < 14 * 864e5,
    dismissed: set.dismissedSetup || {},
  };
}
/** Warning banner shown on the home page during the first sessions of a profile, only for things not set up yet. */
function setupBanner() {
  const sessions = Noema.jget(`noema1:${ACCOUNT.id}:meta:sessions`, 0);
  if (sessions > 5) return null;
  const st = setupStatus();
  const items = [];
  if (!st.gemini && !st.dismissed.gemini) items.push(['gemini', '🔑 The AI tutor is off: add your free Gemini key.', 'Set up']);
  if (!st.protectedData && !st.dismissed.backup) items.push(['backup', '💾 Your progress lives only in this browser: turn on backups (folder, Google Drive or cloud).', 'Set up']);
  if (!items.length) return null;
  const box = h('div', { class: 'setupbar' });
  items.forEach(([k, text, cta]) => box.append(h('div', { class: 'setuprow' }, h('span', { class: 'grow' }, text),
    h('button', { class: 'btn small primary', onclick: () => k === 'gemini' ? openGuide('gemini') : openAccountMenu('backup') }, cta),
    h('button', { class: 'iconbtn', title: 'Dismiss', onclick: () => { const d = setupStatus().dismissed; d[k] = Date.now(); putAccountSettings({ dismissedSetup: d }); route(); } }, '✕'))));
  box.append(h('div', { class: 'tiny', style: { marginTop: '4px' } }, `Optional · shown during your first sessions (${sessions}/5) · `, h('button', { class: 'linkish tiny', onclick: () => openAccountMenu('help') }, 'all setup guides')));
  return box;
}
