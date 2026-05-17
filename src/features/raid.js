'use strict';

// ---------- Raid Night (D·03) ----------
// Every 4–6 days (or piggy-backing a blood moon) a directional horde spawns
// from one edge of the active region and pathfinds to the nearest claimed
// base. 60 walkers + 2 specials (cluster/charger/brood/reaper/necro/bloater),
// drip-fed at RAID_DRIP_PER_SEC. State lives on Game.raid + Game.nextRaidDay;
// both persist via saveRaid()/loadRaid(). Additive only — see
// .homestead-integration/raid.md.

// ---------- Tunables ----------
const RAID_BASE_WALKERS   = 60;
const RAID_BLOOD_WALKERS  = 80;            // blood-moon escalation
const RAID_SPECIALS_COUNT = 2;
const RAID_DRIP_PER_SEC   = 8;
const RAID_GAP_MIN_DAYS   = 4;
const RAID_GAP_MAX_DAYS   = 6;
const RAID_BANNER_SECS    = 5;
const RAID_SPAWN_MARGIN   = 40;
const RAID_DEFAULT_RADIUS = (typeof ACTIVE_RADIUS === 'number' ? ACTIVE_RADIUS : 2);

// Special pool — ids must exist in bestiary.js; missing ids fail soft.
const RAID_SPECIAL_POOL = ['cluster', 'charger', 'brood', 'reaper', 'necro', 'bloater'];

// ---------- Lifecycle ----------
function initRaid() {
  Game.raid = {
    active: false, startedDay: -1,
    targetBaseId: null, targetX: 0, targetY: 0,
    spawnEdge: 'n', spawned: 0, totalToSpawn: 0,
    queue: [], lastSpawnAt: 0,
    bannerShownAt: 0, bloodMoon: false,
  };
  Game.nextRaidDay = RAID_GAP_MIN_DAYS;
}
function isRaidActive() { return !!(Game.raid && Game.raid.active); }

// ---------- Target / direction ----------
// Prefer the base nearest the player. Fall back to the player's own position
// so day-1 raids (no flags yet) still aim somewhere meaningful.
function pickRaidTarget() {
  const p = Game.player;
  if (p && typeof nearestBase === 'function') {
    const b = nearestBase(p.x, p.y);
    if (b) return b;
  }
  if (p) return { id: null, x: p.x, y: p.y, name: 'YOU' };
  return { id: null, x: WORLD_W / 2, y: WORLD_H / 2, name: 'CENTER' };
}

// Cardinal edge of the active region the horde streams in from. Biased
// toward the player→target vector so the player sees them approach; random
// if the player is on top of the target.
function pickSpawnEdge(target) {
  const p = Game.player;
  if (!p || !target) return ['n', 's', 'e', 'w'][Math.floor(Math.random() * 4)];
  const dx = target.x - p.x, dy = target.y - p.y;
  if (Math.abs(dx) < 20 && Math.abs(dy) < 20) {
    return ['n', 's', 'e', 'w'][Math.floor(Math.random() * 4)];
  }
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'e' : 'w';
  return dy > 0 ? 's' : 'n';
}

function __pickSpecials(n) {
  const pool = RAID_SPECIAL_POOL.slice(), out = [];
  while (out.length < n && pool.length) {
    out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  }
  return out;
}

// Spawn point along the chosen edge of the active region (relative to the
// player). Mirrors spawnZombieAtEdge in game.js so raid spawns appear at the
// same off-screen perimeter as the regular spawner.
function __spawnPointForEdge(edge) {
  const p = Game.player;
  const span = (RAID_DEFAULT_RADIUS * 2 + 1) * CHUNK_SIZE;
  const halfSpan = span / 2;
  const along = (Math.random() * 2 - 1) * (halfSpan - 80);
  const off = RAID_SPAWN_MARGIN + Math.random() * 60;
  let x, y;
  if (edge === 'n')      { x = p.x + along;          y = p.y - halfSpan + off; }
  else if (edge === 's') { x = p.x + along;          y = p.y + halfSpan - off; }
  else if (edge === 'w') { x = p.x - halfSpan + off; y = p.y + along; }
  else                   { x = p.x + halfSpan - off; y = p.y + along; }
  return { x: clamp(x, 40, WORLD_W - 40), y: clamp(y, 40, WORLD_H - 40) };
}

