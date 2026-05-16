// Instrument a sniper match and dump state every 3 seconds.
const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new', args: ['--no-sandbox'], protocolTimeout: 300000,
  });
  const page = await browser.newPage();
  await page.goto('http://127.0.0.1:8766/index.html', { waitUntil: 'networkidle0', timeout: 15000 });
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate(() => {
    window.Tournament._maxRunSeconds = 25;
    window._snapshots = [];
    // Patch the harness's per-tick decide so we can record what the bot is
    // doing without touching the bot file.
    const orig = window.Tournament._origTick;   // not exposed; we'll hook differently
  });

  // Start match
  const matchPromise = page.evaluate(async () => {
    return await window.Tournament.runMatch('sniper', 0);
  });

  // Poll game state every 3 seconds for 25 seconds.
  for (let i = 0; i < 9; i++) {
    await new Promise(r => setTimeout(r, 3000));
    const snap = await page.evaluate(() => {
      const p = Game ? Game.player : null;
      if (!p) return null;
      // Reach into the harness to see the last action the bot returned.
      const bot = window.Arena.bots.sniper;
      return {
        t: Game.elapsed.toFixed(1),
        score: Game.score | 0,
        kills: Game.kills,
        zombiesAlive: Game.zombies.length,
        playerHp: Math.round(p.hp),
        playerWeapon: p.weapon,
        mag: p.ammo[p.weapon].mag,
        mouseDown: input.mouseDown,
        mouseX: Math.round(input.mouseX),
        mouseY: Math.round(input.mouseY),
        keys: Array.from(input.keys),
        nearestZombieDist: Game.zombies.length
          ? Math.min(...Game.zombies.map(z => Math.hypot(z.x-p.x,z.y-p.y))) | 0
          : null,
        nearestZombieType: Game.zombies[0] && Game.zombies[0].type,
      };
    });
    console.log(`t=${snap.t}s score=${snap.score} kills=${snap.kills} hp=${snap.playerHp} weapon=${snap.playerWeapon} mag=${snap.mag} fire=${snap.mouseDown} aim=(${snap.mouseX},${snap.mouseY}) keys=[${snap.keys.join(',')}] nearestDist=${snap.nearestZombieDist} totalZombies=${snap.zombiesAlive}`);
  }

  const result = await matchPromise;
  console.log('\nFINAL:', JSON.stringify(result));
  await browser.close();
})();
