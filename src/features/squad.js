'use strict';

// ---------- Survivors & Squads ----------
// NPC companions rescued from POI buildings. Up to 3 in your squad.
// Each survivor has a class (medic / engineer / soldier), a name, and a
// short backstory blurb. They follow at a leash, take hits, and can be
// commanded to HOLD a position with `H`.
//
// State lives on Game.squad (array of recruited survivors) and
// Game.worldSurvivors (array of un-recruited survivors placed in the world).
// World survivors are kept separately so they aren't ticked by the zombie
// loop and don't get mistaken for friendlies until recruited.

const SQUAD_CAP = 3;
const SQUAD_LEASH = 90;          // pixels behind the player they try to keep
const SQUAD_TIGHT_RANGE = 60;    // tighten formation when within 60u
const SQUAD_TELEPORT_DIST = 600; // teleport back if they get lost behind walls
const SURVIVOR_RECRUIT_RADIUS = 60;

const SURVIVOR_NAMES = [
  'JUNO', 'ARI', 'MEL', 'KAI', 'ROSA', 'DEV', 'WREN', 'EZRA',
  'IRIS', 'SLOANE', 'LIO', 'TESS', 'OREN', 'PAX', 'NOA', 'FINN',
  'CASS', 'MAREN', 'VIK', 'AMI', 'THEO', 'BREN', 'INA', 'YONA',
];

const SURVIVOR_BACKSTORIES = {
  medic: [
    'ex-EMT, ran out of insulin',
    'volunteer at the free clinic',
    'still has his stethoscope',
    'studied surgery online',
    'last shift was 19 days ago',
  ],
  engineer: [
    'plumber, knows every pipe in the block',
    'hobbyist welder',
    'fixed the radio at the gas station',
    'her father built the bus stop',
    'two engineering degrees, no job',
  ],
  soldier: [
    'reservist, three deployments',
    'security guard at the courthouse',
    'taught his daughter to shoot at six',
    'last in her unit',
    'never misses, even tired',
  ],
};

// Class definitions. `update(s, dt)` is the per-tick AI; `onRecruit(s)`
// runs once at recruitment for any one-shot setup.
const SQUAD_CLASS = {
  medic: {
    color: '#8ec547',
    label: 'MEDIC',
    hp: 70,
    speed: 180,
    auraR: 80,
    healPerSec: 1.0,
    update(s, dt) {
      // Heal aura — affects player + other squadmates (not self).
      const r2 = s.auraR * s.auraR;
      const p = Game.player;
      if (p && !p.dead && p.hp < p.maxHp) {
        const dx = p.x - s.x, dy = p.y - s.y;
        if (dx * dx + dy * dy <= r2) {
          p.hp = Math.min(p.maxHp, p.hp + s.healPerSec * dt);
        }
      }
      for (const m of Game.squad) {
        if (m === s) continue;
        if (m.hp >= m.maxHp) continue;
        const dx = m.x - s.x, dy = m.y - s.y;
        if (dx * dx + dy * dy <= r2) m.hp = Math.min(m.maxHp, m.hp + s.healPerSec * dt);
      }
    },
  },
  engineer: {
    color: '#e3a83a',
    label: 'ENG',
    hp: 80,
    speed: 175,
    repairPerSec: 18,
    repairR: 70,
    update(s, dt) {
      // Repair the closest damaged wall in range. Stops moving while repairing
      // is implicit — the follow code will still try to keep up, but the
      // engineer's effective range is generous.
      let best = null, bestD = s.repairR * s.repairR;
      for (const w of Game.walls) {
        if (w.hp >= w.maxHp) continue;
        const cx = w.x + w.w / 2, cy = w.y + w.h / 2;
        const dx = cx - s.x, dy = cy - s.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD) { bestD = d2; best = w; }
      }
      if (best) {
        best.hp = Math.min(best.maxHp, best.hp + s.repairPerSec * dt);
        s.repairing = true;
      } else {
        s.repairing = false;
      }
    },
  },
  soldier: {
    color: '#d24b35',
    label: 'SOL',
    hp: 100,
    speed: 175,
    fireRange: 320,
    fireCd: 0,
    damage: 18,
    update(s, dt) {
      s.fireCd -= dt;
      if (s.fireCd > 0) return;
      // Pick the nearest live zombie inside range.
      let best = null, bestD = s.fireRange * s.fireRange;
      const zs = Game.zombies;
      for (let i = 0; i < zs.length; i++) {
        const z = zs[i];
        const dx = z.x - s.x, dy = z.y - s.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD) { bestD = d2; best = z; }
      }
      if (!best) return;
      const ang = Math.atan2(best.y - s.y, best.x - s.x);
      Game.bullets.push({
        x: s.x + Math.cos(ang) * 16,
        y: s.y + Math.sin(ang) * 16,
        vx: Math.cos(ang) * 900,
        vy: Math.sin(ang) * 900,
        life: 0.8,
        damage: s.damage,
        owner: 'squad',
        weapon: 'pistol',
      });
      s.fireCd = 0.55 + Math.random() * 0.2;
      if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx.pistol) Audio.sfx.pistol();
    },
  },
};

