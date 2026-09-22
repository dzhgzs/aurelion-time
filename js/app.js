/* AURELION 机械腕表 · 3D 鉴赏页
   纯程序化建模（无外部模型），three.js r152 UMD，file:// 直接可运行 */
(() => {
"use strict";
const $ = (s) => document.querySelector(s.startsWith("#") || s.startsWith(".") ? s : "#" + s);
const V = THREE.Vector3;

/* ---------- 轻提示（全局 toast，clock.js 通过 window.AURELION_TOAST 复用） ---------- */
function toast(msg) {
  try {
    let box = document.getElementById("toastBox");
    if (!box) {
      box = document.createElement("div");
      box.id = "toastBox";
      box.setAttribute("aria-live", "polite");
      box.style.cssText = "position:fixed;top:88px;right:24px;z-index:70;display:flex;flex-direction:column;gap:8px;align-items:flex-end;pointer-events:none;";
      document.body.appendChild(box);
    }
    const el = document.createElement("div");
    el.textContent = msg;
    el.style.cssText = "background:rgba(20,21,26,.92);border:1px solid rgba(200,162,78,.35);color:#f4f1ea;font-size:12px;letter-spacing:.06em;padding:10px 16px;border-radius:6px;opacity:0;transform:translateY(-8px);transition:opacity .3s, transform .3s;backdrop-filter:blur(10px);max-width:300px;line-height:1.6;";
    box.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = "1"; el.style.transform = "none"; });
    setTimeout(() => { el.style.opacity = "0"; el.style.transform = "translateY(-8px)"; setTimeout(() => el.remove(), 350); }, 3400);
  } catch {}
}
window.AURELION_TOAST = toast;

/* 渲染端异常上报主进程日志（crash.log），便于维护诊断 */
addEventListener("error", (e) => {
  try {
    if (window.AURELION_DESKTOP && window.AURELION_DESKTOP.logError) window.AURELION_DESKTOP.logError("renderer: " + (e && e.message));
  } catch {}
});
/* 未处理的 Promise 拒绝同样上报（静默失败是维护大敌） */
addEventListener("unhandledrejection", (e) => {
  try {
    const r = e && e.reason;
    const msg = r && (r.stack || r.message) ? (r.stack || r.message) : String(r);
    if (window.AURELION_DESKTOP && window.AURELION_DESKTOP.logError) window.AURELION_DESKTOP.logError("renderer-rejection: " + msg);
  } catch {}
});

/* ============ 渲染器 / 场景 / 相机 ============ */
const stage = $("#stage");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (e) {
  const cap = document.querySelector(".loader .cap");
  if (cap) cap.textContent = "此设备不支持 WebGL，无法渲染 3D 腕表";
  throw e;
}
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();

/* 场景背景：内烘焙径向渐变（画布自包含，所见即所得） */
{
  const bc = document.createElement("canvas");
  bc.width = bc.height = 1024;
  const bx = bc.getContext("2d");
  const bg = bx.createRadialGradient(512, 470, 60, 512, 512, 720);
  bg.addColorStop(0, "#262931");
  bg.addColorStop(0.55, "#0e0f13");
  bg.addColorStop(1, "#050506");
  bx.fillStyle = bg;
  bx.fillRect(0, 0, 1024, 1024);
  const bgTex = new THREE.CanvasTexture(bc);
  bgTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = bgTex;
}
const camera = new THREE.PerspectiveCamera(34, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0.4, 0.55, 3.4);

/* 环境反射（金属质感关键） */
{
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(
    new THREE.SphereGeometry(10, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x15161a, side: THREE.BackSide })
  ));
  const mkLight = (c, i, x, y, z, sx, sy) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(sx, sy),
      new THREE.MeshBasicMaterial({ color: c })
    );
    m.material.color.multiplyScalar(i);
    m.position.set(x, y, z); m.lookAt(0, 0, 0);
    envScene.add(m);
  };
  mkLight(0xffffff, 4.2, 2, 4, 3, 6, 3);   // 顶部柔光
  mkLight(0xd8e4ff, 2.0, -4, 1, -3, 5, 2); // 冷侧
  mkLight(0xffe8c0, 1.6, 4, -1, 2, 4, 6);  // 暖底
  const envTex = pmrem.fromScene(envScene, 0.04).texture;
  scene.environment = envTex;
  pmrem.dispose();
}

/* ============ 灯光预设 ============ */
const key = new THREE.DirectionalLight(0xfff2df, 2.6);
key.position.set(2.5, 4, 3);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = key.shadow.camera.bottom = -3;
key.shadow.camera.right = key.shadow.camera.top = 3;
key.shadow.radius = 6;
const fill = new THREE.DirectionalLight(0xbcd0ff, 0.9);
fill.position.set(-3, 1.5, -1);
const rim = new THREE.DirectionalLight(0xffffff, 1.4);
rim.position.set(0, 2, -4);
const amb = new THREE.AmbientLight(0xffffff, 0.25);
scene.add(key, fill, rim, amb);

const PRESETS = {
  studio:   { key: [0xfff2df, 2.6], fill: [0xbcd0ff, 0.9], rim: [0xffffff, 1.4], amb: 0.25, lume: 0,    name: "摄影棚", note: "摄影棚：柔和的三点布光，突出金属冷光与表镜通透感。" },
  showroom: { key: [0xffffff, 3.2], fill: [0xffe6bf, 1.1], rim: [0xdfe8ff, 1.8], amb: 0.4,  lume: 0.05, name: "展厅",   note: "展厅：明亮均匀的漫射光，适合整体陈列展示。" },
  dramatic: { key: [0xffd9a0, 4.2], fill: [0x1a2030, 0.15], rim: [0x6d8dff, 2.4], amb: 0.08, lume: 0.12, name: "戏剧",   note: "戏剧：单侧暖光加冷色轮廓，金属与宝石层次强烈。" },
  midnight: { key: [0x8fb0ff, 1.4], fill: [0x2a3350, 0.5], rim: [0xcfe0ff, 0.8], amb: 0.12, lume: 0.9,  name: "午夜",   note: "午夜：低照度冷调，夜光刻度与指针自发光浮现。" },
};
/* 智能光效：按时段自动切换场景（清晨展厅 → 白昼摄影棚 → 暮色戏剧 → 深夜午夜） */
const AUTO_BANDS = [["midnight", 0, 6], ["studio", 6, 11], ["showroom", 11, 18], ["dramatic", 18, 22], ["midnight", 22, 24]];
function resolveAutoKey(h) {
  for (const [k, a, b] of AUTO_BANDS) if (h >= a && h < b) return k;
  return "studio";
}

/* ---------- 启动恢复：localStorage 被清空/丢失时，从主进程文件镜像回填（幂等） ---------- */
function restoreKVMirror() {
  try {
    const D = window.AURELION_DESKTOP;
    if (!D || !D.restoreKV) return false;
    const kv = D.restoreKV();
    if (!kv || typeof kv !== "object") return false;
    let hasAny = false;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf("aurelion.") === 0) { hasAny = true; break; }
    }
    if (hasAny) return false; /* 本地尚有数据 → 以本地为准 */
    Object.entries(kv).forEach(([k, v]) => { try { localStorage.setItem(k, v); } catch {} });
    return Object.keys(kv).length > 0;
  } catch { return false; }
}
restoreKVMirror();
const mirrorKV = (k, v) => {
  try { if (window.AURELION_DESKTOP && window.AURELION_DESKTOP.saveKV) window.AURELION_DESKTOP.saveKV({ [k]: v }); } catch {}
};

/* ---------- 外观配置持久化（localStorage + 文件镜像双写） ---------- */
const AKEY = "aurelion.appearance.v1";
const loadLS = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } };
const appear = Object.assign(
  { case: "steel", dial: "blue", strap: "leather", light: "studio", exposure: 1.05, spin: true },
  loadLS(AKEY, {})
);
const saveAppear = () => {
  const s = JSON.stringify(appear);
  try { localStorage.setItem(AKEY, s); } catch {}
  mirrorKV(AKEY, s);
};

let lumeTarget = 0;
let lastAutoKey = null;
const applyLume = () => { try { matHands.emissive.setHex(0x3fc9a8).multiplyScalar(lumeTarget || 0); } catch {} };
function setPreset(n) {
  const isAuto = n === "auto";
  const real = isAuto ? resolveAutoKey(new Date().getHours()) : n;
  const p = PRESETS[real] || PRESETS.studio;
  key.color.set(p.key[0]);   key.intensity = p.key[1];
  fill.color.set(p.fill[0]); fill.intensity = p.fill[1];
  rim.color.set(p.rim[0]);   rim.intensity = p.rim[1];
  amb.intensity = p.amb;
  lumeTarget = p.lume || 0;
  applyLume();
  if (isAuto) {
    lastAutoKey = real;
    $("lightNote").textContent = "智能光效 · 已随时间切换至「" + p.name + "」：" + p.note;
  } else {
    lastAutoKey = null;
    $("lightNote").textContent = p.note;
  }
}
/* 手动初始调用放在材质创建后统一补光；此处仅设置 UI 文案避免 TDZ */
$("lightNote").textContent = PRESETS[appear.light] ? PRESETS[appear.light].note : PRESETS.studio.note;
document.querySelectorAll(".light").forEach((x) => x.classList.toggle("on", x.dataset.l === appear.light));
setPreset(appear.light in PRESETS || appear.light === "auto" ? appear.light : "studio");
$("lights").addEventListener("click", (e) => {
  const t = e.target.closest(".light"); if (!t) return;
  document.querySelectorAll(".light").forEach(x => x.classList.toggle("on", x === t));
  setPreset(t.dataset.l);
  appear.light = t.dataset.l; saveAppear();
});
/* 智能模式：时段跨越时自动平滑过渡 */
setInterval(() => {
  if (appear.light !== "auto") return;
  const k = resolveAutoKey(new Date().getHours());
  if (k !== lastAutoKey) { setPreset("auto"); document.querySelectorAll(".light").forEach(x => x.classList.toggle("on", x.dataset.l === "auto")); }
}, 60 * 1000);
const expEl = $("exposure");
renderer.toneMappingExposure = parseFloat(expEl.value);
expEl.value = appear.exposure;
renderer.toneMappingExposure = appear.exposure;
expEl.addEventListener("input", (e) => {
  renderer.toneMappingExposure = parseFloat(e.target.value);
  appear.exposure = parseFloat(e.target.value); saveAppear();
});
let autoSpin = appear.spin !== false;
$("spinToggle").addEventListener("click", () => {
  autoSpin = !autoSpin;
  $("spinToggle").classList.toggle("on", autoSpin);
  $("spinToggle").setAttribute("aria-checked", String(autoSpin));
  appear.spin = autoSpin; saveAppear();
});
$("spinToggle").classList.toggle("on", autoSpin);
$("spinToggle").setAttribute("aria-checked", String(autoSpin));

