'use strict';

registerMachine({
  id: 'blast_furnace',
  name: 'BLAST FURNACE',
  cluster: 'REFINING',
  tier: 1,
  footprint: { w: 2, h: 3 },
  hp: 300,
  buildCost: [{ id: 'scrap', n: 60 }],
  desc: 'Smelts ore into ingots. Lead vents toxic gas — keep on an outer wall.',
  slots: {
    input: ['iron_ore', 'copper_ore', 'lead_ore', 'charcoal', 'scrap', 'lead_ingot'],
    output: ['iron_ingot', 'copper_ingot', 'lead_ingot', 'charcoal', 'lead_bullet'],
  },
  recipes: [
    { id: 'smelt_iron',    label: 'Smelt Iron',           in: [{ id: 'iron_ore',   n: 2 }, { id: 'charcoal', n: 1 }], out: [{ id: 'iron_ingot',   n: 1 }], cycle: 10 },
    { id: 'smelt_copper',  label: 'Smelt Copper',         in: [{ id: 'copper_ore', n: 2 }, { id: 'charcoal', n: 1 }], out: [{ id: 'copper_ingot', n: 1 }], cycle: 10 },
    { id: 'smelt_lead',    label: 'Smelt Lead · TOXIC',   in: [{ id: 'lead_ore',   n: 2 }, { id: 'charcoal', n: 1 }], out: [{ id: 'lead_ingot',   n: 1 }], cycle: 12 },
    { id: 'cast_bullets',  label: 'Cast Bullets',         in: [{ id: 'lead_ingot', n: 1 }],                            out: [{ id: 'lead_bullet',  n: 8 }], cycle: 6 },
    { id: 'burn_charcoal', label: 'Burn Charcoal',        in: [{ id: 'scrap',      n: 2 }],                            out: [{ id: 'charcoal',     n: 1 }], cycle: 4 },
  ],
  draw(ctx, m, t) {
    const x = m.x, y = m.y, w = m.w, h = m.h;

    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = '#4a261e';
    ctx.fillRect(x + 2, y + 10, w - 4, h - 12);

    ctx.fillStyle = '#6e6e74';
    for (let by = y + 12; by < y + h - 4; by += 6) {
      const offset = ((by - y) / 6) % 2 === 0 ? 0 : 4;
      for (let bx = x + 3 + offset; bx < x + w - 4; bx += 8) {
        ctx.fillRect(bx, by, 7, 5);
      }
    }

    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(x + 4, y + 8, w - 8, 4);
    ctx.fillRect(x + 4, y + h - 6, w - 8, 4);

    const mawX = x + w / 2 - 7;
    const mawY = y + h / 2 - 4;
    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(mawX - 1, mawY - 1, 16, 12);

    // Pulse glow between rust red and warning amber.
    const pulse = (Math.sin(t * 3) + 1) / 2;
    const r = Math.round(0xd2 + (0xe3 - 0xd2) * pulse);
    const g = Math.round(0x4b + (0xa8 - 0x4b) * pulse);
    const b = Math.round(0x35 + (0x3a - 0x35) * pulse);
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(mawX, mawY, 14, 10);

    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(mawX + 3, mawY + 3, 2, 4);
    ctx.fillRect(mawX + 9, mawY + 3, 2, 4);

    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(x + w - 10, y, 6, 10);
    ctx.fillStyle = '#5e6a78';
    ctx.fillRect(x + w - 11, y, 8, 3);

    const puff = (t * 0.8) % 1;
    const px = x + w - 7;
    const py = y - 4 - puff * 8;
    const pa = 1 - puff;
    ctx.fillStyle = `rgba(122,126,136,${pa * 0.8})`;
    ctx.fillRect(px - 2, py, 4, 4);
    ctx.fillRect(px - 4, py + 2, 3, 3);
    ctx.fillStyle = `rgba(122,126,136,${pa * 0.5})`;
    ctx.fillRect(px + 2, py - 1, 3, 3);
  },
});
