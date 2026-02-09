import { useState, useEffect, useRef } from 'react';
import geocodingService from '../services/geocoding.service';
import locationService from '../services/location.service';
import type { GeocodingResult } from '../services/geocoding.service';
import toast from 'react-hot-toast';

interface LocationQuickAddProps {
  tripId: number;
  onLocationCreated: (locationId: number, locationName: string) => void;
  onCancel: () => void;
}

export default function LocationQuickAdd({ tripId, onLocationCreated, onCancel }: LocationQuickAddProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const searchTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (searchQuery.trim().length < 3) {
      setSearchResults([]);
      return;
    }

    // Debounce search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await geocodingService.searchPlaces(searchQuery);
        setSearchResults(results);
      } catch (error) {
        console.error('Search error:', error);
        toast.error('Failed to search locations');
      } finally {
        setSearching(false);
      }
    }, 500);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery]);

  const handleResultClick = async (result: GeocodingResult) => {
    setCreating(true);
    try {
      const lat = parseFloat(result.lat);
      const lng = parseFloat(result.lon);
      const name = result.display_name.split(',')[0].trim();
      const address = result.display_name;

      // Create the location
      const newLocation = await locationService.createLocation({
        tripId,
        name,
        address,
        latitude: lat,
        longitude: lng,
      });

      toast.success(`Location "${name}" added`);
      onLocationCreated(newLocation.id, newLocation.name);
    } catch (error) {
      console.error('Failed to create location:', error);
      toast.error('Failed to create location');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="border border-blue-300 dark:border-blue-700 rounded-lg p-4 bg-blue-50 dark:bg-blue-900/20">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
          Add New Location
        </h4>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          Cancel
        </button>
      </div>

      <div className="space-y-2">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search for a place..."
          className="input"
          autoFocus
        />

        {searching && (
          <div className="text-sm text-gray-600 dark:text-gray-400 py-2">
            Searching...
          </div>
        )}

        {searchResults.length > 0 && (
          <div className="max-h-60 overflow-y-auto space-y-1 border border-gray-300 dark:border-gray-600 rounded">
            {searchResults.map((result) => (
              <button
                key={result.place_id}
                type="button"
                onClick={() => handleResultClick(result)}
                disabled={creating}
                className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-sm disabled:opacity-50"
              >
                <div className="font-medium text-gray-900 dark:text-white">
                  {result.display_name.split(',')[0]}
                </div>
                <div className="text-xs text-gray-600 dark:text-gray-400 truncate">
                  {result.display_name}
                </div>
              </button>
            ))}
          </div>
        )}

        {searchQuery.length > 0 && searchQuery.length < 3 && (
          <div className="text-xs text-gray-500 dark:text-gray-400 py-2">
            Type at least 3 characters to search
          </div>
        )}

        {creating && (
          <div className="text-sm text-blue-600 dark:text-blue-400 py-2">
            Creating location...
          </div>
        )}
      </div>

      <div className="mt-3 text-xs text-gray-500 dark:text-gray-400">
        💡 Search for a place name, address, or landmark
      </div>
    </div>
  );
}
