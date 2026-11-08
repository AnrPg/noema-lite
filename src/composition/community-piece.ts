/**
 * The entry of build/community.js (tools/esbuild.mjs, kind "lazy"): the community screens (search, vault, people, ⚑
 * reports, #/engines, Explore and sharing: src/composition/community-ui.ts, Lit on the UI kit), loaded the first time one
 * of them is opened (src/composition/community-app.ts; the load is wired in src/composition/browser.ts). It hands them
 * over on self.__noemaCommunityPiece, which the loader reads right after the script has run. The only module with a
 * side effect on import.
 */
import * as screens from './community-ui.ts';

(globalThis as { __noemaCommunityPiece?: typeof screens }).__noemaCommunityPiece = screens;
