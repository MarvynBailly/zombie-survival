# Bot Arena — Findings, Rules, and How to Build New Bots

A single reference for the bot competition: what we've learned from running it,
the constraints every bot must obey, and the workflow for adding a new one.

For the full machine-readable API schema, see `SPEC.md`. For the prompt
template you can paste into ChatGPT / Claude / Gemini to commission a bot,
see `PROMPT.md`. This document is the human-friendly summary.

---

## 1. What is the bot arena?

A head-to-head competition for AI-designed bots that play *Outbreak*, a
top-down zombie survival game. Every bot is a single JavaScript file
implementing one function:

```js
decide(perception, api) → action
```

The harness builds a `perception` snapshot of the game state every tick
(60 Hz), hands it to the bot, then translates the returned `action` back
into game inputs (move keys, mouse aim, fire, reload, etc.). The bot
never touches the game's internals directly.

Bots are scored by **mean(final_score)** across N runs, with **mean(days
survived)** as the tiebreaker. The final score formula is:

```
final_score = in_game_score + days * 200 + floor(elapsed_seconds) * 0.5
```

where `in_game_score` accumulates `zombie.score * (1 + (day-1) * 0.15)` per
kill.

---

## 2. Tournament findings (this session)

We ran tournaments at three different time caps to draw conclusions.

### Round 1 — 35 s cap, 2 runs/bot, 10 bots

Too short to differentiate strategy from base survival. **The random bot
ranked 3rd**, beating 7 strategic bots. Three bots got **0 kills in both
runs** (sniper, scavenger, tactician — at least once).

### Round 2 — 90 s cap, 1 run/bot, 10 bots

```
1. simple        359  (10 kills)
2. tactician     327  ( 8 kills)
3. fortress      322  ( 7 kills)
4. scavenger     315  ( 7 kills)
5. demolitionist 309  ( 6 kills)
6. predictor     307  ( 6 kills)
7. marvyn        305  ( 6 kills)
8. sniper        297  ( 5 kills)
9. berserker     289  ( 4 kills)
10. random       287  ( 4 kills)
```

The simplest bot (`simple` — "shoot nearest visible zombie, kite if close")
beat every complex strategy. The supposedly aggressive `berserker` couldn't
even beat `random`. We instrumented sniper and found it was running to a POI
**~16000 px away** from spawn, outpacing all zombie spawns.

### Round 3 — 60 s cap, 3 runs/bot, 11 bots (after rewrites)

```
Rank  Bot              Mean    ±σ     Best   Notes
  1.  simple            285   ±32    327    high variance, high ceiling
  2.  random            280   ±21    309    spray-and-pray
  3.  demolitionist v2  280    ±4    284    REWRITE — lowest variance
  4.  hunter            280   ±24    311    NEW bot, mid-pack
  5.  predictor         274   ±10    285
  6.  marvyn            273   ±17    290
  7.  fortress          273    ±9    284
  8.  berserker v2      271    ±1    272    REWRITE, very consistent
  9.  scavenger         263   ±16    275
 10.  sniper (patched)  261    ±7    270    PATCHED, mid-low
 11.  tactician         249   ±11    264    over-strafes
```

### Headline lessons

1. **At day 1, reactive firing beats strategic planning.** The bot that
   fires the most accurate shots-per-second wins. Don't gate firing on
   positioning, weapon-switching, or finishing a build plan.

2. **Don't add a hard retreat radius.** Sniper v1 retreated from anything
   within 250 px → got 0–2 kills in 35 s. Even at 90 s it only managed 5
   kills. If a zombie is in your weapon's range, **fire AT it** while
   moving — don't run away.

3. **Cap POI chase distance at ~800 px.** The `nearestPOI` from perception
   can be 1000+ px away. Bots that chase distant POIs outrun the zombie
   spawn pattern and never see combat. Stay in the hunting zone.

4. **Don't switch weapon every tick.** Use hysteresis — give yourself a
   minimum dwell time (≥ 0.5 s) on the chosen weapon. Otherwise you fight
   the game's fire-cooldown reset that happens on weapon swap.

5. **Place-and-build strategies waste day 1.** Walls and barrels both
   require unlocked slots (you start with 4 walls). Fortress spent ticks
   building → 7 kills vs simple's 10. The build-up only pays off at night.

6. **Single-run scores are noise.** The same bot can swing 10 kills → 1 kill
   on consecutive runs because the world seed changes. **Rank by mean of
   ≥ 3 runs.** ±σ < 10 is consistent; ±σ > 25 is noisy.

7. **The pistol is infinite-ammo. Use it.** Several bots (demolitionist v1,
   berserker v1) treated pistol as a fallback to "save for the right shot".
   Pistol is the bread and butter at day 1; explosives are the bonus when
   they unlock.

8. **Tighter kite radius wins.** Simple kites at 140 px; bots that stayed
   farther got fewer hits per second because of travel time. 100-140 px is
   the sweet spot. Below 100 px, zombies catch up.

