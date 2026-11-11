import * as THREE from 'three';
import { V, lerp, ease, handBasis } from './util.js';
import { Vessel, Stream, iceGeo, iceMaterial } from './vessel.js';
import * as P from './props.js';
import { ING } from './data.js';

export const BAR_Y = 1.0;
const CENTER = V(0, BAR_Y, 0);
const SIDE = V(0.3, BAR_Y, 0.13);
const JIG = V(0.15, BAR_Y, -0.13);
const BUCKET = V(0.6, BAR_Y, -0.04);
const CAP = V(-0.19, BAR_Y, -0.13);
const TOOL = V(-0.2, BAR_Y, -0.14);
const STRAINER = V(0.05, BAR_Y + 0.011, -0.175);
const BOARD = V(-0.47, BAR_Y, 0.2);
const SAUCER = V(-0.21, BAR_Y, 0.2);
const UP = V(0, 1, 0);
const WATER = { name: '融水', abv: 0, color: '#e9eff1', tint: 0.02 };
const Q = (x, y, z) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));

/* 握法 */
function side(arm, y, r, curl = 0.55, x0 = 0) {
  const s = arm.s;
  return { p: V(x0 + s * (r + 0.012), y, -0.045), q: handBasis(V(-s, 0, 0), V(0, 0, 1)), curl };
}
function pinch(p = V()) {
  const fingers = V(0, -0.94, 0.34), palm = V(0, -0.34, -0.94);
  return { world: true, p, q: handBasis(palm, fingers), offset: V(0, 0.121, -0.012), curl: 0.45 };
}
function glassGrip(arm, v) {
  if (v.kind === 'coupe' || v.kind === 'martini') return side(arm, 0.042, 0.006, 0.92);
  if (v.kind === 'highball') return side(arm, 0.055, 0.033, 0.55);
  if (v.kind === 'rocks') return side(arm, 0.04, 0.041, 0.5);
  return side(arm, 0.06, v.outerR * 0.92, 0.5);
}

export class Show {
  constructor(scene, bartender, tl, hooks, sound) {
    this.scene = scene;
    this.bt = bartender;
    this.tl = tl;
    this.hooks = hooks;
    this.sound = sound;
    this.stepMode = false;
    this.stage = null;
    this.run = 0;
  }

