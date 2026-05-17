'use strict';

// ---------- Weather ----------
// Daily weather forecast rolled at the dawn -> day boundary. Provides:
//  - Multiplier helpers consulted by game.js (player speed, sprint drain,
//    zombie speed, aggro radius, flamer ignite proc gate).
//  - A screen-space draw() called from render.js after the world but before
//    the HUD: thick fog vignette, slanted rain streaks, drifting snow.
//
// State: WEATHER.current ('clear' | 'fog' | 'heatwave' | 'rainstorm' |
// 'blizzard'). WEATHER.rolledForDay tracks which day the current forecast
// was rolled for so a resumed run keeps its forecast for the day in progress.
const WEATHER = (() => {
  const KINDS = ['clear', 'fog', 'heatwave', 'rainstorm', 'blizzard'];

  // Persistent particle pools so visuals stay coherent frame-to-frame instead
  // of strobing. Initialised lazily the first time draw() needs them.
  let rainDrops = null;
  let snowFlakes = null;

  function ensureRain() {
    if (rainDrops) return;
    rainDrops = [];
    const W = (typeof VIEW_W === 'number') ? VIEW_W : 1024;
    const H = (typeof VIEW_H === 'number') ? VIEW_H : 768;
    for (let i = 0; i < 120; i++) {
      rainDrops.push({
        x: Math.random() * W,
        y: Math.random() * H,
        l: 8 + Math.random() * 10,
        v: 720 + Math.random() * 320,
      });
    }
  }
  function ensureSnow() {
    if (snowFlakes) return;
    snowFlakes = [];
    const W = (typeof VIEW_W === 'number') ? VIEW_W : 1024;
    const H = (typeof VIEW_H === 'number') ? VIEW_H : 768;
    for (let i = 0; i < 150; i++) {
      snowFlakes.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 1 + Math.random() * 1.8,
        vx: 24 + Math.random() * 26,
        vy: 36 + Math.random() * 40,
      });
    }
  }

  function isHighland() {
    return !!(typeof World !== 'undefined' && World && World.region && World.region.name === 'highland');
  }

  function rollKind() {
    const r = Math.random();
    // 50 / 15 / 12 / 13 / 10
    if (r < 0.50) return 'clear';
    if (r < 0.65) return 'fog';
    if (r < 0.77) return 'heatwave';
    if (r < 0.90) return 'rainstorm';
    // Blizzard tail: only legal in the highland biome. Outside highland,
    // fall back to clear/fog (split the 10% evenly).
    if (isHighland()) return 'blizzard';
    return Math.random() < 0.5 ? 'clear' : 'fog';
  }

  function rollForToday() {
    api.current = rollKind();
    api.rolledForDay = (typeof Game !== 'undefined' && Game && Game.time) ? Game.time.day : 1;
    return api.current;
  }

  function bannerText() {
    switch (api.current) {
      case 'fog':       return 'A THICK FOG ROLLS IN';
      case 'heatwave':  return 'HEATWAVE — air shimmers';
      case 'rainstorm': return 'RAINSTORM — fires sputter out';
      case 'blizzard':  return 'BLIZZARD — whiteout';
      default:          return 'CLEAR SKIES';
    }
  }

  // ---- Multiplier helpers ----
  function zombieSpeedMult() {
    if (api.current === 'heatwave') return 0.7;
    if (api.current === 'blizzard') return 0.8;
    return 1;
  }
  function playerSpeedMult() {
    if (api.current === 'blizzard') return 0.8;
    return 1;
  }
  function aggroMult() {
    if (api.current === 'fog') return 0.7; // ~30% reduction in hearing radius
    return 1;
  }
  function flamerProcOK() {
    return api.current !== 'rainstorm';
  }
  function sprintDrainMult() {
    if (api.current === 'heatwave') return 2;
    return 1;
  }

  // ---- Visuals ----
  function draw(c) {
    if (!c) return;
    const W = (typeof VIEW_W === 'number') ? VIEW_W : c.canvas.width;
    const H = (typeof VIEW_H === 'number') ? VIEW_H : c.canvas.height;
    const dt = (typeof Game !== 'undefined' && Game && typeof Game.frameDt === 'number')
      ? Game.frameDt : 1 / 60;

    if (api.current === 'fog') drawFog(c, W, H);
    else if (api.current === 'rainstorm') drawRain(c, W, H, dt);
    else if (api.current === 'blizzard') drawBlizzard(c, W, H, dt);
    else if (api.current === 'heatwave') drawHeatwave(c, W, H);
    // 'clear' draws nothing.
  }

  function drawFog(c, W, H) {
    // Player-centred radial halving render distance. Fully opaque near the
    // edges, near-clear at the player's feet so they can see immediately
    // around them.
    let cx = W / 2, cy = H / 2;
    if (typeof Game !== 'undefined' && Game && Game.player && Game.camera) {
      cx = Game.player.x - Game.camera.x;
      cy = Game.player.y - Game.camera.y;
    }
    // Halve render distance: typical view radius ~ sqrt((W/2)^2+(H/2)^2).
    const fullR = Math.hypot(W, H) * 0.5;
    const inner = fullR * 0.18;
    const outer = fullR * 0.55;
    const grad = c.createRadialGradient(cx, cy, inner, cx, cy, outer);
    grad.addColorStop(0, 'rgba(190,196,205,0.05)');
    grad.addColorStop(0.55, 'rgba(190,196,205,0.55)');
    grad.addColorStop(1, 'rgba(178,184,194,0.92)');
    c.save();
    c.fillStyle = grad;
    c.fillRect(0, 0, W, H);
    // Faint uniform haze on top to grey out distant terrain too.
    c.fillStyle = 'rgba(190,196,205,0.10)';
    c.fillRect(0, 0, W, H);
    c.restore();
  }

  function drawRain(c, W, H, dt) {
    ensureRain();
    // Dark vignette
    c.save();
    const grad = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35,
                                        W / 2, H / 2, Math.hypot(W, H) * 0.55);
    grad.addColorStop(0, 'rgba(8,12,18,0)');
    grad.addColorStop(1, 'rgba(8,12,18,0.55)');
    c.fillStyle = grad;
    c.fillRect(0, 0, W, H);
    // Cool blue tint
    c.fillStyle = 'rgba(40,55,75,0.18)';
    c.fillRect(0, 0, W, H);

    // Streaks: slanted (slight wind), thin, low alpha.
    c.strokeStyle = 'rgba(180,200,225,0.55)';
    c.lineWidth = 1;
    const slantX = 0.35;
    c.beginPath();
    for (let i = 0; i < rainDrops.length; i++) {
      const d = rainDrops[i];
      d.y += d.v * dt;
      d.x += d.v * dt * slantX;
      if (d.y > H + 20 || d.x > W + 20) {
        d.x = Math.random() * W - 40;
        d.y = -20;
      }
      c.moveTo(d.x, d.y);
      c.lineTo(d.x - d.l * slantX, d.y - d.l);
    }
    c.stroke();
    c.restore();
  }

  function drawBlizzard(c, W, H, dt) {
    ensureSnow();
    c.save();
    // White-out wash
    c.fillStyle = 'rgba(225,232,240,0.35)';
    c.fillRect(0, 0, W, H);
    // Soft cold tint
    c.fillStyle = 'rgba(180,200,225,0.10)';
    c.fillRect(0, 0, W, H);
    // Drifting flakes (south-east-ish — positive vx, positive vy)
    c.fillStyle = 'rgba(255,255,255,0.92)';
    for (let i = 0; i < snowFlakes.length; i++) {
      const s = snowFlakes[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.y > H + 6) { s.y = -6; s.x = Math.random() * W; }
      if (s.x > W + 6) { s.x = -6; s.y = Math.random() * H; }
      c.beginPath();
      c.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }

  function drawHeatwave(c, W, H) {
    // Subtle warm wash — no particles, just a hint that conditions are harsh.
    c.save();
    c.fillStyle = 'rgba(255,140,60,0.08)';
    c.fillRect(0, 0, W, H);
    c.restore();
  }

  const api = {
    current: 'clear',
    rolledForDay: 0,
    KINDS,
    rollForToday,
    bannerText,
    zombieSpeedMult,
    playerSpeedMult,
    aggroMult,
    flamerProcOK,
    sprintDrainMult,
    draw,
    // For persistence: restore a saved forecast without rolling.
    restore(kind, day) {
      if (typeof kind === 'string' && KINDS.indexOf(kind) !== -1) api.current = kind;
      if (typeof day === 'number') api.rolledForDay = day;
    },
    reset() { api.current = 'clear'; api.rolledForDay = 0; },
  };
  return api;
})();
