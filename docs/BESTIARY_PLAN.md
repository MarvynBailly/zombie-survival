# Bestiary Expansion — Implementation Plan

This doc is the source of truth for the bestiary + bosses build. Source brainstorms:
`ideas/Enemies Brainstorm.html`, `ideas/Bosses Brainstorm.html`.

## Codebase landmarks (read these before editing)

- `constants.js` — TILE_SIZE, OBSTACLE_HP, DAY_PHASES, save key/version.
- `defs.js` — `WEAPONS`, `ZOMBIES` (every enemy lives here), `LEVELS`.
- `game.js` — main loop, `pickZombieType`, `buildZombieInstance`, `spawnZombieAt`, `spawnZombieAtEdge`, `updateZombies`, `killZombie`, `dealDamageToZombie`, `activateChunkIfNeeded`, `spawnPuddle`.
- `bestiary.js` — `window.ZBestiary.draw[type]` map of sprite fns. Each fn: `(ctx, z)`.
- `sprites.js` — `drawZombie` dispatcher (lines ~681–703). Tries `ZExpand.draw<Type>`, then `ZBestiary.draw[type]`, then a small switch for legacy types.
- `world.js` — POI emitters, `garrison(type, x, y)` sink that adds chunk-bound spawns.
- `render.js` — drawing entry. UI overlays go through `ui.js`.
- `ui.js` — HUD bars, banners, menus.

## Existing zombie schema (`buildZombieInstance` in game.js ~line 416)

A `z` instance is `{...def, type, x, y, r, hp, maxHp, speed, damage, color, score, isFire, onFire, hitCd, stunned, vx, vy, angle, walkPhase, fireCd, spawnT, callT, walkSpawnT, raiseT, childrenAlive, chargeState, chargeT, chargeCd, chargeDx, chargeDy, mimicOpen, segments, segmentHps, bashWall, blocked}`.

Adding a new enemy type:
1. Add an entry to `ZOMBIES` in `defs.js` (any extra flags spread onto every instance via `...def`).
2. Add `draw<Name>` function to `bestiary.js`, register on `window.ZBestiary.draw['name']`.
3. Add a line to `pickZombieType` in `game.js` if it should edge-spawn from the spawn director.
4. If POI-bound, emit via `sinks.garrison('name', x, y)` in `world.js`.
5. If new behavior needed, branch on the flag inside `updateZombies` or `dealDamageToZombie` / `killZombie`.

## Phases

### Phase 0 — Foundations (must come first)

Everything below relies on these. One agent owns this phase.

**F1 — Faction tag.** Add `z.faction` to `ZOMBIES` defs (default `'zombie'`). Add `factionHostility[a][b] -> bool` table in `defs.js`:
- `zombie` is hostile to: `player`, `raider`, `wildlife`.
- `raider` hostile to: `player`, `zombie`.
- `cultist` hostile to: `player`. Neutral to `zombie`.
- `wildlife` hostile to: `player`, `zombie`. Neutral to `raider`.
- `player` faction unused (player is special-cased).

In `updateZombies`, when picking a target, scan `Game.zombies` (and later `Game.npcs`) for the closest hostile faction member; fall back to the player only if that faction targets the player. Today every zombie targets the player — add a `targetOf(z)` helper that returns `{x, y, ref}` or null. Update melee/contact damage to apply against the target, not always the player.

**F2 — Player infection %.** Add `player.infection = 0` (0–100). Decays 0.3/s when no recent infection source. Death at 100. Add HUD bar to `ui.js` directly under HP. Save-state into `persistence.js`. Flag: `z.infectionOnHit` (number, % added) — set on spitter/bloater hits and on certain new enemies.

**F3 — Boss arena + phase framework.** New module pattern: when a boss spawns, set `Game.bossArena = { cx, cy, radius, walls: [], phases, hpAtStart, name, ref }`. On engage (player crosses arena radius), erect ring walls (use existing player-wall code with non-destructible HP). On death, drop walls. `phases` is an array of `{ atHpPct: 0.66|0.33, onEnter: (boss) => void }`. Renderer (`render.js`) draws a top-center boss healthbar + nameplate when `Game.bossArena` exists. Boss flag: `def.boss = true`.

### Phase 1 — Horde behaviors

- **1.1 C·01 Pack Flanking.** When ≥5 same-faction zombies within 200px of the player, deterministically tag 30% with `flankSide ∈ {-1, +1}` (use stable hash of `z` index). Add lateral offset to seek vector based on perp of player-direction.
- **1.2 C·04 Sire Call.** In `pickZombieType` when picking `walker`, 1-in-12: set `isSire=true`. Sprite override: red shoulder cloth (or red eye glow). On `killZombie`, if `isSire`, emit a short screech radius FX and schedule 4 `spawnZombieAtEdge('walker')` over 8s.
- **1.3 C·02 Stampede.** Per tick, scan spatial hash. Group of 8+ walkers within 4 tiles of each other → group `momentum` counter (kept on a synthetic group key). At cap, set `speed *= 1.6` + `breaksWalls: true` for 4s. Walls take 1 dmg per contact tick; tier-1 wood walls (HP 80) gate at ~10 hits.

