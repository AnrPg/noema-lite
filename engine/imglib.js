/* noema-lite — finding and fetching pictures from the web (docs/VISUAL.md §6). One file, used everywhere:
     • the browser app (engine/claude.js: Claude's picture tools in "Create with Claude"),
     • the picture proxy /api/img + the image search /api/imgsearch (cloud/img/proxy.mjs),
     • the Claude connector (cloud/mcp/server.mjs: noema_image_search, noema_image_fetch).
   Pictures are for the learner's personal study; any licence is accepted and the source is always recorded.

   resolvePictureUrl(url)  Wikimedia file pages (commons / any wikipedia, any language, “#/media/File:…”, small
                           thumbnails) → the image file itself (Special:FilePath, a large rendering)
   pageImage(html, base)   a web page → its main picture (og:image, twitter:image, image_src, the largest <img>)
   imageSize(bytes)        PNG / JPEG / GIF / WebP / SVG → { w, h, mime }
   searchImages(q, opts)   one search over many keyless sources → [{ url, page, title, w, h, thumb, source, license, credit }]
                           web-wide: Bing Images, DuckDuckGo Images; open collections: Wikimedia Commons, Openverse,
                           NASA, iNaturalist, Wellcome Collection, Art Institute of Chicago.
   Network calls use root.NOEMA_IMG_FETCH (tests) or fetch. */
