'use strict';

// ---------- Bases / Safehouse Claims ----------
// F4b foundation for D·01 Safehouse Network, D·03 Raid Night (raid horde
// targets nearest base), and D·04 RV (RV registers as a special base).
//
// A "base" is a player-claimed plot of land. Mechanically it's just a
// point (x,y) with a name, a colored flag prop, and a list of walls/chests
// that live inside its effective radius. The world is too big and chunked
// to make a hard zone — anything within BASE_EFFECTIVE_RADIUS of the flag
// counts as "inside" the base for the systems that ask.
//
// State lives on Game.bases (array, cap 3). Each entry:
//   { id, name, x, y, claimedDay, walls: [wallIds], chestIds: [],
//     spawnPoint: {x,y}, type: 'fixed'|'rv', moatTiles: [],
//     generators: [], color }
//
// Constants live here only as fallbacks; the integration spec moves the
// canonical values to constants.js so other modules can read them without
// pulling in bases.js. Keep these names stable.

if (typeof BASE_CAP === 'undefined')              var BASE_CAP = 3;
if (typeof BASE_EFFECTIVE_RADIUS === 'undefined') var BASE_EFFECTIVE_RADIUS = 12 * TILE_SIZE;
if (typeof BASE_MIN_DISTANCE === 'undefined')     var BASE_MIN_DISTANCE = 20 * TILE_SIZE;

// Color palette. Cycled in claim order; first base is red, second yellow,
// third blue. Slot is recycled on removeBase so a re-claim looks consistent
// on the map.
const BASE_COLORS = ['#d24b35', '#e3c054', '#5fb6e8'];
const BASE_DEFAULT_NAMES = ['HOMESTEAD', 'OUTPOST', 'BLUE LINE'];

// Internal id counter — bases are referenced by id (string) by D·03/D·04
// so they survive array reordering after removeBase.
let __baseIdSeq = 1;
function __nextBaseId() { return 'b' + (__baseIdSeq++); }

// ---------- Lifecycle ----------
function initBases() {
  Game.bases = [];
  __baseIdSeq = 1;
}

// Returns the lowest unused color/name slot index for a fresh base.
function __pickBaseSlot() {
  const used = new Set(Game.bases.map(b => b.colorSlot));
  for (let i = 0; i < BASE_COLORS.length; i++) {
    if (!used.has(i)) return i;
  }
  return Game.bases.length % BASE_COLORS.length;
}

// ---------- Claim / Remove ----------
// Try to claim a base centered on (x,y). Returns the new base on success,
// or an object {error: '...'} describing why. Callers should surface the
// reason in the HUD; placeBaseFlagItem() does that for you.
function claimBase(x, y, name) {
  if (!Game.bases) Game.bases = [];
  if (Game.bases.length >= BASE_CAP) {
    return { error: 'over_cap' };
  }
  // Disallow stacking flags. Bases must be >= BASE_MIN_DISTANCE apart so
  // their effective radii don't smear together (radius is 12 tiles, min
  // distance is 20, so they can touch but not overlap meaningfully).
  for (const b of Game.bases) {
    const dx = b.x - x, dy = b.y - y;
    if (Math.hypot(dx, dy) < BASE_MIN_DISTANCE) {
      return { error: 'too_close', other: b };
    }
  }
  // Refuse to claim on an obstacle — flag would clip into a wall/tree.
  if (typeof inObstacle === 'function' && inObstacle(x, y, 8)) {
    return { error: 'blocked' };
  }
  const slot = __pickBaseSlot();
  const base = {
    id: __nextBaseId(),
    name: name || BASE_DEFAULT_NAMES[slot] || ('BASE ' + (Game.bases.length + 1)),
    x, y,
    claimedDay: (Game.time && Game.time.day) | 0 || 1,
    walls: [],            // refs to entries in Game.walls
    chestIds: [],         // chest indices keyed by chunk (future use)
    spawnPoint: { x, y }, // respawn location (death handler reads this)
    type: 'fixed',        // 'rv' for D·04
    moatTiles: [],        // populated by future moat/trench system
    generators: [],       // future power network
    color: BASE_COLORS[slot],
    colorSlot: slot,
  };
  Game.bases.push(base);
  linkExistingWallsToBase(base);
  if (typeof setNotice === 'function') {
    setNotice(`Claimed ${base.name} (${Game.bases.length}/${BASE_CAP})`, 3);
  }
  if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx.pickup) Audio.sfx.pickup();
  return base;
}

function removeBase(id) {
  if (!Game.bases) return false;
  const idx = Game.bases.findIndex(b => b.id === id);
  if (idx < 0) return false;
  const b = Game.bases[idx];
  // Walls aren't deleted — just unlinked. The player keeps their walls; the
  // base just no longer "owns" them.
  for (const w of Game.walls) {
    if (w.baseId === id) w.baseId = null;
  }
  Game.bases.splice(idx, 1);
  if (typeof setNotice === 'function') setNotice(`Unclaimed ${b.name}`, 2);
  return true;
}

