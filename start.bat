@echo off
echo ========================================================
echo   Starting PredicTEE - NEAR AI Hackathon Project
echo ========================================================
echo.

start "PredicTEE Agent Backend" cmd /k "cd packages\agent && python agent.py"
start "PredicTEE Frontend Dashboard" cmd /k "cd packages\frontend && npm run dev"

echo Services launched:
echo   - Backend Agent API: http://127.0.0.1:8000
echo   - Frontend Web App:  http://localhost:5173
echo ========================================================
