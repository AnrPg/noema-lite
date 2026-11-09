Vendored code and data of map@1 (src/engines/map/map.ts, docs/library/map.md), imported by the engine module itself: the page
and the Worker bundle of map@1 get the same bytes (esbuild bundles them; nothing is fetched).

| file | what | size | sha256 |
|---|---|---|---|
| geodesic.cjs | geographiclib-geodesic 2.2.0 (Karney 2013, J. Geodesy 87:43), unchanged, from https://cdn.jsdelivr.net/npm/geographiclib-geodesic@2.2.0/geographiclib-geodesic.min.js (its UMD takes the CommonJS branch: `module.exports = geodesic`) | 32 204 B | 06e3512904b346575f475f14d0b27ea0979dbcd2b0eddebf5f1eeefd234395b5 |
| LICENSE-geographiclib-geodesic.txt | MIT, Copyright (c) Charles Karney | 1 089 B | 8df0455c90f6bb3efbabf3e225122654c438a09c2be5635cdd79472a0970247e |
| land-110m.json | Natural Earth 1:110m land (v4.1.0, public domain) as TopoJSON, from world-atlas 2.0.2, unchanged, from https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json — the basemap `land110` (decoded by map@1 itself: arcs, delta-encoded, with the transform) | 55 207 B | ead5f68119c49a9250902e7da303bcb209341bbb8fefe7369a439b48b704658a |
| LICENSE-world-atlas | ISC, Copyright 2013-2019 Michael Bostock (the data: Natural Earth, public domain, naturalearthdata.com) | 734 B | 8048290dfdb6e83fbed17e8985c8cfc4ce9da9b842642f3d3e497280790cfa31 |

Pure JS and data, no DOM, no network. `geodesic.d.cts` is not vendored: it types the part of geodesic.cjs that map@1 calls (TypeScript strict).
