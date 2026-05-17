'use strict';

// ---------- Trophy room (E·01) ----------
// Special zombies drop trophy items. The player carries trophies in the
// regular inventory, then mounts them on wall plinths crafted from a
// `plinth_kit`. Each plinth holds 1 trophy. The plinth PROPS reset every
// run, but the mounted-trophy DATA persists across runs in a meta layer
// (`'zombie-survival:trophies'`) so a fallen survivor's trophy room
// narrative keeps growing — Cork Board (E·04) reads from the same meta.
//
// Architecture parallels lore.js: per-run state on Game.trophies +
// Game.plinths, a separate meta layer keyed in localStorage, and a
// small overlay UI driven by E-key proximity.
//
// Globals expected from the rest of the game:
//   Game, ITEMS, addItem, removeItem (items.js)
//   CRAFT_RECIPES (items.js — appended via integration)
//   setNotice, Audio (persistence.js / ui.js)
//   spawnPickup (game.js — pickups routed through `item_<id>`)
//   inObstacle (game.js — placement validation)
//   WORLD_W / WORLD_H (constants.js)

// ---------- Constants ----------
const TROPHY_META_KEY = 'zombie-survival:trophies';
const PLINTH_PROMPT_RADIUS = 60;
const PLINTH_HP = 30;
const PLINTH_W = 28;
const PLINTH_H = 40;
const TROPHY_FIRST_DROP_CHANCE = 0.50;
const TROPHY_REPEAT_DROP_CHANCE = 0.10;

// ---------- Trophy table ----------
// Source-kind → trophy item id + name + thematic color used by both the
// inventory icon and the tiny mounted-on-plinth glyph. Kinds match the
// zombie `z.type` strings in defs.js. The `glyph` token tells the draw
// code which silhouette to render (sac / horn / plate / skull / scythe /
// eye / gland / veil).
const TROPHY_TABLE = {
  trophy_brood_sac:     { source: 'brood',   name: 'Brood Sac',         glyph: 'sac',    color: '#7d3a45', tint: '#a45260' },
  trophy_charger_horn:  { source: 'charger', name: 'Charger Horn',      glyph: 'horn',   color: '#7a9a55', tint: '#9ab86a' },
  trophy_tank_plate:    { source: 'tank',    name: 'Tank Plate',        glyph: 'plate',  color: '#7a4a9a', tint: '#9a6abf' },
  trophy_necro_skull:   { source: 'necro',   name: 'Necromancer Skull', glyph: 'skull',  color: '#7a3a8a', tint: '#bda0c8' },
  trophy_reaper_scythe: { source: 'reaper',  name: 'Reaper Scythe',     glyph: 'scythe', color: '#1a1418', tint: '#5a4a52' },
  trophy_cluster_eye:   { source: 'cluster', name: 'Cluster Eye',       glyph: 'eye',    color: '#7d3a45', tint: '#e8b85a' },
  trophy_bloater_gland: { source: 'bloater', name: 'Bloater Gland',     glyph: 'gland',  color: '#5e4a3a', tint: '#8ec547' },
  trophy_specter_veil:  { source: 'stalker', name: 'Specter Veil',      glyph: 'veil',   color: '#4a525a', tint: '#a8b0b8' },
};

// Reverse map: zombie type → trophy item id. Specter is mapped to the
// stalker zombie type — bestiary ships no separate `specter` kind.
const TROPHY_BY_KIND = (() => {
  const m = {}; for (const id in TROPHY_TABLE) m[TROPHY_TABLE[id].source] = id; return m;
})();

// ---------- Item registry ----------
// Register the plinth kit + every trophy item at module-load time so the
// inventory grid, crafting overlay, and pickup pipeline see them without
// requiring an additional integration patch.
// `consumable` (not `tool`) so the inventory's right-click path invokes
// .use() and decrements the stack on success — same UX as bandage.
ITEMS.plinth_kit = {
  id: 'plinth_kit', name: 'Plinth Kit', category: 'consumable',
  stackMax: 4, tint: '#9a7a48',
  desc: 'Wall plinth — mount a trophy. Right-click to place in front of you.',
  use(p) { return placePlinth(p.x + Math.cos(p.angle) * 40, p.y + Math.sin(p.angle) * 40, p); },
};
for (const id in TROPHY_TABLE) {
  const t = TROPHY_TABLE[id];
  ITEMS[id] = {
    id, name: t.name, category: 'quest',
    stackMax: 1, tint: t.tint,
    desc: 'A grim keepsake. Mount it on a wall plinth in your base.',
    isTrophy: true,
    trophyGlyph: t.glyph,
    trophyColor: t.color,
    trophyTint: t.tint,
  };
}

