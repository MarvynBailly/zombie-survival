'use strict';

// ---------- Prefs ----------
const prefs = (() => {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY)) || {}; }
  catch { return {}; }
})();
function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch {}
}

// ---------- Save game ----------
// Persist enough to restart this run on next launch. World is regenerated
// from its seed; we only override mutable state (player, walls, chest hp/opened).
function saveGame() {
  if (Game.mode !== 'playing' || !Game.player || Game.player.dead) return;
  // Don't write while the player is in a sewer instance — World.chunks is
  // pointing at the dungeon and persisting that would corrupt the save.
  if (Game.subworld) return;
  const chestOverrides = [];
  World.chunks.forEach((chunk, key) => {
    for (let i = 0; i < chunk.chests.length; i++) {
      const c = chunk.chests[i];
      if (c.opened || c.hp < c.maxHp) {
        chestOverrides.push({ k: key, i, op: c.opened ? 1 : 0, hp: c.hp });
      }
    }
  });
  const p = Game.player;
  const ammo = {};
  for (const k in p.ammo) {
    const a = p.ammo[k];
    ammo[k] = {
      mag: a.mag === Infinity ? -1 : a.mag,
      reserve: a.reserve === Infinity ? -1 : a.reserve,
    };
  }
  const data = {
    v: SAVE_VERSION,
    seed: World.seed,
    regionName: World.region && World.region.name,
    biome: World.region && World.region.name, // legacy alias for older readers
    levelIndex: Game.levelIndex,
    time: { day: Game.time.day, t: Game.time.t, phase: Game.time.phase },
    elapsed: Game.elapsed,
    kills: Game.kills,
    score: Game.score,
    weaponKills: Game.weaponKills,
    player: {
      x: p.x, y: p.y, hp: p.hp,
      // Infection 0..100. SAVE_VERSION 6+ field; older saves omit it and
      // restoreFromSave defaults to 0.
      infection: p.infection || 0,
      weapon: p.weapon,
      unlocked: { ...p.unlocked },
      ammo,
      inventory: p.inventory ? {
        capacity: p.inventory.capacity,
        slots: p.inventory.slots.map(s => s ? { id: s.id, count: s.count } : null),
      } : null,
    },
    walls: Game.walls.map(w => ({ x: w.x, y: w.y, w: w.w, h: w.h, hp: w.hp, maxHp: w.maxHp })),
    barrels: Game.barrels.map(b => ({ x: b.x, y: b.y, hp: b.hp })),
    chestOverrides,
    // Activated chunks (one-shot encounter spawns have already fired)
    activatedChunks: Array.from(World.chunks.entries())
      .filter(([, c]) => c.activated)
      .map(([k]) => k),
    discoveredPOIs: Array.from(Game.discoveredPOIs || []),
    exploredChunks: Array.from(Game.exploredChunks || []),
    perks: Game.perks ? {
      points: Game.perks.points,
      unlocked: Array.from(Game.perks.unlocked),
      totalEarned: Game.perks.totalEarned,
    } : null,
    squad: Game.squad ? Game.squad.map(s => ({
      x: s.x, y: s.y, cls: s.cls, name: s.name, backstory: s.backstory,
      hp: s.hp, maxHp: s.maxHp, holdMode: !!s.holdMode,
    })) : null,
    worldSurvivors: Game.worldSurvivors ? Game.worldSurvivors.map(s => ({
      x: s.x, y: s.y, cls: s.cls, name: s.name, backstory: s.backstory, hp: s.hp, maxHp: s.maxHp,
    })) : null,
    weather: (typeof WEATHER !== 'undefined') ? {
      current: WEATHER.current,
      rolledForDay: WEATHER.rolledForDay,
    } : null,
    bases:     (typeof saveBases     === 'function') ? saveBases()     : null,
    walls:     (typeof saveWalls     === 'function') ? saveWalls()     : null,
    power:     (typeof savePower     === 'function') ? savePower()     : null,
    vehicles:  (typeof saveVehicles  === 'function') ? saveVehicles()  : null,
    garages:   (typeof saveGarages   === 'function') ? saveGarages()   : null,
    cameras:   (typeof saveCameras   === 'function') ? saveCameras()   : null,
    garden:    (typeof saveGarden    === 'function') ? saveGarden()    : null,
    kitchen:   (typeof saveKitchen   === 'function') ? saveKitchen()   : null,
    moat:      (typeof saveMoat      === 'function') ? saveMoat()      : null,
    noisebox:  (typeof saveNoiseBox  === 'function') ? saveNoiseBox()  : null,
    trader:    (typeof saveTrader    === 'function') ? saveTrader()    : null,
    raid:      (typeof saveRaid      === 'function') ? saveRaid()      : null,
    trophy:    (typeof saveTrophy    === 'function') ? saveTrophy()    : null,
    lore:      (typeof saveLore      === 'function') ? saveLore()      : null,
    campfire:  (typeof saveCampfires === 'function') ? saveCampfires() : null,
    prefabs:   (typeof savePrefabs   === 'function') ? savePrefabs()   : null,
    rv:        (typeof saveRv        === 'function') ? saveRv()        : null,
    corkboard: (typeof saveCorkboard === 'function') ? saveCorkboard() : null,
    quarters:  (typeof saveQuarters  === 'function') ? saveQuarters()  : null,
    radio:     (typeof saveRadio     === 'function') ? saveRadio()     : null,
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); } catch {}
}
function loadSavedGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || d.v !== SAVE_VERSION) return null;
    return d;
  } catch { return null; }
}
function clearSavedGame() {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
}
function hasSavedGame() {
  try { return !!localStorage.getItem(SAVE_KEY); } catch { return false; }
}

