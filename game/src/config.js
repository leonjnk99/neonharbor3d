// NEONHARBOR 3D — configuration. Pure data, no DOM: safe to import in Node tests.
// A first-person open-world crime game in a neon harbor city. All tuning lives here.

export const CFG = {
  // Map
  MAP_W: 40,
  MAP_H: 40,
  MAP_SEED: 1337,
  // Rendering
  BUF_W: 480,
  BUF_H: 270,
  FOV_DEG: 66,
  EYE_HEIGHT: 0.5,
  // Player
  WALK_SPEED: 3.4,
  SPRINT_SPEED: 5.4,
  PLAYER_RADIUS: 0.22,
  PLAYER_HP: 100,
  PLAYER_ARMOR_MAX: 100,
  JUMP_VEL: 4.2,
  GRAVITY: 11,
  // Driving
  CAR_ACCEL: 6.0,
  CAR_MAX_SPEED: 9.5,
  CAR_BRAKE: 10,
  CAR_TURN: 1.9,
  CAR_RADIUS: 0.34,
  // Combat
  PISTOL: { name: 'Pistol', damage: 34, mag: 12, reserve: 48, fireRate: 0.26, reload: 1.05, spread: 0.014, pellets: 1, range: 30 },
  SHOTGUN: { name: 'Shotgun', damage: 13, mag: 6, reserve: 18, fireRate: 0.85, reload: 1.9, spread: 0.085, pellets: 6, range: 16 },
  // Enemies
  GANG: { hp: 60, speed: 1.7, damage: 9, cooldown: 1.5, range: 14, aggro: 12, score: 25 },
  POLICE: { hp: 90, speed: 2.3, damage: 7, cooldown: 1.15, range: 16, aggro: 17, score: 50 },
  ENEMY_RADIUS: 0.3,
  // Wanted
  WANTED_DECAY_S: 25,
  WANTED_MAX: 5,
  // Missions
  MISSION_TIME_LIMIT: 90,
};

// Wall tile ids (map grid values). 0 = open street.
export const TILE = {
  OPEN: 0,
  BRICK: 1,
  CONCRETE: 2,
  NEON: 3,
  GLASS: 4,
  BAR: 5,
  CHOP: 6,
  BOUNDARY: 7,
};

// Floor tile ids (per-cell ground). Derived from the wall grid at generation.
export const FLOOR = { ROAD: 0, WALK: 1, PLAZA: 2 };

// Mission definitions. marker = {x, y} street cell centre the player must reach.
// type: 'goto' | 'kill' | 'drive' | 'waves' | 'timed'
export const MISSIONS = [
  {
    id: 1, type: 'goto', name: 'First Job',
    brief: 'Meet the fixer at the Lantern Bar. Follow the yellow beacon.',
    marker: { x: 10.5, y: 7.5 }, reward: 100,
  },
  {
    id: 2, type: 'kill', name: 'Alley Heat',
    brief: 'Clear the alley: take out 4 rival gang members.',
    marker: { x: 14.5, y: 13.5 }, count: 4, reward: 150,
  },
  {
    id: 3, type: 'drive', name: 'Hot Wheels',
    brief: 'Steal the parked sedan (press E), then drive it to the Chop Shop.',
    carAt: { x: 7.5, y: 20.5 }, marker: { x: 28.5, y: 25.5 }, reward: 300,
  },
  {
    id: 4, type: 'waves', name: 'Ambush',
    brief: 'Survive 3 waves at the plaza. Hold the line.',
    marker: { x: 20.5, y: 19.5 }, waves: 3, reward: 400,
  },
  {
    id: 5, type: 'timed', name: 'Harbor Getaway',
    brief: 'The heat is on. Reach the harbor in 90 seconds — 4 stars and counting.',
    marker: { x: 20.5, y: 37.5 }, timeLimit: 90, reward: 500,
  },
];

export const SAVE_KEY = 'neonharbor3d-save-v1';

// Fixed pickup placements (street cells) — health, armor, ammo.
export const PICKUPS = [
  { kind: 'health', x: 4.5, y: 13.5 }, { kind: 'health', x: 25.5, y: 7.5 },
  { kind: 'health', x: 31.5, y: 31.5 }, { kind: 'health', x: 13.5, y: 31.5 },
  { kind: 'armor', x: 7.5, y: 31.5 }, { kind: 'armor', x: 31.5, y: 13.5 },
  { kind: 'armor', x: 19.5, y: 25.5 },
  { kind: 'ammo', x: 13.5, y: 7.5 }, { kind: 'ammo', x: 25.5, y: 19.5 },
  { kind: 'ammo', x: 7.5, y: 25.5 }, { kind: 'ammo', x: 31.5, y: 25.5 },
  { kind: 'ammo', x: 19.5, y: 13.5 },
];

// Parked cars (decorative + the mission-3 car). The mission car is the first entry.
export const PARKED_CARS = [
  { x: 7.5, y: 20.5, color: 'red', mission: true },
  { x: 13.5, y: 25.5, color: 'blue' },
  { x: 25.5, y: 13.5, color: 'taxi' },
  { x: 31.5, y: 19.5, color: 'green' },
  { x: 19.5, y: 7.5, color: 'purple' },
  { x: 4.5, y: 25.5, color: 'blue' },
];

export const PLAYER_START = { x: 1.5, y: 6.5, yaw: 0 };
