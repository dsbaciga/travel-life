import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import geocodingService from '../../services/geocoding.service';
import type { GeocodingResult } from '../../services/geocoding.service';
import type { Location } from '../../types/location';
import type { TripStop } from '../../types/tripStop';

export interface NewStopFromSearch {
  name: string;
  latitude: number;
  longitude: number;
}

interface AddStopPanelProps {
  /** The trip's saved places, already loaded by the trip page. Omit or leave empty for search only. */
  locations?: Location[];
  /** The current stops, used to mark saved places that are already on the route. */
  stops: TripStop[];
  onAddFromSearch: (place: NewStopFromSearch) => void;
  onAddLocation: (location: Location) => void;
  disabled: boolean;
}

type Source = 'search' | 'places';

/** A long trip can have hundreds of places; render a screenful and let the filter narrow it. */
const MAX_LISTED_PLACES = 50;

/** The saved place has a usable position, so it can be routed. */
const hasCoordinates = (
  location: Location
): location is Location & { latitude: number; longitude: number } =>
  location.latitude !== null &&
  location.longitude !== null &&
  Number.isFinite(location.latitude) &&
  Number.isFinite(location.longitude);

function placeContext(location: Location): string {
  return [location.parent?.name ? `in ${location.parent.name}` : null, location.category?.name, location.address]
    .filter(Boolean)
    .join(' · ');
}

