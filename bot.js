'use strict';

// Auto-pilot bot. Phase 1: read-only perception + debug overlay.
// Toggle with B. Console hook: window.bot.
//
// Loaded as a classic <script> after ui.js, so it shares the global lexical
// scope with the rest of the game (Game, World, NAV, Spatial, ctx, dist2,
// WEAPONS, ZOMBIES, DAY_PHASES, input, ...). render() is a function
// declaration, so it lives on window and can be monkey-patched.

const Bot = {
  enabled: false,
  state: {
    phase: 'day',
    secondsToDusk: 0,
    nearestThreat: null,
    threatCount: 0,
    losToTarget: false,
    nearestChests: [],
    nearestPickups: [],
    aimX: 0, aimY: 0,    // world-space lead-aim point
    firing: false,
    fireReason: '',      // why fire decision came out true/false
    nearbyZombies: [],   // sorted by distance, used by steering
    moveX: 0, moveY: 0,  // steering force vector (world units, not normalized)
    standoff: 280,       // preferred distance from target for current weapon
  },
  // Keys we asked the game to hold down on the previous frame. We only ever
  // touch these — the human's other keypresses are left alone — and we diff
  // against this set so we don't leak presses when we change our mind.
  _heldKeys: new Set(),
};

function botPhaseLengthByName(name) {
  for (let i = 0; i < DAY_PHASES.length; i++) {
    if (DAY_PHASES[i].name === name) return DAY_PHASES[i].length;
  }
  return 0;
}

// Seconds remaining until the next 'dusk' phase begins. The cycle order is
// day -> dusk -> night -> dawn, so the answer depends on where we are in it.
function botSecondsToDusk() {
  const t = Game.time.t;
  let acc = 0;
  for (let i = 0; i < DAY_PHASES.length; i++) {
    const ph = DAY_PHASES[i];
    if (ph.name === 'dusk') {
      if (t <= acc) return acc - t;
      // already past dusk this day; report time to next day's dusk
    }
    acc += ph.length;
  }
  // Past dusk: time = remainder of cycle + dusk-start offset of next day
  const cycle = DAY_LENGTH;
  let duskStart = 0;
  for (let i = 0; i < DAY_PHASES.length; i++) {
    if (DAY_PHASES[i].name === 'dusk') break;
    duskStart += DAY_PHASES[i].length;
  }
  return (cycle - t) + duskStart;
}

// Vision model: the bot can only "see" what's currently inside the viewport,
// and zombies further require an unobstructed line of sight (cover behind a
// wall hides them). This caps the bot's perception to roughly what a human
// player sees through the screen.
//
// VIEW_MARGIN extends the viewport slightly so entities right at the edge
// aren't lost when the player twitches; positive margin == more generous.
const BOT_VIEW_MARGIN = 8;
// Spatial.query radius prefilter — viewport diagonal is sqrt(1024^2+768^2)
// ≈ 1280, but the player sits near the center most of the time so a tighter
// 700 prefilter is enough; the viewport check below is the source of truth.
const BOT_QUERY_RADIUS = 720;

function _botInView(x, y) {
  const vx = x - Game.camera.x, vy = y - Game.camera.y;
  return vx >= -BOT_VIEW_MARGIN && vy >= -BOT_VIEW_MARGIN
      && vx <= VIEW_W + BOT_VIEW_MARGIN
      && vy <= VIEW_H + BOT_VIEW_MARGIN;
}

