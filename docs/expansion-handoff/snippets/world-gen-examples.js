// snippets/world-gen-examples.js
// Patterns for placing the new props and blocks via world.js.
//
// The obstacle objects in your existing world.js have shape {x, y, w, h, style}.
// After the dispatch patch (see sprites-dispatch.js), adding a `kind` property
// routes the obstacle to a new draw function. Everything else (collision,
// damage, etc.) keeps working unchanged.


// ============================================================
// 1 · Single obstacle with a new look
// ============================================================
//
// Replace any existing crate spawn with:

// before:
// obstacles.push({ x: 320, y: 180, w: 60, h: 60 });
// after:
obstacles.push({
  x: 320, y: 180, w: 116, h: 56,
  kind: 'sofa',           // ← any key from ZProps.draw, ZExpand.draw* (e.g. 'sofa', 'Jersey', 'fridge')
  hp: 70,                 // optional — your existing hp-aware obstacle code reads this
  style: 'residential',   // optional — used only if kind lookup fails (fallback to legacy)
});


// ============================================================
// 2 · Furnished-room recipe (apartment chunk)
// ============================================================
//
// Drop into a residential biome chunk. Each placement is one obstacle.

function placeApartment(obstacles, baseX, baseY) {
  // bedroom corner
  obstacles.push({ kind: 'bed',        x: baseX +  10, y: baseY +  20, w: 110, h: 70, hp: 60 });
  obstacles.push({ kind: 'nightstand', x: baseX + 130, y: baseY +  28, w:  38, h: 48, hp: 25 });
  obstacles.push({ kind: 'dresser',    x: baseX +  10, y: baseY + 110, w:  92, h: 52, hp: 90 });
  obstacles.push({ kind: 'wardrobe',   x: baseX + 180, y: baseY +  20, w:  70, h: 84, hp: 110 });

  // living area
  obstacles.push({ kind: 'sofa',       x: baseX + 280, y: baseY +  30, w: 116, h: 56, hp: 70 });
  obstacles.push({ kind: 'coffee',     x: baseX + 290, y: baseY + 110, w:  80, h: 48, hp: 30 });
  obstacles.push({ kind: 'tvstand',    x: baseX + 280, y: baseY + 180, w:  92, h: 40, hp: 50 });
  obstacles.push({ kind: 'bookshelf',  x: baseX + 410, y: baseY +  30, w:  30, h: 230, hp: 110 });

  // kitchen wall
  obstacles.push({ kind: 'counter',    x: baseX + 450, y: baseY +  20, w: 140, h: 50, hp: 100 });
  obstacles.push({ kind: 'fridge',     x: baseX + 460, y: baseY +  90, w:  56, h: 80, hp: 140 });
  obstacles.push({ kind: 'stove',      x: baseX + 530, y: baseY +  90, w:  60, h: 64, hp: 70 });

  // dining
  obstacles.push({ kind: 'table',      x: baseX + 600, y: baseY + 120, w:  80, h: 80, hp: 60 });
  obstacles.push({ kind: 'chair',      x: baseX + 596, y: baseY +  76, w:  30, h: 38, hp: 15 });
  obstacles.push({ kind: 'chair',      x: baseX + 660, y: baseY +  76, w:  30, h: 38, hp: 15 });

  // bathroom (cramped corner)
  obstacles.push({ kind: 'toilet',     x: baseX + 720, y: baseY +  30, w:  44, h: 56, hp: 35 });
  obstacles.push({ kind: 'bathtub',    x: baseX + 700, y: baseY + 100, w:  96, h: 50, hp: 90 });
}


// ============================================================
// 3 · Office floor recipe
// ============================================================