/* ---------- 性能自适应：帧率持续偏低时降低渲染分辨率（默认关闭，手动开启） ---------- */
const perfTg = $("#perfToggle");
const perfOn = () => appear.adaptive === true;
perfTg.classList.toggle("on", perfOn());
perfTg.setAttribute("aria-checked", String(perfOn()));
perfTg.addEventListener("click", () => {
  const next = !perfOn();
  appear.adaptive = next;
  saveAppear();
  perfTg.classList.toggle("on", next);
  perfTg.setAttribute("aria-checked", String(next));
  if (next) { adaptLevel = 0; applyAdapt(); } else { adaptLevel = 0; applyAdapt(); }
  toast(next ? "性能自适应已开启：卡顿时自动降低渲染精度" : "性能自适应已关闭：始终保持最高画质");
});
let fpsFrames = 0, fpsMark = performance.now(), fpsSmooth = 60, adaptLevel = 0, adaptCool = 0;
let softwareGL = false; /* 软件渲染环境标志：稍后由 detectSoftwareGL() 填充 */
/* 档位严格不超过设备像素比：任何"降档"都必须是降负载，绝不允许放大缓冲（否则弱 GPU 卡死/画布异常） */
function applyAdapt() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const map = [dpr, Math.min(dpr, 1.5), Math.min(dpr, 1.25), 1];
  /* 软件渲染环境永远锁定 1 倍缓冲：调整窗口/开关自适应都不允许放大负载 */
  const pr = softwareGL ? 1 : (map[adaptLevel] !== undefined ? map[adaptLevel] : 1);
  try {
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight); /* 双保险：缓冲与视口严格一致，杜绝拉伸变形 */
  } catch {}
}
applyAdapt();

/* ============ 材质库 ============ */
const dialTexture = (bg, fg, num) => {
  const c = document.createElement("canvas"); c.width = c.height = 1024;
  const x = c.getContext("2d");
  const cx = 512, cy = 512;
  x.fillStyle = bg; x.beginPath(); x.arc(cx, cy, 512, 0, 7); x.fill();
  // 太阳放射纹
  for (let i = 0; i < 240; i++) {
    const a = i / 240 * Math.PI * 2;
    const g = x.createLinearGradient(cx, cy, cx + Math.cos(a) * 512, cy + Math.sin(a) * 512);
    g.addColorStop(0, "rgba(255,255,255,0.05)"); g.addColorStop(1, "rgba(0,0,0,0.10)");
    x.strokeStyle = g; x.lineWidth = 2.4;
    x.beginPath(); x.moveTo(cx + Math.cos(a) * 60, cy + Math.sin(a) * 60);
    x.lineTo(cx + Math.cos(a) * 500, cy + Math.sin(a) * 500); x.stroke();
  }
  // 同心细纹
  for (let r = 90; r < 470; r += 14) {
    x.strokeStyle = "rgba(255,255,255,0.045)"; x.lineWidth = 1;
    x.beginPath(); x.arc(cx, cy, r, 0, 7); x.stroke();
  }
  // 品牌
  x.fillStyle = fg; x.textAlign = "center";
  x.font = "600 52px Georgia, 'Times New Roman', serif";
  x.fillText("AURELION", cx, 330);
  x.font = "400 26px Georgia, serif";
  x.fillText(num, cx, 372);
  x.font = "400 22px Georgia, serif";
  x.fillText("AUTOMATIQUE · SWISS MADE", cx, 760);
  // 分钟轨道 + 时刻刻度
  x.strokeStyle = fg; x.lineWidth = 3;
  x.beginPath(); x.arc(cx, cy, 452, 0, 7); x.stroke();
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * Math.PI * 2 - Math.PI / 2;
    const hour = i % 5 === 0;
    x.lineWidth = hour ? 10 : 3;
    x.strokeStyle = fg; x.fillStyle = fg;
    x.beginPath();
    x.arc(cx + Math.cos(a) * 420, cy + Math.sin(a) * 420, hour ? 7 : 0.01, 0, 7);
    if (hour) { x.stroke(); x.beginPath(); x.arc(cx + Math.cos(a) * 420, cy + Math.sin(a) * 420, 5, 0, 7); }
    else x.stroke();
  }
  // 时标 12 / 3 / 6 / 9（阿拉伯数字）
  x.font = "700 92px Georgia, serif"; x.fillStyle = fg;
  const put = (t, a, r) => x.fillText(t, cx + Math.cos(a) * r, cy + Math.sin(a) * r + 32);
  put("12", -Math.PI / 2, 372); put("3", 0, 372); put("6", Math.PI / 2, 372); put("9", Math.PI, 372);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
};

const CASEM = {
  steel:  { c: 0xd8dce2, metal: 1.0, rough: 0.18, name: "精钢" },
  gold:   { c: 0xd9a94f, metal: 1.0, rough: 0.22, name: "18K 黄金" },
  rose:   { c: 0xd89c7e, metal: 1.0, rough: 0.24, name: "玫瑰金" },
  black:  { c: 0x2a2c30, metal: 0.9, rough: 0.12, name: "黑钛" },
};
const DIAL = {
  noir:   { bg: "#101218", fg: "#e8dcc0", num: "REF. 0088-NOIR",  name: "曜石黑" },
  ivory:  { bg: "#e9e4d4", fg: "#3a3325", num: "REF. 0088-IVOIRE", name: "象牙白" },
  green:  { bg: "#12271e", fg: "#d8c98a", num: "REF. 0088-FORET",  name: "森林绿" },
  blue:   { bg: "#0d1d3c", fg: "#cfe0ff", num: "REF. 0088-BLEU",   name: "深海蓝" },
};
const STRAP = {
  leather: { c: 0x3a2417, rough: 0.72, metal: 0.0, name: "鳄鱼纹皮带" },
  black:   { c: 0x141414, rough: 0.85, metal: 0.0, name: "哑黑牛皮" },
  steel:   { c: 0xc9ced5, rough: 0.28, metal: 1.0, name: "一体式钢带" },
};

/* ============ 表体 ============ */
const R = 1;                      // 表壳半径
const spin = new THREE.Group();   // 自动旋转
const watch = new THREE.Group();  // 爆炸基准
spin.add(watch);
scene.add(spin);

/* ---------- 小工具 ---------- */
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const hot = $("#hot");

const M = (geo, mat, x = 0, y = 0, z = 0) => {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

/* ---------- 补间引擎 ---------- */
const tweens = [];
function tween(rec) {
  rec.t0 = performance.now() + (rec.delay || 0);
  rec.dur = rec.dur || 800;
  tweens.push(rec);
}
function killTweensOf(p) {
  for (let i = tweens.length - 1; i >= 0; i--) if (tweens[i].p === p) tweens.splice(i, 1);
}
function updateTweens(now) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    if (now < tw.t0) continue;
    const k = Math.min(1, (now - tw.t0) / tw.dur);
    const e = (tw.ease || easeOut)(k);
    if (tw.upd) tw.upd(e, k);
    if (k >= 1) { tweens.splice(i, 1); if (tw.done) tw.done(); }
  }
}

/* ---------- 材质实例 ---------- */
const DS = THREE.DoubleSide;
const matCaseP = new THREE.MeshPhysicalMaterial({ color: 0xd8dce2, metalness: 1, roughness: 0.16, clearcoat: 0.5, clearcoatRoughness: 0.25, envMapIntensity: 1.15, side: DS });
const matCaseB = new THREE.MeshPhysicalMaterial({ color: 0xd8dce2, metalness: 1, roughness: 0.38, envMapIntensity: 0.95, side: DS });
const matHands = new THREE.MeshPhysicalMaterial({ color: 0x1f3f9e, metalness: 1, roughness: 0.24, clearcoat: 0.7, clearcoatRoughness: 0.25, envMapIntensity: 1.2 });
const matAcc = new THREE.MeshPhysicalMaterial({ color: 0xd4af5e, metalness: 1, roughness: 0.25, envMapIntensity: 1.1 });
const matGlass = new THREE.MeshPhysicalMaterial({ color: 0xbfd8ff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.8, depthWrite: false, side: DS });
const matDialBody = new THREE.MeshStandardMaterial({ color: 0x0d1d3c, roughness: 0.6, metalness: 0.3 });
const matDialFace = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.25 });
const matHide = new THREE.MeshPhysicalMaterial({ color: 0x3a2417, roughness: 0.62, metalness: 0, clearcoat: 0.15, clearcoatRoughness: 0.5 });
const matBandP = new THREE.MeshPhysicalMaterial({ color: 0xd2d6dc, metalness: 1, roughness: 0.18, envMapIntensity: 1.1 });
const matBandB = new THREE.MeshPhysicalMaterial({ color: 0xc4c9d0, metalness: 1, roughness: 0.4, envMapIntensity: 0.9 });
const matPlate = new THREE.MeshPhysicalMaterial({ color: 0xa9aeb8, metalness: 1, roughness: 0.42, envMapIntensity: 0.9 });
const matGear = new THREE.MeshPhysicalMaterial({ color: 0xcfa855, metalness: 1, roughness: 0.3, envMapIntensity: 1.05 });
const matBridge = new THREE.MeshPhysicalMaterial({ color: 0xb9bfc9, metalness: 1, roughness: 0.32, envMapIntensity: 1.0 });
const matSteelDark = new THREE.MeshPhysicalMaterial({ color: 0x6f747d, metalness: 1, roughness: 0.45 });
const matScrew = new THREE.MeshPhysicalMaterial({ color: 0x777c85, metalness: 1, roughness: 0.4 });
const matRuby = new THREE.MeshPhysicalMaterial({ color: 0x8f1024, metalness: 0, roughness: 0.08, clearcoat: 1 });
applyLume(); /* 材质就绪后补上灯光预设里的夜光（首次调用时材质尚在 TDZ，被安全吞掉） */

