@echo off
REM =============================================
REM  Git Installation Check
REM =============================================

setlocal
cd /d "%~dp0"

echo.
echo =============================================
echo   Git Installation Check
echo =============================================
echo.

REM Check 1: git in PATH
echo [1/4] Checking if 'git' is in PATH...
where git >nul 2>nul
if errorlevel 1 (
    echo   [FAIL] Git NOT in PATH
) else (
    echo   [OK] Git found in PATH:
    where git
)

echo.
REM Check 2: version
echo [2/4] Checking git version...
git --version 2>nul
if errorlevel 1 (
    echo   [FAIL] Cannot run 'git --version'
) else (
    echo   [OK] Above output
)

echo.
REM Check 3: ssh
echo [3/4] Checking if 'ssh' is in PATH (for git_push.bat)...
where ssh >nul 2>nul
if errorlevel 1 (
    echo   [WARN] SSH not in PATH - push will fail
    echo   Install: Settings ^> Apps ^> Optional Features ^> OpenSSH Client
) else (
    echo   [OK] SSH available
)

echo.
REM Check 4: Common install locations
echo [4/4] Looking for git.exe in common locations...
set "FOUND=0"
if exist "C:\Program Files\Git\bin\git.exe" (
    echo   [FOUND] C:\Program Files\Git\bin\git.exe
    set "FOUND=1"
)
if exist "C:\Program Files (x86)\Git\bin\git.exe" (
    echo   [FOUND] C:\Program Files ^(x86^)\Git\bin\git.exe
    set "FOUND=1"
)
if exist "%LOCALAPPDATA%\Programs\Git\bin\git.exe" (
    echo   [FOUND] %LOCALAPPDATA%\Programs\Git\bin\git.exe
    set "FOUND=1"
)
if "%FOUND%"=="0" (
    echo   [NOT FOUND] Git not in standard locations
    echo.
    echo   If you see "Git in PATH OK" above, you can ignore this.
)

echo.
echo =============================================
echo   Summary
echo =============================================
where git >nul 2>nul
if errorlevel 1 (
    echo   Git is NOT properly installed or NOT in PATH.
    echo.
    echo   Install Git for Windows:
    echo     1. Open: https://git-scm.com/download/win
    echo     2. Download "64-bit Git for Windows Setup"
    echo     3. Run installer - IMPORTANT:
    echo        [x] Git from the command line and also from 3rd-party software
    echo        [x] Use the OpenSSL library
    echo        [x] Checkout Windows-style, commit Unix-style
    echo     4. Restart cmd/PowerShell after install
    echo.
    echo   Or via winget (Win 10/11):
    echo     winget install --id Git.Git -e --source winget
) else (
    echo   Git is properly installed.
    echo   Ready to run: git_push.bat
)
echo.
pause
