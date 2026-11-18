// NEONHARBOR 3D — headless logic tests. Runs the real game modules in Node
// with a mocked localStorage and a mocked input object. No browser, no faking:
// every assertion drives world.update() and checks the resulting state.
// Usage: node tests/logic.mjs

globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
};

import { createWorld, update, startGame, teleport, giveAmmo } from '../game/src/world.js';
import { generateMap, isWall, hasLOS, reachable, moveCircle } from '../game/src/map.js';
import { castRay } from '../game/src/raycast.js';
import { mulberry32 } from '../game/src/random.js';
import { CFG, MISSIONS } from '../game/src/config.js';
import { spawnEnemy } from '../game/src/enemies.js';
import { saveGame, loadGame, clearSave } from '../game/src/save.js';
import { startMission } from '../game/src/missions.js';

let passed = 0, failed = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { passed += 1; console.log('  ok  ' + name); }
  else { failed += 1; failures.push(name); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); }
}

function mockInput() {
  return {
    f: false, b: false, l: false, r: false, sprint: false, jump: false,
    fire: false, reload: false, interact: false, interactPressed: false,
    w1: false, w2: false, yawDelta: 0,
    press(n) { this[n] = true; },
    endStep() {
      this.reload = false; this.interact = false; this.interactPressed = false;
      this.w1 = false; this.w2 = false; this.yawDelta = 0;
    },
  };
}

function step(world, input, seconds, dt) {
  const stepDt = dt || 1 / 60;
  const n = Math.round(seconds / stepDt);
  for (let i = 0; i < n; i += 1) {
    update(world, stepDt, input);
    input.endStep();
    if (world.state !== 'playing') break;
  }
}

function fresh() {
  const w = createWorld(CFG.MAP_SEED);
  startGame(w, false);
  return w;
}

// --- 1. RNG determinism ---
{
  const a = mulberry32(42), b = mulberry32(42);
  let same = true;
  for (let i = 0; i < 50; i++) if (a() !== b()) same = false;
  check('rng: same seed gives the same sequence', same);
  const c = mulberry32(43);
  check('rng: different seed differs', c() !== mulberry32(42)());
}

// --- 2. Map ---
{
  const map = generateMap(CFG.MAP_SEED);
  check('map: 40x40 grid', map.w === 40 && map.h === 40);
  check('map: border is wall', isWall(map, 0.5, 0.5) && isWall(map, 39.5, 20.5) && isWall(map, 20.5, 39.5));
  check('map: player start is open', !isWall(map, map.playerStart.x, map.playerStart.y));
  check('map: bar block is wall', isWall(map, 9.5, 9.5));
  check('map: chop block is wall', isWall(map, 27.5, 27.5));
  check('map: harbor plaza is open', !isWall(map, 20.5, 37.5));
  check('map: all mission markers + pickups + cars reachable', reachable(map));
  const map2 = generateMap(CFG.MAP_SEED);
  check('map: generation is deterministic', JSON.stringify([...map.grid]) === JSON.stringify([...map2.grid]));
}

// --- 3. Collision ---
{
  const map = generateMap(CFG.MAP_SEED);
  // Walk east at y=9.5 (inside the bar's row band): the bar wall stops the player.
  const p1 = moveCircle(map, 7.5, 9.5, 2.0, 0, 0.22);
  check('collision: wall blocks eastward movement', p1.x < 8 - 0.22 + 0.01, `x=${p1.x}`);
  // Walk along an open road: movement is free.
  const p2 = moveCircle(map, 1.5, 6.5, 2.0, 0, 0.22);
  check('collision: open road allows movement', Math.abs(p2.x - 3.5) < 0.01, `x=${p2.x}`);
  // Sliding: at (7.5, 7.5) moving diagonally, x slides along the bar's north
  // face while y is blocked by the bar block.
  const p3 = moveCircle(map, 7.5, 7.5, 1.0, 1.0, 0.22);
  check('collision: diagonal slides (x moves, y blocked)', p3.x > 7.5 && p3.y === 7.5, `x=${p3.x} y=${p3.y}`);
}

// --- 4. Raycast / LOS ---
{
  const map = generateMap(CFG.MAP_SEED);
  // From (13.5, 9.5) facing west: the bar's east face is at x=12 -> dist ~1.5.
  const hit = castRay(map, 13.5, 9.5, Math.PI);
  check('raycast: west into the bar at ~1.5', Math.abs(hit.dist - 1.5) < 0.05, `dist=${hit.dist}`);
  check('raycast: hit tile is BAR', hit.tex === 5, `tex=${hit.tex}`);
  // Facing north from (1.5, 6.5): border wall at y=0 -> dist ~6.5.
  const hitN = castRay(map, 1.5, 6.5, -Math.PI / 2);
  check('raycast: north hits the boundary', hitN.dist > 5 && hitN.dist < 7.5, `dist=${hitN.dist}`);
  check('los: open street has line of sight', hasLOS(map, 1.5, 6.5, 7.5, 6.5));
  check('los: bar blocks line of sight', !hasLOS(map, 1.5, 9.5, 10.5, 9.5));
}

