/**
 * Budget at a glance: a bar of what is spent, with a tick where spending would
 * be if it kept pace with the days gone. Fill past the tick means ahead of plan.
 */
import { StyleSheet, View } from 'react-native';

import type { BurnRate } from '../domain/smart';
import { describeBudget } from '../lib/summaries';
import { radius, spacing, usePalette, type Palette } from '../lib/theme';
import { AppText, Row } from './ui';

const toneColor = (palette: Palette, tone: ReturnType<typeof describeBudget>['tone']): string =>
  tone === 'danger' ? palette.danger : tone === 'success' ? palette.success : palette.primary;

export default function BudgetMeter({ burn, currency }: { burn: BurnRate; currency: string | null | undefined }) {
  const palette = usePalette();
  const summary = describeBudget(burn, currency);
  const color = toneColor(palette, summary.tone);
  return (
    <View
      accessible
      accessibilityLabel={`Budget: ${summary.amounts}. ${summary.verdict}, ${summary.pace}.`}
      style={styles.meter}>
      <Row style={styles.between}>
        <AppText variant="label">{summary.amounts}</AppText>
        <AppText variant="label" color={color}>
          {summary.verdict}
        </AppText>
      </Row>
      <View style={[styles.track, { backgroundColor: palette.surfaceRaised }]}>
        <View style={[styles.fill, { backgroundColor: color, width: `${summary.fill * 100}%` }]} />
        <View style={[styles.marker, { backgroundColor: palette.text, left: `${summary.marker * 100}%` }]} />
      </View>
      <AppText variant="caption" muted>
        {summary.pace}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  meter: { gap: spacing.xs },
  between: { justifyContent: 'space-between', flexWrap: 'nowrap' },
  track: { height: 8, borderRadius: radius.pill, overflow: 'visible', justifyContent: 'center' },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radius.pill },
  marker: { position: 'absolute', width: 2, height: 14, marginLeft: -1, borderRadius: 1 },
});
