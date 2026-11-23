# Copy audit

Inventory of user-facing strings that should change to match the [Voice and Tone guide](VOICE_AND_TONE.md). It is the input for a later copy-pass PR: **no source strings were changed to produce it.**

## Status

Applied to `frontend/` and `mobile/` in the "Apply the voice and tone guide to the web and mobile apps" PR: **all P1 and P2 rows, and the mechanical P3 rules** (Couldn't X. Try again., no "Please" or "successfully", `…` in loading text, sentence case, confirm buttons that name the action). Backend rows ("Backend messages that reach the UI") were applied in the companion backend PR (#248), so both the frontend/mobile and backend rows are now applied.

Decisions taken: Transportation and Lodging are now **Transport** and **Stays** in all user-visible text (code, routes and API fields keep their names); the sign-in button stays "Begin your journey" (sentence case); the "Login successful" toast is gone; registering says "Welcome to Travel Life."

Rows not applied as written:

- `fe:hooks/useBulkOperations.ts` plural fix: the proposed `selectedIds.length == 1 ? 's' : ''` is inverted; the code now picks the singular or plural noun properly.
- `mob:lib/apiClient.ts` "Token refresh failed": the proposal says the session expired, but that error is thrown for server trouble, where the session is deliberately kept. It reads "The server couldn't refresh your sign-in (error N). Try again." instead.
- `fe:components/ImmichAlbumPanel.tsx` and `ImmichBulkImportDialog.tsx` keep Immich's own error text (a test pins "shows Immich's permission error as returned"); only the fallback wording changed.
- Em dashes in running UI text outside the strings above were left alone.

## How to read this

- `fe:` is `frontend/src/`, `mob:` is `mobile/src/`, `be:` is `backend/src/services/`. Line numbers are from `mobile-dusk-palette` at the time of writing, so re-grep the current text if a line has moved.
- **Priority.** P1 is seen daily (mobile Today and trip screens, the web dashboard, trip detail, timeline, the shared add/update/delete toasts and confirmations, offline and sync status, sign-in, the error boundary). P2 is seen weekly (budget, photos, journal, checklists, companions, invitations, mobile secondary screens). P3 is seen rarely (settings, integrations, admin).
- **Tests.** The Tests column says a test file contains the current text (matched on the first 32 to 40 characters; strings under 18 characters are not matched, so grep those by hand; expect a few false positives), so the apply step must update that test too. Re-run `grep -rn "<current text>" frontend/src mobile/src backend/src --include=*.test.*` before editing. 131 of the 827 rows below are asserted in tests.
- **Proposed text** follows the patterns in the guide. `${...}` marks interpolated values, which stay as they are. Rows marked "(keep ...)" are listed so nobody re-audits them.
- The rows were found by scripted search for `toast.*`, `setMessage`/`setError`, `confirm`/`useConfirmDialog`, `EmptyState`, `alert(`, `Alert.alert`, "Failed to", "Please", "successfully", "Are you sure", "No ... found", "Something went wrong", `AppError(`, then read and edited by hand for P1 and P2. Strings inside tests, logs and `console.*` calls were skipped. Multi-line `message:` values in confirm dialogs are only caught when the sentence sits on one line, so expect a few more of those when applying.

## Counts

| Pattern | P1 | P2 | P3 | Total |
| ------- | -: | -: | -: | ----: |
| Backend messages that reach the UI | 32 | 75 | 57 | 164 |
| Destructive confirmations: titles and messages | 13 | 25 | 29 | 67 |
| Destructive confirmations: buttons | 12 | 21 | 20 | 53 |
| Destructive confirmations: messages | 10 | 4 | 1 | 15 |
| Destructive confirmations (mobile) | 1 | 1 | 0 | 2 |
| Empty states and "not found" lines | 6 | 8 | 5 | 19 |
| Empty-state headlines and descriptions | 14 | 12 | 2 | 28 |
| Errors | 49 | 95 | 183 | 327 |
| Loading | 29 | 12 | 32 | 73 |
| Native browser dialogs (window.confirm, alert) | 4 | 4 | 1 | 9 |
| Offline and sync | 8 | 0 | 0 | 8 |
| Onboarding and sign-in | 1 | 0 | 0 | 1 |
| Success toasts | 13 | 13 | 13 | 39 |
| Validation and form messages | 3 | 2 | 17 | 22 |
| **Total** | **195** | **272** | **360** | **827** |

P1 and P2 rows are listed in full below (467). P3 rows (360) are summarised by pattern with the mechanical rule that rewrites them.

## Decisions needed before applying

1. **Feature names.** "Transportation" (tab, confirms, empty states) reads stiffly. The guide's vocabulary prefers "transport" in sentences but this audit keeps the tab name "Transportation". Decide whether the tab becomes "Transport", and likewise whether "Lodging" stays or becomes "Stays". Rows mentioning either assume the current names stay, except empty-state copy, which uses "stays" and "transport" in running text.
2. **Sign-in button.** "Begin Your Journey" is on the primary action of the login page. The proposal is a plain "Sign in", but it is the one place where brand flavour might be wanted. User's call.
3. **"Companions" vs "travel partner".** The app has both (trip companions, and a user-level travel partner with auto-sharing). The copy audit leaves both names alone.
4. **Backend messages.** Rewriting `AppError` text changes API responses, which the mobile app and tests may read. Rows tagged Backend are safe for display, but check mobile and `backend/src/**/__tests__` (the Tests column) before applying. "Trip not found or access denied" is deliberately ambiguous so it does not reveal which trips exist, and the proposal keeps it that way.
5. **"Unable to create account with the provided information"** is intentionally vague (account enumeration). Keep it.

## Structural gaps (one fix covers many rows)

- **No network-error message.** `getApiErrorMessage(err, fallback)` in `frontend/src/lib/errors.ts` falls back to the per-call string when the request never got a response, so a dropped connection says "Failed to save budget". Add one shared offline/network branch: *"Can't reach the server. Check your connection and try again."* (or, when the PWA knows it is offline, *"You're offline. This will save when you reconnect."*). That is the single highest-value change here.
- **Local copies of `getApiErrorMessage`.** `CalendarFeedSettings` and `MobilePairingSettings` each define their own local version that returns raw `err.message` (for network errors that is "Network Error"). Point them at the shared helper.
- **Raw `error.message` reaches the user** in `InlineEdit`, `CustomItemsManager`, `SavedLinksManager`, `GeneralEntityPickerModal`, `LinkEditModal`, and mobile `scan.tsx`, `share.tsx`, `sync.tsx`. Route these through the shared helper so they get the same wording.
- **Native `window.confirm`/`alert`** (listed under Native dialogs) cannot be styled, cannot name the action on the button, and block the page. Move them to `useConfirmDialog`.
- **One confirm helper is already good.** `useManagerCRUD` and `useBulkOperations` generate many confirms and toasts from one template, so editing those two files fixes dozens of screens.

## Errors

Rule: "Failed to X" becomes "Couldn't X. Try again." (drop "Please", never blame the user). Where the failure has a clear cause or fix, say it (see the guide).

| Pri | Location | Current | Proposed | Tests (text match) |
| --- | -------- | ------- | -------- | ------------------ |
| P1 | `fe:components/ActivityManager.tsx:282` | Failed to add activity | Couldn't add activity. Try again. |  |
| P1 | `fe:components/ActivityManager.tsx:381` | Failed to delete some activities | Couldn't delete some activities. Try again. |  |
| P1 | `fe:components/ActivityManager.tsx:402` | Failed to update some activities | Couldn't update some activities. Try again. |  |
| P1 | `fe:components/daily-view/DailyView.tsx:629` | Failed to load trip data. Please try refreshing the page. | Couldn't load this trip's days. Refresh the page to try again. |  |
| P1 | `fe:components/ErrorBoundary.tsx:50` | Something went wrong | This section didn't load | yes (errors.test.ts) |
| P1 | `fe:components/ErrorBoundary.tsx:53` | An error occurred while loading this content. | We couldn't show this section. Try again, or reload the page if it keeps happening. |  |
| P1 | `fe:components/ErrorBoundary.tsx:75` | Try Again | Try again |  |
| P1 | `fe:components/InlineEdit.tsx:106` | Failed to save | Couldn't save. Try again. |  |
| P1 | `fe:components/InlineEdit.tsx:271` | Failed to save | Couldn't save. Try again. |  |
| P1 | `fe:components/LocationManager.tsx:354` | Failed to add location | Couldn't add location. Try again. |  |
| P1 | `fe:components/LocationManager.tsx:391` | Failed to update favorite | Couldn't update favorite. Try again. |  |
| P1 | `fe:components/LocationManager.tsx:433` | Failed to delete some locations | Couldn't delete some locations. Try again. |  |
| P1 | `fe:components/LocationManager.tsx:454` | Failed to update some locations | Couldn't update some locations. Try again. |  |
| P1 | `fe:components/LodgingManager.tsx:520` | Failed to add lodging | Couldn't add lodging. Try again. |  |
| P1 | `fe:components/Timeline.tsx:255` | Failed to delete ${TIMELINE_TYPE_LABELS[item.type].toLowerCase()} | Couldn't delete ${TIMELINE_TYPE_LABELS[item.type].toLowerCase()}. Try again. |  |
| P1 | `fe:components/Timeline.tsx:815` | Failed to load timeline data | Couldn't load timeline data. Try again. |  |
| P1 | `fe:components/Timeline.tsx:1310` | Failed to refresh weather data | Couldn't refresh weather data. Try again. |  |
| P1 | `fe:components/Timeline.tsx:1373` | Error loading timeline. Please refresh the page. | Couldn't load the timeline. Refresh the page to try again. |  |
| P1 | `fe:components/TimelineEditModal.tsx:581` | Failed to update ${getItemTypeLabel().toLowerCase()} | Couldn't update ${getItemTypeLabel().toLowerCase()}. Try again. |  |
| P1 | `fe:components/TransportationManager.tsx:949` | Failed to delete some transportation items | Couldn't delete some transportation items. Try again. |  |
| P1 | `fe:components/TransportationManager.tsx:970` | Failed to update some transportation items | Couldn't update some transportation items. Try again. |  |
| P1 | `fe:components/trip-detail/DuplicateTripModal.tsx:77` | Failed to duplicate trip | Couldn't duplicate trip. Try again. |  |
| P1 | `fe:components/trip-detail/TripHighlights.tsx:59` | Failed to load highlights. | Couldn't load highlights. Try again. |  |
| P1 | `fe:components/trip-detail/TripPhotosTab.tsx:167` | Failed to update album | Couldn't update album. Try again. |  |
| P1 | `fe:components/trip-detail/TripPhotosTab.tsx:167` | Failed to create album | Couldn't create album. Try again. |  |
| P1 | `fe:components/trip-detail/TripPhotosTab.tsx:194` | Failed to delete album | Couldn't delete album. Try again. |  |
| P1 | `fe:components/trip-detail/TripPhotosTab.tsx:354` | Failed to remove cover photo | Couldn't remove cover photo. Try again. |  |
| P1 | `fe:components/trip-detail/TripPhotosTab.tsx:406` | Failed to set cover photo | Couldn't set cover photo. Try again. |  |
| P1 | `fe:components/UnscheduledItems.tsx:187` | Failed to load data | Couldn't load data. Try again. |  |
| P1 | `fe:components/UnscheduledItems.tsx:314` | Failed to save activity | Couldn't save activity. Try again. |  |
| P1 | `fe:components/UnscheduledItems.tsx:330` | Failed to delete activity | Couldn't delete activity. Try again. |  |
| P1 | `fe:components/UnscheduledItems.tsx:508` | Failed to save transportation | Couldn't save transportation. Try again. |  |
| P1 | `fe:components/UnscheduledItems.tsx:585` | Failed to save lodging | Couldn't save lodging. Try again. |  |
| P1 | `fe:components/widgets/TravelStatsWidget.tsx:159` | Failed to recalculate distances | Couldn't recalculate distances. Try again. |  |
| P1 | `fe:hooks/useBulkOperations.ts:107` | Failed to delete some ${entityName}s | Couldn't delete some ${entityName}s. Try again. |  |
| P1 | `fe:hooks/useBulkOperations.ts:134` | Failed to update some ${entityName}s | Couldn't update some ${entityName}s. Try again. |  |
| P1 | `fe:hooks/useManagerCRUD.ts:74` | Failed to load ${itemName}s | Couldn't load ${itemName}s. Try again. |  |
| P1 | `fe:hooks/useManagerCRUD.ts:94` | Failed to add ${itemName} | Couldn't add ${itemName}. Try again. |  |
| P1 | `fe:hooks/useManagerCRUD.ts:124` | Failed to update ${itemName} | Couldn't update ${itemName}. Try again. |  |
| P1 | `fe:hooks/useManagerCRUD.ts:145` | Failed to delete ${itemName} | Couldn't delete ${itemName}. Try again. |  |
| P1 | `fe:pages/LoginPage.tsx:14` | Single sign-on session expired. Please try again. | Single sign-on session expired. Try again. |  |
| P1 | `fe:pages/LoginPage.tsx:15` | Single sign-on failed. Please try again. | Single sign-on failed. Try again. |  |
| P1 | `fe:pages/TripDetailPage.tsx:379` | Failed to update checklist item | Couldn't update checklist item. Try again. |  |
| P1 | `fe:pages/TripsPage.tsx:222` | Failed to delete trip. Please try again. | Couldn't delete trip. Try again. |  |
| P1 | `fe:pages/TripsPage.tsx:259` | Failed to update trip status. | Couldn't update trip status. Try again. |  |
| P1 | `fe:pages/TripsPage.tsx:282` | Failed to update trip. | Couldn't update trip. Try again. |  |
| P1 | `mob:app/(tabs)/trip.tsx:418` | The review queue needs a connection. | Reviewing needs a connection. Try again when you're back online. |  |
| P1 | `mob:app/onboarding.tsx:43` | Something went wrong | Couldn't connect. Check the address and try again. | yes (errors.test.ts) |
| P1 | `mob:app/onboarding.tsx:99` | Single sign-on did not complete. Please try again. | Sign-in didn't finish. Try again. |  |
| P2 | `fe:components/BudgetManager.tsx:260` | Failed to save budget | Couldn't save budget. Try again. |  |
| P2 | `fe:components/BudgetManager.tsx:282` | Failed to remove budget | Couldn't remove budget. Try again. |  |
| P2 | `fe:components/BudgetManager.tsx:464` | Failed to update expense | Couldn't update expense. Try again. |  |
| P2 | `fe:components/BudgetManager.tsx:464` | Failed to add expense | Couldn't add expense. Try again. |  |
| P2 | `fe:components/BudgetManager.tsx:504` | Failed to delete expense | Couldn't delete expense. Try again. |  |
| P2 | `fe:components/ChecklistSelectorModal.tsx:65` | Failed to update checklists | Couldn't update checklists. Try again. |  |
| P2 | `fe:components/CompanionAvatar.tsx:132` | Failed to upload avatar | Couldn't upload avatar. Try again. |  |
| P2 | `fe:components/CompanionAvatar.tsx:150` | Failed to remove avatar | Couldn't remove avatar. Try again. |  |
| P2 | `fe:components/CompanionManager.tsx:71` | Failed to load companions | Couldn't load companions. Try again. |  |
| P2 | `fe:components/CompanionManager.tsx:100` | Failed to create companion | Couldn't create companion. Try again. |  |
| P2 | `fe:components/CompanionManager.tsx:122` | Failed to update companion | Couldn't update companion. Try again. |  |
| P2 | `fe:components/CompanionManager.tsx:137` | Failed to add companion | Couldn't add companion. Try again. |  |
| P2 | `fe:components/CompanionManager.tsx:158` | Failed to remove companion | Couldn't remove companion. Try again. |  |
| P2 | `fe:components/EmergencyCard.tsx:178` | Failed to save emergency details | Couldn't save emergency details. Try again. |  |
| P2 | `fe:components/EmergencyCard.tsx:200` | Failed to clear emergency details | Couldn't clear emergency details. Try again. |  |
| P2 | `fe:components/EmergencyCard.tsx:224` | Failed to save medical details | Couldn't save medical details. Try again. |  |
| P2 | `fe:components/JournalManager.tsx:381` | Couldn't generate a draft. Please try again. | Couldn't generate a draft. Try again. |  |
| P2 | `fe:components/PhotoGallery.tsx:698` | Failed to add to favorites | Couldn't add to favorites. Try again. |  |
| P2 | `fe:components/PhotoGallery.tsx:698` | Failed to remove from favorites | Couldn't remove from favorites. Try again. |  |
| P2 | `fe:components/PhotoGallery.tsx:718` | Failed to delete photo | Couldn't delete photo. Try again. |  |
| P2 | `fe:components/PhotoGallery.tsx:734` | Failed to update photo | Couldn't update photo. Try again. |  |
| P2 | `fe:components/PhotoGallery.tsx:798` | Failed to load all photos | Couldn't load all photos. Try again. |  |
| P2 | `fe:components/PhotoGallery.tsx:823` | Failed to add photos to album | Couldn't add photos to album. Try again. |  |
| P2 | `fe:components/PhotoGallery.tsx:864` | Failed to create album | Couldn't create album. Try again. |  |
| P2 | `fe:components/PhotoGallery.tsx:894` | Failed to remove photos from album | Couldn't remove photos from album. Try again. |  |
| P2 | `fe:components/PhotoGallery.tsx:922` | Failed to delete photos | Couldn't delete photos. Try again. |  |
| P2 | `fe:components/PhotoUpload.tsx:239` | Failed to link Immich photos | Couldn't link Immich photos. Try again. |  |
| P2 | `fe:components/PhotoUpload.tsx:412` | Failed to upload photos | Couldn't upload photos. Try again. |  |
| P2 | `fe:components/pwa/MapCachePreview.tsx:178` | Failed to download tiles | Couldn't download tiles. Try again. |  |
| P2 | `fe:components/pwa/MapCachePreview.tsx:201` | Failed to clear cache | Couldn't clear cache. Try again. |  |
| P2 | `fe:components/pwa/OfflineDownloadButton.tsx:72` | Failed to check status | Couldn't check status. Try again. |  |
| P2 | `fe:components/pwa/OfflineDownloadButton.tsx:107` | Failed to remove | Couldn't remove. Try again. |  |
| P2 | `fe:components/SettlementFormModal.tsx:85` | Failed to save payment | Couldn't save payment. Try again. |  |
| P2 | `fe:components/SettleUpPanel.tsx:67` | Failed to delete payment | Couldn't delete payment. Try again. |  |
| P2 | `fe:components/SouvenirManager.tsx:127` | Failed to load souvenirs | Couldn't load souvenirs. Try again. |  |
| P2 | `fe:components/SouvenirManager.tsx:221` | Failed to save souvenir | Couldn't save souvenir. Try again. |  |
| P2 | `fe:components/SouvenirManager.tsx:244` | Failed to update purchase status | Couldn't update purchase status. Try again. |  |
| P2 | `fe:components/SouvenirManager.tsx:265` | Failed to delete souvenir | Couldn't delete souvenir. Try again. |  |
| P2 | `fe:components/TravelDocumentManager.tsx:92` | Failed to load travel documents | Couldn't load travel documents. Try again. |  |
| P2 | `fe:components/TravelDocumentManager.tsx:127` | Failed to add document | Couldn't add document. Try again. |  |
| P2 | `fe:components/TravelDocumentManager.tsx:158` | Failed to update document | Couldn't update document. Try again. |  |
| P2 | `fe:components/TravelDocumentManager.tsx:176` | Failed to delete document | Couldn't delete document. Try again. |  |
| P2 | `fe:hooks/useOfflineMap.ts:382` | Failed to cache tiles | Couldn't cache tiles. Try again. |  |
| P2 | `fe:hooks/useOfflineMap.ts:409` | Failed to clear cache | Couldn't clear cache. Try again. |  |
| P2 | `fe:hooks/useOfflineSearch.ts:257` | Search failed. Please try again. | Search failed. Try again. |  |
| P2 | `fe:hooks/useOfflineSearch.ts:350` | Search failed. Please try again. | Search failed. Try again. |  |
| P2 | `fe:hooks/useSyncConflicts.ts:263` | Failed to resolve conflict | Couldn't resolve conflict. Try again. |  |
| P2 | `fe:hooks/useSyncConflicts.ts:307` | Failed to resolve all conflicts | Couldn't resolve all conflicts. Try again. |  |
| P2 | `fe:pages/AcceptInvitePage.tsx:108` | Failed to create account | Couldn't create account. Try again. |  |
| P2 | `fe:pages/AcceptInvitePage.tsx:110` | Failed to create account | Couldn't create account. Try again. |  |
| P2 | `fe:pages/AcceptInvitePage.tsx:134` | Failed to decline invitation | Couldn't decline invitation. Try again. |  |
| P2 | `fe:pages/AcceptInvitePage.tsx:136` | Failed to decline invitation | Couldn't decline invitation. Try again. |  |
| P2 | `fe:pages/AcceptInvitePage.tsx:195` | This invitation has expired. Please ask the person who invited you to send a new invitation. | This invitation has expired. Ask the person who invited you to send a new one. |  |
| P2 | `fe:pages/AlbumsPage.tsx:57` | Failed to load albums | Couldn't load albums. Try again. |  |
| P2 | `fe:pages/AlbumsPage.tsx:223` | Failed to create album | Couldn't create album. Try again. |  |
| P2 | `fe:pages/AlbumsPage.tsx:243` | Failed to delete album | Couldn't delete album. Try again. |  |
| P2 | `fe:pages/AlbumsPage.tsx:292` | Failed to load album photos | Couldn't load album photos. Try again. |  |
| P2 | `fe:pages/AlbumsPage.tsx:310` | Failed to set cover photo | Couldn't set cover photo. Try again. |  |
| P2 | `fe:pages/ChecklistDetailPage.tsx:31` | Failed to load checklist | Couldn't load checklist. Try again. |  |
| P2 | `fe:pages/ChecklistDetailPage.tsx:49` | Failed to update item | Couldn't update item. Try again. |  |
| P2 | `fe:pages/ChecklistDetailPage.tsx:69` | Failed to add item | Couldn't add item. Try again. |  |
| P2 | `fe:pages/ChecklistDetailPage.tsx:89` | Failed to delete item | Couldn't delete item. Try again. |  |
| P2 | `fe:pages/ChecklistDetailPage.tsx:104` | Failed to update checklist name | Couldn't update checklist name. Try again. |  |
| P2 | `fe:pages/ChecklistsPage.tsx:44` | Failed to load checklists | Couldn't load checklists. Try again. |  |
| P2 | `fe:pages/ChecklistsPage.tsx:86` | Failed to initialize default checklists. They may already exist. | Couldn't set up the default checklists. They may already exist. |  |
| P2 | `fe:pages/ChecklistsPage.tsx:104` | Failed to auto-check items from trips | Couldn't auto-check items from trips. Try again. |  |
| P2 | `fe:pages/ChecklistsPage.tsx:129` | Failed to create checklist | Couldn't create checklist. Try again. |  |
| P2 | `fe:pages/ChecklistsPage.tsx:149` | Failed to delete checklist | Couldn't delete checklist. Try again. |  |
| P2 | `fe:pages/CompanionsPage.tsx:100` | Failed to load companions | Couldn't load companions. Try again. |  |
| P2 | `fe:pages/CompanionsPage.tsx:120` | Failed to create companion | Couldn't create companion. Try again. |  |
| P2 | `fe:pages/CompanionsPage.tsx:140` | Failed to update companion | Couldn't update companion. Try again. |  |
| P2 | `fe:pages/CompanionsPage.tsx:158` | Failed to delete companion | Couldn't delete companion. Try again. |  |
| P2 | `fe:pages/CompanionsPage.tsx:191` | Failed to load trips | Couldn't load trips. Try again. |  |
| P2 | `fe:pages/CompanionsPage.tsx:229` | Failed to load trips | Couldn't load trips. Try again. |  |
| P2 | `fe:pages/CompanionsPage.tsx:255` | Failed to add companion to trip | Couldn't add companion to trip. Try again. |  |
| P2 | `fe:pages/CompanionsPage.tsx:285` | Failed to set avatar | Couldn't set avatar. Try again. |  |
| P2 | `fe:pages/CompanionsPage.tsx:329` | Failed to remove companion from trip | Couldn't remove companion from trip. Try again. |  |
| P2 | `fe:pages/SavedLinksInboxPage.tsx:91` | Failed to save link | Couldn't save link. Try again. |  |
| P2 | `fe:pages/SavedLinksInboxPage.tsx:104` | Failed to assign link | Couldn't assign link. Try again. |  |
| P2 | `fe:pages/SavedLinksInboxPage.tsx:124` | Failed to delete link | Couldn't delete link. Try again. |  |
| P2 | `fe:pages/SavedLinksInboxPage.tsx:147` | Failed to delete links | Couldn't delete links. Try again. |  |
| P2 | `fe:pages/SavedLinksInboxPage.tsx:177` | Failed to delete links | Couldn't delete links. Try again. |  |
| P2 | `mob:app/(tabs)/vault.tsx:105` | Could not update languages | Couldn't update languages. Try again. |  |
| P2 | `mob:app/(tabs)/vault.tsx:128` | Could not verify it is you. Try again. | Couldn't confirm it's you. Try again. |  |
| P2 | `mob:app/onboarding.tsx:60` | Could not reach a Travel Life server at ${url}. | Couldn't reach a Travel Life server at ${url}. Check the address and your connection. |  |
| P2 | `mob:app/receipt.tsx:101` | Camera permission is needed to scan a receipt. | Allow camera access in Settings to scan a receipt. |  |
| P2 | `mob:app/scan.tsx:32` | Pairing failed | Couldn't pair this phone. Make sure the code is current and try again. |  |
| P2 | `mob:app/share.tsx:57` | Could not save that | Couldn't save that. Try again. |  |
| P2 | `mob:app/trips.tsx:186` | Trips shared with you could not be loaded just now. | Couldn't load trips shared with you. Try again in a moment. |  |
| P2 | `mob:lib/apiClient.ts:132` | Network request failed | You're offline, or the server can't be reached. | yes (track.test.ts, apiClient.test.ts) |
| P2 | `mob:lib/apiClient.ts:192` | Token refresh failed (${status}) | Your session expired. Sign in again. |  |
| P2 | `mob:lib/apiClient.ts:228` | Request failed (${status}) | The server couldn't complete that (error ${status}). Try again. |  |
| P2 | `mob:lib/navigation.ts:20` | Alert 'Nothing to navigate to' / 'This item has no address or coordinates yet.' | Alert 'No directions yet' / 'Add an address or a pin to this item and directions will work.' |  |
| P2 | `mob:lib/navigation.ts:29` | Alert 'Could not open maps' / 'No app on this phone could open the directions.' | Alert "Couldn't open maps" / 'No maps app on this phone could open these directions.' |  |
| P2 | `mob:tasks/location.ts:159` | Could not get a GPS fix to ${purpose}. Try again outdoors, or enter the place by hand. | Couldn't get your location to ${purpose}. Try again outdoors, or enter the place by hand. |  |

P3 (183 rows, not listed): same rule applied to settings, integrations and admin screens. Examples: `fe:components/AddPhotosToAlbumModal.tsx:196` "Failed to add photos to album" to "Couldn't add photos to album. Try again."; `fe:components/AirportSearchInput.tsx:95` "Failed to search airports" to "Couldn't search airports. Try again."; `fe:components/AirportSearchInput.tsx:143` "Failed to add airport" to "Couldn't add airport. Try again."; `fe:components/AlbumSuggestions.tsx:224` "Failed to create album" to "Couldn't create album. Try again.". Regenerate the full list with the search terms in "How to read this".

## Validation and form messages

Rule: drop "Please"; say what to enter. "Please select a PDF file" becomes "Choose a PDF file."

| Pri | Location | Current | Proposed | Tests (text match) |
| --- | -------- | ------- | -------- | ------------------ |
| P1 | `fe:components/trip-detail/DuplicateTripModal.tsx:63` | Please enter a title for the duplicated trip | Enter a title for the duplicated trip |  |
| P1 | `fe:components/UnscheduledItems.tsx:449` | Please select a valid transportation type | Select a valid transportation type |  |
| P1 | `fe:components/UnscheduledItems.tsx:525` | Please select a valid lodging type | Select a valid lodging type |  |
| P2 | `fe:pages/AcceptInvitePage.tsx:78` | Please enter a username | Enter a username |  |
| P2 | `mob:app/receipt.tsx:237` | The total was hard to read — please check the amount. | The total was hard to read. Check the amount. |  |

P3 (17 rows, not listed): same rule applied to settings, integrations and admin screens. Examples: `fe:components/AviationstackSettings.tsx:31` "Please enter an API key" to "Enter an API key"; `fe:components/BulkEditModal.tsx:113` "Please fill in at least one field to update" to "Fill in at least one field to update"; `fe:components/ImmichSettings.tsx:35` "Please enter both API URL and API Key" to "Enter both API URL and API Key"; `fe:components/ImmichSettings.tsx:59` "Please enter both API URL and API Key" to "Enter both API URL and API Key". Regenerate the full list with the search terms in "How to read this".

## Success toasts

Rule: drop "successfully" and trailing "!"; say what happened ("Activity added").

| Pri | Location | Current | Proposed | Tests (text match) |
| --- | -------- | ------- | -------- | ------------------ |
| P1 | `fe:components/ActivityManager.tsx:264` | Activity added successfully | Activity added | yes (BookingDeadlinesInForms.test.tsx) |
| P1 | `fe:components/LocationManager.tsx:346` | Location added successfully | Location added |  |
| P1 | `fe:components/LodgingManager.tsx:485` | Lodging added successfully | Lodging added |  |
| P1 | `fe:components/Timeline.tsx:1307` | Weather data refreshed successfully (${weather?.length \|\| 0} days) | Weather updated for ${weather?.length \|\| 0} days |  |
| P1 | `fe:components/TimelineEditModal.tsx:576` | ${getItemTypeLabel()} updated successfully | ${getItemTypeLabel()} updated |  |
| P1 | `fe:components/trip-detail/DuplicateTripModal.tsx:72` | Trip duplicated successfully! | Trip duplicated |  |
| P1 | `fe:hooks/useBulkOperations.ts:101` | Deleted ${selectedIds.length} ${entityName}${selectedIds.length !== 1 ? 's' : ''} | Deleted ${selectedIds.length} ${entityName}${selectedIds.length == 1 ? 's' : ''} |  |
| P1 | `fe:hooks/useBulkOperations.ts:127` | Updated ${selectedIds.length} ${entityName}${selectedIds.length !== 1 ? 's' : ''} | Updated ${selectedIds.length} ${entityName}${selectedIds.length == 1 ? 's' : ''} |  |
| P1 | `fe:hooks/useManagerCRUD.ts:88` | ${capitalize(itemName)} added successfully | ${capitalize(itemName)} added | yes (BookingDeadlinesInForms.test.tsx) |
| P1 | `fe:hooks/useManagerCRUD.ts:118` | ${capitalize(itemName)} updated successfully | ${capitalize(itemName)} updated |  |
| P1 | `fe:hooks/useManagerCRUD.ts:139` | ${capitalize(itemName)} deleted successfully | ${capitalize(itemName)} deleted | yes (AppToaster.test.tsx) |
| P1 | `fe:pages/LoginPage.tsx:61` | Login successful! | (drop the toast; arriving on the dashboard is the confirmation) |  |
| P1 | `mob:app/(tabs)/trip.tsx:201` | 'Added to the trip' / 'Rejected' | 'Added to the trip' / 'Dismissed' |  |
| P2 | `fe:components/PhotoGallery.tsx:821` | Successfully added ${selectedPhotoIds.size} photo(s) to album | Added ${selectedPhotoIds.size} photo(s) to album |  |
| P2 | `fe:components/PhotoGallery.tsx:861` | Successfully created album "${newAlbum.name}" with ${selectedPhotoIds.size} photo(s) | Created album "${newAlbum.name}" with ${selectedPhotoIds.size} photo(s) |  |
| P2 | `fe:components/PhotoGallery.tsx:892` | Successfully removed ${photoIds.length} photo(s) from album | Removed ${photoIds.length} photo(s) from album |  |
| P2 | `fe:components/PhotoUpload.tsx:202` | Linked ${totalSuccessful} of ${assets.length} photos successfully (${totalFailed} failed) | Linked ${totalSuccessful} of ${assets.length} photos. ${totalFailed} could not be linked. |  |
| P2 | `fe:components/PhotoUpload.tsx:209` | Successfully linked all ${totalSuccessful} photos! | Linked all ${totalSuccessful} photos |  |
| P2 | `fe:components/PhotoUpload.tsx:357` | Successfully imported album "${album.albumName}" with ${totalSuccessful} photos! | Imported album "${album.albumName}" with ${totalSuccessful} photos |  |
| P2 | `fe:components/pwa/OfflineDownloadModal.tsx:272` | Trip Downloaded Successfully | Trip saved for offline use |  |
| P2 | `fe:pages/AcceptInvitePage.tsx:104` | Account created successfully! Welcome to Travel Life! | Account created. Welcome to Travel Life. |  |
| P2 | `fe:pages/ChecklistsPage.tsx:83` | Default checklists initialized successfully! | Default checklists initialized |  |
| P2 | `fe:pages/ChecklistsPage.tsx:97` | Successfully auto-checked ${result.updated} item${result.updated === 1 ? '' : 's'} based on your trips! | Checked off ${result.updated} item${result.updated === 1 ? "" : "s"} from your trips |  |
| P2 | `fe:pages/ChecklistsPage.tsx:168` | Successfully added ${result.added} default checklists | Added ${result.added} default checklists |  |
| P2 | `fe:pages/ChecklistsPage.tsx:173` | Successfully removed ${result.removed} default checklists | Removed ${result.removed} default checklists |  |
| P2 | `fe:pages/RegisterPage.tsx:52` | Registration successful! | Welcome to Travel Life. |  |

P3 (13 rows, not listed): same rule applied to settings, integrations and admin screens. Examples: `fe:components/AlbumSuggestions.tsx:217` "Album "${suggestion.name}" created!" to "Album "${suggestion.name}" created"; `fe:components/EntityPickerModal.tsx:52` "Linked ${result.created} photo${result.created !== 1 ? 's' :" to "Linked ${result.created} photo${result.created == 1 ? 's' : "; `fe:components/ImmichSettings.tsx:45` "Successfully connected to Immich!" to "Connected to Immich"; `fe:components/InviteUsersSection.tsx:67` "Invitation sent successfully!" to "Invitation sent". Regenerate the full list with the search terms in "How to read this".

## Destructive confirmations: titles and messages

Rule: sentence case; the title names the action and the thing ("Delete activity"); the message states the consequence and drops "This action cannot be undone."

| Pri | Location | Current | Proposed | Tests (text match) |
| --- | -------- | ------- | -------- | ------------------ |
| P1 | `fe:components/ActivityManager.tsx:350` | Delete Activity | Delete activity |  |
| P1 | `fe:components/ActivityManager.tsx:365` | Delete Activities | Delete activities |  |
| P1 | `fe:components/LocationManager.tsx:400` | Delete Location | Delete location |  |
| P1 | `fe:components/LocationManager.tsx:417` | Delete Locations | Delete locations |  |
| P1 | `fe:components/LodgingManager.tsx:527` | Delete Lodging | Delete lodging |  |
| P1 | `fe:components/TransportationManager.tsx:918` | Delete Transportation | Delete transportation |  |
| P1 | `fe:components/TransportationManager.tsx:933` | Delete Transportation | Delete transportation |  |
| P1 | `fe:components/trip-detail/TripPhotosTab.tsx:175` | Delete Album | Delete album |  |
| P1 | `fe:components/trip-detail/TripPhotosTab.tsx:338` | Remove Cover Photo | Remove cover photo |  |
| P1 | `fe:components/trip-detail/TripPhotosTab.tsx:340` | Are you sure you want to remove the cover photo from this trip? | Remove the cover photo from this trip? The photo stays in your library. |  |
| P1 | `fe:hooks/useManagerCRUD.ts:158` | Are you sure you want to delete this ${itemName}? This action cannot be undone. | Delete this ${itemName}? You can't undo this. |  |
| P1 | `fe:pages/TripsPage.tsx:351` | Delete Trip | Delete trip |  |
| P1 | `fe:pages/TripsPage.tsx:352` | Are you sure you want to delete this trip? This will remove all associated locations, photos, transportation, lodging, activities, and journal entries. | Delete "${trip.title}"? Its places, photos, transport, stays, activities and journal entries are deleted with it. You can't undo this. |  |
| P2 | `fe:components/BudgetManager.tsx:268` | Remove Budget | Remove budget |  |
| P2 | `fe:components/BudgetManager.tsx:489` | Delete Expense | Delete expense |  |
| P2 | `fe:components/DeadlinesManager.tsx:180` | Delete Deadline | Delete deadline |  |
| P2 | `fe:components/FoodLogManager.tsx:297` | Delete Entry | Delete entry |  |
| P2 | `fe:components/JournalManager.tsx:433` | Delete Journal Entry | Delete journal entry |  |
| P2 | `fe:components/PhotoGallery.tsx:705` | Delete Photo | Delete photo |  |
| P2 | `fe:components/PhotoGallery.tsx:707` | Are you sure you want to delete this photo? This action cannot be undone. | Delete this photo? It's removed from the trip, albums and map. You can't undo this. |  |
| P2 | `fe:components/PhotoGallery.tsx:874` | Remove Photos | Remove photos |  |
| P2 | `fe:components/PhotoGallery.tsx:904` | Delete Photos | Delete photos |  |
| P2 | `fe:components/PhotoGallery.tsx:905` | Are you sure you want to delete ${selectedPhotoIds.size} photo(s)? This action cannot be undone. | Delete ${count} photos? They're removed from the trip, albums and map. You can't undo this. |  |
| P2 | `fe:components/SettleUpPanel.tsx:56` | Delete Payment | Delete payment |  |
| P2 | `fe:components/SouvenirManager.tsx:250` | Delete Souvenir | Delete souvenir |  |
| P2 | `fe:components/SouvenirManager.tsx:251` | Are you sure you want to delete this souvenir? This action cannot be undone. | Delete this souvenir? You can't undo this. |  |
| P2 | `fe:components/TravelDocumentManager.tsx:164` | Delete Document | Delete document |  |
| P2 | `fe:pages/AcceptInvitePage.tsx:124` | Are you sure you want to decline this invitation? This action cannot be undone. | You'd need a new invitation to join this trip later. |  |
| P2 | `fe:pages/AlbumsPage.tsx:229` | Delete Album | Delete album |  |
| P2 | `fe:pages/AlbumsPage.tsx:230` | Are you sure you want to delete this album? Photos will not be deleted. | Delete this album? The photos stay in your library. |  |
| P2 | `fe:pages/ChecklistDetailPage.tsx:75` | Delete Item | Delete item |  |
| P2 | `fe:pages/ChecklistDetailPage.tsx:76` | Are you sure you want to delete this item? | Delete this item from the checklist? |  |
| P2 | `fe:pages/ChecklistsPage.tsx:70` | Initialize Default Checklists | Initialize default checklists |  |
| P2 | `fe:pages/ChecklistsPage.tsx:135` | Delete Checklist | Delete checklist |  |
| P2 | `fe:pages/ChecklistsPage.tsx:136` | Are you sure you want to delete this checklist? This cannot be undone. | Delete this checklist and all its items? You can't undo this. |  |
| P2 | `fe:pages/CompanionsPage.tsx:146` | Delete Companion | Delete companion |  |
| P2 | `fe:pages/SavedLinksInboxPage.tsx:133` | Delete Links | Delete links |  |
| P2 | `fe:pages/SavedLinksInboxPage.tsx:162` | Delete All Unassigned Links | Delete all unassigned links |  |

P3 (29 rows, not listed): same rule applied to settings, integrations and admin screens. Examples: `fe:components/AviationstackSettings.tsx:56` "Remove Aviationstack API Key" to "Remove aviationstack API key"; `fe:components/AviationstackSettings.tsx:57` "Are you sure you want to remove your Aviationstack API key?" to "Remove your Aviationstack API key?"; `fe:components/CalendarFeedSettings.tsx:62` "Rotate Calendar Feed URL" to "Rotate calendar feed URL"; `fe:components/CalendarFeedSettings.tsx:95` "Disable Calendar Feed" to "Disable calendar feed". Regenerate the full list with the search terms in "How to read this".

## Destructive confirmations: messages

Rule: replace "This action cannot be undone." with "You can't undo this." and state what else goes with the thing.

| Pri | Location | Current | Proposed | Tests (text match) |
| --- | -------- | ------- | -------- | ------------------ |
| P1 | `fe:components/ActivityManager.tsx:351` | Delete this activity and all its sub-activities? This action cannot be undone. | Delete this activity and all its sub-activities? You can't undo this. |  |
| P1 | `fe:components/ActivityManager.tsx:366` | Delete ${selectedIds.length} selected activities? This action cannot be undone. | Delete ${selectedIds.length} selected activities? You can't undo this. |  |
| P1 | `fe:components/LocationManager.tsx:402` | Delete "${location?.name}" and all its child locations? This action cannot be undone. | Delete "${location?.name}" and all its child locations? You can't undo this. |  |
| P1 | `fe:components/LocationManager.tsx:403` | Delete "${location?.name}"? This action cannot be undone. | Delete "${location?.name}"? You can't undo this. |  |
| P1 | `fe:components/LocationManager.tsx:418` | Delete ${selectedIds.length} selected locations? This action cannot be undone. | Delete ${selectedIds.length} selected locations? You can't undo this. |  |
| P1 | `fe:components/LodgingManager.tsx:528` | Delete this lodging? This action cannot be undone. | Delete this lodging? You can't undo this. |  |
| P1 | `fe:components/TransportationManager.tsx:919` | Delete this transportation? This action cannot be undone. | Delete this transportation? You can't undo this. |  |
| P1 | `fe:components/TransportationManager.tsx:934` | Delete ${selectedIds.length} selected transportation items? This action cannot be undone. | Delete ${selectedIds.length} selected transportation items? You can't undo this. |  |
| P1 | `fe:components/UnscheduledItems.tsx:321` | Delete this activity? This action cannot be undone. | Delete this activity? You can't undo this. |  |
| P1 | `fe:hooks/useBulkOperations.ts:92` | Delete ${selectedIds.length} selected ${entityName}${selectedIds.length !== 1 ? 's' : ''}? This action cannot be undone. | Delete ${count} ${entityName}s? You can't undo this. |  |
| P2 | `fe:components/JournalManager.tsx:434` | Delete this journal entry? This action cannot be undone. | Delete this journal entry? You can't undo this. |  |
| P2 | `fe:components/pwa/ConflictsList.tsx:336` | This action cannot be undone. | You can't undo this. |  |
| P2 | `fe:components/TravelDocumentManager.tsx:165` | Delete "${doc.name}"? This action cannot be undone. | Delete "${doc.name}"? You can't undo this. |  |
| P2 | `fe:pages/SavedLinksInboxPage.tsx:134` | Delete ${ids.length} selected link${ids.length === 1 ? "" : "s"}? This action cannot be undone. | Delete ${ids.length} selected link${ids.length === 1 ? "" : "s"}? You can't undo this. |  |

P3 (1 rows, not listed): same rule applied to settings, integrations and admin screens. Examples: `fe:components/LoyaltyProgramManager.tsx:127` "Delete "${program.name}"? Bookings that used it keep working" to "Delete "${program.name}"? Bookings that used it keep working". Regenerate the full list with the search terms in "How to read this".

## Destructive confirmations: buttons

Rule: the button repeats the action and the thing ("Delete activity", "Delete 3 activities"), never "OK", "Yes" or a bare "Delete" on a multi-thing dialog.

| Pri | Location | Current | Proposed | Tests (text match) |
| --- | -------- | ------- | -------- | ------------------ |
| P1 | `fe:components/ActivityManager.tsx:352` | Delete | Delete activity |  |
| P1 | `fe:components/ActivityManager.tsx:367` | Delete All | Delete N activities (count in label) |  |
| P1 | `fe:components/LocationManager.tsx:404` | Delete | Delete location |  |
| P1 | `fe:components/LocationManager.tsx:419` | Delete All | Delete N locations (count in label) |  |
| P1 | `fe:components/LodgingManager.tsx:529` | Delete | Delete lodging |  |
| P1 | `fe:components/TransportationManager.tsx:920` | Delete | Delete transportation |  |
| P1 | `fe:components/TransportationManager.tsx:935` | Delete All | Delete N transportation (count in label) |  |
| P1 | `fe:components/trip-detail/TripPhotosTab.tsx:177` | Delete | Delete album |  |
| P1 | `fe:components/trip-detail/TripPhotosTab.tsx:341` | Remove | Remove cover photo |  |
| P1 | `fe:hooks/useBulkOperations.ts:93` | Delete All | Delete ${count} ${entityName}s |  |
| P1 | `fe:hooks/useManagerCRUD.ts:159` | Delete | Delete ${itemName} |  |
| P1 | `fe:pages/TripsPage.tsx:353` | Delete Trip | Delete trip |  |
| P2 | `fe:components/BudgetManager.tsx:270` | Remove | Remove budget |  |
| P2 | `fe:components/BudgetManager.tsx:493` | Delete | Delete expense |  |
| P2 | `fe:components/CompanionManager.tsx:147` | Remove | Remove from trip |  |
| P2 | `fe:components/DeadlinesManager.tsx:182` | Delete | Delete deadline |  |
| P2 | `fe:components/EmergencyCard.tsx:189` | Clear | Clear emergency details |  |
| P2 | `fe:components/FoodLogManager.tsx:299` | Delete | Delete entry |  |
| P2 | `fe:components/JournalManager.tsx:435` | Delete | Delete journal entry |  |
| P2 | `fe:components/PhotoGallery.tsx:708` | Delete | Delete photo |  |
| P2 | `fe:components/PhotoGallery.tsx:876` | Remove | Remove photos |  |
| P2 | `fe:components/PhotoGallery.tsx:906` | Delete | Delete photos |  |
| P2 | `fe:components/SettleUpPanel.tsx:58` | Delete | Delete payment |  |
| P2 | `fe:components/SouvenirManager.tsx:252` | Delete | Delete souvenir |  |
| P2 | `fe:components/TravelDocumentManager.tsx:166` | Delete | Delete document |  |
| P2 | `fe:pages/AlbumsPage.tsx:231` | Delete | Delete album |  |
| P2 | `fe:pages/ChecklistDetailPage.tsx:77` | Delete | Delete item |  |
| P2 | `fe:pages/ChecklistsPage.tsx:137` | Delete | Delete checklist |  |
| P2 | `fe:pages/CompanionsPage.tsx:148` | Delete | Delete companion |  |
| P2 | `fe:pages/CompanionsPage.tsx:309` | Remove | Remove from trip |  |
| P2 | `fe:pages/SavedLinksInboxPage.tsx:114` | Delete | Delete link |  |
| P2 | `fe:pages/SavedLinksInboxPage.tsx:135` | Delete All | Delete N links (count in label) |  |
| P2 | `fe:pages/SavedLinksInboxPage.tsx:164` | Delete All | Delete ${total} unassigned links |  |

P3 (20 rows, not listed): same rule applied to settings, integrations and admin screens. Examples: `fe:components/AviationstackSettings.tsx:58` "Remove" to "Remove aviationstack API key"; `fe:components/CollaboratorsManager.tsx:90` "Remove" to "Remove collaborator"; `fe:components/CustomItemsManager.tsx:233` "Delete" to "Delete custom item"; `fe:components/CustomItemsManager.tsx:254` "Delete All" to "Delete N custom items (count in label)". Regenerate the full list with the search terms in "How to read this".

## Native browser dialogs (window.confirm, alert)

Rule: replace with `useConfirmDialog`, using the destructive pattern.

| Pri | Location | Current | Proposed | Tests (text match) |
| --- | -------- | ------- | -------- | ------------------ |
| P1 | `fe:components/ActivityManager.tsx:638` | You have unsaved changes. Are you sure you want to close? | useConfirmDialog: title "Discard unsaved changes?", message "Your edits to this form will be lost.", confirm "Discard changes", cancel "Keep editing" |  |
| P1 | `fe:components/LodgingManager.tsx:600` | You have unsaved changes. Are you sure you want to close? | useConfirmDialog: title "Discard unsaved changes?", message "Your edits to this form will be lost.", confirm "Discard changes", cancel "Keep editing" |  |
| P1 | `fe:components/Timeline.tsx:227` | Are you sure you want to delete "${item.title}"? | confirm({ title: "Delete ${type}?", message: '"${item.title}" comes off your timeline. You can't undo this.', confirmLabel: "Delete ${type}" }) via useConfirmDialog |  |
| P1 | `fe:components/TransportationManager.tsx:1105` | You have unsaved changes. Are you sure you want to close? | useConfirmDialog: title "Discard unsaved changes?", message "Your edits to this form will be lost.", confirm "Discard changes", cancel "Keep editing" |  |
| P2 | `fe:components/JournalManager.tsx:354` | const replace = window.confirm( | Replace with useConfirmDialog using the destructive confirm pattern (name the thing, state the consequence, button says the action) |  |
| P2 | `fe:components/JournalManager.tsx:449` | You have unsaved changes. Are you sure you want to close? | useConfirmDialog: title "Discard unsaved changes?", message "Your edits to this form will be lost.", confirm "Discard changes", cancel "Keep editing" |  |
| P2 | `fe:components/pwa/OfflineDownloadButton.tsx:96` | Remove offline data for this trip? You will need to download again to access offline. | Replace with useConfirmDialog using the destructive confirm pattern (name the thing, state the consequence, button says the action) |  |
| P2 | `fe:pages/AcceptInvitePage.tsx:123` | const confirmed = window.confirm( | useConfirmDialog: title "Decline invitation?", message "You'd need a new invitation to join this trip later.", confirm "Decline invitation" |  |

P3 (1 rows, not listed): same rule applied to settings, integrations and admin screens. Examples: `fe:components/LinkPanel.tsx:351` "Remove this link?" to "Replace with useConfirmDialog using the destructive confirm ". Regenerate the full list with the search terms in "How to read this".

## Destructive confirmations (mobile)

Rule: as Confirm.

| Pri | Location | Current | Proposed | Tests (text match) |
| --- | -------- | ------- | -------- | ------------------ |
| P1 | `mob:app/entity/[kind]/[id].tsx:276` | Alert 'Delete this {noun}?' / 'It will be removed from the trip for everyone.' / button 'Delete' | Alert 'Delete this {noun}?' / 'It comes off the trip for everyone.' / button 'Delete {noun}' |  |
| P2 | `mob:app/settings.tsx:72` | 'Sign out?' / '${n} change(s) made offline have not been uploaded and will be lost.' | 'Sign out?' / '${n} change(s) made offline haven't uploaded and will be lost if you sign out.' |  |

## Empty states and "not found" lines

Rule: "No X found" becomes "No X match" for a search, or "No X yet" for an empty list, then a next step.

| Pri | Location | Current | Proposed | Tests (text match) |
| --- | -------- | ------- | -------- | ------------------ |
| P1 | `fe:components/daily-view/DailyView.tsx:745` | No trip dates defined. Please set trip start and end dates. | This trip has no dates yet. Add a start and end date to plan day by day. |  |
| P1 | `fe:components/Timeline.tsx:1360` | No timeline items yet. Add activities, transportation, lodging, or journal entries to see them here. | Nothing on the timeline yet. Add an activity, a leg, a stay or a journal entry and it shows up here. |  |
| P1 | `fe:pages/DashboardPage.tsx:204` | Nothing is scheduled for today. | Nothing planned today. Enjoy the free time. |  |
| P1 | `fe:pages/DashboardPage.tsx:221` | No dates set yet | No dates yet |  |
| P1 | `mob:app/(tabs)/trip.tsx:225` | No trip selected | Pick a trip first (message: "Choose a trip to see its plan here.") |  |
| P1 | `mob:app/entity/[kind]/[id].tsx:183` | This item cannot be edited on the phone | This one can only be edited on the web for now |  |
| P2 | `fe:pages/CompanionsPage.tsx:687` | No trips found | No trips to show |  |
| P2 | `fe:pages/FoodLogPage.tsx:86` | No meals found | No meals logged yet |  |
| P2 | `mob:app/(tabs)/map.tsx:220` | No trip selected | Pick a trip first (message: "Choose a trip to see its map here.") |  |
| P2 | `mob:app/camera-roll.tsx:104` | No trip selected | Pick a trip first |  |
| P2 | `mob:app/camera-roll.tsx:204` | No nearby place or activity found — you can link these later. | No place or activity nearby. You can link these later. |  |
| P2 | `mob:app/capture.tsx:42` | No trip selected / Pick a trip first, then capture into it. | Pick a trip first / "Choose a trip, then capture into it." |  |
| P2 | `mob:app/parked.tsx:50` | No trip selected | Pick a trip first |  |
| P2 | `mob:app/receipt.tsx:69` | No trip selected | Pick a trip first |  |

P3 (5 rows, not listed): same rule applied to settings, integrations and admin screens. Examples: `fe:components/ImmichBrowser.tsx:851` "No photos found" to "No photos match"; `fe:components/PdfReviewModal.tsx:268` "No travel entities were found in this PDF. The document may " to "No travel entities were match in this PDF. The document may "; `fe:components/TagsModal.tsx:260` "No tags found matching your search." to "No tags match your search."; `fe:components/TravelPartnerSettings.tsx:462` "No users found" to "No users match". Regenerate the full list with the search terms in "How to read this".

## Empty-state headlines and descriptions

Rule: sentence-case headline that says what is empty ("No stays yet"), one line that says what to do, button says the action ("Add a stay").

| Pri | Location | Current | Proposed | Tests (text match) |
| --- | -------- | ------- | -------- | ------------------ |
| P1 | `fe:components/ActivityManager.tsx:788` | What Will You Discover? | No activities yet |  |
| P1 | `fe:components/ActivityManager.tsx:789` | Plan your adventures - from guided tours and museum visits to local dining experiences and outdoor excursions. Every activity tells a story... | Add a tour, a museum visit, a dinner booking, anything you want to do on this trip. |  |
| P1 | `fe:components/LocationManager.tsx:1044` | Pin Your Destinations | No places yet |  |
| P1 | `fe:components/LocationManager.tsx:1045` | Mark the places that matter - from iconic landmarks and hidden gems to cozy cafes and stunning viewpoints. Build your personal map of memo... | Save the places you want to see, from landmarks to the cafe you don't want to miss. |  |
| P1 | `fe:components/LodgingManager.tsx:935` | Where Will You Stay? | No stays yet |  |
| P1 | `fe:components/LodgingManager.tsx:936` | From boutique hotels and cozy Airbnbs to camping under the stars - add your accommodations to keep all your booking details in one place. | Add a hotel, rental or campsite to keep your booking details in one place. |  |
| P1 | `fe:components/TransportationManager.tsx:1614` | Plan Your Journey | No transport yet |  |
| P1 | `fe:components/TransportationManager.tsx:1615` | How will you get there? Add flights, trains, road trips, and more. Track departure times, booking confirmations, and never miss a co... | Add flights, trains, rentals and other legs, with times and confirmation numbers. |  |
| P1 | `fe:pages/TripsPage.tsx:778` | Your Adventure Begins Here | No trips yet |  |
| P1 | `fe:pages/TripsPage.tsx:779` | Every great journey starts with a single step. Create your first trip to start planning, dreaming, and documenting your travels. From dream destinations to detailed itineraries - it all begins now. | Start with a name and some dates. Add stops, stays and photos as you go. |  |
| P1 | `fe:pages/TripsPage.tsx:780` | Plan Your First Adventure | Plan your first trip |  |
| P1 | `fe:pages/TripsPage.tsx:786` | No Trips Match Your Filters | No trips match these filters |  |
| P1 | `fe:pages/TripsPage.tsx:787` | Try adjusting your search terms, status filter, or selected tags to find what you're looking for. | Try a different search, status or tag. |  |
| P1 | `fe:pages/TripsPage.tsx:788` | Clear All Filters | Clear filters |  |
| P2 | `fe:components/JournalManager.tsx:650` | Tell Your Story | No journal entries yet |  |
| P2 | `fe:components/JournalManager.tsx:651` | Every journey has a story worth telling. Write about your experiences, capture the emotions, and preserve the small moments... | Write down what happened today while you still remember the details. |  |
| P2 | `fe:components/PhotoGallery.tsx:1027` | Your Photo Journey Begins Here | No photos yet |  |
| P2 | `fe:components/PhotoGallery.tsx:1028` | Upload photos to capture your travel memories. You can link photos to locations, add them to albums, and create a visual story of your advent... | Upload photos or import them from Immich, then link them to places and days. |  |
| P2 | `fe:components/SouvenirManager.tsx:593` | No Souvenirs Yet | No souvenirs yet |  |
| P2 | `fe:components/SouvenirManager.tsx:594` | Track gifts and souvenirs you want to bring back from your trip. Keep track of who they're for and stay within budget! | Track what you want to bring back, who it is for, and what it costs. |  |
| P2 | `fe:pages/AlbumsPage.tsx:380` | Create your first album to organize your photos! | Create an album to group your photos. |  |
| P2 | `fe:pages/ChecklistsPage.tsx:317` | No Checklists Yet | No checklists yet |  |
| P2 | `fe:pages/ChecklistsPage.tsx:318` | Get started by initializing default lists or creating your own custom checklist | Add the default packing and pre-trip lists, or start one of your own. |  |
| P2 | `fe:pages/CompanionsPage.tsx:449` | Share the Journey | No travel companions yet |  |
| P2 | `fe:pages/CompanionsPage.tsx:450` | Great adventures are even better when shared. Add your travel companions to keep track of who you're exploring the world with - from family and f... | Add the people you travel with so you can share trips and split costs. |  |
| P2 | `fe:pages/GlobalAlbumsPage.tsx:615` | Albums help you organize and relive your travel moments. Create albums to group photos by destination, activity, or theme - whether it's 'Sunse... | Group photos by place, day or theme. |  |

P3 (2 rows, not listed): same rule applied to settings, integrations and admin screens. Examples: `fe:pages/GlobalAlbumsPage.tsx:614` "Capture Your Memories" to "No albums yet"; `fe:pages/GlobalAlbumsPage.tsx:615` "Albums help you organize and relive your travel moments. Cre" to "Albums help you organize and relive your travel moments. cre". Regenerate the full list with the search terms in "How to read this".

## Offline and sync

Rule: say what is safe ("saved on this phone") and what happens next ("uploads when you are back online").

| Pri | Location | Current | Proposed | Tests (text match) |
| --- | -------- | ------- | -------- | ------------------ |
| P1 | `fe:components/pwa/OfflineIndicator.tsx:138` | You are offline | You're offline |  |
| P1 | `fe:components/pwa/OfflineIndicator.tsx:138` | Slow connection detected | Slow connection |  |
| P1 | `fe:components/pwa/OfflineIndicator.tsx:153` | Changes will sync when you reconnect | Changes are saved on this device and sync when you're back online. |  |
| P1 | `fe:components/pwa/OfflineIndicator.tsx:154` | Some features may be limited | Some features need a connection. |  |
| P1 | `mob:app/(tabs)/index.tsx:308` | Someone else changed an item you edited offline. Tap the conflict chip to choose. | Someone changed an item you edited offline. Tap the conflict chip to choose which version to keep. |  |
| P1 | `mob:app/sync.tsx:126` | Rejected by the server | Couldn't be saved |  |
| P1 | `mob:app/sync.tsx:132` | Unknown error | No reason was given. Try again. |  |
| P1 | `mob:lib/sync.ts:253` | Sync failed | Couldn't sync. Your changes are saved on this phone and will upload when it works. |  |

## Onboarding and sign-in

Rule: plain action words; no marketing flourish on buttons.

| Pri | Location | Current | Proposed | Tests (text match) |
| --- | -------- | ------- | -------- | ------------------ |
| P1 | `fe:pages/LoginPage.tsx:157` | 'Logging in...' / 'Begin Your Journey' | 'Signing in…' / 'Sign in' |  |

## Backend messages that reach the UI

Rule: say what is missing or wrong in plain words and what to do. "X not found" becomes "We can't find that X. It may have been deleted."

| Pri | Location | Current | Proposed | Tests (text match) |
| --- | -------- | ------- | -------- | ------------------ |
| P1 | `be:_shared/tripAccess.ts:127` | Trip not found or access denied | We can't find that trip, or you don't have access to it. | yes (activity.service.test.ts, collaboration.service.test.ts, +15) |
| P1 | `be:_shared/tripAccess.ts:186` | Trip not found or access denied | We can't find that trip, or you don't have access to it. | yes (activity.service.test.ts, collaboration.service.test.ts, +15) |
| P1 | `be:_shared/tripAccess.ts:200` | Access denied | You don't have access to this trip. |  |
| P1 | `be:_shared/tripAccess.ts:289` | Access denied | You don't have access to this trip. |  |
| P1 | `be:albumSuggestion.service.ts:325` | Trip not found | We can't find that trip, or you don't have access to it. | yes (location.controller.test.ts, trip.controller.test.ts, +25) |
| P1 | `be:albumSuggestion.service.ts:452` | Trip not found | We can't find that trip, or you don't have access to it. | yes (location.controller.test.ts, trip.controller.test.ts, +25) |
| P1 | `be:auth.service.ts:127` | Invalid email or password | That email and password don't match. Check them and try again. | yes (auth.controller.test.ts, auth.service.test.ts) |
| P1 | `be:auth.service.ts:134` | Invalid email or password | That email and password don't match. Check them and try again. | yes (auth.controller.test.ts, auth.service.test.ts) |
| P1 | `be:auth.service.ts:204` | Refresh token has been revoked | You were signed out. Sign in again to continue. | yes (auth.controller.test.ts) |
| P1 | `be:auth.service.ts:215` | Refresh token has been revoked | You were signed out. Sign in again to continue. | yes (auth.controller.test.ts) |
| P1 | `be:collaboration.service.ts:108` | Trip not found | We can't find that trip, or you don't have access to it. | yes (location.controller.test.ts, trip.controller.test.ts, +25) |
| P1 | `be:collaboration.service.ts:452` | Trip not found or access denied | We can't find that trip, or you don't have access to it. | yes (activity.service.test.ts, collaboration.service.test.ts, +15) |
| P1 | `be:expense.service.ts:349` | Trip not found | We can't find that trip, or you don't have access to it. | yes (location.controller.test.ts, trip.controller.test.ts, +25) |
| P1 | `be:journalDayDraft.service.ts:48` | Trip not found | We can't find that trip, or you don't have access to it. | yes (location.controller.test.ts, trip.controller.test.ts, +25) |
| P1 | `be:journalEntryAi.service.ts:57` | Trip not found | We can't find that trip, or you don't have access to it. | yes (location.controller.test.ts, trip.controller.test.ts, +25) |
| P1 | `be:languagePhrase.service.ts:88` | Trip not found or access denied | We can't find that trip, or you don't have access to it. | yes (activity.service.test.ts, collaboration.service.test.ts, +15) |
| P1 | `be:mobileSync.service.ts:76` | Trip not found or access denied | We can't find that trip, or you don't have access to it. | yes (activity.service.test.ts, collaboration.service.test.ts, +15) |
| P1 | `be:pdfImport.service.ts:478` | Trip not found or access denied | We can't find that trip, or you don't have access to it. | yes (activity.service.test.ts, collaboration.service.test.ts, +15) |
| P1 | `be:travelDocument.service.ts:302` | Trip not found | We can't find that trip, or you don't have access to it. | yes (location.controller.test.ts, trip.controller.test.ts, +25) |
| P1 | `be:trip.service.ts:416` | Trip not found | We can't find that trip, or you don't have access to it. | yes (location.controller.test.ts, trip.controller.test.ts, +25) |
| P1 | `be:trip.service.ts:435` | Trip not found or you do not have permission to edit it | We can't find that trip, or you can only view it. | yes (share.service.test.ts, trip.service.test.ts, +1) |
| P1 | `be:trip.service.ts:546` | Trip not found or you do not have permission to edit it | We can't find that trip, or you can only view it. | yes (share.service.test.ts, trip.service.test.ts, +1) |
| P1 | `be:tripCoverImage.service.ts:109` | Trip not found or you do not have permission to edit it | We can't find that trip, or you can only view it. | yes (share.service.test.ts, trip.service.test.ts, +1) |
| P1 | `be:tripLanguage.service.ts:22` | Trip not found or access denied | We can't find that trip, or you don't have access to it. | yes (activity.service.test.ts, collaboration.service.test.ts, +15) |
| P1 | `be:tripLanguage.service.ts:53` | Trip not found or access denied | We can't find that trip, or you don't have access to it. | yes (activity.service.test.ts, collaboration.service.test.ts, +15) |
| P1 | `be:tripLanguage.service.ts:101` | Trip not found or access denied | We can't find that trip, or you don't have access to it. | yes (activity.service.test.ts, collaboration.service.test.ts, +15) |
| P1 | `be:tripSeries.service.ts:192` | Trip not found | We can't find that trip, or you don't have access to it. | yes (location.controller.test.ts, trip.controller.test.ts, +25) |
| P1 | `be:tripValidator.service.ts:154` | Trip not found | We can't find that trip, or you don't have access to it. | yes (location.controller.test.ts, trip.controller.test.ts, +25) |
| P1 | `be:tripValidator.service.ts:235` | Trip not found | We can't find that trip, or you don't have access to it. | yes (location.controller.test.ts, trip.controller.test.ts, +25) |
| P1 | `be:tripValidator.service.ts:273` | Trip not found | We can't find that trip, or you don't have access to it. | yes (location.controller.test.ts, trip.controller.test.ts, +25) |
| P1 | `be:weather.service.ts:99` | Trip not found | We can't find that trip, or you don't have access to it. | yes (location.controller.test.ts, trip.controller.test.ts, +25) |
| P1 | `be:weather.service.ts:809` | Trip not found | We can't find that trip, or you don't have access to it. | yes (location.controller.test.ts, trip.controller.test.ts, +25) |
| P2 | `be:_shared/userSettings.ts:47` | User not found | We can't find that user. It may have been deleted. | yes (auth.controller.test.ts, user.controller.test.ts, +6) |
| P2 | `be:albumSuggestion.service.ts:464` | Some photos do not belong to this trip | Some of those photos aren't part of this trip. | yes (albumSuggestion.service.test.ts, photoAutoLink.service.test.ts) |
| P2 | `be:auth.service.ts:232` | User not found | We can't find that user. It may have been deleted. | yes (auth.controller.test.ts, user.controller.test.ts, +6) |
| P2 | `be:auth.service.ts:290` | User not found | We can't find that user. It may have been deleted. | yes (auth.controller.test.ts, user.controller.test.ts, +6) |
| P2 | `be:auth.service.ts:327` | User not found | We can't find that user. It may have been deleted. | yes (auth.controller.test.ts, user.controller.test.ts, +6) |
| P2 | `be:backup.service.ts:639` | User not found | We can't find that user. It may have been deleted. | yes (auth.controller.test.ts, user.controller.test.ts, +6) |
| P2 | `be:calendarFeed.service.ts:301` | User not found | We can't find that user. It may have been deleted. | yes (auth.controller.test.ts, user.controller.test.ts, +6) |
| P2 | `be:collaboration.service.ts:218` | User not found | We can't find that user. It may have been deleted. | yes (auth.controller.test.ts, user.controller.test.ts, +6) |
| P2 | `be:collaboration.service.ts:299` | Invitation not found | We can't find that invitation. It may have been cancelled. | yes (userInvitation.controller.test.ts, collaboration.service.test.ts, +1) |
| P2 | `be:collaboration.service.ts:308` | Invitation has expired | This invitation has expired. Ask the person who invited you to send a new one. | yes (collaboration.service.test.ts, userInvitation.service.test.ts) |
| P2 | `be:collaboration.service.ts:323` | User not found | We can't find that user. It may have been deleted. | yes (auth.controller.test.ts, user.controller.test.ts, +6) |
| P2 | `be:collaboration.service.ts:338` | Invitation not found or already responded to | This invitation was already answered or has been cancelled. | yes (collaboration.service.test.ts, userInvitation.service.test.ts) |
| P2 | `be:collaboration.service.ts:347` | Invitation has expired | This invitation has expired. Ask the person who invited you to send a new one. | yes (collaboration.service.test.ts, userInvitation.service.test.ts) |
| P2 | `be:collaboration.service.ts:419` | User not found | We can't find that user. It may have been deleted. | yes (auth.controller.test.ts, user.controller.test.ts, +6) |
| P2 | `be:collaboration.service.ts:431` | Invitation not found or already responded to | This invitation was already answered or has been cancelled. | yes (collaboration.service.test.ts, userInvitation.service.test.ts) |
| P2 | `be:collaboration.service.ts:552` | Collaborator not found | We can't find that collaborator. It may have been deleted. | yes (collaboration.service.test.ts) |
| P2 | `be:collaboration.service.ts:608` | Collaborator not found | We can't find that collaborator. It may have been deleted. | yes (collaboration.service.test.ts) |
| P2 | `be:collaboration.service.ts:637` | Invitation not found | We can't find that invitation. It may have been cancelled. | yes (userInvitation.controller.test.ts, collaboration.service.test.ts, +1) |
| P2 | `be:collaboration.service.ts:666` | Invitation not found | We can't find that invitation. It may have been cancelled. | yes (userInvitation.controller.test.ts, collaboration.service.test.ts, +1) |
| P2 | `be:companion.service.ts:136` | Companion not found | We can't find that companion. It may have been deleted. | yes (companion.service.test.ts) |
| P2 | `be:companion.service.ts:149` | Companion not found | We can't find that companion. It may have been deleted. | yes (companion.service.test.ts) |
| P2 | `be:companion.service.ts:165` | Companion not found | We can't find that companion. It may have been deleted. | yes (companion.service.test.ts) |
| P2 | `be:companion.service.ts:204` | Companion not found | We can't find that companion. It may have been deleted. | yes (companion.service.test.ts) |
| P2 | `be:companion.service.ts:275` | Companion not found | We can't find that companion. It may have been deleted. | yes (companion.service.test.ts) |
| P2 | `be:companion.service.ts:317` | Companion not found | We can't find that companion. It may have been deleted. | yes (companion.service.test.ts) |
| P2 | `be:companion.service.ts:346` | Companion not found | We can't find that companion. It may have been deleted. | yes (companion.service.test.ts) |
| P2 | `be:customItem.service.ts:95` | A custom item type with that name already exists | You already have a type with that name. |  |
| P2 | `be:customItem.service.ts:123` | A custom item type with that name already exists | You already have a type with that name. |  |
| P2 | `be:entityLink.service.ts:543` | Link already exists between these entities | Those two are already linked. | yes (entityLink.service.test.ts) |
| P2 | `be:entityLink.service.ts:578` | Link already exists between these entities | Those two are already linked. | yes (entityLink.service.test.ts) |
| P2 | `be:expense.service.ts:58` | Expense not found or does not belong to trip | We can't find that expense on this trip. | yes (expense.service.test.ts) |
| P2 | `be:expenseReceipt.service.ts:65` | Expense not found or does not belong to trip | We can't find that expense on this trip. | yes (expense.service.test.ts) |
| P2 | `be:expenseSplit.service.ts:62` | Expense not found or does not belong to trip | We can't find that expense on this trip. | yes (expense.service.test.ts) |
| P2 | `be:journalEntryAi.service.ts:42` | AI features are not configured. Set LLM_API_KEY to enable. | AI features aren't set up on this server. Ask the admin to add an LLM key. |  |
| P2 | `be:journalEntryAi.service.ts:122` | AI features are not configured. Set LLM_API_KEY to enable. | AI features aren't set up on this server. Ask the admin to add an LLM key. |  |
| P2 | `be:location.service.ts:196` | Parent location not found or does not belong to the same trip | The place you picked as the parent isn't on this trip. | yes (location.service.test.ts) |
| P2 | `be:location.service.ts:201` | Cannot nest locations more than one level deep. The selected parent is already a child of another location. | A place can only sit one level inside another, and the one you picked is already inside a place. | yes (location.service.test.ts) |
| P2 | `be:location.service.ts:444` | Parent location not found or does not belong to the same trip | The place you picked as the parent isn't on this trip. | yes (location.service.test.ts) |
| P2 | `be:location.service.ts:449` | Cannot nest locations more than one level deep. The selected parent is already a child of another location. | A place can only sit one level inside another, and the one you picked is already inside a place. | yes (location.service.test.ts) |
| P2 | `be:location.service.ts:680` | One or more locations not found or do not belong to this trip | Some of those places aren't on this trip. |  |
| P2 | `be:location.service.ts:717` | One or more locations not found or do not belong to this trip | Some of those places aren't on this trip. |  |
| P2 | `be:location.service.ts:726` | No valid update fields provided | Nothing to save. Change a field first. | yes (crudHelpers.test.ts) |
| P2 | `be:mobilePairing.service.ts:131` | Pairing code is invalid or has expired | That pairing code has expired. Create a new one in Settings and scan it again. | yes (auth.mobile.controller.test.ts, oidc.mobile.controller.test.ts) |
| P2 | `be:mobilePairing.service.ts:137` | Pairing code is invalid or has expired | That pairing code has expired. Create a new one in Settings and scan it again. | yes (auth.mobile.controller.test.ts, oidc.mobile.controller.test.ts) |
| P2 | `be:pdfImport.service.ts:535` | Lodging requires checkInDate and checkOutDate | Add check-in and check-out dates for this stay. |  |
| P2 | `be:pdfImport.service.ts:542` | Lodging requires checkInDate and checkOutDate | Add check-in and check-out dates for this stay. |  |
| P2 | `be:photo.service.ts:839` | Invalid timezone format | That time zone isn't recognized. Pick one from the list. |  |
| P2 | `be:photo.service.ts:891` | Invalid timezone format | That time zone isn't recognized. Pick one from the list. |  |
| P2 | `be:photoAutoLink.service.ts:298` | Some photos do not belong to this trip | Some of those photos aren't part of this trip. | yes (albumSuggestion.service.test.ts, photoAutoLink.service.test.ts) |
| P2 | `be:transportation.service.ts:687` | One or more transportation items not found or do not belong to this trip | Some of those transport items aren't on this trip. |  |
| P2 | `be:transportation.service.ts:726` | One or more transportation items not found or do not belong to this trip | Some of those transport items aren't on this trip. |  |
| P2 | `be:transportation.service.ts:736` | No valid update fields provided | Nothing to save. Change a field first. | yes (crudHelpers.test.ts) |
| P2 | `be:travelPartnerRequest.service.ts:140` | User not found | We can't find that user. It may have been deleted. | yes (auth.controller.test.ts, user.controller.test.ts, +6) |
| P2 | `be:travelPartnerRequest.service.ts:274` | Travel partner request not found or already responded to | This request was already answered or has been cancelled. | yes (travelPartnerRequest.service.test.ts) |
| P2 | `be:travelPartnerRequest.service.ts:296` | User not found | We can't find that user. It may have been deleted. | yes (auth.controller.test.ts, user.controller.test.ts, +6) |
| P2 | `be:travelPartnerRequest.service.ts:426` | Travel partner request not found or already responded to | This request was already answered or has been cancelled. | yes (travelPartnerRequest.service.test.ts) |
| P2 | `be:travelPartnerRequest.service.ts:459` | Travel partner request not found or already responded to | This request was already answered or has been cancelled. | yes (travelPartnerRequest.service.test.ts) |
| P2 | `be:tripSeries.service.ts:15` | Trip series not found | We can't find that trip series. It may have been deleted. | yes (tripSeries.service.test.ts) |
| P2 | `be:tripSeries.service.ts:137` | Trip series not found | We can't find that trip series. It may have been deleted. | yes (tripSeries.service.test.ts) |
| P2 | `be:tripStop.service.ts:187` | name, latitude and longitude are required | Add a name and pick a point on the map. |  |
| P2 | `be:user.service.ts:71` | User not found | We can't find that user. It may have been deleted. | yes (auth.controller.test.ts, user.controller.test.ts, +6) |
| P2 | `be:user.service.ts:243` | User not found | We can't find that user. It may have been deleted. | yes (auth.controller.test.ts, user.controller.test.ts, +6) |
| P2 | `be:user.service.ts:467` | User not found | We can't find that user. It may have been deleted. | yes (auth.controller.test.ts, user.controller.test.ts, +6) |
| P2 | `be:user.service.ts:555` | User not found | We can't find that user. It may have been deleted. | yes (auth.controller.test.ts, user.controller.test.ts, +6) |
| P2 | `be:user.service.ts:633` | User not found | We can't find that user. It may have been deleted. | yes (auth.controller.test.ts, user.controller.test.ts, +6) |
| P2 | `be:user.service.ts:646` | User not found | We can't find that user. It may have been deleted. | yes (auth.controller.test.ts, user.controller.test.ts, +6) |
| P2 | `be:userInvitation.service.ts:44` | User not found | We can't find that user. It may have been deleted. | yes (auth.controller.test.ts, user.controller.test.ts, +6) |
| P2 | `be:userInvitation.service.ts:145` | Invitation not found | We can't find that invitation. It may have been cancelled. | yes (userInvitation.controller.test.ts, collaboration.service.test.ts, +1) |
| P2 | `be:userInvitation.service.ts:185` | Invitation not found | We can't find that invitation. It may have been cancelled. | yes (userInvitation.controller.test.ts, collaboration.service.test.ts, +1) |
| P2 | `be:userInvitation.service.ts:190` | Invitation is no longer valid | This invitation is no longer valid. Ask the person who invited you for a new one. | yes (userInvitation.service.test.ts) |
| P2 | `be:userInvitation.service.ts:199` | Invitation has expired | This invitation has expired. Ask the person who invited you to send a new one. | yes (collaboration.service.test.ts, userInvitation.service.test.ts) |
| P2 | `be:userInvitation.service.ts:286` | Invitation not found | We can't find that invitation. It may have been cancelled. | yes (userInvitation.controller.test.ts, collaboration.service.test.ts, +1) |
| P2 | `be:userInvitation.service.ts:290` | Invitation is no longer valid | This invitation is no longer valid. Ask the person who invited you for a new one. | yes (userInvitation.service.test.ts) |
| P2 | `be:userInvitation.service.ts:370` | Invitation not found or already responded to | This invitation was already answered or has been cancelled. | yes (collaboration.service.test.ts, userInvitation.service.test.ts) |
| P2 | `be:userInvitation.service.ts:405` | User not found | We can't find that user. It may have been deleted. | yes (auth.controller.test.ts, user.controller.test.ts, +6) |

P3 (57 rows, not listed): same rule applied to settings, integrations and admin screens. Examples: `be:auth.service.ts:78` "Unable to create account with the provided information" to "(keep as is: deliberately vague to avoid revealing which ema"; `be:aviationstack.service.ts:171` "Transportation not found" to "We can't find that transportation. It may have been deleted."; `be:aviationstack.service.ts:334` "Transportation not found" to "We can't find that transportation. It may have been deleted."; `be:aviationstack.service.ts:503` "Invalid AviationStack API key" to "AviationStack didn't accept that API key. Check it and try a". Regenerate the full list with the search terms in "How to read this".

## Loading

73 strings (29 P1, 12 P2, 32 P3) of the form "Loading X..." with three dots, in 40 files. They are almost all already correct in wording, so one mechanical rule covers them all:

- Replace `...` with the single character `…` (the guide's rule, and what `DashboardPage` and mobile already do): `Loading albums...` becomes `Loading albums…`.
- Keep the thing named ("Loading photos…"). Do not add jokes.
- Two exceptions to rewrite: `fe:pages/SettingsPage.tsx:144` "Loading" has no object (use "Loading settings…"), and `fe:pages/LoginPage.tsx:157` "Logging in..." becomes "Signing in…" (see Onboarding).
- Busy-button labels follow the same rule ("Saving…", "Uploading…").

Files and lines:

- `fe:pages/TripDetailPage.tsx`: 423, 524, 566, 601, 636, 671, 691, 714, ... (24 lines)
- `fe:components/UnscheduledItems.tsx`: 779, 824, 1118
- `fe:pages/CompanionsPage.tsx`: 336, 631, 705
- `fe:pages/SettingsPage.tsx`: 326, 341, 358
- `fe:pages/TripSeriesPage.tsx`: 201, 250, 293
- `fe:components/route-planner/RoutePlanner.tsx`: 528, 795
- `fe:components/settings/AccountSettingsSection.tsx`: 344, 380
- `fe:components/InlineEdit.tsx`: 200
- `fe:components/TimelineEditModal.tsx`: 1727
- `fe:components/BudgetManager.tsx`: 743
- `fe:components/CompanionManager.tsx`: 229
- `fe:components/DeadlinesManager.tsx`: 299
- `fe:components/PhotoUpload.tsx`: 572
- `fe:components/pwa/StorageManagement.tsx`: 294
- `fe:components/SouvenirManager.tsx`: 476
- `fe:components/TravelDocumentManager.tsx`: 249
- `fe:pages/AlbumsPage.tsx`: 318
- `fe:pages/ChecklistsPage.tsx`: 224
- `fe:components/AlbumModal.tsx`: 238
- `fe:components/AviationstackSettings.tsx`: 146
- `fe:components/ImmichSettings.tsx`: 200
- `fe:components/InviteUsersSection.tsx`: 279
- `fe:components/LinkEditModal.tsx`: 214
- `fe:components/LlmSettings.tsx`: 282
- `fe:components/LocationQuickAdd.tsx`: 106
- `fe:components/LoyaltyProgramManager.tsx`: 217
- `fe:components/OpenRouteServiceSettings.tsx`: 153
- `fe:components/PdfUploadModal.tsx`: 137
- `fe:components/PhraseBank.tsx`: 77
- `fe:components/settings/IntegrationsSection.tsx`: 26
- `fe:components/shared/FormModalFooter.tsx`: 81
- `fe:components/SmtpSettings.tsx`: 446
- `fe:components/TagManager.tsx`: 225
- `fe:components/TagsModal.tsx`: 138
- `fe:components/TravelPartnerSettings.tsx`: 458
- `fe:components/WeatherSettings.tsx`: 153
- `fe:pages/GlobalAlbumsPage.tsx`: 608
- `fe:pages/PlacesVisitedPage.tsx`: 84
- `fe:pages/TripFormPage.tsx`: 741
- `fe:pages/TripSeriesListPage.tsx`: 73