  /* ---------- 布置吧台 ---------- */
  load(recipe) {
    this.tl.cancel();
    this.run++;
    this.sound.stopAll();
    if (this.stage) this.scene.remove(this.stage);
    const st = (this.stage = new THREE.Group());
    this.scene.add(st);
    this.recipe = recipe;
    const bt = this.bt;
    for (const a of Object.values(bt.arms)) { a.mode = 'rest'; a.obj = null; a.curl = 0.15; }
    bt.lookAtCamera = false;
    bt.mood = 0;

    const place = (obj, pos) => { obj.group.position.copy(pos); st.add(obj.group); return obj; };

    this.glassPos = recipe.mix ? SIDE.clone() : CENTER.clone();
    this.glass = new Vessel(recipe.glass);
    this.glass.group.position.set(0.44, 0.78, -0.36);
    this.glass.group.visible = false;
    st.add(this.glass.group);
    this.mix = null;
    if (recipe.mix) {
      this.mix = new Vessel(recipe.mix, { metal: recipe.mix === 'tin' });
      place(this.mix, CENTER);
    }
    this.jigger = place(new Vessel('jigger', { metal: true }), JIG);

    // 酒瓶：按首次使用顺序排在调酒师右手边
    this.bottles = {};
    const ids = [...new Set(recipe.steps.filter((s) => s.ing).map((s) => s.ing))];
    ids.forEach((id, i) => {
      const b = P.makeBottle(ING[id]);
      const pos = V(-0.37 - i * 0.112, BAR_Y, -0.05 - (i % 2) * 0.012);
      place(b, pos);
      b.rest = pos.clone();
      b.restMouth = pos.clone().add(b.mouth);
      this.bottles[id] = b;
    });

    const dos = new Set(recipe.steps.map((s) => s.do));
    if (dos.has('ice')) {
      place(P.makeBucket(), BUCKET);
      this.scoop = place(P.makeScoop(), BUCKET.clone().add(V(0.01, 0.2, 0.01)));
      this.scoop.group.rotation.z = 0.12;
      this.scoop.tip = V(this.scoop.handleX, -0.1, 0);
      this.scoop.group.updateWorldMatrix(true, false);
      this.scoop.restTip = this.scoop.tip.clone().applyMatrix4(this.scoop.group.matrixWorld);
    }
    if (dos.has('shake')) this.cap = place(P.makeCapTin(), CAP);
    if (dos.has('strain')) this.strainer = place(P.makeStrainer(), STRAINER);
    if (dos.has('stir') || dos.has('muddle')) {
      const cupPos = dos.has('shake') ? TOOL.clone().add(V(0, 0, 0.14)) : TOOL;
      place(P.makeToolCup(), cupPos);
      if (dos.has('stir')) { this.spoon = place(P.makeSpoon(), cupPos.clone().add(V(0.008, 0.007, 0))); this.spoon.rest = this.spoon.group.position.clone(); }
      if (dos.has('muddle')) { this.muddler = place(P.makeMuddler(), cupPos.clone().add(V(-0.012, 0.007, 0.004))); this.muddler.rest = this.muddler.group.position.clone(); }
    }
    // 砧板与装饰物
    const items = recipe.steps.filter((s) => s.item).map((s) => s.item);
    this.garnish = {};
    if (items.length || dos.has('rim')) {
      const board = place(P.makeBoard(), BOARD);
      items.forEach((id, i) => {
        const g = P.GARNISH[id].make();
        g.position.set(BOARD.x - 0.09 + i * 0.1, BAR_Y + board.top + 0.004, BOARD.z + 0.01);
        if (P.GARNISH[id].place === 'pick') g.rotation.z = Math.PI / 2 - 0.05;
        if (id === 'mintSprig') g.rotation.z = 1.45;
        st.add(g);
        this.garnish[id] = g;
      });
      // 摆几颗整果做点缀
      const fruit = new THREE.Mesh(new THREE.SphereGeometry(0.027, 20, 16), new THREE.MeshStandardMaterial({ color: items.some((i) => i.startsWith('orange')) ? 0xf08a18 : 0x4a9a2e, roughness: 0.55 }));
      fruit.scale.y = 0.92;
      fruit.castShadow = true;
      fruit.position.set(BOARD.x + 0.11, BAR_Y + board.top + 0.025, BOARD.z - 0.04);
      st.add(fruit);
    }
    if (dos.has('rim')) {
      this.saucer = place(P.makeSaucer(), SAUCER);
      this.saltRim = P.makeSaltRim(this.glass.rimR, this.glass.rimY);
      this.saltRim.visible = false;
      this.glass.group.add(this.saltRim);
    }
    this.streams = [new Stream(), new Stream()];
    this.streams.forEach((s) => st.add(s.mesh));
    this.hooks.step(-1);
    this.hooks.progress(null);
  }

  target(to) {
    return to === 'mix' ? this.mix : this.glass;
  }

