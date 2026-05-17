'use strict';

// ---------- Kitchen / Cooking ----------
// Placeable cook stations (stoves) consume ingredients into meals. Meals are
// inventory consumables whose `use()` calls back into consumeMeal() to apply
// a timed buff. No hunger — meals stand alone as utility items.
//
// State:
//   Game.cookStations — { id, x, y, w, h, hp, maxHp, lit, litTimer }[]
//   Game.activeBuffs  — { id, kind, expiresAt, mult, regen }[]
//     kind ∈ 'stamina' | 'heat_resist' | 'sprint' | 'regen'
// hasBuff/buffMult check expiry against now() — cheap for hot paths
// (player.speed, blizzard slowdown, sprint regen).

const COOK_STATION_HP       = 60;
const COOK_STATION_W        = 80;     // two-tile footprint (40 × 2)
const COOK_STATION_H        = 60;
const COOK_STATION_INTERACT = 60;
const COOK_LIT_SECONDS      = 2.0;    // flame flicker after a cook

// Default payloads per buff kind. applyBuff(kind, dur, opts) can override.
const KITCHEN_BUFF_DEFAULTS = {
  stamina:     { mult: 1.15 },        // +15% movement speed
  heat_resist: { mult: 0.60 },        // 40% less blizzard slowdown
  sprint:      { mult: 2.0  },        // 2× sprint regen
  regen:       { regen: 0.4 },        // +0.4 HP/s, stacks with Medic perk
};

const COOK_RECIPES = [
  { id: 'stew', label: 'Stew', output: 'stew',
    desc: 'Hearty: +60 HP, +15% speed for 90s.',
    ingredients: [{ id: 'canned_beans', n: 2 }, { id: 'raw_meat', n: 1 }],
    heal: 60, buff: { kind: 'stamina', sec: 90 } },
  { id: 'chili_bowl', label: 'Chili Bowl', output: 'chili_bowl',
    desc: 'Warming: +40 HP, -40% blizzard slowdown for 120s.',
    ingredients: [{ id: 'chili', n: 1 }, { id: 'canned_beans', n: 1 }],
    heal: 40, buff: { kind: 'heat_resist', sec: 120 } },
  { id: 'coffee', label: 'Coffee', output: 'coffee',
    desc: 'Wired: 2× sprint regen for 60s.',
    ingredients: [{ id: 'coffee_beans', n: 1 }],
    heal: 0, buff: { kind: 'sprint', sec: 60 } },
  { id: 'vitamin_paste', label: 'Vitamin Paste', output: 'vitamin_paste',
    desc: 'Slow heal: +0.4 HP/s for 120s.',
    ingredients: [{ id: 'tomato', n: 1 }, { id: 'poppy', n: 1 }],
    heal: 0, buff: { kind: 'regen', sec: 120 } },
];

let __cookIdSeq = 1;

// ---------- Lifecycle ----------
function initKitchen() {
  Game.cookStations = [];
  Game.activeBuffs = [];
  Game.kitchenOpen = false;
  Game.kitchenStation = null;
  __cookIdSeq = 1;
}

// Per-tick: expire buffs, tick regen, fade lit-flame timers.
function updateKitchen(dt) {
  const buffs = Game.activeBuffs;
  if (buffs && buffs.length > 0) {
    const nowSec = now(), p = Game.player;
    for (let i = buffs.length - 1; i >= 0; i--) {
      const b = buffs[i];
      if (b.expiresAt <= nowSec) { buffs.splice(i, 1); continue; }
      if (b.kind === 'regen' && b.regen > 0 && p && !p.dead && p.hp < p.maxHp) {
        p.hp = Math.min(p.maxHp, p.hp + b.regen * dt);
      }
    }
  }
  const stations = Game.cookStations;
  if (stations) for (let i = 0; i < stations.length; i++) {
    const s = stations[i];
    if (s.litTimer > 0 && (s.litTimer -= dt) <= 0) { s.litTimer = 0; s.lit = false; }
  }
}

