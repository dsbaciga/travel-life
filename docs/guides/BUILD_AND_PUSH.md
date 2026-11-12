# Build and Push Checklist

This checklist outlines the proper steps to build, tag, and publish a new version of Travel Life.

## Who publishes images: CI, and only CI

**CI is the single publisher of container images.** `.github/workflows/release.yml` runs on
every `v*` tag push and is the only thing that pushes to `ghcr.io` or creates a GitHub
Release.

`release.ps1` / `release.sh` bump the version, verify the builds, commit, tag, and push the
tag. They build Docker images **locally as a final verification and deliberately do not push
them**.

Why: the scripts used to push `:vX.Y.Z` from a developer machine, and the tag push then made
CI build the same commit again and publish it as `:X.Y.Z`, `:X.X`, `:X` and `:latest`. Two
uncoordinated pipelines, two tag schemes, one commit — with different build args and caches
on each side, `:v1.2.3` and `:1.2.3` could silently differ. CI wins because it builds from a
clean checkout of the tagged commit with the repository's own variables.

CI publishes both `X.Y.Z` and `vX.Y.Z` tags (plus `X.Y`, `X` and `latest`), so existing
v-prefixed references keep working.

**Do not add a `docker push` back into the release scripts, and do not push images by hand.**
If you ever need the manual path back, disable the workflow's `build-and-push` job in the
same change — never leave both active.

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

The script does the following, **in this order** (this matches `release.ps1` exactly — build
verification happens *before* the commit):

1. Checks git status (prompts if there are uncommitted changes)
2. Updates version in `backend/package.json` and `frontend/package.json`, and promotes the
   `[Unreleased]` section of `CHANGELOG.md` to the new version
3. Builds and verifies backend and frontend — **a failing build aborts the release**
   (with `-NoConfirm` it exits immediately; interactively it requires an explicit override)
4. Commits the version bump
5. Creates the annotated git tag (prompts before deleting/recreating an existing tag;
   `-NoConfirm` skips that prompt, so double-check the version in automated runs)
6. Pushes the commit and the tag to GitHub

**The release scripts no longer build Docker images.** They used to, as a final
verification, but the local build used *different* Dockerfiles than CI publishes —
`Dockerfile.prod.truenas` for the frontend (which hardcodes `VITE_API_URL=/api`) instead of
CI's `Dockerfile.prod` (which takes it as a build-arg). In 6.0.0 that build-arg defaulted to
`http://localhost:5000/api`, so the local build passed while the published image was broken
for every user. A verification that can pass while the shipped artifact is broken is worse
than none, because its success is taken as evidence. **CI building the tagged commit from a
clean checkout is the only real gate — watch the run.**

`build.truenas.ps1` still exists for building images locally by hand, but a successful run
of it says nothing about what CI will publish.

On Linux/Mac use `release.sh`, which follows the same order:

```bash
./release.sh patch          # or minor / major
./release.sh v1.12.6        # explicit version; a leading "v" is stripped for package.json
```

Pushing the tag triggers `release.yml`, which builds and **publishes** the images and creates
the GitHub Release. Watch <https://github.com/dsbaciga/travel-life/actions> and wait for it to
go green before deploying.

---

## Manual Process

If you need to run steps manually, follow the sections below.

### Pre-Release Checklist

- [ ] All changes have been tested locally
- [ ] All code changes are committed
- [ ] Version number decided (patch/minor/major)
- [ ] `CHANGELOG.md` has an `[Unreleased]` section describing this release — CI uses it
      verbatim as the GitHub Release body, so an empty section ships an empty release note
- [ ] Any new migration is listed in the release notes, and
      [prisma/migrations/README.md](../../backend/prisma/migrations/README.md) is current

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

### Docker Build — skip this

There is deliberately no local Docker build in the release flow. `build.truenas.ps1` and
`build.sh` still exist for building images by hand, but they build the frontend from
`Dockerfile.prod.truenas`, **not** the `Dockerfile.prod` that CI publishes, so a successful
run proves nothing about the release. Do not push what they produce.

