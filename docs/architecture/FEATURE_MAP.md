# Feature Map: Where to Find Things

A lookup from "what the app does" to the code that does it. Names are file stems: backend
`<x>` means `routes/<x>.routes.ts`, `controllers/<x>.controller.ts` and
`services/<x>.service.ts` (not every feature has all three); frontend `<x>` means
`services/<x>.service.ts` plus the listed components/pages. Run `rg` on a stem to find the rest.
Mount points are in `backend/src/index.ts` (search `app.use('/api`).

For layering rules see [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) and
[FRONTEND_ARCHITECTURE.md](FRONTEND_ARCHITECTURE.md); for table structure see
[DATABASE_SCHEMA.md](DATABASE_SCHEMA.md).

## Trip content

| Feature | Backend | Frontend |
| ------- | ------- | -------- |
| Trips (CRUD, status, duplicate, cover image) | `trip`, `tripCoverImage`, `tripValidator` | `TripsPage`, `TripFormPage`, `TripDetailPage`, `components/trip-detail/`, `TripCard`, `TripHealthCheck` |
| Trip series | `tripSeries` | `TripSeriesPage`, `TripSeriesListPage`, `TripSeriesNav` |
| Places (locations, categories, geocoding) | `location`, `placeSearch`, Nominatim via `location.service` | `LocationManager`, `LocationSearchMap`, `LocationQuickAdd`, `TripLocationsMap` |
| Activities | `activity` | `ActivityManager`, `components/forms/ActivityForm` |
| Transportation (flights, trains, …) and flight status | `transportation`, `aviationstack`, `airport`, `routing`, `travelTime` | `TransportationManager`, `FlightStatusBadge`, `FlightRouteMap`, `AirportSearchInput` |
| Lodging | `lodging` | `LodgingManager` |
| Custom items | `customItem` ([spec](../development/CUSTOM_ITEM_SPEC.md)) | `CustomItemsManager`, `CustomItemTypeManager` |
| Journal (+ AI drafting, per-day AI draft) | `journalEntry`, `journalEntryAi`, `journalDayDraft`, `services/_shared/dayDraft` | `JournalManager`, `MarkdownEditor` |
| Entity links (any entity to any entity) | `entityLink`, `services/_shared/entityLinkCleanup` | `LinkPanel`, `LinkedEntitiesDisplay`, `EntityPickerModal`, `useEntityLinking` |
| Timeline / daily view / agenda | (client-side, from trip data) | `Timeline`, `components/timeline/`, `components/daily-view/`, `components/agenda/`, `useTripAgendaData`, `utils/dayAgenda` |
| Today view / Today mode (live next-up card, local + home clocks) | trip data (client-side) | `components/today/`, `trip-dashboard/TodayModeCard`, `utils/todayNextUp`, `useActiveTrip` |
| Multi-city route planner (ordered stops, route map, optimiser) | `tripStop` | `components/route-planner/` (`RoutePlanner`, `RoutePlannerMap`) |
| Compare 2-8 trips (table, map, timeline, cost) | `tripComparison` | `TripComparisonPage`, `components/trip-comparison/` |
| CSV import of places/activities | `bulkImport`, `services/_shared/bulkImportRows`, `bulkImportEvaluators` | `BulkImportModal`, `BulkImportPreviewTable` |
| Unscheduled items / Kanban | `activity` etc. | `UnscheduledItems`, `TripsKanbanView`, `KanbanCard` |
| Tags, companions | `tag`, `companion` | `TagManager`, `CompanionManager`, `CompanionsPage` |

## Money, documents and logistics

| Feature | Backend | Frontend |
| ------- | ------- | -------- |
| Expenses, budget, multi-currency | `expense`, `exchangeRate`, `receipt` | `BudgetManager`, `CostCurrencyFields`, `CurrencySelect`, `utils/formatCurrency`, `constants/currencies` |
| Expense splitting and settle-up | `expenseSplit`, `services/_shared/settleUp`, `expenseSplitFields` | `ExpenseSplitFields`, `SettleUpPanel` |
| Receipt scan (LLM) and receipt images | `receiptScan`, `expenseReceipt`, `llm` (`chatWithImage`) | `ReceiptScanButton`, `ReceiptViewer` |
| Loyalty programs / membership numbers | `loyaltyProgram` | `LoyaltyProgramManager`, `LoyaltyProgramField` |
| Booking deadlines | `bookingDeadline` | `DeadlinesManager`, `widgets/DeadlinesWidget` |
| Travel documents / visas | `travelDocument`, `visaRequirement`, `services/_shared/countryCodes` | `TravelDocumentManager`, `DocumentAlerts` |
| Emergency info / local norms | `emergencyInfo` | `EmergencyCard`, `components/emergency/`, `LocalNormsCard` |
| Checklists and packing | `checklist`, `packingSuggestion`, `data/checklist-defaults` | `ChecklistsPage`, `ChecklistDetailPage`, `PackingSuggestions` |
| Weather | `weather` | `WeatherCard`, `WeatherSettings` |
| Language phrases | `languagePhrase`, `tripLanguage`, `data/language-phrases*` | `PhraseBank`, `TripLanguageSelector` |
| Food log / nearby food | `foodLog`, `nearbyFood` | `FoodLogPage`, `FoodLogManager`, `DietaryTagSelector` |
| Saved links inbox (+ email ingest) | `savedLink`, `linkMetadata`, `emailIngest`, `emailLinkExtractor` | `SavedLinksInboxPage`, `SavedLinksManager`, `LinkIngestSettings` |
| Souvenirs | `checklist` (a checklist type) | `SouvenirManager` |

