import { dist, rand, pick } from './utils.js';
import { resolveCircle } from './physics.js';

const TUTS = ['Mind the begonias!', 'Not the marrows!', 'Oi! My dahlias!'];
const NICE = ['Lovely day for it.', 'Careful now!', 'Who wants a biscuit?'];

export function makeGran(spots) {
  return {
    x: spots[0].x, y: spots[0].y,
    spots, i: 0,
    pose: 'weed', t: rand(5, 9),
    moving: false, wave: false, flip: 1,
    bubble: null, bubbleCd: 8,
  };
}

export function updateGran(g, game, dt) {
  const p = game.player;
  if (g.bubble) {
    g.bubble.t -= dt;
    if (g.bubble.t <= 0) g.bubble = null;
  }
  g.bubbleCd = Math.max(0, g.bubbleCd - dt);

  const near = dist(g.x, g.y, p.x, p.y) < 140;
  g.wave = near && g.pose !== 'weed';
  if (near) g.flip = p.x < g.x ? -1 : 1;
  if (near && g.bubbleCd <= 0 && !g.bubble) {
    g.bubble = { text: pick(NICE), t: 2.2 };
    g.bubbleCd = rand(12, 20);
  }

  if (g.pose === 'weed') {
    g.t -= dt;
    if (g.t <= 0) {
      g.pose = 'walk';
      g.i = (g.i + 1) % g.spots.length;
    }
  } else {
    const s = g.spots[g.i];
    const d = dist(g.x, g.y, s.x, s.y);
    if (d < 5) {
      g.pose = 'weed';
      g.t = rand(6, 10);
      g.moving = false;
    } else {
      g.moving = true;
      g.x += ((s.x - g.x) / d) * 34 * dt;
      g.y += ((s.y - g.y) / d) * 34 * dt;
      if (!near) g.flip = s.x < g.x ? -1 : 1;
    }
  }
  resolveCircle(g, 10, game.world.solids);
}

export function granTut(g) {
  g.bubble = { text: pick(TUTS), t: 2.5 };
  g.bubbleCd = 6;
  g.wave = false;
}
