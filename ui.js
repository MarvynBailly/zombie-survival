'use strict';

// ---------- Loop ----------
let last = performance.now(), acc = 0;
function loop(t) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  // Game advances only while in 'playing' mode. 'paused' (Esc) and the
  // M-key world map both freeze the simulation.
  if (Game.mode === 'playing' && !Game.mapOpen) {
    acc += dt;
    while (acc >= TICK_DT) {
      tick(TICK_DT);
      acc -= TICK_DT;
    }
  } else {
    acc = 0;
  }
  render();
  renderHUD();
  requestAnimationFrame(loop);
}
requestAnimationFrame(t => { last = t; requestAnimationFrame(loop); });

// ---------- Overlays ----------
const overlayRoot = $('#overlay-root');
function clearOverlay() { overlayRoot.innerHTML = ''; }

function drawMenuBg(canvas) {
  canvas.width = canvas.clientWidth || 960;
  canvas.height = canvas.clientHeight || 540;
  const c = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  c.fillStyle = '#0b0c0e'; c.fillRect(0, 0, w, h);
  // tiled ground
  ZSprites.drawGround(c, { x: 0, y: 0 }, w, h, w, h, 'parking');
  c.fillStyle = 'rgba(11,12,14,0.5)'; c.fillRect(0, 0, w, h);
  // a horde silhouette in the middle distance
  for (let i = 0; i < 18; i++) {
    const x = (w * 0.35) + (i * 28) + Math.sin(i) * 40;
    const y = (h * 0.45) + Math.cos(i * 1.3) * 60;
    ZSprites.drawZombie(c, {
      type: i % 6 === 0 ? 'tank' : i % 7 === 0 ? 'fire' : i % 4 === 0 ? 'runner' : 'walker',
      x, y, r: i % 6 === 0 ? 22 : 14,
      hp: 50, maxHp: 50, angle: -2.5 + Math.cos(i) * 0.4,
      walkPhase: i * 0.13,
    });
  }
  // hero silhouette far left
  ZSprites.drawPlayer(c, w * 0.18, h * 0.6, 0.3, {
    weapon: 'shotgun', moving: false, walkPhase: 0,
    iframe: 0, muzzleFlash: 0.4,
  });
  // red glow on right
  const g = c.createRadialGradient(w * 0.7, h * 0.5, 50, w * 0.7, h * 0.5, w * 0.6);
  g.addColorStop(0, 'rgba(210,75,53,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  // vignette
  const v = c.createRadialGradient(w/2, h*0.6, 100, w/2, h*0.6, w*0.7);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.6)');
  c.fillStyle = v; c.fillRect(0, 0, w, h);
}