/* 日内瓦波纹（夹板桥装饰纹） */
const genevaTex = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 256;
  const x = c.getContext("2d");
  x.fillStyle = "#b8bec8"; x.fillRect(0, 0, 256, 256);
  for (let i = -6; i < 16; i++) {
    x.fillStyle = i % 2 ? "rgba(255,255,255,.12)" : "rgba(0,0,0,.14)";
    x.save(); x.translate(i * 34, 0); x.rotate(-0.35);
    x.fillRect(0, -220, 17, 640); x.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return t;
})();
matBridge.map = genevaTex;

/* ---------- 零件注册（爆炸 / 点击 / 详情） ---------- */
const parts = [];
const META = {
  case:     { name: "表壳", en: "40 mm Case", desc: "直径 40mm，一体式表耳，侧瓣拉丝、倒角镜面抛光，弧线贴合腕围。" },
  crown:    { name: "表冠", en: "Screw-down Crown", desc: "单击表冠可拉出调时：拖动或滚动滚轮校准指针，推回后按新时间继续走时。滚花侧面便于上链，双密封圈防水 50 米。" },
  caseback: { name: "表底盖", en: "Caseback", desc: "六角锁入式底盖，内侧镌刻品牌徽记与独立编号，每枚限量收藏。" },
  plate:    { name: "主夹板", en: "Main Plate", desc: "机芯骨架，孔位公差以微米计，红宝石轴承降低摩擦与磨损。" },
  g1:       { name: "发条盒", en: "Mainspring Barrel", desc: "动能的源头：满链可提供 72 小时动力储存，齿轮比为整枚机芯定调。" },
  g2:       { name: "二轮", en: "Center Wheel", desc: "轮系的第一个传动级，将发条扭矩匀速传递至指针轮系。" },
  g3:       { name: "三轮", en: "Third Wheel", desc: "钢质轴心经镜面抛光，衔接二轮与擒纵机构的中段齿轮。" },
  g4:       { name: "擒纵轮", en: "Escape Wheel", desc: "每秒数次精准释放能量，与摆轮配合完成『锁—放—传』的节奏。" },
  bridges:  { name: "夹板桥", en: "Bridges", desc: "日内瓦波纹（Côtes de Genève）手工打磨，固定轮系的轴向与位置。" },
  balance:  { name: "摆轮", en: "Balance Wheel", desc: "振频 28,800 次/小时（4Hz），游丝带动往复摆动，是机械腕表的心脏。" },
  fork:     { name: "擒纵叉", en: "Pallet Fork", desc: "鸽颈式擒纵叉，两颗合成红宝石叉瓦以微米级精度锁放擒纵轮，把能量按节拍递给摆轮。" },
  mainspring: { name: "发条", en: "Mainspring", desc: "Nivaflex 合金长发条盘绕于发条盒内，上满链可储存 72 小时动力，是整枚机芯的能量之源。" },
  shock:    { name: "避震器", en: "Shock Absorber", desc: "同心避震簧环托住摆轮轴尖，瞬时吸收外力冲击，让心脏在颠簸中安然运转。" },
  indices:  { name: "立体时标", en: "Applied Indices", desc: "十二枚金质时标逐一手镶于盘面，倒角抛光，光影流转间层次分明。" },
  track:    { name: "刻度圈", en: "Minute Track", desc: "六十枚独立刻度块沿分钟轨道环绕，精密排列，读时一目了然。" },
  lume:     { name: "夜光点", en: "Lume Dot", desc: "单点夜明珠嵌于表圈六时位，暗夜之中一抹微光，指引时间的方向。" },
  dial:     { name: "表盘", en: "Sunray Dial", desc: "太阳放射纹盘面，逐格雕刻同心细纹，时标热印上色，层次分明。" },
  hands:    { name: "指针", en: "Blued-steel Hands", desc: "剑形指针经 290°C 热处理淬火，呈现温润钴蓝，覆夜光涂层。" },
  bezel:    { name: "表圈", en: "Polished Bezel", desc: "拉丝与镜面交替完成，44 道工序，光影沿弧面流转。" },
  crystal:  { name: "表镜", en: "Sapphire Crystal", desc: "蓝宝石水晶玻璃，双面防眩镀膜，九道研磨，通透如无物。" },
  strap:    { name: "表带", en: "Strap", desc: "三种风格可选：鳄鱼纹皮带、哑黑牛皮、一体式钢带，快速替换结构。" },
};
function definePart(root, key, offset) {
  const p = { root, key, meta: META[key], offset: offset || v3(0, 0, 0), base: root.position.clone(), meshes: [], out: 0 };
  root.traverse((o) => { if (o.isMesh) { o.userData.part = p; p.meshes.push(o); } });
  parts.push(p);
  watch.add(root);
  return p;
}

/* ---------- 表壳 / 表耳 ---------- */
const caseG = new THREE.Group();
{
  const pts = [[0.62, -0.26], [0.84, -0.25], [0.97, -0.19], [1.0, 0.0], [0.98, 0.14], [0.92, 0.24], [0.88, 0.28]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  caseG.add(M(new THREE.LatheGeometry(pts, 96).rotateX(Math.PI / 2), matCaseB));
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    const lug = M(new THREE.CapsuleGeometry(0.075, 0.24, 4, 12), matCaseB, 0.46 * sx, 0.92 * sy, 0);
    lug.rotation.z = -0.12 * sx;
    caseG.add(lug);
  }
}
definePart(caseG, "case", v3(0, 0, 0));

/* ---------- 表冠 ---------- */
const crownG = new THREE.Group();
{
  const stem = M(new THREE.CylinderGeometry(0.045, 0.045, 0.08, 12).rotateZ(Math.PI / 2), matCaseB, 0.99, 0, 0);
  const body = M(new THREE.CylinderGeometry(0.10, 0.10, 0.09, 24).rotateZ(Math.PI / 2), matCaseP, 1.06, 0, 0);
  const cap = M(new THREE.CylinderGeometry(0.105, 0.105, 0.012, 24).rotateZ(Math.PI / 2), matCaseP, 1.11, 0, 0);
  crownG.add(stem, body, cap);
  for (let i = 0; i < 22; i++) {
    const a = i / 22 * Math.PI * 2;
    const k = M(new THREE.CylinderGeometry(0.011, 0.011, 0.075, 6).rotateZ(Math.PI / 2), matCaseP, 1.06, Math.cos(a) * 0.10, Math.sin(a) * 0.10);
    crownG.add(k);
  }
}
definePart(crownG, "crown", v3(0.6, 0, 0));
const crownPart = parts[parts.length - 1];

/* ---------- 表底盖 ---------- */
const casebackG = new THREE.Group();
{
  const pts = [[0.55, -0.315], [0.75, -0.345], [0.90, -0.315], [0.965, -0.26], [0.90, -0.22]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  casebackG.add(M(new THREE.LatheGeometry(pts, 96).rotateX(Math.PI / 2), matCaseB));
  const ring = M(new THREE.TorusGeometry(0.70, 0.012, 8, 64), matSteelDark, 0, 0, -0.345);
  casebackG.add(ring);
}
definePart(casebackG, "caseback", v3(0, 0, -0.9));

/* ---------- 机芯：主夹板 / 红宝石 / 螺丝 ---------- */
const plateG = new THREE.Group();
{
  plateG.add(M(new THREE.CylinderGeometry(0.80, 0.80, 0.05, 64).rotateX(Math.PI / 2), matPlate, 0, 0, -0.16));
  const jewels = [[0.30, 0.28], [-0.32, 0.16], [-0.16, -0.40], [0.24, -0.42], [0.36, -0.34], [-0.55, -0.1]];
  jewels.forEach(([jx, jy]) => {
    plateG.add(M(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 12).rotateX(Math.PI / 2), matRuby, jx, jy, -0.122));
  });
  for (let i = 0; i < 5; i++) {
    const a = 0.5 + i * (Math.PI * 2 / 5);
    const sx = Math.cos(a) * 0.68, sy = Math.sin(a) * 0.68;
    plateG.add(M(new THREE.CylinderGeometry(0.032, 0.032, 0.018, 12).rotateX(Math.PI / 2), matScrew, sx, sy, -0.125));
    const slot = M(new THREE.BoxGeometry(0.045, 0.007, 0.005), matSteelDark, sx, sy, -0.114);
    slot.rotation.z = a * 2;
    plateG.add(slot);
  }
}
definePart(plateG, "plate", v3(0, 0, -0.5));

