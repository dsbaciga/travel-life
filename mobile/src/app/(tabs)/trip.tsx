/**
 * Full itinerary: day-by-day timeline, a browser by entity type, checklists,
 * and the review queue for entities extracted from shared booking PDFs.
 */
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import type { EntityId, SyncEntityKind } from '@travel-life/shared';
import { dayKeyInTimezone, formatDateOnly, resolveTimezone } from '@travel-life/shared';

import { showActionSheet } from '@/components/ActionSheet';
import TimelineRow from '@/components/TimelineRow';
import { AppText, Banner, Button, Card, Chip, EmptyState, Row, Screen } from '@/components/ui';
import {
  adjustTime,
  promoteSavedLink,
  reorderActivities,
  toggleChecklistItem,
} from '@/domain/mutations';
import { buildTripDays, unscheduledItems, type TimelineItem } from '@/domain/timeline';
import { getDb } from '@/lib/db';
import { ENTITY_FORMS, type FormKind } from '@/lib/entityForms';
import {
  useActiveTrip,
  useDirtyKeys,
  useEntities,
  useNow,
  useTripTimeline,
  useUserTimezone,
} from '@/lib/hooks';
import { api } from '@/lib/session';
import { notifyLocalChange, syncNow, useSync } from '@/lib/sync';
import { spacing, TOUCH_TARGET, usePalette } from '@/lib/theme';

type Mode = 'days' | 'types' | 'checklists' | 'review';

const TYPE_TABS: readonly { kind: FormKind; label: string }[] = [
  { kind: 'ACTIVITY', label: 'Activities' },
  { kind: 'LOCATION', label: 'Locations' },
  { kind: 'TRANSPORTATION', label: 'Transit' },
  { kind: 'LODGING', label: 'Lodging' },
  { kind: 'SAVED_LINK', label: 'Links' },
  { kind: 'EXPENSE', label: 'Expenses' },
  { kind: 'FOOD_LOG', label: 'Food log' },
  { kind: 'JOURNAL_ENTRY', label: 'Journal' },
  { kind: 'CUSTOM_ITEM', label: 'Custom' },
];

interface PendingEntity {
  id: number;
  entityType: string;
  tripId: number | null;
  data: Record<string, unknown> | null;
}

type DayRow =
  | { type: 'header'; key: string; dayKey: string; count: number }
  | { type: 'item'; key: string; dayKey: string; item: TimelineItem };

