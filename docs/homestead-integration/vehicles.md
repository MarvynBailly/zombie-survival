# vehicles.js — Integration Spec

This is the F3 foundation for the Garage (B·03) and RV (D·04) features.
The module ships `vehicles.js` and depends only on globals already defined
in `world.js`, `items.js`, `game.js`. It does NOT modify any existing file
on its own — every change below is the integrator's responsibility.

## 1. Constants (`constants.js`)

No new constants required in `constants.js`. The module-local constants
(`VEHICLE_KINDS`, `VEHICLE_INTERACT_RADIUS`, `VEHICLE_FUEL_DRAIN_PER_SEC`,
`VEHICLE_REPAIR_PER_PART`, `VEHICLE_FIRE_DPS`) live inside `vehicles.js`.

If you want a global to suppress player WASD while driving, you may add
this comment for clarity (no code change needed — the function exists):

```js
// `isPlayerDriving()` from vehicles.js — true while the player is in a vehicle.
```

## 2. Items (`items.js`)

Add the following entries to the `ITEMS` object. **CONFLICT NOTE**: if
another agent (e.g. `power.js`) also declares `fuel_can`, drop our copy
and keep theirs — the schema below matches what `repairVehicle` /
`refuelVehicle` expect, but the `id`, `category`, and `stackMax` are the
only fields the vehicle module actually reads.

```js
fuel_can: {
  id: 'fuel_can', name: 'Fuel Can', category: 'consumable',
  stackMax: 4, tint: '#d24b35',
  desc: 'Gasoline. Right-click adjacent to a vehicle to refill its tank.',
  use(p) {
    if (typeof findVehicleNear !== 'function') return false;
    const v = findVehicleNear(p, 50);
    if (!v) { setNotice('No vehicle nearby', 1.2); return false; }
    if (v.fuel >= v.maxFuel) { setNotice('Tank is full', 1.2); return false; }
    v.fuel = Math.min(v.maxFuel, v.fuel + 40);
    setNotice('+40 fuel', 1.2);
    return true;
  },
},
fuel_pump: {
  id: 'fuel_pump', name: 'Fuel Pump', category: 'material',
  stackMax: 4, tint: '#7a7e88',
  desc: 'Salvaged car part. Used at the garage to repair vehicles.',
},
car_battery: {
  id: 'car_battery', name: 'Car Battery', category: 'material',
  stackMax: 4, tint: '#3a3530',
  desc: 'Heavy lead-acid battery. Vehicle repair material.',
},
gear_set: {
  id: 'gear_set', name: 'Gear Set', category: 'material',
  stackMax: 4, tint: '#9aa0a8',
  desc: 'Greasy clutch of gears. Vehicle repair material.',
},
```

Optional — add icon shapes inside `drawItemIconShape` for the four new ids.
Falls back to the gray `?` if omitted, so this is non-blocking.

## 3. `index.html` — script tag

Insert **after** `squad.js` and **before** `game.js`:

```html
<script src="squad.js"></script>
<script src="vehicles.js"></script>   <!-- NEW -->
<script src="game.js"></script>
```

The module references `setNotice`, `Audio`, `rand`, `clamp`, `inObstacle`,
`resolveCircleRect`, `WORLD_W`, `WORLD_H`, `VIEW_W`, `TILE_SIZE`, `Game`,
`World`, `input`, `ITEMS`, `hasItem`, `removeItem` — all globals defined
before `game.js`, so this ordering is safe.

## 4. `resetRun()` call (`game.js`)

Inside `resetRun(levelIndex)`, **after** `Game.squad = []; Game.worldSurvivors = [];`
and **before** the `Game.player = { ... }` block, add:

```js
  // Drivable vehicles — empty on every run. World gen seeds wrecks later.
  if (typeof initVehicles === 'function') initVehicles();
```

Then, **inside** the `Game.player = { … }` object literal, add the new
field at the bottom (just before the closing `}`):

```js
    drivingVehicleId: null,
```

## 5. Main tick — `updateVehicles(dt)` placement (`game.js`)

In the `tick(dt)` function, insert **after** `updateSquad(dt);` and
**before** `updateBullets(dt);`:

```js
  updateSquad(dt);
  if (typeof updateVehicles === 'function') updateVehicles(dt);   // NEW
  updateBullets(dt);
```

Why here: vehicles need to read the latest zombie positions (for ramming)
and latest squad positions, but must update **before** bullets/rockets so
projectile owners aren't fighting a 1-frame-stale vehicle pose.

## 6. Render dispatch — `drawVehicles` placement (`render.js`)

In `render()`, vehicles draw **after** chests + walls (so they sit on top
of the road grid) but **before** zombies (so a zombie clambering on the
hood draws above the chassis). Insert right after the `// player-placed
walls` block, before the ghost-wall preview:

