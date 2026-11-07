/* Composition root of the Claude connector: the Netlify function dist/functions/mcp.mjs (docs/CLAUDE_CONNECTOR.md).
   tools/connector_bundle.mjs bundles this file with esbuild; it provides `virtual:noema-connector-data` (the public
   configuration and the documents tools/build.py collects) and the `legacy:engine/…` texts of the app's engine files, and
   appends the function's Netlify config (its paths) as a literal `export const config`, which Netlify reads statically. */
import data from 'virtual:noema-connector-data';
import { engineFrom } from '../connector/engine/index.ts';
import { LEGACY_SOURCES } from '../connector/engine/sources.ts';
import type { LegacyScope } from '../connector/engine/legacy.ts';
import { createConnector, type ConnectorData, type Router } from '../connector/index.ts';

/** Wire the connector: the app's engine (loaded once per instance, in a scope of its own), the data, the network.
    `provide` hands the engine modules that are already ES modules (src/engines) to the legacy files that need them. */
export function register(d: ConnectorData = data, o: { fetch?: typeof fetch; provide?: LegacyScope } = {}): Router {
  const engine = engineFrom(LEGACY_SOURCES, o.provide ?? {});
  return createConnector({ ...d, engine, fetch: o.fetch ?? ((input, init) => fetch(input, init)) });
}

let connector: Router | null = null;
export default function handler(req: Request): Promise<Response> {
  connector ??= register();
  return connector.handler(req);
}
