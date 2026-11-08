/* The plugin registry of the microkernel: manifests in, plugins loaded on demand (once), capability checks, and the query the pack
   checker and the activity core ask ("does this app support everything pack.requires names?"). No DOM, no network: a plugin's code
   comes from its own entry (an import() the bundler resolves). Errors are values (Outcome), never thrown at the caller. */
import { checkManifest, freezeManifest, type ManifestProblem, type Plugin, type PluginKind, type PluginManifest } from './manifest.ts';

export type PluginErrorCode = 'invalid-manifest' | 'duplicate' | 'unknown-plugin' | 'missing-capability' | 'load-failed';
export interface PluginError {
  readonly code: PluginErrorCode;
  readonly id: string;
  /** missing-capability: what the host and the registered plugins do not provide */
  readonly missing?: readonly string[];
  /** invalid-manifest: what is wrong with it */
  readonly problems?: readonly ManifestProblem[];
  /** load-failed: the entry's own message */
  readonly cause?: string;
}
export type Outcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: PluginError };
export type PluginState = 'registered' | 'loading' | 'loaded' | 'failed';
export interface Support {
  readonly ok: boolean;
  readonly missing: readonly string[];
}

export interface PluginRegistry<T> {
  /** adds a plugin (its manifest is checked; an id is registered once) */
  register(plugin: Plugin<T>): Outcome<PluginManifest>;
  has(id: string): boolean;
  manifest(id: string): PluginManifest | null;
  /** every manifest, in the order registered (of one kind when given) */
  manifests(kind?: PluginKind): readonly PluginManifest[];
  /** the host's capabilities and everything the registered plugins provide (loaded or not: a plugin is loaded when needed) */
  provided(): ReadonlySet<string>;
  /** the query of the pack checker: which of `requires` this app cannot give */
  supports(requires: readonly string[]): Support;
  /** what a plugin needs that nobody provides ([] = it can be loaded) */
  missingFor(id: string): readonly string[];
  state(id: string): PluginState | null;
  /** loads a plugin's code: the entry runs once; every later call gets the same value. A failed load may be tried again. */
  load(id: string): Promise<Outcome<T>>;
  /** the loaded value, or null (not loaded yet, or failed) */
  loaded(id: string): T | null;
  /** a plugin whose code is already in hand (a bundle that has it statically): loaded now, its entry is never called */
  adopt(id: string, value: T): Outcome<T>;
  /** called once per plugin when it is loaded (or adopted); → unsubscribe */
  onLoad(listener: (id: string, value: T) => void): () => void;
}

interface Slot<T> {
  readonly plugin: Plugin<T>;
  state: PluginState;
  value: T | null;
  pending: Promise<Outcome<T>> | null;
}

/** the id of a manifest as text for an error, whatever a bad manifest holds there (its type is only what checkManifest proves) */
const shownId = (id: unknown): string => (typeof id === 'string' ? id : JSON.stringify(id) || String(id));

export function createPluginRegistry<T>(opts: { readonly host?: readonly string[] } = {}): PluginRegistry<T> {
  const slots = new Map<string, Slot<T>>();
  const host = new Set(opts.host ?? []);
  const listeners: Array<(id: string, value: T) => void> = [];
  const fail = (code: PluginErrorCode, id: string, extra: Partial<PluginError> = {}): { ok: false; error: PluginError } => ({
    ok: false,
    error: { code, id, ...extra },
  });

  function provided(): ReadonlySet<string> {
    const out = new Set(host);
    for (const s of slots.values()) for (const p of s.plugin.manifest.provides) out.add(p);
    return out;
  }
  function missingFor(id: string): readonly string[] {
    const s = slots.get(id);
    if (!s) return [];
    const have = provided();
    return s.plugin.manifest.needs.filter(c => !have.has(c));
  }
  function settle(id: string, s: Slot<T>, value: T): Outcome<T> {
    s.state = 'loaded';
    s.value = value;
    s.pending = null;
    for (const f of listeners.slice()) f(id, value);
    return { ok: true, value };
  }

  return {
    register(plugin) {
      const problems = checkManifest(plugin.manifest);
      if (problems.length) return fail('invalid-manifest', shownId(plugin.manifest.id), { problems });
      const m = freezeManifest(plugin.manifest);
      if (slots.has(m.id)) return fail('duplicate', m.id);
      slots.set(m.id, { plugin: { manifest: m, entry: plugin.entry }, state: 'registered', value: null, pending: null });
      return { ok: true, value: m };
    },
    has: id => slots.has(id),
    manifest: id => slots.get(id)?.plugin.manifest ?? null,
    manifests: kind => [...slots.values()].map(s => s.plugin.manifest).filter(m => !kind || m.kind === kind),
    provided,
    supports(requires) {
      const have = provided(),
        missing = requires.filter(r => !have.has(r));
      return { ok: missing.length === 0, missing };
    },
    missingFor,
    state: id => slots.get(id)?.state ?? null,
    load(id) {
      const s = slots.get(id);
      if (!s) return Promise.resolve(fail('unknown-plugin', id));
      if (s.state === 'loaded' && s.value !== null) return Promise.resolve({ ok: true, value: s.value });
      if (s.pending) return s.pending;
      const missing = missingFor(id);
      if (missing.length) return Promise.resolve(fail('missing-capability', id, { missing }));
      s.state = 'loading';
      s.pending = s.plugin.entry().then(
        value => (s.state === 'loaded' && s.value !== null ? { ok: true as const, value: s.value } : settle(id, s, value)),
        (e: unknown) => {
          s.state = 'failed';
          s.pending = null;
          return fail('load-failed', id, { cause: e instanceof Error ? e.message : String(e) });
        },
      );
      return s.pending;
    },
    loaded: id => slots.get(id)?.value ?? null,
    adopt(id, value) {
      const s = slots.get(id);
      if (!s) return fail('unknown-plugin', id);
      if (s.state === 'loaded' && s.value !== null) return { ok: true, value: s.value };
      return settle(id, s, value);
    },
    onLoad(listener) {
      listeners.push(listener);
      return () => {
        const i = listeners.indexOf(listener);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
  };
}
