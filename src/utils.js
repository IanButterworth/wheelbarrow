export const TAU = Math.PI * 2;

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

export function wrapAngle(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

// shortest signed angle from a to b
export const shortAngle = (a, b) => wrapAngle(b - a);

// frame-rate independent smoothing factor
export const expDamp = (k, dt) => 1 - Math.exp(-k * dt);

export const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(rand(a, b + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export function makeEvents() {
  const handlers = {};
  return {
    on(type, fn) { (handlers[type] ||= []).push(fn); },
    emit(type, data) {
      for (const fn of handlers[type] || []) fn(data);
      for (const fn of handlers['*'] || []) fn(type, data);
    },
  };
}
