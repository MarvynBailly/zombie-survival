'use strict';

registerMachine({
  id: 'hand_mine',
  name: 'HAND MINE',
  cluster: 'EXTRACTION',
  desc: 'Hand-mining station. Surfaces saltpeter, sulfur, and charcoal slowly.',
  footprint: { w: 2, h: 2 },
  hp: 120,
  buildCost: [{ id: 'scrap', n: 25 }],
  slots: {
    input: [],
    output: ['saltpeter', 'sulfur', 'charcoal'],
  },
  recipes: [
    { id: 'mine_saltpeter', label: 'Saltpeter', in: [], out: [{ id: 'saltpeter', n: 1 }], cycle: 32 },
    { id: 'mine_sulfur',    label: 'Sulfur',    in: [], out: [{ id: 'sulfur',    n: 1 }], cycle: 32 },
    { id: 'mine_charcoal',  label: 'Charcoal',  in: [], out: [{ id: 'charcoal',  n: 2 }], cycle: 18 },
  ],
  draw(ctx, m, t) {
    const x = m.x, y = m.y, w = m.w, h = m.h;

    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(x + 1, y + h - 3, w - 2, 2);

    ctx.fillStyle = '#5e6a78';
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h - 4, w / 2 - 3, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#7a7e88';
    ctx.fillRect(x + 4, y + h - 14, 2, 10);
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(x + 2, y + h - 16, 6, 3);

    ctx.fillStyle = '#7a7e88';
    const shovelTilt = Math.sin(t * 1.5) * 0.15;
    ctx.save();
    ctx.translate(x + w - 6, y + h - 6);
    ctx.rotate(-0.4 + shovelTilt);
    ctx.fillRect(-1, -10, 2, 10);
    ctx.fillStyle = '#5e6a78';
    ctx.fillRect(-3, 0, 6, 3);
    ctx.restore();

    const pulse = 0.7 + 0.3 * Math.sin(t * 3);

    ctx.fillStyle = `rgba(227,195,58,${pulse})`;
    ctx.fillRect(x + 8, y + h - 9, 3, 3);
    ctx.fillStyle = '#e3a83a';
    ctx.fillRect(x + 8, y + h - 7, 1, 1);

    ctx.fillStyle = `rgba(232,226,192,${pulse})`;
    ctx.fillRect(x + w / 2 - 1, y + h - 10, 3, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + w / 2, y + h - 9, 1, 1);

    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(x + w - 12, y + h - 8, 4, 3);
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(x + w - 11, y + h - 7, 1, 1);

    if (m.active) {
      const dustY = y + h - 5 + Math.sin(t * 4) * 1;
      ctx.fillStyle = 'rgba(122,126,136,0.5)';
      ctx.fillRect(x + w / 2 - 2, dustY, 4, 1);
    }
  },
});
