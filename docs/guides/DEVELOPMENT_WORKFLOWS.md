# Development Workflows

This guide covers all feature-specific development workflows for the Travel Life application. For general project setup, commands, and architecture overview, see [CLAUDE.md](../../CLAUDE.md).

## Adding a New Feature

The authoritative conventions and copy-paste checklists are in
[CODE_CONVENTIONS.md](../architecture/CODE_CONVENTIONS.md) (sections 3 and 17). In short:

1. **Update Database Schema**: Modify `backend/prisma/schema.prisma`
2. **Create Migration**: `cd backend && npx prisma migrate dev --name <descriptive_name>` (also regenerates the client). Never edit an existing migration file.
3. **Generate Types** (if only the client is stale): `npm run prisma:generate`
4. **Backend Implementation**:
   - Create types in `src/types/<feature>.types.ts` (Zod schemas; create: optional fields, update: `.nullable().optional()`)
   - Create service in `src/services/<feature>.service.ts` - a singleton with `userId` as the first parameter and a permission check (`verifyTripAccessWithPermission`) on the first line; wrap Decimal output with `convertDecimals`
   - Use `buildConditionalUpdateData` (see below) instead of `if (x !== undefined)` chains for updates
   - Create controller in `src/controllers/<feature>.controller.ts` as a declarative `createCrudController({ service, handlers })` (see below); hand-write handlers only for uploads, streaming and similar
   - Create routes in `src/routes/<feature>.routes.ts` with `authenticate` and an `@openapi` block
   - Mount the router in `src/index.ts`
   - Add a test file with an ID header and an access-control case (see the [Testing Guide](TESTING_GUIDE.md))
   - Run `npm run build:strict` in `backend/`
5. **Frontend Implementation**:
   - Create TypeScript types in `src/types/<feature>.ts` (mirror the unwrapped payload)
   - Create service in `src/services/<feature>.service.ts` (named + default export; components never call `axios` directly)
   - Create components/pages as needed, using TanStack Query (`[resource, tripId]` keys) or `useManagerCRUD` for managers, and call `onUpdate?.()` plus `invalidateQueries` after mutations
   - **Follow the Style Guide** for all UI components (see below)
   - Run `npm run lint` and `npm run build:strict` in `frontend/`

### Controllers: `createCrudController`

```typescript
// controllers/expense.controller.ts
import { createCrudController } from '../prisma/crudHelpers';
import { parseId } from '../http/parseId';

export const expenseController = createCrudController({
  service: expenseService,
  handlers: {
    createExpense: {
      method: 'createExpense',
      statusCode: 201,                 // omit for 200
      bodySchema: createExpenseSchema, // omit when there is no body
      buildArgs: (userId, req, body) => [userId, parseId(req.params.tripId, 'tripId'), body],
    },
  },
});
```

Always use `parseId(value, name)` for path params, never `Number()` or `parseInt`.

### Updates: `buildConditionalUpdateData`

`buildConditionalUpdateData(data, ...)` from `backend/src/services/_shared/prismaUpdateData.ts`
builds a Prisma update object containing only the fields the client sent (it skips `undefined`
and converts `''` to `null` by default), with per-field `transformers`. Use `tripDateTransformer`
for `@db.Date` columns. See CODE_CONVENTIONS.md section 6 for the call shape.

## Working with UI Components

**IMPORTANT: Always consult the Style Guide when creating or modifying UI components.**

Before writing any frontend UI code, read [docs/architecture/STYLE_GUIDE.md](../architecture/STYLE_GUIDE.md) to ensure consistency with the design system.

**Mandatory Style Guide Usage**:

1. **Colors**: Use the Compass Gold palette (`primary-*`, `accent-*`, `gold`) - never hardcode hex values
2. **Typography**: Use `font-display` (Crimson Pro) for headings, `font-body` (Manrope) for text
3. **Components**: Use existing CSS classes (`.btn-primary`, `.card`, `.input`, etc.) before creating custom styles
4. **Dark Mode**: Always pair light/dark classes (e.g., `bg-white dark:bg-navy-800`)
5. **Animations**: Use defined animations (`animate-fade-in`, `animate-scale-in`, etc.)
6. **Accessibility**: Follow touch target sizes (44x44px), focus indicators, and reduced motion support

**Quick Reference - Common Classes**:

