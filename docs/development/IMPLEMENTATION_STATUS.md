# Travel Life - Implementation Status

Last Updated: 2026-11-16 (checklist below not re-audited since v5.6.1, except the November 2026 batch section)
Version: v8.0.0

> This checklist is complete only through v5.6.1, plus the November 2026 feature batch near the end. For everything shipped since (companion app, PDF import, push, OIDC, Atlas Planner redesign, security audit, ...) read [CHANGELOG.md](../../CHANGELOG.md), which is the authoritative record, and [FEATURE_MAP.md](../architecture/FEATURE_MAP.md) for where each feature lives.

## ✅ Completed Features

### Project Setup & Infrastructure

- [x] Backend initialized (Node.js + Express + TypeScript)
- [x] Frontend initialized (React + TypeScript + Vite)
- [x] Docker Compose configuration
- [x] Database schema (Prisma with PostGIS)
- [x] Environment configuration
- [x] Documentation (README, PLANNING, GETTING_STARTED, CLAUDE.md, FEATURE_IDEAS.md)
- [x] PostgreSQL with PostGIS extension
- [x] Nominatim container for self-hosted geocoding

### Authentication System

- [x] User registration
- [x] User login
- [x] JWT token generation (access + refresh tokens)
- [x] Token refresh endpoint
- [x] Protected route middleware (backend)
- [x] Password hashing (bcrypt)
- [x] Login page (frontend)
- [x] Register page (frontend)
- [x] Protected route component (frontend)
- [x] Auth state management (Zustand)
- [x] Axios interceptors for token refresh
- [x] **Secure token storage** - Refresh tokens stored in httpOnly cookies (XSS protection)
- [x] **Silent refresh** - Automatic session restoration on page load
- [x] **CSRF protection** - Double-submit cookie pattern with validation middleware
- [x] **Token blacklisting** - Immediate token revocation on logout
- [x] **Token rotation** - New refresh token issued on each refresh
- [x] **Refresh race condition protection** - Subscriber queue prevents duplicate refreshes

### Trip Management (Core CRUD)

- [x] Trip CRUD endpoints (backend)
- [x] Trip model and database operations
- [x] Trip list page (Dashboard)
- [x] Trip detail page with tabs
- [x] Trip create/edit form
- [x] Trip status management (Dream, Planning, Planned, In Progress, Completed, Cancelled)
- [x] **Automatic trip status updates based on dates** - Trips automatically transition to "In Progress" when start date arrives and "Completed" when end date passes
- [x] Privacy levels (Private, Shared, Public)
- [x] Trip cover photo support
- [x] Trip timezone field
- [x] Tab counts for all trip sections (Activities, Transportation, Lodging, Journal, Tags, Companions, Albums)

### Location Management

- [x] Location CRUD endpoints (backend)
- [x] Location model and database operations
- [x] OpenStreetMap integration (Leaflet)
- [x] Geocoding with Nominatim
- [x] Location form with map picker
- [x] Location list for trip
- [x] Map view with markers
- [x] Custom location categories (user-defined)
- [x] Default location categories
- [x] Location detail view with photos
- [x] Location category management UI

### Photo Management

- [x] Photo upload (local)
- [x] Photo CRUD endpoints (backend)
- [x] Photo gallery view
- [x] Photo metadata (EXIF parsing)
- [x] Photo thumbnails (Sharp library)
- [x] Photo albums
- [x] Album CRUD operations
- [x] Photo assignment to albums
- [x] Immich integration (connect to self-hosted Immich)
- [x] Photo location linking
- [x] Photo timeline integration

### Transportation Management

- [x] Transportation CRUD endpoints (backend)
- [x] Transportation model (flights, trains, buses, cars, boats, etc.)
- [x] Transportation form with type selection
- [x] Transportation list view
- [x] Confirmation numbers and booking details
- [x] Seat assignments
- [x] Start and end location support
- [x] Start and end timezone fields (dual timezone support)
- [x] Timeline integration for transportation
- [x] **Flight route visualization** - Interactive maps showing flight paths with curved arcs
- [x] **Upcoming vs Historical flight filtering** - Tab-based filtering to view upcoming, historical, or all transportation
- [x] **Flight status badges** - Visual indicators for upcoming, in-progress, and completed flights
- [x] **Flight duration calculation and display** - Automatic calculation and formatting of flight duration
- [x] **Flight statistics dashboard** - Total flights, distance traveled, flight time, most frequent routes, and airline counts
- [x] **Flight tracking integration** - Gate, terminal, and baggage claim information display
- [x] **Coordinate-based route mapping** - Extracts coordinates from Location entities for accurate route visualization

