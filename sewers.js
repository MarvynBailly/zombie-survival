'use strict';

// ---------- F8: Sewers & Bunkers ----------
// Manhole props on the surface become portals into instanced, deterministic
// dungeons (8-15 rooms). Same manhole = same dungeon (seeded from world seed
// XOR manhole tile coords). One-way entry; the extraction ladder in the back
// room teleports the player back to the surface manhole.
//
// Architecture: the dungeon is rendered as a separate `World.chunks` map
// installed on entry. Player + entity arrays are swapped out so the existing
// update/render machinery (collisions, NAV flow field, bullets, pickups) all
// keep working without per-call branches. The surface state is restored when
// the player rides the ladder out.

// Constants for the dungeon generator. Kept local to avoid polluting the
// global constants table — these are tuning knobs, not gameplay primitives.
const SEWER_TILE = TILE_SIZE;            // match world tile grid so NAV cells line up
const SEWER_ROOM_MIN = 6;                // tiles per side
const SEWER_ROOM_MAX = 11;
const SEWER_ROOM_COUNT = 8;              // hand-tuned for ship-it scope
const SEWER_GRID_W = 60;                 // tiles total — keeps inside ~3 chunks
const SEWER_GRID_H = 60;
const SEWER_BORDER_TILES = 2;            // unwalkable rim around the playable area

// Hand-mix the seed off worldSeed + manhole tile coords. Same manhole always
// produces the same dungeon across sessions, even after the surface chunk is
// regenerated from its own seed.
function sewerSeedFor(manhole) {
  const mtx = Math.floor((manhole.x + manhole.w / 2) / TILE_SIZE);
  const mty = Math.floor((manhole.y + manhole.h / 2) / TILE_SIZE);
  let h = (World.seed ^ 0xD1CE_5EE7) >>> 0;
  h = (Math.imul(h, 0x85ebca6b) ^ (mtx + 0x9E3779B9)) >>> 0;
  h = (Math.imul(h, 0xc2b2ae35) ^ (mty + 0x7F4A7C15)) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}

// ---------- Room layout ----------
// A simple grid-of-rooms approach. We allocate rooms on a coarse 3x3 grid
// (with jitter) and connect them in a path so there's always a route from
// entrance to back room. Corridors are 2 tiles wide for NAV clearance.
function generateSewerLayout(seed) {
  const rng = mulberry32(seed);

  // Pick an Nx3 or 3xM grid layout, then place rooms in each cell with jitter.
  const cols = 3;
  const rows = 3;
  const cellW = Math.floor((SEWER_GRID_W - SEWER_BORDER_TILES * 2) / cols);
  const cellH = Math.floor((SEWER_GRID_H - SEWER_BORDER_TILES * 2) / rows);

  // Pick a hamiltonian-ish path through 9 cells: serpentine, but skip a couple
  // so we land on ~SEWER_ROOM_COUNT rooms. We always include the four corners.
  const cellOrder = [
    [0, 0], [1, 0], [2, 0],
    [2, 1], [1, 1], [0, 1],
    [0, 2], [1, 2], [2, 2],
  ];
  // Drop one of the middle cells (not first or last) so we get ~8 rooms.
  const dropIdx = 1 + Math.floor(rng() * (cellOrder.length - 2));
  const cellsUsed = cellOrder.filter((_, i) => i !== dropIdx);

  const rooms = cellsUsed.map(([cx, cy], idx) => {
    const w = SEWER_ROOM_MIN + Math.floor(rng() * (SEWER_ROOM_MAX - SEWER_ROOM_MIN));
    const h = SEWER_ROOM_MIN + Math.floor(rng() * (SEWER_ROOM_MAX - SEWER_ROOM_MIN));
    // Center the room inside its cell with a small jitter.
    const baseX = SEWER_BORDER_TILES + cx * cellW;
    const baseY = SEWER_BORDER_TILES + cy * cellH;
    const slackX = Math.max(0, cellW - w - 1);
    const slackY = Math.max(0, cellH - h - 1);
    return {
      x: baseX + Math.floor(rng() * (slackX + 1)),
      y: baseY + Math.floor(rng() * (slackY + 1)),
      w, h, idx,
    };
  });

  // Connect each room to the next in cellsUsed order with an L-shaped corridor.
  const corridors = [];
  for (let i = 0; i < rooms.length - 1; i++) {
    const a = rooms[i], b = rooms[i + 1];
    const ax = a.x + Math.floor(a.w / 2);
    const ay = a.y + Math.floor(a.h / 2);
    const bx = b.x + Math.floor(b.w / 2);
    const by = b.y + Math.floor(b.h / 2);
    // Random elbow direction so the dungeon isn't visually uniform.
    if (rng() < 0.5) {
      corridors.push({ x1: ax, y1: ay, x2: bx, y2: ay });
      corridors.push({ x1: bx, y1: ay, x2: bx, y2: by });
    } else {
      corridors.push({ x1: ax, y1: ay, x2: ax, y2: by });
      corridors.push({ x1: ax, y1: by, x2: bx, y2: by });
    }
  }

  return { rooms, corridors, rng };
}

