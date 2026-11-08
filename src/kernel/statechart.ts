/**
 * A small typed statechart (docs/SYNC.md §Statecharts): explicit states, events, guards, context updates, timed
 * transitions and effects as data. Used by the sync loop and the "one device at a time" lease (src/features/sync/domain),
 * and meant for every other long-running process of the app (preparing a Roadmap step, an exercise session, a level change).
 *
 *  • `transition(def, snapshot, event, meta)` is pure: the next snapshot and the effects to run, nothing else. Effects are
 *    plain values of the machine's own effect type; the code that runs the machine decides what each one does.
 *  • A state lists the events it answers (`on`), the transitions that fire after a time (`after`), and the effects of
 *    entering and leaving it (`entry`, `exit`). The machine's own `on` answers an event in every state that has no
 *    transition of its own for it. A list of transitions takes the first whose guard holds.
 *  • A transition with a `target` leaves its state and enters the target (also when it is the same state: its timers start
 *    again); one without a target stays (only its `assign` and `effects` happen, the timers keep running).
 *  • `createActor` runs a machine: one event at a time to completion (an effect may send the next event), timers through
 *    an injected scheduler (the Clock port in the app, a manual clock in tests), stale timers of a state already left are
 *    ignored.
 *  • `transitionIds` lists every transition a machine defines and each Step says which one it took, so a test can prove
 *    that every state and every transition was exercised.
 */

export interface MachineEvent {
  readonly type: string;
}
/** What a guard, an assign and a delay may know besides the context and the event. */
export interface Meta {
  /** Epoch milliseconds when the event is handled. */
  readonly now: number;
}
/** The internal event of a timed transition (index into the state's `after`). */
export interface AfterEvent {
  readonly type: '@after';
  readonly index: number;
}
/** The internal event of entering the initial state. */
export interface InitEvent {
  readonly type: '@init';
}

export type Guard<C, E> = (context: C, event: E, meta: Meta) => boolean;
export type Assign<C, E> = (context: C, event: E, meta: Meta) => C;
export type Effects<C, E, F> = readonly F[] | ((context: C, event: E, meta: Meta) => readonly F[]);

export interface TransitionDef<S extends string, C, E, F> {
  /** The state to enter; left out: stay (an internal transition). */
  readonly target?: S;
  readonly guard?: Guard<C, E>;
  /** The new context (computed from the old one, before the target's entry effects). */
  readonly assign?: Assign<C, E>;
  readonly effects?: Effects<C, E, F>;
}
type Many<T> = T | readonly T[];

export interface DelayedDef<S extends string, C, F> {
  /** Milliseconds after entering the state (a function: from the context as it is on entry). */
  readonly delay: number | ((context: C, meta: Meta) => number);
  /** What happens then: the first transition whose guard holds (none: nothing, and this timer is done). */
  readonly then: Many<TransitionDef<S, C, AfterEvent, F>>;
}
export type TransitionsOf<S extends string, C, E extends MachineEvent, F> = {
  readonly [T in E['type']]?: Many<TransitionDef<S, C, Extract<E, { readonly type: T }>, F>>;
};

export interface StateDef<S extends string, C, E extends MachineEvent, F> {
  readonly on?: TransitionsOf<S, C, E, F>;
  readonly after?: readonly DelayedDef<S, C, F>[];
  readonly entry?: Effects<C, E | AfterEvent | InitEvent, F>;
  readonly exit?: Effects<C, E | AfterEvent, F>;
}

export interface MachineDef<S extends string, C, E extends MachineEvent, F> {
  readonly id: string;
  readonly initial: S;
  readonly context: C;
  readonly states: Readonly<Record<S, StateDef<S, C, E, F>>>;
  /** Answers an event in every state that has no transition of its own for it. */
  readonly on?: TransitionsOf<S, C, E, F>;
}

export interface Snapshot<S extends string, C> {
  readonly state: S;
  readonly context: C;
}

export interface Timer {
  /** The index into the entered state's `after`. */
  readonly index: number;
  readonly delay: number;
}

