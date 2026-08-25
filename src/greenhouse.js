import { TAU, clamp, dist, rand, expDamp } from './utils.js';
import { C } from './palette.js';
import * as S from './sprites.js';

// A scene of its own: no barrow, no garden. You potter about the greenhouse
// floor turning irrigation pipes until the tap reaches the thirsty seedlings.

export const ROOM_W = 600, ROOM_H = 430;
const COLS = 5, ROWS = 4, TILE = 62;
const GX = (ROOM_W - COLS * TILE) / 2;      // grid origin
const GY = 104;

const DIRS = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
const ORDER = ['N', 'E', 'S', 'W'];
// base orientations, before rotation
const SHAPES = { straight: ['N', 'S'], elbow: ['N', 'E'], tee: ['N', 'E', 'S'] };

const rot = (d, r) => ORDER[(ORDER.indexOf(d) + r) % 4];

export function connsOf(t) {
  if (!t) return [];
  if (t.type === 'sink') return [t.inlet];
  const base = SHAPES[t.type];
  if (!base) return [];
  return base.map((d) => rot(d, t.rot));
}

// The solved layout is authored, then scrambled, so the puzzle is always
// solvable and always starts wrong.
function buildGrid() {
  const grid = [];
  for (let y = 0; y < ROWS; y++) grid.push(new Array(COLS).fill(null));
  const put = (x, y, type, rotation) => { grid[y][x] = { type, rot: rotation, solved: rotation, x, y }; };

  // tap feeds (0,1) from the west; the run crosses the room and branches down
  put(0, 1, 'straight', 1);   // W-E
  put(1, 1, 'straight', 1);
  put(2, 1, 'tee', 1);        // W-E-S: base N,E,S turned once is E,S,W
  put(3, 1, 'straight', 1);
  put(4, 1, 'elbow', 3);      // W-N
  put(2, 2, 'straight', 0);   // N-S
  put(2, 3, 'elbow', 0);      // N-E
  put(3, 3, 'straight', 1);   // W-E

  grid[0][4] = { type: 'sink', inlet: 'S', x: 4, y: 0, watered: false };
  grid[3][4] = { type: 'sink', inlet: 'W', x: 4, y: 3, watered: false };

  // scramble; make sure at least one pipe is out of place
  let anyWrong = false;
  for (const row of grid) for (const t of row) {
    if (!t || t.type === 'sink') continue;
    const turns = Math.floor(rand(0, 4));
    t.rot = (t.rot + turns) % 4;
    if (t.rot !== t.solved) anyWrong = true;
  }
  if (!anyWrong) {
    const first = grid[1][0];
    first.rot = (first.rot + 1) % 4;
  }
  return grid;
}

export function makeGreenhouse() {
  return {
    grid: buildGrid(),
    source: { x: 0, y: 1, from: 'W' },
    wet: new Set(),
    solved: false,
    solvedT: 0,
    // the parent, on foot
    px: ROOM_W / 2, py: ROOM_H - 54, pa: -Math.PI / 2, pv: 0, bobT: 0,
    fade: 1,          // 1 = fully dark, eases to 0 on entry
    leaving: 0,
    turnFlash: null,
    flow: 0,
  };
}

export const tileCentre = (x, y) => ({ cx: GX + x * TILE + TILE / 2, cy: GY + y * TILE + TILE / 2 });

const key = (x, y) => `${x},${y}`;

export function computeFlow(gh) {
  const at = (x, y) => (gh.grid[y] ? gh.grid[y][x] : null);
  const wet = new Set();
  const first = at(gh.source.x, gh.source.y);
  if (!first || !connsOf(first).includes(gh.source.from)) { gh.wet = wet; return wet; }
  const stack = [[gh.source.x, gh.source.y]];
  wet.add(key(gh.source.x, gh.source.y));
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const d of connsOf(at(x, y))) {
      const [dx, dy] = DIRS[d];
      const nx = x + dx, ny = y + dy;
      const n = at(nx, ny);
      if (!n || wet.has(key(nx, ny))) continue;
      if (!connsOf(n).includes(OPP[d])) continue;
      wet.add(key(nx, ny));
      stack.push([nx, ny]);
    }
  }
  gh.wet = wet;
  return wet;
}

export const sinks = (gh) => gh.grid.flat().filter((t) => t && t.type === 'sink');

