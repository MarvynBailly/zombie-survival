'use strict';

// ---------- Trader NPC + Blood Moon ----------
// A) Hooded merchant walks in by day, sells via a canvas shop overlay,
//    leaves at dusk. Killable. Foundation for B·04 Radio Room.
// B) Scheduled blood-moon night flag. Foundation for D·03 Raid Night.
// State lives on Game.trader + Game.time.nextBloodMoonDay. The shop overlay
// reuses Game.mapOpen as the freeze gate and adds Game.traderShopOpen.

const TRADER_HP_MAX = 60, TRADER_SPEED = 95, TRADER_RADIUS = 12;
const TRADER_DAILY_ROLL_CHANCE = 0.30, TRADER_KILLED_COOLDOWN_DAYS = 3;
const TRADER_INTERACT_RADIUS = 50, TRADER_CHATTER_DURATION = 2.6;
const BLOOD_MOON_MIN_GAP = 4, BLOOD_MOON_MAX_GAP = 6;

const TRADER_STOCK_TEMPLATE = [
  { id: 'bandage', price: 8 }, { id: 'antibiotic', price: 15 },
  { id: 'fuel_can', price: 12 }, { id: 'battery', price: 10 },
  { id: 'base_flag', price: 40 }, { id: 'pistol_mag', price: 5 },
  { id: 'shotgun_shells', price: 10 },
];
const TRADER_GREETINGS = [
  "Got coin? I got cures.", "Step right up, friend.",
  "Bullets, bandages — best on the road.",
  "Not dead yet? Good. Let's trade.",
  "Pickings are slim, prices are fair.",
];
const TRADER_FAREWELLS = [
  "Stay sharp out there.", "Dusk's coming. I'm gone.", "Same time tomorrow, maybe.",
];

// ---------- Lifecycle ----------
function initTrader() {
  Game.trader = {
    active: false, x: 0, y: 0, r: TRADER_RADIUS, angle: 0, walkPhase: 0,
    arrivalDay: -1, leavesAtPhase: 'dusk',
    hp: TRADER_HP_MAX, maxHp: TRADER_HP_MAX,
    inventory: rollTraderInventory(),
    state: 'idle', destX: 0, destY: 0,
    chatter: '', chatterT: 0, killedOnDay: -1, wallStuck: 0,
  };
  Game.traderShopOpen = false;
}

// Daily-rotating: pick 4-5 items from the template with mild stock variance.
function rollTraderInventory() {
  const pool = TRADER_STOCK_TEMPLATE.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const t = pool[i]; pool[i] = pool[j]; pool[j] = t;
  }
  const count = 4 + Math.floor(Math.random() * 2);
  return pool.slice(0, count).map(e => ({
    id: e.id, price: e.price, stock: 1 + Math.floor(Math.random() * 3),
  }));
}

// 30% chance per new day (pre-Radio). Skip if active or in kill-cooldown.
function rollTraderArrival() {
  if (!Game.trader) return;
  const t = Game.trader; if (t.active) return;
  if (t.killedOnDay >= 0 && Game.time.day - t.killedOnDay < TRADER_KILLED_COOLDOWN_DAYS) return;
  if (Math.random() < TRADER_DAILY_ROLL_CHANCE) summonTrader();
}

