@echo off
title Fable Studio AI
echo Starting Fable Studio AI...
echo   API  http://localhost:4100
echo   Web  http://localhost:3100
echo.
start "Fable API" cmd /k "cd /d "%~dp0apps\api" && npm run dev"
start "Fable Web" cmd /k "cd /d "%~dp0apps\web" && npm run dev"
timeout /t 8 /nobreak >nul
start http://localhost:3100
echo Both servers launched in their own windows. Close those windows to stop.
timeout /t 4 >nul
