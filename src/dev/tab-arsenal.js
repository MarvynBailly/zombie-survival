'use strict';

// Arsenal tab: card per WEAPONS entry. Visual: ZSprites.drawHeldWeapon is
// drawn in local space with +x as aim direction, so we translate to the
// card center, no rotation, and let it render horizontally.

const TabArsenal = (function () {
  const SPRITE_SIZE = 70;

  function traitsFor(def) {
    const out = [];
    if (def.isRocket) out.push('AoE');
    if (def.pierce) out.push(`pierce ${def.pierce}`);
    if (def.isStream) out.push('stream');
    if (def.silent) out.push('silent');
    if (def.spinUp) out.push('spinup');
    if (def.chargeTime) out.push('charge');
    if (def.slowsWhileFiring) out.push('slows');
    if (def.bounces) out.push(`bounce ${def.bounces}`);
    if (def.isMelee) out.push('melee');
    if (def.isPlacer) out.push('placer');
    if (def.consumesItem) out.push(`uses ${def.consumesItem}`);
    if (def.explodeRadius) out.push(`r${def.explodeRadius|0}`);
    if (def.unlocked) out.push('starter');
    return out;
  }

  function buildCard(kind, def) {
    const card = document.createElement('div');
    card.className = 'dev-card';
    card.dataset.search = (kind + ' ' + (def.name || '')).toLowerCase();

    // Sprite
    const canvas = document.createElement('canvas');
    canvas.className = 'dev-card-sprite';
    canvas.width = SPRITE_SIZE;
    canvas.height = SPRITE_SIZE;
    const cctx = canvas.getContext('2d');
    cctx.imageSmoothingEnabled = false;
    cctx.save();
    cctx.translate(SPRITE_SIZE / 2 - 6, SPRITE_SIZE / 2);
    try {
      if (typeof ZSprites !== 'undefined' && typeof ZSprites.drawHeldWeapon === 'function') {
        ZSprites.drawHeldWeapon(cctx, kind, 0);
      }
    } catch (e) {
      cctx.fillStyle = '#888';
      cctx.fillRect(-4, -2, 24, 4);
    }
    cctx.restore();
    card.appendChild(canvas);

    // Title
    const title = document.createElement('div');
    title.className = 'dev-card-title';
    title.textContent = def.name || kind;
    card.appendChild(title);

    // Stats
    const stats = document.createElement('div');
    stats.className = 'dev-card-stats';
    const rows = [
      ['dmg',   def.damage],
      ['mag',   def.magSize],
      ['rate',  def.fireRate != null ? def.fireRate.toFixed(2) + 's' : null],
      ['range', def.bulletRange],
      ['reload', def.reloadTime != null ? def.reloadTime.toFixed(1) + 's' : null],
    ];
    if (def.pellets && def.pellets > 1) rows.unshift(['pellets', def.pellets]);
    for (const [k, v] of rows) {
      if (v == null) continue;
      const lbl = document.createElement('span'); lbl.textContent = k;
      const val = document.createElement('span'); val.textContent = String(v);
      stats.appendChild(lbl);
      stats.appendChild(val);
    }
    card.appendChild(stats);

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

    // Action: give (unlocks + refills)
    const actions = document.createElement('div');
    actions.className = 'dev-card-actions';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'give';
    btn.addEventListener('click', () => {
      if (!window.DevCheats || !window.Game || !window.Game.player) {
        log('click LAUNCH first');
        return;
      }
      log(window.DevCheats.give(kind));
    });
    actions.appendChild(btn);
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
    if (typeof WEAPONS === 'undefined') {
      container.textContent = 'WEAPONS registry not loaded';
      return;
    }
    const kinds = Object.keys(WEAPONS).sort();

    const toolbar = document.createElement('div');
    toolbar.className = 'dev-tab-toolbar';
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = `search ${kinds.length} weapons…`;
    const count = document.createElement('span');
    count.className = 'dev-tab-count';
    count.textContent = `${kinds.length} weapons`;
    statusEl = document.createElement('span');
    statusEl.className = 'dev-tab-count';
    toolbar.appendChild(search);
    toolbar.appendChild(count);
    toolbar.appendChild(statusEl);
    container.appendChild(toolbar);

    const grid = document.createElement('div');
    grid.className = 'dev-card-grid';
    container.appendChild(grid);
    for (const kind of kinds) {
      grid.appendChild(buildCard(kind, WEAPONS[kind]));
    }

    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      for (const card of grid.children) {
        const match = !q || card.dataset.search.includes(q);
        card.style.display = match ? '' : 'none';
        if (match) shown++;
      }
      count.textContent = q ? `${shown}/${kinds.length}` : `${kinds.length} weapons`;
    });
  }

  return { mount };
})();

window.TabArsenal = TabArsenal;
