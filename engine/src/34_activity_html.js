/* ===================== interactive activities — runtime html-app@1 (Tier A: one self-contained HTML file) =====================
   The mini-app runs in <iframe sandbox="allow-scripts"> (opaque origin "null": no app storage, cookies, DOM or same-origin
   requests), loaded as srcdoc with a Content-Security-Policy first in <head>: no network at all, no forms, no frames, no workers,
   and scripts only by hash — exactly the inline scripts of the bundle, after the loop guard was added to them (33_activity_guard.js),
   so no script the app did not check can ever run (no inline handlers, no javascript: URLs, no scripts made at run time).
   Two frames: the app's frame holds only a WRAPPER document (no scripts) whose policy says frame-src 'none', and the mini-app runs in
   the wrapper's own sandboxed frame. A frame can always navigate itself (location.replace, a link, a meta refresh) and the new page
   would have no policy at all; the wrapper's frame-src blocks every such navigation, so the mini-app stays offline (docs/adr/001 §2,
   tests/activities_app.js "self-navigation"). The mini-app's srcdoc inherits the wrapper's policy too, so both list the same hashes.
   Handshake (docs/INTERACTIVE.md §8): the mini-app's bootstrap posts hello {nonce} to the app (parent.parent); the host accepts it only
   from that inner frame's window and with that nonce, and hands over one MessagePort; every later message goes over the port.
   Engines (docs/INTERACTIVE.md §8.1): a mini-app whose registry entry lists engines of the library ("engines": ["graph@1"]) asks for
   them with noema.engine(id).check(spec) / .run(spec, inputs, {seed}). The frame never gets a Worker (its policy stays as it is): the
   HOST checks every request (engineBridge below), runs the model in the library engine's own Worker (ACT.engineRunner, the runner of
   sim-spec@1, with its 5 s limit and termination) and sends back only the outputs the spec names, as data. noema.sim(spec).run(inputs)
   runs several of them as the parts of one spec (docs/INTERACTIVE.md §12.8) through the sim runtime's orchestrator (ACT.partsRunner). */
