// City map generation, collision and line-of-sight. Pure: no DOM, Node-safe.
// The city is a 40x40 grid. Roads run every 6 cells (2 cells wide); the blocks
// between them are buildings. The outer ring is a boundary wall; the south rows
// are the harbor plaza. Street cells are open; building cells are solid walls
// with a texture id (1..7).

import { CFG, TILE, FLOOR, MISSIONS, PICKUPS, PARKED_CARS, PLAYER_START } from './config.js';
import { mulberry32, pick } from './random.js';

export function generateMap(seed) {
  const rng = mulberry32(seed ?? CFG.MAP_SEED);
  const W = CFG.MAP_W, H = CFG.MAP_H;
  const grid = new Uint8Array(W * H);
  const floor = new Uint8Array(W * H);

  const at = (x, y) => grid[y * W + x];
  const set = (x, y, v) => { grid[y * W + x] = v; };

  // 1) Base layout: border wall, roads, buildings.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) { set(x, y, TILE.BOUNDARY); continue; }
      const road = (x % 6 < 2) || (y % 6 < 2);
      if (road) { set(x, y, TILE.OPEN); continue; }
      // Building cell: pick a texture; taller blocks get neon/glass fronts.
      const r = rng();
      const tex = r < 0.42 ? TILE.BRICK : r < 0.68 ? TILE.CONCRETE : r < 0.86 ? TILE.NEON : TILE.GLASS;
      set(x, y, tex);
    }
  }

  // 2) Harbor plaza: open the south rows (y 36..38) as a waterfront plaza.
  for (let y = 36; y <= 38; y++) {
    for (let x = 1; x < W - 1; x++) set(x, y, TILE.OPEN);
  }
  // Harbor wall along the very south edge (the water side) stays boundary.

  // 3) Special buildings: Lantern Bar (the block x 8..11, y 8..11) and Chop
  // Shop (the block x 26..29, y 26..29). Their street-facing fronts are the
  // road rows just north of them (y 7 and y 25) — where the mission markers sit.
  const barBlock = { x0: 8, y0: 8, x1: 11, y1: 11 };
  const chopBlock = { x0: 26, y0: 26, x1: 29, y1: 29 };
  for (let y = barBlock.y0; y <= barBlock.y1; y++) {
    for (let x = barBlock.x0; x <= barBlock.x1; x++) set(x, y, TILE.BAR);
  }
  for (let y = chopBlock.y0; y <= chopBlock.y1; y++) {
    for (let x = chopBlock.x0; x <= chopBlock.x1; x++) set(x, y, TILE.CHOP);
  }

  // 4) Floor types: road cells are asphalt; open cells next to a building are
  // sidewalk; the harbor plaza is plaza tile.
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (at(x, y) !== TILE.OPEN) continue;
      if (y >= 36) { floor[y * W + x] = FLOOR.PLAZA; continue; }
      let nearBuilding = false;
      for (let dy = -1; dy <= 1 && !nearBuilding; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (at(x + dx, y + dy) > TILE.OPEN) { nearBuilding = true; break; }
        }
      }
      floor[y * W + x] = nearBuilding ? FLOOR.WALK : FLOOR.ROAD;
    }
  }

  // 5) A few rooftop AC / prop markers are purely visual (rendered as sprites);
  // the map itself stays a clean wall grid so the raycaster stays fast.

  return {
    w: W, h: H, grid, floor, seed: seed ?? CFG.MAP_SEED,
    playerStart: { ...PLAYER_START },
    missions: MISSIONS.map((m) => ({ ...m })),
    pickups: PICKUPS.map((p) => ({ ...p, taken: false })),
    cars: PARKED_CARS.map((c) => ({ ...c, taken: false })),
  };
}

export function isWall(map, x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= map.w || iy >= map.h) return true;
  return map.grid[iy * map.w + ix] !== TILE.OPEN;
}

export function tileAt(map, x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= map.w || iy >= map.h) return TILE.BOUNDARY;
  return map.grid[iy * map.w + ix];
}

export function floorAt(map, x, y) {
  const ix = Math.floor(x), iy = Math.floor(y);
  if (ix < 0 || iy < 0 || ix >= map.w || iy >= map.h) return FLOOR.ROAD;
  return map.floor[iy * map.w + ix];
}

// Circle-vs-grid collision: try to move (x,y) by (dx,dy) with radius r.
// Slides along walls. Returns the new position.
export function moveCircle(map, x, y, dx, dy, r) {
  let nx = x + dx;
  if (!circleHits(map, nx, y, r)) x = nx;
  let ny = y + dy;
  if (!circleHits(map, x, ny, r)) y = ny;
  return { x, y };
}

export function circleHits(map, x, y, r) {
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
  const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
  for (let iy = y0; iy <= y1; iy++) {
    for (let ix = x0; ix <= x1; ix++) {
      if (ix < 0 || iy < 0 || ix >= map.w || iy >= map.h) return true;
      if (map.grid[iy * map.w + ix] === TILE.OPEN) continue;
      // Closest point of the solid cell to the circle centre.
      const cx = Math.max(ix, Math.min(x, ix + 1));
      const cy = Math.max(iy, Math.min(y, iy + 1));
      const ddx = x - cx, ddy = y - cy;
      if (ddx * ddx + ddy * ddy < r * r) return true;
    }
  }
  return false;
}

// Line of sight between two points (DDA over the grid). True if no wall blocks.
export function hasLOS(map, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.ceil(dist * 4);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (isWall(map, x0 + dx * t, y0 + dy * t)) return false;
  }
  return true;
}

// BFS over open cells: is every mission marker + pickup reachable from start?
export function reachable(map) {
  const W = map.w, H = map.h;
  const seen = new Uint8Array(W * H);
  const q = [[Math.floor(map.playerStart.x), Math.floor(map.playerStart.y)]];
  seen[q[0][1] * W + q[0][0]] = 1;
  while (q.length) {
    const [cx, cy] = q.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (seen[ny * W + nx]) continue;
      if (map.grid[ny * W + nx] !== TILE.OPEN) continue;
      seen[ny * W + nx] = 1;
      q.push([nx, ny]);
    }
  }
  const points = [
    ...map.missions.map((m) => m.marker),
    ...map.pickups.map((p) => ({ x: p.x, y: p.y })),
    ...map.cars.map((c) => ({ x: c.x, y: c.y })),
  ];
  return points.every((p) => seen[Math.floor(p.y) * W + Math.floor(p.x)] === 1);
}
