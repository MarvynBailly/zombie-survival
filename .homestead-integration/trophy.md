# Trophy room module integration (E·01)

`trophy.js` is the wall-plinth + trophy-drop subsystem. Special zombies
drop one of eight thematic trophy items (~50% on the first kill of each
kind per run, ~10% after); the player carries trophies in the regular
inventory, then mounts them on plinths crafted from a `plinth_kit`. The
plinth PROPS reset per run, but the mounted-trophy DATA persists across
runs in a meta layer keyed `'zombie-survival:trophies'`.

The module is self-contained — these edits hook it into existing files
without modifying `trophy.js` itself. Style + meta architecture mirror
`lore.js` so the two modules feed Cork Board (E·04) consistently.

## 1. Script tag (index.html)

Load after `lore.js` (Cork Board will read both meta layers) and before
`game.js`:

```html
<script src="items.js"></script>
<script src="perks.js"></script>
<script src="lore.js"></script>
<script src="trophy.js"></script>   <!-- add this line -->
<script src="squad.js"></script>
<script src="game.js"></script>
```

`trophy.js` references `Game`, `ITEMS`, `addItem`, `removeItem`,
`setNotice`, `Audio`, `spawnPickup`, `inObstacle`, `WORLD_W`, `WORLD_H`.
At load time it registers `ITEMS.plinth_kit` (`category: 'consumable'`
so the inventory's right-click path invokes `.use()` and decrements the
stack on success — same UX as bandage) plus eight trophy items
(`trophy_brood_sac`, `trophy_charger_horn`, `trophy_tank_plate`,
`trophy_necro_skull`, `trophy_reaper_scythe`, `trophy_cluster_eye`,
`trophy_bloater_gland`, `trophy_specter_veil`) so the inventory and
crafting overlays see them automatically.

## 2. CRAFT_RECIPES — items.js (append to the array, after lore's sketchpad)

Only the `plinth_kit` is craftable. The trophy items are never crafted —
they only drop from special zombie kills.

```js
{
  id: 'plinth_kit',
  label: 'Wall Plinth',
  desc: 'A wooden plinth to mount a trophy on. Right-click in inventory to place.',
  cost: [{ id: 'scrap', n: 6 }, { id: 'wood', n: 1 }],
  apply(p) {
    const left = addItem(p.inventory, 'plinth_kit', 1);
    if (left === 0) setNotice('+1 plinth kit', 1.2);
    else setNotice('Inventory full — plinth kit lost', 1.5);
  },
},
```

> **Note:** there is no `wood` item registered yet (lore.js's sketchpad
> recipe is scrap-only for the same reason). For day-one shipping use
> scrap-only: `cost: [{ id: 'scrap', n: 7 }]`. When wood lands, restore
> the `{ id: 'wood', n: 1 }` cost — `trophy.js` is agnostic to recipe
> shape.

## 3. resetRun() — game.js (around line 142, after `Game.elapsed = 0`)

```js
Game.elapsed = 0;
initLore();
loadLoreMeta();
initTrophies();              // <- add (creates Game.trophies + Game.plinths)
loadTrophyMeta();            // <- add (idempotent — initTrophies() calls it too)
Game.scoreSubmitted = false;
```

## 4. Main tick — game.js, function `tick(dt)` (around line 2385)

`updateTrophies` is a no-op today (plinths are passive props with no
per-tick behavior). Include the call anyway so future tier additions
— breakable plinths, glow pulses on the freshly-mounted trophy, etc. —
have a hook without another patch.

```js
  updateSquad(dt);
  updateTrophies(dt);          // <- add (no-op today; future-proof)
  updateBullets(dt);
```

## 5. World render — render.js, in the obstacle/wall/player block (around line 177)

Plinths are world props that sit BETWEEN the player-placed walls and the
player silhouette so the player draws on top when they walk past one.

```js
    // player-placed walls
    for (const w of Game.walls) if (rectInView(w)) ZSprites.drawWall(ctx, w);

    // trophy plinths (post + mounted trophy glyph)        // <- add this block
    if (typeof drawPlinths === 'function') {
      drawPlinths(ctx, cam.x, cam.y);
    }

    // ghost preview of next wall placement
```

