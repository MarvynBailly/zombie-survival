'use strict';

// ───────────────────────────────────────────────────────────────────
//  FOUNDRY — production-chain module
// ───────────────────────────────────────────────────────────────────
//
//  Architecture overview
//  ─────────────────────
//  The Foundry adds a placeable-machine layer on top of the existing
//  world. Players gather raw materials (ore, sulfur, oil, brass) and
//  feed them through chains of machines that refine, press, and combine
//  precursors into finished ammunition.
//
//  Everything lives in `Game.machines` — a flat array of machine
//  instances. Each instance has:
//    { id, x, y, w, h, hp, maxHp, condition,
//      inputs: {itemId: count, ...},     // buffered inputs
//      outputs: {itemId: count, ...},    // buffered outputs (player takes)
//      recipeId: string | null,          // selected recipe key
//      progress: 0..1,                   // 0..cycleTime
//      active: bool,                     // is currently producing
//      extra: {...} }                    // per-def scratch state
//
//  Machine definitions live in FOUNDRY_MACHINES (registered by Phase 1+
//  cards via registerMachine(def)).  Each def declares:
//    { id, name, footprint:{w,h}, hp, powerW,
//      slots: {input:[...itemIds], output:[...itemIds]},
//      recipes: [{id, label, in:[{id,n}], out:[{id,n}], cycle}],
//      draw(ctx, m, t),
//      tick(m, dt) }
//
//  Resource items are appended to ITEMS by this module's bootstrap
//  block at file-bottom (so all Phase 1+ cards can reference them).
//
//  Persistence: Game.machines is serialized in saveGame / restoreFromSave
//  (see persistence.js).  SAVE_VERSION was bumped to 6.
//
// ───────────────────────────────────────────────────────────────────

// ---------- Constants ----------
const MACHINE_INTERACT_RADIUS = 60;     // pixels — same as chests / workbenches
const MACHINE_TILE = TILE_SIZE;          // machines snap to the same lattice as walls
const FOUNDRY_BUILD_KEY = 'f';           // toggle build menu
const FOUNDRY_PLACE_CD = 0.25;           // seconds between machine placements

// ---------- Machine registry ----------
const FOUNDRY_MACHINES = {};

function registerMachine(def) {
  if (!def || !def.id) { console.warn('registerMachine: bad def', def); return; }
  if (FOUNDRY_MACHINES[def.id]) { console.warn('registerMachine: duplicate', def.id); return; }
  // Fill in defaults so card definitions stay terse.
  def.footprint = def.footprint || { w: 2, h: 2 };
  def.hp = def.hp != null ? def.hp : 200;
  def.powerW = def.powerW || 0;
  def.recipes = def.recipes || [];
  def.slots = def.slots || { input: [], output: [] };
  def.tier = def.tier || 1;            // 0 salvage, 1 standard, 2 match, 3 boutique, 4 experimental
  FOUNDRY_MACHINES[def.id] = def;
}

// ---------- Machine instances ----------
function newMachine(id, x, y) {
  const def = FOUNDRY_MACHINES[id];
  if (!def) { console.warn('newMachine: unknown', id); return null; }
  const w = def.footprint.w * MACHINE_TILE;
  const h = def.footprint.h * MACHINE_TILE;
  return {
    id, x, y, w, h,
    hp: def.hp, maxHp: def.hp,
    condition: 100,                    // 0..100 — drops slowly with use, affects quality
    inputs: {},                        // {itemId: count}
    outputs: {},                       // {itemId: count}
    recipeId: def.recipes[0] ? def.recipes[0].id : null,
    progress: 0,
    active: false,
    extra: {},                         // free-form per-def state (e.g. ore-vein link, well depth)
  };
}

function placeMachine(id, x, y) {
  // Snap to tile lattice.
  const tx = Math.round(x / MACHINE_TILE) * MACHINE_TILE;
  const ty = Math.round(y / MACHINE_TILE) * MACHINE_TILE;
  const m = newMachine(id, tx, ty);
  if (!m) return null;
  // Reject placement if it overlaps an existing machine.
  for (const other of Game.machines) {
    if (rectsOverlap(m, other)) return null;
  }
  Game.machines.push(m);
  return m;
}