// ---------- Placement ----------
function placeCookStation(worldX, worldY) {
  if (!Game.cookStations) Game.cookStations = [];
  const cx = clamp(Math.floor(worldX / WALL_SIZE), 0, Math.floor(WORLD_W / WALL_SIZE) - 1);
  const cy = clamp(Math.floor(worldY / WALL_SIZE), 0, Math.floor(WORLD_H / WALL_SIZE) - 1);
  const rect = { x: cx * WALL_SIZE, y: cy * WALL_SIZE, w: COOK_STATION_W, h: COOK_STATION_H };
  const fail = (msg) => { setNotice(msg, 1); return null; };
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > WORLD_W || rect.y + rect.h > WORLD_H) return fail('Out of bounds');
  let blocked = false;
  if (typeof World !== 'undefined' && World.forEachActiveObstacle) {
    World.forEachActiveObstacle(rect.x + rect.w / 2, rect.y + rect.h / 2, (o) => {
      if (!blocked && rect.x < o.x + o.w && rect.x + rect.w > o.x &&
          rect.y < o.y + o.h && rect.y + rect.h > o.y) blocked = true;
    });
  }
  if (blocked) return fail("Can't place there");
  const overlapsRect = (r) => rect.x < r.x + r.w && rect.x + rect.w > r.x &&
                              rect.y < r.y + r.h && rect.y + rect.h > r.y;
  for (const w of Game.walls)         if (overlapsRect(w)) return fail("Can't place there");
  for (const s of Game.cookStations)  if (overlapsRect(s)) return fail("Can't place there");
  const p = Game.player;
  if (p && rect.x < p.x + p.r && rect.x + rect.w > p.x - p.r &&
          rect.y < p.y + p.r && rect.y + rect.h > p.y - p.r) return fail("Can't place there");
  const st = {
    id: __cookIdSeq++, x: rect.x, y: rect.y, w: rect.w, h: rect.h,
    hp: COOK_STATION_HP, maxHp: COOK_STATION_HP, lit: false, litTimer: 0,
  };
  Game.cookStations.push(st);
  Audio.sfx.click && Audio.sfx.click();
  setNotice('Cook station placed — press E to cook', 2);
  return st;
}

