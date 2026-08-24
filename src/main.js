import { makeEvents, dist, rand, expDamp, shortAngle } from './utils.js';
import { C } from './palette.js';
import { makeInput, updateInput } from './input.js';
import { makeCamera, updateCamera, clampCamera } from './camera.js';
import { makeWorld, updateWorld, drawGround } from './world.js';
import { makePlayer, updatePlayer, drawPlayer, drawBarrow, barrowCenter } from './player.js';
import { makeChild, updateChild } from './child.js';
import { makeDog, updateDog, wakeDog } from './dog.js';
import { makeGran, updateGran, granTut } from './grandparent.js';
import { makeParticles, updateParticles, drawParticles } from './particles.js';
import { updateItem, drawItem } from './items.js';
import { makeTasks, attachTasks, updateTasks } from './tasks.js';
import { makeUI, attachUI, updateUI, drawTodoList, drawPrompt, drawBanner, drawHints, drawTouchControls, drawTitle, drawEnding, drawPause, menuHit } from './ui.js';
import { makeAudio, ensureAudio, toggleMute, attachAudio, updateAudio } from './audio.js';
import { loadSave, writeSave, keyBinds } from './save.js';
import * as S from './sprites.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const save = loadSave();
const input = makeInput(canvas, keyBinds(save));
const audio = makeAudio();
audio.muted = !!save.opts.muted;

function newGame() {
  const world = makeWorld();
  const g = {
    canvas, ctx, input, audio,
    width: 1, height: 1, dpr: 1, scale: 1,
    time: 0, state: 'title',
    events: makeEvents(),
    world,
    camera: makeCamera(1300, 750),
    player: makePlayer(world),
    children: [
      makeChild('Poppy', { skin: C.poppySkin, top: C.poppyDress, bottom: C.poppyDress, hair: C.poppyHair }, world.childStarts.poppy),
      makeChild('Alfie', { skin: C.alfieSkin, top: C.alfieShirt, bottom: C.alfieShorts, hair: C.alfieHair }, world.childStarts.alfie),
    ],
    dog: makeDog(world.dogHome),
    gran: makeGran(world.granSpots),
    particles: makeParticles(),
    tasks: makeTasks(),
    ui: makeUI(),
    crateApples: 0,
    prompt: null,
    butterflyCd: 2, quackCd: 12,
    save, opts: save.opts,
    paused: false, playMs: 0,
  };
  attachTasks(g);
  attachUI(g);
  attachAudio(g);

  g.events.on('spill', ({ x, y }) => {
    g.particles.burst('dust', x, y, 8);
    if (dist(x, y, g.dog.x, g.dog.y) < 240) wakeDog(g.dog, g);
  });
  g.events.on('bump', ({ x, y }) => {
    g.particles.burst('dust', x, y, 4);
    if (dist(x, y, g.dog.x, g.dog.y) < 200) wakeDog(g.dog, g);
  });
  g.events.on('clunk', () => {
    const b = barrowCenter(g.player);
    if (dist(b.x, b.y, g.dog.x, g.dog.y) < 200) wakeDog(g.dog, g);
  });
  g.events.on('trample', ({ x, y }) => {
    g.particles.burst('petal', x, y, 9);
    granTut(g.gran);
  });
  g.events.on('load', ({ kid }) => g.particles.burst('heart', kid.x, kid.y - 34, 4));
  g.events.on('unload', ({ spot, x, y }) => {
    if (spot === 'pool') g.particles.burst('splash', x, y, 12);
  });
  g.events.on('teatime', () => {
    g.state = 'ending';
    g.ui.endT = 0;
    save.finished++;
    if (!save.bestMs || g.playMs < save.bestMs) save.bestMs = g.playMs;
    writeSave(save);
  });
  g.events.on('task-done', ({ task }) => {
    if (!task.extra) return;
    save.extras[task.id] = true;      // mischief is remembered between visits
    writeSave(save);
  });
  g.events.on('washing-down', ({ x, y }) => g.particles.burst('petal', x, y - 40, 6));
  g.events.on('item-home', ({ kind, item }) => {
    g.particles.burst(kind === 'duck' ? 'splash' : 'heart', item.x, item.y - 16, 6);
  });
  return g;
}

let game = newGame();
window.game = game;   // exposed so you can poke at the garden from the console

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  game.width = w;
  game.height = h;
  game.dpr = dpr;
  game.scale = h / 540;
  clampCamera(game.camera, game);
}
window.addEventListener('resize', resize);
resize();

document.addEventListener('visibilitychange', () => {
  if (!audio.master) return;
  audio.master.gain.value = document.hidden || audio.muted ? 0 : 0.5;
});

