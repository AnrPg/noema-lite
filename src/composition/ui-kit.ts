/**
 * The entry of build/ui-kit.js (tools/esbuild.mjs, kind "dev"): the kit's demo on its route #/ui-kit. The app's root
 * (build/ui.js) loads this script instead of starting the app when a development page (localhost) opens #/ui-kit; it
 * never loads on the start screen or in the site. The only module with a side effect on import; tests import
 * ui-kit-root.ts instead.
 */
import { startUiKit } from './ui-kit-root.ts';

void startUiKit();