// Benches down each side, and the doorway, are the only things in your way.
const WALLS = [
  { x: 0, y: 0, w: ROOM_W, h: 34 },
  { x: 0, y: 0, w: 30, h: ROOM_H },
  { x: ROOM_W - 30, y: 0, w: 30, h: ROOM_H },
  { x: 0, y: ROOM_H - 26, w: ROOM_W, h: 26 },
];

export function updateGreenhouse(game, dt) {
  const gh = game.gh;
  const snap = game.input.snap;
  gh.fade = Math.max(0, gh.fade - dt * 2.4);
  gh.flow += dt;
  if (gh.turnFlash) gh.turnFlash.t -= dt;
  if (gh.solved) gh.solvedT += dt;

  // walking, quicker and nimbler than pushing a barrow
  const SPD = 132;
  if (snap.mag > 0) {
    gh.pa = Math.atan2(snap.my, snap.mx);
    gh.pv += clamp(snap.mag * SPD - gh.pv, -900 * dt, 700 * dt);
  } else {
    gh.pv += clamp(-gh.pv, -900 * dt, 0);
  }
  gh.px += Math.cos(gh.pa) * gh.pv * dt;
  gh.py += Math.sin(gh.pa) * gh.pv * dt;
  gh.bobT += dt * (0.4 + gh.pv / 90);

  // keep out of the walls, but leave the doorway open
  const doorX = ROOM_W / 2;
  for (const wl of WALLS) {
    const insideDoor = wl.y > ROOM_H - 40 && Math.abs(gh.px - doorX) < 44;
    if (insideDoor) continue;
    const cx = clamp(gh.px, wl.x, wl.x + wl.w);
    const cy = clamp(gh.py, wl.y, wl.y + wl.h);
    const dx = gh.px - cx, dy = gh.py - cy;
    const d = Math.hypot(dx, dy);
    if (d < 11) {
      if (d > 0.001) { gh.px += (dx / d) * (11 - d); gh.py += (dy / d) * (11 - d); }
      else gh.py = wl.y - 11;
    }
  }
  gh.py = clamp(gh.py, 40, ROOM_H + 34);

  // what is under the parent's hands: a pipe to turn, or the way out
  let near = null;
  for (const row of gh.grid) {
    for (const t of row) {
      if (!t || t.type === 'sink') continue;
      const { cx, cy } = tileCentre(t.x, t.y);
      if (dist(gh.px, gh.py, cx, cy) < 46) {
        if (!near || dist(gh.px, gh.py, cx, cy) < near.d) near = { t, d: dist(gh.px, gh.py, cx, cy) };
      }
    }
  }
  const atDoor = gh.py > ROOM_H - 46 && Math.abs(gh.px - doorX) < 52;
  game.prompt = near ? { text: 'turn the pipe', icon: 'turn' }
    : atDoor ? { text: 'back out to the garden', icon: 'door' } : null;

  if (snap.action) {
    if (near) {
      near.t.rot = (near.t.rot + 1) % 4;
      gh.turnFlash = { x: near.t.x, y: near.t.y, t: 0.35 };
      computeFlow(gh);
      game.events.emit('pipe-turn', {});
      const done = sinks(gh).every((s) => gh.wet.has(key(s.x, s.y)));
      for (const s of sinks(gh)) s.watered = gh.wet.has(key(s.x, s.y));
      if (done && !gh.solved) {
        gh.solved = true;
        gh.solvedT = 0;
        game.events.emit('greenhouse-solved', {});
      }
    } else if (atDoor) {
      game.events.emit('greenhouse-leave', {});
    }
  }
}

// ---------------------------------------------------------------------------

function pipeAt(ctx, t, cx, cy, wet, phase) {
  const ds = connsOf(t);
  const R = 13;
  // the pipe body
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#8d8377';
  ctx.lineWidth = R * 2;
  ctx.beginPath();
  for (const d of ds) {
    const [dx, dy] = DIRS[d];
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + dx * TILE / 2, cy + dy * TILE / 2);
  }
  ctx.stroke();
  ctx.strokeStyle = '#a89d8e';
  ctx.lineWidth = R * 2 - 6;
  ctx.stroke();
  // water
  if (wet) {
    ctx.strokeStyle = C.pond;
    ctx.lineWidth = R - 2;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 3;
    ctx.setLineDash([7, 11]);
    ctx.lineDashOffset = -phase * 26;
    ctx.stroke();
    ctx.setLineDash([]);
  }
  // collar in the middle so joints read cleanly
  ctx.fillStyle = wet ? C.pondDeep : '#7d7367';
  ctx.beginPath();
  ctx.arc(cx, cy, R - 3, 0, TAU);
  ctx.fill();
}

