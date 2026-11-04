/* ===================== interactive activities — runtime html-app@1 (Tier A: one self-contained HTML file) =====================
   The mini-app runs in <iframe sandbox="allow-scripts"> (opaque origin "null": no app storage, cookies, DOM or same-origin
   requests), loaded as srcdoc with a Content-Security-Policy first in <head>: no network at all, no forms, no frames, no workers,
   and scripts only by hash — exactly the inline scripts of the bundle, after the loop guard was added to them (33_activity_guard.js),
   so no script the app did not check can ever run (no inline handlers, no javascript: URLs, no scripts made at run time).
   Handshake (docs/INTERACTIVE.md §8): the frame's bootstrap posts hello {nonce} to the parent; the host accepts it only from that
   frame's window and with that nonce, and hands over one MessagePort; every later message goes over the port. Spikes: docs/adr/001 §2. */
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
function on(e){if(e.source!==parent||!e.data||e.data.t!=='welcome'||e.data.nonce!==N||!e.ports||!e.ports[0]||port)return;port=e.ports[0];removeEventListener('message',on,true);port.onmessage=msg;port.start();while(q.length)port.postMessage(q.shift());}
addEventListener('message',on,true);
function applyTheme(t){if(!t)return;var r=document.documentElement;try{for(var k in t.tokens)r.style.setProperty('--noema-'+k,String(t.tokens[k]));r.style.colorScheme=t.scheme==='dark'?'dark':'light';r.dataset.noemaScheme=t.scheme;r.dataset.noemaMotion=t.reducedMotion?'reduce':'full';if(t.dir)r.dir=t.dir;}catch(x){}}
function fire(type,p){(H[type]||[]).slice().forEach(function(f){try{f(p);}catch(x){console.error(x);}});}
function msg(e){var m=e.data;if(!m||m.p!==P)return;var p=m.payload||{};
 if(m.type==='ping'){send('pong');return;}
 if(m.type==='init'){init=p;applyTheme(p.theme);if(p.locale)document.documentElement.lang=p.locale;rng=mulberry(p.seed>>>0);if(ready)ready(p);send('ready',{protocols:[1]});return;}
 if(m.type==='theme'){if(init)init.theme=p;applyTheme(p);fire('theme',p);return;}
 if(m.type==='locale'){if(init){init.locale=p.locale;init.strings=p.strings||init.strings;}fire('locale',p);return;}
 if(m.re&&waits[m.re]){var w=waits[m.re];delete waits[m.re];w(p);return;}
 fire(m.type,p);}
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
var rng=mulberry(1);
var started=new Promise(function(r){ready=r;});
function req(type,payload){var id='r'+(++seq);return new Promise(function(res){waits[id]=res;send(type,payload,{id:id});setTimeout(function(){if(waits[id]){delete waits[id];res(null);}},5000);});}
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
 resize:function(){measure();}
};
Object.freeze(api.fmt);Object.freeze(api);
Object.defineProperty(window,'noema',{value:api,writable:false,configurable:false});
addEventListener('DOMContentLoaded',function(){measure();try{new ResizeObserver(measure).observe(document.documentElement);}catch(x){setInterval(measure,500);}});
addEventListener('error',function(e){try{send('error',{code:'script',message:String(e.message||'').slice(0,300)});}catch(x){}});
parent.postMessage({t:'hello',nonce:N},'*');
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
    return '<!doctype html>' + doc.documentElement.outerHTML;
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
        close() { closed = true; removeEventListener('message', hello); try { ch?.port1.close(); } catch (e) { } frame.remove(); },
      };
      function hello(e) {
        if (closed || ch || e.source !== frame.contentWindow) return;
        const d = e.data; if (!d || d.t !== 'hello' || d.nonce !== nonce) return;
        removeEventListener('message', hello);
        ch = new MessageChannel();
        ch.port1.onmessage = m => { if (!closed) onMessage(m.data); };
        frame.contentWindow.postMessage({ t: 'welcome', nonce }, '*', [ch.port2]);
        ch.port1.postMessage(ACTP.out('init', init));
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
