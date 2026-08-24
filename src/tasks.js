import { dist } from './utils.js';
import { inShape } from './physics.js';
import { barrowCenter, WALK, TROT_MUL } from './player.js';

export function makeTasks() {
  const list = [
    {
      id: 'ride', text: 'Give Alfie a proper ride',
      state: { d: 0 },
      check(game, t, dt) {
        const alfie = game.children.find((k) => k.name === 'Alfie');
        if (alfie.state === 'carried') t.state.d += game.player.v * dt;
        return t.state.d > 900;
      },
    },
    {
      id: 'pool', text: 'Deliver Poppy to the paddling pool',
      onEvent(type, e) {
        return type === 'unload' && e.spot === 'pool' && e.kid.name === 'Poppy';
      },
    },
    {
      id: 'apples',
      textFn: (t) => `Tip 6 windfall apples into the crate (${t.state.n}/6)`,
      state: { n: 0 },
      onEvent(type, e, game, t) {
        if (type === 'apples-tipped') t.state.n = Math.min(6, t.state.n + e.n);
        return t.state.n >= 6;
      },
    },
    {
      id: 'soggy', text: 'Make somebody soggy in the sprinkler',
      check(game) {
        const p = game.player;
        if (p.cargo.kids.length === 0) return false;
        const s = game.world.sprinkler;
        const b = barrowCenter(p);
        const d = dist(b.x, b.y, s.x, s.y);
        if (d > s.reach + 20 || d < 14) return false;
        const toB = Math.atan2(b.y - s.y, b.x - s.x);
        let diff = toB - s.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) < 0.4) {
          game.events.emit('soaked', { x: b.x, y: b.y });
          for (const kid of p.cargo.kids) kid.bubble = { text: 'Eeek! Hee hee!', t: 2 };
          game.particles.burst('drip', b.x, b.y - 22, 14);
          return true;
        }
        return false;
      },
    },
    {
      id: 'wheee', text: 'Do a "wheee!" (full tilt, passenger aboard)',
      state: { t: 0 },
      check(game, t, dt) {
        const fast = game.player.v >= WALK * TROT_MUL * 0.92 && game.player.cargo.kids.length > 0;
        t.state.t = fast ? t.state.t + dt : 0;
        return t.state.t >= 3;
      },
    },
    {
      id: 'duck', text: 'The duck has got out. Barrow it home to the pond',
      onEvent(type, e) {
        return type === 'item-home' && e.kind === 'duck';
      },
    },
    {
      id: 'washing',
      textFn: (t) => `Peg the washing back on the line (${t.state.n}/3)`,
      state: { n: 1 },
      onEvent(type, e, game, t) {
        if (type === 'item-home' && e.kind === 'sheet') t.state.n = game.world.pegged;
        return t.state.n >= 3;
      },
    },
    {
      id: 'seedlings',
      textFn: (t) => `Barrow the seedlings to the veg patch (${t.state.n}/3)`,
      state: { n: 0 },
      onEvent(type, e, game, t) {
        if (type === 'item-home' && e.kind === 'pot') t.state.n++;
        return t.state.n >= 3;
      },
    },
    {
      id: 'sneak', text: 'Sneak past the dog without waking it',
      state: { inside: false, spoiled: false },
      check(game, t) {
        const st = t.state;
        const inZone = inShape({ kind: 'r', ...game.world.regions.dogZone }, game.player.x, game.player.y);
        const awake = game.dog.state !== 'sleep';
        if (inZone) {
          if (!st.inside) { st.inside = true; st.spoiled = awake; }
          if (awake) st.spoiled = true;
        } else if (st.inside) {
          st.inside = false;
          if (!st.spoiled) return true;
        }
        return false;
      },
    },
    {
      id: 'teatime', text: 'Bring everyone to the picnic. Teatime!',
      finale: true, revealed: false,
      check(game) {
        const bl = game.world.regions.blanket;
        const allSat = game.children.every((k) => k.settledAt === 'blanket');
        return allSat && dist(game.player.x, game.player.y, bl.x, bl.y) < 190;
      },
    },
    // Optional mischief. None of it gates the picnic; it is just there to be
    // found, and it is what carries over between visits to the garden.
    {
      id: 'gnome', text: 'Take the gnome for a ride', extra: true,
      onEvent: (type) => type === 'gnome-lifted',
    },
    {
      id: 'wake', text: 'Wake the dog on purpose', extra: true,
      onEvent: (type) => type === 'dog-woke',
    },
    {
      id: 'muddy', text: 'Get the barrow properly muddy', extra: true,
      state: { t: 0 },
      check(game, t, dt) {
        const p = game.player;
        t.state.t = p.surface.type === 'mud' && p.v > 70 ? t.state.t + dt : 0;
        return t.state.t > 1.6;
      },
    },
  ];
  for (const t of list) {
    t.done = false;
    t.tickT = -1;
    if (t.revealed === undefined) t.revealed = true;
    t.state ||= {};
  }
  return { list };
}

function complete(game, t) {
  t.done = true;
  t.tickT = 0;
  game.events.emit('task-done', { task: t });
  if (t.id === 'teatime') game.events.emit('teatime', {});
}

export function attachTasks(game) {
  game.events.on('*', (type, data) => {
    for (const t of game.tasks.list) {
      if (!t.done && t.revealed && t.onEvent && t.onEvent(type, data, game, t)) complete(game, t);
    }
  });
}

export function updateTasks(game, dt) {
  const list = game.tasks.list;
  for (const t of list) {
    if (t.done) {
      if (t.tickT >= 0) t.tickT += dt;
      continue;
    }
    if (!t.revealed) continue;
    if (t.check && t.check(game, t, dt)) complete(game, t);
  }
  const finale = list.find((t) => t.finale);
  if (!finale.revealed && list.every((t) => t.finale || t.extra || t.done)) {
    finale.revealed = true;
    game.events.emit('task-reveal', { task: finale });
  }
}

export const taskText = (t) => (t.textFn ? t.textFn(t) : t.text);
