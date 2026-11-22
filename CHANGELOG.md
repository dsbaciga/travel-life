# Changelog

All notable changes to Travel Life are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## How this file is used

- Version headings must be exactly `## [X.Y.Z] - YYYY-MM-DD` (no `v` prefix). The
  release workflow (`.github/workflows/release.yml`) extracts the section matching the
  pushed tag and uses it as the GitHub Release body.
- Add entries under `## [Unreleased]` as you work. `release.ps1` / `release.sh` promote
  that section to the new version heading during a release.
- A missing or empty section is tolerated by CI - the release body falls back to a
  generic note rather than failing the workflow.

## [Unreleased]

### Added

- **Record settle-up payments.** On a trip's Settle Up panel, each suggested payment now has a **Record payment** button. It opens a form already filled in with who pays whom and how much, which you can change (amount, currency, date, a note), and saves it. Recorded payments are taken off what people owe, so the suggested payments shrink as everyone pays each other back, and they are listed under **Payments recorded** where you can edit or delete them. A payment in another currency is converted like an expense; if no exchange rate is available it is listed as not counted rather than guessed at. Recorded payments are included in backups. This adds a new database migration (`20261127000000_add_trip_settlements`) that creates one new table and changes nothing existing.
- **Set a loyalty program from the timeline edit dialog.** Editing a transportation or lodging item from the timeline now has the same Loyalty program field as the booking forms, including the suggestion for a matching carrier or hotel. Choosing None clears it.
- **Link photos to activities automatically.** The Photos tab has a new **Link to activities** button that matches each photo to an activity by the time it was taken: a photo is matched only to an activity it was taken during, or to an all-day activity on the same date (an activity with no end time is assumed to last 2 hours). A photo taken between activities is left unmatched rather than given to the closest one. You review the matches, grouped by activity with thumbnails, and untick anything wrong before linking. Photos already linked to an activity are left alone, and the dialog says how many photos were left out and why.
- **Backfill photo links for existing trips.** A one-off command applies the same matching to every trip at once, with no review step: `docker exec travel-life-backend node dist/scripts/backfillPhotoActivityLinks.js`. Add `--dry-run` to see what it would link without changing anything, or `--trip=<id>` / `--user=<id>` to limit it. It skips photos that already have an activity link, so it is safe to run again.

- **Import lodging and transportation from a CSV file.** **Import CSV** in the trip header now also imports hotel stays and transport legs, next to places and activities. Pick Lodging or Transportation, download the template, map your columns, and check the preview before anything is saved. Times without an offset are read in the row's timezone, else the trip timezone, else your timezone, and a stay or leg that looks like one you already have is unticked by default. Stays need a type, name, check-in and check-out; legs need a type and a From or To place.

### Changed

- **Route Planner shows road distances and driving times.** Each leg between stops now uses the road distance and drive time from the routing service (when an OpenRouteService key is set up), instead of a straight-line guess. Drive legs that cannot be routed, such as when routing is not set up, keep the straight-line estimate and are marked "straight line", so you can tell which is which. Legs of 600 km or more are flights: they show only their distance, by air, with no time estimate and no routing request, and the travel-time total leaves them out ("plus 2 flights") while the distance total keeps them. Route optimisation still compares straight-line distances.
- **PDF reading no longer covers the page.** The "Reading…" notice after uploading a PDF now goes away after a few seconds instead of staying up until the PDF is read. While a PDF is being read, the Inbox tab shows a small spinner, and the Inbox page lists each PDF being read with its place in line and a **Cancel** button. You still get a notice when it is ready.
- **One link control per card.** Places, activities, transport, lodging, journal entries and timeline items showed their links twice: the **Linked items** list and a separate link icon with a count. Once something is linked, only the list remains, with an **Edit links** button in its header that opens the linking dialog. The link icon still appears when nothing is linked yet, so you can add the first link.

### Fixed

- **A failed migration now names itself and the recovery steps; an unused force-sync script was removed.** When `prisma migrate deploy` fails on startup, the backend container prints Prisma's output, names the failed migration, lists the recovery steps, and exits without touching the database, so the app never serves a half-migrated schema (`scripts/migrate-and-start.sh`; the shipped images already stopped on a failed migration, only the message improved). Also removed the unused legacy `backend/docker-entrypoint.sh`, which contained a `prisma db push --accept-data-loss` fallback; no shipped image ran it. See [Migration failed on startup](DEPLOYMENT.md#migration-failed-on-startup) for recovery.
- **Notifications no longer get stuck on phones.** Tapping a notification paused it (the desktop hover-to-pause behaviour), and on a touch screen the pause never ended, so that notification and every later one stayed on screen. Pauses now only happen when hovering with a mouse, and tapping or clicking a notification dismisses it.
- **Trip actions menu on phones.** The ⋮ menu on a trip's page opened off the left edge of the screen when the button sat below the trip title; it now opens toward whichever side has room.
- **A brand-new empty database can now be set up with `npx prisma migrate deploy` alone.** It used to stop at the second migration with `column "timezone" of relation "users" already exists`, and the documented workaround skipped the migrations dated after the baseline, leaving `trips.country_code`, `trip_emergency_info` and `travel_partner_requests` missing. The older migrations are now safe to replay (they do nothing on a database that already has their changes), and the migrations README gives the one-command recipe. Databases that are already deployed need no action. Development databases that use `prisma migrate dev` should run `node scripts/refresh-migration-checksums.js --apply` once from `backend/`, otherwise Prisma offers to reset them; see `backend/prisma/migrations/README.md`.

## [8.2.0] - 2026-11-21

### Changed

- **Album suggestions fold away.** On a trip's Photos tab, Smart Album Suggestions now show as a single collapsed bar with a count. Click it to see the suggestions; until then the photos sit right below it. The "Analyzing photos" line no longer appears above the grid while suggestions load.
- **Mobile app: confirmations and Undo.** Copying a confirmation code, nudging an item's time, moving it to another day, making it all-day, reordering, saving, deleting, adding photos and accepting a PDF booking now show a short message at the bottom of the screen, with a small vibration. Time changes and reorders offer **Undo**.
- **Mobile app: real icons instead of emoji.** The tab bar, the capture button, timeline badges, Quick capture options, checklists and buttons use Material Symbols on Android (SF Symbols on iOS). They take the theme colours and look the same on every phone, where emoji varied by phone maker. The icon font ships inside the app, so icons work offline.
- **Mobile app: matching headers.** The headers on forms, Sync, Settings and other pushed screens use the app's light and dark colours instead of plain black or white.
- **Mobile app: touch ripples.** Cards, buttons, chips and menu rows show the Android touch ripple when tapped.
- **Mobile app: a calmer Today header.** The row of up to seven sync chips is now one pill that shows whatever most needs attention ("2 conflicts", "Offline · 3 to sync"). Tap it for the Sync screen. The budget is a bar of what has been spent, with a tick where spending would be if it kept pace with the trip, plus the amounts in the budget currency.
- **Mobile app: Settings is one tap away.** A gear button sits in the Today and Trip headers. Before, Settings was only reachable from the Vault.
- **Mobile app: faster Quick capture.** Photo, Stop here, Expense and Note are large tiles at the top. Everything else is listed below under More.
- **Mobile app: Save is always in reach.** On add and edit forms, Save is pinned to the bottom of the screen instead of sitting after the last field. Delete moved to a trash button in the header.
- **Mobile app: easier-to-scan timelines.** "Not synced" is a small dot instead of a chip. Directions and the booking code share one line. Cancelled items are struck through.
- **Mobile app: Trip tab tidy-up.** Trip photos opens from a header button instead of sitting among the view switches. Expenses in "By type" show as money in their currency (€4.50). The review queue says "Transport", "Stay" or "Place" instead of "TRANSPORTATION".
- **Mobile app: a roomier map.** The filters sit on one line and the rest of the panel folds away. New buttons jump to where you are and fit every place on screen. On iOS the map now follows the app's own light or dark setting instead of guessing from a colour.
- **Mobile app: a clearer day strip on Today.** Each day shows its weekday and date, with a dot under today. The selected day scrolls to the centre.
- **Mobile app: no more blank screens while loading.** Today, Trip, Map and the add/edit forms show placeholder cards while they read the phone's data. Before, they showed an empty screen, and Trip and Map briefly said "No trip selected".
- **Mobile app: grouped forms.** Activity, place, transport, stay and custom-item forms are split under headings such as When, Booking and Notes.
- **Mobile app: Undo for transit logs.** "Departed now", "Arrived now" and "Mark cancelled" can be undone from the message that confirms them.
- **Mobile app: dark map on Android.** The map follows dark mode on Android too, in the app's navy colours.
- **Mobile app: more polish.**
  - The capture button sits just above the real tab bar on every phone.
  - On iPhone, confirmation messages show above pop-up screens such as Quick capture.
  - Icons draw straight away instead of flashing blank in scrolling lists.
  - Menus show an icon beside each choice.
  - The remove buttons on photos and phrasebook languages use the same icon set.
