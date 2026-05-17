'use strict';

// POIs tab: list of POI kinds with footprint + a "tp to nearest" button.
// DevCheats.tpToPoi does the zone-scan + nearest match against poiForZone.

const TabPois = (function () {
  // Hand-curated terrain affinity descriptions, taken from
  // _computePoiForZone in world.js (so the dev knows where to expect each).
  const AFFINITY = {
    fishing_dock:   'adjacent water (shoreline)',
    lumber_camp:    'dense forest',
    mining_outpost: 'adjacent mountain',
    hut:            'tier 1 — close to spawn',
    campsite:       'tier 1',
    cottage:        'tier 1–2',
    house:          'tier 2',
    gas_station:    'tier 2',
    farm:           'tier 1–2 — flat land',
    warehouse:      'tier 2–3',
    town:           'tier 3+',
    city:           'tier 3+',
  };

  function buildRow(kind, size) {
    const row = document.createElement('div');
    row.className = 'dev-foundry-machine';
    row.dataset.search = kind.toLowerCase();

    const head = document.createElement('div');
    head.className = 'dev-foundry-head';
    const name = document.createElement('span');
    name.className = 'dev-foundry-name';
    name.textContent = kind;
    head.appendChild(name);
    const fp = document.createElement('span');
    fp.className = 'dev-foundry-fp';
    fp.textContent = `${size[0]}×${size[1]} tiles`;
    head.appendChild(fp);
    row.appendChild(head);

    const aff = AFFINITY[kind];
    if (aff) {
      const desc = document.createElement('div');
      desc.className = 'dev-foundry-desc';
      desc.textContent = aff;
      row.appendChild(desc);
    }

    const actions = document.createElement('div');
    actions.className = 'dev-card-actions';
    actions.style.marginTop = '4px';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'tp to nearest';
    btn.addEventListener('click', () => {
      if (!window.DevCheats || !window.Game || !window.Game.player) {
        log('click LAUNCH first');
        return;
      }
      log(window.DevCheats.tpToPoi(kind));
    });
    actions.appendChild(btn);
    row.appendChild(actions);

    return row;
  }

  let statusEl = null;
  function log(msg) {
    if (statusEl) statusEl.textContent = msg;
    if (window.DevConsole) window.DevConsole.log(msg, 'sys');
  }

  function mount(container) {
    container.innerHTML = '';
    if (typeof POI_SIZES === 'undefined') {
      container.textContent = 'POI_SIZES not loaded';
      return;
    }
    const kinds = Object.keys(POI_SIZES).sort();

    const toolbar = document.createElement('div');
    toolbar.className = 'dev-tab-toolbar';
    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = `search ${kinds.length} POI kinds…`;
    const count = document.createElement('span');
    count.className = 'dev-tab-count';
    count.textContent = `${kinds.length} kinds`;
    statusEl = document.createElement('span');
    statusEl.className = 'dev-tab-count';
    toolbar.appendChild(search);
    toolbar.appendChild(count);
    toolbar.appendChild(statusEl);
    container.appendChild(toolbar);

    const list = document.createElement('div');
    list.className = 'dev-foundry-machines';
    container.appendChild(list);
    for (const k of kinds) list.appendChild(buildRow(k, POI_SIZES[k]));

    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      for (const row of list.children) {
        const match = !q || row.dataset.search.includes(q);
        row.style.display = match ? '' : 'none';
        if (match) shown++;
      }
      count.textContent = q ? `${shown}/${kinds.length}` : `${kinds.length} kinds`;
    });
  }

  return { mount };
})();

window.TabPois = TabPois;
