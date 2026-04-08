@echo off
title Tata Attendance - Server Launcher

echo ============================================
echo   Tata Attendance - Starting...
echo ============================================
echo.

:: Start Flask API server in background
echo [1/2] Starting Flask API server (port 8000)...
cd /d "%~dp0ML MODEL"
start "Flask API Server" cmd /k "call venv\Scripts\activate && python api.py"

:: Small delay to let API start first
timeout /t 3 /nobreak >nul

:: Start Vite web server
echo [2/2] Starting Vite web server (port 8080)...
cd /d "%~dp0"
start "Vite Web Server" cmd /k "npm run dev"

:: Wait and open browser
timeout /t 5 /nobreak >nul
echo.
echo ============================================
echo   Both servers are running!
echo   Web:  http://localhost:8080
echo   API:  http://localhost:8000
echo ============================================
echo.
echo   Opening browser...
start http://localhost:8080

echo.
echo   Close this window anytime.
echo   To stop servers, close the other two windows.
pause
