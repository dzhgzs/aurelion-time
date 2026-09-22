/* AURELION 时光 · 时间助手（闹钟 / 倒计时 / 定时任务 / 整点报时）
   持久化于 localStorage；桌面版由 Electron 托管（托盘常驻 + 系统通知） */
(() => {
"use strict";
const $ = (s) => document.querySelector(s.startsWith("#") || s.startsWith(".") ? s : "#" + s);

/* ---------- 持久化（localStorage + 桌面版文件镜像双保险） ---------- */
const K = { alarm: "aurelion.alarms.v1", task: "aurelion.tasks.v1", timer: "aurelion.timer.v1", cfg: "aurelion.clockcfg.v1", sw: "aurelion.stopwatch.v1" };
const load = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch { return d; } };
const save = (k, v) => {
  const s = JSON.stringify(v);
  try { localStorage.setItem(k, s); } catch {}
  try { if (window.AURELION_DESKTOP && window.AURELION_DESKTOP.saveKV) window.AURELION_DESKTOP.saveKV({ [k]: s }); } catch {}
  /* 通知主界面（顶部时间/外观等跨模块配置联动） */
  try { if (k === K.cfg) window.dispatchEvent(new CustomEvent("aurelion:cfg", { detail: v })); } catch {}
};
/* 双保险兜底：若本地被清而镜像文件存在，先回填再读 */
try {
  if (window.AURELION_DESKTOP && window.AURELION_DESKTOP.restoreKV) {
    let hasAny = false;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf("aurelion.") === 0) { hasAny = true; break; }
    }
    if (!hasAny) {
      const kv = window.AURELION_DESKTOP.restoreKV();
      if (kv && typeof kv === "object") Object.entries(kv).forEach(([k, v]) => { try { localStorage.setItem(k, v); } catch {} });
    }
  }
} catch {}

let alarms = load(K.alarm, []);
let tasks = load(K.task, []).filter((t) => !t.done); /* 已完成任务不再滞留存储 */
let cfg = Object.assign({ chime: false, vol: 0.6, keepAwake: false, snoozeMin: 5, bellType: "chime", dnd: false, festAlarm: true, focusWork: 25, focusBreak: 5, timerLoop: false, hour12: false, suspendAll: false, worldCities: [] }, load(K.cfg, {}));
/* 数据健全清洗：布尔项规整、自定义城市列表必须为二维数组 */
cfg.hour12 = !!cfg.hour12;
cfg.suspendAll = !!cfg.suspendAll;
if (!Array.isArray(cfg.worldCities)) cfg.worldCities = [];
cfg.worldCities = cfg.worldCities.filter((c) => Array.isArray(c) && typeof c[0] === "string" && typeof c[1] === "string").slice(0, 20);
let timerSt = Object.assign({ end: null, running: false, total: 5 * 60000, remain: 5 * 60000 }, load(K.timer, {}));

const WEEK = ["日", "一", "二", "三", "四", "五", "六"];
const pad = (n) => String(n).padStart(2, "0");
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const toast = window.AURELION_TOAST || ((m) => { try { alert(m); } catch {} });
/* 开关控件统一同步：class + aria-checked（保证读屏与键盘状态一致） */
function setSwitch(el, on) {
  if (!el) return;
  el.classList.toggle("on", !!on);
  el.setAttribute("aria-checked", String(!!on));
}

/* ---------- 智能时间解析：把中文时间表达解析为 { at: Date, label: string } ----------
   支持：30分钟后 / 半小时后 / 1小时后 / 1小时20分后 / 1.5小时后 / 明天下午3点 / 后天大扫除 /
        下周三晚上8点 / 周三 8 点半 / 3月8日 14:00 / 18号 / 今晚12点 / 中午12点半 / 明早6点20分 …
   过去时间自动顺延：周X→下周、X号→下月、X月X日→明年、无日期→明天 */
const WEEKMAP = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "日": 0, "天": 0 };
function cleanLabel(s) {
  return String(s || "")
    .replace(/^\s*(记得提醒|提醒|记得|叫|通知)\s*(我)?\s*/, "")
    .replace(/(提醒我|提醒|一下|的事)/, "")
    .replace(/[，,。.！!？?\s]+/g, " ")
    .trim();
}
function parseZhTime(raw) {
  let s = String(raw || "").trim();
  if (!s) return null;
  const now = new Date();
  const y = now.getFullYear(), mo = now.getMonth(), d0 = now.getDate();

  /* 1) 相对时长（分钟段可选：兼容「1小时后」「1小时半后」「1小时20分后」「1.5小时后」） */
  const mHalf = s.match(/半\s*小时(之)?后/);
  const mHour = s.match(/(\d+(?:\.\d+)?)\s*小时(?:\s*(半|\d+(?:\.\d+)?)\s*分?|半)?(?:钟)?\s*(之)?后/);
  const mMin = s.match(/(\d+(?:\.\d+)?)\s*分(?:钟)?(之)?后/);
  let rel = null, relHit = null;
  if (mHalf) { rel = 30 * 60000; relHit = mHalf[0]; }
  else if (mHour) { rel = parseFloat(mHour[1]) * 3600000 + (mHour[2] ? (mHour[2] === "半" ? 30 : parseFloat(mHour[2])) * 60000 : 0); relHit = mHour[0]; }
  else if (mMin) { rel = parseFloat(mMin[1]) * 60000; relHit = mMin[0]; }
  if (rel != null && rel > 0) {
    return { at: new Date(Date.now() + rel), label: cleanLabel(s.replace(relHit, "")) };
  }

  /* 2) 日期偏移词 */
  let rest = s, shift = 0, explicitDate = false;
  let amWord = false, pmWord = false, noonWord = false;
  let wdHit = false, mdHit = false, ddHit = false, mdMo = 0, mdDd = 0, ddNum = 0;
  let festHit = false, festWant = "";
  const off = rest.match(/大后天|后天|明天|明日|明早|明晚|今晚|今早|今天|今日/);
  if (off) {
    const w = off[0];
    if (w === "大后天") shift = 3;
    else if (w === "后天") shift = 2;
    else if (w === "明天" || w === "明日" || w === "明早" || w === "明晚") shift = 1;
    if (w === "明早" || w === "今早") amWord = true;
    if (w === "明晚" || w === "今晚") pmWord = true;
    rest = rest.replace(w, "");
  }

  /* 3) 星期：下周三 / 周三 / 星期天 / 礼拜六 */
  const wd = rest.match(/(下下|下)?\s*(?:周|星期|礼拜)\s*([一二三四五六日天])/);
  if (wd) {
    const w = WEEKMAP[wd[2]];
    let shiftW = (w - now.getDay() + 7) % 7;
    if (wd[1]) { const remain = 7 - now.getDay(); if (shiftW < remain) shiftW += 7; if (wd[1] === "下下") shiftW += 7; }
    shift += shiftW;
    explicitDate = true;
    wdHit = true;
    rest = rest.replace(wd[0], "");
  }

  /* 4) 日期：3月8日 / 18号 */
  const md = rest.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/);
  if (md) {
    const moN = +md[1], ddN = +md[2];
    if (moN < 1 || moN > 12 || ddN < 1 || ddN > 31) return null;
    shift = Math.round((new Date(y, moN - 1, ddN) - new Date(y, mo, d0)) / 86400000);
    explicitDate = true;
    mdHit = true; mdMo = moN; mdDd = ddN;
    rest = rest.replace(md[0], "");
  } else {
    const dd = rest.match(/(\d{1,2})\s*[日号](?!\d)/);
    if (dd) {
      const dNum = +dd[1];
      if (dNum < 1 || dNum > 31) return null;
      let moN = now.getMonth();
      let target = new Date(y, moN, dNum);
      if (target.getTime() < new Date(y, mo, d0).getTime()) { moN++; target = new Date(y, moN, dNum); }
      shift = Math.round((target - new Date(y, mo, d0)) / 86400000);
      explicitDate = true;
      ddHit = true; ddNum = dNum;
      rest = rest.replace(dd[0], "");
    }
  }

  /* 4.5) 节日名 → 下一个该节日的公历日期（农历+公历+法定节日全支持，当天已过自动顺延至明年）
     令牌必须与 lunar.js 的 festOf 覆盖对齐（长词优先），否则解析会静默失败 */
  const FEST_TOKENS = "春节|除夕|元宵节|元宵|龙抬头|清明节|清明|端午节|端午|七夕节|七夕|中秋节|中秋|重阳节|重阳|腊八节|腊八|元旦|国庆节|国庆|劳动节|情人节|平安夜|圣诞节|儿童节|教师节|妇女节|植树节|青年节|建党节|建军节";
  const festM = rest.match(new RegExp("(" + FEST_TOKENS + ")"));
  if (festM && window.LUNAR && typeof window.LUNAR.festOf === "function") {
    const want = festM[1];
    const findFest = (from) => {
      for (let i = from; i < from + 500; i++) {
        const d = new Date(y, mo, d0 + i);
        let f = "";
        try { f = window.LUNAR.festOf(d) || ""; } catch {}
        if (f.indexOf(want) === 0) return i;
      }
      return null;
    };
    const fo = findFest(0);
    if (fo != null) {
      shift = fo;
      explicitDate = true;
      festHit = true; festWant = want;
      rest = rest.replace(festM[0], "");
    }
  }

  /* 5) 时刻（连同「早上/下午/晚上」等修饰词一并识别与剔除） */
  const MOD = "(?:清晨|凌晨|早上|早晨|上午|下午|午后|傍晚|晚上|晚间|夜里|中午|正午)?\\s*";
  amWord = amWord || /清晨|凌晨|早上|早晨|上午/.test(rest);
  pmWord = pmWord || /下午|午后|傍晚|晚上|晚间|夜里/.test(rest);
  noonWord = /中午|正午/.test(rest);
  let hh = null, mmv = 0;
  const tm24 = rest.match(new RegExp(MOD + "(\\d{1,2})\\s*[:：]\\s*(\\d{1,2})"));
  const tmPt = rest.match(new RegExp(MOD + "(\\d{1,2})\\s*点\\s*(?:(半|一刻|两刻|三刻|\\d{1,2})\\s*分?)?"));
  if (tm24) { hh = +tm24[1]; mmv = +tm24[2]; rest = rest.replace(tm24[0], ""); }
  else if (tmPt) {
    hh = +tmPt[1];
    mmv = tmPt[2] ? (tmPt[2] === "半" ? 30 : tmPt[2] === "一刻" ? 15 : tmPt[2] === "两刻" ? 30 : tmPt[2] === "三刻" ? 45 : +tmPt[2]) : 0;
    if (mmv > 59) return null;
    rest = rest.replace(tmPt[0], "");
  }
  if (hh != null) {
    if (hh >= 1 && hh <= 11 && (pmWord || noonWord)) hh += 12;   /* 下午3点 → 15；中午1点 → 13 */
    else if (pmWord && hh === 12) hh = 0;                         /* 晚上12点 → 午夜 */
    if (hh > 23 || mmv > 59) return null;
  } else {
    hh = 9; /* 未提及时刻 → 默认上午 9 点 */
  }

  /* 6) 组装：明确的过去日期/星期自动顺延（X月X日→明年 · X号→下月 · 周X→下周 · 节日→下一个同名节日 · 无日期已过→明天） */
  let at = new Date(y, mo, d0 + shift, hh, mmv, 0, 0);
  if (at.getTime() <= Date.now()) {
    let reAt = null;
    if (festHit) {
      for (let i = 1; i < 500; i++) {
        const d = new Date(y, mo, d0 + i);
        let f = "";
        try { f = window.LUNAR.festOf(d) || ""; } catch {}
        if (f.indexOf(festWant) === 0) { reAt = new Date(y, mo, d0 + i, hh, mmv, 0, 0); break; }
      }
      if (reAt) at = reAt;
    }
    else if (mdHit) at = new Date(y + 1, mdMo - 1, mdDd, hh, mmv, 0, 0);
    else if (ddHit) at = new Date(y, mo + 1, ddNum, hh, mmv, 0, 0);
    else if (wdHit) at = new Date(at.getTime() + 7 * 86400000);
    else at = new Date(y, mo, d0 + shift + 1, hh, mmv, 0, 0);
  }
  return { at, label: cleanLabel(rest) };
}
window.AURELION_PARSE = parseZhTime; /* 供调试与测试 */