### Lodging Management

- [x] Lodging CRUD endpoints (backend)
- [x] Lodging model (hotels, Airbnb, camping, etc.)
- [x] Lodging form with type selection
- [x] Lodging list view
- [x] Check-in/check-out dates and times
- [x] Confirmation numbers and booking details
- [x] Room details
- [x] Lodging timezone field
- [x] Timeline integration for lodging
- [x] Multi-day lodging display (shows on each day from check-in to check-out)

### Activity Management

- [x] Activity CRUD endpoints (backend)
- [x] Activity model
- [x] Activity form
- [x] Activity list view
- [x] Activity categories (user-customizable)
- [x] Activity cost tracking
- [x] Activity status (Planned, Completed, Cancelled)
- [x] Activity timezone field
- [x] Timeline integration for activities

### Journal Entries

- [x] Journal CRUD endpoints (backend)
- [x] Journal model (trip-level and daily entries)
- [x] Journal form with rich text
- [x] Journal list view
- [x] Journal entry types (General, Daily, Highlight, Reflection)
- [x] Mood tracking
- [x] Weather notes
- [x] Location and photo linking

### Checklists

- [x] Checklist CRUD endpoints (backend)
- [x] Checklist model with items and completion status
- [x] Checklist creation and management UI
- [x] Auto-population of default checklists
- [x] Category-based checklist filtering
- [x] Selective default checklist management
- [x] Two-column layout for better organization
- [x] Per-trip checklist customization

### Tags & Organization

- [x] Tag CRUD endpoints (backend)
- [x] Tag model
- [x] Tag creation and management
- [x] Tag assignment to trips
- [x] Tag color customization
- [x] Tag filtering
- [x] Dark mode support for tag UI

### Travel Companions

- [x] Companion CRUD endpoints (backend)
- [x] Companion model with contact fields (name, email, phone, notes)
- [x] Companion creation and management
- [x] Companion assignment to trips
- [x] Companion list view
- [x] Link/unlink companions from trips
- [x] Dark mode support for companion UI

### Timeline View

- [x] Timeline page showing chronological trip events
- [x] Activity timeline items
- [x] Transportation timeline items
- [x] Lodging timeline items (with multi-day support)
- [x] Journal timeline items
- [x] Dual timezone support (trip timezone + user timezone side-by-side)
- [x] Sticky timezone headers
- [x] Day-by-day organization
- [x] Dark mode support for timeline

### User Settings

- [x] User settings page
- [x] User timezone setting
- [x] Theme toggle (light/dark mode)
- [x] Default activity categories management
- [x] Profile information editing

### Data Management

- [x] **Backup & Restore System**
  - [x] Create full data backup (JSON export)
  - [x] Download backup file
  - [x] Restore from backup file
  - [x] Clear existing data option
  - [x] Merge backup with existing data option
  - [x] Photo metadata preservation
  - [x] Automatic ID remapping for relationships
  - [x] Restore statistics and feedback
  - [x] Backup version compatibility checking
  - [x] Data integrity validation
  - [x] Comprehensive user guidance and warnings

### UI/UX Features

- [x] Responsive design with Tailwind CSS
- [x] Dark mode support across all components
- [x] Toast notifications (react-hot-toast)
- [x] Loading states with skeleton loaders
- [x] Error handling
- [x] Form validation (Zod schemas)
- [x] Sticky headers
- [x] Collapsible sections
- [x] Empty states with helpful messaging and illustrations
- [x] **Comprehensive Design System (v1.8.0)** - Nautical-themed visual identity
- [x] **Custom Typography** - Crimson Pro (serif) for headings, Manrope (sans-serif) for body
- [x] **Navigator's Color Palette** - Deep ocean navy, weathered bronze/gold accents, warm neutrals
- [x] **Animation System** - fadeInUp, float, slideIn animations with staggered effects
- [x] **Enhanced Components** - Refined buttons with gradients, improved inputs, backdrop blur effects
- [x] **Production-Grade Polish** - Micro-interactions, refined spacing, visual hierarchy
- [x] **Loading Skeletons** - Shimmer animations for cards, lists, grids during data fetching
- [x] **Enhanced Toast Notifications** - Undo functionality, progress tracking, action buttons
- [x] **Keyboard Shortcuts** - Global shortcuts (?, Esc, Ctrl+K) with help modal
- [x] **Inline Editing** - Click-to-edit for text and numeric fields with auto-save
- [x] **Progressive Image Loading** - Blur-up placeholder technique with lazy loading
- [x] **Drag & Drop Upload** - Photo upload with visual feedback and overlay mode
- [x] **Global Search** - Autocomplete search across trips, locations, photos, journals (Ctrl+K/Cmd+K)
- [x] **Photo Gallery Enhancements** - Grid/list view toggle, sorting options, hover zoom
- [x] **Dashboard Widgets** - Upcoming trips, recent photos carousel, travel stats, quick actions
- [x] **Mobile-First Optimizations** - Bottom navigation, pull-to-refresh, camera integration (swipe gestures were implemented and later removed in commit `ba8cdbf`)
- [x] **Timeline View Modes** - Compact and standard view with user preference persistence
- [x] **Drag & Drop Timeline Reordering** - Manual reordering of timeline items with visual feedback
- [x] **Auto-Save Drafts** - Automatic form draft saving to localStorage with restore prompt, prevents data loss from browser crashes or accidental navigation
- [x] **Batch Operations** - Multi-select mode for activities, locations, transportation, and lodging with bulk delete and bulk edit capabilities

