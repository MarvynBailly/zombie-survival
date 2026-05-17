'use strict';

// Cork Board (E·04) — wall prop with 12 pin slots. Pin journals,
// screenshots, hand-drawn maps, or trophy thumbnails. Per-run pins save
// with the main blob; the most-pinned board's slots also mirror into a
// meta key (`zombie-survival:corkboard`) so a fresh run shows the
// keepsake layout. Deps: lore.js, items.js, ui/persistence globals.

const CORKBOARD_META_KEY = 'zombie-survival:corkboard';
const CORKBOARD_PIN_SLOTS = 12;        // 4 cols × 3 rows
const CORKBOARD_W = 64;
const CORKBOARD_H = 48;
const CORKBOARD_INTERACT_R = 60;
const CORKBOARD_MAX_HP = 20;
const CB_COLS = 4, CB_ROWS = 3;

function initCorkBoards() {
  Game.corkBoards = [];
  Game.corkBoardOpen = null;
  Game.corkBoardFocusSlot = null;
  Game.corkBoardPicker = null;
}
function updateCorkBoards(_dt) { /* reserved */ }

function placeCorkBoard(x, y, _player) {
  if (!Game.corkBoards) initCorkBoards();
  const board = {
    id: 'cb_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    x: x | 0, y: y | 0,
    hp: CORKBOARD_MAX_HP, maxHp: CORKBOARD_MAX_HP,
    pins: new Array(CORKBOARD_PIN_SLOTS).fill(null),
  };
  // First board this run inherits the meta keepsake pins (validated).
  if (Game.corkBoards.length === 0) {
    const meta = loadCorkBoardMeta();
    if (meta && Array.isArray(meta.pins)) {
      for (let i = 0; i < CORKBOARD_PIN_SLOTS && i < meta.pins.length; i++) {
        const p = meta.pins[i];
        if (p && resolvePin(p)) board.pins[i] = { ...p };
      }
    }
  }
  Game.corkBoards.push(board);
  if (typeof setNotice === 'function') setNotice('Cork board placed', 1.2);
  if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx.click) Audio.sfx.click();
  return board;
}

