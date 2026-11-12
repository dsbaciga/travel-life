#!/bin/bash

# Travel Life Release Script (Linux/Mac)
#
# Bumps the version, updates the changelog, commits and tags.
#
# IMAGE PUBLISHING IS DONE BY CI, NOT BY THIS SCRIPT.
# Pushing the tag triggers .github/workflows/release.yml, which is the single
# authoritative publisher of ghcr.io images and of the GitHub Release.
# See docs/guides/BUILD_AND_PUSH.md.
#
# Usage:
#   ./release.sh patch          # 5.6.0 -> 5.6.1
#   ./release.sh minor          # 5.6.0 -> 5.7.0
#   ./release.sh major          # 5.6.0 -> 6.0.0
#   ./release.sh 5.6.1          # explicit version
#   ./release.sh v5.6.1         # explicit version (leading v is stripped)

set -euo pipefail

# main is protected: all changes go through a pull request, and this script pushes
# main directly. It has not been updated for the two-phase PR flow, so it refuses to
# run. Use release.ps1 (see docs/guides/BUILD_AND_PUSH.md).
echo "release.sh is disabled: releases go through a PR. Use release.ps1 (see docs/guides/BUILD_AND_PUSH.md)." >&2
exit 1


# Must run from the repository root
if [ ! -f backend/package.json ] || [ ! -f frontend/package.json ]; then
    echo "ERROR: run this script from the travel-life root directory" >&2
    exit 1
fi

# The version is tracked ONLY in the two package.json files; there is no VERSION file.
read_package_version() {
    sed -n 's/.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$1" | head -n 1
}

CURRENT_VERSION=$(read_package_version backend/package.json)
if [ -z "$CURRENT_VERSION" ]; then
    echo "ERROR: could not read the version from backend/package.json" >&2
    exit 1
fi

VERSION_TYPE=${1:-"patch"}

echo "========================================="
echo "Travel Life Release Manager"
echo "========================================="
echo "Current version: $CURRENT_VERSION"
echo ""

# Parse current version
IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
MAJOR="${VERSION_PARTS[0]}"
MINOR="${VERSION_PARTS[1]}"
PATCH="${VERSION_PARTS[2]}"

# Calculate new version
case $VERSION_TYPE in
    major)
        NEW_VERSION="$((MAJOR + 1)).0.0"
        ;;
    minor)
        NEW_VERSION="${MAJOR}.$((MINOR + 1)).0"
        ;;
    patch)
        NEW_VERSION="${MAJOR}.${MINOR}.$((PATCH + 1))"
        ;;
    *)
        # Custom version provided. Strip a leading v/V so that `./release.sh v5.6.1`
        # writes valid semver into package.json and tags v5.6.1 (not vv5.6.1).
        NEW_VERSION="${VERSION_TYPE#[vV]}"
        ;;
esac

# Validate the resulting version is plain semver (x.y.z with optional pre-release)
if ! printf '%s' "$NEW_VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+([-+][0-9A-Za-z.-]+)?$'; then
    echo "ERROR: '$NEW_VERSION' is not a valid version (expected x.y.z)" >&2
    exit 1
fi

echo "New version will be: $NEW_VERSION"
echo "Git tag will be:     v$NEW_VERSION"
echo ""
read -p "Continue with release? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Release cancelled."
    exit 0
fi

# Update package.json files
sed -i.bak "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" backend/package.json
rm backend/package.json.bak
echo "[OK] Updated backend/package.json"

sed -i.bak "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" frontend/package.json
rm frontend/package.json.bak
echo "[OK] Updated frontend/package.json"

# Update CHANGELOG.md (best effort - never abort a release over the changelog,
# and never leave a half-applied version bump behind).
CHANGED_FILES=(backend/package.json frontend/package.json)
TODAY=$(date +%Y-%m-%d)
if [ -f CHANGELOG.md ]; then
    if grep -q "^## \[$NEW_VERSION\]" CHANGELOG.md; then
        echo "[--] CHANGELOG.md already has a section for $NEW_VERSION"
        CHANGED_FILES+=(CHANGELOG.md)
    elif grep -q '^## \[Unreleased\]' CHANGELOG.md; then
        # awk rather than sed: GNU and BSD sed disagree about \n in the replacement
        awk -v ver="$NEW_VERSION" -v today="$TODAY" '
            !inserted && /^## \[Unreleased\]/ {
                print
                print ""
                print "## [" ver "] - " today
                inserted = 1
                next
            }
            { print }
        ' CHANGELOG.md > CHANGELOG.md.tmp
        mv CHANGELOG.md.tmp CHANGELOG.md
        echo "[OK] CHANGELOG.md: [Unreleased] promoted to [$NEW_VERSION]"
        CHANGED_FILES+=(CHANGELOG.md)
    else
        echo "[!!] CHANGELOG.md has no [Unreleased] section - skipping changelog update"
    fi
else
    echo "[!!] CHANGELOG.md not found - the GitHub Release body will use a generic note"
fi

# Build verification - a failing build must stop the release
echo ""
echo "Verifying backend build..."
(cd backend && npm run build)
echo "[OK] Backend build succeeded"

echo ""
echo "Verifying frontend build..."
(cd frontend && npm run build)
echo "[OK] Frontend build succeeded"

# Git operations
if [ -d .git ]; then
    echo ""
    echo "Committing changes..."
    git add "${CHANGED_FILES[@]}"
    git commit -m "Bump version to v$NEW_VERSION"
    echo "[OK] Changes committed"

    echo ""
    if git rev-parse -q --verify "refs/tags/v$NEW_VERSION" >/dev/null; then
        echo "ERROR: tag v$NEW_VERSION already exists locally." >&2
        echo "       Pick a different version, or delete the tag deliberately:" >&2
        echo "         git tag -d v$NEW_VERSION && git push origin :refs/tags/v$NEW_VERSION" >&2
        exit 1
    fi
    echo "Creating git tag..."
    git tag -a "v$NEW_VERSION" -m "Release version $NEW_VERSION"
    echo "[OK] Tag created: v$NEW_VERSION"
fi

# Optional local Docker build (verification only - images are NOT pushed from here)
echo ""
read -p "Build Docker images locally for verification? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    ./build.sh "v$NEW_VERSION"
fi

echo ""
echo "========================================="
echo "Release v$NEW_VERSION prepared!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Review changes: git log -1 && git show v$NEW_VERSION --stat"
echo "  2. Push:           git push origin main && git push origin v$NEW_VERSION"
echo "     Pushing the tag triggers CI, which builds and publishes the images"
echo "     to ghcr.io and creates the GitHub Release. Nothing is published"
echo "     until the tag is pushed and that workflow goes green."
echo "  3. Deploy once CI is green (pin the version):"
echo "     APP_VERSION=v$NEW_VERSION docker-compose -f docker-compose.truenas.yml pull"
echo "     APP_VERSION=v$NEW_VERSION docker-compose -f docker-compose.truenas.yml up -d"
echo ""
