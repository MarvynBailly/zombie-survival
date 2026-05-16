'use strict';

// ---------- Utilities ----------
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y; return dx*dx + dy*dy; };
const len = (x, y) => Math.hypot(x, y);
const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return [x/l, y/l]; };
const lerp = (a, b, t) => a + (b - a) * t;
const choice = arr => arr[Math.floor(Math.random() * arr.length)];
const now = () => performance.now() / 1000;

// Seeded-RNG variants (parallel to rand/randi/choice but take an explicit rng).
function rrange(rng, a, b) { return a + rng() * (b - a); }
function rint(rng, a, b) { return Math.floor(rrange(rng, a, b)); }
function rpick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

function circleRectCollide(cx, cy, cr, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx, dy = cy - ny;
  return dx*dx + dy*dy < cr*cr;
}
function resolveCircleRect(e, rect) {
  const nx = clamp(e.x, rect.x, rect.x + rect.w);
  const ny = clamp(e.y, rect.y, rect.y + rect.h);
  const dx = e.x - nx, dy = e.y - ny;
  const d = Math.hypot(dx, dy);
  if (d === 0) {
    // inside rect — push out toward nearest edge
    const left = Math.abs(e.x - rect.x);
    const right = Math.abs(rect.x + rect.w - e.x);
    const top = Math.abs(e.y - rect.y);
    const bot = Math.abs(rect.y + rect.h - e.y);
    const m = Math.min(left, right, top, bot);
    if (m === left) e.x = rect.x - e.r;
    else if (m === right) e.x = rect.x + rect.w + e.r;
    else if (m === top) e.y = rect.y - e.r;
    else e.y = rect.y + rect.h + e.r;
    return true;
  }
  if (d < e.r) {
    e.x = nx + (dx / d) * e.r;
    e.y = ny + (dy / d) * e.r;
    return true;
  }
  return false;
}
function segmentRectHit(x1, y1, x2, y2, r) {
  // Liang-Barsky clip
  const dx = x2 - x1, dy = y2 - y1;
  let t0 = 0, t1 = 1;
  const p = [-dx, dx, -dy, dy];
  const q = [x1 - r.x, r.x + r.w - x1, y1 - r.y, r.y + r.h - y1];
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return null;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) { if (t > t1) return null; if (t > t0) t0 = t; }
      else { if (t < t0) return null; if (t < t1) t1 = t; }
    }
  }
  return { t: t0, x: x1 + t0 * dx, y: y1 + t0 * dy };
}

// ---------- Seeded PRNG (mulberry32) ----------
// Each chunk seeds its own RNG so generation is deterministic across revisits.
function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function chunkSeed(worldSeed, cx, cy) {
  // Hash-mix world seed with chunk coords so neighboring chunks aren't correlated.
  let h = worldSeed >>> 0;
  h = (Math.imul(h, 0x85ebca6b) ^ (cx + 0x9E3779B9)) >>> 0;
  h = (Math.imul(h, 0xc2b2ae35) ^ (cy + 0x7F4A7C15)) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}
function zoneSeed(worldSeed, zx, zy) {
  // Distinct hash space from chunk seeds — XOR with a constant so a zone's
  // RNG never aligns with the RNG of any of its constituent chunks.
  let h = (worldSeed ^ 0xA5A5_3C3C) >>> 0;
  h = (Math.imul(h, 0x27d4eb2d) ^ (zx + 0xB7E15163)) >>> 0;
  h = (Math.imul(h, 0x165667b1) ^ (zy + 0xC2B2AE3D)) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h;
}
const chunkKey = (cx, cy) => cx + ',' + cy;
const zoneKey = (zx, zy) => zx + ',' + zy;

// ---------- Terrain ----------
// World terrain is sampled per tile from two noise fields (elevation and
// moisture). Each REGION preset (see defs.js: LEVELS) biases the thresholds
// so a "Coast" world has more water, a "Highlands" world has more mountain,
// etc. Blocked terrain (water, mountain) is emitted as obstacle entries
// flagged `o.terrain = true` so collision + nav pick them up while the
// renderer can skip them (terrain pass handles painting).

const TERRAIN = Object.freeze({
  GRASS:         0,
  FOREST:        1,
  SAND:          2,
  SHALLOW_WATER: 3,
  DEEP_WATER:    4,
  HILL:          5,
  MOUNTAIN:      6,
  PATH:          7,  // reserved — POIs may stamp gravel/road paths
});
const TERRAIN_BLOCKED = (() => {
  const a = new Uint8Array(8);
  a[TERRAIN.SHALLOW_WATER] = 1;
  a[TERRAIN.DEEP_WATER]    = 1;
  a[TERRAIN.MOUNTAIN]      = 1;
  return a;
})();
function terrainBlocks(t) { return !!TERRAIN_BLOCKED[t]; }

// Default region (used when LEVELS hasn't supplied one — e.g. legacy saves).
const DEFAULT_REGION = Object.freeze({
  name: 'Plains',
  // Noise frequencies (cycles per tile). Smaller = bigger features.
  elevFreq:     1 / 28,
  moistFreq:    1 / 22,
  // Thresholds applied to noise in [0,1].
  deepWater:    0.30,
  shallowWater: 0.36,
  sand:         0.41,
  hill:         0.66,
  mountain:     0.74,
  forestMoist:  0.58,
  // POI density bias (1.0 = baseline).
  poiDensity:   1.0,
  // Spawn ring radius (tiles) forced to grass.
  spawnSafe:    16,
});

