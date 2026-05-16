'use strict';

// ============================================================================
// Bot Arena API — Perception + Action contract
// ============================================================================
//
// Every competition bot is a `decide(perception, api)` function. The harness
// builds a Perception snapshot from the game state each tick, hands it to the
// bot, then translates the returned Action into game inputs.
//
// Bots see ONLY what's in `perception`. They MAY use `api.hasLOS`, `api.leadShot`,
// and the weapon meta tables (read-only). They MUST NOT read Game, World, NAV,
// Spatial, ZOMBIES, WEAPONS, input, document, window, or anything else.
//
// This file is loaded after the core game scripts, so it can see the globals
// it needs to build the snapshot.
//
// Public surface: window.Arena = { buildPerception, applyAction, makeApi,
//                                   FORBIDDEN_GLOBALS, lintBot, ... }
// ============================================================================

(function () {

const Arena = window.Arena = window.Arena || {};

// Identifiers the bot source file is not supposed to reference. The harness
// scans the bot's stringified function source and warns (does not block) if
// any are found.
Arena.FORBIDDEN_GLOBALS = [
  'Game', 'World', 'NAV', 'Spatial',
  'ZOMBIES', 'WEAPONS', 'WEAPON_ORDER',
  'input', 'ctx', 'canvas', 'document', 'localStorage',
  'Audio', 'render', 'tick', 'renderHUD',
  'findChestNear', 'findNearestUndiscoveredPOI',
];

// --------------------------------------------------------------------------
// Stable IDs
// --------------------------------------------------------------------------
// Game entities don't carry stable IDs across ticks. We assign them once via
// a hidden symbol property so the bot can correlate frames if it wants to.
const ARENA_ID = Symbol('arenaId');
let _idCounter = 1;
function idOf(obj) {
  if (obj[ARENA_ID] == null) obj[ARENA_ID] = _idCounter++;
  return obj[ARENA_ID];
}

// --------------------------------------------------------------------------
// Read-only weapon meta (safe to expose; bots don't need WEAPONS directly).
// --------------------------------------------------------------------------
Arena.WEAPON_META = (function () {
  const out = {};
  for (const k of Object.keys(WEAPONS)) {
    const w = WEAPONS[k];
    out[k] = Object.freeze({
      key: k,
      slot: w.key,                       // keyboard slot, e.g. '1'
      name: w.name,
      fireRate: w.fireRate,
      damage: w.damage,
      pellets: w.pellets,
      spread: w.spread,
      bulletSpeed: w.bulletSpeed,
      bulletRange: w.bulletRange,
      magSize: w.magSize,
      reloadTime: w.reloadTime,
      isPlacer: !!w.isPlacer,
      isWall: !!w.isWall,
      isRocket: !!w.isRocket,
      explodeRadius: w.explodeRadius || 0,
      isMelee: !!w.isMelee,
      meleeRange: w.meleeRange || 0,
      isStream: !!w.isStream,
      pierce: w.pierce || 0,
    });
  }
  return Object.freeze(out);
})();

Arena.ZOMBIE_META = (function () {
  const out = {};
  for (const k of Object.keys(ZOMBIES)) {
    const z = ZOMBIES[k];
    out[k] = Object.freeze({
      type: k,
      hp: z.hp, speed: z.speed, damage: z.damage,
      radius: z.radius, score: z.score,
      isFire: !!z.isFire,
    });
  }
  return Object.freeze(out);
})();

// --------------------------------------------------------------------------
// Visibility radii.
//
// We treat DYNAMIC entities (zombies, pickups, chests) as on-screen-only +
// LOS — same vision the player has. STATIC map structure (walls, obstacles,
// barrels) extends out to MAP_SENSE_RADIUS so bots can plan paths and pick
// which walls to shoot through. Without this, a wall at the screen edge is
// invisible and the bot has no way to know it's in the way.
// --------------------------------------------------------------------------
const VIEW_MARGIN      = 8;
const MAP_SENSE_RADIUS = 1200;     // walls/obstacles/barrels visible within this radius
const MAP_SENSE_R2     = MAP_SENSE_RADIUS * MAP_SENSE_RADIUS;

function inView(x, y) {
  const vx = x - Game.camera.x, vy = y - Game.camera.y;
  return vx >= -VIEW_MARGIN && vy >= -VIEW_MARGIN
      && vx <= VIEW_W + VIEW_MARGIN
      && vy <= VIEW_H + VIEW_MARGIN;
}
function withinMapSense(p, cx, cy) {
  const dx = cx - p.x, dy = cy - p.y;
  return dx * dx + dy * dy <= MAP_SENSE_R2;
}

// --------------------------------------------------------------------------
// Day-cycle helpers.
// --------------------------------------------------------------------------
function phaseOffsets() {
  let acc = 0; const out = {};
  for (const p of DAY_PHASES) { out[p.name] = acc; acc += p.length; }
  return out;
}
function secondsTo(phaseName) {
  const t = Game.time.t;
  const offsets = phaseOffsets();
  const target = offsets[phaseName];
  if (target == null) return Infinity;
  if (t <= target) return target - t;
  return (DAY_LENGTH - t) + target;
}

// --------------------------------------------------------------------------
// Build a single-frame Perception snapshot for the active player. Everything
// the bot sees flows through this function.
// --------------------------------------------------------------------------
Arena.buildPerception = function (tick) {
  const p = Game.player;
  if (!p) return null;

  // Player snapshot ----------------------------------------------------------
  const curAmmo = p.ammo[p.weapon] || { mag: 0, reserve: 0 };
  const curDef  = WEAPONS[p.weapon] || {};
  const weapons = {};
  for (const k of Object.keys(p.ammo)) {
    const a = p.ammo[k];
    const def = WEAPONS[k] || {};
    weapons[k] = {
      unlocked: !!p.unlocked[k],
      mag:     a.mag,
      reserve: a.reserve,
      magSize: def.magSize,
      isPlacer: !!def.isPlacer,
      isWall:   !!def.isWall,
      isRocket: !!def.isRocket,
      damage:   def.damage,
      range:    def.bulletRange,
      fireRate: def.fireRate,
      slot:     def.key,
    };
  }

  const self = {
    x: p.x, y: p.y, r: p.r,
    vx: p.vx, vy: p.vy,
    angle: p.angle,
    hp: p.hp, maxHp: p.maxHp,
    iframe: p.iframe,
    weapon: p.weapon,
    fireCd:    p.fireCd,
    reloading: p.reloading,
    placeCd:   p.placeCd,
    openCd:    p.openCd,
    ammo: {
      mag: curAmmo.mag,
      reserve: curAmmo.reserve,
      magSize: curDef.magSize,
      magFull: curDef.magSize !== Infinity && curAmmo.mag >= curDef.magSize,
    },
    weapons,
    minigunSpin: p.minigunSpin || 0,
    railCharge:  p.railCharge  || 0,
    chillMult:   p.chillMult   || 1,
  };

  // Visible zombies (viewport + LOS to player) -------------------------------
  const zombies = [];
  const scanRadius = 800;
  const scan = Spatial.query(p.x, p.y, scanRadius, []);
  for (let i = 0; i < scan.length; i++) {
    const e = scan[i];
    if (!e || typeof e.hp !== 'number' || !e.type || !ZOMBIES[e.type]) continue;
    if (!inView(e.x, e.y)) continue;
    if (!NAV.hasLOS(p.x, p.y, e.x, e.y)) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    zombies.push({
      id: idOf(e),
      type: e.type,
      x: e.x, y: e.y, r: e.r,
      vx: e.vx || 0, vy: e.vy || 0,
      hp: e.hp, maxHp: e.maxHp || ZOMBIES[e.type].hp,
      dist: Math.hypot(dx, dy),
      angleFromSelf: Math.atan2(dy, dx),
    });
  }
  zombies.sort((a, b) => a.dist - b.dist);

  // Visible chests -----------------------------------------------------------
  const chests = [];
  World.forEachActiveChest(p.x, p.y, (c) => {
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    if (!inView(cx, cy)) return;
    const dx = cx - p.x, dy = cy - p.y;
    chests.push({
      id: idOf(c),
      tier: c.tier,
      x: cx, y: cy,
      hp: c.hp || 0, maxHp: (CHEST_TIER[c.tier] || CHEST_TIER.wood).hp,
      opened: !!c.opened,
      dist: Math.hypot(dx, dy),
      angleFromSelf: Math.atan2(dy, dx),
    });
  });
  chests.sort((a, b) => a.dist - b.dist);

  // Visible pickups ----------------------------------------------------------
  const pickups = [];
  const allPickups = Game.pickups || [];
  for (let i = 0; i < allPickups.length; i++) {
    const pk = allPickups[i];
    if (!inView(pk.x, pk.y)) continue;
    const dx = pk.x - p.x, dy = pk.y - p.y;
    pickups.push({
      id: idOf(pk),
      type: pk.type,
      x: pk.x, y: pk.y,
      dist: Math.hypot(dx, dy),
      angleFromSelf: Math.atan2(dy, dx),
    });
  }
  pickups.sort((a, b) => a.dist - b.dist);

  // Walls / obstacles / barrels within MAP_SENSE_RADIUS (no LOS, no viewport).
  // Bots get a wider awareness of static structure so they can pathfind around
  // walls or pick which to shoot.
  const walls = [];
  for (let i = 0; i < Game.walls.length; i++) {
    const w = Game.walls[i];
    const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
    if (!withinMapSense(p, cx, cy)) continue;
    const dx = cx - p.x, dy = cy - p.y;
    walls.push({
      id: idOf(w),
      x: w.x, y: w.y, w: w.w, h: w.h,
      cx, cy,
      hp: w.hp, maxHp: WALL_HP,
      mine: true,
      dist: Math.hypot(dx, dy),
    });
  }
  const obstacles = [];
  World.forEachObstacleNear(p.x, p.y, MAP_SENSE_RADIUS, (o) => {
    if (o.dead) return;
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    if (!withinMapSense(p, cx, cy)) return;
    const dx = cx - p.x, dy = cy - p.y;
    obstacles.push({
      id: idOf(o),
      x: o.x, y: o.y, w: o.w, h: o.h,
      cx, cy,
      style: o.style || null,
      hp: o.hp || 0, maxHp: o.maxHp || 0,
      breakable: !!o.maxHp && !o.indestructible,
      indestructible: !!o.indestructible,
      dist: Math.hypot(dx, dy),
    });
  });
  const barrels = [];
  for (let i = 0; i < Game.barrels.length; i++) {
    const b = Game.barrels[i];
    if (!withinMapSense(p, b.x, b.y)) continue;
    const dx = b.x - p.x, dy = b.y - p.y;
    barrels.push({
      id: idOf(b),
      x: b.x, y: b.y, r: b.r || 14,
      hp: b.hp || 0,
      dist: Math.hypot(dx, dy),
    });
  }
  walls.sort((a, b) => a.dist - b.dist);
  obstacles.sort((a, b) => a.dist - b.dist);
  barrels.sort((a, b) => a.dist - b.dist);

  // POI compass --------------------------------------------------------------
  let nearestPOI = null;
  try {
    const poi = findNearestUndiscoveredPOI(p.x, p.y);
    if (poi) {
      const dx = poi.centerX - p.x, dy = poi.centerY - p.y;
      nearestPOI = {
        x: poi.centerX, y: poi.centerY,
        dist: Math.hypot(dx, dy),
        angleFromSelf: Math.atan2(dy, dx),
      };
    }
  } catch (_) { nearestPOI = null; }

  // Day cycle ---------------------------------------------------------------
  const phaseDef = DAY_PHASES.find(ph => ph.name === Game.time.phase);
  let phaseStart = 0;
  for (const ph of DAY_PHASES) {
    if (ph.name === Game.time.phase) break;
    phaseStart += ph.length;
  }
  const phaseT = Math.max(0, Game.time.t - phaseStart);
  const phaseRemaining = phaseDef ? Math.max(0, phaseDef.length - phaseT) : 0;

  return {
    // Identity & timing
    tick: tick,
    dt: TICK_DT,

    // Player
    self,

    // Things the player can see
    zombies,
    chests,
    pickups,
    walls,
    obstacles,
    barrels,

    // Aggregate threat info (total alive zombies, even off-screen)
    totalZombieCount: Game.zombies.length,

    // Day cycle
    day:             Game.time.day,
    phase:           Game.time.phase,
    phaseT:          phaseT,
    phaseRemaining:  phaseRemaining,
    secondsToDusk:   secondsTo('dusk'),
    secondsToNight:  secondsTo('night'),
    secondsToDawn:   secondsTo('dawn'),

    // Scoring (read-only)
    score:   Game.score,
    kills:   Game.kills,
    elapsed: Game.elapsed,

    // World context
    world:    Object.freeze({ w: WORLD_W, h: WORLD_H }),
    view:     Object.freeze({
      x: Game.camera.x, y: Game.camera.y,
      w: VIEW_W, h: VIEW_H,
    }),
    levelName: (Game.level && Game.level.name) || '',

    nearestPOI,
  };
};

// --------------------------------------------------------------------------
// Pathfinding: goal-rooted BFS over NAV.blocked. Cached by (goalCx,goalCy,
// NAV.originX, NAV.originY) so repeated calls in a single tick or while the
// goal is stable are cheap.
// --------------------------------------------------------------------------
const _pathCache = {
  dist: null,
  cols: 0, rows: 0,
  originX: 0, originY: 0,
  goalCx: -1, goalCy: -1,
  rebuildT: 0,         // perf.now() when last built, used for staleness check
};

function _buildPathBfs(goalX, goalY) {
  if (!NAV.blocked) return false;
  const cols = NAV.cols, rows = NAV.rows, cs = NAV.cellSize;
  const ox = NAV.originX, oy = NAV.originY;
  const n = cols * rows;

  // Snap goal to nearest unblocked cell within 8 rings if it lands on a wall.
  let gx = Math.max(0, Math.min(cols - 1, Math.floor((goalX - ox) / cs)));
  let gy = Math.max(0, Math.min(rows - 1, Math.floor((goalY - oy) / cs)));
  let goalIdx = gy * cols + gx;
  if (NAV.blocked[goalIdx]) {
    let best = -1, bestD = Infinity;
    for (let r = 1; r <= 8 && best < 0; r++) {
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const nx = gx + dx, ny = gy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const ni = ny * cols + nx;
          if (NAV.blocked[ni]) continue;
          const d = dx * dx + dy * dy;
          if (d < bestD) { bestD = d; best = ni; }
        }
      }
    }
    if (best < 0) return false;
    goalIdx = best;
    gy = (goalIdx / cols) | 0; gx = goalIdx % cols;
  }

  if (!_pathCache.dist || _pathCache.dist.length !== n) _pathCache.dist = new Int32Array(n);
  const dist = _pathCache.dist;
  dist.fill(-1);
  dist[goalIdx] = 0;
  const queue = [goalIdx];
  let head = 0;
  while (head < queue.length) {
    const idx = queue[head++];
    const cx = idx % cols, cy = (idx / cols) | 0;
    const d = dist[idx] + 1;
    if (cx > 0)        { const ni = idx - 1;    if (dist[ni] < 0 && !NAV.blocked[ni]) { dist[ni] = d; queue.push(ni); } }
    if (cx < cols - 1) { const ni = idx + 1;    if (dist[ni] < 0 && !NAV.blocked[ni]) { dist[ni] = d; queue.push(ni); } }
    if (cy > 0)        { const ni = idx - cols; if (dist[ni] < 0 && !NAV.blocked[ni]) { dist[ni] = d; queue.push(ni); } }
    if (cy < rows - 1) { const ni = idx + cols; if (dist[ni] < 0 && !NAV.blocked[ni]) { dist[ni] = d; queue.push(ni); } }
  }
  _pathCache.cols = cols; _pathCache.rows = rows;
  _pathCache.originX = ox; _pathCache.originY = oy;
  _pathCache.goalCx = gx; _pathCache.goalCy = gy;
  _pathCache.rebuildT = performance.now();
  return true;
}

