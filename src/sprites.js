import { C } from './palette.js';
import { TAU, clamp, lerp } from './utils.js';

export const FONT = '"Segoe Print", "Comic Sans MS", "Chalkboard SE", cursive';

// stable pseudo-random from an integer, so scenery never jitters between frames
export function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

export function shadow(ctx, x, y, rx, ry = rx * 0.38) {
  ctx.fillStyle = C.shadow;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, TAU);
  ctx.fill();
}

// Smooth closed curve through points: the classic midpoint-quadratic trick.
// Everything organic in the garden (beds, pond, mud) is drawn with this.
export function blobPath(ctx, pts) {
  const n = pts.length;
  ctx.beginPath();
  let [px, py] = pts[n - 1];
  ctx.moveTo((px + pts[0][0]) / 2, (py + pts[0][1]) / 2);
  for (let i = 0; i < n; i++) {
    const [cx, cy] = pts[i];
    const [nx, ny] = pts[(i + 1) % n];
    ctx.quadraticCurveTo(cx, cy, (cx + nx) / 2, (cy + ny) / 2);
  }
  ctx.closePath();
}

// wobbly ring of points around a centre, deterministic per seed
export function ring(cx, cy, rx, ry, n, seed, amp = 0.18) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const w = 1 + (hash(seed + i) - 0.5) * 2 * amp;
    pts.push([cx + Math.cos(a) * rx * w, cy + Math.sin(a) * ry * w]);
  }
  return pts;
}

export function fillBlob(ctx, pts, fill) {
  ctx.fillStyle = fill;
  blobPath(ctx, pts);
  ctx.fill();
}

// expand a ring outward from its centre
export function grow(pts, cx, cy, px, py = px) {
  return pts.map(([x, y]) => {
    const dx = x - cx, dy = y - cy;
    const d = Math.hypot(dx, dy) || 1;
    return [x + (dx / d) * px, y + (dy / d) * py];
  });
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function circle(ctx, x, y, r, fill) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function ellipse(ctx, x, y, rx, ry, fill, rot = 0) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
  ctx.fill();
}

function smile(ctx, x, y, r, ink = C.ink) {
  ctx.strokeStyle = ink;
  ctx.lineWidth = 1.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, r, 0.25, Math.PI - 0.25);
  ctx.stroke();
}

function eyes(ctx, x, y, gap, ink = C.ink) {
  circle(ctx, x - gap, y, 1.3, ink);
  circle(ctx, x + gap, y, 1.3, ink);
}

// Small person, feet at (x, y). flip = facing left. pose: 'walk' | 'idle' | 'sit'
function legs(ctx, x, y, phase, spread, color, moving) {
  const step = moving ? Math.sin(phase) * 5 : 0;
  ctx.fillStyle = color;
  ellipse(ctx, x - spread, y - 2 + Math.max(0, -step) * -0.3, 3, 4.5, color);
  ellipse(ctx, x + spread, y - 2 + Math.max(0, step) * -0.3, 3, 4.5, color);
}

export function drawParent(ctx, p, hx, hy) {
  const { x, y } = p;
  const moving = p.v > 8;
  const bob = moving ? Math.abs(Math.sin(p.bobT * 9)) * 2.4 : 0;
  const flip = Math.cos(p.a) < 0 ? -1 : 1;
  if (p.sitting) {
    shadow(ctx, x, y + 1, 15, 6);
    ellipse(ctx, x - 7, y - 3, 4, 5, C.parentTrousers);
    ellipse(ctx, x + 7, y - 3, 4, 5, C.parentTrousers);
    const by = y - 13;
    ellipse(ctx, x, by, 11, 12, C.parentShirt);
    const hy2 = by - 16;
    circle(ctx, x, hy2, 8.5, C.parentSkin);
    eyes(ctx, x, hy2 - 1, 2.8);
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.arc(x, hy2 + 1.5, 3, 0, Math.PI);
    ctx.fill();
    ellipse(ctx, x, hy2 - 5.5, 12, 4, C.parentHat);
    ctx.fillStyle = C.parentHat;
    ctx.beginPath();
    ctx.arc(x, hy2 - 5.5, 6.5, Math.PI, 0);
    ctx.fill();
    return;
  }
  shadow(ctx, x, y + 1, 13);
  legs(ctx, x, y, p.bobT * 9, 5.5, C.parentTrousers, moving);
  const by = y - 20 - bob;
  // arms reaching to the barrow handles
  ctx.strokeStyle = C.parentShirt;
  ctx.lineWidth = 4.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - 7 * flip, by + 2);
  ctx.lineTo(hx - 3 * flip, hy - 14);
  ctx.moveTo(x + 2 * flip, by + 2);
  ctx.lineTo(hx + 3 * flip, hy - 14);
  ctx.stroke();
  ellipse(ctx, x, by, 11, 13.5, C.parentShirt);
  // head + sunhat
  const heady = by - 17;
  circle(ctx, x, heady, 8.5, C.parentSkin);
  eyes(ctx, x + 2.5 * flip, heady - 1, 2.6);
  smile(ctx, x + 2.5 * flip, heady + 1, 3);
  ellipse(ctx, x, heady - 5.5, 12, 4, C.parentHat);
  ctx.fillStyle = C.parentHat;
  ctx.beginPath();
  ctx.arc(x, heady - 5.5, 6.5, Math.PI, 0);
  ctx.fill();
}

