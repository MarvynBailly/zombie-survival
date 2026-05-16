'use strict';

// ---------- DOM helpers ----------
const $ = sel => document.querySelector(sel);
const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'style') e.style.cssText = attrs[k];
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
    else e.setAttribute(k, attrs[k]);
  }
  for (const c of children) {
    if (c == null) continue;
    if (typeof c === 'string') e.appendChild(document.createTextNode(c));
    else e.appendChild(c);
  }
  return e;
};

// ---------- Canvas ----------
const canvas = $('#game');
const ctx = canvas.getContext('2d');
// Disable smoothing on all drawImage calls so cached chunk surfaces blit
// pixel-perfect, matching the canvas's CSS `image-rendering: pixelated`.
ctx.imageSmoothingEnabled = false;
function fitCanvas() {
  const w = window.innerWidth, h = window.innerHeight;
  const scale = Math.min(w / VIEW_W, h / VIEW_H);
  canvas.width = VIEW_W; canvas.height = VIEW_H;
  canvas.style.width = (VIEW_W * scale) + 'px';
  canvas.style.height = (VIEW_H * scale) + 'px';
}
window.addEventListener('resize', fitCanvas);
fitCanvas();

// ---------- Input ----------
const input = {
  keys: new Set(),
  mouseX: 0, mouseY: 0,
  mouseDown: false,
  // world-space mouse (set each frame)
  wx: 0, wy: 0,
};
window.addEventListener('keydown', e => {
  input.keys.add(e.key.toLowerCase());
  if (['w','a','s','d','r','e',' ','escape',
       '1','2','3','4','5','6','7','8','9','0','-','='].includes(e.key.toLowerCase())) {
    e.preventDefault();
  }
});
window.addEventListener('keyup', e => {
  input.keys.delete(e.key.toLowerCase());
});
canvas.addEventListener('mousemove', e => {
  const r = canvas.getBoundingClientRect();
  input.mouseX = (e.clientX - r.left) * (VIEW_W / r.width);
  input.mouseY = (e.clientY - r.top) * (VIEW_H / r.height);
});
canvas.addEventListener('mousedown', e => { if (e.button === 0) { input.mouseDown = true; Audio.ensure(); } });
window.addEventListener('mouseup', e => { if (e.button === 0) input.mouseDown = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());

// ---------- Game State ----------
const Game = {
  mode: 'menu',      // menu | levelSelect | playing | paused | gameover | leaderboard | controls
  level: null,
  player: null,
  zombies: [],
  bullets: [],
  pickups: [],
  particles: [],
  barrels: [],
  walls: [],
  rockets: [],
  explosions: [],
  // Day/night state. day counts up, t is seconds elapsed in current day,
  // phase is one of DAY_PHASES.name. spawnTimer paces zombie spawns.
  time: { day: 1, t: 0, phase: 'day' },
  spawnTimer: 0,
  kills: 0,
  score: 0,
  weaponKills: {}, // pistol: N, shotgun: N...
  startTime: 0,
  elapsed: 0,
  camera: { x: 0, y: 0 },
  bannerText: '',
  bannerUntil: 0,
  notice: '',
  noticeUntil: 0,
  scoreSubmitted: false,
  // Zones the player has visited (chunk that overlaps a POI) — drives compass
  // dimming and is persisted in saves.
  discoveredPOIs: new Set(),
  // Chunks the player has been within 1 chunk of — drives the fullscreen
  // world map (press M). Persisted across save/load.
  exploredChunks: new Set(),
  // Toggled by M while playing; render() draws the world map overlay.
  mapOpen: false,
};

function resetRun(levelIndex) {
  Game.level = LEVELS[levelIndex];
  Game.levelIndex = levelIndex;
  Game.zombies = [];
  Game.bullets = [];
  Game.pickups = [];
  Game.particles = [];
  Game.barrels = [];
  Game.walls = [];
  Game.rockets = [];
  Game.explosions = [];
  Game.time = { day: 1, t: 0, phase: 'day' };
  Game.spawnTimer = 0;
  Game.kills = 0;
  Game.score = 0;
  Game.weaponKills = { pistol: 0, shotgun: 0, smg: 0, rocket: 0, barrel: 0 };
  Game.discoveredPOIs = new Set();
  Game.exploredChunks = new Set();
  Game.mapOpen = false;
  Game.startTime = now();
  Game.elapsed = 0;
  Game.scoreSubmitted = false;
  // Seed the open world with this run's terrain region preset.
  World.init(Date.now() & 0x7fffffff, Game.level.region);
  // spawn player at world center
  Game.player = {
    x: World.spawnX, y: World.spawnY, r: 12,
    vx: 0, vy: 0, angle: 0,
    hp: 100, maxHp: 100, iframe: 0,
    weapon: 'pistol',
    unlocked: {
      pistol: true, shotgun: false, smg: false, rocket: false,
      barrel: false, wall: true,
      crossbow: false, flamer: false, minigun: false,
      railgun: false, gl: false, saw: false,
    },
    ammo: {
      pistol: { mag: Infinity, reserve: Infinity },
      shotgun: { mag: 0, reserve: 0 },
      smg: { mag: 0, reserve: 0 },
      rocket: { mag: 0, reserve: 0 },
      barrel: { mag: 0, reserve: 0 },
      wall: { mag: 1, reserve: WALL_INITIAL },
      crossbow: { mag: 0, reserve: 0 },
      flamer:   { mag: 0, reserve: 0 },
      minigun:  { mag: 0, reserve: 0 },
      railgun:  { mag: 0, reserve: 0 },
      gl:       { mag: 0, reserve: 0 },
      saw:      { mag: Infinity, reserve: Infinity }, // melee weapon
    },
    fireCd: 0, reloading: 0, placeCd: 0, openCd: 0,
    walkPhase: 0, muzzleFlash: 0,
    dead: false,
    // Expansion weapon state — used by tier-3 fireWeapon branches.
    minigunSpin: 0,    // seconds the trigger has been held with the minigun
    railCharge: 0,     // seconds the trigger has been held with the railgun
    chilledUntil: 0,   // performance.now()/1000 timestamp; <= now means no chill
    chillMult: 1,      // movement multiplier while chilled
  };
  World.ensureActive(Game.player.x, Game.player.y);
  Game.camera.x = Game.player.x - VIEW_W / 2;
  Game.camera.y = Game.player.y - VIEW_H / 2;
  NAV.init();
  setBanner(`DAY 1 · ${Game.level.name}`, 2);
  setNotice(`Scavenge by day, survive by night. Press E to open chests.`, 5);
}

// Restore a saved game on top of a freshly reset run. Caller has already
// called resetRun(levelIndex), which seeded a fresh world. This patches the
// world seed/biome to the saved one, regenerates from there, and overlays
// player + chest + walls + barrels state.
function restoreFromSave(d) {
  // Re-seed the world to the saved one. d.regionName (or legacy d.biome) is a
  // region name string; resolve it against LEVELS, falling back to the saved
  // levelIndex's region if the name is unknown.
  const lv = LEVELS[d.levelIndex] || LEVELS[0];
  const region = LEVELS.find(l => l.region && l.region.name === (d.regionName || d.biome))?.region
              || lv.region;
  World.init(d.seed, region);
  Game.levelIndex = d.levelIndex;
  Game.level = lv;

  Game.time = { day: d.time.day, t: d.time.t, phase: d.time.phase };
  Game.elapsed = d.elapsed || 0;
  Game.kills = d.kills || 0;
  Game.score = d.score || 0;
  Game.weaponKills = d.weaponKills || { pistol: 0, shotgun: 0, smg: 0, rocket: 0, barrel: 0 };

  // Player
  const p = Game.player;
  p.x = d.player.x; p.y = d.player.y;
  p.hp = d.player.hp;
  p.weapon = d.player.weapon || 'pistol';
  p.unlocked = { ...p.unlocked, ...d.player.unlocked };
  for (const k in d.player.ammo) {
    if (!p.ammo[k]) continue;
    const a = d.player.ammo[k];
    p.ammo[k].mag = a.mag === -1 ? Infinity : a.mag;
    p.ammo[k].reserve = a.reserve === -1 ? Infinity : a.reserve;
  }

  // World contents
  Game.walls = (d.walls || []).map(w => ({ ...w }));
  Game.barrels = (d.barrels || []).map(b => ({
    x: b.x, y: b.y, r: 14, hp: b.hp != null ? b.hp : 30, ignited: false, igniteT: 0,
  }));

  // Active chunks first, then apply chest overrides.
  World.ensureActive(p.x, p.y);
  for (const ov of (d.chestOverrides || [])) {
    const chunk = World.chunks.get(ov.k);
    if (!chunk) continue;
    const c = chunk.chests[ov.i];
    if (!c) continue;
    c.opened = !!ov.op;
    c.hp = ov.hp;
  }
  // Re-flag chunks that had already fired their encounter spawn so we don't
  // double-spawn the garrison on resume.
  for (const k of (d.activatedChunks || [])) {
    const chunk = World.chunks.get(k);
    if (chunk) chunk.activated = true;
  }
  Game.discoveredPOIs = new Set(d.discoveredPOIs || []);
  Game.exploredChunks = new Set(d.exploredChunks || []);
  Game.mapOpen = false;

  // Camera + NAV need a refresh now that we've moved the player.
  Game.camera.x = p.x - VIEW_W / 2;
  Game.camera.y = p.y - VIEW_H / 2;
  NAV.init();
  setBanner(`RESUMED · DAY ${Game.time.day}`, 2);
}

function setBanner(text, secs) {
  Game.bannerText = text;
  Game.bannerUntil = now() + secs;
}
function setNotice(text, secs = 2) {
  Game.notice = text;
  Game.noticeUntil = now() + secs;
}

// ---------- Day / Night cycle ----------
// Phase resolution: returns the current phase descriptor based on Game.time.t.
function currentPhase() {
  let acc = 0;
  for (const p of DAY_PHASES) {
    if (Game.time.t < acc + p.length) {
      return { ...p, start: acc, progress: (Game.time.t - acc) / p.length };
    }
    acc += p.length;
  }
  // Shouldn't happen — fall through to last phase.
  const last = DAY_PHASES[DAY_PHASES.length - 1];
  return { ...last, start: DAY_LENGTH - last.length, progress: 1 };
}

// Picks a zombie type for the current day/phase. Mix gets nastier as days pass.
// Stationary types (cluster, hivesac, shrieker, mimic) are intentionally
// absent — those are placed by world-gen / wave events, not edge-spawned.
function pickZombieType(phase, day) {
  const r = Math.random();
  if (phase === 'day') {
    if (day >= 1 && r < 0.20) return 'crawler';
    return 'walker';
  }
  if (phase === 'dawn') return 'walker';
  // dusk + night
  if (day >= 20 && r < 0.005) return 'cent';
  if (day >= 15 && r < 0.020) return 'brood';
  if (day >= 11 && r < 0.05)  return 'reaper';
  if (day >= 11 && r < 0.08)  return 'charger';
  if (day >= 11 && r < 0.10)  return 'necro';
  if (day >= 8  && r < 0.13)  return 'twins';
  if (day >= 7  && r < 0.16)  return 'riot';
  if (day >= 7  && r < 0.19)  return 'wraith';
  if (day >= 7  && r < 0.22)  return 'spitter';
  if (day >= 5  && r < 0.25)  return 'stalker';
  if (day >= 4  && r < 0.28)  return 'bomber';
  if (day >= 4  && r < 0.31)  return 'frost';
  if (day >= 3  && r < 0.34)  return 'screamer';
  if (day >= 4  && r < 0.38)  return 'fire';
  if (day >= 2  && r < 0.46)  return 'tank';
  if (day >= 1  && r < 0.56)  return 'runner';
  if (day >= 1  && r < 0.66)  return 'crawler';
  if (day >= 1  && r < 0.74)  return 'hatch';
  return 'walker';
}

// Spawn-rate target: zombies per second. Light by day, fierce at night.
function targetSpawnRate(phase, day) {
  if (phase === 'day') return 0.12;            // ~1 zombie every 8s
  if (phase === 'dawn') return 0;
  if (phase === 'dusk') return 0.4 + day * 0.06;
  if (phase === 'night') return Math.min(2.6, 0.7 + day * 0.18);
  return 0;
}

// Population cap per phase — once on screen, the director stops adding more
// until some die. Keeps perf bounded even on long survival runs.
function targetPopulation(phase, day) {
  if (phase === 'day') return 5;
  if (phase === 'dusk') return 20 + day * 4;
  if (phase === 'night') return Math.min(180, 40 + day * 12);
  return 0;
}

// Per-day zombie hp/damage scaling.
function dayHpScale() { return 1 + (Game.time.day - 1) * 0.08; }
function dayDmgScale() { return 1 + (Game.time.day - 1) * 0.05; }

// Weapons start locked; the first ammo pickup of that type unlocks it. This
// is the primary acquisition path now (chests + zombie drops).
function unlockWeapon(key, reserve, notice) {
  const p = Game.player;
  p.unlocked[key] = true;
  const w = WEAPONS[key];
  if (w.magSize === Infinity) {
    p.ammo[key].mag = Infinity;
    p.ammo[key].reserve = Infinity;
  } else {
    p.ammo[key].mag = w.magSize;
    p.ammo[key].reserve = reserve;
  }
  setNotice(notice, 3);
  Audio.sfx.pickup();
}

function advanceDayPhase(prevPhase, newPhase) {
  if (newPhase === 'dusk') {
    setBanner(`DUSK FALLS — Day ${Game.time.day}`, 2);
    Audio.sfx.wave();
  } else if (newPhase === 'night') {
    setBanner(`NIGHT — survive!`, 2.2);
    Audio.sfx.dead(); // low ominous tone
  } else if (newPhase === 'dawn') {
    setBanner(`DAWN — Day ${Game.time.day} ends`, 2);
  } else if (newPhase === 'day') {
    Game.time.day += 1;
    setBanner(`DAY ${Game.time.day}`, 2);
    Audio.sfx.wave();
  }
}

function updateDayCycle(dt) {
  const t = Game.time;
  const prev = currentPhase();
  t.t += dt;
  if (t.t >= DAY_LENGTH) { t.t -= DAY_LENGTH; }
  const cur = currentPhase();
  if (cur.name !== prev.name || cur.name !== t.phase) {
    t.phase = cur.name;
    advanceDayPhase(prev.name, cur.name);
  }

  // Spawn director: pace by rate, capped by population.
  const rate = targetSpawnRate(t.phase, t.day);
  const cap = targetPopulation(t.phase, t.day);
  if (rate > 0 && Game.zombies.length < cap) {
    Game.spawnTimer -= dt;
    if (Game.spawnTimer <= 0) {
      spawnZombieAtEdge(pickZombieType(t.phase, t.day));
      Game.spawnTimer = 1 / rate * (0.7 + Math.random() * 0.6);
    }
  } else {
    Game.spawnTimer = Math.max(0, Game.spawnTimer);
  }

  // During dawn, suspend any zombies that drift outside the active region.
  if (t.phase === 'dawn') {
    const span = (ACTIVE_RADIUS + 1) * CHUNK_SIZE;
    for (let i = Game.zombies.length - 1; i >= 0; i--) {
      const z = Game.zombies[i];
      if (Math.abs(z.x - Game.player.x) > span || Math.abs(z.y - Game.player.y) > span) {
        Game.zombies.splice(i, 1);
      }
    }
  }
}

// Build a zombie instance from a ZOMBIES def — spreads every behavior flag
// onto the instance so tier-3 logic (ranged, charge, segments, …) can read
// them per-zombie. Adds per-instance timer state (fireCd, chargeState, …).
function buildZombieInstance(type, x, y) {
  const def = ZOMBIES[type];
  if (!def) return null;
  const hpMul = dayHpScale();
  const dmgMul = dayDmgScale();
  const hp = (def.hp || 1) * hpMul;
  return {
    // Inherit every flag declared on the def (ranged, range, fireCooldown,
    // charge, ignoresWalls, etc.). We then override the live fields.
    ...def,
    type, x, y,
    r: def.radius, hp, maxHp: hp,
    speed: def.speed,
    damage: def.damage * dmgMul,
    color: def.color, score: def.score,
    isFire: def.isFire || false,
    onFire: 0,
    hitCd: 0, stunned: 0,
    vx: 0, vy: 0,
    angle: 0, walkPhase: Math.random(),
    // Per-instance timers / behavior state used by tier-3 code in
    // updateZombies / updateStationarySpawners.
    fireCd: def.fireCooldown ? def.fireCooldown * Math.random() : 0,
    spawnT: def.spawnInterval || 0,
    callT: def.callInterval || 0,
    walkSpawnT: def.spawnEvery || 0,
    raiseT: def.raiseInterval || 0,
    childrenAlive: 0,
    chargeState: 'idle', chargeT: 0, chargeCd: 0,
    chargeDx: 0, chargeDy: 0,
    mimicOpen: 0,
    // Centipede segments — `segments` is the live count (sprite reads it as
    // a number to know how many to draw). `segmentHps` is the parallel HP
    // array; segmentHps[0] is the head and absorbs damage first.
    segments:    def.segmented || 0,
    segmentHps:  def.segmented ? new Array(def.segmented).fill(def.segmentHp || 60) : null,
    // Bash-wall caching used by the existing nav code.
    bashWall: null, blocked: false,
  };
}

function spawnZombieAtEdge(type) {
  const def = ZOMBIES[type];
  // Stationary types shouldn't ever edge-spawn — they have speed 0 and would
  // just sit at the world boundary doing nothing.
  if (!def || def.stationary) return;
  const player = Game.player;
  // Spawn just inside the active-region perimeter so zombies enter from the
  // edges of the player's visible world, not the far world boundary.
  const span = (ACTIVE_RADIUS * 2 + 1) * CHUNK_SIZE;
  const halfSpan = span / 2;
  let x, y, tries = 0;
  do {
    const side = randi(0, 4);
    const along = rand(-halfSpan + 60, halfSpan - 60);
    const off = rand(40, 100);
    if (side === 0)      { x = player.x + along; y = player.y - halfSpan + off; }
    else if (side === 1) { x = player.x + along; y = player.y + halfSpan - off; }
    else if (side === 2) { x = player.x - halfSpan + off; y = player.y + along; }
    else                 { x = player.x + halfSpan - off; y = player.y + along; }
    x = clamp(x, 40, WORLD_W - 40);
    y = clamp(y, 40, WORLD_H - 40);
    tries++;
    if (tries > 20) break;
    // 820px ≈ camera diagonal (640px) + buffer, so edge-spawned zombies
    // never appear inside the viewport.
  } while (Math.hypot(x - player.x, y - player.y) < 820 || inObstacle(x, y, def.radius + 4));
  const z = buildZombieInstance(type, x, y);
  if (z) Game.zombies.push(z);
}

function inObstacle(x, y, r) {
  let hit = false;
  World.forEachObstacleNear(x, y, r + TILE_SIZE, (o) => {
    if (!hit && circleRectCollide(x, y, r, o.x, o.y, o.w, o.h)) hit = true;
  });
  return hit;
}

// ---------- Player update ----------
function updatePlayer(dt) {
  const p = Game.player;
  if (p.dead) return;

  let mx = 0, my = 0;
  if (input.keys.has('w')) my -= 1;
  if (input.keys.has('s')) my += 1;
  if (input.keys.has('a')) mx -= 1;
  if (input.keys.has('d')) mx += 1;
  if (mx || my) { const [nx, ny] = norm(mx, my); mx = nx; my = ny; }

  const speed = 220;
  p.vx = mx * speed; p.vy = my * speed;
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  // walk cycle + muzzle flash decay
  if (mx || my) p.walkPhase = (p.walkPhase + dt * 4) % 1;
  if (p.muzzleFlash > 0) p.muzzleFlash -= dt * 8;
  if (p.muzzleFlash < 0) p.muzzleFlash = 0;

  // collide with nearby obstacles + player-placed walls + un-opened chests.
  // Use the tight-radius query — a 40px obstacle can only collide within ~p.r+w.
  World.forEachObstacleNear(p.x, p.y, p.r + TILE_SIZE, (o) => resolveCircleRect(p, o));
  for (const w of Game.walls) resolveCircleRect(p, w);
  World.forEachActiveChest(p.x, p.y, (c) => { if (!c.opened) resolveCircleRect(p, c); });
  // Resolve out of overlapping zombies (other half is applied in updateZombies).
  // Spatial hash gives us a tight candidate set instead of iterating every zombie.
  const zNear = Spatial.query(p.x, p.y, p.r + 40, []);
  for (let i = 0; i < zNear.length; i++) {
    const z = zNear[i];
    const dxp = p.x - z.x, dyp = p.y - z.y;
    const dp = Math.hypot(dxp, dyp);
    const minD = p.r + z.r;
    if (dp > 0 && dp < minD) {
      const half = (minD - dp) * 0.5;
      p.x += (dxp / dp) * half;
      p.y += (dyp / dp) * half;
    }
  }
  // world bounds
  p.x = clamp(p.x, p.r, WORLD_W - p.r);
  p.y = clamp(p.y, p.r, WORLD_H - p.r);

  // aim
  const ang = Math.atan2((input.mouseY + Game.camera.y) - p.y, (input.mouseX + Game.camera.x) - p.x);
  p.angle = ang;
  input.wx = input.mouseX + Game.camera.x;
  input.wy = input.mouseY + Game.camera.y;

  // camera follow
  const targetCx = clamp(p.x - VIEW_W / 2, 0, WORLD_W - VIEW_W);
  const targetCy = clamp(p.y - VIEW_H / 2, 0, WORLD_H - VIEW_H);
  Game.camera.x = lerp(Game.camera.x, targetCx, 0.15);
  Game.camera.y = lerp(Game.camera.y, targetCy, 0.15);

  // iframes
  if (p.iframe > 0) p.iframe -= dt;

  // weapon switching — use each weapon's declared key, since slots beyond 9
  // need '-' and '=' (not 'String(i+1)', which would give '10', '11', '12').
  for (let i = 0; i < WEAPON_ORDER.length; i++) {
    const k = WEAPON_ORDER[i];
    const wDef = WEAPONS[k];
    if (!wDef || !wDef.key) continue;
    if (input.keys.has(wDef.key.toLowerCase())) {
      if (p.unlocked[k] && p.weapon !== k) {
        p.weapon = k;
        p.reloading = 0;
        p.fireCd = 0.1;
        Audio.sfx.click();
      }
    }
  }

  // reload
  if (input.keys.has('r')) {
    const w = WEAPONS[p.weapon];
    const a = p.ammo[p.weapon];
    if (w.magSize !== Infinity && p.reloading <= 0 && a.mag < w.magSize && a.reserve > 0) {
      p.reloading = w.reloadTime;
      Audio.sfx.reload();
    }
  }
  if (p.reloading > 0) {
    p.reloading -= dt;
    if (p.reloading <= 0) {
      const w = WEAPONS[p.weapon];
      const a = p.ammo[p.weapon];
      const need = w.magSize - a.mag;
      const taken = Math.min(need, a.reserve);
      a.mag += taken;
      a.reserve -= taken;
      p.reloading = 0;
    }
  }

  // shoot
  if (p.fireCd > 0) p.fireCd -= dt;
  if (p.placeCd > 0) p.placeCd -= dt;

  const weap = WEAPONS[p.weapon];
  if (weap.isPlacer) {
    // Space to place the active placer (barrel or wall)
    if (input.keys.has(' ') && p.placeCd <= 0) {
      if (p.weapon === 'barrel' && p.ammo.barrel.reserve > 0) {
        placeBarrel(p.x + Math.cos(p.angle) * 30, p.y + Math.sin(p.angle) * 30);
        p.ammo.barrel.reserve--;
        p.placeCd = 0.4;
      } else if (p.weapon === 'wall' && p.ammo.wall.reserve > 0) {
        placeWall();
        p.placeCd = WALL_PLACE_CD;
      } else {
        Audio.sfx.empty();
        p.placeCd = 0.3;
      }
    }
  } else {
    if (input.mouseDown && p.fireCd <= 0 && p.reloading <= 0) {
      const a = p.ammo[p.weapon];
      if (a.mag > 0) {
        fireWeapon(p, weap);
        p.fireCd = weap.fireRate;
        if (weap.magSize !== Infinity) a.mag--;
        // auto-reload if empty and reserve available
        if (weap.magSize !== Infinity && a.mag === 0 && a.reserve > 0) {
          p.reloading = weap.reloadTime;
          Audio.sfx.reload();
        }
      } else if (a.reserve > 0 && p.reloading <= 0) {
        p.reloading = weap.reloadTime;
        Audio.sfx.reload();
      } else {
        // empty click throttle
        if (p.fireCd <= 0) { Audio.sfx.empty(); p.fireCd = 0.3; }
      }
    }
  }

  // Space to place barrel when not on the barrel slot
  if (input.keys.has(' ') && !weap.isPlacer && p.placeCd <= 0 && p.unlocked.barrel && p.ammo.barrel.reserve > 0) {
    placeBarrel(p.x + Math.cos(p.angle) * 30, p.y + Math.sin(p.angle) * 30);
    p.ammo.barrel.reserve--;
    p.placeCd = 0.4;
  }

  // E to open the nearest unopened chest within range.
  if (input.keys.has('e') && p.openCd <= 0) {
    const chest = findChestNear(p.x, p.y, CHEST_PROMPT_RADIUS);
    if (chest) {
      openChest(chest);
      p.openCd = 0.4;
    }
  }
  if (p.openCd > 0) p.openCd -= dt;
}

function placeBarrel(x, y) {
  // validate position
  if (inObstacle(x, y, 14)) { setNotice('Can\'t place there', 1); return; }
  if (x < 20 || y < 20 || x > WORLD_W - 20 || y > WORLD_H - 20) { setNotice('Out of bounds', 1); return; }
  Game.barrels.push({ x, y, r: 14, hp: 30, ignited: false, igniteT: 0 });
  Audio.sfx.click();
}

// Snap a free-space point to the wall grid (cells at 0, WALL_SIZE, 2*WALL_SIZE, ...
// so the grid lines up with the map boundary on every side).
function wallSnapRect(worldX, worldY) {
  const cx = clamp(Math.floor(worldX / WALL_SIZE), 0, Math.floor(WORLD_W / WALL_SIZE) - 1);
  const cy = clamp(Math.floor(worldY / WALL_SIZE), 0, Math.floor(WORLD_H / WALL_SIZE) - 1);
  return { x: cx * WALL_SIZE, y: cy * WALL_SIZE, w: WALL_SIZE, h: WALL_SIZE };
}
function wallPlacementRect(p) {
  // snap to grid using a point ~40px in front of the player
  const ax = p.x + Math.cos(p.angle) * 40;
  const ay = p.y + Math.sin(p.angle) * 40;
  return wallSnapRect(ax, ay);
}
function isWallPlacementValid(rect) {
  if (rect.x < 0 || rect.y < 0 || rect.x + rect.w > WORLD_W || rect.y + rect.h > WORLD_H) return false;
  let hit = false;
  World.forEachActiveObstacle(rect.x + rect.w / 2, rect.y + rect.h / 2, (o) => {
    if (!hit && rect.x < o.x + o.w && rect.x + rect.w > o.x && rect.y < o.y + o.h && rect.y + rect.h > o.y) hit = true;
  });
  if (hit) return false;
  for (const w of Game.walls) {
    if (rect.x < w.x + w.w && rect.x + rect.w > w.x && rect.y < w.y + w.h && rect.y + rect.h > w.y) return false;
  }
  // don't drop a wall on the player or a zombie
  const p = Game.player;
  if (circleRectCollide(p.x, p.y, p.r, rect.x, rect.y, rect.w, rect.h)) return false;
  for (const z of Game.zombies) {
    if (circleRectCollide(z.x, z.y, z.r, rect.x, rect.y, rect.w, rect.h)) return false;
  }
  return true;
}
function placeWall() {
  const p = Game.player;
  if (p.ammo.wall.reserve <= 0) { setNotice('No walls left', 1); Audio.sfx.empty(); return; }
  const rect = wallPlacementRect(p);
  if (!isWallPlacementValid(rect)) { setNotice("Can't place there", 1); Audio.sfx.empty(); return; }
  Game.walls.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, hp: WALL_HP, maxHp: WALL_HP });
  p.ammo.wall.reserve--;
  Audio.sfx.click();
  NAV.markDirty();
}
// ---------- Chest interaction ----------
// Drop the chest's contents as pickups in a small ring, mark opened, kick
// some particles, replay click sfx.
function openChest(chest) {
  if (chest.opened) return;
  chest.opened = true;
  chest.hp = 0;
  Audio.sfx.pickup();
  const cx = chest.x + chest.w / 2;
  const cy = chest.y + chest.h / 2;
  const items = chest.contents || [];
  for (let i = 0; i < items.length; i++) {
    const a = (i / Math.max(1, items.length)) * Math.PI * 2 + Math.random() * 0.4;
    const r = 22 + Math.random() * 18;
    spawnPickup(cx + Math.cos(a) * r, cy + Math.sin(a) * r, items[i]);
  }
  // chunk debris
  const trim = (CHEST_TIER[chest.tier] || CHEST_TIER.wood).trim;
  for (let i = 0; i < 12; i++) {
    Game.particles.push({
      x: cx + rand(-chest.w / 2, chest.w / 2),
      y: cy + rand(-chest.h / 2, chest.h / 2),
      vx: rand(-180, 180), vy: rand(-220, -40),
      life: rand(0.4, 0.8), color: i % 2 ? trim : '#caa760', r: rand(2, 4),
    });
  }
}