function showMenu() {
  Game.mode = 'menu';
  clearOverlay();

  // atmospheric background canvas
  const bgCanvas = el('canvas', { style: 'position:absolute;inset:0;width:100%;height:100%;display:block' });
  setTimeout(() => drawMenuBg(bgCanvas), 0);

  const nameInput = el('input', { type: 'text', maxlength: 24, placeholder: 'OPERATOR_NAME', value: prefs.name || '' });
  nameInput.addEventListener('input', () => { prefs.name = nameInput.value.slice(0, 24); savePrefs(); });

  // title block
  const title = el('div', { style: 'position:absolute;top:8%;left:6%;right:6%;pointer-events:none' },
    el('div', { class: 'eyebrow' }, '// SURVIVOR-LOG :: 047 ::'),
    el('h1', { class: 'title' },
      'OUT',
      el('span', { class: 'bleed' }, 'BREAK'),
    ),
    el('div', { style: 'font-family:var(--f-display);font-size:22px;letter-spacing:8px;color:var(--muted);margin-top:6px' },
      '—— TOP-DOWN SURVIVAL ARENA'),
  );

  // operator panel
  const savedRun = loadSavedGame();
  const continueBtn = savedRun ? el('button', {
    class: 'primary',
    style: 'width:100%;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between;border-color:var(--accent)',
    onclick: () => {
      if (!(prefs.name || '').trim()) { nameInput.focus(); return; }
      Audio.ensure(); Audio.sfx.click();
      continueGame(savedRun);
    },
  }, el('span', {}, `CONTINUE · DAY ${savedRun.time?.day || 1}`), el('span', { class: 'kbd-hint' }, '↵')) : null;

  const opPanel = el('div', { class: 'panel', style: 'max-width:380px;margin:0' },
    el('div', { class: 'eyebrow' }, '◉ OPERATOR'),
    el('label', {}, 'CALLSIGN'),
    nameInput,
    el('div', { class: 'sep' }),
    continueBtn,
    el('button', { class: savedRun ? '' : 'primary', style: 'width:100%;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between', onclick: () => {
      if (!(prefs.name || '').trim()) { nameInput.focus(); return; }
      Audio.ensure(); Audio.sfx.click();
      if (savedRun && !confirm('Start a new run? This will overwrite your saved game.')) return;
      clearSavedGame();
      showLevelSelect();
    } }, el('span', {}, savedRun ? 'NEW RUN' : 'DEPLOY'), el('span', { class: 'kbd-hint' }, savedRun ? 'N' : '↵')),
    el('button', { style: 'width:100%;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between', onclick: () => { Audio.sfx.click(); showLeaderboard(); } },
      el('span', {}, 'LEADERBOARD'), el('span', { class: 'kbd-hint' }, 'L')),
    el('button', { class: 'ghost', style: 'width:100%;display:flex;align-items:center;justify-content:space-between', onclick: () => { Audio.sfx.click(); showControls(); } },
      el('span', {}, 'CONTROLS'), el('span', { class: 'kbd-hint' }, '?')),
    el('div', { style: 'margin-top:14px;padding-top:10px;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-family:var(--f-mono);font-size:10px;color:var(--muted);letter-spacing:1px' },
      el('span', {}, 'NET · ' + (pbOffline ? 'OFFLINE' : 'ONLINE')),
      el('span', {}, 'v0.47'),
    ),
  );

  // record card on the right
  const recordPanel = el('div', { class: 'panel', style: 'max-width:320px;margin:0;border-top-color:var(--border-hi)' },
    el('div', { class: 'eyebrow', style: 'color:var(--muted)' }, '◇ PERSONAL RECORD'),
    el('h2', { style: 'font-size:24px;color:var(--muted)' }, 'STAND-BY'),
    el('div', { style: 'font-family:var(--f-mono);font-size:11px;color:var(--muted);line-height:1.7;letter-spacing:1px' },
      el('div', { style: 'display:flex;justify-content:space-between' },
        el('span', {}, 'RANK'), el('span', { style: 'color:var(--warn)' }, 'UNRANKED')),
      el('div', { style: 'display:flex;justify-content:space-between' },
        el('span', {}, 'LAST RUN'), el('span', {}, '—')),
      el('div', { style: 'display:flex;justify-content:space-between' },
        el('span', {}, 'BACKEND'), el('span', {}, pbOffline ? 'OFFLINE' : 'ONLINE')),
    ),
    el('div', { class: 'sep' }),
    el('div', { style: 'font-family:var(--f-mono);font-size:10px;color:var(--muted);line-height:1.6;letter-spacing:1px' },
      'Three arenas. Five weapons. Endless dead. ',
      'Survive long enough and the leaderboard remembers you.'),
  );

  const layout = el('div', { class: 'overlay', style: 'background:transparent;padding:0;justify-content:flex-end;align-items:stretch' },
    bgCanvas,
    title,
    el('div', { style: 'position:absolute;bottom:6%;left:6%;right:6%;display:flex;justify-content:space-between;align-items:flex-end;gap:20px;flex-wrap:wrap' },
      opPanel,
      recordPanel,
    ),
  );

  overlayRoot.appendChild(layout);
  $('#mute-btn').style.display = 'block';
}

