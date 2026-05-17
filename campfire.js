'use strict';

// ---------- Campfire bonding (E·02) ----------
// Place a campfire. At DUSK with squadmates within CAMPFIRE_BOND_RADIUS, hold
// E for CAMPFIRE_HOLD_S to start a 90s bonding cutscene: world pauses,
// squadmates trade procedurally-generated stories. Each participant ends with
// +20 morale and a +15% accuracy buff that lasts to next day flip.
// State: Game.campfires[], Game.activeCampfireSession,
// Game.campfireSessionActive (bool the main loop reads to gate ticking).
// Squad fields `morale` (0..100, default 50) and `accuracyBuffUntilDay` are
// lazily added on first touch via ensureCampfireSquadFields().

const CAMPFIRE_HP = 30;
const CAMPFIRE_BOND_RADIUS = 80 * 40; // 80 tiles × TILE_SIZE 40 = 3200 world u
const CAMPFIRE_HOLD_S = 1.0;
const CAMPFIRE_INTERACT_R = 60;
const CAMPFIRE_SESSION_S = 90;
const CAMPFIRE_LINE_INTERVAL = 6;     // ~15 lines × 6s = 90s
const CAMPFIRE_MORALE_GAIN = 20;
const CAMPFIRE_ACCURACY_MULT = 1.15;

// Slot item + recipe into the global registries on load (idempotent).
if (typeof ITEMS !== 'undefined' && !ITEMS.campfire_kit) {
  ITEMS.campfire_kit = {
    id: 'campfire_kit', name: 'Campfire Kit', category: 'tool',
    stackMax: 4, tint: '#d28a4a',
    desc: 'Stack of logs and tinder. Place at base to build a campfire.',
  };
}
if (typeof CRAFT_RECIPES !== 'undefined' && !CRAFT_RECIPES.find(r => r.id === 'campfire_kit')) {
  CRAFT_RECIPES.push({
    id: 'campfire_kit', label: 'Campfire Kit',
    desc: 'Place at base, gather your squad at dusk for a morale & accuracy boost.',
    cost: [{ id: 'scrap', n: 6 }],
    apply(p) {
      const left = addItem(p.inventory, 'campfire_kit', 1);
      if (left === 0) setNotice('+1 campfire kit', 1.2);
      else setNotice('Inventory full — kit lost', 1.5);
    },
  });
}

// ---------- Story templates ----------
// 3 themes × 8 lines. Each turn picks one theme + one line at random and
// prefixes with the speaker's name. Line count is rotated so each survivor
// speaks ~evenly (~3 lines each in a 15-line / 90s session).
const CAMPFIRE_THEMES = [
  { prefix: 'Before all this, I was', pool: [
    'a substitute teacher — fourth grade, mostly fractions',
    'a long-haul trucker on the I-80 corridor',
    'an ER nurse at St. Cordelia\'s, night shift',
    'a barista who knew every regular by drink',
    'a carpenter, building decks for rich people upstate',
    'a postal worker on route 12, six days a week',
    'a high-school librarian, twenty-two years running',
    'a line cook at a diner that never closed' ] },
  { prefix: 'The thing I miss most is', pool: [
    'my dog Rusty — he never came home that morning',
    'the sound of cars on the highway through my window',
    'real coffee. Black. No milk powder, no rationing',
    'my sister\'s laugh. She lived in Tampa',
    'the smell of cut grass in the yard, after rain',
    'streetlights. Just streetlights',
    'air conditioning. God, I\'d kill for AC',
    'my grandmother\'s church on Sundays' ] },
  { prefix: 'The day this all started, I was', pool: [
    'in line at the DMV — what a way to go',
    'at my cousin\'s wedding when the calls started coming in',
    'asleep on the couch. The TV woke me up, screaming',
    'on the bus to work. Driver pulled over and just got off',
    'in the produce aisle, picking out tomatoes for dinner',
    'at the gym, on a treadmill, watching it on the muted TV',
    'driving my kid to soccer. We never made the field',
    'changing a flat tire by the road' ] },
];

// ---------- Module state ----------
let __campfireNextId = 1;
let __campfireHoldT = 0;
let __campfireHoldTarget = null;
let __campfireLastPhase = null;