Let CI build the images from the tagged commit, and read the workflow run as the result.

### Commit and Tag

- [ ] **Commit the version bump**

  ```bash
  git add -A
  git commit -m "Bump version to vX.X.X"
  ```

- [ ] **Create annotated git tag**

  ```bash
  git tag -a vX.X.X -m "vX.X.X - Brief description of changes"
  ```

- [ ] **Push the commit and the tag**

  ```bash
  git push origin main
  git push origin vX.X.X
  ```

- [ ] **Verify tag on GitHub**

  - Check https://github.com/dsbaciga/travel-life/tags
  - Confirm new tag appears

### Publish (CI does this)

- [ ] **Watch the release workflow**

  - <https://github.com/dsbaciga/travel-life/actions> → "Build and Release"
  - It builds and pushes both images and creates the GitHub Release from the matching
    `CHANGELOG.md` section

- [ ] **Verify images on GHCR**

  - Check https://github.com/dsbaciga?tab=packages
  - Confirm `X.X.X`, `vX.X.X` and `latest` appear

---

## Android companion app

The same tag push builds the Android app and attaches `travel-life-X.Y.Z.apk` to the GitHub
Release. Two jobs in `release.yml` do it: `build-android` builds and signs the APK, and
`attach-android` uploads it once the release exists. They are independent of the images — a
failed APK build leaves the images and the release published, just without the APK.

There is nothing extra to run at release time. The APK's version is the tag, and its Android
`versionCode` is derived from it (`6.3.1` -> `6003001`), so each release installs over the
previous one.

### One-time setup

Until these five repository secrets exist, `build-android` logs a warning and skips itself.

| Secret | Value |
| ------ | ----- |
| `ANDROID_KEYSTORE_BASE64` | The release keystore file, base64-encoded |
| `ANDROID_KEYSTORE_PASSWORD` | The keystore password |
| `ANDROID_KEY_ALIAS` | The key alias (`travel-life` below) |
| `ANDROID_KEY_PASSWORD` | The key password |
| `GOOGLE_MAPS_ANDROID_API_KEY` | The Maps SDK for Android key (`mobile/app.json` is git-ignored) |