function ambience(g, dt) {
  g.butterflyCd -= dt;
  if (g.butterflyCd <= 0) {
    g.butterflyCd = rand(3, 6);
    const b = g.world.beds[Math.floor(rand(0, g.world.beds.length))];
    const [bx, by] = b.pts[Math.floor(rand(0, b.pts.length))];
    g.particles.spawn('butterfly', bx + rand(-30, 30), by + rand(-30, 10));
  }
  g.quackCd -= dt;
  if (g.quackCd <= 0) {
    g.quackCd = rand(12, 26);
    g.events.emit('quack', {});
  }
}

function handleMenuClick(g, click) {
  const id = menuHit(g.ui, click.x, click.y);
  if (!id) return;
  if (id === 'resume') { g.paused = false; g.ui.rebinding = null; return; }
  if (id === 'restart') {
    g.paused = false;
    game = newGame();
    window.game = game;
    resize();
    return;
  }
  if (id === 'motion') {
    g.opts.reducedMotion = !g.opts.reducedMotion;
    writeSave(g.save);
    return;
  }
  if (id === 'sound') {
    g.opts.muted = toggleMute(g.audio);
    writeSave(g.save);
    return;
  }
  if (id.startsWith('bind:')) {
    const name = id.slice(5);
    g.ui.rebinding = name;
    input.grabKey = (code) => {
      const keys = g.save.opts.keys || {};
      keys[name] = [code];
      g.save.opts.keys = keys;
      input.binds = keyBinds(g.save);
      g.ui.rebinding = null;
      writeSave(g.save);
    };
  }
}

function tick(dt) {
  game.time += dt;
  updateInput(input, game.width, game.height);
  const snap = input.snap;
  if (snap.any) ensureAudio(audio);
  if (snap.mute) { save.opts.muted = toggleMute(audio); writeSave(save); }

  // pausing freezes the garden but keeps the menu responsive
  if (game.state === 'playing' && snap.pause) game.paused = !game.paused;
  if (game.paused) {
    if (snap.click) handleMenuClick(game, snap.click);
    updateUI(game, dt);
    updateAudio(game, dt);
    return;
  }
  if (game.state === 'playing') game.playMs += dt * 1000;

  updateWorld(game.world, game, dt);
  for (const it of game.world.items) updateItem(it, game, dt);
  updateParticles(game.particles, dt);
  ambience(game, dt);

  if (game.state === 'title') {
    for (const kid of game.children) updateChild(kid, game, dt);
    updateDog(game.dog, game, dt);
    updateGran(game.gran, game, dt);
    // drift slowly over the house end of the garden as an establishing shot
    const cam = game.camera;
    cam.x += (760 + Math.cos(game.time * 0.06) * 300 - cam.x) * expDamp(0.6, dt);
    cam.y += (620 + Math.sin(game.time * 0.045) * 150 - cam.y) * expDamp(0.6, dt);
    clampCamera(cam, game);
    if (snap.any) {
      game.state = 'playing';
      game.ui.hintT = 14;
      game.ui.autoT = 4;
    }
  } else if (game.state === 'playing') {
    updatePlayer(game, dt);
    for (const kid of game.children) updateChild(kid, game, dt);
    updateDog(game.dog, game, dt);
    updateGran(game.gran, game, dt);
    updateTasks(game, dt);
    updateCamera(game.camera, game, dt);
  } else if (game.state === 'ending') {
    game.ui.endT += dt;
    const p = game.player;
    if (p.tipT > 0) { p.tipT = 0; p.cargo.apples = 0; }  // don't freeze mid-tip
    game.camera.zoom += (1 - game.camera.zoom) * expDamp(2, dt);
    const bl = game.world.regions.blanket;
    const tx = bl.x, ty = bl.y + 44;
    const d = dist(p.x, p.y, tx, ty);
    if (d > 8) {
      p.a = Math.atan2(ty - p.y, tx - p.x);
      p.ba += shortAngle(p.ba, p.a) * expDamp(4, dt);
      p.v = Math.min(70, d * 2);
      p.x += Math.cos(p.a) * p.v * dt;
      p.y += Math.sin(p.a) * p.v * dt;
      p.bobT += dt * 1.6;
    } else {
      p.v = 0;
      if (!p.sitting) {   // barrow set down beside the blanket, tea at last
        p.sitting = true;
        p.park = { x: p.x + 52, y: p.y + 12 };
        p.ba = 0.55; p.baVel = 0; p.roll = 0; p.rollVel = 0;
      }
    }
    for (const kid of game.children) updateChild(kid, game, dt);
    updateGran(game.gran, game, dt);
    updateDog(game.dog, game, dt);
    if (Math.random() < dt * 1.6) {
      game.particles.spawn('heart', bl.x + rand(-80, 80), bl.y + rand(-60, 20));
      game.particles.spawn('butterfly', bl.x + rand(-160, 160), bl.y + rand(-120, 40));
    }
    const cam = game.camera;
    cam.x += (bl.x - cam.x) * expDamp(1.6, dt);
    cam.y += (bl.y - 40 - cam.y) * expDamp(1.6, dt);
    clampCamera(cam, game);
    if (game.ui.endT > 3.5 && snap.any) {
      game = newGame();
      window.game = game;
      resize();
    }
  }

  updateUI(game, dt);
  updateAudio(game, dt);
}

