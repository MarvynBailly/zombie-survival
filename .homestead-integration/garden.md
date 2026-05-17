# Garden module integration (B·02)

`garden.js` owns crop plots tilled by the player, planted with seeds, watered
with a bucket, and harvested for raw crops the kitchen module consumes. State
lives on `Game.gardenPlots`. The module never modifies any existing file —
these edits hook it in.

Depends on:

- `weather.js` for `isRaining()` — must load earlier.
- `items.js` for `ITEMS`, `CRAFT_RECIPES`, `hasItem`, `addItem`, `removeItem` —
  must load earlier.
- `constants.js` for `TILE_SIZE`, `VIEW_W` — load earlier.
- `world.js` for `World.isBlockedTerrainAt`, and `game.js` for `inObstacle`,
  `setNotice`, `rand`, `Audio`, `Game` — all top-level globals already in
  the codebase.

## 1. Script tag (index.html)

Insert after `weather.js` (read), before `game.js` (writes Game.gardenPlots
in resetRun), and importantly **before** `render.js` so `drawGardenPlots`
is in scope when the renderer calls it:

```html
<script src="weather.js"></script>
<script src="garden.js"></script>     <!-- add this line -->
<script src="squad.js"></script>
<script src="game.js"></script>
<script src="render.js"></script>
```

If weather.js isn't wired in yet, garden.js will still load — `isRaining` is
called via `typeof === 'function'` guard, so rain auto-water silently
no-ops until weather lands.

## 2. Item registry — items.js (add entries inside the `ITEMS` object)

```js
// ----- tools -----
hoe: {
  id: 'hoe', name: 'Hoe', category: 'tool',
  stackMax: 1, tint: '#a07a48',
  desc: 'Tills grass into a garden plot. Press T while aiming.',
},
bucket: {
  id: 'bucket', name: 'Bucket', category: 'tool',
  stackMax: 1, tint: '#7e8a98',
  desc: 'Waters a planted plot. Press T while aiming at the plot.',
},
shovel: {
  id: 'shovel', name: 'Shovel', category: 'tool',
  stackMax: 1, tint: '#5e6a78',
  desc: 'Dig moats and pits. Used by garden + moat modules.',
},
// ----- seeds -----
seed_tomato: {
  id: 'seed_tomato', name: 'Tomato Seed', category: 'material',
  stackMax: 20, tint: '#d24b35',
  desc: 'Plant in a tilled plot. Grows in 3 days, needs 2 days of water.',
},
seed_chili: {
  id: 'seed_chili', name: 'Chili Seed', category: 'material',
  stackMax: 20, tint: '#a8252a',
  desc: 'Plant in a tilled plot. Spicy.',
},
seed_poppy: {
  id: 'seed_poppy', name: 'Poppy Seed', category: 'material',
  stackMax: 20, tint: '#7a3aa8',
  desc: 'Plant in a tilled plot. Pharmaceutical use, later.',
},
// ----- raw crops -----
tomato: {
  id: 'tomato', name: 'Tomato', category: 'material',
  stackMax: 20, tint: '#d24b35',
  desc: 'Raw crop. Cook at a stove (kitchen module).',
},
chili: {
  id: 'chili', name: 'Chili', category: 'material',
  stackMax: 20, tint: '#a8252a',
  desc: 'Raw crop. Hot.',
},
poppy: {
  id: 'poppy', name: 'Poppy', category: 'material',
  stackMax: 20, tint: '#7a3aa8',
  desc: 'Raw crop. Kitchen + future meds.',
},
```

`category: 'tool'` is honored elsewhere only by the `useItem` predicate
(consumables only) — tools sit in inventory inert until referenced by name.

If the C·02 Moat module also defines `ITEMS.shovel`, keep the **first**
definition wins (object-literal duplicates throw in strict mode; either drop
the duplicate or assign with `Object.assign(ITEMS, { shovel: { ... } })`).

### Item icons (items.js → drawItemIconShape)

Add fallthrough branches in the `if/else if` chain inside
`drawItemIconShape(ctx, id, size)`. Seven new icons; quick recipes:

- `hoe` — brown handle diagonal + dark blade at the head.
- `bucket` — gray trapezoid with a curved handle line.
- `shovel` — brown handle + gray spade at the head.
- `seed_tomato / seed_chili / seed_poppy` — three small dots in the crop
  color on a tan background (use `ITEMS[id].tint` for the dot).
- `tomato / chili / poppy` — a single solid circle in the crop color with
  a green stem rect at the top.

These are nice-to-have, not load-bearing — the `else { ... }` fallback
in `drawItemIconShape` already renders a `?` box, so missing icons just
look unfinished.

## 3. Crafting recipes — items.js (push to `CRAFT_RECIPES`)

```js
{
  id: 'hoe', label: 'Hoe',
  desc: 'Till garden plots. One per inventory slot.',
  cost: [{ id: 'scrap', n: 6 }],
  apply(p) {
    const left = addItem(p.inventory, 'hoe', 1);
    if (left === 0) setNotice('+1 hoe', 1.2);
    else setNotice('Inventory full — hoe lost', 1.5);
  },
},
{
  id: 'bucket', label: 'Bucket',
  desc: 'Water a garden plot. One per inventory slot.',
  cost: [{ id: 'scrap', n: 3 }],
  apply(p) {
    const left = addItem(p.inventory, 'bucket', 1);
    if (left === 0) setNotice('+1 bucket', 1.2);
    else setNotice('Inventory full — bucket lost', 1.5);
  },
},
{
  id: 'shovel', label: 'Shovel',
  desc: 'Dig pits and moats. One per inventory slot.',
  cost: [{ id: 'scrap', n: 4 }],
  apply(p) {
    const left = addItem(p.inventory, 'shovel', 1);
    if (left === 0) setNotice('+1 shovel', 1.2);
    else setNotice('Inventory full — shovel lost', 1.5);
  },
},
```

