'use strict';

// ---------- Drivable Vehicles ----------
// Foundation for Garage (B·03) and RV (D·04). Drivable cars/trucks/RVs live
// on Game.vehicles. Distinct from the decorative obstacle vehicles.
//
// Driving: W accel, S brake/reverse (40% cap), A/D turn (rate scales with
// forward speed), drag^(dt*60) coast, fuel 1u/5s while moving. Visual is a
// rotated rect, collider is an inscribed circle so we reuse the shared
// resolveCircleRect codepath. While player.drivingVehicleId != null the
// player's own WASD path is gated off (see integration spec).

const VEHICLE_KINDS = {
  sedan: {
    maxHp: 250, maxFuel: 80, maxSpeed: 320,
    seats: 2, length: 56, width: 28,
    accel: 280, brake: 360, turn: 2.4, drag: 0.92,
    bodyColor: '#4a6a8a', trim: '#2a3a4a', glass: '#9fd0e8',
    flammable: false, inventorySlots: 0,
  },
  truck: {
    maxHp: 400, maxFuel: 120, maxSpeed: 280,
    seats: 2, length: 64, width: 32,
    accel: 220, brake: 320, turn: 2.0, drag: 0.93,
    bodyColor: '#5a4a32', trim: '#3a2a1a', glass: '#9fd0e8',
    flammable: false, inventorySlots: 0,
  },
  rv: {
    maxHp: 400, maxFuel: 100, maxSpeed: 240,
    seats: 3, length: 88, width: 36,
    accel: 180, brake: 280, turn: 1.6, drag: 0.94,
    bodyColor: '#c8c2a8', trim: '#7a6e54', glass: '#9fd0e8',
    flammable: true, inventorySlots: 30,
  },
};

const VEHICLE_INTERACT_RADIUS = 40;
const VEHICLE_FUEL_DRAIN_PER_SEC = 1 / 5;
const VEHICLE_REPAIR_PER_PART = 80;
const VEHICLE_FIRE_DPS = 18;

let __vehicleIdCounter = 1;

function initVehicles() {
  Game.vehicles = [];
  __vehicleIdCounter = 1;
  if (Game.player) Game.player.drivingVehicleId = null;
}

function isPlayerDriving() {
  const p = Game.player;
  return !!(p && p.drivingVehicleId != null);
}

function getDrivenVehicle() {
  if (!isPlayerDriving() || !Game.vehicles) return null;
  const id = Game.player.drivingVehicleId;
  for (const v of Game.vehicles) if (v.id === id) return v;
  return null;
}

function spawnVehicle(kind, x, y, angle = 0) {
  const def = VEHICLE_KINDS[kind];
  if (!def) { console.warn('spawnVehicle: unknown kind', kind); return null; }
  if (!Game.vehicles) Game.vehicles = [];
  const v = {
    id: __vehicleIdCounter++, kind, x, y, angle,
    vx: 0, vy: 0, speed: 0,
    hp: def.maxHp, maxHp: def.maxHp,
    fuel: def.maxFuel, maxFuel: def.maxFuel,
    maxSpeed: def.maxSpeed,
    seats: def.seats, occupants: [],
    inventory: def.inventorySlots > 0
      ? { capacity: def.inventorySlots, slots: Array.from({ length: def.inventorySlots }, () => null) }
      : null,
    broken: false, onFire: 0,
  };
  Game.vehicles.push(v);
  return v;
}

// Pre-broken RV — used by world-gen seeding in highland biome.
function spawnWreckRV(x, y, angle = 0) {
  const v = spawnVehicle('rv', x, y, angle);
  if (!v) return null;
  v.hp = 0; v.fuel = 0; v.broken = true;
  return v;
}

