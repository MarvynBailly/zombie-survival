# Weather module integration

`weather.js` is the F4a foundation module. It owns `Game.weather` plus its own
local particle pool and is the source of truth other modules (D·02 Decay, B·02
Garden) read from. The module is self-contained — these edits hook it into the
existing game.js / render.js / persistence.js / ui.js without touching the
weather module itself.

## 1. Script tag (index.html)

Add the script after `perks.js` and before `squad.js` (no hard dep, but
needs to load before `game.js`, `render.js`, and `ui.js`):

```html
<script src="perks.js"></script>
<script src="weather.js"></script>   <!-- add this line -->
<script src="squad.js"></script>
<script src="game.js"></script>
```

It only needs `DAY_LENGTH`, `VIEW_W`, `VIEW_H`, `rand`, `Game.weather`, and
`setNotice` to be defined, all of which exist after `constants.js`,
`world.js`, and `persistence.js`.

## 2. resetRun() — game.js (around line 142, after `Game.elapsed = 0`)

Add one line so every new run starts with fresh weather state:

```js
Game.elapsed = 0;
initWeather();              // <- add
Game.scoreSubmitted = false;
```

## 3. Main tick — game.js, function `tick(dt)` (around line 2393)

Call `updateWeather(dt)` once per tick. Place it next to `updateDayCycle(dt)`:

```js
updateDayCycle(dt);
updateWeather(dt);          // <- add (must run AFTER updateDayCycle so
                            //    Game.time.day has already been bumped on
                            //    the dawn→day rollover frame)
```

## 4. Day-phase rollover — game.js, function `advanceDayPhase` (around line 380)

`updateWeather` already polls `Game.time.day` and auto-rolls on change, so no
edit is strictly required. If you want the roll to fire at the *exact* phase
transition (instead of one frame later inside `updateWeather`), add:

```js
} else if (newPhase === 'day') {
  Game.time.day += 1;
  setBanner(`DAY ${Game.time.day}`, 2);
  Audio.sfx.wave();
  grantPerkPoint(1);
  rollWeatherForDay();      // <- add (optional; updateWeather will catch up otherwise)
}
```

Either approach is fine; pick one and avoid double-rolling.

## 5. drawWeatherOverlay placement — render.js, function `render(alpha)`

Weather sits over the world but under HUD-style overlays. In the current
`render()` function, the world is drawn inside a `ctx.save() / ctx.translate
(-camera) ... ctx.restore()` block (line ~98–283). The day/night tint at line
286 is the existing screen-space overlay anchor.

Insert `drawWeatherOverlay` **after `ctx.restore()` and after
`drawDayNightTint()`**, before `drawChestPrompt()` / `drawMinimap()`:

```js
ctx.restore();

// Day/night tint overlay (drawn in screen space, after restoring camera).
drawDayNightTint();

// Weather overlay (rain/fog/blizzard) — screen-space, over the tint, under HUD.
drawWeatherOverlay(ctx, VIEW_W, VIEW_H, Game.camera.x, Game.camera.y);  // <- add

// Chest interaction prompt (screen-space, drawn over the world but under HUD).
drawChestPrompt();
```

This is at approximately render.js:287.

## 6. D·02 Decay (future)

Wall decay code should multiply its per-tick decay rate by
`weatherDecayMult()`:

```js
const decay = baseDecayPerSec * weatherDecayMult() * dt;
w.hp = Math.max(0, w.hp - decay);
```

Returns `2.0` while raining, `1.0` otherwise. No further plumbing required.

## 7. B·02 Garden (future)

Plants tick their growth via a `watered` flag. The garden module should treat
`isRaining()` as a free watering pulse:

```js
// in garden tick:
if (isRaining()) plant.watered = true;
```

This lets storms substitute for the bucket interaction.

## 8. Save / Load wiring — persistence.js

### saveGame() (around line 35, inside the `data` object)

Add one field:

```js
weather: saveWeather(),
```

JSON shape (matches what `saveWeather()` returns):

```json
{
  "state": "rain",
  "intensity": 0.7,
  "durationLeft": 142.5,
  "lastRolledDay": 3
}
```

### restoreFromSave(d) — game.js (around line 275, after perk restore)

```js
loadWeather(d.weather);
```

`loadWeather(null)` is safe — it falls through to `initWeather()`, so old
saves without the `weather` field still load.

### SAVE_VERSION — constants.js

Bump `SAVE_VERSION` from `5` to `6` so old saves that don't have the weather
field are discarded cleanly (or accept the legacy field-absent path above and
leave the version alone). Recommended: bump it; the field is small but the
contract changes.

## 9. Movement slowdown hook

`Game.weather.moveMultiplier` is `0.85` during a blizzard and `1` otherwise.
The module deliberately does NOT apply it — the player/zombie integrators do.

### Player — game.js, around line 546 (just after `speed *= perkMult('speedMult');`):

```js
speed *= perkMult('speedMult');
speed *= (Game.weather && Game.weather.moveMultiplier) || 1;   // <- add
```

### Zombies — game.js, around line 1983–1985 (inside the zombie movement
block where `speedMul = z.speedBoost || 1` is set):

```js
const speedMul = (z.speedBoost || 1) * ((Game.weather && Game.weather.moveMultiplier) || 1);
z.x += vx * z.speed * speedMul * dt;
z.y += vy * z.speed * speedMul * dt;
```

### Squad — squad.js (optional, around line 254 in `updateSquad`):

```js
let speed = def.speed * ((Game.weather && Game.weather.moveMultiplier) || 1);
```

`Game.weather.reducedVision` is exposed for future zombie-AI tuning (fog
narrows aggro radius). Nothing reads it yet — the flag is just present for
the next milestone.

## 10. Constants for constants.js

Nothing **needs** to move out of `weather.js`. The probability table
(`WEATHER_PROB`) and particle caps (`RAIN_PARTICLE_CAP`, `SNOW_PARTICLE_CAP`,
`FOG_BLOB_COUNT`, etc.) live as `const` at the top of the module so they're
visible to the rest of the codebase if anyone wants to tune them.

If you prefer balance values to live in `constants.js`, copy the
`WEATHER_PROB` array there. The weather module references it by name only
inside its own file, so a hoist is a one-line change: delete the local
`const WEATHER_PROB = [...]` after constants.js declares it globally.