// Return a unit-vector next-step direction from (fromX,fromY) toward the
// closest cell with a lower BFS distance. Null if not reachable / outside the
// nav window.
function _pathStep(fromX, fromY, goalX, goalY) {
  if (!NAV.blocked) return null;
  const cs = NAV.cellSize;

  // Rebuild cache if:
  //  - nav window moved
  //  - goal cell moved
  //  - it's been >400ms since last build (walls / obstacles may have changed)
  const goalCx = Math.max(0, Math.min(NAV.cols - 1, Math.floor((goalX - NAV.originX) / cs)));
  const goalCy = Math.max(0, Math.min(NAV.rows - 1, Math.floor((goalY - NAV.originY) / cs)));
  const stale = (performance.now() - _pathCache.rebuildT) > 400;
  if (!_pathCache.dist
      || _pathCache.originX !== NAV.originX
      || _pathCache.originY !== NAV.originY
      || _pathCache.goalCx !== goalCx
      || _pathCache.goalCy !== goalCy
      || stale) {
    if (!_buildPathBfs(goalX, goalY)) return null;
  }

  const cols = _pathCache.cols, rows = _pathCache.rows;
  const dist = _pathCache.dist;
  const ox = _pathCache.originX, oy = _pathCache.originY;
  if (fromX < ox || fromY < oy || fromX >= ox + cols * cs || fromY >= oy + rows * cs) return null;
  const cx = ((fromX - ox) / cs) | 0, cy = ((fromY - oy) / cs) | 0;
  const idx = cy * cols + cx;
  let myD = dist[idx];
  if (myD < 0) myD = 1e9;
  let bestCost = myD, bestDx = 0, bestDy = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const ni = ny * cols + nx;
      const d = dist[ni];
      if (d < 0) continue;
      if (dx !== 0 && dy !== 0) {
        // Disallow cutting a corner through a blocked diagonal neighbour.
        if (NAV.blocked[cy * cols + nx] || NAV.blocked[ny * cols + cx]) continue;
      }
      const cost = d + (dx !== 0 && dy !== 0 ? 0.4 : 0);
      if (cost < bestCost) { bestCost = cost; bestDx = dx; bestDy = dy; }
    }
  }
  if (bestDx === 0 && bestDy === 0) return null;
  const l = Math.hypot(bestDx, bestDy);
  return { x: bestDx / l, y: bestDy / l };
}

