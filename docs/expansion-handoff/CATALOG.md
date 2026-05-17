# CATALOG · Every new sprite, signature, stats, behavior

The complete reference. For each entry: the draw function call, the
data-table entry, the gameplay role, and the Tier-3 behavior task (if any).

---

## 1 · Weapons (×6) — `window.ZExpand`

Drawn in the player's hand pose. Each is called as `ZExpand.drawX(ctx)` from
inside `drawHeldWeapon` (local coords; +x is aim direction).

| Name | Draw fn | Tag | One-liner |
|---|---|---|---|
| Crossbow | `ZExpand.drawCrossbow(ctx)` | SILENT | High-damage bolt; pierces up to 3 zombies. Silent kills don't alert groans. |
| Flamethrower | `ZExpand.drawFlamethrower(ctx)` | CONE | Short-range stream; tags everything in cone with the burn DOT. |
| Minigun | `ZExpand.drawMinigun(ctx)` | SPIN-UP | Hold to spin up 0.6s, then dumps bullets. Slows player while firing. |
| Railgun | `ZExpand.drawRailgun(ctx)` | CHARGE | Hold to charge 1.2s, release hitscan beam that pierces everything in a line. |
| Grenade Launcher | `ZExpand.drawGrenadeLauncher(ctx)` | BOUNCE | Arcing grenade that bounces once before exploding (AoE 90, dmg 90). |
| Chainsaw | `ZExpand.drawChainsaw(ctx)` | MELEE | Continuous damage in forward cone; ignores Riot armor. |

### Stats — paste into `defs.js`

See [`snippets/defs-additions.js`](snippets/defs-additions.js) for the full block.

### Tier-3 behaviors (per-weapon)

| Weapon | Where in `game.js` | Complexity |
|---|---|---|
| Crossbow pierce | `updateBullets` — bullet keeps going + decrements pierce count on hit | small (~15 lines) |
| Flamethrower | New branch in `fireWeapon` — spawn short-life cone particles that damage on contact | small (~25 lines) |
| Minigun spin-up | `updatePlayer` — track held-fire duration, gate damage until `>= spinUp` | small (~10 lines) |
| Railgun charge + beam | `updatePlayer` — charge meter, on release sweep a hitscan ray and damage all in line | medium (~40 lines) |
| Grenade bounce | Reuse rocket projectile, add `bounces` decrement on obstacle collision | small (~10 lines) |
| Chainsaw cone | New branch in `fireWeapon` — cone damage tick to all zombies in `meleeRange` + `meleeCone` | medium (~30 lines) |

---

## 2 · Enemies, set A (×6) — `window.ZExpand`

Animal-style threats that play with positioning + target-priority.

```
ZExpand.drawSpitter(ctx, z)
ZExpand.drawCrawler(ctx, z)
ZExpand.drawScreamer(ctx, z)
ZExpand.drawBomber(ctx, z)
ZExpand.drawRiot(ctx, z)
ZExpand.drawWraith(ctx, z)
```

where `z = { x, y, r, hp, maxHp, angle, walkPhase, onFire?, stunned? }` — the
same shape as your existing `drawWalker` / `drawRunner` / etc.

| `type:` | Name | HP / spd / dmg / r | Tag | One-liner |
|---|---|---|---|---|
| `spitter` | Spitter | 70 / 55 / 12 / 14 | RANGED | Lobs arcing acid that leaves a toxic puddle. Forces player out of cover. |
| `crawler` | Crawler | 22 / 160 / 6 / 9 | SMALL | Tiny 4-leg biter; small hitbox punishes pistol-only play. Shotguns answer. |
| `screamer` | Screamer | 45 / 70 / 0 / 13 | SUPPORT | Sonic ring buffs nearby zombies; squishy — kill first. |
| `bomber` | Bomber | 110 / 70 / 0 / 18 | SUICIDE | Sprints in, ruptures — small AoE + toxic cloud. Pop from range. |
| `riot` | Riot | 180 / 55 / 18 / 15 | ARMORED | Front shield blocks 80% damage. Must flank, explode, or saw through. |
| `wraith` | Wraith | 60 / 110 / 14 / 13 | PHASING | Ignores walls/crates — drifts through cover. Chip damage works best. |