// ---------- Walkable tile mask ----------
// Build a tile-resolution boolean grid: true means floor, false means concrete
// wall. Rooms + corridors carve the floor; everything else stays walled.
function buildSewerMask(layout) {
  const mask = new Uint8Array(SEWER_GRID_W * SEWER_GRID_H);
  const at = (x, y) => (x >= 0 && x < SEWER_GRID_W && y >= 0 && y < SEWER_GRID_H)
    ? y * SEWER_GRID_W + x : -1;

  for (const r of layout.rooms) {
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const idx = at(x, y);
        if (idx >= 0) mask[idx] = 1;
      }
    }
  }
  // Corridors are 2 tiles wide so the NAV inflate (22px) leaves a usable cell.
  for (const c of layout.corridors) {
    const x0 = Math.min(c.x1, c.x2), x1 = Math.max(c.x1, c.x2);
    const y0 = Math.min(c.y1, c.y2), y1 = Math.max(c.y1, c.y2);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        for (let dy = 0; dy <= 1; dy++) {
          for (let dx = 0; dx <= 1; dx++) {
            const idx = at(x + dx, y + dy);
            if (idx >= 0) mask[idx] = 1;
          }
        }
      }
    }
  }
  return mask;
}

// ---------- Chunk emission ----------
// Convert the tile mask into a set of chunk objects keyed by chunk coord
// (matching the surface World.chunks layout). The dungeon lives at chunk
// coords (originCx + 0..N, originCy + 0..N). Walls become concrete obstacles
// (stone_wall style for now, indestructible so the player can't break out).
function makeSewerChunks(mask, originCx, originCy, rng) {
  const tilesPerChunk = CHUNK_SIZE / TILE_SIZE; // 20
  const chunkCols = Math.ceil(SEWER_GRID_W / tilesPerChunk);
  const chunkRows = Math.ceil(SEWER_GRID_H / tilesPerChunk);
  const chunks = new Map();

  // Allocate empty chunks first.
  for (let cy = 0; cy < chunkRows; cy++) {
    for (let cx = 0; cx < chunkCols; cx++) {
      const wcx = originCx + cx, wcy = originCy + cy;
      const ch = {
        cx: wcx, cy: wcy, region: World.region, tier: 0,
        terrain: new Uint8Array(tilesPerChunk * tilesPerChunk),  // GRASS=0 baseline
        obstacles: [],
        chests: [],
        decor: [],
        garrison: [],
        barrels: [],
        activated: true,         // never trigger surface-style encounter spawns
        sewer: true,             // render.js branch flag — dark concrete floor
      };
      chunks.set(wcx + ',' + wcy, ch);
    }
  }

  // Emit a wall obstacle for every unwalkable tile. Bucket each into the
  // chunk whose footprint owns its center pixel.
  const stoneStyle = 'stone_wall';
  for (let ty = 0; ty < SEWER_GRID_H; ty++) {
    for (let tx = 0; tx < SEWER_GRID_W; tx++) {
      if (mask[ty * SEWER_GRID_W + tx]) continue;  // floor — skip
      const wx = (originCx * tilesPerChunk + tx) * TILE_SIZE;
      const wy = (originCy * tilesPerChunk + ty) * TILE_SIZE;
      const ccx = Math.floor((wx + TILE_SIZE / 2) / CHUNK_SIZE);
      const ccy = Math.floor((wy + TILE_SIZE / 2) / CHUNK_SIZE);
      const ch = chunks.get(ccx + ',' + ccy);
      if (!ch) continue;
      ch.obstacles.push({
        x: wx, y: wy, w: TILE_SIZE, h: TILE_SIZE,
        style: stoneStyle,
        indestructible: true,
        sewerWall: true,            // sprite shim picks a darker concrete look
      });
    }
  }

  return { chunks, chunkCols, chunkRows };
}

