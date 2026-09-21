# 安全策略

## 受支持版本

| 版本 | 支持状态 |
|------|----------|
| 1.3.x | ✅ 当前维护 |
| < 1.3.0 | ❌ 请升级 |

## 报告漏洞

请**不要**以公开 Issue 的形式提交安全漏洞。

优先使用 GitHub 的「Report a vulnerability」（Security Advisories 私密通道）；若仓库未开启，可开一个 Issue 只写「安全报告请联系」并附联系方式，由维护者私下跟进。收到报告后会在 7 天内响应并给出修复计划。

## 应用安全设计（供审计参考）

- **渲染沙箱**：`sandbox: true`、`contextIsolation: true`、`nodeIntegration: false`、拒绝 `will-attach-webview`。
- **页面 CSP**：`default-src 'self'; script-src 'self'`（无 unsafe-eval），阻止远程脚本与外联。
- **导航封锁**：`will-navigate` 仅允许 `file:`，`setWindowOpenHandler` 拒绝一切弹窗。
- **权限拦截**：`setPermissionRequestHandler` 仅放行系统通知。
- **IPC 校验**：配置镜像只接受 `aurelion.` 前缀的字符串键值；升级接口为只读的 Releases 查询。
- **外链**：唯一外跳是「发现新版本」跳转 GitHub Releases 页（`shell.openExternal`）。
- **数据**：全部配置保存在本机（`%APPDATA%\AURELION 时光\`），无遥测、无账号体系、离线可用。

## 升级接口说明

应用内「检查更新」读取 `package.json → repository` 指向仓库的 GitHub Releases API（只读，未认证，8 秒超时），仅在主进程发起（不受页面 CSP 限制），失败静默。应用本身不做自安装，用户在发布页手动下载覆盖安装，配置数据跨版本保留。
