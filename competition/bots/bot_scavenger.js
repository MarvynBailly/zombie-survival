'use strict';

// ============================================================================
// bot_scavenger — loot first, fight later.
// ============================================================================
// Phase plan:
//   Day 1            : beeline chests, dodge combat, shoot only blockers.
//   Day 2-3          : keep looting, engage at medium range opportunistically.
//                      As night nears, retreat toward cover.
//   Day 4+ / kitted  : balanced kiter — maintain 200-400px from nearest zombie.
//   HP < 30          : abandon plans, grab nearest health pickup.
// ============================================================================

(function () {

const EMERGENCY_HP        = 30;
const CHEST_INTERACT_R    = 60;
const EARLY_BLOCKER_R     = 80;
const KITE_MIN            = 200;
const KITE_MAX            = 400;
const RELOAD_SAFE_R       = 300;
const ROCKET_SAFE_R       = 250;
const BREAKABLE_RANGE     = 120;
const STUCK_WINDOW        = 1.2;
const STUCK_MIN_MOVED     = 30;
const STUCK_TRIGGER       = 0.6;

// ----- closure state (cleared in reset) ----------------------------------
let posSamples = [];   // [{t,x,y}]
let stuckT = 0;
let lastIntentMove = null;
let breakableTarget = null; // {cx, cy} we are clearing
let breakableUntil = 0;

function isHealthPickup(p) {
  if (!p) return false;
  const k = (p.kind || p.type || '').toString().toLowerCase();
  return k.indexOf('health') !== -1 || k.indexOf('med') !== -1 || k === 'hp';
}

function nearestHealthPickup(perception) {
  let best = null;
  for (const p of perception.pickups || []) {
    if (!isHealthPickup(p)) continue;
    if (!best || p.dist < best.dist) best = p;
  }
  return best;
}

function weaponUsable(w) {
  if (!w || !w.unlocked) return false;
  if (w.magSize === Infinity) return true;
  return (w.mag || 0) > 0 || (w.reserve || 0) > 0;
}

function pickCombatSlot(self, target, api) {
  const w = self.weapons || {};
  const has = (k) => weaponUsable(w[k]);
  const dist = target ? target.dist : Infinity;
  const tank = target && target.type === 'tank';
  // Tank → rocket if we can fire safely.
  if (tank && has('rocket')) {
    const r = api.weapons.rocket;
    if (dist > (r.explodeRadius || 100) + 80) return w.rocket.slot;
  }
  if (target && dist < 160 && has('shotgun')) return w.shotgun.slot;
  if (has('smg'))     return w.smg.slot;
  if (has('shotgun')) return w.shotgun.slot;
  if (has('pistol'))  return w.pistol.slot;
  if (has('rocket')) {
    const r = api.weapons.rocket;
    if (dist > (r.explodeRadius || 100) + 80) return w.rocket.slot;
  }
  return null;
}

// Slot for clearing a blocker (no rockets, no placers).
function pickBreakerSlot(self) {
  const w = self.weapons || {};
  const has = (k) => weaponUsable(w[k]);
  if (has('shotgun')) return w.shotgun.slot;
  if (has('smg'))     return w.smg.slot;
  if (has('pistol'))  return w.pistol.slot;
  return null;
}

function countUnlocked(self) {
  const w = self.weapons || {};
  let n = 0;
  for (const k in w) if (w[k] && w[k].unlocked) n++;
  return n;
}

function updateStuck(self, t, dt) {
  posSamples.push({ t, x: self.x, y: self.y });
  while (posSamples.length && posSamples[0].t < t - STUCK_WINDOW) posSamples.shift();
  if (!lastIntentMove) { stuckT = 0; return; }
  if (posSamples.length < 4 || (t - posSamples[0].t) < (STUCK_WINDOW - 0.3)) return;
  const old = posSamples[0];
  const moved = Math.hypot(self.x - old.x, self.y - old.y);
  if (moved < STUCK_MIN_MOVED) stuckT += dt; else stuckT = 0;
}

function steerDirect(from, goal) {
  const dx = goal.x - from.x, dy = goal.y - from.y;
  const m = Math.hypot(dx, dy) || 1;
  return { x: dx / m, y: dy / m };
}

Arena.register({
  name:    'scavenger',
  author:  'agent',
  version: '1.0',

  reset() {
    posSamples = [];
    stuckT = 0;
    lastIntentMove = null;
    breakableTarget = null;
    breakableUntil = 0;
  },

  decide(perception, api) {
    const self = perception.self;
    const t = perception.elapsed;
    const dt = perception.dt || 0.016;
    updateStuck(self, t, dt);

    const action = {
      move: null, aim: null, fire: false, reload: false,
      switchWeapon: null, interact: false, place: false,
    };

    const day = perception.day || 1;
    const z0 = perception.zombies && perception.zombies[0] || null;
    const d0 = z0 ? z0.dist : Infinity;
    const unlockedCount = countUnlocked(self);
    const lateGame = day >= 4 || unlockedCount >= 5;
    const nightSoon = (perception.secondsToNight != null) && perception.secondsToNight < 30 && perception.phase !== 'day';

    // -------- Pick top-level goal --------
    // Emergency: HP low → health pickup beats everything.
    let goal = null;
    let goalReason = null;
    if (self.hp < EMERGENCY_HP) {
      const h = nearestHealthPickup(perception);
      if (h) { goal = h; goalReason = 'health'; }
    }

    if (!goal) {
      // Chest hunting (priority for scavenger).
      const chest = perception.chests && perception.chests[0] || null;
      const pickup = perception.pickups && perception.pickups[0] || null;
      // Late game: prefer pickups over distant chests.
      if (lateGame) {
        if (pickup) { goal = pickup; goalReason = 'pickup'; }
        else if (chest) { goal = chest; goalReason = 'chest'; }
        else if (perception.nearestPOI) { goal = perception.nearestPOI; goalReason = 'poi'; }
      } else {
        // Early/mid: chests first.
        if (chest) {
          // If dusk/night looming, don't chase a far chest.
          if (nightSoon && chest.dist > 250) {
            if (perception.nearestPOI) { goal = perception.nearestPOI; goalReason = 'cover'; }
            else if (pickup) { goal = pickup; goalReason = 'pickup'; }
          } else {
            goal = chest; goalReason = 'chest';
          }
        } else if (pickup) {
          goal = pickup; goalReason = 'pickup';
        } else if (perception.nearestPOI) {
          goal = perception.nearestPOI; goalReason = 'poi';
        }
      }
    }

    // -------- Interact with chest if standing on it --------
    if (perception.chests && perception.chests[0] && perception.chests[0].dist < CHEST_INTERACT_R) {
      action.interact = true;
    }

    // -------- Combat logic depends on phase --------
    // We may override movement with kiting if late-game or threat is on us.
    let movementSet = false;

    // Always defend if a zombie is right on top of us, regardless of phase.
    const imminent = z0 && d0 < 100;

    if (lateGame && z0) {
      // Balanced kiter: aim & fire at nearest visible.
      const slot = pickCombatSlot(self, z0, api);
      if (slot) action.switchWeapon = slot;
      const weap = api.weapons[self.weapon] || api.weapons.pistol;
      action.aim = api.leadShot(self, z0, weap.bulletSpeed || 900);
      // Rocket safety: only fire rocket if target far enough.
      const safeAoE = !weap.isRocket || d0 > ROCKET_SAFE_R;
      const inRange = d0 <= (weap.bulletRange || 700) * 0.95;
      action.fire = inRange && safeAoE && self.ammo.mag > 0 && !weap.isPlacer;

      // Movement: maintain 200-400px from nearest.
      if (d0 < KITE_MIN) {
        // Back away.
        const flee = { x: self.x + (self.x - z0.x), y: self.y + (self.y - z0.y) };
        action.move = api.pathfindStep(self, flee) || steerDirect(self, flee);
        movementSet = true;
      } else if (d0 > KITE_MAX && goal) {
        // We can advance toward goal.
        const step = api.pathfindStep(self, goal);
        action.move = step || steerDirect(self, goal);
        movementSet = true;
      } else {
        // In sweet spot — strafe perpendicular to keep moving.
        const dx = z0.x - self.x, dy = z0.y - self.y;
        const m = Math.hypot(dx, dy) || 1;
        const side = ((t * 0.5) | 0) % 2 === 0 ? 1 : -1;
        action.move = { x: -dy / m * side, y: dx / m * side };
        movementSet = true;
      }
    } else if (imminent) {
      // Emergency defense at any phase.
      const slot = pickCombatSlot(self, z0, api);
      if (slot) action.switchWeapon = slot;
      const weap = api.weapons[self.weapon] || api.weapons.pistol;
      action.aim = api.leadShot(self, z0, weap.bulletSpeed || 900);
      const safeAoE = !weap.isRocket || d0 > ROCKET_SAFE_R;
      action.fire = safeAoE && self.ammo.mag > 0 && !weap.isPlacer;
      // Back-pedal.
      const flee = { x: self.x + (self.x - z0.x), y: self.y + (self.y - z0.y) };
      action.move = api.pathfindStep(self, flee) || steerDirect(self, flee);
      movementSet = true;
    } else if (day === 1) {
      // Early game: only engage zombies blocking our path within 80px.
      if (z0 && d0 < EARLY_BLOCKER_R && goal) {
        // Is it roughly between us and the goal?
        const gx = goal.x - self.x, gy = goal.y - self.y;
        const zx = z0.x - self.x, zy = z0.y - self.y;
        const gm = Math.hypot(gx, gy) || 1;
        const zm = Math.hypot(zx, zy) || 1;
        const dot = (gx * zx + gy * zy) / (gm * zm);
        if (dot > 0.3) {
          const w = self.weapons || {};
          if (weaponUsable(w.shotgun)) action.switchWeapon = w.shotgun.slot;
          const weap = api.weapons[self.weapon] || api.weapons.pistol;
          action.aim = api.leadShot(self, z0, weap.bulletSpeed || 900);
          action.fire = self.ammo.mag > 0 && !weap.isPlacer && !weap.isRocket;
        }
      }
    } else {
      // Mid game (day 2-3): engage zombies at medium range with whatever we have.
      if (z0 && d0 < 350) {
        const slot = pickCombatSlot(self, z0, api);
        if (slot) action.switchWeapon = slot;
        const weap = api.weapons[self.weapon] || api.weapons.pistol;
        action.aim = api.leadShot(self, z0, weap.bulletSpeed || 900);
        const safeAoE = !weap.isRocket || d0 > ROCKET_SAFE_R;
        const inRange = d0 <= (weap.bulletRange || 700) * 0.95;
        action.fire = inRange && safeAoE && self.ammo.mag > 0 && !weap.isPlacer;
        // If they're getting close, kite a little.
        if (d0 < 140) {
          const flee = { x: self.x + (self.x - z0.x), y: self.y + (self.y - z0.y) };
          action.move = api.pathfindStep(self, flee) || steerDirect(self, flee);
          movementSet = true;
        }
      }
    }

    // -------- Travel toward goal if movement not yet set --------
    if (!movementSet && goal) {
      let step = api.pathfindStep(self, goal);
      if (step) {
        action.move = step;
        breakableTarget = null;
      } else {
        // Pathfinder gave up. Look for a breakable to shoot.
        const dir = steerDirect(self, goal);
        // Persist current breakable for short time so we don't flip-flop.
        if (!breakableTarget || t > breakableUntil) {
          const br = api.findBreakable(self, dir.x, dir.y, BREAKABLE_RANGE);
          if (br) {
            breakableTarget = { cx: br.cx, cy: br.cy };
            breakableUntil = t + 1.0;
          } else {
            breakableTarget = null;
          }
        }
        if (breakableTarget) {
          action.aim = { x: breakableTarget.cx, y: breakableTarget.cy };
          const slot = pickBreakerSlot(self);
          if (slot) action.switchWeapon = slot;
          const weap = api.weapons[self.weapon] || api.weapons.pistol;
          action.fire = self.ammo.mag > 0 && !weap.isPlacer && !weap.isRocket;
          // Stand still while shooting.
          action.move = null;
        } else {
          // Direct steering as fallback.
          action.move = dir;
        }
      }
    }

    // -------- Default aim along travel direction if nothing set --------
    if (!action.aim && action.move) {
      action.aim = {
        x: self.x + action.move.x * 200,
        y: self.y + action.move.y * 200,
      };
    }

    // -------- Reload policy --------
    const mag = self.ammo.mag, reserve = self.ammo.reserve, size = self.ammo.magSize;
    if (size !== Infinity && reserve > 0 && self.reloading <= 0 && mag < size) {
      const noThreat = !z0 || d0 > RELOAD_SAFE_R;
      if (mag === 0 || noThreat) {
        action.reload = true;
        // Don't fire while reloading.
        action.fire = false;
      }
    }

    lastIntentMove = action.move || null;
    return action;
  },
});

})();
