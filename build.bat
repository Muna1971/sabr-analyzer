@echo off
title Sabr v5.0 Build

echo.
echo =============================================
echo    Sabr v5.0 - Building Windows Installer
echo =============================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
    echo Please install from https://nodejs.org
    pause
    exit /b 1
)

echo [OK] Node.js found
node --version
echo.

if not exist "node_modules" (
    echo [1/3] Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed!
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed
) else (
    echo [OK] Dependencies already installed
)

echo.
echo [2/3] Building Windows installer...
echo This may take 2-5 minutes, please wait...
echo.

call npx electron-builder --win --publish never

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build failed!
    pause
    exit /b 1
)

echo.
echo =============================================
echo    BUILD COMPLETE!
echo    Check dist-electron folder for installer
echo =============================================
echo.

explorer dist-electron
pause