function findCookStationNear(player, radius) {
  const list = Game.cookStations;
  if (!list || list.length === 0) return null;
  const R = radius || COOK_STATION_INTERACT;
  let best = null, bestD = R * R;
  for (const s of list) {
    const dx = s.x + s.w * 0.5 - player.x, dy = s.y + s.h * 0.5 - player.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

function damageCookStation(st, dmg) {
  if (!st || st.hp <= 0) return;
  st.hp -= dmg;
  if (st.hp > 0) { Audio.sfx.hit && Audio.sfx.hit(); return; }
  st.hp = 0; st.lit = false;
  for (let i = 0; i < 12; i++) Game.particles.push({
    x: st.x + st.w * 0.5 + rand(-st.w * 0.4, st.w * 0.4),
    y: st.y + st.h * 0.5 + rand(-st.h * 0.4, st.h * 0.4),
    vx: rand(-140, 140), vy: rand(-180, -30), life: rand(0.4, 0.8),
    color: i % 2 ? '#43464d' : '#e3a83a', r: rand(2, 4),
  });
  const idx = Game.cookStations.indexOf(st);
  if (idx >= 0) Game.cookStations.splice(idx, 1);
  if (Game.kitchenStation === st) closeKitchenUi();
  Audio.sfx.explosion && Audio.sfx.explosion();
  setNotice('Cook station destroyed', 2);
}

// ---------- Cooking ----------
function cook(recipe, player) {
  if (!recipe) return false;
  const inv = player && player.inventory;
  if (!inv) return false;
  for (const ing of recipe.ingredients) if (!hasItem(inv, ing.id, ing.n)) {
    setNotice('Not enough ingredients', 1.2);
    Audio.sfx.empty && Audio.sfx.empty();
    return false;
  }
  for (const ing of recipe.ingredients) removeItem(inv, ing.id, ing.n);
  if (addItem(inv, recipe.output, 1) > 0) {
    for (const ing of recipe.ingredients) addItem(inv, ing.id, ing.n);
    setNotice('Inventory full — cooking cancelled', 1.5);
    return false;
  }
  const st = Game.kitchenStation;
  if (st) { st.lit = true; st.litTimer = COOK_LIT_SECONDS; }
  Audio.sfx.pickup && Audio.sfx.pickup();
  setNotice(`Cooked: ${ITEMS[recipe.output] ? ITEMS[recipe.output].name : recipe.output}`, 1.5);
  return true;
}

// Called by meal items' use() — heals + applies the recipe's buff.
function consumeMeal(itemId, player) {
  const recipe = COOK_RECIPES.find(r => r.output === itemId);
  if (!recipe || !player) return false;
  let did = false;
  if (recipe.heal && player.hp < player.maxHp) {
    player.hp = Math.min(player.maxHp, player.hp + recipe.heal);
    did = true;
  }
  if (recipe.buff) { applyBuff(recipe.buff.kind, recipe.buff.sec); did = true; }
  if (did) setNotice(`${ITEMS[itemId] ? ITEMS[itemId].name : itemId} consumed`, 1.5);
  return did;
}

// ---------- Buffs ----------
function applyBuff(kind, durationSec, opts) {
  if (!Game.activeBuffs) Game.activeBuffs = [];
  const def = KITCHEN_BUFF_DEFAULTS[kind] || {};
  const o = opts || {};
  const nowSec = now();
  // Refresh existing buff of the same kind instead of stacking duplicates.
  for (const b of Game.activeBuffs) if (b.kind === kind) {
    b.expiresAt = Math.max(b.expiresAt, nowSec + durationSec);
    if (o.mult  != null) b.mult  = o.mult;
    if (o.regen != null) b.regen = o.regen;
    return b;
  }
  const buff = {
    id: kind + '_' + Math.floor(Math.random() * 1e9),
    kind, expiresAt: nowSec + durationSec,
    mult:  o.mult  != null ? o.mult  : def.mult,
    regen: o.regen != null ? o.regen : def.regen,
  };
  Game.activeBuffs.push(buff);
  return buff;
}

function hasBuff(kind) {
  const buffs = Game.activeBuffs;
  if (!buffs || buffs.length === 0) return false;
  const nowSec = now();
  for (const b of buffs) if (b.kind === kind && b.expiresAt > nowSec) return true;
  return false;
}

function buffMult(kind) {
  if (!hasBuff(kind)) return 1;
  const def = KITCHEN_BUFF_DEFAULTS[kind] || {};
  for (const b of Game.activeBuffs) if (b.kind === kind) {
    return (typeof b.mult === 'number') ? b.mult : (def.mult != null ? def.mult : 1);
  }
  return 1;
}

// ---------- World render ----------
function drawCookStations(ctx, camX, camY) {
  const list = Game.cookStations;
  if (!list || list.length === 0) return;
  const vL = camX - 60, vR = camX + VIEW_W + 60, vT = camY - 60, vB = camY + VIEW_H + 60;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (s.x + s.w < vL || s.x > vR || s.y + s.h < vT || s.y > vB) continue;
    drawCookStation(ctx, s);
  }
}

function drawCookStation(ctx, s) {
  // Counter base + bevel.
  ctx.fillStyle = '#2a2d33'; ctx.fillRect(s.x, s.y, s.w, s.h);
  ctx.fillStyle = '#43464d';
  ctx.fillRect(s.x + 1, s.y + 1, s.w - 2, 2); ctx.fillRect(s.x + 1, s.y + 1, 2, s.h - 2);
  ctx.fillStyle = '#15171b';
  ctx.fillRect(s.x + 1, s.y + s.h - 3, s.w - 2, 2); ctx.fillRect(s.x + s.w - 3, s.y + 1, 2, s.h - 2);
  // Stove-top inset + burners.
  const stTopY = s.y + 6, stTopH = s.h * 0.55;
  ctx.fillStyle = '#1a1c20'; ctx.fillRect(s.x + 6, stTopY, s.w - 12, stTopH);
  ctx.fillStyle = '#3a3f4a'; ctx.fillRect(s.x + 6, stTopY, s.w - 12, 1);
  const by = stTopY + stTopH * 0.5;
  drawBurner(ctx, s.x + s.w * 0.30, by, s.lit);
  drawBurner(ctx, s.x + s.w * 0.70, by, s.lit);
  // Counter strip + knobs.
  ctx.fillStyle = '#5a606b'; ctx.fillRect(s.x + 4, s.y + s.h - 12, s.w - 8, 6);
  ctx.fillStyle = '#7a7e88';
  ctx.fillRect(s.x + 4, s.y + s.h - 12, s.w - 8, 1);
  ctx.fillRect(s.x + 12, s.y + s.h - 8, 4, 2); ctx.fillRect(s.x + s.w - 16, s.y + s.h - 8, 4, 2);
  // Status LED + HP bar when damaged.
  ctx.fillStyle = s.lit ? '#f4d77a' : '#5a2a2a';
  ctx.fillRect(s.x + s.w - 6, s.y + 4, 2, 2);
  if (s.hp < s.maxHp) {
    const pct = Math.max(0, s.hp / s.maxHp), bw = s.w - 4;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(s.x + 2, s.y - 5, bw, 3);
    ctx.fillStyle = pct > 0.5 ? '#7ad97a' : pct > 0.25 ? '#e3c054' : '#d24b35';
    ctx.fillRect(s.x + 2, s.y - 5, bw * pct, 3);
  }
}

function drawBurner(ctx, cx, cy, lit) {
  const ring = (r, c) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); };
  ring(9, '#0b0c0e'); ring(7, '#15171b');
  if (!lit) return;
  ring(6, '#d24b35'); ring(4, '#e3a83a'); ring(2, '#f4d77a');
}