// Helper: world-space center of a tile coordinate inside the dungeon grid.
function tileCenter(originCx, originCy, tx, ty) {
  const tilesPerChunk = CHUNK_SIZE / TILE_SIZE;
  return {
    x: (originCx * tilesPerChunk + tx) * TILE_SIZE + TILE_SIZE / 2,
    y: (originCy * tilesPerChunk + ty) * TILE_SIZE + TILE_SIZE / 2,
  };
}

// ---------- Populate rooms ----------
// Plant chests + zombies + a mini-boss + the extraction ladder.
function populateSewer(layout, chunks, originCx, originCy, rng) {
  const rooms = layout.rooms;
  if (rooms.length < 2) return null;

  const entryRoom = rooms[0];
  const bossRoom = rooms[rooms.length - 1];

  // Entry tile: center of the first room. This is where the player lands.
  const entry = tileCenter(originCx, originCy, entryRoom.x + Math.floor(entryRoom.w / 2),
                                                entryRoom.y + Math.floor(entryRoom.h / 2));

  // Extraction ladder: planted in the boss room. We push it as a chunk-owned
  // obstacle with `kind:'ladder'` + walkable so the player can stand on it
  // and trigger E. (We don't store ladders in a separate Game array — keeping
  // them as obstacles means the chunk swap handles save/restore for free.)
  const ladderPos = tileCenter(originCx, originCy,
    bossRoom.x + Math.floor(bossRoom.w / 2),
    bossRoom.y + Math.floor(bossRoom.h / 2));
  const ladderTile = {
    x: ladderPos.x - TILE_SIZE / 2, y: ladderPos.y - TILE_SIZE / 2,
    w: TILE_SIZE, h: TILE_SIZE,
    kind: 'ladder', walkable: true, shootThrough: true,
    indestructible: true, sewerLadder: true,
  };
  const ladderChunkX = Math.floor((ladderPos.x) / CHUNK_SIZE);
  const ladderChunkY = Math.floor((ladderPos.y) / CHUNK_SIZE);
  const ladderChunk = chunks.get(ladderChunkX + ',' + ladderChunkY);
  if (ladderChunk) ladderChunk.obstacles.push(ladderTile);

  // Mythic chest by the ladder. Offset by a couple tiles in a random direction
  // that's still inside the boss room.
  const mythicOffsetX = (rng() < 0.5 ? -2 : 2);
  const mythicOffsetY = (rng() < 0.5 ? -1 : 1);
  const mtx = clamp(
    bossRoom.x + Math.floor(bossRoom.w / 2) + mythicOffsetX,
    bossRoom.x + 1, bossRoom.x + bossRoom.w - 2);
  const mty = clamp(
    bossRoom.y + Math.floor(bossRoom.h / 2) + mythicOffsetY,
    bossRoom.y + 1, bossRoom.y + bossRoom.h - 2);
  const mythicCenter = tileCenter(originCx, originCy, mtx, mty);
  const mythicChunk = chunks.get(
    Math.floor(mythicCenter.x / CHUNK_SIZE) + ',' + Math.floor(mythicCenter.y / CHUNK_SIZE));
  if (mythicChunk) {
    const mythicContents = rollChestContents(rng, 'mythic');
    const mythicHp = CHEST_TIER.mythic.hp;
    mythicChunk.chests.push({
      x: mythicCenter.x - 18, y: mythicCenter.y - 12, w: 36, h: 24,
      tier: 'mythic', hp: mythicHp, maxHp: mythicHp, opened: false,
      contents: mythicContents,
    });
  }

  // Mid-tier chests scattered in non-entry, non-boss rooms.
  for (let i = 1; i < rooms.length - 1; i++) {
    const room = rooms[i];
    // 1-2 chests per room; small rooms get 1, big rooms get 2.
    const chestCount = (room.w * room.h > 64) ? 2 : 1;
    for (let c = 0; c < chestCount; c++) {
      const tier = rng() < 0.55 ? 'iron' : 'wood';
      const ctx = room.x + 1 + Math.floor(rng() * (room.w - 2));
      const cty = room.y + 1 + Math.floor(rng() * (room.h - 2));
      const center = tileCenter(originCx, originCy, ctx, cty);
      const ch = chunks.get(
        Math.floor(center.x / CHUNK_SIZE) + ',' + Math.floor(center.y / CHUNK_SIZE));
      if (!ch) continue;
      const hp = CHEST_TIER[tier].hp;
      ch.chests.push({
        x: center.x - 18, y: center.y - 12, w: 36, h: 24,
        tier, hp, maxHp: hp, opened: false,
        contents: rollChestContents(rng, tier),
      });
    }
  }

  // Zombies. We don't pre-spawn into Game.zombies here — instead we record
  // garrison entries on the relevant chunks so the existing activation pass
  // spawns them as the player approaches. That keeps the wave-spawn director
  // off and lets the player pick fights one room at a time.
  //
  // BUT: chunk activation requires `chunk.activated = false`, and we set it
  // true above to skip the surface garrison flow. So we deliberately push
  // straight into Game.zombies on entry instead — see enterSewer below for
  // the actual spawn step. Here we just record the planned spawn points.
  const plannedZombies = [];
  const zombieMix = ['walker', 'crawler', 'runner', 'walker', 'walker'];
  for (let i = 1; i < rooms.length; i++) {
    const room = rooms[i];
    const isBoss = (i === rooms.length - 1);
    const baseCount = isBoss ? 4 : 3;
    const count = baseCount + Math.floor(rng() * 3);
    for (let z = 0; z < count; z++) {
      const tx = room.x + 1 + Math.floor(rng() * (room.w - 2));
      const ty = room.y + 1 + Math.floor(rng() * (room.h - 2));
      const center = tileCenter(originCx, originCy, tx, ty);
      let type = zombieMix[Math.floor(rng() * zombieMix.length)];
      // Sprinkle a couple of tier-2 nasties in non-boss rooms past the second.
      if (!isBoss && i >= 2 && rng() < 0.18) type = 'spitter';
      if (!isBoss && i >= 3 && rng() < 0.12) type = 'wraith';
      plannedZombies.push({ type, x: center.x, y: center.y });
    }
  }
  // Mini-boss: charger or brood near the back wall of the boss room.
  const bossType = rng() < 0.5 ? 'charger' : 'brood';
  const bossCenter = tileCenter(originCx, originCy,
    bossRoom.x + Math.floor(bossRoom.w / 2),
    bossRoom.y + 1);
  plannedZombies.push({ type: bossType, x: bossCenter.x, y: bossCenter.y, miniBoss: true });

  return { entry, ladderPos, plannedZombies };
}

