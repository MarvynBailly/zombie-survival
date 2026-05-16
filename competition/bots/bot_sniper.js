'use strict';

// ============================================================================
// bot_sniper — long-range kiter. Never lets zombies close in.
// ============================================================================
// Core rule: if any visible zombie is within RETREAT_R, retreat directly away
// at full speed. Engage only at the edge of weapon range. Prefer SMG > Pistol
// for sustained long-range fire; shotgun is panic-only; never touch rockets.
// ============================================================================

(function () {

const RETREAT_R         = 250;   // hard "GET AWAY" radius
const ENGAGE_FRAC       = 0.85;  // fire when target within bulletRange * frac
const RELOAD_SAFE_R     = 400;   // safe to reload only if no zombie within this
const PANIC_HP          = 40;
const CRITICAL_HP       = 20;
const ARC_PERIOD        = 6.0;   // night-wandering arc cycle in seconds
const ARC_RADIUS        = 220;

let lastPOI       = null;        // sticky goal so we don't oscillate
let arcPhase      = 0;
let lastT         = 0;

function has(weapons, key) {
  const w = weapons[key];
  if (!w || !w.unlocked) return false;
  if (w.magSize === Infinity) return true;
  return (w.mag || 0) > 0 || (w.reserve || 0) > 0;
}

// Pick the best slot for current situation. Returns slot string or null.
function pickWeaponSlot(self, target, api) {
  const w = self.weapons;
  const dist = target ? target.dist : Infinity;

  // Panic shotgun only if a zombie is right on top of us and shotgun has ammo.
  if (target && dist < 110 && has(w, 'shotgun')) return w.shotgun.slot;

  // Crossbow is amazing for sniping if we have it (piercing + 1100 range).
  if (has(w, 'crossbow') && dist > 200) return w.crossbow.slot;

  // Railgun for extreme range.
  if (has(w, 'railgun') && dist > 400) return w.railgun.slot;

  // SMG is the bread-and-butter — auto fire at 900 range.
  if (has(w, 'smg')) return w.smg.slot;

  // Pistol fallback — infinite ammo, 900 range.
  if (has(w, 'pistol')) return w.pistol.slot;

  // Last resort.
  if (has(w, 'shotgun')) return w.shotgun.slot;
  return null;
}

// Weighted centroid of nearby threats so we flee from clusters, not a single
// zombie next to a wall.
function threatCentroid(zombies, maxR) {
  let cx = 0, cy = 0, ws = 0;
  for (const z of zombies) {
    if (z.dist > maxR) continue;
    const w = 1 / Math.max(20, z.dist * z.dist);
    cx += z.x * w; cy += z.y * w; ws += w;
  }
  if (ws <= 0) return null;
  return { x: cx / ws, y: cy / ws };
}

function chooseGoal(perception) {
  // Pickups (loot drops) first — usually HP, ammo.
  if (perception.pickups[0]) return { x: perception.pickups[0].x, y: perception.pickups[0].y };
  if (perception.chests[0])  return { x: perception.chests[0].x,  y: perception.chests[0].y };
  // Only chase a POI if it's reasonably close. The tournament showed sniper
  // over-traveling to distant POIs (~1000+ px away), outpacing zombie spawns
  // and getting 0 kills as a result. Cap POI chase distance so we stay in the
  // hunting zone.
  if (perception.nearestPOI && perception.nearestPOI.dist < 800) {
    return { x: perception.nearestPOI.x, y: perception.nearestPOI.y };
  }
  return null;
}

// Build a flee point in world space, opposite the threat, far enough that the
// pathfinder will actually plot a useful route.
function fleePoint(self, threat, dist) {
  const dx = self.x - threat.x;
  const dy = self.y - threat.y;
  const m = Math.hypot(dx, dy) || 1;
  return { x: self.x + (dx / m) * dist, y: self.y + (dy / m) * dist };
}

Arena.register({
  name:    'sniper',
  author:  'agent',
  version: '1.0',

  reset() {
    lastPOI = null;
    arcPhase = 0;
    lastT = 0;
  },

  decide(perception, api) {
    const self    = perception.self;
    const t       = perception.elapsed;
    const dt      = Math.max(0, t - lastT);
    lastT = t;
    arcPhase += dt;

    const action = {
      move: null,
      aim: null,
      fire: false,
      reload: false,
      switchWeapon: null,
      interact: false,
      place: false,
    };

    const zombies = perception.zombies;
    const z0      = zombies[0] || null;
    const d0      = z0 ? z0.dist : Infinity;

    // -- Interact with chest underfoot for free loot. --
    if (perception.chests[0] && perception.chests[0].dist < 60) {
      action.interact = true;
    }

    // -- Pick weapon for the situation. Done up-front so range checks below
    //    use the current weapon's stats (we read self.weapon, but switching is
    //    requested by setting action.switchWeapon).
    const slot = pickWeaponSlot(self, z0, api);
    if (slot && slot !== self.weapons[self.weapon].slot) {
      action.switchWeapon = slot;
    }

    // Use current weapon's stats for engagement math this tick.
    const weap = api.weapons[self.weapon] || api.weapons.pistol;
    const bulletSpeed = weap.bulletSpeed || 900;
    const bulletRange = weap.bulletRange || 700;

    // -- Aim: always track the nearest zombie if any. --
    if (z0) {
      action.aim = api.leadShot(self, z0, bulletSpeed);
    }

    // ----------------------------------------------------------------------
    // EMERGENCY: critical HP — flat retreat from biggest threat cluster.
    // ----------------------------------------------------------------------
    if (self.hp < CRITICAL_HP && zombies.length > 0) {
      const centroid = threatCentroid(zombies, 600) || z0;
      if (centroid) {
        const flee = fleePoint(self, centroid, 400);
        action.move = api.pathfindStep(self, flee) || {
          x: (self.x - centroid.x) / (Math.hypot(self.x - centroid.x, self.y - centroid.y) || 1),
          y: (self.y - centroid.y) / (Math.hypot(self.x - centroid.x, self.y - centroid.y) || 1),
        };
      }
      // Still shoot while running if we can.
      if (z0 && d0 < bulletRange * ENGAGE_FRAC && self.ammo.mag > 0 && !weap.isPlacer && !weap.isRocket) {
        action.fire = true;
      }
      // Empty-mag fallback to pistol.
      if (self.ammo.mag === 0 && self.ammo.magSize !== Infinity && has(self.weapons, 'pistol')) {
        action.switchWeapon = self.weapons.pistol.slot;
      }
      return action;
    }

    // ----------------------------------------------------------------------
    // PANIC HP: prefer the nearest pickup (likely an HP drop) over POI.
    // ----------------------------------------------------------------------
    let panicGoal = null;
    if (self.hp < PANIC_HP && perception.pickups[0]) {
      panicGoal = { x: perception.pickups[0].x, y: perception.pickups[0].y };
    }

    // ----------------------------------------------------------------------
    // CORE RULE: any visible zombie within RETREAT_R -> retreat NOW.
    // ----------------------------------------------------------------------
    if (z0 && d0 < RETREAT_R) {
      const flee = fleePoint(self, z0, 350);
      const step = api.pathfindStep(self, flee);
      if (step) {
        action.move = step;
      } else {
        const dx = self.x - z0.x, dy = self.y - z0.y;
        const m = Math.hypot(dx, dy) || 1;
        action.move = { x: dx / m, y: dy / m };
      }
      // Fire if we're already at engagement range (sometimes RETREAT_R <
      // engage range for our weapon, e.g. shotgun panic shot).
      if (d0 < bulletRange * ENGAGE_FRAC && self.ammo.mag > 0 && !weap.isPlacer && !weap.isRocket) {
        action.fire = true;
      }
      // If our mag is dry and we're surrounded, hot-swap to pistol.
      if (self.ammo.mag === 0 && self.ammo.magSize !== Infinity && has(self.weapons, 'pistol')) {
        action.switchWeapon = self.weapons.pistol.slot;
      }
      return action;
    }

    // ----------------------------------------------------------------------
    // ENGAGE: target visible at sniper range — fire when in band.
    // ----------------------------------------------------------------------
    if (z0 && d0 < bulletRange * ENGAGE_FRAC) {
      // Safety: never fire rockets (we never pick them anyway, but guard).
      const safe = !weap.isRocket && !weap.isPlacer;
      if (safe && self.ammo.mag > 0) action.fire = true;
    }

    // ----------------------------------------------------------------------
    // RELOAD: aggressively, but only when safe.
    // ----------------------------------------------------------------------
    const ammo = self.ammo;
    if (ammo.magSize !== Infinity && self.reloading <= 0 && ammo.reserve > 0 && ammo.mag < ammo.magSize) {
      const noNearThreat = (d0 > RELOAD_SAFE_R);
      if (ammo.mag === 0 || noNearThreat) {
        action.reload = true;
      }
    }
    // If mag is dry and reserve is also dry, switch to pistol (infinite ammo).
    if (ammo.magSize !== Infinity && ammo.mag === 0 && ammo.reserve === 0 && has(self.weapons, 'pistol')) {
      action.switchWeapon = self.weapons.pistol.slot;
    }

    // ----------------------------------------------------------------------
    // MOVEMENT: travel toward goal. At night, keep arcing — never stop.
    // ----------------------------------------------------------------------
    const goal = panicGoal || chooseGoal(perception);
    const isNight = (perception.phase === 'night' || perception.phase === 'dusk');

    if (action.move == null) {
      // ALSO: when a zombie is visible in the engage band, hold ground and
      // fire instead of running off after a pickup or POI. Standing still
      // means more shots-on-target per second than firing-while-running.
      const zombieInEngageBand = z0 && d0 < bulletRange * ENGAGE_FRAC;
      if (goal && !zombieInEngageBand) {
        const step = api.pathfindStep(self, goal);
        if (step) {
          action.move = step;
        } else {
          const dx = goal.x - self.x, dy = goal.y - self.y;
          const m = Math.hypot(dx, dy) || 1;
          action.move = { x: dx / m, y: dy / m };
        }
      } else if (isNight) {
        // Arc-walk around current position so we're a moving target.
        const ang = (arcPhase / ARC_PERIOD) * Math.PI * 2;
        const target = {
          x: self.x + Math.cos(ang) * ARC_RADIUS,
          y: self.y + Math.sin(ang) * ARC_RADIUS,
        };
        const step = api.pathfindStep(self, target);
        if (step) action.move = step;
        else action.move = { x: Math.cos(ang), y: Math.sin(ang) };
      }
    }

    // ----------------------------------------------------------------------
    // AIM FALLBACK: when no zombie, aim along travel direction so a fresh
    // threat is already in our crosshair when it pops in.
    // ----------------------------------------------------------------------
    if (action.aim == null) {
      if (action.move) {
        action.aim = {
          x: self.x + action.move.x * 200,
          y: self.y + action.move.y * 200,
        };
      } else {
        // Idle: aim toward nearest POI if any, otherwise straight ahead.
        const poi = perception.nearestPOI;
        if (poi) action.aim = { x: poi.x, y: poi.y };
        else action.aim = { x: self.x + 200, y: self.y };
      }
    }

    return action;
  },
});

})();
