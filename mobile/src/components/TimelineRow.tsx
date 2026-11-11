/**
 * One row of a day timeline. Tap opens the entity; long-press offers the live
 * itinerary adjustments (nudge, move day, all-day, reorder, transit actuals).
 */
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { EntityId } from '@travel-life/shared';
import { formatTimeInTimezone, getTimezoneAbbreviation } from '@travel-life/shared';
import { adjustTime, logTransitActual } from '../domain/mutations';
import type { TimelineItem } from '../domain/timeline';
import { getDb } from '../lib/db';
import { notifyLocalChange } from '../lib/sync';
import { showActionSheet, type SheetAction } from './ActionSheet';
import { radius, spacing, usePalette, useTypeColors, type TypeColorKey } from '../lib/theme';
import { AppText, Card, Chip, Row } from './ui';

interface TimelineRowProps {
  item: TimelineItem;
  tripId: number;
  dayKey: string;
  /** Unsynced changes are waiting for this entity. */
  pending: boolean;
  /** The trip's zone; an item in another zone shows its abbreviation. */
  tripTimezone: string;
  /** Present on activities when the day can be reordered. */
  onMove?: (entityId: EntityId, direction: -1 | 1) => void;
}

const ICONS: Readonly<Record<TimelineItem['type'], string>> = {
  ACTIVITY: '📍',
  TRANSPORTATION: '🚆',
  LODGING_CHECK_IN: '🛏️',
  LODGING_CHECK_OUT: '🧳',
  CUSTOM_ITEM: '📌',
};

const COLOR_KEYS: Readonly<Record<TimelineItem['type'], TypeColorKey>> = {
  ACTIVITY: 'ACTIVITY',
  TRANSPORTATION: 'TRANSPORTATION',
  LODGING_CHECK_IN: 'LODGING',
  LODGING_CHECK_OUT: 'LODGING',
  CUSTOM_ITEM: 'CUSTOM_ITEM',
};

async function apply(work: () => Promise<unknown>): Promise<void> {
  await work();
  await Haptics.selectionAsync().catch(() => undefined);
  await notifyLocalChange();
}

function TimelineRow({ item, tripId, dayKey, pending, tripTimezone, onMove }: TimelineRowProps) {
  const palette = usePalette();
  const [typeColor, typeWash] = useTypeColors()[COLOR_KEYS[item.type]];

  const open = () =>
    router.push({
      pathname: '/entity/[kind]/[id]',
      params: { kind: item.entityKind, id: String(item.entityId), tripId: String(tripId) },
    });

  const showActions = () => {
    const buttons: SheetAction[] = [];

    if (item.entityKind === 'ACTIVITY' || item.entityKind === 'CUSTOM_ITEM') {
      const kind = item.entityKind;
      const adjust = (adjustment: Parameters<typeof adjustTime>[3]) => () =>
        apply(async () => adjustTime(await getDb(), kind, item.entityId, adjustment, item.timezone));
      if (!item.allDay && item.start) {
        buttons.push({ label: '+30 min', onPress: adjust({ type: 'shift', minutes: 30 }) });
        buttons.push({ label: '+1 hour', onPress: adjust({ type: 'shift', minutes: 60 }) });
        buttons.push({ label: '−30 min', onPress: adjust({ type: 'shift', minutes: -30 }) });
      }
      buttons.push({ label: 'Move to tomorrow', onPress: adjust({ type: 'moveDays', days: 1 }) });
      if (!item.allDay) {
        buttons.push({
          label: 'Make all-day',
          onPress: adjust({ type: 'allDay', fallbackDayKey: dayKey }),
        });
      }
      if (onMove && item.entityKind === 'ACTIVITY') {
        buttons.push({ label: 'Move up', onPress: () => onMove(item.entityId, -1) });
        buttons.push({ label: 'Move down', onPress: () => onMove(item.entityId, 1) });
      }
    }

    if (item.entityKind === 'TRANSPORTATION') {
      const log = (event: Parameters<typeof logTransitActual>[2]) => () =>
        apply(async () => logTransitActual(await getDb(), item.entityId, event));
      buttons.push({ label: 'Departed now', onPress: log('departed') });
      buttons.push({ label: 'Arrived now', onPress: log('arrived') });
      buttons.push({ label: 'Mark cancelled', destructive: true, onPress: log('cancelled') });
    }

    if (item.confirmation) {
      const code = item.confirmation;
      buttons.push({
        label: `Copy ${code}`,
        onPress: () => {
          void Clipboard.setStringAsync(code);
        },
      });
    }
    showActionSheet(item.title, buttons, 'Adjust this item');
  };

  const time = item.allDay
    ? 'All day'
    : item.start
      ? `${formatTimeInTimezone(item.start, item.timezone)}${
          item.end ? `–${formatTimeInTimezone(item.end, item.timezone)}` : ''
        }${
          item.timezone !== tripTimezone
            ? ` ${getTimezoneAbbreviation(item.timezone, new Date(item.start))}`
            : ''
        }`
      : 'Unscheduled';

  return (
    <Card
      onPress={open}
      onLongPress={showActions}
      accessibilityLabel={`${item.title}, ${time}. Long press to adjust.`}>
      <View style={styles.layout}>
        <View style={[styles.badge, { backgroundColor: typeWash }]}>
          <AppText style={styles.badgeGlyph}>{ICONS[item.type]}</AppText>
        </View>
        <View style={styles.body}>
          <Row style={styles.header}>
            <AppText variant="label" color={typeColor}>
              {time}
            </AppText>
            <Row>
              {item.status === 'delayed' ? (
                <Chip
                  label={item.delayMinutes ? `Delayed ${item.delayMinutes}m` : 'Delayed'}
                  tone="warning"
                />
              ) : null}
              {item.status === 'cancelled' ? <Chip label="Cancelled" tone="danger" /> : null}
              {pending ? <Chip label="Not synced" tone="info" /> : null}
            </Row>
          </Row>
          <AppText variant="heading" numberOfLines={2}>
            {item.title}
          </AppText>
          {item.subtitle ? (
            <AppText muted numberOfLines={1}>
              {item.subtitle}
            </AppText>
          ) : null}
          {item.confirmation ? (
            <View style={[styles.code, { backgroundColor: palette.surfaceRaised }]}>
              <AppText variant="label" selectable>
                {item.confirmation}
              </AppText>
            </View>
          ) : null}
        </View>
      </View>
    </Card>
  );
}

export default memo(TimelineRow);

const styles = StyleSheet.create({
  layout: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  badge: { width: 40, height: 40, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  badgeGlyph: { fontSize: 18, lineHeight: 24 },
  body: { flex: 1, gap: spacing.xs },
  header: { justifyContent: 'space-between' },
  code: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 6 },
});
