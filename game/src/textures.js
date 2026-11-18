// Procedural textures — every pixel generated in code, zero network.
// Wall/floor textures are 64x64; sprites are small canvases converted to
// Uint32 pixel arrays (ABGR, matching ImageData on little-endian).
// Browser-only (uses document/canvas); never imported by Node tests.

import { mulberry32 } from './random.js';

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function toPixels(canvas) {
  const ctx = canvas.getContext('2d');
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data: new Uint32Array(img.data.buffer), w: canvas.width, h: canvas.height };
}

function speckle(ctx, rng, w, h, n, colors, alpha) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = colors[Math.floor(rng() * colors.length)];
    ctx.globalAlpha = alpha * (0.4 + rng() * 0.6);
    ctx.fillRect(Math.floor(rng() * w), Math.floor(rng() * h), 1 + Math.floor(rng() * 2), 1 + Math.floor(rng() * 2));
  }
  ctx.globalAlpha = 1;
}

function brickWall(rng, base, mortar, neon) {
  const c = makeCanvas(64, 64), ctx = c.getContext('2d');
  ctx.fillStyle = mortar; ctx.fillRect(0, 0, 64, 64);
  const rows = 8, bh = 8, bw = 16;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * bw / 2;
    for (let x = -1; x < 5; x++) {
      const shade = 0.85 + rng() * 0.3;
      ctx.fillStyle = shadeColor(base, shade);
      ctx.fillRect(x * bw + off + 1, r * bh + 1, bw - 2, bh - 2);
    }
  }
  if (neon) {
    // A neon tube sign across the wall.
    ctx.fillStyle = neon;
    ctx.fillRect(6, 26, 52, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(6, 27, 52, 1);
    ctx.fillStyle = neon;
    ctx.globalAlpha = 0.35;
    ctx.fillRect(4, 20, 56, 15);
    ctx.globalAlpha = 1;
  }
  speckle(ctx, rng, 64, 64, 160, ['#000000', '#ffffff'], 0.12);
  return toPixels(c);
}

function concreteWall(rng) {
  const c = makeCanvas(64, 64), ctx = c.getContext('2d');
  ctx.fillStyle = '#5a5f66'; ctx.fillRect(0, 0, 64, 64);
  speckle(ctx, rng, 64, 64, 420, ['#3c4046', '#767c85', '#2c2f34'], 0.35);
  ctx.fillStyle = '#484d54';
  for (let y = 0; y < 64; y += 16) ctx.fillRect(0, y, 64, 1);
  ctx.fillStyle = '#6a7078';
  ctx.fillRect(0, 0, 64, 2);
  return toPixels(c);
}

function glassWall(rng) {
  const c = makeCanvas(64, 64), ctx = c.getContext('2d');
  ctx.fillStyle = '#0e1a26'; ctx.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const lit = rng() < 0.35;
      ctx.fillStyle = lit ? (rng() < 0.5 ? '#ffd75e' : '#7de3ff') : '#16283a';
      ctx.fillRect(x * 16 + 2, y * 16 + 2, 12, 12);
      ctx.fillStyle = '#0a121c';
      ctx.fillRect(x * 16 + 2, y * 16 + 8, 12, 2);
    }
  }
  ctx.fillStyle = '#2a3644';
  for (let i = 0; i < 4; i++) { ctx.fillRect(i * 16, 0, 1, 64); ctx.fillRect(0, i * 16, 64, 1); }
  return toPixels(c);
}

function barWall(rng) {
  const c = makeCanvas(64, 64), ctx = c.getContext('2d');
  ctx.fillStyle = '#2a1a12'; ctx.fillRect(0, 0, 64, 64);
  // Wood planks.
  for (let y = 0; y < 64; y += 8) {
    ctx.fillStyle = y % 16 === 0 ? '#3a2418' : '#2e1c13';
    ctx.fillRect(0, y, 64, 7);
  }
  // Glowing LANTERN sign.
  ctx.fillStyle = '#ffb52e';
  ctx.fillRect(4, 12, 56, 14);
  ctx.fillStyle = '#1a0e06';
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('LANTERN', 32, 23);
  ctx.fillStyle = '#ffb52e';
  ctx.globalAlpha = 0.3;
  ctx.fillRect(2, 8, 60, 22);
  ctx.globalAlpha = 1;
  speckle(ctx, rng, 64, 64, 120, ['#000000'], 0.2);
  return toPixels(c);
}

