# Travel Life - TrueNAS Deployment Helper Script
# This script helps you deploy Travel Life to your TrueNAS system

param(
    [Parameter(Mandatory=$true)]
    [string]$TruenasIP,

    [string]$Method = "1",

    [switch]$Help
)

if ($Help) {
    Write-Host "Travel Life - TrueNAS Deployment Helper"
    Write-Host ""
    Write-Host "Usage:"
    Write-Host "    .\deploy-to-truenas.ps1 -TruenasIP <IP> [-Method <1|2|3>]"
    Write-Host ""
    Write-Host "Parameters:"
    Write-Host "    -TruenasIP    IP address of your TrueNAS system (e.g., 10.0.0.10)"
    Write-Host "    -Method       Deployment method (default: 1)"
    Write-Host "                  1 = Copy docker-compose only (uses pre-built images)"
    Write-Host "                  2 = Copy all source files (for local build)"
    Write-Host "                  3 = Build and push to registry"
    Write-Host "    -Help         Show this help message"
    Write-Host ""
    Write-Host "Examples:"
    Write-Host "    .\deploy-to-truenas.ps1 -TruenasIP 10.0.0.10"
    Write-Host "    .\deploy-to-truenas.ps1 -TruenasIP 10.0.0.10 -Method 3"
    exit 0
}

$ErrorActionPreference = "Stop"

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Travel Life - TrueNAS Deployment" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Target: $TruenasIP"
Write-Host "Method: $Method"
Write-Host ""

# Test SSH connection
Write-Host "Testing SSH connection..." -ForegroundColor Yellow
$sshTest = ssh -o ConnectTimeout=5 root@$TruenasIP "echo OK" 2>&1
if ($sshTest -notmatch "OK") {
    Write-Host "� SSH connection failed" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please ensure:" -ForegroundColor Yellow
    Write-Host "  1. TrueNAS SSH service is enabled"
    Write-Host "  2. Root login is allowed (or SSH key is configured)"
    Write-Host "  3. You can connect: ssh root@$TruenasIP"
    Write-Host ""
    Write-Host "See DEPLOYMENT_TRUENAS.md for SSH setup instructions" -ForegroundColor Yellow
    exit 1
}
Write-Host " SSH connection successful" -ForegroundColor Green

