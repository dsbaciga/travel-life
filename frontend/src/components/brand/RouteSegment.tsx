import type { RouteSegmentStyle } from '../../lib/vendored/routeProgress';

interface RouteSegmentProps {
  style: RouteSegmentStyle;
  /** Offsets the line to run centre-to-centre between two stop markers. */
  className?: string;
}

/**
 * One leg of the route line: solid gold where the traveller has been, a 2px
 * dashed line (4px dash, 5px gap) where they have yet to go. Decorative.
 */
export default function RouteSegment({ style, className = '' }: RouteSegmentProps) {
  if (style === 'solid') {
    return (
      <div
        aria-hidden="true"
        data-route-segment="solid"
        className={`absolute left-1/2 w-0.5 -translate-x-1/2 bg-accent-500 dark:bg-gold ${className}`}
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      data-route-segment="dashed"
      className={`absolute left-1/2 w-0.5 -translate-x-1/2 text-gray-300 dark:text-dusk-500 ${className}`}
      style={{
        backgroundImage:
          'repeating-linear-gradient(to bottom, currentColor 0, currentColor 4px, transparent 4px, transparent 9px)',
      }}
    />
  );
}
