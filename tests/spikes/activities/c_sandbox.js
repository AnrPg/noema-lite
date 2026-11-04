const pw = require('playwright'); const wait = ms => new Promise(r => setTimeout(r, ms));
const U='http://127.0.0.1:8811';
(async () => {
  for (const name of process.argv.slice(2)) {
    const b = await pw[name].launch(); const ctx = await b.newContext(); const p = await ctx.newPage();
    let popups=0; ctx.on('page',()=>popups++);
    await fetch(U+'/reset');
    await p.goto(U+'/host.html?mode=probe'); 
    let R=null; for(let i=0;i<40&&!R;i++){ await wait(250); R=await p.evaluate(()=>RESULTS).catch(()=>null); }
    await wait(1200);
    const hits = await (await fetch(U+'/hits')).json();
    console.log(`\n=== ${name} ${b.version()}  host url still ${p.url().endsWith('host.html?mode=probe')?'host':'NAVIGATED '+p.url()}  popups=${popups}`);
    if(!R) console.log('  NO RESULTS'); else for (const k in R) console.log('  ', k.padEnd(28), R[k]);
    console.log('   server beacon hits:', JSON.stringify(hits));
    // forge
    const p2 = await ctx.newPage(); await p2.goto(U+'/host.html?mode=forge'); await wait(1200);
    console.log('   forge: results=', JSON.stringify(await p2.evaluate(()=>RESULTS)), 'stray window msgs ignored=', JSON.stringify(await p2.evaluate(()=>STRAY)));
    await b.close();
  }
})();
