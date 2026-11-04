# P0 spikes for interactive activities (docs/adr/001-interactive-activities.md §2)

Throw-away scripts, kept so the results can be checked again. Not part of `tests/run_e2e.sh`.

```bash
cd tests/spikes/activities
# Firefox and WebKit once per machine (Chromium is pre-installed in the cloud sandbox):
#   PLAYWRIGHT_BROWSERS_PATH=<dir> npx playwright install firefox webkit && npx playwright install-deps webkit
# Pyodide 0.27.7 + numpy for spike (a) (not committed, ≈ 17 MB):
mkdir -p www/pyodide && for f in pyodide.js pyodide.asm.js pyodide.asm.wasm python_stdlib.zip pyodide-lock.json numpy-2.0.2-cp312-cp312-pyodide_2024_0_wasm32.whl; do curl -sSfLo www/pyodide/$f https://cdn.jsdelivr.net/pyodide/v0.27.7/full/$f; done
PORT=8811 node server.js &                                                     # no CORS headers
PORT=8812 HDRS='{"Access-Control-Allow-Origin":"*","Cross-Origin-Resource-Policy":"cross-origin"}' node server.js &
PORT=8813 HDRS='{"Access-Control-Allow-Origin":"*","Cross-Origin-Resource-Policy":"cross-origin","Cache-Control":"public, max-age=31536000, immutable"}' node server.js &
node b_unknown.js <prepared repo copy with a sim exercise + interactive block>   # (b) today's engine and unknown content
node c_sandbox.js chromium firefox webkit                                       # (c) every attack of the brief's §9
node c_hog3.js firefox s ; node c_hog3.js firefox x                             # (c) endless loop: srcdoc / cross-site frame
node a_py.js webkit 8811 ; node a_py.js webkit 8812                             # (a) Pyodide from an opaque origin, without / with CORS
node d_cache.js                                                                 # (d) second run with the asset folder blocked (Chromium)
```
