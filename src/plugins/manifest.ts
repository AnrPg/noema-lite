/* The plugin manifest of the microkernel (docs/ARCHITECTURE.md "Microkernel"): what a plugin is, before any of its code is loaded.
   A manifest is data: the app reads every manifest at start (cheap), and loads a plugin's code only when something needs it. */

/** what a plugin adds to the app */
export type PluginKind = 'engine' | 'runtime' | 'exercise-type' | 'theme' | 'mascot';
export const PLUGIN_KINDS: readonly PluginKind[] = ['engine', 'runtime', 'exercise-type', 'theme', 'mascot'];

/** "name@N": a lower-case name and the major version of the contract it implements (sim-spec@1 engines: "prob@1") */
export type PluginId = `${string}@${number}`;
export const PLUGIN_ID_RE = /^[a-z][a-z0-9-]{0,39}@[1-9][0-9]{0,3}$/;

/** a capability: what a plugin needs from the host or other plugins, or provides ("engine:prob@1", "kernel:expr", "worker") */
export const CAPABILITY_RE = /^[a-z][a-z0-9-]*(?::[a-z0-9][a-z0-9@./-]*)?$/;

/** a UI locale tag of the app's catalogues (i18n/<component>/<locale>.arb): "en", "el", "zh-Hans", "ar-EG" */
export const LOCALE_RE = /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,4})?$/;

export interface PluginManifest {
  /** "name@N" */
  readonly id: PluginId;
  readonly kind: PluginKind;
  /** the implementation's version (semver); its major is the N of the id */
  readonly version: string;
  /** the capabilities it needs before it can be loaded: the host's ("worker", "kernel:expr") or another plugin's ("engine:logic@1") */
  readonly needs: readonly string[];
  /** what it adds: "engine:prob@1" for an engine (what pack.requires names) */
  readonly provides: readonly string[];
  /** the UI locales its own strings come in; [] = it shows no text of its own (an engine: codes and numbers only) */
  readonly locales: readonly string[];
}

/** a plugin: its manifest and its lazy entry (an import() of its code), called at most once by the registry */
export interface Plugin<T> {
  readonly manifest: PluginManifest;
  readonly entry: () => Promise<T>;
}

export type ManifestProblem = { readonly path: string; readonly code: 'id' | 'kind' | 'version' | 'capability' | 'locale' | 'duplicate' };

const SEMVER_RE = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;

/** the problems of a manifest ([] = a valid one) */
export function checkManifest(m: PluginManifest): ManifestProblem[] {
  const out: ManifestProblem[] = [];
  if (!PLUGIN_ID_RE.test(m.id)) out.push({ path: 'id', code: 'id' });
  if (!PLUGIN_KINDS.includes(m.kind)) out.push({ path: 'kind', code: 'kind' });
  const v = SEMVER_RE.exec(m.version), major = m.id.split('@')[1];
  if (!v || v[1] !== major) out.push({ path: 'version', code: 'version' });
  const caps = (list: readonly string[], at: string): void => {
    const seen = new Set<string>();
    list.forEach((c, i) => {
      if (!CAPABILITY_RE.test(c)) out.push({ path: `${at}[${i}]`, code: 'capability' });
      else if (seen.has(c)) out.push({ path: `${at}[${i}]`, code: 'duplicate' });
      seen.add(c);
    });
  };
  caps(m.needs, 'needs');
  caps(m.provides, 'provides');
  m.locales.forEach((l, i) => { if (!LOCALE_RE.test(l)) out.push({ path: `locales[${i}]`, code: 'locale' }); });
  return out;
}

/** a manifest frozen with its lists, so no caller can change what the registry holds */
export function freezeManifest(m: PluginManifest): PluginManifest {
  return Object.freeze({ ...m, needs: Object.freeze([...m.needs]), provides: Object.freeze([...m.provides]), locales: Object.freeze([...m.locales]) });
}