// Build the queue. Specials are inserted at ~25% and ~75% so they don't
// bunch at the head/tail of an otherwise homogeneous walker drip.
function __buildQueue(walkers, specials) {
  const q = [];
  for (let i = 0; i < walkers; i++) q.push({ kind: 'walker' });
  if (specials.length > 0 && q.length > 4) q.splice(Math.floor(q.length * 0.25), 0, { kind: specials[0] });
  if (specials.length > 1 && q.length > 8) q.splice(Math.floor(q.length * 0.75), 0, { kind: specials[1] });
  for (let i = 2; i < specials.length; i++) q.push({ kind: specials[i] });
  return q;
}

// Resolve the host's spawn function — try the conventional homestead name
// first, then fall back so the integrator can rename without editing here.
function __resolveSpawnFn() {
  if (typeof spawnZombieAt === 'function') return spawnZombieAt;
  if (typeof spawnZombie === 'function') return spawnZombie;
  return null;
}

// Wrapper that stamps `raidTargetBaseId` (and last-known coords) onto the
// resulting zombie so steering and end-of-raid counting can find it later.
function spawnRaidZombie(kind, target) {
  if (!Game.raid) return null;
  const spawn = __resolveSpawnFn();
  if (!spawn) return null;
  let pt = __spawnPointForEdge(Game.raid.spawnEdge);
  for (let tries = 0; tries < 6; tries++) {
    if (typeof inObstacle !== 'function' || !inObstacle(pt.x, pt.y, 16)) break;
    pt = __spawnPointForEdge(Game.raid.spawnEdge);
  }
  const z = spawn(kind, pt.x, pt.y);
  if (z) {
    z.raidTargetBaseId = target && target.id != null ? target.id : '__raidPlayerFallback';
    z.raidTargetX = target ? target.x : pt.x;
    z.raidTargetY = target ? target.y : pt.y;
    Game.raid.spawned++;
  }
  return z;
}

// Steering override: return {x,y} of the raid target for `z`, or null if
// `z` isn't a raid zombie. The host calls this BEFORE the player-chase step.
function raidZombieTarget(z) {
  if (!z || !z.raidTargetBaseId) return null;
  // Re-resolve the base by id each call — the base may have been removed
  // mid-raid, so fall back to the cached coords.
  if (Game.bases && Game.bases.length) {
    for (let i = 0; i < Game.bases.length; i++) {
      const b = Game.bases[i];
      if (b.id === z.raidTargetBaseId) return { x: b.x, y: b.y };
    }
  }
  if (z.raidTargetX != null && z.raidTargetY != null) {
    return { x: z.raidTargetX, y: z.raidTargetY };
  }
  return null;
}

function __countLiveRaidZombies() {
  const zs = Game.zombies;
  if (!zs) return 0;
  let n = 0;
  for (let i = 0; i < zs.length; i++) if (zs[i].raidTargetBaseId) n++;
  return n;
}

function __targetName() {
  if (!Game.raid || Game.raid.targetBaseId == null) return 'POSITION';
  if (Game.bases) for (const b of Game.bases) if (b.id === Game.raid.targetBaseId) return b.name;
  return 'BASE';
}

function __edgeLabel(edge) {
  return edge === 'n' ? 'NORTH' : edge === 's' ? 'SOUTH'
       : edge === 'e' ? 'EAST'  : edge === 'w' ? 'WEST' : '?';
}

// ---------- Day-phase hooks ----------
// Day -> dusk: show the warning banner, pre-pick target + edge so the night
// hook can flip the pump on without re-deciding.
function onRaidDayDuskHook() {
  if (!Game.raid || !Game.time) return;
  if (Game.time.day !== Game.nextRaidDay) return;
  const target = pickRaidTarget();
  const edge = pickSpawnEdge(target);
  const bloodMoon = (typeof isBloodMoonTonight === 'function') && isBloodMoonTonight();
  const walkers = bloodMoon ? RAID_BLOOD_WALKERS : RAID_BASE_WALKERS;
  Game.raid.targetBaseId = target.id;
  Game.raid.targetX = target.x;
  Game.raid.targetY = target.y;
  Game.raid.spawnEdge = edge;
  Game.raid.bloodMoon = bloodMoon;
  Game.raid.totalToSpawn = walkers + RAID_SPECIALS_COUNT;
  Game.raid.queue = [];
  Game.raid.spawned = 0;
  Game.raid.bannerShownAt = now() + RAID_BANNER_SECS;
  Game.raid.startedDay = Game.time.day;
  if (typeof setBanner === 'function') {
    const tag = bloodMoon ? 'BLOOD MOON RAID' : 'RAID INCOMING';
    setBanner(`${tag} — ${target.name || 'BASE'} from ${__edgeLabel(edge)}`, RAID_BANNER_SECS);
  }
  if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx.wave) Audio.sfx.wave();
}