function showControls() {
  clearOverlay();
  overlayRoot.appendChild(el('div', { class: 'overlay' },
    el('div', { class: 'panel', style: 'max-width:560px' },
      el('div', { class: 'eyebrow' }, '◉ FIELD MANUAL'),
      el('h2', {}, 'CONTROLS'),
      el('div', { class: 'controls-help' },
        mk('<kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> &nbsp;move'),
        mk('<kbd>Mouse</kbd> &nbsp;aim · <kbd>Left Click</kbd> &nbsp;fire'),
        mk('<kbd>1</kbd>–<kbd>6</kbd> &nbsp;switch weapon / placer'),
        mk('<kbd>R</kbd> &nbsp;reload'),
        mk('<kbd>Space</kbd> &nbsp;place barrel or wall (when its slot is active)'),
        mk('<kbd>E</kbd> &nbsp;open a chest you are standing next to (or shoot it)'),
        mk('<kbd>M</kbd> &nbsp;world map (shows the sectors you have explored)'),
        mk('<kbd>Esc</kbd> &nbsp;pause'),
      ),
      el('div', { class: 'sep' }),
      el('div', { class: 'eyebrow' }, '◇ FIELD MANUAL'),
      el('h2', {}, 'SURVIVAL'),
      el('div', { class: 'controls-help' },
        mk('<b>Day / Night</b> — daytime is calm; scavenge chests and build walls. Night brings hordes that scale with the day count.'),
        mk('<b>Chests</b> — wood near spawn, iron deeper, mythic far out. Walk closer for better loot, but enemies scale too.'),
        mk('<b>Weapons</b> — locked at start. Pick up ammo (from chests or zombie drops) to unlock that weapon.'),
        mk('<b>Walls</b> — placeable barricades; zombies will path around them, and only chew through if no other route exists.'),
      ),
      el('div', { class: 'sep' }),
      el('div', { class: 'eyebrow' }, '◇ ARMORY'),
      el('h2', {}, 'WEAPONS'),
      el('div', { class: 'controls-help' },
        mk('<b style="color:var(--accent);font-family:var(--f-display);letter-spacing:2px">1 · PISTOL</b> &nbsp;infinite ammo · single shot'),
        mk('<b style="color:var(--accent);font-family:var(--f-display);letter-spacing:2px">2 · SHOTGUN</b> &nbsp;6-pellet spread · short range'),
        mk('<b style="color:var(--accent);font-family:var(--f-display);letter-spacing:2px">3 · SMG</b> &nbsp;fast fire · small damage'),
        mk('<b style="color:var(--accent);font-family:var(--f-display);letter-spacing:2px">4 · ROCKET</b> &nbsp;AoE explosion · slow'),
        mk('<b style="color:var(--accent);font-family:var(--f-display);letter-spacing:2px">5 · BARRELS</b> &nbsp;place and chain-explode'),
        mk('<b style="color:var(--accent);font-family:var(--f-display);letter-spacing:2px">6 · WALLS</b> &nbsp;barricades · 250 HP · pick up to refill'),
      ),
      el('div', { class: 'sep' }),
      el('button', { class: 'primary', onclick: () => { Audio.sfx.click(); showMenu(); } }, 'BACK'),
    )
  ));
}
function mk(html) { const d = document.createElement('div'); d.innerHTML = html; return d; }

