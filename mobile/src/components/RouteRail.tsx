/**
 * The left rail of a day timeline: a stop marker plus the legs of the route
 * line above and below it. Rows are stacked edge to edge, so each row draws the
 * half-leg into and out of its own marker and the pieces join up.
 *
 * Solid gold where the traveller has been, dashed (4 on, 5 off, 2 wide) ahead.
 * The current or next stop is a filled gold marker with a soft halo, past stops
 * are muted, and upcoming ones are outlined in their type colour.
 */
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Line } from 'react-native-svg';
import type { RouteSegmentStyle, RouteStop } from '@travel-life/shared';

import Icon, { type IconName } from './Icon';
import { useResolvedColorScheme, usePalette, useTypeColors, type TypeColorKey } from '../lib/theme';

export const RAIL_WIDTH = 36;
export const MARKER_SIZE = 30;
const LINE_WIDTH = 2;
const CENTER = RAIL_WIDTH / 2;

interface RouteRailProps {
  stop: RouteStop;
  /** Leg arriving at this stop; omit for the first stop. */
  above?: RouteSegmentStyle;
  /** Leg leaving this stop; omit for the last stop. */
  below?: RouteSegmentStyle;
  typeKey: TypeColorKey;
  icon: IconName;
}

function Leg({ style, half }: { style: RouteSegmentStyle; half: 'above' | 'below' }) {
  const palette = usePalette();
  const dark = useResolvedColorScheme() === 'dark';
  // The upper half-leg ends at the marker's centre; the lower one starts there.
  const position = half === 'above' ? { top: 0, height: MARKER_SIZE / 2 } : { top: MARKER_SIZE / 2, bottom: 0 };
  if (style === 'solid') {
    return (
      <View
        pointerEvents="none"
        style={[
          styles.leg,
          position,
          { left: CENTER - LINE_WIDTH / 2, width: LINE_WIDTH, backgroundColor: dark ? palette.primary : palette.accent },
        ]}
      />
    );
  }
  return (
    <Svg pointerEvents="none" style={[styles.leg, position, { left: 0, width: RAIL_WIDTH }]}>
      <Line
        x1={CENTER}
        x2={CENTER}
        y1={0}
        y2="100%"
        stroke={palette.textMuted}
        strokeOpacity={0.5}
        strokeWidth={LINE_WIDTH}
        strokeDasharray="4 5"
      />
    </Svg>
  );
}

function RouteRail({ stop, above, below, typeKey, icon }: RouteRailProps) {
  const palette = usePalette();
  const [typeColor, typeWash] = useTypeColors()[typeKey];

  const marker =
    stop === 'next'
      ? { backgroundColor: palette.primary, borderColor: palette.tint, borderWidth: 4, color: palette.onPrimary }
      : stop === 'past'
        ? { backgroundColor: palette.surfaceRaised, borderColor: palette.surfaceRaised, borderWidth: 2, color: palette.textMuted }
        : { backgroundColor: typeWash, borderColor: typeColor, borderWidth: 2, color: typeColor };

  return (
    <View style={styles.rail} accessible={false} importantForAccessibility="no-hide-descendants">
      {above ? <Leg style={above} half="above" /> : null}
      {below ? <Leg style={below} half="below" /> : null}
      <View
        style={[
          styles.marker,
          {
            // Opaque base so the line never shows through a translucent wash.
            backgroundColor: palette.background,
            borderColor: marker.borderColor,
            borderWidth: marker.borderWidth,
          },
        ]}>
        <View style={[StyleSheet.absoluteFill, styles.wash, { backgroundColor: marker.backgroundColor }]} />
        <Icon name={icon} size={stop === 'next' ? 15 : 16} color={marker.color} />
      </View>
    </View>
  );
}

export default memo(RouteRail);

const styles = StyleSheet.create({
  rail: { width: RAIL_WIDTH, alignSelf: 'stretch', alignItems: 'center' },
  leg: { position: 'absolute' },
  wash: { borderRadius: MARKER_SIZE / 2 },
  marker: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: MARKER_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
