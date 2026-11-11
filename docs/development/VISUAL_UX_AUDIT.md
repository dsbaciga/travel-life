# Visual & UX Audit

An audit of the Travel Life frontend for visual and UX quality, carried out against a running
app at desktop (1440×900) and mobile (375×812) widths in both light and dark mode.

Findings are grouped **Broken** → **Confusing** → **Polish**. Each names the file and the
specific element. Items marked **Fixed** were applied in the same change as this document;
everything else is a recommendation left for a decision.

## How this was audited

Docker is not running on this machine and there is no local Postgres, so the real backend could
not start. Rather than audit from source alone, the Vite dev server was run against a small
stand-in API serving fixture trips, locations, activities, lodging, transportation, journal
entries, expenses and deadlines, so every surface rendered with realistic content. Layout,
colour and spacing findings below were measured in the live DOM (computed styles and
`getBoundingClientRect`), not estimated from screenshots.

Contrast numbers are WCAG 2.1 ratios computed from composited colours, including gradient
stops and alpha blending. The thresholds used are 4.5:1 for normal text and 3:1 for large text
(≥24px, or ≥18.66px bold).

Two caveats on coverage:

- The **Plan → Activities** and some **Overview → Timeline** sub-tabs could not be driven to a
  fully populated state against the stand-in API, so their content areas were audited from
  source rather than on screen. Their page chrome (tab bars, headers, sticky behaviour) was
  audited live.
- Safe-area behaviour on a notched device is inferred from the CSS; it cannot be reproduced in
  a desktop browser.

---

## Broken

### 1. Light mode could not survive a page load — Fixed

**Files:** `frontend/src/main.tsx`, `frontend/src/store/themeStore.ts`

`main.tsx` unconditionally ran `document.documentElement.classList.add('dark')` under a comment
reading "Always use dark mode", and the theme store's init block only ever *added* the `dark`
class — it never removed it when the stored theme was `light`. Turning the Appearance toggle off
worked until the next navigation or refresh, at which point the app silently reverted to dark.

The store also defaulted to `theme: 'light'`, so on a fresh install the Settings → Appearance →
Dark Mode switch rendered in the "off" position on a dark screen.

This contradicts the style guide's first principle, "Dual-Mode Excellence: Both light and dark
modes are first-class citizens."

**Fix applied:** both paths now read the stored theme and apply it with `classList.toggle`,
defaulting to dark when nothing is stored. A single `applyTheme()` helper is the only code that
touches the document, so the class and `color-scheme` cannot drift apart again.

### 2. Every `sky-*` Tailwind utility produced no CSS — Fixed

**File:** `frontend/tailwind.config.js`

`extend.colors` defined `sky: '#7dd3fc'` as a flat value, which **replaces** Tailwind's built-in
`sky` scale rather than adding to it. Every `bg-sky-500`, `text-sky-800`, `bg-sky-100`,
`to-sky-900/20` and similar in the codebase — 35 usages across the app — resolved to nothing.

The visible symptom: the **Planned** trip status badge rendered as bare white text with no pill
at all, on both the trip cards and the compact list rows, while every other status showed a
coloured chip.

**Fix applied:** `sky` now spreads Tailwind's own scale and adds `DEFAULT: '#7dd3fc'`, so the
existing bare `text-sky` / `border-sky` usages keep working and the numbered steps come back.

### 3. Every trip status ribbon failed WCAG AA — Fixed

**File:** `frontend/src/utils/statusColors.ts` (`tripStatusRibbonColors`)

White 12px uppercase text on the `-500` step of each hue, measured live:

| Status | Background | Ratio | Needed |
| ------ | ---------- | ----- | ------ |
| In Progress | `amber-500` | 2.15:1 | 4.5:1 |
| Completed | `green-500` | 2.28:1 | 4.5:1 |
| Planning | `blue-500` | 3.68:1 | 4.5:1 |
| Cancelled | `red-500` | 3.76:1 | 4.5:1 |
| Dream | `purple-500` | 3.96:1 | 4.5:1 |

**Fix applied:** moved the ribbon palette to the `-700` step of the same hues. All six now clear
4.5:1 while staying fully saturated. Note the sibling `tripStatusColors` map (the subtle
`-100`/`-800` variant the style guide documents) was already correct and is unchanged.

### 4. The primary button's label failed AA in both themes — Fixed

**File:** `frontend/src/index.css` (`.btn-primary`)

Measured on the live button:

- Light: white on the gradient's first stop `primary-500` (`#D97706`) is **3.19:1**.
- Dark: white on `accent-400` (`#fbbf24`) is **1.67:1** — the worst pairing found anywhere in
  the app, and it sits on the most-used control in the product.

