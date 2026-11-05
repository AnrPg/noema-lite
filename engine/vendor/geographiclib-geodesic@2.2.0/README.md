GeographicLib geodesic routines (Karney 2013, J. Geodesy 87:43) for map@1 (engine/src/48_lib_map.js, docs/library/map.md §3).
| file | what | size | sha256 |
|---|---|---|---|
| geographiclib-geodesic.min.js | geographiclib-geodesic 2.2.0, unchanged, from https://cdn.jsdelivr.net/npm/geographiclib-geodesic@2.2.0/geographiclib-geodesic.min.js | 32 204 B | 06e3512904b346575f475f14d0b27ea0979dbcd2b0eddebf5f1eeefd234395b5 |
| noema-geodesic.js | the same file wrapped: defines `NoemaVendorGeodesic = {lib, version, src}` on window/self without touching module/define; `src` is the wrapper's own source, prepended to the map@1 Worker source | 32 878 B | 291e4186c86ab1df11eb5082d9f5dcd67885489052b77d2dbf9da724c6cba7a6 |
| LICENSE.txt | MIT, Copyright (c) Charles Karney | 1 089 B | 8df0455c90f6bb3efbabf3e225122654c438a09c2be5635cdd79472a0970247e |

Pure JS, no DOM, no network: runs in a Web Worker. Load noema-geodesic.js before 48_lib_map.js.
