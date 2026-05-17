'use strict';

// ---------- Noise Box (C·03) ----------
// Placeable speaker on a tripod with a battery slot. N triggers a 30s
// 200-tile aggro pull from the nearest fueled box; every zombie in range
// retargets to the box until the pull expires. State on Game.noiseBoxes.
// Place: noise_box_kit (item use). Fuel: 1 battery = 3 charges (E to slot).
// pickAggroOverride(z) is consulted FIRST by the zombie target picker so
// the override beats the player / squad pick while it is live.

const NOISE_PULL_DURATION = 30;                  // seconds
const NOISE_PULL_RADIUS   = 200 * TILE_SIZE;     // 8000px @ 40-tile size
const NOISE_PULL_RADIUS2  = NOISE_PULL_RADIUS * NOISE_PULL_RADIUS;
const NOISE_BOX_MAX_HP    = 40;
const NOISE_BOX_CHARGES_PER_BATTERY = 3;
const NOISE_BOX_INTERACT_RADIUS = 50;
const NOISE_RING_COUNT = 3;

function initNoiseBoxes() {
  Game.noiseBoxes = [];
}

// Place a noise box at the player's feet-forward position. Consumes 1
// noise_box_kit from the inventory. Returns the new box, or null if the
// position is blocked.
function placeNoiseBox(x, y, player) {
  if (typeof inObstacle === 'function' && inObstacle(x, y, 16)) {
    setNotice("Can't place noise box here", 1.2);
    return null;
  }
  if (x < 20 || y < 20 || x > WORLD_W - 20 || y > WORLD_H - 20) {
    setNotice('Out of bounds', 1);
    return null;
  }
  const box = {
    id: 'nb_' + Math.floor(Math.random() * 1e9).toString(36),
    x, y,
    batteryCharges: 0,
    active: false,
    activeUntil: 0,
    activeStartedAt: 0,
    hp: NOISE_BOX_MAX_HP,
    maxHp: NOISE_BOX_MAX_HP,
  };
  if (!Game.noiseBoxes) Game.noiseBoxes = [];
  Game.noiseBoxes.push(box);
  setNotice('Noise box placed — feed it a battery (E)', 2.5);
  if (Audio && Audio.sfx && Audio.sfx.click) Audio.sfx.click();
  return box;
}

