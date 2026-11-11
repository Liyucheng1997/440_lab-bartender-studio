import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Timeline } from './util.js';
import { buildScene } from './scene.js';
import { Bartender } from './bartender.js';
import { Bartender as ToonBartender } from './bartender-toon.js';
import { Show } from './show.js';
import { Sound } from './sound.js';
import { RECIPES, METHODS, GLASSES, ING } from './data.js';

const $ = (s) => document.querySelector(s);
const canvas = $('#view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = buildScene(renderer);
const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 30);
camera.position.set(0.1, 1.5, 1.95);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0.02, 1.22, -0.08);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 0.7;
controls.maxDistance = 3.4;
controls.minPolarAngle = 0.75;
controls.maxPolarAngle = 1.62;
controls.minAzimuthAngle = -1.15;
controls.maxAzimuthAngle = 1.15;

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(4, 4), 0.25, 0.5, 1.5);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// 写实模型加载失败时退回程序化的卡通版
const bartender = await Bartender.load().catch((e) => {
  console.warn('写实模型加载失败，改用卡通版', e);
  return new ToonBartender();
});
scene.add(bartender.group);
const tl = new Timeline();
const sound = new Sound();

/* ---------- 界面 ---------- */
const TONE = { margarita: '#dfe3b0', daiquiri: '#e6e8c4', whiskeysour: '#d9a04a', cosmopolitan: '#d9486a', martini: '#e8e8d0', manhattan: '#7a2414', negroni: '#b01828', oldfashioned: '#b8691e', gintonic: '#dfe9ec', mojito: '#cfe0a8', sunrise: '#f08a18' };
let current = RECIPES[0];
let state = 'idle'; // idle | playing | paused | done

const hooks = {
  step(i) {
    document.querySelectorAll('.step').forEach((el, k) => {
      el.classList.toggle('done', i >= 0 && k < i);
      el.classList.toggle('now', k === i);
      if (k === i) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
    if (i >= 0) {
      $('#capIndex').textContent = `${i + 1} / ${current.steps.length}`;
      $('#capText').textContent = current.steps[i].text;
    } else {
      $('#capIndex').textContent = '';
      $('#capText').textContent = `${current.name} · ${METHODS[current.method].name}`;
    }
  },
  progress(t) {
    $('#capSub').textContent = t || '';
  },
  waiting(w) {
    $('#next').hidden = !w;
    if (w) $('#capSub').textContent = '看清楚了就点“下一步”';
  },
  done(info) {
    state = 'done';
    document.querySelectorAll('.step').forEach((el) => { el.classList.add('done'); el.classList.remove('now'); });
    $('#capIndex').textContent = '';
    $('#capText').textContent = `${current.name} 完成`;
    $('#capSub').textContent = '可以拖动画面，从不同角度看看成品';
    $('#resVol').textContent = Math.round(info.ml);
    $('#resAbv').textContent = info.abv.toFixed(1);
    $('#result').classList.add('show');
    $('#result').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    syncButtons();
  },
};
const show = new Show(scene, bartender, tl, hooks, sound);

function renderList() {
  const order = ['shake', 'stir', 'build', 'muddle', 'layer'];
  $('#list').innerHTML = order.map((m) => {
    const rs = RECIPES.filter((r) => r.method === m);
    return `<div class="group-title">${METHODS[m].name} · ${METHODS[m].en}</div>` + rs.map((r) =>
      `<button class="item" data-id="${r.id}"><span class="item-dot" style="background:${TONE[r.id]}"></span><span><div class="item-name">${r.name}</div><div class="item-en">${r.en}</div></span></button>`).join('');
  }).join('');
  $('#list').addEventListener('click', (e) => {
    const b = e.target.closest('.item');
    if (b) select(RECIPES.find((r) => r.id === b.dataset.id), true);
  });
}

function renderPanel(r) {
  const ings = [];
  for (const s of r.steps) {
    if (!s.ing) continue;
    const amt = s.do === 'dash' ? `${s.n} 抖` : `${s.ml} ml`;
    ings.push(`<div class="ing"><span class="sw" style="background:${ING[s.ing].color}"></span>${ING[s.ing].name}<span class="amt">${amt}</span></div>`);
  }
  const m = METHODS[r.method];
  $('#panel').innerHTML = `
    <h2>${r.name}</h2>
    <div class="en">${r.en}</div>
    <div class="tags"><span class="tag primary">${m.name}</span><span class="tag">${GLASSES[r.glass]}</span></div>
    <p class="desc">${r.desc}</p>
    <div class="section"><h3>${m.name}是什么</h3><div class="method">${m.desc}</div></div>
    <div class="section"><h3>原料</h3>${ings.join('')}</div>
    <div class="section"><h3>步骤</h3><ol class="steps">${r.steps.map((s, i) =>
      `<li class="step"><span class="num">${i + 1}</span><div>${s.text}${s.tip ? `<div class="tip">${s.tip}</div>` : ''}</div></li>`).join('')}</ol></div>
    <div class="result" id="result"><span class="status">调制完成</span>
      <div class="result-row"><div><b><span id="resVol">0</span> ml</b><span>成品容量（含融水）</span></div><div><b><span id="resAbv">0</span>%</b><span>酒精度约</span></div></div>
    </div>`;
  $('#panel').scrollTop = 0;
}

function syncButtons() {
  $('#toggle').textContent = state === 'playing' ? '暂停' : state === 'paused' ? '继续' : state === 'done' ? '再来一杯' : '开始';
  $('#start').classList.toggle('hide', state !== 'idle');
}

function select(r, autoplay) {
  current = r;
  document.querySelectorAll('.item').forEach((el) => el.classList.toggle('active', el.dataset.id === r.id));
  renderPanel(r);
  $('#next').hidden = true;
  tl.paused = false;
  show.load(r);
  state = 'idle';
  if (autoplay) start();
  syncButtons();
}
function start() {
  sound.ensure();
  sound.ctx?.resume();
  if (state === 'done' || state === 'playing' || state === 'paused') {
    renderPanel(current);
    show.load(current);
  }
  tl.paused = false;
  state = 'playing';
  show.play();
  syncButtons();
}

$('#startBtn').onclick = start;
$('#restart').onclick = start;
$('#toggle').onclick = () => {
  if (state === 'idle' || state === 'done') return start();
  tl.paused = !tl.paused;
  state = tl.paused ? 'paused' : 'playing';
  if (tl.paused) sound.pour(false);
  syncButtons();
};
$('#next').onclick = () => show.next();
const seg = (id, fn) => $(id).addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  $(id).querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  fn(b.dataset.v);
});
seg('#speed', (v) => (tl.speed = +v));
seg('#mode', (v) => {
  show.stepMode = v === 'step';
  if (!show.stepMode) show.next();
});
$('#mute').onclick = () => {
  sound.setMuted(!sound.muted);
  $('#mute').textContent = sound.muted ? '音效 关' : '音效 开';
};

