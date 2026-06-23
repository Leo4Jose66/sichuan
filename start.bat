@echo off
REM Project Pulse launcher (ASCII only, no cmd redirects)

setlocal
set "SCRIPT_DIR=%~dp0"
set "PORT=8765"

echo.
echo =============================================
echo   Project Pulse - Local Server
echo =============================================
echo.
echo Working dir: %SCRIPT_DIR%
echo.
pause

REM ----- Check Python -----
where python >nul 2>nul
if errorlevel 1 (
    echo.
    echo [ERROR] Python not in PATH.
    echo Install Python 3.10+ and CHECK "Add Python to PATH":
    echo   https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)

python -c "import sys; print('[OK] Python', sys.version.split()[0])"

REM ----- Check fastapi -----
python -c "import fastapi" 1>nul 2>nul
if errorlevel 1 (
    echo.
    echo [INFO] Installing dependencies, please wait...
    python -m pip install -r "%SCRIPT_DIR%backend\requirements.txt"
    if errorlevel 1 (
        echo.
        echo [ERROR] pip install failed.
        echo Run manually:
        echo   python -m pip install -r "%SCRIPT_DIR%backend\requirements.txt"
        echo.
        pause
        exit /b 1
    )
)
echo [OK] Dependencies ready

REM ----- Check frontend -----
if not exist "%SCRIPT_DIR%frontend\index.html" (
    echo.
    echo [ERROR] Frontend missing: %SCRIPT_DIR%frontend\
    echo.
    pause
    exit /b 1
)
echo [OK] Frontend files ready

echo.
echo =============================================
echo   Server starting on port %PORT%
echo   ----------------------------------------
echo   Dashboard: http://localhost:%PORT%
echo   API docs:  http://localhost:%PORT%/docs
echo   Press Ctrl+C to stop
echo =============================================
echo.

set "PYTHONPATH=%SCRIPT_DIR%backend"
cd /d "%SCRIPT_DIR%backend"

REM ----- Network: NO_PROXY bypasses system proxy for internal URLs -----
set NO_PROXY=*
set NO_PROXY=onebox.huawei.com,*.huawei.com,127.0.0.1,localhost,10.*,172.16.*,172.17.*,172.18.*,172.19.*,172.20.*,172.21.*,172.22.*,172.23.*,172.24.*,172.25.*,172.26.*,172.27.*,172.28.*,172.29.*,172.30.*,172.31.*,192.168.*

python -m uvicorn app.main:app --host 0.0.0.0 --port %PORT%

echo.
echo Server stopped.
pause
