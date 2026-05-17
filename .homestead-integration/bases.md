# Bases module — integration spec

`bases.js` is a self-contained module. To wire it into the game, apply the
following changes. No existing file was modified by the module itself —
every hook below is additive.

## 1. `constants.js` additions

Append after the existing world/wall constants:

```js
// ---------- Bases / Safehouse claims (bases.js) ----------
const BASE_CAP = 3;
const BASE_EFFECTIVE_RADIUS = 12 * TILE_SIZE; // 480 px — ring for "inside a base"
const BASE_MIN_DISTANCE     = 20 * TILE_SIZE; // 800 px — min separation between claims
```

`bases.js` will fall back to these literal values if `constants.js` is not
updated, but the canonical home is here so other modules (raid, RV) can
read them without depending on `bases.js`.

## 2. `items.js` additions

Add a `base_flag` entry to the `ITEMS` registry:

```js
base_flag: {
  id: 'base_flag', name: 'Base Flag', category: 'tool',
  stackMax: 3, tint: '#d24b35',
  desc: 'Plant on a clear tile to claim a safehouse (max 3). Used immediately on use.',
  use(p) {
    // Defer to bases.js. Returns the new base, or false on failure (notice surfaced).
    const res = placeBaseFlagItem(p);
    // useItem() in items.js consumes the slot when use() returns true. We
    // already removed the flag inside placeBaseFlagItem on success, so
    // return false here to prevent a double-decrement.
    return false;
  },
},
```

Note the `use()` returns `false` so `useItem()` does not decrement again —
`placeBaseFlagItem` handles consumption itself only on a successful claim.

In `resetRun()` (game.js, around line 177 right after `inventory: makeInventory()`):

```js
// Starter flag — players get one safehouse claim for free.
addItem(Game.player.inventory, 'base_flag', 1);
```

Add an icon branch in `drawItemIconShape()` so the inventory thumbnail renders:

```js
} else if (id === 'base_flag') {
  // wooden pole + red pennant
  ctx.fillStyle = '#6b4a26';
  ctx.fillRect(cx - 1, cy - 14, 2, 28);
  ctx.fillStyle = '#caa760';
  ctx.fillRect(cx - 1, cy - 16, 2, 2);
  ctx.fillStyle = '#d24b35';
  ctx.beginPath();
  ctx.moveTo(cx + 1, cy - 14);
  ctx.lineTo(cx + 15, cy - 9);
  ctx.lineTo(cx + 1, cy - 4);
  ctx.closePath();
  ctx.fill();
}
```

Trader stock: when the trader/F-series shop module lands, expose `base_flag`
for 200 scrap (or similar) per flag, cap 3 stack.

## 3. `index.html` script load order

Insert the `bases.js` tag **after** `squad.js` and **before** `render.js` so
`render.js` can call `drawBaseFlags` / `drawBaseFlagsOnMap`:

```html
<script src="squad.js"></script>
<script src="bases.js"></script>   <!-- NEW -->
<script src="game.js"></script>
<script src="render.js"></script>
```

(Existing order keeps `game.js` between `bases.js` and `render.js`; the
new line goes right after `squad.js`. `bases.js` does not depend on
`game.js` symbols at load time — only at call time.)

## 4. `resetRun()` hook (game.js)

Inside `resetRun()` around line 140 (right after `Game.squad = []; Game.worldSurvivors = [];`):

```js
initBases();
```

## 5. World drawing — `drawBaseFlags` placement (render.js)

In the main `render()` function around line 178 (right after the player-placed
walls loop, before the wall ghost preview):

```js
// player-placed walls
for (const w of Game.walls) if (rectInView(w)) ZSprites.drawWall(ctx, w);

// base flags (claimed safehouses) — drawn in world space, between walls and survivors
drawBaseFlags(ctx, camX, camY);   // NEW

// ghost preview of next wall placement
if (Game.player && !Game.player.dead && Game.player.weapon === 'wall' && ...
```

