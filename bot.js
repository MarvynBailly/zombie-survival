'use strict';

// Auto-pilot bot. State-machine architecture: one mode per frame, one
// movement intent. No force blending. Toggle with B. Console hook: window.bot.
//
// Loaded as a classic <script> after ui.js so it shares global lexical scope
// with the rest of the game (Game, World, NAV, Spatial, ctx, dist2, WEAPONS,
// ZOMBIES, DAY_PHASES, TICK_DT, input, findChestNear, findNearestUndiscoveredPOI,
// CHEST_PROMPT_RADIUS, ...). render() is a top-level function declaration, so
// it lives on window and we monkey-patch it to draw the debug overlay.

// ----------------------------------------------------------------------------
// Tunables
// ----------------------------------------------------------------------------

// Vision: bot can only "see" what's inside the camera viewport. Zombies also
// require an unobstructed line of sight from the player. Chests and pickups
// are visible if on-screen (no LOS gate — you can spot loot through a slim
// gap).
const BOT_VIEW_MARGIN  = 8;
const BOT_QUERY_RADIUS = 720;   // spatial-hash prefilter (px)

// Mode triggers
const EVADE_RADIUS    = 70;     // any zombie this close -> drop everything and flee
const ENGAGE_RADIUS   = 360;    // visible zombie closer than this -> ATTACK
const STUCK_WINDOW    = 1.5;    // seconds of position history we keep
const STUCK_MIN_MOVE  = 35;     // px displacement under this in window -> stuck++
const STUCK_TRIGGER   = 0.7;    // seconds stuck before we react (unstuck or sidestep)
const SIDESTEP_DUR    = 0.5;    // seconds we hold a sidestep direction

// Goal-rooted BFS: rebuild every 0.5s or when NAV recenters.
const BOT_GF_REBUILD  = 0.5;

// Mode priority (higher wins if both modes ask to be active).
const MODE_PRI = {
  evade: 5, unstuck: 4, attack: 3, sidestep: 2, travel: 1, idle: 0,
};
// Minimum time a mode stays active before a lower-or-equal priority mode can
// preempt it. Prevents single-frame flicker.
const MODE_MIN_DUR = {
  evade: 0.30, unstuck: 0.30, attack: 0.35, sidestep: SIDESTEP_DUR, travel: 0.20, idle: 0.00,
};

// ----------------------------------------------------------------------------
// State
// ----------------------------------------------------------------------------

const Bot = {
  enabled: false,
  state: {
    // Perception
    phase: 'day',
    secondsToDusk: 0,
    nearbyZombies: [],         // visible (viewport + LOS), sorted by distance
    nearestThreat: null,
    losToTarget: false,
    threatCount: 0,
    nearestChests: [],         // [{c, cx, cy, d2}]
    nearestPickups: [],

    // Plan
    travelGoal: null,          // {x, y, ref, reason}
    travelGoalReason: '',
    stuckT: 0,
    unstuckRef: null,          // breakable target found by ray-cast

    // Current intent (one decision per frame)
    mode: 'idle',
    modeUntilT: 0,
    intent: null,              // {mode, moveDir, fireAt, weaponSlot, interact}
    sidestepDirX: 0, sidestepDirY: 0,

    // Diagnostics for overlay
    aimX: 0, aimY: 0,
    firing: false,
    fireReason: '',
  },
  // Keys we asked the game to hold down on the previous frame; we diff against
  // this set so the human's keys are never touched.
  _heldKeys: new Set(),
  // Position samples for stuck detection: {t, x, y}.
  _posSamples: [],
  // Goal-rooted flow field — our own BFS over NAV.blocked from the travel
  // goal. NAV's own dist points zombies AT the player so we can't reuse it.
  _gf: {
    dist: null,
    cols: 0, rows: 0,
    originX: 0, originY: 0,
    goalX: 0, goalY: 0,
    rebuildT: 0,
  },
};

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function _botInView(x, y) {
  const vx = x - Game.camera.x, vy = y - Game.camera.y;
  return vx >= -BOT_VIEW_MARGIN && vy >= -BOT_VIEW_MARGIN
      && vx <= VIEW_W + BOT_VIEW_MARGIN
      && vy <= VIEW_H + BOT_VIEW_MARGIN;
}

