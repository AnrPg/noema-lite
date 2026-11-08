/* The bootstrap of a mini-app (html-app@1): the first script of its frame, allowed by its hash (docs/INTERACTIVE.md §8). It claims
   the one MessagePort the host hands over (only a welcome from the app's window, parent.parent, with the right nonce), then offers
   window.noema (frozen) to the mini-app: init, words, state, events, results, hints, the engines of the library (noema.engine,
   noema.sim: requests the host checks), resize. Text of a script, not code of the app. */

/* i18n-ignore-start */ // code
export function bootstrap(nonce: string): string {
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
/* i18n-ignore-end */
