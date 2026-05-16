'use strict';

// ---------- Item registry ----------
// Every non-ammo collectible in the world is an entry here. Categories drive
// inventory grouping + use semantics:
//   material  — passive resource, used at workbenches (no right-click use)
//   consumable — right-click in the inventory to apply effect (use())
//   tool      — placeable / activatable item (used via a hotbar slot)
//   quest     — narrative only; can't be used, just collected
// stackMax 1 = unstackable (each fills one slot).

const ITEMS = {
  // ----- materials -----
  scrap: {
    id: 'scrap', name: 'Scrap', category: 'material',
    stackMax: 999, tint: '#a8a59c',
    desc: 'Salvaged metal, wire, plastic. Spent at workbenches.',
  },
  // Phase 1 arsenal foundation: new material economy. These slot into the
  // ammo-press / chainsaw / taser systems wired up in Phase 2-4.
  fuel: {
    id: 'fuel', name: 'Fuel', category: 'material',
    stackMax: 99, tint: '#e3a83a',
    desc: 'Burnable. Powers chainsaws and engines.',
  },
  casing: {
    id: 'casing', name: 'Casing', category: 'material',
    stackMax: 999, tint: '#caa760',
    desc: 'Spent brass. Reload at a workbench.',
  },
  capacitor: {
    id: 'capacitor', name: 'Capacitor', category: 'material',
    stackMax: 20, tint: '#5fb6e8',
    desc: 'Charge cell. Feeds the railgun and chain taser.',
  },
  nail: {
    id: 'nail', name: 'Nail', category: 'material',
    stackMax: 999, tint: '#cad0d8',
    desc: 'Crude ammunition. Made from scrap.',
  },
  battery: {
    id: 'battery', name: 'Battery', category: 'material',
    stackMax: 20, tint: '#8ec547',
    desc: 'Power source. Feeds taser-class weapons.',
  },
  thermite: {
    id: 'thermite', name: 'Thermite', category: 'material',
    stackMax: 20, tint: '#d24b35',
    desc: 'Exotic charge. Used to craft incendiary rounds.',
  },
  phosphorus: {
    id: 'phosphorus', name: 'Phosphorus', category: 'material',
    stackMax: 20, tint: '#e8e6df',
    desc: 'Lab jar. Used to craft incendiary/explosive ammo.',
  },

  // ----- tools (Phase 1: registered only; use() is Phase 3/4) -----
  weapon_wall: {
    id: 'weapon_wall', name: 'Weapon Wall', category: 'tool',
    stackMax: 1, tint: '#7e8a98',
    desc: 'Hang every firearm you find. Click to swap loadout.',
  },
  ammo_press: {
    id: 'ammo_press', name: 'Ammo Press', category: 'tool',
    stackMax: 1, tint: '#5e6a78',
    desc: 'Workbench add-on. Print rounds from scrap + casings.',
  },

  // ----- consumables -----
  bandage: {
    id: 'bandage', name: 'Bandage', category: 'consumable',
    stackMax: 10, tint: '#e8e6df',
    desc: 'Restores 25 HP. Right-click to apply.',
    use(p) {
      if (p.hp >= p.maxHp) return false;
      const heal = 25 + (typeof perkSum === 'function' ? perkSum('bandageBonus') : 0);
      p.hp = Math.min(p.maxHp, p.hp + heal);
      setNotice(`+${heal} HP (bandage)`, 1.2);
      return true;
    },
  },
  antibiotic: {
    id: 'antibiotic', name: 'Antibiotic', category: 'consumable',
    stackMax: 5, tint: '#7fc8ff',
    desc: 'Rare meds. Will purge infection — and may have other uses later.',
    use(p) {
      // Placeholder until F4/infection wires up. For now: full heal.
      if (p.hp >= p.maxHp) return false;
      p.hp = p.maxHp;
      setNotice('Antibiotic · fully healed', 1.5);
      return true;
    },
  },
};

// ---------- Inventory state helpers ----------
// Game.player.inventory shape (set in resetRun):
//   { capacity: 24, slots: [ {id, count} | null ] × capacity }
// Slots preserve ordering for stable UI. addItem fills the lowest non-full
// stack of the same id first, then the lowest empty slot.
const INVENTORY_CAPACITY = 24;

function makeInventory() {
  return {
    capacity: INVENTORY_CAPACITY,
    slots: Array.from({ length: INVENTORY_CAPACITY }, () => null),
  };
}

function itemCount(inv, id) {
  let n = 0;
  for (const s of inv.slots) if (s && s.id === id) n += s.count;
  return n;
}

