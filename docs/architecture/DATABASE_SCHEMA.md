# Database Schema Reference

Travel Life uses PostgreSQL with PostGIS extension for geospatial data. The schema is managed via Prisma ORM.

The schema defines **49 models** (mapped to **49 tables**) and **13 enums**.

## Schema Location

```text
backend/prisma/schema.prisma
```

## Entity Relationship Diagram

```text
                                    ┌─────────────────┐
                                    │      User       │
                                    │─────────────────│
                                    │ id              │
                                    │ username        │
                                    │ email           │
                                    │ passwordHash    │
                                    │ timezone        │
                                    │ settings...     │
                                    └────────┬────────┘
                                             │
                    ┌────────────────────────┼────────────────────────┐
                    │                        │                        │
                    ▼                        ▼                        ▼
          ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
          │     Trip        │      │    TripTag      │      │TravelCompanion  │
          │─────────────────│      │─────────────────│      │─────────────────│
          │ id              │      │ id              │      │ id              │
          │ title           │      │ name            │      │ name            │
          │ status          │      │ color           │      │ relationship    │
          │ dates           │      └────────┬────────┘      └────────┬────────┘
          └────────┬────────┘               │                        │
                   │                        │                        │
    ┌──────────────┼──────────────┐         │                        │
    │              │              │         │                        │
    ▼              ▼              ▼         ▼                        ▼
┌────────┐   ┌────────┐   ┌────────┐  ┌────────────┐         ┌────────────┐
│Location│   │ Photo  │   │Activity│  │TripTag     │         │Trip        │
│        │   │        │   │        │  │Assignment  │         │Companion   │
│        │   │        │   │        │  └────────────┘         └────────────┘
│        │   │        │   │        │
└────┬───┘   └────┬───┘   └────┬───┘
     │            │            │
     │            │            │
     └────────────┼────────────┘
                  │
                  ▼
          ┌─────────────────┐
          │   EntityLink    │◄────── Universal linking system
          │─────────────────│
          │ sourceType      │
          │ sourceId        │
          │ targetType      │
          │ targetId        │
          │ relationship    │
          └─────────────────┘
```

## Core Models

### User

Primary user account model with authentication and settings.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| username | String | Unique username |
| email | String | Unique email address |
| passwordHash | String | Bcrypt hashed password |
| timezone | String? | User's home timezone (null until chosen; there is no default, and nothing falls back to UTC for display) |
| activityCategories | Json | Custom activity category list |
| immichApiUrl | String? | Immich server URL |
| immichApiKey | String? | Immich API key |
| weatherApiKey | String? | OpenWeatherMap API key |
| aviationstackApiKey | String? | Flight tracking API key |
| openrouteserviceApiKey | String? | Road routing API key |
| measurementSystem | String? | `imperial` or `metric`; null means the app default (imperial) |
| createdAt | DateTime | Account creation timestamp |

### Trip

Central entity representing a travel trip.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| userId | Int | Owner foreign key |
| title | String | Trip title |
| description | String? | Trip description |
| startDate | Date? | Trip start date |
| endDate | Date? | Trip end date |
| timezone | String? | Trip timezone |
| status | String | Dream, Planning, Planned, In Progress, Completed, Cancelled |
| privacyLevel | String | Private, Shared, Public |
| coverPhotoId | Int? | Cover photo foreign key |
| bannerPhotoId | Int? | Banner photo foreign key |
| addToPlacesVisited | Boolean | Include in visited places map |

**Status Values:**
- `Dream` - Wishlist trip
- `Planning` - Actively planning
- `Planned` - Fully planned, not started
- `In Progress` - Currently traveling
- `Completed` - Trip finished
- `Cancelled` - Trip cancelled

### Location

Points of interest within a trip.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| tripId | Int | Trip foreign key |
| parentId | Int? | Parent location (for nested locations) |
| name | String | Location name |
| address | String? | Full address |
| latitude | Decimal(10,8)? | Latitude coordinate |
| longitude | Decimal(11,8)? | Longitude coordinate |
| categoryId | Int? | Location category foreign key |
| visitDatetime | DateTime? | Planned/actual visit time |
| visitDurationMinutes | Int? | Expected duration |
| notes | String? | Notes |
| coordinates | Geography? | PostGIS point (auto-generated) |

### Photo

Photos associated with trips. Supports local uploads and Immich integration.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| tripId | Int | Trip foreign key |
| source | String | 'local' or 'immich' |
| mediaType | String | 'image' or 'video' |
| immichAssetId | String? | Immich asset ID (if from Immich) |
| localPath | String? | Local file path |
| thumbnailPath | String? | Thumbnail file path |
| duration | Int? | Video duration in seconds |
| caption | String? | Photo caption |
| latitude | Decimal(10,8)? | EXIF latitude |
| longitude | Decimal(11,8)? | EXIF longitude |
| takenAt | DateTime? | EXIF timestamp |
| isFavorite | Boolean | Starred by the user (default `false`); favorites form the trip highlight set |

