'use strict';

// ---------- Walls: Tier + Blueprints + Decay ----------
// Extends the existing player-placed wall system without replacing it.
//
// State extensions on each `wall` entity in Game.walls:
//   material   — 'wood' | 'brick' | 'steel'  (default 'wood')
//   condition  — 0..100 surface integrity    (default 100)
// The base wall record (x, y, w, h, hp, maxHp) stays exactly as game.js
// writes it; this module never replaces fields, only annotates.
//
// Three cards live here because they all read/write the wall record:
//   A·02 TIER UP    — upgrade wood -> brick -> steel for scrap (1s hold).
//   A·03 BLUEPRINTS — capture a 16-tile box of walls to a meta-saved
//                     template; recall later to ghost-project + build.
//   D·02 DECAY      — once per in-game day, every wall loses 1–3% condition
//                     (×2 in rain). At condition<=0 a wall becomes "rubble"
//                     with HP=1.  Repair with R near wall (1 scrap/20 cond).
//
// Foundation deps:
//   weatherDecayMult()   from weather.js (1.0 clear, 2.0 rain)
//   Game.weather         from weather.js (may be null pre-init)
//   removeItem/itemCount/hasItem  from items.js (scrap currency)
//   setNotice/Audio      from ui.js / persistence.js
//   rand/randi/clamp     from world.js (globals)

// ---------- Material table ----------
// All tunables live here so constants.js can hoist the table later
// without touching code that uses it.
const WALL_TIERS = {
  wood:  { maxHp: 200,  color: '#8a5a2a', shade: '#5a3a1a', plank: '#a06a3a' },
  brick: { maxHp: 600,  color: '#b34d2a', shade: '#7a321a', plank: '#d36b40' },
  steel: { maxHp: 1500, color: '#5e6a78', shade: '#3a414c', plank: '#8a98a8' },
};
const WALL_UPGRADE_COST = {
  brick: 5,   // scrap to upgrade wood -> brick
  steel: 10,  // scrap to upgrade brick -> steel
};
const WALL_UPGRADE_NEXT = { wood: 'brick', brick: 'steel', steel: null };
const WALL_UPGRADE_HOLD = 1.0;      // seconds of hold-U to commit upgrade
const WALL_REPAIR_TICK = 0.5;       // seconds per repair tick
const WALL_REPAIR_PER_SCRAP = 20;   // condition restored per scrap spent
const WALL_INTERACT_R = 56;         // pixels — adjacency for U / R
const WALL_DECAY_MIN = 1;
const WALL_DECAY_MAX = 3;
const WALL_CRACK_THRESHOLD = 50;    // visual cracks below this condition

// Blueprint persistence
const BLUEPRINT_META_KEY = 'zombie-survival:blueprints';
const BLUEPRINT_CAP = 6;
const BLUEPRINT_TILE_SPAN = 16;     // capture box is 16×16 tiles

function wallMaxHp(material) {
  const t = WALL_TIERS[material] || WALL_TIERS.wood;
  return t.maxHp;
}
function wallReflectsBullets(wall) {
  return !!(wall && wall.material === 'steel' && wall.condition > 0);
}
function isWallRubble(wall) {
  return !!(wall && wall.condition <= 0);
}

// ---------- Migration ----------
// Called from resetRun (after Game.walls = []) and after loadSavedGame so any
// resurrected wall picks up the new fields. Existing walls without material
// default to wood at full condition; HP is preserved as-is.
function initWallSystem() {
  if (!Game.walls) Game.walls = [];
  for (const w of Game.walls) migrateWall(w);
  // Per-run UI state. These are NOT persisted — they reset every load.
  Game.wallUpgrade = null;   // { wall, t } while holding U
  Game.wallRepair = null;    // { wall, t } while holding R
  Game.blueprintMode = null; // null | 'capture' | 'paste'
  Game.blueprintDrag = null; // { x0, y0, x1, y1 } during capture drag
  Game.blueprintGhost = null;// { tiles: [{ x, y, material }], anchorId }
  Game.blueprintActive = null; // currently-selected blueprint id for paste
  if (!Game.blueprints) Game.blueprints = loadBlueprints();
}
function migrateWall(w) {
  if (!w.material) w.material = 'wood';
  if (typeof w.condition !== 'number') w.condition = 100;
  // If the save predates the tier system the HP cap matches the legacy
  // WALL_HP — push it up to the wood table value so the overlay/labels read
  // correctly. Don't *increase* current hp; just bump the ceiling.
  const cap = wallMaxHp(w.material);
  if (!w.maxHp || w.maxHp < cap) w.maxHp = cap;
  if (w.hp > w.maxHp) w.hp = w.maxHp;
}

