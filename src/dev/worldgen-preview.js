'use strict';

// Offscreen worldgen preview. Uses classifyTerrain (world.js) and poiForZone
// (world.js) — both pure functions of (seed, region) — so we can render a
// candidate world without booting the game loop.

const WorldgenPreview = (function () {
  // Terrain colors. Indexes match the TERRAIN enum in world.js.
  const COLORS = [
    '#4a6b3a',  // GRASS
    '#2a4a26',  // FOREST
    '#c8b56a',  // SAND
    '#4a7088',  // SHALLOW_WATER
    '#2a4a64',  // DEEP_WATER
    '#6b5a44',  // HILL
    '#7a7a82',  // MOUNTAIN
    '#6a6258',  // PATH
  ];

  // Preview window: tiles around the world center. The real world is 800×800
  // tiles — way too many to render. 240 tiles ≈ 12 chunks ≈ 6 zones each way
  // gives a useful sample including several POIs.
  const WINDOW_TILES = 240;
  const TILE_PX = 3;

  // Render terrain + POI markers + spawn cross into `canvas`.
  // Returns { water, forest, mountain, pois } stats for the panel.
  function render(canvas, opts) {
    const seed = (opts.seed | 0) || 1;
    const region = opts.region || (typeof DEFAULT_REGION !== 'undefined' ? DEFAULT_REGION : null);
    if (!region) {
      console.warn('[dev] no region');
      return null;
    }

    const W = WINDOW_TILES, S = TILE_PX;
    canvas.width = W * S;
    canvas.height = W * S;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;

    // World center in tile coords. World.spawnX/Y is at chunk-snapped center;
    // we replicate that here so previews match the actual spawn.
    const worldTilesW = Math.floor(WORLD_W / TILE_SIZE);
    const worldTilesH = Math.floor(WORLD_H / TILE_SIZE);
    const spawnTx = Math.floor(worldTilesW / 2);
    const spawnTy = Math.floor(worldTilesH / 2);
    const tx0 = spawnTx - (W >> 1);
    const ty0 = spawnTy - (W >> 1);

    // Fake "world" object for poiForZone — it only reads spawnX/spawnY.
    const fakeWorld = {
      spawnX: spawnTx * TILE_SIZE,
      spawnY: spawnTy * TILE_SIZE,
    };

    // Terrain pass.
    const counts = new Uint32Array(8);
    for (let y = 0; y < W; y++) {
      for (let x = 0; x < W; x++) {
        const tx = tx0 + x, ty = ty0 + y;
        const t = classifyTerrain(seed, region, tx, ty);
        // Spawn-safe disk override (matches terrainAtTile in world.js).
        let drawn = t;
        const dx = tx - spawnTx, dy = ty - spawnTy;
        const safe = region.spawnSafe || 16;
        if (dx * dx + dy * dy <= safe * safe) drawn = 0; // GRASS
        ctx.fillStyle = COLORS[drawn] || '#000';
        ctx.fillRect(x * S, y * S, S, S);
        counts[drawn]++;
      }
    }

    // POI pass. Iterate every zone whose center falls inside the window.
    const zoneTiles = ZONE_TILES;
    const zx0 = Math.floor(tx0 / zoneTiles);
    const zy0 = Math.floor(ty0 / zoneTiles);
    const zx1 = Math.floor((tx0 + W) / zoneTiles);
    const zy1 = Math.floor((ty0 + W) / zoneTiles);
    let poiCount = 0;
    for (let zy = zy0; zy <= zy1; zy++) {
      for (let zx = zx0; zx <= zx1; zx++) {
        const poi = poiForZone(seed, zx, zy, region, fakeWorld);
        if (!poi) continue;
        // Zone center → screen coords inside the preview.
        const zoneCx = zx * zoneTiles + (zoneTiles >> 1);
        const zoneCy = zy * zoneTiles + (zoneTiles >> 1);
        const px = (zoneCx - tx0) * S;
        const py = (zoneCy - ty0) * S;
        if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
        drawPoiMarker(ctx, px, py, poi.kind || 'poi');
        poiCount++;
      }
    }

    // Spawn marker (red cross at center).
    drawSpawnMarker(ctx, (spawnTx - tx0) * S, (spawnTy - ty0) * S);

    // Stats: only count blocking-tile fractions over the rendered window.
    const total = W * W;
    return {
      water:    (counts[3] + counts[4]) / total,
      forest:    counts[1] / total,
      mountain:  counts[6] / total,
      pois:      poiCount,
      total,
    };
  }

  function drawPoiMarker(ctx, x, y, kind) {
    // Diamond marker — bright, distinct from terrain.
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#ffd24a';
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-4, -4, 8, 8);
    ctx.strokeRect(-4, -4, 8, 8);
    ctx.restore();
  }

  function drawSpawnMarker(ctx, x, y) {
    ctx.save();
    ctx.strokeStyle = '#ff4a4a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(x - 8, y);
    ctx.lineTo(x + 8, y);
    ctx.moveTo(x, y - 8);
    ctx.lineTo(x, y + 8);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Pure: classify a tile at screen coords back to (tx, ty) for tooltips.
  function tileAt(opts, sx, sy) {
    const W = WINDOW_TILES, S = TILE_PX;
    const worldTilesW = Math.floor(WORLD_W / TILE_SIZE);
    const worldTilesH = Math.floor(WORLD_H / TILE_SIZE);
    const spawnTx = Math.floor(worldTilesW / 2);
    const spawnTy = Math.floor(worldTilesH / 2);
    const tx0 = spawnTx - (W >> 1);
    const ty0 = spawnTy - (W >> 1);
    const x = Math.floor(sx / S), y = Math.floor(sy / S);
    if (x < 0 || y < 0 || x >= W || y >= W) return null;
    const tx = tx0 + x, ty = ty0 + y;
    return { tx, ty, t: classifyTerrain((opts.seed|0) || 1, opts.region, tx, ty) };
  }

  return { render, tileAt, WINDOW_TILES, TILE_PX };
})();

window.WorldgenPreview = WorldgenPreview;
