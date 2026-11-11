import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { V, clamp, lerp, handBasis, vestAlpha } from './util.js';

const L1 = 0.295, L2 = 0.265; // 上臂、前臂
const UP = new THREE.Vector3(0, 1, 0);
const lathe = (pts, seg = 48) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg);
const smooth = (pts, n = 40) => new THREE.SplineCurve(pts.map(([r, y]) => new THREE.Vector2(r, y))).getPoints(n).map((p) => [Math.max(0, p.x), p.y]);

const M = {
  skin: new THREE.MeshPhysicalMaterial({ color: 0xd9a37f, roughness: 0.58, sheen: 0.4, sheenColor: 0xffc9a8, sheenRoughness: 0.5 }),
  shirt: new THREE.MeshStandardMaterial({ color: 0xcfccc6, roughness: 0.85 }),
  vest: new THREE.MeshStandardMaterial({ color: 0x1b1c20, roughness: 0.7, alphaMap: null, alphaTest: 0.5, side: THREE.DoubleSide }),
  dark: new THREE.MeshStandardMaterial({ color: 0x16171a, roughness: 0.75 }),
  apron: new THREE.MeshStandardMaterial({ color: 0x2a2623, roughness: 0.9, side: THREE.DoubleSide }),
  hair: new THREE.MeshStandardMaterial({ color: 0x2a1c14, roughness: 0.62 }),
  eyeWhite: new THREE.MeshStandardMaterial({ color: 0xf6f3ee, roughness: 0.25 }),
  iris: new THREE.MeshStandardMaterial({ color: 0x4a2f1c, roughness: 0.2 }),
  pupil: new THREE.MeshBasicMaterial({ color: 0x050505 }),
  lip: new THREE.MeshStandardMaterial({ color: 0xa8604f, roughness: 0.5 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xc9a25a, roughness: 0.3, metalness: 1 }),
};

function mesh(geo, mat, parent, pos) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  m.receiveShadow = true;
  if (pos) m.position.set(...pos);
  parent?.add(m);
  return m;
}

/* 一只手：局部 Y = 手腕指向指尖，Z = 掌心朝向；右手拇指在 +X */
function makeHand(side) {
  const g = new THREE.Group();
  const palm = mesh(new RoundedBoxGeometry(0.074, 0.084, 0.026, 4, 0.011), M.skin, g, [0, 0.046, 0]);
  palm.scale.set(1, 1, 1);
  mesh(new THREE.SphereGeometry(0.027, 16, 12), M.skin, g, [0, 0.004, 0]).scale.set(1.05, 0.9, 0.62);
  const fingers = [];
  const spec = [[0.027, 0.95], [0.009, 1.06], [-0.009, 0.99], [-0.027, 0.78]];
  for (const [x, k] of spec) {
    const lens = [0.035 * k, 0.025 * k, 0.021 * k];
    const joints = [];
    let parent = g, y = 0.087;
    lens.forEach((len, i) => {
      const j = new THREE.Group();
      j.position.set(i === 0 ? side * x : 0, y, 0);
      parent.add(j);
      const r = 0.0088 - i * 0.0008;
      mesh(new THREE.CapsuleGeometry(r, len - r, 4, 10), M.skin, j, [0, len / 2, 0]);
      joints.push(j);
      parent = j;
      y = len;
    });
    fingers.push(joints);
  }
  // 拇指
  const tb = new THREE.Group();
  tb.position.set(side * 0.034, 0.03, 0.006);
  g.add(tb);
  mesh(new THREE.CapsuleGeometry(0.0105, 0.03, 4, 10), M.skin, tb, [0, 0.02, 0]);
  const t2 = new THREE.Group();
  t2.position.y = 0.042;
  tb.add(t2);
  mesh(new THREE.CapsuleGeometry(0.0092, 0.022, 4, 10), M.skin, t2, [0, 0.015, 0]);
  const hand = { group: g, fingers, tb, t2, side, curl: -1 };
  setCurl(hand, 0.15);
  return hand;
}
function setCurl(hand, c) {
  if (Math.abs(c - hand.curl) < 0.002) return;
  hand.curl = c;
  hand.fingers.forEach((j, i) => {
    const k = 1 + i * 0.05;
    j[0].rotation.x = c * 1.15 * k;
    j[1].rotation.x = c * 1.45 * k;
    j[2].rotation.x = c * 0.95;
  });
  const s = hand.side;
  hand.tb.rotation.set(c * 0.55, s * c * -0.9, -s * (0.85 - c * 0.2), 'ZYX');
  hand.t2.rotation.x = c * 0.7;
}

