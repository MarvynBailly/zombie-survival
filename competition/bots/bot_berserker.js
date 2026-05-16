'use strict';

// ============================================================================
// bot_berserker v2 — fire-first, simplicity-first close combat.
// ============================================================================
// Lesson from v1: complex strategy lost to bot_simple (10 kills vs 4).
// Fix: shoot every tick at the nearest visible zombie, always lead aim,
// minimize travel, no health detours above 30 HP, no chest detours in combat.
// ============================================================================

(function () {

const PANIC_HP        = 30;     // only retreat to pickups below this
const CHEST_GRAB_R    = 60;     // only interact with chests this close
const CHEST_SAFE_R    = 200;    // ...and no zombie within this radius
const PICKUP_GRAB_R   = 40;
const RELOAD_SAFE_R   = 200;    // only reload if no zombie within this
const POI_MAX_DIST    = 800;    // don't over-travel to distant POIs
const SHOTGUN_RANGE   = 350;    // shotgun preferred up to here
const SAW_ENGAGE_R    = 80;     // chainsaw preferred inside this
const MELEE_PUSH_R    = 180;    // close-range weapons want zombies inside this
const KITE_MIN        = 300;    // pistol/SMG kite floor
const KITE_MAX        = 500;    // pistol/SMG kite ceiling

let stickySlot = null;          // hysteresis: don't switch every tick
let lastSwitchTick = -999;
let tickCounter = 0;
const SWITCH_COOLDOWN = 8;      // ticks between weapon switches

function has(self, key) {
  const w = self.weapons && self.weapons[key];
  if (!w || !w.unlocked) return false;
  if (w.magSize === Infinity) return true;
  return (w.mag || 0) > 0 || (w.reserve || 0) > 0;
}

// Pick the best AVAILABLE weapon for the situation. Never returns rocket.
function pickWeaponKey(self, dist) {
  if (has(self, 'saw') && dist < SAW_ENGAGE_R) return 'saw';
  if (has(self, 'shotgun') && dist < SHOTGUN_RANGE) return 'shotgun';
  if (has(self, 'smg')) return 'smg';
  if (has(self, 'pistol')) return 'pistol';
  if (has(self, 'shotgun')) return 'shotgun';
  if (has(self, 'saw')) return 'saw';
  return null;
}

function nearestHealthPickup(perception) {
  const list = perception.pickups || [];
  let best = null;
  for (const p of list) {
    const isHealth = p.type === 'health' || p.kind === 'health' ||
                     (typeof p.name === 'string' && p.name.toLowerCase().includes('health'));
    if (!isHealth) continue;
    if (!best || p.dist < best.dist) best = p;
  }
  if (!best && list[0]) best = list[0];
  return best;
}

function steerTo(self, goal, api) {
  const step = api.pathfindStep(self, goal);
  if (step) return step;
  const dx = goal.x - self.x, dy = goal.y - self.y;
  const m = Math.hypot(dx, dy) || 1;
  return { x: dx / m, y: dy / m };
}

function fleeFrom(self, threat, api) {
  const fleePoint = {
    x: self.x + (self.x - threat.x),
    y: self.y + (self.y - threat.y),
  };
  const step = api.pathfindStep(self, fleePoint);
  if (step) return step;
  const dx = self.x - threat.x, dy = self.y - threat.y;
  const m = Math.hypot(dx, dy) || 1;
  return { x: dx / m, y: dy / m };
}

Arena.register({
  name:    'berserker',
  author:  'agent',
  version: '2.0',

  reset() {
    stickySlot = null;
    lastSwitchTick = -999;
    tickCounter = 0;
  },

  decide(perception, api) {
    tickCounter++;
    const self = perception.self;
    const action = {
      move: null, aim: null, fire: false, reload: false,
      switchWeapon: null, interact: false, place: false,
    };

    const target = perception.zombies[0] || null;
    const hasZombieInRange = target && target.dist < RELOAD_SAFE_R;

    // ---- Always pick the right weapon (with hysteresis) ----
    if (target) {
      const desiredKey = pickWeaponKey(self, target.dist);
      if (desiredKey) {
        const desiredSlot = self.weapons[desiredKey] && self.weapons[desiredKey].slot;
        if (desiredSlot && desiredSlot !== stickySlot &&
            (tickCounter - lastSwitchTick) >= SWITCH_COOLDOWN) {
          action.switchWeapon = desiredSlot;
          stickySlot = desiredSlot;
          lastSwitchTick = tickCounter;
        } else if (!stickySlot && desiredSlot) {
          action.switchWeapon = desiredSlot;
          stickySlot = desiredSlot;
          lastSwitchTick = tickCounter;
        }
      }
    }

    // ---- Always aim + fire at nearest zombie (unconditional) ----
    if (target) {
      const weap = api.weapons[self.weapon] || api.weapons.pistol;
      const bulletSpeed = weap.bulletSpeed || 900;
      action.aim = api.leadShot(self, target, bulletSpeed);

      const isMelee = weap.isMelee || self.weapon === 'saw';
      const inRange = isMelee
        ? target.dist <= (weap.bulletRange || 35) + 5
        : target.dist <= (weap.bulletRange || 700) * 0.95;
      const hasAmmo = (self.ammo.magSize === Infinity) || (self.ammo.mag > 0);
      const notRocket = !weap.isRocket;          // never fire rocket
      const notPlacer = !weap.isPlacer;

      action.fire = inRange && hasAmmo && notRocket && notPlacer;
    }

    // ---- Emergency retreat: only below 30 HP ----
    if (self.hp < PANIC_HP) {
      const heal = nearestHealthPickup(perception);
      if (heal) {
        action.move = steerTo(self, heal, api);
        // still fire defensively (set above)
        if (!hasZombieInRange && self.ammo.magSize !== Infinity &&
            self.ammo.mag === 0 && self.ammo.reserve > 0) {
          action.reload = true;
        }
        return action;
      }
    }

    // ---- Combat movement ----
    if (target) {
      const weap = api.weapons[self.weapon] || api.weapons.pistol;
      const isMelee = weap.isMelee || self.weapon === 'saw';
      const isShotgun = self.weapon === 'shotgun';
      const wantClose = isMelee || isShotgun;

      if (wantClose) {
        // Push into close range if zombie is too far for our chosen weapon.
        if (target.dist > MELEE_PUSH_R || (isMelee && target.dist > 40)) {
          action.move = steerTo(self, target, api);
        }
        // else: stand still and shred
      } else {
        // Pistol/SMG: kite — stay 300-500px away.
        if (target.dist < KITE_MIN) {
          action.move = fleeFrom(self, target, api);
        } else if (target.dist > KITE_MAX) {
          action.move = steerTo(self, target, api);
        }
        // else: in the sweet spot, hold and fire
      }

      // ---- Reload only if mag empty AND no zombie nearby ----
      if (self.ammo.magSize !== Infinity && self.ammo.mag === 0 &&
          self.ammo.reserve > 0 && !hasZombieInRange) {
        action.reload = true;
      }

      // ---- Chest interact: only if chest very close AND no nearby zombie ----
      const chest = perception.chests[0];
      if (chest && chest.dist < CHEST_GRAB_R &&
          (!target || target.dist > CHEST_SAFE_R)) {
        action.interact = true;
      }
      // Pickup interact when on top of it
      const pk = perception.pickups[0];
      if (pk && pk.dist < PICKUP_GRAB_R) {
        action.interact = true;
      }

      return action;
    }

    // ---- No visible zombies: drift toward pickup > chest > nearby POI ----
    let goal = null;
    if (perception.pickups[0])      goal = perception.pickups[0];
    else if (perception.chests[0])  goal = perception.chests[0];
    else if (perception.nearestPOI && perception.nearestPOI.dist < POI_MAX_DIST) {
      goal = perception.nearestPOI;
    }

    if (goal) {
      action.move = steerTo(self, goal, api);
      action.aim = { x: self.x + action.move.x * 200, y: self.y + action.move.y * 200 };
    }

    // Chest interact when wandering past one
    if (perception.chests[0] && perception.chests[0].dist < CHEST_GRAB_R) {
      action.interact = true;
    }
    if (perception.pickups[0] && perception.pickups[0].dist < PICKUP_GRAB_R) {
      action.interact = true;
    }

    // Reload while wandering if mag not full and no threats
    if (self.ammo.magSize !== Infinity && self.ammo.reserve > 0 &&
        self.ammo.mag < self.ammo.magSize) {
      action.reload = true;
    }

    return action;
  },
});

})();