---

## 3. The rules (constraints)

Every bot **must** follow these rules. The competition is only fair if
every entrant plays under the same restrictions.

### File layout

- One file: `competition/bots/bot_<name>.js`.
- Wrapped in `(function () { 'use strict'; … })();` IIFE.
- Calls `Arena.register({ name, author, version, reset, decide })` exactly
  once at top level.
- The `name:` field must match the filename (e.g. `bot_foo.js` → `name:
  'foo'`). The harness uses `name` as the unique key.

### What the bot is allowed to see

Only what arrives in the `perception` parameter and what is exposed via
`api.*`. The schema is in `SPEC.md`; the headline categories:

- **`perception.self`** — your player's full state (position, hp, weapon,
  ammo per weapon, reload/fire cooldowns).
- **`perception.zombies`** — visible (viewport + LOS to player), sorted
  nearest first. Each has `type, x, y, vx, vy, r, hp, dist, angleFromSelf`.
- **`perception.chests / .pickups`** — visible in viewport.
- **`perception.walls / .obstacles / .barrels`** — within 1200 px of player
  (no viewport gate, no LOS gate — so the bot can plan around terrain it
  hasn't yet centered on screen).
- **`perception.day / .phase / .secondsToDusk`** etc. — the 4-phase day
  cycle (day → dusk → night → dawn, ≈ 4 min total).
- **`perception.score / .kills / .elapsed`** — read-only progress.
- **`perception.nearestPOI`** — undiscovered point-of-interest compass.

### Forbidden globals

The bot's `decide()` must not reference any of these:

```
Game, World, NAV, Spatial, ZOMBIES, WEAPONS, WEAPON_ORDER,
input, ctx, canvas, document, localStorage, Audio,
render, tick, renderHUD,
findChestNear, findNearestUndiscoveredPOI
```

`Arena.lintBot()` scans the bot's source on match start and warns about
forbidden references. (The lint is a soft check — comments can produce
false positives, but anything in real code will be obvious.)

### What the bot is allowed to do

Return an `Action` object every tick. Every field is optional; return `{}`
to do nothing.

```ts
Action = {
  move:        { x: number, y: number } | null,  // 2D vector, normalized
  aim:         { x: number, y: number } | null,  // world-space target point
  fire:        boolean,                          // hold left-click
  reload:      boolean,                          // press R this tick
  switchWeapon: string | null,                   // weapon slot '1'..'='
  place:       boolean,                          // press space (wall/barrel)
  interact:    boolean,                          // press E (loot chest)
};
```

The harness translates these to key presses and mouse state.

### Helpers (`api`)

Use these freely; they're available to every bot:

```ts
api.hasLOS(ax, ay, bx, by) → boolean
api.leadShot(self, target, bulletSpeed) → { x, y }    // predictive aim
api.distance(a, b) → number
api.pathfindStep(from, goal) → { x, y } | null        // routes around walls
api.isBlocked(x, y) → boolean
api.findBreakable(from, dx, dy, maxDist) → { cx, cy, kind, hp, maxHp } | null
api.weapons[key] → { bulletSpeed, bulletRange, damage, fireRate, magSize, ... }
api.zombies[type] → { hp, speed, damage, radius, score, isFire }
api.clamp, api.lerp, api.angleBetween
```

The `api` object is the same reference every tick — feel free to cache it.

### What the bot CAN store

Closure variables between ticks within a single match. Clear them in
`reset()`. The harness calls `reset()` once at the start of every match.

```js
let lastTargetId = null;
let modeStartT = 0;

Arena.register({
  name: 'mybot',
  reset() {
    lastTargetId = null;
    modeStartT = 0;
  },
  decide(perception, api) {
    // your strategy
  },
});
```

### Tournament rules

- Bots are tested on **mean of ≥ 3 runs** per bot per level.
- Score formula: `final = game_score + day * 200 + floor(elapsed) * 0.5`.
- Tiebreakers: mean days survived, then mean kills.
- A run ends when the player dies (`died`) or hits the 12-minute hard cap
  (`timeout`).
- The world seed is randomized per match (no per-bot tuning).

---

## 4. How to create a new bot

### Option A — copy the template and edit by hand

```bash
cp competition/bots/bot_template.js competition/bots/bot_mybot.js
```

Then:

1. Change `name: 'template'` → `name: 'mybot'` (must match the filename).
2. Change `author:` to whatever you want.
3. Implement `decide(perception, api)`.
4. Add a `<script src="competition/bots/bot_mybot.js"></script>` tag in
   `index.html`, **after `competition/api.js`** and before
   `competition/ui.js`.
5. Hard-reload the page.
6. Open the Bot Arena from the main menu — your bot appears in the list.

### Option B — commission an AI agent

Open `competition/PROMPT.md`. Paste its contents into ChatGPT, Claude,
Gemini, etc. along with these two files:

- `competition/SPEC.md` (the API contract — required)
- `competition/bots/bot_simple.js` (~80-line working example — reference)

The agent will return a complete `bot_<name>.js` file. Drop it into
`competition/bots/`, wire it into `index.html`, reload.

If you want differentiation across multiple agents, give each one a
**concrete strategy brief** and **tournament data** showing which
strategies under-performed. We did this in this session — see
`PROMPT.md` for the template.

### Option C — start from a working bot

The fastest path to a competitive bot is:

1. Copy `bot_simple.js` (the bot that consistently wins on day 1).
2. Add **one** upgrade you think will help.
3. Run a 3 × 60s tournament. Did it actually beat simple?
4. If yes, keep the upgrade. If no, revert.
5. Repeat.

This is how `bot_hunter` was built — simple + weapon-switch hysteresis +
finisher targeting + tighter kite. It tied simple in the final tournament
(both at 280 mean).

### Verifying a new bot

After dropping in `bot_<name>.js`:

```bash
# 1. Syntax check
node --check competition/bots/bot_<name>.js

# 2. Boot the page and check the registry
#    Open index.html, open dev console:
Arena.list();                    // should include 'mybot'
Arena.lintBot(Arena.get('mybot'));  // { ok: true, hits: [] }

# 3. Run a match
Tournament.runMatch('mybot', 0).then(console.log);

# 4. Run a tournament with all bots
Tournament.runTournament(Arena.list(), 0, 3).then(r => console.table(r.ranked));

# 5. Side-by-side comparison
#    Main menu → BOT ARENA → tick your bot + competitors → WATCH SIDE-BY-SIDE
```

---

## 5. Current bot directory

| Bot              | Author | Strategy                                              |
|------------------|--------|-------------------------------------------------------|
| `random`         | house  | Random heading + fire. Sanity check.                  |
| `simple`         | house  | Aim at nearest visible zombie, fire, kite if close.   |
| `marvyn`         | house  | 5-mode state machine (port of `bot.js`).              |
| `fortress`       | agent  | Build 3-sided wall fort, funnel zombies, mow.         |
| `sniper`         | agent  | Long-range kiter, retreat-on-near (over-travels).     |
| `berserker` v2   | agent  | Close-combat, fire-every-tick, weapon hysteresis.     |
| `scavenger`      | agent  | Loot-first early, kiter late.                         |
| `tactician`      | agent  | Circle-strafe + LOS cover.                            |
| `predictor`      | agent  | 1s lookahead on zombie positions for escape paths.    |
| `demolitionist` v2 | agent | Pistol baseline + barrels/rockets as bonus.          |
| `hunter`         | agent  | Simple + smart weapon switch + finisher targeting.    |
| `template`       | —      | Empty starting point. Copy and edit.                  |

---

## 6. Quick reference: the things that hurt bots

Patterns we saw repeatedly that produced low scores:

- **Retreat-from-far rules.** "If any zombie is within X px, retreat" — at
  X=250, sniper got 0 kills. Drop the retreat entirely or set X ≤ 100.
- **Wait-for-perfect-shot.** "Don't fire until in optimal range" — burns
  ticks the simple bot is using to shoot.
- **Chase distant POIs.** `nearestPOI.dist` can be > 1000 px. Cap at 800
  or skip when zombies are visible.
- **Detour for HP at 80%.** Only detour for health pickups when HP < 30.
- **Switch weapons every tick.** Adds fire-cooldown reset. Use hysteresis.
- **Place walls early.** Day 1 has no night pressure to justify the time
  cost. Save placement for dusk / before night.
- **Stand still kiting.** If you're aiming at a zombie within close range,
  you should still be moving perpendicular (circle-strafe), not standing.

And the things that helped:

- **Always set `action.aim` and `action.fire`** when a target is in range.
- **Use `api.pathfindStep` for ALL travel** — direct dx/dy steering walks
  into walls.
- **Use `api.leadShot`** for moving targets — bullets take time, zombies
  move.
- **Keep `decide()` short.** Every branch you add is another way to skip a
  tick of firing. The 80-line `bot_simple.js` is competitive against
  300-line strategy bots.

---

## 7. Next steps if you want to push further

- **Multi-day tournaments.** All current data is day 1 only. The night
  phase (60 s of heavy spawn pressure) is where strategy bots should
  pull ahead — fortresses and demolitionists never got to use their kit.
  Increase `_maxRunSeconds` to 240+ and re-run.
- **Per-level dispatch.** All testing was on level 0. Bots tuned for an
  open arena may flop on a corridor map.
- **Statistical significance.** 3 runs is enough to see big differences
  (>30 score points) but not for fine differentiation. Run 10+ runs for
  the final ranking of close competitors.
- **Memory between matches.** Each match resets the bot. If you wanted
  bots that *learn*, you'd need to plumb a persistent store — currently
  not supported by the spec.