// ---------- The Sewer instance ----------
// Stores everything we need to swap back to the surface cleanly.
let currentSewer = null;

// Find the manhole obstacle within radius of (x,y) on the SURFACE world.
function findManholeNear(x, y, radius) {
  let best = null, bestD = radius * radius;
  World.forEachObstacleNear(x, y, radius + TILE_SIZE, (o) => {
    if (o.kind !== 'manhole') return;
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    const dx = x - cx, dy = y - cy;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = o; }
  });
  return best;
}

// Build + enter a sewer dungeon associated with `manhole`.
function enterSewer(manhole) {
  if (currentSewer) return;  // already inside one

  // Save the surface state so we can restore it on exit.
  const p = Game.player;
  const surface = {
    chunks: World.chunks,
    zombies: Game.zombies,
    walls: Game.walls,
    pickups: Game.pickups,
    barrels: Game.barrels,
    rockets: Game.rockets,
    explosions: Game.explosions,
    puddles: Game.puddles,
    zombieProjectiles: Game.zombieProjectiles,
    corpseLog: Game.corpseLog,
    particles: Game.particles,
    spawnTimer: Game.spawnTimer,
    playerX: p.x, playerY: p.y,
    manholeKey: Math.floor((manhole.x + manhole.w / 2) / TILE_SIZE)
              + ',' + Math.floor((manhole.y + manhole.h / 2) / TILE_SIZE),
  };

  // Build the dungeon. originCx/Cy is where the dungeon's (0,0) chunk lives
  // in world coords. We pick the same chunk the player is standing in so
  // chunkOf math points at the dungeon while the player is inside.
  const seed = sewerSeedFor(manhole);
  const layout = generateSewerLayout(seed);
  const mask = buildSewerMask(layout);
  const [pcx, pcy] = World.chunkOf(manhole.x, manhole.y);
  const { chunks } = makeSewerChunks(mask, pcx, pcy, layout.rng);
  const populated = populateSewer(layout, chunks, pcx, pcy, layout.rng);
  if (!populated) { setNotice('Sewer collapsed', 1.5); return; }

  // Install the sewer as the active world. Bullets in-flight at entry are
  // dropped — they belong to the surface fight, not the dungeon. (We don't
  // save them: surface bullets are short-lived anyway.)
  surface.bullets = Game.bullets;
  World.chunks = chunks;
  Game.zombies = [];
  Game.walls = [];
  Game.pickups = [];
  Game.barrels = [];
  Game.rockets = [];
  Game.explosions = [];
  Game.puddles = [];
  Game.zombieProjectiles = [];
  Game.corpseLog = [];
  Game.particles = [];
  Game.bullets = [];
  Game.spawnTimer = 9999;  // suspend the surface spawn director while underground

  // Teleport the player to the entry tile.
  p.x = populated.entry.x;
  p.y = populated.entry.y;
  Game.camera.x = p.x - VIEW_W / 2;
  Game.camera.y = p.y - VIEW_H / 2;

  // Spawn planned zombies up-front. Denser than the surface, but stationary
  // until the player closes distance (Spatial query handles that naturally).
  for (const pz of populated.plannedZombies) {
    const z = spawnZombieAt(pz.type, pz.x, pz.y);
    if (z && pz.miniBoss) {
      // Mini-boss buff: more HP + slight damage bump so it feels like a wall.
      z.hp *= 1.6; z.maxHp = z.hp;
      z.damage *= 1.2;
      z.miniBoss = true;
    }
  }

  currentSewer = {
    surface, originCx: pcx, originCy: pcy,
    ladderX: populated.ladderPos.x, ladderY: populated.ladderPos.y,
    ladderCd: 0.8,   // tiny cooldown so the entry press doesn't immediately exit
  };
  Game.subworld = currentSewer;

  // NAV needs to rebuild against the new obstacle set.
  NAV.init();

  setBanner('SEWERS', 2);
  setNotice('Find the extraction ladder to return.', 4);
  Audio.sfx.click();
}