## Photos

| Feature | Backend | Frontend |
| ------- | ------- | -------- |
| Photos, albums, EXIF, thumbnails | `photo`, `photoAlbum`, `albumSuggestion` (uses `sharp`, `exifr`) | `PhotoGallery`, `PhotoUpload`, `PhotoLightbox`, `AlbumsPage`, `GlobalAlbumsPage`, `PhotosMapView` |
| Photo favorites and trip highlights | `photo` (`isFavorite`, `favoritesOnly`) | `FavoriteStarButton`, `trip-detail/TripHighlights`, `useTripEditAccess` |
| Immich integration (filters, smart search, bulk link, album sync, export) | `immich`, `immichSync` | `ImmichBrowser`, `ImmichBulkImportDialog`, `ImmichAlbumPanel`, `ImmichSettings`, `useImmichThumbnail` |

## Sharing, people and accounts

| Feature | Backend | Frontend |
| ------- | ------- | -------- |
| Auth (password, refresh, CSRF) | `auth`, `auth/`, `middleware/auth`, `security/csrf`, `tokenBlacklist` | `authStore`, `lib/tokenManager`, `lib/axios`, `LoginPage` |
| SSO / OIDC | `oidc.service`, `oidc.controller` (routes are in `auth.routes`), `http/mobileSignInPages` | `LoginPage` |
| Users, settings, invitations (incl. units setting) | `user`, `userInvitation` | `SettingsPage`, `components/settings/`, `InviteUserModal`, `AcceptInvitePage` |
| Collaboration (trip collaborators, permissions) | `collaboration`, `services/_shared/tripAccess`, `tripPermissions`, `travelPartnerRequest` | `CollaboratorsManager`, `TravelPartnerSettings` |
| Public share links | `share`, `validation/share` | `ShareTripModal`, `PublicTripPage` |
| Calendar feed (iCal subscription) | `calendarFeed`, `calendar.routes` | `CalendarFeedSettings`, `TripCalendarPage` |
| Backup / restore (signed, scheduled) | `backup`, `backupIntegrity`, `scheduledBackup`, `restore` | `components/settings/BackupRestoreSection` |

## AI and automation

| Feature | Backend | Frontend |
| ------- | ------- | -------- |
| LLM client + prompt safety | `llm`, `security/promptSafety` | `LlmSettings` |
| PDF import (itinerary/booking PDFs) | `pdfImport`, `pdfParser` | `PdfImportButton`, `PdfUploadModal`, `PdfReviewModal`, `PendingImportsPanel`, `usePdfImportPolling` |
| AI suggestions (links, packing, albums) | `aiSuggestion`, `packingSuggestion` | `AlbumSuggestions`, `PackingSuggestions` |
| Push notifications | `pushNotification`, `push.routes`, `config/cron` | `PushNotificationSettings`, `push.service`, `sw.ts` |
| On This Day / Year in Review | `memories` | `widgets/OnThisDayWidget`, `YearInReviewPage` |
| Global search | `search` | `GlobalSearch`, `OfflineSearchResults` |
| Recently viewed trips (localStorage, no backend) | none | `widgets/RecentlyViewedWidget` |

## Dashboards and stats

`DashboardPage`, `TravelStatsPage`, `YearInReviewPage`, `PlacesVisitedPage`, `components/widgets/`,
`TripStats`, `TransportationStats`, `PlacesVisitedMap`, `JetLagCalculator`, `utils/jetlag`.

## Offline / PWA (web)

`sw.ts` (service worker), `lib/offlineDb`, `lib/queryPersister`, `services/offline*.service`,
`syncManager`, `mapTileCache.service`, `storageManager.service`, `components/pwa/`,
`hooks/useOfflineReady`, `useNetworkStatus`, `useSyncConflicts`. Plan: [PWA_IMPLEMENTATION_PLAN.md](../plans/PWA_IMPLEMENTATION_PLAN.md).

## Native companion app

See [MOBILE_AND_SHARED.md](MOBILE_AND_SHARED.md): `mobile/`, `packages/shared/`,
`mobilePairing`, `mobileSync`, `track`, `mobile.routes`.

## Shared building blocks (reuse before writing new)

### Backend

