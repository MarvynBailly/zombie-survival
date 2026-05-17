'use strict';

// ---------- Garden (B·02) ----------
// Player-tilled crop plots. Press T while aiming at a tile to till (with hoe
// in inventory), plant (with a seed), water (with a bucket), or harvest a
// ripe crop. The composite routing lives in gardenInputT().
//
// State lives on Game.gardenPlots — an array of:
//   { id, x, y, plantedDay, crop, lastWateredDay, harvested, wateredDays }
// where x/y are TILE_SIZE-snapped world coords (top-left of the plot tile).
//
// Growth is in whole in-game days. A plot is ripe after 3 day-rollovers since
// `plantedDay`, AND only if it was watered on at least 2 of those days.
// `wateredDays` is a Set-like counter that increments on the day rollover
// when (`lastWateredDay === Game.time.day - 1` OR it rained yesterday).

// Crop catalogue. Each crop maps a seed item id → harvest item id and the
// fruit-indicator tint drawn on the ripe plot.
const GARDEN_CROPS = {
  tomato: { seed: 'seed_tomato', yield: 'tomato', fruit: '#d24b35' },
  chili:  { seed: 'seed_chili',  yield: 'chili',  fruit: '#a8252a' },
  poppy:  { seed: 'seed_poppy',  yield: 'poppy',  fruit: '#7a3aa8' },
};
const SEED_TO_CROP = { seed_tomato: 'tomato', seed_chili: 'chili', seed_poppy: 'poppy' };

const GARDEN_GROW_DAYS    = 3;
const GARDEN_MIN_WATERED  = 2;
const GARDEN_PLOT_RADIUS  = 40;   // T-press search radius (one tile)

let __gardenPlotId = 1;

// ---------- Lifecycle ----------
function initGarden() {
  Game.gardenPlots = [];
  __gardenPlotId = 1;
}

// Called from the main tick. The heavy lifting (per-day plot bookkeeping)
// happens in onGardenDayRollover; this is reserved for any future per-frame
// effects (sprinkler dribble particles, etc.) and currently is a no-op.
function updateGarden(_dt) {
  if (!Game.gardenPlots) return;
}

// Called from advanceDayPhase when newPhase === 'day' (just after the day
// counter is bumped). If it's raining today, all plots count as watered
// without a bucket trip.
function onGardenDayRollover() {
  if (!Game.gardenPlots) return;
  const day = Game.time.day;
  const rained = typeof isRaining === 'function' && isRaining();
  for (const plot of Game.gardenPlots) {
    if (!plot.crop || plot.harvested) continue;
    // A plot is "watered this day" if the player bucketed it on the previous
    // game day OR it's raining at dawn. Either bumps the wateredDays counter
    // exactly once per day (lastCreditDay guards against double-credit).
    const playerWatered = plot.lastWateredDay === day - 1;
    if ((playerWatered || rained) && plot.lastCreditDay !== day) {
      plot.wateredDays = (plot.wateredDays | 0) + 1;
      plot.lastCreditDay = day;
    }
  }
}

// ---------- Lookup helpers ----------
// Snap a world point to the plot grid (40px tiles). Plot coords are tile
// top-left so equality checks are stable.
function _gardenSnap(worldX, worldY) {
  const tx = Math.floor(worldX / TILE_SIZE) * TILE_SIZE;
  const ty = Math.floor(worldY / TILE_SIZE) * TILE_SIZE;
  return { x: tx, y: ty };
}

function plotAt(worldX, worldY) {
  if (!Game.gardenPlots) return null;
  const { x, y } = _gardenSnap(worldX, worldY);
  for (const p of Game.gardenPlots) if (p.x === x && p.y === y) return p;
  return null;
}

// Days elapsed since planting (0 on planting day, 3 means three rollovers).
function _plotAge(plot) {
  if (!plot.plantedDay) return 0;
  return Game.time.day - plot.plantedDay;
}

function _isRipe(plot) {
  if (!plot.crop || plot.harvested) return false;
  return _plotAge(plot) >= GARDEN_GROW_DAYS
      && (plot.wateredDays | 0) >= GARDEN_MIN_WATERED;
}

// ---------- Actions ----------
function tillAt(worldX, worldY, player) {
  if (!hasItem(player.inventory, 'hoe', 1)) {
    setNotice('Need a hoe to till', 1.2);
    return false;
  }
  // Must be unblocked grass-ish terrain and not already plotted.
  if (typeof inObstacle === 'function' && inObstacle(worldX, worldY, 6)) {
    setNotice("Can't till there", 1.2); return false;
  }
  if (typeof World !== 'undefined' && World.isBlockedTerrainAt
      && World.isBlockedTerrainAt(worldX, worldY)) {
    setNotice('Not arable terrain', 1.2); return false;
  }
  if (plotAt(worldX, worldY)) { setNotice('Already tilled', 1.0); return false; }
  const { x, y } = _gardenSnap(worldX, worldY);
  Game.gardenPlots.push({
    id: __gardenPlotId++, x, y,
    plantedDay: null, crop: null,
    lastWateredDay: -1, lastCreditDay: -1,
    wateredDays: 0, harvested: false,
  });
  setNotice('Plot tilled', 1.0);
  if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx.click) Audio.sfx.click();
  return true;
}