// Returns the closest unopened chest within radius, or null.
function findChestNear(x, y, radius) {
  let best = null, bestD = radius * radius;
  World.forEachActiveChest(x, y, (c) => {
    if (c.opened) return;
    const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
    const dx = x - cx, dy = y - cy;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = c; }
  });
  return best;
}

// Particle palette for chipping/destroying world-gen obstacles. Keys match
// the breakable styles in OBSTACLE_HP.
function obstacleParticleColors(style) {
  switch (style) {
    case 'wood_wall': return ['#7a6238', '#3a2c18'];
    case 'brick_wall': return ['#6a3a30', '#4a261e'];
    case 'stone_wall': return ['#6e6e74', '#36363c'];
    case 'crate':      return ['#9a7e58', '#3a2e1f'];
    case 'fence':      return ['#5a4528', '#3a2c18'];
    default:           return ['#7a6238', '#3a2c18'];
  }
}

// Apply damage to a breakable world obstacle. Returns true if it was destroyed.
function damageObstacle(o, dmg, source) {
  if (!o.maxHp || o.dead) return false;
  o.hp -= dmg;
  if (o.hp <= 0) {
    destroyObstacle(o, source);
    return true;
  }
  return false;
}

function destroyObstacle(o, source) {
  o.dead = true;
  const [hi, lo] = obstacleParticleColors(o.style);
  for (let i = 0; i < 10; i++) {
    Game.particles.push({
      x: o.x + rand(0, o.w), y: o.y + rand(0, o.h),
      vx: rand(-160, 160), vy: rand(-180, -20),
      life: rand(0.4, 0.8), color: i % 2 ? hi : lo, r: rand(2, 4),
    });
  }
  Audio.sfx.hit();
  // Flow field must be rebuilt so zombies route through the new opening.
  NAV.markDirty();
}

