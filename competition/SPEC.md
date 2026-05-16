# Bot Arena — Specification

You are designing a bot to play a top-down zombie survival game. Bots are
scored by how high they push **score** and how many **days survived**. A bot
is a single `decide(perception, api)` function that receives a snapshot of
what the player can see and returns a per-tick action.

This document is the source of truth for what your bot may read and write.

---

## File layout

```
competition/
  api.js                     # harness — DO NOT EDIT
  harness.js                 # harness — DO NOT EDIT
  bots/
    bot_random.js            # house — sanity bot
    bot_simple.js            # house — baseline (kite + shoot)
    bot_marvyn.js            # house — port of the in-game B-toggle bot
    bot_template.js          # copy this to start
    bot_<your-name>.js       # your submission
```

To enter, drop one file `bot_<your-name>.js` into `competition/bots/` and add
a `<script>` tag for it in `index.html` (after `competition/api.js`).

---

## Lifecycle

1. The harness calls your bot's `reset()` once when a match begins.
2. The harness calls `decide(perception, api)` every game tick (60 Hz) for the
   entire match.
3. The match ends when the player dies. The harness records `score`, `days`,
   `kills`, `elapsed`, and starts the next queued match (if any).

You may keep state in closure variables across ticks within a single match.
Always clear that state in `reset()`.

---

## Perception schema (what your bot receives)

```ts
Perception = {
  tick: number;              // monotonic; increments by 1 each game tick
  dt: number;                // 1/60

  // === Player ===
  self: {
    x, y, r;
    vx, vy;                  // last-frame velocity
    angle;                   // current facing (radians)
    hp, maxHp;
    iframe;                  // seconds of i-frames remaining (>0 means invulnerable)
    weapon: string;          // 'pistol' | 'shotgun' | 'smg' | 'rocket' | 'barrel' | 'wall' | 'crossbow' | 'flamer' | 'minigun' | 'railgun' | 'gl' | 'saw'
    fireCd;                  // seconds until next shot allowed
    reloading;               // seconds of reload remaining
    placeCd;                 // seconds until next placement allowed
    openCd;                  // seconds until next chest interact allowed

    ammo: {                  // CURRENT weapon's ammo
      mag, reserve, magSize, magFull;
    };
    weapons: {               // per-weapon snapshot
      [key: string]: {
        unlocked: boolean;
        mag, reserve, magSize;
        damage, range, fireRate;
        isPlacer, isWall, isRocket: boolean;
        slot: string;        // keyboard slot, e.g. '1'..'9','0','-','='
      };
    };
    minigunSpin, railCharge, chillMult;
  };

  // === Threats — visible (on-screen + LOS to player), sorted by distance ===
  zombies: Array<{
    id: number;              // stable across ticks within a match
    type: string;            // 'walker' | 'runner' | 'tank' | 'fire' | ...
    x, y, r;
    vx, vy;
    hp, maxHp;
    dist;                    // distance from self
    angleFromSelf;           // atan2(z.y - self.y, z.x - self.x)
  }>;
  totalZombieCount: number;  // total alive, even off-screen (situational pressure)

  // === Loot — visible ===
  chests:  Array<{ id, tier, x, y, hp, maxHp, opened, dist, angleFromSelf }>;
  pickups: Array<{ id, type, x, y, dist, angleFromSelf }>;
                              // pickup type: 'health' | 'ammo' | weapon-key | 'wall'

  // === Map context — walls/obstacles/barrels within 1200px of player ===
  // (no viewport gate, no LOS gate — so the bot can plan around terrain it
  // hasn't yet centered on screen)
  walls:     Array<{ id, x, y, w, h, cx, cy, hp, maxHp, mine: true, dist }>;
  obstacles: Array<{ id, x, y, w, h, cx, cy, style, hp, maxHp,
                     breakable, indestructible, dist }>;
  barrels:   Array<{ id, x, y, r, hp, dist }>;

  // === Day cycle ===
  day: number;               // 1, 2, 3, ...
  phase: 'day' | 'dusk' | 'night' | 'dawn';
  phaseT, phaseRemaining;    // seconds in current phase
  secondsToDusk, secondsToNight, secondsToDawn;

  // === Scoring (read-only) ===
  score, kills, elapsed;

  // === Misc ===
  world: { w, h };           // 32000 x 32000
  view:  { x, y, w, h };     // camera/viewport
  levelName: string;
  nearestPOI: { x, y, dist, angleFromSelf } | null;  // undiscovered point-of-interest
};
```

### What "visible" means

| Entity                    | Visibility rule                                   |
|---------------------------|---------------------------------------------------|
| zombies                   | inside viewport (1024×768) **and** LOS to player  |
| chests, pickups           | inside viewport (no LOS required)                 |
| walls, obstacles, barrels | within 1200 px of player (no viewport, no LOS)    |

Why the wider radius for static map structure: bots need to know about walls
they're walking *toward* so they can route around or shoot through them.
Dynamic entities (zombies) still get the player's narrower vision —
otherwise bots would have unfair situational awareness of off-screen threats.

---

## Action schema (what your bot returns)

Every field is optional. Return `{}` to do nothing.

```ts
Action = {
  move:        { x: number, y: number } | null;  // 2D vector; magnitude is normalized if > 1
  aim:         { x: number, y: number } | null;  // world-space target point
  fire:        boolean;                          // hold left-click while true
  reload:      boolean;                          // press R this tick
  switchWeapon: string | null;                   // weapon slot '1'..'='; null = no change
  place:       boolean;                          // press space (place barrel / wall)
  interact:    boolean;                          // press E (loot chest)
};
```

### Mapping notes