// Child, feet at (c.x, c.y). Uses c.colors {skin, top, bottom, hair}, c.walkT, c.state
export function drawChild(ctx, c, t) {
  const { x, y } = c;
  const col = c.colors;
  const sitting = c.state === 'spilled' || c.state === 'settled';
  const moving = c.state === 'wander' && c.moving;
  const bob = moving ? Math.abs(Math.sin(c.walkT * 11)) * 1.8 : 0;
  const flip = c.flip || 1;
  const z = c.z || 0;
  shadow(ctx, x, y + 1, 9 - Math.min(z * 0.08, 4));
  const gy = y - z;
  if (sitting) {
    ellipse(ctx, x - 4, gy - 2, 2.8, 3.5, col.bottom);
    ellipse(ctx, x + 4, gy - 2, 2.8, 3.5, col.bottom);
    drawChildTorso(ctx, x, gy - 8, col, flip, c.beam);
  } else {
    legs(ctx, x, gy, c.walkT * 11, 4, col.bottom, moving);
    drawChildTorso(ctx, x, gy - 14 - bob, col, flip, c.beam, c.armsUp);
  }
}

export function drawChildTorso(ctx, x, by, col, flip = 1, beam = false, armsUp = false) {
  if (armsUp) {
    ctx.strokeStyle = col.top;
    ctx.lineWidth = 3.6;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - 6, by);
    ctx.lineTo(x - 11, by - 12);
    ctx.moveTo(x + 6, by);
    ctx.lineTo(x + 11, by - 12);
    ctx.stroke();
  }
  ellipse(ctx, x, by, 8, 10, col.top);
  const heady = by - 13;
  circle(ctx, x, heady, 7, col.skin);
  // hair mop
  ctx.fillStyle = col.hair;
  ctx.beginPath();
  ctx.arc(x, heady - 2.2, 7, Math.PI * 1.05, Math.PI * 1.95);
  ctx.fill();
  ellipse(ctx, x - 4 * flip, heady - 5.5, 3.4, 2.6, col.hair);
  eyes(ctx, x + 2 * flip, heady - 0.5, 2.2);
  if (beam) {
    ctx.fillStyle = C.ink;
    ctx.beginPath();
    ctx.arc(x + 2 * flip, heady + 1.5, 2.6, 0, Math.PI);
    ctx.fill();
  } else {
    smile(ctx, x + 2 * flip, heady + 1, 2.4);
  }
}

export function drawGran(ctx, g, t) {
  const { x, y } = g;
  const kneel = g.pose === 'weed';
  shadow(ctx, x, y + 1, 12);
  if (kneel) {
    ellipse(ctx, x, y - 4, 10, 6, C.granSkirt);
    const by = y - 14;
    ellipse(ctx, x, by, 10, 11, C.granCardigan);
    const bend = Math.sin(t * 3) * 2;
    ctx.strokeStyle = C.granCardigan;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + 6, by + 2);
    ctx.lineTo(x + 14, y - 2 + bend);
    ctx.stroke();
    drawGranHead(ctx, x + 2, by - 14, 1);
  } else {
    legs(ctx, x, y, t * 7, 4.5, C.granSkirt, g.moving);
    ellipse(ctx, x, y - 12, 10, 7, C.granSkirt);
    const by = y - 22;
    ellipse(ctx, x, by, 9.5, 11, C.granCardigan);
    if (g.wave) {
      const wv = Math.sin(t * 8) * 4;
      ctx.strokeStyle = C.granCardigan;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x + 6, by);
      ctx.lineTo(x + 13, by - 12 + wv);
      ctx.stroke();
    }
    drawGranHead(ctx, x, by - 15, g.flip || 1);
  }
}

function drawGranHead(ctx, x, y, flip) {
  circle(ctx, x, y, 7.5, C.granSkin);
  eyes(ctx, x + 2 * flip, y - 0.5, 2.2);
  smile(ctx, x + 2 * flip, y + 1.5, 2.6);
  ellipse(ctx, x, y - 4.5, 10.5, 3.6, C.granHat);
  ctx.fillStyle = C.granHat;
  ctx.beginPath();
  ctx.arc(x, y - 4.5, 5.5, Math.PI, 0);
  ctx.fill();
}