function destroyWall(index, source) {
  const w = Game.walls[index];
  // chunk particles
  for (let i = 0; i < 10; i++) {
    Game.particles.push({
      x: w.x + rand(0, w.w), y: w.y + rand(0, w.h),
      vx: rand(-150, 150), vy: rand(-180, -20),
      life: rand(0.4, 0.8), color: i % 2 ? '#a07a3a' : '#5a4a2a', r: rand(2, 4),
    });
  }
  Audio.sfx.hit();
  Game.walls.splice(index, 1);
  NAV.markDirty();
}

function fireWeapon(p, weap) {
  Audio.sfx[weap.sfx]();
  p.muzzleFlash = 1;
  const muzzleX = p.x + Math.cos(p.angle) * (p.r + 4);
  const muzzleY = p.y + Math.sin(p.angle) * (p.r + 4);

  // muzzle flash particle
  for (let i = 0; i < 3; i++) {
    Game.particles.push({
      x: muzzleX, y: muzzleY,
      vx: Math.cos(p.angle) * rand(100, 300) + rand(-30, 30),
      vy: Math.sin(p.angle) * rand(100, 300) + rand(-30, 30),
      life: rand(0.05, 0.15), color: '#ffcc55', r: rand(2, 4),
    });
  }

  if (weap.isRocket) {
    Game.rockets.push({
      x: muzzleX, y: muzzleY,
      vx: Math.cos(p.angle) * weap.bulletSpeed,
      vy: Math.sin(p.angle) * weap.bulletSpeed,
      life: weap.bulletRange / weap.bulletSpeed,
      owner: 'player',
      explodeRadius: weap.explodeRadius,
      damage: weap.damage,
    });
    return;
  }

  for (let k = 0; k < weap.pellets; k++) {
    const ang = p.angle + (Math.random() - 0.5) * weap.spread * 2 * (weap.pellets > 1 ? 1 : 1);
    Game.bullets.push({
      x: muzzleX, y: muzzleY,
      vx: Math.cos(ang) * weap.bulletSpeed,
      vy: Math.sin(ang) * weap.bulletSpeed,
      life: weap.bulletRange / weap.bulletSpeed,
      damage: weap.damage,
      owner: 'player',
      weapon: p.weapon,
    });
  }
}