export interface Step<S extends string, C, F> {
  readonly snapshot: Snapshot<S, C>;
  readonly effects: readonly F[];
  /** The transition taken (its id from transitionIds), or null when no transition answered the event. */
  readonly taken: string | null;
  /** The state was entered anew: its timers (from `after`) start; the old state's timers stop. */
  readonly entered: boolean;
  readonly timers: readonly Timer[];
}

const many = <T>(x: Many<T> | undefined): readonly T[] => (x === undefined ? [] : Array.isArray(x) ? (x as readonly T[]) : [x as T]);
const effectsOf = <C, E, F>(e: Effects<C, E, F> | undefined, c: C, ev: E, meta: Meta): readonly F[] =>
  e === undefined ? [] : typeof e === 'function' ? e(c, ev, meta) : e;

function timersOf<S extends string, C, E extends MachineEvent, F>(state: StateDef<S, C, E, F>, c: C, meta: Meta): Timer[] {
  return (state.after ?? []).map((d, index) => ({
    index,
    delay: Math.max(0, typeof d.delay === 'function' ? d.delay(c, meta) : d.delay),
  }));
}

/** The snapshot a machine starts in, with the initial state's entry effects and timers. */
export function initialStep<S extends string, C, E extends MachineEvent, F>(def: MachineDef<S, C, E, F>, meta: Meta): Step<S, C, F> {
  const state = def.states[def.initial],
    c = def.context;
  return {
    snapshot: { state: def.initial, context: c },
    effects: effectsOf(state.entry, c, { type: '@init' }, meta),
    taken: null,
    entered: true,
    timers: timersOf(state, c, meta),
  };
}

/** The next snapshot after `event` (pure). An event no transition answers leaves the snapshot as it is. */
export function transition<S extends string, C, E extends MachineEvent, F>(
  def: MachineDef<S, C, E, F>,
  snap: Snapshot<S, C>,
  event: E | AfterEvent,
  meta: Meta,
): Step<S, C, F> {
  const from = def.states[snap.state];
  const none: Step<S, C, F> = { snapshot: snap, effects: [], taken: null, entered: false, timers: [] };
  let candidates: ReadonlyArray<readonly [string, TransitionDef<S, C, E | AfterEvent, F>]>;
  if (event.type === '@after') {
    const i = (event as AfterEvent).index,
      d = from.after?.[i];
    candidates = d
      ? many(d.then).map((t, j) => [`${snap.state}.after.${i}.${j}`, t as TransitionDef<S, C, E | AfterEvent, F>] as const)
      : [];
  } else {
    const type = event.type as E['type'];
    const own = many(from.on?.[type]) as readonly TransitionDef<S, C, E | AfterEvent, F>[];
    const global = many(def.on?.[type]) as readonly TransitionDef<S, C, E | AfterEvent, F>[];
    candidates = own.length
      ? own.map((t, i) => [`${snap.state}.on.${type}.${i}`, t] as const)
      : global.map((t, i) => [`*.on.${type}.${i}`, t] as const);
  }
  const hit = candidates.find(([, t]) => !t.guard || t.guard(snap.context, event, meta));
  if (!hit) return none;
  const [id, t] = hit;
  const c = snap.context;
  if (t.target === undefined) {
    const next = t.assign ? t.assign(c, event, meta) : c;
    return {
      snapshot: { state: snap.state, context: next },
      effects: effectsOf(t.effects, c, event, meta),
      taken: id,
      entered: false,
      timers: [],
    };
  }
  const to = def.states[t.target];
  const exit = effectsOf(from.exit, c, event, meta);
  const next = t.assign ? t.assign(c, event, meta) : c;
  const effects = [...exit, ...effectsOf(t.effects, c, event, meta), ...effectsOf(to.entry, next, event, meta)];
  return { snapshot: { state: t.target, context: next }, effects, taken: id, entered: true, timers: timersOf(to, next, meta) };
}

