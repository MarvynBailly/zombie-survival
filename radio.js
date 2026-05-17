'use strict';

// ---------- Radio Room (B·04) ----------
// Powered desk + antenna. Three once-per-day actions leaning on trader.js:
//   1) SUMMON TRADER    — summonTrader() (1/day across all radios)
//   2) BROADCAST        — Game.survivorRecruitBoost = 2× until tomorrow
//   3) BLOOD MOON SCAN  — bloodMoonForecast() as toast/banner
// State on Game.radios; Game.radioOverlay = currently open radio.
// See .homestead-integration/radio.md for wiring.

const RADIO_HP_MAX = 50;
const RADIO_INTERACT_RADIUS = 50;
const RADIO_DESK_W = 32, RADIO_DESK_H = 24;
const RADIO_ANTENNA_W = 4, RADIO_ANTENNA_H = 40;
const RADIO_BLINK_HZ = 0.8;
const RADIO_FORECAST_WINDOW_HOURS = 18;
const RADIO_TOAST_DURATION = 3.0;

let __radioIdSeq = 1, __radioBlinkT = 0, __radioToast = '', __radioToastT = 0;

function _sfx(name) {
  if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx[name]) Audio.sfx[name]();
}

function initRadios() {
  Game.radios = [];
  Game.radioOverlay = null;
  __radioIdSeq = 1; __radioBlinkT = 0;
  __radioToast = ''; __radioToastT = 0;
}

// Place a radio in front of the player (consumed by ITEMS.radio_kit.use).
function placeRadio(x, y, player) {
  if (!Game.radios) Game.radios = [];
  if (typeof inObstacle === 'function' && inObstacle(x, y, 14)) {
    if (typeof setNotice === 'function') setNotice('Cannot place radio here', 1.5);
    return null;
  }
  const r = {
    id: __radioIdSeq++, x, y,
    hp: RADIO_HP_MAX, maxHp: RADIO_HP_MAX,
    lastTraderSummonDay: -1, lastBroadcastDay: -1, bloodMoonForecastShownDay: -1,
  };
  Game.radios.push(r);
  if (typeof setNotice === 'function') {
    const powered = (typeof isPowered === 'function') && isPowered(x, y);
    setNotice(powered ? 'Radio room placed — press E' : 'Radio placed — needs power', 2);
  }
  _sfx('pickup');
  return r;
}

function updateRadios(dt) {
  __radioBlinkT = (__radioBlinkT + dt) % RADIO_BLINK_HZ;
  if (__radioToastT > 0) __radioToastT = Math.max(0, __radioToastT - dt);
}

function findRadioNear(player, radius) {
  const rs = Game.radios;
  if (!rs || rs.length === 0 || !player) return null;
  const R = radius || RADIO_INTERACT_RADIUS;
  let best = null, bestD = R * R;
  for (const r of rs) {
    const dx = r.x - player.x, dy = r.y - player.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = r; }
  }
  return best;
}

function openRadioOverlay(radio) {
  if (!radio) return;
  if (typeof isPowered !== 'function' || !isPowered(radio.x, radio.y)) {
    if (typeof setNotice === 'function') setNotice('No signal — radio unpowered', 1.8);
    _sfx('empty');
    return;
  }
  Game.radioOverlay = radio;
  _sfx('click');
}

function closeRadioOverlay() {
  if (!Game.radioOverlay) return;
  Game.radioOverlay = null;
  if (Game.player) Game.player.openCd = 0.4;
  _sfx('click');
}

function radioMessage(text) {
  __radioToast = text;
  __radioToastT = RADIO_TOAST_DURATION;
}

// ---------- Actions ----------
// All gate on power + per-day cooldown. Only blood-moon RED SKY escalates
// to setBanner; everything else is module-local toast feedback.
function _radioGate(radio) {
  if (!radio) return null;
  if (typeof isPowered !== 'function' || !isPowered(radio.x, radio.y)) {
    radioMessage('NO POWER'); return null;
  }
  return (Game.time && Game.time.day) || 1;
}