function showLevelSelect() {
  clearOverlay();
  const grid = el('div', { class: 'level-grid' });
  LEVELS.forEach((lv, i) => {
    const cvs = el('canvas', { width: 240, height: 180 });
    const c = cvs.getContext('2d');
    // ground via sprite
    ZSprites.drawGround(c, { x: 0, y: 0 }, 240, 180, 240, 180, lv.style || 'plains');

    // Render a representative POI for this biome. Search zones outward until
    // we hit one big enough to be interesting (skips empty / tiny POIs so the
    // preview always shows something meaty).
    const previewSeed = 0xBADC0FFE + i;
    const previewWorld = { spawnX: -1e6, spawnY: -1e6, chunkOf: World.chunkOf };
    let poi = null;
    for (let r = 1; r <= 8 && !poi; r++) {
      for (let zy = -r; zy <= r && !poi; zy++) {
        for (let zx = -r; zx <= r && !poi; zx++) {
          if (Math.max(Math.abs(zx), Math.abs(zy)) !== r) continue;
          const candidate = poiForZone(previewSeed, zx, zy, lv.region, previewWorld);
          if (candidate && candidate.tileW >= 7) poi = candidate;
        }
      }
    }

    if (poi) {
      // Fit POI footprint into the 240x180 preview with some margin
      const fwPx = poi.tileW * TILE_SIZE;
      const fhPx = poi.tileH * TILE_SIZE;
      const margin = 16;
      const scale = Math.min((240 - margin * 2) / fwPx, (180 - margin * 2) / fhPx);
      c.save();
      c.translate((240 - fwPx * scale) / 2, (180 - fhPx * scale) / 2);
      c.scale(scale, scale);
      c.translate(-poi.originX, -poi.originY);

      // Build a fake chunk and emit the POI into it so we can draw decor + obstacles.
      const fakeChunk = { obstacles: [], chests: [], decor: [], garrison: [], barrels: [] };
      const sinks = makeSinks(fakeChunk, -1e6, -1e6);
      // Override _inChunk filter for preview — accept all tiles
      sinks.obstacle = (x, y, w, h, style) => fakeChunk.obstacles.push({ x, y, w, h, style });
      sinks.tile = (tx, ty, style) => fakeChunk.obstacles.push({ x: tx * TILE_SIZE, y: ty * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE, style });
      sinks.decor = (x, y, w, h, style) => fakeChunk.decor.push({ x, y, w, h, style });
      sinks.decorTile = (tx, ty, style) => fakeChunk.decor.push({ x: tx * TILE_SIZE, y: ty * TILE_SIZE, w: TILE_SIZE, h: TILE_SIZE, style });
      sinks.chest = (x, y, tier) => fakeChunk.chests.push({ x, y, w: 36, h: 24, tier });
      sinks.garrison = () => {};
      sinks.barrel = (x, y) => fakeChunk.barrels.push({ x, y, r: 14 });
      emitPOI(poi, sinks);

      // Draw decor first, then obstacles, then chests + barrels
      for (const d of fakeChunk.decor) ZSprites.drawDecorTile(c, d);
      for (const o of fakeChunk.obstacles) ZSprites.drawObstacle(c, o, o.style || lv.style || 'plains');
      // chests as small gold dots
      for (const ch of fakeChunk.chests) {
        c.fillStyle = ch.tier === 'mythic' ? '#e3c054' : ch.tier === 'iron' ? '#cad0d8' : '#caa760';
        c.fillRect(ch.x + 2, ch.y + 6, 32, 14);
      }
      // barrels as small red dots
      c.fillStyle = '#a04a2a';
      for (const b of fakeChunk.barrels) {
        c.beginPath(); c.arc(b.x, b.y, 8, 0, Math.PI * 2); c.fill();
      }
      c.restore();
    }
    // player dot (centered in the preview)
    c.fillStyle = '#7fb6ff';
    c.beginPath();
    c.arc(120, 90, 3, 0, Math.PI * 2);
    c.fill();
    // hint at zombies on edges
    c.fillStyle = '#d24b35';
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      c.beginPath();
      c.arc(120 + Math.cos(a) * 100, 90 + Math.sin(a) * 70, 2, 0, Math.PI * 2);
      c.fill();
    }
    // border accent
    c.strokeStyle = '#2a2e36';
    c.lineWidth = 2;
    c.strokeRect(1, 1, 238, 178);

    grid.appendChild(el('div', { class: 'level-card', onclick: () => { Audio.sfx.click(); startGame(i); } },
      cvs,
      el('div', { class: 'name' }, lv.name.toUpperCase()),
      el('div', { class: 'desc' }, '// ' + lv.desc),
    ));
  });
  overlayRoot.appendChild(el('div', { class: 'overlay' },
    el('div', { class: 'panel', style: 'max-width:820px' },
      el('div', { class: 'eyebrow' }, '◉ DEPLOYMENT'),
      el('h2', {}, 'PICK A SECTOR'),
      el('div', { class: 'sub' }, 'Three arenas. Layout drives play style — open ground rewards mobility; tight aisles reward shotguns.'),
      grid,
      el('div', { class: 'sep' }),
      el('button', { class: 'ghost', onclick: () => { Audio.sfx.click(); showMenu(); } }, '← BACK'),
    )
  ));
}