function initCampfires() {
  Game.campfires = [];
  Game.activeCampfireSession = null;
  Game.campfireSessionActive = false;
  __campfireNextId = 1;
  __campfireHoldT = 0;
  __campfireHoldTarget = null;
  __campfireLastPhase = null;
}

// Lazy field migration. Called whenever we touch a squadmate.
function ensureCampfireSquadFields(s) {
  if (s.morale == null) s.morale = 50;
  if (s.accuracyBuffUntilDay == null) s.accuracyBuffUntilDay = 0;
}

function applyAccuracyBuff(s) {
  ensureCampfireSquadFields(s);
  s.accuracyBuffUntilDay = (Game.time ? Game.time.day : 1) + 1;
}

function survivorAccuracyMult(s) {
  if (!s) return 1.0;
  ensureCampfireSquadFields(s);
  const today = Game.time ? Game.time.day : 1;
  return (s.accuracyBuffUntilDay > today) ? CAMPFIRE_ACCURACY_MULT : 1.0;
}

// ---------- Placement / lookup ----------
function placeCampfire(x, y, player) {
  if (typeof inObstacle === 'function' && inObstacle(x, y, 18)) {
    setNotice("Can't place there", 1); return false;
  }
  if (x < 30 || y < 30 || x > WORLD_W - 30 || y > WORLD_H - 30) {
    setNotice('Out of bounds', 1); return false;
  }
  if (!Game.campfires) Game.campfires = [];
  Game.campfires.push({
    id: __campfireNextId++, x, y,
    hp: CAMPFIRE_HP, maxHp: CAMPFIRE_HP,
    lit: false, bondedThisDusk: false, flicker: Math.random(),
  });
  if (player && player.inventory) removeItem(player.inventory, 'campfire_kit', 1);
  if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx.click) Audio.sfx.click();
  setNotice('Campfire placed', 1.5);
  return true;
}

function findCampfireNear(player, radius) {
  const list = Game.campfires; if (!list || !list.length || !player) return null;
  const r = (radius != null) ? radius : CAMPFIRE_INTERACT_R;
  const r2 = r * r;
  let best = null, bestD = r2;
  for (const c of list) {
    if (c.hp <= 0) continue;
    const dx = c.x - player.x, dy = c.y - player.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function damageCampfire(c, dmg) {
  if (!c || c.hp <= 0) return;
  c.hp -= dmg;
  if (c.hp <= 0) {
    c.hp = 0; c.lit = false;
    for (let k = 0; k < 8; k++) {
      Game.particles && Game.particles.push({
        x: c.x, y: c.y, vx: rand(-90, 90), vy: rand(-90, 90),
        life: rand(0.3, 0.7), color: '#5a3a1a', r: rand(1, 3),
      });
    }
    setNotice('Campfire destroyed', 1.2);
    if (__campfireHoldTarget === c) { __campfireHoldTarget = null; __campfireHoldT = 0; }
  }
}

// ---------- Bonding session ----------
// Build the whole script up-front so timing is deterministic.
function __buildCampfireScript(participants) {
  const lines = [];
  const lineCount = Math.ceil(CAMPFIRE_SESSION_S / CAMPFIRE_LINE_INTERVAL);
  for (let i = 0; i < lineCount; i++) {
    const sIdx = i % participants.length;
    const s = participants[sIdx];
    const t = CAMPFIRE_THEMES[i % CAMPFIRE_THEMES.length];
    const tail = t.pool[Math.floor(Math.random() * t.pool.length)];
    lines.push({
      speakerId: s.id, speakerName: s.name, cls: s.cls,
      text: `${s.name}: "${t.prefix} ${tail}."`,
      appearAt: i * CAMPFIRE_LINE_INTERVAL,
    });
  }
  return lines;
}

function tryStartBondingSession(campfire, player) {
  if (!campfire || campfire.hp <= 0) return false;
  if (Game.activeCampfireSession) return false;
  if (!Game.time || Game.time.phase !== 'dusk') {
    setNotice('Campfire bonds only at dusk', 1.6); return false;
  }
  if (campfire.bondedThisDusk) {
    setNotice('Already bonded this dusk', 1.6); return false;
  }
  const sq = Game.squad || [];
  const participants = [];
  const r2 = CAMPFIRE_BOND_RADIUS * CAMPFIRE_BOND_RADIUS;
  for (const s of sq) {
    if (s.hp <= 0) continue;
    const dx = s.x - campfire.x, dy = s.y - campfire.y;
    if (dx * dx + dy * dy <= r2) {
      s.__cfSpeakerId = s.__cfSpeakerId || ('sq' + Math.random().toString(36).slice(2, 7));
      ensureCampfireSquadFields(s);
      participants.push({ id: s.__cfSpeakerId, ref: s, name: s.name, cls: s.cls });
    }
  }
  if (participants.length === 0) {
    setNotice('No squadmates nearby', 1.6); return false;
  }
  campfire.lit = true;
  Game.activeCampfireSession = {
    campfireId: campfire.id, participants,
    startedAt: (Game.time ? Game.time.t : 0),
    durationLeft: CAMPFIRE_SESSION_S,
    elapsed: 0, currentLine: -1,
    lines: __buildCampfireScript(participants),
  };
  Game.campfireSessionActive = true;
  if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx.pickup) Audio.sfx.pickup();
  if (typeof setBanner === 'function') {
    setBanner(`THE FIRE GATHERS · ${participants.length} squadmate${participants.length > 1 ? 's' : ''}`, 2.0);
  }
  return true;
}

function endBondingSession() {
  const sess = Game.activeCampfireSession;
  Game.activeCampfireSession = null;
  Game.campfireSessionActive = false;
  if (!sess) return;
  const fire = (Game.campfires || []).find(c => c.id === sess.campfireId);
  if (fire) fire.bondedThisDusk = true;
  for (const part of sess.participants) {
    const s = (Game.squad || []).find(m => m.__cfSpeakerId === part.id);
    if (!s) continue;
    ensureCampfireSquadFields(s);
    s.morale = Math.min(100, s.morale + CAMPFIRE_MORALE_GAIN);
    applyAccuracyBuff(s);
  }
  if (typeof setBanner === 'function') setBanner('THE FIRE FADES · squad bonded', 2.0);
  if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx.wave) Audio.sfx.wave();
}