### Tier-3 behaviors

| Enemy | Behavior | Where in `game.js` | Complexity |
|---|---|---|---|
| Spitter | `ranged: true` — fire on cooldown when in `range`, projectile carves a damaging puddle on impact | `updateZombies` + new `updateZombieProjectiles` | medium |
| Crawler | Use existing AI; just a small radius — works out of the box | — | none |
| Screamer | Aura — any zombie within `auraR` gets +50% speed; visualized by the pulsing ring (already in sprite) | `updateZombies` | small |
| Bomber | `onDeathExplode` — if killed, call `explodeAt(z.x, z.y, 80, 50)` | `killZombie` | small |
| Riot | `frontDR: 0.8` — when hit, compute angle of bullet vs zombie facing; if within ±60°, multiply damage by 0.2 | `damageZombie` | medium |
| Wraith | `ignoresWalls: true` — skip the `resolveCircleRect` pass for this zombie | `updateZombies` | small |

---

## 3 · Enemies, set B (×14) — `window.ZBestiary`

Spawners, mini-bosses, specialists. Indexed by short id on `ZBestiary.draw`:

```
ZBestiary.draw.cluster(ctx, z)     // Infection Cluster (stationary)
ZBestiary.draw.hivesac(ctx, z)     // Hive Sac (stationary)
ZBestiary.draw.shrieker(ctx, z)    // Shrieker (stationary)
ZBestiary.draw.brood(ctx, z)       // Brood Mother (mini-boss)
ZBestiary.draw.necro(ctx, z)       // Necromancer
ZBestiary.draw.charger(ctx, z)     // Charger
ZBestiary.draw.reaper(ctx, z)      // Reaper
ZBestiary.draw.stalker(ctx, z)     // Stalker
ZBestiary.draw.bloater(ctx, z)     // Bloater
ZBestiary.draw.frost(ctx, z)       // Frost Walker
ZBestiary.draw.mimic(ctx, z)       // Mimic (z.angle = open factor 0..1)
ZBestiary.draw.cent(ctx, z)        // Centipede (z.segments = N, default 7)
ZBestiary.draw.hatch(ctx, z)       // Hatchling
ZBestiary.draw.twins(ctx, z)       // Conjoined Twins
```

| `type:` | Name | HP / spd / dmg / r | Tag | One-liner |
|---|---|---|---|---|
| `cluster` | Infection Cluster | 280 / 0 / 0 / 28 | SPAWNER | Stationary biomass with glowing toxic core. Spawns Hatchlings every 4s; tendrils heal it. |
| `hivesac` | Hive Sac | 40 / 0 / 0 / 18 | EGG-BURST | Cluster of 6 eggs; killing it scatters 5 Hatchlings outward. |
| `shrieker` | Shrieker | 50 / 0 / 0 / 20 | ALARM | Mouthed plant; opens every 2s and roars to spawn walkers from world edge. |
| `brood` | Brood Mother | 400 / 35 / 22 / 26 | MINI-BOSS | Bloated multi-armed; drops crawlers as she walks. |
| `necro` | Necromancer | 90 / 60 / 0 / 15 | SUPPORT | Stays at back; every 6s raises a recently killed zombie at half HP. |
| `charger` | Charger | 150 / 60 (320 charge) / 25 / 17 | LINE-DASH | Telegraph, then bull-rush in a straight line. Stuns 1s on hit. |
| `reaper` | Reaper | 110 / 70 / 25 / 14 | LONG-MELEE | Gaunt with 60-unit scythe-arm reach — hits over crates. |
| `stalker` | Stalker | 50 / 130 / 18 / 13 | CLOAKED | Invisible past 150px; only eyes + dashed outline give it away. |
| `bloater` | Bloater | 200 / 45 / 6 / 22 | GAS-AURA | Walking 60-unit gas cloud ticking 3 dps. Death cloud lingers. |
| `frost` | Frost Walker | 80 / 60 / 8 / 14 | CC | Each hit chills player 40% for 2.5s. Stacks. |
| `mimic` | Mimic | 90 / 0 / 30 / 12 | TRAP | Looks like a pickup. Bites for 30 if player walks close. |
| `cent` | Centipede | 600 / 90 / 35 / 18 | BOSS | 7 segments; each killable; head weakest, tail hardiest. |
| `hatch` | Hatchling | 12 / 180 / 4 / 7 | MICRO | Tiny one-eyed crawler-spawn. Dies in one pellet but comes in numbers. |
| `twins` | Conjoined Twins | 130 / 60 / 12 / 16 | SPLIT | On death, splits into 2 walkers at 50% HP each. |

