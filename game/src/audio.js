// Synthesized sound — WebAudio only, no audio files, no network.
// Browser-only. All sounds are built from oscillators and filtered noise.

export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.sirenNodes = null;
    this.rainNodes = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  tone(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    g.gain.setValueAtTime(vol || 0.2, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  noise(dur, vol, filterFreq, type) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = type || 'lowpass';
    f.frequency.value = filterFreq || 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol || 0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  shoot() { this.noise(0.12, 0.5, 2400); this.tone(190, 0.09, 'square', 0.22, 60); }
  shotgun() { this.noise(0.3, 0.7, 900); this.tone(120, 0.22, 'sawtooth', 0.3, 40); }
  enemyShot() { this.noise(0.1, 0.2, 1600); }
  hit() { this.tone(1200, 0.05, 'square', 0.14); }
  kill() { this.tone(520, 0.09, 'square', 0.16, 780); }
  pickup() { this.tone(660, 0.07, 'sine', 0.2); this.tone(990, 0.1, 'sine', 0.2); }
  reload() { this.tone(300, 0.05, 'square', 0.12); this.tone(420, 0.05, 'square', 0.12); }
  mission() {
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => this.tone(f, 0.16, 'triangle', 0.22), i * 95);
    });
  }
  fail() { this.tone(220, 0.3, 'sawtooth', 0.18, 110); }
  click() { this.tone(800, 0.04, 'square', 0.1); }

  // Police siren: two alternating tones while wanted >= 3.
  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenNodes) {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      const lfo = this.ctx.createOscillator();
      const lg = this.ctx.createGain();
      o.type = 'sine'; o.frequency.value = 750;
      lfo.type = 'square'; lfo.frequency.value = 0.55;
      lg.gain.value = 180;
      lfo.connect(lg); lg.connect(o.frequency);
      g.gain.value = this.muted ? 0 : 0.045;
      o.connect(g); g.connect(this.master);
      o.start(); lfo.start();
      this.sirenNodes = { o, lfo, g };
    } else if (!on && this.sirenNodes) {
      try { this.sirenNodes.o.stop(); this.sirenNodes.lfo.stop(); } catch { /* already stopped */ }
      this.sirenNodes = null;
    }
  }

  // Rain ambience: looping filtered noise, quiet.
  setRain(on) {
    if (!this.ctx) return;
    if (on && !this.rainNodes) {
      const len = this.ctx.sampleRate * 2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 1400; f.Q.value = 0.6;
      const g = this.ctx.createGain();
      g.gain.value = this.muted ? 0 : 0.035;
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start();
      this.rainNodes = { src, g };
    } else if (!on && this.rainNodes) {
      try { this.rainNodes.src.stop(); } catch { /* already stopped */ }
      this.rainNodes = null;
    }
  }
}