// ---------- Ticking ----------
function updateCampfires(dt) {
  const phase = Game.time ? Game.time.phase : null;
  if (phase !== __campfireLastPhase) {
    if (__campfireLastPhase === 'dusk' && phase !== 'dusk') {
      for (const c of (Game.campfires || [])) c.bondedThisDusk = false;
    }
    __campfireLastPhase = phase;
  }
  for (const c of (Game.campfires || [])) {
    if (c.lit) c.flicker = (c.flicker + dt * 8) % 1000;
  }
  const sess = Game.activeCampfireSession;
  if (sess) {
    sess.elapsed += dt;
    sess.durationLeft -= dt;
    let idx = -1;
    for (let i = 0; i < sess.lines.length; i++) {
      if (sess.elapsed >= sess.lines[i].appearAt) idx = i; else break;
    }
    sess.currentLine = idx;
    if (sess.durationLeft <= 0) endBondingSession();
  }
}

// ---------- E-hold interaction ----------
// Integrator calls this BEFORE the existing chest/workbench E-key flow:
// if (campfireTryInteract(player, eHeld, dt)) return; else <existing>.
function campfireTryInteract(player, eHeld, dt) {
  if (!player) return false;
  const fire = findCampfireNear(player, CAMPFIRE_INTERACT_R);
  if (!fire) { __campfireHoldT = 0; __campfireHoldTarget = null; return false; }
  if (!Game.time || Game.time.phase !== 'dusk') return false;
  if (fire.bondedThisDusk) return false;
  if (!eHeld) { __campfireHoldT = 0; __campfireHoldTarget = null; return false; }
  if (__campfireHoldTarget !== fire) { __campfireHoldTarget = fire; __campfireHoldT = 0; }
  __campfireHoldT += dt;
  if (__campfireHoldT >= CAMPFIRE_HOLD_S) {
    __campfireHoldT = 0; __campfireHoldTarget = null;
    tryStartBondingSession(fire, player);
  }
  return true;
}

function campfireHoldProgress() {
  if (!__campfireHoldTarget) return 0;
  return Math.min(1, __campfireHoldT / CAMPFIRE_HOLD_S);
}