  /* ---------- 基础动作 ---------- */
  reach(a, obj, grip, dur = 0.5) {
    const p0 = a.pos.clone(), q0 = a.quat.clone(), c0 = a.curl;
    const tp = V(), tq = new THREE.Quaternion();
    a.mode = 'free';
    return this.tl.tween(dur, (e) => {
      this.bt.gripPose(obj, grip, tp, tq);
      a.pos.lerpVectors(p0, tp, e);
      a.pos.y += Math.sin(e * Math.PI) * 0.045;
      a.quat.slerpQuaternions(q0, tq, e);
      const open = grip.curl * 0.3;
      a.curl = e < 0.7 ? lerp(c0, open, e / 0.7) : lerp(open, grip.curl, (e - 0.7) / 0.3);
    }).then(() => { a.mode = 'follow'; a.obj = obj; a.grip = grip; a.curl = grip.curl; });
  }
  release(a, dur = 0.5) {
    if (a.mode === 'rest') return Promise.resolve();
    const p0 = a.pos.clone(), q0 = a.quat.clone(), c0 = a.curl;
    a.mode = 'free';
    a.obj = null;
    return this.tl.tween(dur, (e) => {
      a.pos.lerpVectors(p0, this.bt.restPos(a), e);
      a.pos.y += Math.sin(e * Math.PI) * 0.05;
      a.quat.slerpQuaternions(q0, a.restQuat, e);
      a.curl = lerp(c0, 0.15, Math.min(1, e * 2));
    }).then(() => { if (a.mode === 'free' && !a.obj) a.mode = 'rest'; });
  }
  moveObj(obj, to, dur = 0.6, lift = 0.06, quat = null) {
    const p0 = obj.position.clone(), q0 = obj.quaternion.clone();
    return this.tl.tween(dur, (e) => {
      obj.position.lerpVectors(p0, to, e);
      obj.position.y += Math.sin(e * Math.PI) * lift;
      if (quat) obj.quaternion.slerpQuaternions(q0, quat, e);
    });
  }
  /* 绕 Z 轴倾倒，同时保证 lip（局部点）沿直线移动到 anchor */
  setTilt(obj, lip, anchor, ang) {
    obj.rotation.set(0, 0, ang);
    obj.position.copy(anchor).sub(lip.clone().applyEuler(obj.rotation));
  }
  tilt(obj, lip, anchorEnd, angEnd, dur = 0.7, lift = 0) {
    obj.updateWorldMatrix(true, false);
    const a0 = lip.clone().applyMatrix4(obj.matrixWorld), ang0 = obj.rotation.z, an = V();
    return this.tl.tween(dur, (e) => {
      an.lerpVectors(a0, anchorEnd, e);
      an.y += Math.sin(e * Math.PI) * lift;
      this.setTilt(obj, lip, an, lerp(ang0, angEnd, e));
    });
  }
  lipWorld(obj, lip) {
    obj.updateWorldMatrix(true, false);
    return lip.clone().applyMatrix4(obj.matrixWorld);
  }
  surfaceY(v) {
    return v.group.position.y + Math.max(v.level, v.y0 + 0.002);
  }

  /* ---------- 流程 ---------- */
  async play() {
    const my = this.run;
    const steps = this.recipe.steps;
    await this.tl.wait(0.5);
    for (let i = 0; i < steps.length; i++) {
      if (my !== this.run) return;
      this.hooks.step(i);
      await this['do_' + steps[i].do](steps[i], steps[i + 1]);
      this.hooks.progress(null);
      await this.tl.wait(0.3);
      if (this.stepMode && i < steps.length - 1) {
        this.hooks.waiting(true);
        await new Promise((r) => (this.resume = r));
        this.hooks.waiting(false);
      }
    }
  }
  next() {
    const r = this.resume;
    this.resume = null;
    r?.();
  }

  async do_glass() {
    const { L } = this.bt.arms, G = this.glass, dest = this.glassPos;
    G.group.visible = true;
    await this.reach(L, G.group, glassGrip(L, G), 0.6);
    await this.moveObj(G.group, V(dest.x + 0.04, BAR_Y + 0.13, -0.2), 0.55, 0.02, null);
    await this.moveObj(G.group, dest, 0.6, 0.02);
    this.sound.clink(0.5);
    await this.release(L, 0.5);
  }