| Need | Use |
|------|-----|
| Primary button | `.btn-primary` |
| Secondary button | `.btn-secondary` |
| Form input | `.input` |
| Card container | `.card` or `.card-interactive` |
| Loading spinner | `<LoadingSpinner />` component |
| Empty state | `<EmptyState />` component |
| Skeleton loading | `<SkeletonCard />`, `<SkeletonGrid />` |

**Key Style Guide Sections**:

- **Color System**: Primary colors, status colors, dark mode colors
- **Components**: Buttons, inputs, cards, modals, tabs, empty states, loading states
- **Animations**: Hover effects, feedback animations, stagger delays
- **Utility Classes**: Responsive typography, visual effects, CSS variable utilities

See the full [STYLE_GUIDE.md](../architecture/STYLE_GUIDE.md) for complete documentation including code examples.

## Database Changes

**Always create migrations for schema changes** (never edit migration files):

```bash
cd backend
npx prisma migrate dev --name descriptive_migration_name
npx prisma generate
```

In Docker: `docker exec -it travel-life-backend npx prisma migrate dev`. In production use
`prisma migrate deploy`.

**Reset database** (WARNING: deletes all data):

```bash
cd backend
npx prisma migrate reset
```

**View database in GUI**:

```bash
cd backend
npm run prisma:studio
```

## Working with Authentication

**Protected Backend Routes**:

1. Import middleware: `import { authenticate } from '../middleware/auth';`
2. Apply to routes: `router.use(authenticate);` (or per route: `router.get('/protected', authenticate, controller.method);`)
3. Access the user id with `requireUserId(req)` from `backend/src/auth/controllerHelpers.ts`. `createCrudController` does this for you and passes `userId` as the first `buildArgs` argument.

**Frontend Authentication**:

- Auth state managed by `useAuthStore` (Zustand)
- Token refresh handled automatically by axios interceptors
- Protected routes should check `isAuthenticated` state

## Working with Entity Linking

The Entity Linking system (v3.0.0) provides a unified way to connect any trip entity to any other entity.

**Backend - Creating Links** (`tripId` is part of the data object, not a separate argument):

```typescript
// Single link
await entityLinkService.createLink(userId, {
  tripId,
  sourceType: 'PHOTO',
  sourceId: photoId,
  targetType: 'LOCATION',
  targetId: locationId,
  relationship: 'TAKEN_AT' // Auto-detected if omitted
});

// Bulk link (one source to many targets)
await entityLinkService.bulkCreateLinks(userId, {
  tripId,
  sourceType: 'PHOTO_ALBUM',
  sourceId: albumId,
  targets: [
    { targetType: 'LOCATION', targetId: loc1Id },
    { targetType: 'LOCATION', targetId: loc2Id }
  ]
});
```

**Backend - Querying Links**:

```typescript
// Get all links for an entity (bidirectional): { linksFrom, linksTo, ... }
const links = await entityLinkService.getAllLinksForEntity(userId, tripId, 'PHOTO', photoId);

// Get trip-wide link summary (for UI badges)
const summary = await entityLinkService.getTripLinkSummary(userId, tripId);
```

**Frontend - UI Components**:

```typescript
// LinkButton: shows the count badge from the trip link summary and opens the panel itself
<LinkButton
  tripId={tripId}
  entityType="PHOTO"
  entityId={photo.id}
  linkSummary={linkSummary}
  onUpdate={refetchLinks}
/>

// LinkPanel for viewing/managing links (rendered by LinkButton; use directly if needed)
<LinkPanel
  tripId={tripId}
  entityType="PHOTO"
  entityId={photo.id}
  onClose={() => setShowLinkPanel(false)}
  onUpdate={refetchLinks}
/>
```

**Supported Entity Types**:

- `PHOTO`, `LOCATION`, `ACTIVITY`, `LODGING`, `TRANSPORTATION`, `JOURNAL_ENTRY`, `PHOTO_ALBUM`, `PDF_IMPORT`, `SAVED_LINK`, `CUSTOM_ITEM` (the Prisma `EntityType` enum)

When deleting an entity that can be linked, clean up its links by deleting through `deleteEntity` / `bulkDeleteEntities` from `backend/src/prisma/crudHelpers.ts` (they verify permission, remove orphaned `EntityLink` rows and run in a transaction) rather than calling `prisma.x.delete()` directly.

**Relationship Types** (auto-detected when appropriate):

- `RELATED` - Generic relationship
- `TAKEN_AT` - Photo taken at location
- `OCCURRED_AT` - Activity/event at location
- `PART_OF` - Sub-item or nested element
- `DOCUMENTS` - Journal entry about item
- `FEATURED_IN` - Included in album/journal

