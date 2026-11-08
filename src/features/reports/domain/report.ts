/**
 * ⚑ Problem reports (docs/REPORTS.md): what a report is, its kinds and statuses, the files of the repository it points to,
 * and the brief — the English Markdown whoever fixes it (a person or Claude, through the connector) reads. The locator
 * the app collects (engine/report.js collect) is the input; it comes from the database, so every part is optional.
 */
import { textOf } from '../../../kernel/text.ts';
import type { Locator, ReportRow } from '../../../ports/reports.ts';

export {
  REPORT_LIST_COLUMNS,
  type CatalogKey,
  type Locator,
  type LocatorItem,
  type LocatorSubject,
  type LocatorTarget,
  type ReportRow,
} from '../../../ports/reports.ts';

/* i18n-ignore-start */ // codes, paths and the brief: read by the person or the AI who fixes the problem, in English
export const REPORT_KINDS = Object.freeze(['content', 'translation', 'display', 'broken', 'idea', 'other'] as const);
export const REPORT_STATUSES = Object.freeze(['new', 'seen', 'fixing', 'fixed', 'wontfix', 'duplicate'] as const);
export const REPORT_OPEN = Object.freeze(['new', 'seen', 'fixing'] as const);
export type ReportKind = (typeof REPORT_KINDS)[number];
export type ReportStatus = (typeof REPORT_STATUSES)[number];
/** Limits the database enforces too (cloud/supabase.sql §15). */
export const NOTE_MAX = 4000;
export const ROUTE_MAX = 600;
export const ITEM_MAX = 300;

/** The i18n component of a catalog key's prefix (i18n/<component>/en.arb, docs/i18n.md §5.1); 'roadmap.' lives in two. */
const COMPONENT: Readonly<Record<string, readonly string[]>> = {
  sh: ['shell'],
  engine: ['engine'],
  vault: ['vault'],
  social: ['social'],
  roadmap: ['roadmaps', 'roadmaps-map'],
  lang: ['lang'],
  lc: ['langcore'],
  err: ['errors'],
  loader: ['loader'],
  char: ['characters'],
  bridge: ['bridge'],
  mt: ['mt'],
  packs: ['packs'],
  email: ['email'],
  report: ['report'],
  ui: ['ui'],
  top: ['core'],
  home: ['core'],
  ch: ['core'],
  nav: ['core'],
  view: ['core'],
  acc: ['core'],
  set: ['core'],
  inuse: ['core'],
  pick: ['core'],
};
export const componentsOf = (key: string): readonly string[] => COMPONENT[key.split('.')[0] ?? ''] ?? ['core'];

/** The code that draws each screen (by the first part of its address). */
const CODE: Readonly<Record<string, string>> = {
  subject: 'engine/src/40_views.js',
  ch: 'engine/src/40_views.js',
  s: 'engine/src/40_views.js',
  ex: 'engine/src/30_exercises.js',
  run: 'engine/src/40_views.js',
  practice: 'engine/src/40_views.js',
  cards: 'engine/src/40_views.js',
  drill: 'engine/src/40_views.js',
  lang: 'engine/lang/*.js (→ engine/langui.js)',
  vault: 'engine/vault.js',
  people: 'engine/social.js',
  chat: 'engine/social.js',
  group: 'engine/social.js',
  search: 'engine/search.js',
  map: 'engine/curmap.js',
  learn: 'engine/shell.js',
  '': 'engine/shell.js',
  me: 'engine/shell.js',
  admin: 'engine/report.js',
};

export interface RepoFile {
  readonly path: string;
  readonly why: string;
}