/** Place search backed by the existing geocoding service (Nominatim), debounced like the other pickers. */
function SearchSource({
  onAdd,
  disabled,
}: {
  onAdd: (place: NewStopFromSearch) => void;
  disabled: boolean;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      setSearched(false);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      const found = await geocodingService.searchPlaces(query);
      if (cancelled) return;
      setResults(found);
      setSearched(true);
      setSearching(false);
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const choose = (result: GeocodingResult) => {
    const latitude = parseFloat(result.lat);
    const longitude = parseFloat(result.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      toast.error('That place has no usable coordinates');
      return;
    }
    onAdd({ name: result.display_name.split(',')[0].trim(), latitude, longitude });
    setQuery('');
    setResults([]);
    setSearched(false);
  };

  return (
    <div className="relative">
      <label
        htmlFor="route-planner-add-stop"
        className="block text-sm font-medium text-charcoal dark:text-warm-gray mb-1"
      >
        Add a stop
      </label>
      <input
        id="route-planner-add-stop"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={disabled}
        placeholder="Search for a city or place"
        autoComplete="off"
        className="w-full min-h-[44px] rounded-lg border border-primary-500/20 dark:border-navy-600 bg-white dark:bg-navy-900 px-3 text-charcoal dark:text-white"
      />
      {searching && <p className="mt-1 text-sm text-slate dark:text-dusk-400">Searching…</p>}
      {searched && !searching && results.length === 0 && (
        <p className="mt-1 text-sm text-slate dark:text-dusk-400">No places match.</p>
      )}
      {results.length > 0 && (
        <ul
          aria-label="Search results"
          className="absolute z-[1000] mt-1 w-full max-h-64 overflow-auto rounded-lg border border-primary-500/20 dark:border-navy-600 bg-white dark:bg-navy-800 shadow-lg"
        >
          {results.map((result) => (
            <li key={result.place_id}>
              <button
                type="button"
                onClick={() => choose(result)}
                className="w-full min-h-[44px] px-3 py-2 text-left text-sm text-charcoal dark:text-warm-gray hover:bg-primary-50 dark:hover:bg-navy-700"
              >
                {result.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The trip's saved places, filtered locally: no request is made while typing. */
function PlacesSource({
  locations,
  stops,
  onAdd,
  disabled,
}: {
  locations: Location[];
  stops: TripStop[];
  onAdd: (location: Location) => void;
  disabled: boolean;
}) {
  const [filter, setFilter] = useState('');

  // How many times each saved place is already on the route.
  const usedCount = useMemo(() => {
    const counts = new Map<number, number>();
    for (const stop of stops) {
      if (stop.locationId !== null) counts.set(stop.locationId, (counts.get(stop.locationId) ?? 0) + 1);
    }
    return counts;
  }, [stops]);

  const matches = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const found = needle
      ? locations.filter((l) =>
          [l.name, l.address, l.category?.name, l.parent?.name].some((v) => v?.toLowerCase().includes(needle))
        )
      : locations;
    return [...found].sort((a, b) => a.name.localeCompare(b.name));
  }, [locations, filter]);

  const shown = matches.slice(0, MAX_LISTED_PLACES);

  return (
    <div>
      <label
        htmlFor="route-planner-filter-places"
        className="block text-sm font-medium text-charcoal dark:text-warm-gray mb-1"
      >
        Add a stop from this trip&apos;s places
      </label>
      <input
        id="route-planner-filter-places"
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter places by name, address or category"
        autoComplete="off"
        className="w-full min-h-[44px] rounded-lg border border-primary-500/20 dark:border-navy-600 bg-white dark:bg-navy-900 px-3 text-charcoal dark:text-white"
      />
      {matches.length === 0 ? (
        <p className="mt-2 text-sm text-slate dark:text-dusk-400">No places match.</p>
      ) : (
        <ul
          aria-label="This trip's places"
          className="mt-2 max-h-64 overflow-auto rounded-lg border border-primary-500/20 dark:border-navy-600 divide-y divide-primary-500/10 dark:divide-navy-700"
        >
          {shown.map((location) => {
            const routable = hasCoordinates(location);
            const used = usedCount.get(location.id) ?? 0;
            const context = placeContext(location);
            return (
              <li key={location.id}>
                <button
                  type="button"
                  onClick={() => onAdd(location)}
                  disabled={disabled || !routable}
                  className="w-full min-h-[44px] px-3 py-2 text-left hover:bg-primary-50 dark:hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent"
                >
                  <span className="block text-sm font-medium text-charcoal dark:text-warm-gray">
                    {location.name}
                    {used > 0 && (
                      <span className="ml-2 rounded-full bg-gold/30 px-2 py-0.5 text-xs font-normal text-charcoal dark:text-white">
                        {used === 1 ? 'Already a stop' : `Already ${used} stops`}
                      </span>
                    )}
                  </span>
                  {context && <span className="block text-xs text-slate dark:text-dusk-400">{context}</span>}
                  {!routable && (
                    <span className="block text-xs text-slate dark:text-dusk-400">
                      No coordinates, so it cannot be placed on the route
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {matches.length > shown.length && (
        <p className="mt-1 text-xs text-slate dark:text-dusk-400">
          Showing {shown.length} of {matches.length}. Type to narrow the list.
        </p>
      )}
      <p className="mt-1 text-xs text-slate dark:text-dusk-400">
        A place can be added again, for example to finish a loop where you started.
      </p>
    </div>
  );
}

/**
 * Where a new stop comes from: a place search, or the trip's own saved places when it has
 * any. The saved places are the ones the trip page already loaded, so switching to them
 * costs no request.
 */
export default function AddStopPanel({
  locations = [],
  stops,
  onAddFromSearch,
  onAddLocation,
  disabled,
}: AddStopPanelProps) {
  const [source, setSource] = useState<Source>('search');
  const hasPlaces = locations.length > 0;
  const active: Source = hasPlaces ? source : 'search';

  return (
    <div>
      {hasPlaces && (
        <div
          role="group"
          aria-label="Where to add a stop from"
          className="inline-flex rounded-lg border border-primary-500/15 dark:border-navy-700 p-0.5 mb-2"
        >
          {(
            [
              ['search', 'Search'],
              ['places', "This trip's places"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={active === value}
              onClick={() => setSource(value)}
              className={`min-h-[40px] px-4 text-sm font-medium rounded-md transition-colors ${
                active === value
                  ? 'bg-primary-600 text-white'
                  : 'text-charcoal dark:text-warm-gray hover:bg-primary-50 dark:hover:bg-navy-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {active === 'search' ? (
        <SearchSource onAdd={onAddFromSearch} disabled={disabled} />
      ) : (
        <PlacesSource locations={locations} stops={stops} onAdd={onAddLocation} disabled={disabled} />
      )}
    </div>
  );
}
