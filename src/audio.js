import { rand, pick, clamp } from './utils.js';

// All sound is synthesized: tiny blips, filtered noise, and slow loops.
export function makeAudio() {
  return {
    ctx: null, master: null, sfx: null, amb: null, music: null,
    muted: false, nextChirp: 0, nextCoo: 20, rattleCd: 0,
    loops: {},
    bar: 0, nextBar: 0,
  };
}

export function ensureAudio(au) {
  if (au.ctx) {
    if (au.ctx.state === 'suspended') au.ctx.resume();
    return;
  }
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  au.ctx = ctx;
  au.master = ctx.createGain();
  au.master.gain.value = au.muted ? 0 : 0.5;
  au.master.connect(ctx.destination);
  au.sfx = ctx.createGain();
  au.sfx.connect(au.master);
  au.amb = ctx.createGain();
  au.amb.gain.value = 0.8;
  au.amb.connect(au.master);
  au.music = ctx.createGain();
  au.music.gain.value = 0.5;
  au.music.connect(au.master);

  const len = ctx.sampleRate;
  au.noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = au.noise.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  const loop = (filterType, freq, q = 1) => {
    const src = ctx.createBufferSource();
    src.buffer = au.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(au.amb);
    src.start();
    return g;
  };
  au.loops.breeze = loop('lowpass', 420);
  au.loops.breeze.gain.value = 0.02;
  au.loops.gravel = loop('bandpass', 900, 0.8);
  au.loops.snore = loop('lowpass', 260);
  au.loops.hiss = loop('highpass', 3400);
  au.nextChirp = ctx.currentTime + 1;
  au.nextBar = ctx.currentTime + 0.8;
}

// ---------------------------------------------------------------------------
// Music: a slow generative pastoral in D, built from a four-bar chord loop with
// a sparse music-box melody over it. Never quite repeats, stays out of the way.

const BAR = 3.9;

// D3 A3 D4 E4 ... written out as plain frequencies so there is no note table
const PROG = [
  { bass: 73.42, pad: [146.83, 220.00, 293.66, 329.63] },   // Dadd9
  { bass: 98.00, pad: [196.00, 246.94, 293.66, 369.99] },   // Gmaj7
  { bass: 82.41, pad: [164.81, 196.00, 246.94, 293.66] },   // Em7
  { bass: 110.00, pad: [220.00, 293.66, 329.63, 369.99] },  // A6sus
];
// D major pentatonic, two octaves
const MELODY = [293.66, 329.63, 369.99, 440.00, 493.88, 587.33, 659.25, 739.99];

function pad(au, freqs, when, dur) {
  const ctx = au.ctx;
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(700, when);
  filt.frequency.linearRampToValueAtTime(1150, when + dur * 0.5);
  filt.frequency.linearRampToValueAtTime(650, when + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(0.05, when + dur * 0.35);   // slow swell
  g.gain.setValueAtTime(0.05, when + dur * 0.6);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  filt.connect(g).connect(au.music);
  for (const f of freqs) {
    for (const detune of [-3, 3]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = f;
      o.detune.value = detune;
      o.connect(filt);
      o.start(when);
      o.stop(when + dur + 0.1);
    }
  }
}

function bassNote(au, freq, when, dur) {
  const ctx = au.ctx;
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(0.075, when + 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  o.connect(g).connect(au.music);
  o.start(when);
  o.stop(when + dur + 0.1);
}

// struck music-box tone: fundamental plus two inharmonic partials
function bell(au, freq, when, gain = 0.085) {
  const ctx = au.ctx;
  for (const [mul, amp, dur] of [[1, 1, 2.6], [2.01, 0.34, 1.5], [3.02, 0.14, 0.9]]) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq * mul;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(gain * amp, when + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g).connect(au.music);
    o.start(when);
    o.stop(when + dur + 0.1);
  }
}

// Where you are colours the music: the orchard end sits lower and broods a
// little, the pond is airier, the house end is busiest.
export const MOODS = {
  lawn: { shift: 1, bell: 1, rest: 0.30 },
  orchard: { shift: 0.75, bell: 0.6, rest: 0.45 },
  pond: { shift: 1.5, bell: 1.4, rest: 0.36 },
  house: { shift: 1, bell: 1.2, rest: 0.24 },
};

function scheduleBar(au, when, bar, mood) {
  const chord = PROG[bar % PROG.length];
  pad(au, chord.pad.map((f) => f * mood.shift), when, BAR * 1.02);
  bassNote(au, chord.bass * mood.shift, when, BAR * 0.85);

  // melody: a short phrase, a single held note, or nothing at all
  const roll = Math.random();
  if (roll < mood.rest) return;                 // let the birds have a bar
  const beat = BAR / 4;
  const g = 0.062 * mood.bell;
  if (roll < mood.rest + 0.32) {
    bell(au, pick(MELODY.slice(2, 7)) * mood.shift, when + beat * (Math.random() < 0.5 ? 0 : 2), g * 1.2);
  } else {
    const start = Math.random() < 0.5 ? 0 : 1;
    const n = 2 + Math.floor(Math.random() * 3);
    let idx = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      idx = clamp(idx + (Math.floor(Math.random() * 3) - 1), 0, MELODY.length - 1);
      bell(au, MELODY[idx] * mood.shift, when + beat * (start + i * 0.5) + rand(-0.02, 0.02), g);
    }
  }
}

