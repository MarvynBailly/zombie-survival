'use strict';

// ============================================================================
// Bot Arena harness — match + tournament runner
// ============================================================================
//
// One bot at a time drives the player by writing into input.keys / input.mouseX,Y
// / input.mouseDown via Arena.applyAction. On player death we capture metrics,
// optionally schedule the next match, and update the leaderboard in localStorage.
//
// Public surface (window.Tournament):
//   .runMatch(botName, levelIndex)              -> Promise<MatchResult>
//   .runTournament(botNames, levelIndex, runs)  -> Promise<{ ranked, raw }>
//   .results                                    -> persisted run log (read)
//   .clearResults()
//   .stop()
//   .isRunning()
//
// Console-friendly: `Tournament.runTournament(['marvyn','simple'], 0, 3).then(...)`.
// ============================================================================

(function () {

const RESULTS_KEY = 'zombie-survival:arena-results';

// --------------------------------------------------------------------------
// Persistent results store. One row per (bot, levelIndex, runIndex).
// --------------------------------------------------------------------------
function loadResults() {
  try {
    const raw = localStorage.getItem(RESULTS_KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? v : [];
  } catch (_) { return []; }
}
function saveResults(rows) {
  try { localStorage.setItem(RESULTS_KEY, JSON.stringify(rows.slice(-2000))); }
  catch (_) { /* quota — drop silently */ }
}

const T = window.Tournament = {
  _state: 'idle',            // 'idle' | 'running'
  _activeBot: null,
  _activeLevel: 0,
  _activeRunIndex: 0,
  _tick: 0,
  _matchStartedAt: 0,
  _maxRunSeconds: 60 * 12,   // hard cap per match (12 minutes) so a runaway bot doesn't lock the queue
  _onComplete: null,         // resolve fn for current match promise
  _queue: [],                // pending matches for tournaments
  _onQueueDone: null,
  _watcherT: 0,              // seconds since this match started
  _showOverlay: true,        // draw an info overlay while a match runs
  results: loadResults(),
};

T.isRunning = function () { return T._state === 'running'; };

T.clearResults = function () {
  T.results = [];
  saveResults(T.results);
};

T.stop = function () {
  if (T._state !== 'running') return;
  Arena.releaseAll();
  const prev = T._onComplete;
  T._state = 'idle';
  T._activeBot = null;
  T._queue.length = 0;
  T._onComplete = null;
  T._onQueueDone = null;
  if (prev) prev({ aborted: true });
};

// --------------------------------------------------------------------------
// Internal: the tick hook. Built by wrapping window.tick.
// --------------------------------------------------------------------------
const _origTick = window.tick;
const _api = Arena.makeApi();

window.tick = function (dt) {
  _origTick(dt);
  if (T._state !== 'running' || !T._activeBot) return;
  if (Game.mode !== 'playing') return;
  T._tick++;
  T._watcherT += dt;

  // Hard cap: end the run if it goes absurdly long.
  if (T._watcherT > T._maxRunSeconds) {
    _completeMatch('timeout');
    return;
  }

  // Build perception and let the bot decide.
  let perception, action = null;
  try {
    perception = Arena.buildPerception(T._tick);
  } catch (e) {
    console.error('[Tournament] buildPerception failed:', e);
    _completeMatch('perception-error');
    return;
  }
  try {
    action = T._activeBot.decide(perception, _api);
  } catch (e) {
    console.error(`[Tournament] bot "${T._activeBot.name}" threw:`, e);
    action = null;
  }
  Arena.applyAction(action);
};

// We watch Game.player.dead in the same hook because the game schedules
// showGameOver() via setTimeout(...900ms) — we want to capture results before
// that overlay opens (and we suppress the overlay during a tournament).
const _origShowGameOver = (typeof showGameOver === 'function') ? showGameOver : null;
window.showGameOver = function () {
  if (T._state === 'running') {
    // Eat the modal during a match — harness handles transitions.
    _completeMatch('died');
    return;
  }
  if (_origShowGameOver) return _origShowGameOver.apply(this, arguments);
};

// --------------------------------------------------------------------------
// Internal: match completion.
// --------------------------------------------------------------------------
function _completeMatch(reason) {
  if (T._state !== 'running') return;
  const bot = T._activeBot;
  const result = {
    bot:        bot.name,
    botVersion: bot.version || '0',
    author:     bot.author  || '',
    levelIndex: T._activeLevel,
    runIndex:   T._activeRunIndex,
    score:      Math.floor(Game.score + Game.time.day * 200 + Math.floor(Game.elapsed) * 0.5),
    days:       Math.max(0, Game.time.day - 1),
    kills:      Game.kills,
    elapsed:    Math.floor(Game.elapsed),
    reason,
    when:       Date.now(),
  };
  T.results.push(result);
  saveResults(T.results);

  // Notify match listener.
  const cb = T._onComplete;
  T._onComplete = null;
  T._activeBot = null;
  Arena.releaseAll();

  // If there's more queued, fire next match; otherwise idle out.
  if (T._queue.length > 0) {
    // Brief gap so the previous game's reset and DOM settle.
    setTimeout(() => {
      const next = T._queue.shift();
      _startMatchNow(next.bot, next.levelIndex, next.runIndex);
    }, 250);
  } else {
    T._state = 'idle';
    const qd = T._onQueueDone;
    T._onQueueDone = null;
    if (qd) qd();
  }
  if (cb) cb(result);
}

// --------------------------------------------------------------------------
// Internal: kick off a single match.
// --------------------------------------------------------------------------
function _startMatchNow(bot, levelIndex, runIndex) {
  // Lint warns (non-fatal).
  const lint = Arena.lintBot(bot);
  if (!lint.ok && lint.hits && lint.hits.length) {
    console.warn(`[Tournament] bot "${bot.name}" references forbidden globals: ${lint.hits.join(', ')}`);
  }

  T._state = 'running';
  T._activeBot = bot;
  T._activeLevel = levelIndex;
  T._activeRunIndex = runIndex;
  T._tick = 0;
  T._watcherT = 0;
  T._matchStartedAt = performance.now();

  // Make sure no overlay is hanging on the screen.
  if (typeof clearOverlay === 'function') {
    try { clearOverlay(); } catch (_) {}
  }
  if (typeof clearSavedGame === 'function') {
    try { clearSavedGame(); } catch (_) {}
  }
  resetRun(levelIndex);
  Game.mode = 'playing';
  if (typeof Audio !== 'undefined' && Audio.ensure) Audio.ensure();

  // Allow bots to clear per-match state.
  if (typeof bot.reset === 'function') {
    try { bot.reset(); } catch (e) { console.error('bot.reset threw:', e); }
  }

  // Make sure the legacy B-toggle bot (bot.js) isn't also driving input — if a
  // human left it on before opening the arena, two hands on the wheel will
  // produce a mess.
  if (typeof window.bot === 'object' && window.bot && typeof window.bot.stop === 'function') {
    try { window.bot.stop(); } catch (_) {}
  }

  console.log(`[Tournament] match start: bot="${bot.name}" level=${levelIndex} run=${runIndex}`);
}

// --------------------------------------------------------------------------
// Public: run a single match. Returns a Promise that resolves with the
// recorded result when the player dies (or the run times out / aborts).
// --------------------------------------------------------------------------
T.runMatch = function (botName, levelIndex) {
  if (T._state !== 'idle') return Promise.reject(new Error('tournament already running'));
  const bot = Arena.get(botName);
  if (!bot) return Promise.reject(new Error(`unknown bot "${botName}"`));
  if (typeof LEVELS === 'undefined') return Promise.reject(new Error('LEVELS not loaded yet'));
  const li = Math.max(0, Math.min(LEVELS.length - 1, levelIndex | 0));

  return new Promise((resolve) => {
    T._onComplete = resolve;
    _startMatchNow(bot, li, 0);
  });
};

// --------------------------------------------------------------------------
// Public: run a full tournament. Each bot plays `runs` matches on the same
// level, in interleaved order so a single bad seed doesn't sit on one bot.
// Returns ranked summary + raw results.
// --------------------------------------------------------------------------
T.runTournament = function (botNames, levelIndex, runs) {
  if (T._state !== 'idle') return Promise.reject(new Error('tournament already running'));
  if (!Array.isArray(botNames) || !botNames.length) {
    return Promise.reject(new Error('need at least one bot name'));
  }
  const li = Math.max(0, Math.min(LEVELS.length - 1, (levelIndex | 0)));
  const n = Math.max(1, runs | 0);

  const bots = botNames.map(name => Arena.get(name)).filter(Boolean);
  if (!bots.length) return Promise.reject(new Error('no bots found by those names'));
  const firstRun = T.results.length;

  // Interleave: run 1 of A, run 1 of B, run 2 of A, run 2 of B, ...
  for (let r = 0; r < n; r++) {
    for (const b of bots) T._queue.push({ bot: b, levelIndex: li, runIndex: r });
  }

  return new Promise((resolve) => {
    T._onQueueDone = () => {
      const slice = T.results.slice(firstRun);
      resolve({ ranked: T.summarize(slice), raw: slice });
    };
    const next = T._queue.shift();
    _startMatchNow(next.bot, next.levelIndex, next.runIndex);
  });
};

// --------------------------------------------------------------------------
// Public: summarize a result list into a ranked leaderboard.
// --------------------------------------------------------------------------
T.summarize = function (rows) {
  const data = rows || T.results;
  const byBot = {};
  for (const r of data) {
    const b = byBot[r.bot] = byBot[r.bot] || { bot: r.bot, n: 0, score: [], days: [], kills: [], elapsed: [] };
    b.n++;
    b.score.push(r.score);
    b.days.push(r.days);
    b.kills.push(r.kills);
    b.elapsed.push(r.elapsed);
  }
  function mean(a) { return a.length ? a.reduce((s,v)=>s+v,0) / a.length : 0; }
  function stdev(a) {
    if (a.length < 2) return 0;
    const m = mean(a);
    return Math.sqrt(a.reduce((s,v)=>s+(v-m)*(v-m),0) / a.length);
  }
  function max(a) { return a.length ? Math.max.apply(null, a) : 0; }
  function min(a) { return a.length ? Math.min.apply(null, a) : 0; }
  const ranked = Object.values(byBot).map(b => ({
    bot:        b.bot,
    runs:       b.n,
    meanScore:  Math.round(mean(b.score)),
    stdScore:   Math.round(stdev(b.score)),
    bestScore:  max(b.score),
    worstScore: min(b.score),
    meanDays:   +mean(b.days).toFixed(2),
    bestDays:   max(b.days),
    meanKills:  Math.round(mean(b.kills)),
    meanLife:   Math.round(mean(b.elapsed)),
  })).sort((a, b) => {
    // Primary: mean score. Tiebreaker: mean days. Tiebreaker: mean kills.
    if (b.meanScore !== a.meanScore) return b.meanScore - a.meanScore;
    if (b.meanDays  !== a.meanDays)  return b.meanDays  - a.meanDays;
    return b.meanKills - a.meanKills;
  });
  return ranked;
};

// --------------------------------------------------------------------------
// Small in-game overlay so you can see what's going on during a match.
// --------------------------------------------------------------------------
const _origRender = window.render;
window.render = function (alpha) {
  _origRender(alpha);
  if (T._state !== 'running' || !T._showOverlay) return;
  const bot = T._activeBot; if (!bot) return;
  try {
    const c = ctx;
    c.save();
    c.font = '12px "JetBrains Mono", ui-monospace, monospace';
    c.textBaseline = 'top';
    const queueLeft = T._queue.length;
    const lines = [
      `ARENA  bot="${bot.name}" v${bot.version || '0'}`,
      `level=${T._activeLevel} run=${T._activeRunIndex}  queue=${queueLeft}`,
      `day=${Game.time.day} phase=${Game.time.phase}  score=${Game.score|0}`,
      `kills=${Game.kills} elapsed=${Game.elapsed.toFixed(1)}s`,
    ];
    const w = 280, h = 14 * lines.length + 10;
    c.fillStyle = 'rgba(7,8,10,0.78)';
    c.fillRect(VIEW_W - w - 8, 8, w, h);
    c.strokeStyle = 'rgba(91,227,164,0.7)';
    c.strokeRect(VIEW_W - w - 7.5, 8.5, w - 1, h - 1);
    c.fillStyle = '#e8e6df';
    for (let i = 0; i < lines.length; i++) {
      c.fillText(lines[i], VIEW_W - w, 12 + i * 14);
    }
    c.restore();
  } catch (_) { /* ignore overlay errors */ }
};

// --------------------------------------------------------------------------
// Autostart bootstrap.
//
// When the page is loaded with ?autostart=1&bot=<name>&level=<i>&matchId=<id>,
// skip the menu and immediately run a match. Used by the side-by-side viewer
// which spawns one iframe per bot. Reports back to the parent window via
// postMessage:
//   { type: 'arena:tick', matchId, score, kills, days, hp, elapsed }   // ~3 Hz
//   { type: 'arena:match-complete', matchId, result }                  // once
//   { type: 'arena:match-error',    matchId, error  }                  // on failure
// --------------------------------------------------------------------------
(function bootstrapAutostart() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('autostart') !== '1') return;
  const botName    = params.get('bot') || '';
  const level      = Math.max(0, +params.get('level') || 0);
  const matchId    = params.get('matchId') || ('m' + Math.random().toString(36).slice(2, 8));
  const maxSeconds = Math.max(0, +params.get('maxSeconds') || 0);  // optional hard cap; 0 = default
  if (maxSeconds > 0) T._maxRunSeconds = maxSeconds;
  const post = (msg) => {
    try { window.parent.postMessage(Object.assign({ matchId }, msg), '*'); }
    catch (_) {}
  };

  // Pre-emptively hide the menu the moment ui.js exposes its DOM, so the
  // menu doesn't flash before the match boots.
  function hideOverlay() {
    try {
      const root = document.querySelector('#overlay-root');
      if (root) root.innerHTML = '';
    } catch (_) {}
  }

  // Mute audio in autostart iframes — N games × N audio contexts is loud.
  function muteAudio() {
    try { if (typeof Audio !== 'undefined' && Audio.setMuted) Audio.setMuted(true); } catch (_) {}
    try {
      const btn = document.querySelector('#mute-btn');
      if (btn) btn.style.display = 'none';
    } catch (_) {}
  }

  // Wait until the world / level data and the bot registry are populated.
  function waitReady(cb, attempts) {
    attempts = attempts || 0;
    const ready = (typeof LEVELS !== 'undefined') && Arena.get(botName);
    if (ready) return cb();
    if (attempts > 60) {
      post({ type: 'arena:match-error', error: 'bot not registered: ' + botName });
      return;
    }
    setTimeout(() => waitReady(cb, attempts + 1), 100);
  }

  waitReady(() => {
    hideOverlay();
    muteAudio();

    // Tick beacon — push status to parent ~3 Hz so the side-by-side view can
    // update a live readout panel without reaching into our internals.
    const beacon = setInterval(() => {
      if (T._state !== 'running') return;
      const p = Game.player;
      post({
        type: 'arena:tick',
        score:   Game.score | 0,
        kills:   Game.kills | 0,
        days:    Math.max(0, Game.time.day - 1),
        hp:      p ? Math.max(0, Math.round(p.hp)) : 0,
        maxHp:   p ? p.maxHp : 100,
        elapsed: Math.floor(Game.elapsed),
        phase:   Game.time.phase,
      });
    }, 333);

    T.runMatch(botName, level).then((result) => {
      clearInterval(beacon);
      post({ type: 'arena:match-complete', result });
    }, (err) => {
      clearInterval(beacon);
      post({ type: 'arena:match-error', error: String(err && err.message || err) });
    });
  });
})();

console.log('[Tournament] harness.js loaded');

})();