// Exit the sewer and restore the surface. Drops any pickups the player
// already had (they're in inventory/ammo anyway — Game.pickups is loose
// loot only).
function exitSewer() {
  if (!currentSewer) return;
  const s = currentSewer.surface;
  // Restore the surface arrays + chunk map.
  World.chunks = s.chunks;
  Game.zombies = s.zombies;
  Game.walls = s.walls;
  Game.pickups = s.pickups;
  Game.barrels = s.barrels;
  Game.rockets = s.rockets;
  Game.explosions = s.explosions;
  Game.puddles = s.puddles;
  Game.zombieProjectiles = s.zombieProjectiles;
  Game.corpseLog = s.corpseLog;
  Game.particles = s.particles;
  Game.bullets = s.bullets || [];
  Game.spawnTimer = s.spawnTimer;

  // Snap the player back to the manhole on the surface.
  Game.player.x = s.playerX;
  Game.player.y = s.playerY;
  Game.camera.x = Game.player.x - VIEW_W / 2;
  Game.camera.y = Game.player.y - VIEW_H / 2;

  currentSewer = null;
  Game.subworld = null;
  NAV.init();
  setBanner('SURFACE', 1.5);
}

// Find the extraction ladder near (x,y). Same shape as findManholeNear.
function findLadderNear(x, y, radius) {
  if (!currentSewer) return null;
  let best = null, bestD = radius * radius;
  World.forEachObstacleNear(x, y, radius + TILE_SIZE, (o) => {
    if (!o.sewerLadder) return;
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    const dx = x - cx, dy = y - cy;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = o; }
  });
  return best;
}