// 2D hash → uniform [0,1).
function _hash2(seed, ix, iy) {
  let h = seed >>> 0;
  h = (Math.imul(h, 0x85ebca6b) ^ (ix | 0)) >>> 0;
  h = (Math.imul(h, 0xc2b2ae35) ^ (iy | 0)) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  h = (Math.imul(h, 0x27d4eb2d)) >>> 0;
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

// Smooth value noise sampled at floating (x,y). Returns ~[0,1].
function valueNoise2D(seed, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const a = _hash2(seed, xi,     yi);
  const b = _hash2(seed, xi + 1, yi);
  const c = _hash2(seed, xi,     yi + 1);
  const d = _hash2(seed, xi + 1, yi + 1);
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

// Fractal Brownian motion (a few octaves of value noise). Returns ~[0,1].
function fbm2D(seed, x, y, octaves) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  octaves = octaves || 4;
  for (let i = 0; i < octaves; i++) {
    sum += amp * valueNoise2D((seed + i * 0x9E3779B9) >>> 0, x * freq, y * freq);
    norm += amp;
    amp *= 0.5;
    freq *= 2.0;
  }
  return sum / norm;
}

// Decide terrain type at a world tile coordinate (tx, ty in tile units).
// Pure function of (seed, region, tx, ty). The spawn-safe override is applied
// by the caller so this remains stable for previews / minimap sampling.
function classifyTerrain(seed, region, tx, ty) {
  const r = region || DEFAULT_REGION;
  const elev = fbm2D(seed, tx * r.elevFreq, ty * r.elevFreq, 4);
  if (elev < r.deepWater)    return TERRAIN.DEEP_WATER;
  if (elev < r.shallowWater) return TERRAIN.SHALLOW_WATER;
  if (elev < r.sand)         return TERRAIN.SAND;
  if (elev > r.mountain)     return TERRAIN.MOUNTAIN;
  if (elev > r.hill)         return TERRAIN.HILL;
  // Mid-elevation: forest where moisture is high.
  const moist = fbm2D((seed ^ 0x6D2B79F5) >>> 0,
                       tx * r.moistFreq, ty * r.moistFreq, 3);
  if (moist > r.forestMoist) return TERRAIN.FOREST;
  return TERRAIN.GRASS;
}

// Override classifyTerrain near the spawn point: a disk of `region.spawnSafe`
// tiles centered on spawn is forced to GRASS so the player isn't dropped
// into water/mountain. A 2-tile feather toward SAND smooths the edge.
function terrainAtTile(seed, region, tx, ty, world) {
  const t = classifyTerrain(seed, region, tx, ty);
  if (!world) return t;
  const stx = (world.spawnX / TILE_SIZE) | 0;
  const sty = (world.spawnY / TILE_SIZE) | 0;
  const dx = tx - stx, dy = ty - sty;
  const d2 = dx * dx + dy * dy;
  const safe = region ? region.spawnSafe : DEFAULT_REGION.spawnSafe;
  if (d2 <= safe * safe) return TERRAIN.GRASS;
  if (d2 <= (safe + 2) * (safe + 2) && terrainBlocks(t)) return TERRAIN.SAND;
  return t;
}

// Convenience for callers operating in world pixels (collision, ui, etc.).
function terrainAtPx(seed, region, x, y, world) {
  return terrainAtTile(seed, region, Math.floor(x / TILE_SIZE),
                                      Math.floor(y / TILE_SIZE), world);
}

// ---------- POI system ----------
// World is partitioned into ZONE_CHUNKS x ZONE_CHUNKS chunk zones. Each zone
// gets at most one POI, deterministic from its seed and distance tier from
// the world spawn. POIs are emitted as tile-grid obstacles; large POIs span
// multiple chunks and are emitted chunk-by-chunk via the same deterministic
// function (each chunk only keeps the tiles whose center falls inside it).

// Cache keyed by "zx,zy" — poiForZone is called many times per chunk gen
// (each chunk checks its 3x3 zone neighborhood), so memoize.
const _poiCache = new Map();

function poiForZone(worldSeed, zx, zy, region, world) {
  // Key includes worldSeed + spawn so different worlds (level previews use a
  // throwaway seed/spawn) don't collide with the real game's cache.
  const rname = (region && region.name) || 'default';
  const key = worldSeed + ':' + rname + ':' + world.spawnX + ',' + world.spawnY + '|' + zx + ',' + zy;
  if (_poiCache.has(key)) return _poiCache.get(key);
  const result = _computePoiForZone(worldSeed, zx, zy, region, world);
  _poiCache.set(key, result);
  return result;
}

// POI kind sizes — used both for placement and footprint terrain checks.
const POI_SIZES = {
  hut:           [5, 5],
  cottage:       [7, 7],
  campsite:      [10, 10],
  house:         [10, 8],
  gas_station:   [14, 10],
  warehouse:     [18, 14],
  town:          [28, 28],
  city:          [36, 36],
  fishing_dock:  [9, 7],
  lumber_camp:   [11, 9],
  mining_outpost:[12, 10],
  farm:          [16, 12],
};

// Sample terrain across a POI footprint; returns counts by terrain class so
// the picker can decide whether the POI fits and which terrain-flavored kind
// to choose.
function _samplePoiFootprint(worldSeed, region, otx, oty, tileW, tileH, world) {
  let water = 0, mountain = 0, forest = 0, total = 0;
  const step = Math.max(1, Math.floor(Math.min(tileW, tileH) / 4));
  for (let ty = 0; ty < tileH; ty += step) {
    for (let tx = 0; tx < tileW; tx += step) {
      const t = terrainAtTile(worldSeed, region, otx + tx, oty + ty, world);
      total++;
      if (t === TERRAIN.DEEP_WATER || t === TERRAIN.SHALLOW_WATER) water++;
      else if (t === TERRAIN.MOUNTAIN) mountain++;
      else if (t === TERRAIN.FOREST) forest++;
    }
  }
  return { water, mountain, forest, total };
}

function _computePoiForZone(worldSeed, zx, zy, region, world) {
  const seed = zoneSeed(worldSeed, zx, zy);
  const rng = mulberry32(seed);

  // Tier = Chebyshev distance in zones from the spawn zone.
  const szx = Math.floor(world.spawnX / ZONE_PX);
  const szy = Math.floor(world.spawnY / ZONE_PX);
  const tier = Math.max(Math.abs(zx - szx), Math.abs(zy - szy));
  if (tier === 0) return null; // spawn zone stays clear

  // POI presence rate ramps with tier; region.poiDensity scales it.
  const density = (region && region.poiDensity) || 1.0;
  const basePresence = tier === 1 ? 0.55
                     : tier === 2 ? 0.70
                     : tier === 3 ? 0.78
                                  : 0.82;
  if (rng() > basePresence * density) return null;

  // Look at the zone's center tile to bias kind selection by local terrain:
  // forest tiles → lumber camps; coastline → fishing docks; mountainside →
  // mining outposts. Without this, the new structures never appear because
  // the random pick weights them low.
  const zoneCx = zx * ZONE_TILES + (ZONE_TILES >> 1);
  const zoneCy = zy * ZONE_TILES + (ZONE_TILES >> 1);
  // Sample a small ring around the zone center to detect adjacency to water /
  // mountain (so docks land near a shoreline, not in the middle of land).
  let nearWater = 0, nearMountain = 0, nearForest = 0;
  for (let dy = -4; dy <= 4; dy += 2) {
    for (let dx = -4; dx <= 4; dx += 2) {
      const t = terrainAtTile(worldSeed, region, zoneCx + dx, zoneCy + dy, world);
      if (t === TERRAIN.DEEP_WATER || t === TERRAIN.SHALLOW_WATER) nearWater++;
      else if (t === TERRAIN.MOUNTAIN) nearMountain++;
      else if (t === TERRAIN.FOREST) nearForest++;
    }
  }
  const adjacentWater    = nearWater    >= 3 && nearWater    <= 18;
  const adjacentMountain = nearMountain >= 3 && nearMountain <= 18;
  const denseForest      = nearForest   >= 8;

  // Kind selection: prefer terrain-flavored kinds when adjacency hits.
  const k = rng();
  let kind;
  if (adjacentWater && k < 0.65) {
    kind = 'fishing_dock';
  } else if (adjacentMountain && k < 0.6) {
    kind = tier >= 2 && k < 0.30 ? 'mining_outpost' : 'mining_outpost';
  } else if (denseForest && k < 0.55) {
    kind = 'lumber_camp';
  } else if (tier === 1) {
    kind = k < 0.40 ? 'hut'
         : k < 0.72 ? 'campsite'
         : k < 0.92 ? 'cottage'
         :            'farm';
  } else if (tier === 2) {
    kind = k < 0.28 ? 'house'
         : k < 0.48 ? 'cottage'
         : k < 0.66 ? 'gas_station'
         : k < 0.82 ? 'farm'
         :            'campsite';
  } else if (tier === 3) {
    kind = k < 0.30 ? 'house'
         : k < 0.52 ? 'warehouse'
         : k < 0.72 ? 'gas_station'
         : k < 0.86 ? 'farm'
         :            'town';
  } else {
    kind = k < 0.30 ? 'town'
         : k < 0.55 ? 'warehouse'
         : k < 0.80 ? 'house'
         :            'city';
  }

  const [fw, fh] = POI_SIZES[kind];

  // Try a few positions inside the zone — bail on any that land in blocked
  // terrain. If every try fails, drop the POI rather than corrupt the world.
  const margin = 2;
  const maxTx = Math.max(margin + 1, ZONE_TILES - fw - margin);
  const maxTy = Math.max(margin + 1, ZONE_TILES - fh - margin);
  let originX = 0, originY = 0, otx = 0, oty = 0, placed = false;
  for (let attempt = 0; attempt < 6 && !placed; attempt++) {
    otx = (zx * ZONE_TILES) + margin + Math.floor(rng() * (maxTx - margin));
    oty = (zy * ZONE_TILES) + margin + Math.floor(rng() * (maxTy - margin));
    const sample = _samplePoiFootprint(worldSeed, region, otx, oty, fw, fh, world);
    // Allow shoreline dock to overlap a small amount of water; everything else
    // must be 100% on dry land.
    const allowance = (kind === 'fishing_dock') ? 0.35 : 0.0;
    const blockedFrac = (sample.water + sample.mountain) / sample.total;
    if (blockedFrac <= allowance) {
      originX = otx * TILE_SIZE;
      originY = oty * TILE_SIZE;
      placed = true;
    }
  }
  if (!placed) return null;

  // Loot tier: POI's chest tiers scale with distance.
  // tier 1 → wood, tier 2 → wood/iron, tier 3 → iron heavy, tier 4+ → iron + mythic.
  const lootTier = tier;

  return {
    kind, seed, tier, lootTier,
    zx, zy,
    originX, originY,
    tileW: fw, tileH: fh,
    centerX: originX + (fw * TILE_SIZE) / 2,
    centerY: originY + (fh * TILE_SIZE) / 2,
    region,
  };
}

// Returns an array of POIs whose footprints might intersect the given chunk.
// A chunk is at most 800px wide; the largest POI is ~36 tiles = 1440px, so
// neighbor zones up to 1 zone away can spill in.
function poisOverlappingChunk(worldSeed, cx, cy, region, world) {
  const zx0 = Math.floor((cx * CHUNK_SIZE) / ZONE_PX);
  const zy0 = Math.floor((cy * CHUNK_SIZE) / ZONE_PX);
  const chunkX0 = cx * CHUNK_SIZE, chunkY0 = cy * CHUNK_SIZE;
  const chunkX1 = chunkX0 + CHUNK_SIZE, chunkY1 = chunkY0 + CHUNK_SIZE;
  const out = [];
  for (let dzy = -1; dzy <= 1; dzy++) {
    for (let dzx = -1; dzx <= 1; dzx++) {
      const poi = poiForZone(worldSeed, zx0 + dzx, zy0 + dzy, region, world);
      if (!poi) continue;
      const px1 = poi.originX + poi.tileW * TILE_SIZE;
      const py1 = poi.originY + poi.tileH * TILE_SIZE;
      // AABB overlap test
      if (poi.originX < chunkX1 && px1 > chunkX0 &&
          poi.originY < chunkY1 && py1 > chunkY0) {
        out.push(poi);
      }
    }
  }
  return out;
}

// ---------- Sinks ----------
// Helpers used by POI emitters to push tiles/chests/decor/garrison/barrels
// into a chunk's lists, filtering by "does the tile center fall in this chunk?"
// so each chunk owns each entity exactly once even when a POI spans chunks.

function _inChunk(x, y, cx, cy) {
  const x0 = cx * CHUNK_SIZE, y0 = cy * CHUNK_SIZE;
  return x >= x0 && x < x0 + CHUNK_SIZE && y >= y0 && y < y0 + CHUNK_SIZE;
}

// Attaches hp/maxHp to an obstacle whose style is breakable.
function _withHp(o) {
  const hp = OBSTACLE_HP[o.style];
  if (hp) { o.hp = hp; o.maxHp = hp; }
  return o;
}

function makeSinks(chunk, cx, cy) {
  return {
    chunk, cx, cy,
    obstacle(x, y, w, h, style) {
      if (_inChunk(x + w / 2, y + h / 2, cx, cy)) {
        chunk.obstacles.push(_withHp({ x, y, w, h, style }));
      }
    },
    // Expansion blocks/props placed by `kind` (dispatched in sprites.js to
    // ZExpand / ZProps). `opts` may include hp / explodes / explodeR /
    // shootThrough / flammable / walkable / leavesPuddle / indestructible.
    kindObstacle(x, y, w, h, kind, opts) {
      if (!_inChunk(x + w / 2, y + h / 2, cx, cy)) return;
      const o = { x, y, w, h, kind };
      if (opts) Object.assign(o, opts);
      if (o.hp) o.maxHp = o.hp;
      chunk.obstacles.push(o);
    },
    tile(tx, ty, style) {
      // tx, ty in world tile coords; emit a TILE_SIZE square at (tx*TILE_SIZE, ty*TILE_SIZE)
      const x = tx * TILE_SIZE, y = ty * TILE_SIZE;
      if (_inChunk(x + TILE_SIZE / 2, y + TILE_SIZE / 2, cx, cy)) {
        chunk.obstacles.push(_withHp({ x, y, w: TILE_SIZE, h: TILE_SIZE, style }));
      }
    },
    decor(x, y, w, h, style) {
      if (_inChunk(x + w / 2, y + h / 2, cx, cy)) {
        chunk.decor.push({ x, y, w, h, style });
      }
    },
    decorTile(tx, ty, style) {
      const x = tx * TILE_SIZE, y = ty * TILE_SIZE;
      if (_inChunk(x + TILE_SIZE / 2, y + TILE_SIZE / 2, cx, cy)) {
        chunk.decor.push({ x, y, w: TILE_SIZE, h: TILE_SIZE, style });
      }
    },
    chest(x, y, tier, contents) {
      // Chest's center anchor for chunk ownership.
      if (_inChunk(x + 18, y + 12, cx, cy)) {
        const hp = CHEST_TIER[tier].hp;
        chunk.chests.push({
          x, y, w: 36, h: 24,
          tier, hp, maxHp: hp, opened: false, contents,
        });
      }
    },
    garrison(type, x, y) {
      if (_inChunk(x, y, cx, cy)) {
        chunk.garrison.push({ type, x, y });
      }
    },
    barrel(x, y) {
      if (_inChunk(x, y, cx, cy)) {
        chunk.barrels.push({ x, y, r: 14, hp: 30, ignited: false, igniteT: 0 });
      }
    },
  };
}

// ---------- POI emitters ----------
// Each emitter is deterministic from poi.seed. cx/cy is the chunk being
// generated; sinks filters out anything that doesn't belong to this chunk.

// Returns a chest tier weighted by the POI's loot tier.
function pickChestTier(rng, lootTier) {
  const r = rng();
  if (lootTier <= 1)   return 'wood';
  if (lootTier === 2) return r < 0.7 ? 'wood' : 'iron';
  if (lootTier === 3) return r < 0.4 ? 'wood' : r < 0.92 ? 'iron' : 'mythic';
  if (lootTier === 4) return r < 0.2 ? 'wood' : r < 0.78 ? 'iron' : 'mythic';
  return r < 0.10 ? 'wood' : r < 0.62 ? 'iron' : 'mythic';
}

// ---------- Procedural building generator (BSP rooms + furniture) ----------
// Splits the footprint into rooms via recursive binary partitioning, picks a
// front door, then carves interior doors between adjacent rooms. Each room is
// tagged with a function (bedroom, kitchen, living, storage, hall) and the
// furniture pass scatters style-appropriate decor + obstacles. Loot chests
// are spread across "rich" rooms instead of dumped at the building center.
//
// All wall/door widths follow the same NAV constraint as the legacy emitter:
// interior and exterior doors are 2 tiles (80px) wide so the flow field
// retains an unblocked NAV cell after the 22px wall inflate.

const ROOM_KINDS = ['bedroom', 'kitchen', 'living', 'storage', 'hall', 'workshop', 'bath'];
const ROOM_LOOT_BIAS = {
  bedroom:  1.0,
  kitchen:  0.6,
  living:   0.8,
  storage:  1.3,
  workshop: 1.1,
  bath:     0.3,
  hall:     0.1,
};

// Recursive BSP. Returns a flat list of room rects (tileW/tileH inclusive of
// the surrounding wall — rooms share walls with neighbors).
function _bspSplit(rng, ox, oy, w, h, minDim, depth) {
  // Stop when too small to usefully split, or randomly to allow some bigger rooms.
  if (depth <= 0 || w < minDim * 2 + 1 || h < minDim * 2 + 1 || rng() < 0.18) {
    return [{ ox, oy, w, h }];
  }
  // Split on the longer axis with a small jitter to avoid grid-perfect layouts.
  const horizontal = w > h
    ? (rng() < 0.78)         // wide: usually split vertically (down the X axis)
    : (rng() < 0.22);
  if (horizontal) {
    // horizontal cut: top + bottom
    const cutMin = Math.max(minDim, 3);
    const cutMax = h - Math.max(minDim, 3);
    if (cutMax <= cutMin) return [{ ox, oy, w, h }];
    const cut = cutMin + Math.floor(rng() * (cutMax - cutMin));
    return [
      ..._bspSplit(rng, ox, oy,         w, cut + 1, minDim, depth - 1),
      ..._bspSplit(rng, ox, oy + cut,   w, h - cut, minDim, depth - 1),
    ];
  } else {
    const cutMin = Math.max(minDim, 3);
    const cutMax = w - Math.max(minDim, 3);
    if (cutMax <= cutMin) return [{ ox, oy, w, h }];
    const cut = cutMin + Math.floor(rng() * (cutMax - cutMin));
    return [
      ..._bspSplit(rng, ox,         oy, cut + 1, h, minDim, depth - 1),
      ..._bspSplit(rng, ox + cut,   oy, w - cut, h, minDim, depth - 1),
    ];
  }
}

// True when rooms share a wall segment long enough to fit a 2-tile door
// (not just touching at a corner).
function _adjacency(a, b) {
  // vertical shared wall — a is left, b is right (or vice versa)
  if (a.ox + a.w - 1 === b.ox) {
    const y0 = Math.max(a.oy, b.oy) + 1;
    const y1 = Math.min(a.oy + a.h - 1, b.oy + b.h - 1) - 1;
    if (y1 - y0 >= 1) return { axis: 'v', x: a.ox + a.w - 1, y0, y1 };
  }
  if (b.ox + b.w - 1 === a.ox) return _adjacency(b, a);
  // horizontal shared wall — a is top, b is bottom (or vice versa)
  if (a.oy + a.h - 1 === b.oy) {
    const x0 = Math.max(a.ox, b.ox) + 1;
    const x1 = Math.min(a.ox + a.w - 1, b.ox + b.w - 1) - 1;
    if (x1 - x0 >= 1) return { axis: 'h', y: a.oy + a.h - 1, x0, x1 };
  }
  if (b.oy + b.h - 1 === a.oy) return _adjacency(b, a);
  return null;
}

// Carve out a 2-tile-wide door cell into `doorMap` keyed by "tx,ty".
function _carveDoor(doorMap, axis, posA, posB) {
  if (axis === 'v') {
    doorMap.add(posA + ',' + posB);
    doorMap.add(posA + ',' + (posB + 1));
  } else {
    doorMap.add(posA + ',' + posB);
    doorMap.add((posA + 1) + ',' + posB);
  }
}

// Pick a coherent kind set for a building based on its overall function:
// 'home' (bedroom/kitchen/living), 'depot' (storage/workshop), 'farmhouse'.
function _pickRoomKind(rng, theme, idx, total) {
  if (theme === 'depot')    return idx === 0 ? 'storage'  : (rng() < 0.7 ? 'storage' : 'workshop');
  if (theme === 'farmhouse')return idx === 0 ? 'storage'  : rpick(rng, ['kitchen', 'bedroom', 'living', 'workshop']);
  // home
  if (total <= 1) return 'living';
  if (idx === 0) return 'living';
  return rpick(rng, ['bedroom', 'bedroom', 'kitchen', 'storage', 'bath']);
}

// Furniture catalog: each entry is a [styleKey, isObstacle?] pair. Sinks
// receives obstacle tiles via .tile and decor via .decorTile.
function _placeFurniture(sinks, rng, room, kind, wallStyle, floorStyle, poi, lootRoll) {
  // Inner playable area (skip 1-tile wall ring).
  const x0 = room.ox + 1, y0 = room.oy + 1;
  const x1 = room.ox + room.w - 2, y1 = room.oy + room.h - 2;
  const rw = x1 - x0 + 1, rh = y1 - y0 + 1;
  if (rw <= 0 || rh <= 0) return;

  // Helper to pick a free interior tile (avoids door cells the caller already
  // carved, since those become wall->floor; sharing collision rect with
  // furniture would awkwardly block doors).
  const pick = () => ({ tx: x0 + rint(rng, 0, rw), ty: y0 + rint(rng, 0, rh) });

  if (kind === 'bedroom') {
    // 1-2 beds against a wall
    const bedCount = rh >= 4 ? rint(rng, 1, 3) : 1;
    for (let i = 0; i < bedCount; i++) {
      const side = rint(rng, 0, 4);
      let tx, ty;
      if (side === 0)      { tx = x0 + rint(rng, 0, rw); ty = y0; }
      else if (side === 1) { tx = x1;                    ty = y0 + rint(rng, 0, rh); }
      else if (side === 2) { tx = x0 + rint(rng, 0, rw); ty = y1; }
      else                 { tx = x0;                    ty = y0 + rint(rng, 0, rh); }
      sinks.tile(tx, ty, 'bed');
    }
    if (rng() < 0.6) { const p = pick(); sinks.tile(p.tx, p.ty, 'dresser'); }
  } else if (kind === 'kitchen') {
    // Counters along one edge
    const horizontal = rng() < 0.5;
    if (horizontal) {
      const y = rng() < 0.5 ? y0 : y1;
      for (let tx = x0; tx <= x1; tx++) if (rng() < 0.75) sinks.tile(tx, y, 'counter');
    } else {
      const x = rng() < 0.5 ? x0 : x1;
      for (let ty = y0; ty <= y1; ty++) if (rng() < 0.75) sinks.tile(x, ty, 'counter');
    }
    if (rng() < 0.8) { const p = pick(); sinks.tile(p.tx, p.ty, 'stove'); }
    if (rng() < 0.6) { const p = pick(); sinks.tile(p.tx, p.ty, 'table'); }
  } else if (kind === 'living') {
    // Sofa + table + rug
    if (rng() < 0.85) { const p = pick(); sinks.tile(p.tx, p.ty, 'sofa'); }
    if (rng() < 0.70) { const p = pick(); sinks.tile(p.tx, p.ty, 'table'); }
    // a couple of decorative tiles
    for (let i = 0; i < rint(rng, 0, 3); i++) {
      const p = pick(); sinks.decorTile(p.tx, p.ty, 'rug');
    }
  } else if (kind === 'storage' || kind === 'workshop') {
    // Crates + shelves; workshop adds a workbench
    const items = kind === 'workshop' ? rint(rng, 2, 5) : rint(rng, 3, 7);
    for (let i = 0; i < items; i++) {
      const p = pick();
      const r = rng();
      const style = r < 0.5 ? 'crate'
                  : r < 0.75 ? 'shelf'
                             : 'barrel_decor';
      sinks.tile(p.tx, p.ty, style);
    }
    if (kind === 'workshop' && rng() < 0.85) {
      const p = pick(); sinks.tile(p.tx, p.ty, 'workbench');
    }
  } else if (kind === 'bath') {
    if (rng() < 0.9) { const p = pick(); sinks.tile(p.tx, p.ty, 'bathtub'); }
    if (rng() < 0.7) { const p = pick(); sinks.tile(p.tx, p.ty, 'sink'); }
  }

  // Chest placement: spread across rooms by lootRoll
  if (lootRoll < ROOM_LOOT_BIAS[kind]) {
    const cx = (x0 + rint(rng, 0, rw)) * TILE_SIZE + 2;
    const cy = (y0 + rint(rng, 0, rh)) * TILE_SIZE + 8;
    const tier = pickChestTier(rng, poi.lootTier);
    sinks.chest(cx, cy, tier, rollChestContents(rng, tier));
  }
}

// Procedural building generator. Replaces the legacy emitBuilding for any POI
// that wants room subdivision. Keeps the same signature so call sites only
// need swap names.
function emitProcBuilding(sinks, rng, originTx, originTy, tileW, tileH, wallStyle, floorStyle, opts) {
  opts = opts || {};
  const theme = opts.theme || 'home';
  const poi = opts.poi;
  // BSP partition
  const minDim = opts.minRoom || 4;
  const rooms = _bspSplit(rng, originTx, originTy, tileW, tileH, minDim, opts.depth || 3);

  // Tag each room with a kind
  rooms.forEach((r, i) => { r.kind = _pickRoomKind(rng, theme, i, rooms.length); });

  // Build adjacency graph and carve at least one door between each adjacent pair.
  // Use a union-find to ensure every room is reachable from room 0; extra
  // doors are added for redundancy.
  const parent = rooms.map((_, i) => i);
  const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; };
  const doorMap = new Set();
  const adjacencies = [];
  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const adj = _adjacency(rooms[i], rooms[j]);
      if (adj) adjacencies.push({ i, j, adj });
    }
  }
  // Connect to a spanning tree first.
  for (const { i, j, adj } of adjacencies) {
    if (find(i) === find(j)) continue;
    union(i, j);
    if (adj.axis === 'v') {
      const mid = (adj.y0 + adj.y1) >> 1;
      const yy = Math.max(adj.y0, Math.min(adj.y1 - 1, mid));
      _carveDoor(doorMap, 'v', adj.x, yy);
    } else {
      const mid = (adj.x0 + adj.x1) >> 1;
      const xx = Math.max(adj.x0, Math.min(adj.x1 - 1, mid));
      _carveDoor(doorMap, 'h', xx, adj.y);
    }
  }
  // Sprinkle a few extras for circulation.
  for (const { adj } of adjacencies) {
    if (rng() < 0.18) {
      if (adj.axis === 'v') {
        const yy = adj.y0 + rint(rng, 0, Math.max(1, adj.y1 - adj.y0));
        _carveDoor(doorMap, 'v', adj.x, yy);
      } else {
        const xx = adj.x0 + rint(rng, 0, Math.max(1, adj.x1 - adj.x0));
        _carveDoor(doorMap, 'h', xx, adj.y);
      }
    }
  }

  // Pick a front door on the outer wall (random side, room-flush).
  const side = rint(rng, 0, 4); // 0=N 1=E 2=S 3=W
  let frontAxis = (side === 0 || side === 2) ? 'h' : 'v';
  let frontFixed = side === 0 ? originTy
                  : side === 2 ? originTy + tileH - 1
                  : side === 1 ? originTx + tileW - 1
                  :              originTx;
  let frontRange = (frontAxis === 'h') ? [originTx + 1, originTx + tileW - 3]
                                       : [originTy + 1, originTy + tileH - 3];
  const fs = frontRange[0] + rint(rng, 0, Math.max(1, frontRange[1] - frontRange[0]));
  if (frontAxis === 'h') {
    doorMap.add(fs + ',' + frontFixed);
    doorMap.add((fs + 1) + ',' + frontFixed);
  } else {
    doorMap.add(frontFixed + ',' + fs);
    doorMap.add(frontFixed + ',' + (fs + 1));
  }

  // Stamp tiles. Every cell that lies on a room edge but isn't a door is a
  // wall; everything else is floor decor. Adjacent rooms share walls, so we
  // dedupe via a `stamped` set keyed by tile position.
  const stamped = new Set();
  for (const r of rooms) {
    for (let ty = r.oy; ty < r.oy + r.h; ty++) {
      for (let tx = r.ox; tx < r.ox + r.w; tx++) {
        const key = tx + ',' + ty;
        if (stamped.has(key)) continue;
        stamped.add(key);
        const onEdge = (tx === r.ox || tx === r.ox + r.w - 1 || ty === r.oy || ty === r.oy + r.h - 1);
        const isDoor = doorMap.has(key);
        const isOuter = (tx === originTx || tx === originTx + tileW - 1 ||
                          ty === originTy || ty === originTy + tileH - 1);
        if (onEdge && !isDoor) {
          // Outer wall keeps the building's wallStyle; interior walls use a
          // lighter interior style (when the building isn't all-wood).
          const styleHere = isOuter ? wallStyle
                          : (wallStyle === 'wood_wall' ? 'wood_wall' : 'interior_wall');
          sinks.tile(tx, ty, styleHere);
        } else {
          sinks.decorTile(tx, ty, floorStyle);
        }
      }
    }
  }

  // Furniture per room
  for (const r of rooms) {
    _placeFurniture(sinks, rng, r, r.kind, wallStyle, floorStyle, poi || {lootTier:1}, rng());
  }

  return rooms;
}


