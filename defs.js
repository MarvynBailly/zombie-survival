'use strict';

// ---------- Weapons ----------
const WEAPONS = {
  pistol: {
    name: 'Pistol', key: '1', fireRate: 0.25, damage: 25, spread: 0.02,
    pellets: 1, bulletSpeed: 900, bulletRange: 900,
    magSize: 12, reserve: 60, reloadTime: 0.8,
    sfx: 'pistol', unlocked: true,
  },
  shotgun: {
    name: 'Shotgun', key: '2', fireRate: 0.7, damage: 18, spread: 0.22,
    pellets: 6, bulletSpeed: 850, bulletRange: 550,
    magSize: 6, reserve: 24, reloadTime: 1.4,
    sfx: 'shotgun',
  },
  smg: {
    name: 'SMG', key: '3', fireRate: 0.07, damage: 12, spread: 0.06,
    pellets: 1, bulletSpeed: 1000, bulletRange: 900,
    magSize: 40, reserve: 120, reloadTime: 1.6,
    sfx: 'smg',
  },
  rocket: {
    name: 'Rocket', key: '4', fireRate: 1.1, damage: 120, spread: 0.0,
    pellets: 1, bulletSpeed: 500, bulletRange: 1400,
    magSize: 1, reserve: 6, reloadTime: 1.8,
    sfx: 'rocket', isRocket: true, explodeRadius: 120,
  },
  barrel: {
    name: 'Barrels', key: '5', fireRate: 0.4, damage: 0, spread: 0,
    pellets: 0, bulletSpeed: 0, bulletRange: 0,
    magSize: 1, reserve: 5, reloadTime: 0.3,
    sfx: 'click', isPlacer: true,
  },
  wall: {
    name: 'Walls', key: '6', fireRate: 0, damage: 0, spread: 0,
    pellets: 0, bulletSpeed: 0, bulletRange: 0,
    magSize: 1, reserve: WALL_INITIAL, reloadTime: 0,
    sfx: 'click', isPlacer: true, isWall: true,
  },
  // ---------- Expansion weapons ----------
  // Pasted from expansion-handoff/snippets/defs-additions.js. Behavior flags
  // are read by Tier-3 code in game.js (pierce, isStream, spinUp, chargeTime,
  // bounces, isMelee). Until those branches exist the weapons fire via the
  // generic bullet path, which is fine — they just behave like a vanilla
  // pistol shot.
  crossbow: {
    name: 'Crossbow', key: '7', fireRate: 0.9, damage: 90, spread: 0.0,
    pellets: 1, bulletSpeed: 1100, bulletRange: 1100,
    magSize: 1, reserve: 12, reloadTime: 1.0,
    sfx: 'pistol',
    pierce: 3,        // # of zombies a bolt passes through before stopping
    silent: true,     // doesn't add to global aggro / groan radius
  },
  flamer: {
    name: 'Flamethrower', key: '8', fireRate: 0.05, damage: 8, spread: 0.08,
    pellets: 1, bulletSpeed: 400, bulletRange: 180,
    magSize: 100, reserve: 200, reloadTime: 2.0,
    sfx: 'smg',
    isStream: true,   // continuous-fire while LMB held
    ignites: true,    // hits apply onFire 2.0s to zombies
  },
  minigun: {
    name: 'Minigun', key: '9', fireRate: 0.04, damage: 9, spread: 0.10,
    pellets: 1, bulletSpeed: 1000, bulletRange: 900,
    magSize: 200, reserve: 400, reloadTime: 4.0,
    sfx: 'smg',
    spinUp: 0.6,                  // seconds of held-fire before damage starts
    slowsWhileFiring: 0.5,        // player MS multiplier while firing
  },
  railgun: {
    name: 'Railgun', key: '0', fireRate: 0, damage: 200, spread: 0.0,
    pellets: 1, bulletSpeed: 99999, bulletRange: 2000,
    magSize: 1, reserve: 5, reloadTime: 2.4,
    sfx: 'rocket',
    chargeTime: 1.2,              // seconds to charge before fire
    piercesAll: true,             // hitscan beam, hits everything in line
  },
  gl: {
    name: 'Grenade Launcher', key: '-', fireRate: 0.8, damage: 90, spread: 0.0,
    pellets: 1, bulletSpeed: 600, bulletRange: 700,
    magSize: 6, reserve: 18, reloadTime: 2.2,
    sfx: 'rocket',
    isProjectile: true,
    bounces: 1,                   // bounces off walls before exploding
    explodeRadius: 90,
  },
  saw: {
    name: 'Chainsaw', key: '=', fireRate: 0.1, damage: 30, spread: 0,
    pellets: 0, bulletSpeed: 0, bulletRange: 0,
    magSize: Infinity, reserve: Infinity, reloadTime: 0,
    sfx: 'smg',
    isMelee: true,
    meleeRange: 35,               // forward cone reach
    meleeCone: 0.9,               // total cone angle in radians
    cleavesArmor: true,           // bypasses Riot's frontDR
    consumesItem: 'fuel',         // burns one fuel item per second while held
    idleAggroR: 200,              // periodic aggro broadcast while held
  },
  // ---------- Phase 2 cluster A (firearms) ----------
  nail: {
    name: 'Nail Gun', key: '\\', fireRate: 0.18, damage: 14, spread: 0.04,
    pellets: 1, bulletSpeed: 850, bulletRange: 700,
    magSize: 16, reserve: 0, reloadTime: 0.6,
    sfx: 'pistol',
    consumesItem: 'nail',         // 1 nail item from inventory per shot
    pinsTarget: 4.0,              // seconds the nailed zombie is rooted
  },
  taser: {
    name: 'Chain Taser', key: '[', fireRate: 0.9, damage: 28, spread: 0.0,
    pellets: 1, bulletSpeed: 900, bulletRange: 600,
    magSize: 8, reserve: 0, reloadTime: 1.4,
    sfx: 'pistol',
    consumesItem: 'battery',      // 1 battery item per shot
    chainsTo: 4,                  // # of zombies to chain hit through
    chainRange: 80,               // px radius between links
    chainFalloff: 0.7,            // damage * falloff^index per link
    chainStaggerT: 1.2,           // stagger time per link
  },
  // ---------- Phase 2 cluster B (melee) ----------
  katana: {
    name: 'Katana', key: '/', fireRate: 0.5, damage: 70, spread: 0,
    pellets: 0, bulletSpeed: 0, bulletRange: 0,
    magSize: Infinity, reserve: Infinity, reloadTime: 0,
    sfx: 'pistol',
    isMelee: true,
    meleeRange: 50,
    meleeCone: 1.6,               // ~90 degrees
    cleaves: 3,                   // max zombies hit per swing
    silent: true,
    chargedSwing: { holdT: 1.2, execHpPct: 0.40, iframes: 0.5 },
  },
  sledge: {
    name: 'Sledgehammer', key: ']', fireRate: 0.95, damage: 55, spread: 0,
    pellets: 0, bulletSpeed: 0, bulletRange: 0,
    magSize: Infinity, reserve: Infinity, reloadTime: 0,
    sfx: 'pistol',
    isMelee: true,
    meleeRange: 36,
    meleeCone: 1.2,
    knockback: 80,                // px pushed away from player on hit
    breaksTerrain: true,          // also damages player walls in reach
    breaksWallDmg: 30,
    tankStaggerT: 0.4,            // tank ignores knockback but staggers
  },
};
const WEAPON_ORDER = [
  'pistol', 'shotgun', 'smg', 'rocket', 'barrel', 'wall',
  'crossbow', 'flamer', 'minigun', 'railgun', 'gl', 'saw',
  'nail', 'taser', 'katana', 'sledge',
];

