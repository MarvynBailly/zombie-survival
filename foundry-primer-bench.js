'use strict';

registerMachine({
  id: 'primer_bench',
  name: 'PRIMER BENCH',
  cluster: 'ASSEMBLY',
  desc: 'Hand-operated. Mixes and presses primer caps — handle with care.',
  footprint: { w: 2, h: 2 },
  hp: 150,
  buildCost: [{ id: 'scrap', n: 35 }],
  slots: {
    input: ['sulfur', 'saltpeter', 'copper_ingot', 'primer_compound'],
    output: ['primer_compound', 'primer'],
  },
  recipes: [
    { id: 'mix_compound',  label: 'Mix Primer Compound', in: [{ id: 'sulfur',          n: 1 }, { id: 'saltpeter',    n: 1 }], out: [{ id: 'primer_compound', n: 3  }], cycle: 3 },
    { id: 'press_primers', label: 'Press Primer Cups',   in: [{ id: 'primer_compound', n: 1 }, { id: 'copper_ingot', n: 1 }], out: [{ id: 'primer',          n: 12 }], cycle: 5 },
  ],
  draw(ctx, m, t) {
    const x = m.x, y = m.y, w = m.w, h = m.h;

    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(x, y, w, h);

    const topY = y + h / 2 - 2;
    ctx.fillStyle = '#8a5a2a';
    ctx.fillRect(x + 2, topY, w - 4, h / 2);
    ctx.fillStyle = '#6b441f';
    ctx.fillRect(x + 2, topY, w - 4, 2);
    ctx.fillRect(x + 2, topY + 6, w - 4, 1);
    ctx.fillRect(x + 2, topY + 12, w - 4, 1);

    ctx.fillStyle = '#6b441f';
    ctx.fillRect(x + 4, y + h - 5, 3, 4);
    ctx.fillRect(x + w - 7, y + h - 5, 3, 4);

    const cupY = topY - 4;
    const cupSpacing = (w - 16) / 2;
    for (let i = 0; i < 3; i++) {
      const cupX = x + 8 + i * cupSpacing;
      ctx.fillStyle = '#d8884a';
      ctx.fillRect(cupX, cupY, 4, 4);
      ctx.fillStyle = '#caa760';
      ctx.fillRect(cupX + 1, cupY + 1, 2, 1);
    }

    const flicker = (Math.sin(t * 17.3) + Math.sin(t * 31.7)) * 0.5;
    if (flicker > 0.7) {
      const sparkIdx = Math.floor((t * 3) % 3);
      const sparkX = x + 8 + sparkIdx * cupSpacing + 2;
      ctx.fillStyle = '#e3a83a';
      ctx.fillRect(sparkX - 1, cupY - 2, 2, 2);
      ctx.fillStyle = '#ece7d7';
      ctx.fillRect(sparkX, cupY - 1, 1, 1);
    }
  },
});