// Seconds remaining until the next 'dusk' phase begins. Useful for "head
// home" timing later; for now it's a debug readout.
function botSecondsToDusk() {
  const t = Game.time.t;
  let acc = 0;
  for (let i = 0; i < DAY_PHASES.length; i++) {
    const ph = DAY_PHASES[i];
    if (ph.name === 'dusk') {
      if (t <= acc) return acc - t;
    }
    acc += ph.length;
  }
  const cycle = DAY_LENGTH;
  let duskStart = 0;
  for (let i = 0; i < DAY_PHASES.length; i++) {
    if (DAY_PHASES[i].name === 'dusk') break;
    duskStart += DAY_PHASES[i].length;
  }
  return (cycle - t) + duskStart;
}

// ----------------------------------------------------------------------------
// Goal-rooted flow field (BFS on NAV.blocked from the travel goal)
// ----------------------------------------------------------------------------

Bot._buildGoalFlow = function (goalX, goalY) {
  if (!NAV.blocked) return false;
  const cols = NAV.cols, rows = NAV.rows, cs = NAV.cellSize;
  const ox = NAV.originX, oy = NAV.originY;
  const n = cols * rows;
  const gf = this._gf;
  if (!gf.dist || gf.dist.length !== n) gf.dist = new Int32Array(n);
  gf.cols = cols; gf.rows = rows; gf.originX = ox; gf.originY = oy;

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
    if (best < 0) { gf.dist.fill(-1); return false; }
    goalIdx = best;
  }
  const dist = gf.dist;
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
  gf.goalX = goalX; gf.goalY = goalY;
  gf.rebuildT = BOT_GF_REBUILD;
  return true;
};

Bot._goalFlowDir = function (x, y) {
  const gf = this._gf;
  if (!gf.dist) return null;
  const cs = NAV.cellSize, cols = gf.cols, rows = gf.rows, ox = gf.originX, oy = gf.originY;
  if (x < ox || y < oy || x >= ox + cols * cs || y >= oy + rows * cs) return null;
  const cx = ((x - ox) / cs) | 0, cy = ((y - oy) / cs) | 0;
  const idx = cy * cols + cx;
  let myD = gf.dist[idx];
  if (myD < 0) myD = 1e9;
  let bestCost = myD, bestDx = 0, bestDy = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const ni = ny * cols + nx;
      const d = gf.dist[ni];
      if (d < 0) continue;
      if (dx !== 0 && dy !== 0) {
        if (NAV.blocked[cy * cols + nx] || NAV.blocked[ny * cols + cx]) continue;
      }
      const cost = d + (dx !== 0 && dy !== 0 ? 0.4 : 0);
      if (cost < bestCost) { bestCost = cost; bestDx = dx; bestDy = dy; }
    }
  }
  if (bestDx === 0 && bestDy === 0) return null;
  const l = Math.hypot(bestDx, bestDy);
  return [bestDx / l, bestDy / l];
};

// ----------------------------------------------------------------------------
// Weapon selection
// ----------------------------------------------------------------------------

// Pick a combat slot ('1'..'4') that has ammo and suits the situation.
Bot._pickWeaponSlot = function (p) {
  const u = p.unlocked, a = p.ammo;
  const has = (k) => u[k] && a[k] && ((a[k].mag || 0) > 0 || (a[k].reserve || 0) > 0 || WEAPONS[k].magSize === Infinity);
  const target = this.state.nearestThreat;
  const tdist = target ? Math.hypot(target.x - p.x, target.y - p.y) : Infinity;
  const isTank = target && target.type === 'tank';

  if (isTank && has('rocket') && tdist > (WEAPONS.rocket.explodeRadius + 80)) return '4';
  if (target && tdist < 160 && has('shotgun')) return '2';
  if (has('smg')) return '3';
  if (has('pistol')) return '1';
  if (has('shotgun')) return '2';
  if (has('rocket') && tdist > (WEAPONS.rocket.explodeRadius + 80)) return '4';
  return null;
};

