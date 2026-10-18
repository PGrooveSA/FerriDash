@echo off
setlocal
title Sekolo - School Management
cd /d "%~dp0"

rem  Usage:
rem    start.bat           run the app (builds it the first time)
rem    start.bat rebuild   rebuild after code changes, then run
rem    start.bat dev       run in development mode (live reload)
rem    start.bat reset     reload the demo data, then run

set PORT=3100
set URL=http://localhost:%PORT%

echo.
echo   Sekolo - School Management for South Africa
echo   Copyright (c) Infinite Q Graphics
echo.

rem ---- Node.js 22.13 or newer is required (built-in SQLite) ----
where node >nul 2>nul
if errorlevel 1 (
  echo   [X] Node.js is not installed. Install the LTS version from https://nodejs.org and run this again.
  goto :fail
)
node -e "const [a,b]=process.versions.node.split('.').map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)"
if errorlevel 1 (
  echo   [X] Node.js 22.13 or newer is required. You have:
  node -v
  goto :fail
)

rem ---- Is something already using the port? ----
netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul
if not errorlevel 1 (
  echo   [!] Port %PORT% is already in use - Sekolo may already be running.
  echo       Opening %URL% ...
  start "" "%URL%"
  goto :end
)

rem ---- First-time setup ----
if not exist "node_modules\" (
  echo   Installing packages - first run only, needs internet once...
  call npm install --no-audit --no-fund
  if errorlevel 1 goto :fail
)

if not exist ".env.local" (
  echo   Creating a private session key in .env.local ...
  node -e "require('fs').writeFileSync('.env.local','SESSION_SECRET='+require('crypto').randomBytes(32).toString('hex')+'\n')"
)

if /i "%~1"=="reset" (
  echo   Reloading demo data...
  call npm run seed:reset
  if errorlevel 1 goto :fail
)

rem ---- Open the browser once the server answers ----
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "for($i=0;$i -lt 120;$i++){try{Invoke-WebRequest '%URL%/login' -UseBasicParsing -TimeoutSec 2 | Out-Null; Start-Process '%URL%'; break}catch{Start-Sleep 1}}"

if /i "%~1"=="dev" (
  echo   Starting in development mode on %URL%
  echo   Press Ctrl+C to stop.
  echo.
  call npm run dev
  goto :end
)

if /i "%~1"=="rebuild" if exist ".next\" rmdir /s /q ".next"
if not exist ".next\BUILD_ID" (
  echo   Building the app - this takes a minute the first time...
  call npm run build
  if errorlevel 1 goto :fail
)

echo.
echo   Sekolo is running at %URL%
echo   Demo logins are listed in README.md. Press Ctrl+C to stop.
echo.
call npm start
goto :end

:fail
echo.
echo   Sekolo could not start. See the message above.
pause
exit /b 1

:end
endlocal
