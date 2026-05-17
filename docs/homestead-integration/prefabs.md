# Prefabs module — integration spec

`prefabs.js` is a self-contained module. It does not modify any existing
file — every hook below is additive. Apply the hooks in order; the module
is forgiving of partial integration (most exports no-op when state is
missing) but the workbench tab + mouse handling + render call are required
to actually use it.

## 1. `index.html` — script load order

`prefabs.js` references `Game`, `World`, `Audio`, `setNotice`, `clamp`,
`circleRectCollide`, `perkMult`, `hasItem`, `removeItem`, `itemCount`, and
the constants `TILE_SIZE`, `WALL_HP`, `WORLD_W`, `WORLD_H`. All of those
exist by the time `game.js` runs.

The brief calls for **placement after `walls.js`**. `walls.js` is a sibling
module (tier/blueprint/decay extensions for player-placed walls) that
shares the `material` tag the prefab wall entries write. Load order:

```html
<script src="game.js"></script>
<script src="walls.js"></script>
<script src="prefabs.js"></script>   <!-- NEW -->
<script src="render.js"></script>
<script src="ui.js"></script>
```

`prefabs.js` does not depend on `walls.js` at load time; it only relies on
`game.js` globals. But loading prefabs after walls means walls.js's
`migrateWall()` (if it's wired into the wall tick) will pick up the
`material: 'wood'` tag prefabs write — they're already compatible (no
field collision). If walls.js isn't being shipped, drop the line; the rest
of the integration is unchanged.

## 2. `resetRun()` hook (game.js, ~line 140)

Right after the squad/survivors reset (look for `Game.squad = [];
Game.worldSurvivors = [];`):

```js
initPrefabs();
```

## 3. Main tick — `updatePrefabs(dt)`

In the main game tick (game.js, inside the `Game.mode === 'playing'` update
block, near other per-frame subsystem updates like `updateSquad(dt)` —
search for that call), add:

```js
updatePrefabs(dt);
```

Order doesn't matter against `updateSquad` / `updatePlayer` — the prefab
tick only reads `input.wx/wy` (which `updatePlayer` writes earlier in the
tick) and decrements a cooldown. Place it after `updatePlayer` so the
ghost's snap-to-grid uses the latest mouse world coords.

## 4. Render dispatch — `drawPrefabGhost(ctx, camX, camY)`

In `render()` (render.js, ~line 182), the world is already in a translated
context after the `ctx.translate(-Game.camera.x, -Game.camera.y)` block.
Add the ghost call **after the wall-ghost block, before the zombie pass**:

```js
// ghost preview of next wall placement
if (Game.player && !Game.player.dead && Game.player.weapon === 'wall' && ...) {
  const ghost = wallPlacementRect(Game.player);
  ZSprites.drawWallGhost(ctx, ghost, isWallPlacementValid(ghost));
}

// prefab ghost (workbench placement mode)
drawPrefabGhost(ctx, Game.camera.x, Game.camera.y);   // NEW

// zombies (culled)
for (const z of Game.zombies) if (inView(z.x, z.y)) ZSprites.drawZombie(ctx, z);
```

The `camX`/`camY` args are currently unused by the module (the canvas is
already translated), but they're in the signature so a future HUD pass can
reuse the same call.

## 5. Workbench UI — Prefabs tab (ui.js)

The existing workbench overlay (ui.js, `refreshCrafting()` ~line 605 and
`openCrafting()` ~line 646) lists `CRAFT_RECIPES` flat. Add a tab toggle
above the list and route the body to either the crafting rows or the
prefab rows.

### 5a. Track the active tab on the overlay element

Inside `openCrafting()`, when first building `__craftEl`, attach a
`__tab` data field to it:

```js
__craftEl = el('div', { class: 'overlay craft-overlay', ... },
  el('div', { class: 'panel', ... }, ... )
);
__craftEl.__tab = 'craft';   // NEW: 'craft' | 'prefab'
```

### 5b. Insert a tab strip in the panel header

Inside the panel, between the `<h2>` and `.craft-list` div, add:

```js
el('div', { class: 'craft-tabs', style: 'display:flex;gap:8px;margin-bottom:10px' },
  el('button', {
    class: 'tab',
    onclick: () => { __craftEl.__tab = 'craft'; refreshCrafting(); },
  }, 'CRAFT'),
  el('button', {
    class: 'tab',
    onclick: () => { __craftEl.__tab = 'prefab'; refreshCrafting(); },
  }, 'PREFABS'),
),
```

Add minimal CSS in `styles.css` (or inline) for `.craft-tabs .tab` to
match the existing button styling. The "active" tab can be marked by
toggling a class in `refreshCrafting` based on `__craftEl.__tab`.

### 5c. Branch `refreshCrafting()` on the active tab

At the top of `refreshCrafting()`, branch on `__craftEl.__tab`:

```js
function refreshCrafting() {
  if (!__craftEl) return;
  const list = __craftEl.querySelector('.craft-list');
  if (!list) return;
  list.innerHTML = '';
  if (__craftEl.__tab === 'prefab') {
    refreshPrefabList(list);
  } else {
    refreshCraftList(list);   // existing body extracted to its own fn
  }
  // (existing scrap-stock header readout stays the same)
}
```

Extract the existing recipe loop into `refreshCraftList(list)` — verbatim
copy of the current body — and add a new sibling:

```js
function refreshPrefabList(list) {
  const rows = prefabUiRows();
  for (const r of rows) {
    const row = el('div', { class: 'craft-row' + (r.affordable ? '' : ' poor') });
    const left = el('div', { class: 'left' },
      el('div', { class: 'nm' }, r.name),
      el('div', { class: 'desc' }, r.desc),
    );
    const right = el('div', { class: 'right' },
      el('div', { class: 'cost' }, `${r.cost}× Scrap`),
      el('button', {
        class: 'primary',
        disabled: r.affordable ? null : 'disabled',
        onclick: () => {
          if (!r.affordable) return;
          enterPrefabPlacementMode(r.id);
          closeCrafting();           // exit the overlay so the player can aim
        },
      }, 'PLACE'),
    );
    row.appendChild(left); row.appendChild(right);
    list.appendChild(row);
  }
}
```

The parallel to the existing CRAFT_RECIPES UI is intentional — same
`.craft-row` + `.left` + `.right` layout, same "PLACE/CRAFT" primary
button. Only the row data source and the click handler differ.

## 6. Mouse + keyboard handlers (game.js)

The mouse listeners are defined at the top of game.js (~line 55–62). Add
two new handlers — the existing ones already preventDefault for the
canvas, so prefab placement plays nicely with the weapon-fire path
provided we early-return.

### 6a. Intercept left-click while placing

In the `mousedown` listener (around line 60):

```js
canvas.addEventListener('mousedown', e => {
  if (e.button === 0) {
    Audio.ensure();
    // Prefab placement consumes the click before the weapon-fire path sees it.
    if (typeof isPlacingPrefab === 'function' && isPlacingPrefab()) {
      const wx = input.mouseX + Game.camera.x;
      const wy = input.mouseY + Game.camera.y;
      tryPlacePrefab(wx, wy, Game.player);
      e.preventDefault();
      return;
    }
    input.mouseDown = true;
  } else if (e.button === 2 && typeof isPlacingPrefab === 'function' && isPlacingPrefab()) {
    exitPrefabPlacementMode();
    e.preventDefault();
  }
});
```

### 6b. Esc handling

In the `keydown` listener (~line 45), before any other Esc handling:

```js
if (e.key === 'Escape' && typeof isPlacingPrefab === 'function' && isPlacingPrefab()) {
  exitPrefabPlacementMode();
  e.preventDefault();
  return;
}
```

## 7. Watchtower view bonus (render.js)

The minimap reveal radius in `drawWorldMap()` (render.js ~line 432) is
the current "view radius" code path:

```js
const revealRadius = Math.min(mw, mh) * 0.42;
```

Apply the prefab watchtower bonus right after:

```js
const baseRevealRadius = Math.min(mw, mh) * 0.42;
const revealRadius = baseRevealRadius *
  (typeof playerInWatchtower === 'function' && playerInWatchtower(p) ? 2 : 1);
```

If/when a fog-of-war world reveal radius is added in the main `render()`
function, apply the same `playerInWatchtower(Game.player) ? 2 : 1` factor
there. Search for `revealRadius`, `sightRange`, or any future fog constant
when the system lands.

The `s_reveal` perk (perks.js) uses a separate `revealBonus` key; if you
want the watchtower bonus to stack with that perk, wrap both into the
same multiplier:

```js
const perkBonus = 1 + (typeof perkSum === 'function' ? perkSum('revealBonus') : 0);
const tower = (typeof playerInWatchtower === 'function' && playerInWatchtower(p)) ? 2 : 1;
const revealRadius = baseRevealRadius * perkBonus * tower;
```

## 8. Save / load wiring (persistence.js)

The watchtower bonus footprints aren't entities — they're metadata that
the integrator must persist explicitly. Walls/barrels spawned by prefab
placement are already covered by the existing `Game.walls` / `Game.barrels`
save paths.

In `saveGame()` (persistence.js, inside the `data` object literal):

```js
prefabs: typeof savePrefabs === 'function' ? savePrefabs() : null,
```

In `restoreFromSave()` (game.js, after the walls/barrels restore around
line 244):

```js
if (typeof loadPrefabs === 'function') loadPrefabs(d.prefabs);
```

Save JSON shape:

```json
{
  "prefabs": {
    "watchtowers": [
      { "x": 16000, "y": 16000, "w": 40, "h": 40 }
    ]
  }
}
```

Active ghost state is intentionally not saved — exiting a save with the
ghost open just drops the player out of placement mode on reload.

## 9. Optional follow-ups (not required for the prefab module to work)

### 9a. Workbench prompt picks up prefab-spawned workbenches

`findWorkbenchNear()` in game.js (~line 855) only iterates
`World.forEachActiveObstacle`. Prefab workbenches live in `Game.walls`
with `kind: 'workbench'`. To light up the prompt:

```js
function findWorkbenchNear(x, y, radius) {
  let best = null, bestD = radius * radius;
  World.forEachActiveObstacle(x, y, (o) => {
    if (o.dead) return;
    if (o.style !== 'workbench' && o.kind !== 'workbench') return;
    const ox = o.x + o.w / 2, oy = o.y + o.h / 2;
    const dx = x - ox, dy = y - oy;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = o; }
  });
  // NEW: also scan player-placed walls for prefab workbenches.
  for (const w of Game.walls) {
    if (w.kind !== 'workbench' && w.style !== 'workbench') continue;
    const ox = w.x + w.w / 2, oy = w.y + w.h / 2;
    const dx = x - ox, dy = y - oy;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = w; }
  }
  return best;
}
```

### 9b. Chest open path picks up prefab-spawned chests

Same shape — `findChestNear()` (game.js ~line 841) scans
`World.forEachActiveChest`. Add a sibling scan over `Game.walls` where
`w.kind === 'chest' && !w.opened`. The chest produced by a prefab carries
a `contents` array compatible with `openChest()`.

### 9c. Door system

Prefab doors currently materialize as walls tagged `door: true,
passable: false`. When a real door subsystem lands, look for that tag in
`Game.walls` to retrofit existing prefabs into interactive doors. The
prefab module itself needs no changes.