1. Create the keystore, outside the repository. `keytool` ships with the JDK
   (Android Studio's is at `C:\Program Files\Android\Android Studio\jbr\bin`):

   ```bash
   keytool -genkeypair -v -keystore travel-life-release.jks -alias travel-life -keyalg RSA -keysize 2048 -validity 10000
   ```

2. Add the secrets. Each command prompts for the value, so nothing lands in shell history:

   ```bash
   base64 -w0 travel-life-release.jks | gh secret set ANDROID_KEYSTORE_BASE64
   gh secret set ANDROID_KEYSTORE_PASSWORD
   gh secret set ANDROID_KEY_ALIAS
   gh secret set ANDROID_KEY_PASSWORD
   gh secret set GOOGLE_MAPS_ANDROID_API_KEY
   ```

3. Allow the release key to use the Maps key. Print its SHA-1 and add it, with package
   `dev.travellife.companion`, to the key's Android app restrictions in Google Cloud:

   ```bash
   keytool -list -v -keystore travel-life-release.jks -alias travel-life
   ```

**Back up the keystore and its passwords somewhere safe.** Android only installs an update
signed with the same key as the installed app. Lose the key and every phone has to uninstall
(losing its offline data) before it can install a newer build.

### Trying the build without releasing

Run "Build and Release" from the Actions tab on any branch (`workflow_dispatch`) and download
the `android-apk` artifact from the run. Off a tag the version comes from
`mobile/package.json`. Note that a manual run also runs the image jobs.

### Installing

Download the `.apk` from the release page on the phone and open it; Android asks once to
allow installs from the browser. A debug build installed from a development machine is signed
with a different key and must be uninstalled first.

---

## Post-Release

- [ ] **Bump the `APP_VERSION` default in the TrueNAS compose files**

  `docker-compose.truenas.yml` and `docker-compose.truenas.optimized.yml` pin
  `${APP_VERSION:-vX.Y.Z}`. That default is what a deploy uses when `APP_VERSION` is not
  set in the environment, so leaving it behind silently redeploys the *previous* release
  instead of the one you just shipped. Update both files (two lines each: backend and
  frontend) to the new tag.

- [ ] **Update IMPLEMENTATION_STATUS.md** (if applicable)

  - Document completed features
  - Update known issues

- [ ] **Test deployment**

  - Deploy to test environment if available
  - Verify basic functionality

---

## Common Issues and Solutions

### Issue: Forgot to update package.json

**Solution**: the version in the images comes from the tagged commit, so the fix is to
correct the commit and re-tag — never to push a corrected image by hand.

1. Update the package.json files and commit
2. Delete and recreate the git tag (see "Tag already exists" below)
3. Push the tag again and let CI rebuild and republish

### Issue: Build fails

**Solution**:

1. Check error messages carefully
2. Fix code issues
3. Re-run build verification steps
4. Don't proceed to Docker build until local builds pass

A failing verification build aborts the release outright — `release.ps1` no longer
continues past it. Fix the build rather than reaching for `-SkipBuild`, which only
suppresses the check and lets CI fail later instead.

### Issue: The images never appeared on GHCR

Nothing local can fix this — only CI publishes. Check
<https://github.com/dsbaciga/travel-life/actions> for a failed or unstarted "Build and
Release" run. Common causes: the tag was created but never pushed (`git push origin vX.X.X`),
or the workflow itself failed. Re-run the job from the Actions UI; do not push images by
hand to work around it.

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
git add -A
git commit -m "Bump version to vX.X.X"
git tag -a vX.X.X -m "vX.X.X - Description"
git push origin main
git push origin vX.X.X   # <- this is what publishes the images, via CI
```

---

## Deployment Commands

### Database migrations — check before every deploy

New images do not apply migrations. Run them against the target database as part of the
deploy, not after users hit the new code:

```bash
docker exec travel-life-backend npx prisma migrate deploy
```

**One-time step for the `00000000000000_init` baseline (added 2026-07-25, ships in 6.0.0).**
Every database that already contains data — production, your dev database, any restored
dump — must have the baseline marked as applied *once*, before its next `migrate deploy`:

```bash
npx prisma migrate resolve --applied 00000000000000_init
```

This writes a bookkeeping row and executes no SQL against your tables. If you skip it,
`migrate deploy` aborts on a guard (`REFUSING TO RUN BASELINE ...: table "users" already
exists`) and rolls back — nothing is damaged, but **no later migration is applied** until
you run the resolve. Only a genuinely empty database should let the baseline execute, and
provisioning a fresh database needs a different procedure entirely. See
[prisma/migrations/README.md](../../backend/prisma/migrations/README.md) before doing either.

### TrueNAS

Docker and docker-compose commands are not supported directly on TrueNAS. Use the TrueNAS Apps UI to update containers.

The TrueNAS compose files deploy a pinned `${APP_VERSION}` image (default is the current
release) rather than `:latest`. Set `APP_VERSION` to the tag you just released — or to a
previous tag to roll back. See [DEPLOYMENT.md](../DEPLOYMENT.md#pinning-the-deployed-version-app_version).

### Standard Production

```bash
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d
```

---

## Related Files

- [release.ps1](../../release.ps1) - Release script (bump, verify, tag - does not publish)
- [release.sh](../../release.sh) - Linux/Mac equivalent
- [build.truenas.ps1](../../build.truenas.ps1) - Local Docker build script
- [.github/workflows/release.yml](../../.github/workflows/release.yml) - **The image publisher**
- [CHANGELOG.md](../../CHANGELOG.md) - Source of the GitHub Release body
- [RELEASE_CHECKLIST.md](../../RELEASE_CHECKLIST.md) - More comprehensive release process
- [DEPLOYMENT.md](../../DEPLOYMENT.md) - Production deployment guide
- [CLAUDE.md](../../CLAUDE.md) - Project instructions for AI assistants