// Light fence ring around a footprint (tile coords). Skips one or two gaps so
// the fence has natural entry points.
function emitFenceRing(sinks, rng, originTx, originTy, tileW, tileH) {
  const gap1 = rint(rng, 0, tileW);
  const gap2 = rint(rng, 0, tileH);
  for (let tx = 0; tx < tileW; tx++) {
    if (tx !== gap1) sinks.tile(originTx + tx, originTy, 'fence');
    if (tx !== gap1 + 1) sinks.tile(originTx + tx, originTy + tileH - 1, 'fence');
  }
  for (let ty = 1; ty < tileH - 1; ty++) {
    if (ty !== gap2) sinks.tile(originTx, originTy + ty, 'fence');
    if (ty !== gap2 + 1) sinks.tile(originTx + tileW - 1, originTy + ty, 'fence');
  }
}

// Position helpers — convert poi origin (in world px) to tile-coord origin.
function poiOriginTx(poi) { return Math.floor(poi.originX / TILE_SIZE); }
function poiOriginTy(poi) { return Math.floor(poi.originY / TILE_SIZE); }

function emitHut(poi, rng, sinks) {
  const otx = poiOriginTx(poi), oty = poiOriginTy(poi);
  // Small building — BSP minRoom prevents subdivision, so this stays single-room.
  emitProcBuilding(sinks, rng, otx, oty, 5, 5, 'wood_wall', 'floor_wood', {
    theme: 'home', poi, depth: 1, minRoom: 4,
  });
  // Garrison: one walker just outside the door area
  sinks.garrison('walker', poi.centerX + rrange(rng, -80, 80), poi.centerY + rrange(rng, 50, 100));
}

