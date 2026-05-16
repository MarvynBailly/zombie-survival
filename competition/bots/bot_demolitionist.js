'use strict';

// ============================================================================
// bot_demolitionist v2 — pistol-first, explosives-as-bonus.
// ============================================================================
// v1 lost because it idled waiting for barrels/rockets that stay locked on
// day 1. v2 acts like `simple` by default (aim nearest, fire every tick) and
// only switches to explosives when they're actually unlocked AND safe.
//
// Priority ladder each tick:
//   1. EMERGENCY (hp<25) — retreat to pickup, pistol while fleeing.
//   2. ROCKET   — 3+ cluster, centroid >=240px from self.
//   3. GL       — 3+ cluster, centroid >=200px from self.
//   4. BARREL TRIGGER — placed barrel with zombies on it, we're safe → shoot.
//   5. BARREL PLACE  — moving, no zombie within 200px, reserve>0.
//   6. PISTOL DEFAULT — aim + fire at nearest visible zombie, kite if <140px.
//   7. RELOAD/LOOT/TRAVEL — only when no shooting needed.
// ============================================================================

(function () {

const KITE_R          = 140;
const PISTOL_RANGE_F  = 0.9;
const ROCKET_SAFE     = 240;   // explodeRadius 120 + 120 margin
const ROCKET_CLUSTER  = 90;
const GL_SAFE         = 200;   // explodeRadius 90 + 110 margin
const GL_CLUSTER      = 100;
const GL_MAX_RANGE    = 680;
const BARREL_SAFE     = 200;   // don't place if any zombie this close
const BARREL_TRIG_R   = 70;    // zombie within this of barrel → trigger
const BARREL_TRIG_MIN = 2;     // need at least N zombies to bother
const PLACE_COOLDOWN  = 1.5;
const POI_MAX_DIST    = 800;

let lastPlaceT = -999;

// ---------------------------------------------------------------- helpers ---

function unlocked(self, key) {
  const w = self.weapons[key];
  return !!(w && w.unlocked);
}

function hasAmmo(self, key) {
  const w = self.weapons[key];
  if (!w) return false;
  if (w.magSize === Infinity) return true;
  return (w.mag || 0) > 0 || (w.reserve || 0) > 0;
}

function loaded(self, key) {
  const w = self.weapons[key];
  if (!w) return false;
  if (w.magSize === Infinity) return true;
  return (w.mag || 0) > 0;
}

// Find tightest cluster of >=minCount zombies around any zombie center.
// Returns { cx, cy, count } or null. Only considers zombies within maxDist.
function bestCluster(self, zombies, R, maxDist, minCount) {
  let best = null;
  for (let i = 0; i < zombies.length; i++) {
    const a = zombies[i];
    if (a.dist > maxDist) continue;
    let cx = a.x, cy = a.y, n = 1;
    for (let j = 0; j < zombies.length; j++) {
      if (i === j) continue;
      const b = zombies[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      if (Math.hypot(dx, dy) <= R) {
        cx += b.x; cy += b.y; n++;
      }
    }
    if (n < minCount) continue;
    cx /= n; cy /= n;
    if (!best || n > best.count) best = { cx, cy, count: n };
  }
  return best;
}

// Barrel that has >=N zombies hugging it and that we're safely far from.
function findBarrelTrigger(self, barrels, zombies) {
  if (!barrels || !barrels.length) return null;
  for (const b of barrels) {
    if (b.dist < BARREL_SAFE) continue;
    let near = 0;
    for (const z of zombies) {
      const dx = z.x - b.x, dy = z.y - b.y;
      if (Math.hypot(dx, dy) <= BARREL_TRIG_R) near++;
    }
    if (near >= BARREL_TRIG_MIN) return b;
  }
  return null;
}

function fleeStep(self, target, api) {
  const dx = self.x - target.x, dy = self.y - target.y;
  const m = Math.hypot(dx, dy) || 1;
  const point = { x: self.x + (dx / m) * 200, y: self.y + (dy / m) * 200 };
  return api.pathfindStep(self, point) || { x: dx / m, y: dy / m };
}

function moveTo(self, goal, api) {
  const step = api.pathfindStep(self, goal);
  if (step) return step;
  const dx = goal.x - self.x, dy = goal.y - self.y;
  const m = Math.hypot(dx, dy) || 1;
  return { x: dx / m, y: dy / m };
}

// ------------------------------------------------------------------ main ---

Arena.register({
  name:    'demolitionist',
  author:  'agent',
  version: '2.0',

  reset() {
    lastPlaceT = -999;
  },

  decide(perception, api) {
    const self    = perception.self;
    const zombies = perception.zombies || [];
    const barrels = perception.barrels || [];
    const t       = perception.elapsed || 0;
    const z0      = zombies[0] || null;
    const d0      = z0 ? z0.dist : Infinity;

    const pistol  = api.weapons.pistol;
    const PISTOL_BS    = (pistol && pistol.bulletSpeed) || 900;
    const PISTOL_RANGE = (pistol && pistol.bulletRange) || 900;

    const action = {
      move: null, aim: null, fire: false, reload: false,
      switchWeapon: null, place: false, interact: false,
    };

    // ----- Always loot if standing on a chest -----
    if (perception.chests[0] && perception.chests[0].dist < 60) {
      action.interact = true;
    }

    // ----- Default aim: always lead nearest zombie if any visible -----
    if (z0) action.aim = api.leadShot(self, z0, PISTOL_BS);

    // =================================================================
    // 1. EMERGENCY — low HP, run to pickup; pistol while running.
    // =================================================================
    if (self.hp < 25) {
      const pickup = perception.pickups[0];
      if (pickup) action.move = moveTo(self, pickup, api);
      else if (z0) action.move = fleeStep(self, z0, api);
      if (z0 && d0 < PISTOL_RANGE * PISTOL_RANGE_F) {
        action.switchWeapon = self.weapon === 'pistol' ? null : '1';
        action.fire = !self.reloading;
      }
      return action;
    }

    // =================================================================
    // 2. ROCKET — cluster of 3+ at safe distance.
    // =================================================================
    if (unlocked(self, 'rocket') && hasAmmo(self, 'rocket') && zombies.length >= 3) {
      const rocket = api.weapons.rocket;
      const range  = (rocket && rocket.bulletRange) || 700;
      const cluster = bestCluster(self, zombies, ROCKET_CLUSTER, range * 0.95, 3);
      if (cluster) {
        const dC = Math.hypot(cluster.cx - self.x, cluster.cy - self.y);
        if (dC >= ROCKET_SAFE && d0 >= ROCKET_SAFE &&
            api.hasLOS(self.x, self.y, cluster.cx, cluster.cy)) {
          if (self.weapon !== 'rocket') {
            action.switchWeapon = '4';
            // Keep aim on cluster so the switch tick is useful.
            action.aim = { x: cluster.cx, y: cluster.cy };
            return action;
          }
          action.aim = { x: cluster.cx, y: cluster.cy };
          if (loaded(self, 'rocket') && !self.reloading) action.fire = true;
          return action;
        }
      }
    }

    // =================================================================
    // 3. GRENADE LAUNCHER — cluster of 3+, slightly closer is fine.
    // =================================================================
    if (unlocked(self, 'gl') && hasAmmo(self, 'gl') && zombies.length >= 3) {
      const cluster = bestCluster(self, zombies, GL_CLUSTER, GL_MAX_RANGE, 3);
      if (cluster) {
        const dC = Math.hypot(cluster.cx - self.x, cluster.cy - self.y);
        if (dC >= GL_SAFE && d0 >= GL_SAFE &&
            api.hasLOS(self.x, self.y, cluster.cx, cluster.cy)) {
          if (self.weapon !== 'gl') {
            action.switchWeapon = '-';
            action.aim = { x: cluster.cx, y: cluster.cy };
            return action;
          }
          action.aim = { x: cluster.cx, y: cluster.cy };
          if (loaded(self, 'gl') && !self.reloading) action.fire = true;
          return action;
        }
      }
    }

    // =================================================================
    // 4. BARREL TRIGGER — placed barrel with crowd → pistol-detonate.
    // =================================================================
    const trigger = findBarrelTrigger(self, barrels, zombies);
    if (trigger && unlocked(self, 'pistol') &&
        api.hasLOS(self.x, self.y, trigger.x, trigger.y)) {
      if (self.weapon !== 'pistol') action.switchWeapon = '1';
      action.aim = { x: trigger.x, y: trigger.y };
      action.fire = self.weapon === 'pistol' && !self.reloading;
      return action;
    }

    // =================================================================
    // 5. BARREL PLACE — only when safe (no zombie within 200px).
    // =================================================================
    const canPlace = unlocked(self, 'barrel') &&
                     (self.weapons.barrel.reserve || 0) > 0 &&
                     self.placeCd <= 0 &&
                     (t - lastPlaceT) > PLACE_COOLDOWN &&
                     d0 > BARREL_SAFE &&
                     zombies.length > 0 && d0 < 600;
    if (canPlace) {
      if (self.weapon !== 'barrel') {
        // Switch this tick, place next. Keep pistol-aim/fire for now would be
        // ideal but switchWeapon is the priority — at least keep firing aim.
        action.switchWeapon = '5';
        // Move slightly toward the approaching crowd so barrel lands ahead.
        if (z0) {
          const dx = z0.x - self.x, dy = z0.y - self.y;
          const m = Math.hypot(dx, dy) || 1;
          action.move = { x: dx / m * 0.5, y: dy / m * 0.5 };
        }
        return action;
      }
      // On barrel slot — drop it and immediately want to switch back next tick.
      action.place = true;
      lastPlaceT = t;
      // Step away from the crowd while placing.
      if (z0) action.move = fleeStep(self, z0, api);
      return action;
    }

    // If we're holding barrel but conditions aren't right, get back to pistol.
    if (self.weapon === 'barrel') {
      action.switchWeapon = '1';
    }

    // =================================================================
    // 6. PISTOL DEFAULT — fire every tick at nearest visible zombie.
    // =================================================================
    if (z0) {
      if (self.weapon !== 'pistol' && self.weapon !== 'smg' && self.weapon !== 'shotgun') {
        action.switchWeapon = '1';
      }
      // Prefer SMG if loaded (better DPS); fall back to pistol (infinite ammo).
      if (unlocked(self, 'smg') && loaded(self, 'smg') && self.weapon !== 'smg') {
        action.switchWeapon = '3';
      }
      const w = api.weapons[self.weapon] || pistol;
      const wRange = (w && w.bulletRange) || PISTOL_RANGE;
      const wSpeed = (w && w.bulletSpeed) || PISTOL_BS;
      action.aim = api.leadShot(self, z0, wSpeed);

      const inRange = d0 < wRange * PISTOL_RANGE_F;
      const canFire = (self.ammo.magSize === Infinity || self.ammo.mag > 0) && !self.reloading;
      action.fire = inRange && canFire;

      // Kite when too close.
      if (d0 < KITE_R) {
        action.move = fleeStep(self, z0, api);
      }
      return action;
    }

    // =================================================================
    // 7. NO TARGETS — reload if needed, drift to nearby goals.
    // =================================================================
    if (self.ammo.magSize !== Infinity && self.ammo.reserve > 0 && !self.reloading) {
      if (self.ammo.mag === 0 || self.ammo.mag < self.ammo.magSize / 2) {
        action.reload = true;
      }
    }

    let goal = null;
    if (perception.pickups[0])      goal = perception.pickups[0];
    else if (perception.chests[0])  goal = perception.chests[0];
    else if (perception.nearestPOI && perception.nearestPOI.dist < POI_MAX_DIST) {
      goal = perception.nearestPOI;
    }
    if (goal) {
      action.move = moveTo(self, goal, api);
      action.aim = action.aim || {
        x: self.x + action.move.x * 200,
        y: self.y + action.move.y * 200,
      };
    }

    return action;
  },
});

})();