function radioActionSummonTrader(radio) {
  const today = _radioGate(radio); if (today == null) return false;
  if ((Game.radios || []).some(r => r.lastTraderSummonDay === today)) {
    radioMessage('TRADER ALREADY HAILED TODAY'); return false;
  }
  if (Game.trader && Game.trader.active) { radioMessage('TRADER ALREADY EN ROUTE'); return false; }
  if (typeof summonTrader !== 'function') { radioMessage('SIGNAL LOST'); return false; }
  if (!summonTrader()) { radioMessage('NO RESPONSE'); return false; }
  radio.lastTraderSummonDay = today;
  radioMessage('TRADER INBOUND'); _sfx('wave');
  return true;
}

function radioActionBroadcast(radio) {
  const today = _radioGate(radio); if (today == null) return false;
  if (radio.lastBroadcastDay === today) { radioMessage('AIRWAVES STILL HOT'); return false; }
  radio.lastBroadcastDay = today;
  // squad.js reads Game.survivorRecruitBoost when active — see radio.md §9.
  Game.survivorRecruitBoost = { activeUntilDay: today + 1, mult: 2.0 };
  radioMessage('SOS BROADCAST · SURVIVORS LISTENING');
  if (typeof setNotice === 'function') setNotice('Survivor recruit chance 2× until tomorrow', 2.5);
  _sfx('click');
  return true;
}

function radioActionBloodMoonScan(radio) {
  const today = _radioGate(radio); if (today == null) return false;
  if (radio.bloodMoonForecastShownDay === today) { radioMessage('NO NEW READINGS'); return false; }
  if (typeof bloodMoonForecast !== 'function') { radioMessage('STATIC ONLY'); return false; }
  const f = bloodMoonForecast();
  radio.bloodMoonForecastShownDay = today;
  let msg;
  if (typeof isBloodMoonTonight === 'function' && isBloodMoonTonight()) msg = 'RED SKY TONIGHT';
  else if (f && f.hours >= 0 && f.hours <= RADIO_FORECAST_WINDOW_HOURS) msg = `RED SKY IN ${f.hours} HOURS`;
  else if (f && f.days > 0) msg = `NEXT BLOOD MOON IN ${f.days} DAY${f.days === 1 ? '' : 'S'}`;
  else msg = 'SKIES CLEAR';
  radioMessage(msg);
  if (typeof setBanner === 'function' && /RED SKY/.test(msg)) setBanner(msg, 2.5);
  _sfx('click');
  return true;
}

// ---------- Damage ----------
function damageRadio(r, dmg) {
  if (!r || r.hp <= 0) return;
  r.hp -= dmg;
  if (r.hp > 0) { _sfx('hit'); return; }
  r.hp = 0;
  for (let i = 0; i < 12; i++) {
    Game.particles.push({
      x: r.x + rand(-RADIO_DESK_W * 0.4, RADIO_DESK_W * 0.4),
      y: r.y + rand(-RADIO_DESK_H * 0.4, RADIO_DESK_H * 0.4),
      vx: rand(-140, 140), vy: rand(-180, -30),
      life: rand(0.4, 0.8),
      color: i % 2 ? '#3a3f4a' : '#caa760', r: rand(2, 4),
    });
  }
  const idx = Game.radios.indexOf(r);
  if (idx >= 0) Game.radios.splice(idx, 1);
  if (Game.radioOverlay === r) closeRadioOverlay();
  if (typeof setNotice === 'function') setNotice('Radio destroyed', 2);
  _sfx('explosion');
}

