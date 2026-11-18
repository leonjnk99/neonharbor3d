// NEONHARBOR 3D — entry point. Wires world + renderer + input + sound + UI,
// runs the frame loop, and exposes window.__nh3d for the playtest driver
// and the deterministic ?shot= screenshot mode.

import { CFG, MISSIONS } from './config.js';
import { createWorld, startGame, update, teleport, giveAmmo } from './world.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { SoundBank } from './audio.js';
import { UI } from './ui.js';
import { spawnEnemy } from './enemies.js';
import { loadGame, saveGame } from './save.js';
import { startMission } from './missions.js';

const params = new URLSearchParams(location.search);
const SHOT = params.get('shot');
const SEED = Number(params.get('seed') || '1');

const canvas = document.getElementById('game');
const world = createWorld(CFG.MAP_SEED);
const renderer = new Renderer(canvas);
const input = new Input(canvas);
const sound = new SoundBank();
const ui = new UI(world);

let fps = 60, frames = 0, fpsT = 0;
let last = performance.now();
let shotFrames = 0;

// --- Sound / event hooks ---
world.onShot = (weapon, hits) => {
  if (weapon === 'SHOTGUN') sound.shotgun(); else sound.shoot();
  if (hits > 0) sound.hit();
};
world.onPickup = () => sound.pickup();
world.onEnemyShot = (e, hit) => { sound.enemyShot(); };
world.onMissionComplete = (m) => {
  sound.mission();
  ui.banner('MISSION COMPLETE', `${m.name}  ·  +$${m.reward}`, 3);
  if (world.mission) ui.banner('MISSION COMPLETE', `${m.name}  ·  +$${m.reward} — next: ${world.mission.name}`, 3);
};
world.onMissionFail = (m) => { sound.fail(); ui.banner('TIME UP', `${m.name} — try again, the clock restarted`, 2.5); };
world.onMissionStart = (m) => ui.banner(`MISSION ${m.id}/5 — ${m.name}`, m.brief, 3.5);
world.onWave = (n) => ui.banner(`WAVE ${n}`, 'They keep coming…', 2);
world.onCarEnter = () => { sound.pickup(); ui.banner('HOT WHEELS', 'Drive it to the Chop Shop — watch the heat', 3); };

// --- Title / pause / dead flow ---
function play(useSave) {
  sound.ensure();
  sound.setRain(true);
  startGame(world, useSave);
  ui.showTitle(false);
  ui.showDead(false);
  ui.showPause(false);
  input.requestLock();
}

const newBtn = document.getElementById('new-btn');
if (newBtn) newBtn.addEventListener('click', () => play(false));
const contBtn = document.getElementById('continue-btn');
if (contBtn) contBtn.addEventListener('click', () => play(true));
const resumeBtn = document.getElementById('resume-btn');
if (resumeBtn) resumeBtn.addEventListener('click', () => {
  world.state = 'playing';
  ui.showPause(false);
  input.requestLock();
});
const restartBtn = document.getElementById('restart-btn');
if (restartBtn) restartBtn.addEventListener('click', () => location.reload());
const muteBtn = document.getElementById('mute-btn');
if (muteBtn) muteBtn.addEventListener('click', () => {
  sound.setMuted(!sound.muted);
  muteBtn.textContent = sound.muted ? 'SOUND: OFF' : 'SOUND: ON';
});

input.onFirstGesture = () => sound.ensure();
input.onLockChange = (locked) => {
  if (!locked && world.state === 'playing' && !SHOT) {
    world.state = 'paused';
    ui.showPause(true);
  }
};
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') {
    sound.setMuted(!sound.muted);
    if (muteBtn) muteBtn.textContent = sound.muted ? 'SOUND: OFF' : 'SOUND: ON';
  }
  if (e.code === 'Escape' && world.state === 'paused') {
    world.state = 'playing';
    ui.showPause(false);
    input.requestLock();
  }
});
window.addEventListener('resize', () => renderer.resize());

