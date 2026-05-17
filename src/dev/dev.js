'use strict';

// Dev page orchestrator. Loaded last on dev.html. Owns:
//   - Design-mode state (seed, region, levelIndex)
//   - Live worldgen preview
//   - LAUNCH WORLD → splice custom (seed, region) into the real boot path
//
// Production (index.html) does NOT load this file.

(function () {
  const state = {
    levelIndex: 0,
    seed: (Math.random() * 0x7fffffff) | 0,
    region: null,  // filled below
  };

  // Snapshot LEVELS[0] for our initial state. We deep-copy region so slider
  // edits don't mutate the canonical preset on the LEVELS array.
  function seedInitialState() {
    if (typeof LEVELS === 'undefined' || !LEVELS.length) {
      console.error('[dev] LEVELS not loaded');
      return;
    }
    state.levelIndex = 0;
    state.region = { ...LEVELS[0].region };
  }

  // Debounced preview re-render. Slider drag fires many input events; we
  // coalesce to one render per ~30ms.
  let renderTimer = null;
  function scheduleRender() {
    if (renderTimer) cancelAnimationFrame(renderTimer);
    renderTimer = requestAnimationFrame(() => {
      renderTimer = null;
      renderPreview();
    });
  }

  function renderPreview() {
    const canvas = document.getElementById('dev-preview');
    if (!canvas) return;
    const stats = WorldgenPreview.render(canvas, {
      seed: state.seed,
      region: state.region,
    });
    if (stats) updateStats(stats);
  }

  function updateStats(stats) {
    setText('dev-stat-water',    pct(stats.water));
    setText('dev-stat-forest',   pct(stats.forest));
    setText('dev-stat-mountain', pct(stats.mountain));
    setText('dev-stat-pois',     String(stats.pois));
    setText('dev-stat-seed',     String(state.seed));
  }

  function setText(id, t) {
    const el = document.getElementById(id);
    if (el) el.textContent = t;
  }

  function pct(n) { return (n * 100).toFixed(1) + '%'; }

  // ---- LAUNCH ----
  // Splice point: patch LEVELS[levelIndex].region so resetRun picks up our
  // custom region; patch World.init so the random seed is replaced with our
  // chosen one. Both patches persist for the session so Esc → Restart
  // reproduces the same world.
  function launch() {
    if (!state.region) return;
    if (typeof LEVELS === 'undefined' || typeof World === 'undefined') {
      console.error('[dev] core not loaded');
      return;
    }
    const idx = state.levelIndex;
    LEVELS[idx].region = { ...state.region };

    if (!World.__devPatched) {
      const origInit = World.init.bind(World);
      World.init = function (_seed, region) {
        return origInit(state.seed, region);
      };
      World.__devPatched = true;
    }

    // Swap visibility BEFORE startGame so the canvas can size itself.
    document.getElementById('dev-shell').classList.add('hidden');
    document.getElementById('app').style.display = '';

    // startGame is defined in ui.js. It calls resetRun + sets Game.mode.
    if (typeof startGame === 'function') {
      startGame(idx);
    } else {
      console.error('[dev] startGame missing');
      return;
    }

    // Mount the floating console button + restore default HUD on play page.
    mountFloatingControls();
  }

  // After launch, drop a small "DEV" badge into the corner so the user
  // remembers they're in dev mode, plus a hint about backtick.
  function mountFloatingControls() {
    if (document.getElementById('dev-badge')) return;
    const badge = document.createElement('div');
    badge.id = 'dev-badge';
    badge.innerHTML = 'DEV<span class="kbd">`</span>';
    badge.title = 'Press ` to open dev console';
    badge.addEventListener('click', () => DevConsole && DevConsole.show());
    document.body.appendChild(badge);
  }

  // ---- Preview tooltip ----
  function wirePreviewTooltip() {
    const canvas = document.getElementById('dev-preview');
    const tip = document.getElementById('dev-preview-tooltip');
    if (!canvas || !tip) return;
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
      const sy = (e.clientY - rect.top)  * (canvas.height / rect.height);
      const hit = WorldgenPreview.tileAt({ seed: state.seed, region: state.region }, sx, sy);
      if (!hit) { tip.style.display = 'none'; return; }
      const name = TERRAIN_NAMES[hit.t] || '?';
      tip.style.display = 'block';
      tip.style.left = (e.clientX + 12) + 'px';
      tip.style.top  = (e.clientY + 12) + 'px';
      tip.textContent = `${name} @ ${hit.tx},${hit.ty}`;
    });
    canvas.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  }

  const TERRAIN_NAMES = ['grass', 'forest', 'sand', 'shallow water', 'deep water', 'hill', 'mountain', 'path'];

  // ---- Boot ----
  function boot() {
    seedInitialState();

    WorldgenPanel.mount(
      document.getElementById('dev-panel-body'),
      state,
      () => scheduleRender()
    );

    DevConsole.mount();

    document.getElementById('dev-launch').addEventListener('click', launch);

    wirePreviewTooltip();
    renderPreview();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
