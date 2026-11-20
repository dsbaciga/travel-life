import { useQuery } from '@tanstack/react-query';
import emergencyInfoService from '../services/emergencyInfo.service';
import { resolveTripCountry, type ResolvedTripCountry } from '../utils/emergencyCountry';
import type { EmergencyCardData } from '../types/emergencyInfo';

/** Query key for a trip's emergency card. Invalidate this after any card write. */
export const emergencyCardQueryKey = (tripId: number) =>
  ['emergency-card', tripId] as const;

export interface UseEmergencyCardResult {
  card: EmergencyCardData | undefined;
  /** Unix ms of the cache write when the payload came from IndexedDB, else null. */
  cachedAt: number | null;
  /** Destination country plus how it was worked out. */
  country: ResolvedTripCountry;
  isLoading: boolean;
  error: unknown;
  refetch: () => void;
}

/**
 * Loads a trip's emergency card and resolves its destination country.
 *
 * The service already falls back to IndexedDB, so this hook resolves rather than
 * errors while offline — `cachedAt` tells the UI the payload is a mirror. Retries
 * are off for the same reason: the fallback has already happened by the time the
 * promise settles, so retrying only delays rendering a card someone needs now.
 *
 * @param tripId - The trip to load
 * @returns The card, its cache age, the resolved country, and query state
 *
 * @example
 * const { card, country, cachedAt } = useEmergencyCard(tripId);
 * const numbers = listEmergencyNumbers(country.facts?.emergency);
 */
export function useEmergencyCard(tripId: number): UseEmergencyCardResult {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: emergencyCardQueryKey(tripId),
    queryFn: () => emergencyInfoService.getEmergencyCard(tripId),
    retry: false,
  });

  const country = resolveTripCountry(
    data?.card.countryCode,
    data?.card.locationAddresses ?? [],
    data?.card.locationCountryCodes ?? []
  );

  return {
    card: data?.card,
    cachedAt: data?.cachedAt ?? null,
    country,
    isLoading,
    error,
    refetch: () => {
      void refetch();
    },
  };
}

export default useEmergencyCard;