// Pick a wall-shooting slot. No rocket (self-damage), no placers, prefer
// cheap ammo (pistol > SMG > shotgun).
Bot._pickWallSlot = function (p) {
  const u = p.unlocked, a = p.ammo;
  const has = (k) => u[k] && a[k] && ((a[k].mag || 0) > 0 || (a[k].reserve || 0) > 0 || WEAPONS[k].magSize === Infinity);
  if (has('pistol'))  return '1';
  if (has('smg'))     return '3';
  if (has('shotgun')) return '2';
  return null;
};

// ----------------------------------------------------------------------------
// Stuck detection + breakable ray-cast
// ----------------------------------------------------------------------------

Bot._updateStuck = function (p) {
  const t = now();
  const samples = this._posSamples;
  samples.push({ t, x: p.x, y: p.y });
  while (samples.length && samples[0].t < t - STUCK_WINDOW) samples.shift();

  // Only count stuck time when the bot was *trying* to move last frame —
  // intent.moveDir was non-null.
  const intent = this.state.intent;
  const wantedMove = intent && intent.moveDir;
  if (!wantedMove) { this.state.stuckT = 0; return; }

  if (samples.length < 4 || (t - samples[0].t) < (STUCK_WINDOW - 0.3)) return;
  const oldest = samples[0];
  const moved = Math.hypot(p.x - oldest.x, p.y - oldest.y);
  if (moved < STUCK_MIN_MOVE) this.state.stuckT += TICK_DT;
  else this.state.stuckT = 0;
};

// Ray-march from just outside the player along (dirX, dirY) for up to ~120 px
// looking for the first breakable obstacle (player wall or world obstacle
// with maxHp and not indestructible). Returns {x, y, kind, ref} or null.
Bot._findStuckBreakable = function (p, dirX, dirY) {
  if (dirX === 0 && dirY === 0) return null;
  const stepLen = 8, maxDist = 120;
  for (let d = p.r + 4; d <= maxDist; d += stepLen) {
    const sx = p.x + dirX * d;
    const sy = p.y + dirY * d;
    for (let i = 0; i < Game.walls.length; i++) {
      const w = Game.walls[i];
      if (sx >= w.x && sx <= w.x + w.w && sy >= w.y && sy <= w.y + w.h) {
        return { x: w.x + w.w / 2, y: w.y + w.h / 2, kind: 'wall', ref: w };
      }
    }
    let hit = null;
    World.forEachObstacleNear(sx, sy, 4, (o) => {
      if (hit) return;
      if (!o.maxHp || o.indestructible || o.dead) return;
      if (sx >= o.x && sx <= o.x + o.w && sy >= o.y && sy <= o.y + o.h) {
        hit = { x: o.x + o.w / 2, y: o.y + o.h / 2, kind: 'obstacle', ref: o };
      }
    });
    if (hit) return hit;
  }
  return null;
};

// ----------------------------------------------------------------------------
// Travel goal
// ----------------------------------------------------------------------------

// What does the bot WANT to walk toward? Visible chest > visible pickup >
// nearest undiscovered POI (same compass the player sees). Returns null when
// idle. Combat doesn't use this — ATTACK reads nearestThreat directly.
Bot._chooseTravelGoal = function (p) {
  const st = this.state;
  if (st.nearestChests.length) {
    const c = st.nearestChests[0];
    return { x: c.cx, y: c.cy, ref: c.c, reason: 'visible-chest' };
  }
  if (st.nearestPickups.length) {
    const pk = st.nearestPickups[0];
    return { x: pk.x, y: pk.y, ref: pk, reason: 'visible-pickup' };
  }
  const poi = findNearestUndiscoveredPOI(p.x, p.y);
  if (poi) return { x: poi.centerX, y: poi.centerY, ref: poi, reason: 'compass-poi' };
  return null;
};

