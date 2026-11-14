import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { formatDateOnly } from '@travel-life/shared';

import { AppText, Banner, Button, Card, Chip, EmptyState, Row, Screen } from '@/components/ui';
import { listPinnedTripIds, removeTrip, setTripPinned, upsertTrip } from '@/db/repository';
import { countOutbox } from '@/sync/outbox';
import { getDb } from '@/lib/db';
import { useActiveTrip, useTrips } from '@/lib/hooks';
import { fetchRemoteTrips, notifyLocalChange, shouldMirrorTrip, syncNow, useSync } from '@/lib/sync';
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

  const download = async (trip: (typeof trips)[number]) => {
    const db = await getDb();
    await upsertTrip(db, trip);
    await setTripPinned(db, trip.id, true);
    await notifyLocalChange();
    void syncNow();
  };

  const togglePinned = async (tripId: number, keep: boolean) => {
    const db = await getDb();
    await setTripPinned(db, tripId, keep);
    await notifyLocalChange();
  };

  const removeFromPhone = async (trip: (typeof trips)[number]) => {
    const db = await getDb();
    const outbox = await countOutbox(db, trip.id);
    // Never throw away edits that have not reached the server.
    if (outbox.pending + outbox.conflict + outbox.failed > 0) return;
    await removeTrip(db, trip.id);
    await notifyLocalChange();
  };

  return (
    <Screen>
      <AppText muted>
        Trips you own and trips shared with you. Upcoming and recent ones download automatically; keep any other trip
        on the phone to use it offline.
      </AppText>
      {trips.length === 0 ? (
        <EmptyState title="No trips downloaded" message="Create a trip in the web app, then sync." />
      ) : (
        trips.map((trip) => {
          const kept = pinned.has(trip.id);
          const automatic = shouldMirrorTrip(trip, new Date().toISOString().slice(0, 10), false);
          return (
            <Card
              key={trip.id}
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
                {!automatic && !kept ? (
                  <Button label="Remove" variant="ghost" compact onPress={() => void removeFromPhone(trip)} />
                ) : null}
              </Row>
            </Card>
          );
        })
      )}

      {onServerOnly.length > 0 ? (
        <>
          <AppText variant="heading">Not on this phone</AppText>
          {onServerOnly.map((trip) => (
            <Card key={trip.id} accessibilityLabel={trip.title}>
              <AppText variant="heading" numberOfLines={1}>
                {trip.title}
              </AppText>
              <AppText muted>
                {formatDateOnly(trip.startDate) || 'No dates'}
                {trip.endDate ? ` – ${formatDateOnly(trip.endDate)}` : ''} · {trip.status}
              </AppText>
              <Button label="Download" variant="secondary" compact onPress={() => void download(trip)} />
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
