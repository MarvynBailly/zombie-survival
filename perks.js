'use strict';

// ---------- Perks ----------
// 4 lanes × 6 perks. One point per day survived. Spending a point unlocks a
// perk permanently for this run (resets on death). The perk registry below
// is the source of truth — UI lists from it and buff helpers query it.

const PERKS = {
  // ----- GUNNER (red) -----
  g_reload:   { lane: 'gunner', name: 'Quick Hands',         desc: '-15% reload time on every weapon.',           buff: { reloadMult: 0.85 } },
  g_capacity: { lane: 'gunner', name: 'Big Mags',            desc: '+25% bonus when picking up ammo reserves.',   buff: { ammoBonus: 0.25 } },
  g_spread:   { lane: 'gunner', name: 'Steady Aim',          desc: '-20% spread on all weapons.',                 buff: { spreadMult: 0.80 } },
  g_firerate: { lane: 'gunner', name: 'Trigger Discipline',  desc: '-10% fire interval (faster shots).',          buff: { fireRateMult: 0.90 } },
  g_dmg:      { lane: 'gunner', name: 'Hollow Points',       desc: '+15% bullet damage.',                         buff: { damageMult: 1.15 } },
  g_crit:     { lane: 'gunner', name: 'Last Stand',          desc: '+50% damage while below 30% HP.',             buff: { lastStand: 0.50 } },

  // ----- MEDIC (toxic green) -----
  m_maxhp:    { lane: 'medic', name: 'Tough It Out',         desc: '+25 max HP.',                                 buff: { maxHpBonus: 25 } },
  m_regen:    { lane: 'medic', name: 'Field Medic',          desc: '+0.5 HP/s while not recently damaged.',       buff: { regenPerSec: 0.5 } },
  m_bandage:  { lane: 'medic', name: 'Better Bandages',      desc: 'Bandages heal +15 HP.',                       buff: { bandageBonus: 15 } },
  m_food:     { lane: 'medic', name: 'Strong Stomach',       desc: 'Food heals +50% (once Food lands).',          buff: { foodMult: 1.50 } },
  m_pickup:   { lane: 'medic', name: 'Magnet',               desc: '+60% pickup range (items drift toward you).', buff: { pickupRange: 0.60 } },
  m_iframe:   { lane: 'medic', name: 'Adrenaline',           desc: '+0.4s iframes on hit.',                       buff: { iframeBonus: 0.4 } },

  // ----- ENGINEER (warn yellow) -----
  e_wall:     { lane: 'engineer', name: 'Reinforced',        desc: '+50% wall HP.',                               buff: { wallHpMult: 1.50 } },
  e_wall_cd:  { lane: 'engineer', name: 'Quick Build',       desc: '-30% wall placement cooldown.',               buff: { placeCdMult: 0.70 } },
  e_barrel:   { lane: 'engineer', name: 'Demolitions',       desc: '+25% explosion radius.',                      buff: { explodeMult: 1.25 } },
  e_repair:   { lane: 'engineer', name: 'Tinker',            desc: 'Walls auto-repair 4 HP/s.',                   buff: { wallRepair: 4 } },
  e_scrap:    { lane: 'engineer', name: 'Scrapper',          desc: '+50% scrap from kills and salvage.',          buff: { scrapMult: 1.50 } },
  e_turret:   { lane: 'engineer', name: 'Auto-Turret',       desc: 'Unlocks auto-turret crafting (Turrets).',     buff: { turretUnlock: 1 } },

  // ----- SCOUT (info blue) -----
  s_speed:    { lane: 'scout', name: 'Light Feet',           desc: '+15% move speed.',                            buff: { speedMult: 1.15 } },
  s_sprint:   { lane: 'scout', name: 'Sprint',               desc: 'Hold Shift for +30% speed (drains over 5s).', buff: { sprint: 1 } },
  s_silent:   { lane: 'scout', name: 'Silent Boots',         desc: 'Aggro radius -40% from gunfire.',             buff: { aggroMult: 0.60 } },
  s_reveal:   { lane: 'scout', name: 'Scout Eye',            desc: '+20% explored / minimap radius.',             buff: { revealBonus: 0.20 } },
  s_dodge:    { lane: 'scout', name: 'Dodge Roll',           desc: 'Shift while moving = brief dash + iframes.',  buff: { dodge: 1 } },
  s_loot:     { lane: 'scout', name: 'Fast Hands',           desc: '-50% chest open time, longer interact.',      buff: { lootSpeed: 1 } },
};

const PERK_LANES = ['gunner', 'medic', 'engineer', 'scout'];
const PERK_LANE_COLOR = {
  gunner:   '#d24b35',
  medic:    '#8ec547',
  engineer: '#e3a83a',
  scout:    '#5fb6e8',
};

function makePerks() {
  return { points: 0, unlocked: new Set(), totalEarned: 0 };
}

// Multiplicative buff product across unlocked perks. Defaults to 1.
function perkMult(key) {
  let m = 1;
  if (!Game.perks) return m;
  for (const id of Game.perks.unlocked) {
    const def = PERKS[id]; if (!def || !def.buff) continue;
    const v = def.buff[key];
    if (typeof v === 'number') m *= v;
  }
  return m;
}
// Additive buff sum across unlocked perks. Defaults to 0.
function perkSum(key) {
  let s = 0;
  if (!Game.perks) return s;
  for (const id of Game.perks.unlocked) {
    const def = PERKS[id]; if (!def || !def.buff) continue;
    const v = def.buff[key];
    if (typeof v === 'number') s += v;
  }
  return s;
}
function hasPerk(id) {
  return !!(Game.perks && Game.perks.unlocked && Game.perks.unlocked.has(id));
}

function grantPerkPoint(n) {
  if (!Game.perks) return;
  n = n | 0; if (n <= 0) return;
  Game.perks.points += n;
  Game.perks.totalEarned += n;
  setNotice(`+${n} perk point${n > 1 ? 's' : ''} · press P`, 3);
  Audio.sfx.wave();
}

function unlockPerk(id) {
  if (!Game.perks || !PERKS[id]) return false;
  if (Game.perks.unlocked.has(id)) return false;
  if (Game.perks.points <= 0) return false;
  Game.perks.points -= 1;
  Game.perks.unlocked.add(id);
  Audio.sfx.pickup();
  applyPerkSideEffects(id);
  return true;
}

function applyPerkSideEffects(id) {
  const p = Game.player; if (!p) return;
  if (id === 'm_maxhp') {
    p.maxHp = 100 + perkSum('maxHpBonus');
    p.hp = Math.min(p.maxHp, p.hp + 25);
  }
}

// Per-shot multiplier from the Gunner "Last Stand" perk.
function playerLastStandMult(p) {
  const bonus = perkSum('lastStand');
  if (bonus <= 0) return 1;
  return (p.hp / p.maxHp) < 0.30 ? (1 + bonus) : 1;
}
