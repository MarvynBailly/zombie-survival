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
  if (['w','a','s','d','r','e','i','p','h',' ','escape',
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
  // Tier-3: short-lived lingering hazards spawned by ToxicDrum destruction,
  // bloater deaths, and spitter splatters. See spawnPuddle / updatePuddles.
  puddles: [],
  // Spitter arcing projectiles + similar zombie-fired ammo.
  zombieProjectiles: [],
  // Necromancer corpse log (positions to be raised). Trimmed each second.
  corpseLog: [],
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
  Game.puddles = [];
  Game.zombieProjectiles = [];
  Game.corpseLog = [];
  Game.time = { day: 1, t: 0, phase: 'day' };
  Game.spawnTimer = 0;
  Game.kills = 0;
  Game.score = 0;
  Game.weaponKills = { pistol: 0, shotgun: 0, smg: 0, rocket: 0, barrel: 0 };
  Game.discoveredPOIs = new Set();
  Game.exploredChunks = new Set();
  Game.mapOpen = false;
  // Perks reset every run (the brainstorm explicitly calls this out — the
  // power fantasy is rebuilt each time).
  Game.perks = makePerks();
  // Day 1 starter point so the perk tree has something for first-time players
  // to spend right away — otherwise nothing happens until day 2.
  grantPerkPoint(1);
  // Squad / world survivors — empty on every run. Names are randomized at
  // spawn time so each run feels fresh.
  Game.squad = [];
  Game.worldSurvivors = [];
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
      pistol: { mag: 12, reserve: 60 },
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
    // Generic carry-anything inventory (items.js). Separate from per-weapon
    // ammo reserves so weapons keep their fast HUD path.
    inventory: makeInventory(),
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
  // Legacy saves from when the pistol was infinite — clamp back to the
  // finite defaults so the player still has to scavenge after resuming.
  if (p.ammo.pistol.mag === Infinity) p.ammo.pistol.mag = WEAPONS.pistol.magSize;
  if (p.ammo.pistol.reserve === Infinity) p.ammo.pistol.reserve = WEAPONS.pistol.reserve;
  // Inventory — accept the saved slot list, drop entries for unknown ids
  // (in case a future item is removed). Capacity is fixed in items.js.
  if (d.player.inventory && Array.isArray(d.player.inventory.slots)) {
    const cap = p.inventory.capacity;
    const slots = Array.from({ length: cap }, () => null);
    for (let i = 0; i < Math.min(cap, d.player.inventory.slots.length); i++) {
      const s = d.player.inventory.slots[i];
      if (s && ITEMS[s.id] && s.count > 0) {
        slots[i] = { id: s.id, count: Math.min(s.count, ITEMS[s.id].stackMax) };
      }
    }
    p.inventory.slots = slots;
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
  // Perks — restoring also re-applies side-effects so max-HP bumps land.
  if (d.perks) {
    Game.perks = {
      points: d.perks.points | 0,
      unlocked: new Set(d.perks.unlocked || []),
      totalEarned: d.perks.totalEarned | 0,
    };
    for (const id of Game.perks.unlocked) applyPerkSideEffects(id);
  }

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
    // One perk point awarded for surviving a day. grantPerkPoint also raises
    // a notice + sound so the player knows to open the tree.
    grantPerkPoint(1);
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

  // Movement speed modifiers:
  //  - Frost chill (from Frost Walker / Charger stun): multiplies until expiry.
  //  - Minigun: slow while firing (slowsWhileFiring).
  let speed = 220;
  const nowSec = now();
  if (p.chilledUntil && p.chilledUntil > nowSec) {
    speed *= (p.chillMult ?? 1);
  } else if (p.chilledUntil) {
    p.chilledUntil = 0;
    p.chillMult = 1;
  }
  const weapDef = WEAPONS[p.weapon];
  if (weapDef && weapDef.slowsWhileFiring && input.mouseDown
      && (p.minigunSpin || 0) >= (weapDef.spinUp || 0)) {
    speed *= weapDef.slowsWhileFiring;
  }
  // Perks: Light Feet flat multiplier; Sprint adds a burst when Shift is held.
  speed *= perkMult('speedMult');
  if (hasPerk('s_sprint') && (input.keys.has('shift') || input.keys.has('Shift'))) {
    p.sprintEnergy = p.sprintEnergy ?? 1;
    if (p.sprintEnergy > 0) {
      speed *= 1.30;
      p.sprintEnergy = Math.max(0, p.sprintEnergy - dt / 5); // 5s to drain
    }
  } else if (p.sprintEnergy != null && p.sprintEnergy < 1) {
    p.sprintEnergy = Math.min(1, p.sprintEnergy + dt / 3);  // 3s to refill
  }
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

  // Field Medic regen — restores HP if the player hasn't been hit for 3s.
  const regen = perkSum('regenPerSec');
  if (regen > 0 && p.hp < p.maxHp) {
    const cool = now() - (p.lastHurtAt || -10);
    if (cool > 3) p.hp = Math.min(p.maxHp, p.hp + regen * dt);
  }

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
      p.reloading = w.reloadTime * perkMult('reloadMult');
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
        p.placeCd = WALL_PLACE_CD * perkMult('placeCdMult');
      } else {
        Audio.sfx.empty();
        p.placeCd = 0.3;
      }
    }
  } else {
    // Minigun spin-up tracking — independent of fireCd. Spin up while LMB is
    // held + ammo available; decay when released or weapon switched.
    if (weap.spinUp) {
      if (input.mouseDown && p.ammo[p.weapon].mag > 0) {
        p.minigunSpin = Math.min(weap.spinUp + 0.05, (p.minigunSpin || 0) + dt);
      } else {
        p.minigunSpin = Math.max(0, (p.minigunSpin || 0) - dt * 2);
      }
    } else {
      p.minigunSpin = 0;
    }

    // Railgun: hold-to-charge, release-to-fire. Doesn't share the standard
    // mag-click flow — handled here entirely.
    if (weap.chargeTime) {
      if (input.mouseDown && p.ammo[p.weapon].mag > 0 && p.reloading <= 0) {
        p.railCharge = Math.min(weap.chargeTime, (p.railCharge || 0) + dt);
      } else if ((p.railCharge || 0) > 0) {
        if (p.railCharge >= weap.chargeTime && p.ammo[p.weapon].mag > 0) {
          fireRailgunBeam(p, weap);
          p.ammo[p.weapon].mag = Math.max(0, p.ammo[p.weapon].mag - 1);
          if (p.ammo[p.weapon].mag === 0 && p.ammo[p.weapon].reserve > 0) {
            p.reloading = weap.reloadTime;
            Audio.sfx.reload();
          }
        }
        p.railCharge = 0;
      }
    } else if (input.mouseDown && p.fireCd <= 0 && p.reloading <= 0) {
      const a = p.ammo[p.weapon];
      if (a.mag > 0) {
        // Minigun: don't actually fire until spun up. Show muzzle flare so
        // the player has feedback that the trigger is registering.
        if (weap.spinUp && p.minigunSpin < weap.spinUp) {
          p.fireCd = 0.05;
          p.muzzleFlash = 0.3;
        } else {
          fireWeapon(p, weap);
          p.fireCd = weap.fireRate * perkMult('fireRateMult');
          if (weap.magSize !== Infinity) a.mag--;
          if (weap.magSize !== Infinity && a.mag === 0 && a.reserve > 0) {
            p.reloading = weap.reloadTime;
            Audio.sfx.reload();
          }
        }
      } else if (a.reserve > 0 && p.reloading <= 0) {
        p.reloading = weap.reloadTime * perkMult('reloadMult');
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

  // E to open the nearest unopened chest, or fall through to the workbench
  // crafting overlay if no chest is in reach, or recruit a nearby survivor.
  if (input.keys.has('e') && p.openCd <= 0) {
    const chest = findChestNear(p.x, p.y, CHEST_PROMPT_RADIUS);
    if (chest) {
      openChest(chest);
      p.openCd = 0.4;
    } else {
      const wb = findWorkbenchNear(p.x, p.y, WORKBENCH_PROMPT_RADIUS);
      if (wb && typeof openCrafting === 'function') {
        openCrafting(wb);
        p.openCd = 0.4;
      } else if (typeof findSurvivorNear === 'function') {
        const sv = findSurvivorNear(p.x, p.y, SURVIVOR_RECRUIT_RADIUS);
        if (sv) {
          recruitSurvivor(sv);
          p.openCd = 0.4;
        }
      }
    }
  }
  if (p.openCd > 0) p.openCd -= dt;

  // H toggles squad HOLD/FOLLOW. Held edge-triggered: only fire once per tap.
  if (input.keys.has('h')) {
    if (!p._hHeld) { toggleSquadHold(); p._hHeld = true; }
  } else {
    p._hHeld = false;
  }
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
  const wallHp = Math.round(WALL_HP * perkMult('wallHpMult'));
  Game.walls.push({ x: rect.x, y: rect.y, w: rect.w, h: rect.h, hp: wallHp, maxHp: wallHp });
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

// Returns the closest workbench (an obstacle with style or kind 'workbench')
// within radius, or null. Workbenches anchor the crafting overlay.
function findWorkbenchNear(x, y, radius) {
  let best = null, bestD = radius * radius;
  World.forEachActiveObstacle(x, y, (o) => {
    if (o.dead) return;
    if (o.style !== 'workbench' && o.kind !== 'workbench') return;
    const ox = o.x + o.w / 2, oy = o.y + o.h / 2;
    const dx = x - ox, dy = y - oy;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = o; }
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
  if (o.indestructible) return false;
  o.hp -= dmg;
  if (o.hp <= 0) {
    destroyObstacle(o, source);
    // Tier-3: explosive blocks chain like barrels. Fuel pumps, toxic drums,
    // generators, car wrecks all flag `explodes` and provide `explodeR`.
    if (o.explodes) {
      explodeAt(o.x + o.w / 2, o.y + o.h / 2,
                o.explodeR || 120,
                o.explodeDamage || 90,
                source || 'block');
    }
    if (o.leavesPuddle) {
      spawnPuddle(o.x + o.w / 2, o.y + o.h / 2, 60, 5, 'toxic');
    }
    return true;
  }
  return false;
}

// ---------- Lingering puddles ----------
// Created by toxic drums, bloater deaths, spitter splatters. Tick damage to
// any zombie or the player standing inside. Decays after `life` seconds.
function spawnPuddle(x, y, radius, life, kind) {
  if (!Game.puddles) Game.puddles = [];
  Game.puddles.push({
    x, y, r: radius, life, maxLife: life, dps: 5, kind: kind || 'toxic',
  });
}
function updatePuddles(dt) {
  if (!Game.puddles) return;
  const p = Game.player;
  for (let i = Game.puddles.length - 1; i >= 0; i--) {
    const pu = Game.puddles[i];
    pu.life -= dt;
    if (pu.life <= 0) { Game.puddles.splice(i, 1); continue; }
    // Sparse particles to sell the hazard.
    if (Math.random() < 0.4) {
      Game.particles.push({
        x: pu.x + rand(-pu.r * 0.7, pu.r * 0.7),
        y: pu.y + rand(-pu.r * 0.5, pu.r * 0.5),
        vx: rand(-10, 10), vy: rand(-20, -5),
        life: 0.4, color: pu.kind === 'fire' ? '#ff7a33' : '#8ec547',
        r: rand(1.5, 2.5),
      });
    }
    // Damage player.
    if (p && !p.dead) {
      const dx = p.x - pu.x, dy = p.y - pu.y;
      if (dx * dx + dy * dy < pu.r * pu.r) damagePlayer(pu.dps * dt, null, { dot: true });
    }
    // Damage zombies that wade through.
    const near = Spatial.query(pu.x, pu.y, pu.r + 20, []);
    for (const z of near) {
      const dx = z.x - pu.x, dy = z.y - pu.y;
      if (dx * dx + dy * dy < pu.r * pu.r) {
        damageZombie(z, pu.dps * dt, pu.kind === 'fire' ? 'fire' : 'puddle', pu.x, pu.y);
        if (pu.kind === 'fire') z.onFire = Math.max(z.onFire || 0, 1.0);
      }
    }
  }
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
  // Scrap drops — yield depends on the obstacle's kind/style. The world
  // generator uses both fields (kind for ZExpand/ZProps, style for legacy
  // pieces) so we consult whichever is set.
  const tag = o.kind || o.style;
  const base = scrapYieldFor(tag);
  const n = Math.round(base * perkMult('scrapMult'));
  if (n > 0) {
    Game.pickups.push({
      x: o.x + o.w / 2, y: o.y + o.h / 2,
      r: 12, type: `item_scrap_${n}`, life: 30,
    });
  }
  // Flow field must be rebuilt so zombies route through the new opening.
  NAV.markDirty();
}

// Salvage value of a destroyed obstacle (in scrap). Returns 0 for items
// that shouldn't drop anything (cosmetic, furniture not worth dismantling).
function scrapYieldFor(tag) {
  switch (tag) {
    case 'CarWreck':  return randi(3, 6);
    case 'Dumpster':  return randi(2, 5);
    case 'Pallet':    return randi(1, 3);
    case 'FuelPump':  return randi(2, 4);
    case 'ToxicDrum': return randi(1, 3);
    case 'Sandbags':  return randi(1, 2);
    case 'Jersey':    return randi(1, 2);
    case 'fridge':    return randi(1, 3);
    case 'stove':     return randi(1, 3);
    case 'workbench': return 0; // don't pulp your own workshop
    default:          return 0;
  }
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

// Wake nearby zombies on a (non-silent) gunshot: short alert timer that boosts
// their groan rate so the player hears the horde reacting to noise.
function broadcastAggro(x, y) {
  // Silent Boots perk reduces the audible radius. Doesn't fully silence —
  // crossbow is the only "fully silent" weapon (weap.silent).
  const r = 280 * perkMult('aggroMult');
  const R2 = r * r;
  const zs = Game.zombies;
  for (let i = 0; i < zs.length; i++) {
    const z = zs[i];
    const dx = z.x - x, dy = z.y - y;
    if (dx * dx + dy * dy <= R2) z.aggroT = Math.max(z.aggroT || 0, 4);
  }
}

// Per-shot multiplier from the Gunner "Last Stand" perk — kicks in under
// 30% HP for an extra +50% damage. Returns 1 when the perk isn't taken or
// the player is healthy.
function playerLastStandMult(p) {
  const bonus = perkSum('lastStand');
  if (bonus <= 0) return 1;
  return (p.hp / p.maxHp) < 0.30 ? (1 + bonus) : 1;
}

function fireWeapon(p, weap) {
  Audio.sfx[weap.sfx]();
  // Stream weapons (flamethrower) hold a steady glow instead of spiking the
  // flash each tick — keeps the flame visually continuous rather than strobing.
  p.muzzleFlash = weap.isStream ? Math.max(p.muzzleFlash, 0.45) : 1;
  const muzzleX = p.x + Math.cos(p.angle) * (p.r + 4);
  const muzzleY = p.y + Math.sin(p.angle) * (p.r + 4);
  if (!weap.silent) broadcastAggro(p.x, p.y);

  // muzzle flash particle
  const flashColor = weap.isStream ? '#ff7a33' : '#ffcc55';
  const flashCount = weap.isStream ? 2 : 3;
  for (let i = 0; i < flashCount; i++) {
    Game.particles.push({
      x: muzzleX, y: muzzleY,
      vx: Math.cos(p.angle) * rand(100, 300) + rand(-30, 30),
      vy: Math.sin(p.angle) * rand(100, 300) + rand(-30, 30),
      life: rand(0.05, 0.15), color: flashColor, r: rand(2, 4),
    });
  }

  // Rockets + grenade launcher both ride the rocket projectile system.
  // The GL adds `bounces` so it ricochets off obstacles once before
  // detonating (see updateRockets).
  // Perk-derived bonuses, sampled per-shot.
  const dmgMult = perkMult('damageMult') * playerLastStandMult(p);
  const spreadMult = perkMult('spreadMult');
  const explodeMult = perkMult('explodeMult');
  if (weap.isRocket || weap.isProjectile) {
    Game.rockets.push({
      x: muzzleX, y: muzzleY,
      vx: Math.cos(p.angle) * weap.bulletSpeed,
      vy: Math.sin(p.angle) * weap.bulletSpeed,
      life: weap.bulletRange / weap.bulletSpeed,
      owner: 'player',
      explodeRadius: (weap.explodeRadius || 100) * explodeMult,
      damage: weap.damage * dmgMult,
      bounces: weap.bounces || 0,
    });
    return;
  }
  // Chainsaw: melee — no bullets fired. Cone damage is applied directly.
  if (weap.isMelee) { applyMeleeCone(p, weap); return; }

  for (let k = 0; k < weap.pellets; k++) {
    const ang = p.angle + (Math.random() - 0.5) * (weap.spread * spreadMult) * 2 * (weap.pellets > 1 ? 1 : 1);
    const b = {
      x: muzzleX, y: muzzleY,
      vx: Math.cos(ang) * weap.bulletSpeed,
      vy: Math.sin(ang) * weap.bulletSpeed,
      life: weap.bulletRange / weap.bulletSpeed,
      damage: weap.damage * dmgMult,
      owner: 'player',
      weapon: p.weapon,
    };
    // Crossbow: bolt passes through up to `pierce` zombies. The pierced
    // set tracks who's already been damaged so a single bolt can't double-
    // dip on the same zombie when its hitbox lingers a frame.
    if (weap.pierce) { b.pierce = weap.pierce; b._pierced = new Set(); }
    // Flamethrower: short-range bullet that ignites whatever it hits.
    if (weap.ignites) { b.ignites = true; b.color = '#ff7a33'; }
    Game.bullets.push(b);
  }
}

// Chainsaw cone — damage every zombie inside meleeRange/meleeCone in front
// of the player. Called per fire tick (saw has fireRate 0.1, so 10 ticks/sec).
function applyMeleeCone(p, weap) {
  Audio.sfx[weap.sfx]();
  p.muzzleFlash = 0.6;
  const reach = weap.meleeRange || 35;
  const cone = weap.meleeCone || 0.9;
  const halfCone = cone / 2;
  const near = Spatial.query(p.x, p.y, reach + 30, []);
  for (let i = 0; i < near.length; i++) {
    const z = near[i];
    const dx = z.x - p.x, dy = z.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > reach + z.r) continue;
    let ang = Math.atan2(dy, dx) - p.angle;
    while (ang > Math.PI) ang -= Math.PI * 2;
    while (ang < -Math.PI) ang += Math.PI * 2;
    if (Math.abs(ang) > halfCone) continue;
    // Saw bypasses Riot frontDR (cleavesArmor: true) — damageZombie checks
    // the weapon name and skips the DR mul.
    damageZombie(z, weap.damage, 'saw', p.x, p.y);
    // Splash a little blood toward the hit point for feedback.
    spawnBlood(z.x, z.y, Math.atan2(dy, dx));
  }
  // A few sparks for chainsaw oomph.
  for (let i = 0; i < 2; i++) {
    Game.particles.push({
      x: p.x + Math.cos(p.angle) * (reach * 0.6 + rand(-6, 6)),
      y: p.y + Math.sin(p.angle) * (reach * 0.6 + rand(-6, 6)),
      vx: rand(-80, 80), vy: rand(-120, -20),
      life: 0.18, color: '#ffe066', r: rand(1.5, 2.5),
    });
  }
}

// Railgun beam — hitscan from the player along p.angle. Damages every zombie
// it crosses (piercesAll); blocked by static obstacles + player walls.
function fireRailgunBeam(p, weap) {
  Audio.sfx[weap.sfx]();
  p.muzzleFlash = 1.4;
  screenShake(8, 0.3);
  const range = weap.bulletRange || 2000;
  const ux = Math.cos(p.angle), uy = Math.sin(p.angle);
  // Find the closest blocking obstacle along the ray (limits beam length).
  let maxT = range;
  const x2 = p.x + ux * range, y2 = p.y + uy * range;
  World.forEachObstacleNear((p.x + x2) / 2, (p.y + y2) / 2, range / 2 + TILE_SIZE, (o) => {
    if (o.shootThrough) return;
    const hit = segmentRectHit(p.x, p.y, x2, y2, o);
    if (hit) {
      const t = hit.t * range;
      if (t < maxT) maxT = t;
    }
  });
  for (const w of Game.walls) {
    const hit = segmentRectHit(p.x, p.y, x2, y2, w);
    if (hit) {
      const t = hit.t * range;
      if (t < maxT) maxT = t;
    }
  }
  const endX = p.x + ux * maxT, endY = p.y + uy * maxT;
  // Damage every zombie whose center sits within ~r of the segment.
  const midX = (p.x + endX) / 2, midY = (p.y + endY) / 2;
  const near = Spatial.query(midX, midY, maxT / 2 + 40, []);
  for (const z of near) {
    // Foot of perpendicular from z onto the segment
    const dx = endX - p.x, dy = endY - p.y;
    const tProj = ((z.x - p.x) * dx + (z.y - p.y) * dy) / (dx * dx + dy * dy);
    if (tProj < 0 || tProj > 1) continue;
    const fx = p.x + dx * tProj, fy = p.y + dy * tProj;
    const perp = Math.hypot(z.x - fx, z.y - fy);
    if (perp < z.r + 3) {
      damageZombie(z, weap.damage, 'railgun', p.x, p.y);
      spawnBlood(z.x, z.y, p.angle);
    }
  }
  // Visual: lingering beam particle along the path
  const steps = Math.max(8, Math.floor(maxT / 24));
  for (let i = 0; i < steps; i++) {
    const t = i / steps;
    Game.particles.push({
      x: p.x + ux * maxT * t, y: p.y + uy * maxT * t,
      vx: rand(-6, 6), vy: rand(-6, 6),
      life: rand(0.18, 0.32), color: '#9fc4ff', r: rand(2, 3.5),
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
      if (obstacleHit) return;
      if (o.walkable) return; // manhole / rug — bullets pass over
      if (circleRectCollide(b.x, b.y, 1, o.x, o.y, o.w, o.h)) obstacleHit = o;
    });
    if (obstacleHit) {
      if (obstacleHit.maxHp) damageObstacle(obstacleHit, b.damage, 'bullet');
      // shootThrough (chainlink fence, whiteboard, bush) — bullet keeps
      // going, having paid the obstacle a bit of damage on the way through.
      if (!obstacleHit.shootThrough) {
        spawnSpark(b.x, b.y);
        Game.bullets.splice(i, 1);
        continue outer;
      }
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
    let consumed = false;
    for (let j = 0; j < nearZ.length && !consumed; j++) {
      const z = nearZ[j];
      const dx = b.x - z.x, dy = b.y - z.y;
      if (dx*dx + dy*dy < z.r * z.r) {
        // Crossbow pierce — don't double-hit the same zombie if its hitbox
        // overlaps the bullet two frames in a row.
        if (b._pierced && b._pierced.has(z)) continue;
        damageZombie(z, b.damage, b.weapon, b.x - b.vx * 0.05, b.y - b.vy * 0.05);
        spawnBlood(b.x, b.y, Math.atan2(b.vy, b.vx));
        // Flamethrower ignites on contact.
        if (b.ignites) { z.onFire = Math.max(z.onFire || 0, 2.0); }
        if (b._pierced) {
          b._pierced.add(z);
          if (b.pierce > 0) { b.pierce--; b.damage *= 0.75; }
          else { Game.bullets.splice(i, 1); consumed = true; }
        } else {
          Game.bullets.splice(i, 1);
          consumed = true;
        }
      }
    }
    if (consumed) continue outer;
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
    let obstacleHit = null;
    World.forEachObstacleNear(r.x, r.y, TILE_SIZE, (o) => {
      if (obstacleHit) return;
      if (o.walkable) return;
      if (circleRectCollide(r.x, r.y, 3, o.x, o.y, o.w, o.h)) obstacleHit = o;
    });
    if (obstacleHit) {
      // Grenade launcher: bounce off and keep going. Each bounce decrements
      // r.bounces; when it reaches 0 the next hit detonates.
      if (r.bounces > 0) {
        const prevX = r.x - r.vx * dt, prevY = r.y - r.vy * dt;
        const inX = prevX > obstacleHit.x && prevX < obstacleHit.x + obstacleHit.w;
        if (inX) r.vy = -r.vy; else r.vx = -r.vx;
        r.x = prevX; r.y = prevY;
        r.bounces--;
      } else {
        explodeAt(r.x, r.y, r.explodeRadius, r.damage, 'rocket');
        Game.rockets.splice(i, 1);
        continue outer;
      }
    }
    let wallHit = null;
    for (const w of Game.walls) {
      if (circleRectCollide(r.x, r.y, 3, w.x, w.y, w.w, w.h)) { wallHit = w; break; }
    }
    if (wallHit) {
      if (r.bounces > 0) {
        const prevX = r.x - r.vx * dt, prevY = r.y - r.vy * dt;
        const inX = prevX > wallHit.x && prevX < wallHit.x + wallHit.w;
        if (inX) r.vy = -r.vy; else r.vx = -r.vx;
        r.x = prevX; r.y = prevY;
        r.bounces--;
      } else {
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
      damageZombie(z, damage * falloff, source, x, y);
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
  // ---------- Tier-3 death effects ----------
  // Bomber: blast + small toxic puff on death.
  if (z.onDeathExplode) {
    explodeAt(z.x, z.y, z.onDeathExplode.r || 80, z.onDeathExplode.dmg || 50, 'bomber');
    spawnPuddle(z.x, z.y, 60, 3, 'toxic');
  }
  // Hive Sac: scatter a starburst of hatchlings.
  if (z.burstOnDeath) {
    const b = z.burstOnDeath;
    for (let i = 0; i < (b.count || 5); i++) {
      const a = (i / (b.count || 5)) * Math.PI * 2;
      const r = b.spreadR || 60;
      spawnZombieAt(b.type || 'hatch', z.x + Math.cos(a) * r, z.y + Math.sin(a) * r);
    }
  }
  // Conjoined Twins: split into N smaller zombies on death.
  if (z.onDeathSplit) {
    const s = z.onDeathSplit;
    for (let i = 0; i < (s.count || 2); i++) {
      const a = (i / (s.count || 2)) * Math.PI * 2;
      const child = spawnZombieAt(s.type || 'walker', z.x + Math.cos(a) * 22, z.y + Math.sin(a) * 22);
      if (child) {
        child.hp = child.maxHp * (s.hpPct || 0.5);
      }
    }
  }
  // Bloater: leaves a lingering toxic cloud.
  if (z.deathCloud) {
    spawnPuddle(z.x, z.y, z.deathCloud.r || 100, z.deathCloud.life || 4, 'toxic');
    Game.puddles[Game.puddles.length - 1].dps = z.deathCloud.dps || 5;
  }
  // Cluster: when this anchor dies, its remaining hatchling defenders are
  // visibly orphaned. No special cleanup — the def's score handles the
  // wave-clearing reward.

  // Necromancer / corpse log: any kill registers a corpse so a nearby necro
  // can raise it on the next cycle. Trim happens in tick.
  Game.corpseLog.push({ x: z.x, y: z.y, type: z.type, until: now() + 6 });

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
  // Independent scrap drop — most zombies have a few coins / belt buckles /
  // scrap metal on them. Tanks drop more, hatchlings/crawlers drop less.
  const scrapRoll = Math.random();
  let scrapChance = 0.06;
  let scrapAmt = 1;
  if (z.type === 'tank')      { scrapChance = 0.85; scrapAmt = randi(3, 6); }
  else if (z.type === 'brood' || z.type === 'cent') { scrapChance = 0.95; scrapAmt = randi(4, 8); }
  else if (z.type === 'riot') { scrapChance = 0.45; scrapAmt = randi(2, 4); }
  else if (z.type === 'fire' || z.type === 'charger' || z.type === 'reaper') {
    scrapChance = 0.20; scrapAmt = randi(1, 3);
  }
  else if (z.type === 'hatch' || z.type === 'crawler') {
    scrapChance = 0.03;
  }
  if (scrapRoll < scrapChance) {
    const boosted = Math.max(1, Math.round(scrapAmt * perkMult('scrapMult')));
    Game.pickups.push({
      x: z.x, y: z.y, r: 12, type: `item_scrap_${boosted}`, life: 25,
    });
  }
  const idx = Game.zombies.indexOf(z);
  if (idx >= 0) Game.zombies.splice(idx, 1);
}

// Tanks bias toward big, useful loot.
function spawnTankDrop(x, y) {
  const opts = ['ammo_smg', 'ammo_rocket', 'wall', 'barrel', 'health', 'ammo_pistol'];
  const weights = [3, 2.5, 3, 2, 1.5, 2];
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
    'health', 'ammo_pistol', 'ammo_shotgun', 'ammo_smg', 'ammo_rocket', 'barrel', 'wall',
    // Expansion ammo. Locked weapons can still drop ammo — picking it up
    // unlocks the weapon (same UX as shotgun/smg/rocket).
    'ammo_crossbow', 'ammo_flamer', 'ammo_minigun', 'ammo_railgun', 'ammo_gl', 'saw',
  ];
  const weights = [
    3,
    // Pistol rounds: high weight always so the player's fallback weapon
    // doesn't dry up. Falls off slightly when reserves are already full.
    p.ammo.pistol.reserve < 80 ? 4 : 1,
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

function damagePlayer(amount, attacker, opts) {
  const p = Game.player;
  if (p.dead) return;
  const isDot = opts && opts.dot;
  // DOT (puddle / bloater gas) bypasses iframes — otherwise standing in a
  // pool would only tick once per 0.6s and feel like nothing.
  if (!isDot && p.iframe > 0) return;
  p.hp -= amount;
  if (!isDot) p.iframe = 0.6 + perkSum('iframeBonus');
  // Tag "recently damaged" so the Field Medic regen perk knows when to pause.
  p.lastHurtAt = now();
  if (!isDot) Audio.sfx.hurt();
  if (!isDot) screenShake(6, 0.2);
  // Frost walker: each hit chills the player. Multipliers don't stack —
  // we just refresh the timer with the highest chill the attacker has.
  if (attacker && attacker.chillOnHit) {
    const ch = attacker.chillOnHit;
    p.chilledUntil = now() + (ch.ms / 1000);
    p.chillMult = 1 - (ch.pct || 0.4);
  }
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

// ---------- Tier-3 zombie behaviors ----------
// Per-type ticks that run BEFORE the regular steering. They handle ranged
// attacks (spitter), state machines (charger), spawn-on-walk (brood), aura
// effects (screamer, bloater), mimic ambush trigger, and necro raise.
function tier3PreTick(z, dt, p) {
  // Spitter — periodic ranged spit. Arc projectile, leaves a small toxic
  // puddle on impact.
  if (z.ranged && p && !p.dead) {
    z.fireCd -= dt;
    const dx = p.x - z.x, dy = p.y - z.y;
    const d2 = dx * dx + dy * dy;
    const r = z.range || 280;
    if (z.fireCd <= 0 && d2 < r * r && d2 > 30 * 30) {
      const ang = Math.atan2(dy, dx);
      Game.zombieProjectiles.push({
        x: z.x, y: z.y,
        vx: Math.cos(ang) * 380, vy: Math.sin(ang) * 380,
        life: 1.4,
        damage: z.projectileDamage || z.damage,
        owner: z, kind: 'spit',
      });
      z.fireCd = z.fireCooldown || 2.5;
    }
  }

  // Brood Mother — drops a crawler periodically while walking.
  if (z.spawnsOnWalk) {
    z.walkSpawnT -= dt;
    if (z.walkSpawnT <= 0) {
      spawnZombieAt(z.spawnsOnWalk, z.x, z.y);
      z.walkSpawnT = z.spawnEvery || 3.5;
    }
  }

  // Necromancer — every `raiseInterval` revive the nearest tracked corpse.
  if (z.raisesNearby) {
    z.raiseT -= dt;
    if (z.raiseT <= 0 && Game.corpseLog.length > 0) {
      // Find nearest tracked corpse within 280px.
      let bestIdx = -1, bestD = 280 * 280;
      for (let i = 0; i < Game.corpseLog.length; i++) {
        const c = Game.corpseLog[i];
        const dx = c.x - z.x, dy = c.y - z.y;
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; bestIdx = i; }
      }
      if (bestIdx >= 0) {
        const c = Game.corpseLog[bestIdx];
        Game.corpseLog.splice(bestIdx, 1);
        const raised = spawnZombieAt('walker', c.x, c.y);
        if (raised) raised.hp = raised.maxHp * (z.raiseHpPct || 0.5);
        // Sparkle
        for (let k = 0; k < 6; k++) {
          Game.particles.push({
            x: c.x, y: c.y,
            vx: rand(-60, 60), vy: rand(-100, -10),
            life: 0.6, color: '#a06fff', r: rand(2, 3),
          });
        }
      }
      z.raiseT = z.raiseInterval || 6;
    }
  }

  // Charger — three-state AI. idle → telegraph → charging → recover.
  if (z.charge && p && !p.dead) {
    const c = z.charge;
    z.chargeCd -= dt;
    if (z.chargeState === 'idle') {
      const dx = p.x - z.x, dy = p.y - z.y;
      const d2 = dx * dx + dy * dy;
      const r = c.range || 380;
      if (z.chargeCd <= 0 && d2 < r * r && d2 > 90 * 90) {
        z.chargeState = 'telegraph';
        z.chargeT = c.telegraph || 0.8;
      }
    } else if (z.chargeState === 'telegraph') {
      z.chargeT -= dt;
      // Visual stomp particles during the telegraph windup.
      if (Math.random() < 6 * dt) {
        Game.particles.push({
          x: z.x + rand(-z.r, z.r), y: z.y + z.r,
          vx: rand(-20, 20), vy: rand(-40, -10),
          life: 0.3, color: '#cad0d8', r: rand(2, 3),
        });
      }
      if (z.chargeT <= 0) {
        // Lock direction based on player position at end of telegraph.
        const dx = p.x - z.x, dy = p.y - z.y;
        const dn = Math.hypot(dx, dy) || 1;
        z.chargeDx = dx / dn; z.chargeDy = dy / dn;
        z.chargeState = 'charging';
        z.chargeT = 1.2;
      }
    } else if (z.chargeState === 'charging') {
      z.chargeT -= dt;
      if (z.chargeT <= 0) {
        z.chargeState = 'recover';
        z.chargeT = 0.8;
      }
    } else if (z.chargeState === 'recover') {
      z.chargeT -= dt;
      if (z.chargeT <= 0) {
        z.chargeState = 'idle';
        z.chargeCd = c.cooldown || 4;
      }
    }
  }

  // Screamer aura — boost the speed of zombies inside auraR for this frame.
  // Done by SETTING a derived "speedBoost" on neighbors that updateZombies'
  // movement code reads. We reset it each frame by writing 1 in pre-tick.
  if (z.auraBuff) {
    const near = Spatial.query(z.x, z.y, z.auraR || 120, []);
    for (const o of near) {
      if (o === z) continue;
      o.speedBoost = Math.max(o.speedBoost || 1, z.auraSpeedMult || 1.5);
    }
  }

  // Bloater aura — damage the player when in radius (DOT-style, ignores iframes).
  if (z.gasAura && p && !p.dead) {
    const dx = p.x - z.x, dy = p.y - z.y;
    if (dx * dx + dy * dy < (z.gasAura.r || 60) ** 2) {
      damagePlayer((z.gasAura.dps || 3) * dt, z, { dot: true });
    }
  }

  // Mimic — opens when the player gets close, then bites on contact.
  if (z.disguised) {
    const dx = p.x - z.x, dy = p.y - z.y;
    const trig = (z.triggerR || 22);
    if (dx * dx + dy * dy < trig * trig) {
      z.mimicOpen = Math.min(1, (z.mimicOpen || 0) + dt * 5);
      z.disguised = z.mimicOpen >= 1 ? false : z.disguised;
    } else {
      z.mimicOpen = Math.max(0, (z.mimicOpen || 0) - dt * 2);
    }
    z.angle = z.mimicOpen; // sprite reads angle as open-factor 0..1
  }
}

// Stationary spawner tick (cluster, shrieker, hivesac, mimic). Called from
// updateZombies for any zombie flagged `stationary`. Returns true to signal
// "skip movement / nav for this zombie".
function updateStationarySpawner(z, dt, p) {
  // Infection cluster — spawns hatchling defenders, regenerates per defender.
  if (z.spawns) {
    // count live children (cheap O(N) — we only have a handful of clusters)
    let alive = 0;
    for (const o of Game.zombies) {
      if (o._spawnedBy === z && o.hp > 0) alive++;
    }
    z.childrenAlive = alive;
    if (alive > 0 && z.tendrilHeal) {
      z.hp = Math.min(z.maxHp, z.hp + z.tendrilHeal * alive * dt);
    }
    z.spawnT -= dt;
    if (z.spawnT <= 0 && alive < (z.spawnCap || 6)) {
      const a = Math.random() * Math.PI * 2;
      const child = spawnZombieAt(z.spawns,
        z.x + Math.cos(a) * (z.r + 16),
        z.y + Math.sin(a) * (z.r + 16));
      if (child) child._spawnedBy = z;
      z.spawnT = z.spawnInterval || 4;
    }
  }
  // Shrieker — calls the horde. Spawns walkers at the world edge near player.
  if (z.callsHorde) {
    z.callT -= dt;
    if (z.callT <= 0) {
      for (let i = 0; i < (z.callCount || 2); i++) {
        spawnZombieAtEdge(z.callType || 'walker');
      }
      z.callT = z.callInterval || 2;
    }
  }
}

// ---------- Zombies ----------
function updateZombies(dt) {
  const p = Game.player;
  const zs = Game.zombies;
  // Reset per-frame derived stats (screamer aura writes into o.speedBoost,
  // so we zero it at the start of each tick).
  for (let i = 0; i < zs.length; i++) zs[i].speedBoost = 1;

  // Trim corpse log: drop entries older than `until`.
  if (Game.corpseLog && Game.corpseLog.length) {
    const t = now();
    Game.corpseLog = Game.corpseLog.filter(c => c.until > t);
  }

  for (let i = 0; i < zs.length; i++) {
    const z = zs[i];

    // Tier-3 pre-tick (ranged, charger state, brood spawn, screamer aura,
    // bloater gas, mimic trigger, necro raise).
    tier3PreTick(z, dt, p);

    if (z.stunned > 0) { z.stunned -= dt; continue; }

    // Stationary — runs its own spawner/caller tick, then skips movement.
    if (z.stationary) {
      updateStationarySpawner(z, dt, p);
      // Mimic: damages on contact once open.
      if (z.disguised === false && z.mimicOpen >= 1) {
        const minD = z.r + p.r + 2;
        if (Math.hypot(p.x - z.x, p.y - z.y) <= minD) {
          z.hitCd = (z.hitCd || 0) - dt;
          if (z.hitCd <= 0) {
            damagePlayer(z.ambushBite || z.damage, z);
            z.hitCd = 0.6;
          }
        }
      }
      continue;
    }

    // Charger override: while charging, move along the locked vector and
    // skip the normal flow-field steering.
    if (z.charge && z.chargeState === 'charging') {
      z.x += z.chargeDx * z.charge.speed * dt;
      z.y += z.chargeDy * z.charge.speed * dt;
      z.angle = Math.atan2(z.chargeDy, z.chargeDx);
      if (!z.ignoresWalls) {
        World.forEachObstacleNear(z.x, z.y, z.r + TILE_SIZE, (o) => {
          if (!o.walkable) resolveCircleRect(z, o);
        });
        for (const w of Game.walls) resolveCircleRect(z, w);
      }
      // Contact damage (with stun) — same player-damage path but boosted.
      if (Math.hypot(p.x - z.x, p.y - z.y) <= p.r + z.r) {
        if ((z.hitCd || 0) <= 0) {
          damagePlayer(z.damage * 1.4, z);
          // Brief immobilize via chill mult — easier than a separate stun system.
          if (!p.dead) {
            p.chilledUntil = now() + (z.charge.stunMs || 800) / 1000;
            p.chillMult = 0.15;
          }
          z.hitCd = 0.6;
          z.chargeState = 'recover';
          z.chargeT = 0.8;
        }
      }
      continue;
    }
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
    // Screamer aura applies as a per-frame speed boost (set in tier3PreTick).
    const speedMul = z.speedBoost || 1;
    z.x += vx * z.speed * speedMul * dt;
    z.y += vy * z.speed * speedMul * dt;
    // facing + walk cycle
    z.angle = Math.atan2(dy, dx);
    z.walkPhase = (z.walkPhase + dt * (z.speed / 35)) % 1;
    // Wraith: ignoresWalls — phase through obstacles and player walls. Still
    // clamp to the world bounds so it doesn't escape the arena.
    if (!z.ignoresWalls) {
      World.forEachObstacleNear(z.x, z.y, z.r + TILE_SIZE, (o) => {
        if (!o.walkable) resolveCircleRect(z, o);
      });
      for (const w of Game.walls) resolveCircleRect(z, w);
      World.forEachActiveChest(z.x, z.y, (c) => { if (!c.opened) resolveCircleRect(z, c); });
    }
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

    // damage player on contact. Reaper has meleeReach so a scythe-arm hits
    // over crates / from outside the regular contact ring. Spitter is
    // ranged and shouldn't melee; gate by checking z.damage.
    z.hitCd -= dt;
    if (z.hitCd < 0) z.hitCd = 0;
    if (z.damage > 0) {
      const reach = z.meleeReach ? z.meleeReach + p.r : p.r + z.r + 1.5;
      if (Math.hypot(p.x - z.x, p.y - z.y) <= reach) {
        if (z.hitCd <= 0) {
          damagePlayer(z.damage, z);
          z.hitCd = 0.6;
        }
      }
    }

    // groan occasionally — louder when recently alerted by gunfire.
    if ((z.aggroT || 0) > 0) z.aggroT -= dt;
    const groanChance = (z.aggroT || 0) > 0 ? 0.012 : 0.002;
    if (Math.random() < groanChance) Audio.sfx.groan();
  }
}

// ---------- Zombie projectiles (spitter goo) ----------
function updateZombieProjectiles(dt) {
  if (!Game.zombieProjectiles) return;
  const p = Game.player;
  for (let i = Game.zombieProjectiles.length - 1; i >= 0; i--) {
    const pr = Game.zombieProjectiles[i];
    pr.x += pr.vx * dt; pr.y += pr.vy * dt;
    pr.life -= dt;
    // trail
    if (Math.random() < 0.6) {
      Game.particles.push({
        x: pr.x, y: pr.y,
        vx: rand(-30, 30), vy: rand(-30, 30),
        life: 0.3, color: '#a4c45a', r: rand(1.5, 3),
      });
    }
    let consumed = false;
    // player hit
    if (!p.dead && Math.hypot(p.x - pr.x, p.y - pr.y) < p.r + 4) {
      damagePlayer(pr.damage, pr.owner);
      consumed = true;
    }
    // obstacle hit
    if (!consumed) {
      World.forEachObstacleNear(pr.x, pr.y, TILE_SIZE, (o) => {
        if (consumed || o.walkable) return;
        if (circleRectCollide(pr.x, pr.y, 3, o.x, o.y, o.w, o.h)) consumed = true;
      });
    }
    if (consumed || pr.life <= 0) {
      // splash a small toxic puddle wherever the projectile died.
      spawnPuddle(pr.x, pr.y, 36, 2.2, 'toxic');
      Game.zombieProjectiles.splice(i, 1);
    }
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
  const magnet = perkSum('pickupRange');
  for (let i = Game.pickups.length - 1; i >= 0; i--) {
    const pk = Game.pickups[i];
    pk.life -= dt;
    if (pk.life <= 0) { Game.pickups.splice(i, 1); continue; }
    const d = Math.hypot(p.x - pk.x, p.y - pk.y);
    const reach = p.r + pk.r;
    // Magnet perk: items within (reach * (1 + magnet)) drift toward the player
    // so they get vacuumed instead of needing a precise step.
    if (magnet > 0 && d < reach * (1 + magnet) && d > reach) {
      const k = 400 * dt / Math.max(1, d);
      pk.x += (p.x - pk.x) * k;
      pk.y += (p.y - pk.y) * k;
    }
    if (d < reach) {
      applyPickup(pk.type);
      Game.pickups.splice(i, 1);
      Audio.sfx.pickup();
    }
  }
}
function applyPickup(type) {
  const p = Game.player;
  // Big Mags perk: scale all ammo-pickup amounts (not health/walls/scrap).
  const bm = 1 + perkSum('ammoBonus');
  const ammoUp = (n) => Math.round(n * bm);
  switch (type) {
    case 'health': p.hp = Math.min(p.maxHp, p.hp + 35); setNotice('+35 HP', 1.5); break;
    case 'ammo_pistol': {
      const n = ammoUp(24);
      p.ammo.pistol.reserve += n; setNotice(`+${n} pistol rounds`, 1.5); break;
    }
    case 'ammo_shotgun': {
      if (!p.unlocked.shotgun) unlockWeapon('shotgun', 12, 'SHOTGUN PICKED UP');
      const n = ammoUp(12);
      p.ammo.shotgun.reserve += n; setNotice(`+${n} shells`, 1.5); break;
    }
    case 'ammo_smg': {
      if (!p.unlocked.smg) unlockWeapon('smg', 80, 'SMG PICKED UP');
      const n = ammoUp(60);
      p.ammo.smg.reserve += n; setNotice(`+${n} rounds`, 1.5); break;
    }
    case 'ammo_rocket': {
      if (!p.unlocked.rocket) unlockWeapon('rocket', 3, 'ROCKETS PICKED UP');
      const n = ammoUp(2);
      p.ammo.rocket.reserve += n; setNotice(`+${n} rockets`, 1.5); break;
    }
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
    default:
      // Generic item pickups route through the inventory. Pickup `type`
      // strings shaped `item_<id>[_<count>]` resolve to an ITEMS entry.
      // Only a trailing `_<digits>` is treated as a count, so multi-word
      // ids like `item_bear_trap` round-trip cleanly.
      if (typeof type === 'string' && type.startsWith('item_')) {
        const rest = type.slice(5);
        let id = rest, n = 1;
        const m = rest.match(/^(.+)_(\d+)$/);
        if (m) { id = m[1]; n = parseInt(m[2], 10); }
        if (ITEMS[id]) {
          const left = addItem(p.inventory, id, n);
          const got = n - left;
          if (got > 0) setNotice(`+${got} ${ITEMS[id].name}`, 1.2);
          else setNotice('Inventory full', 1.2);
        }
      }
      break;
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

      // Seed at most one survivor per chunk on first activation. Internally
      // a flag on `chunk.survivorSeeded` makes this a one-shot.
      if (typeof maybeSpawnSurvivorsInActiveChunk === 'function') {
        maybeSpawnSurvivorsInActiveChunk(chunk, ccx + ',' + ccy);
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
  updateZombieProjectiles(dt);
  updateSquad(dt);
  updateBullets(dt);
  updateRockets(dt);
  updatePuddles(dt);
  updateBarrels(dt);
  updatePickups(dt);
  updateExplosions(dt);
  updateParticles(dt);
  updateDayCycle(dt);
  // Tinker perk: walls auto-repair when not being chewed. Skipped if no
  // perks gives the buff so it costs nothing on the common path.
  const wallRep = perkSum('wallRepair');
  if (wallRep > 0) {
    for (const w of Game.walls) {
      if (w.hp < w.maxHp) w.hp = Math.min(w.maxHp, w.hp + wallRep * dt);
    }
  }
  if (shakeTime > 0) { shakeTime -= dt; if (shakeTime <= 0) { shakeAmt = 0; } }
  // Autosave every 5 seconds of play.
  Game.saveTimer = (Game.saveTimer || 0) + dt;
  if (Game.saveTimer > 5) { Game.saveTimer = 0; saveGame(); }
}
