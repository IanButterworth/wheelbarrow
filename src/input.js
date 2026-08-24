import { clamp } from './utils.js';
import { DEFAULT_KEYS } from './save.js';

// Unified keyboard + touch input. Everything downstream reads input.snap only.
export function makeInput(canvas, binds = DEFAULT_KEYS) {
  const input = {
    keys: new Set(),
    binds,                 // remappable, see save.js
    pointers: new Map(),   // pointerId -> {role, x, y}
    joy: null,             // {id, ox, oy, dx, dy}
    buttons: { action: { x: 0, y: 0, r: 46 }, trot: { x: 0, y: 0, r: 34 }, list: { x: 0, y: 0, r: 26 } },
    w: 1, h: 1,
    lastSource: 'key',
    touchSeen: false,
    grabKey: null,         // set while the options screen is listening for a key
    frame: { action: false, list: false, mute: false, pause: false, any: false, click: null },
    snap: { mx: 0, my: 0, mag: 0, action: false, actionHeld: false, trot: false, list: false, mute: false, pause: false, any: false, click: null },
  };

  const bound = (name, code) => input.binds[name] && input.binds[name].includes(code);

  window.addEventListener('keydown', (e) => {
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    // add before the repeat check: after a focus loss the only events for a
    // still-held key are repeats, and we would otherwise never re-register it
    input.keys.add(e.code);
    if (e.repeat) return;
    input.lastSource = 'key';
    // while rebinding, the next key press is the new binding and nothing else
    if (input.grabKey) { input.grabKey(e.code); input.grabKey = null; return; }
    input.frame.any = true;
    if (bound('action', e.code)) input.frame.action = true;
    if (bound('list', e.code)) input.frame.list = true;
    if (bound('mute', e.code)) input.frame.mute = true;
    if (bound('pause', e.code)) input.frame.pause = true;
  });
  window.addEventListener('keyup', (e) => input.keys.delete(e.code));
  const forgetAll = () => { input.keys.clear(); input.pointers.clear(); input.joy = null; };
  window.addEventListener('blur', forgetAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) forgetAll(); });
  // a pointer released off-canvas (or after a failed capture) must not leave
  // the virtual joystick stuck on
  window.addEventListener('pointerup', (e) => {
    if (input.pointers.has(e.pointerId)) {
      input.pointers.delete(e.pointerId);
      if (input.joy && input.joy.id === e.pointerId) input.joy = null;
    }
  });

  const hitButton = (x, y) => {
    for (const name of ['action', 'trot', 'list']) {
      const b = input.buttons[name];
      if (Math.hypot(x - b.x, y - b.y) <= b.r + 8) return name;
    }
    return null;
  };

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic events have no real pointer */ }
    // a pen implies a tablet, so treat it like a finger
    const touchLike = e.pointerType === 'touch' || e.pointerType === 'pen';
    if (touchLike) { input.touchSeen = true; input.lastSource = 'touch'; }
    input.frame.any = true;
    const x = e.clientX, y = e.clientY;
    input.frame.click = { x, y };   // menus hit-test this, whatever the device
    // The on-screen buttons belong to touch: a mouse must never hit them, or a
    // stray click near a corner tips the load out for no visible reason. Mouse
    // and trackpad still steer by dragging, anywhere on the canvas, and the
    // stick is drawn while they do so it is not an invisible control.
    const btn = touchLike ? hitButton(x, y) : null;
    if (btn) {
      input.pointers.set(e.pointerId, { role: btn, x, y });
      if (btn === 'action') input.frame.action = true;
      if (btn === 'list') input.frame.list = true;
    } else if (!input.joy && (!touchLike || x < input.w * 0.62)) {
      input.joy = { id: e.pointerId, ox: x, oy: y, dx: 0, dy: 0 };
      input.pointers.set(e.pointerId, { role: 'joy', x, y });
    } else {
      input.pointers.set(e.pointerId, { role: 'none', x, y });
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = input.pointers.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX; p.y = e.clientY;
    if (input.joy && input.joy.id === e.pointerId) {
      const j = input.joy;
      let dx = e.clientX - j.ox, dy = e.clientY - j.oy;
      const len = Math.hypot(dx, dy);
      const max = 60;
      if (len > max) { dx *= max / len; dy *= max / len; }
      j.dx = dx; j.dy = dy;
    }
  });
  const release = (e) => {
    input.pointers.delete(e.pointerId);
    if (input.joy && input.joy.id === e.pointerId) input.joy = null;
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return input;
}

export function updateInput(input, w, h) {
  input.w = w; input.h = h;
  const b = input.buttons;
  b.action.x = w - 78; b.action.y = h - 100;
  b.trot.x = w - 178; b.trot.y = h - 62;
  b.list.x = w - 44; b.list.y = 42;

  const k = input.keys;
  const held = (name) => input.binds[name].some((c) => k.has(c));
  let mx = 0, my = 0;
  if (held('left')) mx -= 1;
  if (held('right')) mx += 1;
  if (held('up')) my -= 1;
  if (held('down')) my += 1;
  let mag = 0;
  if (mx || my) {
    const len = Math.hypot(mx, my);
    mx /= len; my /= len;
    mag = 1;
  } else if (input.joy) {
    const len = Math.hypot(input.joy.dx, input.joy.dy);
    if (len > 6) {
      mx = input.joy.dx / len; my = input.joy.dy / len;
      mag = clamp((len - 6) / 48, 0, 1);
    }
  }

  let trotBtn = false, actionBtn = false;
  for (const p of input.pointers.values()) {
    if (p.role === 'trot') trotBtn = true;
    if (p.role === 'action') actionBtn = true;
  }

  const s = input.snap;
  s.mx = mx; s.my = my; s.mag = mag;
  s.trot = held('trot') || trotBtn;
  s.actionHeld = held('action') || actionBtn;
  s.action = input.frame.action;
  s.list = input.frame.list;
  s.mute = input.frame.mute;
  s.pause = input.frame.pause;
  s.any = input.frame.any;
  s.click = input.frame.click;
  input.frame.action = input.frame.list = input.frame.mute = input.frame.pause = input.frame.any = false;
  input.frame.click = null;
}
