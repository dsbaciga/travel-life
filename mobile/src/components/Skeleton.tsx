/**
 * Placeholder blocks shown while a screen reads its first data, so the screen
 * keeps its shape instead of flashing blank. SQLite reads are quick, so these
 * usually show for a moment only; the gentle pulse keeps that from looking
 * broken when a read is slow (a large trip on an older phone).
 */
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, StyleSheet, View, type DimensionValue } from 'react-native';

import { radius, spacing, usePalette } from '../lib/theme';

function usePulse(): Animated.Value {
  const [pulse] = useState(() => new Animated.Value(0.5));
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || cancelled) return;
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0.5, duration: 700, useNativeDriver: true }),
        ])
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [pulse]);
  return pulse;
}

interface BlockProps {
  width?: DimensionValue;
  height: number;
  rounded?: number;
}

export function SkeletonBlock({ width = '100%', height, rounded = radius.sm }: BlockProps) {
  const palette = usePalette();
  const pulse = usePulse();
  return (
    <Animated.View
      style={{ width, height, borderRadius: rounded, backgroundColor: palette.surfaceRaised, opacity: pulse }}
    />
  );
}

/** A card-shaped placeholder: a badge and a few lines, like a timeline row. */
export function SkeletonCard() {
  const palette = usePalette();
  return (
    <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <SkeletonBlock width={40} height={40} rounded={radius.md} />
      <View style={styles.lines}>
        <SkeletonBlock width="35%" height={12} />
        <SkeletonBlock width="80%" height={18} />
        <SkeletonBlock width="55%" height={14} />
      </View>
    </View>
  );
}

/** Stand-in for a whole list screen: a title block and a few cards. */
export function SkeletonList({ count = 3 }: { count?: number }) {
  return (
    <View
      accessible
      accessibilityLabel="Loading"
      accessibilityState={{ busy: true }}
      style={styles.list}>
      <SkeletonBlock width="60%" height={28} />
      <SkeletonBlock width="40%" height={16} />
      <View style={styles.gap} />
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </View>
  );
}

/** Stand-in for a form: label and input pairs. */
export function SkeletonForm({ fields = 4 }: { fields?: number }) {
  return (
    <View
      accessible
      accessibilityLabel="Loading"
      accessibilityState={{ busy: true }}
      style={styles.list}>
      {Array.from({ length: fields }, (_, index) => (
        <View key={index} style={styles.field}>
          <SkeletonBlock width="30%" height={12} />
          <SkeletonBlock height={44} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  gap: { height: spacing.sm },
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  lines: { flex: 1, gap: spacing.sm },
  field: { gap: spacing.xs },
});
