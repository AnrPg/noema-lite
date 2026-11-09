/**
 * The lazy pieces of the page (tools/esbuild.mjs kind "lazy"; docs/ARCHITECTURE.md §6.1): build/<name>.js runs once, when it
 * is first needed, from the one-file bundle's inline copy or from the file next to the script that asks (build/app.js or
 * build/ui.js), and hands its module over on globalThis[key].
 */
import { NoemaError } from '../kernel/errors.ts';

/** What a loader needs of the page: its document (the one-file bundle's inline copies). */
export interface PieceHost {
  readonly document?: {
    getElementById(id: string): { readonly textContent: string | null } | null;
  };
}

/** The id of the inline copy of a lazy piece (build/<name>.js) in the one-file bundle (tools/build.py writes it). */
export const lazySourceId = (name: string): string => `noema-lazy:${name}`;

/** Where build/<name>.js is: next to this script. */
const pieceUrlNextTo = (script: string | undefined, name: string): string | null =>
  script && /(?:app|ui)\.js(\?.*)?$/.test(script) ? script.replace(/(?:app|ui)\.js(\?.*)?$/, `${name}.js$1`) : null;

/**
 * Runs the lazy piece build/<name>.js once (the bundle's inline copy, else the file next to app.js) and hands over what it
 * left on globalThis[key] (src/composition/engines.ts, src/composition/contracts.ts).
 */
export function pieceLoader<T>(page: PieceHost, script: string | undefined, name: string, key: string): () => Promise<T> {
  const url = pieceUrlNextTo(script, name),
    file = `build/${name}.js`;
  const left = (): T | undefined => (globalThis as Record<string, unknown>)[key] as T | undefined;
  let loading: Promise<T> | null = null;
  return () =>
    (loading ??= new Promise<T>((resolve, reject) => {
      const doc = (globalThis as { document?: Document }).document;
      const settle = (): void => {
        const p = left();
        if (p) resolve(p);
        else reject(new NoemaError('compute.unavailable', `${file} did not load`));
      };
      if (left()) {
        settle();
        return;
      }
      if (!doc) {
        reject(new NoemaError('compute.unavailable', `no page to load ${file} into`));
        return;
      }
      const s = doc.createElement('script');
      const inline = page.document?.getElementById(lazySourceId(name))?.textContent;
      if (inline) {
        s.textContent = inline;
        doc.head.append(s);
        settle();
        return;
      }
      if (!url) {
        reject(new NoemaError('compute.unavailable', `${file} cannot be located`));
        return;
      }
      s.src = url;
      s.onload = settle;
      s.onerror = () => {
        reject(new NoemaError('compute.unavailable', `${file} could not be loaded`));
      };
      doc.head.append(s);
    }).catch((e: unknown) => {
      loading = null; // a failed load may be tried again
      throw e;
    }));
}

/** Where build/lang-activities.js leaves its mount function (src/composition/lang-activities.ts, area5.ts). */
export const AREA5_PIECE_KEY = '__noemaLangActivitiesPiece';