function findVehicleNear(player, radius = 50) {
  if (!Game.vehicles || Game.vehicles.length === 0) return null;
  let best = null, bestD = radius * radius;
  for (const v of Game.vehicles) {
    const dx = v.x - player.x, dy = v.y - player.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

function enterVehicle(player, vehicle) {
  if (!vehicle) return false;
  if (vehicle.broken) { setNotice('Vehicle is wrecked — needs repair', 1.6); return false; }
  if (vehicle.occupants.length >= vehicle.seats) { setNotice('Vehicle is full', 1.2); return false; }
  player.drivingVehicleId = vehicle.id;
  vehicle.occupants.push('player');
  setNotice(`Driving ${vehicle.kind.toUpperCase()} · F to exit`, 1.8);
  if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx.click) Audio.sfx.click();
  return true;
}

function exitVehicle(player) {
  const v = getDrivenVehicle();
  if (!v) { player.drivingVehicleId = null; return false; }
  const def = VEHICLE_KINDS[v.kind];
  const perpX = -Math.sin(v.angle), perpY = Math.cos(v.angle);
  const off = def.width * 0.5 + (player.r || 12) + 4;
  let nx = v.x + perpX * off, ny = v.y + perpY * off;
  if (inObstacle(nx, ny, player.r || 12)) {
    nx = v.x - perpX * off; ny = v.y - perpY * off;
  }
  player.x = nx; player.y = ny;
  player.vx = 0; player.vy = 0;
  player.drivingVehicleId = null;
  v.occupants = v.occupants.filter(o => o !== 'player');
  setNotice('Dismounted', 1);
  if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx.click) Audio.sfx.click();
  return true;
}

// Damage. Flammable RVs catch fire (DoT). At 0 HP -> wreck (non-drivable).
function damageVehicle(v, dmg) {
  if (!v || v.broken) return;
  v.hp -= dmg;
  if (VEHICLE_KINDS[v.kind].flammable && Math.random() < 0.25) {
    v.onFire = Math.max(v.onFire, 3.5);
  }
  if (v.hp <= 0) {
    v.hp = 0; v.broken = true; v.speed = 0; v.vx = 0; v.vy = 0;
    if (Game.player && Game.player.drivingVehicleId === v.id) exitVehicle(Game.player);
    for (let i = 0; i < 18; i++) {
      Game.particles.push({
        x: v.x + rand(-20, 20), y: v.y + rand(-12, 12),
        vx: rand(-120, 120), vy: rand(-160, -20),
        life: rand(0.4, 0.9), color: i % 2 ? '#7a7060' : '#3a3530', r: rand(2, 4),
      });
    }
    if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx.explosion) Audio.sfx.explosion();
  }
}

// One repair tick: 1 fuel_pump + 1 car_battery + 1 gear_set from inventory.
function repairVehicle(vehicle, player) {
  if (!vehicle || !player || !player.inventory) return false;
  if (!vehicle.broken && vehicle.hp >= vehicle.maxHp) {
    setNotice('Vehicle already at full HP', 1.2); return false;
  }
  const need = [
    { id: 'fuel_pump', n: 1 },
    { id: 'car_battery', n: 1 },
    { id: 'gear_set', n: 1 },
  ];
  for (const r of need) {
    if (!hasItem(player.inventory, r.id, r.n)) {
      setNotice(`Need ${r.id.replace(/_/g, ' ')}`, 1.6); return false;
    }
  }
  for (const r of need) removeItem(player.inventory, r.id, r.n);
  vehicle.hp = Math.min(vehicle.maxHp, vehicle.hp + VEHICLE_REPAIR_PER_PART);
  if (vehicle.hp >= vehicle.maxHp * 0.5) vehicle.broken = false;
  setNotice(`Repaired +${VEHICLE_REPAIR_PER_PART} HP`, 1.5);
  if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx.pickup) Audio.sfx.pickup();
  return true;
}