// Ray-march along a unit direction looking for the first breakable rect.
// Returns { x, y, cx, cy, kind, hp, maxHp } | null.
function _findBreakable(fromX, fromY, dirX, dirY, maxDist) {
  if (dirX === 0 && dirY === 0) return null;
  const l = Math.hypot(dirX, dirY);
  dirX /= l; dirY /= l;
  const stepLen = 8;
  const max = maxDist || 160;
  for (let d = 8; d <= max; d += stepLen) {
    const sx = fromX + dirX * d;
    const sy = fromY + dirY * d;
    // Player-placed walls.
    for (let i = 0; i < Game.walls.length; i++) {
      const w = Game.walls[i];
      if (sx >= w.x && sx <= w.x + w.w && sy >= w.y && sy <= w.y + w.h) {
        return {
          x: w.x + w.w / 2, y: w.y + w.h / 2,
          cx: w.x + w.w / 2, cy: w.y + w.h / 2,
          kind: 'wall', hp: w.hp, maxHp: WALL_HP,
        };
      }
    }
    // World obstacles.
    let hit = null;
    World.forEachObstacleNear(sx, sy, 4, (o) => {
      if (hit) return;
      if (!o.maxHp || o.indestructible || o.dead) return;
      if (sx >= o.x && sx <= o.x + o.w && sy >= o.y && sy <= o.y + o.h) {
        hit = {
          x: o.x + o.w / 2, y: o.y + o.h / 2,
          cx: o.x + o.w / 2, cy: o.y + o.h / 2,
          kind: 'obstacle', hp: o.hp, maxHp: o.maxHp, style: o.style || null,
        };
      }
    });
    if (hit) return hit;
  }
  return null;
}

