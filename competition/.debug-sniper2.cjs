const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', args: ['--no-sandbox'], protocolTimeout: 300000,
  });
  const page = await browser.newPage();
  // Surface every console.log + error.
  page.on('console', m => {
    if (['log', 'warn', 'error'].includes(m.type())) {
      const t = m.text();
      if (!/favicon|cors|404/i.test(t)) console.log('[page]', t);
    }
  });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto('http://127.0.0.1:8766/index.html', { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise(r => setTimeout(r, 500));

  // Wrap sniper.decide so we can capture an exception or unexpected return.
  await page.evaluate(() => {
    window.Tournament._maxRunSeconds = 20;
    const sniper = Arena.bots.sniper;
    const orig = sniper.decide.bind(sniper);
    let lastLog = 0;
    sniper.decide = function (perception, api) {
      try {
        const action = orig(perception, api);
        // Log once a second so we see what was decided.
        if (perception.tick - lastLog >= 60) {
          lastLog = perception.tick;
          const z0 = perception.zombies[0];
          console.log('[sniper]',
            `t=${perception.elapsed.toFixed(1)}`,
            `z0=${z0 ? `${z0.type}@${z0.dist|0}` : 'none'}`,
            `weapon=${perception.self.weapon}`,
            `mag=${perception.self.ammo.mag}`,
            `action.fire=${!!action.fire}`,
            `action.aim=${action.aim ? `(${action.aim.x|0},${action.aim.y|0})` : 'null'}`,
            `action.move=${action.move ? `(${action.move.x.toFixed(2)},${action.move.y.toFixed(2)})` : 'null'}`,
            `action.switchWeapon=${action.switchWeapon || 'none'}`,
            `action.reload=${!!action.reload}`,
          );
        }
        return action;
      } catch (e) {
        console.error('[sniper THREW]', e && e.stack || String(e));
        throw e;
      }
    };
  });

  const result = await page.evaluate(async () => await window.Tournament.runMatch('sniper', 0));
  console.log('\nFINAL:', JSON.stringify(result));
  await browser.close();
})();
