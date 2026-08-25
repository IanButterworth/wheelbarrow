import { TAU, clamp, lerp, dist, shortAngle, rand, expDamp } from './utils.js';
import { resolveCircle, surfaceAt, settleOnGround } from './physics.js';
import { ITEMS, drawCarriedItem, makeItem } from './items.js';
import { C } from './palette.js';
import * as S from './sprites.js';

// Feel constants: tuned so walking is safe everywhere and trotting through
// corners or over molehills is what spills the load.
const WALK = 120, TROT_MUL = 1.6, ACCEL = 400, DECEL = 600;
const HAND_OFF = 16, BARROW_LEN = 34, WHEEL_AHEAD = 54;
const BA_K = 52, BA_D = 8.5;             // barrow heading spring
const ROLL_K = 100, ROLL_D = 7;          // roll oscillator
const ROLL_LIMIT = 0.55, K_LAT = 0.062, TROT_LAT = 1.8;
// Gravel jitter is a random walk, so its per-step impulse scales with the
// square root of dt: scaling it linearly made spills on a path measurably
// likelier at 60Hz than at 144Hz.
const K_BUMP = 0.018, GRAVEL_JIT = 1.8;

export function makePlayer(world) {
  const s = world.parentStart;
  return {
    x: s.x, y: s.y, a: 0, v: 0,
    ba: 0, baVel: 0,
    roll: 0, rollVel: 0,
    wheelPhase: 0, bobT: 0,
    cargo: { kids: [], apples: 0, items: [] },
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

// The barrow holds two things. A child is one, a loose thing is one, and any
// number of apples together count as one.
const SLOTS = 2;
export const slotsUsed = (p) =>
  p.cargo.kids.length + p.cargo.items.length + (p.cargo.apples > 0 ? 1 : 0);
export const canLoadKid = (p) => slotsUsed(p) < SLOTS;
export const canLoadItem = (p) => slotsUsed(p) < SLOTS;
export const canLoadApple = (p) =>
  p.cargo.apples < 6 && (p.cargo.apples > 0 || slotsUsed(p) < SLOTS);
export const hasCargo = (p) =>
  p.cargo.kids.length > 0 || p.cargo.apples > 0 || p.cargo.items.length > 0;

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

// Put a loose thing down where the barrow is pointing, and see whether that
// happens to be where it belongs.
function dropItem(game, it, x, y, thrown) {
  const w = game.world;
  it.x = x; it.y = y;
  if (thrown) {
    it.z = 14; it.zv = 90;
    it.vx = thrown.vx; it.vy = thrown.vy;
  } else {
    it.z = 0; it.zv = 0; it.vx = 0; it.vy = 0;
    settleOnGround(it, ITEMS[it.kind].r, w);
  }
  const home = ITEMS[it.kind].home;
  const reg = w.regions[home];
  const landed = !thrown && reg && dist(it.x, it.y, reg.x, reg.y) < reg.r;
  if (landed) {
    it.state = 'settled';
    it.settledAt = home;
    if (it.kind === 'sheet') {          // pegged back up, so it leaves the ground
      const i = w.items.indexOf(it);
      if (i >= 0) w.items.splice(i, 1);
      w.pegged = Math.min(w.washing.slots, w.pegged + 1);
    } else if (it.kind === 'duck') {
      it.x = w.pond.x + rand(-60, 60);
      it.y = w.pond.y + rand(-40, 40);
    } else if (it.kind === 'gnome') {
      it.x = 596; it.y = 554;
    }
    game.events.emit('item-home', { item: it, kind: it.kind });
  } else {
    it.state = 'loose';
    it.settledAt = null;
  }
  game.events.emit('item-down', { item: it, kind: it.kind, home: landed });
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
  // loose things roll out in front of the wheel
  for (const it of p.cargo.items.splice(0)) {
    dropItem(game, it,
      wp.x + Math.cos(p.ba) * 18 + rand(-8, 8),
      wp.y + Math.sin(p.ba) * 18 + rand(-6, 6), null);
  }
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
    } else if (dist(kid.x, kid.y, w.regions.swing.x, w.regions.swing.y) < w.regions.swing.r) {
      spot = 'swing';                       // put down by the tree: straight on the swing
      kid.state = 'settled';
      kid.settledAt = 'swing';
      kid.x = w.regions.swing.x; kid.y = w.regions.swing.y;
    } else if (dist(kid.x, kid.y, w.regions.bench.x, w.regions.bench.y) < w.regions.bench.r) {
      spot = 'bench';
      kid.state = 'settled';
      kid.settledAt = 'bench';
      kid.x = w.bench.x + (kid.name === 'Poppy' ? -13 : 13);
      kid.y = w.bench.y - 16;
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
  let b = barrowCenter(p);
  const probe = { x: b.x, y: b.y };
  const hit = resolveCircle(probe, 13, w.solids);
  if (hit) {
    p.x += probe.x - b.x;
    p.y += probe.y - b.y;
    b = barrowCenter(p);   // everything below wants where the barrow ended up
    if (p.v > 60) {
      p.rollVel += rand(-1, 1) * p.v * 0.01;
      game.events.emit('clunk', { v: p.v });
    }
    p.v *= 1 - expDamp(24, dt);
  }

  // surface under the wheel
  const wp = wheelPoint(p);
  p.surface = surfaceAt(w.surfaces, wp.x, wp.y);
  if (p.surface.type === 'gravel') p.rollVel += rand(-1, 1) * GRAVEL_JIT * (p.v / vMax) * Math.sqrt(dt);

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

  // barging through the washing line brings a sheet down
  const wl = w.washing;
  if (w.pegged > 0 && p.v > 45 && Math.abs(wp.y - wl.y) < 26 && wp.x > wl.x1 && wp.x < wl.x2) {
    if (!p.throughLine) {
      p.throughLine = true;
      w.pegged--;
      w.items.push(makeItem('sheet', wp.x + rand(-20, 20), wl.y + rand(30, 60)));
      game.events.emit('washing-down', { x: wp.x, y: wl.y });
    }
  } else if (Math.abs(wp.y - wl.y) > 40) {
    p.throughLine = false;
  }

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
      for (const it of p.cargo.items.splice(0)) {
        const px = -Math.sin(p.ba) * side, py = Math.cos(p.ba) * side;
        dropItem(game, it, b.x + px * 10, b.y + py * 10,
          { vx: px * rand(50, 90) + Math.cos(p.a) * p.v * 0.3, vy: py * rand(50, 90) + Math.sin(p.a) * p.v * 0.3 });
      }
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
  const inReach = (o) => dist(b.x, b.y, o.x, o.y) < 56 || dist(p.x, p.y, o.x, o.y) < 46;
  let candidate = null, candidateItem = null;
  if (canLoadKid(p)) {
    for (const kid of game.children) {
      if (kid.state === 'carried') continue;
      if (kid.state === 'spilled' && kid.z > 0) continue;
      // don't scoop a child back up off the picnic blanket while delivering the
      // other one: with cargo aboard the action key means "tip out"
      if (kid.state === 'settled' && p.cargo.kids.length > 0) continue;
      if (inReach(kid)) { candidate = kid; break; }
    }
  }
  if (!candidate && canLoadItem(p)) {
    for (const it of w.items) {
      if (it.state === 'carried' || it.z > 0) continue;
      // likewise, don't pick a settled thing back up mid-delivery
      if (it.state === 'settled' && hasCargo(p)) continue;
      if (inReach(it)) { candidateItem = it; break; }
    }
  }
  const atCrate = dist(b.x, b.y, w.regions.crate.x, w.regions.crate.y) < w.regions.crate.r;
  // the greenhouse door: the barrow stays outside
  const atDoor = dist(p.x, p.y, w.ghDoor.x, w.ghDoor.y) < 54;
  if (atDoor && !candidate) {
    game.prompt = { text: 'go into the greenhouse', icon: 'door' };
    if (snap.action && p.tipT <= 0) game.events.emit('greenhouse-enter', {});
    return;
  }
  if (candidate) game.prompt = { text: `pick up ${candidate.name}`, icon: 'load' };
  else if (candidateItem) game.prompt = { text: `pick up ${ITEMS[candidateItem.kind].the}`, icon: 'load' };
  else if (p.cargo.apples > 0 && atCrate) game.prompt = { text: 'tip the apples in', icon: 'pour' };
  else if (hasCargo(p)) game.prompt = { text: 'tip it all out', icon: 'tip' };
  else game.prompt = null;

  if (snap.action && p.tipT <= 0) {
    if (candidate) {
      candidate.state = 'carried';
      candidate.seat = p.cargo.kids.length;
      candidate.settledAt = null;
      p.cargo.kids.push(candidate);
      game.events.emit('load', { kid: candidate });
    } else if (candidateItem) {
      candidateItem.state = 'carried';
      candidateItem.settledAt = null;
      p.cargo.items.push(candidateItem);
      if (candidateItem.kind === 'gnome') game.events.emit('gnome-lifted', {});
      game.events.emit('item-load', { item: candidateItem, kind: candidateItem.kind });
    } else if (hasCargo(p)) {
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

  // whatever else is riding along, drawn upright rather than in the tub's plane
  p.cargo.items.forEach((it, i) => {
    const s = seatPoint(p, p.cargo.kids.length + i);
    drawCarriedItem(ctx, it, s.x - p.roll * 8, s.y + ITEMS[it.kind].carry, game.time);
  });

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