/* ---------- 重复表达识别：「每天早上7点跑步」「每周三下午5点开会」→ 重复闹钟 ----------
   无「每天/每周X」前缀返回 null（一次性任务照走原解析）。无时刻时默认 9 点。 */
function parseRecurring(raw) {
  let s = String(raw || "").trim();
  if (!s) return null;
  let m = s.match(/^\s*(?:每天|每日)/);
  let days;
  if (m) {
    days = [0, 1, 2, 3, 4, 5, 6];
    s = s.slice(m[0].length);
  } else {
    m = s.match(/^\s*每\s*(?:周|星期|礼拜)\s*([一二三四五六日天])/);
    if (!m) return null;
    days = [WEEKMAP[m[1]]];
    s = s.slice(m[0].length);
  }
  const r = parseZhTime(s);
  if (!r) return { time: "09:00", label: cleanLabel(s), days };
  return { time: pad(r.at.getHours()) + ":" + pad(r.at.getMinutes()), label: r.label, days };
}
window.AURELION_RECUR = parseRecurring; /* 供调试与测试 */
function fmtDTLocal(d) {
  return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + "T" + pad(d.getHours()) + ":" + pad(d.getMinutes());
}
function addSmartTask() {
  const text = $("#tkSmart").value.trim();
  if (!text) return;
  /* 智能路由：「每天/每周X」开头的表达直接创建重复闹钟 */
  const rec = parseRecurring(text);
  if (rec) {
    const nid = uid();
    alarms.push({ id: nid, time: rec.time, label: rec.label, days: rec.days, on: true, lastFired: "" });
    lastAddedAlarmId = nid;
    save(K.alarm, alarms);
    renderAlarms(); updateNext();
    $("#tkSmart").value = "";
    const dn = rec.days.length === 7 ? "每天" : "每周" + WEEK[rec.days[0]];
    toast("已创建" + dn + "闹钟 " + rec.time + (rec.label ? " · " + rec.label : "") + "（已归入「闹钟」页）");
    return;
  }
  const r = parseZhTime(text);
  if (!r) { toast("没有认出时间，试试「明天下午3点交周报」或「30分钟后开会」"); return; }
  if (r.at.getTime() <= Date.now()) { toast("这个时间已经过去了，换个未来的时间吧"); return; }
  const d = r.at;
  tasks.push({ id: uid(), at: fmtDTLocal(d), label: r.label, done: false });
  save(K.task, tasks);
  renderTasks(); updateNext();
  $("#tkSmart").value = "";
  toast("已添加：" + (d.getMonth() + 1) + " 月 " + d.getDate() + " 日 " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + (r.label ? " · " + r.label : ""));
}
$("#tkSmartAdd").addEventListener("click", addSmartTask);
$("#tkSmart").addEventListener("keydown", (e) => { if (e.key === "Enter") addSmartTask(); });

/* ---------- 数据健全性清洗：手改/异常导入的坏数据不致命，逐项修复（须在 uid 定义后执行） ---------- */
alarms = Array.isArray(alarms) ? alarms.filter((a) => a && typeof a.time === "string" && /^\d{1,2}:\d{2}$/.test(a.time)).map((a) => ({
  id: a.id || uid(),
  time: a.time.length === 4 ? "0" + a.time : a.time,
  label: typeof a.label === "string" ? a.label : "",
  days: Array.isArray(a.days) ? a.days.filter((n) => n >= 0 && n < 7) : [0, 1, 2, 3, 4, 5, 6],
  on: a.on !== false,
  lastFired: typeof a.lastFired === "string" ? a.lastFired : "",
  fireDate: typeof a.fireDate === "string" ? a.fireDate : "", /* 一次性闹钟的指定日期（宽限窗内不误响他日） */
})) : [];
tasks = Array.isArray(tasks) ? tasks.filter((t) => t && typeof t.at === "string" && !isNaN(new Date(t.at).getTime())).map((t) => ({
  id: t.id || uid(),
  at: t.at,
  label: typeof t.label === "string" ? t.label : "",
  done: !!t.done,
  yearly: !!t.yearly,
})) : [];
if (!timerSt || typeof timerSt !== "object") timerSt = {};
if (typeof timerSt.end !== "number") timerSt.end = null;
if (!(typeof timerSt.total === "number" && timerSt.total > 0)) timerSt.total = 5 * 60000;
if (!(typeof timerSt.remain === "number" && timerSt.remain >= 0)) timerSt.remain = timerSt.total;
timerSt.running = !!timerSt.running;
cfg.vol = (typeof cfg.vol === "number" && cfg.vol >= 0 && cfg.vol <= 1) ? cfg.vol : 0.6;
cfg.snoozeMin = [5, 10, 15].indexOf(cfg.snoozeMin) >= 0 ? cfg.snoozeMin : 5;
if (["chime", "bird", "crystal"].indexOf(cfg.bellType) < 0) cfg.bellType = "chime";
if (typeof cfg.lastTab !== "string") cfg.lastTab = "";
cfg.focusWork = (typeof cfg.focusWork === "number" && cfg.focusWork >= 5 && cfg.focusWork <= 180) ? Math.floor(cfg.focusWork) : 25;
cfg.focusBreak = (typeof cfg.focusBreak === "number" && cfg.focusBreak >= 1 && cfg.focusBreak <= 60) ? Math.floor(cfg.focusBreak) : 5;
cfg.timerLoop = !!cfg.timerLoop;
cfg.footPin = !!cfg.footPin;

/* ---------- 声音：合成钟琴（无外部资源） ---------- */
let AC = null;
function audioCtx() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch { return null; } }
  if (AC.state === "suspended") { try { AC.resume(); } catch {} }
  return AC;
}
/* 三种合成音色：钟琴（泛音）/ 鸟鸣（颤音）/ 水晶（三角波+高频列） */
function bell(freq, at, vol, dur, type) {
  const c = audioCtx(); if (!c || vol <= 0) return;
  const t = c.currentTime + at;
  const isBird = type === "bird", isCrystal = type === "crystal";
  const partials = isBird ? [[1, 1]] : isCrystal ? [[1, 1], [2.02, 0.18]] : [[1, 1], [2.756, 0.24]];
  partials.forEach(([mult, amp]) => {
    const o = c.createOscillator(), g = c.createGain();
    o.type = isCrystal ? "triangle" : "sine";
    o.frequency.value = freq * mult;
    if (isBird) {
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = 9;
      lg.gain.value = freq * 0.07;
      lfo.connect(lg); lg.connect(o.frequency);
      lfo.start(t); lfo.stop(t + dur + 0.1);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol * amp), t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * (mult === 1 ? 1 : 0.55));
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.2);
  });
}
function chime(vol, notes) {
  const type = cfg.bellType;
  const ns = notes || (type === "bird" ? [1568, 2093, 1568] : type === "crystal" ? [784, 1046.5, 1318.5] : [659.26, 523.25, 392.0]);
  ns.forEach((f, i) => bell(f, i * 0.55, vol * 0.5, 1.5, type));
}

/* ---------- 系统通知 ---------- */
let notifyAsked = false;
function askNotify() {
  if (notifyAsked || window.AURELION_DESKTOP || !("Notification" in window)) return;
  notifyAsked = true;
  try { if (Notification.permission === "default") Notification.requestPermission(); } catch {}
}
function notify(title, body, sound) {
  try {
    if (window.AURELION_DESKTOP) {
      /* 桌面端：托盘通知由主进程发送（不抢占焦点、无浏览器弹窗限制），sound=false 静默 */
      if (window.AURELION_DESKTOP.notify) window.AURELION_DESKTOP.notify(title, body, sound !== false);
      return;
    }
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    const n = new Notification(title, { body, icon: "assets/icon256.png", silent: sound === false });
    if (sound !== false) {
      try { if (n.sound) n.sound = ""; } catch {}
      try { bell(880, 0, 0.12, 0.3); } catch {}
    }
  } catch {}
}

