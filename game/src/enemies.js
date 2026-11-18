// Enemy AI, spawning and the wanted system. Pure logic, no DOM.
// Gang members patrol alleys; police spawn at the map edge as wanted rises.
// Enemies chase when they see the player, and shoot when in range with LOS.

import { CFG } from './config.js';
import { moveCircle, hasLOS, isWall } from './map.js';
import { enemyShoot, wantedStars, distToPlayer } from './combat.js';
import { angleDiff, clamp, dist2 } from './random.js';

let nextId = 1;

export function spawnEnemy(world, type, x, y) {
  const stats = type === 'police' ? CFG.POLICE : CFG.GANG;
  const e = {
    id: nextId++, type, x, y,
    hp: stats.hp, maxHp: stats.hp,
    yaw: world.rng() * Math.PI * 2,
    speed: stats.speed * (0.9 + world.rng() * 0.2),
    cooldown: 0.5 + world.rng(),
    aggro: false, dead: false, flashT: 0,
    patrolTx: x, patrolTy: y, patrolT: 0,
    shootT: 0,
  };
  world.enemies.push(e);
  return e;
}

// Spawn points: random open street cell at least `minDist` from the player.
export function randomStreetSpot(world, minDist) {
  const map = world.map;
  for (let tries = 0; tries < 40; tries++) {
    const x = 1.5 + world.rng() * (map.w - 3);
    const y = 1.5 + world.rng() * (map.h - 3);
    if (isWall(map, x, y)) continue;
    if (dist2(x, y, world.player.x, world.player.y) < minDist * minDist) continue;
    return { x, y };
  }
  return { x: world.player.x + 6, y: world.player.y };
}

export function updateEnemies(world, dt) {
  const p = world.player;
  // Separation: push overlapping enemies apart.
  const list = world.enemies;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.dead) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < 0.6 * 0.6 && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (0.6 - d) * 0.5;
        const nx = dx / d, ny = dy / d;
        const pa = moveCircle(world.map, a.x, a.y, -nx * push, -ny * push, CFG.ENEMY_RADIUS);
        const pb = moveCircle(world.map, b.x, b.y, nx * push, ny * push, CFG.ENEMY_RADIUS);
        a.x = pa.x; a.y = pa.y; b.x = pb.x; b.y = pb.y;
      }
    }
  }

  for (const e of list) {
    if (e.dead) continue;
    e.flashT = Math.max(0, e.flashT - dt);
    e.cooldown -= dt;
    const d = distToPlayer(world, e);
    const stats = e.type === 'police' ? CFG.POLICE : CFG.GANG;
    const sees = d < stats.aggro && hasLOS(world.map, e.x, e.y, p.x, p.y);
    if (sees) e.aggro = true;
    if (p.hp <= 0) e.aggro = false;

    if (e.aggro && p.hp > 0) {
      // Face the player.
      const want = Math.atan2(p.y - e.y, p.x - e.x);
      e.yaw += angleDiff(want, e.yaw) * Math.min(1, dt * 8);
      if (d > 2.2) {
        // Chase, sliding along walls.
        const dx = Math.cos(e.yaw) * e.speed * dt;
        const dy = Math.sin(e.yaw) * e.speed * dt;
        const pos = moveCircle(world.map, e.x, e.y, dx, dy, CFG.ENEMY_RADIUS);
        e.x = pos.x; e.y = pos.y;
      }
      // Shoot when in range with line of sight.
      if (d < stats.range && e.cooldown <= 0) {
        e.cooldown = stats.cooldown * (0.85 + world.rng() * 0.3);
        e.shootT = 0.08;
        const hit = enemyShoot(world, e);
        if (world.onEnemyShot) world.onEnemyShot(e, hit);
      }
    } else {
      // Patrol: drift to a nearby waypoint, then pick another.
      e.patrolT -= dt;
      const pdx = e.patrolTx - e.x, pdy = e.patrolTy - e.y;
      const pd = Math.hypot(pdx, pdy);
      if (pd < 0.4 || e.patrolT <= 0) {
        const spot = randomStreetSpot(world, 8);
        e.patrolTx = spot.x; e.patrolTy = spot.y;
        e.patrolT = 6 + world.rng() * 4;
      } else {
        const want = Math.atan2(pdy, pdx);
        e.yaw += angleDiff(want, e.yaw) * Math.min(1, dt * 4);
        const dx = Math.cos(e.yaw) * e.speed * 0.4 * dt;
        const dy = Math.sin(e.yaw) * e.speed * 0.4 * dt;
        const pos = moveCircle(world.map, e.x, e.y, dx, dy, CFG.ENEMY_RADIUS);
        e.x = pos.x; e.y = pos.y;
      }
    }
    e.shootT = Math.max(0, (e.shootT || 0) - dt);
  }

  // Remove the dead (keep the count bounded; corpses fade in the renderer).
  if (list.length > 40) {
    world.enemies = list.filter((e) => !e.dead).concat(list.filter((e) => e.dead).slice(-6));
  }
}

// Wanted upkeep: police spawn pressure + decay.
export function updateWanted(world, dt) {
  const stars = wantedStars(world);
  // Decay: one star per WANTED_DECAY_S without a crime and no police near.
  if (world.time - world.lastCrimeT > 10 && stars > 0) {
    world.wantedDecay = (world.wantedDecay || 0) + dt;
    if (world.wantedDecay >= CFG.WANTED_DECAY_S) {
      world.wantedDecay = 0;
      world.wanted = Math.max(0, world.wanted - 1);
    }
  } else world.wantedDecay = 0;

  // Police pressure: desired alive police = stars * 2 (cap 10), none at 0 stars
  // unless a mission forces them (mission 5 sets wanted 4 directly).
  const want = Math.min(10, stars * 2);
  const alive = world.enemies.filter((e) => e.type === 'police' && !e.dead).length;
  world.policeSpawnT = (world.policeSpawnT || 0) - dt;
  if (alive < want && world.policeSpawnT <= 0) {
    world.policeSpawnT = 2.5;
    const spot = randomStreetSpot(world, 10);
    spawnEnemy(world, 'police', spot.x, spot.y);
  }

  // Ambient gang: keep a few rivals roaming the streets.
  const gangAlive = world.enemies.filter((e) => e.type === 'gang' && !e.dead).length;
  world.gangSpawnT = (world.gangSpawnT || 0) - dt;
  if (gangAlive < 4 && world.gangSpawnT <= 0) {
    world.gangSpawnT = 5;
    const spot = randomStreetSpot(world, 9);
    spawnEnemy(world, 'gang', spot.x, spot.y);
  }
}

export function aliveEnemies(world, type) {
  return world.enemies.filter((e) => !e.dead && (!type || e.type === type));
}