- **Mobile app: smaller touches.** The pull-to-refresh spinner uses the app colour. Menus have a handle and close with a swipe down. Destructive choices such as "Mark cancelled" are always listed last, just above Cancel.
- **Mobile app: activities and stays have a Location field.** The activity and stay forms let you pick the place, as custom items and meals already did. An activity or stay created at a map pin, or with a nearby place suggested, now stores that place on the item itself instead of as a link, and "+ Link" to a place does the same when the item has no place yet (a second place is still a link). The Today card and the map's Today filter read the item's own place first.

- **Fixed-vocabulary columns are checked by the database, redundant indexes dropped (internal).** Trip status and privacy, collaborator and invitation permission and status, transportation status, photo source and media type, deadline kind, checklist type, opening-hours and distance source and push platform now carry a `CHECK` (added `NOT VALID`, validated only when no existing row violates it), and 22 indexes that were a prefix of another index are gone. No API behaviour changes. A backup file with a value outside these sets now fails to restore with an error instead of storing it.
- **Spatial columns dropped, route stop coordinates made consistent (internal).** The unused PostGIS `coordinates` columns on places and photos (rewritten on every save, read by nothing) and the code that maintained them are gone, and a trip's route stops store latitude/longitude as `DECIMAL(10,8)`/`(11,8)` like every other coordinate (rounded to 8 decimals, about 1 mm). The `postgis` extension stays installed. The API, the Android app and backups return the same numbers as before.
- **The user table is split (internal).** Integration settings (Immich, weather, flight tracking, routing, LLM, mail server) and display preferences (categories, trip types, currency, units, maps app, link ingest senders, partner permission) moved from `users` into `user_integrations` and `user_preferences`, one row per user, so loading a user never loads a secret. Stored keys are copied as they are (still encrypted) and the migration aborts if any value would differ. Nothing changes for users: the API, the Android app and backups (format unchanged) behave as before.
- **Every cost is an expense.** The cost of an activity, transport leg, lodging stay or custom item is now an ordinary expense row linked to it, instead of columns on the booking. Nothing changes in the booking forms, the API or the Android app (a booking still has a cost and a currency), and the budget summary, per-category totals, "not converted" reporting and settle-up give the same numbers. What is new: a booking's cost appears in the Budget tab's expense list, marked with the booking it belongs to (click to open it), and can be split between people and carry a receipt like any expense; editing it there changes the booking's cost, deleting it clears the booking's cost (the booking stays). The migration copies each cost with its frozen exchange rate and refuses to run if any cost, currency total or earlier expense would change. A booking that had a currency but no cost loses the currency. Booking costs now get a calendar day from the booking's own timezone (then the trip's, then yours) instead of the UTC day, which only matters when a foreign-currency cost still has to be converted. Duplicating a trip copies each booking cost once. Public share pages are unchanged.
- **Backups are format 1.9.0.** An expense that is a booking's cost names its booking, so its payer, split and receipt survive a round trip, and transportation now exports its `id` so those references (and entity links and deadlines on transport legs) resolve. Restoring creates one cost per booking. Older backups still restore into the same shape.

- **Who paid is stored one way.** The trip owner as an expense payer or split participant is now their own "Myself" companion instead of a separate yes/no flag. The migration points every owner-paid expense and owner share at the trip owner's "Myself" companion (creating one for owners who had none), refuses to run if any payer or split would be lost or a person is listed twice in one split, and then drops the old flags. A user can have only one "Myself" companion (extra ones become ordinary companions). The "Myself" companion cannot be deleted while an expense uses it. Expense, split and settle-up requests and responses, the Android app's sync and backups (format unchanged; old backups still restore) are unchanged.

- **An activity or lodging now has a real place.** "This is at that place" is stored as `locationId` on the activity or lodging (`ON DELETE SET NULL`) instead of an entity link. The migration moves existing links onto it, one per item (an `OCCURRED_AT` link first, then the oldest; a place from another trip is never used) and removes the link it replaced; any other place links stay as plain related links. Activity and lodging requests and responses carry `locationId` and a small `location`, the forms, timeline, daily view, map, weather, trip health check, public share page, calendar feed, AI link suggestions, bulk import, trip duplication, backups and the mobile sync use it. The Android app and any cached web page that still create, show or delete a place as a link keep working.
- **Places, passports and visa checks know the country as a code.** A place stores its country (ISO code) from the map search when it has one, otherwise worked out from the address; changing the address refreshes it. Existing places, passports and visa rows are filled in from their text where the country is recognisable. The visa check, the trip health check, the emergency card, local norms, trip comparison and the countries checklist use the code first and only read the address text for places without one.
- **Backups are format 1.8.0** (places carry `countryCode`, passports `issuingCountryCode`). Older backups still restore and get the codes worked out.
- **Backups are format 1.7.0.** Activities and lodging export `locationId`. Older backups still restore: their place link becomes the `locationId`.

### Fixed

- Deleting a place now clears it from the activities and lodgings that used it in a way the Android app notices, so they stop showing a place that is gone.
- The visa data treated "Britain" as the United States; it is the United Kingdom.
- Deleting a photo, place, activity, lodging, transport leg, journal entry, album, PDF import, saved link or custom item now always removes the links that pointed at it, enforced by the database as well as by the app.

### Migrations — action required before deploying

Eight migrations (`20261120000000` to `20261126010000`). Four of them drop columns after copying the data elsewhere, so **back up the database first**, then run `npx prisma migrate deploy` as part of the deploy.

- Every migration checks its own result and rolls back completely if a value would be lost or changed.
- `20261122000000_one_representation_of_who_paid` refuses to run if an expense lists the trip owner twice in one split (once as "owner" and once as their own "Myself" companion). The error names the expense; remove one of the two shares and deploy again.
- `20261126000000_add_vocabulary_checks` never fails on existing data: a rule that existing rows break is left unvalidated and reported in a `NOTICE`, with the follow-up query in the migration file.
- Backups are format 1.9.0. Backups from earlier versions still restore.

## [8.1.1] - 2026-11-20

### Added

