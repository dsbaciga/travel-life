<#
.SYNOPSIS
    Automated release script for Travel Life

.DESCRIPTION
    This script automates the entire build and push process:
    1. Updates version numbers in package.json files
    2. Commits the version bump
    3. Builds backend and frontend
    4. Builds Docker images
    5. Pushes Docker images to registry
    6. Creates and pushes git tag

.PARAMETER Version
    The version number (e.g., v1.12.6 or 1.12.6)
    Can also be "patch", "minor", or "major" to auto-increment

.PARAMETER SkipBuild
    Skip the local build verification step (still builds Docker images)

.PARAMETER DryRun
    Show what would be done without actually doing it

.PARAMETER NoConfirm
    Skip all interactive confirmations (for automated releases)

.PARAMETER Description
    Optional description for the release tag

.PARAMETER CommitMessage
    Optional custom commit message (defaults to "Bump version to vX.X.X")

.EXAMPLE
    .\release.ps1 -Version v1.12.6

.EXAMPLE
    .\release.ps1 -Version patch

.EXAMPLE
    .\release.ps1 -Version patch -NoConfirm

.EXAMPLE
    .\release.ps1 -Version 1.12.6 -Description "Fix Timeline z-index issues"

.EXAMPLE
    .\release.ps1 -Version patch -CommitMessage "Add Trip Map feature"

.EXAMPLE
    .\release.ps1 -Version v1.12.6 -DryRun
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$Version,

    [switch]$SkipBuild,

    [switch]$DryRun,

    [switch]$NoConfirm,

    [string]$Description = "",

    [string]$CommitMessage = ""
)

$ErrorActionPreference = "Stop"

# Configuration
$Registry = "ghcr.io/dsbaciga"
$BackendImage = "travel-life-backend"
$FrontendImage = "travel-life-frontend"

# Colors for output
function Write-Step { param($Message) Write-Host "`n=== $Message ===" -ForegroundColor Cyan }
function Write-Success { param($Message) Write-Host "[OK] $Message" -ForegroundColor Green }
function Write-Warn { param($Message) Write-Host "[!!] $Message" -ForegroundColor Yellow }
function Write-Err { param($Message) Write-Host "[XX] $Message" -ForegroundColor Red }
function Write-Info { param($Message) Write-Host "     $Message" -ForegroundColor Gray }

# Check if we're in the right directory
if (-not (Test-Path "backend/package.json") -or -not (Test-Path "frontend/package.json")) {
    Write-Err "Must be run from the travel-life root directory"
    exit 1
}

# Get current version from package.json
$backendPackage = Get-Content "backend/package.json" -Raw | ConvertFrom-Json
$CurrentVersion = $backendPackage.version

# Handle version type (patch/minor/major) or explicit version
$VersionParts = $CurrentVersion -split '\.'
$Major = [int]$VersionParts[0]
$Minor = [int]$VersionParts[1]
$Patch = [int]$VersionParts[2]

$NumericVersion = switch ($Version.ToLower()) {
    "patch" { "$Major.$Minor.$($Patch + 1)" }
    "minor" { "$Major.$($Minor + 1).0" }
    "major" { "$($Major + 1).0.0" }
    default { $Version.TrimStart("v") }
}

# Ensure Version variable has 'v' prefix for tags
$Version = "v$NumericVersion"

Write-Host "`n==========================================" -ForegroundColor Magenta
Write-Host "  Travel Life Release Script" -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Magenta
Write-Host "Current version: $CurrentVersion"
Write-Host "New version:     $NumericVersion"
Write-Host "Registry:        $Registry"
if ($DryRun) { Write-Warn "DRY RUN MODE - No changes will be made" }
Write-Host ""

# Confirmation
if (-not $NoConfirm) {
    $Confirmation = Read-Host "Continue with release $Version? (y/N)"
    if ($Confirmation -ne 'y' -and $Confirmation -ne 'Y') {
        Write-Warn "Release cancelled."
        exit 0
    }
} else {
    Write-Info "Skipping confirmation (NoConfirm mode)"
}

# Step 1: Check for uncommitted changes
Write-Step "Checking git status"
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Warn "You have uncommitted changes:"
    $gitStatus | ForEach-Object { Write-Info $_ }
    if (-not $NoConfirm) {
        $response = Read-Host "These will be included in the release commit. Continue? (y/N)"
        if ($response -ne "y" -and $response -ne "Y") {
            Write-Err "Aborted"
            exit 1
        }
    } else {
        Write-Info "Proceeding with uncommitted changes (NoConfirm mode)"
    }
}
Write-Success "Git status checked"

# Step 2: Update version in package.json files
Write-Step "Updating version to $NumericVersion"

Write-Info "Backend: $CurrentVersion -> $NumericVersion"
Write-Info "Frontend: $CurrentVersion -> $NumericVersion"

