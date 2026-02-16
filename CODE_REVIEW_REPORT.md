# Travel Life - Comprehensive Code Review Report

**Date**: 2026-02-15
**Scope**: Full codebase review across 7 parallel analysis streams
**Areas**: Security, Bugs, Database, API Design, Frontend UI/UX, Dependencies & Configuration

---

## Executive Summary

The Travel Life application is well-built with strong foundational security (in-memory tokens, httpOnly cookies, CSRF protection, rate limiting, Helmet headers) and good architecture. However, the review uncovered **~80 findings** across all areas, including several critical issues that should be addressed before any public-facing deployment.

| Severity | Count | Key Themes |
|----------|-------|-----------|
| **CRITICAL** | 12 | Auth bypass, open redirect, missing transactions, route ordering, hardcoded secrets |
| **HIGH** | 22 | File handling, SSRF, race conditions, stale cache, accessibility, HTTPS |
| **MEDIUM** | 25 | Type safety, logging, CSP, color contrast, validation gaps |
| **LOW** | ~20 | Documentation, edge cases, minor UX polish |

---

## CRITICAL Findings (Fix Immediately)

### SEC-1: JWT Missing `passwordVersion` in User Invitation Flow

- **File**: `backend/src/controllers/userInvitation.controller.ts:62-72`
- **Issue**: Tokens generated during invitation acceptance lack the `passwordVersion` field, bypassing the password-change session invalidation mechanism.
- **Impact**: If a new user changes their password, old sessions cannot be force-revoked.
- **Fix**: Add `passwordVersion: user.passwordVersion ?? 0` to both access and refresh token payloads.

### SEC-2: Token Blacklist Not Checked on File Access

- **File**: `backend/src/index.ts:126-151`
- **Issue**: The `/uploads` file access endpoint calls `verifyAccessToken()` but never checks `isBlacklisted()` for access tokens. A logged-out user's access token still grants file access until it expires.
- **Impact**: Files accessible for up to 15 minutes after logout.
- **Fix**: Accept risk (15m token lifetime) or add blacklist check for access tokens too.

### SEC-3: Open Redirect Vulnerability in Login Page

- **File**: `frontend/src/pages/LoginPage.tsx:21-22`
- **Issue**: The `redirect` query parameter is used directly in `navigate()` without validation. An attacker can craft `?redirect=https://evil.com` to redirect users after login.
- **Fix**:
  ```typescript
  const isValidRedirect = (url: string) => url.startsWith('/') && !url.startsWith('//');
  const redirectUrl = isValidRedirect(searchParams.get('redirect') || '')
    ? searchParams.get('redirect') : '/dashboard';
  ```

### SEC-4: Hardcoded Default JWT Secrets in Docker Compose

- **File**: `docker-compose.yml:30-31`
- **Issue**: Development compose has `JWT_SECRET: your-super-secret-jwt-key-change-this` as a default. If used in production, all tokens can be forged.
- **Fix**: Remove default values; require explicit environment variables.

### DB-1: Bulk Entity Deletion Without Transactions

- **File**: `backend/src/services/location.service.ts:358-389`
- **Issue**: `cleanupEntityLinks()` runs in a loop for each location, then `deleteMany()` runs separately. If delete fails mid-way, entity links are already gone but locations remain.
- **Same pattern in**: `transportation.service.ts:593-603`, `photo.service.ts:878-883`
- **Fix**: Wrap all cleanup + delete operations in `prisma.$transaction()`.

### DB-2: Individual Entity Deletion Without Transactions

- **File**: `backend/src/services/location.service.ts:258-275`, `photo.service.ts:848-886`
- **Issue**: `cleanupEntityLinks()` and `prisma.*.delete()` are separate operations. If either fails, data is inconsistent.
- **Fix**: Use `prisma.$transaction()` to make atomic.

### BUG-1: Race Condition in Trip Duplication Location Mapping

- **File**: `backend/src/services/trip.service.ts:684-742`
- **Issue**: Location deduplication uses `name|lat|lng` as composite key. If two locations share the same name and coordinates, the Map overwrites one entry, causing broken entity link mapping.
- **Fix**: Use creation order or returned IDs instead of composite key mapping.

