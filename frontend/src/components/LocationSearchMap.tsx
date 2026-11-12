import { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import { LatLng } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import '../utils/mapUtils';
import geocodingService from '../services/geocoding.service';
import type { GeocodingResult } from '../services/geocoding.service';
import { useMapTiles } from '../hooks/useMapTiles';
import toast from 'react-hot-toast';

interface LocationSearchMapProps {
  onLocationSelect: (data: {
    name: string;
    address: string;
    latitude: number;
    longitude: number;
  }) => void;
  initialPosition?: { lat: number; lng: number };
}

// Component to handle map clicks
function MapClickHandler({ onClick }: { onClick: (latlng: LatLng) => void }) {
  useMapEvents({
    click: (e) => {
      onClick(e.latlng);
    },
  });
  return null;
}

// True when the primary pointer is touch (phones/tablets). On these devices the
// map starts locked so a one-finger drag scrolls the surrounding form instead of
// being swallowed by map panning.
const isCoarsePointer = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse)').matches;

// Enables or disables Leaflet's gesture handlers on the fly. MapContainer only
// reads its interaction props at init, so toggling them later has to go through
// the map instance directly.
function MapInteractivity({ engaged }: { engaged: boolean }) {
  const map = useMap();

  useEffect(() => {
    const handlers = [
      map.dragging,
      map.touchZoom,
      map.doubleClickZoom,
      map.scrollWheelZoom,
      map.boxZoom,
      map.keyboard,
    ];
    handlers.forEach((handler) => (engaged ? handler?.enable() : handler?.disable()));
  }, [engaged, map]);

  return null;
}

const LocationSearchMap = ({ onLocationSelect, initialPosition }: LocationSearchMapProps) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GeocodingResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<{ lat: number; lng: number } | null>(
    initialPosition || null
  );
  const [selectedName, setSelectedName] = useState('');
  const [selectedAddress, setSelectedAddress] = useState('');
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tileConfig = useMapTiles();

  // On touch devices the map is locked until tapped, so scrolling the form past
  // it doesn't get hijacked by map panning. Desktop (fine pointer) stays fully
  // interactive from the start.
  const [mapEngaged, setMapEngaged] = useState(() => !isCoarsePointer());

  // Default center (world view)
  const defaultCenter = { lat: 20, lng: 0 };
  const mapCenter = selectedPosition || initialPosition || defaultCenter;

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

  const handleSearchResultClick = (result: GeocodingResult) => {
    const lat = parseFloat(result.lat);
    const lng = parseFloat(result.lon);

    setSelectedPosition({ lat, lng });
    setSelectedName(result.display_name.split(',')[0]);
    setSelectedAddress(result.display_name);
    setSearchQuery('');
    setSearchResults([]);

    onLocationSelect({
      name: result.display_name.split(',')[0],
      address: result.display_name,
      latitude: lat,
      longitude: lng,
    });
  };

  const handleMapClick = async (latlng: LatLng) => {
    setSelectedPosition({ lat: latlng.lat, lng: latlng.lng });

    // Reverse geocode to get address
    try {
      const result = await geocodingService.reverseGeocode(latlng.lat, latlng.lng);
      if (result) {
        const name = result.display_name.split(',')[0];
        const address = result.display_name;
        setSelectedName(name);
        setSelectedAddress(address);

        onLocationSelect({
          name,
          address,
          latitude: latlng.lat,
          longitude: latlng.lng,
        });
      }
    } catch (error) {
      console.error('Reverse geocode error:', error);
      toast.error('Failed to get address for this location');
    }
  };

  return (
    <div className="space-y-4">
      {/* Search Input */}
      <div className="relative mb-4">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search for a place (e.g., Eiffel Tower, Paris)"
            className="input pr-10 w-full"
          />
          {searching && (
            <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
              <div className="animate-spin h-5 w-5 border-2 border-blue-500 border-t-transparent rounded-full"></div>
            </div>
          )}
        </div>

        {/* Search Results Dropdown */}
        {searchResults.length > 0 && (
          <div className="absolute z-[1000] w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-64 overflow-y-auto">
            {searchResults.map((result) => (
              <button
                key={result.place_id}
                onClick={() => handleSearchResultClick(result)}
                className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0 transition-colors"
              >
                <div className="font-medium text-gray-900 dark:text-white">
                  {result.display_name.split(',')[0]}
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">{result.display_name}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Selected Location Info */}
      {selectedPosition && (
        <div className="bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <div className="text-sm text-blue-900 dark:text-blue-100 break-words">
            <strong>Selected:</strong> {selectedName || 'Custom location'}
          </div>
          {selectedAddress && (
            <div className="text-sm text-blue-700 dark:text-blue-300 mt-1 break-words">{selectedAddress}</div>
          )}
          <div className="text-xs text-blue-600 dark:text-blue-400 mt-1 break-words">
            Coordinates: {selectedPosition.lat.toFixed(6)}, {selectedPosition.lng.toFixed(6)}
          </div>
        </div>
      )}

      {/* Map */}
      <div className="h-56 sm:h-72 md:h-80 lg:h-[400px] rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 relative z-0">
        <MapContainer
          center={[mapCenter.lat, mapCenter.lng]}
          zoom={selectedPosition ? 13 : 2}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%' }}
          className="z-0"
          key={`${mapCenter.lat}-${mapCenter.lng}`}
        >
          <TileLayer
            key={tileConfig.url}
            url={tileConfig.url}
            attribution={tileConfig.attribution}
            maxZoom={tileConfig.maxZoom}
          />
          <MapClickHandler onClick={handleMapClick} />
          <MapInteractivity engaged={mapEngaged} />
          {selectedPosition && (
            <Marker position={[selectedPosition.lat, selectedPosition.lng]} />
          )}
        </MapContainer>

        {/* Tap-to-activate gate (touch only). While locked the map ignores
            gestures, so a drag over it scrolls the form; a tap unlocks it. */}
        {!mapEngaged && (
          <button
            type="button"
            onClick={() => setMapEngaged(true)}
            className="absolute inset-0 z-[500] flex items-end justify-center pb-4 bg-black/5 dark:bg-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50"
            aria-label="Tap to interact with the map"
          >
            <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-white/90 dark:bg-navy-800/90 text-charcoal dark:text-warm-gray shadow-md">
              Tap to interact with the map
            </span>
          </button>
        )}
      </div>

      <p className="text-sm text-gray-600 dark:text-gray-400">
        💡 Search for a place above or tap on the map to select a location
      </p>
    </div>
  );
};

export default LocationSearchMap;