/* ---------- 齿轮 ---------- */
function makeGear(r, teeth, th, mat) {
  const g = new THREE.Group();
  g.add(M(new THREE.CylinderGeometry(r, r, th, 40).rotateX(Math.PI / 2), mat));
  g.add(M(new THREE.CylinderGeometry(r * 0.22, r * 0.22, th * 1.15, 20).rotateX(Math.PI / 2), mat));
  for (let i = 0; i < 3; i++) {
    const sp = M(new THREE.BoxGeometry(r * 1.56, r * 0.30, th * 0.55), mat);
    sp.rotation.z = i * Math.PI / 3;
    g.add(sp);
  }
  const tooth = new THREE.BoxGeometry(Math.min(0.055, Math.PI * 2 * r / teeth * 0.45), r * 0.16, th * 0.85);
  const inst = new THREE.InstancedMesh(tooth, mat, teeth);
  inst.castShadow = true;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < teeth; i++) {
    const a = i / teeth * Math.PI * 2;
    dummy.position.set(Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05, 0);
    dummy.rotation.z = a;
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  g.add(inst);
  return g;
}
const g1 = makeGear(0.30, 30, 0.07, matGear); g1.position.set(0.30, 0.28, -0.05);
const g2 = makeGear(0.21, 22, 0.05, matGear); g2.position.set(-0.32, 0.16, 0.02);
const g3 = makeGear(0.155, 16, 0.045, matGear); g3.position.set(-0.16, -0.40, 0.09);
const g4 = makeGear(0.115, 12, 0.04, matGear); g4.position.set(0.24, -0.42, 0.15);
definePart(g1, "g1", v3(0.55, 0.5, 0.12));
definePart(g2, "g2", v3(-0.62, 0.34, 0.24));
definePart(g3, "g3", v3(-0.42, -0.55, 0.34));
definePart(g4, "g4", v3(0.52, -0.52, 0.42));

/* ---------- 发条（发条盒内的螺旋动力带） ---------- */
const mainspringG = new THREE.Group();
{
  const pts = [];
  for (let i = 0; i <= 140; i++) {
    const t = i / 140;
    const a = t * Math.PI * 2 * 4;
    const r = 0.05 + t * 0.185;
    pts.push(v3(Math.cos(a) * r, Math.sin(a) * r, 0));
  }
  const strip = M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 190, 0.008, 5), matGear, 0.30, 0.28, -0.005);
  mainspringG.add(strip);
  mainspringG.add(M(new THREE.CylinderGeometry(0.035, 0.035, 0.05, 12).rotateX(Math.PI / 2), matSteelDark, 0.30, 0.28, -0.005));
}
definePart(mainspringG, "mainspring", v3(0.72, 0.62, -0.18));

/* ---------- 夹板桥 ---------- */
const bridgesG = new THREE.Group();
{
  const b1 = M(new THREE.CapsuleGeometry(0.05, 0.44, 4, 12).rotateZ(Math.PI / 2), matBridge, -0.24, 0.26, 0.16);
  b1.rotation.z = 0.15;
  const b2 = M(new THREE.CapsuleGeometry(0.045, 0.30, 4, 12).rotateZ(Math.PI / 2), matBridge, 0.10, -0.18, 0.16);
  b2.rotation.z = -0.5;
  bridgesG.add(b1, b2);
  [[-0.42, 0.32], [-0.06, 0.20], [0.24, -0.28], [-0.04, -0.10]].forEach(([sx, sy]) => {
    bridgesG.add(M(new THREE.CylinderGeometry(0.03, 0.03, 0.016, 12).rotateX(Math.PI / 2), matScrew, sx, sy, 0.195));
  });
}
definePart(bridgesG, "bridges", v3(0.12, 0.55, 0.6));

/* ---------- 摆轮 + 游丝 ---------- */
const balanceG = new THREE.Group();
balanceG.position.set(0.36, -0.34, 0.10);
const ringGroup = new THREE.Group();
{
  ringGroup.add(M(new THREE.TorusGeometry(0.14, 0.018, 12, 40), matSteelDark));
  ringGroup.add(M(new THREE.BoxGeometry(0.27, 0.03, 0.02), matSteelDark));
  ringGroup.add(M(new THREE.CylinderGeometry(0.028, 0.028, 0.03, 12).rotateX(Math.PI / 2), matSteelDark));
  ringGroup.add(M(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 8).rotateX(Math.PI / 2), matScrew, 0, 0, -0.02));
}
balanceG.add(ringGroup);
{
  const spiralPts = [];
  for (let i = 0; i <= 90; i++) {
    const t = i / 90, a = t * Math.PI * 5, r = 0.045 + t * 0.085;
    spiralPts.push(v3(Math.cos(a) * r, Math.sin(a) * r, 0));
  }
  const spring = M(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(spiralPts), 110, 0.005, 5), matSteelDark, 0, 0, 0.055);
  balanceG.add(spring);
}
definePart(balanceG, "balance", v3(0.6, -0.35, 0.15));

/* ---------- 擒纵叉（鸽颈杠杆 + 红宝石叉瓦） ---------- */
const forkG = new THREE.Group();
{
  const body = M(new THREE.CapsuleGeometry(0.016, 0.20, 4, 10).rotateZ(Math.PI / 2), matBridge, 0.30, -0.39, 0.175);
  body.rotation.z = 0.42;
  forkG.add(body);
  const arm2 = M(new THREE.CapsuleGeometry(0.013, 0.10, 4, 10), matBridge, 0.225, -0.355, 0.175);
  arm2.rotation.z = 1.45;
  forkG.add(arm2);
  /* 两颗叉瓦（红宝石） */
  forkG.add(M(new THREE.BoxGeometry(0.022, 0.05, 0.014), matRuby, 0.205, -0.30, 0.175));
  forkG.add(M(new THREE.BoxGeometry(0.022, 0.05, 0.014), matRuby, 0.245, -0.475, 0.175));
  forkG.add(M(new THREE.CylinderGeometry(0.02, 0.02, 0.04, 12).rotateX(Math.PI / 2), matSteelDark, 0.30, -0.39, 0.175));
}
definePart(forkG, "fork", v3(0.45, -0.42, 0.55));

/* ---------- 避震器（同心簧环托住摆轮轴尖） ---------- */
const shockG = new THREE.Group();
{
  shockG.add(M(new THREE.TorusGeometry(0.055, 0.008, 8, 28), matSteelDark, 0.36, -0.19, 0.13));
  shockG.add(M(new THREE.TorusGeometry(0.028, 0.006, 8, 22), matAcc, 0.36, -0.19, 0.135));
  for (let i = 0; i < 3; i++) {
    const a = i / 3 * Math.PI * 2 + 0.5;
    const spoke = M(new THREE.BoxGeometry(0.024, 0.006, 0.004), matSteelDark, 0.36 + Math.cos(a) * 0.04, -0.19 + Math.sin(a) * 0.04, 0.14);
    spoke.rotation.z = a;
    shockG.add(spoke);
  }
}
definePart(shockG, "shock", v3(0.55, 0.10, 0.38));

/* ---------- 表盘 ---------- */
const dialG = new THREE.Group();
let dateCtx = null, dateTex = null;
function drawDatePlate(d) {
  if (!dateCtx) return;
  dateCtx.fillStyle = "#f7f3e8";
  dateCtx.fillRect(0, 0, 128, 96);
  dateCtx.fillStyle = "#17181c";
  dateCtx.font = "600 60px Georgia, 'Times New Roman', serif";
  dateCtx.textAlign = "center";
  dateCtx.textBaseline = "middle";
  dateCtx.fillText(String(d.getDate()), 64, 52);
  if (dateTex) dateTex.needsUpdate = true;
}
{
  dialG.add(M(new THREE.CylinderGeometry(0.845, 0.845, 0.05, 64).rotateX(Math.PI / 2), matDialBody, 0, 0, 0.24));
  const face = M(new THREE.CircleGeometry(0.842, 96), matDialFace, 0, 0, 0.267);
  dialG.add(face);
  dialG.add(M(new THREE.TorusGeometry(0.845, 0.014, 8, 96), matCaseP, 0, 0, 0.262));
  /* 日历窗（3 点位）：金框 + 白底日数 */
  const dateCanvas = document.createElement("canvas");
  dateCanvas.width = 128; dateCanvas.height = 96;
  dateCtx = dateCanvas.getContext("2d");
  dateTex = new THREE.CanvasTexture(dateCanvas);
  dateTex.colorSpace = THREE.SRGBColorSpace;
  const datePlate = M(new THREE.BoxGeometry(0.15, 0.108, 0.012), new THREE.MeshBasicMaterial({ map: dateTex }), 0.62, 0, 0.279);
  datePlate.castShadow = false;
  dialG.add(M(new THREE.BoxGeometry(0.178, 0.134, 0.008), matCaseP, 0.62, 0, 0.272));
  dialG.add(M(new THREE.BoxGeometry(0.19, 0.146, 0.006), matSteelDark, 0.62, 0, 0.268));
  dialG.add(datePlate);
}
definePart(dialG, "dial", v3(0, 0, 0.42));

/* ---------- 立体时标（八枚金块，避开 12/3/6/9 数字位） ---------- */
const indicesG = new THREE.Group();
{
  for (let i = 0; i < 12; i++) {
    if (i % 3 === 0) continue; /* 数字位不重复镶时标 */
    const a = i / 12 * Math.PI * 2;
    const px = Math.cos(a) * 0.685, py = Math.sin(a) * 0.685;
    const block = M(new THREE.BoxGeometry(0.05, 0.115, 0.012), matAcc, px, py, 0.282);
    block.rotation.z = a + Math.PI / 2;
    indicesG.add(block);
  }
}
definePart(indicesG, "indices", v3(0, 0, 0.62));

