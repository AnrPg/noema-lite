/* The noema-lite MCP connector (docs/CLAUDE_CONNECTOR.md): lets a learner's OWN Claude (claude.ai / Desktop, their own
   plan) create and update subject packs, Roadmaps and language courses directly in their noema-lite account.
   Every call carries the user's own access token, so Supabase row-level security applies exactly as in the app: this
   server holds NO secret key. src/composition/connector.ts builds it with the engine and the bundled data. */
import type { ConnectorEnv } from './env.ts';
import { createRouter, type Router } from './router.ts';
import { KvStore } from './services/kv.ts';
import { Bridges, SourceFiles } from './services/rows.ts';
import { Sagas } from './services/sagas.ts';
import { Storage } from './services/storage.ts';
import { Supabase, type AuthUser } from './services/supabase.ts';
import type { Tool, ToolContext } from './tool.ts';
import { TOOLS } from './tools/index.ts';

export type { ConnectorEnv, ConnectorData, ConnectorConfig } from './env.ts';
export type { Router } from './router.ts';
export { TOOLS } from './tools/index.ts';

/** The services of one signed-in call. */
export function contextFor(env: ConnectorEnv, token: string, user: AuthUser): ToolContext {
  const sb = new Supabase(env.config, token, env.fetch);
  return { env, engine: env.engine, user, uid: user.id, sb, kv: new KvStore(sb, user.id), storage: new Storage(sb), sourceFiles: new SourceFiles(sb, user.id), bridges: new Bridges(sb, user.id), sagas: new Sagas(sb, user.id) };
}

export function createConnector(env: ConnectorEnv, tools: readonly Tool[] = TOOLS): Router {
  return createRouter(env, tools, (token, user) => contextFor(env, token, user));
}