// ---------- Factions ----------
// Drives hostility / target selection in updateZombies (and Phase 5+ NPC AI).
// Every ZOMBIES entry defaults to faction 'zombie' (applied in
// buildZombieInstance). 'player' isn't really a faction — the player is
// special-cased in targetOf and the hostility table only uses it to decide
// whether non-zombie factions also chase the player.
const FACTIONS = {
  player:   { name: 'player' },
  zombie:   { name: 'zombie' },
  raider:   { name: 'raider' },
  cultist:  { name: 'cultist' },
  wildlife: { name: 'wildlife' },
};

// FACTION_HOSTILE[a][b] === true means faction `a` will attack `b` on sight.
// Symmetry is NOT enforced — a wildlife stag attacks raiders only if both
// halves are set. Read via factionsHostile(a, b).
const FACTION_HOSTILE = {
  zombie:   { player: true,  raider: true,  cultist: false, wildlife: true  },
  raider:   { player: true,  zombie: true,  cultist: false, wildlife: false },
  cultist:  { player: true,  zombie: false, raider: false,  wildlife: false },
  wildlife: { player: true,  zombie: true,  raider: false,  cultist: false  },
  // 'player' faction is unused — player is special-cased in targetOf.
  player:   {},
};

function factionsHostile(a, b) {
  if (!a || !b) return false;
  const row = FACTION_HOSTILE[a];
  return !!(row && row[b]);
}