| Action field    | Game effect                                                  |
|-----------------|--------------------------------------------------------------|
| `move.x > 0.35` | hold `D`                                                     |
| `move.y > 0.35` | hold `S`                                                     |
| `aim`           | sets `mouseX/Y` (world-space, harness converts to screen)    |
| `fire: true`    | holds left mouse button (most weapons auto-fire at fireRate) |
| `switchWeapon`  | one-shot keypress to switch weapon                           |
| `reload: true`  | one-shot `R` (game ignores if not needed)                    |
| `place: true`   | one-shot `Space` (places a barrel/wall if equipped)          |
| `interact: true`| one-shot `E` (opens a chest if you're in range)              |

---

## Helpers (the `api` parameter)

```ts
// ---- Combat utilities ----
api.hasLOS(ax, ay, bx, by) -> boolean         // line-of-sight raycast (bullets)
api.leadShot(self, target, bulletSpeed) -> { x, y }
api.distance(a, b) -> number

// ---- Navigation ----
// Unit-vector next-step direction from `from` toward `goal`, routed around
// walls/obstacles via the game's flow-field grid. Memoised internally —
// cheap to call every tick. Returns null if the goal is unreachable or
// `from` is outside the nav window.
api.pathfindStep(from, goal) -> { x, y } | null

// True if (x, y) lies inside a navigation-blocked cell (wall / obstacle /
// out-of-bounds). Useful for pre-flighting a candidate move.
api.isBlocked(x, y) -> boolean

// First breakable wall / obstacle along a ray from `from` in direction
// (dx, dy), within `maxDist` (default 160). Use this to pick what to shoot
// when you're stuck and want to clear the path.
api.findBreakable(from, dx, dy, maxDist) ->
    { x, y, cx, cy, kind: 'wall'|'obstacle', hp, maxHp, style? } | null

// ---- Read-only meta tables ----
api.weapons -> { [key]: { damage, range, fireRate, magSize, bulletSpeed,
                          isPlacer, isWall, isRocket, isMelee, explodeRadius,
                          ... } }
api.zombies -> { [type]: { hp, speed, damage, radius, score, isFire } }

// ---- Pure utilities ----
api.clamp(v, lo, hi), api.lerp(a, b, t), api.angleBetween(a, b)
```

`api` is the same object every tick — feel free to cache references to it.

### Recommended usage pattern

```js
// Travel toward a goal, routing around walls. Fall back to direct steering
// when the pathfinder can't help (goal outside nav window, etc).
const step = api.pathfindStep(self, goal);
if (step) {
  action.move = step;
} else {
  const dx = goal.x - self.x, dy = goal.y - self.y;
  const m = Math.hypot(dx, dy) || 1;
  action.move = { x: dx / m, y: dy / m };
}

// If you're not making forward progress, shoot what's in the way.
const br = api.findBreakable(self, step.x, step.y, 120);
if (br) {
  action.aim  = { x: br.cx, y: br.cy };
  action.fire = true;
}
```

---

## Forbidden globals

Your bot **must not** reference any of these inside `decide()`:

`Game`, `World`, `NAV`, `Spatial`, `ZOMBIES`, `WEAPONS`, `WEAPON_ORDER`,
`input`, `ctx`, `canvas`, `document`, `localStorage`, `Audio`, `render`,
`tick`, `renderHUD`, `findChestNear`, `findNearestUndiscoveredPOI`.

The harness scans your `decide()` source for these and warns on match start.
Everything you need is in `perception` and `api`. If you think you need
something else, that's a sign the API is incomplete — open the SPEC and add a
field instead of reaching for globals.

---

## Bot file template

```js
'use strict';
(function () {

let state = null;            // per-match memory; reset() clears it

Arena.register({
  name:    'my-bot',         // MUST be unique across all bots
  author:  'your name',
  version: '1.0',

  reset() {
    state = { /* ... */ };
  },

  decide(perception, api) {
    const action = {};
    // ... your strategy here ...
    return action;
  },
});

})();
```

---

## Game mechanics cheat sheet

- World is huge (32000×32000); the camera follows the player. The arena
  effectively scrolls — you can walk away from danger if the terrain allows.
- **Day cycle**: ~4 minutes. `day` (calm) → `dusk` (ramp) → `night` (siege) →
  `dawn` (cleanup). Spawn pressure peaks during `night`.
- **Walls** (slot `6`) are player-placeable, 250 HP, used to funnel zombies or
  fortify a corner. You start with 4 in reserve; chests drop more.
- **Barrels** (slot `5`) chain-explode when shot or when an enemy touches one.
- **Chests** require pressing `E` (interact: true) when within ~60px. They
  drop weapons, ammo, walls, and health.
- **Pickups** auto-collect on touch.
- **Rocket launcher** AoE will damage you if you fire at point-blank — keep
  `dist > explodeRadius + 60`.
- **Chainsaw** is melee (forward cone). It has infinite ammo.
- Score formula at death: `Game.score + Game.time.day * 200 + floor(elapsed) * 0.5`
  where `Game.score` accrues `zombieScore * (1 + (day-1) * 0.15)` per kill.

---

## How scoring works

A tournament runs each bot N times on the same level (default: 5 runs).
Each run records: `score`, `days`, `kills`, `elapsed`, `reason`.

**Ranking is by mean(score) across runs**, with mean(days) and mean(kills)
as tiebreakers. The leaderboard in the Bot Arena UI shows mean ± stdev plus
best run for each bot.

A run can end three ways:
- `died`: the player's HP dropped to 0.
- `timeout`: the run exceeded 12 minutes (rare — the harness caps it).
- `aborted`: the user manually stopped the tournament.

Aborted runs are still recorded (with whatever score was achieved at the
moment of abort).
