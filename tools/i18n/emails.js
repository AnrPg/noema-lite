/* The Supabase account e-mails (docs/i18n.md §6): i18n/email/<locale>.arb → cloud/email/<template>.html + .subject.txt,
   one template per e-mail, every language in it — Supabase passes the account's user_metadata as .Data, so each template
   branches on .Data.locale (the UI language engine/cloud.js keeps there) with Go-template conditions:
     {{ $l := printf "%v" .Data.locale }}{{ if eq $l "el" }} … {{ else if eq $l "ru" }} … {{ else }} English {{ end }}
   (printf turns a missing locale into "<nil>", so old accounts get English and `eq` never compares nil with a string).
   Usage: node tools/i18n/emails.js             production set: only reviewed translations (i18n/email/<locale>.arb) → cloud/email/
          node tools/i18n/emails.js --drafts    preview set: + Claude's drafts (i18n/email/drafts/) → cloud/email/preview/
          node tools/i18n/emails.js --check     exit 1 when cloud/email/ (and preview/) differ from what the catalogs give
          --out <dir>                           write somewhere else (tests)
   Nothing is deployed: the templates are pasted into Supabase → Authentication → Emails (deploy note: docs/i18n.md §6.4). */
const fs = require('fs'), path = require('path'), vm = require('vm');
const { ROOT, LOCALES, loadAll, messages } = require('./icu');

const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'engine', 'vendor', 'intl-messageformat.iife.js'), 'utf8') + ';this.__IMF = IntlMessageFormat;', ctx);
const IMF = ctx.__IMF.IntlMessageFormat;

/** The e-mails Supabase sends (its dashboard names), the link each one carries, and its catalog keys (email.<id>.*). */
const TEMPLATES = [
  { file: 'confirm-signup', dashboard: 'Confirm signup', id: 'confirm', link: '.ConfirmationURL' },
  { file: 'invite', dashboard: 'Invite user', id: 'invite', link: '.ConfirmationURL' },
  { file: 'magic-link', dashboard: 'Magic Link', id: 'magic', link: '.ConfirmationURL' },
  { file: 'change-email', dashboard: 'Change Email Address', id: 'change', link: '.ConfirmationURL' },
  { file: 'reset-password', dashboard: 'Reset Password', id: 'reset', link: '.ConfirmationURL' },
  { file: 'reauthentication', dashboard: 'Reauthentication', id: 'reauth', code: '.Token' },
];
/** ICU placeholders → the Go-template value Supabase fills in. */
const VARS = { email: '{{ .Email }}', newEmail: '{{ .NewEmail }}', token: '{{ .Token }}', siteUrl: '{{ .SiteURL }}' };
const RTL = new Set(['ar-EG']);

const html = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
/** A message → text with the Go-template values in place (HTML-escaped unless plain). */
function fill(msg, loc, plain) {
  const mark = Object.fromEntries(Object.keys(VARS).map(k => [k, `\u0001${k}\u0001`]));
  let out = new IMF(msg, loc, undefined, { ignoreTag: true }).format(mark);
  if (Array.isArray(out)) out = out.join('');
  if (!plain) out = html(out);
  return out.replace(/\u0001(\w+)\u0001/g, (m, k) => VARS[k]);
}
/** The messages of a locale (approved, plus drafts when asked) — null for a template some key of which is missing. */
function catalog(drafts) {
  const { cats, drafts: dr } = loadAll();
  const byLoc = cats.email || {}, en = messages(byLoc.en);
  const out = {};
  for (const loc of LOCALES) {
    out[loc] = loc === 'en' ? en : { ...(drafts ? messages((dr.email || {})[loc]) : {}), ...messages(byLoc[loc]) };
  }
  return out;
}
const keysOf = t => ['subject', 'heading', 'intro', ...(t.link ? ['action'] : [])].map(k => `email.${t.id}.${k}`).concat(t.link ? ['email.common.linkFallback', 'email.common.ignore'] : ['email.common.ignore']);
/** The locales that get their own branch in a template: every key there (else the learner would read two languages). */
const localesFor = (t, cat) => LOCALES.filter(l => l !== 'en' && keysOf(t).every(k => cat[l][k] != null));
/** The Go condition of a locale: its tag, plus its bare language for a regional one (es-ES ← es), never zh. */
const cond = loc => ['eq $l', JSON.stringify(loc), ...(/-/.test(loc) && !/^zh-/.test(loc) ? [JSON.stringify(loc.split('-')[0])] : [])].join(' ');