### Phase 2 — Sprite-only enemies

Each: defs entry + draw fn + `pickZombieType` line. Use existing flags where possible.

- **2.1 Juggernaut** — `hp: 350, speed: 35, damage: 22, radius: 22, frontDR: 0.95, frontDRAngle: π, faction: 'zombie'`. Sprite: walker with riot-armor plates welded over front/sides; back exposed. Day 8+.
- **2.2 Leapers** — `hp: 60, speed: 110, damage: 12, radius: 11, canLeap: true, leapDist: 80, leapCd: 3.0`. In `updateZombies`, when path blocked by wall and `leapCd<=0`, arc over (set `ignoreCollision=true` for 0.3s, lerp position). Day 5+.
- **2.3 Thorn Husk** — `hp: 90, speed: 0, damage: 25, radius: 14, stationary: true, disguised: true, ambushBite: 25, triggerR: 50, bleedOnHit: { dps: 4, sec: 5 }, biome: 'forest'`. Disguise sprite = tree. Garrison-place in forest POIs.
- **2.4 Plague Rats** — `hp: 6, speed: 100, damage: 1, radius: 5, swarm: true, infectionOnHit: 1, poiOnly: true`. Spawn director: when `swarm` flagged type rolled, emit cluster of 8 within 60px. Limit to basement/sewer chunks.
- **2.5 Stag** — `hp: 200, speed: 60, damage: 25, radius: 17, faction: 'wildlife', charge: { speed: 320, stunMs: 1000, telegraph: 0.8, cooldown: 4.0, range: 500 }, dropsAntler: true`. One per forest zone per run (track in save: `Game.flags.stagsSlain[zoneKey]`). Drops `item_antler`. Reuse charger AI branch.

### Phase 3 — Mechanic enemies

- **3.1 Ember Walker** — `hp: 75, speed: 65, damage: 8, radius: 14, leavesFire: true, biome: 'desert'`. In `updateZombies`, every 0.3s call `spawnPuddle(z.x, z.y, 28, 2, 'fire')`. Existing puddle DPS handles damage to player + zombies.
- **3.2 Apex Predator** — `hp: 700, speed: 100, damage: 35, radius: 18, boss: false, soundAggro: true, dropsTrinket: true`. Once per save, night phase only, after `Game.outsideCoverT > 360s`. Tracks gunfire range over LOS. Save flag `apexSpawned`. Drops unique trinket pickup.
- **3.3 Ice Wraith** — `hp: 90, speed: 65, damage: 12, radius: 13, phaseCd: 10, biome: 'highland'`. On cd, skip 1 wall collision check + render at α=0.4 for 1s. Flamer hit → set `phaseCd: Infinity` for 8s (solid). Reuse `wraith.ignoresWalls` plumbing.
- **3.4 Burrowers** — `hp: 70, speed: 80, damage: 18, radius: 12, buried: true, surfaceCd: 6, biome: 'desert'`. While buried: `invulnerable=true`, sprite is dust mound, can move through obstacles. Surfaces for 1.5s, bites in cone, resubmerges.

### Phase 4 — Terrain-coupled

- **4.1 Swimmers** — `hp: 80, speed: 90, damage: 15, radius: 13, swimmer: true, biome: 'water'`. Garrison-allowed on shallow water tiles. While in water: `submerged: true`, render as ripple, `invulnerable=true` until player within 90px. Surfaces and lunges.
- **4.2 Swamp Lurker** — `hp: 100, speed: 0, damage: 10, radius: 14, disguised: true, triggerR: 80, grab: { pullDist: 4*TILE_SIZE, dur: 0.6 }, biome: 'swamp'`. Disguise = reed cluster. On player within 3 tiles, rear up and grab — set `player.grabbedBy = z` for 0.6s, lerp player toward lurker.
- **4.3 Rabid Pack** — `hp: 35, speed: 140, damage: 12, radius: 10, faction: 'wildlife', packLeader?: true`. Spawn director: when wildlife roll triggers, emit pack of 3–5 at suburban POI. Reuse C·01 flanking. Killing tagged leader → 30s scatter (`fleeUntil` timestamp).
- **4.4 Crows** — `hp: 25, speed: 180, damage: 8, radius: 8, airborne: true, divesEvery: 4, screenBlurOnHit: 1`. New flag `airborne`: skip wall/obstacle collision, skip melee weapons (chainsaw/charger), shadow drawn beneath. Dive on 4s cycle. Hits trigger 1s CSS filter `blur(2px)` on the canvas.

