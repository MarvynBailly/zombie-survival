# Noise Box module (C·03) — integration spec

`noisebox.js` is self-contained. Every hook below is additive — no existing
file was modified by the module itself.

## 1. `index.html` script load order

Insert after `squad.js` and before `game.js` so `game.js`'s tick/render and
input handlers can call into the module:

```html
<script src="squad.js"></script>
<script src="noisebox.js"></script>
<script src="game.js"></script>
<script src="render.js"></script>
```

`render.js` can also call `drawNoiseBoxes(...)`. If you'd rather call it from
`game.js`'s main render path, the order above is fine — `noisebox.js` only
depends on globals (`Game`, `TILE_SIZE`, `WORLD_W`, `WORLD_H`, `setNotice`,
`now`, `rand`, `hasItem`, `removeItem`, `Audio`, `inObstacle`) all defined
before `game.js`'s render runs.

## 2. `items.js` additions

Add both entries to the `ITEMS` registry:

```js
battery: {
  id: 'battery', name: 'Battery', category: 'material',
  stackMax: 5, tint: '#f3c64a',
  desc: 'Power cell. Each battery feeds a noise box for 3 pulls.',
},
noise_box_kit: {
  id: 'noise_box_kit', name: 'Noise Box Kit', category: 'consumable',
  stackMax: 3, tint: '#7a7e88',
  desc: 'Deploys a speaker on a tripod. Use to place at your feet.',
  use(p) {
    const fx = p.x + Math.cos(p.angle) * 36;
    const fy = p.y + Math.sin(p.angle) * 36;
    return !!placeNoiseBox(fx, fy, p);
  },
},
```

`use()` returns truthy on a successful placement so `useItem()` decrements
the slot. On failure (blocked tile / OOB) it returns false and the kit is
preserved — `placeNoiseBox` already surfaces the setNotice.

Add icon branches in `drawItemIconShape()` so the inventory UI renders:

```js
} else if (id === 'battery') {
  // amber cell with two contact pips
  ctx.fillStyle = '#43464d';
  ctx.fillRect(cx - 10, cy - 12, 20, 24);
  ctx.fillStyle = '#f3c64a';
  ctx.fillRect(cx - 9, cy - 11, 18, 22);
  ctx.fillStyle = '#caa760';
  ctx.fillRect(cx - 9, cy + 6, 18, 2);
  ctx.fillStyle = '#101216';
  ctx.fillRect(cx - 5, cy - 14, 3, 2);
  ctx.fillRect(cx + 2, cy - 14, 3, 2);
  ctx.fillStyle = '#101216';
  ctx.font = 'bold 7px monospace';
  ctx.fillText('+', cx - 6, cy - 1);
  ctx.fillText('-', cx + 2, cy - 1);
} else if (id === 'noise_box_kit') {
  // mini speaker silhouette
  ctx.fillStyle = '#2a2d34';
  ctx.fillRect(cx - 11, cy - 8, 22, 18);
  ctx.fillStyle = '#7a7e88';
  ctx.beginPath();
  ctx.arc(cx, cy + 1, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#3a3f4a';
  ctx.beginPath();
  ctx.arc(cx, cy + 1, 2, 0, Math.PI * 2);
  ctx.fill();
  // tripod legs
  ctx.strokeStyle = '#101216';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy + 10);
  ctx.lineTo(cx - 8, cy + 18);
  ctx.moveTo(cx, cy + 10);
  ctx.lineTo(cx + 8, cy + 18);
  ctx.moveTo(cx, cy + 10);
  ctx.lineTo(cx, cy + 19);
  ctx.stroke();
}
```

## 3. `items.js` — CRAFT_RECIPES

Append to `CRAFT_RECIPES`:

```js
{
  id: 'noise_box_kit',
  label: 'Noise Box Kit',
  desc: 'Deployable speaker. Use from inventory to place. Pulls hordes for 30s.',
  cost: [{ id: 'scrap', n: 8 }, { id: 'battery', n: 1 }],
  apply(p) {
    const left = addItem(p.inventory, 'noise_box_kit', 1);
    if (left === 0) setNotice('+1 noise box kit', 1.2);
    else setNotice('Inventory full — kit lost', 1.5);
  },
},
```

