'use strict';

// ---------- Power grid ----------
// Placeable generators that feed a powered radius around them. F2 foundation
// for Garage (B·03), Radio Room (B·04), and Cameras (C·04): each future
// feature queries `isPowered(x, y)` to gate its station.
//
// `Game.generators` is an array of { id, x, y, hp, maxHp, fuel, maxFuel,
// on, range }. (x, y) is the top-left of the 1-tile footprint; the center
// is used for distance checks. `on` flips to false automatically when fuel
// runs out and can be toggled by E-interacting with no scrap in hand.

const GENERATOR_HP = 200;
const GENERATOR_MAX_FUEL = 100;
const GENERATOR_RANGE = 8 * TILE_SIZE;           // 320px aura radius
const GENERATOR_FUEL_PER_SEC = 0.10;             // 1 fuel per 10 seconds
const GENERATOR_INTERACT_RADIUS = 60;            // E-key reach
const GENERATOR_SCRAP_FUEL = 5;                  // 1 scrap -> 5 fuel
const GENERATOR_CAN_FUEL = 50;                   // 1 fuel_can -> 50 fuel
const GENERATOR_SIZE = TILE_SIZE;                // footprint side (px)

let __genIdSeq = 1;

function initPower() {
  Game.generators = [];
  __genIdSeq = 1;
}

// Build a generator at the given top-left corner. Callers should snap the
// coords themselves (e.g. via the same wall snap used in game.js); we don't
// own a placement UI here.
function makeGenerator(x, y) {
  return {
    id: __genIdSeq++,
    x, y,
    w: GENERATOR_SIZE, h: GENERATOR_SIZE,
    hp: GENERATOR_HP, maxHp: GENERATOR_HP,
    fuel: 0, maxFuel: GENERATOR_MAX_FUEL,
    on: false,
    range: GENERATOR_RANGE,
  };
}

// Place a generator at (worldX, worldY). The point is treated as the desired
// CENTER — we snap it to the wall grid so the footprint aligns with walls.
// Returns the new generator on success, null otherwise (with a setNotice).
function placeGenerator(worldX, worldY) {
  if (!Game.generators) Game.generators = [];
  // Snap to wall grid (same lattice walls use).
  const cx = clamp(Math.floor(worldX / WALL_SIZE), 0, Math.floor(WORLD_W / WALL_SIZE) - 1);
  const cy = clamp(Math.floor(worldY / WALL_SIZE), 0, Math.floor(WORLD_H / WALL_SIZE) - 1);
  const rect = { x: cx * WALL_SIZE, y: cy * WALL_SIZE, w: GENERATOR_SIZE, h: GENERATOR_SIZE };
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > WORLD_W || rect.y + rect.h > WORLD_H) {
    setNotice('Out of bounds', 1); return null;
  }
  // Reject overlap with world obstacles, walls, other generators.
  let blocked = false;
  if (typeof World !== 'undefined' && World.forEachActiveObstacle) {
    World.forEachActiveObstacle(rect.x + rect.w / 2, rect.y + rect.h / 2, (o) => {
      if (!blocked && rect.x < o.x + o.w && rect.x + rect.w > o.x &&
          rect.y < o.y + o.h && rect.y + rect.h > o.y) blocked = true;
    });
  }
  if (blocked) { setNotice("Can't place there", 1); return null; }
  for (const w of Game.walls) {
    if (rect.x < w.x + w.w && rect.x + rect.w > w.x &&
        rect.y < w.y + w.h && rect.y + rect.h > w.y) {
      setNotice("Can't place there", 1); return null;
    }
  }
  for (const g of Game.generators) {
    if (rect.x < g.x + g.w && rect.x + rect.w > g.x &&
        rect.y < g.y + g.h && rect.y + rect.h > g.y) {
      setNotice("Can't place there", 1); return null;
    }
  }
  // Don't drop one on the player.
  const p = Game.player;
  if (p && rect.x < p.x + p.r && rect.x + rect.w > p.x - p.r &&
          rect.y < p.y + p.r && rect.y + rect.h > p.y - p.r) {
    setNotice("Can't place there", 1); return null;
  }
  const gen = makeGenerator(rect.x, rect.y);
  Game.generators.push(gen);
  Audio.sfx.click();
  setNotice('Generator placed — refuel with E', 2);
  return gen;
}

// Returns true if any powered generator has the world point inside its aura.
// Used by future Garage / Radio / Cameras features to gate their stations.
function isPowered(worldX, worldY) {
  const gens = Game.generators;
  if (!gens || gens.length === 0) return false;
  for (let i = 0; i < gens.length; i++) {
    const g = gens[i];
    if (!g.on) continue;
    const gx = g.x + g.w * 0.5, gy = g.y + g.h * 0.5;
    const dx = gx - worldX, dy = gy - worldY;
    if (dx * dx + dy * dy <= g.range * g.range) return true;
  }
  return false;
}