function plantAt(worldX, worldY, player, seedItemId) {
  const plot = plotAt(worldX, worldY);
  if (!plot) { setNotice('Need a tilled plot', 1.0); return false; }
  if (plot.crop && !plot.harvested) { setNotice('Already planted', 1.0); return false; }
  const crop = SEED_TO_CROP[seedItemId];
  if (!crop) return false;
  if (!hasItem(player.inventory, seedItemId, 1)) return false;
  removeItem(player.inventory, seedItemId, 1);
  plot.crop = crop;
  plot.plantedDay = Game.time.day;
  plot.lastWateredDay = -1;
  plot.lastCreditDay = -1;
  plot.wateredDays = 0;
  plot.harvested = false;
  setNotice(`Planted ${crop}`, 1.2);
  if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx.pickup) Audio.sfx.pickup();
  return true;
}

function waterAt(worldX, worldY, player) {
  if (!hasItem(player.inventory, 'bucket', 1)) {
    setNotice('Need a bucket to water', 1.2);
    return false;
  }
  const plot = plotAt(worldX, worldY);
  if (!plot) return false;
  if (!plot.crop || plot.harvested) { setNotice('Nothing to water', 1.0); return false; }
  if (plot.lastWateredDay === Game.time.day) {
    setNotice('Already watered today', 1.0); return false;
  }
  plot.lastWateredDay = Game.time.day;
  // Splash particles so the player gets feedback even without sound.
  if (Game.particles) {
    for (let i = 0; i < 8; i++) {
      Game.particles.push({
        x: plot.x + TILE_SIZE / 2 + rand(-10, 10),
        y: plot.y + TILE_SIZE / 2 + rand(-10, 10),
        vx: rand(-60, 60), vy: rand(-160, -40),
        life: rand(0.3, 0.6), color: '#5fb6e8', r: rand(1.5, 3),
      });
    }
  }
  setNotice('Watered', 0.8);
  if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx.click) Audio.sfx.click();
  return true;
}

function harvestAt(worldX, worldY, player) {
  const plot = plotAt(worldX, worldY);
  if (!plot || !_isRipe(plot)) return false;
  const def = GARDEN_CROPS[plot.crop];
  if (!def) return false;
  const left = addItem(player.inventory, def.yield, 1);
  if (left > 0) { setNotice('Inventory full', 1.2); return false; }
  setNotice(`+1 ${def.yield}`, 1.2);
  plot.harvested = true;
  plot.crop = null;
  plot.plantedDay = null;
  plot.wateredDays = 0;
  plot.lastWateredDay = -1;
  plot.lastCreditDay = -1;
  if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx.pickup) Audio.sfx.pickup();
  return true;
}

// Composite T-key handler. Resolves the right action by context + inventory.
// `mouseWorld` is { x, y } in world coords (input.wx / input.wy from game.js).
function gardenInputT(player, mouseWorld) {
  if (!player || player.dead || !mouseWorld) return false;
  // Restrict the targeted point to a reasonable arm-reach from the player so
  // you can't till plots across the map.
  const dx = mouseWorld.x - player.x, dy = mouseWorld.y - player.y;
  const reach = 80;
  let tx = mouseWorld.x, ty = mouseWorld.y;
  const dist = Math.hypot(dx, dy);
  if (dist > reach) { tx = player.x + dx / dist * reach; ty = player.y + dy / dist * reach; }

  const plot = plotAt(tx, ty);
  // Ripe plot → harvest first (highest-priority outcome).
  if (plot && _isRipe(plot)) return harvestAt(tx, ty, player);
  // Empty (or just-harvested) plot + a seed in inv → plant.
  if (plot && (!plot.crop || plot.harvested)) {
    const seedId = _firstSeed(player.inventory);
    if (seedId) return plantAt(tx, ty, player, seedId);
  }
  // Planted but unripe plot + bucket → water.
  if (plot && plot.crop && !plot.harvested) {
    if (hasItem(player.inventory, 'bucket', 1)) return waterAt(tx, ty, player);
    setNotice('Crop is growing', 0.8);
    return false;
  }
  // No plot here → till (if the player has a hoe).
  if (hasItem(player.inventory, 'hoe', 1)) return tillAt(tx, ty, player);
  setNotice('Need hoe / seed / bucket', 1.2);
  return false;
}

function _firstSeed(inv) {
  if (!inv || !inv.slots) return null;
  for (const s of inv.slots) if (s && SEED_TO_CROP[s.id]) return s.id;
  return null;
}

