@echo off
title BarberShop Queue System
cd /d "%~dp0"

echo ============================================
echo      BarberShop Queue System
echo ============================================
echo.

:: Kill old processes
taskkill /f /im node.exe >nul 2>&1
taskkill /f /im ssh.exe >nul 2>&1
timeout /t 2 >nul

:: Start server in a new window
echo [1/3] Starting server...
start "BarberShop Server" cmd /c "node server\index.js && pause"
timeout /t 3 >nul

:: Test if server is running
powershell -Command "try { $r = Invoke-WebRequest -Uri 'http://localhost:3000/' -Method Get -TimeoutSec 3 -ErrorAction Stop; Write-Host '[OK] Server running on http://localhost:3000' -ForegroundColor Green } catch { Write-Host '[FAIL] Server did not start!' -ForegroundColor Red; pause; exit 1 }"

:: Create SSH tunnel in new window
echo [2/3] Creating public tunnel...
start "BarberShop Tunnel" cmd /c "ssh -o StrictHostKeyChecking=no -o ServerAliveInterval=30 -R 80:localhost:3000 nokey@localhost.run && pause"
timeout /t 5 >nul

:: Try to detect URL
echo [3/3] Detecting public URL...
echo.
echo ============================================
echo   Check the "BarberShop Tunnel" window
echo   for your public URL (https://....lhr.life)
echo ============================================
echo.
echo   Local:   http://localhost:3000
echo   Admin:   http://localhost:3000/admin
echo   Password: admin123
echo.
echo   Keep all windows open while using.
echo   Press CTRL+C in each window to stop.
echo.
pause
