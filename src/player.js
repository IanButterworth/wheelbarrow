import { TAU, clamp, lerp, dist, shortAngle, rand, expDamp } from './utils.js';
import { resolveCircle, surfaceAt, settleOnGround } from './physics.js';
import { C } from './palette.js';
import * as S from './sprites.js';

// Feel constants: tuned so walking is safe everywhere and trotting through
// corners or over molehills is what spills the load.
const WALK = 120, TROT_MUL = 1.6, ACCEL = 400, DECEL = 600;
const HAND_OFF = 16, BARROW_LEN = 34, WHEEL_AHEAD = 54;
const BA_K = 52, BA_D = 8.5;             // barrow heading spring
const ROLL_K = 100, ROLL_D = 7;          // roll oscillator
const ROLL_LIMIT = 0.55, K_LAT = 0.062, TROT_LAT = 1.8;
const K_BUMP = 0.018, GRAVEL_JIT = 14;

export function makePlayer(world) {
  const s = world.parentStart;
  return {
    x: s.x, y: s.y, a: 0, v: 0,
    ba: 0, baVel: 0,
    roll: 0, rollVel: 0,
    wheelPhase: 0, bobT: 0,
    cargo: { kids: [], apples: 0 },
    tipT: 0, trampleCd: 0, dustCd: 0,
    surface: { type: 'grass', speed: 1 },
  };
}

// once the barrow is set down for the picnic it stays where it was parked
export const handsPoint = (p) => p.park || ({ x: p.x + Math.cos(p.a) * HAND_OFF, y: p.y + Math.sin(p.a) * HAND_OFF });
export function barrowCenter(p) {
  const h = handsPoint(p);
  return { x: h.x + Math.cos(p.ba) * BARROW_LEN, y: h.y + Math.sin(p.ba) * BARROW_LEN };
}
export function wheelPoint(p) {
  const h = handsPoint(p);
  return { x: h.x + Math.cos(p.ba) * WHEEL_AHEAD, y: h.y + Math.sin(p.ba) * WHEEL_AHEAD };
}
export function seatPoint(p, i) {
  const h = handsPoint(p);
  const d = 22 + i * 15;
  return {
    x: h.x + Math.cos(p.ba) * d - Math.sin(p.ba) * p.roll * 8,
    y: h.y + Math.sin(p.ba) * d - 4,
  };
}

export const canLoadKid = (p) =>
  p.cargo.kids.length === 0 ? p.cargo.apples <= 3 : p.cargo.kids.length === 1 && p.cargo.apples === 0;
export const canLoadApple = (p) =>
  p.cargo.kids.length === 0 ? p.cargo.apples < 6 : p.cargo.kids.length === 1 && p.cargo.apples < 3;

function ejectKid(game, kid, side) {
  const p = game.player;
  const b = barrowCenter(p);
  const px = -Math.sin(p.ba) * side, py = Math.cos(p.ba) * side;
  kid.state = 'spilled';
  kid.x = b.x + px * 12; kid.y = b.y + py * 12;
  kid.z = 18; kid.zv = 100;
  kid.vx = px * rand(60, 100) + Math.cos(p.a) * p.v * 0.35;
  kid.vy = py * rand(60, 100) + Math.sin(p.a) * p.v * 0.35;
  kid.sitT = rand(1.6, 2.4);
  kid.beam = true;
}

function scatterApples(game, gentle) {
  const p = game.player;
  const b = barrowCenter(p);
  for (let i = 0; i < p.cargo.apples; i++) {
    const a = rand(TAU);
    const d = gentle ? rand(14, 30) : rand(18, 55);
    const spot = settleOnGround({ x: b.x + Math.cos(a) * d, y: b.y + Math.sin(a) * d * 0.7 }, 6, game.world);
    game.world.apples.push(spot);
  }
  p.cargo.apples = 0;
}