/* ---------- 刻度圈（60 枚独立刻度块） ---------- */
const trackG = new THREE.Group();
{
  const toothGeo = new THREE.BoxGeometry(0.011, 0.028, 0.007);
  const inst = new THREE.InstancedMesh(toothGeo, matAcc, 60);
  inst.castShadow = true;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 60; i++) {
    const a = i / 60 * Math.PI * 2;
    dummy.position.set(Math.cos(a) * 0.80, Math.sin(a) * 0.80, 0.298);
    dummy.rotation.z = a + Math.PI / 2;
    dummy.updateMatrix();
    inst.setMatrixAt(i, dummy.matrix);
  }
  trackG.add(inst);
}
definePart(trackG, "track", v3(0, 0, 0.66));

/* ---------- 指针 ---------- */
const handsG = new THREE.Group();
let hourH, minH, secG;
{
  const handGeo = (len, w) => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.06);
    s.lineTo(w / 2, 0);
    s.lineTo(w * 0.32, len * 0.86);
    s.lineTo(0, len);
    s.lineTo(-w * 0.32, len * 0.86);
    s.lineTo(-w / 2, 0);
    s.closePath();
    return new THREE.ExtrudeGeometry(s, { depth: 0.014, bevelEnabled: false });
  };
  hourH = M(handGeo(0.42, 0.07), matHands, 0, 0, 0.295);
  minH = M(handGeo(0.62, 0.05), matHands, 0, 0, 0.322);
  handsG.add(hourH, minH);
  secG = new THREE.Group();
  secG.position.set(0, 0, 0.345);
  const stick = M(new THREE.BoxGeometry(0.012, 0.85, 0.012), matAcc, 0, 0.275, 0);
  const weight = M(new THREE.CylinderGeometry(0.04, 0.04, 0.014, 16).rotateX(Math.PI / 2), matAcc, 0, -0.17, 0);
  secG.add(stick, weight);
  handsG.add(secG);
  handsG.add(M(new THREE.CylinderGeometry(0.035, 0.035, 0.03, 16).rotateX(Math.PI / 2), matAcc, 0, 0, 0.35));
}
definePart(handsG, "hands", v3(0, 0, 0.66));

/* ---------- 表圈 ---------- */
const bezelG = new THREE.Group();
{
  const pts = [[0.86, 0.27], [0.89, 0.28], [1.02, 0.30], [1.05, 0.36], [0.99, 0.415], [0.90, 0.425], [0.87, 0.37]]
    .map(([r, y]) => new THREE.Vector2(r, y));
  bezelG.add(M(new THREE.LatheGeometry(pts, 96).rotateX(Math.PI / 2), matCaseP));
}
definePart(bezelG, "bezel", v3(0, 0, 0.88));

/* ---------- 夜光点（表圈六时位单点夜明珠） ---------- */
const matLume = new THREE.MeshPhysicalMaterial({ color: 0xcfe8c8, metalness: 0, roughness: 0.25, emissive: 0x3fc9a8, emissiveIntensity: 0.55, clearcoat: 1 });
const lumeG = new THREE.Group();
{
  const dot = M(new THREE.SphereGeometry(0.024, 16, 12), matLume, 0, -0.955, 0.36);
  dot.castShadow = false;
  lumeG.add(dot);
}
definePart(lumeG, "lume", v3(0, -0.62, 0.55));

/* ---------- 表镜 ---------- */
const crystalG = new THREE.Group();
{
  const glass = M(new THREE.CylinderGeometry(0.855, 0.90, 0.05, 64).rotateX(Math.PI / 2), matGlass, 0, 0, 0.415);
  glass.castShadow = false;
  glass.receiveShadow = false;
  crystalG.add(glass);
}
definePart(crystalG, "crystal", v3(0, 0, 1.15));

/* ---------- 表带 ---------- */
function makeStrapSide(d) {
  const root = new THREE.Group();
  const hide = new THREE.Group();
  const steel = new THREE.Group();
  root.add(hide, steel);
  const curve = new THREE.CatmullRomCurve3([
    v3(0, 0.95 * d, 0.04),
    v3(0.05, 1.55 * d, -0.10),
    v3(0.15, 2.15 * d, -0.38),
    v3(0.28, 2.75 * d, -0.70),
    v3(0.40, 3.25 * d, -1.06),
  ]);
  const N = 9, segLen = curve.getLength() / N * 1.15, up = v3(0, 0, 1);
  for (let i = 0; i < N; i++) {
    const t = (i + 0.5) / N;
    const pos = curve.getPoint(t);
    const tan = curve.getTangent(t).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(up, tan);
    const w = 0.54 - 0.16 * t;
    const seg = M(new THREE.BoxGeometry(w, 0.07, segLen), matHide);
    seg.position.copy(pos); seg.quaternion.copy(q);
    hide.add(seg);
    const segG = new THREE.Group();
    const cw = w * 0.46, sw = w * 0.26;
    segG.add(M(new THREE.BoxGeometry(cw, 0.075, segLen * 0.96), matBandP));
    const s1 = M(new THREE.BoxGeometry(sw, 0.068, segLen * 0.86), matBandB);
    s1.position.x = cw / 2 + sw / 2 + 0.012;
    const s2 = s1.clone();
    s2.position.x = -(cw / 2 + sw / 2 + 0.012);
    segG.add(s1, s2);
    segG.position.copy(pos); segG.quaternion.copy(q);
    steel.add(segG);
  }
  const end = curve.getPoint(1), endTan = curve.getTangent(1).normalize();
  const bq = new THREE.Quaternion().setFromUnitVectors(up, endTan);
  const buckle = new THREE.Group();
  const ring = M(new THREE.TorusGeometry(0.17, 0.028, 12, 24), matCaseP);
  ring.scale.set(1.05, 0.78, 1);
  const prong = M(new THREE.BoxGeometry(0.03, 0.045, 0.26), matCaseP, 0, 0, 0.02);
  buckle.add(ring, prong);
  buckle.position.copy(end).addScaledVector(endTan, 0.10);
  buckle.quaternion.copy(bq);
  hide.add(buckle);
  const clasp = M(new THREE.BoxGeometry(0.36, 0.085, 0.30), matBandP);
  clasp.position.copy(end).addScaledVector(endTan, 0.14);
  clasp.quaternion.copy(bq);
  steel.add(clasp);
  return { root, hide, steel };
}
const strapTop = makeStrapSide(1);
const strapBottom = makeStrapSide(-1);
definePart(strapTop.root, "strap", v3(0, 0.55, -0.3));
definePart(strapBottom.root, "strap", v3(0, -0.55, -0.3));

/* ---------- 调时模式（单击表冠拉出 / 推回） ---------- */
let timeOffsetMs = 0;
try { timeOffsetMs = parseInt(localStorage.getItem("aurelion.timeOffsetMs"), 10) || 0; } catch {}
function saveOffset() {
  const s = String(timeOffsetMs);
  try { localStorage.setItem("aurelion.timeOffsetMs", s); } catch {}
  mirrorKV("aurelion.timeOffsetMs", s);
}
let setTimeMode = false;
let timeDrag = false;
const WEEKCN = ["日", "一", "二", "三", "四", "五", "六"];
const pad2 = (n) => String(n).padStart(2, "0");
function setCrownPull(pull) {
  killTweensOf(crownPart);
  const to = crownPart.base.clone().add(v3(pull ? 0.16 : 0, 0, 0));
  tween({ p: crownPart, dur: 420, ease: easeInOut, upd: (k) => crownPart.root.position.lerpVectors(crownPart.base, to, k) });
}
function enterTimeMode() {
  if (setTimeMode) return;
  setTimeMode = true;
  closeCard();
  setCrownPull(true);
  $("#timebar").classList.add("show");
}
function exitTimeMode(sync) {
  setTimeMode = false;
  timeDrag = false;
  if (sync) timeOffsetMs = 0;
  setCrownPull(false);
  $("#timebar").classList.remove("show");
  saveOffset();
}
$("#tbDone").addEventListener("click", () => exitTimeMode(false));
$("#tbSync").addEventListener("click", () => exitTimeMode(true));
/* 日期快捷调节：日历随指针日期联动（过午夜自动换日） */
$("#tbDayPrev").addEventListener("click", () => { timeOffsetMs -= 86400000; saveOffset(); });
$("#tbDayNext").addEventListener("click", () => { timeOffsetMs += 86400000; saveOffset(); });

/* ---------- 拾取列表（随表带可见性刷新） ---------- */
const pickMeshes = [];
function refreshPicks() {
  pickMeshes.length = 0;
  parts.forEach((p) => p.meshes.forEach((m) => {
    let o = m, ok = true;
    while (o && o !== scene) { if (!o.visible) { ok = false; break; } o = o.parent; }
    if (ok) pickMeshes.push(m);
  }));
}

/* ---------- 地面阴影 / 尘埃微粒 ---------- */
const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 18), new THREE.ShadowMaterial({ opacity: 0.26 }));
floor.rotation.x = -Math.PI / 2;
floor.position.y = -3.8;
floor.receiveShadow = true;
scene.add(floor);
const dust = (() => {
  const sprite = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const x = c.getContext("2d");
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(c);
  })();
  const geo = new THREE.BufferGeometry();
  const arr = new Float32Array(160 * 3);
  for (let i = 0; i < 160; i++) {
    const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 3.2;
    arr[i * 3] = Math.cos(a) * r;
    arr[i * 3 + 1] = -2.2 + Math.random() * 5;
    arr[i * 3 + 2] = Math.sin(a) * r;
  }
  geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    size: 0.02, map: sprite, transparent: true, opacity: 0.4,
    color: 0xd8c290, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(pts);
  return pts;
})();

/* ---------- 软件渲染自动降载：SwiftShader/llvmpipe 场景下重特效即卡死，检测后主动减负 ---------- */
function detectSoftwareGL() {
  try {
    const gl = renderer.getContext();
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const name = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    return /swiftshader|llvmpipe|softpipe|software rasterizer|basic render/i.test(String(name || ""));
  } catch { return false; }
}
const softwareGLDetected = detectSoftwareGL();
softwareGL = softwareGLDetected;
if (softwareGL) {
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = false;
    key.castShadow = false;
  } catch {}
  dust.visible = false; /* 大面积半透明加法混合在软件渲染下最贵 */
  document.body.classList.add("perf-safe"); /* 毛玻璃换实色，消除合成卡顿 */
}

