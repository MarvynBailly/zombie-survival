# Lore module integration

`lore.js` is the F4c foundation for E·04 Cork Board (which will pin journals,
screenshots, and hand-drawn maps) and dovetails with E·01 Trophy Room. It owns
three subsystems:

- **Journals** — text-bearing items dropped from chests (~12% per chest).
  Picked up like any inventory item; read later via the Cork Board.
- **Screenshots** — discrete-event canvas snapshots stored as low-quality
  JPEGs on `Game.lore.screenshots[]` and mirrored into a meta layer.
- **Hand-drawn maps** — `sketchpad` consumable; snapshots explored chunks +
  bases + player position into `Game.lore.mapDrawings[]`.

A separate `localStorage` key (`zombie-survival:lore-meta`) holds the
cross-run keepsake layer (`journalsRead`, `screenshotsKept`, `mapsDrawn`).
Unlike `Game.perks.totalEarned`, this layer truly survives death.

The module itself is self-contained — these edits hook it into the existing
files without modifying `lore.js`.

## 1. Script tag (index.html)

Load after `items.js` (uses `ITEMS`) and `perks.js`, and before `game.js`:

```html
<script src="items.js"></script>
<script src="perks.js"></script>
<script src="lore.js"></script>   <!-- add this line -->
<script src="squad.js"></script>
<script src="game.js"></script>
```

`lore.js` only references globals defined by the files above (`Game`, `ITEMS`,
`addItem`, `setNotice`, `Audio`, `canvas`, `spawnPickup`). It registers
`ITEMS.sketchpad` at load time, so the inventory and crafting overlays see it
automatically.

## 2. resetRun() — game.js (around line 142, after `Game.elapsed = 0`)

```js
Game.elapsed = 0;
initLore();                   // <- add (creates Game.lore and loads meta)
loadLoreMeta();               // <- add (idempotent — initLore() already calls it,
                              //    but call again here in case the player
                              //    switched profiles via dev tools)
Game.scoreSubmitted = false;
```

## 3. items.js — sketchpad already auto-registers

`lore.js` populates `ITEMS.sketchpad` at module load, so no edit is strictly
required. If you'd like the item visible in `items.js` source for grep-ability,
mirror this stub (the lore.js entry wins because it loads later):

```js
// ITEMS.sketchpad — registered by lore.js. Kept here as a doc breadcrumb.
```

For the **journal item factory pattern** (lives entirely in `lore.js`):

```js
// One-shot ITEMS entries per journal instance. Each pickup is uniquely
// identified so the Cork Board can pin a specific journal.
//   makeJournal(templateId, title, text, foundDay) -> 'journal_<tpl>_<slug>'
//   ITEMS[uid] = { ..., category: 'quest', isJournal: true,
//                  journalTemplateId, text, foundDay }
```

Journals route into the inventory through the existing `item_<id>` pickup
path in `processPickup()` — no new pickup type code required.

## 4. CRAFT_RECIPES — items.js (append to the array, around line 197)

```js
{
  id: 'sketchpad',
  label: 'Sketchpad',
  desc: 'Sketch a map of where you\'ve been. Right-click in inventory to use.',
  cost: [{ id: 'scrap', n: 6 }],
  apply(p) {
    const left = addItem(p.inventory, 'sketchpad', 1);
    if (left === 0) setNotice('+1 sketchpad', 1.2);
    else setNotice('Inventory full — sketchpad lost', 1.5);
  },
},
```