// ---------- Per-frame tick ----------
// Drives the hold-to-upgrade and hold-to-repair timers. The integrator sets
// Game.wallUpgrade / Game.wallRepair (via tryUpgradeWall / tryRepairWall) and
// we tick them down to 0 here. When the key releases the integrator clears
// the slot so a fresh hold restarts cleanly.
function updateWallSystem(dt) {
  // ---- Upgrade hold ----
  const up = Game.wallUpgrade;
  if (up && up.wall && Game.walls.indexOf(up.wall) >= 0) {
    up.t += dt;
    if (up.t >= WALL_UPGRADE_HOLD) {
      commitWallUpgrade(up.wall, Game.player);
      Game.wallUpgrade = null;
    }
  }
  // ---- Repair hold ----
  const rp = Game.wallRepair;
  if (rp && rp.wall && Game.walls.indexOf(rp.wall) >= 0) {
    rp.t += dt;
    while (rp.t >= WALL_REPAIR_TICK) {
      rp.t -= WALL_REPAIR_TICK;
      if (!applyRepairTick(rp.wall, Game.player)) {
        Game.wallRepair = null;
        break;
      }
    }
  }
}

// ---------- Daily decay tick ----------
// Called from advanceDayPhase on the dawn->day rollover. Every wall loses a
// small random chunk of condition (×2 if it's currently raining). When a
// wall crosses condition<=0 it becomes rubble: HP clamps to 1 so the next
// hit kills it but it still blocks pathing in the meantime.
function onWallDayRollover() {
  if (!Game.walls || Game.walls.length === 0) return;
  const mult = (typeof weatherDecayMult === 'function') ? weatherDecayMult() : 1;
  for (const w of Game.walls) {
    if (w.condition <= 0) continue;
    const amount = (WALL_DECAY_MIN + Math.random() * (WALL_DECAY_MAX - WALL_DECAY_MIN)) * mult;
    w.condition = Math.max(0, w.condition - amount);
    if (w.condition <= 0) {
      // Rubble — clamp HP to a single hit's worth. Don't auto-destroy; let
      // a zombie or stray bullet finish it so the player notices.
      w.hp = Math.min(w.hp, 1);
    }
  }
}

// ---------- Upgrade flow ----------
// Returns true if a new upgrade hold was started (or it's already in
// progress on the same wall). The integrator calls this on U-key down near
// a wall.  Updates Game.wallUpgrade; updateWallSystem ticks the timer.
function tryUpgradeWall(wall, player) {
  if (!wall || !player) return false;
  const next = WALL_UPGRADE_NEXT[wall.material];
  if (!next) {
    setNotice('Wall is already steel', 1.2);
    return false;
  }
  if (isWallRubble(wall)) {
    setNotice('Repair the wall first', 1.2);
    return false;
  }
  const cost = WALL_UPGRADE_COST[next] | 0;
  if (!hasItem(player.inventory, 'scrap', cost)) {
    setNotice(`Need ${cost} scrap to upgrade`, 1.2);
    Audio.sfx.empty();
    return false;
  }
  if (!wallWithinReach(wall, player)) return false;
  // Already holding on the same wall — keep the timer accumulating.
  if (Game.wallUpgrade && Game.wallUpgrade.wall === wall) return true;
  Game.wallUpgrade = { wall, t: 0 };
  return true;
}
function commitWallUpgrade(wall, player) {
  const next = WALL_UPGRADE_NEXT[wall.material];
  if (!next) return;
  const cost = WALL_UPGRADE_COST[next] | 0;
  if (removeItem(player.inventory, 'scrap', cost) < cost) {
    // Scrap was burned for another use mid-hold — bail out gracefully.
    setNotice('Not enough scrap', 1.2);
    return;
  }
  wall.material = next;
  wall.maxHp = wallMaxHp(next);
  wall.hp = wall.maxHp;
  wall.condition = 100;
  // Particle puff in the wall's tier color.
  const tier = WALL_TIERS[next];
  for (let i = 0; i < 10; i++) {
    Game.particles.push({
      x: wall.x + rand(0, wall.w), y: wall.y + rand(0, wall.h),
      vx: rand(-120, 120), vy: rand(-160, -20),
      life: rand(0.4, 0.7), color: i % 2 ? tier.color : tier.plank, r: rand(2, 4),
    });
  }
  setNotice(`Wall upgraded to ${next.toUpperCase()}`, 1.5);
  Audio.sfx.pickup();
}

