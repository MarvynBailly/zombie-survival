# Cameras & Monitors (C·04) — integration spec

`cameras.js` is self-contained. Wiring below is additive — the module
itself never needs editing.

Module exports (all top-level globals, mirroring `power.js` / `squad.js`):

- `initCameras()` — clear `Game.cameras`, `Game.monitors`, `Game.monitorPanel`
- `updateCameras(dt)` — internally throttled (~1s); cheap to call every frame
- `drawCameras(ctx, camX, camY)` / `drawMonitors(ctx, camX, camY)` — world pass
- `placeCamera(x, y, player)` / `placeMonitor(x, y, player)` — kit consumers
- `findCameraNear(player, radius=50)` / `findMonitorNear(player, radius=50)`
- `openMonitorPanel(monitor)` / `closeMonitorPanel()` — overlay state
- `drawMonitorPanel(ctx, w, h, monitor)` — screen-space UI overlay
- `damageCamera(cam, dmg)` / `damageMonitor(mon, dmg)` — destruction
- `saveCameras()` / `loadCameras(data)` — persistence (covers both lists)

Assumed globals: `Game`, `Audio`, `setNotice`, `rand`, `TILE_SIZE`,
`CHUNK_SIZE`, `VIEW_W`, `isPowered`, `nearestBase`, `inObstacle`.

---

## 1. Script tag (`index.html`)

`cameras.js` must load **after** `power.js` (it calls `isPowered`) and
`bases.js` (it calls `nearestBase`). Drop it right after both:

```html
<script src="items.js"></script>
<script src="perks.js"></script>
<script src="squad.js"></script>
<script src="power.js"></script>
<script src="bases.js"></script>
<script src="cameras.js"></script>   <!-- NEW -->
<script src="game.js"></script>
```

---

## 2. New items + craft recipes (`items.js`)

Add inside the `ITEMS = { ... }` literal (alongside `generator_kit`):

```js
camera_kit: {
  id: 'camera_kit', name: 'Camera Kit', category: 'tool',
  stackMax: 1, tint: '#9bc6cf',
  desc: 'Surveillance camera. Right-click to deploy in front of you.',
  use(p) {
    const ax = p.x + Math.cos(p.angle) * 40;
    const ay = p.y + Math.sin(p.angle) * 40;
    const cam = (typeof placeCamera === 'function') ? placeCamera(ax, ay, p) : null;
    return !!cam;
  },
},
monitor_kit: {
  id: 'monitor_kit', name: 'Monitor Kit', category: 'tool',
  stackMax: 1, tint: '#8ec547',
  desc: 'CCTV monitor. Right-click to deploy in front of you. Binds to nearest camera.',
  use(p) {
    const ax = p.x + Math.cos(p.angle) * 40;
    const ay = p.y + Math.sin(p.angle) * 40;
    const m = (typeof placeMonitor === 'function') ? placeMonitor(ax, ay, p) : null;
    return !!m;
  },
},
```

Append to `CRAFT_RECIPES`:

```js
{
  id: 'camera_kit',
  label: 'Camera Kit',
  desc: 'CCTV. Reveals 5 chunks while powered.',
  cost: [{ id: 'scrap', n: 8 }],
  apply(p) {
    const left = addItem(p.inventory, 'camera_kit', 1);
    setNotice(left === 0 ? '+1 camera kit' : 'Inventory full — kit lost', 1.5);
  },
},
{
  id: 'monitor_kit',
  label: 'Monitor Kit',
  desc: 'Screen for a placed camera. Binds to nearest on placement.',
  cost: [{ id: 'scrap', n: 10 }],
  apply(p) {
    const left = addItem(p.inventory, 'monitor_kit', 1);
    setNotice(left === 0 ? '+1 monitor kit' : 'Inventory full — kit lost', 1.5);
  },
},
```

(Spec says the camera recipe may use `8 scrap + 1 battery + 1 wire`. The
project has no `battery` / `wire` item yet, so this spec uses scrap-only
costs. Swap in those items later if/when they exist.)

Optional procedural icons (`drawItemIconShape`):

