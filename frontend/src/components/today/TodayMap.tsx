import { lazy, Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import locationService from '../../services/location.service';
import transportationService from '../../services/transportation.service';
import type { AgendaItem } from '../../utils/dayAgenda';
import type { Location } from '../../types/location';
import type { Transportation } from '../../types/transportation';

// Leaflet is large; keep it out of the landing page's first chunk.
const AgendaMap = lazy(() => import('../agenda/AgendaMap'));
const PlacesVisitedMapContainer = lazy(() => import('../PlacesVisitedMapContainer'));
const PhotosMapView = lazy(() => import('../PhotosMapView'));

export type MapScope = 'today' | 'trip' | 'photos' | 'all';

interface TodayMapProps {
  /** Today's agenda on the current trip. Empty when no trip is under way. */
  agenda: AgendaItem[];
  activeKey: string | null;
  onSelect: (key: string) => void;
  /** Whether a trip is in progress today, i.e. whether "Today" means anything. */
  hasToday: boolean;
  /** The current or next trip's places and legs, for the "This trip" scope. */
  tripLocations: Location[];
  tripTransportation: Transportation[];
  hasTrip: boolean;
  /** The current or next trip, for the "Photos" scope. */
  tripId: number | null;
}

const SCOPE_LABELS: Record<MapScope, string> = {
  today: 'Today',
  trip: 'This trip',
  photos: 'Photos',
  all: 'All trips',
};

function MapFallback() {
  return (
    <div className="h-full rounded-xl bg-white/60 dark:bg-navy-800/60 border border-primary-500/10 dark:border-navy-700 animate-pulse" />
  );
}

function EmptyMap({ message }: { message: string }) {
  return (
    <div className="h-full flex items-center justify-center rounded-xl border border-dashed border-primary-500/20 dark:border-navy-700 bg-white/60 dark:bg-navy-800/60 p-6 text-center">
      <p className="text-sm text-slate dark:text-dusk-400 max-w-xs">{message}</p>
    </div>
  );
}

/**
 * The map half of the Today screen, with a scope switch. It opens on the
 * narrowest scope that has something to show: today's pins during a trip,
 * otherwise the trip, otherwise everywhere the user has been. Photos
 * shows where the trip's photos were taken.
 */
export default function TodayMap({
  agenda,
  activeKey,
  onSelect,
  hasToday,
  tripLocations,
  tripTransportation,
  hasTrip,
  tripId,
}: TodayMapProps) {
  const scopes: MapScope[] = [
    ...(hasToday ? (['today'] as const) : []),
    ...(hasTrip ? (['trip'] as const) : []),
    ...(tripId != null ? (['photos'] as const) : []),
    'all',
  ];
  const todayHasPins = agenda.some((item) => item.point !== null);
  const defaultScope: MapScope = hasToday && todayHasPins ? 'today' : hasTrip ? 'trip' : 'all';

  // Null until the user picks one, so the default can still change as data arrives.
  const [chosen, setChosen] = useState<MapScope | null>(null);
  const scope = chosen && scopes.includes(chosen) ? chosen : defaultScope;

  const { data: allPlaces } = useQuery({
    queryKey: ['today-map', 'all-places'],
    queryFn: async () => {
      const [locations, transportation] = await Promise.all([
        locationService.getAllVisitedLocations(),
        transportationService.getAllTransportation(),
      ]);
      return { locations, transportation };
    },
    enabled: scope === 'all',
    staleTime: 5 * 60 * 1000,
  });

  const hasCoords = (locations: Location[]) =>
    locations.some((location) => location.latitude != null && location.longitude != null);

  return (
    <div className="h-full flex flex-col gap-2">
      {scopes.length > 1 && (
        <div
          role="group"
          aria-label="Map shows"
          className="flex-none self-start inline-flex rounded-lg border border-primary-500/15 dark:border-navy-700 bg-white dark:bg-navy-800 p-0.5"
        >
          {scopes.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={scope === option}
              onClick={() => setChosen(option)}
              className={`min-h-[36px] px-3 text-sm font-medium rounded-md transition-colors ${
                scope === option
                  ? 'bg-primary-50 dark:bg-navy-700 text-primary-700 dark:text-white'
                  : 'text-slate dark:text-dusk-400 hover:text-primary-600 dark:hover:text-white'
              }`}
            >
              {SCOPE_LABELS[option]}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 min-h-0">
        <Suspense fallback={<MapFallback />}>
          {scope === 'today' && (
            <AgendaMap items={agenda} activeKey={activeKey} onSelect={onSelect} className="h-full" />
          )}

          {scope === 'trip' &&
            (hasCoords(tripLocations) ? (
              <div className="h-full rounded-xl overflow-hidden border border-primary-500/10 dark:border-navy-700">
                <PlacesVisitedMapContainer locations={tripLocations} transportation={tripTransportation} />
              </div>
            ) : (
              <EmptyMap message="This trip has no places with coordinates yet." />
            ))}

          {scope === 'photos' && tripId != null && (
            // PhotosMapView sizes its own map and says so when no photo has a place.
            <div className="h-full overflow-y-auto">
              <PhotosMapView tripId={tripId} fetchAllPhotos showLegend={false} />
            </div>
          )}

          {scope === 'all' &&
            (!allPlaces ? (
              <MapFallback />
            ) : hasCoords(allPlaces.locations) ? (
              <div className="h-full rounded-xl overflow-hidden border border-primary-500/10 dark:border-navy-700">
                <PlacesVisitedMapContainer
                  locations={allPlaces.locations}
                  transportation={allPlaces.transportation}
                />
              </div>
            ) : (
              <EmptyMap message="Places you add to trips will appear here." />
            ))}
        </Suspense>
      </div>
    </div>
  );
}
