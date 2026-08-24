import { clamp, lerp, expDamp, TAU } from './utils.js';
import { C } from './palette.js';
import { FONT } from './sprites.js';
import { taskText } from './tasks.js';
import { KEY_LABELS, keyLabel, formatTime } from './save.js';

export function makeUI() {
  return {
    listOpen: false, listSlide: 0, autoT: 4,
    banner: null, hintT: 16, titleT: 0, endT: 0, touchFade: 0,
    menuRects: [], rebinding: null,
  };
}

// Menu rows are laid out and hit-tested from the same list, so a button can
// never drift away from the thing it activates.
function menuButton(ui, ctx, label, x, y, w, h, opts = {}) {
  const hot = opts.hot;
  ctx.fillStyle = hot ? 'rgba(120,150,100,0.9)' : 'rgba(253,251,244,0.92)';
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(74,67,54,0.28)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.fillStyle = hot ? C.white : C.ink;
  ctx.font = `${opts.size || 15}px ${FONT}`;
  ctx.textAlign = opts.align || 'center';
  ctx.fillText(label, opts.align === 'left' ? x - w / 2 + 14 : x, y + 5);
  ctx.textAlign = 'left';
  if (opts.id) ui.menuRects.push({ id: opts.id, x, y, w, h });
}

export function menuHit(ui, cx, cy) {
  for (const r of ui.menuRects) {
    if (Math.abs(cx - r.x) <= r.w / 2 && Math.abs(cy - r.y) <= r.h / 2) return r.id;
  }
  return null;
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
  const all = game.tasks.list.filter((t) => t.revealed);
  const list = all.filter((t) => !t.extra);
  const extras = all.filter((t) => t.extra);
  ctx.font = `13px ${FONT}`;
  const pw = Math.max(252, ...all.map((t) => ctx.measureText(taskText(t)).width + 52));
  const ph = 46 + list.length * 26 + (extras.length ? 22 + extras.length * 26 : 0);
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
  const line = (t, ty, i) => {
    const text = taskText(t);
    const wob = Math.sin(i * 2.7) * 1.4;
    ctx.fillStyle = t.done ? 'rgba(74,67,54,0.45)' : C.ink;
    ctx.fillText(text, 34, ty + wob);
    ctx.strokeStyle = 'rgba(74,67,54,0.6)';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(14, ty - 11 + wob, 12, 12);
    if (!t.done) return;
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
  };
  list.forEach((t, i) => line(t, 52 + i * 26, i));
  if (extras.length) {
    const base = 52 + list.length * 26;
    ctx.fillStyle = 'rgba(74,67,54,0.5)';
    ctx.font = `12px ${FONT}`;
    ctx.fillText('if you have a minute:', 16, base + 8);
    ctx.font = `13px ${FONT}`;
    extras.forEach((t, i) => line(t, base + 30 + i * 26, list.length + i));
  }
  ctx.restore();
  // collapsed tab hint
  if (ui.listSlide < 0.5 && ui.touchFade < 0.5) {
    ctx.fillStyle = C.uiPill;
    pill(ctx, 74, 30, 116, 28);
    ctx.fillStyle = C.white;
    ctx.font = `12px ${FONT}`;
    ctx.textAlign = 'center';
    const main = game.tasks.list.filter((t) => !t.extra);
    const done = main.filter((t) => t.done).length;
    ctx.fillText(`Tab · to-do ${done}/${main.length}`, 74, 34);
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
  const text = 'WASD, arrows, or drag to move · hold Shift to trot · Space action · Tab list · M mute';
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
  if (game.state !== 'playing') return;
  // The steering stick is drawn whenever one exists, mouse or finger, so that
  // drag-to-move is always visible feedback rather than a hidden control.
  if (input.joy) {
    const j = input.joy;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath(); ctx.arc(j.ox, j.oy, 54, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.beginPath(); ctx.arc(j.ox + j.dx, j.oy + j.dy, 26, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }
  const a = game.ui.touchFade;
  if (a < 0.02) return;
  ctx.globalAlpha = a * 0.85;
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

// A sheet of the same note paper the to-do list is written on, centred on the
// origin so callers own the transform. One horizontal crease: it has been
// folded in a pocket and smoothed out again.
function noteSheet(ctx, nw, nh) {
  const x = -nw / 2, y = -nh / 2;
  ctx.fillStyle = 'rgba(55, 70, 45, 0.22)';
  ctx.beginPath();
  ctx.roundRect(x + 5, y + 8, nw, nh, 7);
  ctx.fill();
  ctx.fillStyle = C.paper;
  ctx.beginPath();
  ctx.roundRect(x, y, nw, nh, 7);
  ctx.fill();
  // the crease, with the paper catching a little light just below it. It sits
  // in the gap under the title block, never across the lettering.
  const fold = y + nh * 0.56;
  const shade = ctx.createLinearGradient(0, fold - 16, 0, fold + 16);
  shade.addColorStop(0, 'rgba(120, 110, 88, 0)');
  shade.addColorStop(0.5, 'rgba(120, 110, 88, 0.13)');
  shade.addColorStop(0.52, 'rgba(255, 253, 245, 0.5)');
  shade.addColorStop(1, 'rgba(255, 253, 245, 0)');
  ctx.fillStyle = shade;
  ctx.fillRect(x, fold - 16, nw, 32);
  ctx.strokeStyle = 'rgba(74, 67, 54, 0.18)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + 1, fold);
  ctx.lineTo(x + nw - 1, fold);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(74, 67, 54, 0.16)';
  ctx.beginPath();
  ctx.roundRect(x, y, nw, nh, 7);
  ctx.stroke();
}

// biro sketch of the barrow, drawn about (0, 0), facing right
function inkBarrow(ctx, s) {
  ctx.save();
  ctx.scale(s, s);
  ctx.strokeStyle = 'rgba(74, 67, 54, 0.75)';
  ctx.lineWidth = 2.1;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();          // tub
  ctx.moveTo(-20, -9);
  ctx.lineTo(13, -12);
  ctx.lineTo(19, 3);
  ctx.lineTo(-13, 5);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();          // handles and leg
  ctx.moveTo(-19, -6); ctx.lineTo(-34, -1);
  ctx.moveTo(-14, 3); ctx.lineTo(-30, 6);
  ctx.moveTo(-11, 5); ctx.lineTo(-13, 13);
  ctx.stroke();
  ctx.beginPath();          // wheel
  ctx.arc(13, 10, 7, 0, TAU);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(90, 130, 70, 0.75)';   // a flower riding along in it
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.moveTo(0, -10);
  ctx.quadraticCurveTo(2, -20, 6, -25);
  ctx.stroke();
  ctx.fillStyle = 'rgba(199, 125, 174, 0.8)';
  ctx.beginPath();
  ctx.arc(7, -27, 4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

export function drawPause(ctx, game, w, h) {
  const ui = game.ui;
  ui.menuRects = [];
  ctx.fillStyle = 'rgba(40, 54, 34, 0.5)';
  ctx.fillRect(0, 0, w, h);

  const binds = game.input.binds;
  const rows = Object.keys(KEY_LABELS);
  const NW = 430, NH = 252 + rows.length * 30;   // room for the two buttons below the rows
  const s = Math.min(1, (w - 60) / NW, (h - 40) / NH);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(s, s);

  ctx.fillStyle = 'rgba(55, 70, 45, 0.25)';
  ctx.beginPath(); ctx.roundRect(-NW / 2 + 5, -NH / 2 + 7, NW, NH, 8); ctx.fill();
  ctx.fillStyle = C.paper;
  ctx.beginPath(); ctx.roundRect(-NW / 2, -NH / 2, NW, NH, 8); ctx.fill();

  ctx.fillStyle = C.titleInk;
  ctx.font = `bold 26px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText('A quiet moment', 0, -NH / 2 + 40);
  ctx.textAlign = 'left';

  let y = -NH / 2 + 74;
  menuButton(ui, ctx, `Gentler motion: ${game.opts.reducedMotion ? 'on' : 'off'}`, 0, y, 300, 28, { id: 'motion' });
  y += 34;
  menuButton(ui, ctx, `Sound: ${game.audio.muted ? 'off' : 'on'}`, 0, y, 300, 28, { id: 'sound' });
  y += 40;

  ctx.fillStyle = 'rgba(74,67,54,0.55)';
  ctx.font = `12px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.fillText(ui.rebinding ? 'press a key…' : 'controls (click to change)', 0, y - 6);
  ctx.textAlign = 'left';
  y += 12;

  for (const name of rows) {
    ctx.fillStyle = C.ink;
    ctx.font = `13px ${FONT}`;
    ctx.fillText(KEY_LABELS[name], -NW / 2 + 26, y + 5);
    const label = ui.rebinding === name ? '…' : binds[name].map(keyLabel).join(' / ');
    menuButton(ui, ctx, label, NW / 2 - 110, y, 170, 24,
      { id: `bind:${name}`, size: 12, hot: ui.rebinding === name });
    y += 30;
  }

  y += 12;
  menuButton(ui, ctx, 'Resume', -78, y, 140, 30, { id: 'resume' });
  menuButton(ui, ctx, 'Start again', 78, y, 140, 30, { id: 'restart' });

  // menu rects were built in the scaled/translated space; convert to screen
  for (const r of ui.menuRects) {
    r.x = w / 2 + r.x * s; r.y = h / 2 + r.y * s;
    r.w *= s; r.h *= s;
  }
  ctx.restore();
  ctx.textAlign = 'left';
}

export function drawTitle(ctx, game, w, h) {
  const t = game.ui.titleT;
  // vignette rather than a flat wash, so the garden keeps its colour
  const vig = ctx.createRadialGradient(w / 2, h * 0.42, Math.min(w, h) * 0.2, w / 2, h * 0.42, Math.max(w, h) * 0.72);
  vig.addColorStop(0, 'rgba(253, 249, 235, 0.16)');
  vig.addColorStop(1, 'rgba(48, 62, 40, 0.32)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);

  const NW = 470, NH = 300;
  const s = Math.min(1, (w - 76) / NW, (h - 60) / (NH * 1.25));
  ctx.save();
  ctx.translate(w / 2, h * 0.44);
  ctx.rotate(-0.018 + Math.sin(t * 0.55) * 0.007);   // paper and ink as one
  ctx.scale(s, s);

  noteSheet(ctx, NW, NH);

  // "untitled" sits at a slight angle, as though pencilled in above the title
  ctx.textAlign = 'center';
  ctx.save();
  ctx.translate(-6, -104);
  ctx.rotate(-0.055);
  ctx.fillStyle = 'rgba(74, 67, 54, 0.6)';
  ctx.font = `24px ${FONT}`;
  ctx.fillText('untitled', 0, 0);
  ctx.restore();

  ctx.fillStyle = C.titleInk;
  ctx.font = `bold 44px ${FONT}`;
  ctx.fillText('WHEELBARROW', 0, -56);
  ctx.fillText('GAME', 0, -10);

  ctx.fillStyle = 'rgba(61, 75, 51, 0.72)';
  ctx.font = `16px ${FONT}`;
  ctx.fillText('a lovely afternoon in the garden', 0, 46);

  ctx.save();
  ctx.translate(0, 88);
  ctx.rotate(0.05);
  inkBarrow(ctx, 1.15);
  ctx.restore();

  const msg = game.input.lastSource === 'touch' ? 'tap to begin' : 'press any key to begin';
  ctx.globalAlpha = 0.5 + Math.sin(t * 2.6) * 0.3;
  ctx.fillStyle = 'rgba(74, 67, 54, 0.8)';
  ctx.font = `14px ${FONT}`;
  ctx.fillText(msg, 0, 132);
  ctx.globalAlpha = 1;
  ctx.restore();

  // what the garden remembers about you, pencilled along the bottom
  const sv = game.save;
  if (sv.finished > 0) {
    const found = Object.keys(sv.extras).length;
    const bits = [`${sv.finished} afternoon${sv.finished === 1 ? '' : 's'} in the garden`];
    if (sv.bestMs) bits.push(`best ${formatTime(sv.bestMs)}`);
    bits.push(`${found}/3 extras found`);
    ctx.fillStyle = 'rgba(253, 251, 244, 0.85)';
    ctx.font = `13px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(bits.join('  ·  '), w / 2, h - 26);
  }
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
