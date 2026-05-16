// snippets/sprites-dispatch.js
// Three patches to apply to your existing zombie-survival/sprites.js so the
// new sprites are routed correctly. None of these change behavior of existing
// sprites — they just add fallback lookups.
//
// Apply these by hand (or have Claude CLI do it). They are inside the IIFE
// of sprites.js, near the existing `drawObstacle`, `drawZombie`, and
// `drawHeldWeapon` functions.

// ============================================================
// PATCH 1 · drawObstacle dispatch
// ============================================================
//
// REPLACE your existing drawObstacle with this version. The new code adds a
// `kind` lookup that picks the new prop/block draw fn from ZExpand or
// ZProps. If `o.kind` isn't set, behavior is identical to before.

function drawObstacle(ctx, o, levelStyle) {
  // New blocks from ZExpand (Jersey, Sandbags, CarWreck, Container,
  // Dumpster, Fence, FuelPump, Pallet, ToxicDrum)
  if (o.kind && typeof window.ZExpand !== 'undefined') {
    const fn = window.ZExpand['draw' + o.kind];
    if (typeof fn === 'function') return fn(ctx, o);
  }
  // New props from ZProps (sofa, fridge, sofa, bed, …)
  if (o.kind && typeof window.ZProps !== 'undefined') {
    const fn = window.ZProps.draw[o.kind];
    if (typeof fn === 'function') return fn(ctx, o);
  }
  // Original behavior — level-style routing
  if (levelStyle === 'graveyard') return drawTombstone(ctx, o);
  if (levelStyle === 'warehouse') return drawWarehouseWall(ctx, o);
  return drawCrate(ctx, o);
}


// ============================================================
// PATCH 2 · drawZombie dispatch
// ============================================================
//
// REPLACE your existing drawZombie. Adds two lookups: one for ZExpand
// (capitalized fn names like drawSpitter), one for ZBestiary (lowercased
// keys like 'cluster'). Falls back to existing switch.

function drawZombie(ctx, z) {
  // New enemies from ZExpand (drawSpitter, drawCrawler, drawScreamer,
  // drawBomber, drawRiot, drawWraith)
  if (typeof window.ZExpand !== 'undefined') {
    const cap = z.type && (z.type[0].toUpperCase() + z.type.slice(1));
    const fn = window.ZExpand['draw' + cap];
    if (typeof fn === 'function') return fn(ctx, z);
  }
  // New enemies from ZBestiary (cluster, hivesac, shrieker, brood, necro,
  // charger, reaper, stalker, bloater, frost, mimic, cent, hatch, twins)
  if (typeof window.ZBestiary !== 'undefined') {
    const fn = window.ZBestiary.draw[z.type];
    if (typeof fn === 'function') return fn(ctx, z);
  }
  // Original behavior
  switch (z.type) {
    case 'runner': return drawRunner(ctx, z);
    case 'tank':   return drawTank(ctx, z);
    case 'fire':   return drawFireZombie(ctx, z);
    case 'walker':
    default:       return drawWalker(ctx, z);
  }
}


// ============================================================
// PATCH 3 · drawHeldWeapon — add new weapon cases
// ============================================================
//
// In your existing drawHeldWeapon(ctx, weapon, flash), append these CASE
// branches inside the switch statement, BEFORE the default. Don't replace
// the existing cases; just add these alongside.

case 'crossbow': {
  if (typeof window.ZExpand !== 'undefined') return ZExpand.drawCrossbow(ctx);
  break;
}
case 'flamer': {
  if (typeof window.ZExpand !== 'undefined') return ZExpand.drawFlamethrower(ctx);
  break;
}
case 'minigun': {
  if (typeof window.ZExpand !== 'undefined') return ZExpand.drawMinigun(ctx);
  break;
}
case 'railgun': {
  if (typeof window.ZExpand !== 'undefined') return ZExpand.drawRailgun(ctx);
  break;
}
case 'gl': {
  if (typeof window.ZExpand !== 'undefined') return ZExpand.drawGrenadeLauncher(ctx);
  break;
}
case 'saw': {
  if (typeof window.ZExpand !== 'undefined') return ZExpand.drawChainsaw(ctx);
  break;
}


// ============================================================
// PATCH 4 (optional) · Add the new sprite namespaces to ZSprites public API
// ============================================================
//
// If you want the new sprites accessible through the ZSprites namespace
// (instead of via ZExpand / ZProps / ZBestiary), add this at the bottom of
// sprites.js's IIFE — right before or inside the `root.ZSprites = { ... }`
// publish block:

// Re-export the expansion namespaces under ZSprites for convenience.
if (typeof window.ZExpand !== 'undefined')   root.ZSprites.expand   = window.ZExpand;
if (typeof window.ZProps !== 'undefined')    root.ZSprites.props    = window.ZProps;
if (typeof window.ZBestiary !== 'undefined') root.ZSprites.bestiary = window.ZBestiary;

// (Then you can also call ZSprites.props.draw.sofa(ctx, o) etc.)


// ============================================================
// CHECKLIST
// ============================================================
//
// After applying patches 1–3:
//
//   [ ] No console errors when game.html loads
//   [ ] An obstacle with { kind: 'sofa', w: 116, h: 56 } draws as a couch
//   [ ] A zombie with { type: 'spitter', ... } draws as the new spitter
//   [ ] A zombie with { type: 'cluster', ... } draws as the infection cluster
//   [ ] Player switching to weapon 'crossbow' shows the crossbow in-hand
//
// Run a quick smoke-test by opening the dev console and pasting:
//
//   Game.zombies.push({ type: 'cluster', x: Game.player.x + 200, y: Game.player.y,
//     r: 28, hp: 280, maxHp: 280, angle: 0, walkPhase: 0 });
//
// You should see an Infection Cluster appear next to you.