### External Integrations

- [x] Immich photo library integration
- [x] Self-hosted Nominatim geocoding
- [x] Weather data integration (OpenWeatherMap) - Full service with caching, forecast and historical data
- [x] Flight tracking integration (AviationStack) - Real-time flight status, gate/terminal info

### Travel Documents & Visa Intelligence

- [x] Travel document CRUD endpoints (backend)
- [x] Travel document model (passports, visas, ID cards, insurance, vaccination records, etc.)
- [x] Document expiry tracking and alerts
- [x] **Visa requirement intelligence** - Per-destination visa requirement lookup
- [x] Travel document manager UI (`TravelDocumentManager.tsx`)
- [x] Document alerts component for expiring/missing documents (`DocumentAlerts.tsx`)

### Trip Series

- [x] Trip series CRUD endpoints (backend)
- [x] Trip series model linking related trips (recurring/multi-part journeys)
- [x] Trip series list page (`TripSeriesListPage.tsx`)
- [x] Trip series detail page (`TripSeriesPage.tsx`)
- [x] Aggregate statistics across trips in a series

### Language Phrases / Phrase Bank

- [x] Language phrase CRUD endpoints (backend)
- [x] Language phrase model and per-trip language tracking
- [x] Trip language service for associating languages with trips
- [x] Phrase Bank UI for browsing and managing useful travel phrases (`PhraseBank.tsx`)

### Packing Suggestions

- [x] Packing suggestion service (backend) - generates suggestions based on trip details and weather
- [x] Packing suggestions UI (`PackingSuggestions.tsx`)
- [x] Weather- and destination-aware recommendations

### Dietary Preferences

- [x] Dietary preference tracking for companions and trips
- [x] Dietary badges display component (`DietaryBadges.tsx`)
- [x] Dietary tag selector for choosing dietary needs (`DietaryTagSelector.tsx`)

### PDF + AI Import

- [x] PDF import endpoints (`pdfImport.controller.ts`)
- [x] PDF import and parsing services (`pdfImport.service.ts`, `pdfParser.service.ts`)
- [x] LLM-powered extraction of bookings (flights, hotels, activities) from uploaded PDFs
- [x] Pending entity review workflow (`PendingEntity` model)
- [x] PDF import button, upload modal, and review modal UI (`PdfImportButton.tsx`, `PdfUploadModal.tsx`, `PdfReviewModal.tsx`)
- [x] Replaces the previous email-import feature (removed in v5.4.0)

### Budget & Multi-Currency

- [x] Trip budget, expenses, and per-category breakdown
- [x] **Currency conversion** — `exchangeRate`/`baseAmount`/`baseCurrency` frozen per costed row
- [x] Rates from Frankfurter (keyless), cached per (date, pair) in `exchange_rates`
- [x] Budget itself converted, so a USD budget no longer compares against EUR spend
- [x] Unconverted amounts excluded from totals and reported separately, never silently mixed in
- [x] Backfill script for legacy rows (`scripts/backfill-currency-conversion.ts`)
- [ ] Write-time snapshots on Activity/Transportation/Lodging (currently filled lazily on first budget read)

### Location Opening Hours

- [x] `Location.openingHours` (raw OSM string), `openingHoursSource`, and `timezone`
- [x] Parser supporting a documented OSM subset, failing closed to `UNKNOWN` outside it
- [x] Timezone-correct evaluation in the location's own zone, DST-safe, no UTC fallback
- [x] Closure warning in Trip Health Check, fires only on a definite `CLOSED`
- [x] Best-effort population from Nominatim `extratags`; manual entry and override in the UI
- [ ] Month/date selectors, `sunrise`/`sunset`, nth-weekday, `||` fallbacks (currently `UNKNOWN`)