### BUG-2: Missing Graceful Shutdown for Token Blacklist Interval

- **File**: `backend/src/services/tokenBlacklist.service.ts:224-225`
- **Issue**: `startCleanupInterval()` runs at module load and is never stopped. The SIGTERM/SIGINT handlers in `index.ts` don't call `stopCleanupInterval()`, preventing clean process termination.
- **Fix**: Add `stopCleanupInterval()` to graceful shutdown handlers.

### API-1: Route Ordering Bug - Unreachable Location Endpoints

- **File**: `backend/src/routes/location.routes.ts:63,83,215`
- **Issue**: `/:id` is defined before `/visited`, `/categories/list`, etc. Express matches sequentially, so `GET /api/locations/visited` matches `/:id` with `id="visited"` and fails.
- **Fix**: Move specific routes (`/visited`, `/categories/*`, `/trip/:tripId`) before the generic `/:id` route.

### API-2: Inconsistent DELETE Response Codes

- **Files**: Multiple controllers
- **Issue**: Some DELETE endpoints return `204 No Content`, others return `200` with a JSON body. This breaks frontend expectations.
  - `trip.controller.ts:73` → 204
  - `location.controller.ts:65` → 200 with body
  - `photo.controller.ts:179` → 204
  - `checklist.controller.ts:95` → 200 with body
- **Fix**: Standardize all DELETEs to either 204 or 200 consistently.

### API-3: Backup Endpoint Skips Standard Response Wrapper

- **File**: `backend/src/controllers/backup.controller.ts:23`
- **Issue**: `POST /api/backup/create` returns raw backup data instead of wrapping in `{ status: 'success', data: ... }`.
- **Fix**: Wrap response in standard format.

### CFG-1: No HTTPS Enforcement

- **Files**: `frontend/nginx.conf`, backend configuration
- **Issue**: No HTTP→HTTPS redirect, no HSTS header, no TLS configuration. Cookies may transmit over plain HTTP.
- **Fix**: Add TLS termination (nginx or reverse proxy), HSTS header, and HTTP redirect.

---

## HIGH Findings (Fix Before Next Release)

### Security

| ID | Finding | File | Impact |
|----|---------|------|--------|
| SEC-5 | Timezone value in raw SQL uses `Prisma.raw()` with regex-only validation | `photo.service.ts:720-735` | SQL injection if regex is ever weakened |
| SEC-6 | No SSRF validation on user-provided Immich URLs | `user.controller.ts:71-83` | Internal service scanning via Immich config |
| SEC-7 | Weak file naming (`Math.random()`) allows collisions | `photo.routes.ts:35-40` | File overwrite on simultaneous uploads |
| SEC-8 | CSRF exemption path matching is fragile | `csrf.ts:73-75` | Potential CSRF bypass with URL encoding |
| SEC-9 | Verbose Zod validation errors expose schema structure | `photo.controller.ts:244-251` | Information disclosure |

### Bugs

| ID | Finding | File | Impact |
|----|---------|------|--------|
| BUG-3 | Orphaned files when photo DB insert fails after rename | `photo.service.ts:310-323` | Disk space leak |
| BUG-4 | ffmpeg operations have no timeout | `photo.service.ts:139-160` | Hung requests, resource exhaustion |
| BUG-5 | Restore transaction timeout (5min) may be insufficient for large datasets | `restore.service.ts:599-602` | Partial restores leaving inconsistent data |
| BUG-6 | Trip series relationships lost during duplication | `trip.service.ts:659-672` | Data loss on trip copy |

### Database

| ID | Finding | File | Impact |
|----|---------|------|--------|
| DB-3 | EntityLinks only cascade on tripId, not on source/target entity deletion | `schema.prisma:587-620` | Orphaned links if code cleanup missed |
| DB-4 | RouteCache has no unique index on coordinates+profile | `schema.prisma:545-560` | Duplicate cache entries, wasted disk |
| DB-5 | Route calculation runs on every transportation fetch | `transportation.service.ts:241-327` | Unnecessary latency |

### Frontend

