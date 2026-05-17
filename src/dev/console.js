'use strict';

// Dev console: backtick-toggled REPL overlay. Parses commands and dispatches
// to DevCheats (cheats.js). Only loaded on dev.html.

const DevConsole = (function () {
  let root, logEl, inputEl;
  let visible = false;
  const history = [];
  let histIdx = -1;

  function mount() {
    root = document.getElementById('dev-console');
    logEl = document.getElementById('dev-console-log');
    inputEl = document.getElementById('dev-console-input');
    if (!root || !inputEl) return;

    inputEl.addEventListener('keydown', onKey);
    document.addEventListener('keydown', onGlobalKey);

    log('Dev console ready. Type `help` for commands.', 'sys');
  }

  function onGlobalKey(e) {
    const active = document.activeElement;
    const typingElsewhere = active && active !== inputEl &&
      (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
    const typingInConsole = active === inputEl;

    // Backtick: toggle console. Ignore when typing into a different input.
    if (e.key === '`' || e.code === 'Backquote') {
      if (typingElsewhere) return;
      e.preventDefault();
      toggle();
      return;
    }
    if (e.key === 'Escape' && visible) { toggle(); return; }

    // Backslash: toggle pause. Don't fire while typing in any input.
    if (e.key === '\\') {
      if (typingElsewhere || typingInConsole) return;
      if (!window.DevCheats) return;
      e.preventDefault();
      const msg = window.DevCheats.togglePause();
      if (visible) log(msg, 'sys');
      return;
    }

    // Backspace: step one tick while paused. Must not fire while typing
    // (would delete characters); guard against both console + other inputs.
    if (e.key === 'Backspace') {
      if (typingElsewhere || typingInConsole) return;
      if (!window.DevCheats || !window.Game) return;
      if (window.Game.mode !== 'paused') return;
      e.preventDefault();
      const msg = window.DevCheats.step(1);
      if (visible) log(msg, 'sys');
      return;
    }
  }

  function onKey(e) {
    if (e.key === 'Enter') {
      const raw = inputEl.value;
      inputEl.value = '';
      if (raw.trim()) {
        history.unshift(raw);
        if (history.length > 100) history.pop();
      }
      histIdx = -1;
      submit(raw);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length === 0) return;
      histIdx = Math.min(history.length - 1, histIdx + 1);
      inputEl.value = history[histIdx] || '';
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      histIdx = Math.max(-1, histIdx - 1);
      inputEl.value = histIdx === -1 ? '' : (history[histIdx] || '');
    } else if (e.key === 'Tab') {
      e.preventDefault();
      tryComplete();
    }
  }

  // Tab completion. Looks at the first token to decide which registry to
  // complete the second token against. Single match → autofill; multiple →
  // print the candidate list.
  function tryComplete() {
    const raw = inputEl.value;
    const m = raw.match(/^(\S+)\s+(\S*)$/);
    if (!m) return;
    const cmd = m[1].toLowerCase();
    const partial = m[2].toLowerCase();
    const pool = poolFor(cmd);
    if (!pool) return;
    const matches = pool.filter(k => k.toLowerCase().startsWith(partial));
    if (matches.length === 0) return;
    if (matches.length === 1) {
      inputEl.value = `${m[1]} ${matches[0]} `;
      return;
    }
    // Many matches: complete to longest common prefix, then list them.
    const lcp = longestCommonPrefix(matches.map(s => s.toLowerCase()));
    if (lcp.length > partial.length) {
      // Preserve the original case of one of the matches.
      const sample = matches.find(s => s.toLowerCase().startsWith(lcp)) || matches[0];
      inputEl.value = `${m[1]} ${sample.slice(0, lcp.length)}`;
    }
    log(matches.slice(0, 30).join('  ') + (matches.length > 30 ? '  …' : ''), 'sys');
  }

  function poolFor(cmd) {
    if (cmd === 'give') {
      const out = [];
      if (typeof WEAPONS !== 'undefined') out.push(...Object.keys(WEAPONS));
      if (typeof ITEMS !== 'undefined') out.push(...Object.keys(ITEMS));
      out.push('all');
      return out;
    }
    if (cmd === 'spawn') {
      return typeof ZOMBIES !== 'undefined' ? Object.keys(ZOMBIES) : [];
    }
    if (cmd === 'time') return ['day', 'dusk', 'night', 'dawn'];
    if (cmd === 'tp' || cmd === 'teleport') return POI_KINDS;
    return null;
  }

  function longestCommonPrefix(arr) {
    if (arr.length === 0) return '';
    let p = arr[0];
    for (let i = 1; i < arr.length; i++) {
      while (!arr[i].startsWith(p)) p = p.slice(0, -1);
      if (!p) return '';
    }
    return p;
  }

  // POI kinds — from POI_SIZES in world.js. Hardcoded so tab-completion works
  // before the world is generated; mismatch would just show "no POI matched".
  const POI_KINDS = [
    'hut', 'cottage', 'campsite', 'house', 'gas_station', 'warehouse',
    'town', 'city', 'mining_outpost', 'farm', 'lumber_camp', 'fishing_dock',
  ];

  function toggle() {
    visible = !visible;
    root.classList.toggle('hidden', !visible);
    if (visible) {
      inputEl.focus();
      inputEl.select();
    } else {
      inputEl.blur();
    }
  }

  function show() { if (!visible) toggle(); }

  function log(msg, kind) {
    const line = document.createElement('div');
    line.className = 'dev-log-line' + (kind ? ` dev-log-${kind}` : '');
    line.textContent = msg;
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  }

  function submit(raw) {
    const cmd = raw.trim();
    if (!cmd) return;
    log('> ' + cmd, 'input');
    try {
      log(dispatch(cmd), 'ok');
    } catch (err) {
      log('error: ' + (err && err.message || err), 'err');
    }
  }

  // Parse a command line into [cmd, ...args]. Whitespace-separated; no quoting.
  function dispatch(line) {
    const parts = line.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);
    const C = window.DevCheats;
    if (!C) return 'DevCheats not loaded';

    switch (cmd) {
      case 'help':
      case '?':
        return HELP_TEXT;

      case 'god': {
        const on = parseToggle(args[0], window.__dev.godmode);
        return C.setGod(on);
      }
      case 'fly':
      case 'noclip': {
        const on = parseToggle(args[0], window.__dev.fly);
        return C.setFly(on);
      }
      case 'freecam': {
        const on = parseToggle(args[0], window.__dev.freecam);
        return C.setFreecam(on);
      }
      case 'speed': {
        if (args.length === 0) return `speed is x${window.__dev.speedMul}`;
        return C.setSpeed(args[0]);
      }
      case 'reveal':
      case 'revealmap':
        return C.revealMap();

      case 'tp':
      case 'teleport': {
        if (args.length === 0) return 'usage: tp <x> <y> | tp <poi-kind>';
        // 2 numeric args → coords. 1 arg (non-numeric or numeric) → POI kind.
        if (args.length >= 2 && isFinite(parseFloat(args[0])) && isFinite(parseFloat(args[1]))) {
          return C.teleport(args[0], args[1]);
        }
        return C.tpToPoi(args[0]);
      }
      case 'heal':
      case 'refill':
        return C.heal();

      case 'clear':
      case 'killall':
        return C.clearZombies();

      case 'give': {
        if (args.length === 0) return 'usage: give <item|weapon|all> [count]';
        return C.give(args[0], args[1]);
      }
      case 'spawn': {
        if (args.length === 0) return 'usage: spawn <zombie-kind> [count] [radius]';
        return C.spawn(args[0], args[1], args[2]);
      }
      case 'time': {
        if (args.length === 0) {
          const t = window.Game && window.Game.time;
          return t ? `phase=${t.phase} day=${t.day} t=${t.t.toFixed(1)}` : 'no game';
        }
        return C.setTime(args[0]);
      }
      case 'day':
      case 'wave': {
        if (args.length === 0) return 'usage: day <n>';
        return C.setDay(args[0]);
      }
      case 'timescale':
      case 'ts': {
        if (args.length === 0) return `timescale x${window.__dev.timescale}`;
        return C.setTimescale(args[0]);
      }

      case 'pause':
        return C.pause();
      case 'resume':
      case 'play':
        return C.resume();
      case 'step':
        return C.step(args[0]);

      case 'save': {
        if (args.length === 0) return 'usage: save <name>';
        return C.saveSlot(args[0]);
      }
      case 'load': {
        if (args.length === 0) return 'usage: load <name>';
        return C.loadSlot(args[0]);
      }
      case 'slots': {
        if (args[0] === 'rm' || args[0] === 'remove' || args[0] === 'del') {
          return C.removeSlot(args[1]);
        }
        return C.listSlots();
      }

      case 'pos':
      case 'where': {
        const p = window.Game && window.Game.player;
        if (!p) return 'no player';
        return `x=${p.x|0} y=${p.y|0} hp=${p.hp|0}/${p.maxHp|0}`;
      }

      default:
        return `unknown: ${cmd} — try \`help\``;
    }
  }

  // "on" / "off" / "" → boolean. Empty = flip current.
  function parseToggle(arg, current) {
    if (arg == null || arg === '') return !current;
    const a = arg.toLowerCase();
    if (a === 'on' || a === '1' || a === 'true') return true;
    if (a === 'off' || a === '0' || a === 'false') return false;
    return !current;
  }

  const HELP_TEXT = [
    'player',
    '  god [on|off]              invuln (toggle if no arg)',
    '  fly [on|off]              noclip (toggle if no arg)',
    '  freecam [on|off]          detach camera (WASD moves cam; shift = fast)',
    '  speed <n>                 move-speed multiplier (1 = normal)',
    '  heal                      refill hp + ammo',
    '  pos                       print player coords + hp',
    'world',
    '  reveal                    reveal map + all POIs',
    '  tp <x> <y>                teleport to coords',
    '  tp <poi-kind>             teleport to nearest matching POI',
    '  clear                     kill all live zombies',
    'content',
    '  give <id> [count]         give item or weapon (or "all")',
    '  spawn <kind> [n] [r]      spawn zombies near player',
    'time',
    '  time [day|dusk|night|dawn]   jump to start of phase',
    '  day <n>                   set day number (alias: wave)',
    '  timescale <n>             sim speed multiplier (alias: ts)',
    '  pause / resume            freeze / resume the sim',
    '  step [n]                  advance n ticks while paused (default 1)',
    'slots',
    '  save <name>               snapshot current run to a dev slot',
    '  load <name>               restore a slot',
    '  slots                     list slots',
    '  slots rm <name>           delete a slot',
    '',
    'keys: ` toggle console · esc close · ↑↓ history · tab complete',
    '      \\ pause/resume · backspace step (while paused)',
    '      shift+click on M-map → teleport',
  ].join('\n');

  return { mount, log, show, toggle };
})();

window.DevConsole = DevConsole;