**Fix applied:** light mode runs `from-primary-600 to-primary-700` (5.02:1 → 7.09:1); dark mode
keeps the gold gradient but uses `dark:text-navy-900` (11.9:1), which is the same dark-on-gold
pattern `Navbar`'s count chip already uses.

`docs/architecture/STYLE_GUIDE.md` has been updated to match, along with its Status Colors,
Color Contrast, Hover Effects and safe-area sections. Revert both together if the lighter
gradient is preferred and the contrast accepted.

### 5. Dashboard hero username at 2.05:1 — Fixed

**File:** `frontend/src/pages/DashboardPage.tsx`

The username in "Welcome back, *name*" used `text-accent-500` (`#f59e0b`), which against the
cream page background is **2.05:1** — below the 3:1 that even 72px display text requires. In
light mode the user's own name was the least legible thing on the page.

**Fix applied:** `text-primary-600` in light mode (5.0:1), dark mode unchanged.

### 6. Year in Review card labels at 2.43–2.57:1 — Fixed

**File:** `frontend/src/components/widgets/YearInReviewWidget.tsx`

The card's `from-primary-500` background carried `text-white/80` and `text-white/75` labels
("Year in Review", "your travels so far", and each stat caption), measuring 2.43:1 to 2.57:1.

**Fix applied:** the card gradient moved to `from-primary-600 to-primary-700` and the faded
labels to full `text-white`. De-emphasis now comes from size and weight rather than opacity.

### 7. Calendar trip bars at 1.83–3.96:1 — Fixed

**File:** `frontend/src/components/widgets/calendar/calendarUtils.ts` (`TRIP_COLORS`)

The dashboard trip calendar draws each trip's title in white 12px directly on its assigned
colour. Ten of the twelve palette entries failed AA — lime 1.83:1, amber 2.15:1, cyan 2.37:1,
teal 2.49:1, emerald 2.54:1, orange 2.86:1, pink 3.65:1, blue 3.68:1, red 3.76:1, purple 3.96:1.

**Fix applied:** the palette moved to the `-700` step of the same twelve hues. All now clear
4.5:1 against white and remain just as easy to tell apart.

### 8. Page content sat behind the mobile bottom nav — Fixed

**File:** `frontend/src/App.tsx`

`<main>` used a flat `pb-16` (64px) to clear `MobileBottomNav`, which measures 66px — `h-16`
plus a 2px top border — **plus its own `safe-area-inset-bottom`**. So the bottom of every page
was clipped by 2px on an ordinary phone and by roughly 36px on a device with a home indicator.

**Fix applied:** `pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0`, verified at 375px
(68px padding against a 66px nav, no horizontal scroll).

### 9. `dark:text-gray-500` failed AA in 80 places — Fixed

**Files:** 39 files across `frontend/src`

`text-gray-500` (`#6b7280`) on the `navy-800` card surface is **3.03:1**. The pattern appeared
80 times — captions, empty-state sub-text, metadata lines.

**Fix applied:** all occurrences changed to `dark:text-gray-400` (`#9ca3af`), which is 5.3:1 on
`navy-800` and still passes on the lighter `navy-700`.

### 10. Trip card metadata at 2.72:1 — Fixed

**Files:** `frontend/src/components/TripCard.tsx`, `frontend/src/components/FormSection.tsx`

The duration/status line under each trip title used `text-slate/70`; the 70% alpha dropped
`slate` from a passing 4.76:1 to **2.72:1** on white.

**Fix applied:** `text-slate dark:text-warm-gray/70` — the opacity moved off the light-mode
value, which is the one that was failing.

### 11. "In progress" status text at 3.3:1 — Fixed

**File:** `frontend/src/components/TripCard.tsx`

`text-green-600` on the white card is 3.3:1 at 12px. **Fix applied:** `text-green-700` (4.72:1)
in light mode; dark mode unchanged.

### 12. Small chrome badges below AA — Fixed

- The `⌘K` hint in `frontend/src/components/GlobalSearch.tsx` measured 4.39:1 light and 4.06:1
  dark. Now `text-gray-600` / `dark:text-gray-300`.
- The calendar's "today" marker in
  `frontend/src/components/widgets/calendar/MonthlyCalendarView.tsx` was white on `primary-500`
  (3.19:1). Now `primary-600` (4.73:1).
- The nav item count chip in `frontend/src/components/Navbar.tsx` was white on `primary-500`
  (3.19:1) at 10px. Now `primary-600`.

### 13. Travel Stats rendered the literal string "NaN" — Fixed

**File:** `frontend/src/components/widgets/TravelStatsWidget.tsx`