- **PDF import runs in the background.** The upload dialog closes as soon as the file is uploaded, and a banner tracks it while you keep working: "Waiting to read hotel.pdf · 1 PDF ahead of it", then "Reading hotel.pdf…", then "hotel.pdf is ready · Found 2 bookings to review" with a **Review** link that opens the review for that file. A failed read says why and offers **Try again**. The banner survives page reloads.
- **Cancel a PDF import** from its banner, while it waits or while it is being read. Cancelling stops the request to the model, so a local model such as Ollama stops working on it too.
- After accepting a booking from a PDF, a **View** link opens the trip at the new stay, flight or activity.
- `LLM_TIMEOUT_MS` sets how long the server waits for the model (default 5 minutes, was a fixed 30 seconds), so slower self-hosted models such as Ollama on a NAS can finish reading a booking.

### Changed

- **PDFs are read one at a time per model server, in a fair queue.** Each person can have one PDF waiting or being read; the others wait their turn instead of being refused, and turns alternate between people. Your own model set in Settings has its own queue.
- PDFs that were waiting or being read when the server restarted are picked up again on startup.

### Security

- **Immich and personal LLM URLs are checked on every request, not just when saved.** A hostname that passed the check when you saved it but was later pointed at the server itself, cloud metadata or another private address is now refused (DNS rebinding). LAN servers keep working when `ALLOW_PRIVATE_INTEGRATION_URLS` is on, and the instance-wide `LLM_BASE_URL` is unaffected.

### Fixed

- Bookings accepted from a PDF import no longer show a day early west of UTC. A date-only check-in or check-out is now placed at 3:00 PM / 11:00 AM on that day in the lodging's timezone (lodging, then trip, then your own), the same defaults the lodging form uses. Flight and activity times with no UTC offset are read on that local clock. A date-only activity becomes an all-day activity. Before, these values were read as UTC, so "2027-03-12" showed as "Mar 11, 7:00 PM EST".
- **Saving AI settings works.** The Settings page failed with "Cannot PUT /api/users/llm-settings" because the route was never registered, so there was no way to point an account at its own model.
- PDF import now uses the AI settings of the person who uploaded it; it always used the server-wide settings before.
- An upload that fails now shows the server's reason (for example "LLM not configured") instead of "Upload failed. Please try again."
- Accepting a booking from a PDF refreshes the trip's lists and tab counts, which used to show 0 next to the new item.

### Deployment

- To use Ollama on the LAN, either set `LLM_BASE_URL=http://<ip>:<port>/v1`, any non-empty `LLM_API_KEY` and `LLM_MODEL`, or set `ALLOW_PRIVATE_INTEGRATION_URLS=true` and enter the address in Settings. `docker-compose.prod.yml` now passes `ALLOW_PRIVATE_INTEGRATION_URLS` and `LLM_TIMEOUT_MS` through. No database migrations in this release.

## [8.1.0] - 2026-11-17

### Added

- **Search on phones.** A search button in the top bar opens a full-screen search; before, search only existed on wider screens.
- **Archive and unarchive from a phone.** Trip rows and the trip's ⋮ menu now offer Archive / Unarchive, and archived trips carry a badge.
- **Photo viewer gestures.** Swipe between photos, double-tap or pinch to zoom, drag to pan, tap the backdrop or press Back to close.
- **Kanban on touch screens.** Each card has a status picker on phones, and a long-press drags a card between columns.
- **"Save & Add Another" on phones** for every form that has it on desktop.
- A **Log** entry in the side menu for landscape phones and tablets, where the bottom bar is hidden.

### Changed

- The offline banner now sits under the top bar instead of at the bottom of the screen, where it covered bulk-action buttons.
- On phones the floating trip title bar is gone and the trip tabs pin directly under the top bar; on short screens (landscape phones) the tabs scroll with the page.
- Adding or editing an expense or a companion opens in the standard form sheet instead of an inline form.
- Removing a companion from a trip asks for confirmation.
- Transportation statistics are collapsed behind a **Stats** toggle on phones.
- Checklist results and errors use toasts instead of browser alert boxes.

### Fixed

- **Mobile layout review.** A pass over the whole web app at phone sizes fixed about a hundred problems. The main groups:
  - Pages that were wider than the screen and zoomed out: the trips list, the Budget tab once a budget was set, trip pages in a series with long titles, split-by-amount expenses, and anywhere a long unbroken word or URL appeared (checklist items, food-log notes, trip and series descriptions).
  - Controls distorted by the touch-target rule: toggle switches, radio buttons and checkboxes keep their designed shape, and the favourite star no longer covers the middle of a photo thumbnail.
  - Rows that squeezed their content: Route Planner stop names (which were invisible), expense cards, Tags & Categories, trip series rows, share invitations, companion names, and several dialog footers.
  - Menus and pickers that opened off-screen: the emoji picker, the trip type filter, the trips list ⋮ menu, the calendar trip popup, and the CSV import preview, which now shows each row's problems under its name.
  - Forms and errors that opened out of view: trip form validation now scrolls to and focuses the first invalid field, and the Duplicate Trip dialog keeps its buttons visible.
  - Maps: the Places, Route Planner, Places Visited and Year in Review maps no longer trap scrolling ("Tap to interact with the map"), maps are fitted to their pins, the Today map is taller and redraws when enlarged.
  - The photo viewer's Close button can no longer be pushed off-screen by a long caption.
  - The active trip sub-tab is scrolled into view, and album edit/delete and timeline edit/delete are visible without hovering.
  - The bottom tab bar no longer shows to signed-out visitors on the login, register, invite and shared-trip pages.
- A wrong password on the login page now shows an error instead of silently reloading, and the next sign-in lands on the Today page.
- Timeline and Day By Day showed the wrong days (first day missing, day numbers off by one) when the device's time zone was far from the trip's; the same slip in the Trip Health "No lodging for…" dates is fixed.
- "Go to Checklists" and "View all checklists" on the trip Overview now navigate.
- Add Transportation no longer pre-fills an arrival earlier than the departure.
- Tapping the map in Add Location no longer replaces a name you already typed.
- A trip search with no matches shows "No trips match your filters" instead of the first-run welcome.
- `UPLOAD_DIR` is honoured everywhere files are written (photos, avatars, receipts, cover images), not only where they are served.

- The Immich library browser is usable on phones again. Its search and filters used to be pinned above the photos and filled the whole screen; they now scroll with the photo grid, the filters sit behind a **Filters** toggle on small screens, and the search row no longer runs off the edge. Landscape phones, where the grid was pushed off-screen entirely, are fixed too.

## [8.0.0] - 2026-11-16

A feature release: expense splitting, a multi-city route planner, trip comparison, CSV import, loyalty programs, photo favorites, Today mode and a much larger Immich integration. It also includes everything in 7.3.1, which was never tagged.

**Before you upgrade:** seven database migrations need applying (see *Migrations* below), and distances and temperatures now follow a new **Units** setting that defaults to **imperial** for every account. Anyone who wants kilometres and Celsius must switch it in Settings.

### Added

