# Travel Life Mobile Companion App Plan

**Created**: 2026-11-11  
**Status**: Implemented for Android — see [Implementation Status](#9-implementation-status)  
**Priority**: High  
**Target Platforms**: iOS & Android  
**Tech Stack**: React Native + Expo (TypeScript), `expo-sqlite`, TanStack Query, Zustand  
**Role**: On-the-Go "During Trip" Companion & Live Itinerary Editor  

---

## 1. Executive Summary & Product Vision

While the Travel Life web application excels at **deep pre-trip research and post-trip retrospectives**, real trips rarely go 100% according to plan. Trains get delayed, rain forces an indoor swap, or you stumble across a great café and spend the afternoon there.

The **Travel Life Companion App** is purpose-built for the **on-trip experience**—combining **glanceable context**, **rapid capture**, **live itinerary editing**, and **first-class entity linking (`EntityLink`)** so travelers can adapt their itinerary in real time, create and edit any trip entity on the spot, and weave photos, locations, activities, transit, lodging, links, and journals together—even while completely offline.

### Core Design Philosophy

1. **Glanceable Context**: Open the app (or check the lock/home screen widget) and immediately see *what is next*, local vs. home time, countdowns, confirmation codes, and one-tap transit directions.
2. **Live Itinerary Adaptation**: Reschedule activities, shift times (`+30m`, `+1h`, `Move to Tomorrow`), reorder stops via drag-and-drop, create unplanned locations/activities using current GPS, or swap in a saved link when plans change on the ground.
3. **Connected Entities (`EntityLink`)**: Because Travel Life uses a unified polymorphic `EntityLink` system (`OCCURRED_AT`, `TAKEN_AT`, `DOCUMENTS`, `FEATURED_IN`, `PART_OF`, `RELATED`), the mobile app makes linking effortless—with smart GPS/time auto-linking and one-tap "Create & Link" flows.
4. **Passive Intelligence**: Background GPS track logging and camera-roll photo matching quietly enrich the trip timeline and PostGIS database without manual data entry.
5. **Offline-First by Default**: Active and upcoming trips, entity links, travel documents, emergency cards, and local norms are mirrored into an on-device SQLite database so every read, create, edit, and link operation works with zero signal.

---

## 2. Monorepo & Code Sharing Architecture

To maximize reuse with the existing `backend/` and `frontend/` TypeScript codebases while following React Native monorepo best practices (`monorepo-native-deps-in-app`, `monorepo-single-dependency-versions`), the repository will adopt an npm/pnpm workspace layout:

```
travel-life/
├── packages/
│   └── shared/                 # Pure TypeScript shared package (no DOM or Native deps)
│       ├── src/
│       │   ├── types/          # Shared API DTOs & entity interfaces
│       │   ├── validation/     # Shared Zod schemas
│       │   ├── constants/      # countryFacts.ts (123 countries), EntityLink rules
│       │   └── utils/          # openingHours parser, mapsDeepLinks, FX helpers
├── backend/                    # Express + Prisma + PostGIS API
├── frontend/                   # React 19 + Vite Web App / PWA
└── mobile/                     # Expo (React Native) Companion App (iOS & Android)
    ├── app/                    # Expo Router v4 file-based navigation
    ├── targets/                # Native iOS WidgetKit & Share Extension targets
    ├── src/
    │   ├── components/         # Mobile UI components & EntityLinkPicker
    │   ├── db/                 # expo-sqlite schema, migrations, and queries
    │   ├── sync/               # Offline outbox queue & causal ID remapping engine
    │   ├── tasks/              # Background GPS & Media Library sync tasks
    │   └── stores/             # Zustand state stores
    └── app.config.ts           # Expo Config Plugins (Widgets, Share Intent, Location)
```

### What Moves to `packages/shared`

| Module | Current Location | Purpose in Companion App |
| :--- | :--- | :--- |
| **API & Entity Types** | `frontend/src/types/` & `backend/src/types/` | Shared TypeScript interfaces and Zod validation schemas for Trips, Locations, Activities, Transportation, Lodging, Expenses, Food Logs, and EntityLinks |
| **Entity Link Helpers** | `backend/src/services/entityLink.service.ts` | Shared `EntityType`, `LinkRelationship`, and `getDefaultRelationship(sourceType, targetType)` logic |
| **Country Facts & Emergency Data** | `frontend/src/constants/countryFacts.ts` | Offline Emergency Card (#111) and Local Norms Card (#113) (123 countries, plug types, tipping, emergency numbers) |
| **Maps Deep Links** | `frontend/src/lib/mapsDeepLinks.ts` | Pure URL builders for Apple Maps, Google Maps, Citymapper, Uber, and Lyft (#112) |
| **Opening Hours Evaluator** | `backend/src/services/openingHours.service.ts` | Client-side, offline timezone-aware check ("Is this location open right now?") (#102) |

---

## 3. Core Mobile Features & Screen Architecture

Navigation uses **Expo Router** with native bottom tabs (`react-native-bottom-tabs` / native stack navigators) and a central **Quick Capture & Create (`+`)** action button.

### 3.1 Tab 1: "Today" Mode (On-Trip Command Center — Backlog #117)

- **Live Header**: Dual clock (Destination Time vs. Home Time), current weather badge, and budget burn-rate pill (#106).
- **Hero "Next Up" Card**:
  - Real-time countdown to the next flight, train, check-in, or activity.
  - Flight status badge (Gate, Terminal, Baggage Claim, Delay status via `aviationstack.service.ts`).
  - One-tap copy for confirmation numbers and local-language address display (for showing to taxi drivers).
  - One-tap **Directions** button launching the user's `preferredMapsApp` (#112).
  - Live opening-hours indicator (`Open until 18:00` / `Closed soon`) (#102).
- **Interactive Chronological Day Timeline**:
  - Virtualized with `@shopify/flash-list` showing today's sequence of lodging, transit, activities, custom items, and linked photos/meals/locations.
  - **Swipe & Long-Press Itinerary Adjustments**:
    - **Quick Time Shift**: Nudge an activity's `startTime`/`endTime` (`+30m`, `+1h`, `Move to Tomorrow`, or `Convert to All-Day`) when running ahead or behind schedule.
    - **Drag-to-Reorder**: Updates `Activity.manualOrder` directly on the timeline.
    - **Actual vs. Scheduled Transit**: One tap on a `Transportation` leg to log `actualStart` / `actualEnd`, update `status` (`on_time`, `delayed`, `cancelled`), or record `delayMinutes`.
- **On-Trip Utilities Row**:
  - **Where I Parked (#123)**: Drop a GPS pin + photo + optional parking meter countdown timer.
  - **Quick Phrasebook**: AI-generated or cached local phrases for the destination country.

### 3.2 Full Entity Creation, Editing & Linking System

Plans change constantly while traveling. The companion app provides native, mobile-optimized create/edit sheets for every core trip entity, complete with **polymorphic Entity Linking (`EntityLink`)**:

#### Supported Create & Edit Entities on Mobile

| Entity Type | On-Trip Creation & Editing Capabilities |
| :--- | :--- |
| **Activity** (`ACTIVITY`) | Create/edit unplanned or planned activities, category picker (with user's custom emojis), `startTime`/`endTime`/`allDay`, timezone, cost + currency, booking reference/URL, sub-activities (`parentId`), and notes. |
| **Location** (`LOCATION`) | Create via **"Use Current GPS Location"**, interactive map pin-drop, or Nominatim search; edit name, address, category, `visitDatetime`, `visitDurationMinutes`, `openingHours`, `isFavorite` star, and parent location (`parentId`). When created offline by GPS, reverse-geocodes address automatically once back online. |
| **Transportation** (`TRANSPORTATION`) | Log ad-hoc transit (train, bus, ferry, metro, taxi/rideshare, flight) or edit existing legs; pick `startLocationId`/`endLocationId`, scheduled vs. actual times, seat/reference numbers, cost, and flight tracking. |
| **Lodging** (`LODGING`) | Add or update hotels/hostels/Airbnbs, check-in/out dates, confirmation numbers, address, cost, and linked `Location`. |
| **Saved Link & Custom Item** (`SAVED_LINK`, `CUSTOM_ITEM`) | Add links or custom timeline items; includes a one-tap **"Promote to Activity / Location"** action when you decide to visit a saved link during the trip. |
| **Journal, Expense & Food Log** (`JOURNAL_ENTRY`, `TripExpense`, `FoodLogEntry`) | Full CRUD with markdown notes, mood/weather, multi-currency FX snapshots (#96), companion expense splits (#97), and 1–5 star dish ratings (#121). |

#### First-Class Polymorphic Entity Linking (`EntityLink`)

In Travel Life, associations between entities (such as which `Location` an `Activity` or `Lodging` occurs at, which `Photo`s or `SavedLink`s belong to an `Activity`, or which entities a `JournalEntry` documents) are stored in the `EntityLink` table. The companion app makes entity linking a core part of every workflow:

1. **Unified "Linked Items" Section on Every Entity Sheet**:
   - Displays all incoming and outgoing links grouped by type (`LOCATION`, `ACTIVITY`, `LODGING`, `TRANSPORTATION`, `PHOTO`, `JOURNAL_ENTRY`, `PHOTO_ALBUM`, `SAVED_LINK`, `PDF_IMPORT`, `CUSTOM_ITEM`) with relationship badges (`OCCURRED_AT`, `TAKEN_AT`, `DOCUMENTS`, `FEATURED_IN`, `PART_OF`, `RELATED`).
   - Tap any linked pill to navigate directly to that entity, or swipe to unlink/edit link notes.
2. **Smart Context Auto-Linking (Zero-Tap Defaults)**:
   - When creating a new `Photo`, `FoodLogEntry`, `JournalEntry`, or `Activity` during an active trip, the app inspects current device time and GPS coordinates against the local SQLite database:
     - Automatically suggests (or pre-attaches) `OCCURRED_AT` / `TAKEN_AT` links to the `Location` within 150m.
     - Automatically suggests linking to the `Activity` or `Lodging` currently happening on the timeline.
   - Relationship types default automatically using the shared `getDefaultRelationship` rules (`PHOTO` → `LOCATION` = `TAKEN_AT`, `ACTIVITY`/`LODGING` → `LOCATION` = `OCCURRED_AT`, `JOURNAL_ENTRY` → `*` = `DOCUMENTS`, etc.), with an option to override.
3. **Inline "Create & Link" Flow**:
   - Inside the `EntityLinkPicker` bottom sheet (e.g., when adding a `LOCATION` link to a new `Activity` you just spontaneously started), the user can either search/select an existing trip entity **or** tap **"+ Create New Location Here & Link"**.
   - This creates both the target entity and the `EntityLink` in a single atomic SQLite transaction—even offline.
4. **Bulk Photo & Entity Linking**:
   - Multi-select photos from the trip gallery (or from the Camera Roll Auto-Sync review bar) and bulk-link them to a `LOCATION`, `ACTIVITY`, `LODGING`, or `JOURNAL_ENTRY` via `bulkLinkPhotos` / `bulkCreateLinks`.

### 3.3 Central Action: Quick Capture & Create Sheet (`+` Button)

A native bottom sheet accessible from anywhere in the app (and via home screen shortcuts):

1. **New Activity / Spontaneous Stop**: Creates an `Activity` (and optional GPS `Location` + `OCCURRED_AT` `EntityLink`) stamped at the current time.
2. **New Location Pin ("I'm Here")**: Drops a `Location` at current GPS coordinates, stars as favorite if desired, and links to the current day's timeline.
3. **Snap / Log Photo (#66)**: Opens camera or picker, extracts EXIF GPS/time, auto-links (`TAKEN_AT` / `RELATED`) to the active `Activity` and `Location`, and queues for upload.
4. **Scan Receipt / Add Expense (#122, #96, #97)**:
   - Camera scan extracts merchant, date, total amount, and currency (via on-device Apple Vision / Google ML Kit Text Recognition, with optional LLM refinement when online).
   - Pick `paidBy` companion and split mode (Equal / Custom / Percentage) for group trips (#97).
   - Optionally updates or links to the corresponding `Activity` or `Lodging` cost.
5. **Log a Meal (#121)**: 5-star rating, dish name, photo, "Order Again?" toggle, linked directly to the dining `Activity` and `Location`.
6. **Quick Journal / Voice Note (#120)**: Speak or type a quick note with current mood and weather, with one-tap `DOCUMENTS` entity linking to today's locations, activities, and photos.

### 3.4 Tab 2: Map & Footprints (Offline Map + GPS Tracker)

- **Native Vector Map** (`@rnmapbox/maps` or `react-native-maps` with offline tile packs) displaying:
  - Today's pins color-coded by category, plus starred Favorite Places (#12) and Wishlist pins (#98).
  - Live recorded GPS breadcrumb trail for the day.
  - **Long-Press on Map**: Drop a pin anywhere to create a new `Location` or `Activity` at those coordinates and link it into the itinerary.
  - **"Near Me Now" Filter**: Shows saved locations, unscheduled wishlist spots, and open restaurants within walking distance so you can easily pivot plans.

### 3.5 Tab 3: Full Trip Itinerary, Entities & Checklists

- **Day-by-Day & Entity Browser**:
  - Switch between **Day-by-Day Timeline** (with drag-and-drop reordering and time-shift controls) and **By-Type Tabs** (Activities, Locations, Transit, Lodging, Photos, Saved Links, Expenses, Food Log, Journals).
  - Tap **"Swap / Add from Saved Links or Unscheduled"** on any day to pull an unscheduled activity or saved link into today's plan.
- **Interactive Packing & Pre-Trip Checklists (#9, #119)** with haptic check-off and offline sync.
- **Pending Review Queue (`PendingEntity`)**: Accept, edit, or reject entities extracted from PDF imports or the Native Share Sheet, and link them on acceptance.

### 3.6 Tab 4: Travel Vault & Emergency (Backlog #110, #111, #113)

Protected by optional FaceID / TouchID / Biometrics (`expo-local-authentication`):

- **Travel Day Document Vault (#110)**: Offline-cached boarding passes (PDF/PKPass/barcodes with auto-max screen brightness), hotel confirmations, visa PDFs, and passport details ordered by what is needed next.
- **Emergency Card (#111)**: Destination police/ambulance/fire numbers, embassy contact, travel insurance policy & 24/7 assistance phone (one-tap dial), and companion allergies/medical notes.
- **Local Norms Card (#113)**: Plug adapters, voltage/frequency, tap-water safety, tipping customs, and driving side.

---

## 4. Deep Native Phone Capabilities

These five capabilities justify a dedicated native app alongside the existing PWA:

### 4.1 Background GPS Track Logging (Backlog #43 & #101)

- **How it works**: Uses `expo-location` + `expo-task-manager` with `startLocationUpdatesAsync` configured for significant-change and adaptive distance-filter tracking (`distanceInterval: 25m`, `deferredUpdatesInterval: 60s`) to minimize battery drain (< 4% per day).
- **Auto-Activation**: Optional setting to automatically start recording during an `In Progress` trip's date window and pause when stationary at night (or at the active Lodging coordinates).
- **Value in Travel Life**:
  1. Uploads compact GeoJSON/GPX batches to PostGIS, giving `DayMiniMap` on web and mobile a true route line.
  2. Powers **Photo Location Inference (#101)**—photos taken with a DSLR or without EXIF GPS are automatically geotagged by matching `takenAt` against the recorded GPS breadcrumb timestamps.
  3. Suggests **"Unlogged Stops"**: If you spent 45+ minutes at a spot not on your itinerary, the app can prompt: *"Looks like you stopped at Pike Place Market (14:10–15:05) — Add to Today's Itinerary?"*

### 4.2 Home Screen & Lock Screen Widgets (iOS WidgetKit / Android Glance)

Built via an Expo Config Plugin (`react-native-widget-extension` / `@bittingz/expo-widgets`) reading from a shared App Group (`UserDefaults` / SQLite on iOS) and `SharedPreferences` on Android:

1. **"Next Up" Itinerary Widget (Small & Medium)**: Shows the next event title, time, countdown, gate/confirmation code, and deep-links straight to Directions.
2. **Flight / Trip Countdown Widget (Lock Screen & Home Screen)**: Days/hours until departure or live flight gate/departure countdown.
3. **Quick Capture Control Widget**: One-tap buttons for New Stop/Activity, Camera, Receipt Scan, and Voice Note.

### 4.3 Native Share Sheet Extension (iOS Share Extension / Android Intent Filter)

Allows sharing from Safari, Chrome, Instagram, TikTok, Gmail, Apple/Google Maps, or Files directly into Travel Life (`expo-share-intent`):

- **Share a URL**: Saves to the trip's `SavedLink` inbox **and** offers an immediate `"Link to..."` picker to attach an `EntityLink` (`RELATED`) to an existing `Activity`, `Location`, or `Lodging`.
- **Share a Booking PDF**: Uploads to `/api/pdf-imports` to extract flights, hotels, or activities into `PendingEntity` (#69).
- **Share a Google/Apple Maps Place**: Parses coordinates/place name and lets the user immediately create a `Location` + scheduled `Activity` (with `OCCURRED_AT` `EntityLink`) or save to Wishlist (#98).
- **Share Photos**: Queues shared images directly to the active trip's photo library with an inline `EntityLink` target picker.

### 4.4 Camera Roll Auto-Sync & Smart Auto-Linking

- **Smart Trip Album Watcher**: Using `expo-media-library`, detects photos taken on the phone whose creation timestamp falls within the active trip's `startDate`–`endDate`.
- **Review, Upload & Auto-Link Bar**: Displays a banner (*"24 new photos from today — Tap to review & link"*). Groups photos by timestamp/GPS cluster and proposes automatic `TAKEN_AT` (`LOCATION`) and `RELATED` (`ACTIVITY`) `EntityLink`s based on today's itinerary before uploading.
- **Immich Compatibility**: If the user has Immich configured (`immichApiUrl`), the app can either upload directly to Travel Life or link existing Immich assets by EXIF timestamp/checksum to prevent duplicates.

### 4.5 Receipt Scanner & OCR to Multi-Currency Expense (Backlog #122)

- Uses native document scanner camera UI (auto-edge crop, perspective correction) + on-device text recognition.
- Parses amount, currency symbol/ISO code, date, and merchant name offline; if online and LLM is enabled, optionally refines line items and category (`Dining`, `Transit`, `Lodging`, `Shopping`).
- Opens a pre-filled confirmation sheet wired into `TripExpense` and multi-currency FX conversion (#96), with an option to attach the cost directly to today's matching `Activity` or `Lodging`.

---

## 5. Offline-First & Synchronization Architecture (Including `EntityLink` Graph Resolution)

Unlike browser IndexedDB (which iOS Safari can evict under storage pressure), the mobile app uses **`expo-sqlite`** for deterministic, transactional persistence alongside **`expo-file-system`** for media and document files.

### Key Sync & Causal Ordering Rules

1. **Polymorphic Local ID Remapping (`local_<uuid>` → `Int`)**:
   - When the user creates entities and links them while offline, both entities and `entity_links` rows use `local_<uuid>` string keys in SQLite.
   - The Outbox Queue replays mutations in **topological/causal order**:
     1. Parent `Location`s and `PhotoAlbum`s
     2. Child `Location`s (`parentId`), `Lodging`, `Transportation` (`startLocationId`, `endLocationId`), and `Activity` (`parentId`)
     3. `JournalEntry`, `SavedLink`, `CustomItem`, `FoodLogEntry` (`activityId`, `locationId`), `TripExpense`
     4. `Photo` multipart uploads (yielding server `photo.id`)
     5. **`EntityLink` creations/updates** (`sourceId` and `targetId` are rewritten in the outbox payload from `local_<uuid>` to the newly assigned server integer IDs before calling `/api/trips/:tripId/links`).
2. **Optimistic Offline Edits & Conflict Resolution**:
   - Editing an existing entity's time, location link, or notes offline stores a `baseUpdatedAt` timestamp on the outbox mutation.
   - If a trip collaborator edited the same `Activity` while the phone was offline, a field-level merge applies non-overlapping changes automatically (e.g., one user edited `notes` while another shifted `startTime`), or surfaces a clean 2-way comparison sheet on conflict.
3. **Delta Sync Pull**: Polling or push-triggered sync requests updated entities and `entity_links` for the active trip to minimize cellular data while roaming.

---

## 6. Backend Prerequisites & API Enhancements

The existing Express backend in `backend/src/` already covers ~90% of the required CRUD and `entityLink` endpoints. Four targeted backend additions are needed to support a native mobile client cleanly:

### 6.1 Mobile Authentication & CSRF Bypass for Bearer Tokens

- **Current State**:
  - `authController.login` sets `refreshToken` exclusively in an `httpOnly` cookie and only returns `accessToken` in the JSON body.
  - `validateCsrf` in `backend/src/security/csrf.ts` requires a signed double-submit cookie (`csrf-token` cookie + `x-csrf-token` header bound to `req.cookies.refreshToken`) on all `POST`/`PUT`/`PATCH`/`DELETE` requests.
- **Required Change**:
  1. **Mobile Token Delivery**: When a client sends `X-Client-Platform: mobile` on `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`, or `/api/auth/oidc/mobile-exchange`, return `refreshToken` in the JSON response body so the mobile app can store both tokens in hardware-backed `expo-secure-store`.
  2. **CSRF Middleware Adjustment**: In `validateCsrf`, skip cookie-CSRF enforcement when **both** (a) the request carries an explicit `Authorization: Bearer <token>` header AND (b) no session cookies (`refreshToken`) are present on the request. (CSRF exploits ambient browser cookies; explicit `Authorization` headers from native clients cannot be forged cross-site).
  3. **QR Code Server Pairing**: Add a *"Pair Mobile App"* button in the web app's Settings page that displays a QR code containing `{ serverUrl, pairingToken }` (a 5-minute, single-use token) so self-hosted users can log in and configure their server URL + OIDC/account in one scan.

### 6.2 Native Push Notifications (`MobilePushToken`)

- **Current State**: `PushSubscription` in `schema.prisma` stores Web Push VAPID endpoints (`endpoint`, `p256dh`, `auth`).
- **Required Change**: Add a `MobilePushToken` model (or extend `PushSubscription` with `platform: 'web' | 'ios' | 'android'` and `expoPushToken`) and extend `pushNotification.service.ts` to dispatch to both Web Push and the Expo Push / FCM / APNs gateway for flight alerts, booking deadlines (#116), and trip start reminders.

### 6.3 GPS Track Storage & Photo Inference Endpoints (Backlog #43 & #101)

- **New Prisma Model**: `TripTrackPoint` (or daily `TripTrack` with PostGIS `geography(LineStringZ, 4326)` + timestamps array).
- **New Endpoints**:
  - `POST /api/trips/:tripId/tracks/batch` — ingest batched background GPS points from the phone, deduplicated by timestamp.
  - `GET /api/trips/:tripId/tracks?date=YYYY-MM-DD` — return GeoJSON LineString for `DayMiniMap`.
  - `POST /api/trips/:tripId/photos/infer-locations` — match un-geotagged photos against `TripTrack` and itinerary items (#101) and propose `TAKEN_AT` `EntityLink`s.

### 6.4 Receipt OCR Assist Endpoint (Backlog #122)

- **New Endpoint**: `POST /api/trips/:tripId/expenses/parse-receipt` — accepts raw OCR text (extracted on-device for speed/privacy) or a receipt image and uses `llm.service.ts` (if enabled) or deterministic regex heuristics to return `{ amount, currency, merchant, date, category, confidence }`.

---

## 7. Phased Implementation Roadmap

### Phase 1: Foundation, Monorepo & Server Pairing (Weeks 1–2)

- [ ] Extract `packages/shared` (Zod schemas, DTOs, `EntityLink` relationship helpers, `countryFacts.ts`, `mapsDeepLinks.ts`, `openingHours` evaluator).
- [ ] Update backend auth (`auth.controller.ts` & `csrf.ts`) for `X-Client-Platform: mobile`, token rotation in `expo-secure-store`, and QR code pairing endpoint.
- [ ] Initialize `mobile/` with Expo SDK 52+, TypeScript, Expo Router v4, NativeWind v4 (matching the web app's Tailwind navy/gold palette in `STYLE_GUIDE.md`), and TanStack Query.
- [ ] Build Server Onboarding screen (URL input + health check + QR pairing scanner + OIDC `expo-auth-session` & password login).

### Phase 2: Offline SQLite Engine, "Today" Mode & Travel Vault (Weeks 3–4)

- [ ] Implement `expo-sqlite` schema mirroring all trip entities, `entity_links`, and the causal outbox mutation queue (with `local_<uuid>` → server `Int` remapping across foreign keys and polymorphic `EntityLink` endpoints).
- [ ] Build **Today Mode (#117)**: Next-Up hero card, dual timezone clock, flight status widget, opening-hours badge (#102), and one-tap Directions (#112).
- [ ] Build **Travel Day Document Vault (#110)**, **Emergency Card (#111)**, and **Local Norms Card (#113)** with offline file caching and biometric lock.
- [ ] Build Active Trip day-by-day timeline (`@shopify/flash-list`) and interactive **Checklists**.

### Phase 3: Live Itinerary Editing, Entity CRUD & Polymorphic Entity Linking (Weeks 5–6)

- [ ] Build mobile Create & Edit sheets for **Activity**, **Location** (with current GPS & map pin-drop), **Transportation** (with actual/delayed status updates), **Lodging**, **SavedLink**, **CustomItem**, and **JournalEntry**.
- [ ] Build the universal **`EntityLinkSection`** and **`EntityLinkPicker` bottom sheet** supporting all 10 `EntityType`s, inline **"+ Create & Link"** flows, and automatic GPS/time-window link suggestions.
- [ ] Add quick **Itinerary Adjustment gestures** on the Today and Day-by-Day timelines (drag-to-reorder `manualOrder`, quick time-shift `+30m`/`+1h`/`Move to Day`, and one-tap *"Promote Saved Link to Activity"*).

### Phase 4: Quick Capture, Receipt Scanner & Camera Roll Auto-Sync (Weeks 7–8)

- [ ] Implement the `+` **Quick Capture & Create Sheet** (Spontaneous Activity/Stop, GPS Location Pin, Photo, Expense, Food Log #121, Journal Note, Where I Parked #123).
- [ ] Build **Receipt Scanner (#122)** with on-device OCR + multi-currency expense creation (#96) and companion splitting (#97).
- [ ] Build **Camera Roll Auto-Sync** (`expo-media-library`) with date-range matching, bulk photo `EntityLink` suggestions (`TAKEN_AT` / `RELATED`), and background upload queue.

### Phase 5: Native Extensions, Widgets & Background GPS (Weeks 9–10)

- [ ] Implement **Background GPS Track Logging (#43)** (`expo-location` + `expo-task-manager`), unlogged-stop detection, and backend PostGIS track ingestion (`TripTrack`).
- [ ] Implement **Native Share Sheet Extension** (`expo-share-intent`) for saving URLs, booking PDFs, maps places, and photos from external apps with immediate entity linking.
- [ ] Build **iOS WidgetKit & Android Glance Widgets** (Next Up itinerary widget, Flight/Trip countdown, Quick Capture launcher).
- [ ] Add native push notifications (`expo-notifications`) wired into `pushNotification.service.ts`.

---

## 8. Performance, Security & Testing Standards

- **React Native Performance (`vercel-react-native-skills`)**:
  - Use `@shopify/flash-list` with memoized item components and stable callbacks for all timelines, entity pickers, and photo grids.
  - Use `expo-image` with disk caching (`cachePolicy="memory-disk"`) and `galeria` for native pinch-to-zoom photo lightboxes.
  - Use Reanimated v3 worklets animating only `transform` and `opacity` for 60/120fps drag-and-drop itinerary reordering and sheet transitions.
- **Security**:
  - Store `accessToken` and `refreshToken` strictly in `expo-secure-store` (Keychain on iOS, Keystore on Android).
  - Support self-signed TLS certificates or Cloudflare Access / Tailscale tunnels for self-hosted users.
  - Redact companion medical notes on shared trips for non-owners (matching the backend rule in #111).
- **Testing**:
  - Unit tests (Vitest/Jest) for `packages/shared`, SQLite causal outbox queue, polymorphic `EntityLink` `local_<uuid>` remapping, and receipt parser.
  - E2E flows with **Maestro** covering: offline create Location + Activity + EntityLink → reschedule existing Activity → reconnect → verify server sync.

---

## 9. Implementation Status

Recorded 2026-11-11, after the first implementation pass. iOS was explicitly out of scope.

### Verified

| Area | How it was verified |
| ---- | ------------------- |
| `packages/shared` (timezones, time-shift, receipt parser, entity types, form schemas) | 138 Vitest tests, `tsc` |
| Backend: mobile auth, CSRF bearer bypass, QR pairing, mobile OIDC, sync snapshot, GPS tracks, photo inference, receipt parsing, native push | Jest (full suite green), `build:strict` |
| Web: "Pair Mobile App" card in Settings → Integrations | Vitest component tests, ESLint |
| Mobile offline core: SQLite schema, outbox, causal replay, `local_<uuid>` remapping, field-level conflicts, track buffer, API client | 79 Vitest tests against real SQLite, including the plan's offline create → link → reschedule → reconnect flow |
| Mobile app as a whole | `tsc`, ESLint, `expo-doctor` (19/20), Metro Android bundle export, `expo prebuild` for Android, Gradle `assembleDebug` (debug APK) |

### Not verified

**Only the core path has been run on a device.** On an Android emulator (API 37) against a
local backend, these work: onboarding, password sign-in, the first sync, the Today, Map, Trip and
Vault tabs, the activity form, and an edit made in the app reaching the server database. The
session also survives reinstalling the app.

The offline flow also works on the emulator: in airplane mode, a new activity, a new place, the
link between them and an edit to an already-synced activity were all saved locally and marked
"Not synced"; on reconnect they reached the server without any manual step, the link carrying
real server ids. The "I am here" pin works from GPS alone.

Not yet run at all: QR pairing, SSO, conflict resolution, photo capture, receipt OCR, background
location, the widget, the share target, the camera-roll review and push delivery. Nothing has
been run on a physical
phone. `mobile/scripts/dev-seed.mjs` creates the local test account and trip used for this.

A debug APK **does build** on Windows (`gradlew assembleDebug`, arm64-v8a and x86_64), but only
with two workarounds for the 260-character path limit in the C++ build, both described in
`mobile/README.md`: building from a short copy of `mobile/` (`C:\tl\mobile`), and replacing the
Android SDK's ninja 1.10 with ninja 1.12+ through `mobile/scripts/windows-long-paths.init.gradle`.
A `subst` drive does not help (the build resolves it back to the real path). Whether the ninja
workaround alone is enough from the repository's own path was not tested.

### Deviations from the plan

| Plan | What was built | Why |
| ---- | -------------- | --- |
| NativeWind v4 | `StyleSheet` + a palette module mirroring the style guide | Fewer build-time moving parts for an app that could not be run here |
| One SQLite table per entity | One `entities` table of JSON documents with indexed key columns | The server schema stays the single authority on columns; no phone-side migration per backend column |
| Backend imports `packages/shared` | Two modules vendored into `backend/src/services/_shared/vendored/` by `packages/shared/scripts/sync-vendored.mjs`, with a drift test | The backend Docker build context is `./backend` and cannot see `packages/` |
| Web and backend switched to `packages/shared` | Web and backend still use their own copies of `countryFacts`, `mapsDeepLinks`, `openingHours` | Same Docker-context constraint; rewiring production builds was out of scope |
| Drag-to-reorder | "Move up / Move down" in the long-press menu, persisted as `manualOrder` | No gesture-drag list implemented |
| Offline map tile packs (`@rnmapbox/maps`) | `react-native-maps`; pins and the GPS trail come from SQLite, base tiles need a connection | Offline tiles need a Mapbox account and SDK |
| PostGIS `LineStringZ` track | `trip_track_points` rows with lat/lng/timestamp | Every consumer needs per-point timestamps; batches arrive out of order |
| Voice note (#120) | Text note; dictation via the keyboard's microphone | No audio recording or speech-to-text added |
| Expense splits (#97) | Equal split and "paid by", written into the expense note | `TripExpense` has no split columns |
| Receipt image upload to the server | Text only: OCR runs on-device and only the text is sent | Privacy, and no server-side OCR exists |
| Three widgets, iOS + Android | One Android "Next Up" widget | iOS skipped; countdown and quick-capture widgets not built |
| iOS Share Extension | Android share target only | iOS skipped |
| Immich de-duplication on camera-roll sync | Not implemented | — |
| "Unlogged stop" prompts | Detection logic exists and is tested in `packages/shared`; no UI prompts yet | — |
| Self-signed TLS support | Not implemented; use a trusted certificate or a tunnel | Needs native network-security configuration |
| Maestro E2E | Not written; the flow is covered at the engine level instead | Cannot be run without a device build |

### Before first use

1. Apply the migration `20261111000000_add_mobile_companion` (`npx prisma migrate deploy`).
2. Set `BASE_URL` on the backend to its public address — the pairing QR code embeds it. (The web
   app substitutes its own origin when `BASE_URL` is still a loopback address.)
3. Copy `mobile/app.json.example` to `mobile/app.json` (git-ignored, so keys stay out of the
   repository) and add a Google Maps Android API key to it.
4. For push notifications, add an EAS project id to `mobile/app.json`.
