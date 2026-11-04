const pw = require('playwright'); const wait = ms => new Promise(r => setTimeout(r, ms));
const [name, port] = process.argv.slice(2);
(async()=>{ const b=await pw[name].launch(name==='chromium'?{channel:'chromium'}:{}); const p=await b.newPage();
 await fetch(`http://127.0.0.1:${port}/reset`);
 const t0=Date.now(); await p.goto(`http://127.0.0.1:${port}/pyhost.html`);
 let R; for(let i=0;i<120&&!R;i++){ await wait(500); R=await p.evaluate(()=>window.RESULT); }
 const hits=await (await fetch(`http://127.0.0.1:${port}/hits`)).json();
 console.log(name, port==='8811'?'NO CORS headers':'ACAO:* + CORP', 'wall', Date.now()-t0,'ms', JSON.stringify(R), 'beacons', JSON.stringify(hits));
 await b.close(); })();