function finishTip(game) {
  const p = game.player;
  const w = game.world;
  // honour what the prompt promised when the tip started, not where the
  // barrow has drifted to by the time the animation finishes
  const atCrate = p.tipAtCrate;
  if (p.cargo.apples > 0) {
    if (atCrate) {
      const n = p.cargo.apples;
      game.crateApples += n;
      p.cargo.apples = 0;
      game.events.emit('apples-tipped', { n });
    } else {
      scatterApples(game, true);
    }
  }
  const wp = wheelPoint(p);
  const kids = p.cargo.kids.splice(0);
  kids.forEach((kid, i) => {
    const side = i === 0 ? 1 : -1;
    kid.x = wp.x + Math.cos(p.ba) * 14 - Math.sin(p.ba) * side * 12;
    kid.y = wp.y + Math.sin(p.ba) * 14 + Math.cos(p.ba) * side * 12;
    kid.z = 0; kid.zv = 0;
    settleOnGround(kid, 8, w);
    let spot = null;
    const pr = w.regions.pool;
    const bl = w.regions.blanket;
    if (dist(kid.x, kid.y, pr.x, pr.y) < pr.r) {
      spot = 'pool';
      kid.state = 'settled';
      kid.settledAt = 'pool';
      kid.x = pr.x + (kid.name === 'Poppy' ? -16 : 16);
      kid.y = pr.y + 34;
    } else if (Math.abs(kid.x - bl.x) < bl.rx && Math.abs(kid.y - bl.y) < bl.ry) {
      spot = 'blanket';
      kid.state = 'settled';
      kid.settledAt = 'blanket';
      kid.x = bl.x + (kid.name === 'Poppy' ? -30 : 30);
      kid.y = bl.y + 14;
    } else {
      kid.state = 'wander';
      kid.home = { x: kid.x, y: kid.y };
      kid.settledAt = null;
    }
    game.events.emit('unload', { kid, spot, x: kid.x, y: kid.y });
  });
}

