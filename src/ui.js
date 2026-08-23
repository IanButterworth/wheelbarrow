import { clamp, lerp, expDamp } from './utils.js';
import { C } from './palette.js';
import { FONT } from './sprites.js';
import { taskText } from './tasks.js';

export function makeUI() {
  return {
    listOpen: false, listSlide: 0, autoT: 4,
    banner: null, hintT: 16, titleT: 0, endT: 0, touchFade: 0,
  };
}

export function attachUI(game) {
  game.events.on('task-done', ({ task }) => {
    game.ui.autoT = 3.2;
    game.ui.banner = { text: taskText(task), t: 3.4 };
  });
  game.events.on('task-reveal', () => {
    game.ui.autoT = 4;
    game.ui.banner = { text: 'And then...', t: 2.6 };
  });
}

export function updateUI(game, dt) {
  const ui = game.ui;
  if (game.input.snap.list) ui.listOpen = !ui.listOpen;
  ui.autoT = Math.max(0, ui.autoT - dt);
  const target = ui.listOpen || ui.autoT > 0 ? 1 : 0;
  ui.listSlide += (target - ui.listSlide) * expDamp(9, dt);
  if (ui.banner) {
    ui.banner.t -= dt;
    if (ui.banner.t <= 0) ui.banner = null;
  }
  if (game.state === 'playing') ui.hintT = Math.max(0, ui.hintT - dt);
  ui.titleT += dt;
  const wantTouch = game.input.touchSeen && game.input.lastSource === 'touch' ? 1 : 0;
  ui.touchFade += (wantTouch - ui.touchFade) * expDamp(6, dt);
}

function pill(ctx, x, y, w, h, r = h / 2) {
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, r);
  ctx.fill();
}

function paper(ctx, x, y, w, h) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.015);
  ctx.fillStyle = 'rgba(60,70,50,0.25)';
  ctx.beginPath();
  ctx.roundRect(4, 6, w, h, 6);
  ctx.fill();
  ctx.fillStyle = C.paper;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(74,67,54,0.15)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

export function drawTodoList(ctx, game, w, h) {
  const ui = game.ui;
  const list = game.tasks.list.filter((t) => t.revealed);
  ctx.font = `13px ${FONT}`;
  const pw = Math.max(252, ...list.map((t) => ctx.measureText(taskText(t)).width + 52));
  const ph = 46 + list.length * 26;
  const x = 16 - (1 - ui.listSlide) * (pw + 80);
  const y = 16;
  paper(ctx, x, y, pw, ph);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.015);
  ctx.fillStyle = C.ink;
  ctx.font = `bold 17px ${FONT}`;
  ctx.fillText('To do:', 16, 28);
  ctx.font = `13px ${FONT}`;
  list.forEach((t, i) => {
    const ty = 52 + i * 26;
    const text = taskText(t);
    const wob = Math.sin(i * 2.7) * 1.4;
    ctx.fillStyle = t.done ? 'rgba(74,67,54,0.45)' : C.ink;
    ctx.fillText(text, 34, ty + wob);
    ctx.strokeStyle = 'rgba(74,67,54,0.6)';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(14, ty - 11 + wob, 12, 12);
    if (t.done) {
      const prog = t.tickT < 0 ? 1 : clamp(t.tickT * 3, 0, 1);
      const tw = ctx.measureText(text).width;
      ctx.strokeStyle = 'rgba(74,67,54,0.55)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(32, ty - 4 + wob);
      ctx.lineTo(32 + (tw + 4) * prog, ty - 4.5 + wob);
      ctx.stroke();
      ctx.strokeStyle = C.tick;
      ctx.lineWidth = 2.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(16, ty - 5 + wob);
      const p2 = clamp(prog * 2, 0, 1), p3 = clamp(prog * 2 - 1, 0, 1);
      ctx.lineTo(16 + 4 * p2, ty - 5 + 4 * p2 + wob);
      if (p3 > 0) ctx.lineTo(20 + 8 * p3, ty - 1 - 10 * p3 + wob);
      ctx.stroke();
    }
  });
  ctx.restore();
  // collapsed tab hint
  if (ui.listSlide < 0.5 && ui.touchFade < 0.5) {
    ctx.fillStyle = C.uiPill;
    pill(ctx, 74, 30, 116, 28);
    ctx.fillStyle = C.white;
    ctx.font = `12px ${FONT}`;
    ctx.textAlign = 'center';
    const done = game.tasks.list.filter((t) => t.done).length;
    ctx.fillText(`Tab · to-do ${done}/${game.tasks.list.length}`, 74, 34);
    ctx.textAlign = 'left';
  }
}

export function drawPrompt(ctx, game, w, h) {
  if (!game.prompt || game.state !== 'playing') return;
  const key = game.input.lastSource === 'touch' ? '' : 'Space · ';
  const text = key + game.prompt.text;
  ctx.font = `14px ${FONT}`;
  const tw = ctx.measureText(text).width;
  ctx.fillStyle = C.uiPill;
  pill(ctx, w / 2, h - 46 - game.ui.touchFade * 60, tw + 34, 32);
  ctx.fillStyle = C.white;
  ctx.textAlign = 'center';
  ctx.fillText(text, w / 2, h - 41 - game.ui.touchFade * 60);
  ctx.textAlign = 'left';
}