function emitCottage(poi, rng, sinks) {
  const otx = poiOriginTx(poi), oty = poiOriginTy(poi);
  emitProcBuilding(sinks, rng, otx, oty, 7, 7, 'wood_wall', 'floor_wood', {
    theme: 'home', poi, depth: 2,
  });
  // 2 walkers
  for (let i = 0; i < 2; i++) {
    sinks.garrison('walker',
      poi.centerX + rrange(rng, -130, 130),
      poi.centerY + rrange(rng, -130, 130));
  }
  // Outside campfire decor (above the building so it doesn't blocks doors).
  if (rng() < 0.7) sinks.decorTile(otx + 1 + rint(rng, 0, 5), oty - 2, 'campfire');
}

function emitCampsite(poi, rng, sinks) {
  const otx = poiOriginTx(poi), oty = poiOriginTy(poi);
  // Central campfire
  const cfTx = otx + 5, cfTy = oty + 5;
  sinks.decorTile(cfTx, cfTy, 'campfire');
  // Some crates as obstacles around the campfire
  const crateCount = rint(rng, 2, 5);
  for (let i = 0; i < crateCount; i++) {
    const a = rrange(rng, 0, Math.PI * 2);
    const r = rint(rng, 2, 4);
    const tx = cfTx + Math.round(Math.cos(a) * r);
    const ty = cfTy + Math.round(Math.sin(a) * r);
    sinks.tile(tx, ty, 'crate');
  }
  // A couple of decorative non-explosive barrels (use 'barrel_decor' style as obstacles)
  for (let i = 0; i < rint(rng, 1, 3); i++) {
    const a = rrange(rng, 0, Math.PI * 2);
    const r = rint(rng, 3, 5);
    sinks.tile(cfTx + Math.round(Math.cos(a) * r), cfTy + Math.round(Math.sin(a) * r), 'barrel_decor');
  }
  // Some blood/scorched ground splotches
  for (let i = 0; i < 3; i++) {
    sinks.decorTile(cfTx + rint(rng, -3, 4), cfTy + rint(rng, -3, 4), rng() < 0.5 ? 'blood' : 'scorch');
  }
  // One wood/iron chest by the campfire
  const tier = pickChestTier(rng, poi.lootTier);
  sinks.chest(cfTx * TILE_SIZE - 60, cfTy * TILE_SIZE + 24, tier, rollChestContents(rng, tier));
  // Sleeping survivors (zombies). Walker or runner.
  for (let i = 0; i < rint(rng, 1, 3); i++) {
    sinks.garrison(rng() < 0.3 ? 'runner' : 'walker',
      poi.centerX + rrange(rng, -120, 120),
      poi.centerY + rrange(rng, -120, 120));
  }
}

function emitHouse(poi, rng, sinks) {
  const otx = poiOriginTx(poi), oty = poiOriginTy(poi);
  const wallStyle = rng() < 0.5 ? 'brick_wall' : 'stone_wall';
  // Procedural floor plan does the rooms / doors / furniture / chests work.
  emitProcBuilding(sinks, rng, otx, oty, poi.tileW, poi.tileH, wallStyle, 'floor_stone', {
    theme: 'home', poi, depth: 3,
  });

  // Garrison: 2-3 walkers + chance of a runner
  const gn = rint(rng, 2, 4);
  for (let i = 0; i < gn; i++) {
    sinks.garrison(rng() < 0.2 ? 'runner' : 'walker',
      poi.centerX + rrange(rng, -160, 160),
      poi.centerY + rrange(rng, -160, 160));
  }

  // A vehicle wreck out front, occasionally
  if (rng() < 0.5) {
    const vtx = otx + rint(rng, 0, poi.tileW - 2);
    const vty = oty + poi.tileH + 1;
    sinks.obstacle(vtx * TILE_SIZE, vty * TILE_SIZE, TILE_SIZE * 2, TILE_SIZE, 'vehicle');
  }
}

function emitGasStation(poi, rng, sinks) {
  const otx = poiOriginTx(poi), oty = poiOriginTy(poi);
  // Booth in upper-left of footprint — proc plan with depot/storage theme.
  emitProcBuilding(sinks, rng, otx, oty, 5, 5, 'brick_wall', 'floor_stone', {
    theme: 'depot', poi, depth: 2,
  });

  // Pump area (open) — paved floor with barrels (real, explosive)
  for (let ty = 0; ty < 5; ty++) {
    for (let tx = 6; tx < poi.tileW - 1; tx++) {
      sinks.decorTile(otx + tx, oty + ty, 'floor_stone');
    }
  }
  // Barrels in a small cluster — these go boom when shot or set ablaze
  const barrelCount = rint(rng, 3, 6);
  for (let i = 0; i < barrelCount; i++) {
    const bx = (otx + 7 + rint(rng, 0, poi.tileW - 8)) * TILE_SIZE + TILE_SIZE / 2;
    const by = (oty + 1 + rint(rng, 0, 3)) * TILE_SIZE + TILE_SIZE / 2;
    sinks.barrel(bx, by);
  }
  // Expansion: 1-2 fuel pumps in the apron. Bigger AoE than a barrel when
  // detonated (tier-3 chain explosion wires this up).
  const pumpCount = rint(rng, 1, 3);
  for (let i = 0; i < pumpCount; i++) {
    const px = (otx + 8 + i * 2) * TILE_SIZE + 8;
    const py = (oty + 2) * TILE_SIZE;
    sinks.kindObstacle(px, py, 60, 88, 'FuelPump',
      { hp: 40, explodes: true, explodeR: 140 });
  }
  // Vehicle wreck instead of generic vehicle some of the time — chains too.
  if (rng() < 0.7) {
    const vtx = otx + 8 + rint(rng, 0, 3);
    const vty = oty + poi.tileH - 2;
    if (rng() < 0.5) {
      sinks.kindObstacle(vtx * TILE_SIZE, vty * TILE_SIZE, 110, 72, 'CarWreck',
        { hp: 300, flammable: true });
    } else {
      sinks.obstacle(vtx * TILE_SIZE, vty * TILE_SIZE, TILE_SIZE * 2, TILE_SIZE, 'vehicle');
    }
  }
  // Garrison: a few walkers
  for (let i = 0; i < rint(rng, 2, 4); i++) {
    sinks.garrison(rng() < 0.2 ? 'runner' : 'walker',
      poi.centerX + rrange(rng, -160, 160),
      poi.centerY + rrange(rng, -100, 100));
  }
}

