/**
 * One row of a day timeline. Tap opens the entity; long-press offers the live
 * itinerary adjustments (nudge, move day, all-day, reorder, transit actuals).
 */
import { router } from 'expo-router';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import type { EntityId, SyncEntityMap } from '@travel-life/shared';
import { formatTimeInTimezone, getTimezoneAbbreviation } from '@travel-life/shared';
import { getEntity } from '../db/repository';
import { adjustTime, logTransitActual, reorderActivities, updateEntity } from '../domain/mutations';
import type { TimelineItem } from '../domain/timeline';
import { getDb } from '../lib/db';
import { copyWithFeedback, tapFeedback } from '../lib/feedback';
import { notifyLocalChange } from '../lib/sync';
import { showToast } from '../lib/toast';
import Icon, { type IconName } from './Icon';
import { showActionSheet, type SheetAction } from './ActionSheet';
import { radius, spacing, usePalette, useTypeColors, type TypeColorKey } from '../lib/theme';
import MapToButton from './MapToButton';
import { AppText, Card, Chip, Row } from './ui';

interface TimelineRowProps {
  item: TimelineItem;
  tripId: number;
  dayKey: string;
  /** Unsynced changes are waiting for this entity. */
  pending: boolean;
  /** The trip's zone; an item in another zone shows its abbreviation. */
  tripTimezone: string;
  /**
   * Present on activities when the day can be reordered. Resolves to the day's
   * order before the move (for Undo), or null when nothing moved.
   */
  onMove?: (entityId: EntityId, direction: -1 | 1) => Promise<readonly EntityId[] | null>;
}

const ICONS: Readonly<Record<TimelineItem['type'], IconName>> = {
  ACTIVITY: 'place',
  TRANSPORTATION: 'transit',
  LODGING_CHECK_IN: 'checkIn',
  LODGING_CHECK_OUT: 'checkOut',
  CUSTOM_ITEM: 'pin',
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
  tapFeedback();
  await notifyLocalChange();
}

type Timed = 'ACTIVITY' | 'CUSTOM_ITEM';

/**
 * Apply a time change, then offer to put the old times back. Undo restores the
 * snapshot rather than applying the opposite change, so it is exact even for
 * "make all-day", which has no opposite.
 */
async function adjustWithUndo(
  kind: Timed,
  id: EntityId,
  adjustment: Parameters<typeof adjustTime>[3],
  timezone: string,
  done: string
): Promise<void> {
  const db = await getDb();
  const before = await getEntity(db, kind, id);
  await apply(async () => adjustTime(db, kind, id, adjustment, timezone));
  if (!before) return;
  const snapshot = { startTime: before.startTime, endTime: before.endTime, allDay: before.allDay };
  showToast(done, {
    label: 'Undo',
    onPress: () =>
      apply(async () => updateEntity(await getDb(), kind, id, snapshot as Partial<SyncEntityMap[Timed]>)),
  });
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
      const adjust = (adjustment: Parameters<typeof adjustTime>[3], done: string) => () =>
        adjustWithUndo(kind, item.entityId, adjustment, item.timezone, done);
      if (!item.allDay && item.start) {
        buttons.push({ label: '+30 min', onPress: adjust({ type: 'shift', minutes: 30 }, 'Moved 30 min later') });
        buttons.push({ label: '+1 hour', onPress: adjust({ type: 'shift', minutes: 60 }, 'Moved 1 hour later') });
        buttons.push({ label: '−30 min', onPress: adjust({ type: 'shift', minutes: -30 }, 'Moved 30 min earlier') });
      }
      buttons.push({ label: 'Move to tomorrow', onPress: adjust({ type: 'moveDays', days: 1 }, 'Moved to tomorrow') });
      if (!item.allDay) {
        buttons.push({
          label: 'Make all-day',
          onPress: adjust({ type: 'allDay', fallbackDayKey: dayKey }, 'Made all-day'),
        });
      }
      if (onMove && item.entityKind === 'ACTIVITY') {
        const move = (direction: -1 | 1, done: string) => async () => {
          const before = await onMove(item.entityId, direction);
          if (!before) return;
          tapFeedback();
          // Undo writes the old order back rather than moving the other way,
          // which would be measured against a list that has since changed.
          showToast(done, {
            label: 'Undo',
            onPress: () => apply(async () => reorderActivities(await getDb(), before)),
          });
        };
        buttons.push({ label: 'Move up', onPress: move(-1, 'Moved up') });
        buttons.push({ label: 'Move down', onPress: move(1, 'Moved down') });
      }
    }

    if (item.entityKind === 'TRANSPORTATION') {
      const log = (event: Parameters<typeof logTransitActual>[2], done: string) => async () => {
        await apply(async () => logTransitActual(await getDb(), item.entityId, event));
        showToast(done);
      };
      buttons.push({ label: 'Departed now', onPress: log('departed', 'Logged departure') });
      buttons.push({ label: 'Arrived now', onPress: log('arrived', 'Logged arrival') });
      buttons.push({ label: 'Mark cancelled', destructive: true, onPress: log('cancelled', 'Marked cancelled') });
    }

    if (item.confirmation) {
      const code = item.confirmation;
      buttons.push({
        label: `Copy ${code}`,
        onPress: () => copyWithFeedback(code),
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
          <Icon name={ICONS[item.type]} size={22} color={typeColor} />
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
          <View style={styles.mapTo}>
            <MapToButton tripId={tripId} kind={item.entityKind} id={item.entityId} />
          </View>
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
  body: { flex: 1, gap: spacing.xs },
  header: { justifyContent: 'space-between' },
  mapTo: { alignSelf: 'flex-start' },
  code: { alignSelf: 'flex-start', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 6 },
});