// ----------------------------------------------------------------------------
// Perceive: gather game state, choose travel goal, update stuck timer.
// ----------------------------------------------------------------------------

Bot.perceive = function () {
  const p = Game.player;
  if (!p || p.dead) return;
  const st = this.state;

  st.phase = Game.time.phase;
  st.secondsToDusk = botSecondsToDusk();

  // Visible zombies (viewport + LOS).
  const scan = Spatial.query(p.x, p.y, BOT_QUERY_RADIUS, []);
  const zs = [];
  for (let i = 0; i < scan.length; i++) {
    const e = scan[i];
    if (!e || typeof e.hp !== 'number' || !e.type || !ZOMBIES[e.type]) continue;
    if (!_botInView(e.x, e.y)) continue;
    if (!NAV.hasLOS(p.x, p.y, e.x, e.y)) continue;
    zs.push(e);
  }
  zs.sort((a, b) => dist2(a, p) - dist2(b, p));
  st.nearbyZombies = zs;
  st.threatCount = zs.length;
  st.nearestThreat = zs.length ? zs[0] : null;
  st.losToTarget = !!st.nearestThreat;

  // Visible chests.
  const chests = [];
  World.forEachActiveChest(p.x, p.y, (c) => {
    if (c.opened) return;
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    if (!_botInView(cx, cy)) return;
    const dx = cx - p.x, dy = cy - p.y;
    chests.push({ c, cx, cy, d2: dx * dx + dy * dy });
  });
  chests.sort((a, b) => a.d2 - b.d2);
  st.nearestChests = chests.slice(0, 6);

  // Visible pickups.
  const pickups = [];
  const allPickups = Game.pickups || [];
  for (let i = 0; i < allPickups.length; i++) {
    const pk = allPickups[i];
    if (!_botInView(pk.x, pk.y)) continue;
    pickups.push(pk);
  }
  pickups.sort((a, b) => dist2(a, p) - dist2(b, p));
  st.nearestPickups = pickups.slice(0, 8);

  // Travel goal.
  const goal = this._chooseTravelGoal(p);
  st.travelGoal = goal;
  st.travelGoalReason = goal ? goal.reason : '';

  // Stuck timer (uses last frame's intent).
  this._updateStuck(p);

  // Pre-compute unstuck target if we're stuck. Ray toward the travel goal.
  st.unstuckRef = null;
  if (st.stuckT > STUCK_TRIGGER && goal) {
    let dx = goal.x - p.x, dy = goal.y - p.y;
    const dd = Math.hypot(dx, dy) || 1;
    const br = this._findStuckBreakable(p, dx / dd, dy / dd);
    if (br) st.unstuckRef = br;
  }

  // Rebuild goal flow when goal exists and either the NAV window moved, the
  // goal cell shifted, or the periodic timer fired.
  if (goal) {
    const gf = this._gf;
    const cs = NAV.cellSize;
    const windowMoved = gf.originX !== NAV.originX || gf.originY !== NAV.originY;
    const goalMoved =
      gf.cols === 0 ||
      Math.floor((goal.x - NAV.originX) / cs) !== Math.floor((gf.goalX - gf.originX) / cs) ||
      Math.floor((goal.y - NAV.originY) / cs) !== Math.floor((gf.goalY - gf.originY) / cs);
    gf.rebuildT -= TICK_DT;
    if (!gf.dist || windowMoved || goalMoved || gf.rebuildT <= 0) {
      this._buildGoalFlow(goal.x, goal.y);
    }
  }
};

// ----------------------------------------------------------------------------
// Decide: pick a mode and emit a single Intent.
// ----------------------------------------------------------------------------

