import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { V, clamp, lerp, handBasis } from './util.js';

/* 写实调酒师：微软 Rocketbox 人物库 Business_Male_06（MIT 授权），
 * 骨骼由本文件每帧驱动：脊柱前倾/转体、双臂两段 IK、手指抓握、头部注视、眨眼与微笑。 */

const DIR = import.meta.env.BASE_URL + 'models/bartender/';
const Qt = THREE.Quaternion;
const _a = new Qt(), _b = new Qt(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3();
const X = V(1, 0, 0), Y = V(0, 1, 0);

function setWorldQuat(bone, q) {
  bone.parent.getWorldQuaternion(_b);
  bone.quaternion.copy(_b.invert()).multiply(q);
}
function preRotate(bone, dq) {
  bone.getWorldQuaternion(_a);
  setWorldQuat(bone, dq.clone().multiply(_a));
}
function aim(bone, child, dir) {
  const from = child.getWorldPosition(_v1).sub(bone.getWorldPosition(_v2)).normalize();
  preRotate(bone, new Qt().setFromUnitVectors(from, dir));
}

export class Bartender {
  static async load() {
    const tl = new THREE.TextureLoader();
    const tex = async (name, srgb) => {
      const t = await tl.loadAsync(DIR + name);
      if (srgb) t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      return t;
    };
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => (/\.(tga|png|jpg|jpeg|bmp)$/i.test(url) && !url.includes(DIR + 'body_') && !url.includes(DIR + 'head_') ? 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' : url));
    const [fbx, bc, bn, hc, hn] = await Promise.all([
      new FBXLoader(manager).loadAsync(DIR + 'bartender.fbx'),
      tex('body_color.jpg', true), tex('body_normal.jpg'), tex('head_color.jpg', true), tex('head_normal.jpg'),
    ]);
    return new Bartender(fbx, { bc, bn, hc, hn });
  }

  constructor(fbx, t) {
    this.group = new THREE.Group();
    this.root = new THREE.Group();
    this.root.position.set(0, 0, -0.4);
    this.group.add(this.root);
    fbx.scale.setScalar(0.01);
    this.root.add(fbx);
    this.model = fbx;

    const body = new THREE.MeshStandardMaterial({ map: t.bc, normalMap: t.bn, roughness: 0.78, color: 0xd6d6d6 });
    const head = new THREE.MeshStandardMaterial({ map: t.hc, normalMap: t.hn, roughness: 0.6 });
    fbx.traverse((o) => {
      if (!o.isMesh) return;
      const old = Array.isArray(o.material) ? o.material : [o.material];
      const mats = old.map((m) => (/head/i.test(m.name) ? head : body));
      o.material = Array.isArray(o.material) ? mats : mats[0];
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false;
    });

    // 骨骼表与静止姿态
    const B = (this.bones = {});
    fbx.traverse((o) => { if (o.isBone) B[o.name.replace('Bip01_', '')] = o; });
    this.restQ = new Map();
    this.restP = new Map();
    for (const b of Object.values(B)) { this.restQ.set(b, b.quaternion.clone()); this.restP.set(b, b.position.clone()); }
    this.group.updateWorldMatrix(true, true);

    this.arms = {};
    for (const key of ['R', 'L']) {
      const s = key === 'R' ? -1 : 1;
      const a = { key, s };
      a.upper = B[`${key}_UpperArm`]; a.fore = B[`${key}_Forearm`]; a.handBone = B[`${key}_Hand`];
      a.L1 = a.upper.getWorldPosition(V()).distanceTo(a.fore.getWorldPosition(V()));
      a.L2 = a.fore.getWorldPosition(V()).distanceTo(a.handBone.getWorldPosition(V()));
      a.fingers = [1, 2, 3, 4].map((i) => ['', '1', '2'].map((j) => B[`${key}_Finger${i}${j}`]));
      a.thumb = ['', '1', '2'].map((j) => B[`${key}_Finger0${j}`]);
      // 手的“标准坐标”（Y=指向指尖，Z=掌心朝向）与手骨之间的固定偏差
      const hp = a.handBone.getWorldPosition(V());
      const fingers = B[`${key}_Finger2`].getWorldPosition(V()).sub(hp).normalize();
      const thumbSide = B[`${key}_Finger1`].getWorldPosition(V()).sub(B[`${key}_Finger4`].getWorldPosition(V())).normalize();
      const xAxis = thumbSide.multiplyScalar(-s); // 右手拇指在 +X，左手在 -X
      const palm = new THREE.Vector3().crossVectors(xAxis, fingers).normalize();
      const frame = handBasis(palm, fingers);
      a.offset = frame.invert().multiply(a.handBone.getWorldQuaternion(new Qt()));
      a.pos = V(s * 0.215, 1.05, -0.18);
      a.quat = handBasis(V(0, -1, 0), V(-s * 0.25, 0, 1));
      a.restQuat = a.quat.clone();
      a.restOffset = V(s * 0.215, 1.04, 0.23);
      a.curl = 0.15;
      a.mode = 'rest';
      a.obj = null;
      a.grip = null;
      this.arms[key] = a;
    }
    this.lookAtCamera = false;
    this.mood = 0;
    this.smile = 0;
    this.t = 0;
    this.blink = 2;
    this.sway = { x: 0, lean: 0, twist: 0, yaw: 0, pitch: 0 };
  }

  restPos(a) {
    return V(this.root.position.x + a.restOffset.x, a.restOffset.y, this.root.position.z + a.restOffset.z);
  }
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
    const { R, L } = this.arms, B = this.bones;
    for (const a of [R, L]) {
      if (a.mode === 'follow') this.gripPose(a.obj, a.grip, a.pos, a.quat);
      else if (a.mode === 'rest') {
        a.pos.lerp(this.restPos(a), 1 - Math.exp(-dt * 10));
        a.quat.slerp(a.restQuat, 1 - Math.exp(-dt * 10));
      }
    }
    // 身体跟随
    const k = 1 - Math.exp(-dt * 4.5);
    let wantX = 0;
    for (const a of [R, L]) if (a.mode !== 'rest') wantX += (a.pos.x - a.s * 0.215) * 0.6;
    this.sway.x = lerp(this.sway.x, clamp(wantX, -0.5, 0.5), k);
    this.root.position.x = this.sway.x;
    let need = 0;
    for (const a of [R, L]) {
      _v1.set(this.root.position.x + a.s * 0.21, 1.43, this.root.position.z - 0.02);
      need = Math.max(need, _v1.distanceTo(a.pos) - 0.45);
    }
    this.sway.lean = lerp(this.sway.lean, clamp(need * 1.9, 0, 0.45), k);
    const twist = clamp((L.pos.z - R.pos.z) * 0.9 + (R.pos.y - L.pos.y) * 0.25, -0.4, 0.4);
    this.sway.twist = lerp(this.sway.twist, twist, k);

    // 所有受控骨骼先回到静止姿态
    for (const [b, q] of this.restQ) { b.quaternion.copy(q); b.position.copy(this.restP.get(b)); }

    // 脊柱：前倾 + 转体，分摊到三节
    const breath = Math.sin(this.t * 1.5) * 0.006;
    const dq = new Qt().setFromAxisAngle(Y, this.sway.twist / 3).multiply(new Qt().setFromAxisAngle(X, (this.sway.lean + breath) / 3));
    for (const n of ['Spine', 'Spine1', 'Spine2']) preRotate(B[n], dq);

    for (const a of [R, L]) this.solveArm(a);
    this.lookAndFace(dt, camera);
  }

  solveArm(a) {
    const S = a.upper.getWorldPosition(new THREE.Vector3());
    const d = a.pos.clone().sub(S);
    let dist = d.length();
    const dir = d.clone().normalize();
    const max = a.L1 + a.L2 - 0.004;
    const wrist = a.pos.clone();
    if (dist > max) { dist = max; wrist.copy(S).addScaledVector(dir, dist); }
    dist = Math.max(dist, 0.12);
    const x = (a.L1 * a.L1 - a.L2 * a.L2 + dist * dist) / (2 * dist);
    const h = Math.sqrt(Math.max(0, a.L1 * a.L1 - x * x));
    const hint = V(a.s * 0.75, -0.62, -0.38);
    const pole = hint.addScaledVector(dir, -hint.dot(dir)).normalize();
    const E = S.clone().addScaledVector(dir, x).addScaledVector(pole, h);
    aim(a.upper, a.fore, E.clone().sub(S).normalize());
    const foreDir = wrist.clone().sub(E).normalize();
    aim(a.fore, a.handBone, foreDir);
    // 前臂分担一部分手腕的旋转，避免手腕处皮肤拧成麻花
    const target = a.quat.clone().multiply(a.offset);
    const cur = a.handBone.getWorldQuaternion(new Qt());
    const delta = target.clone().multiply(cur.invert());
    const proj = delta.x * foreDir.x + delta.y * foreDir.y + delta.z * foreDir.z;
    const tw = new Qt(foreDir.x * proj, foreDir.y * proj, foreDir.z * proj, delta.w).normalize();
    if (tw.w < 0) tw.set(-tw.x, -tw.y, -tw.z, -tw.w);
    preRotate(a.fore, new Qt().slerp(tw, 0.55));
    setWorldQuat(a.handBone, target);

    // 手指：绕手的 X 轴向掌心弯曲
    const c = a.curl;
    const ax = V(1, 0, 0).applyQuaternion(a.quat);
    const ay = V(0, 1, 0).applyQuaternion(a.quat);
    a.fingers.forEach((f, i) => {
      const kk = 1 + i * 0.05;
      [1.0 * kk, 1.35 * kk, 0.85].forEach((amt, j) => preRotate(f[j], new Qt().setFromAxisAngle(ax, c * amt)));
    });
    const side = -a.s; // 右手 +1
    preRotate(a.thumb[0], new Qt().setFromAxisAngle(ay, -side * c * 0.75).multiply(new Qt().setFromAxisAngle(ax, c * 0.35)));
    preRotate(a.thumb[1], new Qt().setFromAxisAngle(ay, -side * c * 0.35));
    preRotate(a.thumb[2], new Qt().setFromAxisAngle(ay, -side * c * 0.45));
  }

  lookAndFace(dt, camera) {
    const { R, L } = this.arms, B = this.bones;
    let target;
    const busy = [R, L].filter((a) => a.mode !== 'rest');
    if (this.lookAtCamera || busy.length === 0) target = camera.position.clone();
    else {
      target = V();
      busy.forEach((a) => target.add(a.pos));
      target.multiplyScalar(1 / busy.length);
    }
    const hp = B.Head.getWorldPosition(new THREE.Vector3());
    const d = target.sub(hp);
    const yaw = clamp(Math.atan2(d.x, d.z) - this.sway.twist, -0.8, 0.8);
    const pitch = clamp(-Math.atan2(d.y - 0.08, Math.hypot(d.x, d.z)) - this.sway.lean, -0.3, 0.6);
    const hk = 1 - Math.exp(-dt * 5);
    this.sway.yaw = lerp(this.sway.yaw, yaw, hk);
    this.sway.pitch = lerp(this.sway.pitch, pitch, hk);
    const part = (f) => new Qt().setFromAxisAngle(Y, this.sway.yaw * f).multiply(new Qt().setFromAxisAngle(X, this.sway.pitch * f));
    // 绕身体自身的朝向转头：先换到躯干坐标
    const torso = new Qt().setFromAxisAngle(Y, this.sway.twist);
    const wrap = (q) => torso.clone().multiply(q).multiply(torso.clone().invert());
    preRotate(B.Neck, wrap(part(0.35)));
    preRotate(B.Head, wrap(part(0.65)));

    // 眨眼、微笑：直接移动面部骨骼（单位厘米，换算到头骨坐标）
    this.blink -= dt;
    const closing = this.blink < 0.14 ? Math.sin((clamp(this.blink, 0, 0.14) / 0.14) * Math.PI) : 0;
    if (this.blink <= 0) this.blink = 2 + Math.random() * 3.5;
    this.smile = lerp(this.smile, this.mood, 1 - Math.exp(-dt * 3));
    const headInv = B.Head.getWorldQuaternion(new Qt()).invert();
    const move = (name, x, y, z) => { const b = B[name]; if (b) b.position.add(_v1.set(x, y, z).applyQuaternion(headInv)); };
    const lid = closing * 1.15 + Math.max(0, this.sway.pitch) * 0.5 + this.smile * 0.12;
    move('LEyeBlinkTop', 0, -lid, 0);
    move('REyeBlinkTop', 0, -lid, 0);
    const sm = this.smile;
    move('LMouthCorner', 0.32 * sm, 0.42 * sm, -0.1 * sm);
    move('RMouthCorner', -0.32 * sm, 0.42 * sm, -0.1 * sm);
    move('LCheek', 0.1 * sm, 0.25 * sm, 0);
    move('RCheek', -0.1 * sm, 0.25 * sm, 0);
    move('LEyeBlinkBottom', 0, 0.12 * sm, 0);
    move('REyeBlinkBottom', 0, 0.12 * sm, 0);
  }
}
