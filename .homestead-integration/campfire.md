# Campfire bonding module integration (E·02)

`campfire.js` adds a placeable campfire prop. Hold E on it at DUSK with at
least one squadmate within ~80 tiles to trigger a 90-second bonding cutscene
that pauses the world. Each participant gets +20 morale and a +15% accuracy
buff that lasts until the next day flip.

The module **never modifies existing files**. The integrator wires in:

* a script tag,
* a one-line `initCampfires()` call in `resetRun()`,
* an `updateCampfires(dt)` call in `tick(dt)`,
* a `drawCampfires(ctx, camX, camY)` call inside the world render loop,
* a `drawCampfireCutscene(ctx, w, h)` call in screen-space (after world map),
* an early-out in the E-key handler for the long-hold variant,
* a single new clause in the loop's pause check (`Game.campfireSessionActive`),
* (optional) a 1-line multiplier in the soldier's fire code in `squad.js`,
* save/load wiring.

---

## 1. Script tag (`index.html`)

Insert immediately after `squad.js`, before `game.js`:

```html
<script src="squad.js"></script>
<script src="campfire.js"></script>    <!-- add this line -->
<script src="game.js"></script>
```

`campfire.js` references: `Game`, `ITEMS`, `CRAFT_RECIPES`, `addItem`,
`removeItem`, `setNotice`, `setBanner`, `Audio`, `rand`, `inObstacle`,
`WORLD_W`, `WORLD_H`, `SQUAD_CLASS`. All exist by the time it loads.

---

## 2. Items + CRAFT_RECIPES

Already handled in-module — `campfire.js` injects `ITEMS.campfire_kit` and a
`campfire_kit` recipe into `CRAFT_RECIPES` at load time (idempotent guards
both insertions). No `items.js` edits needed.

If you'd rather hoist these into `items.js` for visibility, copy:

```js
ITEMS.campfire_kit = {
  id: 'campfire_kit', name: 'Campfire Kit', category: 'tool',
  stackMax: 4, tint: '#d28a4a',
  desc: 'Stack of logs and tinder. Place at base to build a campfire.',
};
// And the recipe:
{ id: 'campfire_kit', label: 'Campfire Kit',
  desc: 'Place at base, gather your squad at dusk for a morale & accuracy boost.',
  cost: [{ id: 'scrap', n: 6 }],
  apply(p) {
    const left = addItem(p.inventory, 'campfire_kit', 1);
    if (left === 0) setNotice('+1 campfire kit', 1.2);
    else setNotice('Inventory full — kit lost', 1.5);
  },
}
```

…then the module's guards become no-ops automatically.

---

## 3. `resetRun()` — `game.js` (after `Game.worldSurvivors = []` ~line 140)

```js
Game.squad = [];
Game.worldSurvivors = [];
initCampfires();                    // ← add this line
Game.startTime = now();
```

`initCampfires()` clears `Game.campfires`, `Game.activeCampfireSession`,
and the internal hold-timer state.

---

## 4. Main tick — `game.js` `tick(dt)` (~line 2385)

Insert after `updateSquad(dt)` so morale/buffs are sampled with up-to-date
squad state:

```js
updateSquad(dt);
updateCampfires(dt);                // ← add this line
updateBullets(dt);
```

`updateCampfires(dt)` ticks flame flicker phase, advances the active
bonding-session timer, advances the current dialogue line index, and
auto-ends the session at 90s.

---

## 5. World render — `render.js` `render()` (~line 195 inside the camera-translated block)

Render between the player-placed walls and zombies so flames are below
zombies but above ground:

```js
// player-placed walls
for (const w of Game.walls) if (rectInView(w)) ZSprites.drawWall(ctx, w);

drawCampfires(ctx, cam.x, cam.y);   // ← add this line

// zombies
for (const z of Game.zombies) if (inView(z.x, z.y)) ZSprites.drawZombie(ctx, z);
```

---

## 6. UI overlay dispatch — `render.js` end of `render()` (~line 297)

Draw AFTER the world map check so the cutscene stacks above everything else
in screen space:

```js
if (Game.mapOpen) drawWorldMap();
if (Game.activeCampfireSession) {                  // ← add these 3 lines
  drawCampfireCutscene(ctx, canvas.width, canvas.height);
}
```

(`ctx` and `canvas` are the same ones used by the rest of `render()`. If the
local var is called `c`/`screen`/etc, swap accordingly.)

---

## 7. E-key (long-hold variant) — `game.js` (~line 733)

The existing E logic is a one-shot tap. We want a 1-second hold while
standing on a campfire at dusk; otherwise the existing behavior runs.

