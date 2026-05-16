'use strict';

// ───────────────────────────────────────────────────────────────────
//  FOUNDRY UI — build menu + per-machine overlay
// ───────────────────────────────────────────────────────────────────
//  All Foundry overlays follow the same modal pattern as the existing
//  pause / leaderboard / inventory overlays in ui.js:
//    - Append a full-screen `.overlay` div to #overlay-root.
//    - Esc or a "× CLOSE" button calls clearOverlay() to remove it.
//    - Game.mode stays 'playing' so machines keep ticking in the
//      background — same as the inventory overlay.
// ───────────────────────────────────────────────────────────────────

function openFoundryBuildMenu() {
  if (typeof clearOverlay === 'function') clearOverlay();
  const rows = [];
  // Group machines by tier+cluster for readability.
  const ordered = Object.values(FOUNDRY_MACHINES).sort((a, b) =>
    (a.cluster || 'z').localeCompare(b.cluster || 'z') || a.name.localeCompare(b.name));
  for (const def of ordered) {
    const cost = def.buildCost || [{ id: 'scrap', n: 30 }];
    const canAfford = cost.every(c => hasItem(Game.player.inventory, c.id, c.n));
    const costStr = cost.map(c => `${c.n}× ${ITEMS[c.id] ? ITEMS[c.id].name : c.id}`).join(' · ');
    const row = el('div', {
      class: 'foundry-row' + (canAfford ? '' : ' locked'),
      onclick: () => {
        if (!canAfford) { setNotice('Not enough materials', 1.2); return; }
        FoundryBuild.select(def.id);
      },
    },
      el('div', { class: 'foundry-row-name' }, def.name),
      el('div', { class: 'foundry-row-cost' }, costStr),
      el('div', { class: 'foundry-row-desc' }, def.desc || ''),
    );
    rows.push(row);
  }
  if (!rows.length) {
    rows.push(el('div', { class: 'foundry-row-desc' },
      'No machines unlocked yet. Loot blueprints from POIs.'));
  }
  const panel = el('div', { class: 'panel', style: 'max-width:640px' },
    el('div', { class: 'eyebrow' }, '◇ FOUNDRY · BUILD MENU'),
    el('h2', {}, 'PLACE A MACHINE'),
    el('div', { class: 'sub' }, 'Click a machine, then LMB on the world to place it. Esc to cancel.'),
    el('div', { class: 'sep' }),
    el('div', { class: 'foundry-list' }, ...rows),
    el('div', { class: 'sep' }),
    el('button', { class: 'ghost', onclick: () => clearOverlay() }, '× CLOSE'),
  );
  overlayRoot.appendChild(el('div', { class: 'overlay' }, panel));
}

// ─────────────────────────────────────────────────────────────────
//  Per-machine overlay (E to interact)
// ─────────────────────────────────────────────────────────────────

function openMachineOverlay(m) {
  if (typeof clearOverlay === 'function') clearOverlay();
  const def = FOUNDRY_MACHINES[m.id];
  if (!def) return;

  let panel;
  function refresh() {
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = buildMachinePanel(m, def, refresh);
    overlayRoot.querySelector('.overlay').appendChild(panel);
  }

  overlayRoot.appendChild(el('div', { class: 'overlay' }));
  refresh();
}

