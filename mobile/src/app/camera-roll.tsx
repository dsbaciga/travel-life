/**
 * Camera roll auto-sync: find photos taken during the trip, group them into
 * moments, propose links from the itinerary, and queue them for upload.
 */
import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import * as MediaLibrary from 'expo-media-library';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { EntityId, SyncEntityMap } from '@travel-life/shared';
import {
  addDaysToDayKey,
  dateOnlyKey,
  dayKeyInTimezone,
  formatDateOnly,
  formatTimeInTimezone,
  resolveTimezone,
  startOfDayInTimezone,
} from '@travel-life/shared';

import { AppText, Banner, Button, Card, Chip, EmptyState, Row, Screen } from '@/components/ui';
import { kvGet, kvSet } from '@/db/repository';
import { createEntity, type LinkSpec } from '@/domain/mutations';
import { clusterAssets, suggestLinks, type AssetCluster, type CameraAsset, type LinkSuggestion } from '@/domain/smart';
import { getDb } from '@/lib/db';
import { useActiveTrip, useEntities, useUserTimezone } from '@/lib/hooks';
import { notifyLocalChange, syncNow, useSync } from '@/lib/sync';
import { spacing } from '@/lib/theme';

/** Keeps a huge trip from loading thousands of thumbnails at once. */
const MAX_ASSETS = 300;

interface Moment {
  cluster: AssetCluster<CameraAsset>;
  suggestions: LinkSuggestion[];
}

const importedKey = (tripId: number): string => `imported-assets:${tripId}`;