// ---------- Initialisation ----------
function initTrophies() {
  if (!Game) return;
  Game.trophies = [];                 // run inventory (data records, not items)
  Game.plinths = [];                  // run plinth props
  Game.trophyFirstSeen = new Set();   // per-run first-kill tracker
  Game.plinthMenu = null;             // overlay state: { plinth }
  loadTrophyMeta();
}

// ---------- Drop logic ----------
// Called by the integrator from killZombie(). `killer` is the weapon string;
// we record it on the trophy data for the tooltip.
function maybeDropTrophy(zombie, killer) {
  if (!zombie || !Game) return false;
  const itemId = TROPHY_BY_KIND[zombie.type];
  if (!itemId) return false;
  const first = !Game.trophyFirstSeen.has(zombie.type);
  const chance = first ? TROPHY_FIRST_DROP_CHANCE : TROPHY_REPEAT_DROP_CHANCE;
  if (Math.random() > chance) {
    // Even on a miss, mark first-kill so subsequent kills use the lower rate.
    Game.trophyFirstSeen.add(zombie.type);
    return false;
  }
  Game.trophyFirstSeen.add(zombie.type);
  if (typeof spawnPickup !== 'function') return false;
  // Drop a little off-axis so it doesn't sit on the corpse silhouette.
  const a = Math.random() * Math.PI * 2;
  const r = 20 + Math.random() * 12;
  spawnPickup(zombie.x + Math.cos(a) * r, zombie.y + Math.sin(a) * r, `item_${itemId}`);
  return true;
}

// Wrapper kept for the integration spec — most pickups route via the
// existing `item_<id>` path in processPickup(); callers only need this
// if they construct trophies outside the kill flow.
function pickupTrophy(itemId, player) {
  if (!ITEMS[itemId] || !player || !player.inventory) return false;
  return addItem(player.inventory, itemId, 1) === 0;
}

// ---------- Plinths (props) ----------
// `placePlinth` is wired through the plinth_kit item's `use()` so it can
// be triggered from the inventory overlay (right-click) without a new
// keybind. The plinth slots in front of the player at a fixed offset.
function placePlinth(x, y, player) {
  if (typeof inObstacle === 'function' && inObstacle(x, y, 18)) {
    setNotice('Can\'t place plinth there', 1.2);
    return false;
  }
  if (x < 20 || y < 20 || x > WORLD_W - 20 || y > WORLD_H - 20) {
    setNotice('Out of bounds', 1.2);
    return false;
  }
  Game.plinths.push({
    id: 'plinth_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 999).toString(36),
    x, y, w: PLINTH_W, h: PLINTH_H,
    hp: PLINTH_HP, maxHp: PLINTH_HP,
    mountedTrophyId: null,
    mountedTrophy: null,   // cached data record for fast draw/tooltip
  });
  if (typeof Audio !== 'undefined' && Audio.sfx) Audio.sfx.click();
  setNotice('Plinth placed — interact (E) to mount a trophy', 2);
  // NB: caller (items.js useItem) decrements the stack on a truthy return,
  // so we don't remove a kit here ourselves — that would double-deduct.
  return true;
}

// E-key proximity probe. The integrator calls this from updatePlayer's
// E-key block, preferring it over the workbench / survivor fallback so
// the plinth overlay opens for an obviously-nearby plinth.
function findPlinthNear(player, radius) {
  const list = Game.plinths;
  if (!list || list.length === 0) return null;
  const R = radius || PLINTH_PROMPT_RADIUS;
  const r2 = R * R;
  let best = null, bestD = r2;
  for (const pl of list) {
    const cx = pl.x + pl.w / 2, cy = pl.y + pl.h / 2;
    const dx = cx - player.x, dy = cy - player.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) { bestD = d2; best = pl; }
  }
  return best;
}

// ---------- Mounting ----------
function openPlinthMenu(plinth) {
  if (!plinth) return;
  if (Game.mode !== 'playing') return;
  Game.plinthMenu = { plinth };
  Game.mapOpen = true;
  if (typeof Audio !== 'undefined' && Audio.sfx) Audio.sfx.click();
}

function closePlinthMenu() {
  Game.plinthMenu = null;
  if (Game.mode === 'playing') Game.mapOpen = false;
  if (Game.player) Game.player.openCd = 0.4;
}

