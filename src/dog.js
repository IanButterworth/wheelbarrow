import { dist, rand } from './utils.js';
import { resolveCircle } from './physics.js';

export function makeDog(home) {
  return {
    x: home.x, y: home.y, home,
    state: 'sleep', t: 0, flip: 1,
    barkCd: 0, zzCd: 0,
  };
}

export function wakeDog(dog, game) {
  if (dog.state !== 'sleep') return;
  dog.state = 'alert';
  dog.t = 0.6;
  game.events.emit('dog-woke', {});
}

export function updateDog(dog, game, dt) {
  const p = game.player;
  const dp = dist(dog.x, dog.y, p.x, p.y);

  if (dog.state === 'sleep') {
    dog.zzCd -= dt;
    if (dog.zzCd <= 0) {
      dog.zzCd = rand(1.4, 2.4);
      game.particles.spawn('zz', dog.x - 12, dog.y - 22);
    }
    if (dp < 180 && p.v > 140) wakeDog(dog, game);
  } else if (dog.state === 'alert') {
    dog.t -= dt;
    dog.flip = p.x < dog.x ? -1 : 1;
    if (dog.t <= 0) { dog.state = 'chase'; dog.t = 6; game.events.emit('dog-chase', {}); }
  } else if (dog.state === 'chase') {
    dog.t -= dt;
    const d = Math.max(dp, 1);
    dog.flip = p.x < dog.x ? -1 : 1;
    if (dp > 46) {
      dog.x += ((p.x - dog.x) / d) * 168 * dt;
      dog.y += ((p.y - dog.y) / d) * 168 * dt;
    }
    dog.barkCd -= dt;
    if (dog.barkCd <= 0 && dp < 120) {
      dog.barkCd = rand(0.5, 0.9);
      game.events.emit('bark', { x: dog.x, y: dog.y });
      p.rollVel += (Math.random() < 0.5 ? -1 : 1) * 2.2;
    }
    if (dog.t <= 0) { dog.state = 'return'; dog.t = 12; }
  } else if (dog.state === 'return') {
    const dh = dist(dog.x, dog.y, dog.home.x, dog.home.y);
    dog.flip = dog.home.x < dog.x ? -1 : 1;
    dog.t -= dt;   // never trot home forever if something is in the way
    if (dh < 8 || dog.t <= 0) {
      dog.state = 'sleep';
      dog.zzCd = 1;
    } else {
      dog.x += ((dog.home.x - dog.x) / dh) * 110 * dt;
      dog.y += ((dog.home.y - dog.y) / dh) * 110 * dt;
    }
  }
  resolveCircle(dog, 9, game.world.solids);
}
