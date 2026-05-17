# Kitchen / Cooking Integration

`kitchen.js` is self-contained but needs to be wired into the script-load
order, the item registry, `resetRun`, the main tick, the world render
dispatch, the E-key dispatcher, the kitchen UI input/render pump, the
buff-multiplier consumers (player speed, blizzard slowdown, sprint
regen), and save/load. All edits below land in **existing** files —
`kitchen.js` itself does not need any further changes.

Module exports (all top-level globals, squad.js style):

- `initKitchen()` — clear state for a new run (called from `resetRun`)
- `updateKitchen(dt)` — expires buffs, ticks regen, fades lit-flame
- `drawCookStations(ctx, camX, camY)` — world render pass
- `placeCookStation(worldX, worldY)` — place from a tool item
- `findCookStationNear(player, radius=60)` — for E-key dispatch
- `damageCookStation(st, dmg)` — destruction (optional bullet/melee hook)
- `cook(recipe, player)` — consume ingredients, add meal to inventory
- `consumeMeal(itemId, player)` — meal items' `use()` calls this
- `applyBuff(kind, durationSec, opts?)` — adds/refreshes a buff
- `hasBuff(kind)` / `buffMult(kind)` — read-side helpers
- `openKitchenUi(station)` / `closeKitchenUi()` / `isKitchenUiOpen()`
- `drawKitchenUi(ctx, w, h)` — canvas overlay (modeled on `drawWorldMap`)
- `handleKitchenClick(mouseX, mouseY)` — click hit-test on the overlay
- `saveKitchen()` / `loadKitchen(data)` — persistence

Module assumes these globals already exist: `Game`, `Audio`, `setNotice`,
`now`, `clamp`, `rand`, `World`, `VIEW_W`, `VIEW_H`, `WORLD_W`, `WORLD_H`,
`WALL_SIZE`, `ITEMS`, `hasItem`, `addItem`, `removeItem`, `itemCount`.

---

## 1. Script tag (`index.html`)

Add `kitchen.js` **after `items.js`** (so meal/ingredient items can be
defined there) and **before `game.js`** (so `game.js` can call
`initKitchen` from `resetRun`). Drop it next to the other feature
modules:

```html
<script src="items.js"></script>
<script src="perks.js"></script>
<script src="squad.js"></script>
<script src="kitchen.js"></script>   <!-- NEW -->
<script src="game.js"></script>
```

If/when `power.js` is also wired in, the order is:

```html
<script src="items.js"></script>
<script src="perks.js"></script>
<script src="squad.js"></script>
<script src="power.js"></script>
<script src="kitchen.js"></script>   <!-- NEW -->
<script src="game.js"></script>
```

---

## 2. Items to register (`items.js`)

Append inside the `ITEMS = { ... }` literal, after the existing
`antibiotic` entry.

### Ingredients

```javascript
  // ----- ingredients (kitchen) -----
  raw_meat: {
    id: 'raw_meat', name: 'Raw Meat', category: 'material',
    stackMax: 10, tint: '#a8362b',
    desc: 'Slab of zombie-killed meat. Cook at a stove (stew).',
  },
  canned_beans: {
    id: 'canned_beans', name: 'Canned Beans', category: 'material',
    stackMax: 10, tint: '#caa760',
    desc: 'Found in chests. Ingredient for stew and chili bowl.',
  },
  wild_herb: {
    id: 'wild_herb', name: 'Wild Herb', category: 'material',
    stackMax: 20, tint: '#8ec547',
    desc: 'Foraged from grass / forest tiles. (Reserved for future recipes.)',
  },
  tomato: {
    id: 'tomato', name: 'Tomato', category: 'material',
    stackMax: 20, tint: '#d24b35',
    desc: 'Grown in the garden. Ingredient for vitamin paste.',
  },
  chili: {
    id: 'chili', name: 'Chili', category: 'material',
    stackMax: 20, tint: '#a8362b',
    desc: 'Grown in the garden. Ingredient for chili bowl.',
  },
  poppy: {
    id: 'poppy', name: 'Poppy', category: 'material',
    stackMax: 20, tint: '#e3a83a',
    desc: 'Grown in the garden. Ingredient for vitamin paste.',
  },
  coffee_beans: {
    id: 'coffee_beans', name: 'Coffee Beans', category: 'material',
    stackMax: 10, tint: '#7a5a30',
    desc: 'Chest find. Brew for a sprint-regen buff.',
  },
```

