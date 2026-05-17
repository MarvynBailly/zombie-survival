'use strict';

// ---------- Prefabs ----------
// Pre-arranged clusters of walls + props placed in one click from the
// workbench. Costs more total scrap than placing the pieces individually
// (the convenience tax) but skips the early-game wall-by-wall tedium.
//
// State lives on Game.prefabs:
//   active        — PREFABS def currently in ghost placement, or null
//   ghostX/ghostY — top-left world coords of the ghost (snapped to grid)
//   cooldown      — short cd after a successful placement
//   watchtowers   — list of {x,y,w,h} interior bonus rects (view-radius x2)
//
// Tile coords (dx/dy) are TILE_SIZE units relative to the prefab's top-left.
// `kind` is one of: 'wall' | 'door' | 'workbench' | 'chest' | 'barrel' |
// 'watchtower'. Doors function as a wall variant tagged `door:true` until a
// real door system lands — see integration spec. Watchtower tiles are
// metadata only (no obstacle placed, interior stays walkable).

const PREFAB_TILE = (typeof TILE_SIZE !== 'undefined') ? TILE_SIZE : 40;
const PREFAB_PLACE_CD = 0.4;

// Tile-color palette for the ghost overlay (matches the wood-wall tone of
// real player-placed walls).
const PREFAB_TILE_COLOR = {
  wall: '#7a6238', door: '#caa760', workbench: '#5fb6e8',
  chest: '#caa760', barrel: '#d24b35',
};

const PREFABS = {
  guard_shack: {
    id: 'guard_shack', name: 'Guard Shack', scrapCost: 16,
    desc: '4×4 wall box with a door slot and one chest inside. Cheap and quick.',
    tiles: [
      { dx: 0, dy: 0, kind: 'wall' }, { dx: 1, dy: 0, kind: 'wall' },
      { dx: 2, dy: 0, kind: 'wall' }, { dx: 3, dy: 0, kind: 'wall' },
      { dx: 0, dy: 3, kind: 'wall' }, { dx: 1, dy: 3, kind: 'door' },
      { dx: 2, dy: 3, kind: 'wall' }, { dx: 3, dy: 3, kind: 'wall' },
      { dx: 0, dy: 1, kind: 'wall' }, { dx: 0, dy: 2, kind: 'wall' },
      { dx: 3, dy: 1, kind: 'wall' }, { dx: 3, dy: 2, kind: 'wall' },
      { dx: 2, dy: 1, kind: 'chest' },
    ],
  },
  workshop_addon: {
    id: 'workshop_addon', name: 'Workshop Addon', scrapCost: 28,
    desc: '4×4 wall box plus a workbench inside. Pop-up crafting room.',
    tiles: [
      { dx: 0, dy: 0, kind: 'wall' }, { dx: 1, dy: 0, kind: 'wall' },
      { dx: 2, dy: 0, kind: 'wall' }, { dx: 3, dy: 0, kind: 'wall' },
      { dx: 0, dy: 3, kind: 'wall' }, { dx: 1, dy: 3, kind: 'wall' },
      { dx: 2, dy: 3, kind: 'door' }, { dx: 3, dy: 3, kind: 'wall' },
      { dx: 0, dy: 1, kind: 'wall' }, { dx: 0, dy: 2, kind: 'wall' },
      { dx: 3, dy: 1, kind: 'wall' }, { dx: 3, dy: 2, kind: 'wall' },
      { dx: 1, dy: 1, kind: 'workbench' },
    ],
  },
  watchtower_stub: {
    id: 'watchtower_stub', name: 'Watchtower Stub', scrapCost: 24,
    desc: 'Flat 3×3 wall ring with a 1-tile platform inside. Doubles view radius while you stand on it.',
    // 8 walls around a single interior tile at (1,1). The interior is the
    // "watchtower stand" — kind 'watchtower' is metadata only (no obstacle).
    tiles: [
      { dx: 0, dy: 0, kind: 'wall' }, { dx: 1, dy: 0, kind: 'wall' }, { dx: 2, dy: 0, kind: 'wall' },
      { dx: 0, dy: 1, kind: 'wall' }, { dx: 1, dy: 1, kind: 'watchtower' }, { dx: 2, dy: 1, kind: 'wall' },
      { dx: 0, dy: 2, kind: 'wall' }, { dx: 1, dy: 2, kind: 'wall' }, { dx: 2, dy: 2, kind: 'wall' },
    ],
  },
  kennel: {
    id: 'kennel', name: 'Kennel', scrapCost: 14,
    desc: '3×3 wall box with two openings and a barrel inside. Cheap pen / chokepoint.',
    tiles: [
      { dx: 0, dy: 0, kind: 'wall' }, { dx: 1, dy: 0, kind: 'door' }, { dx: 2, dy: 0, kind: 'wall' },
      { dx: 0, dy: 1, kind: 'wall' }, { dx: 2, dy: 1, kind: 'wall' },
      { dx: 0, dy: 2, kind: 'wall' }, { dx: 1, dy: 2, kind: 'door' }, { dx: 2, dy: 2, kind: 'wall' },
      { dx: 1, dy: 1, kind: 'barrel' },
    ],
  },
};

