'use strict';

// ---------- Attachment registry ----------
// Phase 1 plumbing for cluster C (mods). Each entry declares only the mods it
// actually changes; applyAttachments() folds the set into a weapon def at
// fire time via effectiveWeapon() in defs.js. UI for installing attachments
// is Phase 3.
//
// slot:  'sight' | 'muzzle' | 'mag' | 'under'
// mods:  multiplicative unless noted (viewRadiusBonus is additive pixels).
const ATTACHMENTS = {
  redDot: {
    id: 'redDot', name: 'Red Dot Sight', slot: 'sight',
    desc: 'Halves hipfire spread.',
    mods: { spreadMult: 0.5 },
  },
  scope4x: {
    id: 'scope4x', name: '4× Scope', slot: 'sight',
    desc: 'Doubles effective range. Narrows your view cone.',
    mods: { rangeMult: 2.0, viewRadiusBonus: -80 },
  },
  thermal: {
    id: 'thermal', name: 'Thermal Sight', slot: 'sight',
    desc: 'Outlines zombies through fog and smoke. Useless on Tanks.',
    mods: { spreadMult: 0.75 },
  },
  suppressor: {
    id: 'suppressor', name: 'Suppressor', slot: 'muzzle',
    desc: 'Aggro radius cut to 20%. -15% damage, slight spread penalty.',
    mods: { aggroMult: 0.2, damageMult: 0.85, spreadMult: 1.1 },
  },
  drumMag: {
    id: 'drumMag', name: 'Drum Mag', slot: 'mag',
    desc: '2× capacity, 1.6× reload.',
    mods: { magMult: 2.0, reloadMult: 1.6 },
  },
  quickdrawMag: {
    id: 'quickdrawMag', name: 'Quickdraw Mag', slot: 'mag',
    desc: '0.6× capacity, 0.5× reload.',
    mods: { magMult: 0.6, reloadMult: 0.5 },
  },
  tacLight: {
    id: 'tacLight', name: 'Tac-Light', slot: 'under',
    desc: 'Projects a 5-tile cone at night. Blinds Shamblers.',
    mods: { viewRadiusBonus: 200 },
  },
  laserSight: {
    id: 'laserSight', name: 'Laser Sight', slot: 'under',
    desc: '-30% hipfire spread, but draws aggro.',
    mods: { spreadMult: 0.7, aggroMult: 1.5 },
  },
  foregrip: {
    id: 'foregrip', name: 'Foregrip', slot: 'under',
    desc: '-20% recoil on heavy guns.',
    mods: { recoilMult: 0.8 },
  },
};

// Fold a set of attachments onto a base weapon def. Returns a new object; the
// original WEAPONS entry is never mutated. Unknown mods are ignored. The slot
// keys ('sight', 'muzzle', 'mag', 'under') match the shape stored on
// p.ammo[k].attachments.
function applyAttachments(wDef, attachments) {
  if (!wDef) return wDef;
  if (!attachments) return wDef;
  let spreadMult = 1, damageMult = 1, reloadMult = 1, magMult = 1;
  let rangeMult = 1, recoilMult = 1, aggroMult = 1, viewRadiusBonus = 0;
  let any = false;
  for (const slot in attachments) {
    const id = attachments[slot];
    if (!id) continue;
    const att = ATTACHMENTS[id];
    if (!att || !att.mods) continue;
    const m = att.mods;
    if (m.spreadMult != null) spreadMult *= m.spreadMult;
    if (m.damageMult != null) damageMult *= m.damageMult;
    if (m.reloadMult != null) reloadMult *= m.reloadMult;
    if (m.magMult != null) magMult *= m.magMult;
    if (m.rangeMult != null) rangeMult *= m.rangeMult;
    if (m.recoilMult != null) recoilMult *= m.recoilMult;
    if (m.aggroMult != null) aggroMult *= m.aggroMult;
    if (m.viewRadiusBonus != null) viewRadiusBonus += m.viewRadiusBonus;
    any = true;
  }
  if (!any) return wDef;
  const out = { ...wDef };
  out.spread = (wDef.spread || 0) * spreadMult;
  out.damage = (wDef.damage || 0) * damageMult;
  out.reloadTime = (wDef.reloadTime || 0) * reloadMult;
  if (wDef.magSize !== Infinity) out.magSize = Math.max(1, Math.round((wDef.magSize || 0) * magMult));
  out.bulletRange = (wDef.bulletRange || 0) * rangeMult;
  out._recoilMult = recoilMult;
  out._aggroMult = aggroMult;
  out._viewRadiusBonus = viewRadiusBonus;
  return out;
}
