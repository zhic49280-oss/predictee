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

echo [1/4] Environment Verified: Python and Node.js detected.
echo [2/4] Running NEAR Smart Contract Verification Suite...
call npm run contracts:test
if errorlevel 1 (
    echo [ERROR] Smart contract verification failed.
    pause
    exit /b 1
)

echo.
echo [3/4] Starting Backend Agent API (Port 8000)...
start "PredicTEE Agent Backend" cmd /k "cd /d %~dp0packages\agent & python agent.py"

echo [4/4] Starting Frontend Web App (Port 5173)...
start "PredicTEE Frontend UI" cmd /k "cd /d %~dp0packages\frontend & npm run dev"

echo.
echo ========================================================================
echo   ALL SERVICES LAUNCHED SUCCESSFULLY!
echo ========================================================================
echo.
echo   * Web Dashboard:  http://localhost:5173
echo   * Agent REST API: http://127.0.0.1:8000
echo   * API Docs:       http://127.0.0.1:8000/docs
echo   * Test Suite:     npm test
echo   * Live TEE Check: npm run verify:tee
echo.
echo   Two worker windows have been opened for the Backend and Frontend.
echo   You can keep this window open or press any key to close it.
echo ========================================================================
pause
