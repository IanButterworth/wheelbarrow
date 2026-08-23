import { clamp } from './utils.js';

// Solids are {kind:'c', x, y, r} or {kind:'r', x, y, w, h} (top-left).
// Returns penetration push vector for a circle at (x, y, r), or null.
function penetration(s, x, y, r) {
  if (s.kind === 'c') {
    const dx = x - s.x, dy = y - s.y;
    const d = Math.hypot(dx, dy);
    const min = r + s.r;
    if (d >= min || d === 0) return null;
    const p = (min - d) / d;
    return { x: dx * p, y: dy * p };
  }
  const cx = clamp(x, s.x, s.x + s.w);
  const cy = clamp(y, s.y, s.y + s.h);
  const dx = x - cx, dy = y - cy;
  const d = Math.hypot(dx, dy);
  if (d >= r) return null;
  if (d > 0.0001) {
    const p = (r - d) / d;
    return { x: dx * p, y: dy * p };
  }
  // center inside the rect: push out the nearest face
  const left = x - s.x, right = s.x + s.w - x, top = y - s.y, bot = s.y + s.h - y;
  const m = Math.min(left, right, top, bot);
  if (m === left) return { x: -(left + r), y: 0 };
  if (m === right) return { x: right + r, y: 0 };
  if (m === top) return { x: 0, y: -(top + r) };
  return { x: 0, y: bot + r };
}

export function resolveCircle(pos, r, solids) {
  let hit = false, nx = 0, ny = 0;
  for (let iter = 0; iter < 2; iter++) {
    for (const s of solids) {
      const p = penetration(s, pos.x, pos.y, r);
      if (p) {
        pos.x += p.x; pos.y += p.y;
        const len = Math.hypot(p.x, p.y) || 1;
        nx = p.x / len; ny = p.y / len;
        hit = true;
      }
    }
  }
  return hit ? { nx, ny } : null;
}

// squared distance from (x, y) to segment ab
function segDist2(ax, ay, bx, by, x, y) {
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : clamp(((x - ax) * dx + (y - ay) * dy) / len2, 0, 1);
  const px = ax + dx * t - x, py = ay + dy * t - y;
  return px * px + py * py;
}

export function distToPolyline(pts, x, y) {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = segDist2(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], x, y);
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export function pointInPoly(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Anything put down in the garden has to stay reachable: push it clear of
// hedges and props, out of the pond, and inside the bounds. Without this a
// spilled child or apple can end up somewhere the barrow can never reach.
export function settleOnGround(pos, r, world) {
  resolveCircle(pos, r, world.solids);
  const pd = world.pond;
  if (pd) {
    const dx = (pos.x - pd.x) / (pd.rx + r + 16);
    const dy = (pos.y - pd.y) / (pd.ry + r + 16);
    const m = Math.hypot(dx, dy);
    if (m < 1 && m > 0.0001) {
      pos.x = pd.x + (dx / m) * (pd.rx + r + 16);
      pos.y = pd.y + (dy / m) * (pd.ry + r + 16);
    }
  }
  pos.x = clamp(pos.x, 80, world.W - 80);
  pos.y = clamp(pos.y, 140, world.H - 90);
  resolveCircle(pos, r, world.solids);
  return pos;
}

export function inShape(s, x, y) {
  if (s.kind === 'c') return Math.hypot(x - s.x, y - s.y) <= s.r;
  if (s.kind === 'poly') return pointInPoly(s.pts, x, y);
  if (s.kind === 'path') return distToPolyline(s.pts, x, y) <= s.w / 2;
  return x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h;
}

// Ordered region list, first hit wins.
export function surfaceAt(surfaces, x, y) {
  for (const reg of surfaces) {
    if (inShape(reg.shape, x, y)) return reg;
  }
  return { type: 'grass', speed: 1 };
}
