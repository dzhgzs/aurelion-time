/* AURELION 时光 · Electron 主进程
   托盘常驻：关闭窗口 = 最小化到托盘，闹钟持续生效 */
const { app, BrowserWindow, Tray, Menu, ipcMain, Notification, nativeImage, dialog, powerSaveBlocker, session, screen, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const PKG = require("../package.json");

/* ---------- 故障日志 ----------
   打包版程序目录通常只读（Program Files），日志改写到 userData；
   开发版仍写仓库根目录便于排查。 */
const LOG = (() => {
  try {
    if (app.isPackaged) {
      const dir = path.join(app.getPath("appData"), "AURELION 时光");
      fs.mkdirSync(dir, { recursive: true });
      return path.join(dir, "crash.log");
    }
  } catch {}
  return path.join(__dirname, "..", "crash.log");
})();
function logErr(tag, err) {
  try {
    try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); } catch {}
    try { const st = fs.statSync(LOG); if (st.size > 200 * 1024) fs.writeFileSync(LOG, ""); } catch {}
    fs.appendFileSync(LOG, new Date().toISOString() + " [" + tag + "] " + (err && err.stack ? err.stack : String(err)) + "\n");
  } catch {}
}

/* ---------- GPU 崩溃自动降级 ---------- */
let gpuFails = 0;
const noGpuFile = path.join(__dirname, "..", ".no-gpu");
try {
  if (fs.existsSync(noGpuFile) || process.env.WATCH_NO_GPU) {
    app.commandLine.appendSwitch("disable-gpu");
  }
} catch {}

/* ---------- 启动耗时诊断（写入 crash.log，便于排查启动慢） ---------- */
const BOOT_T0 = Date.now();

/* ---------- 数据目录统一（必须在单实例锁之前：锁按 userData 路径区分，
   否则便携版/安装版/开发版可同时启动，抢缓存锁导致启动极慢） ---------- */
try {
  app.setPath("userData", path.join(app.getPath("appData"), "AURELION 时光"));
} catch (e) { logErr("userdata", e); }

/* ---------- GPU 磁盘缓存异常兜底（损坏/被占用时不再反复重试拖慢启动） ---------- */
try {
  if (process.env.WATCH_NO_GPU) app.commandLine.appendSwitch("disable-gpu");
} catch {}

/* ---------- 单实例：再次启动 = 聚焦已有窗口 ---------- */
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  boot();
}

