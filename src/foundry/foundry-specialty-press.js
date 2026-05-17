'use strict';

registerMachine({
  id: 'specialty_press',
  name: 'SPECIALTY PRESS',
  cluster: 'ASSEMBLY',
  desc: 'Branched conveyor for boutique rounds: incendiary, AP, acid, capacitor.',
  footprint: { w: 3, h: 2 },
  hp: 220,
  buildCost: [
    { id: 'scrap', n: 120 },
    { id: 'iron_ingot', n: 6 },
    { id: 'copper_ingot', n: 4 },
  ],
  slots: {
    input: ['brass_casing', 'primer', 'gunpowder_fast', 'gunpowder_med', 'gunpowder_slow', 'lead_bullet', 'phosphorus', 'steel_core', 'acid', 'capacitor'],
    output: [],
  },
  recipes: [
    {
      id: 'incendiary_shotgun',
      label: 'Incendiary 12ga · 6 rounds',
      in: [
        { id: 'brass_casing', n: 6 },
        { id: 'primer', n: 6 },
        { id: 'gunpowder_slow', n: 3 },
        { id: 'lead_bullet', n: 6 },
        { id: 'phosphorus', n: 2 },
      ],
      out: [],
      cycle: 14,
      caliber: 'shotgun',
      yield: 6,
      specialty: 'incendiary',
    },
    {
      id: 'ap_rifle',
      label: 'Armor-Piercing SMG · 20 rounds',
      in: [
        { id: 'brass_casing', n: 20 },
        { id: 'primer', n: 20 },
        { id: 'gunpowder_med', n: 6 },
        { id: 'steel_core', n: 8 },
      ],
      out: [],
      cycle: 14,
      caliber: 'smg',
      yield: 20,
      specialty: 'AP',
    },
    {
      id: 'acid_pistol',
      label: 'Acid Pistol · 8 rounds',
      in: [
        { id: 'brass_casing', n: 8 },
        { id: 'primer', n: 8 },
        { id: 'gunpowder_fast', n: 3 },
        { id: 'lead_bullet', n: 8 },
        { id: 'acid', n: 2 },
      ],
      out: [],
      cycle: 12,
      caliber: 'pistol',
      yield: 8,
      specialty: 'acid',
    },
    {
      id: 'capacitor_rail',
      label: 'Capacitor Cell · 4 charges',
      in: [
        { id: 'capacitor', n: 1 },
        { id: 'copper_ingot', n: 2 },
        { id: 'gunpowder_slow', n: 2 },
      ],
      out: [],
      cycle: 18,
      caliber: 'railgun',
      yield: 4,
      specialty: 'capacitor',
    },
    {
      id: 'incendiary_smg',
      label: 'Incendiary SMG · 24 rounds',
      in: [
        { id: 'brass_casing', n: 24 },
        { id: 'primer', n: 24 },
        { id: 'gunpowder_fast', n: 6 },
        { id: 'lead_bullet', n: 24 },
        { id: 'phosphorus', n: 4 },
      ],
      out: [],
      cycle: 16,
      caliber: 'smg',
      yield: 24,
      specialty: 'incendiary',
    },
  ],
  onCycle(m, recipe) {
    if (!Game.player || !Game.player.ammo) return;
    const cal = recipe.caliber;
    const slot = Game.player.ammo[cal];
    if (!slot) return;
    slot.reserve = (slot.reserve === Infinity ? Infinity : slot.reserve + recipe.yield);
    if (!Game.player.unlocked[cal]) Game.player.unlocked[cal] = true;
    if (typeof setNotice === 'function') setNotice(`+${recipe.yield} ${recipe.specialty} ${cal} rounds`, 1.4);
  },
  draw(ctx, m, t) {
    const x = m.x, y = m.y, w = m.w, h = m.h;

    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(x + 1, y + 1, w - 2, 2);
    ctx.fillRect(x + 1, y + h - 3, w - 2, 2);

    ctx.fillStyle = '#5e6a78';
    ctx.fillRect(x + 2, y + 4, 2, h - 8);
    ctx.fillRect(x + w - 4, y + 4, 2, h - 8);

    const beltY = y + Math.floor(h * 0.55);
    const beltH = 5;
    const beltL = x + 5;
    const beltR = x + w - 5;
    const beltW = beltR - beltL;
    const forkX = beltL + Math.floor(beltW * 0.6);

    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(beltL, beltY, beltW, beltH);
    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(beltL, beltY, beltW, 1);
    ctx.fillRect(beltL, beltY + beltH - 1, beltW, 1);

    const upperY = y + 6;
    const upperH = 4;
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(forkX, upperY, beltR - forkX, upperH);
    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(forkX, upperY, beltR - forkX, 1);
    ctx.fillRect(forkX, upperY + upperH - 1, beltR - forkX, 1);

    ctx.strokeStyle = '#5e6a78';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(forkX + 0.5, beltY + 0.5);
    ctx.lineTo(forkX + 0.5, upperY + upperH - 0.5);
    ctx.stroke();

    const treadOffset = Math.floor(t * 20) % 6;
    ctx.fillStyle = '#7a7e88';
    for (let i = beltL - 6 + treadOffset; i < beltR; i += 6) {
      const tx = Math.max(beltL, i);
      const tw = Math.min(beltR, i + 3) - tx;
      if (tw > 0) ctx.fillRect(tx, beltY + 1, tw, beltH - 2);
    }
    const upperOffset = Math.floor(t * 16) % 5;
    for (let i = forkX - 5 + upperOffset; i < beltR; i += 5) {
      const tx = Math.max(forkX, i);
      const tw = Math.min(beltR, i + 2) - tx;
      if (tw > 0) ctx.fillRect(tx, upperY + 1, tw, upperH - 2);
    }

    const accentCols = ['#ece7d7', '#9aa0a8', '#8ec547', '#5fb6e8'];
    const stationCount = 4;
    const stationGap = beltW / (stationCount + 1);
    const armTop = y + 3;
    const armBot = beltY - 1;
    for (let i = 1; i <= stationCount; i++) {
      const sx = Math.floor(beltL + stationGap * i);
      ctx.fillStyle = '#5e6a78';
      ctx.fillRect(sx - 2, armTop, 4, armBot - armTop);
      ctx.fillStyle = '#3a3f4a';
      ctx.fillRect(sx - 1, armTop, 2, armBot - armTop);
      const bob = Math.sin(t * 3.2 + i * 1.4) * 1.6;
      ctx.fillStyle = '#7a7e88';
      ctx.fillRect(sx - 4, armBot - 4 + bob, 8, 3);
      ctx.fillStyle = accentCols[(i - 1) % accentCols.length];
      ctx.fillRect(sx - 2, armBot - 2 + bob, 4, 2);
    }

    const blinkOn = ((t * 2) | 0) % 2 === 0;
    ctx.fillStyle = blinkOn ? '#e3a83a' : '#d24b35';
    ctx.fillRect(forkX - 1, beltY - 4, 3, 2);

    const cyclePeriod = 2.2;
    const phase = (t % cyclePeriod) / cyclePeriod;
    const cartX = Math.floor(beltL + phase * (beltW - 5));
    const cartY = beltY - 3;
    ctx.fillStyle = '#d9b35a';
    ctx.fillRect(cartX, cartY, 5, 3);
    ctx.fillStyle = '#caa760';
    ctx.fillRect(cartX + 1, cartY, 3, 1);
    const tipIdx = Math.floor(t / cyclePeriod) % accentCols.length;
    ctx.fillStyle = accentCols[tipIdx];
    ctx.fillRect(cartX + 4, cartY, 1, 2);

    const upperPhase = ((t + 1.1) % cyclePeriod) / cyclePeriod;
    if (upperPhase > 0.05) {
      const ucartX = Math.floor(forkX + upperPhase * (beltR - forkX - 4));
      const ucartY = upperY - 2;
      ctx.fillStyle = '#caa760';
      ctx.fillRect(ucartX, ucartY, 4, 2);
      ctx.fillStyle = accentCols[(tipIdx + 1) % accentCols.length];
      ctx.fillRect(ucartX + 3, ucartY, 1, 2);
    }
  },
});