// ---------- Tick ----------
function updateVehicles(dt) {
  const list = Game.vehicles;
  if (!list || list.length === 0) return;

  for (let i = 0; i < list.length; i++) {
    const v = list[i];
    const def = VEHICLE_KINDS[v.kind];

    // Burning RV — DoT plus smoke.
    if (v.onFire > 0) {
      v.onFire -= dt;
      damageVehicle(v, VEHICLE_FIRE_DPS * dt);
      if (Math.random() < dt * 8) {
        Game.particles.push({
          x: v.x + rand(-16, 16), y: v.y + rand(-10, 10),
          vx: rand(-30, 30), vy: rand(-80, -30),
          life: 0.4, color: '#ff7a33', r: rand(2, 4),
        });
      }
      if (v.onFire < 0) v.onFire = 0;
    }
    if (v.broken) { v.vx = 0; v.vy = 0; v.speed = 0; continue; }

    const driven = (Game.player && Game.player.drivingVehicleId === v.id);
    let throttle = 0, steer = 0;
    if (driven) {
      if (input.keys.has('w')) throttle += 1;
      if (input.keys.has('s')) throttle -= 1;
      if (input.keys.has('a')) steer -= 1;
      if (input.keys.has('d')) steer += 1;
    }

    // Signed forward speed along the heading.
    const hx0 = Math.cos(v.angle), hy0 = Math.sin(v.angle);
    let forward = v.vx * hx0 + v.vy * hy0;
    if (v.fuel > 0 && throttle > 0) {
      forward += def.accel * throttle * dt;
    } else if (throttle < 0) {
      forward += def.brake * throttle * dt;
      const revCap = -def.maxSpeed * 0.4;
      if (forward < revCap) forward = revCap;
    }
    if (forward > def.maxSpeed) forward = def.maxSpeed;

    // Steering rate scales with speed.
    const speedFrac = Math.min(1, Math.abs(forward) / def.maxSpeed);
    v.angle += steer * def.turn * speedFrac * dt;

    // Re-project onto (possibly updated) heading, then apply drag.
    const hx = Math.cos(v.angle), hy = Math.sin(v.angle);
    v.vx = hx * forward; v.vy = hy * forward;
    const k = Math.pow(def.drag, dt * 60);
    v.vx *= k; v.vy *= k;

    // Integrate.
    const prevX = v.x, prevY = v.y;
    v.x += v.vx * dt; v.y += v.vy * dt;
    v.speed = Math.hypot(v.vx, v.vy);

    // Fuel drain (motion-based, idle is free).
    if (v.speed > 4 && v.fuel > 0) {
      v.fuel = Math.max(0, v.fuel - VEHICLE_FUEL_DRAIN_PER_SEC * dt);
    }

    // World bounds + obstacle/wall collision via circle probe.
    const colR = def.length * 0.45;
    v.x = clamp(v.x, colR, WORLD_W - colR);
    v.y = clamp(v.y, colR, WORLD_H - colR);
    const probe = { x: v.x, y: v.y, r: colR };
    let hit = false;
    World.forEachObstacleNear(v.x, v.y, colR + TILE_SIZE, (o) => {
      if (o.walkable) return;
      if (resolveCircleRect(probe, o)) hit = true;
    });
    for (const w of Game.walls) if (resolveCircleRect(probe, w)) hit = true;
    v.x = probe.x; v.y = probe.y;

    if (hit) {
      v.vx *= 0.4; v.vy *= 0.4;
      if (v.speed > 120) damageVehicle(v, Math.min(20, v.speed * 0.04));
      // Re-align velocity to the heading so we don't drift sideways forever.
      const hx2 = Math.cos(v.angle), hy2 = Math.sin(v.angle);
      const f2 = v.vx * hx2 + v.vy * hy2;
      v.vx = hx2 * f2; v.vy = hy2 * f2;
    }

    // Ram nearby zombies if we're moving fast — they take damage + a shove.
    if (v.speed > 60) {
      const ramR = colR + 6;
      const zs = Game.zombies;
      for (let kk = 0; kk < zs.length; kk++) {
        const z = zs[kk];
        const dx = z.x - v.x, dy = z.y - v.y;
        if (dx * dx + dy * dy < ramR * ramR) {
          z.hp -= v.speed * 0.05;
          z.stunned = Math.max(z.stunned || 0, 0.3);
          const d = Math.hypot(dx, dy) || 1;
          z.x += dx / d * 6; z.y += dy / d * 6;
        }
      }
    }

    // Keep the driver glued to the vehicle (their own WASD path is gated).
    if (driven && Game.player) {
      Game.player.x = v.x; Game.player.y = v.y; Game.player.angle = v.angle;
    }
  }
}