// Force-spawn (B·04 Radio). Honors the kill cooldown.
function summonTrader() {
  if (!Game.trader) initTrader();
  const t = Game.trader; if (t.active) return false;
  const note = (typeof setNotice === 'function') ? setNotice : () => {};
  if (t.killedOnDay >= 0 && Game.time.day - t.killedOnDay < TRADER_KILLED_COOLDOWN_DAYS) {
    note('Trader is laying low (recent ambush).', 2.5); return false;
  }
  const p = Game.player; if (!p) return false;
  const span = (typeof ACTIVE_RADIUS !== 'undefined' ? ACTIVE_RADIUS : 2)
             * (typeof CHUNK_SIZE !== 'undefined' ? CHUNK_SIZE : 800);
  const ang = Math.random() * Math.PI * 2;
  t.x = clamp(p.x + Math.cos(ang) * span, 60, WORLD_W - 60);
  t.y = clamp(p.y + Math.sin(ang) * span, 60, WORLD_H - 60);
  const base = (typeof nearestBase === 'function') ? nearestBase(t.x, t.y) : null;
  t.destX = base ? base.x : p.x; t.destY = base ? base.y : p.y;
  t.state = 'enter'; t.active = true; t.arrivalDay = Game.time.day;
  t.hp = TRADER_HP_MAX; t.maxHp = TRADER_HP_MAX;
  t.inventory = rollTraderInventory(); t.wallStuck = 0;
  _chatter(TRADER_GREETINGS);
  note('A trader is approaching your area.', 3);
  if (Audio && Audio.sfx && Audio.sfx.wave) Audio.sfx.wave();
  return true;
}
function _chatter(pool) {
  if (!Game.trader) return;
  Game.trader.chatter = pool[Math.floor(Math.random() * pool.length)];
  Game.trader.chatterT = TRADER_CHATTER_DURATION;
}

// ---------- Tick ----------
// Walk-in → idle wander → walk-out at dusk → despawn at night.
// Adjacent zombies damage. If pinned, perturb destination.
function updateTrader(dt) {
  const t = Game.trader; if (!t || !t.active) return;
  if (t.chatterT > 0) t.chatterT = Math.max(0, t.chatterT - dt);
  if (t.hp <= 0) {
    _deathFx(t.x, t.y);
    if (typeof setNotice === 'function') setNotice('The trader has been killed.', 3);
    t.active = false; t.killedOnDay = Game.time.day;
    if (Game.traderShopOpen) closeTraderShop();
    return;
  }
  const phase = Game.time && Game.time.phase, p = Game.player;
  if (t.state !== 'leave' && (phase === 'dusk' || phase === 'night')) {
    t.state = 'leave';
    if (p) {
      const span = (typeof ACTIVE_RADIUS !== 'undefined' ? ACTIVE_RADIUS : 2)
                 * (typeof CHUNK_SIZE !== 'undefined' ? CHUNK_SIZE : 800) + 200;
      const a = Math.atan2(t.y - p.y, t.x - p.x) + (Math.random() - 0.5) * 0.4;
      t.destX = clamp(t.x + Math.cos(a) * span, 40, WORLD_W - 40);
      t.destY = clamp(t.y + Math.sin(a) * span, 40, WORLD_H - 40);
    }
    _chatter(TRADER_FAREWELLS);
    if (Game.traderShopOpen) closeTraderShop();
  }
  if (t.state === 'leave' && phase === 'night' && (!p || Math.hypot(t.x - p.x, t.y - p.y) > 700)) {
    t.active = false; return;
  }
  const dx = t.destX - t.x, dy = t.destY - t.y, dist = Math.hypot(dx, dy);
  if (dist > 6) {
    const nx = dx / dist, ny = dy / dist, px = t.x, py = t.y;
    t.x += nx * TRADER_SPEED * dt; t.y += ny * TRADER_SPEED * dt;
    t.angle = Math.atan2(ny, nx); t.walkPhase = (t.walkPhase + dt * 3.4) % 1;
    t.x = clamp(t.x, t.r, WORLD_W - t.r); t.y = clamp(t.y, t.r, WORLD_H - t.r);
    if (typeof World !== 'undefined' && World.forEachObstacleNear) {
      World.forEachObstacleNear(t.x, t.y, t.r + (typeof TILE_SIZE !== 'undefined' ? TILE_SIZE : 40),
        (o) => { if (!o.walkable && typeof resolveCircleRect === 'function') resolveCircleRect(t, o); });
    }
    if (Game.walls && typeof resolveCircleRect === 'function') for (const w of Game.walls) resolveCircleRect(t, w);
    if (Math.hypot(t.x - px, t.y - py) < 0.3) t.wallStuck = Math.min(180, t.wallStuck + 1);
    else t.wallStuck = 0;
    if (t.wallStuck > 60) {
      t.destX += (Math.random() - 0.5) * 200; t.destY += (Math.random() - 0.5) * 200;
      t.wallStuck = 0;
    }
  } else if (t.state === 'enter') {
    const r = 70 + Math.random() * 40, a = Math.random() * Math.PI * 2;
    t.destX = clamp(t.x + Math.cos(a) * r, 40, WORLD_W - 40);
    t.destY = clamp(t.y + Math.sin(a) * r, 40, WORLD_H - 40);
  }
  if (Game.zombies) for (let i = 0; i < Game.zombies.length; i++) {
    const z = Game.zombies[i], ddx = z.x - t.x, ddy = z.y - t.y;
    if (ddx * ddx + ddy * ddy < (z.r + t.r) * (z.r + t.r)) t.hp -= (z.damage || 6) * dt * 1.6;
  }
}
function _deathFx(x, y) {
  if (!Game.particles) return;
  for (let i = 0; i < 18; i++) Game.particles.push({
    x, y, vx: (Math.random() - 0.5) * 220, vy: (Math.random() - 0.5) * 220,
    life: 0.5 + Math.random() * 0.4,
    color: i % 3 === 0 ? '#caa760' : '#7a3a2a', r: 2 + Math.random() * 3,
  });
}