function chopWall(rng) {
  const c = makeCanvas(64, 64), ctx = c.getContext('2d');
  ctx.fillStyle = '#3a3f45'; ctx.fillRect(0, 0, 64, 64);
  speckle(ctx, rng, 64, 64, 260, ['#22252a', '#565d66'], 0.3);
  // Hazard stripes along the bottom.
  for (let x = -8; x < 72; x += 16) {
    ctx.fillStyle = '#f7c948';
    ctx.beginPath();
    ctx.moveTo(x, 64); ctx.lineTo(x + 8, 52); ctx.lineTo(x + 16, 52); ctx.lineTo(x + 8, 64);
    ctx.fill();
  }
  ctx.fillStyle = '#f7c948';
  ctx.fillRect(4, 10, 56, 12);
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('CHOP SHOP', 32, 19);
  return toPixels(c);
}

function boundaryWall(rng) {
  const c = makeCanvas(64, 64), ctx = c.getContext('2d');
  ctx.fillStyle = '#23262b'; ctx.fillRect(0, 0, 64, 64);
  speckle(ctx, rng, 64, 64, 300, ['#14161a', '#33383f'], 0.3);
  ctx.fillStyle = '#3d434b';
  for (let x = 0; x < 64; x += 8) ctx.fillRect(x, 0, 2, 64);
  ctx.fillStyle = '#ff5e5e';
  ctx.fillRect(0, 4, 64, 2);
  return toPixels(c);
}

function roadFloor(rng) {
  const c = makeCanvas(64, 64), ctx = c.getContext('2d');
  ctx.fillStyle = '#17181c'; ctx.fillRect(0, 0, 64, 64);
  speckle(ctx, rng, 64, 64, 500, ['#0c0d10', '#232529', '#2e3036'], 0.4);
  // Faint centre dashes (they tile per cell, reading as a dotted grid).
  ctx.fillStyle = '#8a7d3a';
  ctx.fillRect(30, 4, 4, 14);
  ctx.fillRect(30, 46, 4, 14);
  return toPixels(c);
}

function walkFloor(rng) {
  const c = makeCanvas(64, 64), ctx = c.getContext('2d');
  ctx.fillStyle = '#3f3a35'; ctx.fillRect(0, 0, 64, 64);
  // Brick sidewalk slabs.
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const s = 0.9 + rng() * 0.2;
      ctx.fillStyle = shadeColor('#4a4238', s);
      ctx.fillRect(x * 16 + 1, y * 16 + 1, 14, 14);
    }
  }
  speckle(ctx, rng, 64, 64, 200, ['#000000', '#ffffff'], 0.1);
  return toPixels(c);
}

function plazaFloor(rng) {
  const c = makeCanvas(64, 64), ctx = c.getContext('2d');
  ctx.fillStyle = '#2c2f38'; ctx.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#343845' : '#2a2e39';
      ctx.fillRect(x * 16 + 1, y * 16 + 1, 14, 14);
    }
  }
  ctx.fillStyle = '#37e0c8';
  ctx.globalAlpha = 0.5;
  ctx.fillRect(0, 30, 64, 2);
  ctx.globalAlpha = 1;
  return toPixels(c);
}