// ---------- Draw ----------
function drawVehicles(ctx, camX, camY) {
  const list = Game.vehicles;
  if (!list || list.length === 0) return;
  const vL = camX - 80, vR = camX + VIEW_W + 80;
  const vT = camY - 80, vB = camY + VIEW_H + 80;
  for (const v of list) {
    if (v.x < vL || v.x > vR || v.y < vT || v.y > vB) continue;
    drawVehicleSprite(ctx, v);
    if (!v.broken && v.hp < v.maxHp) drawVehicleHpBar(ctx, v);
    if (v.broken) drawWreckPrompt(ctx, v);
  }
}

function drawVehicleHpBar(ctx, v) {
  const def = VEHICLE_KINDS[v.kind];
  const bw = def.length, pct = Math.max(0, v.hp / v.maxHp);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(v.x - bw / 2, v.y - def.width - 8, bw, 3);
  ctx.fillStyle = pct > 0.5 ? '#7ad97a' : pct > 0.25 ? '#e3c054' : '#d24b35';
  ctx.fillRect(v.x - bw / 2, v.y - def.width - 8, bw * pct, 3);
}

function drawWreckPrompt(ctx, v) {
  if (!Game.player || Game.player.dead || isPlayerDriving()) return;
  const dx = v.x - Game.player.x, dy = v.y - Game.player.y;
  if (dx * dx + dy * dy > 3600) return;
  const def = VEHICLE_KINDS[v.kind];
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(v.x - 36, v.y - def.width - 22, 72, 14);
  ctx.fillStyle = '#e3c054'; ctx.font = 'bold 9px monospace';
  ctx.fillText('R · REPAIR', v.x - 30, v.y - def.width - 12);
  ctx.restore();
}

