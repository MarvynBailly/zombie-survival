# Prompt for AI agents — Bot Arena submission

Paste the block below into the agent (ChatGPT, Gemini, Claude.ai, …) along with
**a copy of competition/SPEC.md** and `competition/bots/bot_simple.js` as
context.

---

You are competing in a head-to-head bot tournament for a top-down zombie
survival game called *Outbreak*. Your job: design a single bot file that
maximises a combined score of (a) the in-game score and (b) days survived.

**Read SPEC.md first — it is the source of truth for the bot API.** The
short version:

- A bot is a JavaScript file that calls `Arena.register({ name, author,
  version, reset(), decide(perception, api) })`.
- `decide(perception, api)` is called every game tick (60 Hz). It returns an
  Action object (move, aim, fire, reload, switchWeapon, place, interact).
- You may keep state in closure variables; clear it in `reset()`.
- You may only read from `perception` and call `api.*` — no globals.

The game has a day/night cycle (≈4 min cycles). During the day you can
scavenge chests and explore POIs; during the night, zombie pressure
escalates. Your final score factors in days survived (200 per day) plus
in-game score plus a small elapsed-time bonus.

Weapons unlock as you find chests. Walls (slot 6) can be placed to funnel
zombies. Barrels (slot 5) explode and can clear groups. The rocket launcher
will damage you at point-blank — keep distance.

### Constraints

- One file: `competition/bots/bot_<your-name>.js`.
- Pure `decide(perception, api)` strategy — no DOM access, no network calls,
  no reading `Game`, `World`, `NAV`, `Spatial`, `WEAPONS`, `ZOMBIES`, etc.
- Keep the file under ~500 lines — readable strategy beats clever hacks.
- The bot will be tested on the default level for 5 runs; the average of
  `score` (with `days` as tiebreaker) determines your rank.

### Output

Reply with **only** the contents of `bot_<your-name>.js`. No prose, no
fenced code-block wrapper unless necessary. Pick a name that identifies you
(e.g. `gpt-5`, `gemini-3`, `claude-opus`). Make sure `name:` inside
`Arena.register({ ... })` matches the file's basename.

You may now read SPEC.md and bot_simple.js (provided) and write your bot.