function startGame(levelIndex) {
  clearOverlay();
  clearSavedGame();
  resetRun(levelIndex);
  Game.mode = 'playing';
  Audio.ensure();
}

function continueGame(save) {
  clearOverlay();
  resetRun(save.levelIndex || 0);
  restoreFromSave(save);
  Game.mode = 'playing';
  Audio.ensure();
}

function showPause() {
  Game.mode = 'paused';
  saveGame(); // capture state on pause too — in case the player closes the tab
  clearOverlay();
  overlayRoot.appendChild(el('div', { class: 'overlay' },
    el('div', { class: 'panel', style: 'max-width:380px;text-align:center' },
      el('div', { class: 'eyebrow' }, '// SIGNAL SUSPENDED'),
      el('h2', { style: 'font-size:48px;margin-bottom:18px' }, 'PAUSED'),
      el('button', { class: 'primary', style: 'width:100%;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between', onclick: () => { Audio.sfx.click(); clearOverlay(); Game.mode = 'playing'; } },
        el('span', {}, 'RESUME'), el('span', { class: 'kbd-hint' }, 'ESC')),
      el('button', { style: 'width:100%;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between', onclick: () => { Audio.sfx.click(); startGame(Game.levelIndex); } },
        el('span', {}, 'RESTART'), el('span', { class: 'kbd-hint' }, 'R')),
      el('button', { class: 'ghost', style: 'width:100%;display:flex;align-items:center;justify-content:space-between', onclick: () => { Audio.sfx.click(); showMenu(); } },
        el('span', {}, 'QUIT TO MENU'), el('span', { class: 'kbd-hint' }, 'Q')),
    )
  ));
}

