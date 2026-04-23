Build a BoxHead-style top-down zombie survival arena shooter as a single static HTML file served at `/p/zombie-survival/`. No build step — vanilla HTML/CSS/JS, Canvas 2D rendering, ES modules inline or a single `index.html` with a `<script>` block.

Slug: `zombie-survival`. PocketBase base URL: `https://raspberrypi.tail0bf0ce.ts.net:8443`. Use the PocketBase JS SDK via CDN (e.g. `https://cdn.jsdelivr.net/npm/pocketbase@0.21.0/dist/pocketbase.umd.js`).

## Game design

- **Arena**: fixed-size top-down map (e.g. 1600×1200 world, camera follows player, viewport ~1024×768 or responsive-fit). Ground tiles with a few scattered crates/walls as cover — obstacles block movement and bullets.
- **Player**: WASD to move, mouse to aim, left-click to shoot, `1`–`5` to switch weapons, `R` to reload, `Space` to place a barrel (explosive, if unlocked). Health: 100. Brief i-frames on hit.
- **Weapons** (start with pistol, others drop from zombies or unlock by wave):
  1. Pistol — infinite ammo, medium damage, single shot.
  2. Shotgun — 6-pellet spread, short range, high damage.
  3. SMG — fast fire rate, small damage per bullet.
  4. Rocket launcher — slow, AoE explosion.
  5. Barrels — placeable; chain-explode when shot or touched.
- **Zombies**:
  - Normal walker: slow, melee, spawns from edges.
  - Runner: fast, low HP.
  - Tank: slow, high HP, heavy damage.
  - (Optional) fire zombie that lights others on fire.
  - Pathfinding: simple steering toward the player with obstacle avoidance (no full A*; raycast + separation is fine).
- **Waves**: increasing count and mix each wave. Short breather between waves (5s). Wave counter and kill counter in HUD.
- **Pickups**: ammo crates, health packs, weapon drops spawn occasionally.
- **Death**: show "You survived N waves / K kills" screen with name-entry for leaderboard; buttons to submit, retry, main menu.

## HUD & screens

- **Main menu**: title, "Play" button, name input (remembered in localStorage), "Leaderboard" button, "Controls" help.
- **Levels**: three different maps to pick from
- **In-game HUD**: health bar, current weapon + ammo, wave number, kill count, score.
- **Pause** (Esc): resume / restart / quit to menu.
- **Game over**: stats + submit score + show top 10.
- **Leaderboard view**: top 20 runs, sortable by score or waves.

## PocketBase data model

Create these collections in PocketBase (user does this manually in the admin UI — include a short README block at the top of the HTML in a comment with the schemas). All list/create rules open for tailnet use (`""` = public) unless noted.

- `proj_zombie_survival_scores`
  - `player_name` (text, required, max 24)
  - `score` (number, required) — computed as kills × wave multiplier + time bonus
  - `waves_survived` (number, required)
  - `kills` (number, required)
  - `duration_seconds` (number, required)
  - `weapon_stats` (json) — `{pistol: kills, shotgun: kills, ...}`
  - `created` (auto)
  - Indexes on `score desc`, `waves_survived desc`.
  - List/view rules: `""` (open). Create rule: `""`. Update/delete: admin-only.

- `proj_zombie_survival_runs` (optional, for per-session telemetry if useful)
  - `player_name` (text)
  - `events` (json) — compact array of `{t, type, ...}` for post-mortem/replay
  - Keep create open, everything else admin.

Fetch leaderboard with `pb.collection('proj_zombie_survival_scores').getList(1, 20, { sort: '-score' })`. Submit on death with `.create({...})`.

## Implementation constraints

- Single `index.html`. All JS inline or one `game.js` next to it. No bundler, no npm install.
- Use `requestAnimationFrame` with fixed-timestep update (60 Hz) and interpolated render.
- Entity model: flat arrays (player, zombies, bullets, pickups, particles, barrels) — update/render loops iterate arrays. Spatial hash or simple grid for collision if perf matters; for starting counts (<200 zombies) naive O(n²) is fine.
- Keep art programmatic: circles/rects with simple color palettes, muzzle flashes, blood particles, explosion rings. No external image assets required; if sprites are used, inline them as base64 or draw procedurally.
- Sound: Web Audio API with a few synthesized blips (gunshot, reload, zombie groan, explosion). Mute toggle in HUD. No external audio files.
- Mobile: not a target — keyboard+mouse only. Show a "desktop only" notice if touch-only.
- Persist player name and last-used settings in `localStorage` under key `zombie-survival:prefs`.
- Handle PocketBase being unreachable gracefully: local-only play continues, leaderboard shows "offline".
- Do not hardcode credentials. The PocketBase instance is on the tailnet and collections are open to read/create; no auth needed from the client.

## Deliverables

- `/p/zombie-survival/index.html` — playable game.
- Optional `/p/zombie-survival/game.js` if the code gets big enough to warrant splitting.
- A short comment block at the top of `index.html` listing the two PocketBase collections and their fields so the user can create them in the admin UI before first submit.

Start by scaffolding the main menu → game loop → wave spawner → collision/shooting → HUD → death screen → leaderboard submission, in that order. Get one wave playable with the pistol before adding other weapons and zombie types.