/** The files of the repository (AnrPg/noema-lite) where the reported thing is written, most likely first. */
export function repoFiles(loc: Locator | null | undefined): RepoFile[] {
  const L = loc ?? {},
    out: RepoFile[] = [],
    s = L.subject ?? {},
    it = L.item ?? {},
    ch = it.chapter?.id || L.place?.chapter;
  const add = (path: string | undefined, why: string): void => {
    if (path && !out.some(x => x.path === path)) out.push({ path, why });
  };
  const tr = s.translation;
  if (s.id && s.origin === 'library') {
    const base = `library/subjects/${s.id}/`;
    if (tr && (it.exercise || it.card || it.block || it.drill || it.trap || it.section))
      add(base + `translations/${tr}/${ch || '<chapter>'}.json`, `the ${tr} translation the learner was reading (same ids as the source)`);
    if (ch)
      add(
        base + `chapters/${ch}.json`,
        'the chapter in the pack’s own language (or a patch in patches/ that adds or revises the item: search its id)',
      );
    add(base + 'patches/', 'additive patches: an item added later lives here (search its id)');
    if (s.bridge) add(base + `bridges/${s.bridge}.json`, `文A language help into ${s.bridge} (docs/BRIDGE.md)`);
    add(base + 'subject.json', 'the subject’s title, description, tutor');
  } else if (s.id && s.owner)
    add(`accounts/${s.owner}/packs/${s.id}/` + (ch ? `chapters/${ch}.json` : ''), 'a private pack of a local profile');
  else if (s.id)
    add(
      `(cloud) <owner>/packs/${s.id}.json`,
      `a pack in a learner’s account (origin: ${s.origin || '?'}), not in the repository: get it with the connector (noema_get_pack_url) or ask its owner`,
    );
  const course = L.lang?.['course'];
  if (course) add(`library/languages/${textOf(course)}/`, 'the language course (read docs/LANGUAGE_RULES.md before any change)');
  for (const k of L.target?.i18n ?? [])
    for (const c of componentsOf(k.key)) {
      add(`i18n/${c}/en.arb`, `interface text ${k.key} (English, written by hand)`);
      if (k.locale && k.locale !== 'en')
        add(
          `i18n/${c}/${k.locale}.arb`,
          `the ${k.locale} translation of ${k.key} (Weblate; Claude’s drafts: i18n/${c}/drafts/${k.locale}.arb)`,
        );
    }
  const page = L.route?.page;
  if (['display', 'broken'].includes(L.kind ?? '') || !out.length)
    add(CODE[page ?? ''] || 'engine/shell.js', 'the code that draws this screen');
  return out;
}

const $ = (x: unknown): string => textOf(x);
const line = (k: string, v: unknown): string => (v == null || v === '' ? '' : `- **${k}:** ${$(v)}\n`);
const q = (s: unknown): string => (s == null ? '' : '“' + $(s).replace(/\s+/g, ' ').trim() + '”');

/** The brief for whoever fixes it (Markdown, English): what was reported, the one place it points to, and where that is in
    the repository. */