/* ---------- 响铃（渐强唤醒 + 夜间智能音色 + 任务栏闪烁 + 自动停止） ---------- */
let ringing = null, ringInterval = null, snoozeTimer = null, ringAutoStop = null, ringCount = 0;
function flashFrame(on) {
  try { if (window.AURELION_DESKTOP && window.AURELION_DESKTOP.flash) window.AURELION_DESKTOP.flash(!!on); } catch {}
}
/* 时段问候 + 节日祝贺：响铃卡片上的一句温度话 */
function greetText() {
  const now = new Date();
  const h = now.getHours();
  let g;
  if (h >= 5 && h < 11) g = "早上好，新的一天从现在开始";
  else if (h >= 11 && h < 14) g = "中午好，别忘了休息片刻";
  else if (h >= 14 && h < 18) g = "下午好，保持这份专注";
  else if (h >= 18 && h < 22) g = "晚上好，愿今晚安然";
  else g = "夜深了，处理完就早点休息";
  try {
    const LZ = window.LUNAR;
    if (LZ) {
      const v = LZ.vacState(now);
      const fest = LZ.festOf(now);
      if (v && v.kind === "work") return fest ? fest.replace(/补班$/, "") + "补班 · 上班路上注意安全" : g;
      if (fest && /春节|除夕|元旦|国庆|中秋|端午|劳动节|元宵|清明|腊八|重阳|七夕|龙抬头/.test(fest)) return fest + "快乐！";
    }
  } catch {}
  return g;
}
/* 夜间（22:00-7:00）非闹钟提醒自动柔化，避免深夜刺耳 */
function ringVol(base, isAlarm) {
  const night = new Date().getHours() >= 22 || new Date().getHours() < 7;
  return base * (night && !isAlarm ? 0.65 : 1);
}
function startRing(info) {
  ringing = info;
  $("#ringTime").textContent = info.timeText;
  /* 夜间免打扰：非闹钟提醒 22:00-次日 7:00 静音，仅保留通知与任务栏闪烁；全局静音模式一律不发声 */
  const h = new Date().getHours();
  const quiet = cfg.suspendAll || (cfg.dnd && !info.snooze && (h >= 22 || h < 7));
  $("#ringLabel").textContent = info.label + (quiet ? " · 免打扰中（已静音）" : "");
  const greet = $("#ringGreet");
  if (greet) greet.textContent = greetText();
  $("#ringSnooze").textContent = "贪睡 " + (cfg.snoozeMin || 5) + " 分钟";
  $("#ringSnooze").style.display = info.snooze ? "" : "none";
  $("#ringOverlay").classList.add("show");
  /* 焦点直达「停止」：键盘/读屏用户无需 Tab 寻址 */
  try { const sb = $("#ringStop"); if (sb) sb.focus({ preventScroll: true }); } catch {}
  if (window.AURELION_DESKTOP) window.AURELION_DESKTOP.focus();
  else { try { window.focus(); } catch {} }
  flashFrame(true);
  notify("AURELION 时光 · " + info.timeText, info.label, false); /* 响铃已有提示音，通知静音避免双声 */
  /* 闹钟渐强唤醒：前 5 个循环由轻到重；其他提醒保持稳定音量 */
  ringCount = 0;
  const firstVol = quiet ? 0 : ringVol(cfg.vol * (info.snooze ? 0.3 : 1), info.snooze);
  if (firstVol > 0) chime(firstVol);
  clearInterval(ringInterval);
  ringInterval = setInterval(() => {
    ringCount++;
    if (quiet) return;
    const ramp = info.snooze ? Math.min(1, 0.3 + ringCount * 0.14) : 1;
    chime(ringVol(cfg.vol * ramp, info.snooze));
  }, 2400);
  clearTimeout(ringAutoStop);
  ringAutoStop = setTimeout(stopRing, info.snooze ? 10 * 60 * 1000 : 60 * 1000);
}
function stopRing() {
  ringing = null;
  clearInterval(ringInterval); ringInterval = null;
  clearTimeout(snoozeTimer); snoozeTimer = null;
  clearTimeout(ringAutoStop); ringAutoStop = null;
  try { save(KSNOOZE, null); } catch {}
  flashFrame(false);
  $("#ringOverlay").classList.remove("show");
}
$("#ringStop").addEventListener("click", stopRing);
/* 贪睡持久化键：应用重启后贪睡不丢 */
const KSNOOZE = "aurelion.snooze.v1";
$("#ringSnooze").addEventListener("click", () => {
  const info = ringing;
  stopRing();
  if (info && info.snooze) {
    const until = Date.now() + (cfg.snoozeMin || 5) * 60 * 1000;
    save(KSNOOZE, { until: until, info: info });
    snoozeTimer = setTimeout(() => { save(KSNOOZE, null); startRing(info); }, until - Date.now());
  }
});
/* 启动恢复：未到的贪睡继续倒计时；已到但错过 5 分钟内立即补响，其余作废 */
(function restoreSnooze() {
  const p = load(KSNOOZE, null);
  if (!p || !p.info || typeof p.until !== "number") { save(KSNOOZE, null); return; }
  if (p.until > Date.now()) {
    snoozeTimer = setTimeout(() => { save(KSNOOZE, null); startRing(p.info); }, p.until - Date.now());
  } else if (Date.now() - p.until < 5 * 60000) {
    save(KSNOOZE, null);
    startRing(p.info);
  } else save(KSNOOZE, null);
})();

/* ---------- 抽屉与页签 ---------- */
const panel = $("#clockPanel");
const TABS = ["alarm", "world", "stopwatch", "timer", "task", "calendar"];
let drawerOpen = false;
function openDrawer() {
  drawerOpen = true;
  panel.classList.add("show");
  $("#clockBtn").classList.add("on");
  askNotify();
  /* 记忆页签：恢复上次停留的页签 */
  const lt = cfg.lastTab;
  if (lt && TABS.indexOf(lt) >= 0) {
    document.querySelectorAll(".cp-tab").forEach((x) => { x.classList.toggle("on", x.dataset.t === lt); x.setAttribute("aria-selected", String(x.dataset.t === lt)); });
    TABS.forEach((k) => $("#cp" + k[0].toUpperCase() + k.slice(1) + "View").classList.toggle("hide", k !== lt));
  }
  renderAlarms(); renderTasks(); renderTimer(); renderSw(); renderWorld(); renderCal(); updateNext();
}
function closeDrawer() { drawerOpen = false; panel.classList.remove("show"); $("#clockBtn").classList.remove("on"); }
$("#clockBtn").addEventListener("click", () => drawerOpen ? closeDrawer() : openDrawer());
$("#cpClose").addEventListener("click", closeDrawer);
/* 响铃状态键盘接管：Esc/Enter 停止 · 空格/S 贪睡（无贪睡按钮时停止） */
addEventListener("keydown", (e) => {
  const ro = $("#ringOverlay");
  if (ro && ro.classList.contains("show")) {
    if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); stopRing(); }
    else if (e.key === " " || e.key.toLowerCase() === "s") {
      e.preventDefault();
      const btn = $("#ringSnooze");
      if (btn && btn.style.display !== "none") btn.click(); else stopRing();
    }
    return;
  }
  if (e.key === "Escape" && drawerOpen) closeDrawer();
});

document.querySelectorAll(".cp-tab").forEach((t) => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".cp-tab").forEach((x) => { x.classList.toggle("on", x === t); x.setAttribute("aria-selected", String(x === t)); });
    TABS.forEach((k) => $("#cp" + k[0].toUpperCase() + k.slice(1) + "View").classList.toggle("hide", k !== t.dataset.t));
    if (t.dataset.t === "world") renderWorld();
    if (t.dataset.t === "calendar") renderCal();
    if (cfg.lastTab !== t.dataset.t) { cfg.lastTab = t.dataset.t; save(K.cfg, cfg); }
  });
});

/* ---------- 底部设置区智能收起：悬停自动弹出，移开自动收起；单击手柄可固定（记忆偏好） ---------- */
const cpFoot = $("#cpFoot"), footHandle = $("#footHandle");
let footPinned = !!cfg.footPin, footTimer = null;
function applyFoot(open) {
  if (!cpFoot || !footHandle) return;
  cpFoot.classList.toggle("open", open);
  footHandle.setAttribute("aria-expanded", String(open));
}
if (cpFoot && footHandle) {
  applyFoot(footPinned);
  const footShow = (open) => {
    if (footPinned) { applyFoot(true); return; }
    clearTimeout(footTimer);
    if (open) applyFoot(true);
    else footTimer = setTimeout(() => applyFoot(false), 320);
  };
  cpFoot.addEventListener("mouseenter", () => footShow(true));
  cpFoot.addEventListener("mouseleave", (e) => { if (e.buttons) return; footShow(false); }); /* 拖拽滑杆时不收起 */
  cpFoot.addEventListener("focusin", () => footShow(true));
  cpFoot.addEventListener("focusout", (e) => { if (!cpFoot.contains(e.relatedTarget)) footShow(false); });
  const pinFoot = () => {
    footPinned = !footPinned;
    cfg.footPin = footPinned;
    save(K.cfg, cfg);
    applyFoot(footPinned);
    if (!footPinned) footShow(true); /* 取消固定时鼠标仍在其上 → 保持展开，移开后收起 */
    toast(footPinned ? "设置区已固定展开 · 再次点击手柄恢复悬停展开" : "设置区已恢复悬停自动展开");
  };
  footHandle.addEventListener("click", pinFoot);
  footHandle.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pinFoot(); } });
}

