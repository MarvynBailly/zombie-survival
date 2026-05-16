'use strict';

// ============================================================================
// bot_fortress — fortify near spawn, funnel zombies through one opening.
// ============================================================================
// Build a 3-sided wall pocket (south + east + west) near the spawn point.
// The north side is the funnel. Pad it with barrels so anything that wades
// in eats a chain explosion. Then plant feet inside the pocket, face north,
// and burn ammo at whatever comes through. Repair walls as they break.
// ============================================================================

(function () {

// ---- Tunables -------------------------------------------------------------
const WALL_SIZE       = 40;
const POCKET_HALF     = 3 * WALL_SIZE; // half-width of the enclosure (~120px)
const DAMAGED_HP      = 60;            // walls below this need a backup behind them
const REPAIR_INSET    = 28;            // how far inside the pocket the patch sits
const BARREL_DROP_R   = 36;            // distance threshold for "placed it"
const WALL_DROP_R     = 30;
const RESTOCK_R       = 220;           // pull pickups/chests within this much of anchor
const RESTOCK_R_SAFE  = 600;           // farther grabs only when no zombies near
const FAR_GOAL_OK     = 900;
const SPRINT_HP       = 30;            // emergency health threshold
const ROCKET_MIN_DIST = 200;           // never fire rocket at closer than this
const ROCKET_TANK_R   = 480;
const ENGAGE_R        = 700;
const KITE_R          = 60;            // if a zombie is THIS close, sidestep south
const ARRIVE_R        = 18;            // close enough to a placement target

// ---- Per-match state ------------------------------------------------------
let anchor = null;          // {x, y} - centre of the fortress
let plan   = null;          // ordered list of placements
let planIx = 0;
let lastPlaceT = -10;
let lastSwitchT = -10;
let buildSwitchedT = -10;
let initialised = false;

// Build the placement plan. South/east/west walls form a U; barrels seed
// the north opening. We do walls first (defense), then barrels (offense).
function buildPlan(ax, ay) {
  const out = [];
  // South wall: 5 segments across the bottom
  for (let i = -2; i <= 2; i++) {
    out.push({ kind: 'wall', x: ax + i * WALL_SIZE, y: ay + POCKET_HALF });
  }
  // East wall: 2 segments on the right side
  for (let i = 0; i <= 1; i++) {
    out.push({ kind: 'wall', x: ax + POCKET_HALF, y: ay + i * WALL_SIZE });
  }
  // West wall: 2 segments on the left side
  for (let i = 0; i <= 1; i++) {
    out.push({ kind: 'wall', x: ax - POCKET_HALF, y: ay + i * WALL_SIZE });
  }
  // Barrel seeds at the north funnel (slightly outside the pocket)
  out.push({ kind: 'barrel', x: ax - WALL_SIZE,     y: ay - POCKET_HALF - 20 });
  out.push({ kind: 'barrel', x: ax + WALL_SIZE,     y: ay - POCKET_HALF - 20 });
  out.push({ kind: 'barrel', x: ax,                 y: ay - POCKET_HALF - 60 });
  out.push({ kind: 'barrel', x: ax - 2 * WALL_SIZE, y: ay - POCKET_HALF - 60 });
  out.push({ kind: 'barrel', x: ax + 2 * WALL_SIZE, y: ay - POCKET_HALF - 60 });
  return out;
}

// ---- Helpers --------------------------------------------------------------
function hasWeapon(self, key) {
  const w = self.weapons[key];
  if (!w || !w.unlocked) return false;
  return (w.mag || 0) > 0 || (w.reserve || 0) > 0 || w.magSize === Infinity;
}

function hasPlacer(self, key) {
  // Wall/barrel inventory uses reserve as the count
  const w = self.weapons[key];
  if (!w || !w.unlocked) return false;
  return (w.reserve || 0) > 0;
}

// Find a wall I placed near (tx, ty) - so we don't double-place.
function wallNear(perception, tx, ty, r) {
  for (const w of perception.walls) {
    if (!w.mine) continue;
    if (Math.hypot(w.cx - tx, w.cy - ty) < r) return w;
  }
  return null;
}

function barrelNear(perception, tx, ty, r) {
  for (const b of perception.barrels) {
    if (Math.hypot(b.x - tx, b.y - ty) < r) return b;
  }
  return null;
}

// Pick the best damage-output weapon for current target.
function pickCombatSlot(self, target, api) {
  const tank = target && target.type === 'tank';
  const d = target ? target.dist : Infinity;
  if (tank && hasWeapon(self, 'rocket') && d > ROCKET_MIN_DIST && d < ROCKET_TANK_R) {
    return self.weapons.rocket.slot;
  }
  if (d < 180 && hasWeapon(self, 'shotgun')) return self.weapons.shotgun.slot;
  if (hasWeapon(self, 'minigun'))            return self.weapons.minigun.slot;
  if (hasWeapon(self, 'smg'))                return self.weapons.smg.slot;
  if (hasWeapon(self, 'crossbow'))           return self.weapons.crossbow.slot;
  if (hasWeapon(self, 'shotgun'))            return self.weapons.shotgun.slot;
  if (hasWeapon(self, 'pistol'))             return self.weapons.pistol.slot;
  return null;
}

// Identify the next thing to place. Returns {target, kind, slot} or null.
function nextPlacement(self, perception) {
  // First check: damaged fortress walls need a backup behind them
  const repair = findDamagedFortressWall(perception);
  if (repair && hasPlacer(self, 'wall')) {
    return { target: repair, kind: 'wall', slot: self.weapons.wall.slot };
  }
  // Otherwise walk the build plan
  while (planIx < plan.length) {
    const step = plan[planIx];
    if (step.kind === 'wall') {
      if (wallNear(perception, step.x, step.y, 26)) { planIx++; continue; }
      if (!hasPlacer(self, 'wall')) return null;
      return { target: step, kind: 'wall', slot: self.weapons.wall.slot };
    }
    if (step.kind === 'barrel') {
      if (barrelNear(perception, step.x, step.y, 30)) { planIx++; continue; }
      if (!hasPlacer(self, 'barrel')) { planIx++; continue; } // skip if no barrels
      return { target: step, kind: 'barrel', slot: self.weapons.barrel.slot };
    }
    planIx++;
  }
  return null;
}

// Find one of OUR fortress walls (south/east/west) that's damaged and
// doesn't yet have a backup behind it.
function findDamagedFortressWall(perception) {
  if (!anchor) return null;
  let worst = null;
  for (const w of perception.walls) {
    if (!w.mine) continue;
    if (w.hp >= DAMAGED_HP) continue;
    // Side this wall belongs to (relative to anchor)
    const dx = w.cx - anchor.x;
    const dy = w.cy - anchor.y;
    let backup;
    if (dy > WALL_SIZE && Math.abs(dy) > Math.abs(dx)) {
      backup = { x: w.cx, y: w.cy - REPAIR_INSET };       // south wall: patch north of it
    } else if (dx > WALL_SIZE && Math.abs(dx) > Math.abs(dy)) {
      backup = { x: w.cx - REPAIR_INSET, y: w.cy };       // east wall: patch west of it
    } else if (dx < -WALL_SIZE && Math.abs(dx) > Math.abs(dy)) {
      backup = { x: w.cx + REPAIR_INSET, y: w.cy };       // west wall: patch east of it
    } else {
      continue;                                           // north or interior, skip
    }
    if (wallNear(perception, backup.x, backup.y, 22)) continue;
    if (!worst || w.hp < worst.hp) worst = backup;
  }
  return worst;
}

// Move toward a goal using flow-field; fall back to unit vector.
function stepToward(self, goal, api) {
  const step = api.pathfindStep(self, goal);
  if (step) return step;
  const dx = goal.x - self.x, dy = goal.y - self.y;
  const m = Math.hypot(dx, dy) || 1;
  return { x: dx / m, y: dy / m };
}

// ---- Registration ---------------------------------------------------------
Arena.register({
  name:    'fortress',
  author:  'agent',
  version: '1.0',

  reset() {
    anchor = null;
    plan = null;
    planIx = 0;
    lastPlaceT = -10;
    lastSwitchT = -10;
    buildSwitchedT = -10;
    initialised = false;
  },

  decide(perception, api) {
    const self = perception.self;
    const t    = perception.elapsed;
    const action = {};

    // ----- One-time init: anchor on spawn -----
    if (!initialised) {
      anchor = { x: self.x, y: self.y };
      plan = buildPlan(anchor.x, anchor.y);
      planIx = 0;
      initialised = true;
    }

    const z0 = perception.zombies[0] || null;
    const distToAnchor = Math.hypot(self.x - anchor.x, self.y - anchor.y);

    // ----- Chest looting (free pickups, but only when safe-ish) -----
    if (perception.chests[0] && perception.chests[0].dist < 60) {
      action.interact = true;
    }

    // ===== EMERGENCY: low HP, run to nearest health pickup =====
    if (self.hp < SPRINT_HP) {
      let health = null;
      for (const p of perception.pickups) {
        if (p.kind === 'health' || p.type === 'health') { health = p; break; }
      }
      if (!health && perception.pickups[0]) health = perception.pickups[0];
      if (health) {
        action.move = stepToward(self, health, api);
        if (z0) {
          const bs = (api.weapons[self.weapon] || api.weapons.pistol).bulletSpeed || 900;
          action.aim = api.leadShot(self, z0, bs);
          action.fire = z0.dist < ENGAGE_R && self.ammo.mag > 0
                        && !(api.weapons[self.weapon] || {}).isPlacer
                        && !(api.weapons[self.weapon] || {}).isRocket;
        }
        return action;
      }
    }

    // ===== BUILD MODE: still placing fortress walls/barrels =====
    const place = nextPlacement(self, perception);
    const inDangerNow = z0 && z0.dist < 120;

    if (place && !inDangerNow) {
      const distToTarget = Math.hypot(self.x - place.target.x, self.y - place.target.y);
      // Switch to the placer once
      if (self.weapon !== place.kind && t - lastSwitchT > 0.25) {
        action.switchWeapon = place.slot;
        lastSwitchT = t;
        buildSwitchedT = t;
      }
      if (distToTarget > ARRIVE_R) {
        // Walk to the placement spot
        action.move = stepToward(self, place.target, api);
      } else {
        // Stand on the spot, press space (debounced)
        if (self.weapon === place.kind && (self.placeCd === undefined || self.placeCd <= 0)
            && t - lastPlaceT > 0.25 && t - buildSwitchedT > 0.1) {
          action.place = true;
          lastPlaceT = t;
        }
      }
      // Defensive shooting while building, if a zombie is within sight
      if (z0 && z0.dist < ENGAGE_R) {
        const bs = (api.weapons[self.weapon] || api.weapons.pistol).bulletSpeed || 900;
        action.aim = api.leadShot(self, z0, bs);
        // Don't fire while wielding a placer — it'd waste the place tick
      }
      return action;
    }

    // ===== COMBAT/HOLD MODE =====
    // Stay in the pocket. If we've wandered out, walk back.
    if (distToAnchor > 80) {
      action.move = stepToward(self, anchor, api);
    } else if (z0 && z0.dist < KITE_R) {
      // Zombie touched us — sidestep south (into the pocket) so the funnel
      // walls catch them rather than running circles round us.
      const fx = self.x - z0.x;
      const fy = self.y - z0.y;
      const m = Math.hypot(fx, fy) || 1;
      action.move = { x: fx / m, y: fy / m };
    } else {
      // Light restock pulls: nearby pickup or chest, only if safe
      let restock = null;
      if (perception.pickups[0]) restock = perception.pickups[0];
      else if (perception.chests[0]) restock = perception.chests[0];
      if (restock) {
        const r = restock.dist;
        const safe = !z0 || z0.dist > 250;
        const limit = safe ? RESTOCK_R_SAFE : RESTOCK_R;
        if (r < limit && Math.hypot(restock.x - anchor.x, restock.y - anchor.y) < FAR_GOAL_OK) {
          action.move = stepToward(self, restock, api);
        }
      }
    }

    // Pick combat weapon
    if (z0) {
      const slot = pickCombatSlot(self, z0, api);
      const curIsPlacer = (api.weapons[self.weapon] || {}).isPlacer;
      if (slot && (self.weapon !== self.weapon /*noop*/) || curIsPlacer) {
        // Force out of placer if currently holding one
        if (curIsPlacer && slot && t - lastSwitchT > 0.2) {
          action.switchWeapon = slot;
          lastSwitchT = t;
        }
      } else if (slot && t - lastSwitchT > 0.5) {
        // Map current weapon key to expected slot
        const curSlot = (self.weapons[self.weapon] || {}).slot;
        if (curSlot !== slot) {
          action.switchWeapon = slot;
          lastSwitchT = t;
        }
      }

      const weapKey = self.weapon;
      const weap    = api.weapons[weapKey] || api.weapons.pistol;
      action.aim    = api.leadShot(self, z0, weap.bulletSpeed || 900);

      const inRange   = z0.dist <= (weap.bulletRange || weap.range || 700) * 0.95;
      const safeAoE   = !weap.isRocket || z0.dist > Math.max(ROCKET_MIN_DIST, (weap.explodeRadius || 120) + 80);
      const canFire   = self.ammo.mag > 0 && !weap.isPlacer;
      action.fire     = inRange && safeAoE && canFire;
    } else {
      // Idle aim toward the funnel (north) so we're ready
      action.aim = { x: anchor.x, y: anchor.y - 400 };
    }

    // Reload policy: if mag empty, or if no threat and mag below half
    const mag = self.ammo.mag, res = self.ammo.reserve, size = self.ammo.magSize;
    if (size !== Infinity && res > 0 && self.reloading <= 0 && mag < size) {
      const safe = !z0 || z0.dist > 260;
      if (mag === 0 || (safe && mag < size / 2)) action.reload = true;
    }

    return action;
  },
});

})();