// ---------- Bullets ----------
function updateBullets(dt) {
  outer: for (let i = Game.bullets.length - 1; i >= 0; i--) {
    const b = Game.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (b.life <= 0) { Game.bullets.splice(i, 1); continue; }
    // obstacle hit — narrow query around the bullet. Breakable obstacles take damage.
    let obstacleHit = null;
    World.forEachObstacleNear(b.x, b.y, TILE_SIZE, (o) => {
      if (!obstacleHit && circleRectCollide(b.x, b.y, 1, o.x, o.y, o.w, o.h)) obstacleHit = o;
    });
    if (obstacleHit) {
      if (obstacleHit.maxHp) damageObstacle(obstacleHit, b.damage, 'bullet');
      spawnSpark(b.x, b.y);
      Game.bullets.splice(i, 1);
      continue outer;
    }
    // wall hit (player-placed)
    for (let j = Game.walls.length - 1; j >= 0; j--) {
      const w = Game.walls[j];
      if (circleRectCollide(b.x, b.y, 1, w.x, w.y, w.w, w.h)) {
        w.hp -= b.damage;
        spawnSpark(b.x, b.y);
        Game.bullets.splice(i, 1);
        if (w.hp <= 0) destroyWall(j, 'bullet');
        continue outer;
      }
    }
    // chest hit (player can shoot chests open)
    let chestHit = null;
    World.forEachActiveChest(b.x, b.y, (c) => {
      if (!chestHit && !c.opened && circleRectCollide(b.x, b.y, 1, c.x, c.y, c.w, c.h)) chestHit = c;
    });
    if (chestHit) {
      chestHit.hp -= b.damage;
      spawnSpark(b.x, b.y);
      Game.bullets.splice(i, 1);
      if (chestHit.hp <= 0) openChest(chestHit);
      continue outer;
    }
    // zombie hit (spatial hash query around the bullet)
    const nearZ = Spatial.query(b.x, b.y, 24, []);
    for (let j = 0; j < nearZ.length; j++) {
      const z = nearZ[j];
      const dx = b.x - z.x, dy = b.y - z.y;
      if (dx*dx + dy*dy < z.r * z.r) {
        damageZombie(z, b.damage, b.weapon);
        spawnBlood(b.x, b.y, Math.atan2(b.vy, b.vx));
        Game.bullets.splice(i, 1);
        continue outer;
      }
    }
    // barrel hit
    for (let j = Game.barrels.length - 1; j >= 0; j--) {
      const br = Game.barrels[j];
      const dx = b.x - br.x, dy = b.y - br.y;
      if (dx*dx + dy*dy < br.r * br.r) {
        br.hp -= b.damage;
        spawnSpark(b.x, b.y);
        Game.bullets.splice(i, 1);
        if (br.hp <= 0) { explodeBarrel(j); }
        continue outer;
      }
    }
    // world bounds
    if (b.x < 0 || b.x > WORLD_W || b.y < 0 || b.y > WORLD_H) {
      Game.bullets.splice(i, 1);
    }
  }
}

