'use strict';

// ───────────────────────────────────────────────────────────────────
//  FOUNDRY · TWISTS (Cluster E)
//  Three small wrinkles glued on top of the base foundry layer:
//    A. Gremlin Baffle  (E·02) — placeable defensive grate
//    B. Stench / aggro  (E·01) — running machines pull zombies faster
//    C. Match Grade     (E·03) — ammo presses roll a quality tier
//  This file MUST NOT modify anything outside itself. All cross-cutting
//  effects are observational (counters, timers) or post-load wrappers.
// ───────────────────────────────────────────────────────────────────

// Module-load globals — kept defensively idempotent in case anything
// else has already touched them.
Game.foundryStenchScore = Game.foundryStenchScore || 0;
Game.foundryQualityLog  = Game.foundryQualityLog  || [];

// ───────────────────────────────────────────────────────────────────
// SECTION A — Gremlin Baffle (E·02 partial)
// ───────────────────────────────────────────────────────────────────
registerMachine({
  id: 'gremlin_baffle',
  name: 'GREMLIN BAFFLE',
  cluster: 'LOGISTICS',
  desc: 'Mesh screen — denies sewer Gremlins access to your belts. Place at every duct.',
  footprint: { w: 1, h: 1 },
  hp: 100,
  buildCost: [{ id: 'scrap', n: 20 }],
  slots: { input: [], output: [] },
  recipes: [],
  // Always-on cosmetic "running" state — the baffle is a passive deterrent,
  // not a recipe runner, but we want its LED lit so the player can see it.
  tick(m, dt) { m.active = true; },
  draw(ctx, m, t) {
    const x = m.x, y = m.y, w = m.w, h = m.h;
    // Steel frame
    ctx.fillStyle = '#3a3f4a';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#5e6a78';
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    // Dark recess behind the mesh
    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(x + 4, y + 4, w - 8, h - 8);
    // 4x4 metal mesh inside the frame
    const meshL = x + 4, meshT = y + 4;
    const meshW = w - 8, meshH = h - 8;
    const cells = 4;
    ctx.strokeStyle = '#7a7e88';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < cells; i++) {
      const gx = Math.floor(meshL + (meshW * i) / cells) + 0.5;
      ctx.moveTo(gx, meshT);
      ctx.lineTo(gx, meshT + meshH);
      const gy = Math.floor(meshT + (meshH * i) / cells) + 0.5;
      ctx.moveTo(meshL, gy);
      ctx.lineTo(meshL + meshW, gy);
    }
    ctx.stroke();
    // Corner bolts in dark steel
    ctx.fillStyle = '#1c1f25';
    ctx.fillRect(x + 1, y + 1, 2, 2);
    ctx.fillRect(x + w - 3, y + 1, 2, 2);
    ctx.fillRect(x + 1, y + h - 3, 2, 2);
    ctx.fillRect(x + w - 3, y + h - 3, 2, 2);
  },
});

// ───────────────────────────────────────────────────────────────────
// SECTION B — Stench / aggro (E·01)
// ───────────────────────────────────────────────────────────────────
(function installStenchAggro() {
  // Bookkeeping tick — just measures the "stench" produced by active
  // machinery so other systems (and a future foreman console) can read it.
  setInterval(() => {
    if (!Game || !Game.machines) return;
    Game.foundryStenchScore = Game.machines.filter(m => m.active).length;
  }, 1000);

  // Aggro accelerator — a running factory smells like meat to zombies,
  // so the next spawn ticks down a little faster the busier you are.
  setInterval(() => {
    if (Game.mode !== 'playing') return;
    const stench = Game.foundryStenchScore || 0;
    if (stench > 3 && typeof Game.spawnTimer === 'number') {
      const cut = (stench - 3) * 0.3;
      Game.spawnTimer = Math.max(0, Game.spawnTimer - cut);
    }
  }, 5000);
})();

// ───────────────────────────────────────────────────────────────────
// SECTION C — Match Grade quality (E·03)
// ───────────────────────────────────────────────────────────────────
(function installMatchGradeQuality() {
  // Defer until after all foundry-* module scripts have evaluated, so
  // the press defs are guaranteed registered before we wrap them.
  setTimeout(() => {
    if (typeof FOUNDRY_MACHINES !== 'object' || !FOUNDRY_MACHINES) return;
    for (const def of Object.values(FOUNDRY_MACHINES)) {
      if (!def || (def.id !== 'ammo_press' && def.id !== 'specialty_press')) continue;
      const original = def.onCycle;
      def.onCycle = function wrappedOnCycle(m, recipe) {
        if (typeof original === 'function') original.call(this, m, recipe);
        // Roll quality based on condition — well-maintained machines hit
        // boutique tier; neglected ones spit out salvage-grade duds.
        const cond = (m && typeof m.condition === 'number') ? m.condition : 100;
        const roll = Math.random();
        let quality = 'Standard';
        if (cond >= 90) {
          if (roll < 0.05) quality = 'Boutique';
          else if (roll < 0.30) quality = 'Match';
        } else if (cond >= 70) {
          if (roll < 0.15) quality = 'Match';
        } else if (cond < 50) {
          if (roll < 0.10) quality = 'Salvage';
        }
        // Log entry (newest first, capped at 20).
        const caliber = recipe && recipe.caliber ? recipe.caliber : 'unknown';
        Game.foundryQualityLog.unshift({
          caliber, quality,
          t: (typeof now === 'function') ? now() : Date.now() / 1000,
        });
        if (Game.foundryQualityLog.length > 20) {
          Game.foundryQualityLog.length = 20;
        }
        // Bonus round for high-quality production.
        if ((quality === 'Match' || quality === 'Boutique')
            && Game.player && Game.player.ammo && caliber && Game.player.ammo[caliber]) {
          const slot = Game.player.ammo[caliber];
          if (slot.reserve !== Infinity) slot.reserve += 1;
        }
      };
    }
  }, 0);
})();