// ---------- Spatial queries ----------
function nearestBase(x, y) {
  if (!Game.bases || Game.bases.length === 0) return null;
  let best = null, bestD = Infinity;
  for (const b of Game.bases) {
    const dx = b.x - x, dy = b.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

// Is the point inside ANY base's effective radius? `slack` extends the
// radius (e.g., for raid pre-aggro). Default slack=80 matches a typical
// approach radius the raid horde uses to commit to a target.
function baseAt(x, y, slack = 80) {
  if (!Game.bases) return false;
  const r = BASE_EFFECTIVE_RADIUS + slack;
  const r2 = r * r;
  for (const b of Game.bases) {
    const dx = b.x - x, dy = b.y - y;
    if (dx * dx + dy * dy <= r2) return true;
  }
  return false;
}

// ---------- Flag item placement ----------
// Consumes one base_flag from the player inventory and claims the base at
// the player's current location. Surfaces failures via setNotice so callers
// (UI button, hotbar use) don't need to format messages.
function placeBaseFlagItem(player) {
  if (!player) return false;
  const inv = player.inventory;
  if (!inv || typeof hasItem !== 'function' || !hasItem(inv, 'base_flag', 1)) {
    if (typeof setNotice === 'function') setNotice('No flag in inventory', 1.5);
    return false;
  }
  const result = claimBase(player.x, player.y);
  if (result && result.error) {
    if (typeof setNotice === 'function') {
      const msg = result.error === 'over_cap' ? `Max ${BASE_CAP} bases — remove one first`
                : result.error === 'too_close' ? 'Too close to another base'
                : result.error === 'blocked'   ? 'Cannot plant flag here'
                :                                'Cannot claim base';
      setNotice(msg, 2);
    }
    return false;
  }
  // Success — consume the flag.
  if (typeof removeItem === 'function') removeItem(inv, 'base_flag', 1);
  return result;
}

// ---------- Wall / chest linkage ----------
// When a wall is placed within an existing base's radius, link it. Caller
// passes the wall object that just got pushed into Game.walls.
function assignWallToBase(wall, base) {
  if (!wall) return;
  if (!base) {
    // Find an enclosing base automatically.
    base = null;
    if (Game.bases && Game.bases.length) {
      const wx = wall.x + (wall.w || 0) / 2;
      const wy = wall.y + (wall.h || 0) / 2;
      const r2 = BASE_EFFECTIVE_RADIUS * BASE_EFFECTIVE_RADIUS;
      for (const b of Game.bases) {
        const dx = b.x - wx, dy = b.y - wy;
        if (dx * dx + dy * dy <= r2) { base = b; break; }
      }
    }
    if (!base) return;
  }
  wall.baseId = base.id;
  if (!base.walls.includes(wall)) base.walls.push(wall);
}

// Sweep Game.walls and attach any that fall inside this base's radius.
// Used at claim time so existing walls auto-link to the new base.
function linkExistingWallsToBase(base) {
  if (!base || !Game.walls) return;
  const r2 = BASE_EFFECTIVE_RADIUS * BASE_EFFECTIVE_RADIUS;
  for (const w of Game.walls) {
    const cx = w.x + (w.w || 0) / 2;
    const cy = w.y + (w.h || 0) / 2;
    const dx = base.x - cx, dy = base.y - cy;
    if (dx * dx + dy * dy <= r2) {
      w.baseId = base.id;
      if (!base.walls.includes(w)) base.walls.push(w);
    }
  }
}

// ---------- Fast travel (D·01) ----------
// Day-only. Estimates 30 simulated seconds per 8-tile hex traveled and
// advances Game.time.t accordingly. Throws on failure so the HUD button
// can show a reason; callers should try/catch.
function fastTravelTo(base) {
  if (!base) throw new Error('no base');
  if (!Game.time || Game.time.phase !== 'day') {
    const e = new Error('Fast travel only during day');
    e.code = 'not_day';
    throw e;
  }
  const p = Game.player;
  if (!p || p.dead) {
    const e = new Error('Player is dead');
    e.code = 'dead';
    throw e;
  }
  const dx = base.x - p.x, dy = base.y - p.y;
  const dist = Math.hypot(dx, dy);
  // 8 tiles per "hex" of travel cost.
  const hexes = dist / (8 * TILE_SIZE);
  const travelSecs = hexes * 30;
  // Move the player.
  p.x = base.spawnPoint.x;
  p.y = base.spawnPoint.y;
  p.vx = 0; p.vy = 0;
  // Advance the clock. Don't roll over a full day in one trip — that would
  // skip a night siege entirely. Clamp.
  if (typeof DAY_LENGTH === 'number') {
    Game.time.t = Math.min(DAY_LENGTH - 1, Game.time.t + travelSecs);
  } else {
    Game.time.t += travelSecs;
  }
  // Reactivate the chunk window around the new position.
  if (typeof World !== 'undefined' && World.ensureActive) World.ensureActive(p.x, p.y);
  if (Game.camera) {
    Game.camera.x = p.x - VIEW_W / 2;
    Game.camera.y = p.y - VIEW_H / 2;
  }
  if (typeof setBanner === 'function') {
    setBanner(`FAST TRAVEL · ${base.name}`, 2);
  }
  if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx.click) Audio.sfx.click();
  return { travelSecs, distance: dist };
}

// ---------- World drawing ----------
// Wooden post + small triangular pennant. 12x30 px footprint, drawn in
// world space. Called from render.js after walls, before survivors/squad.
function drawBaseFlags(ctx, camX, camY) {
  if (!Game.bases || Game.bases.length === 0) return;
  for (const b of Game.bases) {
    const sx = b.x - camX, sy = b.y - camY;
    // Off-screen cull with padding for the flag height.
    if (sx < -40 || sy < -50 || sx > VIEW_W + 40 || sy > VIEW_H + 40) continue;
    // Shadow at the base of the pole.
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + 2, 8, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Pole.
    ctx.fillStyle = '#6b4a26';
    ctx.fillRect(sx - 1, sy - 28, 2, 30);
    // Pole tip highlight.
    ctx.fillStyle = '#caa760';
    ctx.fillRect(sx - 1, sy - 30, 2, 2);
    // Pennant (triangle pointing right).
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.moveTo(sx + 1, sy - 28);
    ctx.lineTo(sx + 13, sy - 24);
    ctx.lineTo(sx + 1, sy - 20);
    ctx.closePath();
    ctx.fill();
    // Dark trim along the hoist edge.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(sx + 1, sy - 28, 1, 9);
  }
}

// ---------- Map drawing ----------
// Called from render.js inside drawWorldMap() after POI markers. The map
// builds its own world-to-screen transform; pass it through as
// {w2sx, w2sy, scale} so we can place flag markers + name labels.
function drawBaseFlagsOnMap(ctx, mapCamera) {
  if (!Game.bases || Game.bases.length === 0) return;
  if (!mapCamera || typeof mapCamera.w2sx !== 'function') return;
  ctx.save();
  ctx.font = 'bold 10px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  for (const b of Game.bases) {
    const mx = mapCamera.w2sx(b.x);
    const my = mapCamera.w2sy(b.y);
    // Effective radius ring (faint).
    ctx.strokeStyle = b.color + '55';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(mx, my, Math.max(4, BASE_EFFECTIVE_RADIUS * mapCamera.scale), 0, Math.PI * 2);
    ctx.stroke();
    // Flag marker — small pole + pennant pointing right.
    ctx.fillStyle = '#caa760';
    ctx.fillRect(mx - 0.5, my - 8, 1, 10);
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.moveTo(mx + 0.5, my - 8);
    ctx.lineTo(mx + 8,   my - 5);
    ctx.lineTo(mx + 0.5, my - 2);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Name + claim day label below.
    ctx.fillStyle = '#0b0c0e';
    ctx.fillRect(mx - 36, my + 4, 72, 13);
    ctx.fillStyle = b.color;
    ctx.fillText(b.name, mx, my + 13);
    ctx.fillStyle = '#7a7e88';
    ctx.font = '8px "JetBrains Mono", monospace';
    ctx.fillText(`D${b.claimedDay}`, mx, my + 22);
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
  }
  ctx.restore();
}

