// Raycaster renderer: sky, textured walls (DDA), floor casting, billboard
// sprites — all into an offscreen ImageData buffer, upscaled to the canvas.
// Browser-only. Own engine: raw canvas 2D, no library.

import { CFG, TILE } from './config.js';
import { castRay, cameraPlane } from './raycast.js';
import { floorAt } from './map.js';
import { buildTextures, buildSky } from './textures.js';

// Brightness LUT: lut[level][channel] for 16 shade levels.
const SHADE_LEVELS = 16;
const shadeLut = [];
for (let l = 0; l < SHADE_LEVELS; l++) {
  const row = new Uint8Array(256);
  const br = l / (SHADE_LEVELS - 1);
  for (let c = 0; c < 256; c++) row[c] = Math.min(255, (c * br) | 0);
  shadeLut.push(row);
}

function shadePixel(v, level) {
  const lut = shadeLut[level < 0 ? 0 : level >= SHADE_LEVELS ? SHADE_LEVELS - 1 : level];
  const r = lut[v & 255], g = lut[(v >> 8) & 255], b = lut[(v >> 16) & 255];
  return (255 << 24) | (b << 16) | (g << 8) | r;
}

function brightFor(dist, side) {
  let b = 1.18 - dist * 0.042;
  if (side === 1) b *= 0.68;
  if (b < 0.16) b = 0.16;
  if (b > 1) b = 1;
  return Math.round(b * (SHADE_LEVELS - 1));
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = CFG.BUF_W;
    this.H = CFG.BUF_H;
    this.off = document.createElement('canvas');
    this.off.width = this.W; this.off.height = this.H;
    this.octx = this.off.getContext('2d');
    this.img = this.octx.createImageData(this.W, this.H);
    this.buf = new Uint32Array(this.img.data.buffer);
    this.zbuf = new Float32Array(this.W);
    this.textures = buildTextures(1337);
    this.sky = buildSky();
    this.colTex = new Int16Array(this.W);
    this.colStart = new Int16Array(this.W);
    this.colEnd = new Int16Array(this.W);
    this.colTexX = new Int16Array(this.W);
    this.colSide = new Int8Array(this.W);
    this.colBright = new Int8Array(this.W);
    // Rain drops.
    this.rain = [];
    for (let i = 0; i < 90; i++) {
      this.rain.push({ x: Math.random(), y: Math.random(), s: 0.9 + Math.random() * 0.7, l: 10 + Math.random() * 14 });
    }
    this.vignette = null;
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || 1280;
    const h = this.canvas.clientHeight || 720;
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    // Vignette (rebuilt on resize).
    const v = document.createElement('canvas');
    v.width = w; v.height = h;
    const vc = v.getContext('2d');
    const g = vc.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(2,2,10,0.55)');
    vc.fillStyle = g;
    vc.fillRect(0, 0, w, h);
    this.vignette = v;
  }

  render(world, time, dt) {
    const p = world.player;
    const W = this.W, H = this.H, buf = this.buf;
    const dirX = Math.cos(p.yaw), dirY = Math.sin(p.yaw);
    const fov = (CFG.FOV_DEG * Math.PI) / 180;
    const plane = cameraPlane(p.yaw, fov);
    const bob = Math.sin(p.bobT) * 1.6;
    const horizon = Math.round(H / 2 + bob - p.eyeH * 6);
    const posZ = (0.5 + p.eyeH) * H;

    // Pass 1: walls per column (DDA) — store slice geometry + zbuffer.
    for (let x = 0; x < W; x++) {
      const cameraX = (2 * x) / W - 1;
      const rayX = dirX + plane.x * cameraX;
      const rayY = dirY + plane.y * cameraX;
      const hit = castRay(world.map, p.x, p.y, Math.atan2(rayY, rayX));
      const dist = hit.dist;
      this.zbuf[x] = dist;
      const lineH = H / Math.max(0.05, dist);
      const start = Math.round(-lineH / 2 + horizon);
      const end = Math.round(lineH / 2 + horizon);
      this.colStart[x] = start < 0 ? 0 : start;
      this.colEnd[x] = end >= H ? H - 1 : end;
      this.colTex[x] = hit.tex;
      this.colSide[x] = hit.side;
      let texX = Math.floor(hit.wallX * 64);
      if (hit.side === 0 && rayX > 0) texX = 63 - texX;
      if (hit.side === 1 && rayY < 0) texX = 63 - texX;
      this.colTexX[x] = texX;
      this.colBright[x] = brightFor(dist, hit.side);
      this._lineH = this._lineH || new Float32Array(W);
      this._lineH[x] = lineH;
      this._drawStart = this._drawStart || new Int16Array(W);
      this._drawStart[x] = start;
    }

    // Pass 2: fill the buffer row by row (sky / wall / floor).
    const sky = this.sky;
    const skyW = sky.w, skyH = sky.h;
    const skyOff = (((p.yaw / (Math.PI * 2)) * skyW) % skyW + skyW) % skyW;
    const skySpan = skyW * (CFG.FOV_DEG / 360); // sky slice across the screen
    for (let y = 0; y < H; y++) {
      const rowBase = y * W;
      if (y < horizon) {
        // Sky: sample the precomputed skyline with yaw parallax.
        const sy = Math.min(skyH - 1, Math.floor((y / Math.max(1, horizon)) * skyH));
        for (let x = 0; x < W; x++) {
          const sx = Math.floor((skyOff + (x / W) * skySpan) % skyW);
          buf[rowBase + x] = sky.data[sy * skyW + sx];
        }
      } else {
        // Floor casting for this row.
        const pr = y - horizon;
        const rowDist = posZ / Math.max(1, pr);
        const rayX0 = dirX - plane.x, rayY0 = dirY - plane.y;
        const rayX1 = dirX + plane.x, rayY1 = dirY + plane.y;
        const stepX = (rowDist * (rayX1 - rayX0)) / W;
        const stepY = (rowDist * (rayY1 - rayY0)) / W;
        let fx = p.x + rowDist * rayX0;
        let fy = p.y + rowDist * rayY0;
        const bright = brightFor(rowDist, 0);
        for (let x = 0; x < W; x++) {
          if (y >= this.colStart[x] && y <= this.colEnd[x]) {
            // Wall texel.
            const tex = this.textures.walls[this.colTex[x]];
            const texY = Math.floor(((y - this._drawStart[x]) / this._lineH[x]) * 64);
            const ty = texY < 0 ? 0 : texY > 63 ? 63 : texY;
            buf[rowBase + x] = shadePixel(tex.data[ty * 64 + this.colTexX[x]], this.colBright[x]);
          } else {
            const cx = Math.floor(fx), cy = Math.floor(fy);
            const ft = floorAt(world.map, cx + 0.5, cy + 0.5);
            const tex = this.textures.floors[ft];
            const tx = Math.floor((fx - cx) * 64);
            const ty = Math.floor((fy - cy) * 64);
            buf[rowBase + x] = shadePixel(tex.data[ty * 64 + tx], bright);
          }
          fx += stepX; fy += stepY;
        }
      }
    }

    // Pass 3: sprites (far to near), zbuffer-tested.
    this.drawSprites(world, dirX, dirY, plane, horizon);

    // Blit the buffer up to the visible canvas.
    this.octx.putImageData(this.img, 0, 0);
    const cw = this.canvas.width, ch = this.canvas.height;
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(this.off, 0, 0, cw, ch);

    // Weapon, rain, vignette, damage flash.
    this.drawWeapon(world, time);
    this.drawRain(dt);
    if (this.vignette) this.ctx.drawImage(this.vignette, 0, 0);
    if (p.hurtT > 0) {
      this.ctx.fillStyle = `rgba(200,20,20,${(p.hurtT * 0.55).toFixed(3)})`;
      this.ctx.fillRect(0, 0, cw, ch);
    }
    if (p.muzzleT > 0) {
      // Brief warm tint only — a full-strength overlay whites the frame out.
      this.ctx.fillStyle = `rgba(255,220,120,${(p.muzzleT * 0.45).toFixed(3)})`;
      this.ctx.fillRect(0, 0, cw, ch);
    }
  }

  collectSprites(world) {
    const out = [];
    const p = world.player;
    for (const e of world.enemies) {
      const d2 = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
      if (d2 > 30 * 30) continue;
      out.push({ kind: e.type, x: e.x, y: e.y, h: 1.0, tex: e.type === 'police' ? this.textures.sprites.police : this.textures.sprites.gang, flash: e.flashT > 0, dead: e.dead });
    }
    for (const pk of world.pickups) {
      if (pk.taken) continue;
      const d2 = (pk.x - p.x) ** 2 + (pk.y - p.y) ** 2;
      if (d2 > 20 * 20) continue;
      out.push({ kind: 'pickup', x: pk.x, y: pk.y, h: 0.4, tex: this.textures.sprites[pk.kind], bob: true });
    }
    for (const car of world.cars) {
      if (car.taken) continue;
      const d2 = (car.x - p.x) ** 2 + (car.y - p.y) ** 2;
      if (d2 > 26 * 26) continue;
      const key = car.color === 'red' ? 'carRed' : car.color === 'blue' ? 'carBlue' : car.color === 'taxi' ? 'carTaxi' : car.color === 'green' ? 'carGreen' : 'carPurple';
      out.push({ kind: 'car', x: car.x, y: car.y, h: 0.55, tex: this.textures.sprites[key] });
    }
    // Mission beacon.
    const m = world.mission;
    if (m && !m.done) {
      out.push({ kind: 'beacon', x: m.marker.x, y: m.marker.y, h: 2.4, tex: this.textures.sprites.beacon });
    }
    // Street lamps at road crossings (deterministic, from the map grid).
    const map = world.map;
    for (let y = 1; y < map.h - 1; y += 6) {
      for (let x = 1; x < map.w - 1; x += 6) {
        const d2 = (x + 0.5 - p.x) ** 2 + (y + 0.5 - p.y) ** 2;
        if (d2 > 18 * 18) continue;
        out.push({ kind: 'lamp', x: x + 0.5, y: y + 0.5, h: 1.1, tex: this.textures.sprites.lamp });
      }
    }
    return out;
  }

  drawSprites(world, dirX, dirY, plane, horizon) {
    const W = this.W, H = this.H, buf = this.buf;
    const p = world.player;
    const sprites = this.collectSprites(world);
    // Sort far to near (by squared distance).
    sprites.sort((a, b) => {
      const da = (a.x - p.x) ** 2 + (a.y - p.y) ** 2;
      const db = (b.x - p.x) ** 2 + (b.y - p.y) ** 2;
      return db - da;
    });
    const invDet = 1 / (plane.x * dirY - dirX * plane.y);
    for (const s of sprites) {
      const relX = s.x - p.x, relY = s.y - p.y;
      const tx = invDet * (dirY * relX - dirX * relY);
      const ty = invDet * (-plane.y * relX + plane.x * relY);
      if (ty <= 0.15) continue;
      const screenX = Math.floor((W / 2) * (1 + tx / ty));
      const size = Math.abs(H / ty) * s.h;
      if (size < 2 || size > H * 4) continue;
      const tex = s.tex;
      const aspect = tex.w / tex.h;
      const wPx = Math.max(1, Math.floor(size * aspect));
      const hPx = Math.floor(size);
      const drawH = s.dead ? Math.max(1, Math.floor(hPx * 0.42)) : hPx;
      // The sprite stands on the floor: its bottom sits where the floor at
      // this depth projects (horizon + H / (2 * depth)).
      const bottom = Math.floor(horizon + H / (2 * ty));
      const top = bottom - drawH + (s.bob ? Math.floor(Math.sin(world.time * 3 + s.x * 5) * 3) : 0);
      const x0 = screenX - Math.floor(wPx / 2);
      const bright = brightFor(ty, 0);
      for (let sx = 0; sx < wPx; sx++) {
        const col = x0 + sx;
        if (col < 0 || col >= W) continue;
        if (ty >= this.zbuf[col]) continue;
        const texX = Math.floor((sx / wPx) * tex.w);
        for (let sy = 0; sy < drawH; sy++) {
          const row = top + sy;
          if (row < 0 || row >= H) continue;
          const texY = Math.floor((sy / drawH) * tex.h);
          const px = tex.data[texY * tex.w + texX];
          if ((px >>> 24) < 128) continue; // transparent
          let v = px;
          if (s.flash) v = shadePixel(px, SHADE_LEVELS - 1);
          else if (s.dead) v = shadePixel(px, 4);
          else if (bright < SHADE_LEVELS - 1) v = shadePixel(px, bright);
          buf[row * W + col] = v;
        }
      }
    }
  }

  drawWeapon(world, time) {
    const p = world.player;
    if (world.state !== 'playing') return;
    const cw = this.canvas.width, ch = this.canvas.height;
    const ctx = this.ctx;
    const bobX = Math.sin(p.bobT) * 6;
    const bobY = Math.abs(Math.cos(p.bobT)) * 5 + (p.driving ? 26 : 0);
    const recoil = p.muzzleT > 0 ? p.muzzleT * 260 : 0;
    // Classic FPS viewmodel: held right of centre, slightly angled, in lighter
    // tones so it reads against the dark street (a dead-centre dark bar read
    // as a pole, not a gun).
    const wx = cw / 2 + 120 + bobX;
    const baseY = ch - 6 - bobY + recoil * 0.4;
    ctx.save();
    ctx.translate(wx, baseY);
    ctx.rotate(-0.1);
    if (p.weapon === 'SHOTGUN') {
      // Pump shotgun: long barrel, pump, receiver, stock.
      ctx.fillStyle = '#3a3f47';
      ctx.fillRect(-10, -268, 20, 118); // barrel
      ctx.fillStyle = '#6a7078';
      ctx.fillRect(-10, -268, 20, 14); // barrel highlight
      ctx.fillStyle = '#0c0d10';
      ctx.fillRect(-10, -268, 20, 6); // muzzle
      ctx.fillStyle = '#5a4026';
      ctx.fillRect(-15, -216, 30, 34); // pump (wood)
      ctx.fillStyle = '#3a3f47';
      ctx.fillRect(-13, -168, 26, 74); // receiver
      ctx.fillStyle = '#5a4026';
      ctx.fillRect(-14, -96, 28, 66); // stock (wood)
      ctx.fillStyle = '#c22';
      ctx.fillRect(-2, -274, 4, 7); // front sight
      if (p.muzzleT > 0) {
        ctx.fillStyle = '#ffd75e';
        ctx.beginPath();
        ctx.moveTo(0, -302); ctx.lineTo(-24, -264); ctx.lineTo(24, -264);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,183,77,0.7)';
        ctx.beginPath(); ctx.arc(0, -280, 28, 0, 7); ctx.fill();
      }
    } else {
      // Pistol: wide slide with a light top edge, wood grip, trigger guard.
      ctx.fillStyle = '#3a3f47';
      ctx.fillRect(-13, -152, 26, 88); // slide
      ctx.fillStyle = '#7d838e';
      ctx.fillRect(-13, -152, 26, 10); // slide top edge (catches the light)
      ctx.fillStyle = '#0c0d10';
      ctx.fillRect(-13, -152, 26, 6); // muzzle
      ctx.fillStyle = '#5a4026';
      ctx.fillRect(-13, -66, 26, 66); // grip (wood)
      ctx.fillStyle = '#2b2e35';
      ctx.fillRect(-13, -66, 26, 8); // grip top
      ctx.fillStyle = '#15161a';
      ctx.fillRect(-5, -66, 10, 16); // trigger guard
      ctx.fillStyle = '#37e0c8';
      ctx.fillRect(-2, -160, 4, 8); // neon front sight
      if (p.muzzleT > 0) {
        ctx.fillStyle = '#ffd75e';
        ctx.beginPath();
        ctx.moveTo(0, -184); ctx.lineTo(-17, -150); ctx.lineTo(17, -150);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,183,77,0.7)';
        ctx.beginPath(); ctx.arc(0, -164, 19, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
    // Reload indicator.
    if (p.reloadT > 0) {
      ctx.fillStyle = 'rgba(255,215,94,0.9)';
      ctx.font = 'bold 15px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('RELOADING…', cw / 2, ch - 190);
    }
  }

  drawRain(dt) {
    const cw = this.canvas.width, ch = this.canvas.height;
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(160,190,255,0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const d of this.rain) {
      d.y += d.s * dt * 1.4;
      d.x += d.s * dt * 0.12;
      if (d.y > 1.05) { d.y = -0.05; d.x = Math.random(); }
      if (d.x > 1.05) d.x = -0.05;
      const x = d.x * cw, y = d.y * ch;
      ctx.moveTo(x, y);
      ctx.lineTo(x - d.l * 0.18, y + d.l);
    }
    ctx.stroke();
  }
}