// ---------- Render ----------
// Drawn in world space (camera already translated by the caller). Stages:
//   empty plot      — brown tilled square with cross-hatch furrows
//   sprout (age 1)  — small green pixel cluster
//   growing (age 2) — leafy bush
//   ripe (age 3+, watered ≥2) — colored fruit dots
//   under-watered ripe — yellow wilted leaves (still harvestable visually
//                       only after watering — actually unharvestable)
function drawGardenPlots(ctx, camX, camY) {
  const plots = Game.gardenPlots;
  if (!plots || plots.length === 0) return;
  const vL = camX - 60, vR = camX + VIEW_W + 60;
  const vT = camY - 60, vB = camY + VIEW_H + 60;
  for (const plot of plots) {
    if (plot.x + TILE_SIZE < vL || plot.x > vR) continue;
    if (plot.y + TILE_SIZE < vT || plot.y > vB) continue;
    _drawPlot(ctx, plot);
  }
}

function _drawPlot(ctx, plot) {
  const x = plot.x, y = plot.y, s = TILE_SIZE;
  // Tilled earth base — slightly darker than grass, with two tone bands.
  ctx.fillStyle = '#5a3e22';
  ctx.fillRect(x, y, s, s);
  ctx.fillStyle = '#6e4c2a';
  ctx.fillRect(x + 2, y + 2, s - 4, s - 4);
  // Cross-hatch furrows so the player can read "this is tilled".
  ctx.strokeStyle = '#3e2a16';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 8; i < s; i += 8) {
    ctx.moveTo(x + 2, y + i); ctx.lineTo(x + s - 2, y + i);
  }
  ctx.stroke();
  // Soaked tint if watered today.
  if (plot.lastWateredDay === Game.time.day) {
    ctx.fillStyle = 'rgba(40,60,120,0.18)';
    ctx.fillRect(x, y, s, s);
  }

  if (!plot.crop || plot.harvested) return;
  const age = _plotAge(plot);
  const def = GARDEN_CROPS[plot.crop];
  const cx = x + s / 2, cy = y + s / 2;
  if (age <= 0) {
    // Sprout — three small green pixels.
    ctx.fillStyle = '#8ec547';
    ctx.fillRect(cx - 1, cy - 1, 2, 2);
    ctx.fillRect(cx - 4, cy + 2, 2, 2);
    ctx.fillRect(cx + 2, cy + 1, 2, 2);
  } else if (age === 1) {
    // Growing — leafy bush.
    ctx.fillStyle = '#5d8f2a';
    ctx.beginPath(); ctx.arc(cx - 4, cy, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 4, cy + 1, 4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8ec547';
    ctx.beginPath(); ctx.arc(cx, cy - 3, 4, 0, Math.PI * 2); ctx.fill();
  } else {
    // Day 2+ — bigger bush + fruit if (and only if) the plot is actually ripe.
    ctx.fillStyle = '#4d7a22';
    ctx.beginPath(); ctx.arc(cx - 6, cy + 2, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 6, cy + 3, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#7ab23a';
    ctx.beginPath(); ctx.arc(cx, cy - 4, 6, 0, Math.PI * 2); ctx.fill();
    if (_isRipe(plot)) {
      ctx.fillStyle = def.fruit;
      ctx.beginPath(); ctx.arc(cx - 4, cy + 1, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 5, cy + 2, 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 1, cy - 4, 2.4, 0, Math.PI * 2); ctx.fill();
      // Ripe halo — faint yellow ring so it pops at a glance.
      ctx.strokeStyle = 'rgba(231,196,84,0.65)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 1, y + 1, s - 2, s - 2);
    } else if (age >= GARDEN_GROW_DAYS) {
      // Mature but under-watered — wilted ochre dots, no fruit.
      ctx.fillStyle = '#b08b3a';
      ctx.beginPath(); ctx.arc(cx - 4, cy + 1, 2, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(cx + 4, cy, 2, 0, Math.PI * 2); ctx.fill();
    }
  }
}

// ---------- Save / Load ----------
function saveGarden() {
  if (!Game.gardenPlots) return null;
  return {
    nextId: __gardenPlotId,
    plots: Game.gardenPlots.map(p => ({
      id: p.id, x: p.x, y: p.y,
      plantedDay: p.plantedDay, crop: p.crop,
      lastWateredDay: p.lastWateredDay,
      lastCreditDay: p.lastCreditDay,
      wateredDays: p.wateredDays | 0,
      harvested: !!p.harvested,
    })),
  };
}
function loadGarden(data) {
  initGarden();
  if (!data || !Array.isArray(data.plots)) return;
  __gardenPlotId = data.nextId | 0 || 1;
  for (const p of data.plots) {
    Game.gardenPlots.push({
      id: p.id, x: p.x, y: p.y,
      plantedDay: p.plantedDay != null ? p.plantedDay : null,
      crop: p.crop || null,
      lastWateredDay: p.lastWateredDay != null ? p.lastWateredDay : -1,
      lastCreditDay:  p.lastCreditDay  != null ? p.lastCreditDay  : -1,
      wateredDays: p.wateredDays | 0,
      harvested: !!p.harvested,
    });
  }
}
