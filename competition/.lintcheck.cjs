// Load the game and run Arena.lintBot on every registered bot.
const puppeteer = require('puppeteer');

(async () => {
  const errs = [];
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(`[pageerror] ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errs.push(`[error] ${m.text()}`); });
  await page.goto('http://127.0.0.1:8766/index.html', { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise(r => setTimeout(r, 500));

  const report = await page.evaluate(() => {
    const bots = Object.keys(window.Arena.bots);
    return bots.map(name => ({
      name,
      version: window.Arena.bots[name].version,
      author: window.Arena.bots[name].author,
      lint: window.Arena.lintBot(window.Arena.bots[name]),
    }));
  });

  console.log('REGISTERED BOTS:');
  for (const r of report) {
    const okSym = r.lint.ok ? 'OK ' : 'WARN';
    console.log(`  ${okSym} ${r.name.padEnd(14)} v${r.version}  ${r.lint.ok ? '' : 'hits=' + r.lint.hits.join(',')}`);
  }
  await browser.close();
  const realErrs = errs.filter(e => !/favicon|404/i.test(e));
  if (realErrs.length) {
    console.log('\nERRORS:');
    for (const e of realErrs) console.log(' ', e);
    process.exit(1);
  }
})();
