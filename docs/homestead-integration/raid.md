# Raid Night module — integration spec (D·03)

`raid.js` is a self-contained module. To wire it into the game, apply the
changes below. No existing file is modified by the module itself — every
hook is additive.

The module assumes the foundation API from `bases.js`, `trader.js`, and
`game.js`:

- `Game.bases`, `nearestBase(x, y)`, `BASE_EFFECTIVE_RADIUS` (bases.js)
- `isBloodMoonTonight()` (trader.js)
- `spawnZombieAt(type, x, y)` (game.js — at-position spawn used for hive
  bursts, brood drops, etc.). If the host renames this to `spawnZombie`,
  `raid.js` finds the fallback automatically via `__resolveSpawnFn()`.

## 1. `index.html` script tag

Insert **after** `bases.js` and `trader.js`, **before** `render.js` so the
HUD draws can call `drawRaidBanner` / `drawRaidArrow`:

```html
<script src="squad.js"></script>
<script src="bases.js"></script>
<script src="trader.js"></script>
<script src="raid.js"></script>   <!-- NEW -->
<script src="game.js"></script>
<script src="render.js"></script>
```

`raid.js` does not reference any of these symbols at load time — only at
call time — so the tag may move later if needed.

## 2. `resetRun()` hook (game.js, around line 140)

Right after `initBases()` (from the bases.js spec):

```js
initBases();
initRaid();                         // NEW — D·03 Raid Night
```

This sets `Game.raid` to its empty default and seeds
`Game.nextRaidDay = 4` so the first raid lands on day 4.

## 3. Main tick — `updateRaid(dt)` (game.js)

Inside the main tick loop, somewhere near the existing `updateZombies(dt)`
call. Order doesn't matter much (raid spawns + end-conditions are not
order-sensitive) but **before** `updateZombies` is the natural place so
newly-spawned raid zombies get their first frame of AI same tick:

```js
updateRaid(dt);          // NEW — drip-feed raid spawns + end checks
updateSquad(dt);
updateZombies(dt);
```

## 4. `advanceDayPhase` hooks (game.js, around line 380)

`advanceDayPhase(prevPhase, newPhase)` already runs on every phase rollover.
Append two calls inside the existing `dusk` / `night` branches:

```js
function advanceDayPhase(prevPhase, newPhase) {
  if (newPhase === 'dusk') {
    setBanner(`DUSK FALLS — Day ${Game.time.day}`, 2);
    Audio.sfx.wave();
    onRaidDayDuskHook();             // NEW — show RAID INCOMING banner if today
  } else if (newPhase === 'night') {
    setBanner(`NIGHT — survive!`, 2.2);
    Audio.sfx.dead();
    onRaidDayNightHook();            // NEW — activate the raid spawn pump
  } else if (newPhase === 'dawn') {
    setBanner(`DAWN — Day ${Game.time.day} ends`, 2);
    // updateRaid() will see phase === 'dawn' and call endRaid() itself —
    // no explicit call required here.
  } else if (newPhase === 'day') {
    Game.time.day += 1;
    setBanner(`DAY ${Game.time.day}`, 2);
    Audio.sfx.wave();
    grantPerkPoint(1);
  }
}
```

The dusk hook checks `Game.time.day === Game.nextRaidDay` itself — calling
it on every dusk is fine, it no-ops on non-raid days.

## 5. HUD render dispatch — `drawRaidBanner` (render.js)

Inside the main `render()` function, **after** `drawDayNightTint()` and
**before** the HUD canvas overlays / `drawMinimap()`:

```js
// Day/night tint overlay (drawn in screen space, after restoring camera).
drawDayNightTint();

// Raid warning banner — full-width red bar, only renders during dusk on a
// raid day. No-op otherwise. Drawn before the minimap so the minimap stays
// on top.
drawRaidBanner(ctx, VIEW_W, VIEW_H);   // NEW

// Chest interaction prompt (screen-space, drawn over the world but under HUD).
drawChestPrompt();
drawWorkbenchPrompt();

// minimap top-right of canvas
drawMinimap();
```

## 6. HUD render dispatch — `drawRaidArrow` (render.js)

Right after `drawMinimap()` so the chevron sits in screen space alongside
the minimap and HUD overlays:

```js
drawMinimap();
drawRaidArrow(ctx, VIEW_W, VIEW_H, Game.camera.x, Game.camera.y);  // NEW
```

The arrow renders during the dusk warning AND during the active raid; it
no-ops otherwise.

## 7. Zombie steering override (game.js — `updateZombies`)