| ID | Finding | File | Impact |
|----|---------|------|--------|
| UI-1 | Missing loading skeletons on Dashboard/Trips pages | `DashboardPage.tsx`, `TripsPage.tsx` | Flash of blank content |
| UI-2 | No dirty state tracking or unsaved changes warning | `ActivityForm.tsx` and others | Users lose work without warning |
| UI-3 | Stale cache after modal operations | `TripDetailPage.tsx:800-910` | Users see outdated data |
| UI-4 | Missing `aria-hidden` on decorative SVGs | `LoginPage.tsx:31-42` | Screen reader noise |
| UI-5 | Pagination buttons too small for mobile (below 44x44px) | `Pagination.tsx:46-55` | Difficult to tap on mobile |
| UI-6 | Missing inline validation feedback on form fields | `TripFormPage.tsx:93-149` | Users can't find which field failed |
| UI-7 | Photo upload memory leak on navigation | `PhotoUpload.tsx:97-150` | Uncancelled requests |

### Config

| ID | Finding | File | Impact |
|----|---------|------|--------|
| CFG-2 | Axios `^1.6.5` has known CVEs | Both `package.json` files | Potential data exposure |
| CFG-3 | Backend Dockerfile runs as root if `su-exec` unavailable | `Dockerfile.prod:59-62` | Container escape → root access |
| CFG-4 | No CORS origin URL format validation | `index.ts:67-73` | Malformed origins could be accepted |

---

## MEDIUM Findings (Address in Upcoming Sprints)

### Security & Config

- **SEC-10**: No rate limiting on global search endpoint (user enumeration) - `search.routes.ts`
- **SEC-11**: Password version cache uses FIFO instead of LRU eviction - `auth.ts:36-50`
- **SEC-12**: In-memory token blacklist not suitable for multi-server - `tokenBlacklist.service.ts`
- **SEC-13**: Missing backup integrity verification (no HMAC/signature) - `backup.controller.ts`
- **SEC-14**: Immich service logs URLs in development - `immich.service.ts:77-98`
- **CFG-5**: CSP directives are minimal (no script-src, style-src, connect-src) - `index.ts:56-65`
- **CFG-6**: Frontend env vars written to disk at runtime could expand to secrets - `Dockerfile.prod:36-43`
- **CFG-7**: Request bodies logged in development with pattern-based sanitization - `errorHandler.ts:91`
- **CFG-8**: Database connection string potentially in shell logs - `migrate-and-start.sh:88`
- **CFG-9**: External API calls don't enforce HTTPS - various service files

### Frontend XSS

- **SEC-15**: `dangerouslySetInnerHTML` in `OfflineSearchResults.tsx:279,284` - low risk since data is from DB, but `highlightMatches` doesn't escape HTML characters.
- **SEC-16**: Excessive `console.log` in production could leak implementation details - multiple files

### Bugs & Code Quality

- **BUG-7**: Multiple `as any` type casts hiding potential runtime errors - `trip.service.ts:336,362`, `transportation.service.ts:76`
- **BUG-8**: No lat/lng range validation in location service - `location.service.ts`
- **BUG-9**: Generic error messages lose original error context - `backup.service.ts:560-561`
- **BUG-10**: No circular parent reference check in location hierarchy - `location.service.ts`
- **BUG-11**: User timezone may be reset to null during restore - `restore.service.ts:74-76`

### Database

- **DB-6**: No unique constraint on `(tripId, immichAssetId)` for photo imports - allows duplicates at DB level
- **DB-7**: No CHECK constraints for non-negative cost fields - activity, lodging, transportation
- **DB-8**: Trip `status` and `privacyLevel` not enforced as NOT NULL at DB level
- **DB-9**: Photo date groupings query has no LIMIT clause - `photo.service.ts:728-736`

### UI/UX

- **UI-8**: Color contrast issues in dark mode (`text-warm-gray` on `dark:bg-navy-800`) - `tailwind.config.js:113-121`
- **UI-9**: No retry button for failed thumbnail loads - `AlbumsPage.tsx`
- **UI-10**: Focus not always restored after modal close - `Modal.tsx:135-194`
- **UI-11**: Search results not memoized - `GlobalSearch.tsx:68-94`
- **UI-12**: View mode switch doesn't reset pagination page - `TripsPage.tsx:62-87`
- **UI-13**: Missing error boundaries around nested modals - `App.tsx:162-210`
- **UI-14**: `useFormFields` hook doesn't handle dynamic initial values - `useFormFields.ts:16-41`