```js
    // player-placed walls
    for (const w of Game.walls) if (rectInView(w)) ZSprites.drawWall(ctx, w);

    // drivable vehicles                                          // NEW
    if (typeof drawVehicles === 'function') {
      drawVehicles(ctx, Game.camera.x, Game.camera.y);
    }

    // ghost preview of next wall placement (only while the wall slot is active)
```

## 7. Key bindings — F to enter/exit; WASD routed (`game.js`)

### 7a. Add F to the preventDefault list (cosmetic — keeps the browser
from triggering "find" in some setups). In the keydown handler at the
top of `game.js`:

```js
  if (['w','a','s','d','r','e','i','p','h','f',' ','escape',   // +'f'
       '1','2','3','4','5','6','7','8','9','0','-','='].includes(e.key.toLowerCase())) {
    e.preventDefault();
  }
```

### 7b. F handler — enter/exit a nearby vehicle. Add to the player
keyboard-action block (right after the `H` HOLD toggle at the end of
`updatePlayerKeys` / wherever the `E` / `H` handlers live, ~line 759):

```js
  // F: enter/exit drivable vehicle. Edge-triggered like H.
  if (input.keys.has('f')) {
    if (!p._fHeld) {
      p._fHeld = true;
      if (typeof isPlayerDriving === 'function' && isPlayerDriving()) {
        exitVehicle(p);
      } else if (typeof findVehicleNear === 'function') {
        const v = findVehicleNear(p, VEHICLE_INTERACT_RADIUS);
        if (v) {
          if (v.broken) repairVehicle(v, p);  // R falls through; F also kicks repair
          else enterVehicle(p, v);
        }
      }
    }
  } else { p._fHeld = false; }
```

Alternative split: bind F only to enter/exit and bind R for repair (so the
"R · REPAIR" prompt drawn over wrecks matches the keymap). If you go that
route, also wire R as an edge-triggered handler that calls `repairVehicle`.

### 7c. WASD routing — see Section 8 below. WASD is *not* re-read here;
the gate inside `updatePlayer` simply early-returns so the player's own
WASD code never fires while driving. The vehicle's `updateVehicles`
reads `input.keys` itself.

## 8. Player update gate — skip WASD + pull pose from vehicle (`game.js`)

At the very top of `updatePlayer(dt)`, immediately after the `if (p.dead) return;`
line (around line 520), add:

```js
  // While driving, the vehicle owns position + heading. Skip the player's
  // own WASD/movement/collision; pose is synced inside updateVehicles().
  if (typeof isPlayerDriving === 'function' && isPlayerDriving()) {
    const v = getDrivenVehicle();
    if (v) { p.x = v.x; p.y = v.y; p.angle = v.angle; }
    // Camera follow still needs to happen so the view tracks the vehicle.
    const targetCx = clamp(p.x - VIEW_W / 2, 0, WORLD_W - VIEW_W);
    const targetCy = clamp(p.y - VIEW_H / 2, 0, WORLD_H - VIEW_H);
    Game.camera.x = lerp(Game.camera.x, targetCx, 0.15);
    Game.camera.y = lerp(Game.camera.y, targetCy, 0.15);
    if (p.iframe > 0) p.iframe -= dt;
    return;
  }
```

