import { z } from 'zod';

// Backup file format version
// v1.1.0 - Added travelDocuments and tripLanguages
// v1.2.0 - Added tripTypes and tripSeries
// v1.3.0 - Removed plaintext secrets (API keys, SMTP password) from exports
// v1.4.0 - Added savedLinks; ENTITY_TYPES gained PDF_IMPORT and SAVED_LINK
// v1.5.0 - Added customItems and customItemTypes; ENTITY_TYPES gained CUSTOM_ITEM
export const BACKUP_VERSION = '1.5.0';

// =============================================================================
// Shared/Reusable Schemas
// =============================================================================

// Activity category schema (user-defined activity categories)
const ActivityCategorySchema = z.object({
  name: z.string(),
  emoji: z.string().optional(),
});

// Tag schema (trip tags with colors)
const BackupTagSchema = z.object({
  name: z.string(),
  color: z.string().nullable().optional(),
  textColor: z.string().nullable().optional(),
});

// =============================================================================
// Stored upload paths
// =============================================================================

/**
 * Stored file paths in a backup are server-generated at upload time and always
 * take the shape `/uploads/<subdir>/<generated-name>`:
 *
 *   photo.service.ts       -> /uploads/photos/<uuid><ext>, /uploads/videos/<uuid><ext>,
 *                             /uploads/thumbnails/thumb-<uuid>.jpg
 *   tripCoverImage.service -> /uploads/covers/cover-<tripId>-<uuid>.jpg,
 *                             /uploads/covers/thumb-cover-<tripId>-<uuid>.jpg
 *   companion.service.ts   -> /uploads/avatars/companion-<id>-<timestamp>.jpg
 *
 * A backup file is attacker-supplied input, and these values are later joined
 * onto the uploads root and passed to fs.unlink(). Anchoring the accepted shape
 * here stops a poisoned backup from ever persisting a traversal path in the
 * first place (the delete helpers re-check containment as a second layer).
 *
 * The filename segment deliberately excludes `/` and `\`, so `..` cannot form a
 * path segment; a single flat subdirectory is the only structure ever produced.
 */
const UPLOAD_SUBDIRS = ['photos', 'videos', 'thumbnails', 'covers', 'avatars'] as const;
const STORED_UPLOAD_PATH_PATTERN = new RegExp(
  `^/uploads/(?:${UPLOAD_SUBDIRS.join('|')})/[A-Za-z0-9][A-Za-z0-9._-]*$`
);

/**
 * True when `value` matches the server-generated stored-upload convention.
 * Exported so restore.service.ts can re-check just before persisting, keeping
 * the guarantee even if this schema is ever loosened or bypassed.
 */
export function isStoredUploadPath(value: unknown): value is string {
  return typeof value === 'string'
    && STORED_UPLOAD_PATH_PATTERN.test(value)
    && !value.includes('..');
}

/**
 * A stored upload path, or null. Values that do not match the generated-filename
 * convention are rejected outright rather than silently dropped, so a tampered
 * backup fails loudly instead of restoring partially.
 */
const StoredUploadPathSchema = z
  .string()
  .refine(
    (value) => isStoredUploadPath(value),
    {
      message:
        'Invalid stored file path. Expected a server-generated path of the form /uploads/<subdir>/<filename>.',
    }
  )
  .nullable()
  .optional();

// Companion schema (travel companions)
const BackupCompanionSchema = z.object({
  name: z.string(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  relationship: z.string().nullable().optional(),
  isMyself: z.boolean().optional(),
  avatarUrl: StoredUploadPathSchema,
  dietaryPreferences: z.array(z.string()).optional(),
});

// Location category schema
const BackupLocationCategorySchema = z.object({
  name: z.string(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  isDefault: z.boolean().optional(),
});

// Flexible date type that accepts both Date objects and ISO strings
// (Dates from Prisma during backup creation, strings during restore)
const FlexibleDateSchema = z.union([z.string(), z.date()]).nullable().optional();

// Flexible JSON type that accepts Prisma's JsonValue and plain objects
const FlexibleJsonSchema = z.union([
  z.record(z.unknown()),
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.unknown()),
  z.null(),
]).nullable().optional();

// Checklist item schema
const BackupChecklistItemSchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
  isChecked: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().optional(),
  metadata: FlexibleJsonSchema,
  checkedAt: FlexibleDateSchema,
});

// Checklist schema (global checklists)
const BackupChecklistSchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
  type: z.string(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().optional(),
  items: z.array(BackupChecklistItemSchema).optional(),
});