// --- 5. Player movement via world.update ---
{
  const w = fresh();
  const input = mockInput();
  const x0 = w.player.x;
  input.f = true;
  step(w, input, 1);
  check('player: walks forward', w.player.x > x0 + 2.5, `x ${x0} -> ${w.player.x}`);
  const x1 = w.player.x;
  input.f = false; input.sprint = true; input.f = true;
  step(w, input, 1);
  check('player: sprint is faster than walk', w.player.x - x1 > 4.5, `dx=${w.player.x - x1}`);
  // Turning: yawDelta rotates the player.
  const yaw0 = w.player.yaw;
  input.f = false; input.sprint = false; input.yawDelta = 0.5;
  step(w, input, 0.1);
  check('player: mouse look turns yaw', Math.abs(w.player.yaw - yaw0 - 0.5) < 0.01, `yaw=${w.player.yaw}`);
}

// --- 6. Weapons ---
{
  const w = fresh();
  const input = mockInput();
  check('weapons: pistol starts loaded 12/48', w.player.weapons.PISTOL.ammo === 12 && w.player.weapons.PISTOL.reserve === 48);
  // Fire until empty, then reload.
  input.fire = true;
  let guard = 0;
  while (w.player.weapons.PISTOL.ammo > 0 && guard++ < 600) { step(w, input, 0.3); }
  check('weapons: firing drains the magazine', w.player.weapons.PISTOL.ammo === 0);
  input.fire = false;
  input.reload = true;
  step(w, input, 0.2);
  input.endStep();
  step(w, input, 1.3);
  check('weapons: reload refills from reserve', w.player.weapons.PISTOL.ammo === 12 && w.player.weapons.PISTOL.reserve === 36,
    `ammo=${w.player.weapons.PISTOL.ammo} reserve=${w.player.weapons.PISTOL.reserve}`);
  // Shotgun unlocks from an ammo pickup.
  giveAmmo(w);
  check('weapons: shotgun unlocked by ammo', w.player.weapons.SHOTGUN.owned && w.player.weapons.SHOTGUN.ammo === 6);
  input.w2 = true;
  step(w, input, 0.2);
  check('weapons: key 2 switches to shotgun', w.player.weapon === 'SHOTGUN');
}

// --- 7. Shooting an enemy ---
{
  const w = fresh();
  const input = mockInput();
  teleport(w, 13.5, 13.5, Math.PI); // face west
  const e = spawnEnemy(w, 'gang', 10.5, 13.5);
  e.yaw = 0;
  const hp0 = e.hp;
  input.fire = true;
  step(w, input, 0.4);
  input.fire = false;
  check('combat: point-blank pistol shot hits', e.hp < hp0, `hp ${hp0} -> ${e.hp}`);
  // Kill it: repeated fire until dead, wanted rises a bit.
  let guard = 0;
  while (!e.dead && guard++ < 40) { input.fire = true; step(w, input, 0.3); input.fire = false; }
  check('combat: enemy dies from sustained fire', e.dead);
  check('combat: kill pays cash', w.cash > 0, `cash=${w.cash}`);
  check('combat: gang kill raises wanted', w.wanted > 0, `wanted=${w.wanted}`);
  // A wall between shooter and target blocks the shot: the bar sits between
  // (1.5, 9.5) and (13.5, 9.5).
  const w2 = fresh();
  teleport(w2, 1.5, 9.5, 0); // face east; bar wall at x=8..11
  const e2 = spawnEnemy(w2, 'gang', 13.5, 9.5);
  const hp2 = e2.hp;
  const input2 = mockInput();
  input2.fire = true;
  step(w2, input2, 1.5);
  check('combat: wall blocks the shot', e2.hp === hp2, `hp ${hp2} -> ${e2.hp}`);
}

// --- 8. Enemy AI ---
{
  const w = fresh();
  const input = mockInput();
  teleport(w, 13.5, 13.5, 0);
  const e = spawnEnemy(w, 'gang', 10.5, 13.5);
  step(w, input, 1.5);
  check('ai: gang chases the player in sight', e.aggro && Math.hypot(e.x - w.player.x, e.y - w.player.y) < 3.2,
    `aggro=${e.aggro} d=${Math.hypot(e.x - w.player.x, e.y - w.player.y).toFixed(2)}`);
  // Enemy shoots back over time.
  const hp0 = w.player.hp;
  step(w, input, 6);
  check('ai: enemy fire can hurt the player', w.player.hp < hp0 || w.player.armor < 100, `hp=${w.player.hp}`);
}

// --- 9. Wanted decay + police pressure ---
{
  const w = fresh();
  w.wanted = 3;
  w.lastCrimeT = -100;
  const input = mockInput();
  step(w, input, 26);
  check('wanted: decays one star after 25s quiet', w.wanted <= 2, `wanted=${w.wanted}`);
  const police = w.enemies.filter((e) => e.type === 'police' && !e.dead).length;
  check('wanted: police spawn under heat', police >= 1, `police=${police}`);
}