// ---------- Zombie types ----------
const ZOMBIES = {
  walker: { hp: 55, speed: 60, damage: 10, radius: 14, color: '#6fa060', score: 10 },
  runner: { hp: 30, speed: 135, damage: 7, radius: 11, color: '#c9a04f', score: 15 },
  tank:   { hp: 240, speed: 40, damage: 22, radius: 22, color: '#7a4a9a', score: 40 },
  fire:   { hp: 65, speed: 80, damage: 8, radius: 14, color: '#e35a2a', score: 25, isFire: true },

  // ---------- Expansion set A (ZExpand sprites) ----------
  spitter: {
    hp: 70, speed: 55, damage: 12, radius: 14,
    color: '#a4c45a', score: 25,
    ranged: true, range: 280, projectileDamage: 12, fireCooldown: 2.5,
    // Phase 0: spit projectile hit adds 3% infection.
    infectionOnHit: 3,
  },
  crawler: {
    hp: 22, speed: 160, damage: 6, radius: 9,
    color: '#7a5a3a', score: 12,
  },
  screamer: {
    hp: 45, speed: 70, damage: 0, radius: 13,
    color: '#b8a890', score: 30,
    auraBuff: true, auraR: 120, auraSpeedMult: 1.5,
  },
  bomber: {
    hp: 110, speed: 70, damage: 0, radius: 18,
    color: '#a5a230', score: 35,
    onDeathExplode: { r: 80, dmg: 50 },
  },
  riot: {
    hp: 180, speed: 55, damage: 18, radius: 15,
    color: '#2a3138', score: 50,
    frontDR: 0.8,
    frontDRAngle: Math.PI / 3,
  },
  wraith: {
    hp: 60, speed: 110, damage: 14, radius: 13,
    color: '#2a2530', score: 35,
    ignoresWalls: true,
  },

  // ---------- Expansion set B (ZBestiary sprites) ----------
  cluster: {
    hp: 280, speed: 0, damage: 0, radius: 28,
    color: '#7d3a45', score: 200,
    stationary: true,
    spawns: 'hatch', spawnInterval: 4.0, spawnCap: 8,
    tendrilHeal: 1,
  },
  hivesac: {
    hp: 40, speed: 0, damage: 0, radius: 18,
    color: '#7d3a45', score: 25,
    stationary: true,
    burstOnDeath: { type: 'hatch', count: 5, spreadR: 60 },
  },
  shrieker: {
    hp: 50, speed: 0, damage: 0, radius: 20,
    color: '#7d3a45', score: 40,
    stationary: true,
    callsHorde: true, callInterval: 2.0, callType: 'walker', callCount: 2,
  },
  brood: {
    hp: 400, speed: 35, damage: 22, radius: 26,
    color: '#7d3a45', score: 150,
    spawnsOnWalk: 'crawler', spawnEvery: 3.5,
  },
  necro: {
    hp: 90, speed: 60, damage: 0, radius: 15,
    color: '#7a3a8a', score: 80,
    raisesNearby: true, raiseInterval: 6.0, raiseHpPct: 0.5,
  },
  charger: {
    hp: 150, speed: 60, damage: 25, radius: 17,
    color: '#7a9a55', score: 60,
    charge: {
      speed: 320, stunMs: 1000, telegraph: 0.8,
      cooldown: 4.0, range: 380,
    },
  },
  reaper: {
    hp: 110, speed: 70, damage: 25, radius: 14,
    color: '#1a1418', score: 55,
    meleeReach: 60,
  },
  stalker: {
    hp: 50, speed: 130, damage: 18, radius: 13,
    color: '#4a525a', score: 50,
    cloaked: true, revealDist: 150,
  },
  bloater: {
    hp: 200, speed: 45, damage: 6, radius: 22,
    color: '#5e4a3a', score: 70,
    // gasAura.infection is the per-tick % added while player is in radius.
    gasAura: { r: 60, dps: 3, infection: 0.5 },
    deathCloud: { r: 100, life: 4, dps: 5 },
  },
  frost: {
    hp: 80, speed: 60, damage: 8, radius: 14,
    color: '#a8d8e8', score: 35,
    chillOnHit: { pct: 0.4, ms: 2500 },
  },
  mimic: {
    hp: 90, speed: 0, damage: 30, radius: 12,
    color: '#1c1f25', score: 60,
    stationary: true, disguised: true,
    ambushBite: 30, triggerR: 22,
  },
  cent: {
    hp: 600, speed: 90, damage: 35, radius: 18,
    color: '#5e4a3a', score: 500,
    segmented: 7,
    segmentHp: 85,
    headWeakMult: 1.5,
  },
  hatch: {
    hp: 12, speed: 180, damage: 4, radius: 7,
    color: '#a45260', score: 4,
  },
  twins: {
    hp: 130, speed: 60, damage: 12, radius: 16,
    color: '#7a9a55', score: 30,
    onDeathSplit: { type: 'walker', count: 2, hpPct: 0.5 },
  },

  // ---------- Phase 2 — Sprite-only enemies ----------
  // Heavy frontal armor walker. Reuses Riot's frontDR damage code in
  // dealDamageToZombie — bullets hitting the front 180° arc lose 95% damage,
  // so flanking is mandatory. Saw bypasses (cleavesArmor). Day 8+ rare.
  juggernaut: {
    hp: 350, speed: 35, damage: 22, radius: 22,
    color: '#4a4640', score: 80,
    frontDR: 0.95,
    frontDRAngle: Math.PI, // 180° — full frontal half-plane.
  },
  // Wall-jumping spider-zombie. In updateZombies, when the path to the player
  // is blocked by a wall/obstacle and z.leapCd <= 0, the leap branch arcs the
  // zombie over a short distance (leapDist). While `leaping`, collision
  // checks are skipped. Day 5+, moderate rarity.
  leaper: {
    hp: 60, speed: 110, damage: 12, radius: 11,
    color: '#3a2a32', score: 30,
    canLeap: true, leapDist: 80, leapCd: 3.0,
  },
  // Disguised tree ambusher — sits dormant as a tree-style sprite until the
  // player crosses triggerR (50px), then unfolds into a thorn-covered
  // humanoid. Bite applies bleedOnHit (player.bleeding DPS for N seconds).
  // POI-bound, forest-flavored — emitted in lumber_camp / cottage POIs.
  husk: {
    hp: 90, speed: 0, damage: 25, radius: 14,
    color: '#3a2a18', score: 40,
    stationary: true, disguised: true,
    ambushBite: 25, triggerR: 50,
    bleedOnHit: { dps: 4, sec: 5 },
    biome: 'forest',
  },
  // Plague Rat — tiny infection-swarmer. POI-only (poiOnly:true) so the spawn
  // director never edge-spawns lone rats. Garrisoned in clusters of 8 in
  // mining outposts (the closest thing to a sewer/basement chunk today).
  // Reuses Phase 0 infectionOnHit plumbing in damagePlayer.
  rat: {
    hp: 6, speed: 100, damage: 1, radius: 5,
    color: '#1a1410', score: 2,
    swarm: true, poiOnly: true,
    infectionOnHit: 1,
  },
  // Wildlife charger. Reuses the existing charger AI branch — same z.charge
  // shape, just with a wildlife faction tag (hostile to player + zombies,
  // per FACTION_HOSTILE) and a longer range. One per forest zone per run,
  // tracked in Game.flags.stagsSlain. Drops item_antler on kill.
  stag: {
    hp: 200, speed: 60, damage: 25, radius: 17,
    color: '#7a5a3a', score: 60,
    faction: 'wildlife',
    charge: {
      speed: 320, stunMs: 1000, telegraph: 0.8,
      cooldown: 4.0, range: 500,
    },
    dropsAntler: true,
  },
};