(function (root) {
  'use strict';
  const UA = 'noema-lite/1.0 (https://noema-lite.netlify.app; personal study app; picture finder)';
  const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
  const IMG_EXT = /\.(png|jpe?g|gif|webp|svg|tiff?|bmp|avif)$/i;
  const net = () => root.NOEMA_IMG_FETCH || root.fetch.bind(root);
  const timeout = ms => (typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);
  const dec = s => { try { return decodeURIComponent(s); } catch (e) { return s; } };
  const unesc = s => String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  const strip = s => unesc(String(s || '').replace(/<[^>]+>/g, '')).trim();

  /** Wikimedia page / thumbnail urls → the picture file (a rendering ≤ 2400 px wide: originals can be 100 MB). Others unchanged. */
  function resolvePictureUrl(url) {
    let u; try { u = new URL(String(url).trim()); } catch (e) { return url; }
    const host = u.hostname.toLowerCase();
    if (/(^|\.)(wikipedia|wikimedia|wikibooks|wikiversity|wikivoyage|wiktionary)\.org$/.test(host) && host !== 'upload.wikimedia.org') {
      // …/wiki/Article#/media/File:Name.png  ·  …/wiki/File:Name.png  ·  …/wiki/Αρχείο:Name.png  ·  index.php?title=File:Name.png
      const media = /#\/media\/([^/]+)$/.exec(u.hash || '');
      let title = media ? dec(media[1]) : u.pathname.startsWith('/wiki/') ? dec(u.pathname.slice(6)) : u.searchParams.get('title') || '';
      const m = /^[^:]{2,40}:(.+)$/.exec(title);
      if (m && IMG_EXT.test(m[1]) && !/^Special:FilePath$/i.test(title.split('/')[0])) {
        const site = /commons\.wikimedia\.org$/.test(host) || media ? 'commons.wikimedia.org' : host;   // a wiki's own uploads stay on that wiki; Special:FilePath falls back to Commons
        return `https://${site}/wiki/Special:FilePath/${encodeURIComponent(m[1].replace(/ /g, '_'))}?width=2400`;
      }
      return url;
    }
    if (host === 'upload.wikimedia.org') {
      // /wikipedia/commons/thumb/a/ab/Name.png/220px-Name.png → a large rendering of the same file
      const t = /^(\/[^/]+\/[^/]+)\/thumb\/([0-9a-f])\/([0-9a-f]{2})\/([^/]+)\/(\d+)px-([^/]+)$/.exec(u.pathname);
      if (t && +t[5] < 1600) return `https://${host}${t[1]}/thumb/${t[2]}/${t[3]}/${t[4]}/${/\.svg$/i.test(t[4]) ? 1600 : Math.min(2400, Math.max(1600, +t[5]))}px-${t[6]}`;
    }
    return url;
  }
  const isWikimediaFile = url => /Special:FilePath\//.test(String(url)) || /upload\.wikimedia\.org/.test(String(url));

  /** The main picture of an HTML page (absolute url) — or null. */
  function pageImage(html, base) {
    const s = String(html || '').slice(0, 2e6), abs = x => { try { return new URL(unesc(x), base).href; } catch (e) { return null; } };
    const meta = (k) => { const re = new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]*>`, 'i'); const tag = (s.match(re) || [])[0]; const c = tag && (tag.match(/content=["']([^"']+)["']/i) || [])[1]; return c ? abs(c) : null; };
    const generic = x => !x || /logo|favicon|sprite|default|placeholder|share|social|stumbleupon|facebook|twitter|banner|brand|avatar|icon/i.test(x.split('?')[0].split('/').pop());
    const og = [meta('og:image:secure_url'), meta('og:image'), meta('og:image:url'), meta('twitter:image'), meta('twitter:image:src')].find(x => x && !generic(x));
    if (og) return og;
    const link = (s.match(/<link[^>]+rel=["']image_src["'][^>]*>/i) || [])[0]; const lh = link && (link.match(/href=["']([^"']+)["']/i) || [])[1]; if (lh) return abs(lh);
    // the largest <img> by its width / height attributes (or the first image that is not an icon)
    let best = null, bestA = 0;
    for (const tag of s.match(/<img\b[^>]*>/gi) || []) {
      const src = (tag.match(/\s(?:data-src|data-original|src)=["']([^"']+)["']/i) || [])[1]; if (!src || /^data:|sprite|logo|icon|avatar|pixel|spacer|\.gif($|\?)/i.test(src)) continue;
      const w = +((tag.match(/\swidth=["']?(\d+)/i) || [])[1] || 0), h = +((tag.match(/\sheight=["']?(\d+)/i) || [])[1] || 0); const a = (w || 300) * (h || 200);
      if (a > bestA) { bestA = a; best = abs(src); }
    }
    return best;
  }

  /** Size of a picture from its first bytes → { w, h, mime } or null. */
  function imageSize(b) {
    b = b instanceof Uint8Array ? b : new Uint8Array(b);
    const u16 = (i, le) => le ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1], u32 = i => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { w: u32(16), h: u32(20), mime: 'image/png' };
    if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return { w: u16(6, true), h: u16(8, true), mime: 'image/gif' };
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45) {
      const f = String.fromCharCode(b[12], b[13], b[14], b[15]);
      if (f === 'VP8X') return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)), mime: 'image/webp' };
      if (f === 'VP8 ') return { w: u16(26, true) & 0x3fff, h: u16(28, true) & 0x3fff, mime: 'image/webp' };
      if (f === 'VP8L') { const x = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24); return { w: (x & 0x3fff) + 1, h: ((x >> 14) & 0x3fff) + 1, mime: 'image/webp' }; }
    }
    if (b[0] === 0xff && b[1] === 0xd8) {
      for (let i = 2; i < b.length - 9;) {
        if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1], len = u16(i + 2);
        if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: u16(i + 7), h: u16(i + 5), mime: 'image/jpeg' };
        i += 2 + len;
      }
      return { w: 0, h: 0, mime: 'image/jpeg' };
    }
    const t = new TextDecoder().decode(b.slice(0, 4096));
    if (/<svg[\s>]/i.test(t)) {
      const tag = (t.match(/<svg[^>]*>/i) || [''])[0], num = k => +((tag.match(new RegExp(`\\s${k}=["']?([\\d.]+)`, 'i')) || [])[1] || 0);
      const vb = (tag.match(/viewBox=["']\s*[\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i) || []);
      return { w: Math.round(num('width') || +vb[1] || 1200), h: Math.round(num('height') || +vb[2] || 900), mime: 'image/svg+xml' };
    }
    return null;
  }

  /* ---------- search ---------- */
  const getJSON = async (url, headers = {}) => { const r = await net()(url, { headers: { 'user-agent': UA, accept: 'application/json', ...headers }, signal: timeout(9000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); };
  const getText = async (url, headers = {}) => { const r = await net()(url, { headers: { 'user-agent': BROWSER_UA, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9', ...headers }, signal: timeout(9000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); };
  const Q = encodeURIComponent;
  const SOURCES = {
    /** Bing Images — the whole web (what a Google image search shows, too). Keyless: the result page carries JSON per tile. */
    async bing(q, n) {
      const html = await getText(`https://www.bing.com/images/search?q=${Q(q)}&form=HDRSC2&first=1&qft=+filterui:imagesize-large`);
      const out = [];
      for (const m of html.matchAll(/\sm="(\{[^"]+\})"/g)) {
        let j; try { j = JSON.parse(unesc(m[1])); } catch (e) { continue; }
        if (!j.murl) continue;
        out.push({ url: j.murl, page: j.purl || null, title: strip(j.t || j.desc || ''), thumb: j.turl || null, source: 'bing', license: 'unknown — see the page', credit: (() => { try { return new URL(j.purl || j.murl).hostname; } catch (e) { return ''; } })() });
        if (out.length >= n) break;
      }
      return out;
    },
    /** DuckDuckGo Images — the whole web (Bing's index + its own); keyless with a page token. */
    async duckduckgo(q, n) {
      const page = await getText(`https://duckduckgo.com/?q=${Q(q)}&iax=images&ia=images`);
      const vqd = (page.match(/vqd=["']?([\d-]+)["']?/) || [])[1]; if (!vqd) throw new Error('no token');
      const j = await getJSON(`https://duckduckgo.com/i.js?l=us-en&o=json&q=${Q(q)}&vqd=${vqd}&f=size:Large,,,&p=1`, { referer: 'https://duckduckgo.com/', 'user-agent': BROWSER_UA });
      return (j.results || []).slice(0, n).map(r => ({ url: r.image, page: r.url, title: strip(r.title), w: r.width, h: r.height, thumb: r.thumbnail, source: 'duckduckgo', license: 'unknown — see the page', credit: r.source || '' }));
    },
    async commons(q, n) {
      const j = await getJSON(`https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrnamespace=6&gsrlimit=${Math.min(30, n * 2)}&gsrsearch=${Q(q + ' filetype:bitmap|drawing')}&prop=imageinfo&iiprop=url|size|extmetadata&iiurlwidth=1600`);
      return Object.values(j.query?.pages || {}).sort((a, b) => (a.index || 0) - (b.index || 0)).map(p => { const i = p.imageinfo?.[0] || {}, md = i.extmetadata || {}; return { url: i.thumburl || i.url, original: i.url, page: i.descriptionurl, title: p.title.replace(/^File:/, ''), w: i.thumbwidth || i.width, h: i.thumbheight || i.height, source: 'commons', license: strip(md.LicenseShortName?.value) || 'see the page', credit: strip(md.Artist?.value).slice(0, 120) }; }).filter(x => x.url).slice(0, n);
    },
    async openverse(q, n) {
      const j = await getJSON(`https://api.openverse.org/v1/images/?q=${Q(q)}&page_size=${Math.min(20, n)}`);
      return (j.results || []).map(r => ({ url: r.url, page: r.foreign_landing_url, title: r.title, w: r.width, h: r.height, thumb: r.thumbnail, source: 'openverse:' + (r.source || ''), license: [r.license, r.license_version].filter(Boolean).join(' ').toUpperCase(), credit: r.creator || '' }));
    },
    async nasa(q, n) {
      const j = await getJSON(`https://images-api.nasa.gov/search?media_type=image&q=${Q(q)}`);
      return (j.collection?.items || []).slice(0, n).map(it => { const d = it.data?.[0] || {}, l = (it.links || [])[0] || {}; return { url: (l.href || '').replace(/~thumb\.jpg$/, '~large.jpg'), page: `https://images.nasa.gov/details/${d.nasa_id}`, title: d.title, thumb: l.href, source: 'nasa', license: 'NASA (public domain in most cases)', credit: d.center || 'NASA' }; }).filter(x => x.url);
    },
    async inaturalist(q, n) {
      const j = await getJSON(`https://api.inaturalist.org/v1/taxa?q=${Q(q)}&per_page=${Math.min(10, n)}`);
      return (j.results || []).filter(t => t.default_photo).map(t => ({ url: t.default_photo.medium_url.replace('/medium.', '/large.'), page: `https://www.inaturalist.org/taxa/${t.id}`, title: `${t.preferred_common_name || ''} (${t.name})`.trim(), source: 'inaturalist', license: (t.default_photo.license_code || 'see the page').toUpperCase(), credit: t.default_photo.attribution || '' }));
    },
    async wellcome(q, n) {
      const j = await getJSON(`https://api.wellcomecollection.org/catalogue/v2/images?query=${Q(q)}&pageSize=${Math.min(20, n)}`);
      return (j.results || []).map(r => { const iiif = (r.thumbnail?.url || '').replace(/\/info\.json$/, ''); return { url: iiif ? iiif + '/full/1600,/0/default.jpg' : null, page: r.source?.id ? `https://wellcomecollection.org/works/${r.source.id}` : null, title: r.source?.title || '', source: 'wellcome', license: r.locations?.[0]?.license?.label || 'see the page', credit: 'Wellcome Collection' }; }).filter(x => x.url);
    },
    async artic(q, n) {
      const j = await getJSON(`https://api.artic.edu/api/v1/artworks/search?q=${Q(q)}&limit=${Math.min(15, n)}&fields=id,title,image_id,artist_display,is_public_domain`);
      return (j.data || []).filter(a => a.image_id).map(a => ({ url: `https://www.artic.edu/iiif/2/${a.image_id}/full/1686,/0/default.jpg`, page: `https://www.artic.edu/artworks/${a.id}`, title: a.title, source: 'artic', license: a.is_public_domain ? 'Public domain (CC0)' : 'see the page', credit: strip(a.artist_display).slice(0, 120) }));
    },
  };
  const DEFAULT = ['bing', 'commons', 'openverse', 'duckduckgo'];
  const TOPICAL = { space: ['nasa'], astronomy: ['nasa'], species: ['inaturalist'], animal: ['inaturalist'], plant: ['inaturalist'], medicine: ['wellcome'], history: ['wellcome', 'artic'], art: ['artic'] };
  /** → { results: [...], errors: { source: message } } — the sources run in parallel; one failing does not stop the others. */
  async function searchImages(q, { n = 12, sources = null } = {}) {
    q = String(q || '').trim(); if (!q) return { results: [], errors: { query: 'empty' } };
    const list = (sources && sources.length ? sources : DEFAULT).filter(s => SOURCES[s]);
    const per = Math.max(4, Math.ceil(n / Math.max(1, list.length)) + 2), errors = {};
    const got = await Promise.all(list.map(s => SOURCES[s](q, per).catch(e => { errors[s] = String(e.message || e).slice(0, 120); return []; })));
    // interleave the sources (best of each first), drop duplicates
    const out = [], seen = new Set();
    for (let i = 0; out.length < n && got.some(g => g[i]); i++) for (const g of got) { const r = g[i]; if (!r || !r.url) continue; const k = r.url.replace(/[?#].*$/, ''); if (seen.has(k)) continue; seen.add(k); out.push(r); if (out.length >= n) break; }
    return { results: out, errors };
  }

  /* ---------- fetching one picture on a server (the connector): safe, with redirects, pages and Wikimedia resolved ---------- */
  /** Private / local addresses are never fetched (= cloud/img/proxy.mjs blockedHost). */
  function blockedHost(h) {
    h = String(h || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (!h || h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') && !h.includes(':')) return true;
    const v4 = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (v4) { const [a, b] = [+v4[1], +v4[2]]; return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127); }
    if (h.includes(':')) return h === '::1' || h === '::' || /^(fc|fd|fe8|fe9|fea|feb)/.test(h) || h.startsWith('::ffff:');
    return /^\d+$/.test(h);
  }
  /** → { bytes: Uint8Array, mime, w, h, url (the picture file), page (where it came from) } — throws a readable error. */
  async function fetchPicture(url, { maxBytes = 15 * 1024 * 1024, allowLocal = false } = {}) {
    let target = new URL(resolvePictureUrl(url)), page = null, pageHops = 0;
    for (let hop = 0; hop < 7; hop++) {
      if (!/^https?:$/.test(target.protocol) || target.username || target.password) throw new Error('only plain http(s) urls');
      if (blockedHost(target.hostname) && !allowLocal && !root.NOEMA_IMG_ALLOW_LOCAL) throw new Error('this address is not allowed');
      const wiki = /(^|\.)wiki[mp]edia\.org$/.test(target.hostname);
      let r = await net()(target.href, { redirect: 'manual', signal: timeout(12000), headers: { 'user-agent': wiki ? UA : BROWSER_UA, accept: 'image/avif,image/webp,image/*,text/html;q=0.8,*/*;q=0.5' } });
      if (r.status === 429) { await new Promise(res => setTimeout(res, 1500)); r = await net()(target.href, { redirect: 'manual', signal: timeout(12000), headers: { 'user-agent': UA } }); }
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { target = new URL(r.headers.get('location'), target); continue; }
      if (!r.ok) throw new Error(`the site answered ${r.status}`);
      const type = (r.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (/^text\/html|application\/xhtml/.test(type)) {
        if (pageHops >= 2) throw new Error('no picture found on this page');
        const pic = pageImage(await r.text(), target.href); if (!pic) throw new Error('this page has no main picture — give the image file url');
        page = page || target.href; pageHops++; target = new URL(resolvePictureUrl(pic)); continue;
      }
      if (+r.headers.get('content-length') > maxBytes) throw new Error(`larger than ${Math.round(maxBytes / 1048576)} MB`);
      const bytes = new Uint8Array(await r.arrayBuffer()); if (bytes.byteLength > maxBytes) throw new Error(`larger than ${Math.round(maxBytes / 1048576)} MB`);
      const sz = imageSize(bytes); if (!sz) throw new Error(`not a picture (${type || 'unknown type'})`);
      return { bytes, mime: sz.mime, w: sz.w, h: sz.h, url: target.href, page };
    }
    throw new Error('too many redirects');
  }
  /** A smaller rendering for looking at (Wikimedia thumbnails) — or null. */
  function previewUrl(url, width = 1280) {
    const m = /^https:\/\/upload\.wikimedia\.org(\/[^/]+\/[^/]+)\/([0-9a-f])\/([0-9a-f]{2})\/([^/?#]+)/.exec(String(url)); if (!m || /\/thumb\//.test(url)) return null;
    return `https://upload.wikimedia.org${m[1]}/thumb/${m[2]}/${m[3]}/${m[4]}/${width}px-${m[4]}${/\.svg$/i.test(m[4]) ? '.png' : ''}`;
  }

  root.NoemaImgLib = { blockedHost, fetchPicture, previewUrl, resolvePictureUrl, isWikimediaFile, pageImage, imageSize, searchImages, SOURCES, DEFAULT, TOPICAL, UA, BROWSER_UA };
})(typeof window !== 'undefined' ? window : globalThis);
