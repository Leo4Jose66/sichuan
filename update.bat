@echo off
REM =============================================
REM  One-click update from Mavis's zip
REM  Usage: Drag a new project-pulse.zip onto this file
REM         OR: update.bat <path-to-zip>
REM =============================================

setlocal
cd /d "%~dp0"

set "ZIP_PATH=%~1"
if "%ZIP_PATH%"=="" (
    echo.
    echo Usage:
    echo   1. Drag the new project-pulse.zip onto update.bat
    echo   2. OR run: update.bat C:\path\to\project-pulse.zip
    echo.
    pause
    exit /b 1
)

if not exist "%ZIP_PATH%" (
    echo [ERROR] File not found: %ZIP_PATH%
    pause
    exit /b 1
)

echo.
echo =============================================
echo   One-click Update
echo =============================================
echo.
echo Source: %ZIP_PATH%
echo Target: %CD%
echo.

REM Check git
where git >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Git not in PATH. Install: https://git-scm.com/download/win
    pause
    exit /b 1
)

REM Check we're in a git repo
git rev-parse --git-dir >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Not a git repo. Run git_push.bat first to set up.
    pause
    exit /b 1
)

REM Check for uncommitted changes
git diff --quiet 2>nul
if errorlevel 1 (
    echo [WARN] You have uncommitted local changes.
    echo These will be preserved, but if there's a conflict, you'll need to resolve.
    echo.
)

REM Extract zip to staging dir
set "STAGE_DIR=%TEMP%\project-pulse-update-%RANDOM%"
echo [1/5] Extracting to staging dir...
mkdir "%STAGE_DIR%" >nul 2>nul
powershell -NoProfile -Command "Expand-Archive -Path '%ZIP_PATH%' -DestinationPath '%STAGE_DIR%' -Force"
if errorlevel 1 (
    echo [ERROR] Failed to extract zip
    pause
    exit /b 1
)

REM Find the actual project dir (it might be wrapped in project-pulse/)
set "SRC_DIR=%STAGE_DIR%\project-pulse"
if not exist "%SRC_DIR%" (
    REM Try first directory in the zip
    for /d %%D in ("%STAGE_DIR%\*") do (
        set "SRC_DIR=%%D"
        goto :found_src
    )
)
:found_src

echo [2/5] Copying files...
xcopy /E /Y /Q /I "%SRC_DIR%\*" ".\" >nul
if errorlevel 1 (
    echo [ERROR] Failed to copy files
    pause
    exit /b 1
)

REM Cleanup
rmdir /S /Q "%STAGE_DIR%" >nul 2>nul

echo [3/5] Git staging...
git add -A

echo [4/5] Git commit...
set "MSG=Update from Mavis - %DATE% %TIME:~0,5%"
git commit -m "%MSG%" --allow-empty
if errorlevel 1 (
    echo [WARN] Nothing to commit
)

echo [5/5] Git push...
git push origin main
if errorlevel 1 goto :err

echo.
echo =============================================
echo   Update complete! Reload browser to see changes.
echo =============================================
echo.
pause
exit /b 0

:err
echo.
echo [ERROR] Git push failed. Common causes:
echo   1. SSH key not added to GitHub - run test_ssh.bat
echo   2. Network issue - check connection
echo   3. Merge conflict - run: git pull --rebase, then push
echo.
echo Files have been updated locally. Resolve the issue then run:
echo   git push origin main
echo.
pause
exit /b 1
