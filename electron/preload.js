/* AURELION 时光 · 预加载桥（安全暴露最小能力给页面） */
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("AURELION_DESKTOP", {
  isDesktop: true,
  /** 闹钟响铃时把窗口带到前台 */
  focus: () => ipcRenderer.send("focus-app"),
  /** 屏幕常亮开关（闹钟场景防息屏） */
  setKeepAwake: (v) => ipcRenderer.send("keep-awake", !!v),
  /** 响铃时任务栏闪烁（true 闪烁 / false 恢复） */
  flash: (v) => ipcRenderer.send("flash-frame", !!v),
  /** 把「下次提醒」文本推给主进程（托盘 tooltip） */
  setNext: (text) => ipcRenderer.send("next-reminder", String(text || "")),
  /** 开机自启开关 */
  setLogin: (v) => ipcRenderer.send("set-login", !!v),
  /** 开机自启查询 */
  getLogin: () => ipcRenderer.invoke("get-login"),
  /** 配置文件镜像：保存补丁（键名须以 aurelion. 开头，值为字符串） */
  saveKV: (patch) => ipcRenderer.send("save-kv", patch),
  /** 启动时同步取回配置镜像（对象），用于 localStorage 丢失时回填 */
  restoreKV: () => { try { return ipcRenderer.sendSync("restore-kv") || {}; } catch { return {}; } },
  /** 窗口置顶切换（返回切换后的状态） */
  toggleTop: () => { try { return ipcRenderer.sendSync("toggle-top"); } catch { return false; } },
  /** 渲染端异常写入诊断日志 */
  logError: (msg) => ipcRenderer.send("renderer-error", String(msg || "")),
  /** 升级接口：触发一次「检查更新」（主进程读取 GitHub Releases，返回结果代号） */
  checkUpdates: () => ipcRenderer.invoke("check-updates"),
  /** 升级状态推送（自定义更新弹窗）：返回取消订阅函数 */
  onUpdateStatus: (cb) => {
    const h = (_e, payload) => { try { cb(payload); } catch {} };
    ipcRenderer.on("aurelion:update-status", h);
    return () => ipcRenderer.removeListener("aurelion:update-status", h);
  },
  /** 全屏切换（原生窗口全屏，返回是否处于全屏） */
  toggleFullscreen: () => { try { return ipcRenderer.sendSync("fullscreen-toggle"); } catch { return false; } },
  /** 查询全屏状态 */
  isFullscreen: () => { try { return ipcRenderer.sendSync("fullscreen-state"); } catch { return false; } },
  /** 全屏状态变化推送（fsBtn 高亮同步）：返回取消订阅函数 */
  onFullscreen: (cb) => {
    const h = (_e, on) => { try { cb(!!on); } catch {} };
    ipcRenderer.on("aurelion:fullscreen", h);
    return () => ipcRenderer.removeListener("aurelion:fullscreen", h);
  },
  /** 打开外部链接（建议 / BUG 反馈 → GitHub Issues；主进程白名单校验后走系统浏览器） */
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
});
