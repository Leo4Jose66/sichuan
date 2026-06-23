@echo off
REM =============================================
REM  Project Pulse - Dev Mode (auto-reload)
REM  Use during development - restarts on code change
REM  For production use start.bat
REM =============================================

setlocal
set "SCRIPT_DIR=%~dp0"
set "PORT=8765"

echo.
echo =============================================
echo   Project Pulse - DEV MODE (auto-reload)
echo =============================================
echo.
echo   Code changes will auto-reload the server.
echo   Frontend: hard refresh browser (Ctrl+Shift+R)
echo   to see HTML/CSS/JS changes.
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python not in PATH.
    pause
    exit /b 1
)

set "PYTHONPATH=%SCRIPT_DIR%backend"
cd /d "%SCRIPT_DIR%backend"

set NO_PROXY=*
set NO_PROXY=onebox.huawei.com,*.huawei.com,127.0.0.1,localhost,10.*,172.16.*,172.17.*,172.18.*,172.19.*,172.20.*,172.21.*,172.22.*,172.23.*,172.24.*,172.25.*,172.26.*,172.27.*,172.28.*,172.29.*,172.30.*,172.31.*,192.168.*

echo [INFO] Starting with --reload (watches backend/ for changes)...
echo.
python -m uvicorn app.main:app --host 0.0.0.0 --port %PORT% --reload --reload-dir app

echo.
echo Server stopped.
pause