// ---------- State ----------
function initPrefabs() {
  Game.prefabs = { active: null, ghostX: 0, ghostY: 0, cooldown: 0, watchtowers: [] };
}

// Width/height of a prefab in pixels (from its tile list).
function prefabBounds(def) {
  let maxX = 0, maxY = 0;
  for (const t of def.tiles) {
    if (t.dx > maxX) maxX = t.dx;
    if (t.dy > maxY) maxY = t.dy;
  }
  return { w: (maxX + 1) * PREFAB_TILE, h: (maxY + 1) * PREFAB_TILE };
}

// Snap a desired prefab-center (mouseX, mouseY) to its top-left grid-aligned
// origin, clamped to the world bounds.
function snapPrefabOrigin(def, mouseX, mouseY) {
  const bb = prefabBounds(def);
  const gx = Math.round((mouseX - bb.w / 2) / PREFAB_TILE) * PREFAB_TILE;
  const gy = Math.round((mouseY - bb.h / 2) / PREFAB_TILE) * PREFAB_TILE;
  return { x: clamp(gx, 0, WORLD_W - bb.w), y: clamp(gy, 0, WORLD_H - bb.h) };
}

// ---------- Tick ----------
function updatePrefabs(dt) {
  const st = Game.prefabs;
  if (!st) return;
  if (st.cooldown > 0) st.cooldown -= dt;
  if (!st.active) return;
  // input.wx/wy is the world-space mouse, set each frame by game.js. Falls
  // back to the player position if input isn't wired (e.g. bot tick).
  const wx = (typeof input !== 'undefined' && typeof input.wx === 'number') ? input.wx
    : (Game.player ? Game.player.x : 0);
  const wy = (typeof input !== 'undefined' && typeof input.wy === 'number') ? input.wy
    : (Game.player ? Game.player.y : 0);
  const o = snapPrefabOrigin(st.active, wx, wy);
  st.ghostX = o.x; st.ghostY = o.y;
}

// ---------- Validation ----------
// Cheap single-tile occupancy check. Shared by isPlacementValid (full prefab)
// and drawPrefabGhost (per-tile coloring).
function isTileFree(rx, ry) {
  const rw = PREFAB_TILE, rh = PREFAB_TILE;
  if (rx < 0 || ry < 0 || rx + rw > WORLD_W || ry + rh > WORLD_H) return false;
  for (const w of Game.walls) {
    if (rx < w.x + w.w && rx + rw > w.x && ry < w.y + w.h && ry + rh > w.y) return false;
  }
  let hit = false;
  if (typeof World !== 'undefined' && World.forEachActiveObstacle) {
    World.forEachActiveObstacle(rx + rw / 2, ry + rh / 2, (o) => {
      if (hit) return;
      if (rx < o.x + o.w && rx + rw > o.x && ry < o.y + o.h && ry + rh > o.y) hit = true;
    });
  }
  if (hit) return false;
  const p = Game.player;
  if (p && !p.dead && circleRectCollide(p.x, p.y, p.r, rx, ry, rw, rh)) return false;
  if (Game.zombies) {
    for (const z of Game.zombies) if (circleRectCollide(z.x, z.y, z.r, rx, ry, rw, rh)) return false;
  }
  if (Game.barrels) {
    for (const b of Game.barrels) if (circleRectCollide(b.x, b.y, b.r || 14, rx, ry, rw, rh)) return false;
  }
  return true;
}