### Transit & Rideshare Deep Links

- [x] Pure URL builders for Apple Maps, Google Maps, Citymapper, Uber, Lyft
- [x] Platform-aware (`maps://` on iOS, `geo:` on Android where it fits, https on desktop)
- [x] Origin inferred from the previous itinerary item in Timeline and Daily View
- [x] Reusable `DirectionsButton`; per-user preferred app in Settings
- [x] No button rather than a garbage search when an item has no usable place

### Saved Links

- [x] `SavedLink` model with a nullable `tripId` (an unassigned "inbox")
- [x] CRUD endpoints (`savedLink.controller.ts`, `savedLink.service.ts`)
- [x] Open Graph metadata scraping with SSRF guards on every redirect hop (`linkMetadata.service.ts`)
- [x] Tracking-parameter stripping (`utm_*`, `fbclid`, `gclid`, …) on write
- [x] Attachable to any trip entity via the `SAVED_LINK` entity type
- [x] Trip "Links" tab and inbox triage page (`SavedLinksManager.tsx`, `SavedLinksInboxPage.tsx`)
- [x] Backup/restore and trip-duplication coverage (backup format v1.4.0)
- [x] **Email ingest** — IMAP polling of a dedicated mailbox captures forwarded links
- [x] Sender verification against the account email plus per-user trusted aliases
- [x] Tracker/unsubscribe/CDN denylist with a per-message link cap
- [x] Processed mail archived (not deleted); re-delivery is deduped on Message-ID
- [ ] Plus-address routing (`mailbox+trip-slug@`) straight to a trip (planned)

### LLM Settings / AI Integration

- [x] LLM service for AI-powered features (`llm.service.ts`)
- [x] LLM settings UI for configuring the AI provider (`LlmSettings.tsx`)
- [x] Powers PDF + AI import and AI-assisted suggestions

### Trip Validation & Planning

- [x] **Trip Health Check** - Automated validation system identifying schedule conflicts, missing accommodations, transportation gaps
- [x] **Travel Time Alerts** - Calculates travel times between activities, warns about impossible/tight connections
- [x] **Trip Collaboration UI** - Full UI for inviting collaborators, managing permissions (view/edit/admin), pending invitations

### Dashboard & Analytics

- [x] **Advanced Dashboard Filtering** - Filter trips by status, date range, tags, search (on TripsPage)
- [x] **Places Visited Map** - Aggregate map showing all visited locations with clustering and transportation routes
- [x] **Calendar View** - GitHub-style calendar heatmap showing travel activity over time

### Trip Dashboard (In-Trip "Today" View)

- [x] Dashboard tab on trip detail page (`trip-dashboard/TripDashboard.tsx`)
- [x] Dashboard hero with trip day indicator and countdown timer
- [x] "Next Up" card showing the next upcoming event
- [x] Today's itinerary widget
- [x] Weather forecast widget
- [x] Flight status widget (live AviationStack data)
- [x] Local time widget (trip timezone vs home timezone)
- [x] Map preview, quick actions bar, recent activity, checklists, and companions widgets
- [x] Budget summary widget — now fully wired: `TripDetailPage` fetches the budget summary and passes `budgetData`; navigates to the Budget tab

### Day By Day View

- [x] Daily view tab with per-day cards for activities, transportation, lodging, journal (`daily-view/`)
- [x] Day navigator for stepping through trip days
- [x] Embedded location and album cards per day
- [x] Printable single-day itinerary (`PrintableDayItinerary.tsx`)

### PWA & Offline Support

- [x] PWA via `vite-plugin-pwa` (`frontend/vite.config.ts`) — manifest, generated icons, and an
      `injectManifest`-based service worker (`src/sw.ts`) are genuinely built and registered, so the app
      is installable and gets the browser-level "Add to Home Screen" prompt independent of the app's own
      React tree.
- [x] Push notifications — web push via VAPID (see Push Notifications section)

The richer offline UI (install prompts, offline download, map/search caching, storage management, sync
conflict resolution) is implemented but not reachable by users — see
"[Built but not yet wired up](#-built-but-not-yet-wired-up)" below.

### Trip Navigation & Views

