/* Composition root of the Claude connector: the Netlify function dist/functions/mcp.mjs (docs/CLAUDE_CONNECTOR.md).
   tools/connector_bundle.mjs bundles this file with esbuild; it provides `virtual:noema-connector-data` (the public
   configuration and the documents tools/build.py collects), the `legacy:engine/…` texts of the app's engine files and the
   engines' Worker bundles (`noema-worker:`, tools/esbuild.mjs noemaWorkers), and appends the function's Netlify config (its
   paths) as a literal `export const config`, which Netlify reads statically. */
import data from 'virtual:noema-connector-data';
import * as contracts from '../contracts/index.ts';
import { nodeEngines } from '../engines/node.ts';
import { engineFrom } from '../connector/engine/index.ts';
import { LEGACY_SOURCES } from '../connector/engine/sources.ts';
import { createConnector, type ConnectorData, type Router } from '../connector/index.ts';

/** Wire the connector: the app's engine files (loaded once per instance, in a scope of their own) with the new code they read
    as `NoemaCore` — the data contracts and the engine library with every engine in hand (the pack checks run synchronously) —,
    the data, the network. */
export function register(d: ConnectorData = data, o: { fetch?: typeof fetch } = {}): Router {
  const engine = engineFrom(LEGACY_SOURCES, { NoemaCore: Object.freeze({ version: 1, contracts, engines: nodeEngines() }) });
  return createConnector({ ...d, engine, fetch: o.fetch ?? ((input, init) => fetch(input, init)) });
}

let connector: Router | null = null;
export default function handler(req: Request): Promise<Response> {
  connector ??= register();
  return connector.handler(req);
}
