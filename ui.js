'use strict';

// ---------- Loop ----------
let last = performance.now(), acc = 0;
function loop(t) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  // Game advances only while in 'playing' mode. 'paused' (Esc) and the
  // M-key world map both freeze the simulation.
  if (Game.mode === 'playing' && !Game.mapOpen && !Game.filesOpen) {
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
        mk('<kbd>E</kbd> &nbsp;open chest · craft at workbench · recruit survivor'),
        mk('<kbd>I</kbd> &nbsp;inventory (right-click an item to use it)'),
        mk('<kbd>P</kbd> &nbsp;perk tree (1 point per day survived)'),
        mk('<kbd>J</kbd> &nbsp;files / journals (recovered fragments persist across runs)'),
        mk('<kbd>H</kbd> &nbsp;squad: toggle HOLD / FOLLOW'),
        mk('<kbd>Shift</kbd> &nbsp;sprint (requires the Sprint perk)'),
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

// ---------- Inventory overlay (I) ----------
let __invEl = null;
function refreshInventory() {
  if (!__invEl) return;
  const p = Game.player;
  if (!p || !p.inventory) return;
  const inv = p.inventory;
  const grid = __invEl.querySelector('.inv-grid');
  if (!grid) return;
  grid.innerHTML = '';
  for (let i = 0; i < inv.slots.length; i++) {
    const s = inv.slots[i];
    const cell = el('div', { class: 'inv-cell' + (s ? ' filled' : ''), 'data-i': String(i) });
    if (s) {
      const def = ITEMS[s.id];
      const img = el('img', { src: getItemIcon(s.id), width: 36, height: 36, alt: def.name });
      cell.appendChild(img);
      if (s.count > 1) cell.appendChild(el('div', { class: 'inv-count' }, String(s.count)));
      cell.title = `${def.name} — ${def.desc}`;
      cell.addEventListener('contextmenu', e => {
        e.preventDefault();
        if (def.category === 'consumable') {
          if (useItem(inv, i)) refreshInventory();
        }
      });
    }
    grid.appendChild(cell);
  }
}
function openInventory() {
  if (Game.mode !== 'playing') return;
  Game.mapOpen = true;
  if (__invEl && !__invEl.isConnected) __invEl = null;
  if (__invEl) { __invEl.style.display = 'flex'; refreshInventory(); return; }
  __invEl = el('div', { class: 'overlay inv-overlay', style: 'background:rgba(7,8,10,0.78)' },
    el('div', { class: 'panel', style: 'max-width:520px' },
      el('div', { class: 'eyebrow' }, '// FIELD INVENTORY'),
      el('h2', { style: 'font-size:34px;margin-bottom:6px;display:flex;align-items:baseline' },
        el('span', {}, 'CARRY'),
        el('span', { style: 'margin-left:auto;font-family:var(--f-mono);font-size:10px;color:var(--muted);letter-spacing:2px' }, 'RIGHT-CLICK USE'),
      ),
      el('div', { class: 'inv-grid' }),
      el('div', { class: 'sub', style: 'margin-top:14px;font-size:11px;font-family:var(--f-mono);letter-spacing:1px' },
        'Materials go to workbenches. Close with I or Esc.'),
    )
  );
  __invEl.addEventListener('click', e => { if (e.target === __invEl) closeInventory(); });
  overlayRoot.appendChild(__invEl);
  refreshInventory();
}
function closeInventory() {
  if (__invEl) __invEl.style.display = 'none';
  if (Game.mode === 'playing') Game.mapOpen = false;
}
function isInventoryOpen() { return !!__invEl && __invEl.style.display !== 'none'; }

// ---------- Crafting overlay (workbench) ----------
let __craftEl = null;
function refreshCrafting() {
  if (!__craftEl) return;
  const list = __craftEl.querySelector('.craft-list');
  if (!list) return;
  const inv = Game.player.inventory;
  list.innerHTML = '';
  for (const r of CRAFT_RECIPES) {
    const canAfford = r.cost.every(c => hasItem(inv, c.id, c.n));
    const row = el('div', { class: 'craft-row' + (canAfford ? '' : ' poor') });
    const left = el('div', { class: 'left' },
      el('div', { class: 'nm' }, r.label),
      el('div', { class: 'desc' }, r.desc),
    );
    const costStr = r.cost.map(c => `${c.n}× ${ITEMS[c.id].name}`).join(' + ');
    const right = el('div', { class: 'right' },
      el('div', { class: 'cost' }, costStr),
      el('button', {
        class: 'primary',
        disabled: canAfford ? null : 'disabled',
        onclick: () => {
          if (!canAfford) return;
          for (const c of r.cost) removeItem(inv, c.id, c.n);
          r.apply(Game.player);
          Audio.sfx.pickup();
          refreshCrafting(); refreshInventory();
        },
      }, 'CRAFT'),
    );
    row.appendChild(left); row.appendChild(right);
    list.appendChild(row);
  }
  const headStock = __craftEl.querySelector('.craft-stock');
  if (headStock) headStock.textContent = `SCRAP · ${itemCount(inv, 'scrap')}`;
}
function openCrafting(wb) {
  if (Game.mode !== 'playing') return;
  Game.mapOpen = true;
  if (__craftEl && !__craftEl.isConnected) __craftEl = null;
  if (__craftEl) { __craftEl.style.display = 'flex'; refreshCrafting(); return; }
  __craftEl = el('div', { class: 'overlay craft-overlay', style: 'background:rgba(7,8,10,0.78)' },
    el('div', { class: 'panel', style: 'max-width:580px' },
      el('div', { class: 'eyebrow' }, '// WORKBENCH'),
      el('h2', { style: 'display:flex;align-items:baseline' },
        el('span', {}, 'CRAFT'),
        el('span', { class: 'craft-stock', style: 'margin-left:auto;font-family:var(--f-mono);font-size:12px;color:var(--toxic);letter-spacing:2px' }, ''),
      ),
      el('div', { class: 'craft-list' }),
      el('div', { class: 'sub', style: 'margin-top:14px;font-size:11px;font-family:var(--f-mono);letter-spacing:1px' },
        'Step away or press E / Esc to close.'),
    )
  );
  __craftEl.addEventListener('click', e => { if (e.target === __craftEl) closeCrafting(); });
  overlayRoot.appendChild(__craftEl);
  refreshCrafting();
}
function closeCrafting() {
  if (__craftEl) __craftEl.style.display = 'none';
  if (Game.mode === 'playing') Game.mapOpen = false;
  if (Game.player) Game.player.openCd = 0.4;
}
function isCraftingOpen() { return !!__craftEl && __craftEl.style.display !== 'none'; }

// ---------- Perk tree overlay (P) ----------
let __perkEl = null;
function refreshPerks() {
  if (!__perkEl) return;
  const lanesEl = __perkEl.querySelector('.perk-lanes');
  const headPts = __perkEl.querySelector('.perk-points');
  if (!lanesEl) return;
  if (headPts) headPts.textContent = `POINTS · ${Game.perks ? Game.perks.points : 0}`;
  lanesEl.innerHTML = '';
  for (const lane of PERK_LANES) {
    const col = el('div', { class: 'perk-lane', style: `--lane:${PERK_LANE_COLOR[lane]}` });
    col.appendChild(el('div', { class: 'perk-lane-name' }, lane.toUpperCase()));
    const list = el('div', { class: 'perk-list' });
    for (const id in PERKS) {
      const def = PERKS[id];
      if (def.lane !== lane) continue;
      const unlocked = hasPerk(id);
      const canAfford = Game.perks && Game.perks.points > 0 && !unlocked;
      const row = el('div', {
        class: 'perk-row' + (unlocked ? ' on' : '') + (canAfford ? ' buy' : ''),
        title: def.desc,
        onclick: () => { if (unlocked) return; if (unlockPerk(id)) refreshPerks(); },
      },
        el('div', { class: 'perk-mark' }, unlocked ? '●' : '○'),
        el('div', { class: 'perk-text' },
          el('div', { class: 'perk-name' }, def.name),
          el('div', { class: 'perk-desc' }, def.desc),
        ),
      );
      list.appendChild(row);
    }
    col.appendChild(list);
    lanesEl.appendChild(col);
  }
}
function openPerkTree() {
  if (Game.mode !== 'playing') return;
  Game.mapOpen = true;
  if (__perkEl && !__perkEl.isConnected) __perkEl = null;
  if (__perkEl) { __perkEl.style.display = 'flex'; refreshPerks(); return; }
  __perkEl = el('div', { class: 'overlay perk-overlay', style: 'background:rgba(7,8,10,0.86)' },
    el('div', { class: 'panel', style: 'max-width:880px' },
      el('div', { class: 'eyebrow' }, '// CHARACTER · PERK TREE'),
      el('h2', { style: 'display:flex;align-items:baseline' },
        el('span', {}, 'PERKS'),
        el('span', { class: 'perk-points', style: 'margin-left:auto;font-family:var(--f-mono);font-size:13px;color:var(--toxic);letter-spacing:2px' }, ''),
      ),
      el('div', { class: 'perk-lanes' }),
      el('div', { class: 'sub', style: 'margin-top:14px;font-size:11px;font-family:var(--f-mono);letter-spacing:1px' },
        '1 point per day survived. Perks reset on death. Press P or Esc to close.'),
    )
  );
  __perkEl.addEventListener('click', e => { if (e.target === __perkEl) closePerkTree(); });
  overlayRoot.appendChild(__perkEl);
  refreshPerks();
}
function closePerkTree() {
  if (__perkEl) __perkEl.style.display = 'none';
  if (Game.mode === 'playing') Game.mapOpen = false;
}
function isPerkTreeOpen() { return !!__perkEl && __perkEl.style.display !== 'none'; }

// ---------- F16 Files / Lore overlay (J) ----------
function openFiles() {
  Game.filesOpen = true;
  clearOverlay();
  const collected = (typeof getCollectedLoreIds === 'function') ? getCollectedLoreIds() : [];
  const collectedSet = new Set(collected);
  const total = (typeof LORE_FRAGMENTS !== 'undefined') ? LORE_FRAGMENTS.length : 0;
  const have = collectedSet.size;
  function closeFiles() {
    Game.filesOpen = false;
    clearOverlay();
  }
  const detail = el('div', {
    class: 'panel',
    style: 'max-width:520px;margin:0;align-self:stretch;background:rgba(11,12,14,0.92);overflow-y:auto;max-height:70vh',
  });
  function showDetail(frag) {
    detail.innerHTML = '';
    detail.appendChild(el('div', { class: 'eyebrow' }, '◇ ' + (frag.source || 'RECOVERED FILE')));
    detail.appendChild(el('h2', { style: 'font-size:20px;letter-spacing:3px' }, frag.title));
    detail.appendChild(el('div', { class: 'sep' }));
    detail.appendChild(el('div', {
      style: 'font-family:var(--f-body);font-size:13px;line-height:1.7;color:var(--fg);white-space:pre-wrap',
    }, frag.body));
  }
  function showEmptyDetail() {
    detail.innerHTML = '';
    detail.appendChild(el('div', { class: 'eyebrow', style: 'color:var(--muted)' }, '◇ NO FILE SELECTED'));
    detail.appendChild(el('div', { style: 'font-family:var(--f-mono);font-size:11px;color:var(--muted);line-height:1.7;margin-top:8px' },
      have === 0
        ? 'No recovered files yet. Smash nightstands, desks, dressers, filing cabinets, and bookshelves to find paper.'
        : 'Select a recovered file from the list to read it.'));
  }
  const list = el('div', {
    class: 'scroll',
    style: 'max-height:70vh;overflow-y:auto;display:flex;flex-direction:column;gap:6px',
  });
  if (typeof LORE_FRAGMENTS !== 'undefined') {
    LORE_FRAGMENTS.forEach(frag => {
      const owned = collectedSet.has(frag.id);
      const row = el('button', {
        class: owned ? '' : 'ghost',
        style: 'width:100%;text-align:left;display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:8px 10px;'
             + (owned ? '' : 'opacity:0.45;cursor:not-allowed'),
        onclick: () => {
          if (!owned) return;
          Audio.sfx.click();
          showDetail(frag);
        },
      },
        el('span', { style: 'font-family:var(--f-display);font-size:12px;letter-spacing:2px' },
          owned ? frag.title : '????????????????'),
        el('span', { style: 'font-family:var(--f-mono);font-size:10px;color:var(--muted);letter-spacing:1px' },
          owned ? (frag.source || '') : '— RECOVER TO READ —'),
      );
      if (!owned) row.disabled = true;
      list.appendChild(row);
    });
  }
  const left = el('div', { class: 'panel', style: 'max-width:380px;margin:0;background:rgba(11,12,14,0.92)' },
    el('div', { class: 'eyebrow' }, '◉ FIELD ARCHIVE'),
    el('h2', {}, 'FILES'),
    el('div', { class: 'sub' }, have + ' of ' + total + ' recovered'),
    el('div', { class: 'sep' }),
    list,
    el('div', { class: 'sep' }),
    el('button', { class: 'ghost', style: 'width:100%;display:flex;align-items:center;justify-content:space-between', onclick: () => { Audio.sfx.click(); closeFiles(); } },
      el('span', {}, 'CLOSE'), el('span', { class: 'kbd-hint' }, 'J / ESC')),
  );
  showEmptyDetail();
  overlayRoot.appendChild(el('div', { class: 'overlay', style: 'background:rgba(0,0,0,0.55)' },
    el('div', { style: 'display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap;justify-content:center' },
      left,
      detail,
    ),
  ));
}

// ---------- Esc + M + I + P + J handling ----------
window.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (Game.filesOpen) { Game.filesOpen = false; clearOverlay(); e.preventDefault(); return; }
    if (isPerkTreeOpen()) { closePerkTree(); e.preventDefault(); return; }
    if (isCraftingOpen()) { closeCrafting(); e.preventDefault(); return; }
    if (isInventoryOpen()) { closeInventory(); e.preventDefault(); return; }
    if (Game.mapOpen) { Game.mapOpen = false; e.preventDefault(); return; }
    if (Game.mode === 'playing') showPause();
    else if (Game.mode === 'paused') { clearOverlay(); Game.mode = 'playing'; }
    return;
  }
  if (e.key === 'j' || e.key === 'J') {
    if (Game.mode !== 'playing' && Game.mode !== 'paused') return;
    if (Game.filesOpen) { Game.filesOpen = false; clearOverlay(); }
    else { if (Game.mapOpen) Game.mapOpen = false; Audio.sfx.click(); openFiles(); }
    e.preventDefault();
  }
  if (e.key === 'm' || e.key === 'M') {
    if (Game.mode === 'playing' && !isInventoryOpen() && !isCraftingOpen() && !isPerkTreeOpen()) {
      Game.mapOpen = !Game.mapOpen;
      Audio.sfx.click();
      e.preventDefault();
    }
  }
  if (e.key === 'i' || e.key === 'I') {
    if (Game.mode === 'playing' && !isCraftingOpen() && !isPerkTreeOpen()) {
      if (isInventoryOpen()) closeInventory(); else openInventory();
      Audio.sfx.click();
      e.preventDefault();
    }
  }
  if (e.key === 'p' || e.key === 'P') {
    if (Game.mode === 'playing' && !isInventoryOpen() && !isCraftingOpen()) {
      if (isPerkTreeOpen()) closePerkTree(); else openPerkTree();
      Audio.sfx.click();
      e.preventDefault();
    }
  }
  if (e.key === 'e' || e.key === 'E') {
    if (isCraftingOpen()) { closeCrafting(); e.preventDefault(); }
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