function shadeColor(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

// --- Sprites (billboards) ---
function humanoid(palette) {
  const c = makeCanvas(48, 64), ctx = c.getContext('2d');
  // Legs
  ctx.fillStyle = palette.pants;
  ctx.fillRect(18, 40, 6, 22);
  ctx.fillRect(25, 40, 6, 22);
  ctx.fillStyle = '#111111';
  ctx.fillRect(17, 60, 8, 3);
  ctx.fillRect(24, 60, 8, 3);
  // Torso (jacket)
  ctx.fillStyle = palette.jacket;
  ctx.fillRect(14, 22, 21, 19);
  ctx.fillStyle = palette.shirt;
  ctx.fillRect(21, 22, 7, 19);
  // Arms + gun (held to the side)
  ctx.fillStyle = palette.jacket;
  ctx.fillRect(10, 24, 4, 16);
  ctx.fillRect(35, 24, 4, 12);
  ctx.fillStyle = '#1c1e22';
  ctx.fillRect(35, 34, 10, 4);
  ctx.fillRect(43, 34, 3, 3);
  // Head + cap
  ctx.fillStyle = palette.skin;
  ctx.fillRect(19, 8, 11, 13);
  ctx.fillStyle = palette.cap;
  ctx.fillRect(18, 5, 13, 5);
  ctx.fillRect(18, 9, 16, 2);
  // Shading: darker left edge.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(14, 22, 3, 40);
  return toPixels(c);
}

function pickupSprite(kind) {
  const c = makeCanvas(24, 24), ctx = c.getContext('2d');
  if (kind === 'health') {
    ctx.fillStyle = '#f2f2f2'; ctx.fillRect(3, 3, 18, 18);
    ctx.fillStyle = '#e33'; ctx.fillRect(10, 6, 4, 12); ctx.fillRect(6, 10, 12, 4);
  } else if (kind === 'armor') {
    ctx.fillStyle = '#2f6fd0';
    ctx.beginPath(); ctx.moveTo(12, 2); ctx.lineTo(21, 6); ctx.lineTo(21, 13); ctx.lineTo(12, 22); ctx.lineTo(3, 13); ctx.lineTo(3, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#bcd6ff'; ctx.fillRect(10, 7, 4, 9); ctx.fillRect(7, 10, 10, 3);
  } else {
    ctx.fillStyle = '#7a5c1e'; ctx.fillRect(3, 8, 18, 10);
    ctx.fillStyle = '#f7c948'; ctx.fillRect(5, 5, 14, 4);
    ctx.fillStyle = '#111'; ctx.fillRect(8, 11, 3, 4); ctx.fillRect(13, 11, 3, 4);
  }
  return toPixels(c);
}

function carSprite(color) {
  const c = makeCanvas(64, 32), ctx = c.getContext('2d');
  const body = { red: '#c22', blue: '#2456c2', taxi: '#f7c948', green: '#2a8a4a', purple: '#7a3fd0' }[color] || '#888';
  // Body (side profile).
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(4, 26); ctx.lineTo(6, 16); ctx.lineTo(16, 12); ctx.lineTo(26, 10); ctx.lineTo(40, 10); ctx.lineTo(50, 14); ctx.lineTo(60, 18); ctx.lineTo(60, 26);
  ctx.closePath(); ctx.fill();
  // Windows.
  ctx.fillStyle = '#9fd8ef';
  ctx.fillRect(18, 13, 9, 5);
  ctx.fillRect(29, 12, 10, 6);
  // Wheels.
  ctx.fillStyle = '#0c0c0c';
  ctx.beginPath(); ctx.arc(16, 27, 5, 0, 7); ctx.arc(48, 27, 5, 0, 7); ctx.fill();
  ctx.fillStyle = '#666';
  ctx.beginPath(); ctx.arc(16, 27, 2, 0, 7); ctx.arc(48, 27, 2, 0, 7); ctx.fill();
  // Headlight.
  ctx.fillStyle = '#fff8c0';
  ctx.fillRect(58, 19, 3, 3);
  return toPixels(c);
}

function beaconSprite() {
  const c = makeCanvas(16, 96), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 96);
  g.addColorStop(0, 'rgba(255,215,94,0)');
  g.addColorStop(0.5, 'rgba(255,215,94,0.55)');
  g.addColorStop(1, 'rgba(255,215,94,0.95)');
  ctx.fillStyle = g;
  ctx.fillRect(5, 0, 6, 96);
  ctx.fillStyle = '#ffd75e';
  ctx.beginPath(); ctx.moveTo(8, 88); ctx.lineTo(15, 96); ctx.lineTo(1, 96); ctx.closePath(); ctx.fill();
  return toPixels(c);
}

function lampSprite() {
  const c = makeCanvas(16, 48), ctx = c.getContext('2d');
  ctx.fillStyle = '#22242a'; ctx.fillRect(7, 8, 2, 40);
  ctx.fillStyle = '#ffd75e'; ctx.fillRect(4, 2, 8, 6);
  ctx.fillStyle = 'rgba(255,215,94,0.35)'; ctx.fillRect(1, 0, 14, 10);
  return toPixels(c);
}

export function buildTextures(seed) {
  const rng = mulberry32(seed || 1337);
  const walls = {
    1: brickWall(rng, '#7a3b2e', '#4a2a22', null),
    2: concreteWall(rng),
    3: brickWall(rng, '#4a2e4a', '#2a1a2a', '#ff4fd8'),
    4: glassWall(rng),
    5: barWall(rng),
    6: chopWall(rng),
    7: boundaryWall(rng),
  };
  const floors = { 0: roadFloor(rng), 1: walkFloor(rng), 2: plazaFloor(rng) };
  const sprites = {
    gang: humanoid({ pants: '#1e1e26', jacket: '#a11f1f', shirt: '#e8e8e8', skin: '#d9a066', cap: '#5c1010' }),
    police: humanoid({ pants: '#101c33', jacket: '#1d3a6e', shirt: '#9db8e8', skin: '#c98d5f', cap: '#12233f' }),
    health: pickupSprite('health'),
    armor: pickupSprite('armor'),
    ammo: pickupSprite('ammo'),
    carRed: carSprite('red'), carBlue: carSprite('blue'), carTaxi: carSprite('taxi'),
    carGreen: carSprite('green'), carPurple: carSprite('purple'),
    beacon: beaconSprite(),
    lamp: lampSprite(),
  };
  return { walls, floors, sprites };
}

// Sky: vertical gradient + neon skyline silhouette (parallax, 960x135).
export function buildSky() {
  const c = makeCanvas(960, 135), ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 135);
  g.addColorStop(0, '#05060f');
  g.addColorStop(0.55, '#141033');
  g.addColorStop(0.85, '#3a1a4a');
  g.addColorStop(1, '#5c2350');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 960, 135);
  // Moon.
  ctx.fillStyle = '#f5ecd7';
  ctx.beginPath(); ctx.arc(760, 34, 14, 0, 7); ctx.fill();
  ctx.fillStyle = '#d8cdb2';
  ctx.beginPath(); ctx.arc(755, 30, 3, 0, 7); ctx.arc(766, 38, 2, 0, 7); ctx.fill();
  // Skyline silhouettes with lit windows.
  const rng = mulberry32(99);
  for (let x = 0; x < 960;) {
    const w = 24 + Math.floor(rng() * 46);
    const h = 34 + Math.floor(rng() * 62);
    ctx.fillStyle = '#0a0a18';
    ctx.fillRect(x, 135 - h, w, h);
    for (let i = 0; i < w * h / 90; i++) {
      ctx.fillStyle = rng() < 0.5 ? '#ffd75e' : '#7de3ff';
      ctx.globalAlpha = 0.5 + rng() * 0.5;
      ctx.fillRect(x + 3 + Math.floor(rng() * (w - 6)), 135 - h + 4 + Math.floor(rng() * (h - 8)), 2, 3);
    }
    ctx.globalAlpha = 1;
    // Neon roof sign on some towers.
    if (rng() < 0.3) {
      ctx.fillStyle = ['#ff4fd8', '#37e0c8', '#ffd75e'][Math.floor(rng() * 3)];
      ctx.fillRect(x + 4, 135 - h - 4, w - 8, 2);
    }
    x += w + 2 + Math.floor(rng() * 10);
  }
  // Big NEON HARBOR sign.
  ctx.fillStyle = '#ff4fd8';
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('NEON HARBOR', 480, 30);
  ctx.fillStyle = 'rgba(255,79,216,0.3)';
  ctx.fillText('NEON HARBOR', 480, 33);
  return toPixels(c);
}