Note the recipe consumes a battery as part of the kit, so the battery item
must exist in the registry before this recipe is reachable.

## 4. `game.js` — `resetRun()`

Right after `Game.worldSurvivors = [];` (around line 140):

```js
// Noise box (C·03) — placeable speaker hordes follow.
initNoiseBoxes();
```

## 5. `game.js` — main tick

In `tick(dt)` (around line 2385, after `updateSquad(dt);`):

```js
updateNoiseBoxes(dt);
```

## 6. `render.js` — world render

In `render.js` inside the world-camera block, immediately after the
`Game.walls` draw loop (around line 178) and before the zombies draw:

```js
// Noise boxes (C·03) — placed speakers; rings render in their own draw fn.
if (typeof drawNoiseBoxes === 'function') {
  drawNoiseBoxes(ctx, Game.camera.x, Game.camera.y);
}
```

The function takes `(ctx, camX, camY)` and does its own off-screen culling,
so no `inView` guard is required at the call site.

## 7. N-key binding

In `game.js` `updatePlayer(dt)` near the H-key block (around line 754), add:

```js
// N triggers the nearest noise box's 30s aggro pull (auto-equipped detonator).
if (input.keys.has('n')) {
  if (!p._nHeld) { triggerNearestNoisePull(p); p._nHeld = true; }
} else {
  p._nHeld = false;
}
```

Also add `'n'` to the `preventDefault` allowlist in the `keydown` listener
(around line 47):

```js
if (['w','a','s','d','r','e','i','p','h','n',' ','escape',
     '1','2','3','4','5','6','7','8','9','0','-','='].includes(e.key.toLowerCase())) {
  e.preventDefault();
}
```

## 8. E-key extension — slot a battery