export function drawDog(ctx, d, t) {
  const { x, y } = d;
  const asleep = d.state === 'sleep';
  const run = d.state === 'chase' || d.state === 'return';
  shadow(ctx, x, y + 1, asleep ? 16 : 13, asleep ? 5 : 5);
  if (asleep) {
    ellipse(ctx, x, y - 6, 16, 8, C.dog);
    ellipse(ctx, x - 13, y - 9, 7, 6.5, C.dog);
    ellipse(ctx, x - 16, y - 13, 3.5, 5, C.dogEar, -0.4);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - 16, y - 9);
    ctx.lineTo(x - 12.5, y - 9);
    ctx.stroke();
    circle(ctx, x - 18.5, y - 8, 1.6, C.ink);
    const wag = Math.sin(t * 1.5) * 2;
    ellipse(ctx, x + 15, y - 6 + wag * 0.3, 6, 2.6, C.dogDark, 0.3);
  } else {
    const bounce = run ? Math.abs(Math.sin(t * 12)) * 4 : 0;
    const flip = d.flip || 1;
    const by = y - 10 - bounce;
    ellipse(ctx, x - 6 * flip, y - 3, 2.6, 4, C.dogDark);
    ellipse(ctx, x + 6 * flip, y - 3, 2.6, 4, C.dogDark);
    ellipse(ctx, x, by, 13, 8, C.dog);
    const wag = Math.sin(t * 16) * 5;
    ellipse(ctx, x - 12 * flip, by - 4, 5.5, 2.4, C.dogDark, -0.5 * flip + wag * 0.06);
    const hx = x + 11 * flip, hy = by - 7;
    circle(ctx, hx, hy, 6.5, C.dog);
    ellipse(ctx, hx - 3 * flip, hy - 5.5, 3, 4.5, C.dogEar, -0.35 * flip);
    ellipse(ctx, hx + 3 * flip, hy - 5, 3, 4.5, C.dogEar, 0.35 * flip);
    circle(ctx, hx + 5.5 * flip, hy + 1, 1.8, C.ink);
    circle(ctx, hx + 1.5 * flip, hy - 1.5, 1.4, C.ink);
    if (d.state === 'alert') {
      ctx.fillStyle = C.ink;
      ctx.font = `bold 13px ${FONT}`;
      ctx.fillText('!', x + 16 * flip, by - 18);
    }
  }
}

export function drawTree(ctx, x, y, s, t) {
  const sway = Math.sin(t * 0.7 + x) * 2 * s;
  shadow(ctx, x, y, 34 * s, 10 * s);
  ctx.fillStyle = C.treeTrunk;
  ctx.beginPath();
  ctx.moveTo(x - 6 * s, y);
  ctx.quadraticCurveTo(x - 4 * s, y - 30 * s, x - 3 * s + sway * 0.4, y - 44 * s);
  ctx.lineTo(x + 3 * s + sway * 0.4, y - 44 * s);
  ctx.quadraticCurveTo(x + 4 * s, y - 30 * s, x + 6 * s, y);
  ctx.fill();
  ellipse(ctx, x - 20 * s + sway, y - 58 * s, 22 * s, 18 * s, C.leafDark);
  ellipse(ctx, x + 20 * s + sway, y - 60 * s, 22 * s, 18 * s, C.leafDark);
  ellipse(ctx, x + sway, y - 74 * s, 26 * s, 21 * s, C.leaf);
  circle(ctx, x - 10 * s + sway, y - 68 * s, 3 * s, C.apple);
  circle(ctx, x + 14 * s + sway, y - 78 * s, 3 * s, C.apple);
  circle(ctx, x + 4 * s + sway, y - 58 * s, 3 * s, C.apple);
}

export function drawHedge(ctx, h, t) {
  const { x, y, w, ht } = h; // footprint x..x+w at depth y, visual height ht
  const seed = h.seed || Math.round(x * 0.37 + y * 0.11);
  // billowing top edge rather than a flat bar
  ctx.fillStyle = C.hedgeDark;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - ht + 6);
  for (let bx = x; bx <= x + w; bx += 30) {
    const bump = hash(seed + bx * 0.05) * 12;
    ctx.quadraticCurveTo(bx + 15, y - ht - bump, bx + 30, y - ht + 4 + hash(seed + bx * 0.05 + 1) * 6);
  }
  ctx.lineTo(x + w, y);
  ctx.closePath();
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = C.hedge;
  ctx.fillRect(x, y - ht - 14, w, ht - 5);
  // sunlit foliage clumps
  for (let i = 0; i * 26 < w; i++) {
    const bx = x + 12 + i * 26 + hash(seed + i) * 14;
    const by = y - ht + 2 + hash(seed + i + 31) * 12;
    ellipse(ctx, bx, by, 13 + hash(seed + i + 7) * 6, 8 + hash(seed + i + 3) * 4, C.hedgeLight);
  }
  ctx.restore();
}