// ---------- Rendering ----------
// Hooded merchant — distinct silhouette from zombies / squad.
function drawTrader(ctx, camX, camY) {
  const t = Game.trader; if (!t || !t.active) return;
  const x = t.x, y = t.y, bob = Math.sin(t.walkPhase * Math.PI * 2) * 1.2;
  const fr = (s, ax, ay, aw, ah) => { ctx.fillStyle = s; ctx.fillRect(ax, ay, aw, ah); };
  const arc = (s, ax, ay, ar) => { ctx.fillStyle = s; ctx.beginPath(); ctx.arc(ax, ay, ar, 0, Math.PI * 2); ctx.fill(); };
  ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.beginPath();
  ctx.ellipse(x, y + 11, 9, 3, 0, 0, Math.PI * 2); ctx.fill();
  fr('#5a4528', x - 7, y - 6 + bob, 14, 11);
  fr('#3a2c18', x - 7, y - 6 + bob, 14, 2);
  fr('#caa760', x - 6, y - 4 + bob, 4, 2); fr('#caa760', x + 2, y - 4 + bob, 4, 2);
  fr('#4a3a5a', x - 8, y - 4 + bob, 16, 14);
  fr('#2c2238', x - 8, y + 6 + bob, 16, 4);
  arc('#2c2238', x, y - 6 + bob, 7);
  arc('#0c0c12', x, y - 5 + bob, 4);
  fr('#e3c054', x - 2, y - 6 + bob, 1, 1); fr('#e3c054', x + 1, y - 6 + bob, 1, 1);
  arc('#7a5a30', x, y + 2 + bob, 2.4);
  if (t.hp < t.maxHp) {
    const w = 24, pct = Math.max(0, t.hp / t.maxHp);
    fr('rgba(0,0,0,0.55)', x - w / 2 - 1, y - 18, w + 2, 4);
    fr(pct > 0.5 ? '#7ad97a' : pct > 0.25 ? '#e3c054' : '#d24b35', x - w / 2, y - 17, w * pct, 2);
  }
  const p = Game.player;
  if (p && !Game.traderShopOpen) {
    const d2 = (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y);
    if (d2 < (TRADER_INTERACT_RADIUS + 8) * (TRADER_INTERACT_RADIUS + 8)) {
      fr('rgba(11,12,14,0.85)', x - 22, y - 32, 44, 14);
      ctx.fillStyle = '#e8e6df'; ctx.font = 'bold 10px "JetBrains Mono", monospace';
      ctx.textAlign = 'center'; ctx.fillText('[E] TRADE', x, y - 22); ctx.textAlign = 'left';
    }
  }
  if (t.chatter && t.chatterT > 0) {
    ctx.save(); ctx.globalAlpha = Math.min(1, t.chatterT / 0.6);
    ctx.font = 'bold 11px "Manrope", sans-serif';
    const tw = ctx.measureText(t.chatter).width;
    fr('rgba(11,12,14,0.88)', x - tw / 2 - 6, y - 48, tw + 12, 16);
    ctx.fillStyle = '#e3c054'; ctx.textAlign = 'center';
    ctx.fillText(t.chatter, x, y - 36); ctx.textAlign = 'left'; ctx.restore();
  }
}

