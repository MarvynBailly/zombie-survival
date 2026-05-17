# Walls module integration (A·02 tier-up + A·03 blueprints + D·02 decay)

`walls.js` extends the existing player-placed wall system with three brainstorm
cards in one module:

* **A·02 TIER UP** — walls have a `material` (`wood`/`brick`/`steel`) with
  HP caps 200/600/1500. Press U near a wall (1s hold) to spend scrap and
  upgrade. Steel walls reflect bullets.
* **A·03 BLUEPRINTS** — press B to capture a 16×16-tile box of walls to a
  meta-persisted blueprint; press B again to paste a ghost overlay and
  click each ghost tile to spend 1 scrap and build the wall.
* **D·02 DECAY** — every in-game day every wall loses 1–3% condition
  (×2 in rain). At condition < 50 it draws cracked; at condition ≤ 0 it
  becomes "rubble" (HP=1, still blocks). Hold R to repair (1 scrap = +20).

The module never modifies existing files. It exposes hooks the integrator
wires in. Existing walls get the new fields via `initWallSystem()` migration.

---

## 1. Constants (constants.js, optional hoist)

`walls.js` declares its own tunables at the top of the file. If you want
them visible globally for tuning, copy these blocks into `constants.js`
and remove the local `const` declarations from `walls.js`:

```js
// Wall tier system (A·02)
const WALL_TIERS = {
  wood:  { maxHp: 200,  color: '#8a5a2a', shade: '#5a3a1a', plank: '#a06a3a' },
  brick: { maxHp: 600,  color: '#b34d2a', shade: '#7a321a', plank: '#d36b40' },
  steel: { maxHp: 1500, color: '#5e6a78', shade: '#3a414c', plank: '#8a98a8' },
};
const WALL_UPGRADE_COST = { brick: 5, steel: 10 };
const WALL_UPGRADE_HOLD = 1.0;     // seconds

// Wall decay (D·02)
const WALL_DECAY_MIN = 1;
const WALL_DECAY_MAX = 3;
const WALL_CRACK_THRESHOLD = 50;
const WALL_REPAIR_TICK = 0.5;
const WALL_REPAIR_PER_SCRAP = 20;
const WALL_INTERACT_R = 56;

// Blueprints (A·03)
const BLUEPRINT_META_KEY = 'zombie-survival:blueprints';
const BLUEPRINT_CAP = 6;
const BLUEPRINT_TILE_SPAN = 16;
```

If you keep them inside `walls.js`, no edits are needed — the rest of the
integration just calls the exported functions and never touches the table
directly.

---

## 2. Script tag (index.html)

Add after `squad.js`, before `game.js`:

```html
<script src="perks.js"></script>
<script src="squad.js"></script>
<script src="walls.js"></script>      <!-- add this line -->
<script src="game.js"></script>
<script src="render.js"></script>
```

`walls.js` needs `WALL_SIZE`, `WORLD_W`, `WORLD_H`, `rand`, `hasItem`,
`removeItem`, `setNotice`, `Audio`, `Game`, and (optionally)
`weatherDecayMult`. All exist by the time it loads.

---

## 3. resetRun() — game.js (~line 142, after `Game.walls = [];`)

The migration helper must run AFTER walls are set up but BEFORE anything ticks:

```js
Game.walls = [];
// ... rest of resetRun ...
Game.elapsed = 0;
initWallSystem();           // <- add (after Game.walls = [] is in scope)
Game.scoreSubmitted = false;
```

It's safe to call with an empty walls array; the function initializes the
`Game.blueprints`, `Game.blueprintMode`, `Game.wallUpgrade`, `Game.wallRepair`
slots regardless.

## 4. restoreFromSave() — game.js (~line 244, after `Game.walls = (d.walls || ...)`)

```js
Game.walls = (d.walls || []).map(w => ({ ...w }));
// ... barrels etc ...
loadWalls(d.wallsExt || null);   // <- add (per-run extension fields)
initWallSystem();                // <- add (also fills blueprints from meta)
```

`initWallSystem` after `loadWalls` is safe — `loadWalls` already calls
`migrateWall` per slot, and `initWallSystem`'s migration is idempotent
(only fills missing fields).

