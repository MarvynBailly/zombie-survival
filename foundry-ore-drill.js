'use strict';

registerMachine({
  id: 'ore_drill',
  name: 'ORE DRILL',
  cluster: 'EXTRACTION',
  desc: 'Plant on a vein. Produces ore over time. Switch recipe to choose ore type.',
  footprint: { w: 2, h: 2 },
  hp: 200,
  buildCost: [{ id: 'scrap', n: 40 }],
  slots: {
    input: [],
    output: ['iron_ore', 'copper_ore', 'lead_ore'],
  },
  recipes: [
    { id: 'drill_iron',   label: 'Iron Ore',   in: [], out: [{ id: 'iron_ore',   n: 1 }], cycle: 28 },
    { id: 'drill_copper', label: 'Copper Ore', in: [], out: [{ id: 'copper_ore', n: 1 }], cycle: 28 },
    { id: 'drill_lead',   label: 'Lead Ore',   in: [], out: [{ id: 'lead_ore',   n: 1 }], cycle: 28 },
  ],
  draw(ctx, m, t) {
    const x = m.x, y = m.y, w = m.w, h = m.h;

    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(x + 1, y + 1, w - 2, 2);
    ctx.fillRect(x + 1, y + h - 3, w - 2, 2);

    ctx.fillStyle = '#5e6a78';
    ctx.fillRect(x + 3, y + h - 8, w - 6, 5);

    const cx = x + w / 2;
    const baseY = y + h - 8;
    const topY = y + 6;

    ctx.fillStyle = '#7a7e88';
    ctx.fillRect(cx - 5, topY, 2, baseY - topY);
    ctx.fillRect(cx + 3, topY, 2, baseY - topY);
    ctx.fillStyle = '#5e6a78';
    for (let i = 0; i < 4; i++) {
      const ry = topY + 3 + i * ((baseY - topY - 6) / 3);
      ctx.fillRect(cx - 5, ry, 10, 1);
    }

    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(cx - 6, topY - 2, 12, 3);
    ctx.fillStyle = '#d9b35a';
    ctx.fillRect(cx - 1, topY - 4, 2, 2);

    const armAngle = Math.sin(t * 2.2) * 0.5;
    const armBaseX = cx + 6;
    const armBaseY = topY + 4;
    const armLen = 8;
    const armEndX = armBaseX + Math.cos(armAngle) * armLen;
    const armEndY = armBaseY + Math.sin(armAngle) * armLen;
    ctx.strokeStyle = '#d24b35';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(armBaseX, armBaseY);
    ctx.lineTo(armEndX, armEndY);
    ctx.stroke();
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(armEndX - 1, armEndY - 1, 3, 3);

    const spin = t * 6;
    const bitX = cx - 0.5;
    const bitY = baseY - 2;
    ctx.fillStyle = '#7a7e88';
    ctx.fillRect(bitX - 1, bitY, 3, 6);
    ctx.fillStyle = '#e3a83a';
    const tipOffset = Math.sin(spin) * 0.8;
    ctx.fillRect(bitX - 1 + tipOffset, bitY + 5, 3, 2);

    if (m.active) {
      const glow = 0.5 + 0.5 * Math.sin(t * 8);
      ctx.fillStyle = `rgba(227,168,58,${0.3 + glow * 0.4})`;
      ctx.fillRect(cx - 3, baseY + 4, 6, 2);
    }
  },
});
