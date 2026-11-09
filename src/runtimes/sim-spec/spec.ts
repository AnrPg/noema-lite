/* The shape of a sim-spec@1 spec as the view reads it, once the content checks (checkSimSpec) have passed it: the fields the
   view uses, typed (docs/INTERACTIVE.md §12). */
import type { Axis } from './plot.ts';

export interface Param {
  readonly id: string;
  readonly kind: 'slider' | 'number' | 'toggle' | 'choice';
  readonly label?: string;
  readonly min: number;
  readonly max: number;
  readonly step?: number;
  readonly scale?: string;
  readonly unit?: string;
  readonly format?: string;
  readonly digits?: number;
  readonly default?: unknown;
  readonly options: readonly { readonly value: unknown; readonly label?: string }[];
}
export interface Readout {
  readonly expr: string;
  readonly label?: string;
  readonly unit?: string;
  readonly format?: string;
  readonly digits?: number;
}
export interface Plot {
  readonly kind?: string;
  readonly title?: string;
  readonly of?: string;
  readonly height?: number;
  readonly points?: number;
  readonly x: Axis;
  readonly y?: Axis;
  readonly series?: readonly { readonly expr?: string; readonly y?: string; readonly label?: string; readonly style?: string }[];
  readonly marks?: readonly { readonly axis?: string; readonly expr: string; readonly label?: string }[];
}
export interface Output {
  readonly id: string;
  readonly kind?: string;
}
export interface BenchPoint {
  readonly id: string;
  readonly at: string;
  readonly label?: string;
}
export interface Instrument {
  readonly kind: string;
  readonly points?: readonly string[];
  readonly parts?: readonly { readonly element: string; readonly pin?: unknown; readonly label?: string }[];
  readonly modes?: readonly string[];
  readonly leads?: readonly { readonly lead?: unknown; readonly cin?: unknown; readonly label?: string }[];
  readonly zin?: unknown;
  readonly tEnd?: unknown;
  readonly dt?: unknown;
  readonly tStart?: unknown;
  readonly source?: unknown;
  readonly fStart?: unknown;
  readonly fStop?: unknown;
  readonly fPoints?: unknown;
  readonly threshold?: unknown;
}
export interface Bench {
  readonly part?: string;
  readonly budget?: number;
  readonly points: readonly BenchPoint[];
  readonly instruments: readonly Instrument[];
  readonly faults: readonly { readonly id: string; readonly apply?: unknown }[];
  readonly diagnosis: { readonly label?: string; readonly options: readonly { readonly fault?: string; readonly label?: string }[] };
}
export interface Spec {
  readonly engine?: string;
  readonly title?: string;
  readonly intro?: string;
  readonly consts?: Readonly<Record<string, unknown>>;
  readonly params: readonly Param[];
  readonly derived?: readonly { readonly id: string; readonly expr: string }[];
  readonly readouts?: readonly Readout[];
  readonly plots?: readonly Plot[];
  readonly outputs?: readonly Output[];
  readonly bench?: Bench;
  readonly parts?: readonly unknown[];
  readonly couple?: unknown;
}
