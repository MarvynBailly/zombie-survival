'use strict';

registerMachine({
  id: 'silo',
  name: 'SILO',
  cluster: 'LOGISTICS',
  tier: 1,
  footprint: { w: 2, h: 3 },
  hp: 250,
  buildCost: [{ id: 'scrap', n: 60 }],
  desc: 'Bulk storage. Drop in any precursor; pull it back out later. Buffer for night shifts.',
  outputCap: 9999,
  slots: {
    input: ['scrap', 'iron_ingot', 'copper_ingot', 'lead_ingot', 'iron_ore', 'copper_ore', 'lead_ore', 'saltpeter', 'sulfur', 'charcoal', 'coke', 'crude_oil', 'smokeless_base', 'casing_plastic', 'lubricant', 'fuel_oil', 'brass_strip', 'brass_casing', 'primer', 'primer_compound', 'lead_bullet', 'gunpowder_fast', 'gunpowder_med', 'gunpowder_slow', 'acid', 'lye'],
    output: ['scrap', 'iron_ingot', 'copper_ingot', 'lead_ingot', 'iron_ore', 'copper_ore', 'lead_ore', 'saltpeter', 'sulfur', 'charcoal', 'coke', 'crude_oil', 'smokeless_base', 'casing_plastic', 'lubricant', 'fuel_oil', 'brass_strip', 'brass_casing', 'primer', 'primer_compound', 'lead_bullet', 'gunpowder_fast', 'gunpowder_med', 'gunpowder_slow', 'acid', 'lye'],
  },
  recipes: [],
  tick(m, dt) {
    for (const id in m.inputs) {
      if (m.inputs[id] > 0) {
        m.outputs[id] = (m.outputs[id] || 0) + m.inputs[id];
        m.inputs[id] = 0;
      }
    }
    m.active = false;
  },
  draw(ctx, m, t) {
    const x = m.x, y = m.y, w = m.w, h = m.h;

    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(x, y, w, h);

    const tubeX = x + 3;
    const tubeY = y + 6;
    const tubeW = w - 6;
    const tubeH = h - 10;

    ctx.fillStyle = '#5e6a78';
    ctx.fillRect(tubeX, tubeY, tubeW, tubeH);

    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(tubeX, tubeY, 2, tubeH);
    ctx.fillRect(tubeX + tubeW - 2, tubeY, 2, tubeH);

    ctx.fillStyle = '#7a7e88';
    ctx.fillRect(tubeX + 2, tubeY, tubeW - 4, 1);

    ctx.fillStyle = '#3a3f4a';
    for (let by = tubeY + 8; by < tubeY + tubeH - 4; by += 10) {
      ctx.fillRect(tubeX + 1, by, tubeW - 2, 1);
    }

    ctx.fillStyle = '#3a3f4a';
    ctx.beginPath();
    ctx.moveTo(tubeX - 1, tubeY);
    ctx.lineTo(x + w / 2, y + 1);
    ctx.lineTo(tubeX + tubeW + 1, tubeY);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#5e6a78';
    ctx.fillRect(x + w / 2 - 2, y, 4, 3);

    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(x + w - 2, tubeY + 4, 1, tubeH - 8);
    ctx.fillStyle = '#7a7e88';
    for (let ry = tubeY + 6; ry < tubeY + tubeH - 4; ry += 5) {
      ctx.fillRect(x + w - 3, ry, 3, 1);
    }

    const winX = tubeX + 3;
    const winY = tubeY + Math.floor(tubeH / 2) - 3;
    const winW = tubeW - 6;
    const winH = 6;
    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(winX, winY, winW, winH);
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(winX, winY, winW, 1);

    ctx.fillStyle = '#e3a83a';
    ctx.fillRect(winX + 1, winY + 2, winW - 2, 1);
    ctx.fillRect(winX + 1, winY + 4, Math.max(1, winW - 4), 1);

    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(tubeX, y + h - 4, tubeW, 3);
    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(tubeX, y + h - 2, tubeW, 1);
  },
});
