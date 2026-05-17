# Power Grid Integration

`power.js` is self-contained but needs to be wired into the existing
game loop, save format, item registry, and the E-key interact dispatch.
All the work below is in existing files — `power.js` itself does not
need any further changes.

Module exports (all top-level globals, mirroring `squad.js` style):

- `initPower()` — clear state for a new run
- `updatePower(dt)` — per-tick fuel drain + auto-shutoff
- `drawGenerators(ctx, camX, camY)` — render pass
- `placeGenerator(worldX, worldY)` — try to drop one (returns gen | null)
- `isPowered(worldX, worldY)` — boolean, for Garage / Radio / Cameras
- `findGeneratorNear(player, radius=60)` — for E-key interaction
- `tryRefuelGenerator(gen, player)` — eats fuel_can / scrap from inventory
- `damageGenerator(gen, dmg)` — destruction + half-fuel scrap drop
- `savePower()` / `loadPower(data)` — persistence

The module assumes these globals are already defined by the rest of the
codebase: `Game`, `Audio`, `setNotice`, `clamp`, `rand`, `World`, `ITEMS`,
`hasItem`, `removeItem`, `WALL_SIZE`, `WORLD_W`, `WORLD_H`, `VIEW_W`,
`TILE_SIZE`. None of these are redeclared in `power.js`.

---

## 1. Script tag

In `index.html`, add a `<script>` tag for the new module. It must load
**before `game.js`** (so `game.js` can call `initPower` etc.) and **after
`items.js`** (so `ITEMS.scrap` / `ITEMS.fuel_can` exist when the module
runs). Drop it right between `squad.js` and `game.js`:

```html
<script src="items.js"></script>
<script src="perks.js"></script>
<script src="squad.js"></script>
<script src="power.js"></script>   <!-- NEW -->
<script src="game.js"></script>
```

---

## 2. Constants (`constants.js`)

`power.js` declares its own constants at the top of the file, but if the
codebase prefers a single canonical home for tunables, mirror them in
`constants.js` and delete the inline copies in `power.js`. Recommended
additions (append to the end of the file):

```javascript
// Power grid — placeable generators feed Garage / Radio / Cameras.
const GENERATOR_HP = 200;
const GENERATOR_MAX_FUEL = 100;
const GENERATOR_RANGE = 8 * TILE_SIZE;     // 320px aura
const GENERATOR_FUEL_PER_SEC = 0.10;       // 1 fuel / 10 sec
const GENERATOR_INTERACT_RADIUS = 60;
const GENERATOR_SCRAP_FUEL = 5;
const GENERATOR_CAN_FUEL = 50;
```

If you do this, delete the matching `const ...` lines from the top of
`power.js`. (The module works either way.)

---

## 3. New items (`items.js`)

Register the two new items inside the `ITEMS = { ... }` literal, alongside
`scrap` / `bandage` / `antibiotic`:

```javascript
  // ----- materials -----
  fuel_can: {
    id: 'fuel_can', name: 'Fuel Can', category: 'material',
    stackMax: 5, tint: '#e3a83a',
    desc: 'Petrol can. Pour into a generator (E) for +50 fuel.',
  },

  // ----- tools -----
  generator_kit: {
    id: 'generator_kit', name: 'Generator Kit', category: 'tool',
    stackMax: 1, tint: '#5a606b',
    desc: 'A boxed gas generator. Right-click to deploy in front of you.',
    use(p) {
      const ax = p.x + Math.cos(p.angle) * 40;
      const ay = p.y + Math.sin(p.angle) * 40;
      const gen = (typeof placeGenerator === 'function') ? placeGenerator(ax, ay) : null;
      return !!gen;   // useItem will consume one on true
    },
  },
```

Optionally add procedural icons in `drawItemIconShape(ctx, id, size)`:

```javascript
  } else if (id === 'fuel_can') {
    // red jerry can with yellow cap stripe
    ctx.fillStyle = '#3a1f1c';
    ctx.fillRect(cx - 9, cy - 11, 18, 22);
    ctx.fillStyle = '#a8362b';
    ctx.fillRect(cx - 8, cy - 10, 16, 20);
    ctx.fillStyle = '#e3a83a';
    ctx.fillRect(cx - 8, cy - 10, 16, 3);
    ctx.fillStyle = '#0b0c0e';
    ctx.fillRect(cx + 2, cy - 13, 4, 3);
    ctx.fillStyle = '#ece7d7';
    ctx.font = 'bold 8px monospace';
    ctx.fillText('FUEL', cx - 8, cy + 4);
  } else if (id === 'generator_kit') {
    // small dark box with two yellow stripes
    ctx.fillStyle = '#2a2d33';
    ctx.fillRect(cx - 12, cy - 9, 24, 18);
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(cx - 11, cy - 8, 22, 16);
    ctx.fillStyle = '#e3a83a';
    ctx.fillRect(cx - 9, cy - 3, 18, 2);
    ctx.fillRect(cx - 9, cy + 2, 18, 2);
    ctx.fillStyle = '#8ec547';
    ctx.fillRect(cx + 8, cy - 7, 2, 2);
  }
```

