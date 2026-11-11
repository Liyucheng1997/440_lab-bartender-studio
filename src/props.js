import * as THREE from 'three';
import { labelTexture, citrusTexture, woodTexture } from './util.js';
import { steelMaterial, iceGeo, iceMaterial } from './vessel.js';

const lathe = (pts, seg = 40) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const shadow = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

/* ---------- 酒瓶 ---------- */
const BOTTLE = {
  std: { pts: [[0, 0], [0.036, 0], [0.038, 0.004], [0.038, 0.17], [0.034, 0.192], [0.017, 0.225], [0.0135, 0.236], [0.0135, 0.288], [0.0155, 0.29], [0.0155, 0.3]], fill: 0.175, label: [0.05, 0.15], pourer: true },
  tall: { pts: [[0, 0], [0.032, 0], [0.034, 0.004], [0.034, 0.2], [0.03, 0.222], [0.015, 0.252], [0.013, 0.262], [0.013, 0.318], [0.015, 0.32], [0.015, 0.33]], fill: 0.205, label: [0.06, 0.17], pourer: true },
  squat: { pts: [[0, 0], [0.043, 0], [0.046, 0.005], [0.046, 0.115], [0.04, 0.14], [0.018, 0.17], [0.0145, 0.18], [0.0145, 0.238], [0.0165, 0.24], [0.0165, 0.25]], fill: 0.12, label: [0.03, 0.105], pourer: true },
  slim: { pts: [[0, 0], [0.031, 0], [0.033, 0.004], [0.033, 0.16], [0.028, 0.2], [0.016, 0.25], [0.013, 0.262], [0.013, 0.308], [0.015, 0.31], [0.015, 0.32]], fill: 0.165, label: [0.045, 0.14], pourer: true },
  bitters: { pts: [[0, 0], [0.02, 0], [0.022, 0.003], [0.022, 0.07], [0.018, 0.082], [0.009, 0.092], [0.008, 0.11], [0.0095, 0.111], [0.0095, 0.122]], fill: 0.07, label: [0.004, 0.09], pourer: false, labelOver: 0.003 },
  carafe: { pts: [[0, 0], [0.034, 0], [0.037, 0.004], [0.038, 0.12], [0.03, 0.15], [0.019, 0.172], [0.018, 0.2], [0.021, 0.212]], fill: 0.13, label: [0.045, 0.1], pourer: false, open: true },
  mixer: { pts: [[0, 0], [0.026, 0], [0.028, 0.003], [0.028, 0.105], [0.023, 0.13], [0.012, 0.165], [0.011, 0.195], [0.013, 0.197], [0.013, 0.205]], fill: 0.12, label: [0.04, 0.095], pourer: false },
};

export function makeBottle(ing, { decor = false } = {}) {
  const b = ing.bottle;
  const spec = BOTTLE[b.shape];
  const g = new THREE.Group();
  const h = spec.pts[spec.pts.length - 1][1];
  const bodyR = spec.pts[2][0];

  const shell = shadow(new THREE.Mesh(lathe(spec.pts, decor ? 20 : 36), new THREE.MeshPhysicalMaterial({
    color: b.glass, roughness: 0.06, metalness: 0, transparent: true, opacity: decor ? 0.72 : 0.5, envMapIntensity: 1.4, clearcoat: 1,
  })));
  shell.renderOrder = 1;
  g.add(shell);

  // 瓶内酒液
  const lp = [[0, 0.006]];
  for (const [r, y] of spec.pts) if (y > 0.004 && y <= spec.fill && r > 0.001) lp.push([r * 0.9, Math.max(y, 0.006)]);
  lp.push([bodyR * 0.9, spec.fill], [0, spec.fill]);
  const liquidColor = ing.tint > 0.2 ? ing.color : new THREE.Color(b.glass).lerp(new THREE.Color('#ffffff'), 0.35);
  const liq = new THREE.Mesh(lathe(lp, decor ? 16 : 28), new THREE.MeshStandardMaterial({ color: liquidColor, roughness: 0.25, emissive: liquidColor, emissiveIntensity: 0.12 }));
  g.add(liq);

  // 酒标
  const [y0, y1] = spec.label;
  const lr = bodyR + (spec.labelOver ?? 0.0007);
  const label = new THREE.Mesh(
    new THREE.CylinderGeometry(lr, lr, y1 - y0, 28, 1, true, -1.25, 2.5),
    new THREE.MeshStandardMaterial({ map: labelTexture(ing.en, ing.name, b.label, b.ink || '#1d1d1f'), roughness: 0.75 }),
  );
  label.position.y = (y0 + y1) / 2;
  g.add(label);

  let mouthY = h;
  if (spec.pourer) {
    const pm = steelMaterial();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.0158, 0.0158, 0.008, 16), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.6 }));
    base.position.y = h + 0.004;
    const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.0028, 0.0045, 0.05, 10), pm);
    spout.position.y = h + 0.033;
    g.add(base, spout);
    mouthY = h + 0.058;
  } else if (!spec.open) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(spec.pts[spec.pts.length - 1][0] + 0.001, spec.pts[spec.pts.length - 1][0] + 0.001, 0.012, 16), new THREE.MeshStandardMaterial({ color: b.shape === 'bitters' ? 0xe8c62a : 0xb8bcc2, roughness: 0.4, metalness: 0.6 }));
    cap.position.y = h - 0.004;
    g.add(cap);
  }
  return { group: g, ing, h, bodyR, mouth: new THREE.Vector3(0, mouthY, 0), gripY: Math.min(spec.fill * 0.62, 0.12), small: b.shape === 'bitters' };
}