export class Bartender {
  constructor() {
    this.group = new THREE.Group(); // 世界空间，不做变换
    this.root = new THREE.Group(); // 身体整体（左右平移）
    this.root.position.set(0, 0, -0.39);
    this.group.add(this.root);
    this.torso = new THREE.Group(); // 以髋为轴前倾 / 转体
    this.torso.position.y = 0.97;
    this.root.add(this.torso);
    this.buildBody();
    this.buildHead();
    this.buildArms();
    this.lookAtCamera = false;
    this.mood = 0; // 0 平静 1 微笑
    this.t = 0;
    this.blink = 2;
    this.sway = { x: 0, lean: 0, twist: 0 };
  }

  buildBody() {
    const t = this.torso;
    const prof = smooth([[0.15, 0], [0.156, 0.07], [0.149, 0.17], [0.155, 0.26], [0.176, 0.35], [0.187, 0.42], [0.178, 0.47], [0.14, 0.507], [0.085, 0.532], [0.052, 0.55]], 36);
    const shirt = mesh(lathe(prof, 56), M.shirt, t);
    shirt.scale.z = 0.66;
    M.vest.alphaMap = vestAlpha();
    const vest = mesh(lathe(prof.map(([r, y]) => [r * 1.04 + 0.002, y]), 56), M.vest, t);
    vest.scale.z = 0.69;
    this.chest = [shirt, vest];
    for (let i = 0; i < 4; i++) mesh(new THREE.SphereGeometry(0.0062, 10, 8), M.brass, t, [0, 0.06 + i * 0.055, 0.112 + (i > 2 ? 0.006 : 0)]);
    // 领子与领结
    const collar = mesh(new THREE.CylinderGeometry(0.054, 0.06, 0.026, 28, 1, true), M.shirt, t, [0, 0.55, 0.002]);
    collar.material = M.shirt.clone();
    collar.material.side = THREE.DoubleSide;
    for (const s of [-1, 1]) {
      const wing = mesh(new THREE.ConeGeometry(0.02, 0.046, 4), M.dark, t, [s * 0.026, 0.538, 0.062]);
      wing.rotation.z = s * Math.PI / 2;
      wing.scale.z = 0.4;
    }
    mesh(new THREE.SphereGeometry(0.0095, 10, 8), M.dark, t, [0, 0.538, 0.064]);
    mesh(new THREE.CylinderGeometry(0.047, 0.052, 0.09, 24), M.skin, t, [0, 0.585, 0]);
    // 围裙、腿、鞋
    const apron = mesh(new THREE.CylinderGeometry(0.166, 0.185, 0.62, 32, 1, true, -1.9, 3.8), M.apron, this.root, [0, 0.76, 0]);
    apron.scale.z = 0.72;
    const band = mesh(new THREE.CylinderGeometry(0.163, 0.163, 0.035, 32), M.apron, this.root, [0, 1.06, 0]);
    band.scale.z = 0.7;
    for (const s of [-1, 1]) {
      mesh(new THREE.CapsuleGeometry(0.072, 0.78, 6, 16), M.dark, this.root, [s * 0.085, 0.52, 0]);
      mesh(new RoundedBoxGeometry(0.095, 0.07, 0.25, 3, 0.03), M.dark, this.root, [s * 0.09, 0.035, 0.045]);
    }
    mesh(new THREE.SphereGeometry(0.155, 24, 16), M.dark, this.root, [0, 0.97, 0]).scale.set(1, 0.6, 0.68);
  }

