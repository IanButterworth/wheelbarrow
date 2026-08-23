import { C } from './palette.js';
import { TAU, rand } from './utils.js';
import { settleOnGround } from './physics.js';
import * as S from './sprites.js';

const H2 = S.hash;

// wobbly strip running left to right, used for the long herbaceous borders
function stripBed(x0, x1, yTop, yBot, seed) {
  const pts = [];
  const n = Math.max(4, Math.round((x1 - x0) / 130));
  for (let i = 0; i <= n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    pts.push([x, yTop - 14 + H2(seed + i) * 30]);
  }
  for (let i = n; i >= 0; i--) {
    const x = x0 + ((x1 - x0) * i) / n;
    pts.push([x, yBot - 16 + H2(seed + 40 + i) * 34]);
  }
  return pts;
}

export function makeWorld() {
  const W = 2800, H = 1500;
  const solids = [];
  const props = [];

  const solidR = (x, y, w, h) => solids.push({ kind: 'r', x, y, w, h });
  const solidC = (x, y, r) => solids.push({ kind: 'c', x, y, r });

  // ---- boundary: hedges all the way round, with the house filling the top left
  solidR(0, 0, W, 74);
  solidR(0, H - 60, W, 60);
  solidR(0, 0, 58, H);
  solidR(W - 58, 0, 58, H);
  props.push({ sortY: 96, draw: (ctx, g) => S.drawHedge(ctx, { x: -20, y: 96, w: W + 40, ht: 86, seed: 3 }, g.time) });
  props.push({ sortY: H - 4, draw: (ctx, g) => S.drawHedge(ctx, { x: -20, y: H - 4, w: W + 40, ht: 84, seed: 11 }, g.time) });
  for (let y = 190; y <= H; y += 96) {
    const yy = y;
    props.push({ sortY: yy, draw: (ctx, g) => S.drawHedge(ctx, { x: -14, y: yy, w: 80, ht: 100, seed: yy }, g.time) });
    props.push({ sortY: yy, draw: (ctx, g) => S.drawHedge(ctx, { x: W - 66, y: yy, w: 80, ht: 100, seed: yy + 5 }, g.time) });
  }
  props.push({ sortY: 742, draw: (ctx) => S.drawGate(ctx, W - 68, 738) });

  // ---- the house, back wall along the top, with its patio in front
  const house = { x: 118, y: 352, w: 548, h: 146 };
  solidR(house.x - 14, 150, house.w + 28, 208);
  props.push({ sortY: house.y, draw: (ctx) => S.drawHouse(ctx, house.x, house.y, house.w, house.h) });

  const patio = [
    [96, 356], [250, 348], [420, 352], [560, 346], [676, 358],
    [690, 470], [672, 566], [520, 590], [360, 596], [210, 586], [104, 560],
  ];
  // pots along the house wall
  for (const [px, ps, pc] of [[150, 1, C.flower1], [700, 0.9, C.flower3], [726, 0.75, C.flower2]]) {
    const py = px < 400 ? 386 : 470;
    solidC(px, py, 11 * ps);
    props.push({ sortY: py, draw: (ctx) => S.drawPot(ctx, px, py, ps, pc) });
  }
  // tea table on the patio
  solidC(232, 508, 30);
  props.push({ sortY: 510, draw: (ctx) => S.drawTable(ctx, 232, 508) });
  solidC(596, 556, 8);
  props.push({ sortY: 556, draw: (ctx) => S.drawGnome(ctx, 596, 554) });

  // ---- path network: gentle curves that actually join the places up
  const mainPath = [
    [402, 588], [470, 668], [604, 742], [820, 806], [1080, 838],
    [1360, 836], [1620, 800], [1806, 762], [2010, 796], [2168, 902],
    [2232, 1046], [2238, 1188],
  ];
  const pondPath = [[1806, 762], [1846, 664], [1866, 552], [1868, 470]];
  const poolPath = [[1360, 836], [1414, 934], [1452, 1006]];
  const paths = [
    { pts: mainPath, w: 78 },
    { pts: pondPath, w: 58 },
    { pts: poolPath, w: 52 },
  ];

  // ---- fingerpost where the paths part company
  solidC(1330, 902, 7);
  props.push({
    sortY: 902,
    draw: (ctx) => S.drawSignpost(ctx, 1330, 902, [['Pond', 1], ['Greenhouse', 1], ['Paddling pool', -1]]),
  });

  // ---- pond, up in the north east
  const pond = { x: 1866, y: 302, rx: 198, ry: 108 };
  pond.ring = S.ring(pond.x, pond.y, pond.rx, pond.ry, 14, 21, 0.09);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    solidC(pond.x + Math.cos(a) * pond.rx * 0.98, pond.y + Math.sin(a) * pond.ry * 0.98, 40);
  }
  const duck = { x: pond.x - 30, y: pond.y - 10, flip: 1, t: 0 };
  for (const [rx, ry, n, sd] of [[-190, 40, 5, 2], [150, -70, 4, 8], [-60, -120, 5, 14], [190, 30, 4, 22]]) {
    const px = pond.x + rx, py = pond.y + ry;
    props.push({ sortY: py, draw: (ctx, g) => S.drawReeds(ctx, px, py, n, sd, g.time) });
  }

  // ---- greenhouse, veg patch, compost, crate
  solidR(2286, 1108, 150, 44);
  props.push({ sortY: 1152, draw: (ctx) => S.drawGreenhouse(ctx, 2286, 1152) });
  solidC(2196, 1214, 22);
  props.push({ sortY: 1214, draw: (ctx, g) => S.drawCrate(ctx, 2196, 1214, g.crateApples) });
  solidR(2470, 1230, 60, 30);
  props.push({ sortY: 1262, draw: (ctx) => S.drawCompost(ctx, 2500, 1262) });
  const veg = S.ring(2030, 1226, 148, 108, 12, 44, 0.1);

  // ---- kennel and the dog's sunny spot on the path
  solidR(1700, 610, 64, 40);
  props.push({ sortY: 652, draw: (ctx) => S.drawKennel(ctx, 1732, 650) });

  // ---- paddling pool and picnic blanket
  const pool = { x: 1500, y: 1060 };
  solidC(pool.x, pool.y, 38);
  props.push({ sortY: pool.y + 26, draw: (ctx, g) => S.drawPool(ctx, pool.x, pool.y, g.time) });
  const blanket = { x: 820, y: 1120, rx: 100, ry: 75 };

  // ---- trees: orchard corner, a shade tree over the picnic, one by the pond
  const trees = [
    [2470, 452, 1.65], [2626, 606, 1.15], [2360, 300, 1.0],
    [700, 1290, 1.45], [446, 1010, 1.15], [2600, 986, 1.05], [1084, 1350, 1.2],
  ];
  for (const [tx, ty, ts] of trees) {
    solidC(tx, ty - 4, 14 * ts);
    props.push({ sortY: ty, draw: (ctx, g) => S.drawTree(ctx, tx, ty, ts, g.time) });
  }
  // rope swing under the picnic tree
  props.push({ sortY: 1290 - 40, draw: (ctx, g) => S.drawSwing(ctx, 700, 1290, g.time) });

  // ---- washing line on the north lawn
  const washing = { x1: 812, y: 388, x2: 1160 };
  solidC(washing.x1, washing.y, 7);
  solidC(washing.x2, washing.y, 7);
  props.push({ sortY: washing.y, draw: (ctx, g) => S.drawWashing(ctx, washing, g.time) });

  // ---- sprinkler on the north lawn
  const sprinkler = { x: 1284, y: 560, reach: 178, angle: 0 };
  solidC(sprinkler.x, sprinkler.y, 6);
  props.push({ sortY: sprinkler.y, draw: (ctx) => S.drawSprinklerBase(ctx, sprinkler.x, sprinkler.y) });

  // ---- lawn furniture: things to steer around
  const bench = { x: 1046, y: 1128 };
  solidR(bench.x - 28, bench.y - 14, 56, 16);
  props.push({ sortY: bench.y, draw: (ctx) => S.drawBench(ctx, bench.x, bench.y) });
  const bath = { x: 1660, y: 1216 };
  solidC(bath.x, bath.y, 13);
  props.push({ sortY: bath.y, draw: (ctx, g) => S.drawBirdbath(ctx, bath.x, bath.y, g.time) });

  // shrubs dotted about, kept off the main driving lines
  const shrubs = [
    [880, 246, 1.0], [1480, 250, 0.9], [1180, 210, 0.8], [2160, 210, 0.95],
    [300, 760, 0.95], [268, 1180, 1.1], [980, 1256, 0.85], [1780, 1082, 0.9],
    [2420, 812, 1.0], [1240, 1180, 0.8], [560, 900, 0.75], [2560, 1420, 0.9],
    [1620, 1348, 1.0], [340, 1400, 0.95], [2140, 1400, 0.85],
  ];
  for (const [sx, sy, ss] of shrubs) {
    solidC(sx, sy - 6, 17 * ss);
    props.push({ sortY: sy, draw: (ctx, g) => S.drawShrub(ctx, sx, sy, ss, sx + sy, g.time) });
  }

  // ---- herbaceous borders, hard against the hedges
  // the north border breaks either side of the pond
  const beds = [
    { pts: stripBed(760, 1636, 176, 268, 5), seed: 5 },
    { pts: stripBed(2116, 2740, 176, 268, 23), seed: 23 },
    { pts: stripBed(300, 2360, 1352, 1444, 9), seed: 9 },
    { pts: S.ring(196, 900, 116, 210, 12, 17, 0.12), seed: 17 },
  ];
  // planting: spires at the back, clumps at the front
  const flowerCols = [C.flower1, C.flower2, C.flower4, C.flower3];
  let fi = 0;
  for (const [bx0, bx1, by, spread] of [[790, 1620, 218, 74], [2140, 2720, 218, 74], [330, 2330, 1394, 70]]) {
    for (let x = bx0; x < bx1; x += 27) {
      const j = fi++;
      const cy = by + (H2(j * 3) - 0.5) * spread;
      const col = flowerCols[j % flowerCols.length];
      const cx = x + (H2(j * 7) - 0.5) * 20;
      if (j % 3 === 0) {
        const h = 40 + H2(j) * 34;
        props.push({ sortY: cy, draw: (ctx, g) => S.drawSpire(ctx, cx, cy, h, col, g.time, j) });
      } else {
        props.push({ sortY: cy, draw: (ctx, g) => S.drawFlowerClump(ctx, cx, cy, col, g.time, 2 + (j % 3)) });
      }
    }
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU;
    const cx = 196 + Math.cos(a) * 76, cy = 900 + Math.sin(a) * 150;
    const col = flowerCols[i % flowerCols.length];
    props.push({ sortY: cy, draw: (ctx, g) => S.drawFlowerClump(ctx, cx, cy, col, g.time, 3) });
  }

  // ---- windfall apples under the orchard trees
  const apples = [];
  const bounds = { solids, pond, W, H };
  for (const [ax, ay, n, sd] of [[2470, 452, 5, 1], [2626, 606, 3, 30]]) {
    for (let i = 0; i < n; i++) {
      const a = H2(sd + i) * TAU;
      const d = 70 + H2(sd + i + 50) * 120;
      // settle each one so none spawns inside a hedge and taunts the player
      apples.push(settleOnGround({ x: ax + Math.cos(a) * d, y: ay + 60 + Math.sin(a) * d * 0.55 }, 6, bounds));
    }
  }

  const molehills = [
    [900, 640], [1180, 980], [1560, 700], [1420, 480],
    [980, 300], [1720, 980], [660, 1080], [2320, 700],
    [1900, 1120], [520, 700], [1260, 1264], [2420, 1080],
  ].map(([x, y]) => ({ x, y, r: 16, cooldown: 0 }));

  const surfaces = [
    ...paths.map((p) => ({ shape: { kind: 'path', pts: p.pts, w: p.w }, type: 'gravel', speed: 1.1 })),
    { shape: { kind: 'poly', pts: patio }, type: 'patio', speed: 1.05 },
    { shape: { kind: 'c', x: pond.x, y: pond.y, r: 250 }, type: 'mud', speed: 0.62 },
    ...beds.map((b) => ({ shape: { kind: 'poly', pts: b.pts }, type: 'bed', speed: 0.5 })),
    { shape: { kind: 'poly', pts: veg }, type: 'bed', speed: 0.5 },
  ];

  const regions = {
    pool: { x: pool.x, y: pool.y, r: 90 },
    blanket,
    crate: { x: 2196, y: 1214, r: 78 },
    dogZone: { x: 1592, y: 620, w: 320, h: 250 },
  };

  // scattered lawn detail, generated once
  const daisies = [];
  for (let i = 0; i < 190; i++) {
    const x = 90 + H2(i * 1.7) * (W - 180);
    const y = 150 + H2(i * 2.3 + 9) * (H - 260);
    daisies.push({ x, y, n: 2 + Math.floor(H2(i * 5) * 3), kind: H2(i * 11) < 0.35 ? 'clover' : 'daisy' });
  }

  return {
    W, H, solids, props, surfaces, regions,
    house, patio, beds, veg, pond, pool, sprinkler, washing, duck, paths, daisies,
    molehills, apples,
    dogHome: { x: 1806, y: 762 },
    granSpots: [{ x: 1996, y: 1268 }, { x: 2100, y: 1180 }, { x: 2020, y: 1330 }],
    parentStart: { x: 404, y: 500 },
    childStarts: { poppy: { x: 620, y: 700 }, alfie: { x: 1010, y: 596 } },
  };
}

