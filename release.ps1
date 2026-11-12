<#
.SYNOPSIS
    Automated release script for Travel Life

.DESCRIPTION
    This script prepares and publishes a release:
    1. Updates version numbers in package.json files
    2. Verifies the backend and frontend builds (ABORTS on failure)
    3. Commits the version bump
    4. Creates and pushes the git tag

    This script does NOT build Docker images. It used to, as "verification", but
    it built different images than CI publishes (see the note above Step 5) and
    a passing local build masked a broken published one.

    IMAGE PUBLISHING IS DONE BY CI, NOT BY THIS SCRIPT.
    Pushing the tag triggers .github/workflows/release.yml, which is the single
    authoritative publisher of ghcr.io images and of the GitHub Release.
    See docs/guides/BUILD_AND_PUSH.md for the rationale.

.PARAMETER Version
    The version number (e.g., v1.12.6 or 1.12.6)
    Can also be "patch", "minor", or "major" to auto-increment

.PARAMETER SkipBuild
    Skip the npm build verification step. Not recommended: it is the only local
    gate left before the tag is pushed, and CI will fail later instead.

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
    # patch|minor|major or an explicit version. Required for phase 1; optional with -Tag
    # (the version is then read from package.json).
    [string]$Version = "",

    # Phase 2: after the release PR is merged, tag the merged commit on main and push the tag.
    [switch]$Tag,

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

if ($Tag) {
    # Phase 2 never bumps: the version was already bumped by the merged release PR.
    $NumericVersion = $CurrentVersion
    if ($Version -and $Version.TrimStart("v") -ne $CurrentVersion) {
        Write-Err "-Tag tags the version already in package.json ($CurrentVersion), but -Version is $Version."
        Write-Err "Is the release PR merged and main up to date?"
        exit 1
    }
} else {
    if (-not $Version) {
        Write-Err "-Version is required (patch|minor|major or an explicit version)."
        exit 1
    }
    $NumericVersion = switch ($Version.ToLower()) {
        "patch" { "$Major.$Minor.$($Patch + 1)" }
        "minor" { "$Major.$($Minor + 1).0" }
        "major" { "$($Major + 1).0.0" }
        default { $Version.TrimStart("v") }
    }
}

# Ensure Version variable has 'v' prefix for tags
$Version = "v$NumericVersion"

Write-Host "`n==========================================" -ForegroundColor Magenta
Write-Host "  Travel Life Release Script" -ForegroundColor Magenta
Write-Host "==========================================" -ForegroundColor Magenta
if ($Tag) {
    Write-Host "Tagging version: $NumericVersion (phase 2: tag merged main)"
} else {
    Write-Host "Current version: $CurrentVersion"
    Write-Host "New version:     $NumericVersion (phase 1: release PR)"
}
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