Bot._decide = function (p) {
  const st = this.state;
  const tNow = now();
  const z0 = st.nearestThreat;
  const d0 = z0 ? Math.hypot(z0.x - p.x, z0.y - p.y) : Infinity;

  // Desired mode (before hysteresis).
  let desired;
  if (z0 && d0 < EVADE_RADIUS) {
    desired = 'evade';
  } else if (st.stuckT > STUCK_TRIGGER && st.unstuckRef) {
    desired = 'unstuck';
  } else if (z0 && d0 < ENGAGE_RADIUS && this._pickWeaponSlot(p)) {
    desired = 'attack';
  } else if (st.travelGoal) {
    // Stuck with no breakable in the way -> try a perpendicular sidestep.
    if (st.stuckT > STUCK_TRIGGER + 0.3 && !st.unstuckRef) desired = 'sidestep';
    else desired = 'travel';
  } else {
    desired = 'idle';
  }

  // Hysteresis: switch immediately to a higher-priority mode; otherwise wait
  // out the min duration so we don't flicker.
  if (st.mode !== desired) {
    const higher = MODE_PRI[desired] > MODE_PRI[st.mode];
    if (higher || tNow >= st.modeUntilT) {
      st.mode = desired;
      st.modeUntilT = tNow + (MODE_MIN_DUR[desired] || 0);
      // SIDESTEP picks its direction at mode-entry and holds it.
      if (desired === 'sidestep') {
        const flow = this._goalFlowDir(p.x, p.y);
        let fx = 1, fy = 0;
        if (flow) { fx = flow[0]; fy = flow[1]; }
        else if (st.travelGoal) {
          const ddx = st.travelGoal.x - p.x, ddy = st.travelGoal.y - p.y;
          const ll = Math.hypot(ddx, ddy) || 1;
          fx = ddx / ll; fy = ddy / ll;
        }
        // Perpendicular, random side. NAV-aware: if one side is blocked, pick the other.
        let side = Math.random() < 0.5 ? 1 : -1;
        const px = -fy * side, py = fx * side;
        if (NAV.blocked && NAV.inWindow(p.x, p.y)) {
          const probe = NAV.cellSize * 1.5;
          const ax = p.x + px * probe, ay = p.y + py * probe;
          const bx = p.x - px * probe, by_ = p.y - py * probe;
          const aBlk = NAV.inWindow(ax, ay) && NAV.blocked[NAV.cy(ay) * NAV.cols + NAV.cx(ax)];
          const bBlk = NAV.inWindow(bx, by_) && NAV.blocked[NAV.cy(by_) * NAV.cols + NAV.cx(bx)];
          if (aBlk && !bBlk) side = -side;
        }
        st.sidestepDirX = -fy * side;
        st.sidestepDirY =  fx * side;
      }
    }
  }

  // Emit intent for current mode.
  const intent = { mode: st.mode, moveDir: null, fireAt: null, weaponSlot: null, interact: false };

  // Loot interact (overlays on whatever else is happening).
  if (findChestNear(p.x, p.y, CHEST_PROMPT_RADIUS)) intent.interact = true;

  switch (st.mode) {
    case 'evade': {
      // Inverse-square weighted centroid of nearby zombies; flee directly away.
      let cx = 0, cy = 0, ws = 0;
      for (let i = 0; i < st.nearbyZombies.length; i++) {
        const z = st.nearbyZombies[i];
        const dd = Math.hypot(p.x - z.x, p.y - z.y);
        if (dd > EVADE_RADIUS * 1.6) continue;
        const w = 1 / Math.max(20, dd * dd);
        cx += z.x * w; cy += z.y * w; ws += w;
      }
      if (ws > 0) {
        cx /= ws; cy /= ws;
        const fx = p.x - cx, fy = p.y - cy;
        const fl = Math.hypot(fx, fy) || 1;
        intent.moveDir = { x: fx / fl, y: fy / fl };
      }
      // No firing during EVADE — focus on escape.
      break;
    }
    case 'unstuck': {
      const w = st.unstuckRef;
      const wx = w.x, wy = w.y;
      intent.fireAt = { x: wx, y: wy };
      intent.weaponSlot = this._pickWallSlot(p);
      // No movement — stand and shoot.
      break;
    }
    case 'attack': {
      const t = st.nearestThreat;
      if (t) {
        intent.weaponSlot = this._pickWeaponSlot(p);
        const weap = WEAPONS[intent.weaponSlot ? WEAPON_ORDER[parseInt(intent.weaponSlot, 10) - 1] : p.weapon];
        const bs = (weap && weap.bulletSpeed) || 900;
        const dd = Math.hypot(t.x - p.x, t.y - p.y);
        const tt = dd / bs;
        intent.fireAt = { x: t.x + (t.vx || 0) * tt, y: t.y + (t.vy || 0) * tt };
      }
      // No movement during ATTACK — accuracy first. EVADE preempts if a
      // zombie closes inside EVADE_RADIUS.
      break;
    }
    case 'sidestep': {
      intent.moveDir = { x: st.sidestepDirX, y: st.sidestepDirY };
      break;
    }
    case 'travel': {
      const flow = this._goalFlowDir(p.x, p.y);
      if (flow) {
        intent.moveDir = { x: flow[0], y: flow[1] };
      } else if (st.travelGoal) {
        const dx = st.travelGoal.x - p.x, dy = st.travelGoal.y - p.y;
        const dd = Math.hypot(dx, dy) || 1;
        intent.moveDir = { x: dx / dd, y: dy / dd };
      }
      break;
    }
    case 'idle':
    default:
      break;
  }

  return intent;
};