### Activity

Planned or completed activities.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| tripId | Int | Trip foreign key |
| parentId | Int? | Parent activity (for sub-activities) |
| name | String | Activity name |
| description | String? | Description |
| category | String? | Category (sightseeing, dining, etc.) |
| allDay | Boolean | All-day event flag |
| startTime | DateTime? | Start time |
| endTime | DateTime? | End time |
| timezone | String? | Activity timezone |
| cost | Decimal(10,2)? | Cost |
| currency | String? | Currency code (USD, EUR, etc.) |
| bookingUrl | String? | Booking URL |
| bookingReference | String? | Confirmation number |
| manualOrder | Int? | Custom sort order |

### Transportation

Travel between locations (flights, trains, etc.).

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| tripId | Int | Trip foreign key |
| type | String | Flight, Train, Bus, Ferry, Car, etc. |
| startLocationId | Int? | Start location foreign key |
| startLocationText | String? | Start location (text fallback) |
| endLocationId | Int? | End location foreign key |
| endLocationText | String? | End location (text fallback) |
| scheduledStart | DateTime? | Scheduled departure |
| scheduledEnd | DateTime? | Scheduled arrival |
| startTimezone | String? | Departure timezone |
| endTimezone | String? | Arrival timezone |
| actualStart | DateTime? | Actual departure |
| actualEnd | DateTime? | Actual arrival |
| company | String? | Carrier/company name |
| referenceNumber | String? | Flight/train number |
| seatNumber | String? | Seat assignment |
| cost | Decimal(10,2)? | Cost |
| status | String | on_time, delayed, cancelled |
| connectionGroupId | String? | Groups connected segments |
| calculatedDistance | Decimal? | Route distance (km) |
| calculatedDuration | Decimal? | Route duration (minutes) |
| distanceSource | String? | 'route' or 'haversine' |
| loyaltyProgramId | Int? | Loyalty program the booking was made under (`LoyaltyProgram`, `SET NULL` on delete) |

### Lodging

Accommodations during trips.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| tripId | Int | Trip foreign key |
| type | String | Hotel, Airbnb, Hostel, Camping, etc. |
| name | String | Property name |
| address | String? | Address |
| checkInDate | DateTime | Check-in date |
| checkOutDate | DateTime | Check-out date |
| timezone | String? | Property timezone |
| confirmationNumber | String? | Booking confirmation |
| loyaltyProgramId | Int? | Loyalty program the stay was booked under (`LoyaltyProgram`, `SET NULL` on delete) |
| bookingUrl | String? | Booking URL |
| cost | Decimal(10,2)? | Total cost |
| currency | String? | Currency code |
| notes | String? | Notes |

### JournalEntry

Trip journals and daily entries.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| tripId | Int | Trip foreign key |
| date | Date? | Entry date (null for trip-level) |
| title | String? | Entry title |
| content | String | Entry content (rich text) |
| entryType | String | 'trip' or 'daily' |
| mood | String? | Mood indicator |
| weatherNotes | String? | Weather description |

## Supporting Models

### PhotoAlbum

Organize photos into albums.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| tripId | Int | Trip foreign key |
| name | String | Album name |
| description | String? | Description |
| coverPhotoId | Int? | Cover photo foreign key |
| immichAlbumId | String? | Linked Immich album (manual sync and opt-in export only) |
| immichAlbumSyncedAt | DateTime? | When the linked Immich album was last pulled |

### TripTag

User-defined tags for categorizing trips.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| userId | Int | User foreign key |
| name | String | Tag name |
| color | String? | Background color (hex) |
| textColor | String? | Text color (hex) |

### TravelCompanion

People who travel with the user.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| userId | Int | User foreign key |
| name | String | Companion name |
| email | String? | Email address |
| phone | String? | Phone number |
| relationship | String? | Relationship (friend, spouse, etc.) |
| isMyself | Boolean | Represents the user themselves |

### Checklist

Pre-trip and travel checklists.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| userId | Int | User foreign key |
| tripId | Int? | Associated trip (null for global) |
| name | String | Checklist name |
| type | String | custom, airports, countries, cities, us_states |
| isDefault | Boolean | System-generated list |
| sortOrder | Int | Display order |

### ChecklistItem

Individual items within a checklist.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| checklistId | Int | Checklist foreign key |
| name | String | Item name |
| description | String? | Item description |
| isChecked | Boolean | Completion state |
| isDefault | Boolean | Pre-populated item flag |
| sortOrder | Int | Display order |
| metadata | Json? | Extra info (airport code, country code, etc.) |
| checkedAt | DateTime? | When the item was checked |

## Expenses and Splits

### TripExpense