/* ---------- 配置切换 ---------- */
Object.assign(CASEM.steel, { sw: "linear-gradient(135deg,#f2f5f8,#c3cad2 55%,#8b929c)" });
Object.assign(CASEM.gold,  { sw: "linear-gradient(135deg,#f7dc94,#d9a94f 55%,#a3772c)" });
Object.assign(CASEM.rose,  { sw: "linear-gradient(135deg,#f4c8b0,#d89c7e 55%,#a86a50)" });
Object.assign(CASEM.black, { sw: "linear-gradient(135deg,#585c63,#2a2c30 55%,#101114)" });
Object.assign(DIAL.noir,  { sw: "radial-gradient(circle at 35% 30%,#2b3342,#101218 72%)" });
Object.assign(DIAL.ivory, { sw: "radial-gradient(circle at 35% 30%,#fdf9ec,#d5c9ac 72%)" });
Object.assign(DIAL.green, { sw: "radial-gradient(circle at 35% 30%,#2c5e46,#12271e 72%)" });
Object.assign(DIAL.blue,  { sw: "radial-gradient(circle at 35% 30%,#2b549f,#0d1d3c 72%)" });
Object.assign(STRAP.leather, { sw: "radial-gradient(circle at 35% 30%,#6b4530,#2c1a0e 72%)" });
Object.assign(STRAP.black,   { sw: "radial-gradient(circle at 35% 30%,#3a3a3d,#0e0e10 72%)" });
Object.assign(STRAP.steel,   { sw: "radial-gradient(circle at 35% 30%,#f0f3f7,#9aa1ab 72%)" });

function applyCase(key) {
  const c = CASEM[key];
  matCaseP.color.set(c.c); matCaseB.color.set(c.c);
  matCaseP.roughness = c.rough;
  matCaseB.roughness = Math.min(0.6, c.rough + 0.22);
}
const dialCache = {};
function applyDial(key) {
  const d = DIAL[key];
  if (!dialCache[key]) dialCache[key] = dialTexture(d.bg, d.fg, d.num);
  matDialFace.map = dialCache[key];
  matDialFace.needsUpdate = true;
  matDialBody.color.set(d.bg).multiplyScalar(0.55);
}
function applyStrap(key) {
  const useSteel = key === "steel";
  [strapTop, strapBottom].forEach((s) => {
    s.hide.visible = !useSteel;
    s.steel.visible = useSteel;
  });
  if (!useSteel) {
    matHide.color.set(STRAP[key].c);
    matHide.roughness = STRAP[key].rough;
  }
  refreshPicks();
}

const mkSw = (sel, dict, defKey, apply, onPick) => {
  const host = $(sel);
  Object.entries(dict).forEach(([k, it]) => {
    const d = document.createElement("div");
    d.className = "sw round" + (k === defKey ? " on" : "");
    d.style.background = it.sw;
    d.title = it.name;
    d.dataset.k = k;
    d.tabIndex = 0;
    d.setAttribute("role", "button");
    d.setAttribute("aria-label", it.name);
    const pick = () => {
      host.querySelectorAll(".sw").forEach((x) => x.classList.toggle("on", x === d));
      apply(k);
      if (onPick) onPick(k);
    };
    d.addEventListener("click", pick);
    d.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(); } });
    host.appendChild(d);
  });
};
mkSw("#caseSw", CASEM, appear.case, applyCase, (k) => { appear.case = k; saveAppear(); });
mkSw("#dialSw", DIAL, appear.dial, applyDial, (k) => { appear.dial = k; saveAppear(); });
mkSw("#strapSw", STRAP, appear.strap, applyStrap, (k) => { appear.strap = k; saveAppear(); });
applyCase(appear.case in CASEM ? appear.case : "steel");
applyDial(appear.dial in DIAL ? appear.dial : "blue");
applyStrap(appear.strap in STRAP ? appear.strap : "leather");

/* ---------- 爆炸 / 重组 ---------- */
let explodedAll = false;
function movePart(p, out, opt = {}) {
  p.out = out;
  killTweensOf(p);
  const to = p.base.clone().addScaledVector(p.offset, out);
  tween({
    p, dur: opt.dur || 950, delay: opt.delay || 0, ease: opt.ease || easeOut,
    upd: (k) => p.root.position.lerpVectors(p.base, to, k),
  });
}
function setExplode(on) {
  if (on && setTimeMode) exitTimeMode();
  explodedAll = on;
  $("#explodeBtn").classList.toggle("on", on);
  if (on && tgt.r < 4.4) tgt.r = 5.2;
  if (!on && tgt.r > 4.6) tgt.r = 3.45;
  parts.forEach((p, i) => movePart(p, on ? 1 : 0, { delay: i * (on ? 48 : 36), ease: on ? easeOut : easeInOut }));
}
function assemblePart(p) {
  movePart(p, 0, { dur: 850, ease: easeInOut });
  if (parts.every((q) => !q.out)) {
    explodedAll = false;
    $("#explodeBtn").classList.remove("on");
  }
}

/* ---------- 相机（自定义轨道 + 阻尼） ---------- */
const cur = { theta: 0.12, phi: 1.42, r: 6.8, look: v3(0, 0, 0) };
const tgt = { theta: 0.12, phi: 1.33, r: 3.45, look: v3(0, 0.02, 0) };
function flyTo(p) {
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(p.root);
  tgt.look.copy(box.getCenter(new THREE.Vector3()));
  tgt.r = clamp(box.getSize(new THREE.Vector3()).length() * 2.6, 1.1, 2.6);
}

/* ---------- 交互：拖拽 / 缩放 / 悬停 / 点击 ---------- */
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pickAt(cx, cy) {
  ndc.set(cx / innerWidth * 2 - 1, -(cy / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObjects(pickMeshes, false);
  return hits.length ? hits[0].object.userData.part : null;
}
let selected = null, cardOpen = false;
function openCard(p) {
  selected = p;
  $("#dNo").textContent = "PART · " + String(parts.indexOf(p) + 1).padStart(2, "0");
  $("#dTtl").textContent = p.meta.name;
  $("#dSub").textContent = p.meta.en;
  $("#dDesc").textContent = p.meta.desc;
  $("#detail").classList.add("show");
  cardOpen = true;
}
function closeCard() {
  $("#detail").classList.remove("show");
  cardOpen = false; selected = null;
}

const el = renderer.domElement;
el.style.touchAction = "none";
el.style.cursor = "grab";
const pointers = new Map();
let dragging = false, lastInteract = -1e4, downX = 0, downY = 0, downT = 0, pinchD = 0;
el.addEventListener("pointerdown", (e) => {
  el.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 1) {
    dragging = true;
    timeDrag = false;
    downX = e.clientX; downY = e.clientY; downT = performance.now();
    if (setTimeMode && pickAt(e.clientX, e.clientY) === crownPart) timeDrag = true;
  } else if (pointers.size === 2) {
    const a = [...pointers.values()];
    pinchD = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]);
  }
  lastInteract = performance.now();
  el.style.cursor = "grabbing";
  hot.classList.remove("on");
});
el.addEventListener("pointermove", (e) => {
  const pt = pointers.get(e.pointerId);
  if (pt) {
    const dx = e.clientX - pt[0], dy = e.clientY - pt[1];
    pt[0] = e.clientX; pt[1] = e.clientY;
    if (pointers.size === 1 && timeDrag) {
      timeOffsetMs -= dy * 60000; /* 1 像素 ≈ 1 分钟 */
      saveOffset();
    } else if (pointers.size === 1) {
      tgt.theta -= dx * 0.0056;
      tgt.phi = clamp(tgt.phi - dy * 0.0056, 0.35, 2.75);
    } else if (pointers.size === 2) {
      const a = [...pointers.values()];
      const d = Math.hypot(a[0][0] - a[1][0], a[0][1] - a[1][1]);
      if (pinchD > 0 && d > 0) tgt.r = clamp(tgt.r * pinchD / d, 1.5, 7);
      pinchD = d;
    }
    lastInteract = performance.now();
  } else if (!dragging) {
    const p = pickAt(e.clientX, e.clientY);
    hot.style.left = e.clientX + "px";
    hot.style.top = e.clientY + "px";
    hot.classList.toggle("on", !!p);
    el.style.cursor = p ? "pointer" : "grab";
  }
});
const endPointer = (e) => {
  pointers.delete(e.pointerId);
  pinchD = 0;
  if (pointers.size === 0) {
    el.style.cursor = "grab";
    if (dragging) {
      dragging = false;
      const moved = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (moved < 7 && performance.now() - downT < 600) {
        const p = pickAt(e.clientX, e.clientY);
        if (p) {
          if (p === crownPart && !p.out) {
            setTimeMode ? exitTimeMode() : enterTimeMode();
          } else {
            openCard(p);
            if (p.out) assemblePart(p);
          }
        }
        else closeCard();
      }
    }
  }
};
el.addEventListener("pointerup", endPointer);
el.addEventListener("pointercancel", endPointer);
el.addEventListener("pointerleave", () => hot.classList.remove("on"));
el.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (setTimeMode) {
    timeOffsetMs -= e.deltaY * 12000; /* 每格 ≈ 20 分钟 */
    saveOffset();
    return;
  }
  tgt.r = clamp(tgt.r * Math.exp(e.deltaY * 0.0011), 1.5, 7);
  lastInteract = performance.now();
}, { passive: false });
el.addEventListener("contextmenu", (e) => e.preventDefault());
el.addEventListener("dblclick", (e) => {
  if (pickAt(e.clientX, e.clientY)) { closeCard(); setExplode(!explodedAll); }
});