/* ---------- 工具 ---------- */
export function makeCapTin() {
  // 波士顿摇壶的小听，倒扣使用：原点在倒扣后的底部（口朝下）
  const g = new THREE.Group();
  const m = shadow(new THREE.Mesh(lathe([[0.0405, 0], [0.039, 0.06], [0.0335, 0.127], [0.031, 0.13], [0, 0.13], [0, 0.128], [0.0305, 0.128], [0.0378, 0.06], [0.0395, 0]], 48), steelMaterial()));
  g.add(m);
  return { group: g, h: 0.13, r: 0.04 };
}

export function makeSpoon() {
  const g = new THREE.Group();
  const s = steelMaterial();
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.0019, 0.0019, 0.29, 8), s);
  rod.position.y = 0.16;
  const twist = new THREE.Mesh(new THREE.TorusKnotGeometry(0.0021, 0.0009, 60, 5, 1, 14), s);
  twist.scale.set(1, 1, 1);
  const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.011, 16, 12), s);
  bowl.scale.set(0.8, 1.35, 0.28);
  bowl.position.y = 0.012;
  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 12, 10), s);
  tip.scale.y = 1.6;
  tip.position.y = 0.308;
  g.add(rod, bowl, tip);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return { group: g, len: 0.31 };
}

export function makeMuddler() {
  const g = new THREE.Group();
  const m = shadow(new THREE.Mesh(lathe([[0, 0], [0.015, 0], [0.016, 0.004], [0.0155, 0.03], [0.011, 0.06], [0.0115, 0.17], [0.014, 0.2], [0.0125, 0.214], [0, 0.216]], 20), new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: 0.55 })));
  g.add(m);
  return { group: g, len: 0.216 };
}

export function makeToolCup() {
  const g = new THREE.Group();
  g.add(shadow(new THREE.Mesh(lathe([[0, 0], [0.034, 0], [0.036, 0.003], [0.038, 0.11], [0.0365, 0.11], [0.034, 0.006], [0, 0.006]], 32), new THREE.MeshStandardMaterial({ color: 0xb98a4a, roughness: 0.28, metalness: 1 }))));
  return { group: g };
}

export function makeStrainer() {
  const g = new THREE.Group();
  const s = steelMaterial();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.047, 0.047, 0.0016, 36), s);
  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.039, 0.0042, 8, 48), new THREE.MeshStandardMaterial({ color: 0xc8ccd2, roughness: 0.35, metalness: 1 }));
  coil.rotation.x = Math.PI / 2;
  coil.position.y = -0.005;
  const handle = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.0016, 0.017), s);
  handle.position.set(-0.08, 0, 0);
  for (const a of [-0.5, 0.5]) {
    const ear = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.0016, 0.01), s);
    ear.position.set(Math.cos(a) * 0.053, 0, Math.sin(a) * 0.053);
    ear.rotation.y = -a;
    g.add(ear);
  }
  g.add(plate, coil, handle);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  return { group: g };
}

export function makeBucket() {
  const g = new THREE.Group();
  const m = shadow(new THREE.Mesh(lathe([[0, 0], [0.075, 0], [0.079, 0.004], [0.095, 0.14], [0.098, 0.146], [0.092, 0.146], [0.0755, 0.008], [0, 0.008]], 48), steelMaterial()));
  g.add(m);
  // 堆起来的冰
  let seed = 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 34; i++) {
    const a = rnd() * 6.28, r = Math.sqrt(rnd()) * 0.07;
    const c = new THREE.Mesh(iceGeo(0.027), iceMaterial);
    c.position.set(Math.cos(a) * r, 0.105 + rnd() * 0.03 + (0.07 - r) * 0.18, Math.sin(a) * r);
    c.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    g.add(c);
  }
  return { group: g };
}