// ---------- Repair flow ----------
function tryRepairWall(wall, player, dt) {
  if (!wall || !player) return false;
  if (wall.condition >= 100) {
    setNotice('Wall is intact', 0.8);
    return false;
  }
  if (!wallWithinReach(wall, player)) return false;
  if (!hasItem(player.inventory, 'scrap', 1)) {
    setNotice('Need scrap to repair', 1.0);
    Audio.sfx.empty();
    return false;
  }
  if (!Game.wallRepair || Game.wallRepair.wall !== wall) {
    Game.wallRepair = { wall, t: 0 };
  }
  // Tick accumulates inside updateWallSystem (called every frame). dt arg
  // kept on the signature for API parity; callers may pass dt=0.
  return true;
}
function applyRepairTick(wall, player) {
  if (wall.condition >= 100) return false;
  if (removeItem(player.inventory, 'scrap', 1) < 1) {
    setNotice('Out of scrap', 1.0);
    Audio.sfx.empty();
    return false;
  }
  wall.condition = Math.min(100, wall.condition + WALL_REPAIR_PER_SCRAP);
  // Repair also tops up HP proportionally so a battered wood wall doesn't
  // stay near-dead just because its condition rose.
  wall.hp = Math.min(wall.maxHp, wall.hp + wall.maxHp * (WALL_REPAIR_PER_SCRAP / 100));
  // Small spark, no audio — repair is meant to be quiet.
  for (let i = 0; i < 4; i++) {
    Game.particles.push({
      x: wall.x + rand(0, wall.w), y: wall.y + rand(0, wall.h),
      vx: rand(-40, 40), vy: rand(-80, -10),
      life: rand(0.2, 0.4), color: '#caa760', r: rand(1, 2),
    });
  }
  return true;
}

function wallWithinReach(wall, player) {
  const cx = wall.x + wall.w / 2, cy = wall.y + wall.h / 2;
  const d = Math.hypot(player.x - cx, player.y - cy);
  if (d > WALL_INTERACT_R) {
    setNotice('Move closer to the wall', 0.8);
    return false;
  }
  return true;
}

// ---------- Find-wall helper ----------
// Returns the closest wall whose center is within radius of (x,y), or null.
function findWallNear(x, y, radius) {
  if (!Game.walls) return null;
  let best = null, bestD = radius * radius;
  for (const w of Game.walls) {
    const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
    const dx = cx - x, dy = cy - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = w; }
  }
  return best;
}