This is the load-bearing integration. In `updateZombies()` around line 1939,
the existing steering selects between three modes based on LOS + flow field
to the **player**. We need raid zombies to prefer the targeted base even
when the player is closer.

Find this block:

```js
    // Steering. Three modes:
    //   1) clear LOS to player -> chase directly
    //   2) flow path exists -> follow flow field around obstacles (always preferred when available)
    //   3) flow path is severed entirely -> bash through nearest wall as a last resort
    let dx, dy, mode = 'chase';
    let blocked = false;
    if (NAV.hasLOS(z.x, z.y, p.x, p.y)) {
      dx = p.x - z.x; dy = p.y - z.y;
    } else {
      const fd = NAV.flowDir(z.x, z.y);
      const cellDist = NAV.dist[NAV.cy(z.y) * NAV.cols + NAV.cx(z.x)];
      const cutOff = cellDist < 0 && !fd;
      blocked = cutOff;
      if (cutOff && Game.walls.length > 0) {
        const wall = findBashWall(z, p);
        if (wall) {
          dx = wall.x + wall.w / 2 - z.x;
          dy = wall.y + wall.h / 2 - z.y;
          mode = 'bash';
          z.bashWall = wall;
        }
      }
      if (mode === 'chase') {
        if (fd) { dx = fd[0]; dy = fd[1]; }
        else { dx = p.x - z.x; dy = p.y - z.y; }
      }
    }
```

Replace with:

```js
    // Steering. Same three modes as before. Raid zombies override `p` with
    // their base target so they march to the safehouse even when the player
    // is closer. The flow field is built around the player, so when a raid
    // override is active we bypass the flow path and steer directly toward
    // the base — the raid horde wants to mass at the wall, not chase me.
    let dx, dy, mode = 'chase';
    let blocked = false;
    // ---- D·03 raid override ----
    const __raidT = (typeof raidZombieTarget === 'function') ? raidZombieTarget(z) : null;
    if (__raidT) {
      // Direct-chase toward the base. We still allow wall-bash if the path
      // is severed: the nearest wall to the base is what we want to chew.
      if (NAV.hasLOS(z.x, z.y, __raidT.x, __raidT.y)) {
        dx = __raidT.x - z.x; dy = __raidT.y - z.y;
      } else if (Game.walls.length > 0) {
        const wall = findBashWall(z, __raidT);
        if (wall) {
          dx = wall.x + wall.w / 2 - z.x;
          dy = wall.y + wall.h / 2 - z.y;
          mode = 'bash';
          z.bashWall = wall;
        } else {
          dx = __raidT.x - z.x; dy = __raidT.y - z.y;
        }
      } else {
        dx = __raidT.x - z.x; dy = __raidT.y - z.y;
      }
    } else if (NAV.hasLOS(z.x, z.y, p.x, p.y)) {
      dx = p.x - z.x; dy = p.y - z.y;
    } else {
      const fd = NAV.flowDir(z.x, z.y);
      const cellDist = NAV.dist[NAV.cy(z.y) * NAV.cols + NAV.cx(z.x)];
      const cutOff = cellDist < 0 && !fd;
      blocked = cutOff;
      if (cutOff && Game.walls.length > 0) {
        const wall = findBashWall(z, p);
        if (wall) {
          dx = wall.x + wall.w / 2 - z.x;
          dy = wall.y + wall.h / 2 - z.y;
          mode = 'bash';
          z.bashWall = wall;
        }
      }
      if (mode === 'chase') {
        if (fd) { dx = fd[0]; dy = fd[1]; }
        else { dx = p.x - z.x; dy = p.y - z.y; }
      }
    }
```

The diff:

```diff
+    // ---- D·03 raid override ----
+    const __raidT = (typeof raidZombieTarget === 'function') ? raidZombieTarget(z) : null;
+    if (__raidT) {
+      if (NAV.hasLOS(z.x, z.y, __raidT.x, __raidT.y)) {
+        dx = __raidT.x - z.x; dy = __raidT.y - z.y;
+      } else if (Game.walls.length > 0) {
+        const wall = findBashWall(z, __raidT);
+        if (wall) {
+          dx = wall.x + wall.w / 2 - z.x;
+          dy = wall.y + wall.h / 2 - z.y;
+          mode = 'bash';
+          z.bashWall = wall;
+        } else {
+          dx = __raidT.x - z.x; dy = __raidT.y - z.y;
+        }
+      } else {
+        dx = __raidT.x - z.x; dy = __raidT.y - z.y;
+      }
+    } else if (NAV.hasLOS(z.x, z.y, p.x, p.y)) {
-    if (NAV.hasLOS(z.x, z.y, p.x, p.y)) {
       dx = p.x - z.x; dy = p.y - z.y;
     } else {
       ...
     }
```

