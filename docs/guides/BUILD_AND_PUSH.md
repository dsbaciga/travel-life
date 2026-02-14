# Build and Push Checklist

This checklist outlines the proper steps to build, push, and tag a new version of Travel Life.

## Quick Start (Automated)

The easiest way to release a new version is using the automated release script:

```powershell
# Release with explicit version
.\release.ps1 -Version v1.12.6

# Auto-increment patch version (1.12.5 -> 1.12.6)
.\release.ps1 -Version patch

# Auto-increment minor version (1.12.5 -> 1.13.0)
.\release.ps1 -Version minor

# Non-interactive release (skip all confirmations)
.\release.ps1 -Version patch -NoConfirm

# Add a custom description for the tag
.\release.ps1 -Version v1.12.6 -Description "Fix Timeline issues"

# Preview what would happen without making changes
.\release.ps1 -Version v1.12.6 -DryRun
```

**For Claude Code**: When running automated releases, ALWAYS use the `-NoConfirm` option to skip interactive prompts:

```powershell
.\release.ps1 -Version patch -NoConfirm
```

The script automatically:

1. Updates version in `backend/package.json` and `frontend/package.json`
2. Commits the version bump
3. Builds and verifies backend and frontend
4. Builds Docker images via `build.truenas.ps1`
5. Pushes images to `ghcr.io/dsbaciga`
6. Creates annotated git tag
7. Pushes commits and tag to GitHub

---

## Manual Process

If you need to run steps manually, follow the sections below.

### Pre-Release Checklist

- [ ] All changes have been tested locally
- [ ] All code changes are committed
- [ ] Version number decided (patch/minor/major)

### Version Update

- [ ] **Update backend/package.json version**

  - File: `backend/package.json`
  - Update `"version": "X.X.X"` field

- [ ] **Update frontend/package.json version**

  - File: `frontend/package.json`
  - Update `"version": "X.X.X"` field

### Build Verification

- [ ] **Test backend build**

  ```bash
  cd backend && npm run build
  ```

  - Verify build completes (warnings are OK, errors are not)

- [ ] **Test frontend build**

  ```bash
  cd frontend && npm run build
  ```

  - Verify build completes with no blocking errors

### Docker Build

- [ ] **Build Docker images**

  ```powershell
  # Windows
  .\build.truenas.ps1 -Version vX.X.X -Registry ghcr.io/dsbaciga

  # Linux/Mac
  ./build.sh vX.X.X
  ```

  - Verify both backend and frontend images build successfully
  - Look for confirmation messages

### Push to Registry

- [ ] **Push backend image**

  ```bash
  docker push ghcr.io/dsbaciga/travel-life-backend:vX.X.X
  ```

- [ ] **Push frontend image**

  ```bash
  docker push ghcr.io/dsbaciga/travel-life-frontend:vX.X.X
  ```

- [ ] **Verify images on GHCR**

  - Check https://github.com/dsbaciga?tab=packages
  - Confirm new version appears in package list

### Git Tagging

- [ ] **Create annotated git tag**

  ```bash
  git tag -a vX.X.X -m "vX.X.X - Brief description of changes"
  ```

- [ ] **Push tag to GitHub**

  ```bash
  git push origin vX.X.X
  ```

- [ ] **Verify tag on GitHub**

  - Check https://github.com/dsbaciga/travel-life/tags
  - Confirm new tag appears

---

## Post-Release

- [ ] **Update IMPLEMENTATION_STATUS.md** (if applicable)

  - Document completed features
  - Update known issues

- [ ] **Test deployment**

  - Deploy to test environment if available
  - Verify basic functionality

---

## Common Issues and Solutions

### Issue: Forgot to update package.json

**Solution**:

1. Update package.json files
2. Rebuild images with correct version
3. Re-push to registry
4. Delete and recreate git tag

### Issue: Build fails

**Solution**:

1. Check error messages carefully
2. Fix code issues
3. Re-run build verification steps
4. Don't proceed to Docker build until local builds pass

### Issue: Docker push fails with authentication error

**Solution**:

```bash
# Re-authenticate with GHCR
docker login ghcr.io -u USERNAME
```

### Issue: Tag already exists

**Solution**:

```bash
# Delete local tag
git tag -d vX.X.X

# Delete remote tag
git push origin :refs/tags/vX.X.X

# Recreate tag
git tag -a vX.X.X -m "vX.X.X - Description"
git push origin vX.X.X
```

---

## Version Numbering Guide

Follow semantic versioning (MAJOR.MINOR.PATCH):

- **PATCH** (X.X.1): Bug fixes, small improvements
- **MINOR** (X.1.0): New features, backwards compatible
- **MAJOR** (1.0.0): Breaking changes, major refactors

---

## Quick Reference Commands

### Using the Release Script (Recommended)

```powershell
# Full automated release
.\release.ps1 -Version vX.X.X

# Non-interactive release (skip confirmations)
.\release.ps1 -Version vX.X.X -NoConfirm

# With custom description
.\release.ps1 -Version vX.X.X -Description "Description here"

# Skip local build verification (faster)
.\release.ps1 -Version vX.X.X -SkipBuild

# Dry run to preview
.\release.ps1 -Version vX.X.X -DryRun

# Combine options
.\release.ps1 -Version patch -NoConfirm -SkipBuild
```

### Manual Commands

```bash
# Full release sequence (replace X.X.X with version)
cd backend && npm run build
cd ../frontend && npm run build
cd ..
.\build.truenas.ps1 -Version vX.X.X -Registry ghcr.io/dsbaciga
docker push ghcr.io/dsbaciga/travel-life-backend:vX.X.X
docker push ghcr.io/dsbaciga/travel-life-frontend:vX.X.X
git tag -a vX.X.X -m "vX.X.X - Description"
git push origin vX.X.X
```

---

## Deployment Commands

### TrueNAS

Docker and docker-compose commands are not supported directly on TrueNAS. Use the TrueNAS Apps UI to update containers.

### Standard Production

```bash
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

---

## Related Files

- [release.ps1](../release.ps1) - Automated release script
- [build.truenas.ps1](../build.truenas.ps1) - Docker build script
- [RELEASE_CHECKLIST.md](../RELEASE_CHECKLIST.md) - More comprehensive release process
- [DEPLOYMENT.md](../DEPLOYMENT.md) - Production deployment guide
- [CLAUDE.md](../CLAUDE.md) - Project instructions for AI assistants
