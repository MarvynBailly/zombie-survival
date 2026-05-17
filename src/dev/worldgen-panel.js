'use strict';

// Worldgen parameter panel. Builds the sidebar UI inside `container` and
// fires `onChange(state)` whenever any input moves. Caller owns state.

const WorldgenPanel = (function () {
  // Slider specs: [key, label, min, max, step]. Order matches what feels
  // useful in the UI, not defs.js source order.
  const TERRAIN_SLIDERS = [
    ['elevFreq',     'elev frequency',  0.010, 0.060, 0.001],
    ['moistFreq',    'moisture freq',   0.010, 0.060, 0.001],
    ['deepWater',    'deep water',      0,     1,     0.01 ],
    ['shallowWater', 'shallow water',   0,     1,     0.01 ],
    ['sand',         'sand',            0,     1,     0.01 ],
    ['hill',         'hill',            0,     1,     0.01 ],
    ['mountain',     'mountain',        0,     1,     0.01 ],
    ['forestMoist',  'forest moisture', 0,     1,     0.01 ],
  ];
  const WORLD_SLIDERS = [
    ['poiDensity',   'POI density',     0.3,   2.5,   0.05 ],
    ['spawnSafe',    'spawn-safe r',    4,     32,    1    ],
  ];

  function mount(container, initial, onChange) {
    container.innerHTML = '';
    const state = { ...initial };

    // ---- Region preset ----
    const regionField = field('base region');
    const regionSel = document.createElement('select');
    regionSel.id = 'dev-region-select';
    const levels = (typeof LEVELS !== 'undefined') ? LEVELS : [];
    levels.forEach((lvl, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = lvl.name;
      regionSel.appendChild(opt);
    });
    regionSel.value = String(initial.levelIndex || 0);
    regionSel.addEventListener('change', () => {
      const i = parseInt(regionSel.value, 10);
      state.levelIndex = i;
      // Adopt that preset's params verbatim — the user can then drift them.
      const r = levels[i] && levels[i].region;
      if (r) {
        state.region = { ...r };
        rebuildSliders();
      }
      onChange(state);
    });
    regionField.appendChild(regionSel);
    container.appendChild(regionField);

    // ---- Seed ----
    const seedField = field('seed');
    const seedRow = document.createElement('div');
    seedRow.className = 'dev-row';
    const seedInput = document.createElement('input');
    seedInput.type = 'number';
    seedInput.value = String(state.seed);
    seedInput.id = 'dev-seed-input';
    seedInput.addEventListener('input', () => {
      const n = parseInt(seedInput.value, 10);
      if (isFinite(n)) {
        state.seed = n;
        onChange(state);
      }
    });
    const seedBtn = document.createElement('button');
    seedBtn.type = 'button';
    seedBtn.className = 'dev-btn-ghost';
    seedBtn.textContent = 'random';
    seedBtn.addEventListener('click', () => {
      state.seed = (Math.random() * 0x7fffffff) | 0;
      seedInput.value = String(state.seed);
      onChange(state);
    });
    seedRow.appendChild(seedInput);
    seedRow.appendChild(seedBtn);
    seedField.appendChild(seedRow);
    container.appendChild(seedField);

    // ---- Slider sections ----
    let slidersHost = document.createElement('div');
    slidersHost.id = 'dev-sliders';
    container.appendChild(slidersHost);
    rebuildSliders();

    // ---- Reset ----
    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'dev-btn-ghost dev-reset';
    resetBtn.textContent = '↻ reset to preset';
    resetBtn.addEventListener('click', () => {
      const r = levels[state.levelIndex] && levels[state.levelIndex].region;
      if (r) {
        state.region = { ...r };
        rebuildSliders();
        onChange(state);
      }
    });
    container.appendChild(resetBtn);

    function rebuildSliders() {
      slidersHost.innerHTML = '';
      section(slidersHost, 'terrain');
      TERRAIN_SLIDERS.forEach(spec => addSlider(slidersHost, state, spec, onChange));
      section(slidersHost, 'world');
      WORLD_SLIDERS.forEach(spec => addSlider(slidersHost, state, spec, onChange));
    }

    return state;
  }

  function field(labelText) {
    const wrap = document.createElement('div');
    wrap.className = 'dev-field';
    const lbl = document.createElement('label');
    lbl.textContent = labelText;
    wrap.appendChild(lbl);
    return wrap;
  }

  function section(host, text) {
    const s = document.createElement('div');
    s.className = 'dev-section';
    s.textContent = text;
    host.appendChild(s);
  }

  function addSlider(host, state, spec, onChange) {
    const [key, label, min, max, step] = spec;
    const wrap = document.createElement('div');
    wrap.className = 'dev-slider';
    const lbl = document.createElement('label');
    lbl.textContent = label;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    const cur = state.region[key];
    input.value = cur != null ? String(cur) : String((min + max) / 2);
    const val = document.createElement('span');
    val.className = 'dev-slider-val';
    val.textContent = fmt(input.value, step);
    input.addEventListener('input', () => {
      const n = parseFloat(input.value);
      state.region[key] = (step >= 1) ? Math.round(n) : n;
      val.textContent = fmt(input.value, step);
      onChange(state);
    });
    wrap.appendChild(lbl);
    wrap.appendChild(input);
    wrap.appendChild(val);
    host.appendChild(wrap);
  }

  function fmt(v, step) {
    const n = parseFloat(v);
    if (step >= 1) return String(n | 0);
    if (step >= 0.01) return n.toFixed(2);
    return n.toFixed(3);
  }

  return { mount };
})();

window.WorldgenPanel = WorldgenPanel;