// ---------- World draw ----------
function drawRadios(ctx, camX, camY) {
  const rs = Game.radios;
  if (rs && rs.length > 0) {
    const vL = camX - 60, vR = camX + VIEW_W + 60;
    const vT = camY - 80, vB = camY + VIEW_H + 60;
    const blinkOn = __radioBlinkT < RADIO_BLINK_HZ * 0.5;
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      if (r.x + RADIO_DESK_W < vL || r.x - RADIO_DESK_W > vR ||
          r.y + RADIO_DESK_H < vT || r.y - RADIO_ANTENNA_H > vB) continue;
      drawOneRadio(ctx, r, blinkOn);
    }
  }
  // Top-center toast — drawn in world space but pinned to the camera.
  if (__radioToastT > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, __radioToastT / 0.6);
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    const tw = ctx.measureText(__radioToast).width;
    const tx = camX + VIEW_W / 2, ty = camY + 40;
    ctx.fillStyle = 'rgba(11,12,14,0.88)';
    ctx.fillRect(tx - tw / 2 - 10, ty - 12, tw + 20, 20);
    ctx.fillStyle = '#e3c054'; ctx.textAlign = 'center';
    ctx.fillText(__radioToast, tx, ty + 2);
    ctx.textAlign = 'left'; ctx.restore();
  }
}

// Antenna mast + LED on top of 32×24 console (speaker left, dial+knobs right).
function drawOneRadio(ctx, r, blinkOn) {
  const powered = (typeof isPowered === 'function') && isPowered(r.x, r.y);
  const W = RADIO_DESK_W, H = RADIO_DESK_H, AH = RADIO_ANTENNA_H;
  const dx = r.x - W * 0.5, dy = r.y - H * 0.5;
  const ax = r.x - RADIO_ANTENNA_W * 0.5, ay = dy - AH;
  ctx.fillStyle = '#43464d'; ctx.fillRect(ax, ay, RADIO_ANTENNA_W, AH);
  ctx.fillStyle = '#5a606b'; ctx.fillRect(ax, ay, 1, AH);
  ctx.fillStyle = '#2a2d33'; ctx.fillRect(ax - 3, ay + AH * 0.5, RADIO_ANTENNA_W + 6, 2);
  if (powered && blinkOn) {
    ctx.fillStyle = '#d24b35'; ctx.fillRect(ax - 1, ay - 2, RADIO_ANTENNA_W + 2, 3);
    ctx.fillStyle = '#f4a89a'; ctx.fillRect(ax, ay - 2, 1, 1);
  } else {
    ctx.fillStyle = '#3a1f1c'; ctx.fillRect(ax, ay - 2, RADIO_ANTENNA_W, 2);
  }
  ctx.fillStyle = powered ? '#3a3f4a' : '#2a2d33'; ctx.fillRect(dx, dy, W, H);
  ctx.fillStyle = powered ? '#5a606b' : '#43464d';
  ctx.fillRect(dx + 1, dy + 1, W - 2, 2); ctx.fillRect(dx + 1, dy + 1, 2, H - 2);
  ctx.fillStyle = '#15171b';
  ctx.fillRect(dx + 1, dy + H - 3, W - 2, 2); ctx.fillRect(dx + W - 3, dy + 1, 2, H - 2);
  for (let g = 0; g < 4; g++) {
    ctx.fillStyle = g % 2 ? '#1a1c20' : '#2a2d33';
    ctx.fillRect(dx + 4, dy + 6 + g * 3, 10, 2);
  }
  ctx.fillStyle = '#15171b'; ctx.fillRect(dx + W - 14, dy + 6, 10, 12);
  ctx.fillStyle = powered ? '#8ec547' : '#caa760';
  ctx.fillRect(dx + W - 13, dy + 7, 8, 3);
  ctx.fillStyle = '#7a7e88';
  ctx.fillRect(dx + W - 13, dy + 12, 3, 3); ctx.fillRect(dx + W - 8, dy + 12, 3, 3);
  if (r.hp < r.maxHp) {
    const pct = Math.max(0, r.hp / r.maxHp), bw = W - 4;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(dx + 2, dy - 5, bw, 3);
    ctx.fillStyle = pct > 0.5 ? '#7ad97a' : pct > 0.25 ? '#e3c054' : '#d24b35';
    ctx.fillRect(dx + 2, dy - 5, bw * pct, 3);
  }
  const p = Game.player;
  if (p && !Game.radioOverlay) {
    const ddx = p.x - r.x, ddy = p.y - r.y, R = RADIO_INTERACT_RADIUS + 8;
    if (ddx * ddx + ddy * ddy < R * R) {
      ctx.fillStyle = 'rgba(11,12,14,0.85)';
      ctx.fillRect(r.x - 22, r.y - AH - 16, 44, 14);
      ctx.fillStyle = powered ? '#e8e6df' : '#7a7e88';
      ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText(powered ? '[E] RADIO' : 'NO POWER', r.x, r.y - AH - 6);
      ctx.textAlign = 'left';
    }
  }
}

