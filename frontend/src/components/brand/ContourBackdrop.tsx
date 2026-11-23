import { memo, useMemo } from 'react';
import { generateContours } from '../../lib/vendored/contours';

interface ContourBackdropProps {
  /** Stable per trip: the trip id, or `contourSeed` of id and destination. */
  seed: string | number;
  /** Closed paths to draw. Default 8. */
  count?: number;
  /** Extra classes, e.g. to override the stroke colour. */
  className?: string;
}

const WIDTH = 600;
const HEIGHT = 300;

/**
 * Faint topographic contour lines, a decorative layer for hero areas and empty
 * states. Fills its nearest positioned ancestor, never takes pointer events and
 * is hidden from assistive tech. Charcoal at ~10% on light, gold at ~8% on dark.
 *
 * Drop it in as the first child of a `relative overflow-hidden` container.
 */
function ContourBackdrop({ seed, count = 8, className = '' }: ContourBackdropProps) {
  const paths = useMemo(
    () => generateContours({ seed, width: WIDTH, height: HEIGHT, count }),
    [seed, count]
  );

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid slice"
      className={`pointer-events-none absolute inset-0 h-full w-full text-charcoal/[0.10] dark:text-gold/[0.08] ${className}`}
    >
      <g fill="none" stroke="currentColor" strokeWidth={1.25}>
        {paths.map((d, index) => (
          <path key={index} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </g>
    </svg>
  );
}

export default memo(ContourBackdrop);