A craft recipe for the kit is optional but useful — add to `CRAFT_RECIPES`:

```javascript
  {
    id: 'generator_kit',
    label: 'Generator Kit',
    desc: 'Deployable power generator (1 tile, 320px aura).',
    cost: [{ id: 'scrap', n: 30 }],
    apply(p) {
      const left = addItem(p.inventory, 'generator_kit', 1);
      if (left === 0) setNotice('+1 generator kit', 1.5);
      else setNotice('Inventory full — kit lost', 1.5);
    },
  },
```

A craft recipe for a fuel can:

```javascript
  {
    id: 'fuel_can',
    label: 'Fuel Can',
    desc: '+50 generator fuel. Stacks of up to 5.',
    cost: [{ id: 'scrap', n: 8 }],
    apply(p) {
      const left = addItem(p.inventory, 'fuel_can', 1);
      if (left === 0) setNotice('+1 fuel can', 1.2);
      else setNotice('Inventory full — can lost', 1.5);
    },
  },
```

---

## 4. `resetRun()` wiring (`game.js`)

Inside `resetRun(levelIndex)` — the function starts at line 109 — add the
`initPower()` call. The natural home is right after the squad / world-
survivor initialization, before the player is constructed. Insert
immediately **after** the `Game.worldSurvivors = [];` line:

```javascript
  Game.squad = [];
  Game.worldSurvivors = [];
  initPower();             // NEW — clears Game.generators
  Game.startTime = now();
```

---

## 5. Main tick wiring (`game.js`)

Inside `tick(dt)` — the function starts at line 2371 — add the
`updatePower(dt)` call. Drop it next to the other "world objects"
updates, immediately **after** the existing `updateSquad(dt);` line
(line 2385):

```javascript
  updateSquad(dt);
  updatePower(dt);         // NEW — fuel drain + auto-shutoff
  updateBullets(dt);
```

---

## 6. Render dispatch (`render.js`)

Generators draw inside the world transform, between obstacles/walls and
the player/squad pass — the same band where `Game.walls` and `Game.barrels`
are rendered. Inside `draw()` in `render.js`, find the block that renders
walls (around line 177):

```javascript
    // player-placed walls
    for (const w of Game.walls) if (rectInView(w)) ZSprites.drawWall(ctx, w);
```

Immediately **after** that loop (before the ghost-preview block at line
180), add:

```javascript
    // power grid — generators + their aura.
    if (typeof drawGenerators === 'function') {
      drawGenerators(ctx, cam.x, cam.y);
    }
```

The module does its own viewport culling.

---

## 7. Save / load wiring (`persistence.js`)

### saveGame()
In the `data = { ... }` object literal (starts at line 35), add a single
new field. Drop it next to `walls` / `barrels` so the JSON shape stays
grouped by topic:

```javascript
    walls: Game.walls.map(w => ({ ... })),
    barrels: Game.barrels.map(b => ({ ... })),
    generators: (typeof savePower === 'function') ? savePower() : [],
```

The shape `savePower()` returns is an array of:

```json
{ "x": 0, "y": 0, "hp": 200, "maxHp": 200,
  "fuel": 0, "maxFuel": 100, "on": false, "range": 320 }
```

Bump `SAVE_VERSION` in `constants.js` from `5` to `6`. Old saves will be
rejected (`hasSavedGame() && loadSavedGame() === null`) — that's intentional
since old saves have no generators array.

### loadSavedGame() (consumer is `restoreFromSave` in game.js)
Inside `restoreFromSave(d)` in `game.js`, after the `Game.barrels =
(d.barrels || []).map(...)` assignment (around line 245), add:

```javascript
  if (typeof loadPower === 'function') loadPower(d.generators || []);
```

`loadPower` already calls `initPower()` first, so it's safe to call
unconditionally on every restore.

---

## 8. E-key interact wiring (`game.js`)

The E-key dispatch lives in `updatePlayer` around lines 731-751. The
current chain is: chest → workbench → survivor. Add generator **before
survivor** (chest/workbench take priority because they're more frequent
and more spatial-overlap-likely). Patch the `else if` chain:

```javascript
  if (input.keys.has('e') && p.openCd <= 0) {
    const chest = findChestNear(p.x, p.y, CHEST_PROMPT_RADIUS);
    if (chest) {
      openChest(chest);
      p.openCd = 0.4;
    } else {
      const wb = findWorkbenchNear(p.x, p.y, WORKBENCH_PROMPT_RADIUS);
      if (wb && typeof openCrafting === 'function') {
        openCrafting(wb);
        p.openCd = 0.4;
      } else if (typeof findGeneratorNear === 'function' &&
                 findGeneratorNear(p, 60)) {        // NEW
        tryRefuelGenerator(findGeneratorNear(p, 60), p);
        p.openCd = 0.4;
      } else if (typeof findSurvivorNear === 'function') {
        const sv = findSurvivorNear(p.x, p.y, SURVIVOR_RECRUIT_RADIUS);
        if (sv) {
          recruitSurvivor(sv);
          p.openCd = 0.4;
        }
      }
    }
  }
```