  async do_rim() {
    const { R } = this.bt.arms, G = this.glass, home = G.group.position.clone();
    await this.reach(R, G.group, glassGrip(R, G), 0.55);
    const lip = V(G.outerR, G.rimY, 0);
    const anchor = SAUCER.clone().add(V(-0.012, 0.012, 0));
    await this.tilt(G.group, lip, anchor, -1.72, 1.0, 0.14);
    for (let i = 0; i < 2; i++) {
      await this.tilt(G.group, lip, anchor.clone().add(V(0.02, 0, 0)), -1.9, 0.28);
      await this.tilt(G.group, lip, anchor, -1.72, 0.28);
    }
    this.saltRim.visible = true;
    await this.tilt(G.group, V(), home, 0, 1.0, 0.14);
    await this.release(R, 0.5);
  }

  async do_ice(step) {
    const { L } = this.bt.arms, T = this.target(step.to), tp = T.group.position, rimY = tp.y + T.rimY;
    const drop = (from, size) => {
      const m = T.addIce(size);
      if (!m) return Promise.resolve();
      const end = m.position.clone(), start = T.group.worldToLocal(from.clone());
      this.sound.ice();
      return this.tl.tween(0.24, (e) => m.position.lerpVectors(start, end, e), ease.in);
    };
    if (step.big) {
      const cube = new THREE.Mesh(iceGeo(0.047), iceMaterial);
      cube.position.copy(BUCKET).add(V(-0.02, 0.165, 0.02));
      cube.castShadow = true;
      this.stage.add(cube);
      await this.reach(L, cube, pinch(V(0, 0.02, 0)), 0.6);
      await this.moveObj(cube, V(tp.x, rimY + 0.05, tp.z), 0.85, 0.1);
      this.stage.remove(cube);
      const p = cube.position.clone();
      this.release(L, 0.5);
      await drop(p, 0.047);
      this.hooks.progress('1 块大方冰');
      return;
    }
    const S = this.scoop;
    await this.reach(L, S.group, side(L, 0.045, 0.0095, 0.92, S.handleX), 0.6);
    let left = step.n, added = 0;
    while (left > 0) {
      await this.tilt(S.group, S.tip, S.restTip.clone().add(V(-0.01, -0.02, 0)), 0.3, 0.25);
      const n = Math.min(3, left);
      S.cubes.forEach((c, i) => (c.visible = i < n));
      this.sound.ice();
      await this.tilt(S.group, S.tip, V(tp.x + 0.04, rimY + 0.085, tp.z), -1.5, 0.8, 0.13);
      await this.tilt(S.group, S.tip, V(tp.x + 0.012, rimY + 0.055, tp.z), -0.72, 0.3);
      for (let i = 0; i < n; i++) {
        S.cubes[i].visible = false;
        const from = this.lipWorld(S.group, S.tip);
        drop(from);
        added++;
        this.hooks.progress(`冰块 ${added} / ${step.n}`);
        await this.tl.wait(0.12);
      }
      left -= n;
      await this.tl.wait(0.15);
      await this.tilt(S.group, S.tip, S.restTip, 0.12, 0.75, 0.12);
    }
    await this.release(L, 0.5);
  }

  /* 把 from 容器/酒瓶的液体按时间倒出，回调负责加到目标里 */
  flow(dur, ml, streamIdx, lipFn, T, color, onAdd, label) {
    let done = 0;
    const s = this.streams[streamIdx];
    this.sound.pour(true);
    return this.tl.tween(dur, (e, k) => {
      const want = ml * k, d = want - done;
      done = want;
      onAdd(d, k);
      const from = lipFn();
      s.set(from, V(from.x, this.surfaceY(T), from.z), color, 0.0026 + Math.min(0.0022, ml / dur / 30000));
      if (label) this.hooks.progress(`${label} ${Math.round(want)} / ${Math.round(ml)} ml`);
    }, ease.linear).then(() => { s.hide(); this.sound.pour(false); });
  }

