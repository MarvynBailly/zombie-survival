'use strict';

// Random bot. Sanity check — proves the harness can drive any policy. Picks
// random move/aim/fire each second-ish. Not expected to score well.

(function () {

let nextChange = 0;
let move = { x: 0, y: 0 };
let fire = false;

Arena.register({
  name: 'random',
  author: 'house',
  version: '1.0',

  reset() {
    nextChange = 0;
    move = { x: 0, y: 0 };
    fire = false;
  },

  decide(perception, api) {
    // Re-roll movement + fire intent ~every 60 frames.
    if (perception.tick >= nextChange) {
      nextChange = perception.tick + 30 + Math.floor(Math.random() * 60);
      const ang = Math.random() * Math.PI * 2;
      move = { x: Math.cos(ang), y: Math.sin(ang) };
      fire = Math.random() < 0.5;
    }

    // Aim at nearest visible zombie if there is one; otherwise straight ahead.
    let aim = null;
    const z = perception.zombies[0];
    if (z) {
      aim = api.leadShot(perception.self, z, 900);
    } else {
      aim = {
        x: perception.self.x + move.x * 200,
        y: perception.self.y + move.y * 200,
      };
    }

    return {
      move,
      aim,
      fire: fire && !!z,
    };
  },
});

})();