// Dusk -> night: build the drip queue and activate the raid.
function onRaidDayNightHook() {
  if (!Game.raid || !Game.time) return;
  if (Game.time.day !== Game.raid.startedDay) return;
  const walkers = Game.raid.bloodMoon ? RAID_BLOOD_WALKERS : RAID_BASE_WALKERS;
  const specials = __pickSpecials(RAID_SPECIALS_COUNT);
  Game.raid.queue = __buildQueue(walkers, specials);
  Game.raid.totalToSpawn = Game.raid.queue.length;
  Game.raid.spawned = 0;
  Game.raid.active = true;
  Game.raid.lastSpawnAt = now();
  if (typeof setBanner === 'function') setBanner(`RAID ACTIVE — defend ${__targetName()}`, 2.5);
}

// ---------- Tick ----------
function updateRaid(dt) {
  if (!Game.raid || !Game.raid.active) return;
  const t = now();
  const interval = 1 / RAID_DRIP_PER_SEC;
  // Drip-feed the queue.
  while (Game.raid.queue.length > 0 && t - Game.raid.lastSpawnAt >= interval) {
    const entry = Game.raid.queue.shift();
    let target = null;
    if (Game.raid.targetBaseId != null && Game.bases) {
      for (const b of Game.bases) if (b.id === Game.raid.targetBaseId) { target = b; break; }
    }
    if (!target) target = { id: Game.raid.targetBaseId, x: Game.raid.targetX, y: Game.raid.targetY };
    spawnRaidZombie(entry.kind, target);
    Game.raid.lastSpawnAt += interval;
  }
  // End conditions: dawn arrives, or queue drained + no raid zombies alive.
  const phase = Game.time && Game.time.phase;
  if (phase === 'dawn' || phase === 'day') { endRaid(); return; }
  if (Game.raid.queue.length === 0 && __countLiveRaidZombies() === 0) endRaid();
}

function endRaid() {
  if (!Game.raid) return;
  if (!Game.raid.active && Game.raid.queue.length === 0) return;
  Game.raid.active = false;
  Game.raid.queue.length = 0;
  const gap = RAID_GAP_MIN_DAYS + Math.floor(Math.random() * (RAID_GAP_MAX_DAYS - RAID_GAP_MIN_DAYS + 1));
  const today = (Game.time && Game.time.day) | 0;
  Game.nextRaidDay = today + gap;
  Game.raid.bloodMoon = false;
  Game.raid.targetBaseId = null;
  if (typeof setBanner === 'function') setBanner(`RAID OVER · next in ${gap} days`, 2.5);
}

// ---------- HUD draw ----------
// Full-width red bar at the top of the screen during the dusk warning. Flashes
// 2 Hz with a soft baseline alpha; fades out over 0.5s past bannerShownAt.
function drawRaidBanner(ctx, w, h) {
  if (!Game.raid) return;
  const t = now();
  const fadeOutSecs = 0.5;
  const showUntil = Game.raid.bannerShownAt || 0;
  const elapsed = showUntil - t;
  if (elapsed < -fadeOutSecs) return;
  if (Game.time && Game.time.phase !== 'dusk') return;
  const fadeAlpha = elapsed >= 0 ? 1 : (1 + elapsed / fadeOutSecs);
  const flash = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(t * 12));
  const a = flash * fadeAlpha;
  const bannerH = 70;
  ctx.save();
  ctx.fillStyle = `rgba(178, 34, 34, ${0.85 * fadeAlpha})`;
  ctx.fillRect(0, 0, w, bannerH);
  ctx.fillStyle = `rgba(232, 84, 60, ${fadeAlpha})`;
  ctx.fillRect(0, 0, w, 2);
  ctx.fillRect(0, bannerH - 2, w, 2);
  ctx.fillStyle = `rgba(245, 240, 224, ${a})`;
  ctx.textAlign = 'center';
  ctx.font = 'bold 28px "Bebas Neue", "JetBrains Mono", monospace';
  ctx.fillText(Game.raid.bloodMoon ? 'BLOOD MOON RAID' : 'RAID INCOMING', w / 2, 32);
  ctx.fillStyle = `rgba(245, 240, 224, ${0.85 * fadeAlpha})`;
  ctx.font = 'bold 14px "JetBrains Mono", monospace';
  ctx.fillText(`${__targetName()} · ${__edgeLabel(Game.raid.spawnEdge)} FLANK`, w / 2, 55);
  ctx.restore();
}

