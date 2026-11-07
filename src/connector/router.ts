/* The MCP router: Streamable HTTP, stateless, JSON responses (POST /mcp), the OAuth protected-resource metadata the
   clients discover the sign-in from, and JSON-RPC dispatch to the tools and prompts. */
import { trimSlash, type ConnectorEnv } from './env.ts';
import { PROMPTS } from './prompts.ts';
import { INSTRUCTIONS, PROTOCOLS, SERVER_INFO } from './protocol.ts';
import { currentUser, Supabase, SupabaseError, type AuthUser } from './services/supabase.ts';
import { fail, type Tool, type ToolContext, type ToolResult } from './tool.ts';
import { message } from './util.ts';
import { checkArgs } from './validate.ts';

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, mcp-protocol-version, mcp-session-id', 'access-control-allow-methods': 'POST, GET, OPTIONS', 'access-control-expose-headers': 'www-authenticate' };

const J = (obj: unknown, status = 200, headers: Record<string, string> = {}): Response =>
  new Response(obj === null ? null : JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...CORS, ...headers } });

interface RpcMessage { jsonrpc?: unknown; id?: string | number | null; method?: unknown; params?: { protocolVersion?: unknown; name?: unknown; arguments?: unknown } }
type RpcReply = { jsonrpc: '2.0'; id: string | number | null; result?: unknown; error?: { code: number; message: string } };

export interface Router {
  handler(req: Request): Promise<Response>;
  /** One JSON-RPC message for a signed-in user (tests call it directly). */
  dispatch(m: unknown, ctx: () => ToolContext): Promise<RpcReply | null>;
}

/** Run a tool: its arguments checked against its schema first. */
export async function callTool(tool: Tool, args: unknown, ctx: ToolContext): Promise<ToolResult> {
  const c = checkArgs(tool.definition.inputSchema, args ?? {});
  if (!c.ok) return fail(`Invalid arguments for ${tool.definition.name}:\n- ${c.problems.join('\n- ')}`);
  return tool.handler(c.value, ctx);
}

export function createRouter(env: ConnectorEnv, tools: readonly Tool[], context: (token: string, user: AuthUser) => ToolContext): Router {
  const site = trimSlash(env.config.siteUrl);
  const MCP_URL = site + '/mcp', PRM_URL = site + '/.well-known/oauth-protected-resource/mcp';
  const PRM = { resource: MCP_URL, authorization_servers: [trimSlash(env.config.supabaseUrl) + '/auth/v1'], bearer_methods_supported: ['header'], scopes_supported: ['openid', 'email', 'profile'], resource_name: 'noema-lite', resource_documentation: env.config.siteUrl };
  const challenge = { 'www-authenticate': `Bearer resource_metadata="${PRM_URL}"` };
  const definitions = tools.map(t => t.definition);
  const byName = new Map(tools.map(t => [t.definition.name, t]));

  async function dispatch(raw: unknown, ctx: () => ToolContext): Promise<RpcReply | null> {
    const m = (raw ?? null) as RpcMessage | null;
    if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') return { jsonrpc: '2.0', id: m?.id ?? null, error: { code: -32600, message: 'Invalid request' } };
    const isNote = m.id === undefined || m.id === null;
    const id = m.id ?? null;
    const ok = (result: unknown): RpcReply | null => (isNote ? null : { jsonrpc: '2.0', id, result });
    try {
      switch (m.method) {
        case 'initialize': {
          const want = m.params?.protocolVersion;
          const version = typeof want === 'string' && (PROTOCOLS as readonly string[]).includes(want) ? want : PROTOCOLS[0];
          return ok({ protocolVersion: version, capabilities: { tools: { listChanged: false }, prompts: { listChanged: false } }, serverInfo: SERVER_INFO, instructions: INSTRUCTIONS });
        }
        case 'notifications/initialized': case 'notifications/cancelled': return null;
        case 'ping': return ok({});
        case 'tools/list': return ok({ tools: definitions });
        case 'tools/call': {
          const t = byName.get(String(m.params?.name));
          if (!t) return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Unknown tool: ' + String(m.params?.name) } };
          return ok(await callTool(t, m.params?.arguments, ctx()));
        }
        case 'resources/list': return ok({ resources: [] });
        case 'prompts/list': return ok({ prompts: PROMPTS.map(({ name, title, description, arguments: a }) => ({ name, title, description, arguments: a })) });
        case 'prompts/get': {
          const pr = PROMPTS.find(x => x.name === m.params?.name);
          if (!pr) return { jsonrpc: '2.0', id, error: { code: -32602, message: 'Unknown prompt: ' + String(m.params?.name) } };
          const a = m.params?.arguments;
          return ok({ description: pr.description, messages: [{ role: 'user', content: { type: 'text', text: pr.text(a && typeof a === 'object' ? (a as Record<string, string>) : {}) } }] });
        }
        default: return isNote ? null : { jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found: ' + m.method } };
      }
    } catch (e) {
      return isNote ? null : { jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: '❌ ' + message(e) }], isError: true } };
    }
  }

  async function handler(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (url.pathname.startsWith('/.well-known/oauth-protected-resource')) return J(PRM);
    if (req.method === 'GET' || req.method === 'DELETE') return new Response('noema-lite MCP endpoint: POST JSON-RPC (Streamable HTTP).', { status: 405, headers: { allow: 'POST', ...CORS } });
    if (req.method !== 'POST') return new Response(null, { status: 405, headers: CORS });
    const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    const unauth = (): Response => J({ jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Sign in to noema-lite: authorization required' } }, 401, challenge);
    if (!token) return unauth();
    let user: AuthUser | null;
    try { user = await currentUser(new Supabase(env.config, token, env.fetch)); }
    catch (e) { return J({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'Auth check failed: ' + (e instanceof SupabaseError ? e.message : message(e)) } }, 502); }
    if (!user) return unauth();
    let msg: unknown; try { msg = await req.json(); } catch { return J({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400); }
    const batch = Array.isArray(msg) ? (msg as unknown[]) : [msg];
    const signed = user;
    let made: ToolContext | null = null;
    const ctx = (): ToolContext => (made ??= context(token, signed));
    const out = (await Promise.all(batch.map(m => dispatch(m, ctx)))).filter((x): x is RpcReply => x !== null);
    if (!out.length) return new Response(null, { status: 202, headers: CORS });
    return J(Array.isArray(msg) ? out : out[0]);
  }

  return { handler, dispatch };
}