`campfireTryInteract(player, eHeld, dt)` returns true while a hold is in
progress (started, charging, or completed this frame). When it returns true,
**skip the rest of the E-key flow** so we don't also trigger chest/workbench
interactions.

Replace the existing block:

```js
if (input.keys.has('e') && p.openCd <= 0) {
  const chest = findChestNear(p.x, p.y, CHEST_PROMPT_RADIUS);
  if (chest) { ... }
  ...
}
```

with:

```js
const eHeld = input.keys.has('e');
// Long-hold variant: 1s hold on a campfire at dusk → bond session.
if (typeof campfireTryInteract === 'function' && campfireTryInteract(p, eHeld, dt)) {
  // hold flow consumed the keypress; skip chest/workbench/recruit
} else if (eHeld && p.openCd <= 0) {
  const chest = findChestNear(p.x, p.y, CHEST_PROMPT_RADIUS);
  if (chest) {
    openChest(chest);
    p.openCd = 0.4;
  } else {
    const wb = findWorkbenchNear(p.x, p.y, WORKBENCH_PROMPT_RADIUS);
    if (wb && typeof openCrafting === 'function') {
      openCrafting(wb);
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
if (p.openCd > 0) p.openCd -= dt;
```

`campfileTryInteract` only "consumes" E if the player is in range of a
campfire AND it's dusk AND that fire hasn't bonded yet today — so any other
state falls through to normal E behavior (chest, workbench, recruit).

### Placing a campfire kit from the inventory

If your right-click-to-use path in `items.js` already runs `ITEMS[id].use(p)`,
the campfire kit is a **tool**, not a consumable, so it won't be used that way
by default. Add a hotkey or context-menu action that calls:

```js
placeCampfire(p.x + Math.cos(p.angle) * 30, p.y + Math.sin(p.angle) * 30, p);
```

…when the active inventory slot is a `campfire_kit`. (The crafting recipe
itself just adds the kit to inventory; the player picks where to drop it.)

---

## 8. Pause gate — `ui.js` `loop(t)` (~line 10)

The world-map gate already exists. Add `!Game.campfireSessionActive` so the
bonding cutscene also freezes the sim. **Cosmetic ticks** (flame flicker, line
advance) are still updated because `updateCampfires(dt)` is inside `tick()` —
but here's the catch: `tick()` is itself gated by this check. To keep the
session timer + line advance running during the pause, we move
`updateCampfires(dt)` to the loop **outside** the gated tick.

Final shape:

```js
function loop(t) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  // Game advances only while in 'playing' mode AND no overlay pause.
  if (Game.mode === 'playing' && !Game.mapOpen && !Game.campfireSessionActive) {
    acc += dt;
    while (acc >= TICK_DT) {
      tick(TICK_DT);
      acc -= TICK_DT;
    }
  } else {
    acc = 0;
    // Tick only the campfire session so its timer + dialogue advances
    // while the rest of the world is frozen.
    if (Game.campfireSessionActive && Game.mode === 'playing') {
      updateCampfires(dt);
    }
  }
  render();
  renderHUD();
  requestAnimationFrame(loop);
}
```