function emitWarehouse(poi, rng, sinks) {
  const otx = poiOriginTx(poi), oty = poiOriginTy(poi);
  // Big depot-themed building: BSP fills it with storage/workshop rooms,
  // each populated with shelves, crates, and the occasional workbench.
  emitProcBuilding(sinks, rng, otx, oty, poi.tileW, poi.tileH, 'brick_wall', 'floor_stone', {
    theme: 'depot', poi, depth: 4, minRoom: 5,
  });

  // Garrison: heavier — 4-6 mix, occasional tank
  const gn = rint(rng, 4, 7);
  for (let i = 0; i < gn; i++) {
    const r = rng();
    const t = r < 0.15 ? 'tank' : r < 0.4 ? 'runner' : 'walker';
    sinks.garrison(t,
      poi.centerX + rrange(rng, -200, 200),
      poi.centerY + rrange(rng, -160, 160));
  }
  // Decor: scattered crates outside as a loading area
  for (let i = 0; i < 4; i++) {
    const tx = otx + rint(rng, -2, poi.tileW + 2);
    const ty = oty + poi.tileH + rint(rng, 0, 3);
    sinks.tile(tx, ty, 'crate');
  }
  // Expansion: a loading-yard dressing — pallets, a dumpster, an
  // indestructible container, occasionally a toxic drum.
  const yardTx = otx, yardTy = oty + poi.tileH + 1;
  sinks.kindObstacle((yardTx + 1) * TILE_SIZE, yardTy * TILE_SIZE, 104, 68, 'Pallet', { hp: 90 });
  sinks.kindObstacle((yardTx + 4) * TILE_SIZE, yardTy * TILE_SIZE, 108, 56, 'Dumpster', { hp: 180 });
  sinks.kindObstacle((yardTx + 8) * TILE_SIZE, yardTy * TILE_SIZE, 128, 72, 'Container',
    { indestructible: true, alt: rng() < 0.5 });
  if (rng() < 0.55) {
    sinks.kindObstacle((yardTx + 13) * TILE_SIZE, yardTy * TILE_SIZE, 36, 36, 'ToxicDrum',
      { hp: 30, explodes: true, explodeR: 100, leavesPuddle: true });
  }
}

function emitTown(poi, rng, sinks) {
  const otx = poiOriginTx(poi), oty = poiOriginTy(poi);
  // Buildings on a coarse grid. Picker injects a little random jitter and
  // theme variation so two towns at the same tier don't look identical.
  const wallChoices = ['wood_wall', 'brick_wall', 'stone_wall'];
  const buildings = [
    { tx: otx + 1,  ty: oty + 1,  w: 6, h: 5  },
    { tx: otx + 9,  ty: oty + 2,  w: 7, h: 6  },
    { tx: otx + 19, ty: oty + 1,  w: 6, h: 6  },
    { tx: otx + 2,  ty: oty + 9,  w: 5, h: 5  },
    { tx: otx + 10, ty: oty + 11, w: 8, h: 6  },
    { tx: otx + 21, ty: oty + 10, w: 5, h: 6  },
    { tx: otx + 4,  ty: oty + 19, w: 7, h: 5  },
    { tx: otx + 15, ty: oty + 20, w: 6, h: 5  },
    { tx: otx + 23, ty: oty + 20, w: 4, h: 4  },
  ];
  const chosen = buildings.filter(() => rng() < 0.85);

  for (const b of chosen) {
    const wallStyle = rpick(rng, wallChoices);
    const floorStyle = wallStyle === 'wood_wall' ? 'floor_wood' : 'floor_stone';
    const theme = rng() < 0.25 ? 'depot' : 'home';
    emitProcBuilding(sinks, rng, b.tx, b.ty, b.w, b.h, wallStyle, floorStyle, {
      theme, poi, depth: 2,
    });
  }

  // Connecting "roads" — horizontal and vertical strips of road decor down the middle.
  const roadY1 = oty + 8, roadY2 = oty + 18;
  for (let tx = otx; tx < otx + poi.tileW; tx++) {
    sinks.decorTile(tx, roadY1, 'road');
    sinks.decorTile(tx, roadY2, 'road');
  }
  const roadX1 = otx + 8, roadX2 = otx + 19;
  for (let ty = oty; ty < oty + poi.tileH; ty++) {
    sinks.decorTile(roadX1, ty, 'road');
    sinks.decorTile(roadX2, ty, 'road');
  }
  // Town square: central campfire + a few decorative barrels
  sinks.decorTile(otx + 14, oty + 13, 'campfire');
  sinks.tile(otx + 13, oty + 14, 'barrel_decor');
  sinks.tile(otx + 15, oty + 14, 'barrel_decor');

  // Vehicle wrecks lining a road
  for (let i = 0; i < 3; i++) {
    const tx = otx + 2 + rint(rng, 0, poi.tileW - 5);
    sinks.obstacle(tx * TILE_SIZE, (oty + 9) * TILE_SIZE, TILE_SIZE * 2, TILE_SIZE, 'vehicle');
  }

  // Heavy garrison — 6-10 mix incl. a tank
  const gn = rint(rng, 6, 11);
  for (let i = 0; i < gn; i++) {
    const r = rng();
    const t = r < 0.12 ? 'tank' : r < 0.32 ? 'runner' : r < 0.40 ? 'fire' : 'walker';
    sinks.garrison(t,
      poi.centerX + rrange(rng, -360, 360),
      poi.centerY + rrange(rng, -360, 360));
  }

  // Some explosive barrels seeded around — chain reaction potential
  for (let i = 0; i < rint(rng, 3, 6); i++) {
    sinks.barrel(
      poi.centerX + rrange(rng, -350, 350),
      poi.centerY + rrange(rng, -350, 350));
  }
}

function emitCity(poi, rng, sinks) {
  const otx = poiOriginTx(poi), oty = poiOriginTy(poi);
  // Dense grid of buildings: 3 rows x 3 cols, with variation.
  const cellW = 11, cellH = 11;
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      if (rng() < 0.18) continue; // occasional gap
      const bx = otx + 1 + col * cellW + rint(rng, 0, 2);
      const by = oty + 1 + row * cellH + rint(rng, 0, 2);
      const bw = rint(rng, 7, 9);
      const bh = rint(rng, 6, 9);
      const styleR = rng();
      const wallStyle = styleR < 0.4 ? 'brick_wall' : styleR < 0.75 ? 'stone_wall' : 'wood_wall';
      const floorStyle = wallStyle === 'wood_wall' ? 'floor_wood' : 'floor_stone';
      const theme = rng() < 0.35 ? 'depot' : 'home';
      emitProcBuilding(sinks, rng, bx, by, bw, bh, wallStyle, floorStyle, {
        theme, poi, depth: 3,
      });
    }
  }

  // Grid streets
  for (let row = 1; row < 3; row++) {
    const ry = oty + row * cellH;
    for (let tx = otx; tx < otx + poi.tileW; tx++) {
      sinks.decorTile(tx, ry, 'road');
      sinks.decorTile(tx, ry + 1, 'road');
    }
  }
  for (let col = 1; col < 3; col++) {
    const rx = otx + col * cellW;
    for (let ty = oty; ty < oty + poi.tileH; ty++) {
      sinks.decorTile(rx, ty, 'road');
      sinks.decorTile(rx + 1, ty, 'road');
    }
  }

  // Vehicle wrecks scattered down the streets
  for (let i = 0; i < 6; i++) {
    const tx = otx + rint(rng, 0, poi.tileW - 2);
    const ty = oty + rint(rng, 0, poi.tileH - 1);
    sinks.obstacle(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE * 2, TILE_SIZE, 'vehicle');
  }

  // Heavy garrison: 12-20, with tanks and fire zombies
  const gn = rint(rng, 12, 21);
  for (let i = 0; i < gn; i++) {
    const r = rng();
    const t = r < 0.15 ? 'tank' : r < 0.30 ? 'fire' : r < 0.55 ? 'runner' : 'walker';
    sinks.garrison(t,
      poi.centerX + rrange(rng, -550, 550),
      poi.centerY + rrange(rng, -500, 500));
  }
  // Explosive barrels here and there
  for (let i = 0; i < rint(rng, 5, 9); i++) {
    sinks.barrel(
      poi.centerX + rrange(rng, -500, 500),
      poi.centerY + rrange(rng, -460, 460));
  }
}

// ---------- Terrain-flavored POIs ----------

function emitFishingDock(poi, rng, sinks) {
  const otx = poiOriginTx(poi), oty = poiOriginTy(poi);
  // Small hut on the inland side
  emitProcBuilding(sinks, rng, otx, oty, 5, 5, 'wood_wall', 'floor_wood', {
    theme: 'home', poi, depth: 1, minRoom: 4,
  });
  // Wooden pier — a thin run of decor tiles pointing toward water.
  // Choose direction by finding the most-water side.
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  let best = dirs[0], bestWater = -1;
  for (const [dx, dy] of dirs) {
    let waterCount = 0;
    for (let r = 2; r <= 5; r++) {
      const tx = otx + Math.floor(poi.tileW / 2) + dx * r;
      const ty = oty + Math.floor(poi.tileH / 2) + dy * r;
      const t = terrainAtTile(World.seed, World.region, tx, ty, World);
      if (t === TERRAIN.DEEP_WATER || t === TERRAIN.SHALLOW_WATER) waterCount++;
    }
    if (waterCount > bestWater) { bestWater = waterCount; best = [dx, dy]; }
  }
  const [dx, dy] = best;
  const cx = otx + Math.floor(poi.tileW / 2);
  const cy = oty + Math.floor(poi.tileH / 2);
  const pierLen = 4;
  for (let r = 1; r <= pierLen; r++) {
    // Pier overrides water/sand with a 2-tile-wide floor.
    sinks.decorTile(cx + dx * r, cy + dy * r, 'pier');
    sinks.decorTile(cx + dx * r + (dx === 0 ? 1 : 0), cy + dy * r + (dy === 0 ? 1 : 0), 'pier');
  }
  // Crates / barrels by the shore
  for (let i = 0; i < rint(rng, 2, 4); i++) {
    sinks.tile(otx + rint(rng, 0, poi.tileW), oty + rint(rng, 0, poi.tileH), 'crate');
  }
  // Garrison: a couple of walkers loitering on the dock
  for (let i = 0; i < rint(rng, 1, 3); i++) {
    sinks.garrison(rng() < 0.3 ? 'runner' : 'walker',
      poi.centerX + rrange(rng, -120, 120),
      poi.centerY + rrange(rng, -120, 120));
  }
}

