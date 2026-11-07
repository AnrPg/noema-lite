/* noema-lite — a small static http server that serves a folder the way the website does (npm run dev, the browser tests).

   serve(dir, { port, live }) → { url, close(), reload() }
     dir     the repo (npm run dev: index.html, engine/, library/, build/ …) or a built site (dist/site)
     port    0 (default) = any free port
     live    true: index.html gets a tiny script that reloads the page when reload() is called (npm run dev)
     unref   true: the server does not keep the process alive (the tests)
   /sw.js: the folder's own sw.js when it has one (a built site); else build/sw.js with the development prelude
   { version: 'dev', shell: [] } (src/composition/sw.ts: only the Python files go through it, the rest to the network).
   Nothing is cached by the browser (Cache-Control: no-store), so a reload always shows the files as they are on disk. */
import { createServer } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf', '.wasm': 'application/wasm', '.pdf': 'application/pdf',
  '.zip': 'application/zip', '.whl': 'application/zip', '.h5p': 'application/zip', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm', '.py': 'text/plain; charset=utf-8',
};
const DEV_SW_PRELUDE = 'self.NOEMA_SW = {"version":"dev","shell":[]};\n';
const LIVE = '<script>/* npm run dev: reload on change */ new EventSource("/__dev/events").onmessage = () => location.reload();</script>';

/** @param {string} dir @param {{ port?: number, host?: string, live?: boolean, unref?: boolean }} [o] */
export function serve(dir, o = {}) {
  const root = path.resolve(dir), clients = new Set();
  const server = createServer((req, res) => {
    const send = (status, type, body, extra = {}) => { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra }); res.end(req.method === 'HEAD' ? undefined : body); };
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain', 'method not allowed');
    let p;
    try { p = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname); } catch (e) { return send(400, 'text/plain', 'bad url: ' + String(e)); }
    if (o.live && p === '/__dev/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' }); res.write(': hello\n\n');
      clients.add(res); req.on('close', () => clients.delete(res)); return undefined;
    }
    if (p === '/sw.js' && !existsSync(path.join(root, 'sw.js'))) {
      const built = path.join(root, 'build', 'sw.js');
      if (!existsSync(built)) return send(404, 'text/plain', 'build/sw.js is not built yet: npm run build');
      return send(200, TYPES['.js'], DEV_SW_PRELUDE + readFileSync(built, 'utf8'), { 'service-worker-allowed': '/' });
    }
    let f = path.join(root, path.normalize(p));
    if (f !== root && !f.startsWith(root + path.sep)) return send(403, 'text/plain', 'outside the folder');
    if (existsSync(f) && statSync(f).isDirectory()) f = path.join(f, 'index.html');
    if (!existsSync(f) || !statSync(f).isFile()) return send(404, 'text/plain', 'not found: ' + p);
    const type = TYPES[path.extname(f).toLowerCase()] || 'application/octet-stream';
    if (o.live && path.basename(f) === 'index.html') return send(200, type, readFileSync(f, 'utf8').replace('</body>', LIVE + '</body>'));
    res.writeHead(200, { 'content-type': type, 'content-length': statSync(f).size, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    return createReadStream(f).pipe(res);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(o.port ?? 0, o.host ?? '127.0.0.1', () => {
      if (o.unref) server.unref();
      const a = server.address(), port = typeof a === 'object' && a ? a.port : 0;
      resolve({
        url: `http://${o.host === '0.0.0.0' ? 'localhost' : (o.host ?? '127.0.0.1')}:${port}`,
        reload: () => { for (const c of clients) c.write('data: reload\n\n'); },
        close: () => new Promise(r => { for (const c of clients) c.end(); server.close(() => r(undefined)); server.closeAllConnections?.(); }),
      });
    });
  });
}