/* ---------- 世界时钟（世界时复杂功能 · Intl 时区 · 营业时段智能标注 · 支持自定义城市） ---------- */
const WORLD_CITIES = [
  ["北京", "Asia/Shanghai"], ["东京", "Asia/Tokyo"], ["新加坡", "Asia/Singapore"],
  ["悉尼", "Australia/Sydney"], ["迪拜", "Asia/Dubai"], ["伦敦", "Europe/London"],
  ["纽约", "America/New_York"], ["洛杉矶", "America/Los_Angeles"],
];
let _worldFmts = null;
function getWorldFmts() {
  if (_worldFmts) return _worldFmts;
  try {
    _worldFmts = WORLD_CITIES.concat(cfg.worldCities || []).map(([city, tz]) => ({
      city, tz,
      time: new Intl.DateTimeFormat("zh-CN", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit" }),
      wd: new Intl.DateTimeFormat("zh-CN", { timeZone: tz, weekday: "short" }),
    }));
  } catch { _worldFmts = []; }
  return _worldFmts;
}
function renderWorld() {
  const box = $("#worldList");
  if (!box) return;
  const fmts = getWorldFmts();
  if (!fmts.length) return;
  const now = new Date();
  let ltz = "";
  try { ltz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch {}
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const rows = fmts.map((f) => {
    let hm = f.time.format(now);          /* "14:23"（午夜可能显示 24:xx） */
    let hh = parseInt(hm.slice(0, 2), 10), mm = parseInt(hm.slice(3, 5), 10);
    if (hh === 24) { hh = 0; hm = "00:" + pad(mm); } /* Intl 午夜 24:xx → 00:xx */
    let disp = hm;
    if (cfg.hour12) { const h12 = hh % 12 || 12; disp = h12 + ":" + pad(mm) + (hh < 12 ? " AM" : " PM"); }
    const wd = f.wd.format(now);            /* "周五" */
    let diffMin = hh * 60 + mm - nowMin;    /* 与本地钟表差（自动处理跨日） */
    if (diffMin > 720) diffMin -= 1440;
    if (diffMin < -720) diffMin += 1440;
    const isLocal = f.tz === ltz;
    const office = !/[六日]/.test(wd) && hh >= 9 && hh < 18;
    const abs = Math.abs(diffMin);
    const diffText = isLocal ? "本地时间" : diffMin === 0 ? "与本地同时" :
      (diffMin > 0 ? "比本地快 " : "比本地慢 ") +
      (abs >= 60 ? (abs % 60 ? (abs / 60).toFixed(1) : abs / 60) + " 小时" : abs + " 分钟");
    return { f, hm: disp, wd, office, diffText, isLocal, sort: isLocal ? -1 : ((diffMin + 720 + 1440) % 1440) };
  }).sort((a, b) => a.sort - b.sort);
  box.innerHTML = "";
  rows.forEach((r) => {
    const item = document.createElement("div");
    item.className = "al-item";
    item.innerHTML = '<div class="al-time" style="font-size:19px;">' + r.hm + '</div>' +
      '<div class="al-meta"><div class="al-label">' + escapeHtml(r.f.city) +
      (r.isLocal ? ' <span class="lap-tag lap-best">本地</span>' : "") +
      (r.office ? ' <span class="lap-tag lap-best" title="当地工作时间 9:00–18:00">营业中</span>' : "") + '</div>' +
      '<div class="al-days">' + r.diffText + " · " + r.wd + '</div></div>';
    /* 自定义城市：右侧提供一键移除 */
    const builtin = WORLD_CITIES.some((c) => c[1] === r.f.tz);
    if (!builtin) {
      const del = document.createElement("div");
      del.className = "al-del";
      del.textContent = "✕";
      del.title = "移除 " + r.f.city;
      del.addEventListener("click", () => {
        cfg.worldCities = (cfg.worldCities || []).filter((c) => c[1] !== r.f.tz);
        _worldFmts = null;
        save(K.cfg, cfg);
        renderWorld();
      });
      item.appendChild(del);
    }
    box.appendChild(item);
  });
}
/* 自定义城市（IANA 时区名）添加/移除 */
const wcAdd = $("#worldCityAdd"), wcInput = $("#worldCityInput"), wcHint = $("#worldCityHint");
if (wcAdd && wcInput) {
  wcAdd.addEventListener("click", () => {
    const raw = wcInput.value.trim();
    if (!raw) return;
    const m = raw.match(/^(.+?)\s+([A-Za-z_\/+\-]+)$/); /* 「东京 Asia/Tokyo」 */
    if (!m) { if (wcHint) wcHint.textContent = "格式：城市名 时区（如 东京 Asia/Tokyo）"; return; }
    const city = m[1].trim(), tz = m[2];
    let ok = true;
    try { new Intl.DateTimeFormat("zh-CN", { timeZone: tz }); } catch { ok = false; }
    if (!ok) { if (wcHint) wcHint.textContent = "时区无效，请用 IANA 名（如 Asia/Tokyo）"; return; }
    if ((cfg.worldCities || []).some((c) => c[1] === tz)) { if (wcHint) wcHint.textContent = "该时区已存在"; return; }
    cfg.worldCities = (cfg.worldCities || []).concat([[city, tz]]).slice(0, 20);
    _worldFmts = null;
    save(K.cfg, cfg);
    wcInput.value = "";
    if (wcHint) wcHint.textContent = "";
    renderWorld();
  });
  wcInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); wcAdd.click(); } });
  /* 自定义城市展示为可移除 chip */
  if (wcHint && (cfg.worldCities || []).length) {
    wcHint.textContent = "已添加：" + cfg.worldCities.map((c) => c[0]).join("、") + "（点世界时钟列表右上 ✕ 可移除）";
  }
}

/* ---------- 闹钟 ---------- */
let daySel = new Set([0, 1, 2, 3, 4, 5, 6]);
let lastAddedAlarmId = null;
function renderDays() {
  const box = $("#alDays");
  box.innerHTML = "";
  WEEK.forEach((w, i) => {
    const d = document.createElement("div");
    d.className = "cp-day" + (daySel.has(i) ? " on" : "");
    d.textContent = w;
    d.addEventListener("click", () => { daySel.has(i) ? daySel.delete(i) : daySel.add(i); renderDays(); });
    box.appendChild(d);
  });
}
function fmtDays(days) {
  if (!days || days.length === 7) return "每天";
  if (days.length === 0) return "仅响一次";
  return WEEK.filter((_, i) => days.includes(i)).map((w) => "周" + w).join(" ");
}
/* ---------- 智能相对时间 ---------- */
function fmtRel(ms) {
  const mins = Math.max(1, Math.round(ms / 60000));
  if (mins < 60) return mins + " 分钟";
  const h = Math.floor(mins / 60), m = mins % 60;
  if (mins < 1440) return h + " 小时" + (m ? " " + m + " 分" : "");
  return Math.floor(mins / 1440) + " 天 " + Math.floor((mins % 1440) / 60) + " 小时";
}
/* 某个开启的闹钟下一次触发时刻（毫秒），无则 null */
function nextMsForAlarm(a) {
  const now = new Date();
  for (let d = 0; d < 8; d++) {
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, +a.time.slice(0, 2), +a.time.slice(3), 0, 0);
    if (dt.getTime() <= now.getTime()) continue;
    if (a.days && a.days.length && !a.days.includes(dt.getDay())) continue;
    if (a.fireDate && dt.toDateString() !== a.fireDate) continue; /* 一次性闹钟只在指定日期生效 */
    return dt.getTime();
  }
  return null;
}
function renderAlarms() {
  const list = $("#alList"), empty = $("#alEmpty");
  list.innerHTML = "";
  empty.style.display = alarms.length ? "none" : "";
  alarms.sort((a, b) => a.time.localeCompare(b.time));
  alarms.forEach((a) => {
    const relMs = a.on ? nextMsForAlarm(a) : null;
    const relText = a.on
      ? (relMs != null ? " · " + fmtRel(relMs - Date.now()) + "后响" : "")
      : " · 已关闭";
    const item = document.createElement("div");
    item.className = "al-item" + (a.on ? "" : " off") + (a.id && a.id === lastAddedAlarmId ? " flash" : "");
    if (a.id && a.id === lastAddedAlarmId) lastAddedAlarmId = null; /* 高亮只出现一次 */
    item.innerHTML = '<div class="al-time">' + a.time + '</div>' +
      '<div class="al-meta"><div class="al-label">' + escapeHtml(a.label || "闹钟") + '</div>' +
      '<div class="al-days">' + fmtDays(a.days) + relText + '</div></div>';
    const tg = document.createElement("div");
    tg.setAttribute("role", "switch");
    tg.className = "toggle" + (a.on ? " on" : "");
    setSwitch(tg, a.on);
    tg.innerHTML = '<div class="track"></div>';
    tg.addEventListener("click", () => { a.on = !a.on; setSwitch(tg, a.on); save(K.alarm, alarms); renderAlarms(); updateNext(); });
    const del = document.createElement("div");
    del.className = "al-del"; del.textContent = "✕";
    del.addEventListener("click", () => { alarms = alarms.filter((x) => x !== a); save(K.alarm, alarms); renderAlarms(); updateNext(); });
    item.appendChild(tg); item.appendChild(del);
    list.appendChild(item);
  });
}
$("#alAdd").addEventListener("click", () => {
  const t = $("#alTime").value || "07:30";
  const nid = uid();
  alarms.push({ id: nid, time: t, label: $("#alLabel").value.trim(), days: [...daySel], on: true, lastFired: "" });
  lastAddedAlarmId = nid;
  $("#alLabel").value = "";
  save(K.alarm, alarms);
  renderAlarms(); updateNext();
});
window.AURELION_ALARM_NEXT = nextMsForAlarm; /* 供调试与测试 */