/* ---------- 按钮 ---------- */
$("#explodeBtn").addEventListener("click", () => setExplode(!explodedAll));
$("#resetBtn").addEventListener("click", () => {
  closeCard();
  tgt.look.set(0, 0.02, 0);
  tgt.r = 3.45; tgt.phi = 1.33;
});
$("#dClose").addEventListener("click", closeCard);
$("#dReassemble").addEventListener("click", () => { if (selected) assemblePart(selected); });
$("#dFocus").addEventListener("click", () => { if (selected) flyTo(selected); });

/* ---------- 视角截图（保存当前渲染帧为 PNG） ---------- */
$("#shotBtn").addEventListener("click", () => {
  try {
    renderer.render(scene, camera); /* 同步重绘一帧，保证缓冲有效 */
    const a = document.createElement("a");
    const d = new Date();
    a.download = "AURELION时光-" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") +
      "-" + String(d.getHours()).padStart(2, "0") + String(d.getMinutes()).padStart(2, "0") + ".png";
    a.href = renderer.domElement.toDataURL("image/png");
    document.body.appendChild(a); a.click(); a.remove();
  } catch (err) { /* 截图失败静默（极少见的受限环境） */ }
});

/* ---------- 全屏切换 ----------
   桌面端走原生窗口全屏（IPC，更稳定，退出自动恢复最大化）；浏览器模式回退 DOM fullscreen。
   进入/退出均同步 fsBtn 高亮状态。 */
function toggleFullscreen() {
  const D = window.AURELION_DESKTOP;
  if (D && D.toggleFullscreen) {
    const on = !!D.toggleFullscreen();
    const fb = $("#fsBtn"); if (fb) fb.classList.toggle("on", on);
    return;
  }
  try {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  } catch {}
}
$("#fsBtn").addEventListener("click", toggleFullscreen);
/* 全屏状态变化同步（Esc 退出 / IPC 推送均触发） */
if (window.AURELION_DESKTOP && window.AURELION_DESKTOP.onFullscreen) {
  window.AURELION_DESKTOP.onFullscreen((on) => {
    const fb = $("#fsBtn"); if (fb) fb.classList.toggle("on", !!on);
  });
  try {
    const on = window.AURELION_DESKTOP.isFullscreen();
    const fb = $("#fsBtn"); if (fb) fb.classList.toggle("on", !!on);
  } catch {}
}
document.addEventListener("fullscreenchange", () => {
  if (window.AURELION_DESKTOP && window.AURELION_DESKTOP.isDesktop) return; /* 桌面端由 IPC 事件同步 */
  const fb = $("#fsBtn"); if (fb) fb.classList.toggle("on", !!document.fullscreenElement);
});

/* ---------- 软件更新弹窗（自定义 UI，替代系统对话框） ---------- */
(function () {
  const ov = $("#updateOverlay");
  if (!ov) return;
  const show = () => { ov.classList.remove("hidden"); requestAnimationFrame(() => ov.classList.add("visible")); };
  const hide = () => { ov.classList.remove("visible"); ov.classList.add("hidden"); };
  const setTxt = (id, txt) => { const el = $(id); if (el) el.textContent = txt; };
  let autoClose = null;
  const bind = (id, fn) => { const el = $(id); if (el) el.addEventListener("click", fn); };
  bind("updateClose", hide);
  bind("updateLater", hide);
  bind("updateSkip", () => {
    const latest = window.__curUpdateLatest || "";
    if (latest) { try { localStorage.setItem("aurelion.skipVersion", latest); } catch {} }
    hide();
  });
  bind("updateGo", () => {
    const go = $("#updateGo");
    const url = go ? go.getAttribute("data-url") : "";
    if (url && window.AURELION_DESKTOP && window.AURELION_DESKTOP.openExternal) {
      window.AURELION_DESKTOP.openExternal(url);
    }
    hide();
  });
  ov.addEventListener("click", (e) => { if (e.target === ov) hide(); });
  addEventListener("keydown", (e) => {
    if (e.key === "Escape" && ov.classList.contains("visible")) hide();
  });
  window.__showUpdate = (p) => {
    if (!p) return;
    if (autoClose) { clearTimeout(autoClose); autoClose = null; }
    const cur = p.current || "";
    const latest = p.latest || "";
    const ic = $("#updateIcon"), go = $("#updateGo"), lat = $("#updateLater"), sk = $("#updateSkip");
    /* 自动检查命中「跳过此版本」→ 不打扰；手动检查始终弹窗 */
    if (p.kind === "update" && !p.manual) {
      let skipV = "";
      try { skipV = localStorage.getItem("aurelion.skipVersion") || ""; } catch {}
      if (skipV === latest) return;
    }
    setTxt("updateCur", "当前版本 v" + cur);
    if (p.kind === "update") {
      window.__curUpdateLatest = latest;
      setTxt("updateStatus", "发现新版本 v" + latest);
      setTxt("updateDetail", "可前往发布页下载便携版 / 安装版 / 绿色版，覆盖安装即可升级，配置数据自动保留。");
      if (ic) { ic.textContent = "⬆"; ic.className = "ic up"; }
      if (go) { go.style.display = ""; go.setAttribute("data-url", p.html_url || ""); }
      if (sk) sk.style.display = "";
      if (lat) lat.style.display = "";
      lat.textContent = "以后再说";
    } else if (p.kind === "latest") {
      setTxt("updateStatus", "已是最新版本 v" + cur);
      setTxt("updateDetail", "您的 AURELION 时光已保持最新。");
      if (ic) { ic.textContent = "✓"; ic.className = "ic ok"; }
      if (go) go.style.display = "none";
      if (sk) sk.style.display = "none";
      if (lat) { lat.style.display = ""; lat.textContent = "好的"; }
      autoClose = setTimeout(hide, 2200);
    } else {
      setTxt("updateStatus", "检查更新失败");
      setTxt("updateDetail",
        p.kind === "http" ? "网络请求异常（HTTP " + (p.status || "?") + "），请稍后再试，或前往 GitHub Releases 手动查看。"
        : p.kind === "unconfigured" ? "尚未配置升级源，请在 package.json 的 repository 字段填入 GitHub 仓库地址。"
        : "网络不可达或仓库不存在，可前往 GitHub Releases 页面手动查看。");
      if (ic) { ic.textContent = "!"; ic.className = "ic err"; }
      if (go) go.style.display = "none";
      if (sk) sk.style.display = "none";
      if (lat) { lat.style.display = ""; lat.textContent = "关闭"; }
    }
    show();
  };
  if (window.AURELION_DESKTOP && window.AURELION_DESKTOP.onUpdateStatus) {
    window.AURELION_DESKTOP.onUpdateStatus(window.__showUpdate);
  }
})();

/* ---------- 建议 / BUG 反馈（GitHub Issues，桌面端走系统浏览器，浏览器直开回退新标签） ---------- */
$("#feedbackBtn").addEventListener("click", () => {
  try {
    const D = window.AURELION_DESKTOP;
    if (D && D.openExternal) { D.openExternal("https://github.com/dzhgzs/aurelion-time/issues"); return; }
    window.open("https://github.com/dzhgzs/aurelion-time/issues", "_blank");
  } catch {}
});

/* ---------- 窄屏浮动面板（定制 / 灯光） ---------- */
function bindMobileToggle(btnId, panelSel) {
  const btn = $(btnId); if (!btn) return;
  btn.addEventListener("click", () => {
    const p = $(panelSel); if (!p) return;
    const on = p.classList.toggle("mob");
    btn.classList.toggle("on", on);
    document.querySelectorAll(".panel.mob").forEach((x) => { if (x !== p) x.classList.remove("mob"); });
    document.querySelectorAll(".dock.m-only").forEach((x) => { if (x !== btn) x.classList.remove("on"); });
  });
}
bindMobileToggle("#cfgBtn", ".panel.left");
bindMobileToggle("#lightBtn", ".panel.right");

/* ---------- 快捷键帮助浮层 ---------- */
function toggleHelp() {
  const h = $("#helpOverlay");
  if (h) h.classList.toggle("show");
}
const helpCloseBtn = $("#helpClose");
if (helpCloseBtn) helpCloseBtn.addEventListener("click", toggleHelp);
const helpOverlayEl = $("#helpOverlay");
if (helpOverlayEl) helpOverlayEl.addEventListener("click", (e) => { if (e.target === helpOverlayEl) toggleHelp(); });
/* 帮助浮层展示当前版本号（浏览器版静默跳过） */
try {
  if (window.AURELION_DESKTOP && window.AURELION_DESKTOP.getVersion) {
    window.AURELION_DESKTOP.getVersion().then((v) => {
      const el = $("#appVer");
      if (el && v) el.textContent = "AURELION 时光 v" + v;
    }).catch(() => {});
  }
} catch {}

