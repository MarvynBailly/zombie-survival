'use strict';

// ============================================================================
// bot_predictor — predict zombie positions 1-1.5s ahead and route through cells
// that will be CLEAR at that future time. Uses weighted threat centroid for
// safe-direction computation and pathfindStep for wall-aware travel.
// ============================================================================

(function () {

const LOOKAHEAD_DAY     = 1.0;   // seconds
const LOOKAHEAD_NIGHT   = 1.5;
const COMBAT_R          = 400;   // any zombie within this -> combat mode
const FLEE_DIST         = 200;   // how far to project flee target
const HP_LOW            = 30;    // grab health pickups
const HP_PANIC          = 15;    // flat-out retreat
const RELOAD_SAFE_R     = 300;   // reload if no zombie within this
const DANGER_PAD        = 15;    // extra padding around predicted zombie

let lastFleeDir = null;

// ---- Weapon picking --------------------------------------------------------
function hasAmmo(w, key) {
  const e = w[key];
  if (!e || !e.unlocked) return false;
  return (e.mag || 0) > 0 || (e.reserve || 0) > 0 || e.magSize === Infinity;
}

// Predictor prefers SMG (kite-fire), pistol fallback, shotgun if very close,
// rocket for tanks at range.
function pickCombatSlot(self, target, api) {
  const w = self.weapons;
  const dist = target ? target.dist : Infinity;
  const tank = target && target.type === 'tank';
  if (tank && hasAmmo(w, 'rocket') && dist > (api.weapons.rocket.explodeRadius + 80)) {
    return w.rocket.slot;
  }
  if (target && dist < 140 && hasAmmo(w, 'shotgun')) return w.shotgun.slot;
  if (hasAmmo(w, 'smg'))     return w.smg.slot;
  if (hasAmmo(w, 'pistol'))  return w.pistol.slot;
  if (hasAmmo(w, 'shotgun')) return w.shotgun.slot;
  if (hasAmmo(w, 'crossbow')) return w.crossbow.slot;
  return null;
}

// ---- Predicted-position helpers --------------------------------------------
function predictZombie(z, lookahead) {
  return {
    x: z.x + (z.vx || 0) * lookahead,
    y: z.y + (z.vy || 0) * lookahead,
    r: z.r,
    type: z.type,
    src: z,
  };
}

// Safe direction: weighted centroid of predicted positions; flee unit vector.
function computeSafeDir(self, predicted) {
  if (!predicted.length) return null;
  let cx = 0, cy = 0, ws = 0;
  for (const p of predicted) {
    const dx = p.x - self.x, dy = p.y - self.y;
    const d2 = dx * dx + dy * dy;
    const w = 1 / (d2 + 1);
    cx += p.x * w; cy += p.y * w; ws += w;
  }
  if (ws <= 0) return null;
  cx /= ws; cy /= ws;
  const fx = self.x - cx, fy = self.y - cy;
  const fl = Math.hypot(fx, fy) || 1;
  return { x: fx / fl, y: fy / fl };
}

// Check whether a candidate point is inside any predicted danger zone.
function pointInDanger(px, py, predicted, selfR) {
  for (const p of predicted) {
    const dx = px - p.x, dy = py - p.y;
    const rr = p.r + selfR + DANGER_PAD;
    if (dx * dx + dy * dy <= rr * rr) return true;
  }
  return false;
}

// Try to nudge a flee target to a nearby angle if the straight one is blocked
// or sits inside a predicted danger zone.
function chooseFleeTarget(self, safeDir, predicted, api) {
  const tries = [0, 0.35, -0.35, 0.7, -0.7, 1.0, -1.0, 1.4, -1.4, 2.0];
  for (const a of tries) {
    const cs = Math.cos(a), sn = Math.sin(a);
    const dx = safeDir.x * cs - safeDir.y * sn;
    const dy = safeDir.x * sn + safeDir.y * cs;
    const tx = self.x + dx * FLEE_DIST;
    const ty = self.y + dy * FLEE_DIST;
    if (api.isBlocked(tx, ty)) continue;
    if (pointInDanger(tx, ty, predicted, self.r)) continue;
    return { x: tx, y: ty, dx, dy };
  }
  // Best-effort fallback even if blocked: original direction.
  return {
    x: self.x + safeDir.x * FLEE_DIST,
    y: self.y + safeDir.y * FLEE_DIST,
    dx: safeDir.x,
    dy: safeDir.y,
  };
}

// ---- Goal selection for calm phases ----------------------------------------
function chooseCalmGoal(perception, self) {
  // Health-first if low.
  if (self.hp < HP_LOW) {
    let best = null, bestD = Infinity;
    for (const p of perception.pickups || []) {
      if (p.kind === 'health' || p.kind === 'medkit' || p.kind === 'heal') {
        if (p.dist < bestD) { bestD = p.dist; best = p; }
      }
    }
    if (best) return best;
  }
  if (perception.chests[0])  return perception.chests[0];
  if (perception.pickups[0]) return perception.pickups[0];
  if (perception.nearestPOI) return perception.nearestPOI;
  return null;
}

// ---- Combat target picking with LOS gate -----------------------------------
function pickShootTarget(perception, api, self) {
  for (const z of perception.zombies) {
    if (api.hasLOS(self.x, self.y, z.x, z.y)) return z;
  }
  return null;
}

Arena.register({
  name:    'predictor',
  author:  'agent',
  version: '1.0',

  reset() {
    lastFleeDir = null;
  },

  decide(perception, api) {
    const self = perception.self;
    const action = {};

    // ---- Predict zombie positions ----
    const isNight = perception.phase === 'night';
    const lookahead = isNight ? LOOKAHEAD_NIGHT : LOOKAHEAD_DAY;
    const predicted = perception.zombies.map((z) => predictZombie(z, lookahead));

    const z0 = perception.zombies[0] || null;
    const d0 = z0 ? z0.dist : Infinity;

    // Loot if right on top of a chest.
    if (perception.chests[0] && perception.chests[0].dist < 60) {
      action.interact = true;
    }

    // ---- Panic retreat: HP < 15 ----
    if (self.hp < HP_PANIC && predicted.length) {
      const safeDir = computeSafeDir(self, predicted) || lastFleeDir;
      if (safeDir) {
        const flee = chooseFleeTarget(self, safeDir, predicted, api);
        const step = api.pathfindStep(self, flee) || { x: flee.dx, y: flee.dy };
        action.move = step;
        lastFleeDir = safeDir;
      }
      // Still shoot if we can — but reload if mag empty.
      if (self.ammo.magSize !== Infinity && self.ammo.mag === 0 && self.ammo.reserve > 0) {
        action.reload = true;
      } else {
        const t = pickShootTarget(perception, api, self);
        if (t) {
          const slot = pickCombatSlot(self, t, api);
          if (slot) action.switchWeapon = slot;
          const weap = api.weapons[self.weapon] || api.weapons.pistol;
          action.aim = api.leadShot(self, t, weap.bulletSpeed || 900);
          const inRange = t.dist <= (weap.bulletRange || 700) * 0.9;
          action.fire = inRange && self.ammo.mag > 0 && !weap.isPlacer;
        }
      }
      return action;
    }

    // ---- Combat phase: any zombie within COMBAT_R ----
    const inCombat = z0 && d0 < COMBAT_R;

    if (inCombat) {
      // 1) Move along safe direction via pathfindStep.
      const safeDir = computeSafeDir(self, predicted);
      if (safeDir) {
        lastFleeDir = safeDir;
        const tightRange = isNight ? FLEE_DIST * 0.8 : FLEE_DIST;
        const tries = [0, 0.35, -0.35, 0.7, -0.7, 1.0, -1.0, 1.4, -1.4];
        let chosen = null;
        for (const a of tries) {
          const cs = Math.cos(a), sn = Math.sin(a);
          const dx = safeDir.x * cs - safeDir.y * sn;
          const dy = safeDir.x * sn + safeDir.y * cs;
          const tx = self.x + dx * tightRange;
          const ty = self.y + dy * tightRange;
          if (api.isBlocked(tx, ty)) continue;
          if (pointInDanger(tx, ty, predicted, self.r)) continue;
          chosen = { x: tx, y: ty, dx, dy };
          break;
        }
        if (!chosen) {
          chosen = {
            x: self.x + safeDir.x * tightRange,
            y: self.y + safeDir.y * tightRange,
            dx: safeDir.x, dy: safeDir.y,
          };
        }
        action.move = api.pathfindStep(self, chosen) || { x: chosen.dx, y: chosen.dy };
      }

      // 2) Aim/fire at nearest with LOS.
      const target = pickShootTarget(perception, api, self) || z0;
      if (target) {
        const slot = pickCombatSlot(self, target, api);
        if (slot) action.switchWeapon = slot;
        const weap = api.weapons[self.weapon] || api.weapons.pistol;
        action.aim = api.leadShot(self, target, weap.bulletSpeed || 900);
        const inRange = target.dist <= (weap.bulletRange || 700) * 0.9;
        const safeAoE = !weap.isRocket || target.dist > (weap.explodeRadius + 60);
        const hasLOS = api.hasLOS(self.x, self.y, target.x, target.y);
        action.fire = hasLOS && inRange && safeAoE && self.ammo.mag > 0 && !weap.isPlacer;
      }

      // 3) Reload if mag empty and reserve available.
      if (self.ammo.magSize !== Infinity && self.ammo.mag === 0 &&
          self.ammo.reserve > 0 && self.reloading <= 0) {
        action.reload = true;
      }
      return action;
    }

    // ---- Calm phase: drift toward goal ----
    const goal = chooseCalmGoal(perception, self);
    if (goal) {
      const step = api.pathfindStep(self, goal);
      if (step) {
        action.move = step;
      } else {
        const dx = goal.x - self.x, dy = goal.y - self.y;
        const m = Math.hypot(dx, dy) || 1;
        action.move = { x: dx / m, y: dy / m };
      }
      // Aim along travel direction so an emerging threat is already covered.
      action.aim = { x: self.x + action.move.x * 200, y: self.y + action.move.y * 200 };
    }

    // ---- Reload policy: out-of-combat top-up, or no zombie within 300px ----
    const nearestD = z0 ? d0 : Infinity;
    const allBlocked = perception.zombies.length > 0 &&
      perception.zombies.every((z) => !api.hasLOS(self.x, self.y, z.x, z.y));
    const safeToReload = nearestD > RELOAD_SAFE_R || allBlocked;
    if (self.ammo.magSize !== Infinity && self.ammo.reserve > 0 &&
        self.reloading <= 0 && self.ammo.mag < self.ammo.magSize) {
      if (self.ammo.mag === 0 || safeToReload) {
        action.reload = true;
      }
    }

    return action;
  },
});

})();
