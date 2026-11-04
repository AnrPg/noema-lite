const pw = require('playwright'); const wait = ms => new Promise(r => setTimeout(r, ms));
const U='http://127.0.0.1:8811'; const name=process.argv[2];
const T = (pr, ms, label) => Promise.race([pr, wait(ms).then(()=>label)]);
(async () => {
  const b = await pw[name].launch(); const p = await b.newPage();
  await p.goto(U+'/host.html?mode=hog'); await wait(1000);
  const a = await T(p.evaluate(()=>[TICKS, window.HOGGING]), 3000, 'NO ANSWER');
  await wait(1500);
  const c = await T(p.evaluate(()=>TICKS), 3000, 'NO ANSWER');
  console.log(name, 'host [ticks, hogStartedAt]', JSON.stringify(a), '-> 1.5s later', c, '=>', typeof c==='number'&&c>a[0]+10 ? 'HOST STAYS RESPONSIVE' : 'HOST FROZEN');
  setTimeout(()=>process.exit(0), 2000); b.close().catch(()=>{});
})();