export function drawGreenhouse(ctx, x, y) {
  const w = 150, d = 8, ht = 95;
  shadow(ctx, x + w / 2, y + 2, w * 0.55, 12);
  ctx.fillStyle = C.greenhouse;
  ctx.strokeStyle = C.greenhouseFrame;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x, y - ht + 30);
  ctx.lineTo(x + w / 2, y - ht);
  ctx.lineTo(x + w, y - ht + 30);
  ctx.lineTo(x + w, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  for (let i = 1; i < 4; i++) {
    ctx.moveTo(x + (w * i) / 4, y);
    ctx.lineTo(x + (w * i) / 4, y - ht + 30 + (i === 2 ? -18 : 8));
  }
  ctx.moveTo(x, y - ht + 30);
  ctx.lineTo(x + w, y - ht + 30);
  ctx.stroke();
  // glazing shine
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(x + 18, y - 12);
  ctx.lineTo(x + 40, y - ht + 38);
  ctx.stroke();
}

export function drawPool(ctx, x, y, t) {
  shadow(ctx, x, y + 4, 62, 20);
  ellipse(ctx, x, y, 60, 34, C.poolRim);
  ellipse(ctx, x, y - 4, 60, 34, C.pool);
  ellipse(ctx, x, y - 4, 48, 25, C.poolWater);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    const ph = t * 1.4 + i * 2.1;
    ctx.beginPath();
    ctx.arc(x - 14 + i * 15, y - 6 + Math.sin(ph) * 3, 7, 0.3, Math.PI - 0.5);
    ctx.stroke();
  }
}

export function drawBlanket(ctx, x, y) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.06);
  ctx.fillStyle = C.blanket2;
  rr(ctx, -75, -50, 150, 100, 8);
  ctx.fill();
  ctx.fillStyle = C.blanket1;
  for (let i = 0; i < 5; i++)
    for (let j = 0; j < 3; j++)
      if ((i + j) % 2 === 0) {
        rr(ctx, -75 + i * 30, -50 + j * 34, 30, 33, 3);
        ctx.fill();
      }
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = C.bedDark;
  ctx.lineWidth = 2;
  rr(ctx, -75, -50, 150, 100, 8);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
  // picnic basket
  ctx.fillStyle = C.wood;
  rr(ctx, x + 42, y - 66, 26, 18, 4);
  ctx.fill();
  ctx.strokeStyle = C.crateDark;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x + 55, y - 66, 10, Math.PI, 0);
  ctx.stroke();
}

export function drawCrate(ctx, x, y, apples) {
  shadow(ctx, x, y + 2, 30, 9);
  ctx.fillStyle = C.crateDark;
  rr(ctx, x - 28, y - 34, 56, 34, 4);
  ctx.fill();
  ctx.fillStyle = C.crate;
  rr(ctx, x - 28, y - 34, 56, 8, 3);
  ctx.fill();
  rr(ctx, x - 28, y - 20, 56, 8, 3);
  ctx.fill();
  for (let i = 0; i < Math.min(apples, 8); i++) {
    circle(ctx, x - 18 + (i % 4) * 12, y - 36 - Math.floor(i / 4) * 8, 6, C.apple);
  }
}

export function drawKennel(ctx, x, y) {
  shadow(ctx, x, y + 2, 34, 10);
  ctx.fillStyle = C.kennel;
  rr(ctx, x - 30, y - 44, 60, 44, 5);
  ctx.fill();
  ctx.fillStyle = C.kennelDark;
  ctx.beginPath();
  ctx.moveTo(x - 36, y - 42);
  ctx.lineTo(x, y - 62);
  ctx.lineTo(x + 36, y - 42);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#4a3b2c';
  ctx.beginPath();
  ctx.arc(x, y - 18, 13, Math.PI, 0);
  ctx.rect(x - 13, y - 18, 26, 18);
  ctx.fill();
}

export function drawTable(ctx, x, y) {
  shadow(ctx, x, y + 2, 34, 11);
  ctx.fillStyle = '#c9bda6';
  rr(ctx, x - 24, y - 26, 6, 26, 2); ctx.fill();
  rr(ctx, x + 18, y - 26, 6, 26, 2); ctx.fill();
  ellipse(ctx, x, y - 30, 36, 13, C.table);
  // teapot + cups
  ellipse(ctx, x - 8, y - 40, 8, 6.5, C.pool);
  ctx.strokeStyle = C.pool;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(x + 2, y - 42, 4, -1.2, 1.2);
  ctx.stroke();
  circle(ctx, x - 8, y - 47, 2, C.pool);
  circle(ctx, x + 14, y - 36, 3.5, C.white);
  circle(ctx, x + 22, y - 33, 3.5, C.white);
}