// --------------------------------------------------------------------------
// Helper API passed alongside perception.
// --------------------------------------------------------------------------
Arena.makeApi = function () {
  return {
    // Line of sight between two world points. Equivalent to whether a bullet
    // fired from a→b would clear all walls/obstacles. Free for bots to call.
    hasLOS(ax, ay, bx, by) {
      return NAV.hasLOS(ax, ay, bx, by);
    },

    // Predict an aim point for a moving target given the bot's bullet speed.
    // Uses simple linear lead — accurate enough for arcade combat.
    leadShot(self, target, bulletSpeed) {
      if (!target) return null;
      const bs = bulletSpeed || 900;
      const dx = target.x - self.x, dy = target.y - self.y;
      const dist = Math.hypot(dx, dy);
      const t = dist / bs;
      return {
        x: target.x + (target.vx || 0) * t,
        y: target.y + (target.vy || 0) * t,
      };
    },

    // Euclidean distance helper.
    distance(a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y);
    },

    // Read-only meta tables.
    weapons: Arena.WEAPON_META,
    zombies: Arena.ZOMBIE_META,

    // ---- Navigation ----
    // Return the unit-vector next-step direction from `from` toward `goal`,
    // routed around obstacles via the game's flow-field grid. Internally
    // memoised — cheap to call every tick. Returns null when the goal is not
    // reachable or `from` lies outside the nav window.
    //
    // Use it like:
    //   const step = api.pathfindStep(self, goalPoint);
    //   if (step) action.move = step;
    //   else      action.move = { x: dx/dd, y: dy/dd };   // fallback direct
    pathfindStep(from, goal) {
      if (!from || !goal) return null;
      return _pathStep(from.x, from.y, goal.x, goal.y);
    },

    // True if the world point lies inside a navigation-blocked cell (a wall,
    // obstacle, or out-of-bounds). False if walkable or outside the nav
    // window. Useful for pre-flighting a candidate move.
    isBlocked(x, y) {
      if (!NAV.blocked || !NAV.inWindow(x, y)) return false;
      const idx = NAV.cy(y) * NAV.cols + NAV.cx(x);
      return !!NAV.blocked[idx];
    },

    // First breakable wall / obstacle along a ray from `from` in direction
    // `(dx,dy)` within `maxDist` (default 160). Returns
    //   { x, y, cx, cy, kind: 'wall'|'obstacle', hp, maxHp, style? }
    // or null. Used to decide "shoot the thing in front of me" when stuck.
    findBreakable(from, dx, dy, maxDist) {
      if (!from) return null;
      return _findBreakable(from.x, from.y, dx, dy, maxDist);
    },

    // Pure utilities.
    clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; },
    lerp(a, b, t) { return a + (b - a) * t; },
    angleBetween(a, b) {
      let d = b - a;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      return d;
    },
  };
};

