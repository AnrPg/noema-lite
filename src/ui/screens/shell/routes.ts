/**
 * Every address of the app (docs/UI_MAP.md), as one typed table. The first segment names the page and its owner:
 * the shell's own pages (src/ui/screens/shell), the pages the other areas register into the frame (engine/app/*.js,
 * engine/curmap.js, the community screens of src/composition/community-ui.ts, the language world), and the
 * open subject's pages, which the study engine draws (engine/src/*).
 */
import { defineRoutes, splitHash } from '../../router/routes.ts';

export const APP_ROUTES = defineRoutes({
  today: '/',
  learn: '/learn',
  shelf: '/shelf',
  map: '/map/:id/:step?',
  langHome: '/lang',
  lang: '/lang/*course',
  explore: '/explore/:kind?',
  discover: '/discover',
  progress: '/progress',
  admin: '/admin/*what',
  settings: '/me/:section?',
  help: '/help',
  subjects: '/subjects',
  profile: '/profile',
  person: '/u/:id',
  character: '/character',
  search: '/search',
  vaultHome: '/vault',
  vault: '/vault/*rest',
  people: '/people',
  chat: '/chat/:room',
  group: '/group/:room',
  join: '/join/:code',
  connectClaude: '/connect-claude',
});
export type AppRoutes = typeof APP_ROUTES.table;

/** the first segments the open subject's engine draws (engine/src/40_views.js); #/engines: the engines of activities and
    requests for new ones (#/author, the activity author, is a page of its own: src/composition/shell/author-page.ts) */
export const ENGINE_ROUTES: ReadonlySet<string> = new Set([
  'subject',
  'ch',
  's',
  'practice',
  'run',
  'srun',
  'boss',
  'lightning',
  'cards',
  'drills',
  'drill',
  'mistakes',
  'new',
  'ex',
  'engines',
]);

/** An address as the frame dispatches it: the page (its first segment) and the rest of its path. */
export interface Place {
  readonly page: string;
  readonly args: readonly string[];
  readonly query: Readonly<Record<string, string>>;
}
export function placeOf(hash: string): Place {
  const { path, query } = splitHash(hash || '#/');
  const dec = path.map(x => {
    try {
      return decodeURIComponent(x);
    } catch {
      return x;
    }
  });
  return { page: dec[0] ?? '', args: dec.slice(1), query };
}