(() => {
  /* i18n-ignore-start */   // code
  const CSP = hashes => ["default-src 'none'", 'script-src ' + hashes.map(x => `'sha256-${x}'`).join(' '), "style-src 'unsafe-inline'", 'img-src data: blob:', 'font-src data:', 'media-src data: blob:',
    "connect-src 'none'", "frame-src 'none'", "child-src 'none'", "worker-src 'none'", "object-src 'none'", "form-action 'none'", "base-uri 'none'", "manifest-src 'none'"].join('; ');
  const ALLOW = ['accelerometer', 'autoplay', 'camera', 'display-capture', 'encrypted-media', 'fullscreen', 'geolocation', 'gyroscope', 'magnetometer', 'microphone', 'midi', 'payment', 'picture-in-picture', 'publickey-credentials-get', 'screen-wake-lock', 'usb', 'web-share', 'xr-spatial-tracking'].map(f => f + " 'none'").join('; ');
  const MAX_BYTES = 512 * 1024;
  const sha256 = async text => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))));
  const rndName = () => '__noemaGuard' + Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');

  /** The bootstrap: the first script of the frame. It claims the port, then offers window.noema (frozen) to the mini-app. */
  function bootstrap(nonce) {
    return `(function(){'use strict';var N=${JSON.stringify(nonce)},P='noema.activity',port=null,q=[],ready=null,H={},init=null,seq=0,waits={},stT=null;
function send(type,payload,extra){var m={p:P,v:1,type:type,payload:payload||{}};if(extra)for(var k in extra)m[k]=extra[k];if(port)port.postMessage(m);else q.push(m);}
var APP=parent.parent;
function on(e){if(e.source!==APP||!e.data||e.data.t!=='welcome'||e.data.nonce!==N||!e.ports||!e.ports[0]||port)return;port=e.ports[0];removeEventListener('message',on,true);port.onmessage=msg;port.start();while(q.length)port.postMessage(q.shift());}
addEventListener('message',on,true);
function applyTheme(t){if(!t)return;var r=document.documentElement;try{for(var k in t.tokens)r.style.setProperty('--noema-'+k,String(t.tokens[k]));r.style.colorScheme=t.scheme==='dark'?'dark':'light';r.dataset.noemaScheme=t.scheme;r.dataset.noemaMotion=t.reducedMotion?'reduce':'full';if(t.dir)r.dir=t.dir;}catch(x){}}
function fire(type,p){(H[type]||[]).slice().forEach(function(f){try{f(p);}catch(x){console.error(x);}});}
function msg(e){var m=e.data;if(!m||m.p!==P)return;var p=m.payload||{};
 if(m.type==='ping'){send('pong');return;}
 if(m.type==='init'){init=p;applyTheme(p.theme);if(p.locale)document.documentElement.lang=p.locale;rng=mulberry(p.seed>>>0);if(ready)ready(p);send('ready',{protocols:[1]});return;}
 if(m.type==='theme'){if(init)init.theme=p;applyTheme(p);fire('theme',p);return;}
 if(m.type==='locale'){if(init){init.locale=p.locale;init.strings=p.strings||init.strings;}fire('locale',p);return;}
 if(m.re&&ew[m.re]){var f=ew[m.re];delete ew[m.re];f(p);return;}
 if(m.re&&waits[m.re]){var w=waits[m.re];delete waits[m.re];w(p);return;}
 fire(m.type,p);}
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
var rng=mulberry(1);
var started=new Promise(function(r){ready=r;});
function req(type,payload){var id='r'+(++seq);return new Promise(function(res){waits[id]=res;send(type,payload,{id:id});setTimeout(function(){if(waits[id]){delete waits[id];res(null);}},5000);});}
var ew={};
function eerr(p){var e=new Error(String(p.message||p.code||'engine'));e.code=String(p.code||'failed');if(Array.isArray(p.errors))e.errors=p.errors.slice();return e;}
function ereq(type,payload){return started.then(function(){return new Promise(function(res,rej){var id='e'+(++seq),t=setTimeout(function(){if(ew[id]){delete ew[id];rej(eerr({code:'timeout'}));}},20000);
 ew[id]=function(p){clearTimeout(t);if(p&&p.ok)res(p);else rej(eerr(p||{}));};
 try{send(type,payload,{id:id});}catch(x){clearTimeout(t);delete ew[id];rej(eerr({code:'spec',message:'the spec and inputs must be plain data'}));}});});}
function engine(id){id=String(id).slice(0,40);return Object.freeze({id:id,
 check:function(spec){return ereq('engine:check',{engine:id,spec:spec}).then(function(p){return Array.isArray(p.errors)?p.errors:[];});},
 run:function(spec,inputs,o){var pl={engine:id,spec:spec,inputs:inputs||{}};if(o&&o.seed!=null)pl.seed=Math.floor(Math.abs(+o.seed))>>>0;return ereq('engine:run',pl).then(function(p){return{outputs:p.outputs||{}};});}});}
function sim(spec){return Object.freeze({run:function(inputs,o){var pl={spec:spec,inputs:inputs||{}};if(o&&o.seed!=null)pl.seed=Math.floor(Math.abs(+o.seed))>>>0;return ereq('sim:run',pl).then(function(p){return{outputs:p.outputs||{},values:p.values||{},codes:Array.isArray(p.codes)?p.codes:[]};});}});}
function fill(s,vars){return String(s).replace(/\\{(\\w+)\\}/g,function(_,k){return vars&&vars[k]!=null?String(vars[k]):'{'+k+'}';});}
var lastH=0;function measure(){var h=Math.ceil(Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0));if(Math.abs(h-lastH)>2){lastH=h;send('resize',{h:h});}}
var api={
 ready:started,
 get locale(){return init?init.locale:'en';}, get seed(){return init?init.seed:0;}, get state(){return init&&init.state?init.state.data:null;},
 get stateFrom(){return init&&init.state?init.state.migrateFrom||null:null;}, get task(){return init?init.task:{};}, get theme(){return init?init.theme:null;}, get exercise(){return init?init.exerciseId:null;},
 t:function(key,vars){var s=init&&init.strings&&Object.prototype.hasOwnProperty.call(init.strings,key)?init.strings[key]:key;return fill(s,vars);},
 fmt:{number:function(n,o){try{return new Intl.NumberFormat(api.locale,o).format(n);}catch(x){return String(n);}}},
 random:function(){return rng();},
 on:function(type,f){(H[type]=H[type]||[]).push(f);},
 saveState:function(data){clearTimeout(stT);stT=setTimeout(function(){send('state',{version:init?init.stateVersion||1:1,data:data});},300);},
 event:function(name,data){send('event',data===undefined?{name:name}:{name:name,data:data});},
 result:function(r){send('result',{score:+r.score,passed:!!r.passed,detail:r.detail==null?undefined:String(r.detail).slice(0,500)});},
 hint:function(){return req('hint:request',{}).then(function(p){return p&&p.text||null;});},
 announce:function(text){send('a11y:announce',{text:String(text).slice(0,300)});},
 error:function(code,message){send('error',{code:String(code).slice(0,40),message:message==null?undefined:String(message).slice(0,500)});},
 resize:function(){measure();},
 engines:function(){return init&&Array.isArray(init.engines)?init.engines.slice():[];},
 engine:engine,
 sim:sim
};
Object.freeze(api.fmt);Object.freeze(api);
Object.defineProperty(window,'noema',{value:api,writable:false,configurable:false});
addEventListener('DOMContentLoaded',function(){measure();try{new ResizeObserver(measure).observe(document.documentElement);}catch(x){setInterval(measure,500);}});
addEventListener('error',function(e){try{send('error',{code:'script',message:String(e.message||'').slice(0,300)});}catch(x){}});
APP.postMessage({t:'hello',nonce:N},'*');
})();`;
  }

  /** The author's file → the document for srcdoc (async: script hashes). Throws an Error with a code on what cannot run. */
  async function buildDoc(html, nonce, want) {
    if (typeof html !== 'string' || !html.trim()) throw Object.assign(new Error('empty'), { code: 'empty' });
    if (new TextEncoder().encode(html).length > MAX_BYTES) throw Object.assign(new Error('too big'), { code: 'size' });
    if (!crypto?.subtle) throw Object.assign(new Error('no crypto.subtle'), { code: 'crypto' });
    if (want) {   // the bundle is content-addressed: it must be the one the pack names
      const hex = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(html))), b => b.toString(16).padStart(2, '0')).join('');
      if (hex !== String(want).toLowerCase()) throw Object.assign(new Error('sha256 mismatch'), { code: 'integrity' });
    }
    const doc = new DOMParser().parseFromString(html, 'text/html');   // inert: nothing in it runs here
    const G = rndName();
    for (const n of doc.querySelectorAll('base, meta[http-equiv], script[src], link[rel]:not([rel~="stylesheet"]), link[href]:not([href^="data:"])')) n.remove();
    const hashes = [];
    for (const s of doc.querySelectorAll('script')) {
      const type = (s.getAttribute('type') || '').trim().toLowerCase();
      if (type && !['text/javascript', 'module', 'application/javascript'].includes(type)) continue;   // data blocks (application/json…) do not run
      s.textContent = NoemaLoopGuard.transform(s.textContent, G).code;
      hashes.push(await sha256(s.textContent));
    }
    const boot = bootstrap(nonce), guard = NoemaLoopGuard.runtime(G, 1500, "function(){try{window.noema&&window.noema.error('runaway','the activity ran too long')}catch(e){}}");
    hashes.unshift(await sha256(boot), await sha256(guard));
    const head = doc.head;
    const add = (tag, attrs, text) => { const e = doc.createElement(tag); for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; };
    const first = [add('meta', { charset: 'utf-8' }), add('meta', { 'http-equiv': 'Content-Security-Policy', content: CSP(hashes) }), add('script', {}, boot), add('script', {}, guard)];
    if (!doc.querySelector('meta[name="viewport"]')) first.push(add('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1' }));
    first.push(add('style', {}, ':root{color-scheme:light dark}html,body{margin:0;background:var(--noema-card,var(--noema-bg,#fff));color:var(--noema-ink,#222);font-family:var(--noema-font,system-ui,sans-serif)}'));
    head.prepend(...first);
    const inner = '<!doctype html>' + doc.documentElement.outerHTML;
    // the wrapper: no scripts of its own; its policy (inherited by the mini-app's srcdoc) blocks every navigation of the inner frame
    const w = document.implementation.createHTMLDocument('');
    const wm = w.createElement('meta'); wm.setAttribute('http-equiv', 'Content-Security-Policy'); wm.setAttribute('content', CSP(hashes));
    const ws = w.createElement('style'); ws.textContent = 'html,body{margin:0;height:100%;overflow:hidden;background:transparent}iframe{display:block;border:0;width:100%;height:100%}';
    const wf = w.createElement('iframe'); wf.setAttribute('sandbox', 'allow-scripts'); wf.setAttribute('allow', ALLOW); wf.setAttribute('referrerpolicy', 'no-referrer'); wf.setAttribute('srcdoc', inner);
    w.head.replaceChildren(wm, ws); w.body.replaceChildren(wf);
    return '<!doctype html>' + w.documentElement.outerHTML;
  }

  /* ---------- the engines of a mini-app (docs/INTERACTIVE.md §8.1, docs/INTERACTIVE_LIBRARY.md §4) ----------
     Only the engines of the library (NoemaCore.engines.catalog.LIBRARY: pure, bounded, no hidden state; never formula@1, which computes
     nothing, nor a plugin with a fault bench), only those the registry entry lists, only in their Worker. Per mini-app and engine: one
     Worker, made on the first run and reused (another model goes to the same Worker), ended when the mini-app is unmounted; one run
     at a time and one waiting (a newer run replaces the waiting one: "superseded"); each run ≤ 5 s (the sim runner's limit: the
     Worker is ended, "timeout"; after 3 the engine is off for this mount); ≤ 30 requests a second. Every field is checked; a failure
     is an answer with a code, never a crash. */
  const ENG = { max: 8, inputs: 64, errors: 20, outBytes: 512 * 1024, perSec: 30, timeouts: 3 };
  const IN_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,31}$/;
  const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const declaredOf = act => Array.isArray(act?.engines) ? [...new Set(act.engines.filter(x => typeof x === 'string'))].slice(0, ENG.max) : [];
  /** the declared engines this app can run for a mini-app: of the library, loaded (ACT loads them before the mount), with a Worker source, Workers here */
  function enginesFor(act) {
    const lib = new Set(window.NoemaCore?.engines?.catalog.LIBRARY || []);
    return declaredOf(act).filter(id => lib.has(id) && !!ACT.engine?.(id)?.workerSource && typeof Worker === 'function' && typeof ACT.engineRunner === 'function');
  }
  function engineBridge(act, seed0, reply) {
    const declared = new Set(declaredOf(act)), allowed = new Set(enginesFor(act)), slots = {};
    let closed = false, win = [];
    const no = (rid, code, message, errors) => reply('engine:result', { ok: false, code, ...(message ? { message: String(message).slice(0, 300) } : {}), ...(errors ? { errors } : {}) }, { re: rid });
    const slot = id => slots[id] || (slots[id] = { runner: null, key: null, seed: null, checked: null, errs: null, busy: null, next: null, timeouts: 0 });
    /** the model part of a sim-spec@1 spec: {model, outputs} (anything else is ignored) → [clean spec, its key] | null */
    function cleanSpec(id, spec) {
      if (!isObj(spec) || !isObj(spec.model) || !Array.isArray(spec.outputs)) return null;
      const c = { engine: id, model: spec.model, outputs: spec.outputs };
      let key; try { key = JSON.stringify(c); } catch (e) { return null; }
      return [c, key];
    }
    /** the engine's own checks (cached per model) → [message] */
    function errorsOf(id, c, key) {
      const s = slot(id); if (s.checked === key) return s.errs;
      let es; try { es = (ACT.engine(id).check?.(c) || []).map(x => String(x).slice(0, 300)); } catch (e) { es = ['the model cannot be checked: ' + String(e?.message || e).slice(0, 200)]; }
      s.checked = key; s.errs = es.slice(0, ENG.errors); return s.errs;
    }
    function inputsOf(v) {
      if (v == null) return {};
      if (!isObj(v)) return null;
      const ks = Object.keys(v); if (ks.length > ENG.inputs) return null;
      const r = {};
      for (const k of ks) { const x = v[k]; if (!IN_NAME.test(k) || !((typeof x === 'number' && isFinite(x)) || typeof x === 'boolean')) return null; r[k] = x; }
      return r;
    }
    function start(id, job) {
      const s = slot(id), E = ACT.engine(id);
      s.busy = job;
      const opts = { seed: job.seed, task: {} };
      try {
        if (!s.runner) {
          s.runner = ACT.engineRunner(E, job.spec, opts, why => {   // the run took longer than the limit: the Worker is ended
            const b = s.busy; s.runner = null; s.key = null; s.busy = null; s.timeouts++;
            if (s.timeouts >= ENG.timeouts) allowed.delete(id);
            if (b) no(b.rid, why === 'runaway' ? 'timeout' : 'failed', why === 'runaway' ? 'the engine took longer than 5 s' : null);
            const n = s.next; s.next = null; if (n) { if (allowed.has(id)) start(id, n); else no(n.rid, 'unavailable'); }
          });
          if (!s.runner.inWorker()) { s.runner.close(); s.runner = null; allowed.delete(id); throw Object.assign(new Error('no Worker here'), { code: 'unavailable' }); }
          s.key = job.key; s.seed = job.seed;
        } else if (s.key !== job.key || s.seed !== job.seed) { s.runner.respec(job.spec, opts); s.key = job.key; s.seed = job.seed; }
        const r = s.runner;
        r.run(job.inputs, out => {
          if (closed || s.busy !== job) return;
          s.busy = null;
          if (out == null || typeof out !== 'object') no(job.rid, 'failed', 'the engine could not compute this model');
          else if (ACTP.size(out) > ENG.outBytes) no(job.rid, 'too-big', 'the outputs are larger than 512 KB');
          else reply('engine:result', { ok: true, outputs: out }, { re: job.rid });
          const n = s.next; s.next = null; if (n) start(id, n);
        });
      } catch (e) {
        s.busy = null; no(job.rid, e.code || 'failed', e.code ? e.message : null);
        const n = s.next; s.next = null; if (n) { if (allowed.has(id)) start(id, n); else no(n.rid, 'unavailable'); }
      }
    }
    /** a request of the mini-app, already checked by ACTP (engine:check | engine:run, with an id) */
    function handle(m) {
      if (closed) return;
      const p = m.payload, rid = m.id, id = p.engine, now = Date.now();
      win = win.filter(t => now - t < 1000); win.push(now);
      if (win.length > ENG.perSec) return no(rid, 'rate', 'more than ' + ENG.perSec + ' engine requests a second');
      if (m.type === 'sim:run') return simJob(m);
      if (!declared.has(id)) return no(rid, 'undeclared', 'the activity\'s registry entry does not list ' + id + ' in "engines"');
      if (!allowed.has(id)) return no(rid, 'unavailable', id + ' does not run here');
      const cs = cleanSpec(id, p.spec);
      if (!cs) return no(rid, 'spec', 'the spec is {model, outputs}, as in a sim-spec@1 spec', ['spec: needs model (an object) and outputs (a list)']);
      const errs = errorsOf(id, cs[0], cs[1]);
      if (m.type === 'engine:check') return reply('engine:result', { ok: true, errors: errs }, { re: rid });
      if (errs.length) return no(rid, 'spec', errs[0], errs);
      const inputs = inputsOf(p.inputs);
      if (!inputs) return no(rid, 'inputs', 'inputs are at most ' + ENG.inputs + ' names (letters, digits, _) with numbers or true/false');
      const s = slot(id), job = { rid, spec: cs[0], key: cs[1], inputs, seed: p.seed == null ? (seed0 >>> 0) || 1 : p.seed >>> 0 };
      if (!s.busy) return start(id, job);
      if (s.next) no(s.next.rid, 'superseded', 'a newer run replaced this one');
      s.next = job;
    }
    /* noema.sim(spec).run(inputs): a spec with parts {consts?, derived?, parts, couple?} whose engines are all declared and allowed;
       the inputs override its consts; the same checks as a sim-spec@1 spec (packcheck), run by the sim runtime's parts orchestrator
       (ACT.partsRunner: each part in its engine's Worker, ≤ 5 s in all). One run at a time per mini-app and one waiting ("superseded"). */
    const sims = { runner: null, key: null, busy: null, next: null };
    function simJob(m) {
      const p = m.payload, rid = m.id, sp = p.spec, PC = window.NoemaPackCheck;
      if (!Array.isArray(sp.parts) || typeof ACT.partsRunner !== 'function' || !PC?.checkSimSpec) return no(rid, Array.isArray(sp.parts) ? 'unavailable' : 'spec', 'the spec is {consts?, derived?, parts, couple?}', Array.isArray(sp.parts) ? undefined : ['spec.parts: a list of parts is required']);
      const engs = [...new Set(sp.parts.map(q => (q && typeof q === 'object' ? q.engine : null)))];
      const bad = engs.find(e => typeof e !== 'string' || !declared.has(e)); if (bad !== undefined) return no(rid, 'undeclared', 'the activity\'s registry entry does not list ' + String(bad).slice(0, 40) + ' in "engines"');
      const off = engs.find(e => !allowed.has(e)); if (off) return no(rid, 'unavailable', off + ' does not run here');
      const inputs = inputsOf(p.inputs); if (!inputs) return no(rid, 'inputs', 'inputs are at most ' + ENG.inputs + ' names (letters, digits, _) with numbers or true/false');
      const consts = { ...(isObj(sp.consts) ? sp.consts : {}), ...inputs }, full = { format: 'noema.sim-spec/v1', consts, params: [], parts: sp.parts, ...(sp.derived !== undefined ? { derived: sp.derived } : {}), ...(sp.couple !== undefined ? { couple: sp.couple } : {}) };
      let key; try { key = JSON.stringify([full.parts, full.derived, full.couple, Object.keys(consts).sort()]); } catch (e) { return no(rid, 'spec', 'the spec must be plain data'); }
      let errs; try { errs = PC.checkSimSpec(full, null, ACT.engines ? ACT.engines() : null).filter(x => !/^spec\.params /.test(x)).map(x => String(x).slice(0, 300))   /* a mini-app has no controls: its inputs are the consts */.slice(0, ENG.errors); } catch (e) { errs = ['the spec cannot be checked']; }
      if (errs.length) return no(rid, 'spec', errs[0], errs);
      const job = { rid, full, key, consts, seed: p.seed == null ? (seed0 >>> 0) || 1 : p.seed >>> 0 };
      if (!sims.busy) return simStart(job);
      if (sims.next) no(sims.next.rid, 'superseded', 'a newer run replaced this one');
      sims.next = job;
    }
    function simStart(job) {
      if (!sims.runner || sims.key !== job.key + ':' + job.seed) {
        try { sims.runner?.close(); } catch (e) { }
        sims.key = job.key + ':' + job.seed;
        sims.runner = ACT.partsRunner(job.full, { seed: job.seed, task: { ...job.consts } }, why => {
          const b = sims.busy; sims.runner = null; sims.key = null; sims.busy = null;
          if (b) no(b.rid, why === 'runaway' ? 'timeout' : 'failed', why === 'runaway' ? 'the parts took longer than 5 s' : null);
          const n = sims.next; sims.next = null; if (n) simStart(n);
        });
      }
      sims.busy = job;
      sims.runner.run({ ...job.consts }, r => {
        if (closed || sims.busy !== job) return;
        sims.busy = null;
        if (!r || !r.outputs) no(job.rid, 'failed', 'the parts could not compute this model');
        else { const vals = {}; for (const [k, v] of Object.entries(r.env || {})) if (!(k in job.consts) && (typeof v === 'number' || typeof v === 'boolean')) vals[k] = v;
          const pl = { ok: true, outputs: r.outputs, values: vals, codes: (r.codes || []).slice(0, 20) };
          if (ACTP.size(pl) > ENG.outBytes) no(job.rid, 'too-big', 'the outputs are larger than 512 KB'); else reply('engine:result', pl, { re: job.rid }); }
        const n = sims.next; sims.next = null; if (n) simStart(n);
      });
    }
    function close() { closed = true; for (const s of Object.values(slots)) { try { s.runner?.close(); } catch (e) { } s.runner = null; s.busy = s.next = null; } try { sims.runner?.close(); } catch (e) { } sims.runner = null; sims.busy = sims.next = null; }
    return { handle, close, engines: [...allowed] };
  }

  ACT.registerRuntime({
    id: 'html-app@1', version: 1,
    /** → port { send(type, payload, extra), close() } */
    mount(box, { act, init, title, onMessage, onFail }) {
      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
      const frame = document.createElement('iframe');
      frame.setAttribute('sandbox', 'allow-scripts');   // exactly this token: never allow-same-origin (tests/activities.js checks every code path)
      frame.setAttribute('allow', ALLOW);
      frame.setAttribute('referrerpolicy', 'no-referrer');
      frame.setAttribute('title', title);
      frame.className = 'act-frame';
      let ch = null, closed = false, loads = 0;
      const pending = [];
      const port = {
        send(type, payload, extra) { const m = ACTP.out(type, payload, extra); if (ch) ch.port1.postMessage(m); else pending.push(m); },
        close() { closed = true; removeEventListener('message', hello); bridge.close(); try { ch?.port1.close(); } catch (e) { } frame.remove(); },
      };
      // the engines it lists (docs/INTERACTIVE.md §8.1): one this app cannot run → the fallback, as for a runtime that is missing
      const bridge = engineBridge(act, init?.seed, (type, payload, extra) => { if (!closed) port.send(type, payload, extra); });
      if (declaredOf(act).length > bridge.engines.length) {
        console.warn('[noema] html-app', act.id, 'needs engines this app cannot run here:', declaredOf(act).filter(x => !bridge.engines.includes(x)).join(', '));
        Promise.resolve().then(() => { if (!closed) onFail('unsupported'); });
        return port;
      }
      function hello(e) {
        const app = (() => { try { return frame.contentWindow?.frames[0] || null; } catch (x) { return null; } })();   // the mini-app's window, inside the wrapper
        if (closed || ch || !app || e.source !== app) return;
        const d = e.data; if (!d || d.t !== 'hello' || d.nonce !== nonce) return;
        removeEventListener('message', hello);
        ch = new MessageChannel();
        ch.port1.onmessage = m => {
          if (closed) return;
          const d = m.data;   // an engine request goes to the bridge once ACTP has checked it; everything else (and every bad message: a strike) to the core
          if (d && typeof d.type === 'string' && (d.type === 'engine:run' || d.type === 'engine:check' || d.type === 'sim:run')) { const r = ACTP.check(d); if (r.ok && typeof r.msg.id === 'string') return bridge.handle(r.msg); }
          onMessage(d);
        };
        app.postMessage({ t: 'welcome', nonce }, '*', [ch.port2]);
        ch.port1.postMessage(ACTP.out('init', { ...init, engines: bridge.engines }));
        while (pending.length) ch.port1.postMessage(pending.shift());
      }
      addEventListener('message', hello);
      frame.addEventListener('load', () => { if (++loads > 1 && !closed) onFail('navigated'); });   // a frame that navigates away is stopped at once
      buildDoc(String(act.html || ''), nonce, act.sha256).then(doc => { if (closed) return; frame.srcdoc = doc; box.append(frame); })
        .catch(e => { console.warn('[noema] html-app', act.id, e.code || e.message); if (!closed) onFail(e.code || 'build'); });
      return port;
    },
  });
  /* i18n-ignore-end */
})();
