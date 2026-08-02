# Starts the full local stack in three PowerShell windows.
# Run one-time setup first (see below) before the very first launch:
#   npm install
#   Copy-Item apps\api\.env.example apps\api\.env
#   npm run -w apps/api db:local        # in its own window, leave running
#   npm run db:migrate
#   npm run -w apps/api db:seed-reference
#   npm run -w apps/api db:seed
#
# After that, just run:  .\dev-up.ps1
# (If PowerShell blocks the script: run it once as
#   powershell -ExecutionPolicy Bypass -File .\dev-up.ps1 )

$repo = $PSScriptRoot

Write-Host "Starting Postgres..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$repo'; npm run -w apps/api db:local"

Write-Host "Waiting for Postgres to come up..." -ForegroundColor Cyan
Start-Sleep -Seconds 8

Write-Host "Starting API (:8787)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$repo'; npm run dev:api"

Write-Host "Starting web (:5173)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$repo'; npm run dev:web"

Write-Host ""
Write-Host "Stack starting in three windows." -ForegroundColor Green
Write-Host "  Web:   http://localhost:5173" -ForegroundColor Green
Write-Host "  Login: dev@zitie.local / dev-password-change-me" -ForegroundColor Green