function findCorkBoardNear(player, radius) {
  if (!Game.corkBoards || Game.corkBoards.length === 0) return null;
  const r = radius || CORKBOARD_INTERACT_R;
  let best = null, bestD = r * r;
  for (const c of Game.corkBoards) {
    const dx = c.x + CORKBOARD_W / 2 - player.x, dy = c.y + CORKBOARD_H / 2 - player.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function damageCorkBoard(c, dmg) {
  if (!c) return;
  c.hp -= dmg;
  if (c.hp > 0) return;
  if (Game.corkBoardOpen === c) closeCorkBoardOverlay();
  const i = Game.corkBoards.indexOf(c);
  if (i >= 0) Game.corkBoards.splice(i, 1);
  for (let k = 0; k < 14; k++) Game.particles.push({
    x: c.x + rand(0, CORKBOARD_W), y: c.y + rand(0, CORKBOARD_H),
    vx: rand(-140, 140), vy: rand(-180, -20),
    life: rand(0.4, 0.8), color: k % 2 ? '#d8c89a' : '#8a5a2a', r: rand(1, 3),
  });
  if (typeof setNotice === 'function') setNotice('Cork board destroyed', 1.5);
}

function drawCorkBoards(ctx, camX, camY) {
  if (!Game.corkBoards || Game.corkBoards.length === 0) return;
  for (const c of Game.corkBoards) {
    const sx = c.x - camX, sy = c.y - camY;
    if (sx + CORKBOARD_W < 0 || sx > VIEW_W || sy + CORKBOARD_H < 0 || sy > VIEW_H) continue;
    ctx.fillStyle = '#3a2a18'; ctx.fillRect(sx, sy, CORKBOARD_W, CORKBOARD_H);
    ctx.fillStyle = '#6a4a2a'; ctx.fillRect(sx + 1, sy + 1, CORKBOARD_W - 2, CORKBOARD_H - 2);
    ctx.fillStyle = '#b89466'; ctx.fillRect(sx + 4, sy + 4, CORKBOARD_W - 8, CORKBOARD_H - 8);
    const seed = (c.id.charCodeAt(c.id.length - 2) | 0) + (c.id.charCodeAt(c.id.length - 1) | 0);
    for (let pass = 0; pass < 2; pass++) {                                  // cork-dot texture (seeded)
      ctx.fillStyle = pass ? '#cda378' : '#8e6b3e';
      const n = pass ? 14 : 28, mA = pass ? 41 : 37, mB = pass ? 31 : 53, mC = pass ? 5 : 3;
      for (let i = 0; i < n; i++) ctx.fillRect(
        sx + ((i * mA + seed * (pass ? mC : 1)) % (CORKBOARD_W - 12)) + 6,
        sy + ((i * mB + seed * (pass ? 7 : mC)) % (CORKBOARD_H - 12)) + 6, 1, 1);
    }
    ctx.strokeStyle = '#2a1a0e'; ctx.lineWidth = 1;
    ctx.strokeRect(sx + 0.5, sy + 0.5, CORKBOARD_W - 1, CORKBOARD_H - 1);
    const pinned = c.pins.filter(p => p).length;
    if (pinned > 0) {
      ctx.fillStyle = '#d24b35'; ctx.fillRect(sx + CORKBOARD_W - 10, sy + 2, 8, 8);
      ctx.fillStyle = '#ece7d7'; ctx.font = 'bold 7px monospace';
      ctx.fillText(String(pinned), sx + CORKBOARD_W - 8, sy + 9);
    }
    if (c.hp < c.maxHp) {
      ctx.fillStyle = '#1a1612'; ctx.fillRect(sx, sy + CORKBOARD_H + 2, CORKBOARD_W, 3);
      ctx.fillStyle = '#d24b35'; ctx.fillRect(sx, sy + CORKBOARD_H + 2, CORKBOARD_W * (c.hp / c.maxHp), 3);
    }
  }
}

function openCorkBoardOverlay(board) {
  if (!board) return;
  Game.corkBoardOpen = board;
  Game.corkBoardFocusSlot = null;
  Game.corkBoardPicker = null;
  Game.mapOpen = true;
  if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx.click) Audio.sfx.click();
}
function closeCorkBoardOverlay() {
  Game.corkBoardOpen = null;
  Game.corkBoardFocusSlot = null;
  Game.corkBoardPicker = null;
  if (Game.mode === 'playing') Game.mapOpen = false;
  if (Game.player) Game.player.openCd = 0.4;
}
function isCorkBoardOpen() { return !!Game.corkBoardOpen; }

function pinItem(board, slot, kind, refId) {
  if (!board || slot < 0 || slot >= CORKBOARD_PIN_SLOTS) return false;
  if (board.pins[slot]) return false;
  const day = (Game.time && Game.time.day) || 1;
  board.pins[slot] = { kind, refId, pinnedDay: day };
  if (kind === 'journal') {
    const it = ITEMS[refId];
    if (it && it.journalTemplateId && typeof markJournalRead === 'function') {
      markJournalRead(it.journalTemplateId);
    }
  }
  saveCorkBoardMeta();
  if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx.pickup) Audio.sfx.pickup();
  return true;
}
function unpinItem(board, slot) {
  if (!board || slot < 0 || slot >= CORKBOARD_PIN_SLOTS) return false;
  if (!board.pins[slot]) return false;
  board.pins[slot] = null;
  saveCorkBoardMeta();
  if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx.click) Audio.sfx.click();
  return true;
}