// ---------- Kitchen UI (canvas overlay, modeled on drawWorldMap) ----------
// Stores button rects between draw and click for hit-testing.
let __kitchenLayout = null;

function openKitchenUi(station) {
  if (Game.mode !== 'playing') return;
  Game.kitchenOpen = true;
  Game.kitchenStation = station || findCookStationNear(Game.player, COOK_STATION_INTERACT);
  Game.mapOpen = true;
  Audio.sfx.click && Audio.sfx.click();
}
function closeKitchenUi() {
  Game.kitchenOpen = false;
  Game.kitchenStation = null;
  __kitchenLayout = null;
  if (Game.mode === 'playing') Game.mapOpen = false;
  if (Game.player) Game.player.openCd = 0.4;
}
function isKitchenUiOpen() { return !!Game.kitchenOpen; }

function drawKitchenUi(ctx, w, h) {
  ctx.fillStyle = 'rgba(7,8,10,0.94)'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(11,12,14,0.92)'; ctx.fillRect(0, 0, w, 42);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#e3a83a'; ctx.font = 'bold 11px "JetBrains Mono", monospace';
  ctx.fillText('// COOK STATION', 22, 18);
  ctx.fillStyle = '#e8e6df'; ctx.font = 'bold 20px "Bebas Neue", sans-serif';
  ctx.fillText('KITCHEN', 22, 34);
  ctx.fillStyle = '#7a7e88'; ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'right'; ctx.fillText('[E] OR [ESC] · CLOSE', w - 22, 26);
  ctx.textAlign = 'left';

  const inv = Game.player && Game.player.inventory;
  __kitchenLayout = { buttons: [] };
  const rowH = 78, rowW = Math.min(640, w - 100);
  const startX = (w - rowW) / 2, startY = 70;
  const btnW = 110, btnH = 38;

  for (let i = 0; i < COOK_RECIPES.length; i++) {
    const r = COOK_RECIPES[i];
    const ry = startY + i * (rowH + 8);
    const canAfford = !!inv && r.ingredients.every(c => hasItem(inv, c.id, c.n));
    // Row card + dividers.
    ctx.fillStyle = canAfford ? 'rgba(20,22,26,0.95)' : 'rgba(20,22,26,0.65)';
    ctx.fillRect(startX, ry, rowW, rowH);
    ctx.fillStyle = canAfford ? '#3a3f4a' : '#2a2d33';
    ctx.fillRect(startX, ry, rowW, 1); ctx.fillRect(startX, ry + rowH - 1, rowW, 1);
    // Name + desc.
    ctx.fillStyle = canAfford ? '#e8e6df' : '#7a7e88';
    ctx.font = 'bold 18px "Bebas Neue", sans-serif';
    ctx.fillText(r.label.toUpperCase(), startX + 16, ry + 24);
    ctx.fillStyle = canAfford ? '#caa760' : '#5a606b';
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText(r.desc, startX + 16, ry + 42);
    // Ingredient cost.
    const costStr = r.ingredients.map(c => {
      const have = inv ? itemCount(inv, c.id) : 0;
      const nm = ITEMS[c.id] ? ITEMS[c.id].name : c.id;
      return `${have}/${c.n} ${nm}`;
    }).join('   ');
    ctx.fillStyle = canAfford ? '#8ec547' : '#d24b35';
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(costStr, startX + 16, ry + 62);
    // COOK button.
    const btnX = startX + rowW - btnW - 16, btnY = ry + (rowH - btnH) / 2;
    ctx.fillStyle = canAfford ? '#8ec547' : '#3a3f4a'; ctx.fillRect(btnX, btnY, btnW, btnH);
    ctx.fillStyle = canAfford ? '#0b0c0e' : '#7a7e88';
    ctx.font = 'bold 14px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('COOK', btnX + btnW / 2, btnY + btnH / 2 + 5);
    ctx.textAlign = 'left';
    __kitchenLayout.buttons.push({ x: btnX, y: btnY, w: btnW, h: btnH, recipe: r, canAfford });
  }
  ctx.fillStyle = '#7a7e88'; ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Meals appear in your inventory. Right-click them to consume.', w / 2, h - 22);
  ctx.textAlign = 'left';
}

