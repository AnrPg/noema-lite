/**
 * The entry of build/ui.js (tools/esbuild.mjs, kind "page"): the app's UI root (ui-root.ts). index.html and the one-file
 * bundle load it right after build/app.js and engine/i18n.js, before every older script, so window.Noema,
 * window.NoemaThemes and window.NoemaShell exist when they load; the app starts once the page has loaded. The only
 * module with a side effect on import; tests import ui-root.ts instead.
 */
import { createApp } from './ui-root.ts';

const app = createApp();
const page = window as unknown as Record<string, unknown>;
page['Noema'] = app.Noema;
page['NoemaThemes'] = app.themes;
page['NoemaShell'] = app.shell;
const run = (): void => {
  app.start().catch((e: unknown) => {
    console.error('[noema] start', e);
  });
};
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
else run();
