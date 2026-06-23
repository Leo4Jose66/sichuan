# ============================================
#   Project Pulse · 本地部署 (PowerShell)
#   用法: .\start.ps1
# ============================================

$ErrorActionPreference = 'Stop'
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Port = 8765

Write-Host ""
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Project Pulse  -  启动中..." -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# 检查 Python
try {
    $pyVersion = python --version 2>&1
    Write-Host "[OK] $pyVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] 未检测到 Python,请先安装 Python 3.10+" -ForegroundColor Red
    Write-Host "  下载: https://www.python.org/downloads/" -ForegroundColor Yellow
    Write-Host "  安装时务必勾选 'Add Python to PATH'" -ForegroundColor Yellow
    Read-Host "按 Enter 退出"
    exit 1
}

# 检查依赖
$fastapiCheck = python -c "import fastapi" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "[INFO] 首次启动,正在安装依赖..." -ForegroundColor Yellow
    python -m pip install -r "$ScriptDir\backend\requirements.txt"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] 依赖安装失败" -ForegroundColor Red
        Read-Host "按 Enter 退出"
        exit 1
    }
}
Write-Host "[OK] 依赖已就绪" -ForegroundColor Green

# 检查前端
if (-not (Test-Path "$ScriptDir\frontend\index.html")) {
    Write-Host "[ERROR] 前端文件缺失: $ScriptDir\frontend\" -ForegroundColor Red
    Read-Host "按 Enter 退出"
    exit 1
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host "  服务即将启动" -ForegroundColor Green
Write-Host "  ----------------------------------------" -ForegroundColor Green
Write-Host "  看板:     http://localhost:$Port" -ForegroundColor White
Write-Host "  API 文档:  http://localhost:$Port/docs" -ForegroundColor White
Write-Host "  ----------------------------------------" -ForegroundColor Green
Write-Host "  按 Ctrl+C 停止" -ForegroundColor Yellow
Write-Host "=============================================" -ForegroundColor Green
Write-Host ""

# 启动
$env:PYTHONPATH = "$ScriptDir\backend"
Set-Location "$ScriptDir\backend"
python -m uvicorn app.main:app --host 0.0.0.0 --port $Port
