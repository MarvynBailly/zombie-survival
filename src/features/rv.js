'use strict';

// ---------- RV (D·04) ----------
// Rare drivable wreck in highland chunks. Repair via vehicles.js's
// repairVehicle to unlock a rolling base: 30-slot inventory, workbench flag,
// bed for one squadmate, optional claim that registers the RV as a base
// (HP 400, flammable — chassis owned by vehicles.js).
//
// This module = the RV-specific extension: highland world-gen, interior
// overlay UI, park-and-claim glue to bases.js, save/load of the RV-only
// flags. Consumes Game, setNotice, Audio, addItem, getItemIcon,
// spawnWreckRV, claimBase, removeBase, BASE_EFFECTIVE_RADIUS, CHUNK_SIZE,
// inObstacle, World.

const RV_CLAIM_SPEED_THRESHOLD = 4;    // parked = speed < 4 px/s
const RV_CLAIM_PARKED_SECONDS  = 5;    // sit still this long to claim
const RV_INTERACT_RADIUS       = 60;   // F/B prompt range
const RV_INTERIOR_SLOTS        = 30;   // mirrors VEHICLE_KINDS.rv.inventorySlots
const RV_AUTO_UNCLAIM_SPEED    = 40;   // drive this fast and the base drops

// ---------- Lifecycle ----------
function initRv() {
  Game.rvWrecksSpawned = false;
  Game.rvOverlayOpen = false; Game.rvOverlayTarget = null;
  __rvLayout = null;
}

// Per-tick: maintain the parked timer (gates "CLAIM AS BASE") and drop the
// claim if the player drives the RV away from where it was claimed.
function updateRv(dt) {
  const list = Game.vehicles;
  if (!list || list.length === 0) return;
  for (const v of list) {
    if (v.kind !== 'rv' || v.broken) continue;
    v.parkedT = (v.speed < RV_CLAIM_SPEED_THRESHOLD) ? ((v.parkedT || 0) + dt) : 0;
    if (!v.baseId || v.speed <= RV_AUTO_UNCLAIM_SPEED) continue;
    const b = (Game.bases || []).find(bb => bb.id === v.baseId);
    if (!b) { v.baseId = null; continue; }
    const dx = v.x - b.x, dy = v.y - b.y, r2 = (BASE_EFFECTIVE_RADIUS * 0.5) ** 2;
    if (dx * dx + dy * dy > r2) tryUnclaimRvBase(v);
  }
}

// ---------- World-gen seeding ----------
// Seeds at most one wreck per run, only on highland chunks, away from the
// player. Call from the chunk-activation hook (see integration spec).
function maybeSpawnHighlandWreck(chunk) {
  if (!chunk || Game.rvWrecksSpawned || typeof spawnWreckRV !== 'function') return;
  const reg = (typeof World !== 'undefined') ? World.region : null;
  if (!reg || !/high/i.test(reg.name || '')) return;
  const p = Game.player, bX = chunk.cx * CHUNK_SIZE, bY = chunk.cy * CHUNK_SIZE;
  for (let tries = 0; tries < 18; tries++) {
    const x = bX + 120 + Math.random() * (CHUNK_SIZE - 240);
    const y = bY + 120 + Math.random() * (CHUNK_SIZE - 240);
    if (typeof inObstacle === 'function' && inObstacle(x, y, 50)) continue;
    if (p && Math.hypot(x - p.x, y - p.y) < 600) continue;
    spawnWreckRV(x, y, Math.random() * Math.PI * 2);
    Game.rvWrecksSpawned = true;
    return;
  }
}

// ---------- Lookups ----------
function findRvNear(player, radius) {
  if (!player || !Game.vehicles) return null;
  const R = (radius || RV_INTERACT_RADIUS);
  let best = null, bestD = R * R;
  for (const v of Game.vehicles) {
    if (v.kind !== 'rv') continue;
    const dx = v.x - player.x, dy = v.y - player.y, d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = v; }
  }
  return best;
}

