import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  buildMapsAppLinks,
  describeRoute,
  hasUsableLocation,
  resolvePlace,
  type MapsPlace,
  type TravelMode,
} from '../lib/mapsDeepLinks';
import { useMapsPreferences } from '../hooks/useMapsPreferences';

interface DirectionsButtonProps {
  /** Where the user wants to go. Nothing renders if it has no usable location. */
  destination: MapsPlace;
  /**
   * Where they are coming from — normally the previous itinerary item, which
   * is what makes this useful on the ground (hotel to restaurant, not just a
   * bare pin). Omit to let the maps app use the device's current location.
   */
  origin?: MapsPlace | null;
  mode?: TravelMode;
  /** `icon` is a 44x44 square; `inline` adds a visible "Directions" label. */
  variant?: 'icon' | 'inline';
  className?: string;
}

function NavigationIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 3l7.5 17-7.5-4-7.5 4L12 3z"
      />
    </svg>
  );
}

/**
 * One tap from an itinerary item to turn-by-turn directions in the user's
 * maps app, with origin and destination pre-filled.
 *
 * Renders nothing when the destination has neither coordinates, an address,
 * nor a name — a "Directions" button that cannot produce a route is worse
 * than no button at all.
 */
export default function DirectionsButton({
  destination,
  origin = null,
  mode = 'driving',
  variant = 'icon',
  className = '',
}: DirectionsButtonProps) {
  const { preferredApp, platform } = useMapsPreferences();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  // Only treat the origin as real if it can actually be turned into a route
  // start; a journal entry with no place must not blank out the whole button.
  const usableOrigin = hasUsableLocation(origin) ? origin : null;

  const links = useMemo(
    () =>
      buildMapsAppLinks(
        { destination, origin: usableOrigin, mode, platform },
        preferredApp
      ),
    [destination, usableOrigin, mode, platform, preferredApp]
  );

  const routeDescription = describeRoute({ destination, origin: usableOrigin });
  const originLabel = useMemo(() => {
    const resolved = resolvePlace(usableOrigin);
    if (resolved === null) return null;
    return resolved.kind === 'coords' ? resolved.label : resolved.query;
  }, [usableOrigin]);

  // Close on outside click and on Escape.
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      const target = event.target;
      if (target instanceof Node && containerRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  if (links.length === 0) return null;

  const isInline = variant === 'inline';

  return (
    <div ref={containerRef} className={`relative print:hidden ${className}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((open) => !open);
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={isOpen ? menuId : undefined}
        aria-label={routeDescription}
        title={routeDescription}
        className={`min-w-[44px] min-h-[44px] flex items-center justify-center gap-1.5 rounded-lg transition-colors text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 dark:hover:text-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:focus-visible:ring-blue-400/50 ${
          isInline ? 'px-3 text-sm font-medium' : 'p-2'
        } ${isOpen ? 'text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/30' : ''}`}
      >
        <NavigationIcon className={isInline ? 'w-4 h-4' : 'w-5 h-5'} />
        {isInline && <span>Directions</span>}
      </button>

      {isOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label="Open directions in"
          className="absolute right-0 z-30 mt-1 w-64 rounded-lg border border-gray-200 dark:border-dusk-700 bg-white dark:bg-dusk-800 shadow-lg py-1 animate-scale-in"
        >
          <div className="px-3 py-2 border-b border-gray-100 dark:border-dusk-700">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-dusk-400">
              Open directions in
            </p>
            {originLabel !== null && (
              <p className="mt-1 text-xs text-gray-500 dark:text-dusk-400 line-clamp-2">
                From {originLabel}
              </p>
            )}
          </div>

          {links.map((link) => (
            <a
              key={link.app}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
              className="flex items-center justify-between gap-2 px-3 py-2 min-h-[44px] text-sm text-gray-700 dark:text-dusk-200 hover:bg-gray-100 dark:hover:bg-dusk-700 focus-visible:outline-none focus-visible:bg-gray-100 dark:focus-visible:bg-dusk-700"
            >
              <span className="truncate">{link.label}</span>
              {link.app === preferredApp && (
                <span className="shrink-0 text-xs font-medium text-blue-600 dark:text-blue-400">
                  Default
                </span>
              )}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
