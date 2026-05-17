'use strict';
// Squad Quarters (E·03): bunks + footlockers. Bunks pair 1:1 with squadmates;
// on dawn rollover an assigned squadmate inside a base gets full HP + morale+5,
// an unassigned squadmate inside a base gets morale-10. Footlockers bind 1:1
// to a squadmate (auto-bound to neighbouring bunk's assignee on open) and hold
// 1 weapon + 2 consumables. Depositing a weapon stamps survivor.equippedWeapon.
const BUNK_HP = 25, BUNK_W = 40, BUNK_H = 30;
const FOOTLOCKER_HP = 25, FOOTLOCKER_W = 32, FOOTLOCKER_H = 24;
const QUARTERS_INTERACT = 50, QUARTERS_CONS_SLOTS = 2;
const MORALE_SLEEP_BONUS = 5, MORALE_FLOOR_PENALTY = 10;
const MORALE_MIN = -50, MORALE_MAX = 100;
let __bunkIdSeq = 1, __footIdSeq = 1;
let __bunkMenuLayout = null, __footMenuLayout = null;

function initQuarters() {
  Game.bunks = []; Game.footlockers = [];
  Game.bunkMenuOpen = false; Game.bunkMenuTarget = null;
  Game.footlockerMenuOpen = false; Game.footlockerMenuTarget = null;
  __bunkIdSeq = 1; __footIdSeq = 1;
}
function updateQuarters(_dt) { /* sleep effects apply on dawn rollover */ }