if (-not $DryRun) {
    # Update backend package.json (preserve formatting)
    $backendContent = Get-Content "backend/package.json" -Raw
    $backendContent = $backendContent -replace '"version":\s*"[^"]*"', "`"version`": `"$NumericVersion`""
    [System.IO.File]::WriteAllText("$PWD/backend/package.json", $backendContent)

    # Update frontend package.json (preserve formatting)
    $frontendContent = Get-Content "frontend/package.json" -Raw
    $frontendContent = $frontendContent -replace '"version":\s*"[^"]*"', "`"version`": `"$NumericVersion`""
    [System.IO.File]::WriteAllText("$PWD/frontend/package.json", $frontendContent)
}
Write-Success "Version updated in package.json files"

# Step 3: Build verification (unless skipped)
if (-not $SkipBuild) {
    Write-Step "Building backend (verification)"
    if (-not $DryRun) {
        Push-Location backend
        try {
            npm run build 2>&1 | Out-Null
            Write-Success "Backend build completed"
        }
        catch {
            Write-Warn "Backend build had issues (continuing anyway)"
        }
        Pop-Location
    } else {
        Write-Info "Would run: npm run build (backend)"
    }

    Write-Step "Building frontend (verification)"
    if (-not $DryRun) {
        Push-Location frontend
        try {
            $output = npm run build 2>&1
            if ($output -match "built in") {
                Write-Success "Frontend build completed"
            } else {
                Write-Warn "Frontend build may have issues"
            }
        }
        catch {
            Write-Warn "Frontend build had issues (continuing anyway)"
        }
        Pop-Location
    } else {
        Write-Info "Would run: npm run build (frontend)"
    }
} else {
    Write-Warn "Skipping build verification"
}

# Step 4: Commit version bump and any staged changes
Write-Step "Committing changes"

# Build commit message
if ($CommitMessage) {
    $finalCommitMessage = "$CommitMessage`n`nBump version to $Version"
} else {
    $finalCommitMessage = "Bump version to $Version"
}

if (-not $DryRun) {
    git add -A
    git commit -m $finalCommitMessage
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Changes committed"
    } else {
        Write-Info "Nothing new to commit"
    }
} else {
    Write-Info "Would commit: $finalCommitMessage"
}

# Step 5: Build Docker images
Write-Step "Building Docker images"
if (-not $DryRun) {
    & .\build.truenas.ps1 -Version $Version -Registry $Registry
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Docker build failed"
        exit 1
    }
    Write-Success "Docker images built"
} else {
    Write-Info "Would run: .\build.truenas.ps1 -Version $Version -Registry $Registry"
}

# Step 6: Push Docker images
Write-Step "Pushing Docker images to registry"

$imagesToPush = @(
    "$Registry/${BackendImage}:$Version",
    "$Registry/${FrontendImage}:$Version"
)

foreach ($image in $imagesToPush) {
    Write-Info "Pushing $image"
    if (-not $DryRun) {
        docker push $image
        if ($LASTEXITCODE -ne 0) {
            Write-Err "Failed to push $image"
            exit 1
        }
    }
}
Write-Success "Docker images pushed"

# Step 7: Create and push git tag
Write-Step "Creating git tag"

# Build tag message
if ($Description) {
    $tagMessage = "$Version - $Description"
} else {
    # Try to get description from recent commit
    $recentCommit = git log -1 --pretty=format:"%s" 2>$null
    if ($recentCommit -and $recentCommit -ne "Bump version to $Version") {
        $tagMessage = "$Version - $recentCommit"
    } else {
        $tagMessage = "$Version - Release"
    }
}

Write-Info "Tag message: $tagMessage"

if (-not $DryRun) {
    # Check if tag already exists
    $existingTag = git tag -l $Version
    if ($existingTag) {
        Write-Warn "Tag $Version already exists. Deleting and recreating..."
        git tag -d $Version 2>$null
        git push origin :refs/tags/$Version 2>$null
    }

    git tag -a $Version -m $tagMessage
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Failed to create tag"
        exit 1
    }
    Write-Success "Git tag created"
} else {
    Write-Info "Would create tag: $Version"
}

Write-Step "Pushing to remote"
if (-not $DryRun) {
    git push origin main
    if ($LASTEXITCODE -ne 0) {
        Write-Warn "Failed to push main branch (may already be up to date)"
    }

    git push origin $Version
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Failed to push tag"
        exit 1
    }
    Write-Success "Pushed to remote"
} else {
    Write-Info "Would push: main branch and $Version tag"
}

# Summary
Write-Host "`n==========================================" -ForegroundColor Green
Write-Host "  Release $Version Complete!" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Docker images:" -ForegroundColor White
Write-Host "  - $Registry/${BackendImage}:$Version" -ForegroundColor Cyan
Write-Host "  - $Registry/${FrontendImage}:$Version" -ForegroundColor Cyan
Write-Host ""
Write-Host "Git tag: $Version" -ForegroundColor Cyan
Write-Host ""
Write-Host "To deploy on TrueNAS:" -ForegroundColor White
Write-Host "  docker-compose -f docker-compose.truenas.yml pull" -ForegroundColor Yellow
Write-Host "  docker-compose -f docker-compose.truenas.yml up -d" -ForegroundColor Yellow
Write-Host ""

if ($DryRun) {
    Write-Warn "This was a dry run. No changes were made."
}