  buildHead() {
    const h = (this.head = new THREE.Group());
    h.position.set(0, 0.728, 0.012);
    this.torso.add(h);
    const prof = smooth([[0, -0.118], [0.03, -0.114], [0.052, -0.097], [0.066, -0.07], [0.0765, -0.035], [0.084, 0], [0.088, 0.035], [0.085, 0.07], [0.07, 0.1], [0.042, 0.119], [0, 0.126]], 48);
    const skull = mesh(lathe(prof, 48), M.skin, h);
    skull.scale.set(0.92, 1, 1.07);
    // 头发：后脑到头顶的壳 + 前额的发束
    const cap = mesh(new THREE.SphereGeometry(0.098, 48, 32, 0, Math.PI * 2, 0, Math.PI * 0.54), M.hair, h, [0, 0.036, -0.006]);
    cap.scale.set(0.95, 1.02, 1.1);
    cap.rotation.x = -0.36;
    const quiff = mesh(new THREE.SphereGeometry(0.05, 24, 16), M.hair, h, [0.01, 0.094, 0.04]);
    quiff.scale.set(1.5, 0.6, 1.25);
    quiff.rotation.set(-0.25, 0, -0.12);
    for (const s of [-1, 1]) {
      const side = mesh(new THREE.SphereGeometry(0.03, 16, 12), M.hair, h, [s * 0.073, 0.04, -0.012]);
      side.scale.set(0.45, 1.25, 1.5);
      const ear = mesh(new THREE.SphereGeometry(0.017, 16, 12), M.skin, h, [s * 0.08, -0.004, -0.008]);
      ear.scale.set(0.42, 1.15, 0.8);
      ear.rotation.y = s * -0.35;
    }
    // 眼睛
    this.eyes = [];
    for (const s of [-1, 1]) {
      const e = new THREE.Group();
      e.position.set(s * 0.0335, 0.012, 0.0765);
      h.add(e);
      const ball = new THREE.Group();
      e.add(ball);
      mesh(new THREE.SphereGeometry(0.0125, 20, 16), M.eyeWhite, ball).castShadow = false;
      const iris = mesh(new THREE.SphereGeometry(0.0068, 16, 12), M.iris, ball, [0, 0, 0.0098]);
      iris.scale.z = 0.5;
      const pupil = mesh(new THREE.SphereGeometry(0.0032, 12, 10), M.pupil, ball, [0, 0, 0.0122]);
      pupil.scale.z = 0.4;
      const hl = mesh(new THREE.SphereGeometry(0.0011, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), ball, [0.0024, 0.0026, 0.0134]);
      hl.castShadow = false;
      const lid = mesh(new THREE.SphereGeometry(0.0136, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.skin, e);
      lid.rotation.x = -0.55;
      const lower = mesh(new THREE.SphereGeometry(0.0134, 20, 12, 0, Math.PI * 2, Math.PI * 0.68, Math.PI * 0.32), M.skin, e);
      lower.rotation.x = -0.25;
      const brow = mesh(new THREE.CapsuleGeometry(0.0034, 0.024, 4, 8), M.hair, h, [s * 0.035, 0.036, 0.083]);
      brow.rotation.set(0.2, s * 0.3, Math.PI / 2 + s * 0.12);
      this.eyes.push({ ball, lid, brow });
    }
    // 鼻、嘴
    const bridge = mesh(new THREE.CapsuleGeometry(0.0075, 0.03, 4, 10), M.skin, h, [0, -0.002, 0.089]);
    bridge.rotation.x = -0.28;
    mesh(new THREE.SphereGeometry(0.0125, 16, 12), M.skin, h, [0, -0.022, 0.0975]).scale.set(1.15, 0.85, 1);
    this.mouth = mesh(new THREE.TorusGeometry(0.03, 0.0026, 8, 24, 1.1), M.lip, h, [0, -0.031, 0.08]);
    this.mouth.rotation.set(0.25, 0, -Math.PI / 2 - 0.55);
    this.mouth.castShadow = false;
    // 一点胡茬的下巴阴影
    h.scale.setScalar(1.08);
  }

  buildArms() {
    this.arms = {};
    for (const key of ['R', 'L']) {
      const s = key === 'R' ? -1 : 1; // 调酒师面向 +Z，右手在 -X
      const a = { key, s };
      a.shoulderLocal = V(s * 0.196, 0.468, 0);
      a.shoulder = mesh(new THREE.SphereGeometry(0.056, 20, 16), M.shirt, this.torso, a.shoulderLocal.toArray());
      a.upper = mesh(new THREE.CapsuleGeometry(0.047, L1 - 0.02, 6, 16).translate(0, L1 / 2, 0), M.shirt, this.group);
      a.elbow = mesh(new THREE.SphereGeometry(0.046, 16, 12), M.shirt, this.group);
      a.fore = new THREE.Group();
      this.group.add(a.fore);
      mesh(new THREE.CylinderGeometry(0.029, 0.04, L2, 16).translate(0, L2 / 2, 0), M.skin, a.fore);
      mesh(new THREE.CylinderGeometry(0.0445, 0.046, 0.07, 16), M.shirt, a.fore, [0, 0.04, 0]);
      mesh(new THREE.TorusGeometry(0.043, 0.006, 8, 20), M.shirt, a.fore, [0, 0.078, 0]).rotation.x = Math.PI / 2;
      a.hand = makeHand(-s); // 右手拇指在 +X
      this.group.add(a.hand.group);
      // 状态
      a.pos = V(s * 0.21, 1.06, -0.2);
      a.quat = handBasis(V(0, -1, 0), V(-s * 0.25, 0, 1));
      a.curl = 0.15;
      a.mode = 'rest';
      a.obj = null;
      a.grip = null;
      a.restQuat = a.quat.clone();
      a.restOffset = V(s * 0.215, 1.045, 0.22);
      this.arms[key] = a;
    }
  }

  restPos(a) {
    return V(this.root.position.x + a.restOffset.x, a.restOffset.y, this.root.position.z + a.restOffset.z);
  }
  /* 抓握点的世界位姿 */
  gripPose(obj, grip, outPos, outQuat) {
    obj.updateWorldMatrix(true, false);
    if (grip.world) {
      outPos.copy(grip.p).applyMatrix4(obj.matrixWorld).add(grip.offset);
      outQuat.copy(grip.q);
    } else {
      outPos.copy(grip.p).applyMatrix4(obj.matrixWorld);
      obj.getWorldQuaternion(outQuat).multiply(grip.q);
    }
  }

  update(dt, camera) {
    this.t += dt;
    const { R, L } = this.arms;
    // 1. 手的目标
    for (const a of [R, L]) {
      if (a.mode === 'follow') this.gripPose(a.obj, a.grip, a.pos, a.quat);
      else if (a.mode === 'rest') {
        a.pos.lerp(this.restPos(a), 1 - Math.exp(-dt * 10));
        a.quat.slerp(a.restQuat, 1 - Math.exp(-dt * 10));
      }
    }
    // 2. 身体跟随：左右挪步、前倾、转体
    const k = 1 - Math.exp(-dt * 4.5);
    let wantX = 0;
    for (const a of [R, L]) if (a.mode !== 'rest') wantX += (a.pos.x - a.s * 0.215) * 0.6;
    wantX = clamp(wantX, -0.5, 0.5);
    this.sway.x = lerp(this.sway.x, wantX, k);
    this.root.position.x = this.sway.x;
    let need = 0;
    for (const a of [R, L]) {
      const sh = V(this.root.position.x + a.shoulderLocal.x, 0.97 + a.shoulderLocal.y, this.root.position.z);
      need = Math.max(need, sh.distanceTo(a.pos) - 0.47);
    }
    this.sway.lean = lerp(this.sway.lean, clamp(need * 1.9, 0, 0.42), k);
    const twist = clamp((L.pos.z - R.pos.z) * 0.9 + (R.pos.y - L.pos.y) * 0.25, -0.4, 0.4);
    this.sway.twist = lerp(this.sway.twist, twist, k);
    const breath = Math.sin(this.t * 1.5);
    this.torso.rotation.set(this.sway.lean + breath * 0.004, this.sway.twist, 0, 'YXZ');
    this.chest[0].scale.set(1 + breath * 0.006, 1, 0.66 + breath * 0.008);
    this.chest[1].scale.set(1 + breath * 0.006, 1, 0.69 + breath * 0.008);
    this.torso.updateWorldMatrix(true, true);

    // 3. 手臂 IK
    for (const a of [R, L]) this.solveArm(a);

    // 4. 头部注视
    let target;
    const busy = [R, L].filter((a) => a.mode !== 'rest');
    if (this.lookAtCamera || busy.length === 0) target = camera.position.clone();
    else {
      target = V();
      busy.forEach((a) => target.add(a.pos));
      target.multiplyScalar(1 / busy.length);
      target.y -= 0.03;
    }
    const local = this.torso.worldToLocal(target.clone()).sub(this.head.position);
    const yaw = clamp(Math.atan2(local.x, local.z), -0.75, 0.75);
    const pitch = clamp(-Math.atan2(local.y, Math.hypot(local.x, local.z)), -0.3, 0.62);
    const hk = 1 - Math.exp(-dt * 5);
    this.head.rotation.y = lerp(this.head.rotation.y, yaw - this.sway.twist * 0.5, hk);
    this.head.rotation.x = lerp(this.head.rotation.x, pitch * 0.82 - this.sway.lean * 0.5, hk);
    // 眨眼与表情
    this.blink -= dt;
    const closing = this.blink < 0.13 ? Math.sin((clamp(this.blink, 0, 0.13) / 0.13) * Math.PI) : 0;
    if (this.blink <= 0) this.blink = 2 + Math.random() * 3.5;
    const smile = (this.smile = lerp(this.smile ?? 0, this.mood, 1 - Math.exp(-dt * 3)));
    for (const e of this.eyes) {
      e.lid.rotation.x = lerp(-0.55 + pitch * 0.5 + smile * 0.12, 0.62, closing);
      e.ball.rotation.x = pitch * 0.25;
    }
    this.mouth.scale.set(1 + smile * 0.22, 1 + smile * 0.5, 1);
    this.mouth.position.y = -0.031 - smile * 0.004;
  }

  solveArm(a) {
    const S = a.shoulder.getWorldPosition(new THREE.Vector3());
    const d = a.pos.clone().sub(S);
    let dist = d.length();
    const dir = d.clone().normalize();
    const max = L1 + L2 - 0.004;
    const wrist = a.pos.clone();
    if (dist > max) {
      dist = max;
      wrist.copy(S).addScaledVector(dir, dist);
    }
    dist = Math.max(dist, 0.12);
    const x = (L1 * L1 - L2 * L2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, L1 * L1 - x * x));
    // 肘部朝外、朝下、略向后
    const hint = V(a.s * 0.75, -0.62, -0.38);
    const pole = hint.addScaledVector(dir, -hint.dot(dir)).normalize();
    const E = S.clone().addScaledVector(dir, x).addScaledVector(pole, h);
    a.upper.position.copy(S);
    a.upper.quaternion.setFromUnitVectors(UP, E.clone().sub(S).normalize());
    a.elbow.position.copy(E);
    a.fore.position.copy(E);
    a.fore.quaternion.setFromUnitVectors(UP, wrist.clone().sub(E).normalize());
    a.hand.group.position.copy(wrist);
    a.hand.group.quaternion.copy(a.quat);
    setCurl(a.hand, a.curl);
  }
}
