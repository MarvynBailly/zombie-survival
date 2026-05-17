// bestiary.jsx — 14 more enemies, drawn in the same top-down style.
// Each draw fn takes (ctx, z) with the same z shape as drawZombie:
//   { x, y, r, hp, maxHp, angle, walkPhase, onFire?, stunned? }
// Stationary ones ignore angle for movement but still face the player.

(function (root) {
  'use strict';
  const TAU = Math.PI * 2;

  // ----- palette -----
  const C = {
    ink: '#0b0c0e', bone: '#e8e6df', boneDim: '#bdbab1',
    blood: '#d24b35', bloodDeep: '#8a2a1a', bloodLight: '#ec6448',
    toxic: '#8ec547', toxicDeep: '#4a6b22', toxicLight: '#b9d855',
    warn: '#e3a83a', fire1: '#ffb84a', fire2: '#ff6a2a',
    elec: '#7fc8ff', elecDeep: '#2a6a9a',
    frost: '#a8d8e8', frostDeep: '#3a5a7a',
    purple: '#7a3a8a', purpleHi: '#a05ab0', purpleDeep: '#4a1a5a',

    // flesh tones for biomass
    flesh: '#7d3a45', fleshHi: '#a45260', fleshLo: '#3a1a20',
    bile:  '#8a9a30', bileHi: '#a8b85a',
    rot:   '#5e4a3a', rotHi: '#8a6c52', rotLo: '#2a1a10',

    // walker palette (consistent with existing fire/walker)
    walkerSkin: '#7a9a55', walkerSkinLo: '#4a6332',
    walkerRag: '#3a3024',
  };
  const TAU2 = TAU;

  function shadow(ctx, x, y, rx, ry) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(x + 1, y + 4, rx, ry, 0, 0, TAU);
    ctx.fill();
  }

  // ============================================================
  // 01 · INFECTION CLUSTER — stationary biomass spawner
  // ============================================================
  function drawInfectionCluster(ctx, z) {
    const x = z.x, y = z.y;
    const t = z.walkPhase || 0;
    const pulse = 0.85 + Math.sin(t * TAU * 1.5) * 0.15;

    // wide soft shadow / tar-like stain
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.ellipse(x, y, z.r * 1.4, z.r * 1.2, 0, 0, TAU);
    ctx.fill();

    // organic blob — irregular outer flesh shape (8 lobes)
    ctx.fillStyle = C.fleshLo;
    ctx.beginPath();
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * TAU;
      const rr = z.r * (1.0 + Math.sin(a * 3 + t * 2) * 0.08);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr * 0.95;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();

    // inner flesh
    ctx.fillStyle = C.flesh;
    ctx.beginPath();
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * TAU + 0.2;
      const rr = z.r * 0.78 * (1.0 + Math.sin(a * 4 + t * 3) * 0.07);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr * 0.95;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();

    // tendrils reaching outward (6, around the perimeter)
    ctx.strokeStyle = C.fleshLo;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + t * 0.5;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * z.r * 0.9, y + Math.sin(a) * z.r * 0.85);
      // little curl
      const mx = x + Math.cos(a) * z.r * 1.3;
      const my = y + Math.sin(a) * z.r * 1.3;
      ctx.quadraticCurveTo(
        x + Math.cos(a + 0.4) * z.r * 1.15,
        y + Math.sin(a + 0.4) * z.r * 1.15,
        mx, my);
      ctx.stroke();
    }

    // spawn nodes — 4-5 egg bulges with embryos inside, pulsing
    const nodeCount = 5;
    for (let i = 0; i < nodeCount; i++) {
      const a = (i / nodeCount) * TAU + 0.3;
      const nr = z.r * 0.42;
      const nx = x + Math.cos(a) * nr;
      const ny = y + Math.sin(a) * nr * 0.95;
      const nodePulse = 0.8 + Math.sin(t * TAU + i) * 0.2;
      // egg sac
      ctx.fillStyle = C.fleshHi;
      ctx.beginPath();
      ctx.ellipse(nx, ny, z.r * 0.22 * nodePulse, z.r * 0.18 * nodePulse, a, 0, TAU);
      ctx.fill();
      // embryo silhouette inside (curled crawler shape)
      ctx.fillStyle = C.fleshLo;
      ctx.beginPath();
      ctx.arc(nx, ny, z.r * 0.10, 0, TAU);
      ctx.fill();
      // tiny eye glow
      ctx.fillStyle = C.warn;
      ctx.beginPath();
      ctx.arc(nx + Math.cos(a) * z.r * 0.05, ny + Math.sin(a) * z.r * 0.05, 0.9, 0, TAU);
      ctx.fill();
    }

    // glowing toxic core
    const coreR = z.r * 0.30 * pulse;
    const g = ctx.createRadialGradient(x, y, 1, x, y, coreR + z.r * 0.2);
    g.addColorStop(0, 'rgba(185,216,85,0.95)');
    g.addColorStop(0.5, 'rgba(140,180,60,0.55)');
    g.addColorStop(1, 'rgba(74,107,34,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, coreR + z.r * 0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.toxicLight;
    ctx.beginPath();
    ctx.arc(x, y, coreR * 0.55, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#dfff7a';
    ctx.beginPath();
    ctx.arc(x, y, coreR * 0.3, 0, TAU);
    ctx.fill();

    // root umbilicals stretching to nearby spawned zombies (visual only)
    // [drawn at scene time if we know spawn positions; skipped here]
  }

  // ============================================================
  // 02 · HIVE SAC — cluster of eggs, bursts releasing crawlers
  // ============================================================
  function drawHiveSac(ctx, z) {
    const x = z.x, y = z.y;
    const t = z.walkPhase || 0;
    shadow(ctx, x, y, z.r + 2, (z.r + 2) * 0.55);

    // 6 overlapping eggs
    const eggCount = 6;
    for (let i = 0; i < eggCount; i++) {
      const a = (i / eggCount) * TAU;
      const dist = z.r * 0.4;
      const ex = x + Math.cos(a) * dist;
      const ey = y + Math.sin(a) * dist * 0.9;
      const pulse = 0.92 + Math.sin(t * TAU + i * 0.7) * 0.08;
      // outer membrane
      ctx.fillStyle = C.fleshLo;
      ctx.beginPath();
      ctx.ellipse(ex, ey, z.r * 0.4 * pulse, z.r * 0.55 * pulse, a, 0, TAU);
      ctx.fill();
      // translucent fluid layer
      ctx.fillStyle = C.fleshHi;
      ctx.beginPath();
      ctx.ellipse(ex, ey, z.r * 0.34 * pulse, z.r * 0.47 * pulse, a, 0, TAU);
      ctx.fill();
      // crawler silhouette inside (curled)
      ctx.fillStyle = C.fleshLo;
      ctx.beginPath();
      ctx.arc(ex + Math.cos(a) * 1, ey + Math.sin(a) * 1, z.r * 0.16 * pulse, 0, TAU);
      ctx.fill();
      // eye glow
      ctx.fillStyle = C.blood;
      ctx.beginPath();
      ctx.arc(ex + Math.cos(a) * 2, ey + Math.sin(a) * 2, 0.7, 0, TAU);
      ctx.fill();
      // veins radiating outward
      ctx.strokeStyle = C.fleshLo;
      ctx.lineWidth = 0.6;
      for (let v = 0; v < 3; v++) {
        const va = a + (v - 1) * 0.5;
        ctx.beginPath();
        ctx.moveTo(ex, ey);
        ctx.lineTo(ex + Math.cos(va) * z.r * 0.35, ey + Math.sin(va) * z.r * 0.35);
        ctx.stroke();
      }
    }

    // central biomass blob
    ctx.fillStyle = C.flesh;
    ctx.beginPath();
    ctx.arc(x, y, z.r * 0.35, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.fleshHi;
    ctx.beginPath();
    ctx.arc(x, y, z.r * 0.18, 0, TAU);
    ctx.fill();
  }

  // ============================================================
  // 03 · SHRIEKER — stationary plant-like, opens to roar
  // ============================================================
  function drawShrieker(ctx, z) {
    const x = z.x, y = z.y;
    const t = z.walkPhase || 0;
    const open = 0.5 + Math.sin(t * TAU * 0.8) * 0.5; // 0..1 open factor

    shadow(ctx, x, y, z.r + 4, (z.r + 4) * 0.45);

    // sonic ring on open (when open > 0.7)
    if (open > 0.5) {
      const ringT = (open - 0.5) * 2;
      ctx.strokeStyle = `rgba(232,168,58,${0.6 - ringT * 0.55})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, z.r + ringT * 24, 0, TAU);
      ctx.stroke();
    }

    // ground roots / mycelium
    ctx.strokeStyle = C.rotLo;
    ctx.lineWidth = 1.3;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      const len = z.r * (1.2 + (i % 2) * 0.3);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * len, y + Math.sin(a) * len);
      ctx.stroke();
    }

    // petals (4 around mouth)
    const petalCount = 4;
    for (let i = 0; i < petalCount; i++) {
      const a = (i / petalCount) * TAU + Math.PI / 4;
      const ox = Math.cos(a) * z.r * 0.5 * open * 1.2;
      const oy = Math.sin(a) * z.r * 0.5 * open * 1.2;
      ctx.save();
      ctx.translate(x + ox, y + oy);
      ctx.rotate(a);
      ctx.fillStyle = C.flesh;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(z.r * 0.5, -z.r * 0.4, z.r * 0.9, 0);
      ctx.quadraticCurveTo(z.r * 0.5, z.r * 0.4, 0, 0);
      ctx.fill();
      ctx.fillStyle = C.fleshLo;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(z.r * 0.4, -z.r * 0.3, z.r * 0.75, 0);
      ctx.quadraticCurveTo(z.r * 0.4, z.r * 0.3, 0, 0);
      ctx.stroke();
      ctx.restore();
    }

    // central mouth — opens and closes
    const mouthR = z.r * (0.25 + open * 0.25);
    ctx.fillStyle = '#1a0a0a';
    ctx.beginPath();
    ctx.arc(x, y, mouthR, 0, TAU);
    ctx.fill();
    // teeth ring
    if (open > 0.4) {
      ctx.fillStyle = C.bone;
      const teeth = 10;
      for (let i = 0; i < teeth; i++) {
        const a = (i / teeth) * TAU;
        ctx.beginPath();
        ctx.moveTo(x + Math.cos(a) * mouthR * 0.85,
                   y + Math.sin(a) * mouthR * 0.85);
        ctx.lineTo(x + Math.cos(a + 0.2) * mouthR * 0.85,
                   y + Math.sin(a + 0.2) * mouthR * 0.85);
        ctx.lineTo(x + Math.cos(a + 0.1) * mouthR * 0.5,
                   y + Math.sin(a + 0.1) * mouthR * 0.5);
        ctx.closePath(); ctx.fill();
      }
    }
    // inner uvula
    ctx.fillStyle = C.fleshHi;
    ctx.beginPath();
    ctx.arc(x, y, mouthR * 0.4, 0, TAU);
    ctx.fill();
  }

  // ============================================================
  // 04 · BROOD MOTHER — walking spawner with embryo sacs
  // ============================================================
  function drawBroodMother(ctx, z) {
    const x = z.x, y = z.y, ang = z.angle || 0;
    const walk = z.walkPhase || 0;
    const sway = Math.sin(walk * TAU) * 2;
    shadow(ctx, x, y, z.r + 3, (z.r + 3) * 0.5);

    // multiple thick legs (spider-undercarriage)
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.strokeStyle = C.fleshLo;
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU;
      const ext = z.r * 1.1 + Math.sin(walk * TAU + i) * 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * z.r * 0.6, Math.sin(a) * z.r * 0.55);
      const jx = Math.cos(a) * z.r * 0.9;
      const jy = Math.sin(a) * z.r * 0.85;
      ctx.lineTo(jx, jy);
      ctx.lineTo(Math.cos(a) * ext, Math.sin(a) * ext);
      ctx.stroke();
    }
    ctx.restore();

    // massive bulbous body
    ctx.save(); ctx.translate(x + sway * 0.4, y); ctx.rotate(ang);
    ctx.fillStyle = C.flesh;
    ctx.beginPath();
    ctx.ellipse(0, 0, z.r * 1.1, z.r * 0.95, 0, 0, TAU);
    ctx.fill();
    // bloated highlights
    ctx.fillStyle = C.fleshHi;
    ctx.beginPath();
    ctx.ellipse(-z.r * 0.2, -z.r * 0.3, z.r * 0.5, z.r * 0.35, 0.3, 0, TAU);
    ctx.fill();

    // embryo sacs on back/shoulders (4)
    [[-z.r * 0.4, -z.r * 0.55], [-z.r * 0.55, 0],
     [-z.r * 0.4, z.r * 0.55], [-z.r * 0.6, -z.r * 0.25]].forEach(([dx, dy], i) => {
      const p = 0.9 + Math.sin(walk * TAU + i) * 0.1;
      ctx.fillStyle = C.bile;
      ctx.beginPath();
      ctx.ellipse(dx, dy, z.r * 0.22 * p, z.r * 0.16 * p, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C.fleshLo;
      ctx.beginPath();
      ctx.arc(dx, dy, z.r * 0.08, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C.blood;
      ctx.beginPath();
      ctx.arc(dx + 1, dy + 1, 0.7, 0, TAU);
      ctx.fill();
    });

    // multiple arms reaching forward (4)
    ctx.fillStyle = C.fleshHi;
    [[-0.4], [-0.1], [0.1], [0.4]].forEach(([angOff]) => {
      ctx.save();
      ctx.rotate(angOff);
      ctx.beginPath();
      ctx.ellipse(z.r * 0.7, 0, z.r * 0.32, z.r * 0.13, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C.fleshLo;
      ctx.beginPath();
      ctx.arc(z.r * 0.95, 0, 1.6, 0, TAU);
      ctx.fill();
      ctx.fillStyle = C.fleshHi;
      ctx.restore();
    });

    // small head with wide mouth
    ctx.fillStyle = C.fleshLo;
    ctx.beginPath();
    ctx.arc(z.r * 0.45, 0, z.r * 0.32, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#1a0a0a';
    ctx.beginPath();
    ctx.ellipse(z.r * 0.55, 0, z.r * 0.15, z.r * 0.22, 0, 0, TAU);
    ctx.fill();
    // wide eyes
    ctx.fillStyle = '#ffd84a';
    ctx.beginPath(); ctx.arc(z.r * 0.35, -z.r * 0.16, 1.1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.35, z.r * 0.16, 1.1, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ============================================================
  // 05 · NECROMANCER — raises killed zombies
  // ============================================================
  function drawNecromancer(ctx, z) {
    const x = z.x, y = z.y, ang = z.angle || 0;
    const t = z.walkPhase || 0;
    shadow(ctx, x, y, z.r, z.r * 0.45);

    // dark mist aura
    const g = ctx.createRadialGradient(x, y, 2, x, y, z.r + 14);
    g.addColorStop(0, 'rgba(122,58,138,0.45)');
    g.addColorStop(1, 'rgba(40,20,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, z.r + 14, 0, TAU);
    ctx.fill();

    // swirling rune marks beneath
    ctx.strokeStyle = C.purpleHi;
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 3; i++) {
      const ra = (i / 3) * TAU + t * 0.6;
      ctx.beginPath();
      ctx.arc(x, y, z.r * 1.2, ra, ra + 0.5);
      ctx.stroke();
    }

    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    // robe (dark conical shape)
    ctx.fillStyle = C.purpleDeep;
    ctx.beginPath();
    ctx.moveTo(-z.r * 0.9, -z.r * 0.5);
    ctx.lineTo(-z.r * 0.95, z.r * 0.5);
    ctx.lineTo(z.r * 0.4, z.r * 0.7);
    ctx.lineTo(z.r * 0.4, -z.r * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = C.purple;
    ctx.beginPath();
    ctx.moveTo(-z.r * 0.7, -z.r * 0.45);
    ctx.lineTo(-z.r * 0.75, z.r * 0.45);
    ctx.lineTo(z.r * 0.3, z.r * 0.6);
    ctx.lineTo(z.r * 0.3, -z.r * 0.6);
    ctx.closePath();
    ctx.fill();
    // hood
    ctx.fillStyle = '#0a0a0c';
    ctx.beginPath();
    ctx.arc(0, 0, z.r * 0.55, 0, TAU);
    ctx.fill();
    // skull face inside hood
    ctx.fillStyle = C.bone;
    ctx.beginPath();
    ctx.arc(z.r * 0.1, 0, z.r * 0.32, 0, TAU);
    ctx.fill();
    // eye sockets (glowing)
    ctx.fillStyle = C.purpleHi;
    ctx.beginPath(); ctx.arc(z.r * 0.22, -z.r * 0.12, 1.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.22, z.r * 0.12, 1.6, 0, TAU); ctx.fill();
    // nasal cavity
    ctx.fillStyle = '#1a0a14';
    ctx.beginPath();
    ctx.moveTo(z.r * 0.3, -1.5); ctx.lineTo(z.r * 0.36, 0);
    ctx.lineTo(z.r * 0.3, 1.5); ctx.closePath(); ctx.fill();
    // skeletal arms reaching forward, glowing
    ctx.fillStyle = C.boneDim;
    ctx.beginPath();
    ctx.ellipse(z.r * 0.55, -z.r * 0.4, z.r * 0.35, z.r * 0.1, -0.2, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(z.r * 0.55, z.r * 0.4, z.r * 0.35, z.r * 0.1, 0.2, 0, TAU);
    ctx.fill();
    // glowing finger tips
    ctx.fillStyle = C.purpleHi;
    ctx.beginPath(); ctx.arc(z.r * 0.88, -z.r * 0.45, 1.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.88, z.r * 0.45, 1.6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#dfb5e5';
    ctx.beginPath(); ctx.arc(z.r * 0.88, -z.r * 0.45, 0.8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.88, z.r * 0.45, 0.8, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ============================================================
  // 06 · CHARGER — bull-rush in a line
  // ============================================================
  function drawCharger(ctx, z) {
    const x = z.x, y = z.y, ang = z.angle || 0;
    const walk = z.walkPhase || 0;
    shadow(ctx, x, y, z.r + 2, (z.r + 2) * 0.4);

    // dust trail behind (when charging — based on walkPhase intensity)
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.fillStyle = 'rgba(180,160,140,0.35)';
    for (let i = 0; i < 4; i++) {
      const dt = (walk + i * 0.2) % 1;
      ctx.beginPath();
      ctx.arc(-z.r * (1 + dt * 0.8), (i - 2) * 2,
              z.r * 0.3 * (1 - dt), 0, TAU);
      ctx.fill();
    }

    // massive hunched shoulders
    ctx.fillStyle = C.walkerSkinLo;
    ctx.beginPath();
    ctx.ellipse(-z.r * 0.2, -z.r * 0.55, z.r * 0.55, z.r * 0.35, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-z.r * 0.2, z.r * 0.55, z.r * 0.55, z.r * 0.35, 0, 0, TAU);
    ctx.fill();
    // body
    ctx.fillStyle = C.walkerSkin;
    ctx.beginPath();
    ctx.ellipse(-z.r * 0.15, 0, z.r * 0.9, z.r * 0.75, 0, 0, TAU);
    ctx.fill();
    // ragged shirt strap
    ctx.fillStyle = C.walkerRag;
    ctx.fillRect(-z.r * 0.6, -z.r * 0.1, z.r * 0.8, z.r * 0.2);

    // lowered head (horn pointed forward)
    ctx.fillStyle = C.walkerSkinLo;
    ctx.beginPath();
    ctx.arc(z.r * 0.45, 0, z.r * 0.4, 0, TAU);
    ctx.fill();
    // bony horn protrusions
    ctx.fillStyle = C.bone;
    ctx.beginPath();
    ctx.moveTo(z.r * 0.55, -z.r * 0.3);
    ctx.lineTo(z.r * 0.95, -z.r * 0.18);
    ctx.lineTo(z.r * 0.65, -z.r * 0.1);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(z.r * 0.55, z.r * 0.3);
    ctx.lineTo(z.r * 0.95, z.r * 0.18);
    ctx.lineTo(z.r * 0.65, z.r * 0.1);
    ctx.closePath(); ctx.fill();
    // central bony forehead
    ctx.fillStyle = C.boneDim;
    ctx.beginPath();
    ctx.arc(z.r * 0.6, 0, z.r * 0.16, 0, TAU);
    ctx.fill();
    // small angry eye
    ctx.fillStyle = C.blood;
    ctx.beginPath(); ctx.arc(z.r * 0.45, -z.r * 0.12, 1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.45, z.r * 0.12, 1, 0, TAU); ctx.fill();
    // legs
    ctx.fillStyle = C.walkerRag;
    ctx.fillRect(-z.r * 0.8, -z.r * 0.45, z.r * 0.45, z.r * 0.2);
    ctx.fillRect(-z.r * 0.8, z.r * 0.25, z.r * 0.45, z.r * 0.2);
    ctx.restore();
  }

  // ============================================================
  // 07 · REAPER — gaunt with long scythe arms
  // ============================================================
  function drawReaper(ctx, z) {
    const x = z.x, y = z.y, ang = z.angle || 0;
    const walk = z.walkPhase || 0;
    const swing = Math.sin(walk * TAU) * 0.6;
    shadow(ctx, x, y, z.r, z.r * 0.4);

    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    // tattered cloak base
    ctx.fillStyle = '#1a1418';
    ctx.beginPath();
    ctx.moveTo(-z.r * 0.7, -z.r * 0.5);
    ctx.lineTo(-z.r * 1.0, z.r * 0.0);
    ctx.lineTo(-z.r * 0.7, z.r * 0.5);
    ctx.lineTo(z.r * 0.3, z.r * 0.5);
    ctx.lineTo(z.r * 0.3, -z.r * 0.5);
    ctx.closePath();
    ctx.fill();
    // ragged hem
    ctx.fillStyle = '#0a0a0c';
    for (let i = 0; i < 5; i++) {
      const sx = -z.r * 0.85 + i * z.r * 0.3;
      ctx.beginPath();
      ctx.moveTo(sx, z.r * 0.5);
      ctx.lineTo(sx + z.r * 0.1, z.r * 0.8);
      ctx.lineTo(sx + z.r * 0.2, z.r * 0.5);
      ctx.closePath(); ctx.fill();
    }
    // thin emaciated torso
    ctx.fillStyle = C.boneDim;
    ctx.beginPath();
    ctx.ellipse(0, 0, z.r * 0.5, z.r * 0.45, 0, 0, TAU);
    ctx.fill();
    // ribcage lines
    ctx.strokeStyle = C.bone;
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, z.r * 0.45, -0.4 + i * 0.2, 0.4 + i * 0.2);
      ctx.stroke();
    }
    // hood/head
    ctx.fillStyle = '#0a0a0c';
    ctx.beginPath();
    ctx.arc(z.r * 0.1, 0, z.r * 0.45, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.bone;
    ctx.beginPath();
    ctx.arc(z.r * 0.2, 0, z.r * 0.28, 0, TAU);
    ctx.fill();
    // glowing red eyes
    ctx.fillStyle = C.blood;
    ctx.beginPath(); ctx.arc(z.r * 0.32, -z.r * 0.1, 1.1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.32, z.r * 0.1, 1.1, 0, TAU); ctx.fill();

    // long scythe arms — both sides, very extended
    // left arm
    ctx.save();
    ctx.rotate(swing * 0.5);
    ctx.strokeStyle = C.boneDim;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(z.r * 0.2, -z.r * 0.45);
    ctx.lineTo(z.r * 1.1, -z.r * 0.8);
    ctx.lineTo(z.r * 1.6, -z.r * 0.3);
    ctx.stroke();
    // blade
    ctx.fillStyle = C.bone;
    ctx.beginPath();
    ctx.moveTo(z.r * 1.6, -z.r * 0.3);
    ctx.lineTo(z.r * 2.0, -z.r * 0.55);
    ctx.lineTo(z.r * 1.85, -z.r * 0.15);
    ctx.lineTo(z.r * 1.55, -z.r * 0.18);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#cfc5b0';
    ctx.beginPath();
    ctx.moveTo(z.r * 1.6, -z.r * 0.3);
    ctx.lineTo(z.r * 2.0, -z.r * 0.55);
    ctx.lineTo(z.r * 1.7, -z.r * 0.35);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    // right arm (mirrored)
    ctx.save();
    ctx.rotate(-swing * 0.5);
    ctx.strokeStyle = C.boneDim;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(z.r * 0.2, z.r * 0.45);
    ctx.lineTo(z.r * 1.1, z.r * 0.8);
    ctx.lineTo(z.r * 1.6, z.r * 0.3);
    ctx.stroke();
    ctx.fillStyle = C.bone;
    ctx.beginPath();
    ctx.moveTo(z.r * 1.6, z.r * 0.3);
    ctx.lineTo(z.r * 2.0, z.r * 0.55);
    ctx.lineTo(z.r * 1.85, z.r * 0.15);
    ctx.lineTo(z.r * 1.55, z.r * 0.18);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#cfc5b0';
    ctx.beginPath();
    ctx.moveTo(z.r * 1.6, z.r * 0.3);
    ctx.lineTo(z.r * 2.0, z.r * 0.55);
    ctx.lineTo(z.r * 1.7, z.r * 0.35);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  // ============================================================
  // 08 · STALKER — semi-transparent, cloaked until close
  // ============================================================
  function drawStalker(ctx, z) {
    const x = z.x, y = z.y, ang = z.angle || 0;
    const t = z.walkPhase || 0;
    const flicker = 0.45 + Math.sin(t * 12) * 0.15;
    // no shadow (cloaked)

    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);

    // glitching outer outline (broken circles)
    ctx.strokeStyle = `rgba(127,200,255,${flicker})`;
    ctx.lineWidth = 0.8;
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.ellipse(0, 0, z.r * 0.9, z.r * 0.75, 0, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    // very faint body silhouette
    ctx.fillStyle = `rgba(74,82,90,${flicker * 0.6})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, z.r * 0.8, z.r * 0.65, 0, 0, TAU);
    ctx.fill();

    // arms reaching forward
    ctx.fillStyle = `rgba(74,82,90,${flicker * 0.5})`;
    ctx.beginPath();
    ctx.ellipse(z.r * 0.55, -z.r * 0.45, z.r * 0.35, z.r * 0.13, -0.3, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(z.r * 0.55, z.r * 0.45, z.r * 0.35, z.r * 0.13, 0.3, 0, TAU);
    ctx.fill();

    // head (the only solid bit)
    ctx.fillStyle = '#1a1418';
    ctx.beginPath();
    ctx.arc(0, 0, z.r * 0.4, 0, TAU);
    ctx.fill();
    // very bright eyes — the giveaway
    ctx.fillStyle = '#cfeaff';
    ctx.beginPath(); ctx.arc(z.r * 0.18, -z.r * 0.12, 1.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.18, z.r * 0.12, 1.6, 0, TAU); ctx.fill();
    // glowing eye core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(z.r * 0.18, -z.r * 0.12, 0.7, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.18, z.r * 0.12, 0.7, 0, TAU); ctx.fill();

    // motion blur streaks
    ctx.strokeStyle = `rgba(127,200,255,${flicker * 0.7})`;
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(-z.r * 0.7 - i * 2, (i - 1) * z.r * 0.3);
      ctx.lineTo(-z.r * 0.4, (i - 1) * z.r * 0.3);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ============================================================
  // 09 · BLOATER — walking toxic gas cloud
  // ============================================================
  function drawBloater(ctx, z) {
    const x = z.x, y = z.y, ang = z.angle || 0;
    const walk = z.walkPhase || 0;
    const sway = Math.sin(walk * TAU) * 1.8;

    shadow(ctx, x, y, z.r + 4, (z.r + 4) * 0.5);

    // toxic gas cloud aura
    const g = ctx.createRadialGradient(x, y, 4, x, y, z.r + 22);
    g.addColorStop(0, 'rgba(142,197,71,0.45)');
    g.addColorStop(0.5, 'rgba(110,160,55,0.22)');
    g.addColorStop(1, 'rgba(74,107,34,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, z.r + 22, 0, TAU);
    ctx.fill();

    // gas puff blobs orbiting
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + walk * 1.5;
      const dx = Math.cos(a) * (z.r + 14);
      const dy = Math.sin(a) * (z.r + 14);
      ctx.fillStyle = `rgba(142,197,71,${0.35 - (i % 2) * 0.1})`;
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, z.r * 0.25, 0, TAU);
      ctx.fill();
    }

    // small legs
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = C.rotLo;
    ctx.fillRect(-z.r * 0.5, 4, 4, 7);
    ctx.fillRect(z.r * 0.0, 4, 4, 7);
    ctx.restore();

    ctx.save(); ctx.translate(x + sway, y); ctx.rotate(ang);
    // massive bulbous body — uneven, lumpy
    ctx.fillStyle = C.rotLo;
    ctx.beginPath();
    ctx.ellipse(0, 0, z.r * 1.1, z.r * 1.0, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.rot;
    ctx.beginPath();
    ctx.ellipse(0, 0, z.r * 1.0, z.r * 0.9, 0, 0, TAU);
    ctx.fill();
    // lumps on the surface
    [[z.r * 0.4, -z.r * 0.3], [-z.r * 0.3, z.r * 0.5],
     [z.r * 0.1, z.r * 0.55], [-z.r * 0.4, -z.r * 0.3]].forEach(([dx, dy]) => {
      ctx.fillStyle = C.rotHi;
      ctx.beginPath();
      ctx.arc(dx, dy, z.r * 0.18, 0, TAU);
      ctx.fill();
    });
    // gas geysers — cracks oozing green
    ctx.fillStyle = C.toxic;
    ctx.beginPath();
    ctx.arc(z.r * 0.5, 0, z.r * 0.12, 0, TAU); ctx.fill();
    ctx.beginPath();
    ctx.arc(-z.r * 0.2, -z.r * 0.6, z.r * 0.1, 0, TAU); ctx.fill();
    // green slime drip lines
    ctx.strokeStyle = C.toxicLight;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(z.r * 0.5, 0); ctx.lineTo(z.r * 0.65, z.r * 0.2);
    ctx.moveTo(-z.r * 0.2, -z.r * 0.6); ctx.lineTo(-z.r * 0.25, -z.r * 0.85);
    ctx.stroke();
    // tiny head buried in fat
    ctx.fillStyle = C.rotLo;
    ctx.beginPath();
    ctx.arc(z.r * 0.7, 0, z.r * 0.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.warn;
    ctx.beginPath();
    ctx.arc(z.r * 0.78, -z.r * 0.06, 0.9, 0, TAU); ctx.fill();
    ctx.beginPath();
    ctx.arc(z.r * 0.78, z.r * 0.06, 0.9, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ============================================================
  // 10 · FROST WALKER — slow, ice shield, slows on hit
  // ============================================================
  function drawFrostWalker(ctx, z) {
    const x = z.x, y = z.y, ang = z.angle || 0;
    const walk = z.walkPhase || 0;
    const legSwing = Math.sin(walk * TAU) * 2.5;
    shadow(ctx, x, y, z.r - 1, (z.r - 1) * 0.45);

    // frost ring on ground
    ctx.fillStyle = 'rgba(168,216,232,0.18)';
    ctx.beginPath();
    ctx.arc(x, y, z.r + 6, 0, TAU);
    ctx.fill();
    // frost crystal spikes around feet
    ctx.fillStyle = C.frost;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + walk * 0.3;
      const px = x + Math.cos(a) * (z.r + 2);
      const py = y + Math.sin(a) * (z.r + 2);
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(a) * 4, py + Math.sin(a) * 4);
      ctx.lineTo(px + Math.cos(a + 0.3) * 1.5, py + Math.sin(a + 0.3) * 1.5);
      ctx.closePath(); ctx.fill();
    }

    ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = C.frostDeep;
    ctx.fillRect(-5, 1 + legSwing, 4, 6);
    ctx.fillRect(1, 1 - legSwing, 4, 6);
    ctx.restore();

    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    // pale icy body
    ctx.fillStyle = C.frostDeep;
    ctx.beginPath();
    ctx.ellipse(0, 0, z.r * 0.85, z.r * 0.75, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#8ab4cc';
    ctx.beginPath();
    ctx.ellipse(0, 0, z.r * 0.78, z.r * 0.68, 0, 0, TAU);
    ctx.fill();
    // ice crystal shell on back/shoulders
    ctx.fillStyle = C.frost;
    [[-z.r * 0.3, -z.r * 0.5], [-z.r * 0.4, 0], [-z.r * 0.3, z.r * 0.5],
     [-z.r * 0.55, -z.r * 0.25], [-z.r * 0.55, z.r * 0.25]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(dx, dy);
      ctx.lineTo(dx - 3, dy - 4);
      ctx.lineTo(dx - 5, dy);
      ctx.lineTo(dx - 3, dy + 4);
      ctx.closePath(); ctx.fill();
    });
    // arms
    ctx.fillStyle = '#8ab4cc';
    ctx.beginPath();
    ctx.ellipse(z.r * 0.5, -z.r * 0.45, z.r * 0.42, z.r * 0.22, -0.3, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(z.r * 0.5, z.r * 0.45, z.r * 0.42, z.r * 0.22, 0.3, 0, TAU);
    ctx.fill();
    // claws
    ctx.fillStyle = C.frost;
    ctx.beginPath(); ctx.arc(z.r * 0.85, -z.r * 0.5, 1.4, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.85, z.r * 0.5, 1.4, 0, TAU); ctx.fill();
    // head — frosted over
    ctx.fillStyle = '#8ab4cc';
    ctx.beginPath();
    ctx.arc(0, 0, z.r * 0.5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.frost;
    ctx.beginPath();
    ctx.arc(0, 0, z.r * 0.5, Math.PI * 0.5, Math.PI * 1.5);
    ctx.lineTo(0, 0);
    ctx.closePath(); ctx.fill();
    // glowing pale blue eyes
    ctx.fillStyle = '#cfeaff';
    ctx.beginPath(); ctx.arc(z.r * 0.28, -z.r * 0.14, 1.3, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.28, z.r * 0.14, 1.3, 0, TAU); ctx.fill();
    // mouth: cracked ice
    ctx.strokeStyle = C.frostDeep;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(z.r * 0.32, -z.r * 0.05);
    ctx.lineTo(z.r * 0.42, 0);
    ctx.lineTo(z.r * 0.32, z.r * 0.05);
    ctx.stroke();
    ctx.restore();
  }

  // ============================================================
  // 11 · MIMIC — disguised as a pickup crate
  // ============================================================
  function drawMimic(ctx, z) {
    const x = z.x, y = z.y;
    const t = z.walkPhase || 0;
    // we use z.angle as 'mode': 0..1 closed→open
    const open = Math.max(0, Math.min(1, z.angle || 0));
    shadow(ctx, x, y, z.r, z.r * 0.45);

    // crate base — looks like a pickup
    ctx.fillStyle = '#1c1f25';
    ctx.beginPath();
    ctx.arc(x, y, z.r, 0, TAU); ctx.fill();
    ctx.strokeStyle = C.bone;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // inner ring like real pickup
    ctx.strokeStyle = 'rgba(232,230,223,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, z.r - 3, 0, TAU);
    ctx.stroke();
    // ammo box silhouette in middle (decoy)
    ctx.fillStyle = C.warn;
    for (let i = -1; i <= 1; i++) {
      ctx.fillRect(x + i * 4 - 1.5, y - 4, 3, 7);
      ctx.fillStyle = '#a8782a';
      ctx.fillRect(x + i * 4 - 1.5, y + 1, 3, 2);
      ctx.fillStyle = C.warn;
    }

    // crack opening across middle (grows with `open`)
    if (open > 0.05) {
      ctx.fillStyle = '#1a0a0a';
      ctx.save();
      ctx.translate(x, y);
      ctx.beginPath();
      ctx.ellipse(0, 0, z.r * 0.85, z.r * 0.7 * open, 0, 0, TAU);
      ctx.fill();
      // teeth along open jaw (top + bottom rows)
      ctx.fillStyle = C.bone;
      const teeth = 8;
      for (let i = 0; i < teeth; i++) {
        const tx = -z.r * 0.7 + (i / (teeth - 1)) * z.r * 1.4;
        ctx.beginPath();
        ctx.moveTo(tx - 1, -z.r * 0.6 * open);
        ctx.lineTo(tx + 1, -z.r * 0.6 * open);
        ctx.lineTo(tx, -z.r * 0.3 * open);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(tx - 1, z.r * 0.6 * open);
        ctx.lineTo(tx + 1, z.r * 0.6 * open);
        ctx.lineTo(tx, z.r * 0.3 * open);
        ctx.closePath(); ctx.fill();
      }
      // tongue
      if (open > 0.4) {
        ctx.fillStyle = C.fleshHi;
        ctx.beginPath();
        ctx.ellipse(z.r * 0.5, 0, z.r * 0.4, z.r * 0.2 * open, 0, 0, TAU);
        ctx.fill();
        ctx.fillStyle = C.bloodDeep;
        ctx.beginPath();
        ctx.ellipse(z.r * 0.5, 0, z.r * 0.3, z.r * 0.08 * open, 0, 0, TAU);
        ctx.fill();
      }
      // single watching eye
      ctx.fillStyle = C.blood;
      ctx.beginPath();
      ctx.arc(-z.r * 0.4, -z.r * 0.4 * open - 1, 1.8, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ffd84a';
      ctx.beginPath();
      ctx.arc(-z.r * 0.4, -z.r * 0.4 * open - 1, 0.9, 0, TAU); ctx.fill();
      ctx.restore();
    } else {
      // shimmer "tell" when closed (subtle flicker)
      const f = Math.sin(t * 20) * 0.5 + 0.5;
      ctx.strokeStyle = `rgba(210,75,53,${f * 0.4})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(x, y, z.r - 1, 0, TAU);
      ctx.stroke();
    }
  }

  // ============================================================
  // 12 · CENTIPEDE — long segmented boss
  // ============================================================
  function drawCentipede(ctx, z) {
    const t = z.walkPhase || 0;
    const segs = z.segments || 7;
    const baseAng = z.angle || 0;
    // serpentine: each segment offset by sine
    const segR = z.r * 0.7;
    const segSpacing = z.r * 1.05;

    // path: head at (x,y), tail trails back
    // We approximate winding via sine wave behind head.
    for (let i = segs - 1; i >= 0; i--) {
      const back = i * segSpacing;
      const wind = Math.sin(t * TAU - i * 0.6) * z.r * 0.45;
      const sx = z.x - Math.cos(baseAng) * back + Math.cos(baseAng + Math.PI / 2) * wind;
      const sy = z.y - Math.sin(baseAng) * back + Math.sin(baseAng + Math.PI / 2) * wind;
      shadow(ctx, sx, sy, segR * 1.1, segR * 0.5);
      // segment body
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(baseAng + Math.sin(t * TAU - i * 0.6) * 0.3);
      // legs (pair per segment)
      ctx.strokeStyle = C.rotLo;
      ctx.lineWidth = 1.5;
      const legSwing = Math.sin(t * TAU - i * 0.5);
      [[-segR * 0.8, -segR * 1.0 - legSwing * 2], [segR * 0.8, -segR * 1.0 + legSwing * 2],
       [-segR * 0.8, segR * 1.0 + legSwing * 2], [segR * 0.8, segR * 1.0 - legSwing * 2]
      ].forEach(([lx, ly]) => {
        ctx.beginPath();
        ctx.moveTo(lx * 0.4, ly * 0.5);
        ctx.lineTo(lx, ly);
        ctx.stroke();
      });
      // dark base
      ctx.fillStyle = C.rotLo;
      ctx.beginPath();
      ctx.ellipse(0, 0, segR, segR * 0.85, 0, 0, TAU); ctx.fill();
      // chitin plate
      ctx.fillStyle = i === 0 ? C.bloodDeep : C.rot;
      ctx.beginPath();
      ctx.ellipse(0, 0, segR * 0.88, segR * 0.75, 0, 0, TAU); ctx.fill();
      // ridges
      ctx.strokeStyle = C.rotLo;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(-segR * 0.8, -segR * 0.3); ctx.lineTo(segR * 0.8, -segR * 0.3);
      ctx.moveTo(-segR * 0.8, segR * 0.3); ctx.lineTo(segR * 0.8, segR * 0.3);
      ctx.stroke();
      // glowing pustule on top
      ctx.fillStyle = i % 2 === 0 ? C.bile : C.bileHi;
      ctx.beginPath();
      ctx.arc(0, 0, segR * 0.2, 0, TAU); ctx.fill();
      if (i === 0) {
        // HEAD segment — mandibles + eyes
        ctx.fillStyle = C.bone;
        // mandibles
        ctx.beginPath();
        ctx.moveTo(segR * 0.6, -segR * 0.45);
        ctx.lineTo(segR * 1.3, -segR * 0.1);
        ctx.lineTo(segR * 0.65, -segR * 0.05);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(segR * 0.6, segR * 0.45);
        ctx.lineTo(segR * 1.3, segR * 0.1);
        ctx.lineTo(segR * 0.65, segR * 0.05);
        ctx.closePath(); ctx.fill();
        // 4 eyes
        ctx.fillStyle = C.warn;
        ctx.beginPath(); ctx.arc(segR * 0.35, -segR * 0.3, 1.2, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(segR * 0.35, segR * 0.3, 1.2, 0, TAU); ctx.fill();
        ctx.fillStyle = C.blood;
        ctx.beginPath(); ctx.arc(segR * 0.45, -segR * 0.12, 0.9, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(segR * 0.45, segR * 0.12, 0.9, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  }

  // ============================================================
  // 13 · HATCHLING — small crawler spawn (from cluster)
  // ============================================================
  function drawHatchling(ctx, z) {
    const x = z.x, y = z.y, ang = z.angle || 0;
    const walk = z.walkPhase || 0;
    shadow(ctx, x, y, z.r + 1, (z.r + 1) * 0.3);

    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    // 4 stubby legs
    ctx.strokeStyle = C.fleshLo;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
      const sign = i < 2 ? -1 : 1;
      const side = (i % 2) ? -1 : 1;
      const swing = Math.sin(walk * TAU + i) * 0.4;
      ctx.beginPath();
      ctx.moveTo(sign * z.r * 0.3, side * z.r * 0.3);
      ctx.lineTo(sign * z.r * 0.8 + swing, side * z.r * 0.8 + swing);
      ctx.stroke();
    }
    // tiny body — wet bulb
    ctx.fillStyle = C.fleshLo;
    ctx.beginPath();
    ctx.ellipse(0, 0, z.r * 0.9, z.r * 0.7, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = C.fleshHi;
    ctx.beginPath();
    ctx.ellipse(-z.r * 0.1, -z.r * 0.15, z.r * 0.5, z.r * 0.35, 0, 0, TAU); ctx.fill();
    // single big red eye
    ctx.fillStyle = C.blood;
    ctx.beginPath(); ctx.arc(z.r * 0.4, 0, z.r * 0.25, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd84a';
    ctx.beginPath(); ctx.arc(z.r * 0.45, -z.r * 0.05, z.r * 0.12, 0, TAU); ctx.fill();
    // tiny mandibles
    ctx.fillStyle = C.bone;
    ctx.beginPath();
    ctx.moveTo(z.r * 0.55, -z.r * 0.1);
    ctx.lineTo(z.r * 0.8, 0);
    ctx.lineTo(z.r * 0.55, z.r * 0.1);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // ============================================================
  // 14 · CONJOINED — two zombies fused back-to-back
  // ============================================================
  function drawConjoined(ctx, z) {
    const x = z.x, y = z.y, ang = z.angle || 0;
    const walk = z.walkPhase || 0;
    const legSwing = Math.sin(walk * TAU) * 2;
    shadow(ctx, x, y, z.r + 3, (z.r + 3) * 0.45);

    // legs (4 — two pair)
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang + Math.PI / 2);
    ctx.fillStyle = C.walkerRag;
    ctx.fillRect(-z.r * 0.5, 1 + legSwing, 4, 6);
    ctx.fillRect(z.r * 0.1, 1 - legSwing, 4, 6);
    ctx.fillRect(-z.r * 0.5, -7 - legSwing, 4, 6);
    ctx.fillRect(z.r * 0.1, -7 + legSwing, 4, 6);
    ctx.restore();

    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    // fused torso (elongated horizontal ellipse)
    ctx.fillStyle = C.walkerRag;
    ctx.beginPath();
    ctx.ellipse(0, 0, z.r * 1.1, z.r * 0.75, 0, 0, TAU);
    ctx.fill();
    // shared belly seam in middle
    ctx.fillStyle = C.fleshLo;
    ctx.fillRect(-z.r * 0.15, -z.r * 0.5, z.r * 0.3, z.r);
    ctx.strokeStyle = C.fleshHi;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, -z.r * 0.5);
    for (let i = 0; i <= 6; i++) {
      const yy = -z.r * 0.5 + (i / 6) * z.r;
      const ix = (i % 2 === 0) ? -1 : 1;
      ctx.lineTo(ix, yy);
    }
    ctx.stroke();

    // FORWARD head + arms
    ctx.fillStyle = C.walkerSkin;
    ctx.beginPath();
    ctx.ellipse(z.r * 0.7, -z.r * 0.45, z.r * 0.4, z.r * 0.22, -0.3, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(z.r * 0.7, z.r * 0.45, z.r * 0.4, z.r * 0.22, 0.3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.walkerSkin;
    ctx.beginPath();
    ctx.arc(z.r * 0.75, 0, z.r * 0.42, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd84a';
    ctx.beginPath(); ctx.arc(z.r * 0.95, -z.r * 0.12, 1.1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.95, z.r * 0.12, 1.1, 0, TAU); ctx.fill();
    ctx.fillStyle = C.walkerBlood || '#5a1a14';
    ctx.beginPath(); ctx.arc(z.r * 1.0, 0, z.r * 0.15, 0, TAU); ctx.fill();

    // BACKWARD head + arms (mirrored)
    ctx.fillStyle = C.walkerSkin;
    ctx.beginPath();
    ctx.ellipse(-z.r * 0.7, -z.r * 0.45, z.r * 0.4, z.r * 0.22, 0.3, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-z.r * 0.7, z.r * 0.45, z.r * 0.4, z.r * 0.22, -0.3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.walkerSkin;
    ctx.beginPath();
    ctx.arc(-z.r * 0.75, 0, z.r * 0.42, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ffd84a';
    ctx.beginPath(); ctx.arc(-z.r * 0.95, -z.r * 0.12, 1.1, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(-z.r * 0.95, z.r * 0.12, 1.1, 0, TAU); ctx.fill();
    ctx.fillStyle = C.walkerBlood || '#5a1a14';
    ctx.beginPath(); ctx.arc(-z.r * 1.0, 0, z.r * 0.15, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ============================================================
  // 15 · JUGGERNAUT — heavy frontal-armor walker (Phase 2.1)
  // Reads frontDR via the existing Riot damage path — sprite leaves the back
  // visibly exposed so the player can read "shoot from behind".
  // ============================================================
  function drawJuggernaut(ctx, z) {
    const x = z.x, y = z.y, ang = z.angle || 0;
    const walk = z.walkPhase || 0;
    shadow(ctx, x, y, z.r + 4, (z.r + 4) * 0.5);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    // Big lumbering frame — exposed back first so the front plates overlay it.
    ctx.fillStyle = C.walkerSkinLo;
    ctx.beginPath();
    ctx.ellipse(0, 0, z.r * 1.0, z.r * 0.92, 0, 0, TAU);
    ctx.fill();
    // Back / spine — visible exposed skin and a torn shirt strap. This is
    // the visual tell that the rear is the weak point.
    ctx.fillStyle = C.walkerSkin;
    ctx.beginPath();
    ctx.ellipse(-z.r * 0.45, 0, z.r * 0.55, z.r * 0.75, 0, 0, TAU);
    ctx.fill();
    // Stitched gash down the spine (red).
    ctx.strokeStyle = C.bloodDeep;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-z.r * 0.85, -z.r * 0.45);
    ctx.lineTo(-z.r * 0.75, z.r * 0.45);
    ctx.stroke();
    // Scrap-plate skirt around front + sides (3 welded panels).
    ctx.fillStyle = '#3a3a40';
    ctx.beginPath();
    ctx.moveTo(z.r * 0.95, -z.r * 0.85);
    ctx.lineTo(z.r * 1.05, z.r * 0.85);
    ctx.lineTo(-z.r * 0.05, z.r * 1.0);
    ctx.lineTo(-z.r * 0.1, -z.r * 1.0);
    ctx.closePath();
    ctx.fill();
    // Highlight + rivets on the chest plate
    ctx.strokeStyle = '#5a5a60';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(z.r * 0.95, -z.r * 0.85);
    ctx.lineTo(z.r * 1.05, z.r * 0.85);
    ctx.lineTo(-z.r * 0.05, z.r * 1.0);
    ctx.lineTo(-z.r * 0.1, -z.r * 1.0);
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = '#1a1a1c';
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(z.r * 0.6, i * z.r * 0.32, 1, 0, TAU);
      ctx.fill();
    }
    // Welded shoulder pauldrons
    ctx.fillStyle = '#2a2a30';
    ctx.beginPath();
    ctx.ellipse(z.r * 0.2, -z.r * 0.85, z.r * 0.45, z.r * 0.3, -0.2, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(z.r * 0.2, z.r * 0.85, z.r * 0.45, z.r * 0.3, 0.2, 0, TAU);
    ctx.fill();
    // Welded helmet — small slit, glowing eyes through.
    ctx.fillStyle = '#1c1c20';
    ctx.beginPath();
    ctx.arc(z.r * 0.7, 0, z.r * 0.45, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#4a4a50';
    ctx.lineWidth = 1.1;
    ctx.stroke();
    // Eye slit + red glow
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(z.r * 0.78, -z.r * 0.18, z.r * 0.18, z.r * 0.36);
    ctx.fillStyle = C.bloodLight;
    ctx.beginPath();
    ctx.arc(z.r * 0.88, -z.r * 0.10, 1.4, 0, TAU); ctx.fill();
    ctx.beginPath();
    ctx.arc(z.r * 0.88,  z.r * 0.10, 1.4, 0, TAU); ctx.fill();
    // Heavy boots (lumbering walk cycle)
    const lph = Math.sin(walk * TAU);
    ctx.fillStyle = '#1a1a1c';
    ctx.fillRect(-z.r * 0.95, -z.r * 0.55 + lph * 1.5, z.r * 0.5, z.r * 0.25);
    ctx.fillRect(-z.r * 0.95,  z.r * 0.32 - lph * 1.5, z.r * 0.5, z.r * 0.25);
    ctx.restore();
  }

  // ============================================================
  // 16 · LEAPER — low spider-crawler that hops walls (Phase 2.2)
  // Coiled when leapTelegraph > 0; airborne when leaping is true.
  // ============================================================
  function drawLeaper(ctx, z) {
    const x = z.x, y = z.y, ang = z.angle || 0;
    const walk = z.walkPhase || 0;
    const coiled = (z.leapTelegraph || 0) > 0;
    const airborne = !!z.leaping;
    // No ground shadow while airborne — it should read as off the ground.
    if (!airborne) shadow(ctx, x, y, z.r + 1, (z.r + 1) * 0.45);
    else {
      // small offset shadow far below
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.ellipse(x, y + z.r * 1.4, z.r * 0.7, z.r * 0.3, 0, 0, TAU);
      ctx.fill();
    }
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const armScale = coiled ? 0.55 : 1.0;
    const armPhase = airborne ? 0 : Math.sin(walk * TAU * 2) * 0.4;
    // 4 spider legs: 2 forward, 2 hind (longer)
    ctx.strokeStyle = '#1a1014';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 4; i++) {
      const side = i < 2 ? -1 : 1;
      const fwd = (i % 2 === 0) ? 1 : -1;
      const base = z.r * 0.2 * fwd;
      const reach = (fwd === 1 ? z.r * 0.9 : z.r * 1.1) * armScale;
      const wobble = armPhase * fwd * side;
      // bent middle joint
      const midX = base + reach * 0.55, midY = side * (z.r * 0.55 + wobble * 2);
      const tipX = base + reach,        tipY = side * (z.r * 0.85 + wobble * 4);
      ctx.beginPath();
      ctx.moveTo(0, side * z.r * 0.25);
      ctx.lineTo(midX, midY);
      ctx.lineTo(tipX, tipY);
      ctx.stroke();
    }
    // low slung body — squat oval
    ctx.fillStyle = '#2a1820';
    ctx.beginPath();
    ctx.ellipse(0, 0, z.r * 0.85 * (coiled ? 0.9 : 1), z.r * 0.55, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#3a2230';
    ctx.beginPath();
    ctx.ellipse(z.r * 0.15, 0, z.r * 0.5, z.r * 0.35, 0, 0, TAU);
    ctx.fill();
    // head/snout — pointed forward
    ctx.fillStyle = '#1a1014';
    ctx.beginPath();
    ctx.moveTo(z.r * 0.85, 0);
    ctx.lineTo(z.r * 0.35, -z.r * 0.3);
    ctx.lineTo(z.r * 0.35, z.r * 0.3);
    ctx.closePath();
    ctx.fill();
    // 4 spider eyes — yellow when stalking, red when coiled
    ctx.fillStyle = coiled ? C.blood : '#ffd84a';
    ctx.beginPath(); ctx.arc(z.r * 0.55, -z.r * 0.18, 1.0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.55,  z.r * 0.18, 1.0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.7,  -z.r * 0.08, 0.8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.7,   z.r * 0.08, 0.8, 0, TAU); ctx.fill();
    // pre-leap telegraph: small upward chevron behind the head
    if (coiled) {
      ctx.strokeStyle = 'rgba(210,75,53,0.7)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-z.r * 0.4, -z.r * 0.5);
      ctx.lineTo(-z.r * 0.6, -z.r * 0.85);
      ctx.lineTo(-z.r * 0.4, -z.r * 0.5);
      ctx.lineTo(-z.r * 0.2, -z.r * 0.85);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ============================================================
  // 17 · THORN HUSK — disguised tree ambusher (Phase 2.3)
  // While `disguised` we render a stylized pine. Once triggered (mimicOpen
  // ramps to 1 in tier3PreTick), unfold into a thorn-covered humanoid.
  // ============================================================
  function drawThornHusk(ctx, z) {
    const x = z.x, y = z.y;
    const open = Math.max(0, Math.min(1, z.angle || 0));
    const t = z.walkPhase || 0;
    shadow(ctx, x, y, z.r + 2, (z.r + 2) * 0.55);
    if (open < 0.05) {
      // ---- TREE DISGUISE (matches the pine style in sprites.js) ----
      const r = z.r * 1.25;
      // trunk
      ctx.fillStyle = '#2c1a08';
      ctx.fillRect(x - 2, y + 2, 4, 9);
      // canopy shadow
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.beginPath();
      ctx.moveTo(x + 2, y - r + 2);
      ctx.lineTo(x + r + 2, y + r * 0.85 + 2);
      ctx.lineTo(x - r + 2, y + r * 0.85 + 2);
      ctx.closePath(); ctx.fill();
      // dark tier
      ctx.fillStyle = '#1a3a14';
      ctx.beginPath();
      ctx.moveTo(x, y - r);
      ctx.lineTo(x + r, y + r * 0.85);
      ctx.lineTo(x - r, y + r * 0.85);
      ctx.closePath(); ctx.fill();
      // bright tier
      ctx.fillStyle = '#2a5a24';
      ctx.beginPath();
      ctx.moveTo(x, y - r * 0.65);
      ctx.lineTo(x + r * 0.75, y + r * 0.55);
      ctx.lineTo(x - r * 0.75, y + r * 0.55);
      ctx.closePath(); ctx.fill();
      // top highlight
      ctx.fillStyle = '#3a7a30';
      ctx.beginPath();
      ctx.moveTo(x, y - r * 0.35);
      ctx.lineTo(x + r * 0.45, y + r * 0.25);
      ctx.lineTo(x - r * 0.45, y + r * 0.25);
      ctx.closePath(); ctx.fill();
      // subtle red blink hidden in the leaves — the "tell"
      const f = (Math.sin(t * 4) + 1) * 0.5;
      ctx.fillStyle = `rgba(210,60,40,${f * 0.45})`;
      ctx.beginPath(); ctx.arc(x + 1, y - r * 0.15, 1.2, 0, TAU); ctx.fill();
      return;
    }
    // ---- UNFOLDED THORN HUSK (humanoid in bark armor) ----
    const ang = z.angle ? Math.PI * 0.0 : 0; // face out (open is angle 0..1)
    ctx.save(); ctx.translate(x, y);
    // bark-armored torso
    ctx.fillStyle = '#3a2418';
    ctx.beginPath();
    ctx.ellipse(0, 0, z.r * 0.85, z.r * 0.75, ang, 0, TAU);
    ctx.fill();
    // moss / lichen patches
    ctx.fillStyle = '#4a6a30';
    ctx.beginPath();
    ctx.ellipse(-z.r * 0.3, -z.r * 0.2, z.r * 0.25, z.r * 0.12, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(z.r * 0.2, z.r * 0.3, z.r * 0.18, z.r * 0.1, 0, 0, TAU);
    ctx.fill();
    // gnarled bark cracks
    ctx.strokeStyle = '#1a0e08';
    ctx.lineWidth = 1.0;
    ctx.beginPath();
    ctx.moveTo(-z.r * 0.5, -z.r * 0.4); ctx.lineTo(z.r * 0.3, z.r * 0.5);
    ctx.moveTo(z.r * 0.2, -z.r * 0.6); ctx.lineTo(-z.r * 0.2, z.r * 0.4);
    ctx.stroke();
    // 6 thorny spikes radiating outward — animate slight opening with `open`
    ctx.fillStyle = '#5e4a2a';
    ctx.strokeStyle = '#1a0e08';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.2;
      const reach = z.r * (0.7 + 0.5 * open);
      const baseR = z.r * 0.55;
      const baseX = Math.cos(a) * baseR, baseY = Math.sin(a) * baseR;
      const tipX  = Math.cos(a) * reach, tipY  = Math.sin(a) * reach;
      const perpX = -Math.sin(a) * 2.2,  perpY =  Math.cos(a) * 2.2;
      ctx.beginPath();
      ctx.moveTo(baseX + perpX, baseY + perpY);
      ctx.lineTo(tipX, tipY);
      ctx.lineTo(baseX - perpX, baseY - perpY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    // bleeding-red claws (two forward arms)
    ctx.fillStyle = C.bloodDeep;
    ctx.beginPath();
    ctx.ellipse(z.r * 0.85 * open, -z.r * 0.5, z.r * 0.18, z.r * 0.08, -0.4, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(z.r * 0.85 * open,  z.r * 0.5, z.r * 0.18, z.r * 0.08,  0.4, 0, TAU);
    ctx.fill();
    // claw tips
    ctx.fillStyle = C.bloodLight;
    for (let s = -1; s <= 1; s += 2) {
      ctx.beginPath();
      ctx.arc(z.r * 1.0 * open, s * z.r * 0.5, 1.4, 0, TAU);
      ctx.fill();
    }
    // gaping red eye-slit
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(z.r * 0.25, -z.r * 0.18, z.r * 0.3, z.r * 0.36);
    ctx.fillStyle = C.blood;
    ctx.beginPath();
    ctx.arc(z.r * 0.4, -z.r * 0.05, 1.6, 0, TAU); ctx.fill();
    ctx.beginPath();
    ctx.arc(z.r * 0.4,  z.r * 0.05, 1.6, 0, TAU); ctx.fill();
    ctx.restore();
  }

  // ============================================================
  // 18 · PLAGUE RAT — tiny infection-swarmer (Phase 2.4)
  // ============================================================
  function drawPlagueRat(ctx, z) {
    const x = z.x, y = z.y, ang = z.angle || 0;
    const t = z.walkPhase || 0;
    shadow(ctx, x, y, z.r + 1, (z.r + 1) * 0.45);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    // tiny dark blob body
    ctx.fillStyle = '#1a1410';
    ctx.beginPath();
    ctx.ellipse(0, 0, z.r * 1.1, z.r * 0.8, 0, 0, TAU);
    ctx.fill();
    // back highlight (wet/diseased sheen)
    ctx.fillStyle = '#3a2418';
    ctx.beginPath();
    ctx.ellipse(-z.r * 0.1, -z.r * 0.25, z.r * 0.75, z.r * 0.3, 0, 0, TAU);
    ctx.fill();
    // tail — thin curl behind
    ctx.strokeStyle = '#3a2820';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-z.r * 0.9, 0);
    const tailWob = Math.sin(t * TAU * 2) * z.r * 0.5;
    ctx.quadraticCurveTo(-z.r * 1.6, tailWob, -z.r * 2.2, -tailWob * 0.6);
    ctx.stroke();
    // ear nubs
    ctx.fillStyle = '#1a1410';
    ctx.beginPath();
    ctx.arc(z.r * 0.25, -z.r * 0.5, 1.4, 0, TAU); ctx.fill();
    ctx.beginPath();
    ctx.arc(z.r * 0.25,  z.r * 0.5, 1.4, 0, TAU); ctx.fill();
    // 2 yellow eye pixels
    ctx.fillStyle = '#ffd84a';
    ctx.beginPath(); ctx.arc(z.r * 0.7, -z.r * 0.25, 0.9, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.7,  z.r * 0.25, 0.9, 0, TAU); ctx.fill();
    // tiny green sickness puff occasionally
    if ((t * 13 | 0) % 7 === 0) {
      ctx.fillStyle = 'rgba(140,180,60,0.4)';
      ctx.beginPath();
      ctx.arc(-z.r * 0.5, -z.r * 0.7, 1.4, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // ============================================================
  // 19 · STAG — wildlife charger (Phase 2.5)
  // Top-down deer/elk silhouette. When chargeState === 'charging' the
  // antlers tilt forward and a dust trail streams behind.
  // ============================================================
  function drawStag(ctx, z) {
    const x = z.x, y = z.y, ang = z.angle || 0;
    const walk = z.walkPhase || 0;
    const charging = z.chargeState === 'charging';
    const telegraph = z.chargeState === 'telegraph';
    shadow(ctx, x, y, z.r + 3, (z.r + 3) * 0.45);
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    // dust trail when charging
    if (charging) {
      ctx.fillStyle = 'rgba(190,170,140,0.45)';
      for (let i = 0; i < 5; i++) {
        const dt2 = (walk + i * 0.18) % 1;
        ctx.beginPath();
        ctx.arc(-z.r * (1 + dt2 * 1.0), (i - 2) * 2.5,
                z.r * 0.36 * (1 - dt2), 0, TAU);
        ctx.fill();
      }
    }
    // 4 legs — alternating stride
    const stride = Math.sin(walk * TAU);
    ctx.fillStyle = '#3a2418';
    ctx.fillRect(z.r * 0.2, -z.r * 0.75 + stride * 1.5, z.r * 0.2, z.r * 0.35);
    ctx.fillRect(z.r * 0.2,  z.r * 0.4  - stride * 1.5, z.r * 0.2, z.r * 0.35);
    ctx.fillRect(-z.r * 0.4, -z.r * 0.7 - stride * 1.5, z.r * 0.2, z.r * 0.35);
    ctx.fillRect(-z.r * 0.4,  z.r * 0.35 + stride * 1.5, z.r * 0.2, z.r * 0.35);
    // body — long brown ellipse
    ctx.fillStyle = '#7a5238';
    ctx.beginPath();
    ctx.ellipse(0, 0, z.r * 1.05, z.r * 0.55, 0, 0, TAU);
    ctx.fill();
    // back highlight
    ctx.fillStyle = '#8a6a44';
    ctx.beginPath();
    ctx.ellipse(-z.r * 0.1, -z.r * 0.18, z.r * 0.85, z.r * 0.25, 0, 0, TAU);
    ctx.fill();
    // white belly patch (visible from above where the legs meet)
    ctx.fillStyle = '#d4c8a8';
    ctx.beginPath();
    ctx.ellipse(-z.r * 0.2, z.r * 0.05, z.r * 0.45, z.r * 0.18, 0, 0, TAU);
    ctx.fill();
    // tail — short white flag
    ctx.fillStyle = '#e8e0c8';
    ctx.beginPath();
    ctx.arc(-z.r * 0.95, 0, z.r * 0.16, 0, TAU);
    ctx.fill();
    // neck + head — slimmer ellipse forward
    ctx.fillStyle = '#7a5238';
    ctx.beginPath();
    ctx.ellipse(z.r * 0.75, 0, z.r * 0.38, z.r * 0.3, 0, 0, TAU);
    ctx.fill();
    // muzzle
    ctx.fillStyle = '#4a3018';
    ctx.beginPath();
    ctx.ellipse(z.r * 1.05, 0, z.r * 0.16, z.r * 0.14, 0, 0, TAU);
    ctx.fill();
    // dark eye
    ctx.fillStyle = '#1a0a08';
    ctx.beginPath(); ctx.arc(z.r * 0.85, -z.r * 0.16, 1.0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(z.r * 0.85,  z.r * 0.16, 1.0, 0, TAU); ctx.fill();
    // ANTLERS — 8-point rack. Tilted forward when charging.
    const tilt = charging ? -0.6 : (telegraph ? -0.3 : 0);
    ctx.strokeStyle = '#d8c8a4';
    ctx.lineWidth = 1.7;
    for (let s = -1; s <= 1; s += 2) {
      const baseX = z.r * 0.65, baseY = s * z.r * 0.22;
      // main beam
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(baseX + Math.cos(tilt) * z.r * 0.5,
                 baseY + s * z.r * 0.55 + Math.sin(tilt) * z.r * 0.2);
      ctx.lineTo(baseX + Math.cos(tilt) * z.r * 0.95,
                 baseY + s * z.r * 0.85 + Math.sin(tilt) * z.r * 0.35);
      ctx.stroke();
      // 4 tines per side
      for (let k = 0; k < 4; k++) {
        const along = 0.25 + k * 0.22;
        const tx = baseX + Math.cos(tilt) * z.r * along;
        const ty = baseY + s * z.r * (0.18 + along * 0.7) + Math.sin(tilt) * z.r * along * 0.4;
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.lineTo(tx + Math.cos(tilt + s * 0.5) * z.r * 0.32,
                   ty + s * z.r * 0.25 + Math.sin(tilt + s * 0.5) * z.r * 0.18);
        ctx.stroke();
      }
    }
    // Telegraph: small ground scuff in front
    if (telegraph && Math.random() < 0.5) {
      ctx.fillStyle = 'rgba(160,140,110,0.5)';
      const sx = z.r * 1.2 + (Math.random() - 0.5) * 4;
      const sy = (Math.random() - 0.5) * z.r * 0.8;
      const sr = 1.2 + Math.random() * 1.2;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  // ============================================================
  // DATA
  // ============================================================
  const ENEMIES = [
    { id: 'cluster', name: 'INFECTION CLUSTER', tag: 'SPAWNER',
      role: 'stationary', threat: 'STRUCTURE',
      stat: ['hp 280', 'STATIONARY', 'spawns hatchlings', 'pulse 4s'],
      copy: 'Stationary biomass with a glowing toxic core. Every ~4s a node bulges and births a Hatchling that defends the cluster. Tendrils heal it slowly. Kill the core or every visible node to put it down.',
      draw: drawInfectionCluster, r: 28, hp: 220, maxHp: 280, color: C.flesh },

    { id: 'hivesac', name: 'HIVE SAC', tag: 'EGG-BURST',
      role: 'stationary', threat: 'AMBUSH',
      stat: ['hp 40', 'bursts on hit', '5 hatchlings'],
      copy: 'A cluster of 6 translucent egg pods on the ground. Shoot anywhere on the sac and it ruptures, scattering 5 Hatchlings outward in a star pattern. Cheap to kill — risky to ignore.',
      draw: drawHiveSac, r: 18, hp: 40, maxHp: 40, color: C.flesh },

    { id: 'shrieker', name: 'SHRIEKER', tag: 'ALARM',
      role: 'stationary', threat: 'SUPPORT',
      stat: ['hp 50', 'pulses 2s', 'calls horde'],
      copy: 'Plant-like growth with four petals around a fanged mouth. Opens and roars on a 2-second cycle — each shriek spawns 2 walkers from the nearest world-edge. Silence it ASAP.',
      draw: drawShrieker, r: 20, hp: 50, maxHp: 50, color: C.flesh },

    { id: 'brood', name: 'BROOD MOTHER', tag: 'MINI-BOSS',
      role: 'moving', threat: 'SPAWN-WALKER',
      stat: ['hp 400', 'spd 35', 'spawns crawlers as it moves'],
      copy: 'Massive bloated multi-limbed horror with pulsing embryo sacs on her back. Every step has a chance to drop a Crawler. Slow but devastating up close — has four melee arms.',
      draw: drawBroodMother, r: 26, hp: 320, maxHp: 400, color: C.flesh },

    { id: 'necro', name: 'NECROMANCER', tag: 'SUPPORT',
      role: 'moving', threat: 'RES',
      stat: ['hp 90', 'spd 60', 'no melee', 'res every 6s'],
      copy: 'Hooded skeletal caster. Stays at the back of the horde. Every 6 seconds, raises one of your recently killed zombies back to half HP. Squishy if you can get to him.',
      draw: drawNecromancer, r: 15, hp: 75, maxHp: 90, color: C.purple },

    { id: 'charger', name: 'CHARGER', tag: 'LINE-DASH',
      role: 'moving', threat: 'DASH',
      stat: ['hp 150', 'spd 320 (charge)', 'stuns 1s'],
      copy: 'Hunches and locks onto your position, then bull-rushes in a straight line at 4× zombie speed. Hits stun you and knock you back. Side-stepping is the only counter — never face-on.',
      draw: drawCharger, r: 17, hp: 120, maxHp: 150, color: C.walkerSkin },

    { id: 'reaper', name: 'REAPER', tag: 'LONG-MELEE',
      role: 'moving', threat: 'MELEE',
      stat: ['hp 110', 'spd 70', 'reach 60', 'dmg 25'],
      copy: 'Gaunt cloaked figure with two long bony scythe arms. Has double the melee reach of any other enemy — can hit you over crates and through windows. Cinematic horror silhouette.',
      draw: drawReaper, r: 14, hp: 90, maxHp: 110, color: '#1a1418' },

    { id: 'stalker', name: 'STALKER', tag: 'CLOAKED',
      role: 'moving', threat: 'STEALTH',
      stat: ['hp 50', 'spd 130', 'invis until r<150'],
      copy: 'Mostly invisible — only glowing eyes + a glitching dashed outline give it away at range. Becomes fully visible inside 150px. Tense to play against — you hear it before you see it.',
      draw: drawStalker, r: 13, hp: 40, maxHp: 50, color: 'rgba(74,82,90,0.45)' },

    { id: 'bloater', name: 'BLOATER', tag: 'AURA',
      role: 'moving', threat: 'GAS',
      stat: ['hp 200', 'spd 45', 'aura 60', '3 dps inside'],
      copy: 'Walking toxic gas factory. Permanent green cloud around it that ticks you for 3 dps if you stand inside. On death, releases a much larger lingering cloud — explosives recommended at range.',
      draw: drawBloater, r: 22, hp: 160, maxHp: 200, color: C.rot },

    { id: 'frost', name: 'FROST WALKER', tag: 'SLOW',
      role: 'moving', threat: 'CC',
      stat: ['hp 80', 'spd 60', 'melee slows player 40%'],
      copy: 'Pale icy walker with a crystal shell along its back/shoulders. Hits don\'t damage much but each one chills the player for 2.5s. Multiple hits stack to a crawl. Fire weapons clear the shell faster.',
      draw: drawFrostWalker, r: 14, hp: 65, maxHp: 80, color: C.frost },

    { id: 'mimic', name: 'MIMIC', tag: 'TRAP',
      role: 'stationary', threat: 'AMBUSH',
      stat: ['hp 90', 'looks like pickup', 'bite dmg 30'],
      copy: 'Disguised as a pickup crate. Faint red shimmer is the only tell. If you walk close (or shoot it), the lid splits open — fanged maw with a tongue. One bite for 30 damage. Best with crossbow check-shots.',
      draw: drawMimic, r: 12, hp: 70, maxHp: 90, color: '#1c1f25' },

    { id: 'cent', name: 'CENTIPEDE', tag: 'BOSS',
      role: 'moving', threat: 'BOSS',
      stat: ['hp 600 (segments)', 'spd 90', 'mandible dmg 35'],
      copy: 'Seven-segment armored worm. Each segment is killable; head is the weakest, tail is hardiest. Loses segments visibly as it dies — gameplay readability built into the silhouette.',
      draw: drawCentipede, r: 18, hp: 480, maxHp: 600, color: C.rot, segments: 7 },

    { id: 'hatch', name: 'HATCHLING', tag: 'MICRO',
      role: 'moving', threat: 'SWARM',
      stat: ['hp 12', 'spd 180', 'dmg 4', 'r 7'],
      copy: 'Spawn of the Infection Cluster + Hive Sac + Brood Mother. Tiny one-eyed crawling bulb. Dies to one pellet but comes in big numbers — feels like ants.',
      draw: drawHatchling, r: 8, hp: 10, maxHp: 12, color: C.flesh },

    { id: 'twins', name: 'CONJOINED TWINS', tag: 'SPLIT',
      role: 'moving', threat: 'SPLIT',
      stat: ['hp 130', 'spd 60', 'dmg 12', 'splits into 2 walkers'],
      copy: 'Two walker-class zombies fused back-to-back, sharing a belly seam. On death, the seam tears and they split into two regular Walkers at 50% HP each. Punishes greedy AoE.',
      draw: drawConjoined, r: 16, hp: 100, maxHp: 130, color: C.walkerSkin },
  ];

  // ============================================================
  // PUBLIC
  // ============================================================
  root.ZBestiary = {
    palette: C,
    ENEMIES,
    draw: {
      cluster: drawInfectionCluster,
      hivesac: drawHiveSac,
      shrieker: drawShrieker,
      brood: drawBroodMother,
      necro: drawNecromancer,
      charger: drawCharger,
      reaper: drawReaper,
      stalker: drawStalker,
      bloater: drawBloater,
      frost: drawFrostWalker,
      mimic: drawMimic,
      cent: drawCentipede,
      hatch: drawHatchling,
      twins: drawConjoined,
      // ---------- Phase 2 ----------
      juggernaut: drawJuggernaut,
      leaper: drawLeaper,
      husk: drawThornHusk,
      rat: drawPlagueRat,
      stag: drawStag,
    },
  };
})(window);