export function moodFor(game) {
  const p = game.player;
  if (!p) return MOODS.lawn;
  if (p.x > 2200 && p.y < 900) return MOODS.orchard;
  if (game.world && Math.hypot(p.x - game.world.pond.x, p.y - game.world.pond.y) < 420) return MOODS.pond;
  if (p.x < 760 && p.y < 700) return MOODS.house;
  return MOODS.lawn;
}

export function updateMusic(au, mood = MOODS.lawn) {
  if (!au.ctx || !au.music) return;
  const now = au.ctx.currentTime;
  // if the tab was hidden the loop stalls; pick up from now rather than
  // dumping every missed bar into the graph at once
  if (au.nextBar < now - BAR) au.nextBar = now + 0.1;
  while (au.nextBar < now + 1.0) {
    scheduleBar(au, au.nextBar, au.bar++, mood);
    au.nextBar += BAR;
  }
}

export function toggleMute(au) {
  au.muted = !au.muted;
  if (au.master) au.master.gain.value = au.muted ? 0 : 0.5;
  return au.muted;
}

function blip(au, freq, dur, { type = 'sine', slideTo, gain = 0.12, when = 0, pan = 0, attack = 0.006 } = {}) {
  if (!au.ctx) return;
  const ctx = au.ctx;
  const t = ctx.currentTime + when;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  if (p) { p.pan.value = pan; o.connect(g).connect(p).connect(au.sfx); }
  else o.connect(g).connect(au.sfx);
  o.start(t);
  o.stop(t + dur + 0.05);
}

function noiseBurst(au, dur, { freq = 1500, q = 1, gain = 0.1, when = 0 } = {}) {
  if (!au.ctx) return;
  const ctx = au.ctx;
  const t = ctx.currentTime + when;
  const src = ctx.createBufferSource();
  src.buffer = au.noise;
  src.playbackRate.value = rand(0.8, 1.2);
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(au.sfx);
  src.start(t);
  src.stop(t + dur + 0.05);
}

const PENTA = [523, 587, 659, 784, 880];

function giggle(au, base) {
  const n = Math.floor(rand(3, 6));
  for (let i = 0; i < n; i++) {
    const f = pick(PENTA) * base;
    blip(au, f, 0.09, { gain: 0.07, when: i * rand(0.06, 0.1), slideTo: f * 1.3 });
  }
}

function ding(au) {
  for (const [f, w] of [[1318, 0], [1760, 0.14]]) {
    blip(au, f, 0.7, { gain: 0.1, when: w });
    blip(au, f * 2.76, 0.4, { gain: 0.03, when: w });
  }
}

function bark(au, small) {
  blip(au, rand(280, 340), 0.09, { type: 'sawtooth', slideTo: 110, gain: small ? 0.08 : 0.16 });
  noiseBurst(au, 0.07, { freq: 900, gain: small ? 0.04 : 0.08 });
}

