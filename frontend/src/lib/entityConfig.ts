/**
 * Centralized configuration for entity types in the linking system
 * This file provides a single source of truth for:
 * - Entity type metadata (labels, icons, colors)
 * - Display order for consistent ordering across components
 * - Color classes for Tailwind styling
 * - Relationship type display labels
 */

import type { EntityType, LinkRelationship } from '../types/entityLink';

// =============================================================================
// Entity Type Configuration
// =============================================================================

export interface EntityTypeConfig {
  label: string;
  pluralLabel: string;
  emoji: string;
  color: string;
}

export const ENTITY_TYPE_CONFIG: Record<EntityType, EntityTypeConfig> = {
  PHOTO: { label: 'Photo', pluralLabel: 'Photos', emoji: '📷', color: 'gray' },
  LOCATION: { label: 'Location', pluralLabel: 'Locations', emoji: '📍', color: 'blue' },
  ACTIVITY: { label: 'Activity', pluralLabel: 'Activities', emoji: '🎯', color: 'green' },
  LODGING: { label: 'Lodging', pluralLabel: 'Lodging', emoji: '🏨', color: 'purple' },
  TRANSPORTATION: { label: 'Transportation', pluralLabel: 'Transportation', emoji: '🚗', color: 'orange' },
  JOURNAL_ENTRY: { label: 'Journal Entry', pluralLabel: 'Journal Entries', emoji: '📝', color: 'yellow' },
  PHOTO_ALBUM: { label: 'Album', pluralLabel: 'Albums', emoji: '📸', color: 'pink' },
  PDF_IMPORT: { label: 'PDF Import', pluralLabel: 'PDF Imports', emoji: '📄', color: 'gray' },
  SAVED_LINK: { label: 'Link', pluralLabel: 'Links', emoji: '🔗', color: 'teal' },
  CUSTOM_ITEM: { label: 'Custom', pluralLabel: 'Custom', emoji: '📌', color: 'indigo' },
};

// =============================================================================
// Display Order
// =============================================================================

/**
 * Standard display order for entity types across all components
 * Use this to ensure consistent ordering in LinkPanel, LinkedEntitiesDisplay, etc.
 */
export const ENTITY_TYPE_DISPLAY_ORDER: EntityType[] = [
  'LOCATION',
  'ACTIVITY',
  'LODGING',
  'TRANSPORTATION',
  'PHOTO',
  'PHOTO_ALBUM',
  'JOURNAL_ENTRY',
  'SAVED_LINK',
  'CUSTOM_ITEM',
  // PDF_IMPORT is a provenance marker written by the import pipeline, not a
  // user-facing link. Listed last so it renders after real content.
  'PDF_IMPORT',
];

/**
 * All entity types that can be selected as link targets
 * PHOTO_ALBUM is now included - albums can be linked to other entities
 * PDF_IMPORT is excluded: it is created by the import pipeline, never chosen
 */
export const LINKABLE_ENTITY_TYPES: EntityType[] = [
  'LOCATION',
  'ACTIVITY',
  'LODGING',
  'TRANSPORTATION',
  'PHOTO',
  'PHOTO_ALBUM',
  'JOURNAL_ENTRY',
  'SAVED_LINK',
  'CUSTOM_ITEM',
];

// =============================================================================
// Color Configuration
// =============================================================================

export interface ColorClasses {
  bg: string;
  bgHover: string;
  bgDark: string;
  text: string;
  textDark: string;
  border: string;
  ring: string;
  focus: string;
}

