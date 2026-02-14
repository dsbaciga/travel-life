# Release Checklist

Comprehensive checklist for releasing new versions of Travel Life.

## Pre-Release

### Code Quality

- [ ] All features for this release are complete
- [ ] Code has been reviewed (if applicable)
- [ ] No console.log statements left in production code
- [ ] No TODO/FIXME comments for this release scope
- [ ] TypeScript compiles without errors

### Testing

- [ ] Manual testing of new features completed
- [ ] Regression testing on critical paths:
  - [ ] User registration and login
  - [ ] Trip creation and editing
  - [ ] Photo upload (local and Immich)
  - [ ] Timeline view
  - [ ] Search functionality
- [ ] Cross-browser testing (Chrome, Firefox, Safari)
- [ ] Mobile responsiveness verified

### Documentation

- [ ] CLAUDE.md updated if architecture changed
- [ ] API documentation updated for new endpoints
- [ ] User-facing changes documented
- [ ] CHANGELOG.md updated with changes

## Version Bump

### Determine Version Type

- **PATCH** (x.x.1): Bug fixes, minor improvements, no new features
- **MINOR** (x.1.0): New features, backwards compatible
- **MAJOR** (1.0.0): Breaking changes, major refactors

### Update Version Numbers

Using automated script (recommended):

```powershell
.\release.ps1 -Version patch -NoConfirm
```

Or manually update:

- [ ] `backend/package.json` - version field
- [ ] `frontend/package.json` - version field
- [ ] `VERSION` file (if exists)

## Build Verification

### Backend

```bash
cd backend
npm run build
```

- [ ] Build completes successfully
- [ ] No TypeScript errors
- [ ] No critical warnings

### Frontend

```bash
cd frontend
npm run build
```

- [ ] Build completes successfully
- [ ] No TypeScript errors
- [ ] Bundle size is reasonable

## Docker Build

### Build Images

```powershell
# Windows
.\build.truenas.ps1 -Version vX.X.X -Registry ghcr.io/dsbaciga

# Linux/Mac
./build.sh vX.X.X
```

- [ ] Backend image builds successfully
- [ ] Frontend image builds successfully
- [ ] Images tagged with version and latest

### Test Images Locally

```bash
docker-compose -f docker-compose.prod.yml up -d
```

- [ ] All containers start
- [ ] Backend health check passes
- [ ] Frontend loads correctly
- [ ] Database migrations run

## Publish

### Push Docker Images

```bash
docker push ghcr.io/dsbaciga/travel-life-backend:vX.X.X
docker push ghcr.io/dsbaciga/travel-life-frontend:vX.X.X
docker push ghcr.io/dsbaciga/travel-life-backend:latest
docker push ghcr.io/dsbaciga/travel-life-frontend:latest
```

- [ ] Backend image pushed
- [ ] Frontend image pushed
- [ ] Verify on GitHub Packages

### Git Operations

```bash
# Commit version changes
git add -A
git commit -m "Release vX.X.X"

# Create annotated tag
git tag -a vX.X.X -m "vX.X.X - Brief description"

# Push to remote
git push origin main
git push origin vX.X.X
```

- [ ] Changes committed
- [ ] Tag created
- [ ] Tag pushed to remote
- [ ] Verify tag on GitHub

### GitHub Release (Optional)

- [ ] Create GitHub release from tag
- [ ] Add release notes
- [ ] Attach any relevant assets

## Post-Release

### Deployment

- [ ] Deploy to staging environment (if applicable)
- [ ] Verify staging deployment
- [ ] Deploy to production
- [ ] Run database migrations in production
- [ ] Verify production deployment

### Verification

- [ ] Production health checks pass
- [ ] Key features work correctly
- [ ] No error spikes in logs
- [ ] Performance is acceptable

### Documentation Updates

- [ ] Update docs/development/IMPLEMENTATION_STATUS.md
- [ ] Close related GitHub issues
- [ ] Update project board/milestones

### Communication

- [ ] Notify users of new release (if applicable)
- [ ] Update changelog/release notes
- [ ] Document any migration steps needed

## Rollback Plan

If issues are discovered post-release:

### Quick Rollback

```bash
# Pull previous version
docker pull ghcr.io/dsbaciga/travel-life-backend:vX.X.X-1
docker pull ghcr.io/dsbaciga/travel-life-frontend:vX.X.X-1

# Update docker-compose to use previous version
# Then restart
docker-compose -f docker-compose.prod.yml up -d
```

### Database Rollback (if needed)

```bash
# Restore from backup
docker exec -i travel-life-db psql -U travel_life_user travel_life < backup.sql
```

## Automation Options

### Fully Automated Release

```powershell
# Non-interactive release with all steps
.\release.ps1 -Version patch -NoConfirm
```

### Dry Run (Preview)

```powershell
# See what would happen without making changes
.\release.ps1 -Version patch -DryRun
```

### Skip Build Verification

```powershell
# If you've already verified builds
.\release.ps1 -Version patch -NoConfirm -SkipBuild
```

## Common Issues

### Build Failures

- Check for TypeScript errors
- Verify all dependencies are installed
- Clear node_modules and reinstall

### Docker Push Authentication

```bash
# Re-authenticate with GitHub Container Registry
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin
```

### Tag Already Exists

```bash
# Delete and recreate tag
git tag -d vX.X.X
git push origin :refs/tags/vX.X.X
git tag -a vX.X.X -m "Description"
git push origin vX.X.X
```

## Related Documentation

- [docs/guides/BUILD_AND_PUSH.md](docs/guides/BUILD_AND_PUSH.md) - Detailed build process
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment guide
- [QUICK_START_PRODUCTION.md](QUICK_START_PRODUCTION.md) - Quick setup
