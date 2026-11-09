/**
 * The modules build/ui.js shares with the lazy pieces of screens (build/lang-activities.js): one Lit, one kit, one overlay
 * stack and one copy of each element's class on the page. build/ui.js puts this table on globalThis.__noemaUiShared
 * (src/composition/ui.ts); a piece is built with the esbuild plugin `uiShared` (tools/esbuild.mjs), which turns every
 * import of one of these modules into a read of that table and refuses any other module of Lit or of src/ui/{core,kit,
 * frame,router} (it would be a second copy). The keys are the import's module: a package name, or the path from the
 * repository's root. tools/esbuild.mjs reads the keys from this file.
 */
import * as lit from 'lit';
import * as ifDefined from 'lit/directives/if-defined.js';
import * as live from 'lit/directives/live.js';
import * as repeat from 'lit/directives/repeat.js';
import * as styleMap from 'lit/directives/style-map.js';
import * as unsafeHtml from 'lit/directives/unsafe-html.js';
import * as element from '../ui/core/element.ts';
import * as keys from '../ui/core/keys.ts';
import * as overlays from '../ui/core/overlays.ts';
import * as services from '../ui/core/services.ts';
import * as styles from '../ui/core/styles.ts';
import * as dialog from '../ui/kit/dialog.ts';
import * as icons from '../ui/kit/icons.ts';
import * as layer from '../ui/frame/layer.ts';
import * as routes from '../ui/router/routes.ts';

export const UI_SHARED: Readonly<Record<string, object>> = Object.freeze({
  lit: lit,
  'lit/directives/if-defined.js': ifDefined,
  'lit/directives/live.js': live,
  'lit/directives/repeat.js': repeat,
  'lit/directives/style-map.js': styleMap,
  'lit/directives/unsafe-html.js': unsafeHtml,
  'src/ui/core/element.ts': element,
  'src/ui/core/keys.ts': keys,
  'src/ui/core/overlays.ts': overlays,
  'src/ui/core/services.ts': services,
  'src/ui/core/styles.ts': styles,
  'src/ui/kit/dialog.ts': dialog,
  'src/ui/kit/icons.ts': icons,
  'src/ui/frame/layer.ts': layer,
  'src/ui/router/routes.ts': routes,
});

/** Where build/ui.js leaves the table for the pieces. */
export const UI_SHARED_KEY = '__noemaUiShared';
