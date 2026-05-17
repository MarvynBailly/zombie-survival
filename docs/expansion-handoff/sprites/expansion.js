// expansion.jsx — new weapons, enemies, and blocks
// Procedural top-down sprites matching the existing ZSprites style.
// All draw functions live on window.ZExpand so they can be lifted into
// sprites.js directly later. Cards below render them into the design
// catalog at 3-4× zoom on a checkered preview tile.

(function (root) {
  'use strict';
  const TAU = Math.PI * 2;

  // ----- palette (subset of ZSprites palette, plus a few new tokens) -----
  const C = {
    ink: '#0b0c0e', inkSoft: '#14161a', bone: '#e8e6df', boneDim: '#a8a59c',
    blood: '#d24b35', bloodDeep: '#8a2a1a', bloodLight: '#ec6448',
    toxic: '#8ec547', toxicDeep: '#4a6b22', toxicGoo: '#b9d855',
    warn: '#e3a83a', fire1: '#ffb84a', fire2: '#ff6a2a',
    gunBody: '#1a1a1f', gunMetal: '#3a3f48', gunMetalHi: '#5e6470',
    elec: '#7fc8ff', elecDeep: '#2a6a9a',

    // new enemy skins
    spitterSkin: '#5a7a3a', spitterBelly: '#a4c45a', spitterDrool: '#c8e870',
    crawlerSkin: '#7a5a3a', crawlerHi: '#a4855a',
    screamerSkin: '#b8a890', screamerLo: '#6a5f4f',
    bomberSkin: '#a5a230', bomberLo: '#5a5818', bomberGlow: '#d4ff5a',
    riotSuit: '#2a3138', riotSuitHi: '#48535e', riotPlate: '#161a20', riotShield: '#7e858f',
    wraithBody: '#2a2530', wraithHi: '#4e4256', wraithEye: '#7fb6ff',

    // blocks
    concrete: '#7e8088', concreteHi: '#a3a4ac', concreteLo: '#43464d',
    sand: '#a89060', sandHi: '#c9b078', sandLo: '#5a4825',
    rust: '#7a3a26', rustHi: '#a5553a', rustLo: '#3a160a',
    paint: '#445566', paintHi: '#5c7388',
    container: '#8b3a30', containerHi: '#b5564a', containerLo: '#4a1a14',
    container2: '#c98b35', container2Hi: '#e3a85a',
    dumpster: '#3a5f3a', dumpsterHi: '#5a8a5a', dumpsterLo: '#1f3320',
    fence: '#8a8e94', fenceLo: '#4a4d54',
    pumpBody: '#c64a36', pumpBodyHi: '#e36448', pumpDeep: '#621a10',
    pallet: '#9a7a48', palletHi: '#bd9560', palletLo: '#4d3a1a',
    drumTox: '#5a8a30', drumToxHi: '#82b246', drumToxLo: '#2a4a14',
  };

  function shadow(ctx, x, y, rx, ry) {
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(x + 1, y + 4, rx, ry, 0, 0, TAU);
    ctx.fill();
  }
  function rectShadow(ctx, x, y, w, h, inset) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(x + 3, y + h - (inset || 3), w, inset || 3);
  }

  // ============================================================
  // WEAPONS — drawn in the player's hand-pose (local coords,
  // +x = aim direction). Mirror the existing drawHeldWeapon
  // signature so they can drop into sprites.js as-is.
  // ============================================================

  function drawCrossbow(ctx) {
    // stock at back
    ctx.fillStyle = '#5a4028';
    ctx.fillRect(-3, -1.8, 8, 3.6);
    // body / receiver
    ctx.fillStyle = C.gunBody;
    ctx.fillRect(5, -2.2, 6, 4.4);
    // limbs (top + bottom) — recurve curve faked with two slabs
    ctx.fillStyle = C.gunMetal;
    ctx.fillRect(8, -8, 2.4, 6);
    ctx.fillRect(8, 2, 2.4, 6);
    ctx.fillStyle = C.gunMetalHi;
    ctx.fillRect(8, -8, 2.4, 1);
    ctx.fillRect(8, 7, 2.4, 1);
    // bowstring
    ctx.strokeStyle = '#d8d4c4';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(10, -7); ctx.lineTo(13, 0); ctx.lineTo(10, 7);
    ctx.stroke();
    // bolt (loaded forward)
    ctx.fillStyle = '#dcd4b8';
    ctx.fillRect(11, -0.5, 12, 1);
    ctx.fillStyle = C.blood;
    ctx.beginPath();
    ctx.moveTo(23, -1); ctx.lineTo(25, 0); ctx.lineTo(23, 1);
    ctx.closePath(); ctx.fill();
    // fletching
    ctx.fillStyle = C.warn;
    ctx.fillRect(11.5, -1.2, 1.5, 2.4);
    // scope dot
    ctx.fillStyle = C.gunBody;
    ctx.fillRect(6, -3.4, 3, 1.2);
  }

  function drawFlamethrower(ctx) {
    // tank on back (overflows behind player)
    ctx.fillStyle = C.gunMetal;
    ctx.fillRect(-13, -5, 7, 10);
    ctx.fillStyle = C.gunMetalHi;
    ctx.fillRect(-13, -5, 7, 1.2);
    ctx.fillStyle = C.bloodDeep;
    ctx.fillRect(-13, -5, 1.5, 10);
    // hose curving forward
    ctx.strokeStyle = '#1a1a1f';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-7, -2); ctx.quadraticCurveTo(4, -6, 10, -2);
    ctx.stroke();
    // grip + body
    ctx.fillStyle = C.gunBody;
    ctx.fillRect(6, -1, 5, 6);
    // barrel + flare
    ctx.fillStyle = C.gunMetal;
    ctx.fillRect(10, -2.5, 10, 5);
    ctx.fillStyle = C.gunMetalHi;
    ctx.fillRect(11, -2.5, 9, 0.7);
    // muzzle ring
    ctx.fillStyle = C.gunBody;
    ctx.fillRect(19, -3.2, 2, 6.4);
    // pilot flame
    ctx.fillStyle = 'rgba(255,180,60,0.9)';
    ctx.beginPath();
    ctx.arc(22, 0, 1.6, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,180,0.95)';
    ctx.beginPath();
    ctx.arc(22, 0, 0.8, 0, TAU); ctx.fill();
  }

  function drawMinigun(ctx) {
    // body
    ctx.fillStyle = C.gunBody;
    ctx.fillRect(-2, -4, 11, 8);
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(-2, -4, 11, 1.2);
    // ammo belt feeding from below
    ctx.fillStyle = C.warn;
    for (let i = 0; i < 5; i++) ctx.fillRect(-1 + i * 1.6, 4, 1.2, 4);
    ctx.fillStyle = '#a8782a';
    ctx.fillRect(-1, 7, 9, 1);
    // barrel cluster (6 barrels from above = ring of dots + outer ring)
    ctx.fillStyle = C.gunMetal;
    ctx.beginPath(); ctx.arc(15, 0, 4.4, 0, TAU); ctx.fill();
    ctx.fillStyle = C.gunMetalHi;
    ctx.beginPath(); ctx.arc(15, 0, 4.4, Math.PI * 0.8, Math.PI * 1.2); ctx.fill();
    // individual barrels (dots)
    ctx.fillStyle = '#0a0a0c';
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      ctx.beginPath();
      ctx.arc(15 + Math.cos(a) * 2.5, Math.sin(a) * 2.5, 0.9, 0, TAU);
      ctx.fill();
    }
    // muzzle base
    ctx.fillStyle = C.gunMetal;
    ctx.fillRect(19, -1.4, 3, 2.8);
    // grip
    ctx.fillStyle = '#1a1a1f';
    ctx.fillRect(2, 4, 3, 4);
  }

  function drawRailgun(ctx) {
    // body
    ctx.fillStyle = '#2a3038';
    ctx.fillRect(-2, -3, 22, 6);
    ctx.fillStyle = '#3e4750';
    ctx.fillRect(-2, -3, 22, 1.2);
    // glowing capacitor stripe
    ctx.fillStyle = C.elec;
    ctx.fillRect(2, -0.8, 14, 1.6);
    ctx.fillStyle = '#cfeaff';
    ctx.fillRect(3, -0.4, 13, 0.5);
    // magnetic coil rings along barrel
    ctx.fillStyle = '#0a0a0c';
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(6 + i * 3.2, -3.5, 1.4, 7);
    }
    // emitter tip
    ctx.fillStyle = C.elecDeep;
    ctx.fillRect(20, -2.4, 2, 4.8);
    ctx.fillStyle = C.elec;
    ctx.beginPath(); ctx.arc(22, 0, 1.2, 0, TAU); ctx.fill();
    // grip
    ctx.fillStyle = C.gunBody;
    ctx.fillRect(2, 3, 4, 4);
  }

  function drawGrenadeLauncher(ctx) {
    // stock
    ctx.fillStyle = '#5a4028';
    ctx.fillRect(-3, -1.5, 7, 3);
    // body
    ctx.fillStyle = C.gunBody;
    ctx.fillRect(4, -2.4, 5, 4.8);
    // drum (revolver chamber)
    ctx.fillStyle = C.gunMetal;
    ctx.beginPath(); ctx.arc(11, 0, 4.4, 0, TAU); ctx.fill();
    ctx.fillStyle = C.gunMetalHi;
    ctx.beginPath(); ctx.arc(11, 0, 4.4, Math.PI * 0.7, Math.PI * 1.3); ctx.fill();
    // 6 chambers
    ctx.fillStyle = '#0a0a0c';
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      ctx.beginPath();
      ctx.arc(11 + Math.cos(a) * 2.4, Math.sin(a) * 2.4, 1.1, 0, TAU);
      ctx.fill();
    }
    // stubby barrel
    ctx.fillStyle = C.gunMetal;
    ctx.fillRect(15, -2.6, 8, 5.2);
    ctx.fillStyle = C.gunMetalHi;
    ctx.fillRect(16, -2.6, 7, 0.8);
    // muzzle hole (visible from above)
    ctx.fillStyle = '#0a0a0c';
    ctx.beginPath(); ctx.arc(22, 0, 1.6, 0, TAU); ctx.fill();
    // grip
    ctx.fillStyle = C.gunBody;
    ctx.fillRect(4, 2, 3, 4);
  }

  function drawChainsaw(ctx) {
    // engine block
    ctx.fillStyle = C.blood;
    ctx.fillRect(-2, -4, 8, 8);
    ctx.fillStyle = C.bloodLight;
    ctx.fillRect(-2, -4, 8, 1.4);
    ctx.fillStyle = C.bloodDeep;
    ctx.fillRect(-2, 2.6, 8, 1.4);
    // pull cord knob
    ctx.fillStyle = '#dcd4b8';
    ctx.beginPath(); ctx.arc(-3, -2, 1.2, 0, TAU); ctx.fill();
    // handle
    ctx.strokeStyle = '#1a1a1f';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(0, -4); ctx.quadraticCurveTo(2, -7, 5, -4);
    ctx.stroke();
    // bar
    ctx.fillStyle = C.gunMetal;
    ctx.fillRect(6, -2.2, 16, 4.4);
    ctx.fillStyle = C.gunMetalHi;
    ctx.fillRect(6, -2.2, 16, 0.9);
    // tip rounded
    ctx.fillStyle = C.gunMetal;
    ctx.beginPath(); ctx.arc(22, 0, 2.2, 0, TAU); ctx.fill();
    // chain teeth (alternating top/bottom)
    ctx.fillStyle = '#dcd4b8';
    for (let i = 0; i < 7; i++) {
      ctx.fillRect(7 + i * 2.2, -3.4, 1, 1.1);
      ctx.fillRect(7 + i * 2.2 + 1, 2.3, 1, 1.1);
    }
    // small blood fleck near base
    ctx.fillStyle = C.bloodDeep;
    ctx.fillRect(7, -0.5, 1.4, 1);
  }

  const WEAPONS = [
    { id: 'crossbow', name: 'CROSSBOW', tag: 'SILENT',
      stat: ['fireRate 0.9', 'dmg 90', 'pierce 3', 'silent kills'],
      copy: 'High-damage bolt. Punches through up to 3 zombies — best vs lined-up runners. No groan-alert from kills.',
      draw: drawCrossbow },
    { id: 'flamer', name: 'FLAMETHROWER', tag: 'CONE',
      stat: ['fireRate stream', 'dmg 8/tick', 'range 180', 'ignites'],
      copy: 'Sustained cone of fire. Tags every zombie it touches with the burn DOT — clears packed walkers fast, fuel-bottle ammo.',
      draw: drawFlamethrower },
    { id: 'minigun', name: 'MINIGUN', tag: 'SPIN-UP',
      stat: ['spin-up 0.6s', 'dmg 9', 'fireRate 0.04', 'mag 200'],
      copy: 'Holds left-mouse to spin barrels, then dumps a fire-hose of bullets. Slows movement while firing — risky in melee range.',
      draw: drawMinigun },
    { id: 'railgun', name: 'RAILGUN', tag: 'CHARGE',
      stat: ['charge 1.2s', 'dmg 200', 'hitscan', 'pierces all'],
      copy: 'Hold to charge, release to fire a hitscan beam that passes through everything in a line — including walls. The headline shot.',
      draw: drawRailgun },
    { id: 'gl', name: 'GRENADE LAUNCHER', tag: 'BOUNCE',
      stat: ['fireRate 0.8', 'dmg 90', 'AoE 90', 'bounce 1'],
      copy: 'Arcing grenade that bounces once before detonating. Lets you lob over crates and into the back of a horde.',
      draw: drawGrenadeLauncher },
    { id: 'saw', name: 'CHAINSAW', tag: 'MELEE',
      stat: ['contact dps 90', 'no ammo', '+15% MS', 'ignores armor'],
      copy: 'Melee. Continuous damage to anything in a forward cone. Cleaves armor on the Riot enemy. Loud — pulls extra spawns.',
      draw: drawChainsaw },
  ];

  // ============================================================
  // ENEMIES — accept the same shape the existing drawZombie expects
  // (x, y, r, hp, maxHp, angle, walkPhase, onFire, stunned).
  // ============================================================

  function drawSpitter(ctx, z) {
    const x = z.x, y = z.y, ang = z.angle || 0;
    const walk = z.walkPhase || 0;
    const legSwing = Math.sin(walk * TAU) * 2;
    shadow(ctx, x, y, z.r, z.r * 0.45);

    // legs (small, thin — body is the show)
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = C.spitterSkin;
    ctx.fillRect(-z.r * 0.4, 2 + legSwing, 3, 6);
    ctx.fillRect(z.r * 0.15, 2 - legSwing, 3, 6);
    ctx.restore();

    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    // bulbous belly (asymmetric — bigger toward rear)
    ctx.fillStyle = C.spitterBelly;
    ctx.beginPath();
    ctx.ellipse(-z.r * 0.1, 0, z.r * 0.95, z.r * 0.85, 0, 0, TAU);
    ctx.fill();
    // dark spots on belly
    ctx.fillStyle = C.spitterSkin;
    ctx.beginPath(); ctx.arc(-z.r * 0.3, -z.r * 0.2, z.r * 0.18, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(-z.r * 0.45, z.r * 0.3, z.r * 0.12, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.05, z.r * 0.45, z.r * 0.1, 0, TAU); ctx.fill();
    // hunched neck + small head
    ctx.fillStyle = C.spitterSkin;
    ctx.beginPath();
    ctx.ellipse(z.r * 0.55, 0, z.r * 0.45, z.r * 0.32, 0, 0, TAU);
    ctx.fill();
    // gaping mouth (forward)
    ctx.fillStyle = C.spitterDrool;
    ctx.beginPath();
    ctx.arc(z.r * 0.8, 0, z.r * 0.18, 0, TAU); ctx.fill();
    ctx.fillStyle = C.toxicDeep;
    ctx.beginPath();
    ctx.arc(z.r * 0.82, 0, z.r * 0.1, 0, TAU); ctx.fill();
    // drool drop hanging
    ctx.fillStyle = C.spitterDrool;
    ctx.beginPath();
    ctx.arc(z.r * 0.95, z.r * 0.05, 1.2, 0, TAU); ctx.fill();
    // tiny eyes
    ctx.fillStyle = '#ffd84a';
    ctx.beginPath(); ctx.arc(z.r * 0.5, -z.r * 0.18, 1.0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.5, z.r * 0.18, 1.0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawCrawler(ctx, z) {
    const x = z.x, y = z.y, ang = z.angle || 0;
    const walk = z.walkPhase || 0;
    shadow(ctx, x, y, z.r + 4, (z.r + 4) * 0.35);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    // 4 spider-ish legs — angled pairs front + back
    ctx.strokeStyle = C.crawlerHi;
    ctx.lineWidth = 1.8;
    for (let i = 0; i < 4; i++) {
      const sign = i < 2 ? -1 : 1;       // back/front
      const side = (i % 2) ? -1 : 1;     // left/right
      const swing = Math.sin(walk * TAU + i) * 0.5;
      const r0 = z.r * 0.4, r1 = z.r * 1.4 + swing;
      const baseA = sign * 0.5 + side * 0.6;
      ctx.beginPath();
      ctx.moveTo(Math.cos(baseA) * r0 * sign, Math.sin(baseA) * r0 * side);
      // joint
      const jx = Math.cos(baseA) * r0 * sign * 1.4 + sign * 4;
      const jy = Math.sin(baseA) * r0 * side * 1.4 + side * 3;
      ctx.lineTo(jx, jy);
      ctx.lineTo(jx + sign * 4, jy + side * 6);
      ctx.stroke();
    }
    // squat body
    ctx.fillStyle = C.crawlerSkin;
    ctx.beginPath();
    ctx.ellipse(0, 0, z.r * 0.95, z.r * 0.7, 0, 0, TAU);
    ctx.fill();
    // back ridge
    ctx.fillStyle = C.crawlerHi;
    ctx.fillRect(-z.r * 0.5, -1.4, z.r * 1.2, 1);
    // small forward head/mandibles
    ctx.fillStyle = C.crawlerSkin;
    ctx.beginPath();
    ctx.arc(z.r * 0.55, 0, z.r * 0.35, 0, TAU); ctx.fill();
    // mandibles
    ctx.fillStyle = C.bone;
    ctx.beginPath();
    ctx.moveTo(z.r * 0.7, -z.r * 0.15);
    ctx.lineTo(z.r * 0.95, -z.r * 0.05);
    ctx.lineTo(z.r * 0.7, 0);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(z.r * 0.7, z.r * 0.15);
    ctx.lineTo(z.r * 0.95, z.r * 0.05);
    ctx.lineTo(z.r * 0.7, 0);
    ctx.closePath(); ctx.fill();
    // red eyes (cluster)
    ctx.fillStyle = C.blood;
    ctx.beginPath(); ctx.arc(z.r * 0.45, -z.r * 0.12, 0.9, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.45, z.r * 0.12, 0.9, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.35, -z.r * 0.22, 0.7, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.35, z.r * 0.22, 0.7, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawScreamer(ctx, z) {
    const x = z.x, y = z.y, ang = z.angle || 0;
    const walk = z.walkPhase || 0;
    const legSwing = Math.sin(walk * TAU) * 3;
    shadow(ctx, x, y, z.r, z.r * 0.42);

    // sonic rings (animated by walkPhase to imply pulse)
    const ring = (walk * 2) % 1;
    ctx.strokeStyle = `rgba(127,200,255,${0.55 - ring * 0.5})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, z.r + 4 + ring * 18, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = `rgba(127,200,255,${0.35 - ring * 0.3})`;
    ctx.beginPath();
    ctx.arc(x, y, z.r + 12 + ring * 18, 0, TAU);
    ctx.stroke();

    ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = C.screamerLo;
    ctx.fillRect(-4, 0 + legSwing, 3, 6);
    ctx.fillRect(1, 0 - legSwing, 3, 6);
    ctx.restore();

    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    // thin torso
    ctx.fillStyle = C.screamerSkin;
    ctx.beginPath();
    ctx.ellipse(0, 0, z.r * 0.7, z.r * 0.55, 0, 0, TAU);
    ctx.fill();
    // ragged arms hanging back
    ctx.fillStyle = C.screamerLo;
    ctx.beginPath();
    ctx.ellipse(-z.r * 0.2, -z.r * 0.55, z.r * 0.3, z.r * 0.15, -0.4, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-z.r * 0.2, z.r * 0.55, z.r * 0.3, z.r * 0.15, 0.4, 0, TAU);
    ctx.fill();
    // huge open mouth on a tilted-up head
    ctx.fillStyle = C.screamerSkin;
    ctx.beginPath();
    ctx.arc(z.r * 0.45, 0, z.r * 0.6, 0, TAU);
    ctx.fill();
    // mouth cavity — oversized
    ctx.fillStyle = '#1a0a0a';
    ctx.beginPath();
    ctx.ellipse(z.r * 0.55, 0, z.r * 0.35, z.r * 0.45, 0, 0, TAU);
    ctx.fill();
    // teeth ring
    ctx.fillStyle = C.bone;
    for (let i = 0; i < 8; i++) {
      const a = -1 + i / 7 * 2;
      const tx = z.r * 0.55 + Math.cos(a) * z.r * 0.35;
      const ty = Math.sin(a) * z.r * 0.45;
      ctx.fillRect(tx - 0.6, ty - 0.6, 1.2, 1.2);
    }
    // small white eye dots above mouth
    ctx.fillStyle = '#cfeaff';
    ctx.beginPath(); ctx.arc(z.r * 0.25, -z.r * 0.4, 0.9, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.25, z.r * 0.4, 0.9, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawBomber(ctx, z) {
    const x = z.x, y = z.y, ang = z.angle || 0;
    const walk = z.walkPhase || 0;
    const sway = Math.sin(walk * TAU) * 1.5;
    shadow(ctx, x, y, z.r + 4, (z.r + 4) * 0.45);
    // sickly aura
    const g = ctx.createRadialGradient(x, y, 4, x, y, z.r + 10);
    g.addColorStop(0, 'rgba(212,255,90,0.30)');
    g.addColorStop(1, 'rgba(70,90,30,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, z.r + 10, 0, TAU); ctx.fill();

    ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = '#2a201a';
    ctx.fillRect(-z.r * 0.4, 4, 4, 7);
    ctx.fillRect(z.r * 0.0, 4, 4, 7);
    ctx.restore();

    ctx.save(); ctx.translate(x + sway, y); ctx.rotate(ang);
    // massive bulbous body
    ctx.fillStyle = C.bomberSkin;
    ctx.beginPath();
    ctx.ellipse(0, 0, z.r * 1.05, z.r * 1.0, 0, 0, TAU);
    ctx.fill();
    // pulsing glow patches (entrails)
    ctx.fillStyle = C.bomberGlow;
    ctx.beginPath();
    ctx.ellipse(-z.r * 0.2, z.r * 0.2, z.r * 0.25, z.r * 0.18, 0.5, 0, TAU); ctx.fill();
    ctx.beginPath();
    ctx.ellipse(z.r * 0.15, -z.r * 0.3, z.r * 0.18, z.r * 0.12, -0.3, 0, TAU); ctx.fill();
    ctx.beginPath();
    ctx.ellipse(z.r * 0.3, z.r * 0.25, z.r * 0.15, z.r * 0.12, 0.2, 0, TAU); ctx.fill();
    // skin shading
    ctx.fillStyle = C.bomberLo;
    ctx.beginPath();
    ctx.arc(-z.r * 0.5, -z.r * 0.4, z.r * 0.2, 0, TAU); ctx.fill();
    // small head atop
    ctx.fillStyle = C.bomberLo;
    ctx.beginPath();
    ctx.arc(z.r * 0.5, 0, z.r * 0.3, 0, TAU); ctx.fill();
    ctx.fillStyle = C.bomberGlow;
    ctx.beginPath(); ctx.arc(z.r * 0.62, -z.r * 0.08, 1.0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.62, z.r * 0.08, 1.0, 0, TAU); ctx.fill();
    // little stub arms
    ctx.fillStyle = C.bomberSkin;
    ctx.beginPath();
    ctx.ellipse(z.r * 0.3, -z.r * 0.65, z.r * 0.18, z.r * 0.12, -0.4, 0, TAU); ctx.fill();
    ctx.beginPath();
    ctx.ellipse(z.r * 0.3, z.r * 0.65, z.r * 0.18, z.r * 0.12, 0.4, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawRiot(ctx, z) {
    const x = z.x, y = z.y, ang = z.angle || 0;
    const walk = z.walkPhase || 0;
    const legSwing = Math.sin(walk * TAU) * 2;
    shadow(ctx, x, y, z.r + 2, (z.r + 2) * 0.42);

    ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = '#1a1410';
    ctx.fillRect(-5, 1 + legSwing, 4, 7);
    ctx.fillRect(1, 1 - legSwing, 4, 7);
    ctx.restore();

    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    // body in tactical gear
    ctx.fillStyle = C.riotSuit;
    ctx.beginPath();
    ctx.ellipse(-2, 0, z.r * 0.85, z.r * 0.75, 0, 0, TAU);
    ctx.fill();
    // plate carrier
    ctx.fillStyle = C.riotPlate;
    ctx.fillRect(-z.r * 0.5, -z.r * 0.45, z.r * 0.7, z.r * 0.9);
    ctx.fillStyle = C.riotSuitHi;
    ctx.fillRect(-z.r * 0.5, -z.r * 0.45, z.r * 0.7, 1.5);
    // POLICE label tick
    ctx.fillStyle = C.bone;
    ctx.fillRect(-z.r * 0.35, -z.r * 0.05, z.r * 0.45, 1.2);
    // arms
    ctx.fillStyle = C.riotSuit;
    ctx.beginPath();
    ctx.ellipse(z.r * 0.45, -z.r * 0.55, z.r * 0.32, z.r * 0.18, -0.2, 0, TAU); ctx.fill();
    ctx.beginPath();
    ctx.ellipse(z.r * 0.45, z.r * 0.55, z.r * 0.32, z.r * 0.18, 0.2, 0, TAU); ctx.fill();
    // helmet
    ctx.fillStyle = C.riotPlate;
    ctx.beginPath(); ctx.arc(0, 0, z.r * 0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = C.riotSuitHi;
    ctx.beginPath();
    ctx.arc(0, 0, z.r * 0.5, Math.PI * 0.6, Math.PI * 1.4);
    ctx.lineWidth = 0; ctx.fill();
    // visor stripe
    ctx.fillStyle = 'rgba(127,200,255,0.55)';
    ctx.fillRect(-z.r * 0.05, -z.r * 0.42, z.r * 0.42, z.r * 0.18);
    // riot shield held forward
    ctx.fillStyle = C.riotShield;
    ctx.beginPath();
    ctx.ellipse(z.r * 0.85, 0, z.r * 0.25, z.r * 0.85, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = C.riotPlate;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(z.r * 0.78, -z.r * 0.7, z.r * 0.1, z.r * 1.4);
    ctx.restore();
  }

  function drawWraith(ctx, z) {
    const x = z.x, y = z.y, ang = z.angle || 0;
    const walk = z.walkPhase || 0;
    // ghostly trail
    const flicker = 0.55 + Math.sin(walk * 10) * 0.15;
    const g = ctx.createRadialGradient(x, y, 4, x, y, z.r + 12);
    g.addColorStop(0, `rgba(127,182,255,${flicker * 0.45})`);
    g.addColorStop(1, 'rgba(20,30,50,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, z.r + 12, 0, TAU); ctx.fill();
    // no shadow (incorporeal)

    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    // wispy tail behind
    ctx.fillStyle = 'rgba(74,66,86,0.55)';
    ctx.beginPath();
    ctx.moveTo(-z.r * 0.9, -z.r * 0.4);
    ctx.quadraticCurveTo(-z.r * 1.6, 0, -z.r * 0.9, z.r * 0.4);
    ctx.quadraticCurveTo(-z.r * 0.5, 0, -z.r * 0.9, -z.r * 0.4);
    ctx.closePath(); ctx.fill();
    // robed body
    ctx.fillStyle = C.wraithBody;
    ctx.beginPath();
    ctx.ellipse(0, 0, z.r * 0.85, z.r * 0.7, 0, 0, TAU);
    ctx.fill();
    // hood highlight
    ctx.fillStyle = C.wraithHi;
    ctx.beginPath();
    ctx.arc(0, 0, z.r * 0.85, Math.PI * 0.7, Math.PI * 1.3);
    ctx.lineTo(0, 0); ctx.closePath();
    ctx.fill();
    // bony arms reaching forward
    ctx.fillStyle = C.boneDim;
    ctx.beginPath();
    ctx.ellipse(z.r * 0.55, -z.r * 0.4, z.r * 0.35, z.r * 0.1, -0.2, 0, TAU); ctx.fill();
    ctx.beginPath();
    ctx.ellipse(z.r * 0.55, z.r * 0.4, z.r * 0.35, z.r * 0.1, 0.2, 0, TAU); ctx.fill();
    // claw tips
    ctx.fillStyle = C.bone;
    ctx.beginPath(); ctx.arc(z.r * 0.88, -z.r * 0.46, 1.0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.88, z.r * 0.46, 1.0, 0, TAU); ctx.fill();
    // glowing eye-slit
    ctx.fillStyle = C.wraithEye;
    ctx.fillRect(z.r * 0.15, -z.r * 0.08, z.r * 0.3, 1.5);
    ctx.fillRect(z.r * 0.15, z.r * 0.05, z.r * 0.3, 1.5);
    ctx.restore();
  }

  const ENEMIES = [
    { id: 'spitter', name: 'SPITTER', tag: 'RANGED',
      stat: ['hp 70', 'spd 55', 'spit 12 dmg', 'rng 280'],
      copy: 'Lobs an arcing acid glob that leaves a small toxic puddle on impact. Keeps distance — forces you to push out of cover.',
      draw: drawSpitter, r: 14, hp: 50, maxHp: 70, color: C.spitterBelly },
    { id: 'crawler', name: 'CRAWLER', tag: 'SMALL',
      stat: ['hp 22', 'spd 160', 'dmg 6', 'r 9'],
      copy: 'Tiny four-legged biter. Sprints right at ankles — small hitbox makes pistol shots feel bad; shotgun pellets are the answer.',
      draw: drawCrawler, r: 11, hp: 18, maxHp: 22, color: C.crawlerSkin },
    { id: 'screamer', name: 'SCREAMER', tag: 'SUPPORT',
      stat: ['hp 45', 'spd 70', 'no melee', 'buffs nearby'],
      copy: 'Pulses a sonic ring that boosts attack speed and movement of every zombie inside. Glass-cannon — kill first.',
      draw: drawScreamer, r: 13, hp: 35, maxHp: 45, color: C.screamerSkin },
    { id: 'bomber', name: 'BOMBER', tag: 'SUICIDE',
      stat: ['hp 110', 'spd 70', 'death AoE 80', '50 dmg'],
      copy: 'Sprints into your face, then ruptures — a small explosion plus a toxic cloud. Loud breathing tell. Pop from range.',
      draw: drawBomber, r: 18, hp: 80, maxHp: 110, color: C.bomberSkin },
    { id: 'riot', name: 'RIOT', tag: 'ARMORED',
      stat: ['hp 180', 'spd 55', 'front shield', 'flank/melee'],
      copy: 'Front-facing shield blocks 80% of incoming damage. Has to be flanked, hit with explosives, or sawn through with melee.',
      draw: drawRiot, r: 15, hp: 140, maxHp: 180, color: C.riotSuit },
    { id: 'wraith', name: 'WRAITH', tag: 'PHASING',
      stat: ['hp 60', 'spd 110', 'dmg 14', 'walls: yes'],
      copy: 'Ignores walls and crates — drifts straight at you through cover. Vulnerable mid-attack; chip damage works best.',
      draw: drawWraith, r: 13, hp: 50, maxHp: 60, color: C.wraithBody },
  ];

  // ============================================================
  // BLOCKS / ENVIRONMENT — top-down obstacle drawings.
  // All take ({x, y, w, h}) so they slot into drawObstacle().
  // ============================================================

  function drawJersey(ctx, o) {
    rectShadow(ctx, o.x, o.y, o.w, o.h, 4);
    // sloped sides — outer dark band, inner light band
    ctx.fillStyle = C.concreteLo;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = C.concrete;
    ctx.fillRect(o.x + 2, o.y + 2, o.w - 4, o.h - 4);
    // top ridge highlight
    ctx.fillStyle = C.concreteHi;
    ctx.fillRect(o.x + 4, o.y + 4, o.w - 8, 2);
    // hazard stripes near ends
    ctx.fillStyle = C.warn;
    for (let i = 0; i < 4; i++) ctx.fillRect(o.x + 4 + i * 6, o.y + o.h - 6, 3, 3);
    // weld lines
    ctx.strokeStyle = C.concreteLo;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(o.x + o.w / 3, o.y + 2); ctx.lineTo(o.x + o.w / 3, o.y + o.h - 2);
    ctx.moveTo(o.x + (o.w / 3) * 2, o.y + 2); ctx.lineTo(o.x + (o.w / 3) * 2, o.y + o.h - 2);
    ctx.stroke();
  }

  function drawSandbags(ctx, o) {
    rectShadow(ctx, o.x, o.y, o.w, o.h, 3);
    // stacked bags — two rows, brick offset
    const bagW = o.w / 3;
    const bagH = o.h / 2;
    for (let r = 0; r < 2; r++) {
      const offset = r % 2 === 0 ? 0 : bagW / 2;
      for (let c = -1; c < 4; c++) {
        const x = o.x + offset + c * bagW;
        const y = o.y + r * bagH;
        if (x + bagW <= o.x || x >= o.x + o.w) continue;
        const cx = Math.max(x, o.x);
        const cw = Math.min(x + bagW, o.x + o.w) - cx;
        // bag
        ctx.fillStyle = C.sandLo;
        ctx.fillRect(cx, y, cw, bagH);
        ctx.fillStyle = C.sand;
        ctx.fillRect(cx + 1, y + 1, cw - 2, bagH - 3);
        ctx.fillStyle = C.sandHi;
        ctx.fillRect(cx + 2, y + 1, cw - 4, 1.5);
        // stitch line
        ctx.strokeStyle = C.sandLo;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(cx + 2, y + bagH * 0.5);
        ctx.lineTo(cx + cw - 2, y + bagH * 0.5);
        ctx.stroke();
      }
    }
  }

  function drawCarWreck(ctx, o) {
    rectShadow(ctx, o.x, o.y, o.w, o.h, 4);
    // body (rusted)
    ctx.fillStyle = C.rustLo;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = C.rust;
    ctx.fillRect(o.x + 2, o.y + 2, o.w - 4, o.h - 4);
    // roof / cabin
    ctx.fillStyle = C.paint;
    const cabX = o.x + o.w * 0.18, cabY = o.y + o.h * 0.18;
    const cabW = o.w * 0.64, cabH = o.h * 0.64;
    ctx.fillRect(cabX, cabY, cabW, cabH);
    ctx.fillStyle = C.paintHi;
    ctx.fillRect(cabX, cabY, cabW, 2);
    // shattered windshield + rear window
    ctx.fillStyle = '#1a1f24';
    ctx.fillRect(cabX, cabY - 4, cabW, 4);
    ctx.fillRect(cabX, cabY + cabH, cabW, 4);
    // window cracks
    ctx.strokeStyle = '#dcd4b8';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(cabX + cabW * 0.3, cabY - 4); ctx.lineTo(cabX + cabW * 0.5, cabY);
    ctx.lineTo(cabX + cabW * 0.7, cabY - 3);
    ctx.stroke();
    // rust splotches
    ctx.fillStyle = C.rustHi;
    ctx.beginPath(); ctx.arc(o.x + o.w * 0.1, o.y + o.h * 0.3, 3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(o.x + o.w * 0.92, o.y + o.h * 0.78, 2.5, 0, TAU); ctx.fill();
    // wheels (corners)
    ctx.fillStyle = '#1a1410';
    const ww = Math.min(6, o.w * 0.12);
    [[o.x + 1, o.y - 1], [o.x + o.w - ww - 1, o.y - 1],
     [o.x + 1, o.y + o.h - 4], [o.x + o.w - ww - 1, o.y + o.h - 4]
    ].forEach(([wx, wy]) => ctx.fillRect(wx, wy, ww, 5));
    // headlight (broken)
    ctx.fillStyle = C.warn;
    ctx.fillRect(o.x + 2, o.y + o.h - 5, 4, 2);
  }

  function drawContainer(ctx, o, opts) {
    const colorA = (opts && opts.alt) ? C.container2 : C.container;
    const colorAH = (opts && opts.alt) ? C.container2Hi : C.containerHi;
    rectShadow(ctx, o.x, o.y, o.w, o.h, 4);
    ctx.fillStyle = C.containerLo;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = colorA;
    ctx.fillRect(o.x + 1, o.y + 1, o.w - 2, o.h - 4);
    // corrugated ridges (horizontal lines)
    ctx.strokeStyle = colorAH;
    ctx.lineWidth = 1;
    for (let i = o.y + 4; i < o.y + o.h - 4; i += 4) {
      ctx.beginPath();
      ctx.moveTo(o.x + 2, i); ctx.lineTo(o.x + o.w - 2, i);
      ctx.stroke();
    }
    // corner blocks
    ctx.fillStyle = C.containerLo;
    [[0,0],[o.w-6,0],[0,o.h-7],[o.w-6,o.h-7]].forEach(([dx,dy]) => {
      ctx.fillRect(o.x + dx, o.y + dy, 6, 7);
    });
    // cargo doors at one short end
    ctx.fillStyle = C.containerLo;
    ctx.fillRect(o.x + o.w - 3, o.y + 7, 3, o.h - 14);
    ctx.fillStyle = colorAH;
    ctx.fillRect(o.x + o.w - 2, o.y + 8, 1, o.h - 16);
    // small stencil number
    ctx.fillStyle = C.bone;
    ctx.font = 'bold 7px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText('CN-407', o.x + 6, o.y + o.h * 0.5 + 2);
  }

  function drawDumpster(ctx, o) {
    rectShadow(ctx, o.x, o.y, o.w, o.h, 3);
    ctx.fillStyle = C.dumpsterLo;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = C.dumpster;
    ctx.fillRect(o.x + 2, o.y + 2, o.w - 4, o.h - 4);
    // lid line down middle (two-flap top-load)
    ctx.fillStyle = C.dumpsterLo;
    ctx.fillRect(o.x + o.w / 2 - 0.5, o.y + 2, 1, o.h - 4);
    // lid highlight
    ctx.fillStyle = C.dumpsterHi;
    ctx.fillRect(o.x + 4, o.y + 4, o.w / 2 - 6, 1.5);
    ctx.fillRect(o.x + o.w / 2 + 2, o.y + 4, o.w / 2 - 6, 1.5);
    // hinge bolts
    ctx.fillStyle = C.dumpsterLo;
    [[4,2],[o.w-6,2],[4,o.h-4],[o.w-6,o.h-4]].forEach(([dx,dy]) => {
      ctx.beginPath();
      ctx.arc(o.x + dx, o.y + dy, 1, 0, TAU); ctx.fill();
    });
    // grime drip
    ctx.strokeStyle = '#1a1410';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(o.x + o.w * 0.7, o.y + 4);
    ctx.lineTo(o.x + o.w * 0.7, o.y + o.h - 3);
    ctx.stroke();
  }

  function drawFence(ctx, o) {
    // thin obstacle — chainlink with posts
    rectShadow(ctx, o.x, o.y, o.w, o.h, 2);
    ctx.fillStyle = '#16191e';
    ctx.fillRect(o.x, o.y, o.w, o.h);
    // top + bottom rails
    ctx.fillStyle = C.fence;
    ctx.fillRect(o.x, o.y, o.w, 1.5);
    ctx.fillRect(o.x, o.y + o.h - 1.5, o.w, 1.5);
    // posts
    const postCount = Math.max(2, Math.floor(o.w / 28));
    for (let i = 0; i <= postCount; i++) {
      const x = o.x + (i / postCount) * o.w;
      ctx.fillStyle = C.fence;
      ctx.fillRect(x - 1, o.y, 2.4, o.h);
      ctx.fillStyle = C.fenceLo;
      ctx.fillRect(x + 0.4, o.y, 1, o.h);
    }
    // chainlink criss-cross
    ctx.strokeStyle = 'rgba(180,184,192,0.45)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    for (let xx = o.x; xx < o.x + o.w; xx += 4) {
      ctx.moveTo(xx, o.y + 1.5);
      ctx.lineTo(xx + 4, o.y + o.h - 1.5);
      ctx.moveTo(xx + 4, o.y + 1.5);
      ctx.lineTo(xx, o.y + o.h - 1.5);
    }
    ctx.stroke();
    // razor wire on top
    ctx.strokeStyle = C.bone;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let xx = o.x; xx < o.x + o.w - 4; xx += 6) {
      ctx.moveTo(xx, o.y - 2);
      ctx.lineTo(xx + 3, o.y - 4);
      ctx.lineTo(xx + 6, o.y - 2);
    }
    ctx.stroke();
  }

  function drawFuelPump(ctx, o) {
    rectShadow(ctx, o.x, o.y, o.w, o.h, 3);
    // base concrete pad
    ctx.fillStyle = C.concreteLo;
    ctx.fillRect(o.x - 3, o.y + o.h - 3, o.w + 6, 5);
    ctx.fillStyle = C.concrete;
    ctx.fillRect(o.x - 2, o.y + o.h - 2, o.w + 4, 3);
    // pump body
    ctx.fillStyle = C.pumpDeep;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = C.pumpBody;
    ctx.fillRect(o.x + 1, o.y + 1, o.w - 2, o.h - 4);
    // top highlight
    ctx.fillStyle = C.pumpBodyHi;
    ctx.fillRect(o.x + 1, o.y + 1, o.w - 2, 2);
    // display screen
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(o.x + 3, o.y + 5, o.w - 6, 8);
    ctx.fillStyle = C.warn;
    ctx.font = 'bold 6px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText('88.8', o.x + o.w / 2, o.y + 11);
    // hazard band
    ctx.fillStyle = C.warn;
    ctx.fillRect(o.x + 1, o.y + o.h - 7, o.w - 2, 1.5);
    ctx.fillStyle = '#1a0a05';
    ctx.font = 'bold 5px "JetBrains Mono", monospace';
    ctx.fillText('FLAMMABLE', o.x + o.w / 2, o.y + o.h - 5.5);
    // pump handle hanging off side
    ctx.fillStyle = C.gunBody;
    ctx.fillRect(o.x - 3, o.y + 6, 3, 3);
    ctx.strokeStyle = '#1a1a1f';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y + 5); ctx.quadraticCurveTo(o.x - 4, o.y + 4, o.x - 3, o.y + 7);
    ctx.stroke();
  }

  function drawPallet(ctx, o) {
    rectShadow(ctx, o.x, o.y, o.w, o.h, 3);
    // base shadow
    ctx.fillStyle = C.palletLo;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    // pallet plank background
    ctx.fillStyle = C.pallet;
    ctx.fillRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2);
    // slat lines
    ctx.strokeStyle = C.palletLo;
    ctx.lineWidth = 1;
    const slats = 4;
    for (let i = 1; i < slats; i++) {
      const y = o.y + (o.h / slats) * i;
      ctx.beginPath();
      ctx.moveTo(o.x + 1, y); ctx.lineTo(o.x + o.w - 1, y);
      ctx.stroke();
    }
    // cross beams (vertical)
    ctx.fillStyle = C.palletLo;
    ctx.fillRect(o.x + 3, o.y + 1, 1.4, o.h - 2);
    ctx.fillRect(o.x + o.w / 2 - 0.7, o.y + 1, 1.4, o.h - 2);
    ctx.fillRect(o.x + o.w - 4.4, o.y + 1, 1.4, o.h - 2);
    // wood highlights
    ctx.fillStyle = C.palletHi;
    for (let i = 1; i < slats; i++) {
      const y = o.y + (o.h / slats) * i - (o.h / slats) * 0.5;
      ctx.fillRect(o.x + 5, y, o.w - 10, 0.8);
    }
    // nail dots
    ctx.fillStyle = C.palletLo;
    for (let i = 1; i < slats; i++) {
      const y = o.y + (o.h / slats) * i - (o.h / slats) * 0.5;
      [3.7, o.w / 2 - 0.2, o.w - 4.3].forEach(dx => {
        ctx.beginPath();
        ctx.arc(o.x + dx + 0.7, y, 0.6, 0, TAU); ctx.fill();
      });
    }
  }

  function drawToxicDrum(ctx, o) {
    // round drum, top-down
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    const r = Math.min(o.w, o.h) / 2;
    shadow(ctx, cx, cy, r + 1, (r + 1) * 0.45);
    ctx.fillStyle = C.drumTox;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    // crescent highlight
    ctx.strokeStyle = C.drumToxHi;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1.8, Math.PI * 0.7, Math.PI * 1.3);
    ctx.stroke();
    // dark rim
    ctx.strokeStyle = C.drumToxLo;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke();
    // bands
    ctx.strokeStyle = C.drumToxLo;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - r + 1, cy - r * 0.35); ctx.lineTo(cx + r - 1, cy - r * 0.35);
    ctx.moveTo(cx - r + 1, cy + r * 0.35); ctx.lineTo(cx + r - 1, cy + r * 0.35);
    ctx.stroke();
    // biohazard glyph (simplified — 3 dots in triangle)
    ctx.fillStyle = '#0a1a05';
    [[0, -r * 0.25], [-r * 0.25, r * 0.15], [r * 0.25, r * 0.15]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(cx + dx, cy + dy, r * 0.13, 0, TAU); ctx.fill();
    });
    // center dot
    ctx.fillStyle = C.drumToxHi;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.1, 0, TAU); ctx.fill();
    // green slime puddle hint
    ctx.fillStyle = 'rgba(130,178,70,0.4)';
    ctx.beginPath();
    ctx.ellipse(cx + r * 0.8, cy + r * 0.4, r * 0.3, r * 0.15, 0.4, 0, TAU);
    ctx.fill();
  }

  const BLOCKS = [
    { id: 'jersey', name: 'JERSEY BARRIER', tag: 'CONCRETE',
      stat: ['low cover', 'hp 220', 'pierce: no'],
      copy: 'Modular concrete divider. Two stacked stop bullets cold. Hazard stripes for biome wayfinding.',
      draw: (ctx) => drawJersey(ctx, { x: 4, y: 50, w: 132, h: 28 }), w: 132, h: 28 },
    { id: 'sandbags', name: 'SANDBAG WALL', tag: 'SOFT',
      stat: ['cover', 'hp 140', 'erodes'],
      copy: 'Two-row stack. Takes damage from bullets in place of you — a bag erodes visibly as HP drops.',
      draw: (ctx) => drawSandbags(ctx, { x: 4, y: 40, w: 132, h: 48 }), w: 132, h: 48 },
    { id: 'car', name: 'CAR WRECK', tag: 'PARKING',
      stat: ['hp 300', 'flammable', 'big block'],
      copy: 'Two-tile obstacle. Shoots set the fuel tank — chain into a barrel-style explosion. Wheels protrude past the rect (visual only).',
      draw: (ctx) => drawCarWreck(ctx, { x: 14, y: 26, w: 110, h: 72 }), w: 110, h: 72 },
    { id: 'container', name: 'SHIPPING CONTAINER', tag: 'INDUSTRIAL',
      stat: ['hp ∞', 'big', 'stencil number'],
      copy: 'Indestructible. Long axis blocks line-of-sight; doors at one short end (visible from above). Two color variants for visual variety.',
      draw: (ctx) => drawContainer(ctx, { x: 6, y: 26, w: 128, h: 72 }), w: 128, h: 72 },
    { id: 'dumpster', name: 'DUMPSTER', tag: 'URBAN',
      stat: ['hp 180', 'tippable?', 'lid splits'],
      copy: 'Mid-cover block for alley biomes. Lid splits down the middle. Pickup probability bump when hidden behind one.',
      draw: (ctx) => drawDumpster(ctx, { x: 16, y: 36, w: 108, h: 56 }), w: 108, h: 56 },
    { id: 'fence', name: 'CHAINLINK + WIRE', tag: 'THIN',
      stat: ['hp 60', 'see-through', 'shoot-through'],
      copy: 'Thin barrier. Blocks zombie pathing but bullets pass — punish chokepoint pushes from behind it. Razor wire on top is visual only.',
      draw: (ctx) => drawFence(ctx, { x: 6, y: 56, w: 128, h: 12 }), w: 128, h: 12 },
    { id: 'pump', name: 'FUEL PUMP', tag: 'EXPLODES',
      stat: ['hp 40', 'AoE 140', 'chain barrels'],
      copy: 'Bigger boom than a barrel and a wider blast. Place on gas stations / parking lot. Chains with regular barrels.',
      draw: (ctx) => drawFuelPump(ctx, { x: 38, y: 14, w: 60, h: 88 }), w: 60, h: 88 },
    { id: 'pallet', name: 'PALLET STACK', tag: 'WAREHOUSE',
      stat: ['hp 90', 'cheap cover'],
      copy: 'Quick-deploy stack of wooden pallets. Cheap cover that splinters fast — meant to break under fire, not stop a tank.',
      draw: (ctx) => drawPallet(ctx, { x: 18, y: 28, w: 104, h: 68 }), w: 104, h: 68 },
  ];

  // ============================================================
  // PUBLIC
  // ============================================================
  root.ZExpand = {
    palette: C,
    WEAPONS, ENEMIES, BLOCKS,
    drawCrossbow, drawFlamethrower, drawMinigun, drawRailgun, drawGrenadeLauncher, drawChainsaw,
    drawSpitter, drawCrawler, drawScreamer, drawBomber, drawRiot, drawWraith,
    drawJersey, drawSandbags, drawCarWreck, drawContainer, drawDumpster, drawFence, drawFuelPump, drawPallet, drawToxicDrum,
    extras: { drawToxicDrum },
  };
})(window);