(Scrap-only — cloth isn't a registered item yet, so we keep cost simple.)

## 5. Chest-open hook — game.js, function `openChest(chest)` (around line 815)

Add **one line** at the end of the function, after the debris loop:

```js
function openChest(chest) {
  if (chest.opened) return;
  chest.opened = true;
  chest.hp = 0;
  Audio.sfx.pickup();
  const cx = chest.x + chest.w / 2;
  const cy = chest.y + chest.h / 2;
  // ... existing loot + debris loops ...

  maybeDropJournal(cx, cy);   // <- add (12% chance per chest)
}
```

## 6. Special-zombie kill hook — game.js, function `killZombie(z, weapon)` (around line 1468)

Add the screenshot trigger just before `Game.kills++` (line 1523):

```js
  // ... existing tier-3 death effects ...
  Game.corpseLog.push({ x: z.x, y: z.y, type: z.type, until: now() + 6 });

  // Lore: snapshot the canvas when a boss-class zombie dies. Types here
  // are the bestiary mini-bosses / spawners. Cheap because toDataURL only
  // fires on the kill, not per-frame.
  const BOSS_KINDS = new Set([
    'cluster', 'brood', 'necro', 'charger', 'reaper', 'bloater',
    'cent', 'riot',
  ]);
  if (BOSS_KINDS.has(z.type) && typeof captureScreenshot === 'function') {
    captureScreenshot(`killed ${z.type}`, 'boss-kill');
  }

  Game.kills++;
```

Also fire the kill-milestone shot at the end of `killZombie` (after
`Game.zombies.splice`):

```js
  const idx = Game.zombies.indexOf(z);
  if (idx >= 0) Game.zombies.splice(idx, 1);
  if (typeof maybeMilestoneShot === 'function') maybeMilestoneShot();
}
```

(`maybeMilestoneShot()` is exported from `lore.js`; it self-gates so it
fires once per 10-kill threshold.)

## 7. Player-death hook — game.js, function `damagePlayer` (around line 1638)

```js
  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
    Audio.sfx.dead();
    // Lore: snapshot the death moment + force-flush meta so it survives.
    if (typeof captureScreenshot === 'function') captureScreenshot('death', 'death');
    if (typeof saveLoreMeta === 'function') saveLoreMeta();
    setTimeout(() => { if (Game.mode === 'playing') showGameOver(); }, 900);
  }
```

## 8. Save/load wiring (per-run)

### saveGame() — persistence.js (around line 77, inside the `data` object literal)

```js
    worldSurvivors: Game.worldSurvivors ? Game.worldSurvivors.map(...) : null,
    lore: (typeof saveLore === 'function') ? saveLore() : null,   // <- add
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch {}
```

### restoreFromSave() — game.js (find the `restoreFromSave` block, around line 196+; place near where `perks` is restored)

```js
  if (typeof loadLore === 'function') loadLore(d.lore);
```

The per-run save bundles screenshots and map drawings inline. Because
JPEG quality is 0.45, each screenshot data URL stays under ~30 KB; with
the 20-shot cap, the run-save payload grows by ~600 KB max — acceptable
for `localStorage` but worth knowing.

## 9. Save/load wiring (cross-run meta)

`loadLoreMeta()` is called automatically by `initLore()` at run start.
`saveLoreMeta()` is called automatically by:

- `captureScreenshot()` — every snapshot persists immediately
- `useSketchpad()` — every map persists immediately
- the player-death hook above — belt-and-suspenders flush

No additional call sites are required. If you add a Cork Board "read this
journal" UI in E·04, call `markJournalRead(templateId)` to mark it as
seen across runs.

## 10. Tunables (constants at the top of lore.js)

```js
const SCREENSHOT_CAP = 20;
const MAPDRAWING_CAP = 12;
const JOURNAL_DROP_CHANCE = 0.12;
const JPEG_QUALITY = 0.45;
```

Bump `JOURNAL_DROP_CHANCE` if E·04 testing wants more text on the board.
Drop `JPEG_QUALITY` to 0.3 if the localStorage payload becomes a concern.

## 11. Exported globals (for downstream modules)

```
initLore()              — call from resetRun()
maybeDropJournal(x, y)  — call from openChest()
captureScreenshot(label, kind)
                        — call from boss-death / death hooks
maybeMilestoneShot()    — call from killZombie() tail
useSketchpad(p)         — wired through ITEMS.sketchpad.use()
getJournalText(itemId)  — Cork Board UI lookup
markJournalRead(tplId)  — Cork Board UI mark-as-read
loreMeta()              — accessor for the meta cache object
saveLore()/loadLore(d)  — per-run state
saveLoreMeta()/loadLoreMeta()
                        — cross-run state
```