function drawVehicleSprite(ctx, v) {
  const def = VEHICLE_KINDS[v.kind];
  const L = def.length, W = def.width;
  ctx.save();
  ctx.translate(v.x, v.y); ctx.rotate(v.angle);

  // Headlight cone projected forward while moving.
  if (!v.broken && v.speed > 30) {
    const grad = ctx.createRadialGradient(L * 0.55, 0, 0, L * 0.55, 0, L * 1.4);
    grad.addColorStop(0, 'rgba(255,240,180,0.32)');
    grad.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(L * 0.45, -W * 0.5);
    ctx.lineTo(L * 0.45 + 220, -W * 1.4);
    ctx.lineTo(L * 0.45 + 220,  W * 1.4);
    ctx.lineTo(L * 0.45,  W * 0.5);
    ctx.closePath(); ctx.fill();
  }

  // Shadow, body, roof trim.
  const body = v.broken ? darken(def.bodyColor, 0.55) : def.bodyColor;
  const trim = v.broken ? darken(def.trim, 0.55) : def.trim;
  const glass = v.broken ? '#3a4a55' : def.glass;
  ctx.fillStyle = 'rgba(0,0,0,0.30)'; ctx.fillRect(-L / 2 + 2, -W / 2 + 2, L, W);
  ctx.fillStyle = body;               ctx.fillRect(-L / 2, -W / 2, L, W);
  ctx.fillStyle = trim;
  ctx.fillRect(-L / 2, -W / 2, L, 3);
  ctx.fillRect(-L / 2,  W / 2 - 3, L, 3);

  if (v.kind === 'sedan') {
    ctx.fillStyle = glass;
    ctx.fillRect(L * 0.05, -W / 2 + 4, L * 0.20, W - 8);
    ctx.fillRect(-L * 0.30, -W / 2 + 4, L * 0.18, W - 8);
    ctx.fillStyle = trim; ctx.fillRect(L * 0.30, -W / 2, 1, W);
  } else if (v.kind === 'truck') {
    ctx.fillStyle = glass; ctx.fillRect(L * 0.10, -W / 2 + 4, L * 0.18, W - 8);
    ctx.fillStyle = darken(body, 0.65);
    ctx.fillRect(-L / 2 + 4, -W / 2 + 4, L * 0.42, W - 8);
    ctx.fillStyle = trim;
    for (let kk = 0; kk < 3; kk++) ctx.fillRect(-L / 2 + 8 + kk * 8, -W / 2 + 4, 1, W - 8);
  } else { // rv
    ctx.fillStyle = glass; ctx.fillRect(L * 0.25, -W / 2 + 5, L * 0.18, W - 10);
    for (let kk = 0; kk < 3; kk++) {
      ctx.fillRect(-L / 2 + 8 + kk * (L * 0.18), -W / 2 + 5, L * 0.12, 6);
      ctx.fillRect(-L / 2 + 8 + kk * (L * 0.18),  W / 2 - 11, L * 0.12, 6);
    }
    ctx.fillStyle = trim; ctx.fillRect(-L / 2 + 2, -W / 2 + 6, 3, W - 12);
  }

  // Wheels.
  ctx.fillStyle = '#181a1c';
  const wx = L * 0.32;
  ctx.fillRect(-wx - 3, -W / 2 - 1, 6, 4); ctx.fillRect( wx - 3, -W / 2 - 1, 6, 4);
  ctx.fillRect(-wx - 3,  W / 2 - 3, 6, 4); ctx.fillRect( wx - 3,  W / 2 - 3, 6, 4);

  if (v.broken) {
    ctx.strokeStyle = '#0b0c0e'; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(L * 0.20, -W / 2 + 2); ctx.lineTo(L * 0.42,  W / 2 - 4);
    ctx.moveTo(L * 0.10,  W / 2 - 2); ctx.lineTo(L * 0.38, -W / 2 + 5);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(L * 0.15, -4, 10, 8); ctx.fillRect(-L * 0.3, -6, 12, 10);
  } else {
    ctx.fillStyle = '#f5e2a8';
    ctx.fillRect(L / 2 - 3, -W / 2 + 3, 2, 3);
    ctx.fillRect(L / 2 - 3,  W / 2 - 6, 2, 3);
  }

  // Driver decal — low alpha so the vehicle still reads.
  if (Game.player && Game.player.drivingVehicleId === v.id) {
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#cfd4dc';
    ctx.beginPath(); ctx.arc(L * 0.10, -W * 0.20, 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

// hex tint helper — multiplies channels.
function darken(hex, mult) {
  if (!hex || hex[0] !== '#' || hex.length !== 7) return hex;
  const r = Math.max(0, Math.min(255, Math.floor(parseInt(hex.slice(1, 3), 16) * mult)));
  const g = Math.max(0, Math.min(255, Math.floor(parseInt(hex.slice(3, 5), 16) * mult)));
  const b = Math.max(0, Math.min(255, Math.floor(parseInt(hex.slice(5, 7), 16) * mult)));
  return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
}

// ---------- Save / Load ----------
function saveVehicles() {
  if (!Game.vehicles) return [];
  return Game.vehicles.map(v => ({
    id: v.id, kind: v.kind,
    x: v.x, y: v.y, angle: v.angle,
    hp: v.hp, fuel: v.fuel, broken: !!v.broken,
    inventory: v.inventory ? {
      capacity: v.inventory.capacity,
      slots: v.inventory.slots.map(s => s ? { id: s.id, count: s.count } : null),
    } : null,
  }));
}

function loadVehicles(data) {
  initVehicles();
  if (!Array.isArray(data)) return;
  for (const d of data) {
    const def = VEHICLE_KINDS[d.kind];
    if (!def) continue;
    const v = spawnVehicle(d.kind, d.x, d.y, d.angle || 0);
    if (!v) continue;
    v.hp = clamp(d.hp != null ? d.hp : def.maxHp, 0, def.maxHp);
    v.fuel = clamp(d.fuel != null ? d.fuel : def.maxFuel, 0, def.maxFuel);
    v.broken = !!d.broken || v.hp <= 0;
    if (v.inventory && d.inventory && Array.isArray(d.inventory.slots)) {
      const cap = v.inventory.capacity;
      for (let i = 0; i < Math.min(cap, d.inventory.slots.length); i++) {
        const s = d.inventory.slots[i];
        if (s && ITEMS[s.id] && s.count > 0) {
          v.inventory.slots[i] = { id: s.id, count: Math.min(s.count, ITEMS[s.id].stackMax) };
        }
      }
    }
  }
  for (const v of Game.vehicles) {
    if (v.id >= __vehicleIdCounter) __vehicleIdCounter = v.id + 1;
  }
}
