/* noema-lite — what the Roadmaps feature needs from the world (its own narrow ports; the composition root adapts the core's
   to them).

   RoadmapEventLog is the part of the learning log (helper 1's EventStore, src/contracts/schemas/noema.events.v1) this feature
   uses: append events idempotently by id, read a Roadmap's events back. RoadmapPacks is the learner's subject store as a
   restructuring needs it: a pack with its translations and 文A bridges, saved and removed as one, and the learner's progress
   state of a subject (until every progress read goes through the read models). */
import type { AsyncResult } from '../../../kernel/result.ts';
import type { RoadmapEvent } from '../domain/events.ts';
import type { PackBundle, ProgressState } from '../domain/restructure.ts';

export interface RoadmapEventLog {
  /** Append events; an id the log has already is kept once (idempotent). → how many were new */
  append(account: string, events: readonly RoadmapEvent[]): AsyncResult<number>;
  /** The Roadmap events of an account (of one Roadmap when given), oldest first. */
  list(account: string, roadmap?: string): AsyncResult<RoadmapEvent[]>;
}

export interface RoadmapPacks {
  /** A step's subject with its translations and bridges. */
  load(account: string, packId: string): AsyncResult<PackBundle>;
  /** Save a subject (new or changed) with its translations and bridges, as the subject of a Roadmap step. */
  save(account: string, bundle: PackBundle, step: { roadmap: string; node: string; title: string }): AsyncResult<void>;
  /** Remove a subject that was joined into another (its material lives on there). */
  remove(account: string, packId: string): AsyncResult<void>;
  /** The learner's progress state of a subject (null: none yet). */
  state(account: string, packId: string): ProgressState | null;
  setState(account: string, packId: string, state: ProgressState): AsyncResult<void>;
}