**Benefits**:

- No need to create albums just to link photos to locations
- Albums can link to multiple locations (not restricted to one)
- Consistent API and UI patterns across all entity types
- Bidirectional discovery (see what's linked FROM and TO any entity)

See [docs/development/IMPLEMENTATION_STATUS.md](../development/IMPLEMENTATION_STATUS.md) for complete documentation.

## Working with Timeline and Printable Itinerary

**Timeline Features**:

The Timeline component displays all trip events chronologically with dual timezone support (trip timezone + home timezone).

**Printable Itinerary (Added v4.0.1)**:

- Export button in Timeline component generates print-ready itinerary document
- Uses `PrintableItinerary` component (`frontend/src/components/timeline/PrintableItinerary.tsx`)
- Renders in hidden div, opens print dialog, cleans up automatically
- Day-by-day breakdown with all events (transportation, lodging, activities, locations)
- Includes unscheduled items section at the end
- Print-optimized CSS in `src/index.css` with `@media print` styles
- Events grouped by date with formatted times and timezone information

**Implementation Pattern**:

```typescript
// Create ref for printable content
const printableRef = useRef<HTMLDivElement>(null);

// Render hidden printable component
<div style={{ display: 'none' }}>
  <PrintableItinerary
    ref={printableRef}
    tripTitle={trip.title}
    dayGroups={dayGroups}
    unscheduled={unscheduledData}
  />
</div>

// Print handler
const handlePrint = () => {
  const printWindow = window.open('', '', 'width=800,height=600');
  // Copy styles and content, trigger print dialog
};
```

## Working with Album Pagination

**Paged Pagination (Added v4.0.1)**:

Album views use true paged pagination instead of infinite scroll to prevent memory issues with large albums.

**Key Components**:

- `usePagedPagination` hook (`frontend/src/hooks/usePagedPagination.ts`) - Replaces items on page change (not accumulative)
- `Pagination` component (`frontend/src/components/Pagination.tsx`) - Page number navigation UI

**Usage Pattern**:

```typescript
const {
  items,
  total,
  currentPage,
  totalPages,
  loading,
  hasNextPage,
  hasPreviousPage,
  goToPage,
  nextPage,
  previousPage,
  refresh
} = usePagedPagination(
  async (skip, take) => {
    const result = await albumService.getAlbumPhotos(albumId, skip, take);
    return {
      items: result.photos,
      total: result.total,
      hasMore: result.hasMore
    };
  },
  { pageSize: 40 }
);

// Render pagination controls
<Pagination
  currentPage={currentPage}
  totalPages={totalPages}
  onPageChange={goToPage}
  hasNext={hasNextPage}
  hasPrevious={hasPreviousPage}
/>
```

**Benefits**:

- Only one page of items in memory at a time (40 photos per page for albums, 30 for global album list)
- Prevents browser memory issues with 1000+ photo albums
- Better UX with page numbers and direct page navigation
- Replaces accumulative "Load More" pattern from old `usePagination` hook

## Working with Checklists

The Checklist system allows users to create and manage trip-specific checklists with auto-population of defaults.

**Backend - Checklist Service**:

```typescript
// Create a checklist for a trip (tripId is part of the data object)
await checklistService.createChecklist(userId, {
  tripId,
  name: 'Packing List',
  category: 'PACKING',
  items: [
    { text: 'Passport', isCompleted: false },
    { text: 'Chargers', isCompleted: false }
  ]
});

// Initialize default checklists for the user
await checklistService.initializeDefaultChecklists(userId);
```

**Frontend - ChecklistManager Component**:

```typescript
<ChecklistManager
  tripId={tripId}
  onUpdate={() => refetchTrip()}
/>
```

**Checklist Categories**:

- `PACKING` - Items to pack
- `DOCUMENTS` - Travel documents
- `RESERVATIONS` - Booking confirmations
- `CUSTOM` - User-defined lists

## Working with Trip Health Check

The Trip Health Check system automatically validates trips and identifies potential issues.

**Validation Categories**:

| Category | What It Checks |
|----------|----------------|
| SCHEDULE | Overlapping activities, impossible timing |
| ACCOMMODATIONS | Missing lodging for trip dates |
| TRANSPORTATION | Gaps between segments, missing connections |
| COMPLETENESS | Missing required information |

**Frontend - TripHealthCheck Component**:

```typescript
<TripHealthCheck
  tripId={tripId}
  onIssueClick={(issue) => navigateToEntity(issue)}
/>
```

**Issue Dismissal**:

Users can dismiss known issues (e.g., "staying with friends" when no lodging is booked). Dismissed issues are stored in `DismissedValidationIssue` table and don't reappear.

## Working with Backup & Restore

The Backup & Restore system enables full data export and import with relationship preservation.

**Creating a Backup**:

```typescript
// Backend - Create backup
const backup = await backupService.createBackup(userId);
// Returns JSON with all user data, photos metadata, relationships

// Frontend - Download backup
const blob = await backupService.downloadBackup();
saveAs(blob, `travel-life-backup-${date}.json`);
```

**Restoring from Backup**:

```typescript
// Two modes:
// 1. Clear existing data and restore (clean slate)
// 2. Merge with existing data (adds new, skips duplicates)

await restoreService.restore(userId, backupData, {
  clearExisting: false, // true = replace all, false = merge
});
```

**What's Included in Backups**:

- All trips with full details
- Locations, activities, transportation, lodging
- Journal entries with photo/location links
- Photo metadata (not actual files)
- Tags, companions, checklists
- Entity links
- User settings and preferences

## Working with Trip Collaboration

The Collaboration system allows sharing trips with other users with permission levels.

**Permission Levels**:

| Level | Capabilities |
|-------|--------------|
| VIEW | Read-only access to trip details |
| EDIT | Add/edit locations, activities, photos, etc. |
| ADMIN | Full access including collaborator management |

**Backend - Collaboration Service**:

```typescript
// Invite a collaborator by email
await collaborationService.sendInvitation(userId, tripId, {
  email: 'friend@example.com',
  permissionLevel: 'edit'
});

// Accept an invitation (takes the numeric invitation ID, not a token)
await collaborationService.acceptInvitation(userId, invitationId);

// Update collaborator permission
await collaborationService.updateCollaborator(userId, tripId, collaboratorUserId, {
  permissionLevel: 'admin'
});
```

**Frontend - CollaboratorsManager Component**:

```typescript
<CollaboratorsManager
  tripId={tripId}
  isOwner={trip.userId === currentUserId}
  onUpdate={() => refetchTrip()}
/>
```

## Working with Global Search

Global Search enables cross-entity searching with autocomplete, accessible via Ctrl+K (Cmd+K on Mac).

**Search Scope**:

- Trips (title, description, notes)
- Locations (name, address, notes)
- Photos (filename, description)
- Journal entries (title, content)
- Activities (name, description)

**Frontend - GlobalSearch Component**:

```typescript
// Automatically available via keyboard shortcut
// Or trigger programmatically:
<GlobalSearch
  isOpen={searchOpen}
  onClose={() => setSearchOpen(false)}
  onSelect={(result) => navigateToResult(result)}
/>
```

## Working with Batch Operations

Batch Operations allow multi-select mode for bulk actions on entities.

**Supported Entities**:

- Activities
- Locations
- Transportation
- Lodging
- Photos

**Frontend - Batch Selection Pattern**:

```typescript
const {
  selectedIds,
  toggleSelection,
  selectAll,
  clearSelection,
  isSelected,
  selectionCount
} = useBulkSelection<string>();

// Render selection checkboxes
<input
  type="checkbox"
  checked={isSelected(item.id)}
  onChange={() => toggleSelection(item.id)}
/>

// Bulk action bar appears when items selected
{selectionCount > 0 && (
  <BulkActionBar
    count={selectionCount}
    onDelete={() => handleBulkDelete(selectedIds)}
    onEdit={() => openBulkEditModal(selectedIds)}
    onClear={clearSelection}
  />
)}
```

## Working with Auto-Save Drafts

Auto-Save Drafts prevents data loss by automatically saving form state to localStorage.

**Frontend - useAutoSaveDraft Hook**:

```typescript
const {
  draftExists,
  restoreDraft,
  clearDraft,
  saveDraft
} = useAutoSaveDraft({
  key: `trip-form-${tripId}`,
  data: formData,
  interval: 5000, // Save every 5 seconds
});

// Show restore prompt if draft exists
{draftExists && (
  <div className="bg-amber-50 p-3 rounded">
    <p>You have an unsaved draft. Would you like to restore it?</p>
    <button onClick={restoreDraft}>Restore</button>
    <button onClick={clearDraft}>Discard</button>
  </div>
)}

// Clear draft on successful save
const handleSubmit = async () => {
  await service.save(formData);
  clearDraft();
};
```