# ---------------------------------------------------------------------------
# Phase 2 (-Tag): tag the merged release commit on main and push ONLY the tag.
#
# main is protected: every change reaches it through a pull request, so this script
# never pushes main. Pushing the tag is what triggers CI to build and publish.
# ---------------------------------------------------------------------------
if ($Tag) {
    Write-Step "Preparing to tag $Version"

    $currentBranch = git branch --show-current
    if ($currentBranch -ne "main") {
        Write-Err "Tag from main (currently on '$currentBranch'). Merge the release PR, then: git switch main"
        exit 1
    }
    if (git status --porcelain) {
        Write-Err "Working tree is not clean. Commit or stash before tagging."
        exit 1
    }

    git fetch origin main --tags --quiet
    if ($LASTEXITCODE -ne 0) { Write-Err "git fetch failed"; exit 1 }

    if ([int](git rev-list --count "origin/main..HEAD") -gt 0) {
        Write-Err "Local main has commits that are not on origin/main. Refusing to tag unpushed work."
        exit 1
    }
    if ([int](git rev-list --count "HEAD..origin/main") -gt 0) {
        Write-Info "Fast-forwarding local main to origin/main"
        if (-not $DryRun) {
            git merge --ff-only origin/main
            if ($LASTEXITCODE -ne 0) { Write-Err "Could not fast-forward main"; exit 1 }
        }
    }

    # Re-read after the fast-forward: the merged PR is what carries the version bump.
    $backendNow = (Get-Content "backend/package.json" -Raw | ConvertFrom-Json).version
    $frontendNow = (Get-Content "frontend/package.json" -Raw | ConvertFrom-Json).version
    if ($Version -and $Version.TrimStart("v") -ne $backendNow) {
        Write-Err "main is at version $backendNow, not $($Version.TrimStart('v')). Is the release PR merged?"
        exit 1
    }
    if ($frontendNow -ne $backendNow) {
        Write-Err "backend ($backendNow) and frontend ($frontendNow) versions differ on main."
        exit 1
    }
    $NumericVersion = $backendNow
    $Version = "v$NumericVersion"

    # Never delete or recreate a tag here: a published release tag is history.
    if (git tag -l $Version) { Write-Err "Tag $Version already exists locally."; exit 1 }
    if (git ls-remote --tags origin "refs/tags/$Version") { Write-Err "Tag $Version already exists on origin."; exit 1 }

    $tagMessage = if ($Description) { "$Version - $Description" } else { "$Version - Release" }
    Write-Info "Tagging $(git rev-parse --short HEAD): $tagMessage"

    if (-not $DryRun) {
        git tag -a $Version -m $tagMessage
        if ($LASTEXITCODE -ne 0) { Write-Err "Failed to create tag"; exit 1 }
        git push origin $Version
        if ($LASTEXITCODE -ne 0) { Write-Err "Failed to push tag"; exit 1 }
        Write-Success "Tag $Version pushed"
    } else {
        Write-Info "Would create and push tag $Version"
    }

    Write-Host ""
    Write-Host "CI is now building and PUBLISHING the images (this script does not push them):" -ForegroundColor White
    Write-Host "  - $Registry/${BackendImage}:$Version  (and :$NumericVersion, :latest)" -ForegroundColor Cyan
    Write-Host "  - $Registry/${FrontendImage}:$Version  (and :$NumericVersion, :latest)" -ForegroundColor Cyan
    Write-Host "Watch the run: https://github.com/dsbaciga/travel-life/actions" -ForegroundColor Yellow
    Write-Host "Wait for it to go green BEFORE deploying." -ForegroundColor Yellow
    exit 0
}

# Step 1: Preconditions for the release PR
Write-Step "Checking git status"
$currentBranch = git branch --show-current
if ($currentBranch -ne "main") {
    Write-Err "Start from main (currently on '$currentBranch'). Merge your feature branch through a PR first."
    exit 1
}
if (git status --porcelain) {
    Write-Err "Working tree is not clean. The release PR must contain only the version bump - commit or stash first."
    exit 1
}
git fetch origin main --quiet
if ($LASTEXITCODE -ne 0) { Write-Err "git fetch failed"; exit 1 }
if ((git rev-parse HEAD) -ne (git rev-parse origin/main)) {
    Write-Err "Local main is not identical to origin/main. Run: git pull --ff-only origin main"
    exit 1
}
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Err "The GitHub CLI (gh) is required to open the release PR."
    exit 1
}
$releaseBranch = "release/$Version"
if (git branch --list $releaseBranch) { Write-Err "Branch $releaseBranch already exists locally."; exit 1 }
if (git ls-remote --heads origin $releaseBranch) { Write-Err "Branch $releaseBranch already exists on origin."; exit 1 }
if (-not $DryRun) {
    git switch -c $releaseBranch
    if ($LASTEXITCODE -ne 0) { Write-Err "Could not create $releaseBranch"; exit 1 }
}
Write-Success "Git status checked (release branch: $releaseBranch)"

# Step 2: Update version in package.json files
Write-Step "Updating version to $NumericVersion"

Write-Info "Backend: $CurrentVersion -> $NumericVersion"
Write-Info "Frontend: $CurrentVersion -> $NumericVersion"