/* ---------- 快速一次性闹钟 chips（免输入，fireDate 定日不误响） ---------- */
function buildAlQuick() {
  const host = $("#alQuick");
  if (!host) return;
  host.innerHTML = "";
  const mk = (label, getAt) => {
    const c = document.createElement("div");
    c.className = "tm-chip";
    c.textContent = label;
    c.addEventListener("click", () => {
      const d = getAt();
      if (!d || d.getTime() <= Date.now()) { toast("该时间已过，换一个吧"); return; }
      const nid = uid();
      alarms.push({ id: nid, time: pad(d.getHours()) + ":" + pad(d.getMinutes()), label: "", days: [], on: true, lastFired: "", fireDate: d.toDateString() });
      lastAddedAlarmId = nid;
      save(K.alarm, alarms);
      renderAlarms(); updateNext();
      toast("已添加一次性闹钟：" + (d.getMonth() + 1) + " 月 " + d.getDate() + " 日 " + pad(d.getHours()) + ":" + pad(d.getMinutes()));
    });
    host.appendChild(c);
  };
  mk("15 分钟后", () => new Date(Date.now() + 15 * 60000));
  mk("30 分钟后", () => new Date(Date.now() + 30 * 60000));
  mk("1 小时后", () => new Date(Date.now() + 3600000));
  mk("明早 7:30", () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(7, 30, 0, 0); return d; });
}
buildAlQuick();

/* ---------- 定时任务 ---------- */
let tkYearly = false;
const tkYearlyTg = $("#tkYearlyToggle");
if (tkYearlyTg) {
  tkYearlyTg.addEventListener("click", () => {
    tkYearly = !tkYearly;
    setSwitch(tkYearlyTg, tkYearly);
  });
}
function renderTasks() {
  const list = $("#tkList"), empty = $("#tkEmpty");
  list.innerHTML = "";
  const pending = tasks.filter((t) => !t.done).sort((a, b) => new Date(a.at) - new Date(b.at));
  empty.style.display = pending.length ? "none" : "";
  pending.forEach((t) => {
    const d = new Date(t.at);
    const left = new Date(t.at).getTime() - Date.now();
    const item = document.createElement("div");
    item.className = "al-item";
    item.innerHTML = '<div class="al-meta"><div class="al-label">' + escapeHtml(t.label || "提醒") + '</div>' +
      '<div class="al-days">' + (d.getMonth() + 1) + " 月 " + d.getDate() + " 日 " + pad(d.getHours()) + ":" + pad(d.getMinutes()) +
      " · 剩 " + fmtDur(left) + '</div></div>';
    if (t.yearly) {
      const tag = document.createElement("div");
      tag.className = "lap-tag lap-best";
      tag.textContent = "每年";
      tag.style.marginLeft = "6px";
      item.children[0].appendChild(tag);
    }
    /* 点击备注行内编辑（Enter/失焦保存） */
    const lab = item.querySelector(".al-label");
    lab.classList.add("editable");
    lab.title = "点击编辑备注";
    lab.addEventListener("click", () => {
      if (lab.querySelector("input")) return;
      const inp = document.createElement("input");
      inp.type = "text"; inp.maxLength = 24; inp.value = t.label || "";
      inp.style.cssText = "width:100%;background:rgba(255,255,255,.04);border:1px solid var(--gold-soft);border-radius:4px;color:var(--ink);font-size:11.5px;padding:3px 6px;outline:none;letter-spacing:.04em;";
      lab.textContent = ""; lab.appendChild(inp); inp.focus(); inp.select();
      const doneEdit = () => {
        t.label = inp.value.trim().slice(0, 24);
        save(K.task, tasks); renderTasks(); updateNext();
      };
      inp.addEventListener("keydown", (ev) => { ev.stopPropagation(); if (ev.key === "Enter") { ev.preventDefault(); doneEdit(); } });
      inp.addEventListener("blur", doneEdit);
      inp.addEventListener("click", (ev) => ev.stopPropagation());
    });
    const pushD = document.createElement("div");
    pushD.className = "al-act"; pushD.textContent = "+1天"; pushD.title = "推迟一天";
    pushD.addEventListener("click", () => {
      t.at = fmtDTLocal(new Date(new Date(t.at).getTime() + 86400000));
      save(K.task, tasks); renderTasks(); updateNext();
    });
    const push = document.createElement("div");
    push.className = "al-act"; push.textContent = "+1时"; push.title = "推迟一小时";
    push.addEventListener("click", () => {
      t.at = fmtDTLocal(new Date(new Date(t.at).getTime() + 3600000));
      save(K.task, tasks); renderTasks(); updateNext();
    });
    const del = document.createElement("div");
    del.className = "al-del"; del.textContent = "✕";
    del.addEventListener("click", () => { tasks = tasks.filter((x) => x !== t); save(K.task, tasks); renderTasks(); updateNext(); });
    item.appendChild(pushD); item.appendChild(push); item.appendChild(del);
    list.appendChild(item);
  });
}
$("#tkAdd").addEventListener("click", () => {
  const v = $("#tkTime").value;
  if (!v) { toast("请先选择提醒时间"); return; }
  if (new Date(v).getTime() <= Date.now()) { toast("这个时间已经过去了，请选择未来的时间"); return; }
  tasks.push({ id: uid(), at: v, label: $("#tkLabel").value.trim(), done: false, yearly: tkYearly });
  $("#tkLabel").value = "";
  $("#tkTime").value = "";
  save(K.task, tasks);
  renderTasks(); updateNext();
  toast("已添加定时任务");
});

/* ---------- 任务快速添加 chips（免输入，一键加入） ---------- */
function buildTkQuick() {
  const host = $("#tkQuick");
  if (!host) return;
  host.innerHTML = "";
  const mk = (label, getAt) => {
    const c = document.createElement("div");
    c.className = "tm-chip";
    c.textContent = label;
    c.addEventListener("click", () => {
      const d = getAt();
      if (!d || d.getTime() <= Date.now()) { toast("该时间已过，换一个吧"); return; }
      tasks.push({ id: uid(), at: fmtDTLocal(d), label: "", done: false, yearly: false });
      save(K.task, tasks); renderTasks(); updateNext();
      toast("已添加：" + (d.getMonth() + 1) + " 月 " + d.getDate() + " 日 " + pad(d.getHours()) + ":" + pad(d.getMinutes()));
    });
    host.appendChild(c);
  };
  const atToday = (h, m) => { const d = new Date(); d.setHours(h, m, 0, 0); if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1); return d; };
  mk("+30 分钟", () => new Date(Date.now() + 30 * 60000));
  mk("+1 小时", () => new Date(Date.now() + 3600000));
  mk("+2 小时", () => new Date(Date.now() + 2 * 3600000));
  mk("今晚 21:00", () => atToday(21, 0));
  mk("明早 8:00", () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(8, 0, 0, 0); return d; });
}
buildTkQuick();

