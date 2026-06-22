@echo off
title Sabr v5.0

echo.
echo =============================================
echo    Sabr v5.0 - Pragmatic Discourse Analyzer
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

if not exist "node_modules" (
    echo [*] Installing dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed!
        pause
        exit /b 1
    )
    echo [OK] Dependencies installed
) else (
    echo [OK] Dependencies ready
)

echo.
echo [*] Starting Sabr v5.0...
echo.
call npx electron .
pause
