# BarberShop - Start Script
# انقر بزر الماوس الأيمن واختر "Run with PowerShell"

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
$serverPath = Join-Path $scriptPath "server"

Clear-Host
Write-Host "╔══════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║         BarberShop Queue System          ║" -ForegroundColor Yellow
Write-Host "╚══════════════════════════════════════════╝" -ForegroundColor Yellow
Write-Host ""

# Kill old processes
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process -Name "ssh" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 1

# 1. Start server in NEW window (stays open after this script ends)
Write-Host "📡 Starting server..." -ForegroundColor Cyan
Start-Process -FilePath "node" -ArgumentList "index.js" -WorkingDirectory $serverPath -WindowStyle Normal
Start-Sleep 2

try {
    $test = Invoke-WebRequest -Uri "http://localhost:3000/" -Method Get -TimeoutSec 3 -ErrorAction Stop
    Write-Host "✅ Server running: http://localhost:3000" -ForegroundColor Green
} catch {
    Write-Host "❌ Server failed to start!" -ForegroundColor Red
    pause
    exit 1
}

Write-Host ""
Write-Host "╔══════════════════════════════════════════════════╗" -ForegroundColor Yellow
Write-Host "║           🚀 BARBERSHOP IS READY!                ║" -ForegroundColor Yellow
Write-Host "╠══════════════════════════════════════════════════╣" -ForegroundColor Yellow
Write-Host "║                                                  ║" -ForegroundColor Yellow
Write-Host "║  📍 Local:    http://localhost:3000              ║" -ForegroundColor White
Write-Host "║  🔐 Admin:    http://localhost:3000/admin        ║" -ForegroundColor White
Write-Host "║  🔑 Password: admin123                          ║" -ForegroundColor White
Write-Host "║                                                  ║" -ForegroundColor Yellow
Write-Host "╠══════════════════════════════════════════════════╣" -ForegroundColor Yellow
Write-Host "║  🌐 To share with customers, open a NEW          ║" -ForegroundColor Cyan
Write-Host "║     Terminal and run:                            ║" -ForegroundColor Cyan
Write-Host "║                                                  ║" -ForegroundColor Cyan
Write-Host "║     ssh -R 80:localhost:3000 nokey@localhost.run ║" -ForegroundColor Green
Write-Host "║                                                  ║" -ForegroundColor Cyan
Write-Host "║     Copy the https://...lhr.life URL shown        ║" -ForegroundColor Cyan
Write-Host "╠══════════════════════════════════════════════════╣" -ForegroundColor Yellow
Write-Host "║  Press any key to stop the server...              ║" -ForegroundColor Red
Write-Host "╚══════════════════════════════════════════════════╝" -ForegroundColor Yellow
Write-Host ""

pause

# Stop server on exit
Get-Process -Name "node" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Write-Host "Server stopped." -ForegroundColor Yellow
