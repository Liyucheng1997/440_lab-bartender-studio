import * as THREE from 'three';
import { clamp } from './util.js';

export const glassMaterial = () =>
  new THREE.MeshPhysicalMaterial({
    color: 0xffffff, roughness: 0.04, metalness: 0, transmission: 1, thickness: 0.01, ior: 1.5,
    depthWrite: false, envMapIntensity: 1.3,
  });
export const steelMaterial = () =>
  new THREE.MeshStandardMaterial({ color: 0xd9dde2, roughness: 0.2, metalness: 1, envMapIntensity: 3.2 });

const iceMat = new THREE.MeshPhysicalMaterial({
  color: 0xaebfc8, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08,
  transparent: true, opacity: 0.62, emissive: 0x9fbccb, emissiveIntensity: 0.12, envMapIntensity: 2.4,
});
const ICE_SIZE = { highball: 0.036, rocks: 0.03 };
export const iceMaterial = iceMat;
const WATER = new THREE.Color('#e9eff1');

/* 容器剖面（米）：outer 为外轮廓自下而上，inner 为内腔自下而上 */
const FOOT = [[0, 0], [0.034, 0], [0.035, 0.0025], [0.02, 0.005], [0.006, 0.011], [0.0042, 0.022]];
export const PROFILES = {
  rocks: {
    outer: [[0, 0], [0.035, 0], [0.039, 0.003], [0.041, 0.03], [0.043, 0.09]],
    inner: [[0.033, 0.015], [0.0375, 0.03], [0.0405, 0.09]],
  },
  highball: {
    outer: [[0, 0], [0.029, 0], [0.032, 0.003], [0.033, 0.05], [0.0345, 0.152]],
    inner: [[0.0275, 0.011], [0.0305, 0.05], [0.0322, 0.152]],
  },
  coupe: {
    outer: [...FOOT, [0.0042, 0.075], [0.011, 0.086], [0.03, 0.095], [0.044, 0.108], [0.05, 0.124], [0.0515, 0.14]],
    inner: [[0.008, 0.0895], [0.028, 0.098], [0.042, 0.11], [0.048, 0.125], [0.0497, 0.14]],
  },
  martini: {
    outer: [...FOOT, [0.0042, 0.085], [0.0075, 0.09], [0.059, 0.156]],
    inner: [[0.003, 0.0925], [0.03, 0.127], [0.0572, 0.156]],
  },
  tin: {
    outer: [[0, 0], [0.032, 0], [0.035, 0.003], [0.04, 0.08], [0.046, 0.175]],
    inner: [[0.0335, 0.003], [0.039, 0.08], [0.045, 0.175]],
  },
  mixglass: {
    outer: [[0, 0], [0.043, 0], [0.046, 0.004], [0.0465, 0.07], [0.0475, 0.146]],
    inner: [[0.041, 0.016], [0.043, 0.07], [0.0445, 0.146]],
  },
  jigger: {
    outer: [[0, 0], [0.0195, 0], [0.004, 0.04], [0.004, 0.045], [0.0305, 0.118]],
    inner: [[0.003, 0.047], [0.0293, 0.118]],
  },
};

