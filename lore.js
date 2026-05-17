'use strict';

// ---------- Lore: journals, screenshots, hand-drawn maps ----------
// Foundation module for E·04 Cork Board (pinned narrative + memories) and
// E·01 Trophy Room. Three subsystems share this file because they all hang
// off the same meta layer (a separate localStorage key that survives death
// — unlike Game.perks which still resets every run).
//
//   1. Journals  — text-bearing items dropped in chests, picked up like any
//                  inventory item, read later via the Cork Board UI.
//   2. Screenshots — discrete-event canvas snapshots stored as low-quality
//                    JPEG data URLs on Game.lore.screenshots[]; capped.
//   3. Map drawings — structured snapshots of explored chunks + bases +
//                     player position. No rasterisation yet — the Cork
//                     Board UI will draw them on demand.
//
// Globals expected from the rest of the game:
//   Game, ITEMS, addItem (items.js)
//   spawnPickup (game.js — pickups routed through inventory via item_<id>)
//   setNotice, Audio.sfx (persistence.js / ui.js)
//   canvas (game.js — the main game canvas, top-level const)
//   CRAFT_RECIPES (items.js — appended-to via the integration patch)

// ---------- Constants ----------
const LORE_META_KEY = 'zombie-survival:lore-meta';
const SCREENSHOT_CAP = 20;
const MAPDRAWING_CAP = 12;
const JOURNAL_DROP_CHANCE = 0.12;
const JPEG_QUALITY = 0.45;

// ---------- Journal text pool ----------
// 14 short, paranoid, in-world voices. Picked at chest open time. Each
// template renders into a one-shot ITEMS entry via makeJournal(). The
// "unused first" picker prefers texts the player hasn't seen yet across
// the current run + meta history.
const JOURNAL_POOL = [
  { id: 'j_mara',
    title: 'page from a delivery driver\'s notebook',
    text: "Day 12. The radio is still dead. Mara took the truck north — said she'd be back by sundown. That was two weeks ago. I keep leaving the porch light on. The moths come. Nothing else." },
  { id: 'j_exit17',
    title: 'note from a gas pump',
    text: "EXIT 17 → SAFE? Found a note on the gas pump. Someone crossed it out and wrote: NOT ANYMORE. Below that, in a kid's handwriting: mommy said the same thing about home." },
  { id: 'j_clinic',
    title: 'clinic intake form, back side',
    text: "Patient bit 11:42. Patient turned 14:09. Patient was my husband. I'm writing this with his pen. The pen still works. None of the rest does." },
  { id: 'j_radio',
    title: 'transcribed radio broadcast',
    text: "...repeat, this is the National Emergency Broadcast. Do not approach the infected. Do not — *static* — your neighbors. Shelter in — *static* — God help — *click*" },
  { id: 'j_diary_kid',
    title: 'a child\'s diary, glittery cover',
    text: "today daddy made me hide in the closet again. he said dont come out for ANYTHING. i counted to one thousand twice. the house is so quiet now. i think i can come out." },
  { id: 'j_scientist',
    title: 'lab log, water-stained',
    text: "Sample 44-C: reanimation in 6 minutes. Sample 44-D: 4 minutes. The interval is shrinking. We are not the cure. We are the incubator. Burn the lab. Burn it all." },
  { id: 'j_grocer',
    title: 'receipt, ballpoint on the back',
    text: "Bread $3.20. Milk $4.99. The world ending: free, apparently. I locked the store with me inside. There's enough soup to last a month. The customers outside are very patient." },
  { id: 'j_priest',
    title: 'torn page from a sermon book',
    text: "I have buried sixty-one this week. I do not know what they are when they come back. I have stopped saying the words. The words don't stick to them." },
  { id: 'j_camper',
    title: 'campsite logbook, last entry',
    text: "Bears, we were warned about. Mosquitoes. Hypothermia. Nobody at the ranger station mentioned the thing in the trees that wears my brother's coat." },
  { id: 'j_soldier',
    title: 'field journal, blood on the cover',
    text: "Orders came down: hold the bridge. Then: blow the bridge. Then: nothing. The radio's been a hiss for nine days. We hold the bridge anyway. There's nowhere to fall back to." },
  { id: 'j_realtor',
    title: 'open-house flyer, scribbled over',
    text: "4 BED · 2 BATH · CHARMING CUL-DE-SAC — crossed out — CHARMING IS DEAD — crossed out — basement is sealed from inside. do not unseal. do not unseal. do not unseal." },
  { id: 'j_farmer',
    title: 'page from an almanac',
    text: "Corn came in fine. Hens still lay. The dog still barks at the road, but at nothing now. I think it remembers what should be there. I do too. We sit on the porch together." },
  { id: 'j_trucker',
    title: 'CB radio transcript, hand-copied',
    text: "Breaker breaker — anyone east of the river — they're coming through the storm drains now — repeat — the storm drains — *line goes dead*" },
  { id: 'j_doctor',
    title: 'prescription pad, every page used',
    text: "Antibiotic. Antibiotic. Antibiotic. Bandage. Bandage. Antibiotic. I wrote prescriptions until my hand cramped. Nobody came to fill them. The pharmacy is twelve feet of corpses deep." },
];

