/**
 * Today mode (#117): what is next, when, and how to get there.
 */
import { FlashList } from '@shopify/flash-list';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
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
import { AppText, Banner, Button, Card, Chip, EmptyState, Row, Screen } from '@/components/ui';
import { adjustTime, listLinkedEntities, reorderActivities } from '@/domain/mutations';
import { computeBurnRate, meterStatus, type ParkingPin } from '@/domain/smart';
import {
  buildTripDays,
  findNextUp,
  itemsForDay,
  unscheduledItems,
  type TimelineItem,
} from '@/domain/timeline';
import { getDb } from '@/lib/db';
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
import { spacing, usePalette } from '@/lib/theme';
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
  const now = useNow();
  const userTimezone = useUserTimezone();
  const { data: trip, isLoading } = useActiveTrip();
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

  const stripRef = useRef<ScrollViewInstance>(null);
  useEffect(() => {
    if (activeIndex >= 0) {
      stripRef.current?.scrollTo({ x: Math.max(0, activeIndex * DAY_CHIP_WIDTH - DAY_CHIP_WIDTH * 2), animated: true });
    }
  }, [activeIndex]);

  const scheduleHere = useCallback(
    async (item: TimelineItem) => {
      if (item.entityKind !== 'ACTIVITY' && item.entityKind !== 'CUSTOM_ITEM') return;
      await adjustTime(await getDb(), item.entityKind, item.entityId, { type: 'moveToDay', dayKey: activeDay }, item.timezone);
      await notifyLocalChange();
    },
    [activeDay]
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
      if (from < 0 || to < 0 || to >= order.length) return;
      [order[from], order[to]] = [order[to], order[from]];
      await reorderActivities(await getDb(), order);
      await notifyLocalChange();
    },
    [todayItems]
  );

  if (isLoading) return <Screen>{null}</Screen>;

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
      </Row>

      <Row>
        {offline ? <Chip label="Offline" tone="warning" /> : null}
        {counts.pending > 0 ? (
          <Chip label={`${counts.pending} to sync`} tone="info" onPress={() => router.push('/sync')} />
        ) : null}
        {counts.conflict > 0 ? (
          <Chip label={`${counts.conflict} conflict`} tone="danger" onPress={() => router.push('/sync')} />
        ) : null}
        {blocked > 0 ? (
          <Chip label={`${blocked} waiting`} tone="warning" onPress={() => router.push('/sync')} />
        ) : null}
        {lastError ? <Chip label="Sync problem" tone="danger" onPress={() => router.push('/sync')} /> : null}
        {counts.failed > 0 ? (
          <Chip label={`${counts.failed} failed`} tone="danger" onPress={() => router.push('/sync')} />
        ) : null}
        {burn ? (
          <Chip
            label={`Budget ${Math.round(burn.spentFraction * 100)}% · trip ${Math.round(burn.elapsedFraction * 100)}%`}
            tone={burn.state === 'over' ? 'danger' : burn.state === 'under' ? 'success' : 'default'}
          />
        ) : null}
      </Row>

      {counts.conflict > 0 ? (
        <Banner tone="warning" text="Someone else changed an item you edited offline. Tap the conflict chip to choose." />
      ) : null}

      <Row style={styles.dayNav}>
        <Button
          label="‹"
          variant="ghost"
          compact
          disabled={activeIndex <= 0}
          onPress={() => setPickedDay(dayKeys[activeIndex - 1] ?? null)}
        />
        <ScrollView
          ref={stripRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.flex}
          contentContainerStyle={styles.dayStrip}>
          {dayKeys.map((key) => (
            <Chip
              key={key}
              label={`${key === todayKey ? '● ' : ''}${formatDateOnly(`${key}T00:00:00Z`, { weekday: 'short', day: 'numeric' })}`}
              selected={key === activeDay}
              onPress={() => setPickedDay(key)}
            />
          ))}
        </ScrollView>
        <Button
          label="›"
          variant="ghost"
          compact
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
      <Card tone="hero">
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
              {destination ? <Button label="Directions" compact onPress={openDirections} /> : null}
              {nextUp.item.confirmation ? (
                <Button
                  label={`Copy ${nextUp.item.confirmation}`}
                  variant="secondary"
                  compact
                  onPress={() => void Clipboard.setStringAsync(nextUp.item.confirmation as string)}
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
          label={parking ? `🚗 ${meter?.label ?? 'Parked'}` : '🚗 Where I parked'}
          variant={meter?.state === 'soon' || meter?.state === 'expired' ? 'danger' : 'secondary'}
          compact
          onPress={() => router.push('/parked')}
        />
        <Button
          label="💬 Phrasebook"
          variant="secondary"
          compact
          onPress={() => router.push({ pathname: '/(tabs)/vault', params: { section: 'phrases' } })}
        />
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
        keyExtractor={(item) => item.key}
        renderItem={({ item }) => (
          <View style={styles.rowWrap}>
            <TimelineRow
              item={item}
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
        refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => void syncNow()} />}
      />
    </Screen>
  );
}

const DAY_CHIP_WIDTH = 84;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dayNav: { flexWrap: 'nowrap', alignItems: 'center' },
  dayStrip: { gap: spacing.sm, paddingHorizontal: spacing.xs },
  unscheduled: { padding: spacing.lg, gap: spacing.sm },
  unscheduledItem: { gap: spacing.xs },
  header: { padding: spacing.lg, gap: spacing.md },
  titleRow: { flexWrap: 'nowrap' },
  rowWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  list: { paddingBottom: 140 },
});