export class Vessel {
  constructor(kind, { metal = false } = {}) {
    const p = PROFILES[kind];
    this.kind = kind;
    this.metal = metal;
    this.inner = p.inner;
    this.y0 = p.inner[0][1];
    this.rimY = p.inner[p.inner.length - 1][1];
    this.rimR = p.inner[p.inner.length - 1][0];
    this.outerR = p.outer[p.outer.length - 1][0];
    this.group = new THREE.Group();

    const pts = [...p.outer, ...p.inner.slice().reverse(), [0, this.y0]].map(([r, y]) => new THREE.Vector2(r, y));
    this.shell = new THREE.Mesh(new THREE.LatheGeometry(pts, 56), metal ? steelMaterial() : glassMaterial());
    this.shell.castShadow = metal;
    this.shell.receiveShadow = metal;
    this.group.add(this.shell);
    if (!metal) {
      // 玻璃杯投下一点淡影
      const sh = new THREE.Mesh(new THREE.CircleGeometry(p.outer[1][0] * 1.15, 32), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.28, depthWrite: false }));
      sh.rotation.x = -Math.PI / 2;
      sh.position.y = 0.0008;
      this.group.add(sh);
    }

    // 体积查找表
    this.table = [];
    const N = 80;
    let vol = 0;
    for (let i = 0; i <= N; i++) {
      const y = this.y0 + ((this.rimY - this.y0) * i) / N;
      if (i > 0) {
        const ym = y - (this.rimY - this.y0) / N / 2;
        const r = this.radiusAt(ym);
        vol += Math.PI * r * r * ((this.rimY - this.y0) / N) * 1e6;
      }
      this.table.push([y, vol]);
    }
    this.capacity = vol;

    this.liquidMat = new THREE.MeshPhysicalMaterial({
      vertexColors: true, roughness: 0.06, metalness: 0, transparent: true, opacity: 0.9,
      emissive: 0xffffff, emissiveIntensity: 0, envMapIntensity: 0.6,
    });
    // 自发光也乘上顶点色，渐层（如龙舌兰日出）才能显出来
    this.liquidMat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance *= vColor.rgb;');
    };
    this.liquid = new THREE.Mesh(new THREE.BufferGeometry(), this.liquidMat);
    this.liquid.visible = false;
    this.liquid.renderOrder = 2;
    this.group.add(this.liquid);

    this.iceGroup = new THREE.Group();
    this.group.add(this.iceGroup);
    this.ice = [];
    this.contents = [];
    this.sink = null; // 沉底的糖浆 {color, ml}
    this.cloudy = 0;
    this.level = this.y0;
    this.color = new THREE.Color();
  }

  radiusAt(y) {
    const a = this.inner;
    if (y <= a[0][1]) return a[0][0];
    for (let i = 1; i < a.length; i++) {
      if (y <= a[i][1]) {
        const t = (y - a[i - 1][1]) / (a[i][1] - a[i - 1][1]);
        return a[i - 1][0] + (a[i][0] - a[i - 1][0]) * t;
      }
    }
    return a[a.length - 1][0];
  }
  cavityVol(y) {
    const t = this.table;
    if (y <= t[0][0]) return 0;
    for (let i = 1; i < t.length; i++) {
      if (y <= t[i][0]) {
        const k = (y - t[i - 1][0]) / (t[i][0] - t[i - 1][0]);
        return t[i - 1][1] + (t[i][1] - t[i - 1][1]) * k;
      }
    }
    return this.capacity;
  }
  get ml() {
    return this.contents.reduce((s, c) => s + c.ml, 0) + (this.sink ? this.sink.ml : 0);
  }

  /* ---- 冰 ---- */
  nextIceSlot(size) {
    const n = this.ice.length;
    // 逐层堆叠：按内径决定每层放几块
    let y = this.y0 + size * 0.5, layer = 0, idx = n;
    for (;;) {
      const r = this.radiusAt(y);
      const m = r > 0.052 ? 3 : r > 0.0335 ? 2 : 1;
      if (idx < m) {
        const d = m === 1 ? 0.002 : Math.max(size * 0.52, r - size * 0.74);
        const a = layer * 1.9 + (idx / m) * Math.PI * 2 + 0.4;
        return { pos: new THREE.Vector3(Math.cos(a) * d, y, Math.sin(a) * d), rotY: layer * 0.9 + idx * 0.5 };
      }
      idx -= m;
      layer++;
      y += size * 0.97;
      if (y + size * 0.3 > this.rimY + size * 0.4) return null;
    }
  }
  addIce(size = ICE_SIZE[this.kind] || 0.027) {
    const slot = this.nextIceSlot(size);
    if (!slot) return null;
    const m = new THREE.Mesh(iceGeo(size), iceMat);
    m.position.copy(slot.pos);
    m.rotation.set((this.ice.length * 0.37) % 0.3, slot.rotY, (this.ice.length * 0.53) % 0.3);
    m.castShadow = true;
    m.renderOrder = 1;
    m.userData.size = size;
    this.iceGroup.add(m);
    this.ice.push(m);
    this.refresh();
    return m;
  }
  iceSubmerged(level) {
    let v = 0;
    for (const c of this.ice) {
      const s = c.userData.size;
      v += clamp((level - (c.position.y - s / 2)) / s, 0, 1) * s * s * s * 1e6;
    }
    return v;
  }

  /* ---- 液体 ---- */
  add(ing, ml, { sink = false } = {}) {
    if (ml <= 0) return;
    if (sink) {
      if (!this.sink) this.sink = { color: new THREE.Color(ing.color), ml: 0 };
      this.sink.ml += ml;
    } else {
      let c = this.contents.find((x) => x.ing === ing);
      if (!c) this.contents.push((c = { ing, ml: 0 }));
      c.ml += ml;
    }
    this.refresh();
  }
  /* 取出 ml，返回按比例取出的成分 */
  take(ml) {
    const total = this.contents.reduce((s, c) => s + c.ml, 0);
    if (total <= 0) return [];
    const k = Math.min(1, ml / total);
    const out = this.contents.map((c) => ({ ing: c.ing, ml: c.ml * k }));
    for (const c of this.contents) c.ml -= c.ml * k;
    if (k >= 1) this.contents = [];
    this.refresh();
    return out;
  }
  mixColor() {
    let r = 0, g = 0, b = 0, w = 0, total = 0;
    const tmp = new THREE.Color();
    for (const c of this.contents) {
      const k = c.ml * c.ing.tint;
      tmp.set(c.ing.color);
      r += tmp.r * k; g += tmp.g * k; b += tmp.b * k;
      w += k; total += c.ml;
    }
    if (w <= 0) return { color: WATER.clone(), conc: 0 };
    const col = new THREE.Color(r / w, g / w, b / w);
    const conc = clamp(w / Math.max(total, 1e-6), 0, 1);
    // 稀释按比尔-朗伯定律变浅（透光率取幂），色相不会发灰
    const e = 0.45 + 0.55 * conc;
    col.setRGB(Math.pow(col.r, e), Math.pow(col.g, e), Math.pow(col.b, e));
    col.lerp(WATER, this.cloudy * 0.06);
    return { color: col, conc };
  }
  refresh() {
    const ml = this.ml;
    if (ml < 0.05) {
      this.liquid.visible = false;
      this.level = this.y0;
      return;
    }
    // 二分求液面高度（考虑冰块排水）
    let lo = this.y0, hi = this.rimY;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (this.cavityVol(mid) - this.iceSubmerged(mid) < ml) lo = mid; else hi = mid;
    }
    this.level = Math.min(hi, this.rimY - 0.0015);
    const { color, conc } = this.mixColor();
    this.color.copy(color);
    const top = color, bottom = this.sink ? this.sink.color : color;
    const sinkFrac = this.sink ? clamp((this.sink.ml / ml) * 2.4, 0.12, 0.6) : 0;

    // 酒液主要靠透光显色，漫反射压低；摇过的酒带气泡，才会发白
    const albedo = 0.08 + 0.14 * this.cloudy;
    const pts = [[0, this.y0]];
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
      const y = this.y0 + ((this.level - this.y0) * i) / steps;
      pts.push([this.radiusAt(y) * 0.985, y]);
    }
    pts.push([0, this.level]);
    const geo = new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), 40);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) - this.y0) / Math.max(1e-5, this.level - this.y0);
      const k = this.sink ? clamp(1 - t / Math.max(sinkFrac * 2, 1e-3), 0, 1) : 0;
      c.copy(top).lerp(bottom, k * k * (3 - 2 * k));
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.liquid.geometry.dispose();
    this.liquid.geometry = geo;
    this.liquid.visible = true;
    const dense = this.sink ? 1 : clamp(conc * 2.4 + this.cloudy * 0.25, 0, 1);
    this.liquidMat.opacity = this.metal ? 1 : 0.42 + 0.54 * dense;
    this.liquidMat.color.setScalar(albedo);
    this.liquidMat.emissive.setScalar(1);
    this.liquidMat.emissiveIntensity = 0.04 + 0.62 * dense;
  }
  abv() {
    let a = 0, t = 0;
    for (const c of this.contents) { a += c.ml * c.ing.abv; t += c.ml; }
    if (this.sink) t += this.sink.ml;
    return t > 0 ? a / t : 0;
  }
}

