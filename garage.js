'use strict';

// ---------- Garage (B·03) ----------
// A 4×3 build prefab with a roof overlay. A vehicle parked inside slowly
// refuels + auto-repairs whenever the garage center sits inside a powered
// radius (`isPowered` from power.js). Composes vehicles + power.
//
// State on Game.garages: { id, x, y, w, h, cx, cy, hp, maxHp, doorOpen, t }.
// (x, y) is the top-left of the 4×3 zone. Perimeter walls are pushed into
// Game.walls at placement and behave as normal walls — the garage record is
// just a zone tracker for `vehicleInGarage(v)`.
//
// Layout — 8 walls, south side open:
//   #  #  #  #     north row (4 walls)
//   #        #     interior empty
//   #        #     interior empty
//                  south open (drive-in)

const GARAGE_WIDTH_TILES  = 4;
const GARAGE_HEIGHT_TILES = 3;
const GARAGE_HP            = 600;
const GARAGE_TICK_SECONDS  = 5;     // refuel/repair cadence while powered
const GARAGE_REFUEL_PER_TICK = 5;   // +fuel per cadence
const GARAGE_REPAIR_PER_TICK = 2;   // +hp per cadence

// Visual constants — concrete floor and roof tones.
const GARAGE_FLOOR_BASE   = '#5e636a';
const GARAGE_FLOOR_GRID   = '#4a4f55';
const GARAGE_FLOOR_GRIME  = '#3a3e44';
const GARAGE_ROOF_COLOR   = '#2a2d33';
const GARAGE_ROOF_TRIM    = '#1a1c20';
const GARAGE_ROOF_ALPHA_OUT = 0.85;  // player outside — roof obscures interior
const GARAGE_ROOF_ALPHA_IN  = 0.15;  // player inside — reveal

let __garageIdSeq = 1;

// ---------- Lifecycle ----------
function initGarages() {
  Game.garages = [];
  __garageIdSeq = 1;
}

// ---------- Geometry helpers ----------
function garageWidthPx()  { return GARAGE_WIDTH_TILES  * WALL_SIZE; }
function garageHeightPx() { return GARAGE_HEIGHT_TILES * WALL_SIZE; }

function makeGarageRecord(x, y) {
  return {
    id: __garageIdSeq++,
    x, y,
    w: garageWidthPx(), h: garageHeightPx(),
    cx: x + garageWidthPx() * 0.5,
    cy: y + garageHeightPx() * 0.5,
    hp: GARAGE_HP, maxHp: GARAGE_HP,
    doorOpen: false,
    t: 0,            // accumulator for the 5-second refuel cadence
  };
}

// Snap a desired CENTER to the wall grid (matches placeGenerator/snapPrefabOrigin).
function snapGarageOrigin(worldX, worldY) {
  const wpx = garageWidthPx(), hpx = garageHeightPx();
  const gx = Math.round((worldX - wpx / 2) / WALL_SIZE) * WALL_SIZE;
  const gy = Math.round((worldY - hpx / 2) / WALL_SIZE) * WALL_SIZE;
  return {
    x: clamp(gx, 0, WORLD_W - wpx),
    y: clamp(gy, 0, WORLD_H - hpx),
  };
}

// 8 perimeter wall rects: north row (4) + east/west middle (2 + 2).
function garagePerimeterRects(x, y) {
  const rects = [];
  for (let dx = 0; dx < GARAGE_WIDTH_TILES; dx++) {
    rects.push({ x: x + dx * WALL_SIZE, y: y, w: WALL_SIZE, h: WALL_SIZE });
  }
  for (let dy = 1; dy < GARAGE_HEIGHT_TILES; dy++) {
    rects.push({ x: x,                                    y: y + dy * WALL_SIZE, w: WALL_SIZE, h: WALL_SIZE });
    rects.push({ x: x + (GARAGE_WIDTH_TILES - 1) * WALL_SIZE, y: y + dy * WALL_SIZE, w: WALL_SIZE, h: WALL_SIZE });
  }
  return rects;
}

// Cheap rect-overlap check against an existing axis-aligned rect.
function __rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x &&
         a.y < b.y + b.h && a.y + a.h > b.y;
}