> **Note:** the Garden module (B·02) may also register `tomato`, `chili`,
> `poppy`. If it does, drop the duplicate stubs here — items.js loads
> first and either registration wins; just keep them in one place. The
> stubs above let kitchen recipes load even before B·02 lands.

### Meals (consumables)

```javascript
  // ----- meals (kitchen, consumables) -----
  stew: {
    id: 'stew', name: 'Stew', category: 'consumable',
    stackMax: 5, tint: '#caa760',
    desc: '+60 HP. +15% movement speed for 90s.',
    use(p) { return consumeMeal('stew', p); },
  },
  chili_bowl: {
    id: 'chili_bowl', name: 'Chili Bowl', category: 'consumable',
    stackMax: 5, tint: '#d24b35',
    desc: '+40 HP. -40% blizzard slowdown for 120s.',
    use(p) { return consumeMeal('chili_bowl', p); },
  },
  coffee: {
    id: 'coffee', name: 'Coffee', category: 'consumable',
    stackMax: 5, tint: '#7a5a30',
    desc: '2× sprint regen for 60s.',
    use(p) { return consumeMeal('coffee', p); },
  },
  vitamin_paste: {
    id: 'vitamin_paste', name: 'Vitamin Paste', category: 'consumable',
    stackMax: 5, tint: '#e3a83a',
    desc: '+0.4 HP/s regen for 120s. Stacks with Field Medic.',
    use(p) { return consumeMeal('vitamin_paste', p); },
  },
```

### Cook station kit (tool)

```javascript
  cook_station_kit: {
    id: 'cook_station_kit', name: 'Cook Station Kit', category: 'tool',
    stackMax: 1, tint: '#7a7e88',
    desc: 'Boxed stove + counter. Right-click to deploy in front of you.',
    use(p) {
      const ax = p.x + Math.cos(p.angle) * 40;
      const ay = p.y + Math.sin(p.angle) * 40;
      const st = (typeof placeCookStation === 'function') ? placeCookStation(ax, ay) : null;
      return !!st;
    },
  },
```

(Optional) procedural icons in `drawItemIconShape(ctx, id, size)` — match
the existing fallthrough chain so they don't render as `?`. Sketch:

- `raw_meat` — pink slab with darker bone stripe
- `canned_beans` — grey cylinder with beige label, "B" letter
- `tomato` / `chili` / `poppy` — small fruit circles in their tint
- `coffee_beans` — two brown ovals with a centerline
- `stew` / `chili_bowl` — bowl rim + soup surface
- `coffee` — mug silhouette
- `vitamin_paste` — squeeze tube
- `cook_station_kit` — grey box with two yellow burner dots

---

## 3. Craft recipes (`items.js`)

Append to `CRAFT_RECIPES`. Cook station = 14 scrap + 1 stove (`stove`
is an existing world obstacle style — once a Stovetop salvage item
exists we can require it, but for now I'm using a generic `stovetop`
ingredient stub, see note below).

**Pragmatic recipe — scrap only** (works today):

```javascript
  {
    id: 'cook_station_kit',
    label: 'Cook Station Kit',
    desc: 'Two-tile stove. Combine ingredients into buff meals.',
    cost: [{ id: 'scrap', n: 14 }],
    apply(p) {
      const left = addItem(p.inventory, 'cook_station_kit', 1);
      if (left === 0) setNotice('+1 cook station kit', 1.5);
      else setNotice('Inventory full — kit lost', 1.5);
    },
  },
```

