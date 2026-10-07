/* engine/imglib.js — finding and fetching pictures, without the network (a scripted web):
   Wikimedia links of every form → the file · a page → its main picture (not a logo) · picture sizes · one search over
   many sources (Bing tiles, Commons, Openverse; a failing source does not stop the others) · fetchPicture: pages,
   redirects, private addresses refused · fetch_image.py / find_images.py (Python) resolve the same way.
   Usage: node tests/imglib.js <repo-dir> */
const path = require('path'), fs = require('fs'), os = require('os'), http = require('http'), { execFileSync, spawnSync, spawn } = require('child_process');
const runPy = args => new Promise(res => { const c = spawn('python3', args); let out = ''; c.stdout.on('data', d => out += d); c.stderr.on('data', d => out += d); c.on('close', status => res({ status, stdout: out })); });   // async: the local test server must keep answering
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
let fails = 0; const ok = (c, m) => { console.log((c ? '  ✅ ' : '  ❌ ') + m); if (!c) fails++; };
require(path.join(ROOT, 'engine/imglib.js')); const L = globalThis.NoemaImgLib;

(async () => {
  console.log('— Wikimedia links → the picture file');
  const R = L.resolvePictureUrl;
  ok(R('https://commons.wikimedia.org/wiki/File:DNA_Structure%2BKey%2BLabelled.pn_NoBB.png') === 'https://commons.wikimedia.org/wiki/Special:FilePath/DNA_Structure%2BKey%2BLabelled.pn_NoBB.png?width=2400', 'a Commons file page (the link that failed) → Special:FilePath');
  ok(R('https://en.wikipedia.org/wiki/DNA#/media/File:DNA_Structure%2BKey%2BLabelled.pn_NoBB.png').startsWith('https://commons.wikimedia.org/wiki/Special:FilePath/DNA_Structure'), 'a Wikipedia article “#/media/File:…” link → the file');
  ok(R('https://el.wikipedia.org/wiki/%CE%91%CF%81%CF%87%CE%B5%CE%AF%CE%BF:Heart_diagram.svg') === 'https://el.wikipedia.org/wiki/Special:FilePath/Heart_diagram.svg?width=2400', 'a Greek Wikipedia “Αρχείο:” page → the file');
  ok(R('https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/X.png/220px-X.png') === 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/X.png/1600px-X.png', 'a small thumbnail → a 1600 px rendering');
  ok(R('https://en.wikipedia.org/wiki/DNA') === 'https://en.wikipedia.org/wiki/DNA' && R('https://example.org/a.png') === 'https://example.org/a.png', 'an article and other sites stay as they are');

  console.log('— a page → its main picture');
  const P = L.pageImage;
  ok(P('<meta property="og:image" content="/img/fork.png">', 'https://site.org/a/b') === 'https://site.org/img/fork.png', 'og:image (relative → absolute)');
  ok(P('<meta property="og:image" content="https://s.org/stumbleupon.png"><img src="/f/diagram.jpg" width="900" height="600"><img src="/f/small.jpg" width="90" height="60">', 'https://s.org/') === 'https://s.org/f/diagram.jpg', 'a logo in og:image is skipped → the largest picture of the page');
  ok(P('<meta name="twitter:image" content="https://x.org/t.jpg">', 'https://x.org') === 'https://x.org/t.jpg' && P('<p>no pictures</p>', 'https://x.org') === null, 'twitter:image; no picture → null');

  console.log('— picture sizes');
  const T = fs.mkdtempSync(path.join(os.tmpdir(), 'imglib-'));
  execFileSync('python3', ['-c', `
import sys
from PIL import Image
for fmt, ext in (('PNG', 'png'), ('JPEG', 'jpg'), ('GIF', 'gif'), ('WEBP', 'webp')): Image.new('RGB', (321, 123), 'white').save(sys.argv[1] + '/p.' + ext, fmt)`, T]);
  const sz = ['png', 'jpg', 'gif', 'webp'].map(e => L.imageSize(fs.readFileSync(path.join(T, 'p.' + e))));
  ok(sz.every(s => s && s.w === 321 && s.h === 123), 'PNG, JPEG, GIF, WebP: 321×123 ' + JSON.stringify(sz.map(s => s?.mime)));
  ok(JSON.stringify(L.imageSize(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450"></svg>'))) === '{"w":800,"h":450,"mime":"image/svg+xml"}' && L.imageSize(Buffer.from('<html>')) === null, 'SVG from its viewBox; HTML is not a picture');

  console.log('— one search over many sources (a scripted web)');
  const PNG = fs.readFileSync(path.join(T, 'p.png'));
  const calls = [];
  const resp = (body, type = 'application/json', status = 200, headers = {}) => new Response(typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body), { status, headers: { 'content-type': type, ...headers } });
  globalThis.NOEMA_IMG_FETCH = async (url, opt = {}) => {
    calls.push({ url: String(url), ua: opt.headers?.['user-agent'] || '' }); const u = new URL(url);
    if (u.hostname === 'www.bing.com') return resp(`<a class="iusc" m="{&quot;murl&quot;:&quot;https://pubs.example.edu/figs/replication-fork.png&quot;,&quot;purl&quot;:&quot;https://pubs.example.edu/chapter5&quot;,&quot;t&quot;:&quot;Replication fork &lt;b&gt;diagram&lt;/b&gt;&quot;}"></a><a m="{&quot;murl&quot;:&quot;https://upload.wikimedia.org/c/fork.png&quot;,&quot;purl&quot;:&quot;https://commons.wikimedia.org/wiki/File:Fork.png&quot;,&quot;t&quot;:&quot;Fork&quot;}"></a>`, 'text/html');
    if (u.hostname === 'commons.wikimedia.org' && u.pathname === '/w/api.php') return resp({ query: { pages: { 1: { index: 1, title: 'File:Fork.png', imageinfo: [{ url: 'https://upload.wikimedia.org/c/fork.png', thumburl: 'https://upload.wikimedia.org/c/fork.png', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Fork.png', width: 2000, height: 1500, extmetadata: { LicenseShortName: { value: 'CC BY-SA 4.0' }, Artist: { value: '<a>Someone</a>' } } }] }, 2: { index: 2, title: 'File:Okazaki.svg', imageinfo: [{ url: 'https://upload.wikimedia.org/c/okazaki.svg', descriptionurl: 'https://commons.wikimedia.org/wiki/File:Okazaki.svg', width: 900, height: 600, extmetadata: {} }] } } } });
    if (u.hostname === 'api.openverse.org') return resp({ results: [{ url: 'https://live.staticflickr.com/x.jpg', foreign_landing_url: 'https://flickr.com/p/1', title: 'Helicase', width: 1600, height: 1200, license: 'by', license_version: '2.0', creator: 'Lab', source: 'flickr' }] });
    if (u.hostname === 'duckduckgo.com') return resp('busy', 'text/plain', 503);
    if (u.hostname === 'www.textbook.org' && u.pathname === '/dna') return resp('<html><meta property="og:image" content="/fig/helix.png"></html>', 'text/html');
    if (u.hostname === 'www.textbook.org' && u.pathname === '/fig/helix.png') return resp('', 'text/plain', 302, { location: 'https://cdn.textbook.org/helix-final.png' });
    if (u.hostname === 'cdn.textbook.org') return resp(new Uint8Array(PNG), 'image/png');
    return resp('not found', 'text/plain', 404);
  };
  const s = await L.searchImages('replication fork', { n: 10 });
  ok(s.results.length === 4 && s.results[0].source === 'bing' && s.results[1].source === 'commons' && s.results[2].source.startsWith('openverse'), 'Bing (the whole web), Commons, Openverse — interleaved, best of each first: ' + s.results.map(r => r.source).join(', '));
  ok(s.results[0].title === 'Replication fork diagram' && s.results[0].page === 'https://pubs.example.edu/chapter5' && s.results[1].license === 'CC BY-SA 4.0' && s.results[1].credit === 'Someone', 'titles, pages, licences and credits are kept');
  ok(s.results.filter(r => /fork\.png$/.test(r.url) && /wikimedia/.test(r.url)).length === 1, 'the same picture from two sources is listed once');
  ok(/503/.test(s.errors.duckduckgo || '') && Object.keys(s.errors).length === 1, 'a source that fails (DuckDuckGo busy) is reported, the others still answer');
  ok(calls.find(c => c.url.includes('bing.com')).ua.includes('Mozilla') && calls.find(c => c.url.includes('commons')).ua.includes('noema-lite'), 'web searches go with a browser user agent, Wikimedia with a descriptive one (its rule)');
  const only = await L.searchImages('helicase', { sources: ['openverse'] });
  ok(only.results.length === 1 && only.results[0].license === 'BY 2.0', 'one source only (sources: ["openverse"])');

  console.log('— fetching one picture (the connector)');
  const f = await L.fetchPicture('https://www.textbook.org/dna');
  ok(f.url === 'https://cdn.textbook.org/helix-final.png' && f.page === 'https://www.textbook.org/dna' && f.w === 321 && f.mime === 'image/png', 'a page → its picture (redirect followed); the page is kept for the credit');
  let e1 = ''; try { await L.fetchPicture('http://169.254.169.254/latest/meta-data'); } catch (e) { e1 = e.message; }
  let e2 = ''; try { await L.fetchPicture('http://localhost:8080/x.png'); } catch (e) { e2 = e.message; }
  ok(/not allowed/.test(e1) && /not allowed/.test(e2), 'private / local addresses are refused');
  delete globalThis.NOEMA_IMG_FETCH;

  console.log('— the skill’s scripts (Python): the same rules');
  const py = `
import sys, json; sys.path.insert(0, sys.argv[1])
import fetch_image as F
print(json.dumps([F.wiki_title('https://commons.wikimedia.org/wiki/File:DNA_Structure%2BKey%2BLabelled.pn_NoBB.png'),
  F.wiki_title('https://en.wikipedia.org/wiki/DNA#/media/File:Fork.png'), F.wiki_title('https://en.wikipedia.org/wiki/DNA'),
  F.bigger_thumb('https://upload.wikimedia.org/wikipedia/commons/thumb/4/4c/X.png/220px-X.png'),
  F.page_image('<meta property="og:image" content="https://s.org/logo.png"><img src="/f/big.jpg" width="900" height="600">', 'https://s.org/'),
  F.wikimedia_file('https://thumb.wikimedia.org/wikipedia/commons/thumb/8/8f/DNA_replication_en.svg/1920px-DNA_replication_en.svg.png?utm_source=x')]))`;
  const out = JSON.parse(execFileSync('python3', ['-c', py, path.join(ROOT, 'tools')]).toString());
  ok(out[0][0] === 'commons.wikimedia.org' && out[0][1] === 'File:DNA Structure+Key+Labelled.pn NoBB.png' && out[1][0] === 'commons.wikimedia.org' && out[2] === null, 'fetch_image.py: Commons and “#/media/File:” links → the file (API with author + licence)');
  ok(out[3].endsWith('/1600px-X.png') && out[4] === 'https://s.org/f/big.jpg', 'fetch_image.py: thumbnails enlarged; a page → its main picture (logos skipped)');
  ok(out[5] === 'File:DNA replication en.svg', 'fetch_image.py: a picture on Wikimedia (e.g. an article’s main picture) → its file, for author + licence');
  // fetch_image.py with a page on a local server: the picture is saved and registered with the page as its source
  const srv = http.createServer((q, r) => { if (q.url === '/page') { r.writeHead(200, { 'content-type': 'text/html' }); r.end('<html><meta property="og:image" content="/pic.png"></html>'); } else if (q.url === '/pic.png') { r.writeHead(200, { 'content-type': 'image/png' }); r.end(PNG); } else { r.writeHead(404); r.end(); } });
  await new Promise(res => srv.listen(0, res)); const port = srv.address().port; const W = path.join(T, 'subj');
  const run = await runPy([path.join(ROOT, 'tools/fetch_image.py'), W, 'fork', `http://127.0.0.1:${port}/page`, '--alt', 'A fork']);
  const reg = fs.existsSync(path.join(W, 'media/media.json')) ? JSON.parse(fs.readFileSync(path.join(W, 'media/media.json'), 'utf8')) : { items: [] };
  ok(run.status === 0 && fs.existsSync(path.join(W, 'media/fork.png')) && reg.items[0]?.url === `http://127.0.0.1:${port}/page` && reg.items[0].license.includes('personal study'), 'fetch_image.py <page>: its picture saved as media/fork.png, the page recorded as the source ' + (run.status ? run.stdout : ''));
  const bad = await runPy([path.join(ROOT, 'tools/fetch_image.py'), W, 'x', 'http://127.0.0.1:1/none.png']);
  ok(bad.status === 2 && /noema_image_fetch/.test(bad.stdout), 'unreachable site → exit 2 and the way out (the connector’s noema_image_fetch)');
  srv.close();
  const fi = spawnSync('python3', [path.join(ROOT, 'tools/find_images.py')], { encoding: 'utf8' });
  ok(fi.status === 1 && /Bing Images and DuckDuckGo Images/.test(fi.stdout), 'find_images.py: usage');
  fs.rmSync(T, { recursive: true, force: true });
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED'); process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