// Find the nearest noise box to the player. Used by the E-key interact path
// and for the "any box exists" detonator check.
function findNoiseBoxNear(player, radius = NOISE_BOX_INTERACT_RADIUS) {
  const boxes = Game.noiseBoxes;
  if (!boxes || boxes.length === 0) return null;
  let best = null, bestD = radius * radius;
  for (const b of boxes) {
    const dx = b.x - player.x, dy = b.y - player.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

// Slot a battery into the box. Consumes 1 battery from the player's inventory
// and adds NOISE_BOX_CHARGES_PER_BATTERY uses. Returns true on success.
function slotBatteryIntoBox(box, player) {
  if (!box) return false;
  const inv = player.inventory;
  if (!inv || !hasItem(inv, 'battery', 1)) {
    setNotice('No battery to slot', 1.2);
    return false;
  }
  removeItem(inv, 'battery', 1);
  box.batteryCharges += NOISE_BOX_CHARGES_PER_BATTERY;
  setNotice(`Battery slotted (${box.batteryCharges} charges)`, 1.5);
  if (Audio && Audio.sfx && Audio.sfx.pickup) Audio.sfx.pickup();
  return true;
}

// Trigger this box's 30-second pull. Burns 1 charge and stamps every zombie
// in range with an aggroOverride pointing at the box.
function triggerNoisePull(box) {
  if (!box) return false;
  if (box.batteryCharges <= 0) {
    setNotice('Noise box needs a battery', 1.2);
    return false;
  }
  if (box.active) {
    setNotice('Noise box already blaring', 1.2);
    return false;
  }
  box.batteryCharges -= 1;
  box.active = true;
  const t = now();
  box.activeStartedAt = t;
  box.activeUntil = t + NOISE_PULL_DURATION;
  // Stamp every zombie in range. Pull radius is huge (200 tiles), so almost
  // every active zombie qualifies — that's the point.
  const zs = Game.zombies;
  if (zs) {
    for (let i = 0; i < zs.length; i++) {
      const z = zs[i];
      const dx = z.x - box.x, dy = z.y - box.y;
      if (dx * dx + dy * dy <= NOISE_PULL_RADIUS2) {
        z.aggroOverride = { until: box.activeUntil, x: box.x, y: box.y };
      }
    }
  }
  setNotice(`NOISE PULL · 30s · ${box.batteryCharges} charges left`, 3);
  if (Audio && Audio.sfx && Audio.sfx.wave) Audio.sfx.wave();
  return true;
}

// N-key entry point. Picks the closest noise box with charges and triggers
// it. Treated as if the player is holding a detonator that auto-equips when
// any noise box exists.
function triggerNearestNoisePull(player) {
  const boxes = Game.noiseBoxes;
  if (!boxes || boxes.length === 0) {
    setNotice('No noise box placed', 1.2);
    return false;
  }
  let best = null, bestD = Infinity;
  for (const b of boxes) {
    if (b.batteryCharges <= 0 || b.active) continue;
    const dx = b.x - player.x, dy = b.y - player.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = b; }
  }
  if (!best) {
    setNotice('No noise box ready (battery? cooldown?)', 1.5);
    return false;
  }
  return triggerNoisePull(best);
}

// Per-tick: expire active pulls.
function updateNoiseBoxes(/* dt */) {
  const boxes = Game.noiseBoxes;
  if (!boxes || boxes.length === 0) return;
  const t = now();
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (b.active && t >= b.activeUntil) {
      b.active = false;
    }
    if (b.hp <= 0) {
      // Small scrap splash so the destruction reads visually.
      for (let k = 0; k < 10; k++) {
        Game.particles.push({
          x: b.x, y: b.y,
          vx: rand(-160, 160), vy: rand(-160, 160),
          life: rand(0.3, 0.7), color: '#3a3f4a', r: rand(2, 4),
        });
      }
      setNotice('Noise box destroyed', 2);
      boxes.splice(i, 1);
    }
  }
}

// Returns {x, y} if this zombie has a live override stamp, else null.
// Integrator calls this FIRST in the zombie target selector.
function pickAggroOverride(zombie) {
  const ov = zombie && zombie.aggroOverride;
  if (!ov) return null;
  if (now() >= ov.until) {
    zombie.aggroOverride = null;
    return null;
  }
  return { x: ov.x, y: ov.y };
}

// Damage path — zombies / explosions can chew a noise box. Returns true if
// the box was destroyed by this hit.
function damageNoiseBox(box, dmg) {
  if (!box || box.hp <= 0) return false;
  box.hp -= dmg;
  if (box.hp <= 0) {
    box.hp = 0;
    return true;
  }
  return false;
}