A logged expense. Carries the currency snapshot columns described under [Currency Conversion](#currency-conversion).

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| tripId | Int | Trip foreign key (cascade) |
| description | String | What the expense was for |
| category | String | food, transportation, lodging, activities, shopping, other |
| amount | Decimal(10,2) | Amount in `currency` (CHECK: not negative) |
| currency | String? | Currency code |
| date | Date? | Calendar date (date-only, stored at UTC midnight) |
| notes | String? | Notes |
| paidByOwner | Boolean | The trip owner paid (default `false`) |
| paidByCompanionId | Int? | The companion who paid (`SET NULL` on delete). At most one payer: the owner or a companion, never both (CHECK `trip_expenses_one_payer`); neither means not recorded |
| splitMethod | String? | `equal`, `amount` or `percentage`; null when not split |
| receiptPath | String? | Stored receipt image (`/uploads/receipts/<uuid>.jpg`) |
| receiptMimeType | String? | Receipt MIME type |
| receiptSizeBytes | Int? | Receipt size in bytes |
| receiptUploadedAt | DateTime? | When the receipt was attached |

### TripExpenseSplit

One participant's share of an expense, in the expense's own currency (migration `20261116010000_add_expense_splits`).

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| expenseId | Int | Expense foreign key (cascade) |
| isOwner | Boolean | This share is the trip owner's |
| companionId | Int? | The companion this share belongs to (cascade). Exactly one of `isOwner` / `companionId` identifies the participant (CHECK `trip_expense_splits_one_participant`) |
| amount | Decimal(10,2) | The participant's share; the shares of an expense add up to its amount |
| percentage | Decimal(7,4)? | Only set for percentage splits |

A participant appears at most once per expense; both rules are enforced in `expenseSplit.service.ts`.

## Loyalty Programs

### LoyaltyProgram

A user's frequent-flyer or hotel-loyalty membership (migration `20261116030000_add_loyalty_programs`). Bookings reference it by id rather than copying the number.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| userId | Int | Owner (cascade) |
| name | String | Programme name, e.g. "SkyMiles" |
| type | LoyaltyProgramType | Kind of programme |
| providerName | String | Carrier or brand, e.g. "Delta Air Lines" |
| providerCode | String? | IATA airline code, e.g. "DL" |
| alliance | String? | e.g. "SkyTeam" |
| aliases | String[] | Other names the provider goes by, for matching |
| membershipNumber | String | The membership number (returned in full to its owner only) |
| tier | String? | Status tier |
| pointsBalance | Int? | Optional manual balance |
| notes | String? | Notes |

`Transportation.loyaltyProgramId` and `Lodging.loyaltyProgramId` point here (`SET NULL` on delete).

## Route Planning

### TripStop

One stop of a trip's route in the multi-city planner (migration `20261116080000_add_trip_stops`).

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| tripId | Int | Trip foreign key (cascade) |
| locationId | Int? | Saved place this stop was made from (`SET NULL` on delete) |
| name | String | Stop name (a snapshot when linked to a place) |
| latitude | Float | Latitude |
| longitude | Float | Longitude |
| position | Int | Order within the trip |
| nights | Int? | Planned nights at the stop |

Indexed on `(tripId, position)` and `locationId`.

## Trip Organization Models

### TripSeries

Groups related trips together (e.g. an annual trip, a multi-leg journey).

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| userId | Int | Owner foreign key |
| name | String | Series name |
| description | String? | Series description |

Trips reference a series via `Trip.seriesId` / `Trip.seriesOrder`.

### TripCollaborator

Grants another registered user access to a trip.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| tripId | Int | Trip foreign key |
| userId | Int | Collaborator user foreign key |
| permissionLevel | String | view, edit, admin |

Unique on `(tripId, userId)`.

### TripInvitation

A pending email invitation to collaborate on a specific trip.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| tripId | Int | Trip foreign key |
| invitedByUserId | Int | Inviting user foreign key |
| email | String | Invitee email address |
| permissionLevel | String | view, edit, admin |
| token | String | Unique token used to accept the invitation |
| status | String | pending, accepted, declined, expired |
| message | String? | Optional personal message |
| expiresAt | DateTime | Expiration timestamp |
| respondedAt | DateTime? | When the invitation was answered |

### UserInvitation

Invites a person to register for the Travel Life application itself (account-level, not trip-level).

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| invitedByUserId | Int? | Inviting user (null for system invites) |
| email | String | Invitee email address |
| token | String | Unique token used to accept the invitation |
| status | UserInvitationStatus | PENDING, ACCEPTED, DECLINED, EXPIRED |
| message | String? | Optional personal message |
| expiresAt | DateTime | Expiration timestamp |
| respondedAt | DateTime? | When the invitation was answered |
| acceptedUserId | Int? | User who accepted (set after registration) |

### TravelPartnerRequest

Consent record for a travel partnership. A partnership auto-shares every new trip
either user creates (see `trip.service.ts`), so it needs both sides to agree:
`User.travelPartnerId` is only ever written for the user making the change, and the
reciprocal write happens only when the recipient accepts a request here.

Unlike `TripInvitation`/`UserInvitation` there is no token or expiry — the recipient is
an existing account responding inside the app, not following an emailed link.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| requesterId | Int | User who sent the request |
| recipientId | Int | User being asked |
| status | TravelPartnerRequestStatus | PENDING, ACCEPTED, DECLINED |
| message | String? | Optional personal note |
| shareExistingTrips | Boolean | Requester opted in to back-sharing **their own** existing trips on acceptance |
| respondedAt | DateTime? | When the request was answered |

`shareExistingTrips` records the requester's choice at send time because it is only
acted on at accept time. The recipient's mirror-image choice is passed on the accept
call and acted on immediately, so it needs no column. Each flag only ever shares its
own side's trips.

Unique on `(requesterId, recipientId)` — one row per ordered pair, so re-sending
refreshes the existing request instead of creating a duplicate pending one. A CHECK
constraint also forbids `requesterId = recipientId`.

### LocationCategory

Categories used to classify locations. System defaults have a null `userId`.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| userId | Int? | Owner foreign key (null for system defaults) |
| name | String | Category name |
| icon | String? | Icon identifier |
| color | String? | Hex color code |
| isDefault | Boolean | System default category flag |

Referenced by `Location.categoryId`.

## Media and Content Models

### PhotoAlbumAssignment

Junction table assigning photos to albums (many-to-many).

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| albumId | Int | Album foreign key |
| photoId | Int | Photo foreign key |
| sortOrder | Int | Order within the album |

Unique on `(albumId, photoId)`.

### WeatherData

Cached weather information for a trip (optionally tied to a location/date).

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| tripId | Int | Trip foreign key |
| locationId | Int? | Location foreign key |
| date | Date | Weather date |
| temperatureHigh | Decimal? | High temperature |
| temperatureLow | Decimal? | Low temperature |
| conditions | String? | Conditions description |
| precipitation | Decimal? | Precipitation amount |
| humidity | Int? | Humidity percentage |
| windSpeed | Decimal? | Wind speed |
| sunrise | DateTime? | Sunrise time |
| sunset | DateTime? | Sunset time |
| fetchedAt | DateTime | When data was fetched |

### FlightTracking

Live flight status data linked one-to-one to a Transportation record.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| transportationId | Int | Transportation foreign key (unique) |
| flightNumber | String? | Flight number |
| airlineCode | String? | Airline code |
| status | String? | scheduled, active, landed, cancelled, diverted |
| gate | String? | Gate |
| terminal | String? | Terminal |
| baggageClaim | String? | Baggage claim area |
| departureDelay | Int? | Departure delay (minutes) |
| arrivalDelay | Int? | Arrival delay (minutes) |
| scheduledDeparture | DateTime? | Scheduled departure |
| actualDeparture | DateTime? | Actual departure |
| scheduledArrival | DateTime? | Scheduled arrival |
| actualArrival | DateTime? | Actual arrival |
| lastUpdatedAt | DateTime | Last status refresh |

## Travel Documents and Languages

### TravelDocument

Stores user travel documents (passports, visas, etc.).

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| userId | Int | Owner foreign key |
| type | TravelDocumentType | PASSPORT, VISA, ID_CARD, GLOBAL_ENTRY, VACCINATION |
| issuingCountry | String | Issuing country |
| documentNumber | String? | Document number |
| issueDate | Date? | Issue date |
| expiryDate | Date? | Expiry date |
| name | String | Name on document or descriptive name |
| notes | String? | Notes |
| isPrimary | Boolean | Primary document flag |
| alertDaysBefore | Int | Days before expiry to alert (default 180) |

### VisaRequirement

Static reference data for visa requirements between countries.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| passportCountry | String | Passport-holder country |
| destinationCountry | String | Destination country |
| visaRequired | Boolean | Whether a visa is required |
| visaType | String | visa_free, visa_on_arrival, e_visa, visa_required |
| maxStayDays | Int? | Maximum stay length |
| notes | String? | Notes |
| sourceUrl | String? | Source reference URL |
| lastVerified | Date? | When the data was last verified |

Unique on `(passportCountry, destinationCountry)`.

### TripLanguage

Languages selected for a trip (used for phrase lookup).

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| tripId | Int | Trip foreign key |
| languageCode | String | ISO language code |
| language | String | Language display name |

Unique on `(tripId, languageCode)`.

### LanguagePhrase

Reference bank of common travel phrases per language.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| language | String | Language display name |
| languageCode | String | ISO language code |
| category | String | greetings, directions, food, emergency, etc. |
| english | String | English phrase |
| translation | String | Translated phrase |
| pronunciation | String? | Pronunciation guide |
| notes | String? | Notes |
| sortOrder | Int | Display order |

## Validation and Caching Models

### DismissedValidationIssue

Records trip-health-check issues a user has dismissed so they no longer affect trip status.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| tripId | Int | Trip foreign key |
| issueType | String | Issue type identifier |
| issueKey | String | Unique key for a specific issue instance |
| category | ValidationIssueCategory | Issue category |
| dismissedAt | DateTime | When the issue was dismissed |

Unique on `(tripId, issueType, issueKey)`.

### RouteCache

Caches calculated routes (distance/duration) from OpenRouteService to avoid repeat API calls.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| fromLat / fromLon | Decimal | Origin coordinates |
| toLat / toLon | Decimal | Destination coordinates |
| distance | Decimal | Route distance (km) |
| duration | Decimal | Route duration (minutes) |
| profile | String | driving-car, cycling-regular, foot-walking |
| routeGeometry | Json? | Route polyline coordinates |

Unique on `(fromLat, fromLon, toLat, toLon, profile)`.

## PDF + AI Import Models

These models power the PDF + AI import system: a user uploads a PDF (e.g. a
booking confirmation), it is parsed by an LLM into candidate entities, and the
user reviews those candidates before they are committed into a trip.

### PdfImport

Represents a single uploaded PDF file and its parsing lifecycle.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| userId | Int | Owner foreign key |
| originalName | String | Original uploaded file name |
| storedPath | String | Path to the stored file |
| fileSizeBytes | Int | File size in bytes |
| status | PdfImportStatus | UPLOADED, PARSING, PARSED, PARSE_FAILED, NO_ENTITIES |
| errorMessage | String? | Error detail if parsing failed |
| processedAt | DateTime? | When parsing completed |

### PendingEntity

A candidate entity extracted from a `PdfImport` by the AI parser, awaiting user review.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| pdfImportId | Int | Parent PdfImport foreign key |
| userId | Int | Owner foreign key |
| entityType | PendingEntityType | TRANSPORTATION, LODGING, ACTIVITY, LOCATION |
| parsedData | Json | Raw parsed entity data |
| confidence | Float | Parser confidence score (default 0.8) |
| matchedTripId | Int? | Trip the entity was matched to |
| status | PendingEntityStatus | PENDING, ACCEPTED, REJECTED |
| createdEntityId | Int? | ID of the real entity created on acceptance |
| createdEntityType | PendingEntityType? | Type of the created entity |
| reviewedAt | DateTime? | When the user reviewed the candidate |

## Currency Conversion

Mixed-currency trips used to be summed without conversion — a €500 hotel and a
¥500 dinner added to "1000". Every costed row now carries a frozen conversion
snapshot.

### Snapshot columns

`TripExpense`, `Activity`, `Transportation`, `Lodging`, and `CustomItem` each carry:

| Field | Type | Notes |
|-------|------|-------|
| exchangeRate | Decimal? | Rate at the record's own date; frozen once written |
| baseAmount | Decimal? | The amount restated in `baseCurrency` |
| baseCurrency | String? | **Stored per row**, so changing your home currency invalidates the snapshot rather than silently reinterpreting it |

`User.baseCurrency` is the home currency totals are reported in.

### ExchangeRate

Cache keyed on `(date, fromCurrency, toCurrency)` — a pair/date is fetched at
most once, ever. Rates come from Frankfurter (keyless, historical dates
supported); override with `EXCHANGE_RATE_API_URL`.

Three behaviours worth knowing:

- **All FX math is `Prisma.Decimal`**, never floats — `0.3 × 1.1` must be `0.33`.
- **The budget is converted too.** Comparing a USD budget against EUR spend is
  the same bug as the original. When the budget can't be converted, it comes
  back null and the UI says so rather than drawing a bogus progress bar.
- **Unconverted amounts are excluded from `spent`** and reported separately
  under `conversion.unconverted`, grouped by currency. Silently mixing them back
  in would recreate the original defect.

Reporting currency is the **trip owner's** base currency, not the requester's —
otherwise each collaborator's read would invalidate and rewrite the snapshots.

## Opening Hours

`Location` gained `openingHours` (the raw OSM `opening_hours` string, kept
verbatim as the single source of truth), `openingHoursSource` (`osm` | `manual`,
so a manual entry is never clobbered by the automatic lookup), and `timezone`
(IANA, auto-derived from coordinates via `tz-lookup`, user-overridable).

Parsing lives in `openingHours.service.ts` and is deliberately **whitelist-based
— anything outside the supported grammar fails closed to `UNKNOWN`** rather than
being partially misread. The Trip Health Check warns only on a definite `CLOSED`,
so it never cries wolf on an unparseable spec.

Two correctness notes:

- Hours are wall-clock times in the **location's** zone, not the user's or the
  trip's. Evaluation formats to a string in that zone and re-reads the fields;
  the common `toZonedTime` + system-local-getters approach misreports across DST.
- There is **no UTC fallback**. A location with no timezone yields `UNKNOWN`,
  never a comparison against the wrong clock.

## Saved Links

Reference URLs kept alongside a trip — restaurant writeups, trail guides,
timetables. Distinct from the `bookingUrl` field on Activity, Transportation and
Lodging, which means "the booking" rather than "a reference".

### SavedLink

| Field | Type | Notes |
|-------|------|-------|
| id | Int | Primary key |
| userId | Int | Owner (Cascade on delete) |
| tripId | Int? | **Nullable** — null means the link sits in the unassigned inbox |
| url | String (Text) | Text, not VarChar(500): real URLs with query strings exceed 500 chars |
| title | String? | User-supplied title, else the scraped `og:title` |
| description | String? | Scraped `og:description` |
| siteName | String? | Scraped `og:site_name`, falling back to the hostname |
| imageUrl | String? (Text) | Scraped `og:image`, stored as a remote URL (not proxied) |
| notes | String? | Free-text user notes |
| source | SavedLinkSource | MANUAL or EMAIL |
| metadataStatus | LinkMetadataStatus | PENDING, FETCHED, FAILED, SKIPPED |
| metadataFetchedAt | DateTime? | When metadata was last scraped |

Two behaviours worth knowing:

- **`tripId` uses `SetNull`, not `Cascade`.** Deleting a trip returns its links to
  the inbox rather than destroying them. As a consequence `clearUserData` in
  `restore.service.ts` must delete saved links explicitly — the trip cascade won't.
- **Assigning, reassigning, or unassigning a trip drops the link's `EntityLink`
  rows**, because those are hard-bound to a single trip.

URLs are normalised on write: `stripTrackingParams` in `linkMetadata.service.ts`
removes `utm_*`, `pk_*`, `mtm_*` and a denylist of known click-ids (`fbclid`,
`gclid`, `msclkid`, …) before storage. Ambiguous params such as bare `ref` and
`cid` are deliberately left alone.

Metadata scraping fetches user-supplied URLs server-side, so it is SSRF-guarded:
every request — **including every redirect hop** — passes through
`validateUrlNotInternal`, with `maxRedirects: 0` and manual redirect following.
The URL is then replaced with where it actually landed, so click-wrappers and
shorteners resolve to the real page.

### EmailIngest

One row per message pulled from the ingest mailbox. Deterministic capture —
extract `href`s, scrape Open Graph tags. **No LLM is involved**, unlike the
email-import system removed in v5.4.0, which failed trying to make an LLM parse
booking emails into structured entities.

| Field | Type | Notes |
|-------|------|-------|
| id | Int | Primary key |
| messageId | String | **Unique.** The RFC 5322 Message-ID, and the processing claim |
| userId | Int? | Null for `REJECTED_SENDER` — the message belongs to no one |
| fromAddress | String? | Used for sender verification |
| toAddress | String? | Captured for plus-address routing later |
| subject | String? | |
| receivedAt | DateTime? | From the message `Date` header |
| status | EmailIngestStatus | See below |
| linkCount | Int | Links successfully created |
| errorMessage | String? | Populated on `FAILED` |

`SavedLink.emailIngestId` points back here (`SetNull`, so pruning ingest history
never destroys the links it produced).

Three behaviours worth knowing:

- **Archiving is what marks a message done**, which makes INBOX the work queue —
  anything sitting there is by definition unprocessed. Archiving uses an explicit
  `messageMove`, never `\Deleted` + expunge: Gmail's handling of `\Deleted`
  depends on a per-account Auto-Expunge preference, so the same code can archive
  on one account and *trash* on another.
- **A re-delivered message is archived without reprocessing.** That is what makes
  a crash between "links created" and "archived" idempotent.
- **Sender verification** matches `From` against a user's `email` or their
  `linkIngestSenders`. `From` is spoofable; the mailbox address is the real
  secret.

### EmailIngestStatus Enum

| Value | Meaning |
|-------|---------|
| PROCESSING | Claimed and mid-flight; reset to FAILED by the startup sweeper if stale |
| PROCESSED | Links created |
| NO_LINKS | Nothing usable survived filtering |
| REJECTED_SENDER | From address not recognised |
| FAILED | Parse or transport error |

## Custom Items

The escape hatch for trip content that fits none of the first-class entities — a
parking reservation, a rental-agency contact, a "call the vet on day 3" reminder.
Types are presentation-only; every item shares one fixed field set. Full design
notes in [CUSTOM_ITEM_SPEC.md](../development/CUSTOM_ITEM_SPEC.md).

### CustomItemType

The user-level type registry. Always user-owned — unlike `LocationCategory` there is
no NULL-`userId` system row.

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| userId | Int | Owner foreign key (Cascade) |
| name | String | Type name |
| icon | String? | Icon identifier |
| color | String? | Hex color code |
| isDefault | Boolean | Marks a seeded starter type |

Unique on `(userId, name)`.

**`isDefault` is provenance only and never gates editing.** `updateType` and
`deleteType` deliberately do *not* filter on it, and the restore path forces it to
`false`. This is the opposite of `LocationCategory`, where preserving `isDefault`
across a backup round-trip leaves the user unable to edit their own categories.

The four starter types (**Reservation, Contact, Reminder, Misc**) are seeded lazily on
the user's first read of the registry, guarded on the *total* type count. Guarding on
total rather than on `isDefault` is what stops a user who deleted every type from
having them resurrected, and stops a restored backup from colliding with a re-seed.

### CustomItem

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| tripId | Int | Trip foreign key (Cascade) |
| typeId | Int? | CustomItemType foreign key (**SetNull**) |
| name | String | Item name |
| notes | String? | Rich text |
| allDay | Boolean | All-day flag |
| startTime | DateTime? | Start (null = not on the timeline) |
| endTime | DateTime? | End |
| timezone | String? | IANA timezone |
| locationId | Int? | Location foreign key (**SetNull**) |
| cost | Decimal(10,2)? | Cost — DB CHECK `>= 0` |
| currency | String? | Currency code |
| exchangeRate / baseAmount / baseCurrency | — | Frozen FX snapshot |
| url | String (Text)? | Text, not VarChar(500) |
| confirmationNumber | String? | Confirmation number |

Four behaviours worth knowing:

- **`typeId` uses `SetNull`.** Deleting a type keeps its items, presented as untyped.
- **`locationId` is a direct FK**, following `Transportation` rather than `Activity`.
  It means "the item is *at* this place" and drives the map marker, so it must be a
  single unambiguous location. An `EntityLink` to a `LOCATION` remains possible and
  carries the weaker "related to" meaning.
- **Changing `cost` or `currency` clears the FX snapshot**, so the budget summary
  recomputes it. Leaving it would report the old converted amount against the new figure.
- **Only items with a `startTime` reach the timeline and daily view.** Undated ones stay
  in the Custom tab, and appear under "Unscheduled Items" in the printable itinerary.

Custom items feed the trip budget through the `other` bucket, and the Trip Health Check
raises a `COMPLETENESS` issue for an item that has a cost but no currency (which would
otherwise be silently excluded from the total).

## Entity Linking System

The `EntityLink` model provides a polymorphic linking system for connecting any entity to any other entity within a trip.

### EntityLink

| Field | Type | Description |
|-------|------|-------------|
| id | Int | Primary key |
| tripId | Int | Trip foreign key |
| sourceType | EntityType | Source entity type |
| sourceId | Int | Source entity ID |
| targetType | EntityType | Target entity type |
| targetId | Int | Target entity ID |
| relationship | LinkRelationship | Type of relationship |
| sortOrder | Int? | Custom ordering |
| notes | String? | Link notes |

### EntityType Enum

10 values:

```text
PHOTO, LOCATION, ACTIVITY, LODGING, TRANSPORTATION, JOURNAL_ENTRY, PHOTO_ALBUM, PDF_IMPORT, SAVED_LINK, CUSTOM_ITEM
```

**Adding a value here fans out to about 22 call sites, not "roughly ten"** — measured
while adding `CUSTOM_ITEM`. Only six are compiler-enforced:

- `ENTITY_CONFIG` in `entityLink.service.ts`
- `ENTITY_TYPE_CONFIG` and `ENTITY_TYPE_TO_TAB` in the frontend `entityConfig.ts`
- a **second, divergent** `ENTITY_TYPE_TO_TAB` in `EntityDetailModal.tsx`
- `emptyGroups()` in `LinkPanel.tsx` and `LinkedEntitiesDisplay.tsx`

The rest fail silently or at runtime, and the silent ones are data-lossy because
`entityTypeEnum = z.nativeEnum(EntityType)` in `entityLink.types.ts` is auto-derived —
the API accepts the new value the moment the enum lands. The ones that matter most:

- `backup.types.ts` `ENTITY_TYPES` — a missing value **fails the entire restore with a
  400** (see the note in that file); it does not silently drop links.
- `restore.service.ts` `getNewEntityId` and `trip.service.ts` `getNewId` — both typed
  `string`, so a missing case silently **drops links** on restore and trip-duplication.
- `ENTITY_TYPE_DISPLAY_ORDER` in `entityConfig.ts` — controls whether the type renders
  at all.
- `entityTypeToLinkType` in `crudHelpers.ts` — a `Partial` record, so a missing entry
  compiles and then **orphans entity links on delete**.

A full inventory lives in [CUSTOM_ITEM_SPEC.md](../development/CUSTOM_ITEM_SPEC.md).

### LinkRelationship Enum

| Value | Use Case |
|-------|----------|
| RELATED | Generic relationship |
| TAKEN_AT | Photo taken at location |
| OCCURRED_AT | Activity at location |
| PART_OF | Sub-activity, nested item |
| DOCUMENTS | Journal documents entity |
| FEATURED_IN | Photo in album/journal |

### Example Links

```text
Photo (id=5) --TAKEN_AT--> Location (id=12)
Activity (id=3) --OCCURRED_AT--> Location (id=8)
Album (id=2) --FEATURED_IN--> Location (id=15)
```

## Other Enums

The schema defines 8 enums in total. Besides `EntityType` and `LinkRelationship`
(documented above), the remaining 6 are:

### PdfImportStatus

Lifecycle status of a `PdfImport` record.

| Value | Meaning |
|-------|---------|
| UPLOADED | File uploaded, not yet parsed |
| PARSING | Parsing in progress |
| PARSED | Parsing completed successfully |
| PARSE_FAILED | Parsing failed |
| NO_ENTITIES | Parsed, but no entities were found |

### PendingEntityType

Type of entity a `PendingEntity` represents (and may become on acceptance).

| Value |
|-------|
| TRANSPORTATION |
| LODGING |
| ACTIVITY |
| LOCATION |

### PendingEntityStatus

Review state of a `PendingEntity`.

| Value | Meaning |
|-------|---------|
| PENDING | Awaiting user review |
| ACCEPTED | Approved and committed to a trip |
| REJECTED | Discarded by the user |

### SavedLinkSource

How a `SavedLink` entered the system.

| Value | Meaning |
|-------|---------|
| MANUAL | Pasted into the app by the user |
| EMAIL | Extracted from a forwarded email |

### LinkMetadataStatus

Open Graph scraping state of a `SavedLink`.

| Value | Meaning |
|-------|---------|
| PENDING | Queued, or currently being fetched |
| FETCHED | Metadata retrieved successfully |
| FAILED | Page unreachable or unparseable — the link row is still kept |
| SKIPPED | Scraping deliberately not attempted |

### ValidationIssueCategory

Category for a `DismissedValidationIssue` (trip health check).

| Value | Meaning |
|-------|---------|
| SCHEDULE | Timeline conflicts, impossible travel times |
| ACCOMMODATIONS | Missing lodging |
| TRANSPORTATION | Gaps, tight connections |
| COMPLETENESS | Missing info (lower priority) |
| DOCUMENTS | Passport validity, visa requirements |

### TravelDocumentType

Type of a `TravelDocument`.

| Value |
|-------|
| PASSPORT |
| VISA |
| ID_CARD |
| GLOBAL_ENTRY |
| VACCINATION |

### UserInvitationStatus

Status of a `UserInvitation` (application-level invite).

| Value | Meaning |
|-------|---------|
| PENDING | Awaiting acceptance |
| ACCEPTED | Invitee registered |
| DECLINED | Invitation declined |
| EXPIRED | Invitation expired |

### TravelPartnerRequestStatus

Status of a `TravelPartnerRequest`.

| Value | Meaning |
|-------|---------|
| PENDING | Awaiting the recipient's response |
| ACCEPTED | Partnership established on both users |
| DECLINED | Recipient declined |

## Indexes

Key indexes for performance:

| Table | Index | Purpose |
|-------|-------|---------|
| trips | (userId, status) | Dashboard filtering |
| trips | (startDate, endDate) | Date range queries |
| locations | (tripId) | Trip location listing |
| locations | coordinates (GIST) | Geospatial queries |
| photos | (tripId, takenAt) | Chronological photo listing |
| entity_links | (tripId, sourceType, sourceId) | Forward link queries |
| entity_links | (tripId, targetType, targetId) | Reverse link queries |
| transportation | (connectionGroupId) | Grouped connections |

## Cascade Deletes

Deleting a trip automatically deletes:
- All locations, photos, activities, transportation, lodging
- All journal entries and photo albums
- All entity links within the trip
- Tag and companion assignments (not the tags/companions themselves)

## Coordinate Precision

- **Latitude**: Decimal(10,8) - Range: -90 to 90
- **Longitude**: Decimal(11,8) - Range: -180 to 180

This provides ~1.1mm precision, more than sufficient for travel applications.

## PostGIS Usage

The `coordinates` field on Location and Photo uses PostGIS Geography type for:
- Efficient spatial indexing
- Distance calculations
- Proximity queries

```sql
-- Example: Find locations within 10km of a point
SELECT * FROM locations
WHERE ST_DWithin(
  coordinates,
  ST_GeogFromText('POINT(-122.4194 37.7749)'),
  10000
);
```

## Database Management

### Generate Prisma Client

```bash
cd backend
npx prisma generate
```

### Create Migration

```bash
npx prisma migrate dev --name descriptive_name
```

### Apply Migrations (Production)

```bash
npx prisma migrate deploy
```

### View Schema Visually

```bash
npx prisma studio
```

Opens GUI at http://localhost:5555

## Related Documentation

- [Backend Architecture](BACKEND_ARCHITECTURE.md) - Service layer patterns
- [API Reference](../api/README.md) - REST endpoint documentation
