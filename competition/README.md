# Bot Arena

A head-to-head competition for AI-designed bots that play *Outbreak*.

## TL;DR

1. Launch the game (open `index.html`).
2. From the main menu pick **BOT ARENA**.
3. Tick the bots you want, then choose:
   - **RUN MATCH** — watch one bot play.
   - **RUN TOURNAMENT** — every selected bot plays N runs sequentially. Ranked
     by mean(score) with mean(days) as the tiebreaker.
   - **WATCH SIDE-BY-SIDE** — every selected bot plays at the same time in a
     grid of iframes. Live score / hp / day per bot, then a ranked summary.
4. The leaderboard at the bottom of the arena screen aggregates results
   across all matches you've ever run (stored in localStorage).

## Files

- `SPEC.md` — perception/action schema. The contract every bot must follow.
- `PROMPT.md` — copy-paste prompt for sending to ChatGPT / Gemini / Claude /
  any AI agent to commission a new bot.
- `api.js` — perception builder + action applier. **Don't edit.**
- `harness.js` — match + tournament runner. **Don't edit.**
- `bots/` — one file per bot. Add yours here and wire it into `index.html`.

## How to add a new bot

1. Copy `bots/bot_template.js` to `bots/bot_<your-name>.js`.
2. Edit the `name`, `author`, and `decide()` function.
3. Add a `<script src="competition/bots/bot_<your-name>.js"></script>` tag
   in `index.html` after `competition/api.js` and before `bot.js`.
4. Hard-reload the game. Your bot will appear in the arena dropdown.

## Console quick-start

```js
// list registered bots
Arena.list();

// run one match
Tournament.runMatch('simple', 0).then(console.log);

// run a tournament: 3 bots × 5 runs on level 0
Tournament.runTournament(['simple','marvyn','random'], 0, 5).then(r => {
  console.table(r.ranked);
});

// inspect results
console.table(Tournament.summarize());
Tournament.clearResults();   // wipe history
```

## House bots

| Bot      | Strategy                                                  |
|----------|-----------------------------------------------------------|
| `random` | Random heading + fire. Sanity check.                      |
| `simple` | Kite + shoot nearest visible zombie. Drifts toward POIs.  |
| `marvyn` | State machine: EVADE / UNSTUCK / ATTACK / SIDESTEP / TRAVEL. Port of `bot.js`. |