function placeOfficeFloor(obstacles, baseX, baseY) {
  // workstation row
  for (let i = 0; i < 4; i++) {
    const dx = baseX + i * 160;
    obstacles.push({ kind: 'desk',     x: dx +  10, y: baseY + 30, w: 130, h: 60, hp: 80 });
    obstacles.push({ kind: 'ochair',   x: dx +  50, y: baseY + 100, w: 48, h: 56, hp: 12 });
    obstacles.push({ kind: 'cabinet',  x: dx + 100, y: baseY + 90,  w: 50, h: 90, hp: 160 });
  }
  // amenities
  obstacles.push({ kind: 'copier',     x: baseX + 100, y: baseY + 200, w: 86, h: 76, hp: 130 });
  obstacles.push({ kind: 'cooler',     x: baseX + 220, y: baseY + 210, w: 38, h: 70, hp: 40 });
  obstacles.push({ kind: 'whiteboard', x: baseX + 300, y: baseY + 200, w: 100, h: 28, hp: 35 });
  obstacles.push({ kind: 'vending',    x: baseX + 420, y: baseY + 200, w:  60, h: 96, hp: 180 });
  obstacles.push({ kind: 'plant',      x: baseX + 510, y: baseY + 220, w:  50, h: 50, hp: 8 });
}


// ============================================================
// 4 · Street-scene recipe
// ============================================================

function placeStreetBlock(obstacles, baseX, baseY) {
  // urban barricade (uses ZExpand blocks)
  obstacles.push({ kind: 'Jersey',     x: baseX + 0,   y: baseY + 0,   w: 132, h: 28, hp: 220 });
  obstacles.push({ kind: 'Sandbags',   x: baseX + 140, y: baseY + 0,   w: 132, h: 48, hp: 140 });
  obstacles.push({ kind: 'CarWreck',   x: baseX + 280, y: baseY + 0,   w: 110, h: 72, hp: 300, flammable: true });
  obstacles.push({ kind: 'Container',  x: baseX + 0,   y: baseY + 100, w: 128, h: 72 });
  // street furniture
  obstacles.push({ kind: 'bench',      x: baseX + 200, y: baseY + 120, w: 120, h: 32, hp: 50 });
  obstacles.push({ kind: 'hydrant',    x: baseX + 340, y: baseY + 130, w:  28, h: 28, hp: 40 });
  obstacles.push({ kind: 'trash',      x: baseX + 380, y: baseY + 130, w:  36, h: 36, hp: 25 });
  obstacles.push({ kind: 'mailbox',    x: baseX + 430, y: baseY + 120, w:  38, h: 60, hp: 60 });
  obstacles.push({ kind: 'bus',        x: baseX + 480, y: baseY + 110, w: 100, h: 60, hp: 200 });
  obstacles.push({ kind: 'bush',       x: baseX + 200, y: baseY +  60, w:  70, h: 56, hp: 25 });
  // hazards
  obstacles.push({ kind: 'FuelPump',   x: baseX + 100, y: baseY + 200, w:  60, h: 88, hp: 40, explodes: true, explodeR: 140 });
  obstacles.push({ kind: 'ebox',       x: baseX + 200, y: baseY + 210, w:  40, h: 56, hp: 20, electric: true });
  obstacles.push({ kind: 'manhole',    x: baseX + 320, y: baseY + 220, w:  50, h: 50, walkable: true });
}


// ============================================================
// 5 · Industrial yard
// ============================================================

function placeIndustrial(obstacles, baseX, baseY) {
  obstacles.push({ kind: 'Container',  x: baseX + 0,   y: baseY + 0,   w: 128, h: 72 });
  // pass {alt: true} via a side-channel — set a flag the dispatch reads
  obstacles.push({ kind: 'Container',  x: baseX + 0,   y: baseY + 100, w: 128, h: 72, alt: true });
  obstacles.push({ kind: 'Pallet',     x: baseX + 150, y: baseY + 30,  w: 104, h: 68, hp: 90 });
  obstacles.push({ kind: 'Pallet',     x: baseX + 270, y: baseY + 30,  w: 104, h: 68, hp: 90 });
  obstacles.push({ kind: 'Dumpster',   x: baseX + 150, y: baseY + 130, w: 108, h: 56, hp: 180 });
  obstacles.push({ kind: 'generator',  x: baseX + 300, y: baseY + 150, w:  70, h: 60, hp: 80, explodes: true });
  obstacles.push({ kind: 'ToxicDrum',  x: baseX + 400, y: baseY + 80,  w:  36, h: 36, hp: 30, explodes: true, leavesPuddle: true });
  obstacles.push({ kind: 'Fence',      x: baseX + 0,   y: baseY + 200, w: 380, h: 12, hp: 60, shootThrough: true });
}


