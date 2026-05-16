// Headless smoke test — load the game and confirm:
//   1. no console errors during script-load
//   2. window.Arena, window.Tournament, and the 3 bots are registered
//   3. Arena.buildPerception runs without throwing (needs a live game; skip)
// Run: node competition/.smoketest.cjs
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
  await page.goto('http://127.0.0.1:8766/index.html', { waitUntil: 'networkidle0', timeout: 10000 });

  // Wait a beat for late-loaded scripts.
  await new Promise(r => setTimeout(r, 500));

  const report = await page.evaluate(() => {
    const safe = (fn, fb) => { try { return fn(); } catch (e) { return { ERROR: String(e) }; } };
    return {
      hasArena:       typeof window.Arena === 'object',
      hasTournament:  typeof window.Tournament === 'object',
      bots:           safe(() => Object.keys(window.Arena ? window.Arena.bots : {}), []),
      forbidden:      safe(() => window.Arena ? window.Arena.FORBIDDEN_GLOBALS.length : 0, 0),
      gameMode:       safe(() => window.Game ? window.Game.mode : null, null),
      lints:          safe(() => Object.keys(window.Arena.bots).map(k => ({
                        bot: k, lint: window.Arena.lintBot(window.Arena.bots[k]),
                      })), []),
    };
  });

  console.log(JSON.stringify(report, null, 2));
  if (errs.length) {
    console.log('\nCONSOLE ERRORS:');
    for (const e of errs) console.log(' ', e);
  } else {
    console.log('\nNo console errors.');
  }
  await browser.close();
  process.exit(errs.length ? 1 : 0);
})();
