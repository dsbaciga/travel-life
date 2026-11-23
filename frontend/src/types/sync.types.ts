/**
 * Sync Conflict Types for Travel Life PWA
 *
 * These types define the structures used for handling synchronization conflicts
 * that occur when data is modified both offline and on the server.
 */

// ============================================
// ENTITY TYPES FOR SYNC
// ============================================

/**
 * Entity types that can have sync conflicts.
 * Matches the entity types used in offline storage.
 */
export type SyncConflictEntityType =
  | 'TRIP'
  | 'LOCATION'
  | 'ACTIVITY'
  | 'TRANSPORTATION'
  | 'LODGING'
  | 'JOURNAL'
  | 'CHECKLIST_ITEM';

/**
 * Human-readable labels for entity types
 */
export const ENTITY_TYPE_LABELS: Record<SyncConflictEntityType, string> = {
  TRIP: 'Trip',
  LOCATION: 'Location',
  ACTIVITY: 'Activity',
  TRANSPORTATION: 'Transport',
  LODGING: 'Stay',
  JOURNAL: 'Journal Entry',
  CHECKLIST_ITEM: 'Checklist Item',
};

/**
 * Icon emoji for each entity type
 */
export const ENTITY_TYPE_ICONS: Record<SyncConflictEntityType, string> = {
  TRIP: 'airplane',
  LOCATION: 'map-pin',
  ACTIVITY: 'calendar',
  TRANSPORTATION: 'car',
  LODGING: 'home',
  JOURNAL: 'book-open',
  CHECKLIST_ITEM: 'check-square',
};

// ============================================
// CONFLICT RESOLUTION
// ============================================

/**
 * How to resolve a sync conflict.
 */
export type ConflictResolution = 'keep-local' | 'keep-server' | 'merge';

/**
 * Labels for conflict resolution options
 */
export const RESOLUTION_LABELS: Record<ConflictResolution, string> = {
  'keep-local': 'Keep my changes',
  'keep-server': 'Use Server Version',
  merge: 'Merge Changes',
};

/**
 * Descriptions for conflict resolution options
 */
export const RESOLUTION_DESCRIPTIONS: Record<ConflictResolution, string> = {
  'keep-local': 'Your offline changes will overwrite the server version',
  'keep-server': 'Server changes will overwrite your offline edits',
  merge: 'Choose which value to keep for each changed field',
};

// ============================================
// SYNC CONFLICT
// ============================================

/**
 * Represents a data conflict between local and server versions.
 * Occurs when the same entity was modified both locally (offline) and on the server.
 */
export interface SyncConflict {
  /** Auto-incremented ID in IndexedDB */
  id: number;
  /** Type of entity with conflict */
  entityType: SyncConflictEntityType;
  /** Entity ID with conflict */
  entityId: string;
  /** Local version of the data (what user modified offline) */
  localData: Record<string, unknown>;
  /** Server version of the data (what was on the server) */
  serverData: Record<string, unknown>;
  /** Unix timestamp of local modification */
  localTimestamp: number;
  /** Unix timestamp of server modification */
  serverTimestamp: number;
  /** When the conflict was detected */
  conflictDetectedAt: number;
}

// ============================================
// FIELD DIFF
// ============================================

/**
 * Represents a difference in a single field between local and server versions.
 */
export interface FieldDiff {
  /** Field name/key */
  field: string;
  /** Display label for the field */
  label: string;
  /** Local value */
  localValue: unknown;
  /** Server value */
  serverValue: unknown;
  /** Which value the user has selected (for merge mode) */
  selectedSource?: 'local' | 'server';
}

/**
 * Fields that should be excluded from diff display (metadata fields)
 */
export const EXCLUDED_DIFF_FIELDS = [
  'id',
  'tripId',
  'userId',
  'createdAt',
  'updatedAt',
  'version',
  'lastSync',
];

/**
 * Field labels for common entity fields
 */
export const FIELD_LABELS: Record<string, string> = {
  // Trip fields
  title: 'Title',
  description: 'Description',
  startDate: 'Start Date',
  endDate: 'End Date',
  status: 'Status',
  coverPhoto: 'Cover Photo',
  timezone: 'Timezone',
  notes: 'Notes',

  // Location fields
  name: 'Name',
  address: 'Address',
  latitude: 'Latitude',
  longitude: 'Longitude',
  category: 'Category',
  visitDate: 'Visit Date',
  locationArrivalTime: 'Arrival Time',
  locationDepartureTime: 'Departure Time',
  duration: 'Duration',
  rating: 'Rating',
  isFavorite: 'Favorite',

  // Activity fields
  type: 'Type',
  date: 'Date',
  time: 'Time',
  endTime: 'End Time',
  cost: 'Cost',
  currency: 'Currency',
  bookingReference: 'Booking Reference',
  bookingUrl: 'Booking URL',
  isBooked: 'Booked',
  isCompleted: 'Completed',

  // Transportation fields
  transportationType: 'Type',
  departureLocation: 'Departure Location',
  arrivalLocation: 'Arrival Location',
  departureTime: 'Departure Time',
  arrivalTime: 'Arrival Time',
  departureTimezone: 'Departure Timezone',
  arrivalTimezone: 'Arrival Timezone',
  carrier: 'Carrier',
  flightNumber: 'Flight Number',
  trainNumber: 'Train Number',
  busNumber: 'Bus Number',
  seatNumber: 'Seat Number',
  confirmationNumber: 'Confirmation Number',

  // Lodging fields
  lodgingType: 'Type',
  checkInDate: 'Check-in Date',
  checkOutDate: 'Check-out Date',
  checkInTime: 'Check-in Time',
  checkOutTime: 'Check-out Time',
  roomNumber: 'Room Number',
  reservationNumber: 'Reservation Number',
  contactPhone: 'Phone',
  contactEmail: 'Email',
  website: 'Website',

  // Journal fields
  content: 'Content',
  mood: 'Mood',
  weather: 'Weather',
  entryType: 'Entry Type',

  // Checklist item fields
  text: 'Text',
  isChecked: 'Checked',
  dueDate: 'Due Date',
  priority: 'Priority',
};