`camX` / `camY` are the current camera offsets — they're already in scope
in the render function (the wall ghost is drawn in the same transform).

## 6. Map drawing — `drawBaseFlagsOnMap` placement (render.js)

Inside `drawWorldMap()` (render.js line ~626), after the POI markers block
(around line 762, right after `ctx.textAlign = 'left'`) and **before** the
player position block:

```js
// Base flags on the world map.
drawBaseFlagsOnMap(ctx, {
  w2sx, w2sy, scale,
});
```

`w2sx` / `w2sy` / `scale` are local helpers already defined at the top of
`drawWorldMap()`. The module reads them off the passed object.

## 7. Save / load wiring (persistence.js)

In `saveGame()`, add to the data object:

```js
bases: saveBases(),
```

In `restoreFromSave()` (game.js, around line 244 right after
`Game.walls = (d.walls || []).map(...)`), add:

```js
loadBases(d.bases || []);
```

Place this AFTER `Game.walls` is restored so `linkExistingWallsToBase`
inside `loadBases` can find the walls.

Save JSON shape (per base):

```json
{
  "id": "b1",
  "name": "HOMESTEAD",
  "x": 16000,
  "y": 16000,
  "claimedDay": 1,
  "spawnPoint": { "x": 16000, "y": 16000 },
  "type": "fixed",
  "color": "#d24b35",
  "colorSlot": 0,
  "chestIds": [],
  "moatTiles": [],
  "generators": []
}
```

Walls are not duplicated into base entries on disk — wall→base linkage is
rebuilt by `linkExistingWallsToBase()` during `loadBases()`.

## 8. Death / respawn change (game.js)

**TODO for the death handler.** Currently `damagePlayer()` in `game.js`
(around line 1638–1643) sets `p.dead = true` and schedules `showGameOver()`
after 900ms:

```js
if (p.hp <= 0) {
  p.hp = 0;
  p.dead = true;
  Audio.sfx.dead();
  setTimeout(() => { if (Game.mode === 'playing') showGameOver(); }, 900);
}
```

Replace with:

```js
if (p.hp <= 0) {
  p.hp = 0;
  if (Game.bases && Game.bases.length > 0) {
    // Respawn at the nearest base; lose half the run's score, keep inventory.
    const home = nearestBase(p.x, p.y);
    p.x = home.spawnPoint.x;
    p.y = home.spawnPoint.y;
    p.hp = Math.max(1, Math.floor(p.maxHp * 0.5));
    p.iframe = 2.0;
    Game.score = Math.floor(Game.score * 0.5);
    World.ensureActive(p.x, p.y);
    Game.camera.x = p.x - VIEW_W / 2;
    Game.camera.y = p.y - VIEW_H / 2;
    Audio.sfx.dead();
    setBanner(`RESPAWN · ${home.name}`, 2.5);
    return;
  }
  p.dead = true;
  Audio.sfx.dead();
  setTimeout(() => { if (Game.mode === 'playing') showGameOver(); }, 900);
}
```

Exact line: search for `if (p.hp <= 0) {` near line 1638 in `game.js`.
Only one match in the file (in `damagePlayer`). Do **not** implement this
change as part of the bases.js task — it is left as a TODO so the death
flow can be reviewed in one place alongside the eventual penalty design.

## 9. M-key world map UI — base list + fast-travel buttons

The world map (`drawWorldMap()` in render.js, opened with M) already has
a header bar. Add a side panel listing bases. Two options:

**Minimal (recommended for F4b):** render a stacked list in the bottom-left
of `drawWorldMap()` after `drawBaseFlagsOnMap`:

