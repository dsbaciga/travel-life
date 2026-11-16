import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Popup, useMap } from 'react-leaflet';
import { Link } from 'react-router';
import 'leaflet/dist/leaflet.css';
import { L } from '../../utils/mapUtils';
import AppTileLayer from '../AppTileLayer';
import type { TripComparison } from '../../types/tripComparison';
import { tripColor } from '../../utils/tripComparison';

interface ComparisonMapProps {
  comparison: TripComparison;
}

function FitToLocations({ points }: { points: Array<[number, number]> }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 10);
      return;
    }
    map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
  }, [map, points]);
  return null;
}

/** A numbered, white-outlined disc: readable on light and dark tiles, and the number is the non-colour cue. */
function makeIcon(index: number): L.DivIcon {
  const { fill, text } = tripColor(index);
  return L.divIcon({
    className: '',
    html: `<div style="width:26px;height:26px;border-radius:50%;background:${fill};color:${text};border:2px solid #fff;box-shadow:0 0 0 1px rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;font:700 12px/1 system-ui,sans-serif;">${index + 1}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
    popupAnchor: [0, -13],
  });
}

/**
 * All selected trips on one map. The caller's payload already omits locations
 * flagged `excludeFromMap` and ones without coordinates.
 */
export default function ComparisonMap({ comparison }: ComparisonMapProps) {
  const { trips, locations } = comparison;

  const indexById = useMemo(() => new Map(trips.map((trip, i) => [trip.id, i])), [trips]);
  const titleById = useMemo(() => new Map(trips.map((trip) => [trip.id, trip.title])), [trips]);
  const icons = useMemo(() => trips.map((_, i) => makeIcon(i)), [trips]);
  const points = useMemo<Array<[number, number]>>(
    () => locations.map((loc) => [loc.latitude, loc.longitude]),
    [locations]
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-2" aria-label="Map legend" data-testid="map-legend">
        {trips.map((trip, index) => (
          <span
            key={trip.id}
            className="inline-flex items-center gap-2 text-sm text-charcoal dark:text-warm-gray"
          >
            <span
              aria-hidden="true"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-white text-xs font-bold ring-1 ring-black/50"
              style={{ backgroundColor: tripColor(index).fill, color: tripColor(index).text }}
            >
              {index + 1}
            </span>
            {trip.title}
          </span>
        ))}
      </div>
      {locations.length === 0 ? (
        <p className="rounded-xl border-2 border-primary-100 dark:border-gold/20 bg-white dark:bg-navy-800 p-6 text-center text-slate dark:text-warm-gray/70">
          None of these trips have locations with coordinates to show on a map.
        </p>
      ) : (
        <div className="h-[420px] overflow-hidden rounded-xl border-2 border-primary-100 dark:border-gold/20">
          <MapContainer
            center={points[0]}
            zoom={3}
            scrollWheelZoom
            style={{ height: '100%', width: '100%' }}
            className="z-0"
          >
            <AppTileLayer />
            <FitToLocations points={points} />
            {locations.map((loc) => {
              const index = indexById.get(loc.tripId) ?? 0;
              return (
                <Marker key={loc.id} position={[loc.latitude, loc.longitude]} icon={icons[index]}>
                  <Popup>
                    <div className="p-1">
                      <p className="text-xs font-semibold text-gray-600">
                        Trip {index + 1}: {titleById.get(loc.tripId)}
                      </p>
                      <h3 className="font-semibold text-gray-900">{loc.name}</h3>
                      {loc.address && <p className="text-sm text-gray-600">{loc.address}</p>}
                      <Link
                        to={`/trips/${loc.tripId}`}
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        View trip
                      </Link>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>
        </div>
      )}
    </div>
  );
}
