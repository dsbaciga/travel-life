# Atlas Planner Redesign: Frontend Implementation Plan

Status: proposal, nothing implemented. Written 2026-11-13.

Mockups: <https://claude.ai/artifact/9PqoTCruPut7AEZj5pMsTF> (private canvas; the "Atlas Planner"
artboards with the warm palette are the target).

This plan is based on a survey of the frontend, not a full audit. Files read: `App.tsx`,
`Navbar.tsx`, `DashboardPage.tsx`, `tailwind.config.js`, `utils/mapConfig.ts`,
`store/navigationStore.ts`, and the outlines of `trip-detail/tripDetailTabs.tsx`,
`MobileBottomNav.tsx` and `trip-dashboard/TripDashboard.tsx`. Anything about other files is an
assumption to confirm when that phase starts.

## What the redesign changes

1. **Palette**: dark surfaces move from blue-slate navy to a cool grey that is much less blue;
   gold is reserved for the brand, the active item and one primary action per screen; links
   become teal; urgent deadlines become soft red. The mockups show a warm charcoal; that was
   tried in the app and rejected (see Phase 1).
2. **App shell**: nine top-bar links become five (Today, Trips, Library, Inbox, People), on
   desktop and in the mobile bottom nav.
3. **Today screen**: the dashboard becomes a split view with a dense work column (agenda,
   deadlines, inbox) beside a large map.
4. **Trip detail**: eight sections, an Overview that replaces the trip Dashboard tab, and an
   Itinerary view that pairs a day list with a map.

## Corrections to the mockups

Two things the mockups got wrong about the current app:

- **Maps are Leaflet with raster tiles**, not MapLibre. `react-leaflet` renders CARTO
  `light_all` / `dark_all` PNG tiles (`utils/mapConfig.ts`, `lib/tileUtils.ts`). Raster tiles
  cannot be restyled, so "a custom dark map style" is not a config change. See Phase 2.
- **Trip tabs are already grouped.** `useTripTabGroups` defines six groups (Dashboard,
  Overview, Plan, Memories, Places, People) over 21 tab ids. The redesign regroups them; it
  does not introduce grouping.

One thing the mobile mockup dropped by mistake: the centre **Log** capture button in
`MobileBottomNav`. It should stay. See Phase 3.

## Decisions needed before starting

| # | Decision | Recommendation |
| - | -------- | -------------- |
| 1 | Light theme. The mockups are dark only, and the style guide treats both themes as first-class. | Design the light palette before Phase 1 ships, or Phase 1 changes dark mode only. |
| 2 | Fonts. The mockups use Space Grotesk and Inter; the app uses Crimson Pro and Manrope. | Keep Crimson Pro and Manrope for now. Both are set through `font-display` / `font-body` in `tailwind.config.js`, so a swap later is a two-line change. |
| 3 | Map tiles for the warm dark theme. | Start with a CSS filter on the existing dark tiles (Phase 2, option A). |
| 4 | What "Library" is: a hub page or a dropdown. | A dropdown on desktop and a hub page on mobile, linking to the existing pages. |
| 5 | Where the displaced dashboard widgets go (stats, recent photos, On This Day, calendar, Year in Review). | Below the split view on Today; revisit after using it. |
| 6 | The trip detail sidebar layout (`navigationStore` `layout: 'sidebar'`, `TripSidebar`). | Keep it working with the new groups; do not remove it in this project. |

## Phase 1: Colour tokens

Size: small. One PR.

**Status: done on branch `feat/dark-neutral-palette`.** What actually happened differs from
the notes below, which are kept as the original reasoning:

- The neutrals live in one `DUSK` scale at the top of `tailwind.config.js`. The `navy`
  tokens, `warm-gray`, and a new `dusk-N` colour all read from it, and `index.css` reads the
  tokens through `theme()`.
- About 1,800 raw `dark:*-gray-N` classes in 169 files bypassed the tokens. They were
  migrated mechanically to `dark:*-dusk-N`.
- Warm charcoal (Tailwind `stone`), a stone/neutral mix, near-neutral and `zinc` were each
  tried in the app and read as brown next to the gold accent. The settled scale is a cool
  grey one third of the way from `zinc` to `slate`.
