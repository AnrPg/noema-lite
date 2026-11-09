/**
 * The entry of build/ui.js (tools/esbuild.mjs, kind "page"): the app's UI root (ui-root.ts). index.html and the one-file
 * bundle load it right after build/app.js and engine/i18n.js, before every older script, so window.Noema,
 * window.NoemaThemes and window.NoemaShell exist when they load; the app starts once the page has loaded. The only
 * module with a side effect on import; tests import ui-root.ts instead.
 */
import { noemaI18n } from '../adapters/browser/i18n.ts';
import { conversationsWindow, type MountedTutor } from './conversations-window.ts';
import { mdElement } from './tutor-page.ts';
import { createApp } from './ui-root.ts';

const app = createApp();
const page = window as unknown as Record<string, unknown>;
page['Noema'] = app.Noema;
page['NoemaThemes'] = app.themes;
page['NoemaShell'] = app.shell;
// the tutor of the open subject (build/study.js: NoemaCore.studyUi.tutor, mounted by engine/src/40_views.js), and Me ›
// Conversations in the frame
const i18n = noemaI18n();
const currentTutor = (): MountedTutor | null =>
  (page['NoemaCore'] as { studyUi?: { currentTutor(): MountedTutor | null } } | undefined)?.studyUi?.currentTutor() ?? null;
const win = conversationsWindow(i18n, currentTutor);
page['NoemaTutor'] = Object.freeze({
  current: currentTutor,
  md: (t: string): HTMLElement => mdElement(t, i18n, () => undefined),
  conversations: win.conversations,
  goConvo: win.goConvo,
});
Object.assign(app.shell, { convos: win.conversations, goConvo: win.goConvo });
const run = (): void => {
  app.start().catch((e: unknown) => {
    console.error('[noema] start', e);
  });
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
else run();
