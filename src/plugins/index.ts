/* The microkernel: plugin manifests and the registry (docs/ARCHITECTURE.md "Microkernel"). */
export { PLUGIN_KINDS, PLUGIN_ID_RE, CAPABILITY_RE, LOCALE_RE, checkManifest, freezeManifest } from './manifest.ts';
export type { PluginKind, PluginId, PluginManifest, Plugin, ManifestProblem } from './manifest.ts';
export { createPluginRegistry } from './registry.ts';
export type { PluginRegistry, PluginError, PluginErrorCode, PluginState, Outcome, Support } from './registry.ts';
