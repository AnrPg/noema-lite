/* The Claude connector exactly as tools/build.py bundles it (tools/connector_bundle.mjs: src/composition/connector.ts
   with the app's engine files), but with the tests' own configuration and documents — pointed at the Supabase emulator.
   Usage: const handler = await connectorHandler(ROOT, { config: CFG, docs: DOCS });  …  removeConnector(handler) */
const path = require('path'), fs = require('fs'), os = require('os');
const { pathToFileURL } = require('url');
const files = new Map();
let n = 0;

async function connectorHandler(root, data) {
  const { bundleConnector } = await import(pathToFileURL(path.join(root, 'tools', 'connector_bundle.mjs')).href);
  const outfile = path.join(os.tmpdir(), `noema-mcp-${process.pid}-${++n}.mjs`);
  await bundleConnector({ root, outfile, data: { config: data.config, docs: data.docs ?? {} } });
  const mod = await import(pathToFileURL(outfile).href);
  files.set(mod.default, outfile);
  return mod.default;
}
/** Delete the bundle a handler came from. */
function removeConnector(handler) {
  const f = files.get(handler); if (f) fs.rmSync(f, { force: true });
  files.delete(handler);
}

module.exports = { connectorHandler, removeConnector };
