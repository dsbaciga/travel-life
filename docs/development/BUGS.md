# Bugs to Fix

This file tracks known bugs and issues in the Travel Life application.

## Open Bugs

> **Source**: Full codebase review conducted 2026-07-25 by a 10-agent parallel review covering
> auth/security, authorization, domain services, integrations, database/migrations, frontend
> state, frontend components, infrastructure, tests/types, and architecture. Every finding below
> cites a file and line and was substantiated by reading the code. Findings are labelled
> **Confirmed** (verified in code), **Likely** (mechanism verified, trigger conditions inferred),
> or **Suspected** (plausible, not proven). See [Review Coverage and Gaps](#review-coverage-and-gaps)
> for what was *not* examined — absence from this list is not evidence of correctness.
>
> **Remediation status (2026-07-26)**: a follow-up pass fixed the overwhelming majority of these
> findings. Line numbers below refer to the code **as reviewed**, and many have since shifted.
> Entries that were fixed are marked **✅ FIXED** inline; the ones still open are collected in
> [Still Open](#still-open) at the top of this section so they are not buried. See
> [Remediation Pass](#remediation-pass-2026-07-26) for what changed and the verification results.

### Still Open

**None.** Every finding in this document is fixed and verified.

One implementation constraint is recorded below rather than left as an open item, because it is not a
defect and there is no version of the code in which it is "done" — see
[An irreducible type assertion](#an-irreducible-type-assertion) in Notes.


**Resolved by decision (2026-07-26):**

- **`privacyLevel: 'Public'` — removed entirely.** `getTripById` no longer honours it, matching
  `verifyTripAccessWithPermission`. Public sharing is now exclusively the token-based share path,
  which serves a sanitised payload. Trip IDs are sequential, so the previous behaviour made every
  Public trip enumerable by every registered account.
- **Migration squashing — deliberately not done.** The baseline exists so a fresh database *can* be
  built, and `backend/prisma/migrations/README.md` documents the two-step procedure. Squashing the
  51 legacy migrations would strand any database not already fully migrated and would make the
  recorded history stop matching what was actually applied in production.

**Also resolved after this table was first written:**

- `/uploads` kept a duplicate `passwordVersion` cache. `middleware/auth.ts` now exports
  `resolveCurrentPasswordVersion` and both paths share one. More than tidiness: with two caches,
  `invalidatePasswordVersionCache` on a password change cleared only the API path's copy, leaving
  `/uploads` able to accept a token that change should have invalidated.
- The TOCTOU race in refresh-token reuse detection is closed by an atomic `claimToken`.
- `nodemailer` and `sharp` are upgraded past their advisories.
- The travel-partner consent flow is built, with opt-in retroactive trip sharing.
- **`react-router-dom` CSRF advisory (GHSA-qwww-vcr4-c8h2) — resolved.** Migrated to
  `react-router@8.3.0`, the first version outside the advisory range. This needed more than a bump:
  `react-router-dom` was deleted in v8, so the package was removed and **64 import sites** rewritten
  (63 under `src/` plus a `manualChunks` entry in `vite.config.ts` that is easy to miss). React went
  19.2.3 → 19.2.8 to satisfy the v8 peer, and **7 `FROM` lines across 6 Dockerfiles** plus the CI
  Node pin moved to `node:22-alpine` for v8's `engines: >=22.22.0`. Verified `node:22-alpine`
  resolves to v22.23.1 and that `sharp@0.35.3`'s alpine prebuilt is still satisfied. No
  `react-router/dom` imports were needed — that entry point only carries `RouterProvider`/
  `HydratedRouter`, which this SPA does not use.

> ⚠️ **Operational step required before the next deploy** — see
> [Remediation Pass](#remediation-pass-2026-07-26). A baseline migration was added; every
> existing database must be told it is already applied, once, or the next `migrate deploy` fails.

### High Priority

#### Any user can force a "travel partner" link and gain edit access to a victim's future trips

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: High
- **Component**: Backend
- **Category**: Security — privilege escalation
- **Location**: `backend/src/services/user.service.ts:698`, reverse write at `:781-787`; consumed by `backend/src/services/trip.service.ts:61-69`
- **Issue**: `updateTravelPartnerSettings` accepts any positive integer user ID and writes the partnership **bidirectionally** inside its transaction — `tx.user.update({ where: { id: data.travelPartnerId }, data: { travelPartnerId: userId } })`. There is no invitation, acceptance, or notification step. Target IDs are discoverable via `GET /api/users/search`, which returns `id` for any 3-character substring match on email or username.
- **Impact**: Attacker A sets victim B as partner. Every trip B creates afterwards hits `trip.service.ts:61-69`, which auto-inserts a `tripCollaborator` row granting A **edit** permission by default. A then has read/write access to B's locations, activities, lodging (including confirmation numbers), expenses, journal entries and photos. The same call also silently severs B's existing legitimate partnership (`user.service.ts:765-770`).
- **Confidence**: Confirmed
- **Suggested fix**: Write only the requester's own `travelPartnerId` and create a pending partner-request the other user must accept, mirroring `tripInvitation`.

#### Arbitrary server file deletion via unvalidated stored file paths (two entry vectors)

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: High
- **Component**: Backend
- **Category**: Security — path traversal
- **Location**: Sinks: `backend/src/services/photo.service.ts:911-928`, `backend/src/services/companion.service.ts:239-246,279-286,308-315`, `backend/src/services/tripCoverImage.service.ts:62-73,166-178`. Vector 1: `backend/src/services/restore.service.ts:192,311-312,370-371` + `backend/src/controllers/backup.controller.ts:63-82` + `backend/src/types/backup.types.ts:35,174-175,354-355`. Vector 2: `backend/src/types/companion.types.ts:22` + `backend/src/services/companion.service.ts:130-133`
- **Issue**: Server-managed file paths reach `path.join(process.cwd(), <value>)` + `fs.unlink()` with either no containment check (`deletePhoto`, `deleteCoverFiles`) or a bypassable one — `avatarUrl.startsWith('/uploads/avatars/')` is satisfied by `/uploads/avatars/../../../../etc/passwd`, because `path.join` normalises `..` only *after* the prefix test passes. Two independent ways to poison the stored value:
  1. **Backup restore** — `restoreFromBackup` writes `localPath`, `thumbnailPath`, `avatarUrl`, `coverImagePath`, `coverImageThumbnailPath` straight from uploaded JSON; the Zod schema requires only `z.string()`. The HMAC integrity check is skippable: `backup.controller.ts:63-82` verifies it *only when an `integrity` field is present*, and logs a warning and proceeds when it is omitted.
  2. **Mass assignment** — `updateCompanionSchema` exposes `avatarUrl` as an unconstrained string, spread directly into `prisma.travelCompanion.update`.
- **Impact**: Any authenticated user (including a low-trust invited collaborator) can cause `fs.unlink()` on an attacker-chosen path, subject to process permissions. Because `uploads/` is a flat shared tree, it can also target another user's real file by name without traversal.
- **Confidence**: Confirmed (both vectors; found independently by two reviewers)
- **Suggested fix**: Validate restored path fields against the anchored generated-filename pattern; remove `avatarUrl` from `updateCompanionSchema`; make every delete helper `path.resolve` and verify `startsWith(uploadsDir + sep)` — the correct pattern already exists at `share.service.ts:378-383` and `pdfImport.service.ts` `resolveStoredPath()`. Consider making the integrity signature mandatory on restore.

#### Refresh tokens are rotated but never revoked — no reuse detection

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: High
- **Component**: Backend
- **Category**: Security
- **Location**: `backend/src/services/auth.service.ts:91-135`, `backend/src/controllers/auth.controller.ts:114-121`
- **Issue**: `refreshToken()` verifies the presented token, mints a new pair, and returns without blacklisting the token it just consumed. There is no server-side record of live refresh tokens. The old JWT stays valid for its full `JWT_REFRESH_EXPIRES_IN` (default 7 days). `blacklistToken()` already exists and is used at logout (`auth.controller.ts:141-147`).
- **Impact**: A refresh token captured once grants a renewable 7-day session that survives the legitimate user refreshing, with no reuse signal to detect the theft. The only remediation is a password change (`passwordVersion` bump) — and OIDC-provisioned users have no password to change.
- **Confidence**: Confirmed
- **Suggested fix**: Blacklist the consumed token with its remaining `exp` TTL; treat presentation of an already-blacklisted refresh token as theft and invalidate the family.

#### `/uploads` is authenticated but not authorized — any user can fetch any user's files

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: High
- **Component**: Backend
- **Category**: Security — broken object-level authorization
- **Location**: `backend/src/index.ts:191-225` (`authenticateFileAccess`); naming at `backend/src/services/companion.service.ts:248-259`, `backend/src/services/pdfImport.service.ts:94`
- **Issue**: The middleware verifies only that *some* valid access token or refresh cookie is present, then hands off to `express.static(config.upload.dir)`. It never resolves the path to a `Photo`/`TravelCompanion`/`Trip` row, so there is no per-file ownership check. All users' files share one flat tree. Photos use `crypto.randomUUID()` and are unguessable, but **companion avatars are `companion-${companionId}-${Date.now()}.jpg`** — a sequential integer plus a millisecond timestamp — and PDF imports live at the deterministic prefix `pdfs/<userId>/`.
- **Impact**: Any authenticated user can read another user's uploaded media by path. For avatars the path is brute-forceable over a plausible time window. The current protection is filename entropy, not authorization.
- **Confidence**: Confirmed (found independently by two reviewers)
- **Suggested fix**: Serve uploads through a controller that resolves the path to a DB row and applies `verifyEntityAccessWithPermission` (`share.service.getPublicPhotoFilePath` is a good template); give avatars UUID filenames.
- **Related**: `authenticateFileAccess` also skips the `passwordVersion` check — see Low Priority below.

#### Logout clears no cached data — cross-user data leak on shared devices

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: High
- **Component**: Frontend
- **Category**: Security
- **Location**: `frontend/src/store/authStore.ts:75-87` (`logout`), `:134-140` (`clearAuth`)
- **Issue**: Logout only calls `setAccessToken(null)` and resets Zustand fields. Four separate clearing functions exist, are documented as logout-time cleanup, and are **never called anywhere** (verified by full-repo grep):
  - `clearPersistedCache()` — `frontend/src/lib/queryPersister.ts:169` (TanStack Query IndexedDB persister, `travel-life-cache`)
  - `offlineService.clearAllCache()` / `clearSyncQueue()` — `frontend/src/services/offline.service.ts:523,539` (`travel-life-offline` DB)
  - `offlineAuthService.clearOfflineSession()` — `frontend/src/services/offlineAuth.service.ts:254` (doc comment literally says "Called on logout")
  - Service worker Cache Storage (`api-cache`, `photo-thumbnails`, `map-tiles`, `geocoding-cache`) — `frontend/src/sw.ts:46-119`; `persistentStorage.ts:198` `clearAllCaches()` also uncalled
- **Impact**: All of this storage is origin-scoped, not user-scoped. After User A logs out and User B logs in on the same device, B's browser still holds A's trips, locations, photo metadata and API responses. `PersistQueryClientProvider` (`frontend/src/App.tsx:127`) will rehydrate A's data into the query cache on load, and NetworkFirst/CacheFirst service-worker routes can serve A's cached responses.
- **Confidence**: Confirmed
- **Suggested fix**: In `logout()`/`clearAuth()`, await all four clearing paths plus `queryClient.clear()`.

#### Migration history has no baseline — a fresh database cannot be provisioned

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: High
- **Component**: Database
- **Category**: Migration risk
- **Location**: `backend/prisma/migrations/` (all 51 folders); earliest is `20251015_add_user_timezone/migration.sql`
- **Issue**: No migration anywhere in history contains `CREATE TABLE "users"` or `CREATE TABLE "trips"` (verified by grep across all 51 `migration.sql` files). The oldest migration is a bare `ALTER TABLE "users" ADD COLUMN "timezone"`, which assumes the table already exists. Only 16 of 51 folders contain any `CREATE TABLE`, and all of those are later feature-specific tables (`entity_links`, `route_cache`, …), never the core models.
- **Impact**: `npx prisma migrate deploy` — the documented production command — fails on the first migration against a genuinely empty database. The current history only works because the production DB's baseline was created out-of-band (`db push`, a restored dump, or a deleted init migration). Disaster recovery, a new environment, and any fresh developer clone are all manual operations today.
- **Confidence**: Confirmed
- **Suggested fix**: Generate and commit a real baseline (`prisma migrate diff` from empty → current schema), then `prisma migrate resolve --applied` it on the production DB. Record the production DB's actual baseline state before touching anything.

#### `TagManager`'s unmemoized service adapter causes an infinite re-fetch loop

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: High
- **Component**: Frontend
- **Category**: Correctness / Performance
- **Location**: `frontend/src/components/TagManager.tsx:27-37`
- **Issue**: `tripTagServiceAdapter` is a plain object literal recreated every render, then passed to `useManagerCRUD`. Inside `useManagerCRUD.ts`, `loadItems` is a `useCallback` with `service` in its deps (line 78), and `useEffect(() => { loadItems(); }, [loadItems])` (lines 190-192) refires whenever that identity changes. New object every render → new `loadItems` every render → effect fires → `setItems` → re-render → repeat. **Every other** `useManagerCRUD` call site memoizes its adapter (`ActivityManager.tsx:86-91`, `TransportationManager.tsx:416-421`, `LocationManager.tsx:95`, `LodgingManager.tsx:139`, `JournalManager.tsx:71`, `CompanionManager.tsx:28-33`), several with an explicit comment saying it prevents infinite loops.
- **Impact**: Mounting the Trip Tags UI hammers `tagService.getTagsByTrip` continuously — sustained network and backend load, and a component that never settles.
- **Confidence**: Confirmed
- **Suggested fix**: Wrap the adapter in `useMemo(() => ({...}), [])` like every sibling.

#### Shift-click range selection selects the wrong items — bulk delete can remove the wrong records

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: High
- **Component**: Frontend
- **Category**: Correctness — data loss
- **Location**: `frontend/src/components/ActivityManager.tsx:453-467,845-861`; `frontend/src/components/TransportationManager.tsx:1529-1584`; correct pattern at `frontend/src/components/LodgingManager.tsx:515-534,882-899`
- **Issue**: `useBulkSelection.toggleItemSelection(itemId, index, shiftKey, items)` (`frontend/src/hooks/useBulkSelection.ts:87-123`) resolves a range by indexing `itemsRef.current[i]`. This is only correct if `index` refers to a position in the array that is passed as `items`. Both managers render from **sorted/filtered** arrays but pass the **raw unsorted** list: `ActivityManager` renders `sortedScheduledActivities`/`sortedUnscheduledActivities` (filtered by `dietaryFilter`, sorted by `sortBy`, lines 318-355) yet passes `topLevelActivities`; `TransportationManager` renders `filteredScheduledItems`/`sortedUnscheduledItems` yet passes `manager.items`. `LodgingManager` uses one `sortedLodging` array for both and is correct.
- **Impact**: With any dietary filter, category sort, or transportation tab active, shift-click selects different items than the ones visually highlighted — including items not on screen. A subsequent Bulk Delete acts on that wrong selection.
- **Confidence**: Confirmed
- **Suggested fix**: Pass the same sorted/filtered array used for rendering, mirroring `LodgingManager`.

#### Nested modals break scroll lock and close together on Escape

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: High
- **Component**: Frontend
- **Category**: Correctness
- **Location**: `frontend/src/components/Modal.tsx:201-211,358-368`; same pattern duplicated at `frontend/src/components/PhotoLightbox.tsx:174-179`. Nesting path: `frontend/src/pages/TripDetailPage.tsx:2103-2120` (Share Trip) → `frontend/src/components/CollaboratorsManager.tsx:379-387` → `InviteUserModal` (itself a `Modal`)
- **Issue**: `Modal` and `Modal.Simple` set `document.body.style.overflow = 'hidden'` on open and unconditionally reset it to `''` in cleanup, with no reference count. Each open modal also attaches its own `document`-level `keydown` listener.
- **Impact**: Closing the inner Invite User dialog re-enables background scrolling while the outer Share Trip modal is still open and covering the page. Pressing Escape fires both listeners and closes both modals at once — a data-loss surprise if the outer modal held unsaved state.
- **Confidence**: Confirmed (nesting path traced through the real render tree)
- **Suggested fix**: Use a shared open-modal counter/stack so scroll is restored only when the last modal closes, and only the topmost modal responds to Escape.

#### The entire offline/PWA subsystem is unwired — conflicts are unresolvable and status is fabricated

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: High
- **Component**: Frontend
- **Category**: Reliability / Correctness
- **Location**: `frontend/src/components/pwa/*` (all), `frontend/src/hooks/useOfflineReady.ts:22-24,284-441`, `frontend/src/hooks/useSyncConflicts.ts`, `frontend/src/services/offlineAuth.service.ts`, consumers `frontend/src/components/pwa/SyncStatus.tsx:1-115` and `OfflineIndicator.tsx:1-39`
- **Issue**: Three compounding problems in one subsystem:
  1. **Dead code** — none of `OfflineIndicator`, `SyncStatus`, `DataFreshnessIndicator`, `ConflictsList`, `ConflictResolutionModal`, `ConflictFieldDiff`, `OfflineDownloadButton`, `OfflineDownloadModal`, `OfflineStatusBadge`, `StorageManagement`, `StorageUsageBar`, `StorageQuotaWarning`, `IOSInstallPrompt`, `IOSStorageWarning`, `MigrationNotice` is imported anywhere outside `components/pwa/`. Same for `useOfflineReady`/`useSyncConflicts` and all of `offlineAuth.service.ts`.
  2. **Shadow state system** — `useOfflineReady`/`useTotalPendingChanges`/`offlineStorage` read and write `localStorage` keys (`travel-life-offline-data`, `travel-life-pending-changes`, `travel-life-sync-status`) that the real pipeline never touches. The functioning pipeline (`offlineService.queueChange()`, `offline.service.ts:383`) uses the IndexedDB `syncQueue` store.
  3. **Consequence** — `syncManager.ts:611-637` correctly parks unresolvable conflicts in IndexedDB `syncConflicts`, but nothing rendered ever calls `getPendingConflicts()`.
- **Impact**: A user whose offline edit conflicts with a server change has that conflict queued permanently with no way to see or resolve it outside devtools. If the status components were wired up as-is, they would permanently display "0 pending / not synced" regardless of real queue state — actively misleading rather than merely absent.
- **Confidence**: Confirmed
- **Suggested fix**: Point `useOfflineReady`/`useTotalPendingChanges` at the real `offlineService` API and delete the `localStorage` shadow system; mount `ConflictsList`/`ConflictResolutionModal` and `OfflineIndicator` in a global layout. If the subsystem is intentionally unshipped, track that explicitly rather than leaving it silently orphaned.

#### Passport and visa warnings can never be dismissed

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: High
- **Component**: Backend
- **Category**: Correctness
- **Location**: `backend/src/controllers/trip.controller.ts:159` (schema) vs `backend/src/services/tripValidator.service.ts:12` (type)
- **Issue**: `ValidationIssueCategory` is `'SCHEDULE' | 'ACCOMMODATIONS' | 'TRANSPORTATION' | 'COMPLETENESS' | 'DOCUMENTS'`, and `checkPassportValidity`/`checkVisaRequirements` emit `category: 'DOCUMENTS'` issues at lines 731, 746, 765, 791, 876, 897. The `dismissValidationIssue` handler's inline Zod schema omits `'DOCUMENTS'` from its enum.
- **Impact**: Every request to dismiss a document warning (expired passport, missing passport, 6-month rule, visa required) fails Zod parsing with a 400 before reaching the service. The warning reappears on every page load with no way to silence it.
- **Confidence**: Confirmed
- **Suggested fix**: Add `'DOCUMENTS'` to the enum, and import `ValidationIssueCategory` rather than duplicating it.

#### Server-local "today" compared against UTC-midnight dates shifts trip status and document expiry by a day

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: High
- **Component**: Backend
- **Category**: Correctness — timezone
- **Location**: `backend/src/services/trip.service.ts:225-226,260-263`; `backend/src/services/travelDocument.service.ts:23-29,44-50,222-233,310-314`
- **Issue**: Trip `startDate`/`endDate` and `TravelDocument.expiryDate` are stored as UTC midnight (`tripDateTransformer`: `new Date(dateStr + 'T00:00:00.000Z')`). "Today" is computed as `new Date(); today.setHours(0,0,0,0)` — `setHours` operates in the **server process's local timezone**. On any deployment whose `TZ` is not UTC, the day boundary is offset.
- **Impact**: `autoUpdateGlobalTripStatuses` (a scheduled job) can flip a trip to `In Progress`/`Completed` up to a day early or late, and `calculateExpirationStatus`/`calculateDaysUntilExpiry`/`getDocumentsRequiringAttention` can report a passport expired a day early or late — purely as a function of host configuration. `memories.service.ts` already does this correctly with `getUTCDate`/`setUTCDate`.
- **Confidence**: Confirmed in code; real-world impact depends on the deployed `TZ`, which the docs do not pin to UTC.
- **Suggested fix**: Use `setUTCHours(0,0,0,0)` / `Date.UTC(...)` everywhere a computed "today" is compared against these stored dates.

#### Deleting a parent activity orphans its children's EntityLinks

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: High
- **Component**: Backend
- **Category**: Data integrity
- **Location**: `backend/prisma/schema.prisma:389` (`parent Activity? @relation("ActivityChildren", onDelete: Cascade)`); `backend/src/prisma/crudHelpers.ts:265-304` (`deleteEntity`), `:328-391` (`bulkDeleteEntities`)
- **Issue**: `Activity.parentId` cascades at the database level, so deleting a parent deletes its children in Postgres. But `deleteEntity`/`bulkDeleteEntities` only clean up `EntityLink` rows for the **explicitly deleted** IDs. `EntityLink` (`schema.prisma:661`) is polymorphic with no FK to `activities`, so it has no cascade of its own. Links belonging to cascade-deleted children are left dangling.
- **Impact**: Orphaned `EntityLink` rows accumulate silently and surface as broken references in link panels pointing at non-existent activity IDs. The codebase's own `cleanupOrphanedEntityLinks()` (`entityLink.service.ts:968`) documents itself as "a safety net for any deletion paths that might miss cleanupEntityLinks()" — confirming this class was anticipated — but it only runs on manual `POST /api/trips/:tripId/links/cleanup-orphans`.
- **Confidence**: Confirmed
- **Suggested fix**: Fetch descendant IDs before deleting a parent and clean up links for all of them in the same transaction.

#### Self-hosted Immich LAN URLs can never be saved

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: High
- **Component**: Backend
- **Category**: Correctness
- **Location**: `backend/src/controllers/user.controller.ts:83-109` (`updateImmichSettings`); correct sibling at `:184-211` (`updateLlmSettings`)
- **Issue**: `updateImmichSettings` computes `isLocal` (localhost, 127.0.0.1, 192.168.*, 10.*, 172.16-31.*, `.local`) to relax the HTTPS requirement, then calls `await validateUrlNotInternal(data.immichApiUrl)` **unconditionally** at line 108. That function (`urlValidation.ts:190-211`) rejects exactly those ranges. `updateLlmSettings`, five functions below in the same file, correctly gates the call behind `if (!isLocal)`.
- **Impact**: No private-IP or `.local` Immich URL can be persisted — i.e. every LAN self-hosted Immich instance, the feature's primary deployment pattern. Only a public HTTPS URL can be saved.
- **Confidence**: Confirmed by direct comparison of the two near-identical handlers
- **Suggested fix**: Gate the call behind `!isLocal`, matching `updateLlmSettings`.

#### Stray root migration-fix scripts encode a broken migration and a stale schema

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: High
- **Component**: Database
- **Category**: Migration risk
- **Location**: `fix-migration.sh`, `fix-migration.ps1`, `fix-journal-associations-migration.sql` (repo root)
- **Issue**: `fix-migration.sh`/`.ps1` are TrueNAS runbooks that manually patch `_prisma_migrations` rows to resolve a failed `20251015_add_user_timezone` — an ad hoc substitute for `prisma migrate resolve`. `fix-journal-associations-migration.sql` recreates `journal_activities`, `journal_lodgings` and `journal_transportations` — three tables that `backend/prisma/migrations/20260118_remove_old_journal_linkage_tables/migration.sql` deliberately **drops**, since linking moved to the unified `EntityLink` system.
- **Impact**: Running the SQL script against the current schema recreates tables the app no longer reads or writes. Together with the missing-baseline finding, these are evidence that migration history has been hand-patched in production more than once without reconciling back into `prisma/migrations/`.
- **Confidence**: Confirmed
- **Suggested fix**: Delete all three (or move to a clearly-labelled `docs/archive/`) once the baseline issue is resolved, so they cannot be run by mistake.

#### Editing any field of a travel document silently and permanently erases the document number

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: High
- **Component**: Both
- **Category**: API contract — data loss
- **Location**: `frontend/src/components/TravelDocumentManager.tsx:160-172` (`startEdit`), `:123-133` (`handleUpdate`); backend accepts null at `backend/src/types/travelDocument.types.ts:57`, writes it at `backend/src/services/travelDocument.service.ts:179-189`; masking at `:62`
- **Issue**: The read and write shapes for `documentNumber` are asymmetric. Every response masks it to `***1234` (`travelDocument.types.ts:25-36`), so `startEdit` deliberately sets `documentNumber: ''` with the comment "Don't populate masked value". `handleUpdate` then submits the whole form, and `'' || null` evaluates to `null`. `buildConditionalUpdateData` skips only `undefined`, so an explicit `null` reaches `prisma.travelDocument.update` and the column is set to NULL. The same `|| null` on `issueDate`/`expiryDate`/`notes` at `:128-130` is safe, because those fields *are* repopulated from the response.
- **Impact**: A user who opens a passport to correct its expiry date, name, country, alert window or primary flag — and does not retype the full document number — loses it permanently. There is no warning, the toast reads "Document updated", and because responses are masked the loss stays invisible until the number is actually needed. Unrecoverable without a database backup.
- **Confidence**: Confirmed
- **Suggested fix**: Send `documentNumber` only when the user typed something (`formData.documentNumber ? formData.documentNumber : undefined`), and add an explicit "clear document number" affordance if clearing should be possible at all.

### Medium Priority

#### `GET /api/trips/shared` is unreachable — the "shared with me" view is permanently broken

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Backend
- **Category**: Correctness — routing
- **Location**: `backend/src/index.ts:271` vs `:292`; handlers at `backend/src/routes/trip.routes.ts:144` and `backend/src/routes/collaboration.routes.ts:127`
- **Issue**: `app.use('/api/trips', tripRoutes)` is mounted before `app.use('/api', collaborationRoutes)`, so `GET /api/trips/shared` matches `router.get('/:id', tripController.getTripById)` first. `parseId('shared')` throws `AppError('Invalid tripId: must be a positive integer', 400)`, and Express does not fall through to the later router after a handler errors.
- **Impact**: `collaborationController.getSharedTrips` is dead. The frontend calls exactly this path (`frontend/src/services/collaboration.service.ts:57`), so the shared-trips view always 400s.
- **Confidence**: Confirmed
- **Suggested fix**: Register `/shared` before `/:id` in `trip.routes.ts`, or mount the collaboration router first.

#### `privacyLevel: 'Public'` exposes costs and confirmation numbers to every registered user

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Backend
- **Category**: Security — data exposure
- **Location**: `backend/src/services/_shared/tripAccess.ts` (was `serviceHelpers.ts:225-261` at review time); also `backend/src/services/trip.service.ts:298-311`
- **Issue**: `verifyTripAccessWithPermission` treats any trip with `privacyLevel === 'Public'` as viewable by *any authenticated user*, returning `permissionLevel: 'view'`. Every read path requiring only `'view'` then serves that data: `expense.service.ts:58,145`, `lodging.service.ts:40` (confirmation numbers, cost), `transportation.service.ts:171` (booking references, seat numbers), `entityLink.service.ts:611,649,841,876,905`, `journalEntry.service.ts:54`, `photo.service.ts:580`, `savedLink.service.ts:190`. By contrast `share.service.ts:210-219` documents that the token-based public view must exclude exactly these fields.
- **Impact**: Trip IDs are sequential integers, so any registered user can walk `GET /api/trips/:id` and harvest other users' financial and booking data from trips whose owners marked them "Public" believing that exposed only a sanitised itinerary.
- **Confidence**: Confirmed
- **Suggested fix**: Drop the `Public` branch from `verifyTripAccessWithPermission` (leaving public exposure to the sanitised share-token path), or gate cost/booking-bearing fields behind a stricter check when the caller is neither owner nor collaborator.

#### SSO-only mode is bypassable via the invitation-accept endpoint

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Backend
- **Category**: Security
- **Location**: `backend/src/controllers/userInvitation.controller.ts:56-107`; guard present at `backend/src/controllers/auth.controller.ts:13-15,47-50,73-76`
- **Issue**: `passwordAuthDisabled()` is checked in `register` and `login` only. `POST /api/user-invitations/accept` creates a user with a `passwordHash` from a client-supplied password (`userInvitation.service.ts:225-243`) and hand-rolls its own access + refresh JWTs and cookies, never consulting `config.auth.passwordLoginDisabled`. The route is also CSRF-exempt (`security/csrf.ts:87-90`).
- **Impact**: In an SSO-only deployment, a password-backed account can still be created and immediately granted a full session. Secondary: the duplicated token minting omits the `id` claim and will drift from the canonical shape in `auth/jwt.ts`.
- **Confidence**: Confirmed
- **Suggested fix**: Apply the guard to `acceptInvitation`, and route token creation through `generateAccessToken`/`generateRefreshToken`.

#### An admin collaborator can grant admin via invitation, bypassing the owner-only rule

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Backend
- **Category**: Security — privilege escalation
- **Location**: `backend/src/services/collaboration.service.ts:94-99` and `:151,180` vs `:550-553`
- **Issue**: `updateCollaborator` explicitly blocks non-owners from setting `admin` ("Only the trip owner can grant admin permissions", line 551). `sendInvitation` only calls `verifyTripOwnerOrAdmin`, then persists `permissionLevel` verbatim, and `sendInvitationSchema` (`collaboration.types.ts:23-27`) permits `'admin'`. The two write paths that mint the same privilege disagree.
- **Impact**: A user holding `admin` on someone else's trip can invite an address they control at `admin` level, permanently escalating membership on a trip they do not own — which the owner's own endpoint would refuse.
- **Confidence**: Confirmed
- **Suggested fix**: Reject `permissionLevel === 'admin'` in `sendInvitation` unless the requester is the trip owner.

#### JWT secrets are checked for presence but not strength

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Backend
- **Category**: Security
- **Location**: `backend/src/config/index.ts:6-20`
- **Issue**: Startup fails if `JWT_SECRET`/`JWT_REFRESH_SECRET` are unset, but any non-empty string passes — `JWT_SECRET=changeme` boots cleanly. Tokens are HS256 (`auth/jwt.ts:18,22`), so the signing key is directly offline-crackable from a single issued token.
- **Impact**: A weak secret lets anyone holding one expired token recover the key and forge access tokens for any `userId`. `authenticate` trusts `decoded.userId` for identity (`middleware/auth.ts:90-111`), so this is a complete authentication bypass.
- **Confidence**: Confirmed
- **Suggested fix**: Reject secrets under ~32 characters and known placeholder values at config load.

#### OIDC ID token is decoded, not verified; issuer URL is not required to be HTTPS

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Backend
- **Category**: Security
- **Location**: `backend/src/services/oidc.service.ts:201-219`; `backend/src/config/index.ts:108-119`
- **Issue**: The ID token is parsed with `jwt.decode()` (line 207) — no JWKS lookup, no signature check, no `exp`/`iat` validation. The in-code comment justifies this as "the ID token comes straight from the token endpoint over TLS", but nothing enforces TLS: `OIDC_ISSUER_URL` is accepted verbatim (only trailing slashes stripped), so `http://pocket-id:8080` is valid and both discovery and token exchange would run in plaintext. `iss`/`aud` are checked, but against values decoded from the same unverified token.
- **Impact**: With an `http://` issuer, anyone able to intercept the backend↔IdP path (a compromised container on the same Docker network, a hostile LAN) can substitute a token response carrying an arbitrary `email`/`sub` and — via the email-linking path at `oidc.service.ts:255-273` — take over any account.
- **Confidence**: Confirmed (missing verification); Likely (exploitability depends on a plaintext issuer being configured)
- **Suggested fix**: Reject a non-`https:` issuer at config load absent an explicit opt-out, and verify the ID token against the provider's JWKS including `exp`.

#### Checklists can be attached to another user's trip

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Backend
- **Category**: Security — cross-tenant write
- **Location**: `backend/src/services/checklist.service.ts:294` (create), `:343` (update)
- **Issue**: Both schemas accept `tripId: nullableOptional(z.number())` (`checklist.types.ts:23,33`) and neither service call verifies it. Every sibling service that accepts a `tripId` (activity, location, lodging, photo, album, expense, saved link) calls `verifyTripAccess*` first.
- **Impact**: A user can create or re-point a checklist at an arbitrary trip ID belonging to another user, writing a foreign-key reference into a victim's trip and confirming trip existence. The row is silently destroyed when the victim deletes the trip.
- **Confidence**: Confirmed
- **Suggested fix**: Call `verifyTripAccessWithPermission(userId, tripId, 'edit')` in both when `tripId` is non-null.

#### A trip can be moved into another user's series via `updateTrip`

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Backend
- **Category**: Security — content injection
- **Location**: `backend/src/types/trip.types.ts:100` reaching `backend/src/services/trip.service.ts:360-373`
- **Issue**: `updateTripSchema` permits `seriesId`, and `updateTrip` passes the validated body through `buildConditionalUpdateData` into `prisma.trip.update` with no check that the series belongs to the caller. The dedicated series endpoints *do* check (`tripSeries.service.ts:10-18`, `:188`), so the guarded path is bypassed by the ungated one.
- **Impact**: An attacker sets their own trip's `seriesId` to a victim's series. `tripSeries.service.getById`/`getAll` select trips purely by `seriesId` with no owner filter, so the attacker's trip title, dates, cover photo and tags render inside the victim's series page, and the victim's `seriesOrder` normalisation is corrupted.
- **Confidence**: Confirmed
- **Suggested fix**: Remove `seriesId` from `updateTripSchema`, or verify series ownership before applying it.

#### CSRF double-submit token is not bound to the session

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Backend
- **Category**: Security
- **Location**: `backend/src/security/csrf.ts:11-13,92-112`
- **Issue**: `validateCsrf` only checks that the `csrf-token` cookie equals the `x-csrf-token` header. The token is 32 random bytes compared with `timingSafeEqual` (both good), but carries no cryptographic tie to the session — any value present in both places passes. Cookies are not origin-isolated, and `COOKIE_DOMAIN` (`config/index.ts:59`) exists specifically to widen scope to a parent domain.
- **Impact**: Where `COOKIE_DOMAIN` is set to a parent domain, an attacker controlling any sibling subdomain can set the cookie and send the matching header, defeating the layer entirely. `SameSite=strict` is the real protection; the CSRF check adds little on top.
- **Confidence**: Confirmed
- **Suggested fix**: Issue the token as an HMAC over the session/user identifier keyed by a server secret, and verify the HMAC.

#### Stored integration URLs are validated only at save time, not at fetch time ✅ FIXED

- **Reported**: 2026-07-25
- **Status**: Fixed (2026-11-20)
- **Priority**: Medium
- **Component**: Backend
- **Category**: Security — SSRF / DNS rebinding
- **Location**: `backend/src/security/urlValidation.ts:213-262`; `backend/src/controllers/user.controller.ts:107-109,204-205`; `backend/src/services/immich.service.ts:61-75`
- **Issue**: `validateUrlNotInternal()` resolves the hostname and rejects private IPs — and its comment claims this prevents DNS rebinding — but it runs only on save. `immich.service.ts` later builds an axios instance straight from the stored `apiUrl` with no re-validation, and axios follows redirects by default.
- **Impact**: A user saves `https://attacker.example.com` (public IP, passes), then re-points that DNS record at `169.254.169.254` or `127.0.0.1`. Every subsequent Immich call hits the internal target with the response surfaced to the user. Same shape applies to `llmBaseUrl`.
- **Confidence**: Confirmed
- **Suggested fix**: Re-validate immediately before each outbound request (or pin the validated IP into the request agent), and limit redirect following.
- **Fix**: `security/integrationRequestGuard.ts` adds `integrationRequestOptions(url)`, spread into every request to a user-configured URL: the Immich client (`immich.service.ts` `createClient`), the Immich asset check in `photo.service.ts`, and per-user LLM endpoints (`llm.service.ts` `chat` and `chatWithImage`). At request time it re-runs the static checks (scheme, blocked names, IP literals) and routes the request through shared http/https agents whose `lookup` resolves the hostname, refuses the connection if any answer is private or internal, and hands the checked address straight to the socket, so there is no second lookup to rebind. Proxies are disabled on guarded requests so the checked address is the one connected to, and all of these calls keep `maxRedirects: 0`. The LAN escape hatch is unchanged: with `ALLOW_PRIVATE_INTEGRATION_URLS` on and a LAN host (`isLocalNetworkHostname`) the request goes out normally. The admin's `LLM_BASE_URL` is trusted and not guarded. Tests: `security/__tests__/integrationRequestGuard.test.ts` drives real axios requests at a local server with mocked DNS (save-time public, request-time private → refused, server never hit; escape hatch on/off), plus service-level cases in `immich.service.test.ts` and `llm.service.test.ts`.

#### Registration and user search both allow account enumeration

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Backend
- **Category**: Security
- **Location**: `backend/src/services/auth.service.ts:17-22`; `backend/src/services/user.service.ts:617-651`, `backend/src/routes/user.routes.ts:417`
- **Issue**: `register()` returns distinct messages — `'Email already registered'` vs `'Username already taken'` — while the invitation flow deliberately returns a single generic message for both cases (`userInvitation.service.ts:212,221`), so the intent exists elsewhere and is simply missing here. Separately, user search matches on `email` with `contains`; submitting a full address and getting a non-empty result confirms registration (and returns username and avatar), which the doc comment's anti-harvesting design does not cover.
- **Impact**: Unauthenticated email enumeration at 15 attempts/15 min/IP; authenticated verification at ~14k/day.
- **Confidence**: Confirmed
- **Suggested fix**: Use one generic collision message; match email on exact equality only.

#### `WeatherData` has no unique constraint and uses check-then-act

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Database
- **Category**: Data integrity
- **Location**: `backend/prisma/schema.prisma` model `WeatherData` (lines 505-527); `backend/src/services/weather.service.ts:166-245`
- **Issue**: The service does `findFirst({ where: { tripId, date } })` then `create(...)` rather than `upsert`, and the schema has no `@@unique` on `(tripId, date)` to back the assumption — only separate non-unique indexes.
- **Impact**: Two concurrent requests for the same trip/date (two tabs, or a retry racing the original) can both miss the cache and both insert. Later `findFirst` reads silently pick whichever sorts first, hiding the duplicate.
- **Confidence**: Likely (needs a race window)
- **Suggested fix**: Add `@@unique([tripId, date])` and switch to `upsert`.

#### `Activity.cost` accepts negative values the database rejects with an opaque 500

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Database
- **Category**: Schema drift
- **Location**: `backend/src/types/activity.types.ts:26,45` vs `backend/prisma/migrations/20260220000000_add_cost_check_constraints_and_defaults/migration.sql`
- **Issue**: The DB has `CHECK (cost >= 0)` on `activities.cost`. `lodging.types.ts:74,90` and `transportation.types.ts:104,131` both enforce the floor in Zod; `activity.types.ts` is the outlier, using `z.number().optional()` and `optionalNumber()` despite `zodHelpers.ts` already exporting `optionalPositiveNumber()`.
- **Impact**: A negative cost passes validation and trips the Postgres CHECK. `errorHandler.ts:118-148` handles only `P2002`/`P2003`/`P2025`, so this falls through to a bare `500 Internal server error` instead of the clean 400 every sibling field produces.
- **Confidence**: Confirmed
- **Suggested fix**: Use `optionalPositiveNumber()` on both lines.

#### `EntityLink` rows orphaned when a `PdfImport` is deleted

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Database
- **Category**: Data integrity
- **Location**: `backend/src/services/pdfImport.service.ts:451-461` (creation) vs `:510-522` (`deletePdfImport`)
- **Issue**: Accepting a pending entity creates an `EntityLink` with `sourceType: 'PDF_IMPORT'`. `deletePdfImport()` deletes the row directly with no `cleanupEntityLinks` call, unlike every other entity type, which routes through `deleteEntity()` (`crudHelpers.ts:265-304`). `EntityLink.sourceId`/`targetId` are plain `Int` columns with no FK, so the database cannot enforce this.
- **Impact**: Links survive pointing at a deleted `pdfImportId`; `getAllLinksForEntity` shows a link whose target details resolve to `null`. Same root cause as the activity-cascade finding above.
- **Confidence**: Confirmed
- **Suggested fix**: Call `cleanupEntityLinks` inside `deletePdfImport()`, in the same transaction as the row delete.

#### `duplicateTrip` ID mapping collapses rows with identical composite keys

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Backend
- **Category**: Data integrity
- **Location**: `backend/src/services/trip.service.ts:702-715` (transportation), `:739-754` (lodging), `:773-788` (journal), `:805-817` (albums), `:913-926` (checklists); consumed at `:984`
- **Issue**: New IDs are resolved with `newRecords.find(c => compositeKey(c) === compositeKey(old))`. `find` returns the first match and nothing marks it consumed. Two source rows sharing a composite key — two flights with no reference number and the same start location, two identical lodgings, two checklists with the same name and type — both map to the same new row, and the second new row gets no mapping.
- **Impact**: `EntityLink`s rebuilt via `getNewId()` point at the wrong duplicate or are dropped, producing incorrect associations in the duplicated trip, silently.
- **Confidence**: Likely (mechanism confirmed; needs colliding keys in real data)
- **Suggested fix**: Splice matched candidates out of the array, or zip source and creation order by a stable per-batch sequence.

#### N+1 external routing calls when listing transportation

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Backend
- **Category**: Performance
- **Location**: `backend/src/services/transportation.service.ts:236-334` (`enhanceTransportations`), called from `:189` and `:230`
- **Issue**: `Promise.all(transportations.map(...))` issues a separate outbound `routingService.calculateRoute` call for every car/bike/walk row with both endpoints. `getAllTransportation` paginates at up to 100 rows across all of a user's trips.
- **Impact**: One page load fans out to dozens of concurrent external HTTP calls, scaling linearly with row count; can trip provider rate limits.
- **Confidence**: Likely (fan-out confirmed; latency depends on `routingService` caching)
- **Suggested fix**: Batch route lookups or cache geometry more aggressively.

#### Unbounded LLM fan-out in AI link suggestions

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Backend
- **Category**: Performance / cost
- **Location**: `backend/src/services/aiSuggestion.service.ts:474-627` (`suggestLlmLinks`), loops at `:485-550` and `:553-624`
- **Issue**: One `llmService.chat()` call per uncaptioned-GPS photo plus one per journal entry, awaited sequentially, with no cap on either loop.
- **Impact**: A single `GET /api/trips/:tripId/ai/link-suggestions?strategies=llm` on a trip with 200 photos and 30 entries triggers up to 230 sequential LLM calls, defeating `aiLimiter` (20/hour) as a cost control and risking proxy timeouts.
- **Confidence**: Confirmed (no `slice`/cap found before the per-item call)
- **Suggested fix**: Cap items per request and/or batch candidates into single calls.

#### AviationStack quota detection is dead code

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Backend
- **Category**: Correctness
- **Location**: `backend/src/services/aviationstack.service.ts:470-493`, specifically line 475
- **Issue**: The catch block tests `error.response?.status === 104`. AviationStack signals quota exhaustion via `error.code` inside a `200 OK` body, not an HTTP status — and `104` is not a valid HTTP status. Axios only rejects on non-2xx, so this branch is unreachable; a real quota response falls through to the `!response.data` check at `:443` and returns `null`.
- **Impact**: Once quota is exhausted, every flight lookup silently reports "flight not found". Nothing in logs or responses distinguishes the two.
- **Confidence**: Likely
- **Suggested fix**: Parse `error.code`/`error.message` from the response body and handle known usage-limit codes distinctly, as the adjacent `401` branch does.

#### No dedicated rate limit on metered third-party endpoints

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Backend
- **Category**: Reliability / cost
- **Location**: `backend/src/routes/weather.routes.ts`, `backend/src/routes/flightTracking.routes.ts`; compare `backend/src/middleware/rateLimit.ts:67-118`
- **Issue**: `refreshAllWeather`/`refreshWeather` and `refreshFlightsForTrip`/`getFlightStatus` call OpenWeatherMap and AviationStack but apply no per-user limiter, falling back to the blanket 1000/15min IP limiter. `aiLimiter`/`backupLimiter` were added specifically because those calls "cost real money or burn shared provider quota" — the same reasoning applies here.
- **Impact**: `refreshAllWeatherForTrip` re-fetches every day of a trip and `refreshFlightsForTrip` loops every flight; repeated calls can exhaust a metered quota well within the general budget, especially with a system-wide API key.
- **Confidence**: Confirmed
- **Suggested fix**: Apply a per-user limiter using the existing `userOrIpKey` pattern.

#### `useOfflineSearch` abort logic is a no-op — stale results can overwrite fresh ones

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Frontend
- **Category**: Correctness
- **Location**: `frontend/src/hooks/useOfflineSearch.ts:210,283-284,301-321`; `frontend/src/services/search.service.ts:19-24`
- **Issue**: The hook creates an `AbortController` and aborts the previous one before each debounced search, but the signal is never passed to `performOnlineSearch`/`performOfflineSearch`. `searchService.globalSearch()` accepts no signal, and the axios call passes no `signal` option, so nothing is cancelled.
- **Impact**: When an earlier request resolves after a later one — common on flaky connections — `setResults` overwrites fresher results with stale ones, with no ordering guard.
- **Confidence**: Likely
- **Suggested fix**: Thread the signal through to axios, or track a request-generation counter and ignore non-latest responses.

#### `storageManager` clears the wrong IndexedDB store names and silently fails

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Frontend
- **Category**: Reliability
- **Location**: `frontend/src/services/storageManager.service.ts:463-479`, catch at `:482-488`; real names at `frontend/src/lib/offlineDb.ts:522,557,570`
- **Issue**: The `tripStores` array lists `'albums'`, `'tags'`, `'companions'`; the actual object stores are `photoAlbums`, `tripTags`, `travelCompanions`. `db.transaction()` throws `NotFoundError` for an unknown store, and an empty `catch { /* Store might not exist */ }` swallows it.
- **Impact**: "Clear trip data" never deletes albums, tags or companions. Storage is not reclaimed and no error surfaces.
- **Confidence**: Confirmed
- **Suggested fix**: Correct the names against `STORE_NAMES` and log on catch instead of ignoring.

#### `EntityPickerModal` reimplements a modal without Escape, focus trap, scroll lock or backdrop close

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Frontend
- **Category**: Accessibility / Maintainability
- **Location**: `frontend/src/components/EntityPickerModal.tsx:65-190`; correct sibling at `frontend/src/components/GeneralEntityPickerModal.tsx:39-70`
- **Issue**: A hand-rolled `fixed inset-0` overlay that uses neither the shared `Modal` nor any of its behaviours: no `keydown` listener (Escape does nothing), no focus trap (Tab reaches background content), no body scroll lock, no backdrop `onClick`, no `role="dialog"`/`aria-modal`. Its sibling `GeneralEntityPickerModal`, used in the same kind of flow, independently implements all of these.
- **Impact**: Users linking photos cannot dismiss with Escape or an outside click; keyboard users tab into background content; screen readers do not announce a dialog.
- **Confidence**: Confirmed
- **Suggested fix**: Replace the custom overlay with the shared `Modal`.

### Low Priority

#### `authenticateFileAccess` ignores `passwordVersion` invalidation

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Backend | **Category**: Security
- **Location**: `backend/src/index.ts:191-220`
- **Issue**: Unlike `middleware/auth.ts:88-109`, the file-access path never compares the token's `passwordVersion` against the database, and it accepts the long-lived refresh cookie as a credential.
- **Impact**: After a password change, old tokens are rejected everywhere on the API but still unlock `/uploads` until natural expiry (up to 7 days) — undercutting "change your password to evict an intruder".
- **Confidence**: Confirmed | **Fix**: Reuse the `authenticate` middleware's cached `passwordVersion` check.

#### Token blacklist persists full unhashed tokens to disk

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Backend | **Category**: Security
- **Location**: `backend/src/services/tokenBlacklist.service.ts:87-98,142-147`
- **Issue**: `persistBlacklist()` writes complete JWT strings to `data/token-blacklist.json` in cleartext, keyed by the raw token, for up to 7 days.
- **Impact**: The file accumulates structurally valid tokens (exposed by any backup or misconfigured mount), and deleting or truncating it silently un-revokes every logged-out session.
- **Confidence**: Confirmed | **Fix**: Key on `sha256(token)` — lookups still work and the file stops being a token store.

#### Configured auth rate limiter is dead code

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Backend | **Category**: Security
- **Location**: `backend/src/middleware/rateLimit.ts:56-65`; actual limiter at `backend/src/index.ts:135-169`
- **Issue**: `authRateLimiter` (5/min, documented as the anti-brute-force control) is exported but never imported anywhere. What actually protects `/api/auth` is a locally-defined 15-per-15-minutes-per-IP limiter. There is no per-account throttling. `PUT /api/users/password`, which verifies `currentPassword`, carries only the general 1000/15min limiter.
- **Impact**: Guessing is IP-bounded rather than account-bounded, diluted across a botnet or shared NAT. (`trust proxy: 1` is correctly configured for the bundled Nginx, so header spoofing is not an additional bypass.)
- **Confidence**: Confirmed | **Fix**: Wire it up or delete it; add a per-email counter with backoff and a strict limiter on password change.

#### SMTP settings accept an arbitrary host and port

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Backend | **Category**: Security
- **Location**: `backend/src/controllers/user.controller.ts:35-43,357-389`; `backend/src/services/email.service.ts:135-146`
- **Issue**: `smtpSettingsSchema` accepts any non-empty host and any port 1-65535, with none of the SSRF checks the adjacent Immich and LLM handlers apply. `POST /api/users/smtp-settings/test` then connects immediately.
- **Impact**: An authenticated user gets an outbound TCP connect primitive to arbitrary internal host:port with success/failure reflected in the response — a usable port scanner.
- **Confidence**: Confirmed | **Fix**: Apply host validation and restrict to standard SMTP ports.

#### Immich `testConnection` is a network reconnaissance oracle

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Backend | **Category**: Security
- **Location**: `backend/src/controllers/immich.controller.ts:58-80`; error branching at `backend/src/services/immich.service.ts:108-161`
- **Issue**: Accepts an arbitrary `apiUrl` and deliberately skips SSRF validation (documented tradeoff), returning differentiated errors for `ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT`, TLS failures, `401/403` and `404`.
- **Impact**: Any authenticated user can distinguish closed / filtered / open-wrong-protocol / open-with-TLS-issue / open-and-authenticating for hosts reachable from the backend container — broader than the "my own LAN Immich" case the tradeoff requires.
- **Confidence**: Suspected (conscious documented tradeoff; flagged for completeness) | **Fix**: Restrict to the instance owner or collapse all failures to one generic message.

#### OIDC discovery `issuer` is never compared against the configured issuer

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Backend | **Category**: Security
- **Location**: `backend/src/services/oidc.service.ts:77-86,212`
- **Issue**: `getDiscovery()` validates required endpoints but never asserts `doc.issuer === config.oidc.issuerUrl`. The ID token's `iss` is then compared to `discovery.issuer` — a value from the same document, not from operator config. OIDC Discovery requires this equality check.
- **Impact**: The issuer check is self-referential; a substituted discovery document passes. Low alone, but it removes a layer that would otherwise contain the unverified-ID-token issue above.
- **Confidence**: Confirmed | **Fix**: Assert equality after fetching and fail closed.

#### Swagger UI is mounted unauthenticated in all environments

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Backend | **Category**: Security
- **Location**: `backend/src/index.ts:316`; `backend/src/config/swagger.ts:42-56`
- **Issue**: `setupSwagger(app)` is called with no `nodeEnv` guard and no auth. Mounted at `/api-docs`, it also sits outside `app.use('/api', limiter)` and `app.use('/api', validateCsrf)`, since Express matches mount paths on segment boundaries.
- **Impact**: The full API surface is published to anonymous visitors in production, unrate-limited. Reconnaissance value only; no secrets exposed.
- **Confidence**: Confirmed | **Fix**: Guard with `if (config.nodeEnv !== 'production')` or put it behind `authenticate`.

#### Operator-facing configuration hints returned to unauthenticated clients

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Backend | **Category**: Security
- **Location**: `backend/src/services/oidc.service.ts:70-76`; `backend/src/middleware/errorHandler.ts:152-157`
- **Issue**: The discovery-failure `AppError` carries text naming `OIDC_ISSUER_URL` and "reachable from the backend container", returned verbatim on the unauthenticated `/api/auth/oidc/login`.
- **Impact**: Minor infrastructure disclosure. (The handler is otherwise clean — no stack traces, Zod errors reduced to field names, unknown errors collapsed to a generic 500.)
- **Confidence**: Confirmed | **Fix**: Log the hint, return a generic message.

#### bcrypt cost factor 10, hardcoded in three places, with no password composition rules

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Backend | **Category**: Security
- **Location**: `backend/src/auth/password.ts:3`, `backend/src/services/user.service.ts:595`, `backend/src/services/userInvitation.service.ts:225`
- **Issue**: `SALT_ROUNDS = 10` (below the recommended 12), duplicated in three places — `userInvitation.service.ts` calls `bcrypt.hash(data.password, 10)` directly, bypassing the `hashPassword` helper. Policy is `min(8).max(100)` with no complexity or breach-list check.
- **Impact**: Offline cracking of a stolen hash dump is ~4x cheaper than it should be. Not exploitable without a database compromise.
- **Confidence**: Confirmed | **Fix**: Raise to 12 in one place, route the invitation service through `hashPassword()`, raise the minimum length.

#### Login and refresh are CSRF-exempt by path

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Backend | **Category**: Security
- **Location**: `backend/src/security/csrf.ts:75-78`
- **Issue**: `/auth/login`, `/auth/register`, `/auth/refresh` and `/auth/silent-refresh` skip CSRF validation. The path normalisation guarding the list is careful (decode, collapse slashes, exact match, fail-closed 400 on malformed encoding) and cannot itself be bypassed. The residual exposure is login-CSRF.
- **Impact**: Mitigated in practice by two controls — `express.json` parses only `application/json`, which a cross-site form POST cannot produce, and a `fetch` with that type is preflighted and blocked by the origin allowlist. Recorded because both mitigations are incidental; adding a `text/plain` or urlencoded parser to these routes would open it.
- **Confidence**: Confirmed (the exemption); **Suspected** (practical exploitability — no working attack was constructed) | **Fix**: Issue a pre-session token validated on login, or document the dependency on JSON-only parsing.

#### `getTrips` pagination parameters are unvalidated

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Backend | **Category**: Correctness
- **Location**: `backend/src/services/trip.service.ts:78-80,134`; schema at `backend/src/types/trip.types.ts:106-118`
- **Issue**: `page`, `limit` and `seriesId` are typed `z.string().optional()` and passed through bare `parseInt` with no bounds. `?limit=1000000` yields an unbounded `take`; `?page=abc` yields `skip: NaN`. Siblings do this correctly — `photoQuerySchema` uses `z.coerce.number().int().min(1).max(1000)`.
- **Impact**: Memory/CPU amplification from one request (the trip list carries `_count` aggregates and tag/cover includes), and 500s instead of 400s on malformed input.
- **Confidence**: Confirmed | **Fix**: Use `z.coerce.number().int()` with bounds, matching `photoQuerySchema`.

#### Location `categoryId` is accepted without verifying ownership

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Backend | **Category**: Security
- **Location**: `backend/src/services/location.service.ts:85,302-311`
- **Issue**: Create and update write `categoryId` with no lookup, while `getCategories` restricts visibility to `{ userId }` OR `{ isDefault: true }` and `updateCategory`/`deleteCategory` both enforce ownership. The read path guards what the write path does not.
- **Impact**: A user can point their location at another user's private category; its `name`, `icon` and `color` then return via `include: { category: true }`. Minor cross-tenant metadata disclosure plus a dangling reference.
- **Confidence**: Confirmed | **Fix**: Verify the category is owned or default before writing.

#### `addChecklistItem` reads the request body with no schema validation

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Backend | **Category**: Correctness
- **Location**: `backend/src/controllers/checklist.controller.ts:108`
- **Issue**: `const { name, description, metadata } = req.body;` with only a truthiness check on `name`. Every other handler in the controller parses through Zod. `metadata` reaches a Prisma `Json` column unvalidated, and `name`/`description` bypass the `max(500)` limits defined for the identical fields on the create path.
- **Impact**: Unbounded strings and arbitrary JSON land in the DB (capped only by the 1 MB body limit); a non-string `name` reaches Prisma as a type error rather than a 400.
- **Confidence**: Confirmed | **Fix**: Parse with `ChecklistItemSchema.pick({ name: true, description: true, metadata: true })`.

#### `updateChecklist` cannot clear `tripId` back to null

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Backend | **Category**: Correctness
- **Location**: `backend/src/services/checklist.service.ts:340-344`
- **Issue**: The update builds `tripId: data.tripId ?? undefined`. `UpdateChecklistSchema` uses `nullableOptional`, so `null` is a valid input meaning "clear", but `?? undefined` converts it to "leave unchanged".
- **Impact**: A trip-scoped checklist can never be detached from its trip via the API, contradicting the schema's own contract.
- **Confidence**: Confirmed | **Fix**: Use the shared `buildConditionalUpdateData` helper, which distinguishes `undefined` from `null`.

#### `getAllTransportation` silently excludes collaborator-shared trips

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Backend | **Category**: Correctness
- **Location**: `backend/src/services/transportation.service.ts:200-206`
- **Issue**: Scopes trips with `findMany({ where: { userId } })` — owner only — while every other accessor uses `verifyTripAccessWithPermission`, which also grants access via collaborators.
- **Impact**: A collaborator does not see a shared trip's transportation in the aggregate view, though they can see it when opening the trip directly.
- **Confidence**: Likely (may be intentional "my trips only" scoping, but inconsistent with the access model) | **Fix**: Extend the query to match `collaborators: { some: { userId } }`.

#### `JournalEntry.mood` and `weatherNotes` are unreachable via the API

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Backend | **Category**: Correctness
- **Location**: `backend/src/types/journalEntry.types.ts:22-34`; `backend/src/services/journalEntry.service.ts:111-121`
- **Issue**: Both fields exist on the Prisma model and the TS interface, and the frontend references them, but neither create nor update schema accepts them and `updateJournalEntry` destructures only `title, content, entryDate`.
- **Impact**: Values set from the frontend are silently dropped with no error.
- **Confidence**: Suspected (frontend usage only spot-checked) | **Fix**: Wire them into the schemas and update logic, or remove the dead fields.

#### `removePhotoFromAlbum` returns 500 instead of 404

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Backend | **Category**: Correctness
- **Location**: `backend/src/services/photoAlbum.service.ts:447-465`
- **Issue**: Calls `prisma.photoAlbumAssignment.delete` with no existence check. A missing assignment (double-click, stale UI, race) raises Prisma `P2025`, untranslated here.
- **Impact**: Generic 500 rather than the `AppError(..., 404)` every other delete path in the file produces.
- **Confidence**: Likely | **Fix**: `findFirst` then throw a 404, or catch and translate `P2025`.

#### Stale-job reset for PDF import and email ingest runs only at startup

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Backend | **Category**: Reliability
- **Location**: `backend/src/index.ts:328,331`; `backend/src/services/pdfImport.service.ts:528-554`; `backend/src/services/emailIngest.service.ts:321-351`; `backend/src/config/cron.ts` (no matching job)
- **Issue**: Both "reset rows stuck in PROCESSING/PARSING" routines are invoked once at boot and never registered in `cron.ts`, which does schedule other periodic jobs.
- **Impact**: A job stuck without a full process restart stays `PARSING`/`PROCESSING` indefinitely. Self-hosted deployments — the stated model — may go a long time between restarts.
- **Confidence**: Suspected (startup-only confirmed; no specific hang reproduced) | **Fix**: Register both on the existing hourly cron in addition to the startup call.

#### `TripExpense` lacks a `(tripId, date)` index

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Database | **Category**: Performance
- **Location**: `backend/prisma/schema.prisma` model `TripExpense` (line 483); query at `backend/src/services/expense.service.ts:62-65`
- **Issue**: `getExpensesByTrip` orders by `date desc, createdAt desc` but only `tripId` is indexed. `Photo` has `@@index([tripId, takenAt])` and `JournalEntry` has `@@index([tripId, date])` for the identical pattern.
- **Impact**: Postgres sorts in memory — fine at realistic row counts, but inconsistent with the schema's own convention and visible in `EXPLAIN` as trips accumulate expenses.
- **Confidence**: Confirmed | **Fix**: Add `@@index([tripId, date])`.

#### `trip_expenses.amount` lacks the non-negative CHECK its siblings have

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Database | **Category**: Schema drift
- **Location**: `backend/prisma/schema.prisma` model `TripExpense`; compare `backend/prisma/migrations/20260220000000_add_cost_check_constraints_and_defaults/migration.sql`
- **Issue**: `activity`/`lodging`/`transportation` cost columns all got `*_cost_non_negative` CHECK constraints on 2026-02-20. `TripExpense`, added 2026-07-19, never got one, though `expense.types.ts:33` enforces the floor in Zod. (This is the mirror image of the `Activity.cost` finding — here the app-layer check exists and the DB-layer one is missing.)
- **Impact**: Low while all writes go through the validated API; matters for scripts, bulk imports, or raw SQL fixes like the ones already in this repo's history.
- **Confidence**: Confirmed | **Fix**: Add the constraint in a follow-up migration.

#### CHECK constraints exist only in raw migration SQL, invisible to `schema.prisma`

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Database | **Category**: Migration risk
- **Location**: `backend/prisma/migrations/20260220000000_add_cost_check_constraints_and_defaults/migration.sql`; `backend/prisma/schema.prisma` (no annotation)
- **Issue**: Prisma cannot represent CHECK constraints in this version, so the three constraints exist only as a side effect of a hand-written migration. `schema.prisma` looks identical whether or not they are present in the database.
- **Impact**: `prisma migrate diff` and shadow-database resets do not reflect them, and a `prisma db push` rebuild would not recreate them. Same class as the missing-baseline risk, narrower scope.
- **Confidence**: Confirmed | **Fix**: At minimum add a comment beside each field pointing at the migration.

#### PostGIS `coordinates` is written on every Location/Photo mutation but never read

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Database | **Category**: Performance
- **Location**: `backend/src/config/prismaExtensions.ts:22-82`; `backend/prisma/schema.prisma` lines 266, 314
- **Issue**: A Prisma client extension fires a raw `UPDATE ... ST_SetSRID(ST_MakePoint(...))` after every `location.create/update` and `photo.create/update` (four separate round-trips). A repo-wide search for `ST_DWithin`, `ST_Distance`, or any raw query filtering on `coordinates` finds nothing in `backend/src` — no spatial query exists.
- **Impact**: Every location/photo write pays an extra UPDATE plus GiST index maintenance for a column with no readers. Not a correctness bug (CLAUDE.md notes PostGIS is "not heavily used yet"), but it is on the hot write path for two of the most-written tables.
- **Confidence**: Confirmed (write path); Suspected (magnitude — not profiled) | **Fix**: Either ship the spatial feature or defer the sync to a periodic backfill.

#### PostGIS `coordinates` was never backfilled for pre-existing rows

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Database | **Category**: Migration risk
- **Location**: `backend/prisma/migrations/20260103_add_postgis_coordinates/migration.sql`
- **Issue**: The migration adds the columns and GiST indexes but performs no `UPDATE ... SET coordinates = ...` backfill from the existing `latitude`/`longitude` columns. Sync-on-write exists only in the application-layer extension added separately.
- **Impact**: Any row written before this migration and not edited since has populated lat/lng but `NULL` coordinates forever. Latent today (nothing queries the column), but it means the column cannot be trusted as "populated wherever lat/lng is" by whoever builds the nearby-search feature.
- **Confidence**: Confirmed | **Fix**: Run a one-time backfill before relying on the column.

#### `syncManager.checkForConflict` has a latent `NaN` entity-ID trap

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Frontend | **Category**: Correctness
- **Location**: `frontend/src/services/syncManager.ts:384-449`, branches at `:390-394`, delete handling at `:434-446`
- **Issue**: `parseInt(change.entityId, 10)` assumes numeric IDs. A future non-numeric (UUID) entity type yields `NaN`, the conflict-check GET hits `/{endpoint}/NaN`, 404s, and is classified as "deleted on server". Separately, the `if (change.entityType === 'trip')` branches are identical — dead branching suggesting an intended trip-specific path was never implemented.
- **Impact**: Benign today (all synced types use numeric IDs); a trap for the next entity type added to `ENTITY_ENDPOINTS`, where a live update would be misclassified as a delete.
- **Confidence**: Suspected | **Fix**: Guard with `Number.isNaN` and fail the check explicitly; collapse the dead branch.

#### Zustand persisted stores have no `version`/`migrate`

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Frontend | **Category**: Reliability
- **Location**: `frontend/src/store/themeStore.ts:13-44`, `frontend/src/store/navigationStore.ts:21-42`
- **Issue**: Both use `persist` with only a `name` option — no versioning hook.
- **Impact**: Minimal today given flat shapes; a future rename would spread stale persisted JSON in as-is, leaving returning users with an unrecognised `theme`/`layout` until the next explicit set.
- **Confidence**: Suspected | **Fix**: Add `version: 1` and a no-op `migrate` now so future changes have a hook.

#### `TripDetailPage` header JSX is fully duplicated across two background states

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Frontend | **Category**: Maintainability
- **Location**: `frontend/src/pages/TripDetailPage.tsx:1023-1223` vs `:1224-1384`
- **Issue**: Title, status badge, trip-type badge, series badge, tags, share, edit, PDF import, duplicate, description, dates, checklists and jet-lag calculator are written out twice — once per cover-photo branch — differing only in colour classes.
- **Impact**: Any future header change must be made twice or it silently applies to only one state. This is the same divergence mechanism that produced the `EntityPickerModal` and shift-click bugs above.
- **Confidence**: Confirmed | **Fix**: Extract a sub-component parameterised by the colour classes.

#### `PhotoUpload` preview list keys by array index while items are removable from the middle

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Frontend | **Category**: Correctness
- **Location**: `frontend/src/components/PhotoUpload.tsx:467-506`
- **Issue**: Rows render with `key={index}` while the remove button filters by index, shifting every subsequent key. React reuses DOM nodes across different underlying files.
- **Impact**: Visual glitching when removing from the middle of a multi-file queue. Content stays correct (recomputed by index each render); this is a node-identity bug, not data corruption.
- **Confidence**: Likely | **Fix**: Pair each `File` with a generated id when added and key by that.

#### `offlineAuthService` is entirely unused

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Frontend | **Category**: Reliability
- **Location**: `frontend/src/services/offlineAuth.service.ts` (whole file)
- **Issue**: The module documents itself as providing read-only offline access via an encrypted device-bound session, but `createOfflineSession` is never called after login/`silentRefresh`, and no file references any export (full-repo grep).
- **Impact**: Inert today, but offline-session read access does not actually exist if product requirements assume it. Part of the same unwired-PWA pattern as the High-priority finding above.
- **Confidence**: Confirmed | **Fix**: Wire it into login/logout, or remove it if superseded.

### Release, CI, and Infrastructure

_Grouped separately from the priority sections above because these concern the build and release
pipeline rather than application code. Each item carries its own priority label._

#### `release.ps1`'s backend build verification is dead code — a broken build still ships

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: High
- **Component**: Infrastructure
- **Category**: Script correctness
- **Location**: `release.ps1:164-179`
- **Issue**: The build gate is `try { npm run build 2>&1 | Out-Null; Write-Success "Backend build completed" } catch { ... }`. A non-zero exit from an external command does **not** raise a terminating PowerShell error, so the `catch` never fires for a failed build (only for a missing `npm` binary). `$LASTEXITCODE` is never checked and the output is discarded via `Out-Null`, so `"Backend build completed"` prints unconditionally.
- **Impact**: A release proceeds to Docker build, image push, and git tag creation even when the backend does not compile. The one gate meant to catch this always reports green, directly contradicting `BUILD_AND_PUSH.md`'s "don't proceed until builds pass". The frontend check at ~line 186 matches on `"built in"` in the output — a better heuristic, but still non-blocking (`Write-Warn` only).
- **Confidence**: Confirmed
- **Suggested fix**: Check `$LASTEXITCODE` after the call and abort (or prompt) on failure; gate the frontend check the same way.

#### `.github/workflows/release.yml` fails on every tag push — `CHANGELOG.md` does not exist

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: High
- **Component**: Infrastructure
- **Category**: Release process / CI
- **Location**: `.github/workflows/release.yml:96-103`
- **Issue**: The `create-release` job runs `awk "/## \[$VERSION\]/,/## \[/" CHANGELOG.md | ...` on every `v*` tag push. `CHANGELOG.md` is not present in the repository (verified). GitHub Actions `run:` steps default to `bash -e`, so the missing-file failure aborts the step and fails the job.
- **Impact**: `release.ps1` pushes the tag as its final step, so this fires on every release: a red X on every tagged release and no GitHub Release ever produced. The workflow is not mentioned in `BUILD_AND_PUSH.md`, `RELEASE_CHECKLIST.md`, `DEPLOYMENT.md` or `QUICK_START_PRODUCTION.md`, so nobody following the mandated process would know to expect it.
- **Confidence**: Confirmed
- **Suggested fix**: Add a `CHANGELOG.md`, or make the extraction tolerant of a missing file; document the workflow's existence and its relationship to `release.ps1`.

#### `DEPLOYMENT.md` documents `./release.sh patch`, but that script cannot run at all

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: High
- **Component**: Infrastructure
- **Category**: Documentation / Script correctness
- **Location**: `DEPLOYMENT.md:499-510`; `release.sh:6` (`set -e`), `:8` (`CURRENT_VERSION=$(cat VERSION)`), `:66-70` (`sed ... CHANGELOG.md`)
- **Issue**: `release.sh` sets `set -e` then immediately runs `CURRENT_VERSION=$(cat VERSION)`. No `VERSION` file exists — and `RELEASE_CHECKLIST.md:55` states this is intentional ("there is no separate VERSION file"). A failing command substitution in a plain assignment does trip `errexit`, so the script aborts on its first real line. Even if patched, line 68 then `sed`s a non-existent `CHANGELOG.md`, aborting **after** it has already rewritten both `package.json` files but before committing.
- **Impact**: `DEPLOYMENT.md` is one of the four docs CLAUDE.md makes mandatory for deploys, and it tells Linux/Mac users to run a command that cannot succeed. If the missing files were later added without fixing the `set -e` behaviour, the failure mode becomes a silent half-applied version bump in the working tree.
- **Confidence**: Confirmed (both files verified absent; logic traced)
- **Suggested fix**: Either delete `release.sh` and point `DEPLOYMENT.md` at `release.ps1`, or rewrite it to read the version from `backend/package.json` as `release.ps1` does.

#### `build.sh` produces malformed image tags when `DOCKER_REGISTRY` is set

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: High
- **Component**: Infrastructure
- **Category**: Script correctness
- **Location**: `build.sh:9,26-30,37-43`; correct pattern at `build.ps1:28` and `build.truenas.ps1:18`
- **Issue**: `REGISTRY=${DOCKER_REGISTRY:-""}` is interpolated directly against the image name with no separator: `-t ${REGISTRY}travel-life-backend:${VERSION}`. With `DOCKER_REGISTRY=ghcr.io/dsbaciga` — exactly what `BUILD_AND_PUSH.md` and `deploy-to-truenas.ps1:134` instruct — the tag becomes `ghcr.io/dsbagictravel-life-backend:vX.X.X`, concatenating registry path and image name. Both PowerShell build scripts correctly construct a `"$Registry/"` prefix; `build.sh` is the only one missing the slash.
- **Impact**: Following the documented `./build.sh vX.X.X` step on Linux/Mac with a registry set produces an image reference that cannot be pushed to the intended GHCR path without manual re-tagging. Without `DOCKER_REGISTRY` set the build succeeds locally, so nothing catches it until the push fails or lands somewhere unintended.
- **Confidence**: Confirmed
- **Suggested fix**: Use `REGISTRY_PREFIX="${DOCKER_REGISTRY:+$DOCKER_REGISTRY/}"`, mirroring `build.ps1`.

#### Production images are deployed from unpinned `:latest` tags

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Infrastructure
- **Category**: Reliability / release management
- **Location**: `docker-compose.truenas.yml:59,126`; `docker-compose.truenas.optimized.yml:61,129`
- **Issue**: Both TrueNAS compose files reference `ghcr.io/dsbaciga/travel-life-backend:latest` and `...-frontend:latest`. The project otherwise runs a carefully versioned release process (currently v5.6.0, with `release.ps1`/`release.sh`, git tags, and a documented `BUILD_AND_PUSH.md` checklist).
- **Impact**: The deployed version is whatever was pushed most recently, so a deploy is not reproducible, `docker compose pull` can silently change the running version, and rollback requires re-tagging rather than pointing at a previous version. This defeats the versioning discipline the rest of the release process maintains.
- **Confidence**: Confirmed
- **Suggested fix**: Pin to an explicit version (`:v5.6.0`) or a `${APP_VERSION}` variable set in the env file, and have the release scripts update it.

#### Two independent pipelines publish the same release under different tag schemes

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Infrastructure
- **Category**: Release process
- **Location**: `release.ps1:70-72,241-244,296-310` vs `.github/workflows/release.yml:35-55,78-80`
- **Issue**: `release.ps1` builds and pushes `ghcr.io/dsbaciga/travel-life-backend:vX.X.X` (v-prefixed) from a developer machine, then pushes the git tag — which triggers `release.yml` (`on: push: tags: 'v*'`) to build and push again. `docker/metadata-action`'s `type=semver,pattern={{version}}` strips the `v`, so CI publishes the same release as `:X.X.X`, plus `:X.X`, `:X` and `:latest`.
- **Impact**: Two uncoordinated pipelines produce images from one commit under different names. If they diverge — CI cache staleness, or different `VITE_API_URL`/`VITE_UPLOAD_URL` build args between `release.yml:78-80` defaults and local `.env.production` — then `:v1.2.3` and `:1.2.3` are silently different images. Duplicate compute at best, a correctness trap at worst. Note the `:latest` tags CI publishes are what the TrueNAS compose files actually deploy.
- **Confidence**: Likely (mechanism confirmed; observing real divergence is out of scope for a read-only review)
- **Suggested fix**: Pick one publisher — either drop the `docker push` from the scripts or disable the workflow — and document the choice.

#### CI never runs a strict type-check, and backend test failures are permanently swallowed

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Infrastructure
- **Category**: CI
- **Location**: `.github/workflows/docker-build-test.yml:81-85`, job `lint-and-test` at `:52-86`
- **Issue**: CI does exist (`docker-build-test.yml` on PRs and pushes to `main`). But the backend test step is `npm test || echo "No tests configured yet"`, which exits 0 regardless of the result — and backend tests **do** now exist (1552 of them). Neither job runs `npm run build:strict` for either package; the frontend job runs only `npm run lint`, and the Docker build test exercises the relaxed, non-blocking `npm run build`.
- **Impact**: This is the practical consequence of the non-blocking build configuration CLAUDE.md warns about — nothing in CI counteracts it. Both a new type error and a genuine backend test regression can merge to `main` and ship in a tagged release without CI noticing. The 30 currently-failing backend tests are invisible to CI for exactly this reason.
- **Confidence**: Confirmed
- **Suggested fix**: Add `npm run build:strict` steps for both packages and remove the `|| echo` fallback now that tests exist.

#### `fix-migration` scripts can mark a failed migration as successfully applied

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Infrastructure
- **Category**: Script correctness
- **Location**: `fix-migration.ps1:1-35` (no `$ErrorActionPreference`); `fix-migration.sh:1-52` (no `set -e`)
- **Issue**: Both run three sequential, dependent steps against production data — apply a raw `ALTER TABLE`, mark the migration resolved, then `prisma migrate deploy` — without checking the exit code of any step before proceeding. In `fix-migration.sh` the second step is a raw `UPDATE _prisma_migrations SET finished_at = NOW() ...`, which runs unconditionally even if the `ALTER TABLE` failed.
- **Impact**: A failed schema change can be recorded as applied in Prisma's bookkeeping table. Subsequent `migrate deploy` runs then skip it forever, leaving the column permanently missing while Prisma believes the schema is current. This compounds the existing baseline-migration problem.
- **Confidence**: Confirmed (no error checking present); the triggering failure is Likely rather than certain
- **Suggested fix**: Add `set -e` / `$ErrorActionPreference = "Stop"` with explicit exit-code checks, and abort before the bookkeeping update if the schema step failed. Better: delete both scripts, per the related finding above.

#### Backend dependencies: 1 critical and 8 high vulnerabilities

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Infrastructure
- **Category**: Dependencies
- **Location**: `backend/package.json`
- **Issue**: `npm audit --omit=dev` reports **15 vulnerabilities: 1 critical, 8 high, 6 moderate**. The two that touch this app's real attack surface:
  - **`nodemailer` 8.0.11 (high)** — GHSA-p6gq-j5cr-w38f: the `raw` message option bypasses `disableFileAccess`/`disableUrlAccess`, enabling arbitrary file read / SSRF via a crafted outbound email. Requires a **major bump to 9.0.3**. Relevant because the app sends invitations and runs IMAP ingest.
  - **`sharp` 0.33.5 (high)** — inherited libvips CVEs (GHSA-f88m-g3jw-g9cj). Requires a **major bump to 0.35.3**. Relevant because `sharp` processes user-uploaded photos.
  - Lower real-world risk, non-major fixes available: `tar` (critical, transitive via `sharp`'s installer), `swagger-jsdoc` 6.2.8 → 6.3.0, and the Prisma dev-CLI chain. `node-cron` 3.0.3 needs a major bump for a moderate issue.
- **Impact**: The `nodemailer` and `sharp` issues are directly reachable through features the app actually uses (outbound email, photo upload processing).
- **Confidence**: Confirmed (raw audit output)
- **Suggested fix**: `npm audit fix` for the non-major items first; schedule and regression-test the `nodemailer` 9.x and `sharp` 0.35.x majors separately.

#### Frontend dependencies: 12 high vulnerabilities, one runtime-relevant

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Infrastructure
- **Category**: Dependencies
- **Location**: `frontend/package.json`
- **Issue**: `npm audit --omit=dev` reports **12 high, 0 critical**. Only one ships to browsers: **`react-router-dom`** — GHSA-qwww-vcr4-c8h2, a CSRF bypass in RSC mode allowing action execution before a 400 response, affecting `7.12.0 - 8.2.0`, with a non-major fix available. Everything else (`sharp` via `@vite-pwa/assets-generator`, the `workbox-build` chain including `ejs`/`jake`/`filelist`, and the `brace-expansion`/`minimatch` chain) is **build-time only** and never reaches the production bundle.
- **Impact**: Only the router issue has user-facing exposure; the rest is toolchain noise that should not drive urgency.
- **Confidence**: Confirmed (raw audit output)
- **Suggested fix**: Update `react-router-dom` first; handle the PWA/workbox chain opportunistically.

#### AI-tooling artifacts and a stray screenshot are committed to the repository

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Infrastructure
- **Category**: Repo hygiene
- **Location**: `agentdb.rvf`, `agentdb.rvf.lock`, `skills-lock.json`, `login-page.png` (all repo root)
- **Issue**: All four are git-tracked and none are covered by `.gitignore`. `agentdb.rvf`/`agentdb.rvf.lock` are agent-tooling state added in commit `d496947`; `.gitignore` covers `*.db` (which is why `ruvector.db` is correctly ignored) but has no `.rvf` rule. `skills-lock.json` is a tooling lockfile. `login-page.png` (195 KB, commit `747084f`) has zero references anywhere in the codebase or docs.
- **Impact**: These are regenerated with different content on other machines, producing spurious diffs and merge conflicts. `.gitignore:60-66` already excludes `.agents/`, `.claude/`, `.claude-flow/`, `.swarm/` and `.ua/`, so this is an inconsistency in an otherwise deliberate policy.
- **Confidence**: Confirmed (tracked status and `.gitignore` coverage both verified)
- **Suggested fix**: `git rm` the four and add `*.rvf`, `*.rvf.lock`, `skills-lock.json` to `.gitignore`.

#### `release.ps1` deletes an existing git tag, local and remote, with no confirmation

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Medium | **Component**: Infrastructure | **Category**: Script correctness
- **Location**: `release.ps1:276-283`
- **Issue**: On finding an existing tag it runs `git tag -d $Version 2>$null` and `git push origin :refs/tags/$Version 2>$null` unconditionally — no prompt even in interactive mode, unlike the uncommitted-changes check at `:130-142` which does prompt. Both exit codes are suppressed, so a failed remote deletion is ignored and the script recreates a local tag that may now conflict with the surviving remote tag.
- **Impact**: A mistyped `-Version` matching a shipped release silently deletes that published tag locally and on the remote.
- **Confidence**: Confirmed | **Fix**: Prompt before deleting (respecting `-NoConfirm`) and check the push exit code.

#### `release.sh` double-prefixes the tag when given an explicit version

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Medium | **Component**: Infrastructure | **Category**: Script correctness
- **Location**: `release.sh:34-38,82`
- **Issue**: The version-type `case` default is `NEW_VERSION=$VERSION_TYPE` with no `v` stripping, unlike `release.ps1:101` which does `$Version.TrimStart("v")`. Invoking `./release.sh v1.12.6` — natural, since `release.ps1`'s own examples use that form — writes the literal `v1.12.6` into both `package.json` version fields (invalid semver) and tags `vv1.12.6`.
- **Impact**: Corrupted version fields and a malformed tag. Currently masked by the script aborting earlier on the missing `VERSION` file.
- **Confidence**: Confirmed (conditional on the script being made runnable) | **Fix**: Strip a leading `v`/`V` before computing `NEW_VERSION`.

#### Documented release step order does not match `release.ps1`

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Infrastructure | **Category**: Documentation
- **Location**: `RELEASE_CHECKLIST.md:81-141` vs `release.ps1:203-310`; also `docs/guides/BUILD_AND_PUSH.md:35-44`
- **Issue**: The checklist sequences Docker build → image push → commit + tag. The script commits the version bump at Step 4, *before* building (Step 5) and pushing (Step 6). `BUILD_AND_PUSH.md` likewise lists "commits the version bump" before "builds and verifies", while the script verifies first.
- **Impact**: End state is the same, but anyone cross-referencing the checklist while debugging a partial failure is misled about what has already happened.
- **Confidence**: Confirmed | **Fix**: Align one to the other, or note the divergence explicitly.

#### `deploy-to-truenas.ps1` has corrupted output glyphs and a fragile SSH check

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Infrastructure | **Category**: Script correctness
- **Location**: `deploy-to-truenas.ps1:44-46,56,73,111,146,156,161`
- **Issue**: Several `Write-Host` strings contain a literal replacement character where a checkmark or X was intended, indicating an encoding round-trip problem. Separately the connectivity gate is `$sshTest = ssh ... "echo OK" 2>&1; if ($sshTest -notmatch "OK")`, which matches anywhere in captured output — an MOTD or banner containing "OK" would register as success.
- **Impact**: Cosmetic corruption in a script meant to guide a human through deployment; small risk of a false-positive connectivity check before file copies.
- **Confidence**: Confirmed (encoding); Suspected (match fragility) | **Fix**: Re-save as UTF-8 with BOM and anchor the check on a unique sentinel.

#### Root `package.json` and `conductor/` are undocumented non-application content

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Infrastructure | **Category**: Repo hygiene
- **Location**: root `package.json`, `package-lock.json`; `conductor/` (15 tracked files)
- **Issue**: The root `package.json` has a single dependency, `claude-flow`, unrelated to the application, and is what pulls in the root `node_modules/` that CLAUDE.md's documented workflow never mentions. `conductor/` contains style guides and a feature track that corresponds to real shipped work (`f40d747`), so it appears intentional — but neither is mentioned in `docs/README.md` or CLAUDE.md.
- **Impact**: Confusing rather than harmful; a new contributor following the documented commands would never touch either.
- **Confidence**: Confirmed (root package); Suspected (`conductor/` intent) | **Fix**: Document both purposes, or relocate them under an already-ignored directory.

#### Backend test suite: 30 failing tests across 13 suites

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: Medium
- **Component**: Backend
- **Category**: Test integrity
- **Location**: See suite list below
- **Issue**: `npx jest` in `backend/` reports **1522 passing, 30 failing, 1552 total; 13 of 78 suites failing**. Failing suites: `backup.controller`, `user.controller`, `userInvitation.controller`, `errorHandler`, `aviationstack.service`, `journalEntry.service`, `location.service`, `photo.service`, `photoAlbum.service`, `restore.service`, `routing.service`, `tag.service`, `transportation.service`.
  `aviationstack.service.test.ts` does not run at all — it fails at import with `TypeError: Cannot read properties of undefined (reading 'nodeEnv')` at `src/config/logger.ts:5`, i.e. the test environment does not initialise `config` before `logger` is imported through the `pushNotification.service` → `aviationstack.service` chain.
- **Impact**: A failing baseline means the suite cannot gate anything — a genuine regression is indistinguishable from the existing noise. **Of the 30 failures, only 2 indicate a real code defect; the other 28 are stale tests.** Every suite was individually re-run and root-caused:

| Suite | Fails | Root cause | Verdict |
| ----- | ----- | ---------- | ------- |
| `user.controller` | 2 | `validateUrlNotInternal` called unconditionally at `user.controller.ts:108` | **Code wrong** |
| `journalEntry`, `location`, `photoAlbum`, `transportation`, `photo` | 10 | Mock `prisma` lacks `$transaction` (or never wires `.mockImplementation`), so the transactional delete body never runs | Test wrong |
| `restore.service` | 12 | `mockTx` lacks `savedLink` and `user.findUnique`, both added by already-merged features | Test wrong |
| `aviationstack.service` | 14 (whole suite never runs) | `jest.mock('../../config')` supplies only a `default` export; `logger.ts` uses a **named** import, so `config.nodeEnv` throws at load | Test wrong |
| `backup.controller` | 1 | Fixture predates the `integrity` HMAC field | Test wrong |
| `errorHandler` | 2 | Expects the old verbose Zod shape; code now returns the hardened `{fields, message}` form this document credits as correct | Test wrong |
| `routing.service` | 1 | Expects `routeCache.create`; code now uses `upsert` (an improvement) | Test wrong |
| `tag.service` | 2 | Stale sort expectation; unsequenced `findFirst` mock answers both calls | Test wrong |
| `userInvitation.controller` | 1 | `getEmailStatus` never stubs `userService.getEffectiveSmtpConfig` | Test wrong |

- **CORRECTION — two earlier hypotheses in this document were refuted by reproduction**:
  - The `should ... clean up entity links` failures do **not** corroborate an EntityLink cleanup gap. `deleteJournalEntry` (`:141`), `deleteLocation` (`:496`), `deleteAlbum` (`:397`), `deleteTransportation` (`:562`) and `deletePhoto` (`:932`) all correctly wrap `cleanupEntityLinks` and the row delete in a single `prisma.$transaction`. This is evidence the code is **right**. The separate open finding about *cascade-deleted child activities* is a distinct code path that none of these tests exercise at all.
  - The `RestoreService` failures do **not** corroborate the path-traversal finding — they throw on missing mock methods long before reaching any path-handling code. That vulnerability remains real by direct code reading, but is uncorroborated by these failures and untested in either direction.
- **Confidence**: Confirmed (each suite individually re-run and root-caused)
- **Suggested fix**: Fix the Immich handler (a real bug). For the rest, repair the mocks: add `$transaction: jest.fn(async (cb) => cb(mockPrisma))` to the four bare mocks; add `savedLink` and `user.findUnique` to restore's `mockTx`; make config mocks export both `default` and named `config`; sequence `tag.service`'s `findFirst` with `mockResolvedValueOnce`.

_(Count note: the RestoreService sub-count is 12, not the 13 recorded in an earlier revision of this file — 12 + 18 across the other suites = the confirmed total of 30.)_

### Test Coverage Gaps

> ✅ **All closed.** See [Test coverage](#test-coverage) in the Remediation Pass — 384 new tests across
> seven suites. Writing the `urlValidation` tests uncovered a live SSRF bypass, so one of these gaps
> was actively hiding a vulnerability.

_A passing suite is not coverage. `npx vitest run` reports a clean 375/375 while the modules behind two
High-priority findings above have no test file at all. Gaps below were confirmed by file-existence checks._

#### The modules behind two High-priority findings have no frontend tests

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: High
- **Component**: Frontend
- **Category**: Test coverage
- **Location**: No file exists at `frontend/src/store/authStore.test.ts`, `frontend/src/services/syncManager.test.ts`, or `frontend/src/services/offline.service.test.ts`
- **Issue**: `authStore.ts` owns the `logout()`/`clearAuth()` that fail to clear four caches (the shared-device data leak). `syncManager.ts` owns the conflict detection whose results nothing surfaces. `offline.service.ts` is the real queue engine. None is exercised by any test.
- **Impact**: Both corresponding findings could be fixed — or silently re-broken — with zero feedback from a suite that currently reports a deceptively clean 375/375.
- **Confidence**: Confirmed (absence verified by directory listing)
- **Suggested fix**: A single `logout()` test asserting all four clearing functions are invoked would catch the current bug and guard the fix.

#### The restore path-traversal defect is untestable in either direction

- **Reported**: 2026-07-25
- **Status**: Open
- **Priority**: High
- **Component**: Backend
- **Category**: Test coverage
- **Location**: `backend/src/services/__tests__/restore.service.test.ts` (14 cases, none adversarial)
- **Issue**: No test supplies a traversal string in any of the four restored path fields, and none asserts that a backup lacking an `integrity` signature is rejected. The `backup.controller` run confirms via captured log output that restore-without-verification is accepted with only a warning.
- **Impact**: The High-priority path-traversal finding is not merely unfixed — a contributor fixing it would have to write the regression test from scratch, with no existing harness for adversarial restore payloads.
- **Confidence**: Confirmed
- **Suggested fix**: Add a test asserting a `../`-containing `localPath` is rejected or contained, and one asserting a missing `integrity` field is refused once that hardening lands.

#### `share.service.ts` — the module recommended as the fix template — has zero coverage

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Medium | **Component**: Backend | **Category**: Test coverage
- **Location**: No file at `backend/src/services/__tests__/share.service.test.ts`
- **Issue**: This document credits `share.service.ts` as the strongest module reviewed and recommends copying its field-exclusion list (`:206-214`) and path containment (`:378-383`) to fix two open High findings. None of that logic is asserted by any test.
- **Impact**: Nothing would catch an edit that widens the exclusion list or loosens the path check — precisely the regression the two open findings warn about, in the module their fixes want replicated.
- **Confidence**: Confirmed | **Fix**: Assert the public payload omits cost/confirmation fields and that `getPublicPhotoFilePath` rejects a `../` path.

#### `csrf.ts` and `urlValidation.ts` have no dedicated tests

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Medium | **Component**: Backend | **Category**: Test coverage
- **Location**: `backend/src/security/__tests__/` does not exist; `middleware/__tests__/` holds only `auth.test.ts` and `errorHandler.test.ts`
- **Issue**: `validateUrlNotInternal` (`urlValidation.ts:213-262`) sits at the centre of both the confirmed Immich-LAN bug and the SSRF/DNS-rebinding finding, with no unit test isolating its private-IP/`.local`/resolution logic. `validateCsrf` (`csrf.ts:92-112`) and the exempt-path normalisation (`:75-90`) are likewise untested in isolation.
- **Impact**: The Immich bug was caught only incidentally by a controller test; the classification logic itself has no direct coverage.
- **Confidence**: Confirmed | **Fix**: Add `urlValidation.test.ts` and `csrf.test.ts`.

#### Timezone-sensitive tests run against the real system clock and cannot catch the documented bug

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Medium | **Component**: Backend | **Category**: Test integrity / flaky
- **Location**: `backend/src/services/__tests__/trip.service.test.ts:884-965`; `tripValidator.service.test.ts`; `travelDocument.service.test.ts` — no `jest.useFakeTimers()`/`setSystemTime` in any of the three (verified by grep)
- **Issue**: These cover exactly the code flagged for the UTC-vs-server-local midnight bug, but compute `today` from the unmocked system clock in whatever timezone the runner uses, never constructing the near-midnight case where local and UTC diverge.
- **Impact**: Two compounding problems — the documented timezone bug is invisible to the tests that nominally cover it, and results are nondeterministic across machines and CI runners with different default timezones.
- **Confidence**: Confirmed | **Fix**: Pin the clock with fake timers at a boundary instant, and run CI at least once with a non-UTC `TZ`.

#### AI and PDF-import pipelines are entirely untested

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Medium | **Component**: Backend | **Category**: Test coverage
- **Location**: No tests for `aiSuggestion.service.ts`, `pdfImport.service.ts`, `pdfParser.service.ts`, `llm.service.ts`, `journalEntryAi.service.ts`
- **Issue**: The unbounded LLM fan-out and the startup-only stale-job reset both live here. Separately, the `aviationstack` suite's 14 cases — covering cache freshness, 401 handling and quota exhaustion — never execute, so the dead-code quota-detection finding is unverifiable by test.
- **Impact**: Both fixes, once made, have nowhere to be verified; prompt-injection sanitisation is guarded only by code reading.
- **Confidence**: Confirmed | **Fix**: At minimum assert `suggestLlmLinks` caps its `llmService.chat()` calls, and repair the `aviationstack` config mock.

#### `tokenBlacklist` interval is not `unref()`'d and hangs isolated test runs

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Backend | **Category**: Test integrity
- **Location**: `backend/src/services/tokenBlacklist.service.ts:215`; reached via `middleware/auth.ts:6` → `user.service.ts:7` → any controller importing `user.service`
- **Issue**: `setInterval(cleanupExpired, CLEANUP_INTERVAL)` has no `.unref()`, so the timer holds the Node process open. Running `userInvitation.controller.test.ts` alone did not exit within 150s; `--detectOpenHandles` identifies exactly this timer, and `--forceExit` resolves it.
- **Impact**: Not a runtime defect (the full suite completes), but single-file debugging of any suite transitively importing `user.service` is unreliable without knowing to pass `--forceExit`.
- **Confidence**: Confirmed (reproduced with `--detectOpenHandles`) | **Fix**: Call `.unref()` on the interval handle.

### API Contract, Duplication, and Documentation

_From an end-to-end comparison of backend route → Zod schema → service return shape against frontend
service → TypeScript type → component, across 19 features. A recurring theme: several UI surfaces read
fields the backend stopped returning when linking moved to the `EntityLink` system, and the types on both
sides faithfully mirror the drift, so the compiler cannot see it._

#### `Photo.location` is read by four components but the backend has no such field

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Medium | **Component**: Both | **Category**: API contract
- **Location**: Type `frontend/src/types/photo.ts:31-34`; readers `PhotoGallery.tsx:261-265,1182-1200`, `PhotoLightbox.tsx:472-495`, `PhotoDetailsPanel.tsx:206-212`; backend `schema.prisma:318-348`, `photo.types.ts:24-39`
- **Issue**: The frontend `Photo` declares `location?: { id, name } | null`. The Prisma model has no such relation — its only relations are `trip`, `tripCoverPhoto`, `tripBannerPhoto`, `albumCoverPhoto`, `albumAssignments`. Photo→Location moved to `EntityLink`, and no read path selects or synthesises a `location` key. The backend's own `Photo` interface correctly omits it.
- **Impact**: Four pieces of UI are permanently dead — the gallery tile location pill, the lightbox location line, and the "Linked Location" row in the details panel. A user who links a photo to a location sees nothing, with no error explaining why.
- **Confidence**: Confirmed | **Fix**: Remove the field and the four render sites, or resolve it via EntityLink — `usePhotoLocations` already does this for `PhotosMapView.tsx:205`.

#### Every tag renders a literal `( trips)` — the backend returns `_count.assignments`

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Medium | **Component**: Both | **Category**: API contract
- **Location**: `backend/src/services/tag.service.ts:22-32`; type `frontend/src/types/tag.ts:9-11`; render `TagManager.tsx:348-353`
- **Issue**: `getTagsByUser` returns `_count: { assignments: n }`; the frontend type declares `_count?: { trips: number }`. The render guard passes because the `_count` object exists, but `.trips` is `undefined` — React renders nothing for it and the plural ternary falls through to "trips".
- **Impact**: The per-tag usage count is never displayed; every tag shows an empty parenthetical. (`getTagById` at `:35-58` returns full `assignments` rows instead, so there is no single consistent shape today.)
- **Confidence**: Confirmed | **Fix**: Rename the frontend field to `assignments`, or alias it in the service.

#### Timeline's journal "standalone" filter is a permanent no-op, so linked entries render twice

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Medium | **Component**: Both | **Category**: API contract
- **Location**: `frontend/src/components/Timeline.tsx:639-641,656`; type `frontend/src/types/journalEntry.ts:34-37`; tables dropped by `backend/prisma/migrations/20260118_remove_old_journal_linkage_tables/migration.sql`
- **Issue**: The Timeline decides whether a journal entry is standalone by checking `activityAssignments`/`lodgingAssignments`/`transportationAssignments`, and reads its label from `locationAssignments?.[0]?.location?.name`. Those tables were dropped in the 2026-01-18 migration; the service includes none of them. The frontend type comment at `:14-18` even says "Currently these are not populated by the backend".
- **Impact**: The three `has*Links` flags are always `false`, so every dated journal entry renders as standalone — including entries linked to an activity via EntityLink, which then appear **twice** on the timeline (once as the activity, once as a separate journal card).
- **Confidence**: Confirmed | **Fix**: Use an EntityLink lookup (the trip link-summary endpoint already returns this), or drop the filter and the four dead type fields.

#### A cost of exactly `0` is stored as NULL on lodging and transportation, but not on activities

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Medium | **Component**: Backend | **Category**: Duplication
- **Location**: `lodging.service.ts:30` and `transportation.service.ts:148` (`cost: data.cost || null`); correct copy at `activity.service.ts:36` (`cost: data.cost !== undefined ? data.cost : null`)
- **Issue**: Three create paths write the same concept; two use falsy-coalescing. `0` is a legitimate cost (a free walking tour, a comped night, a lift from a friend), and both schemas accept `z.number().min(0)`, so `0` passes validation and is then converted to `null`.
- **Impact**: A zero-cost stay or leg comes back empty. More consequentially, the budget summary (`expense.service.ts:357-379`) cannot distinguish "recorded as free" from "not recorded", so the costed-item count in `BudgetConversionInfo` is wrong.
- **Confidence**: Confirmed | **Fix**: Use the `!== undefined` form in both. (The same `||` idiom on adjacent string fields merely maps `''`→`null` and is harmless.)

#### Four local `formatDate` copies reintroduce the UTC day-shift the shared helpers exist to prevent

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Medium | **Component**: Frontend | **Category**: Duplication
- **Location**: Broken — `JournalManager.tsx:285-292`, `AssociatedJournalEntries.tsx:27-35`, `TripSeriesPage.tsx:13-23`, `EntityDetailModal.tsx:48-60`. Correct — `utils/dateFormat.ts:32-81`, `utils/timezone.ts:399-411`, `PublicTripPage.tsx:23-33`
- **Issue**: Trip and journal dates are stored as UTC midnight (`tripDateTransformer`). Three shared helpers exist specifically to render them correctly, and the intent is documented at `Timeline.tsx:645-648` and covered by `utils/timezone.test.ts:10-30`. The four copies call bare `new Date(dateString).toLocaleDateString(...)`. Their call sites feed exactly the affected values (`TripSeriesPage.tsx:383-384`, `JournalManager.tsx:478`, `AssociatedJournalEntries.tsx:60`).
- **Impact**: For any viewer west of UTC — all of the Americas — a trip starting `2025-01-15` renders as **Jan 14** in the series list, and journal entries show the previous day, while the same dates render correctly on the timeline, day view and public share page. The inconsistency within one app is more confusing than a uniform offset.
- **Confidence**: Confirmed (mechanism and call sites verified; exact rendering depends on viewer timezone) | **Fix**: Use `formatDate` from `utils/dateFormat.ts`; consider an ESLint rule banning bare `toLocaleDateString` outside `utils/`.

#### Only one of six currency formatters guards against an invalid currency code

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Medium | **Component**: Frontend | **Category**: Duplication
- **Location**: Guarded — `BudgetManager.tsx:100-114`. Unguarded — `trip-dashboard/BudgetSummaryWidget.tsx:213-221`, `EntityDetailModal.tsx:86-92`, `daily-view/utils.ts:52-60`, `daily-view/PrintableDayItinerary.tsx:49`, `timeline/PrintableItinerary.tsx:69`
- **Issue**: `BudgetManager` wraps its formatter in try/catch with the comment "Invalid/unknown currency code — fall back to a plain number", so the hazard is known. The other five construct `Intl.NumberFormat` with a caller-supplied code and no guard. Backend validation is `z.string().length(3)` — three characters of *anything*, not an ISO-4217 check — so a stored `"$$$"` makes the constructor throw a `RangeError`.
- **Impact**: `BudgetSummaryWidget` is worst: the constructor runs in the `useMemo` **body**, so the throw happens during render and takes down the trip dashboard rather than one number. Two copies also hardcode `'en-US'` while four use the viewer's locale, so the same amount formats differently on the print view than in the budget panel.
- **Confidence**: Confirmed (divergence and reachability); Likely (no end-to-end crash reproduced) | **Fix**: Extract one `formatCurrency` helper carrying the try/catch, and tighten `optionalCurrencyCode()` to `/^[A-Za-z]{3}$/`.

#### Lodging `bookingUrl` validates to 1000 characters against a `VarChar(500)` column

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Medium | **Component**: Backend | **Category**: Schema drift
- **Location**: `backend/src/types/lodging.types.ts:76,92` vs `schema.prisma:478`; correct pairing on activities at `activity.types.ts:28,47`
- **Issue**: The Zod ceiling is twice the column width. A 501-1000 character booking URL — very achievable for Booking.com or Expedia deep links with tracking parameters — passes validation and then hits `value too long for type character varying(500)`.
- **Impact**: Surfaces as a bare 500 rather than a 400 naming the field, since `errorHandler` translates only `P2002`/`P2003`/`P2025`. Same class as the `Activity.cost` drift above.
- **Confidence**: Confirmed | **Fix**: Change both limits to 500, or widen the column.

#### `docs/api/README.md` documents search parameters that do not exist

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Medium | **Component**: Documentation | **Category**: Documentation
- **Location**: `docs/api/README.md:286-291`, example at `:583`; actual schema `backend/src/types/search.types.ts:3-7`
- **Issue**: Four errors: documented `types` (plural, comma-separated) vs actual `type` (singular `z.enum`, one value only); documented values are all plural and therefore invalid, and `activities`/`lodging`/`albums` are not searchable at all; documented `tripId` has no key in the schema and is stripped; documented `limit` default of 10 is actually 20.
- **Impact**: The copy-pasteable example `GET /api/search?q=tokyo&types=trips,locations&limit=20` returns a 400.
- **Confidence**: Confirmed | **Fix**: Rewrite the block from `globalSearchQuerySchema`.

#### API reference omits six route groups, including the entire expenses/budget feature

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Medium | **Component**: Documentation | **Category**: Documentation
- **Location**: `docs/api/README.md`; mounts at `backend/src/index.ts:284-289,302-307`
- **Issue**: Grepping the reference for `expenses`, `memories`, `push`, `public`, `calendar` and `airports` returns nothing. Expenses/budget is a complete user-facing feature with 6 endpoints, and `/api/public` is the only unauthenticated data-serving route in the app.
- **Impact**: The document claims to describe the API "for all application functionality" while omitting roughly a fifth of it — including the surface most in need of documentation.
- **Confidence**: Confirmed | **Fix**: Add the six sections, or state which mount points the document covers.

#### `IMPLEMENTATION_STATUS.md` marks the PWA/offline feature set as shipped when none of it is mounted

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Medium | **Component**: Documentation | **Category**: Documentation
- **Location**: `docs/development/IMPLEMENTATION_STATUS.md:365-375,505-507`
- **Issue**: The section marks nine items `[x]` and names their components; line 507 states "Offline support ✅ … sync conflicts UI". Verified by independent grep that all fourteen named components are referenced only from `components/pwa/index.ts` (a barrel nothing imports) and from each other.
- **Impact**: The status document reports a shipped feature no user can reach — the documentation counterpart of the High-priority unwired-PWA finding. This is the file a planner consults.
- **Confidence**: Confirmed (independently verified, not inherited from the other report) | **Fix**: Move the section under a "Built but not wired up" heading.

#### Lower-severity contract and consistency findings

- **Reported**: 2026-07-25 | **Status**: Open | **Priority**: Low | **Component**: Both | **Category**: API contract / Consistency

| Finding | Location | Effect |
| ------- | -------- | ------ |
| `sortBy=location` is accepted but silently sorts by date | `photo.types.ts:154-159`, `photo.service.ts:204-207` | 200 with unrequested ordering; same root cause as `Photo.location` |
| Journal date is `entryDate` on input, `date` on output | `journalEntry.types.ts:11,26,33` | Round-trip `update(entry.date)` is a silent no-op |
| `photoAlbums` declared on Activity/Location/Lodging, never returned | `types/activity.ts:38-54`, `location.ts:41`, `lodging.ts:31-38` | Dead type surface inviting another dead-UI bug |
| `createTripSchema` accepts `seriesId`; `createTrip` never writes it | `trip.types.ts:79` vs `trip.service.ts:32-47` | 201 with `seriesId: null`; latent, no caller sends it |
| `CreateTripInput.archived` is stripped by Zod | `types/trip.ts:88` vs `trip.types.ts:58-82` | Silent no-op |
| `TripResponse`/`TripListResponse` are dead and stale | `trip.types.ts:132-164` | The file that looks like the contract is not the contract |
| `getTrips` params type omits `startDateFrom`/`startDateTo`/`tags` | `services/trip.service.ts:10-22`, `TripsPage.tsx:101-121` | Works by accident; `Object.fromEntries` erases the type so renames won't be caught |
| `enhanceTransportations` branches on `'bike'`/`'walking'`, not in the enum | `transportation.service.ts:268,274-276` | Unreachable code implying two type values exist |
| Transportation renames six fields across DB/API/UI | `transportation.service.ts:74-117,134-151,392-407` | Three hand-maintained mappings; `seatNumber`, `bookingUrl`, `status`, `delayMinutes`, `actualStart`, `actualEnd` are already silently unreachable through the API |
| `trip-series` search hits reach a UI switch with no case | `search.service.ts:129,147,150` vs `frontend/src/services/search.service.ts:5`, `GlobalSearch.tsx:158-204` | Empty icon tile; invisible to the compiler because the two `SearchResult` types diverged |
| `UpdateTravelDocumentInput` advertises three nullable fields the backend 400s on | `types/travelDocument.ts:60,64,67` vs `travelDocument.types.ts:56,60,64` | No active bug; invites the `documentNumber` failure class |
| Six specific API-reference claims are wrong | `docs/api/README.md:5,43,293,94-106,555,574` | Version says v5.4.0 (actual 5.6.0); CSRF exemption list wrong; no `/api/collaboration` prefix exists; five trip routes missing; no endpoint returns 204; trip listing described as unpaginated when it is paginated |
| Stale version and model counts | `IMPLEMENTATION_STATUS.md:3-4`; `CLAUDE.md` Architecture section | Status says v5.4.1; CLAUDE.md says 32 models, `schema.prisma` has 37 and `DATABASE_SCHEMA.md:5` correctly says 37 — the two docs disagree |

---

## Build, Test, and Type Safety Status

> ⚠️ **Historical — this is the state as REVIEWED, before remediation.** For current numbers see
> [Verification](#verification) in the Remediation Pass. Kept as the before-picture; notably the
> backend suite has since gone from 30 failures to zero.

Measured directly on 2026-07-25. Commands are recorded because results differ by invocation — `tsc -b` is
incremental and will report **zero errors on a cached second run**, so any future check must use `--force`.

| Check | Command | Result |
| ----- | ------- | ------ |
| Backend tests | `npx jest` (in `backend/`) | **1522 pass, 30 fail, 1552 total; 13/78 suites failing** |
| Frontend tests | `npx vitest run` (in `frontend/`) | **375 pass, 0 fail, 20 files** |
| Backend strict types | `npx tsc -p tsconfig.json --noEmit` | **0 errors** |
| Frontend strict types | `npx tsc -b --force` | **0 errors** |
| Frontend prod types | `npx tsc -b tsconfig.prod.json --force` | **0 errors** |
| `: any` annotations | grep `src/` | **frontend 0, backend 4** |
| `@ts-ignore` / `@ts-expect-error` | grep both `src/` | **5 total** |
| `TODO`/`FIXME`/`HACK` markers | grep both `src/` | **5 total** |

Notes on the build configuration:

- `frontend` `build` is `(tsc -b tsconfig.prod.json || echo 'TypeScript warnings ignored') && vite build` —
  the `||` swallows any type error and the build proceeds. `backend` `build` uses the relaxed
  `tsconfig.prod.json` while `build:strict` is plain `tsc`. Both are as documented in CLAUDE.md.
- **The risk this creates is currently latent, not active**: both projects type-check clean today, so
  nothing is being hidden right now. The exposure is that a future type error will not fail the build.
- Type-safety hygiene is genuinely good — zero `any` in the frontend, four in the backend, five
  suppression comments across ~195k lines.

---

## Notes: Verified Correct

### An irreducible type assertion

`_shared/prismaUpdateData.ts` contains exactly one type assertion:
`return updateData as Partial<TransformedUpdateData<T, TR>>`. It is a documented implementation
constraint, not an open defect.

The function started with **four** assertions. Three were removed with no cast at all, each fix
exposing the next real obstacle:

- an `isDefined` type predicate — `!== undefined` narrows a generic indexed access to an
  intersection TypeScript will not accept where `Exclude<T[K], undefined>` is expected;
- a `UpdateTransformers<T>`-typed local — indexing the generic `TR` directly widened the key to
  `string`, losing the per-key parameter type;
- a `T[K] | undefined` local — `Partial<T>[K]` is identical once `undefined` is excluded, but
  TypeScript will not prove that for a generic `T`.

A fourth, in the now-deleted `@deprecated` `buildUpdateData`, went away with the dead code.

The last one cannot be removed soundly. The result object is built key-by-key in a `for…in` loop,
and TypeScript cannot relate a dynamically-keyed object to a mapped type whose value types depend on
transformer return types — the same limitation that makes `Object.fromEntries` return
`{ [k: string]: T }`. The alternatives are all worse:

- **Return `unknown` and let callers narrow** — does not remove the cast, it multiplies it across
  every call site. This is the exact trade made in reverse for `getEntityDelegate`, where
  consolidating seven scattered `as any` casts into one exhaustively-checked resolver was the win.
- **Launder it through `Object.assign`** — compiles without an `as`, but bypasses the same check
  rather than proving it. That hides the gap instead of marking it, which is strictly less honest
  code.

The assertion is narrow, is the single place the gap is bridged, and carries a comment saying so.

Recorded so these are not "fixed" into regressions by a later change:

- **`share.service.ts` is the strongest module reviewed** — builds its public payload field-by-field with an explicit exclusion list (`:206-214`), confines photo paths under the uploads root with `path.resolve` (`:378-383`), and validates the 64-hex token shape before querying. It is the correct template for both the `/uploads` and file-deletion fixes above.
- **`errorHandler.ts`** leaks no stack traces, reduces Zod errors to field names, redacts sensitive keys from logs, and collapses unknown errors to a generic 500.
- **Access and refresh tokens use separate secrets** and pin `algorithms: ['HS256']` on verify (`auth/jwt.ts:18,22`), closing both algorithm confusion and cross-token-type substitution.
- **OIDC state cookie** correctly overrides `SameSite=lax` with a narrow path, PKCE S256 is always used, and `safeRedirectPath` blocks open redirects including protocol-relative `//`.
- **`passwordLoginDisabled` is gated on `oidc.enabled`** specifically to prevent total lockout (`config/index.ts:131-136`).
- **All 34 routers apply `authenticate` via `router.use(...)` before any route registration** — no case was found of middleware registered after a route. The authorization failures above are concentrated in the handful of places that bypass the shared permission helpers.
- **The axios response interceptor and 401-refresh race protection are correctly implemented** (`frontend/src/lib/axios.ts`), and all ~40 frontend services correctly consume the unwrapped payload — no envelope-typing violations found.
- **SSRF defences in `linkMetadata.service.ts` and `emailLinkExtractor.service.ts` are thorough** — manual redirect re-validation, byte caps, tracking-param stripping.
- **Prompt-injection handling is consistent across all LLM call sites** — sanitisation, delimiters and length caps in `llm.service.ts`, `aiSuggestion.service.ts`, `journalEntryAi.service.ts`, `pdfParser.service.ts`.
- **`routing.service.ts`** has a proper timeout and a graceful Haversine fallback.
- **No secrets are committed**; the only hardcoded credentials are test fixtures in `backend/src/__tests__/setup.ts`.
- **No migration adds a `NOT NULL` column without a `DEFAULT`** (checked systematically across all 51 migrations).
- **Direct-delete EntityLink cleanup is correctly transactional.** `deleteJournalEntry` (`journalEntry.service.ts:141`), `deleteLocation` (`location.service.ts:496`), `deleteAlbum` (`photoAlbum.service.ts:397`), `deleteTransportation` (`transportation.service.ts:562`) and `deletePhoto` (`photo.service.ts:932`) each wrap `cleanupEntityLinks` and the row delete in one `prisma.$transaction`. Established by reproducing the failing tests — the red suites are mock gaps, not a code defect. (The open cascade-deleted-children finding is a different code path.)
- **`routing.service` uses `upsert` for its route cache** (`routing.service.ts:392`) rather than check-then-act — the same race-free pattern recommended for the open `WeatherData` finding.
- **No skipped or tautological tests.** No `it.skip`/`it.todo`/`xit`/`xdescribe` anywhere in either project, and the common "propagates service errors via next" controller pattern asserts the specific error object rather than bare presence.
- **The `_shared/` access helpers and `middleware/auth.ts` do have test files** — they are not coverage gaps (assertion quality not deep-audited).

---

## Review Coverage and Gaps

### Caveat: the working tree changed during this review

The repository was **being actively edited while the review ran**. At the start of the session `git status`
showed one modified file (`docs/development/FEATURE_BACKLOG.md`); by the end it showed ~18 modified files
plus two new untracked ones (`frontend/src/components/daily-view/DayItem.ts`,
`frontend/src/components/widgets/YearInReviewWidget.tsx`), with modification timestamps inside the review window.

Consequences to be aware of when acting on this document:

- **Line numbers may have drifted** in the files touched mid-review: `savedLink` (controller, routes, service,
  types, tests, frontend service/types), `BulkActionBar.tsx`, `Navbar.tsx`, `SavedLinksManager.tsx`,
  `SavedLinksInboxPage.tsx`, `DashboardPage.tsx`, `daily-view/DailyView.tsx`,
  `daily-view/PrintableDayItinerary.tsx`, and `docs/api/README.md`. Verify the cited line before editing.
- **One candidate finding was discarded as a false positive because of this.** A type-check partway through
  the review reported ~24 errors in `SavedLinksInboxPage.tsx` (undefined `selectedIds`, `selectedCount`,
  `toggleSelectAll`, …). A clean forced re-check afterwards reported zero. That was a transient mid-refactor
  state, not a defect, and it is deliberately **not** listed above.
- The test and type-check numbers in the section above are a snapshot of that moving target. Re-run them
  before treating any single number as a baseline.

### Scope completion

All ten review areas completed. Three were initially interrupted by upstream API overload (HTTP 529); their
mechanical parts were re-run directly and the analytical parts were then completed in a second pass.

| Scope | Status |
| ----- | ------ |
| Auth & security | Complete |
| Authorization & IDOR | Complete — all 34 routers enumerated |
| Domain services | Complete |
| Integrations & file handling | Complete |
| Database & migrations | Complete — all 51 migrations |
| Frontend state & offline | Complete |
| Frontend components | Complete for managers/modals/maps; see gaps below |
| Release, CI & dependencies | Complete — all 9 scripts, both CI workflows, both audits |
| Tests | Complete — all 13 failing suites individually root-caused |
| Architecture & API contracts | Complete for 19 features; see gaps below |

**Residual gaps within otherwise-complete scopes:**

- **Contracts not compared field-by-field**: backup/restore (the largest schema in the repo), Immich, PDF
  import, flight tracking, packing suggestions, language phrases, memories, push, calendar feed, public share.
- **Duplication categories not enumerated**: ownership checks (centralised in `serviceHelpers`, with known
  bypasses already listed above), pagination, and error mapping. Date and currency duplication *was* covered,
  but the sweep stopped at the `formatDate`/`formatCurrency` call sites — the `formatDateTime`/`formatTime`
  variants in `ActivityManager.tsx:439`, `TransportationManager.tsx:914`, `PhotoDetailsPanel.tsx:107` and
  `timeline/utils.ts:172` were not each diffed against `utils/timezone.ts`.
- **Docs not verified line-by-line**: `BACKEND_ARCHITECTURE.md` (1947 lines) and `FRONTEND_ARCHITECTURE.md`
  (1612 lines) were spot-checked only; `STYLE_GUIDE.md` and `BACKEND_OPTIMIZATION_PLAN.md` not reviewed.
- **No systematic per-endpoint HTTP status-code audit** — only the classes surfaced above (opaque 500s from
  untranslated Prisma errors) were checked.
- **Frontend Vitest suite not audited for weak assertions**; the ~1500 backend `it()` blocks were not
  exhaustively checked for tautological assertions beyond the cited cases.

### Two claims verified and discarded

Recorded so they are not "rediscovered" later:

- A grep suggested ~10 services were handling HTTP `Request`/`Response` objects, which would be a layering
  violation. **No service imports from `express`** — those were axios type references.
- A dependency report stated no `axios` dependency exists. It is present in **both** packages at `^1.13.5`.

The only confirmed layering violation is `backend/src/controllers/immich.controller.ts:24`, which queries
Prisma directly rather than going through a service. `backend/src/utils/` correctly does not exist, per CLAUDE.md.

### Areas not examined

Absence from the findings above is **not** evidence of correctness. These areas were explicitly not reached:

| Area | Status |
| ---- | ------ |
| `ImmichBrowser.tsx` (6 effects), `PdfReviewModal.tsx`, `TimelineEditModal.tsx` | Not reviewed — large and stateful; flagged as the highest-value follow-up given the patterns found elsewhere |
| `components/timeline/*`, `components/daily-view/*`, `components/trip-dashboard/*`, `components/widgets/*` | Not reviewed line-by-line |
| Most pages other than `TripDetailPage` | Spot-checked only |
| `JournalManager`, `SavedLinksManager`, `BudgetManager`, `SouvenirManager` | Spot-checked, no defects surfaced |
| Unauthenticated `/api/calendar` iCal feed route | Not reviewed |
| Controllers other than trip/transportation/entityLink | Spot-checked against their services, not read line-by-line |
| `useStorageEstimate`, `usePagination`, `usePagedPagination` | Consumers checked, logic not read line-by-line |

## Remediation Pass (2026-07-26)

A follow-up pass worked through the findings above using parallel agents partitioned by file
ownership (so no two could edit the same file). Below is what changed, by area.

### ⚠️ Operational step required before the next deploy

A baseline migration (`00000000000000_init`) was added, because the migration history had none and
`prisma migrate deploy` could not provision a fresh database. **On every existing database
(production and development), run this once, from `backend/` with that database's `DATABASE_URL`:**

```bash
npx prisma migrate resolve --applied 00000000000000_init
```

This writes a single bookkeeping row into `_prisma_migrations`; it runs no SQL against your tables.
Skipping it is not destructive — the baseline begins with a guard that raises and aborts if `users`
already exists — but the deploy will fail and none of the four new migrations will apply until you
run it. Full detail in `backend/prisma/migrations/README.md`.

Two other manual follow-ups:

- If `trip_expenses` contains pre-existing negative amounts, the new CHECK stays `NOT VALID`. Find
  them with `SELECT id, trip_id, description, amount FROM trip_expenses WHERE amount < 0;`, correct
  them, then `ALTER TABLE trip_expenses VALIDATE CONSTRAINT trip_expenses_amount_non_negative;`.
- CI now runs `npm run build:strict`. Frontend strict is **blocking**; backend strict and the backend
  test step are `continue-on-error` with TODOs to flip them once their baselines are confirmed green.

### Security and access control

- **`/uploads` is now authorized, not merely authenticated.** Requests resolve to the owning DB row
  (photo, cover image, companion avatar, PDF import) and are checked against trip ownership or
  collaborator access, with positive-only caching. Companion avatars now use UUID filenames, so no
  upload path is enumerable.
- **Arbitrary file deletion closed at both layers.** Backup restore validates stored paths against an
  anchored `/uploads/<subdir>/<filename>` pattern, and every unlink site resolves the path and
  refuses anything outside the uploads root. The backup HMAC is now mandatory, with an explicit
  `ALLOW_UNSIGNED_BACKUP_RESTORE` escape hatch rather than a silent skip.
- **Refresh tokens are single-use.** The consumed token is blacklisted on rotation, and a replayed
  token is treated as theft — it invalidates the whole family via `passwordVersion`. The controller
  no longer short-circuits revoked tokens, so the detection actually runs.
- **OIDC ID tokens are verified against the provider's JWKS** (RS256, with `exp`), not `jwt.decode`d.
  Achieved without adding a dependency by round-tripping the JWK through `crypto.createPublicKey`.
  Non-HTTPS issuers are rejected unless explicitly opted into.
- **Privilege escalation removed**: travel partnerships no longer write to another user's row, and an
  admin collaborator can no longer grant `admin` by invitation.
- **`privacyLevel: 'Public'` no longer grants blanket access**, so costs, confirmation numbers and
  booking references are no longer readable by every registered account.
- Also: signed (session-bound) CSRF tokens, JWT secret strength enforced at boot, generic
  registration errors, exact-match email search, SMTP host/port validation, bcrypt cost 12,
  hashed blacklist entries, Swagger disabled in production.

#### New defect found *during* remediation — IPv4-mapped IPv6 SSRF bypass (fixed)

Not part of the original review. Found while writing the `urlValidation` tests that the review
identified as missing — i.e. the coverage gap was itself hiding a live vulnerability.

- **Location**: `backend/src/security/urlValidation.ts`, `isPrivateIPv6`
- **Issue**: `http://[::ffff:127.0.0.1]/` and `http://[::ffff:192.168.1.1]/` were **accepted** by the
  SSRF guard. The dotted-form check `/^::ffff:(\d+\.\d+\.\d+\.\d+)$/` never matched, because the
  WHATWG `URL` parser rewrites the hostname to hex before this module sees it
  (`::ffff:127.0.0.1` → `::ffff:7f00:1`). It then fell through to the prefix checks, whose first
  word is `0x0000` — matching neither `fc00::/7` nor `fe80::/10` — and was treated as public.
- **Impact**: a live loopback / RFC1918 / cloud-metadata SSRF bypass, in the same function as two
  already-documented findings, reachable through every user-supplied URL that guard protects.
- **Fix**: judge IPv4-mapped (`::ffff:0:0/96`) and IPv4-compatible (`::/96`) addresses by their
  embedded IPv4 address, detected on the **expanded** form rather than the literal text.
- **Verified**: `::ffff:127.0.0.1`, `::ffff:192.168.1.1`, `::ffff:10.0.0.5`,
  `::ffff:169.254.169.254`, `::1`, `::127.0.0.1`, `fd00::1`, `fe80::1` all blocked;
  `::ffff:8.8.8.8` still allowed (the fix does not over-block legitimate mapped addresses).

Worth recording *how* this surfaced: the agent writing the tests found the bypass and deliberately
**did not** encode the buggy behaviour as a passing test — it removed those cases from the reject
list and reported them instead. A less careful pass would have locked the vulnerability in as
"expected behaviour", which is the failure mode that makes retrofitted tests actively harmful.

#### Refresh tokens were not unique per issuance — a regression introduced by this pass (fixed)

Found by the test repair, not by the review. This one was **caused by** the single-use refresh-token
fix above, and is the clearest argument for why the suite had to be made green rather than declared
good enough.

- **Location**: `backend/src/auth/jwt.ts` (`generateRefreshToken`), interacting with
  `backend/src/services/auth.service.ts` (`refreshToken`)
- **Issue**: the refresh payload was `{id, userId, email, passwordVersion}` with no `jti` or nonce,
  and JWT `iat`/`exp` have one-second resolution — so two refresh tokens minted for the same user
  within the same wall-clock second were **byte-identical**. Harmless while tokens were reusable;
  actively dangerous once they became single-use, because `refreshToken()` blacklists the consumed
  token *after* minting its replacement. On a collision it revoked the token it had just returned.
- **Impact**: the client's next refresh would present a token that is already blacklisted, which the
  new reuse detection classifies as **theft** — bumping `passwordVersion` and logging the user out
  of every session. A self-inflicted mass logout, triggered by nothing more than two refreshes
  landing in the same second.
- **Fix**: `generateRefreshToken` now includes `jti: randomUUID()`.
- **Verified**: two tokens minted back-to-back are distinct, carry distinct `jti`, and both verify.
- **How it was caught**: tests asserting `result.refreshToken !== oldToken` failed with the two
  values equal. The agent did not paper over it by loosening the assertion — it drove `Date.now`
  forward so the test exercised genuine rotation, and reported the collision as a real bug.

#### Test suite was writing the real token blacklist to disk (fixed)

- **Location**: `backend/src/services/tokenBlacklist.service.ts`
- **Issue**: `persistBlacklist()`/`loadBlacklist()` read and wrote `data/token-blacklist.json`
  during test runs. Tests revoke tokens constantly, so the suite left real revocation entries on
  disk, which the next `npm run dev` would load — and state leaked between test runs.
- **Fix**: both functions short-circuit when `NODE_ENV === 'test'`. Note this deliberately uses
  `process.env.NODE_ENV` rather than the `config` object: importing `config` here pulls in
  `DATABASE_URL` validation, which broke the suite at import time.
- **Verified**: the file is not recreated by a full `npx jest` run.

#### Still open, lower severity — TOCTOU race in refresh-token reuse detection

`auth.service.ts`'s `refreshToken()` checks `isBlacklisted(token)` and later calls
`blacklistToken(token)`, with no lock between them. Two concurrent refreshes presenting the *same*
token can both pass the check and both succeed, which contradicts the "loser is rejected" comment at
the call site. Not exploitable for privilege gain — both callers already hold the token — but the
reuse detection is best-effort under concurrency rather than guaranteed. A proper fix needs an
atomic compare-and-set (a DB row or Redis `SET NX`), which is the same change the file's own header
comment already recommends for multi-server deployments.

### Correctness

- Travel document numbers are no longer erased when editing any other field (an explicit "clear"
  checkbox now exists for the intentional case).
- `DOCUMENTS` validation issues can be dismissed — and the enum is now derived from the service's
  own type, so it cannot drift again.
- Day-boundary math uses UTC everywhere it compares against UTC-midnight-stored dates, so trip status
  and passport expiry no longer shift with the server's timezone.
- Deleting a parent activity now cleans up EntityLinks for all cascade-deleted descendants.
- `duplicateTrip` consumes matches when remapping IDs, so rows with identical composite keys no
  longer collapse onto one another.
- Self-hosted Immich LAN URLs can be saved again.
- A cost of exactly `0` is stored as `0`, not `NULL`.
- Dead UI removed or wired up: `Photo.location` (removed — the lightbox already showed the real
  EntityLink data), `Tag._count` (corrected), and the Timeline's journal filter now uses EntityLink
  data so linked entries no longer render twice.
- Frontend: the `TagManager` infinite re-fetch loop, shift-click selecting the wrong rows for bulk
  delete, and non-reference-counted modal scroll locks are all fixed (via a shared `modalStack`
  utility now also used by `PhotoLightbox`).
- Logout clears every cache — query persister, offline IndexedDB, sync queue, offline session and
  Cache Storage — closing the shared-device leak.
- The offline/PWA layer is wired up: `OfflineIndicator` and the conflict-resolution path are mounted,
  and the `localStorage` shadow sync-state system was deleted in favour of the real IndexedDB queue.

### Data layer

- Baseline migration created (see the operational step above); `WeatherData` gained a
  `@@unique([tripId, date])` with a de-duplicating migration, and both the weather service and backup
  restore now `upsert` instead of check-then-act; `TripExpense` gained a `(tripId, date)` index and a
  non-negative CHECK; PostGIS coordinates are backfilled. Every migration is idempotent and
  safe against a populated database.

### Release, CI and documentation

- `release.ps1`'s build gate actually fails now; `release.sh` and `build.sh` work at all;
  `CHANGELOG.md` exists so the release workflow stops failing on every tag; CI is the single image
  publisher; compose files pin `${APP_VERSION}` instead of `:latest`; the dangerous `fix-migration`
  scripts were deleted; AI-tooling artifacts untracked.
- The API reference was corrected against the code (search params, six missing route groups,
  CSRF exemptions, pagination, status codes) and `IMPLEMENTATION_STATUS.md` no longer claims the
  unmounted PWA components are shipped.

### Dependencies

| Package | From | To | Advisory | Result |
| ------- | ---- | -- | -------- | ------ |
| `nodemailer` | 8.0.11 | **9.0.3** | GHSA-p6gq-j5cr-w38f — `raw` option bypasses `disableFileAccess`/`disableUrlAccess` | **Cleared.** Zero call sites changed: the only breaking change in 9.0.0 is TLS-cert validation when fetching remote content (attachment URLs, OAuth2, proxy CONNECT), and `email.service.ts` uses none of it. Also deduped the tree, since `imapflow`/`mailparser` already wanted 9.0.3. |
| `sharp` | 0.33.5 | **0.35.3** | GHSA-f88m-g3jw-g9cj — libvips CVEs | **Cleared** (libvips 8.18.3). Zero call sites changed: all four usages stick to `rotate/resize/jpeg/toFile`, untouched by the 0.34/0.35 breaks. |
| `vite-plugin-pwa` | dependency | **devDependency** | — | Was in `dependencies` despite being a build-time plugin, dragging `sharp` into the **production** tree. Moved; `vite build` verified still working. |

The `sharp` upgrade needed care beyond the version bump: **`sharp` is `jest.mock`'d in all three
test files, so a green suite proves nothing about the native binary.** It was verified separately by
running the app's three real pipelines (avatar 256×256 cover-fit, thumbnail 400px inside-fit,
TIFF→JPEG re-encode) against the actual binary and asserting output dimensions. The lockfile was
also checked to confirm `@img/sharp-linuxmusl-x64` resolves, so the `node:20-alpine` Docker build
still gets a prebuilt.

> **`npm audit` is currently broken on this machine** — the registry's bulk-advisory endpoint returns
> a gzip body npm fails to decode (`invalid json response body ... Unexpected token '^_'`). Audit
> numbers above came from a manual workaround (posting the `npm ls` tree and gunzipping by hand).
> Worth fixing separately: as it stands, `npm audit` silently reports nothing.

Remaining transitive advisories not addressed: a critical `tar` (via `sharp`'s installer),
`brace-expansion`, `@hono/node-server`, `uuid`, `valibot` — all build/tooling-time rather than
runtime-reachable.

### Travel-partner consent flow

The original escalation fix left partnership one-directional. There is now a real
invitation/acceptance flow, modelled on the existing trip-collaborator invitations:

- New `TravelPartnerRequest` model + additive migration, with `@@unique([requesterId, recipientId])`
  and a hand-added `CHECK (requester_id <> recipient_id)`.
- Endpoints to send, list (incoming/outgoing), accept, decline and cancel.
- Authorization is enforced by **scoping the row lookup**, not by a separate check that could be
  forgotten: accept/decline query `where: { id, recipientId: userId, status: PENDING }`, cancel
  queries `requesterId: userId`. Anyone else simply finds nothing.
- Accept is the *only* place that writes another user's row, inside a `Serializable` transaction with
  both rows locked in ascending id order — legitimate precisely because both parties consented.
  `updateTravelPartnerSettings` still writes only the caller's own row.
- **Retroactive sharing is opt-in, per side.** Each user may choose to share *their own* existing
  trips — the requester when sending, the recipient when accepting. Neither can retroactively grant
  themselves access to the other's history, which preserves the property whose absence was the
  original bug.
- Unknown recipients get a generic "Unable to send a travel partner request to that user", matching
  the deliberate anti-enumeration wording in `userInvitation.service.ts`.

### Test coverage

The documented coverage gaps are closed. New suites (384 tests total, all passing):

| File | Tests | Covers |
| ---- | ----- | ------ |
| `backend/src/security/__tests__/urlValidation.test.ts` | 75 | SSRF classification — found the IPv6 bypass above |
| `backend/src/security/__tests__/csrf.test.ts` | 62 | Signed double-submit, session binding, exempt-path normalisation |
| `backend/src/services/__tests__/share.service.test.ts` | 34 | Public-payload exclusion list, path containment, token shape |
| `backend/src/services/__tests__/restore.security.test.ts` | 139 | 15 traversal payloads at both layers; mandatory integrity signature |
| `backend/src/prisma/__tests__/cascadeEntityLinks.test.ts` | 18 | EntityLink cleanup for cascade-deleted activity descendants |
| `backend/src/services/__tests__/dateBoundary.test.ts` | 35 | UTC vs local day boundary across six timezone offsets |
| `frontend/src/store/__tests__/authStore.test.ts` | 21 | All six logout cache clears, incl. failure isolation |

Two harness notes worth keeping, because both silently produce vacuous tests:

- **`process.env.TZ` cannot be changed from inside a Jest test.** Jest runs each file in a V8 vm
  context and Node's TZ-cache reset does not reach it — the assignment is a silent no-op, so a
  timezone matrix built that way asserts nothing. `dateBoundary.test.ts` instead simulates the
  process timezone at the `Date` level and asserts the no-op explicitly, so the shim can be dropped
  if Jest ever gains real TZ switching.
- That `Date` shim must extend the **pristine** `Date`, not the fake-timers one: `@sinonjs/fake-timers`'
  constructor returns a fresh native `Date` rather than `this`, silently discarding a subclass
  prototype.

### Code quality

`_shared/serviceHelpers.ts` was a grab-bag under a generic category name (the same principle behind
CLAUDE.md's "there is no `backend/src/utils/`"). It is now split into purpose-named modules —
`tripAccess.ts`, `tripPermissions.ts`, `prismaUpdateData.ts`, `decimalConversion.ts`,
`timezoneResolution.ts`, `entityLinkCleanup.ts` — with no re-export shim, since a shim would have
preserved the very name the rule forbids. All ~50 import sites now name the module they actually
depend on, and the type-only import in `modelDelegates.ts` was kept type-only to avoid a runtime cycle.

- `crudHelpers.ts` and `serviceHelpers.ts` are now free of `any`, `as any` and `eslint-disable`.
  Dynamic Prisma model access goes through one exhaustively-checked `getEntityDelegate` resolver
  (`backend/src/prisma/modelDelegates.ts`), so adding an entity type is a compile error rather than a
  runtime `undefined`. A fully assertion-free version was attempted and is impossible: Prisma's
  generated delegates cannot satisfy a common interface because their parameters are contravariant
  (verified — assigning `prisma.location` to `PrismaModelDelegate` fails with TS2322).
- The single layering violation is fixed: `immich.controller.ts` no longer queries Prisma directly.

### Verification

Measured after the pass completed. `tsc -b` is incremental, so the frontend check must use
`--force` — a cached run reports a false clean.

| Check | Before | After |
| ----- | ------ | ----- |
| Backend tests (`npx jest`) | 1522 pass / **30 fail**, 13 of 78 suites red | **2117 pass / 0 fail, 91 of 91 suites green** |
| Frontend tests (`npx vitest run`) | 375 pass / 0 fail | **486 pass / 0 fail** |
| Backend strict types (`tsc -p tsconfig.json --noEmit`) | 0 errors | **0 errors** |
| Frontend strict types (`tsc -b --force`) | 0 errors | **0 errors** |
| Prisma schema (`validate` + `generate`) | valid | **valid** |
| `any` / `eslint-disable` in `crudHelpers.ts` + `serviceHelpers.ts` | 8 suppressions, several `as any` | **0** |
| Known security advisories on runtime-reachable packages | 3 (`nodemailer`, `sharp`, `react-router-dom`) | **0** |
| Type escapes across the test suite | ~250 (`as any`, `as never`, `as unknown as`, `!`) | **3**, contained in one documented mock factory |
| Assertions in `auth/jwt.ts` | 6 (incl. unchecked `as JwtPayload` on verify) | **0** |

The backend suite grew by 595 tests: the stale-mock repairs unblocked suites that never ran (the
whole `aviationstack` file failed at import), and 384 new tests closed the documented coverage gaps.

**Known cosmetic issue**: `npx jest` prints "A worker process has failed to exit gracefully" at the
end of a full run. All tests pass and the run completes; something still holds a handle open after
teardown. `tokenBlacklist.service.ts`'s cleanup interval was `.unref()`'d as part of this pass, so
this is a different handle. Worth chasing with `--detectOpenHandles` — it inflates CI wall-clock but
does not affect results.

---

## Fixed Bugs

### Clicking a linked item should navigate to that item

- **Reported**: 2026-01-16
- **Fixed**: 2026-01-17
- **Priority**: Low
- **Component**: Frontend
- **Issue**: Clicking on linked entities in LinkPanel did nothing
- **Fix**: Added navigation handler using `useNavigate()` that closes the panel and navigates to the appropriate tab on the trip detail page with a hash containing entity type and ID for future scroll/highlight support

### Linking photos list doesn't paginate

- **Reported**: 2026-01-16
- **Fixed**: 2026-01-17
- **Priority**: Low
- **Component**: Frontend
- **Issue**: Photo selection modal loaded all photos at once, causing performance issues with large collections
- **Fix**: Added pagination to `useEntityFetcher.ts` and `GeneralEntityPickerModal.tsx` with 24 photos per page and a "Load More" button showing remaining count

### Inconsistent Edit and Delete buttons across entity managers

- **Reported**: 2026-01-16
- **Fixed**: 2026-01-17
- **Priority**: Low
- **Component**: Frontend
- **Issue**: Edit/Delete button styling varied across manager components (JournalManager used button classes while others used text links)
- **Fix**: Updated JournalManager to use consistent text-based link styling (blue Edit, red Delete) matching TransportationManager, LodgingManager, and ActivityManager

### Locations needs its own manager component

- **Reported**: 2026-01-16
- **Fixed**: 2026-01-17
- **Priority**: Low
- **Component**: Frontend
- **Issue**: Location management was embedded directly in TripDetailPage instead of having a dedicated manager component
- **Fix**: Created new `LocationManager.tsx` component following established patterns (useManagerCRUD, useFormFields, useConfirmDialog) and updated TripDetailPage to use it, reducing that file by ~400 lines

### Albums should use linking strategy and modal

- **Reported**: 2026-01-16
- **Fixed**: 2026-01-17
- **Priority**: Low
- **Component**: Frontend
- **Issue**: Album cards in AlbumsPage were missing LinkButton for EntityLink integration
- **Fix**: Added `useTripLinkSummary` hook and `LinkButton` component to album cards in AlbumsPage.tsx, matching the pattern used in ActivityManager

### Move Print button to right side

- **Reported**: 2026-01-16
- **Fixed**: 2026-01-17
- **Priority**: Low
- **Component**: Frontend
- **Issue**: Print button was positioned on the left side of the Timeline header
- **Fix**: Changed action buttons container in Timeline.tsx to use `justify-between`, positioning Weather Refresh on left and Print on right

### Timeline timezone layout should be spaced further apart (trip left, home right)

- **Reported**: 2026-01-16
- **Fixed**: 2026-01-17
- **Priority**: Low
- **Component**: Frontend
- **Issue**: In dual timezone mode, both times appeared on the left with insufficient separation
- **Fix**: Updated TimelineDaySection.tsx and TimelineEventCard.tsx to use `justify-between` layout with trip time on LEFT (blue dot indicator) and home time on RIGHT (gray dot indicator) with clear visual separation

### No button to add unscheduled entities (needs type picker)

- **Reported**: 2026-01-16
- **Fixed**: 2026-01-17
- **Priority**: Low
- **Component**: Frontend
- **Issue**: The Unscheduled page had no unified way to add new items - users had to navigate to each tab separately
- **Fix**: Added a unified "Add Item" button to UnscheduledItems.tsx that opens a modal chooser allowing users to select the entity type (Activity, Transportation, or Lodging). Also added full create functionality with appropriate forms and service calls.

### Car transportation shows distance twice instead of 3 stats

- **Reported**: 2026-01-16
- **Fixed**: 2026-01-17
- **Priority**: Low
- **Component**: Frontend
- **Issue**: In TransportationStats, the stats grid for non-flight transportation showed Distance twice - once in the grid and again in the detail cards below
- **Fix**: Changed the fourth stat in the grid from "Distance (km)" to "Travel Time" in TransportationStats.tsx. Distance is now shown only in the detail card below, consistent with the flight statistics pattern.

### Car route not showing on minimap (shows flight path instead)

- **Reported**: 2026-01-16
- **Fixed**: 2026-01-17
- **Priority**: Low
- **Component**: Frontend
- **Issue**: When no route geometry was available from OpenRouteService, car/bike/walking transportation showed a curved "flight arc" path instead of a straight line
- **Fix**: Updated FlightRouteMap.tsx to use different fallback behavior based on transportation type:
  - Flights: Continue to use curved arc path (represents flight trajectory)
  - Ground transportation (car, bike, walk, etc.): Use straight line when no geometry (indicates no actual route data available)
  - Both types use dashed lines when showing fallback/estimated routes

### User default timezone not showing end time on timeline

- **Reported**: 2026-01-16
- **Fixed**: 2026-01-17
- **Priority**: Low
- **Component**: Frontend
- **Issue**: In dual timezone display mode, the user's home timezone column was not showing end times consistently, and the timezone abbreviation was embedded within the time span instead of being separate
- **Fix**: Updated `renderHomeTime()` function in `TimelineEventCard.tsx` to properly display end times with separate styling for the time and timezone abbreviation. The function now returns start time, end time (if present), and timezone abbreviation in separate elements for proper formatting.

### User default timezone not showing on check-in/check-out times

- **Reported**: 2026-01-16
- **Fixed**: 2026-01-17
- **Priority**: Low
- **Component**: Frontend
- **Issue**: Lodging check-in and check-out times in the user's home timezone column lacked the "Check-in:" and "Check-out:" labels that were shown in the trip timezone column
- **Fix**: Updated `renderHomeTime()` in `TimelineEventCard.tsx` to include "Check-in:" and "Check-out:" labels for lodging time display, matching the format used in `renderTripTime()` for consistency.

### Remove options for old linking methods

- **Reported**: 2026-01-16
- **Fixed**: 2026-01-17
- **Priority**: Low
- **Component**: Frontend
- **Issue**: TimelineEditModal still had legacy multi-select dropdowns for linking journal entries to activities, lodging, and transportation using old assignment-based approach instead of unified EntityLink system
- **Fix**: Removed legacy linking UI from TimelineEditModal:
  - Removed `locationIds`, `activityIds`, `lodgingIds`, `transportationIds` from journal form state
  - Removed multi-select dropdown fields for linking
  - Updated `submitJournal()` to only send title, content, and date
  - Added helpful tip directing users to use the Link button (🔗) on the timeline after saving
  - Deleted 5 backup files (*.backup) that were no longer needed

### Flights should only show airport names, not full addresses, on timeline

- **Reported**: 2026-01-16
- **Fixed**: 2026-01-17
- **Priority**: Low
- **Component**: Frontend
- **Issue**: Flight items on the timeline showed full addresses (e.g., "LAX (123 Airport Blvd, Los Angeles, CA)") which made the display cluttered
- **Fix**: Modified the `getLocationDisplay()` function in `Timeline.tsx` to accept a transport type parameter. For flights (`transportType === 'flight'`), the function now returns only the location name without the address. Other transportation types (car, train, bus) continue to show the address for context.

### Clicking Link with no existing links should skip to Add Link modal

- **Reported**: 2026-01-16
- **Fixed**: 2026-01-17
- **Priority**: Low
- **Component**: Frontend
- **Issue**: When clicking the Link button on an entity with no existing links, users had to see an empty list first before clicking "Add Link"
- **Fix**: Added a `useEffect` in `LinkPanel.tsx` that automatically opens the Add Link modal (`setShowAddLinkModal(true)`) when the link data finishes loading and there are no existing links (`linksData.summary.totalLinks === 0`).

### Linked entities on timeline should show names in tooltip on hover

- **Reported**: 2026-01-16
- **Fixed**: 2026-01-17
- **Priority**: Low
- **Component**: Frontend
- **Issue**: Hovering over linked entity badges (📍 2, 🏨 1, etc.) in the timeline showed no information about what was actually linked
- **Fix**: Created new `EntityLinkTooltip.tsx` component that:
  - Uses lazy loading to fetch link details only when hovered (300ms delay)
  - Shows a styled tooltip with the names of linked entities
  - Limits display to 5 items with a "+X more" indicator
  - Caches results for 1 minute to avoid repeated requests
  - Updated `EventLinkBar.tsx` to wrap non-photo entity badges with this tooltip component

### Add/Edit modals for entities are too busy, need better UI/UX

- **Reported**: 2026-01-15
- **Fixed**: 2026-01-17
- **Priority**: Low
- **Component**: Frontend
- **Issue**: Add/Edit modals for transportation, lodging, and activities felt cluttered and overwhelming with too many form fields displayed at once
- **Fix**: Created new `FormSection.tsx` component with collapsible sections for progressive disclosure. Updated TransportationManager, LodgingManager, and ActivityManager to organize fields into logical groups (Type, Route, Schedule, etc.) with advanced/optional fields hidden behind "Show More Options" toggle.

### Timeline item icons (photos, locations, links) are misaligned

- **Reported**: 2026-01-15
- **Fixed**: 2026-01-17
- **Priority**: Low
- **Component**: Frontend
- **Issue**: Photo count, location marker, and link icons in timeline item footers had inconsistent vertical alignment
- **Fix**: Updated `EventLinkBar.tsx` and `TimelineEventCard.tsx` to use consistent `h-6` height, `items-center justify-center`, and `leading-none` on all badges. Wrapped emojis in fixed-dimension containers for proper centering.

### Trip times do not align under timezone headers on timeline

- **Reported**: 2026-01-15
- **Fixed**: 2026-01-17
- **Priority**: Low
- **Component**: Frontend
- **Issue**: Times were misaligned with their respective timezone headers in dual timezone display
- **Fix**: Updated `TimelineDaySection.tsx` and `TimelineEventCard.tsx` with matching column widths (`w-11` spacer for icon, `w-32` for each time column) to ensure times align directly under their corresponding timezone headers.

### Photo selection buttons are busy and confusing

- **Reported**: 2026-01-15
- **Fixed**: 2026-01-17
- **Priority**: Low
- **Component**: Frontend
- **Issue**: Photo selection interface had cluttered button layout that was confusing to use
- **Fix**: Redesigned `PhotoGallery.tsx` and `AddPhotosToAlbumModal.tsx` with clear visual grouping (selection status badge, selection controls group, actions group), consistent SVG icons with tooltips, clear visual hierarchy (primary/secondary/danger actions), and proper dark mode support.

### Remove Cover Photo has no confirmation dialog

- **Reported**: 2026-01-15
- **Fixed**: 2026-01-17
- **Priority**: Low
- **Component**: Frontend
- **Issue**: Cover photo was removed immediately without any confirmation when clicking "Remove Cover Photo"
- **Fix**: Updated `TripDetailPage.tsx` to use the existing `useConfirmDialog` hook before removing cover photo, showing a warning dialog with "Remove Cover Photo" title and confirmation message.

### Photo thumbnails broken on hover in timeline

- **Reported**: 2026-01-16
- **Fixed**: 2026-01-17
- **Priority**: Low
- **Component**: Frontend
- **Issue**: Photo thumbnails were broken or not displaying correctly when hovering over timeline items
- **Fix**: Updated `PhotoPreviewPopover.tsx` to use `getFullAssetUrl()` helper for correct URL construction. Added support for Immich photos by fetching with auth headers and caching blob URLs. Added error handling to hide broken images gracefully.

### Last day of trip missing weather on timeline

- **Reported**: 2026-01-15
- **Fixed**: 2026-01-17
- **Priority**: Low
- **Component**: Frontend
- **Issue**: Weather data was not displayed on the final day of a trip in the Timeline view due to a timezone mismatch in date key formatting
- **Fix**: Updated `generateAllTripDates()` function in Timeline.tsx to use `tripTimezone` when formatting dates. The `Intl.DateTimeFormat` formatter was missing the `timeZone` option, causing date keys to use the browser's local timezone instead of the trip timezone. This mismatch meant weather data (keyed using trip timezone) couldn't be looked up correctly when the user's local timezone differed from the trip timezone.

### Unscheduled page only supports activities, not transportation or lodging

- **Reported**: 2026-01-15
- **Fixed**: 2026-01-16
- **Priority**: Medium
- **Component**: Frontend
- **Issue**: Unscheduled page only showed activities; transportation and lodging without dates were not visible or manageable
- **Fix**: Major refactor of UnscheduledActivities component → renamed to UnscheduledItems
  - Created new `UnscheduledItems.tsx` component with tabbed interface
  - Added support for Activities, Transportation, and Lodging tabs
  - Each tab fetches and displays unscheduled items of that type
  - Added "Add" buttons for all three entity types
  - Updated TripDetailPage.tsx to use new UnscheduledItems component

### Timeline print creates blank document

- **Reported**: 2026-01-15
- **Fixed**: 2026-01-16
- **Priority**: Medium
- **Component**: Frontend
- **Issue**: Print preview showed blank document when printing timeline
- **Fix**: Updated print CSS media queries in Timeline.tsx to properly display content when printing
  - Fixed display properties for print media
  - Ensured timeline events and sections are visible in print mode
  - Maintained proper layout and formatting for printed output

### Car stats and flight stats have inconsistent stat categories

- **Reported**: 2026-01-15
- **Fixed**: 2026-01-16
- **Priority**: Medium
- **Component**: Frontend
- **Issue**: Car and other transportation stats only showed total trips and distance, missing upcoming/completed breakdown that flight stats had
- **Fix**: Updated TransportationStats.tsx to provide consistent stats across all transportation types
  - Extended TypeStats interface to include `upcoming` and `completed` fields for all types
  - Added tracking logic to count upcoming vs completed for all transportation types
  - Updated display to show Upcoming and Completed badges for cars, trains, buses, etc.
  - Unified layout with 2-4 column grid matching flight stats structure
  - Now all transportation types show: Total Trips, Upcoming, Completed, Distance (if available)

### Journal entry link selection uses different mechanism than other entities

- **Reported**: 2026-01-15
- **Fixed**: 2026-01-16
- **Priority**: Medium
- **Component**: Frontend
- **Issue**: Journal entries used old assignment-based linking instead of unified EntityLink system
- **Fix**: Migrated JournalManager.tsx to use unified EntityLink system
  - Replaced old assignment UI with LinkButton and LinkPanel components
  - Journal entries now use same linking mechanism as all other entities
  - Removed legacy assignment-based code
  - Fully integrated with EntityLink backend system

### Car routes not displayed on transportation minimap

- **Reported**: 2026-01-15
- **Fixed**: 2026-01-16
- **Priority**: Medium
- **Component**: Backend
- **Issue**: No route geometry was displayed for car, bicycle, and walk transportation types on minimaps. The backend only attempted to fetch route geometry if `distanceSource === 'route'`, which excluded cases where OpenRouteService was unavailable during initial calculation or became available later.
- **Fix**: Modified `enhanceTransportations()` method in `backend/src/services/transportation.service.ts` (line 185-216) to always attempt route geometry fetching for road-based transportation types (car, bicycle, walk), regardless of `distanceSource` value. The routing service handles caching and graceful fallbacks, so this change allows existing transportation to show routes if OpenRouteService becomes available.

### Cannot add activity from Unscheduled page

- **Reported**: 2026-01-15
- **Fixed**: 2026-01-16
- **Priority**: Medium
- **Component**: Frontend
- **Issue**: No option or button to add an activity from the Unscheduled page, only edit functionality existed
- **Fix**: Added "+ Add Activity" button and create mode support to UnscheduledActivities.tsx
  - Added `showForm` state to control form visibility
  - Added `handleAdd()` function to open the form for creating new activities
  - Modified `handleSubmit()` to support both create and update modes
  - Updated form title and button labels to reflect create vs edit mode
  - Activities created without dates/times automatically appear in the unscheduled view

### Timeline expanded mode doesn't expand minimaps

- **Reported**: 2026-01-15
- **Fixed**: 2026-01-16
- **Priority**: Medium
- **Component**: Frontend
- **Issue**: Minimaps remained collapsed regardless of timeline view mode
- **Fix**: Added `defaultExpanded={viewMode === 'standard'}` prop to DayMiniMap component in TimelineDaySection.tsx (line 204)

### Child location album boxes invisible due to matching background color

- **Reported**: 2026-01-15
- **Fixed**: 2026-01-16
- **Priority**: Medium
- **Component**: Frontend
- **Issue**: Album boxes on child location cards had same background as parent card
- **Fix**: Updated AssociatedAlbums.tsx to use `bg-white dark:bg-gray-800` with border `border-gray-200 dark:border-gray-600` for visual distinction (line 33)

### Photo linking shows only photo numbers, not thumbnails

- **Reported**: 2026-01-15
- **Fixed**: 2026-01-16
- **Priority**: Medium
- **Component**: Frontend
- **Issue**: Photo selection showed only numbers/IDs instead of visual thumbnails
- **Fix**:
  - Added `thumbnailPath` field to EntityItem type in useEntityFetcher.ts
  - Updated LinkPanel.tsx to display photo thumbnails (lines 271-280)
  - Updated GeneralEntityPickerModal.tsx to show thumbnails when selecting photos (lines 178-188)

### Add Location form is not in a modal

- **Reported**: 2026-01-15
- **Fixed**: 2026-01-16
- **Priority**: Medium
- **Component**: Frontend
- **Issue**: Location form displayed inline instead of in modal dialog like other entities
- **Fix**: Wrapped location form in FormModal component in TripDetailPage.tsx with proper footer buttons (lines 1252-1349)

---

## Bug Template

When adding a new bug, use this template:

```markdown
### [Brief Description]

- **Reported**: YYYY-MM-DD
- **Status**: Open | In Progress | Fixed
- **Priority**: High | Medium | Low
- **Component**: Frontend | Backend | Database | Infrastructure
- **Steps to Reproduce**:
  1. Step one
  2. Step two
  3. Expected vs actual behavior
- **Notes**: Any additional context
```
