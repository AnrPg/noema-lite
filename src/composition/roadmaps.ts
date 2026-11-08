/* The Roadmaps feature as the roots hand it out: the domain (src/features/roadmaps/domain) and the 文A bridges' lookup
   (src/features/bridges/domain), and — in the app — the services that need the learning log.

   NoemaCore.roadmaps (old UI, phase bridge; also the connector's scope for the app files it runs) is the domain's functions
   as they are (plain values; a Result where an operation can fail: { ok, value } | { ok: false, error }) plus, in the app:
     levels.view(account, c, mastered) · levels.advance(account, c, mastered, now) · levels.testTaken(account, c, level, score, o)
     restructure.apply(account, c, proposalId, packs, now) · restructure.decline(c, proposalId, now)
   NoemaCore.bridges: pairKey · pairOf · available · splitBridge · mergeBridges. */
import * as domain from '../features/roadmaps/domain/index.ts';
import * as bridges from '../features/bridges/domain/lookup.ts';
import { createLevelService } from '../features/roadmaps/application/levels.ts';
import { applyProposal, declineProposal } from '../features/roadmaps/application/restructure.ts';
import type { RoadmapEventLog, RoadmapPacks } from '../features/roadmaps/application/ports.ts';
import type { Roadmap } from '../features/roadmaps/domain/model.ts';
import { token } from './container.ts';

export const ROADMAP_EVENTS = token<RoadmapEventLog>(
  'roadmaps.events',
  'the Roadmap events of the learning log (levels reached, restructurings)',
);

/** The domain alone (the connector, Node tools, tests). */
export const roadmapsDomain = Object.freeze({ ...domain });
export const bridgesDomain = Object.freeze({ ...bridges });

/** The app's surface: the domain and the services over the learning log. */
export function roadmapsSurface(log: RoadmapEventLog): Readonly<Record<string, unknown>> {
  const levels = createLevelService(log);
  return Object.freeze({
    ...domain,
    levels: Object.freeze(levels),
    restructure: Object.freeze({
      apply: (account: string, c: Roadmap, id: string, packs: RoadmapPacks, now: number) =>
        applyProposal(account, c, id, { packs, log, now }),
      decline: (c: Roadmap, id: string, now: number) => declineProposal(c, id, now),
    }),
  });
}