### Phase 5 — Humans

Needs Phase 0 faction system. Humans are NPCs that live on `Game.npcs` (separate array — they need shooting AI distinct from zombie melee path).

- **5.1 Raiders** — New POI emitter `raider_camp` in `world.js`: fenced 14×10 lot with 4–8 raiders. AI states: patrol → alert → engage. Cover-seeking (find nearest prop with collide-blocker within 200px of target, hold its angle). Weapons: `pistol`/`shotgun`/`smg`. Drops: tier-locked weapon + ammo. On all dead, camp becomes safehouse candidate (`Game.safehouses.push`).
- **5.2 Looters** — `hp: 60, speed: 200, faction: 'raider', noShoot: true`. When player enters a chunk with a sealed chest, 30% chance to spawn 1 looter that beelines to the chest. If they reach it before player: chest empties. If killed first: drop the contents.
- **5.3 Cultists** — `hp: 50, speed: 90, damage: 18, faction: 'cultist', meleeOnly: true, selfInfectAt: 0.3`. Below 30% HP, self-infect → `respawnAs('charger')`. Spawn at forest altar POI (new kind).
- **5.4 The Bounty** — Singleton NPC. Spawns once per run at random distance. `hp: 200, weapon: 'rifle' (hitscan ~80dmg, 800 range), repositionCd: 8`. Compass shows red blip. Save state.

### Phase 6 — World Bosses

All use Phase 0 arena. `def.boss = true`. Add to `pickZombieType` only as bossOnly path (not edge-spawned — POI-bound).

- **6.1 Nursery** — Stationary 6 sacs + heart in 6×6 chamber. Sac timer 90s → spawns Brood Mother. Heart armored until 3 sacs dead. Phases at 66/33% heart HP.
- **6.2 Witness Tree** — Stationary tree. 30-tile aura spawns Thorn Husks + Bloaters every 8s. Burn the eye (flamer hits = real damage, others = grazing) to break. Forest POI.
- **6.3 Leviathan** — Aquatic. Swims a circular path around a pier POI. Surfaces 3 times per phase; beaches itself on phase 3. Needs Phase 4 Swimmers.
- **6.4 Colossus** — XL, 4 phases (4 weak points = 4 eye clusters + heart). Each phase = 800 HP. 20-tile spawn aura every 10s. Region perk on kill: −15% spawn rate in that region for the save. Persist permanently.

### Phase 7 — Tier-2 Bosses (Humans + Hunts + Mechanic)

12 bosses. Spawn 3 parallel agents (one per sub-cluster).

**Human bosses** (need Phase 5):
- B·01 Warlord — at largest raider camp after 3 camp kills. +3 lieutenants. Named LMG drop.
- B·02 Prophet — cult altar. 3 miracles on cd.
- B·03 Patient Zero — hospital POI. Syringe gun (+30% infection on hit).
- B·04 General — airport POI. 3-phase arena (runway/tower/hangar).

**Hunts:**
- C·01 White Stalker — after 10 stalker kills. Tracks across save. <50% HP only.
- C·02 Old Charger — daily route. Unstoppable dash breaks props.
- C·03 Bleeder — flees, leaves blood trail; lair fight 5 zones away.
- C·04 Wanderer — elite Reaper, appears at events.

**Mechanic:**
- D·01 Puppeteer — controls all walkers in 30-tile radius.
- D·02 Mirror — every hit you land returns as delayed projectile.
- D·03 Phase — 2s cycle solid↔ghost. Bullets land solid, melee lands ghost.
- D·04 Hivemind — 12 walkers, shared HP pool.

### Phase 8 — Meta

- **E·01 Named Bosses.** Procedural roll on first spawn per seed: `name + title + 1 trait` (regen / armor / poison-ground / fast / etc.). Persist per-seed in save.
- **E·03 Scaled Variants.** Region tier (existing Chebyshev tier in `world.js`) drives Hatchling (0.5×)/Adult (1×)/Apex (1.5×+trait) variant. Visual cue: size + tint.
- **E·04 Boss Journals.** On boss kill, append entry to `Game.profile.journal[]` (boss name, day, weapon, time, attempts). New menu button: "Journal" → scrollable list.

## Conventions

- ESLint-strict. `'use strict';` at file top.
- No new files unless a phase warrants it. New enemies go in existing `defs.js` + `bestiary.js`.
- Day-gate any new edge-spawned enemy in `pickZombieType` so the early game stays approachable.
- Save format: bump `SAVE_VERSION` in `constants.js` if you persist new fields.
- Run a syntax check after each phase: `node --check game.js defs.js bestiary.js world.js render.js ui.js` (or open `index.html` and check the console).