if (-not $DryRun) {
    # These files are UTF-8. `Get-Content -Raw` without -Encoding uses the system ANSI
    # codepage on Windows PowerShell 5.1, so multibyte characters are misread and then
    # re-encoded as UTF-8 by WriteAllText - double-encoding every em-dash and accent in
    # the changelog (which CI publishes verbatim as the Release body). Always read UTF-8.

    # Update backend package.json (preserve formatting)
    $backendContent = Get-Content "backend/package.json" -Raw -Encoding UTF8
    $backendContent = $backendContent -replace '"version":\s*"[^"]*"', "`"version`": `"$NumericVersion`""
    [System.IO.File]::WriteAllText("$PWD/backend/package.json", $backendContent)

    # Update frontend package.json (preserve formatting)
    $frontendContent = Get-Content "frontend/package.json" -Raw -Encoding UTF8
    $frontendContent = $frontendContent -replace '"version":\s*"[^"]*"', "`"version`": `"$NumericVersion`""
    [System.IO.File]::WriteAllText("$PWD/frontend/package.json", $frontendContent)

    # Promote the [Unreleased] section to this version in CHANGELOG.md.
    # The release workflow reads this section for the GitHub Release body.
    if (Test-Path "CHANGELOG.md") {
        $changelogContent = Get-Content "CHANGELOG.md" -Raw -Encoding UTF8
        $escapedVersion = [regex]::Escape($NumericVersion)
        if ($changelogContent -match "(?m)^##\s+\[$escapedVersion\]") {
            Write-Info "CHANGELOG.md already has a section for $NumericVersion"
        } elseif ($changelogContent -match "(?m)^##\s+\[Unreleased\]") {
            $today = Get-Date -Format "yyyy-MM-dd"
            $changelogContent = $changelogContent -replace "(?m)^##\s+\[Unreleased\].*$", "## [Unreleased]`n`n## [$NumericVersion] - $today"
            [System.IO.File]::WriteAllText("$PWD/CHANGELOG.md", $changelogContent)
            Write-Success "CHANGELOG.md: [Unreleased] promoted to [$NumericVersion]"
        } else {
            Write-Warn "CHANGELOG.md has no [Unreleased] section - skipping changelog update"
        }
    } else {
        Write-Warn "CHANGELOG.md not found - the GitHub Release body will use a generic note"
    }

    # TrueNAS compose files pin ${APP_VERSION:-vX.Y.Z}; bump the default in the same PR
    # so no separate commit to main is needed after the release.
    foreach ($composeFile in @("docker-compose.truenas.yml", "docker-compose.truenas.optimized.yml")) {
        if (Test-Path $composeFile) {
            $composeContent = Get-Content $composeFile -Raw -Encoding UTF8
            $composeContent = $composeContent -replace 'APP_VERSION:-v[0-9][^}]*\}', "APP_VERSION:-v$NumericVersion}"
            [System.IO.File]::WriteAllText("$PWD/$composeFile", $composeContent)
        }
    }
}
Write-Success "Version updated in package.json and compose files"

# Helper: run "npm run build" in a package directory and return the real exit code.
# NOTE: `$ErrorActionPreference = "Stop"` plus `2>&1` on a native command turns any
# stderr output (vite progress, npm notices) into a terminating NativeCommandError,
# which is why the old try/catch here reported false failures for the frontend and
# false successes for the backend. Exit code is the only reliable signal.
function Invoke-PackageBuild {
    param(
        [Parameter(Mandatory = $true)][string]$Directory,
        [Parameter(Mandatory = $true)][ref]$OutputRef
    )

    if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
        $OutputRef.Value = @("npm was not found on PATH")
        return 127
    }

    Push-Location $Directory
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    # Clear the previous command's exit code so a command that never ran cannot be
    # mistaken for a success carried over from an earlier call.
    $global:LASTEXITCODE = $null
    try {
        $OutputRef.Value = & npm run build 2>&1
        if ($null -eq $LASTEXITCODE) {
            # npm never produced an exit code (it failed to launch)
            return 127
        }
        return $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
        Pop-Location
    }
}

# Helper: abort (or prompt, when interactive) on a failed verification build.
function Assert-BuildSucceeded {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][int]$ExitCode,
        $Output
    )

    if ($ExitCode -eq 0) {
        Write-Success "$Name build completed"
        return
    }

    Write-Err "$Name build FAILED (exit code $ExitCode)"
    if ($Output) {
        Write-Info "--- last 30 lines of build output ---"
        @($Output) | Select-Object -Last 30 | ForEach-Object { Write-Info $_ }
    }

    if ($NoConfirm) {
        Write-Err "Aborting release. Fix the $Name build and re-run."
        exit 1
    }

    $response = Read-Host "Continue the release anyway with a FAILING $Name build? (y/N)"
    if ($response -ne 'y' -and $response -ne 'Y') {
        Write-Err "Aborting release. Fix the $Name build and re-run."
        exit 1
    }
    Write-Warn "Continuing despite the failed $Name build (explicit operator override)"
}