export function makeScoop() {
  // 局部坐标：手柄在 y∈[0,0.09]，勺斗在 y∈[-0.1,0]，开口朝 -X
  const g = new THREE.Group();
  const s = steelMaterial();
  s.side = THREE.DoubleSide;
  const trough = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.024, 0.1, 20, 1, true, 0, Math.PI), s);
  trough.position.y = -0.05; // 半圆柱的实体侧在 +X
  const back = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16, 0, Math.PI), s);
  back.rotation.x = -Math.PI / 2;
  back.rotation.z = -Math.PI / 2;
  back.position.y = 0;
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0085, 0.09, 12), new THREE.MeshStandardMaterial({ color: 0x1b1b1d, roughness: 0.5 }));
  handle.position.set(0.012, 0.045, 0);
  g.add(trough, back, handle);
  g.traverse((o) => o.isMesh && (o.castShadow = true));
  // 勺里的冰
  const cubes = [];
  for (let i = 0; i < 3; i++) {
    const c = new THREE.Mesh(iceGeo(0.027), iceMaterial);
    c.position.set(0.012, -0.03 - i * 0.027, (i % 2 ? 1 : -1) * 0.004);
    c.rotation.set(i, i * 2, i * 3);
    c.visible = false;
    g.add(c);
    cubes.push(c);
  }
  return { group: g, cubes, handleX: 0.012 };
}

export function makeBoard() {
  const g = new THREE.Group();
  const m = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.014, 0.17), new THREE.MeshStandardMaterial({ map: woodTexture('#b98a55', '#7a5126', [1, 1]), roughness: 0.6 })));
  m.position.y = 0.007;
  g.add(m);
  return { group: g, top: 0.014 };
}

export function makeSaucer() {
  const g = new THREE.Group();
  g.add(shadow(new THREE.Mesh(lathe([[0, 0], [0.05, 0], [0.066, 0.01], [0.064, 0.012], [0.05, 0.004], [0, 0.004]], 40), new THREE.MeshStandardMaterial({ color: 0x1c1c1e, roughness: 0.35 }))));
  const salt = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.05, 0.006, 32), new THREE.MeshStandardMaterial({ color: 0xc9c9c6, roughness: 1 }));
  salt.position.y = 0.007;
  g.add(salt);
  return { group: g, top: 0.01 };
}

export function makeSaltRim(r, y) {
  const m = new THREE.Mesh(new THREE.TorusGeometry(r + 0.0012, 0.0015, 8, 56), new THREE.MeshStandardMaterial({ color: 0xd9d9d6, roughness: 1 }));
  m.rotation.x = Math.PI / 2;
  m.position.y = y - 0.001;
  m.scale.z = 2.2;
  return m;
}

/* ---------- 装饰物 ---------- */
let limeTex, orangeTex;
const citrus = (kind) => {
  if (kind === 'lime') return (limeTex ||= citrusTexture('#3f8a2a', '#bfd66a'));
  return (orangeTex ||= citrusTexture('#f08a18', '#f8b23a'));
};
function wheel(kind, r, half) {
  const rind = new THREE.MeshStandardMaterial({ color: kind === 'lime' ? 0x3f8a2a : 0xf08a18, roughness: 0.6 });
  const face = new THREE.MeshStandardMaterial({ map: citrus(kind), roughness: 0.45, emissive: kind === 'lime' ? 0x2a3a10 : 0x4a2600, emissiveIntensity: 0.35 });
  const geo = new THREE.CylinderGeometry(r, r, 0.005, 36, 1, false, half ? -Math.PI / 2 : 0, half ? Math.PI : Math.PI * 2);
  const m = shadow(new THREE.Mesh(geo, [rind, face, face]));
  const g = new THREE.Group();
  g.add(m);
  if (half) {
    const cut = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, 0.005), new THREE.MeshStandardMaterial({ color: kind === 'lime' ? 0xbfd66a : 0xf8b23a, roughness: 0.5, side: THREE.DoubleSide }));
    cut.rotation.x = Math.PI / 2; // 平面躺在切面上
    cut.rotation.set(0, Math.PI / 2, 0);
    cut.rotation.z = Math.PI / 2;
    g.add(cut);
  }
  return g;
}

