'use strict';

// ---------- Weather ----------
// Per-day rolled weather state. F4a foundation for D·02 Decay (rain doubles
// wall decay — weatherDecayMult()) and B·02 Garden (rain auto-waters plants
// — isRaining()).
//
// State on Game.weather: { state, intensity, durationLeft, reducedVision,
// moveMultiplier }. `state` ∈ 'clear'|'rain'|'fog'|'blizzard'. Rolled once
// per game day at the dawn→day rollover.
//
// Particles are owned locally (recycled pool) so we don't pollute
// Game.particles.

// Probability table — biome-agnostic global roll (the world spans many
// biomes in a run; a global mood reads cleaner than per-tile flips).
const WEATHER_PROB = [
  { state: 'clear',    p: 0.60 },
  { state: 'rain',     p: 0.25 },
  { state: 'fog',      p: 0.10 },
  { state: 'blizzard', p: 0.05 },
];

const RAIN_PARTICLE_CAP    = 220;
const RAIN_SPAWN_PER_FRAME = 8;     // ~120/sec at 60fps with life ≈ 1.5
const FOG_BLOB_COUNT       = 6;
const SNOW_PARTICLE_CAP    = 180;
const SNOW_SPAWN_PER_FRAME = 6;

// Local particle pools — never pushed into Game.particles.
const weatherParticles = [];
let fogBlobs = null;       // lazily initialized; drifts in screen-space
let lastRolledDay = -1;    // tracks day rollover so we only roll once/day

function initWeather() {
  Game.weather = {
    state: 'clear',
    intensity: 0,
    durationLeft: DAY_LENGTH,
    reducedVision: false,
    moveMultiplier: 1,
  };
  weatherParticles.length = 0;
  fogBlobs = null;
  lastRolledDay = Game.time ? Game.time.day : 1;
}

// Pick a weather state from the global probability table.
function rollWeatherForDay() {
  const r = Math.random();
  let acc = 0, picked = 'clear';
  for (const row of WEATHER_PROB) {
    acc += row.p;
    if (r < acc) { picked = row.state; break; }
  }
  setWeatherState(picked);
}

function setWeatherState(state) {
  if (!Game.weather) initWeather();
  const w = Game.weather;
  w.state = state;
  w.intensity = state === 'clear' ? 0 : (state === 'blizzard' ? 1 : 0.7);
  w.durationLeft = DAY_LENGTH; // one game-day
  w.reducedVision = (state === 'fog' || state === 'blizzard');
  w.moveMultiplier = state === 'blizzard' ? 0.85 : 1;
  // Reset particles so the new state starts clean.
  weatherParticles.length = 0;
  if (state === 'fog') ensureFogBlobs();
  // Small banner so the player notices on day rollover.
  if (typeof setNotice === 'function') {
    if (state === 'rain')     setNotice('Rain rolls in', 2);
    else if (state === 'fog') setNotice('Fog settles over the world', 2);
    else if (state === 'blizzard') setNotice('A blizzard is brewing', 2.5);
  }
}

function ensureFogBlobs() {
  fogBlobs = [];
  for (let i = 0; i < FOG_BLOB_COUNT; i++) {
    fogBlobs.push({
      x: Math.random() * VIEW_W,
      y: Math.random() * VIEW_H,
      r: rand(180, 320),
      vx: rand(-12, 12),
      vy: rand(-4, 4),
    });
  }
}

function updateWeather(dt) {
  if (!Game.weather) initWeather();
  const w = Game.weather;

  // Roll fresh weather on every day rollover. Game.time.day ticks up
  // inside advanceDayPhase; we just observe the change here so weather.js
  // stays decoupled from the day-phase callsites.
  if (Game.time && Game.time.day !== lastRolledDay) {
    lastRolledDay = Game.time.day;
    rollWeatherForDay();
  }

  w.durationLeft = Math.max(0, w.durationLeft - dt);

  if (w.state === 'rain')     tickRain(dt);
  else if (w.state === 'blizzard') tickBlizzard(dt);
  else if (w.state === 'fog') tickFog(dt);
}

function tickRain(dt) {
  // Spawn new line-particles up to cap; they fall down-right in screen space
  // (camera-relative). Slight angle reads as wind.
  const toSpawn = Math.min(RAIN_SPAWN_PER_FRAME, RAIN_PARTICLE_CAP - weatherParticles.length);
  for (let i = 0; i < toSpawn; i++) {
    weatherParticles.push({
      x: Math.random() * (VIEW_W + 200) - 100,
      y: -20 - Math.random() * 40,
      vx: 80,
      vy: 600,
      life: 1.5,
      kind: 'rain',
    });
  }
  for (let i = weatherParticles.length - 1; i >= 0; i--) {
    const p = weatherParticles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0 || p.y > VIEW_H + 20) weatherParticles.splice(i, 1);
  }
}

