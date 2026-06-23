@echo off
REM =============================================
REM  Git Push Script - Project Pulse
REM  Version: 2026-06-23-3 (auto-detect git + cd fix)
REM =============================================

setlocal
set "SCRIPT_VER=2026-06-23-3"

echo.
echo =============================================
echo   Project Pulse - Git Push
echo   Script version: %SCRIPT_VER%
echo =============================================

REM CRITICAL: cd to script's own directory (may be different from current dir)
set "SCRIPT_DIR=%~dp0"
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"
cd /d "%SCRIPT_DIR%"
if errorlevel 1 (
    echo [ERROR] Cannot cd to script directory: %SCRIPT_DIR%
    pause
    exit /b 1
)

echo Working dir: %CD%
echo.

REM ============ Fill in your info here ============
REM Example: https://github.com/yourname/project-pulse.git
set "REMOTE_URL=git@github.com:Leo4Jose66/sichuan.git"

REM Branch name (master or main)
set "BRANCH=main"

REM Commit message
set "COMMIT_MSG=Initial commit: Project Pulse with cloud sync"

REM If using HTTPS with PAT/password, set it here (will be cached after first push)
REM set "GIT_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx"
REM ============ End of config ============

echo.
echo =============================================
echo   Git Push - Project Pulse
echo =============================================
echo.
echo Remote:  %REMOTE_URL%
echo Branch:  %BRANCH%
echo.

REM Find correct git.exe (cmd\git.exe is a wrapper, use bin\git.exe or mingw64\bin\git.exe instead)
set "GIT_EXE="
for %%P in ("%ProgramFiles%\Git\bin\git.exe" "%ProgramFiles(x86)%\Git\bin\git.exe" "%ProgramFiles%\Git\mingw64\bin\git.exe" "%ProgramFiles(x86)%\Git\mingw64\bin\git.exe" "%LOCALAPPDATA%\Programs\Git\bin\git.exe" "C:\Tools\PortableGit\bin\git.exe") do (
    if exist "%%~P" if not defined GIT_EXE set "GIT_EXE=%%~P"
)
REM If none of the standard locations found, try where git
if not defined GIT_EXE (
    for /f "delims=" %%G in ('where git 2^>nul') do (
        if exist "%%G" if not defined GIT_EXE set "GIT_EXE=%%G"
    )
)
if not defined GIT_EXE (
    echo.
    echo [ERROR] Git not found. Please install:
    echo   https://git-scm.com/download/win
    echo.
    set /p "GIT_EXE=Or enter full path to git.exe manually: "
    if "%GIT_EXE%"=="" (
        pause
        exit /b 1
    )
    if not exist "%GIT_EXE%" (
        echo [ERROR] File not found: %GIT_EXE%
        pause
        exit /b 1
    )
)
REM Test it works
"%GIT_EXE%" --version >nul 2>nul
if errorlevel 1 (
    echo [ERROR] This git.exe doesn't work: %GIT_EXE%
    pause
    exit /b 1
)
REM Add its directory to PATH so git just works
for %%I in ("%GIT_EXE%") do set "GIT_DIR=%%~dpI"
set "PATH=%GIT_DIR%;%PATH%"
echo [OK] Using git at: %GIT_EXE%
"%GIT_EXE%" --version

REM Clear git env vars that could confuse git init
set "GIT_DIR="
set "GIT_WORK_TREE="
set "GIT_INDEX_FILE="
set "GIT_TEMPLATE_DIR="
set "GIT_COMMON_DIR="

REM Init if needed
if not exist ".git" (
    echo [INFO] Initializing git repo in: %CD%
    if exist "%SCRIPT_DIR%\.gitignore" (
        echo   [OK] .gitignore found
    ) else (
        echo   [WARN] No .gitignore - this may not be a project-pulse directory
    )
    REM Use -c init.templateDir= to skip template copy (avoids permission bug)
    git -c init.templateDir= init -b %BRANCH%
    if errorlevel 1 goto :err
)

REM Check remote
git remote get-url origin >nul 2>nul
if errorlevel 1 (
    echo [INFO] Adding remote: %REMOTE_URL%
    git remote add origin %REMOTE_URL%
) else (
    echo [INFO] Remote already set:
    git remote -v
)

REM Add .gitkeep to uploads so folder is tracked
if not exist "backend\data\uploads\.gitkeep" (
    echo. > backend\data\uploads\.gitkeep
)

echo.
echo [1/4] Adding files...
git add .gitignore backend frontend *.bat *.ps1 *.sh *.md docker-compose.yml 2>nul
if errorlevel 1 goto :err

echo.
echo [2/4] Committing...
git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
    echo.
    echo [WARN] Nothing to commit or commit failed. Continue anyway...
)

echo.
echo [3/4] Setting upstream and pulling (in case remote has files)...
git branch --set-upstream-to=origin/%BRANCH% 2>nul
git pull --rebase --allow-unrelated-histories origin %BRANCH%
if errorlevel 1 (
    echo.
    echo [WARN] Pull failed. If this is a new repo, this is normal. Continue...
)

echo.
echo [4/4] Pushing to %BRANCH%...
git push -u origin %BRANCH%
if errorlevel 1 goto :err

echo.
echo =============================================
echo   Push successful!
echo =============================================
echo.
pause
exit /b 0

:err
echo.
echo [ERROR] Git command failed. See messages above.
echo.
echo Common issues:
echo   1. Authentication failed - configure credentials:
echo        HTTPS: use Personal Access Token as password
echo        SSH:   ssh-keygen -t ed25519, add to GitHub/GitLab
echo   2. Remote already has files - use: git push -f origin main
echo   3. Branch name mismatch - check if main or master
echo.
pause
exit /b 1