## 6. Kill hook — game.js, function `killZombie(z, weapon)` (around line 1468)

Drop the trophy just before the function returns, after the existing
scrap-drop block but before the `Game.zombies.splice` removal so the
zombie's position is still valid for the pickup spawn. This is also a
natural neighbour for lore.js's `maybeMilestoneShot()` hook.

```diff
   if (scrapRoll < scrapChance) {
     const boosted = Math.max(1, Math.round(scrapAmt * perkMult('scrapMult')));
     Game.pickups.push({
       x: z.x, y: z.y, r: 12, type: `item_scrap_${boosted}`, life: 25,
     });
   }
+  // Trophy drop — special zombies have a ~50% chance on the FIRST kill
+  // of each kind per run, ~10% on subsequent kills. Self-gates by type.
+  if (typeof maybeDropTrophy === 'function') maybeDropTrophy(z, weapon);
   const idx = Game.zombies.indexOf(z);
   if (idx >= 0) Game.zombies.splice(idx, 1);
+  if (typeof maybeMilestoneShot === 'function') maybeMilestoneShot();
 }
```

The trophy is dropped as a regular `item_<id>` pickup, so it routes
through the existing `processPickup()` default branch — no new pickup
type code required. The eight kinds match:

| Zombie kind | Trophy item          | Glyph |
|-------------|----------------------|-------|
| brood       | trophy_brood_sac     | sac   |
| charger     | trophy_charger_horn  | horn  |
| tank        | trophy_tank_plate    | plate |
| necro       | trophy_necro_skull   | skull |
| reaper      | trophy_reaper_scythe | scythe|
| cluster     | trophy_cluster_eye   | eye   |
| bloater     | trophy_bloater_gland | gland |
| stalker     | trophy_specter_veil  | veil  |

(`stalker` is mapped to the "specter" label in the trophy table because
the bestiary doesn't ship a separate `specter` zombie kind. If a future
`specter` kind is added, change `source: 'stalker'` to `'specter'` in
`TROPHY_TABLE.trophy_specter_veil`.)

## 7. E-key extension — game.js, `updatePlayer` (around line 733)

Plinth interaction slots between the workbench fallback and the survivor
fallback. The plinth takes priority over survivors because it is a
player-placed prop — the player explicitly chose to put it there.

```js
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
      } else if (typeof findPlinthNear === 'function' &&    // <- add this branch
                 findPlinthNear(p, 60)) {
        openPlinthMenu(findPlinthNear(p, 60));
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

## 8. Plinth overlay in UI dispatch — render.js (after all world rendering, near the HUD layer)

The plinth menu draws to the world canvas (not the DOM overlay-root) so
it integrates with a single hook. Place this AFTER the final world-space
restore but BEFORE the HUD readout so the menu sits above the game but
below the kill-counter, ammo bars, etc.

```js
  // (after ctx.restore() that ends the world-space camera transform)
  if (Game.plinthMenu && typeof drawPlinthMenu === 'function') {
    drawPlinthMenu(ctx, canvas.width, canvas.height, Game.plinthMenu.plinth);
  }
```

Keybinds while the menu is open are routed through `handlePlinthMenuKey`
in the canvas keydown listener. Add this early in the handler so number
keys 1..8 mount instead of switching weapons:

```js
window.addEventListener('keydown', (e) => {
  if (Game.plinthMenu && typeof handlePlinthMenuKey === 'function') {
    if (handlePlinthMenuKey(e.key)) { e.preventDefault(); return; }
  }
  // ... existing handler ...
});
```

(If your input layer routes through `input.keys`, mirror the same gate:
when `Game.plinthMenu` is truthy, skip weapon/movement handling for the
1..8 / Esc / E keys.)

## 9. Save/load wiring

### Per-run (persistence.js, inside saveGame's data object around line 77)

```js
    worldSurvivors: Game.worldSurvivors ? Game.worldSurvivors.map(...) : null,
    lore: (typeof saveLore === 'function') ? saveLore() : null,
    trophies: (typeof saveTrophies === 'function') ? saveTrophies() : null,  // <- add
  };