// --------------------------------------------------------------------------
// Apply an Action by diffing key state and writing input.mouseX/Y/mouseDown.
// --------------------------------------------------------------------------
//
// The harness holds onto its own "held keys" set so we can release exactly
// the keys we asked for between frames, without trampling on the player's own
// keyboard if for some reason they're typing.
// --------------------------------------------------------------------------
const _held = new Set();
function _applyHeld(want) {
  for (const k of _held) if (!want.has(k)) input.keys.delete(k);
  for (const k of want) input.keys.add(k);
  _held.clear();
  for (const k of want) _held.add(k);
}
Arena.releaseAll = function () {
  for (const k of _held) input.keys.delete(k);
  _held.clear();
  input.mouseDown = false;
};

// Translate Action into key/mouse state. Defensive: action can be null,
// undefined, or missing fields.
Arena.applyAction = function (action) {
  const p = Game.player;
  if (!p || p.dead) { Arena.releaseAll(); return; }
  const a = action || {};
  const want = new Set();

  // Weapon switch first — game reads p.weapon next tick.
  if (typeof a.switchWeapon === 'string' && a.switchWeapon.length) {
    want.add(a.switchWeapon);
  }

  // Movement: 8-way mapping with a small dead-zone.
  if (a.move && typeof a.move.x === 'number' && typeof a.move.y === 'number') {
    let mx = a.move.x, my = a.move.y;
    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    if (mx >  0.35) want.add('d');
    if (mx < -0.35) want.add('a');
    if (my >  0.35) want.add('s');
    if (my < -0.35) want.add('w');
  }

  if (a.reload)   want.add('r');
  if (a.place)    want.add(' ');
  if (a.interact) want.add('e');

  // Aim + fire.
  if (a.aim && typeof a.aim.x === 'number' && typeof a.aim.y === 'number') {
    input.mouseX = a.aim.x - Game.camera.x;
    input.mouseY = a.aim.y - Game.camera.y;
  }
  input.mouseDown = !!a.fire;

  _applyHeld(want);
};

