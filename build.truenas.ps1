# Travel Life Build Script for TrueNAS (PowerShell)
# This script builds production Docker images optimized for TrueNAS deployment

param(
    [string]$Version = "latest",
    [string]$Registry = $env:DOCKER_REGISTRY
)

$ErrorActionPreference = "Stop"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Travel Life TrueNAS Build" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Version: $Version"
Write-Host "Registry: $(if($Registry) {$Registry} else {'local'})"
Write-Host ""

$RegistryPrefix = if($Registry) {"$Registry/"} else {""}

# Build backend (same as regular build)
Write-Host "Building backend image..." -ForegroundColor Green
docker build `
    -f backend/Dockerfile.prod `
    -t "${RegistryPrefix}travel-life-backend:${Version}" `
    -t "${RegistryPrefix}travel-life-backend:latest" `
    -t "${RegistryPrefix}travel-life-backend:${Version}-truenas" `
    ./backend

if ($LASTEXITCODE -ne 0) {
    Write-Host "× Backend build failed" -ForegroundColor Red
    exit 1
}
Write-Host "√ Backend image built successfully" -ForegroundColor Green

# Build frontend with TrueNAS-specific configuration
Write-Host ""
Write-Host "Building TrueNAS frontend image with nginx proxy..." -ForegroundColor Green

docker build `
    -f frontend/Dockerfile.prod.truenas `
    -t "${RegistryPrefix}travel-life-frontend:${Version}" `
    -t "${RegistryPrefix}travel-life-frontend:latest" `
    -t "${RegistryPrefix}travel-life-frontend:${Version}-truenas" `
    ./frontend

if ($LASTEXITCODE -ne 0) {
    Write-Host "× Frontend build failed" -ForegroundColor Red
    exit 1
}
Write-Host "√ Frontend image built successfully" -ForegroundColor Green

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "TrueNAS Build Complete!" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Images created:"
Write-Host "  - ${RegistryPrefix}travel-life-backend:${Version}"
Write-Host "  - ${RegistryPrefix}travel-life-backend:${Version}-truenas"
Write-Host "  - ${RegistryPrefix}travel-life-frontend:${Version}"
Write-Host "  - ${RegistryPrefix}travel-life-frontend:${Version}-truenas"
Write-Host ""
Write-Host "Frontend includes nginx proxy for /api and /uploads" -ForegroundColor Yellow
Write-Host ""
Write-Host "To deploy on TrueNAS:" -ForegroundColor Yellow
Write-Host "  1. Push images to registry: docker push ${RegistryPrefix}travel-life-backend:${Version}"
Write-Host "  2. Push images to registry: docker push ${RegistryPrefix}travel-life-frontend:${Version}"
Write-Host "  3. On TrueNAS: docker-compose -f docker-compose.truenas.yml pull"
Write-Host "  4. On TrueNAS: docker-compose -f docker-compose.truenas.yml up -d"
Write-Host ""