// ============================================================
// 6 · Mimic spawn (the gotcha)
// ============================================================
//
// Drop into your pickup-spawn code. ~5% of pickups spawn as a mimic instead.

function spawnPickupOrMimic(pickups, zombies, x, y, type) {
  if (Math.random() < 0.05 && Game.wave >= 5) {
    // spawns as a zombie, not a pickup — looks like a pickup until triggered
    zombies.push({
      type: 'mimic',
      x, y, r: 12, hp: 90, maxHp: 90,
      angle: 0,             // 0 = closed, 1 = open
      walkPhase: Math.random(),
    });
  } else {
    pickups.push({ x, y, r: 12, type, life: 20 });
  }
}


// ============================================================
// 7 · Stationary spawners as wave triggers
// ============================================================
//
// Place these as zombies (not obstacles) so they're killable. Your existing
// updateZombies will handle them; just gate movement on `def.stationary`.
//
// Example: wave 10 starts with 1 cluster + 2 hivesacs in fixed positions:

function startStationaryWave(zombies) {
  // Infection Cluster anchor — must be killed to clear the wave
  zombies.push({
    type: 'cluster', x: WORLD_W / 2 + 400, y: WORLD_H / 2,
    r: 28, hp: 280, maxHp: 280, angle: 0, walkPhase: 0,
    spawnTimer: 4.0,           // matches def.spawnInterval
    childrenAlive: 0,
  });
  // Hive sacs on the flanks
  zombies.push({
    type: 'hivesac', x: WORLD_W / 2 + 200, y: WORLD_H / 2 - 200,
    r: 18, hp: 40, maxHp: 40, angle: 0, walkPhase: Math.random(),
  });
  zombies.push({
    type: 'hivesac', x: WORLD_W / 2 + 200, y: WORLD_H / 2 + 200,
    r: 18, hp: 40, maxHp: 40, angle: 0, walkPhase: Math.random(),
  });
  // A shrieker behind the cluster keeps the pressure up
  zombies.push({
    type: 'shrieker', x: WORLD_W / 2 + 600, y: WORLD_H / 2,
    r: 20, hp: 50, maxHp: 50, angle: 0, walkPhase: 0,
    callTimer: 2.0,
  });
}


// ============================================================
// 8 · Indestructible vs flammable hints
// ============================================================
//
// The new blocks have implied destruction rules — surface them as flags on
// the obstacle so your damage code can read them uniformly:
//
//   { kind: 'Container',  /* no hp */ }                       → indestructible
//   { kind: 'CarWreck',   hp: 300, flammable: true }          → ignites + chains barrels
//   { kind: 'FuelPump',   hp: 40,  explodes: true, explodeR: 140 } → barrel-class chain
//   { kind: 'ToxicDrum',  hp: 30,  explodes: true, leavesPuddle: true }
//   { kind: 'generator',  hp: 80,  explodes: true, explodeR: 90 }
//   { kind: 'Fence',      hp: 60,  shootThrough: true }       → bullets pass
//   { kind: 'whiteboard', hp: 35,  shootThrough: true }       → bullets pass
//   { kind: 'bush',       hp: 25,  shootThrough: true, walkerOnly: true }
//   { kind: 'manhole',    walkable: true }                    → no collision
//   { kind: 'rug',        walkable: true, decor: true }       → flat layer
