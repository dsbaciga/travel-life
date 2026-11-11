/**
 * Android home-screen widget: "Next Up".
 *
 * The widget renders headlessly, so it reads straight from SQLite and reuses
 * the same `findNextUp` / `buildWidgetSnapshot` logic as the Today screen.
 * iOS WidgetKit is not implemented.
 */
import { Platform } from 'react-native';
import {
  FlexWidget,
  TextWidget,
  registerWidgetTaskHandler,
  requestWidgetUpdate,
} from 'react-native-android-widget';
import { dayKeyInTimezone, getDeviceTimezone } from '@travel-life/shared';
import { kvGet, listEntities, listTrips } from '../db/repository';
import { buildWidgetSnapshot, type WidgetSnapshot } from '../domain/smart';
import { buildTimelineItems, findNextUp, pickActiveTrip } from '../domain/timeline';
import { getDb } from '../lib/db';

/** Navy + gold, as hex literals: the widget renderer only accepts `#rrggbb`. */
const COLORS = {
  background: '#0f172a',
  text: '#f8fafc',
  muted: '#cbd5e1',
  gold: '#fbbf24',
  amber: '#f59e0b',
} as const;

/** Must match the widget `name` in app.json's react-native-android-widget plugin config. */
export const NEXT_UP_WIDGET = 'NextUp';

async function loadSnapshot(): Promise<WidgetSnapshot> {
  const db = await getDb();
  const trips = await listTrips(db);
  const chosen = await kvGet<number>(db, 'activeTripId');
  const zone = getDeviceTimezone();
  const trip =
    trips.find((candidate) => candidate.id === chosen) ??
    pickActiveTrip(trips, dayKeyInTimezone(new Date(), zone));
  if (!trip) return buildWidgetSnapshot(null, null);

  const [activities, transportation, lodging, customItems, locations] = await Promise.all([
    listEntities(db, trip.id, 'ACTIVITY'),
    listEntities(db, trip.id, 'TRANSPORTATION'),
    listEntities(db, trip.id, 'LODGING'),
    listEntities(db, trip.id, 'CUSTOM_ITEM'),
    listEntities(db, trip.id, 'LOCATION'),
  ]);
  const items = buildTimelineItems(
    { activities, transportation, lodging, customItems, locations },
    trip.timezone,
    zone
  );
  return buildWidgetSnapshot(trip, findNextUp(items));
}

function NextUpWidget({ snapshot }: { snapshot: WidgetSnapshot }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: snapshot.url }}
      style={{
        height: 'match_parent',
        width: 'match_parent',
        padding: 14,
        borderRadius: 20,
        backgroundColor: COLORS.background,
        justifyContent: 'center',
      }}>
      <TextWidget
        text={(snapshot.tripTitle ?? 'Travel Life').toUpperCase()}
        maxLines={1}
        style={{ fontSize: 11, color: COLORS.gold }}
      />
      <TextWidget text={snapshot.title} maxLines={2} style={{ fontSize: 17, color: COLORS.text }} />
      {snapshot.timeLabel || snapshot.countdown ? (
        <TextWidget
          text={[snapshot.timeLabel, snapshot.countdown].filter(Boolean).join(' · ')}
          maxLines={1}
          style={{ fontSize: 14, color: COLORS.amber }}
        />
      ) : null}
      {snapshot.detail ? (
        <TextWidget text={snapshot.detail} maxLines={1} style={{ fontSize: 12, color: COLORS.muted }} />
      ) : null}
    </FlexWidget>
  );
}

if (Platform.OS === 'android') {
  registerWidgetTaskHandler(async ({ widgetAction, renderWidget }) => {
    if (widgetAction === 'WIDGET_DELETED') return;
    renderWidget(<NextUpWidget snapshot={await loadSnapshot()} />);
  });
}

/** Redraw the widget after a sync or a local edit changed what is next. */
export async function refreshWidget(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const snapshot = await loadSnapshot();
    await requestWidgetUpdate({
      widgetName: NEXT_UP_WIDGET,
      renderWidget: () => <NextUpWidget snapshot={snapshot} />,
    });
  } catch {
    // No widget placed, or the native module is unavailable (Expo Go).
  }
}
