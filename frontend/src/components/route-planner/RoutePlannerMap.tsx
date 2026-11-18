import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Polyline, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import AppTileLayer from '../AppTileLayer';
import MapTouchGuard from '../map/MapTouchGuard';
import type { TripStop } from '../../types/tripStop';

interface RoutePlannerMapProps {
  stops: TripStop[];
  activeId?: number | null;
  onSelect?: (id: number) => void;
  className?: string;
}

// Dark text on gold: white on this gold fails contrast (see the style guide).
const PIN_FILL = '#FBBF24';
const PIN_TEXT = '#1C1917';
const ROUTE_COLOR = '#D97706';

function numberedIcon(number: number, active: boolean): L.DivIcon {
  const size = active ? 34 : 28;
  return L.divIcon({
    className: 'route-planner-pin',
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${PIN_FILL};color:${PIN_TEXT};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)${
      active ? ',0 0 0 4px rgba(251,191,36,.35)' : ''
    };display:flex;align-items:center;justify-content:center;font:700 ${
      active ? 14 : 12
    }px/1 system-ui,sans-serif;">${number}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** Fits the view to the stops when the set of places changes (not on a plain reorder). */
function FitToPoints({ points }: { points: [number, number][] }) {
  const map = useMap();
  const signature = [...points]
    .map((p) => p.join(','))
    .sort()
    .join('|');

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 8);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40] });
    }
    // `points` is represented by `signature`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, map]);

  return null;
}

/** Leaflet measures its box once; re-measure when the box is resized. */
function InvalidateOnResize() {
  const map = useMap();
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

/**
 * The route as numbered markers joined by a line in visiting order. The marker number is
 * the stop's number in the list beside it. The line is straight between stops: it shows
 * the order, not a road.
 */
export default function RoutePlannerMap({
  stops,
  activeId,
  onSelect,
  className = 'h-full',
}: RoutePlannerMapProps) {
  const points = useMemo<[number, number][]>(
    () => stops.map((s) => [s.latitude, s.longitude]),
    [stops]
  );

  if (stops.length === 0) {
    return (
      <div
        className={`${className} flex items-center justify-center rounded-xl border border-dashed border-primary-500/20 dark:border-navy-700 bg-white/60 dark:bg-navy-800/60 p-6 text-center`}
      >
        <p className="text-sm text-slate dark:text-dusk-400 max-w-xs">
          Add a stop to see the route on the map.
        </p>
      </div>
    );
  }

  return (
    <div
      className={`${className} rounded-xl overflow-hidden border border-primary-500/10 dark:border-navy-700 [@media(pointer:coarse)]:[&_.leaflet-bar_a]:!w-11 [@media(pointer:coarse)]:[&_.leaflet-bar_a]:!h-11 [@media(pointer:coarse)]:[&_.leaflet-bar_a]:!leading-[44px]`}
    >
      <MapContainer
        center={points[0]}
        zoom={6}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
        <AppTileLayer />
        <FitToPoints points={points} />
        <InvalidateOnResize />
        <MapTouchGuard />

        {points.length > 1 && (
          <Polyline
            positions={points}
            pathOptions={{ color: ROUTE_COLOR, weight: 3, opacity: 0.85, lineCap: 'round' }}
          />
        )}

        {stops.map((stop, index) => (
          <Marker
            key={stop.id}
            position={[stop.latitude, stop.longitude]}
            icon={numberedIcon(index + 1, stop.id === activeId)}
            zIndexOffset={stop.id === activeId ? 1000 : 0}
            eventHandlers={{ click: () => onSelect?.(stop.id) }}
            title={`${index + 1}. ${stop.name}`}
          >
            <Tooltip direction="top" offset={[0, -14]}>
              {index + 1}. {stop.name}
            </Tooltip>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