export function drawSprinklerBase(ctx, x, y) {
  shadow(ctx, x, y + 1, 8);
  ctx.fillStyle = C.sprinkler;
  rr(ctx, x - 5, y - 12, 10, 12, 3);
  ctx.fill();
  circle(ctx, x, y - 13, 4, '#6f7a7e');
}

// Height of the nozzle above the sprinkler's foot, so the jets leave the head
// itself rather than starting adrift of it.
const SPRINKLER_NOZZLE = 14;

export function drawSprinklerWater(ctx, s, t) {
  const ang = s.angle;
  ctx.fillStyle = C.water;
  for (let i = 0; i < 20; i++) {
    const f = (i / 20 + (t * 0.9) % 1) % 1;
    const d = f * s.reach;
    const spread = 0.16;
    for (const off of [-spread, 0, spread]) {
      const a = ang + off * (0.4 + f);
      const px = s.x + Math.cos(a) * d;
      const py = s.y - SPRINKLER_NOZZLE + Math.sin(a) * d * 0.6 - Math.sin(f * Math.PI) * 26;
      ctx.beginPath();
      ctx.arc(px, py, 2.4 - f * 1, 0, TAU);
      ctx.fill();
    }
  }
}

export function drawWashing(ctx, w, t, pegged = 3) {
  const { x1, y, x2 } = w;
  ctx.fillStyle = C.treeTrunk;
  rr(ctx, x1 - 3, y - 78, 6, 78, 3); ctx.fill();
  rr(ctx, x2 - 3, y - 78, 6, 78, 3); ctx.fill();
  ctx.strokeStyle = '#8a8172';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x1, y - 74);
  ctx.quadraticCurveTo((x1 + x2) / 2, y - 68, x2, y - 74);
  ctx.stroke();
  const colors = [C.sheet1, C.sheet2, C.sheet3];
  const n = 3, span = (x2 - x1 - 60) / n;
  for (let i = 0; i < Math.min(n, pegged); i++) {
    const sx = x1 + 30 + i * span + 6;
    const sw = span - 16;
    const flap = Math.sin(t * 1.8 + i * 1.7) * 7;
    ctx.fillStyle = colors[i];
    ctx.beginPath();
    ctx.moveTo(sx, y - 72);
    ctx.lineTo(sx + sw, y - 71);
    ctx.quadraticCurveTo(sx + sw + flap, y - 30, sx + sw * 0.8 + flap, y - 16);
    ctx.quadraticCurveTo(sx + sw * 0.4, y - 24 + flap * 0.5, sx + flap * 0.6, y - 18);
    ctx.closePath();
    ctx.fill();
  }
}

export function drawMolehill(ctx, x, y) {
  ellipse(ctx, x, y, 13, 7, C.bed);
  ellipse(ctx, x, y - 2, 9, 5, C.mud);
}

export function drawApple(ctx, a, t) {
  shadow(ctx, a.x, a.y + 1, 5.5);
  circle(ctx, a.x, a.y - 4, 5.5, C.apple);
  ctx.strokeStyle = C.treeTrunk;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y - 9);
  ctx.lineTo(a.x + 1.5, a.y - 12);
  ctx.stroke();
  ellipse(ctx, a.x + 3.5, a.y - 11, 3, 1.6, C.appleLeaf, -0.5);
}

// A sheet blown off the line, crumpled on the grass.
export function drawSheet(ctx, x, y, t, seed = 0, z = 0) {
  const gy = y - z;
  shadow(ctx, x, y + 1, 15, 6);
  const flap = Math.sin(t * 1.6 + seed) * 2;
  ctx.fillStyle = [C.sheet1, C.sheet2, C.sheet3][seed % 3];
  ctx.beginPath();
  ctx.moveTo(x - 16, gy);
  ctx.quadraticCurveTo(x - 10, gy - 14 + flap, x - 1, gy - 9);
  ctx.quadraticCurveTo(x + 7, gy - 16 - flap, x + 16, gy - 5);
  ctx.quadraticCurveTo(x + 10, gy + 4, x, gy + 2);
  ctx.quadraticCurveTo(x - 8, gy + 5, x - 16, gy);
  ctx.fill();
  ctx.strokeStyle = 'rgba(74,67,54,0.16)';
  ctx.lineWidth = 1.2;
  ctx.stroke();
}