function rectsOverlap(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function removeMachine(m) {
  const i = Game.machines.indexOf(m);
  if (i >= 0) Game.machines.splice(i, 1);
}

// Look up the machine the player is hovering over for interaction.
function machineNearPlayer(p) {
  let best = null, bestD = MACHINE_INTERACT_RADIUS * MACHINE_INTERACT_RADIUS;
  for (const m of Game.machines) {
    const cx = m.x + m.w / 2, cy = m.y + m.h / 2;
    const dx = p.x - cx, dy = p.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD) { best = m; bestD = d2; }
  }
  return best;
}

// ---------- Recipe execution ----------
// Generic recipe runner: if the machine has all inputs and recipe is set,
// advances progress; on completion, consumes inputs and emits outputs.
function tickRecipe(m, dt) {
  const def = FOUNDRY_MACHINES[m.id];
  if (!def) return;
  const recipe = def.recipes.find(r => r.id === m.recipeId);
  if (!recipe) { m.active = false; return; }
  // Can we run? need all inputs available.
  const hasInputs = recipe.in.every(it => (m.inputs[it.id] || 0) >= it.n);
  // Output overflow check — refuse to advance if outputs would exceed cap.
  const outCapOk = recipe.out.every(it => {
    const cur = m.outputs[it.id] || 0;
    const max = (def.outputCap || 200);
    return cur + it.n <= max;
  });
  if (!hasInputs || !outCapOk) { m.active = false; return; }
  m.active = true;
  m.progress += dt;
  if (m.progress >= recipe.cycle) {
    m.progress = 0;
    // consume
    for (const it of recipe.in) m.inputs[it.id] -= it.n;
    // produce
    for (const it of recipe.out) m.outputs[it.id] = (m.outputs[it.id] || 0) + it.n;
    // condition wear (small)
    m.condition = Math.max(0, m.condition - 0.05);
    if (def.onCycle) def.onCycle(m, recipe);
  }
}

// ---------- Tick all machines ----------
function updateMachines(dt) {
  if (!Game.machines) return;
  for (const m of Game.machines) {
    const def = FOUNDRY_MACHINES[m.id];
    if (!def) continue;
    if (def.tick) def.tick(m, dt);
    else tickRecipe(m, dt);
  }
}

// ---------- Draw all machines ----------
function drawMachines(ctx, cam) {
  if (!Game.machines || !Game.machines.length) return;
  const vL = cam.x - 60, vR = cam.x + VIEW_W + 60;
  const vT = cam.y - 60, vB = cam.y + VIEW_H + 60;
  const t = now();
  for (const m of Game.machines) {
    if (m.x + m.w < vL || m.x > vR || m.y + m.h < vT || m.y > vB) continue;
    const def = FOUNDRY_MACHINES[m.id];
    if (!def) continue;
    if (def.draw) def.draw(ctx, m, t);
    else drawMachineFallback(ctx, m);
    // Active-state indicator: small green LED if running.
    if (m.active) {
      ctx.fillStyle = '#8ec547';
      ctx.fillRect(m.x + m.w - 5, m.y + 3, 3, 3);
    }
    // HP damage tint.
    if (m.hp < m.maxHp) {
      const a = 1 - m.hp / m.maxHp;
      ctx.fillStyle = `rgba(210,75,53,${a * 0.25})`;
      ctx.fillRect(m.x, m.y, m.w, m.h);
    }
  }
}

function drawMachineFallback(ctx, m) {
  ctx.fillStyle = '#3a3f4a';
  ctx.fillRect(m.x, m.y, m.w, m.h);
  ctx.strokeStyle = '#2a2e36';
  ctx.lineWidth = 1;
  ctx.strokeRect(m.x + 0.5, m.y + 0.5, m.w - 1, m.h - 1);
  ctx.fillStyle = '#7a7e88';
  ctx.font = '10px monospace';
  ctx.fillText((m.id || '?').toUpperCase(), m.x + 4, m.y + 14);
}

