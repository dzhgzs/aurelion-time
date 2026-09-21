# GitHub 开源发布手册（照做即可）

本手册分四步：**① 替换仓库占位 → ② 上传源码建仓 → ③ 发布首个 Release → ④ 后续发版 SOP**。
全程约 15 分钟。仓库建议命名 `aurelion-time`（纯 ASCII，便于命令行与徽章）。

---

## 第 ① 步：替换仓库占位（1 分钟）

项目中占位用户名为 `aurelion`，请**全局替换为自己的 GitHub 用户名**（共两类位置）：

1. `package.json` — `repository` / `bugs` / `homepage` 三个字段的 URL
   （这是**应用内升级接口的数据源**，必须与实际仓库一致，否则升级检测将指向不存在的仓库）
2. `README.md` 头部徽章与链接中的 `github.com/dzhgzs/aurelion-time`

> 快速验证：在项目根目录执行 `findstr /s /i "aurelion/aurelion-time" *.json *.md`（PowerShell），
> 确认替换后只剩你自己的用户名。

---

## 第 ② 步：上传源码建仓

### 方式 A：网页直传（无需安装 git，推荐首次）

1. 登录 github.com → 右上角 **＋ → New repository**
   - Repository name：`aurelion-time`
   - 可见性：**Public**（开源）
   - ⚠️ **不要勾选** Add a README / .gitignore / License（项目里已自带，勾选会造成冲突）
   - 点击 **Create repository**

2. 在新仓库页面点 **uploading an existing file**，然后拖入以下内容：

   **根目录文件（逐一拖入或框选）：**
   ```
   index.html
   package.json
   package-lock.json
   README.md
   LICENSE
   CHANGELOG.md
   CONTRIBUTING.md
   SECURITY.md
   .gitignore
   .gitattributes
   启动 AURELION 时光.bat
   test-r6.js
   test-r7.js
   ```

   **文件夹（整个拖入，GitHub 会自动展开）：**
   ```
   js\        （app.js / clock.js / lunar.js / vendor\three.min.js）
   electron\  （main.js / preload.js）
   assets\    （图标）
   .github\   （workflows\release.yml + ISSUE_TEMPLATE 模板）
   docs\      （PUBLISH.md 发布手册 + SYSTEM-REQS.md 系统说明书，可选）
   ```

   ⚠️ **绝不要拖入**：`node_modules\`、`release\`、`crash.log`、`.no-gpu`、`.agnes\`、`备用 · 以应用窗口打开（Edge）.bat`
   （本机产物/内部文件；`.gitignore` 已为 git 方式自动排除，网页直传不识别它，所以必须手动避开）

3. 底部 Commit message 填 `feat: open source v1.4.4` → 点 **Commit changes**。
   上传完成后 GitHub 会自动把 LICENSE 识别为 **MIT**，仓库语言标记为 JavaScript。

### 方式 B：git 命令行（推荐长期维护，需先安装 Git for Windows）

```powershell
# 安装 git 后，在 E:\腕表 下执行：
git init
git add .
git commit -m "feat: open source v1.4.4"
git branch -M main
git remote add origin https://github.com/<你的用户名>/aurelion-time.git
git push -u origin main
```

`.gitignore` 已排除 `node_modules\`、`release\`、`crash.log`、`.agnes\` 等，`git add .` 不会带入。

---

## 第 ③ 步：发布首个 Release（v1.4.4）

### 方式 A：本地已有构建产物（本机 `release\` 已就绪，直接传）

1. 仓库页 → **Releases → Create a new release**
2. Tag：输入 `v1.4.4`（选 "Create new tag on publish"）
3. 标题填 `AURELION 时光 v1.4.4`；描述可从 CHANGELOG.md 复制
4. 拖入三个产物：
   - `AURELION时光-便携版.exe`
   - `AURELION时光-安装程序.exe`
   - `AURELION时光-绿色版.zip`
5. 点 **Publish release**

### 方式 B：让 GitHub Actions 自动构建（推荐，跨平台可复现）

网页直传完成后，进入 **Actions** 页签 → 若提示 workflow 权限，按提示启用 →
**Releases 工作流 → Run workflow**（手动跑一次验证构建通过）。
之后每次推 `v*` 标签会**自动构建三形态并发布 Release**（`release.yml`）。

---

## 第 ④ 步：后续发版 SOP（升级接口已对接）

1. 改功能 → `node --check` + 探针自检（见 CONTRIBUTING.md）
2. 更新 `CHANGELOG.md`（新增版本条目）
3. 改 `package.json` 的 `version`（例如 `1.4.0`）
4. 网页方式：仓库页 → Releases → Draft new release → 新 tag `v1.4.4` → 拖产物 → Publish
   git 方式：`git tag v1.4.4 && git push origin v1.4.4` → Actions 自动构建发布
5. **用户端自动感知**：已安装的应用会在启动后 10 秒或每 24 小时读 Releases/latest，
   发现 `tag` 版本号 > 当前版本即弹窗「发现新版本」→ 跳转发布页下载覆盖安装（配置数据保留）。
   也可托盘右键 →「检查更新」立即检测。

> 升级接口实现位置：`electron/main.js` 的 `checkForUpdates()`（主进程发起，只读 API，
> 8 秒超时、离线静默），渲染端预留 `AURELION_DESKTOP.checkUpdates()` 可在 UI 中调用。

---

## 仓库设置清单（建仓后 5 分钟）

- [ ] About（⚙ 齿轮）描述：`⌚ 3D mechanical watch + alarms · Electron · three.js · lunar calendar`
- [ ] Topics 建议：`electron` `threejs` `alarm-clock` `pomodoro` `lunar-calendar` `world-clock` `windows` `offline`
- [ ] Website（可选）：填 Releases 页地址
- [ ] Releases 页签确认三产物已挂载、tag 为 `v1.4.4`
- [ ] （可选）Settings → General → 勾选 Issues；多人协作再开 Discussions/保护分支

## 隐私自查（已完成 ✅）

- 源码无任何密钥/令牌/账号信息
- `.gitignore` 排除：`node_modules\` `release\` `crash.log` `.no-gpu` `.agnes\`
- 网页直传时按第 ② 步清单操作即不会带入本机文件