---

## 5. Main tick — game.js, function `tick(dt)`

Call once per tick, next to `updateDayCycle(dt)` and `updateWeather(dt)`:

```js
updateDayCycle(dt);
updateWeather(dt);
updateWallSystem(dt);       // <- add
```

This drains the upgrade-hold timer and the repair-tick accumulator.

---

## 6. Daily decay hook — game.js, function `advanceDayPhase`

Hook on the dawn→day rollover (which is where `Game.time.day += 1` runs):

```js
} else if (newPhase === 'day') {
  Game.time.day += 1;
  setBanner(`DAY ${Game.time.day}`, 2);
  Audio.sfx.wave();
  grantPerkPoint(1);
  onWallDayRollover();      // <- add (rolls decay across every wall)
}
```

`weatherDecayMult()` is read internally, so this single line carries the
rain × 2 multiplier.

---

## 7. Wall draw hook — render.js (~line 177)

The stock wall draw is:

```js
for (const w of Game.walls) if (rectInView(w)) ZSprites.drawWall(ctx, w);
```

Wrap it so `drawWallOverlay` gets first crack and short-circuits when it
fully handles the wall (brick/steel/cracked/rubble):

```js
for (const w of Game.walls) {
  if (!rectInView(w)) continue;
  const sx = w.x - Game.camera.x;
  const sy = w.y - Game.camera.y;
  if (drawWallOverlay(ctx, w, sx, sy, w)) continue;   // <- add
  ZSprites.drawWall(ctx, w);
}
```

`drawWallOverlay` returns `true` for any non-wood wall, rubble, or cracked
wood — so the only case the stock `drawWall` still runs is intact wood,
which is the visual you already ship.

After the wall loop, also draw blueprint UI (still inside the camera-
translated block, so screen coords work out — the helper takes camera as
an arg):

```js
drawBlueprintGhost(ctx, Game.camera.x, Game.camera.y);
drawBlueprintCaptureBox(ctx, Game.camera.x, Game.camera.y);
```

---

## 8. Bullet reflection — game.js (~line 1211)

Replace the existing wall hit block:

```js
for (let j = Game.walls.length - 1; j >= 0; j--) {
  const w = Game.walls[j];
  if (circleRectCollide(b.x, b.y, 1, w.x, w.y, w.w, w.h)) {
    if (wallReflectsBullets(w) && !b._reflected) {
      // Steel: reflect, mark so the bullet can't loop forever, halve damage.
      // Crude axis-aligned reflection — pick the dominant overlap axis.
      const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
      const overlapX = Math.abs(b.x - cx);
      const overlapY = Math.abs(b.y - cy);
      if (overlapX / w.w > overlapY / w.h) b.vx = -b.vx;
      else b.vy = -b.vy;
      b._reflected = true;
      b.damage *= 0.6;
      spawnSpark(b.x, b.y);
      continue outer;
    }
    w.hp -= b.damage;
    spawnSpark(b.x, b.y);
    Game.bullets.splice(i, 1);
    if (w.hp <= 0) destroyWall(j, 'bullet');
    continue outer;
  }
}
```

`_reflected` prevents pinball between two steel walls; the second hit takes
damage normally. Tune `* 0.6` to taste.

---

## 9. U-key — game.js, input handling

Wherever your key handler lives (around the wall placement / Space-key
branch in `updatePlayer`):

```js
if (input.keys.has('u') || input.keys.has('U')) {
  const near = findWallNear(Game.player.x + Math.cos(Game.player.angle) * 30,
                             Game.player.y + Math.sin(Game.player.angle) * 30,
                             WALL_INTERACT_R);
  if (near) tryUpgradeWall(near, Game.player);
} else if (Game.wallUpgrade) {
  // Key released — abort the hold (timer resets on next press).
  Game.wallUpgrade = null;
}
```

`tryUpgradeWall` checks scrap availability and adjacency itself and posts
a `setNotice` on failure, so the call site stays one-liner.

## 10. R-key — game.js, input handling

