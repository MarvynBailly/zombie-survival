'use strict';

registerMachine({
  id: 'ammo_press',
  name: 'AMMO PRESS',
  cluster: 'ASSEMBLY',
  desc: 'Combines precursors into finished cartridges. Rounds go directly to your ammo reserves.',
  footprint: { w: 3, h: 2 },
  hp: 200,
  buildCost: [{ id: 'scrap', n: 80 }],
  slots: {
    input: ['brass_casing', 'primer', 'gunpowder_fast', 'gunpowder_med', 'gunpowder_slow', 'lead_bullet'],
    output: [],
  },
  recipes: [
    {
      id: 'press_pistol',
      label: '9mm Pistol · 12 rounds',
      in: [
        { id: 'brass_casing', n: 12 },
        { id: 'primer', n: 12 },
        { id: 'gunpowder_fast', n: 4 },
        { id: 'lead_bullet', n: 12 },
      ],
      out: [],
      cycle: 6,
      caliber: 'pistol',
      yield: 12,
    },
    {
      id: 'press_shotgun',
      label: '12ga Shotgun · 8 rounds',
      in: [
        { id: 'brass_casing', n: 8 },
        { id: 'primer', n: 8 },
        { id: 'gunpowder_slow', n: 4 },
        { id: 'lead_bullet', n: 8 },
      ],
      out: [],
      cycle: 7,
      caliber: 'shotgun',
      yield: 8,
    },
    {
      id: 'press_smg',
      label: 'SMG · 30 rounds',
      in: [
        { id: 'brass_casing', n: 30 },
        { id: 'primer', n: 30 },
        { id: 'gunpowder_fast', n: 6 },
        { id: 'lead_bullet', n: 30 },
      ],
      out: [],
      cycle: 8,
      caliber: 'smg',
      yield: 30,
    },
    {
      id: 'press_rocket',
      label: 'Rocket · 1 round',
      in: [
        { id: 'brass_casing', n: 1 },
        { id: 'primer', n: 1 },
        { id: 'gunpowder_slow', n: 4 },
      ],
      out: [],
      cycle: 12,
      caliber: 'rocket',
      yield: 1,
    },
    {
      id: 'press_crossbow',
      label: 'Crossbow Bolts · 8 rounds',
      in: [
        { id: 'brass_casing', n: 8 },
        { id: 'lead_bullet', n: 8 },
      ],
      out: [],
      cycle: 5,
      caliber: 'crossbow',
      yield: 8,
    },
  ],
  onCycle(m, recipe) {
    if (!Game.player || !Game.player.ammo) return;
    const cal = recipe.caliber;
    const slot = Game.player.ammo[cal];
    if (!slot) return;
    slot.reserve = (slot.reserve === Infinity ? Infinity : slot.reserve + recipe.yield);
    if (!Game.player.unlocked[cal]) Game.player.unlocked[cal] = true;
    if (typeof setNotice === 'function') setNotice(`+${recipe.yield} ${cal} rounds`, 1.2);
  },
  draw(ctx, m, t) {
    const x = m.x, y = m.y, w = m.w, h = m.h;

    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(x + 1, y + 1, w - 2, 2);
    ctx.fillRect(x + 1, y + h - 3, w - 2, 2);

    const beltY = y + h - 10;
    const beltH = 5;
    const beltL = x + 4;
    const beltR = x + w - 4;
    const beltW = beltR - beltL;

    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(beltL, beltY, beltW, beltH);
    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(beltL, beltY, beltW, 1);
    ctx.fillRect(beltL, beltY + beltH - 1, beltW, 1);

    const treadOffset = Math.floor(t * 18) % 6;
    ctx.fillStyle = '#7a7e88';
    for (let i = beltL - 6 + treadOffset; i < beltR; i += 6) {
      const tx = Math.max(beltL, i);
      const tw = Math.min(beltR, i + 3) - tx;
      if (tw > 0) ctx.fillRect(tx, beltY + 1, tw, beltH - 2);
    }

    const stationCount = 4;
    const stationGap = beltW / (stationCount + 1);
    const armTop = y + 4;
    const armBot = beltY - 1;
    for (let i = 1; i <= stationCount; i++) {
      const sx = Math.floor(beltL + stationGap * i);
      ctx.fillStyle = '#5e6a78';
      ctx.fillRect(sx - 2, armTop, 4, armBot - armTop);
      ctx.fillStyle = '#3a3f4a';
      ctx.fillRect(sx - 1, armTop, 2, armBot - armTop);
      const bob = Math.sin(t * 3 + i * 1.3) * 1.5;
      ctx.fillStyle = '#7a7e88';
      ctx.fillRect(sx - 4, armBot - 4 + bob, 8, 3);
      ctx.fillStyle = i === 1 ? '#caa760'
                    : i === 2 ? '#d24b35'
                    : i === 3 ? '#e3a83a'
                    : '#8a8c92';
      ctx.fillRect(sx - 2, armBot - 2 + bob, 4, 2);
    }

    const cyclePeriod = 2.5;
    const phase = (t % cyclePeriod) / cyclePeriod;
    const cartX = Math.floor(beltL + phase * (beltW - 5));
    const cartY = beltY - 3;
    ctx.fillStyle = '#d9b35a';
    ctx.fillRect(cartX, cartY, 5, 3);
    ctx.fillStyle = '#caa760';
    ctx.fillRect(cartX + 1, cartY, 3, 1);
    ctx.fillStyle = '#d24b35';
    ctx.fillRect(cartX + 4, cartY + 1, 1, 1);
  },
});
