@echo off
REM =============================================
REM  Apply Patch - Smaller updates via unified diff
REM  Usage: apply_patch.bat update-20260623.patch
REM =============================================

setlocal
cd /d "%~dp0"

set "PATCH_FILE=%~1"
if "%PATCH_FILE%"=="" (
    echo.
    echo Usage:
    echo   apply_patch.bat path\to\update.patch
    echo.
    echo A patch file contains only the changes (not full project).
    echo Much smaller than a zip for incremental updates.
    echo.
    pause
    exit /b 1
)

if not exist "%PATCH_FILE%" (
    echo [ERROR] File not found: %PATCH_FILE%
    pause
    exit /b 1
)

echo.
echo =============================================
echo   Apply Patch
echo =============================================
echo.
echo Patch: %PATCH_FILE%
echo.

where git >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Git not in PATH
    pause
    exit /b 1
)

git rev-parse --git-dir >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Not a git repo. Run git_push.bat first.
    pause
    exit /b 1
)

echo [1/4] Checking if patch applies cleanly...
git apply --check "%PATCH_FILE%" 2>nul
if errorlevel 1 (
    echo [ERROR] Patch cannot be applied. Possible causes:
    echo   1. Local changes conflict with patch
    echo   2. Different base version
    echo.
    echo Try: stash your local changes first:
    echo   git stash
    echo   apply_patch.bat %PATCH_FILE%
    echo   git stash pop
    pause
    exit /b 1
)
echo   [OK] Patch applies cleanly

echo [2/4] Applying patch...
git apply "%PATCH_FILE%"
if errorlevel 1 (
    echo [ERROR] Apply failed
    pause
    exit /b 1
)

echo [3/4] Committing...
git add -A
git commit -m "Apply patch: %PATCH_FILE%"
if errorlevel 1 (
    echo [WARN] Nothing to commit
)

echo [4/4] Pushing...
git push origin main
if errorlevel 1 (
    echo.
    echo [ERROR] Push failed. Resolve and run:
    echo   git push origin main
    pause
    exit /b 1
)

echo.
echo =============================================
echo   Patch applied and pushed!
echo =============================================
echo.
pause