- [x] Grouped trip detail tabs: Dashboard, Overview (Timeline / Day By Day / Trip Map), Plan (Activities / Transport / Lodging / Unscheduled), Memories (Photos / Photo Map / Photo Timeline / Journal), Places, People
- [x] Navigation layout toggle (tabs vs sidebar) with preference persistence
- [x] Kanban board view for trips by status (`TripsKanbanView.tsx`)
- [x] Floating trip header and breadcrumbs

### Souvenirs & Trip Prep Extras

- [x] Souvenir/gift tracking (`SouvenirManager.tsx`) — built on the checklist system using a `souvenirs` checklist type with per-item metadata (no dedicated model)
- [x] Jet lag calculator (`JetLagCalculator.tsx`)

### Authentication Additions

- [x] OIDC/SSO login (Google, Authentik, Keycloak, or any OIDC provider) with optional auto-provisioning (`oidc.service.ts`)
- [x] User invitation emails via SMTP (`email.service.ts`, per-user SMTP override in `SmtpSettings.tsx`)
- [x] Travel partner settings — designate a partner user who is auto-added as collaborator on new trips (`TravelPartnerSettings.tsx`)

### AI Features (beyond PDF Import)

- [x] AI entity link suggestions (`GET /api/trips/:tripId/ai/link-suggestions`)
- [x] AI journal summary generation (`POST /api/trips/:tripId/ai/journal-summary`)
- [x] Album suggestions (`albumSuggestion.service.ts`, `AlbumSuggestions.tsx`)
- [x] AI rate limiting middleware

### Airport Search

- [x] Airport lookup endpoints (`airport.routes.ts`, `airport.service.ts`)
- [x] Airport autocomplete input for transportation forms (`AirportSearchInput.tsx`)

### Budget & Expense Tracking (2026-07-19)

- [x] `Trip.budget` / `Trip.budgetCurrency` fields and `TripExpense` model (`trip_expenses`, migration `20260719010000`)
- [x] Expense CRUD under `/api/trips/:tripId/expenses` + `GET /api/trips/:tripId/budget-summary` (combines entity costs with logged expenses by category)
- [x] Budget tab (`BudgetManager.tsx`) under the Plan tab group: budget editing, expense list, category totals, remaining-budget indicator
- [x] `BudgetSummaryWidget` on the trip dashboard now receives live data

### Public Trip Sharing (2026-07-19)

- [x] `Trip.shareToken` / `Trip.shareEnabled` (migration `20260719020000`); generate/rotate/disable endpoints (owner only)
- [x] Unauthenticated, rate-limited `GET /api/public/trips/:token` returning a field-by-field sanitized payload (no confirmation numbers, costs, or Immich assets)
- [x] Standalone public page at `/share/:token` (`PublicTripPage.tsx`); share controls in `TripFormPage` next to privacy level

### Memories & Year in Review (2026-07-19)

- [x] `GET /api/memories/on-this-day` and `GET /api/memories/year-in-review/:year` (read-only, no schema changes)
- [x] `OnThisDayWidget` on the main dashboard (hidden when there are no memories)
- [x] `YearInReviewPage` at `/year-in-review` with yearly stats, highlight photos, and trip list; linked from the navbar

### iCal Calendar Feed (2026-07-19)

- [x] `User.calendarToken` (migration `20260719040000`); generate/rotate/revoke endpoints
- [x] Unauthenticated `GET /api/calendar/:token.ics` — hand-rolled RFC 5545 output (trips all-day, transportation timed with timezone→UTC conversion, lodging spans), no new dependencies, 21 unit tests
- [x] `CalendarFeedSettings` section on the Settings page with copyable subscription URL

### Push Notifications (2026-07-19)

- [x] `PushSubscription` model (migration `20260719050000`); `web-push` with VAPID keys via `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` env vars (feature disables gracefully when unset)
- [x] Subscribe/unsubscribe/test endpoints under `/api/push`; dead subscriptions pruned on 404/410
- [x] "Trip starts tomorrow" reminder job wired into the cron config
- [x] Service worker migrated from generateSW to **injectManifest** (`frontend/src/sw.ts`) with push + notificationclick handlers; original runtime caches (`api-cache`, `photo-thumbnails`, `map-tiles`) preserved with identical names and expiration
- [x] `PushNotificationSettings` section on the Settings page

### Archiving, Favorites & Auto-Timezone (2026-07-19)

- [x] `Trip.archived` and `Location.isFavorite` (migration `20260719060000`)
- [x] Trip list excludes archived trips by default; Archived filter on TripsPage; archive/unarchive on TripCard
- [x] Favorite star on locations; `GET /api/locations/favorites`; Favorites filter on Places Visited page
- [x] Trip timezone auto-set from the first location's coordinates via `tz-lookup` when unset