export function attachAudio(game) {
  const au = game.audio;
  const ev = game.events;
  ev.on('squeak', ({ v }) => blip(au, rand(1050, 1350), 0.08, { slideTo: 800, gain: clamp(v / 190, 0, 1) * 0.045 }));
  ev.on('load', () => { blip(au, 330, 0.12, { slideTo: 520, gain: 0.08 }); giggle(au, 1); });
  ev.on('unload', ({ spot }) => {
    blip(au, 520, 0.12, { slideTo: 330, gain: 0.07 });
    if (spot === 'pool') { noiseBurst(au, 0.35, { freq: 2400, gain: 0.12 }); giggle(au, 1.1); }
  });
  ev.on('tip-start', () => blip(au, 220, 0.25, { type: 'triangle', slideTo: 140, gain: 0.05 }));
  ev.on('spill', () => {
    blip(au, 85, 0.18, { type: 'sine', gain: 0.18 });
    noiseBurst(au, 0.12, { freq: 500, gain: 0.09 });
    giggle(au, 0.9);
    giggle(au, 1.2);
  });
  ev.on('apple', () => blip(au, rand(600, 750), 0.09, { type: 'triangle', slideTo: 900, gain: 0.07 }));
  ev.on('apples-tipped', ({ n }) => {
    for (let i = 0; i < n; i++) blip(au, rand(500, 800), 0.07, { type: 'triangle', when: i * 0.07, gain: 0.06 });
  });
  ev.on('task-done', () => ding(au));
  ev.on('task-reveal', () => { blip(au, 660, 0.3, { gain: 0.06 }); blip(au, 880, 0.4, { gain: 0.06, when: 0.18 }); });
  ev.on('bark', () => bark(au, false));
  ev.on('dog-woke', () => bark(au, true));
  ev.on('bump', () => { blip(au, 120, 0.1, { gain: 0.1 }); noiseBurst(au, 0.06, { freq: 400, gain: 0.05 }); });
  ev.on('clunk', () => blip(au, 160, 0.12, { type: 'square', slideTo: 90, gain: 0.05 }));
  ev.on('soaked', () => { noiseBurst(au, 0.4, { freq: 3000, gain: 0.12 }); giggle(au, 1.3); });
  ev.on('trample', () => noiseBurst(au, 0.2, { freq: 700, gain: 0.06 }));
  ev.on('quack', () => blip(au, 320, 0.14, { type: 'sawtooth', slideTo: 240, gain: 0.05 }));
  ev.on('pipe-turn', () => {
    blip(au, rand(200, 260), 0.09, { type: 'square', slideTo: 150, gain: 0.05 });
    noiseBurst(au, 0.05, { freq: 1200, gain: 0.04 });
  });
  ev.on('greenhouse-enter', () => blip(au, 300, 0.2, { type: 'triangle', slideTo: 420, gain: 0.05 }));
  ev.on('greenhouse-leave', () => blip(au, 420, 0.2, { type: 'triangle', slideTo: 300, gain: 0.05 }));
  ev.on('greenhouse-solved', () => {
    noiseBurst(au, 0.9, { freq: 2600, gain: 0.07 });   // water finding its way
    [523, 659, 784].forEach((f, i) => blip(au, f, 0.5, { gain: 0.08, when: i * 0.16 }));
  });
  ev.on('teatime', () => {
    [523, 659, 784, 1046].forEach((f, i) => blip(au, f, 0.5, { gain: 0.09, when: i * 0.18 }));
  });
}

export function updateAudio(game, dt) {
  const au = game.audio;
  if (!au.ctx) return;
  const t = au.ctx.currentTime;
  updateMusic(au, moodFor(game));
  // pull the music back while the barrow is really shifting, so the wheel and
  // the giggling have room, and swell it again for the picnic
  const busy = clamp(game.player.v / 190, 0, 1);
  const want = game.state === 'ending' ? 0.75 : 0.5 - busy * 0.22;
  au.music.gain.value += (want - au.music.gain.value) * Math.min(1, dt * 1.5);

  // birdsong phrases
  if (t > au.nextChirp) {
    au.nextChirp = t + rand(1.8, 6.5);
    const n = Math.floor(rand(2, 6));
    const base = rand(2200, 4200);
    for (let i = 0; i < n; i++) {
      const f = base * rand(0.85, 1.2);
      blip(au, f, rand(0.06, 0.14), { gain: 0.035, when: i * rand(0.09, 0.16), slideTo: f * pick([0.7, 1.4]), pan: rand(-0.8, 0.8) });
    }
  }
  if (t > au.nextCoo) {
    au.nextCoo = t + rand(14, 30);
    blip(au, 360, 0.25, { type: 'triangle', slideTo: 300, gain: 0.05 });
    blip(au, 330, 0.4, { type: 'triangle', slideTo: 280, gain: 0.05, when: 0.32 });
  }

  const p = game.player;
  const smooth = (node, target) => {
    node.gain.value += (target - node.gain.value) * Math.min(1, dt * 8);
  };
  smooth(au.loops.gravel, p.surface.type === 'gravel' ? clamp(p.v / 190, 0, 1) * 0.16 : 0);

  const dogD = Math.hypot(game.dog.x - p.x, game.dog.y - p.y);
  const snoring = game.dog.state === 'sleep' && dogD < 260;
  smooth(au.loops.snore, snoring ? (1 - dogD / 260) * 0.14 * (0.6 + 0.4 * Math.sin(game.time * 2.2)) : 0);

  const s = game.world.sprinkler;
  const sd = Math.hypot(s.x - p.x, s.y - p.y);
  smooth(au.loops.hiss, sd < 320 ? (1 - sd / 320) * 0.05 : 0);

  // footsteps, paced by the walk cycle and coloured by what is underfoot
  const surf = p.surface.type;
  au.stepCd = (au.stepCd || 0) - dt * (p.v > 4 ? p.v / 60 : 0);
  if (p.v > 12 && au.stepCd <= 0) {
    au.stepCd = 1;
    const hard = surf === 'gravel' || surf === 'patio';
    noiseBurst(au, hard ? 0.05 : 0.07, {
      freq: hard ? 2100 : 620,
      gain: (hard ? 0.035 : 0.026) * clamp(p.v / 150, 0.35, 1),
    });
    if (surf === 'mud') blip(au, rand(150, 200), 0.08, { type: 'sine', slideTo: 90, gain: 0.03 });
  }

  au.rattleCd -= dt;
  if (Math.abs(p.roll) > 0.33 && p.v > 40 && au.rattleCd <= 0) {
    au.rattleCd = 0.07;
    noiseBurst(au, 0.03, { freq: 1800, gain: 0.04 });
  }
}