export const GARNISH = {
  limeWheel: { name: '青柠片', make: () => wheel('lime', 0.023, false), place: 'rim' },
  orangeWheel: { name: '半片橙子', make: () => wheel('orange', 0.034, true), place: 'rim' },
  orangeSlice: { name: '半片橙子', make: () => wheel('orange', 0.032, true), place: 'tuck' },
  limeWedge: {
    name: '青柠角',
    make: () => {
      const g = new THREE.Group();
      const a = 1.0, r = 0.022;
      const skin = shadow(new THREE.Mesh(new THREE.SphereGeometry(r, 20, 16, 0, a), new THREE.MeshStandardMaterial({ color: 0x3f8a2a, roughness: 0.55, side: THREE.DoubleSide })));
      const fm = new THREE.MeshStandardMaterial({ color: 0xc8dc78, roughness: 0.45, side: THREE.DoubleSide, emissive: 0x2a3a10, emissiveIntensity: 0.4 });
      const f1 = new THREE.Mesh(new THREE.CircleGeometry(r, 20, Math.PI / 2, Math.PI), fm);
      const f2 = f1.clone();
      f2.rotation.y = a;
      g.add(skin, f1, f2);
      g.scale.set(1, 1.25, 1);
      return g;
    },
    place: 'float',
  },
  orangePeel: {
    name: '橙皮',
    make: () => {
      const g = new THREE.Group();
      const m = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.062, 16, 6, true, 0, 1.0), new THREE.MeshStandardMaterial({ color: 0xf08a18, roughness: 0.55, side: THREE.DoubleSide })));
      // 拧成一点螺旋
      const p = m.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const y = p.getY(i), t = y * 14;
        const x = p.getX(i), z = p.getZ(i);
        p.setXYZ(i, x * Math.cos(t) - z * Math.sin(t), y, x * Math.sin(t) + z * Math.cos(t));
      }
      m.geometry.computeVertexNormals();
      m.position.set(-0.016, 0, -0.008);
      g.add(m);
      return g;
    },
    place: 'lean',
  },
  cherry: {
    name: '酒渍樱桃',
    make: () => {
      const g = new THREE.Group();
      const c = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.0105, 20, 16), new THREE.MeshPhysicalMaterial({ color: 0x7a0a18, roughness: 0.15, clearcoat: 1, emissive: 0x3a0008, emissiveIntensity: 0.5 })));
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0.009, 0), new THREE.Vector3(0.004, 0.03, 0), new THREE.Vector3(0.014, 0.042, 0.003));
      const stem = new THREE.Mesh(new THREE.TubeGeometry(curve, 10, 0.0007, 6), new THREE.MeshStandardMaterial({ color: 0x4a3a1a, roughness: 0.7 }));
      g.add(c, stem);
      return g;
    },
    place: 'drop',
  },
  olive: {
    name: '橄榄',
    make: () => {
      const g = new THREE.Group();
      const pick = new THREE.Mesh(new THREE.CylinderGeometry(0.0009, 0.0009, 0.105, 6), steelMaterial());
      pick.position.y = 0.05;
      g.add(pick);
      for (let i = 0; i < 2; i++) {
        const o = shadow(new THREE.Mesh(new THREE.SphereGeometry(0.0098, 18, 14), new THREE.MeshPhysicalMaterial({ color: 0x77802a, roughness: 0.3, clearcoat: 0.6, emissive: 0x2a3008, emissiveIntensity: 0.4 })));
        o.scale.y = 1.25;
        o.position.y = 0.014 + i * 0.026;
        const p = new THREE.Mesh(new THREE.SphereGeometry(0.004, 10, 8), new THREE.MeshStandardMaterial({ color: 0xc8301c, roughness: 0.4 }));
        p.position.y = o.position.y + 0.0095;
        g.add(o, p);
      }
      return g;
    },
    place: 'pick',
  },
  mintSprig: { name: '薄荷枝', make: () => mint(7, true), place: 'sprig' },
  mintLeaves: { name: '薄荷叶', make: () => mint(7, false), place: 'bottom' },
};

function mint(n, sprig) {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3f9a3a, roughness: 0.55, emissive: 0x0f3a10, emissiveIntensity: 0.45 });
  const geo = new THREE.SphereGeometry(0.011, 12, 8);
  if (sprig) {
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0014, 0.09, 6), mat);
    stem.position.y = 0.045;
    g.add(stem);
  }
  for (let i = 0; i < n; i++) {
    const leaf = shadow(new THREE.Mesh(geo, mat));
    leaf.scale.set(0.85, 0.16, 1.5);
    const a = i * 2.4;
    if (sprig) {
      const y = 0.05 + (i / n) * 0.05, r = 0.012 * (1 - i / n) + 0.004;
      leaf.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      leaf.rotation.set(-0.7, -a + Math.PI / 2, 0, 'YXZ');
      leaf.scale.multiplyScalar(1 - (i / n) * 0.45);
    } else {
      leaf.position.set(Math.cos(a) * 0.01, 0.003 + i * 0.0035, Math.sin(a) * 0.01);
      leaf.rotation.set(0.3 * Math.sin(i), a, 0.3 * Math.cos(i));
    }
    g.add(leaf);
  }
  return g;
}