// ---------- Claim / unclaim ----------
function _canClaimRv(rv) {
  if (!rv || rv.kind !== 'rv' || rv.broken) return { ok: false, why: 'RV is wrecked' };
  if (rv.baseId)                            return { ok: false, why: 'Already claimed' };
  if (rv.speed >= RV_CLAIM_SPEED_THRESHOLD) return { ok: false, why: 'Stop the RV first' };
  const t = rv.parkedT || 0;
  if (t < RV_CLAIM_PARKED_SECONDS)
    return { ok: false, why: `Park for ${Math.ceil(RV_CLAIM_PARKED_SECONDS - t)}s more` };
  return { ok: true };
}

function tryClaimRvAsBase(rv) {
  const gate = _canClaimRv(rv);
  if (!gate.ok) { setNotice(gate.why, 1.6); return false; }
  if (typeof claimBase !== 'function') { setNotice('Bases unavailable', 1.4); return false; }
  const res = claimBase(rv.x, rv.y, 'RV');
  if (!res || res.error) {
    const why = res && res.error;
    setNotice(why === 'over_cap' ? 'Max bases reached' : why === 'too_close' ? 'Too close to another base'
            : why === 'blocked' ? 'Cannot claim here' : 'Cannot claim RV', 2);
    return false;
  }
  res.type = 'rv'; res.rvId = rv.id; rv.baseId = res.id;
  if (rv.interiorWorkbench === undefined) rv.interiorWorkbench = true;
  if (rv.interiorBed === undefined)       rv.interiorBed = true;
  setNotice(`RV claimed as ${res.name}`, 2);
  return true;
}

function tryUnclaimRvBase(rv) {
  if (!rv || !rv.baseId) return false;
  if (typeof removeBase === 'function') removeBase(rv.baseId);
  rv.baseId = null; setNotice('RV un-claimed', 1.4);
  return true;
}

// ---------- Overlay state ----------
let __rvLayout = null;
function openRvOverlay(rv) {
  if (Game.mode !== 'playing' || !rv || rv.kind !== 'rv') return;
  Game.rvOverlayOpen = true; Game.rvOverlayTarget = rv; Game.mapOpen = true;
  if (rv.interiorWorkbench === undefined) rv.interiorWorkbench = true;
  if (rv.interiorBed === undefined)       rv.interiorBed = true;
  if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx.click) Audio.sfx.click();
}

function closeRvOverlay() {
  Game.rvOverlayOpen = false; Game.rvOverlayTarget = null; __rvLayout = null;
  if (Game.mode === 'playing') Game.mapOpen = false;
  if (Game.player) Game.player.openCd = 0.4;
}

function isRvOverlayOpen() { return !!Game.rvOverlayOpen; }