// --------------------------------------------------------------------------
// Soft lint: scan bot.decide source for forbidden identifiers.
// --------------------------------------------------------------------------
Arena.lintBot = function (bot) {
  if (!bot || typeof bot.decide !== 'function') {
    return { ok: false, reasons: ['bot.decide is not a function'] };
  }
  const src = bot.decide.toString();
  const hits = [];
  for (const name of Arena.FORBIDDEN_GLOBALS) {
    // Word boundary, and explicitly exclude leading "." so we don't flag
    // `perception.tick` as a reference to global `tick`. (Soft lint — string
    // literals and comments can still produce false positives.)
    const rx = new RegExp('(^|[^A-Za-z0-9_$.])' + name + '(?=[^A-Za-z0-9_$]|$)');
    if (rx.test(src)) hits.push(name);
  }
  return { ok: hits.length === 0, hits };
};

// --------------------------------------------------------------------------
// Registry for bots. Each bot file calls Arena.register(bot).
// --------------------------------------------------------------------------
Arena.bots = {};
Arena.register = function (bot) {
  if (!bot || !bot.name) {
    console.warn('[Arena] register: bot is missing a name');
    return;
  }
  if (Arena.bots[bot.name]) {
    console.warn(`[Arena] duplicate bot name "${bot.name}" — overwriting`);
  }
  Arena.bots[bot.name] = bot;
};
Arena.list = function () { return Object.keys(Arena.bots).sort(); };
Arena.get  = function (name) { return Arena.bots[name] || null; };

console.log('[Arena] api.js loaded');

})();
