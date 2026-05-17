'use strict';

// Items tab: card per ITEMS entry. ITEMS only has a `tint` color, not a
// sprite, so we paint a tinted block as the visual.

const TabItems = (function () {
  const SPRITE_SIZE = 70;

  function buildCard(id, def) {
    const card = document.createElement('div');
    card.className = 'dev-card';
    card.dataset.search = (id + ' ' + (def.name || '') + ' ' + (def.category || '')).toLowerCase();

    // Visual: tinted block (items have no sprite renderer)
    const canvas = document.createElement('canvas');
    canvas.className = 'dev-card-sprite';
    canvas.width = SPRITE_SIZE;
    canvas.height = SPRITE_SIZE;
    const cctx = canvas.getContext('2d');
    cctx.imageSmoothingEnabled = false;
    cctx.fillStyle = def.tint || '#888';
    const sz = 36;
    cctx.fillRect((SPRITE_SIZE - sz) / 2, (SPRITE_SIZE - sz) / 2, sz, sz);
    // border + initial
    cctx.strokeStyle = 'rgba(0,0,0,0.5)';
    cctx.lineWidth = 1;
    cctx.strokeRect((SPRITE_SIZE - sz) / 2 + 0.5, (SPRITE_SIZE - sz) / 2 + 0.5, sz - 1, sz - 1);
    cctx.fillStyle = 'rgba(0,0,0,0.6)';
    cctx.font = 'bold 18px "JetBrains Mono", monospace';
    cctx.textAlign = 'center';
    cctx.textBaseline = 'middle';
    cctx.fillText((def.name || id).charAt(0).toUpperCase(), SPRITE_SIZE / 2, SPRITE_SIZE / 2 + 1);
    card.appendChild(canvas);

    const title = document.createElement('div');
    title.className = 'dev-card-title';
    title.textContent = def.name || id;
    card.appendChild(title);

    const stats = document.createElement('div');
    stats.className = 'dev-card-stats';
    for (const [k, v] of [['cat', def.category], ['stack', def.stackMax]]) {
      if (v == null) continue;
      const lbl = document.createElement('span'); lbl.textContent = k;
      const val = document.createElement('span'); val.textContent = String(v);
      stats.appendChild(lbl);
      stats.appendChild(val);
    }
    card.appendChild(stats);

    if (def.desc) {
      const desc = document.createElement('div');
      desc.style.fontSize = '10px';
      desc.style.color = 'var(--muted)';
      desc.style.marginBottom = '6px';
      desc.style.lineHeight = '1.3';
      // Truncate long descriptions.
      const t = def.desc.length > 60 ? def.desc.slice(0, 57) + '…' : def.desc;
      desc.textContent = t;
      card.appendChild(desc);
    }

    // Actions: give 1, give 10
    const actions = document.createElement('div');
    actions.className = 'dev-card-actions';
    const stack = def.stackMax || 1;
    const buttons = stack >= 10 ? [['+1', 1], ['+10', 10]] : [['+1', 1]];
    for (const [label, n] of buttons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = label;
      btn.addEventListener('click', () => {
        if (!window.DevCheats || !window.Game || !window.Game.player) {
          log('click LAUNCH first');
          return;
        }
        log(window.DevCheats.give(id, n));
      });
      actions.appendChild(btn);
    }
    card.appendChild(actions);

    return card;
  }

  let statusEl = null;
  function log(msg) {
    if (statusEl) statusEl.textContent = msg;
    if (window.DevConsole) window.DevConsole.log(msg, 'sys');
  }

  function mount(container) {
    container.innerHTML = '';
    if (typeof ITEMS === 'undefined') {
      container.textContent = 'ITEMS registry not loaded';
      return;
    }
    // Sort by category then id so similar items cluster.
    const ids = Object.keys(ITEMS).sort((a, b) => {
      const ca = ITEMS[a].category || '', cb = ITEMS[b].category || '';
      return ca === cb ? a.localeCompare(b) : ca.localeCompare(cb);
    });

    const toolbar = document.createElement('div');
    toolbar.className = 'dev-tab-toolbar';
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = `search ${ids.length} items…`;
    const count = document.createElement('span');
    count.className = 'dev-tab-count';
    count.textContent = `${ids.length} items`;
    statusEl = document.createElement('span');
    statusEl.className = 'dev-tab-count';
    toolbar.appendChild(search);
    toolbar.appendChild(count);
    toolbar.appendChild(statusEl);
    container.appendChild(toolbar);

    const grid = document.createElement('div');
    grid.className = 'dev-card-grid';
    container.appendChild(grid);
    for (const id of ids) {
      grid.appendChild(buildCard(id, ITEMS[id]));
    }

    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      for (const card of grid.children) {
        const match = !q || card.dataset.search.includes(q);
        card.style.display = match ? '' : 'none';
        if (match) shown++;
      }
      count.textContent = q ? `${shown}/${ids.length}` : `${ids.length} items`;
    });
  }

  return { mount };
})();

window.TabItems = TabItems;