// ----------------------------------------------------------------------------
// Apply an Intent: write input.mouseX/Y, mouseDown, and key presses.
// ----------------------------------------------------------------------------

Bot._applyKeys = function (want) {
  for (const k of this._heldKeys) {
    if (!want.has(k)) input.keys.delete(k);
  }
  for (const k of want) input.keys.add(k);
  this._heldKeys = want;
};

Bot._applyIntent = function (p, intent) {
  const st = this.state;
  const want = new Set();

  // Weapon switch first so subsequent fire checks see the new weapon when
  // the game's update loop reads input next tick.
  if (intent.weaponSlot) {
    const desiredKey = WEAPON_ORDER[parseInt(intent.weaponSlot, 10) - 1];
    if (p.weapon !== desiredKey) want.add(intent.weaponSlot);
  }

  // Interact (E) — loot a chest underfoot.
  if (intent.interact) want.add('e');

  // Movement: 8-way mapping with 0.35 threshold to avoid jitter on near-axis vectors.
  if (intent.moveDir) {
    const nx = intent.moveDir.x, ny = intent.moveDir.y;
    if (nx >  0.35) want.add('d');
    if (nx < -0.35) want.add('a');
    if (ny >  0.35) want.add('s');
    if (ny < -0.35) want.add('w');
  }

  // Aim + fire.
  if (intent.fireAt) {
    st.aimX = intent.fireAt.x;
    st.aimY = intent.fireAt.y;
    input.mouseX = intent.fireAt.x - Game.camera.x;
    input.mouseY = intent.fireAt.y - Game.camera.y;

    const weap = WEAPONS[p.weapon];
    const dx = intent.fireAt.x - p.x, dy = intent.fireAt.y - p.y;
    const dist = Math.hypot(dx, dy);
    const inRange = dist <= (weap.bulletRange || 900) * 0.95;
    // Unstuck mode aims at a wall — LOS will be blocked BY that wall, so skip
    // the LOS check; bullets damage walls on contact anyway.
    const losClear = (intent.mode === 'unstuck') ? true
                     : NAV.hasLOS(p.x, p.y, intent.fireAt.x, intent.fireAt.y);
    const safeAoE = !weap.isRocket || dist > (weap.explodeRadius + 60);
    const ammo = p.ammo[p.weapon];
    const hasShot = ammo && (ammo.mag > 0 || weap.magSize === Infinity);
    const placerCantShoot = !!weap.isPlacer;

    const shouldFire = inRange && losClear && safeAoE && hasShot && !placerCantShoot;
    st.firing = shouldFire;
    st.fireReason = shouldFire ? 'fire'
                  : placerCantShoot ? 'placer'
                  : !inRange ? 'out-of-range'
                  : !losClear ? 'no-los'
                  : !safeAoE ? 'rocket-self'
                  : !hasShot ? 'empty'
                  : 'cooldown';
    input.mouseDown = shouldFire;
  } else {
    input.mouseDown = false;
    st.firing = false;
    st.fireReason = 'no-fire';
  }

  // Reload logic. The game's auto-reload-on-empty fires only when mouseDown
  // is held, but our fire gate drops mouseDown the moment mag hits 0, so we
  // have to drive the reload ourselves:
  //   - Always reload when current weapon's mag is empty + reserve has rounds.
  //   - Opportunistically top off below half during non-combat modes so the
  //     next ATTACK opens with a full clip.
  {
    const weap = WEAPONS[p.weapon];
    const a = p.ammo[p.weapon];
    if (weap && weap.magSize !== Infinity && a && a.reserve > 0 && p.reloading <= 0 && a.mag < weap.magSize) {
      const offCombat = intent.mode === 'travel' || intent.mode === 'idle' || intent.mode === 'sidestep';
      if (a.mag === 0 || (offCombat && a.mag < weap.magSize / 2)) {
        want.add('r');
      }
    }
  }

  this._applyKeys(want);
};

