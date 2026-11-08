/* The frame side of h5p@1: the first script of the item's frame, allowed by its hash (docs/INTERACTIVE_H5P.md §3). It claims the
   one MessagePort the host hands over (only a welcome from the app's window, parent.parent, with the right nonce), takes the
   content's files, starts H5P once the document, the files and init are there, and turns what H5P says into the activity protocol:
     xAPI answered / completed of the item itself (no parent) with a score → result { score: scaled 0..1, passed: success ?? score >= 0.5, detail }
     every xAPI statement → event { name: 'h5p:<verb>', data: { score?, sub? } } (the same verb at most every 250 ms)
     instance.getCurrentState() after each statement, on pause and before destroy → state { version, data: { h5p: <state> } };
     init.state comes back as H5P's contentUserData, so the item resumes where the learner left it.
   Text of a script, not code of the app. */

/* i18n-ignore-start */ // code
/** KEY: the name of the frozen object the loop guard calls when it trips (runaway) */
export function bootstrap(nonce: string, KEY: string): string {
  return `(function(){'use strict';var N=${JSON.stringify(nonce)},P='noema.activity',APP=parent.parent,port=null,q=[],init=null,files=null,inst=null,last='',stT=null,evT={},csp=0,started=false;
function send(type,payload){var m={p:P,v:1,type:type,payload:payload||{}};if(port)port.postMessage(m);else q.push(m);}
function on(e){if(e.source!==APP||!e.data||e.data.t!=='welcome'||e.data.nonce!==N||!e.ports||!e.ports[0]||port)return;port=e.ports[0];removeEventListener('message',on,true);port.onmessage=msg;port.start();while(q.length)port.postMessage(q.shift());}
addEventListener('message',on,true);
Object.defineProperty(window,${JSON.stringify(KEY)},{value:Object.freeze({runaway:function(){send('error',{code:'runaway',message:'the item ran too long'});}}),writable:false,configurable:false,enumerable:false});
function theme(t){if(!t)return;var r=document.documentElement;try{for(var k in t.tokens)r.style.setProperty('--noema-'+k,String(t.tokens[k]));r.dataset.noemaScheme=t.scheme;r.dataset.noemaMotion=t.reducedMotion?'reduce':'full';if(t.dir)r.dir=t.dir;}catch(x){}}
function saveNow(){if(!inst||typeof inst.getCurrentState!=='function')return;var s;try{s=inst.getCurrentState();}catch(x){return;}if(s===undefined)return;var j;try{j=JSON.stringify(s);}catch(x){return;}if(j===last||j.length>250000)return;last=j;send('state',{version:init&&init.stateVersion||1,data:{h5p:s}});}
function saveSoon(){clearTimeout(stT);stT=setTimeout(saveNow,300);}
function msg(e){var m=e.data;if(!m)return;
 if(m.p==='noema.h5p'&&m.type==='files'&&!files){files={};(m.files||[]).forEach(function(f){try{files[f.path]=URL.createObjectURL(new Blob([f.buf],{type:f.type||''}));}catch(x){}});go();return;}
 if(m.p!==P)return;var p=m.payload||{};
 if(m.type==='ping'){send('pong');return;}
 if(m.type==='init'){init=p;theme(p.theme);if(p.locale)document.documentElement.lang=p.locale;go();return;}
 if(m.type==='theme'){theme(p);return;}
 if(m.type==='pause'||m.type==='destroy'){saveNow();return;}}
function verb(st){var v=st&&st.verb&&st.verb.id||'';return v.slice(v.lastIndexOf('/')+1).toLowerCase().replace(/[^a-z0-9_-]/g,'').slice(0,40)||'statement';}
function xapi(ev){var st=ev&&ev.data&&ev.data.statement;if(!st)return;var v=verb(st),r=st.result||null,ctx=st.context&&st.context.contextActivities,sub=!!(ctx&&ctx.parent&&ctx.parent.length);
 var sc=r&&r.score?r.score:null,data={};if(sc&&typeof sc.max==='number'){data.score={raw:+sc.raw||0,max:+sc.max};}if(sub)data.sub=true;
 var now=Date.now();if(now-(evT[v]||0)>=250||v==='answered'||v==='completed'){evT[v]=now;send('event',{name:'h5p:'+v,data:data});}
 if(!sub&&(v==='answered'||v==='completed')&&sc){var s=typeof sc.scaled==='number'?sc.scaled:(sc.max>0?(+sc.raw||0)/sc.max:null);
  if(s!=null&&isFinite(s)){s=Math.max(0,Math.min(1,s));send('result',{score:s,passed:typeof r.success==='boolean'?r.success:s>=0.5,detail:(sc.max>0?(+sc.raw||0)+'/'+sc.max+' ':'')+v});}}
 saveSoon();}
function go(){if(started||!init||!files||document.readyState==='loading')return;started=true;
 try{var H=window.H5P,I=window.H5PIntegration,c=I.contents['cid-noema'];
  var st=init.state&&!init.state.migrateFrom&&init.state.data&&init.state.data.h5p!==undefined?init.state.data.h5p:undefined;
  if(st!==undefined){try{c.contentUserData=[{state:JSON.stringify(st)}];last=JSON.stringify(st);}catch(x){}}
  H.getPath=function(path){var k=String(path||'').split('#')[0].replace(/^\\.?\\//,'');if(Object.prototype.hasOwnProperty.call(files,k))return files[k];return 'data:,';};
  H.getLibraryPath=function(){return 'data:,';};
  H.externalDispatcher.on('xAPI',xapi);
  H.init(document.body);inst=H.instances&&H.instances[0]||null;
  if(!inst){send('error',{code:'h5p-init',message:'no instance'});return;}
  addEventListener('resize',function(){try{H.trigger(inst,'resize');}catch(x){}});
  send('ready',{protocols:[1]});
 }catch(x){send('error',{code:'h5p-init',message:String(x&&x.message||x).slice(0,300)});}}
document.addEventListener('DOMContentLoaded',function(){go();measure();try{new ResizeObserver(measure).observe(document.documentElement);}catch(x){setInterval(measure,500);}});
var lastH=0;function measure(){var h=Math.ceil(Math.max(document.documentElement.scrollHeight,document.body?document.body.scrollHeight:0));if(Math.abs(h-lastH)>2){lastH=h;send('resize',{h:h});}}
document.addEventListener('securitypolicyviolation',function(e){if(++csp<=5)send('event',{name:'h5p:csp',data:{d:String(e.effectiveDirective||e.violatedDirective||'').slice(0,40),u:String(e.blockedURI||'').slice(0,80)}});});
addEventListener('error',function(e){try{send('error',{code:'script',message:String(e.message||'').slice(0,300)});}catch(x){}});
APP.postMessage({t:'hello',nonce:N},'*');
})();`;
}
/* i18n-ignore-end */
