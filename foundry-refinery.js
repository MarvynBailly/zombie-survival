'use strict';

registerMachine({
  id: 'refinery',
  name: 'REFINERY TOWER',
  cluster: 'REFINING',
  tier: 1,
  footprint: { w: 3, h: 4 },
  hp: 400,
  buildCost: [{ id: 'scrap', n: 200 }, { id: 'iron_ingot', n: 12 }, { id: 'copper_ingot', n: 4 }],
  desc: 'Cracks crude into four named precursors. Blend dial favors one output.',
  slots: {
    input: ['crude_oil', 'charcoal', 'coke'],
    output: ['smokeless_base', 'casing_plastic', 'lubricant', 'fuel_oil'],
  },
  recipes: [
    {
      id: 'blend_powder',
      label: 'Blend · Powder Heavy',
      in: [{ id: 'crude_oil', n: 2 }, { id: 'charcoal', n: 1 }],
      out: [{ id: 'smokeless_base', n: 3 }, { id: 'casing_plastic', n: 1 }, { id: 'lubricant', n: 1 }, { id: 'fuel_oil', n: 1 }],
      cycle: 45,
    },
    {
      id: 'blend_plastic',
      label: 'Blend · Plastic Heavy',
      in: [{ id: 'crude_oil', n: 2 }, { id: 'charcoal', n: 1 }],
      out: [{ id: 'smokeless_base', n: 1 }, { id: 'casing_plastic', n: 3 }, { id: 'lubricant', n: 1 }, { id: 'fuel_oil', n: 1 }],
      cycle: 45,
    },
    {
      id: 'blend_lube',
      label: 'Blend · Lube Heavy',
      in: [{ id: 'crude_oil', n: 2 }, { id: 'charcoal', n: 1 }],
      out: [{ id: 'smokeless_base', n: 1 }, { id: 'casing_plastic', n: 1 }, { id: 'lubricant', n: 3 }, { id: 'fuel_oil', n: 1 }],
      cycle: 45,
    },
    {
      id: 'blend_fuel',
      label: 'Blend · Fuel Heavy',
      in: [{ id: 'crude_oil', n: 2 }, { id: 'charcoal', n: 1 }],
      out: [{ id: 'smokeless_base', n: 1 }, { id: 'casing_plastic', n: 1 }, { id: 'lubricant', n: 1 }, { id: 'fuel_oil', n: 3 }],
      cycle: 45,
    },
  ],
  draw(ctx, m, t) {
    const x = m.x, y = m.y, w = m.w, h = m.h;

    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(x, y, w, h);

    const padY = y + h - 8;
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(x + 2, padY, w - 4, 6);

    const towerX = x + 12;
    const towerW = 36;
    const towerTop = y + 14;
    const towerBot = padY;
    ctx.fillStyle = '#5e6a78';
    ctx.fillRect(towerX, towerTop, towerW, towerBot - towerTop);

    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(towerX, towerTop, 3, towerBot - towerTop);
    ctx.fillRect(towerX + towerW - 3, towerTop, 3, towerBot - towerTop);

    ctx.fillStyle = '#1c1f25';
    for (let by = towerTop + 12; by < towerBot - 4; by += 14) {
      ctx.fillRect(towerX, by, towerW, 2);
    }

    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(towerX + 4, towerTop - 4, towerW - 8, 4);
    ctx.fillStyle = '#7a7e88';
    ctx.fillRect(towerX + 8, towerTop - 6, towerW - 16, 2);

    const flareX = towerX + towerW + 6;
    const flareBase = towerBot - 4;
    const flareTop = y + 6;
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(flareX, flareTop, 6, flareBase - flareTop);
    ctx.fillStyle = '#5e6a78';
    ctx.fillRect(flareX, flareTop, 2, flareBase - flareTop);

    ctx.fillStyle = '#7a7e88';
    ctx.fillRect(flareX - 1, flareTop - 2, 8, 3);

    const flick = (Math.sin(t * 8) + 1) / 2;
    const fh = 5 + flick * 4;
    ctx.fillStyle = '#e3a83a';
    ctx.fillRect(flareX, flareTop - 2 - fh, 6, fh);
    ctx.fillStyle = '#d24b35';
    ctx.fillRect(flareX + 1, flareTop - 2 - fh, 4, Math.max(2, fh - 3));
    ctx.fillStyle = '#ece7d7';
    ctx.fillRect(flareX + 2, flareTop - 2 - Math.max(1, fh - 5), 2, 2);

    const pipeXStart = towerX + towerW;
    const pipeXEnd = x + w - 4;
    const pipeYs = [
      towerTop + 14,
      towerTop + 30,
      towerTop + 46,
      towerTop + 62,
    ];
    const dropColors = ['#e3a83a', '#1c1f25', '#ece7d7', '#d9b35a'];

    for (let i = 0; i < pipeYs.length; i++) {
      const py = pipeYs[i];
      if (py > towerBot - 6) continue;
      ctx.fillStyle = '#3a3f4a';
      ctx.fillRect(pipeXStart, py, pipeXEnd - pipeXStart, 3);
      ctx.fillStyle = '#5e6a78';
      ctx.fillRect(pipeXStart, py, pipeXEnd - pipeXStart, 1);

      ctx.fillStyle = '#1c1f25';
      ctx.fillRect(pipeXEnd - 2, py - 1, 3, 5);

      const drip = Math.sin(t * 2 + i * 1.7);
      const dy = py + 4 + (drip > 0 ? drip * 2 : 0);
      ctx.fillStyle = dropColors[i];
      ctx.fillRect(pipeXEnd - 1, dy, 2, 3);
      ctx.fillRect(pipeXEnd, dy + 1, 1, 1);
    }
  },
});
