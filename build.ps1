# Travel Life Build Script (PowerShell)
# This script builds production Docker images for the application

param(
    [string]$Version = "latest",
    [string]$Registry = $env:DOCKER_REGISTRY
)

$ErrorActionPreference = "Stop"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Travel Life Production Build" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Version: $Version"
Write-Host "Registry: $(if($Registry) {$Registry} else {'local'})"
Write-Host ""

# Load environment variables if .env.production exists
if (Test-Path .env.production) {
    Write-Host "Loading .env.production..." -ForegroundColor Yellow
    Get-Content .env.production | ForEach-Object {
        if ($_ -match '^([^#][^=]*)=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
        }
    }
}

$RegistryPrefix = if($Registry) {"$Registry/"} else {""}

# Build backend
Write-Host "Building backend image..." -ForegroundColor Green
docker build `
    -f backend/Dockerfile.prod `
    -t "${RegistryPrefix}travel-life-backend:${Version}" `
    -t "${RegistryPrefix}travel-life-backend:latest" `
    ./backend

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Backend build failed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Backend image built successfully" -ForegroundColor Green

# Build frontend
Write-Host ""
Write-Host "Building frontend image..." -ForegroundColor Green

$ViteApiUrl = if($env:VITE_API_URL) {$env:VITE_API_URL} else {"http://localhost:5000/api"}
$ViteUploadUrl = if($env:VITE_UPLOAD_URL) {$env:VITE_UPLOAD_URL} else {"http://localhost:5000/uploads"}

docker build `
    -f frontend/Dockerfile.prod `
    --build-arg VITE_API_URL="$ViteApiUrl" `
    --build-arg VITE_UPLOAD_URL="$ViteUploadUrl" `
    -t "${RegistryPrefix}travel-life-frontend:${Version}" `
    -t "${RegistryPrefix}travel-life-frontend:latest" `
    ./frontend

if ($LASTEXITCODE -ne 0) {
    Write-Host "✗ Frontend build failed" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Frontend image built successfully" -ForegroundColor Green

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Build Complete!" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Images created:"
Write-Host "  - ${RegistryPrefix}travel-life-backend:${Version}"
Write-Host "  - ${RegistryPrefix}travel-life-backend:latest"
Write-Host "  - ${RegistryPrefix}travel-life-frontend:${Version}"
Write-Host "  - ${RegistryPrefix}travel-life-frontend:latest"
Write-Host ""
Write-Host "To start the application:" -ForegroundColor Yellow
Write-Host "  docker-compose -f docker-compose.prod.yml --env-file .env.production up -d"
Write-Host ""