```js
// Base list panel — bottom-left of the map view.
if (Game.bases && Game.bases.length) {
  ctx.save();
  ctx.font = 'bold 11px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  const lx = 22, ly0 = VIEW_H - 22 - Game.bases.length * 28;
  ctx.fillStyle = 'rgba(11,12,14,0.92)';
  ctx.fillRect(lx - 6, ly0 - 18, 260, Game.bases.length * 28 + 22);
  ctx.fillStyle = '#e8e6df';
  ctx.fillText(`BASES (${Game.bases.length}/${BASE_CAP})`, lx, ly0 - 4);
  for (let i = 0; i < Game.bases.length; i++) {
    const b = Game.bases[i];
    const y = ly0 + i * 28;
    ctx.fillStyle = b.color;
    ctx.fillRect(lx, y, 4, 18);
    ctx.fillStyle = '#e8e6df';
    ctx.fillText(b.name, lx + 12, y + 12);
    ctx.fillStyle = '#7a7e88';
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.fillText(`D${b.claimedDay}`, lx + 200, y + 12);
    ctx.font = 'bold 11px "JetBrains Mono", monospace';
    // Day-only fast-travel hint.
    if (Game.time.phase === 'day') {
      ctx.fillStyle = '#5fb6e8';
      ctx.fillText('[' + (i + 1) + '] TRAVEL', lx + 130, y + 12);
    }
  }
  ctx.restore();
}
```

Wire the keys 1/2/3 to `fastTravelTo(Game.bases[i])` while `Game.mapOpen`
is true. Suggested place: the existing keydown handler in `game.js` that
toggles `Game.mapOpen` — add a sibling branch like:

```js
if (Game.mapOpen && Game.mode === 'playing') {
  if (e.key === '1' || e.key === '2' || e.key === '3') {
    const i = +e.key - 1;
    const b = Game.bases[i];
    if (b) {
      try { fastTravelTo(b); Game.mapOpen = false; }
      catch (err) { setNotice(err.message, 2); }
    }
  }
}
```

**Full polish (later):** swap to DOM overlay buttons in `ui.js` so the
fast-travel buttons are hover-able. Not needed for F4b.

## 10. Hooks for D·03 (Raid Night) and D·04 (RV)

**D·03 Raid Night** spawns a horde during the night phase. To make the raid
"head for the player's safehouse" instead of wandering:

```js
// In the raid spawner, pick a target each tick or at horde spawn:
const target = nearestBase(Game.player.x, Game.player.y) || Game.player;
for (const z of raidHorde) {
  z.aiTarget = target;     // raid zombies use this in their steering
}
```

Use `baseAt(z.x, z.y, 80)` to gate "perimeter breach" events (siren, banner)
once raiders enter the effective radius.

**D·04 RV** registers itself as a base with `type: 'rv'`. When the player
parks the RV and powers it down, the RV module should call:

```js
const rv = claimBase(rvX, rvY, 'RV');
if (rv && !rv.error) {
  rv.type = 'rv';
  rv.vehicleId = thisRv.id;   // RV-specific extra fields are fine
}
```

If the player's at the base cap, the RV claim returns `{ error: 'over_cap' }`
and the RV module should prompt the player to delete an existing base via
`removeBase(id)` before re-trying. When the RV is driven away, the RV module
calls `removeBase(rv.id)` to free the slot.

For raid targeting: an RV base behaves identically to a fixed base — both
expose `spawnPoint`, `x`, `y`, and `id`. D·03 doesn't need to special-case.

## 11. Optional: wire `assignWallToBase` into `placeWall()` (game.js)

`bases.js` already calls `linkExistingWallsToBase` at claim time, which
captures all walls already standing. To also capture walls placed AFTER a
base is claimed, add one line to `placeWall()` in game.js after the
`Game.walls.push(...)` call (around line 807):

```js
Game.walls.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, hp: wallHp, maxHp: wallHp });
assignWallToBase(Game.walls[Game.walls.length - 1]); // NEW — auto-link to enclosing base if any
```

This is optional but recommended for D·03 so raid AI can read
`wall.baseId` to prioritize walls that protect a real safehouse.