// ---------- Save / load ----------
function saveBases() {
  if (!Game.bases) return [];
  return Game.bases.map(b => ({
    id: b.id, name: b.name, x: b.x, y: b.y,
    claimedDay: b.claimedDay,
    spawnPoint: { x: b.spawnPoint.x, y: b.spawnPoint.y },
    type: b.type,
    color: b.color, colorSlot: b.colorSlot,
    // Walls are persisted via Game.walls already — we only need to remember
    // which baseId each wall claims (loadBases() relinks them by id).
    chestIds: b.chestIds.slice(),
    moatTiles: b.moatTiles.slice(),
    generators: b.generators.slice(),
  }));
}

function loadBases(data) {
  initBases();
  if (!Array.isArray(data)) return;
  for (const d of data) {
    Game.bases.push({
      id: d.id || __nextBaseId(),
      name: d.name || 'BASE',
      x: d.x, y: d.y,
      claimedDay: d.claimedDay | 0,
      walls: [],
      chestIds: Array.isArray(d.chestIds) ? d.chestIds.slice() : [],
      spawnPoint: d.spawnPoint || { x: d.x, y: d.y },
      type: d.type || 'fixed',
      moatTiles: Array.isArray(d.moatTiles) ? d.moatTiles.slice() : [],
      generators: Array.isArray(d.generators) ? d.generators.slice() : [],
      color: d.color || BASE_COLORS[d.colorSlot || 0],
      colorSlot: (d.colorSlot != null) ? d.colorSlot : 0,
    });
    // Keep the id counter ahead of restored ids so new claims don't collide.
    const n = parseInt(String(d.id || '').replace(/[^0-9]/g, ''), 10);
    if (!isNaN(n) && n >= __baseIdSeq) __baseIdSeq = n + 1;
  }
  // Re-link existing walls (Game.walls is restored before this).
  for (const b of Game.bases) linkExistingWallsToBase(b);
}