function updateRockets(dt) {
  outer: for (let i = Game.rockets.length - 1; i >= 0; i--) {
    const r = Game.rockets[i];
    r.x += r.vx * dt; r.y += r.vy * dt;
    r.life -= dt;
    // smoke trail
    Game.particles.push({
      x: r.x - r.vx * 0.01, y: r.y - r.vy * 0.01,
      vx: rand(-20, 20), vy: rand(-20, 20),
      life: rand(0.3, 0.6), color: '#888', r: rand(3, 6),
    });
    if (r.life <= 0) { explodeAt(r.x, r.y, r.explodeRadius, r.damage, 'rocket'); Game.rockets.splice(i, 1); continue; }
    let obstacleHit = false;
    World.forEachObstacleNear(r.x, r.y, TILE_SIZE, (o) => {
      if (!obstacleHit && circleRectCollide(r.x, r.y, 3, o.x, o.y, o.w, o.h)) obstacleHit = true;
    });
    if (obstacleHit) {
      explodeAt(r.x, r.y, r.explodeRadius, r.damage, 'rocket');
      Game.rockets.splice(i, 1);
      continue outer;
    }
    for (const w of Game.walls) {
      if (circleRectCollide(r.x, r.y, 3, w.x, w.y, w.w, w.h)) {
        explodeAt(r.x, r.y, r.explodeRadius, r.damage, 'rocket');
        Game.rockets.splice(i, 1);
        continue outer;
      }
    }
    const nearR = Spatial.query(r.x, r.y, 26, []);
    for (let j = 0; j < nearR.length; j++) {
      const z = nearR[j];
      const dx = r.x - z.x, dy = r.y - z.y;
      if (dx*dx + dy*dy < (z.r + 3) * (z.r + 3)) {
        explodeAt(r.x, r.y, r.explodeRadius, r.damage, 'rocket');
        Game.rockets.splice(i, 1);
        continue outer;
      }
    }
    if (r.x < 0 || r.x > WORLD_W || r.y < 0 || r.y > WORLD_H) Game.rockets.splice(i, 1);
  }
}

function explodeAt(x, y, radius, damage, source) {
  Audio.sfx.explosion();
  Game.explosions.push({ x, y, r: 0, maxR: radius, t: 0 });
  // shake
  screenShake(12, 0.4);
  for (let i = 0; i < 24; i++) {
    Game.particles.push({
      x, y,
      vx: Math.cos(i / 24 * Math.PI * 2) * rand(120, 260),
      vy: Math.sin(i / 24 * Math.PI * 2) * rand(120, 260),
      life: rand(0.3, 0.6), color: i % 2 ? '#ff8a33' : '#ffd54a', r: rand(3, 6),
    });
  }
  // damage zombies inside the blast radius (spatial query)
  const nearE = Spatial.query(x, y, radius + 30, []);
  for (let j = 0; j < nearE.length; j++) {
    const z = nearE[j];
    const d = Math.hypot(z.x - x, z.y - y);
    if (d < radius) {
      const falloff = 1 - d / radius;
      damageZombie(z, damage * falloff, source);
    }
  }
  // chain barrels
  for (let j = Game.barrels.length - 1; j >= 0; j--) {
    const br = Game.barrels[j];
    const d = Math.hypot(br.x - x, br.y - y);
    if (d < radius + br.r) {
      if (!br.ignited) { br.ignited = true; br.igniteT = 0.15; }
    }
  }
  // damage walls
  for (let j = Game.walls.length - 1; j >= 0; j--) {
    const w = Game.walls[j];
    const cx = clamp(x, w.x, w.x + w.w);
    const cy = clamp(y, w.y, w.y + w.h);
    const d = Math.hypot(cx - x, cy - y);
    if (d < radius) {
      const falloff = 1 - d / radius;
      w.hp -= damage * falloff * 0.6;
      if (w.hp <= 0) destroyWall(j, source);
    }
  }
  // damage breakable world obstacles in the blast (house walls, crates, fences)
  World.forEachObstacleNear(x, y, radius + TILE_SIZE, (o) => {
    if (!o.maxHp || o.dead) return;
    const cx = clamp(x, o.x, o.x + o.w);
    const cy = clamp(y, o.y, o.y + o.h);
    const d = Math.hypot(cx - x, cy - y);
    if (d < radius) {
      const falloff = 1 - d / radius;
      damageObstacle(o, damage * falloff * 0.6, source);
    }
  });
  // damage chests in the blast (lets you breach mythic chests with rockets)
  World.forEachActiveChest(x, y, (c) => {
    if (c.opened) return;
    const cx = clamp(x, c.x, c.x + c.w);
    const cy = clamp(y, c.y, c.y + c.h);
    const d = Math.hypot(cx - x, cy - y);
    if (d < radius) {
      const falloff = 1 - d / radius;
      c.hp -= damage * falloff * 0.5;
      if (c.hp <= 0) openChest(c);
    }
  });
  // damage player
  const p = Game.player;
  if (!p.dead) {
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < radius) {
      const falloff = 1 - d / radius;
      damagePlayer(Math.max(8, 30 * falloff));
    }
  }
}

function explodeBarrel(index) {
  const br = Game.barrels[index];
  Game.barrels.splice(index, 1);
  explodeAt(br.x, br.y, 120, 100, 'barrel');
}

let shakeAmt = 0, shakeTime = 0;
function screenShake(amt, dur) { shakeAmt = Math.max(shakeAmt, amt); shakeTime = Math.max(shakeTime, dur); }

