'use strict';

// ---------- Moats & Pits (C·02) ----------
// Player-dug trench tiles. Flat (no z-axis): a moat tile is just a tile
// marked in `Game.moatTiles` that the renderer paints over the terrain and
// the zombie loop consults for slow / damage modifiers.
//
// Behavior:
//   - Plain moat slows non-Tank zombies to 40% speed and deals 30 dmg/sec
//     while they stand on it.
//   - Spiked moat additionally deals a one-shot 60 damage on the frame a
//     zombie *enters* it from a non-moat tile.
//   - Tanks (zombie.type === 'tank') ignore the moat entirely.
//
// State lives on Game.moatTiles, a Map keyed by "tx,ty" -> { tx, ty, spiked }.
// Map (rather than a flat grid) keeps the footprint proportional to the
// number of tiles the player has actually dug, since the world grid is
// 800x600 tiles.

// How long the player must hold G on a tile to dig it.
const MOAT_DIG_HOLD = 1.2;
// Slow multiplier applied to non-Tank zombies while on a moat tile.
const MOAT_SLOW_MULT = 0.4;
// Per-second damage applied to non-Tank zombies while on a moat tile.
const MOAT_DPS = 30;
// One-shot damage when a non-Tank zombie enters a spiked moat tile.
const MOAT_SPIKE_DMG = 60;

function _moatKey(tx, ty) { return tx + ',' + ty; }
function _tileOfPx(x, y) { return [Math.floor(x / TILE_SIZE), Math.floor(y / TILE_SIZE)]; }

// ---------- Lifecycle ----------
function initMoat() {
  Game.moatTiles = new Map();
  // Per-player dig-progress book-keeping. Held on Game so resetRun nukes it.
  Game.moatDig = { tx: null, ty: null, t: 0 };
}

// Currently a no-op — effects are pulled by zombie update. Kept exported
// so a future decoration tick (e.g. spike glint, water shimmer) has a home.
function updateMoat(dt) { /* reserved */ }

// ---------- Queries ----------
function isMoat(tx, ty) {
  return !!(Game.moatTiles && Game.moatTiles.get(_moatKey(tx, ty)));
}
function isSpikedMoat(tx, ty) {
  const m = Game.moatTiles && Game.moatTiles.get(_moatKey(tx, ty));
  return !!(m && m.spiked);
}
// World-pixel lookup: returns the moat entry under (x,y) or null.
function tileAtPx(worldX, worldY) {
  if (!Game.moatTiles) return null;
  const [tx, ty] = _tileOfPx(worldX, worldY);
  return Game.moatTiles.get(_moatKey(tx, ty)) || null;
}

// True if the tile at (tx,ty) is grass per the world terrain field. If the
// world hasn't exposed TERRAIN we fall back to "not blocked terrain" — i.e.
// allow on anything that isn't water/mountain. Walls/obstacles are handled
// by the inObstacle gate in digMoatAt.
function _isGrassTile(tx, ty) {
  const cx = tx * TILE_SIZE + TILE_SIZE / 2;
  const cy = ty * TILE_SIZE + TILE_SIZE / 2;
  if (typeof World !== 'undefined' && World && typeof World.terrainAt === 'function') {
    const t = World.terrainAt(cx, cy);
    if (typeof TERRAIN !== 'undefined') return t === TERRAIN.GRASS;
    // Without a TERRAIN enum, accept "not blocked".
    return typeof World.isBlockedTerrainAt === 'function'
      ? !World.isBlockedTerrainAt(cx, cy)
      : true;
  }
  return true;
}

// ---------- Placement ----------
// Place a moat tile under the player's cursor/feet. Conditions:
//   - tile is grass
//   - no obstacle / wall on the tile center
//   - tile is empty (not already a moat)
//   - player carries a shovel
// Returns true on success. Caller is expected to drive this from a held-key
// state and only invoke once per dig cycle.
function digMoatAt(worldX, worldY, player) {
  if (!Game.moatTiles) initMoat();
  const inv = player && player.inventory;
  if (!inv || !hasItem(inv, 'shovel', 1)) {
    setNotice('Need a shovel', 1.2);
    return false;
  }
  const [tx, ty] = _tileOfPx(worldX, worldY);
  if (tx < 0 || ty < 0 || tx * TILE_SIZE >= WORLD_W || ty * TILE_SIZE >= WORLD_H) return false;
  if (isMoat(tx, ty)) { setNotice('Already dug', 1); return false; }
  if (!_isGrassTile(tx, ty)) { setNotice('Can only dig grass', 1.2); return false; }
  const cx = tx * TILE_SIZE + TILE_SIZE / 2;
  const cy = ty * TILE_SIZE + TILE_SIZE / 2;
  // Reject if anything solid sits on this tile (wall, obstacle).
  if (typeof inObstacle === 'function' && inObstacle(cx, cy, TILE_SIZE * 0.4)) {
    setNotice('Blocked', 1); return false;
  }
  if (Game.walls) {
    for (const w of Game.walls) {
      if (cx >= w.x && cx <= w.x + w.w && cy >= w.y && cy <= w.y + w.h) {
        setNotice('Blocked', 1); return false;
      }
    }
  }
  Game.moatTiles.set(_moatKey(tx, ty), { tx, ty, spiked: false });
  setNotice('Trench dug', 1);
  if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx.click) Audio.sfx.click();
  return true;
}

