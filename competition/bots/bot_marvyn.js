'use strict';

// ============================================================================
// bot_marvyn — port of the original bot.js state machine onto the Arena API.
// ============================================================================
// One mode per frame, one move intent. No flow-field (the bot can't read NAV
// internals), so travel just steers directly toward the goal and relies on
// stuck-detection + sidestep to handle obstacles.
//
// Strategy:
//   EVADE     — any visible zombie inside 70px: flee weighted centroid
//   UNSTUCK   — stuck >0.7s and a breakable in front: stand, shoot it
//   ATTACK    — visible zombie inside 360px: lead, fire, no movement
//   SIDESTEP  — stuck with no breakable: hold a perpendicular for 0.5s
//   TRAVEL    — drift toward (visible chest > visible pickup > nearest POI)
// ============================================================================

(function () {

const EVADE_R       = 70;
const ENGAGE_R      = 360;
const STUCK_WINDOW  = 1.5;
const STUCK_MIN     = 35;
const STUCK_TRIG    = 0.7;
const SIDESTEP_DUR  = 0.5;

const MODE_PRI = { evade: 5, unstuck: 4, attack: 3, sidestep: 2, travel: 1, idle: 0 };
const MODE_MIN_DUR = {
  evade: 0.30, unstuck: 0.30, attack: 0.35, sidestep: SIDESTEP_DUR, travel: 0.20, idle: 0.0,
};

let mode = 'idle';
let modeUntil = 0;
let sideX = 0, sideY = 0;
let posSamples = [];          // [{t,x,y}]
let stuckT = 0;
let lastT = 0;
let lastIntentMove = null;
let unstuckTargetCx = 0, unstuckTargetCy = 0;

// Weapon selection based on situation.
function pickCombatSlot(self, target, api) {
  const w = self.weapons;
  const has = (k) => w[k] && w[k].unlocked && (
    (w[k].mag || 0) > 0 || (w[k].reserve || 0) > 0 || w[k].magSize === Infinity
  );
  const dist = target ? target.dist : Infinity;
  const tank = target && target.type === 'tank';
  if (tank && has('rocket') && dist > (api.weapons.rocket.explodeRadius + 80)) return w.rocket.slot;
  if (target && dist < 160 && has('shotgun')) return w.shotgun.slot;
  if (has('smg'))     return w.smg.slot;
  if (has('pistol'))  return w.pistol.slot;
  if (has('shotgun')) return w.shotgun.slot;
  if (has('rocket') && dist > (api.weapons.rocket.explodeRadius + 80)) return w.rocket.slot;
  return null;
}
function pickWallSlot(self) {
  const w = self.weapons;
  const has = (k) => w[k] && w[k].unlocked && (
    (w[k].mag || 0) > 0 || (w[k].reserve || 0) > 0 || w[k].magSize === Infinity
  );
  if (has('pistol'))  return w.pistol.slot;
  if (has('smg'))     return w.smg.slot;
  if (has('shotgun')) return w.shotgun.slot;
  return null;
}

// Look for a breakable wall/obstacle along a direction via the arena helper.
function findBreakableInDir(api, self, dirX, dirY) {
  return api.findBreakable(self, dirX, dirY, 120);
}

function chooseGoal(perception) {
  if (perception.chests[0])  return { x: perception.chests[0].x,  y: perception.chests[0].y,  reason: 'chest'  };
  if (perception.pickups[0]) return { x: perception.pickups[0].x, y: perception.pickups[0].y, reason: 'pickup' };
  if (perception.nearestPOI) return { x: perception.nearestPOI.x, y: perception.nearestPOI.y, reason: 'poi'    };
  return null;
}

function updateStuck(self, t, dt) {
  posSamples.push({ t, x: self.x, y: self.y });
  while (posSamples.length && posSamples[0].t < t - STUCK_WINDOW) posSamples.shift();
  // Only count stuck time when we asked to move last tick.
  if (!lastIntentMove) { stuckT = 0; return; }
  if (posSamples.length < 4 || (t - posSamples[0].t) < (STUCK_WINDOW - 0.3)) return;
  const old = posSamples[0];
  const moved = Math.hypot(self.x - old.x, self.y - old.y);
  if (moved < STUCK_MIN) stuckT += dt; else stuckT = 0;
}

Arena.register({
  name:    'marvyn',
  author:  'house (port of bot.js)',
  version: '1.0',

  reset() {
    mode = 'idle';
    modeUntil = 0;
    sideX = sideY = 0;
    posSamples = [];
    stuckT = 0;
    lastT = 0;
    lastIntentMove = null;
  },

  decide(perception, api) {
    const self = perception.self;
    const t = perception.elapsed;
    const dt = perception.dt;
    lastT = t;

    updateStuck(self, t, dt);

    const goal = chooseGoal(perception);
    const z0 = perception.zombies[0] || null;
    const d0 = z0 ? z0.dist : Infinity;

    // -------- choose desired mode --------
    let desired;
    let stuckBreakable = null;
    // Try pathfinding first; if the flow-field has a route we DON'T need to
    // shoot through anything. We only consider 'unstuck' if pathfinding
    // hasn't been able to make progress.
    const flowStep = goal ? api.pathfindStep(self, goal) : null;

    if (stuckT > STUCK_TRIG && goal) {
      // Aim at the goal direction OR the flow-field direction, whichever we
      // were actually trying to move along.
      let dirX, dirY;
      if (flowStep) { dirX = flowStep.x; dirY = flowStep.y; }
      else {
        const ddx = goal.x - self.x, ddy = goal.y - self.y;
        const m = Math.hypot(ddx, ddy) || 1;
        dirX = ddx / m; dirY = ddy / m;
      }
      stuckBreakable = findBreakableInDir(api, self, dirX, dirY);
    }

    if (z0 && d0 < EVADE_R) {
      desired = 'evade';
    } else if (stuckT > STUCK_TRIG && stuckBreakable) {
      desired = 'unstuck';
      unstuckTargetCx = stuckBreakable.cx;
      unstuckTargetCy = stuckBreakable.cy;
    } else if (z0 && d0 < ENGAGE_R && pickCombatSlot(self, z0, api)) {
      desired = 'attack';
    } else if (goal) {
      desired = (stuckT > STUCK_TRIG + 0.3 && !stuckBreakable) ? 'sidestep' : 'travel';
    } else {
      desired = 'idle';
    }

    // -------- hysteresis --------
    if (mode !== desired) {
      const higher = MODE_PRI[desired] > MODE_PRI[mode];
      if (higher || t >= modeUntil) {
        mode = desired;
        modeUntil = t + (MODE_MIN_DUR[desired] || 0);
        if (desired === 'sidestep' && goal) {
          const dx = goal.x - self.x, dy = goal.y - self.y;
          const m = Math.hypot(dx, dy) || 1;
          const fx = dx / m, fy = dy / m;
          const side = Math.random() < 0.5 ? 1 : -1;
          sideX = -fy * side;
          sideY =  fx * side;
        }
      }
    }

    const action = {};

    // Loot interact if any chest is right under us.
    if (perception.chests[0] && perception.chests[0].dist < 60) action.interact = true;

    switch (mode) {
      case 'evade': {
        let cx = 0, cy = 0, ws = 0;
        for (const z of perception.zombies) {
          if (z.dist > EVADE_R * 1.6) continue;
          const w = 1 / Math.max(20, z.dist * z.dist);
          cx += z.x * w; cy += z.y * w; ws += w;
        }
        if (ws > 0) {
          cx /= ws; cy /= ws;
          const fx = self.x - cx, fy = self.y - cy;
          const fl = Math.hypot(fx, fy) || 1;
          action.move = { x: fx / fl, y: fy / fl };
        }
        break;
      }
      case 'unstuck': {
        action.aim = { x: unstuckTargetCx, y: unstuckTargetCy };
        action.switchWeapon = pickWallSlot(self);
        const weap = api.weapons[self.weapon] || api.weapons.pistol;
        const dx = unstuckTargetCx - self.x, dy = unstuckTargetCy - self.y;
        const dist = Math.hypot(dx, dy);
        const inRange = dist <= (weap.bulletRange || 700) * 0.95;
        action.fire = inRange && self.ammo.mag > 0 && !weap.isPlacer && !weap.isRocket;
        break;
      }
      case 'attack': {
        if (z0) {
          action.switchWeapon = pickCombatSlot(self, z0, api);
          const slot = action.switchWeapon;
          const weapKey = self.weapon; // current weapon for range/speed read
          const weap = api.weapons[weapKey] || api.weapons.pistol;
          action.aim = api.leadShot(self, z0, weap.bulletSpeed || 900);
          // LOS-checked via perception (zombies in perception already have LOS).
          const inRange = z0.dist <= (weap.bulletRange || 700) * 0.95;
          const safeAoE = !weap.isRocket || z0.dist > (weap.explodeRadius + 60);
          action.fire = inRange && safeAoE && self.ammo.mag > 0 && !weap.isPlacer;
        }
        break;
      }
      case 'sidestep':
        action.move = { x: sideX, y: sideY };
        break;
      case 'travel':
        if (goal) {
          // Prefer the flow-field step we already computed above. Fallback to
          // direct steering only if the goal is outside the nav window.
          if (flowStep) {
            action.move = flowStep;
          } else {
            const dx = goal.x - self.x, dy = goal.y - self.y;
            const m = Math.hypot(dx, dy) || 1;
            action.move = { x: dx / m, y: dy / m };
          }
        }
        break;
      case 'idle':
      default:
        break;
    }

    // Reload policy: out of combat OR mag empty.
    const curMag = self.ammo.mag, curRes = self.ammo.reserve, curSize = self.ammo.magSize;
    if (curSize !== Infinity && curRes > 0 && self.reloading <= 0 && curMag < curSize) {
      const offCombat = mode === 'travel' || mode === 'idle' || mode === 'sidestep';
      if (curMag === 0 || (offCombat && curMag < curSize / 2)) {
        action.reload = true;
      }
    }

    lastIntentMove = action.move || null;
    return action;
  },
});

})();