```js
if (input.keys.has('r') || input.keys.has('R')) {
  const near = findWallNear(Game.player.x + Math.cos(Game.player.angle) * 30,
                             Game.player.y + Math.sin(Game.player.angle) * 30,
                             WALL_INTERACT_R);
  if (near) tryRepairWall(near, Game.player, dt);
} else if (Game.wallRepair) {
  Game.wallRepair = null;
}
```

Repair accumulates inside `updateWallSystem`, spending 1 scrap per 0.5s
hold per +20 condition. The existing weapon-reload R-key handler should
gate on "no wall in reach" so the keys don't fight; the simplest pattern
is: try repair first, fall through to reload if `findWallNear` returns
null.

## 11. B-key — game.js, input handling

```js
if (input.keys.has('b') && !input._bLatch) {
  toggleBlueprintMode();
  input._bLatch = true;
}
if (!input.keys.has('b')) input._bLatch = false;
```

The latch prevents the mode from flipping every frame the key is held.

## 12. Mouse routing during blueprint mode

In your mousedown / mousemove / mouseup handlers (probably in `ui.js` or
near the top of `game.js`), translate to world coords and route to the
module:

```js
// mousedown
const wx = mouseX + Game.camera.x;
const wy = mouseY + Game.camera.y;
if (Game.blueprintMode === 'capture') {
  if (onBlueprintMouseDown(wx, wy)) return;
}
if (Game.blueprintMode === 'paste') {
  if (buildGhostWall(wx, wy, Game.player)) return;
}

// mousemove
if (Game.blueprintMode === 'capture') onBlueprintMouseMove(wx, wy);

// mouseup
if (Game.blueprintMode === 'capture') onBlueprintMouseUp(wx, wy);
```

The handlers return `true` when they consumed the event so your existing
firing / placement logic short-circuits cleanly.

---

## 13. Save / Load extensions (persistence.js)

The stock wall save only carries `x, y, w, h, hp, maxHp`. To carry the
new fields, add ONE field to the save payload and one line to the load
path.

### saveGame() — persistence.js (~line 56)

```js
walls: Game.walls.map(w => ({ x: w.x, y: w.y, w: w.w, h: w.h, hp: w.hp, maxHp: w.maxHp })),
wallsExt: saveWalls(),     // <- add
```

### loadSavedGame() / restoreFromSave() — game.js

See §4 above — `loadWalls(d.wallsExt || null)` runs right after the walls
array is rebuilt. `loadWalls` is null-safe so old saves without `wallsExt`
fall through to defaults (material='wood', condition=100). Bump
`SAVE_VERSION` from 5 → 6 (or 7 if weather already took 6) to make this
behavior explicit; legacy saves discard cleanly and the migration in
`initWallSystem` covers any lingering wall record.

---

## 14. Migration story (legacy walls)

`initWallSystem()` walks `Game.walls` and:

1. Defaults `material = 'wood'` for any wall without one.
2. Defaults `condition = 100` for any wall without one.
3. Bumps `maxHp` up to the wood-tier cap (200) if the legacy save's value
   was lower; never lowers it (so a perk'd wall keeps its bonus).
4. Clamps `hp` to the new `maxHp` cap.

That means an old save with raw 250-HP walls reads as a wood wall with
maxHp=250 and condition=100 — slightly stronger than the new wood spec
but harmless and not subject to a forced nerf. Players can repair/upgrade
normally; the next decay tick will start chewing at condition as expected.

`initWallSystem` also lazy-loads blueprints from localStorage into
`Game.blueprints` (a separate meta store; not tied to the per-run save).

---

## Exported symbols (for grep)

`initWallSystem`, `updateWallSystem`, `onWallDayRollover`,
`tryUpgradeWall`, `tryRepairWall`, `wallMaxHp`, `wallReflectsBullets`,
`isWallRubble`, `findWallNear`, `drawWallOverlay`,
`captureBlueprint`, `pasteBlueprintGhost`, `buildGhostWall`,
`toggleBlueprintMode`, `onBlueprintMouseDown`, `onBlueprintMouseMove`,
`onBlueprintMouseUp`, `drawBlueprintGhost`, `drawBlueprintCaptureBox`,
`saveBlueprints`, `loadBlueprints`, `saveWalls`, `loadWalls`.
