/**
 * What the xAPI export (engine/src/43_xapi.js, docs/INTERACTIVE_XAPI.md) reads, made from a subject's events: every
 * attempt at an interactive exercise (each activity.attempted, the latest version of each attempt id) and every answer
 * (each answer.given is one "answered" statement at its own time; the answers counted before the log are one per
 * exercise, as the old export wrote them). Only the events that count (a reset or a restore leaves the others out).
 */
import type { Attempt, LearningEvent } from './types.ts';
import { wallOf } from './projection.ts';
import { countsForSubject, exclusionsOf } from './windows.ts';

export interface XapiAttempt extends Attempt {
  readonly exercise: string;
}
export interface XapiAnswer {
  /** The event's id: the statement's id is made from it (the same export twice gives the same statements). */
  readonly id: string;
  readonly exercise: string;
  readonly ok: boolean;
  readonly t: number;
  readonly conf?: 'sure' | 'think' | 'guess';
  /** For an import: how many answers and how many right it stands for. */
  readonly n?: number;
  readonly okCount?: number;
}
export interface XapiInput {
  readonly attempts: XapiAttempt[];
  readonly answers: XapiAnswer[];
}

export function xapiInput(subject: string, events: readonly LearningEvent[]): XapiInput {
  const x = exclusionsOf(events);
  const attempts = new Map<string, XapiAttempt>(),
    answers: XapiAnswer[] = [];
  for (const e of events) {
    if (e.subject !== subject || !countsForSubject(e, x)) continue;
    if (e.type === 'activity.attempted' && e.item !== undefined) {
      const a = e.data.attempt,
        key = e.item + '|' + (a.id ?? e.id);
      const had = attempts.get(key);
      if (!had || had.t <= a.t) attempts.set(key, { ...a, exercise: e.item });
    } else if (e.type === 'answer.given' && e.item !== undefined) {
      answers.push({ id: e.id, exercise: e.item, ok: e.data.ok, t: wallOf(e.hlc), ...(e.data.conf ? { conf: e.data.conf } : {}) });
    } else if (e.type === 'answers.imported' && e.item !== undefined) {
      const d = e.data;
      answers.push({
        id: e.id,
        exercise: e.item,
        ok: d.last,
        t: d.t ?? wallOf(e.hlc),
        n: d.n,
        okCount: d.ok,
        ...(d.conf ? { conf: d.conf } : {}),
      });
    }
  }
  answers.sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { attempts: [...attempts.values()], answers };
}