function buildMachinePanel(m, def, refresh) {
  const recipe = def.recipes.find(r => r.id === m.recipeId);
  const progressPct = recipe ? Math.min(100, Math.round((m.progress / recipe.cycle) * 100)) : 0;

  // Recipe picker — only if more than one recipe.
  const recipePicker = def.recipes.length > 1
    ? el('div', { class: 'foundry-recipes' },
        ...def.recipes.map(r => el('button', {
          class: 'recipe-btn' + (m.recipeId === r.id ? ' active' : ''),
          onclick: () => { m.recipeId = r.id; m.progress = 0; refresh(); },
        }, r.label)))
    : null;

  // Input slots: clickable to push from inventory.
  const inputSlots = def.slots.input.map(id => {
    const def2 = ITEMS[id];
    const have = m.inputs[id] || 0;
    const stash = itemCount(Game.player.inventory, id);
    return el('div', { class: 'fnd-slot', onclick: () => {
      const moved = pushToMachine(m, id, Math.min(50, stash));
      if (moved > 0) Audio.sfx.pickup();
      refresh();
    } },
      el('div', { class: 'fnd-slot-name' }, def2 ? def2.name : id),
      el('div', { class: 'fnd-slot-count' }, have + (stash > 0 ? ` (+${stash})` : '')),
    );
  });

  // Output slots: clickable to pull into inventory.
  const outputSlots = def.slots.output.map(id => {
    const def2 = ITEMS[id];
    const have = m.outputs[id] || 0;
    return el('div', { class: 'fnd-slot fnd-slot-out' + (have > 0 ? ' has-output' : ''), onclick: () => {
      const moved = pullFromMachine(m, id, have);
      if (moved > 0) Audio.sfx.pickup();
      refresh();
    } },
      el('div', { class: 'fnd-slot-name' }, def2 ? def2.name : id),
      el('div', { class: 'fnd-slot-count' }, String(have)),
    );
  });

  // Pull-all + close buttons
  const buttons = el('div', { class: 'row' },
    el('button', { onclick: () => { pullAllOutputs(m); refresh(); } }, 'COLLECT ALL'),
    el('button', { class: 'ghost', onclick: () => clearOverlay() }, 'CLOSE'),
  );

  return el('div', { class: 'panel', style: 'max-width:680px' },
    el('div', { class: 'eyebrow' }, '◇ ' + (def.cluster || 'FOUNDRY')),
    el('h2', {}, def.name),
    el('div', { class: 'sub' }, def.desc || ''),
    el('div', { class: 'sep' }),
    // Top status strip — condition + active state
    el('div', { class: 'fnd-status' },
      el('div', { class: 'fnd-stat' },
        el('div', { class: 'l' }, 'CONDITION'),
        el('div', { class: 'v' }, Math.round(m.condition) + '%')),
      el('div', { class: 'fnd-stat' },
        el('div', { class: 'l' }, 'HP'),
        el('div', { class: 'v' }, Math.round(m.hp) + '/' + m.maxHp)),
      el('div', { class: 'fnd-stat' },
        el('div', { class: 'l' }, 'STATE'),
        el('div', { class: 'v' }, m.active ? 'RUNNING' : 'IDLE')),
      el('div', { class: 'fnd-stat' },
        el('div', { class: 'l' }, 'PROGRESS'),
        el('div', { class: 'v' }, progressPct + '%')),
    ),
    recipePicker,
    el('div', { class: 'fnd-cols' },
      el('div', { class: 'fnd-col' },
        el('div', { class: 'fnd-col-h' }, 'INPUTS · click to load'),
        ...inputSlots,
      ),
      el('div', { class: 'fnd-col' },
        el('div', { class: 'fnd-col-h' }, 'OUTPUTS · click to collect'),
        ...outputSlots,
      ),
    ),
    el('div', { class: 'sep' }),
    buttons,
  );
}

// ─────────────────────────────────────────────────────────────────
//  Auto-refresh while open: poll the overlay every 0.5s so progress
//  bars / counts stay current without manual interaction.
// ─────────────────────────────────────────────────────────────────
setInterval(() => {
  const ov = overlayRoot && overlayRoot.querySelector('.overlay .panel h2');
  if (!ov) return;
  // Detect a machine overlay by checking if any open machine is in range
  // and its name matches the panel heading.
  if (Game.mode !== 'playing' || !Game.player) return;
  const m = machineNearPlayer(Game.player);
  if (!m) return;
  const def = FOUNDRY_MACHINES[m.id];
  if (!def || ov.textContent !== def.name) return;
  // Re-build the panel in place.
  const old = overlayRoot.querySelector('.overlay .panel');
  if (!old || !old.parentNode) return;
  const parent = old.parentNode;
  const fresh = buildMachinePanel(m, def, () => {});
  parent.replaceChild(fresh, old);
}, 500);

// ─────────────────────────────────────────────────────────────────
//  Key handlers — F for build menu, E close to a machine to open it.
// ─────────────────────────────────────────────────────────────────
window.addEventListener('keydown', e => {
  if (Game.mode !== 'playing') return;
  const k = e.key.toLowerCase();
  if (k === FOUNDRY_BUILD_KEY) {
    if (overlayRoot.querySelector('.overlay')) return;     // overlay already open
    FoundryBuild.open();
    e.preventDefault();
    return;
  }
  if (k === 'escape' && FoundryBuild.active) {
    FoundryBuild.cancel();
    setNotice('Build cancelled', 1);
    e.preventDefault();
  }
});

// Click-to-place handler. Hooks into the canvas mousedown that fires
// weapons / opens chests — we intercept BEFORE the weapon fires when
// build mode is active.
canvas.addEventListener('mousedown', e => {
  if (!FoundryBuild.active) return;
  if (e.button !== 0) return;
  e.stopImmediatePropagation();
  const wx = input.wx, wy = input.wy;
  if (FoundryBuild.tryPlace(wx, wy)) {
    // Stay in build mode for multi-place — hold Shift to keep ghost,
    // otherwise exit on first successful placement.
    if (!input.keys.has('shift')) FoundryBuild.cancel();
  }
}, true);
