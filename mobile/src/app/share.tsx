/**
 * Native share target: a URL, a maps place, a booking PDF or photos shared
 * from another app land here and are filed into the active trip.
 */
import { router } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useMemo, useState } from 'react';
import type { SyncEntityMap } from '@travel-life/shared';
import { dayKeyInTimezone, resolveTimezone } from '@travel-life/shared';

import { AppText, Banner, Button, Card, EmptyState, Screen } from '@/components/ui';
import { listEntities } from '@/db/repository';
import { createEntity, type LinkSpec } from '@/domain/mutations';
import { classifyShare, suggestLinks } from '@/domain/smart';
import { getDb } from '@/lib/db';
import { completeEntity } from '@/lib/entityForms';
import { useActiveTrip, useUserTimezone } from '@/lib/hooks';
import { api } from '@/lib/session';
import { notifyLocalChange, syncNow } from '@/lib/sync';

export default function ShareScreen() {
  const { shareIntent, resetShareIntent } = useShareIntentContext();
  const { data: trip } = useActiveTrip();
  const userTimezone = useUserTimezone();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const content = useMemo(
    () =>
      classifyShare({
        text: shareIntent.text,
        webUrl: shareIntent.webUrl,
        files: (shareIntent.files ?? []).map((file) => ({
          path: file.path,
          mimeType: file.mimeType,
          fileName: file.fileName,
        })),
      }),
    [shareIntent]
  );

  const close = () => {
    resetShareIntent();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      await notifyLocalChange();
      void syncNow();
      close();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save that');
      setBusy(false);
    }
  };

  if (!trip) {
    return (
      <Screen>
        <EmptyState title="No trip to save into" message="Open Travel Life and choose a trip first." />
        <Button label="Close" variant="ghost" onPress={close} />
      </Screen>
    );
  }
  if (!content) {
    return (
      <Screen>
        <EmptyState title="Nothing Travel Life can save" message="Share a link, a maps place, a booking PDF or photos." />
        <Button label="Close" variant="ghost" onPress={close} />
      </Screen>
    );
  }

  const saveLink = (url: string, title: string | null, thenLink: boolean) =>
    run(async () => {
      const saved = await createEntity(
        await getDb(),
        'SAVED_LINK',
        trip.id,
        completeEntity('SAVED_LINK', { url, title }) as Omit<SyncEntityMap['SAVED_LINK'], 'id' | 'tripId'>
      );
      if (thenLink) {
        // Queue the picker to open over whatever screen we land on.
        setTimeout(
          () =>
            router.push({
              pathname: '/link-picker',
              params: { tripId: String(trip.id), sourceType: 'SAVED_LINK', sourceId: String(saved.id) },
            }),
          300
        );
      }
    });

  const savePlace = (asActivity: boolean) =>
    run(async () => {
      if (content.type !== 'place') return;
      const db = await getDb();
      await db.transaction(async (tx) => {
        const place = await createEntity(
          tx,
          'LOCATION',
          trip.id,
          completeEntity('LOCATION', {
            name: content.name ?? 'Shared place',
            latitude: content.latitude,
            longitude: content.longitude,
            notes: content.url,
          }) as Omit<SyncEntityMap['LOCATION'], 'id' | 'tripId'>
        );
        if (asActivity) {
          await createEntity(
            tx,
            'ACTIVITY',
            trip.id,
            completeEntity('ACTIVITY', {
              name: content.name ?? 'Visit',
              allDay: true,
            }) as Omit<SyncEntityMap['ACTIVITY'], 'id' | 'tripId'>,
            [{ targetType: 'LOCATION', targetId: place.id }]
          );
        }
      });
    });

  const uploadPdf = () =>
    run(async () => {
      if (content.type !== 'pdf') return;
      // Parsing needs the server (and its LLM); there is no offline fallback.
      await api.request('/pdf-imports/upload', {
        method: 'POST',
        body: { tripId: trip.id },
        upload: {
          uri: content.uri,
          name: content.name ?? 'booking.pdf',
          type: 'application/pdf',
          fieldName: 'file',
        },
      });
    });

  const savePhotos = () =>
    run(async () => {
      if (content.type !== 'images') return;
      const db = await getDb();
      const [locations, activities, lodging] = await Promise.all([
        listEntities(db, trip.id, 'LOCATION'),
        listEntities(db, trip.id, 'ACTIVITY'),
        listEntities(db, trip.id, 'LODGING'),
      ]);
      // Shared images carry no reliable time or place; link only by "happening now".
      const links: LinkSpec[] = suggestLinks('PHOTO', { locations, activities, lodging }, null).map((s) => ({
        targetType: s.targetType,
        targetId: s.targetId,
        relationship: s.relationship,
      }));
      for (const uri of content.uris) {
        const photo: Omit<SyncEntityMap['PHOTO'], 'id' | 'tripId'> = {
          source: 'local',
          mediaType: 'image',
          localPath: null,
          thumbnailPath: null,
          caption: null,
          latitude: null,
          longitude: null,
          takenAt: null,
          pendingUri: uri,
        };
        await createEntity(db, 'PHOTO', trip.id, photo, links);
      }
    });

  return (
    <Screen>
      <AppText muted>Saving to {trip.title}</AppText>
      {error ? <Banner text={error} tone="danger" /> : null}

      {content.type === 'url' ? (
        <Card>
          <AppText variant="heading" numberOfLines={2}>
            {content.title ?? content.url}
          </AppText>
          <AppText variant="caption" muted numberOfLines={2}>
            {content.url}
          </AppText>
          <Button label="Save link" loading={busy} onPress={() => void saveLink(content.url, content.title, false)} />
          <Button
            label="Save and link to…"
            variant="secondary"
            disabled={busy}
            onPress={() => void saveLink(content.url, content.title, true)}
          />
        </Card>
      ) : null}

      {content.type === 'place' ? (
        <Card>
          <AppText variant="heading">{content.name ?? 'Shared place'}</AppText>
          <AppText variant="caption" muted>
            {content.latitude !== null && content.longitude !== null
              ? `${content.latitude.toFixed(5)}, ${content.longitude.toFixed(5)}`
              : 'This link has no coordinates; the place is saved by name and can be pinned later.'}
          </AppText>
          <Button label="Add location + activity" loading={busy} onPress={() => void savePlace(true)} />
          <Button label="Save location only" variant="secondary" disabled={busy} onPress={() => void savePlace(false)} />
          <Button
            label="Save as link"
            variant="ghost"
            disabled={busy}
            onPress={() => void saveLink(content.url, content.name, false)}
          />
        </Card>
      ) : null}

      {content.type === 'pdf' ? (
        <Card>
          <AppText variant="heading">{content.name ?? 'Booking PDF'}</AppText>
          <AppText muted>
            Flights, stays and activities found in it appear in Trip → Review queue. Needs a connection.
          </AppText>
          <Button label="Upload for import" loading={busy} onPress={() => void uploadPdf()} />
        </Card>
      ) : null}

      {content.type === 'images' ? (
        <Card>
          <AppText variant="heading">
            {content.uris.length} photo{content.uris.length === 1 ? '' : 's'}
          </AppText>
          <Button label="Add to trip photos" loading={busy} onPress={() => void savePhotos()} />
        </Card>
      ) : null}

      {content.type === 'text' ? (
        <Card>
          <AppText numberOfLines={6}>{content.text}</AppText>
          <Button
            label="Save as journal note"
            loading={busy}
            onPress={() =>
              void run(async () => {
                await createEntity(
                  await getDb(),
                  'JOURNAL_ENTRY',
                  trip.id,
                  completeEntity('JOURNAL_ENTRY', {
                    title: 'Shared note',
                    content: content.text,
                    date: dayKeyInTimezone(new Date(), resolveTimezone(trip.timezone, userTimezone)),
                  }) as Omit<SyncEntityMap['JOURNAL_ENTRY'], 'id' | 'tripId'>
                );
              })
            }
          />
        </Card>
      ) : null}

      <Button label="Cancel" variant="ghost" onPress={close} />
    </Screen>
  );
}
