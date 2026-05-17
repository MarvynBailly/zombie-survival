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
  // Exposed for slot save/load (cheats.js needs to update seed + region
  // before calling continueGame(slotData)).
  window.DevState = state;

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

  // World.init monkey-patch: replace the random seed used by resetRun with
  // whatever's in state.seed at call time. Installed once at boot so slot-
  // load works even from dev shell (before LAUNCH was clicked). Reads state
  // by closure — state.seed is always current.
  function installWorldInitPatch() {
    if (typeof World === 'undefined' || World.__devPatched) return;
    const origInit = World.init.bind(World);
    World.init = function (_seed, region) {
      return origInit(state.seed, region);
    };
    World.__devPatched = true;
  }

  // Swap dev shell out, game UI in. Used by both LAUNCH and slot-load.
  function enterGameUI() {
    document.getElementById('dev-shell').classList.add('hidden');
    document.getElementById('app').style.display = '';
    mountFloatingControls();
  }
  state.enterGameUI = enterGameUI;

  // ---- LAUNCH ----
  // Splice point: patch LEVELS[levelIndex].region so resetRun picks up our
  // custom region. World.init patch is already installed at boot.
  function launch() {
    if (!state.region) return;
    if (typeof LEVELS === 'undefined') {
      console.error('[dev] core not loaded');
      return;
    }
    const idx = state.levelIndex;
    LEVELS[idx].region = { ...state.region };

    enterGameUI();

    // startGame is defined in ui.js. It calls resetRun + sets Game.mode.
    if (typeof startGame === 'function') {
      startGame(idx);
    } else {
      console.error('[dev] startGame missing');
    }
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

  // Shift-click on the M-map teleports the player to that world position.
  // The map render (render.js) stashes its transform on Game.__mapTransform;
  // we invert it here. Capture phase so we fire before game.js's mousedown
  // (which would set input.mouseDown = true and ghost-fire a weapon).
  function wireMapClickTeleport() {
    const canvas = document.getElementById('game');
    if (!canvas) return;
    canvas.addEventListener('mousedown', (e) => {
      if (!e.shiftKey) return;
      if (!window.Game || !window.Game.mapOpen) return;
      const tx = window.Game.__mapTransform;
      if (!tx || !tx.scale) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = canvas.getBoundingClientRect();
      const sx = (e.clientX - rect.left) * (canvas.width / rect.width);
      const sy = (e.clientY - rect.top)  * (canvas.height / rect.height);
      const wx = (sx - tx.offX) / tx.scale;
      const wy = (sy - tx.offY) / tx.scale;
      if (window.DevCheats) {
        const msg = window.DevCheats.teleport(wx, wy);
        if (window.DevConsole) window.DevConsole.log(msg, 'sys');
      }
      // Close the map after teleporting so the player sees where they landed.
      window.Game.mapOpen = false;
    }, true);
  }

  // ---- Boot ----
  function boot() {
    seedInitialState();
    installWorldInitPatch();

    WorldgenPanel.mount(
      document.getElementById('dev-panel-body'),
      state,
      () => scheduleRender()
    );

    DevConsole.mount();

    document.getElementById('dev-launch').addEventListener('click', launch);

    wirePreviewTooltip();
    wireMapClickTeleport();
    renderPreview();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