// Find the closest generator within `radius` of the player. Used by the
// E-key interact dispatch in game.js to route refuel/toggle to the right
// generator.
function findGeneratorNear(player, radius) {
  const gens = Game.generators;
  if (!gens || gens.length === 0) return null;
  const R = (radius || GENERATOR_INTERACT_RADIUS);
  let best = null, bestD = R * R;
  for (const g of gens) {
    const gx = g.x + g.w * 0.5, gy = g.y + g.h * 0.5;
    const dx = gx - player.x, dy = gy - player.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = g; }
  }
  return best;
}

// Refuel a generator using the player's inventory. Prefers fuel_can stacks
// (one can = +50 fuel) and falls back to scrap (one scrap = +5 fuel). If
// the generator is empty and gets at least one charge, we also flip it ON.
// If both inventories are empty, this becomes a toggle instead (so the
// player can shut down a powered grid manually).
function tryRefuelGenerator(gen, player) {
  if (!gen) return false;
  const inv = player && player.inventory;
  const wasOff = !gen.on;
  let added = 0;

  // Top up with fuel cans first — they're the dense source.
  if (inv && typeof hasItem === 'function' && hasItem(inv, 'fuel_can', 1)) {
    while (gen.fuel < gen.maxFuel - 0.01 && hasItem(inv, 'fuel_can', 1)) {
      removeItem(inv, 'fuel_can', 1);
      gen.fuel = Math.min(gen.maxFuel, gen.fuel + GENERATOR_CAN_FUEL);
      added += GENERATOR_CAN_FUEL;
    }
  }
  // Then scrap, in single units so we don't overshoot maxFuel by much.
  if (inv && typeof hasItem === 'function' && gen.fuel < gen.maxFuel - 0.01) {
    while (gen.fuel < gen.maxFuel - 0.01 && hasItem(inv, 'scrap', 1)) {
      removeItem(inv, 'scrap', 1);
      gen.fuel = Math.min(gen.maxFuel, gen.fuel + GENERATOR_SCRAP_FUEL);
      added += GENERATOR_SCRAP_FUEL;
    }
  }

  if (added > 0) {
    if (wasOff && gen.fuel > 0) gen.on = true;
    Audio.sfx.pickup();
    setNotice(`+${Math.round(added)} fuel · ${Math.round(gen.fuel)}/${gen.maxFuel}`, 1.5);
    return true;
  }
  // Nothing to feed it — treat the E press as a toggle instead.
  if (gen.fuel > 0) {
    gen.on = !gen.on;
    Audio.sfx.click();
    setNotice(gen.on ? 'Generator ON' : 'Generator OFF', 1.2);
    return true;
  }
  setNotice('No fuel · need scrap or fuel can', 1.5);
  Audio.sfx.empty();
  return false;
}

// Deal damage to a generator. On death the generator drops half its remaining
// fuel as a scrap pickup (rounded down) so an attack still rewards the
// defender for losing the asset.
function damageGenerator(gen, dmg) {
  if (!gen || gen.hp <= 0) return;
  gen.hp -= dmg;
  if (gen.hp <= 0) {
    gen.hp = 0;
    gen.on = false;
    // Smoke / chunk particles.
    for (let i = 0; i < 14; i++) {
      Game.particles.push({
        x: gen.x + gen.w * 0.5 + rand(-gen.w * 0.4, gen.w * 0.4),
        y: gen.y + gen.h * 0.5 + rand(-gen.h * 0.4, gen.h * 0.4),
        vx: rand(-140, 140), vy: rand(-180, -30),
        life: rand(0.4, 0.9),
        color: i % 2 ? '#3a3f4a' : '#e3a83a',
        r: rand(2, 4),
      });
    }
    // Drop half the remaining fuel as scrap (1 scrap == 5 fuel by design).
    const scrapN = Math.max(1, Math.floor((gen.fuel * 0.5) / GENERATOR_SCRAP_FUEL));
    Game.pickups.push({
      x: gen.x + gen.w * 0.5,
      y: gen.y + gen.h * 0.5,
      r: 12, type: `item_scrap_${scrapN}`, life: 30,
    });
    // Remove from the live list.
    const idx = Game.generators.indexOf(gen);
    if (idx >= 0) Game.generators.splice(idx, 1);
    Audio.sfx.explosion();
    setNotice('Generator destroyed', 2);
  } else {
    Audio.sfx.hit();
  }
}

// Per-tick update: fuel drain and automatic shut-off. Generators tick even
// when off-screen — the powered radius can stretch outside the camera and
// the radio/garage subsystems may need a consistent state on resume.
function updatePower(dt) {
  const gens = Game.generators;
  if (!gens || gens.length === 0) return;
  for (let i = 0; i < gens.length; i++) {
    const g = gens[i];
    if (!g.on) continue;
    g.fuel -= GENERATOR_FUEL_PER_SEC * dt;
    if (g.fuel <= 0) {
      g.fuel = 0;
      g.on = false;
      // Subtle audible cue when one dies.
      if (Audio && Audio.sfx && Audio.sfx.empty) Audio.sfx.empty();
    }
  }
}