```js
} else if (id === 'camera_kit') {
  ctx.fillStyle = '#2a2d33'; ctx.fillRect(cx - 11, cy - 8, 22, 16);
  ctx.fillStyle = '#3a3f4a'; ctx.fillRect(cx - 10, cy - 7, 20, 14);
  ctx.fillStyle = '#0b0c0e'; ctx.fillRect(cx + 4,  cy - 5, 6, 8);
  ctx.fillStyle = '#d24b35'; ctx.fillRect(cx - 6,  cy - 4, 2, 2);
} else if (id === 'monitor_kit') {
  ctx.fillStyle = '#2a2d33'; ctx.fillRect(cx - 12, cy - 9, 24, 18);
  ctx.fillStyle = '#16221a'; ctx.fillRect(cx - 10, cy - 7, 20, 14);
  ctx.fillStyle = '#8ec547'; ctx.fillRect(cx + 7,  cy - 6, 2, 2);
  ctx.fillStyle = 'rgba(155,198,207,0.3)';
  ctx.fillRect(cx - 10, cy - 5, 20, 1);
  ctx.fillRect(cx - 10, cy - 1, 20, 1);
  ctx.fillRect(cx - 10, cy + 3, 20, 1);
}
```

---

## 3. `resetRun()` wiring (`game.js`)

Inside `resetRun()` add `initCameras()` next to `initPower()`:

```js
initPower();
initCameras();   // NEW — clears Game.cameras + Game.monitors + Game.monitorPanel
```

---

## 4. Main tick wiring (`game.js`)

Inside `tick(dt)` add `updateCameras(dt)` next to `updatePower(dt)`:

```js
updateSquad(dt);
updatePower(dt);
updateCameras(dt);    // NEW — internally throttles to ~1Hz reveal pulse
updateBullets(dt);
```

The module sums dt internally; calling every frame is fine.

---

## 5. Render dispatch (`render.js`)

Both world-draws sit in the same band as `drawGenerators` (between walls
and the ghost preview). Right after `drawGenerators(ctx, cam.x, cam.y)`:

```js
if (typeof drawGenerators === 'function') drawGenerators(ctx, cam.x, cam.y);
if (typeof drawCameras    === 'function') drawCameras(ctx, cam.x, cam.y);   // NEW
if (typeof drawMonitors   === 'function') drawMonitors(ctx, cam.x, cam.y);  // NEW
```

Each function does its own viewport culling.

---

## 6. E-key interact extension (`game.js`)

The E-key chain currently runs chest → workbench → generator → survivor.
Insert **camera (toggle direction) → monitor (open panel)** between
generator and survivor:

```js
} else if (typeof findGeneratorNear === 'function' && findGeneratorNear(p, 60)) {
  tryRefuelGenerator(findGeneratorNear(p, 60), p);
  p.openCd = 0.4;
} else if (typeof findMonitorNear === 'function' && findMonitorNear(p, 50)) {  // NEW
  const mon = findMonitorNear(p, 50);
  if (Game.monitorPanel === mon) closeMonitorPanel();
  else openMonitorPanel(mon);
  p.openCd = 0.4;
} else if (typeof findCameraNear === 'function' && findCameraNear(p, 50)) {    // NEW
  const cam = findCameraNear(p, 50);
  cam.angle = p.angle;       // re-aim camera at the player's current heading
  setNotice('Camera re-aimed', 1.2);
  if (Audio && Audio.sfx && Audio.sfx.click) Audio.sfx.click();
  p.openCd = 0.4;
} else if (typeof findSurvivorNear === 'function') {
  // ...existing recruit branch...
}
```

ESC should also close the monitor panel — extend the existing ESC handler:

```js
if (input.keys.has('escape')) {
  if (Game.monitorPanel) { closeMonitorPanel(); /* ...rest of esc... */ }
}
```

---

## 7. Monitor panel UI dispatch (`render.js`)

`drawMonitorPanel` is screen-space — call it right after `drawWorldMap()`
inside `draw()`, so the panel sits above the HUD but under the M-map:

```js
if (Game.mapOpen) drawWorldMap();
if (Game.monitorPanel && typeof drawMonitorPanel === 'function') {
  drawMonitorPanel(ctx, VIEW_W, VIEW_H, Game.monitorPanel);     // NEW
}
```

If the player opens the M map while a monitor panel is open, M should
take precedence (the panel is a small overlay, the map is fullscreen).
Optionally clear the panel when the M map opens.

