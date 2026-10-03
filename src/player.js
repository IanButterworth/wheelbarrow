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

// The barrow is modelled in its own frame and projected into the same
// three-quarter view as everything else: u runs forward from the hands, v to
// the left of travel, z up from the ground. Depth is squashed like the lawn.
const SQUASH = 0.72;
const WHEEL_R = 9, FLOOR_Z = 12;
const RIM = [[11, -13], [30, -16.5], [47, -13.5], [55, 0], [47, 13.5], [30, 16.5], [11, 13], [8, 0]];
const FLOOR = [[17, -8], [38, -8.5], [44, 0], [38, 8.5], [17, 8], [15, 0]];
const rimZ = (u) => 25 - (u - 10) * 0.04;

function barrowView(p, h, shakeX) {
  const ca = Math.cos(p.ba), sa = Math.sin(p.ba);
  const roll = p.roll * 0.45;
  const cr = Math.cos(roll), sr = Math.sin(roll);
  // tipping out pivots the whole barrow forward about the axle
  const tip = p.tipT > 0 ? (0.4 - p.tipT) * 1.2 : 0;
  const cq = Math.cos(tip), sq = Math.sin(tip);
  const proj = (u, v, z) => {
    const v1 = v * cr - z * sr, z1 = v * sr + z * cr;
    const du = u - WHEEL_AHEAD, dz = z1 - WHEEL_R;
    const u2 = WHEEL_AHEAD + du * cq + dz * sq;
    const z2 = WHEEL_R + dz * cq - du * sq;
    return [h.x + shakeX + u2 * ca - v1 * sa, h.y + (u2 * sa + v1 * ca) * SQUASH - z2];
  };
  return { proj, ca, sa };
}

