/* One MCP tool = one module under tools/: its definition (name, description, input schema — what tools/list shows Claude)
   and its handler. The handler gets arguments that passed the schema (validate.ts) and a context bound to the signed-in user. */
import type { ConnectorEnv } from './env.ts';
import type { EngineApi } from './engine/api.ts';
import type { KvStore } from './services/kv.ts';
import type { Bridges, SourceFiles } from './services/rows.ts';
import type { Sagas } from './services/sagas.ts';
import type { Storage } from './services/storage.ts';
import type { AuthUser, Supabase } from './services/supabase.ts';
import type { JsonSchema } from './validate.ts';

export interface ToolDefinition { name: string; description: string; inputSchema: JsonSchema; annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean; idempotentHint?: boolean } }
export type Content = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };
export interface ToolResult { content: Content[]; isError?: boolean }

export interface ToolContext {
  env: ConnectorEnv;
  engine: EngineApi;
  user: AuthUser;
  uid: string;
  sb: Supabase;
  kv: KvStore;
  storage: Storage;
  sourceFiles: SourceFiles;
  bridges: Bridges;
  sagas: Sagas;
}

/** Arguments as the schema let them through: properties of the declared types, nothing required missing. */
export type Args = Record<string, unknown>;

export interface Tool {
  definition: ToolDefinition;
  handler(args: Args, ctx: ToolContext): Promise<ToolResult>;
}

export const text = (t: string): ToolResult => ({ content: [{ type: 'text', text: t }] });
export const fail = (t: string): ToolResult => ({ content: [{ type: 'text', text: '❌ ' + t }], isError: true });

/** An argument as a trimmed string ('' when absent). */
export const argStr = (args: Args, k: string): string => (args[k] == null ? '' : String(args[k]).trim());
/** A yes/no argument given as a boolean or as "true" / "false". */
export const argFlag = (args: Args, k: string): boolean => args[k] === true || args[k] === 'true';
export const argOff = (args: Args, k: string): boolean => args[k] === false || args[k] === 'false';
