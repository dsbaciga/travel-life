# Changelog

All notable changes to Travel Life are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## How this file is used

- Version headings must be exactly `## [X.Y.Z] - YYYY-MM-DD` (no `v` prefix). The
  release workflow (`.github/workflows/release.yml`) extracts the section matching the
  pushed tag and uses it as the GitHub Release body.
- Add entries under `## [Unreleased]` as you work. `release.ps1` / `release.sh` promote
  that section to the new version heading during a release.
- A missing or empty section is tolerated by CI - the release body falls back to a
  generic note rather than failing the workflow.

## [Unreleased]

## [6.1.6] - 2026-10-12

### Fixed

- **Linking an Immich video no longer drops its duration when Immich reports it as a
  number.** Duration parsing assumed a `HH:MM:SS` string and threw on numeric values.
- **Photo date grouping no longer fails with a Postgres GROUP BY error.** The timezone
  parameter made the `SELECT` and `GROUP BY` expressions differ; the query now groups by
  column position.

## [6.1.4] - 2026-08-02

### Added

- **Locations can be excluded from maps.** A location can now be flagged to keep it off
  trip maps, so a far-off origin like home stays recorded without stretching the map's
  auto-fit bounds to span the whole journey. Excluded locations get no marker and no
  contribution to bounds or zoom on the trip map, dashboard preview, and public trip map,
  while still appearing in lists and counts. The flag is a checkbox in the location form,
  backed by a new `exclude_from_map` column and carried through the create/update schemas
  and the public trip (share) serializer.

### Fixed

- **Printing the timeline no longer produces a blank page.** Any print invoked outside the
  app's own Print button — Ctrl+P, the browser menu, or mobile "Save as PDF" — printed a
  blank page, because the `@media print` rules hid the whole app while the printable
  itinerary was mounted lazily and only when the in-app button ran. The printable itinerary
  is now mounted permanently (hidden on screen, revealed only under `@media print`) and
  populated from data already fetched, so every route to print produces the paper version
  with no extra API calls.
- **Long location names wrap instead of overflowing on phones.** The compact location card
  heading truncated "Name · postalcode, country" on a single line through a broken flex
  chain, letting long names run outside the card; it now wraps with `break-words` inside a
  constrained, filling width. The trip page also reclaims horizontal space on mobile with
  responsive outer padding and a tighter Places panel on small screens.

## [6.1.3] - 2026-08-02

### Fixed

- **Printed itinerary and journal dates no longer shift by a day.** Two calendar-date
  values were being parsed as UTC midnight and then formatted or converted through a
  timezone, rendering the previous day for viewers west of UTC and drifting journal
  entries a day further east on every edit. The print itinerary's day headers and trip
  date range now go through the date-only formatter that keeps the intended day, and
  journal entry dates are stored pinned to UTC midnight and edited with a plain `date`
  input, so the day you see is the day that is saved.
- **The location search map behaves on phones.** In the bottom-sheet Add/Edit Location
  modal, the embedded search map no longer hijacks one-finger drags — it stays locked
  until tapped so a drag over it scrolls the form, matching the standard embed-map
  gesture, while desktop stays fully interactive. The map now uses the app's theme-aware
  tiles and the "Selected" info box and helper text gain dark-mode variants and wrap long
  addresses instead of overflowing narrow screens.

## [6.1.2] - 2026-07-31

### Changed

- **Modals open as bottom sheets on phones.** Below the `sm` breakpoint a modal now
  anchors to the bottom of the screen at full width with a rounded top edge, a drag-handle
  affordance and a slide-up entrance, instead of floating as a centered card inset by
  16 px on every side — space a long form could not afford. Padding tightens (`px-4 py-3`
  against the desktop `p-6`), the title drops to `text-lg`, and the panel is allowed 92%
  of the viewport rather than 90%. Height is measured in `dvh` with a `vh` fallback, so
  the sheet accounts for the browser's collapsing URL bar instead of being cut off by it,
  and the footer and unfootered content pad to `env(safe-area-inset-bottom)` so the
  buttons clear the home indicator on notched devices. Content scrolls with
  `overscroll-contain`, keeping a scroll gesture inside the sheet rather than dragging the
  page behind it. `FormModalFooter`'s Cancel and Save split the full width on phones and
  stack under any left-hand content, rather than crowding onto one row. The entrance
  animation moved from Tailwind's `animate-in` utilities to named keyframes so the global
  `prefers-reduced-motion` rule suppresses it. Desktop layout is unchanged.

