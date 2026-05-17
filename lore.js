'use strict';

// ---------- F16 Journals & Lore ----------
// Lootable narrative fragments — diary pages, voicemail transcripts, texts,
// scribbled-on whiteboards. Dropped (rarely) when the player smashes the
// kinds of furniture people stash paper in: nightstands, dressers, desks,
// filing cabinets, bookshelves. Each fragment is permanently unlocked across
// runs in `prefs.lore` once picked up.
//
// No quest markers. No exposition dumps. The prose is fragmentary on purpose:
// these are notes from people who had no time to write properly.

const LORE_FRAGMENTS = [
  {
    id: 'freeway-headlights',
    title: 'FIELD JOURNAL · DAY 11',
    source: 'spiral notebook, water-damaged',
    body: 'I keep counting headlights on the freeway. There are none. The on-ramp sign still says LOS ANGELES 412 like it owes someone an apology.',
  },
  {
    id: 'qfc-empty',
    title: 'TXT MESSAGE · UNSENT',
    source: 'cracked phone, 4% battery',
    body: 'mom call me back i drove past the QFC its empty and the doors are open. the doors are OPEN mom please',
  },
  {
    id: 'voicemail-342',
    title: 'VOICEMAIL · 3:42 AM',
    source: 'office answering machine',
    body: 'Hey. Hey it\'s me. If you get this don\'t come home. Don\'t come home. I love you. I\'m sorry about the —',
  },
  {
    id: 'ucsf-whiteboard',
    title: 'WHITEBOARD NOTE · UCSF',
    source: 'dry-erase, partly smudged',
    body: 'FERRIS REAGENT NEGATIVE. ANTIBIOTICS WORK ON SUBSET BUT — see DR. KIM\'S notes re: necrosis margin. WE NEED MORE TIME.',
  },
  {
    id: 'diary-day-3',
    title: 'DIARY · DAY 3',
    source: 'leather-bound, dog-eared',
    body: 'Dad started speaking to the radio again. The radio hasn\'t worked since Tuesday. He says they answered him. He says they want to come inside.',
  },
  {
    id: 'shopping-list',
    title: 'GROCERY LIST',
    source: 'fridge magnet, child\'s handwriting',
    body: 'milk\ncereal\nthe kind of bread daddy likes\nbandages (lots)\nthe gun under the bed',
  },
  {
    id: 'email-draft',
    title: 'EMAIL · DRAFT (NEVER SENT)',
    source: 'work laptop, battery dying',
    body: 'Subject: Re: Q4 deliverables\n\nDavid — I appreciate the follow-up but I am currently barricaded inside the supply closet on the fourth floor. The Q4 deck will be late. Best, J.',
  },
  {
    id: 'cb-radio-log',
    title: 'CB RADIO LOG · NIGHT 6',
    source: 'logbook, pencil, hurried',
    body: '02:14 — Convoy claims they\'re south of Tacoma. Holding.\n02:31 — Convoy not responding.\n02:47 — Convoy not responding.\n03:09 — Someone screaming on their frequency. Not them. Not them.',
  },
  {
    id: 'church-flyer',
    title: 'CHURCH FLYER',
    source: 'stapled to a power pole',
    body: 'EVENING SERVICE CANCELLED INDEFINITELY. PASTOR MARK WILL BE MISSED. PLEASE DO NOT ENTER THE SANCTUARY. PLEASE DO NOT ENTER THE SANCTUARY.',
  },
  {
    id: 'kid-drawing',
    title: 'CRAYON DRAWING',
    source: 'taped to a nightstand',
    body: '[A house. Three stick figures in front. A fourth, taller, in the upstairs window, drawn entirely in black. Below, in green crayon: "MOMS FRIEND"]',
  },
  {
    id: 'pharmacy-note',
    title: 'PHARMACY COUNTER NOTE',
    source: 'taped to a cash register',
    body: 'IF YOU NEED INSULIN — back room, second shelf, blue cooler. The combo is my mother\'s birthday. I am sorry I cannot stay. — Priya',
  },
  {
    id: 'cdc-bulletin',
    title: 'CDC BULLETIN · 03/14',
    source: 'official letterhead, folded twice',
    body: 'Avoid bites. Avoid scratches. Avoid bodily fluids. Avoid the recently deceased. Avoid public gatherings. Avoid your neighbors if they seem changed. We are working on it.',
  },
  {
    id: 'highway-sign',
    title: 'HIGHWAY SIGN · I-5 NB',
    source: 'photo printout, sun-bleached',
    body: 'AMBER ALERT CANCELED\nROAD CLOSED 47 MI\nDO NOT EXIT\nTHEY ARE AT THE EXITS',
  },
  {
    id: 'bunker-inventory',
    title: 'BUNKER INVENTORY · UPDATED',
    source: 'clipboard',
    body: 'beans: 41 cans\nrice: 16 lb\nwater: 28 gal\nammo: enough\nhope: see above\nDays since last contact: 19',
  },
  {
    id: 'soldier-letter',
    title: 'LETTER FROM A SOLDIER',
    source: 'unsealed envelope, never mailed',
    body: 'Beth — the colonel said it would be over in three weeks. The colonel is dead now. The corporal says the same thing. I don\'t think the corporal believes it either. Kiss the dog for me.',
  },
  {
    id: 'recipe-card',
    title: 'RECIPE CARD',
    source: 'index card, grease-stained',
    body: 'GRANDMA\'S PEACH COBBLER — bake @ 375 for 45 min. Use cold butter. Do not let your sister help. She still doesn\'t know about the bourbon.',
  },
  {
    id: 'school-poster',
    title: 'SCHOOL HALLWAY POSTER',
    source: 'thumbtacked, corner torn',
    body: 'STAY CALM\nSTAY INSIDE\nWAIT FOR INSTRUCTIONS\n[Beneath, in red sharpie: NO ONE IS COMING DON\'T WAIT]',
  },
  {
    id: 'lab-log',
    title: 'LAB LOG · SUBJECT 14',
    source: 'spiral binder, lab-coat blood',
    body: 'D+7: Subject still ambulatory. Auditory response: none. Photic response: orient toward movement. Vital signs: refer to graph (page torn out). Subject is no longer my brother.',
  },
  {
    id: 'realtor-flyer',
    title: 'REAL ESTATE FLYER',
    source: 'mailbox stuffer',
    body: 'OPEN HOUSE SUNDAY 12-3\n4BR / 2BA — UPDATED KITCHEN — FINISHED BASEMENT — MOTIVATED SELLER\n[Handwritten across the bottom: PLEASE BUY THIS HOUSE I HAVE NOWHERE TO GO]',
  },
  {
    id: 'birthday-card',
    title: 'BIRTHDAY CARD',
    source: 'unopened, on a kitchen table',
    body: 'Happy 40th, you old wreck. I know things have been rough but we made it this far together. Cake at six. Love always — M.\n\n[The envelope is dated three days before the outbreak.]',
  },
  {
    id: 'graffiti',
    title: 'GRAFFITI · UNDERPASS',
    source: 'spray paint, fresh',
    body: 'THEY CAN\'T CLIMB\nTHEY CAN\'T SWIM\nTHEY DON\'T SLEEP\nTHEY REMEMBER YOU',
  },
  {
    id: 'security-log',
    title: 'SECURITY LOG · WAREHOUSE 4',
    source: 'paper printout',
    body: '20:14 — perimeter clear\n21:00 — perimeter clear\n22:47 — movement east fence — investigating\n22:51 — false alarm, possible deer\n22:58 — \n22:58 — \n22:58 — \n22:59 — they are not deer',
  },
  {
    id: 'pet-collar',
    title: 'PET COLLAR TAG',
    source: 'engraved aluminum',
    body: 'MAX — IF FOUND PLEASE CALL (206) 555-0144 — MAX IS FRIENDLY MAX DOES NOT BITE — WE LOVE HIM',
  },
  {
    id: 'church-confession',
    title: 'PEW NOTE',
    source: 'folded paper, slipped in a hymnal',
    body: 'Father, I shot the woman from 4B. I am not sorry. She was going to bite my son. I will not be at confession this week. I will not be at confession ever.',
  },
  {
    id: 'last-broadcast',
    title: 'LAST BROADCAST · KING 5',
    source: 'transcript, partial',
    body: '— if you are watching this we are still on the air the studio is — please stay indoors if at all possible — we love you — we love you all — [SIGNAL LOST]',
  },
];

// ---------- Helpers ----------

function lorePickById(id) {
  for (const f of LORE_FRAGMENTS) if (f.id === id) return f;
  return null;
}

// Return an id the player has not yet collected. Falls back to a random id
// (which they\'ve already seen) if the collection is complete — better to
// drop a duplicate than to silently no-op the drop.
function loreRandomUnseenId() {
  const collected = new Set(getCollectedLoreIds());
  const unseen = LORE_FRAGMENTS.filter(f => !collected.has(f.id));
  const pool = unseen.length > 0 ? unseen : LORE_FRAGMENTS;
  return pool[(Math.random() * pool.length) | 0].id;
}

// Persisted set (as an array) lives on `prefs.lore`. Created lazily.
function getCollectedLoreIds() {
  if (!Array.isArray(prefs.lore)) prefs.lore = [];
  return prefs.lore;
}

// Returns true if this is a newly-collected fragment, false if it was
// already in the set (so callers can decide whether to play SFX / notice).
function saveLoreId(id) {
  const ids = getCollectedLoreIds();
  if (ids.indexOf(id) >= 0) return false;
  ids.push(id);
  try { savePrefs(); } catch {}
  return true;
}
