/**
 * EntityLinkPicker: search existing trip entities of any linkable type, or
 * create a new one on the spot and link it in the same transaction.
 */
import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import type { EntityId, EntityType, SyncEntityKind, SyncEntityMap } from '@travel-life/shared';
import {
  ENTITY_TYPES,
  ENTITY_TYPE_LABELS,
  LINK_RELATIONSHIP_LABELS,
  getDefaultRelationship,
  isEntityType,
} from '@travel-life/shared';

import { entityLabel } from '@/components/EntityLinkSection';
import { AppText, Button, Card, Chip, EmptyState, Field, Screen } from '@/components/ui';
import { listEntities, listLinksFor, parseIdKey } from '@/db/repository';
import { bulkLinkPhotos, createAndLink, createLink } from '@/domain/mutations';
import { getDb } from '@/lib/db';
import { completeEntity } from '@/lib/entityForms';
import { notifyLocalChange, syncNow, useSync } from '@/lib/sync';
import { spacing } from '@/lib/theme';
import { getCurrentPosition } from '@/tasks/location';

/** PDF imports are server-side only; everything else can be picked offline. */
const PICKABLE: readonly EntityType[] = ENTITY_TYPES.filter((type) => type !== 'PDF_IMPORT');

interface Params extends Record<string, string | undefined> {
  tripId: string;
  sourceType: string;
  /** A single source id, or a comma-separated list for bulk photo linking. */
  sourceId: string;
}

export default function LinkPickerScreen() {
  const params = useLocalSearchParams<Params>();
  const tripId = Number(params.tripId);
  const sourceType = isEntityType(params.sourceType) ? params.sourceType : null;
  const sourceIds = useMemo<EntityId[]>(
    () => (params.sourceId ?? '').split(',').filter(Boolean).map(parseIdKey),
    [params.sourceId]
  );
  const version = useSync((state) => state.dataVersion);

  const [targetType, setTargetType] = useState<EntityType>('LOCATION');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const { data: candidates = [] } = useQuery({
    queryKey: ['link-candidates', tripId, targetType, version],
    queryFn: async () =>
      (await listEntities(await getDb(), tripId, targetType as SyncEntityKind)) as unknown as (Record<string, unknown> & { id: EntityId })[],
  });

  // Already-linked targets are shown as such instead of offered again.
  const { data: linkedKeys = new Set<string>() } = useQuery({
    queryKey: ['link-existing', tripId, sourceType, params.sourceId, version],
    enabled: sourceType !== null && sourceIds.length === 1,
    queryFn: async () => {
      const links = await listLinksFor(await getDb(), tripId, sourceType as EntityType, sourceIds[0]);
      return new Set(
        links.flatMap((link) => [
          `${link.targetType}:${link.targetId}`,
          `${link.sourceType}:${link.sourceId}`,
        ])
      );
    },
  });

  if (!sourceType || sourceIds.length === 0 || !Number.isFinite(tripId)) {
    return (
      <Screen>
        <EmptyState title="Nothing to link" />
      </Screen>
    );
  }

  const relationship = getDefaultRelationship(sourceType, targetType);
  const needle = search.trim().toLowerCase();
  const filtered = candidates.filter((row) => {
    // An entity cannot link to itself.
    if (targetType === sourceType && sourceIds.some((id) => String(id) === String(row.id))) return false;
    return needle === '' || entityLabel(targetType, row).toLowerCase().includes(needle);
  });

  const finish = async () => {
    await notifyLocalChange();
    void syncNow();
    router.back();
  };

  const linkTo = async (targetId: EntityId) => {
    setBusy(true);
    try {
      const db = await getDb();
      if (sourceType === 'PHOTO' && sourceIds.length > 1) {
        await bulkLinkPhotos(db, tripId, sourceIds, { targetType, targetId });
      } else {
        for (const sourceId of sourceIds) {
          await createLink(db, tripId, sourceType, sourceId, { targetType, targetId });
        }
      }
      await finish();
    } finally {
      setBusy(false);
    }
  };

  /** "+ Create New Location Here & Link" — entity and link in one transaction. */
  const createHereAndLink = async () => {
    setBusy(true);
    try {
      const db = await getDb();
      const name = search.trim() || 'New place';
      if (targetType === 'LOCATION') {
        const position = await getCurrentPosition();
        const input = completeEntity('LOCATION', {
          name,
          latitude: position ? Number(position.latitude.toFixed(6)) : null,
          longitude: position ? Number(position.longitude.toFixed(6)) : null,
        }) as Omit<SyncEntityMap['LOCATION'], 'id' | 'tripId'>;
        await createAndLink(db, tripId, { type: sourceType, id: sourceIds[0] }, 'LOCATION', input);
      } else {
        const input = completeEntity('ACTIVITY', {
          name,
          startTime: new Date().toISOString(),
        }) as Omit<SyncEntityMap['ACTIVITY'], 'id' | 'tripId'>;
        await createAndLink(db, tripId, { type: sourceType, id: sourceIds[0] }, 'ACTIVITY', input);
      }
      await finish();
    } finally {
      setBusy(false);
    }
  };

  const canCreateInline = (targetType === 'LOCATION' || targetType === 'ACTIVITY') && sourceIds.length === 1;

  return (
    <Screen>
      <AppText muted>
        {sourceIds.length > 1 ? `Linking ${sourceIds.length} items` : 'Link'} as “
        {LINK_RELATIONSHIP_LABELS[relationship]}”
      </AppText>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {PICKABLE.map((type) => (
          <Chip
            key={type}
            label={ENTITY_TYPE_LABELS[type]}
            selected={type === targetType}
            onPress={() => setTargetType(type)}
          />
        ))}
      </ScrollView>

      <Field
        label={`Search ${ENTITY_TYPE_LABELS[targetType].toLowerCase()}`}
        value={search}
        onChangeText={setSearch}
        autoCorrect={false}
        placeholder={canCreateInline ? 'Search, or type a name to create' : 'Search'}
      />

      {canCreateInline ? (
        <Button
          label={
            targetType === 'LOCATION'
              ? `+ Create new location here & link${search.trim() ? `: ${search.trim()}` : ''}`
              : `+ Create new activity now & link${search.trim() ? `: ${search.trim()}` : ''}`
          }
          variant="secondary"
          loading={busy}
          onPress={() => void createHereAndLink()}
        />
      ) : null}

      {filtered.length === 0 ? (
        <EmptyState title={`No ${ENTITY_TYPE_LABELS[targetType].toLowerCase()} match`} />
      ) : (
        <View style={styles.list}>
          {filtered.map((row) => {
            const already = linkedKeys.has(`${targetType}:${row.id}`);
            return (
              <Card
                key={String(row.id)}
                accessibilityLabel={entityLabel(targetType, row)}
                onPress={already || busy ? undefined : () => void linkTo(row.id)}>
                <AppText variant="heading" numberOfLines={1} muted={already}>
                  {entityLabel(targetType, row)}
                </AppText>
                {already ? <AppText variant="caption" muted>Already linked</AppText> : null}
              </Card>
            );
          })}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { gap: spacing.sm, paddingVertical: spacing.xs },
  list: { gap: spacing.sm },
});
