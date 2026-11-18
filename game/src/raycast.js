// Pure raycasting math (DDA) — no DOM, Node-safe. Used by the renderer and by
// hitscan/LOS logic. Angles in radians; 0 = east (+x), positive = CCW (toward +y).

import { TILE } from './config.js';

// Cast one ray from (px,py) along `angle`. Returns the first wall hit:
// {dist (perpendicular), side (0 = x-side, 1 = y-side), tex (tile id),
//  mapX, mapY, wallX (0..1 position along the wall face), hitX, hitY}.
export function castRay(map, px, py, angle) {
  const dirX = Math.cos(angle), dirY = Math.sin(angle);
  let mapX = Math.floor(px), mapY = Math.floor(py);
  const deltaX = dirX === 0 ? 1e30 : Math.abs(1 / dirX);
  const deltaY = dirY === 0 ? 1e30 : Math.abs(1 / dirY);
  let stepX, stepY, sideX, sideY;
  if (dirX < 0) { stepX = -1; sideX = (px - mapX) * deltaX; }
  else { stepX = 1; sideX = (mapX + 1 - px) * deltaX; }
  if (dirY < 0) { stepY = -1; sideY = (py - mapY) * deltaY; }
  else { stepY = 1; sideY = (mapY + 1 - py) * deltaY; }
  let side = 0, tex = TILE.BOUNDARY, guard = 0;
  for (;;) {
    if (sideX < sideY) { sideX += deltaX; mapX += stepX; side = 0; }
    else { sideY += deltaY; mapY += stepY; side = 1; }
    if (mapX < 0 || mapY < 0 || mapX >= map.w || mapY >= map.h) {
      tex = TILE.BOUNDARY;
      break;
    }
    tex = map.grid[mapY * map.w + mapX];
    if (tex !== TILE.OPEN) break;
    if (++guard > 256) break;
  }
  let dist;
  if (side === 0) dist = (mapX - px + (1 - stepX) / 2) / (dirX || 1e-30);
  else dist = (mapY - py + (1 - stepY) / 2) / (dirY || 1e-30);
  if (!Number.isFinite(dist) || dist < 0) dist = 0.001;
  // Exact position along the wall face (for the texture column).
  const wallX = side === 0 ? py + dist * dirY : px + dist * dirX;
  const frac = wallX - Math.floor(wallX);
  return { dist, side, tex, mapX, mapY, wallX: frac, hitX: px + dist * dirX, hitY: py + dist * dirY };
}

// Project a world point into screen space for a camera at (px,py) with yaw and
// a camera plane (planeX, planeY). Returns {screenX (0..1 of width), depth}
// or null when behind the camera.
export function projectPoint(px, py, yaw, planeX, planeY, sx, sy) {
  const dirX = Math.cos(yaw), dirY = Math.sin(yaw);
  const relX = sx - px, relY = sy - py;
  const invDet = 1 / (planeX * dirY - dirX * planeY);
  const transformX = invDet * (dirY * relX - dirX * relY);
  const transformY = invDet * (-planeY * relX + planeX * relY);
  if (transformY <= 0.05) return null;
  return { screenX: 0.5 * (1 + transformX / transformY), depth: transformY };
}

// Camera plane for a given yaw and FOV (perpendicular to the view direction).
export function cameraPlane(yaw, fovRad) {
  const t = Math.tan(fovRad / 2);
  return { x: -Math.sin(yaw) * t, y: Math.cos(yaw) * t };
}
