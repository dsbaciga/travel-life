import { useState, useEffect } from "react";
import LibraryBackLink from "../components/LibraryBackLink";
import locationService from "../services/location.service";
import transportationService from "../services/transportation.service";
import type { Location } from "../types/location";
import type { Transportation } from "../types/transportation";
import toast from "react-hot-toast";
import "leaflet/dist/leaflet.css";

// Import shared utilities
import "../utils/mapUtils"; // This import runs the leaflet icon setup

// Import reusable components
import LoadingSpinner from "../components/LoadingSpinner";
import EmptyState from "../components/EmptyState";
import { CloseIcon } from "../components/icons";
import PlacesVisitedMapContainer from "../components/PlacesVisitedMapContainer";

export default function PlacesVisitedPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [transportation, setTransportation] = useState<Transportation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState<Location | null>(
    null
  );
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favorites, setFavorites] = useState<Location[] | null>(null);
  const [favoritesLoading, setFavoritesLoading] = useState(false);

  useEffect(() => {
    loadVisitedLocations();
  }, []);

  // Lazily load favorites the first time the filter is enabled
  useEffect(() => {
    if (!showFavoritesOnly || favorites !== null) return;
    let cancelled = false;
    setFavoritesLoading(true);
    locationService
      .getFavoriteLocations()
      .then((data) => {
        if (!cancelled) setFavorites(data);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Failed to load favorite locations");
          setShowFavoritesOnly(false);
        }
      })
      .finally(() => {
        if (!cancelled) setFavoritesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showFavoritesOnly, favorites]);

  // When filtering to favorites, only locations with coordinates can be mapped
  const displayedLocations = showFavoritesOnly
    ? (favorites ?? []).filter(
        (loc) => loc.latitude != null && loc.longitude != null
      )
    : locations;

  const loadVisitedLocations = async () => {
    try {
      setLoading(true);
      const [locationData, transportationData] = await Promise.all([
        locationService.getAllVisitedLocations(),
        transportationService.getAllTransportation(),
      ]);
      setLocations(locationData);
      setTransportation(transportationData);
    } catch {
      toast.error("Failed to load visited places");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-[1600px] mx-auto px-4 py-8">
        <LoadingSpinner.FullPage message="Loading your visited places..." />
      </div>
    );
  }

  if (locations.length === 0) {
    return (
      <div className="max-w-[1600px] mx-auto px-4 py-8">
        <LibraryBackLink />
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-6">
          Places Visited
        </h1>
        <EmptyState
          icon="🌍"
          message="No places visited yet"
          subMessage="Locations from completed trips will appear here"
          actionLabel="Go to Trips"
          actionHref="/trips"
        />
      </div>
    );
  }

  return (
    // The page sits inside <main>, which is already inset by the top navbar and
    // (on mobile) the bottom nav. A full 100vh here pushed the bottom of the
    // map underneath both, so the height subtracts that chrome per breakpoint:
    // 4rem+4rem mobile, 5rem+4rem at sm, 5rem+0 from md where the bottom nav is
    // hidden.
    <div className="h-[calc(100vh-8rem)] sm:h-[calc(100vh-9rem)] md:h-[calc(100vh-5rem)] flex flex-col">
      {/* Header — compact on mobile so the map keeps the screen */}
      <div className="bg-white dark:bg-dusk-800 border-b border-gray-200 dark:border-dusk-700 px-4 py-2 md:py-4">
        <div className="max-w-[1600px] mx-auto">
          {/* Small and tight here: this header is kept short so the map keeps the screen. */}
          <LibraryBackLink className="text-sm !mb-0 md:!mb-1" />
          <div className="flex justify-between items-center gap-3">
            <div className="min-w-0">
              <h1 className="text-xl md:text-3xl font-bold text-gray-900 dark:text-white truncate">
                Places Visited
              </h1>
              <p className="text-sm md:text-base text-gray-600 dark:text-dusk-400 md:mt-1 truncate">
                {displayedLocations.length}{" "}
                {displayedLocations.length === 1 ? "location" : "locations"}{" "}
                {showFavoritesOnly
                  ? "marked as favorites"
                  : "from your travels"}
              </p>
            </div>
            <div className="flex items-center gap-4 flex-none">
              <button
                type="button"
                onClick={() => setShowFavoritesOnly((prev) => !prev)}
                aria-pressed={showFavoritesOnly}
                title={
                  showFavoritesOnly
                    ? "Show all visited places"
                    : "Show only favorite locations"
                }
                className={`px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
                  showFavoritesOnly
                    ? "bg-amber-500 dark:bg-gold text-white dark:text-navy-900"
                    : "bg-gray-100 dark:bg-dusk-700 text-gray-700 dark:text-dusk-300 hover:bg-amber-100 dark:hover:bg-dusk-600"
                }`}
              >
                <svg
                  className="w-4 h-4"
                  viewBox="0 0 24 24"
                  fill={showFavoritesOnly ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth={showFavoritesOnly ? 0 : 2}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
                  />
                </svg>
                <span className="hidden sm:inline">
                  {favoritesLoading ? "Loading…" : "Favorites"}
                </span>
              </button>
              <div className="hidden sm:block text-sm text-gray-600 dark:text-dusk-400">
                <span className="inline-flex items-center gap-2">
                  <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
                  Click markers to view details
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Map and Sidebar */}
      <div className="flex-1 flex overflow-hidden">
        {/* Map */}
        <div className="flex-1 relative z-0">
          {showFavoritesOnly && !favoritesLoading && displayedLocations.length === 0 ? (
            <div className="h-full flex items-center justify-center bg-gray-50 dark:bg-dusk-900">
              <EmptyState
                icon="⭐"
                message="No favorite locations yet"
                subMessage="Star locations from a trip's Locations tab to see them here"
              />
            </div>
          ) : (
            <PlacesVisitedMapContainer
              locations={displayedLocations}
              transportation={showFavoritesOnly ? [] : transportation}
            />
          )}
        </div>

        {/* Sidebar - Selected Location Details */}
        {selectedLocation && (
          <div className="w-80 bg-white dark:bg-dusk-800 border-l border-gray-200 dark:border-dusk-700 overflow-y-auto p-6">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Location Details
              </h2>
              <button
                onClick={() => setSelectedLocation(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-dusk-200"
                aria-label="Close location details"
              >
                <CloseIcon />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-1">
                  {selectedLocation.name}
                </h3>
                {selectedLocation.category && (
                  <p className="text-sm text-gray-600 dark:text-dusk-400">
                    {selectedLocation.category.icon}{" "}
                    {selectedLocation.category.name}
                  </p>
                )}
              </div>

              {selectedLocation.address && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
                    Address
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-dusk-400">
                    {selectedLocation.address}
                  </p>
                </div>
              )}

              {selectedLocation.notes && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
                    Notes
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-dusk-400 whitespace-pre-wrap">
                    {selectedLocation.notes}
                  </p>
                </div>
              )}

              {selectedLocation.latitude && selectedLocation.longitude && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 dark:text-dusk-300 mb-1">
                    Coordinates
                  </h4>
                  <p className="text-sm text-gray-600 dark:text-dusk-400 font-mono">
                    {Number(selectedLocation.latitude).toFixed(6)},{" "}
                    {Number(selectedLocation.longitude).toFixed(6)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}