// Hitscan combat — pure logic, no DOM. A shot is a ray from the camera; the
// nearest enemy whose angular width covers the ray (and is closer than the
// wall behind it) takes damage. Returns a result object for feedback/sound.

import { CFG } from './config.js';
import { castRay } from './raycast.js';
import { angleDiff, dist2 } from './random.js';

// Fire one pellet. `spread` is a random angular offset in radians (0 = dead on).
// Returns {hit: bool, enemy?, damage?, wallDist}.
export function firePellet(world, angle, spread, damage) {
  const p = world.player;
  const a = angle + spread;
  const wall = castRay(world.map, p.x, p.y, a);
  let best = null, bestDist = wall.dist;
  for (const e of world.enemies) {
    if (e.hp <= 0) continue;
    const dx = e.x - p.x, dy = e.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d >= bestDist) continue;
    const ang = Math.atan2(dy, dx);
    const diff = Math.abs(angleDiff(ang, a));
    // Angular half-width of the enemy at this distance (generous: body + margin).
    const half = Math.atan2(0.34, d);
    if (diff <= half) {
      if (best === null || d < bestDist) { best = e; bestDist = d; }
    }
  }
  if (best) {
    damageEnemy(world, best, damage, 'player');
    return { hit: true, enemy: best, damage, wallDist: wall.dist, dist: bestDist };
  }
  return { hit: false, wallDist: wall.dist, dist: wall.dist };
}

// Fire a full weapon shot (all pellets). Mutates ammo. Returns {hits, kills}.
export function fireWeapon(world, weaponKey) {
  const p = world.player;
  const w = CFG[weaponKey];
  const slot = p.weapons[weaponKey];
  if (slot.ammo <= 0 || p.reloadT > 0 || p.fireT > 0 || p.weapon !== weaponKey) {
    return { hits: 0, kills: 0, fired: false };
  }
  slot.ammo -= 1;
  p.fireT = w.fireRate;
  p.muzzleT = 0.07;
  let hits = 0, kills = 0;
  for (let i = 0; i < w.pellets; i++) {
    const spread = (world.rng() * 2 - 1) * w.spread;
    const r = firePellet(world, p.yaw, spread, w.damage);
    if (r.hit) {
      hits += 1;
      if (r.enemy.hp <= 0) kills += 1;
    }
  }
  world.shotsFired += 1;
  if (hits > 0) world.shotsHit += 1;
  return { hits, kills, fired: true };
}

export function startReload(world) {
  const p = world.player;
  const w = CFG[p.weapon];
  const slot = p.weapons[p.weapon];
  if (p.reloadT > 0 || slot.ammo >= w.mag || slot.reserve <= 0) return false;
  p.reloadT = w.reload;
  return true;
}

export function finishReload(world) {
  const p = world.player;
  const w = CFG[p.weapon];
  const slot = p.weapons[p.weapon];
  const need = w.mag - slot.ammo;
  const take = Math.min(need, slot.reserve);
  slot.ammo += take;
  slot.reserve -= take;
}

// Damage an enemy. Handles death: cash/ammo drops, wanted, mission kill counts.
export function damageEnemy(world, enemy, dmg, cause) {
  if (enemy.hp <= 0) return;
  enemy.hp -= dmg;
  enemy.flashT = 0.12;
  if (cause === 'player') enemy.aggro = true;
  if (enemy.hp > 0) return;
  enemy.hp = 0;
  enemy.dead = true;
  world.kills += 1;
  const cash = enemy.type === 'police' ? 50 : 25;
  world.cash += cash;
  world.floaters.push({ x: enemy.x, y: enemy.y, text: `+$${cash}`, t: 1.2, color: '#ffd75e' });
  if (enemy.type === 'police') addWanted(world, 1);
  else addWanted(world, 0.5);
  // Drops: 40% ammo, 20% health.
  const roll = world.rng();
  if (roll < 0.4) world.pickups.push({ kind: 'ammo', x: enemy.x, y: enemy.y, taken: false, drop: true });
  else if (roll < 0.6) world.pickups.push({ kind: 'health', x: enemy.x, y: enemy.y, taken: false, drop: true });
  if (world.mission && world.mission.type === 'kill' && enemy.type === 'gang') {
    world.mission.kills = (world.mission.kills || 0) + 1;
  }
}

export function damagePlayer(world, dmg) {
  const p = world.player;
  if (p.hp <= 0 || world.state !== 'playing') return;
  let rest = dmg;
  if (p.armor > 0) {
    const absorbed = Math.min(p.armor, rest * 0.5);
    p.armor -= absorbed;
    rest -= absorbed;
  }
  p.hp -= rest;
  p.hurtT = 0.35;
  if (p.hp <= 0) {
    p.hp = 0;
    world.state = 'dead';
    world.deaths += 1;
  }
}

export function addWanted(world, amount) {
  world.wanted = Math.min(CFG.WANTED_MAX, world.wanted + amount);
  world.wantedFloat = world.wanted;
  world.lastCrimeT = world.time;
  if (world.wanted > world.bestWanted) world.bestWanted = world.wanted;
}

export function wantedStars(world) {
  return Math.floor(world.wanted + 1e-6);
}

// Enemy shoots at the player (hitscan with inaccuracy). Returns true if it hit.
export function enemyShoot(world, enemy) {
  const p = world.player;
  const d = Math.hypot(p.x - enemy.x, p.y - enemy.y);
  const wall = castRay(world.map, enemy.x, enemy.y, Math.atan2(p.y - enemy.y, p.x - enemy.x));
  if (wall.dist < d - 0.3) return false; // wall in the way
  const spread = 0.06 + d * 0.004;
  const roll = world.rng();
  // Hit chance falls with distance; wanted level makes police slightly sharper.
  const hitChance = Math.max(0.12, 0.55 - d * 0.02 - spread * 2);
  if (roll < hitChance) {
    const dmg = enemy.type === 'police' ? CFG.POLICE.damage : CFG.GANG.damage;
    damagePlayer(world, dmg);
    return true;
  }
  return false;
}

export function distToPlayer(world, e) {
  return Math.hypot(e.x - world.player.x, e.y - world.player.y);
}

export function enemyInView(world, e) {
  const p = world.player;
  const ang = Math.atan2(e.y - p.y, e.x - p.x);
  return Math.abs(angleDiff(ang, p.yaw)) < 0.6;
}
