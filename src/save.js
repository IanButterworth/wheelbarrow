// Everything that survives a refresh: what you have found before, and how you
// like the game set up. Never throws, because private browsing can refuse.
const KEY = 'wheelbarrow.save.v1';

export const DEFAULT_KEYS = {
  up: ['KeyW', 'ArrowUp'],
  down: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
  action: ['Space', 'KeyE'],
  trot: ['ShiftLeft', 'ShiftRight'],
  list: ['Tab', 'KeyL'],
  pause: ['Escape', 'KeyP'],
  mute: ['KeyM'],
};

export const KEY_LABELS = {
  up: 'Walk up', down: 'Walk down', left: 'Walk left', right: 'Walk right',
  action: 'Pick up / tip out', trot: 'Trot', list: 'To-do list',
  pause: 'Pause', mute: 'Mute',
};

function blank() {
  return {
    finished: 0,
    bestMs: null,
    extras: {},
    opts: { muted: false, reducedMotion: false, keys: null },
  };
}

export function loadSave() {
  const s = blank();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return s;
    const got = JSON.parse(raw);
    if (got && typeof got === 'object') {
      s.finished = Number(got.finished) || 0;
      s.bestMs = typeof got.bestMs === 'number' ? got.bestMs : null;
      s.extras = got.extras && typeof got.extras === 'object' ? got.extras : {};
      if (got.opts && typeof got.opts === 'object') Object.assign(s.opts, got.opts);
    }
  } catch { /* storage unavailable or corrupt: play with defaults */ }
  return s;
}

export function writeSave(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* nothing to be done */ }
}

export function keyBinds(save) {
  const k = { ...DEFAULT_KEYS };
  const custom = save.opts.keys;
  if (custom) for (const name of Object.keys(DEFAULT_KEYS)) {
    if (Array.isArray(custom[name]) && custom[name].length) k[name] = custom[name].slice(0, 2);
  }
  return k;
}

export const formatTime = (ms) => {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

// "ShiftLeft" reads badly on a menu row
export function keyLabel(code) {
  if (!code) return '—';
  return code
    .replace(/^Key/, '')
    .replace(/^Digit/, '')
    .replace(/^Arrow/, '')
    .replace('Left', ' L').replace('Right', ' R')
    .replace('Space', 'Space')
    .replace('Escape', 'Esc');
}