export function updateWorld(world, game, dt) {
  world.sprinkler.angle += dt * 0.7;
  const d = world.duck;
  d.t += dt;
  d.x += Math.cos(d.t * 0.23) * dt * 9;
  d.y += Math.sin(d.t * 0.31) * dt * 5;
  d.flip = Math.cos(d.t * 0.23) < 0 ? -1 : 1;
  for (const m of world.molehills) m.cooldown = Math.max(0, m.cooldown - dt);
}

function strokePath(ctx, pts, w, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i][0] + pts[i + 1][0]) / 2;
    const my = (pts[i][1] + pts[i + 1][1]) / 2;
    ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my);
  }
  ctx.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]);
  ctx.stroke();
}

export function drawGround(ctx, game) {
  const w = game.world;
  const t = game.time;
  ctx.fillStyle = C.grass;
  ctx.fillRect(-100, -100, w.W + 200, w.H + 200);
  ctx.fillStyle = C.grassStripe;
  for (let y = 0; y < w.H; y += 220) ctx.fillRect(-100, y, w.W + 200, 110);

  // lawn detail, under everything else so it only ever shows on grass
  for (const d of w.daisies) {
    if (d.kind === 'clover') {
      ctx.fillStyle = C.clover;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, 11, 6, 0, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      ctx.fillStyle = C.daisy;
      ctx.globalAlpha = 0.85;
      for (let i = 0; i < d.n; i++) {
        ctx.beginPath();
        ctx.arc(d.x + i * 7 - d.n * 3, d.y + (i % 2) * 5, 1.7, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  // damp margin around the pond: a soft ring, not a slab of chocolate
  ctx.fillStyle = C.pondEdge;
  S.blobPath(ctx, S.grow(w.pond.ring, w.pond.x, w.pond.y, 54, 40));
  ctx.fill();
  ctx.fillStyle = C.mud;
  ctx.globalAlpha = 0.5;
  S.blobPath(ctx, S.grow(w.pond.ring, w.pond.x, w.pond.y, 26, 18));
  ctx.fill();
  ctx.globalAlpha = 1;

  // gravel paths
  for (const p of w.paths) strokePath(ctx, p.pts, p.w + 10, C.pathEdge);
  for (const p of w.paths) strokePath(ctx, p.pts, p.w, C.path);

  // patio flags
  S.blobPath(ctx, w.patio);
  ctx.fillStyle = C.stoneDark;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = C.stone;
  for (let gy = 340; gy < 610; gy += 46) {
    for (let gx = 84; gx < 700; gx += 62) {
      const off = ((gy / 46) | 0) % 2 ? 22 : 0;
      ctx.beginPath();
      ctx.roundRect(gx + off, gy, 56, 40, 3);
      ctx.fill();
    }
  }
  // moss in the joints
  ctx.fillStyle = C.moss;
  ctx.globalAlpha = 0.5;
  for (let i = 0; i < 26; i++) {
    const mx = 90 + H2(i * 3.1) * 600, my = 344 + H2(i * 5.3) * 250;
    ctx.beginPath();
    ctx.ellipse(mx, my, 7 + H2(i) * 7, 3, 0, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // flower beds: dug earth, then low foliage so the borders read as planted
  for (const b of w.beds) {
    ctx.fillStyle = C.bedDark;
    S.blobPath(ctx, b.pts);
    ctx.fill();
    ctx.fillStyle = C.bed;
    S.blobPath(ctx, b.pts.map(([x, y]) => [x, y + 4]));
    ctx.fill();
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [px, py] of b.pts) {
      if (px < x0) x0 = px; if (px > x1) x1 = px;
      if (py < y0) y0 = py; if (py > y1) y1 = py;
    }
    ctx.save();
    S.blobPath(ctx, b.pts.map(([x, y]) => [x, y + 4]));
    ctx.clip();
    const n = Math.round(((x1 - x0) * (y1 - y0)) / 380);
    for (let i = 0; i < n; i++) {
      const fx = x0 + H2(b.seed + i * 1.7) * (x1 - x0);
      // weight foliage toward the back so bare soil shows only at the front edge
      const bias = H2(b.seed + i * 2.9 + 5) ** 1.6;
      const fy = y0 + bias * (y1 - y0);
      const s = 13 + H2(b.seed + i * 3.3) * 16;
      const k = H2(b.seed + i);
      ctx.fillStyle = k < 0.35 ? C.leafDark : k < 0.8 ? C.leaf : C.hedgeLight;
      ctx.beginPath();
      ctx.ellipse(fx, fy, s, s * 0.66, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.fillStyle = C.bedDark;
  S.blobPath(ctx, w.veg);
  ctx.fill();
  ctx.fillStyle = C.bed;
  S.blobPath(ctx, w.veg.map(([x, y]) => [x, y + 4]));
  ctx.fill();
  for (let r = 0; r < 5; r++) {
    const ry = 1156 + r * 34;
    ctx.fillStyle = C.leafDark;
    for (let cx = 1918; cx < 2146; cx += 28) {
      const wob = H2(cx + ry) * 5;
      ctx.beginPath();
      ctx.ellipse(cx + wob, ry + wob * 0.4, 10, 6.5, 0, 0, TAU);
      ctx.fill();
    }
  }

  // pond water
  ctx.fillStyle = C.pond;
  S.blobPath(ctx, w.pond.ring);
  ctx.fill();
  ctx.fillStyle = C.pondDeep;
  S.blobPath(ctx, S.grow(w.pond.ring, w.pond.x, w.pond.y, -46, -32).map(([x, y]) => [x + 16, y + 8]));
  ctx.fill();
  for (const [lx, ly, lr] of [[-118, -28, 16], [92, 42, 13], [44, -52, 11], [-30, 62, 12]]) {
    ctx.fillStyle = C.lily;
    ctx.beginPath();
    ctx.ellipse(w.pond.x + lx, w.pond.y + ly, lr, lr * 0.6, 0, 0.35, TAU - 0.25);
    ctx.lineTo(w.pond.x + lx, w.pond.y + ly);
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(w.pond.x - 40 + i * 44, w.pond.y - 40 + i * 34, 26 + Math.sin(t * 0.8 + i) * 3, 8, 0, 0, Math.PI);
    ctx.stroke();
  }

  // picnic blanket
  S.drawBlanket(ctx, w.regions.blanket.x, w.regions.blanket.y);

  // molehills
  for (const m of w.molehills) S.drawMolehill(ctx, m.x, m.y);

  // drifting cloud shadows
  ctx.fillStyle = 'rgba(60, 90, 60, 0.055)';
  for (let i = 0; i < 3; i++) {
    const cx = ((i * 987 + t * 14) % (w.W + 700)) - 350;
    const cy = 200 + i * 470;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 230, 90, 0, 0, TAU);
    ctx.ellipse(cx + 150, cy + 40, 160, 70, 0, 0, TAU);
    ctx.fill();
  }
}
