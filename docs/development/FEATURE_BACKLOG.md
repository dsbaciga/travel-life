# Feature Backlog

**Last Updated**: 2026-07-25

This document consolidates all feature ideas and future enhancements for Travel Life. Features are organized by priority and category.

**Status**: See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for completed features and current project state.

---

## 🎯 High Priority Features

These features provide significant value and are ready for implementation.

### 1. Trip Cloning

**Category**: Travel Planning
**Effort**: Low
**Impact**: High

**Description**: Duplicate past trips as templates for similar future journeys.

**Use Cases**:
- Annual trips (family vacations)
- Repeat business travel routes
- Multi-destination tours

**Implementation**: Existing CRUD operations + duplication logic. Should clone all trip data (locations, activities, transportation) but allow customization.

**Status**: ✅ Completed

### 2. Trip Health Check

**Category**: Planning & Validation
**Effort**: Medium
**Impact**: High

**Description**: Automated validation system that identifies potential issues in trip planning.

**Validation Rules**:
- **Critical**: Missing lodging, transportation gaps, timeline conflicts, invalid dates
- **Warnings**: Tight connections (<2hrs), missing information, unbalanced days
- **Info**: Optimization opportunities, missing journal entries

**Features**:
- Health score (0-100)
- Auto-fix for simple issues
- Dismiss/ignore functionality
- Pre-trip checklist

**Status**: ✅ Completed

### 3. Travel Time Alerts

**Category**: Planning & Validation
**Effort**: Medium
**Impact**: High

**Description**: Calculate travel times between activities and warn when connections are impossible.

**Features**:
- Real-time travel time calculation (Google Maps or OSRM)
- Support for multiple transportation modes
- Visual indicators on timeline
- Auto-fix suggestions
- Cache travel times to reduce API costs

**Status**: ✅ Completed

### 4. Batch Operations

**Category**: Productivity
**Effort**: Low
**Impact**: High

**Description**: Select multiple entities for bulk editing.

**Current State**: Photo gallery has multi-select, expand to other entities.

**Operations**:
- Bulk delete
- Bulk category change
- Bulk tag assignment
- Bulk privacy level changes

**Status**: ✅ Completed

### 5. Activity Templates

**Category**: Productivity
**Effort**: Low
**Impact**: High

**Description**: Save common activities as templates (e.g., "Airport Transfer", "Hotel Check-in").

**Features**:
- Template CRUD operations
- Apply template to create new activity
- Category-specific templates
- User-defined templates

### 6. Auto-Save Drafts

**Category**: UX
**Effort**: Low
**Impact**: High

**Description**: Don't lose work when creating activities/journal entries.

**Implementation**: localStorage draft saving with periodic auto-save.

**Status**: ✅ Completed

### 7. Smart Lodging Duration

**Category**: UX
**Effort**: Very Low
**Impact**: High

**Description**: Auto-calculate nights from check-in/check-out dates.

**Current State**: Manual entry
**Implementation**: Simple date calculation

**Status**: ✅ Completed

### 8. Timeline Export as PDF

**Category**: Export & Sharing
**Effort**: High
**Impact**: High

**Description**: Beautiful printable itinerary with maps and photos.

**Use Cases**:
- Share with family
- Print for offline reference
- Professional trip documentation

**Features**:
- Professional layout with branding
- Include maps, photos, key details
- Customizable templates

**Status**: ✅ Completed in v4.0.1

**Implementation**: PrintableItinerary component provides day-by-day breakdown with all trip events (activities, transportation, lodging, journal). Print-friendly styling with @media print CSS. Export via browser print dialog saves as PDF.

### 9. Pre-Trip Checklist Manager

**Category**: Planning
**Effort**: Medium
**Impact**: High

**Description**: Comprehensive pre-trip planning beyond just packing lists.

**Categories**:
- Documents (passport, visa, tickets)
- Health (vaccinations, medications, insurance)
- Financial (currency, credit cards, budget)
- Communication (SIM cards, apps, emergency contacts)

**Status**: ✅ Completed in v3.1.0

**Implementation**: Full checklist system with custom checklists, default tracking lists (Airports, Countries, Cities, US States), per-trip linking, auto-check from trip data, progress tracking, two-column layout, search/filter, and completion timestamps.

### 10. Drag & Drop Timeline

**Category**: UX
**Effort**: Medium
**Impact**: High

**Description**: Reorder activities/locations by dragging.

**Current State**: Edit to change order
**Implementation**: Drag-drop library (dnd-kit) + order field update

**Status**: ✅ Completed in v3.1.0

---

## 🚀 Medium Priority Features

Good enhancements that improve the experience.

### 11. Multi-Trip Views

**Category**: Analytics & Visualization
**Effort**: Medium
**Impact**: Medium

**Description**: Compare multiple trips side-by-side or view all trips on a single world map.

**Features**:
- Side-by-side comparison table
- Unified map showing all trip locations with color coding
- Multi-trip timeline view
- Cost comparison across trips

### 12. Favorite Places

**Category**: Organization
**Effort**: Low
**Impact**: Medium

**Description**: Star/bookmark locations across trips for quick reference.

**Features**:
- Star icon on locations
- "Favorites" page showing all starred locations
- Notes on why it's a favorite
- Quick add to new trips

**Status**: ✅ Completed 2026-07-19 — star toggle on locations, `GET /api/locations/favorites`, Favorites filter on Places Visited

### 13. Multi-City Trip Planner

**Category**: Planning
**Effort**: High
**Impact**: High

**Description**: Visual drag-and-drop interface for planning complex multi-destination trips.

**Features**:
- Drag cities to reorder
- Visualize routes on map
- See distance/travel time between stops
- Optimize route for minimum travel time

### 14. Recurring Trips

**Category**: Planning
**Effort**: Medium
**Impact**: Medium

**Description**: Template for annual trips (family vacations, business travel routes).

**Features**:
- Define recurrence pattern (annually, quarterly)
- Auto-create trip instances from template
- Track how trips evolve over time

### 15. Custom Trip Types

**Category**: Organization
**Effort**: Low
**Impact**: Medium

**Description**: Beyond Dream/Planning/Completed - Business, Volunteer, Study Abroad, etc.

**Examples**:
- Business (expense tracking, meetings, networking)
- Volunteer (projects, organizations, impact)
- Study Abroad (courses, university, housing)
- Pilgrimage (spiritual sites, rituals, significance)

**Implementation**: `User.tripTypes` stores a user-defined list of trip types (each with a name and emoji); `Trip.tripType` and `Trip.tripTypeEmoji` assign a type per trip. Migrations `20260207_add_trip_types` and `20260211_widen_trip_type_emoji`.

**Status**: ✅ Completed

### 16. Smart Suggestions

**Category**: AI/ML
**Effort**: High
**Impact**: High

**Description**: "You have 4 hours between activities, here are nearby suggestions".

**Features**:
- Analyze schedule gaps
- Suggest activities based on location, preferences, time available
- One-click add to itinerary

### 17. Expense Predictions

**Category**: Analytics
**Effort**: High
**Impact**: Medium

**Description**: Based on past trips, predict costs for upcoming ones.

**Features**:
- ML model trained on past spending
- Category-wise predictions
- Confidence intervals
- Adjust for inflation, exchange rates

### 18. Travel Journal Privacy Levels

**Category**: Privacy & Sharing
**Effort**: Medium
**Impact**: Medium

**Description**: Different privacy for different sections (public photos, private journal).

**Current State**: Trip-level privacy only
**Enhancement**: Section-level privacy controls, "Share this activity" button, privacy preview.

### 19. Local Tips Exchange

**Category**: Community
**Effort**: High
**Impact**: Medium

**Description**: Share/receive local recommendations for destinations.

**Features**:
- Tip library per destination
- Upvote/downvote system
- Filter by category (food, hidden gems, safety)
- Moderation system

### 20. Heatmap of Places Visited

**Category**: Visualization
**Effort**: Medium
**Impact**: Medium