function boot() {
  app.setAppUserModelId("com.aurelion.time");
  let win = null;
  let tray = null;
  let quitting = false;

  /* ---------- 升级接口：GitHub Releases 新版本感知 ----------
     从 package.json 的 repository 解析 owner/repo，读取 Releases/latest，
     语义化比较版本号；发现新版本弹窗并跳转发布页。离线/未配置时静默。 */
  const repoSlug = () => {
    try {
      const m = String((PKG.repository && PKG.repository.url) || "").match(/github\.com\/([^/]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
      return m ? m[1] + "/" + m[2] : null;
    } catch { return null; }
  };
  const verCmp = (a, b) => {
    const pa = String(a).replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
    const pb = String(b).replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < 3; i++) { if (pa[i] !== pb[i]) return pa[i] - pb[i]; }
    return 0;
  };
  const msgBox = (opts) => { try { return win ? dialog.showMessageBox(win, opts) : dialog.showMessageBox(opts); } catch { return undefined; } };
  let lastUpdateCheck = 0;
  async function checkForUpdates(manual) {
    try {
      const slug = repoSlug();
      if (!slug) {
        if (manual) msgBox({ message: "尚未配置升级源：请在 package.json 的 repository 字段填入 GitHub 仓库地址。", buttons: ["好的"] });
        return "unconfigured";
      }
      const res = await fetch("https://api.github.com/repos/" + slug + "/releases/latest", {
        headers: { "User-Agent": "AURELION-Time-Updater", "Accept": "application/vnd.github+json" },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        if (manual) msgBox({ message: "检查更新失败（HTTP " + res.status + "）：稍后再试，或前往 Releases 页面手动查看。", buttons: ["好的"] });
        return "http-" + res.status;
      }
      const rel = await res.json();
      const latest = rel.tag_name || "";
      if (verCmp(latest, app.getVersion()) > 0) {
        const r = await msgBox({
          type: "info",
          message: "发现新版本 " + latest + "（当前 v" + app.getVersion() + "）",
          detail: (rel.name ? rel.name + "\n\n" : "") + "发布页提供便携版 / 安装版 / 绿色版下载，覆盖安装即可升级（配置数据自动保留）。",
          buttons: ["前往下载", "以后再说"],
          defaultId: 0,
          noLink: true,
        });
        if (r && r.response === 0 && rel.html_url) shell.openExternal(rel.html_url);
        return "update-" + latest;
      }
      if (manual) msgBox({ message: "已是最新版本 v" + app.getVersion() + "。", buttons: ["好的"] });
      return "latest";
    } catch (e) {
      logErr("update-check", e);
      if (manual) msgBox({ message: "检查更新失败：网络不可达或仓库不存在。可前往 Releases 页面手动查看新版本。", buttons: ["好的"] });
      return "offline";
    } finally {
      lastUpdateCheck = Date.now();
    }
  }

  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      if (!win.isVisible()) win.show();
      win.focus();
    }
  });

  const createTray = () => {
    try {
      const icon = nativeImage.createFromPath(path.join(__dirname, "..", "assets", "icon256.png"));
      tray = new Tray(icon);
      tray.setToolTip("AURELION 时光 · 闹钟运行中");
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: "显示主界面", click: () => { if (win) { win.show(); win.focus(); } } },
        {
          label: "窗口置顶",
          type: "checkbox",
          click: (m) => { if (win) win.setAlwaysOnTop(m.checked, "screen-saver"); },
        },
        { type: "separator" },
        {
          label: "打开数据文件夹",
          click: () => { try { shell.openPath(app.getPath("userData")); } catch (e) { logErr("open-ud", e); } },
        },
        { label: "检查更新", click: () => { checkForUpdates(true); } },
        {
          label: "诊断日志",
          click: () => {
            try {
              if (fs.existsSync(LOG)) shell.openPath(LOG);
              else dialog.showMessageBox(win, { message: "暂无故障日志，运行状态良好。", buttons: ["好的"] });
            } catch (e) { logErr("open-log", e); }
          },
        },
        { type: "separator" },
        { label: "退出", click: () => { quitting = true; app.quit(); } },
      ]));
      const show = () => { if (win) { if (!win.isVisible()) win.show(); win.focus(); } };
      tray.on("double-click", show);
      tray.on("click", show);
    } catch (e) { logErr("tray", e); }
  };

  /* ---------- 窗口位置/尺寸记忆（越界自动回正） ---------- */
  const boundsFile = path.join(app.getPath("userData"), "window-bounds.json");
  function loadBounds() {
    try {
      const b = JSON.parse(fs.readFileSync(boundsFile, "utf8"));
      if (!b || b.width < 400 || b.height < 300) return null;
      const area = screen.getDisplayMatching({ x: b.x, y: b.y, width: b.width, height: b.height }).workArea;
      const visible = b.x + 80 > area.x && b.y + 80 > area.y &&
                      b.x + 80 < area.x + area.width && b.y + 80 < area.y + area.height;
      return visible ? b : null;
    } catch { return null; }
  }
  function saveBounds() {
    try {
      if (!win) return;
      const data = { bounds: win.getBounds(), maximized: win.isMaximized() };
      fs.writeFileSync(boundsFile, JSON.stringify(data));
    } catch {}
  }

  const createWindow = () => {
    try {
      const saved = loadBounds();
      win = new BrowserWindow({
        width: saved ? saved.bounds.width : 1360,
        height: saved ? saved.bounds.height : 860,
        x: saved ? saved.bounds.x : undefined,
        y: saved ? saved.bounds.y : undefined,
        minWidth: 960,
        minHeight: 640,
        backgroundColor: "#0a0b0d",
        autoHideMenuBar: true,
        title: "AURELION 时光",
        show: false, /* 就绪后再显示，避免白屏闪烁 */
        icon: path.join(__dirname, "..", "assets", "icon256.png"),
        webPreferences: {
          preload: path.join(__dirname, "preload.js"),
          contextIsolation: true,
          nodeIntegration: false,
          /* 闹钟可靠性：窗口隐藏/最小化到托盘时禁止后台定时器节流，
             否则长时间托盘挂机后 tick 被降频，闹钟可能迟到 */
          backgroundThrottling: false,
          sandbox: true,
          webviewTag: false,
          spellcheck: false,
        },
      });
      if (saved && saved.maximized) win.maximize();
      win.setMenuBarVisibility(false);
      win.loadFile("index.html");
      /* 安全：阻止页面导航与弹窗（防注入跳转） */
      win.webContents.on("will-navigate", (e, url) => {
        if (!url.startsWith("file:")) e.preventDefault();
      });
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      try { win.webContents.on("will-attach-webview", (e) => e.preventDefault()); } catch {}
      /* 渲染进程异常退出自愈：自动 reload（限 2 次），崩溃计入日志 */
      let reloadCount = 0;
      win.webContents.on("render-process-gone", (e, d) => {
        logErr("render-gone", JSON.stringify(d || {}));
        if (d && d.reason !== "clean-exit" && reloadCount < 2) {
          reloadCount++;
          setTimeout(() => { try { if (win) win.webContents.reload(); } catch {} }, 1500);
        }
      });
      /* 先壳后内容：DOM 就绪即显示（品牌加载界面立即可见），3D 首帧在遮罩后完成，感知响应亚秒级 */
      win.webContents.once("did-finish-load", () => {
        try { if (!win.isVisible()) { win.show(); win.focus(); } } catch {}
      });
      win.once("ready-to-show", () => {
        try { logErr("boot", "first paint in " + (Date.now() - BOOT_T0) + "ms"); } catch {}
        try { if (!win.isVisible()) { win.show(); win.focus(); } else { win.focus(); } } catch {}
      });
      /* 兜底：ready-to-show 未触发（极端情况）也强制显示 */
      setTimeout(() => { try { if (win && !win.isVisible()) { win.show(); win.focus(); } } catch {} }, 4000);

      win.on("close", (e) => {
        try { if (!win.isMinimized()) saveBounds(); } catch {}
        if (!quitting) {
          e.preventDefault();
          win.hide();
          if (!app.__minimizedOnce) {
            app.__minimizedOnce = true;
            try {
              new Notification({
                title: "AURELION 时光",
                body: "已最小化到托盘，闹钟与定时任务将持续生效。双击托盘图标可重新打开。",
                icon: nativeImage.createFromPath(path.join(__dirname, "..", "assets", "icon256.png")),
              }).show();
            } catch {}
          }
        }
      });
    } catch (e) {
      logErr("window", e);
      dialog.showErrorBox("AURELION 时光", "窗口创建失败：\n\n" + (e && e.message));
      app.quit();
    }
  };

  app.whenReady().then(() => {
    try { logErr("boot", "app ready in " + (Date.now() - BOOT_T0) + "ms"); } catch {}
    createWindow();
    createTray();
    /* ---------- 配置文件镜像（localStorage 双保险） ----------
       leveldb 延迟落盘 + 异常退出可能丢数据；所有 aurelion.* 配置同步镜像到
       userData/aurelion-config.json（防抖合并 + 原子写），启动时回填恢复 */
    const CFG = path.join(app.getPath("userData"), "aurelion-config.json");
    let cfgMap = {};
    try { cfgMap = JSON.parse(fs.readFileSync(CFG, "utf8")); if (typeof cfgMap !== "object" || !cfgMap) cfgMap = {}; } catch (e) { cfgMap = {}; }
    function persistCfg() {
      try {
        const tmp = CFG + ".tmp";
        fs.writeFileSync(tmp, JSON.stringify(cfgMap));
        fs.renameSync(tmp, CFG);
        /* 每周自动快照：防坏档/误删，滚动保留最近 3 份 */
        const now = Date.now();
        const lastSnap = parseInt(cfgMap.__lastSnap || "0", 10);
        if (now - lastSnap > 7 * 86400000) {
          cfgMap.__lastSnap = String(now);
          const dir = path.dirname(CFG);
          const d = new Date();
          const p2 = (n) => String(n).padStart(2, "0");
          const snapName = "aurelion-backup-" + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + ".json";
          fs.writeFileSync(path.join(dir, snapName), JSON.stringify(cfgMap));
          const snaps = fs.readdirSync(dir).filter((f) => /^aurelion-backup-\d{8}\.json$/.test(f)).sort();
          while (snaps.length > 3) { try { fs.unlinkSync(path.join(dir, snaps.shift())); } catch (err) { break; } }
        }
      } catch (err) { logErr("cfg-persist", err); }
    }
    ipcMain.on("save-kv", (e, patch) => {
      try {
        if (!patch || typeof patch !== "object") return;
        let changed = false;
        for (const [k, v] of Object.entries(patch)) {
          if (typeof k === "string" && k.indexOf("aurelion.") === 0 && typeof v === "string") { cfgMap[k] = v; changed = true; }
        }
        if (changed) persistCfg(); /* 立即原子落盘，防退出瞬间丢数据 */
      } catch (err) { logErr("cfg-save", err); }
    });
    ipcMain.on("restore-kv", (e) => {
      try { e.returnValue = cfgMap; } catch { e.returnValue = {}; }
    });
    /* 渲染端异常写入诊断日志 */
    ipcMain.on("renderer-error", (e, msg) => { logErr("renderer", String(msg || "")); });
    /* 窗口置顶切换（T 键），返回切换后的状态（sendSync 协议：必须设置 returnValue） */
    ipcMain.on("toggle-top", (e) => {
      try {
        if (!win) { e.returnValue = false; return; }
        const next = !win.isAlwaysOnTop();
        win.setAlwaysOnTop(next, "screen-saver");
        e.returnValue = next;
      } catch { e.returnValue = false; }
    });
    /* 权限请求拦截：仅放行系统通知 */
    try {
      session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => {
        cb(permission === "notifications");
      });
    } catch (e) { logErr("permission", e); }
    ipcMain.on("focus-app", () => {
      if (!win) return;
      if (!win.isVisible()) win.show();
      win.focus();
    });
    /* 响铃时任务栏闪烁 / 停止时恢复 */
    ipcMain.on("flash-frame", (e, v) => {
      try { if (win) win.flashFrame(!!v); } catch (err) { logErr("flash", err); }
    });
    /* 屏幕常亮（闹钟场景防息屏） */
    let psBlockerId = null;
    ipcMain.on("keep-awake", (e, v) => {
      try {
        if (v && !psBlockerId) psBlockerId = powerSaveBlocker.start("prevent-display-sleep");
        else if (!v && psBlockerId) { powerSaveBlocker.stop(psBlockerId); psBlockerId = null; }
      } catch (err) { logErr("keep-awake", err); }
    });
    /* 托盘 tooltip 显示下次提醒 */
    ipcMain.on("next-reminder", (e, text) => {
      try {
        const t = String(text || "");
        if (tray) tray.setToolTip(t && t !== "暂无提醒计划" ? "AURELION 时光 · " + t : "AURELION 时光 · 闹钟运行中");
      } catch {}
    });
    /* 开机自启 */
    ipcMain.on("set-login", (e, v) => {
      try {
        const args = app.isPackaged ? [] : [path.resolve(__dirname, "..")];
        app.setLoginItemSettings({ openAtLogin: !!v, path: process.execPath, args });
      } catch (err) { logErr("set-login", err); }
    });
    ipcMain.handle("get-login", () => {
      try { return app.getLoginItemSettings().openAtLogin; } catch { return false; }
    });
    /* 升级接口：渲染端可显式触发（preload AURELION_DESKTOP.checkUpdates） */
    ipcMain.handle("check-updates", () => checkForUpdates(true));
    /* 打包版启动 10s 后静默自检一次，此后每 24 小时一次；开发版不自动打扰 */
    if (app.isPackaged) {
      setTimeout(() => checkForUpdates(false), 10 * 1000);
      setInterval(() => checkForUpdates(false), 24 * 3600 * 1000);
    }
  });

  app.on("gpu-process-crashed", () => {
    gpuFails++;
    logErr("gpu", "gpu-process-crashed #" + gpuFails);
    if (gpuFails >= 2) {
      try { fs.writeFileSync(noGpuFile, String(Date.now())); } catch {}
      app.relaunch();
      app.quit();
    }
  });

  ["render-process-gone"].forEach((ev) => {
    app.on(ev, (e, d) => logErr(ev, JSON.stringify(d || {})));
  });

  app.on("before-quit", () => { quitting = true; saveBounds(); });
  app.on("window-all-closed", () => { /* 保持托盘常驻 */ });
  app.on("activate", () => { if (win) { win.show(); win.focus(); } });
}

/* ---------- 自检模式 ---------- */
if (process.env.WATCH_TEST) {
  setTimeout(() => {
    console.log("WATCH_ALIVE renderer=" + "ok");
    app.quit();
  }, Number(process.env.WATCH_TEST) || 6000);
}

process.on("uncaughtException", (e) => { logErr("uncaught", e); });
process.on("unhandledRejection", (e) => { logErr("rejection", e); });
