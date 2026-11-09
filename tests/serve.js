/* The browser suites open the app over http, as the website serves it (there is no file:// mode: only the one-file bundle,
   dist/noema-lite.html, is opened from disk). appUrl(dir) → 'http://127.0.0.1:<port>/index.html' of a static server for that
   folder (tools/serve.mjs: the repo or a prepared copy, built first — tests/built.js —, or a built site), one server per folder,
   closed with the process. */
const path = require('path'), fs = require('fs'), { pathToFileURL } = require('url');
const { ensureBuilt } = require('./built');
const servers = new Map();
/** the base url (no trailing slash) of a server for this folder */
async function serveDir(dir) {
  const key = path.resolve(dir);
  // a repo or a prepared copy (not a built site) that was never built: its generated files first (a copy a suite has built and then
  // changed on purpose is served as it is)
  if (fs.existsSync(path.join(key, 'tools', 'build.py')) && !['engine/engine.js', 'library/registry.js', 'build/manifest.json'].every(f => fs.existsSync(path.join(key, f)))) ensureBuilt(key);
  if (!servers.has(key)) servers.set(key, import(pathToFileURL(path.join(__dirname, '..', 'tools', 'serve.mjs')).href).then(m => m.serve(key, { unref: true })));
  return (await servers.get(key)).url;
}
/** the app's index.html in this folder, over http */
const appUrl = async dir => (await serveDir(dir)) + '/index.html';
module.exports = { appUrl, serveDir };