// ---------- Overlay draw ----------
// Split panel — left: RV mini-diagram with bed/workbench/storage zones;
// right: 30 inventory slots; footer: claim/unclaim button + status line.
function drawRvInteriorOverlay(ctx, w, h) {
  const rv = Game.rvOverlayTarget;
  if (!rv) return;
  ctx.fillStyle = 'rgba(7,8,10,0.94)';   ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(11,12,14,0.92)'; ctx.fillRect(0, 0, w, 42);
  ctx.fillStyle = '#e3a83a'; ctx.font = 'bold 11px "JetBrains Mono", monospace';
  ctx.textAlign = 'left'; ctx.fillText('// RV INTERIOR', 22, 18);
  ctx.fillStyle = '#e8e6df'; ctx.font = 'bold 20px "Bebas Neue", sans-serif';
  ctx.fillText(rv.baseId ? 'RV · CLAIMED' : 'RV', 22, 34);
  ctx.fillStyle = '#7a7e88'; ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'right'; ctx.fillText('[B] OR [ESC] · CLOSE', w - 22, 26);
  ctx.textAlign = 'left';

  __rvLayout = { buttons: [], slots: [] };

  const top = 60, bot = h - 70;
  const lx = 30, lw = Math.min(280, Math.floor((w - 90) * 0.38));
  const rx = lx + lw + 30, rw = w - rx - 30;
  const ph = bot - top;

  // ----- LEFT: layout diagram -----
  ctx.fillStyle = 'rgba(20,22,26,0.95)'; ctx.fillRect(lx, top, lw, ph);
  ctx.fillStyle = '#3a3f4a'; ctx.fillRect(lx, top, lw, 1); ctx.fillRect(lx, top + ph - 1, lw, 1);
  ctx.fillStyle = '#caa760'; ctx.font = 'bold 11px "JetBrains Mono", monospace';
  ctx.fillText('// LAYOUT', lx + 12, top + 18);
  const dX = lx + 20, dY = top + 32, dW = lw - 40, dH = ph - 52;
  ctx.fillStyle = '#c8c2a8'; ctx.fillRect(dX, dY, dW, dH);
  ctx.fillStyle = '#7a6e54'; ctx.fillRect(dX, dY, dW, 3); ctx.fillRect(dX, dY + dH - 3, dW, 3);
  ctx.fillStyle = '#9fd0e8'; ctx.fillRect(dX + dW - 18, dY + 8, 12, dH - 16);
  const zh = (dH - 12) / 3;
  const zones = [
    [dY + 6,          rv.interiorBed       ? '#5fb6e8' : '#3a3f4a', 'BED'],
    [dY + 6 + zh,     rv.interiorWorkbench ? '#e3a83a' : '#3a3f4a', 'WORKBENCH'],
    [dY + 6 + zh * 2, '#8ec547',                                    `STORAGE · ${RV_INTERIOR_SLOTS}`],
  ];
  ctx.font = 'bold 10px "JetBrains Mono", monospace';
  for (const [zy, col, lbl] of zones) {
    ctx.fillStyle = col;       ctx.fillRect(dX + 8, zy, dW - 30, zh - 4);
    ctx.fillStyle = '#0b0c0e'; ctx.fillText(lbl, dX + 16, zy + zh / 2 + 3);
  }

  // ----- RIGHT: 30-slot cargo grid -----
  ctx.fillStyle = 'rgba(20,22,26,0.95)'; ctx.fillRect(rx, top, rw, ph);
  ctx.fillStyle = '#3a3f4a'; ctx.fillRect(rx, top, rw, 1); ctx.fillRect(rx, top + ph - 1, rw, 1);
  ctx.fillStyle = '#caa760'; ctx.font = 'bold 11px "JetBrains Mono", monospace';
  ctx.fillText('// CARGO', rx + 12, top + 18);
  const inv = rv.inventory;
  if (inv) {
    const cols = 6, slot = Math.min(40, Math.floor((rw - 24) / cols));
    const gw = slot * cols + (cols - 1) * 4;
    const gx = rx + (rw - gw) / 2, gy = top + 32;
    for (let i = 0; i < RV_INTERIOR_SLOTS && i < inv.slots.length; i++) {
      const sx = gx + (i % cols) * (slot + 4), sy = gy + ((i / cols) | 0) * (slot + 4);
      ctx.fillStyle = '#15171b'; ctx.fillRect(sx, sy, slot, slot);
      ctx.fillStyle = '#2a2d33'; ctx.fillRect(sx, sy, slot, 1); ctx.fillRect(sx, sy, 1, slot);
      const s = inv.slots[i];
      if (s) {
        const url = (typeof getItemIcon === 'function') ? getItemIcon(s.id) : null;
        const img = url ? _rvIconImg(s.id, url) : null;
        if (img && img.complete) ctx.drawImage(img, sx + 4, sy + 4, slot - 8, slot - 8);
        if (s.count > 1) {
          ctx.fillStyle = '#e8e6df';
          ctx.font = 'bold 10px "JetBrains Mono", monospace';
          ctx.textAlign = 'right';
          ctx.fillText(String(s.count), sx + slot - 4, sy + slot - 4); ctx.textAlign = 'left';
        }
      }
      __rvLayout.slots.push({ x: sx, y: sy, w: slot, h: slot, index: i });
    }
  }

  // ----- FOOTER: claim/unclaim button -----
  const btnW = 220, btnH = 44, btnX = (w - btnW) / 2, btnY = h - 56;
  const claimed = !!rv.baseId, gate = claimed ? { ok: true } : _canClaimRv(rv), enabled = gate.ok;
  ctx.fillStyle = claimed ? '#d24b35' : (enabled ? '#8ec547' : '#3a3f4a');
  ctx.fillRect(btnX, btnY, btnW, btnH);
  ctx.fillStyle = enabled ? '#0b0c0e' : '#7a7e88';
  ctx.font = 'bold 16px "JetBrains Mono", monospace'; ctx.textAlign = 'center';
  ctx.fillText(claimed ? 'UN-CLAIM RV' : 'CLAIM AS BASE', btnX + btnW / 2, btnY + btnH / 2 + 5);
  __rvLayout.buttons.push({ x: btnX, y: btnY, w: btnW, h: btnH, action: claimed ? 'unclaim' : 'claim', enabled });
  ctx.fillStyle = enabled ? '#caa760' : '#d24b35';
  ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillText(!enabled && gate.why ? gate.why : claimed ? 'Drive away to release the claim' : 'Parked. Ready to claim.',
               w / 2, btnY + btnH + 14);
  ctx.textAlign = 'left';
}

