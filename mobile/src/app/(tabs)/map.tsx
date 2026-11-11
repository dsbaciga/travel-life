/**
 * Map & footprints: itinerary pins, today's recorded GPS trail, long-press to
 * drop a new place, and a "near me now" filter for pivoting plans.
 */
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, type LongPressEvent, type Region } from 'react-native-maps';
import type { LocationDto } from '@travel-life/shared';
import {
  addDaysToDayKey,
  dayKeyInTimezone,
  haversineMeters,
  isUsableCoordinate,
  openingHoursService,
  resolveTimezone,
  startOfDayInTimezone,
} from '@travel-life/shared';

import { showActionSheet } from '@/components/ActionSheet';
import { AppText, Banner, Button, Chip, EmptyState, Row, Screen } from '@/components/ui';
import { listLinks } from '@/db/repository';
import { loadTrack } from '@/domain/track';
import { getDb } from '@/lib/db';
import { useActiveTrip, useEntities, useNow, useUserTimezone } from '@/lib/hooks';
import { useSync } from '@/lib/sync';
import { spacing, usePalette } from '@/lib/theme';
import { getCurrentPosition, positionFailureMessage, isTracking, startTracking, stopTracking } from '@/tasks/location';

/** "Walking distance" for the near-me filter. */
const NEAR_ME_RADIUS_M = 1200;

type Filter = 'all' | 'today' | 'favorites' | 'near';

type Located = LocationDto & { latitude: number; longitude: number };

