# =============================================
#  Git Push Script - Project Pulse (PowerShell)
# =============================================

param(
    [string]$RemoteUrl = "git@github.com:Leo4Jose66/sichuan.git",
    [string]$Branch = "main",
    [string]$CommitMessage = "Initial commit: Project Pulse with cloud sync"
)

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "============================================="
Write-Host "  Git Push - Project Pulse"
Write-Host "============================================="
Write-Host ""
Write-Host "Remote: $RemoteUrl"
Write-Host "Branch: $Branch"
Write-Host ""

# Check git
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "[ERROR] Git not found. Install from https://git-scm.com/" -ForegroundColor Red
    pause
    exit 1
}
Write-Host "[OK] Git installed" -ForegroundColor Green

# Init if needed
if (-not (Test-Path ".git")) {
    Write-Host "[INFO] Initializing git repo..." -ForegroundColor Cyan
    git init -b $Branch
    if ($LASTEXITCODE -ne 0) { pause; exit 1 }
}

# Set remote
$existing = git remote get-url origin 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "[INFO] Adding remote..." -ForegroundColor Cyan
    git remote add origin $RemoteUrl
} else {
    Write-Host "[INFO] Existing remote: $existing" -ForegroundColor Cyan
    git remote set-url origin $RemoteUrl
}

# Add .gitkeep to uploads
if (-not (Test-Path "backend/data/uploads/.gitkeep")) {
    "" | Out-File "backend/data/uploads/.gitkeep" -Encoding utf8
}

# Add files
Write-Host ""
Write-Host "[1/4] Adding files..." -ForegroundColor Cyan
git add .gitignore backend frontend *.bat *.ps1 *.sh *.md docker-compose.yml

# Commit
Write-Host ""
Write-Host "[2/4] Committing..." -ForegroundColor Cyan
git commit -m "$CommitMessage"
if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] Nothing to commit or commit failed" -ForegroundColor Yellow
}

# Pull
Write-Host ""
Write-Host "[3/4] Pulling (if remote has files)..." -ForegroundColor Cyan
git pull --rebase --allow-unrelated-histories origin $Branch 2>$null

# Push
Write-Host ""
Write-Host "[4/4] Pushing to $Branch..." -ForegroundColor Cyan
git push -u origin $Branch
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ERROR] Push failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Common fixes:" -ForegroundColor Yellow
    Write-Host "  1. Auth: use Personal Access Token as password (HTTPS)"
    Write-Host "  2. Or: ssh-keygen -t ed25519 then add to GitHub/GitLab (SSH)"
    Write-Host "  3. Force: git push -f origin $Branch (if remote has unwanted files)"
    pause
    exit 1
}

Write-Host ""
Write-Host "============================================="
Write-Host "  Push successful!" -ForegroundColor Green
Write-Host "============================================="
Write-Host ""
pause
