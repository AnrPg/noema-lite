The world's land outline at 1:110 million (Natural Earth 4.1.0, public domain) as TopoJSON, from world-atlas 2.0.2 (ISC), the basemap
`land110` of map@1 (engine/src/48_lib_map.js, docs/library/map.md §9).
| file | what | size | sha256 |
|---|---|---|---|
| land-110m.json | unchanged, from https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/land-110m.json | 55 207 B | ead5f68119c49a9250902e7da303bcb209341bbb8fefe7369a439b48b704658a |
| noema-land-110m.js | the same data as a script: defines `NoemaVendorLand110m = {topo, version, src}` on window/self; `src` is prepended to the map@1 Worker source | 55 824 B | 57a99bcc74b098f00836c6cbbe3afcb24e12f0f2707a3684af5ff9112cdefd42 |
| LICENSE | ISC, Copyright 2013-2019 Michael Bostock (the data: Natural Earth, public domain, naturalearthdata.com) | 734 B | 8048290dfdb6e83fbed17e8985c8cfc4ce9da9b842642f3d3e497280790cfa31 |

Data only: decoded by map@1 itself (arcs, delta-encoded, with the transform), no topojson-client. Load noema-land-110m.js before
48_lib_map.js.
