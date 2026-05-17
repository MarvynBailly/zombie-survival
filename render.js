'use strict';

// ---------- Chunk-surface LRU ----------
// Terrain + decor are static once a chunk is generated. We render each chunk
// once to an offscreen canvas (CHUNK_SIZE × CHUNK_SIZE) and blit it each
// frame, which collapses thousands of fillRect calls per frame into a
// handful of drawImage calls. Capped LRU because old chunks accumulate as
// the player wanders the open world.
const __surfaceCache = new Map();
const __SURFACE_CAP = 48;
function getChunkSurface(chunk) {
  const key = chunk.cx + ',' + chunk.cy;
  let s = __surfaceCache.get(key);
  if (s) {
    // Touch for LRU
    __surfaceCache.delete(key);
    __surfaceCache.set(key, s);
    return s;
  }
  const cs = CHUNK_SIZE;
  s = document.createElement('canvas');
  s.width = cs; s.height = cs;
  const sx = s.getContext('2d');
  const tpc = cs / TILE_SIZE;
  const terrain = chunk.terrain;
  // Neighbor terrain lookup with cross-chunk fallback. Out-of-bounds chunks
  // or not-yet-generated neighbors return -1, which drawTerrainTile treats
  // as "skip corner rounding on that side."
  const neighborAt = (lx, ly) => {
    if (lx >= 0 && ly >= 0 && lx < tpc && ly < tpc) {
      return terrain[ly * tpc + lx];
    }
    let ncx = chunk.cx, ncy = chunk.cy, llx = lx, lly = ly;
    if (lx < 0)         { ncx--; llx = tpc - 1; }
    else if (lx >= tpc) { ncx++; llx = 0; }
    if (ly < 0)         { ncy--; lly = tpc - 1; }
    else if (ly >= tpc) { ncy++; lly = 0; }
    const ch = World.chunks.get(ncx + ',' + ncy);
    if (!ch || !ch.terrain) return -1;
    return ch.terrain[lly * tpc + llx];
  };
  const baseTx = chunk.cx * tpc;
  const baseTy = chunk.cy * tpc;
  // Whole-chunk base color in one ImageData write. Smooth bilinear noise
  // is shared at tile corners (no lattice in homogeneous areas) and
  // analytical per-pixel transitions blend across cross-type seams. Pass
  // a cross-chunk neighbor lookup so tiles on the chunk edge can read
  // adjacent chunks' terrain too.
  ZSprites.paintChunkTerrainBase(sx, chunk, cs, TILE_SIZE, neighborAt);
  // Per-tile overlay pass: tufts, flora, ripples, corner blends, foam.
  for (let ly = 0; ly < tpc; ly++) {
    for (let lx = 0; lx < tpc; lx++) {
      const t = terrain[ly * tpc + lx];
      ZSprites.drawTerrainTile(
        sx,
        lx * TILE_SIZE, ly * TILE_SIZE, TILE_SIZE,
        t,
        baseTx + lx, baseTy + ly,
        neighborAt(lx - 1, ly),
        neighborAt(lx + 1, ly),
        neighborAt(lx, ly - 1),
        neighborAt(lx, ly + 1),
      );
    }
  }
  // Decor pass — translate so chunk-local origin == 0,0
  sx.save();
  sx.translate(-chunk.cx * cs, -chunk.cy * cs);
  for (const d of chunk.decor) ZSprites.drawDecorTile(sx, d);
  sx.restore();
  __surfaceCache.set(key, s);
  while (__surfaceCache.size > __SURFACE_CAP) {
    const firstKey = __surfaceCache.keys().next().value;
    __surfaceCache.delete(firstKey);
  }
  return s;
}

// Invalidate a chunk's cached surface (and its 4 neighbors, since their
// edge-rounding decisions referenced this chunk's terrain). Called from
// World.ensureChunk after a fresh chunk is generated so neighbors that
// were baked before this one appears get re-baked with proper transitions.
function invalidateChunkSurface(cx, cy) {
  __surfaceCache.delete(cx + ',' + cy);
  __surfaceCache.delete((cx - 1) + ',' + cy);
  __surfaceCache.delete((cx + 1) + ',' + cy);
  __surfaceCache.delete(cx + ',' + (cy - 1));
  __surfaceCache.delete(cx + ',' + (cy + 1));
}
window.invalidateChunkSurface = invalidateChunkSurface;

