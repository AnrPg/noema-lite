/* The app's admins (table noema_admins, cloud/supabase.sql §13b): the problem reports, the vault's field graph, the
   requests for new engines. */
import type { ToolContext } from '../tool.ts';

/** Every UI locale of the app: an accepted vault field has a name in each. */
export const VAULT_LOCALES = ['en', 'el', 'ru', 'fr', 'ar-EG', 'de', 'hi', 'zh-Hans', 'zh-Hant', 'ja', 'it', 'es-ES', 'sq', 'pt-PT', 'tr'] as const;

export const NOT_ADMIN_REPORTS = 'Only the app\'s admins (table noema_admins, cloud/supabase.sql §13b) read the problem reports; this account is not one.';

/** RLS shows a person only their own row of noema_admins: a row means an admin. */
export const isAdmin = (ctx: ToolContext): Promise<boolean> =>
  ctx.sb.request<unknown>('/rest/v1/noema_admins?select=user_id&limit=1').then(r => Array.isArray(r) && r.length > 0).catch(() => false);

/** The engines of the library the catalogue suggests for a request. */
export const suggestedText = (ctx: ToolContext, ids: string[]): string =>
  ids.length ? ids.map(i => { const e = ctx.engine.engineCatalog?.byId(i); return `- ${i} (${e ? e.layer : '?'})`; }).join('\n') : '- nothing in the catalogue matched';