---

## LOW Findings (Backlog)

### Security & Config

- `crossOriginResourcePolicy: 'cross-origin'` may be overly permissive - `index.ts`
- JWT secret minimum length not enforced - `config/index.ts`
- Logout only invalidates current session, not all sessions - `auth.controller.ts`
- Missing `.gitignore` entries for `*.pem`, `*.key`, `.env.*.production`
- No `security.txt` file for vulnerability disclosure
- No `npm audit` in CI/CD pipeline
- Log level not configurable via env var - `logger.ts`

### Bugs

- Pagination cursor edge case in large backups - `backup.service.ts:155-178`
- Missing `try-catch` around `readFileSync(package.json)` at startup - `index.ts:40-43`
- Date filter string concatenation could produce invalid dates - `trip.service.ts:274,277`

### UI/UX

- Inconsistent error display (toast vs inline vs class) across pages
- Missing success state after batch upload completion - `PhotoUpload.tsx`
- Some icon-only buttons lack `aria-label`
- Browser back button doesn't close modals on mobile
- No connection/offline status indicator in navbar
- No loading indicator for slow network in modal forms
- `localStorage` used for recent searches (minor privacy concern) - `GlobalSearch.tsx`

---

## Positive Findings (What's Done Well)

The codebase demonstrates many strong practices worth preserving:

- **Authentication**: In-memory access tokens (not localStorage), httpOnly refresh cookies, password version invalidation, bcrypt hashing
- **CSRF**: Proper double-submit cookie pattern with timing-safe comparison
- **Rate Limiting**: Multiple tiers (general + sensitive endpoint limiters)
- **File Validation**: Magic byte validation, not just MIME type checking
- **Authorization**: Consistent `verifyTripAccessWithPermission` pattern across services
- **Prisma**: Parameterized queries prevent SQL injection throughout
- **Error Handling**: Centralized error handler with sensitive data sanitization
- **Frontend State**: Zustand + TanStack Query with proper cache invalidation patterns
- **Accessibility**: 536+ aria attributes found, focus traps in modals, keyboard navigation
- **Zero npm audit vulnerabilities** in current dependency tree (though Axios version should be updated)

---

## Recommended Action Plan

### Phase 1: Immediate (This Week)

1. Fix open redirect in LoginPage.tsx (SEC-3)
2. Add `passwordVersion` to invitation JWT tokens (SEC-1)
3. Fix location route ordering (API-1)
4. Remove hardcoded JWT secrets from docker-compose.yml (SEC-4)
5. Wrap entity deletion in transactions (DB-1, DB-2)

### Phase 2: Short-Term (Next 2 Weeks)

6. Add file cleanup on photo DB insert failure (BUG-3)
7. Add ffmpeg timeout (BUG-4)
8. Fix trip duplication location mapping race condition (BUG-1)
9. Add graceful shutdown for token blacklist interval (BUG-2)
10. Standardize DELETE response codes (API-2)
11. Update Axios to latest (CFG-2)
12. Add HTTPS/HSTS configuration guide (CFG-1)
13. Use `crypto.randomBytes()` for file naming (SEC-7)

### Phase 3: Medium-Term (Next Month)

14. Add loading skeletons to Dashboard/Trips pages (UI-1)
15. Add inline form validation feedback (UI-6)
16. Fix pagination reset on view mode change (UI-12)
17. Add dirty state tracking to forms (UI-2)
18. Strengthen CSP directives (CFG-5)
19. Add unique index to RouteCache (DB-4)
20. Parameterize timezone in raw SQL queries (SEC-5)

### Phase 4: Backlog

- Remaining MEDIUM and LOW findings
- Accessibility audit for WCAG AA compliance
- Performance optimization (memoization, lazy loading)
- Multi-server token blacklist (Redis)
- Comprehensive OpenAPI documentation updates