**Description**: Visual world map showing frequently visited regions.

**Features**:
- Color intensity by visit frequency
- Filter by year, trip type
- Country/city statistics
- Export as image

### 21. Default Timezone

**Category**: UX
**Effort**: Very Low
**Impact**: Medium

**Description**: Set trip timezone automatically based on first location.

**Implementation**: `tz-lookup` from the first location's coordinates when the trip has no timezone.

**Status**: ✅ Completed 2026-07-19

### 22. Recently Viewed Trips

**Category**: Navigation
**Effort**: Very Low
**Impact**: Medium

**Description**: Quick access to last 5 viewed trips.

**Implementation**: localStorage tracking or database log.

### 23. Keyboard Shortcuts

**Category**: Productivity
**Effort**: Low
**Impact**: Medium

**Description**: Power-user features for quick navigation.

**Examples**:
- `n` = New trip
- `g` then `d` = Go to dashboard
- `/` = Focus search
- `?` = Show shortcuts help

**Status**: ✅ Completed in UI/UX improvements

### 24. Markdown Support in Notes

**Category**: UX
**Effort**: Low
**Impact**: Medium

**Description**: Allow formatted text in notes fields.

**Implementation**: `MarkdownEditor` component provides a write/preview editor; `MarkdownRenderer` renders stored Markdown content throughout the app.

**Status**: ✅ Completed

### 25. Trip Archive

**Category**: Organization
**Effort**: Very Low
**Impact**: Medium

**Description**: Hide old trips from main list without deleting.

**Implementation**: `Trip.archived` field, excluded from lists by default, Archived filter + card action.

**Status**: ✅ Completed 2026-07-19

### 26. Best Times to Visit

**Category**: Planning
**Effort**: Medium
**Impact**: Medium

**Description**: Track when you visited places and rate the timing.

**Features**:
- Rate weather, crowds, pricing
- Compare with other travelers' experiences
- Seasonal recommendation engine

### 27. Bulk Import

**Category**: Data Management
**Effort**: Medium
**Impact**: Medium

**Description**: CSV import for activities/locations.

**Use Cases**:
- Migrate from spreadsheets
- Import large datasets
- Batch create locations

**Features**:
- CSV template download
- Field mapping interface
- Preview before import
- Error handling

---

## 🎨 UI/UX Enhancements

### 28. Compact View Mode

**Category**: UX
**Effort**: Low
**Impact**: Low

**Description**: Dense list view for trips with lots of activities.

**Current State**: Standard spacing optimized for readability
**Enhancement**: Alternative CSS layout, toggle between standard/compact.

**Status**: ✅ Completed in UI/UX improvements

### 29. Custom Dashboard Widgets

**Category**: UX
**Effort**: Medium
**Impact**: Medium

**Description**: Let users choose which widgets to show.

**Current State**: Fixed widget layout

**Features**:
- Show/hide widgets
- Reorder widgets
- Widget size options
- Save preferences

### 30. Night Mode Schedule

**Category**: UX
**Effort**: Very Low
**Impact**: Low

**Description**: Auto-switch dark mode based on time.

**Current State**: Manual toggle
**Implementation**: Time-based theme switching.

### 31. Trip Cover Images

**Category**: Visual
**Effort**: Low
**Impact**: Low

**Description**: Hero image for each trip (different from cover photo).

**Use Case**: Visual appeal on trip list/dashboard
**Implementation**: `Trip.bannerPhotoId` (separate from `coverPhotoId`) with hero display in the trip dashboard.

**Status**: ✅ Completed

### 32. Activity Icons

**Category**: Visual
**Effort**: Low
**Impact**: Low

**Description**: Custom icons for activity categories.

**Current State**: Emoji-based categories
**Enhancement**: Icon library + custom icon picker.

---

## 📸 Photo & Media Features

### 33. Advanced Photo Organization

**Category**: Photo Management
**Effort**: High
**Impact**: Medium

**Features**:
- Auto-organize by date/location using EXIF data (EXIF parsing already implemented)
- Facial recognition for companions
- Smart albums (e.g., "All Sunsets", "Food Photos")
- AI-powered auto-tagging

### 34. Video Support

**Category**: Media
**Effort**: High
**Impact**: Medium

**Description**: Upload and playback videos alongside photos.

**Requirements**:
- Video upload and storage
- Thumbnail generation
- Video player integration
- Format conversion for web playback

### 35. Photo Stories

**Category**: Storytelling
**Effort**: Medium
**Impact**: Medium

**Description**: Create narrative slideshows combining photos + journal entries.

**Features**:
- Drag-and-drop photo ordering
- Add captions and narration
- Transition effects
- Export as video or shareable link

### 36. Photo Comparison Mode

**Category**: Photo Features
**Effort**: Medium
**Impact**: Low

**Description**: Before/After views for revisiting locations.

**Features**:
- Side-by-side comparison slider
- Match photos by location automatically
- Timeline slider showing place evolution

### 37. Photo Memories

**Category**: Engagement
**Effort**: Low
**Impact**: Low

**Description**: "On this day X years ago" notifications.

**Features**:
- Daily notification with past photos
- "Memories" page showing historical photos
- Share memories on social media

**Status**: ✅ Completed 2026-07-19 (in-app) — On This Day dashboard widget backed by `/api/memories/on-this-day`; social sharing not included

### 38. Collage Generator

**Category**: Photo Features
**Effort**: High
**Impact**: Low

**Description**: Auto-create photo collages from trips.

**Features**:
- Multiple layout templates
- Auto-select best photos
- Add trip info overlay
- Export high-resolution

### 39. Smart Photo Features

**Category**: Photo Management
**Effort**: Medium
**Impact**: Medium

**Features**:
- Auto-create albums by date
- "Photos without location" filter
- Duplicate photo detection
- Suggest locations based on EXIF GPS
- Photo metadata editor
- Batch EXIF operations

---

## 🗺️ Location & Map Features

### 40. Points of Interest Suggestions

**Category**: Location Intelligence
**Effort**: Medium
**Impact**: Medium

**Description**: Auto-suggest nearby attractions, restaurants, landmarks.

**Current State**: Nominatim integration exists, POI suggestions not implemented
**Enhancement**: Integrate POI database, suggestion engine.

### 41. Location Reviews & Ratings

**Category**: User Content
**Effort**: Low
**Impact**: Medium

**Description**: Personal ratings and notes for visited places.

**Implementation**: Add rating field to Location model, UI for star ratings.