// Small pulsing chevron near the HUD edge indicating the incoming horde
// direction. Visible during the dusk warning and the active raid.
function drawRaidArrow(ctx, w, h, camX, camY) {
  if (!Game.raid) return;
  const t = now();
  const showDuskBanner = Game.raid.bannerShownAt > t && Game.time && Game.time.phase === 'dusk';
  if (!Game.raid.active && !showDuskBanner) return;
  const edge = Game.raid.spawnEdge;
  const inset = 56;
  let cx, cy, ang;
  if (edge === 'n')      { cx = w / 2;     cy = inset;     ang = -Math.PI / 2; }
  else if (edge === 's') { cx = w / 2;     cy = h - inset; ang =  Math.PI / 2; }
  else if (edge === 'w') { cx = inset;     cy = h / 2;     ang =  Math.PI; }
  else                   { cx = w - inset; cy = h / 2;     ang =  0; }
  const pulse = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 8));
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(ang);
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.beginPath(); ctx.arc(0, 0, 22, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = `rgba(232, 84, 60, ${pulse})`;
  ctx.beginPath();
  ctx.moveTo(14, 0); ctx.lineTo(-6, -12); ctx.lineTo(-2, 0); ctx.lineTo(-6, 12);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = `rgba(245, 240, 224, ${pulse * 0.9})`;
  ctx.beginPath();
  ctx.moveTo(10, 0); ctx.lineTo(-2, -7); ctx.lineTo(0, 0); ctx.lineTo(-2, 7);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  if (Game.raid.active) {
    const left = Game.raid.queue.length + __countLiveRaidZombies();
    const total = Game.raid.totalToSpawn;
    ctx.save();
    ctx.font = 'bold 10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8e6df';
    const labelY = (edge === 'n') ? cy + 30 : (edge === 's') ? cy - 30 : cy + 30;
    ctx.fillText(`RAID ${total - left}/${total}`, cx, labelY);
    ctx.restore();
  }
}

// ---------- Save / load ----------
function saveRaid() {
  if (!Game.raid) return null;
  const r = Game.raid;
  return {
    active: !!r.active, startedDay: r.startedDay,
    targetBaseId: r.targetBaseId, targetX: r.targetX, targetY: r.targetY,
    spawnEdge: r.spawnEdge, spawned: r.spawned, totalToSpawn: r.totalToSpawn,
    bloodMoon: !!r.bloodMoon, queue: r.queue.slice(),
    nextRaidDay: Game.nextRaidDay,
  };
}

function loadRaid(data) {
  initRaid();
  if (!data) return;
  Game.raid.active       = !!data.active;
  Game.raid.startedDay   = data.startedDay | 0 || -1;
  Game.raid.targetBaseId = data.targetBaseId != null ? data.targetBaseId : null;
  Game.raid.targetX      = +data.targetX || 0;
  Game.raid.targetY      = +data.targetY || 0;
  Game.raid.spawnEdge    = data.spawnEdge || 'n';
  Game.raid.spawned      = data.spawned | 0;
  Game.raid.totalToSpawn = data.totalToSpawn | 0;
  Game.raid.bloodMoon    = !!data.bloodMoon;
  Game.raid.queue        = Array.isArray(data.queue) ? data.queue.slice() : [];
  Game.raid.lastSpawnAt  = now();
  if (typeof data.nextRaidDay === 'number') Game.nextRaidDay = data.nextRaidDay;
}