const COLOR_MAP: Record<string, ColorClasses> = {
  gray: {
    bg: 'bg-gray-100',
    bgHover: 'hover:bg-gray-200 dark:hover:bg-dusk-600',
    bgDark: 'dark:bg-dusk-700',
    text: 'text-gray-800',
    textDark: 'dark:text-dusk-200',
    border: 'border-gray-300 dark:border-dusk-600',
    ring: 'ring-gray-400',
    focus: 'focus:ring-2 focus:ring-gray-400 focus:ring-offset-1 focus:outline-none',
  },
  blue: {
    bg: 'bg-blue-100',
    bgHover: 'hover:bg-blue-200 dark:hover:bg-blue-800/50',
    bgDark: 'dark:bg-blue-900/50',
    text: 'text-blue-800',
    textDark: 'dark:text-blue-200',
    border: 'border-blue-300 dark:border-blue-700',
    ring: 'ring-blue-400',
    focus: 'focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 focus:outline-none',
  },
  green: {
    bg: 'bg-green-100',
    bgHover: 'hover:bg-green-200 dark:hover:bg-green-800/50',
    bgDark: 'dark:bg-green-900/50',
    text: 'text-green-800',
    textDark: 'dark:text-green-200',
    border: 'border-green-300 dark:border-green-700',
    ring: 'ring-green-400',
    focus: 'focus:ring-2 focus:ring-green-400 focus:ring-offset-1 focus:outline-none',
  },
  purple: {
    bg: 'bg-purple-100',
    bgHover: 'hover:bg-purple-200 dark:hover:bg-purple-800/50',
    bgDark: 'dark:bg-purple-900/50',
    text: 'text-purple-800',
    textDark: 'dark:text-purple-200',
    border: 'border-purple-300 dark:border-purple-700',
    ring: 'ring-purple-400',
    focus: 'focus:ring-2 focus:ring-purple-400 focus:ring-offset-1 focus:outline-none',
  },
  orange: {
    bg: 'bg-orange-100',
    bgHover: 'hover:bg-orange-200 dark:hover:bg-orange-800/50',
    bgDark: 'dark:bg-orange-900/50',
    text: 'text-orange-800',
    textDark: 'dark:text-orange-200',
    border: 'border-orange-300 dark:border-orange-700',
    ring: 'ring-orange-400',
    focus: 'focus:ring-2 focus:ring-orange-400 focus:ring-offset-1 focus:outline-none',
  },
  yellow: {
    bg: 'bg-yellow-100',
    bgHover: 'hover:bg-yellow-200 dark:hover:bg-yellow-800/50',
    bgDark: 'dark:bg-yellow-900/50',
    text: 'text-yellow-800',
    textDark: 'dark:text-yellow-200',
    border: 'border-yellow-300 dark:border-yellow-700',
    ring: 'ring-yellow-400',
    focus: 'focus:ring-2 focus:ring-yellow-400 focus:ring-offset-1 focus:outline-none',
  },
  pink: {
    bg: 'bg-pink-100',
    bgHover: 'hover:bg-pink-200 dark:hover:bg-pink-800/50',
    bgDark: 'dark:bg-pink-900/50',
    text: 'text-pink-800',
    textDark: 'dark:text-pink-200',
    border: 'border-pink-300 dark:border-pink-700',
    ring: 'ring-pink-400',
    focus: 'focus:ring-2 focus:ring-pink-400 focus:ring-offset-1 focus:outline-none',
  },
  teal: {
    bg: 'bg-teal-100',
    bgHover: 'hover:bg-teal-200 dark:hover:bg-teal-800/50',
    bgDark: 'dark:bg-teal-900/50',
    text: 'text-teal-800',
    textDark: 'dark:text-teal-200',
    border: 'border-teal-300 dark:border-teal-700',
    ring: 'ring-teal-400',
    focus: 'focus:ring-2 focus:ring-teal-400 focus:ring-offset-1 focus:outline-none',
  },
  indigo: {
    bg: 'bg-indigo-100',
    bgHover: 'hover:bg-indigo-200 dark:hover:bg-indigo-800/50',
    bgDark: 'dark:bg-indigo-900/50',
    text: 'text-indigo-800',
    textDark: 'dark:text-indigo-200',
    border: 'border-indigo-300 dark:border-indigo-700',
    ring: 'ring-indigo-400',
    focus: 'focus:ring-2 focus:ring-indigo-400 focus:ring-offset-1 focus:outline-none',
  },
};

