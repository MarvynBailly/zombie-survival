// sprites.js — top-down sprite library
// Drop-in replacement for the procedural drawing in index.html.
// All sprites render at "1x" game scale by default; pass scale > 1 to zoom.
// Coordinates are world-space (x,y = center of entity).

(function (root) {
  'use strict';
  const TAU = Math.PI * 2;

  // ---------- PALETTE ----------
  const C = {
    // ink
    ink:        '#0b0c0e',
    inkSoft:    '#14161a',
    inkLine:    '#1f232a',

    // bone
    bone:       '#e8e6df',
    boneDim:    '#a8a59c',

    // signature accent
    blood:      '#d24b35',
    bloodDeep:  '#8a2a1a',
    bloodLight: '#ec6448',

    // hazards
    toxic:      '#8ec547',
    toxicDeep:  '#4a6b22',
    warn:       '#e3a83a',
    fire1:      '#ffb84a',
    fire2:      '#ff6a2a',

    // player
    jacket:     '#7d8358',
    jacketDeep: '#4a4e34',
    jacketHi:   '#a3a877',
    skin:       '#c79872',
    skinShade:  '#8a684c',
    boot:       '#2a201a',
    cap:        '#1a140e',

    // zombies
    walkerSkin:    '#7a9a55',
    walkerSkinHi:  '#9cbb6c',
    walkerSkinLo:  '#4a6332',
    walkerRag:     '#3a3024',
    walkerRagHi:   '#5a4a36',
    walkerBlood:   '#5a1a14',

    runnerSkin:    '#c9a04f',
    runnerSkinHi:  '#e0bc6a',
    runnerSkinLo:  '#7a5e2a',

    tankSkin:      '#8a4a8a',
    tankSkinHi:    '#aa6caa',
    tankSkinLo:    '#542a54',

    fireSkin:      '#3a2a22',
    fireCrack:     '#ff5a1a',

    // weapons
    gunBody:    '#1a1a1f',
    gunMetal:   '#3a3f48',
    gunMetalHi: '#5e6470',

    // environment
    crate:      '#7a6244',
    crateHi:    '#9a7e58',
    crateLo:    '#3a2e1f',
    tombstone:  '#5e5e64',
    tombstoneHi:'#7c7c84',
    tombstoneLo:'#36363c',
    warehouse:  '#54483a',
    warehouseHi:'#766352',
    warehouseLo:'#2a2218',
    ground1:    '#1d1f23',
    ground2:    '#22252a',

    barrel:     '#a04a2a',
    barrelHi:   '#c66536',
    barrelLo:   '#5a230f',
    barrelHot:  '#ffb040',
  };

  // ---------- HELPERS ----------
  function shadow(ctx, x, y, rx, ry) {
    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    ctx.beginPath();
    ctx.ellipse(x + 1, y + 4, rx, ry, 0, 0, TAU);
    ctx.fill();
  }

  function circle(ctx, x, y, r, fill, stroke, lw) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, TAU);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.lineWidth = lw || 1; ctx.strokeStyle = stroke; ctx.stroke(); }
  }

  // half-moon highlight on the trailing edge of a head/body
  function highlight(ctx, x, y, r, ang, color, span) {
    ctx.beginPath();
    const a0 = ang + Math.PI - (span || 0.9);
    const a1 = ang + Math.PI + (span || 0.9);
    ctx.arc(x, y, r, a0, a1);
    ctx.lineWidth = Math.max(1.2, r * 0.28);
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  // ---------- PLAYER ----------
  // angle is mouse-aim radians. walkPhase is a 0..1 cycle (use game time).
  function drawPlayer(ctx, x, y, angle, opts) {
    opts = opts || {};
    const weapon = opts.weapon || 'pistol';
    const moving = !!opts.moving;
    const walkPhase = opts.walkPhase || 0;
    const iframe = opts.iframe || 0;
    const muzzleFlash = opts.muzzleFlash || 0; // 0..1

    shadow(ctx, x, y, 13, 6);

    const blink = iframe > 0 && Math.floor(iframe * 16) % 2 === 0;

    // ---- legs (animate with walk) ----
    const legSwing = moving ? Math.sin(walkPhase * TAU) * 3 : 0;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle + Math.PI / 2);
    // back leg
    ctx.fillStyle = C.boot;
    ctx.fillRect(-7, 0 + legSwing, 5, 7);
    ctx.fillRect(2, 0 - legSwing, 5, 7);
    ctx.fillStyle = '#1a120a';
    ctx.fillRect(-7, 6 + legSwing, 5, 2);
    ctx.fillRect(2, 6 - legSwing, 5, 2);
    ctx.restore();

    // ---- torso + arms + weapon (rotate to aim) ----
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    // backpack peek
    ctx.fillStyle = C.jacketDeep;
    ctx.fillRect(-12, -7, 5, 14);

    // torso
    ctx.fillStyle = blink ? C.bone : C.jacket;
    ctx.beginPath();
    ctx.ellipse(0, 0, 11.5, 10, 0, 0, TAU);
    ctx.fill();
    // strap
    ctx.fillStyle = C.jacketDeep;
    ctx.beginPath();
    ctx.ellipse(0, 0, 11.5, 10, 0, 0, TAU);
    ctx.lineWidth = 0;
    // shoulder strap diagonal
    ctx.fillStyle = '#3a2f22';
    ctx.fillRect(-8, -2, 18, 2);

    // arms holding gun
    ctx.fillStyle = blink ? C.bone : C.jacketHi;
    ctx.beginPath();
    ctx.ellipse(8, -5, 5, 3.5, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(8, 5, 5, 3.5, 0, 0, TAU);
    ctx.fill();
    // hands
    ctx.fillStyle = C.skinShade;
    ctx.beginPath(); ctx.arc(12, -3, 2.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(12, 3, 2.2, 0, TAU); ctx.fill();

    // weapon
    drawHeldWeapon(ctx, weapon, muzzleFlash);

    // ---- head ----
    // head shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.beginPath(); ctx.ellipse(-1, 1, 6, 6, 0, 0, TAU); ctx.fill();
    // skin
    ctx.fillStyle = blink ? C.bone : C.skin;
    ctx.beginPath(); ctx.arc(0, 0, 5.6, 0, TAU); ctx.fill();
    // cap dome
    ctx.fillStyle = C.cap;
    ctx.beginPath();
    ctx.arc(0, 0, 5.8, Math.PI * 0.55, Math.PI * 2.45);
    ctx.lineTo(0, 0);
    ctx.closePath();
    ctx.fill();
    // cap brim (forward)
    ctx.fillStyle = '#0a0805';
    ctx.beginPath();
    ctx.moveTo(2, -3);
    ctx.lineTo(7, -1.5);
    ctx.lineTo(7, 1.5);
    ctx.lineTo(2, 3);
    ctx.closePath();
    ctx.fill();
    // chin highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, 5.6, Math.PI * 0.7, Math.PI * 1.3);
    ctx.stroke();

    ctx.restore();

    // ---- muzzle flash (drawn after, in world space) ----
    if (muzzleFlash > 0) {
      drawMuzzleFlash(ctx, x, y, angle, weapon, muzzleFlash);
    }
  }

  function drawHeldWeapon(ctx, weapon, flash) {
    // drawn in local space, +x is aim direction
    switch (weapon) {
      case 'pistol': {
        // grip
        ctx.fillStyle = C.gunBody;
        ctx.fillRect(8, -1.5, 4, 5);
        // slide
        ctx.fillStyle = C.gunMetal;
        ctx.fillRect(10, -2.2, 9, 4);
        // barrel highlight
        ctx.fillStyle = C.gunMetalHi;
        ctx.fillRect(11, -2.2, 7, 1);
        // muzzle
        ctx.fillStyle = '#0a0a0c';
        ctx.fillRect(19, -1.2, 1.5, 2.5);
        break;
      }
      case 'shotgun': {
        // stock
        ctx.fillStyle = '#5a4028';
        ctx.fillRect(-2, -1.8, 9, 3.6);
        // body
        ctx.fillStyle = C.gunBody;
        ctx.fillRect(7, -2.4, 6, 4.8);
        // double barrel
        ctx.fillStyle = C.gunMetal;
        ctx.fillRect(13, -3, 13, 2.4);
        ctx.fillRect(13, 0.6, 13, 2.4);
        ctx.fillStyle = C.gunMetalHi;
        ctx.fillRect(14, -3, 11, 0.6);
        ctx.fillRect(14, 0.6, 11, 0.6);
        break;
      }
      case 'smg': {
        // stock + body
        ctx.fillStyle = C.gunBody;
        ctx.fillRect(-1, -2, 11, 4);
        // mag (drops below)
        ctx.fillStyle = C.gunMetal;
        ctx.fillRect(3, 2, 4, 6);
        ctx.fillStyle = '#2a2a30';
        ctx.fillRect(3, 7, 4, 1);
        // barrel
        ctx.fillStyle = C.gunMetal;
        ctx.fillRect(10, -1.4, 12, 2.8);
        ctx.fillStyle = C.gunMetalHi;
        ctx.fillRect(11, -1.4, 10, 0.7);
        // sight
        ctx.fillStyle = '#0a0a0c';
        ctx.fillRect(5, -3, 2, 1);
        break;
      }
      case 'rocket': {
        // big tube
        ctx.fillStyle = '#2a3a2a';
        ctx.fillRect(-2, -3.5, 22, 7);
        ctx.fillStyle = '#4a5a4a';
        ctx.fillRect(-2, -3.5, 22, 1.4);
        // rear vent
        ctx.fillStyle = '#0a0a0c';
        ctx.fillRect(-4, -2.5, 2, 5);
        // tip
        ctx.fillStyle = C.blood;
        ctx.beginPath();
        ctx.moveTo(20, -3.5);
        ctx.lineTo(24, 0);
        ctx.lineTo(20, 3.5);
        ctx.closePath();
        ctx.fill();
        // grip
        ctx.fillStyle = C.gunBody;
        ctx.fillRect(4, 3, 4, 4);
        break;
      }
      case 'barrel': {
        // empty hands holding small barrel
        ctx.fillStyle = C.barrel;
        ctx.fillRect(8, -4, 7, 8);
        ctx.fillStyle = C.barrelLo;
        ctx.fillRect(8, -4, 7, 1.5);
        ctx.fillRect(8, 2.5, 7, 1.5);
        break;
      }
      // ---- Expansion weapons (delegated to ZExpand if loaded) ----
      case 'crossbow': if (typeof window.ZExpand !== 'undefined') return ZExpand.drawCrossbow(ctx); break;
      case 'flamer':   if (typeof window.ZExpand !== 'undefined') return ZExpand.drawFlamethrower(ctx); break;
      case 'minigun':  if (typeof window.ZExpand !== 'undefined') return ZExpand.drawMinigun(ctx); break;
      case 'railgun':  if (typeof window.ZExpand !== 'undefined') return ZExpand.drawRailgun(ctx); break;
      case 'gl':       if (typeof window.ZExpand !== 'undefined') return ZExpand.drawGrenadeLauncher(ctx); break;
      case 'saw':      if (typeof window.ZExpand !== 'undefined') return ZExpand.drawChainsaw(ctx); break;
      default: {
        ctx.fillStyle = C.gunBody;
        ctx.fillRect(8, -2, 12, 4);
      }
    }
  }

  function drawMuzzleFlash(ctx, x, y, angle, weapon, t) {
    const len = weapon === 'shotgun' ? 22 : weapon === 'rocket' ? 0 : weapon === 'smg' ? 18 : 14;
    if (len === 0) return;
    const r = (1 - Math.abs(0.5 - t) * 2) * len;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    // outer
    ctx.fillStyle = 'rgba(255,170,60,0.65)';
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(22 + r, -3.5);
    ctx.lineTo(22 + r * 1.1, 0);
    ctx.lineTo(22 + r, 3.5);
    ctx.closePath();
    ctx.fill();
    // inner
    ctx.fillStyle = 'rgba(255,240,180,0.95)';
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(22 + r * 0.7, -1.8);
    ctx.lineTo(22 + r * 0.85, 0);
    ctx.lineTo(22 + r * 0.7, 1.8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---------- ZOMBIES ----------
  function drawWalker(ctx, z) {
    const x = z.x, y = z.y;
    const ang = z.angle || 0;
    const walk = z.walkPhase || 0;
    const legSwing = Math.sin(walk * TAU) * 2.5;

    shadow(ctx, x, y, z.r - 1, (z.r - 1) * 0.45);

    // legs
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = C.walkerRag;
    ctx.fillRect(-5, 1 + legSwing, 4, 6);
    ctx.fillRect(1, 1 - legSwing, 4, 6);
    ctx.fillStyle = '#1a140a';
    ctx.fillRect(-5, 6 + legSwing, 4, 2);
    ctx.fillRect(1, 6 - legSwing, 4, 2);
    ctx.restore();

    // body — slumped, shoulders forward
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);

    // shirt/rags
    ctx.fillStyle = C.walkerRag;
    ctx.beginPath();
    ctx.ellipse(0, 0, z.r * 0.85, z.r * 0.75, 0, 0, TAU);
    ctx.fill();
    // ragged edges
    ctx.fillStyle = C.walkerRagHi;
    ctx.fillRect(-2, -z.r * 0.7, 3, 2);
    ctx.fillRect(z.r * 0.4, 1, 3, 2);

    // arms outstretched forward
    ctx.fillStyle = C.walkerSkin;
    ctx.beginPath();
    ctx.ellipse(z.r * 0.5, -z.r * 0.45, z.r * 0.45, z.r * 0.25, -0.3, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(z.r * 0.5, z.r * 0.45, z.r * 0.45, z.r * 0.25, 0.3, 0, TAU);
    ctx.fill();
    // hands/claws
    ctx.fillStyle = C.walkerSkinLo;
    ctx.beginPath(); ctx.arc(z.r * 0.85, -z.r * 0.5, 1.8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.85, z.r * 0.5, 1.8, 0, TAU); ctx.fill();

    // head — green sickly
    ctx.fillStyle = C.walkerSkin;
    ctx.beginPath();
    ctx.arc(0, 0, z.r * 0.5, 0, TAU);
    ctx.fill();
    // hair patches
    ctx.fillStyle = '#2a1f15';
    ctx.beginPath();
    ctx.arc(-z.r * 0.15, -z.r * 0.25, z.r * 0.18, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-z.r * 0.3, z.r * 0.1, z.r * 0.13, 0, TAU);
    ctx.fill();
    // glowing eyes
    ctx.fillStyle = '#ffd84a';
    ctx.beginPath(); ctx.arc(z.r * 0.25, -z.r * 0.15, 1.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.25, z.r * 0.15, 1.4, 0, TAU); ctx.fill();
    // jaw stain
    ctx.fillStyle = C.walkerBlood;
    ctx.beginPath();
    ctx.arc(z.r * 0.3, 0, z.r * 0.18, 0, TAU);
    ctx.fill();

    ctx.restore();

    drawZombieOverlay(ctx, z);
  }

  function drawRunner(ctx, z) {
    const x = z.x, y = z.y;
    const ang = z.angle || 0;
    const walk = z.walkPhase || 0;
    const legSwing = Math.sin(walk * TAU) * 4; // bigger swing — running

    shadow(ctx, x, y, z.r - 1, (z.r - 1) * 0.4);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = '#2a2a3a';
    ctx.fillRect(-4, 0 + legSwing, 3, 6);
    ctx.fillRect(1, 0 - legSwing, 3, 6);
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);

    // leaner torso, leaning forward (elongated ellipse)
    ctx.fillStyle = C.walkerRag;
    ctx.beginPath();
    ctx.ellipse(1, 0, z.r * 0.9, z.r * 0.55, 0, 0, TAU);
    ctx.fill();

    // arms whipping back-forward
    ctx.fillStyle = C.runnerSkin;
    ctx.save();
    ctx.rotate(Math.sin(walk * TAU) * 0.6);
    ctx.beginPath();
    ctx.ellipse(z.r * 0.6, -z.r * 0.4, z.r * 0.4, z.r * 0.18, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.rotate(-Math.sin(walk * TAU) * 0.6);
    ctx.beginPath();
    ctx.ellipse(z.r * 0.6, z.r * 0.4, z.r * 0.4, z.r * 0.18, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    // head — sharper, lean yellow-skinned
    ctx.fillStyle = C.runnerSkin;
    ctx.beginPath();
    ctx.arc(2, 0, z.r * 0.5, 0, TAU);
    ctx.fill();
    // gaunt cheek shadow
    ctx.fillStyle = C.runnerSkinLo;
    ctx.beginPath();
    ctx.arc(-1, 0, z.r * 0.32, 0, TAU);
    ctx.fill();
    // eyes (red)
    ctx.fillStyle = '#ff4a3a';
    ctx.beginPath(); ctx.arc(z.r * 0.3, -z.r * 0.18, 1.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.3, z.r * 0.18, 1.2, 0, TAU); ctx.fill();

    ctx.restore();

    drawZombieOverlay(ctx, z);
  }

  function drawTank(ctx, z) {
    const x = z.x, y = z.y;
    const ang = z.angle || 0;
    const walk = z.walkPhase || 0;
    const sway = Math.sin(walk * TAU) * 1.5;

    shadow(ctx, x, y, z.r + 2, (z.r + 2) * 0.4);

    // bulky legs
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = '#2a201a';
    ctx.fillRect(-z.r * 0.6, 2, 6, 8);
    ctx.fillRect(z.r * 0.2, 2, 6, 8);
    ctx.restore();

    ctx.save();
    ctx.translate(x + sway, y);
    ctx.rotate(ang);

    // massive torso
    ctx.fillStyle = C.tankSkin;
    ctx.beginPath();
    ctx.ellipse(0, 0, z.r, z.r * 0.95, 0, 0, TAU);
    ctx.fill();
    // shoulder hump
    ctx.fillStyle = C.tankSkinHi;
    ctx.beginPath();
    ctx.arc(-z.r * 0.3, -z.r * 0.5, z.r * 0.45, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-z.r * 0.3, z.r * 0.5, z.r * 0.45, 0, TAU);
    ctx.fill();

    // chest scar / boil
    ctx.fillStyle = C.tankSkinLo;
    ctx.beginPath(); ctx.arc(z.r * 0.1, -z.r * 0.2, z.r * 0.18, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.2, z.r * 0.3, z.r * 0.13, 0, TAU); ctx.fill();

    // huge arms
    ctx.fillStyle = C.tankSkin;
    ctx.beginPath();
    ctx.ellipse(z.r * 0.55, -z.r * 0.55, z.r * 0.5, z.r * 0.3, -0.2, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(z.r * 0.55, z.r * 0.55, z.r * 0.5, z.r * 0.3, 0.2, 0, TAU);
    ctx.fill();
    // fists
    ctx.fillStyle = C.tankSkinLo;
    ctx.beginPath(); ctx.arc(z.r * 0.95, -z.r * 0.65, 3.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.95, z.r * 0.65, 3.5, 0, TAU); ctx.fill();

    // small head sunken into shoulders
    ctx.fillStyle = C.tankSkinLo;
    ctx.beginPath();
    ctx.arc(z.r * 0.05, 0, z.r * 0.35, 0, TAU);
    ctx.fill();
    // eyes
    ctx.fillStyle = '#ffe24a';
    ctx.beginPath(); ctx.arc(z.r * 0.22, -z.r * 0.12, 1.3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.22, z.r * 0.12, 1.3, 0, TAU); ctx.fill();
    // teeth
    ctx.fillStyle = C.bone;
    ctx.fillRect(z.r * 0.25, -1, 4, 2);

    ctx.restore();

    drawZombieOverlay(ctx, z);
  }

  function drawFireZombie(ctx, z) {
    const x = z.x, y = z.y;
    const ang = z.angle || 0;
    const walk = z.walkPhase || 0;
    const legSwing = Math.sin(walk * TAU) * 2.5;

    shadow(ctx, x, y, z.r - 1, (z.r - 1) * 0.45);

    // fire halo
    const flicker = 0.85 + Math.sin(walk * 19) * 0.15;
    const g = ctx.createRadialGradient(x, y, 4, x, y, z.r + 14);
    g.addColorStop(0, 'rgba(255,160,60,0.55)');
    g.addColorStop(0.6, 'rgba(220,80,30,0.18)');
    g.addColorStop(1, 'rgba(180,40,20,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, (z.r + 14) * flicker, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = '#1a1010';
    ctx.fillRect(-5, 1 + legSwing, 4, 6);
    ctx.fillRect(1, 1 - legSwing, 4, 6);
    ctx.restore();

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);

    // charred body
    ctx.fillStyle = C.fireSkin;
    ctx.beginPath();
    ctx.ellipse(0, 0, z.r * 0.85, z.r * 0.75, 0, 0, TAU);
    ctx.fill();
    // cracks (glowing)
    ctx.strokeStyle = C.fireCrack;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-z.r * 0.4, -z.r * 0.2); ctx.lineTo(z.r * 0.3, z.r * 0.3);
    ctx.moveTo(-z.r * 0.2, z.r * 0.4); ctx.lineTo(z.r * 0.4, -z.r * 0.1);
    ctx.moveTo(0, -z.r * 0.5); ctx.lineTo(z.r * 0.2, 0);
    ctx.stroke();
    // ember dots
    ctx.fillStyle = C.fire1;
    ctx.beginPath(); ctx.arc(-z.r * 0.3, z.r * 0.1, 0.9, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.2, -z.r * 0.3, 0.9, 0, TAU); ctx.fill();

    // arms
    ctx.fillStyle = C.fireSkin;
    ctx.beginPath();
    ctx.ellipse(z.r * 0.5, -z.r * 0.45, z.r * 0.42, z.r * 0.22, -0.3, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(z.r * 0.5, z.r * 0.45, z.r * 0.42, z.r * 0.22, 0.3, 0, TAU);
    ctx.fill();

    // head
    ctx.fillStyle = C.fireSkin;
    ctx.beginPath();
    ctx.arc(0, 0, z.r * 0.5, 0, TAU);
    ctx.fill();
    // glowing mouth
    ctx.fillStyle = C.fire1;
    ctx.beginPath();
    ctx.arc(z.r * 0.3, 0, z.r * 0.18, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.fire2;
    ctx.beginPath();
    ctx.arc(z.r * 0.32, 0, z.r * 0.1, 0, TAU);
    ctx.fill();

    ctx.restore();

    drawZombieOverlay(ctx, z);
  }

  // hp bar + on-fire overlay shared
  function drawZombieOverlay(ctx, z) {
    if (z.hp != null && z.maxHp != null && z.hp < z.maxHp) {
      const bw = z.r * 2.2;
      const x = z.x - bw / 2;
      const y = z.y - z.r - 9;
      // backing
      ctx.fillStyle = 'rgba(10,10,12,0.85)';
      ctx.fillRect(x - 1, y - 1, bw + 2, 5);
      ctx.fillStyle = '#3a1a1a';
      ctx.fillRect(x, y, bw, 3);
      const pct = Math.max(0, z.hp / z.maxHp);
      ctx.fillStyle = pct > 0.5 ? C.toxic : pct > 0.25 ? C.warn : C.blood;
      ctx.fillRect(x, y, bw * pct, 3);
    }
    if (z.onFire > 0) {
      // pulsing ember ring
      ctx.strokeStyle = 'rgba(255,140,40,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r + 2, 0, TAU);
      ctx.stroke();
    }
    if (z.stunned > 0) {
      // hit flash
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(z.x, z.y, z.r, 0, TAU);
      ctx.fill();
    }
  }

  function drawZombie(ctx, z) {
    // Expansion enemies: ZExpand uses capitalized fn names (drawSpitter,
    // drawCrawler, …), ZBestiary uses a `draw` map keyed by lowercase type
    // (cluster, hivesac, shrieker, …). Falls through to the legacy switch
    // when no expansion sprite matches, so existing types still draw.
    if (z.type) {
      if (typeof window.ZExpand !== 'undefined') {
        const fn = window.ZExpand['draw' + z.type[0].toUpperCase() + z.type.slice(1)];
        if (typeof fn === 'function') return fn(ctx, z);
      }
      if (typeof window.ZBestiary !== 'undefined') {
        const fn = window.ZBestiary.draw[z.type];
        if (typeof fn === 'function') return fn(ctx, z);
      }
    }
    switch (z.type) {
      case 'runner': return drawRunner(ctx, z);
      case 'tank':   return drawTank(ctx, z);
      case 'fire':   return drawFireZombie(ctx, z);
      case 'walker':
      default:       return drawWalker(ctx, z);
    }
  }

  // ---------- BARRELS ----------
  function drawBarrel(ctx, br, time) {
    const x = br.x, y = br.y;
    shadow(ctx, x, y, br.r + 1, (br.r + 1) * 0.4);

    const ignited = br.ignited;
    const t = time || 0;

    // base body
    const base = ignited ? C.barrelHot : C.barrel;
    const hi = ignited ? '#ffd680' : C.barrelHi;
    const lo = ignited ? '#c66036' : C.barrelLo;

    ctx.fillStyle = base;
    ctx.beginPath();
    ctx.arc(x, y, br.r, 0, TAU);
    ctx.fill();
    // highlight crescent
    ctx.strokeStyle = hi;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, br.r - 1.8, Math.PI * 0.7, Math.PI * 1.3);
    ctx.stroke();
    // dark rim
    ctx.strokeStyle = lo;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, br.r, 0, TAU);
    ctx.stroke();
    // bands
    ctx.strokeStyle = lo;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x - br.r + 1, y - br.r * 0.35);
    ctx.lineTo(x + br.r - 1, y - br.r * 0.35);
    ctx.moveTo(x - br.r + 1, y + br.r * 0.35);
    ctx.lineTo(x + br.r - 1, y + br.r * 0.35);
    ctx.stroke();
    // hazard chevron
    ctx.fillStyle = ignited ? '#fff' : '#1a0a05';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', x, y);

    // flame on top when ignited
    if (ignited) {
      const flick = Math.sin(t * 25) * 2;
      ctx.fillStyle = 'rgba(255,180,60,0.85)';
      ctx.beginPath();
      ctx.arc(x, y - br.r - 4 + flick, 6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,240,160,0.95)';
      ctx.beginPath();
      ctx.arc(x, y - br.r - 4 + flick, 3, 0, TAU);
      ctx.fill();
    }
  }

  // ---------- PICKUPS ----------
  function drawPickup(ctx, pk, time) {
    const t = time || 0;
    const bob = Math.sin(t * 2.5 + pk.x * 0.01) * 2;
    const x = pk.x, y = pk.y + bob;

    // glow
    const glowColor = {
      health: 'rgba(210,75,53,0.35)',
      ammo_shotgun: 'rgba(227,168,58,0.35)',
      ammo_smg: 'rgba(142,197,71,0.35)',
      ammo_rocket: 'rgba(210,75,53,0.35)',
      barrel: 'rgba(195,100,40,0.35)',
    }[pk.type] || 'rgba(200,200,200,0.3)';

    const g = ctx.createRadialGradient(x, y, 2, x, y, pk.r + 8);
    g.addColorStop(0, glowColor);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, pk.r + 8, 0, TAU);
    ctx.fill();

    // blink when expiring
    const blink = pk.life != null && pk.life < 3 && Math.floor(pk.life * 6) % 2;
    if (blink) return;

    // base plate
    ctx.fillStyle = C.inkSoft;
    ctx.beginPath();
    ctx.arc(x, y, pk.r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = C.bone;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // inner ring
    ctx.strokeStyle = 'rgba(232,230,223,0.35)';
    ctx.beginPath();
    ctx.arc(x, y, pk.r - 3, 0, TAU);
    ctx.stroke();

    ctx.save();
    ctx.translate(x, y);
    switch (pk.type) {
      case 'health': {
        ctx.fillStyle = C.blood;
        ctx.fillRect(-6, -2, 12, 4);
        ctx.fillRect(-2, -6, 4, 12);
        break;
      }
      case 'ammo_shotgun': {
        ctx.fillStyle = C.warn;
        for (let i = -1; i <= 1; i++) {
          ctx.fillRect(i * 4 - 1.5, -4, 3, 7);
          ctx.fillStyle = '#a8782a';
          ctx.fillRect(i * 4 - 1.5, 1, 3, 2);
          ctx.fillStyle = C.warn;
        }
        break;
      }
      case 'ammo_smg': {
        ctx.fillStyle = C.toxic;
        for (let i = -1; i <= 1; i++) {
          ctx.fillRect(i * 3 - 1, -4, 2, 8);
        }
        break;
      }
      case 'ammo_rocket': {
        ctx.fillStyle = C.blood;
        ctx.beginPath();
        ctx.moveTo(-4, 4); ctx.lineTo(4, 4);
        ctx.lineTo(4, -1); ctx.lineTo(0, -6); ctx.lineTo(-4, -1);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = C.gunMetal;
        ctx.fillRect(-4, 4, 8, 1.5);
        break;
      }
      case 'barrel': {
        ctx.fillStyle = C.barrel;
        ctx.fillRect(-4, -5, 8, 10);
        ctx.fillStyle = C.barrelLo;
        ctx.fillRect(-4, -5, 8, 1.5);
        ctx.fillRect(-4, 3.5, 8, 1.5);
        ctx.fillStyle = '#1a0a05';
        ctx.font = 'bold 7px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', 0, 0);
        break;
      }
      case 'wall': {
        ctx.fillStyle = '#7a5a30';
        ctx.fillRect(-6, -5, 12, 10);
        ctx.fillStyle = '#5a4020';
        ctx.fillRect(-6, -5, 12, 2);
        ctx.fillRect(-6, 3, 12, 2);
        ctx.fillStyle = '#9a7a4a';
        ctx.fillRect(-1, -5, 2, 10);
        break;
      }
    }
    ctx.restore();
  }

  // ---------- WALL (player-placed barricade) ----------
  function drawWall(ctx, w) {
    const hpPct = Math.max(0, w.hp / w.maxHp);
    // base
    ctx.fillStyle = '#5a4528';
    ctx.fillRect(w.x, w.y, w.w, w.h);
    // plank lines
    ctx.fillStyle = '#7a6238';
    ctx.fillRect(w.x + 2, w.y + 2, w.w - 4, w.h / 2 - 3);
    ctx.fillRect(w.x + 2, w.y + w.h / 2 + 1, w.w - 4, w.h / 2 - 3);
    // grain accent
    ctx.fillStyle = '#3a2c18';
    ctx.fillRect(w.x + 2, w.y + w.h / 2 - 1, w.w - 4, 1);
    // bolts
    ctx.fillStyle = '#caa760';
    ctx.fillRect(w.x + 3, w.y + 3, 2, 2);
    ctx.fillRect(w.x + w.w - 5, w.y + 3, 2, 2);
    ctx.fillRect(w.x + 3, w.y + w.h - 5, 2, 2);
    ctx.fillRect(w.x + w.w - 5, w.y + w.h - 5, 2, 2);
    // damage cracks (more as hp drops)
    if (hpPct < 0.66) {
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(w.x + 4, w.y + 6);
      ctx.lineTo(w.x + w.w * 0.6, w.y + w.h - 6);
      ctx.stroke();
    }
    if (hpPct < 0.33) {
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.beginPath();
      ctx.moveTo(w.x + w.w - 5, w.y + 5);
      ctx.lineTo(w.x + w.w * 0.4, w.y + w.h - 4);
      ctx.stroke();
    }
    // hp bar (only when damaged)
    if (hpPct < 1) {
      const bw = w.w - 4, bh = 3;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(w.x + 2, w.y - bh - 2, bw, bh);
      ctx.fillStyle = hpPct > 0.5 ? '#7ad97a' : hpPct > 0.25 ? '#e3c054' : '#d24b35';
      ctx.fillRect(w.x + 2, w.y - bh - 2, bw * hpPct, bh);
    }
  }
  function drawWallGhost(ctx, rect, valid) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = valid ? '#7ad97a' : '#d24b35';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = valid ? '#7ad97a' : '#d24b35';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
    ctx.restore();
  }

  // ---------- BULLETS / TRACER ----------
  function drawBullet(ctx, b) {
    ctx.strokeStyle = '#ffe9a8';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,220,140,0.4)';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.015, b.y - b.vy * 0.015);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  function drawRocket(ctx, r) {
    ctx.save();
    ctx.translate(r.x, r.y);
    ctx.rotate(Math.atan2(r.vy, r.vx));
    // body
    ctx.fillStyle = '#bbb';
    ctx.fillRect(-9, -3, 14, 6);
    // tip
    ctx.fillStyle = C.blood;
    ctx.beginPath();
    ctx.moveTo(5, -3); ctx.lineTo(9, 0); ctx.lineTo(5, 3);
    ctx.closePath(); ctx.fill();
    // fins
    ctx.fillStyle = '#666';
    ctx.fillRect(-11, -4, 3, 8);
    // flame tail
    ctx.fillStyle = 'rgba(255,170,60,0.85)';
    ctx.beginPath();
    ctx.moveTo(-9, -2); ctx.lineTo(-16, 0); ctx.lineTo(-9, 2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,180,0.95)';
    ctx.beginPath();
    ctx.moveTo(-9, -1); ctx.lineTo(-13, 0); ctx.lineTo(-9, 1);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ---------- EXPLOSIONS ----------
  function drawExplosion(ctx, ex) {
    const a = 1 - ex.t / 0.6;
    // outer ring
    ctx.strokeStyle = `rgba(255,170,50,${a})`;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, ex.r, 0, TAU);
    ctx.stroke();
    // core
    ctx.fillStyle = `rgba(255,220,120,${a * 0.4})`;
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, ex.r * 0.65, 0, TAU);
    ctx.fill();
    // hot center
    ctx.fillStyle = `rgba(255,255,220,${a * 0.6})`;
    ctx.beginPath();
    ctx.arc(ex.x, ex.y, ex.r * 0.25, 0, TAU);
    ctx.fill();
  }

  // ---------- ENVIRONMENT ----------
  function drawCrate(ctx, o) {
    // base
    ctx.fillStyle = C.crateLo;
    ctx.fillRect(o.x, o.y + o.h - 4, o.w, 4);
    // body
    ctx.fillStyle = C.crate;
    ctx.fillRect(o.x, o.y, o.w, o.h - 4);
    // highlight top
    ctx.fillStyle = C.crateHi;
    ctx.fillRect(o.x, o.y, o.w, 3);
    ctx.fillRect(o.x, o.y, 3, o.h - 4);
    // diagonal slats
    ctx.strokeStyle = C.crateLo;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(o.x + 2, o.y + 2); ctx.lineTo(o.x + o.w - 2, o.y + o.h - 6);
    ctx.moveTo(o.x + o.w - 2, o.y + 2); ctx.lineTo(o.x + 2, o.y + o.h - 6);
    ctx.stroke();
    // corner bolts
    ctx.fillStyle = C.crateLo;
    [[3,3],[o.w-4,3],[3,o.h-7],[o.w-4,o.h-7]].forEach(([dx,dy])=>{
      ctx.beginPath(); ctx.arc(o.x+dx, o.y+dy, 1.2, 0, TAU); ctx.fill();
    });
  }

  function drawTombstone(ctx, o) {
    // shadow on ground behind
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(o.x + 2, o.y + o.h - 2, o.w, 5);
    // body
    ctx.fillStyle = C.tombstone;
    ctx.beginPath();
    ctx.moveTo(o.x, o.y + o.h);
    ctx.lineTo(o.x, o.y + 8);
    ctx.arc(o.x + o.w / 2, o.y + 8, o.w / 2, Math.PI, 0);
    ctx.lineTo(o.x + o.w, o.y + o.h);
    ctx.closePath();
    ctx.fill();
    // top highlight
    ctx.fillStyle = C.tombstoneHi;
    ctx.fillRect(o.x + 2, o.y + 10, 2, o.h - 12);
    // bottom shadow
    ctx.fillStyle = C.tombstoneLo;
    ctx.fillRect(o.x, o.y + o.h - 4, o.w, 4);
    // engraving
    ctx.fillStyle = C.tombstoneLo;
    ctx.font = 'bold 9px serif';
    ctx.textAlign = 'center';
    ctx.fillText('R.I.P', o.x + o.w / 2, o.y + 24);
    ctx.textAlign = 'start';
  }

  function drawWarehouseWall(ctx, o) {
    ctx.fillStyle = C.warehouse;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    // top highlight
    ctx.fillStyle = C.warehouseHi;
    ctx.fillRect(o.x, o.y, o.w, 2);
    ctx.fillRect(o.x, o.y, 2, o.h);
    // bottom shadow
    ctx.fillStyle = C.warehouseLo;
    ctx.fillRect(o.x, o.y + o.h - 3, o.w, 3);
    ctx.fillRect(o.x + o.w - 2, o.y, 2, o.h);
    // rivets
    const sp = 14;
    ctx.fillStyle = C.warehouseLo;
    for (let i = sp; i < o.w; i += sp) {
      ctx.beginPath(); ctx.arc(o.x + i, o.y + 4, 1.1, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(o.x + i, o.y + o.h - 5, 1.1, 0, TAU); ctx.fill();
    }
    for (let i = sp; i < o.h; i += sp) {
      ctx.beginPath(); ctx.arc(o.x + 4, o.y + i, 1.1, 0, TAU); ctx.fill();
    }
  }

  // ---------- BUILDING TILES (40x40, collidable) ----------
  // Each tile sprite assumes a 40x40 footprint at (o.x, o.y) but tolerates
  // any rect-sized obstacle. Detail scales with size.

  function drawWoodWall(ctx, o) {
    // base plank
    ctx.fillStyle = '#5a4528';
    ctx.fillRect(o.x, o.y, o.w, o.h);
    // top highlight
    ctx.fillStyle = '#7a6238';
    ctx.fillRect(o.x, o.y, o.w, Math.max(2, o.h * 0.15));
    // bottom shadow
    ctx.fillStyle = '#3a2c18';
    ctx.fillRect(o.x, o.y + o.h - Math.max(2, o.h * 0.12), o.w, Math.max(2, o.h * 0.12));
    // a couple of grain lines
    ctx.fillStyle = '#3f311b';
    ctx.fillRect(o.x + 2, o.y + Math.floor(o.h * 0.45), o.w - 4, 1);
    ctx.fillRect(o.x + 2, o.y + Math.floor(o.h * 0.68), o.w - 4, 1);
    // corner nails
    ctx.fillStyle = '#caa760';
    ctx.fillRect(o.x + 3, o.y + 3, 1.5, 1.5);
    ctx.fillRect(o.x + o.w - 4.5, o.y + 3, 1.5, 1.5);
    ctx.fillRect(o.x + 3, o.y + o.h - 4.5, 1.5, 1.5);
    ctx.fillRect(o.x + o.w - 4.5, o.y + o.h - 4.5, 1.5, 1.5);
  }

  function drawBrickWall(ctx, o) {
    ctx.fillStyle = '#6a3a30';
    ctx.fillRect(o.x, o.y, o.w, o.h);
    // brick lines
    ctx.fillStyle = '#4a261e';
    const rowH = 8;
    for (let y = o.y + rowH; y < o.y + o.h; y += rowH) {
      ctx.fillRect(o.x, y, o.w, 1);
    }
    // staggered vertical mortar
    for (let row = 0; row < Math.floor(o.h / rowH); row++) {
      const offset = (row % 2) * (o.w / 2);
      const x = o.x + (offset > 0 ? Math.floor(o.w / 2) : Math.floor(o.w / 3));
      ctx.fillRect(x, o.y + row * rowH, 1, rowH);
      ctx.fillRect(o.x + (row % 2 ? Math.floor(o.w / 4) : Math.floor(o.w * 0.75)), o.y + row * rowH, 1, rowH);
    }
    // highlight on top edge
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(o.x, o.y, o.w, 2);
    // shadow on bottom edge
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(o.x, o.y + o.h - 2, o.w, 2);
  }

  function drawStoneWall(ctx, o) {
    ctx.fillStyle = '#5a5a60';
    ctx.fillRect(o.x, o.y, o.w, o.h);
    // irregular stones via a few rounded blocks
    ctx.fillStyle = '#6e6e74';
    ctx.fillRect(o.x + 2, o.y + 2, Math.floor(o.w * 0.5), Math.floor(o.h * 0.4));
    ctx.fillRect(o.x + Math.floor(o.w * 0.55), o.y + 4, Math.floor(o.w * 0.4), Math.floor(o.h * 0.35));
    ctx.fillRect(o.x + 4, o.y + Math.floor(o.h * 0.5), Math.floor(o.w * 0.35), Math.floor(o.h * 0.4));
    ctx.fillRect(o.x + Math.floor(o.w * 0.45), o.y + Math.floor(o.h * 0.55), Math.floor(o.w * 0.5), Math.floor(o.h * 0.35));
    // dark cracks between
    ctx.fillStyle = '#36363c';
    ctx.fillRect(o.x + Math.floor(o.w * 0.5) - 1, o.y, 1, o.h);
    ctx.fillRect(o.x, o.y + Math.floor(o.h * 0.5) - 1, o.w, 1);
    // highlight
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(o.x, o.y, o.w, 1);
  }

  function drawFence(ctx, o) {
    // dark base = no fill, so ground shows through
    // posts (vertical slats)
    ctx.fillStyle = '#3a2c18';
    const postW = 3, postCount = 3;
    for (let i = 0; i < postCount; i++) {
      const px = o.x + 4 + i * Math.floor((o.w - 8) / (postCount - 1));
      ctx.fillRect(px, o.y + 4, postW, o.h - 8);
    }
    // crossbars
    ctx.fillStyle = '#5a4528';
    ctx.fillRect(o.x + 2, o.y + Math.floor(o.h * 0.3), o.w - 4, 2);
    ctx.fillRect(o.x + 2, o.y + Math.floor(o.h * 0.7), o.w - 4, 2);
  }

  function drawBarrelDecor(ctx, o) {
    // Static, non-explosive barrel (looks like a rusted drum)
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    const r = Math.min(o.w, o.h) * 0.4;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(cx + 1, cy + r * 0.4 + 2, r, r * 0.3, 0, 0, TAU);
    ctx.fill();
    // body
    ctx.fillStyle = '#6a4030';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fill();
    // rim hi
    ctx.fillStyle = '#8a5840';
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 1.1, Math.PI * 1.9);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#8a5840';
    ctx.stroke();
    // bands
    ctx.strokeStyle = '#3a201a';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, TAU); ctx.stroke();
    // rust spot
    ctx.fillStyle = '#aa5a3a';
    ctx.fillRect(cx - 2, cy - 1, 3, 2);
  }

  function drawVehicle(ctx, o) {
    // A rusted abandoned car. Spans 2 tiles wide.
    const x = o.x, y = o.y, w = o.w, h = o.h;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x + 3, y + h - 4, w - 4, 5);
    // body
    ctx.fillStyle = '#4a4248';
    ctx.fillRect(x + 4, y + 6, w - 8, h - 12);
    // roof
    ctx.fillStyle = '#5a525a';
    ctx.fillRect(x + Math.floor(w * 0.25), y + 10, Math.floor(w * 0.5), h - 20);
    // windows
    ctx.fillStyle = '#1a2028';
    ctx.fillRect(x + Math.floor(w * 0.27), y + 12, Math.floor(w * 0.18), h - 24);
    ctx.fillRect(x + Math.floor(w * 0.55), y + 12, Math.floor(w * 0.18), h - 24);
    // wheels
    ctx.fillStyle = '#1a1a1f';
    ctx.beginPath(); ctx.arc(x + Math.floor(w * 0.18), y + h - 6, 4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x + Math.floor(w * 0.82), y + h - 6, 4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x + Math.floor(w * 0.18), y + 6, 4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(x + Math.floor(w * 0.82), y + 6, 4, 0, TAU); ctx.fill();
    // rust streaks
    ctx.fillStyle = '#8a4a2a';
    ctx.fillRect(x + 6, y + 8, 3, h - 16);
    ctx.fillRect(x + w - 9, y + 10, 3, h - 18);
    // headlight bashed in
    ctx.fillStyle = '#dad6c0';
    ctx.fillRect(x + 4, y + Math.floor(h * 0.4), 2, 4);
    // broken windshield crack
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(x + Math.floor(w * 0.30), y + Math.floor(h * 0.35));
    ctx.lineTo(x + Math.floor(w * 0.44), y + Math.floor(h * 0.65));
    ctx.stroke();
  }

  // ---------- DECOR TILES (non-collidable) ----------
  // Drawn under obstacles. Pure visual flavor.
  function drawFloorWood(ctx, d) {
    ctx.fillStyle = '#3a2c1a';
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.fillStyle = '#4a3a24';
    ctx.fillRect(d.x + 1, d.y + 1, d.w - 2, d.h - 2);
    // plank seams
    ctx.fillStyle = '#2a1f12';
    ctx.fillRect(d.x, d.y + Math.floor(d.h * 0.5), d.w, 1);
  }

  function drawFloorStone(ctx, d) {
    ctx.fillStyle = '#3a3a40';
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.fillStyle = '#4a4a50';
    ctx.fillRect(d.x + 1, d.y + 1, d.w - 2, d.h - 2);
    // a faint grid
    ctx.fillStyle = '#2a2a30';
    ctx.fillRect(d.x, d.y + Math.floor(d.h * 0.5), d.w, 1);
    ctx.fillRect(d.x + Math.floor(d.w * 0.5), d.y, 1, d.h);
  }

  function drawRoad(ctx, d) {
    ctx.fillStyle = '#26282c';
    ctx.fillRect(d.x, d.y, d.w, d.h);
    // dashed yellow center
    ctx.fillStyle = '#5a4a1a';
    if (d.w >= d.h) {
      ctx.fillRect(d.x + Math.floor(d.w * 0.3), d.y + Math.floor(d.h * 0.45), Math.floor(d.w * 0.4), 2);
    } else {
      ctx.fillRect(d.x + Math.floor(d.w * 0.45), d.y + Math.floor(d.h * 0.3), 2, Math.floor(d.h * 0.4));
    }
    // crack detail
    ctx.fillStyle = '#1c1e22';
    ctx.fillRect(d.x + 3, d.y + 6, 1, Math.floor(d.h * 0.4));
  }

  function drawCampfire(ctx, d) {
    const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
    // ash ring
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, d.w * 0.42, 0, TAU);
    ctx.fill();
    // stones
    ctx.fillStyle = '#3a3a3a';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * d.w * 0.32, cy + Math.sin(a) * d.h * 0.32, 3, 0, TAU);
      ctx.fill();
    }
    // logs
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(cx - 6, cy - 1, 12, 3);
    ctx.fillRect(cx - 1, cy - 6, 3, 12);
    // flickering flame (use deterministic noise from position so it doesn't strobe)
    ctx.fillStyle = '#ff7a2a';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 1, 5, 7, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffd14a';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 2, 3, 5, 0, 0, TAU);
    ctx.fill();
  }

  function drawBlood(ctx, d) {
    ctx.fillStyle = 'rgba(120,20,16,0.55)';
    const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, d.w * 0.4, d.h * 0.3, 0.4, 0, TAU);
    ctx.fill();
    // splatter dots
    ctx.fillStyle = 'rgba(90,10,8,0.5)';
    ctx.beginPath(); ctx.arc(cx + 8, cy - 3, 2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx - 7, cy + 5, 1.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + 4, cy + 8, 1, 0, TAU); ctx.fill();
  }

  function drawRubble(ctx, d) {
    const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
    ctx.fillStyle = '#3a3a3e';
    // a few jagged pebbles
    ctx.fillRect(cx - 6, cy - 4, 5, 4);
    ctx.fillRect(cx + 1, cy - 2, 4, 5);
    ctx.fillRect(cx - 4, cy + 3, 3, 3);
    ctx.fillRect(cx + 4, cy + 2, 2, 2);
    ctx.fillStyle = '#4a4a4e';
    ctx.fillRect(cx - 5, cy - 3, 2, 2);
    ctx.fillRect(cx + 2, cy - 1, 2, 2);
  }

  function drawScorch(ctx, d) {
    ctx.fillStyle = 'rgba(20,12,8,0.55)';
    const cx = d.x + d.w / 2, cy = d.y + d.h / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, d.w * 0.45, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(60,30,18,0.4)';
    ctx.beginPath();
    ctx.arc(cx, cy, d.w * 0.3, 0, TAU);
    ctx.fill();
  }

  function drawDecorTile(ctx, d) {
    switch (d.style) {
      case 'floor_wood':  return drawFloorWood(ctx, d);
      case 'floor_stone': return drawFloorStone(ctx, d);
      case 'road':        return drawRoad(ctx, d);
      case 'campfire':    return drawCampfire(ctx, d);
      case 'blood':       return drawBlood(ctx, d);
      case 'rubble':      return drawRubble(ctx, d);
      case 'scorch':      return drawScorch(ctx, d);
      case 'pier':        return drawPier(ctx, d);
      case 'crop_row':    return drawCropRow(ctx, d);
      case 'rug':         return drawRug(ctx, d);
      default: break;
    }
  }

  function drawPier(ctx, d) {
    // Wooden planks running across the tile
    ctx.fillStyle = '#4a3520';
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.fillStyle = '#6a4830';
    for (let i = 4; i < d.w; i += 8) {
      ctx.fillRect(d.x + i, d.y + 2, 6, d.h - 4);
    }
    ctx.fillStyle = '#2a1808';
    for (let i = 4; i < d.w; i += 8) {
      ctx.fillRect(d.x + i + 5, d.y + 2, 1, d.h - 4);
    }
  }

  function drawCropRow(ctx, d) {
    // Plowed earth with green sprouts
    ctx.fillStyle = '#3a2812';
    ctx.fillRect(d.x, d.y, d.w, d.h);
    ctx.fillStyle = '#4a3018';
    ctx.fillRect(d.x + 2, d.y + 4, d.w - 4, 4);
    ctx.fillRect(d.x + 2, d.y + d.h - 8, d.w - 4, 4);
    ctx.fillStyle = '#7d8358';
    for (let i = 4; i < d.w - 4; i += 6) {
      ctx.fillRect(d.x + i, d.y + 14, 1, 4);
      ctx.fillRect(d.x + i + 2, d.y + 18, 1, 3);
    }
  }

  function drawRug(ctx, d) {
    ctx.fillStyle = '#7a3a30';
    ctx.fillRect(d.x + 4, d.y + 4, d.w - 8, d.h - 8);
    ctx.fillStyle = '#a85040';
    ctx.fillRect(d.x + 6, d.y + 6, d.w - 12, d.h - 12);
    ctx.fillStyle = '#caa760';
    ctx.fillRect(d.x + d.w / 2 - 4, d.y + d.h / 2 - 4, 8, 8);
  }

  // Crack overlay drawn over a damaged obstacle. Opacity scales with damage.
  function drawObstacleDamage(ctx, o) {
    const pct = Math.max(0, o.hp / o.maxHp);
    ctx.save();
    ctx.strokeStyle = `rgba(0,0,0,${0.55 * (1 - pct)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(o.x + 4, o.y + 6);
    ctx.lineTo(o.x + o.w * 0.6, o.y + o.h - 5);
    ctx.stroke();
    if (pct < 0.55) {
      ctx.beginPath();
      ctx.moveTo(o.x + o.w - 5, o.y + 5);
      ctx.lineTo(o.x + o.w * 0.4, o.y + o.h - 4);
      ctx.stroke();
    }
    if (pct < 0.25) {
      ctx.beginPath();
      ctx.moveTo(o.x + o.w * 0.5, o.y + 2);
      ctx.lineTo(o.x + o.w * 0.5, o.y + o.h - 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawObstacle(ctx, o, levelStyle) {
    // Terrain-blocking tiles (water, mountain) are painted by the terrain
    // pass — skip them here so we don't overdraw.
    if (o.terrain) return;
    // Expansion dispatch: when an obstacle carries `o.kind`, route to the
    // ZExpand blocks (drawJersey, drawSandbags, …) or ZProps furniture
    // (draw.sofa, draw.fridge, …) first. Falls through to the legacy
    // style-switch when no expansion sprite handles the kind.
    let handled = false;
    if (o.kind) {
      if (typeof window.ZExpand !== 'undefined') {
        const fn = window.ZExpand['draw' + o.kind];
        if (typeof fn === 'function') { fn(ctx, o); handled = true; }
      }
      if (!handled && typeof window.ZProps !== 'undefined') {
        const fn = window.ZProps.draw[o.kind];
        if (typeof fn === 'function') { fn(ctx, o); handled = true; }
      }
    }
    if (handled) {
      if (o.maxHp && o.hp < o.maxHp) drawObstacleDamage(ctx, o);
      return;
    }
    const s = o.style || levelStyle;
    switch (s) {
      case 'wood_wall':     drawWoodWall(ctx, o); break;
      case 'brick_wall':    drawBrickWall(ctx, o); break;
      case 'stone_wall':    drawStoneWall(ctx, o); break;
      case 'interior_wall': drawInteriorWall(ctx, o); break;
      case 'fence':         drawFence(ctx, o); break;
      case 'crate':         drawCrate(ctx, o); break;
      case 'tombstone':     drawTombstone(ctx, o); break;
      case 'vehicle':       drawVehicle(ctx, o); break;
      case 'barrel_decor':  drawBarrelDecor(ctx, o); break;
      case 'tree':          drawTree(ctx, o); break;
      case 'boulder':       drawBoulder(ctx, o); break;
      // furniture
      case 'bed':           drawBed(ctx, o); break;
      case 'dresser':       drawDresser(ctx, o); break;
      case 'counter':       drawCounter(ctx, o); break;
      case 'stove':         drawStove(ctx, o); break;
      case 'table':         drawTable(ctx, o); break;
      case 'sofa':          drawSofa(ctx, o); break;
      case 'shelf':         drawShelf(ctx, o); break;
      case 'workbench':     drawWorkbench(ctx, o); break;
      case 'bathtub':       drawBathtub(ctx, o); break;
      case 'sink':          drawSink(ctx, o); break;
      case 'log_pile':      drawLogPile(ctx, o); break;
      case 'stump':         drawStump(ctx, o); break;
      case 'minecart':      drawMinecart(ctx, o); break;
      case 'scarecrow':     drawScarecrow(ctx, o); break;
      case 'trough':        drawTrough(ctx, o); break;
      // legacy / fallback
      case 'graveyard':     drawTombstone(ctx, o); break;
      case 'warehouse':     drawWarehouseWall(ctx, o); break;
      case 'parking':       drawCrate(ctx, o); break;
      default:              drawCrate(ctx, o); break;
    }
    if (o.maxHp && o.hp < o.maxHp) drawObstacleDamage(ctx, o);
  }

  // ---------- ENVIRONMENT OBSTACLES (trees, boulders, mountains) ----------
  // A forest reads as one species (all pines, or all oaks, etc.) because
  // the species is picked from a coarse zone hash — every tree within the
  // same ~1600px patch resolves to the same species id. Per-tree variation
  // (size jitter, canopy lean, color tint, asymmetric lobes) is layered on
  // top so two same-species trees never look identical.
  const TREE_ZONE_PX = 1600;
  function pickTreeSpecies(o) {
    const zx = Math.floor(o.x / TREE_ZONE_PX);
    const zy = Math.floor(o.y / TREE_ZONE_PX);
    let h = ((zx * 2654435761) ^ (zy * 40503) ^ 0x9e3779b9) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const r = ((h ^ (h >>> 16)) >>> 0) % 100;
    if      (r < 32) return 'oak';
    else if (r < 60) return 'pine';
    else if (r < 74) return 'birch';
    else if (r < 86) return 'maple';
    else if (r < 94) return 'willow';
    else             return 'dead';
  }
  function drawTree(ctx, o) {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    const baseR = Math.min(o.w, o.h) * 0.55;
    const seed = (((o.x | 0) * 73856093) ^ ((o.y | 0) * 19349663)) >>> 0;
    const sizeJit = (((seed >>> 8)  & 0xff) / 255 - 0.5) * 0.30; // ±15% size
    const leanX   = (((seed >>> 16) & 0xff) / 255 - 0.5) * 4;     // ±2px canopy lean
    const leanY   = (((seed >>> 24) & 0xff) / 255 - 0.5) * 3;
    const tint    = (((seed >>> 4)  & 0xff) / 255 - 0.5) * 30;    // ±15 brightness
    const lobePhase = ((seed >>> 2) & 0xff) / 255 * TAU;           // canopy rotation
    const r = baseR * (1 + sizeJit);
    const species = pickTreeSpecies(o);
    if      (species === 'oak')    drawOakTree(ctx, cx + leanX, cy + leanY, r, tint, lobePhase);
    else if (species === 'pine')   drawPineTree(ctx, cx + leanX, cy + leanY, r, tint, lobePhase);
    else if (species === 'birch')  drawBirchTree(ctx, cx + leanX, cy + leanY, r, tint, lobePhase);
    else if (species === 'maple')  drawMapleTree(ctx, cx + leanX, cy + leanY, r, tint, lobePhase);
    else if (species === 'willow') drawWillowTree(ctx, cx + leanX, cy + leanY, r, tint, lobePhase);
    else                           drawDeadTree(ctx, cx + leanX, cy + leanY, r, tint, lobePhase);
  }

  function drawOakTree(ctx, cx, cy, r, tint, phase) {
    ctx.fillStyle = '#3a2412';
    ctx.fillRect(cx - 3, cy - 1, 6, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.arc(cx + 2, cy + 2, r, 0, TAU); ctx.fill();
    ctx.fillStyle = shadeHex('#244a1a', tint | 0);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    // Two side lobes whose direction is rotated by phase — every tree's
    // canopy outline is therefore unique even at identical (r, tint).
    const ox1 = Math.cos(phase) * r * 0.55, oy1 = Math.sin(phase) * r * 0.5;
    const ox2 = Math.cos(phase + Math.PI) * r * 0.55, oy2 = Math.sin(phase + Math.PI) * r * 0.5;
    ctx.beginPath(); ctx.arc(cx + ox1, cy + oy1, r * 0.55, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + ox2, cy + oy2, r * 0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = shadeHex('#356a26', tint | 0);
    ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.35, r * 0.55, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(160,200,90,0.5)';
    ctx.fillRect(cx - r * 0.55, cy - r * 0.4, 2, 2);
    ctx.fillRect(cx + r * 0.2, cy - r * 0.55, 2, 2);
  }
  function drawPineTree(ctx, cx, cy, r, tint, phase) {
    ctx.fillStyle = '#2c1a08';
    ctx.fillRect(cx - 2, cy + 2, 4, 9);
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.moveTo(cx + 2, cy - r + 2);
    ctx.lineTo(cx + r + 2, cy + r * 0.85 + 2);
    ctx.lineTo(cx - r + 2, cy + r * 0.85 + 2);
    ctx.closePath(); ctx.fill();
    // Slight asymmetry: the base tier shifts by phase so trees lean.
    const skew = (Math.cos(phase)) * r * 0.08;
    ctx.fillStyle = shadeHex('#1a3a14', tint | 0);
    ctx.beginPath();
    ctx.moveTo(cx + skew, cy + r * 0.1);
    ctx.lineTo(cx + r + skew, cy + r * 0.95);
    ctx.lineTo(cx - r + skew, cy + r * 0.95);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = shadeHex('#23501a', tint | 0);
    ctx.beginPath();
    ctx.moveTo(cx + skew * 0.6, cy - r * 0.45);
    ctx.lineTo(cx + r * 0.78 + skew * 0.6, cy + r * 0.35);
    ctx.lineTo(cx - r * 0.78 + skew * 0.6, cy + r * 0.35);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = shadeHex('#327026', tint | 0);
    ctx.beginPath();
    ctx.moveTo(cx + skew * 0.3, cy - r * 0.95);
    ctx.lineTo(cx + r * 0.48 + skew * 0.3, cy - r * 0.1);
    ctx.lineTo(cx - r * 0.48 + skew * 0.3, cy - r * 0.1);
    ctx.closePath(); ctx.fill();
  }
  function drawBirchTree(ctx, cx, cy, r, tint, phase) {
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.arc(cx + 2, cy + 2, r * 0.95, 0, TAU); ctx.fill();
    // birch white trunk with horizontal dark bands; band positions drift
    // by phase so two adjacent birches don't share scar marks.
    ctx.fillStyle = '#d4d0bc';
    ctx.fillRect(cx - 2, cy - 1, 4, 11);
    ctx.fillStyle = '#3a2412';
    const bandOff = ((phase * 1.7) | 0) % 3;
    ctx.fillRect(cx - 2, cy + 1 + bandOff, 4, 1);
    ctx.fillRect(cx - 2, cy + 5, 4, 1);
    ctx.fillRect(cx - 2, cy + 8 - bandOff, 4, 1);
    ctx.fillStyle = shadeHex('#3a5a22', tint | 0);
    ctx.beginPath(); ctx.arc(cx, cy - 1, r * 0.95, 0, TAU); ctx.fill();
    ctx.fillStyle = shadeHex('#5e8a3a', tint | 0);
    const hx = Math.cos(phase + 1.2) * r * 0.35;
    const hy = Math.sin(phase + 1.2) * r * 0.35;
    ctx.beginPath(); ctx.arc(cx + hx, cy + hy - r * 0.2, r * 0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(200,220,130,0.6)';
    ctx.beginPath(); ctx.arc(cx + r * 0.2, cy - r * 0.55, r * 0.22, 0, TAU); ctx.fill();
  }
  function drawMapleTree(ctx, cx, cy, r, tint, phase) {
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.beginPath(); ctx.arc(cx + 2, cy + 2, r * 1.05, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a2412';
    ctx.fillRect(cx - 3, cy - 1, 6, 10);
    ctx.fillStyle = shadeHex('#7a281a', tint | 0);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    const ox1 = Math.cos(phase) * r * 0.5, oy1 = Math.sin(phase) * r * 0.45;
    const ox2 = Math.cos(phase + Math.PI) * r * 0.5, oy2 = Math.sin(phase + Math.PI) * r * 0.45;
    ctx.beginPath(); ctx.arc(cx + ox1, cy + oy1, r * 0.5, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + ox2, cy + oy2, r * 0.5, 0, TAU); ctx.fill();
    ctx.fillStyle = shadeHex('#b04a22', tint | 0);
    ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.55, 0, TAU); ctx.fill();
    ctx.fillStyle = shadeHex('#e3a83a', tint | 0);
    ctx.beginPath(); ctx.arc(cx + r * 0.4, cy - r * 0.2, r * 0.28, 0, TAU); ctx.fill();
  }
  function drawWillowTree(ctx, cx, cy, r, tint, phase) {
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.beginPath(); ctx.ellipse(cx + 2, cy + 2, r * 1.15, r * 0.75, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3a2c14';
    ctx.fillRect(cx - 2, cy, 4, 9);
    ctx.fillStyle = shadeHex('#1f3a1a', tint | 0);
    const sway = Math.cos(phase) * 1.4;
    ctx.beginPath(); ctx.ellipse(cx + sway, cy - 2, r * 1.1, r * 0.72, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = shadeHex('#2f5e26', tint | 0);
    ctx.beginPath(); ctx.ellipse(cx - r * 0.35 + sway, cy - r * 0.3, r * 0.5, r * 0.35, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(60,100,40,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = -3; i <= 3; i++) {
      const drop = r * 0.6 + Math.sin(phase + i) * 1.2;
      ctx.moveTo(cx + i * 2 + sway, cy + r * 0.25);
      ctx.lineTo(cx + i * 2 + 0.5 + sway, cy + drop);
    }
    ctx.stroke();
  }
  function drawDeadTree(ctx, cx, cy, r, tint, phase) {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.ellipse(cx + 1, cy + r * 0.7, r * 0.5, r * 0.18, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = shadeHex('#3a2c1c', tint | 0);
    ctx.fillRect(cx - 2, cy - r * 0.7, 4, r * 1.4 + 4);
    ctx.strokeStyle = shadeHex('#3a2c1c', tint | 0);
    ctx.lineWidth = 2;
    // Branches angle off in directions seeded by phase so no two dead
    // trees match silhouettes.
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = phase + i * 1.7;
      const len = r * (0.55 + (i & 1) * 0.25);
      const startY = cy - r * 0.5 + i * (r * 0.3);
      ctx.moveTo(cx, startY);
      ctx.lineTo(cx + Math.cos(a) * len, startY + Math.sin(a) * len * 0.6);
    }
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  function drawBoulder(ctx, o) {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    const r = Math.min(o.w, o.h) * 0.5;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath(); ctx.ellipse(cx + 2, cy + 3, r * 0.9, r * 0.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5a5b62';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#76777e';
    ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.55, 0, TAU); ctx.fill();
    ctx.fillStyle = '#3c3d44';
    ctx.fillRect(cx - 2, cy + r * 0.1, 4, 2);
  }

  // ---------- INTERIOR FURNITURE ----------
  function drawInteriorWall(ctx, o) {
    // Lighter than exterior walls so the inside reads as separable.
    ctx.fillStyle = '#7a705f';
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = '#5e564a';
    ctx.fillRect(o.x, o.y + o.h - 2, o.w, 2);
    ctx.fillStyle = '#9a907d';
    ctx.fillRect(o.x, o.y, o.w, 2);
  }

  function drawBed(ctx, o) {
    ctx.fillStyle = '#6a4830';
    ctx.fillRect(o.x + 2, o.y + 4, o.w - 4, o.h - 6);
    ctx.fillStyle = '#cfd0d3'; // sheet
    ctx.fillRect(o.x + 4, o.y + 6, o.w - 8, o.h - 14);
    ctx.fillStyle = '#b88a4e'; // pillow
    ctx.fillRect(o.x + 6, o.y + 4, o.w - 12, 6);
    ctx.fillStyle = '#3a2820';
    ctx.fillRect(o.x + 2, o.y + 4, 2, o.h - 6);
    ctx.fillRect(o.x + o.w - 4, o.y + 4, 2, o.h - 6);
  }

  function drawDresser(ctx, o) {
    ctx.fillStyle = '#5a3a22';
    ctx.fillRect(o.x + 3, o.y + 6, o.w - 6, o.h - 10);
    ctx.fillStyle = '#7a5430';
    ctx.fillRect(o.x + 4, o.y + 7, o.w - 8, (o.h - 12) / 2);
    ctx.fillRect(o.x + 4, o.y + 7 + (o.h - 12) / 2 + 1, o.w - 8, (o.h - 12) / 2);
    ctx.fillStyle = '#caa760';
    ctx.fillRect(o.x + o.w / 2 - 1, o.y + 10, 2, 1);
    ctx.fillRect(o.x + o.w / 2 - 1, o.y + o.h - 8, 2, 1);
  }

  function drawCounter(ctx, o) {
    ctx.fillStyle = '#6a655a';
    ctx.fillRect(o.x + 1, o.y + 4, o.w - 2, o.h - 8);
    ctx.fillStyle = '#8a8576';
    ctx.fillRect(o.x + 1, o.y + 4, o.w - 2, 2);
    ctx.fillStyle = '#4a4538';
    ctx.fillRect(o.x + 1, o.y + o.h - 6, o.w - 2, 2);
  }

  function drawStove(ctx, o) {
    ctx.fillStyle = '#3a3a40';
    ctx.fillRect(o.x + 4, o.y + 4, o.w - 8, o.h - 8);
    ctx.fillStyle = '#1a1a20';
    ctx.fillRect(o.x + 6, o.y + 6, o.w - 12, o.h - 16);
    // burners
    ctx.fillStyle = '#5a5a64';
    ctx.beginPath(); ctx.arc(o.x + o.w / 2 - 4, o.y + o.h - 8, 2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(o.x + o.w / 2 + 4, o.y + o.h - 8, 2, 0, TAU); ctx.fill();
  }

  function drawTable(ctx, o) {
    ctx.fillStyle = '#3a2418';
    ctx.fillRect(o.x + 4, o.y + 6, o.w - 8, o.h - 12);
    ctx.fillStyle = '#5a3a22';
    ctx.fillRect(o.x + 6, o.y + 8, o.w - 12, o.h - 16);
    // legs implied at corners
    ctx.fillStyle = '#1a1008';
    ctx.fillRect(o.x + 4, o.y + 6, 2, 2);
    ctx.fillRect(o.x + o.w - 6, o.y + 6, 2, 2);
    ctx.fillRect(o.x + 4, o.y + o.h - 8, 2, 2);
    ctx.fillRect(o.x + o.w - 6, o.y + o.h - 8, 2, 2);
  }

  function drawSofa(ctx, o) {
    ctx.fillStyle = '#5e4a3a';
    ctx.fillRect(o.x + 2, o.y + 6, o.w - 4, o.h - 10);
    ctx.fillStyle = '#7a624a';
    ctx.fillRect(o.x + 4, o.y + 10, o.w - 8, o.h - 16);
    // armrests
    ctx.fillStyle = '#3a2a1f';
    ctx.fillRect(o.x + 2, o.y + 6, 4, o.h - 10);
    ctx.fillRect(o.x + o.w - 6, o.y + 6, 4, o.h - 10);
  }

  function drawShelf(ctx, o) {
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(o.x + 2, o.y + 4, o.w - 4, o.h - 6);
    ctx.fillStyle = '#5a3e22';
    for (let r = 0; r < 3; r++) {
      const yy = o.y + 6 + r * Math.floor((o.h - 12) / 3);
      ctx.fillRect(o.x + 3, yy, o.w - 6, 2);
    }
    // a couple of items
    ctx.fillStyle = '#caa760';
    ctx.fillRect(o.x + 5, o.y + 8, 4, 4);
    ctx.fillStyle = '#7d8358';
    ctx.fillRect(o.x + o.w - 12, o.y + 18, 4, 5);
  }

  function drawWorkbench(ctx, o) {
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(o.x + 2, o.y + 6, o.w - 4, o.h - 10);
    ctx.fillStyle = '#7a5a30';
    ctx.fillRect(o.x + 4, o.y + 8, o.w - 8, o.h - 16);
    // a vise on the corner
    ctx.fillStyle = '#3a3a44';
    ctx.fillRect(o.x + o.w - 10, o.y + 10, 6, 4);
    // hammer
    ctx.fillStyle = '#2a2a2e';
    ctx.fillRect(o.x + 6, o.y + 14, 6, 2);
    ctx.fillStyle = '#8a6238';
    ctx.fillRect(o.x + 12, o.y + 14, 2, 10);
  }

  function drawBathtub(ctx, o) {
    ctx.fillStyle = '#cfd0d3';
    ctx.fillRect(o.x + 4, o.y + 4, o.w - 8, o.h - 8);
    ctx.fillStyle = '#9aa6b0';
    ctx.fillRect(o.x + 5, o.y + 5, o.w - 10, o.h - 10);
    ctx.fillStyle = '#446a78';
    ctx.fillRect(o.x + 7, o.y + 7, o.w - 14, o.h - 14);
    // faucet
    ctx.fillStyle = '#3a3a40';
    ctx.fillRect(o.x + o.w / 2 - 1, o.y + 5, 2, 4);
  }

  function drawSink(ctx, o) {
    ctx.fillStyle = '#7a8090';
    ctx.fillRect(o.x + 4, o.y + 6, o.w - 8, o.h - 12);
    ctx.fillStyle = '#3a4050';
    ctx.fillRect(o.x + 6, o.y + 8, o.w - 12, o.h - 16);
    ctx.fillStyle = '#cfd0d3';
    ctx.fillRect(o.x + o.w / 2 - 1, o.y + 4, 2, 3);
  }

  function drawLogPile(ctx, o) {
    // a stack of logs on their sides
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(o.x + 2, o.y + o.h - 6, o.w - 4, 4);
    ctx.fillStyle = '#5a3a22';
    ctx.fillRect(o.x + 2, o.y + 10, o.w - 4, 8);
    ctx.fillStyle = '#7a5430';
    ctx.fillRect(o.x + 2, o.y + 18, o.w - 4, 8);
    // rings on log ends
    ctx.fillStyle = '#caa760';
    ctx.beginPath(); ctx.arc(o.x + 3, o.y + 14, 2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(o.x + o.w - 3, o.y + 14, 2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(o.x + 3, o.y + 22, 2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(o.x + o.w - 3, o.y + 22, 2, 0, TAU); ctx.fill();
  }

  function drawStump(ctx, o) {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    const r = Math.min(o.w, o.h) * 0.35;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.ellipse(cx + 2, cy + 3, r, r * 0.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#5a3a22';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#caa760';
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.6, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#5a3a22'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.3, 0, TAU); ctx.stroke();
  }

  function drawMinecart(ctx, o) {
    ctx.fillStyle = '#3a3a44';
    ctx.fillRect(o.x + 3, o.y + 8, o.w - 6, o.h - 14);
    ctx.fillStyle = '#5a5a64';
    ctx.fillRect(o.x + 5, o.y + 10, o.w - 10, o.h - 18);
    ctx.fillStyle = '#8a4a2a';
    ctx.fillRect(o.x + 7, o.y + 12, o.w - 14, 4); // ore
    ctx.fillStyle = '#1a1a20';
    ctx.beginPath(); ctx.arc(o.x + 8, o.y + o.h - 5, 3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(o.x + o.w - 8, o.y + o.h - 5, 3, 0, TAU); ctx.fill();
  }

  function drawScarecrow(ctx, o) {
    const cx = o.x + o.w / 2;
    ctx.fillStyle = '#5a3a22';
    ctx.fillRect(cx - 1, o.y + 8, 2, o.h - 12);
    ctx.fillRect(cx - 8, o.y + 16, 16, 2);
    ctx.fillStyle = '#c9a04f';
    ctx.beginPath(); ctx.arc(cx, o.y + 10, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1a1008';
    ctx.fillRect(cx - 2, o.y + 9, 1, 1);
    ctx.fillRect(cx + 1, o.y + 9, 1, 1);
    ctx.fillStyle = '#3a2418';
    ctx.fillRect(cx - 5, o.y + 6, 10, 2);
  }

  function drawTrough(ctx, o) {
    ctx.fillStyle = '#3a2a1a';
    ctx.fillRect(o.x + 2, o.y + 8, o.w - 4, o.h - 12);
    ctx.fillStyle = '#446a78';
    ctx.fillRect(o.x + 4, o.y + 10, o.w - 8, o.h - 16);
    ctx.fillStyle = 'rgba(140,200,220,0.25)';
    ctx.fillRect(o.x + 5, o.y + 11, o.w - 10, 2);
  }

  // ---------- GROUND / TERRAIN TILES ----------
  // Each tile uses a hashed per-coord seed for color variation, sub-tile
  // detail (grass tufts / ripples / pebbles), and sparse flora (flowers,
  // mushrooms, bushes). Adjacent tiles also pass their 4-neighbor terrain
  // types so the corners between two different terrain types get rounded
  // instead of meeting at a hard L-shape. All of this gets baked once into
  // the chunk-surface offscreen canvas in render.js, so the per-tile cost
  // only pays at chunk-load time.
  const TERRAIN_BASE = [
    /* GRASS         */ '#1f2c14',
    /* FOREST        */ '#152018',
    /* SAND          */ '#b3a275',
    /* SHALLOW_WATER */ '#22506e',
    /* DEEP_WATER    */ '#0e2a44',
    /* HILL          */ '#3f3328',
    /* MOUNTAIN      */ '#43434c',
    /* PATH          */ '#5a4828',
  ];
  const TERRAIN_BASE_RGB = TERRAIN_BASE.map(hex => [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ]);
  // ±range applied to base RGB channel — smooth noise (bilerped from shared
  // tile corners) shifts each pixel by this much. Same-type tiles share
  // corner values, so colors flow continuously across the seam.
  const TERRAIN_TINT_RANGE = [14, 11, 13, 16, 9, 14, 18, 10];

  // Stable [0,1) hash per integer tile (tx, ty). Two coprime multipliers +
  // xor-shift; cheap, no allocations, no module-globals.
  function tileHash(tx, ty, salt) {
    let h = ((tx | 0) * 73856093) ^ ((ty | 0) * 19349663) ^ ((salt | 0) * 83492791) ^ 0x9e3779b9;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  // Smoothstep-bilerped value noise. Sampling at (x*k, y*k) for small k
  // produces low-frequency smooth variation suitable for biome-scale
  // color drift; same function reused for boundary depth variation.
  function smoothValueNoise(x, y, salt) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const u = fx * fx * (3 - 2 * fx);
    const v = fy * fy * (3 - 2 * fy);
    const n00 = tileHash(ix,     iy,     salt);
    const n10 = tileHash(ix + 1, iy,     salt);
    const n01 = tileHash(ix,     iy + 1, salt);
    const n11 = tileHash(ix + 1, iy + 1, salt);
    return (n00 * (1 - u) + n10 * u) * (1 - v) + (n01 * (1 - u) + n11 * u) * v;
  }
  function shadeHex(hex, delta) {
    let r = parseInt(hex.slice(1, 3), 16);
    let g = parseInt(hex.slice(3, 5), 16);
    let b = parseInt(hex.slice(5, 7), 16);
    r = Math.max(0, Math.min(255, r + delta));
    g = Math.max(0, Math.min(255, g + delta));
    b = Math.max(0, Math.min(255, b + delta));
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // Per-tile detail pass. The chunk's base color is painted in one shot
  // by paintChunkTerrainBase (smooth bilinear noise, no per-tile flat
  // rectangles) — this function only stamps tufts/ripples/flora on top
  // and draws the corner blends + beach foam at terrain boundaries.
  function drawTerrainTile(ctx, x, y, size, type, tx, ty, nL, nR, nU, nD) {
    if      (type === 0) drawGrassDetail(ctx, x, y, size, tx, ty);
    else if (type === 1) drawForestDetail(ctx, x, y, size, tx, ty);
    else if (type === 2) drawSandDetail(ctx, x, y, size, tx, ty);
    else if (type === 3) drawShallowWaterDetail(ctx, x, y, size, tx, ty);
    else if (type === 4) drawDeepWaterDetail(ctx, x, y, size, tx, ty);
    else if (type === 5) drawHillDetail(ctx, x, y, size, tx, ty);
    else if (type === 6) drawMountainDetail(ctx, x, y, size, tx, ty);
    else if (type === 7) drawPathDetail(ctx, x, y, size, tx, ty);

    if (nL !== undefined) {
      drawTerrainCorners(ctx, x, y, size, type, nL, nR, nU, nD, tx, ty);
      drawBeachFoam     (ctx, x, y, size, type, nL, nR, nU, nD);
    }
  }

  // Fills the L-corner where two adjacent neighbors agree on a different
  // terrain type with a clean quarter-arc of that neighbor's color. Radius
  // varies per corner so adjacent corners aren't carbon copies, but each
  // arc is a single smooth canvas arc() — no jagged jitter.
  function drawTerrainCorners(ctx, x, y, size, type, nL, nR, nU, nD, tx, ty) {
    if (nL >= 0 && nU >= 0 && nL === nU && nL !== type) {
      ctx.fillStyle = TERRAIN_BASE[nL] || TERRAIN_BASE[0];
      cornerWedge(ctx, x, y, size * (0.40 + tileHash(tx, ty, 80) * 0.18), 'tl');
    }
    if (nR >= 0 && nU >= 0 && nR === nU && nR !== type) {
      ctx.fillStyle = TERRAIN_BASE[nR] || TERRAIN_BASE[0];
      cornerWedge(ctx, x + size, y, size * (0.40 + tileHash(tx, ty, 82) * 0.18), 'tr');
    }
    if (nL >= 0 && nD >= 0 && nL === nD && nL !== type) {
      ctx.fillStyle = TERRAIN_BASE[nL] || TERRAIN_BASE[0];
      cornerWedge(ctx, x, y + size, size * (0.40 + tileHash(tx, ty, 84) * 0.18), 'bl');
    }
    if (nR >= 0 && nD >= 0 && nR === nD && nR !== type) {
      ctx.fillStyle = TERRAIN_BASE[nR] || TERRAIN_BASE[0];
      cornerWedge(ctx, x + size, y + size, size * (0.40 + tileHash(tx, ty, 86) * 0.18), 'br');
    }
  }
  function cornerWedge(ctx, x, y, r, which) {
    ctx.beginPath();
    if (which === 'tl') {
      ctx.moveTo(x, y);
      ctx.lineTo(x + r, y);
      ctx.arc(x + r, y + r, r, -Math.PI / 2, Math.PI, true);
      ctx.lineTo(x, y);
    } else if (which === 'tr') {
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + r);
      ctx.arc(x - r, y + r, r, 0, -Math.PI / 2, true);
      ctx.lineTo(x, y);
    } else if (which === 'bl') {
      ctx.moveTo(x, y);
      ctx.lineTo(x + r, y);
      ctx.arc(x + r, y - r, r, Math.PI / 2, Math.PI, false);
      ctx.lineTo(x, y);
    } else {
      ctx.moveTo(x, y);
      ctx.lineTo(x - r, y);
      ctx.arc(x - r, y - r, r, Math.PI / 2, 0, true);
      ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Sand↔water seams get a thin foam band on the sand side. Painted only
  // on sand tiles (the water side stays clean) so the result reads as a
  // beach with surf rather than a generic dither.
  function drawBeachFoam(ctx, x, y, size, type, nL, nR, nU, nD) {
    if (type !== 2) return;
    ctx.fillStyle = 'rgba(248,236,210,0.55)';
    if (nL === 3 || nL === 4) ctx.fillRect(x,            y,            2,    size);
    if (nR === 3 || nR === 4) ctx.fillRect(x + size - 2, y,            2,    size);
    if (nU === 3 || nU === 4) ctx.fillRect(x,            y,            size, 2);
    if (nD === 3 || nD === 4) ctx.fillRect(x,            y + size - 2, size, 2);
  }

  // Whole-chunk base paint. One ImageData write fills every pixel with
  // TERRAIN_BASE[tile_type] plus a smooth bilinear-noise tint, where the
  // noise samples are precomputed at every tile *corner*. Because the four
  // tiles sharing a corner all read the same noise value there, adjacent
  // same-type tiles transition smoothly — the grid lattice disappears in
  // homogeneous regions. Type seams stay sharp (the base color step is
  // discrete) but no longer "snap" to the lattice in solid-color areas.
  function paintChunkTerrainBase(ctx, chunk, chunkSize, tileSize) {
    const cs = chunkSize, ts = tileSize, tpc = cs / ts;
    const terrain = chunk.terrain;
    const img = ctx.createImageData(cs, cs);
    const data = img.data;
    const baseTx = chunk.cx * tpc;
    const baseTy = chunk.cy * tpc;

    // Smoothstep-bilerped value noise at each tile corner. Two octaves
    // with wavelengths of ~5 and ~14 tiles, so each patch of similar tint
    // covers a meadow-sized area (200-560px) instead of jittering per
    // tile. Continuous across chunks (the hash is indexed by world coord).
    const stride = tpc + 1;
    const cornerN = new Float32Array(stride * stride);
    for (let cy = 0; cy <= tpc; cy++) {
      for (let cx = 0; cx <= tpc; cx++) {
        const wx = baseTx + cx, wy = baseTy + cy;
        const o1 = smoothValueNoise(wx * 0.18, wy * 0.18, 601); // ~5 tile wavelength
        const o2 = smoothValueNoise(wx * 0.07, wy * 0.07, 603); // ~14 tile wavelength
        cornerN[cy * stride + cx] = o1 * 0.55 + o2 * 0.45;
      }
    }

    for (let py = 0; py < cs; py++) {
      const lyF = py / ts;
      const tileY = lyF >= tpc ? tpc - 1 : lyF | 0;
      const fy = lyF - tileY;
      const ifsy = 1 - fy;
      const cornRow0 = tileY * stride;
      const cornRow1 = cornRow0 + stride;
      const terrRow = tileY * tpc;
      for (let px = 0; px < cs; px++) {
        const lxF = px / ts;
        const tileX = lxF >= tpc ? tpc - 1 : lxF | 0;
        const fx = lxF - tileX;
        const ifsx = 1 - fx;
        const t = terrain[terrRow + tileX];
        const rgb = TERRAIN_BASE_RGB[t] || TERRAIN_BASE_RGB[0];
        const n00 = cornerN[cornRow0 + tileX];
        const n10 = cornerN[cornRow0 + tileX + 1];
        const n01 = cornerN[cornRow1 + tileX];
        const n11 = cornerN[cornRow1 + tileX + 1];
        const ntop = n00 * ifsx + n10 * fx;
        const nbot = n01 * ifsx + n11 * fx;
        const n = ntop * ifsy + nbot * fy;
        const delta = ((n - 0.5) * 2 * (TERRAIN_TINT_RANGE[t] || 10)) | 0;
        const i = (py * cs + px) << 2;
        let r = rgb[0] + delta; if (r < 0) r = 0; else if (r > 255) r = 255;
        let g = rgb[1] + delta; if (g < 0) g = 0; else if (g > 255) g = 255;
        let b = rgb[2] + delta; if (b < 0) b = 0; else if (b > 255) b = 255;
        data[i]     = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  // ---------- Per-terrain detail + flora ----------
  function drawGrassDetail(ctx, x, y, size, tx, ty) {
    const h1 = tileHash(tx, ty, 1);
    const h2 = tileHash(tx, ty, 2);
    const h3 = tileHash(tx, ty, 3);
    const h4 = tileHash(tx, ty, 4);
    // darker clump shadow
    ctx.fillStyle = 'rgba(20,38,18,0.55)';
    const sx1 = x + (h1 * 0.7 + 0.15) * size, sy1 = y + (h2 * 0.7 + 0.15) * size;
    ctx.fillRect(sx1 - 2, sy1, 2, 2);
    ctx.fillRect(sx1, sy1 - 1, 1, 3);
    // lighter blade specks
    ctx.fillStyle = 'rgba(150,188,80,0.45)';
    ctx.fillRect(x + h3 * (size - 4) + 1, y + h4 * (size - 4) + 1, 1, 2);
    const h5 = tileHash(tx, ty, 5);
    const h6 = tileHash(tx, ty, 6);
    ctx.fillRect(x + h5 * (size - 4) + 1, y + h6 * (size - 4) + 1, 1, 1);

    // Sparse flora. The buckets are disjoint so each tile gets at most one.
    const r = tileHash(tx, ty, 7);
    if (r < 0.06)      drawFlower(ctx, x + 6 + h1 * (size - 12), y + 6 + h2 * (size - 12), h3);
    else if (r < 0.09) drawMushrooms(ctx, x + 6 + h1 * (size - 12), y + 6 + h2 * (size - 12));
    else if (r < 0.13) drawBush(ctx, x + size * 0.5, y + size * 0.5, h3);
    else if (r < 0.17) drawFern(ctx, x + 8 + h1 * (size - 16), y + 8 + h2 * (size - 16));
    else if (r < 0.22) drawTallGrass(ctx, x + 4 + h1 * (size - 8), y + 4 + h2 * (size - 8));
  }
  function drawForestDetail(ctx, x, y, size, tx, ty) {
    // dappled light + leaf litter
    const h1 = tileHash(tx, ty, 11);
    const h2 = tileHash(tx, ty, 12);
    ctx.fillStyle = 'rgba(120,160,90,0.10)';
    ctx.fillRect(x + h1 * (size - 6), y + h2 * (size - 6), 5, 4);
    ctx.fillStyle = 'rgba(60,40,18,0.4)';
    const h3 = tileHash(tx, ty, 13);
    const h4 = tileHash(tx, ty, 14);
    ctx.fillRect(x + h3 * (size - 4), y + h4 * (size - 4), 2, 1);
    ctx.fillRect(x + h4 * (size - 3), y + h3 * (size - 3), 1, 2);
    // occasional fern/mushroom in the leaf litter
    const r = tileHash(tx, ty, 15);
    if (r < 0.08) drawFern(ctx, x + 8 + h1 * (size - 16), y + 8 + h2 * (size - 16));
    else if (r < 0.13) drawMushrooms(ctx, x + 6 + h1 * (size - 12), y + 6 + h2 * (size - 12));
    else if (r < 0.17) drawBush(ctx, x + size * 0.5, y + size * 0.5, h3);
  }
  function drawSandDetail(ctx, x, y, size, tx, ty) {
    const h1 = tileHash(tx, ty, 21);
    const h2 = tileHash(tx, ty, 22);
    const h3 = tileHash(tx, ty, 23);
    // pebbles
    ctx.fillStyle = 'rgba(70,52,28,0.35)';
    ctx.fillRect(x + h1 * (size - 4), y + h2 * (size - 4), 2, 2);
    ctx.fillStyle = 'rgba(90,72,40,0.3)';
    ctx.fillRect(x + h2 * (size - 3), y + h3 * (size - 3), 1, 1);
    ctx.fillRect(x + h3 * (size - 3), y + h1 * (size - 3), 1, 1);
    // highlight grain
    ctx.fillStyle = 'rgba(230,210,170,0.18)';
    ctx.fillRect(x + 2, y + h1 * (size - 4), size - 4, 1);
  }
  function drawShallowWaterDetail(ctx, x, y, size, tx, ty) {
    const h1 = tileHash(tx, ty, 31);
    const h2 = tileHash(tx, ty, 32);
    // long ripple highlights
    ctx.fillStyle = 'rgba(170,210,235,0.18)';
    const ry1 = y + h1 * (size - 2);
    ctx.fillRect(x + 4, ry1, size - 8, 1);
    ctx.fillStyle = 'rgba(140,190,225,0.12)';
    ctx.fillRect(x + 6 + h2 * 4, y + 6 + h2 * (size - 12), size - 12, 1);
    // sun-glint dots
    ctx.fillStyle = 'rgba(220,235,250,0.35)';
    ctx.fillRect(x + h1 * (size - 4) + 2, y + h2 * (size - 4) + 2, 1, 1);
  }
  function drawDeepWaterDetail(ctx, x, y, size, tx, ty) {
    const h1 = tileHash(tx, ty, 41);
    const h2 = tileHash(tx, ty, 42);
    // subtle ripple
    ctx.fillStyle = 'rgba(80,140,180,0.08)';
    ctx.fillRect(x + 6, y + h1 * (size - 4), size - 12, 1);
    // tiny sparkle
    if (h2 < 0.18) {
      ctx.fillStyle = 'rgba(200,225,240,0.4)';
      ctx.fillRect(x + h1 * (size - 4) + 2, y + h2 * (size - 4) + 2, 1, 1);
    }
  }
  function drawHillDetail(ctx, x, y, size, tx, ty) {
    const h1 = tileHash(tx, ty, 51);
    const h2 = tileHash(tx, ty, 52);
    // gradient-style top highlight (lighter band on top of tile)
    ctx.fillStyle = 'rgba(230,200,160,0.08)';
    ctx.fillRect(x, y, size, 3);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(x, y + size - 2, size, 2);
    // small rocks scattered
    ctx.fillStyle = 'rgba(60,42,24,0.5)';
    ctx.fillRect(x + h1 * (size - 4) + 1, y + h2 * (size - 4) + 1, 2, 1);
    if (h2 < 0.4) ctx.fillRect(x + h2 * (size - 3) + 1, y + h1 * (size - 3) + 1, 1, 1);
  }
  function drawMountainDetail(ctx, x, y, size, tx, ty) {
    const h1 = tileHash(tx, ty, 61);
    const h2 = tileHash(tx, ty, 62);
    // snow-cap highlights along the top
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(x, y, size, 3);
    ctx.fillRect(x + 3, y + 4, size - 6, 1);
    // crags
    ctx.fillStyle = 'rgba(20,20,30,0.4)';
    ctx.fillRect(x + h1 * (size - 4), y + size * 0.55, 2, size * 0.35);
    ctx.fillRect(x + h2 * (size - 3), y + size * 0.45, 1, size * 0.4);
    // highlight on the right side (lit from upper-right)
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.fillRect(x + size - 6, y + 4, 4, size - 8);
  }
  function drawPathDetail(ctx, x, y, size, tx, ty) {
    const h1 = tileHash(tx, ty, 71);
    const h2 = tileHash(tx, ty, 72);
    // gravel
    ctx.fillStyle = 'rgba(40,28,16,0.45)';
    ctx.fillRect(x + h1 * (size - 3), y + h2 * (size - 3), 1, 1);
    ctx.fillStyle = 'rgba(110,84,48,0.4)';
    ctx.fillRect(x + h2 * (size - 3), y + h1 * (size - 3), 2, 1);
    ctx.fillRect(x + h1 * (size - 2), y + h2 * (size - 2), 1, 1);
  }

  // ---------- Flora sprites (sub-tile, called from terrain detail) ----------
  const FLOWER_PALETTES = [
    ['#e8e6df', '#e3a83a'], // daisy
    ['#e3a83a', '#7a4a18'], // marigold
    ['#d24b35', '#3a0c08'], // poppy
    ['#a04ad8', '#382060'], // violet
    ['#7fb6ff', '#1f3a66'], // bluebell
    ['#f2c8d6', '#a04d6a'], // pink
  ];
  function drawFlower(ctx, cx, cy, h) {
    const p = FLOWER_PALETTES[(h * FLOWER_PALETTES.length) | 0] || FLOWER_PALETTES[0];
    // stem
    ctx.fillStyle = 'rgba(40,72,22,0.7)';
    ctx.fillRect(cx, cy + 1, 1, 3);
    // petals (4)
    ctx.fillStyle = p[0];
    ctx.fillRect(cx - 1, cy - 2, 2, 1);
    ctx.fillRect(cx - 2, cy - 1, 1, 2);
    ctx.fillRect(cx + 1, cy - 1, 1, 2);
    ctx.fillRect(cx - 1, cy + 1, 2, 1);
    // center
    ctx.fillStyle = p[1];
    ctx.fillRect(cx - 1, cy - 1, 2, 2);
  }
  function drawMushrooms(ctx, cx, cy) {
    // small cluster of 2
    ctx.fillStyle = 'rgba(70,50,30,0.5)';
    ctx.fillRect(cx - 2, cy + 3, 6, 1);
    // stem
    ctx.fillStyle = '#d8cfb8';
    ctx.fillRect(cx, cy, 1, 3);
    ctx.fillRect(cx + 3, cy + 1, 1, 2);
    // caps
    ctx.fillStyle = '#7a2618';
    ctx.fillRect(cx - 1, cy - 1, 3, 1);
    ctx.fillRect(cx, cy - 2, 1, 1);
    ctx.fillStyle = '#b04a22';
    ctx.fillRect(cx + 2, cy, 3, 1);
    // spots
    ctx.fillStyle = 'rgba(255,250,235,0.85)';
    ctx.fillRect(cx, cy - 1, 1, 1);
    ctx.fillRect(cx + 3, cy, 1, 1);
  }
  function drawBush(ctx, cx, cy, h) {
    const tint = h < 0.5;
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath(); ctx.ellipse(cx + 1, cy + 3, 7, 3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = tint ? '#1c2e14' : '#1a2c1a';
    ctx.beginPath(); ctx.arc(cx - 2, cy + 1, 4, 0, TAU); ctx.fill();
    ctx.fillStyle = tint ? '#2a4a1c' : '#284820';
    ctx.beginPath(); ctx.arc(cx + 1, cy - 1, 3.5, 0, TAU); ctx.fill();
    ctx.fillStyle = tint ? '#3d6022' : '#3a5e26';
    ctx.beginPath(); ctx.arc(cx + 2, cy + 1, 2, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(160,200,90,0.5)';
    ctx.fillRect(cx, cy - 2, 1, 1);
  }
  function drawFern(ctx, cx, cy) {
    ctx.strokeStyle = 'rgba(50,90,40,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, cy + 4); ctx.lineTo(cx, cy - 4);
    ctx.moveTo(cx, cy - 3); ctx.lineTo(cx - 3, cy - 1);
    ctx.moveTo(cx, cy - 1); ctx.lineTo(cx + 3, cy + 1);
    ctx.moveTo(cx, cy + 1); ctx.lineTo(cx - 3, cy + 3);
    ctx.stroke();
    ctx.fillStyle = 'rgba(110,160,70,0.45)';
    ctx.fillRect(cx - 1, cy - 4, 2, 1);
  }
  function drawTallGrass(ctx, cx, cy) {
    ctx.strokeStyle = 'rgba(110,160,72,0.65)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 1, cy + 2); ctx.lineTo(cx - 2, cy - 2);
    ctx.moveTo(cx, cy + 2);     ctx.lineTo(cx, cy - 3);
    ctx.moveTo(cx + 1, cy + 2); ctx.lineTo(cx + 2, cy - 2);
    ctx.stroke();
  }

  // Paint the camera-visible terrain by iterating each loaded chunk's
  // terrain grid. `world` is the World object; `tileSize` is the world's
  // TILE_SIZE constant. CHUNK_SIZE is a global from constants.js (sprites.js
  // is loaded first but the body of this function executes at call time,
  // after constants are in scope).
  function drawTerrain(ctx, cam, viewW, viewH, world, tileSize) {
    const vL = cam.x, vR = cam.x + viewW;
    const vT = cam.y, vB = cam.y + viewH;
    const chunkSize = CHUNK_SIZE;
    const tilesPerChunk = chunkSize / tileSize;
    const cx0 = Math.floor(vL / chunkSize);
    const cy0 = Math.floor(vT / chunkSize);
    const cx1 = Math.floor(vR / chunkSize);
    const cy1 = Math.floor(vB / chunkSize);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const chunk = world.chunks.get(cx + ',' + cy);
        if (!chunk || !chunk.terrain) continue;
        const baseX = cx * chunkSize, baseY = cy * chunkSize;
        const tx0 = Math.max(0, Math.floor((vL - baseX) / tileSize));
        const ty0 = Math.max(0, Math.floor((vT - baseY) / tileSize));
        const tx1 = Math.min(tilesPerChunk - 1, Math.floor((vR - baseX) / tileSize));
        const ty1 = Math.min(tilesPerChunk - 1, Math.floor((vB - baseY) / tileSize));
        for (let ly = ty0; ly <= ty1; ly++) {
          for (let lx = tx0; lx <= tx1; lx++) {
            const t = chunk.terrain[ly * tilesPerChunk + lx];
            const wx = baseX + lx * tileSize;
            const wy = baseY + ly * tileSize;
            drawTerrainTile(ctx, wx, wy, tileSize, t, cx * tilesPerChunk + lx, cy * tilesPerChunk + ly, -1, -1, -1, -1);
          }
        }
      }
    }
  }

  // Backwards-compat: still called by level-select preview canvases that
  // don't have a World instance. Paints a checker mat of the closest hint.
  function drawGround(ctx, cam, viewW, viewH, worldW, worldH, levelStyle) {
    const tile = 80;
    const x0 = Math.floor(cam.x / tile) * tile;
    const y0 = Math.floor(cam.y / tile) * tile;
    const pair = levelStyle === 'coast'    ? ['#152028', '#1d2c34']
              : levelStyle === 'highland' ? ['#1e1c20', '#26242a']
              :                              ['#1a2418', '#22301c'];
    for (let x = x0; x < cam.x + viewW + tile; x += tile) {
      for (let y = y0; y < cam.y + viewH + tile; y += tile) {
        const checker = ((x / tile) + (y / tile)) % 2 === 0;
        ctx.fillStyle = checker ? pair[0] : pair[1];
        ctx.fillRect(x, y, tile, tile);
      }
    }
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, worldW, worldH);
    ctx.strokeStyle = C.blood;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([8, 8]);
    ctx.strokeRect(2, 2, worldW - 4, worldH - 4);
    ctx.setLineDash([]);
  }

  // ---------- PUBLIC ----------
  root.ZSprites = {
    palette: C,
    drawPlayer, drawZombie, drawWalker, drawRunner, drawTank, drawFireZombie,
    drawBarrel, drawWall, drawWallGhost, drawPickup, drawBullet, drawRocket, drawExplosion,
    drawCrate, drawTombstone, drawWarehouseWall, drawObstacle, drawGround,
    drawTerrain, drawTerrainTile, paintChunkTerrainBase,
    drawWoodWall, drawBrickWall, drawStoneWall, drawInteriorWall,
    drawFence, drawVehicle, drawBarrelDecor,
    drawTree, drawBoulder,
    drawBed, drawDresser, drawCounter, drawStove, drawTable, drawSofa, drawShelf,
    drawWorkbench, drawBathtub, drawSink, drawLogPile, drawStump, drawMinecart,
    drawScarecrow, drawTrough,
    drawDecorTile, drawPier, drawCropRow, drawRug,
    drawHeldWeapon, drawMuzzleFlash,
  };
})(window);