// Is the perimeter clear of walls / obstacles / player? Garages don't care
// about overlapping vehicles — that's the whole point (you park inside).
function isGaragePlacementValid(x, y) {
  const wpx = garageWidthPx(), hpx = garageHeightPx();
  if (x < 0 || y < 0 || x + wpx > WORLD_W || y + hpx > WORLD_H) return false;
  const rects = garagePerimeterRects(x, y);
  // Walls
  for (const w of Game.walls) {
    for (const r of rects) if (__rectsOverlap(r, w)) return false;
  }
  // World obstacles
  let blocked = false;
  if (typeof World !== 'undefined' && World.forEachActiveObstacle) {
    World.forEachActiveObstacle(x + wpx / 2, y + hpx / 2, (o) => {
      if (blocked || o.walkable) return;
      for (const r of rects) if (__rectsOverlap(r, o)) { blocked = true; return; }
    });
  }
  if (blocked) return false;
  // Player can't be sitting on a wall tile when we drop it.
  const p = Game.player;
  if (p && !p.dead) {
    for (const r of rects) {
      if (p.x + p.r > r.x && p.x - p.r < r.x + r.w &&
          p.y + p.r > r.y && p.y - p.r < r.y + r.h) return false;
    }
  }
  // Another garage already occupies the same footprint.
  if (Game.garages) {
    for (const g of Game.garages) {
      if (__rectsOverlap({ x, y, w: wpx, h: hpx }, g)) return false;
    }
  }
  return true;
}

// ---------- Placement ----------
// (x, y) is a desired CENTER (player's facing point, like placeGenerator).
// Pushes 8 walls + a record. Returns the new garage or null on failure.
function placeGarageKit(x, y, player) {
  if (!Game.garages) Game.garages = [];
  const o = snapGarageOrigin(x, y);
  if (!isGaragePlacementValid(o.x, o.y)) {
    setNotice("Can't place garage here", 1.5);
    if (Audio && Audio.sfx && Audio.sfx.empty) Audio.sfx.empty();
    return null;
  }
  // Spawn 8 perimeter walls with standard wall HP; garage record tracks the zone.
  const wallHp = (typeof WALL_HP !== 'undefined' ? WALL_HP : 250);
  for (const r of garagePerimeterRects(o.x, o.y)) {
    Game.walls.push({
      x: r.x, y: r.y, w: r.w, h: r.h,
      hp: wallHp, maxHp: wallHp, material: 'wood', condition: 100,
    });
  }
  const g = makeGarageRecord(o.x, o.y);
  Game.garages.push(g);
  if (typeof NAV !== 'undefined' && NAV.markDirty) NAV.markDirty();
  if (Audio && Audio.sfx && Audio.sfx.pickup) Audio.sfx.pickup();
  setNotice('Garage placed — park a vehicle inside', 2.5);
  return g;
}

// ---------- Queries ----------
function vehicleInGarage(vehicle) {
  if (!vehicle || !Game.garages || Game.garages.length === 0) return null;
  for (const g of Game.garages) {
    if (vehicle.x >= g.x && vehicle.x <= g.x + g.w &&
        vehicle.y >= g.y && vehicle.y <= g.y + g.h) return g;
  }
  return null;
}

function garageIsPowered(g) {
  if (!g) return false;
  if (typeof isPowered !== 'function') return false;
  return isPowered(g.cx, g.cy);
}

function playerInGarage(g, player) {
  const p = player || Game.player;
  if (!g || !p) return false;
  return p.x >= g.x && p.x <= g.x + g.w &&
         p.y >= g.y && p.y <= g.y + g.h;
}

// 0.85 from outside (roof obscures interior); 0.15 from inside (reveal).
function roofAlphaForPlayer(g, player) {
  return playerInGarage(g, player) ? GARAGE_ROOF_ALPHA_IN : GARAGE_ROOF_ALPHA_OUT;
}

// ---------- Tick ----------
// Every ~5 seconds: for every garage whose center sits in a powered radius,
// look for a parked vehicle inside and apply +fuel / +hp.
function updateGarages(dt) {
  const list = Game.garages;
  if (!list || list.length === 0) return;
  for (let i = 0; i < list.length; i++) {
    const g = list[i];
    g.t += dt;
    if (g.t < GARAGE_TICK_SECONDS) continue;
    g.t -= GARAGE_TICK_SECONDS;
    if (!garageIsPowered(g)) continue;
    if (!Game.vehicles || Game.vehicles.length === 0) continue;
    for (const v of Game.vehicles) {
      if (vehicleInGarage(v) !== g) continue;
      const def = (typeof VEHICLE_KINDS !== 'undefined') ? VEHICLE_KINDS[v.kind] : null;
      const maxFuel = (def && def.maxFuel) || v.maxFuel || 80;
      if (v.fuel < maxFuel) v.fuel = Math.min(maxFuel, v.fuel + GARAGE_REFUEL_PER_TICK);
      // Repair tick — clears the broken flag past 50% to match repairVehicle().
      if (v.hp < v.maxHp) {
        v.hp = Math.min(v.maxHp, v.hp + GARAGE_REPAIR_PER_TICK);
        if (v.broken && v.hp >= v.maxHp * 0.5) v.broken = false;
      }
    }
  }
}