  async do_pour(step, next) {
    const { R, L } = this.bt.arms, ing = ING[step.ing], b = this.bottles[step.ing];
    const T = this.target(step.to), J = this.jigger, tp = T.group.position, rimY = tp.y + T.rimY;
    const jigPos = V(tp.x + 0.06, rimY + 0.05, tp.z);
    if (L.obj !== J.group) await this.reach(L, J.group, side(L, 0.084, 0.018, 0.82), 0.5);
    await Promise.all([
      this.moveObj(J.group, jigPos, 0.55, 0.03),
      this.reach(R, b.group, side(R, b.gripY, b.bodyR, 0.56), 0.6),
    ]);
    // 酒瓶 → 量酒器
    const anchor = jigPos.clone().add(V(-0.01, 0.118 + 0.032, 0));
    await this.tilt(b.group, b.mouth, anchor, -1.92, 0.8, 0.04);
    await this.flow(Math.max(0.65, step.ml / 42), step.ml, 0, () => this.lipWorld(b.group, b.mouth), J, ing.color, (d) => J.add(ing, d), ing.name);
    const back = this.tilt(b.group, b.mouth, b.restMouth, 0, 0.8, 0.05).then(() => this.release(R, 0.45));
    // 量酒器 → 容器
    await this.tl.wait(0.3);
    const lip = V(-0.0293, 0.118, 0);
    const over = V(tp.x + 0.012, rimY + 0.04, tp.z);
    await this.tilt(J.group, lip, over, 1.05, 0.35);
    const tiltJ = this.tilt(J.group, lip, over, 2.15, 0.7);
    await this.flow(0.7, step.ml, 1, () => this.lipWorld(J.group, lip), T, ing.color, (d) => {
      J.take(d);
      T.add(ing, d, { sink: !!step.sink });
    });
    await tiltJ;
    J.contents = [];
    J.refresh();
    await this.tilt(J.group, V(), jigPos, 0, 0.4);
    const keep = next && next.do === 'pour' && !this.stepMode;
    if (!keep) {
      await this.moveObj(J.group, JIG, 0.5, 0.04);
      this.sound.clink(0.3);
      this.release(L, 0.45);
    }
    await back;
  }

  async do_top(step) {
    const { R } = this.bt.arms, ing = ING[step.ing], b = this.bottles[step.ing];
    const T = this.target(step.to), tp = T.group.position, rimY = tp.y + T.rimY;
    await this.reach(R, b.group, side(R, b.gripY, b.bodyR, 0.56), 0.6);
    const anchor = V(tp.x - T.rimR * 0.55, rimY + 0.04, tp.z);
    await this.tilt(b.group, b.mouth, anchor, -1.72, 0.85, 0.05);
    const pourTilt = this.tilt(b.group, b.mouth, anchor, -2.0, Math.max(1.3, step.ml / 50));
    await this.flow(Math.max(1.3, step.ml / 50), step.ml, 0, () => this.lipWorld(b.group, b.mouth), T, ing.color, (d) => T.add(ing, d), ing.name);
    await pourTilt;
    await this.tilt(b.group, b.mouth, b.restMouth, 0, 0.85, 0.05);
    await this.release(R, 0.45);
  }

  async do_dash(step) {
    const { R } = this.bt.arms, ing = ING[step.ing], b = this.bottles[step.ing];
    const T = this.target(step.to), tp = T.group.position, rimY = tp.y + T.rimY;
    await this.reach(R, b.group, side(R, 0.045, b.bodyR, 0.8), 0.6);
    const anchor = V(tp.x, rimY + 0.09, tp.z);
    await this.tilt(b.group, b.mouth, anchor, -2.55, 0.85, 0.05);
    for (let i = 0; i < step.n; i++) {
      await this.tilt(b.group, b.mouth, anchor.clone().add(V(0, -0.04, 0)), -2.75, 0.13);
      T.add(ing, 0.9);
      const from = this.lipWorld(b.group, b.mouth);
      this.streams[0].set(from, V(from.x, this.surfaceY(T), from.z), ing.color, 0.0016);
      this.hooks.progress(`苦精 ${i + 1} / ${step.n} 抖`);
      await this.tilt(b.group, b.mouth, anchor, -2.55, 0.17);
      this.streams[0].hide();
      await this.tl.wait(0.12);
    }
    await this.tilt(b.group, b.mouth, b.restMouth, 0, 0.85, 0.05);
    await this.release(R, 0.45);
  }