// ---------- Interact / shop overlay ----------
function findTraderNear(player, radius) {
  const t = Game.trader; if (!t || !t.active) return null;
  const r = radius || TRADER_INTERACT_RADIUS;
  const dx = t.x - player.x, dy = t.y - player.y;
  return dx * dx + dy * dy <= r * r ? t : null;
}
function openTraderShop() {
  if (Game.mode !== 'playing') return;
  if (!Game.trader || !Game.trader.active) return;
  Game.traderShopOpen = true; Game.mapOpen = true;
  _chatter(TRADER_GREETINGS);
  if (Audio && Audio.sfx && Audio.sfx.click) Audio.sfx.click();
}
function closeTraderShop() {
  Game.traderShopOpen = false;
  if (Game.mode === 'playing') Game.mapOpen = false;
  if (Game.player) Game.player.openCd = 0.4;
}
const _shopIconCache = {};
function _shopLayout(w, h) {
  const panelW = Math.min(520, w - 80), panelH = Math.min(460, h - 80);
  return {
    x0: (w - panelW) / 2, y0: (h - panelH) / 2,
    panelW, panelH, rowH: 46, rowsTop: (h - panelH) / 2 + 96,
  };
}

// Dark panel + row list. Per-row + close hit-rects stashed for click routing.
function drawTraderShop(ctx, w, h) {
  if (!Game.traderShopOpen) return;
  const t = Game.trader; if (!t) return;
  const L = _shopLayout(w, h);
  const fr = (s, ax, ay, aw, ah) => { ctx.fillStyle = s; ctx.fillRect(ax, ay, aw, ah); };
  const tx = (s, str, ax, ay, font, align) => { ctx.fillStyle = s; ctx.font = font; ctx.textAlign = align || 'left'; ctx.fillText(str, ax, ay); };
  fr('rgba(7,8,10,0.82)', 0, 0, w, h);
  fr('#0b0d10', L.x0, L.y0, L.panelW, L.panelH);
  ctx.strokeStyle = '#2a2e36'; ctx.lineWidth = 1;
  ctx.strokeRect(L.x0 + 0.5, L.y0 + 0.5, L.panelW - 1, L.panelH - 1);
  tx('#d24b35', '// TRADER', L.x0 + 18, L.y0 + 24, 'bold 11px "JetBrains Mono", monospace');
  tx('#e8e6df', 'WARES', L.x0 + 18, L.y0 + 52, 'bold 26px "Bebas Neue", sans-serif');
  const scrap = (typeof itemCount === 'function' && Game.player && Game.player.inventory)
    ? itemCount(Game.player.inventory, 'scrap') : 0;
  tx('#e3c054', `SCRAP · ${scrap}`, L.x0 + L.panelW - 18, L.y0 + 52, 'bold 14px "JetBrains Mono", monospace', 'right');
  tx('#7a7e88', 'Click BUY to purchase. Click X or press E / Esc to close.',
     L.x0 + 18, L.y0 + 76, '10px "JetBrains Mono", monospace');
  fr('#2a2e36', L.x0 + L.panelW - 32, L.y0 + 12, 20, 20);
  tx('#e8e6df', 'X', L.x0 + L.panelW - 22, L.y0 + 26, 'bold 12px monospace', 'center');
  ctx.textAlign = 'left';
  for (let i = 0; i < t.inventory.length; i++) {
    const it = t.inventory[i], ry = L.rowsTop + i * L.rowH;
    const canAfford = scrap >= it.price && it.stock > 0;
    fr(i % 2 ? '#10131a' : '#0e1116', L.x0 + 12, ry, L.panelW - 24, L.rowH - 6);
    let drewIcon = false;
    if (typeof getItemIcon === 'function' && typeof ITEMS !== 'undefined' && ITEMS[it.id]) {
      const c = _shopIconCache[it.id];
      if (c && c.complete) { ctx.drawImage(c, L.x0 + 18, ry + 4, 32, 32); drewIcon = true; }
      else if (!c) { const img = new Image(); img.src = getItemIcon(it.id); _shopIconCache[it.id] = img; }
    }
    if (!drewIcon) {
      fr('#3a3f4a', L.x0 + 18, ry + 4, 32, 32);
      tx('#7a7e88', '?', L.x0 + 34, ry + 24, 'bold 12px monospace', 'center');
    }
    const name = (typeof ITEMS !== 'undefined' && ITEMS[it.id] && ITEMS[it.id].name) ? ITEMS[it.id].name : it.id;
    tx('#e8e6df', name, L.x0 + 60, ry + 18, 'bold 14px "Manrope", sans-serif');
    tx('#7a7e88', `STOCK · ${it.stock}`, L.x0 + 60, ry + 32, '10px "JetBrains Mono", monospace');
    tx(canAfford ? '#e3c054' : '#7a3a2a', `${it.price}`, L.x0 + L.panelW - 110, ry + 24,
       'bold 13px "JetBrains Mono", monospace', 'right');
    const bx = L.x0 + L.panelW - 92, by = ry + 6;
    fr(canAfford ? '#d24b35' : '#2a2e36', bx, by, 70, 28);
    tx(canAfford ? '#fdf5ea' : '#5a5d65', 'BUY', bx + 35, by + 19,
       'bold 12px "JetBrains Mono", monospace', 'center');
    it._buyRect = { x: bx, y: by, w: 70, h: 28 };
  }
  ctx.textAlign = 'left';
  Game.trader._closeRect = { x: L.x0 + L.panelW - 32, y: L.y0 + 12, w: 20, h: 20 };
}

