/**
 * NoemaShell.mt (build/ui.js): 🌐 the screens of the machine translation of shared texts (src/features/translation/ui) over
 * NoemaCore.mt (src/composition/translation.ts):
 *
 *   mark(node, { language, kind, private }) · toggle(acc, nodes) · bar(acc, root) · panel(acc, { compact, heading }) · consent(acc)
 */
import { noemaI18n } from '../adapters/browser/i18n.ts';
import { translationUi, type TranslationUi } from '../features/translation/ui/mt.ts';
import type { MtGlobals } from './translation.ts';

/** NoemaShell.mt: the screens over NoemaCore.mt and the app's words; a dialog goes to the frame, else the body. */
export function pageTranslationUi(g: MtGlobals = globalThis as MtGlobals): TranslationUi {
  const mt = g.NoemaCore?.mt;
  if (!mt) throw new Error('NoemaCore.mt is missing: build/app.js loads before build/ui.js'); // a log: a page built wrong
  return translationUi({
    mt,
    i18n: noemaI18n(),
    host: () => document.querySelector<HTMLElement>('noema-app-frame') ?? document.body,
  });
}