This intentionally suppresses aim/firing while driving (you can't shoot
out of a vehicle in F3; that's a follow-up). If you want aiming preserved,
also copy the `// aim` block (`p.angle = Math.atan2(...)` plus the
`input.wx`/`input.wy` lines) inside the gate before the early return —
but note this overrides the synced `p.angle = v.angle` above.

## 9. Player draw gate — low-alpha rider (`render.js`)

In the player-drawing block (around line 228), wrap the `ZSprites.drawPlayer`
call so the rider draws at low alpha while driving:

```js
    // player
    if (Game.player && !Game.player.dead) {
      const p = Game.player;
      const driving = (typeof isPlayerDriving === 'function' && isPlayerDriving());
      if (driving) ctx.globalAlpha = 0.35;
      ZSprites.drawPlayer(ctx, p.x, p.y, p.angle, {
        weapon: p.weapon,
        moving: !!(p.vx || p.vy),
        walkPhase: p.walkPhase || 0,
        iframe: p.iframe || 0,
        muzzleFlash: p.muzzleFlash || 0,
      });
      if (driving) ctx.globalAlpha = 1;
      // …existing railgun charge bar block stays unchanged.
```

Note that `vehicles.js` already draws its own low-alpha driver decal
inside the vehicle, so the player silhouette and the decal stack. If you
prefer just the decal, skip the `drawPlayer` call entirely when driving:
`if (!driving) ZSprites.drawPlayer(...)`.

## 10. Save / Load wiring (`persistence.js`)

In `saveGame()`, append to the `data` object:

```js
    vehicles: (typeof saveVehicles === 'function') ? saveVehicles() : null,
```

In the saved-game restore path (`restoreFromSave(d)` in `game.js`, around
line 270 — just before the camera+NAV refresh at the end), add:

```js
  if (d.vehicles && typeof loadVehicles === 'function') loadVehicles(d.vehicles);
```

`loadVehicles` calls `initVehicles()` internally, so it's safe to call even
if the save predates this feature (it will leave `Game.vehicles` empty).

Bump `SAVE_VERSION` in `constants.js` by +1 so older saves are ignored.

## 11. World-gen hook — `spawnWreckRV` in highland biome

**Deferred — TODO.** The intended hook is in the highland-biome chunk
generator inside `world.js`: when a chunk's terrain is `highland` and an
RNG roll < ~0.04 succeeds, place a wrecked RV at a flat tile within the
chunk and call `spawnWreckRV(x, y, rng() * Math.PI * 2)`. The wreck gives
the player a goal (gather parts → repair → drive away with the rolling
inventory).

A reasonable placement pattern, copied from how chests are seeded:

```js
// inside chunkGen(...), after obstacles + chests, gated on region:
if (region && region.name === 'Highlands' && rng() < 0.04) {
  // Find a walkable spot inside the chunk.
  for (let tries = 0; tries < 12; tries++) {
    const wx = baseX + 80 + rng() * (CHUNK_SIZE - 160);
    const wy = baseY + 80 + rng() * (CHUNK_SIZE - 160);
    if (!inObstacle(wx, wy, 50)) {
      // Don't actually spawn during chunk-gen — chunk-gen runs before
      // Game.vehicles exists. Push onto a per-chunk pending list and let
      // `activateChunkIfNeeded` flush it. Or just call spawnWreckRV
      // directly if the call site post-dates resetRun().
      chunk.pendingWreck = { x: wx, y: wy, angle: rng() * Math.PI * 2 };
      break;
    }
  }
}
```

Then in `activateChunkIfNeeded` (already in `game.js`):

```js
if (chunk.pendingWreck && typeof spawnWreckRV === 'function') {
  const w = chunk.pendingWreck; chunk.pendingWreck = null;
  spawnWreckRV(w.x, w.y, w.angle);
}
```

Defer this to whoever owns world-gen integration; the rest of the module
works end-to-end without it.

## 12. Zombie damage targeting vehicles (`game.js`)

In the zombie-update loop, the existing chewing block (`if (z.blocked)`)
already chews walls + breakable obstacles. Add a third pass for vehicles
**inside** that block, after the wall chew and before the obstacle chew:

```js
    if (z.blocked) {
      // walls (existing) …
      // ----- vehicles (NEW) -----
      if (Game.vehicles && typeof damageVehicle === 'function') {
        for (const v of Game.vehicles) {
          if (v.broken) continue;
          const dx = v.x - z.x, dy = v.y - z.y;
          const colR = (v.kind === 'rv' ? 40 : 28); // matches drawn footprint
          if (dx * dx + dy * dy < (z.r + colR) * (z.r + colR)) {
            damageVehicle(v, z.damage * 2.0 * dt);
            // Push the zombie back so it doesn't tunnel through.
            const d = Math.hypot(dx, dy) || 1;
            z.x -= (dx / d) * 1.5;
            z.y -= (dy / d) * 1.5;
          }
        }
      }
      // obstacles (existing) …
    }
```

You may also want zombies to incidentally damage vehicles even when not
"blocked" (just on bump contact). If so, lift the block above `if (z.blocked)`
into the main per-zombie loop. The flammable-RV branch in `damageVehicle`
will start a smoke fire on a 25% chance per hit.

## API surface exposed by `vehicles.js`

- `initVehicles()` — clear state
- `updateVehicles(dt)` — main tick
- `drawVehicles(ctx, camX, camY)` — render
- `spawnVehicle(kind, x, y, angle=0)` — entity factory
- `spawnWreckRV(x, y, angle=0)` — pre-broken RV for world-gen
- `findVehicleNear(player, radius=50)` — F-key lookup
- `enterVehicle(player, vehicle)` / `exitVehicle(player)` — toggle driving
- `repairVehicle(vehicle, player)` — consume parts, restore HP
- `damageVehicle(v, dmg)` — take damage; ignites flammable RVs
- `isPlayerDriving()` — convenience predicate
- `getDrivenVehicle()` — returns the active vehicle, or `null`
- `saveVehicles()` / `loadVehicles(data)` — persistence
- `VEHICLE_KINDS`, `VEHICLE_INTERACT_RADIUS` — exported constants

## Quick test checklist

1. Spawn a sedan near the player from the dev console: `spawnVehicle('sedan', Game.player.x + 80, Game.player.y, 0)`.
2. Walk up; press F. You should see "Driving SEDAN · F to exit".
3. WASD drives the car; A/D barely turns at standstill, more crisply at speed.
4. Mash into a tree — vehicle stops, HP bar appears, dust particles fly.
5. F again — you pop out beside the car.
6. `spawnWreckRV(Game.player.x + 80, Game.player.y, 0)` then F — the wreck
   should ignore F (or auto-trigger `repairVehicle`, depending on your
   choice in §7b). Give yourself parts with `addItem(Game.player.inventory, 'fuel_pump', 3)` etc., and confirm HP climbs.