// Add up to `count` of an item to the inventory. Returns the leftover that
// did not fit (0 = success). Caller is responsible for handling overflow
// (e.g. dropping a pickup on the ground).
function addItem(inv, id, count) {
  const def = ITEMS[id];
  if (!def) { console.warn('addItem: unknown item', id); return count; }
  let remaining = count | 0;
  if (remaining <= 0) return 0;
  // 1. Top up existing partial stacks.
  for (let i = 0; i < inv.slots.length && remaining > 0; i++) {
    const s = inv.slots[i];
    if (!s || s.id !== id) continue;
    const room = def.stackMax - s.count;
    if (room <= 0) continue;
    const take = Math.min(room, remaining);
    s.count += take;
    remaining -= take;
  }
  // 2. Fill empty slots.
  for (let i = 0; i < inv.slots.length && remaining > 0; i++) {
    if (inv.slots[i]) continue;
    const take = Math.min(def.stackMax, remaining);
    inv.slots[i] = { id, count: take };
    remaining -= take;
  }
  return remaining;
}

// Remove up to `count` of an item. Returns the number actually removed.
function removeItem(inv, id, count) {
  let need = count | 0;
  if (need <= 0) return 0;
  let removed = 0;
  for (let i = inv.slots.length - 1; i >= 0 && need > 0; i--) {
    const s = inv.slots[i];
    if (!s || s.id !== id) continue;
    const take = Math.min(s.count, need);
    s.count -= take; removed += take; need -= take;
    if (s.count <= 0) inv.slots[i] = null;
  }
  return removed;
}

function hasItem(inv, id, count) {
  return itemCount(inv, id) >= (count | 0);
}

// Try to consume a consumable from the inventory. Returns true on success.
function useItem(inv, slotIndex) {
  const s = inv.slots[slotIndex];
  if (!s) return false;
  const def = ITEMS[s.id];
  if (!def || def.category !== 'consumable' || !def.use) return false;
  const ok = def.use(Game.player);
  if (ok) {
    s.count -= 1;
    if (s.count <= 0) inv.slots[slotIndex] = null;
    Audio.sfx.pickup();
  }
  return ok;
}

// ---------- Crafting recipes ----------
// Each recipe consumes a list of items (`cost`) and runs `apply(p)` to
// deliver the output. apply() may push to ammo reserves, the inventory,
// or some yet-to-exist subsystem (e.g. perks). Keep recipes minimal —
// the inventory + workbench overlay don't care about recipe shape, only
// that cost.every(hasItem) and apply(p) are valid.
const CRAFT_RECIPES = [
  {
    id: 'wall_pair',
    label: 'Walls ×2',
    desc: 'Two placeable barricades. Stack to ' + (typeof WALL_MAX_RESERVE !== 'undefined' ? WALL_MAX_RESERVE : 12) + '.',
    cost: [{ id: 'scrap', n: 4 }],
    apply(p) {
      const cap = (typeof WALL_MAX_RESERVE !== 'undefined') ? WALL_MAX_RESERVE : 12;
      p.ammo.wall.reserve = Math.min(cap, p.ammo.wall.reserve + 2);
      setNotice('+2 walls', 1.2);
    },
  },
  {
    id: 'pistol_mag',
    label: 'Pistol Mag',
    desc: '12 pistol rounds — keeps the fallback weapon fed.',
    cost: [{ id: 'scrap', n: 6 }],
    apply(p) {
      p.ammo.pistol.reserve += 12;
      setNotice('+12 pistol rounds', 1.2);
    },
  },
  {
    id: 'shotgun_shells',
    label: 'Shotgun Shells',
    desc: '8 shells. Unlocks the shotgun if it is still locked.',
    cost: [{ id: 'scrap', n: 10 }],
    apply(p) {
      if (!p.unlocked.shotgun) unlockWeapon('shotgun', 8, 'SHOTGUN CRAFTED');
      else { p.ammo.shotgun.reserve += 8; setNotice('+8 shells', 1.2); }
    },
  },
  {
    id: 'smg_rounds',
    label: 'SMG Rounds',
    desc: '40 rounds. Unlocks the SMG if it is still locked.',
    cost: [{ id: 'scrap', n: 14 }],
    apply(p) {
      if (!p.unlocked.smg) unlockWeapon('smg', 40, 'SMG CRAFTED');
      else { p.ammo.smg.reserve += 40; setNotice('+40 rounds', 1.2); }
    },
  },
  {
    id: 'barrel_pair',
    label: 'Explosive Barrel',
    desc: 'One placeable explosive — chain-explodes when hit.',
    cost: [{ id: 'scrap', n: 8 }],
    apply(p) {
      if (!p.unlocked.barrel) unlockWeapon('barrel', 1, 'BARRELS CRAFTED');
      else { p.ammo.barrel.reserve += 1; setNotice('+1 barrel', 1.2); }
    },
  },
  {
    id: 'bandage_kit',
    label: 'Bandage',
    desc: 'Restores 25 HP. Stacks of up to 10 in inventory.',
    cost: [{ id: 'scrap', n: 5 }],
    apply(p) {
      const left = addItem(p.inventory, 'bandage', 1);
      if (left === 0) setNotice('+1 bandage', 1.2);
      else setNotice('Inventory full — bandage lost', 1.5);
    },
  },
];