// ---------- Audio ----------
const Audio = (() => {
  let ctx = null, master = null;
  let muted = !!prefs.muted;
  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.25;
    master.connect(ctx.destination);
  }
  function setMuted(m) {
    muted = m;
    prefs.muted = m;
    savePrefs();
    if (master) master.gain.value = m ? 0 : 0.25;
  }
  function tone(freq, dur, type = 'square', vol = 0.2, slide = 0) {
    if (muted) return;
    ensure(); if (!ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), ctx.currentTime + dur);
    g.gain.value = vol;
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    osc.connect(g); g.connect(master);
    osc.start(); osc.stop(ctx.currentTime + dur);
  }
  function noise(dur, vol = 0.3, bp = 1200) {
    if (muted) return;
    ensure(); if (!ctx) return;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bpFilter = ctx.createBiquadFilter();
    bpFilter.type = 'bandpass'; bpFilter.frequency.value = bp; bpFilter.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(bpFilter); bpFilter.connect(g); g.connect(master);
    src.start();
  }
  const sfx = {
    pistol: () => { tone(440, 0.06, 'square', 0.15, -200); noise(0.05, 0.15, 2000); },
    shotgun: () => { tone(180, 0.12, 'sawtooth', 0.2, -80); noise(0.15, 0.35, 800); },
    smg: () => { tone(620, 0.04, 'square', 0.1, -150); noise(0.03, 0.1, 3000); },
    rocket: () => { tone(120, 0.3, 'sawtooth', 0.2, -60); noise(0.3, 0.15, 400); },
    reload: () => { tone(300, 0.08, 'triangle', 0.1); setTimeout(() => tone(400, 0.08, 'triangle', 0.1), 80); },
    hit: () => { tone(140, 0.08, 'sawtooth', 0.15, -40); },
    hurt: () => { tone(220, 0.15, 'sawtooth', 0.2, -100); },
    groan: () => { tone(90 + Math.random() * 20, 0.25, 'sawtooth', 0.08, -30); },
    explosion: () => { noise(0.5, 0.5, 200); tone(60, 0.4, 'sawtooth', 0.3, -30); },
    pickup: () => { tone(660, 0.08, 'square', 0.15); setTimeout(() => tone(880, 0.08, 'square', 0.15), 60); },
    wave: () => { tone(440, 0.15, 'square', 0.15); setTimeout(() => tone(660, 0.15, 'square', 0.15), 120); },
    dead: () => { tone(220, 0.4, 'sawtooth', 0.3, -150); setTimeout(() => tone(110, 0.6, 'sawtooth', 0.3, -80), 200); },
    click: () => { tone(800, 0.03, 'square', 0.1); },
    empty: () => { tone(200, 0.05, 'square', 0.1); },
  };
  return { sfx, setMuted, muted: () => muted, ensure };
})();

// ---------- PocketBase ----------
let pb = null;
let pbOffline = false;
try {
  // eslint-disable-next-line no-undef
  pb = new PocketBase(PB_URL);
} catch (e) {
  pbOffline = true;
  console.warn('PocketBase init failed', e);
}

async function submitScore(rec) {
  if (!pb || pbOffline) throw new Error('offline');
  return pb.collection(COL_SCORES).create(rec);
}
async function fetchLeaderboard(sort = '-score') {
  if (!pb) throw new Error('offline');
  const res = await pb.collection(COL_SCORES).getList(1, 20, { sort });
  return res.items;
}