// ---------- Zombie damage ----------
// srcX/srcY are optional — the bullet/explosion origin. Used to compute the
// frontal-armor check for Riot zombies (and any future directional defense).
// Chainsaw bypasses frontDR (cleavesArmor).
function damageZombie(z, damage, weapon, srcX, srcY) {
  if (z.hp <= 0) return; // already dead this frame
  if (damage <= 0) return;

  // Centipede: damage targets the head segment; when head dies the next
  // segment is promoted. Head segment takes a damage multiplier (default 1.5).
  if (z.segments > 0 && z.segmentHps && z.segmentHps.length > 0) {
    z.segmentHps[0] -= damage * (z.headWeakMult || 1);
    while (z.segmentHps.length > 0 && z.segmentHps[0] <= 0) {
      const carry = -z.segmentHps[0];
      z.segmentHps.shift();
      if (z.segmentHps.length > 0) z.segmentHps[0] -= carry; // bleed overdamage to next
    }
    z.segments = z.segmentHps.length;
    z.hp = z.segmentHps.reduce((a, b) => a + b, 0);
    z.stunned = 0.05;
    Audio.sfx.hit();
    if (z.segments === 0) { z.hp = 0; killZombie(z, weapon); }
    return;
  }

  // Riot frontDR — bullets hitting within ±frontDRAngle of the zombie's
  // facing get reduced damage. Chainsaw (cleavesArmor) bypasses.
  if (z.frontDR && srcX !== undefined && srcY !== undefined && weapon !== 'saw') {
    const angFromSrc = Math.atan2(srcY - z.y, srcX - z.x);
    let diff = z.angle - angFromSrc;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) < (z.frontDRAngle || Math.PI / 3)) {
      damage *= (1 - z.frontDR);
    }
  }
  z.hp -= damage;
  z.stunned = 0.05;
  Audio.sfx.hit();
  if (z.hp <= 0) killZombie(z, weapon);
}
function killZombie(z, weapon) {
  // splat
  for (let i = 0; i < 12; i++) {
    Game.particles.push({
      x: z.x, y: z.y,
      vx: rand(-200, 200), vy: rand(-200, 200),
      life: rand(0.4, 0.8), color: '#9a1a1a', r: rand(2, 5),
    });
  }
  // fire zombie ignites nearby
  if (z.isFire) {
    for (const other of Game.zombies) {
      if (other === z) continue;
      if (Math.hypot(other.x - z.x, other.y - z.y) < 120) other.onFire = Math.max(other.onFire, 2);
    }
  }
  Game.kills++;
  if (weapon && Game.weaponKills[weapon] != null) Game.weaponKills[weapon]++;
  Game.score += z.score * (1 + (Game.time.day - 1) * 0.15);
  // Drops scale with zombie type. Tanks are dedicated loot piñatas; fire
  // zombies are mid; runners and walkers occasionally cough something up.
  const dropRoll = Math.random();
  let dropChance = 0.10;
  if (z.type === 'runner') dropChance = 0.13;
  else if (z.type === 'tank') dropChance = 0.6;
  else if (z.type === 'fire') dropChance = 0.28;
  // Night kills get a small bonus so the player is rewarded for surviving the swarm.
  if (Game.time.phase === 'night') dropChance += 0.05;
  if (dropRoll < dropChance) {
    if (z.type === 'tank') spawnTankDrop(z.x, z.y);
    else spawnPickup(z.x, z.y);
  }
  const idx = Game.zombies.indexOf(z);
  if (idx >= 0) Game.zombies.splice(idx, 1);
}

// Tanks bias toward big, useful loot.
function spawnTankDrop(x, y) {
  const opts = ['ammo_smg', 'ammo_rocket', 'wall', 'barrel', 'health'];
  const weights = [3, 2.5, 3, 2, 1.5];
  let total = 0; for (const w of weights) total += w;
  let r = Math.random() * total, pick = 'ammo_smg';
  for (let i = 0; i < opts.length; i++) { r -= weights[i]; if (r <= 0) { pick = opts[i]; break; } }
  Game.pickups.push({ x, y, r: 12, type: pick, life: 30 });
}

function spawnPickup(x, y, forceType) {
  // If a specific type is requested (e.g. chest contents), drop it directly.
  if (forceType) {
    Game.pickups.push({ x, y, r: 12, type: forceType, life: 30 });
    return;
  }
  // From day 5+, ~5% of organic drops are a Mimic — a stationary disguised
  // zombie that bites if the player gets close. Tier-3 mimic AI in
  // updateZombies handles trigger + bite.
  if (Game.time.day >= 5 && Math.random() < 0.05) {
    spawnZombieAt('mimic', x, y);
    return;
  }
  const p = Game.player;
  const opts = [
    'health', 'ammo_shotgun', 'ammo_smg', 'ammo_rocket', 'barrel', 'wall',
    // Expansion ammo. Locked weapons can still drop ammo — picking it up
    // unlocks the weapon (same UX as shotgun/smg/rocket).
    'ammo_crossbow', 'ammo_flamer', 'ammo_minigun', 'ammo_railgun', 'ammo_gl', 'saw',
  ];
  const weights = [
    3,
    p.unlocked.shotgun ? 3 : 2,
    p.unlocked.smg ? 3 : 1.5,
    p.unlocked.rocket ? 1.5 : 1,
    p.unlocked.barrel ? 1 : 0.8,
    p.ammo.wall.reserve < WALL_MAX_RESERVE ? 2.5 : 0,
    // Tier-2 expansion drops — rarer than the base set.
    p.unlocked.crossbow ? 1.2 : 0.5,
    p.unlocked.flamer   ? 1.2 : 0.5,
    p.unlocked.minigun  ? 1.0 : 0.4,
    p.unlocked.railgun  ? 0.7 : 0.3,
    p.unlocked.gl       ? 1.0 : 0.4,
    p.unlocked.saw      ? 0.4 : 0.3,
  ];
  const total = weights.reduce((a, b) => a + b, 0);
  if (total === 0) return;
  let r = Math.random() * total, pick = 'health';
  for (let i = 0; i < opts.length; i++) { r -= weights[i]; if (r <= 0) { pick = opts[i]; break; } }
  Game.pickups.push({ x, y, r: 12, type: pick, life: 20 });
}

function damagePlayer(amount) {
  const p = Game.player;
  if (p.iframe > 0 || p.dead) return;
  p.hp -= amount;
  p.iframe = 0.6;
  Audio.sfx.hurt();
  screenShake(6, 0.2);
  if (p.hp <= 0) {
    p.hp = 0;
    p.dead = true;
    Audio.sfx.dead();
    setTimeout(() => { if (Game.mode === 'playing') showGameOver(); }, 900);
  }
}

function spawnBlood(x, y, ang) {
  for (let i = 0; i < 4; i++) {
    Game.particles.push({
      x, y,
      vx: Math.cos(ang) * rand(40, 120) + rand(-40, 40),
      vy: Math.sin(ang) * rand(40, 120) + rand(-40, 40),
      life: rand(0.3, 0.7), color: '#a81f1f', r: rand(2, 4),
    });
  }
}
function spawnSpark(x, y) {
  for (let i = 0; i < 3; i++) {
    Game.particles.push({
      x, y, vx: rand(-120, 120), vy: rand(-120, 120),
      life: rand(0.1, 0.25), color: '#ffe066', r: rand(1, 3),
    });
  }
}

// Returns the player-placed wall lying between zombie and player, or null.
// Skips if a level obstacle blocks first (a wall behind a permanent obstacle isn't bashable).
function findBashWall(z, p) {
  let bestT = 1.5, bestWall = null;
  for (const w of Game.walls) {
    const hit = segmentRectHit(z.x, z.y, p.x, p.y, w);
    if (hit && hit.t < bestT) { bestT = hit.t; bestWall = w; }
  }
  if (!bestWall) return null;
  let blockedByObstacle = false;
  World.forEachActiveObstacle(z.x, z.y, (o) => {
    if (blockedByObstacle) return;
    const hit = segmentRectHit(z.x, z.y, p.x, p.y, o);
    if (hit && hit.t < bestT) blockedByObstacle = true;
  });
  if (blockedByObstacle) return null;
  return bestWall;
}

