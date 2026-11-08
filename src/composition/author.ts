/**
 * The entry of build/author.js (tools/esbuild.mjs, kind "lazy"): the activity author (#/author; docs/activities-dev/authoring_ui.md)
 * — its domain and application (src/features/author), its screens (src/ui/screens/author: noema-schema-form, noema-author) —
 * wired to what the page has: the engine library and the content checks (window.NoemaCore), the words (the I18n port over
 * engine/i18n.js), the shipped schemas and reference activities (engine/activity_author_schemas.js) and, for the preview, the
 * app's sim-spec@1 runtime (ACT, engine/src/32_activities.js: its entry points are called, never moved). The page runs the
 * piece the first time #/author opens (src/composition/shell/author-page.ts); it hands over self.__noemaAuthorPiece.
 */
import { noemaI18n } from '../adapters/browser/i18n.ts';
import { createAuthoring, type AuthorChecks, type AuthorEngines } from '../features/author/application/index.ts';
import type { AuthorDoc } from '../ports/authoring.ts';
import { defineAuthor, type AuthorPreview, type NoemaAuthor } from '../ui/screens/author/index.ts';

/** the app's activity runtime (a global of the study engine, engine/src/32_activities.js) as the preview uses it */
interface ActRuntime {
  readonly ITEMS: Record<string, unknown>;
  mount(box: HTMLElement, id: string, o: { place: string; start: boolean }): { destroy(): void };
  engine?(id: string): unknown;
}
declare const ACT: ActRuntime | undefined;
/** the engines' groups of #/engines (engine/src/49_lib_view.js) */
declare const ENGINE_GROUPS: readonly (readonly [string, readonly string[]])[] | undefined;
/** the study engine's state and the learning log (the preview forgets a saved state of its activity) */
declare const S: { act?: Record<string, unknown> } | undefined;

interface Page {
  NoemaCore?: { engines?: unknown; content?: unknown; learning?: { record(e: unknown): unknown } };
  Noema?: { subject?: { id?: string } | null };
  NoemaActivitySchemas?: Record<string, unknown>;
  NoemaActivityRefs?: Record<string, unknown>;
}
const W = (): Page => globalThis as unknown as Page;
const act = (): ActRuntime | null => (typeof ACT !== 'undefined' && typeof ACT.mount === 'function' ? ACT : null);

/** the preview: the app's real sim-spec@1 runtime (ACT.mount), always from the spec's defaults (never a saved state); the
    runtime is looked up at every show, since the frame may still be starting the subject's engine when the page opens */
function actPreview(): AuthorPreview {
  const ID = 'author-preview',
    key = 'blk:author:' + ID;
  const forget = (): void => {
    try {
      if (typeof S !== 'undefined' && S.act?.[key])
        W().NoemaCore?.learning?.record({
          type: 'activity.saved',
          subject: W().Noema?.subject?.id,
          item: key,
          data: { v: 1, state: null },
        });
    } catch (e) {
      console.warn('[noema] author preview state', e); // i18n-ignore (a console line)
    }
  };
  return {
    ready: () => !!act(),
    show(box, it, spec, strings, locale) {
      const A = act();
      if (!A) throw new Error('the activity runtime is not on the page');
      forget();
      A.ITEMS[ID] = { ...it, id: ID, spec: structuredClone(spec), strings: { [locale]: strings[locale] ?? {} } };
      const sess = A.mount(box, ID, { place: 'author', start: true });
      return {
        destroy() {
          try {
            sess.destroy();
          } catch (e) {
            console.warn('[noema] author preview', e); // i18n-ignore (a console line)
          }
          forget();
          Reflect.deleteProperty(A.ITEMS, ID);
        },
      };
    },
  };
}

const words = noemaI18n();
const authoring = createAuthoring({
  engines: () => (W().NoemaCore?.engines as AuthorEngines | undefined) ?? null,
  checks: () => (W().NoemaCore?.content as AuthorChecks | undefined) ?? null,
  words: { has: k => words.has(k), t: (k, v) => words.t(k, v) },
  refs: () => W().NoemaActivityRefs ?? {},
  schemas: () => Object.values(W().NoemaActivitySchemas ?? {}),
  runnable: id => {
    const A = act();
    return !A?.engine || !!A.engine(id);
  },
  groups: () => (typeof ENGINE_GROUPS !== 'undefined' ? ENGINE_GROUPS : []),
});

/** what build/author.js hands the page */
export interface AuthorPiece {
  /** a new author page (the engines, the schema kernel and the checks are loaded): the element to put in <main> */
  open(value?: AuthorDoc): NoemaAuthor;
}
let registered = false;
const piece: AuthorPiece = Object.freeze({
  open(value?: AuthorDoc): NoemaAuthor {
    defineAuthor(customElements);
    if (!registered) {
      authoring.registry(); // the forms' schemas, every library engine's and the parts schema
      registered = true;
    }
    const el = document.createElement('noema-author');
    el.service = authoring.service;
    el.preview = actPreview();
    if (value) el.set(value);
    return el;
  },
});
(globalThis as { __noemaAuthorPiece?: AuthorPiece }).__noemaAuthorPiece = piece;
