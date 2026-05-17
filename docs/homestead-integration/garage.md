# garage.js — Integration Spec (B·03)

`garage.js` is self-contained. It depends on the existing `vehicles.js`
(reads `Game.vehicles`, `VEHICLE_KINDS`) and `power.js` (calls
`isPowered(x, y)`), plus the usual globals (`Game`, `Audio`, `setNotice`,
`clamp`, `World`, `WORLD_W`, `WORLD_H`, `WALL_SIZE`, `WALL_HP`, `VIEW_W`,
`NAV`). It does NOT modify any other file on its own — every change below
is the integrator's responsibility.

Module exports:

- `initGarages()` — clear state for a new run
- `updateGarages(dt)` — 5-second cadence refuel/repair tick
- `drawGarages(ctx, camX, camY)` — single-call render (floor + roof)
- `drawGaragesFloor(ctx, camX, camY)` — floor only, draw UNDER walls
- `drawGaragesRoof(ctx, camX, camY)` — roof only, draw ABOVE world
- `placeGarageKit(x, y, player)` — spawn walls + roof + record
- `vehicleInGarage(vehicle)` — returns the garage rect or null
- `garageIsPowered(garage)` — wraps `isPowered(garage.cx, garage.cy)`
- `roofAlphaForPlayer(garage, player)` — 0.85 outside / 0.15 inside
- `saveGarages()` / `loadGarages(data)` — persistence

---

## 1. Script tag (`index.html`)

`garage.js` must load **after** `vehicles.js`, `power.js`, and `walls.js`
(it pushes records into `Game.walls`), and **before** `game.js`:

```html
<script src="items.js"></script>
<script src="perks.js"></script>
<script src="squad.js"></script>
<script src="vehicles.js"></script>
<script src="power.js"></script>
<script src="walls.js"></script>
<script src="garage.js"></script>   <!-- NEW -->
<script src="game.js"></script>
```

---

## 2. New items (`items.js`)

Add inside the `ITEMS = { … }` literal:

```javascript
roof_panel: {
  id: 'roof_panel', name: 'Roof Panel', category: 'material',
  stackMax: 4, tint: '#3a3e44',
  desc: 'Corrugated steel sheet. Used as the roof of a garage.',
},
garage_kit: {
  id: 'garage_kit', name: 'Garage Kit', category: 'tool',
  stackMax: 1, tint: '#5e636a',
  desc: 'A boxed 4×3 garage with roof. Right-click to deploy in front of you.',
  use(p) {
    const ax = p.x + Math.cos(p.angle) * 60;
    const ay = p.y + Math.sin(p.angle) * 60;
    const g = (typeof placeGarageKit === 'function') ? placeGarageKit(ax, ay, p) : null;
    return !!g;   // useItem consumes one slot on true
  },
},
```

Optional: add icon shapes inside `drawItemIconShape` for the two new ids
(falls back to gray `?` if omitted).

---

## 3. Crafting recipes (`items.js`)

Append to the `CRAFT_RECIPES` array. We list both shapes — the cheap pure-scrap
fallback and the roof_panel variant (cheaper scrap, but needs the part):

```javascript
{
  id: 'garage_kit_simple',
  label: 'Garage Kit (scrap)',
  desc: '4×3 garage. Refuels parked vehicles when wired to a generator.',
  cost: [{ id: 'scrap', n: 24 }],
  apply(p) {
    const left = addItem(p.inventory, 'garage_kit', 1);
    if (left === 0) setNotice('+1 garage kit', 1.2);
    else setNotice('Inventory full — kit lost', 1.5);
  },
},
{
  id: 'garage_kit_paneled',
  label: 'Garage Kit (paneled)',
  desc: '4×3 garage with a salvaged roof panel. Cheaper scrap cost.',
  cost: [{ id: 'scrap', n: 18 }, { id: 'roof_panel', n: 1 }],
  apply(p) {
    const left = addItem(p.inventory, 'garage_kit', 1);
    if (left === 0) setNotice('+1 garage kit', 1.2);
    else setNotice('Inventory full — kit lost', 1.5);
  },
},
```

Either recipe yields the same `garage_kit` item; pick whichever the player
has the materials for.

---

## 4. `resetRun()` (`game.js`)

Inside `resetRun(levelIndex)`, **after** `initVehicles()` / `initPower()`
and **before** the `Game.player = { … }` block, add:

```javascript
  // Garage zones — empty on every run. Walls live in Game.walls; this
  // tracks the 4×3 conceptual zone for the refuel/repair tick.
  if (typeof initGarages === 'function') initGarages();
```

---

## 5. Main tick — `updateGarages(dt)` (`game.js`)

