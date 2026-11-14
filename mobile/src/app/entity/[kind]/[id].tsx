/**
 * Create / edit sheet for every editable entity kind, with its linked items.
 *
 * `id` is `new` when creating. Presets arrive as route params: coordinates
 * from a map long-press or "I'm here", a day from the itinerary, and link
 * targets suggested by where and when the entity is being made.
 */
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, View } from 'react-native';
import type { EntityId, EntityType, SyncEntityKind, SyncEntityMap } from '@travel-life/shared';
import {
  dayKeyInTimezone,
  isEntityType,
  isLinkableKind,
  resolveTimezone,
  wallClockToInstant,
} from '@travel-life/shared';

import EntityForm from '@/components/EntityForm';
import EntityLinkSection from '@/components/EntityLinkSection';
import PhotoAttachments, { type PickedPhoto } from '@/components/PhotoAttachments';
import { AppText, Banner, Button, Card, Chip, EmptyState, Row, Screen } from '@/components/ui';
import { parseIdKey } from '@/db/repository';
import {
  createEntity,
  deleteEntity,
  promoteSavedLink,
  updateEntity,
  type LinkSpec,
} from '@/domain/mutations';
import { suggestLinks, type LinkSuggestion } from '@/domain/smart';
import { getDb } from '@/lib/db';
import { ENTITY_FORMS, completeEntity, isFormKind, validationErrors } from '@/lib/entityForms';
import { useActiveTrip, useEntities, useEntity, useUserTimezone } from '@/lib/hooks';
import { notifyLocalChange, syncNow } from '@/lib/sync';
import { getCurrentPosition, positionFailureMessage } from '@/tasks/location';

type Values = Record<string, unknown>;

interface Params extends Record<string, string | undefined> {
  kind: string;
  id: string;
  tripId?: string;
  dayKey?: string;
  latitude?: string;
  longitude?: string;
  /** Create a Location at the given coordinates and link the new entity to it. */
  withLocation?: string;
  /** JSON object of initial field values (receipt scan, share sheet). */
  preset?: string;
}

/** Queue each chosen photo for upload, attached to its meal once both reach the server. */
async function queueMealPhotos(
  db: Parameters<typeof createEntity>[0],
  tripId: number,
  mealId: EntityId,
  photos: readonly PickedPhoto[]
): Promise<void> {
  for (const photo of photos) {
    const input: Omit<SyncEntityMap['PHOTO'], 'id' | 'tripId'> = {
      source: 'local',
      mediaType: 'image',
      localPath: null,
      thumbnailPath: null,
      caption: null,
      latitude: photo.latitude,
      longitude: photo.longitude,
      takenAt: photo.takenAt,
      pendingUri: photo.uri,
      foodLogId: mealId,
    };
    await createEntity(db, 'PHOTO', tripId, input);
  }
}

function parsePreset(raw: string | undefined): Values {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Values) : {};
  } catch {
    return {};
  }
}

