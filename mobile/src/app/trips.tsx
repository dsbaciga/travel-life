import { router } from 'expo-router';
import { formatDateOnly } from '@travel-life/shared';

import { AppText, Button, Card, Chip, EmptyState, Row, Screen } from '@/components/ui';
import { useActiveTrip, useTrips } from '@/lib/hooks';
import { syncNow, useSync } from '@/lib/sync';
import { usePalette } from '@/lib/theme';

export default function TripsScreen() {
  const palette = usePalette();
  const { data: trips = [] } = useTrips();
  const { data: active } = useActiveTrip();
  const syncing = useSync((state) => state.syncing);

  return (
    <Screen>
      <AppText muted>Upcoming and recent trips are kept on this phone for offline use.</AppText>
      {trips.length === 0 ? (
        <EmptyState title="No trips downloaded" message="Create a trip in the web app, then sync." />
      ) : (
        trips.map((trip) => (
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
          </Card>
        ))
      )}
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