function hull(pts) {
  const ps = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const q of ps) {
    while (lo.length > 1 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  for (let i = ps.length - 1; i >= 0; i--) {
    const q = ps[i];
    while (hi.length > 1 && cross(hi[hi.length - 2], hi[hi.length - 1], q) <= 0) hi.pop();
    hi.push(q);
  }
  return lo.slice(0, -1).concat(hi.slice(0, -1));
}

function polyPath(ctx, pts) {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

function line3(ctx, proj, a, b) {
  const [x0, y0] = proj(...a), [x1, y1] = proj(...b);
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
}

function drawWheel(ctx, proj, phase, near) {
  const ring = (v, r) => {
    const pts = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU;
      pts.push(proj(WHEEL_AHEAD + Math.cos(a) * r, v, WHEEL_R + Math.sin(a) * r));
    }
    return pts;
  };
  ctx.fillStyle = C.wheel;
  ctx.beginPath();
  polyPath(ctx, hull(ring(-2.6, WHEEL_R).concat(ring(2.6, WHEEL_R))));
  ctx.fill();
  // the hub face that looks towards us, with spokes that turn as it rolls
  const face = 2.7 * near;
  ctx.fillStyle = C.wheelHub;
  ctx.beginPath();
  polyPath(ctx, ring(face, WHEEL_R - 2.6));
  ctx.fill();
  ctx.strokeStyle = C.wheel;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  for (let k = 0; k < 3; k++) {
    const a = -phase * TAU + (k / 3) * Math.PI;
    const r = WHEEL_R - 2.8;
    line3(ctx, proj, [WHEEL_AHEAD + Math.cos(a) * r, face, WHEEL_R + Math.sin(a) * r],
      [WHEEL_AHEAD - Math.cos(a) * r, face, WHEEL_R - Math.sin(a) * r]);
  }
  ctx.stroke();
  const [cx, cy] = proj(WHEEL_AHEAD, face, WHEEL_R);
  ctx.fillStyle = C.wheel;
  ctx.beginPath();
  ctx.arc(cx, cy, 1.6, 0, TAU);
  ctx.fill();
}

export function drawBarrow(ctx, game) {
  const p = game.player;
  const h = handsPoint(p);
  const b = barrowCenter(p);
  S.shadow(ctx, b.x + Math.cos(p.ba) * 4, b.y + Math.sin(p.ba) * 3 + 2, 30, 11);

  const warning = Math.abs(p.roll) > ROLL_LIMIT * 0.6;
  const shakeX = warning ? rand(-1.2, 1.2) : 0;
  const { proj, ca, sa } = barrowView(p, h, shakeX);
  // which side of the barrow faces the camera
  const near = ca >= 0 ? 1 : -1;
  const wheelInFront = sa > 0.2;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // legs, then the handle rails running from the grips to the axle
  ctx.strokeStyle = C.woodDark;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  for (const side of [-1, 1]) line3(ctx, proj, [19, 9.5 * side, 14], [22, 11.5 * side, 0]);
  ctx.stroke();
  ctx.strokeStyle = C.wood;
  ctx.lineWidth = 3.4;
  ctx.beginPath();
  for (const side of [-1, 1]) line3(ctx, proj, [-3, 10 * side, 15], [WHEEL_AHEAD, 3.6 * side, WHEEL_R]);
  ctx.stroke();
  // grips
  ctx.strokeStyle = C.woodDark;
  ctx.lineWidth = 4.2;
  ctx.beginPath();
  for (const side of [-1, 1]) line3(ctx, proj, [-4, 10.2 * side, 15.2], [3, 9.2 * side, 14.4]);
  ctx.stroke();

  if (!wheelInFront) drawWheel(ctx, proj, p.wheelPhase, near);

  // the tub: outer shell, then the inside seen over the rolled rim
  const rim = RIM.map(([u, v]) => proj(u, v, rimZ(u)));
  const floor = FLOOR.map(([u, v]) => proj(u, v, FLOOR_Z));
  const shell = hull(rim.concat(floor));
  ctx.fillStyle = C.barrowDark;
  ctx.beginPath();
  polyPath(ctx, shell);
  ctx.fill();
  ctx.save();
  S.blobPath(ctx, rim);
  ctx.clip();
  ctx.fillStyle = C.barrowInside;
  ctx.fill();
  ctx.fillStyle = C.barrowFloor;
  S.blobPath(ctx, floor);
  ctx.fill();
  // apples heap on the floor
  for (let i = 0; i < p.cargo.apples; i++) {
    const [ax, ay] = proj(22 + (i % 3) * 8, -5 + Math.floor(i / 3) * 9 + (i % 2) * 2, FLOOR_Z + 3);
    ctx.fillStyle = C.apple;
    ctx.beginPath();
    ctx.arc(ax, ay, 4.6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 240, 220, 0.45)';
    ctx.beginPath();
    ctx.arc(ax - 1.5, ay - 1.6, 1.4, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = C.barrowRim;
  ctx.lineWidth = 2;
  S.blobPath(ctx, rim);
  ctx.stroke();

  // passengers sit down in the tub, so they go in before the near wall
  const seat = (i) => proj(22 + i * 15, -p.roll * 6, FLOOR_Z);
  p.cargo.items.forEach((it, i) => {
    const [sx, sy] = seat(p.cargo.kids.length + i);
    drawCarriedItem(ctx, it, sx, sy + ITEMS[it.kind].carry + 6, game.time);
  });
  for (const kid of p.cargo.kids) {
    const [sx, sy] = seat(kid.seat);
    const bounce = Math.abs(Math.sin(p.wheelPhase * TAU * 2)) * (p.v / (WALK * TROT_MUL)) * 3.5;
    const fast = p.v > WALK * 1.25;
    drawSeatedKid(ctx, kid, sx, sy - 3 - bounce, fast);
  }

  // the near wall and the near half of the rim go over anyone sitting inside
  ctx.save();
  const midY = rim.reduce((t, q) => t + q[1], 0) / rim.length;
  ctx.beginPath();
  ctx.rect(-1e4, midY, 2e4, 1e4);
  ctx.clip();
  ctx.fillStyle = C.barrowDark;
  ctx.beginPath();
  polyPath(ctx, shell);
  S.blobPath(ctx, rim, false);
  ctx.fill('evenodd');
  ctx.fillStyle = C.barrow;
  ctx.beginPath();
  polyPath(ctx, hull(rim.concat(rim.map(([x, y]) => [x, y + 5]))));
  S.blobPath(ctx, rim, false);
  ctx.fill('evenodd');
  ctx.strokeStyle = C.barrowRim;
  ctx.lineWidth = 2;
  S.blobPath(ctx, rim);
  ctx.stroke();
  ctx.restore();

  if (wheelInFront) drawWheel(ctx, proj, p.wheelPhase, near);
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