```

### restoreFromSave (game.js, near the lore restore line)

```js
  if (typeof loadLore === 'function')     loadLore(d.lore);
  if (typeof loadTrophies === 'function') loadTrophies(d.trophies);
```

### Cross-run meta

`loadTrophyMeta()` is called automatically by `initTrophies()` at run
start. `saveTrophyMeta()` is called automatically inside `mountTrophy()`
so every mount is persisted immediately. No additional call sites are
required, but the player-death hook is the natural belt-and-suspenders
flush — place it next to the lore one (game.js, `damagePlayer`):

```js
    if (typeof captureScreenshot === 'function') captureScreenshot('death', 'death');
    if (typeof saveLoreMeta === 'function')      saveLoreMeta();
    if (typeof saveTrophyMeta === 'function')    saveTrophyMeta();   // <- add
```

## 10. Overlap with E·04 Cork Board

Cork Board pins thumbnails for journals, screenshots, hand-drawn maps,
**and** trophies. The Cork Board UI should:

- Call `trophyMeta()` to read the cross-run trophy collection. Each
  record is `{ id, itemId, sourceKind, sourceDay, weapon, runtimeSec, name, mountedAt }`.
- Use `drawTrophyGlyph(ctx, { itemId }, cx, cy)` to render a 14×10
  thumbnail in the trophy's signature color. (`drawTrophyGlyph` is
  exposed on the window scope — same pattern as `getItemIcon`.)
- Optionally call `getTrophyTooltip(trophy)` for hover-text. Format:
  `"<Name> · day <D> · <weapon> · <Mm>SSs"`.

No additional integration is required between the two modules. The
meta key `'zombie-survival:trophies'` is owned exclusively by
`trophy.js`; lore's `'zombie-survival:lore-meta'` is independent.

## 11. Exported globals (for downstream modules)

```
initTrophies()           — call from resetRun()
updateTrophies(dt)       — no-op; call from main tick anyway
drawPlinths(ctx, cx, cy) — world-space render of all plinths
maybeDropTrophy(z, w)    — call from killZombie() tail
pickupTrophy(id, p)      — wrapper around addItem (rarely needed —
                           the item_<id> pickup path handles it)
findPlinthNear(p, r=60)  — proximity probe for the E-key extension
openPlinthMenu(plinth)   — opens the mount overlay
closePlinthMenu()        — closes the overlay
drawPlinthMenu(ctx,w,h,pl) — world-canvas overlay render
handlePlinthMenuKey(key) — 1..8 / Esc / E shim while menu is open
mountTrophy(plinth, id)  — moves a trophy from inventory → plinth + meta
placePlinth(x, y, p)     — wired through ITEMS.plinth_kit.use()
getTrophyTooltip(t)      — Cork Board hover label
trophyMeta()             — accessor for the cross-run meta cache
saveTrophies()/loadTrophies(d)   — per-run state
saveTrophyMeta()/loadTrophyMeta() — cross-run state
TROPHY_TABLE             — id → { source, name, glyph, color, tint }
TROPHY_BY_KIND           — zombie type → trophy item id
```

## 12. Tunables (constants at the top of trophy.js)

```js
const TROPHY_META_KEY = 'zombie-survival:trophies';
const PLINTH_PROMPT_RADIUS = 60;
const PLINTH_HP = 30;
const PLINTH_W = 28;
const PLINTH_H = 40;
const TROPHY_FIRST_DROP_CHANCE = 0.50;
const TROPHY_REPEAT_DROP_CHANCE = 0.10;
```

Bump the drop chances if playtesting wants more trophies on the wall.
The plinth size is small on purpose — a 28×40 prop reads as wall-furniture
rather than a giant obelisk and lines up roughly to the wall snap grid
(40px) without needing its own snap logic.