function mountTrophy(plinth, itemId) {
  if (!plinth || !ITEMS[itemId] || !ITEMS[itemId].isTrophy) return false;
  // Find the trophy record in Game.trophies (preferred — has metadata) or
  // synthesize one from the item if we don't have a record (e.g. picked
  // up via a save round-trip before Game.trophies was rebuilt).
  let rec = Game.trophies.find(t => t.itemId === itemId && !t.mountedAt);
  if (!rec) {
    rec = {
      id: 'tr_' + Date.now().toString(36),
      itemId,
      sourceKind: TROPHY_TABLE[itemId] ? TROPHY_TABLE[itemId].source : 'unknown',
      sourceDay: (Game.time && Game.time.day) | 0,
      weapon: (Game.player && Game.player.weapon) || 'pistol',
      runtimeSec: (Game.runtime || Game.elapsed || 0) | 0,
      name: ITEMS[itemId].name,
    };
    Game.trophies.push(rec);
  }
  const inv = Game.player && Game.player.inventory;
  if (!inv || removeItem(inv, itemId, 1) < 1) return false;
  plinth.mountedTrophyId = rec.id;
  plinth.mountedTrophy = rec;
  rec.mountedAt = Date.now();
  // Persist to the cross-run meta layer immediately so the mounting
  // survives a sudden death.
  const meta = trophyMeta();
  meta.trophies.push({ ...rec });
  saveTrophyMeta();
  setNotice(`Mounted: ${rec.name}`, 2);
  if (typeof Audio !== 'undefined' && Audio.sfx) Audio.sfx.pickup();
  return true;
}

// ---------- Update ----------
// Plinths are passive props — they don't move, take periodic damage, or
// emit anything per tick. Kept as a no-op for symmetry with the other
// modules so the integration tick list reads consistently.
// eslint-disable-next-line no-unused-vars
function updateTrophies(dt) { /* no-op */ }

// ---------- Render: plinths + mounted trophies ----------
function drawPlinths(ctx, camX, camY) {
  const list = Game.plinths;
  if (!list || list.length === 0) return;
  for (const pl of list) {
    const sx = pl.x - camX, sy = pl.y - camY;
    // Cull obviously off-screen plinths cheaply.
    if (sx < -40 || sy < -40 || sx > 1100 || sy > 820) continue;
    drawPlinth(ctx, pl, sx, sy);
  }
}

function drawPlinth(ctx, pl, sx, sy) {
  // Post column + lighter shadow on the front face.
  ctx.fillStyle = '#3a2818'; ctx.fillRect(sx + 4, sy + 10, pl.w - 8, pl.h - 10);
  ctx.fillStyle = '#7a5a3a'; ctx.fillRect(sx + 6, sy + 12, pl.w - 12, pl.h - 14);
  ctx.fillStyle = '#a4855a'; ctx.fillRect(sx + 6, sy + 12, pl.w - 12, 2);
  // Top platform.
  ctx.fillStyle = '#3a2818'; ctx.fillRect(sx + 1, sy + 4, pl.w - 2, 8);
  ctx.fillStyle = '#bd9560'; ctx.fillRect(sx + 2, sy + 5, pl.w - 4, 5);
  // HP pip if damaged.
  if (pl.hp < pl.maxHp) {
    const f = pl.hp / pl.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(sx, sy - 5, pl.w, 3);
    ctx.fillStyle = f > 0.5 ? '#8ec547' : f > 0.25 ? '#e3a83a' : '#d24b35';
    ctx.fillRect(sx, sy - 5, pl.w * f, 3);
  }
  // Mounted trophy glyph (centered on the platform).
  if (pl.mountedTrophy) drawTrophyGlyph(ctx, pl.mountedTrophy, sx + pl.w / 2, sy + 2);
}