- **Expense splitting and settle-up.** Record who paid for an expense and how it is split; a Settle Up panel on the Budget tab shows who owes whom.
- **Receipt scan to expense.** Scan a receipt into a pre-filled expense. The image is kept and attached to the expense.
- **Multi-city route planner.** A Route Planner tab holds an ordered list of stops (searched or picked from saved places). Drag to reorder, see distances, and optimise the order with a preview and undo.
- **Trip comparison** at `/trips/compare`: a table (including cost per day), a colour-coded map and a shared timeline.
- **Bulk import from CSV** for places and activities: downloadable templates, column mapping, a server-validated preview and an error report.
- **Loyalty programs.** Add programs in Settings and pick one, with suggestions, on transportation and lodging.
- **Photo favorites and highlights.** Star photos, filter to Favorites, a Highlights view, and highlights on the public share page.
- **Today mode.** A live next-up card with a countdown, confirmation number and route button, plus local and home clocks.
- **Draft a day's journal entry with AI** (the trip dates plus one day either side), with add-entry actions on the Timeline and Day By Day views.
- **Recently viewed trips** widget on the dashboard (stored per user in the browser).
- **Booking deadlines can be edited inside the lodging, transportation and activity forms.**
- **Much more Immich:** server-side filters, smart search, bulk linking, syncing an Immich album to a trip album, and an opt-in export of a trip album to Immich.
- **Units setting** (imperial or metric, default imperial) in Settings, used for distances and temperatures across the app.
- New documentation for contributors: a feature map, a mobile and shared-code guide, and corrected architecture, API, schema, testing, style and deployment guides. `env.template` lists every environment variable.

### Changed

- **Currency is now a list to pick from in every form**, limited to the currencies the app can convert.

### Fixed

- **"Save & Add Another" keeps the form open** instead of saving and closing.
- **Closing an untouched Add Lodging or Add Transportation form no longer warns about unsaved changes.**
- **Import PDF works from the trip menu on a phone.**
- Creating an activity no longer drops its time zone and all-day setting.
- AI journal summaries, enhancement and link suggestions now use your own AI key when you have set one.
- A replace-mode restore no longer turns a missing user time zone into UTC.
- The Immich browser's text search, "Select All Photos" and date ranges now behave correctly.
- Duplicating a trip keeps photo favorites and loyalty links.

### Known limitations

- Backups record upload paths, not image bytes, for receipts and photos.
- Loyalty membership numbers are stored unmasked in backups.
- Duplicating a trip does not copy route stops or expenses.
- Packing-suggestion reasons stay in Fahrenheit for metric users.
- The Android app does not yet know about splits, route stops, loyalty programs or units.

### Migrations

Seven additive migrations; run `docker exec travel-life-backend npx prisma migrate deploy` as part of the deploy:

- `20261116010000_add_expense_splits`
- `20261116020000_add_photo_is_favorite`
- `20261116030000_add_loyalty_programs`
- `20261116070000_add_expense_receipt_image`
- `20261116080000_add_trip_stops`
- `20261116100000_add_immich_album_link`
- `20261116120000_add_user_measurement_system`

## [7.3.1] - 2026-11-15

### Changed

- **Currency is now a list to pick from in every form** (activities, lodging, transportation, custom items, the trip budget, expenses and souvenirs), limited to the currencies the app can convert. It used to be a box you typed a three-letter code into. An item saved earlier with a different code keeps it and shows it as "not supported for conversion".

### Fixed

- **"Save & Add Another" keeps the form open.** For places, activities, lodging, transportation and journal entries it saved the entry and then closed the form, the same as the normal Add button. It now saves, clears the form and leaves it open for the next one, and the buttons are disabled while the save is running.
- **Closing an untouched Add Lodging or Add Transportation form no longer warns about unsaved changes.** The details pre-filled from your previous entry were being counted as edits.
- **Import PDF works from the trip menu on a phone.** Choosing it from the ⋮ menu closed the menu and nothing else happened; the upload dialog now opens. On tablets and computers the button was unaffected.

## [7.3.0] - 2026-11-15

### Security

- **Uploaded photos and videos are stored under the file type the server detected**, not the extension of the name they were uploaded with, and anything in the uploads folder that is not an image, video or PDF is now sent as a download instead of being opened in the browser.
- **A trip marked Public no longer lets other signed-in users open its photo files directly.** Photos of a shared trip are still available through its share link.
- **Link fields only accept web links.** Booking links on activities, lodging and custom items, and saved links, must start with `http://` or `https://`.
- **Immich "Test connection" follows the same address rules as saving the Immich settings**, so it can no longer be pointed at addresses on the server's own network unless `ALLOW_PRIVATE_INTEGRATION_URLS` is on. Immich images proxied through the server are no longer marked as cacheable by shared proxies.
- **Browser push subscriptions must use a public `https` push service address.**
- **New `DISABLE_REGISTRATION` setting.** Set it to `true` to close self-service sign-up: the Register page and link disappear and the server refuses new sign-ups. Invitations still create accounts, and single sign-on follows `OIDC_AUTO_PROVISION` as before. Recommended for any server reachable from the internet.
- **The API, database and Nominatim ports are published on the host's loopback address only** in the production and TrueNAS compose files. The frontend reaches the API over the container network, so nothing changes for a standard setup. If another machine connects to one of those ports directly (for example a reverse proxy on a different host pointed at the API port), set `INTERNAL_BIND_ADDRESS=0.0.0.0` before updating.
- **The web app is served with a Content-Security-Policy** that only allows scripts from the app itself.
- **Android app: device backup is turned off**, so the offline copy of a trip and the documents in the vault are no longer included in Google backups. Applies to release builds from this version on; a local `mobile/app.json` needs `"allowBackup": false` added under `android`.
- **Signing in with an email that has no account now takes as long as a wrong password**, so response time no longer reveals which emails are registered.
- **New `TRUST_PROXY` setting** (default `1`) for the number of reverse proxies in front of the backend. Set it to `2` when a TLS proxy or tunnel sits in front of the bundled nginx; otherwise every visitor is rate-limited as one address.
- **Mobile app: plain `http` servers are refused unless they are on your local network** (private addresses, `.local` names, `localhost`). This applies to typing a server address and to scanning a pairing code.
- **Immich asset and album ids are checked before they are sent to the Immich server.**
- The release workflow's third-party release action is pinned to an exact commit.
- Updated dependencies with known vulnerabilities to patched versions, including Zod 4 everywhere and Prisma 7.10, bcrypt 6, node-cron 4 and Nodemailer 10 on the backend. The Prisma update needs no database changes.

### Fixed

- **Share links, the calendar subscription feed and accepting an invitation work again without being signed in.** They were answering "No token provided" because a sign-in check meant for collaboration routes was also applied to them.
- **The list of trips shared with you loads again.** The request was being read as a trip id.
- **Restoring a backup no longer fails when the trip has map coordinates or costs.** Backup files store those values as text, and restore refused them with "Validation failed". Existing backup files restore without being re-created.
- **Creating a checklist for a trip works again.** It was failing with a server error; checklists not attached to a trip were unaffected.
- **Offline features no longer stop working after the first visit.** Saved drafts, the offline copy of trips, queued offline edits and the offline map cache share one browser database. It could be upgraded on first load in a way that made every later load fail to open it. Browsers already in that state recover on their own with this version.
- **Deleting a trip now removes its photo and video files from the server.** Only the database records were removed before, so the files stayed in the uploads folder. Files left behind by trips deleted before this version are not cleaned up.
- **Album suggestions for a trip that does not exist return "not found"** instead of a server error.

## [7.2.0] - 2026-11-15

### Added