// ---------- Zombies ----------
function updateZombies(dt) {
  const p = Game.player;
  const zs = Game.zombies;
  for (let i = 0; i < zs.length; i++) {
    const z = zs[i];
    if (z.stunned > 0) { z.stunned -= dt; continue; }
    // Steering. Three modes:
    //   1) clear LOS to player -> chase directly
    //   2) flow path exists -> follow flow field around obstacles (always preferred when available)
    //   3) flow path is severed entirely -> bash through nearest wall as a last resort
    let dx, dy, mode = 'chase';
    // "blocked" means NAV reports no path to the player from here — that's
    // the only state in which zombies are allowed to chew through walls.
    let blocked = false;
    if (NAV.hasLOS(z.x, z.y, p.x, p.y)) {
      dx = p.x - z.x; dy = p.y - z.y;
    } else {
      const fd = NAV.flowDir(z.x, z.y);
      const cellDist = NAV.dist[NAV.cy(z.y) * NAV.cols + NAV.cx(z.x)];
      const cutOff = cellDist < 0 && !fd;
      blocked = cutOff;
      if (cutOff && Game.walls.length > 0) {
        const wall = findBashWall(z, p);
        if (wall) {
          dx = wall.x + wall.w / 2 - z.x;
          dy = wall.y + wall.h / 2 - z.y;
          mode = 'bash';
          z.bashWall = wall;
        }
      }
      if (mode === 'chase') {
        if (fd) { dx = fd[0]; dy = fd[1]; }
        else { dx = p.x - z.x; dy = p.y - z.y; }
      }
    }
    if (mode !== 'bash') z.bashWall = null;
    z.blocked = blocked;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    // separation — only consult zombies in nearby spatial buckets
    let sx = 0, sy = 0;
    const sepRadius = z.r + 28;
    const neighbors = Spatial.query(z.x, z.y, sepRadius, []);
    for (let j = 0; j < neighbors.length; j++) {
      const o = neighbors[j];
      if (o === z) continue;
      const ddx = z.x - o.x, ddy = z.y - o.y;
      const dd = Math.hypot(ddx, ddy);
      if (dd > 0 && dd < z.r + o.r + 6) {
        sx += ddx / dd * (1 - dd / (z.r + o.r + 6));
        sy += ddy / dd * (1 - dd / (z.r + o.r + 6));
      }
    }
    let vx = dx + sx * 1.5;
    let vy = dy + sy * 1.5;
    const vl = Math.hypot(vx, vy) || 1;
    vx /= vl; vy /= vl;
    z.x += vx * z.speed * dt;
    z.y += vy * z.speed * dt;
    // facing + walk cycle
    z.angle = Math.atan2(dy, dx);
    z.walkPhase = (z.walkPhase + dt * (z.speed / 35)) % 1;
    // nearby obstacles + walls + chests (tight query — much cheaper with many tiles)
    World.forEachObstacleNear(z.x, z.y, z.r + TILE_SIZE, (o) => resolveCircleRect(z, o));
    for (const w of Game.walls) resolveCircleRect(z, w);
    World.forEachActiveChest(z.x, z.y, (c) => { if (!c.opened) resolveCircleRect(z, c); });
    z.x = clamp(z.x, z.r, WORLD_W - z.r);
    z.y = clamp(z.y, z.r, WORLD_H - z.r);

    // on fire
    if (z.onFire > 0) {
      z.onFire -= dt;
      if (Math.random() < 0.5) {
        Game.particles.push({ x: z.x + rand(-z.r, z.r), y: z.y + rand(-z.r, z.r), vx: rand(-20, 20), vy: rand(-60, -20), life: 0.3, color: '#ff7a33', r: rand(2, 4) });
      }
      z.hp -= 8 * dt;
      if (z.hp <= 0) { killZombie(z, 'barrel'); i--; continue; }
    }

    // fire zombie ignites neighbors in contact
    if (z.isFire) {
      for (const other of zs) {
        if (other === z) continue;
        if (Math.hypot(other.x - z.x, other.y - z.y) < z.r + other.r + 4) {
          if (other.onFire < 1.5) other.onFire = 2;
        }
      }
    }

    // touch barrels -> damage them
    for (let k = Game.barrels.length - 1; k >= 0; k--) {
      const br = Game.barrels[k];
      if (Math.hypot(br.x - z.x, br.y - z.y) < br.r + z.r) {
        // push back zombie
        const ddx = z.x - br.x, ddy = z.y - br.y;
        const dd = Math.hypot(ddx, ddy) || 1;
        z.x += ddx / dd * 2; z.y += ddy / dd * 2;
        br.hp -= 15 * dt * z.damage * 0.3;
        if (br.hp <= 0) explodeBarrel(k);
      }
    }

    // Chewing only fires when the zombie has no path to the player. Otherwise
    // walls just steer them around — zombies pathfind, not bulldoze.
    if (z.blocked) {
      // touch walls -> chew through them. Continuous DPS scales with zombie damage,
      // so tanks are the natural wall-breakers.
      for (let k = Game.walls.length - 1; k >= 0; k--) {
        const ww = Game.walls[k];
        if (circleRectCollide(z.x, z.y, z.r + 1, ww.x, ww.y, ww.w, ww.h)) {
          ww.hp -= z.damage * 2.5 * dt;
          if (Math.random() < dt * 6) {
            Game.particles.push({
              x: ww.x + rand(0, ww.w), y: ww.y + rand(0, ww.h),
              vx: rand(-40, 40), vy: rand(-60, -10),
              life: rand(0.2, 0.4), color: '#8a6a3a', r: rand(1.5, 2.5),
            });
          }
          if (ww.hp <= 0) { destroyWall(k, 'zombie'); break; }
        }
      }
      // touch breakable world obstacles (house walls, crates, fences) -> chew through.
      World.forEachObstacleNear(z.x, z.y, z.r + TILE_SIZE, (o) => {
        if (!o.maxHp || o.dead) return;
        if (circleRectCollide(z.x, z.y, z.r + 1, o.x, o.y, o.w, o.h)) {
          if (Math.random() < dt * 6) {
            const [hi] = obstacleParticleColors(o.style);
            Game.particles.push({
              x: o.x + rand(0, o.w), y: o.y + rand(0, o.h),
              vx: rand(-40, 40), vy: rand(-60, -10),
              life: rand(0.2, 0.4), color: hi, r: rand(1.5, 2.5),
            });
          }
          damageObstacle(o, z.damage * 2.5 * dt, 'zombie');
        }
      });
    }

    // Hard separation from player so zombies pile up against the player but
    // never actually overlap. Each side resolves half the overlap.
    {
      const dxp = z.x - p.x, dyp = z.y - p.y;
      const dp = Math.hypot(dxp, dyp);
      const minD = z.r + p.r;
      if (dp > 0 && dp < minD) {
        const half = (minD - dp) * 0.5;
        z.x += (dxp / dp) * half;
        z.y += (dyp / dp) * half;
      }
    }

    // damage player on contact (small tolerance so the half-resolve doesn't
    // gap the damage check on tightly touching frames)
    z.hitCd -= dt;
    if (z.hitCd < 0) z.hitCd = 0;
    if (Math.hypot(p.x - z.x, p.y - z.y) <= p.r + z.r + 1.5) {
      if (z.hitCd <= 0) {
        damagePlayer(z.damage);
        z.hitCd = 0.6;
      }
    }

    // groan occasionally
    if (Math.random() < 0.002) Audio.sfx.groan();
  }
}

// ---------- Barrels ----------
function updateBarrels(dt) {
  for (let i = Game.barrels.length - 1; i >= 0; i--) {
    const br = Game.barrels[i];
    if (br.ignited) {
      br.igniteT -= dt;
      if (Math.random() < 0.6) Game.particles.push({
        x: br.x + rand(-6, 6), y: br.y + rand(-6, 6),
        vx: rand(-30, 30), vy: rand(-80, -30),
        life: 0.3, color: '#ffb040', r: rand(2, 4),
      });
      if (br.igniteT <= 0) { explodeBarrel(i); }
    }
  }
}