function _survivorById(id) {
  if (!id || !Game.squad) return null;
  for (const s of Game.squad) if (s.id === id) return s;
  return null;
}
function _ensureSurvivorId(s) {
  if (!s.id) s.id = 'sv_' + Math.floor(Math.random() * 1e9).toString(36);
  if (s.bunkId === undefined) s.bunkId = null;
  if (s.morale === undefined) s.morale = 50;
}
function _insideBase(x, y) { return (typeof baseAt !== 'function') ? true : baseAt(x, y, 0); }
function _snapTopLeft(wx, wy) {
  return {
    x: clamp(Math.floor(wx / WALL_SIZE), 0, Math.floor(WORLD_W / WALL_SIZE) - 1) * WALL_SIZE,
    y: clamp(Math.floor(wy / WALL_SIZE), 0, Math.floor(WORLD_H / WALL_SIZE) - 1) * WALL_SIZE,
  };
}
function _blockedRect(r) {
  if (r.x < 0 || r.y < 0 || r.x + r.w > WORLD_W || r.y + r.h > WORLD_H) return true;
  if (typeof World !== 'undefined' && World.forEachActiveObstacle) {
    let hit = false;
    World.forEachActiveObstacle(r.x + r.w / 2, r.y + r.h / 2, (o) => {
      if (!hit && r.x < o.x + o.w && r.x + r.w > o.x &&
          r.y < o.y + o.h && r.y + r.h > o.y) hit = true;
    });
    if (hit) return true;
  }
  const others = [].concat(Game.walls || [],
    (Game.bunks || []).map(b => ({ x: b.x, y: b.y, w: BUNK_W, h: BUNK_H })),
    (Game.footlockers || []).map(f => ({ x: f.x, y: f.y, w: FOOTLOCKER_W, h: FOOTLOCKER_H })));
  for (const o of others) if (r.x < o.x + o.w && r.x + r.w > o.x && r.y < o.y + o.h && r.y + r.h > o.y) return true;
  return false;
}
function placeBunk(worldX, worldY, _player) {
  if (!Game.bunks) Game.bunks = [];
  const s = _snapTopLeft(worldX, worldY);
  if (_blockedRect({ x: s.x, y: s.y, w: BUNK_W, h: BUNK_H })) { setNotice("Can't place bunk there", 1.2); return null; }
  const bk = { id: __bunkIdSeq++, x: s.x, y: s.y, hp: BUNK_HP, maxHp: BUNK_HP, assignedSurvivorId: null };
  Game.bunks.push(bk);
  Audio.sfx.click && Audio.sfx.click();
  setNotice('Bunk placed — press E to assign', 2);
  return bk;
}
function placeFootlocker(worldX, worldY, _player) {
  if (!Game.footlockers) Game.footlockers = [];
  const s = _snapTopLeft(worldX, worldY);
  if (_blockedRect({ x: s.x, y: s.y, w: FOOTLOCKER_W, h: FOOTLOCKER_H })) { setNotice("Can't place footlocker there", 1.2); return null; }
  const fl = { id: __footIdSeq++, x: s.x, y: s.y, hp: FOOTLOCKER_HP, maxHp: FOOTLOCKER_HP, boundSurvivorId: null, contents: [] };
  Game.footlockers.push(fl);
  Audio.sfx.click && Audio.sfx.click();
  setNotice('Footlocker placed — press E to load out', 2);
  return fl;
}
function _nearest(list, px, py, R, sw, sh) {
  let best = null, bestD = R * R;
  for (const o of list) {
    const dx = (o.x + sw * 0.5) - px, dy = (o.y + sh * 0.5) - py, d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}
function findBunkNear(player, radius) {
  if (!Game.bunks || !player) return null;
  return _nearest(Game.bunks, player.x, player.y, radius || QUARTERS_INTERACT, BUNK_W, BUNK_H);
}
function findFootlockerNear(player, radius) {
  if (!Game.footlockers || !player) return null;
  return _nearest(Game.footlockers, player.x, player.y, radius || QUARTERS_INTERACT, FOOTLOCKER_W, FOOTLOCKER_H);
}
function assignSurvivorToBunk(survivor, bunk) {
  if (!survivor || !bunk) return false;
  _ensureSurvivorId(survivor);
  if (bunk.assignedSurvivorId && bunk.assignedSurvivorId !== survivor.id) {
    const prev = _survivorById(bunk.assignedSurvivorId); if (prev) prev.bunkId = null;
  }
  if (survivor.bunkId && survivor.bunkId !== bunk.id) {
    const old = (Game.bunks || []).find(b => b.id === survivor.bunkId);
    if (old) old.assignedSurvivorId = null;
  }
  bunk.assignedSurvivorId = survivor.id; survivor.bunkId = bunk.id;
  setNotice(`${survivor.name} assigned to bunk`, 1.5);
  Audio.sfx.pickup && Audio.sfx.pickup();
  return true;
}
function unassignSurvivorFromBunk(bunk) {
  if (!bunk) return;
  const sv = _survivorById(bunk.assignedSurvivorId);
  if (sv) sv.bunkId = null;
  bunk.assignedSurvivorId = null;
}
// Hooked from advanceDayPhase on dawn->day.
function onQuartersDawnRollover() {
  const sq = Game.squad; if (!sq || sq.length === 0) return;
  for (const s of sq) {
    _ensureSurvivorId(s);
    if (!_insideBase(s.x, s.y)) continue;
    const bunk = s.bunkId ? (Game.bunks || []).find(b => b.id === s.bunkId) : null;
    if (bunk && _insideBase(bunk.x + BUNK_W / 2, bunk.y + BUNK_H / 2)) {
      s.hp = s.maxHp;
      s.morale = clamp((s.morale | 0) + MORALE_SLEEP_BONUS, MORALE_MIN, MORALE_MAX);
    } else {
      s.morale = clamp((s.morale | 0) - MORALE_FLOOR_PENALTY, MORALE_MIN, MORALE_MAX);
    }
  }
}
function _catCount(fl, cat) {
  let n = 0; for (const c of fl.contents) { const d = ITEMS[c.id]; if (d && d.category === cat) n += c.count; }
  return n;
}
function _canAccept(fl, id, count) {
  const d = ITEMS[id]; if (!d) return false;
  if (d.category === 'tool') return _catCount(fl, 'tool') + count <= 1;
  if (d.category === 'consumable') return _catCount(fl, 'consumable') + count <= QUARTERS_CONS_SLOTS;
  return false;
}
function transferToFootlocker(itemId, count, player, fl) {
  if (!player || !fl) return false;
  const n = count | 0; if (n <= 0) return false;
  if (!hasItem(player.inventory, itemId, n)) { setNotice('Nothing to transfer', 1); return false; }
  if (!_canAccept(fl, itemId, n)) { setNotice('Slot full', 1.2); Audio.sfx.empty && Audio.sfx.empty(); return false; }
  removeItem(player.inventory, itemId, n);
  let slot = fl.contents.find(c => c.id === itemId);
  if (slot) slot.count += n; else fl.contents.push({ id: itemId, count: n });
  const def = ITEMS[itemId];
  if (def && def.category === 'tool') {
    const sv = _survivorById(fl.boundSurvivorId);
    if (sv) equipFromFootlocker(itemId, fl, sv);
  }
  Audio.sfx.pickup && Audio.sfx.pickup();
  return true;
}
function _withdraw(itemId, player, fl) {
  if (!player || !fl) return false;
  const slot = fl.contents.find(c => c.id === itemId);
  if (!slot || slot.count <= 0) return false;
  if (addItem(player.inventory, itemId, 1) > 0) { setNotice('Inventory full', 1.2); return false; }
  slot.count -= 1;
  if (slot.count <= 0) {
    fl.contents.splice(fl.contents.indexOf(slot), 1);
    const def = ITEMS[itemId];
    if (def && def.category === 'tool') {
      const sv = _survivorById(fl.boundSurvivorId);
      if (sv && sv.equippedWeapon === itemId) sv.equippedWeapon = null;
    }
  }
  Audio.sfx.click && Audio.sfx.click();
  return true;
}
function equipFromFootlocker(itemId, fl, survivor) {
  if (!survivor || !fl) return false;
  const d = ITEMS[itemId]; if (!d || d.category !== 'tool') return false;
  survivor.equippedWeapon = itemId;
  return true;
}
function openBunkAssignMenu(bunk) {
  if (Game.mode !== 'playing' || !bunk) return;
  Game.bunkMenuOpen = true; Game.bunkMenuTarget = bunk; Game.mapOpen = true;
  Audio.sfx.click && Audio.sfx.click();
}
function openFootlockerMenu(fl) {
  if (Game.mode !== 'playing' || !fl) return;
  if (!fl.boundSurvivorId) {
    const nb = findBunkNear({ x: fl.x + FOOTLOCKER_W / 2, y: fl.y + FOOTLOCKER_H / 2 }, 80);
    if (nb && nb.assignedSurvivorId) fl.boundSurvivorId = nb.assignedSurvivorId;
  }
  Game.footlockerMenuOpen = true; Game.footlockerMenuTarget = fl; Game.mapOpen = true;
  Audio.sfx.click && Audio.sfx.click();
}
function _closeMenu(kind) {
  if (kind === 'bunk') { Game.bunkMenuOpen = false; Game.bunkMenuTarget = null; __bunkMenuLayout = null; }
  else { Game.footlockerMenuOpen = false; Game.footlockerMenuTarget = null; __footMenuLayout = null; }
  if (Game.mode === 'playing') Game.mapOpen = false;
  if (Game.player) Game.player.openCd = 0.4;
}
function closeBunkAssignMenu() { _closeMenu('bunk'); }
function closeFootlockerMenu() { _closeMenu('foot'); }
function isBunkMenuOpen() { return !!Game.bunkMenuOpen; }
function isFootlockerMenuOpen() { return !!Game.footlockerMenuOpen; }
function _menuHeader(ctx, w, h, kicker, title, kc) {
  ctx.fillStyle = 'rgba(7,8,10,0.94)'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(11,12,14,0.92)'; ctx.fillRect(0, 0, w, 42);
  ctx.fillStyle = kc; ctx.font = 'bold 11px "JetBrains Mono", monospace';
  ctx.textAlign = 'left'; ctx.fillText(kicker, 22, 18);
  ctx.fillStyle = '#e8e6df'; ctx.font = 'bold 20px "Bebas Neue", sans-serif';
  ctx.fillText(title, 22, 34);
  ctx.fillStyle = '#7a7e88'; ctx.font = '10px "JetBrains Mono", monospace';
  ctx.textAlign = 'right'; ctx.fillText('[E] OR [ESC] · CLOSE', w - 22, 26);
  ctx.textAlign = 'left';
}
function _button(ctx, x, y, w, h, label, fill, fg) {
  ctx.fillStyle = fill; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fg; ctx.font = 'bold 13px "JetBrains Mono", monospace';
  ctx.textAlign = 'center'; ctx.fillText(label, x + w / 2, y + h / 2 + 5);
  ctx.textAlign = 'left';
}
function drawBunkAssignMenu(ctx, w, h, bunk) {
  _menuHeader(ctx, w, h, '// BUNK · ASSIGN', 'SLEEPING ASSIGNMENT', '#5fb6e8');
  __bunkMenuLayout = { buttons: [] };
  const sq = Game.squad || [];
  const rowH = 56, rowW = Math.min(560, w - 100), startX = (w - rowW) / 2;
  if (sq.length === 0) {
    ctx.fillStyle = '#7a7e88'; ctx.font = '12px "JetBrains Mono", monospace';
    ctx.fillText('No squadmates recruited yet.', startX + 16, 94);
    return;
  }
  // Each row's button: ASSIGNED (this bunk's holder, click=unassign), TAKEN
  // (held by a different bunk), ASSIGN (free squadmate, click=bind here).
  for (let i = 0; i < sq.length; i++) {
    const s = sq[i]; _ensureSurvivorId(s);
    const ry = 70 + i * (rowH + 6);
    const def = SQUAD_CLASS[s.cls] || { color: '#7a7e88', label: '???' };
    const isMine = bunk && s.bunkId === bunk.id;
    const taken = !!s.bunkId && !isMine;
    ctx.fillStyle = 'rgba(20,22,26,0.95)'; ctx.fillRect(startX, ry, rowW, rowH);
    ctx.fillStyle = def.color; ctx.fillRect(startX, ry, 4, rowH);
    ctx.fillStyle = '#e8e6df'; ctx.font = 'bold 16px "Bebas Neue", sans-serif';
    ctx.fillText(`${s.name}  ·  ${def.label}`, startX + 16, ry + 22);
    ctx.fillStyle = '#caa760'; ctx.font = '10px "JetBrains Mono", monospace';
    ctx.fillText(`HP ${s.hp | 0}/${s.maxHp}   MORALE ${(s.morale | 0)}`, startX + 16, ry + 40);
    const bx = startX + rowW - 126, by = ry + 12;
    const label = isMine ? 'UNASSIGN' : (taken ? 'TAKEN' : 'ASSIGN');
    _button(ctx, bx, by, 110, 32, label,
      isMine ? '#d24b35' : (taken ? '#3a3f4a' : '#8ec547'),
      taken ? '#7a7e88' : '#0b0c0e');
    __bunkMenuLayout.buttons.push({ x: bx, y: by, w: 110, h: 32, survivor: s, isMine, taken });
  }
}
function handleBunkMenuClick(mx, my) {
  if (!__bunkMenuLayout || !Game.bunkMenuTarget) return false;
  for (const btn of __bunkMenuLayout.buttons) {
    if (mx >= btn.x && mx <= btn.x + btn.w && my >= btn.y && my <= btn.y + btn.h) {
      if (btn.isMine) unassignSurvivorFromBunk(Game.bunkMenuTarget);
      else if (!btn.taken) assignSurvivorToBunk(btn.survivor, Game.bunkMenuTarget);
      Audio.sfx.click && Audio.sfx.click();
      return true;
    }
  }
  return false;
}
function drawFootlockerMenu(ctx, w, h, fl) {
  const sv = _survivorById(fl && fl.boundSurvivorId);
  const def = sv && SQUAD_CLASS[sv.cls];
  _menuHeader(ctx, w, h, '// FOOTLOCKER · LOADOUT',
    sv ? `${sv.name} · ${def.label}` : 'UNBOUND', def ? def.color : '#caa760');
  __footMenuLayout = { withdraw: [], deposit: [] };
  const colW = Math.min(280, (w - 80) / 2);
  const leftX = (w - colW * 2 - 24) / 2, rightX = leftX + colW + 24, top = 70;
  ctx.fillStyle = '#caa760'; ctx.font = 'bold 12px "JetBrains Mono", monospace';
  ctx.fillText(`LOADOUT (${_catCount(fl,'tool')}/1 weapon, ${_catCount(fl,'consumable')}/${QUARTERS_CONS_SLOTS} cons.)`, leftX, top);
  _drawColumn(ctx, fl.contents.map(c => ({ id: c.id, count: c.count })), leftX, top + 14, colW, 'withdraw', null);
  ctx.fillStyle = '#caa760'; ctx.fillText('YOUR INVENTORY', rightX, top);
  const inv = Game.player && Game.player.inventory; const counts = {};
  if (inv) for (const s of inv.slots) {
    if (!s) continue;
    const d = ITEMS[s.id];
    if (!d || (d.category !== 'tool' && d.category !== 'consumable')) continue;
    counts[s.id] = (counts[s.id] || 0) + s.count;
  }
  _drawColumn(ctx, Object.keys(counts).map(id => ({ id, count: counts[id] })),
    rightX, top + 14, colW, 'deposit', fl);
  ctx.fillStyle = '#7a7e88'; ctx.font = '11px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Click inventory to deposit. Click locker to withdraw.', w / 2, h - 22);
  ctx.textAlign = 'left';
}
function _drawColumn(ctx, items, x, y, w, kind, fl) {
  const rowH = 28;
  if (items.length === 0) {
    ctx.fillStyle = '#5a606b'; ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillText(kind === 'withdraw' ? '(empty)' : '(no loadout items)', x + 8, y + 18);
    return;
  }
  for (let i = 0; i < items.length; i++) {
    const c = items[i], def = ITEMS[c.id];
    const ok = fl ? _canAccept(fl, c.id, 1) : true;
    const ry = y + i * (rowH + 4);
    ctx.fillStyle = ok ? 'rgba(20,22,26,0.95)' : 'rgba(20,22,26,0.6)';
    ctx.fillRect(x, ry, w, rowH);
    ctx.fillStyle = def && def.tint ? def.tint : '#7a7e88'; ctx.fillRect(x, ry, 3, rowH);
    ctx.fillStyle = ok ? '#e8e6df' : '#7a7e88';
    ctx.font = 'bold 12px "JetBrains Mono", monospace';
    ctx.fillText(`${def ? def.name : c.id} ×${c.count}`, x + 10, ry + 18);
    if (fl && !ok) {
      ctx.fillStyle = '#d24b35'; ctx.font = '10px "JetBrains Mono", monospace';
      ctx.textAlign = 'right'; ctx.fillText('FULL', x + w - 8, ry + 18); ctx.textAlign = 'left';
    }
    __footMenuLayout[kind].push({ x, y: ry, w, h: rowH, itemId: c.id, ok });
  }
}
function handleFootlockerMenuClick(mx, my) {
  if (!__footMenuLayout || !Game.footlockerMenuTarget) return false;
  const fl = Game.footlockerMenuTarget;
  for (const r of __footMenuLayout.withdraw)
    if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) { _withdraw(r.itemId, Game.player, fl); return true; }
  for (const r of __footMenuLayout.deposit)
    if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) { if (r.ok) transferToFootlocker(r.itemId, 1, Game.player, fl); return true; }
  return false;
}
function _assignedColor(id) {
  const sv = _survivorById(id);
  return (sv && SQUAD_CLASS[sv.cls] && SQUAD_CLASS[sv.cls].color) || '#caa760';
}
function drawBunks(ctx, camX, camY) {
  const list = Game.bunks; if (!list || list.length === 0) return;
  const vL = camX - 60, vR = camX + VIEW_W + 60, vT = camY - 60, vB = camY + VIEW_H + 60;
  for (const b of list) {
    if (b.x + BUNK_W < vL || b.x > vR || b.y + BUNK_H < vT || b.y > vB) continue;
    const x = b.x, y = b.y;
    ctx.fillStyle = '#3a4a5c'; ctx.fillRect(x, y, BUNK_W, BUNK_H);
    ctx.fillStyle = '#5a6a7c'; ctx.fillRect(x + 1, y + 1, BUNK_W - 2, 2); ctx.fillRect(x + 1, y + 1, 2, BUNK_H - 2);
    ctx.fillStyle = '#1a222c'; ctx.fillRect(x + 1, y + BUNK_H - 3, BUNK_W - 2, 2);
    ctx.fillStyle = '#7a8a9a'; ctx.fillRect(x + 4, y + 6, BUNK_W - 8, BUNK_H - 12);
    ctx.fillStyle = '#8a9aaa'; ctx.fillRect(x + 4, y + 6, BUNK_W - 8, 1);
    ctx.fillStyle = '#ece7d7'; ctx.fillRect(x + 5, y + 8, 10, BUNK_H - 16);
    ctx.fillStyle = '#c8c3b3'; ctx.fillRect(x + 5, y + 8, 10, 1);
    ctx.fillStyle = '#6a7a8a'; ctx.fillRect(x + 16, y + 14, BUNK_W - 20, 3);
    if (b.assignedSurvivorId) {
      ctx.fillStyle = _assignedColor(b.assignedSurvivorId);
      ctx.beginPath(); ctx.arc(x + BUNK_W - 5, y + BUNK_H - 5, 2.5, 0, Math.PI * 2); ctx.fill();
    }
    if (b.hp < b.maxHp) _drawHpBar(ctx, x, y - 5, BUNK_W, b.hp / b.maxHp);
  }
}
function drawFootlockers(ctx, camX, camY) {
  const list = Game.footlockers; if (!list || list.length === 0) return;
  const vL = camX - 60, vR = camX + VIEW_W + 60, vT = camY - 60, vB = camY + VIEW_H + 60;
  for (const f of list) {
    if (f.x + FOOTLOCKER_W < vL || f.x > vR || f.y + FOOTLOCKER_H < vT || f.y > vB) continue;
    const x = f.x, y = f.y;
    ctx.fillStyle = '#2a1f14'; ctx.fillRect(x, y, FOOTLOCKER_W, FOOTLOCKER_H);
    ctx.fillStyle = '#4a3522'; ctx.fillRect(x + 1, y + 1, FOOTLOCKER_W - 2, FOOTLOCKER_H - 2);
    ctx.fillStyle = '#3a2a1a'; ctx.fillRect(x + 2, y + 8, FOOTLOCKER_W - 4, 1); ctx.fillRect(x + 2, y + 14, FOOTLOCKER_W - 4, 1);
    ctx.fillStyle = '#1a120a'; ctx.fillRect(x + 2, y + 4, FOOTLOCKER_W - 4, 1);
    ctx.fillStyle = '#7a7e88';
    ctx.fillRect(x + 1, y + 1, 4, 4); ctx.fillRect(x + FOOTLOCKER_W - 5, y + 1, 4, 4);
    ctx.fillRect(x + 1, y + FOOTLOCKER_H - 5, 4, 4); ctx.fillRect(x + FOOTLOCKER_W - 5, y + FOOTLOCKER_H - 5, 4, 4);
    ctx.fillStyle = '#a3a4ac'; ctx.fillRect(x + FOOTLOCKER_W / 2 - 2, y + 3, 4, 3);
    if (f.boundSurvivorId) {
      ctx.fillStyle = _assignedColor(f.boundSurvivorId);
      ctx.fillRect(x + 4, y + FOOTLOCKER_H - 7, FOOTLOCKER_W - 8, 2);
    }
    if (f.hp < f.maxHp) _drawHpBar(ctx, x, y - 5, FOOTLOCKER_W, f.hp / f.maxHp);
  }
}
function _drawHpBar(ctx, x, y, w, pct) {
  pct = Math.max(0, Math.min(1, pct));
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(x, y, w, 3);
  ctx.fillStyle = pct > 0.5 ? '#7ad97a' : pct > 0.25 ? '#e3c054' : '#d24b35';
  ctx.fillRect(x, y, w * pct, 3);
}
function saveQuarters() {
  return {
    bunkSeq: __bunkIdSeq, footSeq: __footIdSeq,
    bunks: (Game.bunks || []).map(b => ({ id: b.id, x: b.x, y: b.y, hp: b.hp, maxHp: b.maxHp, assignedSurvivorId: b.assignedSurvivorId || null })),
    footlockers: (Game.footlockers || []).map(f => ({
      id: f.id, x: f.x, y: f.y, hp: f.hp, maxHp: f.maxHp,
      boundSurvivorId: f.boundSurvivorId || null,
      contents: (f.contents || []).map(c => ({ id: c.id, count: c.count | 0 })),
    })),
  };
}
function loadQuarters(data) {
  initQuarters();
  if (!data) return;
  __bunkIdSeq = data.bunkSeq | 0 || 1; __footIdSeq = data.footSeq | 0 || 1;
  for (const d of (data.bunks || [])) {
    if (!d || typeof d.x !== 'number') continue;
    Game.bunks.push({
      id: d.id | 0 || __bunkIdSeq++, x: d.x, y: d.y,
      hp: typeof d.hp === 'number' ? d.hp : BUNK_HP,
      maxHp: typeof d.maxHp === 'number' ? d.maxHp : BUNK_HP,
      assignedSurvivorId: d.assignedSurvivorId || null,
    });
  }
  for (const d of (data.footlockers || [])) {
    if (!d || typeof d.x !== 'number') continue;
    Game.footlockers.push({
      id: d.id | 0 || __footIdSeq++, x: d.x, y: d.y,
      hp: typeof d.hp === 'number' ? d.hp : FOOTLOCKER_HP,
      maxHp: typeof d.maxHp === 'number' ? d.maxHp : FOOTLOCKER_HP,
      boundSurvivorId: d.boundSurvivorId || null,
      contents: Array.isArray(d.contents)
        ? d.contents.filter(c => c && c.id && ITEMS[c.id]).map(c => ({ id: c.id, count: c.count | 0 }))
        : [],
    });
  }
}