# Step 3: Build verification (unless skipped)
if (-not $SkipBuild) {
    Write-Step "Building backend (verification)"
    if (-not $DryRun) {
        $backendOutput = $null
        $backendExit = Invoke-PackageBuild -Directory "backend" -OutputRef ([ref]$backendOutput)
        Assert-BuildSucceeded -Name "Backend" -ExitCode $backendExit -Output $backendOutput
    } else {
        Write-Info "Would run: npm run build (backend)"
    }

    Write-Step "Building frontend (verification)"
    if (-not $DryRun) {
        $frontendOutput = $null
        $frontendExit = Invoke-PackageBuild -Directory "frontend" -OutputRef ([ref]$frontendOutput)
        Assert-BuildSucceeded -Name "Frontend" -ExitCode $frontendExit -Output $frontendOutput

        # Secondary sanity check: vite prints "built in <time>" on a successful bundle.
        # Informational only - the exit code above is the gate.
        if ($frontendExit -eq 0 -and -not (@($frontendOutput) -match "built in")) {
            Write-Warn "Frontend build exited 0 but no 'built in' line was found in the output"
        }
    } else {
        Write-Info "Would run: npm run build (frontend)"
    }
} else {
    Write-Warn "Skipping build verification"
}

# Step 4: Commit the version bump on the release branch
Write-Step "Committing changes"

if ($CommitMessage) {
    $finalCommitMessage = "$CommitMessage`n`nBump version to $Version"
} else {
    $finalCommitMessage = "Bump version to $Version"
}

# Explicit paths: the PR must contain only the release bump.
$releaseFiles = @("backend/package.json", "frontend/package.json", "CHANGELOG.md",
                  "docker-compose.truenas.yml", "docker-compose.truenas.optimized.yml")

# NOTE: there is deliberately no local Docker build here. CI builds the real images
# from the tagged commit (see docs/guides/BUILD_AND_PUSH.md); a local build proves nothing.

if (-not $DryRun) {
    git add -- ($releaseFiles | Where-Object { Test-Path $_ })
    git commit -m $finalCommitMessage
    if ($LASTEXITCODE -ne 0) { Write-Err "Nothing to commit - version bump produced no changes"; exit 1 }
    Write-Success "Version bump committed"
} else {
    Write-Info "Would commit: $finalCommitMessage"
}

# Step 5: Push the release branch and open the PR. main is never pushed to directly.
Write-Step "Opening release PR"
if (-not $DryRun) {
    git push -u origin $releaseBranch
    if ($LASTEXITCODE -ne 0) { Write-Err "Failed to push $releaseBranch"; exit 1 }

    $prBody = "Release $Version. Bumps backend/frontend to $NumericVersion, promotes the CHANGELOG [Unreleased] section and bumps the TrueNAS APP_VERSION defaults.`n`nAfter merging (squash or rebase - main rejects merge commits), tag it with: ``.\release.ps1 -Tag``"
    gh pr create --base main --head $releaseBranch --title "Release $Version" --body $prBody
    if ($LASTEXITCODE -ne 0) { Write-Err "Failed to open the PR (branch $releaseBranch is pushed)"; exit 1 }
    Write-Success "Release PR opened"
} else {
    Write-Info "Would push $releaseBranch and open a PR titled 'Release $Version'"
}

Write-Host "`n==========================================" -ForegroundColor Green
Write-Host "  Release PR for $Version is open" -ForegroundColor Green
Write-Host "==========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next:" -ForegroundColor White
Write-Host "  1. Get the PR merged (squash or rebase; no merge commits)." -ForegroundColor Yellow
Write-Host "  2. git switch main; git pull --ff-only origin main" -ForegroundColor Yellow
Write-Host "  3. .\release.ps1 -Tag     # tags main and pushes the tag; CI publishes" -ForegroundColor Yellow
Write-Host ""

if ($DryRun) {
    Write-Warn "This was a dry run. No changes were made."
}
