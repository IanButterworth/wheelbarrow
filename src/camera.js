import { clamp, expDamp, rand } from './utils.js';

export function makeCamera(x, y) {
  return { x, y, shake: 0, sx: 0, sy: 0, zoom: 1 };
}

export function updateCamera(cam, game, dt) {
  const p = game.player;
  const look = Math.min(p.v * 0.5, 80);
  const tx = p.x + Math.cos(p.a) * look;
  const ty = p.y + Math.sin(p.a) * look;
  const d = expDamp(4, dt);
  cam.x += (tx - cam.x) * d;
  cam.y += (ty - cam.y) * d;
  // ease back a little at speed so a trot feels quicker than it is
  const gentle = game.opts && game.opts.reducedMotion;
  const want = 1 - Math.min(p.v / 192, 1) * (gentle ? 0 : 0.07);
  cam.zoom += (want - cam.zoom) * expDamp(2.5, dt);
  clampCamera(cam, game);
  cam.shake = Math.max(0, cam.shake - dt * 8);
  const s = gentle ? 0 : Math.min(cam.shake, 1) * 4;
  cam.sx = rand(-s, s); cam.sy = rand(-s, s);
}

export function clampCamera(cam, game) {
  const s = game.scale * cam.zoom;
  const vw = game.width / s, vh = game.height / s;
  const W = game.world.W, H = game.world.H;
  cam.x = vw >= W ? W / 2 : clamp(cam.x, vw / 2, W - vw / 2);
  cam.y = vh >= H ? H / 2 : clamp(cam.y, vh / 2, H - vh / 2);
}
