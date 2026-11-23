/**
 * Today mode (#117): what is next, when, and how to get there.
 */
import { FlashList } from '@shopify/flash-list';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import type { EntityId, LocationDto, LodgingDto, TransportationDto, TripDto } from '@travel-life/shared';
import {
  buildMapsAppLinks,
  dayKeyInTimezone,
  formatCountdown,
  formatDateOnly,
  formatTimeInTimezone,
  getTimezoneAbbreviation,
  openingHoursService,
  resolveTimezone,
  timezoneOffsetMinutes,
} from '@travel-life/shared';

import { showActionSheet } from '@/components/ActionSheet';
import TimelineRow from '@/components/TimelineRow';
import BudgetMeter from '@/components/BudgetMeter';
import { SkeletonList } from '@/components/Skeleton';
import { AppText, Banner, Button, Card, Chip, EmptyState, IconButton, Row, Screen } from '@/components/ui';
import { getEntity } from '@/db/repository';
import { adjustTime, listLinkedEntities, reorderActivities } from '@/domain/mutations';
import { buildRouteLine } from '@/domain/routeLine';
import { computeBurnRate, meterStatus, type ParkingPin } from '@/domain/smart';
import {
  buildTripDays,
  findNextUp,
  itemsForDay,
  unscheduledItems,
  type TimelineItem,
} from '@/domain/timeline';
import { getDb } from '@/lib/db';
import { useTripTint } from '@/lib/tripTint';
import { copyWithFeedback, tapFeedback } from '@/lib/feedback';
import {
  useActiveTrip,
  useDirtyKeys,
  useEntities,
  useKv,
  useNow,
  useTripTimeline,
  useUserTimezone,
} from '@/lib/hooks';
import { notifyLocalChange, syncNow, useSync } from '@/lib/sync';
import { summarizeSync } from '@/lib/summaries';
import { FAB_CLEARANCE, radius, spacing, TOUCH_TARGET, usePalette, useRefreshColors } from '@/lib/theme';
import { showToast } from '@/lib/toast';
import { useQuery } from '@tanstack/react-query';

interface Destination {
  name: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  openingHours: string | null;
  timezone: string | null;
}

const fromLocation = (location: LocationDto): Destination => ({
  name: location.name,
  address: location.address,
  latitude: location.latitude,
  longitude: location.longitude,
  openingHours: location.openingHours,
  timezone: location.timezone,
});

/** Where the next-up item physically is, if the itinerary knows. */
async function resolveDestination(
  tripId: number,
  item: TimelineItem,
  legs: readonly TransportationDto[],
  stays: readonly LodgingDto[],
  locations: readonly LocationDto[]
): Promise<Destination | null> {
  const byId = (id: EntityId | null): LocationDto | undefined =>
    id === null ? undefined : locations.find((l) => String(l.id) === String(id));

  if (item.entityKind === 'TRANSPORTATION') {
    const leg = legs.find((l) => String(l.id) === String(item.entityId));
    if (!leg) return null;
    // Before departure you need to get to where it leaves from.
    const start = byId(leg.startLocationId);
    if (start) return fromLocation(start);
    return leg.startLocationText
      ? { name: leg.startLocationText, address: leg.startLocationText, latitude: null, longitude: null, openingHours: null, timezone: null }
      : null;
  }

  const db = await getDb();
  if (item.entityKind === 'ACTIVITY' || item.entityKind === 'LODGING') {
    // Its own place first (locationId); a linked place is the fallback for rows without one.
    const own = await getEntity(db, item.entityKind, item.entityId);
    const place = own ? byId(own.locationId ?? null) : null;
    if (place) return fromLocation(place);
    const linked = await listLinkedEntities(db, tripId, { type: item.entityKind, id: item.entityId }, 'LOCATION');
    if (linked.length > 0) return fromLocation(linked[0]);
  }
  if (item.entityKind === 'LODGING') {
    const stay = stays.find((s) => String(s.id) === String(item.entityId));
    if (stay?.address) {
      return { name: stay.name, address: stay.address, latitude: null, longitude: null, openingHours: null, timezone: null };
    }
  }
  return null;
}

