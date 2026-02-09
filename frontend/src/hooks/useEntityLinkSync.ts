import { useCallback } from 'react';
import entityLinkService from '../services/entityLink.service';
import type { EntityType } from '../types/entityLink';
import toast from 'react-hot-toast';

/**
 * Options for syncing an entity link to a location after a save operation.
 */
interface SyncLocationLinkOptions {
  tripId: number;
  sourceType: EntityType;
  sourceId: number;
  /** The new location ID selected in the form (null if cleared) */
  newLocationId: number | null;
  /** The original location ID before editing (null if none was linked) */
  originalLocationId: number | null;
  /** Human-readable entity name for error messages (e.g., "Activity", "Lodging") */
  entityLabel: string;
  /** Callback to invalidate the trip link summary cache */
  invalidateLinkSummary: () => void;
}

/**
 * Hook that provides utilities for syncing entity-location links after save.
 *
 * This encapsulates the duplicated entity link update pattern found in
 * ActivityManager and LodgingManager. Both managers need to:
 *
 * 1. On update: detect if location changed, delete old link, create new link
 * 2. On create: create a link if a location was selected
 *
 * @example
 * ```tsx
 * const { syncLocationLinkOnUpdate, syncLocationLinkOnCreate } = useEntityLinkSync();
 *
 * // After a successful update:
 * await syncLocationLinkOnUpdate({
 *   tripId,
 *   sourceType: 'ACTIVITY',
 *   sourceId: editingId,
 *   newLocationId,
 *   originalLocationId,
 *   entityLabel: 'Activity',
 *   invalidateLinkSummary,
 * });
 *
 * // After a successful create:
 * await syncLocationLinkOnCreate({
 *   tripId,
 *   sourceType: 'LODGING',
 *   sourceId: createdLodging.id,
 *   newLocationId: values.locationId,
 *   originalLocationId: null,
 *   entityLabel: 'Lodging',
 *   invalidateLinkSummary,
 * });
 * ```
 */
export function useEntityLinkSync() {
  /**
   * Sync the location link after updating an existing entity.
   * Only performs API calls if the location has actually changed.
   */
  const syncLocationLinkOnUpdate = useCallback(
    async (options: SyncLocationLinkOptions): Promise<boolean> => {
      const {
        tripId,
        sourceType,
        sourceId,
        newLocationId,
        originalLocationId,
        entityLabel,
        invalidateLinkSummary,
      } = options;

      const locationChanged = newLocationId !== originalLocationId;
      if (!locationChanged) return true;

      try {
        // Remove old link if there was one
        if (originalLocationId) {
          await entityLinkService.deleteLink(tripId, {
            sourceType,
            sourceId,
            targetType: 'LOCATION',
            targetId: originalLocationId,
          });
        }

        // Create new link if a location is selected
        if (newLocationId) {
          await entityLinkService.createLink(tripId, {
            sourceType,
            sourceId,
            targetType: 'LOCATION',
            targetId: newLocationId,
          });
        }

        invalidateLinkSummary();
        return true;
      } catch (error) {
        console.error('Failed to update location link:', error);
        toast.error(`${entityLabel} saved but failed to update location link`);
        return false;
      }
    },
    // entityLinkService and toast are stable module-scope imports
    []
  );

  /**
   * Create a location link after creating a new entity.
   * Only creates a link if newLocationId is provided.
   */
  const syncLocationLinkOnCreate = useCallback(
    async (options: SyncLocationLinkOptions): Promise<boolean> => {
      const {
        tripId,
        sourceType,
        sourceId,
        newLocationId,
        entityLabel,
        invalidateLinkSummary,
      } = options;

      if (!newLocationId) return true;

      try {
        await entityLinkService.createLink(tripId, {
          sourceType,
          sourceId,
          targetType: 'LOCATION',
          targetId: newLocationId,
        });
        invalidateLinkSummary();
        return true;
      } catch (error) {
        console.error('Failed to create location link:', error);
        toast.error(`${entityLabel} created but failed to link location`);
        return false;
      }
    },
    // entityLinkService and toast are stable module-scope imports
    []
  );

  return {
    syncLocationLinkOnUpdate,
    syncLocationLinkOnCreate,
  };
}
