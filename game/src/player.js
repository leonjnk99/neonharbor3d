// Player update — movement, collision, driving, weapon timers, pickups.
// Pure logic: `input` is a plain object {f, b, l, r, sprint, jump, fire,
// reload, interact, w1, w2} with booleans, plus {yawDelta} for mouse look.

import { CFG } from './config.js';
import { moveCircle } from './map.js';
import { fireWeapon, startReload, finishReload } from './combat.js';
import { clamp } from './random.js';

export function createPlayer(map) {
  const s = map.playerStart;
  return {
    x: s.x, y: s.y, yaw: s.yaw,
    hp: CFG.PLAYER_HP, armor: 0,
    weapon: 'PISTOL',
    weapons: {
      PISTOL: { ammo: CFG.PISTOL.mag, reserve: CFG.PISTOL.reserve },
      SHOTGUN: { ammo: 0, reserve: 0, owned: false },
    },
    fireT: 0, reloadT: 0, muzzleT: 0, hurtT: 0,
    driving: false, carSpeed: 0, carYaw: 0,
    eyeH: 0, vy: 0, onGround: true,
    bobT: 0, moving: false,
  };
}

export function updatePlayer(world, dt, input) {
  const p = world.player;
  if (p.hp <= 0) return;
  p.fireT = Math.max(0, p.fireT - dt);
  p.muzzleT = Math.max(0, p.muzzleT - dt);
  p.hurtT = Math.max(0, p.hurtT - dt);
  if (p.reloadT > 0) {
    p.reloadT -= dt;
    if (p.reloadT <= 0) { p.reloadT = 0; finishReload(world); }
  }
  if (input.yawDelta) p.yaw += input.yawDelta;

  if (p.driving) updateDriving(world, dt, input);
  else updateOnFoot(world, dt, input);

  // Weapon switching / reload / fire.
  if (input.w2 && p.weapons.SHOTGUN.owned && p.weapon !== 'SHOTGUN' && p.reloadT <= 0) {
    p.weapon = 'SHOTGUN'; p.fireT = Math.max(p.fireT, 0.15);
  }
  if (input.w1 && p.weapon !== 'PISTOL' && p.reloadT <= 0) {
    p.weapon = 'PISTOL'; p.fireT = Math.max(p.fireT, 0.15);
  }
  if (input.reload) startReload(world);
  if (input.fire && p.fireT <= 0 && p.reloadT <= 0) {
    const r = fireWeapon(world, p.weapon);
    if (r.fired && world.onShot) world.onShot(p.weapon, r.hits);
  }

  // Pickups (on foot only; driving collects nothing).
  if (!p.driving) {
    for (const pk of world.pickups) {
      if (pk.taken) continue;
      const d2 = (pk.x - p.x) ** 2 + (pk.y - p.y) ** 2;
      if (d2 < 0.55 * 0.55) collectPickup(world, pk);
    }
  }

  // Jump / gravity (eye-height bob; no vertical collision in a raycaster).
  if (!p.driving) {
    if (input.jump && p.onGround) { p.vy = CFG.JUMP_VEL; p.onGround = false; }
    if (!p.onGround) {
      p.vy -= CFG.GRAVITY * dt;
      p.eyeH += p.vy * dt;
      if (p.eyeH <= 0) { p.eyeH = 0; p.vy = 0; p.onGround = true; }
    }
  }
}

function updateOnFoot(world, dt, input) {
  const p = world.player;
  let mx = 0, mz = 0;
  if (input.f) mz += 1;
  if (input.b) mz -= 1;
  if (input.r) mx += 1;
  if (input.l) mx -= 1;
  const len = Math.hypot(mx, mz);
  p.moving = len > 0;
  if (len > 0) {
    mx /= len; mz /= len;
    const speed = input.sprint ? CFG.SPRINT_SPEED : CFG.WALK_SPEED;
    const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
    const dx = (cos * mz - sin * mx) * speed * dt;
    const dy = (sin * mz + cos * mx) * speed * dt;
    const pos = moveCircle(world.map, p.x, p.y, dx, dy, CFG.PLAYER_RADIUS);
    p.x = pos.x; p.y = pos.y;
    p.bobT += dt * speed * 1.6;
  }
}