**Spec-correct recipe (when a `stovetop` salvage item exists)** — same
shape, but `cost: [{ id: 'scrap', n: 14 }, { id: 'stovetop', n: 1 }]`.
Until then the scrap-only version above is what ships.

---

## 4. `resetRun()` wiring (`game.js`)

Inside `resetRun(levelIndex)` (line 109), add the `initKitchen()` call.
Drop it right after the squad/world-survivor init, alongside any other
feature-module inits (e.g. `initPower()` if that lands too):

```javascript
  Game.squad = [];
  Game.worldSurvivors = [];
  initKitchen();           // NEW — Game.cookStations, Game.activeBuffs
  Game.startTime = now();
```

---

## 5. Main tick wiring (`game.js`)

Inside `tick(dt)` (function starts at line 2371), after `updateSquad`:

```javascript
  updateSquad(dt);
  updateKitchen(dt);       // NEW — expires buffs, ticks regen, fades lit-flame
  updateBullets(dt);
```

---

## 6. World render dispatch (`render.js`)

Cook stations draw inside the world transform, **between** obstacles
(the World pass) and the player/squad pass. Easiest hook is right next
to the wall-render block (line 177). Add immediately after the
`Game.walls` loop (and after any `drawGenerators` call if power.js is
present):

```javascript
    // player-placed walls
    for (const w of Game.walls) if (rectInView(w)) ZSprites.drawWall(ctx, w);

    // kitchen — placed cook stations
    if (typeof drawCookStations === 'function') {
      drawCookStations(ctx, cam.x, cam.y);
    }
```

The module does its own viewport culling.

### Kitchen UI overlay (also `render.js`)

`drawKitchenUi` is a fullscreen canvas overlay, modeled on
`drawWorldMap`. Add it to the same overlay band as the world map (line
297 — search for `if (Game.mapOpen) drawWorldMap();`). The kitchen
overlay should draw **after** the world map check (the kitchen sets
`Game.mapOpen = true` to reuse the pause gate, but its own
`Game.kitchenOpen` flag wins for the modal):

```javascript
  if (Game.mapOpen && !Game.kitchenOpen) drawWorldMap();
  if (typeof isKitchenUiOpen === 'function' && isKitchenUiOpen()) {
    drawKitchenUi(ctx, VIEW_W, VIEW_H);
  }
```

(If you'd rather not modify the existing world-map line, just unguard:
`if (Game.mapOpen) drawWorldMap();` followed by the kitchen overlay
will draw kitchen on top of the map, which is fine — but the cleaner
pattern is the `!Game.kitchenOpen` guard above.)

---

## 7. E-key dispatch (`game.js`)

The E chain lives in `updatePlayer` around lines 731-751. Add cook
station **before** the survivor fallback, after workbench (workbenches
keep priority since they're more spatial-overlap-likely with the
crafting UI):

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
      } else if (typeof findCookStationNear === 'function') {
        const cs = findCookStationNear(p, 60);
        if (cs) {
          openKitchenUi(cs);                       // NEW
          p.openCd = 0.4;
        } else if (typeof findSurvivorNear === 'function') {
          const sv = findSurvivorNear(p.x, p.y, SURVIVOR_RECRUIT_RADIUS);
          if (sv) { recruitSurvivor(sv); p.openCd = 0.4; }
        }
      } else if (typeof findSurvivorNear === 'function') {
        const sv = findSurvivorNear(p.x, p.y, SURVIVOR_RECRUIT_RADIUS);
        if (sv) { recruitSurvivor(sv); p.openCd = 0.4; }
      }
    }
  }
