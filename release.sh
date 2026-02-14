#!/bin/bash

# Travel Life Release Script
# Automates version bumping, tagging, and building releases

set -e

CURRENT_VERSION=$(cat VERSION)
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
        # Custom version provided
        NEW_VERSION=$VERSION_TYPE
        ;;
esac

echo "New version will be: $NEW_VERSION"
echo ""
read -p "Continue with release? (y/N): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Release cancelled."
    exit 0
fi

# Update VERSION file
echo "$NEW_VERSION" > VERSION
echo "✓ Updated VERSION file"

# Update package.json files
if [ -f backend/package.json ]; then
    sed -i.bak "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" backend/package.json
    rm backend/package.json.bak
    echo "✓ Updated backend/package.json"
fi

if [ -f frontend/package.json ]; then
    sed -i.bak "s/\"version\": \".*\"/\"version\": \"$NEW_VERSION\"/" frontend/package.json
    rm frontend/package.json.bak
    echo "✓ Updated frontend/package.json"
fi

# Update CHANGELOG.md
TODAY=$(date +%Y-%m-%d)
sed -i.bak "s/## \[Unreleased\]/## [Unreleased]\n\n## [$NEW_VERSION] - $TODAY/" CHANGELOG.md
rm CHANGELOG.md.bak
echo "✓ Updated CHANGELOG.md"

# Git operations
if [ -d .git ]; then
    echo ""
    echo "Committing changes..."
    git add VERSION backend/package.json frontend/package.json CHANGELOG.md
    git commit -m "Release v$NEW_VERSION"
    echo "✓ Changes committed"

    echo ""
    echo "Creating git tag..."
    git tag -a "v$NEW_VERSION" -m "Release version $NEW_VERSION"
    echo "✓ Tag created: v$NEW_VERSION"

    echo ""
    echo "To push the release:"
    echo "  git push origin main"
    echo "  git push origin v$NEW_VERSION"
fi

# Build release
echo ""
read -p "Build Docker images for this release? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    ./build.sh "v$NEW_VERSION"
fi

echo ""
echo "========================================="
echo "Release v$NEW_VERSION Complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Review changes: git log -1"
echo "  2. Push to remote: git push origin main && git push origin v$NEW_VERSION"
echo "  3. Create GitHub release (if applicable)"
echo "  4. Deploy: docker-compose -f docker-compose.prod.yml --env-file .env.production up -d"
echo ""