// ---------- Overlay UI ----------
// Dark panel with crackling speaker band + 3 stacked buttons. Hit-rects are
// stashed on radio._closeRect / _btnS / _btnB / _btnM so handleRadioClick can
// route without recomputing layout.
function drawRadioOverlay(ctx, w, h, radio) {
  if (!radio) return;
  const today = (Game.time && Game.time.day) || 1;
  const panelW = Math.min(440, w - 80), panelH = Math.min(360, h - 80);
  const x0 = (w - panelW) / 2, y0 = (h - panelH) / 2;
  const btnX = x0 + 28, btnW = panelW - 56;
  const btnY0 = y0 + 110, btnH = 60, btnGap = 14;
  // Backdrop + panel.
  ctx.fillStyle = 'rgba(7,8,10,0.65)'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#0b0c0e'; ctx.fillRect(x0, y0, panelW, panelH);
  ctx.strokeStyle = '#2a2e36'; ctx.lineWidth = 1;
  ctx.strokeRect(x0 + 0.5, y0 + 0.5, panelW - 1, panelH - 1);
  // Crackling speaker band.
  const sx = x0 + 18, sy = y0 + 56, sw = panelW - 36, sh = 28, bars = 32;
  ctx.fillStyle = '#15171b'; ctx.fillRect(sx, sy, sw, sh);
  for (let i = 0; i < bars; i++) {
    const h2 = 4 + Math.abs(Math.sin(performance.now() * 0.011 + i * 0.7)) * (sh - 6);
    ctx.fillStyle = (i % 4 === 0) ? '#d24b35' : (i % 2 === 0 ? '#e3c054' : '#7a7e88');
    ctx.fillRect(sx + (i / bars) * sw + 1, sy + (sh - h2) / 2, Math.max(1, sw / bars - 2), h2);
  }
  // Header text + hint + close X.
  ctx.fillStyle = '#d24b35'; ctx.font = 'bold 11px "JetBrains Mono", monospace';
  ctx.textAlign = 'left'; ctx.fillText('// RADIO ROOM', x0 + 18, y0 + 24);
  ctx.fillStyle = '#e8e6df'; ctx.font = 'bold 26px "Bebas Neue", sans-serif';
  ctx.fillText('AIRWAVES', x0 + 18, y0 + 50);
  ctx.fillStyle = '#7a7e88'; ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'right'; ctx.fillText('[E] OR [ESC] · CLOSE', x0 + panelW - 18, y0 + 22);
  ctx.fillStyle = '#2a2e36'; ctx.fillRect(x0 + panelW - 32, y0 + 12, 20, 20);
  ctx.fillStyle = '#e8e6df'; ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center'; ctx.fillText('X', x0 + panelW - 22, y0 + 26);
  ctx.textAlign = 'left';
  radio._closeRect = { x: x0 + panelW - 32, y: y0 + 12, w: 20, h: 20 };

  // Gating + button defs.
  const traderUsedToday = (Game.radios || []).some(r => r.lastTraderSummonDay === today);
  const traderActive = !!(Game.trader && Game.trader.active);
  const broadOn = radio.lastBroadcastDay === today;
  const scanOn  = radio.bloodMoonForecastShownDay === today;
  const buttons = [
    { key: 'S', title: 'SUMMON TRADER', disabled: traderUsedToday || traderActive, accent: '#caa760',
      sub: traderActive ? 'TRADER ALREADY ACTIVE'
         : traderUsedToday ? 'COOLDOWN — TRY TOMORROW'
         : 'HAIL THE MERCHANT — ARRIVES SHORTLY' },
    { key: 'B', title: 'BROADCAST', disabled: broadOn, accent: '#8ec547',
      sub: broadOn ? 'COOLDOWN — TRY TOMORROW' : '2× SURVIVOR RECRUIT · LASTS TILL TOMORROW' },
    { key: 'M', title: 'BLOOD MOON SCAN', disabled: scanOn, accent: '#d24b35',
      sub: scanOn ? 'NO NEW READINGS TODAY'
                  : `EARLY-WARNING · NEXT ${RADIO_FORECAST_WINDOW_HOURS}H WINDOW` },
  ];
  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i], by = btnY0 + i * (btnH + btnGap);
    ctx.fillStyle = b.disabled ? '#15171b' : '#10131a'; ctx.fillRect(btnX, by, btnW, btnH);
    ctx.fillStyle = b.disabled ? '#2a2e36' : b.accent;  ctx.fillRect(btnX, by, 4, btnH);
    ctx.strokeStyle = b.disabled ? '#1a1c20' : '#3a3f4a';
    ctx.strokeRect(btnX + 0.5, by + 0.5, btnW - 1, btnH - 1);
    ctx.fillStyle = b.disabled ? '#5a5d65' : '#e8e6df';
    ctx.font = 'bold 18px "Bebas Neue", sans-serif';
    ctx.fillText(b.title, btnX + 16, by + 26);
    ctx.fillStyle = b.disabled ? '#43464d' : '#7a7e88';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(b.sub, btnX + 16, by + 46);
    radio['_btn' + b.key] = { x: btnX, y: by, w: btnW, h: btnH, disabled: b.disabled };
  }
  // Footer powered status.
  const powered = (typeof isPowered === 'function') && isPowered(radio.x, radio.y);
  ctx.fillStyle = powered ? '#8ec547' : '#d24b35';
  ctx.font = 'bold 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText(powered ? 'SIGNAL · LOCKED' : 'SIGNAL · LOST',
               x0 + panelW - 18, y0 + panelH - 14);
  ctx.textAlign = 'left';
}