// Resolve a pin descriptor to its rendered payload, or null if the
// reference is stale (item dropped / screenshot evicted / map gone).
function resolvePin(pin) {
  if (!pin) return null;
  const lore = Game.lore || {};
  const meta = (typeof loreMeta === 'function') ? loreMeta() : null;
  if (pin.kind === 'journal') {
    const it = ITEMS[pin.refId];
    return (it && it.isJournal) ? { kind: 'journal', item: it } : null;
  }
  if (pin.kind === 'screenshot') {
    const shot = (lore.screenshots || []).find(s => s.id === pin.refId)
      || (meta && (meta.screenshotsKept || []).find(s => s.id === pin.refId));
    return shot ? { kind: 'screenshot', shot } : null;
  }
  if (pin.kind === 'map') {
    const map = (lore.mapDrawings || []).find(m => m.id === pin.refId)
      || (meta && (meta.mapsDrawn || []).find(m => m.id === pin.refId));
    return map ? { kind: 'map', map } : null;
  }
  if (pin.kind === 'trophy_thumb') return { kind: 'trophy_thumb', refId: pin.refId };
  return null;
}

// Pin-picker source: run-local items first (journals in inventory, this
// run's screenshots + maps), then meta keepsakes that didn't already surface.
function listEligiblePins() {
  const out = [];
  const inv = Game.player && Game.player.inventory;
  if (inv) for (const s of inv.slots) if (s && ITEMS[s.id] && ITEMS[s.id].isJournal) {
    out.push({ kind: 'journal', refId: s.id, label: ITEMS[s.id].name || 'Journal' });
  }
  const lore = Game.lore || {};
  for (const shot of (lore.screenshots || [])) out.push({ kind: 'screenshot', refId: shot.id, label: shot.label || `Day ${shot.day}` });
  for (const map of (lore.mapDrawings || [])) out.push({ kind: 'map', refId: map.id,
    label: `Map · Day ${map.day} (${(map.exploredChunkIds || []).length} tiles)` });
  const meta = (typeof loreMeta === 'function') ? loreMeta() : null;
  if (meta) {
    const seen = new Set(out.map(o => o.refId));
    for (const shot of (meta.screenshotsKept || [])) if (!seen.has(shot.id))
      out.push({ kind: 'screenshot', refId: shot.id, label: '◇ ' + (shot.label || `Day ${shot.day}`) });
    for (const map of (meta.mapsDrawn || [])) if (!seen.has(map.id))
      out.push({ kind: 'map', refId: map.id, label: '◇ Map · Day ' + map.day });
  }
  return out;
}

// All overlay UI is drawn directly to the main canvas (no DOM panel) and
// hit-tested via _cbHits, populated each draw and read by the click router.
let _cbHits = [];

function drawCorkBoardOverlay(ctx, w, h, board) {
  if (!board) return;
  _cbHits = [];
  ctx.fillStyle = 'rgba(7,8,10,0.78)'; ctx.fillRect(0, 0, w, h);
  const panelW = Math.min(820, w - 80), panelH = Math.min(620, h - 80);
  const px = (w - panelW) / 2, py = (h - panelH) / 2;
  ctx.fillStyle = '#181c22'; ctx.fillRect(px, py, panelW, panelH);
  ctx.strokeStyle = '#3a2a18'; ctx.lineWidth = 2;
  ctx.strokeRect(px + 0.5, py + 0.5, panelW - 1, panelH - 1);
  const innerX = px + 24, innerY = py + 70;
  const innerW = panelW - 48, innerH = panelH - 110;
  ctx.fillStyle = '#b89466'; ctx.fillRect(innerX, innerY, innerW, innerH);
  ctx.fillStyle = '#8e6b3e';
  for (let i = 0; i < 280; i++) {
    ctx.fillRect(innerX + (i * 37) % (innerW - 4) + 2,
                 innerY + (i * 71) % (innerH - 4) + 2, 1, 1);
  }
  ctx.fillStyle = '#ece7d7'; ctx.font = 'bold 18px monospace';
  ctx.fillText('CORK BOARD', px + 24, py + 32);
  ctx.fillStyle = '#7a7e88'; ctx.font = '10px monospace';
  const pinned = board.pins.filter(p => p).length;
  ctx.fillText(`${pinned}/${CORKBOARD_PIN_SLOTS} PINNED · LEFT-CLICK SLOT · RIGHT-CLICK UNPIN`,
    px + 24, py + 50);
  const gpx = 20, gpy = 18, gap = 12;
  const cellW = (innerW - gpx * 2 - gap * (CB_COLS - 1)) / CB_COLS;
  const cellH = (innerH - gpy * 2 - gap * (CB_ROWS - 1)) / CB_ROWS;
  for (let i = 0; i < CORKBOARD_PIN_SLOTS; i++) {
    const col = i % CB_COLS, row = (i / CB_COLS) | 0;
    const x = innerX + gpx + col * (cellW + gap);
    const y = innerY + gpy + row * (cellH + gap);
    drawSlot(ctx, x, y, cellW, cellH, board.pins[i], i);
    _cbHits.push({ kind: 'slot', slot: i, x, y, w: cellW, h: cellH });
  }
  const bw = 80, bh = 26, bx = px + panelW - bw - 24, by = py + panelH - bh - 18;
  ctx.fillStyle = '#2a2e36'; ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = '#5a5e66'; ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
  ctx.fillStyle = '#ece7d7'; ctx.font = 'bold 11px monospace';
  ctx.fillText('CLOSE [E]', bx + 10, by + 17);
  _cbHits.push({ kind: 'close', x: bx, y: by, w: bw, h: bh });
  if (Game.corkBoardFocusSlot != null) drawFocused(ctx, w, h, board.pins[Game.corkBoardFocusSlot]);
  if (Game.corkBoardPicker) drawPicker(ctx, w, h, Game.corkBoardPicker);
}