async function showGameOver() {
  Game.mode = 'gameover';
  // The run is over — drop the save so the menu doesn't offer to continue a corpse.
  clearSavedGame();
  const finalScore = Math.floor(Game.score + Game.time.day * 200 + Math.floor(Game.elapsed) * 0.5);
  Game.score = finalScore;
  clearOverlay();

  const statusEl = el('div', { style: 'min-height:18px;margin-top:8px' });
  const submitBtn = el('button', { class: 'primary', style: 'display:flex;align-items:center;justify-content:space-between' },
    el('span', {}, 'SUBMIT SCORE'),
    el('span', { class: 'kbd-hint' }, '↵'));
  const lbBody = el('tbody');
  const lbTable = el('table', { class: 'lb-table' },
    el('thead', {}, el('tr', {},
      el('th', {}, '#'), el('th', {}, 'Name'), el('th', {}, 'Score'), el('th', {}, 'Days'), el('th', {}, 'Kills'),
    )),
    lbBody,
  );
  const lbWrap = el('div', { class: 'scroll', style: 'margin-top:8px' }, lbTable);

  async function refreshLb() {
    lbBody.innerHTML = '';
    try {
      const items = await fetchLeaderboard('-score');
      if (!items.length) {
        lbBody.appendChild(el('tr', {}, el('td', { colspan: '5', class: 'lb-empty' }, 'No scores yet')));
      } else {
        items.slice(0, 10).forEach((it, i) => {
          lbBody.appendChild(el('tr', {},
            el('td', {}, String(i + 1)),
            el('td', {}, it.player_name || '—'),
            el('td', {}, String(it.score || 0)),
            el('td', {}, String(it.waves_survived || 0)),
            el('td', {}, String(it.kills || 0)),
          ));
        });
      }
    } catch (e) {
      lbBody.appendChild(el('tr', {}, el('td', { colspan: '5', class: 'lb-empty' }, 'Leaderboard offline')));
    }
  }

  submitBtn.addEventListener('click', async () => {
    if (Game.scoreSubmitted) return;
    submitBtn.disabled = true;
    statusEl.textContent = 'Submitting…';
    statusEl.className = '';
    try {
      await submitScore({
        player_name: (prefs.name || 'Anonymous').slice(0, 24),
        score: finalScore,
        // Reuse the existing schema field but populate it with days survived.
        waves_survived: Math.max(0, Game.time.day - 1),
        kills: Game.kills,
        duration_seconds: Math.floor(Game.elapsed),
        weapon_stats: Game.weaponKills,
      });
      Game.scoreSubmitted = true;
      statusEl.textContent = '✓ Score submitted';
      statusEl.className = 'ok';
      submitBtn.textContent = 'SUBMITTED';
      await refreshLb();
    } catch (e) {
      statusEl.textContent = 'Could not submit (leaderboard offline)';
      statusEl.className = 'error';
      submitBtn.disabled = false;
    }
  });

  // weapon-kill breakdown
  const totalKills = Math.max(1, Object.values(Game.weaponKills).reduce((a, b) => a + b, 0));
  const breakdown = el('div', { class: 'weapon-breakdown' });
  WEAPON_ORDER.forEach(k => {
    const wd = WEAPONS[k];
    const kills = Game.weaponKills[k] || 0;
    const pct = kills / totalKills;
    const icIcon = el('img', { src: getWeaponSlotIcon(k), width: 16, height: 16, alt: wd.name });
    breakdown.appendChild(el('div', { class: 'row-w' },
      el('div', { class: 'ic' }, icIcon),
      el('div', { class: 'nm' }, wd.name.toUpperCase()),
      el('div', { class: 'bar' }, el('div', { class: 'fill', style: `width:${pct * 100}%` })),
      el('div', { class: 'ct' }, String(kills)),
    ));
  });

  const daysSurvived = Math.max(0, Game.time.day - 1);

  overlayRoot.appendChild(el('div', { class: 'overlay' },
    el('div', { class: 'panel', style: 'max-width:680px;border-top-color:var(--accent);text-align:center' },
      el('div', { class: 'signal' }, '/ / / / / ', el('span', { class: 'x' }, 'SIGNAL LOST'), ' / / / / /'),
      el('h1', { class: 'title', style: 'font-size:96px;letter-spacing:8px;color:var(--accent);text-shadow:0 0 40px rgba(210,75,53,0.4);margin-top:6px' }, 'YOU DIED'),
      el('div', { style: 'font-family:var(--f-mono);font-size:11px;letter-spacing:4px;color:var(--muted);margin-top:2px' },
        `OPERATOR · ${(prefs.name || 'ANON').toUpperCase()} · TERMINATED ${formatTime(Game.elapsed)}`),
      el('div', { class: 'sep' }),
      el('div', { class: 'stat-grid' },
        el('div', { class: 'stat-cell' },
          el('div', { class: 'l' }, 'DAYS'),
          el('div', { class: 'v' }, String(daysSurvived).padStart(2, '0')),
          el('div', { class: 'tag' }, Game.kills + ' kills total'),
        ),
        el('div', { class: 'stat-cell' },
          el('div', { class: 'l' }, 'TIME'),
          el('div', { class: 'v' }, formatTime(Game.elapsed)),
          el('div', { class: 'tag' }, 'survived'),
        ),
        el('div', { class: 'stat-cell accent' },
          el('div', { class: 'l' }, 'SCORE'),
          el('div', { class: 'v' }, String(finalScore)),
          el('div', { class: 'tag' }, '+50 / wave bonus'),
        ),
        el('div', { class: 'stat-cell' },
          el('div', { class: 'l' }, 'KILLS'),
          el('div', { class: 'v' }, String(Game.kills)),
          el('div', { class: 'tag' }, totalKills + ' tracked'),
        ),
      ),
      breakdown,
      el('div', { class: 'sep' }),
      el('div', { class: 'row' },
        submitBtn,
        el('button', { onclick: () => { Audio.sfx.click(); startGame(Game.levelIndex); } },
          el('span', {}, 'RETRY'), el('span', { class: 'kbd-hint' }, 'R')),
        el('button', { class: 'ghost', onclick: () => { Audio.sfx.click(); showMenu(); } },
          el('span', {}, 'MENU'), el('span', { class: 'kbd-hint' }, 'ESC')),
      ),
      statusEl,
      el('div', { class: 'sep' }),
      el('div', { class: 'eyebrow', style: 'color:var(--muted)' }, '◇ TOP 10 OPERATORS'),
      lbWrap,
    )
  ));
  refreshLb();
}