// Add spikes to an existing moat tile. Consumes one rebar.
function spikeMoatAt(worldX, worldY, player) {
  if (!Game.moatTiles) return false;
  const [tx, ty] = _tileOfPx(worldX, worldY);
  const m = Game.moatTiles.get(_moatKey(tx, ty));
  if (!m) { setNotice('No trench here', 1); return false; }
  if (m.spiked) { setNotice('Already spiked', 1); return false; }
  const inv = player && player.inventory;
  if (!inv || !hasItem(inv, 'rebar', 1)) { setNotice('Need rebar', 1.2); return false; }
  removeItem(inv, 'rebar', 1);
  m.spiked = true;
  setNotice('Spikes installed', 1);
  if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx.click) Audio.sfx.click();
  return true;
}

function removeMoatAt(worldX, worldY) {
  if (!Game.moatTiles) return false;
  const [tx, ty] = _tileOfPx(worldX, worldY);
  return Game.moatTiles.delete(_moatKey(tx, ty));
}

// ---------- Zombie effect hooks (called from game.js per frame) ----------
// Convention: zombie type is `z.type` ('walker' | 'runner' | 'tank' | ...).
// (If a future build switches to `z.kind`, fall back to that too.)
function _isTank(z) {
  return z && (z.type === 'tank' || z.kind === 'tank');
}

// Speed multiplier to apply to a zombie this frame.
function moatSlowMult(zombie, worldX, worldY) {
  if (!Game.moatTiles || Game.moatTiles.size === 0) return 1;
  if (_isTank(zombie)) return 1;
  return tileAtPx(worldX, worldY) ? MOAT_SLOW_MULT : 1;
}

// Per-second damage to bleed from a zombie this frame. Multiply by dt
// yourself at the call site.
function moatDamagePerSec(zombie, worldX, worldY) {
  if (!Game.moatTiles || Game.moatTiles.size === 0) return 0;
  if (_isTank(zombie)) return 0;
  return tileAtPx(worldX, worldY) ? MOAT_DPS : 0;
}

// One-shot spike damage on the frame the zombie *crossed onto* a spiked
// moat tile. Returns the damage to apply (0 if no entry). The caller is
// responsible for tracking the zombie's previous moat tile key on the
// zombie itself (e.g. `z._lastMoatKey`) and updating it after the call:
//
//   const newKey = (() => {
//     const tx = Math.floor(z.x / TILE_SIZE), ty = Math.floor(z.y / TILE_SIZE);
//     return Game.moatTiles && Game.moatTiles.has(tx + ',' + ty) ? tx + ',' + ty : null;
//   })();
//   const dmg = moatSpikeOnEnter(z, z._lastMoatKey, newKey);
//   if (dmg) z.hp -= dmg;
//   z._lastMoatKey = newKey;
function moatSpikeOnEnter(zombie, prevKey, newKey) {
  if (_isTank(zombie)) return 0;
  if (!newKey || newKey === prevKey) return 0;
  const m = Game.moatTiles && Game.moatTiles.get(newKey);
  if (!m || !m.spiked) return 0;
  return MOAT_SPIKE_DMG;
}

// ---------- Render ----------
// Paint moat tiles on top of terrain but under walls / props. Camera coords
// match the world renderer convention (`worldX - camX`, `worldY - camY`).
function drawMoatTiles(ctx, camX, camY) {
  if (!Game.moatTiles || Game.moatTiles.size === 0) return;
  const left = camX - TILE_SIZE, right = camX + VIEW_W + TILE_SIZE;
  const top  = camY - TILE_SIZE, bottom = camY + VIEW_H + TILE_SIZE;
  for (const m of Game.moatTiles.values()) {
    const x = m.tx * TILE_SIZE, y = m.ty * TILE_SIZE;
    if (x + TILE_SIZE < left || x > right || y + TILE_SIZE < top || y > bottom) continue;
    const sx = x - camX, sy = y - camY;
    // Trench body inset 3px from the tile edge so adjacent moats read as
    // separate pits rather than one big rectangle.
    ctx.fillStyle = '#3a2a18';
    ctx.fillRect(sx + 3, sy + 3, TILE_SIZE - 6, TILE_SIZE - 6);
    // Top-edge shadow gives a fake depth cue (no actual z-axis).
    ctx.fillStyle = '#1f1610';
    ctx.fillRect(sx + 3, sy + 3, TILE_SIZE - 6, 3);
    // Subtle interior dirt streaks.
    ctx.fillStyle = '#4a3a25';
    ctx.fillRect(sx + 6, sy + TILE_SIZE - 9, 6, 2);
    ctx.fillRect(sx + TILE_SIZE - 14, sy + 10, 5, 2);
    if (m.spiked) {
      // Three small upward triangles: pale steel, dark outline.
      ctx.fillStyle = '#dadada';
      ctx.strokeStyle = '#2a2e36';
      ctx.lineWidth = 1;
      const baseY = sy + TILE_SIZE - 7;
      const xs = [sx + 9, sx + 19, sx + 29];
      for (const tx of xs) {
        ctx.beginPath();
        ctx.moveTo(tx,     baseY);
        ctx.lineTo(tx + 5, baseY);
        ctx.lineTo(tx + 2.5, baseY - 8);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }
}

// ---------- Save / Load ----------
// Serialize the Map as an array of plain entries so JSON.stringify is happy.
function saveMoat() {
  if (!Game.moatTiles) return [];
  return Array.from(Game.moatTiles.values()).map(m => ({
    tx: m.tx | 0, ty: m.ty | 0, spiked: !!m.spiked,
  }));
}
function loadMoat(data) {
  initMoat();
  if (!Array.isArray(data)) return;
  for (const m of data) {
    if (m && Number.isFinite(m.tx) && Number.isFinite(m.ty)) {
      Game.moatTiles.set(_moatKey(m.tx | 0, m.ty | 0), {
        tx: m.tx | 0, ty: m.ty | 0, spiked: !!m.spiked,
      });
    }
  }
}