```

Also handle E **inside** the open overlay so the player can toggle it
shut (matching the chest/workbench close-on-E pattern). In `ui.js`
around line 757-791, the existing `keydown` handler intercepts E/Esc
for inventory/crafting/perks. Extend the Esc handler:

```javascript
  if (e.key === 'Escape') {
    if (typeof isKitchenUiOpen === 'function' && isKitchenUiOpen()) {
      closeKitchenUi(); e.preventDefault(); return;
    }
    if (isPerkTreeOpen()) { closePerkTree(); e.preventDefault(); return; }
    // ... existing checks
  }
```

And the E handler (search for `e.key === 'e' || e.key === 'E'`):

```javascript
  if (e.key === 'e' || e.key === 'E') {
    if (typeof isKitchenUiOpen === 'function' && isKitchenUiOpen()) {
      closeKitchenUi(); e.preventDefault(); return;
    }
    // ... existing crafting close fallthrough
  }
```

Also gate the M/P/I hotkeys against the kitchen overlay so the player
can't open multiple modals (mirror the existing `!isCraftingOpen()` etc.
guards).

---

## 8. Click handling (`game.js` mouse listener)

The canvas-level mousedown listener (line 60) sets `input.mouseDown` for
firing. Hand it off to `handleKitchenClick` first so clicks on COOK
buttons don't also trigger shots. Wrap the existing handler:

```javascript
canvas.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  Audio.ensure();
  if (typeof isKitchenUiOpen === 'function' && isKitchenUiOpen()) {
    const r = canvas.getBoundingClientRect();
    const mx = (e.clientX - r.left) * (VIEW_W / r.width);
    const my = (e.clientY - r.top) * (VIEW_H / r.height);
    handleKitchenClick(mx, my);
    return;                            // don't start firing
  }
  input.mouseDown = true;
});
```

---

## 9. Buff multiplier consumers

The buffs only matter if the existing systems sample them. Three small
hooks:

### 9a. Player movement speed (`game.js` `updatePlayer`, line ~532)

After the existing `speed *= perkMult('speedMult');`:

```javascript
  speed *= perkMult('speedMult');
  if (typeof buffMult === 'function') speed *= buffMult('stamina');   // NEW
```

The stamina buff multiplier defaults to **1.15** (+15%). When no buff
active, `buffMult` returns `1` — zero cost.

### 9b. Blizzard slowdown (`weather.js`'s `moveMultiplier` consumer)

`Game.weather.moveMultiplier` is `0.85` during a blizzard. The
heat_resist buff should **reduce the slowdown by 40%**, i.e. bring the
multiplier closer to 1. The math: `final = 1 - (1 - mm) * buffMult('heat_resist')`,
where the default `buffMult('heat_resist')` is `0.60`.

This is sampled wherever the existing weather.md integration tells you
to multiply `Game.weather.moveMultiplier` into `speed`. In `game.js`
`updatePlayer` (right after the stamina line above):

```javascript
  const wm = (Game.weather && Game.weather.moveMultiplier) || 1;
  const hr = (typeof buffMult === 'function') ? buffMult('heat_resist') : 1;
  speed *= (1 - (1 - wm) * hr);                                       // NEW
```

(If weather.md already added the raw `speed *= wm` line, replace it
with the formula above so the buff has a place to land.)

### 9c. Sprint regen (`game.js` `updatePlayer`, line ~554)

The s_sprint perk regens `sprintEnergy` at `dt/3` per second. Multiply
by `buffMult('sprint')` (default 2× regen → 0.5× time):

```javascript
  } else if (p.sprintEnergy != null && p.sprintEnergy < 1) {
    const sm = (typeof buffMult === 'function') ? buffMult('sprint') : 1;
    p.sprintEnergy = Math.min(1, p.sprintEnergy + (dt / 3) * sm);     // CHANGED
  }
