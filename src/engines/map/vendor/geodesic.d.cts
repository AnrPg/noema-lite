/* The typed boundary of the vendored geographiclib-geodesic 2.2.0 (./geodesic.cjs, unchanged): the part map@1 calls. */
declare namespace geodesic {
  interface InverseResult {
    readonly s12: number;
    readonly a12: number;
    readonly azi1: number;
    readonly azi2: number;
  }
  interface Position {
    readonly lat2: number;
    readonly lon2: number;
  }
  interface GeodesicLine {
    readonly s13: number;
    Position(s12: number, outmask?: number): Position;
  }
  interface Geodesic {
    readonly _c2: number;
    Inverse(lat1: number, lon1: number, lat2: number, lon2: number, outmask?: number): InverseResult;
    InverseLine(lat1: number, lon1: number, lat2: number, lon2: number, caps?: number): GeodesicLine;
    EllipsoidArea?(): number;
  }
  interface PolygonArea {
    AddPoint(lat: number, lon: number): void;
    Compute(reverse: boolean, sign: boolean): { readonly number: number; readonly perimeter: number; readonly area: number };
  }
  interface Module {
    readonly Geodesic: {
      readonly Geodesic: new (a: number, f: number) => Geodesic;
      readonly LATITUDE: number;
      readonly LONGITUDE: number;
      readonly LONG_UNROLL: number;
    };
    readonly PolygonArea: { readonly PolygonArea: new (geod: Geodesic, polyline: boolean) => PolygonArea };
  }
}
declare const geodesic: geodesic.Module;
export = geodesic;
