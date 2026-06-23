@echo off
REM =============================================
REM  Docker Quick Start - Project Pulse (Windows)
REM  Usage: double-click docker_start.bat
REM =============================================

setlocal
cd /d "%~dp0"

echo.
echo =============================================
echo   Project Pulse - Docker Quick Start
echo =============================================
echo.

REM Check Docker
where docker >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Docker not found. Install:
    echo   https://www.docker.com/products/docker-desktop/
    pause
    exit /b 1
)
echo [OK] Docker installed

REM Check if Docker is running
docker info >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Docker is not running. Start Docker Desktop first.
    pause
    exit /b 1
)
echo [OK] Docker is running

REM Check if compose is available (v2 is preferred)
docker compose version >nul 2>nul
if errorlevel 1 (
    docker-compose --version >nul 2>nul
    if errorlevel 1 (
        echo [ERROR] Docker Compose not found.
        echo   Install Docker Desktop (includes Compose v2).
        pause
        exit /b 1
    ) else (
        set "COMPOSE=docker-compose"
        echo [OK] Using docker-compose v1
    )
) else (
    set "COMPOSE=docker compose"
    echo [OK] Using docker compose v2
)
echo.

REM Menu
:menu
echo Select action:
echo   1. Start (build + run)
echo   2. Start (rebuild from scratch)
echo   3. Stop
echo   4. View logs
echo   5. Restart
echo   6. Clean (stop + remove container + volume - DELETES DATA!)
echo   7. Open browser
echo   8. Exit
echo.
set /p "CHOICE=Choice (1-8): "

if "%CHOICE%"=="1" goto :start
if "%CHOICE%"=="2" goto :rebuild
if "%CHOICE%"=="3" goto :stop
if "%CHOICE%"=="4" goto :logs
if "%CHOICE%"=="5" goto :restart
if "%CHOICE%"=="6" goto :clean
if "%CHOICE%"=="7" goto :browser
if "%CHOICE%"=="8" exit /b 0
goto :menu

:start
echo.
echo [1/3] Building image...
%COMPOSE% build
if errorlevel 1 goto :err

echo.
echo [2/3] Starting container...
%COMPOSE% up -d
if errorlevel 1 goto :err

echo.
echo [3/3] Waiting for health check (up to 60s)...
set /a "WAITED=0"
:wait_loop
%COMPOSE% ps | findstr "healthy" >nul 2>nul
if not errorlevel 1 (
    echo [OK] Container is healthy!
    goto :ready
)
set /a "WAITED+=5"
if %WAITED% GEQ 60 (
    echo [WARN] Health check timeout, but container may still be starting
    goto :ready
)
echo   waiting... %WAITED%s
timeout /t 5 /nobreak >nul
goto :wait_loop

:ready
echo.
echo =============================================
echo   Project Pulse is running!
echo   Open: http://localhost:8765
echo =============================================
echo.
set /p "OPEN=Open browser now? (y/n): "
if /i "%OPEN%"=="y" start http://localhost:8765
goto :menu

:rebuild
echo.
echo [1/2] Removing old container...
%COMPOSE% down
echo [2/2] Rebuilding from scratch...
%COMPOSE% build --no-cache
%COMPOSE% up -d
echo.
echo Done. Visit http://localhost:8765
goto :menu

:stop
echo.
echo Stopping container...
%COMPOSE% down
echo Done.
goto :menu

:logs
echo.
echo Showing logs (Ctrl+C to exit)...
%COMPOSE% logs -f
goto :menu

:restart
echo.
echo Restarting...
%COMPOSE% restart
echo Done.
goto :menu

:clean
echo.
echo =============================================
echo   WARNING: This deletes ALL data!
echo =============================================
set /p "CONFIRM=Type 'DELETE' to confirm: "
if not "%CONFIRM%"=="DELETE" (
    echo Cancelled.
    goto :menu
)
%COMPOSE% down -v
docker volume rm project-pulse-data 2>nul
echo Done. All data deleted.
goto :menu

:browser
start http://localhost:8765
goto :menu

:err
echo.
echo [ERROR] Command failed. See output above.
pause
exit /b 1
