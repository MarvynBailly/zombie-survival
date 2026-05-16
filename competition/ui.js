'use strict';

// ============================================================================
// Bot Arena UI — main-menu screen for running bot matches / tournaments and
// inspecting the leaderboard.
// ============================================================================
//
// Public surface (window.ArenaUI):
//   .show()                     — open the arena overlay
//
// Uses the same `el(...)` helper + overlayRoot + clearOverlay used by ui.js.
// Patches showMenu() once to inject a "BOT ARENA" button into the operator
// panel.
// ============================================================================

(function () {

const ArenaUI = window.ArenaUI = window.ArenaUI || {};

// Stored UI prefs (which bots are selected, last run count, last level).
const UI_PREF_KEY = 'zombie-survival:arena-ui';
function loadUiPrefs() {
  try { return JSON.parse(localStorage.getItem(UI_PREF_KEY)) || {}; }
  catch (_) { return {}; }
}
function saveUiPrefs(o) {
  try { localStorage.setItem(UI_PREF_KEY, JSON.stringify(o)); } catch (_) {}
}

ArenaUI.show = function () {
  Game.mode = 'menu';
  clearOverlay();

  const names = Arena.list();
  const prefs = loadUiPrefs();
  const selected = new Set(prefs.bots && prefs.bots.length ? prefs.bots : names);
  let runs       = Math.max(1, Math.min(50, +prefs.runs || 5));
  let levelIndex = Math.max(0, Math.min((LEVELS || []).length - 1, +prefs.level || 0));

  // ----- Header -----
  const header = el('div', { class: 'eyebrow' }, '◉ BOT ARENA');
  const title  = el('h2', {}, 'COMPETITION');
  const sub    = el('div', { class: 'sub' },
    `Each bot plays N matches on the same level. Ranked by mean score; ties broken by mean days survived. ${names.length} bot${names.length===1?'':'s'} registered.`);

  // ----- Bot selection -----
  const botList = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;margin-top:8px;font-family:var(--f-mono);font-size:12px' });
  for (const name of names) {
    const bot = Arena.get(name);
    const cb = el('input', { type: 'checkbox' });
    cb.checked = selected.has(name);
    cb.addEventListener('change', () => {
      if (cb.checked) selected.add(name); else selected.delete(name);
    });
    const row = el('label', {
      style: 'display:flex;align-items:center;gap:8px;cursor:pointer;padding:4px 6px;border:1px solid var(--border);border-radius:3px',
    }, cb, el('span', {}, `${name}`),
       el('span', { style: 'flex:1' }, ''),
       el('span', { style: 'color:var(--muted);font-size:10px' }, `v${bot.version || '0'} · ${bot.author || '?'}`));
    botList.appendChild(row);
  }
  if (!names.length) {
    botList.appendChild(el('div', { style: 'color:var(--muted);font-style:italic' },
      'No bots registered. Drop a file into competition/bots/ and add a <script> tag.'));
  }

  // ----- Level + runs -----
  const levelSel = el('select', { style: 'background:#0b0c0e;color:#e8e6df;border:1px solid var(--border);padding:6px;font-family:var(--f-mono)' });
  (LEVELS || []).forEach((lv, i) => {
    const opt = el('option', { value: String(i) }, `${i}: ${lv.name}`);
    if (i === levelIndex) opt.selected = true;
    levelSel.appendChild(opt);
  });
  levelSel.addEventListener('change', () => { levelIndex = +levelSel.value; });

  const runsInput = el('input', {
    type: 'number', min: '1', max: '50', value: String(runs),
    style: 'width:60px;background:#0b0c0e;color:#e8e6df;border:1px solid var(--border);padding:6px;font-family:var(--f-mono)',
  });
  runsInput.addEventListener('change', () => { runs = Math.max(1, Math.min(50, +runsInput.value || 1)); });

  const controlsRow = el('div', { style: 'display:flex;gap:14px;align-items:center;margin-top:14px;font-family:var(--f-mono);font-size:12px' },
    el('label', {}, 'LEVEL'), levelSel,
    el('label', { style: 'margin-left:8px' }, 'RUNS / BOT'), runsInput,
  );

  // ----- Status / progress line -----
  const statusEl = el('div', { style: 'margin-top:10px;font-family:var(--f-mono);font-size:11px;color:var(--muted);min-height:14px' }, 'Ready.');
  function setStatus(s) { statusEl.textContent = s; }

  // ----- Leaderboard -----
  const tbody = el('tbody');
  const lbTable = el('table', { class: 'lb-table', style: 'width:100%;margin-top:8px' },
    el('thead', {}, el('tr', {},
      el('th', {}, '#'),
      el('th', {}, 'Bot'),
      el('th', {}, 'Runs'),
      el('th', {}, 'Score (mean ± σ)'),
      el('th', {}, 'Days (mean / best)'),
      el('th', {}, 'Kills (mean)'),
      el('th', {}, 'Best score'),
    )),
    tbody,
  );
  function refreshLb() {
    tbody.innerHTML = '';
    const ranked = Tournament.summarize();
    if (!ranked.length) {
      tbody.appendChild(el('tr', {}, el('td', { colspan: '7', class: 'lb-empty' }, 'No results yet — run a match.')));
      return;
    }
    ranked.forEach((r, i) => {
      tbody.appendChild(el('tr', {},
        el('td', {}, String(i + 1)),
        el('td', {}, r.bot),
        el('td', {}, String(r.runs)),
        el('td', {}, `${r.meanScore} ± ${r.stdScore}`),
        el('td', {}, `${r.meanDays.toFixed(1)} / ${r.bestDays}`),
        el('td', {}, String(r.meanKills)),
        el('td', {}, String(r.bestScore)),
      ));
    });
  }

  // ----- Action buttons -----
  function persistPrefs() {
    saveUiPrefs({ bots: Array.from(selected), runs, level: levelIndex });
  }

  const runMatchBtn = el('button', {
    class: 'primary', style: 'flex:1',
    onclick: () => {
      const names = Array.from(selected);
      if (!names.length) { setStatus('Select at least one bot.'); return; }
      persistPrefs();
      const bot = names[0];
      setStatus(`Match: ${bot} on level ${levelIndex}…`);
      clearOverlay();
      Tournament.runMatch(bot, levelIndex).then((result) => {
        setStatus(`Match complete: ${bot} → score ${result.score}, days ${result.days}, kills ${result.kills}`);
        ArenaUI.show();      // re-open the arena UI when the match ends
      }, (err) => {
        console.error(err);
        ArenaUI.show();
      });
    },
  }, 'RUN MATCH (first selected)');

  const runTourneyBtn = el('button', {
    class: 'primary', style: 'flex:1',
    onclick: () => {
      const botNames = Array.from(selected);
      if (!botNames.length) { setStatus('Select at least one bot.'); return; }
      persistPrefs();
      setStatus(`Tournament: ${botNames.length} bot(s) × ${runs} runs on level ${levelIndex}…`);
      clearOverlay();
      Tournament.runTournament(botNames, levelIndex, runs).then((result) => {
        console.table(result.ranked);
        setStatus(`Tournament complete. Top bot: ${result.ranked[0] ? result.ranked[0].bot : '—'} (mean ${result.ranked[0] ? result.ranked[0].meanScore : 0})`);
        ArenaUI.show();
      }, (err) => {
        console.error(err);
        ArenaUI.show();
      });
    },
  }, 'RUN TOURNAMENT');

  const watchLiveBtn = el('button', {
    class: 'primary', style: 'flex:1',
    onclick: () => {
      const botNames = Array.from(selected);
      if (!botNames.length) { setStatus('Select at least one bot.'); return; }
      persistPrefs();
      ArenaUI.openSideBySide(botNames, levelIndex, runs);
    },
  }, 'WATCH SIDE-BY-SIDE');

  const clearBtn = el('button', {
    class: 'ghost', style: 'flex:0 0 auto',
    onclick: () => {
      if (!confirm('Wipe all stored arena results?')) return;
      Tournament.clearResults();
      refreshLb();
      setStatus('Results cleared.');
    },
  }, 'CLEAR RESULTS');

  const exportBtn = el('button', {
    class: 'ghost', style: 'flex:0 0 auto',
    onclick: () => {
      const blob = new Blob([JSON.stringify({
        when: new Date().toISOString(),
        summary: Tournament.summarize(),
        raw: Tournament.results,
      }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'arena-results.json';
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
    },
  }, 'EXPORT JSON');

  // ----- Assembly -----
  const panel = el('div', { class: 'panel', style: 'max-width:860px;width:90%' },
    header, title, sub,
    el('div', { class: 'sep' }),
    el('div', { class: 'eyebrow' }, '◇ BOTS'),
    botList,
    controlsRow,
    el('div', { style: 'display:flex;gap:8px;margin-top:14px;flex-wrap:wrap' },
      runMatchBtn, runTourneyBtn, watchLiveBtn, clearBtn, exportBtn,
    ),
    statusEl,
    el('div', { class: 'sep' }),
    el('div', { class: 'eyebrow' }, '◇ LEADERBOARD (local, mean across runs)'),
    el('div', { class: 'scroll' }, lbTable),
    el('div', { class: 'sep' }),
    el('div', { style: 'display:flex;justify-content:space-between' },
      el('button', { class: 'ghost', onclick: () => { Audio.sfx.click(); showMenu(); } }, '← BACK TO MENU'),
      el('span', { style: 'font-family:var(--f-mono);font-size:10px;color:var(--muted);align-self:center' },
        `${names.length} bot${names.length===1?'':'s'} · ${Tournament.results.length} run${Tournament.results.length===1?'':'s'} logged`),
    ),
  );

  overlayRoot.appendChild(el('div', { class: 'overlay' }, panel));
  refreshLb();
};

// ============================================================================
// Side-by-side viewer
// ============================================================================
//
// Opens a grid of iframes — one per selected bot — each autostart-loading
// the game with that bot. Listens to postMessage from each iframe for live
// status and final results. After every iframe finishes, the parent shows
// the ranked summary in a side panel and offers another round.
// ============================================================================

let _liveListener = null;
let _liveSlots = [];        // [{bot, matchId, frame, statusEl, result, lastTick}]
let _liveLevel = 0;
let _liveRunsRemaining = 0;
let _liveRoundIndex = 0;
let _liveResults = [];      // accumulated across rounds

ArenaUI.openSideBySide = function (botNames, levelIndex, runsPerBot) {
  if (!botNames.length) return;
  Game.mode = 'menu';
  clearOverlay();

  // Hide the underlying game canvas while the iframe grid takes over.
  const gameCanvas = document.querySelector('#game');
  if (gameCanvas) gameCanvas.style.display = 'none';
  const hudRoot = document.querySelector('#hud-root');
  if (hudRoot)   hudRoot.style.display = 'none';

  _liveLevel = levelIndex;
  _liveRunsRemaining = Math.max(1, runsPerBot | 0);
  _liveRoundIndex = 0;
  _liveResults = [];

  // ----- Build container -----
  const root = document.createElement('div');
  root.style.cssText = [
    'position:fixed', 'inset:0', 'background:#0a0b0e',
    'display:flex', 'flex-direction:column', 'z-index:50',
    'font-family:var(--f-mono),monospace', 'color:#e8e6df',
  ].join(';');

  const headerEl = document.createElement('div');
  headerEl.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:1px solid #2a2e36;background:#0b0c0e';
  headerEl.innerHTML = `
    <div style="display:flex;gap:18px;align-items:baseline">
      <span style="font-family:var(--f-display);letter-spacing:3px;color:#caa760">// ARENA · LIVE</span>
      <span class="round-info" style="color:#7a7e88;font-size:11px"></span>
    </div>
    <div class="ctl" style="display:flex;gap:8px"></div>
  `;
  const roundInfo = headerEl.querySelector('.round-info');
  const ctl = headerEl.querySelector('.ctl');

  // Main grid area
  const grid = document.createElement('div');
  grid.style.cssText = 'flex:1;display:grid;gap:6px;padding:6px;overflow:hidden';
  // Compute grid dimensions: tries to keep aspect roughly 4:3 per cell.
  const n = botNames.length;
  const cols = Math.ceil(Math.sqrt(n * (16 / 9)));
  const rows = Math.ceil(n / cols);
  grid.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  grid.style.gridTemplateRows    = `repeat(${rows}, minmax(0, 1fr))`;

  // ----- Per-bot cells -----
  _liveSlots = botNames.map((bot) => {
    const cell = document.createElement('div');
    cell.style.cssText = 'position:relative;display:flex;flex-direction:column;border:1px solid #2a2e36;background:#0d0e11;overflow:hidden';

    const banner = document.createElement('div');
    banner.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:4px 8px;font-size:11px;background:rgba(11,12,14,0.85);border-bottom:1px solid #2a2e36';
    const status = document.createElement('span');
    status.textContent = 'idle';
    status.style.color = '#7a7e88';
    banner.innerHTML = `<span style="font-family:var(--f-display);letter-spacing:2px;color:#e8e6df">${bot}</span>`;
    banner.appendChild(status);

    const frameWrap = document.createElement('div');
    frameWrap.style.cssText = 'flex:1;position:relative;background:#000';
    const frame = document.createElement('iframe');
    frame.style.cssText = 'width:100%;height:100%;border:0;display:block';
    frame.setAttribute('allow', 'autoplay');
    frame.setAttribute('loading', 'eager');
    frameWrap.appendChild(frame);

    cell.appendChild(banner);
    cell.appendChild(frameWrap);
    grid.appendChild(cell);

    return { bot, matchId: '', frame, statusEl: status, result: null, lastTick: null };
  });

  // ----- Footer with controls -----
  const footer = document.createElement('div');
  footer.style.cssText = 'padding:8px 12px;border-top:1px solid #2a2e36;background:#0b0c0e;display:flex;justify-content:space-between;align-items:center';
  const statusLine = document.createElement('span');
  statusLine.style.cssText = 'font-size:11px;color:#7a7e88';
  footer.appendChild(statusLine);
  const footerBtns = document.createElement('div');
  footerBtns.style.cssText = 'display:flex;gap:8px';
  footer.appendChild(footerBtns);

  function mkButton(label, primary, onClick) {
    const b = document.createElement('button');
    b.textContent = label;
    b.className = primary ? 'primary' : 'ghost';
    b.style.cssText = 'padding:6px 14px;font-family:var(--f-display);letter-spacing:2px;font-size:11px;background:' +
      (primary ? '#caa760' : 'transparent') + ';color:' + (primary ? '#0a0b0e' : '#e8e6df') +
      ';border:1px solid ' + (primary ? '#caa760' : '#2a2e36') + ';cursor:pointer';
    b.addEventListener('click', onClick);
    return b;
  }

  const roundBtn = mkButton('NEW ROUND', true, () => {
    if (_liveListener) startRound(botNames, _liveLevel);
  });
  const closeBtn = mkButton('CLOSE', false, () => closeSideBySide());
  ctl.appendChild(closeBtn);
  footerBtns.appendChild(roundBtn);

  document.body.appendChild(root);
  root.appendChild(headerEl);
  root.appendChild(grid);
  root.appendChild(footer);

  // ----- Wire postMessage listener -----
  _liveListener = (ev) => {
    if (!ev.data || typeof ev.data !== 'object') return;
    const { type, matchId } = ev.data;
    const slot = _liveSlots.find(s => s.matchId === matchId);
    if (!slot) return;
    if (type === 'arena:tick') {
      slot.lastTick = ev.data;
      slot.statusEl.style.color = '#e8e6df';
      slot.statusEl.textContent = `hp ${ev.data.hp}/${ev.data.maxHp} · day ${ev.data.days} · score ${ev.data.score} · kills ${ev.data.kills}`;
    } else if (type === 'arena:match-complete') {
      slot.result = ev.data.result;
      slot.statusEl.style.color = '#5be3a4';
      slot.statusEl.textContent = `done · score ${ev.data.result.score} · days ${ev.data.result.days} · kills ${ev.data.result.kills}`;
      _liveResults.push(ev.data.result);
      onSlotDone();
    } else if (type === 'arena:match-error') {
      slot.result = { error: ev.data.error };
      slot.statusEl.style.color = '#ff6464';
      slot.statusEl.textContent = `error: ${ev.data.error || 'unknown'}`;
      onSlotDone();
    }
  };
  window.addEventListener('message', _liveListener);

  function setStatusLine(text) { statusLine.textContent = text; }

  function startRound(names, lvl) {
    _liveRoundIndex++;
    roundInfo.textContent = `round ${_liveRoundIndex} of ${_liveRunsRemaining + _liveRoundIndex - 1}  ·  level ${lvl}`;
    setStatusLine(`Starting round ${_liveRoundIndex}…`);

    // Reset slot UIs and load fresh iframes.
    _liveSlots.forEach((slot) => {
      slot.matchId = 'm' + Math.random().toString(36).slice(2, 8);
      slot.result = null;
      slot.lastTick = null;
      slot.statusEl.style.color = '#caa760';
      slot.statusEl.textContent = 'loading…';
      const url = 'index.html?autostart=1' +
                  '&bot=' + encodeURIComponent(slot.bot) +
                  '&level=' + lvl +
                  '&matchId=' + slot.matchId;
      slot.frame.src = url;
    });
    roundBtn.disabled = true;
    roundBtn.style.opacity = '0.5';
  }

  function onSlotDone() {
    const done = _liveSlots.every(s => s.result !== null);
    if (!done) return;
    // Summarise this round and decide whether to chain another.
    const summary = Tournament.summarize(_liveResults);
    console.table(summary);
    const top = summary[0];
    setStatusLine(`Round done. Top: ${top ? top.bot : '—'} (mean score ${top ? top.meanScore : 0})`);
    if (_liveRoundIndex < _liveRunsRemaining) {
      // Auto-chain
      setTimeout(() => startRound(botNames, _liveLevel), 700);
    } else {
      // All rounds done — show final ranking summary.
      showRoundSummary(summary);
      roundBtn.disabled = false;
      roundBtn.style.opacity = '1';
      // Reset rounds for next click
      _liveRoundIndex = 0;
      _liveRunsRemaining = Math.max(1, _liveRunsRemaining);
    }
  }

  function showRoundSummary(summary) {
    // Append a transient panel over the grid.
    const existing = root.querySelector('.summary-panel');
    if (existing) existing.remove();
    const panel = document.createElement('div');
    panel.className = 'summary-panel';
    panel.style.cssText = 'position:absolute;right:18px;bottom:60px;width:360px;background:rgba(11,12,14,0.95);border:1px solid #caa760;padding:10px 14px;font-size:11px;line-height:1.55;box-shadow:0 8px 20px rgba(0,0,0,0.4);z-index:5';
    let rows = '<div style="font-family:var(--f-display);letter-spacing:3px;color:#caa760;margin-bottom:6px">FINAL RANKING</div>';
    rows += '<table style="width:100%;border-collapse:collapse">';
    rows += '<tr style="color:#7a7e88;text-align:left"><th style="text-align:left">#</th><th style="text-align:left">bot</th><th>score</th><th>days</th><th>kills</th></tr>';
    summary.forEach((r, i) => {
      rows += `<tr><td>${i+1}</td><td>${r.bot}</td><td>${r.meanScore}</td><td>${r.meanDays.toFixed(1)}</td><td>${r.meanKills}</td></tr>`;
    });
    rows += '</table>';
    panel.innerHTML = rows;
    root.appendChild(panel);
  }

  function closeSideBySide() {
    if (_liveListener) {
      window.removeEventListener('message', _liveListener);
      _liveListener = null;
    }
    _liveSlots = [];
    _liveResults = [];
    _liveRoundIndex = 0;
    if (root.parentNode) root.parentNode.removeChild(root);
    if (gameCanvas) gameCanvas.style.display = '';
    ArenaUI.show();
  }

  // Kick off round 1.
  startRound(botNames, levelIndex);
};

// --------------------------------------------------------------------------
// Patch showMenu() to add a "BOT ARENA" button to the operator panel.
// We hook lazily by replacing showMenu and re-injecting our button after the
// original renders the menu.
// --------------------------------------------------------------------------
const _origShowMenu = window.showMenu;
window.showMenu = function () {
  _origShowMenu.apply(this, arguments);
  try {
    // Insert into the operator panel — find the leaderboard button and slot
    // ourselves right above it.
    const buttons = overlayRoot.querySelectorAll('.panel button');
    let lbBtn = null;
    for (const b of buttons) {
      if ((b.textContent || '').includes('LEADERBOARD')) { lbBtn = b; break; }
    }
    if (lbBtn && !overlayRoot.querySelector('[data-arena-btn]')) {
      const btn = el('button', {
        style: 'width:100%;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between',
        onclick: () => { Audio.sfx.click(); ArenaUI.show(); },
      }, el('span', {}, 'BOT ARENA'), el('span', { class: 'kbd-hint' }, 'A'));
      btn.setAttribute('data-arena-btn', '1');
      lbBtn.parentNode.insertBefore(btn, lbBtn);
    }
  } catch (e) {
    console.warn('[ArenaUI] could not inject menu button:', e);
  }
};

// Keyboard shortcut: A from main menu opens the arena.
window.addEventListener('keydown', (e) => {
  if (Game.mode === 'menu' && e.key && e.key.toLowerCase() === 'a') {
    // Don't hijack while the user is typing into the callsign input.
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    ArenaUI.show();
  }
});

console.log('[ArenaUI] ui.js loaded');

})();
