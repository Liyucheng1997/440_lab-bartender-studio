import * as THREE from 'three';

export const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t,
};

/* 时间轴：所有动画都挂在这里，支持暂停、变速、整体取消 */
export class Timeline {
  constructor() {
    this.tweens = [];
    this.speed = 1;
    this.paused = false;
    this.time = 0;
  }
  update(dt) {
    if (this.paused) return;
    dt *= this.speed;
    this.time += dt;
    const list = this.tweens.slice();
    for (const t of list) {
      if (t.dead) continue;
      t.elapsed += dt;
      const k = t.dur <= 0 ? 1 : Math.min(1, t.elapsed / t.dur);
      t.fn(t.ease(k), k, dt);
      if (k >= 1) {
        t.dead = true;
        t.resolve();
      }
    }
    this.tweens = this.tweens.filter((t) => !t.dead);
  }
  tween(dur, fn, easing = ease.inOut) {
    return new Promise((resolve) => {
      this.tweens.push({ dur, fn, ease: easing, elapsed: 0, resolve, dead: false });
    });
  }
  wait(dur) {
    return this.tween(dur, () => {});
  }
  cancel() {
    for (const t of this.tweens) t.dead = true; // 未完成的 Promise 永不 resolve，旧流程自然停住
    this.tweens = [];
  }
}

/* 由“掌心朝向 + 手指方向”得到手的朝向四元数（手的局部：Y=手指，Z=掌心） */
export function handBasis(palm, fingers) {
  const z = palm.clone().normalize();
  const y = fingers.clone().normalize();
  const x = new THREE.Vector3().crossVectors(y, z).normalize();
  z.crossVectors(x, y).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
}

/* ---------- 程序化贴图 ---------- */
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}
function tex(c, repeat) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

export function woodTexture(base = '#5a3418', dark = '#2e1808', repeat = [2, 1]) {
  const [c, g] = canvas(1024, 512);
  g.fillStyle = base;
  g.fillRect(0, 0, 1024, 512);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 520; i++) {
    const y = rnd() * 512;
    g.strokeStyle = rnd() > 0.5 ? dark : '#8a5a2c';
    g.globalAlpha = 0.05 + rnd() * 0.16;
    g.lineWidth = 0.6 + rnd() * 2.2;
    g.beginPath();
    g.moveTo(0, y);
    const a = rnd() * 6, b = rnd() * 6;
    for (let x = 0; x <= 1024; x += 32) g.lineTo(x, y + Math.sin(x * 0.006 + a) * 5 + Math.sin(x * 0.021 + b) * 2);
    g.stroke();
  }
  g.globalAlpha = 0.5;
  g.fillStyle = dark;
  for (let x = 0; x < 1024; x += 256) g.fillRect(x, 0, 2, 512);
  return tex(c, repeat);
}

export function labelTexture(title, sub, bg = '#f3ead6', fg = '#1d1d1f') {
  const [c, g] = canvas(512, 256);
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 256);
  g.strokeStyle = fg;
  g.lineWidth = 5;
  g.strokeRect(14, 14, 484, 228);
  g.lineWidth = 1.5;
  g.strokeRect(24, 24, 464, 208);
  g.fillStyle = fg;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  let size = 78;
  g.font = `700 ${size}px Georgia, 'Times New Roman', serif`;
  while (g.measureText(title).width > 420 && size > 30) {
    size -= 4;
    g.font = `700 ${size}px Georgia, 'Times New Roman', serif`;
  }
  g.fillText(title, 256, 108);
  g.font = `500 32px 'Microsoft YaHei', 'PingFang SC', sans-serif`;
  g.fillText(sub, 256, 184);
  return tex(c);
}

export function citrusTexture(rind, flesh, pith = '#f4efd8') {
  const [c, g] = canvas(256, 256);
  g.fillStyle = rind;
  g.beginPath(); g.arc(128, 128, 128, 0, 7); g.fill();
  g.fillStyle = pith;
  g.beginPath(); g.arc(128, 128, 116, 0, 7); g.fill();
  g.fillStyle = flesh;
  g.beginPath(); g.arc(128, 128, 106, 0, 7); g.fill();
  g.strokeStyle = pith;
  g.lineWidth = 6;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * 108, 128 + Math.sin(a) * 108); g.stroke();
  }
  g.fillStyle = pith;
  g.beginPath(); g.arc(128, 128, 12, 0, 7); g.fill();
  return tex(c);
}

export function neonTexture(text, color = '#ff5a3c') {
  const [c, g] = canvas(1024, 256);
  g.clearRect(0, 0, 1024, 256);
  g.font = `italic 600 150px 'Segoe Script', 'Brush Script MT', cursive`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 30;
  g.strokeStyle = color;
  g.lineWidth = 7;
  g.strokeText(text, 512, 128);
  g.shadowBlur = 0;
  g.strokeStyle = '#fff';
  g.lineWidth = 2;
  g.strokeText(text, 512, 128);
  return tex(c);
}

/* 背心的 V 领透明贴图（配合车削体的 UV：u=0/1 在正前方） */
export function vestAlpha() {
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 512, 512);
  g.fillStyle = '#000';
  const top = 0, bottom = 300; // 画布 y=0 对应 v=1（顶部）
  for (const s of [0, 512]) {
    g.beginPath();
    g.moveTo(s - 78, top); g.lineTo(s + 78, top); g.lineTo(s, bottom); g.closePath(); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}
