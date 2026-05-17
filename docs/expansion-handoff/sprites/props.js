// props.jsx — 36 furniture & world props, drawn in the same top-down
// procedural style as ZSprites. All draw fns are pure (ctx, {x,y,w,h})
// and live on window.ZProps so they can be lifted into sprites.js's
// drawObstacle() switch the same way ZExpand was.
//
// Layout: 6 sets of 6.
//   LIVING · BEDROOM/BATH · KITCHEN · WORK · PUBLIC · WORLD

(function (root) {
  'use strict';
  const TAU = Math.PI * 2;

  // ----- palette tokens -----
  const C = {
    ink: '#0b0c0e', bone: '#e8e6df', boneDim: '#bdbab1',
    blood: '#d24b35', warn: '#e3a83a', toxic: '#8ec547',
    elec: '#7fc8ff',

    // upholstery / fabric
    couchTeal: '#3a5f6a', couchTealHi: '#5a8794', couchTealLo: '#1c3640',
    couchTan: '#9a7a48', couchTanHi: '#bd9560', couchTanLo: '#4d3a1a',
    rug: '#7d3a45', rugHi: '#a45260', rugLo: '#3a1a20',
    cushion: '#e3a83a', cushion2: '#c83232',

    // wood
    wood: '#7a5a3a', woodHi: '#a4855a', woodLo: '#3a2818',
    woodLight: '#bd9560', woodLightHi: '#dabb88',

    // appliances
    white: '#d8d4c4', whiteHi: '#ece7d7', whiteLo: '#8a877c',
    metal: '#7e858f', metalHi: '#a3a4ac', metalLo: '#43464d',
    chrome: '#c4cad2',

    // paint
    navy: '#28384a', navyHi: '#3a536e', navyLo: '#10182a',
    forest: '#324d36', forestHi: '#4e7252', forestLo: '#1a2a1a',
    cream: '#dccc9a', creamLo: '#8a785a',

    // accent screens
    screen: '#10141a', screenGlow: '#2a4a6a',
    paper: '#ece7d7',

    // ground / shadow
    grass: '#3a5a32',
    tile: '#6f6f78',
  };

  // ----- helpers -----
  function rectShadow(ctx, o, depth) {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(o.x + 3, o.y + o.h - 2, o.w, depth || 4);
  }
  function softShadow(ctx, x, y, rx, ry) {
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.beginPath();
    ctx.ellipse(x + 1, y + 3, rx, ry, 0, 0, TAU);
    ctx.fill();
  }
  // 3-band rectangle: shadow rim, body, highlight stripe at top.
  function panel(ctx, o, bodyCol, hiCol, loCol, hiH) {
    ctx.fillStyle = loCol;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = bodyCol;
    ctx.fillRect(o.x + 1, o.y + 1, o.w - 2, o.h - 3);
    if (hiCol) {
      ctx.fillStyle = hiCol;
      ctx.fillRect(o.x + 2, o.y + 1, o.w - 4, hiH || 2);
    }
  }

  // ============================================================
  // 01 · LIVING
  // ============================================================
  function drawSofa(ctx, o) {
    rectShadow(ctx, o, 3);
    // back rest (slimmer slab along top edge)
    ctx.fillStyle = C.couchTealLo;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    // seat cushion well
    ctx.fillStyle = C.couchTeal;
    ctx.fillRect(o.x + 2, o.y + o.h * 0.35, o.w - 4, o.h * 0.55);
    // back highlight
    ctx.fillStyle = C.couchTealHi;
    ctx.fillRect(o.x + 2, o.y + 2, o.w - 4, o.h * 0.28);
    // 3 cushion divisions
    ctx.strokeStyle = C.couchTealLo;
    ctx.lineWidth = 1.2;
    for (let i = 1; i < 3; i++) {
      const x = o.x + (o.w / 3) * i;
      ctx.beginPath();
      ctx.moveTo(x, o.y + o.h * 0.35);
      ctx.lineTo(x, o.y + o.h * 0.9);
      ctx.stroke();
    }
    // arm rests (raised)
    ctx.fillStyle = C.couchTealLo;
    ctx.fillRect(o.x, o.y + o.h * 0.3, 4, o.h * 0.65);
    ctx.fillRect(o.x + o.w - 4, o.y + o.h * 0.3, 4, o.h * 0.65);
    // throw pillow accent
    ctx.fillStyle = C.cushion;
    ctx.fillRect(o.x + 6, o.y + o.h * 0.55, 9, 6);
    ctx.fillStyle = C.cushion2;
    ctx.fillRect(o.x + o.w - 15, o.y + o.h * 0.55, 9, 6);
  }

  function drawArmchair(ctx, o) {
    rectShadow(ctx, o, 3);
    ctx.fillStyle = C.couchTealLo;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = C.couchTeal;
    ctx.fillRect(o.x + 4, o.y + o.h * 0.32, o.w - 8, o.h * 0.6);
    // back tall
    ctx.fillStyle = C.couchTealHi;
    ctx.fillRect(o.x + 4, o.y + 2, o.w - 8, o.h * 0.28);
    // arms
    ctx.fillStyle = C.couchTealLo;
    ctx.fillRect(o.x, o.y + o.h * 0.28, 4, o.h * 0.65);
    ctx.fillRect(o.x + o.w - 4, o.y + o.h * 0.28, 4, o.h * 0.65);
    // cushion seam
    ctx.strokeStyle = C.couchTealLo;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(o.x + 6, o.y + o.h * 0.62);
    ctx.lineTo(o.x + o.w - 6, o.y + o.h * 0.62);
    ctx.stroke();
  }

  function drawCoffeeTable(ctx, o) {
    rectShadow(ctx, o, 3);
    // table top with rounded look — outer dark, inner wood
    ctx.fillStyle = C.woodLo;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = C.wood;
    ctx.fillRect(o.x + 2, o.y + 2, o.w - 4, o.h - 5);
    ctx.fillStyle = C.woodHi;
    ctx.fillRect(o.x + 2, o.y + 2, o.w - 4, 1.5);
    // glass insert (lighter rectangle, slight blueish)
    ctx.fillStyle = 'rgba(180,200,210,0.3)';
    ctx.fillRect(o.x + 6, o.y + 6, o.w - 12, o.h - 14);
    ctx.strokeStyle = C.woodLo;
    ctx.strokeRect(o.x + 6, o.y + 6, o.w - 12, o.h - 14);
    // small book on top
    ctx.fillStyle = C.cushion2;
    ctx.fillRect(o.x + o.w * 0.6, o.y + o.h * 0.3, 10, 6);
    ctx.fillStyle = C.paper;
    ctx.fillRect(o.x + o.w * 0.6, o.y + o.h * 0.3, 10, 1);
    // mug
    ctx.fillStyle = C.bone;
    ctx.beginPath();
    ctx.arc(o.x + o.w * 0.3, o.y + o.h * 0.45, 3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.wood;
    ctx.beginPath();
    ctx.arc(o.x + o.w * 0.3, o.y + o.h * 0.45, 2, 0, TAU);
    ctx.fill();
  }

  function drawBookshelf(ctx, o) {
    rectShadow(ctx, o, 3);
    panel(ctx, o, C.wood, C.woodHi, C.woodLo, 1.5);
    // shelves (horizontal dividers)
    ctx.fillStyle = C.woodLo;
    const shelves = 5;
    for (let i = 1; i < shelves; i++) {
      ctx.fillRect(o.x + 2, o.y + (o.h / shelves) * i, o.w - 4, 1.5);
    }
    // books — different colors per shelf
    const palette = [C.cushion2, C.couchTeal, C.cream, C.cushion, C.navy, C.forest];
    for (let s = 0; s < shelves; s++) {
      const sy = o.y + (o.h / shelves) * s + 2;
      const sh = (o.h / shelves) - 3;
      let bx = o.x + 4;
      while (bx < o.x + o.w - 4) {
        const bw = 2 + Math.floor(((bx * 7 + s * 13) % 5));
        ctx.fillStyle = palette[(Math.floor(bx / 2) + s) % palette.length];
        ctx.fillRect(bx, sy, bw, sh);
        // top highlight
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(bx, sy, bw, 0.8);
        bx += bw + 1;
      }
    }
  }

  function drawTvStand(ctx, o) {
    rectShadow(ctx, o, 3);
    // stand box
    panel(ctx, o, C.woodLo, C.wood, '#0a0a0c', 2);
    // TV on top
    const tvX = o.x + o.w * 0.15;
    const tvY = o.y - 2;
    const tvW = o.w * 0.7;
    const tvH = o.h * 0.45;
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(tvX, tvY, tvW, tvH);
    ctx.fillStyle = C.screen;
    ctx.fillRect(tvX + 2, tvY + 2, tvW - 4, tvH - 4);
    // soft screen glow
    const g = ctx.createLinearGradient(tvX, tvY, tvX, tvY + tvH);
    g.addColorStop(0, 'rgba(127,200,255,0.18)');
    g.addColorStop(1, 'rgba(127,200,255,0.04)');
    ctx.fillStyle = g;
    ctx.fillRect(tvX + 2, tvY + 2, tvW - 4, tvH - 4);
    // bezel highlight
    ctx.fillStyle = '#2a2a30';
    ctx.fillRect(tvX, tvY, tvW, 1);
    // remote on stand
    ctx.fillStyle = '#1a1a1f';
    ctx.fillRect(o.x + 4, o.y + o.h - 5, 6, 3);
    // cable channels (open shelves)
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(o.x + 3, o.y + o.h * 0.55, o.w * 0.4, o.h * 0.3);
  }

  function drawRug(ctx, o) {
    // flat ground prop — no shadow, draws under furniture in real scenes
    ctx.fillStyle = C.rugLo;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = C.rug;
    ctx.fillRect(o.x + 2, o.y + 2, o.w - 4, o.h - 4);
    // border pattern
    ctx.fillStyle = C.rugHi;
    ctx.fillRect(o.x + 4, o.y + 4, o.w - 8, 1.5);
    ctx.fillRect(o.x + 4, o.y + o.h - 5, o.w - 8, 1.5);
    ctx.fillRect(o.x + 4, o.y + 4, 1.5, o.h - 8);
    ctx.fillRect(o.x + o.w - 5, o.y + 4, 1.5, o.h - 8);
    // medallion center
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    ctx.fillStyle = C.cream;
    ctx.beginPath(); ctx.ellipse(cx, cy, o.w * 0.18, o.h * 0.22, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = C.rugHi;
    ctx.beginPath(); ctx.ellipse(cx, cy, o.w * 0.12, o.h * 0.14, 0, 0, TAU); ctx.fill();
    // fringe ends
    ctx.strokeStyle = C.cream;
    ctx.lineWidth = 0.8;
    for (let i = 0; i < o.w; i += 3) {
      ctx.beginPath();
      ctx.moveTo(o.x + i, o.y - 2); ctx.lineTo(o.x + i, o.y);
      ctx.moveTo(o.x + i, o.y + o.h); ctx.lineTo(o.x + i, o.y + o.h + 2);
      ctx.stroke();
    }
  }

  // ============================================================
  // 02 · BEDROOM / BATH
  // ============================================================
  function drawBed(ctx, o) {
    rectShadow(ctx, o, 3);
    // bed frame
    ctx.fillStyle = C.woodLo;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    // mattress
    ctx.fillStyle = C.whiteLo;
    ctx.fillRect(o.x + 3, o.y + 8, o.w - 6, o.h - 12);
    ctx.fillStyle = C.white;
    ctx.fillRect(o.x + 4, o.y + 9, o.w - 8, o.h - 14);
    ctx.fillStyle = C.whiteHi;
    ctx.fillRect(o.x + 4, o.y + 9, o.w - 8, 1.5);
    // headboard (top edge taller, dark)
    ctx.fillStyle = C.wood;
    ctx.fillRect(o.x, o.y, o.w, 8);
    ctx.fillStyle = C.woodHi;
    ctx.fillRect(o.x + 2, o.y + 1, o.w - 4, 2);
    // pillow
    ctx.fillStyle = C.whiteHi;
    ctx.fillRect(o.x + 6, o.y + 11, o.w - 12, 8);
    ctx.strokeStyle = C.whiteLo;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(o.x + 6, o.y + 11, o.w - 12, 8);
    // blanket fold across foot
    ctx.fillStyle = C.couchTeal;
    ctx.fillRect(o.x + 3, o.y + o.h - 16, o.w - 6, 8);
    ctx.fillStyle = C.couchTealLo;
    ctx.fillRect(o.x + 3, o.y + o.h - 16, o.w - 6, 1.5);
  }

  function drawNightstand(ctx, o) {
    rectShadow(ctx, o, 3);
    panel(ctx, o, C.wood, C.woodHi, C.woodLo, 1.5);
    // drawer
    ctx.strokeStyle = C.woodLo;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(o.x + 3, o.y + o.h * 0.55);
    ctx.lineTo(o.x + o.w - 3, o.y + o.h * 0.55);
    ctx.stroke();
    // handle
    ctx.fillStyle = C.metalHi;
    ctx.fillRect(o.x + o.w / 2 - 4, o.y + o.h * 0.72, 8, 1.5);
    // lamp base
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(o.x + o.w / 2 - 3, o.y + 4, 6, 4);
    // lamp shade
    ctx.fillStyle = C.cream;
    ctx.beginPath();
    ctx.moveTo(o.x + o.w / 2 - 6, o.y + 4);
    ctx.lineTo(o.x + o.w / 2 + 6, o.y + 4);
    ctx.lineTo(o.x + o.w / 2 + 4, o.y - 2);
    ctx.lineTo(o.x + o.w / 2 - 4, o.y - 2);
    ctx.closePath(); ctx.fill();
    // warm glow
    const g = ctx.createRadialGradient(o.x + o.w / 2, o.y + 2, 1, o.x + o.w / 2, o.y + 2, 18);
    g.addColorStop(0, 'rgba(255,200,100,0.35)');
    g.addColorStop(1, 'rgba(255,200,100,0)');
    ctx.fillStyle = g;
    ctx.fillRect(o.x - 8, o.y - 12, o.w + 16, 24);
  }

  function drawDresser(ctx, o) {
    rectShadow(ctx, o, 3);
    panel(ctx, o, C.wood, C.woodHi, C.woodLo, 1.5);
    // 2x3 drawer grid
    ctx.strokeStyle = C.woodLo;
    ctx.lineWidth = 1;
    ctx.beginPath();
    // horizontal lines (2 dividers)
    ctx.moveTo(o.x + 3, o.y + o.h / 3); ctx.lineTo(o.x + o.w - 3, o.y + o.h / 3);
    ctx.moveTo(o.x + 3, o.y + (o.h / 3) * 2); ctx.lineTo(o.x + o.w - 3, o.y + (o.h / 3) * 2);
    // vertical line
    ctx.moveTo(o.x + o.w / 2, o.y + 3); ctx.lineTo(o.x + o.w / 2, o.y + o.h - 3);
    ctx.stroke();
    // handles
    ctx.fillStyle = C.metalHi;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 2; col++) {
        const hx = o.x + (o.w / 2) * col + o.w / 4 - 3;
        const hy = o.y + (o.h / 3) * row + o.h / 6;
        ctx.fillRect(hx, hy, 6, 1.5);
      }
    }
    // small framed photo on top
    ctx.fillStyle = C.woodLo;
    ctx.fillRect(o.x + 4, o.y - 5, 12, 7);
    ctx.fillStyle = C.couchTeal;
    ctx.fillRect(o.x + 5, o.y - 4, 10, 5);
  }

  function drawWardrobe(ctx, o) {
    rectShadow(ctx, o, 3);
    panel(ctx, o, C.wood, C.woodHi, C.woodLo, 1.5);
    // double doors
    ctx.strokeStyle = C.woodLo;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(o.x + o.w / 2, o.y + 3);
    ctx.lineTo(o.x + o.w / 2, o.y + o.h - 3);
    ctx.stroke();
    // door panels (inset rectangles)
    ctx.strokeStyle = C.woodLo;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(o.x + 5, o.y + 5, o.w / 2 - 7, o.h - 10);
    ctx.strokeRect(o.x + o.w / 2 + 2, o.y + 5, o.w / 2 - 7, o.h - 10);
    // handles
    ctx.fillStyle = C.metalHi;
    ctx.fillRect(o.x + o.w / 2 - 4, o.y + o.h / 2 - 1, 2, 3);
    ctx.fillRect(o.x + o.w / 2 + 2, o.y + o.h / 2 - 1, 2, 3);
    // top molding
    ctx.fillStyle = C.woodLo;
    ctx.fillRect(o.x, o.y, o.w, 3);
    ctx.fillStyle = C.woodHi;
    ctx.fillRect(o.x + 2, o.y, o.w - 4, 1);
  }

  function drawToilet(ctx, o) {
    rectShadow(ctx, o, 2);
    // tank (back)
    ctx.fillStyle = C.whiteLo;
    ctx.fillRect(o.x, o.y, o.w, o.h * 0.35);
    ctx.fillStyle = C.white;
    ctx.fillRect(o.x + 1, o.y + 1, o.w - 2, o.h * 0.35 - 2);
    ctx.fillStyle = C.whiteHi;
    ctx.fillRect(o.x + 2, o.y + 1, o.w - 4, 1.5);
    // bowl (oval, front)
    const cx = o.x + o.w / 2, cy = o.y + o.h * 0.7;
    ctx.fillStyle = C.whiteLo;
    ctx.beginPath();
    ctx.ellipse(cx, cy, o.w * 0.42, o.h * 0.32, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.white;
    ctx.beginPath();
    ctx.ellipse(cx, cy, o.w * 0.38, o.h * 0.28, 0, 0, TAU);
    ctx.fill();
    // water (inner)
    ctx.fillStyle = '#a4c4d8';
    ctx.beginPath();
    ctx.ellipse(cx, cy + 1, o.w * 0.28, o.h * 0.18, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.ellipse(cx - 3, cy - 1, o.w * 0.1, o.h * 0.06, 0, 0, TAU);
    ctx.fill();
    // flush button
    ctx.fillStyle = C.metalHi;
    ctx.beginPath();
    ctx.arc(cx, o.y + 3, 1.5, 0, TAU); ctx.fill();
  }

  function drawBathtub(ctx, o) {
    rectShadow(ctx, o, 3);
    // outer rim
    ctx.fillStyle = C.whiteLo;
    const r = Math.min(o.w, o.h) * 0.2;
    roundRect(ctx, o.x, o.y, o.w, o.h, r);
    ctx.fill();
    // inner basin
    ctx.fillStyle = C.white;
    roundRect(ctx, o.x + 3, o.y + 3, o.w - 6, o.h - 6, r * 0.8);
    ctx.fill();
    // water ring
    ctx.fillStyle = '#a4c4d8';
    roundRect(ctx, o.x + 6, o.y + 6, o.w - 12, o.h - 12, r * 0.6);
    ctx.fill();
    // highlight on rim (top)
    ctx.fillStyle = C.whiteHi;
    ctx.fillRect(o.x + r, o.y + 1, o.w - r * 2, 1.5);
    // faucet at one end
    ctx.fillStyle = C.chrome;
    ctx.fillRect(o.x + 3, o.y + o.h / 2 - 3, 4, 6);
    ctx.fillStyle = C.metalLo;
    ctx.fillRect(o.x, o.y + o.h / 2 - 1, 4, 2);
    // drain
    ctx.fillStyle = C.metalLo;
    ctx.beginPath();
    ctx.arc(o.x + o.w - 10, o.y + o.h / 2, 1.5, 0, TAU); ctx.fill();
  }

  // helper for rounded rect path
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ============================================================
  // 03 · KITCHEN
  // ============================================================
  function drawFridge(ctx, o) {
    rectShadow(ctx, o, 3);
    panel(ctx, o, C.white, C.whiteHi, C.whiteLo, 2);
    // freezer (top section, 1/3)
    ctx.strokeStyle = C.whiteLo;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(o.x + 2, o.y + o.h * 0.3);
    ctx.lineTo(o.x + o.w - 2, o.y + o.h * 0.3);
    ctx.stroke();
    // handles (vertical bars)
    ctx.fillStyle = C.metalLo;
    ctx.fillRect(o.x + o.w * 0.85, o.y + 4, 1.5, o.h * 0.22);
    ctx.fillRect(o.x + o.w * 0.85, o.y + o.h * 0.36, 1.5, o.h * 0.55);
    ctx.fillStyle = C.metalHi;
    ctx.fillRect(o.x + o.w * 0.85, o.y + 4, 0.6, o.h * 0.22);
    ctx.fillRect(o.x + o.w * 0.85, o.y + o.h * 0.36, 0.6, o.h * 0.55);
    // small magnets
    ctx.fillStyle = C.cushion;
    ctx.fillRect(o.x + 4, o.y + o.h * 0.4, 3, 2);
    ctx.fillStyle = C.cushion2;
    ctx.fillRect(o.x + 4, o.y + o.h * 0.5, 3, 2);
    ctx.fillStyle = C.toxic;
    ctx.fillRect(o.x + 4, o.y + o.h * 0.6, 3, 2);
  }

  function drawStove(ctx, o) {
    rectShadow(ctx, o, 3);
    panel(ctx, o, C.metalLo, C.metal, '#0a0a0c', 1.5);
    // 4 burners
    const positions = [
      [o.w * 0.28, o.h * 0.32], [o.w * 0.72, o.h * 0.32],
      [o.w * 0.28, o.h * 0.65], [o.w * 0.72, o.h * 0.65],
    ];
    positions.forEach(([dx, dy]) => {
      ctx.fillStyle = '#0a0a0c';
      ctx.beginPath();
      ctx.arc(o.x + dx, o.y + dy, Math.min(o.w, o.h) * 0.16, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = C.metalHi;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(o.x + dx, o.y + dy, Math.min(o.w, o.h) * 0.12, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(o.x + dx, o.y + dy, Math.min(o.w, o.h) * 0.07, 0, TAU);
      ctx.stroke();
    });
    // ignited front-left burner — soft glow
    const ix = o.x + o.w * 0.28, iy = o.y + o.h * 0.65;
    const g = ctx.createRadialGradient(ix, iy, 1, ix, iy, 10);
    g.addColorStop(0, 'rgba(127,200,255,0.5)');
    g.addColorStop(1, 'rgba(127,200,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(ix, iy, 10, 0, TAU); ctx.fill();
    // control knobs row
    ctx.fillStyle = C.metalHi;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(o.x + 4 + i * (o.w - 8) / 3, o.y + 4, 1.5, 0, TAU);
      ctx.fill();
    }
  }

  function drawKitchenCounter(ctx, o) {
    rectShadow(ctx, o, 3);
    // base cabinetry
    ctx.fillStyle = C.woodLo;
    ctx.fillRect(o.x, o.y + o.h * 0.18, o.w, o.h * 0.82);
    ctx.fillStyle = C.wood;
    ctx.fillRect(o.x + 1, o.y + o.h * 0.18 + 1, o.w - 2, o.h * 0.82 - 3);
    // counter top (stone)
    ctx.fillStyle = '#2a2a30';
    ctx.fillRect(o.x, o.y, o.w, o.h * 0.2);
    ctx.fillStyle = '#3a3a40';
    ctx.fillRect(o.x + 1, o.y + 1, o.w - 2, o.h * 0.2 - 2);
    ctx.fillStyle = '#5a5a64';
    ctx.fillRect(o.x + 1, o.y + 1, o.w - 2, 1);
    // sink cutout
    const sinkX = o.x + o.w * 0.18, sinkY = o.y + 3;
    const sinkW = o.w * 0.3, sinkH = o.h * 0.4;
    ctx.fillStyle = C.metalLo;
    ctx.fillRect(sinkX, sinkY, sinkW, sinkH);
    ctx.fillStyle = C.metal;
    ctx.fillRect(sinkX + 1, sinkY + 1, sinkW - 2, sinkH - 2);
    ctx.fillStyle = C.chrome;
    ctx.fillRect(sinkX + sinkW * 0.4, sinkY - 3, 4, 3);
    // small dish (drying rack)
    ctx.strokeStyle = C.whiteLo;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(o.x + o.w * 0.6, sinkY + 2, o.w * 0.15, sinkH - 6);
    // cabinet handles
    ctx.fillStyle = C.metalHi;
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(o.x + 4 + i * (o.w - 8) / 2, o.y + o.h * 0.6, 6, 1.5);
    }
  }

  function drawDiningTable(ctx, o) {
    rectShadow(ctx, o, 3);
    // round table top
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    const r = Math.min(o.w, o.h) * 0.45;
    ctx.fillStyle = C.woodLo;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 2, r, r * 0.95, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = C.wood;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.95, 0, 0, TAU); ctx.fill();
    // grain
    ctx.strokeStyle = C.woodLo;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.ellipse(cx - 2, cy, r * 0.6 + i * 2, r * 0.6 + i * 2, 0, Math.PI * 0.2, Math.PI * 1.2);
      ctx.stroke();
    }
    // table setting items
    // plate
    ctx.fillStyle = C.white;
    ctx.beginPath();
    ctx.arc(cx - r * 0.4, cy, 5, 0, TAU); ctx.fill();
    ctx.fillStyle = C.whiteLo;
    ctx.beginPath();
    ctx.arc(cx - r * 0.4, cy, 5, 0, TAU); ctx.stroke();
    // candle
    ctx.fillStyle = C.cream;
    ctx.fillRect(cx - 1, cy - 4, 2, 7);
    ctx.fillStyle = C.warn;
    ctx.beginPath();
    ctx.arc(cx, cy - 5, 1.4, 0, TAU); ctx.fill();
    // wine glass
    ctx.strokeStyle = C.bone;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(cx + r * 0.4, cy, 3, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(210,75,53,0.7)';
    ctx.beginPath();
    ctx.arc(cx + r * 0.4, cy, 2, 0, TAU); ctx.fill();
  }

  function drawDiningChair(ctx, o) {
    rectShadow(ctx, o, 2);
    // back rest (top edge)
    ctx.fillStyle = C.woodLo;
    ctx.fillRect(o.x, o.y, o.w, o.h * 0.22);
    ctx.fillStyle = C.wood;
    ctx.fillRect(o.x + 1, o.y + 1, o.w - 2, o.h * 0.22 - 2);
    // seat (cushion)
    ctx.fillStyle = C.cream;
    ctx.fillRect(o.x + 2, o.y + o.h * 0.28, o.w - 4, o.h * 0.62);
    ctx.fillStyle = C.creamLo;
    ctx.fillRect(o.x + 2, o.y + o.h * 0.28, o.w - 4, 1);
    // seat outline
    ctx.strokeStyle = C.woodLo;
    ctx.lineWidth = 0.8;
    ctx.strokeRect(o.x + 2, o.y + o.h * 0.28, o.w - 4, o.h * 0.62);
    // back rest spindles
    ctx.fillStyle = C.woodLo;
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(o.x + 3 + i * (o.w - 6) / 2 - 0.5, o.y + 2, 1, o.h * 0.22 - 4);
    }
  }

  function drawKitchenIsland(ctx, o) {
    rectShadow(ctx, o, 3);
    // dark base
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = C.navy;
    ctx.fillRect(o.x + 1, o.y + 1, o.w - 2, o.h - 3);
    // marble counter top
    ctx.fillStyle = '#dcd4c4';
    ctx.fillRect(o.x + 2, o.y + 1, o.w - 4, o.h * 0.3);
    // marble veins
    ctx.strokeStyle = '#7e7864';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(o.x + 4, o.y + 4);
    ctx.bezierCurveTo(o.x + o.w * 0.3, o.y + 2, o.x + o.w * 0.6, o.y + o.h * 0.2, o.x + o.w - 4, o.y + 5);
    ctx.moveTo(o.x + 6, o.y + o.h * 0.18);
    ctx.bezierCurveTo(o.x + o.w * 0.4, o.y + o.h * 0.25, o.x + o.w * 0.7, o.y + o.h * 0.1, o.x + o.w - 6, o.y + o.h * 0.2);
    ctx.stroke();
    // bar stools peeking out one side (just tops visible from above)
    const stoolY = o.y + o.h + 4;
    for (let i = 0; i < 3; i++) {
      const sx = o.x + 8 + i * (o.w - 16) / 2;
      ctx.fillStyle = '#1a1a1f';
      ctx.beginPath();
      ctx.arc(sx, stoolY, 4, 0, TAU); ctx.fill();
      ctx.fillStyle = C.metalHi;
      ctx.beginPath();
      ctx.arc(sx, stoolY, 2.5, 0, TAU); ctx.fill();
    }
    // pendant light shadow on top
    ctx.fillStyle = 'rgba(255,200,100,0.18)';
    ctx.beginPath();
    ctx.ellipse(o.x + o.w * 0.3, o.y + o.h * 0.15, 5, 3, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(o.x + o.w * 0.7, o.y + o.h * 0.15, 5, 3, 0, 0, TAU);
    ctx.fill();
  }

  // ============================================================
  // 04 · WORK / OFFICE
  // ============================================================
  function drawOfficeDesk(ctx, o) {
    rectShadow(ctx, o, 3);
    panel(ctx, o, C.wood, C.woodHi, C.woodLo, 1.5);
    // monitor
    const mX = o.x + o.w * 0.55, mY = o.y + 4, mW = o.w * 0.35, mH = o.h * 0.4;
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(mX, mY, mW, mH);
    ctx.fillStyle = C.screen;
    ctx.fillRect(mX + 1.5, mY + 1.5, mW - 3, mH - 3);
    // screen lines (code-like)
    ctx.fillStyle = C.toxic;
    for (let i = 0; i < 3; i++) {
      ctx.fillRect(mX + 3, mY + 3 + i * 3, mW * 0.5, 1);
    }
    ctx.fillStyle = C.elec;
    ctx.fillRect(mX + 3, mY + 12, mW * 0.3, 1);
    // monitor stand
    ctx.fillStyle = '#2a2a30';
    ctx.fillRect(mX + mW * 0.4, mY + mH, mW * 0.2, 3);
    // keyboard
    ctx.fillStyle = '#1a1a1f';
    ctx.fillRect(o.x + o.w * 0.55, o.y + o.h * 0.6, o.w * 0.32, o.h * 0.18);
    // mouse
    ctx.fillStyle = '#1a1a1f';
    ctx.beginPath();
    ctx.ellipse(o.x + o.w * 0.92, o.y + o.h * 0.7, 2.5, 4, 0, 0, TAU);
    ctx.fill();
    // papers
    ctx.fillStyle = C.paper;
    ctx.fillRect(o.x + 6, o.y + 6, 18, 22);
    ctx.fillRect(o.x + 4, o.y + 8, 18, 22);
    ctx.strokeStyle = C.creamLo;
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(o.x + 6, o.y + 12 + i * 4);
      ctx.lineTo(o.x + 20, o.y + 12 + i * 4);
      ctx.stroke();
    }
    // mug
    ctx.fillStyle = C.cushion2;
    ctx.beginPath();
    ctx.arc(o.x + o.w * 0.4, o.y + o.h * 0.8, 3.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#4a1a14';
    ctx.beginPath();
    ctx.arc(o.x + o.w * 0.4, o.y + o.h * 0.8, 2, 0, TAU); ctx.fill();
  }

  function drawOfficeChair(ctx, o) {
    softShadow(ctx, o.x + o.w / 2, o.y + o.h - 2, o.w * 0.45, o.h * 0.18);
    // 5-leg star base
    const cx = o.x + o.w / 2, cy = o.y + o.h * 0.62;
    ctx.fillStyle = '#1a1a1f';
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);
      ctx.fillRect(0, -1, o.w * 0.42, 2);
      ctx.beginPath();
      ctx.arc(o.w * 0.42, 0, 1.5, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    // center column
    ctx.fillStyle = C.metalLo;
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, TAU); ctx.fill();
    // seat (round, oriented body)
    ctx.fillStyle = '#0a0a0c';
    ctx.beginPath();
    ctx.arc(cx, cy - 2, o.w * 0.32, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2a2a30';
    ctx.beginPath();
    ctx.arc(cx, cy - 2, o.w * 0.28, 0, TAU); ctx.fill();
    // backrest (semicircle on one side)
    ctx.fillStyle = '#1a1a1f';
    ctx.beginPath();
    ctx.arc(cx, cy - 4, o.w * 0.34, Math.PI * 0.15, Math.PI * 0.85);
    ctx.lineTo(cx, cy - 4);
    ctx.closePath(); ctx.fill();
  }

  function drawFilingCabinet(ctx, o) {
    rectShadow(ctx, o, 3);
    panel(ctx, o, C.metal, C.metalHi, C.metalLo, 1.5);
    // 4 drawers
    ctx.strokeStyle = C.metalLo;
    ctx.lineWidth = 1.2;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(o.x + 3, o.y + (o.h / 4) * i);
      ctx.lineTo(o.x + o.w - 3, o.y + (o.h / 4) * i);
      ctx.stroke();
    }
    // drawer handles + label slots
    for (let i = 0; i < 4; i++) {
      const dy = o.y + (o.h / 4) * i + o.h / 8;
      // label slot
      ctx.fillStyle = C.paper;
      ctx.fillRect(o.x + o.w * 0.3, dy - 2, o.w * 0.25, 4);
      ctx.fillStyle = C.creamLo;
      ctx.fillRect(o.x + o.w * 0.3 + 1, dy - 1, o.w * 0.18, 0.6);
      // handle
      ctx.fillStyle = C.metalLo;
      ctx.fillRect(o.x + o.w * 0.65, dy - 1, o.w * 0.18, 2);
      ctx.fillStyle = '#0a0a0c';
      ctx.fillRect(o.x + o.w * 0.65, dy - 1, o.w * 0.18, 0.6);
    }
    // top dent for filing
    ctx.fillStyle = C.metalLo;
    ctx.fillRect(o.x + 4, o.y + 1, o.w - 8, 0.8);
  }

  function drawPhotocopier(ctx, o) {
    rectShadow(ctx, o, 3);
    panel(ctx, o, C.metalHi, C.chrome, C.metalLo, 2);
    // lid (top half slightly darker)
    ctx.fillStyle = C.metal;
    ctx.fillRect(o.x + 2, o.y + 2, o.w - 4, o.h * 0.42);
    // glass plate hint
    ctx.fillStyle = 'rgba(160,200,220,0.3)';
    ctx.fillRect(o.x + 6, o.y + 5, o.w - 12, o.h * 0.32);
    // control panel (right side)
    ctx.fillStyle = '#1a1a1f';
    ctx.fillRect(o.x + o.w * 0.7, o.y + o.h * 0.5, o.w * 0.25, o.h * 0.35);
    // buttons
    [[0.74, 0.55], [0.82, 0.55], [0.9, 0.55], [0.74, 0.65], [0.82, 0.65], [0.9, 0.65]].forEach(([dx, dy]) => {
      ctx.fillStyle = C.metalHi;
      ctx.beginPath();
      ctx.arc(o.x + dx * o.w, o.y + dy * o.h, 1.2, 0, TAU); ctx.fill();
    });
    // status light
    ctx.fillStyle = C.toxic;
    ctx.beginPath();
    ctx.arc(o.x + o.w * 0.86, o.y + o.h * 0.78, 1.5, 0, TAU); ctx.fill();
    // output tray
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(o.x + o.w * 0.08, o.y + o.h * 0.5, o.w * 0.5, o.h * 0.35);
    ctx.fillStyle = C.paper;
    ctx.fillRect(o.x + o.w * 0.1, o.y + o.h * 0.55, o.w * 0.45, o.h * 0.06);
    ctx.fillRect(o.x + o.w * 0.12, o.y + o.h * 0.62, o.w * 0.45, o.h * 0.06);
    // paper jam warning sticker (gag)
    ctx.fillStyle = C.warn;
    ctx.fillRect(o.x + 4, o.y + o.h - 8, 14, 5);
    ctx.fillStyle = '#1a0a05';
    ctx.font = 'bold 4px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('JAMMED', o.x + 11, o.y + o.h - 4.5);
  }

  function drawWhiteboard(ctx, o) {
    rectShadow(ctx, o, 2);
    // frame
    ctx.fillStyle = C.metalLo;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    // board
    ctx.fillStyle = C.whiteHi;
    ctx.fillRect(o.x + 2, o.y + 2, o.w - 4, o.h - 7);
    // marker scribbles
    ctx.strokeStyle = C.blood;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(o.x + 6, o.y + 6); ctx.lineTo(o.x + 18, o.y + 6);
    ctx.moveTo(o.x + 6, o.y + 9); ctx.lineTo(o.x + 22, o.y + 9);
    ctx.moveTo(o.x + 6, o.y + 12); ctx.lineTo(o.x + 16, o.y + 12);
    ctx.stroke();
    ctx.strokeStyle = C.elec;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(o.x + o.w - 22, o.y + 6); ctx.lineTo(o.x + o.w - 6, o.y + 14);
    ctx.moveTo(o.x + o.w - 6, o.y + 6); ctx.lineTo(o.x + o.w - 22, o.y + 14);
    ctx.stroke();
    ctx.strokeStyle = '#1a1a1f';
    ctx.lineWidth = 0.6;
    ctx.strokeRect(o.x + o.w * 0.5, o.y + 6, 10, 8);
    // marker tray at bottom
    ctx.fillStyle = C.metalLo;
    ctx.fillRect(o.x + 2, o.y + o.h - 5, o.w - 4, 3);
    ctx.fillStyle = C.blood;
    ctx.fillRect(o.x + 4, o.y + o.h - 4.5, 4, 1.5);
    ctx.fillStyle = C.elec;
    ctx.fillRect(o.x + 10, o.y + o.h - 4.5, 4, 1.5);
    ctx.fillStyle = '#1a1a1f';
    ctx.fillRect(o.x + 16, o.y + o.h - 4.5, 4, 1.5);
  }

  function drawWaterCooler(ctx, o) {
    rectShadow(ctx, o, 2);
    // jug (top — large blue bottle)
    const cx = o.x + o.w / 2;
    const jugY = o.y + 2, jugH = o.h * 0.45;
    ctx.fillStyle = '#3a6a8a';
    ctx.beginPath();
    ctx.ellipse(cx, jugY + jugH / 2, o.w * 0.38, jugH / 2, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#5a8aaa';
    ctx.beginPath();
    ctx.ellipse(cx - 2, jugY + jugH / 2 - 2, o.w * 0.18, jugH * 0.18, 0, 0, TAU);
    ctx.fill();
    // water level line
    ctx.strokeStyle = '#a4c4d8';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(o.x + o.w * 0.2, jugY + jugH * 0.35);
    ctx.lineTo(o.x + o.w * 0.8, jugY + jugH * 0.35);
    ctx.stroke();
    // cooler body
    ctx.fillStyle = C.whiteLo;
    ctx.fillRect(o.x + 2, o.y + jugH + 2, o.w - 4, o.h - jugH - 4);
    ctx.fillStyle = C.white;
    ctx.fillRect(o.x + 3, o.y + jugH + 3, o.w - 6, o.h - jugH - 6);
    // taps (hot + cold)
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(o.x + o.w * 0.25, o.y + jugH + 7, 3, 4);
    ctx.fillRect(o.x + o.w * 0.65, o.y + jugH + 7, 3, 4);
    ctx.fillStyle = C.blood;
    ctx.beginPath();
    ctx.arc(o.x + o.w * 0.26, o.y + jugH + 6, 1, 0, TAU); ctx.fill();
    ctx.fillStyle = C.elec;
    ctx.beginPath();
    ctx.arc(o.x + o.w * 0.66, o.y + jugH + 6, 1, 0, TAU); ctx.fill();
    // drip tray
    ctx.fillStyle = C.metalLo;
    ctx.fillRect(o.x + 4, o.y + o.h - 4, o.w - 8, 2);
  }

  // ============================================================
  // 05 · PUBLIC (street + retail mix)
  // ============================================================
  function drawVending(ctx, o) {
    rectShadow(ctx, o, 3);
    panel(ctx, o, C.blood, C.bloodLight || '#ec6448', '#4a1a14', 2);
    // display window
    const wX = o.x + 3, wY = o.y + 4, wW = o.w - 6, wH = o.h * 0.5;
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(wX, wY, wW, wH);
    ctx.fillStyle = '#1a2a3a';
    ctx.fillRect(wX + 1, wY + 1, wW - 2, wH - 2);
    // bottles in window (3 rows x 4)
    const colors = [C.toxic, C.warn, C.elec, '#ff7a3a'];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 4; c++) {
        ctx.fillStyle = colors[(r + c) % colors.length];
        ctx.fillRect(wX + 2 + c * ((wW - 4) / 4), wY + 2 + r * ((wH - 4) / 3), (wW - 4) / 4 - 1, (wH - 4) / 3 - 1);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.fillRect(wX + 2 + c * ((wW - 4) / 4), wY + 2 + r * ((wH - 4) / 3), 1, (wH - 4) / 3 - 1);
      }
    }
    // glass reflection
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(wX + 2, wY + 1, wW * 0.3, wH - 2);
    // keypad + dispense slot
    ctx.fillStyle = '#1a1a1f';
    ctx.fillRect(o.x + 3, o.y + o.h * 0.6, o.w - 6, o.h * 0.15);
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = C.metalHi;
      ctx.beginPath();
      ctx.arc(o.x + 6 + i * (o.w - 12) / 4, o.y + o.h * 0.68, 1.2, 0, TAU); ctx.fill();
    }
    // dispense slot
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(o.x + 5, o.y + o.h * 0.8, o.w - 10, 6);
    // OUT OF ORDER sticker
    ctx.fillStyle = C.bone;
    ctx.fillRect(o.x + 4, o.y + o.h * 0.92, o.w - 8, 4);
    ctx.fillStyle = C.blood;
    ctx.font = 'bold 4px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SOLD OUT', o.x + o.w / 2, o.y + o.h * 0.95);
  }

  function drawShoppingCart(ctx, o) {
    softShadow(ctx, o.x + o.w / 2, o.y + o.h - 2, o.w * 0.5, o.h * 0.18);
    // basket — grid
    ctx.fillStyle = C.metalLo;
    ctx.fillRect(o.x, o.y, o.w, o.h * 0.7);
    ctx.fillStyle = C.metal;
    ctx.fillRect(o.x + 1, o.y + 1, o.w - 2, o.h * 0.7 - 2);
    // wire grid
    ctx.strokeStyle = C.metalLo;
    ctx.lineWidth = 0.6;
    for (let i = 1; i < 5; i++) {
      const x = o.x + (o.w / 5) * i;
      ctx.beginPath();
      ctx.moveTo(x, o.y + 1);
      ctx.lineTo(x, o.y + o.h * 0.7 - 1);
      ctx.stroke();
    }
    for (let i = 1; i < 3; i++) {
      const y = o.y + (o.h * 0.7 / 3) * i;
      ctx.beginPath();
      ctx.moveTo(o.x + 1, y);
      ctx.lineTo(o.x + o.w - 1, y);
      ctx.stroke();
    }
    // handle bar (back)
    ctx.fillStyle = '#1a1a1f';
    ctx.fillRect(o.x - 2, o.y - 3, o.w + 4, 2);
    ctx.fillStyle = C.metalLo;
    ctx.fillRect(o.x - 2, o.y - 2, o.w + 4, 0.8);
    // wheels (4 corners, smaller)
    ctx.fillStyle = '#0a0a0c';
    [[0, 1], [o.w - 3, 1], [0, o.h * 0.7 - 4], [o.w - 3, o.h * 0.7 - 4]].forEach(([dx, dy]) => {
      ctx.fillRect(o.x + dx, o.y + dy + o.h * 0.78, 3, 4);
    });
    // contents (groceries)
    ctx.fillStyle = C.cushion2;
    ctx.fillRect(o.x + 3, o.y + 4, 5, 4);
    ctx.fillStyle = C.cream;
    ctx.fillRect(o.x + o.w - 9, o.y + 4, 6, 6);
    ctx.fillStyle = C.toxic;
    ctx.fillRect(o.x + o.w / 2 - 2, o.y + 3, 4, 5);
  }

  function drawParkBench(ctx, o) {
    rectShadow(ctx, o, 2);
    // 3 wooden slats
    ctx.fillStyle = C.woodLo;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = C.wood;
      ctx.fillRect(o.x + 2, o.y + 2 + i * (o.h - 4) / 3, o.w - 4, (o.h - 4) / 3 - 1);
      ctx.fillStyle = C.woodHi;
      ctx.fillRect(o.x + 2, o.y + 2 + i * (o.h - 4) / 3, o.w - 4, 0.7);
    }
    // iron arm rests at each end
    ctx.fillStyle = '#1a1a1f';
    ctx.fillRect(o.x - 1, o.y - 2, 3, o.h + 4);
    ctx.fillRect(o.x + o.w - 2, o.y - 2, 3, o.h + 4);
    // arm rest dots (rivets)
    ctx.fillStyle = C.metalHi;
    ctx.beginPath(); ctx.arc(o.x, o.y, 0.8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(o.x, o.y + o.h, 0.8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(o.x + o.w - 1, o.y, 0.8, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(o.x + o.w - 1, o.y + o.h, 0.8, 0, TAU); ctx.fill();
  }

  function drawTrashCan(ctx, o) {
    // circular top-down
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    const r = Math.min(o.w, o.h) / 2;
    softShadow(ctx, cx, cy, r + 1, (r + 1) * 0.4);
    ctx.fillStyle = '#1a1410';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    ctx.fillStyle = C.metal;
    ctx.beginPath(); ctx.arc(cx, cy, r - 1, 0, TAU); ctx.fill();
    // open inner (dark)
    ctx.fillStyle = '#0a0a0c';
    ctx.beginPath(); ctx.arc(cx, cy, r - 4, 0, TAU); ctx.fill();
    // trash poking out
    ctx.fillStyle = C.cream;
    ctx.fillRect(cx - 2, cy - r + 2, 5, 3);
    ctx.fillStyle = C.toxic;
    ctx.beginPath();
    ctx.arc(cx + r * 0.3, cy - r * 0.4, 2, 0, TAU); ctx.fill();
    // banding
    ctx.strokeStyle = C.metalLo;
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.arc(cx, cy, r - 1.5, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r - 3, 0, TAU); ctx.stroke();
    // flies
    ctx.fillStyle = '#1a1a1f';
    ctx.beginPath(); ctx.arc(cx - r - 2, cy - r - 1, 0.7, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + r + 1, cy - r - 3, 0.7, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx - r + 1, cy - r - 4, 0.7, 0, TAU); ctx.fill();
  }

  function drawMailbox(ctx, o) {
    rectShadow(ctx, o, 2);
    // body — vintage USPS-blue-ish lookalike (generic)
    ctx.fillStyle = C.navyLo;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = C.navy;
    ctx.fillRect(o.x + 1, o.y + 1, o.w - 2, o.h - 3);
    ctx.fillStyle = C.navyHi;
    ctx.fillRect(o.x + 2, o.y + 1, o.w - 4, 2);
    // domed top (light edge)
    ctx.fillStyle = C.navyHi;
    ctx.fillRect(o.x + 2, o.y + 4, o.w - 4, 2);
    // mail slot
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(o.x + 4, o.y + o.h * 0.45, o.w - 8, 2);
    // pull handle
    ctx.fillStyle = C.metalHi;
    ctx.fillRect(o.x + o.w / 2 - 3, o.y + o.h * 0.55, 6, 2);
    // "MAIL" stencil
    ctx.fillStyle = C.bone;
    ctx.font = 'bold 5px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('MAIL', o.x + o.w / 2, o.y + o.h * 0.82);
    // legs
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(o.x + 3, o.y + o.h - 2, 2, 4);
    ctx.fillRect(o.x + o.w - 5, o.y + o.h - 2, 2, 4);
  }

  function drawBusStop(ctx, o) {
    rectShadow(ctx, o, 3);
    // shelter roof (translucent)
    ctx.fillStyle = 'rgba(180,200,210,0.3)';
    ctx.fillRect(o.x, o.y, o.w, o.h);
    // roof frame
    ctx.strokeStyle = C.metalLo;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(o.x, o.y, o.w, o.h);
    // posts (corners)
    ctx.fillStyle = C.metalLo;
    ctx.fillRect(o.x, o.y, 3, o.h);
    ctx.fillRect(o.x + o.w - 3, o.y, 3, o.h);
    // bench inside
    ctx.fillStyle = C.woodLo;
    ctx.fillRect(o.x + 4, o.y + o.h - 8, o.w - 8, 6);
    ctx.fillStyle = C.wood;
    ctx.fillRect(o.x + 5, o.y + o.h - 7, o.w - 10, 4);
    // bus stop sign on side
    ctx.fillStyle = C.warn;
    ctx.fillRect(o.x - 2, o.y + 3, 3, 8);
    ctx.fillStyle = '#1a0a05';
    ctx.font = 'bold 5px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('B', o.x - 0.5, o.y + 8);
    // bottom shadow
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(o.x + 4, o.y + o.h - 2, o.w - 8, 1);
    // ad panel (advertising poster)
    ctx.fillStyle = C.bone;
    ctx.fillRect(o.x + 4, o.y + 4, 16, o.h - 14);
    ctx.fillStyle = C.cushion2;
    ctx.fillRect(o.x + 6, o.y + 6, 12, 5);
    ctx.fillStyle = '#0a0a0c';
    ctx.fillRect(o.x + 6, o.y + 13, 12, 1.5);
    ctx.fillRect(o.x + 6, o.y + 16, 8, 1);
  }

  // ============================================================
  // 06 · WORLD (nature + hazards)
  // ============================================================
  function drawPottedPlant(ctx, o) {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    softShadow(ctx, cx, o.y + o.h - 2, o.w * 0.45, o.h * 0.15);
    // pot (visible bottom half)
    ctx.fillStyle = C.rustLo;
    ctx.beginPath();
    ctx.ellipse(cx, o.y + o.h * 0.75, o.w * 0.32, o.h * 0.2, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#7a4632';
    ctx.beginPath();
    ctx.ellipse(cx, o.y + o.h * 0.75, o.w * 0.3, o.h * 0.18, 0, 0, TAU);
    ctx.fill();
    // rim
    ctx.strokeStyle = C.rustLo;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(cx, o.y + o.h * 0.6, o.w * 0.34, o.h * 0.06, 0, 0, TAU);
    ctx.stroke();
    // foliage (cluster of dark green dots)
    const leafColors = [C.forestLo, C.forest, C.forestHi];
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      const lr = o.w * 0.32 * (0.85 + Math.sin(i * 1.3) * 0.15);
      const lx = cx + Math.cos(a) * lr * 0.7;
      const ly = (o.y + o.h * 0.4) + Math.sin(a) * lr * 0.45;
      ctx.fillStyle = leafColors[i % 3];
      ctx.beginPath();
      ctx.ellipse(lx, ly, o.w * 0.13, o.h * 0.1, a, 0, TAU);
      ctx.fill();
    }
    // center sprig
    ctx.fillStyle = C.forestHi;
    ctx.beginPath();
    ctx.arc(cx, o.y + o.h * 0.42, o.w * 0.12, 0, TAU); ctx.fill();
    // little flower
    ctx.fillStyle = C.cushion;
    ctx.beginPath();
    ctx.arc(cx + o.w * 0.18, o.y + o.h * 0.3, 1.5, 0, TAU); ctx.fill();
  }

  function drawBush(ctx, o) {
    // organic blob — 5-7 overlapping circles
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    softShadow(ctx, cx, cy + 2, o.w * 0.45, o.h * 0.35);
    const r = Math.min(o.w, o.h) / 2 * 0.85;
    const blobs = 7;
    // base
    ctx.fillStyle = C.forestLo;
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * TAU;
      const dist = r * (0.4 + (i % 2) * 0.2);
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist * 0.85,
              r * 0.45, 0, TAU);
      ctx.fill();
    }
    // main body
    ctx.fillStyle = C.forest;
    for (let i = 0; i < blobs; i++) {
      const a = (i / blobs) * TAU + 0.4;
      const dist = r * 0.3;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist * 0.85,
              r * 0.4, 0, TAU);
      ctx.fill();
    }
    // highlights (top-left lit)
    ctx.fillStyle = C.forestHi;
    for (let i = 0; i < 4; i++) {
      const a = -TAU / 4 + (i / 4) * TAU * 0.5;
      const dist = r * 0.3;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * dist, cy + Math.sin(a) * dist * 0.85 - 1,
              r * 0.18, 0, TAU);
      ctx.fill();
    }
    // tiny berries
    ctx.fillStyle = C.blood;
    ctx.beginPath(); ctx.arc(cx + r * 0.3, cy - r * 0.2, 1.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx - r * 0.4, cy + r * 0.1, 1.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy + r * 0.4, 1.2, 0, TAU); ctx.fill();
  }

  function drawFountain(ctx, o) {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    softShadow(ctx, cx, cy, o.w * 0.5, o.h * 0.5);
    // outer basin
    ctx.fillStyle = C.metalLo;
    ctx.beginPath();
    ctx.ellipse(cx, cy, o.w * 0.45, o.h * 0.45, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = C.concreteHi || '#a3a4ac';
    ctx.beginPath();
    ctx.ellipse(cx, cy, o.w * 0.42, o.h * 0.42, 0, 0, TAU);
    ctx.fill();
    // water
    ctx.fillStyle = '#3a6a8a';
    ctx.beginPath();
    ctx.ellipse(cx, cy, o.w * 0.36, o.h * 0.36, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#5a8aaa';
    ctx.beginPath();
    ctx.ellipse(cx, cy, o.w * 0.34, o.h * 0.34, 0, 0, TAU);
    ctx.fill();
    // central pillar
    ctx.fillStyle = '#7e7864';
    ctx.beginPath();
    ctx.ellipse(cx, cy, o.w * 0.13, o.h * 0.13, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#a39880';
    ctx.beginPath();
    ctx.ellipse(cx, cy, o.w * 0.09, o.h * 0.09, 0, 0, TAU);
    ctx.fill();
    // top jet
    ctx.fillStyle = '#a4c4d8';
    ctx.beginPath();
    ctx.ellipse(cx, cy, o.w * 0.04, o.h * 0.04, 0, 0, TAU);
    ctx.fill();
    // ripples
    ctx.strokeStyle = 'rgba(180,210,220,0.5)';
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.ellipse(cx, cy, o.w * 0.22, o.h * 0.22, 0, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(cx, cy, o.w * 0.28, o.h * 0.28, 0, 0, TAU);
    ctx.stroke();
    // splash droplets
    ctx.fillStyle = '#a4c4d8';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * o.w * 0.18,
              cy + Math.sin(a) * o.h * 0.18, 1, 0, TAU);
      ctx.fill();
    }
  }

  function drawElectricalBox(ctx, o) {
    rectShadow(ctx, o, 2);
    // box body
    ctx.fillStyle = C.warn;
    ctx.fillRect(o.x, o.y, o.w, o.h);
    ctx.fillStyle = '#c08a25';
    ctx.fillRect(o.x + 1, o.y + 1, o.w - 2, 2);
    ctx.fillStyle = '#a87425';
    ctx.fillRect(o.x, o.y + o.h - 3, o.w, 3);
    // hazard stripe band
    ctx.fillStyle = '#1a0a05';
    for (let i = 0; i < o.w - 4; i += 4) {
      ctx.fillRect(o.x + 2 + i, o.y + o.h * 0.4, 2, 3);
    }
    // bolts
    ctx.fillStyle = C.metalHi;
    [[3, 3], [o.w - 4, 3], [3, o.h - 4], [o.w - 4, o.h - 4]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.arc(o.x + dx, o.y + dy, 1, 0, TAU); ctx.fill();
    });
    // lightning bolt
    ctx.fillStyle = '#1a0a05';
    ctx.beginPath();
    ctx.moveTo(o.x + o.w / 2 - 1, o.y + o.h * 0.18);
    ctx.lineTo(o.x + o.w / 2 + 2, o.y + o.h * 0.3);
    ctx.lineTo(o.x + o.w / 2, o.y + o.h * 0.32);
    ctx.lineTo(o.x + o.w / 2 + 2, o.y + o.h * 0.4);
    ctx.lineTo(o.x + o.w / 2 - 2, o.y + o.h * 0.32);
    ctx.lineTo(o.x + o.w / 2, o.y + o.h * 0.3);
    ctx.closePath(); ctx.fill();
    // sparks
    ctx.strokeStyle = C.elec;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(o.x + o.w / 2, o.y - 2);
    ctx.lineTo(o.x + o.w / 2 - 3, o.y - 6);
    ctx.lineTo(o.x + o.w / 2 + 2, o.y - 8);
    ctx.moveTo(o.x + o.w + 1, o.y + o.h / 2);
    ctx.lineTo(o.x + o.w + 4, o.y + o.h / 2 - 2);
    ctx.stroke();
    const g = ctx.createRadialGradient(o.x + o.w / 2, o.y - 4, 0, o.x + o.w / 2, o.y - 4, 10);
    g.addColorStop(0, 'rgba(127,200,255,0.5)');
    g.addColorStop(1, 'rgba(127,200,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(o.x + o.w / 2, o.y - 4, 10, 0, TAU); ctx.fill();
  }

  function drawManhole(ctx, o) {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    const r = Math.min(o.w, o.h) / 2;
    // hole rim
    ctx.fillStyle = C.metalLo;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    // metal cover
    ctx.fillStyle = C.metal;
    ctx.beginPath(); ctx.arc(cx, cy, r - 1.5, 0, TAU); ctx.fill();
    ctx.fillStyle = C.metalHi;
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1.5, Math.PI * 0.7, Math.PI * 1.3);
    ctx.lineWidth = 1.5;
    ctx.stroke();
    // pattern (radial slots)
    ctx.strokeStyle = C.metalLo;
    ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r * 0.3, cy + Math.sin(a) * r * 0.3);
      ctx.lineTo(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.7);
      ctx.stroke();
    }
    // center text
    ctx.fillStyle = C.metalLo;
    ctx.font = 'bold 6px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SEWER', cx, cy + 2);
    // hex bolts around rim
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      ctx.fillStyle = C.metalLo;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * (r - 3), cy + Math.sin(a) * (r - 3), 1, 0, TAU);
      ctx.fill();
    }
    // steam wisp
    ctx.fillStyle = 'rgba(200,210,220,0.35)';
    ctx.beginPath();
    ctx.ellipse(cx, cy - r - 4, r * 0.6, 3, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + 2, cy - r - 8, r * 0.4, 2, 0, 0, TAU);
    ctx.fill();
  }

  function drawGenerator(ctx, o) {
    rectShadow(ctx, o, 3);
    panel(ctx, o, C.warn, '#f6c25a', '#7a4f1a', 1.5);
    // engine housing top
    ctx.fillStyle = '#1a1a1f';
    ctx.fillRect(o.x + 4, o.y + 3, o.w - 8, o.h * 0.3);
    ctx.fillStyle = '#2a2a30';
    ctx.fillRect(o.x + 5, o.y + 4, o.w - 10, o.h * 0.3 - 2);
    // vents (slats)
    ctx.fillStyle = '#0a0a0c';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(o.x + 7, o.y + 6 + i * 3, o.w - 14, 1.5);
    }
    // pull cord handle
    ctx.fillStyle = C.metalHi;
    ctx.beginPath();
    ctx.arc(o.x + o.w - 4, o.y + o.h * 0.18, 2, 0, TAU); ctx.fill();
    ctx.strokeStyle = C.metalLo;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(o.x + o.w - 4, o.y + o.h * 0.18);
    ctx.lineTo(o.x + o.w - 2, o.y + o.h * 0.3);
    ctx.stroke();
    // outlet panel
    ctx.fillStyle = '#1a1a1f';
    ctx.fillRect(o.x + 4, o.y + o.h * 0.55, o.w - 8, o.h * 0.3);
    // sockets
    for (let i = 0; i < 2; i++) {
      const sx = o.x + o.w * 0.25 + i * o.w * 0.4;
      ctx.fillStyle = C.bone;
      ctx.fillRect(sx, o.y + o.h * 0.62, 7, 6);
      ctx.fillStyle = '#0a0a0c';
      ctx.fillRect(sx + 1, o.y + o.h * 0.64, 2, 2);
      ctx.fillRect(sx + 4, o.y + o.h * 0.64, 2, 2);
    }
    // gauge
    ctx.fillStyle = C.metalHi;
    ctx.beginPath();
    ctx.arc(o.x + 6, o.y + o.h * 0.45, 2, 0, TAU); ctx.fill();
    ctx.strokeStyle = C.blood;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(o.x + 6, o.y + o.h * 0.45);
    ctx.lineTo(o.x + 7, o.y + o.h * 0.44);
    ctx.stroke();
    // gas can attached
    ctx.fillStyle = C.bloodDeep || '#8a2a1a';
    ctx.fillRect(o.x - 4, o.y + o.h * 0.6, 4, 8);
    ctx.fillStyle = '#1a0a05';
    ctx.fillRect(o.x - 4, o.y + o.h * 0.6, 4, 1);
  }

  function drawFireHydrant(ctx, o) {
    const cx = o.x + o.w / 2, cy = o.y + o.h / 2;
    const r = Math.min(o.w, o.h) / 2;
    softShadow(ctx, cx, cy, r + 1, (r + 1) * 0.5);
    // main body (3 stacked discs from above — show middle bulge)
    ctx.fillStyle = '#7a1a14';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.fill();
    ctx.fillStyle = C.blood;
    ctx.beginPath(); ctx.arc(cx, cy, r - 1.5, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ec6448';
    ctx.beginPath();
    ctx.arc(cx, cy, r - 1.5, Math.PI * 0.7, Math.PI * 1.3);
    ctx.lineTo(cx, cy); ctx.closePath(); ctx.fill();
    // cap on top
    ctx.fillStyle = '#7a1a14';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.55, 0, TAU); ctx.fill();
    ctx.fillStyle = '#aa3525';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.45, 0, TAU); ctx.fill();
    // pentagon nut on top
    ctx.fillStyle = '#1a0a05';
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU - Math.PI / 2;
      const x = cx + Math.cos(a) * r * 0.25;
      const y = cy + Math.sin(a) * r * 0.25;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill();
    // side outlets (two — visible nubs at 3+9 o'clock)
    ctx.fillStyle = '#7a1a14';
    ctx.beginPath(); ctx.arc(cx - r - 1, cy, r * 0.28, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + r + 1, cy, r * 0.28, 0, TAU); ctx.fill();
    ctx.fillStyle = C.metalHi;
    ctx.beginPath(); ctx.arc(cx - r - 1, cy, r * 0.16, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + r + 1, cy, r * 0.16, 0, TAU); ctx.fill();
    // tiny chain
    ctx.strokeStyle = C.metalLo;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(cx + r + 1, cy);
    ctx.lineTo(cx + r * 0.6, cy + r * 0.6);
    ctx.stroke();
  }

  // ============================================================
  // CATALOG DATA
  // ============================================================
  const CATALOG = {
    living: {
      title: 'LIVING ROOM', count: 6,
      items: [
        { id: 'sofa', name: 'SOFA', tag: 'COVER', w: 116, h: 56,
          stat: ['hp 70', '3-seat', 'absorbs bullets'],
          copy: 'Mid-cover. Three-seat couch. The throw pillows make hp damage read at a glance — they fall off as the sofa erodes.',
          draw: drawSofa },
        { id: 'armchair', name: 'ARMCHAIR', tag: 'PROP', w: 56, h: 56,
          stat: ['hp 40', 'one-seat'],
          copy: 'Single-seat counterpart. Square footprint reads as a node — useful for breaking up open rooms.',
          draw: drawArmchair },
        { id: 'coffee', name: 'COFFEE TABLE', tag: 'LOW', w: 80, h: 48,
          stat: ['hp 30', 'low cover', 'crouch-friendly'],
          copy: 'Low table — does not block line of sight but pellets/bullets still impact. Glass insert + mug + book add the alive details.',
          draw: drawCoffeeTable },
        { id: 'bookshelf', name: 'BOOKSHELF', tag: 'TALL', w: 100, h: 40,
          stat: ['hp 110', 'blocks LOS'],
          copy: 'Long, tall obstacle. 30+ procedurally colored books per shelf — never the same shelf twice.',
          draw: drawBookshelf },
        { id: 'tvstand', name: 'TV STAND', tag: 'POWER', w: 92, h: 40,
          stat: ['hp 50', 'TV on top', 'glows'],
          copy: 'Stand + TV. Slight blue screen-glow halo so it reads as on. Smashing the screen kills the glow.',
          draw: drawTvStand },
        { id: 'rug', name: 'AREA RUG', tag: 'FLAT', w: 110, h: 76,
          stat: ['walkable', 'visual only'],
          copy: 'Ground-layer dressing. Not an obstacle — drawn under furniture to anchor a room. Fringe + medallion + border.',
          draw: drawRug },
      ],
    },
    bedroom: {
      title: 'BEDROOM + BATH', count: 6,
      items: [
        { id: 'bed', name: 'BED', tag: 'LARGE', w: 110, h: 70,
          stat: ['hp 60', 'mattress + sheets'],
          copy: 'Full bed with headboard, pillow, and a teal blanket folded across the foot. Two-tile footprint in most rooms.',
          draw: drawBed },
        { id: 'nightstand', name: 'NIGHTSTAND', tag: 'LIGHT', w: 38, h: 48,
          stat: ['hp 25', 'lamp glow'],
          copy: 'Small bedside cabinet with a lamp. Warm radial glow halo reveals it as a working light source.',
          draw: drawNightstand },
        { id: 'dresser', name: 'DRESSER', tag: 'STORAGE', w: 92, h: 52,
          stat: ['hp 90', 'drops pickups'],
          copy: '3×2 drawer grid plus a small framed photo on top. Smashing it rolls a pickup — clothes, ammo, painkillers (HP).',
          draw: drawDresser },
        { id: 'wardrobe', name: 'WARDROBE', tag: 'TALL', w: 70, h: 84,
          stat: ['hp 110', 'tall', 'blocks LOS'],
          copy: 'Double-door wardrobe. Vertical block — good for corridor pinch-points in residential biome.',
          draw: drawWardrobe },
        { id: 'toilet', name: 'TOILET', tag: 'PROP', w: 44, h: 56,
          stat: ['hp 35', 'porcelain'],
          copy: 'Tank + bowl + water highlight. Splashes a tiny puddle if destroyed (slip zone).',
          draw: drawToilet },
        { id: 'bathtub', name: 'BATHTUB', tag: 'LARGE', w: 96, h: 50,
          stat: ['hp 90', 'water inside'],
          copy: 'Rounded-end tub with water ring + faucet + drain. Could spawn full of zombie-bath horror flavor.',
          draw: drawBathtub },
      ],
    },
    kitchen: {
      title: 'KITCHEN + DINING', count: 6,
      items: [
        { id: 'fridge', name: 'FRIDGE', tag: 'TALL', w: 56, h: 80,
          stat: ['hp 140', 'magnets', 'food drops'],
          copy: 'Standard top-freezer two-door. Color magnets pop against the white. Has a chance to drop a health pickup when broken.',
          draw: drawFridge },
        { id: 'stove', name: 'STOVE', tag: 'HAZARD', w: 64, h: 64,
          stat: ['hp 70', '4 burners', 'fire'],
          copy: 'Four burners with one front-left lit. Shooting an unlit burner cycles it on — creates a fire patch zombies walk through.',
          draw: drawStove },
        { id: 'counter', name: 'KITCHEN COUNTER', tag: 'LINEAR', w: 140, h: 50,
          stat: ['hp 100', 'sink', 'long cover'],
          copy: 'Long counter with cabinetry below and a sink cutout up top. Three handles spaced evenly — placeable end-to-end for L-shaped kitchens.',
          draw: drawKitchenCounter },
        { id: 'table', name: 'DINING TABLE', tag: 'ROUND', w: 80, h: 80,
          stat: ['hp 60', 'set for two'],
          copy: 'Round wooden table with a plate, candle, and wine glass. The candle is a tiny warm dot at its center.',
          draw: drawDiningTable },
        { id: 'chair', name: 'DINING CHAIR', tag: 'SMALL', w: 32, h: 40,
          stat: ['hp 15', 'tippable'],
          copy: 'Single chair. Cheap to break and tip — place around a dining table or alone in office hallways.',
          draw: drawDiningChair },
        { id: 'island', name: 'KITCHEN ISLAND', tag: 'CENTER', w: 130, h: 64,
          stat: ['hp 180', 'marble top', 'pendant lights'],
          copy: 'Dark navy base + marble top + warm pendant glows above. Three barstool tops peeking out one side. Anchors any open kitchen.',
          draw: drawKitchenIsland },
      ],
    },
    work: {
      title: 'OFFICE + STUDY', count: 6,
      items: [
        { id: 'desk', name: 'OFFICE DESK', tag: 'STATION', w: 130, h: 60,
          stat: ['hp 80', 'monitor on', 'work scattered'],
          copy: 'Long wooden desk with monitor (code on screen), keyboard, mouse, papers, and a coffee mug. The most "lived-in" prop in the set.',
          draw: drawOfficeDesk },
        { id: 'chair', name: 'OFFICE CHAIR', tag: 'WHEELED', w: 48, h: 56,
          stat: ['hp 12', 'rolls'],
          copy: '5-leg star base + circular seat + backrest arc. Wheels mean the chair can be shoved across rooms — visual gag.',
          draw: drawOfficeChair },
        { id: 'cabinet', name: 'FILING CABINET', tag: 'METAL', w: 50, h: 84,
          stat: ['hp 160', 'paper drops', 'tall'],
          copy: 'Four drawers, each with a label slot + handle. Tough — metal — and drops a stack of papers when destroyed.',
          draw: drawFilingCabinet },
        { id: 'copier', name: 'PHOTOCOPIER', tag: 'BULKY', w: 86, h: 76,
          stat: ['hp 130', 'JAMMED'],
          copy: 'Bulky box with a glass lid, output tray, and a yellow JAMMED sticker. Status LED pulses green.',
          draw: drawPhotocopier },
        { id: 'wb', name: 'WHITEBOARD', tag: 'THIN', w: 100, h: 28,
          stat: ['hp 35', 'thin wall'],
          copy: 'Thin wall-mount. Marker scribbles and a battle plan diagram. Blocks LOS but pierce-weapons (crossbow/railgun) shoot through.',
          draw: drawWhiteboard },
        { id: 'cooler', name: 'WATER COOLER', tag: 'PROP', w: 38, h: 70,
          stat: ['hp 40', 'HP drop'],
          copy: 'Office break-room staple. Drops a small HP pickup ~50% on break (canned soda/water).',
          draw: drawWaterCooler },
      ],
    },
    public: {
      title: 'PUBLIC + RETAIL', count: 6,
      items: [
        { id: 'vending', name: 'VENDING MACHINE', tag: 'GIANT', w: 60, h: 96,
          stat: ['hp 180', 'shake-drop'],
          copy: 'Tall blood-red machine. Shooting it 3× pops a free drink (small HP). "SOLD OUT" sticker by default. Looks great in office break rooms + bus stops.',
          draw: drawVending },
        { id: 'cart', name: 'SHOPPING CART', tag: 'METAL', w: 44, h: 50,
          stat: ['hp 28', 'kickable'],
          copy: 'Wire-grid basket with handle bar and groceries inside. Player can kick it — rolls forward to body-block.',
          draw: drawShoppingCart },
        { id: 'bench', name: 'PARK BENCH', tag: 'LINEAR', w: 120, h: 32,
          stat: ['hp 50', 'low cover'],
          copy: 'Three-slat wooden bench on cast-iron arm rests. Goes great with the fountain + planter set.',
          draw: drawParkBench },
        { id: 'trash', name: 'TRASH CAN', tag: 'ROUND', w: 36, h: 36,
          stat: ['hp 25', 'flies (vfx)'],
          copy: 'Top-down circle. Three little fly dots orbit it (purely visual). Smashing reveals trash drops and stink lines.',
          draw: drawTrashCan },
        { id: 'mailbox', name: 'MAILBOX', tag: 'POST', w: 38, h: 60,
          stat: ['hp 60', 'pickup: junk'],
          copy: 'USPS-style mailbox on legs. Drops a bundle of junk mail as flavor pickup (small score bump).',
          draw: drawMailbox },
        { id: 'bus', name: 'BUS STOP', tag: 'STRUCTURE', w: 100, h: 60,
          stat: ['hp 200', 'shelter', 'ad poster'],
          copy: 'Translucent roof + bench + side ad panel + B-sign. One-tile shelter for the street biome.',
          draw: drawBusStop },
      ],
    },
    world: {
      title: 'WORLD + HAZARDS', count: 6,
      items: [
        { id: 'plant', name: 'POTTED PLANT', tag: 'NATURE', w: 50, h: 50,
          stat: ['hp 8', 'decor'],
          copy: 'Terracotta pot + leafy cluster + one pink flower. Trivial to break — purely a decor layer for offices + lobbies.',
          draw: drawPottedPlant },
        { id: 'bush', name: 'BUSH', tag: 'NATURE', w: 70, h: 56,
          stat: ['hp 25', 'soft cover'],
          copy: 'Organic blob with berries. Bullets pass through; blocks pathing for walker-class only (runners + tank shove past).',
          draw: drawBush },
        { id: 'fountain', name: 'FOUNTAIN', tag: 'CENTERPIECE', w: 88, h: 88,
          stat: ['hp ∞', 'water', 'wash blood'],
          copy: 'Round multi-basin fountain with droplet splash. Indestructible — a true map anchor for plaza-style biomes.',
          draw: drawFountain },
        { id: 'ebox', name: 'ELECTRICAL BOX', tag: 'HAZARD', w: 40, h: 56,
          stat: ['hp 20', 'sparks', 'electric DOT'],
          copy: 'Sparks visibly. Standing or walking next to it does a small electric tick. Shooting it pops a short stun-shock to nearby zombies.',
          draw: drawElectricalBox },
        { id: 'manhole', name: 'MANHOLE', tag: 'GROUND', w: 50, h: 50,
          stat: ['walkable', 'spawn point'],
          copy: 'Top-down circle with radial slots and a "SEWER" stencil. Steam wisp rising. Optional zombie-spawn portal.',
          draw: drawManhole },
        { id: 'gen', name: 'GENERATOR', tag: 'POWER', w: 70, h: 60,
          stat: ['hp 80', 'explodes', 'gas can'],
          copy: 'Portable yellow generator with vents, gauge, outlets, and a small red gas can strapped to it. Explodes like a barrel when destroyed.',
          draw: drawGenerator },
        // bonus 7th: fire hydrant — slot into world section as flavor
        { id: 'hydrant', name: 'FIRE HYDRANT', tag: 'ROUND', w: 28, h: 28,
          stat: ['hp 40', 'water spray', 'wash blood'],
          copy: 'Small but iconic. Shooting it triggers a high-pressure spray that pushes nearby zombies back for a beat and clears blood splats around it.',
          draw: drawFireHydrant },
      ],
    },
  };

  // ============================================================
  // PUBLIC
  // ============================================================
  root.ZProps = {
    palette: C, CATALOG,
    draw: {
      sofa: drawSofa, armchair: drawArmchair, coffee: drawCoffeeTable,
      bookshelf: drawBookshelf, tvstand: drawTvStand, rug: drawRug,
      bed: drawBed, nightstand: drawNightstand, dresser: drawDresser,
      wardrobe: drawWardrobe, toilet: drawToilet, bathtub: drawBathtub,
      fridge: drawFridge, stove: drawStove, counter: drawKitchenCounter,
      table: drawDiningTable, chair: drawDiningChair, island: drawKitchenIsland,
      desk: drawOfficeDesk, ochair: drawOfficeChair, cabinet: drawFilingCabinet,
      copier: drawPhotocopier, whiteboard: drawWhiteboard, cooler: drawWaterCooler,
      vending: drawVending, cart: drawShoppingCart, bench: drawParkBench,
      trash: drawTrashCan, mailbox: drawMailbox, bus: drawBusStop,
      plant: drawPottedPlant, bush: drawBush, fountain: drawFountain,
      ebox: drawElectricalBox, manhole: drawManhole, generator: drawGenerator,
      hydrant: drawFireHydrant,
    },
  };
})(window);