Note: `findBashWall(z, target)` is called with a synthetic `{x, y}` instead
of `p`. Verify the signature — at the time this spec was written
`findBashWall(z, p)` only reads `p.x` / `p.y`, so passing the raid target
object is safe. If `findBashWall` ever grows additional `p.*` access, pass
`{ x: __raidT.x, y: __raidT.y, r: 12 }` so the duck-type stays compatible.

## 8. Save / load wiring (persistence.js + game.js)

In `saveGame()` add to the data object:

```js
raid: typeof saveRaid === 'function' ? saveRaid() : null,
nextRaidDay: Game.nextRaidDay,     // duplicate-stored for clarity; saveRaid()
                                   // also embeds it, so either reader works
```

In `restoreFromSave()` (game.js, after `loadBases(d.bases || [])` from the
bases.js spec):

```js
if (typeof loadRaid === 'function') loadRaid(d.raid || null);
if (typeof d.nextRaidDay === 'number') Game.nextRaidDay = d.nextRaidDay;
```

`loadRaid` calls `initRaid` itself, so no separate init is needed — but
since `initRaid` is already wired in `resetRun()` (step 2), the load
overwrites a fresh state.

Save JSON shape:

```json
{
  "raid": {
    "active": false,
    "startedDay": -1,
    "targetBaseId": null,
    "targetX": 0, "targetY": 0,
    "spawnEdge": "n",
    "spawned": 0,
    "totalToSpawn": 0,
    "bloodMoon": false,
    "queue": [],
    "nextRaidDay": 8
  },
  "nextRaidDay": 8
}
```

Note: when a raid is active at save time, the live `Game.zombies` list is
**not** persisted by `raid.js` — the existing save system doesn't persist
zombies at all. The reloaded game will have an "active" raid flag with a
drained queue and zero live raid zombies, which `updateRaid()` will treat
as the end condition and immediately call `endRaid()` on the next tick.
That's acceptable behavior — players who reload mid-raid get a clean
schedule advance.

## 9. Blood moon escalation

Already wired inside `raid.js`. The dusk hook reads `isBloodMoonTonight()`
from `trader.js`:

```js
const bloodMoon = (typeof isBloodMoonTonight === 'function') && isBloodMoonTonight();
const walkers = bloodMoon ? RAID_BLOOD_WALKERS : RAID_BASE_WALKERS;
```

When the raid day coincides with a blood moon day:

- Walker count escalates from **60 → 80** (`RAID_BLOOD_WALKERS`).
- The dusk banner reads **"BLOOD MOON RAID"** instead of "RAID INCOMING".
- The bloodMoon flag is persisted (`saveRaid`) and reset in `endRaid` after
  the raid completes.

The schedule itself doesn't snap to the blood moon — the raid simply
escalates when the two happen to align. If you want raids to **always**
align with blood moons, change `endRaid()` so the next-raid scheduling
queries `Game.time.nextBloodMoonDay` (from trader.js):

```js
// in endRaid():
const today = (Game.time && Game.time.day) | 0;
const naturalNext = today + gap;
const bloodMoonNext = Game.time && Game.time.nextBloodMoonDay;
Game.nextRaidDay = (typeof bloodMoonNext === 'number' && bloodMoonNext > today)
  ? Math.min(naturalNext, bloodMoonNext)
  : naturalNext;
```

Left out of the default module so raid cadence stays independent of the
blood moon's own roll. The integrator can enable this if playtesting shows
the two events diverging too much.

## 10. Quick verification checklist

- Survive to day 4. At dusk a red "RAID INCOMING" banner flashes across
  the top of the screen for 5 s naming a base + cardinal direction.
- A pulsing chevron appears on the edge of the HUD pointing toward that
  direction.
- At night-fall the chevron remains and a "RAID ACTIVE" notice shows.
  Zombies stream in from one edge at ~8 per second up to 62 total.
- Raid zombies (every one in this wave) ignore the player and walk
  straight at the targeted base flag, chewing through walls if blocked.
- The chevron shows a "RAID 14/62" counter that fills as zombies are
  released + killed.
- After all 62 are dead (or dawn breaks) a "RAID OVER · next in 5 days"
  notice appears and `Game.nextRaidDay` advances.
- Save mid-raid → reload: the raid cleans up on the next tick and the
  schedule advances normally.