Bot.perceive = function () {
  const p = Game.player;
  if (!p || p.dead) return;
  const st = this.state;

  st.phase = Game.time.phase;
  st.secondsToDusk = botSecondsToDusk();

  // Zombies: must be inside the viewport AND have unobstructed LOS from the
  // player. The spatial hash gives us a cheap prefilter; the viewport + LOS
  // checks gate everything we actually "see".
  const scan = Spatial.query(p.x, p.y, BOT_QUERY_RADIUS, []);
  const zs = [];
  for (let i = 0; i < scan.length; i++) {
    const e = scan[i];
    if (!e || typeof e.hp !== 'number' || !e.type || !ZOMBIES[e.type]) continue;
    if (!_botInView(e.x, e.y)) continue;
    if (!NAV.hasLOS(p.x, p.y, e.x, e.y)) continue;
    zs.push(e);
  }
  zs.sort((a, b) => dist2(a, p) - dist2(b, p));
  st.threatCount = zs.length;
  st.nearbyZombies = zs;

  // Target = nearest visible zombie. Since the visibility filter already
  // required LOS, the first entry is by definition shootable; the losToTarget
  // flag stays for downstream consumers that read it.
  const target = zs.length ? zs[0] : null;
  st.nearestThreat = target;
  st.losToTarget = !!target;

  // Chests: visible if on-screen (no LOS gate; you can spot a chest behind
  // partial cover). Active-chest iteration is bounded to the active region,
  // but the viewport is much smaller, so filter explicitly.
  const chests = [];
  World.forEachActiveChest(p.x, p.y, (c) => {
    if (c.opened) return;
    const cx = c.x + c.w / 2;
    const cy = c.y + c.h / 2;
    if (!_botInView(cx, cy)) return;
    const dx = cx - p.x, dy = cy - p.y;
    chests.push({ c, cx, cy, d2: dx * dx + dy * dy });
  });
  chests.sort((a, b) => a.d2 - b.d2);
  st.nearestChests = chests.slice(0, 6);

  // Pickups: visible if on-screen.
  const pickups = [];
  const allPickups = Game.pickups || [];
  for (let i = 0; i < allPickups.length; i++) {
    const pk = allPickups[i];
    if (!_botInView(pk.x, pk.y)) continue;
    pickups.push(pk);
  }
  pickups.sort((a, b) => dist2(a, p) - dist2(b, p));
  st.nearestPickups = pickups.slice(0, 8);
};