// Travel document types
const DOCUMENT_TYPES = ['PASSPORT', 'VISA', 'ID_CARD', 'GLOBAL_ENTRY', 'VACCINATION'] as const;

// Travel document schema
const BackupTravelDocumentSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  issuingCountry: z.string(),
  documentNumber: z.string().nullable().optional(), // Masked in backups
  issueDate: FlexibleDateSchema, // ISO date string or Date object
  expiryDate: FlexibleDateSchema, // ISO date string or Date object
  name: z.string(),
  notes: z.string().nullable().optional(),
  isPrimary: z.boolean().optional(),
  alertDaysBefore: z.number().optional(),
});

// =============================================================================
// Trip-related Schemas
// =============================================================================

// Base location schema without children (to avoid circular reference type inference issue)
const BackupLocationBaseSchema = z.object({
  id: z.number().optional(), // For EntityLink mapping
  tripId: z.number().optional(),
  parentId: z.number().nullable().optional(),
  name: z.string(),
  address: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  categoryId: z.number().nullable().optional(),
  visitDatetime: z.string().nullable().optional(), // ISO datetime
  visitDurationMinutes: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  openingHours: z.string().nullable().optional(),
  openingHoursSource: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
  category: z.object({
    name: z.string(),
    icon: z.string().nullable().optional(),
    color: z.string().nullable().optional(),
    isDefault: z.boolean().optional(),
  }).nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

// Type for backup location (with optional children)
type BackupLocation = z.infer<typeof BackupLocationBaseSchema> & {
  children?: BackupLocation[];
};

// Location schema within a trip (with recursive children)
const BackupLocationSchema: z.ZodType<BackupLocation> = BackupLocationBaseSchema.extend({
  children: z.lazy(() => z.array(BackupLocationSchema)).optional(),
});

/**
 * Structural type guard for anything Decimal-like (Prisma's Decimal, decimal.js).
 * Narrows without a type assertion: after `'toNumber' in val`, TypeScript types
 * `val.toNumber` as `unknown`, which the typeof check then refines.
 */
function hasToNumber(val: unknown): val is { toNumber(): number } {
  return (
    typeof val === 'object' &&
    val !== null &&
    'toNumber' in val &&
    typeof val.toNumber === 'function'
  );
}

// Flexible coordinate type (accepts Decimal from Prisma or number)
// Prisma Decimal has a toNumber() method, regular numbers work directly
const FlexibleCoordinateSchema = z.preprocess(
  (val) => {
    if (val === null || val === undefined) return val;
    if (typeof val === 'number') return val;
    // Prisma Decimal has toNumber() method
    if (hasToNumber(val)) {
      return val.toNumber();
    }
    // Try parsing string representation
    if (typeof val === 'string') {
      const num = parseFloat(val);
      return isNaN(num) ? val : num;
    }
    return val;
  },
  z.number().nullable().optional()
);

// Photo schema within a trip
const BackupPhotoSchema = z.object({
  id: z.number().optional(), // For EntityLink and album mapping
  source: z.string().optional(), // 'local' or 'immich'
  immichAssetId: z.string().nullable().optional(),
  localPath: StoredUploadPathSchema,
  thumbnailPath: StoredUploadPathSchema,
  caption: z.string().nullable().optional(),
  latitude: FlexibleCoordinateSchema,
  longitude: FlexibleCoordinateSchema,
  takenAt: FlexibleDateSchema, // ISO datetime or Date object
});

// Activity schema within a trip
const BackupActivitySchema = z.object({
  id: z.number().optional(), // For EntityLink mapping
  parentId: z.number().nullable().optional(),
  name: z.string(),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  allDay: z.boolean().optional(),
  startTime: z.string().nullable().optional(), // ISO datetime
  endTime: z.string().nullable().optional(), // ISO datetime
  timezone: z.string().nullable().optional(),
  cost: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  bookingUrl: z.string().nullable().optional(),
  bookingReference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  manualOrder: z.number().nullable().optional(),
});

// Flight tracking schema
const BackupFlightTrackingSchema = z.object({
  flightNumber: z.string().nullable().optional(),
  airlineCode: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  gate: z.string().nullable().optional(),
  terminal: z.string().nullable().optional(),
  baggageClaim: z.string().nullable().optional(),
}).nullable().optional();

// Transportation schema within a trip
const BackupTransportationSchema = z.object({
  id: z.number().optional(), // For EntityLink mapping
  type: z.string(),
  startLocationId: z.number().nullable().optional(),
  startLocationText: z.string().nullable().optional(),
  endLocationId: z.number().nullable().optional(),
  endLocationText: z.string().nullable().optional(),
  scheduledStart: z.string().nullable().optional(), // ISO datetime
  scheduledEnd: z.string().nullable().optional(), // ISO datetime
  startTimezone: z.string().nullable().optional(),
  endTimezone: z.string().nullable().optional(),
  actualStart: z.string().nullable().optional(), // ISO datetime
  actualEnd: z.string().nullable().optional(), // ISO datetime
  company: z.string().nullable().optional(),
  referenceNumber: z.string().nullable().optional(),
  seatNumber: z.string().nullable().optional(),
  bookingReference: z.string().nullable().optional(),
  bookingUrl: z.string().nullable().optional(),
  cost: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  status: z.string().optional(),
  delayMinutes: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  connectionGroupId: z.string().nullable().optional(),
  isAutoGenerated: z.boolean().optional(),
  calculatedDistance: z.number().nullable().optional(),
  calculatedDuration: z.number().nullable().optional(),
  distanceSource: z.string().nullable().optional(),
  flightTracking: BackupFlightTrackingSchema,
});

// Lodging schema within a trip
const BackupLodgingSchema = z.object({
  id: z.number().optional(), // For EntityLink mapping
  type: z.string(),
  name: z.string(),
  address: z.string().nullable().optional(),
  checkInDate: z.string(), // ISO datetime
  checkOutDate: z.string(), // ISO datetime
  timezone: z.string().nullable().optional(),
  confirmationNumber: z.string().nullable().optional(),
  bookingUrl: z.string().nullable().optional(),
  cost: z.number().nullable().optional(),
  currency: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// Booking deadline schema within a trip. Targets reference the OLD ids of the
// lodging/transportation/activity records in the same backup.
const BackupBookingDeadlineSchema = z.object({
  entityType: z.enum(['lodging', 'transportation', 'activity']),
  entityId: z.number(),
  kind: z.string(),
  dueAt: z.string(), // ISO datetime
  note: z.string().nullable().optional(),
  dismissedAt: z.string().nullable().optional(),
});

// Food log entry schema within a trip. activityId/locationId reference the OLD ids
// of records in the same backup; unresolved links are restored as null.
const BackupFoodLogEntrySchema = z.object({
  restaurantName: z.string(),
  dish: z.string(),
  rating: z.number().int().min(1).max(5),
  notes: z.string().nullable().optional(),
  orderAgain: z.boolean().optional(),
  activityId: z.number().nullable().optional(),
  locationId: z.number().nullable().optional(),
});

// Journal entry schema within a trip
const BackupJournalEntrySchema = z.object({
  date: z.string().nullable().optional(), // ISO date
  title: z.string().nullable().optional(),
  content: z.string(),
  entryType: z.string(),
  mood: z.string().nullable().optional(),
  weatherNotes: z.string().nullable().optional(),
});

// Photo album assignment schema
const BackupPhotoAlbumPhotoSchema = z.object({
  photoId: z.number(),
  sortOrder: z.number().optional(),
});

// Photo album schema within a trip
const BackupPhotoAlbumSchema = z.object({
  id: z.number().optional(), // For EntityLink mapping
  name: z.string(),
  description: z.string().nullable().optional(),
  coverPhotoId: z.number().nullable().optional(),
  photos: z.array(BackupPhotoAlbumPhotoSchema).optional(),
});

// Weather data schema within a trip
const BackupWeatherDataSchema = z.object({
  locationId: z.number().nullable().optional(),
  date: z.string(), // ISO date
  temperatureHigh: z.number().nullable().optional(),
  temperatureLow: z.number().nullable().optional(),
  conditions: z.string().nullable().optional(),
  precipitation: z.number().nullable().optional(),
  humidity: z.number().nullable().optional(),
  windSpeed: z.number().nullable().optional(),
});

// Entity link types. Must stay in sync with the Prisma EntityType enum — a
// value missing here does NOT silently drop links of that type: because
// BackupEntityLinkSchema validates via z.enum(ENTITY_TYPES) and
// backup.controller.ts parses with the throwing `.parse()`, an unrecognised
// entity type fails the whole restore with a 400.
const ENTITY_TYPES = ['PHOTO', 'LOCATION', 'ACTIVITY', 'LODGING', 'TRANSPORTATION', 'JOURNAL_ENTRY', 'PHOTO_ALBUM', 'PDF_IMPORT', 'SAVED_LINK', 'CUSTOM_ITEM'] as const;
const LINK_RELATIONSHIPS = ['RELATED', 'TAKEN_AT', 'OCCURRED_AT', 'PART_OF', 'DOCUMENTS', 'FEATURED_IN'] as const;

// Entity link schema within a trip
const BackupEntityLinkSchema = z.object({
  sourceType: z.enum(ENTITY_TYPES),
  sourceId: z.number(),
  targetType: z.enum(ENTITY_TYPES),
  targetId: z.number(),
  relationship: z.enum(LINK_RELATIONSHIPS).optional(),
  sortOrder: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// Trip language schema
const BackupTripLanguageSchema = z.object({
  languageCode: z.string(),
  language: z.string(),
});

// Saved link schema (added in v1.4.0)
const BackupSavedLinkSchema = z.object({
  id: z.number().optional(), // For EntityLink mapping
  url: z.string(),
  title: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  siteName: z.string().nullable().optional(),
  imageUrl: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  source: z.string().optional(),
  metadataStatus: z.string().optional(),
});

// Custom item type schema (user-level registry, added in v1.5.0).
// Referenced by name from BackupCustomItemSchema, following the
// locationCategories/tags convention of storing names for portability.
// `isDefault` is deliberately absent: it is provenance-only metadata that must
// never round-trip, because preserving it is what freezes restored location
// categories (see restore.service.ts).
const BackupCustomItemTypeSchema = z.object({
  name: z.string(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
});

// Custom item schema (added in v1.5.0)
const BackupCustomItemSchema = z.object({
  id: z.number().optional(), // For EntityLink mapping
  typeName: z.string().nullable().optional(),
  name: z.string(),
  notes: z.string().nullable().optional(),
  allDay: z.boolean().optional(),
  startTime: FlexibleDateSchema,
  endTime: FlexibleDateSchema,
  timezone: z.string().nullable().optional(),
  locationId: z.number().nullable().optional(),
  cost: z.union([z.number(), z.string()]).nullable().optional(),
  currency: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  confirmationNumber: z.string().nullable().optional(),
});

// Trip checklist schema (trip-specific checklists with items)
const BackupTripChecklistSchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
  type: z.string(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().optional(),
  items: z.array(BackupChecklistItemSchema).optional(),
});

// Complete trip schema
const BackupTripSchema = z.object({
  // Trip basic info
  title: z.string(),
  description: z.string().nullable().optional(),
  startDate: z.string().nullable().optional(), // ISO date
  endDate: z.string().nullable().optional(), // ISO date
  timezone: z.string().nullable().optional(),
  status: z.string(),
  privacyLevel: z.string(),
  coverPhotoId: z.number().nullable().optional(),
  // Uploaded cover image paths (added in v1.3.0) — file paths only, like photos
  coverImagePath: StoredUploadPathSchema,
  coverImageThumbnailPath: StoredUploadPathSchema,
  bannerPhotoId: z.number().nullable().optional(),
  addToPlacesVisited: z.boolean().optional(),
  // Trip type (added in v1.2.0)
  tripType: z.string().nullable().optional(),
  tripTypeEmoji: z.string().nullable().optional(),
  // Series assignment (added in v1.2.0)
  seriesId: z.number().nullable().optional(),
  seriesOrder: z.number().nullable().optional(),

  // Related entities
  locations: z.array(BackupLocationSchema).optional(),
  photos: z.array(BackupPhotoSchema).optional(),
  activities: z.array(BackupActivitySchema).optional(),
  transportation: z.array(BackupTransportationSchema).optional(),
  lodging: z.array(BackupLodgingSchema).optional(),
  bookingDeadlines: z.array(BackupBookingDeadlineSchema).optional(),
  foodLogEntries: z.array(BackupFoodLogEntrySchema).optional(),
  journalEntries: z.array(BackupJournalEntrySchema).optional(),
  photoAlbums: z.array(BackupPhotoAlbumSchema).optional(),
  weatherData: z.array(BackupWeatherDataSchema).optional(),

  // Many-to-many relationships (stored as names for portability)
  tags: z.array(z.string()).optional(),
  companions: z.array(z.string()).optional(),

  // Trip-specific checklists
  checklists: z.array(BackupTripChecklistSchema).optional(),

  // Entity links
  entityLinks: z.array(BackupEntityLinkSchema).optional(),

  // Trip languages (added in v1.1.0)
  tripLanguages: z.array(BackupTripLanguageSchema).optional(),

  // Saved links (added in v1.4.0)
  savedLinks: z.array(BackupSavedLinkSchema).optional(),

  // Custom items (added in v1.5.0)
  customItems: z.array(BackupCustomItemSchema).optional(),
});

// =============================================================================
// Main Backup Data Schema
// =============================================================================

// Backup data structure schema
export const BackupDataSchema = z.object({
  version: z.string(),
  exportDate: z.string(), // ISO 8601 date string
  user: z.object({
    username: z.string(),
    email: z.string(),
    timezone: z.string().nullable(),
    activityCategories: z.array(ActivityCategorySchema),
    tripTypes: z.array(z.object({
      name: z.string(),
      emoji: z.string().optional(),
    })).optional(),
    immichApiUrl: z.string().nullable(),
    // Secret fields are NEVER serialized as plaintext in v1.3.0+ backups.
    // We accept the legacy plaintext shape (z.string().nullable()) for backward
    // compatibility when restoring older backups, but new exports always write null.
    immichApiKey: z.string().nullable(),
    weatherApiKey: z.string().nullable(),
    aviationstackApiKey: z.string().nullable().optional(),
    openrouteserviceApiKey: z.string().nullable().optional(),
    llmApiKey: z.string().nullable().optional(),
    llmBaseUrl: z.string().nullable().optional(),
    llmModel: z.string().nullable().optional(),
    // SMTP secret (added to type in v1.3.0); plaintext only present in legacy backups
    smtpPassword: z.string().nullable().optional(),
  }),
  tags: z.array(BackupTagSchema),
  companions: z.array(BackupCompanionSchema),
  locationCategories: z.array(BackupLocationCategorySchema),
  // Custom item type registry (added in v1.5.0)
  customItemTypes: z.array(BackupCustomItemTypeSchema).optional(),
  checklists: z.array(BackupChecklistSchema),
  // Travel documents (added in v1.1.0)
  travelDocuments: z.array(BackupTravelDocumentSchema).optional(),
  // Trip series (added in v1.2.0)
  tripSeries: z.array(z.object({
    id: z.number(),
    name: z.string(),
    description: z.string().nullable().optional(),
  })).optional(),
  trips: z.array(BackupTripSchema),
});

export type BackupData = z.infer<typeof BackupDataSchema>;

// Export individual schema types for use in services
export type BackupPhoto = z.infer<typeof BackupPhotoSchema>;
export type BackupTag = z.infer<typeof BackupTagSchema>;
export type BackupCompanion = z.infer<typeof BackupCompanionSchema>;
export type BackupLocationCategory = z.infer<typeof BackupLocationCategorySchema>;
export type BackupChecklist = z.infer<typeof BackupChecklistSchema>;
export type BackupChecklistItem = z.infer<typeof BackupChecklistItemSchema>;
export type BackupTravelDocument = z.infer<typeof BackupTravelDocumentSchema>;
export type BackupTrip = z.infer<typeof BackupTripSchema>;
export type BackupActivity = z.infer<typeof BackupActivitySchema>;
export type BackupTransportation = z.infer<typeof BackupTransportationSchema>;
export type BackupLodging = z.infer<typeof BackupLodgingSchema>;
export type BackupJournalEntry = z.infer<typeof BackupJournalEntrySchema>;
export type BackupPhotoAlbum = z.infer<typeof BackupPhotoAlbumSchema>;
export type BackupWeatherData = z.infer<typeof BackupWeatherDataSchema>;
export type BackupEntityLink = z.infer<typeof BackupEntityLinkSchema>;
export type BackupTripLanguage = z.infer<typeof BackupTripLanguageSchema>;
export type BackupSavedLink = z.infer<typeof BackupSavedLinkSchema>;
export type BackupCustomItem = z.infer<typeof BackupCustomItemSchema>;
export type BackupCustomItemType = z.infer<typeof BackupCustomItemTypeSchema>;

// Response types
export const BackupInfoResponseSchema = z.object({
  hasBackup: z.boolean(),
  lastBackupDate: z.string().nullable(),
  backupSize: z.number().nullable(),
});

export type BackupInfoResponse = z.infer<typeof BackupInfoResponseSchema>;

// Restore options
export const RestoreOptionsSchema = z.object({
  clearExistingData: z.boolean().default(true),
  importPhotos: z.boolean().default(true),
});

export type RestoreOptions = z.infer<typeof RestoreOptionsSchema>;

// Progress callback type
export type ProgressCallback = (progress: number, message: string) => void;
