# Moat & Pits module (C·02) — integration spec

`moat.js` is a self-contained module. Every hook below is additive — no
existing file is modified by the module itself.

State summary:
- `Game.moatTiles: Map<"tx,ty", { tx, ty, spiked }>` — sparse trench grid.
- `Game.moatDig: { tx, ty, t }` — per-player hold-to-dig progress.

Effects (Tank zombies are immune to all three):
- Slow non-Tank zombies on a moat tile to **40%** speed.
- Bleed **30 dmg/sec** from non-Tank zombies on a moat tile.
- One-shot **60 damage** on the frame a non-Tank zombie *enters* a spiked
  moat tile from a non-moat tile.

> No z-axis. Moats are flat decorated tiles — do not add elevation logic.

---

## 1. `index.html` — script load order

Insert the `<script>` tag **after `world.js`** (we read `World.terrainAt` /
`TERRAIN`) and **before `render.js`** (so the renderer can call
`drawMoatTiles`):

```html
<script src="world.js"></script>
<script src="moat.js"></script>           <!-- new -->
<script src="props.js"></script>
<script src="render.js"></script>
```

Exact placement isn't critical as long as `moat.js` loads after `world.js`
and `items.js`, and before any file that calls into it (`render.js`,
`game.js`).

---

## 2. `items.js` — `ITEMS` registry additions