### Documentation

- Added a `claude.yml` GitHub Actions workflow so Claude responds to `@claude` mentions in
  issues and pull request reviews.

## [6.1.1] - 2026-07-31

### Added

- **Album suggestions say what they are and show you.** Each suggestion now carries a
  plain-language description — how many photos and videos, when they were taken, where,
  and the actual rule that grouped them ("within 2 hours of the one before it", "inside
  the same 500 m radius") — plus a thumbnail that opens a 3×3 preview grid on hover or
  tap, so a suggestion can be judged before the album exists. A location cluster is named
  after the nearest recorded trip location within 1 km rather than a coordinate pair, and
  falls back to `Location (48.86, 2.29)` only when nothing is close enough. Captions are
  quoted verbatim (two at most, duplicates collapsed) because they are the only real
  signal of what is *in* the pictures — nothing is inferred from image content. Times
  render in the trip's zone through the standard resolver, not UTC. The preview samples
  evenly across the group instead of taking the first nine, so the grid shows the whole
  span, and only the first thumbnail loads up front — a screen of suggestions no longer
  fetches 45 Immich thumbnails before anyone hovers.

### Changed

- **Schedule forms now suggest the missing half of a time range an hour away, in both
  directions.** Entering a start offered an end only in `ActivityForm`, and elsewhere the
  "auto-fill" copied the date across verbatim, producing a zero-length range; entering an
  end offered nothing anywhere. Both directions now derive across activities,
  transportation, unscheduled items and the timeline edit modal, sharing one
  `useTimeRangeDefaults` hook. The hook tracks *which* side it filled, so a suggestion is
  replaceable but anything you typed, restored from a draft, or loaded from a saved record
  is never overwritten — including the chained departure a connecting leg inherits, which
  encodes a real layover buffer and previously would have been dragged back to
  arrival-minus-an-hour. The old `ActivityForm` effect is gone: it watched the start and
  so refilled an end the moment you cleared it. Date arithmetic runs through `Date.UTC`,
  so "one hour later" stays one hour across a DST boundary in the browser's zone.

## [6.1.0] - 2026-07-27

### Added

- **Emergency card.** A per-trip record of the details you need when something goes wrong
  and the phone may be dead or stolen: insurance provider, policy number, assistance line
  and embassy contact (`TripEmergencyInfo`), alongside new `medicalNotes` and `allergies`
  on `TravelCompanion`. Local emergency numbers come from a bundled 123-country snapshot
  (`constants/countryFacts.ts`) and the destination resolves **client-side**, so the card's
  core content never sits behind the network; it is cached in IndexedDB via a new
  `emergencyCards` store and prints through the existing `print-*-wrapper` portal, with
  allergies set in underlined bold rather than red so they survive a monochrome printer.
  The country is `Trip.countryCode` — the same column the local norms card reads — so a
  correction on either card holds for both. Embassy details are user-entered rather than
  bundled, because "nearest embassy" is a per-(passport, destination) pair and far too
  large to ship offline. Companion medical fields are owner-only, nulled for collaborators
  behind an explicit flag so the card never implies nothing was recorded, and a missing
  emergency number is dropped rather than rendered as "none".
- **Local norms card.** Plug type and voltage, tipping convention, and emergency numbers
  for the trip's destination, read from the same bundled country snapshot — frontend-only
  by design, so it needs no migration and works with the radio off. No country column
  exists on `Location`, so `useTripCountries` tallies candidates from every location
  address; a trip spanning several countries renders a chip row with per-country location
  counts instead of silently picking one, and a trip that resolves none offers the full
  123-country picker rather than an empty card. Viewing another country of a multi-country
  trip stays local and instant, while *correcting* the country writes the shared
  `Trip.countryCode`. Japan's 50/60Hz and Brazil's 127/220V mixed grids carry explicit
  per-country notes.

### Fixed

- **Offline features threw `NotFoundError: One of the specified object stores was not
  found` for anyone whose browser held an older copy of the database.** IndexedDB runs
  `upgrade` only when the version number changes, so a browser that created
  `travel-life-offline` at v1 from an earlier store list keeps that list forever — every
  transaction naming a store added later (`syncQueue`, `syncConflicts`, …) throws, which
  broke sign-in sync reconciliation, the pending-change count and the conflict list.
  `getDb()` now compares the open database against `STORE_NAMES` and, when anything is
  missing, reopens one version higher to re-run the (idempotent) upgrade, creating just the
  missing stores and preserving existing data. Bumping `DB_VERSION` was never sufficient
  here and is no longer how new stores reach existing clients.

### Documentation

- `DEPLOYMENT.md` documents CDN configuration: `sw.js`, `registerSW.js`,
  `manifest.webmanifest` and `index.html` must not be edge-cached, why a cached `sw.js`
  breaks the PWA permanently (its precache manifest names asset filenames that the next
  deploy deletes), and the one-time purge required when upgrading from 6.0.0 or earlier,
  which served `sw.js` with a one-year immutable cache.
- New [Code Conventions](docs/architecture/CODE_CONVENTIONS.md) guide, listed in the
  documentation index and flagged in `CLAUDE.md` as required reading before writing code.

### Database

- Migration `20260729000000_add_emergency_card` adds `TripEmergencyInfo` and the
  `medicalNotes` / `allergies` columns on `TravelCompanion`. Run
  `npx prisma migrate deploy` against the target database as part of the deploy.

## [6.0.3] - 2026-07-27

### Changed

- `release.ps1` no longer builds Docker images. The step was labelled "final
  verification" but built *different* images than CI publishes — the frontend from
  `Dockerfile.prod.truenas` (hardcoding `VITE_API_URL=/api`) rather than CI's
  `Dockerfile.prod` (which takes it as a build-arg). That is precisely how the 6.0.2
  localhost bug shipped: the local build passed, and its success was read as evidence the
  release was sound. CI building the tagged commit from a clean checkout is the only real
  gate. `build.truenas.ps1` remains for building images by hand, and now states plainly
  that its output must not be pushed and does not verify a release.

### Fixed

- **Uploaded images rendered as broken images behind nginx.** Both nginx configs cache
  static assets with a regex location (`~* \.(js|css|png|jpg|...)$`), and nginx picks a
  matching regex location over a plain prefix location. `/uploads/` and `/api/` were plain
  prefixes, so every proxied path ending in one of those extensions — including trip cover
  images, which are always re-encoded to `.jpg` — skipped the proxy and was looked up in
  the SPA's document root, where it does not exist. Both locations are now `^~`, which
  stops regex evaluation. Only affects deployments served through the frontend image's
  nginx; local dev talks to the backend directly.

- **Long text broke out of buttons, cards and badges on mobile.** Audited at ~412px
  (Galaxy S25 Ultra). Two distinct causes. Long unbroken strings — emails, phone numbers,
  confirmation and booking reference numbers, link hostnames, tag names, trip/album/
  checklist titles, usernames — have no wrap opportunity, so they set a min-content width
  wider than their container and ran past its edge; these now carry `break-words` /
  `break-all` / `truncate`, with `min-w-0` on the flex wrapper and `shrink-0` on sibling
  actions so a long name can no longer shove buttons off-screen. Separately, the
  Edit/Delete action rows on locations, activities, lodging and transportation packed up
  to six controls onto one non-wrapping line; since the buttons carry `whitespace-nowrap`
  the row's min-content width is fixed, so when it did not fit it ran past the card edge
  instead of reflowing. Sub-locations hit this first, rendering the same six controls in a
  card that is already visually inset. Those rows now wrap. Presentation only — no logic
  or data changes.

## [6.0.2] - 2026-07-26

### Fixed

- **The published frontend image called `http://localhost:5000/api` (regression in 6.0.0).**
  Every request from the browser failed with `ERR_CONNECTION_REFUSED`, so login, silent
  refresh and the SSO button (which hides itself when `/auth/oidc/config` fails) were all
  broken. `release.yml` passed `VITE_API_URL=${{ vars.VITE_API_URL || 'http://localhost:5000/api' }}`,
  and with the repository variable unset that localhost default was baked into the bundle.
  6.0.0 is the release where CI became the image publisher; before that `build.truenas.ps1`
  used `Dockerfile.prod.truenas`, which hardcodes `/api`, which is why 5.6.1 was unaffected.
  The default is now `/api` and `/uploads` — the frontend image's nginx proxies both, so
  relative URLs are correct for every deployment, and these values cannot be changed after
  build time.

## [6.0.1] - 2026-07-26

### Fixed

- **Login loop after signing in (regression in 6.0.0).** 6.0.0 made refresh tokens
  single-use and treats a second presentation as token theft, bumping `passwordVersion` to
  invalidate every session for that user. But the app has two independent refresh paths —
  the axios 401 interceptor (`/auth/refresh`) and silent refresh (`/auth/silent-refresh`)
  — which race on page load and legitimately present the same cookie. The second was
  flagged as theft, so a successful sign-in immediately invalidated itself and bounced the
  user back to `/login`, permanently. `claimToken` now distinguishes a concurrent replay
  inside a short grace window from genuine reuse: the in-flight rotation result is
  replayed for honest clients, while a genuine replay outside the window still invalidates
  every session.

- The frontend container was reported `unhealthy` while serving traffic normally. Its
  healthcheck probed `http://localhost:80`, and `wget` resolves `localhost` to `::1` first
  while nginx's `listen 80` binds IPv4 only, so every probe got `Connection refused`. All
  frontend healthchecks (both Dockerfiles and all three compose files) now probe
  `http://127.0.0.1:80/health`.
- The PWA could get permanently stuck on an old build. Both nginx configs matched `sw.js`
  with the `\.(js|css|…)$` rule and served the service worker as
  `Cache-Control: public, immutable` with a one-year expiry. `sw.js`, `registerSW.js`,
  `manifest.webmanifest` and `index.html` have stable (non-content-hashed) filenames, so a
  long cache pins clients to whatever build they first loaded. They are now served
  `no-cache` via exact-match locations; the content-hashed assets keep the immutable cache.
- `release.ps1` no longer corrupts non-ASCII characters when promoting the changelog.
  `Get-Content -Raw` without `-Encoding UTF8` reads UTF-8 as the system ANSI codepage and
  `WriteAllText` re-encodes it, double-encoding every em-dash and accent — which CI then
  publishes verbatim as the GitHub Release body (visible in the 6.0.0 release notes).
- The TrueNAS compose files defaulted to `${APP_VERSION:-v5.6.1}` after 6.0.0 shipped, so
  a deploy without `APP_VERSION` set would silently bring up the previous release. Both
  files now default to the current version, and bumping them is a documented release step.

### Documentation

- `backend/prisma/migrations/README.md` documents recovery from a failed baseline
  (`P3009`). The previous text implied `migrate resolve --applied` alone was enough;
  Prisma rejects that once the migration is recorded as failed, and `--rolled-back` must
  come first. Includes the one-off container form for a crash-looping backend.
- `BUILD_AND_PUSH.md`: dropped the "re-push to registry" and manual `docker login`
  remedies that contradicted CI-only publishing, and added migration steps to deploy.

## [6.0.0] - 2026-07-26

### Added

- Travel partner requests: a partnership must now be accepted by the recipient before it
  takes effect. Accepting is the only operation permitted to write both users' records.

### Security

- Setting a travel partner no longer writes the *other* user's record. Previously
  `updateTravelPartnerSettings` wrote the link bidirectionally, which let a user grant
  themselves collaborator access to every trip the other person subsequently created —
  including lodging confirmations, expenses, journal entries and photos. Consent is now
  required via a travel partner request.

### Environment — action required before deploying

- `JWT_SECRET` and `JWT_REFRESH_SECRET` are now validated at startup and must be at least
  32 characters and not a well-known placeholder. Tokens are HS256, so the signing key is
  offline-crackable from a single issued token — presence alone was not enough. **A backend
  with a shorter secret will refuse to start** (`JWT_SECRET is too weak`). Generate
  replacements with `openssl rand -base64 48`. The check is skipped only under
  `NODE_ENV=test`. Note that changing either secret invalidates all existing sessions and
  refresh tokens, so every user must sign in again.

### Migrations — action required before deploying

- Adds a baseline migration, `00000000000000_init`, that creates the entire schema from
  empty. **Every database that already contains data must have it marked as applied once,
  before the next `prisma migrate deploy`:** `npx prisma migrate resolve --applied
  00000000000000_init`. Skipping this aborts the deploy on a guard (nothing is damaged,
  but no later migration is applied). See `backend/prisma/migrations/README.md`.
- Also adds: a uniqueness constraint on weather data per trip/date, a trip-expense
  trip/date index, a trip-expense amount check constraint, a PostGIS coordinate backfill,
  and the travel partner request tables.

### Fixed

- Release pipeline: `release.ps1` now aborts when the backend or frontend verification
  build fails (previously the failure was silently swallowed and the release continued).
- `release.sh` is runnable again: it reads the current version from
  `backend/package.json` instead of a non-existent `VERSION` file, strips a leading `v`
  from explicit versions (`./release.sh v5.6.1` no longer tags `vv5.6.1`), and no longer
  aborts mid-bump on a missing changelog.
- `build.sh` builds correct image references when `DOCKER_REGISTRY` is set (missing `/`
  separator produced tags like `ghcr.io/dsbagictravel-life-backend`).
- The release workflow no longer fails when a changelog section is missing.
- CI runs the backend test suite for real and type-checks both packages instead of
  swallowing failures.
- TrueNAS compose files deploy a pinned `${APP_VERSION}` image instead of `:latest`.

### Changed

- CI (`.github/workflows/release.yml`) is now the single publisher of container images.
  `release.ps1` / `release.sh` build images locally for verification only.
- Removed the one-off `fix-migration.ps1` / `fix-migration.sh` /
  `fix-journal-associations-migration.sql` hotfix scripts.

## [5.6.1] - 2026-07-25

### Added

- Bulk actions for saved links.
- Year in Review widget.
- Multi-currency budgets.
- Opening-hours warnings for locations.
- Transit deep links.

### Fixed

- Opening-hours service failed to compile under the relaxed production build
  (discriminated-union narrowing without `strictNullChecks`).

## [5.6.0] - 2026-07-25

### Added

- Saved links, with ingest of links sent by email.
- Trip cover images.
- OIDC single sign-on: PKCE support for public clients (client secret optional),
  `DISABLE_PASSWORD_LOGIN` for SSO-only mode with a lockout guard, and `OIDC_TRUST_EMAIL`
  for identity providers that omit `email_verified`.

### Fixed

- Actionable errors surfaced for OIDC discovery and token-exchange failures.
- `BASE_URL`, `FRONTEND_URL`, OIDC and VAPID variables are passed through to the backend
  in the production compose file.

---

Releases before 5.6.0 predate this changelog; see the git history and the
[tag list](https://github.com/dsbaciga/travel-life/tags).
