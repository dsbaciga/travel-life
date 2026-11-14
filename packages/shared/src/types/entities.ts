/**
 * Entity shapes as the mobile sync endpoint (`GET /api/trips/:id/mobile-sync`)
 * returns them: Prisma column names, ISO-8601 strings for instants, plain
 * numbers for decimals.
 *
 * `EntityId` is `number` for anything the server has seen and a
 * `local_<uuid>` string for rows created on the phone that are still waiting
 * in the outbox. Every id-typed field uses it so offline-created graphs
 * (Location + Activity + EntityLink) type-check before they are synced.
 */

import type { EntityType, LinkRelationship } from '../entityLinks/rules';

export const LOCAL_ID_PREFIX = 'local_';
export type LocalId = `local_${string}`;
export type EntityId = number | LocalId;

/** True for ids minted on-device that the server has not assigned yet. */
export function isLocalId(id: unknown): id is LocalId {
  return typeof id === 'string' && id.startsWith(LOCAL_ID_PREFIX);
}

/** Everything the phone mirrors, including kinds that cannot be EntityLink endpoints. */
export const SYNC_ENTITY_KINDS = [
  'LOCATION',
  'PHOTO_ALBUM',
  'LODGING',
  'TRANSPORTATION',
  'ACTIVITY',
  'JOURNAL_ENTRY',
  'SAVED_LINK',
  'CUSTOM_ITEM',
  'FOOD_LOG',
  'EXPENSE',
  'PHOTO',
  'CHECKLIST',
  'CHECKLIST_ITEM',
] as const;
export type SyncEntityKind = (typeof SYNC_ENTITY_KINDS)[number];

const NON_LINKABLE_KINDS: readonly SyncEntityKind[] = [
  'FOOD_LOG',
  'EXPENSE',
  'CHECKLIST',
  'CHECKLIST_ITEM',
];

/** Kinds that are valid EntityLink endpoints (subset of the sync kinds). */
export function isLinkableKind(kind: SyncEntityKind): kind is Extract<SyncEntityKind, EntityType> {
  return !NON_LINKABLE_KINDS.includes(kind);
}

interface Timestamps {
  createdAt?: string;
  updatedAt?: string;
}

export interface TripDto extends Timestamps {
  id: number;
  title: string;
  description: string | null;
  /** Date-only (UTC midnight). */
  startDate: string | null;
  endDate: string | null;
  timezone: string | null;
  status: string;
  countryCode: string | null;
  budget: number | null;
  budgetCurrency: string | null;
  /** The caller's effective permission on this trip. */
  permission?: 'view' | 'edit' | 'admin' | 'owner';
}

export interface LocationDto extends Timestamps {
  id: EntityId;
  tripId: number;
  parentId: EntityId | null;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  categoryId: number | null;
  visitDatetime: string | null;
  visitDurationMinutes: number | null;
  notes: string | null;
  isFavorite: boolean;
  openingHours: string | null;
  timezone: string | null;
  /** Hidden from maps (the "exclude from map" setting). Absent on rows mirrored before it was synced. */
  excludeFromMap?: boolean;
}

export interface ActivityDto extends Timestamps {
  id: EntityId;
  tripId: number;
  parentId: EntityId | null;
  name: string;
  description: string | null;
  category: string | null;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  timezone: string | null;
  cost: number | null;
  currency: string | null;
  bookingUrl: string | null;
  bookingReference: string | null;
  notes: string | null;
  manualOrder: number | null;
}

export const TRANSPORTATION_TYPES = [
  'flight',
  'train',
  'bus',
  'car',
  'ferry',
  'bicycle',
  'walk',
  'other',
] as const;
export type TransportationType = (typeof TRANSPORTATION_TYPES)[number];

export const TRANSPORTATION_STATUSES = ['on_time', 'delayed', 'cancelled'] as const;
export type TransportationStatus = (typeof TRANSPORTATION_STATUSES)[number];

export interface FlightTrackingDto {
  flightNumber: string | null;
  airlineCode: string | null;
  status: string | null;
  gate: string | null;
  terminal: string | null;
  baggageClaim: string | null;
}

export interface TransportationDto extends Timestamps {
  id: EntityId;
  tripId: number;
  type: string;
  startLocationId: EntityId | null;
  startLocationText: string | null;
  endLocationId: EntityId | null;
  endLocationText: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  startTimezone: string | null;
  endTimezone: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  company: string | null;
  referenceNumber: string | null;
  seatNumber: string | null;
  bookingReference: string | null;
  cost: number | null;
  currency: string | null;
  status: string;
  delayMinutes: number | null;
  notes: string | null;
  /** Live flight data when tracked (gate, terminal, baggage). */
  flightTracking?: FlightTrackingDto | null;
}

export const LODGING_TYPES = [
  'hotel',
  'hostel',
  'airbnb',
  'vacation_rental',
  'camping',
  'resort',
  'motel',
  'bed_and_breakfast',
  'apartment',
  'friends_family',
  'other',
] as const;
export type LodgingType = (typeof LODGING_TYPES)[number];