Add these two entries to the `ITEMS` object. **Note dedup**: if `garden.js`
(or any other module's integration spec) already adds `shovel`, drop the
shovel entry below and keep the other module's definition — the integrator
should keep a single canonical shovel. The `moat.js` runtime only looks
items up by id (`hasItem(inv, 'shovel', 1)`), so any shape with that id
works.

```js
shovel: {
  id: 'shovel', name: 'Shovel', category: 'tool',
  stackMax: 1, tint: '#9a7a4a',
  desc: 'Dig trenches on grass. Hold G on a clear grass tile.',
},
rebar: {
  id: 'rebar', name: 'Rebar', category: 'material',
  stackMax: 20, tint: '#c0c4c8',
  desc: 'Sharpened steel. Use on a trench (G) to install spikes.',
},
```

Optional: add icon shapes inside `drawItemIconShape()` (ui.js / render.js,
wherever inventory thumbnails live) — a brown handle + grey spade for
shovel, a vertical grey rod for rebar. Not required for behavior.

---

## 3. `game.js` — `CRAFT_RECIPES` additions

Append to the `CRAFT_RECIPES` array (around line 135 of `game.js`):

```js
{
  id: 'shovel',
  label: 'Shovel',
  desc: 'Trench tool. Hold G on grass to dig a moat.',
  cost: [{ id: 'scrap', n: 6 }],
  apply(p) {
    if (hasItem(p.inventory, 'shovel', 1)) {
      setNotice('Already have a shovel', 1.2);
      return false;
    }
    addItem(p.inventory, 'shovel', 1);
    setNotice('+1 shovel', 1.2);
  },
},
{
  id: 'rebar',
  label: 'Rebar ×4',
  desc: 'Sharpened steel for spiking trenches (+60 dmg on entry).',
  cost: [{ id: 'scrap', n: 4 }],
  apply(p) {
    addItem(p.inventory, 'rebar', 4);
    setNotice('+4 rebar', 1.2);
  },
},
```

(If the integrator's `garden.js` already adds the shovel recipe, drop this
one and keep theirs.)

Also: industrial-loot tables should drop rebar (1-3 per crate, ~30%).
Wire this in your loot module if/when it lands — the moat module never
spawns rebar by itself.

---

## 4. `game.js` — `resetRun()` (around line 109)

Add the init call alongside the other module resets:

```js
function resetRun(levelIndex) {
  // ... existing resets ...
  Game.squad = [];
  Game.worldSurvivors = [];
  initMoat();                // <-- new
  // ... rest of resetRun ...
}
```

---

## 5. `game.js` — main tick

`updateMoat(dt)` is currently a no-op. Still wire it next to the other
`update*(dt)` calls so a future decoration tick has a home — pick the same
spot you already call `updateSquad(dt)`:

```js
updateSquad(dt);
updateMoat(dt);                // <-- new (no-op for now)
```

---

## 6. World render — `drawMoatTiles`

Moats are painted **after terrain** and **before walls / props / chests**
so they look like part of the ground but never cover a structure. In the
world render pass:

```js
// terrain pass already done by World.drawTerrain(ctx, camX, camY)
drawMoatTiles(ctx, camX, camY);     // <-- new
// then: walls, obstacles, props, chests, zombies, player, particles ...
```

Use the same `camX` / `camY` that the rest of the render pass uses (the
camera's top-left in world coords).

---

## 7. G-key binding — context-sensitive dispatch

There is no existing `KeyG` handler in `game.js`, so this is a fresh
binding. In the keydown handler (where `H` toggles squad hold, `E` opens
chests, etc.):

```js
if (e.code === 'KeyG' && !e.repeat) {
  const p = Game.player;
  if (!p || p.dead) return;
  // Aim at the tile under the cursor (world coords). Falls back to the
  // tile in front of the player if no mouse coord is tracked.
  const wx = (typeof input !== 'undefined' && input.mouseWorldX != null)
    ? input.mouseWorldX
    : p.x + Math.cos(p.angle) * TILE_SIZE;
  const wy = (typeof input !== 'undefined' && input.mouseWorldY != null)
    ? input.mouseWorldY
    : p.y + Math.sin(p.angle) * TILE_SIZE;
  // Existing trench? -> try to spike it. Otherwise -> dig (gated by shovel).
  if (tileAtPx(wx, wy)) {
    spikeMoatAt(wx, wy, p);
  } else {
    digMoatAt(wx, wy, p);
  }
}
```

> The brainstorm called for a **1.2s hold**. If you'd rather honor the
> hold, add an `input.keys.has('g')` poll in `updatePlayer(dt)` that
> increments `Game.moatDig.t` while `g` is held over the same tile, and
> calls `digMoatAt` once `t >= MOAT_DIG_HOLD`. The single-tap version
> above is functional and ships smaller; the hold is purely UX polish.

---

## 8. Zombie effect wiring — speed multiplier + per-tick damage

Open `game.js` around the zombie movement step (currently lines
**1982-1988** in the current build). The unmodified block:

```js
// Screamer aura applies as a per-frame speed boost (set in tier3PreTick).
const speedMul = z.speedBoost || 1;
z.x += vx * z.speed * speedMul * dt;
z.y += vy * z.speed * speedMul * dt;
// facing + walk cycle
z.angle = Math.atan2(dy, dx);
z.walkPhase = (z.walkPhase + dt * (z.speed / 35)) % 1;
```

Patch it to apply the moat slow + bleed:

```js
// Screamer aura applies as a per-frame speed boost (set in tier3PreTick).
const speedMul = z.speedBoost || 1;
const moatMul  = moatSlowMult(z, z.x, z.y);          // NEW
z.x += vx * z.speed * speedMul * moatMul * dt;       // CHANGED
z.y += vy * z.speed * speedMul * moatMul * dt;       // CHANGED
// Moat bleed — 30 dmg/sec on plain trench, 0 on spiked-only via dps.
const moatDps = moatDamagePerSec(z, z.x, z.y);       // NEW
if (moatDps > 0) {
  z.hp -= moatDps * dt;                              // NEW
  if (z.hp <= 0) { killZombie(z, 'moat'); i--; continue; }  // NEW
}
// facing + walk cycle
z.angle = Math.atan2(dy, dx);
z.walkPhase = (z.walkPhase + dt * (z.speed / 35)) % 1;
```

The `i--; continue;` mirrors the existing on-fire / barrel kill paths in
the same loop. If `killZombie` doesn't accept a `'moat'` cause string,
pass `'fire'` or `null` — the cause is cosmetic for the corpse log.

---

## 9. Spike one-shot damage — moatSpikeOnEnter

Right after the moat-bleed block from step 8 (still inside the same
zombie loop iteration, after `z.x/z.y` have been updated this frame), add:

```js
// Spiked-moat entry damage (one-shot per tile transition).
{
  const _tx = Math.floor(z.x / TILE_SIZE);
  const _ty = Math.floor(z.y / TILE_SIZE);
  const _key = (Game.moatTiles && Game.moatTiles.has(_tx + ',' + _ty))
    ? (_tx + ',' + _ty) : null;
  const spikeDmg = moatSpikeOnEnter(z, z._lastMoatKey, _key);
  if (spikeDmg > 0) {
    z.hp -= spikeDmg;
    // Small blood puff so the hit reads.
    for (let k = 0; k < 6; k++) {
      Game.particles.push({
        x: z.x, y: z.y, vx: rand(-120, 120), vy: rand(-160, 0),
        life: rand(0.25, 0.5), color: '#9a1a1a', r: rand(2, 4),
      });
    }
    if (z.hp <= 0) { killZombie(z, 'moat'); i--; continue; }
  }
  z._lastMoatKey = _key;
}
```

This tracker lives on the zombie itself (`z._lastMoatKey`) so it dies with
the zombie — no global cleanup needed.

---

## 10. Save / load wiring

`saveMoat()` returns a plain array. In your save serializer (likely
`persistence.js`):

```js
// On save:
save.moat = saveMoat();

// On load (after Game has been initialized for the run):
loadMoat(save.moat);
```

If the save format is versioned, bump `SAVE_VERSION` in `constants.js` and
treat missing `save.moat` as `[]` for backward compatibility. `loadMoat`
already tolerates `undefined` / non-array input.

---

## Reader API summary (for other modules)

- `isMoat(tx, ty)` / `isSpikedMoat(tx, ty)` — tile-coord booleans.
- `tileAtPx(worldX, worldY)` — returns the moat entry under a world pixel,
  or `null`.
- `removeMoatAt(worldX, worldY)` — admin / cleanup (e.g. terrain reset).
- `moatSlowMult` / `moatDamagePerSec` / `moatSpikeOnEnter` — the three
  effect hooks used in step 8 / 9.
- `saveMoat()` / `loadMoat(data)` — persistence.