// Called from updatePlayer when the player presses E and nothing higher-priority
// (chest, workbench) responded. Returns true if it handled the press.
function trySewerInteract() {
  if (!Game.player || Game.player.dead) return false;
  const p = Game.player;
  if (currentSewer) {
    // Tick the cooldown that prevents the entry press from immediately exiting.
    if (currentSewer.ladderCd > 0) return false;
    const ladder = findLadderNear(p.x, p.y, CHEST_PROMPT_RADIUS);
    if (ladder) { exitSewer(); return true; }
    return false;
  }
  const manhole = findManholeNear(p.x, p.y, CHEST_PROMPT_RADIUS);
  if (manhole) { enterSewer(manhole); return true; }
  return false;
}

// Tick the sewer's own per-frame bookkeeping (cooldowns). Called from tick().
function tickSewer(dt) {
  if (!currentSewer) return;
  if (currentSewer.ladderCd > 0) currentSewer.ladderCd -= dt;
}

// ---------- Prompt rendering ----------
// Drawn from render.js after the chest prompt so a chest in range wins.
function drawSewerPrompt(ctx) {
  if (!Game.player || Game.player.dead) return;
  const p = Game.player;
  // Don't draw if a chest prompt is already up.
  if (findChestNear(p.x, p.y, CHEST_PROMPT_RADIUS)) return;
  let target = null, label = '';
  if (currentSewer) {
    if (currentSewer.ladderCd > 0) return;
    target = findLadderNear(p.x, p.y, CHEST_PROMPT_RADIUS);
    if (target) label = '[E] EXTRACT TO SURFACE';
  } else {
    target = findManholeNear(p.x, p.y, CHEST_PROMPT_RADIUS);
    if (target) label = '[E] DESCEND INTO SEWERS';
  }
  if (!target) return;
  const sx = (target.x + target.w / 2) - Game.camera.x;
  const sy = target.y - Game.camera.y - 16;
  ctx.save();
  ctx.font = 'bold 11px "Manrope", sans-serif';
  const w = ctx.measureText(label).width + 14;
  ctx.fillStyle = 'rgba(11,12,14,0.85)';
  ctx.fillRect(sx - w / 2, sy - 16, w, 18);
  ctx.strokeStyle = '#7ad9c0';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx - w / 2 + 0.5, sy - 16 + 0.5, w - 1, 17);
  ctx.fillStyle = '#e8e6df';
  ctx.textAlign = 'center';
  ctx.fillText(label, sx, sy - 4);
  ctx.restore();
}