- The teal link, urgent and page-background tokens were not added; `teal-300` and `red-300`
  already exist and nothing uses them until later phases.
- About 140 usages of colour steps that did not exist emitted no CSS. They now work:
  `navy` carries the whole `dusk` ramp (so `navy-600`, `navy-100` and the rest resolve),
  `accent` gained 50, 100, 200, 800 and 900, and the `cream-N` / `slate-N` / `dusk-750`
  usages were rewritten to real tokens. The visible effect is mostly dark-mode borders and
  hover states that were silently missing, and light amber tints in light mode.
- Checked in the browser in dark mode: login, dashboard, trips list, trip detail, a trip
  map. Checked in light mode: dashboard and trips list.
- `docs/architecture/STYLE_GUIDE.md` colour tables are updated.

The dark palette is already tokenised: `navy-900`, `navy-800`, `navy-700` and `gold` account
for roughly 800 class usages across about 120 files. Changing the token values recolours the
app without touching those files.

- `tailwind.config.js`: change the `navy` values to the warm charcoal scale and add the two
  steps the mockups use that have no token today.

  ```js
  navy: {
    950: '#100e0c', // new: top bar, bottom nav
    900: '#1c1917', // was #0f172a
    800: '#292524', // was #1e293b
    700: '#44403c', // was #334155
  },
  ```

- Add tokens for the new roles: a teal link colour (`#5eead4`), an urgent colour (`#fca5a5`),
  and the page background (`#171412`).
- `warm-gray` (`#e2e8f0`) is dark-mode body text and is also used for light-mode borders.
  Changing its value affects both; check light mode before changing it.
- `index.css`: the component classes (`.btn-primary`, `.card`, `.input` and others) use these
  tokens through `@apply`, plus hard-coded gold glow shadows. Review each by hand.
- Find dark-mode classes that bypass the tokens (`dark:bg-slate-*`, `dark:bg-gray-*`,
  `dark:border-gray-*`) and move them onto tokens. This is the main unknown in this phase.
- `App.tsx` line 120 to 123 uses `bg-cream-50`, `text-navy-600` and `dark:text-cream-200`.
  None of those tokens exist, so those classes emit no CSS. Fix while here.

The name `navy` will no longer describe the colour. Renaming it is a mechanical follow-up
across about 120 files; do it as its own PR after the redesign settles, not in this one.

Not in this phase: moving links from gold to teal and limiting gold to one primary action.
Those are per-component changes and land with each screen in Phases 3 to 6.

## Phase 2: Map appearance

Size: small for option A.

**Status: done, as a smaller change than planned.** With the cool grey from Phase 1 the
CARTO dark tiles already sit well, so no recolouring filter was needed. What was done, all
in `index.css` under `@media screen` and `.dark`:

- The Leaflet container background follows `navy-900`, removing the light-grey flash while
  tiles load.
- The dark basemap's tile pane is set to 86% opacity so the themed background lifts its
  near-black toward the page surface. It is scoped with `:has(img[src*='dark_all'])`, so
  the OpenStreetMap fallback is not dimmed. Tile URLs are unchanged, so the offline tile
  cache is unaffected.
- Zoom controls and the attribution strip are styled for dark mode.
- Popups and tooltips stay light on purpose: their contents are written for a white card
  (`text-gray-900` with no dark variant, in 8 components). Darkening them needs dark
  variants on every popup body first.

The options below are kept as the original reasoning; B and C were not needed.

This phase was written for the warm charcoal palette, which needed the dark map to stop
being blue-grey. With the cool grey that Phase 1 settled on, the CARTO dark tiles may
already sit well enough; look at a map in dark mode before doing any of this. If it still
needs work, the options are:

- **A. CSS filter on the dark tile layer.** Apply a `filter` to `.leaflet-tile-pane` in dark
  mode to pull the CARTO dark tiles toward teal-charcoal. Tile URLs stay the same, so the
  offline tile cache (`lib/tileUtils.ts`, `pwa/MapCachePreview.tsx`) keeps working. The
  result is approximate.
- **B. A different raster provider for dark mode.** Exact control is still not possible, a
  new API key and attribution are needed, and offline caching must be re-pointed.