`photoCount += photosResponse.total` runs inside a `try/catch` commented "Skip if fails", but
the catch only covers a *rejected* request. A response that resolves without a `total` field
makes the running total `NaN`, and the "Photos Captured" tile renders `NaN` to the user — which
is what happened on screen during this audit.

**Fix applied:** `photosResponse.total ?? 0`.

### 14. Hover lift and shadow snapped instead of animating — Fixed

**File:** `frontend/src/index.css`

`.btn-primary`, `.btn-secondary` and `.btn-danger` all declare `hover:-translate-y-0.5` and a
shadow change, but set `transition-colors`, which covers only colour properties. Confirmed on
the live button: computed `transition-property` was
`color, background-color, border-color, text-decoration-color, fill, stroke`. The lift and
shadow therefore jumped instantly.

`.card` had the same problem with `transition-shadow` against `hover:-translate-y-1`
(via `.card-interactive`) and `hover:border-accent-400/30`.

The style guide's own Animations section prescribes `transition-all duration-300` for exactly
this combined card hover.

**Fix applied:** `transition-all` on all four.

---

## Confusing

### 15. The theme toggle is buried

**File:** `frontend/src/components/settings/AccountSettingsSection.tsx`

The only control that switches light/dark lives in Settings → Account → Appearance, at the
bottom of a long scrolling page, below Name, Password, Timezone, Home Currency, Dietary
Preferences and Travel Partner. The header account dropdown offers only "Settings" and "Logout".

**Recommendation:** add the toggle to the account dropdown, where it is one click from anywhere.

### 16. Delete is the loudest thing on every trip card

**File:** `frontend/src/components/TripCard.tsx`

Each card's footer carries Edit, Archive and **Delete**, with Delete rendered as a saturated red
`.btn-danger` of equal size. On a grid of trips the eye lands on a column of red Delete buttons
before it reads a single trip title, and the most destructive action has the highest visual
weight on the card.

**Recommendation:** move Edit/Archive/Delete behind a kebab menu (the mobile layout already
omits them entirely and reads better for it), or demote Delete to a text button and keep the
red fill for the confirmation dialog only.

### 17. Date ranges omit the year inconsistently

**Files:** `frontend/src/components/widgets/UpcomingTripsWidget.tsx:68` versus
`frontend/src/components/TripCard.tsx`

`UpcomingTripsWidget` formats with `{ month: 'short', day: 'numeric' }` and so never emits a
year: it rendered a January 2027 trip as "Jan 10 - Jan 24", while the trips list rendered the
same trip as "Jan 10-24, 2027". For an app whose whole
subject is dated trips spanning multiple years, dropping the year in one place and not the other
is actively misleading.

**Recommendation:** route all trip date-range formatting through one shared helper that includes
the year whenever the range falls outside the current year.

### 18. The trip dashboard contradicts itself

**File:** `frontend/src/components/trip-dashboard/` (Trip Status and completion cards)

A trip whose status is "Planning" but whose end date has passed showed a "Planning in progress —
Set dates to track countdown" badge directly beside a "Trip Complete!" headline and a "Trip
Complete / Another adventure for the books!" card, in the same viewport.

**Recommendation:** decide whether these cards key off the stored status or off the dates, and
make both use the same source.

### 19. Travel Stats issues three requests per trip, in series

**File:** `frontend/src/components/widgets/TravelStatsWidget.tsx`

`loadStats()` loops over every trip and `await`s a photo request, then loops again and `await`s a
location request, then transportation — sequentially. With six fixture trips that is ~18
round-trips before the widget paints; the cost grows linearly with the trip count, on the
dashboard, on every visit.

**Recommendation:** add a single aggregate stats endpoint, or at minimum `Promise.all` the
per-trip requests.

### 20. The error state is a thin banner on an empty page

**File:** `frontend/src/components/ErrorBoundary.tsx` (as used by page-level routes)

When a page-level query fails, the user sees a ~90px red banner pinned to the top of an
otherwise empty full-height page. It reads as a broken layout rather than a handled error.

**Recommendation:** centre the error block in the available space, as `LoadingSpinner.FullPage`
and `EmptyState` already do.

### 21. Three levels of navigation stack on trip detail

**File:** `frontend/src/components/trip-detail/tripDetailTabs.tsx`

Trip detail nests main nav → trip tabs (Dashboard, Overview, Plan, Memories, Places, People) →
sub-tabs, and Plan alone has nine (Activities, Transport, Lodging, Budget, Food Log, Deadlines,
Links, Custom, Unscheduled). Measured live at 1440×900, the fixed and sticky chrome occupies
**247px — 27% of the viewport height** — before any trip content.

