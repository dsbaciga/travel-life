# Release Checklist

Comprehensive checklist for releasing new versions of Travel Life.

## How a release is published

**CI is the single publisher of container images.** Pushing a `v*` tag triggers
`.github/workflows/release.yml`, which builds from a clean checkout of the tagged commit,
pushes to `ghcr.io`, and creates the GitHub Release from the matching `CHANGELOG.md` section.

**Never push to `main`.** `main` is protected: every change, including the release version
bump, reaches it through a pull request (squash or rebase merge; merge commits are rejected).

`release.ps1` therefore releases in two phases. Phase 1 opens a `release/vX.Y.Z` PR with the
version bump; once it is merged, phase 2 (`-Tag`) tags the merged commit on `main` and pushes
**only the tag**. The scripts never build or push images, and you must not push images by
hand. See [docs/guides/BUILD_AND_PUSH.md](docs/guides/BUILD_AND_PUSH.md) for the reasoning.

The steps below are ordered to match the script:
release PR (version bump, changelog, compose defaults, build check) → merge PR → tag main →
CI publishes.

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

### Phase 1: open the release PR

Start from a clean `main` that matches `origin/main` (merge feature branches through their
own PRs first). Make sure `CHANGELOG.md` has entries under `## [Unreleased]` — CI uses that
section as the GitHub Release body.

```powershell
.\release.ps1 -Version patch -NoConfirm      # or minor / major / vX.Y.Z
```

The script, in order:

- [ ] Creates the branch `release/vX.Y.Z`
- [ ] Bumps `backend/package.json` and `frontend/package.json` (the only places the version
      lives; there is no `VERSION` file)
- [ ] Promotes `[Unreleased]` in `CHANGELOG.md` to `## [X.Y.Z] - YYYY-MM-DD`
- [ ] Bumps the `APP_VERSION` default in both TrueNAS compose files
- [ ] Builds backend and frontend — a failing build aborts the release
- [ ] Commits only those files, pushes the branch and opens a PR titled `Release vX.Y.Z`

`release.sh` is disabled until it is ported to this flow; use `release.ps1` (PowerShell 7
runs on Linux/Mac too).

### Build Verification

The script runs these for you; run them yourself when releasing manually.

```bash
cd backend && npm run build
cd ../frontend && npm run build
```

- [ ] Backend builds with no TypeScript errors
- [ ] Frontend builds with no TypeScript errors and a reasonable bundle size

## Merge the Release PR

- [ ] PR checks are green
- [ ] Merge with **squash or rebase** (merge commits are rejected on `main`)
- [ ] Update local `main`:

```bash
git switch main
git pull --ff-only origin main
```

## Publish

### Phase 2: tag main (this is what publishes)

```powershell
.\release.ps1 -Tag
```

The script fast-forwards `main`, checks that `backend` and `frontend` agree on the merged
version, refuses if the tag already exists (it never deletes or recreates one), creates the
annotated tag and pushes **only the tag**. That push triggers CI.

- [ ] Tag created and pushed
- [ ] Verify the tag on GitHub

Manual equivalent, from an up-to-date `main`:

```bash
git tag -a vX.X.X -m "vX.X.X - Brief description"
git push origin vX.X.X
```

### Watch CI Publish

- [ ] "Build and Release" workflow is green
      (<https://github.com/dsbaciga/travel-life/actions>)
- [ ] Images `X.X.X`, `vX.X.X` and `latest` appear on GitHub Packages
- [ ] GitHub Release created with the `CHANGELOG.md` notes for this version
- [ ] `travel-life-X.Y.Z.apk` is attached to the release (the Android build is the slowest
      job and runs independently of the images; a failed APK build leaves the images and the
      release published without it)

## Post-Release

### Deployment

- [ ] Deploy to staging environment (if applicable)
- [ ] Verify staging deployment
- [ ] Deploy to production
- [ ] Run database migrations in production
      (`docker exec travel-life-backend npx prisma migrate deploy`) — new images do not apply
      them, and the release notes list any new migrations
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

The TrueNAS compose files deploy `${APP_VERSION}`, so rolling back is a variable change:

```bash
APP_VERSION=<previous tag> docker-compose -f docker-compose.truenas.yml pull
APP_VERSION=<previous tag> docker-compose -f docker-compose.truenas.yml up -d
```

For `docker-compose.prod.yml`:

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

### Phase 1 (non-interactive)

```powershell
.\release.ps1 -Version patch -NoConfirm
```

### Phase 2 (after the PR is merged)

```powershell
.\release.ps1 -Tag
```

### Dry Run (Preview)

```powershell
# Preview either phase without changing anything
.\release.ps1 -Version patch -DryRun
.\release.ps1 -Tag -DryRun
```

### Skip Build Verification

```powershell
# Only if you have already verified the builds; CI will still build the images
.\release.ps1 -Version patch -NoConfirm -SkipBuild
```

## Common Issues

### Build Failures

- Check for TypeScript errors
- Verify all dependencies are installed
- Clear node_modules and reinstall

### Tag Already Exists

`-Tag` refuses when the tag exists locally or on `origin`. Prefer releasing the next patch
version. Only delete a tag if it was never published — deleting a shipped tag removes it for
everyone, and CI has already built images from it. Do it by hand, deliberately:

```bash
git tag -d vX.X.X
git push origin :refs/tags/vX.X.X
```

### The Release PR Cannot Be Merged

Do not push to `main` to work around it. `main` rejects merge commits and requires a PR, so
fix the failing check on the `release/vX.Y.Z` branch, or squash/rebase-merge instead.

### Pushed a Release Branch But the PR Did Not Open

The branch is already on `origin`. Open the PR by hand:
`gh pr create --base main --head release/vX.Y.Z --title "Release vX.Y.Z" --fill`.

## Related Documentation

- [docs/guides/BUILD_AND_PUSH.md](docs/guides/BUILD_AND_PUSH.md) - Detailed build process
- [DEPLOYMENT.md](DEPLOYMENT.md) - Deployment guide
- [QUICK_START_PRODUCTION.md](QUICK_START_PRODUCTION.md) - Quick setup