  async do_shake(step) {
    const { R, L } = this.bt.arms, T = this.mix, C = this.cap, tp = T.group.position.clone();
    await this.reach(R, C.group, side(R, 0.07, 0.038, 0.5), 0.55);
    await this.moveObj(C.group, V(tp.x, tp.y + 0.128, tp.z), 0.65, 0.14);
    await this.moveObj(C.group, V(tp.x, tp.y + 0.112, tp.z), 0.12, 0);
    this.sound.clink(0.9);
    T.group.attach(C.group);
    await Promise.all([
      this.reach(R, T.group, side(R, 0.06, 0.039, 0.56), 0.5),
      this.reach(L, T.group, side(L, 0.2, 0.036, 0.56), 0.5),
    ]);
    const qS = Q(0, 0.5, -1.32);
    const center = V(0, 0.12, 0);
    const base = V(this.bt.root.position.x - 0.05, 1.4, -0.07).sub(center.clone().applyQuaternion(qS));
    await this.moveObj(T.group, base, 0.6, 0.05, qS);
    this.bt.lookAtCamera = true;
    this.bt.mood = 1;
    const axis = V(0, 1, 0).applyQuaternion(qS);
    const wob = new THREE.Quaternion();
    let lastHalf = -1;
    const frost = T.shell.material;
    await this.tl.tween(step.sec, (e, k) => {
      const t = k * step.sec, ph = t * Math.PI * 2 * 4.3;
      const amp = Math.min(1, t * 3, (step.sec - t) * 3);
      T.group.position.copy(base).addScaledVector(axis, Math.sin(ph) * 0.078 * amp).addScaledVector(UP, Math.cos(ph) * 0.028 * amp);
      wob.setFromAxisAngle(V(0, 0, 1), Math.sin(ph + 0.8) * 0.13 * amp);
      T.group.quaternion.copy(qS).multiply(wob);
      const half = Math.floor(ph / Math.PI);
      if (half !== lastHalf) { lastHalf = half; this.sound.rattle(); }
      frost.roughness = 0.2 + 0.3 * k; // 壶壁逐渐结霜
      this.hooks.progress(`摇和中 ${Math.round(k * 12)} / 12 秒`);
    }, ease.linear);
    T.cloudy = 1;
    T.add(WATER, T.ml * 0.27);
    this.bt.lookAtCamera = false;
    this.bt.mood = 0;
    await this.moveObj(T.group, tp, 0.65, 0.04, new THREE.Quaternion());
    this.sound.clink(0.6);
    this.release(L, 0.5);
    await this.reach(R, C.group, side(R, 0.07, 0.038, 0.5), 0.5);
    this.stage.attach(C.group);
    this.sound.clink(0.8);
    await this.moveObj(C.group, CAP, 0.65, 0.12, new THREE.Quaternion());
    await this.release(R, 0.45);
  }

