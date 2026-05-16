'use strict';

registerMachine({
  id: 'casing_press',
  name: 'CASING PRESS',
  cluster: 'ASSEMBLY',
  desc: 'Deep-draws brass into cartridge casings. Recycled brass is fastest.',
  footprint: { w: 2, h: 2 },
  hp: 200,
  buildCost: [{ id: 'scrap', n: 50 }],
  slots: {
    input: ['copper_ingot', 'brass_strip', 'scrap'],
    output: ['brass_strip', 'brass_casing'],
  },
  recipes: [
    { id: 'draw_strip',   label: 'Draw Brass Strip',         in: [{ id: 'copper_ingot', n: 1 }],                       out: [{ id: 'brass_strip',  n: 4 }], cycle: 4 },
    { id: 'press_casing', label: 'Press Casings',            in: [{ id: 'brass_strip',  n: 2 }],                       out: [{ id: 'brass_casing', n: 8 }], cycle: 6 },
    { id: 'reclaim',      label: 'Reclaim Brass (Scavenged)',in: [{ id: 'scrap',        n: 5 }],                       out: [{ id: 'brass_casing', n: 3 }], cycle: 5 },
  ],
  draw(ctx, m, t) {
    const x = m.x, y = m.y, w = m.w, h = m.h;

    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(x + 1, y + 1, w - 2, 2);
    ctx.fillRect(x + 1, y + h - 3, w - 2, 2);

    const cx = x + w / 2;
    const baseY = y + h - 6;
    const topY = y + 4;

    ctx.fillStyle = '#5e6a78';
    ctx.fillRect(x + 4, topY, 3, h - 10);
    ctx.fillRect(x + w - 7, topY, 3, h - 10);
    ctx.fillStyle = '#7a7e88';
    ctx.fillRect(x + 3, topY, w - 6, 3);

    ctx.fillStyle = '#5e6a78';
    ctx.fillRect(x + 3, baseY, w - 6, 4);
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(x + 4, baseY + 1, w - 8, 2);

    const ramTravel = (baseY - 6) - (topY + 4);
    const ramPhase = (Math.sin(t * 4) + 1) * 0.5;
    const ramY = topY + 4 + ramPhase * ramTravel * 0.55;
    const ramW = w - 14;
    ctx.fillStyle = '#7a7e88';
    ctx.fillRect(cx - ramW / 2, ramY, ramW, 5);
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(cx - ramW / 2, ramY + 5, ramW, 2);

    ctx.fillStyle = '#d9b35a';
    ctx.fillRect(cx - 4, baseY - 2, 8, 2);
    ctx.fillStyle = '#caa760';
    ctx.fillRect(cx - 3, baseY - 1, 6, 1);
  },
});