function updateDriving(world, dt, input) {
  const p = world.player;
  // Steering follows the car heading; the camera yaw follows the car loosely
  // (mouse can still look around, car keeps its own heading).
  if (input.f) p.carSpeed += CFG.CAR_ACCEL * dt;
  else if (input.b) p.carSpeed -= CFG.CAR_BRAKE * dt;
  else p.carSpeed *= Math.max(0, 1 - 1.6 * dt);
  p.carSpeed = clamp(p.carSpeed, -3.5, CFG.CAR_MAX_SPEED);
  const steer = (input.l ? 1 : 0) - (input.r ? 1 : 0);
  const turnRate = CFG.CAR_TURN * clamp(Math.abs(p.carSpeed) / 4, 0, 1) * Math.sign(p.carSpeed || 1);
  p.carYaw += steer * turnRate * dt;
  p.yaw = p.carYaw;
  const dx = Math.cos(p.carYaw) * p.carSpeed * dt;
  const dy = Math.sin(p.carYaw) * p.carSpeed * dt;
  const pos = moveCircle(world.map, p.x, p.y, dx, dy, CFG.CAR_RADIUS);
  // A wall hit at speed scrubs speed (crash feel without damage).
  if (pos.x === p.x && Math.abs(dx) > 0.001) p.carSpeed *= 0.4;
  if (pos.y === p.y && Math.abs(dy) > 0.001) p.carSpeed *= 0.4;
  p.x = pos.x; p.y = pos.y;
  p.moving = Math.abs(p.carSpeed) > 0.5;
  if (p.moving) p.bobT += dt * Math.abs(p.carSpeed) * 1.2;
}

export function enterCar(world, car) {
  const p = world.player;
  if (p.driving || car.taken) return false;
  car.taken = true;
  p.driving = true;
  p.carSpeed = 0;
  p.carYaw = p.yaw;
  p.x = car.x; p.y = car.y;
  return true;
}

export function exitCar(world) {
  const p = world.player;
  if (!p.driving) return false;
  p.driving = false;
  p.carSpeed = 0;
  // Leave the car where it stopped so it can be re-entered.
  const car = world.drivenCar;
  if (car) {
    car.x = p.x; car.y = p.y;
    car.taken = false;
    world.drivenCar = null;
  }
  // Step out to the side of the car.
  const sx = p.x - Math.sin(p.yaw) * 0.8, sy = p.y + Math.cos(p.yaw) * 0.8;
  if (!world.map.grid[Math.floor(sy) * world.map.w + Math.floor(sx)]) { p.x = sx; p.y = sy; }
  return true;
}

export function collectPickup(world, pk) {
  const p = world.player;
  if (pk.kind === 'health') {
    if (p.hp >= CFG.PLAYER_HP) return;
    p.hp = Math.min(CFG.PLAYER_HP, p.hp + 30);
  } else if (pk.kind === 'armor') {
    if (p.armor >= CFG.PLAYER_ARMOR_MAX) return;
    p.armor = Math.min(CFG.PLAYER_ARMOR_MAX, p.armor + 50);
  } else if (pk.kind === 'ammo') {
    p.weapons.PISTOL.reserve += 24;
    if (p.weapons.SHOTGUN.owned) p.weapons.SHOTGUN.reserve += 12;
    if (!p.weapons.SHOTGUN.owned) {
      p.weapons.SHOTGUN.owned = true;
      p.weapons.SHOTGUN.ammo = CFG.SHOTGUN.mag;
      p.weapons.SHOTGUN.reserve = CFG.SHOTGUN.reserve;
    }
  }
  pk.taken = true;
  if (world.onPickup) world.onPickup(pk.kind);
}
