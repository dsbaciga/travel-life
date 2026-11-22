# API Reference

Travel Life API documentation. The backend provides a RESTful API for all application functionality.

> Last updated: 2026-11-15 — Travel Life v7.3.0. The route files in `backend/src/routes/` (with their Swagger comments) are the authority.

## Base URL

All API endpoints are mounted under `/api`. There is no path versioning.

- **Development**: `http://localhost:5000/api`
- **Production**: `https://your-domain.com/api`

## Service & Health Endpoints

These endpoints are not authenticated and are useful for monitoring and diagnostics.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/health` | Health check, includes database connectivity status | No |
| GET | `/api` | API root - returns name, version, and running status | No |
| GET | `/api/version` | Returns the backend version and package name | No |

## Authentication

Most endpoints require JWT authentication. The exceptions (marked `No` in the tables) are the auth
bootstrap routes, public invitation lookups, the calendar feed, the public share routes and the
language phrase data.

Two kinds of client are supported:

- **Browser (cookie + CSRF header)**: an `httpOnly` `refreshToken` cookie plus a readable `csrf-token`
  cookie. Every non-`GET`/`HEAD`/`OPTIONS` request must echo the CSRF cookie in an `x-csrf-token`
  header. The token is an HMAC-signed value bound to the session's refresh token
  (`backend/src/security/csrf.ts`), so a value copied from another session is rejected with `403`.
- **Native / API clients (Bearer only)**: send `Authorization: Bearer <access_token>` and no
  `refreshToken` cookie; CSRF validation is skipped (see [CSRF Protection](#csrf-protection)).

### Headers

```text
Authorization: Bearer <access_token>
```

### Token Lifecycle

- **Access Token**: short-lived; sent in the `Authorization` header.
- **Refresh Token**: long-lived; stored as an `httpOnly` cookie (not exposed to JavaScript).
- On page load, the frontend calls `POST /api/auth/silent-refresh`, which reads the refresh token cookie and returns a fresh access token if the cookie is valid.
- The access token is refreshed transparently by the frontend.

### CSRF Protection

All state-changing (`/api` non-`GET`/`HEAD`/`OPTIONS`) requests are protected by CSRF validation, with a
short exempt list rather than a blanket auth-routes exemption:

- `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/refresh`, `POST /api/auth/silent-refresh` — these bootstrap the CSRF token, so they cannot require one. **`POST /api/auth/logout` is not on this list — it IS CSRF-validated.**
- `POST /api/user-invitations/accept` and `POST /api/user-invitations/decline/:token` — accessed by unauthenticated users who have no CSRF token; protected instead by the invitation token itself plus rate limiting.

Everything else — including every other authenticated route — requires the `x-csrf-token` header to match the `csrf-token` cookie on any non-safe method.

**Native clients.** A request that carries an `Authorization: Bearer <token>` header **and no
`refreshToken` cookie** skips CSRF validation: CSRF abuses credentials a browser attaches on its
own, and a cross-site page cannot make a browser send an `Authorization` header. Both conditions
are required, so every browser session (which always has the cookie) is still fully validated.
`POST /api/auth/mobile/pair` and `POST /api/auth/oidc/mobile-exchange` are also exempt — they are
unauthenticated exchanges where the single-use token in the body is the credential.
`POST /api/auth/oidc/mobile-confirm` is exempt for the same reason: it is a plain HTML form post
from the server-rendered confirmation page, which cannot send an `x-csrf-token` header, and the
single-use nonce in the form body is the credential. The handler reads no cookie.

### Native (mobile) clients

Send `X-Client-Platform: mobile` on `/auth/login`, `/auth/register` and `/auth/refresh`. The
response then includes `refreshToken` in the JSON body and **no cookies are set**; the client
stores both tokens in the OS keystore and sends its refresh token in the body of `/auth/refresh`
(and `/auth/logout`). Refresh tokens stay single-use and rotate on every refresh.

#### Mobile single sign-on

1. The app generates a random verifier, keeps it, and opens
   `GET /api/auth/oidc/login?client=mobile&code_challenge=<sha256 hex of the verifier>` in a system
   browser session.
2. After the identity provider round trip, `GET /api/auth/oidc/callback` does **not** redirect to
   the app. It renders a confirmation page — "Sign in to the Travel Life app?", naming the account
   email — with **Continue** and **Cancel**. At this point no exchange code exists; the sign-in is
   only pending.
3. The page's form posts `nonce` and `action` (`continue` or `cancel`) to
   `POST /api/auth/oidc/mobile-confirm` as `application/x-www-form-urlencoded`.
   - `continue` mints the one-time exchange code and answers `303` to
     `travellife://auth/oidc?code=<code>`.
   - `cancel` discards the pending sign-in and answers `303` to
     `travellife://auth/oidc?error=cancelled`.
   - An unknown, reused or expired nonce renders an HTML error page (`401`; `400` for a malformed
     form) and redirects nowhere.
4. The app posts `{ code, codeVerifier }` to `POST /api/auth/oidc/mobile-exchange` and receives
   `{ user, accessToken, refreshToken }`.

The confirmation step exists because the code travels over a custom URL scheme that any installed
app can register for. The verifier binds a code to whoever *started* the flow, but another app
could start it too; with an existing identity-provider session the whole round trip would complete
without the user seeing anything. Requiring a tap on a page that names the account closes that.

Lifetimes: the nonce is single-use and valid for five minutes from the callback; the exchange code
is single-use and valid for five minutes from confirmation. Both live in server memory, so a
restart in between means signing in again. The confirmation page is sent with
`Cache-Control: no-store`, `X-Frame-Options: DENY` and a `default-src 'none'`
Content-Security-Policy (`frame-ancestors 'none'`, no script), so it can be neither cached nor
framed.

## API Endpoints