// ---------- Levels (terrain region presets) ----------
// Selecting a level picks a terrain REGION — a parameter pack fed to the
// noise sampler in world.js. The world is one procedural 32k x 32k space;
// the region biases what you'll see most: lakes vs forests vs ridges, plus
// which structure kinds tend to appear.
const LEVELS = [
  {
    name: 'Verdant Plains',
    desc: 'Rolling grassland with copses of forest and meandering rivers.',
    style: 'plains',
    biome: 'plains',         // legacy field name still consulted in a few places
    bg: '#1a2418',
    lineColor: '#2a3624',
    region: {
      name:         'plains',
      elevFreq:     1 / 30,
      moistFreq:    1 / 22,
      deepWater:    0.26,
      shallowWater: 0.32,
      sand:         0.36,
      hill:         0.72,
      mountain:     0.82,
      forestMoist:  0.60,
      poiDensity:   1.0,
      spawnSafe:    16,
    },
  },
  {
    name: 'Lake Country',
    desc: 'Half the map is water. Hop islands, search shorelines for docks.',
    style: 'coast',
    biome: 'coast',
    bg: '#152028',
    lineColor: '#1f3240',
    region: {
      name:         'coast',
      elevFreq:     1 / 34,
      moistFreq:    1 / 26,
      deepWater:    0.40,
      shallowWater: 0.46,
      sand:         0.52,
      hill:         0.78,
      mountain:     0.88,
      forestMoist:  0.62,
      poiDensity:   0.95,
      spawnSafe:    18,
    },
  },
  {
    name: 'Highland Ridge',
    desc: 'Narrow passes between mountain ridges. Choke points everywhere.',
    style: 'highland',
    biome: 'highland',
    bg: '#1e1c20',
    lineColor: '#2d2a30',
    region: {
      name:         'highland',
      elevFreq:     1 / 22,
      moistFreq:    1 / 20,
      deepWater:    0.20,
      shallowWater: 0.26,
      sand:         0.30,
      hill:         0.56,
      mountain:     0.66,
      forestMoist:  0.55,
      poiDensity:   1.05,
      spawnSafe:    18,
    },
  },
];

