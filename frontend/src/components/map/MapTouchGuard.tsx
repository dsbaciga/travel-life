import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

// True when the primary pointer is touch (phones/tablets).
const isCoarsePointer = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(pointer: coarse)').matches;

interface MapTouchGuardProps {
  /** Text on the pill and the accessible name of the unlock button. */
  label?: string;
}

/**
 * Stops a map from trapping page scrolling on touch screens.
 *
 * Render it as a child of a react-leaflet `MapContainer`. On a touch device the
 * map starts locked: its gesture handlers are off, so a one-finger drag over it
 * scrolls the page, and a "Tap to interact" overlay covers it. One tap unlocks
 * the map for the rest of its life. On mouse devices it renders nothing.
 *
 * Only the handlers that were enabled when the map was created are restored, so
 * a map built with `scrollWheelZoom={false}` keeps that setting.
 */
export default function MapTouchGuard({ label = 'Tap to interact with the map' }: MapTouchGuardProps) {
  const map = useMap();
  const [engaged, setEngaged] = useState(() => !isCoarsePointer());
  const handlersRef = useRef<L.Handler[] | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (handlersRef.current === null) {
      handlersRef.current = [
        map.dragging,
        map.touchZoom,
        map.doubleClickZoom,
        map.scrollWheelZoom,
        map.boxZoom,
        map.keyboard,
      ].filter((handler): handler is L.Handler => Boolean(handler?.enabled()));
    }
    handlersRef.current.forEach((handler) => (engaged ? handler.enable() : handler.disable()));
  }, [engaged, map]);

  // Leaflet listens on the container natively, so the unlocking tap would also
  // reach the map (placing a marker, opening a popup) unless it is stopped here.
  useEffect(() => {
    if (buttonRef.current) L.DomEvent.disableClickPropagation(buttonRef.current);
  }, [engaged]);

  if (engaged) return null;

  return createPortal(
    <button
      ref={buttonRef}
      type="button"
      onClick={() => setEngaged(true)}
      aria-label={label}
      className="absolute inset-0 z-[1000] flex items-end justify-center pb-4 bg-black/5 dark:bg-black/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:focus-visible:ring-gold/50"
    >
      <span className="px-3 py-1.5 rounded-full text-sm font-medium bg-white/90 dark:bg-navy-800/90 text-charcoal dark:text-warm-gray shadow-md">
        {label}
      </span>
    </button>,
    map.getContainer()
  );
}
