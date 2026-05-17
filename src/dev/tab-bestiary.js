'use strict';

// Bestiary tab: card per ZOMBIES entry with live sprite + spawn button.
// The sprite functions (ZSprites.drawZombie / ZBestiary.draw / ZExpand)
// read world coords directly from the zombie object. With no ctx transform
// installed, world coords map 1:1 to canvas pixels — so positioning a fake
// instance at (cx, cy) centers it in the card canvas.

const TabBestiary = (function () {
  const SPRITE_SIZE = 70;

  // Heuristic trait labels — chosen from the boolean / object flags on each
  // ZOMBIES def. Keep this list short; the card has limited width.
  function traitsFor(def) {
    const out = [];
    if (def.isFire) out.push('fire');
    if (def.stationary) out.push('static');
    if (def.ranged) out.push('ranged');
    if (def.ignoresWalls) out.push('phases');
    if (def.callsHorde) out.push('calls');
    if (def.raisesNearby) out.push('raises');
    if (def.charge) out.push('charges');
    if (def.onDeathExplode) out.push('explodes');
    if (def.burstOnDeath) out.push('bursts');
    if (def.spawns || def.spawnsOnWalk) out.push('spawns');
    if (def.auraBuff) out.push('aura');
    if (def.infectionOnHit) out.push('infects');
    if (def.frontDR) out.push('armored');
    if (def.tendrilHeal) out.push('heals');
    if (def.bleedOnHit) out.push('bleeds');
    if (def.chillOnHit) out.push('chills');
    if (def.armor) out.push('armored');
    return out;
  }

  function buildCard(kind, def) {
    const card = document.createElement('div');
    card.className = 'dev-card';
    card.dataset.search = kind.toLowerCase();

    // ---- sprite preview ----
    const canvas = document.createElement('canvas');
    canvas.className = 'dev-card-sprite';
    canvas.width = SPRITE_SIZE;
    canvas.height = SPRITE_SIZE;
    const cctx = canvas.getContext('2d');
    cctx.imageSmoothingEnabled = false;
    const fakeZ = {
      x: SPRITE_SIZE / 2,
      y: SPRITE_SIZE / 2 + 4,    // nudge down a touch for shadow space
      r: Math.min(18, def.radius || 14),
      type: kind,
      angle: -Math.PI / 2,        // facing up
      walkPhase: 0.25,
      // a few fields some draw fns read defensively
      hp: def.hp, maxHp: def.hp,
      vx: 0, vy: 0,
      hit: 0,
    };
    try {
      if (typeof ZSprites !== 'undefined' && typeof ZSprites.drawZombie === 'function') {
        ZSprites.drawZombie(cctx, fakeZ);
      }
    } catch (e) {
      // Some sprite fns read fields we didn't fake — fall back to a color disc.
      cctx.fillStyle = def.color || '#888';
      cctx.beginPath();
      cctx.arc(SPRITE_SIZE / 2, SPRITE_SIZE / 2, fakeZ.r, 0, Math.PI * 2);
      cctx.fill();
    }
    card.appendChild(canvas);

    // ---- title ----
    const title = document.createElement('div');
    title.className = 'dev-card-title';
    title.textContent = kind;
    card.appendChild(title);

    // ---- stats ----
    const stats = document.createElement('div');
    stats.className = 'dev-card-stats';
    const rows = [
      ['hp',    def.hp],
      ['dmg',   def.damage],
      ['speed', def.speed],
      ['r',     def.radius],
      ['score', def.score],
    ];
    for (const [k, v] of rows) {
      if (v == null) continue;
      const lbl = document.createElement('span'); lbl.textContent = k;
      const val = document.createElement('span'); val.textContent = String(v);
      stats.appendChild(lbl);
      stats.appendChild(val);
    }
    card.appendChild(stats);

    // ---- traits ----
    const traits = traitsFor(def);
    if (traits.length) {
      const wrap = document.createElement('div');
      wrap.className = 'dev-card-traits';
      for (const t of traits) {
        const chip = document.createElement('span');
        chip.className = 'dev-card-trait';
        chip.textContent = t;
        wrap.appendChild(chip);
      }
      card.appendChild(wrap);
    }

    // ---- actions ----
    const actions = document.createElement('div');
    actions.className = 'dev-card-actions';
    const count = document.createElement('input');
    count.type = 'number';
    count.min = '1';
    count.value = '1';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'spawn';
    btn.addEventListener('click', () => {
      if (!window.DevCheats) {
        log('spawn requires the game to be running — click LAUNCH first');
        return;
      }
      if (!window.Game || !window.Game.player) {
        log('no player yet — click LAUNCH first');
        return;
      }
      const n = Math.max(1, parseInt(count.value, 10) || 1);
      const msg = window.DevCheats.spawn(kind, n);
      log(msg);
    });
    actions.appendChild(count);
    actions.appendChild(btn);
    card.appendChild(actions);

    return card;
  }

  // Status line above the grid: short feedback for spawn clicks.
  let statusEl = null;
  function log(msg) {
    if (statusEl) statusEl.textContent = msg;
    if (window.DevConsole) window.DevConsole.log(msg, 'sys');
  }

  function mount(container) {
    container.innerHTML = '';
    if (typeof ZOMBIES === 'undefined') {
      container.textContent = 'ZOMBIES registry not loaded';
      return;
    }
    const kinds = Object.keys(ZOMBIES).sort();

    // ---- toolbar ----
    const toolbar = document.createElement('div');
    toolbar.className = 'dev-tab-toolbar';
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = `search ${kinds.length} entries…`;
    const count = document.createElement('span');
    count.className = 'dev-tab-count';
    count.textContent = `${kinds.length} kinds`;
    statusEl = document.createElement('span');
    statusEl.className = 'dev-tab-count';
    toolbar.appendChild(search);
    toolbar.appendChild(count);
    toolbar.appendChild(statusEl);
    container.appendChild(toolbar);

    // ---- grid ----
    const grid = document.createElement('div');
    grid.className = 'dev-card-grid';
    container.appendChild(grid);

    for (const kind of kinds) {
      const card = buildCard(kind, ZOMBIES[kind]);
      grid.appendChild(card);
    }

    // ---- search wiring ----
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      for (const card of grid.children) {
        const match = !q || card.dataset.search.includes(q);
        card.style.display = match ? '' : 'none';
        if (match) shown++;
      }
      count.textContent = q ? `${shown}/${kinds.length}` : `${kinds.length} kinds`;
    });
  }

  return { mount };
})();

window.TabBestiary = TabBestiary;
