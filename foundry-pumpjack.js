'use strict';

registerMachine({
  id: 'pumpjack',
  name: 'PUMPJACK',
  cluster: 'EXTRACTION',
  tier: 1,
  footprint: { w: 3, h: 3 },
  hp: 320,
  buildCost: [{ id: 'scrap', n: 150 }, { id: 'iron_ingot', n: 8 }],
  desc: 'Sinks a well into a seep. Sweet crude is clean; sour is faster but toxic.',
  slots: {
    input: [],
    output: ['crude_oil'],
  },
  recipes: [
    { id: 'pump_sweet', label: 'Sweet Crude (clean)',          in: [], out: [{ id: 'crude_oil', n: 1 }], cycle: 32 },
    { id: 'pump_sour',  label: 'Sour Crude (toxic, faster)',   in: [], out: [{ id: 'crude_oil', n: 1 }], cycle: 22 },
  ],
  draw(ctx, m, t) {
    const x = m.x, y = m.y, w = m.w, h = m.h;

    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(x, y, w, h);

    const groundY = y + h - 14;
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(x + 2, groundY, w - 4, h - (groundY - y) - 2);

    ctx.fillStyle = '#0b0c0e';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.32, groundY + 8, 18, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    const apexX = x + w / 2;
    const apexY = y + 10;
    const baseL = x + 10;
    const baseR = x + w - 10;
    const baseY = groundY;

    ctx.strokeStyle = '#5e6a78';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(baseL, baseY); ctx.lineTo(apexX - 4, apexY);
    ctx.moveTo(baseR, baseY); ctx.lineTo(apexX + 4, apexY);
    ctx.moveTo(baseL + 14, baseY); ctx.lineTo(apexX - 2, apexY + 4);
    ctx.moveTo(baseR - 14, baseY); ctx.lineTo(apexX + 2, apexY + 4);
    ctx.stroke();

    ctx.strokeStyle = '#3a3f4a';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const yy = baseY - (baseY - apexY) * (i / 4);
      const spread = (baseR - baseL) * (1 - i / 4) / 2;
      ctx.beginPath();
      ctx.moveTo(apexX - spread, yy);
      ctx.lineTo(apexX + spread, yy);
      ctx.stroke();
    }

    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(apexX - 5, apexY - 4, 10, 6);

    const tilt = Math.sin(t * 1.5);
    const pivotX = apexX;
    const pivotY = apexY + 2;
    const armLen = 28;
    const frontX = pivotX - armLen;
    const backX = pivotX + armLen * 0.55;
    const frontY = pivotY + tilt * 10;
    const backY = pivotY - tilt * 6;

    ctx.strokeStyle = '#d24b35';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(frontX, frontY);
    ctx.lineTo(backX, backY);
    ctx.stroke();

    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(backX - 4, backY - 3, 8, 6);

    ctx.strokeStyle = '#5e6a78';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(frontX, frontY);
    ctx.lineTo(frontX, groundY + 6);
    ctx.stroke();

    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(frontX - 3, groundY + 4, 6, 4);

    const flicker = (Math.sin(t * 6) + 1) / 2;
    const fh = 4 + flicker * 3;
    ctx.fillStyle = '#e3a83a';
    ctx.fillRect(apexX - 2, apexY - 4 - fh, 4, fh);
    ctx.fillStyle = '#d24b35';
    ctx.fillRect(apexX - 1, apexY - 4 - fh, 2, Math.max(1, fh - 2));
  },
});
