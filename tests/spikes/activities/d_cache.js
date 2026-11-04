const pw = require('playwright'); const wait = ms => new Promise(r => setTimeout(r, ms));
(async()=>{ const b=await pw.chromium.launch({channel:'chromium'}); const ctx=await b.newContext(); const p=await ctx.newPage();
 const run = async label => { await p.goto('http://127.0.0.1:8813/pyhost.html'); let R; for(let i=0;i<60&&!R;i++){ await wait(500); R=await p.evaluate(()=>window.RESULT).catch(()=>null);} console.log(label, R ? (R.ok?'ok init '+R.init_ms+' ms, numpy '+R.numpy_ms+' ms':'FAIL '+R.err) : 'no result in 30 s'); };
 await run('first run (network)       :');
 const cdp = await ctx.newCDPSession(p);
 // page itself must load: keep network for the html but block /pyodide/
 await cdp.send('Network.enable'); await cdp.send('Network.setBlockedURLs', { urls: ['*/pyodide/*'] });
 await run('second run, assets blocked:');
 await b.close(); })();