// ---------- Initialisation ----------
function initLore() {
  if (!Game) return;
  Game.lore = {
    screenshots: [],     // [{ id, dataUrl, label, day, t, weapon, kind }]
    mapDrawings: [],     // [{ id, day, exploredChunkIds, baseFlags, playerEndPos }]
    journalsHeld: [],    // [id] — journals currently owned this run
    journalsSeenIds: new Set(),  // template ids that have dropped this run
    nextSnapshotKills: 10,       // milestone wave-of-kills threshold
  };
  // Make sure the cross-run meta layer is loaded so we don't re-roll texts
  // the player has already read on previous runs.
  loadLoreMeta();
}

// ---------- Journals ----------
// Build a one-shot ITEMS entry per journal instance so each pickup is
// uniquely identified in the inventory and the Cork Board can pin a
// specific journal by id. `id` is the template id; we suffix with a
// timestamp slug to avoid colliding instances if the same text drops twice.
function makeJournal(id, title, text, foundDay) {
  const uid = `journal_${id}_${Math.floor(Math.random() * 1e6).toString(36)}`;
  ITEMS[uid] = {
    id: uid, name: title || 'Journal Page', category: 'quest',
    stackMax: 1, tint: '#d8c89a',
    desc: 'A scrap of paper. Pin it on the Cork Board to read.',
    isJournal: true,
    journalTemplateId: id,
    text: text || '',
    foundDay: foundDay | 0,
  };
  return uid;
}