// ---------- Build mode ----------
// Activated by pressing F. Player picks a machine from the menu, then
// left-clicks in the world to place it (consumes scrap per def.buildCost).
const FoundryBuild = {
  active: false,
  selectedId: null,
  open() {
    if (Game.mode !== 'playing') return;
    if (typeof openFoundryBuildMenu === 'function') openFoundryBuildMenu();
  },
  cancel() {
    FoundryBuild.active = false;
    FoundryBuild.selectedId = null;
  },
  select(id) {
    if (!FOUNDRY_MACHINES[id]) return;
    FoundryBuild.active = true;
    FoundryBuild.selectedId = id;
    if (typeof clearOverlay === 'function') clearOverlay();
    if (typeof setNotice === 'function') {
      setNotice(`Placing ${FOUNDRY_MACHINES[id].name} · LMB to place · Esc to cancel`, 4);
    }
  },
  tryPlace(wx, wy) {
    if (!FoundryBuild.active || !FoundryBuild.selectedId) return false;
    const def = FOUNDRY_MACHINES[FoundryBuild.selectedId];
    if (!def) return false;
    const p = Game.player;
    if (p.placeCd > 0) return false;
    // Build cost (scrap, with optional extra materials).
    const cost = def.buildCost || [{ id: 'scrap', n: 30 }];
    for (const c of cost) {
      if (!hasItem(p.inventory, c.id, c.n)) {
        setNotice(`Need ${c.n}× ${ITEMS[c.id] ? ITEMS[c.id].name : c.id}`, 1.5);
        return false;
      }
    }
    const m = placeMachine(FoundryBuild.selectedId, wx, wy);
    if (!m) { setNotice('Blocked — too close to another machine', 1.5); return false; }
    for (const c of cost) removeItem(p.inventory, c.id, c.n);
    p.placeCd = FOUNDRY_PLACE_CD;
    Audio.sfx.pickup();
    setNotice(`${def.name} placed`, 1.2);
    return true;
  },
};

// ---------- Build-ghost preview ----------
function drawFoundryGhost(ctx) {
  if (!FoundryBuild.active || !FoundryBuild.selectedId) return;
  const def = FOUNDRY_MACHINES[FoundryBuild.selectedId];
  if (!def) return;
  const wx = Math.round(input.wx / MACHINE_TILE) * MACHINE_TILE;
  const wy = Math.round(input.wy / MACHINE_TILE) * MACHINE_TILE;
  const w = def.footprint.w * MACHINE_TILE, h = def.footprint.h * MACHINE_TILE;
  // Validity check — overlap with another machine?
  let ok = true;
  const ghost = { x: wx, y: wy, w, h };
  for (const other of Game.machines) {
    if (rectsOverlap(ghost, other)) { ok = false; break; }
  }
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = ok ? '#8ec547' : '#d24b35';
  ctx.fillRect(wx, wy, w, h);
  ctx.strokeStyle = ok ? '#b3d870' : '#e36450';
  ctx.lineWidth = 2;
  ctx.strokeRect(wx + 1, wy + 1, w - 2, h - 2);
  ctx.restore();
}

// ───────────────────────────────────────────────────────────────────
//  Resource registry — extends ITEMS with foundry materials.
// ───────────────────────────────────────────────────────────────────
//  All new items default to category 'material' with no use().
// ───────────────────────────────────────────────────────────────────