// ---------- Render ----------
function render(alpha) {
  // clear
  ctx.fillStyle = '#07080a';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.save();
  let shakeX = 0, shakeY = 0;
  if (shakeAmt > 0) { shakeX = (Math.random() - 0.5) * shakeAmt; shakeY = (Math.random() - 0.5) * shakeAmt; }
  ctx.translate(-Game.camera.x + shakeX, -Game.camera.y + shakeY);

  if (Game.level) {
    const style = Game.level.style || 'plains';

    // Procedural terrain (water / grass / forest / mountain) painted from
    // the chunk grids — using the per-chunk offscreen-surface cache so we
    // blit ready-made tiles instead of redrawing them every frame.
    if (World.chunks.size > 0) {
      const cs = CHUNK_SIZE;
      const cx0 = Math.floor(Game.camera.x / cs);
      const cy0 = Math.floor(Game.camera.y / cs);
      const cx1 = Math.floor((Game.camera.x + VIEW_W) / cs);
      const cy1 = Math.floor((Game.camera.y + VIEW_H) / cs);
      for (let ccy = cy0; ccy <= cy1; ccy++) {
        for (let ccx = cx0; ccx <= cx1; ccx++) {
          const chunk = World.chunks.get(ccx + ',' + ccy);
          if (!chunk || !chunk.terrain) continue;
          ctx.drawImage(getChunkSurface(chunk), ccx * cs, ccy * cs);
        }
      }
      // World border (drawn once after terrain so it's not redrawn per chunk).
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 4;
      ctx.strokeRect(0, 0, WORLD_W, WORLD_H);
      ctx.strokeStyle = '#d24b35';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 8]);
      ctx.strokeRect(2, 2, WORLD_W - 4, WORLD_H - 4);
      ctx.setLineDash([]);
    } else {
      ZSprites.drawGround(ctx, Game.camera, VIEW_W, VIEW_H, WORLD_W, WORLD_H, style);
    }

    // viewport culling helpers (margin covers entity radius)
    const cam = Game.camera;
    const vL = cam.x - 60, vR = cam.x + VIEW_W + 60;
    const vT = cam.y - 60, vB = cam.y + VIEW_H + 60;
    const inView = (x, y) => x > vL && x < vR && y > vT && y < vB;
    const rectInView = (r) => r.x + r.w > vL && r.x < vR && r.y + r.h > vT && r.y < vB;

    // (decor is now baked into the chunk-surface cache above)

    // Tier-3 puddles (toxic from spitters / bloater corpses / drum bursts)
    // sit on the ground — render above terrain, beneath obstacles + entities.
    if (Game.puddles) {
      for (const pu of Game.puddles) {
        if (!inView(pu.x, pu.y)) continue;
        const a = Math.max(0, Math.min(0.55, pu.life / pu.maxLife * 0.55));
        ctx.fillStyle = pu.kind === 'fire'
          ? `rgba(225,90,42,${a})`
          : `rgba(142,197,71,${a * 0.85})`;
        ctx.beginPath();
        ctx.arc(pu.x, pu.y, pu.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Obstacles in chunks that intersect the viewport (with 60px margin).
    // Each chunk's obstacle carries its own style.
    World.forEachVisibleObstacle(cam.x, cam.y, VIEW_W, VIEW_H, 60, (o) => {
      if (rectInView(o)) ZSprites.drawObstacle(ctx, o, o.style || style);
    });

    // chests (visible-chunk iteration, viewport-culled)
    World.forEachVisibleChest(cam.x, cam.y, VIEW_W, VIEW_H, 60, (c) => {
      if (rectInView(c)) drawChest(ctx, c);
    });

    // pickups
    for (const pk of Game.pickups) if (inView(pk.x, pk.y)) ZSprites.drawPickup(ctx, pk, now());

    // barrels
    for (const br of Game.barrels) if (inView(br.x, br.y)) ZSprites.drawBarrel(ctx, br, now());

    // player-placed walls
    for (const w of Game.walls) if (rectInView(w)) ZSprites.drawWall(ctx, w);

    // ghost preview of next wall placement (only while the wall slot is active)
    if (Game.player && !Game.player.dead && Game.player.weapon === 'wall' && Game.player.ammo.wall.reserve > 0) {
      const ghost = wallPlacementRect(Game.player);
      ZSprites.drawWallGhost(ctx, ghost, isWallPlacementValid(ghost));
    }

    // zombies (culled)
    for (const z of Game.zombies) if (inView(z.x, z.y)) ZSprites.drawZombie(ctx, z);

    // World survivors (un-recruited) — draw the "cowering" pose plus a marker
    // so they read at distance.
    if (Game.worldSurvivors) {
      for (const s of Game.worldSurvivors) {
        if (!inView(s.x, s.y)) continue;
        drawWorldSurvivor(ctx, s);
      }
    }

    // Squad members (recruited) — drawn just before the player so the
    // player silhouette stays on top in formation collisions.
    if (Game.squad) {
      for (const s of Game.squad) {
        if (!inView(s.x, s.y)) continue;
        drawSquadMember(ctx, s);
      }
    }

    // Charger telegraph — a red ground line pointing at the player while
    // the charger is winding up its dash. Drawn under the player so the
    // player silhouette stays readable.
    for (const z of Game.zombies) {
      if (z.charge && z.chargeState === 'telegraph') {
        const dx = Game.player.x - z.x, dy = Game.player.y - z.y;
        const dn = Math.hypot(dx, dy) || 1;
        const ux = dx / dn, uy = dy / dn;
        ctx.save();
        ctx.strokeStyle = 'rgba(210,75,53,0.55)';
        ctx.lineWidth = 4;
        ctx.setLineDash([10, 8]);
        ctx.beginPath();
        ctx.moveTo(z.x + ux * z.r, z.y + uy * z.r);
        ctx.lineTo(z.x + ux * (z.r + 360), z.y + uy * (z.r + 360));
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    }

    // player
    if (Game.player && !Game.player.dead) {
      const p = Game.player;
      ZSprites.drawPlayer(ctx, p.x, p.y, p.angle, {
        weapon: p.weapon,
        moving: !!(p.vx || p.vy),
        walkPhase: p.walkPhase || 0,
        iframe: p.iframe || 0,
        muzzleFlash: p.muzzleFlash || 0,
      });
      // Railgun charge bar — small white meter that fills above the player
      // while LMB is held. When it hits 1.0 release fires the beam.
      const wDef = WEAPONS[p.weapon];
      if (wDef && wDef.chargeTime && (p.railCharge || 0) > 0) {
        const frac = Math.min(1, p.railCharge / wDef.chargeTime);
        const bw = 32;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(p.x - bw / 2 - 1, p.y - p.r - 12, bw + 2, 4);
        ctx.fillStyle = frac >= 1 ? '#a8d8e8' : '#9fc4ff';
        ctx.fillRect(p.x - bw / 2, p.y - p.r - 11, bw * frac, 2);
      }
    }

    // rockets (culled)
    for (const r of Game.rockets) if (inView(r.x, r.y)) ZSprites.drawRocket(ctx, r);

    // bullets (culled)
    for (const b of Game.bullets) if (inView(b.x, b.y)) ZSprites.drawBullet(ctx, b);

    // Spitter goo projectiles in-flight.
    if (Game.zombieProjectiles) {
      for (const pr of Game.zombieProjectiles) {
        if (!inView(pr.x, pr.y)) continue;
        ctx.fillStyle = '#a4c45a';
        ctx.beginPath();
        ctx.arc(pr.x, pr.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#566a32';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // particles (culled)
    for (const pa of Game.particles) {
      if (!inView(pa.x, pa.y)) continue;
      ctx.fillStyle = pa.color;
      ctx.globalAlpha = Math.max(0, Math.min(1, pa.life * 2));
      ctx.beginPath(); ctx.arc(pa.x, pa.y, pa.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // explosions (culled — radius can be large, so test with margin)
    for (const ex of Game.explosions) if (inView(ex.x, ex.y)) ZSprites.drawExplosion(ctx, ex);
  }

  ctx.restore();

  // Day/night tint overlay (drawn in screen space, after restoring camera).
  drawDayNightTint();

  // Chest interaction prompt (screen-space, drawn over the world but under HUD).
  drawChestPrompt();
  drawWorkbenchPrompt();

  // minimap top-right of canvas
  drawMinimap();

  // Fullscreen world map overlay (M key). Drawn last so it sits above
  // everything; the underlying game keeps ticking-paused while it's open.
  if (Game.mapOpen) drawWorldMap();
}

function drawChest(ctx, c) {
  const t = CHEST_TIER[c.tier] || CHEST_TIER.wood;
  // base
  ctx.fillStyle = t.base;
  ctx.fillRect(c.x, c.y, c.w, c.h);
  // plank highlight
  ctx.fillStyle = t.plank;
  ctx.fillRect(c.x + 2, c.y + 2, c.w - 4, c.h / 2 - 2);
  // band/lock
  ctx.fillStyle = t.trim;
  ctx.fillRect(c.x + c.w / 2 - 4, c.y + 2, 8, c.h - 4);
  ctx.fillRect(c.x + 2, c.y + c.h - 5, c.w - 4, 2);
  if (c.opened) {
    // lid askew & faded color
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(c.x, c.y, c.w, c.h);
    ctx.fillStyle = '#000';
    ctx.fillRect(c.x + 3, c.y + 3, c.w - 6, c.h / 2 - 3);
  } else if (c.hp < c.maxHp) {
    // hp bar above
    const pct = Math.max(0, c.hp / c.maxHp);
    const bw = c.w - 4;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(c.x + 2, c.y - 5, bw, 3);
    ctx.fillStyle = pct > 0.5 ? '#7ad97a' : pct > 0.25 ? '#e3c054' : '#d24b35';
    ctx.fillRect(c.x + 2, c.y - 5, bw * pct, 3);
  }
}

function drawWorkbenchPrompt() {
  if (!Game.player || Game.player.dead) return;
  // Only show when no chest takes priority — matches the E-key dispatch order.
  if (findChestNear(Game.player.x, Game.player.y, CHEST_PROMPT_RADIUS)) return;
  const wb = findWorkbenchNear(Game.player.x, Game.player.y, WORKBENCH_PROMPT_RADIUS);
  if (!wb) return;
  const sx = (wb.x + wb.w / 2) - Game.camera.x;
  const sy = wb.y - Game.camera.y - 16;
  ctx.save();
  ctx.font = 'bold 11px "Manrope", sans-serif';
  const label = `[E] CRAFT`;
  const w = ctx.measureText(label).width + 14;
  ctx.fillStyle = 'rgba(11,12,14,0.85)';
  ctx.fillRect(sx - w / 2, sy - 16, w, 18);
  ctx.strokeStyle = '#8ec547';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx - w / 2 + 0.5, sy - 16 + 0.5, w - 1, 17);
  ctx.fillStyle = '#e8e6df';
  ctx.textAlign = 'center';
  ctx.fillText(label, sx, sy - 4);
  ctx.restore();
}

function drawChestPrompt() {
  if (!Game.player || Game.player.dead) return;
  const chest = findChestNear(Game.player.x, Game.player.y, CHEST_PROMPT_RADIUS);
  if (!chest) return;
  const sx = (chest.x + chest.w / 2) - Game.camera.x;
  const sy = chest.y - Game.camera.y - 16;
  ctx.save();
  ctx.font = 'bold 11px "Manrope", sans-serif';
  const label = `[E] OPEN ${chest.tier.toUpperCase()} CHEST`;
  const w = ctx.measureText(label).width + 14;
  ctx.fillStyle = 'rgba(11,12,14,0.85)';
  ctx.fillRect(sx - w / 2, sy - 16, w, 18);
  ctx.strokeStyle = '#caa760';
  ctx.lineWidth = 1;
  ctx.strokeRect(sx - w / 2 + 0.5, sy - 16 + 0.5, w - 1, 17);
  ctx.fillStyle = '#e8e6df';
  ctx.textAlign = 'center';
  ctx.fillText(label, sx, sy - 4);
  ctx.restore();
}

// Returns [r, g, b, a] tint for the current phase.
function dayNightTint() {
  const phase = currentPhase();
  if (phase.name === 'day')   return [0, 0, 0, 0];
  if (phase.name === 'dusk')  return [40, 30, 70, 0.32 * phase.progress];
  if (phase.name === 'night') return [10, 14, 38, 0.42];
  if (phase.name === 'dawn')  return [255, 180, 120, 0.32 * (1 - phase.progress)];
  return [0, 0, 0, 0];
}

function drawDayNightTint() {
  const [r, g, b, a] = dayNightTint();
  if (a <= 0) return;
  ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // Soft player-centered light at night so the player can still see immediately around them.
  if (Game.time.phase === 'night' && Game.player) {
    const px = Game.player.x - Game.camera.x;
    const py = Game.player.y - Game.camera.y;
    const grad = ctx.createRadialGradient(px, py, 60, px, py, 320);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.6, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
}

function drawMinimap() {
  const w = 156, h = 108;
  const x = VIEW_W - w - 14, y = 80;
  // panel
  ctx.fillStyle = 'rgba(11,12,14,0.78)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#2a2e36'; ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  // header (chunk coords give a sense of how far you've wandered)
  const p = Game.player;
  if (!p) return;
  const [pcx, pcy] = World.chunkOf(p.x, p.y);
  const [scx, scy] = World.chunkOf(World.spawnX, World.spawnY);
  ctx.fillStyle = '#7a7e88';
  ctx.font = '9px "Manrope", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`SECTOR · ${pcx - scx},${pcy - scy}`, x + w / 2, y - 6);

  const padX = 8, padY = 8;
  const mw = w - padX * 2, mh = h - padY * 2;
  // Show a window centered on the player.
  const viewSpan = (ACTIVE_RADIUS * 2 + 1) * CHUNK_SIZE;
  const sx = mw / viewSpan, sy = mh / viewSpan;
  const ox = p.x - viewSpan / 2;
  const oy = p.y - viewSpan / 2;
  const wx = (wx_) => x + padX + (wx_ - ox) * sx;
  const wy = (wy_) => y + padY + (wy_ - oy) * sy;

  // Fog-of-war: clip everything we draw inside the panel to a circle around
  // the player position. Outside the circle is dark/unknown.
  const cxScreen = wx(p.x), cyScreen = wy(p.y);
  const revealRadius = Math.min(mw, mh) * 0.42;

  ctx.save();
  // Dark "unknown" backdrop fills the whole panel.
  ctx.fillStyle = '#06080a';
  ctx.fillRect(x + padX, y + padY, mw, mh);
  // Now clip to the reveal circle for the rest of the draws.
  ctx.beginPath();
  ctx.arc(cxScreen, cyScreen, revealRadius, 0, Math.PI * 2);
  ctx.clip();

  // ground (visible inside the circle)
  ctx.fillStyle = '#0e1014';
  ctx.fillRect(x + padX, y + padY, mw, mh);

  // Terrain backdrop: sample chunk grids in the visible window so the
  // minimap conveys water/mountain/forest at a glance.
  const TERRAIN_MAP_COLOR = [
    '#1c2616', // grass
    '#16221a', // forest
    '#7a6840', // sand
    '#234866', // shallow water
    '#0e2438', // deep water
    '#3a3024', // hill
    '#4e4e58', // mountain
    '#2e2620', // path
  ];
  const tilesPerChunkM = CHUNK_SIZE / TILE_SIZE;
  const winLeft = ox, winTop = oy, winRight = ox + viewSpan, winBottom = oy + viewSpan;
  const cx0 = Math.floor(winLeft / CHUNK_SIZE);
  const cy0 = Math.floor(winTop / CHUNK_SIZE);
  const cx1 = Math.floor(winRight / CHUNK_SIZE);
  const cy1 = Math.floor(winBottom / CHUNK_SIZE);
  for (let ccy = cy0; ccy <= cy1; ccy++) {
    for (let ccx = cx0; ccx <= cx1; ccx++) {
      const chunk = World.chunks.get(ccx + ',' + ccy);
      if (!chunk || !chunk.terrain) continue;
      const baseX = ccx * CHUNK_SIZE, baseY = ccy * CHUNK_SIZE;
      for (let ly = 0; ly < tilesPerChunkM; ly++) {
        for (let lx = 0; lx < tilesPerChunkM; lx++) {
          const t = chunk.terrain[ly * tilesPerChunkM + lx];
          ctx.fillStyle = TERRAIN_MAP_COLOR[t] || '#1c2616';
          ctx.fillRect(wx(baseX + lx * TILE_SIZE), wy(baseY + ly * TILE_SIZE),
                       Math.max(1, TILE_SIZE * sx), Math.max(1, TILE_SIZE * sy));
        }
      }
    }
  }

  // Non-terrain obstacles (walls, furniture, trees, etc.) on top of terrain.
  ctx.fillStyle = '#3a3f4a';
  World.forEachActiveObstacle(p.x, p.y, (o) => {
    if (o.terrain) return;
    ctx.fillRect(wx(o.x), wy(o.y), Math.max(1, o.w * sx), Math.max(1, o.h * sy));
  });
  // chests (only show unopened ones — they're the loot signal)
  World.forEachActiveChest(p.x, p.y, (c) => {
    if (c.opened) return;
    ctx.fillStyle = c.tier === 'mythic' ? '#e3c054' : c.tier === 'iron' ? '#cad0d8' : '#caa760';
    ctx.fillRect(wx(c.x) - 1, wy(c.y) - 1, 3, 3);
  });
  // POI markers — show structures (even outside the reveal circle, but the clip
  // hides distant ones). Color encodes kind. Undiscovered are bright; discovered dim.
  const nearbyPOIs = listNearbyPOIs(p.x, p.y, viewSpan / 2 + ZONE_PX);
  for (const poi of nearbyPOIs) {
    const discovered = Game.discoveredPOIs && Game.discoveredPOIs.has(zoneKey(poi.zx, poi.zy));
    ctx.fillStyle = poiMarkerColor(poi.kind, discovered);
    const mx = wx(poi.centerX), my = wy(poi.centerY);
    // Small diamond marker
    ctx.beginPath();
    ctx.moveTo(mx, my - 3);
    ctx.lineTo(mx + 3, my);
    ctx.lineTo(mx, my + 3);
    ctx.lineTo(mx - 3, my);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 0.8;
    ctx.stroke();
  }
  // walls
  ctx.fillStyle = '#a08240';
  for (const w_ of Game.walls) ctx.fillRect(wx(w_.x), wy(w_.y), Math.max(1, w_.w * sx), Math.max(1, w_.h * sy));
  // barrels
  ctx.fillStyle = '#a04a2a';
  for (const br of Game.barrels) ctx.fillRect(wx(br.x) - 1, wy(br.y) - 1, 2, 2);
  // pickups
  ctx.fillStyle = '#8ec547';
  for (const pk of Game.pickups) ctx.fillRect(wx(pk.x) - 1, wy(pk.y) - 1, 2, 2);
  // zombies
  ctx.fillStyle = '#d24b35';
  for (const z of Game.zombies) { ctx.beginPath(); ctx.arc(wx(z.x), wy(z.y), 1.4, 0, Math.PI * 2); ctx.fill(); }
  // player + FOV
  const px = wx(p.x), py = wy(p.y);
  ctx.fillStyle = 'rgba(232,230,223,0.18)';
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.arc(px, py, 18, p.angle - 0.5, p.angle + 0.5);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#7fb6ff';
  ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
  // Reveal-circle outline (drawn after restore so the stroke isn't clipped).
  ctx.strokeStyle = '#3a3f4a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cxScreen, cyScreen, revealRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Compass: arrow on the edge of the reveal circle pointing to the nearest
  // undiscovered POI, with its distance. Helps the player pick a destination.
  const nearest = findNearestUndiscoveredPOI(p.x, p.y);
  if (nearest) {
    const dx = nearest.centerX - p.x;
    const dy = nearest.centerY - p.y;
    const ang = Math.atan2(dy, dx);
    const ex = cxScreen + Math.cos(ang) * (revealRadius + 1);
    const ey = cyScreen + Math.sin(ang) * (revealRadius + 1);
    // Arrow head pointing outward
    ctx.save();
    ctx.translate(ex, ey);
    ctx.rotate(ang);
    ctx.fillStyle = poiMarkerColor(nearest.kind, false);
    ctx.strokeStyle = 'rgba(0,0,0,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(5, 0);
    ctx.lineTo(-3, -3);
    ctx.lineTo(-1, 0);
    ctx.lineTo(-3, 3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    // Distance label below the minimap
    const distM = Math.round(Math.hypot(dx, dy) / 40); // tiles
    ctx.fillStyle = poiMarkerColor(nearest.kind, false);
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${nearest.kind.toUpperCase().replace('_', ' ')} · ${distM}t`, x + w / 2, y + h + 12);
  }
  ctx.textAlign = 'start';
}

// ---------- Fullscreen world map (M key) ----------
// Renders the player's explored chunks at scale-to-fit. Each explored chunk
// shows its terrain tiles, obstacles, walls, and unopened chests. Unexplored
// space stays black (fog of war). Tied to Game.exploredChunks, populated by
// activateChunkIfNeeded as the player walks.
const __MAP_TERRAIN_COLOR = [
  '#1c2616', // grass
  '#16221a', // forest
  '#7a6840', // sand
  '#234866', // shallow water
  '#0e2438', // deep water
  '#3a3024', // hill
  '#4e4e58', // mountain
  '#2e2620', // path
];
const __MAP_TERRAIN_RGB = __MAP_TERRAIN_COLOR.map(c => [
  parseInt(c.slice(1, 3), 16),
  parseInt(c.slice(3, 5), 16),
  parseInt(c.slice(5, 7), 16),
]);

// Pixel-per-tile thumbnail of a chunk for the M map. 20×20 ImageData,
// cached forever (terrain is static). One drawImage per chunk on map draw
// instead of 400 fillRects, so even hundreds of explored chunks blit in
// milliseconds. Memory is ~1.6KB per chunk.
const __mapTileCache = new Map();
function getChunkMapTile(chunk) {
  const key = chunk.cx + ',' + chunk.cy;
  let c = __mapTileCache.get(key);
  if (c) return c;
  const tpc = CHUNK_SIZE / TILE_SIZE;
  c = document.createElement('canvas');
  c.width = tpc; c.height = tpc;
  const cx = c.getContext('2d');
  const img = cx.createImageData(tpc, tpc);
  const data = img.data;
  for (let i = 0; i < tpc * tpc; i++) {
    const t = chunk.terrain[i];
    const rgb = __MAP_TERRAIN_RGB[t] || __MAP_TERRAIN_RGB[0];
    const idx = i * 4;
    data[idx]     = rgb[0];
    data[idx + 1] = rgb[1];
    data[idx + 2] = rgb[2];
    data[idx + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  __mapTileCache.set(key, c);
  return c;
}
function drawWorldMap() {
  // Dimming backdrop covers the live game beneath.
  ctx.fillStyle = 'rgba(7,8,10,0.94)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const explored = Game.exploredChunks;
  // Header bar
  ctx.fillStyle = 'rgba(11,12,14,0.92)';
  ctx.fillRect(0, 0, VIEW_W, 42);
  ctx.fillStyle = '#d24b35';
  ctx.font = 'bold 11px "JetBrains Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillText('// FIELD MAP', 22, 18);
  ctx.fillStyle = '#e8e6df';
  ctx.font = 'bold 20px "Bebas Neue", sans-serif';
  ctx.fillText(`DAY ${Game.time.day}  ·  ${explored.size} SECTORS EXPLORED`, 22, 34);
  ctx.fillStyle = '#7a7e88';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText('[M] OR [ESC] · CLOSE', VIEW_W - 22, 26);
  ctx.textAlign = 'left';

  if (!explored || explored.size === 0) {
    ctx.fillStyle = '#7a7e88';
    ctx.font = '14px "Manrope", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No explored sectors yet — walk around.', VIEW_W / 2, VIEW_H / 2);
    ctx.textAlign = 'left';
    return;
  }

  // Bounding box of explored chunks, padded by 1 chunk so the player
  // doesn't sit flush against the panel edge.
  let minCx = Infinity, maxCx = -Infinity, minCy = Infinity, maxCy = -Infinity;
  for (const k of explored) {
    const ci = k.indexOf(',');
    const cx = +k.slice(0, ci);
    const cy = +k.slice(ci + 1);
    if (cx < minCx) minCx = cx;
    if (cx > maxCx) maxCx = cx;
    if (cy < minCy) minCy = cy;
    if (cy > maxCy) maxCy = cy;
  }
  minCx -= 1; minCy -= 1; maxCx += 1; maxCy += 1;

  const chunksW = maxCx - minCx + 1;
  const chunksH = maxCy - minCy + 1;
  const padX = 60, padY = 64;
  const availW = VIEW_W - padX * 2;
  const availH = VIEW_H - padY - 60;
  const scale = Math.min(availW / (chunksW * CHUNK_SIZE),
                          availH / (chunksH * CHUNK_SIZE));
  const offX = padX + (availW - chunksW * CHUNK_SIZE * scale) / 2 - minCx * CHUNK_SIZE * scale;
  const offY = padY + (availH - chunksH * CHUNK_SIZE * scale) / 2 - minCy * CHUNK_SIZE * scale;
  const w2sx = (wx) => offX + wx * scale;
  const w2sy = (wy) => offY + wy * scale;

  // Map panel surround
  const panX = padX - 12, panY = padY - 12;
  const panW = availW + 24, panH = availH + 24;
  ctx.fillStyle = '#06080a';
  ctx.fillRect(panX, panY, panW, panH);
  ctx.strokeStyle = '#2a2e36';
  ctx.lineWidth = 1;
  ctx.strokeRect(panX + 0.5, panY + 0.5, panW - 1, panH - 1);

  // Render each explored chunk: one drawImage from the cached thumbnail.
  const prevSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  const cs = CHUNK_SIZE;
  for (const k of explored) {
    const ci = k.indexOf(',');
    const ccx = +k.slice(0, ci);
    const ccy = +k.slice(ci + 1);
    const chunk = World.chunks.get(k);
    if (!chunk || !chunk.terrain) {
      ctx.fillStyle = '#1c2218';
      ctx.fillRect(w2sx(ccx * cs), w2sy(ccy * cs), cs * scale, cs * scale);
      continue;
    }
    const tile = getChunkMapTile(chunk);
    ctx.drawImage(tile, w2sx(chunk.cx * cs), w2sy(chunk.cy * cs),
                  cs * scale, cs * scale);
    // Obstacles (skip terrain-flagged ones — they're baked into the thumbnail)
    ctx.fillStyle = '#3a3f4a';
    for (const o of chunk.obstacles) {
      if (o.terrain || o.dead) continue;
      ctx.fillRect(w2sx(o.x), w2sy(o.y),
                   Math.max(1, o.w * scale), Math.max(1, o.h * scale));
    }
    // Unopened chests
    for (const c of chunk.chests) {
      if (c.opened) continue;
      ctx.fillStyle = c.tier === 'mythic' ? '#e3c054'
                    : c.tier === 'iron'   ? '#cad0d8'
                    :                       '#caa760';
      const sX = w2sx(c.x + c.w / 2) - 2;
      const sY = w2sy(c.y + c.h / 2) - 2;
      ctx.fillRect(sX, sY, 4, 4);
    }
  }
  ctx.imageSmoothingEnabled = prevSmoothing;

  // Player-placed walls
  ctx.fillStyle = '#a08240';
  for (const w_ of Game.walls) {
    ctx.fillRect(w2sx(w_.x), w2sy(w_.y),
                 Math.max(1, w_.w * scale), Math.max(1, w_.h * scale));
  }

  // POI markers for discovered POIs (filled diamonds with labels)
  if (Game.discoveredPOIs) {
    ctx.font = '9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    for (const zkey of Game.discoveredPOIs) {
      const ci = zkey.indexOf(',');
      const zx = +zkey.slice(0, ci);
      const zy = +zkey.slice(ci + 1);
      const poi = poiForZone(World.seed, zx, zy, World.region, World);
      if (!poi) continue;
      const mx = w2sx(poi.centerX), my = w2sy(poi.centerY);
      ctx.fillStyle = poiMarkerColor(poi.kind, false);
      ctx.beginPath();
      ctx.moveTo(mx, my - 6);
      ctx.lineTo(mx + 6, my);
      ctx.lineTo(mx, my + 6);
      ctx.lineTo(mx - 6, my);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#e8e6df';
      ctx.fillText(poi.kind.toUpperCase().replace('_', ' '), mx, my + 18);
    }
    ctx.textAlign = 'left';
  }

  // Player position (and a heading wedge)
  const p = Game.player;
  if (p) {
    const px = w2sx(p.x), py = w2sy(p.y);
    ctx.fillStyle = 'rgba(127,182,255,0.22)';
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.arc(px, py, 22, p.angle - 0.45, p.angle + 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7fb6ff';
    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0b0c0e';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  // Scale bar (bottom right)
  const scaleBarPx = 800 * scale; // 1 chunk
  const sbX = VIEW_W - 22 - scaleBarPx, sbY = VIEW_H - 22;
  ctx.fillStyle = '#e8e6df';
  ctx.fillRect(sbX, sbY, scaleBarPx, 2);
  ctx.fillRect(sbX, sbY - 4, 1, 6);
  ctx.fillRect(sbX + scaleBarPx - 1, sbY - 4, 1, 6);
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'right';
  ctx.fillText('1 SECTOR (800px)', VIEW_W - 22, sbY - 8);
  ctx.textAlign = 'left';
}

// Marker color per POI kind. Discovered markers are dimmed.
function poiMarkerColor(kind, discovered) {
  const palette = {
    hut:         '#caa760',
    cottage:     '#caa760',
    campsite:    '#e3a83a',
    house:       '#cad0d8',
    gas_station: '#e35a2a',
    warehouse:   '#6e8a9a',
    town:        '#e3c054',
    city:        '#ffd54a',
  };
  const c = palette[kind] || '#caa760';
  return discovered ? toFaded(c) : c;
}
function toFaded(hex) {
  // Quick alpha blend: render at 35% intensity by mixing toward background.
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const bg = 30;
  const mix = (c) => Math.round(c * 0.35 + bg * 0.65);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

// Walks zones outward in expanding rings until it finds an undiscovered POI.
function findNearestUndiscoveredPOI(px, py) {
  const z0x = Math.floor(px / ZONE_PX);
  const z0y = Math.floor(py / ZONE_PX);
  let best = null, bestD2 = Infinity;
  const maxR = 5; // zones outward
  for (let r = 0; r <= maxR; r++) {
    for (let dzy = -r; dzy <= r; dzy++) {
      for (let dzx = -r; dzx <= r; dzx++) {
        if (r > 0 && Math.max(Math.abs(dzx), Math.abs(dzy)) !== r) continue;
        const zx = z0x + dzx, zy = z0y + dzy;
        if (Game.discoveredPOIs && Game.discoveredPOIs.has(zoneKey(zx, zy))) continue;
        const poi = poiForZone(World.seed, zx, zy, World.region, World);
        if (!poi) continue;
        const dx = poi.centerX - px, dy = poi.centerY - py;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; best = poi; }
      }
    }
    if (best) return best;
  }
  return best;
}

// ---------- HUD (DOM) ----------
const WEAPON_INFO = {
  pistol:  '12 RND · SEMI',
  shotgun: '6 PELLET · BUCK',
  smg:     'AUTO · 14 RPS',
  rocket:  'AoE · 120 DMG',
  barrel:  'PLACE · CHAIN',
  wall:    'PLACE · 250 HP',
};

// cache mini weapon icon canvases so we don't re-draw every frame
const __slotIconCache = {};
function getWeaponSlotIcon(type) {
  if (__slotIconCache[type]) return __slotIconCache[type];
  const c = document.createElement('canvas');
  c.width = 36; c.height = 36;
  const cx = c.getContext('2d');
  cx.scale(2, 2);
  cx.translate(9, 9);
  drawWeaponIconShape(cx, type);
  __slotIconCache[type] = c.toDataURL();
  return __slotIconCache[type];
}
function drawWeaponIconShape(ctx, type) {
  if (type === 'pistol') {
    ctx.fillStyle = '#cfd0d3'; ctx.fillRect(-6, -2, 9, 4);
    ctx.fillRect(-6, 1, 4, 5);
    ctx.fillStyle = '#e3a83a'; ctx.fillRect(3, -1, 2, 1);
  } else if (type === 'shotgun') {
    ctx.fillStyle = '#cfd0d3'; ctx.fillRect(-9, -3, 14, 2.5);
    ctx.fillRect(-9, 0.5, 14, 2.5);
    ctx.fillStyle = '#5a4028'; ctx.fillRect(-10, -2, 3, 4);
  } else if (type === 'smg') {
    ctx.fillStyle = '#cfd0d3'; ctx.fillRect(-7, -2.5, 12, 3);
    ctx.fillRect(-3, 0.5, 4, 5);
    ctx.fillStyle = '#e3a83a'; ctx.fillRect(-6, -3, 2, 1);
  } else if (type === 'rocket') {
    ctx.fillStyle = '#3a4a3a'; ctx.fillRect(-9, -3.5, 15, 7);
    ctx.fillStyle = '#d24b35';
    ctx.beginPath(); ctx.moveTo(6, -3.5); ctx.lineTo(10, 0); ctx.lineTo(6, 3.5);
    ctx.closePath(); ctx.fill();
  } else if (type === 'barrel') {
    ctx.fillStyle = '#a04a2a'; ctx.fillRect(-4, -6, 8, 12);
    ctx.fillStyle = '#5a230f'; ctx.fillRect(-4, -6, 8, 1.5);
    ctx.fillRect(-4, 4.5, 8, 1.5);
  } else if (type === 'wall') {
    ctx.fillStyle = '#7a5a30'; ctx.fillRect(-5, -5, 10, 10);
    ctx.fillStyle = '#5a4020';
    ctx.fillRect(-5, -5, 10, 1.5);
    ctx.fillRect(-5, 3.5, 10, 1.5);
    ctx.fillRect(-5, -1, 10, 1);
    ctx.fillStyle = '#caa760';
    ctx.fillRect(-4, -4, 1, 1); ctx.fillRect(3, -4, 1, 1);
    ctx.fillRect(-4, 3, 1, 1);  ctx.fillRect(3, 3, 1, 1);
  }
}

let __lastHudHtml = '';
let __lastHudKey = '';
function renderHUD() {
  const root = $('#hud-root');
  const vignette = $('#vignette-root');
  if (Game.mode !== 'playing') {
    root.style.display = 'none';
    if (vignette) vignette.style.display = 'none';
    return;
  }
  root.style.display = 'block';
  if (vignette) {
    vignette.style.display = 'block';
    const p = Game.player;
    const lowPct = Math.max(0, 1 - p.hp / p.maxHp);
    const hurt = p.iframe > 0 ? 0.6 : lowPct * 0.45;
    vignette.style.boxShadow = `inset 0 0 100px 20px rgba(210,75,53,${hurt})`;
  }

  const p = Game.player;
  const w = WEAPONS[p.weapon];
  const a = p.ammo[p.weapon];
  const hpPct = Math.max(0, p.hp / p.maxHp);
  const hpPips = 20;
  const hpFilled = Math.round(hpPct * hpPips);
  const hpLow = hpPct < 0.3;

  // mag bar
  let magTicks = [];
  let magText = '';
  if (w.magSize === Infinity) {
    magText = '∞';
    magTicks = Array.from({ length: 20 }, () => true);
  } else {
    magText = a.mag + '';
    for (let i = 0; i < w.magSize; i++) magTicks.push(i < a.mag);
  }

  // weapon slots
  const slotsHtml = WEAPON_ORDER.map(k => {
    const wd = WEAPONS[k];
    const unlocked = p.unlocked[k];
    const active = k === p.weapon;
    const ammoData = p.ammo[k];
    let ammoLabel = '';
    if (!unlocked) ammoLabel = '–';
    else if (wd.magSize === Infinity) ammoLabel = '∞';
    else ammoLabel = String(ammoData.reserve + ammoData.mag);
    const empty = unlocked && wd.magSize !== Infinity && ammoData.reserve + ammoData.mag === 0;
    return `<div class="slot ${active ? 'active' : ''} ${!unlocked ? 'locked' : empty ? 'empty' : ''}" data-weapon="${k}">
      <div class="key">${wd.key}</div>
      <img src="${getWeaponSlotIcon(k)}" width="18" height="18" alt="${wd.name}" style="opacity:${active ? 1 : 0.7}" />
      <div class="ammo-count">${ammoLabel}</div>
    </div>`;
  }).join('');

  // ammo display
  const isPistol = w.magSize === Infinity;
  const ammoDisp = isPistol
    ? `<span style="color:var(--accent)">∞</span>`
    : `<span>${a.mag}</span><span class="res"> / ${a.reserve === Infinity ? '∞' : a.reserve}</span>`;
  const reloadingClass = p.reloading > 0 ? 'reloading' : '';
  const reloadingText = p.reloading > 0 ? `<div class="info" style="color:var(--warn)">RELOADING · ${p.reloading.toFixed(1)}s</div>` : `<div class="info">${WEAPON_INFO[p.weapon] || ''}</div>`;

  // wave meta
  let waveMeta = '';
  // Day/time-of-day readout
  const phaseInfo = currentPhase();
  const phaseLabel = phaseInfo.label;
  const phaseRemaining = Math.max(0, Math.ceil(phaseInfo.length - (Game.time.t - phaseInfo.start)));
  waveMeta = `${phaseLabel} · ${phaseRemaining}s`;
  // Unspent perk points pill — only shown when > 0 so the HUD stays quiet.
  const perkPts = Game.perks ? Game.perks.points : 0;
  const perkPill = perkPts > 0
    ? `<div style="margin-top:4px;font-family:var(--f-mono);font-size:10px;color:var(--toxic);letter-spacing:1.5px">[P] ${perkPts} PERK${perkPts > 1 ? 'S' : ''}</div>`
    : '';

  const html = `
    <div class="hud-box hud-vitals">
      <div class="hud-head">
        <span class="label">VITALS</span>
        <span class="val">${Math.ceil(p.hp)}/${p.maxHp}</span>
      </div>
      <div class="pips">
        ${Array.from({ length: hpPips }, (_, i) =>
          `<div class="pip ${i < hpFilled ? (hpLow ? 'low' : 'on') : ''}"></div>`
        ).join('')}
      </div>
    </div>

    <div class="hud-box hud-wave">
      <div class="lbl">DAY</div>
      <div class="num">${String(Game.time.day).padStart(2, '0')}</div>
      <div class="meta">${waveMeta}</div>
      ${perkPill}
    </div>

    <div class="hud-box hud-stats">
      <div class="stat-row accent">
        <span class="l">KILLS</span>
        <span class="v">${Game.kills}</span>
      </div>
      <div class="stat-row">
        <span class="l">SCORE</span>
        <span class="v">${Math.floor(Game.score)}</span>
      </div>
      <div class="stat-row muted">
        <span class="l">TIME</span>
        <span class="v">${formatTime(Game.elapsed)}</span>
      </div>
    </div>

    <div class="hud-box hud-weapon">
      <div class="head">
        <div class="icon-box"><img src="${getWeaponSlotIcon(p.weapon)}" width="18" height="18" alt="${w.name}" /></div>
        <div class="meta">
          <div class="name">${w.name.toUpperCase()}</div>
          ${reloadingText}
        </div>
        <div class="ammo ${reloadingClass}">${ammoDisp}</div>
      </div>
      ${w.magSize !== Infinity ? `
      <div class="mag-bar">
        ${magTicks.map(on => `<div class="tick ${on ? 'on' : ''}"></div>`).join('')}
      </div>` : ''}
      <div class="slots">${slotsHtml}</div>
    </div>

    <div class="hud-box hud-hint">
      <span class="kb">WASD</span><span>MOVE</span>
      <span class="kb">LMB</span><span>SHOOT</span>
      <span class="kb">R</span><span>RELOAD</span>
      <span class="kb">␣</span><span>PLACE</span>
      <span class="kb">E</span><span>CHEST</span>
      <span class="kb">M</span><span>MAP</span>
      <span class="kb">ESC</span><span>PAUSE</span>
    </div>

    ${renderSquadHud()}
    ${Game.noticeUntil > now() ? `<div class="notice">${escapeHtml(Game.notice)}</div>` : ''}
    ${Game.bannerUntil > now() ? `<div class="wave-banner show">${escapeHtml(Game.bannerText)}</div>` : ''}
  `;

  if (html !== __lastHudHtml) {
    root.innerHTML = html;
    __lastHudHtml = html;
    // wire weapon slot clicks
    root.querySelectorAll('.slot').forEach(el => {
      el.addEventListener('click', () => {
        const k = el.getAttribute('data-weapon');
        const player = Game.player;
        if (player && player.unlocked[k]) {
          player.weapon = k;
          player.reloading = 0;
          player.fireCd = 0.1;
          Audio.sfx.click();
        }
      });
    });
  }
}

function formatTime(s) {
  const m = Math.floor(s / 60), ss = Math.floor(s % 60);
  return m + ':' + (ss < 10 ? '0' + ss : ss);
}
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

// Right-rail HUD strip listing recruited squadmates: portrait, name, hp,
// class label. Returns empty string when the squad is empty so the HUD
// stays clean for solo runs.
function renderSquadHud() {
  const sq = Game.squad;
  if (!sq || sq.length === 0) return '';
  const rows = sq.map(s => {
    const def = (typeof SQUAD_CLASS !== 'undefined') ? SQUAD_CLASS[s.cls] : null;
    const col = def ? def.color : '#e8e6df';
    const pct = Math.max(0, s.hp / s.maxHp);
    const hpw = Math.round(pct * 64);
    const lbl = def ? def.label : s.cls.toUpperCase();
    const flag = s.holdMode ? '<span class="sq-flag">HOLD</span>' : '';
    return `<div class="sq-row" style="--col:${col}">
      <div class="sq-dot"></div>
      <div class="sq-meta">
        <div class="sq-name">${escapeHtml(s.name)}<span class="sq-cls">${lbl}</span>${flag}</div>
        <div class="sq-bar"><div class="sq-fill" style="width:${hpw}px"></div></div>
      </div>
    </div>`;
  }).join('');
  return `<div class="hud-box hud-squad">${rows}</div>`;
}

// ---------- Squad rendering ----------
// Recruited squadmates are drawn as a small player-like silhouette with a
// colored class shoulder pip. Un-recruited "world" survivors are drawn the
// same but with a green prompt marker above them.
function drawSquadMember(ctx, s) {
  const def = (typeof SQUAD_CLASS !== 'undefined') ? SQUAD_CLASS[s.cls] : null;
  const col = def ? def.color : '#e8e6df';
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(s.x, s.y + 7, s.r * 0.9, s.r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  // body
  ctx.fillStyle = '#e8e6df';
  ctx.fillRect(s.x - 7, s.y - 2, 14, 13);
  // head
  ctx.fillStyle = '#caa17a';
  ctx.beginPath(); ctx.arc(s.x, s.y - 6, 6, 0, Math.PI * 2); ctx.fill();
  // class shoulder pip
  ctx.fillStyle = col;
  ctx.fillRect(s.x - 7, s.y - 2, 14, 3);
  // direction blip
  if (s.angle != null) {
    const ax = s.x + Math.cos(s.angle) * 10;
    const ay = s.y + Math.sin(s.angle) * 10;
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(ax, ay, 2.5, 0, Math.PI * 2); ctx.fill();
  }
  // HP bar when damaged
  if (s.hp < s.maxHp) {
    const pct = Math.max(0, s.hp / s.maxHp);
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(s.x - 12, s.y - 16, 24, 3);
    ctx.fillStyle = pct > 0.5 ? '#7ad97a' : pct > 0.25 ? '#e3c054' : '#d24b35';
    ctx.fillRect(s.x - 12, s.y - 16, 24 * pct, 3);
  }
  // HOLD indicator
  if (s.holdMode) {
    ctx.fillStyle = 'rgba(227,168,58,0.85)';
    ctx.font = 'bold 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('HOLD', s.x, s.y - 20);
  }
}
function drawWorldSurvivor(ctx, s) {
  // a darker, cowering silhouette so it reads as "rescuable"
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(s.x, s.y + 7, s.r * 0.9, s.r * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#7d8a6c';
  ctx.fillRect(s.x - 6, s.y - 1, 12, 12);
  ctx.fillStyle = '#a0855a';
  ctx.beginPath(); ctx.arc(s.x, s.y - 4, 5, 0, Math.PI * 2); ctx.fill();
  // Recruit prompt — drawn in world coords directly above the survivor.
  ctx.save();
  ctx.font = 'bold 10px "Manrope", sans-serif';
  const label = `[E] RECRUIT ${s.name || ''}`;
  const w = ctx.measureText(label).width + 14;
  const px = s.x, py = s.y - 22;
  ctx.fillStyle = 'rgba(11,12,14,0.85)';
  ctx.fillRect(px - w / 2, py - 9, w, 18);
  ctx.strokeStyle = '#8ec547';
  ctx.lineWidth = 1;
  ctx.strokeRect(px - w / 2 + 0.5, py - 9 + 0.5, w - 1, 17);
  ctx.fillStyle = '#e8e6df';
  ctx.textAlign = 'center';
  ctx.fillText(label, px, py + 3);
  ctx.restore();
}
