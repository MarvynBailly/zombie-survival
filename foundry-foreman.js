'use strict';

registerMachine({
  id: 'foreman',
  name: 'FOREMAN CONSOLE',
  cluster: 'LOGISTICS',
  tier: 1,
  footprint: { w: 2, h: 2 },
  hp: 150,
  buildCost: [{ id: 'scrap', n: 120 }, { id: 'iron_ingot', n: 4 }, { id: 'copper_ingot', n: 6 }],
  desc: 'Top-down x-ray of your Foundry. Live throughput, fill %, alarms.',
  slots: { input: [], output: [] },
  recipes: [],

  tick(m, dt) {
    m.active = true;
  },

  customPanel(m, refresh) {
    const clusters = {};
    for (const m2 of Game.machines) {
      const def2 = FOUNDRY_MACHINES[m2.id];
      if (!def2) continue;
      const c = def2.cluster || 'MISC';
      (clusters[c] = clusters[c] || []).push(m2);
    }

    const clusterNodes = [];
    const clusterKeys = Object.keys(clusters).sort();
    for (const ck of clusterKeys) {
      const rows = [];
      for (const m2 of clusters[ck]) {
        const def2 = FOUNDRY_MACHINES[m2.id];
        const recipe = def2.recipes.find(r => r.id === m2.recipeId);
        const recipeLabel = recipe ? recipe.label : '—';
        const state = m2.active ? 'RUNNING' : 'IDLE';
        const stateColor = m2.active ? '#8ec547' : '#7a7e88';
        rows.push(el('div', {
          class: 'fnd-status',
          style: 'margin:2px 0;background:#1c1f25;padding:6px 8px;border-left:3px solid ' + stateColor,
        },
          el('div', { class: 'fnd-stat', style: 'flex:2' },
            el('div', { class: 'l' }, 'MACHINE'),
            el('div', { class: 'v', style: 'font-size:13px' }, def2.name)),
          el('div', { class: 'fnd-stat' },
            el('div', { class: 'l' }, 'COND'),
            el('div', { class: 'v' }, Math.round(m2.condition) + '%')),
          el('div', { class: 'fnd-stat' },
            el('div', { class: 'l' }, 'STATE'),
            el('div', { class: 'v', style: 'color:' + stateColor }, state)),
          el('div', { class: 'fnd-stat', style: 'flex:2' },
            el('div', { class: 'l' }, 'RECIPE'),
            el('div', { class: 'v', style: 'font-size:11px;color:#caa760' }, recipeLabel)),
        ));
      }
      if (!rows.length) {
        rows.push(el('div', { style: 'color:#7a7e88;font-size:11px;padding:4px' }, 'no machines'));
      }
      clusterNodes.push(el('div', { style: 'margin-bottom:10px' },
        el('div', {
          class: 'fnd-col-h',
          style: 'color:#5fb6e8;border-bottom:1px solid #3a3f4a;padding:2px 0;margin-bottom:4px',
        }, '◇ ' + ck + '  (' + clusters[ck].length + ')'),
        ...rows,
      ));
    }
    if (!clusterNodes.length) {
      clusterNodes.push(el('div', { style: 'color:#7a7e88;padding:8px' },
        'No machines placed. Press F to build.'));
    }

    const totals = {};
    for (const m2 of Game.machines) {
      for (const id in m2.outputs) totals[id] = (totals[id] || 0) + m2.outputs[id];
    }
    if (Game.player && Game.player.inventory) {
      for (const slot of Game.player.inventory.slots) {
        if (slot) totals[slot.id] = (totals[slot.id] || 0) + slot.count;
      }
    }
    const top = Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const totalCells = top.map(([id, n]) => {
      const def2 = ITEMS[id];
      const tint = def2 && def2.tint ? def2.tint : '#7a7e88';
      return el('div', {
        style: 'background:#1c1f25;padding:6px;display:flex;flex-direction:column;gap:2px;border-left:3px solid ' + tint,
      },
        el('div', { style: 'font-size:10px;color:#7a7e88;letter-spacing:0.5px' },
          (def2 ? def2.name : id).toUpperCase()),
        el('div', { style: 'font-size:16px;color:#ece7d7;font-weight:600' }, String(n)),
      );
    });
    if (!totalCells.length) {
      totalCells.push(el('div', { style: 'color:#7a7e88;font-size:11px;padding:4px' },
        'no materials tracked'));
    }

    const alarms = [];
    for (const m2 of Game.machines) {
      const def2 = FOUNDRY_MACHINES[m2.id];
      if (!def2) continue;
      if (m2.condition < 50) {
        alarms.push({ m: m2, def: def2, kind: 'LOW CONDITION', color: '#e3a83a' });
      }
      if (m2.hp < m2.maxHp * 0.5) {
        alarms.push({ m: m2, def: def2, kind: 'DAMAGED', color: '#d24b35' });
      }
      if (!m2.active && m2.recipeId && def2.recipes.length > 0) {
        alarms.push({ m: m2, def: def2, kind: 'IDLE — missing inputs', color: '#5fb6e8' });
      }
    }
    const alarmNodes = alarms.map(a => el('div', {
      style: 'background:#1c1f25;padding:5px 8px;margin:2px 0;border-left:3px solid ' + a.color +
        ';display:flex;justify-content:space-between;font-size:12px',
    },
      el('div', { style: 'color:#ece7d7' }, a.def.name),
      el('div', { style: 'color:' + a.color + ';letter-spacing:0.5px' }, a.kind),
    ));
    if (!alarmNodes.length) {
      alarmNodes.push(el('div', {
        style: 'color:#8ec547;font-size:12px;padding:6px 8px;background:#1c1f25;border-left:3px solid #8ec547',
      }, 'ALL SYSTEMS NOMINAL'));
    }

    return el('div', { class: 'panel', style: 'max-width:780px;max-height:88vh;overflow-y:auto' },
      el('div', { class: 'eyebrow' }, '◇ LOGISTICS · X-RAY'),
      el('h2', {}, 'FOREMAN CONSOLE'),
      el('div', { class: 'sub' },
        'Live telemetry across ' + Game.machines.length + ' machine(s).'),
      el('div', { class: 'sep' }),

      el('div', { class: 'fnd-col-h', style: 'color:#ece7d7;margin-bottom:6px' }, 'FACTORY ROSTER'),
      el('div', { style: 'max-height:300px;overflow-y:auto;padding-right:4px' }, ...clusterNodes),

      el('div', { class: 'sep' }),
      el('div', { class: 'fnd-col-h', style: 'color:#ece7d7;margin-bottom:6px' }, 'RESOURCE TOTALS · TOP 8'),
      el('div', { style: 'display:grid;grid-template-columns:repeat(4,1fr);gap:4px' }, ...totalCells),

      el('div', { class: 'sep' }),
      el('div', { class: 'fnd-col-h', style: 'color:#ece7d7;margin-bottom:6px' },
        'ALARMS  (' + alarms.length + ')'),
      el('div', {}, ...alarmNodes),

      el('div', { class: 'sep' }),
      el('button', { class: 'ghost', onclick: () => clearOverlay() }, 'CLOSE'),
    );
  },

  draw(ctx, m, t) {
    const x = m.x, y = m.y, w = m.w, h = m.h;

    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(x + Math.floor(w * 0.25), y + h - 6, Math.floor(w * 0.5), 5);
    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(x + Math.floor(w * 0.4), y + h - 3, Math.floor(w * 0.2), 2);

    const bezX = x + 2;
    const bezY = y + 1;
    const bezW = w - 4;
    const bezH = h - 8;

    ctx.fillStyle = '#5e6a78';
    ctx.fillRect(bezX, bezY, bezW, bezH);
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(bezX, bezY, bezW, 2);
    ctx.fillRect(bezX, bezY + bezH - 2, bezW, 2);
    ctx.fillRect(bezX, bezY, 2, bezH);
    ctx.fillRect(bezX + bezW - 2, bezY, 2, bezH);

    const scrX = bezX + 3;
    const scrY = bezY + 3;
    const scrW = bezW - 6;
    const scrH = bezH - 6;

    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(scrX, scrY, scrW, scrH);

    const scan = (Math.sin(t * 60) * 0.5 + 0.5);
    const scanLineY = scrY + Math.floor(scan * (scrH - 1));
    ctx.fillStyle = 'rgba(142,197,71,0.18)';
    ctx.fillRect(scrX, scanLineY, scrW, 1);

    ctx.fillStyle = 'rgba(142,197,71,0.08)';
    for (let ly = scrY + 1; ly < scrY + scrH; ly += 2) {
      ctx.fillRect(scrX, ly, scrW, 1);
    }

    const flick = (Math.sin(t * 8) * 0.5 + 0.5) * 0.4 + 0.6;
    const barX = scrX + 2;
    const barTop = scrY + 2;
    const barW = scrW - 4;
    const segH = 2;
    const segGap = 1;

    ctx.fillStyle = 'rgba(142,197,71,' + flick + ')';
    ctx.fillRect(barX, barTop, Math.floor(barW * 0.85), segH);

    ctx.fillStyle = 'rgba(142,197,71,' + (flick * 0.9) + ')';
    ctx.fillRect(barX, barTop + segH + segGap, Math.floor(barW * 0.6), segH);

    ctx.fillStyle = '#e3a83a';
    ctx.fillRect(barX, barTop + (segH + segGap) * 2, Math.floor(barW * 0.45), segH);

    ctx.fillStyle = '#e3a83a';
    ctx.fillRect(barX, barTop + (segH + segGap) * 3, Math.floor(barW * 0.7), segH);

    const redFlick = (Math.sin(t * 4) * 0.5 + 0.5);
    ctx.fillStyle = 'rgba(210,75,53,' + (0.5 + redFlick * 0.5) + ')';
    ctx.fillRect(barX, barTop + (segH + segGap) * 4, Math.floor(barW * 0.3), segH);

    ctx.fillStyle = '#5fb6e8';
    const blip = Math.floor((t * 12) % barW);
    ctx.fillRect(barX + blip, barTop + (segH + segGap) * 5, 2, segH);

    ctx.fillStyle = '#0b0c0e';
    ctx.fillRect(bezX + 3, bezY + bezH - 4, 2, 2);
    ctx.fillStyle = '#8ec547';
    ctx.fillRect(bezX + 3, bezY + bezH - 4, 1, 1);

    ctx.fillStyle = '#ece7d7';
    ctx.fillRect(bezX + bezW - 6, bezY + bezH - 4, 3, 1);
  },
});
