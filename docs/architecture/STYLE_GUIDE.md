# Travel Life UI Style Guide

This document defines the visual design system and UI conventions used throughout the Travel Life application. Follow these guidelines to maintain consistency when building or modifying UI components.

## Table of Contents

1. [Design Philosophy](#design-philosophy)
2. [Color System](#color-system)
3. [Typography](#typography)
4. [Spacing & Layout](#spacing--layout)
5. [Components](#components)
6. [Dark Mode](#dark-mode)
7. [Animations & Transitions](#animations--transitions)
8. [Icons](#icons)
9. [Responsive Design](#responsive-design)
10. [Accessibility](#accessibility)
11. [Print Styles](#print-styles)
12. [Utility Classes](#utility-classes)
13. [Quick Reference](#quick-reference)

---

## Design Philosophy

Travel Life uses a **warm, adventure-inspired design** with these core principles:

- **Compass Gold Theme**: Warm amber/gold tones evoke exploration and adventure
- **Dual-Mode Excellence**: Both light and dark modes are first-class citizens. Dark mode sits on a cool grey that is much less blue than the navy it replaced (the tokens are still named `navy`)
- **Subtle Depth**: Use shadows, glows, and backdrop effects for depth without heaviness
- **Smooth Interactions**: Consistent animations make the UI feel polished and responsive
- **Travel-Centric**: Serif display font (Crimson Pro) adds an elegant, journalistic quality befitting a travel log

---

## Color System

### Primary Colors (Compass Gold)

Light mode primary palette - warm amber tones:

| Token | Hex | Usage |
|-------|-----|-------|
| `primary-50` | `#fef3c7` | Lightest backgrounds, subtle highlights |
| `primary-100` | `#fde68a` | Light backgrounds, skeleton loaders |
| `primary-200` | `#fcd34d` | Hover states, borders |
| `primary-300` | `#fbbf24` | Active states |
| `primary-400` | `#f59e0b` | Medium emphasis |
| `primary-500` | `#D97706` | **Primary actions, buttons** |
| `primary-600` | `#B45309` | Button gradients, hover states |
| `primary-700` | `#92400e` | Strong emphasis |
| `primary-800` | `#78350f` | Text on light backgrounds |
| `primary-900` | `#451a03` | Darkest text |

### Accent Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `accent-50` | `#fffbeb` | Faintest tinted backgrounds, light text on dark accent fills |
| `accent-100` | `#fef3c7` | Light tinted backgrounds, gradient ends |
| `accent-200` | `#fde68a` | Soft highlights, light borders |
| `accent-300` | `#fcd34d` | Light accents |
| `accent-400` | `#fbbf24` | Dark mode primary |
| `accent-500` | `#f59e0b` | Emphasis |
| `accent-600` | `#D97706` | Dark mode gradients |
| `accent-700` | `#B45309` | Strong emphasis, text on light tints |
| `accent-800` | `#92400e` | Dark accent text on light backgrounds |
| `accent-900` | `#78350f` | Darkest accent, dark-mode tinted backgrounds |
| `gold` | `#fbbf24` | Dark mode highlights, glows |

### Neutral Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `cream` | `#f8fafc` | Light mode background |
| `parchment` | `#f1f5f9` | Secondary light background |
| `warm-gray` | `#e3e5ea` | Borders, dividers (light). Same value as `dusk-200` |
| `charcoal` | `#1e293b` | Primary text (light mode) |
| `slate` | `#64748b` | Secondary text |

### Dark Mode Colors

| Token | Hex | Usage |
|-------|-----|-------|
| `navy-950` | `#0b0d12` | Darkest chrome (top bar, bottom nav) |
| `navy-900` | `#151820` | Page background |
| `navy-800` | `#242830` | Card backgrounds |
| `navy-700` | `#3b404b` | Elevated surfaces, borders |
| `gold` | `#fbbf24` | Primary accent, highlights |
| `sky` | `#7dd3fc` | Secondary accent (bare `text-sky`, `border-sky`) |
| `warm-gray` | `#e3e5ea` | Body text (dark mode) |

`navy` is no longer navy. It is an alias of the `dusk` ramp, which is defined once as `DUSK`
at the top of `tailwind.config.js`; `warm-gray` reads from the same ramp. Retuning the dark
theme means editing that one scale, nothing else.

| Step | Hex | Step | Hex |
|------|-----|------|-----|
| `dusk-50` | `#f9fafb` | `dusk-500` | `#6d7280` |
| `dusk-100` | `#f3f4f6` | `dusk-600` | `#4e5360` |
| `dusk-200` | `#e3e5ea` | `dusk-700` | `#3b404b` |
| `dusk-300` | `#d1d4db` | `dusk-800` | `#242830` |
| `dusk-400` | `#9da2af` | `dusk-900` | `#151820` |
| | | `dusk-950` | `#0b0d12` |

Raw dark-mode neutrals use `dark:*-dusk-N` (`dark:text-dusk-400`, `dark:border-dusk-700`).
Never use `dark:*-gray-N`, `stone`, `slate` or `zinc` in a `dark:` variant: those bypass the
ramp, and the theme then cannot be retuned in one place.

The ramp is a cool grey, one third of the way from Tailwind's `zinc` to `slate`, and that is
deliberate. Warm greys (`stone`), near-neutral greys and `zinc` were each tried in the app
and read as brown next to the gold accent. The original `slate` read as blue.

`sky` is both a single accent value and the full Tailwind `sky-50`…`sky-950` scale:
`tailwind.config.js` spreads the default scale and adds `DEFAULT`. Define any future flat
accent the same way. A bare `sky: '#7dd3fc'` inside `extend.colors` **replaces** the scale
rather than adding to it, and every `bg-sky-500` / `text-sky-800` in the app then silently
emits no CSS — which is exactly how the Planned status badge ended up rendering with no
background at all.

The related trap: a flat colour token has no numeric steps. `cream`, `parchment`, `charcoal`,
`slate` and `gold` are single values, so `bg-cream-50` or `text-slate-600` emit no CSS and
fail silently. Use the bare name (`bg-cream`, `text-slate`), or a `dusk-N` step for a
neutral. About 100 such dead usages were removed when the dark palette was retuned.

### Status Colors

Trip status has two treatments, both in `src/utils/statusColors.ts`. Use the subtle one
by default. The ribbon is the high-contrast chip used where status has to carry across a
dense scan or sit on a cover photo — `TripCard` (cover ribbon and compact row) and
`TripListView`.

**Subtle** (`tripStatusColors`, via `getTripStatusColor` / `getTripStatusBadgeClasses`):

| Status | Light BG | Dark BG | Text |
|--------|----------|---------|------|
| Dream | `purple-100` | `purple-900` | `purple-800` / `purple-300` |
| Planning | `blue-100` | `blue-900` | `blue-800` / `blue-300` |
| Planned | `sky-100` | `sky-900` | `sky-800` / `sky-300` |
| In Progress | `amber-100` | `amber-900` | `amber-800` / `amber-300` |
| Completed | `green-100` | `green-900` | `green-800` / `green-300` |
| Cancelled | `red-100` | `red-900` | `red-800` / `red-300` |

**Ribbon** (`tripStatusRibbonColors`, via `getTripStatusRibbonColor`) — a solid fill with
white text, same in both themes:

| Status | Background |
|--------|------------|
| Dream | `purple-700` |
| Planning | `blue-700` |
| Planned | `sky-700` |
| In Progress | `amber-700` |
| Completed | `green-700` |
| Cancelled | `red-700` |

Ribbons use the `-700` step, not `-500`. The label is 10-12px uppercase white text, so it
needs 4.5:1, and at `-500` every one of these failed — In Progress 2.15:1, Completed
2.28:1, Planning 3.68:1, Cancelled 3.76:1, Dream 3.96:1. Keep new status colors at `-700`
or darker whenever the fill carries white text.

---

## Typography

### Font Families

```css
font-display: 'Crimson Pro', serif   /* Headings, trip titles */
font-body: 'Manrope', sans-serif     /* UI text, body content */
```

### Usage Guidelines

| Element | Font | Weight | Size |
|---------|------|--------|------|
| Hero titles | `font-display` | `font-bold` | `text-4xl` to `text-7xl` |
| Card titles | `font-display` | `font-bold` | `text-xl` to `text-2xl` |
| Section headings | `font-body` | `font-semibold` | `text-lg` |
| Body text | `font-body` | `font-normal` | `text-base` |
| Labels | `font-body` | `font-medium` | `text-sm` |
| Captions | `font-body` | `font-normal` | `text-xs` |

### Responsive Trip Titles

Use clamp-based sizing for fluid typography:

```css
.trip-title-hero { font-size: clamp(2rem, 5vw, 3.5rem); }
.trip-title-card { font-size: clamp(1.25rem, 3vw, 1.75rem); }
.trip-title-compact { font-size: clamp(1rem, 2vw, 1.25rem); }
```

### Gradient Text

For emphasis on headings:

```html
<span class="text-gradient">Featured Trip</span>
```

Light mode: `from-primary-500 to-accent-400`
Dark mode: `from-gold to-accent-400`

---

## Spacing & Layout

### Container

Standard page container:

```html
<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
```

### Spacing Scale

Use Tailwind's spacing scale consistently:

| Size | Value | Usage |
|------|-------|-------|
| `gap-2` | 0.5rem | Tight spacing (inline elements) |
| `gap-4` | 1rem | Standard spacing |
| `gap-6` | 1.5rem | Card content, sections |
| `gap-8` | 2rem | Page sections |
| `p-4` | 1rem | Small component padding |
| `p-6` | 1.5rem | Standard card padding |
| `p-8` | 2rem | Large section padding |

### Grid Layouts

Responsive grids for card displays:

```html
<!-- Trip cards grid -->
<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
```

### Border Radius

| Element | Radius |
|---------|--------|
| Buttons | `rounded-xl` |
| Cards | `rounded-2xl` |
| Inputs | `rounded-lg` |
| Badges/chips | `rounded-full` |
| Modals | `rounded-xl` |

---

## Components

### Buttons

**Primary Button** (`.btn-primary`):

```html
<button class="btn-primary">Save Trip</button>
```

- Gradient: `from-primary-600 to-primary-700` (light) / `from-accent-400 to-accent-600` (dark)
- Text: white (light) / `navy-900` (dark)
- Shadow with color-matched glow
- Hover: lift effect (`-translate-y-0.5`) + enhanced shadow
- Dark mode hover: gold glow (`0 0 20px rgba(251,191,36,0.25)`)

The gradient starts at `primary-600`, not `primary-500`, and dark mode puts dark text on
gold rather than white: white on `primary-500` is 3.19:1 and white on `accent-400` is
1.67:1, both under the 4.5:1 this label needs. The current pairs are 5.02:1 (light) and
11.9:1 (dark). See [Color Contrast](#color-contrast).

**Secondary Button** (`.btn-secondary`):

```html
<button class="btn-secondary">Cancel</button>
```

- Light: `bg-parchment` with `text-primary-600` border
- Dark: `bg-navy-800` with `text-gold` border
- Hover: background change + subtle lift

**Danger Button** (`.btn-danger`):

```html
<button class="btn-danger">Delete</button>
```

- Gradient: `from-red-600 to-red-700`
- White text
- Red shadow

### Inputs

**Standard Input** (`.input`):

```html
<input type="text" class="input" placeholder="Trip name" />
```

- Border: `border-primary-100` (light) / `border-gold/20` (dark)
- Background: `bg-white` (light) / `bg-navy-800` (dark)
- Focus: `border-primary-500` / `border-gold` with ring
- Dark mode focus: gold glow effect

**Labels** (`.label`):

```html
<label class="label">Trip Name</label>
<label class="label label-required">Required Field</label>
```

### Form Validation

**Error State** (`.input-error`):

```html
<input type="text" class="input input-error" />
<p class="error-message">This field is required</p>
```

- Red border replaces primary border
- Use with `.error-message` for validation text

**Floating Labels** (`.input-float`, `.label-float`):

```html
<div class="input-group">
  <input type="text" class="input-float" placeholder=" " />
  <label class="label-float">Trip Name</label>
</div>
```

- Label floats up on focus or when input has value
- Requires placeholder=" " for CSS :placeholder-shown detection

**Button Loading State** (`.btn-loading`):

```html
<button class="btn-primary btn-loading">
  <span class="btn-text">Save</span>
  <span class="btn-spinner"><LoadingSpinner.Inline /></span>
</button>
```

### Cards

**Standard Card** (`.card`):

```html
<div class="card">
  <!-- Card content -->
</div>
```

- Light: `bg-white/80` with backdrop blur
- Dark: gradient background with `border-gold/20`
- Hover: `shadow-xl` + border opacity increase
- Dark hover: gold glow

**Interactive Card** (`.card-interactive`):

```html
<div class="card-interactive" onClick={handleClick}>
  <!-- Clickable card content -->
</div>
```

- Same as `.card` with `cursor-pointer`
- Hover: `translate-y` lift effect

### Modals

Use the `Modal` component from `src/components/Modal.tsx`:

```tsx
<Modal
  isOpen={isOpen}
  onClose={onClose}
  title="Edit Trip"
  icon={<EditIcon />}
  size="lg"  // sm, md, lg, xl, 2xl, 4xl, 6xl
>
  {/* Modal content */}
</Modal>
```

- Backdrop: `bg-black/50` with blur
- Body: rounded corners, shadow-2xl
- Header with icon + title + close button
- Optional footer with border-top

### Tabs

Use `TabGroup` component for tabbed navigation:

```tsx
<TabGroup
  tabs={[
    { id: 'details', label: 'Details', count: 0 },
    { id: 'photos', label: 'Photos', count: 24 },
  ]}
  activeTab={activeTab}
  onTabChange={setActiveTab}
/>
```

- Desktop: horizontal tabs with gradient underline
- Mobile: dropdown select
- Active: primary/gold color with animated underline

### Empty States

Use `EmptyState` component (`src/components/EmptyState.tsx`):

```tsx
// With emoji icon
<EmptyState
  icon="🗺️"
  message="No trips yet"
  subMessage="Start planning your first adventure!"
  actionLabel="Create Trip"
  onAction={handleCreate}
/>

// With link action instead of button
<EmptyState
  icon="✈️"
  message="No trips yet"
  actionLabel="Create your first trip"
  actionHref="/trips/new"
/>

// With SVG illustration
<EmptyState
  icon={<EmptyIllustrations.NoPhotos />}
  message="No photos yet"
  subMessage="Upload your first photo"
/>

// Compact inline variant
<EmptyState.Compact icon="📭" message="No items found" />
```

**Available SVG Illustrations** (`EmptyIllustrations`):

- `NoTrips`, `NoPhotos`, `NoActivities`, `NoTransportation`
- `NoLodging`, `NoJournalEntries`, `NoCompanions`, `NoTags`, `NoLocations`

Features:
- Bouncing icon animation (`animate-bounce-slow`)
- Centered layout with backdrop blur
- Optional action button or link
- Compact variant for inline use

### Loading States

**Spinner** (`src/components/LoadingSpinner.tsx`):

```tsx
// Basic spinner with size and color
<LoadingSpinner size="md" color="primary" />

// With accessible label text
<LoadingSpinner size="lg" label="Loading trips..." />

// Full page centered loading
<LoadingSpinner.FullPage message="Loading your data..." />

// Inline spinner for buttons/small areas
<LoadingSpinner.Inline />
```

| Prop | Values | Default |
|------|--------|---------|
| `size` | `'sm'`, `'md'`, `'lg'`, `'xl'` | `'md'` |
| `color` | `'primary'`, `'white'`, `'current'` | `'primary'` |
| `label` | string | undefined |

**Skeleton Loaders** (`src/components/Skeleton.tsx`):

```tsx
// Card skeleton with optional image and custom line count
<SkeletonCard hasImage lines={3} />

// List item with optional icon
<SkeletonListItem hasIcon />

// Form field (label + input)
<SkeletonFormField />

// Text line with custom width
<SkeletonText width="w-2/3" />

// Title/heading skeleton
<SkeletonTitle width="w-1/2" />

// Avatar/image placeholder
<SkeletonAvatar size="md" />

// Grid of skeleton cards
<SkeletonGrid count={6} columns={3} hasImage />
```

Or use the default export for compound component pattern:

```tsx
import Skeleton from '@/components/Skeleton';

<Skeleton.Card lines={3} />
<Skeleton.ListItem />
<Skeleton.FormField />
<Skeleton.Grid count={6} columns={3} />
```

### Floating Action Button

```html
<button class="fab">
  <PlusIcon class="w-6 h-6" />
</button>
```

- Fixed bottom-right position
- 56px circular
- Gradient background
- Scale + glow on hover

---

## Dark Mode

### Implementation

Dark mode uses Tailwind's class-based strategy:

1. `darkMode: 'class'` in `tailwind.config.js`
2. `.dark` class toggled on `<html>` element
3. State managed by Zustand store (`useThemeStore`)
4. Persisted to localStorage

### Pattern

Always pair light/dark classes:

```html
<div class="bg-white dark:bg-navy-800 text-charcoal dark:text-warm-gray">
```

### Key Dark Mode Conventions

| Element | Light | Dark |
|---------|-------|------|
| Page background | `bg-cream` | `bg-gradient-to-br from-navy-900 to-navy-800` |
| Card background | `bg-white/80` | `bg-navy-800/90` |
| Secondary text | `text-slate` or `text-gray-600` | `dark:text-dusk-400` |
| Neutral borders | `border-gray-200` | `dark:border-dusk-700` |
| Primary accent | `text-primary-600` | `text-gold` |
| Borders | `border-primary-100` | `border-gold/20` |
| Shadows | Standard shadows | Gold glow shadows |
| Focus rings | `ring-primary-500` | `ring-gold` |

### Gold Glow Effects

Dark mode uses subtle gold glows for depth:

```css
/* Custom shadow utilities */
shadow-glow-gold-sm: 0 0 15px rgba(251, 191, 36, 0.15)
shadow-glow-gold: 0 0 20px rgba(251, 191, 36, 0.15)
shadow-glow-gold-lg: 0 0 30px rgba(251, 191, 36, 0.2)
```

---

## Animations & Transitions

### Standard Durations

| Duration | Usage |
|----------|-------|
| `duration-200` | Fast micro-interactions |
| `duration-300` | Standard transitions |
| `duration-500` | Emphasis animations |

### Available Animations

| Class | Effect | Duration |
|-------|--------|----------|
| `animate-fade-in` | Fade in + slide up | 0.3s |
| `animate-scale-in` | Scale up + fade | 0.2s |
| `animate-slide-in-right` | Slide from right | 0.3s |
| `animate-slide-in-left` | Slide from left | 0.3s |
| `animate-bounce-slow` | Gentle float | 3s loop |
| `animate-pulse-subtle` | Subtle opacity pulse | 2s loop |
| `animate-spin` | Rotation (loaders) | 1s loop |
| `animate-pulse` | Skeleton loading | built-in |

### Hover Effects

```html
<!-- Lift effect -->
<div class="hover:-translate-y-0.5 transition-transform duration-200">

<!-- Scale effect -->
<div class="hover:scale-110 transition-transform duration-300">

<!-- Combined card hover -->
<div class="hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
```

**Match the transition to what actually changes.** `transition-colors` covers only colour
properties and `transition-shadow` only `box-shadow`; neither covers `transform`. A lift
or shadow declared under one of those does not animate — it snaps, with no warning at
build time. If a hover changes more than colour, use `transition-all`. This caught
`.btn-primary`, `.btn-secondary`, `.btn-danger` and `.card`, all of which declared a lift
they never animated.

### Stagger Delays

For sequential animations:

```css
.stagger-1 { animation-delay: 0.1s; }
.stagger-2 { animation-delay: 0.2s; }
.stagger-3 { animation-delay: 0.3s; }
.stagger-4 { animation-delay: 0.4s; }
.stagger-5 { animation-delay: 0.5s; }
```

### Feedback Animations

**Success Flash** (`.success-flash`):

```html
<div class="card success-flash">Saved successfully!</div>
```

- Green background tint with pulse animation
- Use for successful form submissions

**Error Shake** (`.error-shake`):

```html
<div class="input-group error-shake">...</div>
```

- Horizontal shake animation (0.5s)
- Use for validation errors

**Scroll Highlight** (`.scroll-highlight`):

```html
<div class="card scroll-highlight">Navigated item</div>
```

- Blue pulse glow (light mode) / Gold pulse glow (dark mode)
- 2-second animation for drawing attention to navigated elements
- Respects `prefers-reduced-motion` with static outline fallback

**Additional Animations**:

| Class | Effect |
|-------|--------|
| `animate-fade-in-up` | Fade in + slide up (0.6s) |
| `animate-float` | Gentle floating motion (6s loop) |
| `animate-slide-in` | Slide from left (0.4s) |
| `animate-slide-in-down` | Slide from top (0.3s) |
| `page-enter` | Page transition fade + slide (0.3s) |

---

## Icons

### Icon System

All icons are centralized in `src/components/icons/index.tsx`:

- SVG-based, stroke style (not filled)
- Default size: `w-5 h-5`
- `aria-hidden` by default

### Usage

```tsx
import { MapPinIcon, CalendarIcon, PhotoIcon } from '@/components/icons';

<MapPinIcon className="w-4 h-4 text-primary-500 dark:text-gold" />
```

### Available Icons

| Category | Icons |
|----------|-------|
| Core | `CloseIcon`, `SearchIcon`, `FilterIcon`, `PlusIcon`, `TrashIcon`, `EditIcon` |
| Content | `PhotoIcon`, `MapPinIcon`, `CalendarIcon`, `ChevronRightIcon`, `ChevronDownIcon` |
| Status | `SpinnerIcon` (includes `animate-spin` automatically) |

### Icon Colors

| Context | Light | Dark |
|---------|-------|------|
| Primary action | `text-primary-500` | `text-gold` |
| Secondary | `text-slate` | `text-warm-gray` |
| On colored bg | `text-white` | `text-white` |
| Destructive | `text-red-500` | `text-red-400` |

---

## Responsive Design

### Breakpoints

Using Tailwind's mobile-first breakpoints:

| Breakpoint | Min-width | Usage |
|------------|-----------|-------|
| Default | 0px | Mobile phones |
| `sm:` | 640px | Large phones |
| `md:` | 768px | Tablets |
| `lg:` | 1024px | Laptops |
| `xl:` | 1280px | Desktops |

### Mobile Patterns

```html
<!-- Stack on mobile, side-by-side on desktop -->
<div class="flex flex-col md:flex-row gap-4">

<!-- Hidden on mobile, visible on desktop -->
<div class="hidden md:block">

<!-- Full width on mobile, contained on desktop -->
<div class="w-full md:w-auto">
```

### Component Adaptations

| Component | Mobile | Desktop |
|-----------|--------|---------|
| Navigation | Hamburger + drawer | Horizontal nav |
| Tabs | Dropdown select | Horizontal tabs |
| Pagination | "Page X of Y" | Full page numbers |
| Grids | 1 column | 2-4 columns |

---

## Accessibility

### Touch Targets

Minimum 44x44px for interactive elements on touch devices:

```css
@media (pointer: coarse) {
  .input, button { min-height: 44px; }
}
```

### Focus Indicators

All interactive elements have visible focus states:

```html
<button class="focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50">
```

### Color Contrast

- Body text: Minimum 4.5:1 contrast ratio
- Large text (≥24px, or ≥18.66px bold): Minimum 3:1 contrast ratio
- Interactive elements: Clear visual distinction

Two habits break this repeatedly, and both have in this codebase:

- **White on a mid-tone fill rarely passes.** Against white, the `-500` step of most hues
  lands between 1.8:1 and 4:1 — `amber-500` is 2.15:1, `green-500` 2.28:1, `primary-500`
  3.19:1. For white text on a solid fill, start at `-700`. For gold (`accent-400`,
  1.67:1 against white) use `navy-900` text instead.
- **Opacity on a text colour silently breaks it.** `text-slate` is 4.76:1 on white but
  `text-slate/70` is 2.72:1, and `text-white/80` on `primary-600` drops to 3.80:1. Get
  de-emphasis from size and weight, or pick a lighter token — not from an alpha suffix on
  text that still has to be read.

Both the thresholds and the composited colour matter, so check the rendered pair rather
than the token name: a semi-transparent card over a gradient is not the colour its class
says it is.

### Keyboard Navigation

- All modals trap focus
- ESC key closes modals/dropdowns
- Tab navigation follows logical order

---

## Print Styles

### Printable Itinerary

The timeline export uses print-optimized styles:

```css
@media print {
  /* Hide everything except printable content */
  body > *:not(.print-itinerary-wrapper) { display: none; }

  /* Optimize for paper */
  .print-itinerary { font-size: 11pt; }
  .print-title { font-size: 24pt; }

  /* Prevent page breaks inside items */
  .print-day-item { page-break-inside: avoid; }
}
```

### Print Guidelines

- Use grayscale-friendly colors
- Avoid dark backgrounds
- Ensure adequate contrast
- Set appropriate page breaks
- Test with actual print preview

---

## Utility Classes

### Responsive Typography

```html
<!-- Hero text (3xl to 7xl) -->
<h1 class="text-responsive-hero">Welcome</h1>

<!-- Title text (xl to 3xl) -->
<h2 class="text-responsive-title">Section Title</h2>

<!-- Subtitle text (base to xl) -->
<p class="text-responsive-subtitle">Description</p>
```

### Visual Effects

| Class | Effect |
|-------|--------|
| `.text-gradient` | Gradient text (primary to accent) |
| `.glass` | Glassmorphism with backdrop blur |
| `.shimmer` | Loading shimmer animation |
| `.ripple` | Click ripple effect |

### Scrolling & Layout

| Class | Effect |
|-------|--------|
| `.scrollbar-hide` | Hide scrollbar while keeping scroll functionality |
| `.safe-area-inset-bottom` | Padding for notched devices (iOS) |
| `.safe-area-bottom` | Alias for safe area padding |
| `.safe-area-bottom-nav` | Safe area + nav height padding |

`MobileBottomNav` is `h-16` plus a 2px top border **plus** its own
`.safe-area-inset-bottom`, so anything scrolling beneath it needs that same inset in its
bottom padding. A flat `pb-16` is short by 2px on an ordinary phone and by roughly 36px on
one with a home indicator. `App.tsx` uses
`pb-[calc(4.25rem+env(safe-area-inset-bottom))] md:pb-0`; use that, or
`.safe-area-bottom-nav`, rather than a bare spacing class.

### CSS Variable Utilities

These classes use CSS custom properties for dynamic values:

```html
<!-- Dynamic map height -->
<div class="map-container-dynamic" style="--map-height: 400px">

<!-- Cover photo background -->
<div class="cover-photo-bg" style="--cover-photo-url: url(...)">

<!-- Tag with custom colors -->
<span class="tag-colored" style="--tag-bg-color: #3B82F6; --tag-text-color: #FFF">

<!-- Progress bar -->
<div class="progress-bar" style="--progress-width: 75%">
```

### Accessibility

**Skip Link** (`.skip-link`):

```html
<a href="#main-content" class="skip-link">Skip to main content</a>
```

- Hidden by default, visible on focus
- Allows keyboard users to skip navigation

**Reduced Motion Support**:

All animations respect `prefers-reduced-motion: reduce`:
- Animation durations reduced to near-zero
- Scroll behavior set to auto
- `.scroll-highlight` uses static outline instead of animation

---

## Quick Reference

### CSS Classes Cheat Sheet

**Buttons & Forms**:

| Purpose | Class |
|---------|-------|
| Primary button | `.btn-primary` |
| Secondary button | `.btn-secondary` |
| Danger button | `.btn-danger` |
| Button loading state | `.btn-loading` |
| Form input | `.input` |
| Input error state | `.input-error` |
| Floating input | `.input-float` |
| Form label | `.label` |
| Floating label | `.label-float` |
| Required label | `.label-required` |
| Error message | `.error-message` |

**Layout & Cards**:

| Purpose | Class |
|---------|-------|
| Card | `.card` |
| Interactive card | `.card-interactive` |
| FAB | `.fab` |
| Tab | `.tab` |
| Active tab | `.tab-active` |
| Badge | `.badge` |
| Tooltip | `.tooltip` |
| Tooltip trigger | `.tooltip-trigger` |
| Skip link | `.skip-link` |

**Visual Effects**:

| Purpose | Class |
|---------|-------|
| Gradient text | `.text-gradient` |
| Glass effect | `.glass` |
| Loading shimmer | `.shimmer` |
| Click ripple | `.ripple` |
| Hide scrollbar | `.scrollbar-hide` |

**Animations**:

| Purpose | Class |
|---------|-------|
| Success feedback | `.success-flash` |
| Error shake | `.error-shake` |
| Scroll highlight | `.scroll-highlight` |
| Page transition | `.page-enter` |
| Fade in up | `.animate-fade-in-up` |
| Float | `.animate-float` |
| Slide in | `.animate-slide-in` |
| Slide in down | `.animate-slide-in-down` |

**Responsive Typography**:

| Purpose | Class |
|---------|-------|
| Hero text | `.text-responsive-hero` |
| Title text | `.text-responsive-title` |
| Subtitle text | `.text-responsive-subtitle` |
| Trip hero title | `.trip-title-hero` |
| Trip card title | `.trip-title-card` |
| Trip compact title | `.trip-title-compact` |

### Files Reference

| File | Purpose |
|------|---------|
| `tailwind.config.js` | Color palette, animations, fonts |
| `src/index.css` | Global styles, component classes |
| `src/store/themeStore.ts` | Dark mode state management |
| `src/components/icons/index.tsx` | SVG icon components |
| `src/utils/statusColors.ts` | Status color mappings |
| `src/components/Modal.tsx` | Modal component |
| `src/components/Skeleton.tsx` | Loading skeletons |
| `src/components/LoadingSpinner.tsx` | Spinner component |
| `src/components/EmptyState.tsx` | Empty state component |
| `src/components/TabGroup.tsx` | Tab navigation |
| `src/components/Pagination.tsx` | Pagination controls |
