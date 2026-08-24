import { rand, dist, TAU } from './utils.js';
import { settleOnGround } from './physics.js';
import { C } from './palette.js';
import * as S from './sprites.js';

// Things that can ride in the barrow besides the children. Each knows where it
// belongs, which is what turns a piece of scenery into somewhere worth going.
export const ITEMS = {
  duck: { r: 10, the: 'the duck', home: 'pond', carry: -10 },
  pot: { r: 9, the: 'a seedling', home: 'veg', carry: -14 },
  sheet: { r: 11, the: 'a sheet', home: 'line', carry: -8 },
  gnome: { r: 8, the: 'the gnome', home: 'patio', carry: -12 },
};

export function makeItem(kind, x, y, extra = {}) {
  return {
    kind, x, y, z: 0, zv: 0, vx: 0, vy: 0,
    state: 'loose', settledAt: null,
    flip: 1, t: rand(0, 6), seed: Math.floor(rand(0, 100)),
    ...extra,
  };
}

export const itemAirborne = (it) => it.z > 0 || it.zv > 0;

export function updateItem(it, game, dt) {
  it.t += dt;
  if (it.state === 'carried') return;

  if (itemAirborne(it)) {
    it.zv -= 340 * dt;
    it.z += it.zv * dt;
    it.x += it.vx * dt;
    it.y += it.vy * dt;
    if (it.z <= 0) {
      it.z = 0; it.zv = 0; it.vx = 0; it.vy = 0;
      settleOnGround(it, ITEMS[it.kind].r, game.world);
      if (it.kind === 'duck') game.events.emit('quack', {});
    }
    return;
  }

  // once home in the pond the duck paddles about, which is the whole reward
  if (it.kind === 'duck' && it.settledAt === 'pond') {
    const pd = game.world.pond;
    it.x += Math.cos(it.t * 0.23) * dt * 9;
    it.y += Math.sin(it.t * 0.31) * dt * 5;
    it.flip = Math.cos(it.t * 0.23) < 0 ? -1 : 1;
    const dx = (it.x - pd.x) / (pd.rx * 0.7), dy = (it.y - pd.y) / (pd.ry * 0.7);
    const m = Math.hypot(dx, dy);
    if (m > 1) { it.x = pd.x + (dx / m) * pd.rx * 0.7; it.y = pd.y + (dy / m) * pd.ry * 0.7; }
  }

  // a loose duck waddles a little, and grumbles if you crowd it
  if (it.kind === 'duck' && it.state === 'loose') {
    const p = game.player;
    const d = dist(it.x, it.y, p.x, p.y);
    if (d < 70) {
      it.flip = p.x < it.x ? 1 : -1;
      const away = Math.atan2(it.y - p.y, it.x - p.x);
      it.x += Math.cos(away) * 26 * dt;
      it.y += Math.sin(away) * 26 * dt;
      settleOnGround(it, ITEMS.duck.r, game.world);
      it.fussCd = (it.fussCd || 0) - dt;
      if (it.fussCd <= 0) { it.fussCd = rand(2.5, 5); game.events.emit('quack', {}); }
    }
  }
}

export function drawItem(ctx, it, t) {
  const z = it.z || 0;
  switch (it.kind) {
    case 'duck':
      S.drawDuck(ctx, { x: it.x, y: it.y - z, flip: it.flip }, t, it.settledAt === 'pond');
      break;
    case 'pot':
      S.drawPot(ctx, it.x, it.y - z, 0.72, C.flower3);
      break;
    case 'sheet':
      S.drawSheet(ctx, it.x, it.y, t, it.seed, z);
      break;
    case 'gnome':
      if (it.settledAt === 'patio') S.drawGnome(ctx, it.x, it.y - z);
      else {                            // knocked over, lying on his side
        ctx.save();
        ctx.translate(it.x, it.y - z);
        ctx.rotate(1.35);
        S.drawGnome(ctx, 0, 0);
        ctx.restore();
      }
      break;
  }
}

// Drawn inside the barrow tub, in the barrow's local space.
export function drawCarriedItem(ctx, it, x, y, t) {
  switch (it.kind) {
    case 'duck':
      S.drawDuck(ctx, { x, y: y + 6, flip: 1 }, t, false);
      break;
    case 'pot':
      S.drawPot(ctx, x, y + 12, 0.6, C.flower3);
      break;
    case 'sheet':
      S.drawSheet(ctx, x, y + 6, t, it.seed, 0);
      break;
    case 'gnome':
      S.drawGnome(ctx, x, y + 12);
      break;
  }
}
