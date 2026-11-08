/**
 * A small typed statechart (docs/ARCHITECTURE.md §7 "Statecharts"): explicit states, the events each state accepts, guarded
 * transitions with actions on a context, and entry actions. A machine is pure data plus pure functions, so `transition()`
 * runs the same in a test, a Worker or the page; `interpret()` adds the one mutable thing, the current snapshot, and tells
 * its listeners after every change.
 *
 *   const m = machine<Ctx, Ev, 'idle' | 'busy'>({ initial: 'idle', context: { n: 0 }, states: {
 *     idle: { on: { START: { target: 'busy', action: (c) => ({ ...c, n: c.n + 1 }) } } },
 *     busy: { on: { STOP: [{ target: 'idle', guard: (c) => c.n > 2 }, { target: 'busy' }] }, final: false },
 *   } });
 *   const s = interpret(m); s.send({ type: 'START' }); s.state.value === 'busy'
 *
 * An event a state does not accept leaves the snapshot as it is (`changed: false`): nothing ever lands "in between". A
 * transition without a target stays in the state and only runs its action. A final state accepts nothing.
 */
/** stops a subscription */
export type StopListening = () => void;

export interface EventObject {
  readonly type: string;
}

/** One way out of a state for an event: where to (or stay), when (guard), and what it does to the context. */
export interface Transition<C, E extends EventObject, S extends string> {
  readonly target?: S;
  readonly guard?: (context: C, event: E) => boolean;
  readonly action?: (context: C, event: E) => C;
}

type OnMap<C, E extends EventObject, S extends string> = {
  readonly [T in E['type']]?: Transition<C, Extract<E, { type: T }>, S> | readonly Transition<C, Extract<E, { type: T }>, S>[];
};

export interface StateNode<C, E extends EventObject, S extends string> {
  readonly on?: OnMap<C, E, S>;
  /** runs when the state is entered (also the initial one): the context it hands on */
  readonly entry?: (context: C) => C;
  /** a state the machine never leaves */
  readonly final?: boolean;
  /** an eventless way on, taken right after entry when its guard holds (e.g. "no exercise left → summary") */
  readonly always?: readonly Transition<C, { readonly type: '' }, S>[];
}

export interface MachineConfig<C, E extends EventObject, S extends string> {
  readonly initial: S;
  readonly context: C;
  readonly states: { readonly [K in S]: StateNode<C, E, S> };
}

export interface Snapshot<C, S extends string> {
  readonly value: S;
  readonly context: C;
  readonly done: boolean;
}

export interface Machine<C, E extends EventObject, S extends string> {
  readonly config: MachineConfig<C, E, S>;
  /** the first snapshot (entry and eventless transitions of the initial state applied), from a context of the caller's */
  initial(context?: C): Snapshot<C, S>;
  /** where an event leads from a snapshot; `changed` is false when the state does not accept it */
  transition(from: Snapshot<C, S>, event: E): { readonly snapshot: Snapshot<C, S>; readonly changed: boolean };
  /** the events the state accepts right now (their guards are not asked) */
  accepts(from: Snapshot<C, S>): readonly E['type'][];
}

const MAX_ALWAYS = 32; // eventless steps in a row: more is a loop in the machine's definition

export function machine<C, E extends EventObject, S extends string>(config: MachineConfig<C, E, S>): Machine<C, E, S> {
  const nodes = new Map<string, StateNode<C, E, S>>(Object.entries<StateNode<C, E, S>>(config.states));
  const node = (s: S): StateNode<C, E, S> => {
    const n = nodes.get(s);
    if (!n) throw new Error(`statechart: no state "${s}"`);
    return n;
  };
  const enter = (value: S, context: C): Snapshot<C, S> => {
    let v = value,
      c = node(v).entry?.(context) ?? context;
    for (let i = 0; ; i++) {
      if (i > MAX_ALWAYS) throw new Error(`statechart: eventless transitions loop at "${v}"`);
      const next = (node(v).always ?? []).find(t => !t.guard || t.guard(c, { type: '' }));
      if (!next) break;
      c = next.action?.(c, { type: '' }) ?? c;
      if (next.target === undefined || next.target === v) break;
      v = next.target;
      c = node(v).entry?.(c) ?? c;
    }
    return { value: v, context: c, done: node(v).final === true };
  };
  return {
    config,
    initial: context => enter(config.initial, context ?? config.context),
    transition(from, event) {
      const n = node(from.value);
      if (n.final) return { snapshot: from, changed: false };
      const raw = (n.on as Readonly<Record<string, Transition<C, E, S> | readonly Transition<C, E, S>[]>> | undefined)?.[event.type];
      const options: readonly Transition<C, E, S>[] = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
      const t = options.find(o => !o.guard || o.guard(from.context, event));
      if (!t) return { snapshot: from, changed: false };
      const context = t.action?.(from.context, event) ?? from.context;
      if (t.target === undefined) return { snapshot: { ...from, context }, changed: true };
      return { snapshot: enter(t.target, context), changed: true };
    },
    accepts(from) {
      const n = node(from.value);
      return n.final ? [] : (Object.keys(n.on ?? {}));
    },
  };
}

export interface Service<C, E extends EventObject, S extends string> {
  readonly machine: Machine<C, E, S>;
  readonly state: Snapshot<C, S>;
  /** → true when the event changed the snapshot (an event sent by a listener is queued: → true, it runs next) */
  send(event: E): boolean;
  /** called after every change (not now) */
  subscribe(listener: (s: Snapshot<C, S>, event: E) => void): StopListening;
}

/** A running machine: its snapshot, and the events sent to it one after the other (an event sent by a listener waits its turn). */
export function interpret<C, E extends EventObject, S extends string>(m: Machine<C, E, S>, from?: Snapshot<C, S>): Service<C, E, S> {
  let state = from ?? m.initial();
  const listeners = new Set<(s: Snapshot<C, S>, e: E) => void>();
  const queue: E[] = [];
  let busy = false;
  return {
    machine: m,
    get state() {
      return state;
    },
    send(event) {
      queue.push(event);
      if (busy) return true;
      busy = true;
      let any = false;
      try {
        for (let e = queue.shift(); e !== undefined; e = queue.shift()) {
          const r = m.transition(state, e);
          if (!r.changed) continue;
          any = true;
          state = r.snapshot;
          for (const l of [...listeners]) l(state, e);
        }
      } finally {
        busy = false;
        queue.length = 0;
      }
      return any;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