// 14×10 icon centered on the plinth platform. Each glyph is a thematic
// silhouette in the trophy's color — readable at distance even though
// it is tiny on the world map.
function drawTrophyGlyph(ctx, rec, cx, cy) {
  const t = TROPHY_TABLE[rec.itemId] || { color: '#bdbab1', tint: '#e8e6df', glyph: 'sac' };
  const g = t.glyph;
  ctx.fillStyle = t.color;
  if (g === 'sac') {
    ctx.beginPath(); ctx.ellipse(cx, cy + 2, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = t.tint;
    ctx.beginPath(); ctx.ellipse(cx - 1, cy + 1, 2, 1.5, 0, 0, Math.PI * 2); ctx.fill();
  } else if (g === 'horn') {
    ctx.beginPath(); ctx.moveTo(cx - 4, cy + 4); ctx.lineTo(cx, cy - 5); ctx.lineTo(cx + 4, cy + 4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = t.tint; ctx.fillRect(cx - 1, cy - 3, 2, 6);
  } else if (g === 'plate') {
    ctx.fillRect(cx - 5, cy - 3, 10, 7);
    ctx.fillStyle = t.tint; ctx.fillRect(cx - 4, cy - 2, 8, 2);
    ctx.fillStyle = '#0b0c0e'; ctx.fillRect(cx - 3, cy + 2, 6, 1);
  } else if (g === 'skull') {
    ctx.beginPath(); ctx.ellipse(cx, cy + 1, 4, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0b0c0e';
    ctx.fillRect(cx - 2, cy, 1, 2); ctx.fillRect(cx + 1, cy, 1, 2); ctx.fillRect(cx - 1, cy + 3, 2, 1);
  } else if (g === 'scythe') {
    ctx.fillRect(cx, cy - 4, 1, 9);
    ctx.fillStyle = t.tint;
    ctx.beginPath();
    ctx.moveTo(cx, cy - 4); ctx.quadraticCurveTo(cx + 6, cy - 4, cx + 5, cy);
    ctx.lineTo(cx + 3, cy); ctx.quadraticCurveTo(cx + 3, cy - 2, cx, cy - 2);
    ctx.closePath(); ctx.fill();
  } else if (g === 'eye') {
    ctx.beginPath(); ctx.ellipse(cx, cy + 1, 5, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = t.tint;
    ctx.beginPath(); ctx.arc(cx, cy + 1, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0b0c0e';
    ctx.beginPath(); ctx.arc(cx, cy + 1, 1, 0, Math.PI * 2); ctx.fill();
  } else if (g === 'gland') {
    ctx.beginPath(); ctx.ellipse(cx, cy + 2, 4, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = t.tint;
    ctx.beginPath(); ctx.arc(cx - 1, cy, 1.5, 0, Math.PI * 2); ctx.fill();
  } else if (g === 'veil') {
    ctx.beginPath();
    ctx.moveTo(cx - 5, cy - 3); ctx.quadraticCurveTo(cx, cy + 6, cx + 5, cy - 3);
    ctx.lineTo(cx + 4, cy - 3); ctx.quadraticCurveTo(cx, cy + 4, cx - 4, cy - 3);
    ctx.closePath(); ctx.fill();
  } else { ctx.fillRect(cx - 3, cy - 2, 6, 6); }
}

// ---------- Plinth menu overlay ----------
// Drawn as part of the world canvas (not the DOM overlay-root) so the
// integration is a single hook in the UI dispatch. Lists every trophy
// currently in the inventory; click / number-key 1..N selects + mounts.
function drawPlinthMenu(ctx, w, h, plinth) {
  if (!plinth) return;
  const inv = Game.player && Game.player.inventory;
  const trophies = listInventoryTrophies(inv);
  // Backdrop + panel.
  ctx.fillStyle = 'rgba(7,8,10,0.78)'; ctx.fillRect(0, 0, w, h);
  const pw = 460, ph = 360, px = (w - pw) / 2, py = (h - ph) / 2;
  ctx.fillStyle = '#101317'; ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = '#3a4048'; ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
  // Header.
  ctx.fillStyle = '#8a877c'; ctx.font = '10px monospace';
  ctx.fillText('// WALL PLINTH', px + 16, py + 22);
  const mounted = plinth.mountedTrophy;
  ctx.fillStyle = '#ece7d7'; ctx.font = 'bold 24px monospace';
  ctx.fillText(mounted ? mounted.name.toUpperCase() : 'MOUNT TROPHY', px + 16, py + 50);
  ctx.fillStyle = '#8a877c'; ctx.font = '10px monospace';
  ctx.fillText(mounted
    ? `Day ${mounted.sourceDay} · ${mounted.weapon || '—'} · ${formatRuntime(mounted.runtimeSec)}`
    : 'Pick a trophy from your inventory.', px + 16, py + 66);
  // List.
  const lx = px + 16, ly = py + 90;
  if (trophies.length === 0) {
    ctx.fillStyle = '#8a877c'; ctx.font = '12px monospace';
    ctx.fillText('No trophies in inventory.', lx, ly + 20);
    ctx.fillText('Kill a special zombie — brood, charger, tank, necro,', lx, ly + 40);
    ctx.fillText('reaper, cluster, bloater, or stalker — to score one.', lx, ly + 56);
  } else {
    for (let i = 0; i < trophies.length && i < 8; i++) {
      const tr = trophies[i], ry = ly + i * 28;
      ctx.fillStyle = '#161a1f'; ctx.fillRect(lx, ry, pw - 32, 26);
      drawTrophyGlyph(ctx, { itemId: tr.id }, lx + 14, ry + 7);
      ctx.fillStyle = '#ece7d7'; ctx.font = '12px monospace';
      ctx.fillText(`${i + 1}. ${tr.def.name}`, lx + 32, ry + 18);
      ctx.fillStyle = '#8a877c'; ctx.font = '10px monospace';
      ctx.fillText('MOUNT', lx + pw - 80, ry + 18);
    }
  }
  ctx.fillStyle = '#8a877c'; ctx.font = '10px monospace';
  ctx.fillText('1..8 to mount  ·  Esc / E to close', px + 16, py + ph - 16);
}

function listInventoryTrophies(inv) {
  const out = [];
  if (!inv) return out;
  for (let i = 0; i < inv.slots.length; i++) {
    const s = inv.slots[i];
    if (s && ITEMS[s.id] && ITEMS[s.id].isTrophy) {
      out.push({ slotIndex: i, id: s.id, def: ITEMS[s.id], count: s.count });
    }
  }
  return out;
}

function formatRuntime(sec) {
  sec = sec | 0;
  const m = (sec / 60) | 0;
  const s = sec % 60;
  return m + 'm' + (s < 10 ? '0' : '') + s + 's';
}

// Hover-tooltip helper used by render.js when the cursor is over a
// mounted plinth, or by an F1 inspect overlay if E·04 wires one up.
function getTrophyTooltip(trophy) {
  if (!trophy) return '';
  return `${trophy.name} · day ${trophy.sourceDay} · ${trophy.weapon || '—'} · ${formatRuntime(trophy.runtimeSec)}`;
}

// Key-input shim. Called by the integrator from the canvas keydown
// listener while the menu is open. Returns true if the key was consumed.
function handlePlinthMenuKey(key) {
  const menu = Game.plinthMenu;
  if (!menu) return false;
  if (key === 'Escape' || key === 'e' || key === 'E') { closePlinthMenu(); return true; }
  const n = parseInt(key, 10);
  if (n >= 1 && n <= 8) {
    const trophies = listInventoryTrophies(Game.player && Game.player.inventory);
    if (n <= trophies.length && mountTrophy(menu.plinth, trophies[n - 1].id)) closePlinthMenu();
    return true;
  }
  return false;
}

// ---------- Per-run save/load ----------
function saveTrophies() {
  if (!Game) return null;
  return {
    trophies: (Game.trophies || []).map(t => ({ ...t })),
    plinths: (Game.plinths || []).map(pl => ({
      id: pl.id, x: pl.x, y: pl.y, w: pl.w, h: pl.h,
      hp: pl.hp, maxHp: pl.maxHp,
      mountedTrophyId: pl.mountedTrophyId,
      mountedTrophy: pl.mountedTrophy ? { ...pl.mountedTrophy } : null,
    })),
    firstSeen: Array.from(Game.trophyFirstSeen || []),
  };
}

function loadTrophies(data) {
  if (!Game) return;
  if (!Game.trophies) initTrophies();
  if (!data) return;
  Game.trophies = Array.isArray(data.trophies) ? data.trophies.map(t => ({ ...t })) : [];
  Game.plinths = Array.isArray(data.plinths) ? data.plinths.map(pl => ({
    id: pl.id, x: pl.x, y: pl.y, w: pl.w || PLINTH_W, h: pl.h || PLINTH_H,
    hp: pl.hp != null ? pl.hp : PLINTH_HP,
    maxHp: pl.maxHp || PLINTH_HP,
    mountedTrophyId: pl.mountedTrophyId || null,
    mountedTrophy: pl.mountedTrophy ? { ...pl.mountedTrophy } : null,
  })) : [];
  Game.trophyFirstSeen = new Set(data.firstSeen || []);
}

// ---------- Meta (cross-run) save/load ----------
// A separate localStorage key so a death doesn't reset the Trophy Room
// history. Cork Board (E·04) reads this to render thumbnail walls.
let __trophyMetaCache = null;

function trophyMeta() {
  if (__trophyMetaCache) return __trophyMetaCache;
  loadTrophyMeta();
  return __trophyMetaCache;
}

function loadTrophyMeta() {
  try {
    const raw = localStorage.getItem(TROPHY_META_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      __trophyMetaCache = {
        trophies: Array.isArray(d.trophies) ? d.trophies : [],
        plinths:  Array.isArray(d.plinths)  ? d.plinths  : [],
      };
      return __trophyMetaCache;
    }
  } catch {}
  __trophyMetaCache = { trophies: [], plinths: [] };
  return __trophyMetaCache;
}

function saveTrophyMeta() {
  if (!__trophyMetaCache) return;
  try {
    localStorage.setItem(TROPHY_META_KEY, JSON.stringify(__trophyMetaCache));
  } catch {}
}