export function drawDuck(ctx, d, t, onWater = true) {
  const bobb = onWater ? Math.sin(t * 2 + 1) * 1.5 : 0;
  const flip = d.flip;
  if (!onWater) shadow(ctx, d.x, d.y + 4, 12, 5);
  ellipse(ctx, d.x, d.y + bobb, 11, 7, C.duck);
  ellipse(ctx, d.x - 9 * flip, d.y - 3 + bobb, 4.5, 3.4, C.duck, -0.5 * flip);
  circle(ctx, d.x + 8 * flip, d.y - 8 + bobb, 5, C.duck);
  ellipse(ctx, d.x + 13 * flip, d.y - 7 + bobb, 3.4, 2, C.duckBeak);
  circle(ctx, d.x + 9 * flip, d.y - 9.5 + bobb, 1.1, C.ink);
  if (onWater) {
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(d.x - 14 * flip, d.y + 4 + bobb, 8, -0.4 * flip, 0.9);
    ctx.stroke();
  } else {
    ctx.strokeStyle = C.duckBeak;   // little orange feet when out of the water
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(d.x - 3, d.y + 5); ctx.lineTo(d.x - 3 + 4 * flip, d.y + 7);
    ctx.moveTo(d.x + 4, d.y + 5); ctx.lineTo(d.x + 4 + 4 * flip, d.y + 7);
    ctx.stroke();
  }
}

export function drawFlowerClump(ctx, x, y, color, t, n = 3) {
  const sway = Math.sin(t * 1.3 + x * 0.05) * 1.5;
  ctx.strokeStyle = C.hedge;
  ctx.lineWidth = 2;
  for (let i = 0; i < n; i++) {
    const fx = x + (i - (n - 1) / 2) * 8 + ((i * 31) % 5) - 2;
    const fh = 16 + ((i * 17 + x) % 9);
    ctx.beginPath();
    ctx.moveTo(fx, y);
    ctx.quadraticCurveTo(fx, y - fh * 0.6, fx + sway, y - fh);
    ctx.stroke();
    circle(ctx, fx + sway, y - fh, 3.6, color);
    circle(ctx, fx + sway, y - fh, 1.4, C.flower3);
  }
}

export function drawGnome(ctx, x, y) {
  shadow(ctx, x, y + 1, 7);
  ellipse(ctx, x, y - 6, 5.5, 7, '#6d9dc5');
  circle(ctx, x, y - 14, 4.5, C.parentSkin);
  ellipse(ctx, x, y - 12, 4.5, 3, C.white);
  ctx.fillStyle = C.gnomeHat;
  ctx.beginPath();
  ctx.moveTo(x - 4.5, y - 16);
  ctx.lineTo(x, y - 26);
  ctx.lineTo(x + 4.5, y - 16);
  ctx.closePath();
  ctx.fill();
}

export function drawGate(ctx, x, y) {
  ctx.fillStyle = C.wood;
  for (let i = 0; i < 4; i++) {
    rr(ctx, x + i * 16, y - 46 + Math.abs(i - 1.5) * 4, 8, 46 - Math.abs(i - 1.5) * 4, 3);
    ctx.fill();
  }
  rr(ctx, x - 4, y - 36, 64, 7, 3); ctx.fill();
  rr(ctx, x - 4, y - 16, 64, 7, 3); ctx.fill();
}

// The house the garden belongs to: a cottage back wall along the west edge.
export function drawHouse(ctx, x, y, w, h) {
  const roof = 54;
  ctx.fillStyle = C.houseWallDark;
  rr(ctx, x, y - h, w, h, 4);
  ctx.fill();
  ctx.fillStyle = C.houseWall;
  rr(ctx, x, y - h, w - 10, h - 6, 4);
  ctx.fill();
  // eaves
  ctx.fillStyle = C.houseRoofDark;
  rr(ctx, x - 12, y - h - roof, w + 24, roof, 6);
  ctx.fill();
  ctx.fillStyle = C.houseRoof;
  rr(ctx, x - 12, y - h - roof, w + 24, roof - 10, 6);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < w / 46; i++) rr(ctx, x + 8 + i * 46, y - h - roof + 8, 3, roof - 22, 2), ctx.fill();
  // windows
  const win = (wx, wy, ww, wh) => {
    ctx.fillStyle = C.houseTrim;
    rr(ctx, wx - 4, wy - 4, ww + 8, wh + 8, 4); ctx.fill();
    ctx.fillStyle = C.window;
    rr(ctx, wx, wy, ww, wh, 2); ctx.fill();
    ctx.fillStyle = C.windowDark;
    rr(ctx, wx, wy, ww, wh / 2 - 2, 2); ctx.fill();
    ctx.strokeStyle = C.houseTrim;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh);
    ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2);
    ctx.stroke();
  };
  win(x + 40, y - h + 34, 62, 54);
  win(x + w - 116, y - h + 34, 62, 54);
  // back door, open onto the patio
  const dx = x + w / 2 - 26;
  ctx.fillStyle = '#4a3b2c';
  rr(ctx, dx, y - 96, 52, 96, 4); ctx.fill();
  ctx.fillStyle = C.door;
  rr(ctx, dx, y - 96, 40, 96, 4); ctx.fill();
  circle(ctx, dx + 34, y - 48, 2.6, C.houseTrim);
  // climbing rose up the wall
  ctx.strokeStyle = C.leafDark;
  ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) {
    const bx = x + w - 40 + i * 9;
    ctx.beginPath();
    ctx.moveTo(bx, y);
    ctx.quadraticCurveTo(bx - 14 + i * 6, y - h * 0.6, bx - 4 + i * 8, y - h + 12);
    ctx.stroke();
  }
  for (let i = 0; i < 10; i++) {
    const f = hash(i + 3) ;
    circle(ctx, x + w - 44 + f * 34, y - 14 - hash(i + 9) * (h - 30), 3.4, i % 2 ? C.flower2 : C.white);
  }
}

