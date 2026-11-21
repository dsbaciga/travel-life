import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import locationService from '../services/location.service';
import activityService from '../services/activity.service';
import lodgingService from '../services/lodging.service';
import { useInvalidateEntityLinks } from './useInvalidateEntityLinks';
import type { Location } from '../types/location';

/** What a new Place can bring along with it. */
export type PlaceCompanion = 'none' | 'activity' | 'lodging';

/**
 * Creates the "other half" of a pair that shares a name: a Place for a new
 * activity or lodging, or an activity or lodging for a new Place.
 *
 * Neither helper throws. The item the user is actually creating must not
 * fail because its optional companion did, so failures are reported with a
 * toast and returned as `null` / `false`.
 */
export function useLinkedCreate(tripId: number) {
  const queryClient = useQueryClient();
  const invalidateEntityLinks = useInvalidateEntityLinks();

  /**
   * Create a Place with the given name. The caller links it, through the
   * same path it uses for a Place picked from the list.
   */
  const createPlaceNamed = useCallback(
    async (name: string, address?: string): Promise<Location | null> => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      try {
        const place = await locationService.createLocation({
          tripId,
          name: trimmed,
          address: address?.trim() || undefined,
        });
        queryClient.invalidateQueries({ queryKey: ['locations', tripId] });
        return place;
      } catch (error) {
        console.error('Failed to create place:', error);
        toast.error(`Could not create a place named "${trimmed}"`);
        return null;
      }
    },
    [tripId, queryClient]
  );

  /**
   * Create an activity or lodging named after an existing Place, located at
   * that Place (its locationId). Both start unscheduled, with no dates.
   */
  const createCompanionForPlace = useCallback(
    async (
      kind: Exclude<PlaceCompanion, 'none'>,
      place: Pick<Location, 'id' | 'name' | 'address'>
    ): Promise<boolean> => {
      const label = kind === 'activity' ? 'activity' : 'lodging';
      try {
        if (kind === 'activity') {
          await activityService.createActivity({ tripId, locationId: place.id, name: place.name });
        } else {
          await lodgingService.createLodging({
            tripId,
            locationId: place.id,
            type: 'hotel',
            name: place.name,
            address: place.address || undefined,
          });
        }
        queryClient.invalidateQueries({
          queryKey: [kind === 'activity' ? 'activities' : 'lodging', tripId],
        });
        invalidateEntityLinks(tripId);
        toast.success(`Also added ${label} "${place.name}"`);
        return true;
      } catch (error) {
        console.error(`Failed to create ${label} for place:`, error);
        toast.error(`The place was added, but the ${label} could not be created`);
        return false;
      }
    },
    [tripId, queryClient, invalidateEntityLinks]
  );

  return { createPlaceNamed, createCompanionForPlace };
}
