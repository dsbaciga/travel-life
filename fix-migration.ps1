# PowerShell script to fix failed Prisma migration
# Run this on your TrueNAS system

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Fixing Failed Migration" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "This will fix the failed migration: 20251015_add_user_timezone" -ForegroundColor Yellow
Write-Host ""

# Check if column exists and apply if needed
Write-Host "Step 1: Checking if timezone column exists..." -ForegroundColor Green
$checkColumn = docker exec travel-life-backend sh -c 'psql "$DATABASE_URL" -t -c "SELECT column_name FROM information_schema.columns WHERE table_name=''users'' AND column_name=''timezone'';"'

if ([string]::IsNullOrWhiteSpace($checkColumn)) {
    Write-Host "Column does not exist - applying migration..." -ForegroundColor Yellow
    docker exec travel-life-backend sh -c 'psql "$DATABASE_URL" -c "ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT ''UTC'';"'
    Write-Host "√ Migration applied" -ForegroundColor Green
} else {
    Write-Host "√ Column already exists" -ForegroundColor Green
}

Write-Host ""
Write-Host "Step 2: Marking migration as rolled back..." -ForegroundColor Green
docker exec travel-life-backend npx prisma migrate resolve --rolled-back 20251015_add_user_timezone

Write-Host ""
Write-Host "Step 3: Running all migrations..." -ForegroundColor Green
docker exec travel-life-backend npx prisma migrate deploy

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Migration fix complete!" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
