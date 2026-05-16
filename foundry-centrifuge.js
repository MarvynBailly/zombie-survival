'use strict';

registerMachine({
  id: 'centrifuge',
  name: 'CENTRIFUGE',
  cluster: 'REFINING',
  tier: 1,
  footprint: { w: 2, h: 2 },
  hp: 220,
  buildCost: [{ id: 'scrap', n: 80 }, { id: 'iron_ingot', n: 4 }],
  desc: 'Spins slurries by density. Byproducts feed acid rounds and soap.',
  slots: {
    input: ['saltpeter', 'sulfur', 'zombie_bile'],
    output: ['saltpeter', 'sulfur', 'lye', 'acid'],
  },
  recipes: [
    { id: 'purify_salt',   label: 'Purify Saltpeter (+lye)',  in: [{ id: 'saltpeter',   n: 2 }], out: [{ id: 'saltpeter', n: 3 }, { id: 'lye',  n: 1 }], cycle: 12 },
    { id: 'purify_sulfur', label: 'Purify Sulfur (+acid)',    in: [{ id: 'sulfur',      n: 2 }], out: [{ id: 'sulfur',    n: 3 }, { id: 'acid', n: 1 }], cycle: 12 },
    { id: 'crack_bile',    label: 'Crack Bile (alt path)',    in: [{ id: 'zombie_bile', n: 3 }], out: [{ id: 'acid',      n: 2 }, { id: 'lye',  n: 1 }], cycle: 16 },
  ],
  draw(ctx, m, t) {
    const x = m.x, y = m.y, w = m.w, h = m.h;

    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(x + 2, y + 2, w - 4, h - 4);

    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = (w - 10) / 2;
    const ry = (h - 14) / 2;

    ctx.fillStyle = '#5e6a78';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#1c1f25';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - 2, ry - 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#7a7e88';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - 4, ry - 4, 0, 0, Math.PI * 2);
    ctx.fill();

    const ang = t * 8;
    const mrx = rx - 3;
    const mry = ry - 3;
    const tipX = cx + Math.cos(ang) * mrx;
    const tipY = cy + Math.sin(ang) * mry;
    const baseAngL = ang + 2.6;
    const baseAngR = ang - 2.6;
    const baseR = (rx - 6);
    const baseRY = (ry - 6);
    ctx.fillStyle = '#e3a83a';
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(cx + Math.cos(baseAngL) * baseR, cy + Math.sin(baseAngL) * baseRY);
    ctx.lineTo(cx + Math.cos(baseAngR) * baseR, cy + Math.sin(baseAngR) * baseRY);
    ctx.closePath();
    ctx.fill();

    for (let i = 0; i < 4; i++) {
      const da = ang + i * (Math.PI / 2);
      const dx = cx + Math.cos(da) * mrx;
      const dy = cy + Math.sin(da) * mry;
      const a = 0.35 + 0.25 * ((i + 1) % 2);
      ctx.fillStyle = `rgba(202,208,216,${a})`;
      ctx.fillRect(Math.round(dx) - 1, Math.round(dy) - 1, 2, 2);
    }

    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(cx - 1, cy - 1, 2, 2);

    ctx.fillStyle = '#5e6a78';
    ctx.fillRect(x, cy - 2, 3, 4);
    ctx.fillStyle = '#e3a83a';
    ctx.fillRect(x - 2, cy - 1, 2, 2);

    ctx.fillStyle = '#5e6a78';
    ctx.fillRect(x + w - 3, cy - 2, 3, 4);
    ctx.fillStyle = '#ece7d7';
    ctx.fillRect(x + w, cy - 1, 2, 2);

    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(x + 3, y + h - 6, w - 6, 3);
    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(x + 3, y + h - 4, w - 6, 1);
  },
});
