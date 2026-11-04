const http=require('http'),fs=require('fs'),path=require('path');const hits=[];
const s=http.createServer((q,r)=>{ if(q.url.startsWith('/beacon')){hits.push(q.url);r.end('x');return;}
 if(q.url==='/hits'){r.setHeader('content-type','application/json');r.end(JSON.stringify(hits));return;}
 if(q.url==='/reset'){hits.length=0;r.end('ok');return;}
 const W=path.resolve(__dirname,'www'); let u; try{u=decodeURIComponent(q.url.split('?')[0]);}catch(e){r.statusCode=400;r.end();return;}
 const f=path.resolve(W,'.'+path.posix.normalize('/'+u)); if(!f.startsWith(W+path.sep)){r.statusCode=403;r.end();return;}   // never outside www/
 if(!fs.existsSync(f)||fs.statSync(f).isDirectory()){r.statusCode=404;r.end();return;}
 const h=JSON.parse(process.env.HDRS||'{}'); for(const k in h) r.setHeader(k,h[k]);
 r.setHeader('content-type', f.endsWith('.html')?'text/html':f.endsWith('.js')||f.endsWith('.mjs')?'text/javascript':f.endsWith('.wasm')?'application/wasm':f.endsWith('.json')?'application/json':'application/octet-stream');
 fs.createReadStream(f).pipe(r);});
s.on('upgrade',(q,sock)=>{hits.push('WS '+q.url);sock.destroy();});
s.listen(+process.env.PORT||8811,'127.0.0.1');   // this machine only