While `Game.monitorPanel` is non-null gameplay continues underneath —
this is intentional. To pause input, gate the player-input dispatch on
`!Game.monitorPanel` in `updatePlayer`.

---

## 8. Chunk reveal compatibility — IMPORTANT

`cameras.js` reveals into `Game.exploredChunks` via a small helper:

```js
function __addExplored(key) {
  const ex = Game.exploredChunks;
  if (!ex) return;
  if (ex instanceof Set) ex.add(key);
  else if (Array.isArray(ex) && ex.indexOf(key) < 0) ex.push(key);
}
```

Today the codebase uses **`Set`** (see `game.js` line 104:
`exploredChunks: new Set()`). The helper covers both branches so a
future refactor that swaps to an Array (or vice-versa) is no-op for
this module.

If the codebase later changes `exploredChunks` to something else
(a plain object map, an LRU, etc.), the integrator must extend
`__addExplored` accordingly — or replace it with whatever canonical
reveal helper exists at that time.

The reveal scope is a 5-chunk cross: the camera's chunk + N/E/S/W
neighbors. Reveals are permanent — losing power or destroying the
camera does not un-reveal sectors (matches map-fog behavior elsewhere).

---

## 9. Save / load wiring (`persistence.js` + `game.js`)

### saveGame() (persistence.js)

Add inside the `data = { ... }` literal next to `generators`:

```js
generators: (typeof savePower === 'function') ? savePower() : [],
cctv:       (typeof saveCameras === 'function') ? saveCameras() : { cameras: [], monitors: [] },
```

`saveCameras()` returns:

```json
{
  "cameras": [{
    "id": "cam1", "x": 0, "y": 0, "hp": 40, "maxHp": 40,
    "range": 3200, "angle": 0,
    "revealedChunks": ["12,8", "13,8", "11,8", "12,9", "12,7"]
  }],
  "monitors": [{
    "id": "mon1", "x": 0, "y": 0, "hp": 30, "maxHp": 30,
    "cameraId": "cam1"
  }]
}
```

Bump `SAVE_VERSION` in `constants.js` so older saves (no `cctv` field)
get rejected cleanly.

### restoreFromSave() (game.js)

After the `loadPower(d.generators || [])` line, add:

```js
if (typeof loadCameras === 'function') loadCameras(d.cctv || null);
```

`loadCameras` calls `initCameras()` first, so it is safe on every restore.
It also re-stamps each camera's saved `revealedChunks` into
`Game.exploredChunks` so a loaded save's map fog state matches the
pre-save state without waiting for the next reveal tick.

---

## 10. Optional damage hooks

Cameras and monitors are destructible (`hp 40` / `hp 30`). To make them
part of the existing combat passes, mirror the generator damage hooks
already documented in `power.md` §9 — replace `Game.generators` with
`Game.cameras` and call `damageCamera(c, dmg)` (likewise for monitors).
The camera/monitor sprites are point-rect entities (no `w`/`h`), so the
bullet hit-test wants a small AABB around the sprite center, e.g.
`if (Math.abs(b.x - c.x) < 8 && Math.abs(b.y - c.y) < 8) damageCamera(c, b.damage)`.

These hooks are optional — the cameras are functional without them,
just indestructible (which the player may actually prefer for a late-
game safehouse asset).

---

## 11. Quick test plan

1. New run — `Game.cameras` and `Game.monitors` are empty arrays.
2. Craft a generator + camera + monitor. Deploy generator first.
3. Deploy camera adjacent to generator. Within 1s, 5 new sectors should
   appear on the M map. Reveal cone is faint cyan in world view.
4. Walk away, kill the generator. Camera red dot goes out. M map keeps
   the revealed sectors (permanent reveal).
5. Deploy a monitor. Notice should say `Monitor bound to cam1`.
6. Stand next to the monitor, press E. Panel opens centered, shows
   `FEED LIVE · CAM1` and a zombie count. Press E or ESC to close.
7. Repower the generator, place a 2nd camera farther away, place a 2nd
   monitor — it should auto-bind to the nearest camera at placement time.
8. Save + reload — both lists round-trip, `revealedChunks` per camera
   restored, M-map fog matches pre-save state.