Extend the E-key chain in `updatePlayer(dt)` (around line 733). Insert the
noise box check **before** the existing survivor recruit branch so a placed
box near a survivor still takes priority for the interact key — the box is
a deliberate placement, the survivor is ambient:

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
    } else {
      // NEW: noise box battery slot
      const nb = (typeof findNoiseBoxNear === 'function')
        ? findNoiseBoxNear(p, 50) : null;
      if (nb) {
        slotBatteryIntoBox(nb, p);
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
}
```

## 9. Zombie aggro wiring — `pickAggroOverride` FIRST

The existing zombie target picker is `pickAggroTarget(z)` in `squad.js`
(line 303), which rolls a 30% chance to pick a squadmate over the player.
Currently `game.js`'s `updateZombies` does **not** call it — the steering
just uses `Game.player` directly. The integrator must (a) route steering
through a single target selector and (b) call `pickAggroOverride(z)` first.

In `game.js` `updateZombies(dt)` (around line 1939–1957) replace the
LOS/steering block so the target is resolved via the new ordered chain.
Show the exact diff:

```diff
-    let dx, dy, mode = 'chase';
-    // "blocked" means NAV reports no path to the player from here — that's
-    // the only state in which zombies are allowed to chew through walls.
-    let blocked = false;
-    if (NAV.hasLOS(z.x, z.y, p.x, p.y)) {
-      dx = p.x - z.x; dy = p.y - z.y;
-    } else {
-      const fd = NAV.flowDir(z.x, z.y);
-      const cellDist = NAV.dist[NAV.cy(z.y) * NAV.cols + NAV.cx(z.x)];
-      const cutOff = cellDist < 0 && !fd;
-      blocked = cutOff;
-      if (cutOff && Game.walls.length > 0) {
-        const wall = findBashWall(z, p);
-        if (wall) {
-          dx = wall.x + wall.w / 2 - z.x;
-          dy = wall.y + wall.h / 2 - z.y;
-          mode = 'bash';
-          z.bashWall = wall;
-        }
-      }
-      if (mode === 'chase') {
-        if (fd) { dx = fd[0]; dy = fd[1]; }
-        else { dx = p.x - z.x; dy = p.y - z.y; }
-      }
-    }
+    // Target resolution order:
+    //   1) noise box aggro override (200-tile pull window)
+    //   2) squad-vs-player 30% roll (squad.js)
+    //   3) fallback to player
+    let tgt = null;
+    if (typeof pickAggroOverride === 'function') tgt = pickAggroOverride(z);
+    if (!tgt && typeof pickAggroTarget === 'function') tgt = pickAggroTarget(z);
+    if (!tgt) tgt = p;
+    const tx = tgt.x, ty = tgt.y;
+
+    let dx, dy, mode = 'chase';
+    // "blocked" means NAV reports no path to the target — only state where
+    // zombies are allowed to chew through walls.
+    let blocked = false;
+    if (NAV.hasLOS(z.x, z.y, tx, ty)) {
+      dx = tx - z.x; dy = ty - z.y;
+    } else {
+      const fd = NAV.flowDir(z.x, z.y);
+      const cellDist = NAV.dist[NAV.cy(z.y) * NAV.cols + NAV.cx(z.x)];
+      const cutOff = cellDist < 0 && !fd;
+      blocked = cutOff;
+      if (cutOff && Game.walls.length > 0) {
+        const wall = findBashWall(z, p);
+        if (wall) {
+          dx = wall.x + wall.w / 2 - z.x;
+          dy = wall.y + wall.h / 2 - z.y;
+          mode = 'bash';
+          z.bashWall = wall;
+        }
+      }
+      if (mode === 'chase') {
+        if (fd) { dx = fd[0]; dy = fd[1]; }
+        else { dx = tx - z.x; dy = ty - z.y; }
+      }
+    }
```

NAV's flow field is built around the player — it's the fastest cheap
approximation. While the override is active, zombies near the box snap to
the box via LOS, and zombies behind walls fall back to the player flow
field (still toward the player, which is fine — they were going to chase
the player anyway, and the box is usually within the player's vicinity at
detonation time).

If the box is ever placed far from the player and a zombie is behind a
wall with no LOS to either, it'll keep following the player flow until LOS
to the box opens up. That's acceptable — the design promises a 200-tile
attractor, not perfect pathing.

The contact damage block further down (line 2088+) still uses `p` as the
melee target. Leave it alone — zombies only "attack" the box if they
literally touch it (handled below in the contact path you add for
`damageNoiseBox`).

## 9b. Optional — zombies chew the box on contact

Inside `updateZombies(dt)` after the player contact check (around line
2095), allow zombies to damage the box if they're touching it. This makes
the box a real attrition target during a pull:

```js
if (Game.noiseBoxes && Game.noiseBoxes.length > 0) {
  for (let bi = Game.noiseBoxes.length - 1; bi >= 0; bi--) {
    const nb = Game.noiseBoxes[bi];
    const dxn = nb.x - z.x, dyn = nb.y - z.y;
    if (dxn * dxn + dyn * dyn <= (z.r + 20) * (z.r + 20)) {
      damageNoiseBox(nb, (z.damage || 8) * dt * 1.5);
    }
  }
}
```

Skip this if you want the box to be indestructible.

## 10. Save / load wiring — `persistence.js`

In `saveGame()`, add a top-level field next to `walls` / `barrels`:

```js
noiseBoxes: (typeof saveNoiseBoxes === 'function') ? saveNoiseBoxes() : [],
```

In `restoreFromSave(d)` in `game.js` (after the walls/barrels restore,
around line 247):

```js
if (typeof loadNoiseBoxes === 'function') loadNoiseBoxes(d.noiseBoxes || []);
```

Also bump `SAVE_VERSION` in `constants.js` from 5 to 6 so prior saves are
discarded cleanly (loadSavedGame rejects mismatched versions).

## Constants reference

Defined inside `noisebox.js` (no constants.js edit required):

- `NOISE_PULL_DURATION = 30` (seconds)
- `NOISE_PULL_RADIUS   = 200 * TILE_SIZE` (8000 px)
- `NOISE_BOX_MAX_HP    = 40`
- `NOISE_BOX_CHARGES_PER_BATTERY = 3`
- `NOISE_BOX_INTERACT_RADIUS = 50`