function handleTraderShopClick(mouseX, mouseY) {
  if (!Game.traderShopOpen) return false;
  const t = Game.trader; if (!t) return false;
  const cr = t._closeRect;
  if (cr && mouseX >= cr.x && mouseX <= cr.x + cr.w && mouseY >= cr.y && mouseY <= cr.y + cr.h) {
    closeTraderShop(); return true;
  }
  for (let i = 0; i < t.inventory.length; i++) {
    const r = t.inventory[i]._buyRect; if (!r) continue;
    if (mouseX >= r.x && mouseX <= r.x + r.w && mouseY >= r.y && mouseY <= r.y + r.h) {
      buyFromTrader(i); return true;
    }
  }
  return true; // consume click while modal open
}

// Delivery: ITEMS[id] -> addItem; else CRAFT_RECIPES.find -> apply(p);
// else soft notice + refund (see trader.md item 11).
function buyFromTrader(index) {
  const t = Game.trader; if (!t || !t.active) return false;
  const it = t.inventory[index]; if (!it) return false;
  const p = Game.player; if (!p || !p.inventory) return false;
  const sfx = Audio && Audio.sfx, note = (typeof setNotice === 'function') ? setNotice : () => {};
  if (it.stock <= 0) { if (sfx && sfx.empty) sfx.empty(); return false; }
  const have = (typeof itemCount === 'function') ? itemCount(p.inventory, 'scrap') : 0;
  if (have < it.price) { note('Not enough scrap.', 1.2); if (sfx && sfx.empty) sfx.empty(); return false; }
  const hasItem = (typeof ITEMS !== 'undefined' && ITEMS[it.id]);
  const recipe = (typeof CRAFT_RECIPES !== 'undefined') ? CRAFT_RECIPES.find(r => r.id === it.id) : null;
  if (!hasItem && !recipe) { note(`(${it.id} not registered yet)`, 1.6); return false; }
  if (typeof removeItem === 'function') removeItem(p.inventory, 'scrap', it.price);
  let delivered = false;
  if (hasItem && typeof addItem === 'function') delivered = (addItem(p.inventory, it.id, 1) === 0);
  if (!delivered && recipe) { recipe.apply(p); delivered = true; }
  if (!delivered) {
    if (typeof addItem === 'function') addItem(p.inventory, 'scrap', it.price);
    note('Inventory full.', 1.5);
    return false;
  }
  it.stock = Math.max(0, it.stock - 1);
  if (sfx && sfx.pickup) sfx.pickup();
  return true;
}