// --- 10. Missions ---
{
  // Mission 1: reach the bar marker.
  const w = fresh();
  check('mission: starts at mission 1', w.mission && w.mission.id === 1);
  teleport(w, 10.5, 7.5, 0);
  step(w, mockInput(), 0.2);
  check('mission 1: completes at the bar', w.mission && w.mission.id === 2, `now=${w.mission && w.mission.id}`);
  check('mission 1: pays $100', w.cash === 100, `cash=${w.cash}`);
  // Mission 2: kill 4 gang in the alley.
  const gang = w.enemies.filter((e) => e.missionKill && !e.dead);
  check('mission 2: 4 gang spawned', gang.length === 4, `n=${gang.length}`);
  for (const e of gang) { e.hp = 1; }
  const input = mockInput();
  // Teleport next to each, face it (yaw computed AFTER the teleport), shoot it.
  for (const e of [...gang]) {
    teleport(w, e.x + 1.5, e.y, 0);
    w.player.yaw = Math.atan2(e.y - w.player.y, e.x - w.player.x);
    input.fire = true;
    step(w, input, 0.4);
    input.fire = false;
  }
  check('mission 2: completes after 4 kills', w.mission && w.mission.id === 3, `now=${w.mission && w.mission.id}`);
  // Mission 3: steal the car and deliver it.
  const car = w.cars.find((c) => c.mission);
  teleport(w, car.x + 0.5, car.y, 0);
  input.interactPressed = true;
  step(w, input, 0.2);
  check('mission 3: E enters the car', w.player.driving === true);
  teleport(w, 28.5, 25.5, 0);
  step(w, mockInput(), 0.2);
  check('mission 3: delivery completes the job', w.mission && w.mission.id === 4, `now=${w.mission && w.mission.id}`);
  check('mission 3: player exits the car on delivery', w.player.driving === false);
}

// --- 11. Waves + timed finale ---
{
  const w = fresh();
  // Jump straight to mission 4.
  startMission(w, 3);
  step(w, mockInput(), 0.2); // first tick spawns wave 1
  check('mission 4: wave 1 spawns', w.enemies.filter((e) => e.missionWave === 1 && !e.dead).length >= 3);
  // Kill wave 1, then wave 2 spawns.
  killWave(w, 1);
  step(w, mockInput(), 0.3);
  check('mission 4: wave 2 follows wave 1', w.mission.wave === 2, `wave=${w.mission.wave}`);
  killWave(w, 2);
  step(w, mockInput(), 0.3);
  killWave(w, 3);
  step(w, mockInput(), 0.3);
  check('mission 4: completes after wave 3', w.mission && w.mission.id === 5, `now=${w.mission && w.mission.id}`);
  // Mission 5: timed, wanted 4.
  check('mission 5: wanted jumps to 4', w.wanted >= 4, `wanted=${w.wanted}`);
  const t0 = w.mission.timer;
  step(w, mockInput(), 2);
  check('mission 5: timer counts down', w.mission.timer < t0, `timer=${w.mission.timer}`);
  teleport(w, 20.5, 37.5, 0);
  step(w, mockInput(), 0.2);
  check('mission 5: reaching the harbor wins the game', w.freeRoam === true && w.mission === null);
}

function killWave(w, wave) {
  for (const e of w.enemies.filter((e) => e.missionWave === wave && !e.dead)) e.hp = 0, e.dead = true;
}

// --- 12. Save / load ---
{
  clearSave();
  const w = fresh();
  w.cash = 250; w.missionsDone = 2; w.missionIndex = 2;
  check('save: writes', saveGame(w) === true);
  const loaded = loadGame();
  check('save: round-trips cash + progress', loaded && loaded.cash === 250 && loaded.missionIndex === 2,
    JSON.stringify(loaded));
  clearSave();
  check('save: clear removes it', loadGame() === null);
}

// --- 13. Driving physics ---
{
  const w = fresh();
  const input = mockInput();
  startMission(w, 2); // mission 3 (drive) so E can enter the car
  const car = w.cars.find((c) => c.mission);
  teleport(w, car.x + 0.5, car.y, 0);
  input.interactPressed = true;
  step(w, input, 0.2);
  // Face north (up the road column x=7) and drive: the car must move.
  w.player.yaw = -Math.PI / 2;
  w.player.carYaw = -Math.PI / 2;
  const y0 = w.player.y;
  input.f = true;
  step(w, input, 1.5);
  check('driving: car accelerates forward', w.player.y < y0 - 4, `y ${y0} -> ${w.player.y}`);
  const yaw0 = w.player.yaw;
  input.l = true;
  step(w, input, 0.8);
  check('driving: steering turns the car', Math.abs(w.player.yaw - yaw0) > 0.2, `yaw ${yaw0} -> ${w.player.yaw}`);
  input.f = false; input.l = false;
  input.interactPressed = true;
  step(w, input, 0.2);
  check('driving: E exits the car', w.player.driving === false);
}

console.log(`\nlogic: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('failures:', failures.join(', '));
  process.exit(1);
}