// ---------- Arsenal foundation registries ----------
// Phase 1 plumbing: registries + helpers consumed by later phases. The fire
// path, attachment UI, and named-drop rolls are wired up in later passes; this
// file only declares the data shapes + lookup helpers.

// Ammo-type registry. Each weapon has an ammoType slot on p.ammo[k]; Phase 3
// fills onHit() with the real effects (DoT, AP pierce, AoE). 'compatibleWith'
// is by weapon-class string — checked at the press/conversion site.
const AMMO_TYPES = {
  standard: {
    id: 'standard', name: 'Standard', color: '#caa760',
    compatibleWith: ['pistol', 'smg', 'shotgun', 'rifle', 'crossbow', 'minigun', 'gl'],
    onHit(z, p, weapon) { /* phase 3 */ },
  },
  incendiary: {
    id: 'incendiary', name: 'Incendiary', color: '#e3a83a',
    compatibleWith: ['pistol', 'smg', 'shotgun'],
    onHit(z, p, weapon) { /* phase 3: 4s burn DoT + ground patch */ },
  },
  ap: {
    id: 'ap', name: 'Armor-Piercing', color: '#5fb6e8',
    compatibleWith: ['pistol', 'smg', 'rifle', 'crossbow', 'minigun'],
    onHit(z, p, weapon) { /* phase 3: pierces 3, cuts armor */ },
  },
  explosive: {
    id: 'explosive', name: 'Explosive', color: '#d24b35',
    compatibleWith: ['pistol', 'smg', 'rifle'],
    onHit(z, p, weapon) { /* phase 3: 1.5-tile AoE on impact */ },
  },
};

