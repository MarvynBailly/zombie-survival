# Trader NPC + Blood Moon — integration spec

Self-contained module: `trader.js`. Adds Game.trader, Game.traderShopOpen, and `Game.time.nextBloodMoonDay`. No existing file is modified by the module itself; this doc lists every place you need to call into it.

The module is the foundation for B·04 Radio Room (radio → `summonTrader()`, early-warning → `bloodMoonForecast()`) and D·03 Raid Night (`isBloodMoonTonight()` flag). It intentionally does not couple to either of those upstream systems; they just read the exported readers.

---

## 1. Script tag in `index.html`

Insert after `bases.js` so `nearestBase()` is in scope when trader.js loads (the trader uses it to pick a walk-target). If bases.js does not exist yet, place after `squad.js` and before `game.js` — the trader uses a soft `typeof nearestBase === 'function'` check and falls back to the player position when the function isn't defined.

```html
<!-- ...existing tags... -->
<script src="squad.js"></script>
<!-- <script src="bases.js"></script>  (B·02 — once available) -->
<script src="trader.js"></script>
<script src="game.js"></script>
```

## 2. `initTrader()` + `initBloodMoon()` in `resetRun()`

`game.js` `resetRun(levelIndex)` initialises every per-run subsystem. Add the two trader inits at the end of the function, just before `setBanner('DAY 1 · ${Game.level.name}', 2)`:

```js
// (after Game.squad = []; Game.worldSurvivors = [];)
initTrader();
initBloodMoon();
```

These also clear `Game.traderShopOpen` and seed `Game.time.nextBloodMoonDay` (day 4-6).

## 3. `updateTrader(dt)` in the main tick

In `game.js`, find the main update loop (the function that calls `updateDayCycle(dt)`, `updateSquad(dt)`, etc — search for `updateSquad(dt)`). Add the trader tick right after the squad tick:

```js
if (typeof updateSquad === 'function') updateSquad(dt);
if (typeof updateTrader === 'function') updateTrader(dt);
```

This runs only when the simulation is not paused (i.e. the same gate that already skips updates when `Game.mapOpen` is true). The trader shop reuses the `Game.mapOpen` freeze, so the trader is naturally frozen while the shop is open.

## 4. Day-rollover hooks in `advanceDayPhase`

In `game.js` `advanceDayPhase(prevPhase, newPhase)`, find the `newPhase === 'day'` branch (where `Game.time.day += 1` and `grantPerkPoint(1)` are called). Append:

```js
} else if (newPhase === 'day') {
  Game.time.day += 1;
  setBanner(`DAY ${Game.time.day}`, 2);
  Audio.sfx.wave();
  grantPerkPoint(1);
  // F4d additions
  if (typeof rollNextBloodMoon === 'function') rollNextBloodMoon();
  if (typeof rollTraderArrival === 'function') rollTraderArrival();
}
```

Order matters: `rollNextBloodMoon` advances the schedule first so any banner emits before the trader notice.

## 5. `drawTrader` placement in world render

In `render.js`, find the world-render block in `draw()`. Squad is drawn between zombies and the player (look for the comment "Squad members (recruited) — drawn just before the player"). Add the trader draw call between the squad and player blocks:

```js
if (Game.squad) {
  for (const s of Game.squad) {
    if (!inView(s.x, s.y)) continue;
    drawSquadMember(ctx, s);
  }
}

// Trader (between squad and player so player silhouette stays on top).
if (typeof drawTrader === 'function') drawTrader(ctx, Game.camera.x, Game.camera.y);

// ...charger telegraph + player draw follow...
```

`drawTrader` early-returns if `Game.trader` is missing or `!active`, so it's safe to leave the call permanently.

## 6. `drawTraderShop` placement in UI overlay render

In `render.js` `draw()`, after `drawWorldMap()`. The shop overlay is drawn in screen space (after `ctx.restore()` for the camera transform). Add immediately following the existing world-map draw:

```js
if (Game.mapOpen) drawWorldMap();
if (Game.traderShopOpen && typeof drawTraderShop === 'function') {
  drawTraderShop(ctx, VIEW_W, VIEW_H);
}
```

`Game.traderShopOpen` also sets `Game.mapOpen = true` (same freeze gate as the inventory / crafting overlays), so the simulation is paused while shopping.

## 7. `drawBloodMoonTint` placement

The blood-moon tint is screen-space and goes after the world is drawn but before the HUD. In `render.js`, place it next to `drawDayNightTint()`:

```js
drawDayNightTint();
if (typeof drawBloodMoonTint === 'function') drawBloodMoonTint(ctx, VIEW_W, VIEW_H);

// Chest interaction prompt (screen-space, drawn over the world but under HUD).
drawChestPrompt();
```

The tint internally short-circuits unless `isBloodMoonTonight() && Game.time.phase === 'night'`.

## 8. E-key extension to also check `findTraderNear`