export function reportBrief(r: ReportRow): string {
  const L: Locator = r.locator ?? {},
    it = L.item ?? {},
    s = L.subject ?? {},
    t = L.target ?? {},
    rt = L.route ?? {};
  let o = `# noema-lite problem report ${r.id || ''}\n\n`;
  o +=
    line('Kind', r.kind) +
    line('Status', r.status) +
    line('Sent', r.created_at || L.at) +
    line('By', [r.reporter_name, r.reporter_email].filter(Boolean).join(' · '));
  o += `\n## What the learner wrote\n\n${r.note ? '> ' + r.note.replace(/\n/g, '\n> ') : '(nothing — see the screenshot and the place)'}\n`;
  o +=
    `\n## The place (unique)\n\n` +
    line('Item id', r.item || L.itemRef) +
    line('Address', rt.hash ? '`' + rt.hash + '`' + (L.app?.url ? ` (open: ${L.app.url}${rt.hash})` : '') : '');
  if (s.id)
    o +=
      line(
        'Subject',
        `\`${s.id}\` “${s.title || ''}” · origin ${s.origin || '?'} · pack version ${$(s.version || '?')}${s.builtAt ? ' (built ' + s.builtAt + ')' : ''}`,
      ) +
      line(
        'Content language',
        `shown ${it.content?.shown || s.shown || '?'}${it.content?.translation || s.translation ? ` — a TRANSLATION of the pack’s ${it.content?.packLanguage || s.packLanguage || '?'}` : ' (the pack’s own language)'}${s.bridge ? ` · 文A help into ${s.bridge}` : ''}`,
      );
  if (it.chapter) o += line('Chapter', `\`${$(it.chapter.id)}\` (${$(it.chapter.num ?? '?')}) ${q(it.chapter.title)}`);
  if (it.section) o += line('Section', `\`${$(it.section.id)}\` ${q(it.section.title)}`);
  if (it.block)
    o += line(
      'Block',
      `\`${$(it.block.id)}\` = blocks[${$(it.block.index)}] of the section, type \`${$(it.block.t)}\`: ${q(it.block.text)}` +
        (it.block.textOwn ? ` · in the pack’s language: ${q(it.block.textOwn)}` : ''),
    );
  if (it.exercise)
    o += line(
      'Exercise',
      `\`${$(it.exercise.id)}\` type \`${it.exercise.type || '?'}\`${it.exercise.notInPack ? ' — NOT in the pack (' + $(it.exercise.note) + ')' : ''}: ${q(it.exercise.q)}` +
        (it.exercise.qOwn ? ` · in the pack’s language: ${q(it.exercise.qOwn)}` : '') +
        (it.exercise.cite ? ` · cite ${JSON.stringify(it.exercise.cite)}` : ''),
    );
  if (it.card)
    o += line('Flashcard', `key \`${$(it.card.key)}\` (flashcards[${$(it.card.index)}] of the chapter): ${q(it.card.q)} → ${q(it.card.a)}`);
  if (it.drill) o += line('Debug drill', `\`${$(it.drill.id)}\` ${q(it.drill.title)}`);
  if (it.trap) o += line('Trap', `\`${$(it.trap.id)}\` = pitfalls[${$(it.trap.index)}] ${q(it.trap.title)}`);
  if (it.field)
    o += line(
      'Field',
      `\`${$(it.field.path)}\` = ${q(it.field.shown)}` + (it.field.own != null ? ` · in the pack’s language: ${q(it.field.own)}` : ''),
    );
  if (L.lang)
    o += line(
      'Language course',
      Object.entries(L.lang)
        .map(([k, v]) => `${k} \`${$(v)}\``)
        .join(' · '),
    );
  if (t.text || t.selector) o += line(t.picked ? 'Pointed at' : 'In view', `${q(t.text)}${t.selector ? ' — `' + t.selector + '`' : ''}`);
  if ((t.i18n ?? []).length) o += line('Interface text', (t.i18n ?? []).map(k => `\`${k.key}\` (${$(k.locale)}) ${q(k.text)}`).join('; '));
  if ((t.data ?? []).length)
    o += line(
      'data-* of the element and its parents',
      (t.data ?? [])
        .map(d =>
          Object.entries(d)
            .map(([k, v]) => `${k}=${v}`)
            .join(' '),
        )
        .join(' ‹ '),
    );
  if (t.given) o += line('The learner’s answer', q(t.given));
  if (L.visible?.length) o += line('Also on screen', L.visible.map(v => `${$(v.ref)} ${q(v.text)}`).join('; '));
  const ui = L.ui ?? {},
    app = L.app;
  o +=
    `\n## The app\n\n` +
    line(
      'Build',
      [
        app?.version,
        app?.commit && 'commit ' + app.commit,
        app?.builtAt && 'built ' + app.builtAt,
        app?.frame ? 'the frame' : 'classic screens',
        app?.bundle && 'single-file bundle',
      ]
        .filter(Boolean)
        .join(' · '),
    ) +
    line(
      'Interface',
      `${ui.locale || '?'} (${ui.dir || 'ltr'}) · ${ui.theme || ''} · character ${ui.character || '?'} · ${ui.viewport ? $(ui.viewport.w) + '×' + $(ui.viewport.h) + ' @' + $(ui.viewport.dpr) : ''} · scrolled ${ui.scroll?.y ?? 0}px`,
    ) +
    line('Browser', ui.ua) +
    line('Screen', [L.screen?.title && q(L.screen.title), (L.screen?.crumbs ?? []).join(' › ')].filter(Boolean).join(' · '));
  if (L.errors?.length)
    o +=
      `\n## Recent errors in the console\n\n` +
      L.errors.map(e => `- ${$(e.level)} ${e.at || ''}: ${$(e.msg).slice(0, 300)}`).join('\n') +
      '\n';
  const files = repoFiles({ ...L, kind: r.kind ?? '' });
  o += `\n## Where to fix it (repository AnrPg/noema-lite)\n\n` + files.map(f => `- \`${f.path}\` — ${f.why}`).join('\n') + '\n';
  o += `\n## How\n\n1. Find the item by its id (unique in the pack) in the files above; never by its position alone.\n2. Fix the text where the learner read it: a translation is fixed in its translation file, the pack’s own text in the chapter (or the patch that added it); keep every id.\n3. Interface text: the key in i18n/<component>/en.arb (English) or the locale’s file; then node tools/i18n/check.js.\n4. Rebuild and check: python3 tools/build.py (validates the packs); language courses: docs/LANGUAGE_RULES.md first.\n5. Mark the report fixed with the commit or pull request (connector: noema_report_update, or #/admin/reports).\n`;
  return o;
}

/** A report as it is sent (one row of noema_error_reports): the place, the kind, the note, the screenshot. */
export function reportRow(id: string, loc: Locator, kind: string, note: string, shot: string | null): ReportRow {
  const clip = (s: unknown, n: number): string => {
    const x = $(s ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    return x.length > n ? x.slice(0, n) + '…' : x;
  };
  return {
    id,
    kind,
    note: clip(note, NOTE_MAX) || null,
    route: clip(loc.route?.hash, ROUTE_MAX),
    subject: loc.subject?.id || null,
    item: clip(loc.itemRef, ITEM_MAX),
    locator: loc,
    shot: shot || null,
    app_version: clip([loc.app?.version, loc.app?.commit && loc.app.commit.slice(0, 12)].filter(Boolean).join('+'), 80),
  };
}
/* i18n-ignore-end */