function emitLumberCamp(poi, rng, sinks) {
  const otx = poiOriginTx(poi), oty = poiOriginTy(poi);
  // A workshop + small storage building
  emitProcBuilding(sinks, rng, otx, oty, 6, 5, 'wood_wall', 'floor_wood', {
    theme: 'depot', poi, depth: 2,
  });
  // Felled logs as decorative crates spread out around the work area
  for (let i = 0; i < rint(rng, 4, 8); i++) {
    sinks.tile(otx + 6 + rint(rng, 0, poi.tileW - 6),
                oty + 1 + rint(rng, 0, poi.tileH - 2),
                rng() < 0.6 ? 'log_pile' : 'stump');
  }
  // Campfire among the trees
  sinks.decorTile(otx + Math.floor(poi.tileW * 0.7), oty + Math.floor(poi.tileH * 0.6), 'campfire');
  // Garrison: workers turned walkers
  for (let i = 0; i < rint(rng, 2, 4); i++) {
    sinks.garrison('walker',
      poi.centerX + rrange(rng, -160, 160),
      poi.centerY + rrange(rng, -130, 130));
  }
}

function emitMiningOutpost(poi, rng, sinks) {
  const otx = poiOriginTx(poi), oty = poiOriginTy(poi);
  emitProcBuilding(sinks, rng, otx, oty, 6, 5, 'stone_wall', 'floor_stone', {
    theme: 'depot', poi, depth: 2,
  });
  // Mine entrance (a stamped boulder pile + scorch tile)
  const meTx = otx + poi.tileW - 3, meTy = oty + poi.tileH - 1;
  sinks.tile(meTx,     meTy, 'boulder');
  sinks.tile(meTx + 1, meTy, 'boulder');
  sinks.decorTile(meTx, meTy - 1, 'scorch');
  // Carts and crates
  for (let i = 0; i < rint(rng, 2, 5); i++) {
    sinks.tile(otx + 6 + rint(rng, 0, poi.tileW - 6),
                oty + rint(rng, 0, poi.tileH),
                rng() < 0.5 ? 'crate' : 'minecart');
  }
  // A barrel cluster (explosive)
  for (let i = 0; i < rint(rng, 1, 3); i++) {
    sinks.barrel(poi.centerX + rrange(rng, -140, 140),
                 poi.centerY + rrange(rng, -100, 100));
  }
  for (let i = 0; i < rint(rng, 2, 5); i++) {
    sinks.garrison(rng() < 0.2 ? 'tank' : 'walker',
      poi.centerX + rrange(rng, -160, 160),
      poi.centerY + rrange(rng, -120, 120));
  }
}

function emitFarm(poi, rng, sinks) {
  const otx = poiOriginTx(poi), oty = poiOriginTy(poi);
  // Farmhouse in the corner
  const fw = 7, fh = 6;
  emitProcBuilding(sinks, rng, otx, oty, fw, fh, 'wood_wall', 'floor_wood', {
    theme: 'farmhouse', poi, depth: 3,
  });
  // Small barn opposite
  const bw = 6, bh = 5;
  const bx = otx + poi.tileW - bw - 1, by = oty + poi.tileH - bh - 1;
  emitProcBuilding(sinks, rng, bx, by, bw, bh, 'wood_wall', 'floor_wood', {
    theme: 'depot', poi, depth: 1, minRoom: 5,
  });
  // Crop rows in between — alternating decor tile pattern
  for (let ty = oty + 1; ty < oty + poi.tileH - 1; ty += 2) {
    for (let tx = otx + fw + 1; tx < bx - 1; tx++) {
      sinks.decorTile(tx, ty, 'crop_row');
    }
  }
  // Fence ring with one gap on each side
  emitFenceRing(sinks, rng, otx, oty, poi.tileW, poi.tileH);
  // Scarecrow, water trough, and a couple of decorative barrels
  if (rng() < 0.9) sinks.tile(otx + Math.floor(poi.tileW / 2), oty + 2, 'scarecrow');
  if (rng() < 0.7) sinks.tile(otx + fw + 2, oty + poi.tileH - 3, 'trough');
  for (let i = 0; i < rint(rng, 1, 3); i++) {
    sinks.tile(otx + fw + 1 + rint(rng, 0, bx - (otx + fw) - 2),
                oty + poi.tileH - 2, 'barrel_decor');
  }
  // Garrison
  for (let i = 0; i < rint(rng, 2, 5); i++) {
    sinks.garrison(rng() < 0.25 ? 'runner' : 'walker',
      poi.centerX + rrange(rng, -200, 200),
      poi.centerY + rrange(rng, -150, 150));
  }
}

function emitPOI(poi, sinks) {
  // Use a fresh RNG so emits are independent of presence/kind rolls.
  const rng = mulberry32((poi.seed ^ 0x9E3779B1) >>> 0);
  switch (poi.kind) {
    case 'hut':            emitHut(poi, rng, sinks); break;
    case 'cottage':        emitCottage(poi, rng, sinks); break;
    case 'campsite':       emitCampsite(poi, rng, sinks); break;
    case 'house':          emitHouse(poi, rng, sinks); break;
    case 'gas_station':    emitGasStation(poi, rng, sinks); break;
    case 'warehouse':      emitWarehouse(poi, rng, sinks); break;
    case 'town':           emitTown(poi, rng, sinks); break;
    case 'city':           emitCity(poi, rng, sinks); break;
    case 'fishing_dock':   emitFishingDock(poi, rng, sinks); break;
    case 'lumber_camp':    emitLumberCamp(poi, rng, sinks); break;
    case 'mining_outpost': emitMiningOutpost(poi, rng, sinks); break;
    case 'farm':           emitFarm(poi, rng, sinks); break;
  }
}

// Sparse single-tile baseline scatter — light decor that only paints on
// existing GRASS tiles (so it doesn't overwrite water/forest/etc). Just
// enough that walking between POIs isn't a featureless plain.
function emitBaselineScatter(worldSeed, cx, cy, region, sinks, rng) {
  if (sinks.chunk.obstacles.length > 24) return;

  const chunkTilesPerSide = CHUNK_SIZE / TILE_SIZE; // 20
  const baseTx = cx * chunkTilesPerSide;
  const baseTy = cy * chunkTilesPerSide;
  const grid = sinks.chunk.terrain;

  const count = rint(rng, 1, 4);
  for (let i = 0; i < count; i++) {
    const lx = rint(rng, 1, chunkTilesPerSide - 1);
    const ly = rint(rng, 1, chunkTilesPerSide - 1);
    const t = grid[ly * chunkTilesPerSide + lx];
    if (t !== TERRAIN.GRASS) continue;
    const tx = baseTx + lx, ty = baseTy + ly;
    const r = rng();
    if (r < 0.15)       sinks.tile(tx, ty, 'tombstone');
    else if (r < 0.35)  sinks.tile(tx, ty, 'crate');
    else if (r < 0.50)  sinks.tile(tx, ty, 'barrel_decor');
    else if (r < 0.75)  sinks.decorTile(tx, ty, 'rubble');
    else                sinks.decorTile(tx, ty, 'blood');
  }
}

