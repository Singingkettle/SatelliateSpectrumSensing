# Satellite Tracker Start Script for Windows PowerShell
# Starts Redis, Backend, and Frontend services

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Satellite Tracker - Startup Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$projectRoot = Split-Path -Parent $PSScriptRoot

# Check Redis
Write-Host "[1/4] Checking Redis..." -ForegroundColor Yellow
$redisPath = "E:\Software\Redis"
$redisCli = "$redisPath\redis-cli.exe"
$redisServer = "$redisPath\redis-server.exe"

if (Test-Path $redisCli) {
    try {
        $redisCheck = & $redisCli ping 2>&1
        if ($redisCheck -match "PONG") {
            Write-Host "  Redis is running" -ForegroundColor Green
        } else {
            Write-Host "  Starting Redis..." -ForegroundColor Yellow
            Start-Process -FilePath $redisServer -WindowStyle Normal
            Start-Sleep -Seconds 3
            Write-Host "  Redis started" -ForegroundColor Green
        }
    } catch {
        Write-Host "  Redis not available, starting..." -ForegroundColor Yellow
        Start-Process -FilePath $redisServer -WindowStyle Normal
        Start-Sleep -Seconds 3
    }
} else {
    Write-Host "  Warning: Redis not found at $redisPath" -ForegroundColor Yellow
}

# Check PostgreSQL
Write-Host ""
Write-Host "[2/4] Checking PostgreSQL..." -ForegroundColor Yellow
try {
    $pgCheck = & psql -U postgres -c "SELECT 1" 2>&1
    Write-Host "  PostgreSQL is running" -ForegroundColor Green
} catch {
    Write-Host "  Warning: PostgreSQL may not be running" -ForegroundColor Yellow
    Write-Host "  Please ensure PostgreSQL is running and create database:" -ForegroundColor Yellow
    Write-Host "    CREATE DATABASE satellite_tracker;" -ForegroundColor White
}

# Start Backend
Write-Host ""
Write-Host "[3/4] Starting Backend..." -ForegroundColor Yellow
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
Write-Host "[4/4] Starting Frontend..." -ForegroundColor Yellow
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
Write-Host "Startup Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backend:  http://localhost:6359" -ForegroundColor White
Write-Host "Frontend: http://localhost:3000" -ForegroundColor White
Write-Host ""
Write-Host "To initialize database with TLE data, run:" -ForegroundColor Yellow
Write-Host "  cd backend && python init_db.py --all" -ForegroundColor White