| Need | Use | Where |
| ---- | --- | ----- |
| CRUD controller | `createCrudController` | `prisma/crudHelpers.ts` |
| Async error wrapping, ID parsing | `asyncHandler`, `parseId` | `http/` |
| Trip permission check | `tripAccess`, `tripPermissions` | `services/_shared/` |
| Partial-update data from nullable/optional Zod input | `buildConditionalUpdateData` | `services/_shared/prismaUpdateData.ts` |
| Decimal ⇄ number | `decimalConversion` | `services/_shared/` |
| Country code (ISO alpha-2) of a location / passport / visa name; keeping it fresh on update | `deriveLocationCountryCode`, `deriveCountryCodeFromName`, `resolveLocationCountryCodeUpdate` (shared table: `resolveCountryCodeFromName`, `resolveLocationCountryCode`, `normalizeCountryCode` in `packages/shared/.../countryFacts.ts`, vendored to the backend, copied to `frontend/src/constants/countryFacts.ts`) | `services/_shared/countryCodes.ts` |
| Delete a row's entity links | `cleanupEntityLinks` (the database triggers do it too) | `services/_shared/entityLinkCleanup.ts` |
| Where an activity/lodging is (`locationId` FK) and how old clients see it as a link | `findSyntheticLocationLinks`, `syntheticLocationLinkId`, `claimEntityLocation` | `services/_shared/entityLocationLinks.ts`, `services/entityLink.service.ts` |
| An activity's/lodging's place ids, own FK first then loose links | `buildEntityLocationIdsMap` | `utils/entityLocations.ts` (frontend) |
| Timezone fallback chain | `resolveTimezone`, `getUserTimezone` | `services/_shared/timezoneResolution.ts` |
| Trip list ordering (open trips before Completed) | `tripListOrder` | `services/_shared/` |
| Reusable Prisma `include`s, model delegates | `prismaIncludes`, `modelDelegates` | `prisma/` |
| Zod helpers (`nullableOptional`, ids, coords, currency, URLs) | `zodHelpers` | `validation/zodHelpers.ts` |
| Outbound URL safety (SSRF) | `urlValidation` | `security/` |
| Request-time SSRF guard for user-configured URLs (DNS rebinding) | `integrationRequestOptions` | `security/integrationRequestGuard.ts` |
| Untrusted text going into an LLM prompt | `promptSafety` | `security/` |
| Field encryption (stored API keys) | `encryption` | `security/` |
| Rate limiters | `rateLimit` | `middleware/` |
| Errors | `AppError` | `errors/errors.ts` |
| Scheduled jobs | `cron` | `config/cron.ts` |

### Frontend

| Need | Use | Where |
| ---- | --- | ----- |
| Manager component CRUD state | `useManagerCRUD`, `useManagerFormWrapper`, `useFormReset` | `hooks/` |
| Stop double-submit | `useSubmitLock` | `hooks/` |
| "Save & Add Another" | `useSaveAndAddAnother` | `hooks/` |
| Create a Place with a matching activity/lodging (or reverse) | `useLinkedCreate` | `hooks/` |
| Unsaved-changes guard / drafts | `useUnsavedChangesWarning`, `useAutoSaveDraft`, `useDraftRestore` | `hooks/` |
| Per-field server validation errors | `useFieldErrors` | `hooks/` |
| Time zone display | `useTimezoneResolver`, `utils/timezone` | see CLAUDE.md |
| Date-only values | `formatDateOnly`, `dayKeyInTimezone` | `utils/timezone.ts` |
| Currency input / formatting | `CurrencySelect`, `formatCurrency` | `components/`, `utils/` |
| Distance/temperature display in the user's units | `useUnits`, `utils/units` | `hooks/`, `utils/` |
| Modals and form footers | `Modal`, `FormModal`, `shared/FormModalFooter`, `ConfirmDialog`, `useConfirmDialog` | `components/` |
| Bulk select / actions | `useBulkSelection`, `useBulkOperations`, `BulkActionBar` | `hooks/`, `components/` |
| Toasts | `utils/toast` | `utils/` |
| Error message extraction | `lib/errors` | `lib/` |
| Map tiles / config | `useMapTiles`, `utils/mapConfig`, `AppTileLayer` | `hooks/`, `utils/`, `components/` |
| Stop a map trapping page scroll on touch screens | `map/MapTouchGuard` (child of `MapContainer`) | `components/` |
| Fit a map to its pins | `utils/placesBounds` | `utils/` |
| List the calendar days of a trip (date-only, device-zone safe) | `timeline/tripDays` | `components/` |
| Clamped text with "Show more" | `shared/ExpandableText` | `components/` |
| Trip row actions menu (edit, archive, delete) | `TripActionsMenu` | `components/` |
| Safe post-login redirect / auth-page checks | `lib/authRedirect` | `lib/` |
| Photo viewer touch gestures (swipe, pinch, double-tap) | `utils/lightboxGestures` | `utils/` |
| Entity type metadata (labels, icons, colors) | `lib/entityConfig` | `lib/` |
| Maps-app deep links | `lib/mapsDeepLinks`, `useMapsPreferences` | `lib/`, `hooks/` |
| Loading / empty states | `LoadingSpinner`, `Skeleton`, `SkeletonLoader`, `EmptyState` | `components/` |
| Pagination | `usePagination`, `usePagedPagination`, `Pagination` | `hooks/`, `components/` |