// Helper exposed to render.js: returns true if we're currently in a sewer
// instance, so the renderer can paint a dark concrete background instead of
// the cached chunk-surface terrain.
function inSewer() { return !!currentSewer; }

// Paint a sewer floor tile under a chunk. Called from the render path when
// chunk.sewer is true. Plain dark concrete with a faint grout grid.
function paintSewerChunk(ctx, chunk) {
  const cs = CHUNK_SIZE;
  const x = chunk.cx * cs, y = chunk.cy * cs;
  ctx.fillStyle = '#1a1c20';
  ctx.fillRect(x, y, cs, cs);
  // Faint grid to read floor extent. One line per 80px (every 2 tiles) so it's
  // not visually noisy.
  ctx.strokeStyle = 'rgba(60,70,82,0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let gx = 0; gx <= cs; gx += 80) {
    ctx.moveTo(x + gx + 0.5, y);
    ctx.lineTo(x + gx + 0.5, y + cs);
  }
  for (let gy = 0; gy <= cs; gy += 80) {
    ctx.moveTo(x, y + gy + 0.5);
    ctx.lineTo(x + cs, y + gy + 0.5);
  }
  ctx.stroke();
}

// Draw the extraction ladder in render.js's obstacle pass when it sees an
// obstacle with sewerLadder. Distinct silhouette so the player spots it.
function drawSewerLadder(ctx, o) {
  // Floor pad first (so the rungs aren't floating on pure dark concrete).
  ctx.fillStyle = '#2a2e36';
  ctx.fillRect(o.x + 2, o.y + 2, o.w - 4, o.h - 4);
  // Two rails + four rungs in pale steel.
  ctx.fillStyle = '#cad0d8';
  ctx.fillRect(o.x + 10, o.y + 4, 4, o.h - 8);
  ctx.fillRect(o.x + o.w - 14, o.y + 4, 4, o.h - 8);
  for (let i = 0; i < 4; i++) {
    const ry = o.y + 6 + i * ((o.h - 12) / 3);
    ctx.fillRect(o.x + 10, ry, o.w - 20, 3);
  }
  // Up-arrow hint so the player understands it's an exit.
  ctx.fillStyle = '#7ad9c0';
  const cx = o.x + o.w / 2;
  ctx.beginPath();
  ctx.moveTo(cx, o.y + 6);
  ctx.lineTo(cx + 5, o.y + 12);
  ctx.lineTo(cx - 5, o.y + 12);
  ctx.closePath();
  ctx.fill();
}

// Concrete sewer-wall variant. Darker + greener-grey than the surface
// stone_wall so the dungeon doesn't look like a generic ruin.
function drawSewerWall(ctx, o) {
  ctx.fillStyle = '#33363c';
  ctx.fillRect(o.x, o.y, o.w, o.h);
  // Mortar lines: vertical stagger between rows.
  ctx.strokeStyle = '#1a1c20';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(o.x, o.y + o.h / 2 + 0.5);
  ctx.lineTo(o.x + o.w, o.y + o.h / 2 + 0.5);
  ctx.stroke();
  // Faint highlight along the top edge.
  ctx.fillStyle = 'rgba(255,255,255,0.04)';
  ctx.fillRect(o.x, o.y, o.w, 2);
}

// Export so other modules can probe the sewer state.
window.Sewers = {
  enterSewer, exitSewer, findManholeNear, findLadderNear,
  trySewerInteract, tickSewer, drawSewerPrompt,
  inSewer, paintSewerChunk, drawSewerLadder, drawSewerWall,
};