/* ---------- 倒计时 ---------- */
function fmtDur(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? h + ":" + pad(m) + ":" + pad(sec) : pad(m) + ":" + pad(sec);
}
function renderTimer() {
  const left = timerSt.running ? Math.max(0, timerSt.end - Date.now()) : Math.max(0, timerSt.remain);
  const disp = $("#tmDisplay");
  disp.textContent = fmtDur(left);
  disp.classList.toggle("done", timerSt.running && left <= 0);
  $("#tmStart").textContent = timerSt.running ? "暂停" : "启动";
  if (!timerSt.running && timerSt.remain === timerSt.total) $("#tmStart").textContent = "启动";
  /* 专注循环状态文案（时长跟随自定义配置） */
  const fl = $("#focusLabel");
  if (fl) {
    if (timerSt.focus) {
      fl.textContent = "专注循环 · " + cfg.focusWork + "+" + cfg.focusBreak + " · 已完成 " + (timerSt.focus.rounds || 0) + " 轮 · 今日 " + todayPomodoros() + " 🍅" +
        (timerSt.focus.phase === "work" ? " · 当前专注中" : " · 当前休息中");
    } else {
      fl.textContent = "专注循环 · " + cfg.focusWork + " 分钟 + 休息 " + cfg.focusBreak + " 分钟" + (todayPomodoros() > 0 ? " · 今日 " + todayPomodoros() + " 🍅" : "");
    }
  }
  /* 自定义专注/休息时长行：仅专注模式开启时显示 */
  const fcr = $("#focusCustomRow");
  if (fcr) fcr.style.display = timerSt.focus ? "" : "none";
  /* 循环倒计时状态 */
  const ll = $("#loopLabel");
  if (ll) ll.textContent = "循环倒计时 · 结束自动重新开始" + ((timerSt.loops || 0) > 0 ? "（已 " + timerSt.loops + " 轮）" : "");
}
/* 专注循环开关：开启即开始专注（默认 25 分钟，可在下方自定义），到点自动休息并循环 */
const focusTg = $("#focusToggle");
setSwitch(focusTg, !!timerSt.focus);
focusTg.addEventListener("click", () => {
  if (timerSt.focus) {
    timerSt.focus = null; /* 关闭后当前段走完即停，不再接续 */
    toast("专注循环已关闭");
  } else {
    timerSt.focus = { phase: "work", rounds: 0 };
    if (!timerSt.running) {
      timerSt.total = cfg.focusWork * 60000; timerSt.remain = cfg.focusWork * 60000;
      timerSt.end = Date.now() + cfg.focusWork * 60000; timerSt.running = true;
      audioCtx();
    }
    toast("专注循环开始 · 每个 " + cfg.focusWork + " 分钟番茄后休息 " + cfg.focusBreak + " 分钟");
  }
  setSwitch(focusTg, !!timerSt.focus);
  save(K.timer, timerSt); renderTimer(); updateNext();
});
/* ---------- 循环倒计时开关 ---------- */
const loopTg = $("#loopToggle");
if (loopTg) {
  setSwitch(loopTg, !!cfg.timerLoop);
  loopTg.addEventListener("click", () => {
    cfg.timerLoop = !cfg.timerLoop;
    setSwitch(loopTg, cfg.timerLoop);
    save(K.cfg, cfg);
    toast(cfg.timerLoop ? "循环倒计时已开启：结束后自动重新开始" : "循环倒计时已关闭");
    renderTimer();
  });
}
/* ---------- 自定义专注/休息时长（专注模式开启时显示，改动即生效于下一段） ---------- */
const fwEl = $("#focusWorkMin"), fbEl = $("#focusBreakMin");
if (fwEl && fbEl) {
  fwEl.value = cfg.focusWork; fbEl.value = cfg.focusBreak;
  const applyFocusDur = () => {
    const w = Math.round(parseFloat(fwEl.value)), b = Math.round(parseFloat(fbEl.value));
    cfg.focusWork = (w >= 5 && w <= 180) ? w : 25;
    cfg.focusBreak = (b >= 1 && b <= 60) ? b : 5;
    fwEl.value = cfg.focusWork; fbEl.value = cfg.focusBreak;
    save(K.cfg, cfg);
    /* 空闲挂起状态（专注开但未计时）立即应用新时长 */
    if (timerSt.focus && !timerSt.running) {
      const work = timerSt.focus.phase === "work";
      const mins = work ? cfg.focusWork : cfg.focusBreak;
      timerSt.total = mins * 60000; timerSt.remain = mins * 60000;
      save(K.timer, timerSt);
    }
    renderTimer(); updateNext();
    toast("专注时长已更新：" + cfg.focusWork + " 分钟专注 + " + cfg.focusBreak + " 分钟休息");
  };
  fwEl.addEventListener("change", applyFocusDur);
  fbEl.addEventListener("change", applyFocusDur);
}
$("#tmStart").addEventListener("click", () => {
  if (timerSt.running) {
    timerSt.remain = Math.max(0, timerSt.end - Date.now());
    timerSt.running = false;
  } else {
    const rem = timerSt.remain > 0 ? timerSt.remain : timerSt.total;
    if (rem <= 0) return;
    timerSt.end = Date.now() + rem;
    timerSt.running = true;
    audioCtx();
  }
  save(K.timer, timerSt); renderTimer(); updateNext();
});
$("#tmReset").addEventListener("click", () => {
  timerSt.running = false; timerSt.remain = timerSt.total; timerSt.end = null; timerSt.loops = 0;
  save(K.timer, timerSt); renderTimer(); updateNext();
});
/* +1 分微调：运行中延长当前段，空闲时预加剩余时长（封顶 999 分钟） */
$("#tmPlus").addEventListener("click", () => {
  if (timerSt.running) {
    timerSt.end = Math.max(timerSt.end, Date.now()) + 60000;
    if (timerSt.end - Date.now() > timerSt.total) timerSt.total = timerSt.end - Date.now();
  } else {
    timerSt.remain = Math.min(999 * 60000, Math.max(0, timerSt.remain) + 60000);
    if (timerSt.remain > timerSt.total) timerSt.total = timerSt.remain;
  }
  save(K.timer, timerSt); renderTimer(); updateNext();
});
/* ---------- 常用时长学习：高频使用的倒计时自动置前并标注「常用」 ---------- */
const KU = "aurelion.timeruse.v1";
let timerUse = load(KU, {});
/* ---------- 今日番茄统计（跨会话，按天归零） ---------- */
const KFOCUS = "aurelion.focusstats.v1";
let focusStat = load(KFOCUS, { day: "", count: 0 });
function todayPomodoros() {
  return (focusStat && focusStat.day === new Date().toDateString()) ? (focusStat.count || 0) : 0;
}
function noteUse(min) {
  const k = String(min);
  timerUse[k] = (timerUse[k] || 0) + 1;
  save(KU, timerUse);
  buildPresets();
}
function buildPresets() {
  const host = $("#tmPresets");
  if (!host) return;
  const arr = [1, 3, 5, 10, 25, 60];
  const hotSet = new Set(Object.entries(timerUse).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k));
  const sorted = arr.slice().sort((a, b) => (hotSet.has(String(b)) ? 1 : 0) - (hotSet.has(String(a)) ? 1 : 0));
  host.innerHTML = "";
  sorted.forEach((m) => {
    const c = document.createElement("div");
    c.className = "tm-chip" + (hotSet.has(String(m)) ? " hot" : "");
    c.textContent = m + " 分钟";
    c.addEventListener("click", () => {
      timerSt.total = m * 60000; timerSt.remain = m * 60000; timerSt.end = Date.now() + m * 60000; timerSt.running = true;
      save(K.timer, timerSt); renderTimer(); updateNext(); audioCtx();
      noteUse(m);
    });
    host.appendChild(c);
  });
}
buildPresets();
/* 自定义分钟倒计时（1 ~ 999 分钟） */
function setCustomTimer() {
  const v = Math.floor(parseFloat($("#tmCustom").value));
  if (!isFinite(v) || v < 1 || v > 999) { $("#tmCustom").value = ""; return; }
  timerSt.total = v * 60000; timerSt.remain = v * 60000; timerSt.end = Date.now() + v * 60000; timerSt.running = true;
  $("#tmCustom").value = "";
  save(K.timer, timerSt); renderTimer(); updateNext(); audioCtx();
  noteUse(v);
}
$("#tmCustomSet").addEventListener("click", setCustomTimer);
$("#tmCustom").addEventListener("keydown", (e) => { if (e.key === "Enter") setCustomTimer(); });

/* ---------- 节假日预告（抽屉底部一行，随状态智能切换） ---------- */
function updateFest() {
  const row = $("#festRow"), txt = $("#festText");
  if (!row || !txt) return;
  try {
    const LZ = window.LUNAR;
    if (!LZ) { row.style.display = "none"; return; }
    const now = new Date();
    const v = LZ.vacState(now);
    if (v && v.kind === "off") {
      txt.textContent = "🎉 " + v.name + "假期进行中 · 第 " + v.dayN + " 天（共 " + v.total + " 天）" + (v.generic ? " · 暂按法定假日，未含调休" : "");
      row.style.display = "";
      return;
    }
    if (v && v.kind === "work") {
      txt.textContent = "📍 今天是" + v.name + "调休补班日，别忘设闹钟";
      row.style.display = "";
      return;
    }
    const nx = LZ.nextVacation(now, 120);
    if (nx && nx.left <= 45) {
      const d = nx.from;
      txt.textContent = "🎉 " + (d.getMonth() + 1) + " 月 " + d.getDate() + " 日 " + nx.name + " · 放假 " + nx.total + " 天（还剩 " + nx.left + " 天）" + (nx.generic ? " · 暂按法定假日，未含调休" : "");
      row.style.display = "";
      return;
    }
    row.style.display = "none";
  } catch { row.style.display = "none"; }
}

/* ---------- 下次提醒（同步到标题栏 + 托盘 tooltip） ---------- */
const BASE_TITLE = document.title;
function updateNext() {
  const t = nextText();
  $("#cpNext").textContent = t;
  document.title = (t && t !== "暂无提醒计划") ? "AURELION 时光 · " + t.replace(/^下次 · /, "") : BASE_TITLE;
  try { if (window.AURELION_DESKTOP && window.AURELION_DESKTOP.setNext) window.AURELION_DESKTOP.setNext(t); } catch {}
  updateFest();
}
function nextText() {
  const now = Date.now(); let best = null;
  for (const a of alarms) {
    if (!a.on) continue;
    const ms = nextMsForAlarm(a);
    if (ms != null && (!best || ms < best.ms)) best = { ms, text: a.time, label: a.label || "闹钟" };
  }
  for (const t of tasks) {
    if (t.done) continue;
    const ms = new Date(t.at).getTime();
    if (ms <= now) continue;
    if (!best || ms < best.ms) best = { ms, text: (new Date(t.at).getMonth() + 1) + "月" + new Date(t.at).getDate() + "日 " + pad(new Date(t.at).getHours()) + ":" + pad(new Date(t.at).getMinutes()), label: t.label || "提醒" };
  }
  if (timerSt.running && timerSt.end > Date.now() && (!best || timerSt.end < best.ms)) best = { ms: timerSt.end, text: "倒计时 " + fmtDur(timerSt.end - Date.now()), label: "" };
  if (!best) return "暂无提醒计划";
  const mins = Math.max(1, Math.round((best.ms - Date.now()) / 60000));
  const dur = mins < 60 ? mins + " 分钟" : mins < 1440 ? Math.floor(mins / 60) + " 小时 " + (mins % 60) + " 分" : Math.floor(mins / 1440) + " 天";
  return "下次 · " + best.text + "（" + dur + "后）" + (best.label ? " " + best.label : "");
}