C·02 Moat may also push a `shovel` recipe — dedupe by recipe `id` (the
crafting overlay groups by id; if it doesn't, drop whichever is later).

The recipes only show up when a workbench has them — the existing
crafting overlay reads from `CRAFT_RECIPES` flat. No further wiring.

## 4. Chest loot — world.js, function `rollChestContents`

`world.js` builds chest contents as an array of pickup-type strings (then
`spawnPickup` turns them into pickups when the chest opens). Today the
strings are `'health' | 'ammo_pistol' | 'wall' | ...` — pickup types, not
item ids. To drop seeds from chests, the integrator picks one of two paths.

### Path A — quick: route seeds through `spawnPickup`

In `world.js → rollChestContents`, append seeds to the tier rolls:

```js
} else if (tier === 'iron') {
  // ... existing ...
  if (rng() < 0.30) out.push('seed_tomato');
  if (rng() < 0.20) out.push('seed_chili');
}
// mythic tier:
if (rng() < 0.35) out.push('seed_poppy');
```

Then teach `spawnPickup` (game.js) to recognize seed strings:

```js
if (forceType && forceType.startsWith('seed_')) {
  Game.pickups.push({ x, y, r: 12, type: forceType, life: 30, item: forceType });
  return;
}
```

…and the pickup-collect path (`updatePickups` or equivalent — look for
`p.type === 'health'`) needs a `forceType.startsWith('seed_')` branch that
calls `addItem(player.inventory, forceType, 1)`. Mirror the existing
`bandage` collect logic if it exists; otherwise treat seeds as a new pickup
kind. (This work is C·02-adjacent — same plumbing both modules need.)

### Path B — clean: chest "items" field

Extend the chest schema with `items: [{ id, n }]` (or use the existing
`contents` slot for item ids and let openChest distinguish item ids from
pickup-type strings via `ITEMS[s]` truthiness). Then openChest can call
`addItem(player.inventory, id, n)` directly. This is the recommended
direction if other item-spawning systems also land.

For seed odds, target: iron chests ~25% chance per seed kind, mythic
chests ~50% chance of poppy seeds + ~30% chance of either food seed.
Trader integration (T·01) should also stock seeds at 3–5 scrap each.

## 5. resetRun() — game.js (around line 142, after `Game.elapsed = 0`)

```js
Game.elapsed = 0;
initWeather();
initGarden();              // <- add
Game.scoreSubmitted = false;
```

## 6. Main tick — game.js, function `tick(dt)` (next to `updateWeather`)

```js
updateDayCycle(dt);
updateWeather(dt);
updateGarden(dt);          // <- add (no-op for now; reserved for future
                           //    per-frame effects like sprinkler particles)
```

## 7. Day rollover — game.js, function `advanceDayPhase` (around line 380)

In the `newPhase === 'day'` branch, after the day counter is bumped:

```js
} else if (newPhase === 'day') {
  Game.time.day += 1;
  setBanner(`DAY ${Game.time.day}`, 2);
  Audio.sfx.wave();
  grantPerkPoint(1);
  // rollWeatherForDay();    // (weather integration, if not relying on updateWeather)
  onGardenDayRollover();     // <- add (after day counter increments)
}
```

`onGardenDayRollover` reads `Game.time.day` and `isRaining()`, so it must
run after the day-bump and (ideally) after the weather has rolled for the
new day. If weather still rolls one tick later via `updateWeather`, the
rain check on the very first dawn after install will see yesterday's
weather — acceptable, the player won't notice in practice.

## 8. Render — render.js, function `render(alpha)`

`drawGardenPlots` must render after terrain (so plots sit on top of grass)
and **before** obstacles + entities (so a placed wall on a plot draws over
the plot). The renderer already iterates obstacles via
`World.forEachVisibleObstacle` around line 161. Insert directly above it,
just after the puddles block:

```js
// Toxic puddles ...
if (Game.puddles) { /* ... */ }

// Garden plots (drawn over terrain, under obstacles/entities).
drawGardenPlots(ctx, Game.camera.x, Game.camera.y);   // <- add

// Obstacles ...
World.forEachVisibleObstacle(...);
```

The function does its own viewport culling, so unconditional call is fine
even with thousands of plots.

## 9. T-key binding — game.js, function `updatePlayer(dt)` (around line 755)

Right next to the `'h'` (HOLD/FOLLOW) edge-trigger block, add an
edge-triggered `'t'` handler so a single tap = one action:

```js
// T: garden — till / plant / water / harvest depending on context.
if (input.keys.has('t')) {
  if (!p._tHeld) {
    p._tHeld = true;
    if (typeof gardenInputT === 'function') {
      gardenInputT(p, { x: input.wx, y: input.wy });
    }
  }
} else {
  p._tHeld = false;
}
```

`input.wx` / `input.wy` are the existing mouse-in-world coords set near
line 591 of game.js, so no new input plumbing is needed.

If you want garden actions gated on a UI overlay (e.g. when the workbench
overlay is open, eat the T tap), guard the call with `if (Game.mode ===
'playing' && !Game.craftOpen)` or whatever flag the overlay uses.

## 10. Save / Load — persistence.js + game.js

### saveGame() — persistence.js (around line 76, inside the `data` object)

```js
weather: saveWeather(),
garden: saveGarden(),       // <- add
```

JSON shape:

```json
{
  "nextId": 4,
  "plots": [
    { "id": 1, "x": 12800, "y": 12760,
      "plantedDay": 2, "crop": "tomato",
      "lastWateredDay": 3, "lastCreditDay": 3,
      "wateredDays": 2, "harvested": false }
  ]
}
```

### restoreFromSave(d) — game.js (around line 275, after `loadWeather`)

```js
loadWeather(d.weather);
loadGarden(d.garden);        // <- add (loadGarden(null) is safe — it just
                             //    calls initGarden())
```

### SAVE_VERSION — constants.js

Bump from `5` (or current value after weather wiring) to the next integer
so saves without the `garden` field are dropped cleanly. The garden
`load` path is tolerant of `null`, so a soft-load (don't bump version)
also works — but the recommendation is to bump.

## 11. Notes for downstream modules

- **Kitchen (B·03)**: consumes `tomato`, `chili`, `poppy` from inventory.
  Recipes live in kitchen.js; no garden-side changes needed.
- **Trader (T·01)**: stock `seed_tomato / seed_chili / seed_poppy` at a few
  scrap each so seeds are reachable without depending on chest spawns.
- **Moat (C·02)**: shares `ITEMS.shovel` — see §2 for the dedupe note.
- The plot grid is `TILE_SIZE` (40 px), aligned to the wall grid. Walls
  and plots cannot overlap visually if both stay on-grid.
