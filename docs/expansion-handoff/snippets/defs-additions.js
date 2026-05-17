// snippets/defs-additions.js
// Copy these entries into your zombie-survival/defs.js.
//
// • Weapons → append to the WEAPONS object, then extend WEAPON_ORDER.
// • Enemies → append to the ZOMBIES object.
//
// These are pure data — adding them is non-breaking. The game spawns and
// fires the new things using existing fallback behavior (walker AI / pistol
// fire) until you wire the Tier-3 behaviors in game.js. See CATALOG.md for
// per-feature behavior wiring.


// ============================================================
// PASTE INTO WEAPONS = { … }
// ============================================================

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
},


// ============================================================
// REPLACE your WEAPON_ORDER constant
// ============================================================

const WEAPON_ORDER = [
  'pistol', 'shotgun', 'smg', 'rocket', 'barrel', 'wall',
  'crossbow', 'flamer', 'minigun', 'railgun', 'gl', 'saw',
];


// ============================================================
// PASTE INTO ZOMBIES = { … }
//
// Set A — from expansion.js (6 enemies). All use existing walker-AI as
// fallback; their special flags are read by Tier-3 game.js code when present.
// ============================================================

spitter: {
  hp: 70, speed: 55, damage: 12, radius: 14,
  color: '#a4c45a', score: 25,
  ranged: true, range: 280, projectileDamage: 12, fireCooldown: 2.5,
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
  frontDR: 0.8,         // damage * 0.2 when hit from within ±60° of facing
  frontDRAngle: Math.PI / 3,
},
wraith: {
  hp: 60, speed: 110, damage: 14, radius: 13,
  color: '#2a2530', score: 35,
  ignoresWalls: true,
},


// ============================================================
// PASTE INTO ZOMBIES = { … }
//
// Set B — from bestiary.js (14 enemies). Includes 3 stationary spawners,
// 1 boss, 8 specialists, 2 trap/swarm types.
// ============================================================

cluster: {
  hp: 280, speed: 0, damage: 0, radius: 28,
  color: '#7d3a45', score: 200,
  stationary: true,
  spawns: 'hatch', spawnInterval: 4.0, spawnCap: 8,
  tendrilHeal: 1,                 // hp/s per live defender alive
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
  meleeReach: 60,                 // hits over crates
},
stalker: {
  hp: 50, speed: 130, damage: 18, radius: 13,
  color: '#4a525a', score: 50,
  cloaked: true, revealDist: 150,
},
bloater: {
  hp: 200, speed: 45, damage: 6, radius: 22,
  color: '#5e4a3a', score: 70,
  gasAura: { r: 60, dps: 3 },
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
  segmented: 7,                   // # of body segments
  segmentHp: 85,                  // hp per segment
  headWeakMult: 1.5,              // head takes 1.5x damage
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


// ============================================================
// Optional: wave-design helper
// ============================================================
//
// If your buildWave() in game.js uses simple per-type counts, here's a
// reasonable starting balance for difficulty scaling. Drop these into your
// wave-builder logic as guidance:
//
//   wave 1-2 :  walker, runner, crawler
//   wave 3-4 :  + shotgun-tier — bomber, frost, screamer
//   wave 5-6 :  + first stationary structure — hivesac
//   wave 7-8 :  + riot, wraith, spitter
//   wave 9-10:  + structures — shrieker, infection cluster
//   wave 11+ :  + elites — reaper, charger, necromancer
//   wave 15+ :  + brood mother
//   wave 20+ :  centipede boss wave
//
// Random sprinkle from wave 5+: 5% chance any "pickup" spawn is a mimic.