// ---------- World rendering ----------
function drawCampfires(ctx, camX, camY) {
  const list = Game.campfires; if (!list || !list.length) return;
  for (const c of list) { if (c.hp > 0) drawCampfireProp(ctx, c); }
  // Hold ring above the campfire being held.
  if (__campfireHoldTarget && __campfireHoldT > 0) {
    const t = __campfireHoldTarget;
    const frac = Math.min(1, __campfireHoldT / CAMPFIRE_HOLD_S);
    ctx.save();
    ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(t.x, t.y - 20, 20, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function drawCampfireProp(ctx, c) {
  ctx.save();
  ctx.fillStyle = '#3a2814'; ctx.fillRect(c.x - 14, c.y - 2, 28, 6);
  ctx.fillStyle = '#5a3a1a'; ctx.fillRect(c.x - 13, c.y - 1, 26, 4);
  ctx.fillStyle = '#7a4a22'; ctx.fillRect(c.x - 12, c.y, 24, 1);
  ctx.fillStyle = '#3a2814'; ctx.fillRect(c.x - 4, c.y - 8, 8, 12);
  ctx.fillStyle = '#5a3a1a'; ctx.fillRect(c.x - 3, c.y - 7, 6, 10);
  if (c.lit) {
    const t = (Game.time ? Game.time.t : 0) * 6 + (c.flicker || 0);
    const flames = [
      [-5, 14 + Math.sin(t * 1.3) * 3,       '#ffd55a'],
      [ 0, 18 + Math.sin(t * 1.7 + 1.2) * 4, '#ff9a3a'],
      [ 5, 12 + Math.sin(t * 2.1 + 2.3) * 3, '#ffc24a'],
    ];
    for (const f of flames) {
      ctx.fillStyle = f[2];
      ctx.beginPath();
      ctx.moveTo(c.x + f[0] - 4, c.y - 4);
      ctx.lineTo(c.x + f[0] + 4, c.y - 4);
      ctx.lineTo(c.x + f[0], c.y - 4 - f[1]);
      ctx.closePath(); ctx.fill();
    }
    const g = ctx.createRadialGradient(c.x, c.y - 6, 4, c.x, c.y - 6, 60);
    g.addColorStop(0, 'rgba(255,180,90,0.22)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(c.x, c.y - 6, 60, 0, Math.PI * 2); ctx.fill();
  }
  if (c.hp < c.maxHp) {
    const w = 24, frac = c.hp / c.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(c.x - w / 2 - 1, c.y - 16, w + 2, 3);
    ctx.fillStyle = frac > 0.5 ? '#8ec547' : frac > 0.2 ? '#e3a83a' : '#d24b35';
    ctx.fillRect(c.x - w / 2, c.y - 15, w * frac, 1);
  }
  ctx.restore();
}

// ---------- Cutscene overlay ----------
function drawCampfireCutscene(ctx, w, h) {
  const sess = Game.activeCampfireSession; if (!sess) return;
  ctx.save();
  ctx.fillStyle = 'rgba(8,6,4,0.70)'; ctx.fillRect(0, 0, w, h);
  const fx = w / 2, fy = h * 0.78;
  const t = (Game.time ? Game.time.t : 0) * 4;
  ctx.fillStyle = '#3a2814'; ctx.fillRect(fx - 70, fy - 8, 140, 24);
  ctx.fillStyle = '#5a3a1a'; ctx.fillRect(fx - 66, fy - 4, 132, 16);
  for (let i = 0; i < 3; i++) {
    const off = (i - 1) * 24;
    const flameH = 90 + Math.sin(t * 1.2 + i * 1.7) * 18;
    ctx.fillStyle = i === 1 ? '#ff9a3a' : (i === 0 ? '#ffd55a' : '#ffc24a');
    ctx.beginPath();
    ctx.moveTo(fx + off - 18, fy - 4);
    ctx.lineTo(fx + off + 18, fy - 4);
    ctx.lineTo(fx + off, fy - 4 - flameH);
    ctx.closePath(); ctx.fill();
  }
  const g = ctx.createRadialGradient(fx, fy - 30, 30, fx, fy - 30, Math.max(w, h) * 0.7);
  g.addColorStop(0, 'rgba(255,170,80,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  // Squadmate portraits in an arc above the fire.
  const cur = sess.currentLine;
  const speakerId = (cur >= 0 && sess.lines[cur]) ? sess.lines[cur].speakerId : null;
  const arcR = Math.min(w, h) * 0.28;
  const n = sess.participants.length;
  for (let i = 0; i < n; i++) {
    const ang = Math.PI + (i + 1) / (n + 1) * Math.PI;
    const px = fx + Math.cos(ang) * arcR, py = (fy - 20) + Math.sin(ang) * arcR;
    const part = sess.participants[i];
    const color = (typeof SQUAD_CLASS !== 'undefined' && SQUAD_CLASS[part.cls] && SQUAD_CLASS[part.cls].color)
      ? SQUAD_CLASS[part.cls].color : '#cccccc';
    const active = part.id === speakerId;
    if (active) {
      const gg = ctx.createRadialGradient(px, py, 4, px, py, 50);
      gg.addColorStop(0, 'rgba(255,210,120,0.55)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(px, py, 50, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(px, py, active ? 22 : 18, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = active ? '#fff7d8' : '#1a1410';
    ctx.lineWidth = active ? 3 : 2; ctx.stroke();
    ctx.fillStyle = active ? '#fff7d8' : '#bcb6a8';
    ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
    ctx.fillText(part.name, px, py + 38);
  }
  // Active dialogue line.
  if (cur >= 0 && sess.lines[cur]) {
    const ln = sess.lines[cur];
    const into = Math.max(0, sess.elapsed - ln.appearAt);
    const fadeIn = Math.min(1, into / 0.6);
    const fadeOut = Math.min(1, Math.max(0, (CAMPFIRE_LINE_INTERVAL - into) / 0.6));
    ctx.globalAlpha = Math.min(fadeIn, fadeOut);
    const boxW = Math.min(w * 0.82, 720);
    const boxX = (w - boxW) / 2, boxY = h * 0.18;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(boxX, boxY, boxW, 80);
    ctx.strokeStyle = '#d28a4a'; ctx.lineWidth = 2;
    ctx.strokeRect(boxX, boxY, boxW, 80);
    ctx.fillStyle = '#fff7d8'; ctx.font = '16px monospace'; ctx.textAlign = 'left';
    const words = ln.text.split(' ');
    const maxChars = Math.floor(boxW / 9);
    const wrapped = []; let buf = '';
    for (const word of words) {
      if ((buf + ' ' + word).trim().length > maxChars) { wrapped.push(buf); buf = word; }
      else buf = (buf + ' ' + word).trim();
    }
    if (buf) wrapped.push(buf);
    for (let i = 0; i < wrapped.length && i < 3; i++) {
      ctx.fillText(wrapped[i], boxX + 16, boxY + 26 + i * 20);
    }
    ctx.globalAlpha = 1;
  }
  // Session timer bar at top.
  const left = Math.max(0, sess.durationLeft);
  ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(w / 2 - 160, 28, 320, 8);
  ctx.fillStyle = '#d28a4a'; ctx.fillRect(w / 2 - 158, 30, 316 * (left / CAMPFIRE_SESSION_S), 4);
  ctx.fillStyle = '#fff7d8'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center';
  ctx.fillText(`CAMPFIRE BOND · ${left.toFixed(0)}s`, w / 2, 22);
  ctx.restore();
}

// ---------- Save / Load ----------
function saveCampfires() {
  const list = Game.campfires || [];
  return list.map(c => ({
    id: c.id, x: c.x, y: c.y, hp: c.hp, maxHp: c.maxHp,
    lit: !!c.lit, bondedThisDusk: !!c.bondedThisDusk,
  }));
}
function loadCampfires(data) {
  Game.campfires = [];
  Game.activeCampfireSession = null;
  Game.campfireSessionActive = false;
  __campfireHoldT = 0; __campfireHoldTarget = null;
  if (!Array.isArray(data)) return;
  let maxId = 0;
  for (const d of data) {
    if (!d || typeof d.x !== 'number' || typeof d.y !== 'number') continue;
    Game.campfires.push({
      id: d.id | 0, x: d.x, y: d.y,
      hp: d.hp != null ? d.hp : CAMPFIRE_HP,
      maxHp: d.maxHp != null ? d.maxHp : CAMPFIRE_HP,
      lit: !!d.lit, bondedThisDusk: !!d.bondedThisDusk,
      flicker: Math.random(),
    });
    if (d.id > maxId) maxId = d.id;
  }
  __campfireNextId = maxId + 1;
}