- **C. Move to vector maps (MapLibre) with a custom style.** Full control, but it replaces
  every map component and the offline tile cache. This is a separate project.

Recommendation: A, as a spike first. If the result is not good enough, keep the current dark
tiles and accept the mismatch rather than starting C inside this project.

Respect the existing `useCustomMapStyle` user setting and the no-API-key fallback to
OpenStreetMap tiles in `getMapTileConfig`; the filter should apply only to the CARTO dark
tiles.

## Phase 3: App shell and navigation

Size: medium. One PR.

Current: `Navbar.tsx` has nine links (Dashboard, Trips, Albums, Companions, Places,
Checklists, Series, Food, Links). `MobileBottomNav.tsx` has Home, Trips, Log (capture),
Albums, Places and Lists.

Target mapping:

| New item | Route | Contains |
| -------- | ----- | -------- |
| Today | `/dashboard` (unchanged) | The redesigned dashboard |
| Trips | `/trips` | Trips, plus Series (`/trip-series`) as a view or link inside it |
| Library | new `/library` hub on mobile, dropdown on desktop | Albums, Places, Food log, Checklists |
| Inbox | `/saved-links` (unchanged) | Saved links inbox, plus pending PDF imports |
| People | `/companions` | Companions |

- Keep every existing route. No redirects are needed because no URL changes.
- Inbox badge: sum `savedLinkService.getInboxCount()` and `pdfImportService.getPendingCount()`.
  Both queries already run in `Navbar`. The pending-import count currently shows on Settings;
  the review UI for imports lives in Settings today, so Inbox either links there or the review
  list moves. Confirm where that UI lives before choosing.
- Mobile bottom nav: Today, Trips, Log (capture, kept in the centre), Library, Inbox. People
  moves into Library on mobile so the bar stays at five items.
- Keep the bottom padding rule documented in the style guide
  (`pb-[calc(4.25rem+env(safe-area-inset-bottom))]`).
- `isActivePath` uses `startsWith`; Library needs to be active for `/albums`,
  `/places-visited`, `/food-log` and `/checklists`.

## Phase 4: Today screen

Size: large. Split into two PRs: layout with existing widgets, then the agenda-to-map link.

File: `pages/DashboardPage.tsx`.

- **Layout**: a work column (max about 500px) and a map filling the rest on `lg` and up;
  stacked on smaller screens.
- **Agenda**: `trip-dashboard/TodaysItinerary.tsx` already builds a today list for an
  in-progress trip from activities, transportation and lodging. Reuse its logic. The
  dashboard currently only knows the active trip (`useActiveTrip`), so it must also fetch
  that trip's activities, transportation and lodging. Check whether the existing services
  are enough or whether one combined endpoint is worth adding.
- **Times**: resolve zones with `useTimezoneResolver` (entity, then trip, then user), per
  the project timezone rules. Bucket items onto today with `dayKeyInTimezone()`.
- **Deadlines**: reuse `widgets/DeadlinesWidget.tsx`, restyled as a checklist.
- **Map**: reuse an existing Leaflet component (`TripMap.tsx` or `PlacesVisitedMap.tsx`)
  with a scope switch: Today, This trip, All trips, Photos.
- **Numbered pins**: each agenda row gets a number matching a map pin. This needs
  coordinates per item: activities through their linked location, lodging through its
  location, transportation through its from and to points. Items without coordinates get a
  number in the list and no pin.
- **Trips strip**: data from `widgets/UpcomingTripsWidget.tsx`.
- **No trip in progress**: the work column leads with the next trip's countdown and open
  items, and the map defaults to All trips. This state has not been drawn yet.
- **Displaced widgets**: Travel stats, Recent photos, On This Day, Trip calendar, Year in
  Review, Pending invitations and Quick actions have no slot in the mockup. Per decision 5,
  place them below the split view. Pending invitations should stay near the top since it
  needs action.
- Keep pull-to-refresh on mobile.

## Phase 5: Trip detail

Size: large. Three PRs: regroup, Overview, Itinerary split view.

### 5a. Regroup the sections

File: `components/trip-detail/tripDetailTabs.tsx` (`useTripTabGroups`).

