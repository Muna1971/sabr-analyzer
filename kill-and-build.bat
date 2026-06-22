@echo off
title Sabr v5.0 - Kill and Build

echo Closing all Electron processes...
taskkill /f /im electron.exe 2>nul
taskkill /f /im "Sabr Analyzer.exe" 2>nul
timeout /t 3 /nobreak >nul

echo Cleaning dist-electron folder completely...
if exist "dist-electron" (
    rmdir /s /q "dist-electron" 2>nul
    timeout /t 2 /nobreak >nul
)

echo.
echo =============================================
echo    Sabr v5.0 - Building Windows Installer
echo =============================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed!
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

call npx electron-builder --win --publish never 2>&1

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Build failed! Trying portable build...
    echo.
    call npx electron-builder --win portable --publish never 2>&1
    if %errorlevel% neq 0 (
        echo.
        echo [ERROR] Portable build also failed!
        pause
        exit /b 1
    )
)

echo.
echo =============================================
echo    BUILD COMPLETE!
echo    Check dist-electron folder for installer
echo =============================================
echo.

dir /b dist-electron\*.exe 2>nul
echo.

explorer dist-electron
pause
