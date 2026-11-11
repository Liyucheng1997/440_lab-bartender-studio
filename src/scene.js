import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { woodTexture, neonTexture } from './util.js';
import { makeBottle } from './props.js';
import { ING } from './data.js';

export function buildScene(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0807);
  scene.fog = new THREE.Fog(0x0a0807, 5, 11);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.32;

  const add = (geo, mat, pos, opt = {}) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(...pos);
    m.castShadow = opt.cast ?? false;
    m.receiveShadow = opt.receive ?? true;
    scene.add(m);
    return m;
  };

  /* 吧台 */
  const topMat = new THREE.MeshPhysicalMaterial({ map: woodTexture('#5a3418', '#2a1508', [3, 1]), roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  add(new THREE.BoxGeometry(5, 0.05, 0.74), topMat, [0, 0.975, 0.1], { cast: true });
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.55 });
  add(new THREE.BoxGeometry(4.9, 0.95, 0.5), bodyMat, [0, 0.475, 0.14], { cast: true });
  const brass = new THREE.MeshStandardMaterial({ color: 0xc9a25a, roughness: 0.25, metalness: 1 });
  for (let x = -2.1; x <= 2.1; x += 0.7) add(new THREE.BoxGeometry(0.012, 0.86, 0.01), brass, [x, 0.48, 0.393]);
  const rail = add(new THREE.CylinderGeometry(0.018, 0.018, 4.9, 12), brass, [0, 0.2, 0.52]);
  rail.rotation.z = Math.PI / 2;
  // 吧垫
  add(new THREE.BoxGeometry(0.46, 0.003, 0.26), new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.92 }), [0.04, 1.0005, -0.07]);

  /* 地面与后墙 */
  const floor = add(new THREE.PlaneGeometry(14, 10), new THREE.MeshStandardMaterial({ color: 0x14100d, roughness: 0.6 }), [0, 0, 0]);
  floor.rotation.x = -Math.PI / 2;
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x1a2a2a, roughness: 0.85 });
  add(new THREE.PlaneGeometry(14, 4.2), wallMat, [0, 2.1, -1.62]);
  // 木饰面背板
  add(new THREE.BoxGeometry(4.4, 1.75, 0.04), new THREE.MeshStandardMaterial({ map: woodTexture('#3a2212', '#1a0d05', [2, 1]), roughness: 0.6 }), [0, 1.86, -1.58]);
  // 后吧柜
  add(new THREE.BoxGeometry(4.4, 0.92, 0.5), bodyMat, [0, 0.46, -1.34], { cast: true });
  add(new THREE.BoxGeometry(4.46, 0.04, 0.56), topMat, [0, 0.94, -1.33]);

  /* 层板、灯带与酒瓶 */
  const shelfMat = new THREE.MeshStandardMaterial({ color: 0x241509, roughness: 0.5 });
  const led = new THREE.MeshBasicMaterial({ color: 0xffc47a });
  led.color.multiplyScalar(2.2);
  const ids = Object.keys(ING).filter((k) => !['lime', 'lemon', 'syrup', 'cranberry', 'orange', 'soda', 'tonic', 'angostura'].includes(k));
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  [0.96, 1.42, 1.86, 2.3].forEach((y, row) => {
    if (row > 0) {
      add(new THREE.BoxGeometry(4.2, 0.03, 0.24), shelfMat, [0, y - 0.015, -1.44], { cast: true });
      add(new THREE.BoxGeometry(4.1, 0.008, 0.012), led, [0, y - 0.034, -1.35], { receive: false });
      for (const gx of [-1.1, 1.1]) {
        const glow = new THREE.PointLight(0xffb866, 0.13, 2.2, 1.6);
        glow.position.set(gx, y - 0.12, -1.3);
        scene.add(glow);
      }
    }
    if (row === 3) return;
    for (let x = -1.95; x <= 1.95; x += 0.125 + rnd() * 0.05) {
      const b = makeBottle(ING[ids[Math.floor(rnd() * ids.length)]], { decor: true });
      b.group.position.set(x, y, -1.47 + rnd() * 0.06);
      b.group.rotation.y = (rnd() - 0.5) * 0.9;
      b.group.scale.setScalar(0.92 + rnd() * 0.12);
      b.group.traverse((o) => { if (o.isMesh) o.castShadow = false; });
      scene.add(b.group);
    }
  });

  /* 霓虹招牌 */
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.375), new THREE.MeshBasicMaterial({ map: neonTexture('Mixology'), transparent: true, toneMapped: false, depthWrite: false }));
  neon.position.set(0, 2.52, -1.55);
  neon.material.color.multiplyScalar(2.6);
  scene.add(neon);
  const neonLight = new THREE.PointLight(0xff5a3c, 0.35, 4, 2);
  neonLight.position.set(0, 2.5, -1.3);
  scene.add(neonLight);

  /* 吊灯 */
  const shadeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1c, roughness: 0.4, metalness: 0.8, side: THREE.DoubleSide });
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  bulbMat.color.multiplyScalar(3);
  for (const x of [-1.25, 0, 1.25]) {
    add(new THREE.CylinderGeometry(0.004, 0.004, 1.4, 6), shadeMat, [x, 3.05, 0.12], { receive: false });
    add(new THREE.ConeGeometry(0.15, 0.17, 28, 1, true), shadeMat, [x, 2.34, 0.12], { receive: false });
    add(new THREE.SphereGeometry(0.035, 16, 12), bulbMat, [x, 2.27, 0.12], { receive: false });
    const sp = new THREE.SpotLight(0xffc98a, x === 0 ? 4.2 : 3, 5, 0.78, 0.7, 1.6);
    sp.position.set(x, 2.26, 0.12);
    sp.target.position.set(x, 1, 0.02);
    if (x === 0) {
      sp.castShadow = true;
      sp.shadow.mapSize.set(2048, 2048);
      sp.shadow.bias = -0.0004;
      sp.shadow.radius = 5;
      sp.shadow.camera.near = 0.3;
      sp.shadow.camera.far = 4;
    }
    scene.add(sp, sp.target);
  }

  /* 主光、补光、轮廓光 */
  scene.add(new THREE.HemisphereLight(0xffe6cc, 0x18120e, 0.28));
  const key = new THREE.SpotLight(0xfff0dc, 16, 9, 0.42, 0.6, 1.5);
  key.position.set(-1.5, 2.9, 2.6);
  key.target.position.set(0, 1.3, -0.25);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0005;
  key.shadow.radius = 6;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 7;
  scene.add(key, key.target);
  const fill = new THREE.SpotLight(0xbfd4ff, 6, 9, 0.5, 0.8, 1.5);
  fill.position.set(2.2, 2.0, 2.4);
  fill.target.position.set(0, 1.3, -0.3);
  scene.add(fill, fill.target);
  const rim = new THREE.SpotLight(0xffb070, 7, 6, 0.6, 0.7, 1.5);
  rim.position.set(1.3, 2.7, -1.25);
  rim.target.position.set(0, 1.45, -0.4);
  scene.add(rim, rim.target);

  return scene;
}
