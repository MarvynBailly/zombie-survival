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

  function drawObstacle(ctx, o, levelStyle) {
    if (levelStyle === 'graveyard') return drawTombstone(ctx, o);
    if (levelStyle === 'warehouse') return drawWarehouseWall(ctx, o);
    return drawCrate(ctx, o);
  }

  // ---------- GROUND TILES ----------
  function drawGround(ctx, cam, viewW, viewH, worldW, worldH, levelStyle) {
    const tile = 80;
    const x0 = Math.floor(cam.x / tile) * tile;
    const y0 = Math.floor(cam.y / tile) * tile;
    for (let x = x0; x < cam.x + viewW + tile; x += tile) {
      for (let y = y0; y < cam.y + viewH + tile; y += tile) {
        const checker = ((x / tile) + (y / tile)) % 2 === 0;
        let base;
        if (levelStyle === 'graveyard') base = checker ? '#1a221a' : '#202820';
        else if (levelStyle === 'warehouse') base = checker ? '#2a2218' : '#312719';
        else base = checker ? C.ground1 : C.ground2;
        ctx.fillStyle = base;
        ctx.fillRect(x, y, tile, tile);
        // subtle noise dots
        ctx.fillStyle = 'rgba(255,255,255,0.015)';
        ctx.fillRect(x + 8, y + 12, 2, 2);
        ctx.fillRect(x + 40, y + 60, 2, 2);
        ctx.fillRect(x + 64, y + 20, 2, 2);
      }
    }
    // world border with vignette
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
    drawHeldWeapon, drawMuzzleFlash,
  };
})(window);
