@echo off
title Multi-Platform Social Calendar Server (2026 Standards)
cd /d "%~dp0"

echo ======================================================
echo    Multi-Platform Social Calendar (2026 Standards)
echo ======================================================
echo.

:: Check if Node.js is installed
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo [ERROR] Node.js is not installed or not found in PATH.
    echo Please install Node.js from https://nodejs.org/ to run the server.
    echo.
    pause
    exit /b 1
)

echo [INFO] Starting local HTTP server on port 3000...
echo [INFO] Opening default web browser to http://localhost:3000 ...
echo.

:: Launch the browser after a brief 1-second delay in background
start "" cmd /c "timeout /t 1 /nobreak >nul & start http://localhost:3000"

:: Start the Node server
node server.js

pause
