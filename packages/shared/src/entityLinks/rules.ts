/**
 * Polymorphic EntityLink vocabulary and default-relationship rules.
 *
 * Single source of truth for the backend (`entityLink.service.ts`), the mobile
 * companion app (offline link creation, smart auto-linking) and any future
 * client. The string values deliberately mirror the Prisma `EntityType` and
 * `LinkRelationship` enums exactly, so a Prisma enum value is assignable to
 * these unions without conversion.
 *
 * The module is pure: no imports, no I/O.
 */

/** Every entity kind that can sit on either end of an EntityLink. */
export const ENTITY_TYPES = [
  'PHOTO',
  'LOCATION',
  'ACTIVITY',
  'LODGING',
  'TRANSPORTATION',
  'JOURNAL_ENTRY',
  'PHOTO_ALBUM',
  'PDF_IMPORT',
  'SAVED_LINK',
  'CUSTOM_ITEM',
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

/** Semantic meaning of a link. `RELATED` is the catch-all. */
export const LINK_RELATIONSHIPS = [
  'RELATED',
  'TAKEN_AT',
  'OCCURRED_AT',
  'PART_OF',
  'DOCUMENTS',
  'FEATURED_IN',
] as const;
export type LinkRelationship = (typeof LINK_RELATIONSHIPS)[number];

/** Human labels for UI badges. */
export const LINK_RELATIONSHIP_LABELS: Readonly<Record<LinkRelationship, string>> = {
  RELATED: 'Related',
  TAKEN_AT: 'Taken at',
  OCCURRED_AT: 'Occurred at',
  PART_OF: 'Part of',
  DOCUMENTS: 'Documents',
  FEATURED_IN: 'Featured in',
};

/** Human labels for entity type groups. */
export const ENTITY_TYPE_LABELS: Readonly<Record<EntityType, string>> = {
  PHOTO: 'Photos',
  LOCATION: 'Locations',
  ACTIVITY: 'Activities',
  LODGING: 'Lodging',
  TRANSPORTATION: 'Transportation',
  JOURNAL_ENTRY: 'Journal',
  PHOTO_ALBUM: 'Albums',
  PDF_IMPORT: 'PDF Imports',
  SAVED_LINK: 'Saved Links',
  CUSTOM_ITEM: 'Custom Items',
};

/** Type guard for untrusted strings (route params, SQLite rows, share intents). */
export function isEntityType(value: unknown): value is EntityType {
  return typeof value === 'string' && (ENTITY_TYPES as readonly string[]).includes(value);
}

/** Type guard for untrusted relationship strings. */
export function isLinkRelationship(value: unknown): value is LinkRelationship {
  return typeof value === 'string' && (LINK_RELATIONSHIPS as readonly string[]).includes(value);
}

/**
 * Determines the default relationship for a new link when the caller did not
 * choose one explicitly.
 *
 * @param sourceType - Entity the link originates from
 * @param targetType - Entity the link points at
 * @returns The relationship a human would most likely mean
 *
 * @example
 * ```ts
 * getDefaultRelationship('PHOTO', 'LOCATION');      // 'TAKEN_AT'
 * getDefaultRelationship('ACTIVITY', 'LOCATION');   // 'OCCURRED_AT'
 * getDefaultRelationship('JOURNAL_ENTRY', 'PHOTO'); // 'DOCUMENTS'
 * ```
 */
export function getDefaultRelationship(
  sourceType: EntityType,
  targetType: EntityType
): LinkRelationship {
  // Photo taken at a location
  if (sourceType === 'PHOTO' && targetType === 'LOCATION') {
    return 'TAKEN_AT';
  }
  // Photo featured in album or journal
  if (sourceType === 'PHOTO' && (targetType === 'PHOTO_ALBUM' || targetType === 'JOURNAL_ENTRY')) {
    return 'FEATURED_IN';
  }
  // Activity/lodging occurred at location
  if ((sourceType === 'ACTIVITY' || sourceType === 'LODGING') && targetType === 'LOCATION') {
    return 'OCCURRED_AT';
  }
  // Journal documents entities
  if (sourceType === 'JOURNAL_ENTRY') {
    return 'DOCUMENTS';
  }
  // Default
  return 'RELATED';
}

/** Stable key for de-duplicating links: mirrors the DB unique constraint. */
export function entityLinkKey(link: {
  sourceType: EntityType;
  sourceId: number | string;
  targetType: EntityType;
  targetId: number | string;
}): string {
  return `${link.sourceType}:${link.sourceId}->${link.targetType}:${link.targetId}`;
}
