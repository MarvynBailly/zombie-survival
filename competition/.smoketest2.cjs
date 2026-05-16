// Drive a real match end-to-end in a headless browser. Asserts the match
// terminates, a result row appears in Tournament.results, no console errors.
const puppeteer = require('puppeteer');

(async () => {
  const errs = [];
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('console', m => {
    const type = m.type();
    if (type === 'error') errs.push(`[error] ${m.text()}`);
  });
  page.on('pageerror', e => errs.push(`[pageerror] ${e.message}`));
  await page.goto('http://127.0.0.1:8766/index.html', { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise(r => setTimeout(r, 500));

  // Cap the run hard from inside the page so we don't sit through 12 minutes.
  await page.evaluate(() => { window.Tournament._maxRunSeconds = 25; });

  // Kick off a match on level 0 with the simple bot.
  const result = await page.evaluate(async () => {
    return await window.Tournament.runMatch('simple', 0);
  });
  console.log('match result:', JSON.stringify(result));

  // Now run a mini-tournament with two bots, 1 run each.
  const tourney = await page.evaluate(async () => {
    return await window.Tournament.runTournament(['simple', 'marvyn'], 0, 1);
  });
  console.log('tournament ranked:', JSON.stringify(tourney.ranked, null, 2));

  const summary = await page.evaluate(() => ({
    results: window.Tournament.results.length,
    samples: window.Tournament.results.slice(-3).map(r => ({
      bot: r.bot, score: r.score, days: r.days, kills: r.kills, reason: r.reason, elapsed: r.elapsed,
    })),
  }));
  console.log('final:', JSON.stringify(summary, null, 2));

  await browser.close();

  // Filter favicon and other noise from errs.
  const realErrs = errs.filter(e => !/favicon|404/i.test(e));
  if (realErrs.length) {
    console.log('\nCONSOLE ERRORS:');
    for (const e of realErrs) console.log(' ', e);
    process.exit(1);
  } else {
    console.log('\nNo meaningful console errors.');
    process.exit(0);
  }
})();
