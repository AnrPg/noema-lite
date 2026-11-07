/**
 * Telemetry port: counters and events about how the app behaves (docs/ARCHITECTURE.md §4).
 *
 * LOCAL ONLY: nothing here goes over the network. There is no adapter that sends; a future one would need the owner's
 * decision, the learner's consent and its own ADR. Names are stable dotted ids ("sync.conflict", "compute.timeout");
 * data holds counts and codes, never personal text.
 */
export type TelemetryData = { readonly [key: string]: string | number | boolean | null };

export interface TelemetryEvent {
  readonly at: number;
  readonly name: string;
  readonly data: TelemetryData;
}

export interface TelemetrySnapshot {
  readonly counters: { readonly [name: string]: number };
  /** The last events, oldest first. */
  readonly events: readonly TelemetryEvent[];
}

export interface Telemetry {
  count(name: string, by?: number): void;
  event(name: string, data?: TelemetryData): void;
  snapshot(): TelemetrySnapshot;
  reset(): void;
}