// ----------------------------------------------------------------------------
// Act: top-level driver
// ----------------------------------------------------------------------------

Bot.act = function () {
  if (!this.enabled || Game.mode !== 'playing') {
    this._applyKeys(new Set());
    input.mouseDown = false;
    return;
  }
  const p = Game.player;
  if (!p || p.dead) {
    this._applyKeys(new Set());
    input.mouseDown = false;
    return;
  }
  const intent = this._decide(p);
  this.state.intent = intent;
  this._applyIntent(p, intent);
};

// ----------------------------------------------------------------------------
// Overlay
// ----------------------------------------------------------------------------

const MODE_COLOR = {
  evade:    '#ff44aa',
  unstuck:  '#ff44aa',
  attack:   '#e35a2a',
  sidestep: '#ffd24b',
  travel:   '#5be3a4',
  idle:     '#7a7e88',
};

Bot.draw = function () {
  if (!this.enabled) return;
  if (Game.mode !== 'playing') return;
  const p = Game.player;
  if (!p || p.dead) return;
  const cam = Game.camera;
  const st = this.state;

  ctx.save();

  // EVADE / ATTACK / engage rings for reference.
  ctx.strokeStyle = 'rgba(226,80,80,0.45)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(p.x - cam.x, p.y - cam.y, EVADE_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(226,140,80,0.20)';
  ctx.beginPath();
  ctx.arc(p.x - cam.x, p.y - cam.y, ENGAGE_RADIUS, 0, Math.PI * 2);
  ctx.stroke();

  // Move-intent arrow.
  if (st.intent && st.intent.moveDir) {
    const ex = p.x - cam.x + st.intent.moveDir.x * 60;
    const ey = p.y - cam.y + st.intent.moveDir.y * 60;
    ctx.strokeStyle = MODE_COLOR[st.mode] || '#7ad97a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(p.x - cam.x, p.y - cam.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  // Target ring + aim crosshair.
  if (st.nearestThreat && (st.mode === 'attack' || st.mode === 'evade')) {
    const t = st.nearestThreat;
    ctx.strokeStyle = '#ff6464';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(t.x - cam.x, t.y - cam.y, (t.r || 12) + 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  if (st.intent && st.intent.fireAt) {
    const ax = st.aimX - cam.x, ay = st.aimY - cam.y;
    ctx.strokeStyle = st.firing ? '#ffea64' : '#9aa0a8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(ax - 7, ay); ctx.lineTo(ax + 7, ay);
    ctx.moveTo(ax, ay - 7); ctx.lineTo(ax, ay + 7);
    ctx.stroke();
  }

  // Chest markers.
  ctx.fillStyle = 'rgba(91,227,164,0.55)';
  ctx.strokeStyle = 'rgba(91,227,164,0.9)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < st.nearestChests.length && i < 3; i++) {
    const ch = st.nearestChests[i];
    ctx.beginPath();
    ctx.arc(ch.cx - cam.x, ch.cy - cam.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Travel goal marker (on-screen or edge arrow).
  if (st.travelGoal) {
    const gx = st.travelGoal.x - cam.x, gy = st.travelGoal.y - cam.y;
    const inView = gx >= 0 && gy >= 0 && gx <= VIEW_W && gy <= VIEW_H;
    ctx.strokeStyle = '#caa760';
    ctx.lineWidth = 1.2;
    if (inView) {
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(p.x - cam.x, p.y - cam.y);
      ctx.lineTo(gx, gy);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(gx, gy, 11, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      const cx = VIEW_W / 2, cy = VIEW_H / 2;
      const ang = Math.atan2(gy - cy, gx - cx);
      const ex = clamp(cx + Math.cos(ang) * 350, 30, VIEW_W - 30);
      const ey = clamp(cy + Math.sin(ang) * 250, 30, VIEW_H - 30);
      ctx.beginPath();
      ctx.arc(ex, ey, 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + Math.cos(ang) * 14, ey + Math.sin(ang) * 14);
      ctx.stroke();
    }
  }

  // Unstuck wall marker.
  if (st.mode === 'unstuck' && st.unstuckRef) {
    const w = st.unstuckRef.ref;
    const wcx = w.x + (w.w || 40) / 2 - cam.x;
    const wcy = w.y + (w.h || 40) / 2 - cam.y;
    ctx.strokeStyle = '#ff44aa';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(wcx, wcy, 18, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();

  // Text panel.
  ctx.save();
  ctx.font = '12px "JetBrains Mono", ui-monospace, monospace';
  ctx.textBaseline = 'top';
  const lines = [
    `BOT v1.0  [B to toggle]  state-machine`,
    `day=${Game.time.day}  phase=${st.phase}  ->dusk=${st.secondsToDusk.toFixed(1)}s`,
    `hp=${Math.round(p.hp)}/${p.maxHp}  weapon=${p.weapon}  walls=${p.ammo.wall.reserve}`,
    `MODE=${st.mode.toUpperCase()}  goal=${st.travelGoalReason || '-'}  stuck=${(st.stuckT || 0).toFixed(1)}s`,
    `threats=${st.threatCount}  nearest=${st.nearestThreat ? st.nearestThreat.type : '-'}`,
    `firing=${st.firing}  reason=${st.fireReason}`,
    `chests=${st.nearestChests.length}  pickups=${st.nearestPickups.length}`,
  ];
  const w = 320, h = 14 * lines.length + 12;
  ctx.fillStyle = 'rgba(7,8,10,0.78)';
  ctx.fillRect(8, 8, w, h);
  ctx.strokeStyle = MODE_COLOR[st.mode] || 'rgba(210,75,53,0.7)';
  ctx.strokeRect(8.5, 8.5, w - 1, h - 1);
  ctx.fillStyle = '#e8e6df';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 16, 14 + i * 14);
  }
  ctx.restore();
};

// ----------------------------------------------------------------------------
// Lifecycle + B-toggle + render hook
// ----------------------------------------------------------------------------

Bot.start  = function () { this.enabled = true; };
Bot.stop   = function () {
  this.enabled = false;
  this._applyKeys(new Set());
  input.mouseDown = false;
};
Bot.toggle = function () { if (this.enabled) this.stop(); else this.start(); };

window.bot = Bot;

window.addEventListener('keydown', (e) => {
  if (e.key && e.key.toLowerCase() === 'b' && Game.mode === 'playing') {
    Bot.toggle();
  }
});

(function patchRender() {
  const orig = window.render;
  if (typeof orig !== 'function') {
    console.warn('[bot] window.render not found; overlay will not draw.');
    return;
  }
  window.render = function (alpha) {
    orig(alpha);
    try {
      Bot.perceive();
      Bot.act();
      Bot.draw();
    } catch (err) {
      console.error('[bot] perceive/act/draw failed:', err);
    }
  };
})();