  async do_stir(step) {
    const { R, L } = this.bt.arms, T = this.target(step.in), tp = T.group.position, sp = this.spoon;
    const grip = pinch(V(0, 0.25, 0));
    await Promise.all([this.reach(R, sp.group, grip, 0.6), this.reach(L, T.group, glassGrip(L, T), 0.6)]);
    await this.moveObj(sp.group, V(tp.x, tp.y + T.rimY + 0.03, tp.z), 0.7, 0.1);
    const by = tp.y + T.y0 + 0.012;
    await this.moveObj(sp.group, V(tp.x + T.radiusAt(T.y0) * 0.55, by, tp.z), 0.35, 0);
    const r = T.radiusAt(T.y0 + 0.01) * 0.55, B = V(), Tp = V();
    const ice0 = T.iceGroup.rotation.y;
    let lastTurn = 0;
    await this.tl.tween(step.sec, (e, k) => {
      const ph = k * step.sec * Math.PI * 2 * 1.7;
      const amp = Math.min(1, (1 - k) * 6);
      B.set(tp.x + Math.cos(ph) * r, by, tp.z + Math.sin(ph) * r);
      Tp.set(tp.x - 0.01 - Math.cos(ph) * 0.012 * amp, by + 0.29, tp.z - 0.012 - Math.sin(ph) * 0.012 * amp);
      sp.group.position.copy(B);
      sp.group.quaternion.setFromUnitVectors(UP, Tp.sub(B).normalize());
      T.iceGroup.rotation.y = ice0 - ph * 0.55;
      if (Math.floor(ph / 2.1) !== lastTurn) { lastTurn = Math.floor(ph / 2.1); if (T.ice.length) this.sound.tick(); }
      this.hooks.progress(step.sec > 3 ? `搅拌中 ${Math.round(k * 100)}%` : '轻提搅匀');
    }, ease.linear);
    T.add(WATER, T.ml * (step.in === 'mix' ? 0.2 : step.sec > 3 ? 0.16 : 0.03));
    await this.moveObj(sp.group, V(tp.x, tp.y + T.rimY + 0.04, tp.z), 0.4, 0, new THREE.Quaternion());
    this.release(L, 0.5);
    await this.moveObj(sp.group, sp.rest, 0.7, 0.1);
    await this.release(R, 0.45);
  }

  async do_solid(step) {
    await this.placeGarnish(step.item, 0.9);
  }

  async do_muddle() {
    const { R, L } = this.bt.arms, T = this.glass, tp = T.group.position, md = this.muddler;
    await Promise.all([this.reach(R, md.group, side(R, 0.165, 0.012, 0.92), 0.6), this.reach(L, T.group, glassGrip(L, T), 0.6)]);
    await this.moveObj(md.group, V(tp.x, tp.y + T.rimY + 0.03, tp.z), 0.7, 0.1);
    const low = tp.y + T.y0 + 0.008;
    await this.moveObj(md.group, V(tp.x, low + 0.03, tp.z), 0.35, 0);
    const leaves = this.garnish.mintLeaves;
    for (let i = 0; i < 5; i++) {
      await this.tl.tween(0.2, (e) => { md.group.position.y = lerp(low + 0.03, low, e); md.group.rotation.y = i * 0.9 + e * 0.6; });
      this.sound.tick();
      if (leaves) leaves.scale.y = Math.max(0.45, leaves.scale.y - 0.11);
      this.hooks.progress(`轻压 ${i + 1} / 5`);
      await this.tl.tween(0.22, (e) => { md.group.position.y = lerp(low, low + 0.03, e); });
    }
    md.group.rotation.y = 0;
    T.add({ name: '薄荷油', abv: 0, color: '#9cc27a', tint: 1.2 }, 1.5);
    await this.moveObj(md.group, V(tp.x, tp.y + T.rimY + 0.04, tp.z), 0.4, 0);
    this.release(L, 0.5);
    await this.moveObj(md.group, md.rest, 0.7, 0.1);
    await this.release(R, 0.45);
  }

  async do_strain() {
    const { R, L } = this.bt.arms, T = this.mix, G = this.glass, St = this.strainer;
    const tp = T.group.position.clone(), gp = G.group.position;
    await this.reach(L, St.group, pinch(V(-0.02, 0, 0)), 0.55);
    await this.moveObj(St.group, V(tp.x, tp.y + T.rimY + 0.003, tp.z), 0.6, 0.12);
    this.sound.clink(0.4);
    T.group.attach(St.group);
    this.release(L, 0.5);
    await this.reach(R, T.group, side(R, 0.095, T.outerR * 0.9, 0.52), 0.55);
    const lip = V(T.rimR, T.rimY, 0);
    const anchor = V(gp.x - Math.min(0.02, G.rimR * 0.4), gp.y + G.rimY + 0.05, gp.z);
    await this.tilt(T.group, lip, anchor, -1.5, 1.0, 0.09);
    const ml = T.ml, dur = Math.max(1.6, ml / 40);
    G.cloudy = T.cloudy;
    const more = this.tilt(T.group, lip, anchor, -2.2, dur);
    await this.flow(dur, ml, 0, () => this.lipWorld(T.group, lip), G, '#' + T.color.getHexString(), (d) => {
      for (const part of T.take(d)) G.add(part.ing, part.ml);
    }, '滤入');
    await more;
    T.contents = [];
    T.refresh();
    await this.tl.wait(0.25);
    await this.tilt(T.group, V(), tp, 0, 0.9, 0.07);
    this.sound.clink(0.5);
    await this.release(R, 0.5);
  }