/** Every transition a machine defines, by the id a Step reports ("<state>.on.<event>.<i>", "<state>.after.<i>.<j>", "*.on.<event>.<i>"). */
export function transitionIds<S extends string, C, E extends MachineEvent, F>(def: MachineDef<S, C, E, F>): string[] {
  const out: string[] = [];
  const onIds = (prefix: string, on: TransitionsOf<S, C, E, F> | undefined): void => {
    for (const [type, ts] of Object.entries<Many<unknown>>(on ?? {})) many(ts).forEach((_, i) => out.push(`${prefix}.on.${type}.${i}`));
  };
  for (const [name, state] of Object.entries(def.states) as Array<[S, StateDef<S, C, E, F>]>) {
    onIds(name, state.on);
    (state.after ?? []).forEach((d, i) => {
      many(d.then).forEach((_, j) => out.push(`${name}.after.${i}.${j}`));
    });
  }
  onIds('*', def.on);
  return out;
}

/** The timers a running machine needs (the Clock port fits it, with its own handle type). */
export interface Scheduler<H> {
  now(): number;
  setTimeout(f: () => void, ms: number): H;
  clearTimeout(handle: H): void;
}

export interface ActorOptions<S extends string, C, E extends MachineEvent, F, H> {
  readonly scheduler: Scheduler<H>;
  /** Runs one effect (it may send events: they are handled after the current one). */
  readonly run: (effect: F, send: (event: E) => void, snapshot: Snapshot<S, C>) => void;
  /** An effect that threw: reported, the machine goes on. */
  readonly onError: (error: unknown, effect: F) => void;
}

export interface Actor<S extends string, C, E extends MachineEvent, F> {
  readonly snapshot: Snapshot<S, C>;
  send(event: E): void;
  /** Called after every handled event and timer with the step it made (also steps that took no transition). */
  subscribe(listener: (snapshot: Snapshot<S, C>, step: Step<S, C, F>) => void): () => void;
  /** Stops its timers; later events are ignored. */
  stop(): void;
}

/** Runs a machine: starts in its initial state (running the entry effects), one event at a time. */
export function createActor<S extends string, C, E extends MachineEvent, F, H>(
  def: MachineDef<S, C, E, F>,
  o: ActorOptions<S, C, E, F, H>,
): Actor<S, C, E, F> {
  let snap: Snapshot<S, C> = { state: def.initial, context: def.context };
  let generation = 0,
    busy = false,
    stopped = false;
  const timers = new Set<H>();
  const queue: Array<E | AfterEvent> = [];
  const listeners = new Set<(s: Snapshot<S, C>, step: Step<S, C, F>) => void>();
  const send = (e: E): void => {
    if (stopped) return;
    queue.push(e);
    drain();
  };
  const arm = (step: Step<S, C, F>): void => {
    if (!step.entered) return;
    for (const h of timers) o.scheduler.clearTimeout(h);
    timers.clear();
    const gen = ++generation;
    for (const t of step.timers) {
      const h: H = o.scheduler.setTimeout(() => {
        timers.delete(h);
        if (gen !== generation || stopped) return; // a timer of a state already left
        queue.push({ type: '@after', index: t.index });
        drain();
      }, t.delay);
      timers.add(h);
    }
  };
  const apply = (step: Step<S, C, F>): void => {
    snap = step.snapshot;
    arm(step);
    for (const f of step.effects) {
      try {
        o.run(f, send, snap);
      } catch (e) {
        o.onError(e, f);
      }
    }
    for (const l of [...listeners]) l(snap, step);
  };
  function drain(): void {
    if (busy) return;
    busy = true;
    try {
      for (let e = queue.shift(); e && !stopped; e = queue.shift()) apply(transition(def, snap, e, { now: o.scheduler.now() }));
    } finally {
      busy = false;
    }
  }
  busy = true;
  try {
    apply(initialStep(def, { now: o.scheduler.now() }));
  } finally {
    busy = false;
  }
  drain();
  return {
    get snapshot() {
      return snap;
    },
    send,
    subscribe(l) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    stop() {
      stopped = true;
      queue.length = 0;
      for (const h of timers) o.scheduler.clearTimeout(h);
      timers.clear();
    },
  };
}