export interface LodgingDto extends Timestamps {
  id: EntityId;
  tripId: number;
  type: string;
  name: string;
  address: string | null;
  checkInDate: string;
  checkOutDate: string;
  timezone: string | null;
  confirmationNumber: string | null;
  bookingUrl: string | null;
  cost: number | null;
  currency: string | null;
  notes: string | null;
}

export interface JournalEntryDto extends Timestamps {
  id: EntityId;
  tripId: number;
  /** Date-only (UTC midnight); null for trip-level entries. */
  date: string | null;
  title: string | null;
  content: string;
  entryType: string;
  mood: string | null;
  weatherNotes: string | null;
}

export interface SavedLinkDto extends Timestamps {
  id: EntityId;
  tripId: number | null;
  url: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  imageUrl: string | null;
  notes: string | null;
}

export interface CustomItemDto extends Timestamps {
  id: EntityId;
  tripId: number;
  typeId: number | null;
  name: string;
  notes: string | null;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  timezone: string | null;
  locationId: EntityId | null;
  cost: number | null;
  currency: string | null;
  url: string | null;
  confirmationNumber: string | null;
}

export const EXPENSE_CATEGORIES = [
  'food',
  'transportation',
  'lodging',
  'activities',
  'shopping',
  'other',
] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface ExpenseDto extends Timestamps {
  id: EntityId;
  tripId: number;
  description: string;
  category: string;
  amount: number;
  currency: string | null;
  exchangeRate: number | null;
  baseAmount: number | null;
  baseCurrency: string | null;
  /** Date-only (UTC midnight). */
  date: string | null;
  notes: string | null;
}

export interface FoodLogDto extends Timestamps {
  id: EntityId;
  tripId: number;
  activityId: EntityId | null;
  locationId: EntityId | null;
  restaurantName: string;
  dish: string;
  rating: number;
  notes: string | null;
  orderAgain: boolean;
}

export interface PhotoDto extends Timestamps {
  id: EntityId;
  tripId: number;
  source: string;
  mediaType: string;
  localPath: string | null;
  thumbnailPath: string | null;
  caption: string | null;
  latitude: number | null;
  longitude: number | null;
  takenAt: string | null;
  /** Device-only: file URI of a capture still waiting to upload. */
  pendingUri?: string | null;
  /** Device-only: the food-log entry this photo is waiting to be attached to. */
  foodLogId?: EntityId | null;
}

export interface PhotoAlbumDto extends Timestamps {
  id: EntityId;
  tripId: number;
  name: string;
  description: string | null;
}

export interface ChecklistDto extends Timestamps {
  id: EntityId;
  tripId: number | null;
  name: string;
  description: string | null;
  type: string;
  sortOrder: number;
}

export interface ChecklistItemDto extends Timestamps {
  id: EntityId;
  checklistId: EntityId;
  name: string;
  description: string | null;
  isChecked: boolean;
  sortOrder: number;
  checkedAt: string | null;
}

export interface EntityLinkDto {
  id: EntityId;
  tripId: number;
  sourceType: EntityType;
  sourceId: EntityId;
  targetType: EntityType;
  targetId: EntityId;
  relationship: LinkRelationship;
  sortOrder: number | null;
  notes: string | null;
  createdAt?: string;
}

/** Maps each sync kind to its DTO. */
export interface SyncEntityMap {
  LOCATION: LocationDto;
  PHOTO_ALBUM: PhotoAlbumDto;
  LODGING: LodgingDto;
  TRANSPORTATION: TransportationDto;
  ACTIVITY: ActivityDto;
  JOURNAL_ENTRY: JournalEntryDto;
  SAVED_LINK: SavedLinkDto;
  CUSTOM_ITEM: CustomItemDto;
  FOOD_LOG: FoodLogDto;
  EXPENSE: ExpenseDto;
  PHOTO: PhotoDto;
  CHECKLIST: ChecklistDto;
  CHECKLIST_ITEM: ChecklistItemDto;
}

/** Response of `GET /api/trips/:tripId/mobile-sync`. */
export interface MobileSyncSnapshot {
  /** Server clock at snapshot time; pass back as `since` on the next pull. */
  serverTime: string;
  /** True when `since` was honoured and `entities` holds only changed rows. */
  delta: boolean;
  trip: TripDto;
  entities: { [K in SyncEntityKind]: SyncEntityMap[K][] };
  links: EntityLinkDto[];
  /**
   * Every id that currently exists server-side, per kind. A delta pull cannot
   * otherwise tell "unchanged" from "deleted on another device".
   */
  ids: { [K in SyncEntityKind]: number[] };
  linkIds: number[];
}

export interface TrackPointDto {
  latitude: number;
  longitude: number;
  /** ISO-8601 instant. */
  recordedAt: string;
  accuracy?: number | null;
  altitude?: number | null;
  speed?: number | null;
}

/** Payload encoded in the "Pair Mobile App" QR code. */
export interface PairingQrPayload {
  serverUrl: string;
  pairingToken: string;
}

/** Tokens a native client receives in the JSON body (never in cookies). */
export interface MobileAuthResponse {
  user: {
    id: number;
    username: string;
    email: string;
    avatarUrl: string | null;
    timezone: string | null;
  };
  accessToken: string;
  refreshToken: string;
}
