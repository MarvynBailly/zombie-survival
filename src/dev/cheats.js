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
};

window.DevCheats = Cheats;
