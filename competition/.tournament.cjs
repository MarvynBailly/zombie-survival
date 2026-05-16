// Run a tournament across every registered bot. Caps each match at 30s so
// the whole thing finishes in a reasonable wall-clock window. Reports the
// ranked leaderboard + identifies any bots that errored mid-match.
const puppeteer = require('puppeteer');

const CAP_SECONDS = 60;
const RUNS_PER_BOT = 3;
const LEVEL = 0;

(async () => {
  const allErrs = [];
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox'],
    protocolTimeout: 600000,           // 10 min — survives long match runs
  });
  const page = await browser.newPage();
  page.on('pageerror', e => allErrs.push(`[pageerror] ${e.message}`));
  page.on('console', m => { if (m.type() === 'error') allErrs.push(`[error] ${m.text()}`); });
  await page.goto('http://127.0.0.1:8766/index.html', { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate((cap) => { window.Tournament._maxRunSeconds = cap; }, CAP_SECONDS);

  const bots = await page.evaluate(() => Object.keys(window.Arena.bots));
  console.log(`bots: ${bots.join(', ')}`);
  console.log(`config: ${RUNS_PER_BOT} runs × ${CAP_SECONDS}s cap × ${bots.length} bots\n`);

  // Drive matches one at a time from Node so we get progress and don't bump
  // puppeteer's per-call timeout.
  const allResults = [];
  for (let r = 0; r < RUNS_PER_BOT; r++) {
    for (const b of bots) {
      process.stdout.write(`run ${r}, ${b.padEnd(14)} ... `);
      const t0 = Date.now();
      const result = await page.evaluate(async (bn, lvl) => {
        return await window.Tournament.runMatch(bn, lvl);
      }, b, LEVEL);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(`score=${String(result.score).padStart(6)}  days=${result.days}  kills=${String(result.kills).padStart(3)}  life=${result.elapsed}s  end=${result.reason}  (${elapsed}s)`);
      allResults.push(result);
    }
  }

  const ranked = await page.evaluate((rows) => window.Tournament.summarize(rows), allResults);

  console.log('\nRANKED LEADERBOARD:');
  console.log('rank  bot              runs  meanScore  ±σ     bestScore  meanDays  meanKills  meanLife');
  ranked.forEach((r, i) => {
    console.log(
      `${String(i+1).padStart(3)}.  ${r.bot.padEnd(14)} ` +
      `${String(r.runs).padStart(4)}  ${String(r.meanScore).padStart(8)}  ` +
      `${String('±'+r.stdScore).padStart(5)}  ${String(r.bestScore).padStart(7)}  ` +
      `${r.meanDays.toFixed(2).padStart(7)}  ${String(r.meanKills).padStart(8)}  ${String(r.meanLife).padStart(7)}s`
    );
  });

  await browser.close();
  const realErrs = allErrs.filter(e => !/favicon|404/i.test(e));
  if (realErrs.length) {
    console.log('\nCONSOLE ERRORS DURING TOURNAMENT (first 20):');
    for (const e of realErrs.slice(0, 20)) console.log(' ', e);
  }
  process.exit(0);
})();