| New section | Existing tab ids |
| ----------- | ---------------- |
| Overview | `dashboard` |
| Itinerary | `timeline`, `daily`, `trip-map`, `activities`, `unscheduled` |
| Places | `locations` |
| Photos | `photos`, `photo-map`, `photo-timeline` |
| Bookings | `transportation`, `lodging` |
| Budget | `budget` |
| Journal | `journal`, `food-log` |
| Prep | `deadlines`, `links`, `custom`, `companions`, `emergency`, `local-norms` |

Keep the `TabId` values unchanged so `?tab=` deep links, `isTabId` and
`onNavigateToTab` callers keep working. Only the grouping and labels change. Check that
`TabGroup` and `TripSidebar` both render eight groups acceptably, including the mobile
dropdown.

### 5b. Overview

File: `components/trip-dashboard/TripDashboard.tsx`.

Most of the mockup maps onto widgets that exist:

| Mockup block | Existing component |
| ------------ | ------------------ |
| Stat tiles | `TripStats` |
| Route map | `MapPreviewWidget` (needs the travelled / remaining split) |
| Day by day | new; small list built from the same data as the Daily view |
| Needs attention | `TripHealthCheck` is the likely source; confirm what it reports |
| Budget | `BudgetSummaryWidget` |
| Next bookings | `NextUpCard`, extended to show three items |
| Companions | `CompanionsWidget` |

Widgets with no slot in the mockup: countdown, local time, weather, flight status,
checklists, recent activity, quick actions. Keep them, placed below or in the side column;
they are status-dependent and already hide themselves when not relevant.

### 5c. Itinerary split view

- Day picker plus that day's numbered list on the left, map on the right, reusing the
  pin-numbering code from Phase 4.
- `DayMiniMap.tsx` already renders a per-day map; check whether it can be promoted to the
  full-size panel.
- Unscheduled items list under the day, with drag-to-schedule if the current Unscheduled
  tab supports it; otherwise a "Schedule" action per item.
- The Timeline and Day By Day views remain available as view modes inside Itinerary.

## Phase 6: Mobile

Size: medium. Lands with Phases 3 to 5 rather than after them.

- Today: short map above the agenda with an expand control.
- Trip detail: sections as a horizontally scrolling tab row (replacing the dropdown),
  List / Map toggle in Itinerary, and the existing floating add button.
- A mobile Overview is the desktop blocks in one column; not yet drawn.
- Touch targets stay at 44px minimum.

## Phase 7: Documentation and checks

- Update `docs/architecture/STYLE_GUIDE.md`: palette tables, gold usage rule, link colour,
  dark mode conventions, and the navigation table under Responsive Design.
- Update `docs/architecture/FRONTEND_ARCHITECTURE.md` for the new shell and Today page.
- Contrast: re-check every text pair against the new surfaces. The style guide records
  several past failures from white-on-mid-tone and from opacity on text; the same rules
  apply. Dark text on gold stays.
- Tests: update `Navbar`, `MobileBottomNav`, `TabGroup` and dashboard tests. Run frontend
  vitest from `C:/...` with an uppercase drive letter.
- Visual check of both themes at mobile and desktop widths for each PR.
- Print itinerary styles must stay light; confirm the token change does not leak into
  `@media print`.

## Suggested order

1. Decisions 1 to 3.
2. Phase 1 (tokens) and Phase 2 option A spike. Low risk, visible result, easy to revert.
3. Phase 3 (shell).
4. Phase 5a (regroup tabs). Small and independent.
5. Phase 4 (Today).
6. Phase 5b and 5c.
7. Phase 7 throughout, finalised at the end.

Each step is its own PR against `main`.

## Risks

- **Light theme is undesigned.** Shipping only a new dark theme makes the two themes feel
  like different products.
- **Hidden non-token dark classes.** If many components use raw `slate` or `gray` classes in
  dark mode, Phase 1 grows from small to medium.
- **Map filter quality.** If option A looks wrong, the warm palette and the cool map will
  clash until vector maps are considered.
- **Today data loading.** Fetching a trip's activities, transportation and lodging on the
  dashboard adds requests to the app's landing page; watch load time and offline behaviour.
- **Items without coordinates** weaken the agenda-to-map link; the design has to read well
  when half the pins are missing.
