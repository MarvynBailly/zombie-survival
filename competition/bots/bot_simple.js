'use strict';

// Simple baseline bot.
//
// Strategy:
//   - Kite: walk away from the nearest visible zombie if it's close.
//   - Shoot: aim at the nearest visible zombie with predictive lead.
//   - Reload when the magazine is empty.
//   - If health is high and no nearby threats, drift toward the nearest POI.
//
// No memory between ticks, no LOS rays — just whatever's in perception.

(function () {

Arena.register({
  name: 'simple',
  author: 'house',
  version: '1.0',

  decide(perception, api) {
    const self = perception.self;
    const target = perception.zombies[0] || null;
    const action = {
      move: null,
      aim: null,
      fire: false,
      reload: false,
      switchWeapon: null,
      interact: false,
      place: false,
    };

    // ----- Reload when needed -----
    if (self.ammo.magSize !== Infinity && self.ammo.mag === 0 && self.ammo.reserve > 0) {
      action.reload = true;
    }

    // ----- Loot chests if standing on one -----
    if (perception.chests[0] && perception.chests[0].dist < 60) {
      action.interact = true;
    }

    // ----- Combat -----
    if (target) {
      const bs = api.weapons[self.weapon].bulletSpeed || 900;
      action.aim  = api.leadShot(self, target, bs);
      action.fire = target.dist < (api.weapons[self.weapon].bulletRange || 700) * 0.9
                    && self.ammo.mag > 0;
      // Kite if too close — try pathfinding away first, fall back to direct.
      if (target.dist < 140) {
        const fleePoint = {
          x: self.x + (self.x - target.x),
          y: self.y + (self.y - target.y),
        };
        action.move = api.pathfindStep(self, fleePoint) || {
          x: (self.x - target.x) / target.dist,
          y: (self.y - target.y) / target.dist,
        };
      }
      return action;
    }

    // ----- No threats: drift toward POI / pickups / chests -----
    let goal = null;
    if (perception.pickups[0])      goal = perception.pickups[0];
    else if (perception.chests[0])  goal = perception.chests[0];
    else if (perception.nearestPOI) goal = perception.nearestPOI;
    if (goal) {
      // Use the harness's flow-field pathfinder so we route around walls
      // instead of mashing into them. Fall back to direct steering if the
      // goal is outside the nav window or unreachable.
      const step = api.pathfindStep(self, goal);
      if (step) {
        action.move = step;
      } else {
        const dx = goal.x - self.x, dy = goal.y - self.y;
        const m = Math.hypot(dx, dy) || 1;
        action.move = { x: dx / m, y: dy / m };
      }
      // Aim along travel direction so a fresh threat is already covered.
      action.aim = { x: self.x + (action.move.x * 200), y: self.y + (action.move.y * 200) };
    }
    return action;
  },
});

})();
