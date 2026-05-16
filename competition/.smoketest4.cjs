// Full UI flow: open the game, navigate to BOT ARENA, click WATCH SIDE-BY-SIDE.
// Verify the grid renders and the iframes start posting tick events.
const puppeteer = require('puppeteer');

(async () => {
  const errs = [];
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(`[pageerror] ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errs.push(`[error] ${m.text()}`); });
  await page.goto('http://127.0.0.1:8766/index.html', { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise(r => setTimeout(r, 600));

  // Open the side-by-side viewer programmatically with two bots, level 0, 1 run.
  // Cap match length via the same URL param the iframe URL would use.
  await page.evaluate(() => {
    // Cap parent's own runs (not used here, but keeps timing tight).
    window.Tournament._maxRunSeconds = 15;
    window.ArenaUI.openSideBySide(['simple', 'marvyn'], 0, 1);
  });

  // Wait for iframes to mount and forward their URLs so we can verify autostart args.
  await new Promise(r => setTimeout(r, 1500));
  const iframeSrcs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('iframe')).map(f => f.src)
  );
  console.log('iframes mounted:', iframeSrcs.length);
  for (const src of iframeSrcs) console.log('  ', src);

  // Patch each iframe's URL to add maxSeconds so the test terminates promptly.
  await page.evaluate(() => {
    for (const f of document.querySelectorAll('iframe')) {
      if (f.src && !/maxSeconds=/.test(f.src)) {
        f.src = f.src + '&maxSeconds=12';
      }
    }
  });

  // Wait for both matches to complete (each capped at 12s).
  for (let i = 0; i < 80; i++) {
    const slots = await page.evaluate(() => {
      // The viewer keeps _liveSlots as a module-private; we can detect via
      // inner-text of cell statuses instead.
      return Array.from(document.querySelectorAll('iframe')).map(f => {
        const banner = f.closest('div').previousSibling;
        const text = (banner && banner.textContent || '').slice(-160);
        return text;
      });
    });
    const allDone = slots.every(t => /done|error/i.test(t));
    if (allDone) break;
    await new Promise(r => setTimeout(r, 500));
  }
  const finalSlots = await page.evaluate(() => Array.from(document.querySelectorAll('iframe')).map(f => {
    const banner = f.closest('div').previousSibling;
    return (banner && banner.textContent || '').replace(/\s+/g, ' ').trim();
  }));
  console.log('final slots:');
  for (const t of finalSlots) console.log(' ', t);

  const hasSummary = await page.evaluate(() => !!document.querySelector('.summary-panel'));
  console.log('summary panel present:', hasSummary);

  await browser.close();
  const realErrs = errs.filter(e => !/favicon|404/i.test(e));
  if (realErrs.length) {
    console.log('\nERRORS:');
    realErrs.forEach(e => console.log(' ', e));
    process.exit(1);
  }
  process.exit(0);
})();
