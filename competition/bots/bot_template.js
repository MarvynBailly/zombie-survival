'use strict';

// ============================================================================
// BOT TEMPLATE — copy this file, rename, replace the strategy.
// ============================================================================
//
// File name: bot_<your-name>.js   (in competition/bots/)
// Then register it with: <script src="competition/bots/bot_<your-name>.js"></script>
// in index.html before bot.js loads.
//
// Your bot is one function: `decide(perception, api)` -> Action.
// You may keep state in closure variables; the harness calls `reset()` at the
// start of every match so you can clear that state.
//
// ----------------------------------------------------------------------------
// Perception: see competition/SPEC.md for the full schema. Highlights:
//   perception.self.{x,y,hp,maxHp,weapon,ammo:{mag,reserve,magSize}}
//   perception.zombies  — array, sorted nearest first; only visible + LOS
//   perception.chests   — visible chests sorted by distance
//   perception.pickups  — visible pickups (ammo/health/weapons)
//   perception.walls / .obstacles / .barrels
//   perception.day / perception.phase / perception.secondsToDusk
//   perception.score / perception.kills / perception.elapsed
//   perception.nearestPOI — undiscovered POI compass target
//
// Action (every field optional):
//   move: {x: -1..1, y: -1..1}     // 2D unit vector
//   aim:  {x, y}                   // world-space target point
//   fire: boolean                  // true to hold left-click
//   reload: boolean                // press R this tick
//   switchWeapon: '1'..'9','0','-','='  // weapon slot to switch to
//   place: boolean                 // press space (place barrel / wall)
//   interact: boolean              // press E (loot chest)
//
// Helpers passed in `api`:
//   api.hasLOS(ax,ay,bx,by)                   // line of sight raycast
//   api.leadShot(self, target, bulletSpeed)   -> {x,y}
//   api.distance(a, b)                        // euclidean
//   api.pathfindStep(from, goal)              -> {x,y} | null
//                                             //   unit step routed around obstacles
//   api.isBlocked(x, y)                       -> boolean
//   api.findBreakable(from, dx, dy, maxDist)  -> { cx,cy, kind, hp, maxHp } | null
//                                             //   first breakable wall/obstacle along a ray
//   api.weapons[key]                          // read-only weapon meta (range, fireRate…)
//   api.zombies[type]                         // read-only zombie meta (hp, speed, score)
//   api.clamp / api.lerp / api.angleBetween
//
// FORBIDDEN inside decide():
//   Game, World, NAV, Spatial, ZOMBIES, WEAPONS, WEAPON_ORDER,
//   input, ctx, canvas, document, localStorage, Audio,
//   findChestNear, findNearestUndiscoveredPOI, etc.
//
// The harness scans your decide() source for these and warns at runtime.
// ============================================================================

(function () {

// Per-match state lives in closure here.
let lastSpotted = null;

Arena.register({
  name:    'template',     // CHANGE THIS to something unique
  author:  'you',
  version: '1.0',

  // Called once when a new match begins. Reset any per-match state.
  reset() {
    lastSpotted = null;
  },

  // Called every game tick (60 Hz). Return an Action object.
  decide(perception, api) {
    const self = perception.self;
    const threat = perception.zombies[0] || null;

    if (threat) lastSpotted = threat;

    const action = {};

    // EXAMPLE: always face the nearest threat and shoot it.
    if (threat) {
      action.aim  = api.leadShot(self, threat, api.weapons[self.weapon].bulletSpeed);
      action.fire = threat.dist < (api.weapons[self.weapon].bulletRange || 700) * 0.9
                    && self.ammo.mag > 0;
    }

    // EXAMPLE: auto-reload when the mag is empty.
    if (self.ammo.magSize !== Infinity && self.ammo.mag === 0 && self.ammo.reserve > 0) {
      action.reload = true;
    }

    return action;
  },
});

})();