// ---------- Pickups ----------
function updatePickups(dt) {
  const p = Game.player;
  for (let i = Game.pickups.length - 1; i >= 0; i--) {
    const pk = Game.pickups[i];
    pk.life -= dt;
    if (pk.life <= 0) { Game.pickups.splice(i, 1); continue; }
    if (Math.hypot(p.x - pk.x, p.y - pk.y) < p.r + pk.r) {
      applyPickup(pk.type);
      Game.pickups.splice(i, 1);
      Audio.sfx.pickup();
    }
  }
}
function applyPickup(type) {
  const p = Game.player;
  switch (type) {
    case 'health': p.hp = Math.min(p.maxHp, p.hp + 35); setNotice('+35 HP', 1.5); break;
    case 'ammo_shotgun':
      if (!p.unlocked.shotgun) unlockWeapon('shotgun', 12, 'SHOTGUN PICKED UP');
      p.ammo.shotgun.reserve += 12; setNotice('+12 shells', 1.5); break;
    case 'ammo_smg':
      if (!p.unlocked.smg) unlockWeapon('smg', 80, 'SMG PICKED UP');
      p.ammo.smg.reserve += 60; setNotice('+60 rounds', 1.5); break;
    case 'ammo_rocket':
      if (!p.unlocked.rocket) unlockWeapon('rocket', 3, 'ROCKETS PICKED UP');
      p.ammo.rocket.reserve += 2; setNotice('+2 rockets', 1.5); break;
    case 'barrel':
      if (!p.unlocked.barrel) unlockWeapon('barrel', 3, 'BARRELS PICKED UP');
      p.ammo.barrel.reserve += 2; setNotice('+2 barrels', 1.5); break;
    case 'wall':
      p.ammo.wall.reserve = Math.min(WALL_MAX_RESERVE, p.ammo.wall.reserve + WALL_PICKUP_AMOUNT);
      setNotice(`+${WALL_PICKUP_AMOUNT} walls`, 1.5); break;
    // ---------- Expansion ammo ----------
    case 'ammo_crossbow':
      if (!p.unlocked.crossbow) unlockWeapon('crossbow', 8, 'CROSSBOW PICKED UP');
      p.ammo.crossbow.reserve += 6; setNotice('+6 bolts', 1.5); break;
    case 'ammo_flamer':
      if (!p.unlocked.flamer) unlockWeapon('flamer', 120, 'FLAMETHROWER PICKED UP');
      p.ammo.flamer.reserve += 80; setNotice('+80 fuel', 1.5); break;
    case 'ammo_minigun':
      if (!p.unlocked.minigun) unlockWeapon('minigun', 200, 'MINIGUN PICKED UP');
      p.ammo.minigun.reserve += 120; setNotice('+120 rounds', 1.5); break;
    case 'ammo_railgun':
      if (!p.unlocked.railgun) unlockWeapon('railgun', 3, 'RAILGUN PICKED UP');
      p.ammo.railgun.reserve += 2; setNotice('+2 slugs', 1.5); break;
    case 'ammo_gl':
      if (!p.unlocked.gl) unlockWeapon('gl', 8, 'GRENADE LAUNCHER PICKED UP');
      p.ammo.gl.reserve += 4; setNotice('+4 grenades', 1.5); break;
    case 'saw':
      if (!p.unlocked.saw) unlockWeapon('saw', Infinity, 'CHAINSAW PICKED UP');
      setNotice('Chainsaw equipped', 1.5); break;
  }
}

// ---------- Explosions ----------
function updateExplosions(dt) {
  for (let i = Game.explosions.length - 1; i >= 0; i--) {
    const ex = Game.explosions[i];
    ex.t += dt;
    ex.r = lerp(0, ex.maxR, Math.min(1, ex.t / 0.3));
    if (ex.t > 0.6) Game.explosions.splice(i, 1);
  }
}

// ---------- Particles ----------
function updateParticles(dt) {
  for (let i = Game.particles.length - 1; i >= 0; i--) {
    const p = Game.particles[i];
    p.x += p.vx * dt; p.y += p.vy * dt;
    p.vx *= 0.96; p.vy *= 0.96;
    p.life -= dt;
    if (p.life <= 0) Game.particles.splice(i, 1);
  }
}

// Spawn a zombie at a fixed world position (used for encounter activation,
// hive bursts, brood drops, twin splits, etc.).
function spawnZombieAt(type, x, y) {
  const z = buildZombieInstance(type, x, y);
  if (z) Game.zombies.push(z);
  return z;
}

// Pre-activate chunks within ±1 of the player so garrison spawns happen
// off-screen (minimum 800px away from the player). The previous "activate
// only the chunk the player just entered" model caused zombies and barrels
// to pop into existence right at the player's feet when crossing a chunk
// boundary. This 3×3 pre-activation, plus a hard min-distance guard, keeps
// every spawn off-camera.
//
// Also marks the player's CURRENT chunk as discovered for the POI compass,
// and tracks explored chunks (a 3×3 ring around the player) for the M-key
// world map.
const SAFE_SPAWN_DIST = 720; // px — just outside the camera diagonal (~640)
function activateChunkIfNeeded() {
  const p = Game.player;
  const [pcx, pcy] = World.chunkOf(p.x, p.y);

  // Track explored chunks (3×3 ring around the player). Drives the M map.
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      Game.exploredChunks.add((pcx + dx) + ',' + (pcy + dy));
    }
  }

  // Activate the 3×3 ring around the player. Each garrison entry that would
  // spawn inside the camera safety radius gets deferred to a later tick —
  // we mark `e._done` on entries we've already handled so we never
  // double-spawn, and we don't flag the whole chunk as activated until
  // every entry has been processed.
  const safeSq = SAFE_SPAWN_DIST * SAFE_SPAWN_DIST;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ccx = pcx + dx, ccy = pcy + dy;
      const chunk = World.chunks.get(ccx + ',' + ccy);
      if (!chunk || chunk.activated) continue;

      let anyDeferred = false;

      // Garrison — gated on per-entry distance to the player.
      if (chunk.garrison && chunk.garrison.length) {
        for (const e of chunk.garrison) {
          if (e._done) continue;
          const exdx = e.x - p.x, exdy = e.y - p.y;
          if (exdx * exdx + exdy * exdy < safeSq) { anyDeferred = true; continue; }
          if (!inObstacle(e.x, e.y, 14)) spawnZombieAt(e.type, e.x, e.y);
          e._done = true;
        }
      }

      // Pre-placed barrels — not visually startling, drop them immediately.
      if (chunk.barrels && chunk.barrels.length) {
        for (const b of chunk.barrels) {
          if (b._done) continue;
          if (!inObstacle(b.x, b.y, 14)) {
            Game.barrels.push({ x: b.x, y: b.y, r: 14, hp: b.hp, ignited: false, igniteT: 0 });
          }
          b._done = true;
        }
      }

      if (!anyDeferred) chunk.activated = true;
    }
  }

  // POI discovery — tied to the chunk the player is actually standing in,
  // so the compass / map only dim POIs the player has personally entered.
  const zx = Math.floor((pcx * CHUNK_SIZE) / ZONE_PX);
  const zy = Math.floor((pcy * CHUNK_SIZE) / ZONE_PX);
  for (let dzy = -1; dzy <= 1; dzy++) {
    for (let dzx = -1; dzx <= 1; dzx++) {
      const poi = poiForZone(World.seed, zx + dzx, zy + dzy, World.region, World);
      if (!poi) continue;
      const px1 = poi.originX + poi.tileW * TILE_SIZE;
      const py1 = poi.originY + poi.tileH * TILE_SIZE;
      const cx0 = pcx * CHUNK_SIZE, cy0 = pcy * CHUNK_SIZE;
      if (poi.originX < cx0 + CHUNK_SIZE && px1 > cx0 &&
          poi.originY < cy0 + CHUNK_SIZE && py1 > cy0) {
        Game.discoveredPOIs.add(zoneKey(poi.zx, poi.zy));
      }
    }
  }
}

// ---------- Main tick ----------
function tick(dt) {
  if (Game.mode !== 'playing') return;
  Game.elapsed += dt;
  updatePlayer(dt);
  // Ensure chunks around the player are generated each tick (cheap when stable).
  World.ensureActive(Game.player.x, Game.player.y);
  // Activate the chunk under the player (one-shot encounter spawn + discovery).
  activateChunkIfNeeded();
  // Rebuild the zombie spatial hash for cheap proximity queries this tick.
  Spatial.clear();
  for (let i = 0; i < Game.zombies.length; i++) Spatial.insert(Game.zombies[i]);
  NAV.update(dt);
  updateZombies(dt);
  updateBullets(dt);
  updateRockets(dt);
  updateBarrels(dt);
  updatePickups(dt);
  updateExplosions(dt);
  updateParticles(dt);
  updateDayCycle(dt);
  if (shakeTime > 0) { shakeTime -= dt; if (shakeTime <= 0) { shakeAmt = 0; } }
  // Autosave every 5 seconds of play.
  Game.saveTimer = (Game.saveTimer || 0) + dt;
  if (Game.saveTimer > 5) { Game.saveTimer = 0; saveGame(); }
}