// ---------- Draw overlay ----------
// Returns TRUE if this function fully drew the wall (caller skips the
// default sprite). We short-circuit only when the wall is non-wood (so the
// stock wood draw is preserved unchanged) OR when it's rubble / cracked,
// since those visuals need an override.
function drawWallOverlay(ctx, wall, screenX, screenY, size) {
  if (!wall) return false;
  const w = (size && size.w) || wall.w;
  const h = (size && size.h) || wall.h;
  const x = screenX, y = screenY;
  const mat = wall.material || 'wood';
  const tier = WALL_TIERS[mat] || WALL_TIERS.wood;
  // Rubble — slumped grey heap, ignores tier color.
  if (wall.condition <= 0) {
    ctx.fillStyle = '#3a3530';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#5a544c';
    for (let i = 0; i < 5; i++) {
      const px = x + 4 + ((i * 7) % (w - 8));
      const py = y + h - 10 + (i % 2) * 3;
      ctx.fillRect(px, py, 6, 5);
    }
    ctx.strokeStyle = '#1a1612';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    return true;
  }
  // Wood — let the stock sprite handle it for visual continuity unless it's
  // cracked, in which case we override to add the crack overlay.
  if (mat === 'wood' && wall.condition >= WALL_CRACK_THRESHOLD) {
    return false;
  }
  // Tier draw: solid base + a couple of plank/seam lines for texture.
  ctx.fillStyle = tier.shade;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = tier.color;
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.fillStyle = tier.plank;
  if (mat === 'brick') {
    // Two staggered brick rows.
    for (let row = 0; row < 3; row++) {
      const ry = y + 6 + row * 10;
      const offset = (row % 2) * 6;
      for (let bx = 0; bx < w - 6; bx += 12) {
        ctx.fillRect(x + 3 + bx + offset, ry, 10, 4);
      }
    }
  } else if (mat === 'steel') {
    // Steel plates: bolts at corners + a vertical seam.
    ctx.fillRect(x + w / 2 - 1, y + 2, 2, h - 4);
    ctx.fillStyle = '#caa760';
    ctx.fillRect(x + 3, y + 3, 2, 2);
    ctx.fillRect(x + w - 5, y + 3, 2, 2);
    ctx.fillRect(x + 3, y + h - 5, 2, 2);
    ctx.fillRect(x + w - 5, y + h - 5, 2, 2);
  }
  // Crack overlay for any cracked wall (wood handled here too).
  if (wall.condition < WALL_CRACK_THRESHOLD) {
    drawCracks(ctx, x, y, w, h, wall.condition);
  }
  // Border — same hairline the stock draw uses.
  ctx.strokeStyle = '#1a1612';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  return true;
}
function drawCracks(ctx, x, y, w, h, condition) {
  // Two diagonal slashes; alpha scales with how cracked the wall is.
  const alpha = 0.3 + (1 - condition / WALL_CRACK_THRESHOLD) * 0.4;
  ctx.save();
  ctx.strokeStyle = `rgba(15, 12, 10, ${alpha.toFixed(2)})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x + 4, y + 6);
  ctx.lineTo(x + w - 8, y + h - 4);
  ctx.moveTo(x + w - 6, y + 4);
  ctx.lineTo(x + 10, y + h - 8);
  ctx.stroke();
  ctx.restore();
}

// ---------- Blueprint capture ----------
// Mouse handlers wired from the integrator. In capture mode the player
// drags a box over the world; on release we snap that box to the tile grid
// (clamped to BLUEPRINT_TILE_SPAN per side) and snapshot every wall whose
// center sits inside it.
function onBlueprintMouseDown(worldX, worldY) {
  if (Game.blueprintMode !== 'capture') return false;
  Game.blueprintDrag = { x0: worldX, y0: worldY, x1: worldX, y1: worldY };
  return true;
}
function onBlueprintMouseMove(worldX, worldY) {
  if (Game.blueprintMode !== 'capture' || !Game.blueprintDrag) return false;
  Game.blueprintDrag.x1 = worldX;
  Game.blueprintDrag.y1 = worldY;
  return true;
}
function onBlueprintMouseUp(worldX, worldY) {
  if (Game.blueprintMode !== 'capture' || !Game.blueprintDrag) return false;
  Game.blueprintDrag.x1 = worldX;
  Game.blueprintDrag.y1 = worldY;
  const d = Game.blueprintDrag;
  Game.blueprintDrag = null;
  const minX = Math.min(d.x0, d.x1), minY = Math.min(d.y0, d.y1);
  captureBlueprint(Game.player, minX, minY, BLUEPRINT_TILE_SPAN);
  Game.blueprintMode = null;
  return true;
}

// Capture every wall whose center is inside the size×size tile box anchored
// at (x,y). Stores coords as tile offsets so the blueprint is reusable at
// any other anchor point. Caps at BLUEPRINT_CAP stored blueprints (FIFO).
function captureBlueprint(player, x, y, size) {
  size = size || BLUEPRINT_TILE_SPAN;
  const sx = Math.floor(x / WALL_SIZE) * WALL_SIZE;
  const sy = Math.floor(y / WALL_SIZE) * WALL_SIZE;
  const px = sx + size * WALL_SIZE;
  const py = sy + size * WALL_SIZE;
  const tiles = [];
  for (const w of Game.walls) {
    const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
    if (cx < sx || cx >= px || cy < sy || cy >= py) continue;
    tiles.push({
      dx: Math.round((w.x - sx) / WALL_SIZE),
      dy: Math.round((w.y - sy) / WALL_SIZE),
      material: w.material || 'wood',
    });
  }
  if (tiles.length === 0) {
    setNotice('Empty selection — no walls captured', 1.5);
    return null;
  }
  const id = 'bp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const blueprint = {
    id,
    name: `Layout ${(Game.blueprints || []).length + 1} · ${tiles.length} walls`,
    tiles,
    created: Date.now(),
  };
  if (!Game.blueprints) Game.blueprints = [];
  Game.blueprints.push(blueprint);
  // FIFO trim to the cap.
  while (Game.blueprints.length > BLUEPRINT_CAP) Game.blueprints.shift();
  saveBlueprints();
  setNotice(`Captured ${tiles.length} walls (${Game.blueprints.length}/${BLUEPRINT_CAP})`, 2);
  Audio.sfx.pickup();
  return blueprint;
}

// ---------- Blueprint paste / ghost-build ----------
// Sets Game.blueprintGhost to an array of ghost tiles in world coords. The
// integrator renders them at 30% alpha (drawBlueprintGhost) and routes mouse
// clicks to buildGhostWall.
function pasteBlueprintGhost(blueprintId, anchorX, anchorY) {
  const bp = (Game.blueprints || []).find(b => b.id === blueprintId);
  if (!bp) { setNotice('Blueprint not found', 1.2); return false; }
  const sx = Math.floor(anchorX / WALL_SIZE) * WALL_SIZE;
  const sy = Math.floor(anchorY / WALL_SIZE) * WALL_SIZE;
  const tiles = bp.tiles.map(t => ({
    x: sx + t.dx * WALL_SIZE,
    y: sy + t.dy * WALL_SIZE,
    material: t.material || 'wood',
    built: false,
  }));
  Game.blueprintGhost = { id: bp.id, tiles };
  Game.blueprintActive = bp.id;
  return true;
}

// Click handler in paste mode. Walks the ghost tiles, finds the one closest
// to (worldX, worldY) within half a tile, and tries to convert it to a real
// wall.  Costs 1 scrap (matches existing wall_pair recipe rate) and only
// works if the ghost overlay isn't blocked by an existing wall / obstacle.
function buildGhostWall(worldX, worldY, player) {
  const ghost = Game.blueprintGhost;
  if (!ghost) return false;
  // Find the closest unbuilt ghost tile.
  let best = null, bestD = (WALL_SIZE * 0.75) * (WALL_SIZE * 0.75);
  for (const t of ghost.tiles) {
    if (t.built) continue;
    const cx = t.x + WALL_SIZE / 2, cy = t.y + WALL_SIZE / 2;
    const d = (cx - worldX) * (cx - worldX) + (cy - worldY) * (cy - worldY);
    if (d < bestD) { bestD = d; best = t; }
  }
  if (!best) return false;
  if (!hasItem(player.inventory, 'scrap', 1)) {
    setNotice('Need 1 scrap to build', 1.0);
    Audio.sfx.empty();
    return false;
  }
  const rect = { x: best.x, y: best.y, w: WALL_SIZE, h: WALL_SIZE };
  // Same placement validity check the integrator does for free-hand walls —
  // we duplicate it locally so this module doesn't depend on isWallPlacementValid.
  if (!ghostRectClear(rect, player)) {
    setNotice("Can't build there", 1.0);
    Audio.sfx.empty();
    return false;
  }
  removeItem(player.inventory, 'scrap', 1);
  const mat = best.material || 'wood';
  const maxHp = wallMaxHp(mat);
  Game.walls.push({
    x: rect.x, y: rect.y, w: rect.w, h: rect.h,
    hp: maxHp, maxHp, material: mat, condition: 100,
  });
  best.built = true;
  Audio.sfx.click();
  if (typeof NAV !== 'undefined' && NAV.markDirty) NAV.markDirty();
  // If every tile is built, retire the ghost.
  if (ghost.tiles.every(t => t.built)) {
    setNotice('Blueprint complete', 1.5);
    Game.blueprintGhost = null;
    Game.blueprintMode = null;
  }
  return true;
}
function ghostRectClear(rect, player) {
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > WORLD_W || rect.y + rect.h > WORLD_H) return false;
  for (const w of Game.walls) {
    if (rect.x < w.x + w.w && rect.x + rect.w > w.x && rect.y < w.y + w.h && rect.y + rect.h > w.y) return false;
  }
  if (typeof World !== 'undefined' && World.forEachActiveObstacle) {
    let blocked = false;
    World.forEachActiveObstacle(rect.x + rect.w / 2, rect.y + rect.h / 2, (o) => {
      if (blocked || o.walkable) return;
      if (rect.x < o.x + o.w && rect.x + rect.w > o.x && rect.y < o.y + o.h && rect.y + rect.h > o.y) blocked = true;
    });
    if (blocked) return false;
  }
  return true;
}

// ---------- Blueprint draw helpers ----------
// drawn in screen space; the integrator passes world->screen offsets so we
// don't depend on a particular camera shape.
function drawBlueprintGhost(ctx, camX, camY) {
  const ghost = Game.blueprintGhost;
  if (!ghost) return;
  ctx.save();
  ctx.globalAlpha = 0.30;
  ctx.setLineDash([4, 3]);
  for (const t of ghost.tiles) {
    if (t.built) continue;
    const tier = WALL_TIERS[t.material] || WALL_TIERS.wood;
    ctx.fillStyle = tier.color;
    ctx.fillRect(t.x - camX, t.y - camY, WALL_SIZE, WALL_SIZE);
    ctx.strokeStyle = '#ece7d7';
    ctx.lineWidth = 1;
    ctx.strokeRect(t.x - camX + 0.5, t.y - camY + 0.5, WALL_SIZE - 1, WALL_SIZE - 1);
  }
  ctx.restore();
}
function drawBlueprintCaptureBox(ctx, camX, camY) {
  const d = Game.blueprintDrag;
  if (!d) return;
  const minX = Math.min(d.x0, d.x1) - camX;
  const minY = Math.min(d.y0, d.y1) - camY;
  const maxX = Math.max(d.x0, d.x1) - camX;
  const maxY = Math.max(d.y0, d.y1) - camY;
  ctx.save();
  ctx.fillStyle = 'rgba(95, 182, 232, 0.15)';
  ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
  ctx.strokeStyle = '#5fb6e8';
  ctx.setLineDash([6, 4]);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(minX + 0.5, minY + 0.5, maxX - minX - 1, maxY - minY - 1);
  ctx.restore();
}

// ---------- B-key state machine ----------
// Press B to cycle: idle -> capture -> idle (no blueprints yet) OR
// idle -> paste (if any saved) -> capture -> idle.  The integrator just
// calls toggleBlueprintMode() on the keydown and we drive the rest.
function toggleBlueprintMode() {
  const have = (Game.blueprints || []).length > 0;
  if (Game.blueprintMode === null) {
    if (have) {
      // Default to paste on the most recent blueprint.
      const bp = Game.blueprints[Game.blueprints.length - 1];
      Game.blueprintMode = 'paste';
      pasteBlueprintGhost(bp.id, Game.player.x, Game.player.y);
      setNotice(`Paste mode · ${bp.name}`, 2);
    } else {
      Game.blueprintMode = 'capture';
      setNotice('Capture mode · drag a 16×16 box of walls', 2.5);
    }
  } else if (Game.blueprintMode === 'paste') {
    Game.blueprintGhost = null;
    Game.blueprintMode = 'capture';
    setNotice('Capture mode · drag a 16×16 box', 2);
  } else {
    Game.blueprintGhost = null;
    Game.blueprintDrag = null;
    Game.blueprintMode = null;
    setNotice('Blueprint mode off', 1);
  }
}

// ---------- Persistence ----------
// Meta blueprint storage — survives across runs in localStorage.
function loadBlueprints() {
  try {
    const raw = localStorage.getItem(BLUEPRINT_META_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter(b => b && Array.isArray(b.tiles)).slice(-BLUEPRINT_CAP);
  } catch { return []; }
}
function saveBlueprints() {
  try {
    localStorage.setItem(BLUEPRINT_META_KEY, JSON.stringify(Game.blueprints || []));
  } catch {}
}

// Per-run extension storage — the existing wall save in persistence.js only
// carries position/hp/maxHp. saveWalls() returns a parallel array of just
// the extension fields in the same order as Game.walls. loadWalls applies
// them by index.
function saveWalls() {
  return (Game.walls || []).map(w => ({
    m: w.material || 'wood',
    c: typeof w.condition === 'number' ? w.condition : 100,
  }));
}
function loadWalls(data) {
  if (!Array.isArray(data)) return;
  for (let i = 0; i < Game.walls.length && i < data.length; i++) {
    const ext = data[i] || {};
    Game.walls[i].material = ext.m || 'wood';
    Game.walls[i].condition = typeof ext.c === 'number' ? ext.c : 100;
    migrateWall(Game.walls[i]);
  }
  // Any walls without an entry (legacy save) get the defaults.
  for (let i = data.length; i < Game.walls.length; i++) migrateWall(Game.walls[i]);
}
