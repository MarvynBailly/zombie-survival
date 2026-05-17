'use strict';

registerMachine({
  id: 'powder_mill',
  name: 'POWDER MILL',
  cluster: 'REFINING',
  tier: 1,
  footprint: { w: 2, h: 2 },
  hp: 180,
  buildCost: [{ id: 'scrap', n: 50 }],
  desc: 'Volatile. Combines mineral inputs into propellant.',
  slots: {
    input: ['saltpeter', 'sulfur', 'charcoal'],
    output: ['gunpowder_fast', 'gunpowder_med', 'gunpowder_slow'],
  },
  recipes: [
    { id: 'fast',   label: 'Fast Powder (Pistol/SMG)',  in: [{ id: 'saltpeter', n: 3 }, { id: 'sulfur', n: 1 }, { id: 'charcoal', n: 1 }], out: [{ id: 'gunpowder_fast', n: 6 }], cycle: 8  },
    { id: 'medium', label: 'Medium Powder (Rifle)',     in: [{ id: 'saltpeter', n: 3 }, { id: 'sulfur', n: 1 }, { id: 'charcoal', n: 2 }], out: [{ id: 'gunpowder_med',  n: 6 }], cycle: 9  },
    { id: 'slow',   label: 'Slow Powder (Shotgun/AP)',  in: [{ id: 'saltpeter', n: 4 }, { id: 'sulfur', n: 1 }, { id: 'charcoal', n: 2 }], out: [{ id: 'gunpowder_slow', n: 6 }], cycle: 10 },
  ],
  draw(ctx, m, t) {
    const x = m.x, y = m.y, w = m.w, h = m.h;

    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(x, y, w, h);

    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(x + 2, y + h - 8, w - 4, 6);
    ctx.fillStyle = '#5e6a78';
    ctx.fillRect(x + 4, y + h - 4, 4, 2);
    ctx.fillRect(x + w - 8, y + h - 4, 4, 2);

    const cx = x + w / 2;
    const cy = y + h / 2;
    const rx = w / 2 - 4;
    const ry = h / 2 - 6;

    ctx.fillStyle = '#4a261e';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#d9b35a';
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx - 2, ry - 2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#4a261e';
    ctx.fillRect(x + 2, cy - 1, w - 4, 2);

    // Rotating stave lines — phase-shifted by t to imply spin.
    const rot = t * 2;
    ctx.fillStyle = '#3a3f4a';
    for (let i = 0; i < 6; i++) {
      const phase = (rot + i * (Math.PI * 2 / 6)) % (Math.PI * 2);
      // Project a vertical stave onto the drum face using cos(phase).
      const sx = Math.cos(phase) * (rx - 3);
      if (Math.sin(phase) > -0.1) {
        const px = Math.round(cx + sx);
        ctx.fillRect(px - 1, cy - ry + 3, 1, (ry - 3) * 2);
      }
    }

    ctx.fillStyle = '#7a7e88';
    ctx.fillRect(cx - 1, cy - 1, 2, 2);

    ctx.fillStyle = '#e3a83a';
    const blink = Math.sin(t * 4) > 0 ? 1 : 0.3;
    ctx.globalAlpha = blink;
    ctx.fillRect(x + 3, y + 3, 2, 2);
    ctx.globalAlpha = 1;
  },
});