### Authentication (`/api/auth`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/register` | Create new user account | No |
| POST | `/login` | Authenticate user, returns tokens | No |
| POST | `/refresh` | Refresh access token (reads refresh token cookie; native clients send the refresh token in the body) | No |
| POST | `/silent-refresh` | Restore auth state from httpOnly cookie on page load | No |
| POST | `/mobile/pairing-token` | Mint a 5-minute, single-use token for the "Pair Mobile App" QR code; returns `{ pairingToken, expiresAt, serverUrl }` | Yes |
| POST | `/mobile/pair` | Redeem a pairing token (`{ pairingToken }`) for `{ user, accessToken, refreshToken }` | No |
| GET | `/oidc/config` | Public SSO configuration for the login page (whether SSO is enabled, button text); no secrets | No |
| GET | `/oidc/login` | Start browser SSO (redirects to the identity provider; PKCE S256) | No |
| GET | `/oidc/callback` | SSO redirect URI registered with the identity provider. For browsers it completes sign-in; for mobile it renders the confirmation page | No |
| GET | `/oidc/login?client=mobile&code_challenge=<sha256 hex>` | Start SSO from the native app; the callback renders a confirmation page instead of redirecting (see [Mobile single sign-on](#mobile-single-sign-on)) | No |
| POST | `/oidc/mobile-confirm` | Form post from the confirmation page (`nonce`, `action`); `continue` redirects to `travellife://auth/oidc?code=…`, `cancel` to `travellife://auth/oidc?error=cancelled` | No (single-use nonce) |
| POST | `/oidc/mobile-exchange` | Exchange that code plus the verifier (`{ code, codeVerifier }`) for tokens | No |
| GET | `/me` | Get current authenticated user | Yes |
| POST | `/logout` | Clear refresh token cookie (works even with an expired token). CSRF-validated | No |

### Users (`/api/users`)

All user routes require authentication.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/me` | Get current user profile | Yes |
| PUT | `/settings` | Update user settings | Yes |
| PUT | `/settings/trip-types/rename` | Rename a custom trip type | Yes |
| DELETE | `/settings/trip-types/:typeName` | Delete a custom trip type | Yes |
| PUT | `/settings/categories/rename` | Rename a custom category | Yes |
| DELETE | `/settings/categories/:categoryName` | Delete a custom category | Yes |
| GET | `/immich-settings` | Get Immich integration settings | Yes |
| PUT | `/immich-settings` | Update Immich integration settings | Yes |
| GET | `/weather-settings` | Get weather integration settings | Yes |
| PUT | `/weather-settings` | Update weather integration settings | Yes |
| GET | `/aviationstack-settings` | Get AviationStack (flight tracking) settings | Yes |
| PUT | `/aviationstack-settings` | Update AviationStack settings | Yes |
| GET | `/openrouteservice-settings` | Get OpenRouteService (routing) settings | Yes |
| PUT | `/openrouteservice-settings` | Update OpenRouteService settings | Yes |
| GET | `/maps-settings` | Get maps settings | Yes |
| PUT | `/maps-settings` | Update maps settings | Yes |
| GET | `/me/calendar-token` | Get the current iCal feed token (see [Calendar](#calendar-apicalendar)) | Yes |
| POST | `/me/calendar-token` | Create or rotate the iCal feed token | Yes |
| DELETE | `/me/calendar-token` | Revoke the iCal feed token, disabling the feed | Yes |
| GET | `/smtp-settings` | Get SMTP email settings | Yes |
| PUT | `/smtp-settings` | Update SMTP email settings | Yes |
| POST | `/smtp-settings/test` | Send a test email to verify SMTP configuration | Yes |
| PUT | `/username` | Update username | Yes |
| PUT | `/password` | Update password | Yes |
| GET | `/search` | Search users by email or username (rate limited) | Yes |
| GET | `/travel-partner` | Get travel partner settings | Yes |
| PUT | `/travel-partner` | Update **your own** side of the partnership (rate limited) | Yes |
| GET | `/travel-partner/requests` | List your pending partner requests (incoming and outgoing) | Yes |
| POST | `/travel-partner/requests` | Send a travel partner request (rate limited) | Yes |
| POST | `/travel-partner/requests/{requestId}/accept` | Accept a request — recipient only | Yes |
| POST | `/travel-partner/requests/{requestId}/decline` | Decline a request — recipient only | Yes |
| DELETE | `/travel-partner/requests/{requestId}` | Cancel a request you sent — requester only | Yes |

> Note: a travel partnership auto-shares every new trip either user creates, so it needs
> both sides' consent. `PUT /travel-partner` only ever writes the caller's own row; the
> reciprocal write happens only when the recipient accepts a request.
>
> Both the send and accept calls take an optional `shareExistingTrips` boolean
> (default `false`) that back-shares the **caller's own** existing trips with the other
> user. Each side controls only its own history, so opting in can never grant you access
> to the other user's past trips. Trips flagged `excludeFromAutoShare` are skipped, and
> re-running is idempotent — existing collaborator rows are never duplicated.

> Note: `GET` and `PUT` settings endpoints accept and return only whether sensitive values (API keys, SMTP password) are set; secret values are never returned.

### Trips (`/api/trips`)

All trip routes require authentication.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/` | Create new trip | Yes |
| GET | `/` | List trips (paginated; see query params below) | Yes |
| GET | `/:id` | Get trip details | Yes |
| PUT | `/:id` | Update trip | Yes |
| DELETE | `/:id` | Delete trip | Yes |
| PUT | `/:id/cover-photo` | Set the trip's cover photo from an existing trip photo | Yes |
| POST | `/:id/cover-image` | Upload a standalone cover image (`multipart/form-data`, field `image`, max 25MB) that never enters the trip's photo library. Setting either cover-photo or cover-image clears the other | Yes |
| DELETE | `/:id/cover-image` | Remove the uploaded cover image | Yes |
| GET | `/:id/validate` | Run a trip validation / health check | Yes |
| GET | `/:id/validation-status` | Get the current validation status | Yes |
| POST | `/:id/validation/dismiss` | Dismiss a validation issue | Yes |
| POST | `/:id/validation/restore` | Restore a previously dismissed validation issue | Yes |
| POST | `/:id/duplicate` | Clone a trip | Yes |
| POST | `/:id/share` | Enable the trip's public share link (owner only) | Yes |
| POST | `/:id/share/rotate` | Rotate (invalidate and reissue) the share token | Yes |
| DELETE | `/:id/share` | Disable the public share link | Yes |

`GET /` query parameters (`backend/src/types/trip.types.ts`):

- `status` - single status or comma-separated statuses
- `archived` - `'true'` (archived only), `'false'` (default; excludes archived), or `'all'`
- `search` - search by title or description
- `page` / `limit` - pagination (see [Pagination](#pagination))
- `sort` - one of `startDate-desc`, `startDate-asc`, `title-asc`, `title-desc`, `status`
- `startDateFrom` / `startDateTo` - date range filter
- `tags` - comma-separated tag IDs
- `tripType` - single type or comma-separated types
- `seriesId` - filter by trip series

### Locations (`/api/locations`)

Locations are a flat resource. The owning trip is referenced by `tripId` in the body or path.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/` | Create location (requires `tripId` in body) | Yes |
| GET | `/visited` | Get all locations marked as "Places Visited" across the user's trips | Yes |
| GET | `/favorites` | List favorite locations across the user's trips (includes trip id/title) | Yes |
| GET | `/trip/:tripId` | List locations for a trip | Yes |
| DELETE | `/trip/:tripId/bulk` | Bulk delete locations | Yes |
| PATCH | `/trip/:tripId/bulk` | Bulk update locations | Yes |
| GET | `/categories/list` | List location categories (system + user) | Yes |
| POST | `/categories` | Create a custom location category | Yes |
| PUT | `/categories/:id` | Update a custom location category | Yes |
| DELETE | `/categories/:id` | Delete a custom location category | Yes |
| GET | `/:id` | Get a location by ID | Yes |
| PUT | `/:id` | Update a location | Yes |
| DELETE | `/:id` | Delete a location | Yes |

### Photos (`/api/photos`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/upload` | Upload a photo or video (`multipart/form-data`, max 500MB) | Yes |
| POST | `/immich` | Link a single photo from Immich | Yes |
| POST | `/immich/batch` | Link multiple photos from Immich in one request | Yes |
| GET | `/trip/:tripId` | List photos for a trip. Query: `skip`, `take`, `sortBy`, `sortOrder`, and `favoritesOnly=true` to return only starred photos (the trip highlight set); `favoritesOnly=true` is also accepted by `/trip/:tripId/unsorted` | Yes |
| GET | `/trip/:tripId/immich-asset-ids` | List Immich asset IDs already linked to a trip | Yes |
| GET | `/trip/:tripId/unsorted` | List photos not assigned to any album in a trip | Yes |
| GET | `/trip/:tripId/date-groupings` | Get date groupings (dates + photo counts) for lazy loading | Yes |
| GET | `/trip/:tripId/by-date/:date` | Get photos for a specific date (`YYYY-MM-DD`) | Yes |
| GET | `/trip/:tripId/suggest-albums` | Get smart album suggestions based on photo clustering | Yes |
| POST | `/trip/:tripId/accept-suggestion` | Create an album from an album suggestion | Yes |
| GET | `/:id` | Get a photo by ID | Yes |
| PUT | `/:id` | Update photo metadata. Send `{ "isFavorite": true \| false }` to star or unstar a photo (works for uploaded and Immich-linked photos and videos); requires edit permission on the trip | Yes |
| DELETE | `/:id` | Delete a photo | Yes |

### Photo Albums (`/api/albums`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | List all albums across all trips (supports `skip`/`take` pagination) | Yes |
| POST | `/` | Create a new album (requires `tripId` in body) | Yes |
| GET | `/trip/:tripId` | List albums for a specific trip | Yes |
| GET | `/:id` | Get an album with paginated photos (supports `skip`/`take`, `sortBy`/`sortOrder`, and `favoritesOnly=true` to page only starred photos) | Yes |
| PUT | `/:id` | Update an album | Yes |
| DELETE | `/:id` | Delete an album (does not delete the photos) | Yes |
| POST | `/:id/photos` | Add photos to an album | Yes |
| DELETE | `/:id/photos/:photoId` | Remove a photo from an album (does not delete the photo) | Yes |

### Activities (`/api/activities`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/` | Create an activity (requires `tripId` in body) | Yes |
| GET | `/trip/:tripId` | List activities for a trip | Yes |
| GET | `/:id` | Get an activity by ID | Yes |
| PUT | `/:id` | Update an activity | Yes |
| DELETE | `/:id` | Delete an activity | Yes |
| DELETE | `/trip/:tripId/bulk` | Bulk delete activities | Yes |
| PATCH | `/trip/:tripId/bulk` | Bulk update activities | Yes |

### Transportation (`/api/transportation`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/` | Create a transportation record (requires `tripId` in body) | Yes |
| GET | `/` | List all transportation for the current user | Yes |
| GET | `/trip/:tripId` | List transportation for a trip | Yes |
| POST | `/trip/:tripId/recalculate-distances` | Recalculate route distances for a trip's transportation | Yes |
| DELETE | `/trip/:tripId/bulk` | Bulk delete transportation | Yes |
| PATCH | `/trip/:tripId/bulk` | Bulk update transportation | Yes |
| GET | `/:id` | Get a transportation record by ID | Yes |
| PUT | `/:id` | Update a transportation record | Yes |
| DELETE | `/:id` | Delete a transportation record | Yes |

### Lodging (`/api/lodging`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/` | Create a lodging record (requires `tripId` in body) | Yes |
| GET | `/trip/:tripId` | List lodging for a trip | Yes |
| DELETE | `/trip/:tripId/bulk` | Bulk delete lodging | Yes |
| PATCH | `/trip/:tripId/bulk` | Bulk update lodging | Yes |
| GET | `/:id` | Get a lodging record by ID | Yes |
| PUT | `/:id` | Update a lodging record | Yes |
| DELETE | `/:id` | Delete a lodging record | Yes |

### Journal Entries (`/api/journal`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/` | Create a journal entry (requires `tripId` in body) | Yes |
| GET | `/trip/:tripId` | List journal entries for a trip | Yes |
| GET | `/:id` | Get a journal entry by ID | Yes |
| PUT | `/:id` | Update a journal entry | Yes |
| DELETE | `/:id` | Delete a journal entry | Yes |
| POST | `/:id/ai-enhance` | AI-enhance a journal entry (rate limited) | Yes |

### CSV Bulk Import (`/api/trips/:tripId/import`)

Imports locations, activities, lodging or transportation from CSV rows. The browser parses the file and maps columns; every value is re-parsed and validated here with the same Zod schemas as the single-create endpoints. Requires edit access to the trip.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/locations` | Validate (`dryRun: true`) or create locations from rows | Yes |
| POST | `/activities` | Validate (`dryRun: true`) or create activities from rows | Yes |
| POST | `/lodging` | Validate (`dryRun: true`) or create lodging stays from rows | Yes |
| POST | `/transportation` | Validate (`dryRun: true`) or create transportation legs from rows | Yes |

Body: `{ rows: [...], dryRun?: boolean, excludeRows?: number[] }`. Rows are objects of raw strings (locations: `name`, `address`, `latitude`, `longitude`, `category`, `notes`, `openingHours`, `timezone`; activities: `name`, `description`, `category`, `location`, `startTime`, `endTime`, `timezone`, `allDay`, `cost`, `currency`, `bookingUrl`, `bookingReference`, `notes`; lodging: `type`, `name`, `address`, `checkInDate`, `checkOutDate`, `timezone`, `confirmationNumber`, `bookingUrl`, `cost`, `currency`, `notes`; transportation: `type`, `fromLocationName`, `toLocationName`, `departureTime`, `arrivalTime`, `startTimezone`, `endTimezone`, `carrier`, `vehicleNumber`, `confirmationNumber`, `cost`, `currency`, `notes`). At most 500 rows and about 1 MB of JSON per request.

Response: `{ dryRun, total, valid, invalid, excluded, created, rows: [{ index, status, errors, warnings, normalized }], tripTimezoneSet, defaultTimezone }`. Row `status` is `valid`, `invalid`, `excluded` or `created`. Errors block a row; warnings (unknown category, no coordinates, duplicates, unmatched location, cost without currency, an arrival read in the departure timezone) do not. A real run creates all valid, non-excluded rows in one transaction; an unexpected failure creates nothing.

Rules worth knowing: times without an offset are wall-clock times in the row timezone, else the trip timezone, else the user timezone (never UTC unless nothing is set); `YYYY-MM-DD HH:mm` and ISO 8601 are accepted and `03/04/2026` is rejected; costs are dot-decimal strings such as `1234.50`; address-only locations are imported without coordinates and are not geocoded; no OpenStreetMap opening-hours lookup is made during import.

Lodging and transportation rules: `type` is required and must be one of the single-create values (lodging: `hotel`, `hostel`, `airbnb`, `vacation_rental`, `camping`, `resort`, `motel`, `bed_and_breakfast`, `apartment`, `friends_family`, `other`; transportation: `flight`, `train`, `bus`, `car`, `ferry`, `bicycle`, `walk`, `other`), matched ignoring case and spaces. A stay needs `name`, `checkInDate` and `checkOutDate` (a bare `YYYY-MM-DD` means midnight in the stay's zone) and check-out must be after check-in. A leg needs a `fromLocationName` or `toLocationName` (kept as text, not linked to trip locations) and its arrival may not be before its departure; the departure is read in `startTimezone` and the arrival in `endTimezone`, each falling back to the trip timezone, then the user timezone (an arrival with only a start timezone is read in it and gets a `timezone_assumed` warning). The zone used is stored on the stay or leg. Duplicates are flagged as warnings: same name and check-in for a stay; same departure, carrier and vehicle number for a leg (type and from/to names when both carrier and vehicle number are blank). Loyalty programs and place links are not imported.

### Trip Stops / Route Planner (`/api/trips/:tripId/stops`)

The ordered stops of the Multi-City Trip Planner. Reads need view access, writes need edit access.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | List the stops in route order | Yes |
| POST | `/` | Append a stop (free place or from a saved place) | Yes |
| GET | `/legs?profile=driving-car` | Road distance and time between consecutive stops | Yes |
| PUT | `/reorder` | Reorder; body is the full ordered `stopIds` | Yes |
| PUT | `/:id` | Update a stop | Yes |
| DELETE | `/:id` | Delete a stop | Yes |

`GET /legs` returns `{ profile, legs: [{ fromStopId, toStopId, mode, distanceKm, durationMinutes, routed }] }`, one entry per consecutive pair (stops minus one). `profile` is `driving-car` (default), `cycling-regular` or `foot-walking`. It uses `routing.service` and its 30-day route cache; `routed: true` means a road route (fresh or cached). `mode` is `flight` when the straight-line distance is 600 km or more (`FLIGHT_LEG_THRESHOLD_KM` in `tripStop.types.ts`), otherwise `drive`. A flight leg is never sent to ORS or the route cache and comes back with `routed: false`, the straight-line `distanceKm` and `durationMinutes: null` (no time estimate, which also saves rate-limited calls). A drive leg that cannot be routed (no `OPENROUTESERVICE_API_KEY`, an ORS error or rate limit, or a leg over 2,500 km straight-line) comes back with `routed: false`, the straight-line `distanceKm` and `durationMinutes: null`; one failed leg never fails the request. At most three uncached ORS requests run at once.

### Entity Links (`/api/trips/:tripId/links`)

Links connect any two entities (photos, locations, activities, lodging, transportation, journal entries, albums) within a trip.

An activity's or lodging's place is its own `locationId` (set through the activity/lodging endpoints), not a link. For clients that predate that, the link endpoints still show it as a synthetic `OCCURRED_AT` link with a negative `id`, and creating such a link for an activity/lodging with no place sets `locationId` instead of storing a row; deleting it (by pair or by that id) clears `locationId`.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/` | Create a link between two entities | Yes |
| POST | `/bulk` | Create multiple links from one source to many targets | Yes |
| POST | `/photos` | Link multiple photos to a target entity | Yes |
| GET | `/photos/activity-suggestions` | Suggest an activity for each photo not linked to one yet, by capture time (links nothing) | Yes |
| POST | `/photos/activity-suggestions` | Link reviewed photos to their activities: `{ links: [{ activityId, photoIds }] }` | Yes |
| POST | `/cleanup-orphans` | Remove links whose source or target no longer exists | Yes |
| GET | `/summary` | Get link counts grouped by entity type for the trip | Yes |
| GET | `/target-type/:targetType` | Get all links pointing to a given target type | Yes |
| GET | `/from/:entityType/:entityId` | Get all links originating from an entity | Yes |
| GET | `/to/:entityType/:entityId` | Get all links pointing to an entity | Yes |
| GET | `/entity/:entityType/:entityId` | Get all links involving an entity (both directions) | Yes |
| GET | `/photos/:entityType/:entityId` | Get all photos linked to an entity | Yes |
| PATCH | `/:linkId` | Update a link's relationship or notes | Yes |
| DELETE | `/entity/:entityType/:entityId` | Delete all links for an entity | Yes |
| DELETE | `/:linkId` | Delete a link by ID | Yes |
| DELETE | `/` | Delete a link by source and target (specified in body) | Yes |

### Tags (`/api/tags`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/` | Create a tag | Yes |
| GET | `/` | List the current user's tags | Yes |
| PUT | `/reorder` | Reorder tags | Yes |
| GET | `/:id` | Get a tag by ID | Yes |
| PUT | `/:id` | Update a tag | Yes |
| DELETE | `/:id` | Delete a tag | Yes |
| POST | `/link` | Link a tag to a trip | Yes |
| DELETE | `/trips/:tripId/tags/:tagId` | Unlink a tag from a trip | Yes |
| GET | `/trips/:tripId` | List tags for a specific trip | Yes |

### Companions (`/api/companions`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/` | Create a travel companion | Yes |
| GET | `/` | List the current user's companions | Yes |
| GET | `/:id` | Get a companion by ID | Yes |
| PUT | `/:id` | Update a companion | Yes |
| DELETE | `/:id` | Delete a companion | Yes |
| POST | `/:id/avatar` | Upload a companion avatar (`multipart/form-data`, max 5MB) | Yes |
| DELETE | `/:id/avatar` | Delete a companion's avatar | Yes |
| POST | `/:id/avatar/immich` | Set a companion's avatar from an Immich asset | Yes |
| POST | `/link` | Link a companion to a trip | Yes |
| DELETE | `/trips/:tripId/companions/:companionId` | Unlink a companion from a trip | Yes |
| GET | `/trips/:tripId` | List companions for a specific trip | Yes |

### Checklists (`/api/checklists`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | List checklists (optional `tripId` query param) | Yes |
| POST | `/` | Create a checklist | Yes |
| GET | `/:id` | Get a checklist with its items | Yes |
| PUT | `/:id` | Update a checklist | Yes |
| DELETE | `/:id` | Delete a checklist | Yes |
| POST | `/:id/items` | Add an item to a checklist | Yes |
| PUT | `/items/:itemId` | Update a checklist item | Yes |
| DELETE | `/items/:itemId` | Delete a checklist item | Yes |
| POST | `/initialize` | Initialize default checklists for the user | Yes |
| POST | `/auto-check` | Auto-check items based on existing trip data | Yes |
| DELETE | `/defaults` | Remove all default checklists | Yes |
| POST | `/defaults/restore` | Restore default checklists | Yes |
| GET | `/defaults/status` | Get the status of default checklists | Yes |
| POST | `/defaults/add` | Add specific default checklists by type | Yes |
| POST | `/defaults/remove` | Remove specific default checklists by type | Yes |

### Expenses & Budget (`/api/trips/:tripId/expenses`)

Trip-scoped expense tracking, plus a budget-vs-spent summary endpoint mounted alongside it.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/trips/:tripId/expenses` | Create an expense (`description`, `category`, `amount` required; `category` is one of `food`, `transportation`, `lodging`, `activities`, `shopping`, `other`) | Yes |
| GET | `/api/trips/:tripId/expenses` | List all expenses for a trip | Yes |
| GET | `/api/trips/:tripId/expenses/:id` | Get an expense by ID | Yes |
| PUT | `/api/trips/:tripId/expenses/:id` | Update an expense | Yes |
| DELETE | `/api/trips/:tripId/expenses/:id` | Delete an expense | Yes |
| POST | `/api/trips/:tripId/expenses/scan-receipt` | Read a receipt photo (multipart field `image`; JPEG/PNG/WebP/HEIC, max 10 MB, type checked from the bytes) with the user's AI model. Returns `{ merchant, amount, currency, date, category }`, each nullable (`amount` is a decimal string, `date` is `YYYY-MM-DD`, `currency` is a supported ISO 4217 code or null, never defaulted). Saves nothing and does not keep the image (the client attaches it afterwards through the receipt endpoint). 503 without an AI key, 502 on provider error, 422 when unreadable. Needs edit access; AI rate limit applies | Yes |
| POST | `/api/trips/:tripId/expenses/:id/receipt` | Attach or replace the receipt photo of an expense (multipart field `image`, same type/size checks as scan). Stores a normalised JPEG (long edge 2400 px, quality 88, EXIF stripped) under `uploads/receipts/` and deletes any previous file. Needs edit access | Yes |
| DELETE | `/api/trips/:tripId/expenses/:id/receipt` | Remove the receipt photo and delete its file. Needs edit access | Yes |

Expense objects carry `receiptPath`, `receiptMimeType`, `receiptSizeBytes`, `receiptUploadedAt` (all null when none). The file is served by the authenticated `/uploads/receipts/...` route to the trip owner and collaborators only, is never part of the public share payload, and a backup carries only its path, not the image (see Backup & Restore). On restore a receipt is re-attached only if its file is still in `uploads/receipts/`; the restore result reports `receiptsRestored` and `receiptsNotRestored`.
| GET | `/api/trips/:tripId/budget-summary` | Get budget vs. spent totals with a category breakdown | Yes |
| GET | `/api/trips/:tripId/expenses/participants` | List who an expense can be paid by or split with: the trip owner (`owner`) and the trip's companions (`companion:<id>`) | Yes |
| PUT | `/api/trips/:tripId/expenses/:id/split` | Set who paid and how the expense is split. Body: `paidBy` (participant key, or `null` to clear), `method` (`equal`, `amount` or `percentage`), `participants` (`participant` plus `amount` or `percentage`). Amounts must sum to the expense amount, percentages to 100 | Yes (edit) |
| GET | `/api/trips/:tripId/settle-up` | Per-person paid / share / balance and the payments that settle them, in the budget summary's currency | Yes |

Expenses returned by the list and detail endpoints carry `paidBy`, `splitMethod` and `splits`
(`participant`, `amount` in the expense's own currency, `percentage`). Settle-up is computed with exact
decimal arithmetic: each expense's base-currency amount is shared out in proportion to its splits, with
any odd cent placed on the largest share (lowest participant on a tie). Split expenses with no exchange
rate are excluded and listed under `unconverted`; expenses with no payer or split are listed under
`unsplit`.

Budget summary totals are converted into a single base currency using the exchange rate frozen at each
expense's own date. Amounts that could not be converted are excluded from `spent` and listed under
`conversion.unconverted` rather than summed at face value.

### Airports (`/api/airports`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Search airports by IATA/ICAO code or name (`?q=`); returns airports with a 3-letter IATA code and scheduled passenger service. Powers the airport picker used to add airports to the airports checklist | Yes |

### Calendar (`/api/calendar`)

Unauthenticated iCal subscription feed — the secret token embedded in the URL is the only credential.
The token is managed by the signed-in user through `GET/POST/DELETE /api/users/me/calendar-token`
(see Users).

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/:token` (`.ics` suffix optional) | Read-only iCalendar feed (`text/calendar`) of the token owner's trips, transportation, and lodging | No |

### Memories (`/api/memories`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/on-this-day` | Get memories (trips, photos, journal entries) from this month/day in prior years. Optional `month`/`day` query params override today's date | Yes |
| GET | `/year-in-review/:year` | Get aggregated travel statistics and highlights for a calendar year (empty aggregates for years with no data) | Yes |

### Public Sharing (`/api/public`)

The only unauthenticated data-serving surface in the app. Access control is the unguessable 64-hex-char
share token itself — every handler 404s unless a trip has that exact token and `shareEnabled` is true.
Requests are rate limited per IP to deter token guessing. Enabling, rotating, and disabling a trip's share
token is done by the trip owner via `POST/DELETE /api/trips/:id/share*` (see Trips).

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/trips/:token` | Get a sanitized, read-only view of a shared trip. Each photo carries an `isFavorite` flag; the public page shows the starred photos as a Highlights set | No |
| GET | `/trips/:token/photos/:photoId/file` | Stream a shared trip's photo binary (the authenticated `/uploads` route is not reachable without a token) | No |
| GET | `/trips/:token/photos/:photoId/thumbnail` | Stream a shared trip's photo thumbnail | No |

### Push Notifications (`/api/push`)

Web push via VAPID. Endpoints return `503` when push is not configured on the server (no VAPID keys set).

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/public-key` | Get the VAPID public key (or `null` if not configured) | Yes |
| POST | `/subscribe` | Register a web push subscription for the current user (upserts by `endpoint`) | Yes |
| DELETE | `/subscribe` | Remove a web push subscription (`{ endpoint }` in body) | Yes |
| POST | `/test` | Send a test push notification to the caller's active subscriptions | Yes |
| POST | `/mobile-token` | Register the companion app's Expo push token (`{ token, platform, deviceName? }`, upserts by token) | Yes |
| DELETE | `/mobile-token` | Remove a native push token (`{ token }`) | Yes |

Native tokens are delivered through the Expo push gateway and need no VAPID configuration:
`sendToUser` reaches a user's phones whether or not web push is set up.

### Mobile Companion (`/api/trips/:tripId`)

Endpoints added for the native companion app. All require authentication (Bearer-only clients skip CSRF).
Related native-app routes live elsewhere: pairing and SSO under [Authentication](#authentication-apiauth),
Expo push tokens under [Push Notifications](#push-notifications-apipush).

| Method | Endpoint | Description | Permission |
|--------|----------|-------------|------------|
| GET | `/mobile-sync?since=<ISO instant>` | Every entity of the trip plus its entity-link graph in one response. With `since`, only rows changed after it; `ids` and `linkIds` always list every current row so deletions can be detected. Rows use database column names (`scheduledStart`, not `departureTime`) | view |
| POST | `/tracks/batch` | Ingest up to 2000 background GPS points (`{ points: [{ latitude, longitude, recordedAt, accuracy?, altitude?, speed? }] }`). Idempotent per `(trip, user, recordedAt)` | edit |
| GET | `/tracks?date=YYYY-MM-DD&timezone=<IANA>` | The caller's own trail for one day as a GeoJSON `LineString` feature. The day is resolved in `timezone`, else the trip's zone, else the user's | view |
| POST | `/photos/infer-locations` | Match un-geotagged photos to the caller's trail by `takenAt` and propose `TAKEN_AT` links. Read-only unless `{ apply: true }` | view (edit to apply) |
| POST | `/expenses/parse-receipt` | Parse OCR text (`{ text, defaultCurrency?, dateOrder?, useLlm? }`) into `{ amount, currency, merchant, date, category, confidence, source }`. Deterministic parsing always runs; an LLM refines it when configured. Saves nothing | edit |

Two existing update schemas gained fields the app writes: `PUT /api/activities/:id` accepts
`manualOrder`, and `PUT /api/transportation/:id` accepts `actualDepartureTime`,
`actualArrivalTime`, `status`, `delayMinutes` and `seatNumber`.

### Custom Items (`/api/custom-items`)

User-defined item kinds attached to trips. All routes require authentication.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/types` | List the user's custom item types (seeds a starter set on first call) | Yes |
| POST | `/types` | Create a custom item type | Yes |
| PUT | `/types/:id` | Update a type | Yes |
| DELETE | `/types/:id` | Delete a type | Yes |
| POST | `/` | Create a custom item | Yes |
| GET | `/trip/:tripId` | List custom items for a trip | Yes |
| DELETE | `/trip/:tripId/bulk` | Bulk delete custom items | Yes |
| PATCH | `/trip/:tripId/bulk` | Bulk update custom items | Yes |
| GET | `/:id` | Get a custom item | Yes |
| PUT | `/:id` | Update a custom item | Yes |
| DELETE | `/:id` | Delete a custom item | Yes |

### Booking Deadlines

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/trips/:tripId/deadlines` | Create a deadline | Yes |
| GET | `/api/trips/:tripId/deadlines` | List a trip's deadlines | Yes |
| PUT | `/api/trips/:tripId/deadlines/:id` | Update a deadline | Yes |
| DELETE | `/api/trips/:tripId/deadlines/:id` | Delete a deadline | Yes |
| GET | `/api/deadlines/upcoming` | Undismissed deadlines due within `?days` (default 30, max 365) across all the user's trips, including overdue | Yes |

### Food Log

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/api/trips/:tripId/food-log` | Create a food log entry | Yes |
| GET | `/api/trips/:tripId/food-log` | List a trip's entries | Yes |
| PUT | `/api/trips/:tripId/food-log/:id` | Update an entry | Yes |
| DELETE | `/api/trips/:tripId/food-log/:id` | Delete an entry | Yes |
| POST | `/api/trips/:tripId/food-log/:id/photos` | Attach uploaded photos to an entry (videos rejected; per-entry cap) | Yes |
| POST | `/api/trips/:tripId/food-log/:id/photos/immich` | Attach Immich assets to an entry | Yes |
| DELETE | `/api/trips/:tripId/food-log/:id/photos/:photoId` | Detach a photo (it stays in the trip gallery) | Yes |
| GET | `/api/food-log` | Best-meals search across all trips (`?minRating=1-5`, `?orderAgain=true\|false`, `?q=`), best first | Yes |

### Emergency Info (`/api/trips/:tripId/emergency-info`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Get the trip's emergency card | Yes |
| PUT | `/` | Create or replace the trip's emergency info | Yes |
| DELETE | `/` | Delete the trip's emergency info | Yes |

### Places (`/api/places`)

Needs a signed-in user. Rate limited per user (30 searches a minute by default, `NEARBY_FOOD_RATE_LIMIT_MAX`).

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/food` | Food and drink near a point, optionally filtered for a dietary restriction | Yes |
| GET | `/search` | Find a place by name or address (OpenStreetMap Nominatim), to choose where to search | Yes |

Query parameters for `GET /api/places/food` (`backend/src/types/places.types.ts`):

- `lat` (required, -90..90) and `lng` (required, -180..180)
- `radius` - metres, 100 to 3000 (default `1000`)
- `diet` - one of `vegetarian`, `vegan`, `halal`, `kosher`, `gluten_free`, `lactose_free`, `pescetarian`
- `limit` - 1 to 100 (default `50`)

The data is OpenStreetMap, read through the Overpass API, so dietary information is only as good as the map: places nobody
has tagged for a diet have `diet: "unknown"` ("not confirmed"). With `diet`, places are ordered best match first
(`only`, `yes`, `limited`, `unknown`) then nearest, and places that say they do not cater for it are left out and counted in
`excludedCount`. Each place also carries `dietary`, everything its tags say about any diet. Results are cached for ten minutes
per area, so changing `diet` does not repeat the upstream request. Errors: `503` when the map servers are busy (retry shortly),
`502` when they are unavailable.

`GET /api/places/search?q=<text>&limit=5` (`q` 2 to 200 characters, `limit` 1 to 10) returns `{ results: [{ name, description, latitude, longitude }] }`,
best match first. Answers are cached for an hour per query; `503` when the place search service is unavailable. It shares the
food search's per-user rate limit.

### Trip comparison (`/api/trip-comparison`)

`GET /api/trip-comparison?ids=12,15,19` compares 2 to 8 distinct trips in one request (`400` otherwise). Every id must be
viewable by the caller (owner or collaborator); if any is not, the whole request is rejected with `404` naming the ids, and
none are silently dropped. The response is `{ currency, trips, locations }` with `trips` in the requested order: dates and
inclusive `days`, location, activity, photo and transportation counts, `totalDistanceKm`, and a `cost` object.

Costs reuse the budget summary and are expressed in the caller's base currency (the first trip's reporting currency when
none is set). A trip whose summary is in another currency (for example one owned by someone with a different base
currency) is restated with the latest rate using Decimal arithmetic and marked `restated`. Amounts the summary could not
convert are listed in `cost.unconverted`; a total that cannot be restated has `spent: null` and `cost.excludedTotal`.
`locations` omits places flagged `excludeFromMap` and places without coordinates.

### Search (`/api/search`)

The search endpoint is rate limited to 30 requests per minute.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | Global search across all entities | Yes |

Query parameters for `GET /api/search` (`backend/src/types/search.types.ts`):

- `q` (required) - search query string
- `type` - a single entity type to search: one of `all` (default), `trip`, `location`, `photo`, `journal`, `trip-series`. Only one value is accepted (not comma-separated). Activities, lodging, and albums are not searchable through this endpoint.
- `limit` - maximum total results (string-encoded number, default `20`)

There is no `tripId` parameter — search is always across all of the current user's trips.

### Collaboration

The collaboration router is mounted at `/api` (not `/api/collaboration` — there is no such prefix); routes
below are grouped under `/api/invitations` and `/api/trips/...`.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/invitations/token/:token` | Get invitation details by token (for invite links) | No |
| GET | `/api/invitations` | Get pending invitations for the current user | Yes |
| POST | `/api/invitations/:invitationId/accept` | Accept an invitation | Yes |
| POST | `/api/invitations/:invitationId/decline` | Decline an invitation | Yes |
| GET | `/api/trips/shared` | Get trips shared with the current user | Yes |
| GET | `/api/trips/:tripId/permission` | Get the user's permission level for a trip | Yes |
| GET | `/api/trips/:tripId/collaborators` | List collaborators for a trip | Yes |
| PATCH | `/api/trips/:tripId/collaborators/:userId` | Update a collaborator's permission level | Yes |
| DELETE | `/api/trips/:tripId/collaborators/:userId` | Remove a collaborator (or leave the trip) | Yes |
| GET | `/api/trips/:tripId/invitations` | List pending invitations for a trip | Yes |
| POST | `/api/trips/:tripId/invitations` | Send an invitation to collaborate on a trip | Yes |
| DELETE | `/api/trips/:tripId/invitations/:invitationId` | Cancel a pending trip invitation | Yes |
| POST | `/api/trips/:tripId/invitations/:invitationId/resend` | Resend a pending trip invitation | Yes |

### Immich Integration (`/api/immich`)

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/test` | Test the connection to the configured Immich instance | Yes |
| GET | `/assets` | Get the user's Immich assets (supports `page`/`size`) | Yes |
| GET | `/assets/date-range` | Get Immich assets within a date range | Yes |
| GET | `/assets/:assetId/thumbnail` | Get an asset thumbnail (proxied from Immich) | Yes |
| GET | `/assets/:assetId/original` | Get an asset's original file (proxied from Immich) | Yes |
| GET | `/assets/:assetId` | Get a single Immich asset by ID | Yes |
| GET | `/assets/:assetId/urls` | Get thumbnail and file URLs for an asset | Yes |
| POST | `/search` | Search Immich assets by metadata | Yes |
| GET | `/albums` | List the user's Immich albums | Yes |
| GET | `/albums/:albumId` | Get an Immich album with its assets | Yes |
| POST | `/assets/query` | Browse the library with server-side filters and paging (`filters`: `dateFrom`/`dateTo` as calendar days read in `timezone`, `isFavorite`, `type`, `albumId`, `text` as file name, or as a content query with `searchMode: "smart"` which calls Immich `POST /api/search/smart` (relevance order, no date ordering, query max 200 chars; empty query falls back to the metadata search; 503 "Smart search isn't available..." if Immich ML is off or the endpoint is missing; refused with 400 by both bulk-link endpoints); `page`, `size` up to 200; optional `tripId` flags `alreadyLinked`) | Yes |
| POST | `/bulk-link/preview` | Count what linking everything a filter matches to a trip would do (`matching`, `alreadyLinked`, `toLink`, capped at 5000) | Yes |
| POST | `/bulk-link/page` | Link one page (200) of a filter's matches to a trip through the batch linker; returns `nextPage` until finished. Safe to re-run | Yes |
| PUT | `/photo-albums/:albumId/link` | Link a trip photo album to an Immich album, or `{ "immichAlbumId": null }` to unlink | Yes |
| POST | `/photo-albums/:albumId/sync` | Manual pull sync: add assets in the linked Immich album that are not yet in the trip album. Never removes anything | Yes |
| GET | `/photo-albums/:albumId/export-preview` | What an export would write: Immich asset count and uploaded photos that would be skipped | Yes |
| POST | `/photo-albums/:albumId/export` | Create (or add to) an Immich album from a trip album. Requires `{ "confirm": true }`. Writes to Immich; only ever adds | Yes |

#### Immich album sync and export: behaviour

- Immich API compatibility: calls use `POST /api/search/metadata` (`page`, `size`, `withExif`, `order`, `takenAfter`/`takenBefore`, `isFavorite`, `type`, `albumIds`, `originalFileName`), `GET /api/albums/:id`, `POST /api/albums` and `PUT /api/albums/:id/assets`, plus `/api/server/ping` for the connection test. The `albumIds` search filter and `withExif` are not available on older Immich servers; sync deliberately uses `GET /api/albums/:id` instead so it never depends on them.
- Sync decides what is new by comparing asset ids, not timestamps (Immich does not expose when an asset joined an album). `immichAlbumSyncedAt` is informational.
- Assets removed from the Immich album are **not** removed from the trip album or the trip. They are counted in `notInImmichAlbum` (null when the Immich album exceeded the 5,000 asset sync cap).
- Export only adds: it never deletes or modifies Immich assets, never removes assets from an Immich album, and never uploads. Uploaded (non-Immich) photos are skipped and counted in `skippedUploaded`. If the stored key lacks permission, Immich's message comes back as a 403.
- Immich 401/403 responses are returned to the client as 403 (never 401, which the web client treats as an expired session).

### Weather

Weather endpoints are trip-scoped and mounted directly under `/api/trips`.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/trips/:tripId/weather` | Get weather data for the trip's date range | Yes |
| POST | `/api/trips/:tripId/weather/refresh` | Force-refresh weather for a specific date | Yes |
| POST | `/api/trips/:tripId/weather/refresh-all` | Force-refresh all weather data for a trip | Yes |

### Backup & Restore (`/api/backup`)

Backup and restore endpoints accept large payloads (up to 100MB). The create/restore endpoints are rate limited.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/create` | Create and download a backup (a signed JSON file of all user data; it holds file paths, not photo or receipt image bytes) | Yes |
| POST | `/restore` | Restore user data from a backup file (overwrites existing data) | Yes |
| GET | `/info` | Get backup info including entity counts and estimated size | Yes |

### AI

AI features are trip-scoped and mounted under `/api/trips/:tripId/ai`. All AI endpoints are rate limited (per-user).

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/trips/:tripId/ai/link-suggestions` | Get AI-suggested entity links for a trip | Yes |
| POST | `/api/trips/:tripId/ai/journal-summary` | Generate an AI summary of the trip's journal entries | Yes |
| POST | `/api/trips/:tripId/ai/journal-day-draft` | Draft a journal entry (title + Markdown) for one calendar day. Body `{ "date": "YYYY-MM-DD" }`; needs edit access. The date must be within the trip's dates plus one day either side (open on a side with no date); otherwise `422` naming the trip's range. Returns text only and never creates an entry. `422` if the day has nothing recorded, `503` if no AI key is configured, `502` on provider failure | Yes |

> Related: `POST /api/journal/:id/ai-enhance` (see Journal Entries) also uses AI to enhance a single journal entry.

### PDF Imports (`/api/pdf-imports`)

Upload travel documents (PDFs) and let AI extract trip data into pending entities for review. The upload and reparse endpoints are rate limited (per-user AI limiter).

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/upload` | Upload a PDF for AI parsing (`multipart/form-data`, max 25MB) | Yes |
| GET | `/pending/count` | Get the count of pending (unreviewed) extracted entities | Yes |
| GET | `/pending` | List pending extracted entities awaiting review | Yes |
| PUT | `/pending/:id` | Update a pending extracted entity before accepting | Yes |
| POST | `/pending/:id/accept` | Accept a pending entity and create the real record | Yes |
| POST | `/pending/:id/reject` | Reject a pending entity | Yes |
| GET | `/` | List the user's PDF imports | Yes |
| GET | `/:id` | Get a PDF import by ID | Yes |
| POST | `/:id/reparse` | Re-run AI parsing on an existing import | Yes |
| DELETE | `/:id` | Delete a PDF import | Yes |

### Saved Links (`/api/saved-links`)

Reference URLs kept alongside a trip. Links are user-scoped and may exist with no
trip (the "inbox"), which is why these routes are not nested under `/api/trips`.
Open Graph metadata is fetched in the background after creation, so a new link is
returned immediately with `metadataStatus: "PENDING"`.

Tracking parameters (`utm_*`, `fbclid`, `gclid`, and similar) are stripped from
the URL before it is stored. URLs resolving to internal or private addresses are
rejected with a 400.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/` | Save a link, optionally assigning it to a trip | Yes |
| GET | `/` | List saved links; `?tripId=<id>` or `?tripId=none` for the inbox | Yes |
| GET | `/inbox-count` | Count of links not yet assigned to a trip | Yes |
| GET | `/:id` | Get a saved link by ID | Yes |
| PATCH | `/:id` | Update a link; `tripId: null` returns it to the inbox | Yes |
| DELETE | `/:id` | Delete a link and any entity links pointing at it | Yes |
| DELETE | `/bulk` | Delete several links by `{ ids: [] }`; all-or-nothing | Yes |
| DELETE | `/inbox` | Delete every link not assigned to a trip | Yes |
| POST | `/:id/refresh-metadata` | Re-scrape Open Graph metadata | Yes |
| GET | `/api/trips/:tripId/saved-links` | List a trip's links (visible to collaborators) | Yes |

Saved links participate in the entity-linking system as `SAVED_LINK`, so they can
be attached to activities, lodging, locations, and the rest via
`/api/trips/:tripId/links`.

Links also arrive by email. A background job polls a configured IMAP mailbox, and
messages from a recognised sender have their URLs captured as saved links with
`source: "EMAIL"` and no trip, landing in the inbox. There is no endpoint for
this — it is cron-driven — but the trusted-sender list is managed here:

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/users/link-ingest` | Get the ingest mailbox and trusted sender list | Yes |
| PUT | `/api/users/link-ingest` | Replace the trusted sender list (max 20) | Yes |

### Flight Tracking

Flight tracking endpoints are mounted under `/api` and scoped to transportation or trips. They use the AviationStack API.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/transportation/:transportationId/flight-status` | Get real-time flight status for a transportation record | Yes |
| PUT | `/api/transportation/:transportationId/flight-status` | Manually update flight tracking info (gate, terminal, etc.) | Yes |
| POST | `/api/trips/:tripId/flights/refresh` | Refresh flight status for all flights in a trip | Yes |

### Packing Suggestions

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/trips/:tripId/packing-suggestions` | Get packing suggestions based on the trip's weather data | Yes |

### Travel Documents (`/api/travel-documents`)

Manage passports, visas, and other travel documents, including expiry alerts.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | List the user's travel documents | Yes |
| POST | `/` | Create a travel document | Yes |
| GET | `/alerts` | List documents expiring within their alert window | Yes |
| GET | `/primary-passport` | Get the user's primary passport (or null) | Yes |
| GET | `/trip/:tripId/check` | Check document validity for a specific trip | Yes |
| GET | `/:id` | Get a travel document by ID | Yes |
| PUT | `/:id` | Update a travel document | Yes |
| DELETE | `/:id` | Delete a travel document | Yes |

### Loyalty Programs (`/api/loyalty-programs`)

Manage frequent-flyer and hotel-loyalty memberships. User-scoped: every endpoint only sees the caller's own programs, and the membership number is never returned by trip, collaborator or public-share endpoints. Transportation and lodging records reference a program through a nullable `loyaltyProgramId` (the program must belong to the user saving the record); deleting a program clears that reference.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | List the user's loyalty programs | Yes |
| POST | `/` | Create a program (`name`, `type`, `providerName`, `membershipNumber` required; optional `providerCode`, `alliance`, `aliases`, `tier`, `pointsBalance`, `notes`) | Yes |
| GET | `/:id` | Get a program by ID | Yes |
| PUT | `/:id` | Update a program | Yes |
| DELETE | `/:id` | Delete a program | Yes |

`type` is one of `AIRLINE`, `HOTEL`, `RAIL`, `CAR_RENTAL`, `OTHER`.

### Language Phrases

Phrase data endpoints are public; trip-language management endpoints require authentication.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/api/languages` | List all available languages with phrase counts | No |
| GET | `/api/phrases/categories` | List phrase categories | No |
| GET | `/api/phrases/:languageCode` | Get all phrases for a language | No |
| GET | `/api/phrases/:languageCode/category/:category` | Get phrases for a language filtered by category | No |
| GET | `/api/trips/:tripId/languages` | Get languages selected for a trip | Yes |
| POST | `/api/trips/:tripId/languages` | Add a language to a trip | Yes |
| DELETE | `/api/trips/:tripId/languages/:languageCode` | Remove a language from a trip | Yes |
| GET | `/api/trips/:tripId/phrases` | Get phrases for all languages selected for a trip | Yes |

### User Invitations (`/api/user-invitations`)

Invite people who do not yet have an account. The public endpoints rely on the cryptographically random invitation token plus rate limiting in place of CSRF protection.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/email-status` | Check whether email sending is configured | Yes |
| GET | `/` | List invitations sent by the current user | Yes |
| POST | `/` | Send a new user invitation (rate limited) | Yes |
| DELETE | `/:invitationId` | Cancel a pending invitation | Yes |
| POST | `/:invitationId/resend` | Resend a pending invitation (rate limited) | Yes |
| GET | `/token/:token` | Get invitation details by token (rate limited) | No |
| POST | `/accept` | Accept an invitation and create an account (rate limited) | No |
| POST | `/decline/:token` | Decline an invitation (rate limited) | No |

### Trip Series (`/api/trip-series`)

Group related trips into an ordered series.

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| GET | `/` | List the user's trip series | Yes |
| POST | `/` | Create a trip series | Yes |
| GET | `/:id` | Get a trip series by ID | Yes |
| PUT | `/:id` | Update a trip series | Yes |
| DELETE | `/:id` | Delete a trip series | Yes |
| POST | `/:id/trips` | Add a trip to a series | Yes |
| DELETE | `/:id/trips/:tripId` | Remove a trip from a series | Yes |
| PUT | `/:id/reorder` | Reorder the trips within a series | Yes |

## Response Format

Most responses follow this structure:

```json
{
  "status": "success",
  "data": { },
  "message": "Optional message"
}
```

Some endpoints return binary content directly (e.g. image proxies, backup ZIP downloads) rather than the JSON envelope.

### Success Response

```json
{
  "status": "success",
  "data": {
    "trip": {
      "id": 1,
      "title": "Japan 2024"
    }
  }
}
```

### Error Response

A generic error response contains a `status` and a `message`:

```json
{
  "status": "error",
  "message": "Internal server error"
}
```

Validation errors (Zod) additionally include a `fields` array naming the invalid fields:

```json
{
  "status": "error",
  "message": "Validation failed",
  "fields": ["title", "startDate"]
}
```

Unique constraint violations include the offending `field`:

```json
{
  "status": "error",
  "message": "A record with this value already exists",
  "field": "email"
}
```

> The error response does not include a machine-readable `code` field.

## Common Status Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request (validation error) |
| 401 | Unauthorized (invalid/missing token) |
| 403 | Forbidden (insufficient permissions) |
| 404 | Not Found |
| 413 | Payload Too Large (e.g. oversized upload) |
| 429 | Too Many Requests (rate limit exceeded) |
| 500 | Internal Server Error |
| 503 | Service Unavailable (e.g. database down, Immich unreachable) |

## Pagination

Album endpoints support `skip`/`take` pagination:

```text
GET /api/albums?skip=0&take=30
GET /api/albums/:id?skip=0&take=40
```

Trip listing uses page-based pagination instead — `page`/`limit` (default `limit` 20) — and the response
body includes the paging metadata alongside the results:

```json
{
  "trips": [ ],
  "total": 42,
  "page": 1,
  "limit": 20,
  "totalPages": 3
}
```

## Filtering

Several endpoints support filtering via query parameters:

```text
GET /api/trips?status=completed&search=japan
GET /api/checklists?tripId=5
GET /api/search?q=tokyo&type=trip&limit=20
```

## File Uploads

Photo uploads use `multipart/form-data` and accept the `photo` field:

```bash
curl -X POST \
  -H "Authorization: Bearer <token>" \
  -F "photo=@/path/to/image.jpg" \
  -F "tripId=1" \
  -F "caption=My photo" \
  http://localhost:5000/api/photos/upload
```

Other multipart uploads:

- Companion avatars: `POST /api/companions/:id/avatar`, field `avatar` (max 5MB)
- PDF imports: `POST /api/pdf-imports/upload`, field `file` (max 25MB, PDF only)
- Backup restore: `POST /api/backup/restore`, field `backup`

## Rate Limiting

Rate limits are applied per IP or per user depending on the endpoint:

- General API: 1000 requests per 15 minutes per IP
- Auth routes (`/api/auth/*`): 15 requests per 15 minutes per IP
- Silent refresh (`/api/auth/silent-refresh`): 60 requests per 15 minutes per IP
- Search (`/api/search`): 30 requests per minute per IP
- Backup create/restore, AI endpoints, PDF import upload/reparse, and sensitive user endpoints have their own dedicated limiters.

Rate-limited requests receive a `429 Too Many Requests` response.

> No endpoint in the backend returns `204 No Content`. Deletes return `200` with the standard
> `{ status: 'success', message }` envelope, same as any other successful response.

## Swagger Documentation

Interactive API documentation generated from the route definitions is available at:

```text
http://localhost:5000/api-docs
```

## Related Documentation

- [Backend Architecture](../architecture/BACKEND_ARCHITECTURE.md) - Server-side implementation details
- [Database Schema](../architecture/DATABASE_SCHEMA.md) - Data model reference
