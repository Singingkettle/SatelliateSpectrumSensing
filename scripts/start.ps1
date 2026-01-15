# Satellite Tracker Start Script for Windows PowerShell
# Kills existing processes and starts Backend and Frontend services

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "ChangShuoSpace - Satellite Tracker" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Kill existing processes on ports 6359 (backend) and 3000 (frontend)
Write-Host "[0/3] Cleaning up existing processes..." -ForegroundColor Yellow
$ports = 6359, 3000
foreach ($port in $ports) {
    $pids = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique
    if ($pids) {
        foreach ($p in $pids) {
            if ($p -ne 0) {
                Write-Host "  Killing process $p on port $port" -ForegroundColor Gray
                Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
            }
        }
    }
}
Start-Sleep -Seconds 1

$projectRoot = Split-Path -Parent $PSScriptRoot

# Start Backend
Write-Host ""
Write-Host "[1/3] Starting Backend..." -ForegroundColor Yellow
$backendPath = Join-Path $projectRoot "backend"

if (-not (Test-Path "$backendPath\venv")) {
    Write-Host "  Creating virtual environment..." -ForegroundColor Yellow
    Push-Location $backendPath
    python -m venv venv
    .\venv\Scripts\pip.exe install -r requirements.txt
    Pop-Location
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", @"
    cd '$backendPath'
    .\venv\Scripts\Activate.ps1
    Write-Host 'Starting Satellite Tracker Backend...' -ForegroundColor Green
    python app.py
"@ -WindowStyle Normal

Write-Host "  Backend starting at http://localhost:6359" -ForegroundColor Green
Start-Sleep -Seconds 3

# Start Frontend
Write-Host ""
Write-Host "[2/3] Starting Frontend..." -ForegroundColor Yellow
$frontendPath = Join-Path $projectRoot "frontend"

if (-not (Test-Path "$frontendPath\node_modules")) {
    Write-Host "  Installing frontend dependencies..." -ForegroundColor Yellow
    Push-Location $frontendPath
    npm install
    Pop-Location
}

Start-Process powershell -ArgumentList "-NoExit", "-Command", @"
    cd '$frontendPath'
    Write-Host 'Starting Satellite Tracker Frontend...' -ForegroundColor Green
    npm start
"@ -WindowStyle Normal

Write-Host "  Frontend starting at http://localhost:3000" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "[3/3] Startup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backend:  http://localhost:6359" -ForegroundColor White
Write-Host "Frontend: http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "To initialize database with TLE data, run:" -ForegroundColor Yellow
Write-Host "  cd backend && python init_db.py --all" -ForegroundColor White