- **Mobile: Food nearby.** A new screen, reached from a button on Today or from Quick capture, searches for restaurants, cafés, bars and bakeries around you, with a dietary restriction to apply (vegetarian, vegan, halal, kosher, gluten-free, lactose-free or pescatarian) and a distance of 500 m, 1 km or 2 km. Results show how well each place fits the diet, whether it is open now and how far away it is, with directions, call, website, **Log a meal here** and **Save to trip**. It remembers your last diet and distance. The data is OpenStreetMap, which records diets only where someone added them, so many places show as "not confirmed" and are listed separately, after the ones that match. It needs a connection. New backend endpoint `GET /api/places/food` and an optional `OVERPASS_URL` setting for the map server(s).
- **Mobile: Food nearby can search anywhere.** It still defaults to where you are, but **Another place** lets you type a city, address or landmark (or tap a place already on the trip) and search around that instead; **My location** switches back. The chosen place is not remembered, so the next visit starts from where you are. New backend endpoint `GET /api/places/search` and an optional `PLACE_SEARCH_URL` setting.
- **Mobile: Map to.** Locations, lodging, activities, custom items and meals have a **Map to** button on the timeline, the by-type lists and the item screen that starts Google Maps navigation straight away. Transportation shows **Map to destination** and navigates to where the journey ends (driving for a car, taxi or flight, transit for a train, bus or ferry, walking or cycling for those). An item with no address or coordinates, directly or through a linked place, has no button.
- **Deadlines no longer need a booking.** In a trip's Deadlines tab, leave Booking on "Not attached to a booking" and give the deadline a title to keep track of something that is not part of the plan, such as renewing a passport. Add Deadline also works on a trip with no lodging, transportation or activities yet. Standalone deadlines show up in the dashboard widget, the trip health check, push reminders, and backups and restores, named by their title.

### Fixed

- **Clicking Add twice no longer adds something twice.** After pressing Add on a new location, lodging, transportation, journal entry, travel document, companion or tag, there was a pause (the request, then a reload of the list) before the form closed, and a second click in that window created a duplicate. The button is now disabled and reads "Saving..." until the form closes, and a second submit by any route (Enter, Ctrl+S, Save & Add Another) is ignored.

## [7.1.2] - 2026-11-14

### Changed

- **The trip list is ordered by what is current, not just by date.** "Newest First" and "Oldest First" put the current trip first (one marked In Progress, or a Planning/Planned trip whose dates cover today), then Dream, Planning and Planned trips, then Completed, then Cancelled, with dated trips ahead of undated ones inside each group. A Planning trip with no dates no longer sits below finished trips. "By Status" now runs In Progress, Planned, Planning, Dream, Completed, Cancelled instead of alphabetically. The mobile Trips list and its choice of current trip follow the same rule.

### Fixed

- **The mobile menu was unusable on phones.** The drawer opened as a short strip with its navigation links squashed away and no dimming over the page, so Settings and the other pages were hard to reach. The drawer and its overlay now fill the screen.
- **The New Trip form's "Begin Your Journey" button overflowed on narrow screens.** The two buttons now size to their labels, and the label wraps rather than spilling out of the button on the narrowest phones.

## [7.1.1] - 2026-11-14

### Added

- **Icelandic** phrase book (60 phrases), available in Edit Trip on the web and in the mobile Vault.
- **Pronunciation guides** for the Latin-script phrase books (French, Spanish, Italian, German, Portuguese, Dutch, Vietnamese and Icelandic): an English-style respelling under each phrase, with capitals marking the stressed syllable. Portuguese follows Brazilian speech. The guides are approximate, and Vietnamese does not show tones.

### Changed

- **Mobile times are AM/PM.** The Today clock, timeline rows, Next Up, camera-roll groups, sync times and the home-screen widget now read `2:05 PM` instead of `14:05`, and the Android time picker in forms is 12-hour to match.
- **The web app shows AM/PM everywhere it formats a time.** Eight places (the custom item card and manager, the entity detail modal, photo details, the public trip page, the flight "Updated" time, map transport popups and the sync conflict dialog) followed the browser's regional setting and showed 24-hour time in some regions. The browser's own date and time form inputs still follow the operating system.

### Fixed

- **Mobile: the system navigation buttons covered the bottom of screens** such as Quick capture and every form. Screens outside the tab bar now leave room for them.
- **Mobile: some text rendered blank or clipped on a Samsung phone.** The Phrasebook button showed only its emoji and the Hindi language chip lost its native name. A button's leading emoji is now drawn separately from its words, and chip detail text uses a normal weight.
- **Phrase books had their accents stripped** in French, Spanish, Italian, Portuguese, German, Dutch and Vietnamese ("Si" for "Sí", "Xin chao" for "Xin chào", "Francais" for "Français"). They are restored, along with Spanish inverted punctuation, and the language names now read Français, Español, Português and Tiếng Việt. Phones pick this up on their next sync.
- **Phrase book wording:** Spanish "Call an ambulance" now reads "Llame a una ambulancia", and the Spanish, Italian and Portuguese "Welcome" and the Portuguese "Nice to meet you" show both gendered forms, like the rest of those banks.

## [7.1.0] - 2026-11-14

### Added

- **Trip languages** can be set from Edit Trip, which loads the phrase book for that trip. Nothing in the web app could set one before.
- **Mobile: browse any day.** Today has a day strip with previous/next arrows and a Back to today button, so past and future days of the trip can be opened. Unscheduled items are listed under the day, each with an Add to this day button.
- **Mobile: meal photos.** Logging a meal has a Photos section; Add photo offers the camera or the photo library. Photos queue offline, upload once the meal syncs, and are attached to it.
- **Mobile: phrasebook languages.** Add or remove a trip's languages from Vault > Phrases; the phrases are cached for offline use.
- **Mobile: Trips screen** lists every trip on the server, including trips shared with you. Keep any trip on the phone, swipe to remove one with an Undo bar, and restore removed trips from Not on this phone.
- **Mobile: Travel Life logo** for the app icon, adaptive icon (including the themed icon) and splash screen.

### Changed

- **Node 26 (current LTS)** replaces Node 22 in every Dockerfile and in CI; `@types/node` is `^26` in the backend and frontend. Images must be rebuilt to pick it up (the release does this).
- **Mobile sync** now also runs every 60 seconds while the app is open, and the Today screen shows how many edits are waiting and when sync has a problem.

### Fixed

- **Mobile: trips shared with you never downloaded**, and trips that ended more than 30 days ago were dropped with no way to keep them.
- **Mobile: one refused trip stopped every other trip from syncing.** A trip the server refuses (access revoked, deleted) no longer blocks the rest.
- **Mobile: an expired session was reported as Offline**; it now says to sign in again.
- **Mobile map** hides places marked Exclude from map. After updating, each trip does one full re-sync to learn the setting.

## [7.0.0] - 2026-11-13

### Changed

- **Atlas Planner redesign.** The whole app has a new look and layout: a darker neutral palette, a new logo, and calmer forms.
- **Navigation** is now Today, Trips, Library and Inbox. Library gathers Albums, Places, Food log, Checklists, Travel stats, Trip calendar, Year in review, Trip series and People, and every Library page has the same layout and a link back.
- **Today** is a split view: the day's numbered agenda beside a map with matching pins. The map can show today, the current trip, photos, or the places of every trip.
- **Trip pages** have six sections: Overview, Itinerary, Photos, Plans, Journal and Essentials. Plans holds Places, Activities, Unscheduled, Transport, Lodging, Links and Custom; Essentials holds Budget, Deadlines, Companions, Emergency and Local Norms. Existing `?tab=` links still work.
- **Trip Overview** has a taller route map, a day-by-day list and the next bookings. The Start Planning, Start Trip and Print shortcuts are gone: change status from Edit Trip or the Trips board, and print from the Timeline.
- **Forms** put Name first and give Place its own section. Lodging no longer asks for an address; the linked Place carries it. A stay that already has an address keeps it.
- **Maps** no longer use a dark basemap. Every map shares one full-colour style with English labels where the map data has them.
- **Places visited** now lists the places of trips marked Completed, instead of relying on a per-trip flag that was never cleared when a trip left Completed.