Bot.draw = function () {
  if (!this.enabled) return;
  if (Game.mode !== 'playing') return;
  const p = Game.player;
  if (!p || p.dead) return;
  const cam = Game.camera;
  const st = this.state;

  ctx.save();

  // Threat ring around player (200px reference).
  ctx.strokeStyle = 'rgba(226,80,80,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(p.x - cam.x, p.y - cam.y, 200, 0, Math.PI * 2);
  ctx.stroke();

  // Standoff ring (cyan): preferred distance for current weapon.
  ctx.strokeStyle = 'rgba(120,210,230,0.25)';
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.arc(p.x - cam.x, p.y - cam.y, st.standoff, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Steering vector arrow.
  const mvm = Math.hypot(st.moveX, st.moveY);
  if (mvm > 8) {
    const k = Math.min(80, mvm) / mvm;
    const ex = p.x - cam.x + st.moveX * k * 0.8;
    const ey = p.y - cam.y + st.moveY * k * 0.8;
    ctx.strokeStyle = '#7ad97a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x - cam.x, p.y - cam.y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.fillStyle = '#7ad97a';
    ctx.beginPath();
    ctx.arc(ex, ey, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  // Outer perception ring (700px).
  ctx.strokeStyle = 'rgba(120,150,180,0.18)';
  ctx.beginPath();
  ctx.arc(p.x - cam.x, p.y - cam.y, 700, 0, Math.PI * 2);
  ctx.stroke();

  // Target line + ring + lead-aim marker.
  if (st.nearestThreat) {
    const t = st.nearestThreat;
    ctx.strokeStyle = st.losToTarget ? '#5be3a4' : '#e3a83a';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(p.x - cam.x, p.y - cam.y);
    ctx.lineTo(t.x - cam.x, t.y - cam.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = '#ff6464';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(t.x - cam.x, t.y - cam.y, (t.r || 12) + 5, 0, Math.PI * 2);
    ctx.stroke();
    // Lead-aim crosshair (where the bot is actually pointing).
    ctx.strokeStyle = st.firing ? '#ffea64' : '#9aa0a8';
    ctx.lineWidth = 1.5;
    const ax = st.aimX - cam.x, ay = st.aimY - cam.y;
    ctx.beginPath();
    ctx.moveTo(ax - 7, ay); ctx.lineTo(ax + 7, ay);
    ctx.moveTo(ax, ay - 7); ctx.lineTo(ax, ay + 7);
    ctx.stroke();
  }

  // Chest markers (top 3).
  ctx.fillStyle = 'rgba(91,227,164,0.55)';
  ctx.strokeStyle = 'rgba(91,227,164,0.9)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < st.nearestChests.length && i < 3; i++) {
    const ch = st.nearestChests[i];
    ctx.beginPath();
    ctx.arc(ch.cx - cam.x, ch.cy - cam.y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // Pickup markers (top 5, small).
  ctx.fillStyle = 'rgba(120,200,255,0.7)';
  for (let i = 0; i < st.nearestPickups.length && i < 5; i++) {
    const pk = st.nearestPickups[i];
    ctx.beginPath();
    ctx.arc(pk.x - cam.x, pk.y - cam.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();

  // Screen-space text panel.
  ctx.save();
  ctx.font = '12px "JetBrains Mono", ui-monospace, monospace';
  ctx.textBaseline = 'top';
  const lines = [
    `BOT v0.4  [B to toggle]  ENABLED  (aim+fire+move, vision=viewport+LOS)`,
    `day=${Game.time.day}  phase=${st.phase}  ->dusk=${st.secondsToDusk.toFixed(1)}s`,
    `hp=${Math.round(p.hp)}/${p.maxHp}  weapon=${p.weapon}  walls=${p.ammo.wall.reserve}`,
    `visible threats=${st.threatCount}  target=${st.nearestThreat ? st.nearestThreat.type : 'none'}`,
    `firing=${st.firing}  reason=${st.fireReason}`,
    `chests=${st.nearestChests.length}  pickups=${st.nearestPickups.length}`,
  ];
  const w = 280, h = 14 * lines.length + 12;
  ctx.fillStyle = 'rgba(7,8,10,0.78)';
  ctx.fillRect(8, 8, w, h);
  ctx.strokeStyle = 'rgba(210,75,53,0.7)';
  ctx.strokeRect(8.5, 8.5, w - 1, h - 1);
  ctx.fillStyle = '#e8e6df';
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 16, 14 + i * 14);
  }
  ctx.restore();
};

// Preferred standoff distance per weapon (px). Driven by weapon range/AoE
// and bullet speed — shotguns want to be close, rockets far, pistol/SMG mid.
const BOT_STANDOFF = {
  pistol: 280, smg: 240, shotgun: 140, rocket: 480, barrel: 220, wall: 220,
};

// Compute a desired steering vector in world units. Sum of:
//  - per-zombie inverse-distance repulsion (panic zone + standoff backoff),
//  - perpendicular strafe past the target while firing (kite),
//  - repulsion from NAV-blocked cells (obstacles + player walls),
//  - repulsion from the world boundary.
// Returns {dx, dy}; caller maps to WASD via 8-way thresholds.
Bot._steer = function (p) {
  let dx = 0, dy = 0;
  const st = this.state;
  const zs = st.nearbyZombies;
  const standoff = BOT_STANDOFF[p.weapon] || 250;
  st.standoff = standoff;
  const lowHp = p.hp < 35;

  // Repel from every nearby zombie. Two regimes:
  //   d < 100  : panic — strong push, scales with how close they are.
  //   d < standoff : gentle backoff to maintain weapon's comfort range.
  for (let i = 0; i < zs.length; i++) {
    const z = zs[i];
    const rdx = p.x - z.x, rdy = p.y - z.y;
    const d = Math.hypot(rdx, rdy);
    if (d < 1) continue;
    const ux = rdx / d, uy = rdy / d;
    // Heavier weight for fast zombies (runners) and tanks (big damage).
    const tw = z.type === 'runner' ? 1.4 : (z.type === 'tank' ? 1.3 : 1.0);
    if (d < 100) {
      const k = (100 - d) * 6 * tw;
      dx += ux * k; dy += uy * k;
    } else if (d < standoff) {
      const k = (standoff - d) * 0.5 * tw;
      dx += ux * k; dy += uy * k;
    }
  }
  if (lowHp) { dx *= 1.8; dy *= 1.8; }

  // Strafe: while firing, move perpendicular to the target so we drift across
  // the zombie's approach line instead of letting it close on us. Pick whichever
  // side has open NAV cells.
  const t = st.nearestThreat;
  if (t && st.firing) {
    const tx = t.x - p.x, ty = t.y - p.y;
    const td = Math.hypot(tx, ty) || 1;
    const px = -ty / td, py = tx / td;   // 90deg rotation
    let side = 1;
    if (NAV.blocked && NAV.inWindow(p.x, p.y)) {
      const probe = NAV.cellSize * 1.5;
      const ax = p.x + px * probe, ay = p.y + py * probe;
      const bx = p.x - px * probe, by_ = p.y - py * probe;
      const aBlk = NAV.inWindow(ax, ay) && NAV.blocked[NAV.cy(ay) * NAV.cols + NAV.cx(ax)];
      const bBlk = NAV.inWindow(bx, by_) && NAV.blocked[NAV.cy(by_) * NAV.cols + NAV.cx(bx)];
      if (aBlk && !bBlk) side = -1;
      else if (!aBlk && bBlk) side = 1;
      else side = (Math.floor(Game.elapsed / 1.5) % 2) ? 1 : -1;
    }
    dx += px * 35 * side;
    dy += py * 35 * side;
  }

  // Avoid NAV-blocked cells around the bot (level obstacles + player walls).
  if (NAV.blocked && NAV.inWindow(p.x, p.y)) {
    const cs = NAV.cellSize, probe = 1.8;
    for (let oy = -1; oy <= 1; oy++) {
      for (let ox = -1; ox <= 1; ox++) {
        if (ox === 0 && oy === 0) continue;
        const sx = p.x + ox * cs * probe, sy = p.y + oy * cs * probe;
        if (!NAV.inWindow(sx, sy)) continue;
        if (NAV.blocked[NAV.cy(sy) * NAV.cols + NAV.cx(sx)]) {
          dx -= ox * 70; dy -= oy * 70;
        }
      }
    }
  }

  // World-edge repulsion (bot is way smaller than the 32k world but boundaries
  // still matter near the spawn corner of the map).
  const m = 120;
  if (p.x < m)             dx += (m - p.x) * 2;
  if (p.y < m)             dy += (m - p.y) * 2;
  if (WORLD_W - p.x < m)   dx -= (m - (WORLD_W - p.x)) * 2;
  if (WORLD_H - p.y < m)   dy -= (m - (WORLD_H - p.y)) * 2;

  return { dx, dy };
};

// Apply a desired key set, diffed against the previous frame. Bot only ever
// adds/removes keys it has previously claimed; anything the human is holding
// is left as-is.
Bot._applyKeys = function (want) {
  for (const k of this._heldKeys) {
    if (!want.has(k)) input.keys.delete(k);
  }
  for (const k of want) input.keys.add(k);
  this._heldKeys = want;
};

// Decide aim + fire + (optional) weapon switch / reload. Phase 2: no movement.
Bot.act = function () {
  const want = new Set();
  if (!this.enabled || Game.mode !== 'playing') {
    this._applyKeys(want);
    input.mouseDown = false;
    return;
  }
  const p = Game.player;
  if (!p || p.dead) {
    this._applyKeys(want);
    input.mouseDown = false;
    return;
  }
  const st = this.state;

  // If we're parked on a placer (wall/barrel), mouseDown does nothing useful.
  // Switch to pistol — always unlocked, infinite ammo — as the phase-2 default.
  if (WEAPONS[p.weapon].isPlacer) {
    want.add('1');
  }

  const target = st.nearestThreat;
  if (!target) {
    // Still steer — there may be off-LOS zombies worth fleeing.
    st.firing = false;
    st.fireReason = 'no-target';
    input.mouseDown = false;
    Bot._mapSteerToKeys(p, want);
    this._applyKeys(want);
    return;
  }

  const weap = WEAPONS[p.weapon];

  // Lead the shot using zombie velocity and bullet travel time. Pistol bullets
  // are very fast (900 u/s) so the lead is small, but it matters for runners.
  const dx0 = target.x - p.x, dy0 = target.y - p.y;
  const dist = Math.hypot(dx0, dy0);
  const bulletSpd = weap.bulletSpeed || 900;
  const ttHit = dist / bulletSpd;
  const aimX = target.x + (target.vx || 0) * ttHit;
  const aimY = target.y + (target.vy || 0) * ttHit;
  st.aimX = aimX; st.aimY = aimY;

  // Write aim into viewport coords (game converts back to world via camera).
  input.mouseX = aimX - Game.camera.x;
  input.mouseY = aimY - Game.camera.y;

  // Fire gating.
  const inRange = dist <= (weap.bulletRange || 900) * 0.95;
  const losClear = st.losToTarget;   // already computed in perceive()
  // Don't blow ourselves up with our own rocket.
  const safeAoE = !weap.isRocket || dist > (weap.explodeRadius + 60);
  const ready = p.fireCd <= 0 && p.reloading <= 0;
  const a = p.ammo[p.weapon];
  const hasShot = a && (a.mag > 0 || weap.magSize === Infinity);

  let shouldFire = inRange && losClear && safeAoE && hasShot;

  // Hold 'r' to start a reload during a lull (mag below half and no immediate
  // threat in range). The game already auto-reloads on empty mag.
  if (weap.magSize !== Infinity && a && a.reserve > 0 && a.mag < weap.magSize / 2 && !inRange && p.reloading <= 0) {
    want.add('r');
  }

  st.firing = shouldFire;
  st.fireReason = shouldFire
    ? 'fire'
    : !inRange ? 'out-of-range'
      : !losClear ? 'no-los'
        : !safeAoE ? 'rocket-self'
          : !hasShot ? 'empty'
            : 'cooldown';

  input.mouseDown = shouldFire;
  Bot._mapSteerToKeys(p, want);
  this._applyKeys(want);
};

// Map a steering vector to 8-way WASD presses. The 0.35 threshold prevents
// jitter when the vector is nearly axis-aligned.
Bot._mapSteerToKeys = function (p, want) {
  const { dx, dy } = this._steer(p);
  this.state.moveX = dx; this.state.moveY = dy;
  const m = Math.hypot(dx, dy);
  if (m < 8) return;
  const nx = dx / m, ny = dy / m;
  if (nx >  0.35) want.add('d');
  if (nx < -0.35) want.add('a');
  if (ny >  0.35) want.add('s');
  if (ny < -0.35) want.add('w');
};

Bot.start  = function () { this.enabled = true;  };
Bot.stop   = function () {
  this.enabled = false;
  // Release any keys/buttons we were holding so the human regains control.
  this._applyKeys(new Set());
  input.mouseDown = false;
};
Bot.toggle = function () { if (this.enabled) this.stop(); else this.start(); };

window.bot = Bot;

// B toggles. Don't preventDefault — game already ignores B.
window.addEventListener('keydown', (e) => {
  if (e.key && e.key.toLowerCase() === 'b' && Game.mode === 'playing') {
    Bot.toggle();
  }
});

// Hook the render pass so the overlay paints over the game frame.
// render is a top-level function declaration in render.js, so it lives on
// window; reassigning here redirects the bare render() call in ui.js#loop.
(function patchRender() {
  const orig = window.render;
  if (typeof orig !== 'function') {
    console.warn('[bot] window.render not found; overlay will not draw.');
    return;
  }
  window.render = function (alpha) {
    orig(alpha);
    try {
      Bot.perceive();
      Bot.act();
      Bot.draw();
    } catch (err) {
      console.error('[bot] perceive/act/draw failed:', err);
    }
  };
})();