export function updatePlayer(game, dt) {
  const p = game.player;
  const w = game.world;
  const snap = game.input.snap;

  // steering: turn rate shrinks with speed; opposing input brakes first
  const vMax = WALK * TROT_MUL;
  if (snap.mag > 0 && p.tipT <= 0) {
    const want = Math.atan2(snap.my, snap.mx);
    const diff = shortAngle(p.a, want);
    const braking = Math.abs(diff) > 2.1 && p.v > 40;
    if (!braking) {
      const tr = lerp(3.5, 1.6, clamp(p.v / vMax, 0, 1));
      p.a += clamp(diff, -tr * dt, tr * dt);
    }
    const target = braking ? 0 : snap.mag * WALK * (snap.trot ? TROT_MUL : 1) * p.surface.speed;
    p.v += clamp(target - p.v, -DECEL * dt, ACCEL * dt);
  } else {
    p.v += clamp(0 - p.v, -DECEL * dt, 0);
  }
  p.x += Math.cos(p.a) * p.v * dt;
  p.y += Math.sin(p.a) * p.v * dt;
  p.bobT += dt * (0.4 + p.v / WALK);

  resolveCircle(p, 10, w.solids);

  // barrow heading chases the parent heading on an underdamped spring
  p.baVel += (BA_K * shortAngle(p.ba, p.a) - BA_D * p.baVel) * dt;
  p.ba += p.baVel * dt;

  // barrow collision pushes the parent back
  const b = barrowCenter(p);
  const probe = { x: b.x, y: b.y };
  const hit = resolveCircle(probe, 13, w.solids);
  if (hit) {
    p.x += probe.x - b.x;
    p.y += probe.y - b.y;
    if (p.v > 60) {
      p.rollVel += rand(-1, 1) * p.v * 0.01;
      game.events.emit('clunk', { v: p.v });
    }
    p.v *= 1 - expDamp(24, dt);
  }

  // surface under the wheel
  const wp = wheelPoint(p);
  p.surface = surfaceAt(w.surfaces, wp.x, wp.y);
  if (p.surface.type === 'gravel') p.rollVel += rand(-1, 1) * GRAVEL_JIT * (p.v / vMax) * dt;

  // the wheel kicks up dust on anything but grass
  p.dustCd -= dt;
  if (p.dustCd <= 0 && p.v > 70 && p.surface.type !== 'grass') {
    p.dustCd = 0.07;
    game.particles.spawn('dust', wp.x + rand(-3, 3), wp.y + rand(-2, 2), {
      vx: -Math.cos(p.ba) * p.v * 0.12 + rand(-10, 10),
      vy: -Math.sin(p.ba) * p.v * 0.12 + rand(-14, -2),
      size: rand(2.5, 5) * (p.v / vMax + 0.5),
    });
  }
  if (p.surface.type === 'bed' && p.v > 25 && p.trampleCd <= 0) {
    p.trampleCd = 2.5;
    game.events.emit('trample', { x: wp.x, y: wp.y });
  }
  p.trampleCd = Math.max(0, p.trampleCd - dt);

  // molehill bumps
  for (const m of w.molehills) {
    if (m.cooldown <= 0 && p.v > 30 && dist(wp.x, wp.y, m.x, m.y) < m.r + 6) {
      m.cooldown = 0.8;
      p.rollVel += (Math.random() < 0.5 ? -1 : 1) * K_BUMP * p.v;
      game.events.emit('bump', { x: m.x, y: m.y, v: p.v });
    }
  }

  // roll oscillator; lat is the cornering acceleration
  const lat = p.v * p.baVel * K_LAT * (game.input.snap.trot ? TROT_LAT : 1);
  p.rollVel += (-ROLL_K * p.roll - ROLL_D * p.rollVel + lat) * dt;
  p.roll += p.rollVel * dt;
  if (Math.abs(p.roll) > ROLL_LIMIT) {
    if (p.cargo.kids.length > 0 || p.cargo.apples > 0) {
      const side = Math.sign(p.roll);
      for (const kid of p.cargo.kids.splice(0)) ejectKid(game, kid, side);
      scatterApples(game, false);
      // suddenly empty, the barrow rocks back rather than snapping upright
      p.roll = side * ROLL_LIMIT * 0.5;
      p.rollVel = -side * 1.6;
      game.camera.shake = 1.2;
      game.events.emit('spill', { x: b.x, y: b.y });
    } else {
      p.roll = Math.sign(p.roll) * ROLL_LIMIT;
      p.rollVel *= -0.35;
    }
  }

  // apples roll into the barrow as you drive over them
  for (let i = w.apples.length - 1; i >= 0; i--) {
    const a = w.apples[i];
    if (canLoadApple(p) && dist(b.x, b.y, a.x, a.y) < 28) {
      w.apples.splice(i, 1);
      p.cargo.apples++;
      game.events.emit('apple', { count: p.cargo.apples, x: a.x, y: a.y });
    }
  }

  // tipping
  if (p.tipT > 0) {
    p.tipT -= dt;
    p.v *= 1 - expDamp(13, dt);
    if (p.tipT <= 0) finishTip(game);
  }

  // context prompt + action
  let candidate = null;
  if (canLoadKid(p)) {
    for (const kid of game.children) {
      if (kid.state === 'carried') continue;
      if (kid.state === 'spilled' && kid.z > 0) continue;
      // don't scoop a child back up off the picnic blanket while delivering the
      // other one: with cargo aboard the action key means "tip out"
      if (kid.state === 'settled' && p.cargo.kids.length > 0) continue;
      if (dist(b.x, b.y, kid.x, kid.y) < 56 || dist(p.x, p.y, kid.x, kid.y) < 46) { candidate = kid; break; }
    }
  }
  const atCrate = dist(b.x, b.y, w.regions.crate.x, w.regions.crate.y) < w.regions.crate.r;
  if (candidate) game.prompt = { text: `pick up ${candidate.name}`, icon: 'load' };
  else if (p.cargo.apples > 0 && atCrate) game.prompt = { text: 'tip the apples in', icon: 'pour' };
  else if (p.cargo.kids.length > 0 || p.cargo.apples > 0) game.prompt = { text: 'tip everyone out', icon: 'tip' };
  else game.prompt = null;

  if (snap.action && p.tipT <= 0) {
    if (candidate) {
      candidate.state = 'carried';
      candidate.seat = p.cargo.kids.length;
      candidate.settledAt = null;
      p.cargo.kids.push(candidate);
      game.events.emit('load', { kid: candidate });
    } else if (p.cargo.kids.length > 0 || p.cargo.apples > 0) {
      p.tipT = 0.4;
      p.tipAtCrate = atCrate;
      game.events.emit('tip-start', {});
    }
  }

  // wheel squeak, once per revolution
  p.wheelPhase += (p.v * dt) / 30;
  if (p.wheelPhase >= 1) {
    p.wheelPhase -= 1;
    if (p.v > 20) game.events.emit('squeak', { v: p.v });
  }
}

