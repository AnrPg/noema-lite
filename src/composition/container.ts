/**
 * The DI container of the composition roots (docs/ARCHITECTURE.md §5). Small on purpose; its API is STABLE — helpers and
 * later phases register into it, so a change here is an ADR.
 *
 *   const STORAGE = token<Storage>('storage');                 // a typed key (src/composition/tokens.ts holds the core's)
 *   c.register(STORAGE, () => browserStorage());               // a factory: called once, on first get (a lazy singleton)
 *   c.register(ERRORS, r => createErrorReporter({ notifier: r.get(NOTIFIER) }));   // factories resolve what they need
 *   c.value(CONFIG, cfg);                                      // a ready value
 *   c.get(STORAGE)                                             // → the Storage (container.unknown when not registered)
 *   c.freeze();                                                // the root is done: no registration after this
 *
 * Rules: a token is registered once (`{ replace: true }` only in tests); a cycle of factories is container.cycle; after
 * freeze(), register/value throw container.frozen. Only composition roots hold a Container: the domain, the engines and
 * the adapters never see it (they get their dependencies as arguments).
 */
import { NoemaError } from '../kernel/errors.ts';

export interface Token<T> {
  readonly key: string;
  readonly description: string;
  /** Phantom: carries T for the compiler. */
  readonly __type?: (t: T) => T;
}

/** A typed key. Two tokens with the same key are the same registration (keys are unique per root). */
export const token = <T>(key: string, description: string = key): Token<T> => Object.freeze({ key, description });

export interface Resolver {
  get<T>(t: Token<T>): T;
  has(t: Token<unknown>): boolean;
}

export type Factory<T> = (r: Resolver) => T;
/** What a helper module exports to add its part to a root: `export const registerX: Registration = c => { c.register(…) }`. */
export type Registration = (c: Container) => void;

interface Entry {
  factory: Factory<unknown>;
  made: boolean;
  value: unknown;
}

export class Container implements Resolver {
  readonly #entries = new Map<string, Entry>();
  readonly #resolving: string[] = [];
  #frozen = false;

  register<T>(t: Token<T>, factory: Factory<T>, options: { readonly replace?: boolean } = {}): this {
    if (this.#frozen)
      throw new NoemaError('container.frozen', `cannot register ${t.key}: the container is frozen`, { params: { token: t.key } });
    if (this.#entries.has(t.key) && !options.replace)
      throw new NoemaError('invariant.failed', `invariant failed: ${t.key} is registered twice`, { params: { token: t.key } });
    this.#entries.set(t.key, { factory, made: false, value: undefined });
    return this;
  }

  value<T>(t: Token<T>, v: T, options: { readonly replace?: boolean } = {}): this {
    return this.register(t, () => v, options);
  }

  get<T>(t: Token<T>): T {
    const e = this.#entries.get(t.key);
    if (!e) throw new NoemaError('container.unknown', `nothing is registered for ${t.key}`, { params: { token: t.key } });
    if (e.made) return e.value as T;
    if (this.#resolving.includes(t.key)) {
      const chain = [...this.#resolving.slice(this.#resolving.indexOf(t.key)), t.key].join(' → ');
      throw new NoemaError('container.cycle', 'registrations depend on each other: ' + chain, { params: { chain } });
    }
    this.#resolving.push(t.key);
    try {
      e.value = e.factory(this);
      e.made = true;
      return e.value as T;
    } finally {
      this.#resolving.pop();
    }
  }

  has(t: Token<unknown>): boolean {
    return this.#entries.has(t.key);
  }

  /** The registered keys (for diagnostics). */
  keys(): string[] {
    return [...this.#entries.keys()].sort();
  }

  freeze(): this {
    this.#frozen = true;
    return this;
  }

  get frozen(): boolean {
    return this.#frozen;
  }
}
