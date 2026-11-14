import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { formatDateOnly } from '@travel-life/shared';

import { AppText, Banner, Button, Card, Chip, EmptyState, Row, Screen } from '@/components/ui';
import { listPinnedTripIds, setTripPinned } from '@/db/repository';
import { getDb } from '@/lib/db';
import { useActiveTrip, useTrips } from '@/lib/hooks';
import {
  fetchRemoteTrips,
  listDismissedTripIds,
  notifyLocalChange,
  removeTripFromPhone,
  restoreTripToPhone,
  syncNow,
  useSync,
} from '@/lib/sync';
import { usePalette } from '@/lib/theme';

export default function TripsScreen() {
  const palette = usePalette();
  const { data: trips = [] } = useTrips();
  const { data: active } = useActiveTrip();
  const syncing = useSync((state) => state.syncing);
  const version = useSync((state) => state.dataVersion);

  const { data: pinned = new Set<number>() } = useQuery({
    queryKey: ['pinned-trips', version],
    queryFn: async () => listPinnedTripIds(await getDb()),
  });

  // The full server list, so a trip that is not on the phone can be fetched.
  const { data: remote, isError } = useQuery({
    queryKey: ['remote-trips', version],
    queryFn: fetchRemoteTrips,
    staleTime: 30000,
  });
  const localIds = new Set(trips.map((trip) => trip.id));
  const onServerOnly = (remote?.trips ?? []).filter((trip) => !localIds.has(trip.id) && !/cancel/i.test(trip.status));

  const { data: dismissed = new Set<number>() } = useQuery({
    queryKey: ['dismissed-trips', version],
    queryFn: async () => listDismissedTripIds(await getDb()),
  });

  const [undo, setUndo] = useState<{ trip: (typeof trips)[number]; kept: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const rows = useRef(new Map<number, SwipeableMethods>());

  // The undo bar disappears on its own; the trip stays retrievable below.
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 8000);
    return () => clearTimeout(timer);
  }, [undo]);

  const download = async (trip: (typeof trips)[number]) => {
    await restoreTripToPhone(trip, true);
  };

  const togglePinned = async (tripId: number, keep: boolean) => {
    const db = await getDb();
    await setTripPinned(db, tripId, keep);
    await notifyLocalChange();
  };

  const remove = async (trip: (typeof trips)[number], kept: boolean) => {
    setNotice(null);
    if (await removeTripFromPhone(trip.id)) {
      setUndo({ trip, kept });
      return;
    }
    rows.current.get(trip.id)?.close();
    setNotice(`${trip.title} has changes that haven't synced yet. Sync first, then remove it.`);
  };

  return (
    <Screen>
      <AppText muted>
        Trips you own and trips shared with you. Upcoming and recent ones download automatically; keep any other trip
        on the phone to use it offline.
      </AppText>
      {notice ? <Banner tone="warning" text={notice} /> : null}
      {undo ? (
        <Card tone="hero">
          <Row style={styles.between}>
            <AppText style={styles.grow} numberOfLines={2}>
              Removed “{undo.trip.title}” from this phone.
            </AppText>
            <Button
              label="Undo"
              compact
              onPress={async () => {
                await restoreTripToPhone(undo.trip, undo.kept);
                setUndo(null);
              }}
            />
          </Row>
        </Card>
      ) : null}
      {trips.length === 0 ? (
        <EmptyState title="No trips downloaded" message="Create a trip in the web app, then sync." />
      ) : (
        trips.map((trip) => {
          const kept = pinned.has(trip.id);
          return (
            <Swipeable
              key={trip.id}
              ref={(instance) => {
                if (instance) rows.current.set(trip.id, instance);
                else rows.current.delete(trip.id);
              }}
              overshootRight={false}
              onSwipeableOpen={() => void remove(trip, kept)}
              renderRightActions={() => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${trip.title} from this phone`}
                  onPress={() => void remove(trip, kept)}
                  style={[styles.swipeAction, { backgroundColor: palette.danger }]}>
                  <AppText variant="heading" color={palette.onPrimary}>
                    Remove
                  </AppText>
                </Pressable>
              )}>
            <Card
              accessibilityLabel={`Switch to ${trip.title}`}
              style={trip.id === active?.id ? { borderColor: palette.primary } : undefined}
              onPress={async () => {
                await useSync.getState().setActiveTrip(trip.id);
                router.back();
              }}>
              <Row style={{ justifyContent: 'space-between' }}>
                <AppText variant="heading" numberOfLines={1} style={{ flex: 1 }}>
                  {trip.title}
                </AppText>
                {trip.id === active?.id ? <Chip label="Showing" selected /> : null}
              </Row>
              <AppText muted>
                {formatDateOnly(trip.startDate) || 'No dates'}
                {trip.endDate ? ` – ${formatDateOnly(trip.endDate)}` : ''} · {trip.status}
              </AppText>
              <Row>
                <Button
                  label={kept ? 'Kept on phone' : 'Keep on phone'}
                  variant="secondary"
                  compact
                  onPress={() => void togglePinned(trip.id, !kept)}
                />
              </Row>
              <AppText muted>Swipe left to remove from this phone.</AppText>
            </Card>
            </Swipeable>
          );
        })
      )}

      {onServerOnly.length > 0 ? (
        <>
          <AppText variant="heading">Not on this phone</AppText>
          <AppText muted>Trips you removed are here too. Restore one any time.</AppText>
          {onServerOnly.map((trip) => (
            <Card key={trip.id} accessibilityLabel={trip.title}>
              <AppText variant="heading" numberOfLines={1}>
                {trip.title}
              </AppText>
              <AppText muted>
                {formatDateOnly(trip.startDate) || 'No dates'}
                {trip.endDate ? ` – ${formatDateOnly(trip.endDate)}` : ''} · {trip.status}
              </AppText>
              <Button
                label={dismissed.has(trip.id) ? 'Restore' : 'Download'}
                variant="secondary"
                compact
                onPress={() => void download(trip)}
              />
            </Card>
          ))}
        </>
      ) : null}
      {isError ? <Banner tone="warning" text="Couldn't reach the server to list your other trips." /> : null}
      {remote && !remote.complete ? (
        <Banner tone="warning" text="Trips shared with you could not be loaded just now." />
      ) : null}

      <Button label="Sync now" variant="secondary" onPress={() => void syncNow()} loading={syncing} />
      <Button
        label="Follow the trip in progress automatically"
        variant="ghost"
        onPress={async () => {
          await useSync.getState().setActiveTrip(null);
          router.back();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { justifyContent: 'space-between', flexWrap: 'nowrap' },
  grow: { flex: 1 },
  swipeAction: { justifyContent: 'center', alignItems: 'center', width: 110, marginBottom: 12, borderRadius: 12 },
});