### Added

- **Day Plan** view on a trip: one day's numbered list beside its map, with unscheduled items and a Schedule action.
- **Add and Link**: a new activity or lodging can create and link a Place of the same name, and a new Place can create and link an activity or lodging.
- **Inbox** for saved links and imported bookings waiting for review.
- `GET /locations/visited` accepts `scope=all` to return the places of every trip except cancelled ones.

### Fixed

- The trip Overview showed a lodging check-in at the wrong hour when the stay was in another timezone.
- Dropdown lists in dark mode were white text on light grey.

## [6.2.2] - 2026-11-12

### Fixed

- Light and dark map styles showed "API KEY REQUIRED" tiles because CARTO now requires a free basemaps key. Set `VITE_CARTO_API_KEY` at build time to restore them; without a key the app falls back to OpenStreetMap tiles instead of showing a broken map.

## [6.2.1] - 2026-11-11

### Added

- **Android companion app** with offline sync, built and attached to each GitHub Release as an APK. Includes a user-selectable dark mode.
- **Food log photos.** Attach local or Immich photos to a food log entry; thumbnails open in the same lightbox as trip photos.
- **Year in Review** has an "Include trips still being planned" toggle (off by default). Trips in the Planning phase are now excluded unless it is ticked.
- Shared platform-agnostic travel utilities and entity link rules.

### Changed

- **Trip dashboard Countdown** now counts down on the user's home time zone rather than the destination's.
- Dietary Preferences in Settings no longer offers "Select all".
- Navbar dropdown stacking, input focus ring and empty-state spacing polish.

### Fixed

- Places tab: child locations can now be selected for bulk actions, and "Cancel" exits selection mode without selecting anything first.
- Mobile SSO redirect now requires confirmation.

### Migrations

- `20261111000000_add_mobile_companion`, `20261112000000_add_food_log_entry_photos` and `20261113000000_user_timezone_no_default` (run `npx prisma migrate deploy`).

## [6.2.0] - 2026-11-11

### Added

- **Scheduled backups.** Opt-in nightly per-user JSON backups written to `BACKUP_DIR` with
  daily and weekly retention and atomic writes. Backups are HMAC-signed, so they can be
  restored and are tamper-checked.
- **Booking deadline tracker.** New `booking_deadlines` table, CRUD and upcoming API, hourly
  push reminders, a Health Check rule, backup/restore support, a Deadlines tab and a
  dashboard widget.
- **Food log** for recording what you ate on a trip.
- Immich videos show a loading spinner while the original downloads.

### Fixed

- **Light mode survives a page load.** The theme was force-reset to dark on every boot; the
  stored theme is now applied, defaulting to dark.
- **`sky-*` Tailwind utilities render again** (the Planned status badge had no background).
- **Travel Stats no longer shows "NaN"** for photos, and loads its per-trip data in parallel.
- **Trip dashboard no longer contradicts itself** for a trip whose dates have passed but whose
  status is still Planning.
- Date ranges consistently include the year across dashboard widgets and Year in Review.
- Frontend accessibility pass: contrast fixes across status ribbons, buttons, calendar bars
  and dark-mode captions; content is no longer hidden behind the mobile bottom nav.

### Migrations

Run `npx prisma migrate deploy` before using the new version. New since 6.1.7:

- `20260810000000_add_booking_deadlines`
- `20260811000000_add_food_log`
- `20261108000000_add_upload_path_indexes`

## [6.1.7] - 2026-10-12

### Fixed

- **Clicking a linked photo in the Links panel now opens it in the photo lightbox** instead
  of navigating away to the trip's photos tab.
- **Albums sidebar no longer stacks above overlays on desktop.** The mobile drawer's
  `z-40` and transform now reset at the `md` breakpoint.

## [6.1.6] - 2026-10-12

### Fixed

- **Linking an Immich video no longer drops its duration when Immich reports it as a
  number.** Duration parsing assumed a `HH:MM:SS` string and threw on numeric values.
- **Photo date grouping no longer fails with a Postgres GROUP BY error.** The timezone
  parameter made the `SELECT` and `GROUP BY` expressions differ; the query now groups by
  column position.

## [6.1.4] - 2026-08-02

### Added

- **Locations can be excluded from maps.** A location can now be flagged to keep it off
  trip maps, so a far-off origin like home stays recorded without stretching the map's
  auto-fit bounds to span the whole journey. Excluded locations get no marker and no
  contribution to bounds or zoom on the trip map, dashboard preview, and public trip map,
  while still appearing in lists and counts. The flag is a checkbox in the location form,
  backed by a new `exclude_from_map` column and carried through the create/update schemas
  and the public trip (share) serializer.

### Fixed

- **Printing the timeline no longer produces a blank page.** Any print invoked outside the
  app's own Print button — Ctrl+P, the browser menu, or mobile "Save as PDF" — printed a
  blank page, because the `@media print` rules hid the whole app while the printable
  itinerary was mounted lazily and only when the in-app button ran. The printable itinerary
  is now mounted permanently (hidden on screen, revealed only under `@media print`) and
  populated from data already fetched, so every route to print produces the paper version
  with no extra API calls.
- **Long location names wrap instead of overflowing on phones.** The compact location card
  heading truncated "Name · postalcode, country" on a single line through a broken flex
  chain, letting long names run outside the card; it now wraps with `break-words` inside a
  constrained, filling width. The trip page also reclaims horizontal space on mobile with
  responsive outer padding and a tighter Places panel on small screens.

## [6.1.3] - 2026-08-02

### Fixed

- **Printed itinerary and journal dates no longer shift by a day.** Two calendar-date
  values were being parsed as UTC midnight and then formatted or converted through a
  timezone, rendering the previous day for viewers west of UTC and drifting journal
  entries a day further east on every edit. The print itinerary's day headers and trip
  date range now go through the date-only formatter that keeps the intended day, and
  journal entry dates are stored pinned to UTC midnight and edited with a plain `date`
  input, so the day you see is the day that is saved.
- **The location search map behaves on phones.** In the bottom-sheet Add/Edit Location
  modal, the embedded search map no longer hijacks one-finger drags — it stays locked
  until tapped so a drag over it scrolls the form, matching the standard embed-map
  gesture, while desktop stays fully interactive. The map now uses the app's theme-aware
  tiles and the "Selected" info box and helper text gain dark-mode variants and wrap long
  addresses instead of overflowing narrow screens.

## [6.1.2] - 2026-07-31

### Changed

- **Modals open as bottom sheets on phones.** Below the `sm` breakpoint a modal now
  anchors to the bottom of the screen at full width with a rounded top edge, a drag-handle
  affordance and a slide-up entrance, instead of floating as a centered card inset by
  16 px on every side — space a long form could not afford. Padding tightens (`px-4 py-3`
  against the desktop `p-6`), the title drops to `text-lg`, and the panel is allowed 92%
  of the viewport rather than 90%. Height is measured in `dvh` with a `vh` fallback, so
  the sheet accounts for the browser's collapsing URL bar instead of being cut off by it,
  and the footer and unfootered content pad to `env(safe-area-inset-bottom)` so the
  buttons clear the home indicator on notched devices. Content scrolls with
  `overscroll-contain`, keeping a scroll gesture inside the sheet rather than dragging the
  page behind it. `FormModalFooter`'s Cancel and Save split the full width on phones and
  stack under any left-hand content, rather than crowding onto one row. The entrance
  animation moved from Tailwind's `animate-in` utilities to named keyframes so the global
  `prefers-reduced-motion` rule suppresses it. Desktop layout is unchanged.

