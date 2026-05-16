'use strict';

// ============================================================================
// bot_hunter — simple-baseline lineage with three carefully-chosen upgrades.
// ============================================================================
// Lineage: bot_simple beat every "smart" bot at 359/10 kills. Every complex
// strategy lost because the ticks spent on cleverness outweighed the kills.
// hunter keeps simple's spine (kite-if-close, fire-everything, drift-to-POI)
// and adds only three tightly-scoped upgrades:
//
//   1. Weapon switching with 0.5s hysteresis: shotgun for <100px, SMG for
//      clusters within 300px, pistol otherwise. Never thrash.
//   2. Lowest-HP-target picking when a finishing shot is available; nearest
//      otherwise. Frees the range for the next kill faster.
//   3. Tighter 110px kite radius + perpendicular (circle-strafe) movement
//      while firing. Closer = more shots-on-target, perpendicular preserves
//      distance instead of giving ground.
//
// Travel cap at 800px so we don't chase distant POIs like sniper did.
// ============================================================================

(function () {

// ---- tunables --------------------------------------------------------------
const KITE_RADIUS       = 110;   // tighter than simple's 140 — more DPS landed
const SHOTGUN_RANGE     = 100;   // switch to shotgun if zombie within this
const SMG_CLUSTER_RANGE = 300;   // SMG if multiple zombies within this
const SMG_CLUSTER_MIN   = 2;     // count threshold for SMG
const FINISHER_RANGE    = 300;   // look for low-hp finishers within this
const SWITCH_COOLDOWN   = 0.5;   // seconds between weapon switches
const CHEST_INTERACT_R  = 60;    // same as simple
const POI_TRAVEL_CAP    = 800;   // don't over-travel
const RELOAD_SAFE_DIST  = 200;   // reload early if nothing within this
const FIRE_RANGE_FRAC   = 0.9;   // % of bulletRange to start firing
// ----------------------------------------------------------------------------

let lastSwitchT = -999;
let lastWeapon  = '1';

function pickWeapon(self, zombies, elapsed, api) {
  // Hysteresis: if we switched recently, stick with what we picked.
  if (elapsed - lastSwitchT < SWITCH_COOLDOWN) return lastWeapon;

  const weapons = self.weapons || {};
  const nearest = zombies[0];

  // Shotgun if a zombie is in close-quarters range and shotgun has ammo.
  if (nearest && nearest.dist < SHOTGUN_RANGE) {
    const sg = weapons['2'];
    if (sg && sg.unlocked && (sg.mag > 0 || sg.reserve > 0)) return '2';
  }

  // SMG if there's a cluster within mid-range and SMG has ammo.
  if (zombies.length >= SMG_CLUSTER_MIN) {
    let count = 0;
    for (const z of zombies) {
      if (z.dist <= SMG_CLUSTER_RANGE) count++;
      else break; // sorted nearest-first
    }
    if (count >= SMG_CLUSTER_MIN) {
      const smg = weapons['3'];
      if (smg && smg.unlocked && (smg.mag > 0 || smg.reserve > 0)) return '3';
    }
  }

  // Default: pistol (infinite reserve).
  return '1';
}

function pickTarget(zombies, weaponDamage) {
  if (!zombies.length) return null;
  const nearest = zombies[0];

  // Look for a "finisher" — a low-HP zombie within range we can one-shot.
  // If one exists, prefer it (frees the range faster). Otherwise nearest.
  let finisher = null;
  for (const z of zombies) {
    if (z.dist > FINISHER_RANGE) break; // sorted nearest-first
    if (z.hp <= weaponDamage) {
      if (!finisher || z.hp < finisher.hp) finisher = z;
    }
  }
  return finisher || nearest;
}

function perpendicularKite(self, target) {
  // Move at 90° to the line from target -> self (circle-strafe).
  // Probe both tangent directions; the bot harness will resolve collisions.
  const dx = self.x - target.x;
  const dy = self.y - target.y;
  const m  = Math.hypot(dx, dy) || 1;
  // Perpendicular vector (rotate 90° CCW).
  return { x: -dy / m, y: dx / m };
}

Arena.register({
  name: 'hunter',
  author: 'agent',
  version: '1.0',

  reset() {
    lastSwitchT = -999;
    lastWeapon  = '1';
  },

  decide(perception, api) {
    const self    = perception.self;
    const zombies = perception.zombies;
    const elapsed = perception.elapsed || 0;

    const action = {
      move: null,
      aim: null,
      fire: false,
      reload: false,
      switchWeapon: null,
      interact: false,
      place: false,
    };

    // ----- Weapon switching (with hysteresis) -----
    const desired = pickWeapon(self, zombies, elapsed, api);
    if (desired !== self.weapon && desired !== lastWeapon) {
      action.switchWeapon = desired;
      lastWeapon = desired;
      lastSwitchT = elapsed;
    } else if (desired !== self.weapon) {
      // We previously chose desired but the engine hasn't reflected it yet.
      action.switchWeapon = desired;
    }

    // ----- Reload logic (simple's rule + early-reload-when-safe) -----
    const ammo = self.ammo;
    const nearestDist = zombies[0] ? zombies[0].dist : Infinity;
    if (ammo.magSize !== Infinity && ammo.reserve > 0) {
      if (ammo.mag === 0) {
        action.reload = true;
      } else if (ammo.mag < ammo.magSize / 2 && nearestDist > RELOAD_SAFE_DIST) {
        action.reload = true;
      }
    }

    // ----- Chest interact when standing on one (same as simple) -----
    if (perception.chests[0] && perception.chests[0].dist < CHEST_INTERACT_R) {
      action.interact = true;
    }

    // ----- Combat -----
    const wInfo  = api.weapons[self.weapon] || {};
    const bs     = wInfo.bulletSpeed || 900;
    const range  = wInfo.bulletRange || 700;
    const dmg    = wInfo.damage      || 20;
    const target = pickTarget(zombies, dmg);

    if (target) {
      action.aim  = api.leadShot(self, target, bs);
      action.fire = target.dist < range * FIRE_RANGE_FRAC && ammo.mag > 0;

      // Kite if too close — perpendicular (circle-strafe), not directly away.
      if (target.dist < KITE_RADIUS) {
        const perp = perpendicularKite(self, target);
        // Try pathfinding to a point along the perpendicular; fall back to direct.
        const probe = { x: self.x + perp.x * 100, y: self.y + perp.y * 100 };
        action.move = api.pathfindStep(self, probe) || perp;
      }
      return action;
    }

    // ----- No threats: travel to nearest chest > pickup > POI (capped 800px) -----
    let goal = null;
    if (perception.chests[0]) {
      goal = perception.chests[0];
    } else if (perception.pickups[0]) {
      goal = perception.pickups[0];
    } else if (perception.nearestPOI && perception.nearestPOI.dist <= POI_TRAVEL_CAP) {
      goal = perception.nearestPOI;
    }

    if (goal) {
      const step = api.pathfindStep(self, goal);
      if (step) {
        action.move = step;
      } else {
        const dx = goal.x - self.x, dy = goal.y - self.y;
        const m  = Math.hypot(dx, dy) || 1;
        action.move = { x: dx / m, y: dy / m };
      }
      // Aim along travel direction — fresh threats are already covered.
      action.aim = {
        x: self.x + (action.move.x * 200),
        y: self.y + (action.move.y * 200),
      };
    }

    return action;
  },
});

})();