  finalPose(id, G) {
    const kind = P.GARNISH[id].place, a = 0.55;
    const topIce = G.ice.reduce((m, c) => Math.max(m, c.position.y + c.userData.size / 2), G.y0);
    const surface = Math.max(G.level, topIce);
    switch (kind) {
      case 'rim': {
        const half = id === 'orangeWheel';
        return { p: V(Math.cos(a) * G.rimR, G.rimY + (half ? -0.008 : 0.008), Math.sin(a) * G.rimR), q: Q(-Math.PI / 2, -a, 0) };
      }
      case 'tuck':
        return { p: V(Math.cos(a) * G.rimR * 0.5, G.rimY - 0.022, Math.sin(a) * G.rimR * 0.5), q: Q(-Math.PI / 2 + 0.25, -a + 1.2, 0) };
      case 'float':
        return { p: V(0.006, Math.min(G.rimY - 0.002, surface + 0.01), 0.008), q: Q(0.4, 0.8, 1.2) };
      case 'lean':
        return { p: V(G.rimR * 0.35, Math.min(G.rimY - 0.012, surface + 0.016), G.rimR * 0.2), q: Q(0.3, 0.5, -0.75) };
      case 'drop':
        return { p: V(-G.rimR * 0.3, G.ice.length ? Math.min(G.rimY - 0.006, topIce + 0.009) : G.y0 + 0.014, G.rimR * 0.3), q: Q(0, 0, 0.2) };
      case 'pick':
        return { p: V(-G.rimR * 0.3, Math.max(G.y0 + 0.004, G.level - 0.034), 0.004), q: Q(0, 0, -0.95) };
      case 'sprig':
        return { p: V(-G.rimR * 0.45, G.rimY - 0.075, G.rimR * 0.35), q: Q(0.15, 0, 0.18) };
      default:
        return { p: V(0, G.y0 + 0.003, 0), q: Q(0, 0, 0) };
    }
  }
  async placeGarnish(id, speed = 1) {
    const { R } = this.bt.arms, G = this.glass, item = this.garnish[id];
    const fin = this.finalPose(id, G);
    const world = G.group.localToWorld(fin.p.clone());
    await this.reach(R, item, pinch(V(0, 0.008, 0)), 0.6);
    const above = V(world.x, Math.max(world.y + 0.06, G.group.position.y + G.rimY + 0.05), world.z);
    await this.moveObj(item, above, 0.9 * speed, 0.1, fin.q);
    await this.moveObj(item, world, 0.4, 0);
    G.group.attach(item);
    await this.release(R, 0.5);
  }
  async do_garnish(step) {
    await this.placeGarnish(step.item);
    this.hooks.progress(P.GARNISH[step.item].name);
  }

  async do_serve() {
    const { R } = this.bt.arms, G = this.glass, gp = G.group.position;
    await this.reach(R, G.group, glassGrip(R, G), 0.6);
    await this.moveObj(G.group, V(lerp(gp.x, 0.06, 0.6), BAR_Y, 0.3), 1.0, 0);
    await this.release(R, 0.6);
    this.bt.lookAtCamera = true;
    this.bt.mood = 1;
    this.sound.clink(1);
    this.hooks.done({ ml: G.ml, abv: G.abv(), color: '#' + G.color.getHexString() });
  }
}
