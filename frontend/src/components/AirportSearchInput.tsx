import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import airportService from '../services/airport.service';
import type { AirportSearchResult } from '../services/airport.service';
import checklistService from '../services/checklist.service';
import geocodingService from '../services/geocoding.service';
import type { AirportMetadata } from '../types/checklist';

interface AirportSearchInputProps {
  /** ID of the airports checklist the airport will be added to. */
  checklistId: number;
  /** IATA codes already in the checklist (uppercase) — used to flag duplicates. */
  existingCodes: Set<string>;
  /** Called after an airport is successfully added. */
  onAdded: () => void | Promise<void>;
}

/** Max degrees an OpenStreetMap hit may differ from the known airport location. */
const COORD_TOLERANCE = 0.5;

/**
 * Resolve canonical coordinates for an airport. Asks OpenStreetMap (Nominatim)
 * using the precise airport name from the dataset, and only trusts the hit if
 * it lands near the known airport location. Falls back to the dataset's own
 * coordinates if OSM is unavailable or returns something implausible.
 */
async function resolveCoordinates(
  airport: AirportSearchResult
): Promise<{ latitude: number; longitude: number; address?: string }> {
  try {
    const query = [airport.name, airport.city, airport.country].filter(Boolean).join(', ');
    const results = await geocodingService.searchPlaces(query);
    const match = results[0];
    if (match) {
      const lat = parseFloat(match.lat);
      const lng = parseFloat(match.lon);
      if (
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        Math.abs(lat - airport.latitude) < COORD_TOLERANCE &&
        Math.abs(lng - airport.longitude) < COORD_TOLERANCE
      ) {
        return { latitude: lat, longitude: lng, address: match.display_name };
      }
    }
  } catch {
    // Nominatim unavailable — fall through to the dataset coordinates.
  }
  return { latitude: airport.latitude, longitude: airport.longitude };
}

/**
 * Type-a-code airport picker for the airports checklist. The user types a
 * 3-letter IATA code (or an airport/city name), then clicks an airport to add
 * it to the checklist with proper `code` metadata.
 */
export default function AirportSearchInput({
  checklistId,
  existingCodes,
  onAdded,
}: AirportSearchInputProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AirportSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingCode, setAddingCode] = useState<string | null>(null);
  const searchTimeoutRef = useRef<number | null>(null);
  const latestQueryRef = useRef('');

  useEffect(() => {
    const trimmed = query.trim();
    latestQueryRef.current = trimmed;

    if (trimmed.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    setSearching(true);
    searchTimeoutRef.current = window.setTimeout(async () => {
      try {
        const found = await airportService.searchAirports(trimmed);
        // Ignore stale responses for a query the user has since changed.
        if (latestQueryRef.current === trimmed) {
          setResults(found);
        }
      } catch (error) {
        console.error('Airport search error:', error);
        if (latestQueryRef.current === trimmed) {
          setResults([]);
          toast.error('Failed to search airports');
        }
      } finally {
        if (latestQueryRef.current === trimmed) {
          setSearching(false);
        }
      }
    }, 350);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [query]);

  const handleAdd = async (airport: AirportSearchResult) => {
    if (existingCodes.has(airport.iata)) {
      toast.error(`${airport.iata} is already in this checklist`);
      return;
    }

    setAddingCode(airport.iata);
    try {
      const { latitude, longitude, address } = await resolveCoordinates(airport);
      const metadata: AirportMetadata = {
        code: airport.iata,
        icao: airport.icao || undefined,
        city: airport.city,
        country: airport.country,
        latitude,
        longitude,
        address,
      };
      const description = [airport.city, airport.country].filter(Boolean).join(', ');

      await checklistService.addChecklistItem(checklistId, {
        name: `${airport.name} (${airport.iata})`,
        description: description || null,
        metadata,
      });

      toast.success(`Added ${airport.name} (${airport.iata})`);
      setQuery('');
      setResults([]);
      await onAdded();
    } catch (error) {
      console.error('Failed to add airport:', error);
      toast.error('Failed to add airport');
    } finally {
      setAddingCode(null);
    }
  };

  const trimmed = query.trim();

  return (
    <div className="mb-6 p-4 bg-gray-50 dark:bg-dusk-700 rounded-lg">
      <label
        htmlFor="airport-search"
        className="block text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1"
      >
        Add an airport
      </label>
      <input
        id="airport-search"
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="input"
        placeholder="Type a 3-letter code or airport name (e.g. JFK)"
        autoFocus
        autoComplete="off"
      />

      {searching && (
        <div className="text-sm text-gray-600 dark:text-dusk-400 py-2">Searching...</div>
      )}

      {!searching && results.length > 0 && (
        <div className="mt-2 max-h-72 overflow-y-auto space-y-1 border border-gray-300 dark:border-dusk-600 rounded bg-white dark:bg-dusk-800">
          {results.map((airport) => {
            const alreadyAdded = existingCodes.has(airport.iata);
            const isAdding = addingCode === airport.iata;
            return (
              <button
                key={airport.iata}
                type="button"
                onClick={() => handleAdd(airport)}
                disabled={alreadyAdded || addingCode !== null}
                className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-dusk-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-3"
              >
                <span className="font-mono font-semibold text-blue-700 dark:text-blue-300 w-10 flex-shrink-0">
                  {airport.iata}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-medium text-gray-900 dark:text-white truncate">
                    {airport.name}
                  </span>
                  <span className="block text-xs text-gray-600 dark:text-dusk-400 truncate">
                    {[airport.city, airport.country].filter(Boolean).join(', ')}
                  </span>
                </span>
                {alreadyAdded && (
                  <span className="text-xs text-green-600 dark:text-green-400 flex-shrink-0">
                    ✓ Added
                  </span>
                )}
                {isAdding && (
                  <span className="text-xs text-blue-600 dark:text-blue-400 flex-shrink-0">
                    Adding…
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!searching && trimmed.length >= 2 && results.length === 0 && (
        <div className="text-sm text-gray-500 dark:text-dusk-400 py-2">
          No airports found for &ldquo;{trimmed}&rdquo;
        </div>
      )}

      <div className="mt-3 text-xs text-gray-500 dark:text-dusk-400">
        ✈️ Search by IATA code, ICAO code, or airport/city name. Coordinates are
        confirmed via OpenStreetMap when available.
      </div>
    </div>
  );
}
