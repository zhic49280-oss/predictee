@echo off
chcp 65001 >nul
cd /d "%~dp0"
title PredicTEE - NEAR AI Oracle Launcher

echo ========================================================================
echo        PredicTEE - NEAR HACKATHON 2026 1-CLICK LAUNCHER
echo   Verifiable TEE AI Oracle on NEAR (Intel TDX + NEAR MPC)
echo ========================================================================
echo.

where python >nul 2>nul
if errorlevel 1 (
    echo [ERROR] Python not found in PATH. Please install Python 3.10+ and add to PATH.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERROR] npm not found in PATH. Please install Node.js 18+ and add to PATH.
    pause
    exit /b 1
)

echo [1/3] Environment Verified: Python and Node.js detected.
echo.
echo [2/3] Starting Backend Agent API (Port 8000)...
start "PredicTEE Agent Backend" cmd /k "cd /d %~dp0packages\agent & python agent.py"

echo [3/3] Starting Frontend Web App (Port 5173)...
start "PredicTEE Frontend UI" cmd /k "cd /d %~dp0packages\frontend & npm run dev"

echo.
echo ========================================================================
echo   ALL SERVICES LAUNCHED SUCCESSFULLY!
echo ========================================================================
echo.
echo   * Web Dashboard:  http://localhost:5173
echo   * Agent REST API: http://127.0.0.1:8000
echo   * API Docs:       http://127.0.0.1:8000/docs
echo   * Test Suite:     npm run contracts:test
echo.
echo   Two worker windows have been opened for the Backend and Frontend.
echo   You can keep this window open or press any key to close it.
echo ========================================================================
pause