export default function CameraRollScreen() {
  const userTimezone = useUserTimezone();
  const version = useSync((state) => state.dataVersion);
  const { data: trip } = useActiveTrip();
  const { data: locations = [] } = useEntities(trip?.id, 'LOCATION');
  const { data: activities = [] } = useEntities(trip?.id, 'ACTIVITY');
  const { data: lodging = [] } = useEntities(trip?.id, 'LODGING');
  const [permission, requestPermission] = MediaLibrary.usePermissions();
  const [busyIndex, setBusyIndex] = useState<number | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());

  const tripZone = resolveTimezone(trip?.timezone, userTimezone);
  const granted = permission?.granted ?? false;

  const { data: moments = [], isLoading } = useQuery({
    queryKey: ['camera-roll', trip?.id, granted, version, locations.length, activities.length],
    enabled: Boolean(trip) && granted,
    queryFn: async (): Promise<Moment[]> => {
      const start = dateOnlyKey(trip?.startDate);
      const end = dateOnlyKey(trip?.endDate);
      if (!trip || !start || !end) return [];
      // The trip's first and last calendar days, in the trip's own zone.
      const from = startOfDayInTimezone(start, tripZone).getTime();
      const to = startOfDayInTimezone(addDaysToDayKey(end, 1), tripZone).getTime();

      const found = await new MediaLibrary.Query()
        .eq(MediaLibrary.AssetField.MEDIA_TYPE, MediaLibrary.MediaType.IMAGE)
        .gte(MediaLibrary.AssetField.CREATION_TIME, from)
        .lt(MediaLibrary.AssetField.CREATION_TIME, to)
        .orderBy({ key: MediaLibrary.AssetField.CREATION_TIME, ascending: true })
        .limit(MAX_ASSETS)
        .exe();

      const already = new Set((await kvGet<string[]>(await getDb(), importedKey(trip.id))) ?? []);
      const assets: CameraAsset[] = [];
      for (const asset of found) {
        if (already.has(asset.id)) continue;
        const [uri, creationTime, location] = await Promise.all([
          asset.getUri(),
          asset.getCreationTime(),
          asset.getLocation().catch(() => null),
        ]);
        if (creationTime === null) continue;
        assets.push({
          id: asset.id,
          uri,
          creationTime,
          latitude: location?.latitude ?? null,
          longitude: location?.longitude ?? null,
        });
      }

      return clusterAssets(assets).map((cluster) => ({
        cluster,
        // One suggestion set per moment, from its centre and its first shot.
        suggestions: suggestLinks('PHOTO', { locations, activities, lodging }, cluster.center, new Date(cluster.startMs)),
      }));
    },
  });

  if (!trip) {
    return (
      <Screen>
        <EmptyState title="No trip selected" />
      </Screen>
    );
  }

  if (!granted) {
    return (
      <Screen>
        <AppText variant="heading">Find this trip’s photos</AppText>
        <AppText muted>
          Travel Life looks only at photos taken between {formatDateOnly(trip.startDate)} and{' '}
          {formatDateOnly(trip.endDate)}. Nothing is uploaded until you review it.
        </AppText>
        <Button label="Allow photo access" onPress={() => void requestPermission()} />
      </Screen>
    );
  }

  const markImported = async (ids: string[]) => {
    const db = await getDb();
    const existing = (await kvGet<string[]>(db, importedKey(trip.id))) ?? [];
    await kvSet(db, importedKey(trip.id), [...new Set([...existing, ...ids])]);
  };

  const importMoment = async (index: number, moment: Moment, withLinks: boolean) => {
    setBusyIndex(index);
    try {
      const db = await getDb();
      const links: LinkSpec[] = withLinks
        ? moment.suggestions.map((s) => ({
            targetType: s.targetType,
            targetId: s.targetId as EntityId,
            relationship: s.relationship,
          }))
        : [];
      for (const asset of moment.cluster.assets) {
        const photo: Omit<SyncEntityMap['PHOTO'], 'id' | 'tripId'> = {
          source: 'local',
          mediaType: 'image',
          localPath: null,
          thumbnailPath: null,
          caption: null,
          latitude: asset.latitude ?? null,
          longitude: asset.longitude ?? null,
          takenAt: new Date(asset.creationTime).toISOString(),
          pendingUri: asset.uri,
        };
        await createEntity(db, 'PHOTO', trip.id, photo, links);
      }
      await markImported(moment.cluster.assets.map((asset) => asset.id));
      await notifyLocalChange();
      void syncNow();
    } finally {
      setBusyIndex(null);
    }
  };

  const visible = moments.filter((moment) => !skipped.has(moment.cluster.assets[0].id));
  const total = visible.reduce((sum, moment) => sum + moment.cluster.assets.length, 0);

  return (
    <Screen>
      {total > 0 ? (
        <Banner text={`${total} new photo${total === 1 ? '' : 's'} from this trip — review and link them below.`} />
      ) : null}
      {isLoading ? <AppText muted>Looking through your camera roll…</AppText> : null}
      {!isLoading && visible.length === 0 ? (
        <EmptyState title="All caught up" message="No new photos from this trip’s dates." />
      ) : null}

      {visible.map((moment, index) => {
        const { cluster, suggestions } = moment;
        const first = new Date(cluster.startMs);
        return (
          <Card key={cluster.assets[0].id}>
            <AppText variant="heading">
              {formatDateOnly(`${dayKeyInTimezone(first, tripZone)}T00:00:00Z`, { month: 'short', day: 'numeric' })} ·{' '}
              {formatTimeInTimezone(first, tripZone)} · {cluster.assets.length} photo
              {cluster.assets.length === 1 ? '' : 's'}
            </AppText>
            <View style={styles.thumbs}>
              {cluster.assets.slice(0, 8).map((asset) => (
                <Image
                  key={asset.id}
                  source={{ uri: asset.uri }}
                  style={styles.thumb}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                  accessibilityIgnoresInvertColors
                />
              ))}
            </View>
            {suggestions.length > 0 ? (
              <Row>
                {suggestions.map((s) => (
                  <Chip key={`${s.targetType}:${s.targetId}`} label={`→ ${s.label}`} tone="info" />
                ))}
              </Row>
            ) : (
              <AppText variant="caption" muted>
                No nearby place or activity found — you can link these later.
              </AppText>
            )}
            <Row>
              <Button
                label={suggestions.length > 0 ? 'Upload & link' : 'Upload'}
                compact
                loading={busyIndex === index}
                onPress={() => void importMoment(index, moment, true)}
              />
              {suggestions.length > 0 ? (
                <Button
                  label="Upload without links"
                  variant="secondary"
                  compact
                  disabled={busyIndex !== null}
                  onPress={() => void importMoment(index, moment, false)}
                />
              ) : null}
              <Button
                label="Skip"
                variant="ghost"
                compact
                onPress={() => setSkipped((prev) => new Set(prev).add(cluster.assets[0].id))}
              />
            </Row>
          </Card>
        );
      })}
      <Button label="Done" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  thumb: { width: 72, height: 72, borderRadius: 6 },
});