/**
 * Get Tailwind color classes for an entity type
 */
export function getEntityColorClasses(entityType: EntityType): ColorClasses {
  const color = ENTITY_TYPE_CONFIG[entityType].color;
  return COLOR_MAP[color] || COLOR_MAP.gray;
}

// =============================================================================
// Relationship Configuration
// =============================================================================

export interface RelationshipConfig {
  label: string;
  description: string;
}

export const RELATIONSHIP_CONFIG: Record<LinkRelationship, RelationshipConfig> = {
  RELATED: { label: 'Related', description: 'Generic relationship' },
  TAKEN_AT: { label: 'Taken at', description: 'Photo taken at this location' },
  OCCURRED_AT: { label: 'Occurred at', description: 'Event occurred at this location' },
  PART_OF: { label: 'Part of', description: 'Sub-item or nested element' },
  DOCUMENTS: { label: 'Documents', description: 'Journal entry about this item' },
  FEATURED_IN: { label: 'Featured in', description: 'Included in album or journal' },
};

/**
 * Get display label for a relationship type
 */
export function getRelationshipLabel(relationship: LinkRelationship): string {
  return RELATIONSHIP_CONFIG[relationship]?.label || relationship.replace(/_/g, ' ').toLowerCase();
}

/**
 * All available relationship types for selection in edit dialogs
 */
export const ALL_RELATIONSHIP_TYPES: LinkRelationship[] = [
  'RELATED',
  'TAKEN_AT',
  'OCCURRED_AT',
  'PART_OF',
  'DOCUMENTS',
  'FEATURED_IN',
];

// =============================================================================
// Navigation Configuration
// =============================================================================

/**
 * Map entity types to their corresponding tab names on the trip detail page
 * Used for navigation to linked entities
 *
 * PHOTO_ALBUM is the one type with two destinations: albums are listed under the
 * photos tab, but each also has its own page at /trips/:tripId/albums/:albumId.
 * Callers that want the album page must branch on PHOTO_ALBUM before the lookup —
 * see LinkPanel and EntityDetailModal. The 'photos' value here is the honest answer
 * to "which tab", so callers that only want a tab still get a working destination.
 */
export const ENTITY_TYPE_TO_TAB: Record<EntityType, string | null> = {
  PHOTO: 'photos',
  LOCATION: 'locations',
  ACTIVITY: 'activities',
  LODGING: 'lodging',
  TRANSPORTATION: 'transportation',
  JOURNAL_ENTRY: 'journal',
  PHOTO_ALBUM: 'photos', // Albums are in the photos tab
  SAVED_LINK: 'links',
  CUSTOM_ITEM: 'custom',
  PDF_IMPORT: null, // No trip tab: imports are managed outside the trip page
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get display name for an enriched entity link
 * Handles different entity name fields (name, title, caption)
 */
export function getEntityDisplayName(
  entity: { name?: string; title?: string; caption?: string; id: number } | undefined,
  fallbackId: number
): string {
  if (!entity) return `ID: ${fallbackId}`;
  return entity.name || entity.title || entity.caption || `ID: ${entity.id}`;
}

/**
 * Sort entity types by the standard display order
 */
export function sortEntityTypesByDisplayOrder(types: EntityType[]): EntityType[] {
  return [...types].sort(
    (a, b) => ENTITY_TYPE_DISPLAY_ORDER.indexOf(a) - ENTITY_TYPE_DISPLAY_ORDER.indexOf(b)
  );
}

/**
 * Get entity types that have items in a grouped links object
 */
export function getLinkedEntityTypes<T>(
  groupedLinks: Record<EntityType, T[]>
): EntityType[] {
  return ENTITY_TYPE_DISPLAY_ORDER.filter(
    (type) => groupedLinks[type]?.length > 0
  );
}