export function drawBench(ctx, x, y) {
  shadow(ctx, x, y + 1, 30, 8);
  ctx.fillStyle = C.benchDark;
  rr(ctx, x - 26, y - 16, 6, 16, 2); ctx.fill();
  rr(ctx, x + 20, y - 16, 6, 16, 2); ctx.fill();
  ctx.fillStyle = C.bench;
  rr(ctx, x - 30, y - 22, 60, 7, 3); ctx.fill();
  ctx.fillStyle = C.benchDark;
  rr(ctx, x - 28, y - 44, 4, 24, 2); ctx.fill();
  rr(ctx, x + 24, y - 44, 4, 24, 2); ctx.fill();
  ctx.fillStyle = C.bench;
  rr(ctx, x - 30, y - 44, 60, 6, 3); ctx.fill();
  rr(ctx, x - 30, y - 35, 60, 6, 3); ctx.fill();
}

export function drawBirdbath(ctx, x, y, t) {
  shadow(ctx, x, y + 1, 16, 6);
  ctx.fillStyle = C.stoneDark;
  rr(ctx, x - 6, y - 30, 12, 30, 3); ctx.fill();
  ellipse(ctx, x, y - 32, 18, 8, C.stone);
  ellipse(ctx, x, y - 33, 13, 5.5, C.pond);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(x - 2, y - 33, 4 + Math.sin(t * 2) * 1.4, 0.4, 2.4);
  ctx.stroke();
}

export function drawPot(ctx, x, y, s = 1, color = C.flower1) {
  shadow(ctx, x, y + 1, 13 * s, 5 * s);
  ctx.fillStyle = C.terracottaDark;
  ctx.beginPath();
  ctx.moveTo(x - 13 * s, y - 22 * s);
  ctx.lineTo(x + 13 * s, y - 22 * s);
  ctx.lineTo(x + 9 * s, y);
  ctx.lineTo(x - 9 * s, y);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = C.terracotta;
  rr(ctx, x - 14 * s, y - 26 * s, 28 * s, 8 * s, 2 * s);
  ctx.fill();
  ellipse(ctx, x - 5 * s, y - 32 * s, 8 * s, 7 * s, C.leaf);
  ellipse(ctx, x + 6 * s, y - 30 * s, 7 * s, 6 * s, C.leafDark);
  circle(ctx, x - 6 * s, y - 36 * s, 3.4 * s, color);
  circle(ctx, x + 5 * s, y - 34 * s, 3.4 * s, color);
  circle(ctx, x, y - 39 * s, 3.4 * s, C.flower3);
}

export function drawShrub(ctx, x, y, s = 1, seed = 0, t = 0) {
  const sway = Math.sin(t * 0.9 + seed) * 1.5;
  shadow(ctx, x, y + 1, 22 * s, 7 * s);
  ellipse(ctx, x - 12 * s + sway * 0.3, y - 14 * s, 15 * s, 13 * s, C.hedgeDark);
  ellipse(ctx, x + 12 * s + sway * 0.3, y - 15 * s, 15 * s, 13 * s, C.hedgeDark);
  ellipse(ctx, x + sway, y - 24 * s, 18 * s, 16 * s, C.hedge);
  ellipse(ctx, x - 6 * s + sway, y - 30 * s, 10 * s, 8 * s, C.hedgeLight);
  for (let i = 0; i < 4; i++) {
    circle(ctx, x + (hash(seed + i) - 0.5) * 34 * s + sway, y - 12 * s - hash(seed + i + 7) * 26 * s, 3 * s, C.flower3);
  }
}