function thirstyPlant(ctx, cx, cy, watered, t) {
  ctx.fillStyle = C.terracottaDark;
  ctx.beginPath();
  ctx.moveTo(cx - 15, cy - 4); ctx.lineTo(cx + 15, cy - 4);
  ctx.lineTo(cx + 11, cy + 16); ctx.lineTo(cx - 11, cy + 16);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = C.terracotta;
  ctx.beginPath(); ctx.roundRect(cx - 16, cy - 9, 32, 8, 2); ctx.fill();
  const perk = watered ? 1 : 0;
  const sway = Math.sin(t * 1.6 + cx) * (watered ? 2.5 : 0.6);
  ctx.strokeStyle = watered ? C.leaf : '#9aa877';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - 8);
    if (watered) ctx.quadraticCurveTo(cx + side * 10, cy - 26, cx + side * 14 + sway, cy - 38);
    else ctx.quadraticCurveTo(cx + side * 12, cy - 14, cx + side * 19, cy - 6);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx, cy - 8);
  ctx.lineTo(cx + sway * 0.5, cy - 8 - (watered ? 44 : 18));
  ctx.stroke();
  if (watered) {
    for (const [fx, fy] of [[-14, -38], [14, -38], [0, -52]]) {
      ctx.fillStyle = fy < -48 ? C.flower3 : C.flower2;
      ctx.beginPath();
      ctx.arc(cx + fx + sway * 0.6, cy + fy, 5, 0, TAU);
      ctx.fill();
    }
  } else {
    ctx.fillStyle = 'rgba(150,130,90,0.9)';
    ctx.beginPath();
    ctx.arc(cx + 2, cy - 24, 3.4, 0, TAU);
    ctx.fill();
  }
}