// True if every solid tile in the prefab can drop at (worldX, worldY).
function isPlacementValid(def, worldX, worldY) {
  if (!def) return false;
  for (const t of def.tiles) {
    if (t.kind === 'watchtower') continue; // metadata only
    const rx = worldX + t.dx * PREFAB_TILE;
    const ry = worldY + t.dy * PREFAB_TILE;
    if (!isTileFree(rx, ry)) return false;
  }
  return true;
}

// ---------- Mode toggle ----------
function enterPrefabPlacementMode(prefabId) {
  if (!Game.prefabs) initPrefabs();
  const def = PREFABS[prefabId];
  if (!def) return false;
  Game.prefabs.active = def;
  Game.prefabs.cooldown = 0;
  if (typeof setNotice === 'function') {
    setNotice(`Placing ${def.name} — left-click to confirm, right-click/Esc to cancel`, 3);
  }
  return true;
}
function exitPrefabPlacementMode() {
  if (!Game.prefabs) return;
  Game.prefabs.active = null;
}
function isPlacingPrefab() {
  return !!(Game.prefabs && Game.prefabs.active);
}

// ---------- Commit ----------
// Place the active prefab at (worldX, worldY). Returns { ok, reason }. On
// success spawns walls/props and consumes scrap cost; on failure leaves
// placement mode active so the player can reposition.
function tryPlacePrefab(worldX, worldY, player) {
  const st = Game.prefabs;
  if (!st || !st.active) return { ok: false, reason: 'not_active' };
  if (st.cooldown > 0) return { ok: false, reason: 'cooldown' };
  const def = st.active;
  const p = player || Game.player;
  if (!p) return { ok: false, reason: 'no_player' };
  const o = snapPrefabOrigin(def, worldX, worldY);
  if (!isPlacementValid(def, o.x, o.y)) {
    if (typeof setNotice === 'function') setNotice('Blocked — clear the area first', 1.5);
    if (Audio && Audio.sfx && Audio.sfx.empty) Audio.sfx.empty();
    return { ok: false, reason: 'overlap' };
  }
  const inv = p.inventory;
  if (!inv || !hasItem(inv, 'scrap', def.scrapCost)) {
    if (typeof setNotice === 'function') setNotice(`Need ${def.scrapCost} scrap`, 1.5);
    if (Audio && Audio.sfx && Audio.sfx.empty) Audio.sfx.empty();
    return { ok: false, reason: 'cost' };
  }
  removeItem(inv, 'scrap', def.scrapCost);
  spawnPrefabTiles(def, o.x, o.y, st);
  if (typeof NAV !== 'undefined' && NAV.markDirty) NAV.markDirty();
  if (Audio && Audio.sfx && Audio.sfx.pickup) Audio.sfx.pickup();
  if (typeof setNotice === 'function') setNotice(`${def.name} placed`, 1.5);
  st.cooldown = PREFAB_PLACE_CD;
  st.active = null;
  return { ok: true, reason: 'placed' };
}

// Materialize a prefab's tiles into Game.walls / Game.barrels / watchtower
// metadata. Extracted from tryPlacePrefab so the cost/validation path stays
// readable.
function spawnPrefabTiles(def, x0, y0, st) {
  const wallHpBase = (typeof WALL_HP !== 'undefined' ? WALL_HP : 250);
  const wallHp = Math.round(wallHpBase * (typeof perkMult === 'function' ? perkMult('wallHpMult') : 1));
  for (const t of def.tiles) {
    const x = x0 + t.dx * PREFAB_TILE;
    const y = y0 + t.dy * PREFAB_TILE;
    if (t.kind === 'wall') {
      Game.walls.push({
        x, y, w: PREFAB_TILE, h: PREFAB_TILE,
        hp: wallHp, maxHp: wallHp, material: t.material || 'wood',
      });
    } else if (t.kind === 'door') {
      // No door system yet — drop a wall variant tagged door:true /
      // passable:false. A future door pass can flip passable on toggle.
      const hp = Math.round(wallHp * 0.6);
      Game.walls.push({
        x, y, w: PREFAB_TILE, h: PREFAB_TILE,
        hp, maxHp: hp, material: 'wood', door: true, passable: false,
      });
    } else if (t.kind === 'workbench') {
      // Tagged Game.walls entry. findWorkbenchNear() in game.js currently
      // scans World obstacles only — the integration spec patches it to also
      // walk Game.walls so this tile lights up the workbench prompt.
      Game.walls.push({
        x, y, w: PREFAB_TILE, h: PREFAB_TILE,
        hp: 50, maxHp: 50, material: 'wood',
        style: 'workbench', kind: 'workbench', isWorkbench: true,
      });
    } else if (t.kind === 'chest') {
      // Tagged Game.walls entry containing a small scrap stash. The
      // integration spec's chest-tag patch routes openChest at it.
      Game.walls.push({
        x, y, w: PREFAB_TILE, h: PREFAB_TILE,
        hp: 60, maxHp: 60, material: 'wood',
        style: 'chest', kind: 'chest', isChest: true,
        tier: 'wood', opened: false,
        contents: [{ id: 'scrap', count: 3 }],
      });
    } else if (t.kind === 'barrel') {
      Game.barrels.push({
        x: x + PREFAB_TILE / 2, y: y + PREFAB_TILE / 2,
        r: 14, hp: 30, ignited: false, igniteT: 0,
      });
    } else if (t.kind === 'watchtower') {
      st.watchtowers.push({ x, y, w: PREFAB_TILE, h: PREFAB_TILE });
    }
  }
}