const iceGeos = {};
function iceGeo(size) {
  const k = size.toFixed(3);
  if (!iceGeos[k]) {
    const g = new THREE.BoxGeometry(size, size, size, 3, 3, 3);
    // 轻微倒角：把顶点向球面收一点
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const s = v.clone().normalize().multiplyScalar(size * 0.78);
      v.lerp(s, 0.22);
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    iceGeos[k] = g;
  }
  return iceGeos[k];
}
export { iceGeo };

/* 倒酒水流 */
export class Stream {
  constructor() {
    this.mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.05, transparent: true, opacity: 0.85, emissive: 0xffffff, emissiveIntensity: 0.15 });
    this.mesh = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.7, 1, 10, 1, true), this.mat);
    this.mesh.visible = false;
    this.mesh.renderOrder = 3;
  }
  set(from, to, color, radius = 0.0032) {
    const d = to.clone().sub(from);
    const len = d.length();
    if (len < 1e-4) return this.hide();
    this.mesh.visible = true;
    this.mesh.position.copy(from).addScaledVector(d, 0.5);
    this.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize().negate());
    const wob = 1 + Math.sin(performance.now() * 0.03) * 0.08;
    this.mesh.scale.set(radius * wob, len, radius * wob);
    this.mat.color.set(color);
    this.mat.emissive.set(color);
  }
  hide() {
    this.mesh.visible = false;
  }
}
