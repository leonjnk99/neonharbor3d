// World: owns all game state and the per-frame update. Pure logic, no DOM.
// main.js (browser) owns rendering/input/audio; tests drive createWorld +
// world.update() directly.

import { CFG, MISSIONS } from './config.js';
import { mulberry32 } from './random.js';
import { generateMap } from './map.js';
import { createPlayer, updatePlayer } from './player.js';
import { updateEnemies, updateWanted } from './enemies.js';
import { startMission, updateMissions, interact } from './missions.js';
import { saveGame, loadGame } from './save.js';

export function createWorld(seed, opts) {
  const map = generateMap(seed ?? CFG.MAP_SEED);
  const world = {
    map,
    rng: mulberry32(seed ?? CFG.MAP_SEED),
    player: createPlayer(map),
    enemies: [],
    pickups: map.pickups.map((p) => ({ ...p })),
    cars: map.cars.map((c) => ({ ...c })),
    drivenCar: null,
    missionIndex: 0,
    mission: null,
    freeRoam: false,
    wanted: 0,
    wantedFloat: 0,
    bestWanted: 0,
    lastCrimeT: -100,
    wantedDecay: 0,
    policeSpawnT: 0,
    gangSpawnT: 0,
    cash: 0,
    kills: 0,
    deaths: 0,
    missionsDone: 0,
    missionFails: 0,
    shotsFired: 0,
    shotsHit: 0,
    time: 0,
    state: 'title', // title | playing | paused | dead
    floaters: [],
    // Sound/event hooks (wired by main.js; null in tests).
    onShot: null, onPickup: null, onEnemyShot: null,
    onMissionStart: null, onMissionComplete: null, onMissionFail: null,
    onWave: null, onCarEnter: null,
    saveT: 0,
  };
  if (opts && opts.skipIntro) world.state = 'playing';
  return world;
}

export function startGame(world, useSave) {
  if (useSave) {
    const s = loadGame();
    if (s) {
      world.missionIndex = Math.min(s.missionIndex || 0, MISSIONS.length - 1);
      world.cash = s.cash || 0;
      world.kills = s.kills || 0;
      world.bestWanted = s.bestWanted || 0;
    }
  }
  world.state = 'playing';
  world._deathSaved = false;
  startMission(world, world.missionIndex);
}

export function update(world, dt, input) {
  if (world.state !== 'playing') return;
  world.time += dt;
  if (input && input.interactPressed) interact(world);
  updatePlayer(world, dt, input || {});
  updateEnemies(world, dt);
  updateWanted(world, dt);
  updateMissions(world, dt);

  // Keep the driven car glued to the player while driving.
  if (world.drivenCar) {
    world.drivenCar.x = world.player.x;
    world.drivenCar.y = world.player.y;
  }

  // Floater lifetimes.
  for (const f of world.floaters) f.t -= dt;
  world.floaters = world.floaters.filter((f) => f.t > 0);

  // Autosave every 15s while playing.
  world.saveT += dt;
  if (world.saveT > 15) {
    world.saveT = 0;
    saveGame(world);
  }
}

export function objectiveText(world) {
  const m = world.mission;
  if (!m) return world.freeRoam ? 'King of the Harbor — free roam. Cause trouble, or don\'t.' : '';
  let text = m.brief;
  if (m.type === 'kill') text += `  (${Math.min(m.kills || 0, m.count)}/${m.count})`;
  if (m.type === 'waves') text += `  (wave ${Math.max(1, m.wave)}/${m.waves})`;
  if (m.type === 'timed') text += `  (${Math.max(0, Math.ceil(m.timer))}s left)`;
  if (m.type === 'drive') text += m.phase === 1 ? '  (find the red sedan)' : '  (drive to the Chop Shop)';
  return text;
}

export function markerDistance(world) {
  const m = world.mission;
  if (!m) return null;
  const p = world.player;
  return Math.hypot(p.x - m.marker.x, p.y - m.marker.y);
}

// Debug/test helpers.
export function teleport(world, x, y, yaw) {
  world.player.x = x;
  world.player.y = y;
  if (yaw !== undefined) world.player.yaw = yaw;
  if (world.player.driving) world.player.carYaw = yaw ?? world.player.yaw;
}

export function giveAmmo(world) {
  world.player.weapons.PISTOL.reserve += 120;
  world.player.weapons.SHOTGUN.owned = true;
  world.player.weapons.SHOTGUN.ammo = CFG.SHOTGUN.mag;
  world.player.weapons.SHOTGUN.reserve += 60;
}
