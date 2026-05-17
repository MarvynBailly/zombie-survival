'use strict';

// Dev cheats. Loaded only on dev.html. Production (index.html) never sets
// window.__dev, so all guard checks in game.js short-circuit to no-op.
//
// State lives on window.__dev so the hook checks in game.js can read it
// without any import wiring.

window.__dev = window.__dev || {
  godmode: false,
  fly: false,
  speedMul: 1,
  timescale: 1,
};

const Cheats = {
  // ---- toggles ----
  setGod(on) {
    window.__dev.godmode = !!on;
    return `god ${on ? 'ON' : 'OFF'}`;
  },
  setFly(on) {
    window.__dev.fly = !!on;
    return `fly ${on ? 'ON' : 'OFF'}`;
  },
  setSpeed(mult) {
    const m = Number(mult);
    if (!isFinite(m) || m <= 0) return `bad speed: ${mult}`;
    window.__dev.speedMul = m;
    return `speed x${m}`;
  },

  // ---- world ----
  // Mark every chunk explored and every zone's POI discovered. POI discovery
  // uses zone keys "zx,zy" — matches Game.discoveredPOIs (see game.js:3593).
  revealMap() {
    if (!window.World || !window.Game) return 'world not initialized';
    const W = window.World, G = window.Game;
    for (let cy = 0; cy < W.rows; cy++) {
      for (let cx = 0; cx < W.cols; cx++) {
        G.exploredChunks.add(`${cx},${cy}`);
      }
    }
    const zonesX = Math.ceil(W.cols / ZONE_CHUNKS);
    const zonesY = Math.ceil(W.rows / ZONE_CHUNKS);
    let pois = 0;
    for (let zy = 0; zy < zonesY; zy++) {
      for (let zx = 0; zx < zonesX; zx++) {
        const poi = poiForZone(W.seed, zx, zy, W.region, W);
        if (poi) {
          G.discoveredPOIs.add(`${zx},${zy}`);
          pois++;
        }
      }
    }
    return `revealed ${W.cols * W.rows} chunks, ${pois} POIs`;
  },

  // ---- player ----
  teleport(x, y) {
    if (!window.Game || !window.Game.player) return 'no player';
    const px = Number(x), py = Number(y);
    if (!isFinite(px) || !isFinite(py)) return `bad coords: ${x},${y}`;
    const p = window.Game.player;
    p.x = px;
    p.y = py;
    p.vx = 0;
    p.vy = 0;
    return `teleported to ${px|0},${py|0}`;
  },

  heal() {
    if (!window.Game || !window.Game.player) return 'no player';
    const p = window.Game.player;
    p.hp = p.maxHp;
    p.iframe = 1;
    if (p.bleeding) p.bleeding = null;
    if (p.infection) p.infection = 0;
    // Refill ammo on every weapon the player has unlocked. Magazine
    // capacities + starting reserves vary by weapon — pull from WEAPONS.
    if (typeof WEAPONS !== 'undefined' && p.ammo) {
      for (const k of Object.keys(p.ammo)) {
        const def = WEAPONS[k];
        if (!def) continue;
        const a = p.ammo[k];
        if (def.mag) a.mag = def.mag;
        // Be generous: top reserves up to 5x mag size, capped at 999.
        if (def.mag) a.reserve = Math.min(999, def.mag * 5);
      }
    }
    return 'healed + refilled ammo';
  },

  // Kill every live zombie. Cleanest path: splice the array. Sprites/particles
  // will fade naturally.
  clearZombies() {
    if (!window.Game) return 'no game';
    const n = (window.Game.zombies || []).length;
    window.Game.zombies = [];
    return `cleared ${n} zombies`;
  },

  // ---- give ----
  // Give an item, a weapon, or "all". Items go through addItem (items.js);
  // weapons flip p.unlocked + refill ammo (matching weapon-pickup behavior
  // in game.js). "all" unlocks every weapon and gives 1 of every item.
  give(id, count) {
    if (!window.Game || !window.Game.player) return 'no player';
    const p = window.Game.player;
    const n = Math.max(1, parseInt(count, 10) || 1);

    if (id === 'all') {
      let weapons = 0, items = 0;
      if (typeof WEAPONS !== 'undefined') {
        for (const k of Object.keys(WEAPONS)) {
          if (giveWeapon(p, k)) weapons++;
        }
      }
      if (typeof ITEMS !== 'undefined') {
        for (const k of Object.keys(ITEMS)) {
          if (addItem(p.inventory, k, 1) === 0) items++;
        }
      }
      return `gave all: ${weapons} weapons unlocked, ${items} items`;
    }

    // Try weapon first (smaller registry, less ambiguous).
    if (typeof WEAPONS !== 'undefined' && WEAPONS[id]) {
      giveWeapon(p, id);
      return `unlocked ${id} + refilled ammo`;
    }
    if (typeof ITEMS !== 'undefined' && ITEMS[id]) {
      const left = addItem(p.inventory, id, n);
      const got = n - left;
      return left > 0 ? `gave ${got}x ${id} (${left} didn't fit)` : `gave ${got}x ${id}`;
    }
    return `unknown id: ${id}`;
  },

  // ---- spawn ----
  // Drop `count` zombies of `kind` at random angles around the player at
  // approximately `radius` px. Uses the existing spawnZombieAt helper so the
  // zombies match wave-spawned ones exactly.
  spawn(kind, count, radius) {
    if (!window.Game || !window.Game.player) return 'no player';
    if (typeof ZOMBIES === 'undefined' || !ZOMBIES[kind]) return `unknown zombie: ${kind}`;
    if (typeof spawnZombieAt !== 'function') return 'spawnZombieAt missing';
    const p = window.Game.player;
    const n = Math.max(1, parseInt(count, 10) || 1);
    const r = Math.max(20, parseFloat(radius) || 200);
    let spawned = 0;
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const x = p.x + Math.cos(ang) * r;
      const y = p.y + Math.sin(ang) * r;
      if (spawnZombieAt(kind, x, y)) spawned++;
    }
    return `spawned ${spawned}x ${kind} at r=${r|0}`;
  },

  // ---- time ----
  // Jump to the START of a named phase ('day', 'dusk', 'night', 'dawn').
  // Doesn't fire advanceDayPhase side effects (banners, perk grant, weather
  // reroll) — that would feel surprising for a dev cheat. If you want those,
  // use timescale to fast-forward instead.
  setTime(phase) {
    if (!window.Game || !window.Game.time) return 'no game';
    if (typeof DAY_PHASES === 'undefined') return 'DAY_PHASES missing';
    const target = String(phase || '').toLowerCase();
    let acc = 0, found = null;
    for (const ph of DAY_PHASES) {
      if (ph.name === target) { found = { start: acc, name: ph.name }; break; }
      acc += ph.length;
    }
    if (!found) {
      const names = DAY_PHASES.map(p => p.name).join(', ');
      return `unknown phase: ${phase} (try ${names})`;
    }
    Game.time.t = found.start;
    Game.time.phase = found.name;
    return `time set to ${found.name} (day ${Game.time.day})`;
  },

  setDay(n) {
    if (!window.Game || !window.Game.time) return 'no game';
    const d = parseInt(n, 10);
    if (!isFinite(d) || d < 1) return `bad day: ${n}`;
    Game.time.day = d;
    return `day set to ${d}`;
  },

  setTimescale(mult) {
    const m = parseFloat(mult);
    if (!isFinite(m) || m <= 0) return `bad timescale: ${mult}`;
    window.__dev.timescale = m;
    return `timescale x${m}`;
  },

  // ---- tp to POI ----
  // Enumerate every zone in the world, find POIs whose kind contains `query`
  // (case-insensitive substring), teleport to the nearest one. Returns kind
  // and coords. Useful for testing structure-specific behavior.
  tpToPoi(query) {
    if (!window.World || !window.Game || !window.Game.player) return 'world not ready';
    const W = window.World, p = window.Game.player;
    const q = String(query || '').toLowerCase();
    if (!q) return 'usage: tp <poi-kind>';
    const zonesX = Math.ceil(W.cols / ZONE_CHUNKS);
    const zonesY = Math.ceil(W.rows / ZONE_CHUNKS);
    let best = null, bestD2 = Infinity;
    for (let zy = 0; zy < zonesY; zy++) {
      for (let zx = 0; zx < zonesX; zx++) {
        const poi = poiForZone(W.seed, zx, zy, W.region, W);
        if (!poi || !poi.kind) continue;
        if (!poi.kind.toLowerCase().includes(q)) continue;
        // Zone center in world pixels.
        const cx = (zx * ZONE_CHUNKS + ZONE_CHUNKS / 2) * CHUNK_SIZE;
        const cy = (zy * ZONE_CHUNKS + ZONE_CHUNKS / 2) * CHUNK_SIZE;
        const d2 = (cx - p.x) * (cx - p.x) + (cy - p.y) * (cy - p.y);
        if (d2 < bestD2) { bestD2 = d2; best = { kind: poi.kind, x: cx, y: cy }; }
      }
    }
    if (!best) return `no POI matched "${query}"`;
    p.x = best.x; p.y = best.y; p.vx = 0; p.vy = 0;
    return `teleported to ${best.kind} @ ${best.x|0},${best.y|0}`;
  },
};

// Unlock + refill helper. Mirrors the side of pickupWeapon() that matters
// for a god-cheat: flag unlocked, set mag to capacity, top up reserve.
function giveWeapon(p, k) {
  const def = (typeof WEAPONS !== 'undefined') && WEAPONS[k];
  if (!def) return false;
  if (p.unlocked) p.unlocked[k] = true;
  if (p.ammo) {
    p.ammo[k] = p.ammo[k] || { mag: 0, reserve: 0 };
    if (def.mag) {
      p.ammo[k].mag = def.mag;
      p.ammo[k].reserve = Math.min(999, def.mag * 5);
    }
  }
  return true;
}

window.DevCheats = Cheats;