const FOUNDRY_RESOURCES = {
  // Raw ores
  iron_ore:    { name: 'Iron Ore',    tint: '#8a6450', desc: 'Smelt at a blast furnace.' },
  copper_ore:  { name: 'Copper Ore',  tint: '#c47a4a', desc: 'Smelt at a blast furnace.' },
  lead_ore:    { name: 'Lead Ore',    tint: '#6b6d72', desc: 'Toxic. Smelt with ventilation.' },

  // Ingots
  iron_ingot:    { name: 'Iron Ingot',    tint: '#9aa0a8', desc: 'Structural metal.' },
  copper_ingot:  { name: 'Copper Ingot',  tint: '#d8884a', desc: 'Wire, primer cups, coils.' },
  lead_ingot:    { name: 'Lead Ingot',    tint: '#8a8c92', desc: 'Cast into projectiles.' },

  // Powder ingredients
  saltpeter:   { name: 'Saltpeter',   tint: '#e8e2c0', desc: 'Oxidizer. Hand-mined from caves.' },
  sulfur:      { name: 'Sulfur',      tint: '#e3c33a', desc: 'Yellow vent crystals. Smells terrible.' },
  charcoal:    { name: 'Charcoal',    tint: '#1c1f25', desc: 'Burned wood. Used in powder.' },
  coke:        { name: 'Coke',        tint: '#2a2e36', desc: 'Refined fuel. Burns hot.' },

  // Refined fluids (carried as solid units for inventory simplicity)
  crude_oil:     { name: 'Crude Oil',      tint: '#0b0c0e', desc: 'Pumped from the ground. Refine it.' },
  smokeless_base:{ name: 'Smokeless Base', tint: '#caa760', desc: 'Powder precursor from refinery.' },
  lubricant:     { name: 'Lubricant',      tint: '#cad0d8', desc: 'Keeps machines above 80% condition.' },
  casing_plastic:{ name: 'Casing Plastic', tint: '#5fb6e8', desc: 'Polymer for shotgun hulls.' },
  fuel_oil:      { name: 'Fuel Oil',       tint: '#d9b35a', desc: 'Runs vehicles and generators.' },

  // Casing parts
  brass_strip:   { name: 'Brass Strip',    tint: '#d9b35a', desc: 'Deep-drawn into casings.' },
  brass_casing:  { name: 'Brass Casing',   tint: '#caa760', desc: 'Empty cartridge — ready to load.' },
  primer:        { name: 'Primer',         tint: '#d24b35', desc: 'Tiny cup of impact compound.' },
  primer_compound:{name: 'Primer Compound',tint: '#e3a83a', desc: 'Mix into primer cups.' },
  lead_bullet:   { name: 'Bullet (Lead)',  tint: '#6c6e74', desc: 'Cast projectile, ready to seat.' },
  gunpowder:     { name: 'Gunpowder',      tint: '#3a3f4a', desc: 'Generic propellant.' },
  gunpowder_fast:  { name: 'Powder · Fast',   tint: '#4a3f3a', desc: 'Pistol & SMG charge.' },
  gunpowder_med:   { name: 'Powder · Medium', tint: '#3f3a4a', desc: 'Rifle / crossbow charge.' },
  gunpowder_slow:  { name: 'Powder · Slow',   tint: '#3a4a3f', desc: 'Shotgun & AP charge.' },

  // Byproducts
  acid:         { name: 'Acid',         tint: '#8ec547', desc: 'Centrifuge byproduct. Feeds acid rounds.' },
  lye:          { name: 'Lye',          tint: '#ece7d7', desc: 'Soap precursor. Survivor morale.' },

  // Specialty additives (Phase 3)
  phosphorus:   { name: 'Phosphorus',   tint: '#ece7d7', desc: 'Burns white-hot. Incendiary rounds.' },
  steel_core:   { name: 'Steel Core',   tint: '#9aa0a8', desc: 'Hardened penetrator. AP rounds.' },
  capacitor:    { name: 'Capacitor Cell', tint: '#5fb6e8', desc: 'Charged storage. Railgun ammo.' },

  // Bile (Phase 2 alt path / Phase 4)
  zombie_bile:  { name: 'Zombie Bile',  tint: '#566a32', desc: 'Harvested from spitters. Cracks into solvent.' },
};

(function installFoundryResources() {
  for (const id in FOUNDRY_RESOURCES) {
    const r = FOUNDRY_RESOURCES[id];
    if (ITEMS[id]) continue;   // don't overwrite if already present
    ITEMS[id] = {
      id, name: r.name, category: 'material',
      stackMax: 200, tint: r.tint, desc: r.desc,
    };
  }
})();