// Draw generators + (if on) a faint dotted aura ring. Call inside the world
// transform between obstacles and the player/squad pass.
function drawGenerators(ctx, camX, camY) {
  const gens = Game.generators;
  if (!gens || gens.length === 0) return;
  const vL = camX - 60, vR = camX + VIEW_W + 60;
  const vT = camY - 60, vB = camY + VIEW_H + 60;
  for (let i = 0; i < gens.length; i++) {
    const g = gens[i];
    // Viewport cull against the generator footprint + aura.
    const cx = g.x + g.w * 0.5, cy = g.y + g.h * 0.5;
    if (cx + g.range < vL || cx - g.range > vR ||
        cy + g.range < vT || cy - g.range > vB) continue;
    drawGenerator(ctx, g);
  }
}

function drawGenerator(ctx, g) {
  const cx = g.x + g.w * 0.5, cy = g.y + g.h * 0.5;

  // Aura ring — faint cyan-grey while powered. Drawn first so the box sits
  // on top of it.
  if (g.on) {
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#9bc6cf';
    ctx.beginPath();
    ctx.arc(cx, cy, g.range, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = '#9bc6cf';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.arc(cx, cy, g.range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Body — gunmetal panel.
  const baseCol = g.on ? '#3a3f4a' : '#2a2d33';
  const trimCol = g.on ? '#5a606b' : '#43464d';
  ctx.fillStyle = baseCol;
  ctx.fillRect(g.x, g.y, g.w, g.h);
  // Inset highlight along the top + left.
  ctx.fillStyle = trimCol;
  ctx.fillRect(g.x + 1, g.y + 1, g.w - 2, 2);
  ctx.fillRect(g.x + 1, g.y + 1, 2, g.h - 2);
  // Shadow along the bottom + right.
  ctx.fillStyle = '#15171b';
  ctx.fillRect(g.x + 1, g.y + g.h - 3, g.w - 2, 2);
  ctx.fillRect(g.x + g.w - 3, g.y + 1, 2, g.h - 2);

  // Vent stripes — two horizontal slits across the middle. Yellow + glowing
  // when powered, dark when off.
  const vTop = g.y + g.h * 0.35;
  const vMid = g.y + g.h * 0.55;
  if (g.on) {
    ctx.fillStyle = '#e3a83a';
    ctx.fillRect(g.x + 6, vTop, g.w - 12, 3);
    ctx.fillRect(g.x + 6, vMid, g.w - 12, 3);
    // Hot spot in the middle stripe.
    ctx.fillStyle = '#f4d77a';
    ctx.fillRect(g.x + 8, vMid + 1, g.w - 16, 1);
  } else {
    ctx.fillStyle = '#1a1c20';
    ctx.fillRect(g.x + 6, vTop, g.w - 12, 3);
    ctx.fillRect(g.x + 6, vMid, g.w - 12, 3);
  }

  // Small status LED top-right (green on, red dim off).
  ctx.fillStyle = g.on ? '#8ec547' : '#5a2a2a';
  ctx.fillRect(g.x + g.w - 6, g.y + 4, 2, 2);

  // HP bar above when damaged.
  if (g.hp < g.maxHp) {
    const pct = Math.max(0, g.hp / g.maxHp);
    const bw = g.w - 4;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(g.x + 2, g.y - 5, bw, 3);
    ctx.fillStyle = pct > 0.5 ? '#7ad97a' : pct > 0.25 ? '#e3c054' : '#d24b35';
    ctx.fillRect(g.x + 2, g.y - 5, bw * pct, 3);
  }
  // Fuel bar above the HP bar (or in its place when undamaged).
  const fuelY = g.hp < g.maxHp ? g.y - 9 : g.y - 5;
  const fpct = Math.max(0, g.fuel / g.maxFuel);
  const fbw = g.w - 4;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(g.x + 2, fuelY, fbw, 3);
  ctx.fillStyle = g.on ? '#e3a83a' : '#7a7e88';
  ctx.fillRect(g.x + 2, fuelY, fbw * fpct, 3);
}

// ---------- Save / load ----------
function savePower() {
  const gens = Game.generators || [];
  return gens.map(g => ({
    x: g.x, y: g.y,
    hp: g.hp, maxHp: g.maxHp,
    fuel: g.fuel, maxFuel: g.maxFuel,
    on: !!g.on,
    range: g.range,
  }));
}

function loadPower(data) {
  initPower();
  if (!Array.isArray(data)) return;
  for (const d of data) {
    if (!d || typeof d.x !== 'number' || typeof d.y !== 'number') continue;
    Game.generators.push({
      id: __genIdSeq++,
      x: d.x, y: d.y,
      w: GENERATOR_SIZE, h: GENERATOR_SIZE,
      hp: typeof d.hp === 'number' ? d.hp : GENERATOR_HP,
      maxHp: typeof d.maxHp === 'number' ? d.maxHp : GENERATOR_HP,
      fuel: typeof d.fuel === 'number' ? d.fuel : 0,
      maxFuel: typeof d.maxFuel === 'number' ? d.maxFuel : GENERATOR_MAX_FUEL,
      on: !!d.on,
      range: typeof d.range === 'number' ? d.range : GENERATOR_RANGE,
    });
  }
}