function draw() {
  const g = game;
  const { dpr } = g;
  const cam = g.camera;
  const s = g.scale * cam.zoom;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = C.grassEdge;
  ctx.fillRect(0, 0, g.width, g.height);
  ctx.setTransform(
    dpr * s, 0, 0, dpr * s,
    dpr * (g.width / 2 - (cam.x + cam.sx) * s),
    dpr * (g.height / 2 - (cam.y + cam.sy) * s),
  );

  drawGround(ctx, g);

  // props outside the view are skipped; the borders alone are ~160 of them
  const vw = g.width / s, vh = g.height / s;
  const left = cam.x - vw / 2 - 30, right = cam.x + vw / 2 + 30;
  const top = cam.y - vh / 2 - 30, bottom = cam.y + vh / 2 + 30;
  const items = [];
  for (const pr of g.world.props) {
    if (pr.cr !== undefined &&
        (pr.cx + pr.cr < left || pr.cx - pr.cr > right ||
         pr.cy + pr.cr < top || pr.cy - pr.cr > bottom)) continue;
    items.push(pr);
  }
  const p = g.player;
  const b = barrowCenter(p);
  items.push({ sortY: p.y, draw: (c) => drawPlayer(c, g) });
  items.push({ sortY: b.y + 8, draw: (c) => drawBarrow(c, g) });
  for (const kid of g.children) {
    if (kid.state !== 'carried') items.push({ sortY: kid.y, draw: (c) => S.drawChild(c, kid, g.time) });
  }
  items.push({ sortY: g.dog.y, draw: (c) => S.drawDog(c, g.dog, g.time) });
  items.push({ sortY: g.gran.y, draw: (c) => S.drawGran(c, g.gran, g.time) });
  for (const a of g.world.apples) items.push({ sortY: a.y, draw: (c) => S.drawApple(c, a, g.time) });
  for (const it of g.world.items) {
    if (it.state !== 'carried') items.push({ sortY: it.y, draw: (c) => drawItem(c, it, g.time) });
  }
  items.sort((x, y) => x.sortY - y.sortY);
  for (const it of items) it.draw(ctx, g);

  // overlay: water, particles, speech bubbles
  S.drawSprinklerWater(ctx, g.world.sprinkler, g.time);
  drawParticles(g.particles, ctx, g.time);
  for (const kid of g.children) {
    if (kid.bubble) S.drawBubble(ctx, kid.x, kid.y - 46 - (kid.z || 0), kid.bubble.text, kid.state === 'carried');
  }
  if (g.gran.bubble) S.drawBubble(ctx, g.gran.x, g.gran.y - 54, g.gran.bubble.text);

  // screen-space UI
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (g.state === 'title') {
    drawTitle(ctx, g, g.width, g.height);
  } else if (g.state === 'ending') {
    drawEnding(ctx, g, g.width, g.height);
  } else {
    drawTodoList(ctx, g, g.width, g.height);
    drawPrompt(ctx, g, g.width, g.height);
    drawBanner(ctx, g, g.width);
    drawHints(ctx, g, g.width, g.height);
    drawTouchControls(ctx, g);
    if (g.paused) drawPause(ctx, g, g.width, g.height);
  }

  if (input.keys.has('Backquote')) {
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(8, g.height - 66, 250, 56);
    ctx.fillStyle = '#9f9';
    ctx.font = '12px monospace';
    ctx.fillText(`v=${p.v.toFixed(0)} roll=${p.roll.toFixed(2)} baVel=${p.baVel.toFixed(2)}`, 16, g.height - 46);
    ctx.fillText(`surf=${p.surface.type} kids=${p.cargo.kids.length} apples=${p.cargo.apples}`, 16, g.height - 28);
  }
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  tick(dt);
  draw();
}
requestAnimationFrame(frame);