switch ($Method) {
    "1" {
        Write-Host ""
        Write-Host "Method 1: Deploy with pre-built images" -ForegroundColor Green
        Write-Host "This will copy docker-compose.truenas.yml to TrueNAS" -ForegroundColor Yellow
        Write-Host ""

        # Copy docker-compose file
        Write-Host "Copying docker-compose.truenas.yml..." -ForegroundColor Yellow
        ssh root@$TruenasIP "mkdir -p /mnt/main_pool/travel-life"
        scp docker-compose.truenas.yml root@${TruenasIP}:/mnt/main_pool/travel-life/

        if ($LASTEXITCODE -eq 0) {
            Write-Host " File copied successfully" -ForegroundColor Green
        } else {
            Write-Host "� File copy failed" -ForegroundColor Red
            exit 1
        }

        Write-Host ""
        Write-Host "Next steps on TrueNAS:" -ForegroundColor Cyan
        Write-Host "  ssh root@$TruenasIP" -ForegroundColor White
        Write-Host "  cd /mnt/main_pool/travel-life" -ForegroundColor White
        Write-Host "  docker-compose -f docker-compose.truenas.yml pull" -ForegroundColor White
        Write-Host "  docker-compose -f docker-compose.truenas.yml up -d" -ForegroundColor White
        Write-Host "  docker exec travel-life-backend npx prisma migrate deploy" -ForegroundColor White
        Write-Host ""
        Write-Host "Then access: http://${TruenasIP}:30600" -ForegroundColor Green
    }

    "2" {
        Write-Host ""
        Write-Host "Method 2: Deploy with local build" -ForegroundColor Green
        Write-Host "This will copy all source files to TrueNAS" -ForegroundColor Yellow
        Write-Host ""

        # Create directory structure
        Write-Host "Creating directories on TrueNAS..." -ForegroundColor Yellow
        ssh root@$TruenasIP "mkdir -p /mnt/main_pool/travel-life/backend && mkdir -p /mnt/main_pool/travel-life/frontend && mkdir -p /mnt/main_pool/travel-life/postgres && mkdir -p /mnt/main_pool/travel-life/nominatim && mkdir -p /mnt/main_pool/travel-life/uploads && mkdir -p /mnt/main_pool/travel-life/logs && chown -R 999:999 /mnt/main_pool/travel-life/postgres && chmod -R 755 /mnt/main_pool/travel-life"

        # Copy files
        Write-Host "Copying backend files..." -ForegroundColor Yellow
        scp -r backend root@${TruenasIP}:/mnt/main_pool/travel-life/

        Write-Host "Copying frontend files..." -ForegroundColor Yellow
        scp -r frontend root@${TruenasIP}:/mnt/main_pool/travel-life/

        Write-Host "Copying docker-compose..." -ForegroundColor Yellow
        scp docker-compose.truenas.yml root@${TruenasIP}:/mnt/main_pool/travel-life/

        if ($LASTEXITCODE -eq 0) {
            Write-Host " Files copied successfully" -ForegroundColor Green
        } else {
            Write-Host "� File copy failed" -ForegroundColor Red
            exit 1
        }

        Write-Host ""
        Write-Host "Next steps on TrueNAS:" -ForegroundColor Cyan
        Write-Host "  ssh root@$TruenasIP" -ForegroundColor White
        Write-Host "  cd /mnt/main_pool/travel-life" -ForegroundColor White
        Write-Host "  docker build -f backend/Dockerfile.prod -t travel-life-backend:latest ./backend" -ForegroundColor White
        Write-Host "  docker build -f frontend/Dockerfile.prod.truenas -t travel-life-frontend:latest ./frontend" -ForegroundColor White
        Write-Host "  docker-compose -f docker-compose.truenas.yml up -d" -ForegroundColor White
        Write-Host "  docker exec travel-life-backend npx prisma migrate deploy" -ForegroundColor White
        Write-Host ""
        Write-Host "Then access: http://${TruenasIP}:30600" -ForegroundColor Green
    }

    "3" {
        Write-Host ""
        Write-Host "Method 3: Build and push to registry" -ForegroundColor Green
        Write-Host ""

        if (-not $env:DOCKER_REGISTRY) {
            Write-Host "Please set DOCKER_REGISTRY environment variable:" -ForegroundColor Yellow
            Write-Host '  $env:DOCKER_REGISTRY = "ghcr.io/yourusername"' -ForegroundColor White
            Write-Host ""
            exit 1
        }

        Write-Host "Building images for registry: $env:DOCKER_REGISTRY" -ForegroundColor Yellow
        Write-Host ""

        # Build images
        & .\build.truenas.ps1 -Version latest -Registry $env:DOCKER_REGISTRY

        if ($LASTEXITCODE -ne 0) {
            Write-Host "� Build failed" -ForegroundColor Red
            exit 1
        }

        Write-Host ""
        Write-Host "Pushing images..." -ForegroundColor Yellow
        docker push "$env:DOCKER_REGISTRY/travel-life-backend:latest"
        docker push "$env:DOCKER_REGISTRY/travel-life-frontend:latest"

        if ($LASTEXITCODE -ne 0) {
            Write-Host "� Push failed" -ForegroundColor Red
            Write-Host "Make sure you're logged in: docker login ghcr.io" -ForegroundColor Yellow
            exit 1
        }

        Write-Host " Images pushed successfully" -ForegroundColor Green

        # Copy docker-compose
        Write-Host ""
        Write-Host "Copying docker-compose.truenas.yml..." -ForegroundColor Yellow
        ssh root@$TruenasIP "mkdir -p /mnt/main_pool/travel-life"
        scp docker-compose.truenas.yml root@${TruenasIP}:/mnt/main_pool/travel-life/

        Write-Host ""
        Write-Host "Next steps on TrueNAS:" -ForegroundColor Cyan
        Write-Host "  ssh root@$TruenasIP" -ForegroundColor White
        Write-Host "  cd /mnt/main_pool/travel-life" -ForegroundColor White
        Write-Host "  docker-compose -f docker-compose.truenas.yml pull" -ForegroundColor White
        Write-Host "  docker-compose -f docker-compose.truenas.yml up -d" -ForegroundColor White
        Write-Host "  docker exec travel-life-backend npx prisma migrate deploy" -ForegroundColor White
        Write-Host ""
        Write-Host "Then access: http://${TruenasIP}:30600" -ForegroundColor Green
    }

    default {
        Write-Host "Invalid method: $Method" -ForegroundColor Red
        Write-Host "Use -Help for usage information" -ForegroundColor Yellow
        exit 1
    }
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Deployment preparation complete!" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