```

> The regen kind doesn't need a consumer hook — `updateKitchen` ticks
> player HP directly when a `regen` buff is active. It stacks naturally
> with Field Medic's `regenPerSec` perk because they're both additive
> on top of player HP (perk uses `perkSum('regenPerSec')` in your tick;
> kitchen adds its own `b.regen * dt` on top).

---

## 10. Raw meat drop on zombie kill (`game.js`)

`spawnPickup` runs on zombie kill (line ~1573). To make `raw_meat`
acquirable, splice a ~6% roll into the front of `spawnPickup`:

```javascript
function spawnPickup(x, y, forceType) {
  if (forceType) { Game.pickups.push({ x, y, r: 12, type: forceType, life: 30 }); return; }
  if (Math.random() < 0.06) {                                          // NEW
    Game.pickups.push({ x, y, r: 12, type: 'item_raw_meat_1', life: 30 });
    return;
  }
  // ... existing logic
}
```

And make sure the generic `item_<id>_<n>` pickup branch in
`onPickupTouch` (search around line 2188) routes the meat into the
inventory. The existing `item_<id>_<n>` handler already does this
generically if it exists; if not, add a fallback that calls
`addItem(p.inventory, id, n)` for any `item_*` prefixed pickup type.

`canned_beans` / `coffee_beans` / `wild_herb` are intended as chest
loot. If your chest contents table reads from a `CHEST_LOOT` map,
sprinkle these into iron/wood tiers (out of scope for kitchen.js — the
items just need to exist, and they do).

---

## 11. Save / load wiring (`persistence.js` + `game.js`)

### saveGame() — `persistence.js`

In the `data = { ... }` literal (~line 35), add:

```javascript
    walls: Game.walls.map(w => ({ ... })),
    barrels: Game.barrels.map(b => ({ ... })),
    kitchen: (typeof saveKitchen === 'function') ? saveKitchen() : null,
```

Shape returned by `saveKitchen()`:

```json
{
  "stations": [ { "x":0,"y":0,"w":80,"h":60,"hp":60,"maxHp":60 } ],
  "buffs":    [ { "kind":"stamina","remaining":42.5,"mult":1.15 } ]
}
```

Bump `SAVE_VERSION` in `constants.js` (currently `5`). Power's integration
also wants this bumped — coordinate so version goes up only once per
release cycle.

### restoreFromSave() — `game.js`

Inside `restoreFromSave(d)`, after the existing per-feature loads
(e.g. `loadPower(d.generators || [])`):

```javascript
  if (typeof loadKitchen === 'function') loadKitchen(d.kitchen);
```

`loadKitchen` calls `initKitchen()` internally, so it's safe to call
unconditionally on every restore (handles null/undefined fine).

---

## 12. Test plan

1. New run — `Game.cookStations` is `[]` and `Game.activeBuffs` is `[]`.
2. Craft a `cook_station_kit` (14 scrap), right-click it in inventory.
   A grey stove with two dark burners appears 40px in front of you.
3. Walk up to it, press E — the kitchen overlay appears, simulation
   pauses. All four recipes shown; rows with insufficient ingredients
   are dimmed with a red cost line.
4. Acquire ingredients (debug: `addItem(Game.player.inventory,
   'canned_beans', 5); addItem(Game.player.inventory, 'raw_meat', 5)`).
   Click COOK on Stew — burners glow orange for ~2s, a `stew` item
   appears in inventory, ingredients are consumed.
5. Close overlay (E or Esc), right-click the stew in inventory. HP
   bumps by 60; a `buff_stamina` is now active for 90s.
6. With stamina active, walk speed is +15% (verify by holding W with /
   without the buff).
7. Trigger a blizzard (weather.js dev hook). With chili_bowl active,
   movement is faster than with no buff.
8. With s_sprint perk and a coffee buff active, the sprint bar should
   refill in ~1.5s instead of 3s.
9. Shoot the cook station — HP bar appears, sustained fire destroys it
   and the overlay closes if open.
10. Save + reload — the cook station and any active buff round-trip
    (buff `remaining` rebases against the new `now()`).