function drawSlot(ctx, x, y, w, h, pin, idx) {
  if (!pin) {
    ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(x, y, w, h);
    ctx.save(); ctx.setLineDash([4, 3]); ctx.strokeStyle = '#7a5a36'; ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); ctx.restore();
    ctx.fillStyle = '#7a5a36'; ctx.font = 'bold 22px monospace';
    ctx.fillText('+', x + w / 2 - 6, y + h / 2 + 8);
    ctx.font = '9px monospace'; ctx.fillText('slot ' + (idx + 1), x + 6, y + h - 6);
    return;
  }
  const d = resolvePin(pin);
  if (!d) {
    ctx.fillStyle = '#3a2a18'; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#d24b35'; ctx.font = '10px monospace';
    ctx.fillText('missing', x + 8, y + h / 2);
  } else if (d.kind === 'journal') drawJournalThumb(ctx, x, y, w, h, d.item);
  else if (d.kind === 'screenshot') drawShotThumb(ctx, x, y, w, h, d.shot);
  else if (d.kind === 'map') drawMapThumb(ctx, x, y, w, h, d.map);
  else if (d.kind === 'trophy_thumb') drawTrophyThumb(ctx, x, y, w, h, d.refId);
  drawPin(ctx, x + w / 2, y + 6);
}

function drawPin(ctx, cx, cy) {
  ctx.fillStyle = '#2a1a0e';
  ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#d24b35';
  ctx.beginPath(); ctx.arc(cx - 1, cy - 1, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ece7d7'; ctx.fillRect(cx - 2, cy - 2, 1, 1);
}

function drawJournalThumb(ctx, x, y, w, h, item) {
  const px = 6, py = 12, pw = w - 12, ph = h - 18;
  ctx.fillStyle = '#d8c89a'; ctx.fillRect(x + px, y + py, pw, ph);
  ctx.fillStyle = '#b8a87a';
  ctx.beginPath();
  ctx.moveTo(x + px + pw, y + py); ctx.lineTo(x + px + pw - 12, y + py);
  ctx.lineTo(x + px + pw, y + py + 12); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#5a4a2a';
  for (let i = 0; i < 3; i++) ctx.fillRect(x + px + 6, y + py + 12 + i * 8, pw - 12, 1);
  ctx.fillStyle = '#ece7d7'; ctx.font = '8px monospace';
  ctx.fillText((item.text || '').split(/[.\n]/)[0].slice(0, 28), x + 4, y + h - 4);
}

// Memoized Image() per screenshot id. dataUrl decode is async; while it
// loads we paint a placeholder. Cache survives across overlay open/close.
const _shotImgCache = {};
function getShotImage(shot) {
  if (!shot || !shot.dataUrl) return null;
  const e = _shotImgCache[shot.id];
  if (e) return e;
  const rec = { img: new Image(), loaded: false };
  rec.img.onload = () => { rec.loaded = true; };
  rec.img.src = shot.dataUrl;
  _shotImgCache[shot.id] = rec;
  return rec;
}

function drawShotThumb(ctx, x, y, w, h, shot) {
  const px = 6, py = 12, pw = w - 12, ph = h - 30;
  ctx.fillStyle = '#1a1612'; ctx.fillRect(x + px - 1, y + py - 1, pw + 2, ph + 2);
  const rec = getShotImage(shot);
  if (rec && rec.loaded) { try { ctx.drawImage(rec.img, x + px, y + py, pw, ph); } catch {} }
  else {
    ctx.fillStyle = '#3a3f4a'; ctx.fillRect(x + px, y + py, pw, ph);
    ctx.fillStyle = '#7a7e88'; ctx.font = '8px monospace';
    ctx.fillText('loading…', x + px + 4, y + py + ph / 2);
  }
  ctx.fillStyle = '#ece7d7'; ctx.font = '8px monospace';
  ctx.fillText((shot.label || '').slice(0, 28), x + 4, y + h - 6);
  ctx.fillStyle = shot.kind === 'death' ? '#d24b35' : shot.kind === 'boss-kill' ? '#e3a83a' : '#5fb6e8';
  ctx.fillRect(x + px, y + py, 4, 4);
}

function drawMapThumb(ctx, x, y, w, h, map) {
  const px = 6, py = 12, pw = w - 12, ph = h - 18;
  ctx.fillStyle = '#1a1612'; ctx.fillRect(x + px, y + py, pw, ph);
  const cells = [];
  let minCx = Infinity, minCy = Infinity, maxCx = -Infinity, maxCy = -Infinity;
  for (const k of (map.exploredChunkIds || [])) {
    const [a, b] = String(k).split(',');
    const cx = parseInt(a, 10), cy = parseInt(b, 10);
    if (!Number.isFinite(cx) || !Number.isFinite(cy)) continue;
    cells.push([cx, cy]);
    if (cx < minCx) minCx = cx; if (cy < minCy) minCy = cy;
    if (cx > maxCx) maxCx = cx; if (cy > maxCy) maxCy = cy;
  }
  const hasChunk = typeof CHUNK_SIZE !== 'undefined';
  if (cells.length > 0) {
    const sx = Math.max(1, maxCx - minCx + 1), sy = Math.max(1, maxCy - minCy + 1);
    const cell = Math.max(2, Math.floor(Math.min(pw / sx, ph / sy)));
    const ox = x + px + ((pw - cell * sx) / 2 | 0);
    const oy = y + py + ((ph - cell * sy) / 2 | 0);
    const plot = (col, row, color) => {
      ctx.fillStyle = color;
      ctx.fillRect(ox + col * cell, oy + row * cell, cell - 1, cell - 1);
    };
    for (const [cx, cy] of cells) plot(cx - minCx, cy - minCy, '#5fb6e8');
    if (hasChunk && Array.isArray(map.baseFlags)) {
      for (const b of map.baseFlags) plot((b.x / CHUNK_SIZE | 0) - minCx, (b.y / CHUNK_SIZE | 0) - minCy, '#e3a83a');
    }
    if (hasChunk && map.playerEndPos) {
      const xx = ox + ((map.playerEndPos.x / CHUNK_SIZE | 0) - minCx) * cell;
      const yy = oy + ((map.playerEndPos.y / CHUNK_SIZE | 0) - minCy) * cell;
      ctx.strokeStyle = '#d24b35'; ctx.lineWidth = 1.5; ctx.beginPath();
      ctx.moveTo(xx, yy); ctx.lineTo(xx + cell, yy + cell);
      ctx.moveTo(xx + cell, yy); ctx.lineTo(xx, yy + cell);
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#ece7d7'; ctx.font = '8px monospace';
  ctx.fillText('Day ' + (map.day | 0), x + 4, y + h - 4);
}

function drawTrophyThumb(ctx, x, y, w, h, refId) {
  const cx = x + w / 2, cy = y + h / 2;
  ctx.fillStyle = '#caa760'; ctx.fillRect(cx - 10, cy - 12, 20, 14);
  ctx.fillStyle = '#e3c054'; ctx.fillRect(cx - 8, cy - 11, 16, 8);
  ctx.fillStyle = '#5a3a1a'; ctx.fillRect(cx - 4, cy + 2, 8, 4); ctx.fillRect(cx - 10, cy + 6, 20, 3);
  ctx.fillStyle = '#ece7d7'; ctx.font = '8px monospace';
  ctx.fillText(String(refId).slice(0, 16), x + 4, y + h - 4);
}

function drawFocused(ctx, w, h, pin) {
  ctx.fillStyle = 'rgba(7,8,10,0.7)'; ctx.fillRect(0, 0, w, h);
  if (!pin) { Game.corkBoardFocusSlot = null; return; }
  const d = resolvePin(pin);
  if (!d) { Game.corkBoardFocusSlot = null; return; }
  const fw = Math.min(640, w - 100), fh = Math.min(480, h - 100);
  const fx = (w - fw) / 2, fy = (h - fh) / 2;
  ctx.fillStyle = '#181c22'; ctx.fillRect(fx, fy, fw, fh);
  ctx.strokeStyle = '#caa760'; ctx.lineWidth = 2;
  ctx.strokeRect(fx + 0.5, fy + 0.5, fw - 1, fh - 1);
  const setText = (color, font) => { ctx.fillStyle = color; ctx.font = font; };
  if (d.kind === 'journal') {
    const it = d.item;
    setText('#ece7d7', 'bold 18px monospace'); ctx.fillText(it.name || 'Journal', fx + 24, fy + 36);
    setText('#7a7e88', '10px monospace'); ctx.fillText('Day ' + (it.foundDay | 0), fx + 24, fy + 54);
    setText('#d8c89a', '14px monospace');
    let line = '', yy = fy + 86;
    for (const w0 of (it.text || '').split(/\s+/)) {
      const test = line ? line + ' ' + w0 : w0;
      if (ctx.measureText(test).width > fw - 48) {
        ctx.fillText(line, fx + 24, yy); line = w0; yy += 20;
        if (yy > fy + fh - 40) { line += '…'; break; }
      } else line = test;
    }
    if (line) ctx.fillText(line, fx + 24, yy);
  } else if (d.kind === 'screenshot') {
    const rec = getShotImage(d.shot);
    if (rec && rec.loaded) { try { ctx.drawImage(rec.img, fx + 24, fy + 50, fw - 48, fh - 90); } catch {} }
    else { ctx.fillStyle = '#3a3f4a'; ctx.fillRect(fx + 24, fy + 50, fw - 48, fh - 90); }
    setText('#ece7d7', 'bold 13px monospace'); ctx.fillText(d.shot.label || 'Screenshot', fx + 24, fy + 36);
    setText('#7a7e88', '10px monospace'); ctx.fillText(new Date(d.shot.t || 0).toLocaleString(), fx + 24, fy + fh - 14);
  } else if (d.kind === 'map') {
    drawMapThumb(ctx, fx + 24, fy + 30, fw - 48, fh - 60, d.map);
    setText('#ece7d7', 'bold 16px monospace');
    ctx.fillText('Hand-drawn map · Day ' + (d.map.day | 0), fx + 24, fy + 24);
  } else if (d.kind === 'trophy_thumb') {
    drawTrophyThumb(ctx, fx + 24, fy + 30, fw - 48, fh - 60, d.refId);
  }
  setText('#7a7e88', '10px monospace');
  ctx.fillText('click anywhere to return', fx + 24, fy + fh - 28);
  _cbHits.push({ kind: 'focus-close', x: 0, y: 0, w, h });
}

function drawPicker(ctx, w, h, picker) {
  ctx.fillStyle = 'rgba(7,8,10,0.78)'; ctx.fillRect(0, 0, w, h);
  const fw = Math.min(560, w - 100), fh = Math.min(420, h - 80);
  const fx = (w - fw) / 2, fy = (h - fh) / 2;
  ctx.fillStyle = '#181c22'; ctx.fillRect(fx, fy, fw, fh);
  ctx.strokeStyle = '#5fb6e8'; ctx.lineWidth = 2;
  ctx.strokeRect(fx + 0.5, fy + 0.5, fw - 1, fh - 1);
  ctx.fillStyle = '#ece7d7'; ctx.font = 'bold 16px monospace';
  ctx.fillText('PIN TO SLOT ' + (picker.slot + 1), fx + 20, fy + 30);
  ctx.fillStyle = '#7a7e88'; ctx.font = '10px monospace';
  ctx.fillText('click an entry to pin · click outside to cancel', fx + 20, fy + 48);
  const items = listEligiblePins();
  const rowH = 26, listY = fy + 60, max = Math.floor((fh - 90) / rowH);
  for (let i = 0; i < items.length && i < max; i++) {
    const it = items[i], ry = listY + i * rowH;
    ctx.fillStyle = i % 2 ? '#22262e' : '#1c2026';
    ctx.fillRect(fx + 12, ry, fw - 24, rowH - 2);
    ctx.fillStyle = it.kind === 'journal' ? '#d8c89a'
      : it.kind === 'screenshot' ? '#5fb6e8'
      : it.kind === 'map' ? '#8ec547' : '#caa760';
    ctx.fillRect(fx + 18, ry + 6, 10, 10);
    ctx.fillStyle = '#ece7d7'; ctx.font = '11px monospace';
    ctx.fillText(it.kind.toUpperCase(), fx + 34, ry + 16);
    ctx.fillStyle = '#cbd0d8';
    ctx.fillText((it.label || '').slice(0, 48), fx + 130, ry + 16);
    _cbHits.push({ kind: 'pick', slot: picker.slot, item: it, x: fx + 12, y: ry, w: fw - 24, h: rowH - 2 });
  }
  if (items.length === 0) {
    ctx.fillStyle = '#7a7e88'; ctx.font = '12px monospace';
    ctx.fillText('Nothing to pin yet. Collect a journal, take a screenshot,', fx + 20, fy + 100);
    ctx.fillText('or use a sketchpad — they will show up here.', fx + 20, fy + 120);
  }
  _cbHits.push({ kind: 'cancel-outer', panelX: fx, panelY: fy, panelW: fw, panelH: fh });
}

function handleCorkBoardClick(mx, my) {
  if (!Game.corkBoardOpen) return false;
  if (Game.corkBoardFocusSlot != null) { Game.corkBoardFocusSlot = null; return true; }
  if (Game.corkBoardPicker) {
    for (const h of _cbHits) if (h.kind === 'pick' && inRect(mx, my, h)) {
      pinItem(Game.corkBoardOpen, h.slot, h.item.kind, h.item.refId);
      Game.corkBoardPicker = null; return true;
    }
    for (const h of _cbHits) if (h.kind === 'cancel-outer'
      && !(mx >= h.panelX && mx <= h.panelX + h.panelW
        && my >= h.panelY && my <= h.panelY + h.panelH)) {
      Game.corkBoardPicker = null; return true;
    }
    return true;
  }
  for (const h of _cbHits) {
    if (h.kind === 'close' && inRect(mx, my, h)) { closeCorkBoardOverlay(); return true; }
    if (h.kind === 'slot' && inRect(mx, my, h)) {
      const board = Game.corkBoardOpen;
      if (board.pins[h.slot]) Game.corkBoardFocusSlot = h.slot;
      else Game.corkBoardPicker = { slot: h.slot };
      return true;
    }
  }
  return true; // swallow clicks while overlay is up
}
function handleCorkBoardRightClick(mx, my) {
  if (!Game.corkBoardOpen) return false;
  if (Game.corkBoardFocusSlot != null || Game.corkBoardPicker) return true;
  for (const h of _cbHits) if (h.kind === 'slot' && inRect(mx, my, h)) {
    unpinItem(Game.corkBoardOpen, h.slot); return true;
  }
  return true;
}
function inRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }

// Item + recipe auto-register. CORKBOARD_KIT_RECIPE is exposed as a global
// so the integration spec can splice it into CRAFT_RECIPES without retyping.
ITEMS.corkboard_kit = {
  id: 'corkboard_kit', name: 'Cork Board Kit', category: 'tool',
  stackMax: 4, tint: '#b89466',
  desc: 'Place on a wall — pin journals, screenshots, and hand-drawn maps.',
  use(p) {
    const x = p.x + Math.cos(p.angle) * 30 - CORKBOARD_W / 2;
    const y = p.y + Math.sin(p.angle) * 30 - CORKBOARD_H / 2;
    placeCorkBoard(x, y, p);
    return true; // consume one
  },
};
const CORKBOARD_KIT_RECIPE = {
  id: 'corkboard_kit',
  label: 'Cork Board Kit',
  desc: 'Wall prop with 12 pin slots for journals, screenshots, and maps.',
  cost: (typeof ITEMS !== 'undefined' && ITEMS.wood)
    ? [{ id: 'scrap', n: 6 }, { id: 'wood', n: 2 }]
    : [{ id: 'scrap', n: 8 }],
  apply(p) {
    const left = addItem(p.inventory, 'corkboard_kit', 1);
    if (left === 0) setNotice('+1 cork board kit', 1.2);
    else setNotice('Inventory full — kit lost', 1.5);
  },
};

function saveCorkBoards() {
  if (!Game.corkBoards) return [];
  return Game.corkBoards.map(c => ({
    id: c.id, x: c.x | 0, y: c.y | 0, hp: c.hp | 0, maxHp: c.maxHp | 0,
    pins: c.pins.map(p => p ? { kind: p.kind, refId: p.refId, pinnedDay: p.pinnedDay | 0 } : null),
  }));
}
function loadCorkBoards(data) {
  Game.corkBoards = [];
  if (!Array.isArray(data)) return;
  for (const d of data) {
    if (!d) continue;
    const pins = Array.isArray(d.pins) ? d.pins.slice(0, CORKBOARD_PIN_SLOTS) : [];
    while (pins.length < CORKBOARD_PIN_SLOTS) pins.push(null);
    Game.corkBoards.push({
      id: d.id || ('cb_' + Math.random().toString(36).slice(2, 8)),
      x: d.x | 0, y: d.y | 0,
      hp: d.hp | 0 || CORKBOARD_MAX_HP,
      maxHp: d.maxHp | 0 || CORKBOARD_MAX_HP,
      pins: pins.map(p => p ? { kind: p.kind, refId: p.refId, pinnedDay: p.pinnedDay | 0 } : null),
    });
  }
}

// Cross-run meta: mirror the most-populated board's pin set into a single
// localStorage key. The first board placed in the next run hydrates from
// this in placeCorkBoard(). Stale refs are filtered by resolvePin().
let _cbMetaCache = null;
function loadCorkBoardMeta() {
  if (_cbMetaCache) return _cbMetaCache;
  try {
    const raw = localStorage.getItem(CORKBOARD_META_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      return _cbMetaCache = { pins: Array.isArray(d.pins) ? d.pins.slice(0, CORKBOARD_PIN_SLOTS) : [] };
    }
  } catch {}
  return _cbMetaCache = { pins: [] };
}
function saveCorkBoardMeta() {
  const boards = Game.corkBoards || [];
  if (boards.length === 0) return;
  let best = boards[0], bestN = best.pins.filter(p => p).length;
  for (let i = 1; i < boards.length; i++) {
    const n = boards[i].pins.filter(p => p).length;
    if (n > bestN) { best = boards[i]; bestN = n; }
  }
  _cbMetaCache = {
    pins: best.pins.map(p => p ? { kind: p.kind, refId: p.refId, pinnedDay: p.pinnedDay | 0 } : null),
  };
  try { localStorage.setItem(CORKBOARD_META_KEY, JSON.stringify(_cbMetaCache)); } catch {}
}