Call **after** `updatePower(dt)` (so the powered check sees the up-to-date
generator state this frame) and **after** `updateVehicles(dt)` (so the
vehicle's `x`/`y` are current when we ask `vehicleInGarage(v)`):

```javascript
  updatePower(dt);
  updateVehicles(dt);
  if (typeof updateGarages === 'function') updateGarages(dt);   // NEW
```

The tick uses a per-garage accumulator: each garage fires its refuel/repair
pass every 5 seconds independently. While powered, parked vehicles inside
receive +5 fuel and +2 hp per tick (capped at the vehicle's `maxFuel` and
`maxHp`). Broken vehicles automatically clear their `broken` flag once HP
crosses 50% — matching the `repairVehicle()` threshold so the two repair
pathways stay consistent.

---

## 6. Render dispatch (`render.js`) — TWO calls

The garage renders as two passes because the roof is a fade-on-enter overlay
that has to sit ABOVE the player/vehicles, while the floor has to sit UNDER
the walls so the concrete tile replaces grass inside the footprint.

### 6a. Floor pass — UNDER walls

In `render()`, **before** the player-placed walls block:

```javascript
    // garage floors (concrete) — must sit under walls + vehicles    // NEW
    if (typeof drawGaragesFloor === 'function') {
      drawGaragesFloor(ctx, Game.camera.x, Game.camera.y);
    }

    // player-placed walls
    for (const w of Game.walls) if (rectInView(w)) ZSprites.drawWall(ctx, w);
```

### 6b. Roof pass — ABOVE world

After the player + zombies + vehicles draw, **before** the HUD pass:

```javascript
    // …existing zombie / vehicle / player draws…

    // garage roofs — overlay above world, fades when player steps inside    // NEW
    if (typeof drawGaragesRoof === 'function') {
      drawGaragesRoof(ctx, Game.camera.x, Game.camera.y);
    }

    // …HUD pass starts here…
```

The single-call `drawGarages(ctx, camX, camY)` shim is available if you
prefer one entry point; it calls both passes in sequence, but the roof will
sit too low in the stack (under the player). Prefer the split.

---

## 7. Save / Load wiring (`persistence.js`)

In `saveGame()`, append to the `data` object:

```javascript
    garages: (typeof saveGarages === 'function') ? saveGarages() : null,
```

In the saved-game restore path (`restoreFromSave(d)`), add **after**
`loadVehicles(d.vehicles)` and `loadPower(d.power)`:

```javascript
  if (d.garages && typeof loadGarages === 'function') loadGarages(d.garages);
```

`loadGarages` calls `initGarages()` internally, so it's safe to call even
on saves predating this feature. Note that the perimeter walls saved by
the garage are part of `Game.walls` and round-trip through `saveWalls()` /
`loadWalls()` already — `loadGarages` only restores the zone metadata.

Bump `SAVE_VERSION` in `constants.js` by +1 so older saves are ignored.

---

## 8. Prefab system overlap (A·04 — `prefabs.js`)

`garage_kit` is conceptually a prefab: a fixed-shape cluster of walls
placed in one click. If the prefab system from A·04 is already loaded,
register the garage as a prefab there too so the player can place it from
the workbench prefab UI alongside `guard_shack`, `kennel`, etc. This is
optional — the kit-item path in §2 works standalone.

Suggested registration block, added to the `PREFABS = { … }` object in
`prefabs.js` (do this in a follow-up, not in `garage.js`):

```javascript
garage: {
  id: 'garage', name: 'Garage', scrapCost: 24,
  desc: '4×3 vehicle bay with roof. Parked cars auto-refuel when powered.',
  // Custom-handled in spawnPrefabTiles so the placement also pushes a
  // Game.garages record. Mark the tile as 'garage' so the dispatcher
  // routes through placeGarageKit() instead of dumping walls one-by-one.
  tiles: [{ dx: 0, dy: 0, kind: 'garage' }],
},
```

Then inside `spawnPrefabTiles`, add a `kind === 'garage'` branch that
calls `placeGarageKit(x + bb.w/2, y + bb.h/2, Game.player)`. Skip this
hook entirely if A·04 isn't shipped yet — the standalone path covers the
core feature.

---

## API exposed by `garage.js`

- `initGarages()` — clear Game.garages
- `updateGarages(dt)` — refuel/repair tick
- `placeGarageKit(x, y, player)` — spawn walls + roof + record
- `drawGarages(ctx, camX, camY)` — combined render
- `drawGaragesFloor(ctx, camX, camY)` — floor only (under walls)
- `drawGaragesRoof(ctx, camX, camY)` — roof only (above world)
- `vehicleInGarage(vehicle)` — zone lookup
- `garageIsPowered(garage)` — wraps `isPowered`
- `roofAlphaForPlayer(garage, player)` — render helper
- `saveGarages()` / `loadGarages(data)` — persistence

---

## Quick test checklist

1. Give yourself the parts: `addItem(Game.player.inventory, 'garage_kit', 1); addItem(Game.player.inventory, 'generator_kit', 1); addItem(Game.player.inventory, 'fuel_can', 2)`.
2. Right-click `garage_kit` in your inventory. A 4×3 wall ring with an open
   south side appears in front of the player; concrete floor visible inside.
3. Right-click `generator_kit` somewhere within ~250px of the garage center.
   Refuel it (E) so its aura covers the garage.
4. `spawnVehicle('sedan', Game.player.x + 30, Game.player.y, 0)`. Drive it
   into the garage through the open south side; exit (F).
5. Walk inside — the roof fades to 0.15 alpha; walk out — it returns to 0.85.
6. Drain the sedan: `Game.vehicles[0].fuel = 5; Game.vehicles[0].hp = 50`.
7. Wait ~5 seconds. Both numbers should tick up; over a minute the sedan
   should be fully topped off.