// ---------- Render ----------
// Floor pass — drawn UNDER walls so concrete replaces grass. Call BEFORE walls.
function drawGaragesFloor(ctx, camX, camY) {
  const list = Game.garages;
  if (!list || list.length === 0) return;
  const vL = camX - 60, vR = camX + VIEW_W + 60;
  const vT = camY - 60, vB = camY + VIEW_H + 60;
  for (let i = 0; i < list.length; i++) {
    const g = list[i];
    if (g.x + g.w < vL || g.x > vR || g.y + g.h < vT || g.y > vB) continue;
    drawGarageFloor(ctx, g);
  }
}

function drawGarageFloor(ctx, g) {
  // Solid concrete base.
  ctx.fillStyle = GARAGE_FLOOR_BASE;
  ctx.fillRect(g.x, g.y, g.w, g.h);
  // Tile grid lines.
  ctx.fillStyle = GARAGE_FLOOR_GRID;
  for (let dx = 1; dx < GARAGE_WIDTH_TILES; dx++) {
    ctx.fillRect(g.x + dx * WALL_SIZE - 1, g.y + 2, 1, g.h - 4);
  }
  for (let dy = 1; dy < GARAGE_HEIGHT_TILES; dy++) {
    ctx.fillRect(g.x + 2, g.y + dy * WALL_SIZE - 1, g.w - 4, 1);
  }
  // Oil-stain centerpiece — interior reads as "vehicle bay" even when empty.
  ctx.fillStyle = GARAGE_FLOOR_GRIME;
  ctx.fillRect(g.cx - 14, g.cy - 6, 24, 10);
  ctx.fillRect(g.cx - 4, g.cy - 10, 12, 6);
}

// Roof pass — drawn ABOVE walls + vehicles. Call AFTER the player layer.
// Near-opaque from outside; near-transparent when the player is inside.
function drawGaragesRoof(ctx, camX, camY) {
  const list = Game.garages;
  if (!list || list.length === 0) return;
  const vL = camX - 60, vR = camX + VIEW_W + 60;
  const vT = camY - 60, vB = camY + VIEW_H + 60;
  for (let i = 0; i < list.length; i++) {
    const g = list[i];
    if (g.x + g.w < vL || g.x > vR || g.y + g.h < vT || g.y > vB) continue;
    drawGarageRoof(ctx, g);
  }
}

function drawGarageRoof(ctx, g) {
  const a = roofAlphaForPlayer(g, Game.player);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.fillStyle = GARAGE_ROOF_COLOR;
  ctx.fillRect(g.x, g.y, g.w, g.h);
  // Roof beams — three horizontal bands of the lighter trim color.
  ctx.fillStyle = GARAGE_ROOF_TRIM;
  for (let k = 1; k < GARAGE_HEIGHT_TILES; k++) {
    ctx.fillRect(g.x, g.y + k * WALL_SIZE - 1, g.w, 2);
  }
  // South-edge eave hint so the player can read where the roof opens.
  ctx.fillStyle = GARAGE_ROOF_TRIM;
  ctx.fillRect(g.x, g.y + g.h - 3, g.w, 3);
  ctx.restore();
}

// Single-call shim. The split passes (drawGaragesFloor / drawGaragesRoof) are
// the recommended path — see integration.md.
function drawGarages(ctx, camX, camY) {
  drawGaragesFloor(ctx, camX, camY);
  drawGaragesRoof(ctx, camX, camY);
}

// ---------- Save / Load ----------
function saveGarages() {
  if (!Game.garages) return [];
  return Game.garages.map(g => ({
    x: g.x, y: g.y,
    hp: g.hp, maxHp: g.maxHp,
    doorOpen: !!g.doorOpen,
  }));
}

function loadGarages(data) {
  initGarages();
  if (!Array.isArray(data)) return;
  for (const d of data) {
    if (!d || typeof d.x !== 'number' || typeof d.y !== 'number') continue;
    const g = makeGarageRecord(d.x, d.y);
    if (typeof d.hp === 'number') g.hp = d.hp;
    if (typeof d.maxHp === 'number') g.maxHp = d.maxHp;
    g.doorOpen = !!d.doorOpen;
    Game.garages.push(g);
  }
}
