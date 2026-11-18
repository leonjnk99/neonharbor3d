// Story missions — a sequential state machine. Pure logic, no DOM.
// Each mission is cloned from CFG.MISSIONS with runtime fields added.

import { CFG, MISSIONS } from './config.js';
import { spawnEnemy, randomStreetSpot, aliveEnemies } from './enemies.js';
import { enterCar, exitCar } from './player.js';
import { addWanted } from './combat.js';
import { isWall } from './map.js';
import { saveGame } from './save.js';

// Find an open street cell near (x, y) (tries random offsets until one is open).
function openSpotNear(world, x, y, radius) {
  for (let i = 0; i < 24; i++) {
    const sx = x + (world.rng() * 2 - 1) * radius;
    const sy = y + (world.rng() * 2 - 1) * radius;
    if (!isWall(world.map, sx, sy)) return { x: sx, y: sy };
  }
  return { x, y };
}

export function startMission(world, index) {
  const def = MISSIONS[index];
  if (!def) { world.mission = null; world.freeRoam = true; return; }
  const m = { ...def, kills: 0, wave: 0, waveSpawned: 0, timer: def.timeLimit || 0, phase: 1, done: false };
  world.mission = m;
  world.missionIndex = index;
  if (m.type === 'kill') {
    // Spawn the alley gang near the marker, on open street cells only.
    for (let i = 0; i < m.count; i++) {
      const spot = openSpotNear(world, m.marker.x, m.marker.y, 2);
      const e = spawnEnemy(world, 'gang', spot.x, spot.y);
      e.missionKill = true;
    }
  }
  if (m.type === 'timed') {
    world.wanted = 4;
    world.lastCrimeT = world.time;
    addWanted(world, 0); // refresh bestWanted
  }
  if (world.onMissionStart) world.onMissionStart(m);
}

export function updateMissions(world, dt) {
  const m = world.mission;
  if (!m || m.done) return;
  const p = world.player;

  if (m.type === 'goto') {
    if (Math.hypot(p.x - m.marker.x, p.y - m.marker.y) < 1.4) completeMission(world);
  } else if (m.type === 'kill') {
    if ((m.kills || 0) >= m.count) completeMission(world);
  } else if (m.type === 'drive') {
    if (m.phase === 2 && p.driving) {
      if (Math.hypot(p.x - m.marker.x, p.y - m.marker.y) < 1.8) {
        exitCar(world);
        completeMission(world);
      }
    }
  } else if (m.type === 'waves') {
    const alive = aliveEnemies(world).filter((e) => e.missionWave === m.wave);
    if (m.wave === 0) {
      spawnWave(world, 1);
    } else if (alive.length === 0 && m.waveSpawned > 0) {
      if (m.wave >= m.waves) completeMission(world);
      else spawnWave(world, m.wave + 1);
    }
  } else if (m.type === 'timed') {
    m.timer -= dt;
    if (Math.hypot(p.x - m.marker.x, p.y - m.marker.y) < 1.6) {
      completeMission(world);
    } else if (m.timer <= 0) {
      // Failed run: restart the timer, keep the heat on.
      world.missionFails = (world.missionFails || 0) + 1;
      m.timer = m.timeLimit;
      if (world.onMissionFail) world.onMissionFail(m);
    }
  }
}

function spawnWave(world, wave) {
  const m = world.mission;
  m.wave = wave;
  m.waveSpawned = 0;
  const gangCount = 2 + wave;
  for (let i = 0; i < gangCount; i++) {
    const spot = randomStreetSpot(world, 7);
    const e = spawnEnemy(world, 'gang', spot.x, spot.y);
    e.missionWave = wave;
    m.waveSpawned += 1;
  }
  if (world.wanted >= 2) {
    for (let i = 0; i < 2; i++) {
      const spot = randomStreetSpot(world, 9);
      const e = spawnEnemy(world, 'police', spot.x, spot.y);
      e.missionWave = wave;
      m.waveSpawned += 1;
    }
  }
  if (world.onWave) world.onWave(wave);
}

export function completeMission(world) {
  const m = world.mission;
  if (!m || m.done) return;
  m.done = true;
  world.cash += m.reward;
  world.missionsDone = (world.missionsDone || 0) + 1;
  world.floaters.push({ x: world.player.x, y: world.player.y, text: `MISSION COMPLETE  +$${m.reward}`, t: 2.5, color: '#7dff9a' });
  saveGame(world); // progress persists immediately, not just on autosave
  if (world.onMissionComplete) world.onMissionComplete(m);
  const next = world.missionIndex + 1;
  if (next >= MISSIONS.length) {
    world.mission = null;
    world.freeRoam = true;
  } else {
    startMission(world, next);
  }
}

// Interact key: mission-3 car entry, or exit the car.
export function interact(world) {
  const p = world.player;
  const m = world.mission;
  if (p.driving) { exitCar(world); return true; }
  if (m && m.type === 'drive' && m.phase === 1) {
    const car = world.cars.find((c) => c.mission);
    if (car && !car.taken && Math.hypot(p.x - car.x, p.y - car.y) < 1.8) {
      if (enterCar(world, car)) {
        world.drivenCar = car;
        m.phase = 2;
        if (world.onCarEnter) world.onCarEnter(car);
        return true;
      }
    }
  }
  return false;
}
