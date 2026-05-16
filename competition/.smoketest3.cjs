// Side-by-side smoke test: load index.html?autostart=1&bot=simple in a child
// page and confirm we get arena:tick and arena:match-complete events posted
// back. Cap the match short so it terminates quickly.
const puppeteer = require('puppeteer');

(async () => {
  const errs = [];
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  page.on('pageerror', e => errs.push(`[pageerror] ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') errs.push(`[error] ${m.text()}`); });

  // Parent page: a tiny shim that loads the game in an iframe and listens.
  await page.setContent(`
    <html><body>
      <iframe id="f" src="http://127.0.0.1:8766/index.html?autostart=1&bot=simple&level=0&matchId=test1&maxSeconds=15" width="640" height="480"></iframe>
      <script>
        window._events = [];
        window.addEventListener('message', (ev) => {
          if (ev.data && (ev.data.type || '').startsWith('arena:')) {
            window._events.push({
              type: ev.data.type,
              matchId: ev.data.matchId,
              score: ev.data.score,
              hp: ev.data.hp,
              result: ev.data.result,
              error: ev.data.error,
            });
          }
        });
      </script>
    </body></html>
  `, { waitUntil: 'load' });

  // Wait up to 40 seconds for the match to finish (cap is 15s via URL param).
  for (let i = 0; i < 80; i++) {
    const done = await page.evaluate(() => window._events.some(e => e.type === 'arena:match-complete' || e.type === 'arena:match-error'));
    if (done) break;
    await new Promise(r => setTimeout(r, 500));
  }

  const events = await page.evaluate(() => window._events);
  console.log('ticks received:', events.filter(e => e.type === 'arena:tick').length);
  console.log('complete events:', events.filter(e => e.type === 'arena:match-complete').length);
  console.log('error events:', events.filter(e => e.type === 'arena:match-error').length);
  const last = events.filter(e => e.type === 'arena:match-complete')[0];
  if (last) console.log('final result:', JSON.stringify(last.result));
  const firstTick = events.find(e => e.type === 'arena:tick');
  if (firstTick) console.log('first tick:', JSON.stringify({ score: firstTick.score, hp: firstTick.hp, matchId: firstTick.matchId }));

  await browser.close();
  const realErrs = errs.filter(e => !/favicon|404/i.test(e));
  if (realErrs.length) {
    console.log('\nERRORS:');
    realErrs.forEach(e => console.log(' ', e));
    process.exit(1);
  }
  if (!last) {
    console.log('\nFAIL: no match-complete event received');
    process.exit(2);
  }
  console.log('\nSide-by-side bootstrap works.');
})();
