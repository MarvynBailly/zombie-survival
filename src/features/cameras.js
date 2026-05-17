'use strict';

// ---------- Cameras & Monitors (C·04) ----------
// Player-placed CCTV. A camera inside a powered radius permanently reveals
// its chunk + 4 cardinal neighbors into Game.exploredChunks. Monitors bind
// to the nearest camera on placement and show a live zombie-count readout
// for the bound camera's reveal region. Both are destructible and persist.
// State: Game.cameras, Game.monitors, Game.monitorPanel (open monitor|null).
// Deps: power.js (isPowered), bases.js (nearestBase), world.js (CHUNK_SIZE).

const CAMERA_RANGE = 80 * TILE_SIZE;            // reveal-cone visual reach
const CAMERA_HP = 40;
const MONITOR_HP = 30;
const CAMERA_INTERACT_RADIUS = 50;
const MONITOR_INTERACT_RADIUS = 50;
const MONITOR_CAP = 4;
const CAMERA_PLACE_BASE_RADIUS = 80 * TILE_SIZE;
const CAMERA_REVEAL_TICK = 1.0;                 // seconds between reveal pulses

let __camIdSeq = 1, __monIdSeq = 1, __cameraTickAcc = 0;

function initCameras() {
  Game.cameras = []; Game.monitors = []; Game.monitorPanel = null;
  __camIdSeq = 1; __monIdSeq = 1; __cameraTickAcc = 0;
}

// ---------- Helpers ----------
// Reveal-into helper that works whether Game.exploredChunks is a Set or Array.
function __addExplored(key) {
  const ex = Game.exploredChunks;
  if (!ex) return;
  if (ex instanceof Set) ex.add(key);
  else if (Array.isArray(ex) && ex.indexOf(key) < 0) ex.push(key);
}

function __revealAroundCamera(cam) {
  const cx = Math.floor(cam.x / CHUNK_SIZE), cy = Math.floor(cam.y / CHUNK_SIZE);
  const offsets = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of offsets) {
    const k = (cx + dx) + ',' + (cy + dy);
    cam.revealedChunks.add(k); __addExplored(k);
  }
}

// World-space bbox spanning cam.revealedChunks. Drives zombie count + label.
function __cameraRevealBox(cam) {
  if (!cam || !cam.revealedChunks || cam.revealedChunks.size === 0) return null;
  let minCx = Infinity, minCy = Infinity, maxCx = -Infinity, maxCy = -Infinity;
  for (const k of cam.revealedChunks) {
    const p = k.split(',');
    const cx = parseInt(p[0], 10), cy = parseInt(p[1], 10);
    if (cx < minCx) minCx = cx; if (cy < minCy) minCy = cy;
    if (cx > maxCx) maxCx = cx; if (cy > maxCy) maxCy = cy;
  }
  return {
    x: minCx * CHUNK_SIZE, y: minCy * CHUNK_SIZE,
    w: (maxCx - minCx + 1) * CHUNK_SIZE,
    h: (maxCy - minCy + 1) * CHUNK_SIZE,
  };
}

function __zombieCountFor(cam) {
  const box = __cameraRevealBox(cam);
  const zs = Game.zombies;
  if (!box || !zs) return 0;
  const xR = box.x + box.w, yB = box.y + box.h;
  let n = 0;
  for (let i = 0; i < zs.length; i++) {
    const z = zs[i];
    if (z.x >= box.x && z.x < xR && z.y >= box.y && z.y < yB) n++;
  }
  return n;
}