export default function EntityScreen() {
  const params = useLocalSearchParams<Params>();
  const kind = isFormKind(params.kind) ? params.kind : null;
  const isNew = params.id === 'new';
  const entityId: EntityId | undefined = isNew || !params.id ? undefined : parseIdKey(params.id);

  const userTimezone = useUserTimezone();
  const { data: activeTrip } = useActiveTrip();
  const tripId = params.tripId ? Number(params.tripId) : activeTrip?.id;
  const tripZone = resolveTimezone(activeTrip?.timezone, userTimezone);

  const { data: existing, isLoading } = useEntity((kind ?? 'ACTIVITY') as SyncEntityKind, entityId);
  const { data: locations = [] } = useEntities(tripId, 'LOCATION');
  const { data: activities = [] } = useEntities(tripId, 'ACTIVITY');
  const { data: lodging = [] } = useEntities(tripId, 'LODGING');

  // What the form shows = a base (the stored row, or the presets for a new
  // entity) with the fields the user has touched laid over it. Deriving it this
  // way means a sync that refreshes the stored row mid-edit updates untouched
  // fields without discarding what was typed.
  const [edits, setEdits] = useState<Values>({});
  const [openedAt] = useState(() => new Date());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [suggestions, setSuggestions] = useState<LinkSuggestion[]>([]);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [suggestionsLoaded, setSuggestionsLoaded] = useState(false);
  // Meal photos chosen in this form; queued for upload when it saves.
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);

  const presetLatitude = params.latitude ? Number(params.latitude) : null;
  const presetLongitude = params.longitude ? Number(params.longitude) : null;

  const base = useMemo<Values | null>(() => {
    if (!kind) return null;
    if (!isNew) return existing ? { ...(existing as unknown as Values) } : null;
    const seed: Values = { ...ENTITY_FORMS[kind].defaults, ...parsePreset(params.preset) };
    if (kind === 'LOCATION' && presetLatitude !== null && presetLongitude !== null) {
      seed.latitude = presetLatitude;
      seed.longitude = presetLongitude;
    }
    if (kind === 'ACTIVITY' || kind === 'CUSTOM_ITEM') {
      // A spontaneous stop starts now; one added to a specific day starts at
      // midday on that day, ready to be adjusted.
      seed.startTime = params.dayKey
        ? wallClockToInstant(params.dayKey, 12 * 3600000, tripZone).toISOString()
        : (seed.startTime ?? openedAt.toISOString());
    }
    if (kind === 'EXPENSE' || kind === 'JOURNAL_ENTRY') {
      seed.date = seed.date ?? `${dayKeyInTimezone(openedAt, tripZone)}T00:00:00.000Z`;
    }
    return seed;
  }, [kind, isNew, existing, params.preset, params.dayKey, presetLatitude, presetLongitude, tripZone, openedAt]);

  const values = useMemo<Values | null>(() => (base ? { ...base, ...edits } : null), [base, edits]);

  // Smart context auto-linking: what is near, and what is happening right now.
  useEffect(() => {
    if (!isNew || !kind || !isEntityType(kind) || suggestionsLoaded || tripId === undefined) return;
    let cancelled = false;
    void (async () => {
      const position =
        presetLatitude !== null && presetLongitude !== null
          ? { latitude: presetLatitude, longitude: presetLongitude }
          : await getCurrentPosition();
      if (cancelled) return;
      const found = suggestLinks(kind, { locations, activities, lodging }, position);
      setSuggestions(found);
      // Pre-attached: the traveller removes a wrong guess rather than adding a right one.
      setAccepted(new Set(found.map((s) => `${s.targetType}:${s.targetId}`)));
      setSuggestionsLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, kind, suggestionsLoaded, tripId, locations, activities, lodging, presetLatitude, presetLongitude]);

  const definition = kind ? ENTITY_FORMS[kind] : null;
  const title = useMemo(
    () => (definition ? (isNew ? `New ${definition.noun}` : definition.title) : 'Not found'),
    [definition, isNew]
  );

  if (!kind || !definition) {
    return (
      <Screen>
        <EmptyState title="This item cannot be edited on the phone" />
      </Screen>
    );
  }
  if (tripId === undefined) {
    return (
      <Screen>
        <EmptyState title="No trip selected" />
      </Screen>
    );
  }
  if (!isNew && !isLoading && !existing) {
    return (
      <Screen>
        <Stack.Screen options={{ title }} />
        <EmptyState title="No longer available" message="It may have been deleted on another device." />
      </Screen>
    );
  }
  if (values === null) return <Screen>{null}</Screen>;

  const save = async () => {
    const checked = validationErrors(kind, values);
    if (!checked.ok) {
      setErrors(checked.errors);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const db = await getDb();
      if (isNew) {
        const links: LinkSpec[] = suggestions
          .filter((s) => accepted.has(`${s.targetType}:${s.targetId}`))
          .map((s) => ({ targetType: s.targetType, targetId: s.targetId, relationship: s.relationship }));

        // One transaction: "new activity at this pin" must never leave a place
        // without its activity, or an activity without its link.
        await db.transaction(async (tx) => {
          if (params.withLocation && presetLatitude !== null && presetLongitude !== null && kind !== 'LOCATION') {
            const place = await createEntity(
              tx,
              'LOCATION',
              tripId,
              completeEntity('LOCATION', {
                name: String(checked.data.name ?? 'Pinned location'),
                latitude: presetLatitude,
                longitude: presetLongitude,
              }) as Omit<SyncEntityMap['LOCATION'], 'id' | 'tripId'>
            );
            links.push({ targetType: 'LOCATION', targetId: place.id });
          }
          const created = await createEntity(
            tx,
            kind,
            tripId,
            completeEntity(kind, checked.data) as Omit<SyncEntityMap[typeof kind], 'id' | 'tripId'>,
            isLinkableKind(kind) ? links : []
          );
          if (kind === 'FOOD_LOG') await queueMealPhotos(tx, tripId, created.id, photos);
        });
      } else if (entityId !== undefined) {
        await updateEntity(db, kind, entityId, checked.data as Partial<SyncEntityMap[typeof kind]>);
        if (kind === 'FOOD_LOG') await queueMealPhotos(db, tripId, entityId, photos);
      }
      await notifyLocalChange();
      void syncNow();
      router.back();
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = () => {
    if (entityId === undefined) return;
    // Two buttons: within Android's alert limit.
    Alert.alert(`Delete this ${definition.noun}?`, 'It will be removed from the trip for everyone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteEntity(await getDb(), kind, entityId);
          await notifyLocalChange();
          void syncNow();
          router.back();
        },
      },
    ]);
  };

  const promote = async (to: 'ACTIVITY' | 'LOCATION') => {
    if (entityId === undefined) return;
    const created = await promoteSavedLink(await getDb(), entityId, to, { timezone: activeTrip?.timezone });
    await notifyLocalChange();
    if (created) {
      router.replace({
        pathname: '/entity/[kind]/[id]',
        params: { kind: to, id: String(created.id), tripId: String(tripId) },
      });
    }
  };

  const fillFromGps = async () => {
    const position = await getCurrentPosition();
    if (!position) {
      setErrors((prev) => ({ ...prev, latitude: positionFailureMessage('fill in your position') }));
      return;
    }
    setEdits((prev) => ({
      ...prev,
      latitude: Number(position.latitude.toFixed(6)),
      longitude: Number(position.longitude.toFixed(6)),
    }));
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title }} />
      <Screen>
        {Object.keys(errors).length > 0 ? <Banner tone="danger" text="Check the highlighted fields." /> : null}

        {kind === 'LOCATION' ? (
          <Button label="📍 Use current GPS location" variant="secondary" onPress={() => void fillFromGps()} />
        ) : null}

        <EntityForm
          fields={definition.fields}
          values={values}
          errors={errors}
          fallbackTimezone={tripZone}
          locations={locations}
          onChange={(key, value) => setEdits((prev) => ({ ...prev, [key]: value }))}
        />

        {kind === 'FOOD_LOG' ? <PhotoAttachments photos={photos} onChange={setPhotos} /> : null}

        {isNew && suggestions.length > 0 ? (
          <Card>
            <AppText variant="heading">Link automatically</AppText>
            <AppText variant="caption" muted>
              Based on where you are and what is on the itinerary right now. Tap to remove.
            </AppText>
            <Row>
              {suggestions.map((suggestion) => {
                const key = `${suggestion.targetType}:${suggestion.targetId}`;
                return (
                  <Chip
                    key={key}
                    label={`${suggestion.label}${
                      suggestion.distanceMeters !== undefined ? ` · ${suggestion.distanceMeters} m` : ''
                    }`}
                    selected={accepted.has(key)}
                    onPress={() =>
                      setAccepted((prev) => {
                        const next = new Set(prev);
                        if (next.has(key)) next.delete(key);
                        else next.add(key);
                        return next;
                      })
                    }
                  />
                );
              })}
            </Row>
          </Card>
        ) : null}

        <Button label={isNew ? `Add ${definition.noun}` : 'Save changes'} onPress={() => void save()} loading={saving} />

        {!isNew && kind === 'SAVED_LINK' ? (
          <Row>
            <Button label="Promote to activity" variant="secondary" compact onPress={() => void promote('ACTIVITY')} />
            <Button label="Promote to location" variant="secondary" compact onPress={() => void promote('LOCATION')} />
          </Row>
        ) : null}

        {!isNew && entityId !== undefined && isEntityType(kind) ? (
          <EntityLinkSection tripId={tripId} type={kind as EntityType} id={entityId} />
        ) : null}

        {!isNew ? (
          <View>
            <Button label={`Delete ${definition.noun}`} variant="danger" onPress={confirmDelete} />
          </View>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
