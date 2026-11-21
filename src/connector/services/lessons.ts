/* 💬→📖 lesson updates from a chat (docs/LESSON_UPDATES.md): what the two tools share — the learner's requests (the synced
   rows a:lessonreq:<id> the app writes), the lesson as it is (the pack in the account, its translations, its 文A bridges)
   and the checks of the app (src/features/lesson-updates over the engine's content checks). The connector never writes a
   request (the app may be changing it): it writes the proposal (updates/<id>/proposal.json) and its card a:lessonup:<id>. */
import type { ToolContext } from '../tool.ts';
import type { Pack } from '../engine/api.ts';
import { readTr } from './packfiles.ts';
import {
  PROP_PREFIX,
  REQ_ID,
  REQ_PREFIX,
  chatPath,
  proposalPath,
  type Base,
  type Checks,
  type LessonRequest,
  type ProposalCard,
} from '../../features/lesson-updates/domain/index.ts';
import { isObject } from '../util.ts';

export const reqKey = (id: string): string => REQ_PREFIX + id;
export const propKey = (id: string): string => PROP_PREFIX + id;
/** the account's own path of a request's file */
export const own = (ctx: ToolContext, rel: string): string => `${ctx.uid}/${rel}`;

/** the content checks of the engine, as the gate wants them */
export const gateChecks = (ctx: ToolContext): Checks => ({
  checkPack: (p, id, o) => ctx.engine.content.checkPack(p, id, o ?? {}),
  checkTranslation: (t, p) => ctx.engine.content.checkTranslation(t, p),
  checkBridge: (b, p) => ctx.engine.content.checkBridge(b, p),
});

/** one request of the learner (null: none with that id) */
export async function request(ctx: ToolContext, id: string): Promise<LessonRequest | null> {
  if (!REQ_ID.test(id)) return null;
  const r = await ctx.kv.get<unknown>(reqKey(id), null);
  const v: unknown = typeof r === 'string' ? safeParse(r) : r;
  return isObject(v) && v.id === id ? (v as unknown as LessonRequest) : null;
}
/** every request that waits for Claude (open) or for the learner (a proposal they have not answered), newest first */
export async function requests(ctx: ToolContext): Promise<{ req: LessonRequest; card: ProposalCard | null }[]> {
  const [rs, ps] = await Promise.all([ctx.kv.rows(REQ_PREFIX), ctx.kv.rows(PROP_PREFIX)]);
  const cards = new Map<string, ProposalCard>();
  for (const p of ps) {
    const v: unknown = typeof p.value === 'string' ? safeParse(p.value) : p.value;
    if (isObject(v) && typeof v.id === 'string') cards.set(v.id, v as unknown as ProposalCard);
  }
  const out: { req: LessonRequest; card: ProposalCard | null }[] = [];
  for (const r of rs) {
    const v: unknown = typeof r.value === 'string' ? safeParse(r.value) : r.value;
    if (!isObject(v) || typeof v.id !== 'string') continue;
    const req = v as unknown as LessonRequest;
    if (req.state === 'open' || req.state === 'proposed') out.push({ req, card: cards.get(req.id) ?? null });
  }
  return out.sort((a, b) => b.req.at.localeCompare(a.req.at));
}
const safeParse = (t: string): unknown => {
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return null; // an unreadable row is not a request
  }
};

/** the chat the app stored with the request: its text for Claude (Markdown) */
export async function chatOf(ctx: ToolContext, id: string): Promise<string | null> {
  const c = await ctx.storage.json<{ text?: unknown }>(own(ctx, chatPath(id)));
  return c && typeof c.text === 'string' ? c.text : null;
}

/** The lesson as it is in the account: the pack, every translation as a noema-translation file, the bridges of the pack. */
export async function lessonBase(ctx: ToolContext, sid: string): Promise<{ base: Base; pack: Pack } | null> {
  const pack = await ctx.storage.json<Pack>(`${ctx.uid}/packs/${sid}.json`);
  if (!pack) return null;
  const translations: Record<string, Record<string, unknown>> = {};
  for (const [loc, t] of Object.entries(pack.translations ?? {})) {
    const inline = (t as { chapters?: unknown }).chapters;
    if (Array.isArray(inline)) {
      translations[loc] = {
        format: 'noema-translation',
        v: 1,
        pack: sid,
        locale: loc,
        source: pack.subject.language ?? 'en',
        version: pack.version ?? null,
        chapters: inline,
      };
      continue;
    }
    const f = await readTr(ctx, sid, loc);
    if (f?.json) translations[loc] = f.json;
  }
  const bridges: Record<string, Record<string, unknown>> = {};
  const all: Record<string, Record<string, unknown>> = await ctx.bridges
    .all(sid)
    .catch((): Record<string, Record<string, unknown>> => ({}));
  const rows = all[sid] ?? {};
  for (const pair of Object.keys(rows)) {
    const b = await ctx.storage.json<Record<string, unknown>>(`${ctx.uid}/bridges/${sid}.${pair}.json`).catch(() => null);
    if (b) bridges[pair] = b;
  }
  return { base: { pack: pack, translations, bridges }, pack };
}

/** the proposal's file and card (rev: one more than the card before) */
export async function writeProposal(ctx: ToolContext, id: string, body: string, card: Omit<ProposalCard, 'rev'>): Promise<ProposalCard> {
  const before = await ctx.kv.get<unknown>(propKey(id), null);
  const prev: unknown = typeof before === 'string' ? safeParse(before) : before;
  const rev = isObject(prev) && typeof prev.rev === 'number' ? prev.rev + 1 : 1;
  await ctx.storage.writeJson(own(ctx, proposalPath(id)), body, { noCache: true });
  const c: ProposalCard = { ...card, rev };
  await ctx.kv.put(propKey(id), c);
  return c;
}
