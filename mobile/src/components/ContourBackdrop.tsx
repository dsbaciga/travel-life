/**
 * Faint topographic contour lines: a decorative layer for hero areas and empty
 * states. Fills its parent (absolute), takes no touches and is hidden from
 * accessibility. Gold at ~8% on dark, charcoal at ~6% on light; gold at ~10%
 * on a hero card (`onHero`), which is dark in both schemes.
 *
 * Put it as the first child of a `overflow: 'hidden'` container, before the
 * content that should sit on top of it.
 */
import { memo, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { generateContours } from '@travel-life/shared';

import { contourStroke } from '../lib/contourStroke';
import { useResolvedColorScheme, usePalette } from '../lib/theme';

interface ContourBackdropProps {
  /** Stable per trip: the trip id, or `contourSeed` of id and destination. */
  seed: string | number;
  /** Closed paths to draw. Default 8. */
  count?: number;
  /** On a hero card (dark in both schemes): gold at ~10% instead of the scheme-based stroke. */
  onHero?: boolean;
}

const WIDTH = 600;
const HEIGHT = 300;

function ContourBackdrop({ seed, count = 8, onHero = false }: ContourBackdropProps) {
  const palette = usePalette();
  const dark = useResolvedColorScheme() === 'dark';
  const stroke = contourStroke(palette, dark, onHero);
  const paths = useMemo(() => generateContours({ seed, width: WIDTH, height: HEIGHT, count }), [seed, count]);

  return (
    <Svg
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
      width="100%"
      height="100%"
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMidYMid slice">
      <G
        fill="none"
        stroke={stroke.color}
        strokeOpacity={stroke.opacity}
        strokeWidth={1.25}>
        {paths.map((d, index) => (
          <Path key={index} d={d} vectorEffect="non-scaling-stroke" />
        ))}
      </G>
    </Svg>
  );
}

export default memo(ContourBackdrop);