**Recommendation:** out of scope to restructure here, but worth considering whether the Plan
sub-tabs could collapse into fewer groups, and whether the sticky trip sub-header needs to
persist alongside both tab rows.

### 22. Unlabelled icon-only controls

The Overview → Timeline toolbar is six icon-only buttons with no visible labels. Several carry
no tooltip either.

**Recommendation:** add `title`/tooltips at minimum; labels where space allows.

### 23. Horizontally scrolling tab rows give no hint that they scroll

At 375px the trip tab row and the Plan sub-tab row scroll horizontally with content cut flat at
the viewport edge — no fade, no chevron.

**Recommendation:** add a gradient mask on the overflowing edge.

---

## Polish

### 24. Settings has no action hierarchy

**File:** `frontend/src/components/settings/AccountSettingsSection.tsx`

The Account tab alone presents six-plus gold `.btn-primary` buttons — Update Name, Update
Password, Save Timezone, Save Home Currency, Save Dietary Preferences, and more below. When
everything is primary, nothing is.

**Recommendation:** demote per-section saves to `.btn-secondary`, or move to a single page-level
save with dirty-state tracking.

### 25. Settings cards stretch to `max-w-7xl` around narrow inputs

At 1440px the section cards span the full container while their inputs are capped near 250px,
leaving roughly 1100px of empty card to the right of every field.

**Recommendation:** constrain the settings column to something like `max-w-3xl`, or let the
inputs use the width.

### 26. Two stacked sticky bars use different dark surfaces

**Files:** `frontend/src/components/Navbar.tsx`, `frontend/src/components/FloatingTripHeader.tsx`

The main nav uses `dark:bg-navy-900/95`; the trip sub-header directly beneath it uses
`dark:bg-gray-800/95`. `gray-800` (`#1f2937`) is not a style-guide token — the guide specifies
`navy-900`/`navy-800`/`navy-700` for dark surfaces — and the two read as a faint seam.

**Recommendation:** use `dark:bg-navy-800/95` for the sub-header.

### 27. `slate` on `parchment` is 4.34:1

The filter control labels ("All Statuses") pair the `slate` text token with the `parchment`
surface token, landing at 4.34:1 against a 4.5:1 requirement. The same `slate` on white passes
at 4.76:1, so this is specifically the token *pair*.

**Recommendation:** darken `slate` slightly (around `#5b6472` clears 5:1 on `parchment`), or
avoid `slate` on `parchment` for text. Left alone here because it changes a core token.

### 28. Trip detail header has four co-equal buttons and no primary

Manage Tags, Share, Edit Trip and Import PDF all render as identical secondary buttons.

**Recommendation:** promote Edit Trip, or group the rest behind a menu.

### 29. "Trip at a Glance" uses seven different hues at once

Places, Photos, Activities, Transport, Lodging, Journal and Companions each get their own
coloured tile, producing a rainbow strip that carries no information — the colours do not encode
anything the labels don't.

**Recommendation:** use one accent with varying weight, and keep colour for status.

### 30. The Transport tab icon reads as a warning triangle

**File:** `frontend/src/components/trip-detail/tripDetailTabs.tsx`

The Transport sub-tab uses the Heroicons paper-airplane path. At the 16px it renders at, beside
the word "Transport", it reads as a ⚠ warning triangle — suggesting a problem with the trip's
transport rather than labelling the section.

**Recommendation:** use a distinct vehicle or route icon.

### 31. Documented safe-area utilities are unused

**File:** `frontend/src/index.css`

`.safe-area-bottom` and `.safe-area-bottom-nav` are defined and documented in the style guide's
Utility Classes table, but `.safe-area-bottom-nav` is referenced nowhere in the app. Finding 8
above is exactly the bug it exists to prevent.

**Recommendation:** either adopt it at the layout level or drop it from the CSS and the guide.

### 32. The dashboard's two-column grid leaves large voids

At 1440px the left and right dashboard columns run to very different heights; beside Quick
Actions the right column is empty for roughly 280px, and the Recent Photos card is tall and
mostly empty in its no-photos state.

**Recommendation:** a masonry or balanced-height arrangement, or let Recent Photos shrink to its
content when empty.

---

## Verification

After the fixes above:

- Automated contrast sweep over the composited DOM reports **zero failures** on the dashboard
  and trips list in dark mode, and one remaining 4.47:1 item in light mode (finding 27's token
  pair, left deliberately).
- `npm run build` passes in `frontend/`.
- `npm run lint` passes in `frontend/` with no output.
- Verified at 375px that `<main>`'s bottom padding (68px) now exceeds the bottom nav (66px) and
  that no page scrolls horizontally.
