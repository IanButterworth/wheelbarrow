import { clamp, dist, rand, pick } from './utils.js';
import { resolveCircle, settleOnGround, inShape } from './physics.js';
import { seatPoint } from './player.js';

export const LINES = {
  Poppy: {
    ask: ['My turn now!', 'You promised!', 'Barrow. Please.'],
    ride: ['Faster, faster!', 'Wheeee!', 'Mind the hedge!'],
    spilled: ['I meant to do that.', 'I was not scared.', 'Again! Again!'],
  },
  Alfie: {
    ask: ['Me me me!', 'Ride? Ride?', 'Wheee?'],
    ride: ['Wheeee!', 'Whoosh!', 'Zoom zoom!'],
    spilled: ['Hee hee hee!', 'Bounce!', 'Again! Again!'],
  },
};

export function makeChild(name, colors, start) {
  return {
    name, colors, lines: LINES[name] || LINES.Alfie,
    x: start.x, y: start.y,
    home: { x: start.x, y: start.y },
    state: 'wander', settledAt: null,
    target: null, moving: false, idleT: rand(0.5, 2), walkTimeout: 6,
    walkT: 0, flip: 1,
    z: 0, zv: 0, vx: 0, vy: 0, sitT: 0,
    beam: false, armsUp: false,
    seat: 0,
    bubble: null, bubbleCd: rand(2, 6),
  };
}

export function updateChild(kid, game, dt) {
  const p = game.player;
  if (kid.bubble) {
    kid.bubble.t -= dt;
    if (kid.bubble.t <= 0) kid.bubble = null;
  }
  kid.bubbleCd = Math.max(0, kid.bubbleCd - dt);

  if (kid.state === 'wander') {
    kid.beam = false;
    kid.armsUp = false;
    if (kid.moving) {
      const d = dist(kid.x, kid.y, kid.target.x, kid.target.y);
      // give up after a while: the target may sit inside a bush or the pool,
      // and without this they walk on the spot against it forever
      kid.walkTimeout -= dt;
      if (d < 6 || kid.walkTimeout <= 0) {
        kid.moving = false;
        kid.idleT = rand(1, 3.5);
      } else {
        const sp = 42;
        kid.x += ((kid.target.x - kid.x) / d) * sp * dt;
        kid.y += ((kid.target.y - kid.y) / d) * sp * dt;
        kid.walkT += dt;
        kid.flip = kid.target.x < kid.x ? -1 : 1;
      }
    } else {
      kid.idleT -= dt;
      if (kid.idleT <= 0) {
        const w = game.world;
        for (let tries = 0; tries < 6; tries++) {
          const t = {
            x: clamp(kid.home.x + rand(-110, 110), 110, w.W - 110),
            y: clamp(kid.home.y + rand(-90, 90), 140, w.H - 110),
          };
          kid.target = t;
          if (!w.solids.some((s) => inShape(s, t.x, t.y))) break;
        }
        kid.moving = true;
        kid.walkTimeout = 6;
      }
    }
    resolveCircle(kid, 8, game.world.solids);
    if (kid.bubbleCd <= 0 && dist(kid.x, kid.y, p.x, p.y) < 150 && p.cargo.kids.length < 2) {
      kid.bubble = { text: pick(kid.lines.ask), t: 2 };
      kid.bubbleCd = rand(7, 14);
      kid.flip = p.x < kid.x ? -1 : 1;
    }
  } else if (kid.state === 'carried') {
    const s = seatPoint(p, kid.seat);
    kid.x = s.x; kid.y = s.y;
    kid.flip = Math.cos(p.ba) < 0 ? -1 : 1;
    kid.beam = p.v > 100;
    if (kid.bubbleCd <= 0 && p.v > 150) {
      kid.bubble = { text: pick(kid.lines.ride), t: 1.4 };
      kid.bubbleCd = rand(3, 6);
    }
  } else if (kid.state === 'spilled') {
    if (kid.z > 0 || kid.zv > 0) {
      kid.zv -= 340 * dt;
      kid.z += kid.zv * dt;
      kid.x += kid.vx * dt;
      kid.y += kid.vy * dt;
      if (kid.z <= 0) {
        kid.z = 0; kid.zv = 0; kid.vx = 0; kid.vy = 0;
        settleOnGround(kid, 8, game.world);
        game.particles.burst('star', kid.x, kid.y - 14, 5);
        if (kid.bubbleCd <= 0) {
          kid.bubble = { text: pick(kid.lines.spilled), t: 1.8 };
          kid.bubbleCd = 3;
        }
      }
    } else {
      kid.sitT -= dt;
      if (kid.sitT <= 0) {
        kid.state = 'wander';
        kid.home = { x: kid.x, y: kid.y };
        kid.moving = false;
        kid.idleT = rand(0.5, 1.5);
      }
    }
  } else if (kid.state === 'settled') {
    kid.beam = true;
    if (kid.settledAt === 'pool' && kid.bubbleCd <= 0) {
      game.particles.burst('splash', kid.x + rand(-10, 10), kid.y - 6, 4);
      kid.bubble = { text: 'Splash!', t: 1.4 };
      kid.bubbleCd = rand(4, 9);
    }
  }
}