function __nearestCameraTo(x, y) {
  const cs = Game.cameras;
  if (!cs || cs.length === 0) return null;
  let best = null, bestD = Infinity;
  for (const c of cs) {
    const dx = c.x - x, dy = c.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

// ---------- Placement ----------
// Bases-aware: if any base flag is claimed, cameras must live within 80 tiles
// of the nearest one. With no bases yet, allow free placement.
function placeCamera(x, y, player) {
  if (!Game.cameras) Game.cameras = [];
  if (Game.bases && Game.bases.length > 0 && typeof nearestBase === 'function') {
    const nb = nearestBase(x, y);
    if (nb && Math.hypot(nb.x - x, nb.y - y) > CAMERA_PLACE_BASE_RADIUS) {
      if (typeof setNotice === 'function') setNotice('Camera must be within 80 tiles of a base flag', 2);
      return null;
    }
  }
  if (typeof inObstacle === 'function' && inObstacle(x, y, 8)) {
    if (typeof setNotice === 'function') setNotice('Cannot place camera here', 1.5);
    return null;
  }
  const cam = {
    id: 'cam' + (__camIdSeq++), x, y,
    range: CAMERA_RANGE, hp: CAMERA_HP, maxHp: CAMERA_HP,
    revealedChunks: new Set(),
    angle: (player && typeof player.angle === 'number') ? player.angle : 0,
  };
  Game.cameras.push(cam);
  if (typeof isPowered === 'function' && isPowered(cam.x, cam.y)) __revealAroundCamera(cam);
  if (typeof setNotice === 'function') setNotice('Camera deployed', 1.5);
  if (Audio && Audio.sfx && Audio.sfx.pickup) Audio.sfx.pickup();
  return cam;
}

function placeMonitor(x, y, player) {
  if (!Game.monitors) Game.monitors = [];
  if (Game.monitors.length >= MONITOR_CAP) {
    if (typeof setNotice === 'function') setNotice(`Max ${MONITOR_CAP} monitors`, 2);
    return null;
  }
  if (typeof inObstacle === 'function' && inObstacle(x, y, 8)) {
    if (typeof setNotice === 'function') setNotice('Cannot place monitor here', 1.5);
    return null;
  }
  const cam = __nearestCameraTo(x, y);
  const mon = {
    id: 'mon' + (__monIdSeq++), x, y,
    hp: MONITOR_HP, maxHp: MONITOR_HP,
    cameraId: cam ? cam.id : null,
  };
  Game.monitors.push(mon);
  if (typeof setNotice === 'function') setNotice(cam ? `Monitor bound to ${cam.id}` : 'Monitor placed (no camera yet)', 2);
  if (Audio && Audio.sfx && Audio.sfx.pickup) Audio.sfx.pickup();
  return mon;
}

// ---------- Tick ----------
function updateCameras(dt) {
  __cameraTickAcc += dt;
  if (__cameraTickAcc < CAMERA_REVEAL_TICK) return;
  __cameraTickAcc = 0;
  const cs = Game.cameras;
  if (!cs || cs.length === 0) return;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (typeof isPowered === 'function' && isPowered(c.x, c.y)) __revealAroundCamera(c);
  }
}

// ---------- E-key targets ----------
function __findNear(list, player, R) {
  if (!list || list.length === 0 || !player) return null;
  let best = null, bestD = R * R;
  for (const o of list) {
    const dx = o.x - player.x, dy = o.y - player.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}
function findCameraNear(player, radius) {
  return __findNear(Game.cameras, player, radius || CAMERA_INTERACT_RADIUS);
}
function findMonitorNear(player, radius) {
  return __findNear(Game.monitors, player, radius || MONITOR_INTERACT_RADIUS);
}

// ---------- Overlay ----------
function openMonitorPanel(monitor) {
  if (!monitor) return;
  Game.monitorPanel = monitor;
  if (Audio && Audio.sfx && Audio.sfx.click) Audio.sfx.click();
}
function closeMonitorPanel() {
  if (!Game.monitorPanel) return;
  Game.monitorPanel = null;
  if (Audio && Audio.sfx && Audio.sfx.click) Audio.sfx.click();
}

// ---------- Damage ----------
function __burst(x, y, n, colA, colB) {
  for (let i = 0; i < n; i++) {
    Game.particles.push({
      x: x + rand(-6, 6), y: y + rand(-6, 6),
      vx: rand(-120, 120), vy: rand(-160, -20),
      life: rand(0.3, 0.7), color: i % 2 ? colA : colB, r: rand(2, 3),
    });
  }
}
function damageCamera(cam, dmg) {
  if (!cam || cam.hp <= 0) return;
  cam.hp -= dmg;
  if (cam.hp > 0) { if (Audio && Audio.sfx && Audio.sfx.hit) Audio.sfx.hit(); return; }
  cam.hp = 0;
  __burst(cam.x, cam.y, 10, '#3a3f4a', '#7a7e88');
  const idx = Game.cameras.indexOf(cam);
  if (idx >= 0) Game.cameras.splice(idx, 1);
  if (Game.monitors) for (const m of Game.monitors) if (m.cameraId === cam.id) m.cameraId = null;
  if (typeof setNotice === 'function') setNotice('Camera destroyed', 1.5);
  if (Audio && Audio.sfx && Audio.sfx.explosion) Audio.sfx.explosion();
}
function damageMonitor(mon, dmg) {
  if (!mon || mon.hp <= 0) return;
  mon.hp -= dmg;
  if (mon.hp > 0) { if (Audio && Audio.sfx && Audio.sfx.hit) Audio.sfx.hit(); return; }
  mon.hp = 0;
  __burst(mon.x, mon.y, 8, '#1a1c20', '#9bc6cf');
  const idx = Game.monitors.indexOf(mon);
  if (idx >= 0) Game.monitors.splice(idx, 1);
  if (Game.monitorPanel === mon) Game.monitorPanel = null;
  if (typeof setNotice === 'function') setNotice('Monitor destroyed', 1.5);
  if (Audio && Audio.sfx && Audio.sfx.explosion) Audio.sfx.explosion();
}

// ---------- World drawing ----------
function drawCameras(ctx, camX, camY) {
  const cs = Game.cameras;
  if (!cs || cs.length === 0) return;
  const vL = camX - 80, vR = camX + VIEW_W + 80;
  const vT = camY - 80, vB = camY + VIEW_H + 80;
  for (let i = 0; i < cs.length; i++) {
    const c = cs[i];
    if (c.x < vL || c.x > vR || c.y < vT || c.y > vB) continue;
    __drawOneCamera(ctx, c);
  }
}

function __drawOneCamera(ctx, c) {
  const powered = (typeof isPowered === 'function') && isPowered(c.x, c.y);
  const ang = c.angle || 0;
  if (powered) {
    const spread = 0.5;
    ctx.save();
    ctx.fillStyle = '#9bc6cf'; ctx.globalAlpha = 0.06;
    ctx.beginPath();
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + Math.cos(ang - spread) * c.range, c.y + Math.sin(ang - spread) * c.range);
    ctx.lineTo(c.x + Math.cos(ang + spread) * c.range, c.y + Math.sin(ang + spread) * c.range);
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  ctx.fillStyle = '#2a2d33'; ctx.fillRect(c.x - 6, c.y - 6, 12, 12);
  ctx.fillStyle = '#43464d'; ctx.fillRect(c.x - 5, c.y - 5, 10, 4);
  ctx.fillStyle = '#15171b'; ctx.fillRect(c.x - 6, c.y + 4, 12, 2);
  ctx.save();
  ctx.translate(c.x + Math.cos(ang) * 5, c.y + Math.sin(ang) * 5 - 3);
  ctx.rotate(ang);
  ctx.fillStyle = '#3a3f4a'; ctx.fillRect(-5, -3, 10, 6);
  ctx.fillStyle = '#0b0c0e'; ctx.fillRect(3, -2, 3, 4);
  if (powered) {
    ctx.fillStyle = '#d24b35'; ctx.fillRect(-3, -2, 2, 2);
    ctx.fillStyle = '#f4a89a'; ctx.fillRect(-3, -2, 1, 1);
  }
  ctx.restore();
  if (c.hp < c.maxHp) __drawHpBar(ctx, c.x - 8, c.y - 14, 16, c.hp / c.maxHp);
}

function drawMonitors(ctx, camX, camY) {
  const ms = Game.monitors;
  if (!ms || ms.length === 0) return;
  const vL = camX - 40, vR = camX + VIEW_W + 40;
  const vT = camY - 40, vB = camY + VIEW_H + 40;
  for (let i = 0; i < ms.length; i++) {
    const m = ms[i];
    if (m.x < vL || m.x > vR || m.y < vT || m.y > vB) continue;
    __drawOneMonitor(ctx, m);
  }
}

function __drawOneMonitor(ctx, m) {
  ctx.fillStyle = '#2a2d33'; ctx.fillRect(m.x - 6, m.y + 4, 12, 6);
  ctx.fillStyle = '#15171b'; ctx.fillRect(m.x - 6, m.y + 9, 12, 1);
  ctx.fillStyle = '#3a3f4a'; ctx.fillRect(m.x - 10, m.y - 8, 20, 16);
  const cam = m.cameraId ? Game.cameras.find(c => c.id === m.cameraId) : null;
  const live = !!(cam && typeof isPowered === 'function' && isPowered(cam.x, cam.y));
  ctx.fillStyle = live ? '#16221a' : '#0b0c0e';
  ctx.fillRect(m.x - 9, m.y - 7, 18, 14);
  if (live) {
    ctx.fillStyle = 'rgba(155,198,207,0.18)';
    for (let y = m.y - 7; y < m.y + 7; y += 3) ctx.fillRect(m.x - 9, y, 18, 1);
    ctx.fillStyle = '#8ec547'; ctx.fillRect(m.x + 7, m.y - 6, 1, 1);
  }
  if (m.hp < m.maxHp) __drawHpBar(ctx, m.x - 10, m.y - 13, 20, m.hp / m.maxHp);
}

function __drawHpBar(ctx, x, y, w, pct) {
  pct = Math.max(0, pct);
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(x, y, w, 3);
  ctx.fillStyle = pct > 0.5 ? '#7ad97a' : pct > 0.25 ? '#e3c054' : '#d24b35';
  ctx.fillRect(x, y, w * pct, 3);
}

// ---------- Monitor panel overlay (screen-space) ----------
function drawMonitorPanel(ctx, w, h, monitor) {
  if (!monitor) return;
  const cam = monitor.cameraId ? Game.cameras.find(c => c.id === monitor.cameraId) : null;
  const live = !!(cam && typeof isPowered === 'function' && isPowered(cam.x, cam.y));
  const pw = 360, ph = 220, px = (w - pw) / 2, py = (h - ph) / 2;
  ctx.fillStyle = 'rgba(7,8,10,0.55)'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#0b0c0e'; ctx.fillRect(px, py, pw, ph);
  ctx.strokeStyle = '#43464d'; ctx.lineWidth = 1;
  ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
  ctx.fillStyle = 'rgba(11,12,14,0.92)'; ctx.fillRect(px, py, pw, 28);
  ctx.textAlign = 'left'; ctx.fillStyle = '#d24b35';
  ctx.font = 'bold 10px "JetBrains Mono", monospace';
  ctx.fillText('// CCTV FEED', px + 12, py + 13);
  ctx.fillStyle = '#e8e6df';
  ctx.font = 'bold 13px "JetBrains Mono", monospace';
  ctx.fillText('MONITOR · ' + monitor.id.toUpperCase(), px + 12, py + 24);
  ctx.fillStyle = '#7a7e88'; ctx.textAlign = 'right';
  ctx.font = '9px "JetBrains Mono", monospace';
  ctx.fillText('[E] OR [ESC] · CLOSE', px + pw - 12, py + 19);
  ctx.textAlign = 'left';
  const fx = px + 16, fy = py + 40, fw = pw - 32, fh = ph - 56;
  ctx.fillStyle = live ? '#16221a' : '#0b0c0e'; ctx.fillRect(fx, fy, fw, fh);
  if (live) {
    ctx.fillStyle = 'rgba(155,198,207,0.10)';
    for (let y = fy; y < fy + fh; y += 4) ctx.fillRect(fx, y, fw, 1);
  }
  ctx.strokeStyle = '#2a2d33';
  ctx.strokeRect(fx + 0.5, fy + 0.5, fw - 1, fh - 1);
  ctx.font = 'bold 11px "JetBrains Mono", monospace';
  if (!cam) {
    ctx.fillStyle = '#d24b35'; ctx.fillText('NO CAMERA BOUND', fx + 12, fy + 24);
    ctx.fillStyle = '#7a7e88'; ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('Place a camera, then this monitor', fx + 12, fy + 40);
    ctx.fillText('will auto-bind on next placement.', fx + 12, fy + 54);
    return;
  }
  if (!live) {
    ctx.fillStyle = '#e3c054'; ctx.fillText('SIGNAL LOST · NO POWER', fx + 12, fy + 24);
    ctx.fillStyle = '#7a7e88'; ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText('Fuel the nearest generator', fx + 12, fy + 40);
    ctx.fillText('to restore the feed.', fx + 12, fy + 54);
    return;
  }
  const count = __zombieCountFor(cam);
  const box = __cameraRevealBox(cam);
  ctx.fillStyle = '#8ec547';
  ctx.fillText('FEED LIVE · ' + cam.id.toUpperCase(), fx + 12, fy + 24);
  ctx.fillStyle = '#e8e6df';
  ctx.font = 'bold 28px "JetBrains Mono", monospace';
  ctx.fillText(count + ' Z', fx + 12, fy + 70);
  ctx.fillStyle = '#7a7e88'; ctx.font = '10px "JetBrains Mono", monospace';
  ctx.fillText('zombies inside reveal region', fx + 12, fy + 90);
  if (box) ctx.fillText('sector ' + Math.floor(box.x / CHUNK_SIZE) + ',' + Math.floor(box.y / CHUNK_SIZE), fx + 12, fy + 104);
  const tier = count >= 12 ? 'HORDE' : count >= 5 ? 'PACK' : count > 0 ? 'STRAGGLERS' : 'CLEAR';
  const tierCol = count >= 12 ? '#d24b35' : count >= 5 ? '#e3c054' : count > 0 ? '#9bc6cf' : '#8ec547';
  ctx.fillStyle = tierCol; ctx.font = 'bold 11px "JetBrains Mono", monospace';
  ctx.fillText(tier, fx + 12, fy + fh - 12);
}

// ---------- Save / load ----------
function saveCameras() {
  return {
    cameras: (Game.cameras || []).map(c => ({
      id: c.id, x: c.x, y: c.y, hp: c.hp, maxHp: c.maxHp,
      range: c.range, angle: c.angle || 0,
      revealedChunks: Array.from(c.revealedChunks || []),
    })),
    monitors: (Game.monitors || []).map(m => ({
      id: m.id, x: m.x, y: m.y, hp: m.hp, maxHp: m.maxHp,
      cameraId: m.cameraId,
    })),
  };
}

function loadCameras(data) {
  initCameras();
  if (!data) return;
  for (const d of (Array.isArray(data.cameras) ? data.cameras : [])) {
    if (!d || typeof d.x !== 'number' || typeof d.y !== 'number') continue;
    const cam = {
      id: d.id || ('cam' + (__camIdSeq++)),
      x: d.x, y: d.y,
      range: typeof d.range === 'number' ? d.range : CAMERA_RANGE,
      hp: typeof d.hp === 'number' ? d.hp : CAMERA_HP,
      maxHp: typeof d.maxHp === 'number' ? d.maxHp : CAMERA_HP,
      angle: typeof d.angle === 'number' ? d.angle : 0,
      revealedChunks: new Set(Array.isArray(d.revealedChunks) ? d.revealedChunks : []),
    };
    Game.cameras.push(cam);
    for (const k of cam.revealedChunks) __addExplored(k);
    const n = parseInt(String(cam.id).replace(/[^0-9]/g, ''), 10);
    if (!isNaN(n) && n >= __camIdSeq) __camIdSeq = n + 1;
  }
  for (const d of (Array.isArray(data.monitors) ? data.monitors : [])) {
    if (!d || typeof d.x !== 'number' || typeof d.y !== 'number') continue;
    Game.monitors.push({
      id: d.id || ('mon' + (__monIdSeq++)),
      x: d.x, y: d.y,
      hp: typeof d.hp === 'number' ? d.hp : MONITOR_HP,
      maxHp: typeof d.maxHp === 'number' ? d.maxHp : MONITOR_HP,
      cameraId: d.cameraId || null,
    });
    const n = parseInt(String(d.id || '').replace(/[^0-9]/g, ''), 10);
    if (!isNaN(n) && n >= __monIdSeq) __monIdSeq = n + 1;
  }
}