function tickBlizzard(dt) {
  const toSpawn = Math.min(SNOW_SPAWN_PER_FRAME, SNOW_PARTICLE_CAP - weatherParticles.length);
  for (let i = 0; i < toSpawn; i++) {
    weatherParticles.push({
      x: Math.random() * (VIEW_W + 200) - 100,
      y: -20 - Math.random() * 40,
      vx: rand(40, 140),
      vy: rand(180, 280),
      r: rand(1.5, 3),
      life: 3.5,
      drift: rand(-1, 1),
      kind: 'snow',
    });
  }
  for (let i = weatherParticles.length - 1; i >= 0; i--) {
    const p = weatherParticles[i];
    p.x += (p.vx + Math.sin((p.life + p.drift) * 4) * 25) * dt;
    p.y += p.vy * dt;
    p.life -= dt;
    if (p.life <= 0 || p.y > VIEW_H + 20) weatherParticles.splice(i, 1);
  }
}

function tickFog(dt) {
  if (!fogBlobs) ensureFogBlobs();
  for (const b of fogBlobs) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    // Wrap horizontally so the curtain keeps drifting.
    if (b.x < -b.r) b.x = VIEW_W + b.r;
    if (b.x > VIEW_W + b.r) b.x = -b.r;
    if (b.y < -b.r) b.y = VIEW_H + b.r;
    if (b.y > VIEW_H + b.r) b.y = -b.r;
  }
}

// Render is screen-space. Caller is expected to call this AFTER the world
// has been drawn (camera restored) and BEFORE the HUD draws over it.
function drawWeatherOverlay(ctx, canvasW, canvasH /*, camX, camY */) {
  if (!Game.weather || Game.weather.state === 'clear') return;
  const state = Game.weather.state;
  ctx.save();
  if (state === 'rain') drawRain(ctx);
  else if (state === 'fog') drawFog(ctx, canvasW, canvasH);
  else if (state === 'blizzard') drawBlizzard(ctx, canvasW, canvasH);
  ctx.restore();
}

function drawRain(ctx) {
  ctx.strokeStyle = 'rgba(180,210,235,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (const p of weatherParticles) {
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + p.vx * 0.04, p.y + p.vy * 0.04);
  }
  ctx.stroke();
}

function drawFog(ctx, canvasW, canvasH) {
  // Base curtain.
  ctx.fillStyle = 'rgba(200,205,215,0.15)';
  ctx.fillRect(0, 0, canvasW, canvasH);
  // Drifting blobs sit on top via soft radial gradients.
  if (!fogBlobs) return;
  for (const b of fogBlobs) {
    const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    g.addColorStop(0, 'rgba(220,225,235,0.18)');
    g.addColorStop(1, 'rgba(220,225,235,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBlizzard(ctx, canvasW, canvasH) {
  // Heavier white curtain.
  ctx.fillStyle = 'rgba(220,228,238,0.22)';
  ctx.fillRect(0, 0, canvasW, canvasH);
  ctx.fillStyle = 'rgba(245,250,255,0.85)';
  for (const p of weatherParticles) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// ---------- Public helpers (read by other modules) ----------
function isRaining() {
  return !!(Game.weather && Game.weather.state === 'rain');
}
function weatherDecayMult() {
  // D·02 Decay: rain doubles wall decay. Future code multiplies its decay
  // rate by this value so the perk wiring stays local.
  return isRaining() ? 2.0 : 1.0;
}

// ---------- Save / Load ----------
function saveWeather() {
  if (!Game.weather) return null;
  const w = Game.weather;
  return {
    state: w.state,
    intensity: w.intensity,
    durationLeft: w.durationLeft,
    lastRolledDay,
  };
}
function loadWeather(data) {
  initWeather();
  if (!data) return;
  setWeatherState(data.state || 'clear');
  Game.weather.intensity    = data.intensity != null ? data.intensity : Game.weather.intensity;
  Game.weather.durationLeft = data.durationLeft != null ? data.durationLeft : DAY_LENGTH;
  lastRolledDay = data.lastRolledDay != null ? data.lastRolledDay : (Game.time ? Game.time.day : 1);
}