…and **remove** `updateCampfires(dt)` from `tick()` in step 4 (or leave it
there — it's idempotent during the cutscene because the session-paused branch
takes the only path that advances `sess.elapsed`; the unpaused branch just
won't have a session to advance). Simplest: keep step 4 as-is and accept that
`updateCampfires` runs in `tick()` when there's no session, and in the
gated-else branch when there is.

If you want the simpler single-path version: leave `updateCampfires(dt)` in
`tick()` only, and don't gate `tick()` by `!Game.campfireSessionActive` — but
that means zombies still walk during the cutscene. Pick your tradeoff.

---

## 9. Soldier accuracy hook — `squad.js`

The soldier's per-tick fire code is in `SQUAD_CLASS.soldier.update(s, dt)`
(squad.js lines 113–139). Two reasonable hook points:

### Option A — multiply bullet damage (simplest)

The bullet pushed into `Game.bullets` carries `damage: s.damage`. Change to:

```js
// squad.js line ~134
Game.bullets.push({
  x: s.x + Math.cos(ang) * 16,
  y: s.y + Math.sin(ang) * 16,
  vx: Math.cos(ang) * 900,
  vy: Math.sin(ang) * 900,
  life: 0.8,
  damage: s.damage * (typeof survivorAccuracyMult === 'function' ? survivorAccuracyMult(s) : 1),
  owner: 'squad',
  weapon: 'pistol',
});
```

This effectively reads "+15% accuracy" as +15% bullet damage — pragmatic,
since soldier shots already auto-aim at the nearest zombie (no spread to
tighten). The `typeof` guard keeps `squad.js` working when `campfire.js`
isn't loaded.

### Option B — shorten the fire cooldown

Replace line 137:

```js
s.fireCd = (0.55 + Math.random() * 0.2) / (typeof survivorAccuracyMult === 'function' ? survivorAccuracyMult(s) : 1);
```

This makes the soldier fire 15% faster while buffed (same effective DPS bump
as A, but with a slightly different feel).

Pick one. The module exports `survivorAccuracyMult(s)` returning `1.15` if
`s.accuracyBuffUntilDay > Game.time.day`, else `1.0`.

---

## 10. Save / Load — `persistence.js`

### Save (`saveGame()`, inside the `data` literal ~line 76)

```js
worldSurvivors: ...,
campfires: typeof saveCampfires === 'function' ? saveCampfires() : null,
squadMorale: (Game.squad || []).map(s => ({
  name: s.name,
  morale: s.morale,
  accuracyBuffUntilDay: s.accuracyBuffUntilDay,
})),
```

We piggyback per-survivor morale + buff state on the existing squad entries
by storing a parallel array keyed by name. (You could also splice into the
squad save tuple — your call. Name is unique within a single run.)

### Load (`restoreFromSave(d)`)

After the squad array is rebuilt:

```js
if (typeof loadCampfires === 'function') loadCampfires(d.campfires || []);
if (d.squadMorale && Game.squad) {
  for (const entry of d.squadMorale) {
    const s = Game.squad.find(m => m.name === entry.name);
    if (s) {
      s.morale = entry.morale ?? 50;
      s.accuracyBuffUntilDay = entry.accuracyBuffUntilDay ?? 0;
    }
  }
}
```

---

## 11. Squad field migration (lazy defaults)

No retro-migration needed. `campfire.js` internally calls
`ensureCampfireSquadFields(s)` whenever it touches a squadmate — that helper
sets `s.morale = 50` and `s.accuracyBuffUntilDay = 0` if either field is
missing. Existing saves and freshly-recruited survivors pick up the fields on
first interaction with the campfire system. `survivorAccuracyMult(s)` also
calls the helper on each query, so the buff-check path is also self-healing.

---

## Exports reference

| Function                                | Purpose                                            |
| --------------------------------------- | -------------------------------------------------- |
| `initCampfires()`                       | Reset state. Call from `resetRun()`.               |
| `updateCampfires(dt)`                   | Per-tick update (flame, session timer/lines).      |
| `drawCampfires(ctx, camX, camY)`        | World-space render of placed campfires.            |
| `placeCampfire(x, y, player)`           | Place a fire and consume one `campfire_kit`.       |
| `findCampfireNear(player, radius=60)`   | E-key proximity lookup.                            |
| `tryStartBondingSession(c, player)`     | Begin a 90s session if prereqs are met.            |
| `endBondingSession()`                   | Apply buffs + close overlay (auto-called at 90s).  |
| `drawCampfireCutscene(ctx, w, h)`       | Screen-space cutscene overlay.                     |
| `damageCampfire(c, dmg)`                | Take damage; destroy at 0.                         |
| `applyAccuracyBuff(s)`                  | Sets `s.accuracyBuffUntilDay = day + 1`.           |
| `survivorAccuracyMult(s)`               | Returns 1.15 if buffed today, else 1.0.            |
| `campfireTryInteract(p, eHeld, dt)`     | Long-hold E gate; returns true if it consumed E.   |
| `saveCampfires()` / `loadCampfires(d)`  | Persistence.                                       |

## Tunables

All in `campfire.js`:

| Constant                  | Default | Meaning                                                |
| ------------------------- | ------- | ------------------------------------------------------ |
| `CAMPFIRE_HP`             | 30      | Initial / max HP of a placed fire.                    |
| `CAMPFIRE_BOND_RADIUS`    | 3200    | World units (80 tiles × 40 TILE_SIZE).                |
| `CAMPFIRE_HOLD_S`         | 1.0     | Hold time on E to start a session.                    |
| `CAMPFIRE_INTERACT_R`     | 60      | Pixel radius to consider "near" a campfire.           |
| `CAMPFIRE_SESSION_S`      | 90      | Cutscene duration.                                    |
| `CAMPFIRE_LINE_INTERVAL`  | 6       | Seconds between dialogue lines.                       |
| `CAMPFIRE_MORALE_GAIN`    | 20      | Morale awarded to each participant.                   |
| `CAMPFIRE_ACCURACY_MULT`  | 1.15    | Buff multiplier for `survivorAccuracyMult()`.         |
