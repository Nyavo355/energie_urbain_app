@echo off
title Energie Urbaine App Launcher
setlocal enabledelayedexpansion

rem Chemins absolus (évite les erreurs de working directory)
set BASE_DIR=%~dp0
set BASE_DIR=%BASE_DIR:~0,-1%

set BACKEND_DIR=%BASE_DIR%\..\energie_app\backend
set FRONTEND_DIR=%BASE_DIR%\..\energie_app\frontend


echo ========================================
echo Energie Urbaine App - Launcher (fix chemins)
echo ========================================
echo.

echo Backend : %BACKEND_DIR%
echo Frontend: %FRONTEND_DIR%
echo.

rem Lancer Backend
if not exist "%BACKEND_DIR%\app.py" (
  echo [ERREUR] app.py introuvable dans backend.
  echo Verifie que %BACKEND_DIR% est correct.
  pause
  exit /b 1
)

start "Backend" cmd /k "cd /d \"%BACKEND_DIR%\" && python app.py"

rem Lancer Frontend
if not exist "%FRONTEND_DIR%\package.json" (
  echo [ERREUR] package.json introuvable dans frontend.
  echo Verifie que %FRONTEND_DIR% est correct.
  pause
  exit /b 1
)

start "Frontend" cmd /k "cd /d \"%FRONTEND_DIR%\" && npm start"

echo.
echo Serveurs lancés.
echo Backend  : http://localhost:5000
echo Frontend : http://localhost:3000
echo.
pause