export function drawBanner(ctx, game, w) {
  const b = game.ui.banner;
  if (!b) return;
  const a = clamp(b.t / 0.4, 0, 1) * clamp((3.4 - b.t) / 0.3, 0, 1);
  ctx.globalAlpha = a;
  ctx.font = `bold 16px ${FONT}`;
  const tw = ctx.measureText(b.text).width;
  ctx.fillStyle = C.uiPill;
  pill(ctx, w / 2, 40, tw + 60, 36);
  ctx.fillStyle = '#b6e3a8';
  ctx.textAlign = 'center';
  ctx.fillText('✓  ' + b.text, w / 2, 45);
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
}

export function drawHints(ctx, game, w, h) {
  const ui = game.ui;
  if (game.state !== 'playing' || ui.hintT <= 0 || ui.touchFade > 0.5) return;
  ctx.globalAlpha = clamp(ui.hintT, 0, 1) * 0.85;
  ctx.fillStyle = C.uiPill;
  ctx.font = `12px ${FONT}`;
  const text = 'WASD / arrows move · hold Shift to trot · Space action · Tab list · M mute';
  const tw = ctx.measureText(text).width;
  pill(ctx, w / 2, h - 16, tw + 28, 26);
  ctx.fillStyle = C.white;
  ctx.textAlign = 'center';
  ctx.fillText(text, w / 2, h - 12);
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
}

export function drawTouchControls(ctx, game) {
  const input = game.input;
  const a = game.ui.touchFade;
  if (a < 0.02 || game.state !== 'playing') return;
  ctx.globalAlpha = a * 0.85;
  if (input.joy) {
    const j = input.joy;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(j.ox, j.oy, 54, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(j.ox + j.dx, j.oy + j.dy, 26, 0, Math.PI * 2); ctx.fill();
  }
  const btns = input.buttons;
  const held = new Set([...input.pointers.values()].map((p) => p.role));
  for (const name of ['action', 'trot']) {
    const b = btns[name];
    ctx.fillStyle = held.has(name) ? 'rgba(255,255,255,0.5)' : 'rgba(40,50,35,0.45)';
    ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = C.white;
    ctx.font = `bold ${name === 'action' ? 15 : 12}px ${FONT}`;
    ctx.textAlign = 'center';
    const label = name === 'action'
      ? (game.prompt ? (game.prompt.icon === 'load' ? 'PICK UP' : 'TIP') : '·')
      : 'TROT';
    ctx.fillText(label, b.x, b.y + 5);
    ctx.textAlign = 'left';
  }
  const lb = btns.list;
  ctx.fillStyle = 'rgba(40,50,35,0.45)';
  ctx.beginPath(); ctx.arc(lb.x, lb.y, lb.r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.white;
  ctx.font = `bold 14px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('✓', lb.x, lb.y + 5);
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
}

export function drawTitle(ctx, game, w, h) {
  const t = game.ui.titleT;
  ctx.fillStyle = 'rgba(253, 249, 235, 0.2)';
  ctx.fillRect(0, 0, w, h);
  const cx = w / 2, cy = h * 0.38;
  paper(ctx, cx - 220, cy - 100, 440, 190);
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(Math.sin(t * 0.8) * 0.008);
  ctx.fillStyle = C.titleInk;
  ctx.textAlign = 'center';
  ctx.font = `bold 30px ${FONT}`;
  ctx.fillText('UNTITLED', 0, -46);
  ctx.font = `bold 38px ${FONT}`;
  ctx.fillText('WHEELBARROW GAME', 0, -6);
  ctx.font = `15px ${FONT}`;
  ctx.fillStyle = 'rgba(61,75,51,0.75)';
  ctx.fillText('a lovely afternoon in the garden', 0, 32);
  ctx.restore();
  const pulse = 0.6 + Math.sin(t * 3) * 0.25;
  ctx.globalAlpha = pulse;
  ctx.fillStyle = C.uiPill;
  ctx.font = `15px ${FONT}`;
  ctx.textAlign = 'center';   // the restore above reset this along with the transform
  const msg = 'press any key, or tap, to begin';
  const tw = ctx.measureText(msg).width;
  pill(ctx, cx, h * 0.72, tw + 44, 36);
  ctx.fillStyle = C.white;
  ctx.fillText(msg, cx, h * 0.72 + 5);
  ctx.globalAlpha = 1;
  ctx.textAlign = 'left';
}

export function drawEnding(ctx, game, w, h) {
  const t = game.ui.endT;
  const fade = clamp(t / 1.2, 0, 0.35);
  ctx.fillStyle = `rgba(255, 240, 200, ${fade})`;
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  if (t > 1) {
    ctx.globalAlpha = clamp((t - 1) / 1, 0, 1);
    ctx.fillStyle = C.titleInk;
    ctx.font = `bold 40px ${FONT}`;
    ctx.fillText('A lovely day.', w / 2, h * 0.3);
    ctx.font = `16px ${FONT}`;
    ctx.fillStyle = 'rgba(61,75,51,0.85)';
    ctx.fillText('Everything on the list, done before tea.', w / 2, h * 0.3 + 36);
    ctx.globalAlpha = 1;
  }
  if (t > 3.5) {
    const pulse = 0.55 + Math.sin(t * 3) * 0.25;
    ctx.globalAlpha = pulse;
    ctx.fillStyle = C.uiPill;
    ctx.font = `15px ${FONT}`;
    const msg = 'press anything to play again';
    const tw = ctx.measureText(msg).width;
    pill(ctx, w / 2, h * 0.8, tw + 44, 36);
    ctx.fillStyle = C.white;
    ctx.fillText(msg, w / 2, h * 0.8 + 5);
    ctx.globalAlpha = 1;
  }
  ctx.textAlign = 'left';
}
