import { useCallback, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  COUNTRY_FACTS,
  getCountryFacts,
  resolveCountryFromAddress,
  type CountryFacts,
} from '../constants/countryFacts';
import tripService from '../services/trip.service';

/** A country the trip visits, plus how strongly the addresses point at it. */
export interface DetectedCountry {
  facts: CountryFacts;
  /** How many of the trip's locations resolved to this country. */
  locationCount: number;
}

/** The subset of a Location this hook needs: its stored country code and/or its address. */
export interface AddressBearing {
  address: string | null;
  /** Structured ISO alpha-2; wins over parsing `address`. */
  countryCode?: string | null;
}

export interface TripCountries {
  /**
   * Countries resolved from the trip's addresses, most-visited first. Empty
   * when nothing could be resolved (no locations, or no address names a
   * country we recognise).
   */
  detected: DetectedCountry[];
  /** The country currently being displayed, or `undefined` when none is known. */
  selected: CountryFacts | undefined;
  /** True when detection found nothing and the user has not picked a country. */
  needsManualSelection: boolean;
  /** True when the shown country came from the user, not from the addresses. */
  isManualSelection: boolean;
  /** Every country in the bundled dataset, alphabetical — for the manual picker. */
  allCountries: readonly CountryFacts[];
  /**
   * Correct the trip's country; `null` reverts to whatever detection found.
   *
   * Writes `Trip.countryCode`, so the correction also applies to the emergency
   * card. Rejects (and the caller reports) when the trip cannot be written.
   */
  selectCountry: (code: string | null) => Promise<void>;
  /**
   * Show a different one of the trip's detected countries.
   *
   * Purely local and instant. Looking at Japan's norms on a France-and-Japan
   * trip is a *view*, not a claim that the trip is in Japan — it must not
   * rewrite the shared override (which would move the emergency card's numbers)
   * and must keep working with no network.
   */
  viewCountry: (code: string) => void;
}

const ALL_COUNTRIES: readonly CountryFacts[] = Object.values(COUNTRY_FACTS).sort((a, b) =>
  a.name.localeCompare(b.name)
);

/**
 * Works out which country (or countries) a trip is in, using only bundled data.
 *
 * Detection is bundled-data only: `Location.address` is free text, so a country
 * is inferred per location and the hits are tallied. A trip that legitimately
 * spans several countries yields several entries; the caller shows a switcher.
 *
 * The override is **not** local to this card. It is `Trip.countryCode`, the one
 * column every country-aware feature reads, so correcting the country here also
 * corrects the emergency card. It is passed in rather than fetched because the
 * trip is already loaded by the page that renders this.
 *
 * @param tripId - Trip whose override is written.
 * @param locations - The trip's locations; only `address` is read.
 * @param overrideCode - The trip's stored `countryCode`, if it has one.
 * @returns Detected countries, the active one, and a setter.
 * @example
 * const { detected, selected, selectCountry } = useTripCountries(trip.id, locations, trip.countryCode);
 */
export function useTripCountries(
  tripId: number,
  locations: readonly AddressBearing[],
  overrideCode: string | null | undefined
): TripCountries {
  const queryClient = useQueryClient();
  // Which detected country is on screen. Ephemeral by design — see `viewCountry`.
  const [viewCode, setViewCode] = useState<string | null>(null);

  const detected = useMemo<DetectedCountry[]>(() => {
    const counts = new Map<string, number>();

    for (const location of locations) {
      // The structured code wins; the address is parsed only for locations that have none.
      const code = location.countryCode?.trim().toUpperCase() || resolveCountryFromAddress(location.address);
      if (!code) continue;
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }

    return [...counts.entries()]
      .flatMap(([code, locationCount]) => {
        const facts = getCountryFacts(code);
        // Defensive: the resolver only emits codes present in the dataset, but a
        // future alias could outlive its entry and an undefined here would crash
        // the card rather than simply dropping one chip.
        return facts ? [{ facts, locationCount }] : [];
      })
      .sort(
        (a, b) =>
          b.locationCount - a.locationCount || a.facts.name.localeCompare(b.facts.name)
      );
  }, [locations]);

  const overrideFacts = getCountryFacts(overrideCode);
  // A local view of another detected country wins over the stored override, which
  // in turn wins over what the addresses imply.
  const selected = getCountryFacts(viewCode) ?? overrideFacts ?? detected[0]?.facts;

  const selectCountry = useCallback(
    async (code: string | null) => {
      const normalised = code === null ? null : code.trim().toUpperCase() || null;
      await tripService.updateTrip(tripId, { countryCode: normalised });
      // Drop any local view so the freshly stored country is what shows.
      setViewCode(null);
      // Both cards read the trip, so one invalidation refreshes both.
      await queryClient.invalidateQueries({ queryKey: ['trip', tripId] });
      await queryClient.invalidateQueries({ queryKey: ['emergency-card', tripId] });
    },
    [tripId, queryClient]
  );

  const viewCountry = useCallback((code: string) => {
    setViewCode(code.trim().toUpperCase() || null);
  }, []);

  return {
    detected,
    selected,
    needsManualSelection: detected.length === 0 && overrideFacts === undefined,
    isManualSelection: overrideFacts !== undefined,
    allCountries: ALL_COUNTRIES,
    selectCountry,
    viewCountry,
  };
}

export default useTripCountries;