// ============================================
// MERGE DATA
// ============================================

/**
 * Result of merging conflict data field by field.
 */
export interface MergedData {
  /** The merged data object */
  data: Record<string, unknown>;
  /** Fields that were taken from local */
  fromLocal: string[];
  /** Fields that were taken from server */
  fromServer: string[];
}

// ============================================
// CONFLICT RESOLUTION RESULT
// ============================================

/**
 * Result of resolving a conflict.
 */
export interface ConflictResolutionResult {
  /** The conflict that was resolved */
  conflictId: number;
  /** How it was resolved */
  resolution: ConflictResolution;
  /** The final data to use (for merge, or the chosen version) */
  resolvedData: Record<string, unknown>;
  /** Unix timestamp when resolved */
  resolvedAt: number;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get a human-readable label for a field name.
 */
export function getFieldLabel(field: string): string {
  return FIELD_LABELS[field] || formatFieldName(field);
}

/**
 * Format a camelCase or snake_case field name as a readable label.
 */
export function formatFieldName(field: string): string {
  // Handle camelCase
  const spacedCamel = field.replace(/([A-Z])/g, ' $1');
  // Handle snake_case
  const spacedSnake = spacedCamel.replace(/_/g, ' ');
  // Capitalize first letter of each word
  return spacedSnake
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ')
    .trim();
}

/**
 * Format a value for display in the conflict UI.
 */
export function formatValueForDisplay(value: unknown): string {
  if (value === null || value === undefined) {
    return '(empty)';
  }

  if (typeof value === 'boolean') {
    return value ? 'Yes' : 'No';
  }

  if (typeof value === 'number') {
    return value.toLocaleString();
  }

  if (value instanceof Date) {
    return value.toLocaleString();
  }

  if (typeof value === 'string') {
    // Check if it looks like a date
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          // Check if it has time component
          if (value.includes('T')) {
            return date.toLocaleString();
          }
          return date.toLocaleDateString();
        }
      } catch {
        // Not a valid date, return as-is
      }
    }
    // Truncate long strings
    if (value.length > 100) {
      return value.substring(0, 100) + '...';
    }
    return value;
  }

  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }

  if (typeof value === 'object') {
    return JSON.stringify(value, null, 2);
  }

  return String(value);
}

/**
 * Check if two values are different (for determining which fields have conflicts).
 */
export function valuesAreDifferent(a: unknown, b: unknown): boolean {
  // Handle null/undefined
  if (a === null || a === undefined) {
    return b !== null && b !== undefined;
  }
  if (b === null || b === undefined) {
    return true;
  }

  // Compare by JSON stringification for deep comparison
  return JSON.stringify(a) !== JSON.stringify(b);
}

/**
 * Get the differences between local and server data.
 */
export function getFieldDiffs(
  localData: Record<string, unknown>,
  serverData: Record<string, unknown>
): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  const allKeys = new Set([...Object.keys(localData), ...Object.keys(serverData)]);

  for (const key of allKeys) {
    // Skip excluded fields
    if (EXCLUDED_DIFF_FIELDS.includes(key)) {
      continue;
    }

    const localValue = localData[key];
    const serverValue = serverData[key];

    if (valuesAreDifferent(localValue, serverValue)) {
      diffs.push({
        field: key,
        label: getFieldLabel(key),
        localValue,
        serverValue,
      });
    }
  }

  return diffs;
}

/**
 * Create merged data from field selections.
 */
export function createMergedData(
  localData: Record<string, unknown>,
  serverData: Record<string, unknown>,
  selections: Record<string, 'local' | 'server'>
): MergedData {
  // Start with server data as base
  const merged: Record<string, unknown> = { ...serverData };
  const fromLocal: string[] = [];
  const fromServer: string[] = [];

  for (const [field, source] of Object.entries(selections)) {
    if (source === 'local') {
      merged[field] = localData[field];
      fromLocal.push(field);
    } else {
      merged[field] = serverData[field];
      fromServer.push(field);
    }
  }

  // For fields not in selections, use server value (default behavior)
  for (const field of Object.keys(serverData)) {
    if (!selections[field] && !EXCLUDED_DIFF_FIELDS.includes(field)) {
      fromServer.push(field);
    }
  }

  return {
    data: merged,
    fromLocal,
    fromServer,
  };
}
