// HUD, minimap and screens (title / pause / dead). Browser-only (DOM).
// The 3D view is the renderer's canvas; this module owns everything around it.

import { TILE } from './config.js';
import { objectiveText, markerDistance, wantedStars } from './world.js';

export class UI {
  constructor(world) {
    this.world = world;
    this.el = {};
    for (const id of ['hud', 'health-fill', 'health-text', 'armor-fill', 'armor-text', 'ammo', 'weapon', 'cash', 'stars', 'objective', 'mission-label', 'banner', 'banner-title', 'banner-sub', 'crosshair', 'minimap', 'title', 'pause', 'dead', 'dead-stats', 'fps', 'hint', 'speed', 'interact']) {
      this.el[id] = document.getElementById(id);
    }
    this.mapCanvas = this.el.minimap;
    this.mapCtx = this.mapCanvas ? this.mapCanvas.getContext('2d') : null;
    this.frame = 0;
    this.bannerT = 0;
  }

  update(fps) {
    const w = this.world, p = w.player;
    this.frame += 1;
    if (this.el['health-fill']) this.el['health-fill'].style.width = `${Math.max(0, p.hp)}%`;
    if (this.el['health-text']) this.el['health-text'].textContent = `${Math.ceil(p.hp)}`;
    if (this.el['armor-fill']) this.el['armor-fill'].style.width = `${Math.max(0, p.armor)}%`;
    if (this.el['armor-text']) this.el['armor-text'].textContent = `${Math.ceil(p.armor)}`;
    const slot = p.weapons[p.weapon];
    if (this.el.ammo) this.el.ammo.textContent = p.reloadT > 0 ? '--' : `${slot.ammo} / ${slot.reserve}`;
    if (this.el.weapon) this.el.weapon.textContent = p.weapon === 'PISTOL' ? 'PISTOL' : 'SHOTGUN';
    if (this.el.cash) this.el.cash.textContent = `$${w.cash}`;
    const stars = wantedStars(w);
    if (this.el.stars) {
      this.el.stars.textContent = '★'.repeat(stars) + '☆'.repeat(5 - stars);
      this.el.stars.style.color = stars >= 4 ? '#ff4040' : stars >= 2 ? '#ffb52e' : '#8a93a6';
    }
    if (this.el.objective) this.el.objective.textContent = objectiveText(w);
    const d = markerDistance(w);
    if (this.el['mission-label']) {
      const m = w.mission;
      this.el['mission-label'].textContent = m ? `MISSION ${m.id}/5 — ${m.name}${d !== null ? `  ·  ${Math.round(d)}m` : ''}` : (w.freeRoam ? 'FREE ROAM' : '');
    }
    if (this.el.fps) this.el.fps.textContent = `${fps} fps`;
    if (this.el.speed) this.el.speed.textContent = p.driving ? `${Math.abs(p.carSpeed * 3.6 * 2.2).toFixed(0)} km/h` : '';
    // Interact prompt (mission car nearby).
    if (this.el.interact) {
      const m = w.mission;
      let show = false;
      if (m && m.type === 'drive' && m.phase === 1 && !p.driving) {
        const car = w.cars.find((c) => c.mission);
        if (car && !car.taken && Math.hypot(p.x - car.x, p.y - car.y) < 1.8) show = true;
      }
      if (p.driving) show = true; // E exits the car
      this.el.interact.style.display = show ? 'block' : 'none';
      if (show) this.el.interact.textContent = p.driving ? '[E] Exit car' : '[E] Steal the car';
    }
    // Banner countdown.
    if (this.bannerT > 0) {
      this.bannerT -= 1 / 60;
      if (this.bannerT <= 0 && this.el.banner) this.el.banner.style.display = 'none';
    }
    // Minimap at ~10 Hz.
    if (this.frame % 6 === 0) this.drawMinimap();
  }

  banner(title, sub, seconds) {
    if (!this.el.banner) return;
    this.el['banner-title'].textContent = title;
    this.el['banner-sub'].textContent = sub || '';
    this.el.banner.style.display = 'block';
    this.bannerT = seconds || 3;
  }

  showTitle(show, hasSave) {
    if (!this.el.title) return;
    this.el.title.style.display = show ? 'flex' : 'none';
    const cont = document.getElementById('continue-btn');
    if (cont) cont.style.display = hasSave ? 'inline-block' : 'none';
  }

  showPause(show) {
    if (this.el.pause) this.el.pause.style.display = show ? 'flex' : 'none';
  }

  showDead(show, stats) {
    if (!this.el.dead) return;
    this.el.dead.style.display = show ? 'flex' : 'none';
    if (show && this.el['dead-stats']) this.el['dead-stats'].textContent = stats || '';
  }

  drawMinimap() {
    const ctx = this.mapCtx;
    if (!ctx) return;
    const map = this.world.map;
    const S = this.mapCanvas.width;
    const cw = S / map.w, ch = S / map.h;
    ctx.clearRect(0, 0, S, S);
    for (let y = 0; y < map.h; y++) {
      for (let x = 0; x < map.w; x++) {
        const t = map.grid[y * map.w + x];
        if (t === TILE.OPEN) continue;
        ctx.fillStyle = t === TILE.BAR ? '#8a6a1e' : t === TILE.CHOP ? '#8a7d1e' : '#23262e';
        ctx.fillRect(x * cw, y * ch, cw + 0.5, ch + 0.5);
      }
    }
    // Mission marker (pulsing).
    const m = this.world.mission;
    if (m) {
      const pulse = 3 + Math.sin(this.world.time * 5) * 1.5;
      ctx.fillStyle = '#ffd75e';
      ctx.beginPath();
      ctx.arc(m.marker.x * cw, m.marker.y * ch, pulse, 0, 7);
      ctx.fill();
    }
    // Parked cars.
    ctx.fillStyle = '#cfd6e4';
    for (const car of this.world.cars) {
      if (car.taken) continue;
      ctx.fillRect(car.x * cw - 1.5, car.y * ch - 1.5, 3, 3);
    }
    // Enemies.
    for (const e of this.world.enemies) {
      if (e.dead) continue;
      ctx.fillStyle = e.type === 'police' ? '#4f8cff' : '#ff4f4f';
      ctx.fillRect(e.x * cw - 1.5, e.y * ch - 1.5, 3, 3);
    }
    // Player arrow.
    const p = this.world.player;
    ctx.save();
    ctx.translate(p.x * cw, p.y * ch);
    ctx.rotate(p.yaw);
    ctx.fillStyle = '#37e0c8';
    ctx.beginPath();
    ctx.moveTo(5, 0); ctx.lineTo(-3.5, -3.2); ctx.lineTo(-3.5, 3.2);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }
}