/* ---------- 心跳：每秒巡检 ---------- */
let lastTickMs = Date.now();
let lastNextMs = 0;
let lastFestDay = "";
let lastChimeKey = "";
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function tick() {
  const nowMs = Date.now();
  const gap = nowMs - lastTickMs; lastTickMs = nowMs;
  const now = new Date(nowMs);
  const grace = Math.max(180000, gap + 30000);
  const hhmm = pad(now.getHours()) + ":" + pad(now.getMinutes());

  /* 整点报时：按「日期+小时」键防漂移漏响（tick 可能不在第 0 秒醒来）；静音模式下仅保留视觉通知 */
  const chimeKey = now.toDateString() + " " + now.getHours();
  if (cfg.chime && !cfg.suspendAll && now.getMinutes() === 0 && lastChimeKey !== chimeKey && !ringing) {
    lastChimeKey = chimeKey;
    chime(cfg.vol * 0.6, [523.25, 392.0]);
    if (cfg.voice) speakTime(false);
  }

  /* 节日晨报：每天一次（9 点后首检），节日/假期首日温和提示；静音模式仅弹通知不发声 */
  if (cfg.festAlarm !== false && !ringing && now.getHours() >= 9) {
    const fkey = now.toDateString();
    if (lastFestDay !== fkey) {
      lastFestDay = fkey;
      try {
        const LZ = window.LUNAR;
        const fest = LZ && LZ.festOf(now);
        if (fest && fest.indexOf("补班") < 0) {
          if (!cfg.suspendAll) chime(cfg.vol * 0.4);
          notify("AURELION 时光 · 今天", fest, false);
          toast("🎉 " + fest);
        }
      } catch {}
    }
  }

  for (const a of alarms) {
    if (!a.on) continue;
    const sched = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +a.time.slice(0, 2), +a.time.slice(3), 0, 0);
    const past = nowMs - sched.getTime();
    if (past < 0 || past > grace) continue;
    if (a.days && a.days.length && !a.days.includes(sched.getDay())) continue;
    if (a.fireDate && a.fireDate !== sched.toDateString()) continue; /* 一次性闹钟：只在指定日期的宽限窗内响 */
    const key = now.toDateString() + " " + a.time;
    if (a.lastFired === key) continue;
    a.lastFired = key;
    if (!a.days || a.days.length === 0) a.on = false; /* 无重复日 = 仅响一次 */
    save(K.alarm, alarms);
    renderAlarms();
    startRing({ timeText: a.time, label: a.label || "闹钟", snooze: true });
    break;
  }
  for (const t of tasks) {
    if (t.done) continue;
    const late = nowMs - new Date(t.at).getTime();
    if (late >= 0) {
      if (t.yearly) { /* 每年重复：触发后顺延一年，不标完成 */
        const d = new Date(t.at);
        d.setFullYear(d.getFullYear() + 1);
        t.at = fmtDTLocal(d);
        save(K.task, tasks);
        renderTasks(); updateNext();
        startRing({ timeText: hhmm, label: "纪念日 · " + (t.label || "提醒"), snooze: false });
        break;
      }
      t.done = true; save(K.task, tasks);
      renderTasks(); updateNext();
      if (late <= 10 * 60000) startRing({ timeText: hhmm, label: "定时任务 · " + (t.label || "提醒"), snooze: false });
      break;
    }
  }
  /* 倒计时最后 10 秒：每秒一声轻滴预警 */
  if (timerSt.running) {
    const remainMs = timerSt.end - nowMs;
    if (remainMs > 0 && remainMs <= 10500) {
      const sec = Math.ceil(remainMs / 1000);
      if (sec !== lastCdSec) { lastCdSec = sec; bell(880, 0, cfg.vol * 0.25 * ((now.getHours() >= 22 || now.getHours() < 7) ? 0.6 : 1), 0.12); }
    } else lastCdSec = null;
  }
  /* 倒计时到点 → 响铃（专注模式下自动接续休息 / 下一轮） */
  if (timerSt.running && timerSt.end <= nowMs) {
    const fz = timerSt.focus;
    timerSt.running = false;
    timerSt.remain = 0;
    if (fz && fz.phase === "work") {
      const done = fz.rounds || 0;
      /* 今日番茄 +1（按天归零统计） */
      const today = now.toDateString();
      if (focusStat.day !== today) focusStat = { day: today, count: 0 };
      focusStat.count = (focusStat.count || 0) + 1;
      save(KFOCUS, focusStat);
      timerSt.focus = { phase: "break", rounds: done };
      timerSt.total = cfg.focusBreak * 60000; timerSt.remain = cfg.focusBreak * 60000;
      timerSt.end = nowMs + cfg.focusBreak * 60000; timerSt.running = true;
      save(K.timer, timerSt);
      startRing({ timeText: "专注完成", label: "第 " + (done + 1) + " 个番茄达成 · 休息 " + cfg.focusBreak + " 分钟", snooze: false });
    } else if (fz && fz.phase === "break") {
      const done = (fz.rounds || 0) + 1;
      timerSt.focus = { phase: "work", rounds: done };
      timerSt.total = cfg.focusWork * 60000; timerSt.remain = cfg.focusWork * 60000;
      timerSt.end = nowMs + cfg.focusWork * 60000; timerSt.running = true;
      save(K.timer, timerSt);
      startRing({ timeText: "休息结束", label: "开始第 " + (done + 1) + " 个番茄（" + cfg.focusWork + " 分钟）", snooze: false });
    } else if (cfg.timerLoop && timerSt.total > 0) {
      /* 循环倒计时：结束后自动重开同一时长 */
      timerSt.loops = (timerSt.loops || 0) + 1;
      timerSt.end = nowMs + timerSt.total;
      timerSt.running = true;
      save(K.timer, timerSt);
      startRing({ timeText: "倒计时", label: "第 " + timerSt.loops + " 轮开始 · 时长 " + fmtDur(timerSt.total), snooze: false });
    } else {
      save(K.timer, timerSt);
      startRing({ timeText: "倒计时", label: "倒计时结束", snooze: false });
    }
    renderTimer(); updateNext();
  }
  renderTimer();
  if (nowMs - lastNextMs >= 4000) { lastNextMs = nowMs; updateNext(); } /* 标题/托盘文案节流，避免每秒写 */
  if (nowMs % 30000 < 1000 && drawerOpen) {
    renderAlarms(); /* 相对时间每 30 秒刷新 */
    const wv = $("#cpWorldView");
    if (wv && !wv.classList.contains("hide")) renderWorld();
  }
}
let lastCdSec = null;
setInterval(tick, 1000);

/* ---------- 配置 ---------- */
const chimeTg = $("#chimeToggle");
setSwitch(chimeTg, cfg.chime);
chimeTg.addEventListener("click", () => {
  cfg.chime = !cfg.chime;
  setSwitch(chimeTg, cfg.chime);
  save(K.cfg, cfg);
  if (cfg.chime) audioCtx();
});
const volInput = $("#chimeVol");
volInput.value = cfg.vol;
volInput.addEventListener("input", () => { cfg.vol = parseFloat(volInput.value); save(K.cfg, cfg); });

/* ---------- 语音报时（整点人声播报，可选） ---------- */
function speakTime(test) {
  try {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    let txt;
    if (test) txt = "语音报时已开启";
    else {
      const n = new Date();
      const h = n.getHours();
      txt = "现在是" + (h < 6 ? "凌晨 " : h < 12 ? "上午 " : h < 18 ? "下午 " : "晚上 ") + (h % 12 === 0 ? 12 : h % 12) + "点整";
    }
    const u = new SpeechSynthesisUtterance(txt);
    u.lang = "zh-CN";
    u.rate = 0.95;
    u.volume = Math.min(1, Math.max(0.2, cfg.vol));
    speechSynthesis.speak(u);
  } catch {}
}
const voiceTg = $("#voiceToggle");
setSwitch(voiceTg, !!cfg.voice);
voiceTg.addEventListener("click", () => {
  cfg.voice = !cfg.voice;
  setSwitch(voiceTg, cfg.voice);
  save(K.cfg, cfg);
  if (cfg.voice) speakTime(true);
});

/* ---------- 响铃音色 / 贪睡时长选择器 ---------- */
function buildPickers() {
  const bp = $("#bellPicker"), sp = $("#snoozePicker");
  if (!bp || !sp) return;
  const mk = (host, items, cur, onPick) => {
    host.innerHTML = "";
    items.forEach(([v, label]) => {
      const c = document.createElement("div");
      c.className = "tm-chip" + (v === cur ? " hot" : "");
      c.style.cssText = "font-size:10px;padding:4px 8px;";
      c.textContent = label;
      c.addEventListener("click", () => { onPick(v); buildPickers(); });
      host.appendChild(c);
    });
  };
  mk(bp, [["chime", "🔔钟琴"], ["bird", "🐦鸟鸣"], ["crystal", "💎水晶"]], cfg.bellType || "chime",
    (v) => { cfg.bellType = v; save(K.cfg, cfg); audioCtx(); chime(cfg.vol * 0.5); });
  mk(sp, [[5, "5 分"], [10, "10 分"], [15, "15 分"]], cfg.snoozeMin || 5,
    (v) => { cfg.snoozeMin = v; save(K.cfg, cfg); });
}
buildPickers();

/* ---------- 夜间免打扰 / 节日晨报 ---------- */
const dndTg = $("#dndToggle");
setSwitch(dndTg, !!cfg.dnd);
dndTg.addEventListener("click", () => {
  cfg.dnd = !cfg.dnd;
  setSwitch(dndTg, cfg.dnd);
  save(K.cfg, cfg);
  if (cfg.dnd) toast("夜间免打扰已开启：22 点后非闹钟提醒仅通知不响铃");
});
const festAlarmTg = $("#festAlarmToggle");
setSwitch(festAlarmTg, cfg.festAlarm !== false);
festAlarmTg.addEventListener("click", () => {
  cfg.festAlarm = cfg.festAlarm === false;
  setSwitch(festAlarmTg, cfg.festAlarm !== false);
  save(K.cfg, cfg);
});

/* ---------- 屏幕常亮（桌面版） ---------- */
const awakeTg = $("#awakeToggle");
setSwitch(awakeTg, cfg.keepAwake);
function applyAwake() {
  if (window.AURELION_DESKTOP && window.AURELION_DESKTOP.setKeepAwake) window.AURELION_DESKTOP.setKeepAwake(!!cfg.keepAwake);
}
awakeTg.addEventListener("click", () => {
  cfg.keepAwake = !cfg.keepAwake;
  setSwitch(awakeTg, cfg.keepAwake);
  save(K.cfg, cfg);
  applyAwake();
});
applyAwake();

/* ---------- 12 小时制 / 静音模式（界面与闹钟列表同步刷新） ---------- */
const hour12Tg = $("#hour12Toggle");
if (hour12Tg) {
  setSwitch(hour12Tg, cfg.hour12);
  hour12Tg.addEventListener("click", () => {
    cfg.hour12 = !cfg.hour12;
    setSwitch(hour12Tg, cfg.hour12);
    save(K.cfg, cfg);
    renderAlarms(); renderWorld(); updateNext();
    toast("时间显示已切换为 " + (cfg.hour12 ? "12 小时制" : "24 小时制"));
  });
}
const suspendTg = $("#suspendToggle");
if (suspendTg) {
  setSwitch(suspendTg, cfg.suspendAll);
  suspendTg.addEventListener("click", () => {
    cfg.suspendAll = !cfg.suspendAll;
    setSwitch(suspendTg, cfg.suspendAll);
    save(K.cfg, cfg);
    toast(cfg.suspendAll ? "静音模式已开启：闹钟照常响铃，其余提醒仅通知不发声" : "静音模式已关闭");
  });
}

