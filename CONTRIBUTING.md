# 参与贡献

感谢关注 AURELION 时光！欢迎提交 Issue 与 Pull Request。

## 开发环境

- Node.js 18+（Windows 10/11 或 macOS）
- 本仓库根目录执行 `npm install` 安装 Electron 33 与 electron-builder
- 国内网络如 Electron 二进制下载缓慢，先设镜像再安装：
  ```powershell
  $env:ELECTRON_MIRROR = "https://npmmirror.com/mirrors/electron/"
  npm install --no-audit --no-fund
  ```
- 启动开发版：`npm start`（或直接 `.\node_modules\electron\dist\electron.exe .`）
- 直接双击 `index.html` 也可在浏览器模式运行（无托盘常驻）

## 架构速览

**无构建步骤、纯原生 JS**，改完即生效：

```
index.html            界面结构 + 全部样式（含 CSP）
js/app.js             3D 腕表：程序化建模 / 灯光 / 交互 / 调时 / 性能自适应
js/clock.js           时间助手：闹钟 / 世界时钟 / 秒表 / 倒计时 / 任务 / 响铃 / 持久化
js/lunar.js           农历与节假日引擎（1900–2100，含 2027+ 法定假日兜底）
electron/main.js      主进程：托盘 / 窗口管理 / 配置镜像 / GPU 自愈 / 升级接口
electron/preload.js   contextBridge 最小能力暴露
```

约定：

- 模块通过 `window.AURELION_*` 命名空间通信（`AURELION_TOAST` / `AURELION_DESKTOP` / `AURELION_PARSE` 等）。
- 所有用户配置持久化键必须以 `aurelion.` 开头，并走 `save()` 双写（localStorage + 主进程文件镜像）。
- 渲染端禁止引入 Node 能力，仅通过 preload 暴露的最小 IPC 通信。

## 提交前自检

```powershell
node --check js\app.js; node --check js\clock.js; node --check js\lunar.js
node --check electron\main.js; node --check electron\preload.js
```

- 逻辑改动建议用临时探针验证（`test-r7.js` 是现成范例：require 真实 main.js + executeJavaScript 断言 + 收集 console 错误）。
- 探针若污染了用户配置（如 lastTab/铃音），**必须还原**。

## Pull Request 规范

1. 一个 PR 聚焦一件事；UI 改动请附截图。
2. 新功能在 README「时间助手 / 智能特性」章节补充一句话说明。
3. 用户可见的行为变更同步到 `CHANGELOG.md`（参考现有条目格式）。
4. 版本升级仅在维护者发布时执行（改 `package.json` 的 `version` + 打 tag）。

## Issue 反馈

- Bug 请附：操作系统与版本号（应用标题栏/托盘 tooltip 可见）、复现步骤、`crash.log` 相关片段（打包版位于 `%APPDATA%\AURELION 时光\crash.log`）。
- 功能建议欢迎描述使用场景，智能输入类建议请附期望的输入/输出示例。