// Pick the next journal template. Prefer ones never seen in this run, then
// ones never read across runs (meta), then fall back to fully random.
function pickJournalTemplate() {
  const meta = loreMeta();
  const seenRun = Game.lore && Game.lore.journalsSeenIds;
  const seenMeta = new Set(meta.journalsRead || []);
  // Tier 1: never in this run AND never read across runs.
  let candidates = JOURNAL_POOL.filter(j =>
    !(seenRun && seenRun.has(j.id)) && !seenMeta.has(j.id));
  // Tier 2: not in this run.
  if (!candidates.length) {
    candidates = JOURNAL_POOL.filter(j => !(seenRun && seenRun.has(j.id)));
  }
  // Tier 3: anything.
  if (!candidates.length) candidates = JOURNAL_POOL;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Called from the chest-open hook. Rolls ~12% chance per chest to drop a
// journal pickup at a small offset. Returns true if a journal was spawned.
function maybeDropJournal(chestX, chestY) {
  if (!Game || !Game.lore) return false;
  if (Math.random() > JOURNAL_DROP_CHANCE) return false;
  if (typeof spawnPickup !== 'function' || typeof ITEMS !== 'object') return false;
  const tpl = pickJournalTemplate();
  if (!tpl) return false;
  const itemId = makeJournal(tpl.id, tpl.title, tpl.text,
    (Game.time && Game.time.day) || 1);
  Game.lore.journalsSeenIds.add(tpl.id);
  Game.lore.journalsHeld.push(itemId);
  // Drop slightly offset so it doesn't sit dead-center on the chest.
  const a = Math.random() * Math.PI * 2;
  const r = 24 + Math.random() * 12;
  spawnPickup(chestX + Math.cos(a) * r, chestY + Math.sin(a) * r, `item_${itemId}`);
  return true;
}

function getJournalText(itemId) {
  const it = ITEMS[itemId];
  return (it && it.isJournal) ? it.text : '';
}

// ---------- Screenshots ----------
// Snapshot the main canvas to a low-quality JPEG data URL. Triggers are
// discrete events (boss kill, kill milestone, death) — we never call this
// per-frame because toDataURL is expensive and can stall the renderer.
function captureScreenshot(label, kind) {
  if (!Game || !Game.lore) return null;
  if (typeof canvas === 'undefined' || !canvas) return null;
  let dataUrl;
  try {
    dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  } catch (e) {
    // Cross-origin / tainted canvas — bail silently.
    return null;
  }
  const day = (Game.time && Game.time.day) || 1;
  const phase = (Game.time && Game.time.phase) || 'day';
  const kills = Game.kills | 0;
  const composed = `Day ${day} · ${phase.toUpperCase()} · ${kills} kills — ${label || ''}`.trim();
  const shot = {
    id: 'shot_' + Date.now().toString(36) + '_' + Math.floor(Math.random() * 999).toString(36),
    dataUrl, label: composed, day, t: Date.now(),
    weapon: (Game.player && Game.player.weapon) || null,
    kind: kind || (label && label.split(' ')[0]) || 'event',
  };
  Game.lore.screenshots.push(shot);
  // Cap — drop the oldest. The cap is enforced on the per-run list and
  // mirrored into meta so the meta layer doesn't grow unbounded either.
  while (Game.lore.screenshots.length > SCREENSHOT_CAP) {
    Game.lore.screenshots.shift();
  }
  // Mirror into meta (cross-run keepsake) and persist. Meta also caps.
  const meta = loreMeta();
  meta.screenshotsKept.push({ id: shot.id, dataUrl, label: composed, day, t: shot.t, kind: shot.kind });
  while (meta.screenshotsKept.length > SCREENSHOT_CAP) meta.screenshotsKept.shift();
  saveLoreMeta();
  return shot;
}

// Convenience trigger for the kill loop. Caller still owns the milestone
// gate (i.e. when Game.kills crosses 10, 20, ...). We expose the threshold
// state here so callers can stay simple: call `maybeMilestoneShot()` after
// each kill and we fire only when crossing the threshold.
function maybeMilestoneShot() {
  if (!Game || !Game.lore) return;
  if (Game.kills >= Game.lore.nextSnapshotKills) {
    captureScreenshot(`milestone · ${Game.lore.nextSnapshotKills} kills`, 'milestone');
    Game.lore.nextSnapshotKills += 10;
  }
}

// ---------- Sketchpad item + hand-drawn map ----------
// Register the sketchpad in ITEMS at module-load time so the inventory UI
// and crafting overlay can see it without an additional patch.
ITEMS.sketchpad = {
  id: 'sketchpad', name: 'Sketchpad', category: 'consumable',
  stackMax: 3, tint: '#cdb98a',
  desc: 'Sketch a hand-drawn map of where you\'ve been. Right-click to use.',
  use(p) { return useSketchpad(p); },
};

function useSketchpad(p) {
  if (!Game || !Game.lore) return false;
  const player = p || Game.player;
  if (!player) return false;
  const explored = Game.exploredChunks ? Array.from(Game.exploredChunks) : [];
  const bases = (Game.bases || []).map(b => ({
    x: b.x | 0, y: b.y | 0, name: b.name || b.label || '',
  }));
  const drawing = {
    id: 'map_' + Date.now().toString(36),
    day: (Game.time && Game.time.day) || 1,
    exploredChunkIds: explored,
    baseFlags: bases,
    playerEndPos: { x: player.x | 0, y: player.y | 0 },
  };
  Game.lore.mapDrawings.push(drawing);
  while (Game.lore.mapDrawings.length > MAPDRAWING_CAP) {
    Game.lore.mapDrawings.shift();
  }
  // Mirror into meta so a sketch survives death.
  const meta = loreMeta();
  meta.mapsDrawn.push(drawing);
  while (meta.mapsDrawn.length > MAPDRAWING_CAP) meta.mapsDrawn.shift();
  saveLoreMeta();
  if (typeof setNotice === 'function') {
    setNotice(`Sketched a map (${explored.length} tiles explored)`, 2);
  }
  if (typeof Audio !== 'undefined' && Audio.sfx && Audio.sfx.pickup) Audio.sfx.pickup();
  return true;
}

// ---------- Per-run save/load ----------
// Encoded into the main save blob so a saved run rehydrates with its
// journals, screenshots, and maps intact. The text is reattached to
// ITEMS at load time (since ITEMS is rebuilt per page load).
function saveLore() {
  if (!Game || !Game.lore) return null;
  // Re-hydrate journal item definitions so the load side can rebuild them.
  const journals = [];
  for (const itemId of Game.lore.journalsHeld) {
    const it = ITEMS[itemId];
    if (!it || !it.isJournal) continue;
    journals.push({
      itemId, templateId: it.journalTemplateId,
      title: it.name, text: it.text, foundDay: it.foundDay,
    });
  }
  return {
    screenshots: Game.lore.screenshots.slice(),
    mapDrawings: Game.lore.mapDrawings.slice(),
    journals,
    journalsSeenIds: Array.from(Game.lore.journalsSeenIds),
    nextSnapshotKills: Game.lore.nextSnapshotKills,
  };
}

function loadLore(data) {
  if (!Game) return;
  if (!Game.lore) initLore();
  if (!data) return;
  Game.lore.screenshots = Array.isArray(data.screenshots) ? data.screenshots.slice() : [];
  Game.lore.mapDrawings = Array.isArray(data.mapDrawings) ? data.mapDrawings.slice() : [];
  Game.lore.journalsSeenIds = new Set(data.journalsSeenIds || []);
  Game.lore.nextSnapshotKills = data.nextSnapshotKills | 0 || 10;
  Game.lore.journalsHeld = [];
  // Rebuild journal ITEMS entries (they live in memory only).
  for (const j of (data.journals || [])) {
    if (!j || !j.itemId) continue;
    ITEMS[j.itemId] = {
      id: j.itemId, name: j.title || 'Journal Page', category: 'quest',
      stackMax: 1, tint: '#d8c89a',
      desc: 'A scrap of paper. Pin it on the Cork Board to read.',
      isJournal: true, journalTemplateId: j.templateId,
      text: j.text || '', foundDay: j.foundDay | 0,
    };
    Game.lore.journalsHeld.push(j.itemId);
  }
}

// ---------- Meta (cross-run) save/load ----------
// A separate localStorage key. Survives death. Tracks:
//   - journalsRead: which template ids the player has ever read (Cork Board
//     marks new ones as unread, prefers fresh text to fresh players).
//   - screenshotsKept: capped reel of memorable shots from any run.
//   - mapsDrawn: capped collection of sketches across runs.
let __loreMetaCache = null;

function loreMeta() {
  if (__loreMetaCache) return __loreMetaCache;
  loadLoreMeta();
  return __loreMetaCache;
}

function loadLoreMeta() {
  try {
    const raw = localStorage.getItem(LORE_META_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      __loreMetaCache = {
        journalsRead: Array.isArray(d.journalsRead) ? d.journalsRead : [],
        screenshotsKept: Array.isArray(d.screenshotsKept) ? d.screenshotsKept : [],
        mapsDrawn: Array.isArray(d.mapsDrawn) ? d.mapsDrawn : [],
      };
      return __loreMetaCache;
    }
  } catch {}
  __loreMetaCache = { journalsRead: [], screenshotsKept: [], mapsDrawn: [] };
  return __loreMetaCache;
}

function saveLoreMeta() {
  if (!__loreMetaCache) return;
  try {
    localStorage.setItem(LORE_META_KEY, JSON.stringify(__loreMetaCache));
  } catch {}
}

// Mark a journal template id as "read" — called by the Cork Board UI when
// the player opens a journal. Exposed for E·04 integration.
function markJournalRead(templateId) {
  if (!templateId) return;
  const meta = loreMeta();
  if (!meta.journalsRead.includes(templateId)) {
    meta.journalsRead.push(templateId);
    saveLoreMeta();
  }
}