function getAmmoTypeFor(p, key) {
  const a = p && p.ammo && p.ammo[key];
  const id = (a && a.ammoType) || 'standard';
  return AMMO_TYPES[id] || AMMO_TYPES.standard;
}

// Offhand slot — paired with one-hand weapons (pistol, machete). Damage path
// wiring lives in Phase 2; this declaration is just the data table + the
// p.offhand slot that game.js sets up.
const OFFHANDS = {
  shield: {
    id: 'shield', name: 'Riot Shield',
    frontDR: 1.0, frontRangeDR: 0.6,
    hp: 300, bashCd: 8,
  },
};

// Named-weapon rolls — Mythic-tier drops get a unique name and one trait from
// the pool. Phase 4 calls rollNamedWeapon() from the chest path.
const WEAPON_TRAITS = [
  { id: 'headshotCrit', name: 'Headhunter',  desc: '+25% crit on headshot' },
  { id: 'ricochet',     name: 'Ricochet',    desc: 'bullets bounce once' },
  { id: 'fastHolster',  name: 'Quickdraw',   desc: 'reloads while holstered' },
  { id: 'bulletBack',   name: 'Frugal',      desc: 'refund 1 bullet on kill' },
];
const WEAPON_NAMES = [
  'Widowmaker', 'Old Reliable', 'Coyote', 'Last Word', 'Sunday',
  'Bonecutter', 'Tin Lizzy', 'Hellraiser', 'Quiet Earl', 'Magpie',
  'Razor', 'Foreman',
];

function rollNamedWeapon(rng, weaponKey) {
  const r = (typeof rng === 'function') ? rng : Math.random;
  const name = WEAPON_NAMES[Math.floor(r() * WEAPON_NAMES.length)];
  const trait = WEAPON_TRAITS[Math.floor(r() * WEAPON_TRAITS.length)];
  return { name, trait };
}

// effectiveWeapon — returns a shallow-merged WEAPONS[key] with attachment
// modifiers folded in. Consumers in Phase 2/3 will call this instead of
// reading WEAPONS[p.weapon] directly. Defined here (defs.js) so it's in scope
// before game.js's fire path. applyAttachments is provided by attachments.js
// (script-tagged after defs.js); this guards for load order during dev.
function effectiveWeapon(p, key) {
  const base = WEAPONS[key];
  if (!base) return null;
  const ent = p && p.ammo && p.ammo[key];
  const atts = ent && ent.attachments;
  if (!atts || typeof applyAttachments !== 'function') return base;
  return applyAttachments(base, atts);
}