// ---------- World (chunked open world) ----------
// World holds chunk data on demand. ensureActive(player) makes sure every
// chunk in the active window is generated. forEachActiveObstacle iterates
// obstacles in the active region — used by collision, pathfinding, render.
const World = {
  seed: 1,
  region: DEFAULT_REGION,  // terrain bias preset chosen at level select
  chunks: new Map(),       // key -> { cx, cy, terrain, obstacles, ... }
  cols: 0, rows: 0,        // chunk grid extent (in chunks)
  spawnX: 0, spawnY: 0,

  // Backwards-compat shim: code that reads World.biome now sees the region
  // name. Persistence saves/loads region by name (see persistence.js).
  get biome() { return this.region && this.region.name; },

  init(seed, region) {
    this.seed = (seed | 0) || 1;
    // Region may be a string name (legacy save) or a full preset object.
    if (typeof region === 'string') {
      this.region = (typeof LEVELS !== 'undefined' && LEVELS.find(l => l.region && l.region.name === region) || {}).region || DEFAULT_REGION;
    } else {
      this.region = region || DEFAULT_REGION;
    }
    this.chunks.clear();
    _poiCache.clear();
    this.cols = Math.floor(WORLD_W / CHUNK_SIZE);
    this.rows = Math.floor(WORLD_H / CHUNK_SIZE);
    // Spawn at the world center (snapped to a chunk boundary).
    this.spawnX = Math.floor(this.cols / 2) * CHUNK_SIZE + CHUNK_SIZE / 2;
    this.spawnY = Math.floor(this.rows / 2) * CHUNK_SIZE + CHUNK_SIZE / 2;
  },

  chunkOf(worldX, worldY) {
    return [Math.floor(worldX / CHUNK_SIZE), Math.floor(worldY / CHUNK_SIZE)];
  },

  inBounds(cx, cy) {
    return cx >= 0 && cy >= 0 && cx < this.cols && cy < this.rows;
  },

  ensureChunk(cx, cy) {
    if (!this.inBounds(cx, cy)) return null;
    const key = chunkKey(cx, cy);
    let chunk = this.chunks.get(key);
    if (!chunk) {
      chunk = generateChunk(this.seed, cx, cy, this.region, this);
      this.chunks.set(key, chunk);
    }
    return chunk;
  },

  // Terrain lookup at a world pixel; uses cached chunk grid when available
  // (consistent with what the renderer drew) and otherwise falls back to the
  // pure-noise classifier — so collision checks just outside loaded chunks
  // still see the right answer.
  terrainAt(x, y) {
    const cx = Math.floor(x / CHUNK_SIZE), cy = Math.floor(y / CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cy));
    if (chunk && chunk.terrain) {
      const tilesPerChunk = CHUNK_SIZE / TILE_SIZE; // 20
      const localTx = Math.floor((x - cx * CHUNK_SIZE) / TILE_SIZE);
      const localTy = Math.floor((y - cy * CHUNK_SIZE) / TILE_SIZE);
      return chunk.terrain[localTy * tilesPerChunk + localTx];
    }
    return terrainAtPx(this.seed, this.region, x, y, this);
  },
  isBlockedTerrainAt(x, y) {
    return terrainBlocks(this.terrainAt(x, y));
  },

  ensureActive(centerX, centerY) {
    const [pcx, pcy] = this.chunkOf(centerX, centerY);
    for (let dy = -ACTIVE_RADIUS; dy <= ACTIVE_RADIUS; dy++) {
      for (let dx = -ACTIVE_RADIUS; dx <= ACTIVE_RADIUS; dx++) {
        this.ensureChunk(pcx + dx, pcy + dy);
      }
    }
  },

  forEachActiveObstacle(centerX, centerY, fn) {
    const [pcx, pcy] = this.chunkOf(centerX, centerY);
    for (let dy = -ACTIVE_RADIUS; dy <= ACTIVE_RADIUS; dy++) {
      for (let dx = -ACTIVE_RADIUS; dx <= ACTIVE_RADIUS; dx++) {
        const chunk = this.ensureChunk(pcx + dx, pcy + dy);
        if (chunk) {
          const obs = chunk.obstacles;
          for (let i = 0; i < obs.length; i++) {
            const o = obs[i];
            if (!o.dead) fn(o);
          }
        }
      }
    }
  },

  // Tighter-radius variant for hot-path collision queries: only iterates
  // chunks whose AABB intersects (x±r, y±r). Much cheaper than the full
  // active region when there are many small tile-obstacles.
  forEachObstacleNear(x, y, r, fn) {
    const cx0 = Math.floor((x - r) / CHUNK_SIZE);
    const cy0 = Math.floor((y - r) / CHUNK_SIZE);
    const cx1 = Math.floor((x + r) / CHUNK_SIZE);
    const cy1 = Math.floor((y + r) / CHUNK_SIZE);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const chunk = this.chunks.get(chunkKey(cx, cy));
        if (chunk) {
          const obs = chunk.obstacles;
          for (let i = 0; i < obs.length; i++) {
            const o = obs[i];
            if (!o.dead) fn(o);
          }
        }
      }
    }
  },

  // Iterate every chest in the active region, calling fn(chest, chunk) per entry.
  forEachActiveChest(centerX, centerY, fn) {
    const [pcx, pcy] = this.chunkOf(centerX, centerY);
    for (let dy = -ACTIVE_RADIUS; dy <= ACTIVE_RADIUS; dy++) {
      for (let dx = -ACTIVE_RADIUS; dx <= ACTIVE_RADIUS; dx++) {
        const chunk = this.ensureChunk(pcx + dx, pcy + dy);
        if (chunk) {
          const cs = chunk.chests;
          for (let i = 0; i < cs.length; i++) fn(cs[i], chunk);
        }
      }
    }
  },

  // Iterate decor tiles in the active region (for rendering).
  forEachActiveDecor(centerX, centerY, fn) {
    const [pcx, pcy] = this.chunkOf(centerX, centerY);
    for (let dy = -ACTIVE_RADIUS; dy <= ACTIVE_RADIUS; dy++) {
      for (let dx = -ACTIVE_RADIUS; dx <= ACTIVE_RADIUS; dx++) {
        const chunk = this.ensureChunk(pcx + dx, pcy + dy);
        if (chunk) {
          const ds = chunk.decor;
          for (let i = 0; i < ds.length; i++) fn(ds[i]);
        }
      }
    }
  },

  // Iterate obstacles in chunks that intersect the camera viewport (with
  // optional margin). Cuts ~6× the work the 5×5 active-region loop does
  // when called from the render pass.
  forEachVisibleObstacle(camX, camY, viewW, viewH, margin, fn) {
    const cs = CHUNK_SIZE;
    const cx0 = Math.floor((camX - margin) / cs);
    const cy0 = Math.floor((camY - margin) / cs);
    const cx1 = Math.floor((camX + viewW + margin) / cs);
    const cy1 = Math.floor((camY + viewH + margin) / cs);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const chunk = this.chunks.get(cx + ',' + cy);
        if (!chunk) continue;
        const obs = chunk.obstacles;
        for (let i = 0; i < obs.length; i++) {
          const o = obs[i];
          if (!o.dead) fn(o);
        }
      }
    }
  },

  forEachVisibleChest(camX, camY, viewW, viewH, margin, fn) {
    const cs = CHUNK_SIZE;
    const cx0 = Math.floor((camX - margin) / cs);
    const cy0 = Math.floor((camY - margin) / cs);
    const cx1 = Math.floor((camX + viewW + margin) / cs);
    const cy1 = Math.floor((camY + viewH + margin) / cs);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const chunk = this.chunks.get(cx + ',' + cy);
        if (!chunk) continue;
        const cs2 = chunk.chests;
        for (let i = 0; i < cs2.length; i++) fn(cs2[i]);
      }
    }
  },
};

// Generate a single chunk's contents. Deterministic from (worldSeed, cx, cy).
// First samples terrain into a tile grid, then emits any overlapping POI's
// tiles (POIs claim their footprint so we don't paint water under a building),
// and finally emits terrain features that don't conflict with POI tiles.
function generateChunk(worldSeed, cx, cy, region, world) {
  const rng = mulberry32(chunkSeed(worldSeed, cx, cy));
  const [scx, scy] = world.chunkOf(world.spawnX, world.spawnY);
  const tier = Math.max(Math.abs(cx - scx), Math.abs(cy - scy));
  const tilesPerChunk = CHUNK_SIZE / TILE_SIZE; // 20
  const chunk = {
    cx, cy, region, tier,
    terrain: new Uint8Array(tilesPerChunk * tilesPerChunk),
    obstacles: [],
    chests: [],
    decor: [],
    garrison: [],   // pre-placed zombies, spawned on first player entry
    barrels: [],    // pre-placed explosive barrels, spawned on first player entry
    activated: false,
  };

  // ---- Sample terrain into the grid ----
  const baseTx = cx * tilesPerChunk;
  const baseTy = cy * tilesPerChunk;
  for (let ly = 0; ly < tilesPerChunk; ly++) {
    for (let lx = 0; lx < tilesPerChunk; lx++) {
      chunk.terrain[ly * tilesPerChunk + lx] =
        terrainAtTile(worldSeed, region, baseTx + lx, baseTy + ly, world);
    }
  }

  // ---- POI emission ----
  // POIs claim tiles via sinks; before emitting, set the terrain underneath
  // each POI footprint to GRASS so we don't paint water/sand beneath a
  // building. (Walls inside the footprint will still render correctly.)
  const overlapping = poisOverlappingChunk(worldSeed, cx, cy, region, world);
  for (const poi of overlapping) {
    const otx = poiOriginTx(poi), oty = poiOriginTy(poi);
    for (let ty = 0; ty < poi.tileH; ty++) {
      for (let tx = 0; tx < poi.tileW; tx++) {
        const gx = (otx + tx) - baseTx;
        const gy = (oty + ty) - baseTy;
        if (gx < 0 || gy < 0 || gx >= tilesPerChunk || gy >= tilesPerChunk) continue;
        // Docks may sit over water — only override to grass for non-dock POIs.
        if (poi.kind === 'fishing_dock') continue;
        chunk.terrain[gy * tilesPerChunk + gx] = TERRAIN.GRASS;
      }
    }
  }

  const sinks = makeSinks(chunk, cx, cy);
  for (const poi of overlapping) emitPOI(poi, sinks);

  // ---- Terrain feature emission ----
  // After POIs are placed, walk the terrain grid and emit blocking obstacles
  // (water, mountain) and forest trees / hill boulders. Skip tiles that the
  // POI pass already populated (chunk.obstacles entry whose center sits on
  // this tile) to avoid double-stacking.
  const taken = new Set();
  for (const o of chunk.obstacles) {
    const ctx = Math.floor((o.x + o.w / 2) / TILE_SIZE);
    const cty = Math.floor((o.y + o.h / 2) / TILE_SIZE);
    taken.add(ctx + ',' + cty);
  }

  for (let ly = 0; ly < tilesPerChunk; ly++) {
    for (let lx = 0; lx < tilesPerChunk; lx++) {
      const t = chunk.terrain[ly * tilesPerChunk + lx];
      if (t === TERRAIN.GRASS) continue;
      const wtx = baseTx + lx, wty = baseTy + ly;
      const key = wtx + ',' + wty;
      if (taken.has(key)) continue;

      if (t === TERRAIN.DEEP_WATER || t === TERRAIN.SHALLOW_WATER) {
        // Blocking water tile. Marked terrain:true so render skips it.
        chunk.obstacles.push({
          x: wtx * TILE_SIZE, y: wty * TILE_SIZE,
          w: TILE_SIZE, h: TILE_SIZE,
          style: t === TERRAIN.DEEP_WATER ? 'water_deep' : 'water_shallow',
          terrain: true,
        });
      } else if (t === TERRAIN.MOUNTAIN) {
        chunk.obstacles.push({
          x: wtx * TILE_SIZE, y: wty * TILE_SIZE,
          w: TILE_SIZE, h: TILE_SIZE,
          style: 'mountain',
          terrain: true,
        });
      } else if (t === TERRAIN.FOREST) {
        // Scatter a tree on most forest tiles. Trees ARE collidable and
        // breakable — give them HP so players can chop through if cornered.
        const cellRng = mulberry32(_hash2(worldSeed, wtx, wty) * 4294967296 | 0);
        if (cellRng() < 0.55) {
          // Offset within the tile so the forest doesn't look like a grid.
          const ox = (cellRng() - 0.5) * 18;
          const oy = (cellRng() - 0.5) * 18;
          chunk.obstacles.push(_withHp({
            x: wtx * TILE_SIZE + 10 + ox,
            y: wty * TILE_SIZE + 10 + oy,
            w: 20, h: 20,
            style: 'tree',
          }));
        }
      } else if (t === TERRAIN.HILL) {
        const cellRng = mulberry32(_hash2(worldSeed, wtx, wty) * 4294967296 | 0);
        if (cellRng() < 0.18) {
          chunk.obstacles.push(_withHp({
            x: wtx * TILE_SIZE + 8,
            y: wty * TILE_SIZE + 8,
            w: 24, h: 24,
            style: 'boulder',
          }));
        }
      }
    }
  }

  // Baseline POI-vicinity scatter (light decorations near civilization).
  if (tier > 0) emitBaselineScatter(worldSeed, cx, cy, region, sinks, rng);

  return chunk;
}

function rollChestContents(rng, tier) {
  const out = [];
  if (tier === 'wood') {
    out.push('health');
    if (rng() < 0.55) out.push('ammo_shotgun');
    if (rng() < 0.45) out.push('wall');
    if (rng() < 0.30) out.push('barrel');
    if (rng() < 0.20) out.push('ammo_smg');
    if (rng() < 0.10) out.push('ammo_crossbow');
  } else if (tier === 'iron') {
    out.push('ammo_smg');
    out.push('wall');
    if (rng() < 0.55) out.push('barrel');
    if (rng() < 0.40) out.push('ammo_rocket');
    if (rng() < 0.40) out.push('ammo_shotgun');
    if (rng() < 0.35) out.push('health');
    // Expansion: 1-in-3 chance an iron chest carries an expansion ammo drop.
    if (rng() < 0.33) {
      const expRoll = rng();
      out.push(expRoll < 0.25 ? 'ammo_crossbow'
             : expRoll < 0.50 ? 'ammo_flamer'
             : expRoll < 0.75 ? 'ammo_gl'
             :                  'ammo_minigun');
    }
  } else { // mythic
    out.push('ammo_rocket');
    out.push('wall'); out.push('wall');
    out.push('ammo_smg');
    out.push('ammo_shotgun');
    if (rng() < 0.7) out.push('barrel');
    out.push('health');
    // Mythic chests always include an expansion-tier weapon ammo and have a
    // shot at the rarest tools (railgun / chainsaw).
    const top = rng();
    out.push(top < 0.30 ? 'ammo_railgun'
           : top < 0.55 ? 'ammo_minigun'
           : top < 0.80 ? 'ammo_gl'
           :              'ammo_flamer');
    if (rng() < 0.25) out.push('saw');
    if (rng() < 0.45) out.push('ammo_crossbow');
  }
  return out;
}

