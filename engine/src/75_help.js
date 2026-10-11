/* ===================== Help: ⓘ tooltips, setup guides, first-sessions setup banner ===================== */
/** Small ⓘ that shows an explanation on hover / focus / tap. */
function tip(text) {
  const t = h('span', { class: 'htip', tabindex: '0', role: 'button', 'aria-label': tE('engine.help.moreInfo'), onclick: e => { e.stopPropagation(); e.preventDefault(); t.classList.toggle('show'); } }, 'i', h('span', { class: 'htipbox', html: fmt(text) }));
  return t;
}
document.addEventListener('click', () => $$('.htip.show').forEach(t => t.classList.remove('show')));

const SITE_URL = Noema.config.siteUrl || '';
/* The setup guides: their words are in the catalog (engine.guide.<id>.title / .who / .step1… / .note1…, Markdown);
   here only their icon and how many steps and notes each has. GUIDES[id] reads like the old object ({ icon, title, who, steps, notes }). */
const GUIDE_DEF = {
  gemini: { icon: '🔑', steps: 4, notes: 2 }, backupFolder: { icon: '📁', steps: 5, notes: 1 }, restore: { icon: '♻️', steps: 4, notes: 0 },
  cloudUser: { icon: '☁️', steps: 4, notes: 1 }, cloudOwner: { icon: '🛠️', steps: 5, notes: 0 }, github: { icon: '🐙', steps: 4, notes: 0 },
  claude: { icon: '✨', steps: 6, notes: 2 }, curricula: { icon: '🧭', steps: 6, notes: 2 }, friends: { icon: '👥', steps: 4, notes: 1 },
};
function guideOf(id) {
  const d = GUIDE_DEF[id], k = 'engine.guide.' + id + '.';
  const P = { site: SITE_URL, hasSite: SITE_URL ? 'yes' : 'no', acc: ACCOUNT.id, mcp: SITE_URL ? SITE_URL + '/mcp' : tE('engine.guide.mcpPlaceholder') };
  const list = (part, n) => Array.from({ length: n }, (_, i) => tE(k + part + (i + 1), P));
  return { icon: d.icon, title: tE(k + 'title'), who: tE(k + 'who'), steps: list('step', d.steps), notes: d.notes ? list('note', d.notes) : null };
}
const GUIDES = new Proxy(GUIDE_DEF, { get: (o, id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(o, id) ? guideOf(id) : undefined });
function guideBody(id, { compact = false } = {}) {
  const g = GUIDES[id]; if (!g) return h('div');
  return h('div', { class: 'guide' },
    compact ? null : h('div', { class: 'tiny' }, '👤 ' + g.who),
    h('ol', { class: 'gsteps' }, ...g.steps.map(s => h('li', { html: linkify(fmt(s)) }))),
    g.notes ? h('div', { class: 'gnotes' }, ...g.notes.map(n => h('div', { html: '💡 ' + linkify(fmt(n)) }))) : null);
}
const linkify = html => html.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');   // i18n-ignore
function openGuide(id) { const g = GUIDES[id]; if (!g) return; modal((b, close) => b.append(h('div', { class: 'row' }, h('h2', { class: 'grow' }, `${g.icon} ${g.title}`), h('button', { class: 'iconbtn', onclick: close }, '✕')), guideBody(id))); }
const guideBtn = (id, label) => h('button', { class: 'btn small ghost', onclick: () => openGuide(id) }, label || `${GUIDES[id].icon} ` + tE('engine.help.how'));

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
  if (!st.gemini && !st.dismissed.gemini) items.push(['gemini', '🔑 ' + tE('engine.setup.gemini'), tE('engine.setup.setUp')]);
  if (!st.protectedData && !st.dismissed.backup) items.push(['backup', '💾 ' + tE('engine.setup.backup'), tE('engine.setup.setUp')]);
  if (!items.length) return null;
  const box = h('div', { class: 'setupbar' });
  items.forEach(([k, text, cta]) => box.append(h('div', { class: 'setuprow' }, h('span', { class: 'grow' }, text),
    h('button', { class: 'btn small primary', onclick: () => k === 'gemini' ? openGuide('gemini') : openAccountMenu('backup') }, cta),
    h('button', { class: 'iconbtn', title: tE('engine.setup.dismiss'), onclick: () => { const d = setupStatus().dismissed; d[k] = Date.now(); putAccountSettings({ dismissedSetup: d }); route(); } }, '✕'))));
  box.append(h('div', { class: 'tiny', style: { marginTop: '4px' } }, tE('engine.setup.optional', { n: sessions, of: 5 }) + ' · ', h('button', { class: 'linkish tiny', onclick: () => openAccountMenu('help') }, tE('engine.setup.allGuides'))));
  return box;
}