function handleKitchenClick(mouseX, mouseY) {
  if (!__kitchenLayout) return false;
  for (const btn of __kitchenLayout.buttons) {
    if (mouseX >= btn.x && mouseX <= btn.x + btn.w &&
        mouseY >= btn.y && mouseY <= btn.y + btn.h) {
      if (btn.canAfford) cook(btn.recipe, Game.player);
      return true;
    }
  }
  return false;
}

// ---------- Save / load ----------
function saveKitchen() {
  const nowSec = now();
  return {
    stations: (Game.cookStations || []).map(s => ({
      x: s.x, y: s.y, w: s.w, h: s.h, hp: s.hp, maxHp: s.maxHp,
    })),
    buffs: (Game.activeBuffs || []).filter(b => b.expiresAt > nowSec).map(b => ({
      kind: b.kind, remaining: Math.max(0, b.expiresAt - nowSec),
      mult: b.mult, regen: b.regen,
    })),
  };
}

function loadKitchen(data) {
  initKitchen();
  if (!data) return;
  const num = (v, d) => typeof v === 'number' ? v : d;
  if (Array.isArray(data.stations)) for (const d of data.stations) {
    if (!d || typeof d.x !== 'number' || typeof d.y !== 'number') continue;
    Game.cookStations.push({
      id: __cookIdSeq++, x: d.x, y: d.y,
      w: num(d.w, COOK_STATION_W), h: num(d.h, COOK_STATION_H),
      hp: num(d.hp, COOK_STATION_HP), maxHp: num(d.maxHp, COOK_STATION_HP),
      lit: false, litTimer: 0,
    });
  }
  if (Array.isArray(data.buffs)) {
    const nowSec = now();
    for (const b of data.buffs) {
      if (!b || !b.kind || typeof b.remaining !== 'number') continue;
      Game.activeBuffs.push({
        id: b.kind + '_' + Math.floor(Math.random() * 1e9),
        kind: b.kind, expiresAt: nowSec + b.remaining,
        mult: b.mult, regen: b.regen,
      });
    }
  }
}