function showLeaderboard() {
  Game.mode = 'leaderboard';
  clearOverlay();
  let sortKey = '-score';
  const body = el('tbody');
  const statusEl = el('div', { style: 'margin-top:8px' });

  async function refresh() {
    body.innerHTML = '';
    statusEl.textContent = 'Loading…';
    statusEl.className = '';
    try {
      const items = await fetchLeaderboard(sortKey);
      statusEl.textContent = '';
      if (!items.length) {
        body.appendChild(el('tr', {}, el('td', { colspan: '6', class: 'lb-empty' }, 'No scores yet')));
        return;
      }
      items.forEach((it, i) => {
        body.appendChild(el('tr', {},
          el('td', {}, String(i + 1)),
          el('td', {}, it.player_name || '—'),
          el('td', {}, String(it.score || 0)),
          el('td', {}, String(it.waves_survived || 0)),
          el('td', {}, String(it.kills || 0)),
          el('td', {}, formatTime(it.duration_seconds || 0)),
        ));
      });
    } catch (e) {
      statusEl.textContent = 'Leaderboard offline';
      statusEl.className = 'error';
    }
  }

  const mkHead = (label, key) => el('th', { onclick: () => { sortKey = key; refresh(); } }, label);

  overlayRoot.appendChild(el('div', { class: 'overlay' },
    el('div', { class: 'panel', style: 'max-width:640px' },
      el('div', { class: 'eyebrow' }, '◇ ALL TIME'),
      el('h2', {}, 'LEADERBOARD'),
      el('div', { class: 'sub' }, 'TOP 20 OPERATORS · CLICK COLUMN TO SORT'),
      el('div', { class: 'scroll' },
        el('table', { class: 'lb-table' },
          el('thead', {}, el('tr', {},
            mkHead('#', '-score'),
            mkHead('Name', 'player_name'),
            mkHead('Score ▾', '-score'),
            mkHead('Days ▾', '-waves_survived'),
            mkHead('Kills ▾', '-kills'),
            mkHead('Time', '-duration_seconds'),
          )),
          body,
        ),
      ),
      statusEl,
      el('div', { class: 'sep' }),
      el('button', { class: 'ghost', onclick: () => { Audio.sfx.click(); showMenu(); } }, '← BACK'),
    )
  ));
  refresh();
}

// ---------- Esc + M handling ----------
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (Game.mapOpen) { Game.mapOpen = false; e.preventDefault(); return; }
    if (Game.mode === 'playing') showPause();
    else if (Game.mode === 'paused') { clearOverlay(); Game.mode = 'playing'; }
    return;
  }
  if (e.key === 'm' || e.key === 'M') {
    if (Game.mode === 'playing') {
      Game.mapOpen = !Game.mapOpen;
      Audio.sfx.click();
      e.preventDefault();
    }
  }
});

// ---------- Mute button ----------
const muteBtn = $('#mute-btn');
function refreshMuteBtn() {
  muteBtn.textContent = Audio.muted() ? '◇ MUTED' : '◉ SOUND';
}
muteBtn.addEventListener('click', () => {
  Audio.setMuted(!Audio.muted());
  refreshMuteBtn();
});
refreshMuteBtn();

// ---------- Boot ----------
showMenu();
