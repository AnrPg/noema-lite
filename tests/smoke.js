const { chromium } = require(process.env.PW || 'playwright');
const path = require('path');
(async () => {
  const ROOT = path.resolve(__dirname, '..');
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_FILE_NOT_FOUND|net::/.test(m.text())) errors.push(m.text()); });
  await page.goto('file://' + ROOT + '/index.html'); await page.waitForTimeout(1200);
  await page.screenshot({ path: '/tmp/lq_shot1.png' });
  console.log('chips:', await page.$$eval('.lq-chip', c => c.map(x => x.textContent)));
  await page.click('.lq-chip'); await page.waitForTimeout(1500);
  console.log('title:', await page.title(), '| sections:', await page.evaluate(() => Object.keys(SEC).length));
  await page.screenshot({ path: '/tmp/lq_shot2.png' });
  console.log('errors:', errors);
  await b.close();
})();