export default function MapScreen() {
  const palette = usePalette();
  const now = useNow(60000);
  const userTimezone = useUserTimezone();
  const version = useSync((state) => state.dataVersion);
  const { data: trip } = useActiveTrip();
  const { data: locations = [] } = useEntities(trip?.id, 'LOCATION');
  const { data: activities = [] } = useEntities(trip?.id, 'ACTIVITY');

  const mapRef = useRef<MapView>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [me, setMe] = useState<{ latitude: number; longitude: number } | null>(null);
  const [tracking, setTracking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const tripZone = resolveTimezone(trip?.timezone, userTimezone);
  const todayKey = dayKeyInTimezone(now, tripZone);

  useEffect(() => {
    void isTracking().then(setTracking);
  }, []);

  // Today's breadcrumb trail, read from the local buffer so it works offline.
  const { data: track = [] } = useQuery({
    queryKey: ['track', trip?.id, todayKey, tripZone, version, tracking],
    enabled: Boolean(trip),
    refetchInterval: tracking ? 30000 : false,
    queryFn: async () =>
      loadTrack(
        await getDb(),
        trip?.id as number,
        startOfDayInTimezone(todayKey, tripZone).toISOString(),
        startOfDayInTimezone(addDaysToDayKey(todayKey, 1), tripZone).toISOString()
      ),
  });

  // Locations that today's activities are linked to.
  const { data: todayLocationIds = new Set<string>() } = useQuery({
    queryKey: ['today-locations', trip?.id, todayKey, version],
    enabled: Boolean(trip),
    queryFn: async () => {
      const todays = new Set(
        activities
          .filter((a) => a.startTime && dayKeyInTimezone(a.startTime, resolveTimezone(a.timezone, tripZone)) === todayKey)
          .map((a) => String(a.id))
      );
      const ids = new Set<string>();
      for (const link of await listLinks(await getDb(), trip?.id as number)) {
        if (link.sourceType === 'ACTIVITY' && link.targetType === 'LOCATION' && todays.has(String(link.sourceId))) {
          ids.add(String(link.targetId));
        }
      }
      return ids;
    },
  });

  const located = useMemo(
    () => locations.filter((l): l is Located => isUsableCoordinate(l)),
    [locations]
  );

  const visible = useMemo(() => {
    switch (filter) {
      case 'today':
        return located.filter((l) => todayLocationIds.has(String(l.id)));
      case 'favorites':
        return located.filter((l) => l.isFavorite);
      case 'near':
        return me
          ? located
              .filter((l) => haversineMeters(me, l) <= NEAR_ME_RADIUS_M)
              // Hide places known to be closed right now; unknown hours stay.
              .filter((l) => {
                if (!l.openingHours) return true;
                const zone = resolveTimezone(l.timezone, tripZone);
                return openingHoursService.evaluate(l.openingHours, now, zone).status !== 'CLOSED';
              })
          : [];
      default:
        return located;
    }
  }, [filter, located, todayLocationIds, me, now, tripZone]);

  const initialRegion = useMemo<Region | undefined>(() => {
    if (located.length === 0) return undefined;
    const lats = located.map((l) => l.latitude);
    const lngs = located.map((l) => l.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLng + maxLng) / 2,
      latitudeDelta: Math.max(0.02, (maxLat - minLat) * 1.4),
      longitudeDelta: Math.max(0.02, (maxLng - minLng) * 1.4),
    };
  }, [located]);

  const locate = async (): Promise<{ latitude: number; longitude: number } | null> => {
    const position = await getCurrentPosition();
    if (!position) {
      setNotice(positionFailureMessage('find places near you'));
      return null;
    }
    setMe(position);
    mapRef.current?.animateToRegion({ ...position, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 400);
    return position;
  };

  const onLongPress = (event: LongPressEvent) => {
    if (!trip) return;
    const { latitude, longitude } = event.nativeEvent.coordinate;
    const params = {
      id: 'new',
      tripId: String(trip.id),
      latitude: latitude.toFixed(6),
      longitude: longitude.toFixed(6),
    };
    showActionSheet('Add here', [
      {
        label: 'New location at this pin',
        onPress: () => router.push({ pathname: '/entity/[kind]/[id]', params: { ...params, kind: 'LOCATION' } }),
      },
      {
        label: 'New activity at this pin',
        onPress: () =>
          router.push({ pathname: '/entity/[kind]/[id]', params: { ...params, kind: 'ACTIVITY', withLocation: '1' } }),
      },
    ]);
  };

  const toggleTracking = async () => {
    if (!trip) return;
    if (tracking) {
      await stopTracking();
      setTracking(false);
      return;
    }
    const result = await startTracking(trip.id);
    if (result === 'started') {
      setTracking(true);
      setNotice(null);
    } else {
      setNotice(
        result === 'background-denied'
          ? 'Choose "Allow all the time" for location in system settings to record your route in the background.'
          : 'Location permission is needed to record your route.'
      );
    }
  };

  if (!trip) {
    return (
      <Screen>
        <EmptyState title="No trip selected" />
      </Screen>
    );
  }

  return (
    <View style={styles.flex}>
      <MapView
        ref={mapRef}
        style={styles.flex}
        initialRegion={initialRegion}
        showsUserLocation
        onLongPress={onLongPress}
        userInterfaceStyle={palette.background === '#0f172a' ? 'dark' : 'light'}>
        {visible.map((location) => (
          <Marker
            key={String(location.id)}
            coordinate={{ latitude: location.latitude, longitude: location.longitude }}
            title={location.name}
            description={location.address ?? undefined}
            pinColor={
              location.isFavorite
                ? palette.accent
                : todayLocationIds.has(String(location.id))
                  ? palette.info
                  : palette.danger
            }
            onCalloutPress={() =>
              router.push({
                pathname: '/entity/[kind]/[id]',
                params: { kind: 'LOCATION', id: String(location.id), tripId: String(trip.id) },
              })
            }
          />
        ))}
        {track.length > 1 ? (
          <Polyline
            coordinates={track.map((p) => ({ latitude: p.latitude, longitude: p.longitude }))}
            strokeColor={palette.primary}
            strokeWidth={4}
          />
        ) : null}
      </MapView>

      {/* box-none: the overlay itself passes touches through to the map. */}
      <SafeAreaView pointerEvents="box-none" style={StyleSheet.absoluteFill} edges={['top']}>
        <View style={[styles.panel, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Row>
            <Chip label="All" selected={filter === 'all'} onPress={() => setFilter('all')} />
            <Chip label="Today" selected={filter === 'today'} onPress={() => setFilter('today')} />
            <Chip label="Favourites" selected={filter === 'favorites'} onPress={() => setFilter('favorites')} />
            <Chip
              label="Near me now"
              selected={filter === 'near'}
              onPress={async () => {
                if (await locate()) setFilter('near');
              }}
            />
          </Row>
          <Row>
            <Button
              label={tracking ? 'Stop recording route' : 'Record my route'}
              variant={tracking ? 'danger' : 'secondary'}
              compact
              onPress={() => void toggleTracking()}
            />
            <AppText variant="caption" muted>
              {visible.length} place{visible.length === 1 ? '' : 's'} · long-press the map to add one
            </AppText>
          </Row>
          {notice ? <Banner text={notice} tone="warning" /> : null}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  panel: {
    margin: spacing.sm,
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: 12,
    borderWidth: 1,
  },
});