// ---------- Procedural item icons ----------
// Mirrors the weapon-slot-icon caching pattern in render.js so the
// inventory UI can show consistent thumbnails without external assets.
const __itemIconCache = {};
function getItemIcon(id) {
  if (__itemIconCache[id]) return __itemIconCache[id];
  const c = document.createElement('canvas');
  c.width = 48; c.height = 48;
  const cx = c.getContext('2d');
  cx.imageSmoothingEnabled = false;
  drawItemIconShape(cx, id, 48);
  __itemIconCache[id] = c.toDataURL();
  return __itemIconCache[id];
}
function drawItemIconShape(ctx, id, size) {
  // All icons drawn in a 48×48 box, top-left origin.
  const cx = size / 2, cy = size / 2;
  if (id === 'scrap') {
    // bent metal scraps, two overlapping plates
    ctx.fillStyle = '#43464d';
    ctx.fillRect(cx - 14, cy - 4, 24, 12);
    ctx.fillStyle = '#7e858f';
    ctx.fillRect(cx - 13, cy - 3, 22, 4);
    ctx.fillStyle = '#a3a4ac';
    ctx.fillRect(cx - 13, cy - 3, 22, 1);
    // small rivets
    ctx.fillStyle = '#0b0c0e';
    ctx.fillRect(cx - 10, cy - 1, 1, 1);
    ctx.fillRect(cx + 6, cy - 1, 1, 1);
    // wire kink
    ctx.strokeStyle = '#c64a36';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - 16, cy - 10);
    ctx.lineTo(cx - 8, cy - 6);
    ctx.lineTo(cx - 4, cy - 12);
    ctx.lineTo(cx + 10, cy - 8);
    ctx.stroke();
  } else if (id === 'bandage') {
    // gauze roll: cream rectangle with red cross
    ctx.fillStyle = '#8a877c';
    ctx.fillRect(cx - 12, cy - 9, 24, 18);
    ctx.fillStyle = '#ece7d7';
    ctx.fillRect(cx - 11, cy - 8, 22, 16);
    ctx.fillStyle = '#d8d4c4';
    ctx.fillRect(cx - 11, cy + 2, 22, 1);
    ctx.fillRect(cx - 11, cy - 4, 22, 1);
    ctx.fillStyle = '#d24b35';
    ctx.fillRect(cx - 2, cy - 6, 4, 12);
    ctx.fillRect(cx - 6, cy - 2, 12, 4);
  } else if (id === 'antibiotic') {
    // pill bottle: blue cap, cream body
    ctx.fillStyle = '#43464d';
    ctx.fillRect(cx - 8, cy - 10, 16, 4);
    ctx.fillStyle = '#5fb6e8';
    ctx.fillRect(cx - 7, cy - 10, 14, 3);
    ctx.fillStyle = '#8a877c';
    ctx.fillRect(cx - 9, cy - 6, 18, 16);
    ctx.fillStyle = '#ece7d7';
    ctx.fillRect(cx - 8, cy - 5, 16, 14);
    ctx.fillStyle = '#d24b35';
    ctx.fillRect(cx - 5, cy - 1, 10, 2);
    ctx.fillStyle = '#7a7e88';
    ctx.font = 'bold 6px monospace';
    ctx.fillText('Rx', cx - 5, cy + 7);
  } else if (id === 'fuel') {
    // jerrycan: amber body, dark cap
    ctx.fillStyle = '#3a2a14';
    ctx.fillRect(cx - 10, cy - 11, 20, 22);
    ctx.fillStyle = '#e3a83a';
    ctx.fillRect(cx - 9, cy - 10, 18, 20);
    ctx.fillStyle = '#8a5a2a';
    ctx.fillRect(cx - 4, cy - 14, 8, 4);
    ctx.fillStyle = '#0b0c0e';
    ctx.fillRect(cx + 6, cy - 8, 2, 4);
  } else if (id === 'casing') {
    // a few brass cylinders
    ctx.fillStyle = '#caa760';
    ctx.fillRect(cx - 11, cy - 2, 6, 10);
    ctx.fillRect(cx - 3, cy - 4, 6, 12);
    ctx.fillRect(cx + 5, cy - 1, 6, 9);
    ctx.fillStyle = '#8a6a32';
    ctx.fillRect(cx - 11, cy + 6, 6, 2);
    ctx.fillRect(cx - 3, cy + 6, 6, 2);
    ctx.fillRect(cx + 5, cy + 6, 6, 2);
  } else if (id === 'capacitor') {
    // cell: dark body, blue glow line
    ctx.fillStyle = '#1c2630';
    ctx.fillRect(cx - 10, cy - 9, 20, 18);
    ctx.fillStyle = '#5fb6e8';
    ctx.fillRect(cx - 8, cy - 7, 16, 4);
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(cx - 8, cy + 1, 16, 6);
    ctx.fillStyle = '#caa760';
    ctx.fillRect(cx - 3, cy - 12, 6, 3);
  } else if (id === 'nail') {
    // three nails fanned
    ctx.strokeStyle = '#cad0d8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 8); ctx.lineTo(cx - 4, cy + 8);
    ctx.moveTo(cx, cy - 9);     ctx.lineTo(cx, cy + 9);
    ctx.moveTo(cx + 8, cy - 8); ctx.lineTo(cx + 4, cy + 8);
    ctx.stroke();
    ctx.fillStyle = '#e0e4ea';
    ctx.fillRect(cx - 9, cy - 10, 4, 2);
    ctx.fillRect(cx - 2, cy - 11, 4, 2);
    ctx.fillRect(cx + 5, cy - 10, 4, 2);
  } else if (id === 'battery') {
    // AA-ish battery: green body, brass nub
    ctx.fillStyle = '#2a3618';
    ctx.fillRect(cx - 10, cy - 6, 20, 12);
    ctx.fillStyle = '#8ec547';
    ctx.fillRect(cx - 9, cy - 5, 16, 10);
    ctx.fillStyle = '#caa760';
    ctx.fillRect(cx + 7, cy - 2, 3, 4);
    ctx.fillStyle = '#0b0c0e';
    ctx.font = 'bold 8px monospace';
    ctx.fillText('+', cx - 5, cy + 3);
  } else if (id === 'thermite') {
    // jar with red contents
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(cx - 7, cy - 11, 14, 3);
    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(cx - 9, cy - 8, 18, 18);
    ctx.fillStyle = '#d24b35';
    ctx.fillRect(cx - 8, cy - 4, 16, 13);
    ctx.fillStyle = '#e3a83a';
    ctx.fillRect(cx - 8, cy - 4, 16, 2);
  } else if (id === 'phosphorus') {
    // jar with pale contents
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(cx - 7, cy - 11, 14, 3);
    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(cx - 9, cy - 8, 18, 18);
    ctx.fillStyle = '#e8e6df';
    ctx.fillRect(cx - 8, cy - 4, 16, 13);
    ctx.fillStyle = '#cad0d8';
    ctx.fillRect(cx - 6, cy + 2, 12, 3);
  } else if (id === 'weapon_wall') {
    // pegboard with two rifles
    ctx.fillStyle = '#3a2a14';
    ctx.fillRect(cx - 14, cy - 12, 28, 24);
    ctx.fillStyle = '#7a5a30';
    ctx.fillRect(cx - 13, cy - 11, 26, 22);
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(cx - 11, cy - 7, 22, 3);
    ctx.fillRect(cx - 11, cy + 4, 22, 3);
    ctx.fillStyle = '#0b0c0e';
    ctx.fillRect(cx - 9, cy - 6, 2, 1);
    ctx.fillRect(cx + 7, cy + 5, 2, 1);
  } else if (id === 'ammo_press') {
    // small press: heavy frame + brass shell
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(cx - 12, cy + 4, 24, 6);
    ctx.fillStyle = '#5e6a78';
    ctx.fillRect(cx - 4, cy - 12, 8, 16);
    ctx.fillStyle = '#7e8a98';
    ctx.fillRect(cx - 11, cy - 9, 22, 4);
    ctx.fillStyle = '#caa760';
    ctx.fillRect(cx - 2, cy + 2, 4, 4);
  } else if (typeof drawFoundryItemIcon === 'function' && drawFoundryItemIcon(ctx, id, size) !== false) {
    // foundry resources fall through to the foundry's shared lump renderer
  } else {
    // unknown/fallback — gray box with a question mark
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(cx - 10, cy - 10, 20, 20);
    ctx.fillStyle = '#7a7e88';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('?', cx - 4, cy + 5);
  }
}