### Documentation

- Added a `claude.yml` GitHub Actions workflow so Claude responds to `@claude` mentions in
  issues and pull request reviews.

## [6.1.1] - 2026-07-31

### Added

- **Album suggestions say what they are and show you.** Each suggestion now carries a
  plain-language description — how many photos and videos, when they were taken, where,
  and the actual rule that grouped them ("within 2 hours of the one before it", "inside
  the same 500 m radius") — plus a thumbnail that opens a 3×3 preview grid on hover or
  tap, so a suggestion can be judged before the album exists. A location cluster is named
  after the nearest recorded trip location within 1 km rather than a coordinate pair, and
  falls back to `Location (48.86, 2.29)` only when nothing is close enough. Captions are
  quoted verbatim (two at most, duplicates collapsed) because they are the only real
  signal of what is *in* the pictures — nothing is inferred from image content. Times
  render in the trip's zone through the standard resolver, not UTC. The preview samples
  evenly across the group instead of taking the first nine, so the grid shows the whole
  span, and only the first thumbnail loads up front — a screen of suggestions no longer
  fetches 45 Immich thumbnails before anyone hovers.

### Changed

- **Schedule forms now suggest the missing half of a time range an hour away, in both
  directions.** Entering a start offered an end only in `ActivityForm`, and elsewhere the
  "auto-fill" copied the date across verbatim, producing a zero-length range; entering an
  end offered nothing anywhere. Both directions now derive across activities,
  transportation, unscheduled items and the timeline edit modal, sharing one
  `useTimeRangeDefaults` hook. The hook tracks *which* side it filled, so a suggestion is
  replaceable but anything you typed, restored from a draft, or loaded from a saved record
  is never overwritten — including the chained departure a connecting leg inherits, which
  encodes a real layover buffer and previously would have been dragged back to
  arrival-minus-an-hour. The old `ActivityForm` effect is gone: it watched the start and
  so refilled an end the moment you cleared it. Date arithmetic runs through `Date.UTC`,
  so "one hour later" stays one hour across a DST boundary in the browser's zone.

## [6.1.0] - 2026-07-27

### Added

- **Emergency card.** A per-trip record of the details you need when something goes wrong
  and the phone may be dead or stolen: insurance provider, policy number, assistance line
  and embassy contact (`TripEmergencyInfo`), alongside new `medicalNotes` and `allergies`
  on `TravelCompanion`. Local emergency numbers come from a bundled 123-country snapshot
  (`constants/countryFacts.ts`) and the destination resolves **client-side**, so the card's
  core content never sits behind the network; it is cached in IndexedDB via a new
  `emergencyCards` store and prints through the existing `print-*-wrapper` portal, with
  allergies set in underlined bold rather than red so they survive a monochrome printer.
  The country is `Trip.countryCode` — the same column the local norms card reads — so a
  correction on either card holds for both. Embassy details are user-entered rather than
  bundled, because "nearest embassy" is a per-(passport, destination) pair and far too
  large to ship offline. Companion medical fields are owner-only, nulled for collaborators
  behind an explicit flag so the card never implies nothing was recorded, and a missing
  emergency number is dropped rather than rendered as "none".
- **Local norms card.** Plug type and voltage, tipping convention, and emergency numbers
  for the trip's destination, read from the same bundled country snapshot — frontend-only
  by design, so it needs no migration and works with the radio off. No country column
  exists on `Location`, so `useTripCountries` tallies candidates from every location
  address; a trip spanning several countries renders a chip row with per-country location
  counts instead of silently picking one, and a trip that resolves none offers the full
  123-country picker rather than an empty card. Viewing another country of a multi-country
  trip stays local and instant, while *correcting* the country writes the shared
  `Trip.countryCode`. Japan's 50/60Hz and Brazil's 127/220V mixed grids carry explicit
  per-country notes.

### Fixed

- **Offline features threw `NotFoundError: One of the specified object stores was not
  found` for anyone whose browser held an older copy of the database.** IndexedDB runs
  `upgrade` only when the version number changes, so a browser that created
  `travel-life-offline` at v1 from an earlier store list keeps that list forever — every
  transaction naming a store added later (`syncQueue`, `syncConflicts`, …) throws, which
  broke sign-in sync reconciliation, the pending-change count and the conflict list.
  `getDb()` now compares the open database against `STORE_NAMES` and, when anything is
  missing, reopens one version higher to re-run the (idempotent) upgrade, creating just the
  missing stores and preserving existing data. Bumping `DB_VERSION` was never sufficient
  here and is no longer how new stores reach existing clients.

### Documentation

- `DEPLOYMENT.md` documents CDN configuration: `sw.js`, `registerSW.js`,
  `manifest.webmanifest` and `index.html` must not be edge-cached, why a cached `sw.js`
  breaks the PWA permanently (its precache manifest names asset filenames that the next
  deploy deletes), and the one-time purge required when upgrading from 6.0.0 or earlier,
  which served `sw.js` with a one-year immutable cache.
- New [Code Conventions](docs/architecture/CODE_CONVENTIONS.md) guide, listed in the
  documentation index and flagged in `CLAUDE.md` as required reading before writing code.

### Database

- Migration `20260729000000_add_emergency_card` adds `TripEmergencyInfo` and the
  `medicalNotes` / `allergies` columns on `TravelCompanion`. Run
  `npx prisma migrate deploy` against the target database as part of the deploy.

## [6.0.3] - 2026-07-27

### Changed

- `release.ps1` no longer builds Docker images. The step was labelled "final
  verification" but built *different* images than CI publishes — the frontend from
  `Dockerfile.prod.truenas` (hardcoding `VITE_API_URL=/api`) rather than CI's
  `Dockerfile.prod` (which takes it as a build-arg). That is precisely how the 6.0.2
  localhost bug shipped: the local build passed, and its success was read as evidence the
  release was sound. CI building the tagged commit from a clean checkout is the only real
  gate. `build.truenas.ps1` remains for building images by hand, and now states plainly
  that its output must not be pushed and does not verify a release.

### Fixed

- **Uploaded images rendered as broken images behind nginx.** Both nginx configs cache
  static assets with a regex location (`~* \.(js|css|png|jpg|...)$`), and nginx picks a
  matching regex location over a plain prefix location. `/uploads/` and `/api/` were plain
  prefixes, so every proxied path ending in one of those extensions — including trip cover
  images, which are always re-encoded to `.jpg` — skipped the proxy and was looked up in
  the SPA's document root, where it does not exist. Both locations are now `^~`, which
  stops regex evaluation. Only affects deployments served through the frontend image's
  nginx; local dev talks to the backend directly.

- **Long text broke out of buttons, cards and badges on mobile.** Audited at ~412px
  (Galaxy S25 Ultra). Two distinct causes. Long unbroken strings — emails, phone numbers,
  confirmation and booking reference numbers, link hostnames, tag names, trip/album/
  checklist titles, usernames — have no wrap opportunity, so they set a min-content width
  wider than their container and ran past its edge; these now carry `break-words` /
  `break-all` / `truncate`, with `min-w-0` on the flex wrapper and `shrink-0` on sibling
  actions so a long name can no longer shove buttons off-screen. Separately, the
  Edit/Delete action rows on locations, activities, lodging and transportation packed up
  to six controls onto one non-wrapping line; since the buttons carry `whitespace-nowrap`
  the row's min-content width is fixed, so when it did not fit it ran past the card edge
  instead of reflowing. Sub-locations hit this first, rendering the same six controls in a
  card that is already visually inset. Those rows now wrap. Presentation only — no logic
  or data changes.

## [6.0.2] - 2026-07-26

### Fixed

- **The published frontend image called `http://localhost:5000/api` (regression in 6.0.0).**
  Every request from the browser failed with `ERR_CONNECTION_REFUSED`, so login, silent
  refresh and the SSO button (which hides itself when `/auth/oidc/config` fails) were all
  broken. `release.yml` passed `VITE_API_URL=${{ vars.VITE_API_URL || 'http://localhost:5000/api' }}`,
  and with the repository variable unset that localhost default was baked into the bundle.
  6.0.0 is the release where CI became the image publisher; before that `build.truenas.ps1`
  used `Dockerfile.prod.truenas`, which hardcodes `/api`, which is why 5.6.1 was unaffected.
  The default is now `/api` and `/uploads` — the frontend image's nginx proxies both, so
  relative URLs are correct for every deployment, and these values cannot be changed after
  build time.

## [6.0.1] - 2026-07-26

### Fixed

- **Login loop after signing in (regression in 6.0.0).** 6.0.0 made refresh tokens
  single-use and treats a second presentation as token theft, bumping `passwordVersion` to
  invalidate every session for that user. But the app has two independent refresh paths —
  the axios 401 interceptor (`/auth/refresh`) and silent refresh (`/auth/silent-refresh`)
  — which race on page load and legitimately present the same cookie. The second was
  flagged as theft, so a successful sign-in immediately invalidated itself and bounced the
  user back to `/login`, permanently. `claimToken` now distinguishes a concurrent replay
  inside a short grace window from genuine reuse: the in-flight rotation result is
  replayed for honest clients, while a genuine replay outside the window still invalidates
  every session.

- The frontend container was reported `unhealthy` while serving traffic normally. Its
  healthcheck probed `http://localhost:80`, and `wget` resolves `localhost` to `::1` first
  while nginx's `listen 80` binds IPv4 only, so every probe got `Connection refused`. All
  frontend healthchecks (both Dockerfiles and all three compose files) now probe
  `http://127.0.0.1:80/health`.
- The PWA could get permanently stuck on an old build. Both nginx configs matched `sw.js`
  with the `\.(js|css|…)$` rule and served the service worker as
  `Cache-Control: public, immutable` with a one-year expiry. `sw.js`, `registerSW.js`,
  `manifest.webmanifest` and `index.html` have stable (non-content-hashed) filenames, so a
  long cache pins clients to whatever build they first loaded. They are now served
  `no-cache` via exact-match locations; the content-hashed assets keep the immutable cache.
- `release.ps1` no longer corrupts non-ASCII characters when promoting the changelog.
  `Get-Content -Raw` without `-Encoding UTF8` reads UTF-8 as the system ANSI codepage and
  `WriteAllText` re-encodes it, double-encoding every em-dash and accent — which CI then
  publishes verbatim as the GitHub Release body (visible in the 6.0.0 release notes).
- The TrueNAS compose files defaulted to `${APP_VERSION:-v5.6.1}` after 6.0.0 shipped, so
  a deploy without `APP_VERSION` set would silently bring up the previous release. Both
  files now default to the current version, and bumping them is a documented release step.

### Documentation

- `backend/prisma/migrations/README.md` documents recovery from a failed baseline
  (`P3009`). The previous text implied `migrate resolve --applied` alone was enough;
  Prisma rejects that once the migration is recorded as failed, and `--rolled-back` must
  come first. Includes the one-off container form for a crash-looping backend.
- `BUILD_AND_PUSH.md`: dropped the "re-push to registry" and manual `docker login`
  remedies that contradicted CI-only publishing, and added migration steps to deploy.

## [6.0.0] - 2026-07-26

### Added

- Travel partner requests: a partnership must now be accepted by the recipient before it
  takes effect. Accepting is the only operation permitted to write both users' records.

### Security

- Setting a travel partner no longer writes the *other* user's record. Previously
  `updateTravelPartnerSettings` wrote the link bidirectionally, which let a user grant
  themselves collaborator access to every trip the other person subsequently created —
  including lodging confirmations, expenses, journal entries and photos. Consent is now
  required via a travel partner request.

### Environment — action required before deploying

- `JWT_SECRET` and `JWT_REFRESH_SECRET` are now validated at startup and must be at least
  32 characters and not a well-known placeholder. Tokens are HS256, so the signing key is
  offline-crackable from a single issued token — presence alone was not enough. **A backend
  with a shorter secret will refuse to start** (`JWT_SECRET is too weak`). Generate
  replacements with `openssl rand -base64 48`. The check is skipped only under
  `NODE_ENV=test`. Note that changing either secret invalidates all existing sessions and
  refresh tokens, so every user must sign in again.

### Migrations — action required before deploying

- Adds a baseline migration, `00000000000000_init`, that creates the entire schema from
  empty. **Every database that already contains data must have it marked as applied once,
  before the next `prisma migrate deploy`:** `npx prisma migrate resolve --applied
  00000000000000_init`. Skipping this aborts the deploy on a guard (nothing is damaged,
  but no later migration is applied). See `backend/prisma/migrations/README.md`.
- Also adds: a uniqueness constraint on weather data per trip/date, a trip-expense
  trip/date index, a trip-expense amount check constraint, a PostGIS coordinate backfill,
  and the travel partner request tables.

### Fixed

- Release pipeline: `release.ps1` now aborts when the backend or frontend verification
  build fails (previously the failure was silently swallowed and the release continued).
- `release.sh` is runnable again: it reads the current version from
  `backend/package.json` instead of a non-existent `VERSION` file, strips a leading `v`
  from explicit versions (`./release.sh v5.6.1` no longer tags `vv5.6.1`), and no longer
  aborts mid-bump on a missing changelog.
- `build.sh` builds correct image references when `DOCKER_REGISTRY` is set (missing `/`
  separator produced tags like `ghcr.io/dsbagictravel-life-backend`).
- The release workflow no longer fails when a changelog section is missing.
- CI runs the backend test suite for real and type-checks both packages instead of
  swallowing failures.
- TrueNAS compose files deploy a pinned `${APP_VERSION}` image instead of `:latest`.

### Changed

- CI (`.github/workflows/release.yml`) is now the single publisher of container images.
  `release.ps1` / `release.sh` build images locally for verification only.
- Removed the one-off `fix-migration.ps1` / `fix-migration.sh` /
  `fix-journal-associations-migration.sql` hotfix scripts.

## [5.6.1] - 2026-07-25

### Added

- Bulk actions for saved links.
- Year in Review widget.
- Multi-currency budgets.
- Opening-hours warnings for locations.
- Transit deep links.

### Fixed

- Opening-hours service failed to compile under the relaxed production build
  (discriminated-union narrowing without `strictNullChecks`).

## [5.6.0] - 2026-07-25

### Added

- Saved links, with ingest of links sent by email.
- Trip cover images.
- OIDC single sign-on: PKCE support for public clients (client secret optional),
  `DISABLE_PASSWORD_LOGIN` for SSO-only mode with a lockout guard, and `OIDC_TRUST_EMAIL`
  for identity providers that omit `email_verified`.

### Fixed

- Actionable errors surfaced for OIDC discovery and token-exchange failures.
- `BASE_URL`, `FRONTEND_URL`, OIDC and VAPID variables are passed through to the backend
  in the production compose file.

---

Releases before 5.6.0 predate this changelog; see the git history and the
[tag list](https://github.com/dsbaciga/travel-life/tags).