/* ---------- 循环 ---------- */
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  camera.aspect = w / h;
  // 画面较窄时把镜头拉远一点，保证吧台两侧的东西都在画面里
  camera.fov = w / h < 1.25 ? 44 : 34;
  camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

let last = performance.now();
function frame() {
  const now = performance.now();
  const dt = Math.min((now - last) / 1000, 0.05);
  last = now;
  tl.update(dt);
  bartender.update(dt, camera);
  controls.update();
  composer.render();
}
renderer.setAnimationLoop(frame);

renderList();
select(RECIPES[0], false);
window.__app = { show, tl, bartender, camera, controls, scene, renderer, select, start, RECIPES, frame };

// 调试用：按固定步长快进 s 秒后暂停
window.__adv = async (s) => {
  renderer.setAnimationLoop(null);
  for (let i = 0; i < s / 0.02; i++) {
    tl.update(0.02);
    bartender.update(0.02, camera);
    await new Promise((r) => setTimeout(r, 0));
  }
  controls.update();
  composer.render();
};

// 调试用：瞬间跑完某款酒并把镜头推到成品前
window.__finish = async (id, cam = [0.3, 1.32, 0.95], tgt = [0.05, 1.1, 0.25]) => {
  renderer.setAnimationLoop(null);
  select(RECIPES.find((r) => r.id === id), true);
  for (let t = 0; t < 200 && state !== 'done'; t += 0.03) {
    tl.update(0.03);
    bartender.update(0.03, camera);
    for (let k = 0; k < 8; k++) await null;
  }
  camera.position.set(...cam);
  controls.target.set(...tgt);
  for (let i = 0; i < 40; i++) { bartender.update(0.03, camera); controls.update(); }
  composer.render();
  await new Promise((r) => setTimeout(r, 50));
  composer.render();
};
