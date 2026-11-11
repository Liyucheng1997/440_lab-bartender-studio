/* 用 Web Audio 合成的简单音效：倒酒、冰块、摇壶、碰杯 */
export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.pourNode = null;
  }
  ensure() {
    if (this.ctx) return this.ctx;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, len);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.out = this.ctx.createGain();
      this.out.gain.value = 0.5;
      this.out.connect(this.ctx.destination);
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }
  setMuted(m) {
    this.muted = m;
    if (this.out) this.out.gain.value = m ? 0 : 0.5;
  }
  burst(freq, q, dur, vol, type = 'bandpass') {
    const c = this.ctx;
    if (!c || this.muted) return;
    const src = c.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    const t = c.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    src.connect(f).connect(g).connect(this.out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }
  ping(freq, dur, vol) {
    const c = this.ctx;
    if (!c || this.muted) return;
    const o = c.createOscillator(), g = c.createGain(), t = c.currentTime;
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g).connect(this.out);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  ice() {
    this.burst(2600 + Math.random() * 1500, 6, 0.09, 0.5);
    this.ping(3200 + Math.random() * 1800, 0.12, 0.05);
  }
  tick() {
    this.ping(2400 + Math.random() * 2200, 0.1, 0.045);
  }
  rattle() {
    this.burst(1800 + Math.random() * 900, 1.2, 0.1, 0.55);
    this.burst(5200, 3, 0.05, 0.25);
  }
  clink(v = 0.6) {
    this.ping(1900, 0.18, 0.05 * v);
    this.burst(900, 1.5, 0.06, 0.3 * v);
  }
  pour(on) {
    const c = this.ctx;
    if (!c) return;
    if (on && !this.pourNode) {
      const src = c.createBufferSource();
      src.buffer = this.noise;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1500;
      f.Q.value = 0.9;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, c.currentTime);
      g.gain.linearRampToValueAtTime(0.16, c.currentTime + 0.12);
      src.connect(f).connect(g).connect(this.out);
      src.start();
      this.pourNode = { src, g };
    } else if (!on && this.pourNode) {
      const { src, g } = this.pourNode;
      g.gain.linearRampToValueAtTime(0.0001, c.currentTime + 0.15);
      src.stop(c.currentTime + 0.2);
      this.pourNode = null;
    }
  }
  stopAll() {
    this.pour(false);
  }
}