(Micro-optimization optional: cache the `findGeneratorNear(p, 60)` result
in a local instead of calling it twice — current code keeps the diff
minimal.)

---

## 9. Damage hook (zombie melee + bullets)

Generators are destructible. They need to participate in the same melee
and bullet-collision passes that walls / barrels already do. There are
three spots to extend:

### 9a. Player bullets (game.js, in `updateBullets`)

Look for the loop that iterates `Game.walls` for bullet-vs-wall hits
(around line 1212). Right after the walls loop add a generators loop:

```javascript
    if (Game.generators) {
      for (let j = 0; j < Game.generators.length; j++) {
        const g = Game.generators[j];
        if (b.x > g.x && b.x < g.x + g.w && b.y > g.y && b.y < g.y + g.h) {
          damageGenerator(g, b.damage || 10);
          Game.bullets.splice(i, 1);
          hit = true;
          break;
        }
      }
      if (hit) continue;
    }
```

### 9b. Explosions (game.js, in the explosion damage pass)

Find the wall-damage loop inside the explosion handler (around line 1374
where it iterates `Game.walls`). Mirror that loop for generators using the
same radius / falloff logic:

```javascript
    if (Game.generators) {
      for (let j = Game.generators.length - 1; j >= 0; j--) {
        const g = Game.generators[j];
        const gx = g.x + g.w * 0.5, gy = g.y + g.h * 0.5;
        const dx = gx - ex.x, dy = gy - ex.y;
        const d = Math.hypot(dx, dy);
        if (d < ex.maxR) {
          const dmg = Math.round(80 * (1 - d / ex.maxR));
          damageGenerator(g, dmg);
        }
      }
    }
```

### 9c. Zombie melee (game.js, in `updateZombies`)

Around line 2040 a zombie iterates `Game.walls` for chew damage when its
path to the player is blocked. Right after that block add an equivalent
for generators (use the same chew damage value the wall code uses):

```javascript
    if (Game.generators) {
      for (let k = 0; k < Game.generators.length; k++) {
        const g = Game.generators[k];
        if (z.x < g.x + g.w && z.x + z.r * 2 > g.x &&
            z.y < g.y + g.h && z.y + z.r * 2 > g.y) {
          damageGenerator(g, (z.damage || 6) * dt);
        }
      }
    }
```

### 9d. Zombie pathing (NAV / collision)

Generators are static obstacles, so squad and zombies should collide with
them the same way they do walls. The simplest pass — without rewriting
NAV — is to resolve circle-vs-rect in the squad/zombie tick. In
`updateSquad` (`squad.js`, line 280) the loop is:

```javascript
    for (const w of Game.walls) resolveCircleRect(s, w);
```

Add immediately after:

```javascript
    if (Game.generators) for (const g of Game.generators) resolveCircleRect(s, g);
```

Do the same wherever zombies resolve against walls (search for
`Game.walls` in the zombie tick).

If NAV needs to consider generators for pathfinding (rather than the
player using them as accidental walls), the cleanest fix is to mark NAV
dirty whenever `placeGenerator` succeeds or `damageGenerator` kills one.
You can do that without modifying `power.js` by wrapping the calls in
`game.js`:

```javascript
  const g = placeGenerator(ax, ay);
  if (g) NAV.markDirty();
```

…but the simple collide-without-pathing approach above is usually enough
for the current AI.

---

## 10. Quick test plan

1. New run — `Game.generators` should be an empty array after `resetRun()`.
2. Craft a generator kit (`scrap × 30`), then right-click it in the
   inventory. A generator should appear 40px in front of the player and
   the kit should be consumed.
3. Walk on top of the generator and press E with no scrap / fuel can. The
   notice should say "No fuel · need scrap or fuel can".
4. Pick up some scrap, press E. Fuel should bump 5 at a time; the
   generator should flip ON; the yellow vents and aura should appear.
5. Wait ~16 minutes of real time (or temporarily bump
   `GENERATOR_FUEL_PER_SEC` to 10 in `power.js` for testing). Fuel hits
   zero and the generator auto-shuts-off.
6. Shoot the generator with the pistol — HP bar appears; sustained fire
   destroys it and drops a scrap pickup.
7. Save / reload — the generator (or its absence) should round-trip
   exactly, including current fuel and on/off state.

Future Garage / Radio / Cameras integrations consume this purely by
calling `isPowered(stationX, stationY)`. No other coupling is required.