/* ---------- 键盘快捷键（输入框/按钮聚焦时忽略） ---------- */
function isTypingTarget(t) {
  return t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "BUTTON" || t.isContentEditable);
}
addEventListener("keydown", (e) => {
  if (isTypingTarget(e.target)) return;
  /* 响铃遮罩显示时：快捷键整体让位给响铃键盘操作（clock.js 接管 Esc/空格） */
  try {
    const ro = document.getElementById("ringOverlay");
    if (ro && ro.classList.contains("show")) return;
  } catch {}
  const k = e.key.toLowerCase();
  if (k === "escape") { closeCard(); if (helpOverlayEl && helpOverlayEl.classList.contains("show")) toggleHelp(); return; }
  if (e.key === "?") { toggleHelp(); return; }
  if (k === " " || k === "e") {
    e.preventDefault();
    /* 上下文消费：抽屉打开且停在秒表/倒计时页签时，空格由当前工具接管 */
    let consumed = false;
    try {
      const panelEl = document.querySelector("#clockPanel");
      const A = window.AURELION_ACTIONS;
      if (panelEl && panelEl.classList.contains("show") && A) {
        const tab = document.querySelector(".cp-tab.on");
        if (tab && tab.dataset.t === "stopwatch" && A.stopwatchToggle) { A.stopwatchToggle(); consumed = true; }
        else if (tab && tab.dataset.t === "timer" && A.timerToggle) { A.timerToggle(); consumed = true; }
      }
    } catch {}
    if (!consumed) setExplode(!explodedAll);
  }
  else if (k === "r") { closeCard(); tgt.look.set(0, 0.02, 0); tgt.r = 3.45; tgt.phi = 1.33; }
  else if (k === "c") { const b = $("#clockBtn"); if (b) b.click(); }
  else if (k === "f") { toggleFullscreen(); }
  else if (k === "t") {
    try {
      if (window.AURELION_DESKTOP && window.AURELION_DESKTOP.toggleTop) {
        const on = window.AURELION_DESKTOP.toggleTop();
        toast(on ? "窗口已置顶（按 T 可取消）" : "窗口已取消置顶");
      } else toast("窗口置顶仅桌面版支持");
    } catch {}
  }
  else if (["1", "2", "3", "4", "5"].includes(k)) {
    const lights = document.querySelectorAll(".light");
    const t = lights[Number(k) - 1];
    if (t) t.click();
  }
});
/* 工具快捷动作注册表（clock.js 注册，供上下文快捷键调用） */
window.AURELION_ACTIONS = {
  stopwatchToggle: () => { const b = document.querySelector("#swToggle"); if (b) b.click(); },
  timerToggle: () => { const b = document.querySelector("#tmStart"); if (b) b.click(); },
};

/* ---------- 开场：零件悬浮 → 逐一组装 ---------- */
parts.forEach((p) => { p.out = 1; p.root.position.copy(p.base).addScaledVector(p.offset, 1); });
refreshPicks();
setTimeout(() => $("#loader").classList.add("hide"), 700);
setTimeout(() => setExplode(false), 1150);
/* 首次启动轻引导 */
try {
  if (!localStorage.getItem("aurelion.seen.v1")) {
    localStorage.setItem("aurelion.seen.v1", "1");
    setTimeout(() => toast("欢迎体验 AURELION 时光 · 拖拽旋转 · 单击表冠调时 · 空格键爆炸展开"), 2800);
    setTimeout(() => toast("快捷键：E 爆炸 · R 复位 · C 时间助手 · F 全屏 · 1-5 灯光"), 6800);
  }
} catch {}

/* ---------- 主循环（页面隐藏时暂停渲染，省电且不影响闹钟心跳） ---------- */
const gears = [g1, g2, g3, g4];
const gearSpeed = [0.22, -0.38, 0.62, -1.15];
/* 12/24 小时制：跟随时间助手设置（aurelion.clockcfg.v1.hour12），配置变化即时同步 */
let uiHour12 = false;
function syncUiHour12() {
  let h12 = false;
  try { h12 = !!JSON.parse(localStorage.getItem("aurelion.clockcfg.v1") || "{}").hour12; } catch {}
  uiHour12 = h12;
}
syncUiHour12();
try { window.addEventListener("aurelion:cfg", syncUiHour12); } catch {}
let lastUiHm = "", lastUiSc = "", lastUiDate = "", lastUiLunar = "", lastTb = "", lastPlateDay = "", lastDayKey = "", dayInfo = null, lastTbDate = "";
let rafActive = true;
let last = performance.now();
function frame(now) {
  if (!rafActive) return; /* 隐藏时停止排队，恢复时重新 rAF */
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  /* FPS 采样与自适应降档 */
  fpsFrames++;
  if (now - fpsMark >= 1000) {
    const fps = fpsFrames * 1000 / (now - fpsMark);
    fpsSmooth = fpsSmooth * 0.5 + fps * 0.5;
    fpsFrames = 0; fpsMark = now;
    if (perfOn() && !softwareGL) {
      /* 只降不升：低于阈值降一档并长冷却，避免档位抖动反复重建缓冲 */
      if (fpsSmooth < 32 && adaptLevel < 3 && now > adaptCool) { adaptLevel++; applyAdapt(); adaptCool = now + 15000; }
    }
  }
  const t = now / 1000;
  updateTweens(now);
  const k = 1 - Math.exp(-dt * 6.5);
  cur.theta += (tgt.theta - cur.theta) * k;
  cur.phi += (tgt.phi - cur.phi) * k;
  cur.r += (tgt.r - cur.r) * k;
  cur.look.lerp(tgt.look, k);
  const sp = Math.sin(cur.phi);
  camera.position.set(
    cur.look.x + cur.r * sp * Math.sin(cur.theta),
    cur.look.y + cur.r * Math.cos(cur.phi),
    cur.look.z + cur.r * sp * Math.cos(cur.theta)
  );
  camera.lookAt(cur.look);
  if (autoSpin && !dragging && !cardOpen && !setTimeMode && now - lastInteract > 2400) spin.rotation.y += dt * 0.16;
  watch.position.y = Math.sin(t * 0.6) * 0.02;
  const d = new Date(Date.now() + timeOffsetMs);
  const s = d.getSeconds() + d.getMilliseconds() / 1000;
  const m = d.getMinutes() + s / 60;
  const h = (d.getHours() % 12) + m / 60;
  secG.rotation.z = -s / 60 * Math.PI * 2;
  minH.rotation.z = -m / 60 * Math.PI * 2;
  hourH.rotation.z = -h / 12 * Math.PI * 2;
  /* 日历窗与数字日期（农历/节日按天缓存，避免每秒重算） */
  const dkey = d.getFullYear() + "/" + d.getMonth() + "/" + d.getDate();
  if (dkey !== lastPlateDay) { lastPlateDay = dkey; drawDatePlate(d); }
  if (dkey !== lastDayKey) {
    lastDayKey = dkey;
    dayInfo = null;
    try {
      const LZ = window.LUNAR;
      if (LZ) {
        const de = LZ.describe(d);
        dayInfo = { lunar: de.lunar.mCn + de.lunar.dCn, gz: de.lunar.gzYear, zodiac: de.lunar.zodiac, fest: de.fest };
      }
    } catch {}
  }
  /* 顶部日期/时间三行：时分 · 秒 · 年月日+星期 · 农历，独立去重避免无谓写 DOM（支持 12/24 小时制） */
  const _h24 = d.getHours();
  let hm, sc;
  if (uiHour12) {
    const hh = _h24 % 12 || 12;
    hm = hh + ":" + pad2(d.getMinutes());
    sc = ":" + pad2(d.getSeconds()) + (_h24 < 12 ? " AM" : " PM");
  } else {
    hm = pad2(_h24) + ":" + pad2(d.getMinutes());
    sc = ":" + pad2(d.getSeconds());
  }
  if (hm !== lastUiHm) { lastUiHm = hm; const el = $("#nowTime"); if (el) el.textContent = hm; }
  if (sc !== lastUiSc) { lastUiSc = sc; const el = $("#nowSec"); if (el) el.textContent = sc; }
  const dd = d.getFullYear() + " 年 " + (d.getMonth() + 1) + " 月 " + d.getDate() + " 日 · 星期" + WEEKCN[d.getDay()];
  if (dd !== lastUiDate) { lastUiDate = dd; const el = $("#nowDate"); if (el) el.textContent = dd; }
  const ll = "农历" + (dayInfo ? (dayInfo.gz ? dayInfo.gz + "年 " : "") + dayInfo.lunar : "—") + (dayInfo && dayInfo.fest ? " · " + dayInfo.fest : "");
  if (ll !== lastUiLunar) { lastUiLunar = ll; const el = $("#nowLunar"); if (el) el.textContent = ll; }
  if (setTimeMode) {
    const tstr = uiHour12
      ? ((_h24 % 12) || 12) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds()) + (_h24 < 12 ? " AM" : " PM")
      : pad2(_h24) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
    if (tstr !== lastTb) { lastTb = tstr; $("#tbClock").textContent = tstr; }
    const tbStr = (d.getMonth() + 1) + " 月 " + d.getDate() + " 日 · 星期" + WEEKCN[d.getDay()] + (dayInfo ? " · 农历" + (dayInfo.gz ? dayInfo.gz + "年 " : "") + dayInfo.lunar : "") + (dayInfo && dayInfo.fest ? " · " + dayInfo.fest : "");
    if (tbStr !== lastTbDate) { lastTbDate = tbStr; const td = $("#tbDate"); if (td) td.textContent = tbStr; }
  }
  gears.forEach((g, i) => { g.rotation.z += dt * gearSpeed[i]; });
  ringGroup.rotation.z = Math.sin(t * 9) * 1.7;
  dust.rotation.y += dt * 0.02;
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

/* 顶部农历行：点击打开时间助手日历页签 */
(function initLunarClick() {
  const el = $("#nowLunar");
  if (!el) return;
  el.classList.add("clickable");
  el.title = "打开日历";
  el.addEventListener("click", () => {
    try { if (window.AURELION_OPEN_TAB) window.AURELION_OPEN_TAB("calendar"); } catch {}
  });
})();

/* 调试探针（勿依赖）：暴露零件清单与渲染环境，供自动化验证 */
window.AURELION_DEBUG = {
  softwareGL,
  parts: () => parts.map((p) => ({ key: p.key, visible: p.root.visible, meshes: p.meshes.length })),
};

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    rafActive = false;
  } else if (!rafActive) {
    rafActive = true;
    last = performance.now();
    requestAnimationFrame(frame);
  }
});

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  applyAdapt(); /* 保留自适应档位与软件渲染锁定，而不是盲置 dpr 丢档 */
  if (innerWidth > 860) document.querySelectorAll(".panel").forEach((p) => p.classList.remove("mob"));
});
})();