// ---------- Rendering ----------
// Tripod + dark-grey speaker box with a cone. Active: yellow glow + 3
// expanding concentric rings (alpha 0.6 -> 0 over the pull duration).
function drawNoiseBoxes(ctx, camX, camY) {
  const boxes = Game.noiseBoxes;
  if (!boxes || boxes.length === 0) return;
  const t = now();
  for (const b of boxes) {
    // Skip if off-screen with a generous margin (active rings can be large).
    if (b.x + 600 < camX || b.x - 600 > camX + VIEW_W) continue;
    if (b.y + 600 < camY || b.y - 600 > camY + VIEW_H) continue;

    // Active-state rings (drawn under the prop so the prop reads on top).
    if (b.active) {
      const elapsed = t - b.activeStartedAt;
      const dur = NOISE_PULL_DURATION;
      const maxR = NOISE_PULL_RADIUS;
      ctx.save();
      // Soft yellow glow under the prop.
      const glowR = 28 + Math.sin(t * 8) * 3;
      ctx.fillStyle = 'rgba(255, 220, 90, 0.18)';
      ctx.beginPath(); ctx.arc(b.x, b.y, glowR, 0, Math.PI * 2); ctx.fill();
      for (let i = 0; i < NOISE_RING_COUNT; i++) {
        // Each ring is offset in phase so they cascade outward.
        const phase = ((elapsed / dur) + i / NOISE_RING_COUNT) % 1;
        const r = phase * maxR;
        const a = (1 - phase) * 0.6;
        if (a <= 0.01) continue;
        ctx.strokeStyle = `rgba(255, 220, 90, ${a})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(b.x, b.y, r, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
    }

    // Tripod: 3 short black legs splayed from a shared apex below the box.
    ctx.save();
    ctx.strokeStyle = '#101216';
    ctx.lineWidth = 2;
    const apexX = b.x, apexY = b.y + 6;
    const legLen = 18;
    for (let i = 0; i < 3; i++) {
      const ang = -Math.PI / 2 + (i - 1) * 1.2; // -1.2, 0, +1.2 around straight-up
      const fx = apexX + Math.cos(ang + Math.PI / 2) * legLen;
      const fy = apexY + Math.sin(ang + Math.PI / 2) * legLen;
      ctx.beginPath();
      ctx.moveTo(apexX, apexY);
      ctx.lineTo(fx, fy);
      ctx.stroke();
    }

    // Speaker box: 40×30 dark grey, slightly above apex.
    const bx = b.x - 20, by = b.y - 22;
    ctx.fillStyle = '#2a2d34';
    ctx.fillRect(bx, by, 40, 30);
    ctx.fillStyle = '#1a1c20';
    ctx.fillRect(bx, by + 28, 40, 2); // shadow lip
    // Cone center (the loud bit).
    const coneFill = b.active ? '#f3c64a' : '#7a7e88';
    ctx.fillStyle = coneFill;
    ctx.beginPath();
    ctx.arc(b.x, by + 15, 9, 0, Math.PI * 2);
    ctx.fill();
    // Dust cap.
    ctx.fillStyle = b.active ? '#fff1b0' : '#3a3f4a';
    ctx.beginPath();
    ctx.arc(b.x, by + 15, 3, 0, Math.PI * 2);
    ctx.fill();
    // Battery LED — green pip when fueled, red when empty.
    ctx.fillStyle = b.batteryCharges > 0 ? '#8ec547' : '#d24b35';
    ctx.fillRect(bx + 33, by + 3, 3, 3);

    // HP bar — only show when damaged.
    if (b.hp < b.maxHp) {
      const bw = 36;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(b.x - bw / 2 - 1, by - 8, bw + 2, 4);
      ctx.fillStyle = '#d24b35';
      ctx.fillRect(b.x - bw / 2, by - 7, bw * (b.hp / b.maxHp), 2);
    }
    ctx.restore();
  }
}

// ---------- Save / Load ----------
function saveNoiseBoxes() {
  const boxes = Game.noiseBoxes;
  if (!boxes) return [];
  return boxes.map(b => ({
    id: b.id,
    x: b.x, y: b.y,
    batteryCharges: b.batteryCharges | 0,
    hp: b.hp, maxHp: b.maxHp,
    // Pull state is intentionally dropped on save — resumes always start cold.
  }));
}

function loadNoiseBoxes(data) {
  Game.noiseBoxes = [];
  if (!Array.isArray(data)) return;
  for (const d of data) {
    Game.noiseBoxes.push({
      id: d.id || ('nb_' + Math.floor(Math.random() * 1e9).toString(36)),
      x: d.x, y: d.y,
      batteryCharges: (d.batteryCharges | 0),
      active: false,
      activeUntil: 0,
      activeStartedAt: 0,
      hp: d.hp != null ? d.hp : NOISE_BOX_MAX_HP,
      maxHp: d.maxHp != null ? d.maxHp : NOISE_BOX_MAX_HP,
    });
  }
}