function handleRadioClick(mouseX, mouseY) {
  if (!Game.radioOverlay) return false;
  const r = Game.radioOverlay;
  const _hit = (rect) => rect && mouseX >= rect.x && mouseX <= rect.x + rect.w
                                && mouseY >= rect.y && mouseY <= rect.y + rect.h;
  if (_hit(r._closeRect)) { closeRadioOverlay(); return true; }
  const fns = { S: radioActionSummonTrader, B: radioActionBroadcast, M: radioActionBloodMoonScan };
  for (const k of ['S', 'B', 'M']) {
    const bb = r['_btn' + k];
    if (!_hit(bb)) continue;
    if (bb.disabled) { _sfx('empty'); return true; }
    fns[k](r);
    return true;
  }
  return true; // consume click while modal open
}

// ---------- Save / load ----------
function saveRadios() {
  return (Game.radios || []).map(r => ({
    x: r.x, y: r.y, hp: r.hp, maxHp: r.maxHp,
    lastTraderSummonDay: r.lastTraderSummonDay,
    lastBroadcastDay: r.lastBroadcastDay,
    bloodMoonForecastShownDay: r.bloodMoonForecastShownDay,
  }));
}

function loadRadios(data) {
  initRadios();
  if (!Array.isArray(data)) return;
  const num = (v, d) => typeof v === 'number' ? v : d;
  for (const d of data) {
    if (!d || typeof d.x !== 'number' || typeof d.y !== 'number') continue;
    Game.radios.push({
      id: __radioIdSeq++, x: d.x, y: d.y,
      hp: num(d.hp, RADIO_HP_MAX), maxHp: num(d.maxHp, RADIO_HP_MAX),
      lastTraderSummonDay: num(d.lastTraderSummonDay, -1),
      lastBroadcastDay: num(d.lastBroadcastDay, -1),
      bloodMoonForecastShownDay: num(d.bloodMoonForecastShownDay, -1),
    });
  }
}