**Scope note (2026-07-25)**: worth widening beyond Location. There is currently no
rating field anywhere in the schema, so lodging, activities, and restaurants can't be
scored either — and those are what you actually want to look back on. A 1-5 rating plus
a short "would I return?" verdict across Location, Lodging, and Activity turns the
archive into something queryable ("best meals of 2025", "hotels I'd rebook") and gives
Year in Review (#55) real material. Doing all four at once is barely more work than
Location alone.

### 42. Offline Maps

**Category**: Mobile
**Effort**: High
**Impact**: High

**Description**: Download map tiles for offline access during travel.

**Requirements**:
- Map tile caching
- Offline storage management
- Sync when online

**Status**: ✅ Completed — `useOfflineMap` hook, `MapCachePreview`, storage management UI, and sync as part of the PWA/offline system

### 43. Location History Import

**Category**: Data Import
**Effort**: High
**Impact**: Medium

**Description**: Import from Google Timeline or similar services.

**Features**:
- Parse Google Takeout data
- Automatic location creation
- Date/time matching
- Privacy controls
- GPX track import (watches, hiking apps, dashcams) alongside Google Takeout

**Scope note (2026-07-25)**: this is the strongest argument for the PostGIS extension,
which is enabled but barely used today (`Location.coordinates` and `Photo.coordinates`
are the only geography columns). A day's imported track gives `DayMiniMap` a real route
line instead of scattered pins, and the timestamps make two other features cheap:
auto-detecting which places were actually visited, and inferring locations for photos
that have no EXIF GPS (see #101).

### 44. Route Optimization

**Category**: Planning
**Effort**: High
**Impact**: High

**Description**: Suggest optimal ordering of locations to minimize travel time/distance.

**Features**:
- Traveling salesman algorithm
- Consider opening hours
- Account for transportation modes
- Visual route preview

### 45. Map Improvements

**Category**: Visualization
**Effort**: Medium
**Impact**: Medium

**Enhancements**:
- Cluster markers for dense locations
- Route lines between locations
- Custom marker icons by category
- Fullscreen map mode
- Heatmap view of visited places
- Map layer toggle (satellite/terrain/street)
- Location search on map

**Status**: ✅ Route lines completed in v3.1.0

---

## 🤝 Social & Sharing

### 46. Trip Collaboration UI

**Category**: Collaboration
**Effort**: Medium
**Impact**: High

**Features**:
- Invite by email
- Permission levels (view/edit/admin)
- Collaboration notifications
- Activity feed

**Status**: ✅ Completed — `CollaboratorsManager`, invitation emails via SMTP, permission levels, plus travel partner auto-collaboration (`TravelPartnerSettings`)

### 47. Public Trip Gallery

**Category**: Sharing
**Effort**: Medium
**Impact**: Medium

**Current State**: `privacyLevel` field exists
**Remaining Work**: Create discoverable public trips for inspiration.

**Features**:
- Browse public trips
- Search by destination
- Like/favorite trips
- Clone public trip as template

### 48. Trip Templates

**Category**: Sharing
**Effort**: Medium
**Impact**: Medium

**Description**: Export trips as templates others can clone/customize.

**Features**:
- Template marketplace
- Categories and tags
- Usage statistics
- Attribution to creator

### 49. Social Feed

**Category**: Community
**Effort**: High
**Impact**: Low

**Description**: Activity stream showing updates from followed travelers.

**Features**:
- Follow other users
- See recent trip updates
- Comment on posts
- Share to feed

### 50. Comments & Reactions

**Category**: Community
**Effort**: Medium
**Impact**: Low

**Description**: Allow comments on photos, locations, and journal entries.

**Features**:
- Nested comments
- Emoji reactions
- Notifications
- Moderation tools

### 51. Travel Meetups

**Category**: Community
**Effort**: High
**Impact**: Low

**Description**: Find other travelers going to same destination at same time.

**Features**:
- Opt-in directory
- Match by dates and locations
- In-app messaging
- Safety features

### 52. Timeline Sharing Widget

**Category**: Sharing
**Effort**: Medium
**Impact**: Low

**Description**: Embeddable timeline for blogs/social media.

**Features**:
- Generate embed code
- Responsive iframe
- Customizable styling

### 53. Live Trip Updates

**Category**: Real-time
**Effort**: High
**Impact**: Low

**Description**: Real-time location sharing during active trips.

**Features**:
- GPS tracking (with privacy controls)
- "Check in" at locations
- Real-time activity updates
- Safety features (check-in reminders)

---

## 📊 Analytics & Insights

### 54. Travel Statistics Dashboard

**Category**: Analytics
**Effort**: Low
**Impact**: High

**Current State**: Query existing data for counts, totals
**Enhancement**: Visualize data, add more metrics.

**Metrics**:
- Countries/cities visited
- Total distance traveled
- Days spent traveling
- Photos taken
- Money spent
- Activities completed

### 55. Year in Review

**Category**: Analytics
**Effort**: Medium
**Impact**: Medium

**Description**: Annual summary of travel highlights.

**Features**:
- Top destinations
- Most memorable moments
- Photo collage
- Statistics summary
- Shareable graphic

**Status**: ✅ Completed 2026-07-19 — `YearInReviewPage` at `/year-in-review` with yearly stats, highlight photos, and trip list

### 56. Carbon Footprint

**Category**: Analytics
**Effort**: Medium
**Impact**: Low

**Description**: Calculate environmental impact by transportation method.

**Features**:
- CO2 emissions per trip
- Compare transportation modes
- Offset recommendations
- Trends over time

### 57. Travel Pace Analysis

**Category**: Analytics
**Effort**: Low
**Impact**: Low

**Description**: Fast-paced vs. slow travel patterns.

**Metrics**:
- Average days per destination
- Activities per day
- Travel time vs. experience time ratio
- Rest days vs. active days

### 58. Travel Network Graph

**Category**: Visualization
**Effort**: High
**Impact**: Low

**Description**: Visualize connections between cities you've visited.

**Features**:
- Interactive graph visualization
- Node size = visit frequency
- Edge thickness = times traveled route
- Filter by date range, trip type

---

## 🔧 Technical & Power User Features

### 59. API Access

**Category**: Integration
**Effort**: Medium
**Impact**: Low

**Description**: Let users access their data programmatically.

**Features**:
- API key generation
- RESTful endpoints for all resources
- Rate limiting
- Comprehensive documentation
- SDK libraries

### 60. Webhooks

**Category**: Integration
**Effort**: Medium
**Impact**: Low

**Description**: Trigger actions when trips/photos are added.

**Examples**:
- Post to social media when photo added
- Send email when trip published
- Sync to calendar when trip created

### 61. Custom CSS

**Category**: Customization
**Effort**: Medium
**Impact**: Low

**Description**: Let users customize appearance.

**Implementation**: CSS injection with sanitization
**Security**: Careful sanitization required.

### 62. Version History

**Category**: Data Management
**Effort**: High
**Impact**: Low

**Description**: Track changes to trips over time.

**Features**:
- Snapshot on major changes
- Diff viewer
- Restore to previous version
- Audit log

### 63. Regex Search

**Category**: Search
**Effort**: Low
**Impact**: Low

**Description**: Advanced search with regular expressions.

**Use Case**: Power users, complex queries
**Implementation**: Regex query support in PostgreSQL.

---

## 📱 Mobile & PWA Features

### 64. Progressive Web App

**Category**: Mobile
**Effort**: High
**Impact**: Very High

**Features**:
- ✅ Offline support (offline trip download, offline maps, offline search)
- ✅ Install as native app (manifest, iOS install prompt)
- ✅ Service worker setup (`vite-plugin-pwa` + workbox)
- ✅ Cache-first strategy for photos
- ✅ Offline editing with sync queue and conflict resolution UI
- [ ] Push notifications

**Status**: ✅ Substantially completed — only push notifications remain

### 65. Mobile-Optimized UI

**Category**: Mobile
**Effort**: Medium
**Impact**: High

**Features**:
- Touch-friendly interfaces
- Swipe gestures
- Bottom navigation
- Pull-to-refresh

**Status**: ✅ Completed in UI/UX improvements

### 66. Quick Capture

**Category**: Mobile
**Effort**: Medium
**Impact**: High

**Description**: Fast photo upload + location tagging while traveling.

**Features**:
- Camera integration
- GPS auto-tagging
- Offline queue
- Quick caption entry

**Status**: ✅ Camera integration completed in UI/UX improvements

### 67. Push Notifications

**Category**: Engagement
**Effort**: Medium
**Impact**: Medium

**Features**:
- Reminders for upcoming trips
- Flight updates
- Collaboration notifications
- Photo memories

**Status**: ✅ Completed 2026-07-19 — web push (VAPID) with subscribe/test UI in Settings; "trip starts tomorrow" reminders shipped, other triggers can reuse `pushNotification.service`

---

## 🔌 Integration Features

### 68. Calendar Sync

**Category**: Integration
**Effort**: High
**Impact**: High

**Description**: Two-way sync with Google Calendar, iCal for trip dates.

**Features**:
- Auto-create calendar events
- Sync updates
- Handle conflicts
- Multiple calendar support

**Status**: ✅ Partially completed 2026-07-19 — read-only iCal subscription feed (`/api/calendar/:token.ics`) covers trips/transportation/lodging in any calendar app; two-way sync not planned

### 69. Booking Integrations

**Category**: Integration
**Effort**: High
**Impact**: High

**Description**: Import booking confirmations (flights, hotels, activities) into trips.

**Current State**: Delivered via the PDF + AI import system. Users upload a booking-confirmation PDF, which is parsed by an LLM (`pdfImport` controller/service + `pdfParser.service.ts`) to extract flights, lodging, and activities. Extracted items land in a review queue (`PendingEntity`) before being added to the trip.

**Note**: An earlier email-parsing implementation was built and then removed (commit `8ffab4e`, migration `20260406000000_remove_email_import`) in favor of the PDF + AI import approach. What failed there was specifically **LLM parsing of booking emails into structured entities** — see the commit messages in between ("still working on email parsing... even now", "updating email parsing logic again again" ×2).

**Update 2026-07-25**: the inbound-mail half now exists. Saved-link email ingest added
`emailIngest.service.ts` (IMAP poll, sender verification, dedupe on Message-ID, archive
after processing) plus the `EmailIngest` model and `IMAP_*` config. Revisiting
booking-email import is therefore much cheaper than last time — the transport,
credentials, scheduling, and crash recovery are all built and tested. Only the
booking-parsing step would be new, and that is precisely the part that failed before,
so it should be attempted only with a review queue in front of it (`PendingEntity`
already provides one).

**Features**:
- ✅ PDF upload + LLM-based parsing of booking confirmations
- ✅ Auto-populate booking details (flights, hotels, activities)
- ✅ Review/confirm extracted entities before linking to a trip
- [ ] Direct integrations with booking provider APIs (not started)

**Status**: ✅ Booking-confirmation import delivered via PDF + AI import

### 70. Expand Immich Integration

**Category**: Integration
**Effort**: Medium
**Impact**: Medium

**Current State**: Basic integration complete
**Enhancements**:
- Two-way sync
- Advanced filtering from Immich library
- Bulk import
- Album sync

### 71. Flight Tracking

**Category**: Integration
**Effort**: Medium
**Impact**: Medium

**Features**:
- Real-time status updates
- Gate changes
- Delay notifications
- Flight history

**Status**: ✅ Completed — `aviationstack.service.ts`, `flightTracking.routes.ts`, `FlightStatusBadge`, `FlightStatusWidget` on the trip dashboard

### 72. Weather Integration

**Category**: Integration
**Effort**: Medium
**Impact**: Medium

**Features**:
- Historical weather data
- Weather forecasts during planning
- Temperature trends
- Precipitation tracking

**Status**: ✅ Completed — `weather.service.ts` with caching, `WeatherCard`, `WeatherForecastWidget` on the trip dashboard

### 73. Mapping Services

**Category**: Integration
**Effort**: Medium
**Impact**: Medium

**Description**: Add support for Google Maps, Mapbox alongside Leaflet.

**Features**:
- Provider toggle
- Street view integration
- Better POI data
- Traffic information

### 74. Google Photos Integration

**Category**: Integration
**Effort**: High
**Impact**: High

**Description**: Connect to Google Photos to import photos directly into trips, similar to Immich integration.

**Features**:
- OAuth authentication
- Browse Google Photos library
- Import selected photos
- Preserve metadata

---

## 🎓 Onboarding & Help

### 75. Onboarding Flow

**Category**: UX
**Effort**: Medium
**Impact**: Medium

**Components**:
- Interactive tutorial
- Sample trip with demo data
- Feature highlights carousel
- Progress checklist
- Skip/dismiss options
- Tour mode toggle

### 76. Contextual Help

**Category**: Documentation
**Effort**: Low
**Impact**: Medium

**Features**:
- Tooltips on hover
- "?" icons for help
- Video tutorials
- FAQ section
- Keyboard shortcut reminder

**Status**: ✅ Keyboard shortcuts help completed

---

## 🌍 Advanced Features

### 77. Multi-Language Support

**Category**: Accessibility
**Effort**: High
**Impact**: Medium

**Description**: i18n for interface and content.

**Features**:
- UI translation
- RTL support
- Date/time localization
- Currency conversion
- Community translations

### 78. Accessibility (A11y)

**Category**: Accessibility
**Effort**: High
**Impact**: Critical

**Improvements**:
- ARIA labels throughout
- Comprehensive keyboard navigation
- Screen reader support
- Focus indicators
- Color contrast compliance (WCAG AA)
- Skip navigation links
- Accessible form validation

### 79. Alternative Timelines

**Category**: Advanced
**Effort**: High
**Impact**: Low

**Description**: "What we planned" vs "What actually happened" view.

**Features**:
- Planned vs. actual toggle
- Highlight differences
- Notes on why plans changed
- Learning insights

### 80. Trip Dependencies

**Category**: Organization
**Effort**: Low
**Impact**: Low

**Description**: Link trips in sequence (e.g., "Part 1 of European Tour").

**Features**:
- Parent/child trip relationships
- "Next trip" navigation
- Aggregate stats across trip series

---

## 🎮 Gamification Features

### 81. Travel Milestones

**Category**: Gamification
**Effort**: Low
**Impact**: Low

**Description**: Badges/achievements for visiting X countries, Y cities, Z photos captured.

**Examples**:
- "First International Trip"
- "10 Countries Visited"
- "100 Photos Uploaded"
- "1 Year of Continuous Travel"

### 82. Photo Challenges

**Category**: Gamification
**Effort**: Medium
**Impact**: Low

**Description**: "Capture a photo of X in each city".

**Examples**:
- "Golden hour shot in every location"
- "Local food in each city"
- "Street art collection"

---

## 📝 Export & Print Features

### 83. Export Trip as JSON

**Category**: Data Export
**Effort**: Low
**Impact**: High

**Description**: Simple data export feature for backup/migration.

**Status**: ✅ Completed as part of Backup & Restore system

### 84. Data Export/Import

**Category**: Data Management
**Effort**: Medium
**Impact**: High

**Features**:
- Export all data in standard formats (JSON, CSV)
- Import from other travel apps
- Spreadsheet import
- Preserve relationships

### 85. PDF Trip Itinerary

**Category**: Export
**Effort**: High
**Impact**: High

**Description**: Professional PDF generation.

**Features**:
- Beautiful layout
- Include maps and photos
- Customizable templates
- Print optimization

### 86. Photo Book Layout

**Category**: Export
**Effort**: High
**Impact**: Medium

**Description**: Generate print-ready photo book.

**Features**:
- Professional layouts
- Captions and stories
- Export for printing services
- Preview mode

### 87. Shareable Trip Page

**Category**: Sharing
**Effort**: Medium
**Impact**: High

**Description**: Public URL for sharing trips.

**Features**:
- Clean, shareable design
- Privacy controls
- Custom URL slugs
- Social media previews

**Status**: ✅ Completed 2026-07-19 — token-based `/share/:token` public page with sanitized data (token URLs instead of custom slugs)

### 88. Print-Optimized Styles

**Category**: Print
**Effort**: Low
**Impact**: Medium

**Description**: CSS media queries for printing.

**Current State**: Timeline print creates blank document (known bug)
**Fix**: Add print stylesheets.

---

## 🤖 AI & ML Features

### 89. Trip Recommendations Based on Season

**Category**: AI/ML
**Effort**: High
**Impact**: Low

**Description**: Suggest destinations based on time of year and weather preferences.

**Features**:
- Historical trip data analysis
- Weather pattern matching
- User preference learning
- "Where should I go in December?"

### 90. Destination Recommendations

**Category**: AI/ML
**Effort**: High
**Impact**: Medium

**Description**: Suggest destinations based on travel history and preferences.

**Features**:
- Collaborative filtering
- Preference learning
- Similar traveler recommendations
- Trending destinations

### 91. AI-Powered Features

**Category**: AI/ML
**Effort**: High
**Impact**: Medium

**Features**:
- Auto-tag photos by content (beach, mountain, food)
- Suggest journal entry topics based on photos/locations
- Generate trip summaries
- Smart album creation
- Itinerary optimization

### 92. Auto-Detect Duplicates

**Category**: Data Quality
**Effort**: Medium
**Impact**: Low

**Description**: Find duplicate locations/activities across trips.

**Features**:
- Fuzzy matching on names, coordinates
- Suggest merges
- Bulk operations
- Confidence scoring

---

## 👥 Collaboration Features

### 93. Travel Companions Network

**Category**: Social
**Effort**: Medium
**Impact**: Low

**Description**: Track which companions you've traveled with most.

**Features**:
- Companion statistics (trips together, destinations visited)
- Auto-suggest companions for new trips
- Companion availability calendar
- Travel compatibility scores

### 94. Trip Questions

**Category**: Community
**Effort**: High
**Impact**: Low

**Description**: Ask community for advice on upcoming trips.

**Features**:
- Q&A per trip
- Tag relevant travelers
- Accept best answer
- Voting system

---

## 🧹 Technical Debt

### 95. Type `transformTripToBackupFormat` Properly

**Category**: Technical Debt
**Effort**: Medium
**Impact**: Medium

**Description**: `backup.service.ts` declares `fetchTripWithRelatedData(): Promise<Record<string, unknown> | null>`,
throwing away the precise type Prisma already infers. `transformTripToBackupFormat` then re-establishes
the shape with **73 `as` assertions**. Flagged by automatic code review 2026-07-25; deferred because
another change was in flight on the same file at the time.

Some of those assertions hide genuine mismatches rather than merely restating a known type — e.g.
`trip.startDate as string | null` where Prisma returns `Date | null`. These currently "work" only
because `JSON.stringify` serialises `Date` to a string on the way out, so the in-memory type is a lie.

**Approach**:

- Extract the 169-line `include` object to a named const (`tripBackupInclude`)
- Derive `type TripWithRelations = Prisma.TripGetPayload<{ include: typeof tripBackupInclude }> & { photos: BackupPhoto[] }`
- Change both signatures to use it, then delete the now-redundant assertions

**Notes**: A spike confirmed the type resolves cleanly once the const is extracted — the only blocker
was the missing named include. The unknown is how many `Date`→`string` / `Decimal`→`number` mismatches
surface as real errors; resolving those means correcting `BackupTrip`'s field types. `FlexibleDateSchema`
in `backup.types.ts` is existing precedent for accepting both. Touches the backup/restore round-trip,
so pair it with a full backup → wipe → restore test.

---

## 💡 Ideas Review — 2026-07-25

Generated from a fresh pass over the schema, services, and components. Items that
duplicated existing entries were folded into those instead of listed again — ratings
into #41, GPX import into #43, booking email into #69. Already covered elsewhere and
deliberately not repeated here: photo dedupe (#39, #92), video (#34), day-route
optimisation (#44), trip templates (#1, #48), comments (#50), version history (#62),
live trip updates (#53), achievements (#81), Google Timeline import (#43).

### 96. Multi-Currency with Exchange Rates

**Category**: Budget & Expenses
**Effort**: Medium
**Impact**: High

**Description**: Store an exchange rate and base-currency amount alongside every costed
record, snapshotted at the transaction date.

**Why this is more than a nice-to-have**: `expense.service.ts` documents the current
behaviour in a comment — amounts are summed **with no FX conversion** and reported under
a single display currency. A €500 hotel and a ¥500 dinner currently add up to "1000".
Every mixed-currency trip shows a wrong total today.

**Features**:
- `exchangeRate` + `baseAmount` on TripExpense, Activity, Transportation, Lodging
- Rate fetched at transaction date from a free FX API, then frozen
- User's home currency as the reporting currency
- Backfill path for existing rows (assume trip currency, flag as estimated)

**Dependencies**: unblocks #106; makes #17 (Expense Predictions) meaningful.

**Status**: ✅ Completed 2026-07-25 — `exchangeRate`/`baseAmount`/`baseCurrency` snapshotted per
costed row, `exchangeRate.service.ts` backed by Frankfurter (keyless), rates cached per
(date, pair) in `exchange_rates` and never re-fetched. All FX math in `Prisma.Decimal`, never
floats. The **budget is converted too**, so a USD budget no longer compares against EUR spend.
Amounts that could not be converted are **excluded from `spent`** and reported separately rather
than silently mixed in. Activity/Transportation/Lodging fill in lazily on first budget read;
`scripts/backfill-currency-conversion.ts` handles legacy rows.

### 97. Expense Splitting & Settle-Up

**Category**: Budget & Expenses
**Effort**: Medium
**Impact**: High

**Description**: Record who paid and who owes, then settle up at the end of a trip.

**Current State**: `TripExpense` has no `paidBy` and no split. `TravelCompanion` and
`TripCollaborator` already model the people.

**Features**:
- `paidBy` (companion) on expenses
- Equal / custom-amount / percentage splits
- Settle-up view that minimises the number of transactions
- Per-person totals in the budget summary

**Value**: removes the need for a separate Splitwise on every group trip.

### 98. Trip Wishlist / Bucket List

**Category**: Travel Planning
**Effort**: Medium
**Impact**: Medium

**Description**: Places you want to go, not attached to any trip.

**Current State**: everything location-shaped is `tripId`-scoped, so a place you haven't
planned yet has nowhere to live. Distinct from Favorite Places (#12), which stars
Locations that already belong to a trip.

**Features**:
- Standalone wishlist entries with notes, links, and a rough season/time-of-year
- Pinned on the Places Visited map in a distinct colour
- "Convert to trip location" when a trip finally gets planned
- Pairs naturally with the `Dream` trip status that already exists

### 99. People in Photos

**Category**: Photo Management
**Effort**: Medium
**Impact**: Medium

**Description**: Tag which companions appear in which photos.

**Current State**: no face or person data anywhere in the schema.

**Features**:
- Manual tagging of `TravelCompanion` on photos
- Optional import of Immich's existing face/person data via its API
- "Every photo of X" view across all trips
- Companion avatars on photo cards

### 100. Photo Favorites & Highlight Reel

**Category**: Photo Management
**Effort**: Low
**Impact**: Medium

**Description**: Star individual photos and auto-assemble a per-trip highlight set.

**Current State**: `Location` has `isFavorite`; `Photo` does not.

**Features**:
- Star toggle on photos, mirroring the location pattern
- "Favorites" filter in the gallery and lightbox
- Auto-generated highlight reel per trip, shareable via the existing public share

### 101. Infer Photo Location from Itinerary

**Category**: Photo Management
**Effort**: Medium
**Impact**: Medium

**Description**: For photos with no EXIF GPS, infer where they were taken by matching
`takenAt` against the trip timeline.

**Distinct from #39**, which suggests locations *from* EXIF GPS. This is the inverse and
covers the harder case: scanned film, screenshots, phones with location off, and photos
imported from someone else's camera.

**Features**:
- Match `takenAt` against activities, lodging stays, and transportation legs
- Confidence indicator, and never overwrite real EXIF data
- Bulk "apply suggestions" with review
- Much stronger once GPX tracks exist (#43)

### 102. Opening Hours & Closure Warnings

**Category**: Location Intelligence
**Effort**: Medium
**Impact**: High

**Description**: Store opening hours per location and warn when a plan hits a closure.

**Current State**: `Location` has no hours field. OSM/Nominatim frequently carries an
`opening_hours` tag already, so much of this is a parse rather than a new data source.

**Features**:
- `openingHours` on Location, populated from OSM where available
- Timezone-aware "is it open then?" check against `visitDatetime`
- Warning surfaced through the existing Trip Health Check (#2)

**Why it matters**: a 9am Monday museum visit is the single most common real-world
itinerary failure, and the app currently has no way to catch it.

**Status**: ✅ Completed 2026-07-25 — `Location.openingHours` (raw OSM string as the single
source of truth), `openingHoursSource` so a manual entry is never clobbered by the automatic
lookup, and `Location.timezone` auto-derived via `tz-lookup`. `openingHours.service.ts` parses a
documented subset (weekday ranges incl. wrapping, multiple ranges per rule, `24/7`, `off`,
midnight-crossing, `;` override semantics) and **fails closed to `UNKNOWN`** for anything outside
it — month/date selectors, `sunrise`/`sunset`, `Mo[1]`, `||` fallbacks. `PH`/`SH` are evaluated
both ways and only answer when both agree. Evaluation uses `formatInTimeZone` rather than
`toZonedTime` + local getters, which misreports across DST. **No UTC fallback**: no timezone means
`UNKNOWN`, never a comparison against the wrong clock. Health check fires only on a definite
`CLOSED`, so it never cries wolf. Nominatim population is best-effort and post-commit. 91 tests.

### 103. Reverse Itinerary from a Flight

**Category**: Travel Planning
**Effort**: Medium
**Impact**: Medium

**Description**: Enter a flight number and have the surrounding day built for you.

**Current State**: `aviationstack.service.ts` and `airport.service.ts` already resolve
flight numbers to routes and times.

**Features**:
- Auto-create the transportation leg from a flight number + date
- Block travel-day time so it can't be double-booked
- Suggest lodging near the arrival airport
- Prompt for ground transport on both ends

### 104. Activity Proposals & Voting

**Category**: Collaboration
**Effort**: Medium
**Impact**: Medium

**Description**: Collaborators suggest activities that need approval before entering the
itinerary.

**Current State**: `TripCollaborator` exists with view/edit/admin, but any editor writes
straight into the trip. Group planning has no conflict-free path.

**Features**:
- Proposed state for activities, separate from the committed itinerary
- Thumbs-up / thumbs-down per collaborator with a threshold to promote
- Push notification on new proposals (infrastructure already shipped)
- Distinct from Comments (#50), which discusses rather than decides

### 105. Public Trip Guestbook

**Category**: Social & Sharing
**Effort**: Low
**Impact**: Low

**Description**: Let visitors to a shared trip leave a short note.

**Current State**: `share.routes.ts` is strictly read-only by design.

**Features**:
- Moderated notes on the public trip page
- Owner approves before anything is visible
- Rate limited, no accounts required
- Cheap and high-delight; scope carefully to avoid becoming Comments (#50)

### 106. Spending Pace & Cost-per-Day Benchmarks

**Category**: Analytics
**Effort**: Low
**Impact**: Medium

**Description**: Track burn rate against budget during a trip, and compare cost-per-day
across trips afterwards.

**Distinct from #57** (Travel Pace Analysis), which measures days per destination rather
than money.

**Features**:
- "60% through the trip, 80% through budget" indicator on the dashboard
- Cross-trip cost-per-day comparison ("Japan $180/day vs Portugal $95/day")
- Breakdown by category over time

**Dependencies**: needs #96 to be trustworthy on mixed-currency trips.

### 107. Semantic Archive Search

**Category**: Search
**Effort**: High
**Impact**: Medium

**Description**: Search the archive by meaning rather than keyword.

**Current State**: `search.service.ts` is keyword-based across five entity types.

**Features**:
- Embed journal entries, photo captions, notes, and saved-link descriptions
- pgvector alongside the existing PostGIS extension
- Answers "that seafood place with the blue door" across a decade of travel
- Hybrid with the existing keyword search rather than replacing it

### 108. Post-Trip Retrospective

**Category**: Travel Planning
**Effort**: Low
**Impact**: Medium

**Description**: Prompt for what worked and what didn't after a trip completes, then
resurface those lessons while planning the next one.

**Features**:
- Prompts on transition to `Completed` (what to repeat, what to skip, what to pack differently)
- Answers stored as a structured trip retrospective
- Relevant lessons surfaced during planning ("last time you underpacked layers")
- Feeds packing suggestions, which already exist

### 109. Loyalty Programs & Membership Numbers

**Category**: Travel Documents
**Effort**: Low
**Impact**: Medium

**Description**: Store frequent-flyer and hotel-loyalty numbers, and auto-fill them into
bookings.

**Current State**: no model for this; numbers currently live in notes fields if anywhere.

**Features**:
- Per-programme membership numbers and status tiers
- Auto-fill into transportation and lodging records by carrier match
- Optional manual points balance
- Sits naturally beside `TravelDocument`

### 110. Travel Day Document Vault

**Category**: Mobile & PWA
**Effort**: Medium
**Impact**: High

**Description**: One offline-cached screen with everything needed at a check-in desk.

**Current State**: `TravelDocument` stores the documents; there is no consolidated
day-of view, and offline caching is per-query.

**Features**:
- Passport, boarding passes, confirmations, and insurance on one screen
- Explicitly cached for offline, since airports are where connectivity fails
- Ordered by what's needed next
- Builds on the PWA work (#64) already shipped

### 111. Emergency Card

**Category**: Travel Documents
**Effort**: Low
**Impact**: Medium

**Description**: A printable, offline card of the things you need when something goes
wrong.

**Features**:
- Local emergency numbers and nearest embassy for the destination
- Insurance policy number and assistance line
- Companion medical notes and allergies (dietary tags already model adjacent data)
- Printable and offline-cached; useful precisely when the phone is dead or stolen

**Status**: ✅ Completed 2026-07-26 — `TripEmergencyInfo` (per-trip insurance provider, policy
number, assistance line, embassy contact) plus `TravelCompanion.medicalNotes`/`.allergies`
alongside the existing `dietaryPreferences`. The destination country is **`Trip.countryCode`**,
not a field on the emergency record: the country is a fact about the trip, and #113 reads the
same column, so a correction made on either card holds for both. **Embassy details are user-entered, not bundled**:
"nearest embassy" is a per-(passport, destination) pair and far too large to ship offline.
Emergency numbers come from the shared `constants/countryFacts.ts` snapshot, and country
resolution runs **client-side** (`utils/emergencyCountry.ts`) precisely so the offline card's
core logic never sits behind the network. Cached in IndexedDB via a new `emergencyCards` store,
and printing uses the existing `print-*-wrapper` portal convention from `Timeline.tsx` —
allergies are underlined bold rather than red so they survive a monochrome printer. Companion
medical fields are **owner-only**, nulled for collaborators with an explicit "owner only" flag
so the card never implies nothing was recorded. Missing numbers are dropped, never rendered as
"none". Migration `20260729000000_add_emergency_card` is **created but not applied**. 35 tests.

### 112. Transit & Rideshare Deep Links

**Category**: Location & Maps
**Effort**: Very Low
**Impact**: Medium

**Description**: One tap from any timeline event to directions in the user's preferred
maps app.

**Features**:
- Deep links to Apple/Google Maps, Citymapper, Uber/Lyft
- Origin and destination pre-filled from the surrounding itinerary items
- Per-user preferred app in Settings

**Why it's worth doing**: trivial to build, and used constantly on the ground.

**Status**: ✅ Completed 2026-07-25 — `lib/mapsDeepLinks.ts` (pure builders for Apple, Google,
Citymapper, Uber, Lyft; platform is an explicit argument, never read from `window`) plus
`lib/itineraryPlaces.ts` entity adapters and a reusable `DirectionsButton`. Wired into Timeline
and Daily View, both of which have a chronological ordering, so **origin is inferred from the
nearest preceding item with a real place** — a restaurant routes from the hotel rather than from
nowhere. Transportation's destination is its *departure* point (you need to reach the airport)
while its *end* place feeds the next item's origin. Activities with no coords and no address
produce no button rather than a garbage maps search. Preferred app per user in Settings. 79 tests.

### 113. Local Norms Card

**Category**: Advanced Features
**Effort**: Low
**Impact**: Medium

**Description**: Per-country practical conventions, shown on the trip.

**Features**:
- Tipping norms, plug type and voltage, tap-water safety, driving side
- Rough emergency numbers (overlaps #111 — share the dataset)
- Static bundled dataset; no API dependency, works offline
- Pairs with the existing `VisaRequirement` and `TripLanguage` features

**Status**: ✅ Completed 2026-07-26 — frontend-only by design, reading the shared
`constants/countryFacts.ts` snapshot (123 countries), so it works with the radio off and
costs no migration. **No country column exists anywhere in the schema** — `Trip` has none and
`Location` carries only free-text `address` — so `useTripCountries` resolves candidates from
every location address and tallies them. A trip spanning several countries is first-class: it
renders a chip row with per-country location counts rather than silently picking one. Zero
resolved countries offers a 123-country picker instead of an empty card. **Correcting** the
country writes the shared `Trip.countryCode` (so the emergency card agrees), while **viewing**
another of a multi-country trip's countries is deliberately local and instant — persisting a
view would move the emergency card's numbers to the wrong country and would need a network
round-trip for what must stay an offline interaction. Both dataset caveats are honoured in the UI:
a missing emergency number renders as *absent*, never as "no such service", and Japan's 50/60Hz
and Brazil's 127/220V mixed grids get explicit per-country notes. 11 tests.

### 114. Conversational Trip Planner

**Category**: AI/ML
**Effort**: High
**Impact**: Medium

**Description**: A chat interface with the trip as context.

**Current State**: AI is limited to link suggestions and journal summaries
(`ai.routes.ts`). #91 covers auto-tagging and summarisation, not conversation.

**Features**:
- Trip-scoped chat ("find a rainy-day alternative for Tuesday afternoon near the hotel")
- Returns **proposed** entities through the existing `PendingEntity` review queue, so
  nothing is written without approval
- Reuses `llm.service.ts` and the per-user key handling already in place

**Risk**: the removed email import (#69) is the cautionary tale — LLM output that writes
directly to the itinerary was what failed. Keep the review queue in front of it.

---

## 💡 Ideas Review — 2026-11-07

Ideas from a brainstorm with the owner. Dropped as already shipped: On This Day, iCal feed, jet lag calculator. Items are worked in order, starting with #115.

### 115. Scheduled Automatic Backups

**Category**: Data Safety
**Effort**: Low
**Impact**: High

**Description**: Backups are currently manual JSON downloads (`backup.service.ts`). Add a scheduled job that writes the same backup to a configurable directory or S3-compatible target with retention.

**Features**:
- Cron-style schedule per user/instance (default nightly)
- Retention policy (keep N daily / M weekly)
- Local-path and S3 targets; last-run status and failure surfacing in Settings
- Reuses `backup.service.ts`; restore path unchanged

**Status**: ✅ Core shipped (local-directory target, retention, cron). Not yet done: S3 target and last-run status in Settings UI

### 116. Booking Deadline Tracker

**Category**: Planning & Validation
**Effort**: Medium
**Impact**: High

**Description**: Track free-cancellation cutoffs, online check-in windows, and payment due dates.

**Features**:
- Optional deadline fields on lodging/transportation/activities
- Dashboard widget + push notification (push infra exists) ahead of each deadline
- Health Check rule for missed or imminent deadlines

**Status**: ✅ Shipped. New `BookingDeadline` table (migration `20260810000000_add_booking_deadlines`, exactly one of lodging/transportation/activity enforced by a CHECK), CRUD + `/api/deadlines/upcoming`, hourly push reminders for deadlines due within 24h (persisted `notifiedAt`), Health Check rule (overdue or due within 3 days), backup/restore support, Deadlines tab on the trip page, and a dashboard widget. Not done: per-form deadline editing inside the lodging/transportation/activity forms

### 117. Today Mode Enhancements

**Category**: Mobile & PWA
**Effort**: Medium
**Impact**: High

**Description**: The trip dashboard already has a today view; make it a true on-trip mode.

**Features**:
- Next-up card with countdown, address, confirmation number, one-tap route
- Local vs home time side by side
- Fully usable offline (builds on PWA + offline maps)

**Status**: Not started

### 118. Passport & Visa Validity Check

**Category**: Travel Documents
**Effort**: Low
**Impact**: Medium

**Description**: Flag trips that break the 6-month passport rule or lack required visas.

**Features**:
- Passport expiry and name stored on the user/document record
- Health Check rule comparing expiry to trip end date
- Cross-check against existing `VisaRequirement` data; pairs with #110

**Status**: Mostly already built: `tripValidator.service.ts` has `checkPassportValidity` (missing passport, no expiry, expires during trip, 6-month rule) and `checkVisaRequirements`. Remaining gap not yet verified: name mismatch across bookings

### 119. Weather-Aware Packing List

**Category**: Planning
**Effort**: Low
**Impact**: Medium

**Description**: Generate a draft checklist from forecast, trip length, and activity types.

**Features**:
- Uses existing weather integration and checklist models
- Suggestions are proposals the user accepts; never auto-written

**Status**: Not started

### 120. Day Auto-Draft Journal

**Category**: AI & ML
**Effort**: Medium
**Impact**: Medium

**Description**: Turn a day's photos, locations, and activities into a first-draft journal entry.

**Features**:
- Reuses `llm.service.ts` and the per-user key handling
- Result lands as an editable draft only; no direct writes to published entries

**Status**: Not started

### 121. Food Log

**Category**: Memories
**Effort**: Low
**Impact**: Medium

**Description**: Dishes, ratings, and order-again notes per restaurant.

**Features**:
- Attach to restaurant-type activities/locations
- Searchable best-meals view; feeds #107 semantic search later
- Photos on an entry (up to 12): uploaded as ordinary trip photos and attached through a
  `food_log_entry_photos` join (migration `20261112000000_add_food_log_entry_photos`).
  `POST /api/trips/:tripId/food-log/:id/photos` (`{ photoIds }`, photos must belong to the
  same trip, duplicates ignored) and `DELETE .../photos/:photoId`. Detaching, or deleting
  the entry, never deletes the photo; deleting the photo drops only the link. Entries are
  returned with `photos: Photo[]` in display order; backup/restore carry the links through
  the photo id map (only when photos are imported). Immich-backed photos are not rendered
  in the food log UI (they need an authenticated fetch)

**Status**: ✅ Shipped (not yet run against a live database). New `FoodLogEntry` table (migration `20260811000000_add_food_log`, rating 1-5 enforced by a CHECK, optional activity/location links with ON DELETE SET NULL, cascade with the trip), trip CRUD at `/api/trips/:tripId/food-log`, cross-trip best-meals search at `/api/food-log` (minRating, orderAgain, q), backup/restore support (links remapped on restore), a Food Log tab on the trip page and a Best Meals page at `/food-log`. Not done: restricting the link picker to dining-category activities, and the semantic-search hookup (#107).

### 122. Receipt Scan to Expense

**Category**: Budget
**Effort**: Medium
**Impact**: Medium

**Description**: Snap a receipt; OCR creates the expense with amount, currency, and date.

**Features**:
- Feeds `TripExpense` and multi-currency (#96)
- Result opens in a confirm form before saving

**Status**: Not started

### 123. Parking & Rental Car Log

**Category**: On-Trip Utilities
**Effort**: Low
**Impact**: Low

**Description**: Where-I-parked pin with photo and meter expiry reminder, plus rental pickup/return details.

**Features**:
- Quick action from Today mode
- Reminder via existing push notifications

**Status**: Not started

### 124. Data Quality Dashboard

**Category**: Insight
**Effort**: Medium
**Impact**: Medium

**Description**: List photos missing dates or locations, activities without costs, and trips without journal entries, each with a quick fix.

**Features**:
- Complements Trip Health Check, but spans the whole archive

**Status**: Not started

### 125. Personal Records & Trends

**Category**: Insight
**Effort**: Low
**Impact**: Low

**Description**: Longest trip, most-visited country, spend per day over years, usual travel season.

**Features**:
- Extends Year in Review and PlacesVisited stats

**Status**: Not started

### 126. Share Links with PIN & Expiry

**Category**: Export & Sharing
**Effort**: Low
**Impact**: Medium

**Description**: Finer control over the public trip page (#87).

**Features**:
- Optional PIN and expiry date per share link
- Revoke individual links

**Status**: Not started

---

## Quick Reference

### By Implementation Effort

**Very Low (< 4 hours)**:
- Smart Lodging Duration (#7) ✅
- Default Timezone (#21)
- Recently Viewed Trips (#22)
- Trip Archive (#25)
- Night Mode Schedule (#30)
- Transit & Rideshare Deep Links (#112)

**Low (4-8 hours)**:
- Trip Cloning (#1) ✅
- Batch Operations (#4)
- Activity Templates (#5)
- Auto-Save Drafts (#6) ✅
- Favorite Places (#12)
- Custom Trip Types (#15) ✅
- Keyboard Shortcuts (#23) ✅
- Markdown Support (#24) ✅
- Compact View Mode (#28) ✅
- Trip Cover Images (#31)
- Activity Icons (#32)
- Location Reviews (#41)
- Travel Pace Analysis (#57)
- Export JSON (#83) ✅
- Print Styles (#88)
- Travel Milestones (#81)
- Trip Dependencies (#80)
- Photo Favorites & Highlight Reel (#100)
- Public Trip Guestbook (#105)
- Spending Pace & Cost-per-Day (#106)
- Post-Trip Retrospective (#108)
- Loyalty Programs (#109)
- Emergency Card (#111)
- Local Norms Card (#113)

**Medium (1-2 weeks)**:
- Trip Health Check (#2)
- Travel Time Alerts (#3)
- Multi-Trip Views (#11)
- Recurring Trips (#14)
- Heatmap (#20)
- Best Times to Visit (#26)
- Bulk Import (#27)
- Custom Dashboard Widgets (#29)
- Photo Stories (#35)
- Photo Comparison (#36)
- POI Suggestions (#40)
- Offline Maps (#43)
- Location History Import (#44)
- Map Improvements (#45)
- Trip Collaboration UI (#46)
- Public Trip Gallery (#47)
- Trip Templates (#48)
- Comments & Reactions (#50)
- Timeline Sharing Widget (#52)
- Year in Review (#55)
- Carbon Footprint (#56)
- API Access (#59)
- Webhooks (#60)
- Custom CSS (#61)
- Mobile-Optimized UI (#65) ✅
- Quick Capture (#66) ✅
- Push Notifications (#67)
- Expand Immich (#70)
- Flight Tracking (#71)
- Weather Integration (#72)
- Mapping Services (#73)
- Contextual Help (#76)
- Shareable Trip Page (#87)
- Auto-Detect Duplicates (#92)
- Travel Companions Network (#93)
- Multi-Currency with Exchange Rates (#96)
- Expense Splitting & Settle-Up (#97)
- Trip Wishlist / Bucket List (#98)
- People in Photos (#99)
- Infer Photo Location from Itinerary (#101)
- Opening Hours & Closure Warnings (#102)
- Reverse Itinerary from a Flight (#103)
- Activity Proposals & Voting (#104)
- Travel Day Document Vault (#110)

**High (2+ weeks)**:
- Timeline Export PDF (#8)
- Pre-Trip Checklist (#9)
- Drag & Drop Timeline (#10) ✅
- Multi-City Planner (#13)
- Smart Suggestions (#16)
- Expense Predictions (#17)
- Local Tips Exchange (#19)
- Advanced Photo Org (#33)
- Video Support (#34)
- Collage Generator (#38)
- Smart Photo Features (#39)
- Route Optimization (#44)
- Social Feed (#49)
- Travel Meetups (#51)
- Live Trip Updates (#52)
- Travel Network Graph (#58)
- Version History (#62)
- PWA (#64)
- Calendar Sync (#68)
- Booking Integrations (#69)
- Google Photos (#74)
- Onboarding Flow (#75)
- Multi-Language (#77)
- Accessibility (#78)
- Alternative Timelines (#79)
- Photo Challenges (#82)
- PDF Itinerary (#85)
- Photo Book (#86)
- Trip Recommendations (#89)
- Destination Recommendations (#90)
- AI Features (#91)
- Trip Questions (#94)
- Semantic Archive Search (#107)
- Conversational Trip Planner (#114)

### By Category

**Planning & Validation**: 1, 2, 3, 9, 13, 14, 44
**Productivity**: 4, 5, 6, 23, 24
**UX/UI**: 7, 10, 21, 22, 25, 28, 29, 30, 31, 32, 65, 66, 75, 76
**Analytics**: 20, 54, 55, 56, 57, 58
**Social/Community**: 18, 19, 46, 47, 48, 49, 50, 51, 93, 94
**Photo/Media**: 33, 34, 35, 36, 37, 38, 39
**Location/Map**: 12, 40, 41, 42, 43, 45
**Export/Sharing**: 8, 52, 83, 84, 85, 86, 87, 88
**Integration**: 68, 69, 70, 71, 72, 73, 74
**Technical**: 59, 60, 61, 62, 63
**Mobile**: 64, 65, 66, 67
**AI/ML**: 16, 17, 89, 90, 91, 92
**Gamification**: 81, 82
**Organization**: 11, 15, 80

---

## Notes

- Features marked with ✅ have been completed
- This document is a living backlog - priorities may shift based on user feedback
- See [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) for current project status
- Features should be evaluated based on:
  - User demand
  - Implementation effort
  - Alignment with app vision
  - Technical dependencies
- Update this document as features are implemented or priorities change

---

## Update Log

- **2026-11-07**: Added #115–#126 (backups, deadline tracker, Today mode, passport check, packing list, journal auto-draft, food log, receipt scan, parking log, data quality, records, share PINs)
- **2026-07-25 (evening)**: Shipped #96 (multi-currency with FX rates), #102 (opening hours & closure warnings), and #112 (transit & rideshare deep links). Built in parallel in isolated worktrees. Backend +144 tests, frontend +81, zero new failures against the v5.6.0 baseline of 30 pre-existing ones. Note for future verification: `npx tsc --noEmit` in `frontend/` is a **no-op** — the root `tsconfig.json` has `"files": []` with only project references, so it silently checks nothing. Use `npx tsc -b` (which is what `npm run build:strict` already does); the shortcut hid a real type error in this batch
- **2026-07-25**: Added #96–#114 from a fresh pass over the schema and services. Ideas that duplicated existing entries were folded into those rather than listed twice — ratings widened in #41, GPX import added to #43, booking-email import updated in #69 (the IMAP transport now exists after the saved-link email ingest work, so it is far cheaper than the 2026-04 attempt). Also added #95 (Technical Debt: `transformTripToBackupFormat` type assertions). Highest-value new items: #96 multi-currency, which fixes a real correctness bug where mixed-currency budget totals are simply summed without conversion; #102 opening hours, which catches the most common itinerary failure; and #97 expense splitting
- **2026-07-19 (evening)**: Feature batch shipped — Budget & expense tracking (`TripExpense` + Budget tab + dashboard widget), Public trip sharing (#87), On This Day memories (#37, app-internal) + Year in Review (#55), iCal feed (one-way subscription form of Calendar Sync #68), Push notifications (#67, completing PWA #64), Trip Archive (#25), Favorite Places (#12, location starring), Default Timezone (#21), plus Immich regression tests
- **2026-07-19**: Code audit — marked as completed: Trip Cover Images (#31, via `bannerPhotoId`), Offline Maps (#42), Trip Collaboration UI (#46), PWA (#64, all but push notifications), Flight Tracking (#71), Weather Integration (#72). Also now in the app but never tracked here: trip dashboard ("today" view with widgets), Day By Day view, Kanban trips view, souvenir tracking, jet lag calculator, OIDC/SSO, AI link suggestions and journal summaries, airport search. See IMPLEMENTATION_STATUS.md
- **2026-05-15**: Marked Custom Trip Types (#15) and Markdown Support (#24) as completed; rewrote Booking Integrations (#69) to reflect PDF + AI import (email parsing was removed)
- **2026-01-16**: Consolidated from FEATURE_IDEAS.md and FEATURE_IDEAS_EXTENDED.md, organized by priority
- **Previous**: Multiple separate feature idea documents maintained
