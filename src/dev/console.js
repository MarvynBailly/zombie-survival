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
    // Backtick toggles. Ignore when typing into another input.
    if (e.key === '`' || e.code === 'Backquote') {
      const active = document.activeElement;
      if (active && active !== inputEl && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      e.preventDefault();
      toggle();
    } else if (e.key === 'Escape' && visible) {
      toggle();
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
    }
  }

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
      case 'speed': {
        if (args.length === 0) return `speed is x${window.__dev.speedMul}`;
        return C.setSpeed(args[0]);
      }
      case 'reveal':
      case 'revealmap':
        return C.revealMap();

      case 'tp':
      case 'teleport': {
        if (args.length < 2) return 'usage: tp <x> <y>';
        return C.teleport(args[0], args[1]);
      }
      case 'heal':
      case 'refill':
        return C.heal();

      case 'clear':
      case 'killall':
        return C.clearZombies();

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
    'commands:',
    '  god [on|off]        invuln (toggle if no arg)',
    '  fly [on|off]        noclip (toggle if no arg)',
    '  speed <n>           move-speed multiplier (1 = normal)',
    '  reveal              reveal map + all POIs',
    '  tp <x> <y>          teleport player',
    '  heal                refill hp + ammo',
    '  clear               kill all live zombies',
    '  pos                 print player coords + hp',
    '  help                this message',
    '',
    'press ` to toggle, esc to close, ↑/↓ for history',
  ].join('\n');

  return { mount, log, show, toggle };
})();

window.DevConsole = DevConsole;