/* ---------- 数据备份 / 恢复（全部 aurelion.* 配置一键迁移） ---------- */
function collectBackup() {
  const o = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.indexOf("aurelion.") === 0) o[k] = localStorage.getItem(k);
  }
  return o;
}
$("#bkExport").addEventListener("click", () => {
  try {
    const d = new Date();
    const data = {
      app: "AURELION 时光",
      version: 1,
      exportedAt: new Date().toISOString(),
      data: collectBackup(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "AURELION备份-" + d.getFullYear() + String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0") + ".json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  } catch {}
});
$("#bkImport").addEventListener("click", () => $("#bkFile").click());
$("#bkFile").addEventListener("change", async (e) => {
  const f = e.target.files && e.target.files[0];
  if (!f) return;
  try {
    const obj = JSON.parse(await f.text());
    if (!obj || obj.app !== "AURELION 时光" || !obj.data || typeof obj.data !== "object") throw new Error("bad");
    Object.entries(obj.data).forEach(([k, v]) => {
      if (k.indexOf("aurelion.") === 0 && typeof v === "string") {
        localStorage.setItem(k, v);
        try { if (window.AURELION_DESKTOP && window.AURELION_DESKTOP.saveKV) window.AURELION_DESKTOP.saveKV({ [k]: v }); } catch {}
      }
    });
    alert("备份导入成功，页面即将刷新生效。");
    location.reload();
  } catch {
    alert("导入失败：不是有效的 AURELION 时光备份文件。");
  }
  e.target.value = "";
});

/* ---------- 开机自启（仅桌面版显示） ---------- */
const loginRow = $("#loginRow");
if (window.AURELION_DESKTOP && window.AURELION_DESKTOP.getLogin && window.AURELION_DESKTOP.setLogin) {
  loginRow.style.display = "";
  const loginTg = $("#loginToggle");
  window.AURELION_DESKTOP.getLogin().then((v) => loginTg.classList.toggle("on", !!v)).catch(() => {});
  loginTg.addEventListener("click", () => {
    const next = !loginTg.classList.contains("on");
    loginTg.classList.toggle("on", next);
    loginTg.setAttribute("aria-checked", String(next));
    window.AURELION_DESKTOP.setLogin(next);
  });
}

/* ---------- 秒表 ---------- */
let swSt = Object.assign({ running: false, startMs: 0, accMs: 0, laps: [] }, load(K.sw, {}));
function swElapsed() { return swSt.accMs + (swSt.running ? Date.now() - swSt.startMs : 0); }
function fmtSw(ms) {
  const t = Math.max(0, ms);
  const h = Math.floor(t / 3600000), m = Math.floor((t % 3600000) / 60000), s = Math.floor((t % 60000) / 1000), d = Math.floor((t % 1000) / 100);
  return (h ? h + ":" + pad(m) + ":" : "") + pad(m) + ":" + pad(s) + "." + d;
}
let swTimer = null;
function renderSw() { $("#swDisplay").textContent = fmtSw(swElapsed()); $("#swToggle").textContent = swSt.running ? "停止" : "启动"; }
function renderLaps() {
  const box = $("#swLaps"); box.innerHTML = "";
  const total = swSt.laps.length;
  if (total < 1) return;
  /* 圈时 = 相邻累计差；至少两圈时标出最快/最慢 */
  let best = -1, worst = -1;
  if (total >= 2) {
    let minV = Infinity, maxV = -Infinity;
    for (let i = 0; i < total; i++) {
      const lap = swSt.laps[i] - (i ? swSt.laps[i - 1] : 0);
      if (lap < minV) { minV = lap; best = i; }
      if (lap > maxV) { maxV = lap; worst = i; }
    }
  }
  swSt.laps.slice(-6).reverse().forEach((v, idx) => {
    const i = total - 1 - idx;
    const lap = v - (i ? swSt.laps[i - 1] : 0);
    const el = document.createElement("div");
    el.className = "al-item";
    const tag = i === best ? '<span class="lap-tag lap-best">最快</span>' : i === worst ? '<span class="lap-tag lap-worst">最慢</span>' : "";
    el.innerHTML = '<div class="al-meta"><div class="al-label">计次 ' + (total - idx) + tag + '</div>' +
      '<div class="al-days">单圈 ' + fmtSw(lap) + ' · 累计 ' + fmtSw(v) + '</div></div>';
    box.appendChild(el);
  });
}
$("#swToggle").addEventListener("click", () => {
  if (swSt.running) {
    swSt.accMs = swElapsed(); swSt.running = false;
    clearInterval(swTimer); swTimer = null;
  } else {
    swSt.startMs = Date.now(); swSt.running = true;
    audioCtx();
    swTimer = setInterval(() => { if (drawerOpen) renderSw(); }, 47); /* 抽屉关闭时跳过 DOM 更新，计时按墙钟不受影响 */
  }
  save(K.sw, swSt); renderSw();
});
$("#swLap").addEventListener("click", () => {
  if (!swSt.running) return;
  swSt.laps.push(swElapsed());
  if (swSt.laps.length > 12) swSt.laps = swSt.laps.slice(-12);
  save(K.sw, swSt); renderLaps();
});
$("#swReset").addEventListener("click", () => {
  swSt.running = false; swSt.startMs = 0; swSt.accMs = 0; swSt.laps = [];
  clearInterval(swTimer); swTimer = null;
  save(K.sw, swSt); renderSw(); renderLaps();
});
renderSw(); renderLaps();

/* ---------- 日历页签：月视图（阳历 + 农历 + 节日 + 假期调休） ---------- */
let calCursor = (() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); })();
let calSel = null;
function calKey(d) { return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
const CAL_WEEK = ["日", "一", "二", "三", "四", "五", "六"];
function renderCal() {
  const y = calCursor.getFullYear(), m = calCursor.getMonth();
  const title = $("#calTitle");
  if (title) title.textContent = y + " 年 " + (m + 1) + " 月";
  const grid = $("#calGrid");
  if (!grid) return;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const dim = new Date(y, m + 1, 0).getDate();
  const startDow = new Date(y, m, 1).getDay();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push('<div class="cal-cell blank"></div>');
  for (let d = 1; d <= dim; d++) {
    const dt = new Date(y, m, d);
    const isToday = dt.getTime() === today.getTime();
    const isSel = calSel === calKey(dt);
    const LZ = window.LUNAR;
    const l = LZ ? LZ.solarToLunar(dt) : null;
    const vac = LZ ? LZ.vacState(dt) : null;
    const fest = LZ ? LZ.festOf(dt) : null;
    let sub = l ? l.dCn : "";
    let tag = "";
    let isFest = false;
    if (vac && vac.kind === "off") {
      tag = '<span class="cal-tag off">休</span>';
      sub = vac.name ? vac.name.slice(0, 2) : (fest || sub);
      isFest = true;
    } else if (vac && vac.kind === "work") {
      tag = '<span class="cal-tag work">班</span>';
      if (fest && fest.indexOf("补班") >= 0) sub = fest.replace("补班", "");
      else if (vac.name) sub = vac.name.slice(0, 2);
    } else if (fest) {
      sub = fest.slice(0, 2);
      isFest = true;
    }
    const dow = dt.getDay();
    const cls = ["cal-cell"];
    if (isToday) cls.push("today");
    if (isSel) cls.push("sel");
    if (dow === 0 || dow === 6) cls.push("wkend");
    if (isFest) cls.push("fest");
    cells.push('<div class="' + cls.join(" ") + '" data-d="' + calKey(dt) + '" role="button" tabindex="0">' + tag +
      '<span class="cd">' + d + '</span>' +
      (sub ? '<span class="cl">' + sub + '</span>' : '') +
      '</div>');
  }
  grid.innerHTML = cells.join("");
  renderCalDetail();
}
function renderCalDetail() {
  const box = $("#calDetail");
  if (!box) return;
  let dt = new Date();
  if (calSel) {
    const p = calSel.split("-");
    dt = new Date(+p[0], +p[1] - 1, +p[2]);
  }
  const LZ = window.LUNAR;
  const l = LZ ? LZ.solarToLunar(dt) : null;
  const vac = LZ ? LZ.vacState(dt) : null;
  const fest = LZ ? LZ.festOf(dt) : null;
  let s = "<b>" + dt.getFullYear() + " 年 " + (dt.getMonth() + 1) + " 月 " + dt.getDate() + " 日 · 星期" + CAL_WEEK[dt.getDay()] + "</b>";
  if (l) s += "<br>农历" + (l.isLeap ? "闰" : "") + l.mCn + l.dCn + " · " + l.gzYear + "年 · 属" + l.zodiac;
  if (fest) s += "<br>☘ " + fest;
  if (vac && vac.kind === "off") s += " <span style=\"color:#7fd8a8;\">· 假期 " + vac.name + " 第 " + vac.dayN + "/" + vac.total + " 天</span>";
  if (vac && vac.kind === "work") s += " <span style=\"color:#e0b45a;\">· 调休补班</span>";
  box.innerHTML = s;
}
const calGridEl = $("#calGrid");
if (calGridEl) {
  calGridEl.addEventListener("click", (e) => {
    const cell = e.target.closest ? e.target.closest(".cal-cell[data-d]") : null;
    if (!cell) return;
    calSel = cell.dataset.d;
    renderCal();
  });
}
$("#calPrev") && $("#calPrev").addEventListener("click", () => { calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() - 1, 1); calSel = null; renderCal(); });
$("#calNext") && $("#calNext").addEventListener("click", () => { calCursor = new Date(calCursor.getFullYear(), calCursor.getMonth() + 1, 1); calSel = null; renderCal(); });
$("#calToday") && $("#calToday").addEventListener("click", () => { const d = new Date(); calCursor = new Date(d.getFullYear(), d.getMonth(), 1); calSel = null; renderCal(); });
/* 顶部农历点击 → 打开抽屉并切入日历（供 app.js 调用） */
window.AURELION_OPEN_TAB = (t) => {
  if (!drawerOpen) openDrawer();
  const tab = document.querySelector('.cp-tab[data-t="' + t + '"]');
  if (tab) tab.click();
};
renderCal();

renderDays();
renderAlarms();
renderTasks();
renderTimer();
updateNext();
})();