function rowTitle(kind: FormKind, row: Record<string, unknown>): string {
  for (const key of [ENTITY_FORMS[kind].titleKey, 'name', 'title', 'url', 'restaurantName']) {
    const value = row[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return ENTITY_FORMS[kind].title;
}

export default function TripScreen() {
  const palette = usePalette();
  const now = useNow(60000);
  const userTimezone = useUserTimezone();
  const { data: trip } = useActiveTrip();
  const { data: timeline } = useTripTimeline(trip);
  const { data: dirty } = useDirtyKeys(trip?.id);
  const syncing = useSync((state) => state.syncing);
  const offline = useSync((state) => state.offline);
  const version = useSync((state) => state.dataVersion);

  const [mode, setMode] = useState<Mode>('days');
  const [typeKind, setTypeKind] = useState<FormKind>('ACTIVITY');

  const { data: typeRows = [] } = useEntities(trip?.id, typeKind as SyncEntityKind);
  const { data: savedLinks = [] } = useEntities(trip?.id, 'SAVED_LINK');
  const { data: checklists = [] } = useEntities(trip?.id, 'CHECKLIST');
  const { data: checklistItems = [] } = useEntities(trip?.id, 'CHECKLIST_ITEM');

  const tripZone = resolveTimezone(trip?.timezone, userTimezone);
  const todayKey = dayKeyInTimezone(now, tripZone);
  const items = useMemo(() => timeline?.items ?? [], [timeline]);
  const days = useMemo(() => (trip ? buildTripDays(trip, items) : []), [trip, items]);
  const unscheduled = useMemo(() => unscheduledItems(items), [items]);

  const dayRows = useMemo<DayRow[]>(() => {
    const rows: DayRow[] = [];
    for (const day of days) {
      rows.push({ type: 'header', key: `h:${day.dayKey}`, dayKey: day.dayKey, count: day.items.length });
      for (const item of day.items) {
        rows.push({ type: 'item', key: `${day.dayKey}:${item.key}`, dayKey: day.dayKey, item });
      }
    }
    return rows;
  }, [days]);

  // The review queue lives on the server (it needs the LLM extraction results).
  const { data: pending = [], refetch: refetchPending } = useQuery({
    queryKey: ['pending-entities', trip?.id, version],
    enabled: Boolean(trip) && mode === 'review',
    queryFn: async (): Promise<PendingEntity[]> => {
      const result = await api.request<PendingEntity[] | { entities?: PendingEntity[] }>('/pdf-imports/pending');
      const list = Array.isArray(result) ? result : (result?.entities ?? []);
      return list.filter((entity) => entity.tripId === null || entity.tripId === trip?.id);
    },
  });

  const moveActivity = useCallback(
    async (dayKey: string, entityId: EntityId, direction: -1 | 1) => {
      const day = days.find((d) => d.dayKey === dayKey);
      if (!day) return;
      const order = day.items.filter((i) => i.type === 'ACTIVITY' && !i.allDay).map((i) => i.entityId);
      const from = order.findIndex((id) => String(id) === String(entityId));
      const to = from + direction;
      if (from < 0 || to < 0 || to >= order.length) return;
      [order[from], order[to]] = [order[to], order[from]];
      await reorderActivities(await getDb(), order);
      await notifyLocalChange();
    },
    [days]
  );

  /** "Swap / Add from Saved Links or Unscheduled" for one day. */
  const addToDay = useCallback(
    (dayKey: string) => {
      if (!trip) return;
      const actions = [
        ...unscheduled
          .filter((item) => item.entityKind === 'ACTIVITY' || item.entityKind === 'CUSTOM_ITEM')
          .slice(0, 12)
          .map((item) => ({
            label: `Schedule: ${item.title}`,
            onPress: async () => {
              await adjustTime(
                await getDb(),
                item.entityKind as 'ACTIVITY' | 'CUSTOM_ITEM',
                item.entityId,
                { type: 'moveToDay', dayKey },
                item.timezone
              );
              await notifyLocalChange();
            },
          })),
        ...savedLinks.slice(0, 12).map((link) => ({
          label: `From link: ${link.title ?? link.url}`,
          onPress: async () => {
            const created = await promoteSavedLink(await getDb(), link.id, 'ACTIVITY', {
              timezone: trip.timezone,
            });
            if (created) {
              await adjustTime(await getDb(), 'ACTIVITY', created.id, { type: 'moveToDay', dayKey }, tripZone);
            }
            await notifyLocalChange();
          },
        })),
        {
          label: 'New activity on this day',
          onPress: () =>
            router.push({
              pathname: '/entity/[kind]/[id]',
              params: { kind: 'ACTIVITY', id: 'new', tripId: String(trip.id), dayKey },
            }),
        },
      ];
      showActionSheet(`Add to ${formatDateOnly(`${dayKey}T00:00:00Z`)}`, actions);
    },
    [trip, unscheduled, savedLinks, tripZone]
  );

  const reviewPending = useCallback(
    (entity: PendingEntity) => {
      const decide = (verb: 'accept' | 'reject') => async () => {
        await api.request(`/pdf-imports/pending/${entity.id}/${verb}`, { method: 'POST', body: {} });
        await refetchPending();
        // Accepting creates a real entity server-side; pull it into the mirror.
        if (verb === 'accept') void syncNow();
      };
      showActionSheet(String(entity.data?.name ?? entity.data?.title ?? entity.entityType), [
        { label: 'Accept and add to trip', onPress: decide('accept') },
        { label: 'Reject', destructive: true, onPress: decide('reject') },
      ]);
    },
    [refetchPending]
  );

  if (!trip) {
    return (
      <Screen>
        <EmptyState title="No trip selected" />
        <Button label="Choose a trip" onPress={() => router.push('/trips')} />
      </Screen>
    );
  }

  const modeBar = (
    <View style={styles.modeBar}>
      <AppText variant="title" numberOfLines={1}>
        {trip.title}
      </AppText>
      <AppText muted>
        {formatDateOnly(trip.startDate)} – {formatDateOnly(trip.endDate)}
      </AppText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="Day by day" selected={mode === 'days'} onPress={() => setMode('days')} />
        <Chip label="By type" selected={mode === 'types'} onPress={() => setMode('types')} />
        <Chip label="Checklists" selected={mode === 'checklists'} onPress={() => setMode('checklists')} />
        <Chip label="Review queue" selected={mode === 'review'} onPress={() => setMode('review')} />
        <Chip label="Photos" onPress={() => router.push('/camera-roll')} />
      </ScrollView>
    </View>
  );

  if (mode === 'days') {
    return (
      <Screen scroll={false} padded={false}>
        <FlashList
          data={dayRows}
          keyExtractor={(row) => row.key}
          getItemType={(row) => row.type}
          ListHeaderComponent={modeBar}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => void syncNow()} />}
          ListEmptyComponent={<EmptyState title="No days yet" message="Set trip dates in the web app, or add an activity." />}
          renderItem={({ item: row }) =>
            row.type === 'header' ? (
              <Row style={styles.dayHeader}>
                <AppText variant="heading" color={row.dayKey === todayKey ? palette.primary : undefined}>
                  {formatDateOnly(`${row.dayKey}T00:00:00Z`, { weekday: 'short', month: 'short', day: 'numeric' })}
                  {row.dayKey === todayKey ? ' · Today' : ''}
                </AppText>
                <Button label="+ Add" variant="ghost" compact onPress={() => addToDay(row.dayKey)} />
              </Row>
            ) : (
              <View style={styles.rowWrap}>
                <TimelineRow
                  item={row.item}
                  tripId={trip.id}
                  dayKey={row.dayKey}
                  tripTimezone={tripZone}
                  pending={dirty?.has(`${row.item.entityKind}:${row.item.entityId}`) ?? false}
                  onMove={(id, direction) => void moveActivity(row.dayKey, id, direction)}
                />
              </View>
            )
          }
        />
      </Screen>
    );
  }

  if (mode === 'types') {
    const rows = typeRows as unknown as (Record<string, unknown> & { id: EntityId })[];
    return (
      <Screen scroll={false} padded={false}>
        <FlashList
          data={rows}
          keyExtractor={(row) => String(row.id)}
          contentContainerStyle={styles.list}
          ListHeaderComponent={
            <View>
              {modeBar}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {TYPE_TABS.map((tab) => (
                  <Chip
                    key={tab.kind}
                    label={tab.label}
                    selected={typeKind === tab.kind}
                    onPress={() => setTypeKind(tab.kind)}
                  />
                ))}
              </ScrollView>
              <View style={styles.rowWrap}>
                <Button
                  label={`New ${ENTITY_FORMS[typeKind].noun}`}
                  variant="secondary"
                  onPress={() =>
                    router.push({
                      pathname: '/entity/[kind]/[id]',
                      params: { kind: typeKind, id: 'new', tripId: String(trip.id) },
                    })
                  }
                />
              </View>
            </View>
          }
          ListEmptyComponent={<EmptyState title={`No ${ENTITY_FORMS[typeKind].title.toLowerCase()} yet`} />}
          renderItem={({ item: row }) => (
            <View style={styles.rowWrap}>
              <Card
                accessibilityLabel={rowTitle(typeKind, row)}
                onPress={() =>
                  router.push({
                    pathname: '/entity/[kind]/[id]',
                    params: { kind: typeKind, id: String(row.id), tripId: String(trip.id) },
                  })
                }>
                <Row style={styles.between}>
                  <AppText variant="heading" numberOfLines={1} style={styles.flex}>
                    {rowTitle(typeKind, row)}
                  </AppText>
                  {dirty?.has(`${typeKind}:${row.id}`) ? <Chip label="Not synced" tone="info" /> : null}
                </Row>
                {typeKind === 'EXPENSE' ? (
                  <AppText muted>
                    {String(row.amount)} {String(row.currency ?? '')}
                  </AppText>
                ) : null}
                {typeKind === 'FOOD_LOG' ? (
                  <AppText muted>
                    {'★'.repeat(Number(row.rating) || 0)} · {String(row.restaurantName ?? '')}
                  </AppText>
                ) : null}
              </Card>
            </View>
          )}
        />
      </Screen>
    );
  }

  if (mode === 'checklists') {
    return (
      <Screen>
        {modeBar}
        {checklists.length === 0 ? (
          <EmptyState title="No checklists for this trip" message="Create packing and pre-trip lists in the web app." />
        ) : (
          checklists.map((list) => {
            const listItems = checklistItems
              .filter((item) => String(item.checklistId) === String(list.id))
              .sort((a, b) => a.sortOrder - b.sortOrder);
            const done = listItems.filter((item) => item.isChecked).length;
            return (
              <Card key={String(list.id)}>
                <Row style={styles.between}>
                  <AppText variant="heading">{list.name}</AppText>
                  <AppText muted>
                    {done}/{listItems.length}
                  </AppText>
                </Row>
                {listItems.map((item) => (
                  <Pressable
                    key={String(item.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: item.isChecked }}
                    accessibilityLabel={item.name}
                    style={styles.checkRow}
                    onPress={async () => {
                      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                      await toggleChecklistItem(await getDb(), item.id, !item.isChecked);
                      await notifyLocalChange();
                    }}>
                    <AppText variant="heading" color={item.isChecked ? palette.success : palette.textMuted}>
                      {item.isChecked ? '☑' : '☐'}
                    </AppText>
                    <AppText muted={item.isChecked} style={[styles.flex, item.isChecked && styles.struck]}>
                      {item.name}
                    </AppText>
                  </Pressable>
                ))}
              </Card>
            );
          })
        )}
      </Screen>
    );
  }

  return (
    <Screen>
      {modeBar}
      {offline ? <Banner tone="warning" text="The review queue needs a connection." /> : null}
      {pending.length === 0 ? (
        <EmptyState
          title="Nothing to review"
          message="Share a booking PDF to Travel Life and the flights, stays and activities it finds appear here."
        />
      ) : (
        pending.map((entity) => (
          <Card key={entity.id} onPress={() => reviewPending(entity)} accessibilityLabel={`Review ${entity.entityType}`}>
            <AppText variant="label" muted>
              {entity.entityType}
            </AppText>
            <AppText variant="heading">{String(entity.data?.name ?? entity.data?.title ?? 'Extracted item')}</AppText>
            <AppText muted>Tap to accept or reject</AppText>
          </Card>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  modeBar: { padding: spacing.lg, gap: spacing.sm },
  chips: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.xs },
  list: { paddingBottom: 140 },
  rowWrap: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  dayHeader: { justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  between: { justifyContent: 'space-between', flexWrap: 'nowrap' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: TOUCH_TARGET },
  struck: { textDecorationLine: 'line-through' },
});