### November 2026 Feature Batch (2026-11-16)

Twelve backlog features, merged together. Backend build + 2,681 Jest tests and frontend `tsc -b` + 1,022 Vitest tests pass, and a 402-step real-database smoke test passes. Immich and LLM features were tested against mocks only, never a live Immich server or a real model.

- [x] Expense splitting and settle-up (#97): payer and equal / amount / percentage split per expense, `trip_expense_splits`, `/settle-up` (migration `20261116010000_add_expense_splits`)
- [x] Photo favorites and Highlights view (#100): `photos.is_favorite`, server-side Favorites filter, star hidden for view-only users (migration `20261116020000_add_photo_is_favorite`)
- [x] Loyalty programs (#109): `loyalty_programs`, `loyaltyProgramId` on lodging and transportation, suggestion chip in the booking forms (migration `20261116030000_add_loyalty_programs`)
- [x] Receipt scan and receipt images (#122): `POST .../expenses/scan-receipt`, `receipt_*` columns on `trip_expenses`, stored 2400 px JPEG; backups keep the path, not the image (migration `20261116070000_add_expense_receipt_image`)
- [x] Multi-city route planner (#13): `trip_stops`, drag-and-drop list with map, optimise with undo, stops from saved places, read-only for view-only users (migration `20261116080000_add_trip_stops`)
- [x] Units setting: `users.measurement_system` (imperial or metric, default imperial) used by the planner, the trip comparison and the temperature displays (migration `20261116120000_add_user_measurement_system`)
- [x] Immich expansion (#70): filtering, smart search, bulk link, album sync, opt-in export (migration `20261116100000_add_immich_album_link`); not tested against a live Immich server
- [x] Trip comparison (#11), recently viewed trips (#22) and CSV import for locations and activities (#27): no schema change
- [x] Deadlines inside the lodging, transportation and activity forms (#116), Today mode clocks and next-up card (#117), and day auto-draft journal with day-view actions (#120): no schema change
- [x] Fixed on the way: activity `timezone` / `allDay` not saved on create, AI journal features ignoring a user's own AI key, trip duplication now carries photo favorites and loyalty links, restore no longer invents a UTC timezone

## 🔌 Built but Not Yet Wired Up

Code exists, is implemented, and (where covered) passes tests, but is not reachable from the running app
because nothing imports it outside its own module. Verified by grepping `frontend/src` for each name and
finding matches only inside `components/pwa/` (a barrel — `components/pwa/index.ts` — that nothing else
imports) or in JSDoc example comments referencing the component by name, not an actual import.

### PWA / Offline UI

- [ ] iOS install prompt and iOS storage warnings (`IOSInstallPrompt`, `IOSStorageWarning`)
- [ ] Offline download of trip data (`OfflineDownloadButton`, `OfflineDownloadModal`)
- [ ] Offline map tile caching (`MapCachePreview` — not even exported from `components/pwa/index.ts`)
- [ ] Offline search UI (`OfflineSearchResults`, which itself is unimported — its `useOfflineMap` /
      `useOfflineSearch` hooks are therefore also unreachable from the UI)
- [ ] Storage management UI (`StorageUsageBar`, `StorageQuotaWarning`)
- [ ] Sync conflict resolution UI (`ConflictResolutionModal`, `ConflictsList`, `ConflictFieldDiff`)
- [ ] Network/offline status indicator and data freshness indicator (`OfflineIndicator`, `SyncStatus`,
      `DataFreshnessIndicator`)
- [ ] Migration notice (`MigrationNotice`)

Fourteen components total (`OfflineDownloadButton`, `OfflineDownloadModal`, `ConflictResolutionModal`,
`ConflictFieldDiff`, `ConflictsList`, `IOSInstallPrompt`, `IOSStorageWarning`, `StorageUsageBar`,
`StorageQuotaWarning`, `DataFreshnessIndicator`, `MapCachePreview`, `OfflineIndicator`, `SyncStatus`,
`MigrationNotice`). Underlying data layer (IndexedDB store, `useSyncConflicts`, `useOfflineReady`, offline
service worker caching itself) may still function; what's missing is the UI surface that would let a user
see or act on it.

## 🚧 Known Issues

_No known issues at this time._

## 🔧 Future Improvements (Technical Debt)

These are non-critical improvements identified during code reviews that would enhance maintainability:

### Batch Operations

- [ ] **Extract `useBulkOperations` hook** - Reduce code duplication across manager components (ActivityManager, LocationManager, TransportationManager, LodgingManager) by extracting common bulk selection and operation logic into a shared hook
- [ ] **Atomic entity link cleanup** - Wrap bulk delete operations with entity link cleanup in a Prisma transaction to ensure atomicity when deleting entities that have links

### Auto-Save Drafts

- [ ] **Include form validation state** - Enhance draft storage to include form validation state for complete state restoration, not just field values

### Budget Tracking

- [ ] **Multi-currency expense conversion** - Budget summary sums amounts without FX conversion; mixed-currency trips show totals in the dominant currency only

## 📋 Remaining Work

### Phase 2: Advanced Trip Features

- [x] Trip collaboration (multiple users with permissions) ✅ Completed
- [x] Trip sharing (public links) ✅ Share tokens + public `/share/:token` page (2026-07-19)
- [ ] Trip cover photo selection UI on trips list

### Phase 3: Enhanced Features

- [x] Advanced filtering on dashboard (by status, tags, date range) ✅ On TripsPage
- [x] Global search across all trips ✅ Completed
- [x] Places visited map (aggregate view) ✅ PlacesVisitedPage
- [x] Statistics and analytics dashboard ✅ Dashboard widgets
- [x] Calendar view of trips ✅ TravelCalendarHeatmap

### Phase 4: External Integrations

- [x] Weather data integration (OpenWeatherMap) ✅ Full service with caching
- [x] Flight tracking integration (AviationStack) ✅ Real-time flight status
- [ ] Google Photos integration

### Phase 5: Advanced Features

- [ ] Walking route auto-calculation
- [ ] Multi-day transportation support
- [x] Activities with sub-activities
- [x] Photo pagination for large galleries
- [x] Combine Albums and Photos tabs (under consideration)
- [ ] XML import/export
- [x] Print-friendly reports ✅ `PrintableItinerary` component with `@media print` styles
- [x] PDF export (print-based) ✅ Export via browser print dialog ("Save as PDF") from `PrintableItinerary`
- [ ] Server-side PDF generation - Native PDF rendering without the browser print dialog (not started)

### Phase 6: Polish & Optimization

- [x] Performance optimization (lazy loading, pagination)
- [x] PWA installability — manifest, icons, and service worker via `vite-plugin-pwa` ✅
- [ ] Native mobile app (React Native) - not started; PWA covers mobile use
- [ ] Offline support UI — trip download, map tile caching, offline search, sync conflicts UI are built but
      not wired into the app (see [Built but not yet wired up](#-built-but-not-yet-wired-up))
- [ ] Redis caching
- [ ] CDN for photo delivery
- [ ] Advanced photo editing
- [x] Batch operations (bulk delete, bulk edit for activities, locations, transportation, lodging)

## 📊 Progress Summary

| Category               | Completion |
| ---------------------- | ---------- |
| Infrastructure & Setup | 100%       |
| Authentication         | 100%       |
| Trip Management        | 95%        |
| Location Management    | 100%       |
| Photo Management       | 90%        |
| Transportation         | 100%       |
| Lodging                | 100%       |
| Activities             | 100%       |
| Journal Entries        | 100%       |
| Checklists             | 100%       |
| Tags                   | 100%       |
| Companions             | 100%       |
| Timeline               | 100%       |
| User Settings          | 100%       |
| Travel Documents       | 100%       |
| Trip Series            | 100%       |
| Language Phrases       | 100%       |
| Packing Suggestions    | 100%       |
| PDF + AI Import         | 100%       |
| LLM / AI Integration   | 100%       |
| Saved Links            | 90%        |
| UI/UX Polish           | 98%        |
| Advanced Features      | 90%        |
| External Integrations  | 80%        |

**Overall Progress: ~95% of core features complete**

## 🏗️ Technical Stack Status

### Backend

- ✅ Express server running on port 5000
- ✅ TypeScript configured
- ✅ Prisma ORM fully operational
- ✅ Database schema complete with 32 tables
- ✅ JWT authentication working
- ✅ All major CRUD endpoints implemented
- ✅ File uploads with Multer and Sharp
- ✅ EXIF parsing with exifr
- ✅ Error handling middleware
- ✅ Winston logger configured

### Frontend

- ✅ React 18 + Vite running on port 3000 (Docker) / 5173 (local)
- ✅ TypeScript configured
- ✅ Tailwind CSS with dark mode
- ✅ React Router v6
- ✅ Zustand state management
- ✅ TanStack Query for server state
- ✅ Axios with interceptors
- ✅ React Leaflet for maps
- ✅ React Hot Toast for notifications
- ✅ All major pages and components implemented

### Infrastructure

- ✅ Docker Compose with 4 services (db, backend, frontend, nominatim)
- ✅ PostgreSQL 16 with PostGIS 3.4
- ✅ Nominatim for geocoding (self-hosted)
- ✅ Volume mounts for uploads and database
- ✅ Network isolation

### External Services

- ✅ OpenWeatherMap API (full integration with forecast and historical data)
- ✅ AviationStack API (flight status, gate, terminal, baggage claim)
- ✅ Immich API (integration complete)
- ✅ Nominatim (self-hosted, fully operational)
- ✅ OpenRouteService (road distance calculations)

## 📝 Database Schema

All 32 tables are created and operational:

- `users` - User accounts with timezone, settings, and custom trip types
- `trips` - Trip records with status, dates, timezone, trip type
- `trip_series` - Series linking related trips (recurring/multi-part journeys)
- `trip_tags` - Tag definitions with colors
- `trip_tag_assignments` - Many-to-many trip-tag relationships
- `travel_companions` - Companion records with contact info
- `trip_companions` - Many-to-many trip-companion relationships
- `trip_collaborators` - Trip sharing with permissions
- `trip_invitations` - Pending invitations to collaborate on a trip
- `user_invitations` - Pending invitations for new user accounts
- `locations` - Points of interest with coordinates
- `location_categories` - Custom location categories
- `photos` - Photo records (local or Immich)
- `photo_albums` - Album definitions
- `photo_album_assignments` - Many-to-many photo-album relationships
- `transportation` - Transportation records with dual timezones
- `lodging` - Lodging records with dates and timezone
- `activities` - Activity records with status and timezone
- `checklists` - Trip checklists with categories
- `checklist_items` - Individual checklist items with completion status
- `journal_entries` - Journal entries with mood and weather
- `entity_links` - Cross-entity link relationships
- `weather_data` - Weather information (integrated with weather service)
- `flight_tracking` - Flight tracking data (integrated with AviationStack)
- `route_cache` - Cached route/distance calculations
- `dismissed_validation_issues` - Trip health check issues a user has dismissed
- `travel_documents` - Travel documents (passports, visas, insurance, etc.)
- `visa_requirements` - Per-destination visa requirement data
- `trip_languages` - Languages associated with a trip
- `language_phrases` - Phrase bank entries for travel languages
- `pdf_imports` - Uploaded PDF import jobs for AI-powered parsing
- `pending_entities` - Extracted entities awaiting user review from PDF imports

## 🎯 Feature Highlights

### What Works Well

1. **Complete trip lifecycle** - Create trips, add locations, photos, activities, transportation, lodging, journal entries
2. **Rich timeline view** - See all trip events chronologically with dual timezone support
3. **Flexible organization** - Tags, companions, custom categories
4. **Photo management** - Upload local photos or connect to Immich
5. **Map integration** - Interactive maps with geocoding
6. **Dark mode** - Full dark mode support across all pages
7. **Type safety** - TypeScript throughout with Zod validation

### Unique Features

- **Dual timezone timeline** - View trip events in both trip timezone and home timezone simultaneously
- **Multi-day lodging** - Lodging automatically appears on every day from check-in to check-out
- **Immich integration** - Connect to self-hosted photo library
- **Custom categories** - User-defined location and activity categories
- **Rich journal entries** - Multiple entry types with mood and weather tracking

## 📚 Documentation

- ✅ [README.md](../../README.md) - Project overview
- ✅ [PLANNING.md](../../PLANNING.md) - Original planning document
- ✅ [GETTING_STARTED.md](../../GETTING_STARTED.md) - Setup instructions
- ✅ [CLAUDE.md](../../CLAUDE.md) - Developer guidance for Claude Code
- ✅ [FEATURE_BACKLOG.md](../development/FEATURE_BACKLOG.md) - Prioritized feature backlog
- ✅ [IMPLEMENTATION_STATUS.md](../development/IMPLEMENTATION_STATUS.md) - This file

## 🎉 Current State

The application is **feature-complete for core travel documentation**. Users can:

- ✅ Track multiple trips with detailed information
- ✅ Document locations with maps and photos
- ✅ Manage transportation and lodging with timezone support
- ✅ Track activities and costs
- ✅ Write journal entries
- ✅ Organize with tags and companions
- ✅ View everything on an interactive timeline
- ✅ Use in both light and dark mode

The app is **production-ready** for personal use. Remaining work focuses on advanced features, external integrations, and optimization.