// Generic icon drawer for foundry items — used by render.js' getItemIcon
// fallback path so all new resources have a coherent visual style.
function drawFoundryItemIcon(ctx, id, size) {
  const r = FOUNDRY_RESOURCES[id];
  if (!r) return false;
  const cx = size / 2, cy = size / 2;
  // Base lump
  ctx.fillStyle = r.tint;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, 14, 10, 0, 0, Math.PI * 2);
  ctx.fill();
  // Inner highlight
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.ellipse(cx - 3, cy - 1, 7, 4, 0, 0, Math.PI * 2);
  ctx.fill();
  // Outline
  ctx.strokeStyle = 'rgba(0,0,0,0.4)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2, 14, 10, 0, 0, Math.PI * 2);
  ctx.stroke();
  // Category accent — a few small "chunks" hinting at material type.
  if (id.endsWith('_ore') || id === 'saltpeter' || id === 'sulfur') {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(cx - 7, cy + 1, 2, 2);
    ctx.fillRect(cx + 3, cy - 2, 2, 2);
    ctx.fillRect(cx, cy + 4, 2, 2);
  } else if (id.endsWith('_ingot')) {
    // Stack of bars
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(cx - 10, cy - 4, 20, 2);
    ctx.fillRect(cx - 10, cy + 0, 20, 2);
    ctx.fillRect(cx - 10, cy + 4, 20, 2);
  } else if (id.startsWith('gunpowder')) {
    // grain dots
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(cx - 8 + (i * 3), cy + 1 + ((i * 5) % 4) - 2, 1, 1);
    }
  } else if (id === 'primer' || id === 'primer_compound') {
    ctx.fillStyle = '#d24b35';
    ctx.beginPath();
    ctx.arc(cx, cy + 1, 3, 0, Math.PI * 2);
    ctx.fill();
  } else if (id === 'brass_casing') {
    // cartridge silhouette
    ctx.fillStyle = '#caa760';
    ctx.fillRect(cx - 3, cy - 7, 6, 14);
    ctx.fillStyle = '#a8854a';
    ctx.fillRect(cx - 3, cy + 5, 6, 2);
  } else if (id === 'lead_bullet') {
    // bullet shape
    ctx.fillStyle = '#7a7c80';
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy + 8);
    ctx.lineTo(cx - 4, cy - 4);
    ctx.lineTo(cx, cy - 9);
    ctx.lineTo(cx + 4, cy - 4);
    ctx.lineTo(cx + 4, cy + 8);
    ctx.closePath();
    ctx.fill();
  }
}

// ───────────────────────────────────────────────────────────────────
//  Game-state integration
// ───────────────────────────────────────────────────────────────────

// Called from resetRun in game.js.
function initFoundryState() {
  Game.machines = [];
  FoundryBuild.cancel();
}

// Serialize for persistence.js
function serializeMachines() {
  return Game.machines.map(m => ({
    id: m.id, x: m.x, y: m.y,
    hp: m.hp, condition: m.condition,
    inputs: { ...m.inputs }, outputs: { ...m.outputs },
    recipeId: m.recipeId, progress: m.progress,
    extra: { ...m.extra },
  }));
}

function restoreMachines(arr) {
  if (!Array.isArray(arr)) return;
  Game.machines = [];
  for (const s of arr) {
    const m = newMachine(s.id, s.x, s.y);
    if (!m) continue;
    m.hp = s.hp != null ? s.hp : m.maxHp;
    m.condition = s.condition != null ? s.condition : 100;
    m.inputs = { ...(s.inputs || {}) };
    m.outputs = { ...(s.outputs || {}) };
    m.recipeId = s.recipeId || m.recipeId;
    m.progress = s.progress || 0;
    m.extra = { ...(s.extra || {}) };
    Game.machines.push(m);
  }
}

// ───────────────────────────────────────────────────────────────────
//  Foundry I/O helpers — used by overlay UI to move stacks between
//  the player inventory and a machine.
// ───────────────────────────────────────────────────────────────────

// Push as many of `id` as possible from player inventory into machine inputs.
function pushToMachine(m, id, count) {
  const def = FOUNDRY_MACHINES[m.id];
  if (!def) return 0;
  if (def.slots.input.length && !def.slots.input.includes(id)) return 0;
  const have = itemCount(Game.player.inventory, id);
  const want = Math.min(have, count);
  if (want <= 0) return 0;
  removeItem(Game.player.inventory, id, want);
  m.inputs[id] = (m.inputs[id] || 0) + want;
  return want;
}

// Pull as many of `id` as possible from machine outputs into player inventory.
function pullFromMachine(m, id, count) {
  const have = m.outputs[id] || 0;
  const want = Math.min(have, count);
  if (want <= 0) return 0;
  const leftover = addItem(Game.player.inventory, id, want);
  const moved = want - leftover;
  m.outputs[id] -= moved;
  if (m.outputs[id] <= 0) delete m.outputs[id];
  return moved;
}

// Convenience: pull every output stack into the player at once.
function pullAllOutputs(m) {
  let total = 0;
  for (const id of Object.keys(m.outputs)) {
    total += pullFromMachine(m, id, m.outputs[id]);
  }
  return total;
}