function pickSurvivorClass(rng) {
  const r = (rng || Math.random)();
  if (r < 0.35) return 'soldier';
  if (r < 0.70) return 'engineer';
  return 'medic';
}

// Spawn a survivor at world coords. Called from world-gen integration.
function spawnWorldSurvivor(x, y, cls, name, backstory) {
  if (!Game.worldSurvivors) Game.worldSurvivors = [];
  Game.worldSurvivors.push({
    x, y, r: 12, cls,
    name: name || (SURVIVOR_NAMES[Math.floor(Math.random() * SURVIVOR_NAMES.length)]),
    backstory: backstory || (SURVIVOR_BACKSTORIES[cls] || [''])[
      Math.floor(Math.random() * (SURVIVOR_BACKSTORIES[cls] || ['']).length)
    ],
    hp: SQUAD_CLASS[cls].hp,
    maxHp: SQUAD_CLASS[cls].hp,
    walkPhase: Math.random(),
    angle: 0,
  });
}

function findSurvivorNear(x, y, radius) {
  const wsv = Game.worldSurvivors;
  if (!wsv || wsv.length === 0) return null;
  let best = null, bestD = radius * radius;
  for (const s of wsv) {
    const dx = s.x - x, dy = s.y - y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

function recruitSurvivor(s) {
  if (!Game.squad) Game.squad = [];
  if (Game.squad.length >= SQUAD_CAP) {
    setNotice('Squad is full (3/3)', 1.5);
    return false;
  }
  const def = SQUAD_CLASS[s.cls];
  Game.squad.push({
    x: s.x, y: s.y, r: 12,
    cls: s.cls,
    name: s.name,
    backstory: s.backstory,
    hp: def.hp, maxHp: def.hp,
    angle: 0, walkPhase: 0,
    holdMode: false,
    holdX: s.x, holdY: s.y,
    fireCd: 0,
    iframe: 0,
  });
  // Remove from world list.
  const idx = Game.worldSurvivors.indexOf(s);
  if (idx >= 0) Game.worldSurvivors.splice(idx, 1);
  setNotice(`${s.name} (${def.label}) joined — ${s.backstory}`, 4);
  Audio.sfx.pickup();
  return true;
}

// Toggle HOLD for all squad members. Holding members root in place and try
// to defend it (engineer still repairs in range, soldier still fires).
function toggleSquadHold() {
  if (!Game.squad || Game.squad.length === 0) return;
  const anyMoving = Game.squad.some(m => !m.holdMode);
  for (const m of Game.squad) {
    m.holdMode = anyMoving;
    if (anyMoving) { m.holdX = m.x; m.holdY = m.y; }
  }
  setNotice(anyMoving ? 'SQUAD · HOLD' : 'SQUAD · FOLLOW', 1.5);
  Audio.sfx.click();
}

// ---------- Tick ----------
function updateSquad(dt) {
  const sq = Game.squad;
  if (!sq || sq.length === 0) return;
  const p = Game.player;
  for (let i = sq.length - 1; i >= 0; i--) {
    const s = sq[i];
    if (s.hp <= 0) {
      // Permadeath — drop a small blood splash + name notice and remove.
      for (let k = 0; k < 14; k++) {
        Game.particles.push({
          x: s.x, y: s.y,
          vx: rand(-180, 180), vy: rand(-180, 180),
          life: rand(0.4, 0.8), color: '#9a1a1a', r: rand(2, 5),
        });
      }
      setNotice(`${s.name} fell`, 3);
      sq.splice(i, 1);
      continue;
    }
    if (s.iframe > 0) s.iframe -= dt;

    // Steering: target = hold position (if HOLD) or trailing position behind player.
    let tx, ty;
    if (s.holdMode) {
      tx = s.holdX; ty = s.holdY;
    } else {
      // Stack squad members slightly off-axis so they don't all converge.
      const offsets = [[-1, 0], [0, -1], [1, 0]];
      const off = offsets[i % offsets.length];
      tx = p.x + off[0] * 30 - Math.cos(p.angle) * SQUAD_LEASH * 0.4;
      ty = p.y + off[1] * 30 - Math.sin(p.angle) * SQUAD_LEASH * 0.4;
    }

    const dx = tx - s.x, dy = ty - s.y;
    const d = Math.hypot(dx, dy);
    const def = SQUAD_CLASS[s.cls];
    let speed = def.speed;
    if (d > SQUAD_TIGHT_RANGE) speed = def.speed; // sprint to catch up
    if (d < 30) speed = 0;                        // arrived
    if (d > 1 && speed > 0) {
      const nx = dx / d, ny = dy / d;
      s.x += nx * speed * dt;
      s.y += ny * speed * dt;
      s.angle = Math.atan2(ny, nx);
      s.walkPhase = (s.walkPhase + dt * 4) % 1;
    }
    // Hard teleport if hopelessly behind (lost on the other side of a wall).
    if (!s.holdMode && d > SQUAD_TELEPORT_DIST) {
      s.x = p.x - Math.cos(p.angle) * 40;
      s.y = p.y - Math.sin(p.angle) * 40;
    }

    // Stay inside the world bounds.
    s.x = clamp(s.x, s.r, WORLD_W - s.r);
    s.y = clamp(s.y, s.r, WORLD_H - s.r);

    // Resolve out of the nearest obstacle and walls.
    World.forEachObstacleNear(s.x, s.y, s.r + TILE_SIZE, (o) => {
      if (o.walkable) return;
      resolveCircleRect(s, o);
    });
    for (const w of Game.walls) resolveCircleRect(s, w);

    // Class behavior.
    def.update(s, dt);

    // Zombie contact damage — zombies within touch radius nibble squadmates.
    const zs = Game.zombies;
    for (let k = 0; k < zs.length; k++) {
      const z = zs[k];
      const ddx = z.x - s.x, ddy = z.y - s.y;
      const dist = Math.hypot(ddx, ddy);
      if (dist < z.r + s.r) {
        if (s.iframe <= 0) {
          s.hp -= (z.damage || 8) * dt * 2;
          s.iframe = 0.4;
        }
      }
    }
  }
}

// Half-chance for a zombie to target a squadmate over the player; called
// during zombie target selection. Returns either the player or a squadmate.
function pickAggroTarget(z) {
  const sq = Game.squad;
  if (!sq || sq.length === 0 || Math.random() > 0.30) return Game.player;
  // Pick the closest squadmate inside the zombie's view radius.
  let best = Game.player, bestD = Infinity;
  for (const s of sq) {
    const dx = s.x - z.x, dy = s.y - z.y;
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

// Place survivors inside a building interior. Called from world.js POI gen
// (or — to keep this self-contained — by a "sweep" pass from game.js after
// chunk activation). We implement the sweep approach so we don't touch
// world.js.
function maybeSpawnSurvivorsInActiveChunk(chunk, chunkKey) {
  if (!chunk || chunk.survivorSeeded) return;
  chunk.survivorSeeded = true;
  // 20% chance per activated chunk. Limit to ~1 survivor max per chunk.
  if (Math.random() > 0.20) return;
  // Find a safe interior tile — any walkable spot that isn't adjacent to a
  // chest (avoid stepping on loot) and that is roughly central within the
  // chunk.
  const cx = chunk.cx, cy = chunk.cy;
  const baseX = cx * CHUNK_SIZE, baseY = cy * CHUNK_SIZE;
  // Try ~24 random points; place the first one that's free.
  for (let attempt = 0; attempt < 24; attempt++) {
    const x = baseX + 80 + Math.random() * (CHUNK_SIZE - 160);
    const y = baseY + 80 + Math.random() * (CHUNK_SIZE - 160);
    if (inObstacle(x, y, 14)) continue;
    // Skip if too close to the player (would feel like a freebie).
    const p = Game.player;
    if (Math.hypot(x - p.x, y - p.y) < 300) continue;
    const cls = pickSurvivorClass();
    spawnWorldSurvivor(x, y, cls);
    return;
  }
}
