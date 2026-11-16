# Travel Life User Guide

Welcome to Travel Life, your comprehensive travel documentation application. This guide will help you get the most out of the application.

## Table of Contents

1. [Getting Started](#getting-started)
2. [Managing Trips](#managing-trips)
3. [Locations](#locations)
4. [Photos & Albums](#photos--albums)
5. [Transportation](#transportation)
6. [Lodging](#lodging)
7. [Activities](#activities)
8. [Journal Entries](#journal-entries)
9. [Timeline View](#timeline-view)
10. [Entity Linking](#entity-linking)
11. [Tags & Companions](#tags--companions)
12. [PDF Import](#pdf-import)
13. [Today and the Library](#today-and-the-library)
14. [Trip Layout and Itinerary Views](#trip-layout-and-itinerary-views)
15. [Food Log](#food-log)
16. [Deadlines](#deadlines)
17. [Emergency Info](#emergency-info)
18. [Inbox: Saved Links and Email Ingest](#inbox-saved-links-and-email-ingest)
19. [Trip Series](#trip-series)
20. [Year in Review](#year-in-review)
21. [Search](#search)
22. [Settings](#settings)
23. [Calendar Feed](#calendar-feed)
24. [Push Notifications](#push-notifications)
25. [Mobile Companion App](#mobile-companion-app)
26. [Offline Use and Installing the App](#offline-use-and-installing-the-app)
27. [Backups](#backups)
28. [Keyboard Shortcuts](#keyboard-shortcuts)

---

## Getting Started

### Creating Your Account

1. Navigate to the application URL
2. Click **Register**
3. Enter your username, email, and password
4. Click **Create Account**

### First Login

After logging in, you land on **Today**, which shows what is happening now and next
across your trips. If you're new, it will be mostly empty until you create a trip.

### Single Sign-On

If your administrator has enabled single sign-on, the login page shows an extra button
(its text is set by the administrator) that signs you in through your identity provider.
Depending on how the server is configured, the password form may be hidden, and
registration may be closed, in which case the login page says so and accounts are
created by invitation (see **Settings > Invites**). If sign-in fails you will see a
message such as "Single sign-on was cancelled" or "No account exists for this sign-in.
Contact your administrator."


### Setting Up Your Profile

1. Open **Settings**
2. On the **Account** tab, configure:
   - **Name** and **Change Password**
   - **Timezone**: Your home timezone for dual-timezone display
   - **Home Currency**
   - **Dietary Preferences**
   - **Appearance**: Light or Dark mode
3. Connect services such as Immich and weather on the **Integrations** tab

---

## Managing Trips

### Creating a Trip

1. From the **Trips** page, click **+ New Trip**
2. Enter trip details:
   - **Title**: Give your trip a name
   - **Dates**: Start and end dates (optional for dream trips)
   - **Status**: Dream, Planning, Planned, etc.
   - **Description**: Trip overview
3. Click **Create**

### Trip Statuses

| Status | Description |
|--------|-------------|
| **Dream** | Wishlist trip you'd like to take someday |
| **Planning** | Actively researching and planning |
| **Planned** | All details finalized, ready to go |
| **In Progress** | Currently on the trip |
| **Completed** | Trip finished |
| **Cancelled** | Trip cancelled |

### Cloning a Trip

Want to reuse a trip's structure?

1. Open the trip
2. Click the **⋮** menu
3. Select **Duplicate Trip**
4. A copy is created with all locations, activities, etc.

---

## Locations

### Adding Locations

1. Open a trip
2. Go to the **Locations** tab
3. Click **+ Add Location**
4. Enter:
   - **Name**: Location name
   - **Address**: Will auto-geocode to coordinates
   - **Category**: Restaurant, Hotel, Attraction, etc.
   - **Visit Time**: When you plan to visit
   - **Duration**: How long you'll spend there

### Using the Map

- Click on the map to add a new location
- Drag markers to reposition
- Click a marker to see location details

### Location Categories

Create custom categories in **Settings > Tags & Categories**:
- Add categories with custom icons and colors
- Categories help organize and filter locations

---

## Photos & Albums

### Uploading Photos

1. Go to the **Photos** tab
2. Click **Upload** or drag files
3. Photos are automatically:
   - Geotagged (if EXIF data present)
   - Timestamped
   - Thumbnailed

### Batch Upload

Upload multiple photos at once:
1. Select multiple files
2. Photos upload in parallel
3. Progress shown for each file

### Creating Albums

1. Go to the **Albums** tab
2. Click **+ New Album**
3. Give it a name and description
4. Add photos to the album

### Immich Integration

If you use Immich for photo management:

1. Go to **Settings > Integrations** and find the Immich section
2. Enter your Immich server URL and API key
3. In a trip's Photos tab, click **Import from Immich**
4. Select photos to import

---

## Transportation

### Adding Transportation

1. Go to the **Transportation** tab
2. Click **+ Add Transportation**
3. Select type:
   - Flight, Train, Bus, Ferry, Car, Rideshare, Walk, Bike

### Flight-Specific Features

For flights:
- Enter flight number for tracking
- Gate and terminal information
- Baggage claim details
- Real-time status updates (if API configured)

### Connected Segments

For trips with connections (e.g., multi-leg flights):
1. Create the first segment
2. Create additional segments
3. Link them using **Connection Group**

### Distance Calculation

For car, bike, and walking:
- Distances are calculated automatically
- Uses OpenRouteService for road distances
- Falls back to straight-line if not configured

---

## Lodging

### Adding Accommodations

1. Go to the **Lodging** tab
2. Click **+ Add Lodging**
3. Enter:
   - **Type**: Hotel, Airbnb, Hostel, Camping, etc.
   - **Name**: Property name
   - **Check-in/out dates**
   - **Confirmation number**
   - **Cost**

### Multi-Day Display

Lodging automatically appears on the timeline for each day from check-in to check-out.

---

## Activities

### Adding Activities

1. Go to the **Activities** tab
2. Click **+ Add Activity**
3. Enter:
   - **Name**: Activity name
   - **Category**: Sightseeing, Dining, Adventure, etc.
   - **Time**: Start and end time
   - **Cost**: If applicable
   - **Booking details**

### Activity Categories

Default categories include:
- Sightseeing, Dining, Adventure, Entertainment
- Shopping, Recreation, Cultural, Sports
- Wellness, Tour, Other

Customize categories in **Settings > Tags & Categories**.

### Sub-Activities

Create hierarchical activities:
1. Create a parent activity
2. Create child activities linked to the parent
3. Useful for multi-part experiences

---

## Journal Entries

### Trip-Level Journals

For overall trip reflections:
1. Go to **Journal** tab
2. Click **+ New Entry**
3. Select **Trip Journal**
4. Write your entry

### Daily Journals

For day-by-day documentation:
1. Click **+ New Entry**
2. Select **Daily Journal**
3. Choose the date
4. Add:
   - Content (rich text supported)
   - Mood
   - Weather notes

### Rich Text Editor

The journal supports:
- **Bold**, *italic*, ~~strikethrough~~
- Headings and lists
- Links and images
- Quote blocks

---

## Timeline View

### Viewing the Timeline

1. Open a trip
2. Click the **Timeline** tab
3. See all events chronologically

### Dual Timezone Display

Events show times in:
- **Trip timezone**: Local time at the destination
- **Home timezone**: Your configured timezone

This helps when planning across time zones.

### Filtering the Timeline

Filter by event type:
- Transportation
- Lodging
- Activities
- Locations

### Compact View

Toggle compact view for a denser timeline display.

### Printable Itinerary

1. Click **Print Itinerary**
2. A print-friendly version opens
3. Print or save as PDF

---

## Entity Linking

### What is Entity Linking?

Connect any item to any other item:
- Link photos to locations where they were taken
- Link activities to their locations
- Link journal entries to what they describe

### Creating Links

1. Open any item (photo, activity, etc.)
2. Click the **Link** icon
3. Select what to link to
4. Choose relationship type

### Relationship Types

| Type | Use For |
|------|---------|
| Related | General connection |
| Taken At | Photo at location |
| Occurred At | Activity at location |
| Part Of | Sub-items |
| Documents | Journal about something |
| Featured In | Photo in album |

---

## Tags & Companions

### Using Tags

Organize trips with tags:
1. Go to **Settings > Tags & Categories**
2. Create tags (e.g., "Beach", "City", "Road Trip")
3. Assign tags to trips from the trip settings

### Travel Companions

Track who you travel with:
1. Open **Library > Companions**
2. Add companions (family, friends, etc.)
3. Assign companions to trips (a trip's **Companions** tab lists who is on it)

---

## PDF Import

Travel Life can extract trip details directly from PDF documents such as airline
booking confirmations, hotel reservations, and itineraries, so you don't have to
type everything in by hand.

### Importing a PDF

1. Open a trip and click **Import PDF** in the trip header (on a phone, it is in the
   trip's **⋮** menu)
2. Select or drag in a PDF document (e.g. a booking confirmation or itinerary)
3. The application uploads the PDF and uses AI to extract structured data such
   as flights, lodging, activities, and dates

### Reviewing Extracted Data

Before anything is saved, you review what the AI found:

1. The extracted items are shown grouped by type (transportation, lodging,
   activities, etc.)
2. Check each item for accuracy and edit any fields that need correcting
3. Deselect any items you don't want to import
4. Choose the trip to import into (or create a new trip)
5. Click **Import** to add the reviewed items to your trip

Extracted bookings that you have not accepted or rejected yet wait in the **Inbox**
(see [Inbox](#inbox-saved-links-and-email-ingest)), where the Inbox badge counts them.

> PDF Import relies on the AI/LLM service being configured. If AI features are
> disabled or no LLM API key is set, PDF Import will be unavailable. See the
> **AI / LLM** entry under [External Services](#external-services).

---

## Today and the Library

### Today

**Today** (the first item in the navigation) is the landing page. It shows an agenda,
upcoming trips, booking deadlines that are due soon, an "on this day" memory and a Year in
Review card, with a map beside the agenda on large screens. On a phone the map sits above
the agenda and can be made larger or smaller with the **Larger map** / **Smaller map**
button. Pending trip invitations also appear here.

### Navigation

The app has four main destinations: **Today**, **Trips**, **Library** and **Inbox**. On a
phone the bottom bar shows Today, Trips, **Log**, Library and Inbox. **Log** opens a quick
capture sheet for adding photos, a location, a journal entry, lodging or transport.

### Library

**Library** collects everything that spans trips: albums, Places Visited, the Food Log
("Best Meals"), checklists, travel stats, the trip calendar, Year in Review, trip series
and companions. On desktop it is a dropdown; on a phone it opens a hub page.

---

## Trip Layout and Itinerary Views

A trip's tabs are grouped:

| Group | Tabs |
|-------|------|
| Overview | Overview |
| Itinerary | Day Plan, Timeline, Day By Day, Trip Map |
| Photos | Photos, Photo Map, Photo Timeline |
| Plans | Places, Activities, Unscheduled, Transport, Lodging, Links, Custom |
| Journal | Journal, Food Log |
| Essentials | Budget, Deadlines, Companions, Emergency, Local Norms |

**Day Plan** pairs a day list with a map: on a large screen the list sits beside a sticky
map, and on a phone you switch between **List** and **Map**. Use **Day By Day** for a
full page per day and **Timeline** for the chronological view described above.

---

## Food Log

Record dishes you ate and rate them.

1. Open a trip and go to **Journal > Food Log**
2. Add an entry: **Restaurant**, **Dish**, **Rating**, an **Order again** checkbox,
   optional **Notes** and photos
3. Optionally link the entry to one of the trip's activities or locations

To browse every rated dish across all trips, open **Library > Food Log** ("Best Meals").
You can search by dish, restaurant or note, set a **Minimum rating**, or show only dishes
marked order again.

---

## Deadlines

Track dates you must not miss, such as the end of free cancellation.

1. Open a trip and go to **Essentials > Deadlines**
2. Click **Add Deadline**
3. Choose the **Type**: Free cancellation ends, Online check-in opens, Payment due, or
   Other deadline
4. Set the due date and time, an optional **Title** and **Note**, and optionally attach it
   to a lodging, transportation or activity booking (a deadline can also stand alone)

Deadlines that are due soon, including overdue ones, appear on **Today**.

---

## Emergency Info

The **Emergency** tab (under Essentials) is a printable card for when something goes wrong.

- **Local emergency numbers** for the destination country. The country is worked out from
  the trip's places and can be changed. Numbers are only listed when known
- **Travel insurance**: provider, policy number and 24-hour assistance phone
- **Embassy or consulate**: name, phone and address
- **Notes**, and per-companion **allergies** and **medical** details

Click **Print** for a paper version. The insurance, embassy and companion details are
saved on your device after you view them, so the card still opens with no signal, and it
tells you how old the saved copy is.

---

## Inbox: Saved Links and Email Ingest

The **Inbox** holds things that are not on a trip yet:

- **Saved links.** Paste a URL (and optional notes) into the add-link form. Travel Life
  fetches a preview. Assign a link to a trip when you are ready, or delete it. There is
  also an action to delete all unassigned links
- **Imported bookings** parsed from PDFs that still need review (see
  [PDF Import](#pdf-import))

The Inbox badge counts links waiting to be filed plus bookings waiting for review.

### Saving links by email

If the administrator has set up the mailbox, you can forward a link to it and it appears in
the Inbox. In **Settings > Integrations**, the **Link Ingest** section shows the address
to forward to and a **Trusted senders** list. Mail is accepted only from trusted senders;
your account email is always trusted. If the section says email ingest is not configured,
the server has no mailbox set up.

---

## Trip Series

A trip series groups related trips into one longer journey.

1. Open **Library > Trip Series** and create a series, or pick or create one from the
   **Trip Series** field when you edit a trip
2. On a series page, add trips that are not already in a series, move them up or down to
   set their order, or remove them
3. Trips in a series show a badge that links to the series page, and the trip page
   includes navigation within the series

---

## Year in Review

**Library > Year in Review** summarises a calendar year of travel: headline totals, a
**Travel by Month** bar, **Highlights** photos, a **Where You Went** map and the year's
trips. Pick the year from the selector, and tick **Include trips still being planned** to
count trips that are not yet completed.

---

## Search

### Global Search

Press **Ctrl+K** (or **Cmd+K** on Mac) to open global search.

Search across:
- Trip names
- Locations
- Activities
- Journal entries

### Dashboard Filters

Filter trips by:
- Status
- Tags
- Date range

---

## Settings

Settings has six tabs: **Account**, **Tags & Categories**, **Documents** (travel
documents), **Integrations**, **Invites** and **Backup**.

### Account

Name, password, timezone, home currency, dietary preferences and appearance (light or
dark).

### Tags & Categories

Tags, custom location categories (with icons and colors) and activity categories.

### Integrations

Configure the following (several are typically set up by the administrator):

- **Email (SMTP)**
- **Maps app** preference
- **Link Ingest**, **Calendar Feed**, **Mobile App** and **Push Notifications**, described
  in their own sections below

External services:

- **Immich**: Self-hosted photo library
- **OpenWeatherMap**: Weather data
- **AviationStack**: Flight tracking
- **OpenRouteService**: Road distances
- **AI / LLM**: Powers PDF Import and AI-assisted suggestions. Configure the LLM
  API key, base URL, and model in the **LLM (AI) Settings** section of the
  Settings page (typically administered via backend environment variables)

### Backup & Restore

See [Backups](#backups).

---

## Calendar Feed

Subscribe to your trips from Google Calendar, Apple Calendar, Outlook or any calendar app.
The feed is a read-only iCal (.ics) URL with your trips, flights and other transportation,
and lodging stays.

1. Go to **Settings > Integrations > Calendar Feed**
2. Click **Enable Calendar Feed**
3. Click **Copy URL**, then add it in your calendar app (for example Google Calendar:
   Settings, Add calendar, From URL)

**Keep the URL private**: anyone who has it can see your trip schedule. **Rotate Feed URL**
makes the old URL stop working immediately, and **Disable Feed** turns it off.

---

## Push Notifications

Get notified on a device about upcoming trips and tracked flight status changes, even when
the app is closed.

1. Go to **Settings > Integrations > Push Notifications**
2. Click **Enable Push Notifications** and allow notifications in your browser when asked
3. Use **Send Test Notification** to check it works

This is per device and browser. If the section says push is not configured, the
administrator has not set the server's VAPID keys; if it says notifications are blocked,
allow them for the site in your browser settings.

---

## Mobile Companion App

Sign in to the Travel Life companion app by scanning a code instead of typing a password.

1. On the web app, go to **Settings > Integrations > Mobile App**
2. Click **Pair Mobile App** to show a QR code
3. Scan it in the companion app. It sets the server address and signs you in

The code works once and expires after a few minutes (a countdown is shown). **Generate New
Code** replaces it and **Hide Code** hides it. Treat the code like a password.

---

## Offline Use and Installing the App

Travel Life is a progressive web app (PWA), so it can be installed to your home screen.

- On iPhone and iPad in Safari, an install prompt explains how to use **Add to Home Screen**
  (it can be dismissed and stays quiet for a week)
- When you lose your connection, a banner tells you that you are offline
- Changes made offline are queued and synced when you reconnect. If the same item changed
  both on your device and on the server, a conflict list lets you keep your version or the
  server's
- Search keeps working offline against data saved on the device, and the
  [Emergency card](#emergency-info) is kept for offline use

---

## Backups

In **Settings > Backup**:

- **Create Backup** downloads your data as a JSON file: trips with full details, photo
  metadata (not the photo files themselves), journal entries and albums, tags, companions
  and custom categories, and your settings. Immich photo references are preserved
- **Restore from Backup** imports a backup file
- **Backup Best Practices** lists recommendations

Because photo files are not in the JSON, back those up separately.

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+K` (`Cmd+K` on Mac) | Open global search |
| `Ctrl+S` (`Cmd+S` on Mac) | Save, while an add or edit form is open |
| `Escape` | Close modal/panel |
| `?` | Show keyboard shortcuts help |

---

## Tips & Tricks

### Planning a Trip

1. Start with status **Dream** or **Planning**
2. Add locations you want to visit
3. Research and add activities
4. Book transportation and lodging
5. Update status to **Planned**

### During the Trip

1. Change status to **In Progress**
2. Upload photos as you go
3. Write daily journal entries
4. Update activities with actual times

### After the Trip

1. Change status to **Completed**
2. Organize photos into albums
3. Write a trip journal
4. Link photos to locations

### Using Places Visited Map

After completing trips, view all your visited locations on a global map:
1. Go to **Library > Places Visited**
2. See pins for all locations from completed trips

---

## Getting Help

- **In-app help**: Click `?` for keyboard shortcuts
- **Documentation**: You're reading it!
- **Issues**: Report bugs on GitHub

---

## Related Documentation

- [docs/README.md](../README.md) - Documentation index
- [Backend Architecture](../architecture/BACKEND_ARCHITECTURE.md) - Technical documentation
