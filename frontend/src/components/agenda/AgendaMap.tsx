import { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useMapTiles } from '../../hooks/useMapTiles';
import type { AgendaItem } from '../../utils/dayAgenda';

interface AgendaMapProps {
  items: AgendaItem[];
  /** Key of the row that is hovered or selected in the list. */
  activeKey?: string | null;
  onSelect?: (key: string) => void;
  /** Sizing for the map box. It must resolve to a real height. */
  className?: string;
}

// Dark text on gold: white on this gold fails contrast (see the style guide).
const PIN_FILL = '#FBBF24';
const PIN_TEXT = '#1C1917';
const LEG_COLOR = '#D97706';

function numberedIcon(number: number, active: boolean): L.DivIcon {
  const size = active ? 34 : 26;
  return L.divIcon({
    className: 'agenda-pin',
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${PIN_FILL};color:${PIN_TEXT};border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.45)${
      active ? ',0 0 0 4px rgba(251,191,36,.35)' : ''
    };display:flex;align-items:center;justify-content:center;font:700 ${
      active ? 14 : 12
    }px/1 system-ui,sans-serif;">${number}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** Fits the view to the pins whenever the set of pinned places changes. */
function FitToPoints({ points }: { points: [number, number][] }) {
  const map = useMap();
  // A string key so the effect runs when the places change, not on every render.
  const signature = points.map((p) => p.join(',')).join('|');

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 13);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [40, 40], maxZoom: 15 });
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
    const container = map.getContainer();
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(container);
    return () => observer.disconnect();
  }, [map]);
  return null;
}

/**
 * A map of one day's agenda. Each item with coordinates gets a pin carrying
 * the same number as its row in the list. Transport legs are drawn from
 * their start to their end; a faint dashed line joins the pins in order.
 */
export default function AgendaMap({ items, activeKey, onSelect, className = 'h-full' }: AgendaMapProps) {
  const tiles = useMapTiles();

  const pinned = useMemo(() => items.filter((item) => item.point !== null), [items]);

  const points = useMemo<[number, number][]>(() => {
    const all: [number, number][] = [];
    for (const item of pinned) {
      if (item.point) all.push([item.point.latitude, item.point.longitude]);
      if (item.endPoint) all.push([item.endPoint.latitude, item.endPoint.longitude]);
    }
    return all;
  }, [pinned]);

  const order = useMemo<[number, number][]>(
    () =>
      pinned.flatMap((item) =>
        item.point ? [[item.point.latitude, item.point.longitude] as [number, number]] : []
      ),
    [pinned]
  );

  if (pinned.length === 0) {
    return (
      <div
        className={`${className} flex items-center justify-center rounded-xl border border-dashed border-primary-500/20 dark:border-navy-700 bg-white/60 dark:bg-navy-800/60 p-6 text-center`}
      >
        <p className="text-sm text-slate dark:text-dusk-400 max-w-xs">
          {items.length === 0
            ? 'Nothing to show on the map for this day.'
            : 'None of these items has a place attached, so there is nothing to pin. Link a place to an item to see it here.'}
        </p>
      </div>
    );
  }

  return (
    <div className={`${className} rounded-xl overflow-hidden border border-primary-500/10 dark:border-navy-700`}>
      <MapContainer
        center={points[0]}
        zoom={12}
        scrollWheelZoom
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
        <TileLayer key={tiles.url} url={tiles.url} attribution={tiles.attribution} maxZoom={tiles.maxZoom} />
        <FitToPoints points={points} />
        <InvalidateOnResize />

        {order.length > 1 && (
          <Polyline
            positions={order}
            pathOptions={{ color: LEG_COLOR, weight: 2, opacity: 0.55, dashArray: '2 8', lineCap: 'round' }}
          />
        )}

        {pinned.map((item) =>
          item.point && item.endPoint ? (
            <Polyline
              key={`${item.key}-leg`}
              positions={[
                [item.point.latitude, item.point.longitude],
                [item.endPoint.latitude, item.endPoint.longitude],
              ]}
              pathOptions={{ color: LEG_COLOR, weight: 3, opacity: 0.9 }}
            />
          ) : null
        )}

        {pinned.map((item) =>
          item.point ? (
            <Marker
              key={item.key}
              position={[item.point.latitude, item.point.longitude]}
              icon={numberedIcon(item.number, item.key === activeKey)}
              zIndexOffset={item.key === activeKey ? 1000 : 0}
              eventHandlers={{ click: () => onSelect?.(item.key) }}
              title={`${item.number}. ${item.title}`}
            >
              <Tooltip direction="top" offset={[0, -14]}>
                {item.number}. {item.title}
              </Tooltip>
            </Marker>
          ) : null
        )}
      </MapContainer>
    </div>
  );
}