### Tier-3 behaviors

| Enemy | Behavior | Where in `game.js` | Complexity |
|---|---|---|---|
| Infection Cluster | Stationary spawner loop — `spawnInterval` countdown, cap at `spawnCap` live Hatchlings tied to this cluster. Tendril heal: regen 1 hp/s per live defender. | new `updateStationarySpawners` | medium |
| Hive Sac | `burstOnDeath` — in `killZombie`, if set, spawn N of `type` in a star burst | `killZombie` | small |
| Shrieker | `callsHorde: true` — every `callInterval`, spawn a walker at nearest world edge | `updateStationarySpawners` | small |
| Brood Mother | `spawnsOnWalk` — when this enemy moves and `spawnEvery` elapsed, drop a crawler at its position | `updateZombies` | small |
| Necromancer | `raisesNearby` — track recent corpses, every `raiseInterval` revive the nearest at half HP | `updateZombies` | medium |
| Charger | `charge: {speed, stunMs, telegraph}` — three-state AI: locking-on → charging-line → recovering. Stun player on contact. | `updateZombies` with state machine | medium |
| Reaper | `meleeReach: 60` — use this instead of `r + p.r` in the contact damage check | `updateZombies` | small |
| Stalker | `cloaked: true` — already drawn cloaked; AI: still moves; player UI hides direction past `revealDist` | `updateZombies` + `render.js` minimap | small |
| Bloater | `gasAura` — tick `dps` to player if inside; `deathCloud` on death spawns a `puddle` entity | `updateZombies` + `killZombie` | medium |
| Frost Walker | `chillOnHit` — when this enemy hits player, set `player.chilledUntil = now + ms` and apply speed mult | `damagePlayer` | small |
| Mimic | `disguised: true` — draw as a pickup-looking sprite; when player approaches within trigger distance, "open" (set z.angle → 1) and damage on contact | `updateZombies` | medium |
| Centipede | `segmented: 7` — store array of segment HPs on the zombie. Only front segment takes damage; head death = full death. | `damageZombie` + draw loop | medium |
| Hatchling | Walker AI works as-is | — | none |
| Conjoined Twins | `onDeathSplit` — in `killZombie`, if set, spawn N walkers at z.x,y with `hpPct` of max | `killZombie` | small |

---

## 4 · Blocks (×9) — `window.ZExpand`

Static obstacles. Called as `ZExpand.drawX(ctx, o)` from `drawObstacle`.

```
ZExpand.drawJersey(ctx, o)      // Jersey concrete barrier
ZExpand.drawSandbags(ctx, o)    // Sandbag wall
ZExpand.drawCarWreck(ctx, o)    // Car wreck (chains with barrels)
ZExpand.drawContainer(ctx, o, {alt: false})  // Shipping container (alt=color swap)
ZExpand.drawDumpster(ctx, o)    // Dumpster
ZExpand.drawFence(ctx, o)       // Chainlink + razor-wire fence (thin)
ZExpand.drawFuelPump(ctx, o)    // Gas pump (chains with barrels, BIG explosion)
ZExpand.drawPallet(ctx, o)      // Pallet stack
ZExpand.drawToxicDrum(ctx, o)   // Barrel variant — leaves slime puddle
```

Use either by setting `o.kind` and letting the dispatch route it, or by calling
directly. See `snippets/sprites-dispatch.js`.