export function drawBarrow(ctx, game) {
  const p = game.player;
  const h = handsPoint(p);
  const b = barrowCenter(p);
  const wp = wheelPoint(p);
  S.shadow(ctx, b.x, b.y + 3, 26, 10);

  const warning = Math.abs(p.roll) > ROLL_LIMIT * 0.6;
  const shakeX = warning ? rand(-1.2, 1.2) : 0;

  ctx.save();
  ctx.translate(h.x + shakeX, h.y - 8);
  ctx.rotate(p.ba);
  ctx.scale(1, 0.72);
  ctx.rotate(p.roll * 0.3 + (p.tipT > 0 ? (0.4 - p.tipT) * 1.4 : 0));
  // handles
  ctx.strokeStyle = C.wood;
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-8, -10); ctx.lineTo(16, -12);
  ctx.moveTo(-8, 10); ctx.lineTo(16, 12);
  ctx.stroke();
  // tub
  ctx.fillStyle = C.barrowDark;
  ctx.beginPath();
  ctx.moveTo(12, -14);
  ctx.lineTo(54, -18);
  ctx.quadraticCurveTo(62, 0, 54, 18);
  ctx.lineTo(12, 14);
  ctx.quadraticCurveTo(6, 0, 12, -14);
  ctx.fill();
  ctx.fillStyle = C.barrow;
  ctx.beginPath();
  ctx.moveTo(16, -10);
  ctx.lineTo(50, -13);
  ctx.quadraticCurveTo(56, 0, 50, 13);
  ctx.lineTo(16, 10);
  ctx.quadraticCurveTo(12, 0, 16, -10);
  ctx.fill();
  // apples heap
  for (let i = 0; i < p.cargo.apples; i++) {
    const ax = 24 + (i % 3) * 11, ay = -6 + Math.floor(i / 3) * 9 + (i % 2) * 3;
    ctx.fillStyle = C.apple;
    ctx.beginPath();
    ctx.arc(ax, ay, 5, 0, TAU);
    ctx.fill();
  }
  ctx.restore();

  // wheel with turning spokes
  const wy = wp.y - 7;
  ctx.fillStyle = C.wheel;
  ctx.beginPath();
  ctx.arc(wp.x, wy, 7, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = C.wheelHub;
  ctx.lineWidth = 1.8;
  const sp = p.wheelPhase * TAU;
  ctx.beginPath();
  ctx.moveTo(wp.x + Math.cos(sp) * 5, wy + Math.sin(sp) * 5);
  ctx.lineTo(wp.x - Math.cos(sp) * 5, wy - Math.sin(sp) * 5);
  ctx.moveTo(wp.x - Math.sin(sp) * 5, wy + Math.cos(sp) * 5);
  ctx.lineTo(wp.x + Math.sin(sp) * 5, wy - Math.cos(sp) * 5);
  ctx.stroke();

  // seated kids
  for (const kid of p.cargo.kids) {
    const s = seatPoint(p, kid.seat);
    const bounce = Math.abs(Math.sin(p.wheelPhase * TAU * 2)) * (p.v / (WALK * TROT_MUL)) * 3.5;
    const fast = p.v > WALK * 1.25;
    drawSeatedKid(ctx, kid, s.x - p.roll * 9, s.y - 12 - bounce, fast);
  }
}

function drawSeatedKid(ctx, kid, x, y, armsUp) {
  S.drawChildTorso(ctx, x, y, kid.colors, kid.flip || 1, armsUp, armsUp);
}

export function drawPlayer(ctx, game) {
  const p = game.player;
  const h = handsPoint(p);
  S.drawParent(ctx, p, h.x, h.y);
}

export { ROLL_LIMIT, WALK, TROT_MUL };