In `game.js`, find the `if (input.keys.has('e') && p.openCd <= 0) {` block. Extend the existing chest → workbench → survivor chain with a trader probe at the end (highest precedence is preserved for chests):

```js
if (input.keys.has('e') && p.openCd <= 0) {
  const chest = findChestNear(p.x, p.y, CHEST_PROMPT_RADIUS);
  if (chest) {
    openChest(chest); p.openCd = 0.4;
  } else {
    const wb = findWorkbenchNear(p.x, p.y, WORKBENCH_PROMPT_RADIUS);
    if (wb && typeof openCrafting === 'function') {
      openCrafting(wb); p.openCd = 0.4;
    } else if (typeof findSurvivorNear === 'function' && findSurvivorNear(p.x, p.y, SURVIVOR_RECRUIT_RADIUS)) {
      const sv = findSurvivorNear(p.x, p.y, SURVIVOR_RECRUIT_RADIUS);
      if (sv) { recruitSurvivor(sv); p.openCd = 0.4; }
    } else if (typeof findTraderNear === 'function') {
      const tr = findTraderNear(p, 50);
      if (tr) { openTraderShop(); p.openCd = 0.4; }
    }
  }
}
```

Also: when the shop is already open, pressing E should close it (consistent with the workbench overlay). In `ui.js` (or wherever the E "close while open" logic lives — search for `// Toggle the workbench overlay closed when E is pressed`), add a parallel branch:

```js
if (Game.traderShopOpen) { closeTraderShop(); return; }
```

## 9. Mouse-click routing when `Game.traderShopOpen`

In `game.js` (or `ui.js`, wherever the canvas `mousedown` is wired — likely near the existing pause / map-click handlers), gate the normal weapon-fire path on `!Game.traderShopOpen` and route to the shop handler first:

```js
canvas.addEventListener('mousedown', (e) => {
  // ...existing pause / mute checks...
  if (Game.traderShopOpen && typeof handleTraderShopClick === 'function') {
    const rect = canvas.getBoundingClientRect();
    const mx = (e.clientX - rect.left) * (VIEW_W / rect.width);
    const my = (e.clientY - rect.top) * (VIEW_H / rect.height);
    handleTraderShopClick(mx, my);
    return;
  }
  // ...existing fire / place / etc...
});
```

The handler returns `true` for any click while the modal is open, swallowing it so shots don't leak through. Also add an Esc-close branch wherever the global keydown sees Esc:

```js
if (Game.traderShopOpen) { closeTraderShop(); e.preventDefault(); return; }
```

## 10. Save / load wiring

In `persistence.js` `saveGame()`, splice trader state into the saved blob:

```js
const data = {
  // ...existing fields...
  trader: (typeof saveTrader === 'function') ? saveTrader() : null,
};
```

In `restoreFromSave(d)` in `game.js` (after the squad/worldSurvivors restore), call:

```js
if (d.trader && typeof loadTrader === 'function') loadTrader(d.trader);
```

Bump `SAVE_VERSION` in `constants.js` by 1 so older saves are invalidated (saves stomp blood-moon scheduling) — pick the bump in coordination with whichever F4 sibling lands next.

## 11. Items inventory — note for the integrator

The trader sells `bandage` and `antibiotic` (already in `ITEMS`), `pistol_mag` and `shotgun_shells` (these match `CRAFT_RECIPES` ids — `buyFromTrader` falls through to the recipe `apply(p)`, so they work even though they're not registered as inventory items), and `base_flag`, `fuel_can`, `battery` (NOT yet registered).

Resolution required by the integrator:

- `base_flag` must come from B·02 Bases / `bases.js`. **Do not duplicate the definition in `items.js`.** When B·02 lands, it should register `base_flag` in `ITEMS` (or expose its own delivery path that the integrator wires into trader.js — e.g. an additional dispatch case in `buyFromTrader`).
- `fuel_can` and `battery` are placeholders for future power / generator features. Once Power System (C·xx) lands, register them in `ITEMS` with appropriate icons and use semantics; until then attempting to buy them will surface a "(fuel_can not registered yet)" notice and refund the player.

The module deliberately surfaces a soft notice rather than crashing so partial integrations don't brick the trader.

## 12. Sanity checklist

- [ ] `initTrader()` + `initBloodMoon()` fire on every `resetRun()`.
- [ ] `updateTrader(dt)` runs once per simulation tick.
- [ ] `rollTraderArrival()` and `rollNextBloodMoon()` fire on the `'day'` branch of `advanceDayPhase`.
- [ ] `drawTrader` is called inside the camera transform block (between squad and player).
- [ ] `drawTraderShop` and `drawBloodMoonTint` are called in screen space.
- [ ] E key probes trader after chest / workbench / survivor.
- [ ] Mouse clicks route to `handleTraderShopClick` when `Game.traderShopOpen`.
- [ ] Esc and E both close the shop.
- [ ] `saveTrader()` blob is in saved games; `loadTrader(d.trader)` restores it.
- [ ] `SAVE_VERSION` bumped.