// ---------- Spatial hash ----------
// Per-tick bucket grid. Rebuilt at the top of each tick after movement so
// queries during update/render see fresh positions. Keeps collision queries
// O(B + small) instead of O(B * Z) on the bigger world.
const Spatial = {
  cellSize: 96,
  buckets: new Map(),
  clear() { this.buckets.clear(); },
  insert(entity) {
    const cx = Math.floor(entity.x / this.cellSize);
    const cy = Math.floor(entity.y / this.cellSize);
    const key = cx + ',' + cy;
    let bucket = this.buckets.get(key);
    if (!bucket) { bucket = []; this.buckets.set(key, bucket); }
    bucket.push(entity);
  },
  // Push every entity within a radius around (x, y) into `out` (created if absent).
  query(x, y, radius, out) {
    const cs = this.cellSize;
    const x0 = Math.floor((x - radius) / cs);
    const y0 = Math.floor((y - radius) / cs);
    const x1 = Math.floor((x + radius) / cs);
    const y1 = Math.floor((y + radius) / cs);
    out = out || [];
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = this.buckets.get(cx + ',' + cy);
        if (bucket) for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
      }
    }
    return out;
  },
};

// ---------- Pathfinding (flow-field, windowed) ----------
// The flow field covers a window centered on the player (the active chunk
// region + 1 chunk of slack). It rebuilds when the player crosses cells
// inside the window, and recenters to a new origin when the player crosses
// chunk boundaries.
const NAV = {
  cellSize: 24,
  cols: 0,
  rows: 0,
  blocked: null,
  dist: null,
  originX: 0, originY: 0,    // world-space coordinate of cell (0, 0)
  goalCx: -1, goalCy: -1,    // last cell coords inside the window we built for
  rebuildT: 0,
  inflate: 22,

  init() {
    // Window covers active region (5 chunks) + 1 chunk of slack each side.
    const span = (ACTIVE_RADIUS * 2 + 1 + 2) * CHUNK_SIZE;
    this.cols = Math.ceil(span / this.cellSize);
    this.rows = Math.ceil(span / this.cellSize);
    const n = this.cols * this.rows;
    this.blocked = new Uint8Array(n);
    this.dist = new Int32Array(n);
    this.recenter(Game.player.x, Game.player.y);
    this.markObstacles();
    this.goalCx = -1; this.goalCy = -1;
    this.rebuildT = 0;
  },
  recenter(worldX, worldY) {
    const halfSpan = ((ACTIVE_RADIUS + 1) * CHUNK_SIZE);
    // snap origin to chunk boundaries so the window aligns with chunk edges
    const ox = Math.floor((worldX - halfSpan) / CHUNK_SIZE) * CHUNK_SIZE;
    const oy = Math.floor((worldY - halfSpan) / CHUNK_SIZE) * CHUNK_SIZE;
    this.originX = ox;
    this.originY = oy;
  },
  markObstacles() {
    this.blocked.fill(0);
    const cs = this.cellSize, inf = this.inflate;
    const ox = this.originX, oy = this.originY;
    const cols = this.cols, rows = this.rows;
    const stamp = (rect) => {
      const x0 = Math.max(0, Math.floor((rect.x - inf - ox) / cs));
      const y0 = Math.max(0, Math.floor((rect.y - inf - oy) / cs));
      const x1 = Math.min(cols - 1, Math.floor((rect.x + rect.w + inf - ox) / cs));
      const y1 = Math.min(rows - 1, Math.floor((rect.y + rect.h + inf - oy) / cs));
      if (x1 < 0 || y1 < 0 || x0 >= cols || y0 >= rows) return;
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++)
          this.blocked[y * cols + x] = 1;
    };
    World.forEachActiveObstacle(Game.player.x, Game.player.y, stamp);
    for (const w of Game.walls) stamp(w);
    // Mark world-edge cells as blocked when the window touches the world boundary.
    for (let yi = 0; yi < rows; yi++) {
      for (let xi = 0; xi < cols; xi++) {
        const wx = ox + xi * cs, wy = oy + yi * cs;
        if (wx < 0 || wy < 0 || wx >= WORLD_W || wy >= WORLD_H) {
          this.blocked[yi * cols + xi] = 1;
        }
      }
    }
  },
  markDirty() {
    if (!this.blocked) return;
    this.markObstacles();
    this.rebuildT = 0;
    this.goalCx = -1;
  },
  // World-to-window cell coordinates (clamped to window). Use inWindow() first
  // if you need to know whether the world point is inside the field at all.
  cx(x) { return clamp(Math.floor((x - this.originX) / this.cellSize), 0, this.cols - 1); },
  cy(y) { return clamp(Math.floor((y - this.originY) / this.cellSize), 0, this.rows - 1); },
  inWindow(x, y) {
    return x >= this.originX && y >= this.originY
      && x < this.originX + this.cols * this.cellSize
      && y < this.originY + this.rows * this.cellSize;
  },
  buildFlow(targetX, targetY) {
    let gx = this.cx(targetX), gy = this.cy(targetY);
    let goalIdx = gy * this.cols + gx;
    if (this.blocked[goalIdx]) {
      let best = -1, bestD = Infinity;
      for (let r = 1; r <= 6 && best < 0; r++) {
        for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
            const nx = gx + dx, ny = gy + dy;
            if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
            const ni = ny * this.cols + nx;
            if (this.blocked[ni]) continue;
            const d = dx * dx + dy * dy;
            if (d < bestD) { bestD = d; best = ni; }
          }
        }
      }
      if (best < 0) { this.dist.fill(-1); return; }
      goalIdx = best;
      gx = goalIdx % this.cols; gy = (goalIdx / this.cols) | 0;
    }
    this.dist.fill(-1);
    this.dist[goalIdx] = 0;
    const queue = [goalIdx];
    let head = 0;
    const cols = this.cols, rows = this.rows;
    while (head < queue.length) {
      const idx = queue[head++];
      const cx = idx % cols, cy = (idx / cols) | 0;
      const d = this.dist[idx] + 1;
      if (cx > 0)        { const ni = idx - 1;    if (this.dist[ni] < 0 && !this.blocked[ni]) { this.dist[ni] = d; queue.push(ni); } }
      if (cx < cols - 1) { const ni = idx + 1;    if (this.dist[ni] < 0 && !this.blocked[ni]) { this.dist[ni] = d; queue.push(ni); } }
      if (cy > 0)        { const ni = idx - cols; if (this.dist[ni] < 0 && !this.blocked[ni]) { this.dist[ni] = d; queue.push(ni); } }
      if (cy < rows - 1) { const ni = idx + cols; if (this.dist[ni] < 0 && !this.blocked[ni]) { this.dist[ni] = d; queue.push(ni); } }
    }
    this.goalCx = gx; this.goalCy = gy;
  },
  flowDir(x, y) {
    if (!this.inWindow(x, y)) return null;
    const cx = this.cx(x), cy = this.cy(y);
    const idx = cy * this.cols + cx;
    let myD = this.dist[idx];
    if (myD < 0) myD = 1e9;
    let bestCost = myD, bestDx = 0, bestDy = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= this.cols || ny >= this.rows) continue;
        const ni = ny * this.cols + nx;
        const d = this.dist[ni];
        if (d < 0) continue;
        if (dx !== 0 && dy !== 0) {
          if (this.blocked[cy * this.cols + nx] || this.blocked[ny * this.cols + cx]) continue;
        }
        const cost = d + (dx !== 0 && dy !== 0 ? 0.4 : 0);
        if (cost < bestCost) { bestCost = cost; bestDx = dx; bestDy = dy; }
      }
    }
    if (bestDx === 0 && bestDy === 0) return null;
    const l = Math.hypot(bestDx, bestDy);
    return [bestDx / l, bestDy / l];
  },
  // LOS check that limits to obstacles in the active region + walls.
  hasLOS(x1, y1, x2, y2) {
    let blocked = false;
    World.forEachActiveObstacle(Game.player.x, Game.player.y, (o) => {
      if (!blocked && segmentRectHit(x1, y1, x2, y2, o)) blocked = true;
    });
    if (blocked) return false;
    const walls = Game.walls;
    for (let i = 0; i < walls.length; i++) {
      if (segmentRectHit(x1, y1, x2, y2, walls[i])) return false;
    }
    return true;
  },
  update(dt) {
    if (!this.blocked) return;
    this.rebuildT -= dt;
    const p = Game.player;
    // Recenter window if player has drifted into the outer slack ring.
    const slack = CHUNK_SIZE; // recenter when player gets within 1 chunk of the window edge
    const winRight = this.originX + this.cols * this.cellSize;
    const winBottom = this.originY + this.rows * this.cellSize;
    const needRecenter =
      p.x - this.originX < slack || winRight - p.x < slack ||
      p.y - this.originY < slack || winBottom - p.y < slack;
    if (needRecenter) {
      this.recenter(p.x, p.y);
      this.markObstacles();
      this.rebuildT = 0;
      this.goalCx = -1;
    }
    const pcx = this.cx(p.x), pcy = this.cy(p.y);
    const moved = pcx !== this.goalCx || pcy !== this.goalCy;
    if (this.rebuildT <= 0 || moved) {
      this.buildFlow(p.x, p.y);
      this.rebuildT = 0.3;
    }
  },
};

// ---------- POI directory helpers (used by minimap + compass) ----------
// Enumerate POIs whose center lies within the given world-space half-extent
// around (x, y). Used to render minimap markers and to find the nearest
// undiscovered POI for the compass.
function listNearbyPOIs(x, y, halfExtent) {
  const z0x = Math.floor((x - halfExtent) / ZONE_PX);
  const z1x = Math.floor((x + halfExtent) / ZONE_PX);
  const z0y = Math.floor((y - halfExtent) / ZONE_PX);
  const z1y = Math.floor((y + halfExtent) / ZONE_PX);
  const out = [];
  for (let zy = z0y; zy <= z1y; zy++) {
    for (let zx = z0x; zx <= z1x; zx++) {
      const poi = poiForZone(World.seed, zx, zy, World.region, World);
      if (poi) out.push(poi);
    }
  }
  return out;
}
