/**
 * #/author, the activity author (docs/activities-dev/authoring_ui.md): a page of the frame (NoemaShell.registerPage) and of the
 * classic screens (Noema.app.author, which the study engine's router calls with shell: false). Its code is the lazy piece
 * build/author.js (src/composition/author.ts), run on the first visit with what it needs first: the shipped schemas and
 * reference activities (engine/activity_author_schemas.js; the one-file bundle has them inline), every engine of the library
 * with the schema kernel (NoemaCore.engines) and the content checks (NoemaCore.contracts.ready()). The activity is not added
 * to the open subject: the author downloads its folder.
 */
import type { AuthorPiece } from '../author.ts';
import { h } from './dom.ts';
import type { Chrome } from './host.ts';

export interface AuthorPageHost {
  registerPage(key: string, fn: (args: readonly string[]) => unknown): void;
  page(c: Chrome, ...kids: Node[]): HTMLElement;
  subjectChrome(extra?: Chrome): Chrome;
  readonly engine: unknown;
}
interface PageWindow {
  NOEMA_ENGINE_BASE?: string;
  NoemaActivitySchemas?: unknown;
  NoemaI18n?: { t(key: string): string };
  NoemaCore?: {
    engines: { ids(): readonly string[]; load(ids: readonly string[]): Promise<unknown>; loadSchema(): Promise<unknown> };
    contracts: { ready(): Promise<unknown> };
  };
  __noemaAuthorPiece?: AuthorPiece;
}
const W = (): PageWindow => globalThis as unknown as PageWindow;
const tE = (k: string): string => W().NoemaI18n?.t(k) ?? k.split('.').pop() ?? k;

/** runs a classic script once: the inline copy of the one-file bundle (<script type="text/plain" id>), else its file */
function runScript(src: string, inlineId: string | null): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script'),
      inline = inlineId ? document.getElementById(inlineId)?.textContent : null;
    if (inline) {
      s.textContent = inline;
      document.head.append(s);
      resolve();
      return;
    }
    s.src = src;
    s.onload = () => {
      resolve();
    };
    s.onerror = () => {
      reject(new Error(src + ' could not be loaded'));
    };
    document.head.append(s);
  });
}
/** build/author.js: next to the UI root's own script */
function pieceUrl(): string {
  const ui = [...document.scripts].map(s => s.src).find(u => /\bbuild\/ui\.js(\?.*)?$/.test(u));
  return ui ? ui.replace(/ui\.js(\?.*)?$/, 'author.js$1') : 'build/author.js';
}
let loading: Promise<AuthorPiece> | null = null;
/** everything the author needs, once (a failed load may be tried again) */
function loadAuthor(): Promise<AuthorPiece> {
  return (loading ??= (async () => {
    if (!W().NoemaActivitySchemas) await runScript((W().NOEMA_ENGINE_BASE ?? 'engine/') + 'activity_author_schemas.js', null);
    const C = W().NoemaCore;
    if (!C) throw new Error('NoemaCore is not on the page');
    // the author offers every engine of the library: each one's table and checks, and the schema kernel its forms come from
    await Promise.all([C.engines.load(C.engines.ids()), C.engines.loadSchema(), C.contracts.ready()]);
    if (!W().__noemaAuthorPiece) await runScript(pieceUrl(), 'noema-lazy:author');
    const p = W().__noemaAuthorPiece;
    if (!p) throw new Error('build/author.js did not load');
    return p;
  })().catch((e: unknown) => {
    loading = null;
    throw e;
  }));
}
const onAuthor = (): boolean => /^#\/author(?:[/?]|$)/.test(location.hash);

/** Draws the author into `box` once it has loaded (the learner may have gone elsewhere meanwhile); `lead` stays above it. */
async function open(box: HTMLElement, lead: readonly Node[]): Promise<void> {
  box.replaceChildren(...lead, h('p', { class: 'muted' }, tE('engine.author.loading')));
  let piece: AuthorPiece;
  try {
    piece = await loadAuthor();
  } catch (e) {
    console.warn('[noema] author', e); // i18n-ignore (a console line)
    box.replaceChildren(...lead, h('p', {}, tE('engine.author.loadFailed')));
    return;
  }
  if (!onAuthor() || !box.isConnected) return;
  box.replaceChildren(...lead, piece.open());
}

/** #/author in the frame, and Noema.app.author for the classic router */
export function registerAuthorPage(shell: AuthorPageHost, noema: { app?: Record<string, unknown> }): void {
  shell.registerPage('author', () => {
    const title = tE('engine.author.title');
    const c: Chrome = shell.engine
      ? shell.subjectChrome({ sub: true, crumbs: [[title]], back: '#/subject' })
      : { tab: 'learn', crumbs: [[title]], back: '#/' };
    const kept = document.querySelector('main noema-author'); // the same page drawn again (a subject attached, a theme): the work stays
    const v = shell.page({ ...c, cls: 'ns-author' });
    if (kept) v.append(kept);
    else void open(v, []);
  });
  (noema.app ??= {})['author'] = (box: HTMLElement, ...lead: Node[]): Promise<void> => open(box, lead); // the classic router (engine/src/40_views.js, shell: false)
}