| `kind:` | Name | HP | Tag | Notes |
|---|---|---|---|---|
| `Jersey` | Jersey Barrier | 220 | CONCRETE | Modular; bullets don't pass. Hazard stripes. |
| `Sandbags` | Sandbag Wall | 140 | SOFT | Erodes visibly with damage. |
| `CarWreck` | Car Wreck | 300 | PARKING | Flammable — chains with barrel explosion. |
| `Container` | Shipping Container | ∞ | INDUSTRIAL | Indestructible. Two color variants (`alt: true`). |
| `Dumpster` | Dumpster | 180 | URBAN | Mid-cover. Lid splits down middle. |
| `Fence` | Chainlink + Wire | 60 | THIN | Bullets pass through. Razor wire on top. |
| `FuelPump` | Fuel Pump | 40 | EXPLODES | AoE 140 (vs barrel's 120). Chains. |
| `Pallet` | Pallet Stack | 90 | WAREHOUSE | Cheap cover — splinters fast. |
| `ToxicDrum` | Toxic Drum | 30 | BARREL VAR. | Same as barrel + 4s toxic puddle DOT. |

---

## 5 · Props (×37) — `window.ZProps`

Furniture and world dressing. Drawn with `(ctx, o)` — `o = {x, y, w, h}`.

Indexed by short id on `ZProps.draw`:

| Category | `kind:` strings |
|---|---|
| LIVING | `sofa, armchair, coffee, bookshelf, tvstand, rug` |
| BEDROOM + BATH | `bed, nightstand, dresser, wardrobe, toilet, bathtub` |
| KITCHEN | `fridge, stove, counter, table, chair, island` |
| WORK / OFFICE | `desk, ochair, cabinet, copier, whiteboard, cooler` |
| PUBLIC + RETAIL | `vending, cart, bench, trash, mailbox, bus` |
| WORLD + HAZARDS | `plant, bush, fountain, ebox, manhole, generator, hydrant` |

Example call:

```js
ZProps.draw.sofa(ctx, { x: 100, y: 100, w: 116, h: 56 });
ZProps.draw.fridge(ctx, { x: 200, y: 50, w: 56, h: 80 });
ZProps.draw.fountain(ctx, { x: 400, y: 400, w: 88, h: 88 });
```

For each prop, `ZProps.CATALOG` contains the recommended default size, hp,
tag, and a one-line description. Iterate it to learn dimensions:

```js
for (const [cat, c] of Object.entries(ZProps.CATALOG)) {
  for (const item of c.items) console.log(item.id, item.name, item.w, item.h, item.copy);
}
```

### Highlights (which props do special things)

| Prop | Special |
|---|---|
| `tvstand` | Renders a blue screen-glow halo. |
| `stove` | One front burner is lit (small blue glow). |
| `nightstand` | Warm radial glow halo — read as a working lamp. |
| `vending` | "SOLD OUT" sticker on front by default. |
| `copier` | "JAMMED" sticker, pulsing green status LED. |
| `ebox` | Sparks above + faint blue glow — meant to be a hazard. |
| `manhole` | Steam wisp rising — optional spawn portal. |
| `generator` | Strapped gas can on side; explode-on-death behavior. |
| `hydrant` | Shooting it triggers a knockback water-spray gameplay event. |

---

## 6 · How to wire everything up

See:

- [`snippets/sprites-dispatch.js`](snippets/sprites-dispatch.js) — three small patches to `sprites.js`
- [`snippets/defs-additions.js`](snippets/defs-additions.js) — copy-paste `WEAPONS` + `ZOMBIES` entries
- [`snippets/world-gen-examples.js`](snippets/world-gen-examples.js) — how to scatter props/blocks via `world.js`
- [`examples/preview.html`](examples/preview.html) — open this to see everything render before integrating

---

## 7 · Working offline / outside the game

The three sprite files have **zero dependencies**. You can load them in any
HTML page and call the draw functions directly:

```html
<script src="sprites/expansion.js"></script>
<script src="sprites/props.js"></script>
<script src="sprites/bestiary.js"></script>
<canvas id="c" width="400" height="300"></canvas>
<script>
  const ctx = document.getElementById('c').getContext('2d');
  ZProps.draw.sofa(ctx, { x: 50, y: 50, w: 116, h: 56 });
  ZBestiary.draw.cluster(ctx, { x: 250, y: 150, r: 30, hp: 200, maxHp: 280, angle: 0, walkPhase: 0.3 });
</script>
```

(`examples/preview.html` is a full version of this.)