// --- Deterministic screenshot scenes (?shot=start|combat|mission|hud) ---
function setupShot(kind) {
  world.state = 'playing';
  ui.showTitle(false);
  const p = world.player;
  if (kind === 'start') {
    teleport(world, 1.5, 6.5, 0);
    spawnEnemy(world, 'gang', 8.5, 6.5).yaw = Math.PI;
    spawnEnemy(world, 'gang', 12.5, 6.5).yaw = Math.PI;
    startMission(world, 0);
  } else if (kind === 'combat') {
    teleport(world, 13.5, 13.5, Math.PI);
    p.hp = 78;
    p.weapons.PISTOL.ammo = 9;
    world.wanted = 2;
    world.cash = 150;
    spawnEnemy(world, 'gang', 10.5, 13.5).yaw = 0;
    spawnEnemy(world, 'gang', 11.5, 12.5).yaw = 0;
    spawnEnemy(world, 'gang', 9.5, 14.5).yaw = 0;
    startMission(world, 1);
    world.mission.kills = 2;
  } else if (kind === 'mission') {
    // Stand on the road row facing east down the street: the bar and the
    // yellow beacon are straight ahead.
    teleport(world, 7.5, 7.5, 0);
    startMission(world, 0);
  } else if (kind === 'hud') {
    // Driving shot: in the car, 3 stars, cash, mission 3 in progress.
    teleport(world, 1.5, 12.5, 0);
    p.hp = 85; p.armor = 40;
    p.weapons.PISTOL.ammo = 11;
    giveAmmo(world);
    world.cash = 450;
    world.wanted = 3;
    startMission(world, 2);
    const car = world.cars.find((c) => c.mission);
    world.mission.phase = 2;
    p.driving = true;
    p.carYaw = 0;
    p.carSpeed = 6;
    car.taken = true;
    world.drivenCar = car;
    spawnEnemy(world, 'police', 7.5, 12.5).yaw = Math.PI;
    spawnEnemy(world, 'police', 10.5, 13.5).yaw = Math.PI;
  }
  // A few warm-up frames are rendered by the main loop before __shotReady.
}

if (SHOT) {
  setupShot(SHOT);
  window.__shotReady = false;
} else {
  ui.showTitle(true, !!loadGame());
}

// --- Debug / playtest API ---
window.__nh3d = {
  world,
  ready: true,
  fps: () => fps,
  state: () => ({
    state: world.state,
    x: world.player.x, y: world.player.y, yaw: world.player.yaw,
    hp: world.player.hp, armor: world.player.armor,
    cash: world.cash, wanted: world.wanted,
    mission: world.mission ? world.mission.id : null,
    missionName: world.mission ? world.mission.name : null,
    enemies: world.enemies.filter((e) => !e.dead).length,
    kills: world.kills, missionsDone: world.missionsDone,
    driving: world.player.driving,
    ammo: world.player.weapons[world.player.weapon].ammo,
  }),
  start: (useSave) => play(useSave),
  teleport: (x, y, yaw) => teleport(world, x, y, yaw),
  setYaw: (a) => { world.player.yaw = a; if (world.player.driving) world.player.carYaw = a; },
  fire: () => { world.player.fireT = 0; },
  giveAmmo: () => giveAmmo(world),
  setMission: (i) => startMission(world, i),
  spawnEnemy: (type, x, y) => spawnEnemy(world, type, x, y),
  setWanted: (n) => { world.wanted = n; },
  heal: () => { world.player.hp = 100; world.player.armor = 100; },
};

// --- Main loop ---
function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  // Exponential moving average so the counter reads sensibly within the
  // first second (and the screenshots never show "0 fps").
  fps = Math.round(fps * 0.9 + (1 / dt) * 0.1);
  frames += 1; fpsT += dt;

  if (world.state === 'playing') {
    const inp = input.read();
    update(world, dt, inp);
    input.endStep();
    // Siren + rain follow the wanted level.
    sound.setSiren(world.wanted >= 3 && world.state === 'playing');
  } else if (world.state === 'dead') {
    if (!world._deathSaved) { world._deathSaved = true; saveGame(world); }
    ui.showDead(true, `Missions done: ${world.missionsDone}  ·  Cash: $${world.cash}  ·  Kills: ${world.kills}`);
  }
  renderer.render(world, now / 1000, dt);
  ui.update(fps);

  if (SHOT) {
    shotFrames += 1;
    if (shotFrames === 10 && SHOT === 'combat') {
      // Hold a muzzle flash for the capture.
      world.player.muzzleT = 0.5;
      world.player.fireT = 0.2;
    }
    if (shotFrames >= 14) window.__shotReady = true;
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