// tall spires: hollyhocks and foxgloves for the back of a border
export function drawSpire(ctx, x, y, h, color, t, seed = 0) {
  const sway = Math.sin(t * 1.1 + seed) * 3;
  ctx.strokeStyle = C.hedge;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x, y - h * 0.6, x + sway, y - h);
  ctx.stroke();
  const n = Math.max(3, Math.round(h / 11));
  for (let i = 0; i < n; i++) {
    const f = i / n;
    const fy = y - h * (0.35 + f * 0.65);
    const fx = x + sway * (0.35 + f * 0.65) + (i % 2 ? 3.5 : -3.5);
    circle(ctx, fx, fy, 4.2 - f * 1.6, color);
  }
  ellipse(ctx, x - 6, y - 6, 6, 3.4, C.leafDark, -0.4);
  ellipse(ctx, x + 6, y - 11, 6, 3.4, C.leafDark, 0.4);
}

export function drawReeds(ctx, x, y, n, seed, t) {
  for (let i = 0; i < n; i++) {
    const rx = x + (hash(seed + i) - 0.5) * 30;
    const h = 24 + hash(seed + i + 4) * 22;
    const sway = Math.sin(t * 1.5 + i + seed) * 3;
    ctx.strokeStyle = C.reed;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(rx, y);
    ctx.quadraticCurveTo(rx, y - h * 0.6, rx + sway, y - h);
    ctx.stroke();
    if (i % 3 === 0) {
      ctx.fillStyle = C.reedHead;
      rr(ctx, rx + sway - 2, y - h - 9, 4, 11, 2);
      ctx.fill();
    }
  }
}

export function drawCompost(ctx, x, y) {
  shadow(ctx, x, y + 2, 30, 9);
  ctx.fillStyle = C.crateDark;
  rr(ctx, x - 30, y - 30, 60, 30, 3); ctx.fill();
  ctx.fillStyle = C.compost;
  ellipse(ctx, x, y - 32, 26, 9, C.compost);
  ctx.fillStyle = C.wood;
  for (let i = 0; i < 3; i++) { rr(ctx, x - 30, y - 28 + i * 10, 60, 6, 2); ctx.fill(); }
  ellipse(ctx, x - 8, y - 36, 7, 4, C.leafDark);
  ellipse(ctx, x + 7, y - 35, 6, 3.5, C.leaf);
}

// drive is the rider's swing phase (-1..1); empty, it just stirs in the breeze
export function drawSwing(ctx, x, y, t, drive = null) {
  const sway = drive === null ? Math.sin(t * 1.2) * 0.09 : drive * 0.42;
  ctx.strokeStyle = '#8a8172';
  ctx.lineWidth = 2;
  const sx = x + Math.sin(sway) * 40;
  ctx.beginPath();
  ctx.moveTo(x - 10, y - 74); ctx.lineTo(sx - 10, y - 34);
  ctx.moveTo(x + 10, y - 74); ctx.lineTo(sx + 10, y - 34);
  ctx.stroke();
  ctx.fillStyle = C.bench;
  ctx.save();
  ctx.translate(sx, y - 32);
  ctx.rotate(sway);
  rr(ctx, -16, -4, 32, 7, 2);
  ctx.fill();
  ctx.restore();
}

// Fingerpost at the path junction. arms: [label, direction] where direction is
// -1 for pointing left, 1 for right.
export function drawSignpost(ctx, x, y, arms) {
  shadow(ctx, x, y + 1, 11, 5);
  ctx.fillStyle = C.benchDark;
  rr(ctx, x - 4, y - 76, 8, 76, 3);
  ctx.fill();
  ctx.font = `10px ${FONT}`;
  arms.forEach(([label, dir], i) => {
    const ay = y - 68 + i * 19;
    const w = ctx.measureText(label).width + 20;
    ctx.save();
    ctx.translate(x, ay);
    ctx.scale(dir, 1);
    ctx.fillStyle = C.bench;
    ctx.beginPath();
    ctx.moveTo(-2, -7);
    ctx.lineTo(w - 8, -7);
    ctx.lineTo(w, 0);
    ctx.lineTo(w - 8, 7);
    ctx.lineTo(-2, 7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = C.ink;
    ctx.textAlign = 'center';
    ctx.fillText(label, x + dir * (w / 2 - 1), ay + 3.5);
    ctx.textAlign = 'left';
  });
}

export function drawBubble(ctx, x, y, text, big = false) {
  ctx.font = `${big ? 13 : 11}px ${FONT}`;
  const w = ctx.measureText(text).width + 14;
  const h = big ? 22 : 19;
  ctx.fillStyle = 'rgba(253, 251, 244, 0.94)';
  ctx.strokeStyle = 'rgba(74, 67, 54, 0.25)';
  ctx.lineWidth = 1.5;
  rr(ctx, x - w / 2, y - h - 8, w, h, 9);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 4, y - 9);
  ctx.lineTo(x, y - 1);
  ctx.lineTo(x + 5, y - 9);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = C.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y - h / 2 - 7.5);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}