// Image cache for the data URLs produced by items.js getItemIcon.
const __rvIconImgs = {};
function _rvIconImg(id, dataUrl) {
  if (__rvIconImgs[id]) return __rvIconImgs[id];
  const img = new Image(); img.src = dataUrl;
  return (__rvIconImgs[id] = img);
}

// ---------- Click routing ----------
// Footer button → claim/unclaim. Cargo cell with an item → pull stack to
// player. Empty cell → push the first non-null player slot in.
function handleRvOverlayClick(mouseX, mouseY) {
  if (!__rvLayout) return false;
  const rv = Game.rvOverlayTarget;
  if (!rv) return false;
  for (const btn of __rvLayout.buttons) {
    if (mouseX < btn.x || mouseX > btn.x + btn.w) continue;
    if (mouseY < btn.y || mouseY > btn.y + btn.h) continue;
    if (!btn.enabled) return true;
    if (btn.action === 'claim')   tryClaimRvAsBase(rv);
    if (btn.action === 'unclaim') tryUnclaimRvBase(rv);
    return true;
  }
  const p = Game.player;
  if (!p || !p.inventory || !rv.inventory) return false;
  for (const sl of __rvLayout.slots) {
    if (mouseX < sl.x || mouseX > sl.x + sl.w) continue;
    if (mouseY < sl.y || mouseY > sl.y + sl.h) continue;
    const cur = rv.inventory.slots[sl.index];
    if (cur) {
      cur.count = addItem(p.inventory, cur.id, cur.count);
      if (cur.count <= 0) rv.inventory.slots[sl.index] = null;
    } else {
      for (let i = 0; i < p.inventory.slots.length; i++) {
        const s = p.inventory.slots[i];
        if (!s) continue;
        rv.inventory.slots[sl.index] = { id: s.id, count: s.count };
        p.inventory.slots[i] = null; break;
      }
    }
    if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx.click) Audio.sfx.click();
    return true;
  }
  return false;
}

// ---------- Workbench access ----------
// Crafting overlay can ask "is the player allowed to craft right now?". If
// they are next to a claimed RV with the workbench flag set, yes.
function playerNearRvWorkbench(player) {
  if (!player || !Game.vehicles) return false;
  const r2 = RV_INTERACT_RADIUS * RV_INTERACT_RADIUS;
  for (const v of Game.vehicles) {
    if (v.kind !== 'rv' || v.broken || !v.interiorWorkbench) continue;
    const dx = v.x - player.x, dy = v.y - player.y;
    if (dx * dx + dy * dy < r2) return true;
  }
  return false;
}

// ---------- Save / Load ----------
// vehicles.js persists the chassis + cargo. We only stash RV-only flags
// keyed by vehicle id; loadRv re-attaches them after loadVehicles runs.
function saveRv() {
  const list = Game.vehicles || [];
  return {
    rvWrecksSpawned: !!Game.rvWrecksSpawned,
    rvs: list.filter(v => v.kind === 'rv').map(v => ({
      id: v.id, baseId: v.baseId || null,
      interiorWorkbench: !!v.interiorWorkbench, interiorBed: !!v.interiorBed,
      parkedT: v.parkedT || 0,
    })),
  };
}

function loadRv(data) {
  initRv();
  if (!data) return;
  Game.rvWrecksSpawned = !!data.rvWrecksSpawned;
  if (!Array.isArray(data.rvs) || !Game.vehicles) return;
  for (const r of data.rvs) {
    const v = Game.vehicles.find(vv => vv.id === r.id && vv.kind === 'rv');
    if (!v) continue;
    v.baseId = r.baseId || null;
    v.interiorWorkbench = !!r.interiorWorkbench;
    v.interiorBed = !!r.interiorBed; v.parkedT = r.parkedT || 0;
  }
}
