@echo off
REM =============================================
REM  SSH Connection Test - Project Pulse
REM  Use this BEFORE pushing to verify SSH key is set up
REM =============================================

setlocal
cd /d "%~dp0"

echo.
echo =============================================
echo   SSH Connection Test
echo =============================================
echo.

where ssh >nul 2>nul
if errorlevel 1 (
    echo [ERROR] SSH not found. Install OpenSSH:
    echo   Settings ^> Apps ^> Optional Features ^> Add ^> OpenSSH Client
    pause
    exit /b 1
)

echo [1/3] Checking if SSH key exists...
if exist "%USERPROFILE%\.ssh\id_ed25519" (
    echo   [OK] Found: %USERPROFILE%\.ssh\id_ed25519
) else if exist "%USERPROFILE%\.ssh\id_rsa" (
    echo   [OK] Found: %USERPROFILE%\.ssh\id_rsa
) else (
    echo   [WARN] No SSH key found in %USERPROFILE%\.ssh\
    echo.
    echo   To generate one:
    echo     ssh-keygen -t ed25519 -C "your_email@example.com"
    echo.
    echo   Then add the PUBLIC key to GitHub:
    echo     type %USERPROFILE%\.ssh\id_ed25519.pub
    echo     (copy output, paste at https://github.com/settings/keys)
    echo.
    pause
    exit /b 1
)

echo.
echo [2/3] Public key fingerprint:
if exist "%USERPROFILE%\.ssh\id_ed25519.pub" (
    type "%USERPROFILE%\.ssh\id_ed25519.pub"
) else if exist "%USERPROFILE%\.ssh\id_rsa.pub" (
    type "%USERPROFILE%\.ssh\id_rsa.pub"
)

echo.
echo [3/3] Testing GitHub SSH connection...
echo   (If it hangs, press Ctrl+C and check your key)
echo.

ssh -T -o StrictHostKeyChecking=accept-new git@github.com 2>&1

echo.
echo =============================================
echo   If you see "Hi Leo4Jose66!" or similar,
echo   your SSH key is correctly set up!
echo =============================================
echo.
pause
