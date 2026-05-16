# Outbreak · Expansion Sprite Pack

A self-contained drop-in addition for `zombie-survival/`. Hand this folder to
Claude CLI (or to a teammate) along with one instruction:

> "Integrate the sprites in this folder into the game. Follow `README.md`."

## What's in here

| Folder | Contents |
|---|---|
| [`sprites/`](sprites/) | Three plain-JS IIFE files that attach to `window`. Drop-in next to `sprites.js`. |
| [`snippets/`](snippets/) | Paste-ready code blocks for `defs.js`, `sprites.js`, and `world.js`. |
| [`examples/`](examples/) | A standalone HTML preview page that loads the sprites and renders every one. |
| [`CATALOG.md`](CATALOG.md) | Full inventory: every sprite by name + draw fn + signature + stats + design intent. **The reference doc.** |

## What you get

- **6 new weapons** — crossbow, flamethrower, minigun, railgun, grenade launcher, chainsaw
- **20 new enemies** — 6 from `expansion.js` (spitter, crawler, screamer, bomber, riot, wraith) plus 14 from `bestiary.js` (infection cluster, hive sac, shrieker, brood mother, necromancer, charger, reaper, stalker, bloater, frost walker, mimic, centipede, hatchling, conjoined twins)
- **9 new blocks** — jersey barrier, sandbags, car wreck, shipping container, dumpster, chainlink fence, fuel pump, pallet stack, toxic drum
- **37 new props** — sofa, armchair, coffee table, bookshelf, TV stand, rug, bed, nightstand, dresser, wardrobe, toilet, bathtub, fridge, stove, kitchen counter, dining table, dining chair, kitchen island, office desk, office chair, filing cabinet, photocopier, whiteboard, water cooler, vending machine, shopping cart, park bench, trash can, mailbox, bus stop, potted plant, bush, fountain, electrical box, manhole, generator, fire hydrant

All drawn in the same procedural top-down style as the existing `ZSprites` — bone-on-ink palette with blood-orange + toxic + warn accents, Bebas/Manrope/JetBrains type system, identical hand-pose/shadow/walk-cycle conventions.

## How the integration works

Each `sprites/*.js` file is an IIFE that exposes its draw functions on a namespace:

```js
window.ZExpand     // 6 weapons + 6 enemies + 9 blocks  (sprites/expansion.js)
window.ZProps      // 37 furniture / world props        (sprites/props.js)
window.ZBestiary   // 14 more enemies                   (sprites/bestiary.js)
```

Every draw function has the same signature as the existing `ZSprites` ones:

- **Weapons** — `(ctx)` — drawn in player's hand-pose, +x is aim direction
- **Enemies** — `(ctx, z)` where `z = { x, y, r, hp, maxHp, angle, walkPhase, ... }`
- **Blocks + props** — `(ctx, o)` where `o = { x, y, w, h, ... }`

So they slot into your existing `drawObstacle` / `drawZombie` / `drawHeldWeapon`
dispatch with a tiny shim — see `snippets/sprites-dispatch.js`.

## Integration in three tiers

You don't have to do all three. Each tier is independently shippable.

### Tier 1 — Visuals only (~30 minutes)

Game looks new; behavior unchanged. **Do this first.**

1. Copy `sprites/expansion.js`, `sprites/props.js`, `sprites/bestiary.js` into your `zombie-survival/` folder (alongside `sprites.js`).
2. In `index.html`, add three `<script>` tags after `sprites.js`:
   ```html
   <script src="sprites.js"></script>
   <script src="expansion.js"></script>
   <script src="props.js"></script>
   <script src="bestiary.js"></script>
   ```
3. Apply the three dispatch patches in `snippets/sprites-dispatch.js` to your `sprites.js`. This makes `drawObstacle`, `drawZombie`, and `drawHeldWeapon` look up the new sprites by `kind` / `type` / `weapon` string.

After tier 1, you can call `ZProps.draw.sofa(ctx, {x, y, w: 116, h: 56})` anywhere
and it works. Nothing in the game spawns the new content yet.

### Tier 2 — Stats so the new content exists (~1 hour)

The game spawns it; it uses fallback (walker-AI / pistol-fire) behavior.

1. Paste the contents of `snippets/defs-additions.js` into your `defs.js` — adds 6 weapon entries and 20 enemy entries to your existing `WEAPONS` and `ZOMBIES` tables, plus extends `WEAPON_ORDER`.
2. Use the patterns in `snippets/world-gen-examples.js` in your `world.js` to actually place the new props/blocks in generated chunks.

After tier 2, the game spawns Spitters, Crawlers, Infection Clusters, etc., and
they walk around shooting normally. The new weapons fire like their nearest
existing equivalent.

### Tier 3 — Unique behaviors (per-feature, individually small)

Each behavior is 10–100 lines in `game.js`. See `CATALOG.md` for the complete
list with target file + complexity rating. Pick the ones that matter most —
they're independent.

High-impact ones to do first:
- Infection Cluster spawner loop (the player's anchor for "kill the structure" gameplay)
- Charger telegraph + dash (most dramatic new enemy)
- Centipede segmented HP (visible damage progression)
- Crossbow pierce-3 (most differentiated new weapon)
- Mimic ambush (most surprising)

## Previewing without integrating

Open `examples/preview.html` in a browser. It loads the three sprite files
standalone and renders every weapon, enemy, and block on a labelled grid.
Useful for spot-checking which sprite you want before wiring it in.

## File-by-file glossary

| File | Exposes | Lines |
|---|---|---|
| `sprites/expansion.js` | `window.ZExpand` with 6 weapon draws + 6 enemy draws + 9 block draws + `ZExpand.WEAPONS/ENEMIES/BLOCKS` data tables | ~1100 |
| `sprites/props.js` | `window.ZProps` with `ZProps.draw[name]` map (37 entries) + `ZProps.CATALOG` data | ~1500 |
| `sprites/bestiary.js` | `window.ZBestiary` with `ZBestiary.draw[name]` map (14 entries) + `ZBestiary.ENEMIES` data | ~1100 |

## Conventions

- **No globals leak.** Each file is an IIFE that only attaches its public namespace.
- **No deps.** Pure Canvas 2D + plain JS. Same browser support as your existing `sprites.js`.
- **Same palette.** All hex values match `ZSprites.palette`. If you change the game's accent color, the new sprites pick it up via shared tokens.
- **No emoji, no external images.** Every visual is procedural.

## Questions Claude CLI can answer from this folder alone

- "What enemies exist?" → `CATALOG.md`
- "How do I render an Infection Cluster?" → `CATALOG.md` (signature) + `examples/preview.html` (working call)
- "Where does the charger AI go?" → `CATALOG.md` § Tier 3 behaviors
- "What's the kind string for a fridge?" → `CATALOG.md` § Props
- "Show me a working preview" → `examples/preview.html`