export function drawGreenhouse(ctx, game, w, h) {
  const gh = game.gh;
  const t = game.time;
  const s = Math.min(w / (ROOM_W + 90), h / (ROOM_H + 130));
  ctx.setTransform(game.dpr, 0, 0, game.dpr, 0, 0);
  ctx.fillStyle = '#c3d9c0';
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(s, s);
  ctx.translate(-ROOM_W / 2, -ROOM_H / 2 - 14);

  // floor
  ctx.fillStyle = '#d8d2c2';
  ctx.fillRect(0, 0, ROOM_W, ROOM_H);
  ctx.fillStyle = '#cfc8b6';
  for (let y = 0; y < ROOM_H; y += 40) {
    for (let x = ((y / 40) % 2) * 20; x < ROOM_W; x += 40) ctx.fillRect(x, y, 20, 20);
  }
  // sunlight from the glass roof
  const sun = ctx.createLinearGradient(0, 0, ROOM_W * 0.7, ROOM_H);
  sun.addColorStop(0, 'rgba(255,244,200,0.4)');
  sun.addColorStop(1, 'rgba(255,244,200,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(0, 0, ROOM_W, ROOM_H);

  // glazed walls
  ctx.fillStyle = 'rgba(196, 224, 228, 0.85)';
  ctx.fillRect(0, 0, ROOM_W, 34);
  ctx.fillRect(0, 0, 30, ROOM_H);
  ctx.fillRect(ROOM_W - 30, 0, 30, ROOM_H);
  ctx.fillStyle = 'rgba(196, 224, 228, 0.85)';
  ctx.fillRect(0, ROOM_H - 26, ROOM_W / 2 - 44, 26);
  ctx.fillRect(ROOM_W / 2 + 44, ROOM_H - 26, ROOM_W / 2 - 44, 26);
  ctx.strokeStyle = C.greenhouseFrame;
  ctx.lineWidth = 5;
  ctx.strokeRect(2.5, 2.5, ROOM_W - 5, ROOM_H - 5);
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let x = 60; x < ROOM_W; x += 60) { ctx.moveTo(x, 0); ctx.lineTo(x, 34); }
  for (let y = 60; y < ROOM_H - 30; y += 60) {
    ctx.moveTo(0, y); ctx.lineTo(30, y);
    ctx.moveTo(ROOM_W - 30, y); ctx.lineTo(ROOM_W, y);
  }
  ctx.stroke();
  // doorway
  ctx.fillStyle = '#b9d6b4';
  ctx.fillRect(ROOM_W / 2 - 44, ROOM_H - 26, 88, 26);
  ctx.strokeStyle = C.greenhouseFrame;
  ctx.lineWidth = 4;
  ctx.strokeRect(ROOM_W / 2 - 44, ROOM_H - 26, 88, 26);

  // the tap, feeding the grid from the west wall
  const src = tileCentre(gh.source.x, gh.source.y);
  ctx.strokeStyle = '#8d8377';
  ctx.lineWidth = 22;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(30, src.cy); ctx.lineTo(src.cx - TILE / 2, src.cy);
  ctx.stroke();
  ctx.strokeStyle = '#a89d8e';
  ctx.lineWidth = 16;
  ctx.stroke();
  ctx.strokeStyle = C.pond;
  ctx.lineWidth = 9;
  ctx.stroke();
  ctx.fillStyle = '#6f7a7e';
  ctx.beginPath(); ctx.roundRect(18, src.cy - 20, 20, 40, 5); ctx.fill();
  ctx.fillStyle = C.flower1;
  ctx.beginPath(); ctx.arc(28, src.cy - 24, 9, 0, TAU); ctx.fill();

  // benches along the back, with pots
  ctx.fillStyle = C.bench;
  ctx.fillRect(44, 44, ROOM_W - 88, 22);
  ctx.fillStyle = C.benchDark;
  ctx.fillRect(44, 62, ROOM_W - 88, 6);
  for (let i = 0; i < 7; i++) {
    const px = 70 + i * ((ROOM_W - 140) / 6);
    S.drawPot(ctx, px, 50, 0.5, [C.flower1, C.flower3, C.flower2][i % 3]);
  }

  // pipes
  for (const row of gh.grid) {
    for (const tile of row) {
      if (!tile) continue;
      const { cx, cy } = tileCentre(tile.x, tile.y);
      if (tile.type === 'sink') continue;
      pipeAt(ctx, tile, cx, cy, gh.wet.has(key(tile.x, tile.y)), gh.flow);
    }
  }
  // plants sit on top of their inlet stub
  for (const sk of sinks(gh)) {
    const { cx, cy } = tileCentre(sk.x, sk.y);
    const [dx, dy] = DIRS[sk.inlet];
    ctx.strokeStyle = '#a89d8e';
    ctx.lineWidth = 18;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + dx * TILE / 2, cy + dy * TILE / 2);
    ctx.stroke();
    if (sk.watered) {
      ctx.strokeStyle = C.pond;
      ctx.lineWidth = 9;
      ctx.stroke();
    }
    thirstyPlant(ctx, cx, cy, sk.watered, t);
  }

  // a nudge on the pipe you just turned
  if (gh.turnFlash && gh.turnFlash.t > 0) {
    const { cx, cy } = tileCentre(gh.turnFlash.x, gh.turnFlash.y);
    ctx.strokeStyle = `rgba(255,255,255,${gh.turnFlash.t * 1.6})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, 26 + (0.35 - gh.turnFlash.t) * 40, 0, TAU);
    ctx.stroke();
  }

  // the parent, on foot and empty-handed
  S.drawParent(ctx, { x: gh.px, y: gh.py, v: gh.pv, a: gh.pa, bobT: gh.bobT },
    gh.px, gh.py, true);

  ctx.restore();

  // caption, clear of the action prompt along the bottom
  ctx.fillStyle = 'rgba(74,67,54,0.75)';
  ctx.font = `15px ${S.FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(gh.solved ? 'That is better. They were parched.' : 'The seedlings want watering.', w / 2, 42);
  ctx.textAlign = 'left';

  const fade = Math.max(gh.fade, gh.leaving);
  if (fade > 0.001) {
    ctx.fillStyle = `rgba(24, 34, 20, ${clamp(fade, 0, 1)})`;
    ctx.fillRect(0, 0, w, h);
  }
}