function body(t, m, loc) {
  const M = k => fill(m[k], loc), dir = RTL.has(loc) ? 'rtl' : 'ltr';
  const lines = [
    `<div lang="${loc}" dir="${dir}" style="font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px; color: #1f2933; line-height: 1.5;">`,
    `  <h2 style="margin: 0 0 16px; font-size: 22px;">${M(`email.${t.id}.heading`)}</h2>`,
    `  <p style="margin: 0 0 20px;">${M(`email.${t.id}.intro`)}</p>`,
  ];
  if (t.link) lines.push(
    `  <p style="margin: 0 0 24px;"><a href="{{ ${t.link} }}" style="display: inline-block; padding: 12px 20px; border-radius: 8px; background: #4f46e5; color: #ffffff; text-decoration: none; font-weight: 600;">${M(`email.${t.id}.action`)}</a></p>`,
    `  <p style="margin: 0 0 16px; font-size: 13px; color: #52606d;">${M('email.common.linkFallback')}<br><a href="{{ ${t.link} }}" style="color: #4f46e5; word-break: break-all;">{{ ${t.link} }}</a></p>`);
  if (t.code) lines.push(`  <p style="margin: 0 0 24px; font-size: 28px; font-weight: 700; letter-spacing: 4px; font-family: ui-monospace, Menlo, Consolas, monospace;" dir="ltr">{{ ${t.code} }}</p>`);
  lines.push(`  <p style="margin: 24px 0 0; font-size: 13px; color: #7b8794;">${M('email.common.ignore')}</p>`,
    `  <p style="margin: 8px 0 0; font-size: 13px; color: #7b8794;">noema-lite</p>`, '</div>');
  return lines.join('\n');
}
/** Branches: {{ if eq $l "el" }}…{{ else if … }}…{{ else }}English{{ end }} — a template with English only has no condition. */
function branch(t, cat, part) {
  const locs = localesFor(t, cat), en = part(cat.en, 'en');
  if (!locs.length) return { text: en, locales: ['en'] };
  let s = '{{ $l := printf "%v" .Data.locale }}';
  locs.forEach((l, i) => { s += `{{ ${i ? 'else if' : 'if'} ${cond(l)} }}` + part(cat[l], l); });
  return { text: s + '{{ else }}' + en + '{{ end }}', locales: ['en', ...locs] };
}
function render(drafts) {
  const cat = catalog(drafts), files = {};
  for (const t of TEMPLATES) {
    for (const k of keysOf(t)) if (cat.en[k] == null) throw new Error(`i18n/email/en.arb has no ${k}`);
    const b = branch(t, cat, (m, l) => '\n' + body(t, m, l) + '\n');
    const head = `<!-- GENERATED by tools/i18n/emails.js from i18n/email/*.arb — do not edit. Supabase → Authentication → Emails → “${t.dashboard}”: paste as the message body (docs/i18n.md §6). Languages: ${b.locales.join(', ')}${drafts ? ' — PREVIEW with unreviewed drafts, not for production' : ''} -->\n`;
    files[t.file + '.html'] = head + b.text.replace(/\n{2,}/g, '\n') + '\n';
    files[t.file + '.subject.txt'] = branch(t, cat, (m, l) => fill(m[`email.${t.id}.subject`], l, true)).text + '\n';
  }
  return files;
}
function write(dir, files) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [f, s] of Object.entries(files)) fs.writeFileSync(path.join(dir, f), s);
}
function differs(dir, files) { return Object.entries(files).filter(([f, s]) => { try { return fs.readFileSync(path.join(dir, f), 'utf8') !== s; } catch (e) { return true; } }).map(([f]) => f); }

if (require.main === module) {
  const a = process.argv.slice(2), oi = a.indexOf('--out');
  const base = oi >= 0 ? path.resolve(a[oi + 1]) : path.join(ROOT, 'cloud', 'email');
  if (a.includes('--check')) {
    const bad = [...differs(base, render(false)), ...differs(path.join(base, 'preview'), render(true)).map(f => 'preview/' + f)];
    if (bad.length) { console.log('cloud/email/ is not up to date — run node tools/i18n/emails.js && node tools/i18n/emails.js --drafts: ' + bad.join(', ')); process.exit(1); }
    console.log('cloud/email/: up to date'); process.exit(0);
  }
  const drafts = a.includes('--drafts'), dir = drafts ? path.join(base, 'preview') : base, files = render(drafts);
  write(dir, files);
  console.log(`e-mails → ${path.relative(ROOT, dir) || dir}: ${TEMPLATES.length} templates (+ subjects)` + (drafts ? ' — preview with drafts' : ''));
}
module.exports = { render, TEMPLATES, VARS, keysOf };
