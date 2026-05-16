'use strict';

// ---------- Constants ----------
// World is bounded but very large (32000 x 32000). Generated lazily as 800px
// chunks; only the active 5x5 chunk window around the player is updated and
// drawn each frame so the size stays cheap.
const WORLD_W = 32000, WORLD_H = 32000;
const CHUNK_SIZE = 800;
const ACTIVE_RADIUS = 2; // ±N chunks around the player are "live"
const VIEW_W = 1024, VIEW_H = 768;
const TICK_HZ = 60;
const TICK_DT = 1 / TICK_HZ;
const PB_URL = 'https://raspberrypi.tail0bf0ce.ts.net:8443';
const COL_SCORES = 'proj_zombie_survival_scores';
const PREFS_KEY = 'zombie-survival:prefs';
const SAVE_KEY = 'zombie-survival:save';
const SAVE_VERSION = 4;

// World tile grid. TILE_SIZE matches WALL_SIZE so player-placed walls and
// generated obstacles snap to the same lattice. ZONE_CHUNKS controls POI
// density — each zone is one POI assignment (1600px = 40 tiles per side).
const TILE_SIZE = 40;
const ZONE_CHUNKS = 2;
const ZONE_PX = ZONE_CHUNKS * CHUNK_SIZE;
const ZONE_TILES = ZONE_PX / TILE_SIZE;

// HP for breakable world-generated obstacles. Styles not listed here are
// indestructible (vehicles, tombstones, decorative barrels). Zombies only
// chew these when their path to the player is severed.
const OBSTACLE_HP = {
  wood_wall:    80,
  brick_wall:   180,
  stone_wall:   280,
  interior_wall: 60,
  crate:         40,
  fence:         30,
  tree:          60,
  boulder:      220,
  bed:           25,
  dresser:       30,
  counter:       45,
  stove:         60,
  table:         20,
  sofa:          20,
  shelf:         35,
  workbench:     50,
  bathtub:       70,
  sink:          40,
  log_pile:      60,
  stump:        120,
  minecart:      90,
  scarecrow:     15,
  trough:        40,
};

// Player-placeable walls. WALL_SIZE chosen so both world dimensions divide
// evenly (WORLD_W/40 = 60, WORLD_H/40 = 45) and the snap grid aligns flush
// with the map boundary on every side.
const WALL_SIZE = 40;
const WALL_HP = 250;
const WALL_INITIAL = 4;
const WALL_MAX_RESERVE = 12;
const WALL_PICKUP_AMOUNT = 2;
const WALL_PLACE_CD = 0.25;

// Chests — three tiers, planted by chunk gen. Wood is common near spawn,
// mythic is rare and only deep out.
const CHEST_TIER = {
  wood:   { hp: 60,  base: '#7a5a30', plank: '#9a7a4a', trim: '#caa760' },
  iron:   { hp: 150, base: '#5e6a78', plank: '#7e8a98', trim: '#cad0d8' },
  mythic: { hp: 250, base: '#3a2c5a', plank: '#5a3a8a', trim: '#e3c054' },
};
const CHEST_PROMPT_RADIUS = 60;

// Day/night cycle — total cycle ≈ 4 minutes, ~60% safe daytime, ~24% night siege.
const DAY_PHASES = [
  { name: 'day',   length: 150, label: 'DAY' },
  { name: 'dusk',  length: 30,  label: 'DUSK' },
  { name: 'night', length: 60,  label: 'NIGHT' },
  { name: 'dawn',  length: 15,  label: 'DAWN' },
];
const DAY_LENGTH = DAY_PHASES.reduce((a, p) => a + p.length, 0);
