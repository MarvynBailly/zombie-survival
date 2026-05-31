#!/usr/bin/env node
/*
 * smoke.cjs — headless-Chrome smoke test for a self-contained HTML game.
 *
 * Loads a file:// HTML in the system Chrome (via puppeteer-core, no Chromium
 * download), captures console errors + uncaught page exceptions, optionally
 * drives synthetic input, screenshots a cover, and reports whether the frame
 * changed after input (a generic "is it alive?" signal). Prints a single JSON
 * line to stdout. Exit code 0 unless the harness itself blew up.
 *
 * Usage:
 *   node scripts/smoke.cjs --file games/towers/index.html \
 *        --out games/towers/cover.png \
 *        --wait 2500 --click center --keys "Enter,Space,a,d,w" \
 *        --hold 1200 --diff
 *
 * Flags:
 *   --file  <path>   HTML file to load (required)
 *   --out   <path>   screenshot destination PNG (optional)
 *   --wait  <ms>     settle time after load before first shot (default 2000)
 *   --click <spec>   "center" | "x,y" — mouse click before driving keys (optional)
 *   --keys  <list>   comma-separated keys to press/hold (e.g. "Enter,Space,a,d")
 *   --hold  <ms>     how long to hold the key sequence / wait between shots (default 1000)
 *   --diff           take a before+after screenshot and report whether the frame changed
 *   --w/--h <px>     viewport size (default 1280x800)
 *   --chrome <path>  Chrome/Edge executable (default: auto-detect Windows install)
 */
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) return true; // boolean flag
  return v;
}

const CHROME_CANDIDATES = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
];

function findChrome(explicit) {
  if (explicit && typeof explicit === 'string') return explicit;
  for (const c of CHROME_CANDIDATES) if (fs.existsSync(c)) return c;
  return null;
}

function bytesDiffRatio(a, b) {
  if (!a || !b) return 1;
  if (a.length !== b.length) return 1; // different size => definitely changed
  let diff = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) diff++;
  return diff / a.length;
}

(async () => {
  const out = { file: null, ok: false, consoleErrors: [], pageErrors: [],
                screenshot: false, changed: null, changedRatio: null, error: null };
  let browser;
  try {
    const file = arg('file');
    if (!file || file === true) throw new Error('--file is required');
    out.file = file;
    const abs = path.resolve(file);
    if (!fs.existsSync(abs)) throw new Error('file not found: ' + abs);

    const chrome = findChrome(arg('chrome'));
    if (!chrome) throw new Error('no Chrome/Edge binary found');

    const W = parseInt(arg('w', '1280'), 10);
    const H = parseInt(arg('h', '800'), 10);
    const wait = parseInt(arg('wait', '2000'), 10);
    const hold = parseInt(arg('hold', '1000'), 10);
    const outPng = arg('out');
    const clickSpec = arg('click');
    const keysSpec = arg('keys');
    const wantDiff = arg('diff') === true;

    const puppeteer = require('puppeteer-core');
    browser = await puppeteer.launch({
      executablePath: chrome,
      headless: 'new',
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage',
             '--mute-audio', `--window-size=${W},${H}`],
    });
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H });

    page.on('console', (msg) => {
      if (msg.type() === 'error') out.consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => out.pageErrors.push(String(err && err.message || err)));
    page.on('requestfailed', (req) => {
      // ignore favicon noise; record real failed loads
      const u = req.url();
      if (!/favicon/.test(u)) out.consoleErrors.push('requestfailed: ' + u);
    });

    const url = pathToFileURL(abs).href;
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 }).catch(async () => {
      // networkidle can hang on rAF loops; fall back to domcontentloaded
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    });

    await new Promise((r) => setTimeout(r, wait));

    let before = null;
    if (wantDiff) before = await page.screenshot({ type: 'png' });

    // drive synthetic input
    if (clickSpec && clickSpec !== true) {
      let cx, cy;
      if (clickSpec === 'center') { cx = W / 2; cy = H / 2; }
      else { const p = String(clickSpec).split(','); cx = +p[0]; cy = +p[1]; }
      await page.mouse.click(cx, cy).catch(() => {});
      await new Promise((r) => setTimeout(r, 200));
    }
    if (keysSpec && keysSpec !== true) {
      const keys = String(keysSpec).split(',').map((k) => k.trim()).filter(Boolean);
      // press each once (menu nav), then hold movement-ish keys for `hold` ms
      for (const k of keys) { await page.keyboard.press(k).catch(() => {}); await new Promise((r)=>setTimeout(r,120)); }
      for (const k of keys) { await page.keyboard.down(k).catch(() => {}); }
      await new Promise((r) => setTimeout(r, hold));
      for (const k of keys) { await page.keyboard.up(k).catch(() => {}); }
    } else {
      await new Promise((r) => setTimeout(r, hold));
    }

    const after = await page.screenshot({ type: 'png', path: (outPng && outPng !== true) ? path.resolve(outPng) : undefined });
    out.screenshot = !!(outPng && outPng !== true);

    if (wantDiff && before) {
      const ratio = bytesDiffRatio(before, after);
      out.changedRatio = ratio;
      out.changed = ratio > 0.01; // >1% of bytes differ => something animated/responded
    }

    out.ok = out.consoleErrors.length === 0 && out.pageErrors.length === 0;
  } catch (e) {
    out.error = String(e && e.stack || e);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }
  process.stdout.write(JSON.stringify(out) + '\n');
  process.exit(0);
})();