// ---------- Blood Moon ----------
// First moon: day 4-6. After each moon, schedule +4..+6 days out.
function initBloodMoon() {
  if (!Game.time) Game.time = { day: 1, t: 0, phase: 'day' };
  Game.time.nextBloodMoonDay = BLOOD_MOON_MIN_GAP
    + Math.floor(Math.random() * (BLOOD_MOON_MAX_GAP - BLOOD_MOON_MIN_GAP + 1));
}

// Called at day rollover. If today >= scheduled day, push the schedule forward.
function rollNextBloodMoon() {
  if (!Game.time) return;
  if (Game.time.nextBloodMoonDay == null) initBloodMoon();
  if (Game.time.day >= Game.time.nextBloodMoonDay) {
    const gap = BLOOD_MOON_MIN_GAP + Math.floor(Math.random() * (BLOOD_MOON_MAX_GAP - BLOOD_MOON_MIN_GAP + 1));
    Game.time.nextBloodMoonDay = Game.time.day + gap;
  }
  if (isBloodMoonTonight() && typeof setBanner === 'function') {
    setBanner('BLOOD MOON RISES TONIGHT', 3);
  }
}

function isBloodMoonTonight() {
  return !!(Game.time && Game.time.nextBloodMoonDay != null
    && Game.time.day === Game.time.nextBloodMoonDay);
}

// { days, hours } until next blood moon. For B·04 Radio early-warning.
function bloodMoonForecast() {
  if (!Game.time || Game.time.nextBloodMoonDay == null) return { days: -1, hours: -1 };
  const daysAway = Math.max(0, Game.time.nextBloodMoonDay - Game.time.day);
  const dayLen = (typeof DAY_LENGTH !== 'undefined' ? DAY_LENGTH : 255);
  const todayLeftFrac = Math.max(0, dayLen - (Game.time.t || 0)) / dayLen;
  return { days: daysAway, hours: Math.round(todayLeftFrac * 24 + Math.max(0, daysAway - 1) * 24) };
}

// Additive radial red tint — only at NIGHT on a blood-moon day.
function drawBloodMoonTint(ctx, w, h) {
  if (!isBloodMoonTonight() || !Game.time || Game.time.phase !== 'night') return;
  ctx.save(); ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.1, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, 'rgba(180,30,30,0.18)');
  g.addColorStop(0.6, 'rgba(120,15,15,0.12)');
  g.addColorStop(1, 'rgba(40,0,0,0.02)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h); ctx.restore();
}

// ---------- Save / Load ----------
function saveTrader() {
  const t = Game.trader;
  return {
    trader: t ? {
      active: !!t.active, x: t.x, y: t.y, hp: t.hp, maxHp: t.maxHp,
      arrivalDay: t.arrivalDay, killedOnDay: t.killedOnDay,
      state: t.state, destX: t.destX, destY: t.destY,
      inventory: t.inventory.map(e => ({ id: e.id, price: e.price, stock: e.stock })),
    } : null,
    nextBloodMoonDay: (Game.time && Game.time.nextBloodMoonDay) != null ? Game.time.nextBloodMoonDay : null,
  };
}
function loadTrader(data) {
  if (!data) return;
  if (data.trader) {
    if (!Game.trader) initTrader();
    const t = Game.trader, d = data.trader;
    t.active = !!d.active; t.x = d.x; t.y = d.y;
    t.hp = d.hp; t.maxHp = d.maxHp || TRADER_HP_MAX;
    t.arrivalDay = d.arrivalDay;
    t.killedOnDay = d.killedOnDay != null ? d.killedOnDay : -1;
    t.state = d.state || 'idle'; t.destX = d.destX; t.destY = d.destY;
    t.inventory = Array.isArray(d.inventory) && d.inventory.length
      ? d.inventory.map(e => ({ id: e.id, price: e.price, stock: e.stock }))
      : rollTraderInventory();
    t.wallStuck = 0; t.chatter = ''; t.chatterT = 0;
  }
  if (data.nextBloodMoonDay != null && Game.time) Game.time.nextBloodMoonDay = data.nextBloodMoonDay;
}
