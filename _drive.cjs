// Adversarial gameplay driver for towers. Throwaway.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));

(async () => {
  const puppeteer = require('puppeteer-core');
  const browser = await puppeteer.launch({
    executablePath: CHROME, headless: 'new',
    args: ['--no-sandbox','--disable-gpu','--mute-audio','--window-size=1280,800'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message||e)));
  page.on('console', m => { if (m.type()==='error') errs.push('console:'+m.text()); });

  const abs = path.resolve('games/towers/index.html');
  await page.goto(pathToFileURL(abs).href, { waitUntil: 'domcontentloaded' });
  await new Promise(r=>setTimeout(r,800));

  // Set a known best so we can confirm score writes only on improvement.
  await page.evaluate(()=>localStorage.setItem('arcade:towers','0'));

  // Start the game from the menu via keyboard.
  await page.keyboard.press('Enter');
  await new Promise(r=>setTimeout(r,400));
  const menuHidden = await page.evaluate(()=>document.getElementById('menu').classList.contains('hidden'));

  // Build a couple of towers to actually kill some enemies (verify scoring path).
  // Select gun, click a grid of buildable tiles around the top-left lane.
  await page.keyboard.press('1');
  await new Promise(r=>setTimeout(r,100));
  const spots = [[150,315],[235,315],[150,255],[235,255],[350,255],[460,255]];
  for (const [x,y] of spots){ await page.mouse.click(x,y); await new Promise(r=>setTimeout(r,60)); }

  // Start wave 1.
  await page.keyboard.press(' ');
  await new Promise(r=>setTimeout(r,200));

  const actionShot = await page.screenshot({ type:'png' });

  // Now intentionally let the game run to completion (win or lose).
  // Spam Space to advance waves; do NOT keep up defensively so it ends in finite time,
  // but we placed a few towers so SOME kills happen first.
  let over=false, title='', stats='';
  for (let i=0;i<120;i++){
    await new Promise(r=>setTimeout(r,500));
    await page.keyboard.press(' ');
    over = await page.evaluate(()=>!document.getElementById('over').classList.contains('hidden'));
    if (over) break;
  }
  if (over){
    title = await page.evaluate(()=>document.getElementById('overTitle').textContent);
    stats = await page.evaluate(()=>document.getElementById('overStats').textContent);
  }
  const best = await page.evaluate(()=>localStorage.getItem('arcade:towers'));

  // Restart from game over via Enter.
  let restartWorks=false;
  if (over){
    await page.keyboard.press('Enter');
    await new Promise(r=>setTimeout(r,400));
    restartWorks = await page.evaluate(()=>document.getElementById('over').classList.contains('hidden') && document.getElementById('menu').classList.contains('hidden'));
  }

  // Pause test from a fresh run.
  await page.evaluate(()=>localStorage.setItem('arcade:towers','0'));
  // (already in a fresh game after restart) toggle pause
  await page.keyboard.press('p');
  await new Promise(r=>setTimeout(r,200));
  const paused = await page.evaluate(()=>!document.getElementById('pause').classList.contains('hidden'));
  await page.keyboard.press('p');
  await new Promise(r=>setTimeout(r,200));
  const resumed = await page.evaluate(()=>document.getElementById('pause').classList.contains('hidden'));

  fs.writeFileSync('_action.png', actionShot);
  console.log(JSON.stringify({ menuHidden, over, title, stats, best, restartWorks, paused, resumed, errs }, null, 2));
  await browser.close();
})().catch(e=>{ console.error('DRIVER ERR', e); process.exit(1); });