// ---------- Watchtower bonus ----------
function playerInWatchtower(p) {
  const st = Game.prefabs;
  const who = p || (Game && Game.player);
  if (!st || !who || !st.watchtowers || st.watchtowers.length === 0) return false;
  for (const t of st.watchtowers) {
    if (who.x >= t.x && who.x <= t.x + t.w && who.y >= t.y && who.y <= t.y + t.h) return true;
  }
  return false;
}

// ---------- Render ----------
// camX/camY are unused in the current render pipeline (the canvas is already
// translated for world space before this is called), but kept in the signature
// to match the call shape used elsewhere and to leave room for an HUD pass.
function drawPrefabGhost(ctx, camX, camY) {
  const st = Game.prefabs;
  if (!st || !st.active) return;
  const def = st.active;
  const x0 = st.ghostX, y0 = st.ghostY;
  ctx.save();
  for (const t of def.tiles) {
    const rx = x0 + t.dx * PREFAB_TILE;
    const ry = y0 + t.dy * PREFAB_TILE;
    if (t.kind === 'watchtower') {
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#5fb6e8';
      ctx.fillRect(rx + 2, ry + 2, PREFAB_TILE - 4, PREFAB_TILE - 4);
      continue;
    }
    const valid = isTileFree(rx, ry);
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = valid ? (PREFAB_TILE_COLOR[t.kind] || '#7a6238') : '#d24b35';
    ctx.fillRect(rx, ry, PREFAB_TILE, PREFAB_TILE);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = valid ? '#caa760' : '#d24b35';
    ctx.lineWidth = 1;
    ctx.strokeRect(rx + 0.5, ry + 0.5, PREFAB_TILE - 1, PREFAB_TILE - 1);
    const tag = t.kind === 'door' ? 'D' : t.kind === 'workbench' ? 'WB'
      : t.kind === 'chest' ? 'C' : t.kind === 'barrel' ? 'B' : '';
    if (tag) {
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = '#0b0c0e';
      ctx.font = 'bold 12px monospace';
      ctx.fillText(tag, rx + 6, ry + PREFAB_TILE - 8);
    }
  }
  ctx.restore();
}

// ---------- Workbench UI feed ----------
// Returns rows for the workbench's Prefabs tab. UI renders a button per row;
// click → enterPrefabPlacementMode(row.id).
function prefabUiRows() {
  const inv = Game.player && Game.player.inventory;
  const have = inv ? itemCount(inv, 'scrap') : 0;
  const rows = [];
  for (const id in PREFABS) {
    const def = PREFABS[id];
    rows.push({
      id: def.id, name: def.name, desc: def.desc,
      cost: def.scrapCost, affordable: have >= def.scrapCost,
    });
  }
  return rows;
}

// ---------- Save / load ----------
// Only watchtower footprints persist — walls/barrels are already covered by
// the existing save paths. Ghost state is per-tick and never saved.
function savePrefabs() {
  const st = Game.prefabs;
  if (!st) return null;
  return { watchtowers: st.watchtowers.map(t => ({ x: t.x, y: t.y, w: t.w, h: t.h })) };
}
function loadPrefabs(data) {
  if (!Game.prefabs) initPrefabs();
  if (!data) return;
  if (Array.isArray(data.watchtowers)) Game.prefabs.watchtowers = data.watchtowers.slice();
}