function DualClock({ trip, now }: { trip: TripDto; now: Date }) {
  const homeZone = useUserTimezone();
  const tripZone = resolveTimezone(trip.timezone, homeZone);
  if (tripZone === homeZone) {
    return (
      <AppText muted>
        {formatTimeInTimezone(now, tripZone)} {getTimezoneAbbreviation(tripZone, now)}
      </AppText>
    );
  }
  const diffHours = (timezoneOffsetMinutes(tripZone, now) - timezoneOffsetMinutes(homeZone, now)) / 60;
  const sign = diffHours >= 0 ? '+' : '−';
  return (
    <AppText muted>
      Here {formatTimeInTimezone(now, tripZone)} {getTimezoneAbbreviation(tripZone, now)} · Home{' '}
      {formatTimeInTimezone(now, homeZone)} ({sign}
      {Math.abs(diffHours)}h)
    </AppText>
  );
}

export default function TodayScreen() {
  const palette = usePalette();
  const refreshColors = useRefreshColors();
  const now = useNow();
  const userTimezone = useUserTimezone();
  const { data: trip, isLoading } = useActiveTrip();
  const tint = useTripTint(trip?.coverColor);
  const { data: timeline } = useTripTimeline(trip);
  const { data: expenses = [] } = useEntities(trip?.id, 'EXPENSE');
  const { data: dirty } = useDirtyKeys(trip?.id);
  const { data: parking } = useKv<ParkingPin>(trip ? `parking:${trip.id}` : 'parking:none');
  const syncing = useSync((state) => state.syncing);
  const offline = useSync((state) => state.offline);
  const counts = useSync((state) => state.counts);
  const blocked = useSync((state) => state.blocked);
  const lastError = useSync((state) => state.lastError);

  const tripZone = resolveTimezone(trip?.timezone, userTimezone);
  const todayKey = dayKeyInTimezone(now, tripZone);
  const items = useMemo(() => timeline?.items ?? [], [timeline]);
  const dayKeys = useMemo(
    () => (trip ? buildTripDays(trip, items).map((day) => day.dayKey) : []),
    [trip, items]
  );
  // `null` follows the clock: today when it is a trip day, else the nearest one.
  // Remembered with its trip, so switching trips never carries a day over.
  const [picked, setPicked] = useState<{ tripId: number | undefined; day: string } | null>(null);
  const pickedDay = picked && picked.tripId === trip?.id ? picked.day : null;
  const setPickedDay = (day: string | null) => setPicked(day ? { tripId: trip?.id, day } : null);
  const followDay = dayKeys.includes(todayKey)
    ? todayKey
    : (dayKeys.find((key) => key > todayKey) ?? dayKeys[dayKeys.length - 1] ?? todayKey);
  const activeDay = pickedDay && dayKeys.includes(pickedDay) ? pickedDay : followDay;
  const isToday = activeDay === todayKey;
  const activeIndex = dayKeys.indexOf(activeDay);
  const todayItems = useMemo(() => itemsForDay(items, activeDay), [items, activeDay]);
  const unscheduled = useMemo(() => unscheduledItems(items), [items]);
  const nextUp = useMemo(() => findNextUp(items, now), [items, now]);
  const routeLine = useMemo(() => buildRouteLine(todayItems, now, isToday), [todayItems, now, isToday]);

  const stripRef = useRef<ScrollViewInstance>(null);
  const [stripWidth, setStripWidth] = useState(0);
  useEffect(() => {
    if (activeIndex < 0 || stripWidth === 0) return;
    // Every day chip is the same width, so the selected one can be centred exactly.
    const step = DAY_CHIP_WIDTH + DAY_CHIP_GAP;
    const x = DAY_STRIP_PADDING + activeIndex * step - (stripWidth - DAY_CHIP_WIDTH) / 2;
    stripRef.current?.scrollTo({ x: Math.max(0, x), animated: true });
  }, [activeIndex, stripWidth]);

  const scheduleHere = useCallback(
    async (item: TimelineItem) => {
      if (item.entityKind !== 'ACTIVITY' && item.entityKind !== 'CUSTOM_ITEM') return;
      await adjustTime(await getDb(), item.entityKind, item.entityId, { type: 'moveToDay', dayKey: activeDay }, item.timezone);
      tapFeedback();
      await notifyLocalChange();
      showToast(
        `Added to ${activeDay === todayKey ? 'today' : formatDateOnly(`${activeDay}T00:00:00Z`, { weekday: 'short', day: 'numeric' })}`
      );
    },
    [activeDay, todayKey]
  );
  const burn = useMemo(
    () => (trip ? computeBurnRate(trip, expenses, todayKey) : null),
    [trip, expenses, todayKey]
  );

  const nextKey = nextUp?.item.key;
  const { data: destination } = useQuery({
    queryKey: ['next-destination', trip?.id, nextKey, timeline?.sources.locations.length],
    enabled: Boolean(trip && nextUp && timeline),
    queryFn: async () =>
      resolveDestination(
        (trip as TripDto).id,
        (nextUp as NonNullable<typeof nextUp>).item,
        timeline?.sources.transportation ?? [],
        timeline?.sources.lodging ?? [],
        timeline?.sources.locations ?? []
      ),
  });

  const nextLeg =
    nextUp?.item.entityKind === 'TRANSPORTATION'
      ? timeline?.sources.transportation.find((l) => String(l.id) === String(nextUp.item.entityId))
      : undefined;

  const openDirections = useCallback(() => {
    if (!destination) return;
    const links = buildMapsAppLinks({
      destination,
      mode: 'walking',
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
    });
    if (links.length === 0) return;
    showActionSheet(
      'Directions',
      links.map((link) => ({ label: link.label, onPress: () => void Linking.openURL(link.url) })),
      destination.name ?? destination.address
    );
  }, [destination]);

  const moveActivity = useCallback(
    async (entityId: EntityId, direction: -1 | 1) => {
      const order = todayItems.filter((i) => i.type === 'ACTIVITY' && !i.allDay).map((i) => i.entityId);
      const from = order.findIndex((id) => String(id) === String(entityId));
      const to = from + direction;
      if (from < 0 || to < 0 || to >= order.length) return null;
      const before = [...order];
      [order[from], order[to]] = [order[to], order[from]];
      await reorderActivities(await getDb(), order);
      await notifyLocalChange();
      return before;
    },
    [todayItems]
  );

  if (isLoading) {
    return (
      <Screen>
        <SkeletonList />
      </Screen>
    );
  }

  if (!trip) {
    return (
      <Screen>
        <EmptyState
          title="No trip on this phone yet"
          message="Trips that are upcoming or in progress are downloaded for offline use."
        />
        <Button label="Sync now" onPress={() => void syncNow()} loading={syncing} />
        <Button label="Settings" variant="ghost" onPress={() => router.push('/settings')} />
      </Screen>
    );
  }

  let hoursLabel: { text: string; tone: 'success' | 'danger' } | null = null;
  if (destination?.openingHours) {
    // Opening hours are wall-clock times at the place itself.
    const zone = resolveTimezone(destination.timezone, trip.timezone, userTimezone);
    const status = openingHoursService.evaluate(destination.openingHours, now, zone).status;
    if (status === 'OPEN') hoursLabel = { text: 'Open now', tone: 'success' };
    if (status === 'CLOSED') hoursLabel = { text: 'Closed now', tone: 'danger' };
  }
  const meter = parking ? meterStatus(parking, now) : null;
  const syncSummary = summarizeSync({ offline, counts, blocked, lastError });

  const header = (
    <View style={styles.header}>
      <Row style={styles.titleRow}>
        <View style={styles.flex}>
          <AppText variant="title" numberOfLines={1}>
            {trip.title}
          </AppText>
          <DualClock trip={trip} now={now} />
        </View>
        <Button label="Trips" variant="ghost" compact onPress={() => router.push('/trips')} />
        <IconButton icon="settings" accessibilityLabel="Settings" onPress={() => router.push('/settings')} />
      </Row>

      {syncSummary ? (
        // One pill for sync, showing the thing most worth acting on; the Sync
        // screen has the full breakdown.
        <Row>
          <Chip
            label={syncSummary.label}
            tone={syncSummary.tone}
            icon={syncSummary.tone === 'danger' ? 'alert' : offline ? 'offline' : 'sync'}
            onPress={() => router.push('/sync')}
          />
        </Row>
      ) : null}

      {burn ? <BudgetMeter burn={burn} currency={trip.budgetCurrency} /> : null}

      {counts.conflict > 0 ? (
        <Banner tone="warning" text="Someone else changed an item you edited offline. Tap the conflict chip to choose." />
      ) : null}

      <Row style={styles.dayNav}>
        <IconButton
          icon="chevronLeft"
          accessibilityLabel="Previous day"
          disabled={activeIndex <= 0}
          onPress={() => setPickedDay(dayKeys[activeIndex - 1] ?? null)}
        />
        <ScrollView
          ref={stripRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.flex}
          onLayout={(event) => setStripWidth(event.nativeEvent.layout.width)}
          contentContainerStyle={styles.dayStrip}>
          {dayKeys.map((key) => {
            const selected = key === activeDay;
            const today = key === todayKey;
            const date = `${key}T00:00:00Z`;
            const ink = selected ? palette.onPrimary : palette.text;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={`${formatDateOnly(date, { weekday: 'long', month: 'long', day: 'numeric' })}${today ? ', today' : ''}`}
                accessibilityState={{ selected }}
                onPress={() => setPickedDay(key)}
                android_ripple={{ color: palette.ripple }}
                style={[
                  styles.dayChip,
                  {
                    backgroundColor: selected ? palette.primary : palette.surface,
                    borderColor: selected ? palette.primary : today ? palette.primary : palette.border,
                  },
                ]}>
                <AppText variant="caption" color={selected ? palette.onPrimary : palette.textMuted}>
                  {formatDateOnly(date, { weekday: 'short' })}
                </AppText>
                <AppText variant="heading" color={ink}>
                  {formatDateOnly(date, { day: 'numeric' })}
                </AppText>
                {/* Today is marked by a dot, so the selection can move away from it. */}
                <View style={[styles.todayDot, today && { backgroundColor: selected ? palette.onPrimary : palette.primary }]} />
              </Pressable>
            );
          })}
        </ScrollView>
        <IconButton
          icon="chevronRight"
          accessibilityLabel="Next day"
          disabled={activeIndex < 0 || activeIndex >= dayKeys.length - 1}
          onPress={() => setPickedDay(dayKeys[activeIndex + 1] ?? null)}
        />
      </Row>

      {!isToday ? (
        <Row style={styles.dayNav}>
          <AppText variant="heading" style={styles.flex}>
            {formatDateOnly(`${activeDay}T00:00:00Z`, { weekday: 'long', month: 'long', day: 'numeric' })}
          </AppText>
          {dayKeys.includes(todayKey) ? (
            <Button label="Back to today" variant="secondary" compact onPress={() => setPickedDay(null)} />
          ) : null}
        </Row>
      ) : null}

      {isToday ? (
      <Card tone="hero" tint={tint}>
        <AppText variant="label" color={palette.heroAccent}>
          {nextUp ? (nextUp.inProgress ? 'HAPPENING NOW' : 'NEXT UP') : 'NEXT UP'}
        </AppText>
        {nextUp && nextUp.item.start ? (
          <>
            <AppText variant="title" numberOfLines={2}>
              {nextUp.item.title}
            </AppText>
            <AppText variant="heading" color={palette.heroAccent}>
              {nextUp.inProgress
                ? `Started ${formatCountdown(nextUp.item.start, now)}`
                : formatCountdown(nextUp.item.start, now)}
              {' · '}
              {formatTimeInTimezone(nextUp.item.start, nextUp.item.timezone)}{' '}
              {getTimezoneAbbreviation(nextUp.item.timezone, new Date(nextUp.item.start))}
            </AppText>
            <Row>
              {nextUp.item.status === 'delayed' ? (
                <Chip
                  label={nextUp.item.delayMinutes ? `Delayed ${nextUp.item.delayMinutes}m` : 'Delayed'}
                  tone="warning"
                />
              ) : null}
              {nextLeg?.flightTracking?.gate ? <Chip label={`Gate ${nextLeg.flightTracking.gate}`} /> : null}
              {nextLeg?.flightTracking?.terminal ? (
                <Chip label={`Terminal ${nextLeg.flightTracking.terminal}`} />
              ) : null}
              {nextLeg?.flightTracking?.baggageClaim ? (
                <Chip label={`Bags ${nextLeg.flightTracking.baggageClaim}`} />
              ) : null}
              {nextLeg?.seatNumber ? <Chip label={`Seat ${nextLeg.seatNumber}`} /> : null}
              {hoursLabel ? <Chip label={hoursLabel.text} tone={hoursLabel.tone} /> : null}
            </Row>
            {destination?.address ? (
              // Selectable and large: made to be shown to a taxi driver.
              <AppText selectable>{destination.address}</AppText>
            ) : null}
            <Row>
              {destination ? <Button label="Directions" icon="navigate" compact onPress={openDirections} /> : null}
              {nextUp.item.confirmation ? (
                <Button
                  label={`Copy ${nextUp.item.confirmation}`}
                  icon="copy"
                  variant="secondary"
                  compact
                  onPress={() => void copyWithFeedback(nextUp.item.confirmation as string)}
                />
              ) : null}
            </Row>
          </>
        ) : (
          <AppText muted>Nothing else scheduled. Enjoy the free time.</AppText>
        )}
      </Card>
      ) : null}

      {isToday ? (
      <Row>
        <Button
          label={parking ? (meter?.label ?? 'Parked') : 'Where I parked'}
          icon="parking"
          variant={meter?.state === 'soon' || meter?.state === 'expired' ? 'danger' : 'secondary'}
          compact
          onPress={() => router.push('/parked')}
        />
        <Button
          label="Phrasebook"
          icon="phrasebook"
          variant="secondary"
          compact
          onPress={() => router.push({ pathname: '/(tabs)/vault', params: { section: 'phrases' } })}
        />
        <Button label="Food nearby" icon="food" variant="secondary" compact onPress={() => router.push('/food')} />
      </Row>
      ) : null}

      <Row style={styles.dayNav}>
        <AppText variant="heading" style={styles.flex}>
          {isToday ? 'Today' : 'Plan'} · {todayItems.length} {todayItems.length === 1 ? 'item' : 'items'}
        </AppText>
        <Button
          label="+ Add"
          variant="ghost"
          compact
          onPress={() =>
            router.push({
              pathname: '/entity/[kind]/[id]',
              params: { kind: 'ACTIVITY', id: 'new', tripId: String(trip.id), dayKey: activeDay },
            })
          }
        />
      </Row>
    </View>
  );

  return (
    <Screen scroll={false} padded={false}>
      <FlashList
        data={todayItems}
        extraData={routeLine}
        keyExtractor={(item) => item.key}
        renderItem={({ item, index }) => (
          <View style={styles.rowWrap}>
            <TimelineRow
              item={item}
              route={routeLine[index]}
              tripId={trip.id}
              dayKey={activeDay}
              tripTimezone={tripZone}
              pending={dirty?.has(`${item.entityKind}:${item.entityId}`) ?? false}
              onMove={moveActivity}
            />
          </View>
        )}
        ListHeaderComponent={header}
        ListEmptyComponent={
          <EmptyState
            title={isToday ? 'Nothing planned today' : 'Nothing planned this day'}
            message="Use + to add a stop, or pull one in from Unscheduled below."
          />
        }
        ListFooterComponent={
          unscheduled.length > 0 ? (
            <View style={styles.unscheduled}>
              <AppText variant="heading">Unscheduled · {unscheduled.length}</AppText>
              <AppText muted>Ideas with no time yet. Tap for details, or add one to this day.</AppText>
              {unscheduled.map((item) => (
                <View key={item.key} style={styles.unscheduledItem}>
                  <TimelineRow
                    item={item}
                    tripId={trip.id}
                    dayKey={activeDay}
                    tripTimezone={tripZone}
                    pending={dirty?.has(`${item.entityKind}:${item.entityId}`) ?? false}
                  />
                  {item.entityKind === 'ACTIVITY' || item.entityKind === 'CUSTOM_ITEM' ? (
                    <Button
                      label={`Add to ${isToday ? 'today' : formatDateOnly(`${activeDay}T00:00:00Z`, { weekday: 'short', day: 'numeric' })}`}
                      variant="secondary"
                      compact
                      onPress={() => void scheduleHere(item)}
                    />
                  ) : null}
                </View>
              ))}
            </View>
          ) : null
        }
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => void syncNow()} {...refreshColors} />}
      />
    </Screen>
  );
}

const DAY_CHIP_WIDTH = 52;
const DAY_CHIP_GAP = spacing.sm;
const DAY_STRIP_PADDING = spacing.xs;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dayNav: { flexWrap: 'nowrap', alignItems: 'center' },
  dayStrip: { gap: DAY_CHIP_GAP, paddingHorizontal: DAY_STRIP_PADDING },
  dayChip: {
    width: DAY_CHIP_WIDTH,
    minHeight: TOUCH_TARGET + 20,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  todayDot: { width: 5, height: 5, borderRadius: 3, marginTop: 2 },
  unscheduled: { padding: spacing.lg, gap: spacing.sm },
  unscheduledItem: { gap: spacing.xs },
  header: { padding: spacing.lg, gap: spacing.md },
  titleRow: { flexWrap: 'nowrap' },
  rowWrap: { paddingHorizontal: spacing.lg },
  list: { paddingBottom: FAB_CLEARANCE },
});
