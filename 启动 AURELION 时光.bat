@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo [AURELION 时光] 首次运行，正在准备运行环境（需联网，约 1-2 分钟）...
  call npm install --no-audit --no-fund
)
if not exist "node_modules\electron\dist\electron.exe" (
  echo [AURELION 时光] 环境安装失败，请检查网络后重试；也可双击 index.html 在浏览器中使用。
  timeout /t 4 >nul
  exit /b 1
)
start "" "%~dp0node_modules\electron\dist\electron.exe" "%~dp0."
