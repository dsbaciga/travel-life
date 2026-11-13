import { useQuery } from '@tanstack/react-query';
import activityService from '../services/activity.service';
import transportationService from '../services/transportation.service';
import lodgingService from '../services/lodging.service';
import locationService from '../services/location.service';
import entityLinkService from '../services/entityLink.service';

/**
 * The lists a day agenda is built from, for one trip.
 *
 * Activities, transportation, lodging and locations use the same query keys
 * as the trip detail page (`useTripDetailQueries`), so opening the trip from
 * Today, or Today after the trip, reuses the cache instead of refetching.
 */
export function useTripAgendaData(tripId: number | null | undefined) {
  const enabled = typeof tripId === 'number' && tripId > 0;
  const id = tripId ?? 0;

  const activities = useQuery({
    queryKey: ['activities', id],
    queryFn: () => activityService.getActivitiesByTrip(id),
    enabled,
  });
  const transportation = useQuery({
    queryKey: ['transportation', id],
    queryFn: () => transportationService.getTransportationByTrip(id),
    enabled,
  });
  const lodging = useQuery({
    queryKey: ['lodging', id],
    queryFn: () => lodgingService.getLodgingByTrip(id),
    enabled,
  });
  const locations = useQuery({
    queryKey: ['locations', id],
    queryFn: () => locationService.getLocationsByTrip(id),
    enabled,
  });
  const locationLinks = useQuery({
    queryKey: ['locationLinks', id],
    queryFn: () => entityLinkService.getLinksByTargetType(id, 'LOCATION'),
    enabled,
  });

  return {
    activities: activities.data ?? [],
    transportation: transportation.data ?? [],
    lodging: lodging.data ?? [],
    locations: locations.data ?? [],
    // Links only add pins; without them the agenda still lists every item.
    locationLinks: locationLinks.data ?? [],
    isLoading:
      enabled &&
      (activities.isLoading || transportation.isLoading || lodging.isLoading),
    isError: activities.isError || transportation.isError || lodging.isError,
  };
}
