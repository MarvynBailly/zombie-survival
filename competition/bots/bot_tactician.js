'use strict';

// ============================================================================
// bot_tactician — circle-strafe kiter that uses cover against groups.
// ============================================================================
// Core idea: stay at ~0.7 * bulletRange from the nearest visible threat so we
// pin them at the edge of our weapon's effective range. Move tangentially
// (perpendicular to the line between us and the target) so distance stays
// roughly constant while we keep firing. Probe both tangent directions with
// pathfindStep / isBlocked and pick whichever has open space.
//
// When more than two zombies cluster nearby, retreat toward a point that puts
// an obstacle between us and the centroid. Reload during lulls (LOS broken or
// nearest threat far away). HP < 30 forces a run to the nearest pickup.
// ============================================================================

(function () {

// ---- tunables --------------------------------------------------------------
const KITE_FRAC_DAY     = 0.70;   // kite at 70% of bullet range during day
const KITE_FRAC_NIGHT   = 0.50;   // tighten at night (more accurate, more shots land)
const SHOTGUN_KITE_FRAC = 0.55;   // shotgun spread benefits from closer
const CLUSTER_R         = 300;    // zombies within this count as a "group"
const CLUSTER_MIN       = 3;      // group size that triggers cover behavior
const SHOTGUN_RANGE     = 100;    // switch to shotgun if anything is inside this
const HP_PANIC          = 30;     // emergency retreat threshold
const RELOAD_FAR_DIST   = 400;    // nearest threat past this -> reload OK
const TANGENT_PROBE     = 160;    // how far to project the tangent test point
const COVER_PROBE       = 220;    // retreat candidate distance

// closure state -------------------------------------------------------------
let lastCircleDir = 1;            // +1 = CCW, -1 = CW; sticky to prevent jitter
let lastDirT      = 0;

function has(self, key) {
  const w = self.weapons[key];
  if (!w || !w.unlocked) return false;
  return (w.mag || 0) > 0 || (w.reserve || 0) > 0 || w.magSize === Infinity;
}

// pick a combat weapon. priority: SMG > pistol > shotgun (close) > shotgun.
function pickWeaponSlot(self, target, perception) {
  // Close-quarter swarm -> shotgun.
  const veryClose = target && target.dist < SHOTGUN_RANGE;
  const swarmed = perception.zombies.filter(z => z.dist < SHOTGUN_RANGE).length >= 2;
  if ((veryClose || swarmed) && has(self, 'shotgun')) return self.weapons.shotgun.slot;

  // Tank handling.
  if (target && target.type === 'tank' && has(self, 'rocket') && target.dist > 260) {
    return self.weapons.rocket.slot;
  }

  if (has(self, 'smg'))     return self.weapons.smg.slot;
  if (has(self, 'pistol'))  return self.weapons.pistol.slot;
  if (has(self, 'shotgun')) return self.weapons.shotgun.slot;
  if (has(self, 'crossbow')) return self.weapons.crossbow.slot;
  if (has(self, 'minigun')) return self.weapons.minigun.slot;
  return null;
}

// effective kite radius for the current weapon and phase.
function kiteRadius(api, self, perception) {
  const w = api.weapons[self.weapon] || api.weapons.pistol;
  let frac = (perception.phase === 'night') ? KITE_FRAC_NIGHT : KITE_FRAC_DAY;
  if (self.weapon === 'shotgun') frac = SHOTGUN_KITE_FRAC;
  const range = w.bulletRange || 700;
  // clamp so we don't try to kite from impossibly close (e.g. melee weapons).
  return Math.max(120, range * frac);
}

// Build a candidate tangent point given a circle direction (+1 CCW / -1 CW).
function tangentPoint(self, target, radius, dir) {
  const ang = Math.atan2(target.y - self.y, target.x - self.x);
  // Tangent is 90deg off the radial line. Step around the target's circle.
  const tAng = ang + dir * (Math.PI / 2);
  // Goal point: project from the zombie back along radius and offset along tangent.
  const desiredAng = ang + dir * 0.35; // slight ahead-of-tangent so we orbit
  return {
    x: target.x - Math.cos(desiredAng) * radius,
    y: target.y - Math.sin(desiredAng) * radius,
    tx: tAng, // unused but kept for clarity
  };
}

// Centroid of zombies within radius.
function clusterCentroid(perception, radius) {
  let cx = 0, cy = 0, n = 0;
  for (const z of perception.zombies) {
    if (z.dist <= radius) { cx += z.x; cy += z.y; n++; }
  }
  return n > 0 ? { x: cx / n, y: cy / n, n } : null;
}

// Pick a flee point opposite a centroid; prefer one that ends up with a wall
// in between (rough heuristic: hasLOS to centroid is false from candidate).
function coverFleePoint(self, centroid, perception, api) {
  const dx = self.x - centroid.x, dy = self.y - centroid.y;
  const m = Math.hypot(dx, dy) || 1;
  const ux = dx / m, uy = dy / m;
  // Sample a fan of 5 directions (straight + 2 on each side).
  const fanAngles = [0, 0.5, -0.5, 1.0, -1.0];
  let best = null;
  let bestScore = -Infinity;
  for (const a of fanAngles) {
    const ca = Math.cos(a), sa = Math.sin(a);
    const fx = ux * ca - uy * sa;
    const fy = ux * sa + uy * ca;
    const px = self.x + fx * COVER_PROBE;
    const py = self.y + fy * COVER_PROBE;
    if (api.isBlocked(px, py)) continue;
    let score = 0;
    // Big bonus if line-of-sight from candidate back to centroid is broken.
    if (!api.hasLOS(px, py, centroid.x, centroid.y)) score += 1000;
    // Smaller bonus for distance from cluster.
    score += Math.hypot(px - centroid.x, py - centroid.y) * 0.01;
    // Slight penalty if walking into a different zombie.
    for (const z of perception.zombies) {
      const d = Math.hypot(px - z.x, py - z.y);
      if (d < 80) score -= 200;
    }
    if (score > bestScore) { bestScore = score; best = { x: px, y: py }; }
  }
  return best;
}

// Probe both tangent directions; pick the one whose path step is non-null and
// whose tangent point isn't blocked. Sticky to avoid flip-flopping each tick.
function chooseTangent(self, target, radius, api, t) {
  const candCCW = tangentPoint(self, target, radius, +1);
  const candCW  = tangentPoint(self, target, radius, -1);
  const okCCW = !api.isBlocked(candCCW.x, candCCW.y) && api.pathfindStep(self, candCCW) !== null;
  const okCW  = !api.isBlocked(candCW.x, candCW.y)  && api.pathfindStep(self, candCW)  !== null;

  // Stay with last choice if still valid (don't switch direction more than once per 0.6s).
  if (lastCircleDir === +1 && okCCW && (t - lastDirT) < 0.6) return { goal: candCCW, dir: +1 };
  if (lastCircleDir === -1 && okCW  && (t - lastDirT) < 0.6) return { goal: candCW,  dir: -1 };

  if (okCCW && okCW) {
    // Tiebreak: pick whichever is farther from any blocked cell along the way
    // (cheap heuristic: pick the side that is further from other zombies).
    let scoreCCW = 0, scoreCW = 0;
    return { goal: candCCW, dir: +1 }; // arbitrary but stable; updated next tick
  }
  if (okCCW) return { goal: candCCW, dir: +1 };
  if (okCW)  return { goal: candCW,  dir: -1 };
  // Both blocked: just back off radially.
  const dx = self.x - target.x, dy = self.y - target.y;
  const m = Math.hypot(dx, dy) || 1;
  return { goal: { x: self.x + (dx / m) * 80, y: self.y + (dy / m) * 80 }, dir: lastCircleDir };
}

Arena.register({
  name:    'tactician',
  author:  'agent',
  version: '1.0',

  reset() {
    lastCircleDir = 1;
    lastDirT      = 0;
  },

  decide(perception, api) {
    const self = perception.self;
    const t    = perception.elapsed || 0;
    const action = {};

    // Loot if standing on a chest.
    if (perception.chests[0] && perception.chests[0].dist < 60) action.interact = true;

    const target = perception.zombies[0] || null;
    const clusterCount = perception.zombies.filter(z => z.dist < CLUSTER_R).length;

    // ---- Emergency: low HP, find a health pickup or POI ---------------------
    if (self.hp < HP_PANIC) {
      // switch off dry weapon
      if (self.ammo.mag === 0 && self.ammo.reserve === 0 && has(self, 'pistol')) {
        action.switchWeapon = self.weapons.pistol.slot;
      }
      // prefer a health pickup
      let goal = null;
      const health = perception.pickups.find(p => p.type === 'health');
      if (health) goal = health;
      else if (perception.pickups[0]) goal = perception.pickups[0];
      else if (perception.chests[0])  goal = perception.chests[0];
      else if (target) {
        // run away from threat
        const dx = self.x - target.x, dy = self.y - target.y;
        const m = Math.hypot(dx, dy) || 1;
        goal = { x: self.x + (dx / m) * 400, y: self.y + (dy / m) * 400 };
      } else if (perception.nearestPOI) goal = perception.nearestPOI;
      if (goal) {
        action.move = api.pathfindStep(self, goal) || {
          x: (goal.x - self.x) / (api.distance(self, goal) || 1),
          y: (goal.y - self.y) / (api.distance(self, goal) || 1),
        };
      }
      if (target) {
        const w = api.weapons[self.weapon] || api.weapons.pistol;
        action.aim = api.leadShot(self, target, w.bulletSpeed || 900);
        action.fire = self.ammo.mag > 0 && target.dist < (w.bulletRange || 700) * 0.9;
      }
      // Reload while fleeing if mag is empty.
      if (self.ammo.magSize !== Infinity && self.ammo.mag === 0 && self.ammo.reserve > 0) {
        action.reload = true;
      }
      return action;
    }

    // ---- No threat: drift toward chest > pickup > POI ----------------------
    if (!target) {
      let goal = null;
      if (perception.pickups[0])      goal = perception.pickups[0];
      else if (perception.chests[0])  goal = perception.chests[0];
      else if (perception.nearestPOI) goal = perception.nearestPOI;
      if (goal) {
        action.move = api.pathfindStep(self, goal) || (() => {
          const dx = goal.x - self.x, dy = goal.y - self.y;
          const m = Math.hypot(dx, dy) || 1;
          return { x: dx / m, y: dy / m };
        })();
        action.aim = { x: self.x + (action.move.x * 200), y: self.y + (action.move.y * 200) };
      }
      // Top off ammo when calm.
      if (self.ammo.magSize !== Infinity && self.ammo.reserve > 0
          && self.ammo.mag < self.ammo.magSize && self.reloading <= 0) {
        action.reload = true;
      }
      return action;
    }

    // ---- Cover behavior when clustered ------------------------------------
    if (clusterCount >= CLUSTER_MIN) {
      const centroid = clusterCentroid(perception, CLUSTER_R);
      if (centroid) {
        const flee = coverFleePoint(self, centroid, perception, api);
        if (flee) {
          action.move = api.pathfindStep(self, flee) || (() => {
            const dx = flee.x - self.x, dy = flee.y - self.y;
            const m = Math.hypot(dx, dy) || 1;
            return { x: dx / m, y: dy / m };
          })();
        }
      }
      // Still shoot the nearest while retreating.
      const slot = pickWeaponSlot(self, target, perception);
      if (slot) action.switchWeapon = slot;
      const w = api.weapons[self.weapon] || api.weapons.pistol;
      action.aim = api.leadShot(self, target, w.bulletSpeed || 900);
      const safeAoE = !w.isRocket || target.dist > (w.explodeRadius + 60);
      action.fire = self.ammo.mag > 0 && safeAoE
                    && target.dist < (w.bulletRange || 700) * 0.95;
      // Reload only if completely dry; we want sustained fire while retreating.
      if (self.ammo.magSize !== Infinity && self.ammo.mag === 0 && self.ammo.reserve > 0) {
        action.reload = true;
      }
      return action;
    }

    // ---- Standard combat: circle-strafe kite -------------------------------
    const slot = pickWeaponSlot(self, target, perception);
    if (slot) action.switchWeapon = slot;
    const wKey = (slot === self.weapons.shotgun.slot && self.weapons.shotgun.unlocked) ? 'shotgun' : self.weapon;
    const weap = api.weapons[wKey] || api.weapons[self.weapon] || api.weapons.pistol;

    const radius = kiteRadius(api, self, perception);
    const chosen = chooseTangent(self, target, radius, api, t);
    if (chosen.dir !== lastCircleDir) {
      lastCircleDir = chosen.dir;
      lastDirT      = t;
    }

    action.move = api.pathfindStep(self, chosen.goal) || (() => {
      const dx = chosen.goal.x - self.x, dy = chosen.goal.y - self.y;
      const m = Math.hypot(dx, dy) || 1;
      return { x: dx / m, y: dy / m };
    })();

    // Aim with lead.
    action.aim = api.leadShot(self, target, weap.bulletSpeed || 900);

    // Fire decision: in range, has LOS (perception already filters LOS), safe AoE.
    const inRange = target.dist <= (weap.bulletRange || 700) * 0.95;
    const safeAoE = !weap.isRocket || target.dist > (weap.explodeRadius + 60);
    action.fire = inRange && safeAoE && self.ammo.mag > 0 && !weap.isPlacer;

    // ---- Reload policy ------------------------------------------------------
    const hidden = !api.hasLOS(self.x, self.y, target.x, target.y);
    if (self.ammo.magSize !== Infinity && self.reloading <= 0
        && self.ammo.reserve > 0 && self.ammo.mag < self.ammo.magSize) {
      if (self.ammo.mag === 0) {
        action.reload = true;
      } else if (target.dist > RELOAD_FAR_DIST || hidden) {
        // safe window to top off
        if (self.ammo.mag < self.ammo.magSize * 0.6) action.reload = true;
      }
    }

    return action;
  },
});

})();
