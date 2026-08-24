import { TAU, rand, pick, expDamp } from './utils.js';
import { C } from './palette.js';
import { FONT } from './sprites.js';

const PETALS = [C.flower1, C.flower2, C.flower4, C.white];

export function makeParticles() {
  const list = [];
  const spawn = (kind, x, y, opts = {}) => {
    const p = { kind, x, y, age: 0, ...defaults(kind), ...opts };
    list.push(p);
    if (list.length > 400) list.shift();
    return p;
  };
  return {
    list, spawn,
    burst(kind, x, y, n) {
      for (let i = 0; i < n; i++) {
        const a = rand(TAU), s = rand(20, 70);
        spawn(kind, x + rand(-6, 6), y + rand(-4, 4), { vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6 });
      }
    },
  };
}

function defaults(kind) {
  switch (kind) {
    case 'petal': return { life: rand(0.8, 1.5), vx: rand(-40, 40), vy: rand(-60, -10), g: 60, color: pick(PETALS), size: rand(2, 3.5) };
    case 'splash': return { life: rand(0.5, 0.8), vx: rand(-30, 30), vy: rand(-80, -30), g: 260, color: C.pond, size: rand(1.8, 3) };
    case 'dust': return { life: rand(0.5, 0.9), vx: rand(-20, 20), vy: rand(-24, -6), g: -10, color: 'rgba(150,130,100,0.4)', size: rand(3, 6) };
    case 'star': return { life: rand(0.6, 1), vx: 0, vy: rand(-50, -20), g: 30, color: C.flower3, size: rand(2, 3.4) };
    case 'heart': return { life: rand(1.2, 2), vx: rand(-12, 12), vy: rand(-40, -22), g: -6, color: C.heart, size: rand(2.6, 4) };
    case 'zz': return { life: 2, vx: 6, vy: -14, g: 0, color: 'rgba(90,90,110,0.7)', size: 9 };
    case 'drip': return { life: rand(0.4, 0.7), vx: rand(-14, 14), vy: rand(-10, 30), g: 300, color: C.water, size: rand(1.6, 2.4) };
    case 'butterfly': return { life: rand(9, 14), vx: rand(-16, 16), vy: rand(-10, 10), g: 0, color: Math.random() < 0.5 ? C.butterfly : C.flower2, size: 4 };
    default: return { life: 1, vx: 0, vy: 0, g: 0, color: '#fff', size: 3 };
  }
}

export function updateParticles(ps, dt) {
  const list = ps.list;
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.age += dt;
    if (p.age >= p.life) { list.splice(i, 1); continue; }
    if (p.kind === 'butterfly') {
      const wander = Math.sqrt(dt);   // random walk, see GRAVEL_JIT in player.js
      p.vx += rand(-8, 8) * wander;
      p.vy += rand(-8, 8) * wander;
      const damp = 1 - expDamp(1.2, dt);
      p.vx *= damp; p.vy *= damp;
    }
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

export function drawParticles(ps, ctx, t) {
  for (const p of ps.list) {
    const f = 1 - p.age / p.life;
    ctx.globalAlpha = Math.min(1, f * 2);
    if (p.kind === 'zz') {
      ctx.fillStyle = p.color;
      ctx.font = `${p.size + p.age * 3}px ${FONT}`;
      ctx.fillText('z', p.x, p.y);
    } else if (p.kind === 'heart') {
      ctx.fillStyle = p.color;
      const s = p.size;
      ctx.beginPath();
      ctx.arc(p.x - s * 0.5, p.y - s * 0.4, s * 0.55, 0, TAU);
      ctx.arc(p.x + s * 0.5, p.y - s * 0.4, s * 0.55, 0, TAU);
      ctx.moveTo(p.x - s, p.y - s * 0.15);
      ctx.lineTo(p.x, p.y + s);
      ctx.lineTo(p.x + s, p.y - s * 0.15);
      ctx.fill();
    } else if (p.kind === 'butterfly') {
      const flap = 0.25 + Math.abs(Math.sin(t * 22 + p.x)) * 0.75;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.ellipse(p.x - p.size * 0.7 * flap, p.y, p.size * flap, p.size * 0.55, -0.4, 0, TAU);
      ctx.ellipse(p.x + p.size * 0.7 * flap, p.y, p.size * flap, p.size * 0.55, 0.4, 0, TAU);
      ctx.fill();
    } else if (p.kind === 'star') {
      ctx.fillStyle = p.color;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.age * 5);
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        ctx.rotate(Math.PI / 2);
        ctx.moveTo(0, 0);
        ctx.lineTo(p.size, 0);
        ctx.lineTo(p.size * 0.4, p.size * 0.4);
      }
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
